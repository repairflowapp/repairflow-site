"use client";

import { useEffect, useMemo, useState } from "react";
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type BidDoc = {
  id: string;
  jobId: string;
  providerId?: string;
  price?: number;
  amount?: number;
  message?: string;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
};

export default function MyBidsTab({ providerUid }: { providerUid: string }) {
  const [bids, setBids] = useState<BidDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerUid?.trim()) {
      setBids([]);
      setLoading(false);
      setError("Missing provider uid.");
      return;
    }

    setLoading(true);
    setError(null);

    // ✅ NO orderBy => no composite index required
    const q = query(
      collectionGroup(db, "bids"),
      where("providerId", "==", providerUid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: BidDoc[] = snap.docs.map((d) => {
          const parts = d.ref.path.split("/");
          // .../roadsideRequests/{jobId}/bids/{bidId}
          const jobId = parts.length >= 4 ? parts[1] : "";
          return { id: d.id, jobId, ...(d.data() as any) };
        });

        // ✅ sort locally newest -> oldest
        rows.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });

        setBids(rows);
        setLoading(false);
      },
      (err) => {
        console.error("My bids error:", err);
        setError(err?.message || "Missing or insufficient permissions.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerUid]);

  const total = useMemo(() => bids.length, [bids]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">My Bids</h2>
        <p className="text-sm text-gray-500">
          Bids you’ve submitted on marketplace jobs. ({total})
        </p>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading bids…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && bids.length === 0 && (
        <div className="text-sm text-gray-500">No bids yet.</div>
      )}

      <div className="space-y-3">
        {bids.map((b) => {
          const price =
            typeof b.price === "number"
              ? b.price
              : typeof b.amount === "number"
              ? b.amount
              : null;

          return (
            <div
              key={b.id}
              className="border rounded-xl p-4 flex items-start justify-between gap-6"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium">Bid</div>
                  <div className="text-xs text-gray-400">
                    jobId: {b.jobId || "—"}
                  </div>
                </div>

                {b.message ? (
                  <div className="text-sm text-gray-600 mt-1 break-words">
                    {b.message}
                  </div>
                ) : null}

                {b.status ? (
                  <div className="text-xs text-gray-500 mt-2">
                    Status: {String(b.status)}
                  </div>
                ) : null}
              </div>

              <div className="text-right shrink-0">
                <div className="font-semibold">
                  {price != null ? `$${price}` : "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
