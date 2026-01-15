"use client";

import { useEffect, useMemo, useState } from "react";
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
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import PhoneInput, {
  isValidUSPhone,
  normalizeUSPhone,
} from "@/components/PhoneInput";

type EmployeeRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  role?: "tech" | "driver" | "dispatcher" | "manager" | string | null;
  active?: boolean;
  pending?: boolean;
  userId?: string | null;
  email?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

type Props = {
  providerUid: string;
  viewerRole: "provider" | "dispatcher" | "manager" | "unknown";
};

function titleCase(s?: string | null) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmployeesTab({ providerUid, viewerRole }: Props) {
  const canManage =
    viewerRole === "provider" ||
    viewerRole === "dispatcher" ||
    viewerRole === "manager";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  // Add form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"tech" | "driver" | "dispatcher">("driver");

  const normalizedPhone = useMemo(() => normalizeUSPhone(phone), [phone]);
  const phoneOk = useMemo(
    () => !normalizedPhone || isValidUSPhone(normalizedPhone),
    [normalizedPhone]
  );

  useEffect(() => {
    if (!providerUid) return;

    setLoading(true);
    setErr(null);

    // providers/{providerUid}/employees
    const q = query(
      collection(db, "providers", providerUid, "employees"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: EmployeeRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setEmployees(rows);
        setLoading(false);
      },
      (e) => {
        setErr(e?.message || "Missing or insufficient permissions.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerUid]);

  async function createEmployee() {
    setErr(null);

    if (!canManage) {
      setErr("You do not have permission to add employees.");
      return;
    }

    if (!name.trim()) {
      setErr("Employee name is required.");
      return;
    }

    if (normalizedPhone && !phoneOk) {
      setErr("Phone number is invalid.");
      return;
    }

    try {
      await addDoc(collection(db, "providers", providerUid, "employees"), {
        name: name.trim(),
        phone: normalizedPhone || null,
        role,
        active: true,
        pending: true, // pending until the employee creates an account / is linked
        userId: null,
        email: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setName("");
      setPhone("");
      setRole("driver");
    } catch (e: any) {
      setErr(e?.message || "Create failed: Missing or insufficient permissions.");
    }
  }

  async function toggleActive(empId: string, next: boolean) {
    setErr(null);
    if (!canManage) return;

    try {
      await updateDoc(doc(db, "providers", providerUid, "employees", empId), {
        active: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      setErr(e?.message || "Update failed: Missing or insufficient permissions.");
    }
  }

  async function removeEmployee(empId: string) {
    setErr(null);
    if (!canManage) return;

    const ok = confirm("Remove this employee?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "providers", providerUid, "employees", empId));
    } catch (e: any) {
      setErr(e?.message || "Delete failed: Missing or insufficient permissions.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Employees</h2>
        <p className="text-sm text-gray-600">
          Add drivers/techs/dispatchers to your provider account.
        </p>
      </div>

      {err && (
        <div className="border rounded-xl p-3 text-sm text-red-700 bg-red-50">
          Error: {err}
        </div>
      )}

      {/* Add employee */}
      <div className="border rounded-2xl p-4">
        <div className="font-semibold mb-3">Add Employee</div>

        {!canManage && (
          <div className="text-sm text-orange-700 bg-orange-50 border rounded-xl p-3 mb-3">
            You don’t have permission to add employees on this account.
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Driver name"
              disabled={!canManage}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Phone (optional)</label>
            <div className="mt-1">
              <PhoneInput
                value={phone}
                onChange={setPhone}
                placeholder="(555) 555-5555"
                disabled={!canManage}
              />
            </div>
            {!phoneOk && (
              <div className="text-xs text-red-600 mt-1">
                Invalid phone number
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              disabled={!canManage}
            >
              <option value="driver">Driver</option>
              <option value="tech">Tech</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={createEmployee}
            disabled={!canManage}
            className="border rounded-lg px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Add employee
          </button>
        </div>

        <div className="text-xs text-gray-500 mt-2">
          Note: Employees show as <b>pending</b> until their user account is linked.
        </div>
      </div>

      {/* List */}
      <div className="border rounded-2xl p-4">
        <div className="font-semibold mb-3">
          Team ({employees.length})
        </div>

        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="text-sm text-gray-600">
            No employees yet.
          </div>
        ) : (
          <div className="divide-y">
            {employees.map((e) => (
              <div key={e.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">
                    {e.name || "Unnamed"}
                    {e.pending && (
                      <span className="ml-2 text-[11px] px-2 py-[2px] rounded-full border bg-yellow-50">
                        pending
                      </span>
                    )}
                    {e.active === false && (
                      <span className="ml-2 text-[11px] px-2 py-[2px] rounded-full border bg-gray-50">
                        inactive
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-600">
                    {titleCase(e.role) || "—"}
                    {e.phone ? <> • {e.phone}</> : null}
                    {e.email ? <> • {e.email}</> : null}
                  </div>

                  {e.userId ? (
                    <div className="text-xs text-gray-500 mt-1">
                      linked userId: {e.userId}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(e.id, !(e.active ?? true))}
                    disabled={!canManage}
                    className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {(e.active ?? true) ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => removeEmployee(e.id)}
                    disabled={!canManage}
                    className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!canManage && (
          <div className="text-xs text-gray-500 mt-3">
            Viewing only. Log in as provider/dispatcher/manager to manage employees.
          </div>
        )}
      </div>
    </div>
  );
}
