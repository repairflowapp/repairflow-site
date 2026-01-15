"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function NotificationsBell() {
const router = useRouter();
const [uid, setUid] = useState<string | null>(null);
const [unread, setUnread] = useState<number>(0);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => {
setUid(u?.uid ?? null);
});
return () => unsub();
}, []);

useEffect(() => {
if (!uid) return;

const q = query(collection(db, "users", uid, "notifications"), where("read", "==", false));
const unsub = onSnapshot(
q,
(snap) => setUnread(snap.size),
() => setUnread(0)
);

return () => unsub();
}, [uid]);

const badgeText = useMemo(() => {
if (!unread) return "";
if (unread > 99) return "99+";
return String(unread);
}, [unread]);

return (
<button
type="button"
onClick={() => router.push("/notifications")}
className="relative border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50"
aria-label="Notifications"
title="Notifications"
>
<span className="text-lg">🔔</span>
{unread > 0 ? (
<span className="absolute -top-2 -right-2 text-xs font-bold bg-black text-white rounded-full px-2 py-0.5">
{badgeText}
</span>
) : null}
</button>
);
}

