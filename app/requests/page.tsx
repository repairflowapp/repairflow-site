"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type RoadsideRequest = {
id: string;
status?: string;
issueType?: string;
pickupAddress?: string | null;
createdAt?: any;
updatedAt?: any;
};

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tsSeconds(v: any): number {
return Number(v?.seconds ?? 0);
}

function sortRows(rows: RoadsideRequest[]) {
return rows.sort((a, b) => {
const aT = tsSeconds(a.updatedAt) || tsSeconds(a.createdAt) || 0;
const bT = tsSeconds(b.updatedAt) || tsSeconds(b.createdAt) || 0;
return bT - aT;
});
}

export default function RequestsPage() {
const router = useRouter();
const [uid, setUid] = useState<string | null>(null);
const [tab, setTab] = useState<"active" | "completed">("active");
const [rows, setRows] = useState<RoadsideRequest[]>([]);
const [err, setErr] = useState<string | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => {
if (!u) {
router.replace("/auth/sign-in");
return;
}
setUid(u.uid);
});
return () => unsub();
}, [router]);

useEffect(() => {
if (!uid) return;

setErr(null);

// ✅ safest: no orderBy
const q1 = query(collection(db, "roadsideRequests"), where("createdByUid", "==", uid), limit(300));
let unsub: null | (() => void) = null;

unsub = onSnapshot(
q1,
(snap) => {
const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RoadsideRequest[];
setRows(sortRows(data));
},
() => {
// fallback older schema
const q2 = query(collection(db, "roadsideRequests"), where("customerUid", "==", uid), limit(300));
try {
unsub?.();
} catch {}
unsub = onSnapshot(
q2,
(snap) => {
const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RoadsideRequest[];
setRows(sortRows(data));
},
(e) => setErr(e?.message || "Failed to load requests.")
);
}
);

return () => {
try {
unsub?.();
} catch {}
};
}, [uid]);

const isCompleted = (s?: string) => String(s || "") === "completed" || String(s || "") === "cancelled" || String(s || "") === "canceled";

const filtered = useMemo(() => {
if (tab === "completed") return rows.filter((r) => isCompleted(r.status));
return rows.filter((r) => !isCompleted(r.status));
}, [rows, tab]);

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto">
<div className="flex items-center justify-between gap-3">
<h1 className="text-3xl font-bold">My Requests</h1>

<div className="flex gap-2">
<button
onClick={() => setTab("completed")}
className={`border rounded-lg px-4 py-2 font-medium ${tab === "completed" ? "bg-black text-white" : "hover:bg-gray-50"}`}
>
Completed
</button>
<button
onClick={() => router.push("/requests/new")}
className={`border rounded-lg px-4 py-2 font-medium ${tab === "active" ? "bg-black text-white" : "hover:bg-gray-50"}`}
>
New Request
</button>
<button onClick={() => router.push("/dashboard/customer")} className="border rounded-lg px-4 py-2 font-medium hover:bg-gray-50">
Back
</button>
</div>
</div>

{err ? (
<div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

<div className="mt-6 space-y-3">
{filtered.length === 0 ? (
<div className="border rounded-xl p-4 text-sm text-gray-700">
{tab === "completed"
? "No completed requests yet."
: "No active requests right now. Click New Request to create one, or check Completed."}
</div>
) : (
filtered.map((r) => (
<button
key={r.id}
onClick={() => router.push(`/requests/${r.id}`)}
className="w-full border rounded-xl p-4 text-left hover:bg-gray-50"
>
<div className="flex items-center justify-between gap-3">
<div className="font-semibold">{titleCase(r.issueType || "Request")}</div>
<div className="text-xs text-gray-600">Status: <b>{titleCase(r.status || "open")}</b></div>
</div>
<div className="text-sm text-gray-700 mt-1">{r.pickupAddress || "—"}</div>
</button>
))
)}
</div>
</div>
</main>
);
}

