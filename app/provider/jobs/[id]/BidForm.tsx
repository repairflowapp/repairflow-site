"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function BidForm({ jobId }: { jobId: string }) {
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
message: message || "",
createdAt: serverTimestamp(),
});

setAmount("");
setEta("");
setMessage("");
alert("Bid submitted.");
} catch (e: any) {
alert(e?.message ?? "Failed to submit bid");
console.error(e);
} finally {
setLoading(false);
}
};

return (
<div className="border rounded p-4 space-y-3">
<h2 className="text-lg font-semibold">Submit Bid</h2>

<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
<input
className="border rounded px-3 py-2"
placeholder="Bid Amount ($)"
value={amount}
onChange={(e) => setAmount(e.target.value)}
/>
<input
className="border rounded px-3 py-2"
placeholder="ETA (minutes)"
value={eta}
onChange={(e) => setEta(e.target.value)}
/>
</div>

<textarea
className="border rounded px-3 py-2 w-full"
placeholder="Message (optional)"
value={message}
onChange={(e) => setMessage(e.target.value)}
/>

<button
onClick={submitBid}
disabled={loading}
className="w-full bg-black text-white rounded py-2 disabled:opacity-60"
>
    <button className="text-sm underline" onClick={() => router.back()}>
← Back
</button>

{loading ? "Submitting..." : "Submit Bid"}
</button>
</div>
);
}
