"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
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

type Msg = {
id: string;
senderUid: string;
text?: string;
createdAt?: any;
direction?: "inbound" | "outbound";
channel?: string;
};

function formatTime(ts: any) {
try {
if (!ts) return "";
const d = ts?.toDate ? ts.toDate() : new Date(ts);
return d.toLocaleString();
} catch {
return "";
}
}

export default function DispatchChat({
providerUid,
jobId,
room = "internal",
}: {
providerUid: string;
jobId: string;
room?: "internal" | "customer";
}) {
const [uid, setUid] = useState<string | null>(null);

useEffect(() => {
return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
}, []);

const [msgs, setMsgs] = useState<Msg[]>([]);
const [loading, setLoading] = useState(true);
const [err, setErr] = useState<string | null>(null);
const [text, setText] = useState("");
const [sending, setSending] = useState(false);

const endRef = useRef<HTMLDivElement | null>(null);
useEffect(() => {
endRef.current?.scrollIntoView({ behavior: "smooth" });
}, [msgs]);

const title = useMemo(() => {
return room === "customer" ? "Customer SMS Chat" : "Internal Dispatch Chat";
}, [room]);

const subtitle = useMemo(() => {
if (room === "customer") {
return "Messages sent here should go to the customer via SMS (and replies come back here).";
}
return "This is internal staff chat (provider/dispatcher ↔ technician/employee). Customers do not see this.";
}, [room]);

useEffect(() => {
setErr(null);
setLoading(true);

if (!providerUid || !jobId) {
setLoading(false);
setErr("Missing providerUid/jobId.");
return;
}

const colRef = collection(
db,
"providers",
providerUid,
"dispatchJobs",
jobId,
"chats",
room,
"messages"
);

const q = query(colRef, orderBy("createdAt", "asc"), limit(200));

const unsub = onSnapshot(
q,
(snap) => {
setMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Msg[]);
setLoading(false);
},
(e) => {
setErr(e?.message || "Failed to load chat (permissions).");
setLoading(false);
}
);

return () => unsub();
}, [providerUid, jobId, room]);

async function send() {
setErr(null);
if (!uid) return setErr("Sign in to chat.");

const t = text.trim();
if (!t) return;

setSending(true);
try {
const colRef = collection(
db,
"providers",
providerUid,
"dispatchJobs",
jobId,
"chats",
room,
"messages"
);

// NOTE: For customer room, Twilio function will read this message and send SMS
await addDoc(colRef, {
senderUid: uid,
text: t,
createdAt: serverTimestamp(),
direction: "outbound",
channel: room === "customer" ? "sms" : "app",
});

setText("");
} catch (e: any) {
setErr(e?.message ?? "Failed to send message.");
} finally {
setSending(false);
}
}

return (
<section className="border rounded-2xl p-6">
<div className="text-lg font-semibold">{title}</div>
<div className="text-xs text-gray-600 mt-1">{subtitle}</div>

{err ? (
<div className="mt-3 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {err}
</div>
) : null}

<div className="mt-4 border rounded-xl p-3 h-72 overflow-auto bg-gray-50">
{loading ? (
<div className="text-sm text-gray-600">Loading messages…</div>
) : msgs.length === 0 ? (
<div className="text-sm text-gray-600">No messages yet.</div>
) : (
msgs.map((m) => {
const mine = uid && m.senderUid === uid;
const isCustomerSms = m.senderUid === "customer_sms" || m.direction === "inbound";

return (
<div
key={m.id}
className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}
>
<div className="max-w-[85%] bg-white border rounded-xl p-3">
<div className="text-xs text-gray-500 mb-1">
{mine ? "You" : isCustomerSms ? "Customer (SMS)" : "User"} •{" "}
{formatTime(m.createdAt)}
</div>
<div className="text-sm whitespace-pre-wrap">{m.text || ""}</div>
</div>
</div>
);
})
)}
<div ref={endRef} />
</div>

<div className="mt-3 grid grid-cols-1 gap-2">
<textarea
className="border rounded-lg p-2 w-full"
rows={3}
value={text}
onChange={(e) => setText(e.target.value)}
placeholder={uid ? "Message…" : "Sign in to chat…"}
/>
<button
onClick={send}
disabled={sending || !uid}
className="bg-black text-white rounded-lg py-2 font-medium disabled:opacity-50"
>
{sending ? "Sending…" : room === "customer" ? "Send SMS" : "Send"}
</button>
</div>
</section>
);
}
