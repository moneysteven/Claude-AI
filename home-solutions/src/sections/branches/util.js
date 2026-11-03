// Branch finder helpers shared by markup.js (build) and index.js (client).

/** Google Maps search URL for a branch ("Home Solutions <town>, <address>"). */
export const directionsUrl = (b) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Home Solutions ${b.name.replace(/\s*\(.*\)\s*/, "")}, ${b.address}`)}`;

/** Great-circle distance in km (Haversine). */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
