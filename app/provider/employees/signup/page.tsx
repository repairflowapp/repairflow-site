"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function EmployeeSignupPage() {
const router = useRouter();

const [email, setEmail] = useState("");
const [pass, setPass] = useState("");
const [invite, setInvite] = useState("");

const [loading, setLoading] = useState(false);
const [err, setErr] = useState<string | null>(null);

async function signupAndLink() {
setErr(null);
const code = invite.trim().toUpperCase();
if (!code) return setErr("Enter your invite code.");
if (!email.trim() || !pass.trim()) return setErr("Enter email + password.");

setLoading(true);
try {
// 1) Create Auth user
const auth = getAuth();
const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass.trim());
const employeeUid = cred.user.uid;

// 2) Load invite doc
const invRef = doc(db, "employeeInvites", code);
const invSnap = await getDoc(invRef);
if (!invSnap.exists()) throw new Error("Invalid invite code.");

const inv = invSnap.data() as any;
if (inv.claimedByUid) throw new Error("Invite already used.");

const providerId = inv.providerId as string;
if (!providerId) throw new Error("Invite missing providerId.");

// 3) Claim invite
await updateDoc(invRef, {
claimedByUid: employeeUid,
claimedAt: serverTimestamp(),
});

// 4) Create employee record under provider
const empRef = doc(db, "providers", providerId, "employees", employeeUid);
await setDoc(empRef, {
userId: employeeUid,
providerId,
role: inv.role || "tech",
name: inv.name || null,
phone: inv.phone || null,
active: true,
createdAt: serverTimestamp(),
linkedFromInvite: code,
});

router.push("/employee/dashboard");
} catch (e: any) {
setErr(e?.message || "Failed to sign up.");
} finally {
setLoading(false);
}
}

return (
<div style={{ padding: 16, maxWidth: 520 }}>
<h1 style={{ fontWeight: 900 }}>Employee Signup</h1>
<p style={{ opacity: 0.75 }}>Create your employee login and enter the invite code your provider gave you.</p>

{err ? <div style={{ color: "red", marginBottom: 10 }}>{err}</div> : null}

<label style={{ fontSize: 12, fontWeight: 800 }}>Invite Code</label>
<input
value={invite}
onChange={(e) => setInvite(e.target.value)}
placeholder="AB12CD"
style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }}
/>

<label style={{ fontSize: 12, fontWeight: 800 }}>Email</label>
<input
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder="employee@email.com"
style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }}
/>

<label style={{ fontSize: 12, fontWeight: 800 }}>Password</label>
<input
type="password"
value={pass}
onChange={(e) => setPass(e.target.value)}
placeholder="••••••••"
style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginBottom: 10 }}
/>

<button
onClick={signupAndLink}
disabled={loading}
style={{
width: "100%",
padding: 12,
borderRadius: 10,
border: "none",
background: "black",
color: "white",
fontWeight: 900,
cursor: loading ? "not-allowed" : "pointer",
opacity: loading ? 0.6 : 1,
}}
>
{loading ? "Creating…" : "Create Employee Account"}
</button>

<div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
Already have an account? Go to <b>/employee/login</b>
</div>
</div>
);
}

