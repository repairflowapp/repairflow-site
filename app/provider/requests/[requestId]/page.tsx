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
where,
setDoc,
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

// counter / reject fields (customer side)
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

// internal job flags
origin?: string | null;
createdFromDispatch?: boolean | null;
internalDispatchJobId?: string | null;

// timestamps
assignedAt?: any;
enrouteAt?: any;
onSiteAt?: any;
onsiteAt?: any;
inProgressAt?: any;
completedAt?: any;
acceptedAt?: any;
providerConfirmedAt?: any;
customerConfirmedAt?: any;

updatedAt?: any;
createdAt?: any;
};

type DriverRow = { id: string; name?: string; phone?: string };

type EmployeeRow = {
id: string;
name?: string;
phone?: string;
role?: string; // tech/dispatcher/etc
active?: boolean;
};

type ViewerKind = "customer" | "provider" | "employee" | "unknown";

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

// Never let notifications break flows
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
const params = useParams() as any;
const requestId: string | undefined = params?.requestId || params?.id;

const [loading, setLoading] = useState(true);
const [uid, setUid] = useState<string | null>(null);

const [role, setRole] = useState<string | null>(null);
const [viewer, setViewer] = useState<ViewerKind>("unknown");

// providerUid for provider + employees (employees point at their provider)
const [providerUid, setProviderUid] = useState<string | null>(null);

// gating
const [authReady, setAuthReady] = useState(false);

const [item, setItem] = useState<RoadsideRequest | null>(null);
const [error, setError] = useState<string | null>(null);

// ---------------------
// CUSTOMER: bids list + counter UI
// ---------------------
const [bids, setBids] = useState<Bid[]>([]);
const [bidsErr, setBidsErr] = useState<string | null>(null);
const [busyBidId, setBusyBidId] = useState<string | null>(null);

const [counterOpenFor, setCounterOpenFor] = useState<string | null>(null);
const [counterAmount, setCounterAmount] = useState<string>("");
const [counterEta, setCounterEta] = useState<string>("");
const [counterMessage, setCounterMessage] = useState<string>("");

// ---------------------
// PROVIDER: bidding form (provider-side)
// ---------------------
const [myBid, setMyBid] = useState<Bid | null>(null);
const [bidAmount, setBidAmount] = useState<string>("");
const [bidEta, setBidEta] = useState<string>("");
const [bidMsg, setBidMsg] = useState<string>("");
const [savingBid, setSavingBid] = useState(false);
const [myBidErr, setMyBidErr] = useState<string | null>(null);

// ---------------------
// EXTERNAL CHAT (customer <-> provider)
// ---------------------
const [extMessages, setExtMessages] = useState<Message[]>([]);
const [extText, setExtText] = useState("");
const [sendingExt, setSendingExt] = useState(false);
const extBottomRef = useRef<HTMLDivElement | null>(null);

// ---------------------
// INTERNAL CHAT (dispatch/tech/provider)
// stored at roadsideRequests/{id}/chats/internal/messages
// ---------------------
const [intMessages, setIntMessages] = useState<Message[]>([]);
const [intText, setIntText] = useState("");
const [sendingInt, setSendingInt] = useState(false);
const intBottomRef = useRef<HTMLDivElement | null>(null);

// ---------------------
// CUSTOMER driver selection
// ---------------------
const [drivers, setDrivers] = useState<DriverRow[]>([]);
const [driversLoading, setDriversLoading] = useState(false);
const [driverId, setDriverId] = useState("");

// ---------------------
// Provider technician assignment
// ---------------------
const [employees, setEmployees] = useState<EmployeeRow[]>([]);
const [employeesLoading, setEmployeesLoading] = useState(false);
const [assigning, setAssigning] = useState(false);
const [assignedEmployeeUid, setAssignedEmployeeUid] = useState("");

const status = String(item?.status || "");

const isInternal = useMemo(() => {
const o = String(item?.origin || "");
return o === "internal" || item?.createdFromDispatch === true;
}, [item]);

const isCustomerOwner = useMemo(() => {
if (!uid || !item) return false;
return item.createdByUid === uid || item.customerUid === uid;
}, [uid, item]);

