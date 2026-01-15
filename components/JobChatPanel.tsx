"use client";

import { useEffect, useRef, useState } from "react";
import {
addDoc,
collection,
onSnapshot,
orderBy,
query,
serverTimestamp,
doc,
getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Message = {
id: string;
text: string;
senderUid: string;
createdAt?: any;
};

export default function JobChatPanel({
jobId,
currentUid,
mode,
}: {
jobId: string;
currentUid: string;
mode: "customer" | "provider";
}) {
const [messages, setMessages] = useState<Message[]>([]);
const [text, setText] = useState("");
const [sending, setSending] = useState(false);

const [canChat, setCanChat] = useState<boolean>(false);
const [canChatReason, setCanChatReason] = useState<string>("Checking permissions…");
const [error, setError] = useState<string | null>(null);

const bottomRef = useRef<HTMLDivElement | null>(null);

// Determine chat permission (matches your rules):
// - customer: can chat if they are customer (we assume they are already on allowed page)
// - provider: can chat if providerId==uid OR bid exists (/bids/{uid})
useEffect(() => {
let alive = true;

async function check() {
setError(null);

if (!jobId || !currentUid) {
setCanChat(false);
setCanChatReason("Missing job or user.");
return;
}

try {
const jobSnap = await getDoc(doc(db, "roadsideRequests", jobId));
if (!jobSnap.exists()) {
setCanChat(false);
setCanChatReason("Job not found.");
return;
}

const job = jobSnap.data() as any;

if (mode === "customer") {
// customer pages should already be gated, but keep safe
const ok =
(job.createdByUid && job.createdByUid === currentUid) ||
(job.customerUid && job.customerUid === currentUid);
setCanChat(!!ok);
setCanChatReason(ok ? "" : "You are not allowed to chat on this job.");
return;
}

// provider
if (job.providerId && job.providerId === currentUid) {
setCanChat(true);
setCanChatReason("");
return;
}

// If not assigned, provider must have a bid to chat (per your rules)
const bidSnap = await getDoc(doc(db, "roadsideRequests", jobId, "bids", currentUid));
if (bidSnap.exists()) {
setCanChat(true);
setCanChatReason("");
return;
}

setCanChat(false);
setCanChatReason("Chat is unlocked after you submit a bid (or once assigned).");
} catch (e: any) {
setCanChat(false);
setCanChatReason("Unable to check chat permission.");
}
}

check();
return () => {
alive = false;
};
}, [jobId, currentUid, mode]);

// Messages listener (only if allowed; otherwise your rules will permission-deny)
useEffect(() => {
if (!jobId || !canChat) return;

const qRef = query(
collection(db, "roadsideRequests", jobId, "chatThreads", "main", "messages"),
orderBy("createdAt", "asc")
);

const unsub = onSnapshot(
qRef,
(snap) => {
const rows = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
})) as Message[];
setMessages(rows);
setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
},
(e: any) => {
setError(e?.message || "Failed to load chat.");
}
);

return () => unsub();
}, [jobId, canChat]);

async function send() {
const trimmed = text.trim();
if (!trimmed || !jobId || !currentUid) return;

if (!canChat) {
setError(canChatReason || "Chat is locked.");
return;
}

setSending(true);
setError(null);

try {
await addDoc(
collection(db, "roadsideRequests", jobId, "chatThreads", "main", "messages"),
{
text: trimmed,
senderUid: currentUid,
createdAt: serverTimestamp(),
}
);
setText("");
} catch (e: any) {
// This is where “Send does nothing” USED to happen.
// Now you get a real error message if rules deny.
setError(e?.message || "Failed to send message.");
} finally {
setSending(false);
}
}

return (
<div className="border rounded-2xl p-6 bg-white">
<div className="text-lg font-semibold">Job Chat</div>

{!canChat ? (
<div className="mt-2 text-sm text-gray-600">{canChatReason}</div>
) : null}

{error ? (
<div className="mt-3 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">
{error}
</div>
) : null}

<div className="mt-4 h-64 overflow-y-auto border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
{messages.length === 0 ? (
<div className="text-sm text-gray-500">No messages yet.</div>
) : (
messages.map((m) => (
<div
key={m.id}
className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
m.senderUid === currentUid
? "ml-auto bg-black text-white"
: "mr-auto bg-white border"
}`}
>
{m.text}
</div>
))
)}
<div ref={bottomRef} />
</div>

<div className="mt-3 flex gap-2">
<input
value={text}
onChange={(e) => setText(e.target.value)}
onKeyDown={(e) => e.key === "Enter" && send()}
placeholder={canChat ? "Type a message…" : "Chat locked"}
className="flex-1 border rounded-lg px-3 py-2"
disabled={!canChat || sending}
/>
<button
type="button"
onClick={send}
className="bg-black text-white px-4 rounded-lg"
disabled={!canChat || sending}
>
{sending ? "Sending…" : "Send"}
</button>
</div>
</div>
);
}

