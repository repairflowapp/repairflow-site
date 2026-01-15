"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
doc,
getDoc,
serverTimestamp,
setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import PreBidChat from "@/components/PreBidChat";

type RoadsideRequest = {
createdByUid?: string; // customer uid
issueType?: string;
locationText?: string;
pickupAddress?: string;
notes?: string;
status?: string;
};

type ProviderProfile = {
businessName?: string;
};

export default function ProviderBidPage() {
const router = useRouter();
const params = useParams<{ id: string }>();
const jobId = params?.id;

const [uid, setUid] = useState<string | null>(null);

const [job, setJob] = useState<RoadsideRequest | null>(null);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);

const [price, setPrice] = useState<string>("");
const [eta, setEta] = useState<string>(""); // REQUIRED
const [message, setMessage] = useState<string>("");

const [submitting, setSubmitting] = useState(false);

const pickupText = useMemo(() => {
if (!job) return "—";
return job.pickupAddress || job.locationText || "—";
}, [job]);

useEffect(() => {
return onAuthStateChanged(auth, async (u) => {
if (!u) {
router.push("/auth/sign-in");
return;
}
setUid(u.uid);

if (!jobId) return;

try {
const snap = await getDoc(doc(db, "roadsideRequests", jobId));
if (!snap.exists()) {
setErr("Job not found.");
setLoading(false);
return;
}
setJob(snap.data() as any);
setLoading(false);
} catch (e: any) {
setErr(e?.message ?? "Failed to load job.");
setLoading(false);
}
});
}, [jobId, router]);

async function submitBid() {
if (!uid || !jobId || !job) return;

setErr(null);

const p = Number(price);
const e = Number(eta);

if (!Number.isFinite(p) || p <= 0) {
setErr("Bid amount is required.");
return;
}
if (!Number.isFinite(e) || e <= 0) {
setErr("ETA (minutes) is required.");
return;
}

setSubmitting(true);

try {
// best-effort provider name
let providerName = "Provider";
try {
const profSnap = await getDoc(doc(db, "businessProfiles", uid));
const prof = (profSnap.exists() ? (profSnap.data() as ProviderProfile) : {}) as any;
providerName = prof?.businessName || "Provider";
} catch {}

// 1) Save bid under roadsideRequests/{jobId}/bids/{providerUid}
await setDoc(doc(db, "roadsideRequests", jobId, "bids", uid), {
providerId: uid,
price: p,
etaMinutes: e,
message: message.trim() || null,
status: "pending",
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

// ✅ 2) Write/update provider bid index so "My Bids" shows it
// providerBids/{uid}/jobs/{jobId}
await setDoc(
doc(db, "providerBids", uid, "jobs", jobId),
{
jobId,
providerId: uid,
status: "pending",
lastActionAt: serverTimestamp(),
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

// 3) Notify customer of new bid (goes to users/{customerUid}/notifications)
const customerUid = job.createdByUid;
if (customerUid) {
await addDoc(collection(db, "users", customerUid, "notifications"), {
requestId: jobId,
type: "new_bid",
title: "New bid received",
message: `${providerName} bid $${p.toFixed(0)} • ETA ${e} min`,
read: false,
createdAt: serverTimestamp(),
});
}

// ✅ go to My Bids instead of bouncing back to Available
router.push("/provider/jobs/bids");
} catch (e: any) {
setErr(e?.message ?? "Failed to submit bid.");
} finally {
setSubmitting(false);
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-2xl border border-gray-200 rounded-2xl p-8">
Loading…
</div>
</main>
);
}

if (!job) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-2xl border border-gray-200 rounded-2xl p-8">
<p className="text-red-700">{err ?? "Job not found."}</p>
<button
onClick={() => router.push("/provider/jobs/available")}
className="mt-4 w-full border border-gray-300 rounded-lg py-3"
>
Back
</button>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto space-y-5">
<div className="border border-gray-200 rounded-2xl p-6">
<div className="flex items-start justify-between gap-3">
<div>
<h1 className="text-3xl font-bold">Bid on Job</h1>
<p className="text-xs opacity-70 mt-1">Job ID: {jobId}</p>
<p className="text-sm mt-3">
<b>Pickup:</b> {pickupText}
</p>
{job.notes ? (
<p className="text-sm mt-1">
<b>Notes:</b> {job.notes}
</p>
) : null}
</div>

<button
onClick={() => router.back()}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Back
</button>
</div>

{err && (
<p className="mt-4 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">
{err}
</p>
)}

<div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Bid Amount ($) *</label>
<input
className="border rounded-lg p-2 w-full"
value={price}
onChange={(e) => setPrice(e.target.value)}
inputMode="numeric"
placeholder="450"
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">ETA (minutes) *</label>
<input
className="border rounded-lg p-2 w-full"
value={eta}
onChange={(e) => setEta(e.target.value)}
inputMode="numeric"
placeholder="90"
/>
</div>
</div>

<div className="mt-3">
<label className="block text-sm font-medium mb-1">Message (optional)</label>
<textarea
className="border rounded-lg p-2 w-full"
value={message}
onChange={(e) => setMessage(e.target.value)}
placeholder="Any details for the customer…"
rows={3}
/>
</div>

<button
onClick={submitBid}
disabled={submitting}
className="mt-4 w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50"
>
{submitting ? "Submitting…" : "Submit Bid"}
</button>
</div>

{/* Pre-bid chat */}
<div className="border border-gray-200 rounded-2xl p-6">
<PreBidChat jobId={jobId as string} />
</div>
</div>
</main>
);
}