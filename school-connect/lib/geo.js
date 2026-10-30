// Straight-line distance between two GPS points, in metres.
function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Roads aren't straight lines; this rough factor turns "as the crow flies"
// into a believable road distance for the ETA estimate.
const ROAD_FACTOR = 1.3;
// Used when the phone doesn't report a speed (or the bus is stopped at a
// light): a typical average school-bus speed in town, 25 km/h.
const FALLBACK_SPEED_MPS = 25 / 3.6;

function etaMinutes(straightLineM, speedMps) {
  const speed = speedMps && speedMps > 3 ? speedMps : FALLBACK_SPEED_MPS;
  return Math.max(1, Math.round((straightLineM * ROAD_FACTOR) / speed / 60));
}

module.exports = { distanceM, etaMinutes };
