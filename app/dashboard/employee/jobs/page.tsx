"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";

type EmployeeDoc = {
name?: string | null;
role?: "tech" | "dispatcher" | string | null;
active?: boolean;
phone?: string | null;
email?: string | null;
};

type LocationEmployeeAssignment = {
employeeId: string;
role: string; // location role; not used here except for filtering
};

type ProviderLocation = {
id: string;
locationName?: string | null;
companyName?: string | null;
city?: string | null;
state?: string | null;
employees?: LocationEmployeeAssignment[] | null;
};

type DispatchJob = {
id: string;

providerId?: string | null;

locationId?: string | null;
locationName?: string | null;

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

assignedAt?: any;
enrouteAt?: any;
inProgressAt?: any;
completedAt?: any;

createdAt?: any;
updatedAt?: any;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhoneMaybe(v?: string | null) {
const s = String(v || "").trim();
if (!s) return "—";
try {
if (isValidUSPhone(s)) return normalizeUSPhone(s);
} catch {}
return s;
}

function sortJobs(a: DispatchJob, b: DispatchJob) {
const aT =
(a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0) * 1000 +
(a.updatedAt?.nanoseconds ?? a.createdAt?.nanoseconds ?? 0) / 1e6;

const bT =
(b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0) * 1000 +
(b.updatedAt?.nanoseconds ?? b.createdAt?.nanoseconds ?? 0) / 1e6;

return bT - aT;
}

export default function EmployeeJobsPage() {
const router = useRouter();
const sp = useSearchParams();

const [authReady, setAuthReady] = useState(false);
const [uid, setUid] = useState<string | null>(null);

const [providerUid, setProviderUid] = useState<string | null>(null);
const [employeeName, setEmployeeName] = useState<string>("Employee");
const [employeeRole, setEmployeeRole] = useState<string>("employee");

const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

// Locations assigned to this employee
const [locations, setLocations] = useState<ProviderLocation[]>([]);
const [locationId, setLocationId] = useState<string>("");

// Jobs
const [jobs, setJobs] = useState<DispatchJob[]>([]);
const [savingJobId, setSavingJobId] = useState<string | null>(null);

// ----------------------------
// AUTH: must be employee + tech
// ----------------------------
useEffect(() => {
return onAuthStateChanged(auth, async (u) => {
setAuthReady(false);
setErr(null);

if (!u) {
setUid(null);
setProviderUid(null);
router.replace("/auth/sign-in");
setAuthReady(true);
return;
}

setUid(u.uid);

try {
const userSnap = await getDoc(doc(db, "users", u.uid));
if (!userSnap.exists()) {
setErr("No user profile found.");
setProviderUid(null);
setAuthReady(true);
return;
}

const userData = userSnap.data() as any;
const role = String(userData.role || "");

if (role !== "employee") {
router.replace("/dashboard");
setAuthReady(true);
return;
}

const p = String(userData.providerUid || userData.providerId || "");
if (!p) {
setErr("Employee profile missing provider UID.");
setProviderUid(null);
setAuthReady(true);
return;
}

setProviderUid(p);

// load employee doc to confirm role
const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = (empSnap.exists() ? (empSnap.data() as any) : {}) as EmployeeDoc;

const active = emp.active !== false;
const r = String(emp.role || "tech");

setEmployeeName(String(emp.name || "Employee"));
setEmployeeRole(r);

if (!active) {
setErr("Your employee account is inactive.");
setAuthReady(true);
return;
}

// if dispatcher, go to dispatcher page
if (r === "dispatcher") {
router.replace("/dashboard/employee/dispatch");
setAuthReady(true);
return;
}
} catch (e: any) {
setErr(e?.message || "Failed to load employee profile.");
} finally {
setAuthReady(true);
}
});
}, [router]);

// ----------------------------
// Load assigned locations (client-side filter)
// providerAccounts/{providerUid}/locations
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!uid || !providerUid) return;

setLoading(true);

const qLoc = query(collection(db, "providerAccounts", providerUid, "locations"));
const unsub = onSnapshot(
qLoc,
(snap) => {
const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProviderLocation[];

const mine = all.filter((l) => {
const emps = Array.isArray(l.employees) ? l.employees : [];
return emps.some((a) => String(a.employeeId) === String(uid));
});

mine.sort((a, b) =>
String(a.locationName || a.companyName || a.id).localeCompare(String(b.locationName || b.companyName || b.id))
);

setLocations(mine);

// determine current selection
const qp = String(sp.get("loc") || "");
const candidate = qp && mine.some((x) => x.id === qp) ? qp : mine[0]?.id || "";

setLocationId(candidate);
setLoading(false);
},
(e) => {
setErr(e?.message || "Failed to load assigned locations.");
setLocations([]);
setLocationId("");
setLoading(false);
}
);

return () => unsub();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [authReady, uid, providerUid]);

// Keep URL in sync
useEffect(() => {
if (!locationId) return;
router.replace(`/dashboard/employee/jobs?loc=${encodeURIComponent(locationId)}`);
}, [locationId, router]);

// ----------------------------
// Load tech jobs for this location + assigned to this employee
// providers/{providerUid}/dispatchJobs
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!uid || !providerUid) return;
if (!locationId) {
setJobs([]);
return;
}

setErr(null);

// Active work statuses
const qJobs = query(
collection(db, "providers", providerUid, "dispatchJobs"),
where("locationId", "==", locationId),
where("assignedTo", "==", uid),
where("status", "in", ["assigned", "enroute", "in_progress"]),
orderBy("updatedAt", "desc")
);

const unsub = onSnapshot(
qJobs,
(snap) => {
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DispatchJob[];
list.sort(sortJobs);
setJobs(list);
},
(e) => setErr(e?.message || "Failed to load jobs.")
);

