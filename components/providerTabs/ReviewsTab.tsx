"use client";

import { useEffect, useState } from "react";
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ReviewDoc = {
  id: string;
  providerUid?: string;
  rating?: number;
  comment?: string;
  createdAt?: any;
};

export default function ReviewsTab({ providerUid }: { providerUid: string }) {
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerUid?.trim()) {
      setReviews([]);
      setLoading(false);
      setError("Missing provider uid.");
      return;
    }

    setLoading(true);
    setError(null);

    // ✅ NO orderBy => no composite index required
    const q = query(
      collectionGroup(db, "reviews"),
      where("providerUid", "==", providerUid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ReviewDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        // ✅ sort locally newest -> oldest
        rows.sort((a: any, b: any) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });

        setReviews(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Reviews error:", err);
        setError(err?.message || "Missing or insufficient permissions.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerUid]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Reviews</h2>
        <p className="text-sm text-gray-500">
          What customers have said about your service.
        </p>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading reviews…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && reviews.length === 0 && (
        <div className="text-sm text-gray-500">No reviews yet.</div>
      )}

      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="border rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">
                {typeof r.rating === "number" ? `Rating: ${r.rating}/5` : "Review"}
              </div>
              <div className="text-xs text-gray-400">
                {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ""}
              </div>
            </div>

            {r.comment ? (
              <div className="text-sm text-gray-700 mt-2">{r.comment}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
