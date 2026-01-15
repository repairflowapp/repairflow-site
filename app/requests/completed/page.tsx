"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, where, Timestamp, DocumentData } from "firebase/firestore";

type Req = {
id: string;
createdByUid: string;
status?: string;
issueType?: string;
addressFormatted?: string;
addressText?: string;
createdAt?: Timestamp;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isCompletedStatus(s?: string) {
const v = (s || "").toLowerCase();
return v === "completed" || v === "canceled" || v === "cancelled";
}

export default function CompletedRequestsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);
const [items, setItems] = useState<Req[]>([]);

useEffect(() => {
const unsubAuth = onAuthStateChanged(auth, (user) => {
if (!user) {
router.push("/auth/sign-in");
return;
}
setUid(user.uid);
});
return () => unsubAuth();
}, [router]);

const qRef = useMemo(() => {
if (!uid) return null;

// Same safe query, then filter locally
return query(
collection(db, "roadsideRequests"),
where("createdByUid", "==", uid),
orderBy("createdAt", "desc")
);
}, [uid]);

useEffect(() => {
if (!qRef) return;

setLoading(true);
setErr(null);

const unsub = onSnapshot(
qRef,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) })) as Req[];
setItems(rows.filter((r) => isCompletedStatus(r.status)));
setLoading(false);
},
(e) => {
setErr(e?.message || "Missing or insufficient permissions.");
setLoading(false);
}
);

return () => unsub();
}, [qRef]);

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto">
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-3xl font-bold text-gray-900">Completed Requests</h1>
<p className="text-sm text-gray-600">Role: Driver</p>
</div>

<button
className="border border-gray-300 rounded-lg px-4 py-2 font-medium"
onClick={() => router.push("/requests")}
>
Back to My Requests
</button>
</div>

{err && (
<div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3">
{err}
</div>
)}

<div className="mt-4 border border-gray-200 rounded-2xl p-4">
{loading ? (
<p className="text-gray-700">Loading…</p>
) : items.length === 0 ? (
<p className="text-gray-700">No completed requests yet.</p>
) : (
<ul className="space-y-3">
{items.map((r) => (
<li key={r.id} className="border border-gray-200 rounded-xl p-4">
<div className="font-semibold text-gray-900">
{titleCase(r.issueType) || "Request"} — {titleCase(r.status) || "Unknown"}
</div>
<div className="text-sm text-gray-600">
{r.addressFormatted || r.addressText || "—"}
</div>
</li>
))}
</ul>
)}
</div>
</div>
</main>
);
}

