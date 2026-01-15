// app/requests/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
getDocs,
limit,
query,
serverTimestamp,
where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import {
PROVIDER_TYPES,
type ProviderType,
COMMON_SERVICES_BY_TYPE,
type ServiceKeyword,
} from "@/lib/SharedProviderCatalog";

import PhoneInput, {
isValidUSPhone,
normalizeUSPhone,
} from "@/components/PhoneInput";

import { geocodeAddress } from "@/lib/geocode";
import {
geohashQueryBounds,
distanceBetween,
} from "geofire-common";

type ProviderRow = {
id: string; // businessProfiles doc id (locationId)
companyName?: string;
companyPhone?: string;
companyAddress?: string;
city?: string;
state?: string;
zip?: string;

providerTypes?: string[];
serviceKeywords?: string[];

geo?: { lat: number; lng: number; geohash: string } | null;
};

type EmployeeRow = {
id: string; // employee doc id
employeeNumber?: string | null;
name?: string | null;
email?: string | null;
phone?: string | null;
role?: string | null;
active?: boolean;
};

type FleetUnitRow = {
id: string; // unit doc id
truckNumber?: string | null;
trailerNumber?: string | null;
year?: string | number | null;
make?: string | null;
model?: string | null;
vin?: string | null;
plate?: string | null;
color?: string | null;
};

function clean(s: string) {
return (s || "").trim();
}

export default function NewRequestPage() {
const router = useRouter();
const sp = useSearchParams();

const preselectedProviderId = sp.get("provider") || "";

const [uid, setUid] = useState<string | null>(null);
const [loadingAuth, setLoadingAuth] = useState(true);

// Provider selection
const [providerType, setProviderType] = useState<ProviderType>("Mobile Truck Repair");
const [selectedService, setSelectedService] = useState<ServiceKeyword | "">("");
const [manualService, setManualService] = useState("");

const suggestedServices = useMemo(() => {
return COMMON_SERVICES_BY_TYPE[providerType] || [];
}, [providerType]);

// Provider dropdown (location-based)
const [providers, setProviders] = useState<ProviderRow[]>([]);
const [providersLoading, setProvidersLoading] = useState(false);
const [providersHint, setProvidersHint] = useState<string>("Enter pickup address to load nearby providers.");
const [providerId, setProviderId] = useState(preselectedProviderId);

// Customer-side lists (Fleet/Company accounts)
const [employees, setEmployees] = useState<EmployeeRow[]>([]);
const [employeeId, setEmployeeId] = useState("");

const [fleetUnits, setFleetUnits] = useState<FleetUnitRow[]>([]);
const [fleetUnitId, setFleetUnitId] = useState("");

// Request details (dispatch-like)
const [title, setTitle] = useState("");
const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");

const [pickupAddress, setPickupAddress] = useState("");
const [tow, setTow] = useState(false);
const [dropoffAddress, setDropoffAddress] = useState("");
const [trailer, setTrailer] = useState("");
const [vehicle, setVehicle] = useState("");
const [notes, setNotes] = useState("");

// Contacts
const [customerName, setCustomerName] = useState("");
const [customerPhone, setCustomerPhone] = useState(""); // MUST store +1

// Optional driver/employee contact
const [driverName, setDriverName] = useState("");
const [driverPhone, setDriverPhone] = useState(""); // MUST store +1

const [submitting, setSubmitting] = useState(false);
const [err, setErr] = useState<string | null>(null);

const chosenServiceText = useMemo(() => {
const manual = clean(manualService);
if (manual) return manual;
if (selectedService) return selectedService;
return "";
}, [manualService, selectedService]);

const canSubmit = useMemo(() => {
if (!uid) return false;
if (!providerType) return false;

const pickup = clean(pickupAddress);
if (!pickup || pickup.length < 6) return false;

if (tow) {
const drop = clean(dropoffAddress);
if (!drop || drop.length < 6) return false;
}

if (!chosenServiceText) return false;

// Phone validation optional. If entered, must be valid.
if (clean(customerPhone) && !isValidUSPhone(customerPhone)) return false;
if (clean(driverPhone) && !isValidUSPhone(driverPhone)) return false;

if (submitting) return false;
return true;
}, [
uid,
providerType,
pickupAddress,
tow,
dropoffAddress,
chosenServiceText,
customerPhone,
driverPhone,
submitting,
]);

// Auth
useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => {
if (!u) {
router.replace("/auth/sign-in");
return;
}
setUid(u.uid);
setLoadingAuth(false);
});
return () => unsub();
}, [router]);

