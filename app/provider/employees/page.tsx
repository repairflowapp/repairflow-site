"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import {
collection,
deleteDoc,
doc,
onSnapshot,
orderBy,
query,
serverTimestamp,
setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Invite = {
id: string; // code
providerId: string;
role?: string | null;
name?: string | null;
phone?: string | null;
active?: boolean;
createdAt?: any;
claimedByUid?: string | null;
claimedAt?: any;
};

function randomCode(len = 6) {
const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let out = "";
for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
return out;
}

export default function ProviderEmployeesPage() {
const [user, setUser] = useState<User | null>(null);
const providerUid = user?.uid ?? null;

useEffect(() => {
const auth = getAuth();
return onAuthStateChanged(auth, setUser);
}, []);

const [invites, setInvites] = useState<Invite[]>([]);
const [loading, setLoading] = useState(true);

const [role, setRole] = useState<"tech" | "dispatcher">("tech");
const [name, setName] = useState("");
const [phone, setPhone] = useState("");

const [err, setErr] = useState<string | null>(null);
const [msg, setMsg] = useState<string | null>(null);

useEffect(() => {
if (!providerUid) return;

const q = query(collection(db, "employeeInvites"), orderBy("createdAt", "desc"));
const unsub = onSnapshot(
q,
(snap) => {
const rows = snap.docs
.map((d) => ({ id: d.id, ...(d.data() as any) }))
.filter((x: Invite) => x.providerId === providerUid);
setInvites(rows as Invite[]);
setLoading(false);
},
(e) => {
setErr(e.message);
setLoading(false);
}
);

return () => unsub();
}, [providerUid]);

async function createInvite() {
setErr(null);
setMsg(null);

if (!providerUid) return setErr("You must be signed in as provider.");

const code = randomCode(6);
try {
await setDoc(doc(db, "employeeInvites", code), {
providerId: providerUid,
role,
name: name.trim() || null,
phone: phone.trim() || null,
active: true,
createdAt: serverTimestamp(),
claimedByUid: null,
claimedAt: null,
});

setMsg(`Invite created: ${code}`);
setName("");
setPhone("");
} catch (e: any) {
setErr(e?.message || "Failed to create invite.");
}
}

async function deleteInvite(code: string) {
setErr(null);
setMsg(null);
if (!providerUid) return;

try {
await deleteDoc(doc(db, "employeeInvites", code));
setMsg(`Deleted invite ${code}`);
} catch (e: any) {
setErr(e?.message || "Failed to delete invite.");
}
}

return (
<div style={{ padding: 16, maxWidth: 900 }}>
<h1 style={{ fontWeight: 900 }}>Employees</h1>

{!providerUid ? <p style={{ color: "#b00" }}>Sign in as provider to manage employees.</p> : null}
{err ? <div style={{ color: "red", marginBottom: 10 }}>{err}</div> : null}
{msg ? <div style={{ color: "green", marginBottom: 10 }}>{msg}</div> : null}

<div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
<div style={{ fontWeight: 900, marginBottom: 10 }}>Create Invite Code</div>

<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
<div>
<label style={{ fontSize: 12, fontWeight: 700 }}>Role</label>
<select
value={role}
onChange={(e) => setRole(e.target.value as any)}
style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
>
<option value="tech">Tech</option>
<option value="dispatcher">Dispatcher</option>
</select>
</div>

<div>
<label style={{ fontSize: 12, fontWeight: 700 }}>Phone (optional)</label>
<input
value={phone}
onChange={(e) => setPhone(e.target.value)}
placeholder="+15555555555"
style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
/>
</div>

<div style={{ gridColumn: "1 / -1" }}>
<label style={{ fontSize: 12, fontWeight: 700 }}>Name (optional)</label>
<input
value={name}
onChange={(e) => setName(e.target.value)}
placeholder="Mike"
style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
/>
</div>
</div>

<button
onClick={createInvite}
style={{
marginTop: 10,
width: "100%",
padding: 12,
borderRadius: 10,
border: "none",
background: "black",
color: "white",
fontWeight: 900,
cursor: "pointer",
}}
>
Create Invite Code
</button>

<div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
Share the invite code with the employee. They will sign up at <b>/employee/signup</b>.
</div>
</div>

<h2 style={{ fontWeight: 900 }}>Invites</h2>

{loading ? <p>Loading…</p> : null}
{invites.length === 0 && !loading ? <p>No invites yet.</p> : null}

{invites.map((inv) => (
<div
key={inv.id}
style={{
border: "1px solid #eee",
borderRadius: 12,
padding: 12,
marginBottom: 10,
display: "flex",
justifyContent: "space-between",
gap: 12,
}}
>
<div>
<div style={{ fontWeight: 900 }}>
Code: <span style={{ fontFamily: "monospace" }}>{inv.id}</span>
</div>
<div style={{ fontSize: 13, opacity: 0.8 }}>
Role: <b>{inv.role || "—"}</b>
{inv.name ? ` • ${inv.name}` : ""}
{inv.phone ? ` • ${inv.phone}` : ""}
</div>
<div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
{inv.claimedByUid ? (
<>✅ Claimed by: <span style={{ fontFamily: "monospace" }}>{inv.claimedByUid}</span></>
) : (
<>⏳ Not claimed yet</>
)}
</div>
</div>

{!inv.claimedByUid ? (
<button
onClick={() => deleteInvite(inv.id)}
style={{
padding: "10px 12px",
borderRadius: 10,
border: "1px solid #ccc",
background: "white",
cursor: "pointer",
fontWeight: 800,
height: 42,
}}
>
Delete
</button>
) : null}
</div>
))}
</div>
);
}
