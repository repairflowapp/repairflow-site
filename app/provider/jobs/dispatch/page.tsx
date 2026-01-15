"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import SignOutButton from "@/components/SignOutButton";
import JobChatPanel from "@/components/JobChatPanel";

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

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProviderDispatchPage() {
const router = useRouter();
const params = useParams<{ id: string }>();
const jobId = params?.id;

const [uid, setUid] = useState<string | null>(null);
const [job, setJob] = useState<any>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);
const [saving, setSaving] = useState(false);

const [techName, setTechName] = useState("");
const [techPhone, setTechPhone] = useState("");

useEffect(() => {
const unsub = onAuthStateChanged(auth, (user) => {
if (!user) {
router.push("/auth/sign-in");
return;
}
setUid(user.uid);
});
return () => unsub();
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
setJob(null);
setErr("Job not found.");
setLoading(false);
return;
}

const data = snap.data() as any;

// ✅ Must be assigned provider to dispatch
if (data?.providerId !== uid) {
setJob(null);
setErr("This job is not assigned to your provider account.");
setLoading(false);
return;
}

const merged = { id: snap.id, ...data };
setJob(merged);

// prefill
setTechName((prev) => (prev.trim() ? prev : merged.providerAssignedToName || ""));
setTechPhone((prev) => (prev.trim() ? prev : merged.providerAssignedToPhone || ""));

setLoading(false);
},
(e) => {
setErr(e?.message ?? "Missing or insufficient permissions.");
setLoading(false);
}
);

return () => unsub();
}, [jobId, uid]);

const status: JobStatus = useMemo(() => job?.status ?? "—", [job]);

async function saveAssignment() {
const name = techName.trim();
const phone = techPhone.trim();
if (!name || !phone) {
alert("Enter technician name and phone.");
return;
}

setSaving(true);
setErr(null);
try {
await updateDoc(doc(db, "roadsideRequests", jobId as string), {
providerAssignedToName: name,
providerAssignedToPhone: phone,
providerAssignedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});
} catch (e: any) {
setErr(e?.message ?? "Failed to save assignment.");
} finally {
setSaving(false);
}
}

async function setStatus(next: JobStatus) {
setSaving(true);
setErr(null);
try {
await updateDoc(doc(db, "roadsideRequests", jobId as string), {
status: next,
updatedAt: serverTimestamp(),
});
} catch (e: any) {
setErr(e?.message ?? "Failed to update status.");
} finally {
setSaving(false);
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto border border-gray-200 rounded-2xl p-8">
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-3xl font-bold text-gray-900">Dispatch</h1>
<p className="text-sm text-gray-600">
Status: <b>{titleCase(status)}</b>
</p>
</div>

<div className="flex items-center gap-2">
<button
type="button"
onClick={() => router.push(`/provider/jobs/${jobId}`)}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
<SignOutButton />
</div>
</div>

{err ? (
<div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3">
{err}
</div>
) : null}

{job ? (
<>
<div className="mt-6 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 space-y-1">
<div>
<span className="text-gray-500">Issue:</span> {titleCase(job.issueType || "—")}
</div>
<div>
<span className="text-gray-500">Address:</span>{" "}
{job.addressFormatted || job.addressText || job.locationText || "—"}
</div>
<div>
<span className="text-gray-500">Notes:</span> {job.notes || "—"}
</div>
<div>
<span className="text-gray-500">Customer phone:</span> {job.contactPhone || "—"}
</div>
</div>

{/* ASSIGN TECH */}
<div className="mt-6 border border-gray-200 rounded-xl p-4 space-y-3">
<div className="font-semibold text-gray-900">Assign Technician</div>

<input
className="w-full border border-gray-300 rounded-lg p-2"
placeholder="Technician / Driver Name"
value={techName}
onChange={(e) => setTechName(e.target.value)}
disabled={saving}
/>
<input
className="w-full border border-gray-300 rounded-lg p-2"
placeholder="Technician Phone"
value={techPhone}
onChange={(e) => setTechPhone(e.target.value)}
disabled={saving}
/>

<button
type="button"
onClick={saveAssignment}
disabled={saving}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{saving ? "Saving…" : "Save Assignment"}
</button>
</div>

{/* DISPATCH STATUS */}
<div className="mt-6 border border-gray-200 rounded-xl p-4 space-y-2">
<div className="font-semibold text-gray-900">Job Status</div>

<button
type="button"
onClick={() => setStatus("enroute")}
disabled={saving}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50 disabled:opacity-50"
>
Mark Enroute
</button>

<button
type="button"
onClick={() => setStatus("on_site")}
disabled={saving}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50 disabled:opacity-50"
>
Mark On Site
</button>

<button
type="button"
onClick={() => setStatus("in_progress")}
disabled={saving}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50 disabled:opacity-50"
>
Mark In Progress
</button>

<button
type="button"
onClick={() => setStatus("completed")}
disabled={saving}
className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
Complete Job
</button>
</div>

{/* ✅ CHAT (shared with customer) */}
<div className="mt-6">
<JobChatPanel jobId={jobId as string} title="Job Chat" />
</div>
</>
) : null}
</div>
</main>
);
}

