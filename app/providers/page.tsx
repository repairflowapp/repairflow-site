"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, limit, query, where, orderBy } from "firebase/firestore";
import { geohashQueryBounds, distanceBetween } from "geofire-common";

import { auth, db } from "@/lib/firebase";
import { geocodeAddress } from "@/lib/geocode";

const PROVIDER_TYPES = [
"Mobile Truck Repair",
"Mobile Truck Tires",
"Mobile Car Repair",
"Mobile Car Tires",

"Truck Repair Shops",
"Car Repair Shops",
"Trailer Repair Shops",
"Reefer Repair Shops",

"Truck Tire Shops",
"Car Tire Shops",

"Light Duty Towing Services",
"Heavy Duty Towing Services",

"Truck Stops",
"Truck Parts Stores",

"Locksmiths",

"Truck Dealer",
"Car Dealer",
"Trailer Dealer",

"Truck Wash",
"Car Glass Shops",
"Transmission Shops",
"Car Auto Parts Stores",
"Car Junkyards",
"Truck Junkyards",
] as const;

const PAYMENT_OPTIONS = [
"Cash",
"Credit/Debit",
"EFS",
"Comchek",
"T-Check",
"FleetOne",
"TCH",
"Zelle",
"Apple Pay",
"Google Pay",
"ACH",
"Net Terms",
] as const;

type ProviderType = (typeof PROVIDER_TYPES)[number];
type PaymentOption = (typeof PAYMENT_OPTIONS)[number];

type LocationMode = "citystate" | "zip" | "gps" | "address";

type Geo = { lat: number; lng: number; geohash: string };

type BusinessProfile = {
providerUid?: string;

companyName?: string | null;
companyPhone?: string | null;
companyAddress?: string | null;

city?: string | null;
state?: string | null;
zip?: string | null;

providerTypes?: string[];
paymentsAccepted?: string[];

dispatch247?: boolean;
emergencyRoadside?: boolean;

hours?: any;

ratingAvg?: number | null;
ratingCount?: number | null;

searchText?: string | null;
updatedAt?: any;

geo?: Geo | null;
};

type Row = BusinessProfile & {
id: string;
distanceMiles?: number;
};

function clean(s: string) {
return (s || "").trim();
}

function normState(s: string) {
const t = clean(s).toUpperCase();
return t.length === 2 ? t : t;
}

function normZip(s: string) {
const digits = (s || "").replace(/\D/g, "");
if (digits.length === 5) return digits;
if (digits.length === 9) return digits.slice(0, 5);
return "";
}

function titleCase(s: string) {
return (s || "")
.toLowerCase()
.replace(/\b\w/g, (c) => c.toUpperCase());
}

function makeNextUrl(path: string) {
return `/auth/sign-in?next=${encodeURIComponent(path)}`;
}

function shortAddress(p: Row) {
const line = [
p.city ? titleCase(p.city) : null,
p.state ? String(p.state).toUpperCase() : null,
p.zip ? String(p.zip) : null,
]
.filter(Boolean)
.join(", ");
return line || "—";
}

function milesToLabel(m?: number) {
if (m == null || !Number.isFinite(m)) return "—";
if (m < 1) return "< 1 mi";
return `${m.toFixed(1)} mi`;
}

function normalizePayments(arr?: string[]) {
if (!Array.isArray(arr)) return [];
return arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

export default function ProvidersDirectoryPage() {
const router = useRouter();

// Auth state (directory is PUBLIC; Request Service requires login)
const [authedUid, setAuthedUid] = useState<string | null>(null);

// Search inputs
const [locationMode, setLocationMode] = useState<LocationMode>("citystate");
const [city, setCity] = useState("");
const [stateCode, setStateCode] = useState("");
const [zip, setZip] = useState("");

// Address mode (typed)
const [addressText, setAddressText] = useState("");
const [addressCenter, setAddressCenter] = useState<{ lat: number; lng: number } | null>(null);
const [addressStatus, setAddressStatus] = useState<"idle" | "geocoding" | "ready" | "error">("idle");

// GPS params
const [gpsStatus, setGpsStatus] = useState<"idle" | "requesting" | "ready" | "denied" | "error">("idle");
const [gpsLatLng, setGpsLatLng] = useState<{ lat: number; lng: number } | null>(null);

// Shared radius for gps/address searches
const [radiusMiles, setRadiusMiles] = useState<number>(25);

const [providerType, setProviderType] = useState<ProviderType | "">("");
const [keyword, setKeyword] = useState("");

// Filters
const [minRating, setMinRating] = useState<number>(0);

// ✅ Payment multi-select
const [paymentTypes, setPaymentTypes] = useState<PaymentOption[]>([]);
const [payOpen, setPayOpen] = useState(false);

const [sortMode, setSortMode] = useState<"distance" | "rating">("distance");

// Results
const [loading, setLoading] = useState(false);
const [err, setErr] = useState<string | null>(null);
const [rows, setRows] = useState<Row[]>([]);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => setAuthedUid(u ? u.uid : null));
return () => unsub();
}, []);

