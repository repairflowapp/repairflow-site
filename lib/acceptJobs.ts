import { db } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

export async function acceptJob(requestId: string, providerUid: string) {
  const ref = doc(db, "roadsideRequests", requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found.");

    const data = snap.data() as any;

    // Only allow accepting if still open
    if (data.status !== "open" || data.assignedToUid) {
      throw new Error("This request has already been accepted.");
    }

    tx.update(ref, {
      status: "assigned",
      assignedToUid: providerUid,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
