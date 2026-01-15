import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as crypto from "crypto";
import * as https from "https";

/* =========================================================
Existing trigger: customer chat message created
========================================================= */

type ChatMessage = {
  text?: string | null;
  body?: string | null;
  toPhone?: string | null;
  fromPhone?: string | null;
  createdAt?: any;
};

export const onCustomerDispatchMessageCreated = onDocumentCreated(
  {
    region: "us-central1",
    document:
      "providers/{providerUid}/dispatchJobs/{jobId}/chats/customer/messages/{messageId}",
  },
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const providerUid = event.params.providerUid as string;
      const jobId = event.params.jobId as string;
      const messageId = event.params.messageId as string;

      const data = snap.data() as ChatMessage;
      const text = (data.text || data.body || "").toString().trim();

      logger.info("Customer message created", {
        providerUid,
        jobId,
        messageId,
        textPreview: text.slice(0, 140),
      });

      // If/when you want SMS for these messages:
      // - read provider/job to find a destination phone
      // - send via Vonage here
      // For now: log only
      return;
    } catch (err: any) {
      logger.error("onCustomerDispatchMessageCreated failed", err);
      return;
    }
  }
);

/* =========================================================
Callable: send claim link SMS (Option A) via Vonage
sendClaimSms({ toPhone, claimUrl, customerName?, jobId })
========================================================= */

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

  const jobProviderId = job?.providerId || job?.providerUid || null;

  // Provider owner allowed if matches the job provider
  if (role === "provider") {
    const providerId = callerProviderUid || callerUid;
    if (jobProviderId && jobProviderId === providerId) return;
    throw new HttpsError("permission-denied", "Not allowed for this provider job.");
  }

  // Employee dispatcher/manager under that provider
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

function normalizeUSPhone(input: string) {
  const raw = (input || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  // Vonage accepts E.164 digits. We'll send without plus to be safe.
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (raw.startsWith("+") && digits.length >= 10) return digits; // "+1..." => "1..."
  throw new HttpsError("invalid-argument", "Invalid US phone number.");
}

function getVonageConfig() {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const from = process.env.VONAGE_FROM; // brand name or long code

  if (!apiKey || !apiSecret || !from) {
    throw new HttpsError(
      "failed-precondition",
      "Vonage env vars missing. Set VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM."
    );
  }
  return { apiKey, apiSecret, from };
}

async function vonageSendSms(params: {
  apiKey: string;
  apiSecret: string;
  from: string;
  to: string;
  text: string;
}) {
  // Vonage SMS API: POST https://rest.nexmo.com/sms/json
  const payload = JSON.stringify({
    api_key: params.apiKey,
    api_secret: params.apiSecret,
    from: params.from,
    to: params.to,
    text: params.text,
  });

  const options: https.RequestOptions = {
    method: "POST",
    hostname: "rest.nexmo.com",
    path: "/sms/json",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const resBody = await new Promise<string>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  let parsed: any = null;
  try {
    parsed = JSON.parse(resBody);
  } catch {
    // ignore
  }

  return { raw: resBody, parsed };
}

export const sendClaimSms = onCall({ region: "us-central1" }, async (request) => {
  const uid = assertAuth(request);

  const { toPhone, claimUrl, customerName, jobId } = request.data || {};
  if (!toPhone || typeof toPhone !== "string") {
    throw new HttpsError("invalid-argument", "toPhone is required.");
  }
  if (!claimUrl || typeof claimUrl !== "string") {
    throw new HttpsError("invalid-argument", "claimUrl is required.");
  }
  if (!jobId || typeof jobId !== "string") {
    throw new HttpsError("invalid-argument", "jobId is required.");
  }

  // ✅ Verify caller belongs to this job (provider/dispatcher perms)
  const jobRef = admin.firestore().doc(`roadsideRequests/${jobId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) throw new HttpsError("not-found", "Job not found.");
  const job = jobSnap.data()!;
  await requireDispatchOrProviderForJob(uid, job);

  const { apiKey, apiSecret, from } = getVonageConfig();
  const to = normalizeUSPhone(toPhone);

  const name = typeof customerName === "string" ? customerName.trim() : "";
  const greeting = name ? `Hi ${name}, ` : "Hi, ";

  const text =
    `${greeting}your TruckRSA request is ready.\n` +
    `Tap to view & claim: ${claimUrl}\n\n` +
    `If you didn’t request this, ignore this message.` +
    (jobId ? `\nRef: ${jobId}` : "");

  const result = await vonageSendSms({ apiKey, apiSecret, from, to, text });

  const status = result.parsed?.messages?.[0]?.status;
  const messageId = result.parsed?.messages?.[0]?.["message-id"];
  const errorText = result.parsed?.messages?.[0]?.["error-text"];

  if (status !== "0") {
    logger.error("Vonage SMS failed", { to, status, errorText, raw: result.raw });
    throw new HttpsError("internal", `Vonage SMS failed: ${errorText || "unknown"}`);
  }

  logger.info("Claim SMS sent (Vonage)", { to, messageId, jobId });
  return { ok: true, messageId };
});
