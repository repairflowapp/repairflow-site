"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
collection,
doc,
getDoc,
onSnapshot,
orderBy,
query,
updateDoc,
limit,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type NotificationRow = {
id: string;
title?: string | null;
body?: string | null;
createdAt?: any;
read?: boolean;

// common fields you may have:
requestId?: string | null; // the roadside request id
link?: string | null; // optional direct link if you store one
targetRole?: "provider" | "customer" | "employee" | string | null;
type?: string | null;
};

function formatTime(ts: any) {
try {
if (!ts) return "";
const d = ts?.toDate ? ts.toDate() : new Date(ts);
return d.toLocaleString();
} catch {
return "";
}
}

export default function NotificationsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [role, setRole] = useState<string | null>(null);

const [rows, setRows] = useState<NotificationRow[]>([]);
const [loading, setLoading] = useState(true);

// Auth
useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => {
if (!u) {
router.push("/auth/sign-in");
return;
}
setUid(u.uid);
});
return () => unsub();
}, [router]);

// Load role (best-effort)
useEffect(() => {
if (!uid) return;

(async () => {
try {
// 1) Try users/{uid}.role
const userSnap = await getDoc(doc(db, "users", uid));
const userRole = userSnap.exists() ? (userSnap.data() as any)?.role : null;

// 2) If no role, try businessProfiles/{uid} existence => provider
if (!userRole) {
const bp = await getDoc(doc(db, "businessProfiles", uid));
if (bp.exists()) {
setRole("provider");
return;
}
}

setRole(userRole || null);
} catch {
setRole(null);
}
})();
}, [uid]);

// Listen notifications
useEffect(() => {
if (!uid) return;

setLoading(true);

const q = query(
collection(db, "users", uid, "notifications"),
orderBy("createdAt", "desc"),
limit(200)
);

const unsub = onSnapshot(
q,
(snap) => {
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as NotificationRow[];
setRows(list);
setLoading(false);
},
() => {
setRows([]);
setLoading(false);
}
);

return () => unsub();
}, [uid]);

const isProvider = useMemo(() => {
const r = (role || "").toLowerCase();
return r === "provider" || r === "employee" || r === "driver";
}, [role]);

async function openNotification(n: NotificationRow) {
if (!uid) return;

// mark read (don’t block navigation if it fails)
try {
await updateDoc(doc(db, "users", uid, "notifications", n.id), { read: true });
} catch {}

// 1) If notification stores a link, prefer it (must be internal)
if (n.link && typeof n.link === "string" && n.link.startsWith("/")) {
router.push(n.link);
return;
}

// 2) If it has requestId, route by role/targetRole
const reqId = n.requestId;
const target = (n.targetRole || "").toLowerCase();

const goProvider = target === "provider" || target === "employee" || isProvider;

if (reqId) {
router.push(goProvider ? `/provider/requests/${reqId}` : `/requests/${reqId}`);
return;
}

// 3) Fallback: go back to provider dashboard or customer requests
router.push(isProvider ? "/dashboard/provider?tab=available" : "/requests");
}

if (!uid) return null;

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto">
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-3xl font-bold">Notifications</h1>
<p className="text-sm text-gray-600">Tap a notification to open it.</p>
</div>

<button
type="button"
onClick={() => router.push(isProvider ? "/dashboard/provider?tab=available" : "/requests")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
</div>

<div className="mt-6">
{loading ? (
<div className="text-sm text-gray-600">Loading…</div>
) : rows.length === 0 ? (
<div className="text-sm text-gray-600">No notifications.</div>
) : (
<div className="space-y-3">
{rows.map((n) => (
<button
key={n.id}
onClick={() => openNotification(n)}
className={`w-full text-left border rounded-xl p-4 hover:bg-gray-50 ${
n.read ? "opacity-70" : ""
}`}
>
<div className="flex items-start justify-between gap-3">
<div className="font-semibold">
{n.title || n.type || "Notification"}
{!n.read ? <span className="ml-2 text-xs font-bold">• NEW</span> : null}
</div>
<div className="text-xs text-gray-600">{formatTime(n.createdAt)}</div>
</div>
{n.body ? <div className="text-sm text-gray-700 mt-1">{n.body}</div> : null}
{n.requestId ? (
<div className="text-xs text-gray-500 mt-2">Request: {n.requestId}</div>
) : null}
</button>
))}
</div>
)}
</div>
</div>
</main>
);
}