// Load employees + fleet units for customer
// ✅ aligns to rules:
// /customerProfiles/{uid}/employees/{empId}
// /customerProfiles/{uid}/fleetUnits/{unitId}
useEffect(() => {
if (!uid) return;
let cancelled = false;

async function loadCustomerLists() {
try {
const empSnap = await getDocs(collection(db, "customerProfiles", uid, "employees"));
const rows = empSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EmployeeRow[];
const active = rows.filter((e) => e.active !== false);
active.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
if (!cancelled) setEmployees(active);
} catch {
if (!cancelled) setEmployees([]);
}

try {
// ✅ FIXED: fleetUnits (matches dashboard)
const fleetSnap = await getDocs(collection(db, "customerProfiles", uid, "fleetUnits"));
const rows = fleetSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FleetUnitRow[];
if (!cancelled) setFleetUnits(rows);
} catch {
if (!cancelled) setFleetUnits([]);
}
}

loadCustomerLists();
return () => {
cancelled = true;
};
}, [uid]);

// If customer picks an employee (driver), populate optional fields
useEffect(() => {
if (!employeeId) return;
const e = employees.find((x) => x.id === employeeId);
if (!e) return;

setDriverName(String(e.name || ""));
setDriverPhone(String(e.phone || ""));
}, [employeeId, employees]);

// ✅ LOCATION-BASED PROVIDER LOADING
// - Requires pickupAddress
// - Geocode pickup
// - Query businessProfiles by geo.geohash bounds
// - Filter in-app by distance and providerType
useEffect(() => {
let cancelled = false;
let timer: any = null;

async function loadProvidersNearby() {
const pickup = clean(pickupAddress);

// Don’t load until pickup looks real
if (pickup.length < 10) {
setProviders([]);
setProvidersHint("Enter pickup address to load nearby providers.");
setProvidersLoading(false);
// Keep providerId if preselected; otherwise clear
setProviderId((prev) => (preselectedProviderId ? preselectedProviderId : prev));
return;
}

setProvidersLoading(true);
setProvidersHint("Finding nearby providers…");

try {
const geo = await geocodeAddress(pickup);
const center: [number, number] = [geo.lat, geo.lng];

// radius: 50 miles (~80km) in meters
const radiusM = 50 * 1609.34;

const bounds = geohashQueryBounds(center, radiusM);

const seen = new Set<string>();
const all: ProviderRow[] = [];

// Run each bound query
for (const b of bounds) {
const q1 = query(
collection(db, "businessProfiles"),
where("geo.geohash", ">=", b[0]),
where("geo.geohash", "<=", b[1]),
limit(75)
);

const snap = await getDocs(q1);
for (const d of snap.docs) {
if (seen.has(d.id)) continue;
seen.add(d.id);

const row = { id: d.id, ...(d.data() as any) } as ProviderRow;

// Must have geo
const lat = Number(row?.geo?.lat);
const lng = Number(row?.geo?.lng);
if (!isFinite(lat) || !isFinite(lng)) continue;

// Filter by distance (km)
const km = distanceBetween(center, [lat, lng]);
const miles = km * 0.621371;
if (miles > 50) continue;

// Filter by providerType client-side (avoids composite index needs)
const types = Array.isArray(row.providerTypes) ? row.providerTypes : [];
if (!types.includes(providerType)) continue;

all.push(row);
}
}

// Sort by distance closest first
all.sort((a, b) => {
const akm = distanceBetween(center, [Number(a.geo?.lat), Number(a.geo?.lng)]);
const bkm = distanceBetween(center, [Number(b.geo?.lat), Number(b.geo?.lng)]);
return akm - bkm;
});

if (!cancelled) {
setProviders(all);
setProvidersHint(all.length ? `${all.length} nearby provider(s) found.` : "No nearby providers found. Leave blank for open request.");
setProvidersLoading(false);

// If the selected provider is no longer in the list (and it was not preselected), clear it.
setProviderId((prev) => {
if (!prev) return "";
if (preselectedProviderId && prev === preselectedProviderId) return prev;
const exists = all.some((p) => p.id === prev);
return exists ? prev : "";
});
}
} catch {
if (!cancelled) {
setProviders([]);
setProvidersHint("Could not geocode pickup address. Leave provider blank (open request) or refine address.");
setProvidersLoading(false);
if (!preselectedProviderId) setProviderId("");
}
}
}

// debounce so we don't geocode every keystroke
timer = setTimeout(loadProvidersNearby, 700);

return () => {
cancelled = true;
if (timer) clearTimeout(timer);
};
}, [pickupAddress, providerType, preselectedProviderId]);

