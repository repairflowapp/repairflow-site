// app/dashboard/provider/employees/[employeeUid]/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";

type Employee = {
  id: string;
  name?: string | null;
  phone?: string | null;
  role?: string | null;
  active?: boolean;
  email?: string | null;
};

export default function ProviderEmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();

  const employeeUid = useMemo(() => {
    const raw = (params?.employeeUid as string | string[] | undefined) ?? "";
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [providerUid, setProviderUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [emp, setEmp] = useState<Employee | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("tech");
  const [active, setActive] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/auth/sign-in");
        return;
      }
      setProviderUid(u.uid);
    });
  }, [router]);

  useEffect(() => {
    async function load() {
      try {
        setErr(null);
        setLoading(true);

        if (!providerUid) return;
        if (!employeeUid) throw new Error("Missing employee UID.");

        const ref = doc(db, "providers", providerUid, "employees", employeeUid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setEmp(null);
          throw new Error("Employee not found.");
        }

        const data = snap.data() as any;
        const row: Employee = { id: snap.id, ...data };
        setEmp(row);

        setName(String(row.name || ""));
        setPhone(String(row.phone || ""));
        setRole(String(row.role || "tech"));
        setActive(row.active !== false);
      } catch (e: any) {
        setErr(e?.message || "Failed to load employee.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [providerUid, employeeUid]);

  async function save() {
    if (!providerUid || !employeeUid) return;

    // ✅ Twilio-friendly: enforce/normalize +1 for US numbers when provided
    if (phone.trim() && !isValidUSPhone(phone)) {
      setErr("Enter a valid US phone number.");
      return;
    }

    setErr(null);
    setSaving(true);

    try {
      const ref = doc(db, "providers", providerUid, "employees", employeeUid);

      await updateDoc(ref, {
        name: name.trim() || null,
        phone: phone.trim() ? normalizeUSPhone(phone) : null,
        role: role.trim() || "tech",
        active: !!active,
        updatedAt: serverTimestamp(),
      });

      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEmployeeDoc() {
    if (!providerUid || !employeeUid) return;
    if (!confirm("Delete this employee record? (This does NOT delete their login.)")) return;

    setErr(null);
    setSaving(true);
    try {
      await deleteDoc(doc(db, "providers", providerUid, "employees", employeeUid));
      router.push("/dashboard/provider?tab=employees");
    } catch (e: any) {
      setErr(e?.message || "Failed to delete employee.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="border rounded-2xl p-6 text-sm text-gray-600">Loading…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/provider?tab=employees")}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            ← Back to Employees
          </button>
        </div>

        <h1 className="text-3xl font-bold">Employee</h1>

        {err ? (
          <div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
            <b>Error:</b> {err}
          </div>
        ) : null}

        {!emp ? (
          <div className="border rounded-2xl p-6 text-sm">Employee not found.</div>
        ) : (
          <section className="border rounded-2xl p-6 space-y-4">
            <div className="text-sm text-gray-600">
              UID: <b>{employeeUid}</b>
              {emp.email ? (
                <>
                  {" "}
                  • Email: <b>{emp.email}</b>
                </>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                className="border rounded-lg p-2 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Employee name"
                disabled={saving}
              />
            </div>

            {/* ✅ PhoneInput enforces +1 format */}
            <PhoneInput label="Phone" value={phone} onChange={setPhone} disabled={saving} placeholder="(555) 555-5555" />

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select className="border rounded-lg p-2 w-full" value={role} onChange={(e) => setRole(e.target.value)} disabled={saving}>
                <option value="tech">Tech</option>
                <option value="dispatcher">Dispatcher</option>
              </select>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={active} onChange={() => setActive((v) => !v)} disabled={saving} />
              <span className="text-sm">Active</span>
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                disabled={saving}
                onClick={save}
                className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>

              <button
                disabled={saving}
                onClick={removeEmployeeDoc}
                className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
              >
                Delete Employee Record
              </button>
            </div>

            <div className="text-xs text-gray-500">
              Note: deleting here removes the Firestore employee document only. If you want to delete their actual login
              from Firebase Auth, that must be done via Admin SDK (Cloud Function).
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
