"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import NotificationsBell from "@/components/NotificationsBell";
import {
addDoc,
collection,
doc,
getDoc,
getDocs,
onSnapshot,
orderBy,
query,
serverTimestamp,
updateDoc,
limit,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Message = {
id: string;
text?: string;
senderUid?: string;
senderName?: string;
createdAt?: any;
attachmentUrl?: string | null;
attachmentName?: string | null;
};

type Bid = {
id: string; // doc id (usually providerId)
providerId?: string;

amount?: number;
price?: number;

etaMinutes?: number;
eta?: string;

message?: string;
createdAt?: any;

// counter / reject fields
counterAmount?: number | null;
counterEtaMinutes?: number | null;
counterMessage?: string | null;
counteredAt?: any;
counterStatus?: string | null;

bidStatus?: string | null;
rejectedByCustomer?: boolean | null;
rejectedAt?: any;

updatedAt?: any;
};

type RoadsideRequest = {
id: string;

createdByUid?: string | null;
customerUid?: string | null;

status?: string;
issueType?: string;

pickupAddress?: string;
dropoffAddress?: string;

addressFormatted?: string;
addressText?: string;
locationText?: string;

notes?: string;

providerId?: string | null;
acceptedBidId?: string | null;

assignedTo?: string | null;
assignedToUid?: string | null;
assignedEmployeeUid?: string | null;

assignedToName?: string | null;
assignedToPhone?: string | null;

providerAssignedToName?: string | null;
providerAssignedToPhone?: string | null;

driverId?: string | null;
driverName?: string | null;
driverPhone?: string | null;

unitNumber?: string | null;

vehicle?: string | null;
trailer?: string | null;
tow?: boolean;

providerRated?: boolean;

// timestamps (optional but used for timeline)
assignedAt?: any;
enrouteAt?: any;
onSiteAt?: any;
onsiteAt?: any;
inProgressAt?: any;
completedAt?: any;
acceptedAt?: any;

// NOTE: we are removing confirmation step from the flow,
// but these fields can remain on the type if older data exists.
providerConfirmedAt?: any;
customerConfirmedAt?: any;
};

type DriverRow = {
id: string;
name?: string;
phone?: string;
};

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(v: any) {
const n = Number(v);
if (!Number.isFinite(n)) return "—";
return `$${n.toFixed(2)}`;
}

function formatWhen(ts: any) {
if (!ts?.toDate) return "";
try {
return ts.toDate().toLocaleString();
} catch {
return "";
}
}

// Never let notifications break bidding/accept flows.
async function safeNotifyUser(userId: string, payload: { title: string; body: string; path?: string }) {
if (!userId) return;
try {
await addDoc(collection(db, "users", userId, "notifications"), {
title: payload.title,
body: payload.body,
path: payload.path || null,
read: false,
createdAt: serverTimestamp(),
});
} catch (e) {
console.warn("notifyUser blocked/failed (ok):", e);
}
}

export default function RequestDetailsPage() {
const router = useRouter();

// ✅ Work with either /requests/[requestId] or /requests/[id] just in case
const params = useParams() as any;
const requestId: string | undefined = params?.requestId || params?.id;

const [loading, setLoading] = useState(true);
const [uid, setUid] = useState<string | null>(null);
const [role, setRole] = useState<string | null>(null);

// gating flag so we don't subscribe to bids/chat too early
const [authReady, setAuthReady] = useState(false);

const [item, setItem] = useState<RoadsideRequest | null>(null);
const [error, setError] = useState<string | null>(null);

// bids
const [bids, setBids] = useState<Bid[]>([]);
const [bidsErr, setBidsErr] = useState<string | null>(null);
const [busyBidId, setBusyBidId] = useState<string | null>(null);

// counter UI
const [counterOpenFor, setCounterOpenFor] = useState<string | null>(null);
const [counterAmount, setCounterAmount] = useState<string>("");
const [counterEta, setCounterEta] = useState<string>("");
const [counterMessage, setCounterMessage] = useState<string>("");

// chat
const [messages, setMessages] = useState<Message[]>([]);
const [text, setText] = useState("");
const [sending, setSending] = useState(false);
const bottomRef = useRef<HTMLDivElement | null>(null);

// drivers (customer selects driver on request)
const [drivers, setDrivers] = useState<DriverRow[]>([]);
const [driversLoading, setDriversLoading] = useState(false);
const [driverId, setDriverId] = useState("");

const isOwner = useMemo(() => {
if (!uid || !item) return false;
return item.createdByUid === uid || item.customerUid === uid;
}, [uid, item]);

const status = String(item?.status || "");

const canSeeBids = useMemo(() => {
return isOwner;
}, [isOwner]);

const canTakeBidActions = useMemo(() => {
return isOwner && ["open", "bidding"].includes(status);
}, [isOwner, status]);

async function doSignOut() {
await signOut(auth);
router.push("/auth/sign-in");
router.refresh();
}

// AUTH + ROLE + REQUEST LISTENER
useEffect(() => {
let unsubReq: null | (() => void) = null;

const unsubAuth = onAuthStateChanged(auth, async (user) => {
setError(null);
setAuthReady(false);

if (!user) {
setUid(null);
setRole(null);
setItem(null);
setLoading(false);
setAuthReady(true);
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

// role gate
try {
const us = await getDoc(doc(db, "users", user.uid));
const ud = us.exists() ? (us.data() as any) : null;
const r = String(ud?.role || "");
setRole(r);

if (r === "provider") {
router.replace("/dashboard/provider");
setAuthReady(true);
return;
}
if (r === "employee") {
router.replace("/dashboard/employee");
setAuthReady(true);
return;
}
} catch {}

if (!requestId) {
setError("Missing request id.");
setLoading(false);
setAuthReady(true);
return;
}

const ref = doc(db, "roadsideRequests", requestId);

unsubReq = onSnapshot(
ref,
(snap) => {
if (!snap.exists()) {
setItem(null);
setError("Request not found.");
setLoading(false);
setAuthReady(true);
return;
}

const merged = { id: snap.id, ...(snap.data() as any) } as RoadsideRequest;

const allowed = merged.createdByUid === user.uid || merged.customerUid === user.uid;
if (!allowed) {
setItem(null);
setError("Not allowed.");
setLoading(false);
setAuthReady(true);
return;
}

setItem(merged);
setLoading(false);
setAuthReady(true);

// keep driverId in sync with request
setDriverId(String(merged.driverId || ""));
},
(e) => {
setError(e?.message ?? "Failed to load request.");
setLoading(false);
setAuthReady(true);
}
);
});

return () => {
unsubAuth();
if (unsubReq) unsubReq();
};
}, [router, requestId]);

// Load drivers for customer (for request driver selection)
useEffect(() => {
if (!uid) return;
if (!authReady) return;

let cancelled = false;

async function loadDrivers() {
setDriversLoading(true);
try {
const snap = await getDocs(collection(db, "customerProfiles", uid, "drivers"));
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DriverRow[];
if (!cancelled) setDrivers(rows);
} catch {
if (!cancelled) setDrivers([]);
} finally {
if (!cancelled) setDriversLoading(false);
}
}

loadDrivers();
return () => {
cancelled = true;
};
}, [uid, authReady]);

// BIDS LISTENER (GATED)
useEffect(() => {
setBids([]);
setBidsErr(null);

if (!requestId) return;
if (!authReady) return;
if (!uid) return;
if (!item) return;
if (!isOwner) return;
if (!canSeeBids) return;

const qb = query(collection(db, "roadsideRequests", requestId, "bids"), orderBy("createdAt", "desc"), limit(50));

const unsub = onSnapshot(
qb,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Bid[];
setBids(rows);
setBidsErr(null);
},
(e) => {
setBids([]);
setBidsErr(e?.message || "Failed to load bids.");
}
);

return () => unsub();
}, [requestId, authReady, uid, item, isOwner, canSeeBids]);

// CHAT LISTENER (GATED) — uses chatThreads/main/messages
useEffect(() => {
if (!requestId) return;
if (!authReady) return;
if (!uid) return;
if (!item) return;
if (!isOwner) return;

const qChat = query(
collection(db, "roadsideRequests", requestId, "chatThreads", "main", "messages"),
orderBy("createdAt", "asc"),
limit(200)
);

const unsub = onSnapshot(
qChat,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Message[];
setMessages(rows);
setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
},
() => {}
);

return () => unsub();
}, [requestId, authReady, uid, item, isOwner]);

async function sendChat() {
const trimmed = text.trim();
if (!trimmed || !uid || !requestId) return;

setSending(true);
try {
await addDoc(collection(db, "roadsideRequests", requestId, "chatThreads", "main", "messages"), {
text: trimmed,
senderUid: uid,
senderName: auth.currentUser?.displayName ?? auth.currentUser?.email ?? "User",
createdAt: serverTimestamp(),
});
setText("");
} finally {
setSending(false);
}
}

// ✅ CHANGED: customer acceptance goes straight to "accepted"
async function acceptBid(bid: Bid) {
if (!requestId || !item) return;
setError(null);
setBusyBidId(bid.id);

try {
const providerId = String(bid.providerId || bid.id || "");
if (!providerId) throw new Error("Bid is missing providerId.");

const ref = doc(db, "roadsideRequests", requestId);

await updateDoc(ref, {
providerId,
acceptedBidId: bid.id,
status: "accepted",
acceptedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
} as any);

const bidRef = doc(db, "roadsideRequests", requestId, "bids", bid.id);
await updateDoc(bidRef, {
bidStatus: "accepted_by_customer",
rejectedByCustomer: false,
updatedAt: serverTimestamp(),
} as any);

await safeNotifyUser(providerId, {
title: "Bid accepted",
body: "Your offer was accepted. This job is now Active.",
path: `/provider/requests/${requestId}`,
});
} catch (e: any) {
setError(e?.message || "Failed to accept bid.");
} finally {
setBusyBidId(null);
}
}

async function rejectBid(bid: Bid) {
if (!requestId) return;
setError(null);
setBusyBidId(bid.id);

try {
const bidRef = doc(db, "roadsideRequests", requestId, "bids", bid.id);
await updateDoc(bidRef, {
bidStatus: "rejected_by_customer",
rejectedByCustomer: true,
rejectedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
} as any);

const providerId = String(bid.providerId || bid.id || "");
if (providerId) {
await safeNotifyUser(providerId, {
title: "Bid rejected",
body: "Customer rejected your bid on a request.",
path: `/provider/requests/${requestId}`,
});
}
} catch (e: any) {
setError(e?.message || "Failed to reject bid.");
} finally {
setBusyBidId(null);
}
}

function openCounter(bid: Bid) {
setCounterOpenFor(bid.id);
setCounterAmount("");
setCounterEta("");
setCounterMessage("");
}

async function submitCounter(bid: Bid) {
if (!requestId) return;

const amt = Number(counterAmount);
const eta = counterEta ? Number(counterEta) : null;

if (!Number.isFinite(amt) || amt <= 0) {
setError("Enter a valid counter amount.");
return;
}
if (counterEta && (!Number.isFinite(eta) || (eta as number) <= 0)) {
setError("Enter a valid ETA in minutes (or leave blank).");
return;
}

setError(null);
setBusyBidId(bid.id);

try {
const bidRef = doc(db, "roadsideRequests", requestId, "bids", bid.id);
await updateDoc(bidRef, {
counterAmount: amt,
counterEtaMinutes: eta,
counterMessage: counterMessage.trim() || null,
counteredAt: serverTimestamp(),
counterStatus: "countered_by_customer",
updatedAt: serverTimestamp(),
} as any);

const reqRef = doc(db, "roadsideRequests", requestId);
if (["open", "bidding"].includes(String(item?.status || ""))) {
await updateDoc(reqRef, { status: "bidding", updatedAt: serverTimestamp() } as any);
}

const providerId = String(bid.providerId || bid.id || "");
if (providerId) {
await safeNotifyUser(providerId, {
title: "Counter offer",
body: "Customer sent a counter offer. Open the job to respond.",
path: `/provider/requests/${requestId}`,
});
}

setCounterOpenFor(null);
} catch (e: any) {
setError(e?.message || "Failed to send counter.");
} finally {
setBusyBidId(null);
}
}

async function cancelRequest() {
if (!requestId || !item) return;

setError(null);
try {
const ref = doc(db, "roadsideRequests", requestId);
await updateDoc(ref, { status: "canceled", updatedAt: serverTimestamp() } as any);
} catch (e: any) {
setError(e?.message || "Failed to cancel request.");
}
}

async function saveDriverSelection(nextDriverId: string) {
if (!requestId || !item) return;
if (!isOwner) return;

setError(null);

try {
const d = drivers.find((x) => x.id === nextDriverId) || null;

await updateDoc(doc(db, "roadsideRequests", requestId), {
driverId: nextDriverId || null,
driverName: d?.name || null,
driverPhone: d?.phone || null,
updatedAt: serverTimestamp(),
} as any);

setDriverId(nextDriverId);
} catch (e: any) {
setError(e?.message || "Failed to save driver selection.");
}
}

const assignedLabel = useMemo(() => {
if (!item) return "—";
const name = item.assignedToName || item.providerAssignedToName || null;
const phone = item.assignedToPhone || item.providerAssignedToPhone || null;

if (name && phone) return `${name} (${phone})`;
if (name) return name;
if (phone) return phone;

const anyUid = item.assignedEmployeeUid || item.assignedToUid || item.assignedTo || null;
return anyUid || "—";
}, [item]);

const timeline = useMemo(() => {
if (!item) return [];
const onSite = item.onSiteAt || item.onsiteAt || null;

return [
{ label: "Bid accepted", ts: item.acceptedAt },
{ label: "Assigned", ts: item.assignedAt },
{ label: "En route", ts: item.enrouteAt },
{ label: "On site", ts: onSite },
{ label: "In progress", ts: item.inProgressAt },
{ label: "Completed", ts: item.completedAt },
].filter((x) => !!x.ts);
}, [item]);

const canShowChat = isOwner && !!uid && !!requestId;

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

if (!item) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
{error ?? "Not found"}
</p>
<button
type="button"
onClick={() => router.push("/requests")}
className="mt-4 w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back
</button>
</div>
</main>
);
}

