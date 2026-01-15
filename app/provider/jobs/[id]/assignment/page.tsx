"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

type JobStatus =
| "open"
| "bidding"
| "accepted"
| "assigned"
| "enroute"
| "in_progress"
| "completed"
| "canceled";

type RoadsideRequest = {
id: string;
status?: JobStatus;

issueType?: string;
locationText?: string;
pickupAddress?: string;
dropoffAddress?: string;

providerId?: string | null; // accepted provider uid

// Customer assignment
customerAssignedToName?: string | null;
customerAssignedToPhone?: string | null;

// Provider assignment
providerAssignedToName?: string | null;
providerAssignedToPhone?: string | null;
providerAssignedAt?: any;

updatedAt?: any;
};

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProviderJobAssignmentPage() {
const router = useRouter();
const params = useParams<{ id: string }>();
const requestId = params?.id;

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

const [item, setItem] = useState<RoadsideRequest | null>(null);
const [error, setError] = useState<string | null>(null);

const [assigneeName, setAssigneeName] = useState("");
const [assigneePhone, setAssigneePhone] = useState("");
const [saving, setSaving] = useState(false);
const [success, setSuccess] = useState<string | null>(null);

const providerOwnsJob = useMemo(() => {
return !!uid && !!item?.providerId && item.providerId === uid;
}, [uid, item?.providerId]);

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (user) => {
try {
setError(null);
if (!user) {
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

if (!requestId) {
setError("Missing job id.");
setLoading(false);
return;
}

const snap = await getDoc(doc(db, "roadsideRequests", requestId));
if (!snap.exists()) {
setError("Job not found.");
setLoading(false);
return;
}

const merged: RoadsideRequest = { id: snap.id, ...(snap.data() as any) };
setItem(merged);

setAssigneeName((merged.providerAssignedToName ?? "").toString());
setAssigneePhone((merged.providerAssignedToPhone ?? "").toString());

setLoading(false);
} catch (e: any) {
setError(e?.message ?? "Failed to load job.");
setLoading(false);
}
});

return () => unsub();
}, [router, requestId]);

async function saveProviderAssignment() {
setError(null);
setSuccess(null);

if (!requestId) return;

if (!providerOwnsJob) {
setError("You can only assign jobs that were accepted by your provider account.");
return;
}

const name = assigneeName.trim();
const phone = assigneePhone.trim();
if (!name || !phone) {
setError("Mechanic/driver name and phone are required.");
return;
}

setSaving(true);
try {
await updateDoc(doc(db, "roadsideRequests", requestId), {
providerAssignedToName: name,
providerAssignedToPhone: phone,
providerAssignedAt: serverTimestamp(),
status: "assigned",
updatedAt: serverTimestamp(),
});

const snap = await getDoc(doc(db, "roadsideRequests", requestId));
setItem({ id: snap.id, ...(snap.data() as any) });
setSuccess("Assigned successfully.");
} catch (e: any) {
setError(e?.message ?? "Failed to assign.");
} finally {
setSaving(false);
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading job…</p>
</div>
</main>
);
}

if (!item) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
{error ?? "Job not found."}
</p>
<button
onClick={() => router.push("/provider/jobs/active")}
className="mt-4 w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back
</button>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto border border-gray-200 rounded-2xl p-8">
<div className="flex items-start justify-between gap-4">
<div>
<h1 className="text-3xl font-bold text-gray-900">Job Assignment</h1>
<p className="text-xs text-gray-500 mt-1">
Job ID: <span className="font-mono">{item.id}</span>
</p>
</div>

<div className="flex items-center gap-2">
<button
onClick={() => router.push(`/provider/jobs/${item.id}`)}
className="border border-gray-300 text-gray-900 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back to Bid/Chat
</button>
</div>
</div>

{error && (
<p className="mt-5 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
{error}
</p>
)}

<div className="mt-6 space-y-2 text-sm text-gray-800">
<div className="flex justify-between">
<span className="text-gray-600">Status</span>
<span className="font-medium">{item.status ? titleCase(item.status) : "—"}</span>
</div>
</div>

{/* Customer assignment (FYI) */}
<div className="mt-8 border border-gray-200 rounded-xl p-4">
<h2 className="text-lg font-semibold">Customer assigned driver/employee</h2>
<div className="mt-2 text-sm">
<div>
<b>{item.customerAssignedToName ?? "—"}</b>
</div>
<div className="opacity-80">{item.customerAssignedToPhone ?? "—"}</div>
</div>
</div>

{/* Provider assignment */}
<div className="mt-6 border border-gray-200 rounded-xl p-4">
<h2 className="text-lg font-semibold">Assign to your mechanic/employee</h2>
<p className="text-xs text-gray-500 mt-1">Required: name + phone.</p>

{success ? (
<p className="mt-3 text-sm text-green-700 border border-green-200 bg-green-50 rounded-lg p-3">
{success}
</p>
) : null}

{!providerOwnsJob ? (
<p className="mt-3 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">
This job isn’t assigned to your provider account yet. You can only assign after the customer accepts your bid.
</p>
) : null}

<div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Name *</label>
<input
className="w-full border rounded-lg p-2"
value={assigneeName}
onChange={(e) => setAssigneeName(e.target.value)}
placeholder="Mechanic / driver name"
disabled={!providerOwnsJob}
/>
</div>
<div>
<label className="block text-sm font-medium mb-1">Phone *</label>
<input
className="w-full border rounded-lg p-2"
value={assigneePhone}
onChange={(e) => setAssigneePhone(e.target.value)}
placeholder="(555) 555-5555"
disabled={!providerOwnsJob}
/>
</div>
</div>

<button
type="button"
onClick={saveProviderAssignment}
disabled={saving || !providerOwnsJob}
className="mt-4 w-full bg-black text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
>
{saving ? "Saving…" : "Save Provider Assignment"}
</button>
</div>
</div>
</main>
);
}
