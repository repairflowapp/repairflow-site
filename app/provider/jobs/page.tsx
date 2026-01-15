"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

type UserRole =
  | "driver"
  | "fleet"
  | "repair_shop"
  | "mobile_mechanic"
  | "towing"
  | "tire_shop"
  | "mobile_tire";

const providerRoles: UserRole[] = [
  "repair_shop",
  "mobile_mechanic",
  "towing",
  "tire_shop",
  "mobile_tire",
];

export default function ProviderHomePage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          router.push("/auth/sign-in");
          return;
        }

        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? (snap.data() as any) : null;
        const role = (data?.role as UserRole) ?? null;

        if (!role || !providerRoles.includes(role)) {
          router.push("/dashboard");
          return;
        }

        // Provider lands on Available Jobs
        router.push("/provider/jobs/available");
      } catch {
        router.push("/dashboard");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-xl border border-gray-200 rounded-2xl p-8">
        <p className="text-gray-700">Loading…</p>
      </div>
    </main>
  );
}