async function createRequest() {
if (!uid) return;

setErr(null);

const pickup = clean(pickupAddress);
if (pickup.length < 6) return setErr("Please enter a valid pickup / service address.");

if (tow) {
const drop = clean(dropoffAddress);
if (drop.length < 6) return setErr("Please enter a valid dropoff address (required for towing).");
}

const serviceText = chosenServiceText;
if (!serviceText) return setErr("Select a suggested service or type what you need.");

// Normalize phones for Twilio (+1XXXXXXXXXX) if present
const normalizedCustomerPhone = clean(customerPhone) ? normalizeUSPhone(customerPhone) : null;
const normalizedDriverPhone = clean(driverPhone) ? normalizeUSPhone(driverPhone) : null;

setSubmitting(true);
try {
const payload: any = {
createdByUid: uid,
customerUid: uid,

status: "open",
providerId: providerId || null, // if chosen, direct it; otherwise marketplace

acceptedBidId: null,
acceptedAt: null,

providerType,
serviceKeyword: selectedService || null,
serviceText: serviceText,

title: clean(title) || `${providerType} - ${serviceText}`,
priority,

pickupAddress: pickup,
dropoffAddress: tow ? clean(dropoffAddress) : null,
tow: !!tow,
trailer: tow ? (clean(trailer) || null) : null,

vehicle: clean(vehicle) || null,
notes: clean(notes) || null,

customerName: clean(customerName) || null,
customerPhone: normalizedCustomerPhone,

driverName: clean(driverName) || null,
driverPhone: normalizedDriverPhone,

fleetUnitId: fleetUnitId || null,
employeeId: employeeId || null,

// legacy compatibility
issueType: providerType,
addressText: pickup,
addressFormatted: pickup,
locationText: pickup,
assignedToUid: null,

createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
};

const ref = await addDoc(collection(db, "roadsideRequests"), payload);
router.push(`/requests/${ref.id}`);
} catch (e: any) {
setErr(e?.message || "Failed to create request.");
setSubmitting(false);
}
}

if (loadingAuth) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto border border-gray-200 rounded-2xl p-8">
<div className="flex items-start justify-between gap-3">
<div>
<h1 className="text-2xl font-bold">Create Request</h1>
<p className="text-sm text-gray-600 mt-1">
Choose a provider type, pick a suggested service (or type your own), then select a provider (optional).
</p>
</div>
<button
type="button"
onClick={() => router.back()}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
</div>

{err ? (
<div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{err}</div>
) : null}

{/* PROVIDER TYPE + SERVICE */}
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Service</div>

