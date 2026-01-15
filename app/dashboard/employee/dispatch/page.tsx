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
where,
orderBy,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type LocationEmployeeAssignment = {
employeeId: string;
role: string;
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

locationId?: string | null;
locationName?: string | null;

title?: string | null;
pickupAddress?: string | null;
dropoffAddress?: string | null;

customerName?: string | null;
customerPhone?: string | null;

vehicle?: string | null;
tow?: boolean;
trailer?: string | null;

notes?: string | null;

priority?: "normal" | "urgent" | "emergency";
status?: "new" | "assigned" | "enroute" | "in_progress" | "completed" | "cancelled";

assignedTo?: string | null;

createdAt?: any;
updatedAt?: any;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmployeeDispatchQueuePage() {
const router = useRouter();
const sp = useSearchParams();

const [authReady, setAuthReady] = useState(false);
const [uid, setUid] = useState<string | null>(null);

const [providerUid, setProviderUid] = useState<string | null>(null);
const [employeeName, setEmployeeName] = useState<string>("Employee");
const [employeeRole, setEmployeeRole] = useState<string>("employee");

const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

// locations assigned
const [locations, setLocations] = useState<ProviderLocation[]>([]);
const [locationId, setLocationId] = useState<string>("");

// jobs for selected location
const [jobs, setJobs] = useState<DispatchJob[]>([]);

// ----------------------------
// AUTH: employee (dispatcher OR tech can view, but intended for dispatcher)
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

// employee doc
const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = empSnap.exists() ? (empSnap.data() as any) : {};

const active = emp?.active !== false;
if (!active) {
setErr("Your employee account is inactive.");
setAuthReady(true);
return;
}

setEmployeeName(String(emp?.name || "Employee"));
setEmployeeRole(String(emp?.role || "tech"));
} catch (e: any) {
setErr(e?.message || "Failed to load employee profile.");
} finally {
setAuthReady(true);
}
});
}, [router]);

// ----------------------------
// Load assigned locations (filter)
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
router.replace(`/dashboard/employee/dispatch?loc=${encodeURIComponent(locationId)}`);
}, [locationId, router]);

// ----------------------------
// Load dispatch queue for selected location
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;
if (!locationId) {
setJobs([]);
return;
}

setErr(null);

const qJobs = query(
collection(db, "providers", providerUid, "dispatchJobs"),
where("locationId", "==", locationId),
where("status", "in", ["new", "assigned", "enroute", "in_progress"]),
orderBy("updatedAt", "desc")
);

const unsub = onSnapshot(
qJobs,
(snap) => {
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DispatchJob[];
setJobs(list);
},
(e) => setErr(e?.message || "Failed to load dispatch queue.")
);

return () => unsub();
}, [authReady, providerUid, locationId]);

async function doSignOut() {
await signOut(auth);
router.replace("/auth/sign-in");
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
<h1 className="text-3xl font-bold">Dispatcher Queue</h1>
<p className="text-sm text-gray-600 mt-1">
Welcome, <b>{employeeName}</b> • Role: <b>{employeeRole}</b>
</p>
</div>

<div className="flex items-center gap-2">
<button
type="button"
onClick={() => router.push("/dashboard/employee/jobs")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
My Jobs
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
<div className="text-lg font-semibold mb-3">Queue</div>

{locations.length === 0 ? (
<div className="text-sm text-gray-600">You aren’t assigned to any locations yet.</div>
) : jobs.length === 0 ? (
<div className="text-sm text-gray-600">No active jobs in this location’s queue.</div>
) : (
<div className="space-y-3">
{jobs.map((j) => (
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
<b>Pickup:</b> {j.pickupAddress || "—"}
</div>

<div className="text-sm text-gray-700 mt-1">
<b>Customer:</b> {j.customerName || "—"} • {j.customerPhone || "—"}
</div>

<div className="text-sm text-gray-700 mt-1">
<b>Vehicle:</b> {j.vehicle || "—"}
{j.tow ? " • Tow" : ""}
{j.trailer ? ` • Trailer: ${j.trailer}` : ""}
</div>

{j.dropoffAddress ? (
<div className="text-sm text-gray-700 mt-1">
<b>Dropoff:</b> {j.dropoffAddress}
</div>
) : null}

{j.notes ? <div className="text-xs text-gray-600 mt-2">{j.notes}</div> : null}

<div className="text-xs text-gray-500 mt-2">
Assigned: <b>{j.assignedTo ? j.assignedTo : "Unassigned"}</b> • Click to manage
</div>
</button>
))}
</div>
)}
</div>
</section>
</div>
</main>
);
}

