"use client";

import { doc, setDoc } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { auth, db, getMessagingIfSupported } from "../firebase";

export async function registerPushNotifications() {
const user = auth.currentUser;
if (!user) throw new Error("Not logged in");

// Ask browser permission
const permission = await Notification.requestPermission();
if (permission !== "granted") return;

// Only works on supported browsers + HTTPS/localhost
const messaging = await getMessagingIfSupported();
if (!messaging) return;

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
if (!vapidKey) {
throw new Error("Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY");
}

const token = await getToken(messaging, { vapidKey });
if (!token) return;

// Save token to user doc
await setDoc(
doc(db, "users", user.uid),
{
fcmToken: token,
fcmUpdatedAt: new Date(),
},
{ merge: true }
);
}