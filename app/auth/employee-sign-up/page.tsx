"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
createUserWithEmailAndPassword,
onAuthStateChanged,
signOut,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type EmployeeRole = "tech" | "dispatcher";

export default function EmployeeSignUpPage() {
const router = useRouter();

const [checking, setChecking] = useState(true);

const [providerUid, setProviderUid] = useState("");
const [role, setRole] = useState<EmployeeRole>("tech");
const [name, setName] = useState("");
const [phone, setPhone] = useState("");

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

const [saving, setSaving] = useState(false);
const [err, setErr] = useState<string | null>(null);
const [ok, setOk] = useState<string | null>(null);

// If already signed in, sign out so the employee can create their own account cleanly
useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
try {
if (u) await signOut(auth);
} finally {
setChecking(false);
}
});
return () => unsub();
}, []);

async function submit() {
setErr(null);
setOk(null);

const p = providerUid.trim();
const e = email.trim().toLowerCase();
const n = name.trim();
const ph = phone.trim();
const pw = password;

if (!p) return setErr("Provider UID is required.");
if (!e) return setErr("Email is required.");
if (!pw || pw.length < 6) return setErr("Password must be at least 6 characters.");
if (!n) return setErr("Name is required.");
if (!ph) return setErr("Phone is required.");

setSaving(true);
try {
// 1) Create Auth user (employee logs in with email+password)
const cred = await createUserWithEmailAndPassword(auth, e, pw);
const employeeUid = cred.user.uid;

// 2) Global user profile (used for routing + identity)
await setDoc(
doc(db, "users", employeeUid),
{
role: "employee",
providerUid: p,
name: n,
phone: ph,
email: e,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

// 3) ✅ Create PENDING request for provider approval
// Use employeeUid as the doc id so it's unique + easy to approve
await setDoc(
doc(db, "providers", p, "employeeRequests", employeeUid),
{
employeeUid,
providerUid: p,
email: e,
name: n,
phone: ph,
role,
status: "pending",
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

setOk("Account created! Waiting for provider approval.");
// Send them to /dashboard (your router should send employees to employee portal once you add that role)
router.replace("/dashboard");
} catch (e: any) {
setErr(e?.message || "Failed to create employee account.");
} finally {
setSaving(false);
}
}

if (checking) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-md border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-md border border-gray-200 rounded-2xl p-8">
<h1 className="text-2xl font-bold">Employee Sign Up</h1>
<p className="text-sm text-gray-600 mt-1">
Create an employee account under a provider (email + password). Provider must approve.
</p>

{err ? (
<div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

{ok ? (
<div className="mt-4 border border-green-200 bg-green-50 rounded-xl p-3 text-sm text-green-800">
{ok}
</div>
) : null}

<div className="mt-5 grid gap-3">
<div>
<label className="block text-sm font-medium mb-1">Provider UID *</label>
<input
className="border rounded-lg p-2 w-full"
value={providerUid}
onChange={(e) => setProviderUid(e.target.value)}
placeholder="Paste provider UID"
/>
<div className="text-xs text-gray-500 mt-1">
Provider UID = the provider’s Firebase Auth uid.
</div>
</div>

<div className="grid sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Role *</label>
<select
className="border rounded-lg p-2 w-full"
value={role}
onChange={(e) => setRole(e.target.value as EmployeeRole)}
>
<option value="tech">Technician</option>
<option value="dispatcher">Dispatcher</option>
</select>
</div>

<div>
<label className="block text-sm font-medium mb-1">Phone *</label>
<input
className="border rounded-lg p-2 w-full"
value={phone}
onChange={(e) => setPhone(e.target.value)}
placeholder="+15555555555"
/>
</div>
</div>

<div>
<label className="block text-sm font-medium mb-1">Full name *</label>
<input
className="border rounded-lg p-2 w-full"
value={name}
onChange={(e) => setName(e.target.value)}
placeholder="John Doe"
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Email *</label>
<input
className="border rounded-lg p-2 w-full"
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder="employee@email.com"
inputMode="email"
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">Password *</label>
<input
className="border rounded-lg p-2 w-full"
value={password}
onChange={(e) => setPassword(e.target.value)}
placeholder="Min 6 characters"
type="password"
/>
</div>

<button
onClick={submit}
disabled={saving}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{saving ? "Creating…" : "Create Employee Account"}
</button>

<button
onClick={() => router.replace("/auth/sign-in")}
className="w-full border rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Sign In
</button>
</div>
</div>
</main>
);
}

