"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function EmployeeSignInPage() {
const router = useRouter();
const [email, setEmail] = useState("");
const [pw, setPw] = useState("");
const [msg, setMsg] = useState<string | null>(null);
const [busy, setBusy] = useState(false);

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
if (!u) return;
// If already signed in, verify role then route
const snap = await getDoc(doc(db, "users", u.uid));
const role = snap.exists() ? (snap.data() as any).role : null;
if (role === "employee") router.replace("/employee");
else {
await signOut(auth);
setMsg("This account is not an employee account.");
}
});
return () => unsub();
}, [router]);

async function submit() {
setMsg(null);
setBusy(true);
try {
const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pw);

const snap = await getDoc(doc(db, "users", cred.user.uid));
const role = snap.exists() ? (snap.data() as any).role : null;

if (role !== "employee") {
await signOut(auth);
setMsg("This login is not an employee account.");
return;
}

router.replace("/employee");
} catch (e: any) {
setMsg(e?.message || "Failed to sign in.");
} finally {
setBusy(false);
}
}

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-md border border-gray-200 rounded-2xl p-8">
<h1 className="text-xl font-bold mb-2">Employee Sign In</h1>
<p className="text-sm text-gray-600 mb-6">Use your employee email + temporary password.</p>

{msg ? <div className="text-sm text-red-600 mb-4">{msg}</div> : null}

<label className="text-sm font-semibold">Email</label>
<input
className="w-full border rounded-lg px-3 py-2 mt-1 mb-3"
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder="employee@company.com"
/>

<label className="text-sm font-semibold">Password</label>
<input
type="password"
className="w-full border rounded-lg px-3 py-2 mt-1 mb-4"
value={pw}
onChange={(e) => setPw(e.target.value)}
placeholder="Temporary password"
onKeyDown={(e) => (e.key === "Enter" ? submit() : null)}
/>

<button
onClick={submit}
disabled={busy}
className="w-full bg-black text-white font-bold py-2 rounded-lg disabled:opacity-60"
>
{busy ? "Signing in…" : "Sign In"}
</button>
</div>
</main>
);
}

