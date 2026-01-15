import * as admin from "firebase-admin";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as crypto from "crypto";

// Initialize once for the whole functions bundle (guarded)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Existing function you had before (push test)
 */

// Firestore trigger export
export { notifyOnRequestStatus } from "./notifyOnRequestStatus";

/* =========================================================
Option A (Ghost Customer Jobs): Claim Token + Claim Job
- createClaimToken(jobId): dispatcher/provider creates token (returns raw token)
- claimRoadsideRequest(jobId, token): customer claims job after sign-in
========================================================= */

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url"); // url-safe
}

function assertAuth(request: any) {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in required.");
  return authUid as string;
}

async function getUser(uid: string) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  return snap.exists ? (snap.data() as any) : null;
}

/**
 * Allow:
 * - global dispatcher/manager/admin
 * - provider owner for the provider on the job
 * - employee dispatcher/manager under that provider
 */
async function requireDispatchOrProviderForJob(callerUid: string, job: any) {
  const user = await getUser(callerUid);
  const role = String(user?.role || "");
  const callerProviderUid = user?.providerUid || null;

  // Global dispatch roles
  if (["dispatcher", "manager", "admin"].includes(role)) return;

  // Provider owner allowed IF they belong to the job's provider
  // Job may use providerId (recommended) or providerUid (legacy)
  const jobProviderId = job?.providerId || job?.providerUid || null;

  if (role === "provider") {
    const providerId = callerProviderUid || callerUid; // provider users sometimes use own uid
    if (jobProviderId && jobProviderId === providerId) return;
    throw new HttpsError("permission-denied", "Not allowed for this provider job.");
  }

  // Employee dispatcher/manager allowed IF they are under the provider for this job
  if (role === "employee") {
    if (!jobProviderId) {
      throw new HttpsError("failed-precondition", "Job has no providerId.");
    }

    const empRef = admin
      .firestore()
      .doc(`providers/${jobProviderId}/employees/${callerUid}`);
    const empSnap = await empRef.get();
    const empRole = String(empSnap.data()?.role || "");

    if (["dispatcher", "manager"].includes(empRole)) return;

    throw new HttpsError("permission-denied", "Dispatcher employee role required.");
  }

  throw new HttpsError("permission-denied", "Dispatcher/provider role required.");
}

// Dispatcher/provider creates claim token for a ghost/unclaimed job
export const createClaimToken = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuth(request);

  const { jobId, ttlMinutes } = request.data || {};
  if (!jobId || typeof jobId !== "string") {
    throw new HttpsError("invalid-argument", "jobId is required.");
  }

  const minutes = typeof ttlMinutes === "number" ? ttlMinutes : 60;
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + minutes * 60 * 1000)
  );

  const jobRef = admin.firestore().doc(`roadsideRequests/${jobId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) throw new HttpsError("not-found", "Job not found.");

  const job = jobSnap.data()!;

  // ✅ Permission check now supports provider + employee dispatcher
  await requireDispatchOrProviderForJob(uid, job);

  if (job.customerUid) {
    throw new HttpsError("failed-precondition", "Job already has a customerUid.");
  }

  const token = randomToken();
  const tokenHash = sha256(token);

  await jobRef.update({
    claimTokenHash: tokenHash,
    claimExpiresAt: expiresAt,
    claimStatus: "unclaimed",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { token, expiresAt: expiresAt.toDate().toISOString() };
});

// Customer claims the job after sign-in using the token they received
export const claimRoadsideRequest = onCall({ region: "us-central1" }, async (request) => {
  const customerUid = assertAuth(request);

  const { jobId, token } = request.data || {};
  if (!jobId || typeof jobId !== "string") {
    throw new HttpsError("invalid-argument", "jobId is required.");
  }
  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "token is required.");
  }

  const jobRef = admin.firestore().doc(`roadsideRequests/${jobId}`);

  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new HttpsError("not-found", "Job not found.");

    const job = snap.data()!;
    if (job.customerUid) {
      // idempotent: if already claimed by same user, return ok
      if (job.customerUid === customerUid) return;
      throw new HttpsError("already-exists", "Job already claimed by another user.");
    }

    const expiresAt = job.claimExpiresAt?.toDate?.();
    if (!job.claimTokenHash || !expiresAt) {
      throw new HttpsError("failed-precondition", "No active claim token.");
    }
    if (Date.now() > expiresAt.getTime()) {
      throw new HttpsError("deadline-exceeded", "Claim token expired.");
    }

    if (sha256(token) !== job.claimTokenHash) {
      throw new HttpsError("permission-denied", "Invalid claim token.");
    }

    tx.update(jobRef, {
      customerUid,
      claimStatus: "claimed",
      claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimTokenHash: null,
      claimExpiresAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

/* =========================================================
Existing HTTPS function: sendTestPush
========================================================= */

export const sendTestPush = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    const uid = String(req.query.uid || "").trim();
    if (!uid) {
      res.status(400).send("Missing ?uid=YOUR_UID");
      return;
    }

    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const data = userDoc.data();
    const token = data?.fcmToken;

    if (!token) {
      res.status(400).send("User has no fcmToken saved");
      return;
    }

    const message = {
      token,
      notification: {
        title: "Test Push ✅",
        body: "If you see this, web push is working!",
      },
      data: { type: "test" },
    };

    const result = await admin.messaging().send(message);
    logger.info("Push sent", { uid, result });

    res.status(200).send(`Push sent: ${result}`);
    return;
  } catch (err: any) {
    logger.error("sendTestPush failed", err);
    res.status(500).send(err?.message || String(err));
    return;
  }
});

// Exports
export * from "./sms";
export * from "./employees";
