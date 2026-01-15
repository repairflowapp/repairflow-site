"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";

import {
PROVIDER_TYPES,
type ProviderType,
SERVICE_KEYWORDS,
type ServiceKeyword,
} from "@/lib/SharedProviderCatalog";

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

// ✅ NEW: keyword tags
serviceKeywords?: string[];

dispatch247?: boolean;
emergencyRoadside?: boolean;

ratingAvg?: number | null;
ratingCount?: number | null;

searchText?: string | null;

createdAt?: any;
updatedAt?: any;
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

function buildSearchText(p: {
companyName?: string;
companyPhone?: string;
companyAddress?: string;
city?: string;
state?: string;
zip?: string;
providerTypes?: string[];
paymentsAccepted?: string[];
serviceKeywords?: string[];
dispatch247?: boolean;
emergencyRoadside?: boolean;
}) {
const parts: string[] = [];
const push = (v: any) => {
const s = String(v || "").trim();
if (s) parts.push(s);
};

push(p.companyName);
push(p.companyPhone);
push(p.companyAddress);
push(p.city);
push(p.state);
push(p.zip);

(p.providerTypes || []).forEach(push);
(p.paymentsAccepted || []).forEach(push);

// ✅ include keywords in search
(p.serviceKeywords || []).forEach(push);

if (p.dispatch247) push("24/7 dispatch");
if (p.emergencyRoadside) push("emergency roadside assistance");

return parts.join(" ").toLowerCase();
}

export default function ProviderProfileEditPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

// Required for directory search
const [companyName, setCompanyName] = useState("");
const [companyPhone, setCompanyPhone] = useState("");
const [companyAddress, setCompanyAddress] = useState("");

const [city, setCity] = useState("");
const [stateCode, setStateCode] = useState("");
const [zip, setZip] = useState("");

const [providerTypes, setProviderTypes] = useState<ProviderType[]>([]);

// ✅ NEW: keywords
const [serviceKeywords, setServiceKeywords] = useState<ServiceKeyword[]>([]);

// Optional toggles (show in directory as “Availability”)
const [dispatch247, setDispatch247] = useState(false);
const [emergencyRoadside, setEmergencyRoadside] = useState(false);

const [saving, setSaving] = useState(false);
const [err, setErr] = useState<string | null>(null);
const [loadedCreatedAt, setLoadedCreatedAt] = useState<any>(null);

useEffect(() => {
return onAuthStateChanged(auth, (u) => {
if (!u) {
router.replace("/auth/sign-in");
return;
}
setUid(u.uid);
});
}, [router]);

useEffect(() => {
if (!uid) return;

const ref = doc(db, "businessProfiles", uid);
return onSnapshot(
ref,
(snap) => {
const data = (snap.exists() ? (snap.data() as any) : {}) as BusinessProfile;

setCompanyName(String(data.companyName || ""));
setCompanyPhone(String(data.companyPhone || ""));
setCompanyAddress(String(data.companyAddress || ""));

setCity(String(data.city || ""));
setStateCode(String(data.state || ""));
setZip(String(data.zip || ""));

setProviderTypes((Array.isArray(data.providerTypes) ? data.providerTypes : []) as ProviderType[]);

// ✅ load keywords
setServiceKeywords((Array.isArray(data.serviceKeywords) ? data.serviceKeywords : []) as ServiceKeyword[]);

setDispatch247(!!data.dispatch247);
setEmergencyRoadside(!!data.emergencyRoadside);

setLoadedCreatedAt(data.createdAt ?? null);

setLoading(false);
setErr(null);
},
(e) => {
setErr(e?.message || "Failed to load profile.");
setLoading(false);
}
);
}, [uid]);

function toggleProviderType(t: ProviderType) {
setProviderTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
}

function toggleKeyword(k: ServiceKeyword) {
setServiceKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
}

const canSave = useMemo(() => {
if (saving) return false;

if (!clean(companyName)) return false;
if (!isValidUSPhone(companyPhone)) return false;
if (!clean(companyAddress)) return false;

// Directory search depends on these:
if (!clean(city)) return false;
if (!normState(stateCode)) return false;
if (!normZip(zip)) return false;

if (providerTypes.length === 0) return false;

// ✅ keywords optional; do NOT block save

return true;
}, [saving, companyName, companyPhone, companyAddress, city, stateCode, zip, providerTypes]);

async function save() {
if (!uid) return;
setErr(null);
setSaving(true);

try {
const ref = doc(db, "businessProfiles", uid);

const nextCity = clean(city);
const nextState = normState(stateCode);
const nextZip = normZip(zip);

const normalizedCompanyPhone = normalizeUSPhone(companyPhone);

const nextKeywords = (serviceKeywords || []).map((x) => String(x)).filter(Boolean);

const searchText = buildSearchText({
companyName: clean(companyName),
companyPhone: normalizedCompanyPhone,
companyAddress: clean(companyAddress),
city: nextCity,
state: nextState,
zip: nextZip,
providerTypes: providerTypes as string[],
paymentsAccepted: [], // later
serviceKeywords: nextKeywords, // ✅ include keywords
dispatch247,
emergencyRoadside,
});

// Important: don't overwrite createdAt every save
const payload: any = {
providerUid: uid,

companyName: clean(companyName),
companyPhone: normalizedCompanyPhone,
companyAddress: clean(companyAddress),

city: nextCity,
state: nextState,
zip: nextZip,

providerTypes: providerTypes as string[],

// ✅ NEW: keywords saved on profile
serviceKeywords: nextKeywords,

dispatch247: !!dispatch247,
emergencyRoadside: !!emergencyRoadside,

searchText,
updatedAt: serverTimestamp(),
};

if (!loadedCreatedAt) {
payload.createdAt = serverTimestamp();
}

await setDoc(ref, payload, { merge: true });

router.push("/dashboard/provider?tab=profile");
} catch (e: any) {
setErr(e?.message || "Failed to save profile.");
setSaving(false);
}
}

