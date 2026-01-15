"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type RoadsideRequest = {
  id: string;
  status?: string;
  issueType?: string;
  addressFormatted?: string;
  addressText?: string;
  locationText?: string;
  notes?: string;
  providerId?: string | null;
  createdAt?: any;
  updatedAt?: any;
  origin?: "marketplace" | "internal" | string;
  isInternal?: boolean;
  dispatchJobId?: string | null;
};

function titleCase(s?: string) {
  return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tsMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

export default function ActiveTab({ providerUid }: { providerUid: string }) {
  const [jobs, setJobs] = useState<RoadsideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerUid?.trim()) {
      setJobs([]);
      setLoading(false);
      setError("Missing provider uid.");
      return;
    }

    setLoading(true);
    setError(null);

    // ✅ No orderBy() => avoids composite index
    const q = query(collection(db, "roadsideRequests"), where("providerId", "==", providerUid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RoadsideRequest[];

        // Filter out completed locally
        const active = rows.filter((r: any) => {
          const s = String(r.status || "").toLowerCase();
          return s !== "completed" && s !== "closed" && s !== "cancelled";
        });

        // Sort locally (newest first)
        active.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));

        setJobs(active);
        setLoading(false);
      },
      (err) => {
        console.error("Active jobs error:", err);
        setError(err?.message || "Missing or insufficient permissions.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerUid]);

  const count = useMemo(() => jobs.length, [jobs]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Active Jobs</h2>
        <p className="text-sm text-gray-500">Jobs currently assigned to your provider account. ({count})</p>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading active jobs…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && jobs.length === 0 && <div className="text-sm text-gray-500">No active jobs right now.</div>}

      <div className="space-y-3">
        {jobs.map((j) => {
          const status = String(j.status || "assigned").toLowerCase();
          const issue = titleCase(j.issueType || "job");
          const location = j.addressFormatted || j.locationText || j.addressText || "—";

          return (
            <div key={j.id} className="border rounded-xl p-4 flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{issue}</div>
                  <span className="text-[11px] px-2 py-[2px] rounded-full border">{titleCase(status)}</span>
                  {j.isInternal && <span className="text-[11px] px-2 py-[2px] rounded-full border">Internal</span>}
                </div>

                <div className="text-sm text-gray-600 mt-1 break-words">{location}</div>

                {j.notes && <div className="text-sm text-gray-500 mt-2 break-words">Notes: {j.notes}</div>}

                <div className="text-xs text-gray-400 mt-2">jobId: {j.id}</div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs text-gray-400">
                  {j.createdAt?.toDate ? j.createdAt.toDate().toLocaleString() : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