function togglePayment(p: PaymentOption) {
setPaymentTypes((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
}

// Close payment dropdown on mode change/search start etc (simple)
useEffect(() => {
setPayOpen(false);
}, [locationMode, loading]);

const canSearch = useMemo(() => {
if (!providerType) return false;

if (locationMode === "citystate") return !!clean(city) && !!clean(stateCode);
if (locationMode === "zip") return !!normZip(zip);
if (locationMode === "gps") return !!gpsLatLng;
if (locationMode === "address") return !!addressCenter; // must be geocoded
return false;
}, [providerType, locationMode, city, stateCode, zip, gpsLatLng, addressCenter]);

const filtered = useMemo(() => {
const k = clean(keyword).toLowerCase();
let list = rows;

// keyword
if (k) {
list = list.filter((r) => {
const blob =
(r.searchText || "").toLowerCase() ||
[
r.companyName,
r.companyAddress,
r.city,
r.state,
r.zip,
...(Array.isArray(r.providerTypes) ? r.providerTypes : []),
...(Array.isArray(r.paymentsAccepted) ? r.paymentsAccepted : []),
]
.filter(Boolean)
.join(" ")
.toLowerCase();

return blob.includes(k);
});
}

// rating
if (minRating > 0) {
list = list.filter((r) => (r.ratingAvg ?? 0) >= minRating);
}

// ✅ payment multi-select (OR)
if (paymentTypes.length) {
const desired = paymentTypes.map((x) => String(x).trim().toLowerCase());
list = list.filter((r) => {
const accepts = normalizePayments(r.paymentsAccepted);
return desired.some((d) => accepts.includes(d));
});
}

// sort
if (sortMode === "distance") {
list = [...list].sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));
} else {
list = [...list].sort((a, b) => (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1));
}

return list;
}, [rows, keyword, minRating, paymentTypes, sortMode]);

