"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
addDoc,
collection,
doc,
onSnapshot,
orderBy,
query,
serverTimestamp,
updateDoc,
writeBatch,
limit,
} from "firebase/firestore";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import NotificationsBell from "@/components/NotificationsBell";

type Message = {
id: string;
text?: string;
senderUid: string;
senderName?: string;
createdAt?: any;
attachmentUrl?: string;
attachmentName?: string;
};

type RoadsideRequest = {
id: string;
createdByUid?: string | null;
customerUid?: string | null;
providerId?: string | null;

status?: string;
issueType?: string;

addressFormatted?: string;
addressText?: string;
locationText?: string;

notes?: string;

providerAssignedToName?: string | null;
providerAssignedToPhone?: string | null;
};

type Bid = {
providerId?: string;

amount?: number;
message?: string;
etaMinutes?: number;

// ✅ customer counter fields
counterAmount?: number | null;
counterEtaMinutes?: number | null;
counterMessage?: string | null;
counteredAt?: any;
counterStatus?: string | null; // "countered_by_customer" | "counter_accepted_by_provider" | "counter_rejected_by_provider" | etc.

// optional status flags
bidStatus?: string | null; // "placed" | "accepted_by_customer" | "rejected_by_customer" etc.
rejectedByCustomer?: boolean | null;

createdAt?: any;
updatedAt?: any;
};

function titleCase(s: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function addr(item: RoadsideRequest) {
return item.addressFormatted || item.addressText || item.locationText || "—";
}

function isBiddableStatus(status?: string) {
return status === "open" || status === "bidding";
}

function isActiveStatus(status?: string) {
return (
status === "accepted" ||
status === "assigned" ||
status === "enroute" ||
status === "on_site" ||
status === "onsite" ||
status === "in_progress" ||
status === "pending_provider_confirmation" ||
status === "pending_customer_confirmation"
);
}

function formatWhen(ts: any) {
if (!ts?.toDate) return "";
try {
return ts.toDate().toLocaleString();
} catch {
return "";
}
}

export default function ProviderJobPage() {
const router = useRouter();
const params = useParams<{ id: string }>();
const requestId = params?.id;

const [loading, setLoading] = useState(true);
const [uid, setUid] = useState<string | null>(null);
const [displayName, setDisplayName] = useState<string>("Provider");

const [item, setItem] = useState<RoadsideRequest | null>(null);
const [error, setError] = useState<string | null>(null);

// bid
const [bidAmount, setBidAmount] = useState<string>("");
const [bidMessage, setBidMessage] = useState<string>("");
const [etaMinutes, setEtaMinutes] = useState<string>("");
const [existingBid, setExistingBid] = useState<Bid | null>(null);

// assign tech
const [techName, setTechName] = useState("");
const [techPhone, setTechPhone] = useState("");

// chat
const [messages, setMessages] = useState<Message[]>([]);
const [text, setText] = useState("");
const [uploading, setUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement | null>(null);
const bottomRef = useRef<HTMLDivElement | null>(null);

async function doSignOut() {
await signOut(auth);
router.push("/auth/sign-in");
router.refresh();
}

// Auth + request listener
useEffect(() => {
let unsubReq: null | (() => void) = null;
let unsubBid: null | (() => void) = null;

const unsubAuth = onAuthStateChanged(auth, (user) => {
setError(null);

if (!user) {
router.push("/auth/sign-in");
return;
}

setUid(user.uid);
setDisplayName(user.displayName ?? user.email ?? "Provider");

if (!requestId) {
setError("Missing request id.");
setLoading(false);
return;
}

const ref = doc(db, "roadsideRequests", requestId);
unsubReq = onSnapshot(
ref,
(snap) => {
if (!snap.exists()) {
setItem(null);
setError("Job not found.");
setLoading(false);
return;
}

const data = snap.data() as any;
const merged = { id: snap.id, ...(data as any) } as RoadsideRequest;
setItem(merged);
setLoading(false);
},
(e) => {
setError(e?.message ?? "Failed to load job.");
setLoading(false);
}
);

// provider's bid doc
const bidRef = doc(db, "roadsideRequests", requestId, "bids", user.uid);
unsubBid = onSnapshot(bidRef, (s) => {
if (!s.exists()) {
setExistingBid(null);
return;
}
const b = s.data() as any as Bid;
setExistingBid(b);

if (typeof b.amount === "number") setBidAmount(String(b.amount));
if (typeof b.etaMinutes === "number") setEtaMinutes(String(b.etaMinutes));
if (typeof b.message === "string") setBidMessage(b.message);
});
});

return () => {
unsubAuth();
if (unsubReq) unsubReq();
if (unsubBid) unsubBid();
};
}, [router, requestId]);

const isAssignedProvider = useMemo(() => {
if (!uid || !item) return false;
return item.providerId === uid;
}, [uid, item]);

const showBidding = useMemo(() => {
if (!item) return false;
return isBiddableStatus(item.status);
}, [item]);

const showActiveSection = useMemo(() => {
if (!item) return false;
return isAssignedProvider && isActiveStatus(item.status);
}, [item, isAssignedProvider]);

// ✅ CHAT LISTENER (FIXED): shared path used by BOTH customer + provider
useEffect(() => {
if (!requestId || !uid) return;

const qRef = query(
collection(db, "roadsideRequests", requestId, "chats", "main", "messages"),
orderBy("createdAt", "asc"),
limit(200)
);

const unsub = onSnapshot(qRef, (snap) => {
const rows = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
})) as Message[];

setMessages(rows);
setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
});

return () => unsub();
}, [requestId, uid]);

