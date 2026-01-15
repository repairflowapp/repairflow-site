// functions/src/notifyOnRequestStatus.ts

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

// Initialize admin once for the whole bundle
if (!getApps().length) initializeApp();

const db = getFirestore();

// Secrets
const VONAGE_API_KEY = defineSecret("VONAGE_API_KEY");
const VONAGE_API_SECRET = defineSecret("VONAGE_API_SECRET");
const VONAGE_FROM = defineSecret("VONAGE_FROM");
const APP_BASE_URL = defineSecret("APP_BASE_URL");

// ---------- helpers ----------

function titleCase(s: string) {
return (s || "")
.replace(/_/g, " ")
.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizePhone(p?: string | null) {
const s = String(p || "").trim();
if (!s) return "";
// Expect E.164 like +1916...
return s;
}

function normalizeStatus(raw?: any): string {
const s = String(raw ?? "").trim().toLowerCase();
if (!s) return "";
const x = s.replace(/\s+/g, "_");

if (x === "onsite" || x === "on-site" || x === "on_site") return "on_site";
if (x === "en_route" || x === "en-route" || x === "enroute") return "enroute";
if (x === "inprogress" || x === "in-progress" || x === "in_progress") return "in_progress";

return x;
}

function buildStatusMessage(statusNorm: string, reqId: string, data: any, baseUrl: string) {
const link = baseUrl ? `${baseUrl.replace(/\/$/, "")}/requests/${reqId}` : "";
const issue = titleCase(String(data?.issueType || "Request"));

const pickup = String(
data?.pickupAddress ||
data?.addressFormatted ||
data?.addressText ||
data?.locationText ||
""
).trim();

const pretty = titleCase(statusNorm);

const parts = [
`TruckRSA: ${issue} update`,
`Status: ${pretty}`,
pickup ? `Pickup: ${pickup}` : "",
link ? `View: ${link}` : "",
].filter(Boolean);

return parts.join("\n");
}

async function lookupCustomerPhone(data: any): Promise<string> {
const driverPhone = normalizePhone(data?.driverPhone);
if (driverPhone) return driverPhone;

const customerUid = String(data?.customerUid || data?.createdByUid || "").trim();
if (!customerUid) return "";

const snap = await db.doc(`users/${customerUid}`).get();
const phone = normalizePhone(snap.exists ? (snap.data() as any)?.phone : "");
return phone;
}

/**
* Send SMS via Vonage REST API (most stable)
* Returns { ok: boolean, messageId?: string, error?: string, raw?: any }
*/
async function sendVonageSms(opts: {
apiKey: string;
apiSecret: string;
to: string;
from: string;
text: string;
}) {
const body = new URLSearchParams({
api_key: opts.apiKey,
api_secret: opts.apiSecret,
to: opts.to,
from: opts.from,
text: opts.text,
});

const resp = await fetch("https://rest.nexmo.com/sms/json", {
method: "POST",
headers: { "Content-Type": "application/x-www-form-urlencoded" },
body,
});

const raw = await resp.json().catch(() => ({}));

// Vonage format: { messages: [ { status: "0"|"1"|..., "message-id": "...", "error-text": "..." } ] }
const msg = raw?.messages?.[0];
const status = String(msg?.status ?? "");
const ok = status === "0";

return {
ok,
messageId: msg?.["message-id"],
error: ok ? undefined : String(msg?.["error-text"] || msg?.["error_text"] || "Unknown Vonage error"),
raw,
httpStatus: resp.status,
};
}

// ---------- function ----------

export const notifyOnRequestStatus = onDocumentUpdated(
{
region: "us-central1",
document: "roadsideRequests/{requestId}",
secrets: [VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM, APP_BASE_URL],
},
async (event) => {
if (!event.data) return;

const before = event.data.before.data() || {};
const after = event.data.after.data() || {};
const requestId = String(event.params.requestId || "");

const beforeStatusNorm = normalizeStatus(before.status);
const afterStatusNorm = normalizeStatus(after.status);

// Only run when status actually changes
if (!afterStatusNorm || beforeStatusNorm === afterStatusNorm) return;

const notifyStatuses = new Set(["assigned", "enroute", "on_site", "in_progress", "completed"]);
if (!notifyStatuses.has(afterStatusNorm)) {
logger.info("Skipping status (not in notify list)", {
requestId,
rawAfterStatus: after.status,
afterStatusNorm,
});
return;
}

const lastNotifiedNorm = normalizeStatus(after.lastNotifiedStatus);
if (lastNotifiedNorm === afterStatusNorm) {
logger.info("Skipping (already notified)", { requestId, afterStatusNorm });
return;
}

const to = await lookupCustomerPhone(after);
if (!to) {
logger.warn("No customer/driver phone found; skipping SMS", { requestId });
return;
}

const apiKey = VONAGE_API_KEY.value();
const apiSecret = VONAGE_API_SECRET.value();
const from = VONAGE_FROM.value();
const baseUrl = APP_BASE_URL.value() || "";

if (!apiKey || !apiSecret || !from) {
logger.error("Missing Vonage secrets", {
hasKey: !!apiKey,
hasSecret: !!apiSecret,
hasFrom: !!from,
});
return;
}

const text = buildStatusMessage(afterStatusNorm, requestId, after, baseUrl);

logger.info("Attempting status SMS", {
requestId,
to,
from,
afterStatusNorm,
rawAfterStatus: after.status,
});

try {
const result = await sendVonageSms({ apiKey, apiSecret, to, from, text });

logger.info("Vonage response", {
requestId,
ok: result.ok,
httpStatus: result.httpStatus,
messageId: result.messageId,
error: result.error,
raw: result.raw,
});

if (!result.ok) {
// Don't mark notified if Vonage rejected it
return;
}

await event.data.after.ref.set(
{
lastNotifiedStatus: afterStatusNorm,
lastNotifiedAt: FieldValue.serverTimestamp(),
},
{ merge: true }
);

logger.info("Status SMS sent + marked notified", { requestId, afterStatusNorm, to });
} catch (e: any) {
logger.error("SMS send threw error", { requestId, message: e?.message, stack: e?.stack });
}
}
);

