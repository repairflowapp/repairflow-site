import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const patchCustomerUid = functions.https.onRequest(async (req, res) => {
try {
// Optional safety: require a secret key to run
const key = req.query.key as string | undefined;
if (!key || key !== process.env.PATCH_KEY) {
res.status(403).send("Forbidden");
return;
}

const snap = await db.collection("roadsideRequests").get();

let updated = 0;
let skipped = 0;

let batch = db.batch();
let batchCount = 0;

for (const doc of snap.docs) {
const data = doc.data() as any;

const createdByUid = data.createdByUid;
const customerUid = data.customerUid;

// Only patch docs that are missing customerUid but have createdByUid
if (!customerUid && createdByUid) {
batch.update(doc.ref, { customerUid: createdByUid });
updated++;
batchCount++;

// Firestore batch limit is 500
if (batchCount === 450) {
await batch.commit();
batch = db.batch();
batchCount = 0;
}
} else {
skipped++;
}
}

if (batchCount > 0) await batch.commit();

res.status(200).json({ ok: true, updated, skipped, total: snap.size });
} catch (e: any) {
res.status(500).json({ ok: false, error: e?.message || String(e) });
}
});

