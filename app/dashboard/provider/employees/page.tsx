"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
collection,
doc,
onSnapshot,
orderBy,
query,
serverTimestamp,
setDoc,
updateDoc,
where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type EmployeeRole = "tech" | "dispatcher";

type EmployeeRequest = {
id: string; // employeeUid (we used that as doc id)
employeeUid: string;
providerUid: string;
email: string;
name: string;
phone: string;
role: EmployeeRole;
status: "pending" | "approved" | "rejected";
createdAt?: any;
updatedAt?: any;
};

type Employee = {
id: string; // employeeUid
userId: string;
name?: string | null;
phone?: string | null;
role?: EmployeeRole | string | null;
active?: boolean;
createdAt?: any;
approvedAt?: any;
};

export default function ProviderEmployeesPage() {
const router = useRouter();

const [user, setUser] = useState<User | null>(null);
const providerUid = user?.uid || null;

const [loadingAuth, setLoadingAuth] = useState(true);

// Requests
const [pending, setPending] = useState<EmployeeRequest[]>([]);
const [loadingPending, setLoadingPending] = useState(true);

// Employees
const [employees, setEmployees] = useState<Employee[]>([]);
const [loadingEmployees, setLoadingEmployees] = useState(true);

const [actionMsg, setActionMsg] = useState<string | null>(null);
const [actionErr, setActionErr] = useState<string | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => {
setUser(u);
setLoadingAuth(false);
if (!u) router.replace("/auth/sign-in");
});
return () => unsub();
}, [router]);

const pendingCol = useMemo(() => {
if (!providerUid) return null;
return collection(db, "providers", providerUid, "employeeRequests");
}, [providerUid]);

const employeesCol = useMemo(() => {
if (!providerUid) return null;
return collection(db, "providers", providerUid, "employees");
}, [providerUid]);

// Load pending approvals
useEffect(() => {
setActionErr(null);

if (!pendingCol) {
setLoadingPending(false);
setPending([]);
return;
}

setLoadingPending(true);
const q = query(pendingCol, where("status", "==", "pending"), orderBy("createdAt", "desc"));

const unsub = onSnapshot(
q,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EmployeeRequest[];
setPending(rows);
setLoadingPending(false);
},
(e) => {
setActionErr(e?.message || "Failed to load pending approvals.");
setLoadingPending(false);
}
);

return () => unsub();
}, [pendingCol]);

// Load approved employees
useEffect(() => {
setActionErr(null);

if (!employeesCol) {
setLoadingEmployees(false);
setEmployees([]);
return;
}

setLoadingEmployees(true);
const q = query(employeesCol, orderBy("createdAt", "desc"));

const unsub = onSnapshot(
q,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Employee[];
setEmployees(rows);
setLoadingEmployees(false);
},
(e) => {
setActionErr(e?.message || "Failed to load employees.");
setLoadingEmployees(false);
}
);

return () => unsub();
}, [employeesCol]);

