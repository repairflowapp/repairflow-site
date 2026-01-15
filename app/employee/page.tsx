"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function EmployeeHomePage() {
const router = useRouter();
const [msg, setMsg] = useState("Loading employee portal…");

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
if (!u) {
router.replace("/employee/auth/sign-in");
return;
}

const snap = await getDoc(doc(db, "users", u.uid));
const data = snap.exists() ? (snap.data() as any) : null;

if (!data || data.role !== "employee") {
await signOut(auth);
router.replace("/employee/auth/sign-in");
return;
}

setMsg(`Welcome! (Provider: ${data.providerId || "unknown"})`);
// Later: route to /employee/jobs etc
});

return () => unsub();
}, [router]);

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-lg border border-gray-200 rounded-2xl p-8">
<h1 className="text-xl font-bold mb-2">Employee Portal</h1>
<p className="text-gray-700">{msg}</p>
</div>
</main>
);
}