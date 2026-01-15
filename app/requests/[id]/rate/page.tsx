"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

type UserRole =
  | "driver"
  | "fleet"
  | "repair_shop"
  | "mobile_mechanic"
  | "towing"
  | "tire_shop"
  | "mobile_tire";

type RoadsideRequest = {
  createdByUid?: string;
  assignedToUid?: string | null;
  status?: string;

  issueType?: string;
  addressFormatted?: string;
  addressText?: string;

  providerRated?: boolean;
};

type ProviderProfile = {
  businessName?: string;
  phone?: string;
  addressText?: string;

  // rating aggregates we maintain
  ratingCount?: number;

  ratingOverallAvg?: number;
  ratingSatisfactionAvg?: number;
  ratingEtaAvg?: number;
  ratingPriceAvg?: number;
  ratingPerformanceAvg?: number;
};

function clamp1to5(n: number) {
  if (Number.isNaN(n)) return 5;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export default function RateRequestPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const requestId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  const [req, setReq] = useState<RoadsideRequest | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderProfile | null>(null);

  // Rating fields (1–5)
  const [overall, setOverall] = useState(5);
  const [satisfaction, setSatisfaction] = useState(5);
  const [eta, setEta] = useState(5);
  const [price, setPrice] = useState(5);
  const [performance, setPerformance] = useState(5);

  const [comment, setComment] = useState("");

  const isDriverOrFleet = useMemo(
    () => role === "driver" || role === "fleet",
    [role]
  );

  useEffect(() => {
    if (!requestId) {
      setError("Missing request id.");
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          router.push("/auth/sign-in");
          return;
        }

        setUid(user.uid);

        // load role from users/{uid}
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? (userSnap.data() as any) : null;
        const r = (userData?.role as UserRole) ?? null;
        setRole(r);

        if (r && r !== "driver" && r !== "fleet") {
          router.push("/dashboard");
          return;
        }

        // load request
        const reqRef = doc(db, "roadsideRequests", requestId);
        const reqSnap = await getDoc(reqRef);
        if (!reqSnap.exists()) {
          setError("Request not found.");
          setLoading(false);
          return;
        }

        const rd = reqSnap.data() as RoadsideRequest;

        // security: only requester can rate
        if (rd.createdByUid && rd.createdByUid !== user.uid) {
          setError("You can only rate requests you created.");
          setLoading(false);
          return;
        }

        const pid = rd.assignedToUid ?? null;
        setReq(rd);
        setProviderId(pid);

        if (!pid) {
          setError("This request has no provider assigned yet.");
          setLoading(false);
          return;
        }

        // load provider profile for display
        const pSnap = await getDoc(doc(db, "businessProfiles", pid));
        setProvider(pSnap.exists() ? (pSnap.data() as ProviderProfile) : null);

        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load rating page.");
        setLoading(false);
      }
    });

    return () => unsub();
  }, [requestId, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!uid || !role) {
      setError("Not signed in.");
      return;
    }
    if (!isDriverOrFleet) {
      router.push("/dashboard");
      return;
    }
    if (!requestId) {
      setError("Missing request id.");
      return;
    }
    if (!providerId) {
      setError("Missing provider id for this request.");
      return;
    }

    const payload = {
      overall: clamp1to5(overall),
      satisfaction: clamp1to5(satisfaction),
      eta: clamp1to5(eta),
      price: clamp1to5(price),
      performance: clamp1to5(performance),
      comment: comment.trim() || null,
    };

    setSaving(true);
    try {
      const reqRef = doc(db, "roadsideRequests", requestId);
      const profRef = doc(db, "businessProfiles", providerId);
      const ratingRef = doc(collection(db, "businessProfiles", providerId, "ratings"));

      await runTransaction(db, async (tx) => {
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) throw new Error("Request not found.");
        const reqData = reqSnap.data() as RoadsideRequest;

        if (reqData.createdByUid && reqData.createdByUid !== uid) {
          throw new Error("You can only rate requests you created.");
        }

        if (reqData.providerRated) {
          throw new Error("This request was already rated.");
        }

        const profSnap = await tx.get(profRef);
        if (!profSnap.exists()) {
          throw new Error("Provider profile not found.");
        }

        const p = profSnap.data() as ProviderProfile;

        const prevCount = typeof p.ratingCount === "number" ? p.ratingCount : 0;

        const prevOverall = typeof p.ratingOverallAvg === "number" ? p.ratingOverallAvg : 0;
        const prevSat = typeof p.ratingSatisfactionAvg === "number" ? p.ratingSatisfactionAvg : 0;
        const prevEta = typeof p.ratingEtaAvg === "number" ? p.ratingEtaAvg : 0;
        const prevPrice = typeof p.ratingPriceAvg === "number" ? p.ratingPriceAvg : 0;
        const prevPerf = typeof p.ratingPerformanceAvg === "number" ? p.ratingPerformanceAvg : 0;

        const newCount = prevCount + 1;

        const nextOverall = (prevOverall * prevCount + payload.overall) / newCount;
        const nextSat = (prevSat * prevCount + payload.satisfaction) / newCount;
        const nextEta = (prevEta * prevCount + payload.eta) / newCount;
        const nextPrice = (prevPrice * prevCount + payload.price) / newCount;
        const nextPerf = (prevPerf * prevCount + payload.performance) / newCount;

        // 1) Write the individual rating (Google-style written review supported)
        tx.set(ratingRef, {
          requestId,
          providerId,
          ratedByUid: uid,

          overall: payload.overall,
          satisfaction: payload.satisfaction,
          eta: payload.eta,
          price: payload.price,
          performance: payload.performance,

          comment: payload.comment,

          createdAt: serverTimestamp(),
        });

        // 2) Update provider aggregates (permanently attached to provider profile)
        tx.update(profRef, {
          ratingCount: newCount,
          ratingOverallAvg: Number(nextOverall.toFixed(2)),
          ratingSatisfactionAvg: Number(nextSat.toFixed(2)),
          ratingEtaAvg: Number(nextEta.toFixed(2)),
          ratingPriceAvg: Number(nextPrice.toFixed(2)),
          ratingPerformanceAvg: Number(nextPerf.toFixed(2)),
          lastRatingAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 3) Mark request as rated so it can’t be rated twice
        tx.update(reqRef, {
          providerRated: true,
          providerRatedAt: serverTimestamp(),
          providerRatedByUid: uid,
          updatedAt: serverTimestamp(),
        });
      });

      router.push(`/requests/${requestId}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit rating.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-xl border border-gray-200 rounded-2xl p-8">
          <p className="text-gray-700">Loading rating form…</p>
        </div>
      </main>
    );
  }

  if (error && !req) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-xl border border-gray-200 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Rate Provider</h1>
          <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
            {error}
          </p>
          <button
            className="mt-4 w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
            onClick={() => router.push("/requests")}
          >
            Back to My Requests
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-xl border border-gray-200 rounded-2xl p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Rate Provider</h1>

        <div className="mb-6 text-sm text-gray-700">
          <div className="font-medium text-gray-900">
            {provider?.businessName ?? "Provider"}
          </div>
          <div className="text-gray-600">
            {req?.issueType ? `Job: ${req.issueType}` : ""}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <RatingRow label="Overall" value={overall} onChange={setOverall} />
          <RatingRow
            label="Satisfaction with service"
            value={satisfaction}
            onChange={setSatisfaction}
          />
          <RatingRow label="ETA / Timeliness" value={eta} onChange={setEta} />
          <RatingRow label="Price / Fairness" value={price} onChange={setPrice} />
          <RatingRow
            label="Overall performance"
            value={performance}
            onChange={setPerformance}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Written review (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder='Example: "Great communication, arrived fast, fair price."'
              className="w-full border border-gray-300 rounded-lg px-4 py-3 min-h-[120px]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-black text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit Rating"}
          </button>

          <button
            type="button"
            onClick={() => router.push(`/requests/${requestId}`)}
            className="w-full border border-gray-300 text-gray-900 rounded-lg py-3 font-medium hover:bg-gray-50"
          >
            Back
          </button>
        </form>
      </div>
    </main>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium text-gray-900">{label}</div>
        <div className="text-sm text-gray-700">
          <span className="font-semibold">{value}</span> / 5
        </div>
      </div>

      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full"
      />

      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
    </div>
  );
}