<div className="mt-3">
<label className="text-sm font-medium">Provider Type</label>
<select
value={providerType}
onChange={(e) => {
const next = e.target.value as ProviderType;
setProviderType(next);
setSelectedService("");
setManualService("");
setProviderId(preselectedProviderId || "");
}}
className="mt-1 w-full border rounded-lg px-3 py-2"
>
{PROVIDER_TYPES.map((t) => (
<option key={t} value={t}>
{t}
</option>
))}
</select>
</div>

<div className="mt-4">
<div className="text-sm font-medium">Suggested services (optional)</div>
<div className="text-xs text-gray-500 mt-1">Pick one below, or type exactly what you need.</div>

<div className="mt-2 flex flex-wrap gap-2">
{suggestedServices.map((s) => (
<button
key={s}
type="button"
onClick={() => {
setSelectedService(s);
setManualService("");
}}
className={`border rounded-full px-3 py-1 text-sm ${
selectedService === s ? "bg-black text-white" : "bg-white hover:bg-gray-50"
}`}
>
{s}
</button>
))}
</div>

<div className="mt-3">
<label className="text-sm font-medium">Or type what you need</label>
<input
value={manualService}
onChange={(e) => setManualService(e.target.value)}
placeholder="Example: ‘Starter replacement’ or ‘Blown tire on trailer’"
className="mt-1 w-full border rounded-lg px-3 py-2"
/>
<div className="text-xs text-gray-500 mt-1">
Selected: <b>{chosenServiceText || "—"}</b>
</div>
</div>
</div>

