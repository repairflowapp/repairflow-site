"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function SignOutButton({
className = "border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50",
label = "Sign Out",
}: {
className?: string;
label?: string;
}) {
const router = useRouter();

async function doSignOut() {
try {
await signOut(auth);
} finally {
router.push("/auth/sign-in");
router.refresh();
}
}

return (
<button type="button" onClick={doSignOut} className={className}>
{label}
</button>
);
}
