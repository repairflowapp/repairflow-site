"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type RoadsideRequest = {
status?: string; // "open", "bidding", "accepted", etc
issueType?: string;
type?: string;

isEmergency?: boolean;
emergency?: boolean;

pickupAddress?: string | null;
dropoffAddress?: string | null;

addressFormatted?: string | null;
addressText?: string | null;

locationText?: string | null;

notes?: string | null;
createdAt?: any;
};

export default function ProviderAvailableJobsPage() {
const router = useRouter();
const [jobs, setJobs] = useState<Array<{ id: string; data: RoadsideRequest }>>([]);
const [error, setError] = useState<string | null>(null);

const jobsQuery = useMemo(() => {
return query(
collection(db, "roadsideRequests"),
where("status", "==", "open"),
orderBy("createdAt", "desc")
);
}, []);

useEffect(() => {
const unsub = onSnapshot(
jobsQuery,
(snap) => {
setError(null);
const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as RoadsideRequest }));
setJobs(rows);
},
(e) => setError(e?.message || "Failed to load jobs")
);

return () => unsub();
}, [jobsQuery]);

return (
<div className="max-w-4xl mx-auto p-6">
<div className="flex items-start justify-between gap-4">
<div>
<h1 className="text-3xl font-bold">Available Jobs</h1>
<p className="text-sm opacity-70 mt-1">
Click a job to bid and chat before bidding.
</p>
</div>

<button
onClick={() => router.push("/dashboard")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
</div>

<div className="mt-4 flex gap-2">
<button
onClick={() => router.push("/provider/jobs/active")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Active
</button>
<button
onClick={() => router.push("/provider/jobs/completed")}
className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
>
Completed
</button>
</div>

{error && (
<div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">
<b>Error:</b> {error}
</div>
)}

<div className="mt-6 space-y-3">
{jobs.length === 0 ? (
<div className="border rounded-xl p-4 text-sm opacity-70">
No available jobs right now.
</div>
) : (
jobs.map(({ id, data }) => {
const title = data.issueType || data.type || "Roadside Job";

const pickup =
data.pickupAddress ||
data.addressFormatted ||
data.addressText ||
data.locationText ||
"—";

const dropoff = data.dropoffAddress || "—";
const notes = data.notes || "—";
const emergency = !!(data.isEmergency ?? data.emergency);

return (
<div key={id} className="border rounded-2xl p-4">
<div className="flex items-center justify-between gap-4">
<div className="flex items-center gap-2">
<div className="font-semibold">{title}</div>
{emergency && (
<span className="text-xs px-2 py-1 rounded-full border">
EMERGENCY
</span>
)}
</div>

{/* ✅ IMPORTANT: bid page route */}
<Link className="font-semibold underline" href={`/provider/jobs/${id}/bid`}>
Bid Now →
</Link>
</div>

<div className="mt-2 text-sm">
<div>
<b>Pickup:</b> {pickup}
</div>
{dropoff !== "—" && (
<div>
<b>Dropoff:</b> {dropoff}
</div>
)}
<div>
<b>Notes:</b> {notes}
</div>
</div>
</div>
);
})
)}
</div>
</div>
);
}

