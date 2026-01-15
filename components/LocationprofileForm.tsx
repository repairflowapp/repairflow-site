"use client";

import { useEffect, useMemo, useState } from "react";
import {
doc,
getDoc,
setDoc,
serverTimestamp,
collection,
onSnapshot,
orderBy,
query,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { geocodeAddress } from "@/lib/geocode";
import { makeGeohash } from "@/lib/geo";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";
import HoursEditorGrouped, { Hours as HoursSimple } from "@/components/HoursEditorGrouped";
import { PROVIDER_TYPES, PAYMENT_TYPES } from "@/lib/providerConstants";
import { SERVICE_KEYWORDS, type ServiceKeyword } from "@/lib/SharedProviderCatalog";

type Props = {
locationId: string;
};

type Employee = {
id: string; // employee uid
name?: string | null;
phone?: string | null;
role?: string | null; // provider-level role (tech/dispatcher)
active?: boolean;
email?: string | null;
};

type LocationEmployeeRole = "tech" | "dispatcher" | "manager" | "owner" | "other";

type LocationEmployeeAssignment = {
employeeId: string;
role: LocationEmployeeRole;
};

type LocationDoc = {
locationName?: string | null;

companyName?: string | null;
companyPhone?: string | null;
companyAddress?: string | null;

city?: string | null;
state?: string | null;
zip?: string | null;

providerTypes?: string[];
paymentsAccepted?: string[];

serviceKeywords?: string[];

dispatch247?: boolean;
emergencyRoadside?: boolean;

hoursSimple?: HoursSimple | null;

geo?: { lat: number; lng: number; geohash: string } | null;

employees?: LocationEmployeeAssignment[] | null;

updatedAt?: any;
createdAt?: any;

accountId?: string; // stored on businessProfiles already per your create flow
};

function normZip(s: string) {
const digits = (s || "").replace(/\D/g, "");
return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function toggle(list: string[], value: string, set: (v: string[]) => void) {
set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
}

function cleanHours(hours: HoursSimple): HoursSimple {
return {
mon: String(hours?.mon || "").trim(),
tue: String(hours?.tue || "").trim(),
wed: String(hours?.wed || "").trim(),
thu: String(hours?.thu || "").trim(),
fri: String(hours?.fri || "").trim(),
sat: String(hours?.sat || "").trim(),
sun: String(hours?.sun || "").trim(),
};
}

function anyHours(hours: HoursSimple) {
return Object.values(cleanHours(hours)).some((v) => !!v);
}

function uniqueStrings(list: string[]) {
const out: string[] = [];
for (const raw of list || []) {
const v = String(raw || "").trim();
if (!v) continue;
if (!out.includes(v)) out.push(v);
}
return out;
}

function uniqueCleanKeywords(list: string[]) {
// Only allow keywords from the catalog AND ensure uniqueness
const catalog = uniqueStrings(SERVICE_KEYWORDS as unknown as string[]);
const allowed = new Set<string>(catalog);

const out: string[] = [];
for (const raw of list || []) {
const v = String(raw || "").trim();
if (!v) continue;
if (!allowed.has(v)) continue;
if (!out.includes(v)) out.push(v);
}
return out;
}

export default function LocationProfileForm({ locationId }: Props) {
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);

const [err, setErr] = useState<string | null>(null);
const [ok, setOk] = useState<string | null>(null);

// needed to find the location doc
const [accountId, setAccountId] = useState<string>("");

// form fields
const [locationName, setLocationName] = useState("");
const [companyName, setCompanyName] = useState("");
const [companyPhone, setCompanyPhone] = useState("");
const [companyAddress, setCompanyAddress] = useState("");
const [city, setCity] = useState("");
const [stateCode, setStateCode] = useState("");
const [zip, setZip] = useState("");

const [providerTypes, setProviderTypes] = useState<string[]>([]);
const [paymentsAccepted, setPaymentsAccepted] = useState<string[]>([]);

// keywords per location
const [serviceKeywords, setServiceKeywords] = useState<ServiceKeyword[]>([]);
const [keywordFilter, setKeywordFilter] = useState("");

const [dispatch247, setDispatch247] = useState(false);
const [emergencyRoadside, setEmergencyRoadside] = useState(false);

const [hours, setHours] = useState<HoursSimple>({
mon: "",
tue: "",
wed: "",
thu: "",
fri: "",
sat: "",
sun: "",
});

const [geoPreview, setGeoPreview] = useState<{ lat: number; lng: number } | null>(null);

// employees (from provider)
const [providerEmployees, setProviderEmployees] = useState<Employee[]>([]);
const [assigned, setAssigned] = useState<LocationEmployeeAssignment[]>([]);

// ✅ dedup catalog to avoid "same key" warnings if catalog accidentally contains duplicates
const catalogKeywords = useMemo(() => {
return uniqueStrings(SERVICE_KEYWORDS as unknown as string[]) as unknown as ServiceKeyword[];
}, []);

// LOAD
useEffect(() => {
let unsubEmployees: (() => void) | null = null;

(async () => {
setLoading(true);
setErr(null);
setOk(null);

try {
// 1) businessProfiles/{locationId} holds accountId
const bpSnap = await getDoc(doc(db, "businessProfiles", locationId));
const bp = bpSnap.exists() ? (bpSnap.data() as any) : null;
const acc = String(bp?.accountId || "");
if (!acc) throw new Error("This location is missing accountId (businessProfiles/{locationId}).");

setAccountId(acc);

// 2) load location doc
const locSnap = await getDoc(doc(db, "providerAccounts", acc, "locations", locationId));
if (!locSnap.exists()) throw new Error("Location not found under providerAccounts.");

const data = locSnap.data() as LocationDoc;

setLocationName(String(data.locationName || ""));
setCompanyName(String(data.companyName || ""));
setCompanyPhone(String(data.companyPhone || ""));
setCompanyAddress(String(data.companyAddress || ""));
setCity(String(data.city || ""));
setStateCode(String(data.state || ""));
setZip(String(data.zip || ""));

setProviderTypes(Array.isArray(data.providerTypes) ? data.providerTypes : []);
setPaymentsAccepted(Array.isArray(data.paymentsAccepted) ? data.paymentsAccepted : []);

const loadedKeywords = Array.isArray((data as any)?.serviceKeywords) ? ((data as any).serviceKeywords as string[]) : [];
setServiceKeywords(uniqueCleanKeywords(loadedKeywords) as ServiceKeyword[]);

setDispatch247(!!data.dispatch247);
setEmergencyRoadside(!!data.emergencyRoadside);

setHours((data.hoursSimple as any) || { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" });

if ((data as any)?.geo?.lat && (data as any)?.geo?.lng) {
setGeoPreview({ lat: Number((data as any).geo.lat), lng: Number((data as any).geo.lng) });
} else {
setGeoPreview(null);
}

setAssigned(Array.isArray(data.employees) ? (data.employees as any) : []);

// 3) subscribe to provider employees list (providers/{accountId}/employees)
const qe = query(collection(db, "providers", acc, "employees"), orderBy("createdAt", "desc"));
unsubEmployees = onSnapshot(
qe,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Employee[];
const active = rows.filter((e) => e.active !== false);
active.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
setProviderEmployees(active);
},
() => setProviderEmployees([])
);
} catch (e: any) {
setErr(e?.message || "Failed to load location profile.");
} finally {
setLoading(false);
}
})();

return () => {
if (unsubEmployees) unsubEmployees();
};
}, [locationId]);

// VALIDATION
const canSave = useMemo(() => {
if (!accountId) return false;

if (!companyName.trim()) return false;
if (!isValidUSPhone(companyPhone)) return false;
if (!companyAddress.trim()) return false;

if (!city.trim()) return false;
if (!stateCode.trim() || stateCode.trim().length !== 2) return false;
if (normZip(zip).length !== 5) return false;

if (!Array.isArray(providerTypes) || providerTypes.length === 0) return false;

return true;
}, [accountId, companyName, companyPhone, companyAddress, city, stateCode, zip, providerTypes]);

async function testGeocode() {
setErr(null);
setOk(null);

try {
const full = `${companyAddress}, ${city}, ${stateCode} ${normZip(zip)}`;
const r = await geocodeAddress(full);
setGeoPreview({ lat: r.lat, lng: r.lng });
setOk("Geocoded successfully ✅");
setTimeout(() => setOk(null), 2500);
} catch (e: any) {
setErr(e?.message || "Geocoding failed.");
}
}

function isAssigned(empId: string) {
return assigned.some((a) => a.employeeId === empId);
}

function toggleAssign(empId: string) {
setAssigned((prev) => {
if (prev.some((a) => a.employeeId === empId)) return prev.filter((a) => a.employeeId !== empId);
return [...prev, { employeeId: empId, role: "tech" }];
});
}

function setEmpRole(empId: string, role: LocationEmployeeRole) {
setAssigned((prev) => prev.map((a) => (a.employeeId === empId ? { ...a, role } : a)));
}

function toggleKeyword(k: ServiceKeyword) {
setServiceKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
}

const filteredKeywords = useMemo(() => {
const q = keywordFilter.trim().toLowerCase();
if (!q) return catalogKeywords;
return catalogKeywords.filter((k) => String(k).toLowerCase().includes(q));
}, [keywordFilter, catalogKeywords]);

async function save() {
if (!canSave || !accountId) return;

setErr(null);
setOk(null);
setSaving(true);

try {
const normalizedPhone = normalizeUSPhone(companyPhone);

// geo: keep existing if present; otherwise geocode
let latLng = geoPreview;
if (!latLng) {
const full = `${companyAddress}, ${city}, ${stateCode} ${normZip(zip)}`;
const r = await geocodeAddress(full);
latLng = { lat: r.lat, lng: r.lng };
setGeoPreview(latLng);
}

const geohash = makeGeohash(latLng.lat, latLng.lng);

const cleaned = cleanHours(hours);
const storeHours = anyHours(cleaned) ? cleaned : null;

const cleanedAssigned = (assigned || [])
.filter((a) => a.employeeId)
.map((a) => ({
employeeId: String(a.employeeId),
role: (a.role || "tech") as LocationEmployeeRole,
}));

const cleanedKeywords = uniqueCleanKeywords(serviceKeywords as unknown as string[]);

const payload: Partial<LocationDoc> = {
locationName: locationName.trim() || null,

companyName: companyName.trim(),
companyPhone: normalizedPhone,
companyAddress: companyAddress.trim(),

city: city.trim(),
state: stateCode.trim().toUpperCase(),
zip: normZip(zip),

providerTypes: Array.isArray(providerTypes) ? providerTypes : [],
paymentsAccepted: Array.isArray(paymentsAccepted) ? paymentsAccepted : [],

serviceKeywords: cleanedKeywords,

dispatch247: !!dispatch247,
emergencyRoadside: !!emergencyRoadside,

hoursSimple: storeHours,

employees: cleanedAssigned.length ? cleanedAssigned : null,

geo: { lat: latLng.lat, lng: latLng.lng, geohash },

updatedAt: serverTimestamp(),
};

// 1) save location doc
await setDoc(doc(db, "providerAccounts", accountId, "locations", locationId), payload, { merge: true });

// 2) mirror directory doc
await setDoc(
doc(db, "businessProfiles", locationId),
{
accountId,
locationId,
providerUid: locationId,

companyName: companyName.trim(),
companyPhone: normalizedPhone,
companyAddress: companyAddress.trim(),

city: city.trim(),
state: stateCode.trim().toUpperCase(),
zip: normZip(zip),

providerTypes: Array.isArray(providerTypes) ? providerTypes : [],
paymentsAccepted: Array.isArray(paymentsAccepted) ? paymentsAccepted : [],

serviceKeywords: cleanedKeywords,

dispatch247: !!dispatch247,
emergencyRoadside: !!emergencyRoadside,

hoursSimple: storeHours,

geo: { lat: latLng.lat, lng: latLng.lng, geohash },

updatedAt: serverTimestamp(),
},
{ merge: true }
);

setOk("Saved ✅");
setTimeout(() => setOk(null), 2500);
} catch (e: any) {
setErr(e?.message || "Failed to save.");
} finally {
setSaving(false);
}
}

if (loading) {
return <div className="border border-gray-200 rounded-2xl p-6 text-gray-700">Loading…</div>;
}

return (
<div className="space-y-4">
{err ? (
<div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{ok ? <div className="border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">{ok}</div> : null}

<div className="border border-gray-200 rounded-2xl p-6 space-y-4">
<div className="text-sm font-semibold text-gray-900">Location</div>

<div className="grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Location Name (optional)</label>
<input className="border rounded-lg p-2 w-full" value={locationName} onChange={(e) => setLocationName(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Company Name *</label>
<input className="border rounded-lg p-2 w-full" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={saving} />
</div>
</div>

<PhoneInput label="Company Phone *" required value={companyPhone} onChange={setCompanyPhone} disabled={saving} />

<div>
<label className="block text-sm font-medium mb-1">Street Address *</label>
<input className="border rounded-lg p-2 w-full" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} disabled={saving} />
</div>

<div className="grid md:grid-cols-3 gap-3">
<div>
<label className="block text-sm font-medium mb-1">City *</label>
<input className="border rounded-lg p-2 w-full" value={city} onChange={(e) => setCity(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">State *</label>
<input className="border rounded-lg p-2 w-full" value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} maxLength={2} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">ZIP *</label>
<input className="border rounded-lg p-2 w-full" value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" disabled={saving} />
</div>
</div>

<div className="flex items-center gap-2">
<button className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-50" onClick={testGeocode} disabled={saving} type="button">
Test Geocode
</button>

<div className="text-xs text-gray-600">
{geoPreview ? `Lat ${geoPreview.lat.toFixed(5)}, Lng ${geoPreview.lng.toFixed(5)}` : "No geo preview yet."}
</div>
</div>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input type="checkbox" checked={dispatch247} onChange={() => setDispatch247((v) => !v)} disabled={saving} />
<span className="text-sm">24/7 Dispatch (this location)</span>
</label>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input type="checkbox" checked={emergencyRoadside} onChange={() => setEmergencyRoadside((v) => !v)} disabled={saving} />
<span className="text-sm">Emergency Roadside Assistance (this location)</span>
</label>
</div>

<div className="border border-gray-200 rounded-2xl p-6 space-y-3">
<div className="text-sm font-semibold text-gray-900">Services (Provider Types) *</div>
<div className="grid md:grid-cols-2 gap-2">
{PROVIDER_TYPES.map((t) => {
const checked = providerTypes.includes(t);
return (
<label key={`ptype:${t}`} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
<input type="checkbox" checked={checked} onChange={() => toggle(providerTypes, t, setProviderTypes)} disabled={saving} />
<span className="text-sm">{t}</span>
</label>
);
})}
</div>
</div>

<div className="border border-gray-200 rounded-2xl p-6 space-y-3">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-sm font-semibold text-gray-900">Service Keywords (what you offer)</div>
<div className="text-xs text-gray-600 mt-1">These help matching + directory filtering. Select as many as apply to this location.</div>
</div>
<div className="text-xs text-gray-600">
Selected: <b>{serviceKeywords.length}</b>
</div>
</div>

<input
className="border rounded-lg p-2 w-full"
value={keywordFilter}
onChange={(e) => setKeywordFilter(e.target.value)}
placeholder="Search keywords… (ex: tires, towing, diagnostics)"
disabled={saving}
/>

<div className="grid md:grid-cols-2 gap-2 max-h-[320px] overflow-auto border rounded-xl p-3">
{filteredKeywords.map((k, idx) => {
const checked = serviceKeywords.includes(k);
return (
<label key={`kw:${String(k)}:${idx}`} className="flex items-center gap-2 text-sm">
<input type="checkbox" checked={checked} onChange={() => toggleKeyword(k)} disabled={saving} />
<span>{k}</span>
</label>
);
})}
</div>
</div>

<div className="border border-gray-200 rounded-2xl p-6 space-y-3">
<div className="text-sm font-semibold text-gray-900">Payments Accepted</div>
<div className="grid md:grid-cols-3 gap-2">
{PAYMENT_TYPES.map((p) => {
const checked = paymentsAccepted.includes(p);
return (
<label key={`pay:${p}`} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
<input type="checkbox" checked={checked} onChange={() => toggle(paymentsAccepted, p, setPaymentsAccepted)} disabled={saving} />
<span className="text-sm">{p}</span>
</label>
);
})}
</div>
</div>

<HoursEditorGrouped
value={hours}
onChange={setHours}
disabled={saving}
title="Hours of Operation (this location)"
subtitle={
<>
Use any format (example: <b>8am - 6pm</b>, <b>24 hours</b>, <b>Closed</b>).
</>
}
/>

<div className="border border-gray-200 rounded-2xl p-6 space-y-3">
<div className="text-sm font-semibold text-gray-900">Employees Assigned to This Location</div>
<div className="text-xs text-gray-600">Pick employees and set their role for this location.</div>

{providerEmployees.length === 0 ? (
<div className="text-sm text-gray-600">No employees found.</div>
) : (
<div className="space-y-2">
{providerEmployees.map((e) => {
const checked = isAssigned(e.id);
const assignment = assigned.find((a) => a.employeeId === e.id);
const roleVal = (assignment?.role || "tech") as LocationEmployeeRole;

return (
<div key={`emp:${e.id}`} className="border rounded-xl p-3">
<div className="flex items-center gap-3">
<label className="flex items-center gap-2">
<input type="checkbox" checked={checked} onChange={() => toggleAssign(e.id)} disabled={saving} />
<span className="text-sm font-medium">{e.name || e.id}</span>
</label>

<div className="ml-auto flex items-center gap-2">
<select
className="border rounded-lg p-2 text-sm disabled:bg-gray-50"
value={roleVal}
onChange={(ev) => setEmpRole(e.id, ev.target.value as LocationEmployeeRole)}
disabled={saving || !checked}
>
<option value="tech">Tech</option>
<option value="dispatcher">Dispatcher</option>
<option value="manager">Manager</option>
<option value="owner">Owner</option>
<option value="other">Other</option>
</select>
</div>
</div>

<div className="text-xs text-gray-600 mt-1">
{e.email ? <span>{e.email}</span> : null}
{e.email && e.phone ? <span> • </span> : null}
{e.phone ? <span>{e.phone}</span> : null}
{e.role ? <span>{` • Provider role: ${e.role}`}</span> : null}
</div>
</div>
);
})}
</div>
)}
</div>

<button onClick={save} disabled={saving || !canSave} className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50">
{saving ? "Saving…" : "Save Location Profile"}
</button>

{!canSave ? (
<div className="text-xs text-gray-500">To save: name, phone, address, city, state, zip, and at least 1 provider type are required.</div>
) : null}
</div>
);
}

