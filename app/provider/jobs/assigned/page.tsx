"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type JobStatus =
| "pending_provider_confirmation"
| "pending_customer_confirmation"
| "accepted"
| "assigned"
| "enroute"
| "on_site"
| "onsite"
| "in_progress"
| "completed"
| "canceled"
| "open"
| "bidding";

type RoadsideRequest = {
id: string;
providerId?: string | null;

issueType?: string;
pickupAddress?: string | null;
dropoffAddress?: string | null;
locationText?: string | null;
notes?: string | null;

status?: JobStatus;

assignedEmployeeUid?: string | null;
assignedToUid?: string | null;
assignedTo?: string | null;

assignedToName?: string | null;
assignedToPhone?: string | null;

providerAssignedToName?: string | null;
providerAssignedToPhone?: string | null;

updatedAt?: any;
createdAt?: any;
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

export default function AssignedJobsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [providerUid, setProviderUid] = useState<string | null>(null);

const [loading, setLoading] = useState(true);
const [items, setItems] = useState<RoadsideRequest[]>([]);
const [error, setError] = useState<string | null>(null);

// Auth + resolve providerUid for employee
useEffect(() => {
const unsub = onAuthStateChanged(auth, async (user) => {
if (!user) {
router.push("/auth/sign-in");
return;
}
setUid(user.uid);

try {
// users/{uid} contains providerUid for employees
const snap = await (await import("firebase/firestore")).getDoc(
(await import("firebase/firestore")).doc(db, "users", user.uid)
);
const data = snap.exists() ? (snap.data() as any) : null;
setProviderUid(String(data?.providerUid || ""));
} catch {
setProviderUid(null);
} finally {
setLoading(false);
}
});

return () => unsub();
}, [router]);

// Subscribe to provider jobs; filter client-side by assignment fields
useEffect(() => {
if (!providerUid) return;

setError(null);

const qRef = query(
collection(db, "roadsideRequests"),
where("providerId", "==", providerUid),
orderBy("updatedAt", "desc"),
limit(100)
);

const unsub = onSnapshot(
qRef,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RoadsideRequest[];
setItems(rows);
},
(e) => setError(e?.message ?? "Failed to load assigned jobs.")
);

return () => unsub();
}, [providerUid]);

// Only jobs assigned to THIS employee uid
const assignedToMe = useMemo(() => {
if (!uid) return [];
return items.filter((j) => {
const a = j.assignedEmployeeUid || j.assignedToUid || j.assignedTo || null;
return !!a && String(a) === String(uid);
});
}, [items, uid]);

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
<h1 className="text-3xl font-bold text-gray-900">Assigned Jobs</h1>
<p className="text-sm text-gray-600 mt-1">
Jobs assigned to you by your provider.
</p>
</div>

<div className="flex gap-2">
<button
onClick={() => router.push("/dashboard/employee")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Back
</button>
</div>
</div>

{error ? (
<p className="mt-4 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
{error}
</p>
) : null}

<div className="mt-6 space-y-4">
{assignedToMe.length === 0 ? (
<div className="border border-gray-200 rounded-2xl p-6 text-gray-700">
No assigned jobs yet.
</div>
) : (
assignedToMe.map((j) => {
const title = j.issueType ? titleCase(j.issueType) : "Job";
const pickup = j.pickupAddress || j.locationText || "—";
const dropoff = j.dropoffAddress || "—";
const status = j.status ? titleCase(j.status) : "—";

const whoName = j.assignedToName || j.providerAssignedToName || null;
const whoPhone = j.assignedToPhone || j.providerAssignedToPhone || null;

return (
<button
key={j.id}
type="button"
onClick={() => router.push(`/provider/jobs/${j.id}`)}
className="w-full text-left border border-gray-200 rounded-2xl p-5 hover:bg-gray-50"
>
<div className="flex items-start justify-between gap-4">
<div>
<div className="flex items-center gap-2">
<div className="text-lg font-semibold text-gray-900">{title}</div>
<span className="text-xs font-semibold px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700">
{status}
</span>
</div>

<div className="mt-2 text-sm text-gray-700 space-y-1">
<div>
<b>Pickup:</b> {pickup}
</div>
{dropoff !== "—" ? (
<div>
<b>Dropoff:</b> {dropoff}
</div>
) : null}
{j.notes ? (
<div className="text-gray-600">
<b>Notes:</b> {j.notes}
</div>
) : null}
{whoName || whoPhone ? (
<div className="text-gray-600">
<b>Assigned:</b> {whoName ?? ""} {whoPhone ? `(${whoPhone})` : ""}
</div>
) : null}
</div>

<div className="mt-3 text-xs text-gray-500">
Job ID: <span className="font-mono">{j.id}</span> • Updated:{" "}
{when(j.updatedAt || j.createdAt)}
</div>
</div>

<div className="shrink-0 text-sm font-semibold underline opacity-80">
Open →
</div>
</div>
</button>
);
})
)}
</div>
</div>
</main>
);
}

