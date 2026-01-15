"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function EmployeeDashboardPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [msg, setMsg] = useState("Loading…");
const [providerUid, setProviderUid] = useState<string | null>(null);
const [active, setActive] = useState<boolean | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
try {
if (!u) {
router.replace("/auth/sign-in");
return;
}
setUid(u.uid);

// users/{uid} should have role=employee, providerUid
const userSnap = await getDoc(doc(db, "users", u.uid));
if (!userSnap.exists()) {
setMsg("No user profile found.");
return;
}

const userData = userSnap.data() as any;
if (userData.role !== "employee") {
setMsg("This account is not an employee account.");
return;
}

const p = String(userData.providerUid || "").trim();
if (!p) {
setMsg("Missing provider link on employee account.");
return;
}
setProviderUid(p);

// check provider employee record for activation
const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
if (!empSnap.exists()) {
setMsg("Employee record not found under provider. Ask provider to approve you.");
setActive(false);
return;
}

const empData = empSnap.data() as any;
const isActive = empData.active === true && empData.pending !== true;
setActive(isActive);

if (!isActive) {
setMsg("Waiting for provider approval…");
return;
}

setMsg("Approved ✅");
} catch (e: any) {
setMsg(e?.message || "Failed to load employee dashboard.");
}
});

return () => unsub();
}, [router]);

async function doSignOut() {
await signOut(auth);
router.replace("/auth/sign-in");
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto space-y-4">
<div className="flex items-center justify-between gap-3">
<h1 className="text-2xl font-bold">Employee Dashboard</h1>
<button
onClick={doSignOut}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
Sign Out
</button>
</div>

<section className="border border-gray-200 rounded-2xl p-6">
<div className="text-sm text-gray-700">
<div>
<b>Status:</b> {msg}
</div>
{uid ? (
<div className="mt-2 text-xs text-gray-500">
Your UID: <span className="font-mono">{uid}</span>
</div>
) : null}

{providerUid ? (
<div className="mt-2 text-xs text-gray-500">
Provider UID: <span className="font-mono">{providerUid}</span>
</div>
) : null}

{active === true ? (
<div className="mt-4 text-sm text-gray-700">
Next: we’ll show your assigned dispatch jobs here.
</div>
) : (
<div className="mt-4 text-sm text-gray-700">
If you just signed up, ask the provider to go to <b>Provider Dashboard → Employees</b> and click{" "}
<b>Approve</b>.
</div>
)}
</div>
</section>
</div>
</main>
);
}
