"use client";

import { useState } from "react";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function EmployeeLoginPage() {
const router = useRouter();
const [email, setEmail] = useState("");
const [pass, setPass] = useState("");
const [loading, setLoading] = useState(false);
const [err, setErr] = useState<string | null>(null);

async function login() {
setErr(null);
if (!email.trim() || !pass.trim()) return setErr("Enter email + password.");

setLoading(true);
try {
await signInWithEmailAndPassword(getAuth(), email.trim(), pass.trim());
router.push("/employee/dashboard");
} catch (e: any) {
setErr(e?.message || "Login failed.");
} finally {
setLoading(false);
}
}

return (
<div style={{ padding: 16, maxWidth: 520 }}>
<h1 style={{ fontWeight: 900 }}>Employee Login</h1>

{err ? <div style={{ color: "red", marginBottom: 10 }}>{err}</div> : null}

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
onClick={login}
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
{loading ? "Signing in…" : "Sign In"}
</button>
</div>
);
}
