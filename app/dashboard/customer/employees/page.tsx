// app/dashboard/customer/employees/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";

type CustomerEmployeeRole = "tech" | "dispatcher";

type CustomerEmployee = {
  id: string;
  employeeNumber?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null; // +1...
  role?: CustomerEmployeeRole | string | null;
  active?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export default function CustomerEmployeesPage() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<"driver" | "fleet">("driver");
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState<CustomerEmployee[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // create form
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<CustomerEmployeeRole>("tech");

  // edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmployeeNumber, setEditEmployeeNumber] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<CustomerEmployeeRole>("tech");
  const [editActive, setEditActive] = useState(true);

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

    const qEmp = query(collection(db, "customers", uid, "employees"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qEmp,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CustomerEmployee[];
        list.sort((a, b) => String(a.employeeNumber || "").localeCompare(String(b.employeeNumber || "")));
        setRows(list);
        setErr(null);
      },
      (e) => {
        setErr(e?.message || "Failed to load employees.");
        setRows([]);
      }
    );

    return () => unsub();
  }, [uid, customerType]);

  const canCreate = useMemo(() => {
    if (!uid) return false;
    if (customerType !== "fleet") return false;
    if (saving) return false;

    if (!employeeNumber.trim()) return false;
    if (!name.trim()) return false;
    if (!email.trim() || !email.includes("@")) return false;
    if (!isValidUSPhone(phone)) return false;

    return true;
  }, [uid, customerType, saving, employeeNumber, name, email, phone]);

  async function createEmployee() {
    if (!uid) return;
    if (!canCreate) return;

    setErr(null);
    setSaving(true);
    try {
      await addDoc(collection(db, "customers", uid, "employees"), {
        employeeNumber: employeeNumber.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: normalizeUSPhone(phone),
        role,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setEmployeeNumber("");
      setName("");
      setEmail("");
      setPhone("");
      setRole("tech");
    } catch (e: any) {
      setErr(e?.message || "Failed to create employee.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: CustomerEmployee) {
    setEditingId(r.id);
    setEditEmployeeNumber(String(r.employeeNumber || ""));
    setEditName(String(r.name || ""));
    setEditEmail(String(r.email || ""));
    setEditPhone(String(r.phone || ""));
    setEditRole((String(r.role || "tech") as CustomerEmployeeRole) === "dispatcher" ? "dispatcher" : "tech");
    setEditActive(r.active !== false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditEmployeeNumber("");
    setEditName("");
    setEditEmail("");
    setEditPhone("");
    setEditRole("tech");
    setEditActive(true);
  }

  const canSave = useMemo(() => {
    if (!uid) return false;
    if (!editingId) return false;
    if (saving) return false;

    if (!editEmployeeNumber.trim()) return false;
    if (!editName.trim()) return false;
    if (!editEmail.trim() || !editEmail.includes("@")) return false;
    if (!isValidUSPhone(editPhone)) return false;

    return true;
  }, [uid, editingId, saving, editEmployeeNumber, editName, editEmail, editPhone]);

  async function saveEdit() {
    if (!uid || !editingId) return;
    if (!canSave) return;

    setErr(null);
    setSaving(true);
    try {
      await updateDoc(doc(db, "customers", uid, "employees", editingId), {
        employeeNumber: editEmployeeNumber.trim(),
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: normalizeUSPhone(editPhone),
        role: editRole,
        active: !!editActive,
        updatedAt: serverTimestamp(),
      });
      cancelEdit();
    } catch (e: any) {
      setErr(e?.message || "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!uid) return;
    if (!confirm("Delete this employee?")) return;

    setErr(null);
    setSaving(true);
    try {
      await deleteDoc(doc(db, "customers", uid, "employees", id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      setErr(e?.message || "Failed to delete employee.");
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
            <h1 className="text-2xl font-bold">Employees</h1>
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
            <h1 className="text-2xl font-bold">Employees</h1>
            <p className="text-sm text-gray-600 mt-1">Roles: tech / dispatcher. Phones saved as +1XXXXXXXXXX.</p>
          </div>

          {err ? (
            <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">{err}</div>
          ) : null}

          {/* Create */}
          <div className="border rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold">Add Employee</div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Employee # *</div>
                <input className="border rounded-lg p-2 w-full" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} disabled={saving} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Role *</div>
                <select className="border rounded-lg p-2 w-full" value={role} onChange={(e) => setRole(e.target.value as CustomerEmployeeRole)} disabled={saving}>
                  <option value="tech">Tech</option>
                  <option value="dispatcher">Dispatcher</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Employee name *</div>
                <input className="border rounded-lg p-2 w-full" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Employee Email *</div>
                <input className="border rounded-lg p-2 w-full" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
              </div>
            </div>

            <PhoneInput label="Employee phone *" required value={phone} onChange={setPhone} disabled={saving} />

            <button
              type="button"
              onClick={createEmployee}
              disabled={!canCreate}
              className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create Employee"}
            </button>

            {!canCreate ? <div className="text-xs text-gray-500">Employee #, name, email, and valid US phone are required.</div> : null}
          </div>

          {/* List */}
          <div className="border rounded-xl p-4">
            <div className="text-sm font-semibold mb-2">Employee List</div>

            {rows.length === 0 ? (
              <div className="text-sm text-gray-600">No employees yet.</div>
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
                              {r.employeeNumber ? `#${r.employeeNumber} • ` : ""}
                              {r.name || r.email || r.id}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              Role: <b>{String(r.role || "tech")}</b> • Active: <b>{r.active === false ? "No" : "Yes"}</b>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {r.email ? <span>{r.email}</span> : null}
                              {r.email && r.phone ? <span> • </span> : null}
                              {r.phone ? <span>{String(r.phone)}</span> : null}
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
                            <div className="font-semibold">Edit Employee</div>
                            <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700" disabled={saving}>
                              Cancel
                            </button>
                          </div>

                          <div className="grid md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Employee # *</div>
                              <input className="border rounded-lg p-2 w-full" value={editEmployeeNumber} onChange={(e) => setEditEmployeeNumber(e.target.value)} disabled={saving} />
                            </div>

                            <div>
                              <div className="text-xs text-gray-600 mb-1">Role *</div>
                              <select className="border rounded-lg p-2 w-full" value={editRole} onChange={(e) => setEditRole(e.target.value as CustomerEmployeeRole)} disabled={saving}>
                                <option value="tech">Tech</option>
                                <option value="dispatcher">Dispatcher</option>
                              </select>
                            </div>

                            <div>
                              <div className="text-xs text-gray-600 mb-1">Employee name *</div>
                              <input className="border rounded-lg p-2 w-full" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={saving} />
                            </div>

                            <div>
                              <div className="text-xs text-gray-600 mb-1">Employee Email *</div>
                              <input className="border rounded-lg p-2 w-full" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={saving} />
                            </div>
                          </div>

                          <PhoneInput label="Employee phone *" required value={editPhone} onChange={setEditPhone} disabled={saving} />

                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={editActive} onChange={() => setEditActive((v) => !v)} disabled={saving} />
                            <span className="text-sm">Active</span>
                          </label>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={!canSave}
                              className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                            >
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

                          {!canSave ? <div className="text-xs text-gray-500">Employee #, name, email, and valid US phone are required.</div> : null}
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
