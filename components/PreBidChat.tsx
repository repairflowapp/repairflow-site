"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Msg = {
id: string;
text?: string;
senderUid?: string;
senderRole?: string;
createdAt?: any;
};

export default function PreBidChat({
requestId,
roleLabel = "provider",
title = "Pre-Bid Chat",
}: {
requestId: string;
roleLabel?: string;
title?: string;
}) {
const [uid, setUid] = useState<string | null>(null);
const [text, setText] = useState("");
const [items, setItems] = useState<Msg[]>([]);
const [err, setErr] = useState<string | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
return () => unsub();
}, []);

const qRef = useMemo(() => {
if (!requestId) return null;

// ✅ IMPORTANT: nested under the request (matches your rules)
const msgsRef = collection(db, "roadsideRequests", requestId, "preBidChat");
return query(msgsRef, orderBy("createdAt", "asc"));
}, [requestId]);

useEffect(() => {
if (!qRef) return;

setErr(null);
const unsub = onSnapshot(
qRef,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Msg[];
setItems(rows);
},
(e) => setErr(e?.message || "Missing or insufficient permissions.")
);

return () => unsub();
}, [qRef]);

async function send() {
if (!uid) return setErr("You must be signed in.");
const t = text.trim();
if (!t) return;

setErr(null);
setText("");

// ✅ IMPORTANT: nested under the request (matches your rules)
await addDoc(collection(db, "roadsideRequests", requestId, "preBidChat"), {
text: t,
senderUid: uid,
senderRole: roleLabel,
createdAt: serverTimestamp(),
});
}

return (
<div className="border border-gray-200 rounded-2xl p-4">
<div className="font-semibold text-gray-900">{title}</div>
<div className="text-xs text-gray-500 mt-1">Shared with providers before and during bidding.</div>

{err ? (
<div className="mt-3 border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">{err}</div>
) : null}

<div className="mt-3 space-y-2">
{items.length === 0 ? (
<div className="text-sm text-gray-500">No messages yet.</div>
) : (
items.map((m) => (
<div key={m.id} className="text-sm border border-gray-200 rounded-lg p-2">
<div className="text-xs text-gray-500">
{m.senderRole || "user"} • {m.senderUid?.slice(0, 6) || "—"}
</div>
<div className="mt-1">{m.text}</div>
</div>
))
)}
</div>

<div className="mt-3 flex gap-2">
<input
className="flex-1 border rounded-lg px-3 py-2"
placeholder="Ask a question before bidding…"
value={text}
onChange={(e) => setText(e.target.value)}
/>
<button className="bg-black text-white rounded-lg px-4 py-2 font-medium" onClick={send}>
Send
</button>
</div>
</div>
);
}

