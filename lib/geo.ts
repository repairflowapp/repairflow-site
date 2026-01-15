import { geohashForLocation, geohashQueryBounds } from "geofire-common";

/** Simple Haversine distance in miles */
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
const toRad = (v: number) => (v * Math.PI) / 180;
const R = 3958.7613; // miles

const dLat = toRad(bLat - aLat);
const dLng = toRad(bLng - aLng);
const lat1 = toRad(aLat);
const lat2 = toRad(bLat);

const sinDLat = Math.sin(dLat / 2);
const sinDLng = Math.sin(dLng / 2);

const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

return 2 * R * Math.asin(Math.sqrt(h));
}

export function makeGeohash(lat: number, lng: number) {
return geohashForLocation([lat, lng]);
}

/**
* Returns GeoFire bounds you can use for Firestore queries:
* where("geohash", ">=", start) + where("geohash", "<=", end)
*/
export function getGeohashBounds(lat: number, lng: number, radiusMiles: number) {
// geofire-common expects meters
const radiusMeters = radiusMiles * 1609.344;
return geohashQueryBounds([lat, lng], radiusMeters);
}

/**
* Get the user's current GPS position.
* NOTE: works only in secure contexts (https or localhost) and if user allows permission.
*/
export function getMyLocation(options?: PositionOptions): Promise<{ lat: number; lng: number }> {
return new Promise((resolve, reject) => {
if (typeof window === "undefined" || !("geolocation" in navigator)) {
reject(new Error("Geolocation is not available on this device/browser."));
return;
}

navigator.geolocation.getCurrentPosition(
(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
(err) => reject(err),
{
enableHighAccuracy: true,
timeout: 15000,
maximumAge: 30000,
...(options || {}),
}
);
});
}