function requestGPS() {
setErr(null);
setGpsStatus("requesting");

if (!navigator.geolocation) {
setGpsStatus("error");
setErr("Geolocation is not supported on this device/browser.");
return;
}

navigator.geolocation.getCurrentPosition(
(pos) => {
setGpsLatLng({ lat: pos.coords.latitude, lng: pos.coords.longitude });
setGpsStatus("ready");
},
(e) => {
if ((e as any)?.code === 1) setGpsStatus("denied");
else setGpsStatus("error");
setErr("Could not get your location. Please allow location permission or use City/State, ZIP, or Address.");
},
{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
);
}

async function geocodeTypedAddress() {
setErr(null);
const text = clean(addressText);
if (!text) {
setAddressCenter(null);
setAddressStatus("error");
setErr("Enter an address, city/state, or ZIP to geocode.");
return;
}

setAddressStatus("geocoding");
try {
const r = await geocodeAddress(text);
setAddressCenter({ lat: r.lat, lng: r.lng });
setAddressStatus("ready");
} catch (e: any) {
setAddressCenter(null);
setAddressStatus("error");
setErr(e?.message || "Failed to geocode address.");
}
}

async function runSearch() {
setErr(null);
if (!canSearch) return;

setLoading(true);
setRows([]);

try {
// City/State / ZIP search: simple exact match
if (locationMode === "citystate") {
const q = query(
collection(db, "businessProfiles"),
where("providerTypes", "array-contains", providerType),
where("city", "==", clean(city)),
where("state", "==", normState(stateCode)),
orderBy("updatedAt", "desc"),
limit(50)
);
const snap = await getDocs(q);
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Row[];
setRows(list);
return;
}

if (locationMode === "zip") {
const q = query(
collection(db, "businessProfiles"),
where("providerTypes", "array-contains", providerType),
where("zip", "==", normZip(zip)),
orderBy("updatedAt", "desc"),
limit(50)
);
const snap = await getDocs(q);
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Row[];
setRows(list);
return;
}

// Radius search (GPS or Address)
const center =
locationMode === "gps"
? gpsLatLng
: locationMode === "address"
? addressCenter
: null;

if (!center) throw new Error("Missing search center location.");

const centerTuple: [number, number] = [center.lat, center.lng];
const radiusInM = radiusMiles * 1609.34;

// Query geohash bounds. Requires: geo.geohash + geo.lat/lng stored on businessProfiles.
const bounds = geohashQueryBounds(centerTuple, radiusInM);

const snaps = await Promise.all(
bounds.map((b) => {
const q = query(
collection(db, "businessProfiles"),
where("providerTypes", "array-contains", providerType),
orderBy("geo.geohash"),
where("geo.geohash", ">=", b[0]),
where("geo.geohash", "<=", b[1]),
limit(50)
);
return getDocs(q);
})
);

// Merge docs (dedupe)
const map = new Map<string, Row>();
snaps.forEach((s) => {
s.docs.forEach((d) => {
map.set(d.id, { id: d.id, ...(d.data() as any) });
});
});

// Distance filter
const out: Row[] = [];
map.forEach((p) => {
const g = p.geo;
if (!g || typeof g.lat !== "number" || typeof g.lng !== "number") return;

const km = distanceBetween(centerTuple, [g.lat, g.lng]);
const miles = km * 0.621371;

if (miles <= radiusMiles) {
out.push({ ...p, distanceMiles: miles });
}
});

out.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));
setRows(out);
} catch (e: any) {
setErr(e?.message ? String(e.message) : "Search failed.");
} finally {
setLoading(false);
}
}

function requestService(providerUid: string) {
const target = `/requests/new?provider=${encodeURIComponent(providerUid)}`;
if (!authedUid) {
router.push(makeNextUrl(target));
return;
}
router.push(target);
}

