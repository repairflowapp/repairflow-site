"use client";

import { useRouter } from "next/navigation";

export default function NotificationsButton({
label = "Notifications",
}: {
label?: string;
}) {
const router = useRouter();
return (
<button
type="button"
onClick={() => router.push("/notifications")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
{label}
</button>
);
}

