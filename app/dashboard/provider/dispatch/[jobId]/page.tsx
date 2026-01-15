"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
collection,
doc,
getDoc,
onSnapshot,
query,
serverTimestamp,
updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import DispatchChat from "@/components/DispatchChat";

type DispatchJob = {
id: string;
providerId?: string;

// ✅ location scope (required for enforcement)
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

// ✅ canonical assignment field
assignedEmployeeUid?: string | null;

// legacy fields (backwards compatibility)
assignedTo?: string | null;
assignedToUid?: string | null;

assignedAt?: any;
enrouteAt?: any;
onSiteAt?: any;
onsiteAt?: any;
inProgressAt?: any;
completedAt?: any;

createdAt?: any;
updatedAt?: any;
};

type Employee = {
id: string;
name?: string | null;
role?: string | null; // "tech" | "dispatcher"
phone?: string | null;
email?: string | null;
active?: boolean;
};

// Location doc shape (only what we need)
type ProviderLocation = {
id: string;
locationName?: string | null;
companyName?: string | null;
employees?: { employeeId: string }[] | null; // location-scoped employees
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ViewerKind = "provider" | "dispatcher" | "employee" | "unknown";

function getAssignedUid(job: DispatchJob | null): string {
if (!job) return "";
// ✅ prefer canonical, then legacy fallbacks
return String(job.assignedEmployeeUid || job.assignedToUid || job.assignedTo || "");
}

export default function ProviderDispatchJobPage() {
const router = useRouter();
const params = useParams();

const jobId = useMemo(() => {
const raw =
(params?.jobId as string | string[] | undefined) ??
(params?.id as string | string[] | undefined) ??
"";
return Array.isArray(raw) ? raw[0] : raw;
}, [params]);

const [uid, setUid] = useState<string | null>(null);
const [providerUid, setProviderUid] = useState<string | null>(null);
const [viewer, setViewer] = useState<ViewerKind>("unknown");
const [authReady, setAuthReady] = useState(false);

const [job, setJob] = useState<DispatchJob | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

// Location scope
const [location, setLocation] = useState<ProviderLocation | null>(null);
const [locationEmpIds, setLocationEmpIds] = useState<Set<string>>(new Set());

// Employees list for assignment (filtered to location techs)
const [employees, setEmployees] = useState<Employee[]>([]);
const [assignTo, setAssignTo] = useState<string>(""); // "" = unassigned
const [assignSaving, setAssignSaving] = useState(false);
const [assignMsg, setAssignMsg] = useState<string | null>(null);

// Status changing
const [statusSaving, setStatusSaving] = useState(false);
const [statusMsg, setStatusMsg] = useState<string | null>(null);

// Viewer permissions:
const canManage = viewer === "provider" || viewer === "dispatcher";
const isTechEmployee = viewer === "employee";

// ----------------------------
// AUTH: Provider OR Employee Dispatcher allowed
// Tech employee can view + update status buttons
// ----------------------------
useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
setErr(null);

if (!u) {
router.replace("/auth/sign-in");
setAuthReady(true);
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

const data = userSnap.data() as any;
const role = String(data.role || "");

// Provider owner
if (role === "provider") {
setViewer("provider");
setProviderUid(u.uid);
return;
}

// Employee (dispatcher or tech)
if (role === "employee") {
const p = String(data.providerUid || data.providerId || "");
if (!p) {
setViewer("employee");
setProviderUid(null);
setErr("Employee profile missing provider UID.");
return;
}

// read employee role from providers/{p}/employees/{uid}
const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = empSnap.exists() ? (empSnap.data() as any) : null;
const empRole = String(emp?.role || "");
const active = emp?.active !== false;

if (!active) {
setViewer("employee");
setProviderUid(p);
router.replace("/dashboard/employee");
return;
}

if (empRole === "dispatcher") {
setViewer("dispatcher");
setProviderUid(p);
return;
}

// tech employee: allowed here, but limited
setViewer("employee");
setProviderUid(p);
return;
}

router.replace("/dashboard");
} catch (e: any) {
setErr(e?.message || "Failed to load user profile.");
} finally {
setAuthReady(true);
}
});

return () => unsub();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [router, jobId]);

// ----------------------------
// Load dispatch job
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
setErr("Dispatch job not found (deleted or wrong path).");
return;
}

const data = snap.data() as any;
const nextJob = { id: snap.id, ...data } as DispatchJob;

setJob(nextJob);

// ✅ set dropdown value from canonical assignment field first
setAssignTo(getAssignedUid(nextJob));

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
// Load location doc for enforcement (providerAccounts/{providerUid}/locations/{locationId})
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;

const locId = String(job?.locationId || "");
if (!locId) {
setLocation(null);
setLocationEmpIds(new Set());
return;
}

