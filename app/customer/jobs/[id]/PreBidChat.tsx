"use client";

import { useEffect, useState } from "react";
import {
addDoc,
collection,
onSnapshot,
orderBy,
query,
serverTimestamp,
} from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";

type ChatMsg = {
id: string;
senderRole: "customer" | "provider";
senderId: string;
text: string;
createdAt?: any;
};

export default function PreBidChat({
jobId,
role = "customer",
}: {
jobId: string;
role?: "customer";
}) {
const [messages, setMessages] = useState<ChatMsg[]>([]);
const [text, setText] = useState("");

useEffect(() => {
const ref = collection(db, "jobs", jobId, "chat");
const q = query(ref, orderBy("createdAt", "asc"));
return onSnapshot(q, (snap) => {
setMessages(
snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMsg[]
);
});
}, [jobId]);

async function send() {
const trimmed = text.trim();
if (!trimmed) return;

const uid = auth?.currentUser?.uid || `${role}-demo`;

await addDoc(collection(db, "jobs", jobId, "chat"), {
senderRole: role,
senderId: uid,
text: trimmed,
createdAt: serverTimestamp(),
});

setText("");
}

return (
<div style={{ marginTop: 24, border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
<h3 style={{ marginBottom: 12 }}>Pre-bid Chat (Job #{jobId})</h3>

<div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
{messages.length === 0 ? (
<div style={{ opacity: 0.8 }}>No messages yet.</div>
) : (
messages.map((m) => (
<div
key={m.id}
style={{
padding: 10,
borderRadius: 10,
border: "1px solid #eee",
background: m.senderRole === "customer" ? "#fafafa" : "#fff",
}}
>
<div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
{m.senderRole === "provider" ? "Provider" : "Customer"}
</div>
<div>{m.text}</div>
</div>
))
)}
</div>

<div style={{ display: "flex", gap: 10 }}>
<input
value={text}
onChange={(e) => setText(e.target.value)}
placeholder="Message the provider before accepting a bid..."
style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
onKeyDown={(e) => {
if (e.key === "Enter") send();
}}
/>
<button
onClick={send}
style={{
padding: "10px 16px",
borderRadius: 10,
border: "1px solid #111",
background: "#111",
color: "#fff",
cursor: "pointer",
}}
>
Send
</button>
</div>
</div>
);
}
