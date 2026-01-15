"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import DispatchChat from "@/components/DispatchChat";

type DispatchJob = {
id: string;
providerId: string;

title?: string | null;
pickupAddress?: string | null;
dropoffAddress?: string | null;

customerName?: string | null;
customerPhone?: string | null;
vehicle?: string | null;
trailer?: string | null;
tow?: boolean;

notes?: string | null;

priority?: "normal" | "urgent" | "emergency";
status?: "new" | "assigned" | "enroute" | "in_progress" | "completed" | "cancelled";

assignedTo?: string | null;

createdAt?: any;
updatedAt?: any;
};

function titleCase(s?: string) {
return (s || "")
.replace(/_/g, " ")
.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmployeeDispatchJobPage() {
const router = useRouter();
const params = useParams();
const sp = useSearchParams();

const jobId = useMemo(() => {
const raw = (params?.jobId as string | string[] | undefined) ?? "";
return Array.isArray(raw) ? raw[0] : raw;
}, [params]);

// We pass providerUid in query param ?p=PROVIDER_UID from the employee dashboard
const providerUid = (sp.get("p") || "").trim();

const [uid, setUid] = useState<string | null>(null);
const [authReady, setAuthReady] = useState(false);

const [job, setJob] = useState<DispatchJob | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

useEffect(() => {
return onAuthStateChanged(auth, (u) => {
setUid(u?.uid ?? null);
setAuthReady(true);
if (!u) router.replace("/auth/sign-in");
});
}, [router]);

useEffect(() => {
setErr(null);

if (!authReady) return;
if (!uid) return;

if (!providerUid) {
setLoading(false);
setErr("Missing provider id (p=). Go back and open from the employee dashboard.");
return;
}
if (!jobId) {
setLoading(false);
setErr("Missing jobId.");
return;
}

setLoading(true);

const jobRef = doc(db, "providers", providerUid, "dispatchJobs", jobId);
const unsub = onSnapshot(
jobRef,
(snap) => {
if (!snap.exists()) {
setJob(null);
setLoading(false);
setErr("Job not found (wrong provider id or deleted).");
return;
}
setJob({ id: snap.id, ...(snap.data() as any) });
setLoading(false);
},
(e) => {
setJob(null);
setLoading(false);
setErr(e?.message || "Failed to load job (permissions).");
}
);

return () => unsub();
}, [authReady, uid, providerUid, jobId]);

async function setStatus(next: DispatchJob["status"]) {
setErr(null);
if (!providerUid || !jobId) return;

try {
const jobRef = doc(db, "providers", providerUid, "dispatchJobs", jobId);
await updateDoc(jobRef, { status: next, updatedAt: serverTimestamp() });
} catch (e: any) {
setErr(e?.message ?? "Failed to update status.");
}
}

if (!authReady || loading) {
return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto">
<div className="border rounded-2xl p-6 text-sm text-gray-600">Loading…</div>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-4">
<div className="flex items-center gap-3">
<button
onClick={() => router.push("/employee/dashboard")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
← Back
</button>

<div className="ml-auto text-xs text-gray-600">
Status: <b>{titleCase(job?.status || "new")}</b>
</div>
</div>

{err ? (
<div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{!job ? (
<div className="border rounded-2xl p-6 text-sm text-gray-700">No job loaded.</div>
) : (
<>
<section className="border rounded-2xl p-6">
<div className="text-xl font-bold">{job.title || "Dispatch Job"}</div>

<div className="mt-2 grid sm:grid-cols-2 gap-3 text-sm">
<div className="border rounded-xl p-3">
<div className="text-xs text-gray-500">Pickup / Location</div>
<div className="font-medium">{job.pickupAddress || "—"}</div>
</div>

<div className="border rounded-xl p-3">
<div className="text-xs text-gray-500">Dropoff</div>
<div className="font-medium">{job.dropoffAddress || "—"}</div>
</div>

<div className="border rounded-xl p-3">
<div className="text-xs text-gray-500">Customer</div>
<div className="font-medium">
{job.customerName || "—"} • {job.customerPhone || "—"}
</div>
</div>

<div className="border rounded-xl p-3">
<div className="text-xs text-gray-500">Vehicle / Trailer</div>
<div className="font-medium">
{job.vehicle || "—"}
{job.trailer ? ` • ${job.trailer}` : ""}
</div>
</div>
</div>

{job.notes ? (
<div className="mt-3 text-sm text-gray-700">
<div className="text-xs text-gray-500">Notes</div>
<div className="whitespace-pre-wrap">{job.notes}</div>
</div>
) : null}

<div className="mt-4 flex flex-wrap gap-2">
<button
onClick={() => setStatus("enroute")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
>
Enroute
</button>
<button
onClick={() => setStatus("in_progress")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
>
In Progress
</button>
<button
onClick={() => setStatus("completed")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
>
Completed
</button>
</div>
</section>

{/* ✅ Internal dispatch chat (employee <-> provider/dispatcher) */}
<DispatchChat providerUid={providerUid} jobId={jobId} room="internal" />
</>
)}
</div>
</main>
);
}