const providerIsOnRequest = useMemo(() => {
if (!item) return false;
if (!providerUid) return false;
return String(item.providerId || "") === String(providerUid || "");
}, [item, providerUid]);

// Provider can see marketplace job even before assigned, but not customer-only sections.
const providerCanViewMarketplaceJob = useMemo(() => {
if (!providerUid) return false;
return ["open", "bidding"].includes(String(item?.status || ""));
}, [providerUid, item]);

const canSeeCustomerBidList = useMemo(() => {
// customer can see bid list for marketplace jobs
return isCustomerOwner && !isInternal;
}, [isCustomerOwner, isInternal]);

const canTakeCustomerBidActions = useMemo(() => {
return isCustomerOwner && ["open", "bidding"].includes(status) && !isInternal;
}, [isCustomerOwner, status, isInternal]);

const canShowProviderBiddingBox = useMemo(() => {
// provider bidding section shows on provider view for open/bidding jobs only
if (!providerUid) return false;
if (isInternal) return false;
return ["open", "bidding"].includes(status) && !providerIsOnRequest;
}, [providerUid, isInternal, status, providerIsOnRequest]);

const canShowProviderActions = useMemo(() => {
// provider actions should only show when job is actually assigned to that provider
if (!providerUid) return false;
if (isInternal) {
// internal dispatch jobs can be managed by provider/employee as well
return viewer === "provider" || viewer === "employee";
}
return providerIsOnRequest;
}, [providerUid, providerIsOnRequest, isInternal, viewer]);

const canShowExternalChat = useMemo(() => {
// External chat should be visible to:
// - customer owner
// - provider/employee if (job assigned to provider) OR (marketplace open/bidding)
if (isInternal) return false;
if (isCustomerOwner) return true;
if (!providerUid) return false;
if (providerIsOnRequest) return true;
if (providerCanViewMarketplaceJob) return true;
return false;
}, [isInternal, isCustomerOwner, providerUid, providerIsOnRequest, providerCanViewMarketplaceJob]);

const canShowInternalChat = useMemo(() => {
// internal chat is for provider side only
if (!providerUid) return false;
return viewer === "provider" || viewer === "employee";
}, [providerUid, viewer]);

const canAssignTechnician = useMemo(() => {
// show only for provider OR dispatcher employee
if (!providerUid) return false;
const isProviderOrDispatcher = viewer === "provider" || (viewer === "employee" && role === "dispatcher");
if (!isProviderOrDispatcher) return false;

// marketplace job must be assigned to your provider
if (!isInternal && !providerIsOnRequest) return false;

return ["accepted", "assigned", "enroute", "on_site", "onsite", "in_progress", "completed"].includes(status);
}, [providerUid, viewer, role, providerIsOnRequest, isInternal, status]);

const backPath = useMemo(() => {
if (viewer === "provider" || viewer === "employee") return "/dashboard/provider?tab=active";
return "/requests";
}, [viewer]);

async function doSignOut() {
await signOut(auth);
router.push("/auth/sign-in");
router.refresh();
}

// ------------------------------------
// AUTH + ROLE (avoid duplicate listeners)
// ------------------------------------
useEffect(() => {
let unsubReq: null | (() => void) = null;
let cancelled = false;

const unsubAuth = onAuthStateChanged(auth, async (user) => {
// IMPORTANT: if auth changes, clean old request listener
if (unsubReq) {
try {
unsubReq();
} catch {}
unsubReq = null;
}

setError(null);
setAuthReady(false);

if (!user) {
setUid(null);
setRole(null);
setViewer("unknown");
setProviderUid(null);
setItem(null);
setLoading(false);
setAuthReady(true);
router.push("/auth/sign-in");
return;
}

setUid(user.uid);

// resolve role/providerUid
try {
const us = await getDoc(doc(db, "users", user.uid));
const ud = us.exists() ? (us.data() as any) : null;
const r = String(ud?.role || "");
setRole(r);

// ✅ IMPORTANT: provider account id may not equal auth uid
if (r === "provider") {
setViewer("provider");
const p = String(ud?.providerUid || ud?.providerId || user.uid);
setProviderUid(p || user.uid);
} else if (r === "employee") {
setViewer("employee");
const p = String(ud?.providerUid || ud?.providerId || "");
setProviderUid(p || null);
} else {
setViewer("customer");
setProviderUid(null);
}
} catch {
setRole(null);
setViewer("unknown");
setProviderUid(null);
}

if (!requestId) {
setError("Missing request id.");
setLoading(false);
setAuthReady(true);
return;
}

// Listen to roadside request doc
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

if (!cancelled) {
setItem(merged);
setLoading(false);
setAuthReady(true);

// keep driverId + assigned tech id in sync
setDriverId(String(merged.driverId || ""));
setAssignedEmployeeUid(String(merged.assignedEmployeeUid || ""));
}
},
(e) => {
setError(e?.message ?? "Failed to load request.");
setLoading(false);
setAuthReady(true);
}
);
});

