"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
collection,
onSnapshot,
orderBy,
query,
where,
Timestamp,
DocumentData,
} from "firebase/firestore";

type Job = {
id: string;
providerId?: string | null;
status?: string;
issueType?: string;
addressFormatted?: string;
addressText?: string;
createdAt?: Timestamp;
};

export default function ProviderCompletedJobsPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);
const [items, setItems] = useState<Job[]>([]);

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

// ✅ CRITICAL: only read jobs assigned to THIS provider
// Otherwise Firestore rules will deny the query.
return query(
collection(db, "roadsideRequests"),
where("providerId", "==", uid),
where("status", "in", ["completed"]), // add "canceled" here if you want
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
const rows: Job[] = snap.docs.map((d) => ({
id: d.id,
...(d.data() as DocumentData),
})) as Job[];

setItems(rows);
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
<h1 className="text-3xl font-bold text-gray-900">My Completed Jobs</h1>
<p className="text-sm text-gray-600">Role: Provider</p>
</div>

<div className="flex items-center gap-2">
<button
className="border border-gray-300 rounded-lg px-4 py-2 font-medium"
onClick={() => router.back()}
>
Back
</button>
</div>
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
<p className="text-gray-700">No completed jobs yet.</p>
) : (
<ul className="space-y-3">
{items.map((j) => (
<li key={j.id} className="border border-gray-200 rounded-xl p-4">
<div className="font-semibold text-gray-900">
{j.issueType || "Job"} — {j.status || "unknown"}
</div>
<div className="text-sm text-gray-600">
{j.addressFormatted || j.addressText || "—"}
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

