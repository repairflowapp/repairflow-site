"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
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
  return (s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isCompletedStatus(status: any) {
  const s = String(status || "").toLowerCase();
  return s === "completed" || s === "closed" || s === "cancelled";
}

export default function CompletedTab({ providerUid }: { providerUid: string }) {
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

    // Pull provider jobs; filter to completed locally to avoid extra composite indexes.
    const q = query(
      collection(db, "roadsideRequests"),
      where("providerId", "==", providerUid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const completed = rows.filter((r: any) => isCompletedStatus(r.status));
        setJobs(completed);
        setLoading(false);
      },
      (err) => {
        console.error("Completed jobs error:", err);
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
        <h2 className="text-xl font-semibold">Completed Jobs</h2>
        <p className="text-sm text-gray-500">
          Jobs finished or closed for your provider account. ({count})
        </p>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading completed jobs…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && jobs.length === 0 && (
        <div className="text-sm text-gray-500">No completed jobs yet.</div>
      )}

      <div className="space-y-3">
        {jobs.map((j) => {
          const status = String(j.status || "completed").toLowerCase();
          const issue = titleCase(j.issueType || "job");
          const location = j.addressFormatted || j.locationText || j.addressText || "—";

          return (
            <div key={j.id} className="border rounded-xl p-4 flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{issue}</div>
                  <span className="text-[11px] px-2 py-[2px] rounded-full border">
                    {titleCase(status)}
                  </span>
                  {j.isInternal && (
                    <span className="text-[11px] px-2 py-[2px] rounded-full border">Internal</span>
                  )}
                </div>

                <div className="text-sm text-gray-600 mt-1 break-words">{location}</div>

                {j.notes && (
                  <div className="text-sm text-gray-500 mt-2 break-words">Notes: {j.notes}</div>
                )}

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