const isCompleted = status === "completed";
const canRate = isOwner && isCompleted && item.providerId && !item.providerRated;

const isOpenLike = ["open", "bidding"].includes(status);

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-3xl mx-auto">
{/* Header */}
<div className="flex items-start justify-between gap-3 mb-4">
<div>
<h1 className="text-2xl font-bold">Request Details</h1>
<div className="text-sm text-gray-600 mt-1">
Status: <b>{titleCase(status || "—")}</b>
</div>
</div>

<div className="flex items-center gap-2">
<NotificationsBell />
<button
type="button"
onClick={doSignOut}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Sign Out
</button>
</div>
</div>

{error ? (
<div className="mb-4 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">{error}</div>
) : null}

{/* Request Card */}
<div className="border border-gray-200 rounded-2xl p-6 bg-white">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-lg font-semibold">{titleCase(item.issueType || "Roadside Request")}</div>
<div className="text-sm text-gray-700 mt-1">
{item.addressFormatted || item.addressText || item.locationText || item.pickupAddress || "—"}
</div>
{item.dropoffAddress ? (
<div className="text-sm text-gray-700 mt-1">
<span className="text-gray-500">Dropoff:</span> {item.dropoffAddress}
</div>
) : null}
{item.notes ? <div className="text-xs text-gray-500 mt-2">Notes: {item.notes}</div> : null}
</div>

