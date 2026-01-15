"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type BusinessProfile = {
  businessName?: string | null;
  role?: string;
  services?: string[];
  businessHours?: string | null;
  is24Hours?: boolean;
  isEmergencyAvailable?: boolean;
  baseAddress?: string | null;
  baseLat?: number;
  baseLng?: number;
  travelRadiusMiles?: number;
};

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ShopProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const snap = await getDoc(doc(db, "businessProfiles", id));
        if (!snap.exists()) {
          setError("Profile not found.");
          setProfile(null);
          setLoading(false);
          return;
        }

        setProfile(snap.data() as any);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load profile.");
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-2xl border border-gray-200 rounded-2xl p-8">
          <p className="text-gray-700">Loading profile…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {profile?.businessName?.trim() ? profile.businessName : "Shop Profile"}
            </h1>
            <p className="text-gray-600 mt-1">
              Type: <span className="text-gray-900 font-medium">{profile?.role ? titleCase(profile.role) : "—"}</span>
            </p>
          </div>

          <button
            onClick={() => router.back()}
            className="border border-gray-300 text-gray-900 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        {error && (
          <p className="mt-5 text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
            {error}
          </p>
        )}

        {!error && (
          <div className="mt-6 border border-gray-200 rounded-2xl p-6">
            <div className="text-sm text-gray-800 space-y-2">
              <div>
                <span className="text-gray-600">Address:</span>{" "}
                <span className="font-medium">{profile?.baseAddress ?? "—"}</span>
              </div>

              <div>
                <span className="text-gray-600">Hours:</span>{" "}
                <span className="font-medium">
                  {profile?.is24Hours ? "24/7" : profile?.businessHours ?? "—"}
                </span>
              </div>

              <div>
                <span className="text-gray-600">Emergency:</span>{" "}
                <span className="font-medium">
                  {typeof profile?.isEmergencyAvailable === "boolean"
                    ? profile.isEmergencyAvailable
                      ? "Yes"
                      : "No"
                    : "—"}
                </span>
              </div>

              <div>
                <span className="text-gray-600">Services:</span>{" "}
                <span className="font-medium">
                  {Array.isArray(profile?.services) && profile.services.length
                    ? profile.services.map(titleCase).join(", ")
                    : "—"}
                </span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => router.push("/request")}
                className="bg-black text-white rounded-lg px-4 py-2 font-medium hover:opacity-90"
              >
                Request Roadside Help
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
