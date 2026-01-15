import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

type NotificationType =
  | "request_assigned"
  | "job_enroute"
  | "job_started"
  | "job_completed"
  | "request_canceled";

export async function sendNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  requestId?: string;
  providerId?: string;
}) {
  await addDoc(collection(db, "notifications"), {
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    requestId: params.requestId ?? null,
    providerId: params.providerId ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}