<div className="text-right text-xs text-gray-500">
<div>Request ID</div>
<div className="font-mono">{item.id}</div>
</div>
</div>

<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
<div className="border rounded-xl p-4">
<div className="text-xs text-gray-500 mb-1">Assigned to</div>
<div className="text-sm font-semibold">{assignedLabel}</div>
{item.unitNumber ? (
<div className="text-xs text-gray-600 mt-1">
Unit: <b>{item.unitNumber}</b>
</div>
) : null}
</div>

<div className="border rounded-xl p-4">
<div className="text-xs text-gray-500 mb-1">Vehicle</div>
<div className="text-sm font-semibold">{item.vehicle || "—"}</div>
{item.tow ? (
<div className="text-xs text-gray-600 mt-1">
Tow: <b>Yes</b>
{item.trailer ? <> • Trailer: <b>{item.trailer}</b></> : null}
</div>
) : (
<div className="text-xs text-gray-600 mt-1">
Tow: <b>No</b>
</div>
)}
</div>
</div>

{/* Timeline */}
<div className="mt-4 border rounded-xl p-4">
<div className="text-sm font-semibold mb-2">Timeline</div>
{timeline.length === 0 ? (
<div className="text-sm text-gray-600">No updates yet.</div>
) : (
<div className="space-y-2">
{timeline.map((t, idx) => (
<div key={idx} className="flex items-center justify-between text-sm">
<div className="text-gray-700">{t.label}</div>
<div className="text-gray-500">{formatWhen(t.ts)}</div>
</div>
))}
</div>
)}
</div>

