// components/ProviderLocationsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
addDoc,
collection,
deleteDoc,
doc,
getDoc,
onSnapshot,
orderBy,
query,
serverTimestamp,
setDoc,
} from "firebase/firestore";
import { geohashForLocation } from "geofire-common";

import { db } from "@/lib/firebase";
import { geocodeAddress } from "@/lib/geocode";
import { PROVIDER_TYPES, PAYMENT_TYPES } from "@/lib/providerConstants";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";
import HoursEditorGrouped, { Hours as HoursSimple } from "@/components/HoursEditorGrouped";
import { SERVICE_KEYWORDS, type ServiceKeyword } from "@/lib/SharedProviderCatalog";

type Props = {
accountId: string; // Option A: providerUid is accountId
readOnly?: boolean;
};

type LocationDoc = {
id: string;
locationName?: string | null;

companyName?: string | null;
companyPhone?: string | null;
companyAddress?: string | null;

city?: string | null;
state?: string | null;
zip?: string | null;

providerTypes?: string[];
paymentsAccepted?: string[];

// ✅ keywords / services offered
serviceKeywords?: string[];

dispatch247?: boolean;
emergencyRoadside?: boolean;

hoursSimple?: HoursSimple | null;

geo?: { lat: number; lng: number; geohash: string } | null;

updatedAt?: any;
createdAt?: any;
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

function hasAnyHours(hours: HoursSimple) {
return Object.values(cleanHours(hours)).some((v) => !!v);
}

// ✅ Dedup helper (fixes: "Encountered two children with the same key")
function uniqueStrings(list: string[]) {
const out: string[] = [];
const seen = new Set<string>();
for (const raw of list || []) {
const v = String(raw || "").trim();
if (!v) continue;
if (seen.has(v)) continue;
seen.add(v);
out.push(v);
}
return out;
}

function uniqueCleanKeywords(list: string[]) {
// Only allow keywords from the catalog AND ensure uniqueness
const catalog = uniqueStrings(SERVICE_KEYWORDS as unknown as string[]);
const allowed = new Set<string>(catalog);

const out: string[] = [];
const seen = new Set<string>();

for (const raw of list || []) {
const v = String(raw || "").trim();
if (!v) continue;
if (!allowed.has(v)) continue;
if (seen.has(v)) continue;
seen.add(v);
out.push(v);
}
return out;
}

export default function ProviderLocationsTab({ accountId, readOnly }: Props) {
const router = useRouter();

const [loading, setLoading] = useState(true);
const [rows, setRows] = useState<LocationDoc[]>([]);
const [err, setErr] = useState<string | null>(null);

// create form
const [creating, setCreating] = useState(false);

const [locationName, setLocationName] = useState("");
const [companyName, setCompanyName] = useState("");
const [companyPhone, setCompanyPhone] = useState("");
const [companyAddress, setCompanyAddress] = useState("");
const [city, setCity] = useState("");
const [stateCode, setStateCode] = useState("");
const [zip, setZip] = useState("");

// per-location profile fields
const [providerTypes, setProviderTypes] = useState<string[]>([]);
const [paymentsAccepted, setPaymentsAccepted] = useState<string[]>([]);
const [dispatch247, setDispatch247] = useState(false);
const [emergencyRoadside, setEmergencyRoadside] = useState(false);

// ✅ keywords
const [serviceKeywords, setServiceKeywords] = useState<ServiceKeyword[]>([]);
const [keywordFilter, setKeywordFilter] = useState("");

// ✅ dedup the catalog once (prevents duplicate React keys even if catalog has duplicates)
const catalogKeywords = useMemo(() => {
return uniqueStrings(SERVICE_KEYWORDS as unknown as string[]) as unknown as ServiceKeyword[];
}, []);

// ✅ grouped hours for location creation
const [hours, setHours] = useState<HoursSimple>({
mon: "8am - 6pm",
tue: "8am - 6pm",
wed: "8am - 6pm",
thu: "8am - 6pm",
fri: "8am - 6pm",
sat: "8am - 6pm",
sun: "8am - 6pm",
});

useEffect(() => {
let unsub: (() => void) | null = null;

(async () => {
setLoading(true);
setErr(null);

try {
// ensure providerAccounts doc exists
const accRef = doc(db, "providerAccounts", accountId);
const accSnap = await getDoc(accRef);
if (!accSnap.exists()) {
await setDoc(
accRef,
{ ownerUid: accountId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
{ merge: true }
);
}

const q = query(collection(db, "providerAccounts", accountId, "locations"), orderBy("createdAt", "desc"));

unsub = onSnapshot(
q,
(snap) => {
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as LocationDoc[];
setRows(list);
setLoading(false);
},
(e) => {
setErr(e?.message || "Failed to load locations.");
setLoading(false);
}
);
} catch (e: any) {
setErr(e?.message || "Failed to init multi-location account.");
setLoading(false);
}
})();

return () => {
if (unsub) unsub();
};
}, [accountId]);

const canCreate = useMemo(() => {
if (readOnly) return false;
return (
!!companyName.trim() &&
isValidUSPhone(companyPhone) &&
!!companyAddress.trim() &&
!!city.trim() &&
stateCode.trim().length === 2 &&
normZip(zip).length === 5 &&
providerTypes.length > 0 &&
!creating
);
}, [companyName, companyPhone, companyAddress, city, stateCode, zip, providerTypes, creating, readOnly]);

// ✅ searchable keywords list
const filteredKeywords = useMemo(() => {
const q = keywordFilter.trim().toLowerCase();
if (!q) return catalogKeywords;
return catalogKeywords.filter((k) => String(k).toLowerCase().includes(q));
}, [keywordFilter, catalogKeywords]);

function toggleKeyword(k: ServiceKeyword) {
setServiceKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
}

async function createLocation() {
if (!canCreate) return;
setErr(null);
setCreating(true);

try {
const normalizedPhone = normalizeUSPhone(companyPhone);

const full = `${companyAddress}, ${city}, ${stateCode} ${normZip(zip)}`;
const r = await geocodeAddress(full);
const geohash = geohashForLocation([r.lat, r.lng]);

const cleaned = cleanHours(hours);
const storeHours = hasAnyHours(cleaned) ? cleaned : null;

// ✅ clean/unique keywords (prevents dupes being saved)
const cleanedKeywords = uniqueCleanKeywords(serviceKeywords as unknown as string[]);

// 1) create location under providerAccounts/{accountId}/locations
const locCol = collection(db, "providerAccounts", accountId, "locations");
const locRef = await addDoc(locCol, {
locationName: locationName.trim() || null,

companyName: companyName.trim(),
companyPhone: normalizedPhone,
companyAddress: companyAddress.trim(),

city: city.trim(),
state: stateCode.trim().toUpperCase(),
zip: normZip(zip),

providerTypes,
paymentsAccepted,

// ✅ keywords stored on location
serviceKeywords: cleanedKeywords,

dispatch247: !!dispatch247,
emergencyRoadside: !!emergencyRoadside,

hoursSimple: storeHours,

geo: { lat: r.lat, lng: r.lng, geohash },

accountId,
updatedAt: serverTimestamp(),
createdAt: serverTimestamp(),
});

const locationId = locRef.id;

// 2) create directory listing businessProfiles/{locationId}
await setDoc(
doc(db, "businessProfiles", locationId),
{
accountId,
locationId,

providerUid: locationId, // directory uses doc id for routing

companyName: companyName.trim(),
companyPhone: normalizedPhone,
companyAddress: companyAddress.trim(),

city: city.trim(),
state: stateCode.trim().toUpperCase(),
zip: normZip(zip),

providerTypes,
paymentsAccepted,

// ✅ keywords also stored on directory doc
serviceKeywords: cleanedKeywords,

dispatch247: !!dispatch247,
emergencyRoadside: !!emergencyRoadside,

hoursSimple: storeHours,

geo: { lat: r.lat, lng: r.lng, geohash },
updatedAt: serverTimestamp(),
},
{ merge: true }
);

// reset
setLocationName("");
setCompanyName("");
setCompanyPhone("");
setCompanyAddress("");
setCity("");
setStateCode("");
setZip("");

setProviderTypes([]);
setPaymentsAccepted([]);
setServiceKeywords([]);
setKeywordFilter("");
setDispatch247(false);
setEmergencyRoadside(false);

setHours({
mon: "8am - 6pm",
tue: "8am - 6pm",
wed: "8am - 6pm",
thu: "8am - 6pm",
fri: "8am - 6pm",
sat: "8am - 6pm",
sun: "8am - 6pm",
});
} catch (e: any) {
setErr(e?.message || "Failed to create location.");
} finally {
setCreating(false);
}
}

async function removeLocation(loc: LocationDoc) {
if (readOnly) return;
setErr(null);
try {
await deleteDoc(doc(db, "providerAccounts", accountId, "locations", loc.id));
await deleteDoc(doc(db, "businessProfiles", loc.id));
} catch (e: any) {
setErr(e?.message || "Failed to delete location.");
}
}

if (loading) {
return <div className="border border-gray-200 rounded-2xl p-6 text-gray-700">Loading locations…</div>;
}

return (
<div className="space-y-4">
{err ? (
<div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{/* CREATE */}
{!readOnly ? (
<div className="border border-gray-200 rounded-2xl p-6 space-y-3">
<div className="text-lg font-semibold">Add Location</div>

<div className="grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Location Name (optional)</label>
<input className="border rounded-lg p-2 w-full" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Company Name *</label>
<input className="border rounded-lg p-2 w-full" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
</div>
</div>

{/* ✅ PhoneInput ensures +1 formatting + validation */}
<PhoneInput label="Phone *" required value={companyPhone} onChange={setCompanyPhone} disabled={creating} />

<div className="grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Street Address *</label>
<input className="border rounded-lg p-2 w-full" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
</div>

<div>
<label className="block text-sm font-medium mb-1">City *</label>
<input className="border rounded-lg p-2 w-full" value={city} onChange={(e) => setCity(e.target.value)} />
</div>

<div>
<label className="block text-sm font-medium mb-1">State *</label>
<input
className="border rounded-lg p-2 w-full"
value={stateCode}
maxLength={2}
onChange={(e) => setStateCode(e.target.value.toUpperCase())}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">ZIP *</label>
<input className="border rounded-lg p-2 w-full" value={zip} inputMode="numeric" onChange={(e) => setZip(e.target.value)} />
</div>
</div>

{/* Provider types */}
<div className="border border-gray-200 rounded-xl p-4 space-y-3">
<div className="text-sm font-semibold">Services (Provider Types) *</div>
<div className="grid md:grid-cols-2 gap-2">
{PROVIDER_TYPES.map((t) => {
const checked = providerTypes.includes(t);
return (
<label key={`ptype:${t}`} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
<input type="checkbox" checked={checked} onChange={() => toggle(providerTypes, t, setProviderTypes)} />
<span className="text-sm">{t}</span>
</label>
);
})}
</div>
</div>

{/* ✅ Keywords (deduped catalog + unique keys) */}
<div className="border border-gray-200 rounded-xl p-4 space-y-3">
<div>
<div className="text-sm font-semibold">Service Keywords (optional)</div>
<div className="text-xs text-gray-600">These help customers match to this location.</div>
</div>

<input
className="border rounded-lg p-2 w-full"
value={keywordFilter}
onChange={(e) => setKeywordFilter(e.target.value)}
placeholder="Search keywords…"
disabled={creating}
/>

<div className="grid md:grid-cols-3 gap-2 max-h-[280px] overflow-auto">
{filteredKeywords.map((k, idx) => {
const checked = serviceKeywords.includes(k);
return (
<label
key={`kw:${String(k)}:${idx}`}
className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
>
<input type="checkbox" checked={checked} onChange={() => toggleKeyword(k)} />
<span className="text-sm">{k}</span>
</label>
);
})}
</div>
</div>

{/* Payments */}
<div className="border border-gray-200 rounded-xl p-4 space-y-3">
<div className="text-sm font-semibold">Payments Accepted</div>
<div className="grid md:grid-cols-3 gap-2">
{PAYMENT_TYPES.map((p) => {
const checked = paymentsAccepted.includes(p);
return (
<label key={`pay:${p}`} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
<input type="checkbox" checked={checked} onChange={() => toggle(paymentsAccepted, p, setPaymentsAccepted)} />
<span className="text-sm">{p}</span>
</label>
);
})}
</div>
</div>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input type="checkbox" checked={dispatch247} onChange={() => setDispatch247((v) => !v)} />
<span className="text-sm">24/7 Dispatch (this location)</span>
</label>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input type="checkbox" checked={emergencyRoadside} onChange={() => setEmergencyRoadside((v) => !v)} />
<span className="text-sm">Emergency Roadside Assistance (this location)</span>
</label>

<HoursEditorGrouped
value={hours}
onChange={setHours}
disabled={creating}
title="Hours of Operation (this location)"
subtitle={
<>
Use any format (example: <b>8am - 6pm</b>, <b>24 hours</b>, <b>Closed</b>).
</>
}
/>

<button
onClick={createLocation}
disabled={!canCreate}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{creating ? "Creating…" : "Create Location"}
</button>

<div className="text-xs text-gray-500">
This creates:
<br />
<b>providerAccounts/{"{accountId}"}/locations</b> and a matching <b>businessProfiles/{"{locationId}"}</b> directory entry.
</div>
</div>
) : null}

{/* LIST */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-lg font-semibold mb-3">Your Locations</div>

{rows.length === 0 ? (
<div className="text-sm text-gray-600">No locations yet.</div>
) : (
<div className="space-y-2">
{rows.map((r) => (
<div key={r.id} className="border rounded-xl p-3">
<div className="flex items-center gap-2">
<div className="font-medium">{r.locationName || r.companyName || "Location"}</div>

<div className="ml-auto flex items-center gap-2">
<button
className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50"
onClick={() => router.push(`/dashboard/provider/locations/${r.id}`)}
type="button"
>
Edit Profile
</button>

{!readOnly ? (
<button
className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50"
onClick={() => removeLocation(r)}
type="button"
>
Delete
</button>
) : null}
</div>
</div>

<div className="text-xs text-gray-600 mt-1">
{r.companyAddress || "—"} • {r.city || "—"}, {r.state || "—"} {r.zip || ""}
</div>

<div className="text-xs text-gray-500 mt-1">Directory profile id: {r.id}</div>

<div className="text-xs text-gray-500 mt-1">
<b>Types:</b> {(r.providerTypes || []).slice(0, 3).join(", ")}
{(r.providerTypes || []).length > 3 ? "…" : ""}
</div>

{(r.serviceKeywords || []).length ? (
<div className="text-xs text-gray-500 mt-1">
<b>Keywords:</b> {(r.serviceKeywords || []).slice(0, 6).join(", ")}
{(r.serviceKeywords || []).length > 6 ? "…" : ""}
</div>
) : (
<div className="text-xs text-gray-400 mt-1">
<b>Keywords:</b> — (none selected)
</div>
)}

{r.hoursSimple ? (
<div className="text-xs text-gray-500 mt-1">
<b>Hours:</b> {String(r.hoursSimple.mon || "").trim() ? `Mon ${r.hoursSimple.mon}` : "Saved"}
</div>
) : null}
</div>
))}
</div>
)}
</div>
</div>
);
}

