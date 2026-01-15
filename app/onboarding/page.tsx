// app/onboarding/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

type UserRole =
| "driver"
| "fleet"
| "repair_shop"
| "mobile_mechanic"
| "towing"
| "tire_shop"
| "mobile_tire"
| "roadside_tire_service"
| "truck_stop"
| "truck_parking"
| "truck_parts_store"
| "truck_wash"
| "reefer_trailer_repair";

const PROVIDER_ROLES: UserRole[] = [
"repair_shop",
"mobile_mechanic",
"towing",
"tire_shop",
"mobile_tire",
"roadside_tire_service",
"truck_stop",
"truck_parking",
"truck_parts_store",
"truck_wash",
"reefer_trailer_repair",
];

const SERVICES_OFFERED = [
"Roadside Assistance",
"Towing",
"Tire Shop",
"Roadside Tire Service",
"Truck Stops",
"Truck Parking",
"Truck Parts Store",
"Truck Wash",
"Reefer Trailer Repair",
] as const;

type ServiceOffered = (typeof SERVICES_OFFERED)[number];

// If you already have a geocode helper, replace this with your real function.
// Return { lat, lng } or null.
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
// NOTE: No-op fallback (keeps base optional). Replace with Google Maps/Places if you have it.
// Example: call your /api/geocode route, etc.
return null;
}

export default function OnboardingPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [role, setRole] = useState<UserRole | null>(null);
const [loading, setLoading] = useState(true);

const [phone, setPhone] = useState("");
const [addressText, setAddressText] = useState("");
const [travelRadiusMiles, setTravelRadiusMiles] = useState<number>(25);

// Base location is OPTIONAL now:
const [baseLat, setBaseLat] = useState<number | null>(null);
const [baseLng, setBaseLng] = useState<number | null>(null);

const [services, setServices] = useState<ServiceOffered[]>([]);
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);

const isProvider = useMemo(() => !!role && PROVIDER_ROLES.includes(role), [role]);

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (user) => {
setError(null);

if (!user) {
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

try {
const userSnap = await getDoc(doc(db, "users", user.uid));
const userData = userSnap.exists() ? (userSnap.data() as any) : null;
const r = (userData?.role as UserRole) ?? null;
setRole(r);

if (!r || !PROVIDER_ROLES.includes(r)) {
router.push("/dashboard");
return;
}

const profSnap = await getDoc(doc(db, "businessProfiles", user.uid));
if (profSnap.exists()) {
const p = profSnap.data() as any;
setPhone(typeof p?.phone === "string" ? p.phone : "");
setAddressText(typeof p?.addressText === "string" ? p.addressText : "");
setTravelRadiusMiles(typeof p?.travelRadiusMiles === "number" ? p.travelRadiusMiles : 25);
setBaseLat(typeof p?.baseLat === "number" ? p.baseLat : null);
setBaseLng(typeof p?.baseLng === "number" ? p.baseLng : null);
setServices(Array.isArray(p?.services) ? (p.services as ServiceOffered[]) : []);
}
} catch (e: any) {
setError(e?.message ?? "Failed to load onboarding.");
} finally {
setLoading(false);
}
});

return () => unsub();
}, [router]);

async function useCurrentLocation() {
setError(null);
if (!navigator.geolocation) {
setError("Geolocation not supported on this device/browser.");
return;
}
navigator.geolocation.getCurrentPosition(
(pos) => {
setBaseLat(pos.coords.latitude);
setBaseLng(pos.coords.longitude);
},
(err) => {
setError(err?.message ?? "Could not get location.");
},
{ enableHighAccuracy: true, timeout: 10000 }
);
}

function toggleService(s: ServiceOffered) {
setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
}

