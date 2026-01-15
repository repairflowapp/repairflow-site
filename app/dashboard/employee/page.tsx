// app/dashboard/employee/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
collection,
doc,
getDoc,
onSnapshot,
query,
serverTimestamp,
updateDoc,
where,
orderBy,
limit,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type ViewerKind = "employee" | "dispatcher" | "provider" | "unknown";

type EmployeeDoc = {
role?: string | null;
active?: boolean;
providerUid?: string | null;
providerId?: string | null;
};

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
assignedToUid?: string | null;
assignedTo?: string | null;

createdAt?: any;
updatedAt?: any;
};

// ✅ Marketplace jobs (roadsideRequests)
type MarketplaceJobStatus =
| "open"
| "bidding"
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
| "cancelled";

type MarketplaceJob = {
id: string;
providerId?: string | null;

issueType?: string | null;
pickupAddress?: string | null;
dropoffAddress?: string | null;
locationText?: string | null;
notes?: string | null;
isEmergency?: boolean;

status?: MarketplaceJobStatus;

// assignment fields
assignedEmployeeUid?: string | null;
assignedToUid?: string | null;
assignedTo?: string | null;

assignedToName?: string | null;
assignedToPhone?: string | null;

providerAssignedToName?: string | null;
providerAssignedToPhone?: string | null;

createdAt?: any;
updatedAt?: any;

// optional timestamps (if present)
assignedAt?: any;
enrouteAt?: any;
onSiteAt?: any;
onsiteAt?: any;
inProgressAt?: any;
completedAt?: any;
};

type LocationEmployeeAssignment = {
employeeId: string;
role: string;
};

type ProviderLocation = {
id: string;
locationName?: string | null;
companyName?: string | null;
companyAddress?: string | null;
city?: string | null;
state?: string | null;
zip?: string | null;
employees?: LocationEmployeeAssignment[] | null;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getAssignedUid(job: DispatchJob | null): string {
if (!job) return "";
return String(job.assignedEmployeeUid || job.assignedToUid || job.assignedTo || "");
}

function getAssignedUidMarketplace(job: MarketplaceJob | null): string {
if (!job) return "";
return String(job.assignedEmployeeUid || job.assignedToUid || job.assignedTo || "");
}

function tsSeconds(v: any): number {
return Number(v?.seconds ?? 0);
}

function formatWhen(ts: any): string {
if (!ts?.toDate) return "—";
try {
return ts.toDate().toLocaleString();
} catch {
return "—";
}
}

type TabKey = "active" | "completed" | "profile" | "locations";

export default function EmployeeDashboardPage() {
const router = useRouter();

const [authReady, setAuthReady] = useState(false);
const [uid, setUid] = useState<string | null>(null);
const [providerUid, setProviderUid] = useState<string | null>(null);
const [viewer, setViewer] = useState<ViewerKind>("unknown");

const [tab, setTab] = useState<TabKey>("active");

const [err, setErr] = useState<string | null>(null);

const [locations, setLocations] = useState<ProviderLocation[]>([]);
const [locationsLoading, setLocationsLoading] = useState(true);

const [jobs, setJobs] = useState<DispatchJob[]>([]);
const [jobsLoading, setJobsLoading] = useState(true);

// ✅ Marketplace (roadsideRequests)
const [mktJobs, setMktJobs] = useState<MarketplaceJob[]>([]);
const [mktLoading, setMktLoading] = useState(true);

const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
const [okMsg, setOkMsg] = useState<string | null>(null);

// ----------------------------
// AUTH + ROLE
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

const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = empSnap.exists() ? (empSnap.data() as EmployeeDoc) : null;

const empRole = String(emp?.role || "");
const active = emp?.active !== false;

if (!active) {
setViewer("employee");
setProviderUid(p);
setErr("Your employee account is inactive.");
return;
}

if (empRole === "dispatcher") {
setViewer("dispatcher");
setProviderUid(p);
router.replace("/dashboard/dispatcher");
return;
}

setViewer("employee");
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
// LOCATIONS
// providerAccounts/{providerUid}/locations
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;
if (!uid) return;

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
}, [authReady, providerUid, uid]);

const allowedLocationIds = useMemo(() => {
const set = new Set<string>();
if (!uid) return set;

locations.forEach((loc) => {
const assigned = Array.isArray(loc.employees) ? loc.employees : [];
const isIn = assigned.some((a) => String(a?.employeeId || "") === uid);
if (isIn) set.add(loc.id);
});

return set;
}, [locations, uid]);

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
// DISPATCH JOBS
// providers/{providerUid}/dispatchJobs
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;
if (!uid) return;

