"use client";

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type JobStatus = "accepted" | "assigned" | "enroute" | "in_progress" | "completed" | "canceled";

export default function ProviderDispatchActions({
jobId,
status,
}: {
jobId: string;
status?: JobStatus | string;
}) {
const [saving, setSaving] = useState(false);
const can = (s: string) => (status || "") === s;

async function setStatus(next: JobStatus, extra: Record<string, any> = {}) {
setSaving(true);
try {
await updateDoc(doc(db, "roadsideRequests", jobId), {
status: next,
...extra,
updatedAt: serverTimestamp(),
});
} finally {
setSaving(false);
}
}

return (
<div className="mt-4 border border-gray-200 rounded-xl p-4">
<div className="font-semibold mb-3">Dispatch</div>

<div className="flex flex-wrap gap-2">
<button
disabled={saving || !(can("accepted") || can("assigned"))}
onClick={() => setStatus("enroute")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium disabled:opacity-50"
>
Enroute
</button>

<button
disabled={saving || !can("enroute")}
onClick={() => setStatus("in_progress")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium disabled:opacity-50"
>
In Progress
</button>

<button
disabled={saving || !(can("in_progress") || can("enroute"))}
onClick={() => setStatus("completed")}
className="bg-black text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
>
Complete
</button>
</div>
</div>
);
}