async function upsertBid() {
if (!uid || !requestId || !item) return;

const amountNum = Number(bidAmount);
const etaNum = etaMinutes ? Number(etaMinutes) : undefined;

if (!Number.isFinite(amountNum) || amountNum <= 0) {
alert("Enter a valid bid amount.");
return;
}
if (etaMinutes && (!Number.isFinite(etaNum) || (etaNum as number) <= 0)) {
alert("Enter a valid ETA in minutes (or leave blank).");
return;
}

const batch = writeBatch(db);

// 1) job bid doc
const bidDocRef = doc(db, "roadsideRequests", requestId, "bids", uid);
batch.set(
bidDocRef,
{
providerId: uid,
amount: amountNum,
etaMinutes: etaNum ?? null,
message: bidMessage || "",
bidStatus: "placed",
updatedAt: serverTimestamp(),
createdAt: existingBid?.createdAt ?? serverTimestamp(),
},
{ merge: true }
);

// 2) provider dashboard index
const idxRef = doc(db, "providerBids", uid, "jobs", requestId);
batch.set(
idxRef,
{
jobId: requestId,
status: item.status || "—",
amount: amountNum,
etaMinutes: etaNum ?? null,
message: bidMessage || "",
updatedAt: serverTimestamp(),
createdAt: existingBid?.createdAt ?? serverTimestamp(),
},
{ merge: true }
);

await batch.commit();
alert(existingBid ? "Bid updated." : "Bid placed.");
}

// ✅ provider responds to customer counter
async function acceptCounter() {
if (!uid || !requestId) return;
if (!existingBid?.counterAmount || existingBid.counterAmount <= 0) {
alert("No counter offer found.");
return;
}

const bidRef = doc(db, "roadsideRequests", requestId, "bids", uid);

await updateDoc(bidRef, {
// optionally “accept” by adopting the counter into the main amount/eta/message:
amount: existingBid.counterAmount,
etaMinutes: existingBid.counterEtaMinutes ?? null,
message: existingBid.counterMessage ?? "",
counterStatus: "counter_accepted_by_provider",
updatedAt: serverTimestamp(),
});

alert("Counter accepted. Customer can now finalize/accept the job.");
}

async function rejectCounter() {
if (!uid || !requestId) return;

const bidRef = doc(db, "roadsideRequests", requestId, "bids", uid);

await updateDoc(bidRef, {
counterStatus: "counter_rejected_by_provider",
updatedAt: serverTimestamp(),
});

alert("Counter rejected.");
}

