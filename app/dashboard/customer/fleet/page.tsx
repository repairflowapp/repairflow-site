"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
deleteDoc,
doc,
getDoc,
onSnapshot,
orderBy,
query,
serverTimestamp,
updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type FleetUnit = {
id: string;
unitNumber?: string | null; // truck/trailer number
year?: number | null;
make?: string | null;
model?: string | null;
vin?: string | null;
plate?: string | null;
color?: string | null;
createdAt?: any;
updatedAt?: any;
};

export default function CustomerFleetPage() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [customerType, setCustomerType] = useState<"driver" | "fleet">("driver");
const [loading, setLoading] = useState(true);

const [rows, setRows] = useState<FleetUnit[]>([]);
const [err, setErr] = useState<string | null>(null);
const [saving, setSaving] = useState(false);

// create form
const [unitNumber, setUnitNumber] = useState("");
const [year, setYear] = useState("");
const [make, setMake] = useState("");
const [model, setModel] = useState("");
const [vin, setVin] = useState("");
const [plate, setPlate] = useState("");
const [color, setColor] = useState("");

// edit form
const [editingId, setEditingId] = useState<string | null>(null);
const [editUnitNumber, setEditUnitNumber] = useState("");
const [editYear, setEditYear] = useState("");
const [editMake, setEditMake] = useState("");
const [editModel, setEditModel] = useState("");
const [editVin, setEditVin] = useState("");
const [editPlate, setEditPlate] = useState("");
const [editColor, setEditColor] = useState("");

useEffect(() => {
const unsub = onAuthStateChanged(auth, async (u) => {
if (!u) {
router.replace("/auth/sign-in");
return;
}
setUid(u.uid);

try {
const snap = await getDoc(doc(db, "users", u.uid));
const data = snap.exists() ? (snap.data() as any) : null;
const ct: "driver" | "fleet" = data?.customerType === "fleet" ? "fleet" : "driver";
setCustomerType(ct);
} catch {
setCustomerType("driver");
} finally {
setLoading(false);
}
});

return () => unsub();
}, [router]);

// fleet-only
useEffect(() => {
if (!uid) return;
if (customerType !== "fleet") {
setRows([]);
return;
}

// ✅ FIX: standardize to customerProfiles/{uid}/fleetUnits
const qf = query(collection(db, "customerProfiles", uid, "fleetUnits"), orderBy("createdAt", "desc"));
const unsub = onSnapshot(
qf,
(snap) => {
const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FleetUnit[];
list.sort((a, b) => String(a.unitNumber || "").localeCompare(String(b.unitNumber || "")));
setRows(list);
setErr(null);
},
(e) => {
setErr(e?.message || "Failed to load fleet.");
setRows([]);
}
);

return () => unsub();
}, [uid, customerType]);

const canCreate = useMemo(() => {
if (!uid) return false;
if (customerType !== "fleet") return false;
if (saving) return false;

if (!unitNumber.trim()) return false;
if (!year.trim() || !Number.isFinite(Number(year))) return false;
if (!make.trim()) return false;
if (!model.trim()) return false;
if (!vin.trim()) return false;
if (!plate.trim()) return false;
if (!color.trim()) return false;

return true;
}, [uid, customerType, saving, unitNumber, year, make, model, vin, plate, color]);

