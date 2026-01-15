"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
doc,
onSnapshot,
serverTimestamp,
updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import NotificationsBell from "@/components/NotificationsBell";
import SignOutButton from "@/components/SignOutButton";

type JobStatus =
| "open"
| "bidding"
| "pending_provider_confirmation"
| "pending_customer_confirmation"
| "accepted"
| "enroute"
| "on_site"
| "onsite"
| "in_progress"
| "completed"
| "canceled"
| string;

export default function ProviderDispatchPage() {
const router = useRouter();
const params = useParams();
const jobId = params?.id as string;

const [uid, setUid] = useState<string | null>(null);

const [job, setJob] = useState<any>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

const [techName, setTechName] = useState("");
const [techPhone, setTechPhone] = useState("");
const [saving, setSaving] = useState(false);
const [toast, setToast] = useState<string | null>(null);

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

useEffect(() => {
if (!jobId || !uid) return;

setLoading(true);
setErr(null);

const ref = doc(db, "roadsideRequests", jobId);

const unsub = onSnapshot(
ref,
(snap) => {
if (!snap.exists()) {
setErr("Job not found.");
setJob(null);
setLoading(false);
return;
}

const data = snap.data();

// Enforce: must be assigned provider
if (data?.providerId && data.providerId !== uid) {
setErr("This job is not assigned to your provider account.");
setJob(null);
setLoading(false);
return;
}

const merged = { id: snap.id, ...data };
setJob(merged);

// Prefill tech fields if already assigned
setTechName((prev) =>
prev.trim() ? prev : merged.providerAssignedToName || ""
);
setTechPhone((prev) =>
prev.trim() ? prev : merged.providerAssignedToPhone || ""
);

setLoading(false);
},
(e) => {
setErr(e?.message || "Missing or insufficient permissions.");
setLoading(false);
}
);

return () => unsub();
}, [jobId, uid]);

function showToast(msg: string) {
setToast(msg);
setTimeout(() => setToast(null), 2500);
}

async function assignTech() {
const name = techName.trim();
const phone = techPhone.trim();

if (!name || !phone) {
alert("Enter technician name and phone.");
return;
}

if (!uid) return;

setSaving(true);
setErr(null);

try {
// 1) Save assignment fields
await updateDoc(doc(db, "roadsideRequests", jobId), {
providerAssignedToName: name,
providerAssignedToPhone: phone,
providerAssignedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

// 2) Write a SYSTEM chat message (triggers notifyOnChatMessage to customer)
await addDoc(
collection(db, "roadsideRequests", jobId, "chatThreads", "main", "messages"),
{
text: `✅ Technician assigned: ${name} (${phone})`,
senderUid: uid,
createdAt: serverTimestamp(),
system: true,
}
);

showToast("Assignment saved + customer notified.");
} catch (e: any) {
setErr(e?.message || "Failed to save tech assignment.");
} finally {
setSaving(false);
}
}

async function setStatus(status: JobStatus) {
if (!uid) return;

setSaving(true);
setErr(null);
try {
await updateDoc(doc(db, "roadsideRequests", jobId), {
status,
updatedAt: serverTimestamp(),
});

// Optional: also post a system chat message for status changes
await addDoc(
collection(db, "roadsideRequests", jobId, "chatThreads", "main", "messages"),
{
text: `📍 Status updated to: ${String(status).replace(/_/g, " ")}`,
senderUid: uid,
createdAt: serverTimestamp(),
system: true,
}
);

showToast("Status updated.");
} catch (e: any) {
setErr(e?.message || "Failed to update status.");
} finally {
setSaving(false);
}
}

if (loading) return <p className="p-6">Loading…</p>;

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-2xl mx-auto space-y-6">
{/* Header */}
<div className="flex justify-between items-center gap-2">
<h1 className="text-2xl font-bold">Dispatch</h1>

<div className="flex items-center gap-2">
<NotificationsBell />
<button
type="button"
onClick={() => router.push(`/provider/jobs/${jobId}`)}
className="border px-4 py-2 rounded-lg"
>
Back
</button>
<SignOutButton />
</div>
</div>

{toast ? (
<div className="border border-gray-200 bg-gray-50 p-3 rounded-lg text-sm">
{toast}
</div>
) : null}

{err ? (
<div className="border border-red-200 bg-red-50 p-3 rounded-lg text-red-700">
{err}
</div>
) : null}

{job ? (
<>
<div className="border rounded-2xl p-4 space-y-1">
<div>
<b>Status:</b> {job.status || "—"}
</div>
<div>
<b>Issue:</b> {job.issueType || "—"}
</div>
<div>
<b>Notes:</b> {job.notes || "—"}
</div>
<div>
<b>Customer phone:</b> {job.contactPhone || "—"}
</div>
<div>
<b>Address:</b>{" "}
{job.addressFormatted || job.addressText || job.locationText || "—"}
</div>
</div>

{/* Assign Technician */}
<div className="border rounded-2xl p-4 space-y-3">
<h2 className="font-semibold">Assign Technician</h2>

<input
className="w-full border rounded-lg p-3"
placeholder="Technician name"
value={techName}
onChange={(e) => setTechName(e.target.value)}
disabled={saving}
/>

<input
className="w-full border rounded-lg p-3"
placeholder="Technician phone"
value={techPhone}
onChange={(e) => setTechPhone(e.target.value)}
disabled={saving}
/>

<button
type="button"
onClick={assignTech}
disabled={saving}
className="w-full bg-black text-white py-3 rounded-lg disabled:opacity-50"
>
{saving ? "Saving…" : "Save Assignment"}
</button>
</div>

{/* Status controls */}
<div className="border rounded-2xl p-4 space-y-2">
<h2 className="font-semibold">Job Status</h2>

<button
type="button"
onClick={() => setStatus("enroute")}
disabled={saving}
className="w-full border py-3 rounded-lg disabled:opacity-50"
>
Mark Enroute
</button>

<button
type="button"
onClick={() => setStatus("on_site")}
disabled={saving}
className="w-full border py-3 rounded-lg disabled:opacity-50"
>
Mark On Site
</button>

<button
type="button"
onClick={() => setStatus("in_progress")}
disabled={saving}
className="w-full border py-3 rounded-lg disabled:opacity-50"
>
Mark In Progress
</button>

<button
type="button"
onClick={() => setStatus("completed")}
disabled={saving}
className="w-full bg-black text-white py-3 rounded-lg disabled:opacity-50"
>
Complete Job
</button>
</div>
</>
) : null}
</div>
</main>
);
}
