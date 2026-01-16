// app/dashboard/provider/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import NotificationsBell from "@/components/NotificationsBell";

import AvailableTab from "@/components/providerTabs/AvailableTab";
import MyBidsTab from "@/components/providerTabs/MyBidsTab";
import ActiveTab from "@/components/providerTabs/ActiveTab";
import CompletedTab from "@/components/providerTabs/CompletedTab";
import DispatchTab from "@/components/providerTabs/DispatchTab";
import EmployeesTab from "@/components/providerTabs/EmployeesTab";
import ReviewsTab from "@/components/providerTabs/ReviewsTab";
import LocationsTab from "@/components/providerTabs/LocationsTab";
import ProfileTab from "@/components/providerTabs/ProfileTab";

/* ============================================================
HELPERS
============================================================ */

const TABS = [
"available",
"mybids",
"active",
"completed",
"dispatch",
"employees",
"locations",
"profile",
"reviews",
] as const;

type TabKey = (typeof TABS)[number];

function titleCase(s?: string) {
return (s || "")
.replace(/_/g, " ")
.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ============================================================
PAGE
============================================================ */

export default function ProviderDashboardPage() {
const router = useRouter();
const searchParams = useSearchParams();

const [uid, setUid] = useState<string | null>(null);
const [providerUid, setProviderUid] = useState<string | null>(null);

const [viewerRole, setViewerRole] = useState<
"provider" | "dispatcher" | "manager" | "admin" | "unknown"
>("unknown");

const [authReady, setAuthReady] = useState(false);

const tab =
(searchParams.get("tab") as TabKey) &&
TABS.includes(searchParams.get("tab") as TabKey)
? (searchParams.get("tab") as TabKey)
: "available";

/* ============================================================
AUTH
============================================================ */

useEffect(() => {
return onAuthStateChanged(auth, async (u) => {
setAuthReady(false);

if (!u) {
router.replace("/auth/sign-in");
return;
}

setUid(u.uid);

const userSnap = await getDoc(doc(db, "users", u.uid));
if (!userSnap.exists()) {
router.replace("/dashboard");
return;
}

const user = userSnap.data() as any;
const role = String(user.role || "");

if (role === "provider") {
setViewerRole("provider");
setProviderUid(user.providerUid || u.uid);
} else if (role === "employee") {
setProviderUid(user.providerUid);

// Detect dispatcher employee role (if doc exists)
try {
const empSnap = await getDoc(
doc(db, "providers", user.providerUid, "employees", u.uid)
);
const emp = empSnap.exists() ? empSnap.data() : null;
setViewerRole(emp?.role === "dispatcher" ? "dispatcher" : "unknown");
} catch {
setViewerRole("unknown");
}
} else if (role === "dispatcher" || role === "manager" || role === "admin") {
// role is already narrowed by the condition, no "as any" needed
setViewerRole(role);
setProviderUid(user.providerUid || null);
} else {
setViewerRole("unknown");
setProviderUid(user.providerUid || null);
}

setAuthReady(true);
});
}, [router]);

function setTab(next: TabKey) {
router.push(`/dashboard/provider?tab=${next}`);
}

async function doSignOut() {
await signOut(auth);
router.replace("/auth/sign-in");
}

if (!authReady || !providerUid) return null;

// Some provider tabs don't allow "admin" as a viewerRole.
// Treat "admin" as the highest provider-level permission.
const providerViewerRole = viewerRole === "admin" ? "manager" : viewerRole;

/* ============================================================
UI
============================================================ */

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-7xl mx-auto">
<div className="flex items-start justify-between">
<div>
<h1 className="text-3xl font-bold">Provider Dashboard</h1>
<div className="text-xs text-gray-500 mt-1">
uid=<b>{uid}</b> • providerUid=<b>{providerUid}</b> • role=
<b>{viewerRole}</b>
</div>
</div>

<div className="flex items-center gap-2">
<NotificationsBell />
<button
onClick={doSignOut}
className="border rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Sign Out
</button>
</div>
</div>

{/* Tabs */}
<div className="mt-6 flex flex-wrap gap-2">
{TABS.map((t) => (
<button
key={t}
onClick={() => setTab(t)}
className={`border rounded-lg px-4 py-2 text-sm ${
tab === t ? "bg-black text-white" : "hover:bg-gray-50"
}`}
>
{titleCase(t)}
</button>
))}
</div>

{/* Content */}
<div className="mt-6 border rounded-2xl p-6">
{tab === "available" && <AvailableTab providerUid={providerUid} />}
{tab === "mybids" && <MyBidsTab providerUid={providerUid} />}
{tab === "active" && <ActiveTab providerUid={providerUid} />}
{tab === "completed" && <CompletedTab providerUid={providerUid} />}

{tab === "dispatch" && <DispatchTab providerUid={providerUid} />}

{tab === "employees" && (
<EmployeesTab
providerUid={providerUid}
viewerRole={providerViewerRole}
/>
)}

{tab === "reviews" && <ReviewsTab providerUid={providerUid} />}

{tab === "profile" && (
<ProfileTab
providerUid={providerUid}
viewerRole={providerViewerRole}
/>
)}

{tab === "locations" && <LocationsTab providerUid={providerUid} />}
</div>
</div>
</main>
);
}

