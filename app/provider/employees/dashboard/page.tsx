"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut, type User } from "firebase/auth";

export default function EmployeeDashboard() {
const [user, setUser] = useState<User | null>(null);

useEffect(() => {
return onAuthStateChanged(getAuth(), setUser);
}, []);

return (
<div style={{ padding: 16 }}>
<h1 style={{ fontWeight: 900 }}>Employee Dashboard</h1>

{!user ? (
<p style={{ color: "#b00" }}>Not signed in.</p>
) : (
<>
<p>Signed in as: <b>{user.email}</b></p>
<p style={{ fontFamily: "monospace" }}>uid: {user.uid}</p>

<button
onClick={() => signOut(getAuth())}
style={{
padding: "10px 14px",
borderRadius: 10,
border: "1px solid #ccc",
background: "white",
fontWeight: 900,
cursor: "pointer",
}}
>
Sign Out
</button>
</>
)}
</div>
);
}

