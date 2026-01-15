"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
collection,
doc,
limit,
onSnapshot,
orderBy,
query,
serverTimestamp,
updateDoc,
where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type ProviderNotification = {
id: string;

// We support BOTH names, but we will standardize on requestId.
requestId?: string;
jobId?: string;

type?: string; // new_job | counter_offer | bid_accepted | bid_rejected | request_canceled | etc
title?: string;
message?: string;

// optional legacy url
url?: string;

// We support BOTH names, but we will standardize on read:boolean
read?: boolean;
unread?: boolean;

createdAt?: any;
readAt?: any;
};

function formatWhen(ts: any) {
if (!ts?.toDate) return "—";
try {
return ts.toDate().toLocaleString();
} catch {
return "—";
}
}

function titleCase(s: string) {
return (s || "")
.replace(/_/g, " ")
.replace(/\b\w/g, (c) => c.toUpperCase());
}

function isUnread(n: ProviderNotification) {
// Standard = read === false
if (typeof n.read === "boolean") return !n.read;
// Legacy = unread === true
if (typeof n.unread === "boolean") return n.unread;
// Default: treat missing as unread? safer = false
return false;
}

function pill(unread: boolean) {
return unread
? "bg-amber-50 border-amber-200 text-amber-800"
: "bg-gray-50 border-gray-200 text-gray-700";
}

function routeForNotification(n: ProviderNotification) {
const jobId = n.requestId || n.jobId;

// If a legacy direct url was saved, respect it
if (n.url && typeof n.url === "string") return n.url;

// If no jobId, safest default is notifications page itself
if (!jobId) return "/provider/notifications";

const t = (n.type || "").toLowerCase();

// ✅ IMPORTANT: send provider to the page they actually have access to
// - new_job / counter_offer / bid updates -> bid page
// - accepted -> active job detail page

if (t.includes("new") || t.includes("available")) {
return `/provider/jobs/${encodeURIComponent(jobId)}/bid`;
}

if (t.includes("counter")) {
// This is still a bid-stage item
return `/provider/jobs/${encodeURIComponent(jobId)}/bid`;
}

if (t.includes("rejected") || t.includes("canceled") || t.includes("cancelled")) {
// Bid is dead; show the bid page (it can show status/message)
return `/provider/jobs/${encodeURIComponent(jobId)}/bid`;
}

if (t.includes("accepted")) {
// Once accepted, provider should be able to open job detail / active flow
return `/provider/jobs/${encodeURIComponent(jobId)}`;
}

// Generic fallback
return `/provider/jobs/${encodeURIComponent(jobId)}/bid`;
}

export default function ProviderNotificationsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

const [items, setItems] = useState<ProviderNotification[]>([]);
const [error, setError] = useState<string | null>(null);

const unreadCount = useMemo(() => items.filter((i) => isUnread(i)).length, [items]);

// Auth
useEffect(() => {
const unsub = onAuthStateChanged(auth, (user) => {
if (!user) {
router.push("/auth/sign-in");
return;
}
setUid(user.uid);
setLoading(false);
});
return () => unsub();
}, [router]);

// Realtime notifications (✅ match the badge)
useEffect(() => {
if (!uid) return;

setError(null);

const qRef = query(
collection(db, "users", uid, "notifications"),
orderBy("createdAt", "desc"),
limit(50)
);

const unsub = onSnapshot(
qRef,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ProviderNotification[];
setItems(rows);
},
(e) => setError(e?.message ?? "Failed to load notifications.")
);

return () => unsub();
}, [uid]);

async function markAllRead() {
if (!uid) return;

try {
const unread = items.filter((i) => isUnread(i)).slice(0, 50);

await Promise.all(
unread.map((n) =>
updateDoc(doc(db, "users", uid, "notifications", n.id), {
read: true,
unread: false, // legacy cleanup
readAt: serverTimestamp(),
})
)
);
} catch (e: any) {
setError(e?.message ?? "Failed to mark all read.");
}
}

async function openNotification(n: ProviderNotification) {
if (!uid) return;

// Mark read (best effort) then route
try {
if (isUnread(n)) {
await updateDoc(doc(db, "users", uid, "notifications", n.id), {
read: true,
unread: false, // legacy cleanup
readAt: serverTimestamp(),
});
}
} catch {
// ignore
}

router.push(routeForNotification(n));
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading notifications…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto">
<div className="flex items-center justify-between gap-3 mb-6">
<div>
<h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
<p className="text-sm text-gray-600 mt-1">
{unreadCount > 0 ? (
<>
You have <b>{unreadCount}</b> unread notification{unreadCount === 1 ? "" : "s"}.
</>
) : (
<>You're all caught up.</>
)}
</p>
</div>

<div className="flex gap-2">
<button
onClick={() => router.push("/provider/jobs/active")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Active Jobs
</button>
<button
onClick={markAllRead}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
disabled={unreadCount === 0}
>
Mark All Read
</button>
</div>
</div>

{error && (
<p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3 mb-4">
{error}
</p>
)}

{items.length === 0 ? (
<div className="border border-gray-200 rounded-2xl p-8 text-gray-700">No notifications yet.</div>
) : (
<div className="space-y-3">
{items.map((n) => {
const unread = isUnread(n);
const jobId = n.requestId || n.jobId;

return (
<button
key={n.id}
onClick={() => openNotification(n)}
className="w-full text-left border border-gray-200 rounded-2xl p-4 hover:bg-gray-50"
>
<div className="flex items-start justify-between gap-3">
<div>
<div className="flex items-center gap-2">
<div className="font-semibold text-gray-900">
{n.title || titleCase(n.type || "update")}
</div>
<span className={`text-xs font-semibold px-2 py-1 rounded-full border ${pill(unread)}`}>
{unread ? "NEW" : "READ"}
</span>
</div>

<div className="text-xs text-gray-500 mt-1">
Job: <span className="font-mono">{jobId || "—"}</span> • {formatWhen(n.createdAt)}
</div>

{n.message ? (
<div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{n.message}</div>
) : null}
</div>

<div className="text-sm font-semibold underline opacity-80">Open →</div>
</div>
</button>
);
})}
</div>
)}

<button
onClick={() => router.push("/dashboard")}
className="mt-8 w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Dashboard
</button>
</div>
</main>
);
}

