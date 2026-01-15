"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, query } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type ViewerKind = "dispatcher" | "provider" | "employee" | "unknown";

type EmployeeDoc = {
role?: string | null; // "tech" | "dispatcher"
active?: boolean;
};

type DispatchJob = {
id: string;
providerId?: string;
locationId?: string | null;

title?: string | null;
pickupAddress?: string | null;

customerName?: string | null;
customerPhone?: string | null;

vehicle?: string | null;
tow?: boolean;

priority?: "normal" | "urgent" | "emergency";
status?: "new" | "assigned" | "enroute" | "in_progress" | "completed" | "cancelled";

assignedEmployeeUid?: string | null;
assignedToUid?: string | null;
assignedTo?: string | null;

createdAt?: any;
updatedAt?: any;
};

type ProviderLocation = {
id: string;
locationName?: string | null;
companyName?: string | null;
companyAddress?: string | null;
city?: string | null;
state?: string | null;
employees?: { employeeId: string }[] | null;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tsSeconds(v: any): number {
return Number(v?.seconds ?? 0);
}

function getAssignedUid(job: DispatchJob | null): string {
if (!job) return "";
return String(job.assignedEmployeeUid || job.assignedToUid || job.assignedTo || "");
}

export default function DispatcherDashboardPage() {
const router = useRouter();

const [authReady, setAuthReady] = useState(false);
const [uid, setUid] = useState<string | null>(null);
const [providerUid, setProviderUid] = useState<string | null>(null);
const [viewer, setViewer] = useState<ViewerKind>("unknown");

const [err, setErr] = useState<string | null>(null);

const [locations, setLocations] = useState<ProviderLocation[]>([]);
const [locationsLoading, setLocationsLoading] = useState(true);

const [jobs, setJobs] = useState<DispatchJob[]>([]);
const [jobsLoading, setJobsLoading] = useState(true);

// ----------------------------
// AUTH + ROLE (dispatcher only)
// ----------------------------
useEffect(() => {
return onAuthStateChanged(auth, async (u) => {
setAuthReady(false);
setErr(null);

if (!u) {
setUid(null);
setProviderUid(null);
setViewer("unknown");
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

const userData = userSnap.data() as any;
const role = String(userData.role || "");

// Provider should not use dispatcher dashboard
if (role === "provider") {
setViewer("provider");
router.replace("/dashboard/provider?tab=dispatch");
return;
}

if (role !== "employee") {
setViewer("unknown");
router.replace("/dashboard");
return;
}

const p = String(userData.providerUid || userData.providerId || "");
if (!p) {
setViewer("unknown");
setProviderUid(null);
setErr("Employee profile missing provider UID.");
return;
}

// Confirm dispatcher role from providers/{p}/employees/{uid}
const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = empSnap.exists() ? (empSnap.data() as EmployeeDoc) : null;

const empRole = String(emp?.role || "");
const active = emp?.active !== false;

if (!active) {
setViewer("employee");
setProviderUid(p);
router.replace("/dashboard/employee");
return;
}

if (empRole !== "dispatcher") {
// tech employees go to employee dashboard
setViewer("employee");
setProviderUid(p);
router.replace("/dashboard/employee");
return;
}

setViewer("dispatcher");
setProviderUid(p);
} catch (e: any) {
setErr(e?.message || "Failed to load user profile.");
} finally {
setAuthReady(true);
}
});
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [router]);

async function doSignOut() {
await signOut(auth);
router.replace("/auth/sign-in");
router.refresh();
}

// ----------------------------
// LOCATIONS (labels + future safeguards)
// providerAccounts/{providerUid}/locations
// IMPORTANT: no orderBy (safe)
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;

setLocationsLoading(true);

const ql = query(collection(db, "providerAccounts", providerUid, "locations"));
const unsub = onSnapshot(
ql,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProviderLocation[];
rows.sort((a, b) =>
String(a.locationName || a.companyName || "").localeCompare(String(b.locationName || b.companyName || ""))
);
setLocations(rows);
setLocationsLoading(false);
},
() => {
setLocations([]);
setLocationsLoading(false);
}
);

return () => unsub();
}, [authReady, providerUid]);

