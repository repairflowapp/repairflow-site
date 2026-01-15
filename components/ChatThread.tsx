"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
doc,
getDoc,
limit,
onSnapshot,
orderBy,
query,
serverTimestamp,
setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type ChatThreadProps = {
requestId: string;
role: "customer" | "provider" | "admin" | string;
title?: string;
};

type ThreadDoc = {
customerUid?: string | null;
createdAt?: any;
updatedAt?: any;
};

type MsgDoc = {
uid: string;
role?: string;
text: string;
createdAt?: any;
};

function fmtTime(ts: any) {
if (!ts?.toDate) return "";
try {
return ts.toDate().toLocaleString();
} catch {
return "";
}
}

export default function ChatThread({ requestId, role, title = "Questions before bidding" }: ChatThreadProps) {
const [uid, setUid] = useState<string | null>(null);
const [authReady, setAuthReady] = useState(false);

const [customerUid, setCustomerUid] = useState<string | null>(null);

const [thread, setThread] = useState<ThreadDoc | null>(null);
const [messages, setMessages] = useState<Array<{ id: string } & MsgDoc>>([]);

const [text, setText] = useState("");
const [sending, setSending] = useState(false);
const [error, setError] = useState<string | null>(null);

const bottomRef = useRef<HTMLDivElement | null>(null);

const threadRef = useMemo(() => {
return doc(db, "roadsideRequests", requestId, "chatThreads", "preBid");
}, [requestId]);

const msgsCol = useMemo(() => {
return collection(db, "roadsideRequests", requestId, "chatThreads", "preBid", "messages");
}, [requestId]);

// Auth
useEffect(() => {
const unsub = onAuthStateChanged(auth, (user) => {
setUid(user?.uid ?? null);
setAuthReady(true);
});
return () => unsub();
}, []);

// Load request -> get customerUid (and keep in state)
useEffect(() => {
let cancelled = false;

async function loadRequest() {
if (!requestId) return;
try {
const reqSnap = await getDoc(doc(db, "roadsideRequests", requestId));
if (!reqSnap.exists()) {
if (!cancelled) setError("Request not found.");
return;
}
const data = reqSnap.data() as any;
const cu: string | null =
(data?.customerUid as string) ||
(data?.createdByUid as string) ||
(data?.customerAssignedToUid as string) ||
null;

if (!cancelled) setCustomerUid(cu);
} catch (e: any) {
if (!cancelled) setError(e?.message ?? "Failed to load request.");
}
}

loadRequest();
return () => {
cancelled = true;
};
}, [requestId]);

// Auto-create thread doc (CUSTOMER ONLY)
useEffect(() => {
let cancelled = false;

async function ensureThread() {
if (!authReady || !uid || !requestId) return;
if (!customerUid) return;

// Only the customer creates the thread doc to avoid rules issues
if (uid !== customerUid) return;

try {
const snap = await getDoc(threadRef);
if (!snap.exists()) {
await setDoc(
threadRef,
{
customerUid,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);
} else {
// ensure customerUid is present
const d = snap.data() as any;
if (!d?.customerUid) {
await setDoc(threadRef, { customerUid, updatedAt: serverTimestamp() }, { merge: true });
}
}
} catch (e: any) {
if (!cancelled) setError(e?.message ?? "Failed to create chat thread.");
}
}

ensureThread();
return () => {
cancelled = true;
};
}, [authReady, uid, requestId, customerUid, threadRef]);

// Subscribe thread + messages
useEffect(() => {
if (!requestId) return;

setError(null);

const unsubThread = onSnapshot(
threadRef,
(snap) => {
if (!snap.exists()) {
setThread(null);
return;
}
setThread(snap.data() as ThreadDoc);
},
(e) => setError(e?.message ?? "Failed to load chat thread.")
);

const qRef = query(msgsCol, orderBy("createdAt", "asc"), limit(200));
const unsubMsgs = onSnapshot(
qRef,
(snap) => {
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MsgDoc) }));
setMessages(list);
setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
},
(e) => setError(e?.message ?? "Failed to load messages.")
);

return () => {
unsubThread();
unsubMsgs();
};
}, [requestId, threadRef, msgsCol]);

async function send() {
if (!authReady) return;
if (!uid) {
setError("You must be signed in to chat.");
return;
}
const trimmed = text.trim();
if (!trimmed) return;

setSending(true);
setError(null);

try {
// If customer and thread doc doesn't exist yet, create it
if (customerUid && uid === customerUid) {
const snap = await getDoc(threadRef);
if (!snap.exists()) {
await setDoc(
threadRef,
{ customerUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
{ merge: true }
);
}
}

await addDoc(msgsCol, {
uid,
role,
text: trimmed,
createdAt: serverTimestamp(),
});

// touch updatedAt (best effort)
try {
if (customerUid && uid === customerUid) {
await setDoc(threadRef, { updatedAt: serverTimestamp() }, { merge: true });
}
} catch {}

setText("");
setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
} catch (e: any) {
setError(e?.message ?? "Failed to send.");
} finally {
setSending(false);
}
}

return (
<section className="border border-gray-200 rounded-2xl p-4">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-lg font-semibold text-gray-900">{title}</div>
<div className="text-xs text-gray-500">This chat is shared with providers before and during bidding.</div>
</div>
<div className="text-xs text-gray-500">
{uid ? <span className="font-mono">uid: {uid.slice(0, 6)}…</span> : <span>Signed out</span>}
</div>
</div>

{error ? (
<div className="mt-3 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">{error}</div>
) : null}

{/* Helpful hint */}
{!thread ? (
<div className="mt-3 text-xs text-gray-500">
Thread: <span className="font-mono">chatThreads/preBid</span>{" "}
{customerUid ? "(customerUid detected)" : "(loading customerUid…)"}
</div>
) : null}

<div className="mt-4 border border-gray-200 rounded-xl p-3 h-64 overflow-y-auto bg-white">
{messages.length === 0 ? (
<div className="text-sm text-gray-500">No messages yet.</div>
) : (
<div className="space-y-2">
{messages.map((m) => {
const mine = m.uid === uid;
return (
<div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
<div
className={`max-w-[85%] rounded-2xl px-3 py-2 border text-sm ${
mine ? "bg-black text-white border-black" : "bg-gray-50 text-gray-900 border-gray-200"
}`}
>
<div className="whitespace-pre-wrap">{m.text}</div>
<div className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-gray-500"}`}>
{m.role ? `${m.role} • ` : ""}
{fmtTime(m.createdAt)}
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
className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
placeholder="Ask a question before bidding…"
value={text}
onChange={(e) => setText(e.target.value)}
onKeyDown={(e) => {
if (e.key === "Enter") send();
}}
disabled={sending}
/>
<button
onClick={send}
disabled={sending || !text.trim()}
className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
>
{sending ? "Sending…" : "Send"}
</button>
</div>
</section>
);
}