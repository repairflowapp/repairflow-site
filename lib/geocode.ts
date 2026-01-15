export type GeocodeResult = {
lat: number;
lng: number;
formattedAddress?: string;
};

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!key) {
throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
}

const q = (address || "").trim();
if (!q) throw new Error("Enter an address to geocode.");

const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
q
)}&key=${encodeURIComponent(key)}`;

const res = await fetch(url);
if (!res.ok) throw new Error("Geocoding request failed.");

const data = await res.json();

if (data.status !== "OK" || !data.results?.length) {
throw new Error(`Geocoding failed: ${data.status || "NO_RESULTS"}`);
}

const top = data.results[0];
const loc = top.geometry?.location;

if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
throw new Error("Geocoding returned invalid coordinates.");
}

return {
lat: loc.lat,
lng: loc.lng,
formattedAddress: top.formatted_address,
};
}

export function extractCityStateZip(components: any[]): { city?: string; state?: string; zip?: string } {
const out: any = {};

for (const c of components || []) {
const types: string[] = c.types || [];
if (types.includes("locality")) out.city = c.long_name;
if (types.includes("administrative_area_level_1")) out.state = c.short_name;
if (types.includes("postal_code")) out.zip = c.long_name;
}

return out;
}

