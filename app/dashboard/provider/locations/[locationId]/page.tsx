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
setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { SERVICE_KEYWORDS, type ServiceKeyword } from "@/lib/SharedProviderCatalog";

type ViewerKind = "provider" | "dispatcher" | "employee" | "unknown";

type Employee = {
id: string;
name?: string | null;
phone?: string | null;
role?: string | null; // "tech" | "dispatcher"
email?: string | null;
active?: boolean;
};

type LocationEmployee = {
employeeId: string;
role?: string | null; // optional mirror for convenience
};

type ProviderLocation = {
id: string;
locationName?: string | null;
companyName?: string | null;
companyAddress?: string | null;
city?: string | null;
state?: string | null;
zip?: string | null;

// ✅ keywords
serviceKeywords?: string[] | null;

// ✅ location-scoped employees
employees?: LocationEmployee[] | null;

createdAt?: any;
updatedAt?: any;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function uniqueCleanKeywords(list: string[]) {
const allowed = new Set<string>(SERVICE_KEYWORDS as unknown as string[]);
const out: string[] = [];
for (const raw of list || []) {
const v = String(raw || "").trim();
if (!v) continue;
if (!allowed.has(v)) continue;
if (!out.includes(v)) out.push(v);
}
return out;
}

export default function ProviderLocationProfilePage() {
const router = useRouter();
const params = useParams();

// ✅ Robust param read for [locationId]
const locationId = useMemo(() => {
const raw =
(params?.locationId as string | string[] | undefined) ??
(params?.id as string | string[] | undefined) ??
"";
return Array.isArray(raw) ? raw[0] : raw;
}, [params]);

const [authReady, setAuthReady] = useState(false);
const [uid, setUid] = useState<string | null>(null);
const [providerUid, setProviderUid] = useState<string | null>(null);
const [viewer, setViewer] = useState<ViewerKind>("unknown");

const isOwner = viewer === "provider";

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [err, setErr] = useState<string | null>(null);
const [ok, setOk] = useState<string | null>(null);

const [location, setLocation] = useState<ProviderLocation | null>(null);

// Form fields
const [locationName, setLocationName] = useState("");
const [companyName, setCompanyName] = useState("");
const [companyAddress, setCompanyAddress] = useState("");
const [city, setCity] = useState("");
const [state, setState] = useState("");
const [zip, setZip] = useState("");

// ✅ Keywords
const [serviceKeywords, setServiceKeywords] = useState<ServiceKeyword[]>([]);
const [keywordFilter, setKeywordFilter] = useState("");

// All employees
const [employees, setEmployees] = useState<Employee[]>([]);
const employeesById = useMemo(() => {
const m = new Map<string, Employee>();
employees.forEach((e) => m.set(e.id, e));
return m;
}, [employees]);

// Location-scoped selected employee ids
const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());

// ----------------------------
// AUTH: resolve provider scope
// ----------------------------
useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
setErr(null);
setOk(null);
setAuthReady(false);

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
router.replace("/dashboard");
return;
}

const data = userSnap.data() as any;
const role = String(data.role || "");

// Owner/provider
if (role === "provider") {
setViewer("provider");
setProviderUid(u.uid);
return;
}

// Employees: no editing
if (role === "employee") {
const p = String(data.providerUid || data.providerId || "");
setViewer("employee");
setProviderUid(p || null);
router.replace("/dashboard/employee");
return;
}

// If dispatcher stored directly in /users
if (role === "dispatcher") {
const p = String(data.providerUid || data.providerId || "");
setViewer("dispatcher");
setProviderUid(p || null);
router.replace("/dashboard/provider?tab=dispatch");
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
}, [router]);

// ----------------------------
// Load location doc
// ----------------------------
useEffect(() => {
if (!authReady) return;

if (!providerUid) {
setLoading(false);
return;
}

if (!locationId) {
setLoading(false);
setErr("Missing locationId in route.");
return;
}

setLoading(true);
setErr(null);

const ref = doc(db, "providerAccounts", providerUid, "locations", locationId);

const unsub = onSnapshot(
ref,
(snap) => {
if (!snap.exists()) {
setLocation(null);
setLoading(false);
setErr("Location not found.");
return;
}

const data = snap.data() as any;
const loc: ProviderLocation = { id: snap.id, ...data };
setLocation(loc);

// hydrate form fields
setLocationName(String(loc.locationName || ""));
setCompanyName(String(loc.companyName || ""));
setCompanyAddress(String(loc.companyAddress || ""));
setCity(String(loc.city || ""));
setState(String(loc.state || ""));
setZip(String(loc.zip || ""));

// ✅ hydrate keywords
const loaded = Array.isArray(loc.serviceKeywords) ? (loc.serviceKeywords as string[]) : [];
setServiceKeywords(uniqueCleanKeywords(loaded) as ServiceKeyword[]);

// hydrate selected employees
const next = new Set<string>();
const list = Array.isArray(loc.employees) ? loc.employees : [];
list.forEach((x: any) => {
const id = String(x?.employeeId || "").trim();
if (id) next.add(id);
});
setSelectedEmpIds(next);

setLoading(false);
},
(e) => {
setLocation(null);
setLoading(false);
setErr(e?.message || "Failed to load location.");
}
);

return () => unsub();
}, [authReady, providerUid, locationId]);