return (
<main className="min-h-screen bg-white p-6">
<div className="max-w-5xl mx-auto">
<div className="flex items-start justify-between gap-4">
<div>
<h1 className="text-3xl font-bold text-gray-900">Provider Directory</h1>
<p className="text-sm text-gray-600 mt-1">
Browse providers without an account. You’ll only need to sign in when you request service.
</p>
</div>

<div className="flex gap-2">
<button
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
onClick={() => router.push("/dashboard")}
>
Dashboard
</button>

{!authedUid ? (
<button
className="bg-black text-white rounded-lg px-4 py-2 font-medium"
onClick={() => router.push("/auth/sign-in")}
>
Sign in
</button>
) : (
<div className="text-sm text-gray-600 border border-gray-200 rounded-lg px-4 py-2">Signed in</div>
)}
</div>
</div>

{/* Search panel */}
<div className="mt-6 border border-gray-200 rounded-2xl p-6 space-y-4">
<div className="grid md:grid-cols-3 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Location</label>
<select
className="border rounded-lg p-2 w-full"
value={locationMode}
onChange={(e) => setLocationMode(e.target.value as LocationMode)}
disabled={loading}
>
<option value="citystate">City + State</option>
<option value="zip">ZIP code</option>
<option value="gps">Use my location</option>
<option value="address">Type an address</option>
</select>
</div>

<div>
<label className="block text-sm font-medium mb-1">Service Provider Type</label>
<select
className="border rounded-lg p-2 w-full"
value={providerType}
onChange={(e) => setProviderType(e.target.value as any)}
disabled={loading}
>
<option value="">Select type…</option>
{PROVIDER_TYPES.map((t) => (
<option key={t} value={t}>
{t}
</option>
))}
</select>
</div>

<div>
<label className="block text-sm font-medium mb-1">Keywords (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={keyword}
onChange={(e) => setKeyword(e.target.value)}
placeholder="Name, ‘tow’, ‘tires’, etc."
disabled={loading}
/>
</div>
</div>

{locationMode === "citystate" ? (
<div className="grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">City</label>
<input
className="border rounded-lg p-2 w-full"
value={city}
onChange={(e) => setCity(e.target.value)}
placeholder="Example: Dallas"
disabled={loading}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">State</label>
<input
className="border rounded-lg p-2 w-full"
value={stateCode}
onChange={(e) => setStateCode(e.target.value)}
placeholder="TX"
disabled={loading}
maxLength={2}
/>
</div>
</div>
) : locationMode === "zip" ? (
<div className="grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">ZIP code</label>
<input
className="border rounded-lg p-2 w-full"
value={zip}
onChange={(e) => setZip(e.target.value)}
placeholder="75201"
disabled={loading}
inputMode="numeric"
/>
</div>
</div>
) : locationMode === "gps" ? (
<div className="grid md:grid-cols-3 gap-3 items-end">
<div className="md:col-span-1">
<label className="block text-sm font-medium mb-1">Radius</label>
<select
className="border rounded-lg p-2 w-full"
value={String(radiusMiles)}
onChange={(e) => setRadiusMiles(Number(e.target.value))}
disabled={loading}
>
<option value="10">10 miles</option>
<option value="25">25 miles</option>
<option value="50">50 miles</option>
<option value="100">100 miles</option>
</select>
</div>

<div className="md:col-span-2 flex gap-2 items-center">
<button
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
onClick={requestGPS}
disabled={loading || gpsStatus === "requesting"}
>
{gpsStatus === "ready"
? "Location Ready ✅"
: gpsStatus === "requesting"
? "Getting location…"
: "Use My Location"}
</button>

<div className="text-xs text-gray-500">
{gpsLatLng
? `Lat ${gpsLatLng.lat.toFixed(4)}, Lng ${gpsLatLng.lng.toFixed(4)}`
: "We only use this to find providers near you."}
</div>
</div>
</div>
) : (
// address mode
<div className="grid md:grid-cols-3 gap-3 items-end">
<div className="md:col-span-2">
<label className="block text-sm font-medium mb-1">Address / City / ZIP</label>
<input
className="border rounded-lg p-2 w-full"
value={addressText}
onChange={(e) => {
setAddressText(e.target.value);
setAddressCenter(null);
setAddressStatus("idle");
}}
placeholder="Example: 123 Main St Dallas TX, or Dallas TX, or 75201"
disabled={loading}
/>
<div className="text-xs text-gray-500 mt-1">
Click “Geocode” once, then Search. (Uses Google Geocoding key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
</div>
</div>

<div>
<label className="block text-sm font-medium mb-1">Radius</label>
<select
className="border rounded-lg p-2 w-full"
value={String(radiusMiles)}
onChange={(e) => setRadiusMiles(Number(e.target.value))}
disabled={loading}
>
<option value="10">10 miles</option>
<option value="25">25 miles</option>
<option value="50">50 miles</option>
<option value="100">100 miles</option>
</select>
</div>

<div className="md:col-span-3 flex items-center gap-2">
<button
type="button"
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
onClick={geocodeTypedAddress}
disabled={loading || addressStatus === "geocoding"}
>
{addressStatus === "ready"
? "Geocoded ✅"
: addressStatus === "geocoding"
? "Geocoding…"
: "Geocode Address"}
</button>

<div className="text-xs text-gray-500">
{addressCenter ? `Lat ${addressCenter.lat.toFixed(4)}, Lng ${addressCenter.lng.toFixed(4)}` : "—"}
</div>
</div>
</div>
)}

{/* Filters row */}
<div className="grid md:grid-cols-3 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Min rating</label>
<select
className="border rounded-lg p-2 w-full"
value={String(minRating)}
onChange={(e) => setMinRating(Number(e.target.value))}
disabled={loading}
>
<option value="0">Any</option>
<option value="3">3.0+</option>
<option value="4">4.0+</option>
<option value="4.5">4.5+</option>
</select>
</div>

{/* ✅ Payment multi-select dropdown */}
<div className="relative">
<label className="block text-sm font-medium mb-1">Payment types (optional)</label>
<button
type="button"
className="border rounded-lg p-2 w-full text-left"
onClick={() => setPayOpen((v) => !v)}
disabled={loading}
>
{paymentTypes.length ? `${paymentTypes.length} selected` : "Any payment type"}
</button>

{payOpen ? (
<div className="absolute z-20 mt-2 w-full border bg-white rounded-xl shadow-lg p-2 max-h-64 overflow-auto">
<div className="flex items-center justify-between px-2 py-1">
<div className="text-xs text-gray-500">Select all that apply</div>
<button type="button" className="text-xs underline" onClick={() => setPaymentTypes([])}>
Clear
</button>
</div>

<div className="mt-1">
{PAYMENT_OPTIONS.map((p) => {
const checked = paymentTypes.includes(p);
return (
<label
key={p}
className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer"
>
<input
type="checkbox"
checked={checked}
onChange={() => togglePayment(p)}
disabled={loading}
/>
<span className="text-sm">{p}</span>
</label>
);
})}
</div>
</div>
) : null}

{paymentTypes.length ? (
<div className="mt-2 text-xs text-gray-600">
Selected: <b>{paymentTypes.join(", ")}</b>
</div>
) : null}
</div>

<div>
<label className="block text-sm font-medium mb-1">Sort</label>
<select
className="border rounded-lg p-2 w-full"
value={sortMode}
onChange={(e) => setSortMode(e.target.value as any)}
disabled={loading}
>
<option value="distance">Distance</option>
<option value="rating">Rating</option>
</select>
</div>
</div>

<div className="flex items-center gap-2">
<button
onClick={runSearch}
disabled={!canSearch || loading}
className="bg-black text-white rounded-lg px-5 py-2 font-medium disabled:opacity-50"
>
{loading ? "Searching…" : "Search"}
</button>

{!canSearch ? (
<div className="text-sm text-gray-600">
Select provider type + location. (GPS needs permission. Address needs Geocode.)
</div>
) : null}
</div>

{err ? (
<div className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
<div className="text-xs text-red-700 mt-1">
If it mentions an “index”, click the Firebase console link and create the index.
</div>
</div>
) : null}
</div>

{/* Results */}
<div className="mt-6">
<div className="text-sm text-gray-600">
Results: <b>{filtered.length}</b>
{rows.length !== filtered.length ? <> (filtered from {rows.length})</> : null}
</div>

{loading ? (
<div className="mt-4 border border-gray-200 rounded-2xl p-6 text-gray-700">Loading…</div>
) : filtered.length === 0 ? (
<div className="mt-4 border border-gray-200 rounded-2xl p-6 text-gray-700">
No providers found. Try a different location or provider type.
</div>
) : (
<div className="mt-4 grid gap-3">
{filtered.map((p) => {
const uid = p.providerUid || p.id;

return (
<div key={p.id} className="border border-gray-200 rounded-2xl p-4">
<div className="flex items-start justify-between gap-4">
<div className="min-w-0">
<div className="text-base font-semibold text-gray-900 truncate">
{p.companyName || "Provider"}
</div>

<div className="mt-1 text-sm text-gray-700 space-y-1">
<div>
<b>Address:</b> {shortAddress(p)}
</div>
<div>
<b>Phone:</b> {p.companyPhone || "—"}
</div>
<div className="text-gray-600">
<b>Hours:</b> {p.dispatch247 ? "24/7 Dispatch" : "Hours vary"}
</div>
<div className="text-gray-600">
<b>Rating:</b>{" "}
{p.ratingAvg != null ? p.ratingAvg.toFixed(2) : "—"}{" "}
{p.ratingCount ? `(${p.ratingCount} reviews)` : ""}
</div>

{(locationMode === "gps" || locationMode === "address") ? (
<div className="text-gray-600">
<b>Distance:</b> {milesToLabel(p.distanceMiles)}
</div>
) : null}
</div>
</div>

<div className="shrink-0 flex flex-col gap-2">
<button
className="bg-black text-white rounded-lg px-4 py-2 font-medium"
onClick={() => requestService(uid)}
>
Request Service
</button>

<button
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
onClick={() => router.push(`/providers/${encodeURIComponent(uid)}`)}
>
View Profile
</button>
</div>
</div>

{!authedUid ? (
<div className="mt-3 text-xs text-gray-500">
Request Service will ask you to sign in first.
</div>
) : null}
</div>
);
})}
</div>
)}
</div>

<div className="mt-10 border border-gray-100 rounded-2xl p-6 text-sm text-gray-600">
<b>Next upgrades:</b> add standardized rates, true “rates” filtering, and stronger keyword indexing via searchText.
</div>
</div>
</main>
);
}

