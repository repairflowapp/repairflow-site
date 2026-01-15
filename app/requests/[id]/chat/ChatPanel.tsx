"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
addDoc,
collection,
onSnapshot,
orderBy,
query,
serverTimestamp,
limit,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type ChatMsg = {
id: string;
text?: string;
senderUid?: string;
senderName?: string;
createdAt?: any;
};

function formatWhen(ts: any) {
if (!ts?.toDate) return "";
try {
return ts.toDate().toLocaleString();
} catch {
return "";
}
}

export default function ChatPanel({ requestId }: { requestId: string }) {
const [msgs, setMsgs] = useState<ChatMsg[]>([]);
const [text, setText] = useState("");
const [sending, setSending] = useState(false);
const bottomRef = useRef<HTMLDivElement | null>(null);

// ✅ Use chatThreads/{threadId}/messages
// We'll use threadId = requestId so it's always consistent.
const threadId = useMemo(() => requestId, [requestId]);

useEffect(() => {
if (!threadId) return;

const qRef = query(
collection(db, "roadsideRequests", requestId, "chatThreads", threadId, "messages"),
orderBy("createdAt", "asc"),
limit(200)
);

const unsub = onSnapshot(qRef, (snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMsg[];
setMsgs(rows);

// auto-scroll
setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
});

return () => unsub();
}, [requestId, threadId]);

async function send() {
const t = text.trim();
if (!t) return;

const user = auth.currentUser;
if (!user) return alert("You must be signed in.");

setSending(true);
try {
await addDoc(
collection(db, "roadsideRequests", requestId, "chatThreads", threadId, "messages"),
{
text: t,
senderUid: user.uid,
senderName: user.displayName ?? user.email ?? "User",
createdAt: serverTimestamp(),
}
);
setText("");
} catch (e: any) {
alert(e?.message ?? "Failed to send message.");
} finally {
setSending(false);
}
}

return (
<div className="border border-gray-200 rounded-2xl p-4">
<div className="font-semibold text-gray-900">Chat</div>
<div className="text-xs text-gray-500 mt-1">
Messages are stored under: roadsideRequests/{requestId}/chatThreads/{threadId}/messages
</div>

<div className="mt-3 h-64 overflow-auto border border-gray-200 rounded-xl p-3 bg-white">
{msgs.length === 0 ? (
<div className="text-sm text-gray-600">No messages yet.</div>
) : (
<div className="space-y-3">
{msgs.map((m) => (
<div key={m.id} className="text-sm">
<div className="text-xs text-gray-500">
<b className="text-gray-700">{m.senderName ?? "User"}</b>{" "}
<span className="opacity-70">• {formatWhen(m.createdAt)}</span>
</div>
<div className="mt-1 text-gray-900 whitespace-pre-wrap">{m.text}</div>
</div>
))}
<div ref={bottomRef} />
</div>
)}
</div>

<div className="mt-3 flex gap-2">
<input
className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
placeholder="Type a message…"
value={text}
onChange={(e) => setText(e.target.value)}
disabled={sending}
onKeyDown={(e) => {
if (e.key === "Enter") send();
}}
/>
<button
type="button"
onClick={send}
disabled={sending}
className="bg-black text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
>
{sending ? "Sending…" : "Send"}
</button>
</div>
</div>
);
}

