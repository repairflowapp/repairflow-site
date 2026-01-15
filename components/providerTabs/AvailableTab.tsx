"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

export default function AvailableTab({ providerUid }: { providerUid: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerUid) return;

    const q = query(
      collection(db, "roadsideRequests"),
      where("status", "in", ["open", "bidding"])
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
      },
      (err) => {
        console.error("Available jobs error:", err);
        setError("Missing or insufficient permissions.");
      }
    );

    return () => unsub();
  }, [providerUid]);

  return (
    <div>
      <h2 className="font-semibold">Available Jobs</h2>
      {error && <div className="text-red-600">{error}</div>}
      <div>{jobs.length === 0 && "No open jobs."}</div>
    </div>
  );
}
