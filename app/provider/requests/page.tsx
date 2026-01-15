"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type RoadsideRequest = {
id: string;
status?: string;
issueType?: string;
createdAt?: any;
};

export default function ProviderRequestsPage() {
const [requests, setRequests] = useState<RoadsideRequest[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
async function loadRequests() {
setError(null);
setLoading(true);
try {
// show newest first (if createdAt exists)
const ref = collection(db, "roadsideRequests");
const q = query(ref, orderBy("createdAt", "desc"));
const snap = await getDocs(q);

const data = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
})) as RoadsideRequest[];

setRequests(data);
} catch (e: any) {
// If orderBy fails because some docs have no createdAt, fallback:
try {
const snap = await getDocs(collection(db, "roadsideRequests"));
const data = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
})) as RoadsideRequest[];
setRequests(data);
} catch (e2: any) {
setError(e2?.message ?? "Failed to load requests.");
}
} finally {
setLoading(false);
}
}

loadRequests();
}, []);

if (loading) return <p style={{ padding: 20 }}>Loading requests…</p>;

return (
<div style={{ padding: 20, maxWidth: 900 }}>
<h1 style={{ marginBottom: 12 }}>Open Roadside Requests</h1>

{error ? <p style={{ color: "red" }}>{error}</p> : null}
{requests.length === 0 ? <p>No requests found</p> : null}

<div style={{ display: "grid", gap: 12 }}>
{requests.map((req) => (
<div
key={req.id}
style={{
border: "1px solid #ddd",
borderRadius: 12,
padding: 14,
background: "white",
}}
>
<div style={{ fontWeight: 800 }}>ID: {req.id}</div>
<div>
<b>Status:</b> {req.status ?? "unknown"}
</div>
{req.issueType ? (
<div>
<b>Issue:</b> {req.issueType}
</div>
) : null}

<div style={{ marginTop: 10 }}>
<Link href={`/provider/requests/${req.id}`} style={{ textDecoration: "none" }}>
<button
style={{
padding: "10px 14px",
borderRadius: 10,
border: "1px solid #ccc",
background: "black",
color: "white",
fontWeight: 800,
cursor: "pointer",
}}
>
Place Bid
</button>
</Link>
</div>
</div>
))}
</div>
</div>
);
}