return () => {
cancelled = true;
unsubAuth();
if (unsubReq) unsubReq();
};
}, [router, requestId]);

// -----------------------------
// CUSTOMER: load drivers
// -----------------------------
useEffect(() => {
if (!uid) return;
if (!authReady) return;
if (!isCustomerOwner) return;

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
}, [uid, authReady, isCustomerOwner]);

// -----------------------------
// PROVIDER: load employees for assignment dropdown
// -----------------------------
useEffect(() => {
if (!providerUid) return;
if (!authReady) return;
if (!canAssignTechnician) return;

let cancelled = false;

async function loadEmployees() {
setEmployeesLoading(true);
try {
const qEmp = query(collection(db, "providers", providerUid, "employees"));
const snap = await getDocs(qEmp);

const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EmployeeRow[];
const activeRows = rows.filter((e) => e.active !== false);

if (!cancelled) setEmployees(activeRows);
} catch {
if (!cancelled) setEmployees([]);
} finally {
if (!cancelled) setEmployeesLoading(false);
}
}

loadEmployees();
return () => {
cancelled = true;
};
}, [providerUid, authReady, canAssignTechnician]);

// -----------------------------
// CUSTOMER: BIDS LISTENER (list)
// -----------------------------
useEffect(() => {
setBids([]);
setBidsErr(null);

if (!requestId) return;
if (!authReady) return;
if (!uid) return;
if (!item) return;
if (!canSeeCustomerBidList) return;

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
}, [requestId, authReady, uid, item, canSeeCustomerBidList]);

// -----------------------------
// PROVIDER: My bid (single doc listener)
// -----------------------------
useEffect(() => {
setMyBid(null);
setMyBidErr(null);

if (!requestId) return;
if (!authReady) return;
if (!providerUid) return;
if (!item) return;
if (!canShowProviderBiddingBox) return;

const bidId = providerUid; // bids/{providerUid}
const bidRef = doc(db, "roadsideRequests", requestId, "bids", bidId);

const unsub = onSnapshot(
bidRef,
(snap) => {
if (!snap.exists()) {
setMyBid(null);
return;
}
const b = { id: snap.id, ...(snap.data() as any) } as Bid;
setMyBid(b);

// hydrate UI inputs once-ish
setBidAmount(String(b.amount ?? b.price ?? ""));
setBidEta(String(b.etaMinutes ?? ""));
setBidMsg(String(b.message ?? ""));
},
(e) => {
setMyBid(null);
setMyBidErr(e?.message || "Failed to load your bid.");
}
);

return () => unsub();
}, [requestId, authReady, providerUid, item, canShowProviderBiddingBox]);

// -----------------------------
// EXTERNAL CHAT (customer <-> provider) — chatThreads/main/messages
// -----------------------------
useEffect(() => {
setExtMessages([]);

if (!requestId) return;
if (!authReady) return;
if (!uid) return;
if (!item) return;
if (!canShowExternalChat) return;

const qChat = query(
collection(db, "roadsideRequests", requestId, "chatThreads", "main", "messages"),
orderBy("createdAt", "asc"),
limit(200)
);

const unsub = onSnapshot(
qChat,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Message[];
setExtMessages(rows);
setTimeout(() => extBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
},
() => {}
);

return () => unsub();
}, [requestId, authReady, uid, item, canShowExternalChat]);

