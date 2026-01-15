"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Employee = {
id: string;
name?: string;
phone?: string;
role?: string;
active?: boolean;
};

export default function AssignEmployee({
providerId,
value,
onChange,
label = "Assign employee",
disabled = false,
}: {
providerId: string | null;
value: string | null;
onChange: (employeeUid: string | null) => void;
label?: string;
disabled?: boolean;
}) {
const [employees, setEmployees] = useState<Employee[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
if (!providerId) {
setEmployees([]);
setLoading(false);
return;
}

setLoading(true);

const qEmp = query(
collection(db, "providers", providerId, "employees"),
where("active", "==", true),
orderBy("name", "asc")
);

const unsub = onSnapshot(
qEmp,
(snap) => {
const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Employee[];
// keep only employees (not dispatchers) if role exists
const filtered = rows.filter((e) => !e.role || e.role === "employee");
setEmployees(filtered);
setLoading(false);
},
() => {
setEmployees([]);
setLoading(false);
}
);

return () => unsub();
}, [providerId]);

const options = useMemo(() => {
return [{ id: "", name: "Unassigned" }, ...employees.map((e) => ({ id: e.id, name: e.name || e.id }))];
}, [employees]);

return (
<div className="border border-gray-200 rounded-xl p-3">
<div className="text-sm font-semibold mb-2">{label}</div>

<select
className="border rounded-lg p-2 w-full"
disabled={disabled || loading || !providerId}
value={value ?? ""}
onChange={(e) => onChange(e.target.value ? e.target.value : null)}
>
{options.map((o) => (
<option key={o.id} value={o.id}>
{o.name}
</option>
))}
</select>

{loading ? <div className="text-xs text-gray-500 mt-2">Loading employees…</div> : null}

{!loading && providerId && employees.length === 0 ? (
<div className="text-xs text-gray-500 mt-2">
No employees found in <code>providers/{providerId}/employees</code>.
</div>
) : null}
</div>
);
}

