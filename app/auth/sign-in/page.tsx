"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
signInWithEmailAndPassword,
sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

function friendlyAuthError(e: any) {
const code = String(e?.code || "");
if (code.includes("auth/invalid-email")) return "That email address doesn’t look valid.";
if (code.includes("auth/user-not-found")) return "No account found with that email.";
if (code.includes("auth/wrong-password")) return "Wrong password.";
if (code.includes("auth/invalid-credential")) return "Invalid email or password.";
if (code.includes("auth/too-many-requests")) return "Too many attempts. Try again later.";
return e?.message ?? "Something went wrong.";
}

export default function SignInPage() {
const router = useRouter();

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

const [loading, setLoading] = useState(false);
const [msg, setMsg] = useState<string | null>(null);
const [error, setError] = useState<string | null>(null);

async function handleSignIn(e: React.FormEvent) {
e.preventDefault();
setError(null);
setMsg(null);
setLoading(true);

try {
const normalizedEmail = email.trim().toLowerCase();
const cred = await signInWithEmailAndPassword(
auth,
normalizedEmail,
password
);

const uid = cred.user.uid;

// ----------------------------
// Load /users/{uid}
// ----------------------------
const userSnap = await getDoc(doc(db, "users", uid));
if (!userSnap.exists()) {
router.replace("/dashboard");
return;
}

const userData = userSnap.data() as any;
const role = String(userData.role || "");
const providerUid = String(userData.providerUid || userData.providerId || "");

// ----------------------------
// PROVIDER
// ----------------------------
if (role === "provider") {
router.replace("/dashboard/provider?tab=dispatch");
return;
}

// ----------------------------
// EMPLOYEE (dispatcher or tech)
// ----------------------------
if (role === "employee" && providerUid) {
const empSnap = await getDoc(
doc(db, "providers", providerUid, "employees", uid)
);

if (empSnap.exists()) {
const emp = empSnap.data() as any;
const empRole = String(emp.role || "");
const active = emp.active !== false;

if (active && empRole === "dispatcher") {
router.replace("/dashboard/provider?tab=dispatch");
return;
}
}

// fallback → tech dashboard
router.replace("/dashboard/employee");
return;
}

// ----------------------------
// CUSTOMER or UNKNOWN
// ----------------------------
router.replace("/dashboard");
} catch (e: any) {
setError(friendlyAuthError(e));
} finally {
setLoading(false);
}
}

async function handleResetPassword() {
setError(null);
setMsg(null);

const normalizedEmail = email.trim().toLowerCase();
if (!normalizedEmail) {
setError("Enter your email first, then click Reset password.");
return;
}

try {
await sendPasswordResetEmail(auth, normalizedEmail);
setMsg("Password reset email sent. Check your inbox (and spam).");
} catch (e: any) {
setError(friendlyAuthError(e));
}
}

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-md border border-gray-200 rounded-2xl p-8">
<h1 className="text-3xl font-bold text-gray-900 mb-6">Sign In</h1>

{error && (
<div className="border border-red-200 bg-red-50 rounded-xl p-4 mb-4 text-sm text-red-800">
{error}
</div>
)}

{msg && (
<div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-4 text-sm text-green-800">
{msg}
</div>
)}

<form onSubmit={handleSignIn} className="space-y-3">
<input
className="w-full border border-gray-300 rounded-lg px-3 py-3"
placeholder="Email"
type="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
autoComplete="email"
/>

<input
className="w-full border border-gray-300 rounded-lg px-3 py-3"
placeholder="Password"
type="password"
value={password}
onChange={(e) => setPassword(e.target.value)}
autoComplete="current-password"
/>

<button
disabled={loading}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-60"
type="submit"
>
{loading ? "Signing in…" : "Sign In"}
</button>
</form>

<div className="mt-4 space-y-2">
<button
onClick={handleResetPassword}
className="w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
type="button"
>
Reset password
</button>
</div>
</div>
</main>
);
}