// ----------------------------
// Load provider employees list
// ----------------------------
useEffect(() => {
if (!authReady) return;
if (!providerUid) return;

const qe = query(collection(db, "providers", providerUid, "employees"));
const unsub = onSnapshot(
qe,
(snap) => {
const rows = snap.docs
.map((d) => ({ id: d.id, ...(d.data() as any) }))
.filter((e: any) => e.active !== false) as Employee[];

rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
setEmployees(rows);
},
(e) => {
setEmployees([]);
setErr(e?.message || "Failed to load employees.");
}
);

return () => unsub();
}, [authReady, providerUid]);

const selectedCount = selectedEmpIds.size;

// Restrict selection UI to TECHS only
const techEmployees = useMemo(() => {
return employees
.filter((e) => String(e.role || "") !== "dispatcher")
.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}, [employees]);

function toggleEmployee(empId: string) {
setSelectedEmpIds((prev) => {
const next = new Set(prev);
if (next.has(empId)) next.delete(empId);
else next.add(empId);
return next;
});
}

function toggleKeyword(k: ServiceKeyword) {
setServiceKeywords((prev) => {
if (prev.includes(k)) return prev.filter((x) => x !== k);
return [...prev, k];
});
}

const filteredKeywords = useMemo(() => {
const q = keywordFilter.trim().toLowerCase();
const all = SERVICE_KEYWORDS as unknown as ServiceKeyword[];
if (!q) return all;
return all.filter((k) => String(k).toLowerCase().includes(q));
}, [keywordFilter]);

