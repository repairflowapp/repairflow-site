"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Tab({ href, label }: { href: string; label: string }) {
const path = usePathname();
const active = path === href || path.startsWith(href + "/");

return (
<Link
href={href}
className={`px-4 py-2 rounded-lg text-sm font-medium ${
active ? "bg-black text-white" : "border border-gray-300 hover:bg-gray-50"
}`}
>
{label}
</Link>
);
}

export default function ProviderNav() {
return (
<div className="flex flex-wrap gap-2">
<Tab href="/dashboard/provider" label="Home" />
<Tab href="/provider/jobs" label="Jobs" />
<Tab href="/provider/bids" label="Bids" />
<Tab href="/provider/profile" label="Profile" />
</div>
);
}