// -----------------------------
// INTERNAL CHAT (provider team) — chats/internal/messages
// -----------------------------
useEffect(() => {
setIntMessages([]);

if (!requestId) return;
if (!authReady) return;
if (!uid) return;
if (!item) return;
if (!canShowInternalChat) return;

const qInt = query(
collection(db, "roadsideRequests", requestId, "chats", "internal", "messages"),
orderBy("createdAt", "asc"),
limit(300)
);

const unsub = onSnapshot(
qInt,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Message[];
setIntMessages(rows);
setTimeout(() => intBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
},
() => {}
);

return () => unsub();
}, [requestId, authReady, uid, item, canShowInternalChat]);

async function sendExternalChat() {
const trimmed = extText.trim();
if (!trimmed || !uid || !requestId) return;

setSendingExt(true);
try {
await addDoc(collection(db, "roadsideRequests", requestId, "chatThreads", "main", "messages"), {
text: trimmed,
senderUid: uid,
senderName: auth.currentUser?.displayName ?? auth.currentUser?.email ?? "User",
createdAt: serverTimestamp(),
});
setExtText("");
} finally {
setSendingExt(false);
}
}

async function sendInternalChat() {
const trimmed = intText.trim();
if (!trimmed || !uid || !requestId) return;

setSendingInt(true);
try {
await addDoc(collection(db, "roadsideRequests", requestId, "chats", "internal", "messages"), {
text: trimmed,
senderUid: uid,
senderName: auth.currentUser?.displayName ?? auth.currentUser?.email ?? "User",
createdAt: serverTimestamp(),
});
setIntText("");
} finally {
setSendingInt(false);
}
}

