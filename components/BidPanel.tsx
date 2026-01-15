"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
doc,
getDoc,
serverTimestamp,
setDoc,
updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type RoadsideRequest = {
id: string;
status?: string;
issueType?: string;
notes?: string;
addressFormatted?: string;
addressText?: string;
locationText?: string;

providerId?: string | null;
acceptedBidId?: string | null;
};

export default function BidPanel({
jobId,
job,
}: {
jobId: string;
job: RoadsideRequest;
}) {
const [uid, setUid] = useState<string | null>(null);

const [price, setPrice] = useState("");
const [message, setMessage] = useState("");

const [hasBid, setHasBid] = useState(false);
const [loading, setLoading] = useState(true);

const canBid = useMemo(() => {
// You can bid if job is open/bidding and not assigned to someone else
const st = job.status || "";
return (st === "open" || st === "bidding") && !job.providerId;
}, [job.status, job.providerId]);

useEffect(() => {
return onAuthStateChanged(auth, (u) => {
if (u) setUid(u.uid);
});
}, []);

// check existing bid
useEffect(() => {
if (!uid || !jobId) return;

(async () => {
setLoading(true);
try {
const bidSnap = await getDoc(doc(db, "roadsideRequests", jobId, "bids", uid));
setHasBid(bidSnap.exists());
} finally {
setLoading(false);
}
})();
}, [uid, jobId]);

async function submitBid() {
if (!uid) return;
const p = price.trim();
if (!p) {
alert("Enter a bid price.");
return;
}

// Create/Update bid doc
await setDoc(
doc(db, "roadsideRequests", jobId, "bids", uid),
{
providerUid: uid,
price: Number(p),
message: message.trim() || "",
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

// Ensure job is in bidding state (optional)
if (job.status === "open") {
await updateDoc(doc(db, "roadsideRequests", jobId), {
status: "bidding",
updatedAt: serverTimestamp(),
});
}

// Denormalize into providerBids so “My Bids” tab can load fast
await setDoc(
doc(db, "providerBids", uid, "jobs", jobId),
{
jobId,
jobStatus: job.status || "bidding",
issueType: job.issueType || null,
notes: job.notes || null,
addressFormatted: job.addressFormatted || null,
addressText: job.addressText || null,
locationText: job.locationText || null,
providerId: job.providerId || null,
acceptedBidId: job.acceptedBidId || null,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

setHasBid(true);
alert("Bid submitted.");
}

return (
<div className="border rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Bidding</div>

{loading ? (
<div className="mt-2 text-sm text-gray-600">Checking bid…</div>
) : job.providerId ? (
<div className="mt-2 text-sm text-gray-600">
This job is already assigned to a provider.
</div>
) : !canBid ? (
<div className="mt-2 text-sm text-gray-600">
Bidding is not available for this status.
</div>
) : (
<>
{hasBid ? (
<div className="mt-2 text-sm text-gray-700">
✅ You already placed a bid. You can update it below.
</div>
) : (
<div className="mt-2 text-sm text-gray-700">
Place a bid to unlock chat and compete for this job.
</div>
)}

<div className="mt-4 grid md:grid-cols-2 gap-3">
<input
value={price}
onChange={(e) => setPrice(e.target.value)}
placeholder="Bid price (number)"
className="border rounded-lg px-3 py-2"
/>
<input
value={message}
onChange={(e) => setMessage(e.target.value)}
placeholder="Message (optional)"
className="border rounded-lg px-3 py-2"
/>
</div>

<button
className="mt-4 w-full border rounded-lg py-3 hover:bg-gray-50"
onClick={submitBid}
>
{hasBid ? "Update Bid" : "Submit Bid"}
</button>
</>
)}
</div>
);
}

