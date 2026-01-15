"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";

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
"Reefer Repair",
] as const;

type RoleChoice = "provider" | "customer";
type CustomerType = "driver" | "fleet";

export default function RegisterPage() {
const router = useRouter();
const creatingRef = useRef(false);

const [authReady, setAuthReady] = useState(false);
const [role, setRole] = useState<RoleChoice>("provider");

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

// Provider required
const [companyName, setCompanyName] = useState("");
const [companyPhone, setCompanyPhone] = useState("");
const [companyAddress, setCompanyAddress] = useState("");
const [providerTypes, setProviderTypes] = useState<string[]>([]);

// Provider optional
const [contactName, setContactName] = useState("");
const [contactPhone, setContactPhone] = useState("");
const [dispatch247, setDispatch247] = useState(false);
const [emergencyRoadside, setEmergencyRoadside] = useState(false);

// Customer
const [customerType, setCustomerType] = useState<CustomerType>("driver");

// Driver required
const [driverName, setDriverName] = useState("");
const [driverPhone, setDriverPhone] = useState("");

// Fleet required
const [fleetCompanyName, setFleetCompanyName] = useState("");
const [fleetCompanyPhone, setFleetCompanyPhone] = useState("");

// Fleet optional
const [customerAddress, setCustomerAddress] = useState("");
const [dotNumber, setDotNumber] = useState("");
const [mcNumber, setMcNumber] = useState("");

const [busy, setBusy] = useState(false);
const [err, setErr] = useState<string | null>(null);

// If already signed in, send to dashboard router (never force customer page here)
useEffect(() => {
return onAuthStateChanged(auth, (u) => {
if (u && !creatingRef.current) {
router.replace("/dashboard");
return;
}
setAuthReady(true);
});
}, [router]);

function toggleProviderType(t: string) {
setProviderTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
}

// Reset customer-only fields when switching type (prevents stale validation / saving wrong values)
useEffect(() => {
if (role !== "customer") return;

if (customerType === "driver") {
setFleetCompanyName("");
setFleetCompanyPhone("");
setCustomerAddress("");
setDotNumber("");
setMcNumber("");
} else {
setDriverName("");
setDriverPhone("");
}
}, [customerType, role]);

const canSubmit = useMemo(() => {
const e = email.trim();
const p = password.trim();
if (!e || !p) return false;
if (p.length < 6) return false;

if (role === "provider") {
if (!companyName.trim()) return false;
if (!isValidUSPhone(companyPhone)) return false;
if (!companyAddress.trim()) return false;
if (providerTypes.length === 0) return false;
}

if (role === "customer") {
if (customerType === "driver") {
if (!driverName.trim()) return false;
if (!isValidUSPhone(driverPhone)) return false;
} else {
if (!fleetCompanyName.trim()) return false;
if (!isValidUSPhone(fleetCompanyPhone)) return false;
}
}

return true;
}, [
email,
password,
role,
companyName,
companyPhone,
companyAddress,
providerTypes,
customerType,
driverName,
driverPhone,
fleetCompanyName,
fleetCompanyPhone,
]);

async function submit() {
setErr(null);
if (!canSubmit) return;
if (busy) return;

const e = email.trim().toLowerCase();
const p = password.trim();

setBusy(true);
creatingRef.current = true;

try {
const cred = await createUserWithEmailAndPassword(auth, e, p);
const uid = cred.user.uid;

// ======================
// PROVIDER
// ======================
if (role === "provider") {
const normalizedCompanyPhone = normalizeUSPhone(companyPhone);
if (!normalizedCompanyPhone) throw new Error("Invalid company phone number.");

const normalizedContactPhone = contactPhone ? normalizeUSPhone(contactPhone) : "";
// users/{uid}
await setDoc(
doc(db, "users", uid),
{
role: "provider",
email: e,
name: companyName.trim(),
phone: normalizedCompanyPhone,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

// businessProfiles/{uid}
await setDoc(
doc(db, "businessProfiles", uid),
{
providerUid: uid,

companyName: companyName.trim(),
companyPhone: normalizedCompanyPhone,
companyAddress: companyAddress.trim(),

contactName: contactName.trim() || null,
contactPhone: normalizedContactPhone || null,

providerTypes,
servicesOffered: [],
paymentsAccepted: [],

dispatch247: !!dispatch247,
emergencyRoadside: !!emergencyRoadside,

hours: {},
onboardingComplete: false,

ratingAvg: null,
ratingCount: 0,

createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

router.replace("/dashboard/provider?tab=profile&onboarding=1");
return;
}

// ======================
// CUSTOMER (driver or fleet)
// Always force role="customer"
// ======================
const forcedRole: RoleChoice = "customer";

if (customerType === "driver") {
const nPhone = normalizeUSPhone(driverPhone);
if (!nPhone) throw new Error("Invalid driver phone number.");

await setDoc(
doc(db, "users", uid),
{
role: forcedRole,
customerType: "driver",
email: e,
name: driverName.trim(),
phone: nPhone,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

await setDoc(
doc(db, "customerProfiles", uid),
{
customerType: "driver",
driverName: driverName.trim(),
driverPhone: nPhone,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);
} else {
const nPhone = normalizeUSPhone(fleetCompanyPhone);
if (!nPhone) throw new Error("Invalid company phone number.");

await setDoc(
doc(db, "users", uid),
{
role: forcedRole,
customerType: "fleet",
email: e,
name: fleetCompanyName.trim(),
phone: nPhone,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

await setDoc(
doc(db, "customerProfiles", uid),
{
customerType: "fleet",
companyName: fleetCompanyName.trim(),
companyPhone: nPhone,
companyAddress: customerAddress.trim() || null,
dotNumber: dotNumber.trim() || null,
mcNumber: mcNumber.trim() || null,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);
}

// Always go to dashboard router so it redirects correctly
router.replace("/dashboard");
} catch (e: any) {
setErr(e?.message ? String(e.message) : "Failed to register.");
} finally {
creatingRef.current = false;
setBusy(false);
}
}

if (!authReady) return null;

return (
<main className="min-h-screen bg-white p-6">
<div className="max-w-xl mx-auto">
<h1 className="text-3xl font-bold">Create Account</h1>
<p className="text-sm text-gray-600 mt-1">
Providers: company name/phone/address required + provider types. Customers: Driver or Fleet/Company.
</p>

{err ? (
<div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

<div className="mt-6 border rounded-2xl p-6 space-y-4">
<div>
<label className="block text-sm font-medium mb-1">Account type</label>
<select
className="border rounded-lg p-2 w-full"
value={role}
onChange={(ev) => setRole(ev.target.value as RoleChoice)}
disabled={busy}
>
<option value="provider">Provider</option>
<option value="customer">Customer</option>
</select>
</div>

<div className="grid sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Email</label>
<input
className="border rounded-lg p-2 w-full"
value={email}
onChange={(ev) => setEmail(ev.target.value)}
placeholder="you@example.com"
disabled={busy}
autoComplete="email"
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Password</label>
<input
type="password"
className="border rounded-lg p-2 w-full"
value={password}
onChange={(ev) => setPassword(ev.target.value)}
placeholder="Min 6 characters"
disabled={busy}
autoComplete="new-password"
/>
</div>
</div>

{role === "provider" ? (
<>
<div className="border rounded-xl p-4 space-y-3">
<div className="text-sm font-semibold">
Company Info <span className="text-red-600">*</span>
</div>

<div>
<label className="block text-sm font-medium mb-1">
Company / Provider Name <span className="text-red-600">*</span>
</label>
<input
className="border rounded-lg p-2 w-full"
value={companyName}
onChange={(ev) => setCompanyName(ev.target.value)}
placeholder="Example: Big Diesel Roadside"
disabled={busy}
/>
</div>

<PhoneInput
label="Company Phone"
required
value={companyPhone}
onChange={setCompanyPhone}
disabled={busy}
/>

<div>
<label className="block text-sm font-medium mb-1">
Company Address <span className="text-red-600">*</span>
</label>
<input
className="border rounded-lg p-2 w-full"
value={companyAddress}
onChange={(ev) => setCompanyAddress(ev.target.value)}
placeholder="Street, City, State, ZIP"
disabled={busy}
/>
</div>

<div className="grid sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Contact Name (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={contactName}
onChange={(ev) => setContactName(ev.target.value)}
placeholder="Dispatcher / Manager"
disabled={busy}
/>
</div>

<PhoneInput
label="Contact Phone (optional)"
value={contactPhone}
onChange={setContactPhone}
disabled={busy}
/>
</div>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input
type="checkbox"
checked={dispatch247}
onChange={() => setDispatch247((v) => !v)}
disabled={busy}
/>
<span className="text-sm">24/7 Dispatch</span>
</label>

<label className="flex items-center gap-2 border rounded-lg p-3">
<input
type="checkbox"
checked={emergencyRoadside}
onChange={() => setEmergencyRoadside((v) => !v)}
disabled={busy}
/>
<span className="text-sm">Emergency Roadside Assistance</span>
</label>
</div>

<div className="border rounded-xl p-4">
<div className="text-sm font-semibold">
Provider Types <span className="text-red-600">*</span>{" "}
<span className="text-xs font-normal text-gray-600">(select all that apply)</span>
</div>

<div className="mt-3 grid sm:grid-cols-2 gap-2">
{PROVIDER_TYPES.map((t) => {
const checked = providerTypes.includes(t);
return (
<label
key={t}
className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
>
<input
type="checkbox"
checked={checked}
onChange={() => toggleProviderType(t)}
disabled={busy}
/>
<span className="text-sm">{t}</span>
</label>
);
})}
</div>

{providerTypes.length === 0 ? (
<div className="mt-2 text-xs text-red-700">Please select at least one provider type.</div>
) : (
<div className="mt-2 text-xs text-gray-600">
Selected: <b>{providerTypes.length}</b>
</div>
)}
</div>
</>
) : (
<div className="border rounded-xl p-4 space-y-3">
<div className="text-sm font-semibold">
Customer Info <span className="text-red-600">*</span>
</div>

<div>
<label className="block text-sm font-medium mb-1">Customer Type</label>
<select
className="border rounded-lg p-2 w-full"
value={customerType}
onChange={(e) => setCustomerType(e.target.value as CustomerType)}
disabled={busy}
>
<option value="driver">Driver</option>
<option value="fleet">Fleet / Company</option>
</select>
</div>

{customerType === "driver" ? (
<div className="grid sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">
Driver Name <span className="text-red-600">*</span>
</label>
<input
className="border rounded-lg p-2 w-full"
value={driverName}
onChange={(ev) => setDriverName(ev.target.value)}
placeholder="Driver name"
disabled={busy}
/>
</div>

<PhoneInput
label="Driver Phone"
required
value={driverPhone}
onChange={setDriverPhone}
disabled={busy}
/>
</div>
) : (
<>
<div className="grid sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">
Company Name <span className="text-red-600">*</span>
</label>
<input
className="border rounded-lg p-2 w-full"
value={fleetCompanyName}
onChange={(ev) => setFleetCompanyName(ev.target.value)}
placeholder="Company / Fleet name"
disabled={busy}
/>
</div>

<PhoneInput
label="Company Phone"
required
value={fleetCompanyPhone}
onChange={setFleetCompanyPhone}
disabled={busy}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Company Address (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={customerAddress}
onChange={(ev) => setCustomerAddress(ev.target.value)}
placeholder="Street, City, State, ZIP"
disabled={busy}
/>
</div>

<div className="grid sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">DOT Number (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={dotNumber}
onChange={(ev) => setDotNumber(ev.target.value)}
placeholder="DOT #"
disabled={busy}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">MC Number (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={mcNumber}
onChange={(ev) => setMcNumber(ev.target.value)}
placeholder="MC #"
disabled={busy}
/>
</div>
</div>
</>
)}
</div>
)}

<button
onClick={submit}
disabled={busy || !canSubmit}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{busy ? "Creating…" : "Create Account"}
</button>

<button
type="button"
onClick={() => router.push("/auth/sign-in")}
className="w-full border rounded-lg py-3 font-medium hover:bg-gray-50"
disabled={busy}
>
Already have an account? Sign in
</button>
</div>
</div>
</main>
);
}