async function approve(req: EmployeeRequest) {
setActionErr(null);
setActionMsg(null);
if (!providerUid) return;

try {
// 1) Create/Update approved employee doc
await setDoc(
doc(db, "providers", providerUid, "employees", req.employeeUid),
{
userId: req.employeeUid,
name: req.name,
phone: req.phone,
role: req.role,
active: true,
createdAt: serverTimestamp(),
approvedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
},
{ merge: true }
);

// 2) Mark request approved
await updateDoc(doc(db, "providers", providerUid, "employeeRequests", req.id), {
status: "approved",
approvedAt: serverTimestamp(),
reviewedBy: providerUid,
updatedAt: serverTimestamp(),
});

// 3) (Optional but helpful) stamp user doc with approval
await updateDoc(doc(db, "users", req.employeeUid), {
providerUid,
approvedAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

setActionMsg(`Approved ${req.name}.`);
} catch (e: any) {
setActionErr(e?.message || "Failed to approve employee.");
}
}

async function reject(req: EmployeeRequest) {
setActionErr(null);
setActionMsg(null);
if (!providerUid) return;

try {
await updateDoc(doc(db, "providers", providerUid, "employeeRequests", req.id), {
status: "rejected",
rejectedAt: serverTimestamp(),
reviewedBy: providerUid,
updatedAt: serverTimestamp(),
});

setActionMsg(`Rejected ${req.name}.`);
} catch (e: any) {
setActionErr(e?.message || "Failed to reject employee.");
}
}

async function setActive(employeeUid: string, active: boolean) {
setActionErr(null);
setActionMsg(null);
if (!providerUid) return;

try {
await updateDoc(doc(db, "providers", providerUid, "employees", employeeUid), {
active,
updatedAt: serverTimestamp(),
});

setActionMsg(active ? "Employee activated." : "Employee deactivated.");
} catch (e: any) {
setActionErr(e?.message || "Failed to update employee.");
}
}

if (loadingAuth) {
return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-3xl border border-gray-200 rounded-2xl p-8">
<p className="text-gray-700">Loading…</p>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-5xl mx-auto">
<div className="flex items-center gap-3">
<h1 className="text-2xl font-bold">Employees</h1>
<div className="ml-auto flex gap-2">
<button
onClick={() => router.replace("/dashboard/provider?tab=dispatch")}
className="border rounded-lg px-3 py-2 hover:bg-gray-50"
>
← Back to Provider Dashboard
</button>
</div>
</div>

<p className="text-sm text-gray-600 mt-1">
Approve employee sign-ups and manage your technicians/dispatchers.
</p>

{actionErr ? (
<div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {actionErr}
</div>
) : null}

{actionMsg ? (
<div className="mt-4 border border-green-200 bg-green-50 rounded-xl p-3 text-sm text-green-800">
{actionMsg}
</div>
) : null}

{/* Pending Approvals */}
<div className="mt-6 border border-gray-200 rounded-2xl p-5">
<div className="flex items-center">
<h2 className="text-lg font-semibold">Pending approvals</h2>
<div className="ml-auto text-sm text-gray-500">
{loadingPending ? "Loading…" : `${pending.length} pending`}
</div>
</div>

{loadingPending ? (
<p className="mt-3 text-sm text-gray-600">Loading pending requests…</p>
) : pending.length === 0 ? (
<p className="mt-3 text-sm text-gray-600">No pending employees right now.</p>
) : (
<div className="mt-4 overflow-auto">
<table className="w-full text-sm">
<thead>
<tr className="text-left text-gray-600">
<th className="py-2">Name</th>
<th className="py-2">Email</th>
<th className="py-2">Phone</th>
<th className="py-2">Role</th>
<th className="py-2">Actions</th>
</tr>
</thead>
<tbody>
{pending.map((r) => (
<tr key={r.id} className="border-t">
<td className="py-2">{r.name}</td>
<td className="py-2">{r.email}</td>
<td className="py-2">{r.phone}</td>
<td className="py-2 capitalize">{r.role}</td>
<td className="py-2">
<div className="flex gap-2">
<button
onClick={() => approve(r)}
className="bg-black text-white rounded-lg px-3 py-1.5 font-medium"
>
Approve
</button>
<button
onClick={() => reject(r)}
className="border rounded-lg px-3 py-1.5 hover:bg-gray-50"
>
Reject
</button>
</div>
</td>
</tr>
))}
</tbody>
</table>
</div>
)}
</div>

{/* Active Employees */}
<div className="mt-6 border border-gray-200 rounded-2xl p-5">
<div className="flex items-center">
<h2 className="text-lg font-semibold">Employees</h2>
<div className="ml-auto text-sm text-gray-500">
{loadingEmployees ? "Loading…" : `${employees.length} total`}
</div>
</div>

{loadingEmployees ? (
<p className="mt-3 text-sm text-gray-600">Loading employees…</p>
) : employees.length === 0 ? (
<p className="mt-3 text-sm text-gray-600">No employees approved yet.</p>
) : (
<div className="mt-4 overflow-auto">
<table className="w-full text-sm">
<thead>
<tr className="text-left text-gray-600">
<th className="py-2">Name</th>
<th className="py-2">Phone</th>
<th className="py-2">Role</th>
<th className="py-2">Active</th>
<th className="py-2">Actions</th>
</tr>
</thead>
<tbody>
{employees.map((e) => (
<tr key={e.id} className="border-t">
<td className="py-2">{e.name || e.userId}</td>
<td className="py-2">{e.phone || "—"}</td>
<td className="py-2">{String(e.role || "—")}</td>
<td className="py-2">{e.active ? "Yes" : "No"}</td>
<td className="py-2">
<div className="flex gap-2">
{e.active ? (
<button
onClick={() => setActive(e.id, false)}
className="border rounded-lg px-3 py-1.5 hover:bg-gray-50"
>
Deactivate
</button>
) : (
<button
onClick={() => setActive(e.id, true)}
className="bg-black text-white rounded-lg px-3 py-1.5 font-medium"
>
Activate
</button>
)}
</div>
</td>
</tr>
))}
</tbody>
</table>
</div>
)}
</div>
</div>
</main>
);
}

