/* eslint-disable no-console */
const admin = require("firebase-admin");

admin.initializeApp({
credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function run() {
const snap = await db.collection("roadsideRequests").get();

let updated = 0;
let skipped = 0;

const batchSize = 400;
let batch = db.batch();
let ops = 0;

for (const doc of snap.docs) {
const data = doc.data();

const hasCustomerUid = typeof data.customerUid === "string" && data.customerUid.length > 0;
const createdByUid = typeof data.createdByUid === "string" ? data.createdByUid : null;

if (hasCustomerUid || !createdByUid) {
skipped++;
continue;
}

batch.update(doc.ref, {
customerUid: createdByUid,
updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

updated++;
ops++;

if (ops >= batchSize) {
await batch.commit();
batch = db.batch();
ops = 0;
console.log(`Committed batch… total updated so far: ${updated}`);
}
}

if (ops > 0) {
await batch.commit();
}

console.log("DONE");
console.log({ updated, skipped, total: snap.size });
}

run().catch((e) => {
console.error(e);
process.exit(1);
});