setJobsLoading(true);

const qd = query(collection(db, "providers", providerUid, "dispatchJobs"));
const unsub = onSnapshot(
qd,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DispatchJob[];
rows.sort((a, b) => tsSeconds(b.createdAt) - tsSeconds(a.createdAt));
setJobs(rows);
setJobsLoading(false);
},
() => {
setJobs([]);
setJobsLoading(false);
}
);

return () => unsub();
}, [authReady, providerUid, uid]);

const visibleJobs = useMemo(() => {
if (!uid) return [];
if (locationsLoading) return [];

return jobs.filter((j) => {
const locId = String(j.locationId || "");
if (!locId) return false;
return allowedLocationIds.has(locId);
});
}, [jobs, allowedLocationIds, uid, locationsLoading]);

const myJobs = useMemo(() => {
if (!uid) return [];
return visibleJobs.filter((j) => getAssignedUid(j) === uid);
}, [visibleJobs, uid]);

const myActiveJobs = useMemo(() => {
return myJobs.filter((j) => {
const s = String(j.status || "new");
return ["new", "assigned", "enroute", "in_progress"].includes(s);
});
}, [myJobs]);

const myCompletedJobs = useMemo(() => {
return myJobs.filter((j) => {
const s = String(j.status || "");
return ["completed", "cancelled"].includes(s);
});
}, [myJobs]);

async function setJobStatus(job: DispatchJob, next: DispatchJob["status"]) {
if (!providerUid) return;
if (!uid) return;

setErr(null);
setOkMsg(null);
setSavingStatusId(job.id);

try {
const locId = String(job.locationId || "");
if (!locId) throw new Error("Job is missing locationId.");
if (!allowedLocationIds.has(locId)) throw new Error("You are not assigned to this job’s location.");

const ref = doc(db, "providers", providerUid, "dispatchJobs", job.id);

const patch: any = {
status: next,
updatedAt: serverTimestamp(),
};

if (next === "assigned") patch.assignedAt = serverTimestamp();
if (next === "enroute") patch.enrouteAt = serverTimestamp();
if (next === "in_progress") patch.inProgressAt = serverTimestamp();
if (next === "completed") patch.completedAt = serverTimestamp();

await updateDoc(ref, patch);

setOkMsg(`Updated: ${job.title || "Job"} → ${titleCase(next || "")} ✅`);
setTimeout(() => setOkMsg(null), 2500);
} catch (e: any) {
setErr(e?.message || "Failed to update status.");
} finally {
setSavingStatusId(null);
}
}

// ----------------------------
// ✅ MARKETPLACE JOBS (roadsideRequests)
// These are the jobs your provider assigns via:
// assignedEmployeeUid / assignedToUid / assignedTo
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;

setMktLoading(true);

// NOTE: Uses orderBy(updatedAt) so make sure you write updatedAt consistently.
const qm = query(
collection(db, "roadsideRequests"),
where("providerId", "==", providerUid),
orderBy("updatedAt", "desc"),
limit(200)
);

const unsub = onSnapshot(
qm,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MarketplaceJob[];
setMktJobs(rows);
setMktLoading(false);
},
(e) => {
setMktJobs([]);
setMktLoading(false);
setErr(e?.message || "Failed to load marketplace jobs.");
}
);

return () => unsub();
}, [authReady, providerUid]);

const myMarketplaceJobs = useMemo(() => {
if (!uid) return [];
return mktJobs.filter((j) => getAssignedUidMarketplace(j) === uid);
}, [mktJobs, uid]);

const myMarketplaceActive = useMemo(() => {
const active = new Set([
"accepted",
"assigned",
"enroute",
"on_site",
"onsite",
"in_progress",
"pending_provider_confirmation",
"pending_customer_confirmation",
]);
return myMarketplaceJobs.filter((j) => active.has(String(j.status || "")));
}, [myMarketplaceJobs]);

const myMarketplaceCompleted = useMemo(() => {
const done = new Set(["completed", "canceled", "cancelled"]);
return myMarketplaceJobs.filter((j) => done.has(String(j.status || "")));
}, [myMarketplaceJobs]);