async function saveTechnician() {
if (!uid || !requestId || !item) return;
if (!isAssignedProvider) {
alert("This job is not assigned to you yet.");
return;
}
if (!techName.trim()) {
alert("Enter technician name.");
return;
}

const ref = doc(db, "roadsideRequests", requestId);
await updateDoc(ref, {
providerAssignedToName: techName.trim(),
providerAssignedToPhone: techPhone.trim() || null,
providerAssignedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

alert("Technician saved.");
}

async function setStatus(next: string) {
if (!uid || !requestId || !item) return;
if (!isAssignedProvider) {
alert("This job is not assigned to you yet.");
return;
}

const ref = doc(db, "roadsideRequests", requestId);
const patch: Record<string, any> = {
status: next,
updatedAt: serverTimestamp(),
};

if (next === "enroute") patch.enrouteAt = serverTimestamp();
if (next === "on_site" || next === "onsite") patch.onSiteAt = serverTimestamp();
if (next === "in_progress") patch.inProgressAt = serverTimestamp();
if (next === "completed") patch.completedAt = serverTimestamp();

await updateDoc(ref, patch);
}

async function sendChat(attachment?: { url: string; name: string } | null) {
const trimmed = text.trim();
if ((!trimmed && !attachment) || !uid || !requestId) return;

await addDoc(
collection(db, "roadsideRequests", requestId, "chats", "main", "messages"),
{
text: trimmed || "",
senderUid: uid,
senderName: displayName,
attachmentUrl: attachment?.url ?? null,
attachmentName: attachment?.name ?? null,
createdAt: serverTimestamp(),
}
);

setText("");
}

async function pickAndUpload() {
if (!fileInputRef.current) return;
fileInputRef.current.click();
}

async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
const file = e.target.files?.[0];
if (!file || !uid || !requestId) return;

try {
setUploading(true);
const storage = getStorage();
const path = `roadsideRequests/${requestId}/chatAttachments/${Date.now()}_${file.name}`;
const fileRef = sRef(storage, path);

await uploadBytes(fileRef, file);
const url = await getDownloadURL(fileRef);

await sendChat({ url, name: file.name });
} catch (err: any) {
console.error(err);
alert(err?.message || "Failed to upload attachment.");
} finally {
setUploading(false);
if (fileInputRef.current) fileInputRef.current.value = "";
}
}

if (loading) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-4xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

if (!item) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-4xl border border-gray-200 rounded-2xl p-8">
<p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
{error ?? "Not found"}
</p>
<button
type="button"
onClick={() => router.push("/dashboard/provider?tab=available")}
className="mt-4 w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Dashboard
</button>
</div>
</main>
);
}

const hasCustomerCounter =
!!existingBid?.counterAmount &&
existingBid.counterAmount > 0 &&
(existingBid.counterStatus === "countered_by_customer" || !existingBid.counterStatus);

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto border border-gray-200 rounded-2xl p-8">
{/* Header */}
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-3xl font-bold text-gray-900">Job</h1>
<p className="text-sm text-gray-600">
Status: <b>{titleCase(item.status || "—")}</b>
</p>
</div>

<div className="flex items-center gap-2">
<NotificationsBell />
<button
type="button"
onClick={() => router.push("/dashboard/provider")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Dashboard
</button>
<button
type="button"
onClick={doSignOut}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Sign Out
</button>
</div>
</div>

{/* Details */}
<div className="mt-6 text-sm text-gray-800 border border-gray-200 rounded-xl p-4">
<div>
<span className="text-gray-500">Issue:</span>{" "}
{titleCase(item.issueType || "—")}
</div>
<div className="mt-1">
<span className="text-gray-500">Address:</span> {addr(item)}
</div>
{item.notes ? (
<div className="mt-1">
<span className="text-gray-500">Notes:</span> {item.notes}
</div>
) : null}
<div className="mt-1">
<span className="text-gray-500">Assigned Technician/Driver:</span>{" "}
{item.providerAssignedToName
? `${item.providerAssignedToName} (${item.providerAssignedToPhone || "—"})`
: "—"}
</div>
</div>

{/* Bidding (ONLY for available jobs) */}
{showBidding ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold mb-2">Bidding</div>

{/* ✅ Customer counter panel */}
{existingBid && (existingBid.rejectedByCustomer || existingBid.bidStatus === "rejected_by_customer") ? (
<div className="mb-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
Customer rejected your bid.
</div>
) : null}

{existingBid && hasCustomerCounter ? (
<div className="mb-4 border border-amber-200 bg-amber-50 text-amber-800 rounded-lg p-4">
<div className="font-semibold">Customer Counter Offer</div>
<div className="text-sm mt-1">
Counter: <b>${existingBid.counterAmount}</b>
{typeof existingBid.counterEtaMinutes === "number"
? ` • ETA ${existingBid.counterEtaMinutes} min`
: ""}
</div>
{existingBid.counterMessage ? (
<div className="text-sm mt-1">Message: {existingBid.counterMessage}</div>
) : null}
<div className="text-xs opacity-70 mt-1">
{existingBid.counteredAt ? `Countered: ${formatWhen(existingBid.counteredAt)}` : ""}
</div>

<div className="mt-3 flex flex-col md:flex-row gap-2">
<button
type="button"
onClick={acceptCounter}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Accept Counter
</button>
<button
type="button"
onClick={rejectCounter}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Reject Counter
</button>
</div>

<div className="text-xs opacity-70 mt-2">
Tip: You can also edit your bid below and send a new offer instead.
</div>
</div>
) : null}

{existingBid ? (
<div className="text-sm text-gray-600 mb-3">
✅ You already placed a bid. You can update it below.
</div>
) : (
<div className="text-sm text-gray-600 mb-3">
Place your bid with ETA + a short breakdown.
</div>
)}

<div className="grid md:grid-cols-3 gap-3">
<input
value={bidAmount}
onChange={(e) => setBidAmount(e.target.value)}
placeholder="Bid amount (e.g. 500)"
className="border rounded-lg px-3 py-2"
inputMode="numeric"
/>
<input
value={etaMinutes}
onChange={(e) => setEtaMinutes(e.target.value)}
placeholder="ETA minutes (e.g. 45)"
className="border rounded-lg px-3 py-2"
inputMode="numeric"
/>
<input
value={bidMessage}
onChange={(e) => setBidMessage(e.target.value)}
placeholder='Message (examples: "Callout $100 + $175/hr (2hr min)"; "Flat $450 towing within 20mi")'
className="border rounded-lg px-3 py-2 md:col-span-3"
/>
</div>

<button
onClick={upsertBid}
className="mt-4 w-full border rounded-lg py-3 font-medium hover:bg-gray-50"
>
{existingBid ? "Update Bid" : "Place Bid"}
</button>
</div>
) : null}