return () => unsub();
}, [authReady, uid, providerUid, locationId]);

async function doSignOut() {
await signOut(auth);
router.replace("/auth/sign-in");
}

async function setStatus(job: DispatchJob, next: DispatchJob["status"]) {
if (!providerUid) return;
if (!uid) return;
if (!job?.id) return;

// extra safety: tech can only update their own job
if (String(job.assignedTo || "") !== String(uid)) return;

setErr(null);
setSavingJobId(job.id);

try {
const ref = doc(db, "providers", providerUid, "dispatchJobs", job.id);

const patch: any = {
status: next,
updatedAt: serverTimestamp(),
};

// common timestamps
if (next === "assigned") patch.assignedAt = serverTimestamp();
if (next === "enroute") patch.enrouteAt = serverTimestamp();
if (next === "in_progress") patch.inProgressAt = serverTimestamp();
if (next === "completed") patch.completedAt = serverTimestamp();

await updateDoc(ref, patch);
} catch (e: any) {
setErr(e?.message || "Failed to update status.");
} finally {
setSavingJobId(null);
}
}

const locationLabel = useMemo(() => {
const l = locations.find((x) => x.id === locationId);
if (!l) return "—";
return (l.locationName || l.companyName || "Location") + (l.city && l.state ? ` • ${l.city}, ${l.state}` : "");
}, [locations, locationId]);

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-5xl mx-auto">
<div className="flex items-start justify-between gap-3">
<div>
<h1 className="text-3xl font-bold">My Jobs</h1>
<p className="text-sm text-gray-600 mt-1">
Welcome, <b>{employeeName}</b> • Role: <b>{employeeRole}</b>
</p>
</div>

<div className="flex items-center gap-2">
<button
type="button"
onClick={() => router.push("/dashboard/employee/dispatch")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Dispatcher Queue
</button>

<button
onClick={doSignOut}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Sign Out
</button>
</div>
</div>

{!authReady ? <div className="mt-6 text-sm text-gray-600">Loading…</div> : null}

{err ? (
<div className="mt-6 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

<section className="mt-6 border border-gray-200 rounded-2xl p-6">
<div className="flex flex-wrap items-center gap-3">
<div>
<div className="text-lg font-semibold">Location</div>
<div className="text-xs text-gray-600 mt-1">{locationId ? locationLabel : "No location selected"}</div>
</div>

<div className="ml-auto w-full sm:w-[420px]">
<select
className="border rounded-lg p-2 w-full"
value={locationId}
onChange={(e) => setLocationId(e.target.value)}
disabled={loading}
>
{locations.length === 0 ? (
<option value="">No assigned locations</option>
) : (
<>
{locations.map((l) => (
<option key={l.id} value={l.id}>
{(l.locationName || l.companyName || "Location") + (l.city && l.state ? ` • ${l.city}, ${l.state}` : "")}
</option>
))}
</>
)}
</select>
<div className="text-xs text-gray-500 mt-1">
You only see locations you’re assigned to.
</div>
</div>
</div>

<div className="mt-6">
<div className="text-lg font-semibold mb-3">Assigned Jobs</div>

{locations.length === 0 ? (
<div className="text-sm text-gray-600">You aren’t assigned to any locations yet.</div>
) : jobs.length === 0 ? (
<div className="text-sm text-gray-600">No active assigned jobs for this location.</div>
) : (
<div className="space-y-3">
{jobs.map((j) => (
<div key={j.id} className="border rounded-xl p-4">
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{j.title || "Dispatch Job"}</div>
<div className="text-xs text-gray-600">
Status: <b>{titleCase(j.status || "assigned")}</b> • Priority:{" "}
<b>{titleCase(j.priority || "normal")}</b>
</div>
</div>

<div className="text-sm text-gray-700 mt-2">
<b>Pickup:</b> {j.pickupAddress || "—"}
</div>

{j.dropoffAddress ? (
<div className="text-sm text-gray-700 mt-1">
<b>Dropoff:</b> {j.dropoffAddress}
</div>
) : null}

<div className="text-sm text-gray-700 mt-1">
<b>Customer:</b> {j.customerName || "—"} • {formatPhoneMaybe(j.customerPhone)}
</div>

<div className="text-sm text-gray-700 mt-1">
<b>Vehicle:</b> {j.vehicle || "—"}
{j.tow ? " • Tow" : ""}
{j.trailer ? ` • Trailer: ${j.trailer}` : ""}
</div>

{j.notes ? <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{j.notes}</div> : null}

{/* ✅ Status buttons for tech */}
<div className="mt-4 flex flex-wrap gap-2">
<button
disabled={savingJobId === j.id}
onClick={() => setStatus(j, "assigned")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Assigned
</button>

<button
disabled={savingJobId === j.id}
onClick={() => setStatus(j, "enroute")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Enroute
</button>

<button
disabled={savingJobId === j.id}
onClick={() => setStatus(j, "in_progress")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
In Progress
</button>

<button
disabled={savingJobId === j.id}
onClick={() => setStatus(j, "completed")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Completed
</button>

<button
disabled={savingJobId === j.id}
onClick={() => setStatus(j, "cancelled")}
className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
>
Cancelled
</button>

{savingJobId === j.id ? (
<div className="text-xs text-gray-500 self-center ml-2">Saving…</div>
) : null}

<div className="ml-auto">
<button
type="button"
onClick={() => router.push(`/dashboard/provider/dispatch/${j.id}`)}
className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-50"
>
Open Details
</button>
</div>
</div>
</div>
))}
</div>
)}
</div>
</section>
</div>
</main>
);
}

