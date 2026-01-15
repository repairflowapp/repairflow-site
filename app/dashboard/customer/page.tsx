"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
deleteDoc,
doc,
getDoc,
limit,
onSnapshot,
orderBy,
query,
serverTimestamp,
setDoc,
updateDoc,
where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import SignOutButton from "@/components/SignOutButton";
import NotificationsBell from "@/components/NotificationsBell";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";

type JobStatus =
| "open"
| "bidding"
| "pending_provider_confirmation"
| "pending_customer_confirmation"
| "accepted"
| "assigned"
| "enroute"
| "on_site"
| "onsite"
| "in_progress"
| "completed"
| "canceled"
| "cancelled"
| string;

type RoadsideRequest = {
id: string;
createdByUid?: string | null;
customerUid?: string | null;

status?: JobStatus;
issueType?: string;

pickupAddress?: string;
dropoffAddress?: string;
addressFormatted?: string;
addressText?: string;
locationText?: string;

isEmergency?: boolean;
providerId?: string | null;

updatedAt?: any;
};

type CustomerProfile = {
customerUid: string;
customerType?: "driver" | "fleet";

// basics
name?: string | null;
email?: string | null;

// fleet/company extras
companyName?: string | null;
companyPhone?: string | null; // store as +1...
companyAddress?: string | null;
dotNumber?: string | null;
mcNumber?: string | null;

// attachments (URL-based for now)
businessRegistrationUrl?: string | null;
insuranceUrl?: string | null;

updatedAt?: any;
createdAt?: any;
};

type CustomerEmployeeRole = "driver" | "dispatcher" | "manager" | "admin" | "other";

type CustomerEmployee = {
id: string;
employeeNumber?: string | null;
name?: string | null;
email?: string | null;
phone?: string | null; // +1...
role?: CustomerEmployeeRole | string | null;
active?: boolean;
createdAt?: any;
updatedAt?: any;
};

type FleetUnit = {
id: string;
unitNumber?: string | null; // Truck/trailer number
year?: string | null;
make?: string | null;
model?: string | null;
vin?: string | null;
plate?: string | null;
color?: string | null;
createdAt?: any;
updatedAt?: any;
};

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type TabKey = "home" | "bids" | "active" | "completed" | "profile" | "employees" | "fleet";

function cleanStr(v: any) {
const s = String(v ?? "").trim();
return s ? s : "";
}

export default function CustomerDashboardPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [customerType, setCustomerType] = useState<"driver" | "fleet">("driver");
const [loading, setLoading] = useState(true);

const [tab, setTab] = useState<TabKey>("home");

const [requests, setRequests] = useState<RoadsideRequest[]>([]);
const [error, setError] = useState<string | null>(null);

// ----------------------------
// PROFILE (stored in customerProfiles/{uid})
// ----------------------------
const [profileLoading, setProfileLoading] = useState(false);
const [profileSaving, setProfileSaving] = useState(false);
const [profileErr, setProfileErr] = useState<string | null>(null);
const [profileOk, setProfileOk] = useState<string | null>(null);

const [profileName, setProfileName] = useState("");
const [profileEmail, setProfileEmail] = useState("");

const [companyName, setCompanyName] = useState("");
const [companyPhone, setCompanyPhone] = useState("");
const [companyAddress, setCompanyAddress] = useState("");
const [dotNumber, setDotNumber] = useState("");
const [mcNumber, setMcNumber] = useState("");

const [businessRegistrationUrl, setBusinessRegistrationUrl] = useState("");
const [insuranceUrl, setInsuranceUrl] = useState("");

// ----------------------------
// EMPLOYEES (customerProfiles/{uid}/employees)
// ----------------------------
const [empRows, setEmpRows] = useState<CustomerEmployee[]>([]);
const [empLoading, setEmpLoading] = useState(false);
const [empErr, setEmpErr] = useState<string | null>(null);

const [empCreating, setEmpCreating] = useState(false);
const [empEmployeeNumber, setEmpEmployeeNumber] = useState("");
const [empName, setEmpName] = useState("");
const [empEmail, setEmpEmail] = useState("");
const [empPhone, setEmpPhone] = useState("");
const [empRole, setEmpRole] = useState<CustomerEmployeeRole>("driver");

const [empEditingId, setEmpEditingId] = useState<string | null>(null);
const [empEditEmployeeNumber, setEmpEditEmployeeNumber] = useState("");
const [empEditName, setEmpEditName] = useState("");
const [empEditEmail, setEmpEditEmail] = useState("");
const [empEditPhone, setEmpEditPhone] = useState("");
const [empEditRole, setEmpEditRole] = useState<CustomerEmployeeRole>("driver");
const [empEditActive, setEmpEditActive] = useState(true);
const [empSavingId, setEmpSavingId] = useState<string | null>(null);