async function save() {
setError(null);

if (!uid) return;
if (!isProvider) {
setError("Not a provider account.");
return;
}

const hasPhone = phone.trim().length > 0;
const hasAddress = addressText.trim().length > 0;
const hasServices = services.length > 0;

if (!hasPhone || !hasAddress || !hasServices) {
setError("Phone, Business Address, and at least 1 Service are required.");
return;
}

setSaving(true);
try {
// Base location fallback: if user didn't choose baseLat/baseLng,
// attempt to geocode business address (optional).
let finalBaseLat = baseLat;
let finalBaseLng = baseLng;

if (finalBaseLat === null || finalBaseLng === null) {
const geo = await geocodeAddress(addressText.trim());
if (geo) {
finalBaseLat = geo.lat;
finalBaseLng = geo.lng;
}
// If geo is null, we still save without baseLat/baseLng (optional),
// and your matching should treat address as base.
}

await setDoc(
doc(db, "businessProfiles", uid),
{
phone: phone.trim(),
addressText: addressText.trim(),
travelRadiusMiles,
baseLat: finalBaseLat,
baseLng: finalBaseLng,
services,
updatedAt: serverTimestamp(),
},
{ merge: true }
);

router.push("/dashboard");
} catch (e: any) {
setError(e?.message ?? "Save failed.");
} finally {
setSaving(false);
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-lg border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-lg border border-gray-200 rounded-2xl p-8">
<h1 className="text-3xl font-bold text-gray-900 mb-2">Provider Onboarding</h1>
<p className="text-gray-600 mb-6">Complete your profile to receive jobs.</p>

{error && (
<div className="border border-red-200 bg-red-50 rounded-xl p-4 mb-4 text-sm text-red-800">
{error}
</div>
)}

<label className="block text-sm font-medium text-gray-800 mb-1">Phone number (required)</label>
<input
value={phone}
onChange={(e) => setPhone(e.target.value)}
className="w-full border border-gray-300 rounded-lg p-3 mb-4"
placeholder="e.g. 2155551234"
/>
<div className="text-xs text-gray-500 -mt-3 mb-4">This will show on your public provider profile.</div>

<label className="block text-sm font-medium text-gray-800 mb-1">Business address (required)</label>
<input
value={addressText}
onChange={(e) => setAddressText(e.target.value)}
className="w-full border border-gray-300 rounded-lg p-3 mb-4"
placeholder="Street, City, State ZIP"
/>
<div className="text-xs text-gray-500 -mt-3 mb-6">This is what customers will see on your profile.</div>

<div className="border border-gray-200 rounded-xl p-4 mb-6">
<div className="font-semibold text-gray-900 mb-1">Service Base Location (optional)</div>
<div className="text-sm text-gray-600 mb-3">
If you don’t select a base location, we’ll use your business address as the service base.
</div>

<button
type="button"
onClick={useCurrentLocation}
className="bg-black text-white rounded-lg px-4 py-2 font-medium hover:opacity-90"
>
Use Current Location
</button>

<div className="text-sm text-gray-700 mt-3">
Lat: {baseLat ?? "—"} <br />
Lng: {baseLng ?? "—"}
</div>
</div>

<label className="block text-sm font-medium text-gray-800 mb-2">Services Offered (required)</label>
<div className="grid grid-cols-2 gap-2 mb-6">
{SERVICES_OFFERED.map((s) => (
<button
key={s}
type="button"
onClick={() => toggleService(s)}
className={[
"border rounded-lg px-3 py-2 text-sm text-left",
services.includes(s) ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-300",
].join(" ")}
>
{s}
</button>
))}
</div>

<label className="block text-sm font-medium text-gray-800 mb-2">Travel radius (miles)</label>
<input
type="number"
value={travelRadiusMiles}
onChange={(e) => setTravelRadiusMiles(Number(e.target.value))}
className="w-full border border-gray-300 rounded-lg p-3 mb-6"
min={1}
max={300}
/>

<button
onClick={save}
disabled={saving}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-60"
>
{saving ? "Saving…" : "Save Profile"}
</button>
</div>
</main>
);
}

