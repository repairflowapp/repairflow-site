// app/api/route-miles/route.ts
import { NextResponse } from "next/server";

type LatLng = { lat: number; lng: number };

async function geocode(address: string, apiKey: string): Promise<LatLng> {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(address) +
    "&key=" +
    encodeURIComponent(apiKey);

  const res = await fetch(url);
  const data = await res.json();

  // Google returns 200 even when status is REQUEST_DENIED, so we must check data.status
  if (data?.status !== "OK" || !data?.results?.[0]?.geometry?.location) {
    const googleMsg =
      data?.error_message ||
      `Geocoding failed with status: ${data?.status || "UNKNOWN"}`;

    throw new Error(googleMsg);
  }

  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_MAPS_API_KEY in server env." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { pickup?: string; dropoff?: string };
    const pickup = (body.pickup ?? "").trim();
    const dropoff = (body.dropoff ?? "").trim();

    if (!pickup || !dropoff) {
      return NextResponse.json(
        { error: "pickup and dropoff are required." },
        { status: 400 }
      );
    }

    // 1) Geocode both addresses to lat/lng
    const [pickupLL, dropoffLL] = await Promise.all([
      geocode(pickup, apiKey),
      geocode(dropoff, apiKey),
    ]);

    // 2) Directions for distance + duration
    const directionsUrl =
      "https://maps.googleapis.com/maps/api/directions/json?origin=" +
      encodeURIComponent(`${pickupLL.lat},${pickupLL.lng}`) +
      "&destination=" +
      encodeURIComponent(`${dropoffLL.lat},${dropoffLL.lng}`) +
      "&key=" +
      encodeURIComponent(apiKey);

    const dirRes = await fetch(directionsUrl);
    const dirData = await dirRes.json();

    if (dirData?.status !== "OK" || !dirData?.routes?.[0]?.legs?.[0]) {
      const googleMsg =
        dirData?.error_message ||
        `Directions failed with status: ${dirData?.status || "UNKNOWN"}`;

      throw new Error(googleMsg);
    }

    const leg = dirData.routes[0].legs[0];
    const distanceMeters = Number(leg.distance?.value ?? 0);
    const durationSeconds = Number(leg.duration?.value ?? 0);

    const miles = distanceMeters / 1609.344;
    const minutes = durationSeconds / 60;

    return NextResponse.json({
      pickupLat: pickupLL.lat,
      pickupLng: pickupLL.lng,
      dropoffLat: dropoffLL.lat,
      dropoffLng: dropoffLL.lng,
      distanceMiles: Number(miles.toFixed(2)),
      durationMinutes: Math.max(1, Math.round(minutes)),
      distanceText: leg.distance?.text ?? null,
      durationText: leg.duration?.text ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error." },
      { status: 500 }
    );
  }
}