// ----------------------------
// FLEET (STANDARDIZED ✅ customerProfiles/{uid}/fleetUnits)
// ----------------------------
const [fleetRows, setFleetRows] = useState<FleetUnit[]>([]);
const [fleetLoading, setFleetLoading] = useState(false);
const [fleetErr, setFleetErr] = useState<string | null>(null);

const [fleetCreating, setFleetCreating] = useState(false);
const [unitNumber, setUnitNumber] = useState("");
const [unitYear, setUnitYear] = useState("");
const [unitMake, setUnitMake] = useState("");
const [unitModel, setUnitModel] = useState("");
const [unitVin, setUnitVin] = useState("");
const [unitPlate, setUnitPlate] = useState("");
const [unitColor, setUnitColor] = useState("");

const [fleetEditingId, setFleetEditingId] = useState<string | null>(null);
const [editUnitNumber, setEditUnitNumber] = useState("");
const [editUnitYear, setEditUnitYear] = useState("");
const [editUnitMake, setEditUnitMake] = useState("");
const [editUnitModel, setEditUnitModel] = useState("");
const [editUnitVin, setEditUnitVin] = useState("");
const [editUnitPlate, setEditUnitPlate] = useState("");
const [editUnitColor, setEditUnitColor] = useState("");
const [fleetSavingId, setFleetSavingId] = useState<string | null>(null);

// ----------------------------
// AUTH + USER LOAD
// ----------------------------
useEffect(() => {
const unsub = onAuthStateChanged(auth, async (user) => {
if (!user) {
router.replace("/auth/sign-in");
return;
}

setUid(user.uid);

try {
const snap = await getDoc(doc(db, "users", user.uid));
const data = snap.exists() ? (snap.data() as any) : null;
const ct: "driver" | "fleet" = data?.customerType === "fleet" ? "fleet" : "driver";
setCustomerType(ct);

// safety: if user becomes driver, force tab back off fleet-only tabs
setTab((prev) => {
if (ct === "driver" && (prev === "employees" || prev === "fleet" || prev === "profile")) return "home";
return prev;
});
} catch {
setCustomerType("driver");
setTab("home");
} finally {
setLoading(false);
}
});

return () => unsub();
}, [router]);

// ----------------------------
// LOAD REQUESTS
// (createdByUid first; fallback to customerUid)
// ----------------------------
useEffect(() => {
if (!uid) return;

setError(null);

const q1 = query(
collection(db, "roadsideRequests"),
where("createdByUid", "==", uid),
orderBy("updatedAt", "desc"),
limit(100)
);

let unsub: null | (() => void) = null;

unsub = onSnapshot(
q1,
(snap) => {
setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
setError(null);
},
async () => {
const q2 = query(
collection(db, "roadsideRequests"),
where("customerUid", "==", uid),
orderBy("updatedAt", "desc"),
limit(100)
);

try {
unsub?.();
} catch {}

unsub = onSnapshot(
q2,
(snap) => {
setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
setError(null);
},
(e) => setError(e?.message || "Failed to load requests.")
);
}
);

return () => {
try {
unsub?.();
} catch {}
};
}, [uid]);

// ----------------------------
// STATUS GROUPS
// ----------------------------
const bidStatuses: JobStatus[] = useMemo(
() => ["open", "bidding", "pending_provider_confirmation", "pending_customer_confirmation"],
[]
);

const activeStatuses: JobStatus[] = useMemo(
() => ["accepted", "assigned", "enroute", "on_site", "onsite", "in_progress"],
[]
);

const completedStatuses: JobStatus[] = useMemo(() => ["completed", "canceled", "cancelled"], []);

const bidsOpen = useMemo(
() => requests.filter((r) => r.status && bidStatuses.includes(r.status)),
[requests, bidStatuses]
);

const activeJobs = useMemo(
() => requests.filter((r) => r.status && activeStatuses.includes(r.status)),
[requests, activeStatuses]
);

const completedJobs = useMemo(
() => requests.filter((r) => r.status && completedStatuses.includes(r.status)),
[requests, completedStatuses]
);

const roleLabel = customerType === "fleet" ? "Fleet / Company" : "Driver";

const tabs = useMemo(() => {
const base: Array<{ key: TabKey; label: string }> = [
{ key: "home", label: "Home" },
{ key: "bids", label: `Bids / Open (${bidsOpen.length})` },
{ key: "active", label: `Active Jobs (${activeJobs.length})` },
{ key: "completed", label: `Completed (${completedJobs.length})` },
];

// Fleet-only tabs
// ✅ requested order: Employees, Fleet, Profile (Profile last)
if (customerType === "fleet") {
base.push({ key: "employees", label: "Employees" });
base.push({ key: "fleet", label: "My Fleet" });
base.push({ key: "profile", label: "Profile" });
}

return base;
}, [customerType, bidsOpen.length, activeJobs.length, completedJobs.length]);