const headerRight = (
<div className="flex items-center gap-2">
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
if (viewer === "dispatcher") return null;

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-6xl mx-auto">
<div className="flex items-start justify-between gap-3">
<div>
<h1 className="text-3xl font-bold">Employee Dashboard</h1>
<p className="text-sm text-gray-600">
Viewing as <b>{viewer}</b>
</p>
</div>
{headerRight}
</div>

{err ? (
<div className="mt-5 border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{okMsg ? (
<div className="mt-5 border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">
{okMsg}
</div>
) : null}

{/* Tabs */}
<div className="mt-6 flex flex-wrap gap-2">
<button
onClick={() => setTab("active")}
className={`border rounded-lg px-4 py-2 text-sm ${
tab === "active" ? "bg-black text-white" : "hover:bg-gray-50"
}`}
>
Active Jobs ({myActiveJobs.length + myMarketplaceActive.length})
</button>
<button
onClick={() => setTab("completed")}
className={`border rounded-lg px-4 py-2 text-sm ${
tab === "completed" ? "bg-black text-white" : "hover:bg-gray-50"
}`}
>
Completed ({myCompletedJobs.length + myMarketplaceCompleted.length})
</button>
<button
onClick={() => setTab("locations")}
className={`border rounded-lg px-4 py-2 text-sm ${
tab === "locations" ? "bg-black text-white" : "hover:bg-gray-50"
}`}
>
Locations
</button>
<button
onClick={() => setTab("profile")}
className={`border rounded-lg px-4 py-2 text-sm ${
tab === "profile" ? "bg-black text-white" : "hover:bg-gray-50"
}`}
>
Profile
</button>
</div>

{/* ACTIVE */}
{tab === "active" ? (
<section className="mt-6 space-y-6">
{/* Marketplace jobs (roadsideRequests) */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Marketplace Jobs (Roadside Requests)</div>

{mktLoading ? (
<div className="text-sm text-gray-600 mt-2">Loading…</div>
) : myMarketplaceActive.length === 0 ? (
<div className="text-sm text-gray-600 mt-2">No marketplace jobs assigned to you.</div>
) : (
<div className="mt-3 space-y-3">
{myMarketplaceActive.map((j) => {
const title = j.issueType ? titleCase(j.issueType) : "Roadside Job";
const pickup = j.pickupAddress || j.locationText || "—";
const dropoff = j.dropoffAddress || "—";
const st = titleCase(String(j.status || "—"));
const assignedLabel =
(j.assignedToName || j.providerAssignedToName || "") +
(j.assignedToPhone || j.providerAssignedToPhone ? ` (${j.assignedToPhone || j.providerAssignedToPhone})` : "");

return (
<button
key={j.id}
type="button"
onClick={() => router.push(`/provider/jobs/${j.id}`)}
className="w-full text-left border rounded-xl p-4 hover:bg-gray-50"
>
<div className="flex items-start justify-between gap-3">
<div>
<div className="font-semibold">{title}</div>
<div className="text-xs text-gray-600 mt-1">
Status: <b>{st}</b>
{j.isEmergency ? " • EMERGENCY" : ""}
</div>
<div className="text-sm text-gray-700 mt-2">
<b>Pickup:</b> {pickup}
</div>
{dropoff !== "—" ? (
<div className="text-sm text-gray-700 mt-1">
<b>Dropoff:</b> {dropoff}
</div>
) : null}
{j.notes ? (
<div className="text-sm text-gray-600 mt-1">
<b>Notes:</b> {j.notes}
</div>
) : null}
{assignedLabel.trim() ? (
<div className="text-xs text-gray-500 mt-2">Assigned: {assignedLabel.trim()}</div>
) : null}
<div className="text-xs text-gray-500 mt-2">
Job ID: <span className="font-mono">{j.id}</span> • Updated:{" "}
{formatWhen(j.updatedAt || j.createdAt)}
</div>
</div>
<div className="shrink-0 text-sm font-semibold underline opacity-80">Open →</div>
</div>
</button>
);
})}
</div>
)}
</div>

{/* Dispatch jobs */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Dispatch Jobs</div>

{jobsLoading || locationsLoading ? (
<div className="text-sm text-gray-600 mt-2">Loading…</div>
) : myActiveJobs.length === 0 ? (
<div className="text-sm text-gray-600 mt-2">No dispatch jobs assigned to you.</div>
) : (
<div className="mt-3 space-y-3">
{myActiveJobs.map((j) => {
const locLabel = j.locationId
? locationLabelById.get(String(j.locationId)) || String(j.locationId)
: "—";
const busy = savingStatusId === j.id;

return (
<div key={j.id} className="border rounded-xl p-4">
<button
onClick={() => router.push(`/dashboard/employee/dispatch/${j.id}`)}
className="w-full text-left hover:opacity-80"
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
<b>Vehicle:</b> {j.vehicle || "—"}
{j.tow ? " • Tow" : ""}
{j.trailer ? ` • ${j.trailer}` : ""}
</div>
</button>

<div className="mt-3 flex flex-wrap gap-2">
<button
disabled={busy}
onClick={() => setJobStatus(j, "enroute")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
type="button"
>
Enroute
</button>
<button
disabled={busy}
onClick={() => setJobStatus(j, "in_progress")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
type="button"
>
In Progress
</button>
<button
disabled={busy}
onClick={() => setJobStatus(j, "completed")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
type="button"
>
Completed
</button>
<button
disabled={busy}
onClick={() => setJobStatus(j, "cancelled")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
type="button"
>
Cancelled
</button>
{busy ? <span className="text-xs text-gray-500 self-center">Saving…</span> : null}
</div>
</div>
);
})}
</div>
)}
</div>
</section>
) : null}

{/* COMPLETED */}
{tab === "completed" ? (
<section className="mt-6 space-y-6">
{/* Marketplace completed */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Marketplace Jobs (Completed)</div>

{mktLoading ? (
<div className="text-sm text-gray-600 mt-2">Loading…</div>
) : myMarketplaceCompleted.length === 0 ? (
<div className="text-sm text-gray-600 mt-2">No completed marketplace jobs yet.</div>
) : (
<div className="mt-3 space-y-3">
{myMarketplaceCompleted.map((j) => {
const title = j.issueType ? titleCase(j.issueType) : "Roadside Job";
const st = titleCase(String(j.status || "completed"));
return (
<button
key={j.id}
type="button"
onClick={() => router.push(`/provider/jobs/${j.id}`)}
className="w-full text-left border rounded-xl p-4 hover:bg-gray-50"
>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{title}</div>
<div className="text-xs text-gray-600">
Status: <b>{st}</b>
</div>
</div>
<div className="text-xs text-gray-500 mt-2">
Job ID: <span className="font-mono">{j.id}</span> • Updated:{" "}
{formatWhen(j.updatedAt || j.createdAt)}
</div>
</button>
);
})}
</div>
)}
</div>

{/* Dispatch completed */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Dispatch Jobs (Completed)</div>

{jobsLoading || locationsLoading ? (
<div className="text-sm text-gray-600 mt-2">Loading…</div>
) : myCompletedJobs.length === 0 ? (
<div className="text-sm text-gray-600 mt-2">No completed dispatch jobs yet.</div>
) : (
<div className="mt-3 space-y-3">
{myCompletedJobs.map((j) => {
const locLabel = j.locationId
? locationLabelById.get(String(j.locationId)) || String(j.locationId)
: "—";
return (
<button
key={j.id}
onClick={() => router.push(`/dashboard/employee/dispatch/${j.id}`)}
className="w-full text-left border rounded-xl p-4 hover:bg-gray-50"
type="button"
>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{j.title || "Dispatch Job"}</div>
<div className="text-xs text-gray-600">
Status: <b>{titleCase(j.status || "completed")}</b>
</div>
</div>
<div className="text-sm text-gray-700 mt-2">
<b>Location:</b> {locLabel}
</div>
<div className="text-sm text-gray-700 mt-1">
<b>Pickup:</b> {j.pickupAddress || "—"}
</div>
</button>
);
})}
</div>
)}
</div>
</section>
) : null}

{/* LOCATIONS */}
{tab === "locations" ? (
<section className="mt-6 border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Your Locations</div>
{locationsLoading ? (
<div className="text-sm text-gray-600 mt-2">Loading locations…</div>
) : allowedLocationIds.size === 0 ? (
<div className="text-sm text-gray-700 mt-2">
You are not assigned to any locations yet.
<div className="text-xs text-gray-500 mt-1">
Ask your provider/dispatcher to assign you to a location.
</div>
</div>
) : (
<div className="mt-3 flex flex-wrap gap-2">
{[...allowedLocationIds].map((id) => (
<span key={id} className="border rounded-full px-3 py-1 text-sm">
{locationLabelById.get(id) || id}
</span>
))}
</div>
)}
</section>
) : null}

{/* PROFILE */}
{tab === "profile" ? (
<section className="mt-6 border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold">Profile</div>
<div className="text-sm text-gray-600 mt-2">
Next: employee profile fields (name/phone), change password, and preferences.
</div>
</section>
) : null}
</div>
</main>
);
}
