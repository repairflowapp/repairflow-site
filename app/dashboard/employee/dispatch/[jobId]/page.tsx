"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
doc,
getDoc,
onSnapshot,
serverTimestamp,
updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import DispatchChat from "@/components/DispatchChat";

type DispatchJob = {
id: string;
providerId?: string;

locationId?: string | null;

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

assignedEmployeeUid?: string | null;

// legacy
assignedTo?: string | null;
assignedToUid?: string | null;

assignedAt?: any;
enrouteAt?: any;
inProgressAt?: any;
completedAt?: any;

createdAt?: any;
updatedAt?: any;
};

type ViewerKind = "tech" | "dispatcher" | "unknown";

type LocationEmployeeAssignment = {
employeeId: string;
role: string;
};

type ProviderLocationDoc = {
employees?: LocationEmployeeAssignment[] | null;
locationName?: string | null;
companyName?: string | null;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getAssignedUid(job: DispatchJob | null): string {
if (!job) return "";
return String(job.assignedEmployeeUid || job.assignedToUid || job.assignedTo || "");
}

export default function EmployeeDispatchJobPage() {
const router = useRouter();
const params = useParams();

const jobId = useMemo(() => {
const raw =
(params?.jobId as string | string[] | undefined) ??
(params?.id as string | string[] | undefined) ??
"";
return Array.isArray(raw) ? raw[0] : raw;
}, [params]);

const [authReady, setAuthReady] = useState(false);
const [uid, setUid] = useState<string | null>(null);

const [providerUid, setProviderUid] = useState<string | null>(null);
const [viewer, setViewer] = useState<ViewerKind>("unknown");

const [job, setJob] = useState<DispatchJob | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

// location doc for enforcing location restriction
const [locDoc, setLocDoc] = useState<ProviderLocationDoc | null>(null);

// status change
const [statusSaving, setStatusSaving] = useState(false);
const [statusMsg, setStatusMsg] = useState<string | null>(null);

const assignedUid = useMemo(() => getAssignedUid(job), [job]);
const isDispatcher = viewer === "dispatcher";
const isTech = viewer === "tech";

// ----------------------------
// AUTH: must be employee
// role "dispatcher" gets dispatcher permissions
// ----------------------------
useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
setErr(null);
setLoading(true);
setAuthReady(false);

if (!u) {
router.replace("/auth/sign-in");
setAuthReady(true);
setLoading(false);
return;
}

setUid(u.uid);

try {
const userSnap = await getDoc(doc(db, "users", u.uid));
if (!userSnap.exists()) {
setViewer("unknown");
setProviderUid(null);
setErr("No user profile found in /users.");
return;
}

const user = userSnap.data() as any;
const role = String(user.role || "");
if (role !== "employee") {
// if provider tries to hit employee route, send them back
router.replace("/dashboard/provider?tab=dispatch");
return;
}

const p = String(user.providerUid || user.providerId || "");
if (!p) {
setViewer("unknown");
setProviderUid(null);
setErr("Employee profile missing provider UID.");
return;
}

const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = empSnap.exists() ? (empSnap.data() as any) : null;

const active = emp?.active !== false;
const empRole = String(emp?.role || "tech");

if (!active) {
setViewer("unknown");
setProviderUid(null);
setErr("Your employee account is inactive.");
return;
}

setProviderUid(p);
setViewer(empRole === "dispatcher" ? "dispatcher" : "tech");
} catch (e: any) {
setErr(e?.message || "Failed to load employee profile.");
} finally {
setAuthReady(true);
}
});

return () => unsub();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [router, jobId]);

// ----------------------------
// Load dispatch job (within provider scope)
// ----------------------------
useEffect(() => {
setErr(null);

if (!authReady) return;
if (!uid) return;
if (!providerUid) return;

if (!jobId) {
setLoading(false);
setErr("Missing jobId (route param).");
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
setErr("Dispatch job not found.");
return;
}

const data = snap.data() as any;
const nextJob = { id: snap.id, ...data } as DispatchJob;
setJob(nextJob);
setLoading(false);
},
(e) => {
setJob(null);
setLoading(false);
setErr(e?.message || "Failed to load dispatch job.");
}
);

return () => unsub();
}, [authReady, uid, providerUid, jobId]);

// ----------------------------
// Load location doc (so we can validate tech is assigned to that location)
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;
if (!job?.locationId) {
setLocDoc(null);
return;
}

const ref = doc(db, "providerAccounts", providerUid, "locations", String(job.locationId));
const unsub = onSnapshot(
ref,
(snap) => setLocDoc(snap.exists() ? ((snap.data() as any) as ProviderLocationDoc) : null),
() => setLocDoc(null)
);

return () => unsub();
}, [authReady, providerUid, job?.locationId]);

