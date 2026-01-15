"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
doc,
getDoc,
onSnapshot,
runTransaction,
serverTimestamp,
updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import ChatThread from "@/components/ChatThread";

type Bid = {
id: string; // provider uid
providerId?: string;
price?: number;
etaMinutes?: number;
message?: string | null;
status?: "pending" | "selected" | "accepted" | "rejected" | "countered" | string;

counterPrice?: number | null;
counterEtaMinutes?: number | null;
counterMessage?: string | null;
counterAt?: any;

createdAt?: any;
updatedAt?: any;
};

function formatMoney(n: any) {
const x = Number(n);
if (!Number.isFinite(x)) return "—";
return `$${x.toFixed(0)}`;
}

export default function ProviderBidDetailPage() {
const router = useRouter();
const params = useParams<{ id: string }>();
const sp = useSearchParams();

const jobId = params?.id;
const nid = sp?.get("nid");

const [uid, setUid] = useState<string | null>(null);
const [loading, setLoading] = useState(true);

const [job, setJob] = useState<any>(null);
const [bid, setBid] = useState<Bid | null>(null);

const [price, setPrice] = useState("");
const [eta, setEta] = useState("");
const [message, setMessage] = useState("");

const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState<string | null>(null);

// Auth + job + bid subscription
useEffect(() => {
let unsubJob: (() => void) | null = null;
let unsubBid: (() => void) | null = null;

const unsubAuth = onAuthStateChanged(auth, async (user) => {
try {
setError(null);

if (!user) {
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

if (!jobId) {
setError("Missing job id.");
setLoading(false);
return;
}

// live job
const jobRef = doc(db, "roadsideRequests", jobId);
unsubJob = onSnapshot(
jobRef,
(snap) => {
if (!snap.exists()) {
setJob(null);
setError("Job not found.");
setLoading(false);
return;
}
setJob({ id: snap.id, ...(snap.data() as any) });
},
(e) => setError(e?.message ?? "Failed to load job.")
);

// live bid
const bidRef = doc(db, "roadsideRequests", jobId, "bids", user.uid);
unsubBid = onSnapshot(
bidRef,
(snap) => {
if (!snap.exists()) {
setBid(null);
setPrice("");
setEta("");
setMessage("");
setLoading(false);
return;
}

const data = snap.data() as any;
const b: Bid = { id: snap.id, ...(data as any) };
setBid(b);

setPrice((prev) => (prev.trim().length ? prev : b.price != null ? String(b.price) : ""));
setEta((prev) => (prev.trim().length ? prev : b.etaMinutes != null ? String(b.etaMinutes) : ""));
setMessage((prev) => (prev.trim().length ? prev : (b.message ?? "") || ""));

setLoading(false);
},
(e) => {
setError(e?.message ?? "Failed to load bid.");
setLoading(false);
}
);
} catch (e: any) {
setError(e?.message ?? "Failed to load page.");
setLoading(false);
}
});

return () => {
unsubAuth();
if (unsubJob) unsubJob();
if (unsubBid) unsubBid();
};
}, [jobId, router]);

// Job states
const awaitingProviderConfirm = useMemo(() => {
if (!uid) return false;
const s = job?.status;
return s === "pending_provider_confirmation" && job?.providerId === uid;
}, [job?.providerId, job?.status, uid]);

const isActiveForProvider = useMemo(() => {
if (!uid) return false;
const s = job?.status;
return job?.providerId === uid && (s === "accepted" || s === "assigned" || s === "enroute" || s === "in_progress");
}, [job?.providerId, job?.status, uid]);

async function notifyCustomer(customerUid: string, payload: { title: string; message: string; type: string }) {
await addDoc(collection(db, "users", customerUid, "notifications"), {
...payload,
requestId: jobId,
read: false,
createdAt: serverTimestamp(),
});
}

async function placeOrUpdateBid() {
if (!uid || !jobId) return;

setError(null);
setSuccess(null);

const priceNum = Number(price);
const etaNum = Number(eta);

if (!Number.isFinite(priceNum) || priceNum <= 0) {
setError("Price is required and must be a valid number.");
return;
}
if (!Number.isFinite(etaNum) || etaNum <= 0) {
setError("ETA (minutes) is required and must be a valid number.");
return;
}

setSaving(true);
try {
const ref = doc(db, "roadsideRequests", jobId, "bids", uid);

// If countered and provider updates, move back to pending
const nextStatus = bid?.status === "countered" ? "pending" : (bid?.status || "pending");

await updateDoc(ref, {
price: priceNum,
etaMinutes: etaNum,
message: message.trim() || null,
status: nextStatus,
updatedAt: serverTimestamp(),
});

const customerUid = job?.createdByUid;
if (customerUid) {
try {
await notifyCustomer(customerUid, {
type: "bid_updated",
title: "Bid updated",
message: `A provider updated their bid for request ${jobId}.`,
});
} catch {}
}

setSuccess("Bid saved.");
} catch (e: any) {
setError(e?.message ?? "Failed to save bid.");
} finally {
setSaving(false);
}
}

async function acceptCounter() {
if (!uid || !jobId || !bid) return;
if (bid.status !== "countered") return;

const cp = bid.counterPrice;
const ce = bid.counterEtaMinutes;

if (typeof cp !== "number" || typeof ce !== "number") {
setError("Counter is missing price/ETA.");
return;
}

setSaving(true);
setError(null);
setSuccess(null);

try {
const ref = doc(db, "roadsideRequests", jobId, "bids", uid);

await updateDoc(ref, {
price: cp,
etaMinutes: ce,
status: "pending",
updatedAt: serverTimestamp(),
});

const customerUid = job?.createdByUid;
if (customerUid) {
try {
await notifyCustomer(customerUid, {
type: "counter_accepted_by_provider",
title: "Counter accepted",
message: `Provider accepted your counter for request ${jobId}.`,
});
} catch {}
}

setSuccess("Counter accepted. Your bid is now updated.");
} catch (e: any) {
setError(e?.message ?? "Failed to accept counter.");
} finally {
setSaving(false);
}
}

// Provider confirms selection -> job moves to pending_customer_confirmation
async function confirmSelection() {
if (!uid || !jobId) return;

setSaving(true);
setError(null);
setSuccess(null);

try {
await runTransaction(db, async (tx) => {
const reqRef = doc(db, "roadsideRequests", jobId);
const bidRef = doc(db, "roadsideRequests", jobId, "bids", uid);

const reqSnap = await tx.get(reqRef);
if (!reqSnap.exists()) throw new Error("Request not found.");

const req = reqSnap.data() as any;

if (req.status !== "pending_provider_confirmation") {
throw new Error("This job is not awaiting confirmation.");
}
if (req.providerId !== uid) {
throw new Error("This job is assigned to a different provider.");
}

tx.update(reqRef, {
status: "pending_customer_confirmation",
providerConfirmedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

tx.update(bidRef, {
status: "accepted",
updatedAt: serverTimestamp(),
});
});

const customerUid = job?.createdByUid;
if (customerUid) {
try {
await notifyCustomer(customerUid, {
type: "provider_confirmed",
title: "Provider confirmed",
message: `Provider confirmed availability for request ${jobId}. Please confirm to start.`,
});
} catch {}
}

setSuccess("Confirmed. Waiting on customer confirmation.");
router.push("/provider/jobs/bids");
} catch (e: any) {
setError(e?.message ?? "Failed to confirm.");
} finally {
setSaving(false);
}
}

async function declineSelection() {
if (!uid || !jobId) return;

setSaving(true);
setError(null);
setSuccess(null);

try {
await runTransaction(db, async (tx) => {
const reqRef = doc(db, "roadsideRequests", jobId);
const bidRef = doc(db, "roadsideRequests", jobId, "bids", uid);

const reqSnap = await tx.get(reqRef);
if (!reqSnap.exists()) throw new Error("Request not found.");

const req = reqSnap.data() as any;

if (req.status !== "pending_provider_confirmation") {
throw new Error("This job is not awaiting confirmation.");
}
if (req.providerId !== uid) {
throw new Error("This job is assigned to a different provider.");
}

tx.update(reqRef, {
status: "open",
providerId: null,
acceptedBidId: null,
acceptedAt: null,
updatedAt: serverTimestamp(),
});

tx.update(bidRef, {
status: "rejected",
updatedAt: serverTimestamp(),
});
});

const customerUid = job?.createdByUid;
if (customerUid) {
try {
await notifyCustomer(customerUid, {
type: "provider_declined",
title: "Provider declined",
message: `Provider declined request ${jobId}. Please select another bid.`,
});
} catch {}
}

setSuccess("Declined. The customer can select another provider.");
router.push("/provider/jobs/bids");
} catch (e: any) {
setError(e?.message ?? "Failed to decline.");
} finally {
setSaving(false);
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading bid…</p>
</div>
</main>
);
}

if (!jobId) return null;

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto border border-gray-200 rounded-2xl p-8">
<div className="flex items-start justify-between gap-4">
<div>
<h1 className="text-3xl font-bold text-gray-900">My Bid</h1>
<p className="text-xs text-gray-500 mt-1">
Job ID: <span className="font-mono">{jobId}</span>
{nid ? <span className="ml-2 opacity-70">(from notification)</span> : null}
</p>
</div>

<button
onClick={() => router.push("/provider/jobs/bids")}
className="border border-gray-300 text-gray-900 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
</div>

{error && (
<p className="mt-5 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error}</p>
)}

{success && (
<p className="mt-5 text-sm text-green-700 border border-green-200 bg-green-50 rounded-lg p-3">{success}</p>
)}

{/* Job summary */}
<div className="mt-6 border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
<div className="font-semibold text-gray-900 mb-2">Job Summary</div>
<div>
<b>Issue:</b> {job?.issueType || "—"}
</div>
<div className="mt-1">
<b>Location:</b> {job?.pickupAddress || job?.locationText || "—"}
</div>
{job?.notes ? (
<div className="mt-2">
<b>Notes:</b> <span className="whitespace-pre-wrap">{job.notes}</span>
</div>
) : null}
<div className="mt-2 text-xs opacity-70">
Status: <b>{job?.status || "—"}</b>
</div>
</div>

{/* Awaiting confirmation block */}
{awaitingProviderConfirm ? (
<div className="mt-6 border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm">
<div className="font-semibold">Bid Selected — Confirm Availability</div>
<div className="mt-2 opacity-80">
Customer selected you. Confirm to notify the customer (they will confirm to start), or decline so they can pick another provider.
</div>

<div className="mt-3 flex gap-2">
<button
onClick={confirmSelection}
disabled={saving}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
>
{saving ? "Saving…" : "Confirm"}
</button>
<button
onClick={declineSelection}
disabled={saving}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
>
Decline
</button>
</div>
</div>
) : null}

{/* Counter block */}
{bid?.status === "countered" ? (
<div className="mt-6 border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm">
<div className="font-semibold">Counter Offer Received</div>
<div className="mt-2">
<b>Counter Price:</b> {formatMoney(bid.counterPrice)}
</div>
<div className="mt-1">
<b>Counter ETA:</b> {typeof bid.counterEtaMinutes === "number" ? `${bid.counterEtaMinutes} min` : "—"}
</div>
{bid.counterMessage ? (
<div className="mt-2 whitespace-pre-wrap">
<b>Message:</b> {bid.counterMessage}
</div>
) : null}

<div className="mt-3 flex gap-2">
<button
onClick={acceptCounter}
disabled={saving}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
>
{saving ? "Saving…" : "Accept Counter"}
</button>
<div className="text-xs opacity-70 self-center">
Or edit your bid below to counter back (it will send as an updated bid).
</div>
</div>
</div>
) : null}

{/* Bid form */}
<div className="mt-6 border border-gray-200 rounded-xl p-4">
<div className="flex items-start justify-between gap-3">
<div>
<h2 className="text-lg font-semibold">Your Bid</h2>
<p className="text-xs text-gray-500 mt-1">
ETA is required. If selected, you must confirm — customer confirms to start.
</p>
</div>

{isActiveForProvider ? (
<button
onClick={() => router.push("/provider/jobs/active")}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
>
Go to Active Job →
</button>
) : null}
</div>

<div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
<div>
<label className="block text-sm font-medium mb-1">Price ($) *</label>
<input
className="w-full border rounded-lg p-2"
value={price}
onChange={(e) => setPrice(e.target.value)}
placeholder="e.g. 650"
inputMode="numeric"
/>
</div>

<div>
<label className="block text-sm font-medium mb-1">ETA (minutes) *</label>
<input
className="w-full border rounded-lg p-2"
value={eta}
onChange={(e) => setEta(e.target.value)}
placeholder="e.g. 45"
inputMode="numeric"
/>
</div>
</div>

<div className="mt-3">
<label className="block text-sm font-medium mb-1">Message (optional)</label>
<textarea
className="w-full border rounded-lg p-2"
value={message}
onChange={(e) => setMessage(e.target.value)}
placeholder="Optional note..."
rows={3}
/>
</div>

<button
onClick={placeOrUpdateBid}
disabled={saving}
className="mt-4 w-full bg-black text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
>
{saving ? "Saving…" : bid ? "Update Bid" : "Place Bid"}
</button>
</div>

{/* Pre-bid chat */}
<div className="mt-8">
<ChatThread requestId={jobId} role="provider" title="Pre-Bid Chat" />
</div>

<button
onClick={() => router.push("/provider/jobs/bids")}
className="mt-8 w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to My Bids
</button>
</div>
</main>
);
}
