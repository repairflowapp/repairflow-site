"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type BidIndexRow = {
id: string; // doc id in providerBids/{uid}/jobs/{jobId}
jobId: string;
providerId: string;

status?: string | null; // pending | countered | accepted | declined | selected ...
lastActionAt?: any;
createdAt?: any;
updatedAt?: any;
};

type RoadsideRequest = {
status?: string;
issueType?: string;
locationText?: string;
pickupAddress?: string | null;
dropoffAddress?: string | null;
notes?: string | null;
isEmergency?: boolean;
emergency?: boolean;
createdAt?: any;
updatedAt?: any;
providerId?: string | null;
};

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function when(ts: any) {
if (!ts?.toDate) return "—";
try {
return ts.toDate().toLocaleString();
} catch {
return "—";
}
}

function pillForStatus(status?: string | null) {
const s = (status || "").toLowerCase();
if (s === "accepted") return "bg-green-50 border-green-200 text-green-800";
if (s === "rejected") return "bg-red-50 border-red-200 text-red-800";
if (s === "declined") return "bg-red-50 border-red-200 text-red-800";
if (s === "countered") return "bg-amber-50 border-amber-200 text-amber-800";
if (s === "selected") return "bg-amber-50 border-amber-200 text-amber-800";
if (s === "canceled" || s === "cancelled") return "bg-gray-50 border-gray-200 text-gray-700";
return "bg-gray-50 border-gray-200 text-gray-700";
}

export default function ProviderMyBidsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

const [rows, setRows] = useState<BidIndexRow[]>([]);
const [error, setError] = useState<string | null>(null);

const [jobCache, setJobCache] = useState<Record<string, RoadsideRequest | null>>({});

// auth
useEffect(() => {
const unsub = onAuthStateChanged(auth, (user) => {
if (!user) {
router.push("/auth/sign-in");
return;
}
setUid(user.uid);
setLoading(false);
});
return () => unsub();
}, [router]);

// subscribe to provider's bid index: providerBids/{uid}/jobs/{jobId}
useEffect(() => {
if (!uid) return;

setError(null);

const qRef = query(collection(db, "providerBids", uid, "jobs"), orderBy("updatedAt", "desc"), limit(100));

const unsub = onSnapshot(
qRef,
(snap) => {
const list = snap.docs.map((d) => {
const data = d.data() as any;
const jobId = (data?.jobId as string) || d.id;
const createdAt = data?.createdAt ?? null;
const updatedAt = data?.updatedAt ?? null;
const status = (data?.status as string) ?? null;
const lastActionAt = data?.lastActionAt ?? updatedAt ?? createdAt;

return {
id: d.id,
jobId,
providerId: uid,
createdAt,
updatedAt,
status,
lastActionAt,
} as BidIndexRow;
});

setRows(list);
},
(e) => setError(e?.message ?? "Failed to load bids.")
);

return () => unsub();
}, [uid]);

// hydrate job docs (best effort)
useEffect(() => {
let cancelled = false;

async function hydrate() {
const ids = rows.map((r) => r.jobId).filter(Boolean);
const missing = ids.filter((id) => !(id in jobCache));
if (missing.length === 0) return;

const updates: Record<string, RoadsideRequest | null> = {};
for (const jobId of missing.slice(0, 25)) {
try {
const snap = await getDoc(doc(db, "roadsideRequests", jobId));
updates[jobId] = snap.exists() ? (snap.data() as any) : null;
} catch {
updates[jobId] = null;
}
}

if (!cancelled) setJobCache((prev) => ({ ...prev, ...updates }));
}

hydrate();
return () => {
cancelled = true;
};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [rows]);

const sorted = useMemo(() => {
return [...rows].sort((a, b) => {
const at = a.lastActionAt?.toMillis?.() ?? 0;
const bt = b.lastActionAt?.toMillis?.() ?? 0;
return bt - at;
});
}, [rows]);

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto">
<div className="flex items-start justify-between gap-4">
<div>
<h1 className="text-3xl font-bold text-gray-900">My Bids</h1>
<p className="text-sm text-gray-600 mt-1">
Jobs you’ve bid on. Notifications will bring you here until a bid is accepted (then it moves to Active Jobs).
</p>
</div>

<div className="flex gap-2">
<button
onClick={() => router.push("/provider/jobs/active")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Active Jobs
</button>
<button
onClick={() => router.push("/provider/jobs/available")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Available
</button>
</div>
</div>

{error && (
<p className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error}</p>
)}

<div className="mt-6 space-y-3">
{sorted.length === 0 ? (
<div className="border border-gray-200 rounded-2xl p-8 text-gray-700">
No bids yet. Go to <b>Available</b> to bid on jobs.
</div>
) : (
sorted.map((r) => {
const job = jobCache[r.jobId];
const status = r.status ?? (job?.status ?? null);

const title = job?.issueType ? titleCase(job.issueType) : "Roadside Job";
const pickup = job?.pickupAddress || job?.locationText || "—";
const dropoff = job?.dropoffAddress || "—";
const emergency = !!(job?.isEmergency ?? job?.emergency);

return (
<div key={r.jobId} className="border border-gray-200 rounded-2xl p-4">
<div className="flex items-start justify-between gap-4">
<div>
<div className="flex items-center gap-2">
<div className="font-semibold text-gray-900">{title}</div>

{emergency ? (
<span className="text-xs font-semibold px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
EMERGENCY
</span>
) : null}

<span className={`text-xs font-semibold px-2 py-1 rounded-full border ${pillForStatus(status)}`}>
{status ? titleCase(String(status)) : "Pending"}
</span>
</div>

<div className="text-xs text-gray-500 mt-1">
Job ID: <span className="font-mono">{r.jobId}</span> • Last update:{" "}
{when(r.lastActionAt || r.updatedAt || r.createdAt)}
</div>

<div className="mt-3 text-sm text-gray-700">
<div>
<b>Location:</b> {pickup}
</div>
{dropoff !== "—" ? (
<div className="mt-1">
<b>Dropoff:</b> {dropoff}
</div>
) : null}
{job?.notes ? (
<div className="mt-1">
<b>Notes:</b> {job.notes}
</div>
) : null}
</div>
</div>

<div className="flex flex-col gap-2 min-w-[170px]">
<Link
href={`/provider/jobs/bids/${encodeURIComponent(r.jobId)}`}
className="text-center bg-black text-white rounded-lg py-2 text-sm font-medium hover:opacity-90"
>
Open Bid
</Link>

<button
onClick={() => router.push("/provider/notifications")}
className="border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50"
>
Notifications
</button>
</div>
</div>
</div>
);
})
)}
</div>

<div className="mt-6">
<button
onClick={() => router.push("/dashboard/provider")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Dashboard
</button>
</div>
</div>
</main>
);
}