// -----------------------------
// CUSTOMER: accept/reject/counter
// -----------------------------
async function acceptBid(bid: Bid) {
if (!requestId || !item) return;
setError(null);
setBusyBidId(bid.id);

try {
const providerId = String(bid.providerId || bid.id || "");
if (!providerId) throw new Error("Bid is missing providerId.");

await updateDoc(doc(db, "roadsideRequests", requestId), {
providerId,
acceptedBidId: bid.id,
status: "accepted",
acceptedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
} as any);

await updateDoc(doc(db, "roadsideRequests", requestId, "bids", bid.id), {
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
await updateDoc(doc(db, "roadsideRequests", requestId, "bids", bid.id), {
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
await updateDoc(doc(db, "roadsideRequests", requestId, "bids", bid.id), {
counterAmount: amt,
counterEtaMinutes: eta,
counterMessage: counterMessage.trim() || null,
counteredAt: serverTimestamp(),
counterStatus: "countered_by_customer",
updatedAt: serverTimestamp(),
} as any);

if (["open", "bidding"].includes(String(item?.status || ""))) {
await updateDoc(doc(db, "roadsideRequests", requestId), {
status: "bidding",
updatedAt: serverTimestamp(),
} as any);
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

// -----------------------------
// CUSTOMER: driver selection
// -----------------------------
async function saveDriverSelection(nextDriverId: string) {
if (!requestId || !item) return;
if (!isCustomerOwner) return;

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

// -----------------------------
// PROVIDER: status updates
// -----------------------------
async function setProviderStatus(next: string) {
if (!requestId || !item) return;
if (!canShowProviderActions) return;

setError(null);
try {
const now = serverTimestamp();
const patch: any = { status: next, updatedAt: now };

if (next === "assigned") patch.assignedAt = now;
if (next === "enroute") patch.enrouteAt = now;
if (next === "on_site" || next === "onsite") patch.onSiteAt = now;
if (next === "in_progress") patch.inProgressAt = now;
if (next === "completed") patch.completedAt = now;

await updateDoc(doc(db, "roadsideRequests", requestId), patch);
} catch (e: any) {
setError(e?.message || "Failed to update status.");
}
}

// -----------------------------
// PROVIDER: assign technician (once accepted/active)
// -----------------------------
async function assignTechnician(nextEmployeeUid: string) {
if (!requestId || !item) return;
if (!providerUid) return;
if (!canAssignTechnician) return;

setError(null);
setAssigning(true);

try {
const emp = employees.find((e) => e.id === nextEmployeeUid) || null;

await updateDoc(doc(db, "roadsideRequests", requestId), {
assignedEmployeeUid: nextEmployeeUid || null,
assignedToUid: nextEmployeeUid || null,
assignedTo: nextEmployeeUid || null,
assignedToName: emp?.name || null,
assignedToPhone: emp?.phone || null,
assignedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
} as any);

setAssignedEmployeeUid(nextEmployeeUid);
} catch (e: any) {
setError(e?.message || "Failed to assign technician.");
} finally {
setAssigning(false);
}
}

// -----------------------------
// PROVIDER: create/update bid
// ✅ FIXED: always setDoc(merge) so doc can be created safely
// ✅ Also write providerBids index so Provider Dashboard “My Bids” updates
// -----------------------------
async function saveMyBid() {
if (!requestId || !providerUid) return;

const amt = Number(bidAmount);
const eta = bidEta ? Number(bidEta) : null;

if (!Number.isFinite(amt) || amt <= 0) {
setMyBidErr("Enter a valid bid amount.");
return;
}
if (bidEta && (!Number.isFinite(eta) || (eta as number) <= 0)) {
setMyBidErr("Enter a valid ETA in minutes.");
return;
}

setMyBidErr(null);
setSavingBid(true);

try {
// bids/{providerUid}
const bidRef = doc(db, "roadsideRequests", requestId, "bids", providerUid);

await setDoc(
bidRef,
{
providerId: providerUid,
amount: amt,
etaMinutes: eta,
message: bidMsg.trim() || null,
bidStatus: "submitted",
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
} as any,
{ merge: true }
);

// providerBids/{providerUid}/jobs/{requestId}
const idxRef = doc(db, "providerBids", providerUid, "jobs", requestId);
await setDoc(
idxRef,
{
jobId: requestId,
status: "submitted",
amount: amt,
etaMinutes: eta,
message: bidMsg.trim() || null,
updatedAt: serverTimestamp(),
createdAt: serverTimestamp(),
} as any,
{ merge: true }
);
} catch (e: any) {
setMyBidErr(e?.message || "Failed to save bid.");
} finally {
setSavingBid(false);
}
}

// -----------------------------
// Timeline + assigned label
// -----------------------------
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
<p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error ?? "Not found"}</p>
<button
type="button"
onClick={() => router.push(backPath)}
className="mt-4 w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
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
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-3xl font-bold text-gray-900">Request</h1>
<p className="text-sm text-gray-600">
Status: <b>{titleCase(status || "—")}</b>
</p>

<div className="flex flex-wrap items-center gap-2 mt-2">
{role ? (
<span className="text-xs text-gray-600 border rounded-full px-2 py-1">
Viewing as: <b>{role}</b>
</span>
) : null}

{isInternal ? <span className="text-xs border rounded-full px-2 py-1 bg-gray-50">🛠️ Internal Dispatch Job</span> : null}
</div>
</div>

<div className="flex items-center gap-2">
<NotificationsBell />
<button
type="button"
onClick={() => router.push(backPath)}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
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

{error ? <div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3">{error}</div> : null}

{/* DETAILS */}
<div className="mt-6 text-sm text-gray-800 border border-gray-200 rounded-xl p-4 space-y-2">
<div>
<span className="text-gray-500">Issue:</span> {titleCase(item.issueType || "—")}
</div>

<div>
<span className="text-gray-500">Pickup:</span>{" "}
{item.pickupAddress || item.addressFormatted || item.addressText || item.locationText || "—"}
</div>

{item.dropoffAddress ? (
<div>
<span className="text-gray-500">Dropoff:</span> {item.dropoffAddress}
</div>
) : null}

{item.vehicle ? (
<div>
<span className="text-gray-500">Vehicle:</span> {item.vehicle}
</div>
) : null}

<div className="pt-2 border-t border-gray-100">
<div>
<span className="text-gray-500">Provider assigned:</span> {item.providerId ? "Yes" : "Not yet"}
</div>
<div className="mt-1">
<span className="text-gray-500">Assigned Technician/Driver:</span> {assignedLabel}
</div>

{/* Customer-only driver selection */}
{isCustomerOwner ? (
<div className="mt-3">
<div className="text-gray-500">Driver (optional):</div>
<select
value={driverId}
onChange={(e) => saveDriverSelection(e.target.value)}
className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
disabled={driversLoading}
>
<option value="">— No driver selected —</option>
{drivers.map((d) => (
<option key={d.id} value={d.id}>
{(d.name || "Driver")} {d.phone ? `(${d.phone})` : ""}
</option>
))}
</select>
<div className="text-xs text-gray-500 mt-1">{driversLoading ? "Loading drivers…" : `${drivers.length} driver(s) found.`}</div>
</div>
) : null}

{item.notes ? (
<div className="mt-2">
<span className="text-gray-500">Notes:</span> {item.notes}
</div>
) : null}
</div>
</div>

{/* PROVIDER: BIDDING BOX (provider-side, marketplace job not yet assigned) */}
{canShowProviderBiddingBox ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Bidding</div>
<div className="text-sm text-gray-600 mt-1">
Submit your bid for this marketplace request. Customers will see price + ETA + message.
</div>

{myBidErr ? (
<div className="mt-3 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">{myBidErr}</div>
) : null}

{myBid?.bidStatus ? (
<div className="mt-3 text-xs text-gray-600 border rounded-lg px-3 py-2 bg-gray-50">
Your bid is saved. Status: <b>{titleCase(String(myBid.bidStatus))}</b>
</div>
) : null}

<div className="mt-4 grid md:grid-cols-2 gap-2">
<input
value={bidAmount}
onChange={(e) => setBidAmount(e.target.value)}
placeholder="Price"
className="border rounded-lg px-3 py-2"
inputMode="numeric"
/>
<input
value={bidEta}
onChange={(e) => setBidEta(e.target.value)}
placeholder="ETA minutes"
className="border rounded-lg px-3 py-2"
inputMode="numeric"
/>
<textarea
value={bidMsg}
onChange={(e) => setBidMsg(e.target.value)}
placeholder="Message (optional)"
className="border rounded-lg px-3 py-2 md:col-span-2"
rows={3}
/>
</div>

<button
type="button"
onClick={saveMyBid}
disabled={savingBid}
className="mt-4 w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-60"
>
{savingBid ? "Saving…" : myBid ? "Update Bid" : "Submit Bid"}
</button>
</div>
) : null}

{/* PROVIDER ACTIONS + ASSIGN TECH */}
{canShowProviderActions ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Provider Actions</div>
<div className="text-sm text-gray-600 mt-1">Update the job status for the customer.</div>

{/* assign tech next to status updates */}
{canAssignTechnician ? (
<div className="mt-4 border border-gray-200 rounded-xl p-4">
<div className="text-sm font-semibold">Assign Technician</div>
<div className="text-xs text-gray-600 mt-1">Choose the technician/driver who will handle this job.</div>

<select
value={assignedEmployeeUid}
onChange={(e) => assignTechnician(e.target.value)}
className="mt-3 w-full border rounded-lg px-3 py-2 bg-white"
disabled={employeesLoading || assigning}
>
<option value="">— Unassigned —</option>
{employees.map((emp) => (
<option key={emp.id} value={emp.id}>
{emp.name || emp.id} {emp.role ? `(${emp.role})` : ""} {emp.phone ? `• ${emp.phone}` : ""}
</option>
))}
</select>

<div className="text-xs text-gray-500 mt-2">
{employeesLoading ? "Loading technicians…" : `${employees.length} technician(s) found.`}
</div>
</div>
) : null}

<div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
<button
type="button"
onClick={() => setProviderStatus("enroute")}
className={`border rounded-lg py-2 font-medium hover:bg-gray-50 ${
status === "enroute" ? "bg-black text-white border-black hover:bg-black" : ""
}`}
>
En route
</button>
<button
type="button"
onClick={() => setProviderStatus("on_site")}
className={`border rounded-lg py-2 font-medium hover:bg-gray-50 ${
status === "on_site" || status === "onsite" ? "bg-black text-white border-black hover:bg-black" : ""
}`}
>
On site
</button>
<button
type="button"
onClick={() => setProviderStatus("in_progress")}
className={`border rounded-lg py-2 font-medium hover:bg-gray-50 ${
status === "in_progress" ? "bg-black text-white border-black hover:bg-black" : ""
}`}
>
In progress
</button>
<button
type="button"
onClick={() => setProviderStatus("completed")}
className={`border rounded-lg py-2 font-medium hover:bg-gray-50 ${
status === "completed" ? "bg-black text-white border-black hover:bg-black" : ""
}`}
>
Completed
</button>
</div>

{!providerIsOnRequest && !isInternal ? (
<div className="mt-4 text-xs text-gray-600 border rounded-lg px-3 py-2 bg-gray-50">
This job isn’t assigned to your company yet. If it’s an open marketplace job, bid above.
</div>
) : null}
</div>
) : null}

{/* STATUS UPDATES */}
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Status Updates</div>
{timeline.length === 0 ? (
<div className="mt-2 text-sm text-gray-600">No status timestamps yet.</div>
) : (
<div className="mt-3 space-y-2">
{timeline.map((t) => (
<div key={t.label} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
<div className="font-medium">{t.label}</div>
<div className="text-gray-600">{formatWhen(t.ts)}</div>
</div>
))}
</div>
)}
</div>

{/* CUSTOMER: BIDS LIST */}
{canSeeCustomerBidList ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Bids</div>

{bidsErr ? (
<div className="mt-3 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">{bidsErr}</div>
) : null}

{bids.length === 0 ? (
<div className="mt-3 text-sm text-gray-600">No bids yet.</div>
) : (
<div className="mt-3 space-y-3">
{bids.map((b) => {
const isAccepted = item.acceptedBidId === b.id;
const busy = busyBidId === b.id;

const counterState =
b.counterStatus === "counter_accepted_by_provider"
? "✅ Counter accepted by provider"
: b.counterStatus === "counter_rejected_by_provider"
? "❌ Counter rejected by provider"
: b.counterStatus === "countered_by_customer"
? "⏳ Waiting on provider response"
: null;

return (
<div key={b.id} className="border rounded-xl p-4">
<div className="flex items-start justify-between gap-3">
<div className="w-full">
<div className="font-semibold">
Provider: <span className="font-mono text-xs">{String(b.providerId || b.id)}</span>
</div>

<div className="text-sm text-gray-700 mt-1">
Price: <b>{money(b.amount ?? b.price)}</b>
{b.etaMinutes ? (
<>
{" "}
• ETA: <b>{b.etaMinutes} min</b>
</>
) : null}
</div>

{b.message ? (
<div className="text-sm text-gray-700 mt-2">
<span className="text-gray-500">Message:</span> {b.message}
</div>
) : null}

<div className="text-xs text-gray-500 mt-2">{b.createdAt ? formatWhen(b.createdAt) : ""}</div>

{counterState ? (
<div className="mt-2 text-xs border rounded-lg px-2 py-1 inline-block">{counterState}</div>
) : null}

{counterOpenFor === b.id ? (
<div className="mt-3 border border-gray-200 rounded-xl p-3 bg-gray-50">
<div className="font-semibold text-sm">Counter Offer</div>

<div className="mt-2 grid md:grid-cols-3 gap-2">
<input
value={counterAmount}
onChange={(e) => setCounterAmount(e.target.value)}
placeholder="Counter amount"
className="border rounded-lg px-3 py-2"
inputMode="numeric"
/>
<input
value={counterEta}
onChange={(e) => setCounterEta(e.target.value)}
placeholder="ETA minutes (optional)"
className="border rounded-lg px-3 py-2"
inputMode="numeric"
/>
<input
value={counterMessage}
onChange={(e) => setCounterMessage(e.target.value)}
placeholder="Message (optional)"
className="border rounded-lg px-3 py-2 md:col-span-3"
/>
</div>

<div className="mt-3 flex flex-col md:flex-row gap-2">
<button
type="button"
disabled={busy}
onClick={() => submitCounter(b)}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
>
{busy ? "Sending…" : "Send Counter"}
</button>
<button
type="button"
onClick={() => setCounterOpenFor(null)}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
>
Cancel
</button>
</div>
</div>
) : null}
</div>

<div className="flex flex-col items-end gap-2">
{isAccepted ? <span className="text-xs px-2 py-1 rounded-full border">✅ Accepted</span> : null}

{!isAccepted && canTakeCustomerBidActions ? (
<>
<button
type="button"
disabled={busy}
onClick={() => acceptBid(b)}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
>
{busy ? "Working…" : "Accept Bid"}
</button>

<button
type="button"
disabled={busy}
onClick={() => openCounter(b)}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
>
Counter
</button>

<button
type="button"
disabled={busy}
onClick={() => rejectBid(b)}
className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
>
Reject
</button>
</>
) : null}
</div>
</div>
</div>
);
})}
</div>
)}
</div>
) : null}

{/* INTERNAL JOB CHAT */}
{canShowInternalChat ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold mb-1">Internal Job Chat</div>
<div className="text-xs text-gray-600 mb-3">Team chat (dispatch/tech/provider). Not visible to the customer.</div>

<div className="h-64 overflow-y-auto border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
{intMessages.length === 0 ? (
<div className="text-sm text-gray-500">No messages yet.</div>
) : (
intMessages.map((m) => (
<div
key={m.id}
className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
m.senderUid === uid ? "ml-auto bg-black text-white" : "mr-auto bg-white border"
}`}
>
<div className="text-[11px] opacity-80 mb-1">
{m.senderUid === uid ? "You" : m.senderName || "User"} {m.createdAt ? `• ${formatWhen(m.createdAt)}` : ""}
</div>
<div className="whitespace-pre-wrap">{m.text}</div>
</div>
))
)}
<div ref={intBottomRef} />
</div>

<div className="mt-3 flex gap-2">
<input
value={intText}
onChange={(e) => setIntText(e.target.value)}
onKeyDown={(e) => e.key === "Enter" && sendInternalChat()}
placeholder="Type a message…"
className="flex-1 border rounded-lg px-3 py-2"
disabled={sendingInt}
/>
<button
type="button"
onClick={sendInternalChat}
disabled={sendingInt}
className="bg-black text-white px-4 rounded-lg disabled:opacity-60"
>
{sendingInt ? "Sending…" : "Send"}
</button>
</div>
</div>
) : null}

{/* EXTERNAL JOB CHAT */}
{canShowExternalChat ? (
<div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold mb-3">Job Chat</div>

<div className="h-64 overflow-y-auto border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
{extMessages.length === 0 ? (
<div className="text-sm text-gray-500">No messages yet.</div>
) : (
extMessages.map((m) => (
<div
key={m.id}
className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
m.senderUid === uid ? "ml-auto bg-black text-white" : "mr-auto bg-white border"
}`}
>
<div className="text-[11px] opacity-80 mb-1">
{m.senderUid === uid ? "You" : m.senderName || "User"} {m.createdAt ? `• ${formatWhen(m.createdAt)}` : ""}
</div>
<div className="whitespace-pre-wrap">{m.text}</div>
</div>
))
)}
<div ref={extBottomRef} />
</div>

<div className="mt-3 flex gap-2">
<input
value={extText}
onChange={(e) => setExtText(e.target.value)}
onKeyDown={(e) => e.key === "Enter" && sendExternalChat()}
placeholder="Type a message…"
className="flex-1 border rounded-lg px-3 py-2"
disabled={sendingExt}
/>
<button
type="button"
onClick={sendExternalChat}
disabled={sendingExt}
className="bg-black text-white px-4 rounded-lg disabled:opacity-60"
>
{sendingExt ? "Sending…" : "Send"}
</button>
</div>
</div>
) : null}

{/* ACTIONS */}
<div className="mt-6 space-y-3">
<button
type="button"
onClick={() => router.push(backPath)}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Back
</button>

<button
type="button"
onClick={() => router.push("/providers")}
className="w-full border border-gray-300 rounded-lg py-3 font-medium hover:bg-gray-50"
>
Provider Directory
</button>
</div>
</div>
</main>
);
}