{/* Active Job (ONLY when assigned to provider) */}
{showActiveSection ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold mb-3">Active Job</div>

{/* Assign tech */}
<div className="border border-gray-100 rounded-xl p-4">
<div className="font-semibold">Assign Technician / Driver</div>
<div className="text-sm text-gray-600 mt-1">
This shows on the customer screen after the job is assigned to your provider account.
</div>

<div className="mt-3 grid md:grid-cols-2 gap-3">
<input
value={techName}
onChange={(e) => setTechName(e.target.value)}
placeholder="Technician name"
className="border rounded-lg px-3 py-2"
/>
<input
value={techPhone}
onChange={(e) => setTechPhone(e.target.value)}
placeholder="Technician phone (optional)"
className="border rounded-lg px-3 py-2"
/>
</div>

<button
onClick={saveTechnician}
className="mt-3 w-full border rounded-lg py-2 hover:bg-gray-50"
>
Save Technician
</button>
</div>

{/* Job status */}
<div className="mt-4 border border-gray-100 rounded-xl p-4">
<div className="font-semibold">Job Status</div>

<div className="mt-3 grid md:grid-cols-3 gap-3">
<button
className="border rounded-lg py-2 hover:bg-gray-50"
onClick={() => setStatus("enroute")}
>
Mark Enroute
</button>
<button
className="border rounded-lg py-2 hover:bg-gray-50"
onClick={() => setStatus("on_site")}
>
Mark On Site
</button>
<button
className="border rounded-lg py-2 hover:bg-gray-50"
onClick={() => setStatus("in_progress")}
>
Mark In Progress
</button>
</div>

<button
className="mt-3 w-full border rounded-lg py-2 hover:bg-gray-50"
onClick={() => setStatus("completed")}
>
Mark Completed
</button>
</div>
</div>
) : null}

{/* Chat */}
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold mb-3">Job Chat</div>

<div className="h-64 overflow-y-auto border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
{messages.length === 0 ? (
<div className="text-sm text-gray-500">No messages yet.</div>
) : (
messages.map((m) => (
<div
key={m.id}
className={`max-w-[90%] px-3 py-2 rounded-lg text-sm ${
m.senderUid === uid
? "ml-auto bg-black text-white"
: "mr-auto bg-white border"
}`}
>
<div className="text-xs opacity-70 mb-1">
{m.senderUid === uid ? "You" : (m.senderName ?? "User")}
{m.createdAt ? ` • ${formatWhen(m.createdAt)}` : ""}
</div>

{m.text ? <div>{m.text}</div> : null}

{m.attachmentUrl ? (
<div className="mt-1">
<a
href={m.attachmentUrl}
target="_blank"
rel="noreferrer"
className={`underline ${
m.senderUid === uid ? "text-white" : "text-black"
}`}
>
📎 {m.attachmentName || "Attachment"}
</a>
</div>
) : null}
</div>
))
)}
<div ref={bottomRef} />
</div>

<div className="mt-3 flex gap-2 items-center">
<button
type="button"
onClick={pickAndUpload}
disabled={uploading}
className="border rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-60"
title="Attach a photo or file"
>
{uploading ? "Uploading…" : "📎"}
</button>

<input
ref={fileInputRef}
type="file"
className="hidden"
onChange={onFileSelected}
/>

<input
value={text}
onChange={(e) => setText(e.target.value)}
onKeyDown={(e) => e.key === "Enter" && sendChat(null)}
placeholder="Type a message…"
className="flex-1 border rounded-lg px-3 py-2"
/>
<button
type="button"
onClick={() => sendChat(null)}
className="bg-black text-white px-4 rounded-lg py-2"
>
Send
</button>
</div>
</div>

<div className="mt-6 space-y-3">
<button
type="button"
onClick={() => router.push("/dashboard/provider")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back to Provider Dashboard
</button>
</div>
</div>
</main>
);
}