{/* Driver selection (customer only) */}
{isOwner ? (
<div className="mt-4 border rounded-xl p-4">
<div className="text-sm font-semibold mb-2">Driver (optional)</div>
<div className="text-xs text-gray-600 mb-2">
Choose a driver saved in your customer profile for this request.
</div>

<select
className="border rounded-lg p-2 w-full"
value={driverId}
onChange={(e) => saveDriverSelection(e.target.value)}
disabled={driversLoading}
>
<option value="">No driver selected</option>
{drivers.map((d) => (
<option key={d.id} value={d.id}>
{d.name || d.phone || d.id}
</option>
))}
</select>

{driversLoading ? <div className="text-xs text-gray-500 mt-1">Loading drivers…</div> : null}
</div>
) : null}

{/* Cancel request */}
{isOwner && isOpenLike ? (
<div className="mt-4">
<button
type="button"
onClick={cancelRequest}
className="w-full border border-red-300 text-red-700 rounded-lg py-3 font-medium hover:bg-red-50"
>
Cancel Request
</button>
</div>
) : null}
</div>

{/* Bids */}
{canSeeBids ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="flex items-center justify-between">
<div className="text-lg font-semibold">Bids</div>
<div className="text-xs text-gray-500">
{bids.length} bid{bids.length === 1 ? "" : "s"}
</div>
</div>

{bidsErr ? (
<div className="mt-3 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">{bidsErr}</div>
) : null}

{bids.length === 0 ? (
<div className="mt-3 text-sm text-gray-600">No bids yet.</div>
) : (
<div className="mt-4 space-y-3">
{bids.map((b) => {
const amount = b.amount ?? b.price;
const eta = b.etaMinutes ?? (b.eta ? Number(b.eta) : null);
const providerId = String(b.providerId || b.id || "");
const busy = busyBidId === b.id;

const showCounter = counterOpenFor === b.id;

return (
<div key={b.id} className="border rounded-xl p-4">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-sm font-semibold">{money(amount)}</div>
<div className="text-xs text-gray-600 mt-1">
ETA: <b>{eta != null && Number.isFinite(Number(eta)) ? `${eta} min` : "—"}</b>
</div>
{b.message ? <div className="text-sm text-gray-700 mt-2">{b.message}</div> : null}
<div className="text-[11px] text-gray-400 mt-2">Provider: {providerId || "—"}</div>

{b.counterStatus ? (
<div className="mt-2 text-xs text-gray-700">
Counter status: <b>{titleCase(String(b.counterStatus))}</b>
{b.counterAmount != null ? <> • Amount: <b>{money(b.counterAmount)}</b></> : null}
{b.counterEtaMinutes != null ? <> • ETA: <b>{b.counterEtaMinutes} min</b></> : null}
{b.counterMessage ? <> • “{b.counterMessage}”</> : null}
</div>
) : null}

{b.bidStatus ? (
<div className="mt-2 text-xs text-gray-700">
Bid status: <b>{titleCase(String(b.bidStatus))}</b>
</div>
) : null}
</div>

{canTakeBidActions ? (
<div className="flex flex-col gap-2 min-w-[160px]">
<button
type="button"
onClick={() => acceptBid(b)}
disabled={busy}
className="bg-black text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
>
{busy ? "Working…" : "Accept"}
</button>

<button
type="button"
onClick={() => rejectBid(b)}
disabled={busy}
className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
>
Reject
</button>

<button
type="button"
onClick={() => openCounter(b)}
disabled={busy}
className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
>
Counter
</button>
</div>
) : null}
</div>

{/* Counter UI */}
{showCounter ? (
<div className="mt-4 border rounded-xl p-3 bg-gray-50">
<div className="text-sm font-semibold">Send counter offer</div>

<div className="mt-3 grid md:grid-cols-3 gap-2">
<div>
<div className="text-xs text-gray-600 mb-1">Amount *</div>
<input
className="border rounded-lg p-2 w-full"
value={counterAmount}
onChange={(e) => setCounterAmount(e.target.value)}
placeholder="e.g. 175"
/>
</div>

<div>
<div className="text-xs text-gray-600 mb-1">ETA (min)</div>
<input
className="border rounded-lg p-2 w-full"
value={counterEta}
onChange={(e) => setCounterEta(e.target.value)}
placeholder="optional"
/>
</div>

<div className="md:col-span-1">
<div className="text-xs text-gray-600 mb-1">Message</div>
<input
className="border rounded-lg p-2 w-full"
value={counterMessage}
onChange={(e) => setCounterMessage(e.target.value)}
placeholder="optional"
/>
</div>
</div>

<div className="mt-3 flex gap-2">
<button
type="button"
onClick={() => submitCounter(b)}
disabled={busy}
className="bg-black text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
>
Send Counter
</button>
<button
type="button"
onClick={() => setCounterOpenFor(null)}
className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-50"
>
Cancel
</button>
</div>
</div>
) : null}
</div>
);
})}
</div>
)}
</div>
) : null}

