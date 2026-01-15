"use client";

import { useEffect, useState } from "react";
import {
collection,
doc,
getDocs,
onSnapshot,
orderBy,
query,
updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Bid = {
id: string;
providerId: string;
providerName?: string;
amount: number;
etaMinutes?: number;
message?: string;
status: "submitted" | "accepted" | "rejected";
createdAt?: any;
};

export default function BidsPanel({
jobId,
role = "customer",
}: {
jobId: string;
role?: "customer";
}) {
const [bids, setBids] = useState<Bid[]>([]);
const [acceptingId, setAcceptingId] = useState<string | null>(null);

useEffect(() => {
const bidsRef = collection(db, "jobs", jobId, "bids");
const q = query(bidsRef, orderBy("createdAt", "desc"));
return onSnapshot(q, (snap) => {
const rows: Bid[] = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
}));
setBids(rows);
});
}, [jobId]);

async function acceptBid(bidId: string, providerId: string) {
setAcceptingId(bidId);

const jobRef = doc(db, "jobs", jobId);
const chosenBidRef = doc(db, "jobs", jobId, "bids", bidId);

// 1) accept chosen bid
await updateDoc(chosenBidRef, { status: "accepted" });

// 2) reject all other bids
const bidsSnap = await getDocs(collection(db, "jobs", jobId, "bids"));
await Promise.all(
bidsSnap.docs
.filter((d) => d.id !== bidId)
.map((d) => updateDoc(d.ref, { status: "rejected" }))
);

// 3) mark job assigned
await updateDoc(jobRef, {
status: "assigned",
assignedProviderId: providerId,
assignedBidId: bidId,
});

setAcceptingId(null);
}

return (
<div style={{ marginTop: 24, border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
<h3 style={{ marginBottom: 12 }}>Bids</h3>

{bids.length === 0 ? (
<p style={{ opacity: 0.8 }}>No bids yet.</p>
) : (
<div style={{ display: "grid", gap: 10 }}>
{bids.map((b) => (
<div
key={b.id}
style={{
border: "1px solid #eee",
borderRadius: 10,
padding: 12,
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: 12,
}}
>
<div>
<div style={{ fontWeight: 700 }}>
${b.amount}{" "}
<span style={{ fontWeight: 400, opacity: 0.8 }}>
{b.etaMinutes ? `· ETA ${b.etaMinutes}m` : ""}
</span>
</div>
<div style={{ fontSize: 13, opacity: 0.85 }}>
{b.providerName || b.providerId}
</div>
{b.message ? <div style={{ marginTop: 6 }}>{b.message}</div> : null}
<div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
Status: {b.status}
</div>
</div>

{role === "customer" && b.status === "submitted" ? (
<button
disabled={acceptingId === b.id}
onClick={() => acceptBid(b.id, b.providerId)}
style={{
padding: "10px 12px",
borderRadius: 10,
border: "1px solid #111",
background: "#111",
color: "#fff",
cursor: "pointer",
whiteSpace: "nowrap",
opacity: acceptingId === b.id ? 0.7 : 1,
}}
>
{acceptingId === b.id ? "Accepting…" : "Accept Bid"}
</button>
) : null}
</div>
))}
</div>
)}

<p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
Accepting a bid assigns the job and rejects all other bids.
</p>
</div>
);
}