// ----------------------------
// LOAD PROFILE (fleet-only)
// ----------------------------
async function loadProfile() {
if (!uid) return;
if (customerType !== "fleet") return;

setProfileErr(null);
setProfileOk(null);
setProfileLoading(true);

try {
const userSnap = await getDoc(doc(db, "users", uid));
const userData = userSnap.exists() ? (userSnap.data() as any) : null;

const profRef = doc(db, "customerProfiles", uid);
const profSnap = await getDoc(profRef);
const prof = profSnap.exists() ? (profSnap.data() as any) : null;

setProfileName(cleanStr(prof?.name || userData?.name || userData?.displayName || ""));
setProfileEmail(cleanStr(prof?.email || userData?.email || auth.currentUser?.email || ""));

setCompanyName(cleanStr(prof?.companyName || ""));
setCompanyPhone(cleanStr(prof?.companyPhone || ""));
setCompanyAddress(cleanStr(prof?.companyAddress || ""));
setDotNumber(cleanStr(prof?.dotNumber || ""));
setMcNumber(cleanStr(prof?.mcNumber || ""));

setBusinessRegistrationUrl(cleanStr(prof?.businessRegistrationUrl || ""));
setInsuranceUrl(cleanStr(prof?.insuranceUrl || ""));
} catch (e: any) {
setProfileErr(e?.message || "Failed to load profile.");
} finally {
setProfileLoading(false);
}
}

useEffect(() => {
if (!uid) return;
if (customerType !== "fleet") return;

loadProfile();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, customerType]);

async function saveProfile() {
if (!uid) return;
if (customerType !== "fleet") return;

setProfileErr(null);
setProfileOk(null);

if (!companyName.trim()) return setProfileErr("Company Name is required.");
if (!isValidUSPhone(companyPhone)) return setProfileErr("Enter a valid Company Phone (US) for Twilio (+1).");

setProfileSaving(true);
try {
const ref = doc(db, "customerProfiles", uid);

const payload: CustomerProfile = {
customerUid: uid,
customerType: "fleet",

name: profileName.trim() || null,
email: profileEmail.trim().toLowerCase() || null,

companyName: companyName.trim() || null,
companyPhone: normalizeUSPhone(companyPhone),
companyAddress: companyAddress.trim() || null,
dotNumber: dotNumber.trim() || null,
mcNumber: mcNumber.trim() || null,

businessRegistrationUrl: businessRegistrationUrl.trim() || null,
insuranceUrl: insuranceUrl.trim() || null,

updatedAt: serverTimestamp(),
createdAt: serverTimestamp(),
};

await setDoc(ref, payload, { merge: true });

await setDoc(
doc(db, "users", uid),
{
name: profileName.trim() || null,
email: profileEmail.trim().toLowerCase() || null,
customerType: "fleet",
updatedAt: serverTimestamp(),
},
{ merge: true }
);

setProfileOk("Saved ✅");
setTimeout(() => setProfileOk(null), 2500);
} catch (e: any) {
setProfileErr(e?.message || "Failed to save profile.");
} finally {
setProfileSaving(false);
}
}

// ----------------------------
// EMPLOYEES (fleet-only)
// ----------------------------
useEffect(() => {
if (!uid) return;
if (customerType !== "fleet") return;

setEmpLoading(true);
setEmpErr(null);

const q = query(collection(db, "customerProfiles", uid, "employees"), orderBy("createdAt", "desc"));

const unsub = onSnapshot(
q,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CustomerEmployee[];
rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
setEmpRows(rows);
setEmpLoading(false);
},
(e) => {
setEmpRows([]);
setEmpErr(e?.message || "Failed to load employees.");
setEmpLoading(false);
}
);

return () => unsub();
}, [uid, customerType]);

