"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function BidForm({ jobId }: { jobId: string }) {
const router = useRouter();

const [amount, setAmount] = useState("");
const [eta, setEta] = useState("");
const [message, setMessage] = useState("");
const [loading, setLoading] = useState(false);

const submitBid = async () => {
const user = auth.currentUser;
if (!user) {
alert("You must be signed in to submit a bid.");
return;
}

if (!amount || !eta) {
alert("Bid amount and ETA are required.");
return;
}

setLoading(true);
try {
await addDoc(collection(db, "roadsideRequests", jobId, "bids"), {
providerId: user.uid,
amount: Number(amount),
etaMinutes: Number(eta),
message: message.trim() || null,
createdAt: serverTimestamp(),
});

setAmount("");
setEta("");
setMessage("");
alert("Bid submitted.");

router.back();
} catch (e: any) {
alert(e?.message ?? "Failed to submit bid");
console.error(e);
} finally {
setLoading(false);
}
};

return (
<div className="border rounded p-4 space-y-4">
<div className="flex items-center justify-between">
<h2 className="text-lg font-semibold">Submit Bid</h2>

<button
className="text-sm underline"
onClick={() => router.back()}
type="button"
>
← Back
</button>
</div>

<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
<input
className="border rounded px-3 py-2"
placeholder="Bid Amount ($)"
value={amount}
onChange={(e) => setAmount(e.target.value)}
inputMode="numeric"
/>

<input
className="border rounded px-3 py-2"
placeholder="ETA (minutes)"
value={eta}
onChange={(e) => setEta(e.target.value)}
inputMode="numeric"
/>
</div>

<textarea
className="border rounded px-3 py-2 w-full"
placeholder="Message (optional)"
value={message}
onChange={(e) => setMessage(e.target.value)}
rows={3}
/>

<button
onClick={submitBid}
disabled={loading}
className="w-full bg-black text-white rounded py-2 font-medium disabled:opacity-60"
type="button"
>
{loading ? "Submitting…" : "Submit Bid"}
</button>
</div>
);
}