async function saveLocation() {
if (!providerUid) return;
if (!locationId) return;

if (!isOwner) {
setErr("Only the owner can edit location profile.");
return;
}

setErr(null);
setOk(null);
setSaving(true);

try {
const ref = doc(db, "providerAccounts", providerUid, "locations", locationId);

// Build employees payload
const employeesPayload: LocationEmployee[] = Array.from(selectedEmpIds).map((id) => ({
employeeId: id,
role: String(employeesById.get(id)?.role || "tech"),
}));

const cleanedKeywords = uniqueCleanKeywords(serviceKeywords as unknown as string[]);

await updateDoc(ref, {
locationName: locationName.trim() || null,
companyName: companyName.trim() || null,
companyAddress: companyAddress.trim() || null,
city: city.trim() || null,
state: state.trim() ? state.trim().toUpperCase() : null,
zip: zip.trim() || null,

// ✅ save keywords
serviceKeywords: cleanedKeywords,

employees: employeesPayload.length ? employeesPayload : [],
updatedAt: serverTimestamp(),
});

// ✅ mirror keywords (and basic display fields) into businessProfiles for search/directory
await setDoc(
doc(db, "businessProfiles", locationId),
{
accountId: providerUid,
locationId,
companyName: companyName.trim() || null,
companyAddress: companyAddress.trim() || null,
city: city.trim() || null,
state: state.trim() ? state.trim().toUpperCase() : null,
zip: zip.trim() || null,
serviceKeywords: cleanedKeywords,
updatedAt: serverTimestamp(),
},
{ merge: true }
);

setOk("Location updated ✅");
setTimeout(() => setOk(null), 2500);
} catch (e: any) {
setErr(e?.message || "Failed to save location.");
} finally {
setSaving(false);
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

if (!isOwner) {
return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-3">
<button
onClick={() => router.push("/dashboard/provider?tab=dispatch")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
← Back
</button>

<div className="border border-yellow-200 bg-yellow-50 rounded-2xl p-5 text-sm text-yellow-900">
<b>Owner-only:</b> Location profile editing is restricted to the primary provider account.
</div>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-4">
<div className="flex items-center gap-3">
<button
onClick={() => router.push("/dashboard/provider?tab=locations")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
← Back to Locations
</button>

<div className="ml-auto text-xs text-gray-600">
Viewing as: <b>{viewer}</b>
{" • "}
Location: <b>{location?.locationName || location?.companyName || locationId}</b>
</div>
</div>

{err ? (
<div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{ok ? (
<div className="border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">{ok}</div>
) : null}

{!location ? (
<div className="border rounded-2xl p-6 text-sm text-gray-700">No location loaded.</div>
) : (
<>
<section className="border rounded-2xl p-6">
<div className="text-xl font-bold">Edit Location Profile</div>
<div className="text-sm text-gray-600 mt-1">
Update this location’s info and choose which employees belong to this location.
</div>

<div className="mt-5 grid gap-3">
<div>
<label className="block text-sm font-medium mb-1">Location name</label>
<input
className="border rounded-lg p-2 w-full"
value={locationName}
onChange={(e) => setLocationName(e.target.value)}
placeholder="Example: Orlando Yard"
disabled={saving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Company name</label>
<input
className="border rounded-lg p-2 w-full"
value={companyName}
onChange={(e) => setCompanyName(e.target.value)}
placeholder="Example: BigDiese Towing"
disabled={saving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Company address</label>
<input
className="border rounded-lg p-2 w-full"
value={companyAddress}
onChange={(e) => setCompanyAddress(e.target.value)}
placeholder="Street address"
disabled={saving}
/>
</div>

<div className="grid sm:grid-cols-3 gap-3">
<div>
<label className="block text-sm font-medium mb-1">City</label>
<input className="border rounded-lg p-2 w-full" value={city} onChange={(e) => setCity(e.target.value)} disabled={saving} />
</div>
<div>
<label className="block text-sm font-medium mb-1">State</label>
<input className="border rounded-lg p-2 w-full" value={state} onChange={(e) => setState(e.target.value)} placeholder="FL" disabled={saving} />
</div>
<div>
<label className="block text-sm font-medium mb-1">ZIP</label>
<input className="border rounded-lg p-2 w-full" value={zip} onChange={(e) => setZip(e.target.value)} disabled={saving} />
</div>
</div>
</div>
</section>

{/* ✅ KEYWORDS */}
<section className="border rounded-2xl p-6 space-y-3">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-lg font-semibold">Service Keywords</div>
<div className="text-sm text-gray-600 mt-1">
These describe what this location offers (used for matching + filtering).
</div>
</div>
<div className="text-xs text-gray-600">
Selected: <b>{serviceKeywords.length}</b>
</div>
</div>

<input
className="border rounded-lg p-2 w-full"
value={keywordFilter}
onChange={(e) => setKeywordFilter(e.target.value)}
placeholder="Search keywords…"
disabled={saving}
/>

<div className="grid md:grid-cols-2 gap-2 max-h-[320px] overflow-auto border rounded-xl p-3">
{(filteredKeywords as ServiceKeyword[]).map((k) => {
const checked = serviceKeywords.includes(k);
return (
<label key={k} className="flex items-center gap-2 text-sm">
<input type="checkbox" checked={checked} onChange={() => toggleKeyword(k)} disabled={saving} />
<span>{k}</span>
</label>
);
})}
</div>
</section>

<section className="border rounded-2xl p-6">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-lg font-semibold">Location Employees</div>
<div className="text-sm text-gray-600 mt-1">
Only these employees will show up for assignment when dispatching jobs under this location.
</div>
</div>
<div className="text-xs text-gray-600">
Selected: <b>{selectedCount}</b>
</div>
</div>

{techEmployees.length === 0 ? (
<div className="mt-4 text-sm text-gray-600">
No active employees found. Create employees first in the Employees tab.
</div>
) : (
<div className="mt-4 grid gap-2">
{techEmployees.map((e) => {
const checked = selectedEmpIds.has(e.id);
return (
<label
key={e.id}
className={`flex items-center gap-3 border rounded-xl p-3 text-sm cursor-pointer hover:bg-gray-50 ${
checked ? "border-gray-400" : "border-gray-200"
}`}
>
<input type="checkbox" checked={checked} onChange={() => toggleEmployee(e.id)} disabled={saving} />
<div className="flex-1">
<div className="font-medium">{e.name || e.id}</div>
<div className="text-xs text-gray-600">
Role: <b>{titleCase(e.role || "tech")}</b>
{e.phone ? ` • ${e.phone}` : ""}
{e.email ? ` • ${e.email}` : ""}
</div>
</div>
<div className="text-xs text-gray-500">UID: {e.id}</div>
</label>
);
})}
</div>
)}
</section>

<button
onClick={saveLocation}
disabled={saving}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{saving ? "Saving…" : "Save Location"}
</button>
</>
)}
</div>
</main>
);
}

