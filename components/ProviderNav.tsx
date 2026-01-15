"use client";

import { usePathname, useRouter } from "next/navigation";

export default function ProviderNav() {
const router = useRouter();
const path = usePathname();

const tabs = [
{ label: "Dashboard", href: "/dashboard/provider" },
{ label: "Jobs", href: "/provider/jobs" },
{ label: "Profile", href: "/provider/profile" },
];

return (
<div className="flex gap-2 mb-4">
{tabs.map((t) => (
<button
key={t.href}
onClick={() => router.push(t.href)}
className={`px-4 py-2 rounded-lg border ${
path === t.href
? "bg-black text-white"
: "bg-white text-gray-900"
}`}
>
{t.label}
</button>
))}
</div>
);
}
