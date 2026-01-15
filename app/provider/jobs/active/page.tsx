"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import SignOutButton from "@/components/SignOutButton";

type JobStatus =
| "open"
| "bidding"
| "pending_provider_confirmation"
| "pending_customer_confirmation"
| "accepted"
| "assigned"
| "enroute"
| "in_progress"
| "on_site"
| "onsite"
| "completed"
| "canceled";

type RoadsideRequest = {
id: string;
providerId?: string | null;

issueType?: string;
pickupAddress?: string;
dropoffAddress?: string;
locationText?: string;
notes?: string;
isEmergency?: boolean;

status?: JobStatus;
createdAt?: any;
updatedAt?: any;

providerAssignedToName?: string | null;
providerAssignedToPhone?: string | null;
};

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatWhen(ts: any) {
if (!ts?.toDate) return "—";
try {
return ts.toDate().toLocaleString();
} catch {
return "—";
}
}

export default function ProviderActiveJobsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [items, setItems] = useState<RoadsideRequest[]>([]);
const [error, setError] = useState<string | null>(null);

const [tab, setTab] = useState<"active" | "completed">("active");

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

useEffect(() => {
if (!uid) return;

setError(null);

const qRef = query(
collection(db, "roadsideRequests"),
where("providerId", "==", uid),
orderBy("updatedAt", "desc"),
limit(100)
);

const unsub = onSnapshot(
qRef,
(snap) => {
const rows = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
})) as RoadsideRequest[];
setItems(rows);
setError(null);
},
(e) => setError(e?.message ?? "Failed to load provider jobs.")
);

return () => unsub();
}, [uid]);

// ✅ INCLUDE CONFIRMATION STATES so jobs appear immediately after customer accepts
const activeStatuses: JobStatus[] = useMemo(
() => [
"pending_provider_confirmation",
"pending_customer_confirmation",
"accepted",
"assigned",
"enroute",
"on_site",
"onsite",
"in_progress",
],
[]
);

const completedStatuses: JobStatus[] = useMemo(() => ["completed"], []);

const activeJobs = useMemo(
() => items.filter((j) => j.status && activeStatuses.includes(j.status)),
[items, activeStatuses]
);

const completedJobs = useMemo(
() => items.filter((j) => j.status && completedStatuses.includes(j.status)),
[items, completedStatuses]
);

const visible = tab === "active" ? activeJobs : completedJobs;

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-4xl border border-gray-200 rounded-2xl p-8">
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
<h1 className="text-3xl font-bold text-gray-900">My Jobs</h1>
<p className="text-sm text-gray-600 mt-1">These are jobs assigned to your provider account.</p>
</div>

<div className="flex gap-2">
<button
type="button"
onClick={() => router.push("/dashboard/provider")}
className="border border-gray-300 text-gray-900 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
<SignOutButton />
</div>
</div>

<div className="mt-4 flex gap-2">
<button
type="button"
onClick={() => setTab("active")}
className={`px-4 py-2 rounded-lg border font-medium ${
tab === "active" ? "bg-black text-white border-black" : "border-gray-300 hover:bg-gray-50"
}`}
>
Active
</button>

<button
type="button"
onClick={() => setTab("completed")}
className={`px-4 py-2 rounded-lg border font-medium ${
tab === "completed" ? "bg-black text-white border-black" : "border-gray-300 hover:bg-gray-50"
}`}
>
Completed
</button>

<button
type="button"
onClick={() => router.push("/provider/jobs/bids")}
className="ml-auto px-4 py-2 rounded-lg border border-gray-300 font-medium hover:bg-gray-50"
>
My Bids →
</button>
</div>

{error && (
<p className="mt-5 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error}</p>
)}

<div className="mt-6 space-y-4">
{visible.length === 0 ? (
<div className="border border-gray-200 rounded-2xl p-6 text-gray-700">
{tab === "active" ? "No active jobs yet." : "No completed jobs yet."}
</div>
) : (
visible.map((j) => (
<button
key={j.id}
type="button"
onClick={() => router.push(`/provider/jobs/${j.id}`)}
className="w-full text-left border border-gray-200 rounded-2xl p-5 hover:bg-gray-50"
>
<div className="flex items-start justify-between gap-4">
<div>
<div className="flex items-center gap-2">
<div className="text-lg font-semibold text-gray-900">
{j.issueType ? titleCase(j.issueType) : "Job"}
</div>

{j.isEmergency ? (
<span className="text-xs font-semibold px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800">
EMERGENCY
</span>
) : null}

{j.status ? (
<span className="text-xs font-semibold px-2 py-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700">
{titleCase(j.status)}
</span>
) : null}
</div>

<div className="mt-2 text-sm text-gray-700 space-y-1">
{j.pickupAddress || j.dropoffAddress ? (
<>
<div>
<b>Pickup:</b> {j.pickupAddress ?? "—"}
</div>
<div>
<b>Dropoff:</b> {j.dropoffAddress ?? "—"}
</div>
</>
) : (
<div>
<b>Location:</b> {j.locationText ?? "—"}
</div>
)}

{j.notes ? (
<div className="text-gray-600">
<b>Notes:</b> {j.notes}
</div>
) : null}
</div>

<div className="mt-3 text-xs text-gray-500">
Job ID: <span className="font-mono">{j.id}</span> • Updated: {formatWhen(j.updatedAt)}
</div>
</div>

<div className="shrink-0 text-sm font-semibold underline opacity-80">Open →</div>
</div>
</button>
))
)}
</div>
</div>
</main>
);
}

