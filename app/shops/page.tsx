"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getGeohashBounds, milesBetween } from "@/lib/geo";

type UserRole =
  | "repair_shop"
  | "mobile_mechanic"
  | "towing"
  | "tire_shop"
  | "mobile_tire";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "repair_shop", label: "Repair Shop" },
  { value: "tire_shop", label: "Tire Shop" },
  { value: "towing", label: "Towing" },
  { value: "mobile_mechanic", label: "Mobile Mechanic" },
  { value: "mobile_tire", label: "Mobile Tire" },
];

type ShopRow = {
  id: string; // uid or doc id
  role: UserRole;
  businessName?: string | null;
  addressText?: string | null;
  locationLat: number;
  locationLng: number;
  geohash: string;
  services?: string[] | null;
  phone?: string | null;
  is24Hours?: boolean | null;
  businessHours?: string | null;
  isEmergencyAvailable?: boolean | null;
};

type GeocodeResp = {
  lat: number;
  lng: number;
  formattedAddress?: string;
};

export default function ShopsDirectoryPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>("repair_shop");
  const [radiusMiles, setRadiusMiles] = useState<number>(25);

  const [useGps, setUseGps] = useState<boolean>(true);
  const [typedAddress, setTypedAddress] = useState<string>("");

  const [centerLat, setCenterLat] = useState<number | null>(null);
  const [centerLng, setCenterLng] = useState<number | null>(null);
  const [centerLabel, setCenterLabel] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<(ShopRow & { distanceMiles: number })[]>([]);

  async function useMyLocation() {
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation not supported in this browser.");
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterLat(pos.coords.latitude);
        setCenterLng(pos.coords.longitude);
        setCenterLabel("Your current location");
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to get your location.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function geocodeTypedAddress() {
    setError(null);
    const addr = typedAddress.trim();
    if (!addr) {
      setError("Please type a city/address first.");
      return null;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? "Geocoding failed.");

      const geo = data as GeocodeResp;
      setCenterLat(geo.lat);
      setCenterLng(geo.lng);
      setCenterLabel(geo.formattedAddress ?? addr);
      return geo;
    } catch (e: any) {
      setError(e?.message ?? "Geocoding failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function search() {
    setError(null);

    // Decide search center
    let lat = centerLat;
    let lng = centerLng;

    if (useGps) {
      if (lat == null || lng == null) {
        await useMyLocation();
        // after useMyLocation we still might not have it (permission denied)
        lat = centerLat;
        lng = centerLng;
      }
    } else {
      const geo = await geocodeTypedAddress();
      if (!geo) return;
      lat = geo.lat;
      lng = geo.lng;
    }

    if (lat == null || lng == null) {
      setError("Missing location. Use GPS or type an address.");
      return;
    }

    setLoading(true);
    try {
      // Geohash bounds for radius
      const bounds = getGeohashBounds(lat, lng, radiusMiles);

      // We run multiple queries (one per bound) then merge unique docs
      const seen = new Map<string, ShopRow>();

      for (const [start, end] of bounds) {
        const qRef = query(
          collection(db, "businessProfiles"),
          where("role", "==", role),
          orderBy("geohash"),
          where("geohash", ">=", start),
          where("geohash", "<=", end)
        );

        const snap = await getDocs(qRef);
        snap.forEach((d) => {
          const data = d.data() as any;
          // Validate we have coords
          const lt = Number(data?.locationLat);
          const lg = Number(data?.locationLng);
          const gh = String(data?.geohash ?? "");
          if (!Number.isFinite(lt) || !Number.isFinite(lg) || !gh) return;

          seen.set(d.id, {
            id: d.id,
            role: data.role,
            businessName: data?.businessName ?? null,
            addressText: data?.addressText ?? null,
            locationLat: lt,
            locationLng: lg,
            geohash: gh,
            services: Array.isArray(data?.services) ? data.services : null,
            phone: typeof data?.phone === "string" ? data.phone : null,
            is24Hours: typeof data?.is24Hours === "boolean" ? data.is24Hours : null,
            businessHours: typeof data?.businessHours === "string" ? data.businessHours : null,
            isEmergencyAvailable:
              typeof data?.isEmergencyAvailable === "boolean"
                ? data.isEmergencyAvailable
                : null,
          });
        });
      }

      // Filter + compute distance + sort
      const rows = Array.from(seen.values())
        .map((s) => ({
          ...s,
          distanceMiles: milesBetween(lat!, lng!, s.locationLat, s.locationLng),
        }))
        .filter((s) => s.distanceMiles <= radiusMiles)
        .sort((a, b) => a.distanceMiles - b.distanceMiles);

      setResults(rows);
      if (!rows.length) setError("No shops found in your radius.");
    } catch (e: any) {
      setError(e?.message ?? "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  const modeLabel = useMemo(() => (useGps ? "GPS" : "Typed address"), [useGps]);

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Shop Directory</h1>
            <p className="text-sm text-gray-600 mt-1">
              Find providers near you (closest to farthest). Mode:{" "}
              <span className="font-medium text-gray-900">{modeLabel}</span>
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="border border-gray-300 text-gray-900 rounded-lg px-4 py-2 font-medium hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        <div className="mt-6 border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop type</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Radius (miles)</label>
              <input
                type="number"
                value={radiusMiles}
                min={1}
                max={200}
                onChange={(e) => setRadiusMiles(Number(e.target.value || 25))}
                className="w-full border border-gray-300 rounded-lg px-4 py-3"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                checked={useGps}
                onChange={() => setUseGps(true)}
              />
              Use GPS
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                checked={!useGps}
                onChange={() => setUseGps(false)}
              />
              Type address/city
            </label>
          </div>

          {useGps ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={loading}
                className="bg-black text-white rounded-lg px-4 py-3 font-medium hover:opacity-90 disabled:opacity-50"
              >
                Use my current location
              </button>

              <div className="text-sm text-gray-700">
                Center:{" "}
                <span className="font-medium text-gray-900">
                  {centerLat == null ? "—" : `${centerLat.toFixed(5)}, ${centerLng?.toFixed(5)}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Address / city
              </label>
              <input
                value={typedAddress}
                onChange={(e) => setTypedAddress(e.target.value)}
                placeholder='Example: "Philadelphia, PA" or "123 Main St, Newark, NJ"'
                className="w-full border border-gray-300 rounded-lg px-4 py-3"
              />
              <div className="text-xs text-gray-500">
                We will geocode this and use it as the center for distance sorting.
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="w-full bg-black text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search shops"}
          </button>

          <div className="text-sm text-gray-700">
            Search center:{" "}
            <span className="font-medium text-gray-900">{centerLabel || "—"}</span>
          </div>

          {error && (
            <div className="text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {results.map((s) => (
            <div key={s.id} className="border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {s.businessName || "Business"}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    <span className="text-gray-500">Address:</span>{" "}
                    {s.addressText || "—"}
                  </div>

                  {s.services?.length ? (
                    <div className="text-sm text-gray-700 mt-1">
                      <span className="text-gray-500">Services:</span>{" "}
                      {s.services.join(", ")}
                    </div>
                  ) : null}

                  {s.phone ? (
                    <div className="text-sm text-gray-700 mt-1">
                      <span className="text-gray-500">Phone:</span> {s.phone}
                    </div>
                  ) : null}

                  {(s.is24Hours != null || s.businessHours) && (
                    <div className="text-sm text-gray-700 mt-1">
                      <span className="text-gray-500">Hours:</span>{" "}
                      {s.is24Hours ? "24/7" : s.businessHours || "—"}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-sm text-gray-500">Distance</div>
                  <div className="text-xl font-bold text-gray-900">
                    {s.distanceMiles.toFixed(1)} mi
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => router.push(`/providers/${s.id}`)}
                  className="border border-gray-300 text-gray-900 rounded-lg py-3 px-4 font-medium hover:bg-gray-50"
                >
                  View Profile
                </button>

                <button
                  onClick={() => router.push("/request")}
                  className="bg-black text-white rounded-lg py-3 px-4 font-medium hover:opacity-90"
                >
                  Request Roadside Help
                </button>
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && !error && (
          <div className="mt-6 text-sm text-gray-600 border border-gray-200 rounded-2xl p-5">
            Run a search to see shops here.
          </div>
        )}
      </div>
    </main>
  );
}
