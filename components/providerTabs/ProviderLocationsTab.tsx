"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type ProviderLocation = {
  id: string;
  name?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  coverageMiles?: number;
  isPrimary?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export default function ProviderLocationsTab({
  providerUid,
}: {
  providerUid: string;
}) {
  const [rows, setRows] = useState<ProviderLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    coverageMiles: 50,
    isPrimary: false,
  });

  useEffect(() => {
    setLoading(true);
    setErr(null);

    if (!providerUid) {
      setRows([]);
      setLoading(false);
      setErr("Missing provider uid.");
      return;
    }

    const q = query(
      collection(db, "providers", providerUid, "locations"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (e) => {
        console.error("Locations listener error:", e);
        setErr(e?.message || "Missing or insufficient permissions.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerUid]);

  const total = useMemo(() => rows.length, [rows]);

  async function addLocation() {
    setErr(null);
    if (!providerUid) {
      setErr("Missing provider uid.");
      return;
    }
    if (!form.city || !form.state) {
      setErr("City and State are required.");
      return;
    }

    await addDoc(collection(db, "providers", providerUid, "locations"), {
      name: form.name || "",
      phone: form.phone || "",
      street: form.street || "",
      city: form.city || "",
      state: form.state || "",
      zip: form.zip || "",
      coverageMiles: Number(form.coverageMiles || 0),
      isPrimary: Boolean(form.isPrimary),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setForm({
      name: "",
      phone: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      coverageMiles: 50,
      isPrimary: false,
    });
  }

  async function removeLocation(id: string) {
    setErr(null);
    if (!providerUid) {
      setErr("Missing provider uid.");
      return;
    }
    await deleteDoc(doc(db, "providers", providerUid, "locations", id));
  }

  async function setPrimary(id: string) {
    setErr(null);
    if (!providerUid) {
      setErr("Missing provider uid.");
      return;
    }

    // simple: mark this one primary, unmark others (client-side loop)
    await Promise.all(
      rows.map((r) =>
        updateDoc(doc(db, "providers", providerUid, "locations", r.id), {
          isPrimary: r.id === id,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Locations</h2>
        <p className="text-sm text-gray-500">
          Manage your service locations (coverage, address, name). ({total})
        </p>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="border rounded-xl p-4 space-y-3">
        <div className="font-medium">Add Location</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-600">Location Name (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Phone (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Street Address (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.street}
              onChange={(e) => setForm((s) => ({ ...s, street: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">City *</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.city}
              onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">State *</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.state}
              onChange={(e) => setForm((s) => ({ ...s, state: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">ZIP (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.zip}
              onChange={(e) => setForm((s) => ({ ...s, zip: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Coverage Miles</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2"
              value={form.coverageMiles}
              onChange={(e) =>
                setForm((s) => ({ ...s, coverageMiles: Number(e.target.value) }))
              }
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm((s) => ({ ...s, isPrimary: e.target.checked }))}
            />
            Set as primary
          </label>
        </div>

        <button
          className="px-4 py-2 rounded-lg bg-black text-white"
          onClick={addLocation}
        >
          Add Location
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="border rounded-xl p-4 flex justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                <span>{r.name || "Location"}</span>
                {r.isPrimary && (
                  <span className="text-xs px-2 py-1 rounded-full border">Primary</span>
                )}
              </div>

              <div className="text-sm text-gray-600 mt-1">
                {[r.street, r.city, r.state, r.zip].filter(Boolean).join(", ") || "—"}
              </div>

              <div className="text-xs text-gray-500 mt-2">
                Coverage: {typeof r.coverageMiles === "number" ? r.coverageMiles : "—"} mi
                {r.phone ? ` • ${r.phone}` : ""}
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-2">
              {!r.isPrimary && (
                <button
                  className="text-sm px-3 py-1 rounded-lg border"
                  onClick={() => setPrimary(r.id)}
                >
                  Make Primary
                </button>
              )}
              <button
                className="text-sm px-3 py-1 rounded-lg border text-red-600"
                onClick={() => removeLocation(r.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && !err && rows.length === 0 && (
        <div className="text-sm text-gray-500">No locations yet.</div>
      )}
    </div>
  );
}
