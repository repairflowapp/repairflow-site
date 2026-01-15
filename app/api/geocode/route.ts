// app/api/geocode/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { address?: string };
    const address = (body.address ?? "").trim();

    if (!address) {
      return NextResponse.json(
        { error: "Address is required." },
        { status: 400 }
      );
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing GOOGLE_MAPS_API_KEY in environment." },
        { status: 500 }
      );
    }

    const url =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(address) +
      "&key=" +
      encodeURIComponent(key);

    const r = await fetch(url);
    const data = await r.json();

    // Google often returns HTTP 200 even when status is REQUEST_DENIED
    const googleStatus = String(data?.status ?? "UNKNOWN");
    const googleMessage =
      data?.error_message ||
      (googleStatus !== "OK" ? `Geocoding failed: ${googleStatus}` : null);

    if (googleStatus !== "OK" || !data?.results?.length) {
      // If Google denied the request, this is usually an API key / billing / restriction issue
      const isDenied =
        googleStatus === "REQUEST_DENIED" ||
        googleStatus === "OVER_DAILY_LIMIT" ||
        googleStatus === "OVER_QUERY_LIMIT";

      return NextResponse.json(
        {
          error: googleMessage ?? "Geocoding failed.",
          status: googleStatus,
        },
        { status: isDenied ? 500 : 400 }
      );
    }

    const best = data.results[0];
    const loc = best?.geometry?.location;

    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return NextResponse.json(
        { error: "Invalid geocode response." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: best.formatted_address ?? address,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Geocode route failed." },
      { status: 500 }
    );
  }
}
