"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import ProviderNotificationsBadge from "@/components/ProviderNotificationsBadge";

type UserRole =
| "driver"
| "fleet"
| "truck_repair_shop"
| "mobile_mechanic"
| "towing"
| "tire_shop"
"auto_repair_shop"
| "mobile_tire";

function formatRole(role: UserRole | null) {
if (!role) return "—";
switch (role) {
case "repair_shop":
return "Repair Shop";
case "tire_shop":
return "Tire Shop";
case "mobile_mechanic":
return "Mobile Mechanic";
case "mobile_tire":
return "Mobile Tire";
default:
return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
}

export default function ProviderDashboardPage() {
const router = useRouter();

const [loading, setLoading] = useState(true);
const [uid, setUid] = useState<string | null>(null);
const [role, setRole] = useState<UserRole | null>(null);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (user) => {
try {
setError(null);

if (!user) {
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

const snap = await getDoc(doc(db, "users", user.uid));
const data = snap.exists() ? (snap.data() as any) : null;
const r = (data?.role as UserRole) ?? null;

// Only providers should be here
if (!r || r === "driver" || r === "fleet") {
router.push("/dashboard");
return;
}

setRole(r);
setLoading(false);
} catch (e: any) {
setError(e?.message ?? "Failed to load provider dashboard.");
setLoading(false);
}
});

return () => unsub();
}, [router]);

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-2xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading provider dashboard…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-2xl mx-auto">
<div className="flex items-start justify-between gap-4">
<div>
<h1 className="text-3xl font-bold text-gray-900">Provider Dashboard</h1>
<p className="text-gray-600 mt-1">
Role: <span className="font-medium text-gray-900">{formatRole(role)}</span>
</p>
</div>

<div className="flex items-center gap-2">
<ProviderNotificationsBadge />
<button
onClick={() => router.push("/provider/notifications")}
className="border border-gray-300 text-gray-900 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Notifications
</button>
</div>
</div>

{error ? (
<p className="mt-5 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
{error}
</p>
) : null}

<div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
<button
onClick={() => router.push("/provider/jobs/available")}
className="w-full bg-black text-white rounded-lg py-3 font-medium hover:opacity-90"
>
Available Jobs
</button>

{/* ✅ FIX: “My Jobs” should NOT go to Available Jobs */}
<button
onClick={() => router.push("/provider/jobs/active")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
My Jobs (Active)
</button>

{/* ✅ Ensure My Bids exists on dashboard */}
<button
onClick={() => router.push("/provider/jobs/bids")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
My Bids
</button>

<button
onClick={() => router.push("/provider/jobs/completed")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Completed Jobs
</button>

{/* ✅ FIX: Provider Profile should go to provider profile, not /providers (customer “Find Providers”) */}
<button
onClick={() => router.push("/provider/profile")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Provider Profile
</button>

<button
onClick={() => router.push("/dashboard")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back (Main Dashboard)
</button>
</div>

{uid ? (
<div className="mt-6 text-xs text-gray-500">
Provider UID: <span className="font-mono">{uid}</span>
</div>
) : null}
</div>
</main>
);
}