const techAllowedForLocation = useMemo(() => {
if (!uid) return false;
const rows = Array.isArray(locDoc?.employees) ? locDoc!.employees! : [];
return rows.some((a) => String(a?.employeeId || "") === String(uid));
}, [locDoc, uid]);

const techAllowedForJob = useMemo(() => {
if (!uid) return false;
if (!job) return false;

// Tech must be assigned to job AND assigned to location
return String(assignedUid || "") === String(uid) && techAllowedForLocation;
}, [job, uid, assignedUid, techAllowedForLocation]);

const canView = useMemo(() => {
if (!job) return false;
if (isDispatcher) return true;

// Tech
return techAllowedForJob;
}, [job, isDispatcher, techAllowedForJob]);

const canUpdateStatus = useMemo(() => {
if (!job) return false;
if (isDispatcher) return true; // dispatchers can update statuses too
return techAllowedForJob; // tech only on their assigned job
}, [job, isDispatcher, techAllowedForJob]);

async function setStatus(next: DispatchJob["status"]) {
if (!providerUid || !jobId) return;
if (!job) return;
if (!canUpdateStatus) return;

setErr(null);
setStatusMsg(null);
setStatusSaving(true);

try {
const jobRef = doc(db, "providers", providerUid, "dispatchJobs", jobId);

const patch: any = {
status: next,
updatedAt: serverTimestamp(),
};

if (next === "assigned") patch.assignedAt = serverTimestamp();
if (next === "enroute") patch.enrouteAt = serverTimestamp();
if (next === "in_progress") patch.inProgressAt = serverTimestamp();
if (next === "completed") patch.completedAt = serverTimestamp();

await updateDoc(jobRef, patch);

setStatusMsg(`Status updated to ${titleCase(next || "")} ✅`);
setTimeout(() => setStatusMsg(null), 2500);
} catch (e: any) {
setErr(e?.message || "Failed to update status.");
} finally {
setStatusSaving(false);
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

if (!job) {
return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-3">
<button
onClick={() => router.push("/dashboard/employee")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
← Back
</button>
<div className="border rounded-2xl p-6 text-sm text-gray-700">No job loaded.</div>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-4">
<div className="flex items-center gap-3">
<button
onClick={() => router.push("/dashboard/employee")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
← Back
</button>

<div className="ml-auto text-xs text-gray-600">
Viewing as: <b>{viewer}</b>
{" • "}
Status: <b>{titleCase(job.status || "new")}</b>
</div>
</div>

{err ? (
<div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{statusMsg ? (
<div className="border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">
{statusMsg}
</div>
) : null}

{!canView ? (
<div className="border border-yellow-200 bg-yellow-50 rounded-2xl p-4 text-sm text-yellow-900">
You don’t have access to this job. (Techs must be assigned to the job and assigned to its location.)
</div>
) : (
<>
<section className="border rounded-2xl p-6">
<div className="flex items-start justify-between gap-3">
<div className="text-xl font-bold">{job.title || "Dispatch Job"}</div>
<div className="text-xs text-gray-600">
Status: <b>{titleCase(job.status || "new")}</b> • Priority:{" "}
<b>{titleCase(job.priority || "normal")}</b>
</div>
</div>

<div className="mt-2 text-xs text-gray-500">
Location:{" "}
<b>
{job.locationId
? `${locDoc?.locationName || locDoc?.companyName || String(job.locationId)}`
: "— (missing locationId)"}
</b>
</div>

{/* ✅ STATUS BUTTONS (tech jobs) */}
<div className="mt-4 border rounded-xl p-4">
<div className="text-sm font-semibold">Status</div>
<div className="text-xs text-gray-600 mt-1">
{isDispatcher ? "Dispatcher can update status." : "Tech can update status for assigned jobs."}
</div>

<div className="mt-3 flex flex-wrap gap-2">
<button
disabled={!canUpdateStatus || statusSaving}
onClick={() => setStatus("assigned")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Assigned
</button>
<button
disabled={!canUpdateStatus || statusSaving}
onClick={() => setStatus("enroute")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Enroute
</button>
<button
disabled={!canUpdateStatus || statusSaving}
onClick={() => setStatus("in_progress")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
In Progress
</button>
<button
disabled={!canUpdateStatus || statusSaving}
onClick={() => setStatus("completed")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Completed
</button>
<button
disabled={!canUpdateStatus || statusSaving}
onClick={() => setStatus("cancelled")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Cancelled
</button>
</div>

{statusSaving ? <div className="text-xs text-gray-500 mt-2">Saving status…</div> : null}
</div>

<div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
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
{job.tow ? " • Tow" : ""}
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
</section>

<DispatchChat providerUid={providerUid!} jobId={jobId} room="internal" />
<DispatchChat providerUid={providerUid!} jobId={jobId} room="customer" />
</>
)}
</div>
</main>
);
}

