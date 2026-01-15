"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PreBidChat from "./PreBidChat";
//import BidsPanel from "./BidsPanel";

type Job = {
type?: string;
emergency?: boolean;
pickup?: string;
dropoff?: string;
location?: string;
notes?: string;
status?: string;
assignedProviderId?: string | null;
assignedBidId?: string | null;
};

export default function CustomerJobDetailPage() {
const params = useParams();
const jobId = (params?.id as string) || "";

const [job, setJob] = useState<Job | null>(null);
const [missing, setMissing] = useState(false);

useEffect(() => {
if (!jobId) return;

const jobRef = doc(db, "jobs", jobId);
return onSnapshot(jobRef, (snap) => {
if (!snap.exists()) {
setMissing(true);
setJob(null);
return;
}
setMissing(false);
setJob(snap.data() as Job);
});
}, [jobId]);

if (missing) {
return (
<div style={{ padding: 24 }}>
<p>Job not found.</p>
<Link href="/customer/jobs">Back</Link>
</div>
);
}

if (!job) return <div style={{ padding: 24 }}>Loading job…</div>;

return (
<div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
<div style={{ marginBottom: 16 }}>
<Link href="/customer/jobs">← Back</Link>
</div>

<h1 style={{ marginBottom: 10 }}>Job #{jobId}</h1>

<div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
<p><strong>Type:</strong> {job.type || "—"}</p>
<p><strong>Emergency:</strong> {job.emergency ? "Yes" : "No"}</p>

{job.pickup ? <p><strong>Pickup:</strong> {job.pickup}</p> : null}
{job.dropoff ? <p><strong>Dropoff:</strong> {job.dropoff}</p> : null}
{!job.pickup && job.location ? <p><strong>Location:</strong> {job.location}</p> : null}

<p><strong>Notes:</strong> {job.notes || "—"}</p>
<p><strong>Status:</strong> {job.status || "available"}</p>

{job.status === "assigned" ? (
<p style={{ marginTop: 10 }}>
✅ Assigned (provider: {job.assignedProviderId || "—"})
</p>
) : null}
</div>

{/* Customer chat + bids (customer can accept) */}
<PreBidChat jobId={jobId} role="customer" />
<BidsPanel jobId={jobId} role="customer" />
</div>
);
}
