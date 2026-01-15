"use client";

import ProviderProfileForm from "@/components/ProviderProfileForm";
import { useRouter } from "next/navigation";

export default function ProviderProfilePage() {
const router = useRouter();

return (
<main className="min-h-screen p-6 bg-white">
<div className="max-w-2xl mx-auto mb-4 flex justify-end">
<button
onClick={() => router.push("/dashboard/provider?tab=profile")}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Back
</button>
</div>

<ProviderProfileForm />
</main>
);
}