if (!uid) return null;

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-2xl border border-gray-200 rounded-2xl p-8">Loading…</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-2xl mx-auto border border-gray-200 rounded-2xl p-8">
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-2xl font-bold">Provider Profile</h1>
<p className="text-sm text-gray-600">This info powers the public Provider Directory search.</p>
</div>
<button onClick={() => router.back()} className="border rounded px-4 py-2">
Back
</button>
</div>

{err ? (
<div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{err}</div>
) : null}

<div className="mt-6 space-y-4">
<div>
<label className="text-sm font-medium">
Company / Provider Name <span className="text-red-600">*</span>
</label>
<input
value={companyName}
onChange={(e) => setCompanyName(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
placeholder="ABC Towing LLC"
disabled={saving}
/>
</div>

<PhoneInput label="Company Phone" required value={companyPhone} onChange={setCompanyPhone} disabled={saving} />

<div>
<label className="text-sm font-medium">
Company Address <span className="text-red-600">*</span>
</label>
<input
value={companyAddress}
onChange={(e) => setCompanyAddress(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
placeholder="Street Address"
disabled={saving}
/>
<div className="text-xs text-gray-500 mt-1">
Tip: Keep this consistent—directory results show this address on the card.
</div>
</div>

<div className="grid md:grid-cols-3 gap-3">
<div>
<label className="text-sm font-medium">
City <span className="text-red-600">*</span>
</label>
<input
value={city}
onChange={(e) => setCity(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
placeholder="Nashville"
disabled={saving}
/>
</div>

<div>
<label className="text-sm font-medium">
State <span className="text-red-600">*</span>
</label>
<input
value={stateCode}
onChange={(e) => setStateCode(e.target.value.toUpperCase())}
className="mt-1 w-full border rounded-lg px-3 py-2"
placeholder="TN"
maxLength={2}
disabled={saving}
/>
</div>

<div>
<label className="text-sm font-medium">
ZIP <span className="text-red-600">*</span>
</label>
<input
value={zip}
onChange={(e) => setZip(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2"
placeholder="37201"
inputMode="numeric"
disabled={saving}
/>
</div>
</div>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input
type="checkbox"
checked={dispatch247}
onChange={() => setDispatch247((v) => !v)}
disabled={saving}
/>
<span className="text-sm">24/7 Dispatch</span>
</label>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input
type="checkbox"
checked={emergencyRoadside}
onChange={() => setEmergencyRoadside((v) => !v)}
disabled={saving}
/>
<span className="text-sm">Emergency Roadside Assistance</span>
</label>

<div>
<div className="text-sm font-medium">
Provider Types <span className="text-red-600">*</span>
</div>
<div className="mt-2 grid md:grid-cols-2 gap-2">
{PROVIDER_TYPES.map((t) => (
<button
key={t}
type="button"
onClick={() => toggleProviderType(t)}
disabled={saving}
className={`border rounded-lg px-3 py-2 text-left ${
providerTypes.includes(t) ? "bg-black text-white" : "bg-white"
}`}
>
{t}
</button>
))}
</div>
{providerTypes.length === 0 ? (
<div className="text-xs text-red-700 mt-2">Select at least one provider type.</div>
) : null}
</div>

{/* ✅ KEYWORDS SECTION */}
<div>
<div className="text-sm font-medium">Service Keywords (optional)</div>
<div className="text-xs text-gray-500 mt-1">
These help customers find you in search (example: “Jump Start”, “Tire Change”, “Towing”).
</div>

<div className="mt-2 flex flex-wrap gap-2">
{SERVICE_KEYWORDS.map((k) => {
const selected = serviceKeywords.includes(k);
return (
<button
key={k}
type="button"
onClick={() => toggleKeyword(k)}
disabled={saving}
className={`border rounded-full px-3 py-1 text-sm ${
selected ? "bg-black text-white" : "bg-white hover:bg-gray-50"
}`}
>
{k}
</button>
);
})}
</div>

<div className="text-xs text-gray-600 mt-2">
Selected: <b>{serviceKeywords.length ? serviceKeywords.join(", ") : "—"}</b>
</div>
</div>

<button
type="button"
disabled={!canSave}
onClick={save}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{saving ? "Saving…" : "Save Profile"}
</button>

{!canSave ? (
<div className="text-xs text-gray-600">
Required: Company name, valid phone, address, city/state/ZIP, and at least 1 provider type.
</div>
) : null}
</div>
</div>
</main>
);
}

