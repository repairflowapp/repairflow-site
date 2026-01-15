"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

type UserRole =
| "driver"
| "fleet"
| "repair_shop"
| "mobile_mechanic"
| "towing"
| "tire_shop"
| "mobile_tire";

type IssueType =
| "tire"
| "breakdown"
| "towing"
| "mechanical"
| "lockout"
| "fuel"
| "battery"
| "other";

const ISSUE_OPTIONS: { value: IssueType; label: string }[] = [
{ value: "tire", label: "Tire / Flat / Blowout" },
{ value: "breakdown", label: "Breakdown / Won't Start" },
{ value: "towing", label: "Need Towing" },
{ value: "mechanical", label: "Mechanical Issue" },
{ value: "lockout", label: "Lockout" },
{ value: "fuel", label: "Out of Fuel" },
{ value: "battery", label: "Battery / Jump Start" },
{ value: "other", label: "Other" },
];

function formatRole(role: UserRole) {
switch (role) {
case "driver":
return "Driver";
case "fleet":
return "Fleet";
default:
return role;
}
}

type LatLng = { lat: number; lng: number };

type UploadedMedia = {
url: string;
type: "image" | "video";
name?: string;
};

type RouteResult = {
pickupLat: number;
pickupLng: number;
dropoffLat: number;
dropoffLng: number;
distanceMiles: number;
durationMinutes: number;
distanceText?: string | null;
durationText?: string | null;
};

export default function RequestPage() {
const router = useRouter();
const storage = getStorage();

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [routing, setRouting] = useState(false);
const [error, setError] = useState<string | null>(null);

const [uid, setUid] = useState<string | null>(null);
const [role, setRole] = useState<UserRole | null>(null);

// Form fields
const [issueType, setIssueType] = useState<IssueType>("tire");

// Non-towing address
const [addressText, setAddressText] = useState("");

// Towing fields
const isTowing = issueType === "towing";
const [pickupAddress, setPickupAddress] = useState("");
const [dropoffAddress, setDropoffAddress] = useState("");
const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);

// Trailer
const [withTrailer, setWithTrailer] = useState<boolean>(false);
const [trailerDetails, setTrailerDetails] = useState<string>("");

const [contactPhone, setContactPhone] = useState("");
const [vehicleInfo, setVehicleInfo] = useState("");
const [notes, setNotes] = useState("");
const [isEmergency, setIsEmergency] = useState<boolean>(true);

// Optional GPS
const [gps, setGps] = useState<LatLng | null>(null);
const [gpsError, setGpsError] = useState<string | null>(null);

// Media upload
const [files, setFiles] = useState<File[]>([]);
const [uploadNote, setUploadNote] = useState<string | null>(null);

const isDriverOrFleet = useMemo(() => role === "driver" || role === "fleet", [role]);

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (user) => {
try {
if (!user) {
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

const snap = await getDoc(doc(db, "users", user.uid));
const data = snap.exists() ? (snap.data() as any) : null;

const r = (data?.role as UserRole) ?? null;
setRole(r);

if (typeof data?.phone === "string") setContactPhone(data.phone);

if (r && r !== "driver" && r !== "fleet") {
router.push("/dashboard");
return;
}

setLoading(false);
} catch (e: any) {
setError(e?.message ?? "Failed to load request page.");
setLoading(false);
}
});

return () => unsub();
}, [router]);

// When switching issue types, clear towing-only info if leaving towing
useEffect(() => {
setError(null);

if (!isTowing) {
setPickupAddress("");
setDropoffAddress("");
setRouteInfo(null);
setWithTrailer(false);
setTrailerDetails("");
} else {
// If entering towing, clear the single address
setAddressText("");
}
}, [isTowing]);

function requestGPS() {
setGpsError(null);

if (!navigator.geolocation) {
setGpsError("Geolocation is not supported in this browser.");
return;
}

navigator.geolocation.getCurrentPosition(
(pos) => {
setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
},
(err) => {
setGpsError(err.message || "Location permission denied.");
},
{ enableHighAccuracy: true, timeout: 15000 }
);
}

