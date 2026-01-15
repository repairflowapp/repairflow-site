// lib/firebaseAdmin.ts
import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
// Don’t throw at build-time if envs missing; only throw when actually used.
console.warn("Missing Firebase Admin env vars. early-access endpoint will fail until configured.");
}

if (!admin.apps.length) {
admin.initializeApp({
credential: admin.credential.cert({
projectId: projectId!,
clientEmail: clientEmail!,
privateKey: privateKey!,
}),
});
}

export const adminDb = admin.firestore();