async function createUnit() {
if (!uid) return;
if (!canCreate) return;

setErr(null);
setSaving(true);
try {
await addDoc(collection(db, "customerProfiles", uid, "fleetUnits"), {
unitNumber: unitNumber.trim(),
year: Number(year),
make: make.trim(),
model: model.trim(),
vin: vin.trim(),
plate: plate.trim(),
color: color.trim(),
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

setUnitNumber("");
setYear("");
setMake("");
setModel("");
setVin("");
setPlate("");
setColor("");
} catch (e: any) {
setErr(e?.message || "Failed to create fleet entry.");
} finally {
setSaving(false);
}
}

function startEdit(r: FleetUnit) {
setEditingId(r.id);
setEditUnitNumber(String(r.unitNumber || ""));
setEditYear(r.year != null ? String(r.year) : "");
setEditMake(String(r.make || ""));
setEditModel(String(r.model || ""));
setEditVin(String(r.vin || ""));
setEditPlate(String(r.plate || ""));
setEditColor(String(r.color || ""));
}

function cancelEdit() {
setEditingId(null);
setEditUnitNumber("");
setEditYear("");
setEditMake("");
setEditModel("");
setEditVin("");
setEditPlate("");
setEditColor("");
}

const canSave = useMemo(() => {
if (!uid) return false;
if (!editingId) return false;
if (saving) return false;

if (!editUnitNumber.trim()) return false;
if (!editYear.trim() || !Number.isFinite(Number(editYear))) return false;
if (!editMake.trim()) return false;
if (!editModel.trim()) return false;
if (!editVin.trim()) return false;
if (!editPlate.trim()) return false;
if (!editColor.trim()) return false;

return true;
}, [uid, editingId, saving, editUnitNumber, editYear, editMake, editModel, editVin, editPlate, editColor]);

async function saveEdit() {
if (!uid || !editingId) return;
if (!canSave) return;

setErr(null);
setSaving(true);
try {
await updateDoc(doc(db, "customerProfiles", uid, "fleetUnits", editingId), {
unitNumber: editUnitNumber.trim(),
year: Number(editYear),
make: editMake.trim(),
model: editModel.trim(),
vin: editVin.trim(),
plate: editPlate.trim(),
color: editColor.trim(),
updatedAt: serverTimestamp(),
});
cancelEdit();
} catch (e: any) {
setErr(e?.message || "Failed to save fleet entry.");
} finally {
setSaving(false);
}
}

async function remove(id: string) {
if (!uid) return;
if (!confirm("Delete this fleet entry?")) return;

setErr(null);
setSaving(true);
try {
await deleteDoc(doc(db, "customerProfiles", uid, "fleetUnits", id));
if (editingId === id) cancelEdit();
} catch (e: any) {
setErr(e?.message || "Failed to delete fleet entry.");
} finally {
setSaving(false);
}
}

if (loading) {
return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto">
<div className="border rounded-2xl p-6 text-sm text-gray-600">Loading…</div>
</div>
</main>
);
}

if (customerType !== "fleet") {
return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-4">
<button onClick={() => router.push("/dashboard/customer")} className="border rounded-lg px-4 py-2 font-medium hover:bg-gray-50">
← Back
</button>
<div className="border rounded-2xl p-6">
<h1 className="text-2xl font-bold">My Fleet</h1>
<p className="text-sm text-gray-600 mt-2">This section is only available for Fleet/Company customers.</p>
</div>
</div>
</main>
);
}

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-4xl mx-auto space-y-4">
<button onClick={() => router.push("/dashboard/customer")} className="border rounded-lg px-4 py-2 font-medium hover:bg-gray-50">
← Back
</button>

<div className="border rounded-2xl p-6 space-y-4">
<div>
<h1 className="text-2xl font-bold">My Fleet</h1>
<p className="text-sm text-gray-600 mt-1">Fleet entry form + editable list.</p>
</div>

{err ? (
<div className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">{err}</div>
) : null}

{/* Create */}
<div className="border rounded-xl p-4 space-y-3">
<div className="text-sm font-semibold">Add Fleet Entry</div>

