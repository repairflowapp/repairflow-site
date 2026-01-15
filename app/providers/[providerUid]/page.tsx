"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

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

ratingAvg?: number | null;
ratingCount?: number | null;

// Optional extras you may store later
servicesOffered?: string[];
notes?: string | null;
website?: string | null;
email?: string | null;

hours?: Record<string, any> | null;

updatedAt?: any;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtLocation(p: BusinessProfile) {
return [p.city ? titleCase(p.city) : null, p.state ? String(p.state).toUpperCase() : null, p.zip ? String(p.zip) : null]
.filter(Boolean)
.join(", ");
}

function makeNextUrl(path: string) {
return `/auth/sign-in?next=${encodeURIComponent(path)}`;
}

export default function ProviderPublicProfilePage() {
const router = useRouter();
const params = useParams<{ providerUid: string }>();

const providerUid = decodeURIComponent(params.providerUid || "");

const [authedUid, setAuthedUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);
const [profile, setProfile] = useState<BusinessProfile | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => setAuthedUid(u ? u.uid : null));
return () => unsub();
}, []);

useEffect(() => {
let alive = true;

async function load() {
setErr(null);
setLoading(true);
try {
const ref = doc(db, "businessProfiles", providerUid);
const snap = await getDoc(ref);

if (!alive) return;

if (!snap.exists()) {
setProfile(null);
setErr("Provider not found.");
setLoading(false);
return;
}

setProfile(snap.data() as any);
setLoading(false);
} catch (e: any) {
if (!alive) return;
setErr(e?.message || "Failed to load provider.");
setLoading(false);
}
}

if (providerUid) load();
return () => {
alive = false;
};
}, [providerUid]);

function requestService() {
const target = `/requests/new?provider=${encodeURIComponent(providerUid)}`;
if (!authedUid) {
router.push(makeNextUrl(target));
return;
}
router.push(target);
}

const ratingText = useMemo(() => {
if (!profile) return "—";
const avg = profile.ratingAvg;
const cnt = profile.ratingCount;
if (avg == null) return "—";
return `${avg.toFixed(2)}${cnt ? ` (${cnt} reviews)` : ""}`;
}, [profile]);

if (loading) {
return (
<main className="min-h-screen bg-white p-6">
<div className="max-w-3xl mx-auto border border-gray-200 rounded-2xl p-6 text-gray-700">Loading…</div>
</main>
);
}

return (
<main className="min-h-screen bg-white p-6">
<div className="max-w-3xl mx-auto">
<div className="flex items-start justify-between gap-3">
<div>
<h1 className="text-3xl font-bold text-gray-900">{profile?.companyName || "Provider"}</h1>
<p className="text-sm text-gray-600 mt-1">{profile ? fmtLocation(profile) || "—" : "—"}</p>
</div>

<div className="flex gap-2">
<button
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
onClick={() => router.push("/providers")}
>
Back to Directory
</button>
<button className="bg-black text-white rounded-lg px-4 py-2 font-medium" onClick={requestService}>
Request Service
</button>
</div>
</div>

{err ? (
<div className="mt-5 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{profile ? (
<div className="mt-6 space-y-4">
{/* Top summary (matches what directory shows, but fuller) */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="grid sm:grid-cols-2 gap-4 text-sm text-gray-800">
<div>
<div className="text-xs text-gray-500">Phone</div>
<div className="font-medium">{profile.companyPhone || "—"}</div>
</div>

<div>
<div className="text-xs text-gray-500">Rating</div>
<div className="font-medium">{ratingText}</div>
</div>

<div>
<div className="text-xs text-gray-500">Address</div>
<div className="font-medium">{profile.companyAddress || "—"}</div>
</div>

<div>
<div className="text-xs text-gray-500">Availability</div>
<div className="font-medium">
{profile.dispatch247 ? "24/7 Dispatch" : "Hours vary"}
{profile.emergencyRoadside ? " • Emergency Roadside" : ""}
</div>
</div>
</div>
</div>

{/* Services / types */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-sm font-semibold text-gray-900">Provider Types</div>
<div className="mt-2 text-sm text-gray-700">
{Array.isArray(profile.providerTypes) && profile.providerTypes.length ? profile.providerTypes.join(", ") : "—"}
</div>

<div className="mt-4 text-sm font-semibold text-gray-900">Payments Accepted</div>
<div className="mt-2 text-sm text-gray-700">
{Array.isArray(profile.paymentsAccepted) && profile.paymentsAccepted.length
? profile.paymentsAccepted.join(", ")
: "—"}
</div>
</div>

{/* Optional info */}
<div className="border border-gray-200 rounded-2xl p-6">
<div className="text-sm font-semibold text-gray-900">Notes</div>
<div className="mt-2 text-sm text-gray-700">{profile.notes || "—"}</div>
</div>

{!authedUid ? (
<div className="text-xs text-gray-500">
You can browse profiles without an account. Request Service will prompt you to sign in.
</div>
) : null}
</div>
) : null}
</div>
</main>
);
}
