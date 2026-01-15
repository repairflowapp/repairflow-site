import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

type CreateEmployeePayload = {
providerId: string;
email: string;
name?: string | null;
phone?: string | null;
employeeRole?: string | null; // "tech" | "dispatcher" etc.
};

function requireAuth(req: any) {
if (!req.auth?.uid) {
throw new HttpsError("unauthenticated", "You must be signed in.");
}
return req.auth.uid as string;
}

async function getUserRole(uid: string): Promise<string | null> {
const snap = await admin.firestore().collection("users").doc(uid).get();
if (!snap.exists) return null;
const data = snap.data() as any;
return (data?.role ?? null) as string | null;
}

// Treat anything NOT customer/employee as provider-ish.
function isProviderLike(role: string | null) {
if (!role) return false;
const r = role.toLowerCase();
if (r === "employee") return false;
if (r === "driver" || r === "fleet" || r === "customer") return false;
return true;
}

function makeTempPassword() {
const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
let out = "";
for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
return out;
}

/**
* Callable:
* ({ providerId, email, name, phone, employeeRole })
*
* Creates:
* - Firebase Auth user (temp password)
* - users/{employeeUid} role:"employee", providerId, ...
* - providers/{providerId}/employees/{employeeUid} active:true, ...
*
* Returns: { employeeUid, tempPassword }
*/
export const createEmployeeUser = onCall({ region: "us-central1" }, async (req) => {
try {
const callerUid = requireAuth(req);

const payload = (req.data || {}) as CreateEmployeePayload;

const providerId = String(payload.providerId || "").trim();
const email = String(payload.email || "").trim().toLowerCase();
const name = String(payload.name || "").trim();
const phone = String(payload.phone || "").trim();
const employeeRole = String(payload.employeeRole || "tech").trim() || "tech";

if (!providerId) throw new HttpsError("invalid-argument", "Missing providerId.");
if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "Valid email required.");

// Provider can ONLY create employees under their own account
if (callerUid !== providerId) {
throw new HttpsError(
"permission-denied",
"You can only create employees under your own provider account."
);
}

const callerRole = await getUserRole(callerUid);
if (!isProviderLike(callerRole)) {
throw new HttpsError(
"permission-denied",
`Only providers can create employees. Your current role is: ${callerRole ?? "missing"}`
);
}

// Block if email already exists
try {
const existing = await admin.auth().getUserByEmail(email);
if (existing?.uid) {
throw new HttpsError("already-exists", "A user with this email already exists.");
}
} catch (e: any) {
// If getUserByEmail throws "user-not-found", we ignore.
// If it was our "already-exists" HttpsError above, rethrow.
if (e instanceof HttpsError) throw e;
}

const tempPassword = makeTempPassword();

const userRecord = await admin.auth().createUser({
email,
password: tempPassword,
displayName: name || undefined,
});

const employeeUid = userRecord.uid;

// Optional claims
await admin.auth().setCustomUserClaims(employeeUid, {
role: "employee",
providerId,
});

const now = admin.firestore.FieldValue.serverTimestamp();

// users/{employeeUid}
await admin.firestore().collection("users").doc(employeeUid).set(
{
role: "employee",
providerId,
providerUid: providerId,
email,
name: name || null,
phone: phone || null,
createdAt: now,
updatedAt: now,
},
{ merge: true }
);

// providers/{providerId}/employees/{employeeUid}
await admin.firestore()
.collection("providers")
.doc(providerId)
.collection("employees")
.doc(employeeUid)
.set(
{
active: true,
pending: false,
userId: employeeUid,
email,
name: name || null,
phone: phone || null,
role: employeeRole,
createdAt: now,
updatedAt: now,
},
{ merge: true }
);

logger.info("Employee created", { providerId, employeeUid, email });

return { employeeUid, tempPassword };
} catch (err: any) {
logger.error("createEmployeeUser failed", err);
if (err instanceof HttpsError) throw err;
throw new HttpsError("internal", err?.message ? String(err.message) : "Unknown error");
}
});
