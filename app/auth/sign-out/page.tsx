"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignOutPage() {
const router = useRouter();

useEffect(() => {
let mounted = true;

async function go() {
try {
await signOut(auth);
} catch {
// ignore; still redirect
} finally {
if (mounted) router.replace("/auth/sign-in");
}
}

go();
return () => {
mounted = false;
};
}, [router]);

return (
<main className="min-h-screen flex items-center justify-center p-6 bg-white">
<div className="w-full max-w-md border border-gray-200 rounded-2xl p-8">
<h1 className="text-xl font-bold text-gray-900">Signing out…</h1>
<p className="text-gray-600 mt-2">Redirecting you to Sign In.</p>
</div>
</main>
);
}