async function geocodeAddress(address: string): Promise<{ coords: LatLng; formatted: string }> {
const res = await fetch("/api/geocode", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ address }),
});

const data = await res.json();
if (!res.ok) throw new Error(data?.error ?? "Geocoding failed.");

return {
coords: { lat: data.lat, lng: data.lng },
formatted: data.formattedAddress ?? address,
};
}

async function computeTowRoute() {
setError(null);

const pickup = pickupAddress.trim();
const dropoff = dropoffAddress.trim();

if (!pickup) {
setError("Pickup address is required for towing.");
return null;
}
if (!dropoff) {
setError("Delivery / dropoff address is required for towing.");
return null;
}

setRouting(true);
try {
const res = await fetch("/api/route-miles", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ pickup, dropoff }),
});

const data = await res.json();
if (!res.ok) throw new Error(data?.error ?? "Failed to compute route.");

setRouteInfo(data as RouteResult);
return data as RouteResult;
} catch (e: any) {
setRouteInfo(null);
setError(e?.message ?? "Failed to compute route.");
return null;
} finally {
setRouting(false);
}
}

function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
setUploadNote(null);
const list = Array.from(e.target.files ?? []);
setFiles(list.slice(0, 6));
}

async function uploadAllMedia(requestId: string, uid: string): Promise<UploadedMedia[]> {
if (files.length === 0) return [];

setUploadNote("Uploading photos/videos…");

const uploaded: UploadedMedia[] = [];

for (const f of files) {
const isImage = f.type.startsWith("image/");
const isVideo = f.type.startsWith("video/");
if (!isImage && !isVideo) continue;

const safeName = f.name.replace(/[^\w.\-]+/g, "_");
const path = `roadsideRequests/${requestId}/${uid}/${Date.now()}_${safeName}`;
const fileRef = ref(storage, path);

await uploadBytes(fileRef, f);
const url = await getDownloadURL(fileRef);

uploaded.push({ url, type: isVideo ? "video" : "image", name: f.name });
}

return uploaded;
}

async function onSubmit(e: React.FormEvent) {
e.preventDefault();
setError(null);
setUploadNote(null);

if (!uid || !role) {
setError("Not signed in.");
return;
}
if (!isDriverOrFleet) {
router.push("/dashboard");
return;
}

// Validate fields
if (isTowing) {
if (!pickupAddress.trim()) return setError("Pickup address is required for towing.");
if (!dropoffAddress.trim()) return setError("Delivery / dropoff address is required for towing.");
if (withTrailer && !trailerDetails.trim()) return setError("Please add trailer details.");
} else {
if (!addressText.trim()) {
return setError("Address / exit / city is required so we can match providers by distance.");
}
}

if (!contactPhone.trim()) {
setError("Please enter a contact phone number.");
return;
}

setSaving(true);
try {
const baseAddress = isTowing ? pickupAddress.trim() : addressText.trim();

// Always geocode the base address (pickup for towing)
const { coords, formatted } = await geocodeAddress(baseAddress);
const requestCoords = gps ?? coords;

// If towing: compute route miles + eta (required)
let finalRoute: RouteResult | null = routeInfo;
if (isTowing) {
if (!finalRoute) {
finalRoute = await computeTowRoute();
if (!finalRoute) {
setSaving(false);
return;
}
}
}

// ✅ IMPORTANT FIX: also store customerUid for rules + easier querying
const payload: any = {
createdByUid: uid,
customerUid: uid, // <-- ADD THIS
requesterRole: role,
issueType,

addressText: baseAddress,

addressLat: coords.lat,
addressLng: coords.lng,
addressFormatted: formatted,

requestLat: requestCoords.lat,
requestLng: requestCoords.lng,
requestLocationSource: gps ? "gps" : "address",

contactPhone: contactPhone.trim(),
vehicleInfo: vehicleInfo.trim() || null,
notes: notes.trim() || null,
isEmergency,

pickupAddress: isTowing ? pickupAddress.trim() : null,
dropoffAddress: isTowing ? dropoffAddress.trim() : null,
withTrailer: isTowing ? withTrailer : null,
trailerDetails: isTowing && withTrailer ? trailerDetails.trim() : null,

pickupLat: isTowing && finalRoute ? finalRoute.pickupLat : null,
pickupLng: isTowing && finalRoute ? finalRoute.pickupLng : null,
dropoffLat: isTowing && finalRoute ? finalRoute.dropoffLat : null,
dropoffLng: isTowing && finalRoute ? finalRoute.dropoffLng : null,
distanceMiles: isTowing && finalRoute ? finalRoute.distanceMiles : null,
durationMinutes: isTowing && finalRoute ? finalRoute.durationMinutes : null,
distanceText: isTowing && finalRoute ? finalRoute.distanceText ?? null : null,
durationText: isTowing && finalRoute ? finalRoute.durationText ?? null : null,

providerId: null,
acceptedBidId: null,
acceptedAt: null,

assignedToUid: null,
assignedAt: null,

status: "open",
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
};

const docRef = await addDoc(collection(db, "roadsideRequests"), payload);

// Upload media (optional)
const media = await uploadAllMedia(docRef.id, uid);
if (media.length > 0) {
await fetch("/api/patch-request-media", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ requestId: docRef.id, media }),
});
}