{/* PROVIDER LIST (LOCATION-BASED) */}
<div className="mt-4">
<label className="text-sm font-medium">Provider (optional — nearby only)</label>
<select
value={providerId}
onChange={(e) => setProviderId(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
disabled={providersLoading}
>
<option value="">No provider selected (open request)</option>
{providers.map((p) => (
<option key={p.id} value={p.id}>
{(p.companyName || "Provider")} — {String(p.city || "").trim() ? `${p.city}, ${p.state || ""}` : p.id.slice(0, 8)}
</option>
))}
</select>
<div className="text-xs text-gray-500 mt-1">{providersLoading ? "Loading nearby providers…" : providersHint}</div>
</div>
</div>

{/* REQUEST DETAILS */}
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Request Details</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="text-sm font-medium">Title</label>
<input
value={title}
onChange={(e) => setTitle(e.target.value)}
placeholder="Example: Tire change I-95"
className="mt-1 w-full border rounded-lg px-3 py-2"
/>
</div>

<div>
<label className="text-sm font-medium">Priority</label>
<select
value={priority}
onChange={(e) => setPriority(e.target.value as any)}
className="mt-1 w-full border rounded-lg px-3 py-2"
>
<option value="low">Low</option>
<option value="normal">Normal</option>
<option value="high">High</option>
</select>
</div>

<div className="md:col-span-2">
<label className="text-sm font-medium">Pickup / Service Location</label>
<input
value={pickupAddress}
onChange={(e) => setPickupAddress(e.target.value)}
placeholder="Example: 123 Main St, City, ST"
className="mt-1 w-full border rounded-lg px-3 py-2"
/>
<div className="text-xs text-gray-500 mt-1">
Provider dropdown will load nearby providers after you enter a real pickup address.
</div>
</div>

<div className="md:col-span-2 flex items-center gap-2">
<input
id="tow"
type="checkbox"
checked={tow}
onChange={(e) => setTow(e.target.checked)}
className="h-4 w-4"
/>
<label htmlFor="tow" className="text-sm font-medium">
Tow? (requires dropoff / trailer fields)
</label>
</div>

<div>
<label className="text-sm font-medium">Dropoff (optional unless Tow)</label>
<input
value={dropoffAddress}
onChange={(e) => setDropoffAddress(e.target.value)}
placeholder="Dropoff address"
className="mt-1 w-full border rounded-lg px-3 py-2"
disabled={!tow}
/>
</div>

<div>
<label className="text-sm font-medium">Trailer (optional)</label>
<input
value={trailer}
onChange={(e) => setTrailer(e.target.value)}
placeholder="Trailer info"
className="mt-1 w-full border rounded-lg px-3 py-2"
disabled={!tow}
/>
</div>

<div className="md:col-span-2">
<label className="text-sm font-medium">Vehicle</label>
<input
value={vehicle}
onChange={(e) => setVehicle(e.target.value)}
placeholder="Example: 2019 Freightliner"
className="mt-1 w-full border rounded-lg px-3 py-2"
/>
</div>

<div className="md:col-span-2">
<label className="text-sm font-medium">Notes (optional)</label>
<textarea
value={notes}
onChange={(e) => setNotes(e.target.value)}
placeholder="Add details for the provider…"
className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[90px]"
/>
</div>
</div>
</div>

{/* CONTACTS */}
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Contacts</div>
<p className="text-xs text-gray-500 mt-1">Phone fields are stored with +1 for Twilio.</p>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="text-sm font-medium">Customer / Dispatcher Name</label>
<input
value={customerName}
onChange={(e) => setCustomerName(e.target.value)}
placeholder="Customer name"
className="mt-1 w-full border rounded-lg px-3 py-2"
/>
</div>

<div>
<PhoneInput
label="Customer / Dispatcher Phone"
value={customerPhone}
onChange={setCustomerPhone}
disabled={submitting}
/>
</div>

<div className="md:col-span-2 border-t border-gray-100 pt-3">
<div className="text-sm font-semibold">Optional Driver/Employee Contact</div>
<p className="text-xs text-gray-500">Use this if the driver is different from the dispatcher/fleet.</p>
</div>

<div className="md:col-span-2">
<label className="text-sm font-medium">Existing Employees (optional)</label>
<select
value={employeeId}
onChange={(e) => setEmployeeId(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
>
<option value="">— Select employee —</option>
{employees.map((e) => (
<option key={e.id} value={e.id}>
{(e.name || "Employee")}
{e.role ? ` • ${e.role}` : ""}
{e.phone ? ` • ${e.phone}` : ""}
</option>
))}
</select>
</div>

<div>
<label className="text-sm font-medium">Driver/Employee Name (optional)</label>
<input
value={driverName}
onChange={(e) => setDriverName(e.target.value)}
placeholder="Driver name"
className="mt-1 w-full border rounded-lg px-3 py-2"
/>
</div>

<div>
<PhoneInput
label="Driver/Employee Phone (optional)"
value={driverPhone}
onChange={setDriverPhone}
disabled={submitting}
/>
</div>

<div className="md:col-span-2 border-t border-gray-100 pt-3">
<label className="text-sm font-medium">Fleet Unit (optional)</label>
<select
value={fleetUnitId}
onChange={(e) => setFleetUnitId(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
>
<option value="">— Select unit —</option>
{fleetUnits.map((u) => {
const label =
(u.truckNumber ? `Truck ${u.truckNumber}` : "") ||
(u.trailerNumber ? `Trailer ${u.trailerNumber}` : "") ||
(u.vin ? `VIN ${String(u.vin).slice(-6)}` : "") ||
u.id;

const extra = [u.year, u.make, u.model].filter(Boolean).join(" ");
return (
<option key={u.id} value={u.id}>
{label}{extra ? ` • ${extra}` : ""}
</option>
);
})}
</select>
<div className="text-xs text-gray-500 mt-1">
{fleetUnits.length ? "Pick a unit to link this request (optional)." : "No fleet units yet."}
</div>
</div>
</div>
</div>

{/* ACTIONS */}
<div className="mt-6 space-y-3">
<button
type="button"
disabled={!canSubmit}
onClick={createRequest}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{submitting ? "Creating…" : "Create Request"}
</button>
</div>

{!canSubmit ? (
<div className="text-xs text-gray-500 mt-3">
Required: pickup address + service selection. If you enter a phone, it must be valid and will be saved as +1XXXXXXXXXX.
</div>
) : null}
</div>
</main>
);
}