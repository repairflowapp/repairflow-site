import { NextResponse } from "next/server";

type LatLng = { lat: number; lng: number };

function metersToMiles(meters: number) {
  return meters / 1609.344;
}

export async function POST(req: Request) {
  try {
    const key = process.env.GOOGLE_ROUTES_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing GOOGLE_ROUTES_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const origin: LatLng | undefined = body?.origin;
    const destination: LatLng | undefined = body?.destination;

    if (
      !origin ||
      !destination ||
      typeof origin.lat !== "number" ||
      typeof origin.lng !== "number" ||
      typeof destination.lat !== "number" ||
      typeof destination.lng !== "number"
    ) {
      return NextResponse.json(
        { error: "origin and destination must be { lat, lng } numbers" },
        { status: 400 }
      );
    }

    // Routes API (computeRoutes)
    const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

    const googleRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // We only need distance + duration
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });

    if (!googleRes.ok) {
      const txt = await googleRes.text();
      return NextResponse.json(
        { error: "Routes API request failed", details: txt },
        { status: 500 }
      );
    }

    const data = await googleRes.json();

    const route = data?.routes?.[0];
    const distanceMeters: number | undefined = route?.distanceMeters;

    // duration comes back like "123s"
    const durationStr: string | undefined = route?.duration;
    const durationSeconds = durationStr
      ? Number(String(durationStr).replace("s", ""))
      : undefined;

    if (typeof distanceMeters !== "number") {
      return NextResponse.json(
        { error: "No route distance returned from Routes API", data },
        { status: 500 }
      );
    }

    const miles = metersToMiles(distanceMeters);

    return NextResponse.json({
      distanceMeters,
      distanceMiles: Number(miles.toFixed(2)),
      durationSeconds: typeof durationSeconds === "number" ? durationSeconds : null,
      durationMinutes:
        typeof durationSeconds === "number" ? Math.round(durationSeconds / 60) : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