router.push("/requests");
} catch (e: any) {
setError(e?.message ?? "Failed to submit request.");
} finally {
setSaving(false);
setUploadNote(null);
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading request form…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-xl border border-gray-200 rounded-2xl p-8">
<h1 className="text-3xl font-bold text-gray-900 mb-2">Request Roadside Help</h1>

<p className="text-gray-600 mb-6">
Role: <span className="font-medium text-gray-900">{role ? formatRole(role) : "—"}</span>
</p>

<form onSubmit={onSubmit} className="space-y-5">
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">What do you need help with?</label>
<select
value={issueType}
onChange={(e) => setIssueType(e.target.value as IssueType)}
className="w-full border border-gray-300 rounded-lg px-4 py-3"
>
{ISSUE_OPTIONS.map((opt) => (
<option key={opt.value} value={opt.value}>
{opt.label}
</option>
))}
</select>
</div>

<div className="border border-gray-200 rounded-xl p-4">
<div className="flex items-start justify-between gap-4">
<div>
<p className="font-medium text-gray-900">GPS Location (optional)</p>
<p className="text-sm text-gray-600">If you allow location, matching can be even more accurate.</p>
</div>
<button
type="button"
onClick={requestGPS}
className="bg-black text-white rounded-lg px-4 py-2 font-medium hover:opacity-90"
>
Use my current location
</button>
</div>

<div className="mt-3 text-sm text-gray-700">
<div>Lat: {gps ? gps.lat.toFixed(5) : "—"}</div>
<div>Lng: {gps ? gps.lng.toFixed(5) : "—"}</div>
</div>

{gpsError && (
<p className="mt-3 text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded-lg p-3">
{gpsError}
</p>
)}
</div>

{isTowing ? (
<>
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Pickup address (required)</label>
<input
value={pickupAddress}
onChange={(e) => {
setPickupAddress(e.target.value);
setRouteInfo(null);
}}
placeholder='Example: "I-95 N near Exit 16, Philadelphia, PA"'
className="w-full border border-gray-300 rounded-lg px-4 py-3"
required
/>
</div>

<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Delivery / Dropoff address (required)</label>
<input
value={dropoffAddress}
onChange={(e) => {
setDropoffAddress(e.target.value);
setRouteInfo(null);
}}
placeholder='Example: "123 Main St, Newark, NJ"'
className="w-full border border-gray-300 rounded-lg px-4 py-3"
required
/>
</div>

<div className="border border-gray-200 rounded-xl p-4 space-y-3">
<label className="flex items-center gap-3">
<input
type="checkbox"
checked={withTrailer}
onChange={(e) => {
setWithTrailer(e.target.checked);
if (!e.target.checked) setTrailerDetails("");
}}
/>
<span className="text-sm text-gray-800 font-medium">With trailer?</span>
</label>

{withTrailer && (
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">
Trailer details (required if trailer)
</label>
<input
value={trailerDetails}
onChange={(e) => setTrailerDetails(e.target.value)}
placeholder='Example: "53ft dry van" or "flatbed, loaded/unloaded"'
className="w-full border border-gray-300 rounded-lg px-4 py-3"
/>
</div>
)}

<button
type="button"
onClick={computeTowRoute}
disabled={routing}
className="w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50 disabled:opacity-50"
>
{routing ? "Calculating…" : "Calculate mileage"}
</button>

{routeInfo ? (
<div className="text-sm text-gray-800 border border-emerald-200 bg-emerald-50 rounded-lg p-3">
<div>
<b>Distance:</b>{" "}
{routeInfo.distanceText ? routeInfo.distanceText : `${routeInfo.distanceMiles} mi`}
</div>
<div className="mt-1">
<b>ETA:</b>{" "}
{routeInfo.durationText ? routeInfo.durationText : `${routeInfo.durationMinutes} min`}
</div>
</div>
) : (
<p className="text-xs text-gray-500">
Tip: click <b>Calculate mileage</b> to lock in miles + ETA for the tow.
</p>
)}
</div>
</>
) : (
<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Address / exit / city (required)</label>
<input
value={addressText}
onChange={(e) => setAddressText(e.target.value)}
placeholder='Example: "I-95 N near Exit 16, Philadelphia, PA"'
className="w-full border border-gray-300 rounded-lg px-4 py-3"
required
/>
<p className="text-xs text-gray-500 mt-1">
We convert this into GPS coordinates so providers only see nearby jobs.
</p>
</div>
)}

<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Contact phone</label>
<input
value={contactPhone}
onChange={(e) => setContactPhone(e.target.value)}
placeholder="(###) ###-####"
className="w-full border border-gray-300 rounded-lg px-4 py-3"
required
/>
</div>

<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Vehicle info (optional)</label>
<input
value={vehicleInfo}
onChange={(e) => setVehicleInfo(e.target.value)}
placeholder='Example: "2019 Freightliner Cascadia, Unit #12"'
className="w-full border border-gray-300 rounded-lg px-4 py-3"
/>
</div>

<div>
<label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
<textarea
value={notes}
onChange={(e) => setNotes(e.target.value)}
placeholder='Example: "Safe location, on shoulder, hazards on."'
className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[120px]"
/>
</div>

<div className="border border-gray-200 rounded-xl p-4">
<p className="font-medium text-gray-900">Photos / Videos (optional)</p>
<p className="text-sm text-gray-600 mb-3">
Add up to 6 files (images or video) so the provider can see the issue.
</p>

<input type="file" multiple accept="image/*,video/*" onChange={onPickFiles} className="block w-full text-sm" />

{files.length > 0 && (
<div className="mt-3 text-sm text-gray-700">Selected: {files.map((f) => f.name).join(", ")}</div>
)}

{uploadNote && <div className="mt-3 text-sm text-gray-700">{uploadNote}</div>}
</div>

<label className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-3">
<input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />
<span className="text-sm text-gray-800">Emergency (need help ASAP)</span>
</label>

{error && (
<p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error}</p>
)}

<button
type="submit"
disabled={saving || routing}
className="w-full bg-black text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
>
{saving ? "Submitting…" : "Submit Request"}
</button>

<button
type="button"
onClick={() => router.push("/requests")}
className="w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
>
My Requests
</button>

<button
type="button"
onClick={() => router.push("/dashboard")}
className="w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Dashboard
</button>
</form>
</div>
</main>
);
}

