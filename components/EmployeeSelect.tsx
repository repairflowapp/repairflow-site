"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type Employee = {
id: string;
name?: string | null;
phone?: string | null;
role?: string | null;
active?: boolean;
userId?: string | null;
};

export default function EmployeeSelect({
providerId,
value,
onChange,
includeDispatchers = true,
includeTechs = true,
disabled = false,
}: {
providerId: string;
value: string | null;
onChange: (nextEmployeeId: string | null, employee?: Employee | null) => void;
includeDispatchers?: boolean;
includeTechs?: boolean;
disabled?: boolean;
}) {
const [employees, setEmployees] = useState<Employee[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
if (!providerId) return;

setLoading(true);

const base = collection(db, "providers", providerId, "employees");
const q = query(base, orderBy("name", "asc")); // ✅ no composite index needed

const unsub = onSnapshot(
q,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Employee[];
setEmployees(rows);
setLoading(false);
},
(e) => {
console.warn("EmployeeSelect snapshot failed:", e);
setEmployees([]);
setLoading(false);
}
);

return () => unsub();
}, [providerId]);

const filtered = useMemo(() => {
return employees
.filter((e) => e.active !== false) // ✅ treat missing active as active
.filter((e) => {
const r = (e.role || "").toLowerCase();
const isDisp = r.includes("dispatch");
const isTech = r.includes("tech") || r.includes("mechanic") || r.includes("driver") || !r;

if (!includeDispatchers && isDisp) return false;
if (!includeTechs && isTech) return false;
return true;
});
}, [employees, includeDispatchers, includeTechs]);

const selected = useMemo(() => filtered.find((e) => e.id === value) ?? null, [filtered, value]);

return (
<div className="w-full">
<select
className="border rounded-lg px-3 py-2 w-full"
disabled={disabled || loading}
value={value ?? ""}
onChange={(e) => {
const v = e.target.value || "";
const nextId = v ? v : null;
const emp = filtered.find((x) => x.id === nextId) ?? null;
onChange(nextId, emp);
}}
>
<option value="">{loading ? "Loading employees…" : "Select employee…"}</option>
{filtered.map((e) => (
<option key={e.id} value={e.id}>
{e.name || "Unnamed"}
{e.role ? ` — ${e.role}` : ""}
{!e.userId ? " (NO LOGIN LINKED)" : ""}
</option>
))}
</select>

{selected ? (
<div className="text-xs text-gray-600 mt-2">
Selected: <b>{selected.name || selected.id}</b>
{selected.phone ? ` • ${selected.phone}` : ""}
{selected.userId ? ` • userId linked` : " • ⚠️ missing userId"}
</div>
) : null}

{filtered.length === 0 && !loading ? (
<div className="text-xs text-gray-600 mt-2">
No employees found. Create: <b>providers/{providerId}/employees/*</b>
</div>
) : null}
</div>
);
}

