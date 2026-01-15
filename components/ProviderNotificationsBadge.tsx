"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Notif = {
id: string;
requestId: string;
type: string; // accepted | rejected | canceled | countered | new_job | etc
title?: string | null;
message?: string | null;
read?: boolean;
createdAt?: any;
};

export default function ProviderNotificationsBadge() {
const router = useRouter();

const [uid, setUid] = useState<string | null>(null);
const [count, setCount] = useState(0);

useEffect(() => {
return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
}, []);

const qRef = useMemo(() => {
if (!uid) return null;
return query(
collection(db, "users", uid, "notifications"),
where("read", "==", false),
orderBy("createdAt", "desc"),
limit(50)
);
}, [uid]);

useEffect(() => {
if (!qRef) return;

const unsub = onSnapshot(qRef, (snap) => {
setCount(snap.size);
});

return () => unsub();
}, [qRef]);

if (!uid) return null;
if (count <= 0) return null;

const onClick = () => {
// ✅ Always go to notifications page (avoids "Job not found")
router.push("/provider/notifications");
};

return (
<button
type="button"
onClick={onClick}
className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-red-200 bg-red-50 text-red-800 text-sm font-semibold hover:bg-red-100"
title="Unread notifications"
>
🔔 {count}
</button>
);
}