const locRef = doc(db, "providerAccounts", providerUid, "locations", locId);
const unsub = onSnapshot(
locRef,
(snap) => {
if (!snap.exists()) {
setLocation(null);
setLocationEmpIds(new Set());
return;
}

const data = snap.data() as any;
const loc = { id: snap.id, ...data } as ProviderLocation;
setLocation(loc);

const ids = new Set<string>();
const list = Array.isArray((loc as any).employees) ? (loc as any).employees : [];
list.forEach((x: any) => {
const id = String(x?.employeeId || "").trim();
if (id) ids.add(id);
});
setLocationEmpIds(ids);
},
() => {
setLocation(null);
setLocationEmpIds(new Set());
}
);

return () => unsub();
}, [authReady, providerUid, job?.locationId]);

// ----------------------------
// Load employees for assignment
// ✅ FIX: do NOT orderBy createdAt (some docs may not have it)
// ✅ FILTER: only techs assigned to THIS location
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;
if (!canManage) return;

// if job has no location, there is nothing to enforce; keep list empty (forces fixing job)
const locId = String(job?.locationId || "");
if (!locId) {
setEmployees([]);
return;
}

const qe = query(collection(db, "providers", providerUid, "employees"));
const unsub = onSnapshot(
qe,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Employee[];

const activeTechs = rows
.filter((e) => e.active !== false)
.filter((e) => String(e.role || "") !== "dispatcher")
// ✅ location enforcement
.filter((e) => locationEmpIds.has(e.id))
.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

setEmployees(activeTechs);
},
(e) => {
setEmployees([]);
setErr(e?.message || "Failed to load employees.");
}
);

return () => unsub();
}, [authReady, providerUid, canManage, job?.locationId, locationEmpIds]);

const employeeNameById = useMemo(() => {
const m = new Map<string, string>();
employees.forEach((e) => m.set(e.id, e.name || e.id));
return m;
}, [employees]);

const currentAssignedUid = useMemo(() => getAssignedUid(job), [job]);

// If assignment points to someone NOT in this location, warn.
const assignmentOutOfScope = useMemo(() => {
const assigned = String(currentAssignedUid || "");
if (!assigned) return false;
if (!job?.locationId) return false;
return !locationEmpIds.has(assigned);
}, [currentAssignedUid, job?.locationId, locationEmpIds]);

// ----------------------------
// Assignment updates (assign / reassign / unassign)
// Canonical field: assignedEmployeeUid
// Also mirror to assignedToUid for older code until you migrate everything
// ----------------------------
async function saveAssignment() {
if (!providerUid || !jobId) return;
if (!job) return;
if (!canManage) return;

setErr(null);
setAssignMsg(null);
setStatusMsg(null);
setAssignSaving(true);

try {
// ✅ enforce: cannot assign to employee not in location
const nextAssigned = String(assignTo || "");
if (nextAssigned && !locationEmpIds.has(nextAssigned)) {
throw new Error("That employee is not assigned to this location. Add them to the location first.");
}

const jobRef = doc(db, "providers", providerUid, "dispatchJobs", jobId);

const currentAssigned = String(currentAssignedUid || "");

// No-op
if (currentAssigned === nextAssigned) {
setAssignSaving(false);
return;
}

const patch: any = {
// ✅ canonical field
assignedEmployeeUid: nextAssigned ? nextAssigned : null,

// ✅ mirror legacy field for compatibility (optional, but helps while migrating)
assignedToUid: nextAssigned ? nextAssigned : null,

updatedAt: serverTimestamp(),
};

// set assignedAt when assigning/reassigning
if (nextAssigned) {
patch.assignedAt = serverTimestamp();

// If job is new, move to assigned
if (!job.status || job.status === "new") {
patch.status = "assigned";
}
} else {
// Unassign:
// only set status back to "new" if it hasn't started yet
if (!job.status || job.status === "assigned" || job.status === "new") {
patch.status = "new";
}
}

await updateDoc(jobRef, patch);

setAssignMsg(nextAssigned ? "Assignment updated ✅" : "Unassigned ✅");
setTimeout(() => setAssignMsg(null), 2500);
} catch (e: any) {
setErr(e?.message || "Failed to update assignment.");
} finally {
setAssignSaving(false);
}
}

// ----------------------------
// Status updates
// - Provider/dispatcher can update any status
// - Tech can update only: enroute, in_progress, completed
// ----------------------------
function techCanSet(next: DispatchJob["status"]) {
if (!isTechEmployee) return false;
return next === "enroute" || next === "in_progress" || next === "completed";
}

