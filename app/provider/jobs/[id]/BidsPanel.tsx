"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Bid = {
id: string;
providerId: string;
amount: number;
etaMinutes: number;
message?: string;
createdAt?: any;
};

export default function BidsPanel({ jobId }: { jobId: string }) {
const [bids, setBids] = useState<Bid[]>([]);
const [error, setError] = useState<string>("");

useEffect(() => {
setError("");

const q = query(
collection(db, "roadsideRequests", jobId, "bids"),
orderBy("createdAt", "desc")
);

const unsub = onSnapshot(
q,
(snap) => {
const rows: Bid[] = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
}));
setBids(rows);
},
(err) => {
console.error(err);
setError(err?.message ?? "Failed to load bids");
}
);

return () => unsub();
}, [jobId]);

return (
<div className="border rounded p-4 space-y-3">
<h2 className="text-lg font-semibold">Bids</h2>

{error ? (
<div className="text-red-600 text-sm">{error}</div>
) : bids.length === 0 ? (
<div className="text-sm text-gray-600">No bids yet.</div>
) : (
<div className="space-y-2">
{bids.map((b) => (
<div key={b.id} className="border rounded p-3">
<div className="font-semibold">${b.amount} — {b.etaMinutes} min</div>
{b.message ? <div className="text-sm text-gray-700">{b.message}</div> : null}
<div className="text-xs text-gray-500">provider: {b.providerId}</div>
</div>
))}
</div>
)}
</div>
);
}
