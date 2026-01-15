"use client";

import { useEffect, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };

function getLatLng(place: google.maps.places.PlaceResult): LatLng | null {
  const loc = place.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat(), lng: loc.lng() };
}

export default function TowingAddressMileage() {
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");

  const [pickupLatLng, setPickupLatLng] = useState<LatLng | null>(null);
  const [dropoffLatLng, setDropoffLatLng] = useState<LatLng | null>(null);

  const [miles, setMiles] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Attach Google Places Autocomplete once Google script is loaded
  useEffect(() => {
    const interval = setInterval(() => {
      // @ts-ignore
      if (window.google?.maps?.places && pickupRef.current && dropoffRef.current) {
        clearInterval(interval);

        const pickupAC = new google.maps.places.Autocomplete(pickupRef.current!, {
          fields: ["formatted_address", "geometry"],
          types: ["address"],
        });

        pickupAC.addListener("place_changed", () => {
          const place = pickupAC.getPlace();
          setPickupAddress(place.formatted_address ?? "");
          setPickupLatLng(getLatLng(place));
          setMiles(null);
          setMinutes(null);
          setError(null);
        });

        const dropoffAC = new google.maps.places.Autocomplete(dropoffRef.current!, {
          fields: ["formatted_address", "geometry"],
          types: ["address"],
        });

        dropoffAC.addListener("place_changed", () => {
          const place = dropoffAC.getPlace();
          setDropoffAddress(place.formatted_address ?? "");
          setDropoffLatLng(getLatLng(place));
          setMiles(null);
          setMinutes(null);
          setError(null);
        });
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // When both are selected, call our server route to compute mileage
  useEffect(() => {
    const run = async () => {
      if (!pickupLatLng || !dropoffLatLng) return;

      try {
        setError(null);
        const res = await fetch("/api/distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: pickupLatLng,
            destination: dropoffLatLng,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Distance API failed");

        setMiles(data.distanceMiles ?? null);
        setMinutes(data.durationMinutes ?? null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to calculate distance");
      }
    };

    run();
  }, [pickupLatLng, dropoffLatLng]);

  return (
    <div style={{ maxWidth: 520, display: "grid", gap: 12 }}>
      <div>
        <label>Pickup Address</label>
        <input
          ref={pickupRef}
          placeholder="Start typing pickup address..."
          defaultValue={pickupAddress}
          style={{ width: "100%", padding: 10, marginTop: 6 }}
        />
      </div>

      <div>
        <label>Dropoff Address</label>
        <input
          ref={dropoffRef}
          placeholder="Start typing dropoff address..."
          defaultValue={dropoffAddress}
          style={{ width: "100%", padding: 10, marginTop: 6 }}
        />
      </div>

      <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>Estimated Distance:</b> {miles ?? "--"} miles</div>
        <div><b>Estimated Time:</b> {minutes ?? "--"} minutes</div>
        {error ? <div style={{ color: "red", marginTop: 8 }}>{error}</div> : null}
      </div>

      {/* You’ll store these on the towing request */}
      <pre style={{ fontSize: 12, background: "#f7f7f7", padding: 10 }}>
{JSON.stringify(
  {
    pickupAddress,
    dropoffAddress,
    pickupLatLng,
    dropoffLatLng,
    miles,
    minutes,
  },
  null,
  2
)}
      </pre>
    </div>
  );
}