<div className="grid md:grid-cols-2 gap-3">
<div>
<div className="text-xs text-gray-600 mb-1">Truck/ trailer number *</div>
<input className="border rounded-lg p-2 w-full" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Year *</div>
<input className="border rounded-lg p-2 w-full" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Make *</div>
<input className="border rounded-lg p-2 w-full" value={make} onChange={(e) => setMake(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Model *</div>
<input className="border rounded-lg p-2 w-full" value={model} onChange={(e) => setModel(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Vin *</div>
<input className="border rounded-lg p-2 w-full" value={vin} onChange={(e) => setVin(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Plate # *</div>
<input className="border rounded-lg p-2 w-full" value={plate} onChange={(e) => setPlate(e.target.value)} disabled={saving} />
</div>

<div className="md:col-span-2">
<div className="text-xs text-gray-600 mb-1">Color *</div>
<input className="border rounded-lg p-2 w-full" value={color} onChange={(e) => setColor(e.target.value)} disabled={saving} />
</div>
</div>

<button type="button" onClick={createUnit} disabled={!canCreate} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
{saving ? "Saving…" : "Create Fleet Entry"}
</button>

{!canCreate ? <div className="text-xs text-gray-500">All fields are required.</div> : null}
</div>

{/* List */}
<div className="border rounded-xl p-4">
<div className="text-sm font-semibold mb-2">Fleet List</div>

{rows.length === 0 ? (
<div className="text-sm text-gray-600">No fleet entries yet.</div>
) : (
<div className="space-y-2">
{rows.map((r) => {
const isEditing = editingId === r.id;

return (
<div key={r.id} className="border rounded-xl p-3">
{!isEditing ? (
<div className="flex items-start justify-between gap-3">
<div>
<div className="font-semibold">
{r.unitNumber || "Unit"}{" "}
<span className="text-xs text-gray-500">
{r.year ? `• ${r.year}` : ""} {r.make || ""} {r.model || ""}
</span>
</div>
<div className="text-xs text-gray-600 mt-1">
<b>VIN:</b> {r.vin || "—"} • <b>Plate:</b> {r.plate || "—"} • <b>Color:</b> {r.color || "—"}
</div>
</div>

<div className="flex items-center gap-2">
<button type="button" onClick={() => startEdit(r)} disabled={saving} className="border rounded-lg px-3 py-2 text-xs font-semibold hover:bg-gray-50">
Edit
</button>
<button
type="button"
onClick={() => remove(r.id)}
disabled={saving}
className="border border-red-300 text-red-700 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-red-50"
>
Delete
</button>
</div>
</div>
) : (
<div className="space-y-3">
<div className="flex items-center justify-between">
<div className="font-semibold">Edit Fleet Entry</div>
<button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700" disabled={saving}>
Cancel
</button>
</div>

<div className="grid md:grid-cols-2 gap-3">
<div>
<div className="text-xs text-gray-600 mb-1">Truck/ trailer number *</div>
<input className="border rounded-lg p-2 w-full" value={editUnitNumber} onChange={(e) => setEditUnitNumber(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Year *</div>
<input className="border rounded-lg p-2 w-full" value={editYear} onChange={(e) => setEditYear(e.target.value)} inputMode="numeric" disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Make *</div>
<input className="border rounded-lg p-2 w-full" value={editMake} onChange={(e) => setEditMake(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Model *</div>
<input className="border rounded-lg p-2 w-full" value={editModel} onChange={(e) => setEditModel(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Vin *</div>
<input className="border rounded-lg p-2 w-full" value={editVin} onChange={(e) => setEditVin(e.target.value)} disabled={saving} />
</div>

<div>
<div className="text-xs text-gray-600 mb-1">Plate # *</div>
<input className="border rounded-lg p-2 w-full" value={editPlate} onChange={(e) => setEditPlate(e.target.value)} disabled={saving} />
</div>

<div className="md:col-span-2">
<div className="text-xs text-gray-600 mb-1">Color *</div>
<input className="border rounded-lg p-2 w-full" value={editColor} onChange={(e) => setEditColor(e.target.value)} disabled={saving} />
</div>
</div>

<div className="flex flex-wrap gap-2">
<button type="button" onClick={saveEdit} disabled={!canSave} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
{saving ? "Saving…" : "Save"}
</button>
<button
type="button"
onClick={() => remove(r.id)}
disabled={saving}
className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-red-50"
>
Delete
</button>
</div>

{!canSave ? <div className="text-xs text-gray-500">All fields are required.</div> : null}
</div>
)}
</div>
);
})}
</div>
)}
</div>
</div>
</div>
</main>
);
}