async function createEmployee() {
if (!uid) return;
setEmpErr(null);

if (!empName.trim()) return setEmpErr("Employee name is required.");
if (!empEmail.trim() || !empEmail.includes("@")) return setEmpErr("Employee email is required.");
if (!isValidUSPhone(empPhone)) return setEmpErr("Employee phone must be valid (Twilio +1).");

setEmpCreating(true);
try {
await addDoc(collection(db, "customerProfiles", uid, "employees"), {
employeeNumber: empEmployeeNumber.trim() || null,
name: empName.trim(),
email: empEmail.trim().toLowerCase(),
phone: normalizeUSPhone(empPhone),
role: empRole,
active: true,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

setEmpEmployeeNumber("");
setEmpName("");
setEmpEmail("");
setEmpPhone("");
setEmpRole("driver");
} catch (e: any) {
setEmpErr(e?.message || "Failed to create employee.");
} finally {
setEmpCreating(false);
}
}

function startEditEmployee(e: CustomerEmployee) {
setEmpEditingId(e.id);
setEmpEditEmployeeNumber(cleanStr(e.employeeNumber || ""));
setEmpEditName(cleanStr(e.name || ""));
setEmpEditEmail(cleanStr(e.email || ""));
setEmpEditPhone(cleanStr(e.phone || ""));
setEmpEditRole((e.role as any) || "driver");
setEmpEditActive(e.active !== false);
}

function cancelEditEmployee() {
setEmpEditingId(null);
}

async function saveEmployee(empId: string) {
if (!uid) return;
setEmpErr(null);

if (!empEditName.trim()) return setEmpErr("Employee name is required.");
if (!empEditEmail.trim() || !empEditEmail.includes("@")) return setEmpErr("Employee email is required.");
if (!isValidUSPhone(empEditPhone)) return setEmpErr("Employee phone must be valid (Twilio +1).");

setEmpSavingId(empId);
try {
await updateDoc(doc(db, "customerProfiles", uid, "employees", empId), {
employeeNumber: empEditEmployeeNumber.trim() || null,
name: empEditName.trim(),
email: empEditEmail.trim().toLowerCase(),
phone: normalizeUSPhone(empEditPhone),
role: empEditRole,
active: !!empEditActive,
updatedAt: serverTimestamp(),
});

setEmpEditingId(null);
} catch (e: any) {
setEmpErr(e?.message || "Failed to save employee.");
} finally {
setEmpSavingId(null);
}
}

async function deleteEmployee(empId: string) {
if (!uid) return;
if (!confirm("Delete this employee entry?")) return;

setEmpErr(null);
try {
await deleteDoc(doc(db, "customerProfiles", uid, "employees", empId));
if (empEditingId === empId) setEmpEditingId(null);
} catch (e: any) {
setEmpErr(e?.message || "Failed to delete employee.");
}
}

// ----------------------------
// FLEET (fleet-only)
// ✅ FIX: use customerProfiles/{uid}/fleetUnits (matches your rules)
// ----------------------------
useEffect(() => {
if (!uid) return;
if (customerType !== "fleet") return;

setFleetLoading(true);
setFleetErr(null);

const q = query(collection(db, "customerProfiles", uid, "fleetUnits"), orderBy("createdAt", "desc"));

const unsub = onSnapshot(
q,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FleetUnit[];
rows.sort((a, b) => String(a.unitNumber || "").localeCompare(String(b.unitNumber || "")));
setFleetRows(rows);
setFleetLoading(false);
},
(e) => {
setFleetRows([]);
setFleetErr(e?.message || "Failed to load fleet.");
setFleetLoading(false);
}
);

return () => unsub();
}, [uid, customerType]);

async function createFleetUnit() {
if (!uid) return;
setFleetErr(null);

if (!unitNumber.trim()) return setFleetErr("Truck / trailer number is required.");

setFleetCreating(true);
try {
await addDoc(collection(db, "customerProfiles", uid, "fleetUnits"), {
unitNumber: unitNumber.trim(),
year: unitYear.trim() || null,
make: unitMake.trim() || null,
model: unitModel.trim() || null,
vin: unitVin.trim() || null,
plate: unitPlate.trim() || null,
color: unitColor.trim() || null,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

setUnitNumber("");
setUnitYear("");
setUnitMake("");
setUnitModel("");
setUnitVin("");
setUnitPlate("");
setUnitColor("");
} catch (e: any) {
setFleetErr(e?.message || "Failed to create fleet entry.");
} finally {
setFleetCreating(false);
}
}

function startEditFleet(u: FleetUnit) {
setFleetEditingId(u.id);
setEditUnitNumber(cleanStr(u.unitNumber || ""));
setEditUnitYear(cleanStr(u.year || ""));
setEditUnitMake(cleanStr(u.make || ""));
setEditUnitModel(cleanStr(u.model || ""));
setEditUnitVin(cleanStr(u.vin || ""));
setEditUnitPlate(cleanStr(u.plate || ""));
setEditUnitColor(cleanStr(u.color || ""));
}

function cancelEditFleet() {
setFleetEditingId(null);
}

async function saveFleetUnit(unitId: string) {
if (!uid) return;
setFleetErr(null);

if (!editUnitNumber.trim()) return setFleetErr("Truck / trailer number is required.");

setFleetSavingId(unitId);
try {
await updateDoc(doc(db, "customerProfiles", uid, "fleetUnits", unitId), {
unitNumber: editUnitNumber.trim(),
year: editUnitYear.trim() || null,
make: editUnitMake.trim() || null,
model: editUnitModel.trim() || null,
vin: editUnitVin.trim() || null,
plate: editUnitPlate.trim() || null,
color: editUnitColor.trim() || null,
updatedAt: serverTimestamp(),
});

setFleetEditingId(null);
} catch (e: any) {
setFleetErr(e?.message || "Failed to save fleet entry.");
} finally {
setFleetSavingId(null);
}
}

async function deleteFleetUnit(unitId: string) {
if (!uid) return;
if (!confirm("Delete this fleet entry?")) return;

setFleetErr(null);
try {
await deleteDoc(doc(db, "customerProfiles", uid, "fleetUnits", unitId));
if (fleetEditingId === unitId) setFleetEditingId(null);
} catch (e: any) {
setFleetErr(e?.message || "Failed to delete fleet entry.");
}
}

// ----------------------------
// RENDER
// ----------------------------
if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="border rounded-2xl p-6">Loading…</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-5xl mx-auto">
<div className="flex justify-between items-start gap-4">
<div>
<h1 className="text-3xl font-bold">Customer Dashboard</h1>
<p className="text-sm text-gray-600 mt-1">Customer Type: {roleLabel}</p>
</div>

<div className="flex gap-2 items-center">
<NotificationsBell />
<button onClick={() => router.push("/requests")} className="border rounded-lg px-4 py-2 font-medium">
My Requests
</button>
<SignOutButton />
</div>
</div>

{error ? (
<div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>
) : null}

{/* Tabs */}
<div className="mt-6 flex flex-wrap gap-2 items-center">
{tabs.map((t) => (
<button
key={t.key}
onClick={() => setTab(t.key)}
className={`px-4 py-2 rounded-lg border font-medium ${
tab === t.key ? "bg-black text-white" : "border-gray-300 hover:bg-gray-50"
}`}
>
{t.label}
</button>
))}

<button
onClick={() => router.push("/providers")}
className="ml-auto px-4 py-2 border rounded-lg font-medium border-gray-300 hover:bg-gray-50"
>
Provider Directory →
</button>
</div>

{/* HOME */}
{tab === "home" ? (
<div className="mt-6 border rounded-2xl p-6">
<div className="grid md:grid-cols-2 gap-3">
<button onClick={() => router.push("/requests/new")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>Create Roadside Request</b>
<div className="text-sm text-gray-600 mt-1">Start a new job and receive bids.</div>
</button>

<button onClick={() => setTab("bids")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>View Bids / Open Requests</b>
<div className="text-sm text-gray-600 mt-1">Requests waiting for provider bids or confirmation.</div>
</button>

<button onClick={() => setTab("active")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>View Active Jobs</b>
<div className="text-sm text-gray-600 mt-1">Accepted / assigned / enroute / onsite / in progress.</div>
</button>

<button onClick={() => setTab("completed")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>View Completed</b>
<div className="text-sm text-gray-600 mt-1">Completed or cancelled jobs.</div>
</button>

{/* Fleet-only quick actions */}
{customerType === "fleet" ? (
<>
<button onClick={() => setTab("employees")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>Employees</b>
<div className="text-sm text-gray-600 mt-1">Add/manage employees and roles.</div>
</button>

<button onClick={() => setTab("fleet")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>My Fleet</b>
<div className="text-sm text-gray-600 mt-1">Vehicles/units list — request service fast.</div>
</button>

<button onClick={() => setTab("profile")} className="border rounded-xl p-4 text-left hover:bg-gray-50">
<b>Profile</b>
<div className="text-sm text-gray-600 mt-1">Company info, DOT/MC, attachments, and phone (+1).</div>
</button>
</>
) : null}
</div>
</div>
) : null}

{/* BIDS / OPEN */}
{tab === "bids" ? (
<div className="mt-6 space-y-3">
{bidsOpen.length === 0 ? (
<div className="border rounded-xl p-4">No open requests / bids right now.</div>
) : (
bidsOpen.map((j) => (
<button
key={j.id}
onClick={() => router.push(`/requests/${j.id}`)}
className="w-full border rounded-xl p-4 text-left hover:bg-gray-50"
>
<div className="flex items-center justify-between gap-3">
<b>{titleCase(j.issueType || "Request")}</b>
<span className="text-xs border rounded-full px-3 py-1">{titleCase(j.status || "—")}</span>
</div>
<div className="text-sm text-gray-600 mt-2">{j.addressFormatted || j.addressText || j.locationText || "—"}</div>
<div className="text-xs text-gray-500 mt-1">{j.providerId ? "Provider selected" : "Open marketplace request"}</div>
</button>
))
)}
</div>
) : null}

{/* ACTIVE */}
{tab === "active" ? (
<div className="mt-6 space-y-3">
{activeJobs.length === 0 ? (
<div className="border rounded-xl p-4">No active jobs.</div>
) : (
activeJobs.map((j) => (
<button
key={j.id}
onClick={() => router.push(`/requests/${j.id}`)}
className="w-full border rounded-xl p-4 text-left hover:bg-gray-50"
>
<div className="flex items-center justify-between gap-3">
<b>{titleCase(j.issueType || "Request")}</b>
<span className="text-xs border rounded-full px-3 py-1">{titleCase(j.status || "—")}</span>
</div>
<div className="text-sm text-gray-600 mt-2">{j.addressFormatted || j.addressText || j.locationText || "—"}</div>
</button>
))
)}
</div>
) : null}

{/* COMPLETED */}
{tab === "completed" ? (
<div className="mt-6 space-y-3">
{completedJobs.length === 0 ? (
<div className="border rounded-xl p-4">No completed jobs.</div>
) : (
completedJobs.map((j) => (
<button
key={j.id}
onClick={() => router.push(`/requests/${j.id}`)}
className="w-full border rounded-xl p-4 text-left hover:bg-gray-50"
>
<div className="flex items-center justify-between gap-3">
<b>{titleCase(j.issueType || "Request")}</b>
<span className="text-xs border rounded-full px-3 py-1">{titleCase(j.status || "—")}</span>
</div>
<div className="text-sm text-gray-600 mt-2">{j.addressFormatted || j.addressText || j.locationText || "—"}</div>
</button>
))
)}
</div>
) : null}

{/* PROFILE (fleet only) */}
{tab === "profile" && customerType === "fleet" ? (
<div className="mt-6 border rounded-2xl p-6">
<div className="flex items-center justify-between gap-3">
<div>
<div className="text-lg font-semibold">Profile</div>
<div className="text-sm text-gray-600 mt-1">Phone fields should be stored with +1 for Twilio.</div>
</div>

<button
type="button"
onClick={loadProfile}
className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
disabled={profileLoading || profileSaving}
>
{profileLoading ? "Loading…" : "Refresh"}
</button>
</div>

{profileErr ? (
<div className="mt-3 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{profileErr}</div>
) : null}
{profileOk ? (
<div className="mt-3 border border-green-200 bg-green-50 text-green-900 rounded-lg p-3 text-sm">{profileOk}</div>
) : null}

<div className="mt-4 grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Name</label>
<input
className="border rounded-lg p-2 w-full"
value={profileName}
onChange={(e) => setProfileName(e.target.value)}
disabled={profileSaving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Email</label>
<input
className="border rounded-lg p-2 w-full"
value={profileEmail}
onChange={(e) => setProfileEmail(e.target.value)}
disabled={profileSaving}
/>
</div>

<div className="md:col-span-2">
<label className="block text-sm font-medium mb-1">Company Name *</label>
<input
className="border rounded-lg p-2 w-full"
value={companyName}
onChange={(e) => setCompanyName(e.target.value)}
placeholder="Company / Fleet name"
disabled={profileSaving}
/>
</div>

<div className="md:col-span-2">
<PhoneInput
label="Phone (Twilio +1) *"
required
value={companyPhone}
onChange={setCompanyPhone}
disabled={profileSaving}
/>
<div className="text-xs text-gray-500 mt-1">Auto-formats to +1XXXXXXXXXX</div>
</div>

<div className="md:col-span-2">
<label className="block text-sm font-medium mb-1">Company Address (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={companyAddress}
onChange={(e) => setCompanyAddress(e.target.value)}
placeholder="Street, City, State, ZIP"
disabled={profileSaving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">DOT Number (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={dotNumber}
onChange={(e) => setDotNumber(e.target.value)}
placeholder="DOT #"
disabled={profileSaving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">MC Number (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={mcNumber}
onChange={(e) => setMcNumber(e.target.value)}
placeholder="MC #"
disabled={profileSaving}
/>
</div>
</div>

{/* Attachments */}
<div className="mt-5 border border-gray-200 rounded-xl p-4">
<div className="text-sm font-semibold">Attachments</div>
<div className="text-xs text-gray-600 mt-1">
For now, store document links/URLs. (We can wire real uploads to Firebase Storage next.)
</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Business Registration URL</label>
<input
className="border rounded-lg p-2 w-full"
value={businessRegistrationUrl}
onChange={(e) => setBusinessRegistrationUrl(e.target.value)}
placeholder="https://..."
disabled={profileSaving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Insurance Paperwork URL</label>
<input
className="border rounded-lg p-2 w-full"
value={insuranceUrl}
onChange={(e) => setInsuranceUrl(e.target.value)}
placeholder="https://..."
disabled={profileSaving}
/>
</div>
</div>
</div>

<button
type="button"
onClick={saveProfile}
disabled={profileSaving || !companyName.trim() || !isValidUSPhone(companyPhone)}
className="mt-4 bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{profileSaving ? "Saving…" : "Save Profile"}
</button>
</div>
) : null}

{/* EMPLOYEES (fleet only) */}
{tab === "employees" && customerType === "fleet" ? (
<div className="mt-6 border rounded-2xl p-6 space-y-4">
<div className="text-lg font-semibold">Employees</div>
<div className="text-sm text-gray-600">
Customer dashboard Employees form:
<br />
Employee #: Employee name: Employee Email: Employee phone: Role:
</div>

{empErr ? (
<div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{empErr}</div>
) : null}

{/* Create */}
<div className="border rounded-xl p-4">
<div className="text-sm font-semibold">Add employee</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Employee # (optional)</label>
<input
className="border rounded-lg p-2 w-full"
value={empEmployeeNumber}
onChange={(e) => setEmpEmployeeNumber(e.target.value)}
disabled={empCreating}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Role *</label>
<select
className="border rounded-lg p-2 w-full"
value={empRole}
onChange={(e) => setEmpRole(e.target.value as CustomerEmployeeRole)}
disabled={empCreating}
>
<option value="driver">Driver</option>
<option value="dispatcher">Dispatcher</option>
<option value="manager">Manager</option>
<option value="admin">Admin</option>
<option value="other">Other</option>
</select>
</div>

<div>
<label className="block text-sm font-medium mb-1">Employee name *</label>
<input
className="border rounded-lg p-2 w-full"
value={empName}
onChange={(e) => setEmpName(e.target.value)}
disabled={empCreating}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Employee Email *</label>
<input
className="border rounded-lg p-2 w-full"
value={empEmail}
onChange={(e) => setEmpEmail(e.target.value)}
disabled={empCreating}
/>
</div>

<div className="md:col-span-2">
<PhoneInput label="Employee phone *" required value={empPhone} onChange={setEmpPhone} disabled={empCreating} />
</div>
</div>

<button
type="button"
onClick={createEmployee}
disabled={empCreating}
className="mt-3 bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{empCreating ? "Creating…" : "Create Employee"}
</button>
</div>

{/* List */}
<div className="border rounded-xl p-4">
<div className="text-sm font-semibold mb-2">Employee list</div>

{empLoading ? (
<div className="text-sm text-gray-600">Loading…</div>
) : empRows.length === 0 ? (
<div className="text-sm text-gray-600">No employees yet.</div>
) : (
<div className="space-y-2">
{empRows.map((e) => {
const editing = empEditingId === e.id;
const saving = empSavingId === e.id;

return (
<div key={e.id} className="border rounded-xl p-3">
{!editing ? (
<>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{e.name || e.email || e.id}</div>
<div className="text-xs text-gray-600">
Role: <b>{String(e.role || "—")}</b> • Active: <b>{e.active === false ? "No" : "Yes"}</b>
</div>
</div>

<div className="text-sm text-gray-700 mt-1">
{e.employeeNumber ? <span>#{e.employeeNumber}</span> : null}
{e.employeeNumber && e.email ? <span> • </span> : null}
{e.email ? <span>{e.email}</span> : null}
{e.phone ? <span>{e.email ? " • " : ""}{e.phone}</span> : null}
</div>

<div className="mt-2 flex flex-wrap gap-2">
<button
type="button"
onClick={() => startEditEmployee(e)}
className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50"
>
Edit
</button>

<button
type="button"
onClick={() => deleteEmployee(e.id)}
className="border border-red-300 text-red-700 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-red-50"
>
Delete
</button>
</div>
</>
) : (
<>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">Edit employee</div>
<button
type="button"
onClick={cancelEditEmployee}
className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50"
disabled={saving}
>
Cancel
</button>
</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Employee #</label>
<input
className="border rounded-lg p-2 w-full"
value={empEditEmployeeNumber}
onChange={(ev) => setEmpEditEmployeeNumber(ev.target.value)}
disabled={saving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Role</label>
<select
className="border rounded-lg p-2 w-full"
value={empEditRole}
onChange={(ev) => setEmpEditRole(ev.target.value as CustomerEmployeeRole)}
disabled={saving}
>
<option value="driver">Driver</option>
<option value="dispatcher">Dispatcher</option>
<option value="manager">Manager</option>
<option value="admin">Admin</option>
<option value="other">Other</option>
</select>
</div>

<div>
<label className="block text-sm font-medium mb-1">Employee name</label>
<input
className="border rounded-lg p-2 w-full"
value={empEditName}
onChange={(ev) => setEmpEditName(ev.target.value)}
disabled={saving}
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Employee email</label>
<input
className="border rounded-lg p-2 w-full"
value={empEditEmail}
onChange={(ev) => setEmpEditEmail(ev.target.value)}
disabled={saving}
/>
</div>

<div className="md:col-span-2">
<PhoneInput label="Employee phone" required value={empEditPhone} onChange={setEmpEditPhone} disabled={saving} />
</div>
</div>

<label className="mt-3 flex items-center gap-2">
<input type="checkbox" checked={empEditActive} onChange={() => setEmpEditActive((v) => !v)} disabled={saving} />
<span className="text-sm">Active</span>
</label>

<div className="mt-3 flex gap-2">
<button
type="button"
onClick={() => saveEmployee(e.id)}
disabled={saving}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{saving ? "Saving…" : "Save"}
</button>

<button
type="button"
onClick={() => deleteEmployee(e.id)}
disabled={saving}
className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
>
Delete
</button>
</div>
</>
)}
</div>
);
})}
</div>
)}
</div>
</div>
) : null}

{/* MY FLEET (fleet only) */}
{tab === "fleet" && customerType === "fleet" ? (
<div className="mt-6 border rounded-2xl p-6 space-y-4">
<div className="text-lg font-semibold">My Fleet</div>
<div className="text-sm text-gray-600">
Fleet entry form:
<br />
Truck/trailer number, year, make, model, vin, plate, color
</div>

{fleetErr ? (
<div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{fleetErr}</div>
) : null}

{/* Create */}
<div className="border rounded-xl p-4">
<div className="text-sm font-semibold">Add unit</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Truck / trailer number *</label>
<input className="border rounded-lg p-2 w-full" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} disabled={fleetCreating} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Year</label>
<input className="border rounded-lg p-2 w-full" value={unitYear} onChange={(e) => setUnitYear(e.target.value)} disabled={fleetCreating} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Make</label>
<input className="border rounded-lg p-2 w-full" value={unitMake} onChange={(e) => setUnitMake(e.target.value)} disabled={fleetCreating} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Model</label>
<input className="border rounded-lg p-2 w-full" value={unitModel} onChange={(e) => setUnitModel(e.target.value)} disabled={fleetCreating} />
</div>

<div>
<label className="block text-sm font-medium mb-1">VIN</label>
<input className="border rounded-lg p-2 w-full" value={unitVin} onChange={(e) => setUnitVin(e.target.value)} disabled={fleetCreating} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Plate #</label>
<input className="border rounded-lg p-2 w-full" value={unitPlate} onChange={(e) => setUnitPlate(e.target.value)} disabled={fleetCreating} />
</div>

<div className="md:col-span-2">
<label className="block text-sm font-medium mb-1">Color</label>
<input className="border rounded-lg p-2 w-full" value={unitColor} onChange={(e) => setUnitColor(e.target.value)} disabled={fleetCreating} />
</div>
</div>

<button
type="button"
onClick={createFleetUnit}
disabled={fleetCreating}
className="mt-3 bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{fleetCreating ? "Creating…" : "Create Fleet Entry"}
</button>
</div>

{/* List */}
<div className="border rounded-xl p-4">
<div className="text-sm font-semibold mb-2">Fleet list</div>

{fleetLoading ? (
<div className="text-sm text-gray-600">Loading…</div>
) : fleetRows.length === 0 ? (
<div className="text-sm text-gray-600">No fleet entries yet.</div>
) : (
<div className="space-y-2">
{fleetRows.map((u) => {
const editing = fleetEditingId === u.id;
const saving = fleetSavingId === u.id;

return (
<div key={u.id} className="border rounded-xl p-3">
{!editing ? (
<>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{u.unitNumber || u.id}</div>
<div className="text-xs text-gray-600">
{u.year ? <span><b>{u.year}</b></span> : null}
{u.make ? <span>{u.year ? " " : ""}{u.make}</span> : null}
{u.model ? <span>{(u.year || u.make) ? " " : ""}{u.model}</span> : null}
</div>
</div>

<div className="text-sm text-gray-700 mt-1">
{u.vin ? <span>VIN: {u.vin}</span> : null}
{u.plate ? <span>{u.vin ? " • " : ""}Plate: {u.plate}</span> : null}
{u.color ? <span>{(u.vin || u.plate) ? " • " : ""}Color: {u.color}</span> : null}
</div>

<div className="mt-2 flex flex-wrap gap-2">
<button
type="button"
onClick={() => startEditFleet(u)}
className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50"
>
Edit
</button>

<button
type="button"
onClick={() => deleteFleetUnit(u.id)}
className="border border-red-300 text-red-700 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-red-50"
>
Delete
</button>
</div>
</>
) : (
<>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">Edit fleet entry</div>
<button
type="button"
onClick={cancelEditFleet}
className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50"
disabled={saving}
>
Cancel
</button>
</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Truck / trailer number *</label>
<input className="border rounded-lg p-2 w-full" value={editUnitNumber} onChange={(e) => setEditUnitNumber(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Year</label>
<input className="border rounded-lg p-2 w-full" value={editUnitYear} onChange={(e) => setEditUnitYear(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Make</label>
<input className="border rounded-lg p-2 w-full" value={editUnitMake} onChange={(e) => setEditUnitMake(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Model</label>
<input className="border rounded-lg p-2 w-full" value={editUnitModel} onChange={(e) => setEditUnitModel(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">VIN</label>
<input className="border rounded-lg p-2 w-full" value={editUnitVin} onChange={(e) => setEditUnitVin(e.target.value)} disabled={saving} />
</div>

<div>
<label className="block text-sm font-medium mb-1">Plate #</label>
<input className="border rounded-lg p-2 w-full" value={editUnitPlate} onChange={(e) => setEditUnitPlate(e.target.value)} disabled={saving} />
</div>

<div className="md:col-span-2">
<label className="block text-sm font-medium mb-1">Color</label>
<input className="border rounded-lg p-2 w-full" value={editUnitColor} onChange={(e) => setEditUnitColor(e.target.value)} disabled={saving} />
</div>
</div>

<div className="mt-3 flex gap-2">
<button
type="button"
onClick={() => saveFleetUnit(u.id)}
disabled={saving}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{saving ? "Saving…" : "Save"}
</button>

<button
type="button"
onClick={() => deleteFleetUnit(u.id)}
disabled={saving}
className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
>
Delete
</button>
</div>
</>
)}
</div>
);
})}
</div>
)}
</div>
</div>
) : null}
</div>
</main>
);
}