"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignOutButton() {
const router = useRouter();

async function doSignOut() {
await signOut(auth);
router.push("/auth/sign-in");
router.refresh();
}

return (
<button
type="button"
onClick={doSignOut}
className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
>
Sign Out
</button>
);
}