const locationLabelById = useMemo(() => {
const m = new Map<string, string>();
locations.forEach((l) => {
const label =
l.locationName ||
l.companyName ||
`${l.companyAddress || ""}${l.city ? `, ${l.city}` : ""}${l.state ? `, ${l.state}` : ""}`.trim() ||
l.id;
m.set(l.id, label);
});
return m;
}, [locations]);

// ----------------------------
// DISPATCH JOBS (dispatcher sees ALL provider jobs)
// providers/{providerUid}/dispatchJobs
// IMPORTANT: no orderBy (safe)
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;

setJobsLoading(true);

const qd = query(collection(db, "providers", providerUid, "dispatchJobs"));
const unsub = onSnapshot(
qd,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DispatchJob[];
rows.sort((a, b) => tsSeconds(b.createdAt) - tsSeconds(a.createdAt)); // newest first
setJobs(rows);
setJobsLoading(false);
},
(e) => {
setJobs([]);
setJobsLoading(false);
setErr(e?.message || "Failed to load dispatch jobs.");
}
);

return () => unsub();
}, [authReady, providerUid]);

const headerRight = (
<div className="flex items-center gap-2">
<button
type="button"
onClick={() => router.push("/dashboard/provider?tab=dispatch")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Open Dispatch Admin
</button>

<button
type="button"
onClick={doSignOut}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Sign Out
</button>
</div>
);

if (!authReady) return null;
if (!providerUid) return null;

// Safety: if not dispatcher, render nothing (redirect will happen)
if (viewer !== "dispatcher") return null;

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-6xl mx-auto">
<div className="flex items-start justify-between gap-3">
<div>
<h1 className="text-3xl font-bold">Dispatcher Dashboard</h1>
<p className="text-sm text-gray-600">
Viewing as <b>{viewer}</b> — all dispatch jobs for this provider account.
</p>
</div>
{headerRight}
</div>

{err ? (
<div className="mt-5 border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

<div className="mt-6 grid gap-4">
<section className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Dispatch Jobs</div>
<div className="text-xs text-gray-500 mt-1">
Click a job to open the dispatch job page (assignment, status, internal/customer chat).
</div>

{jobsLoading ? (
<div className="text-sm text-gray-600 mt-3">Loading…</div>
) : jobs.length === 0 ? (
<div className="text-sm text-gray-600 mt-3">No dispatch jobs yet.</div>
) : (
<div className="mt-4 space-y-3">
{jobs.map((j) => {
const locId = String(j.locationId || "");
const locLabel = locId ? locationLabelById.get(locId) || locId : "—";
const assigned = getAssignedUid(j);

return (
<button
key={j.id}
onClick={() => router.push(`/dashboard/provider/dispatch/${j.id}`)}
className="w-full text-left border rounded-xl p-4 hover:bg-gray-50"
type="button"
>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{j.title || "Dispatch Job"}</div>
<div className="text-xs text-gray-600">
Status: <b>{titleCase(j.status || "new")}</b> • Priority:{" "}
<b>{titleCase(j.priority || "normal")}</b>
</div>
</div>

<div className="text-sm text-gray-700 mt-2">
<b>Location:</b> {locLabel}
</div>

<div className="text-sm text-gray-700 mt-1">
<b>Pickup:</b> {j.pickupAddress || "—"}
</div>

<div className="text-sm text-gray-700 mt-1">
<b>Customer:</b> {j.customerName || "—"} • {j.customerPhone || "—"}
</div>

<div className="text-sm text-gray-700 mt-1">
<b>Vehicle:</b> {j.vehicle || "—"}
{j.tow ? " • Tow" : ""}
</div>

<div className="text-xs text-gray-600 mt-2">
<b>Assigned:</b> {assigned || "Unassigned"}
</div>
</button>
);
})}
</div>
)}
</section>

<section className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Next polish (later)</div>
<ul className="list-disc pl-5 text-sm text-gray-700 mt-2 space-y-1">
<li>Filters: by status, location, assigned/unassigned</li>
<li>Quick actions: assign + status change inline</li>
<li>Guardrails: hide owner-only controls everywhere</li>
</ul>
</section>
</div>
</div>
</main>
);
}