async function setStatus(next: DispatchJob["status"]) {
if (!providerUid || !jobId) return;
if (!job) return;

// permission check
if (!canManage && !techCanSet(next)) return;

setErr(null);
setAssignMsg(null);
setStatusMsg(null);
setStatusSaving(true);

try {
const jobRef = doc(db, "providers", providerUid, "dispatchJobs", jobId);

const patch: any = {
status: next,
updatedAt: serverTimestamp(),
};

// timestamps allowed by rules
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

// Tech view: show status buttons even if manage UI is hidden
const showTechStatusButtons = isTechEmployee;

if (!authReady || loading) {
return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto">
<div className="border rounded-2xl p-6 text-sm text-gray-600">Loading…</div>
</div>
</main>
);
}

const locLabel =
location?.locationName || location?.companyName || (job?.locationId ? String(job.locationId) : "");

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-4">
<div className="flex items-center gap-3">
<button
onClick={() =>
router.push(
viewer === "employee" ? "/dashboard/employee" : "/dashboard/provider?tab=dispatch"
)
}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
← Back
</button>

<div className="ml-auto text-xs text-gray-600">
Viewing as: <b>{viewer}</b>
{" • "}
Status: <b>{titleCase(job?.status || "new")}</b>
</div>
</div>

{err ? (
<div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{assignMsg ? (
<div className="border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">
{assignMsg}
</div>
) : null}

{statusMsg ? (
<div className="border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">
{statusMsg}
</div>
) : null}

{!job ? (
<div className="border rounded-2xl p-6 text-sm text-gray-700">No job loaded.</div>
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

{/* ✅ Location label */}
{job.locationId ? (
<div className="mt-2 text-sm text-gray-700">
<b>Location:</b> {locLabel || String(job.locationId)}
</div>
) : (
<div className="mt-2 text-sm text-red-700">
<b>Missing location:</b> This job has no locationId. Edit the job creation flow to require a location.
</div>
)}

{/* ✅ Warning if assigned user not in location */}
{assignmentOutOfScope ? (
<div className="mt-3 border border-yellow-200 bg-yellow-50 rounded-xl p-3 text-sm text-yellow-900">
<b>Warning:</b> This job is assigned to an employee who is <b>not</b> in this location. Reassign or
update the location employees list.
</div>
) : null}

{/* Provider/Dispatcher manage UI */}
{canManage ? (
<>
{/* Assignment */}
<div className="mt-4 border rounded-xl p-4">
<div className="text-sm font-semibold">Assignment</div>
<div className="text-xs text-gray-600 mt-1">
Assign or reassign this job to an active tech <b>in this location</b>.
</div>

<div className="mt-3 grid gap-2">
<select
className="border rounded-lg p-2 w-full"
value={assignTo}
onChange={(e) => setAssignTo(e.target.value)}
disabled={assignSaving || statusSaving}
>
<option value="">Unassigned</option>
{employees.map((e) => (
<option key={e.id} value={e.id}>
{e.name || e.id}
</option>
))}
</select>

<div className="flex flex-wrap items-center gap-2">
<button
onClick={saveAssignment}
disabled={
assignSaving ||
statusSaving ||
String(currentAssignedUid || "") === String(assignTo || "")
}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{assignSaving ? "Saving…" : "Save Assignment"}
</button>

<div className="text-xs text-gray-600">
Current:{" "}
<b>
{currentAssignedUid
? employeeNameById.get(currentAssignedUid) || currentAssignedUid
: "Unassigned"}
</b>
</div>
</div>
</div>
</div>

{/* Status (provider/dispatcher) */}
<div className="mt-4 border rounded-xl p-4">
<div className="text-sm font-semibold">Status</div>
<div className="text-xs text-gray-600 mt-1">Update job status (provider/dispatcher).</div>

<div className="mt-3 flex flex-wrap gap-2">
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("assigned")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Assigned
</button>
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("enroute")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Enroute
</button>
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("in_progress")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
In Progress
</button>
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("completed")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Completed
</button>
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("cancelled")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Cancelled
</button>
</div>

{statusSaving ? <div className="text-xs text-gray-500 mt-2">Saving status…</div> : null}
</div>
</>
) : null}

{/* ✅ Tech status buttons (Status Buttons requested) */}
{showTechStatusButtons ? (
<div className="mt-4 border rounded-xl p-4">
<div className="text-sm font-semibold">Update Status</div>
<div className="text-xs text-gray-600 mt-1">
Tech view: update job progress (Enroute → In Progress → Completed).
</div>

<div className="mt-3 flex flex-wrap gap-2">
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("enroute")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Enroute
</button>
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("in_progress")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
In Progress
</button>
<button
disabled={statusSaving || assignSaving}
onClick={() => setStatus("completed")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Completed
</button>
</div>

{statusSaving ? <div className="text-xs text-gray-500 mt-2">Saving status…</div> : null}
</div>
) : null}

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