{/* Chat */}
{canShowChat ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Chat</div>
<div className="text-xs text-gray-500 mt-1">Messages between you and the provider.</div>

<div className="mt-4 border rounded-xl p-3 h-[320px] overflow-y-auto bg-white">
{messages.length === 0 ? (
<div className="text-sm text-gray-600">No messages yet.</div>
) : (
<div className="space-y-2">
{messages.map((m) => {
const mine = m.senderUid === uid;
return (
<div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
<div className={`max-w-[80%] border rounded-xl px-3 py-2 ${mine ? "bg-black text-white" : "bg-gray-50"}`}>
<div className={`text-[11px] ${mine ? "text-white/80" : "text-gray-500"}`}>
{m.senderName || (mine ? "You" : "User")}
</div>
<div className="text-sm whitespace-pre-wrap">{m.text || ""}</div>
<div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-gray-400"}`}>
{formatWhen(m.createdAt)}
</div>
</div>
</div>
);
})}
<div ref={bottomRef} />
</div>
)}
</div>

<div className="mt-3 flex gap-2">
<input
className="border rounded-lg p-2 flex-1"
value={text}
onChange={(e) => setText(e.target.value)}
placeholder="Type a message…"
onKeyDown={(e) => {
if (e.key === "Enter" && !e.shiftKey) {
e.preventDefault();
sendChat();
}
}}
/>
<button
type="button"
onClick={sendChat}
disabled={sending}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
>
{sending ? "Sending…" : "Send"}
</button>
</div>
</div>
) : null}

{/* Back */}
<div className="mt-6">
<button
type="button"
onClick={() => router.push("/requests")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Requests
</button>
</div>
</div>
</main>
);
}

