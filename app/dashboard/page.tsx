"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export default function DashboardIndexRoute() {
const router = useRouter();

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
if (!u) {
router.replace("/auth/sign-in");
return;
}

try {
const userSnap = await getDoc(doc(db, "users", u.uid));
const user = userSnap.exists() ? (userSnap.data() as any) : null;
const role = String(user?.role || "");

// Provider owner
if (role === "provider") {
router.replace("/dashboard/provider?tab=dispatch");
return;
}

// Customer
if (role === "customer") {
router.replace("/dashboard/customer");
return;
}

// Employee: determine dispatcher vs tech from providers/{providerUid}/employees/{uid}
if (role === "employee") {
// ✅ IMPORTANT: include providerAccountId fallback too
const p = String(user?.providerUid || user?.providerId || user?.providerAccountId || "");
if (!p) {
router.replace("/auth/sign-in");
return;
}

const empSnap = await getDoc(doc(db, "providers", p, "employees", u.uid));
const emp = empSnap.exists() ? (empSnap.data() as any) : null;
const empRole = String(emp?.role || "");
const active = emp?.active !== false;

if (!active) {
router.replace("/dashboard/employee");
return;
}

if (empRole === "dispatcher") {
router.replace("/dashboard/provider?tab=dispatch");
return;
}

router.replace("/dashboard/employee");
return;
}

// Fallback
router.replace("/dashboard/customer");
} catch {
router.replace("/dashboard/customer");
}
});

return () => unsub();
}, [router]);

return null;
}

