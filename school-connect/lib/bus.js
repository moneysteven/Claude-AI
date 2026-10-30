// Live bus tracking.
//
// The driver's phone sends its GPS position every few seconds while a trip
// is running. On every update we check each parent's "alert zone" (a circle
// around their child's stop). The first time the bus enters it on a trip,
// the parent gets an SMS/WhatsApp — so they can leave home just in time
// instead of waiting at the stop for 20 minutes.
//
// The driver never taps anything for students. Each student scans their own
// ID card (a QR code) on a phone/tablet fixed at the bus door: the first scan
// on a trip means "got on", a second scan means "got off". On the morning
// run, anyone still on board when the driver ends the trip is recorded as
// arrived at school, so students only have to scan once in the morning.

const store = require("./store");
const notify = require("./notify");
const { distanceM, etaMinutes } = require("./geo");
const { newId, today } = require("./util");

// Parents size their alert zone anywhere from 200 m to 5 km, and can drag it
// away from their stop (e.g. further back along the route for an earlier warning).
const ALERT_RADIUS_MIN = 200;
const ALERT_RADIUS_MAX = 5000;
const DEFAULT_ALERT_RADIUS_M = 1000;

// The centre of a parent's alert zone: where they dragged it, or their stop.
function zoneCenter(parent, stop) {
  return parent.zone && Number.isFinite(parent.zone.lat) ? parent.zone : stop;
}

// Where a family catches the bus. Once they've set where they are (their
// phone's location or a tap on the map), it's the nearest point on the route
// to them; until then, the stop the school assigned.
function nearestOnRoute(route, pt) {
  const kx = 111320 * Math.cos((pt.lat * Math.PI) / 180), ky = 110574;
  let best = null;
  for (let i = 1; i < route.length; i++) {
    const [aLat, aLng] = route[i - 1], [bLat, bLng] = route[i];
    const ax = aLng * kx, ay = aLat * ky, bx = bLng * kx, by = bLat * ky, px = pt.lng * kx, py = pt.lat * ky;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
    const x = ax + t * (bx - ax), y = ay + t * (by - ay), d = Math.hypot(px - x, py - y);
    if (!best || d < best.d) best = { lat: y / ky, lng: x / kx, d };
  }
  return best;
}
function familyPickup(parent, bus, student) {
  if (parent && parent.home && Number.isFinite(parent.home.lat)) {
    const p = nearestOnRoute(bus.route, parent.home);
    return { id: "pickup", name: "your pickup point", label: "Your pickup point", custom: true, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), walkM: Math.round(p.d) };
  }
  return student ? stopById(bus, student.stopId) : null;
}

// A dragged zone must stay near the route, so a slip of the finger can't
// park it somewhere the bus never goes.
function zoneNearRoute(bus, point) {
  const pts = [...bus.route.map(([lat, lng]) => ({ lat, lng })), ...bus.stops];
  return pts.some((p) => distanceM(p, point) <= 15000);
}
// If the driver's phone hasn't reported in this long, parents are warned
// that the position on the map may be out of date.
const STALE_AFTER_MS = 2 * 60 * 1000;

function stopById(bus, stopId) {
  return bus.stops.find((s) => s.id === stopId) || null;
}

function studentsOnBus(bus, students = store.all("students")) {
  return students.filter((s) => s.busId === bus.id);
}

function startTrip(bus, direction) {
  bus.trip = {
    id: newId("trip"),
    direction: direction === "afternoon" ? "afternoon" : "morning",
    startedAt: new Date().toISOString(),
    location: null,
    alerted: [],
  };
  store.upsert("buses", bus);
  return bus.trip;
}

async function endTrip(bus) {
  const trip = bus.trip;
  bus.trip = null;
  store.upsert("buses", bus);
  if (!trip || trip.direction !== "morning") return;

  for (const studentId of onBoard(trip.id)) {
    await recordEvent(bus, trip, studentId, "off", { atSchool: true });
  }
}

// Students whose latest scan on this trip was "on".
function onBoard(tripId) {
  const latest = {};
  for (const e of store.all("busEvents").filter((e) => e.tripId === tripId)) latest[e.studentId] = e.type;
  return Object.keys(latest).filter((id) => latest[id] === "on");
}

async function updateLocation(bus, { lat, lng, speed }) {
  if (!bus.trip) return { alertsSent: 0 };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Invalid position");

  bus.trip.location = {
    lat,
    lng,
    speed: Number.isFinite(speed) ? speed : null,
    at: new Date().toISOString(),
  };

  const parents = store.all("parents");
  const alertsSent = [];
  for (const student of studentsOnBus(bus)) {
    const parent = parents.find((p) => p.id === student.parentId);
    const stop = familyPickup(parent, bus, student);
    if (!stop || !parent) continue;

    // One alert per parent per stop per trip, even with several children.
    const key = `${parent.id}:${stop.id}`;
    if (bus.trip.alerted.includes(key)) continue;

    const inZone = distanceM(bus.trip.location, zoneCenter(parent, stop)) <= (parent.alertRadiusM || DEFAULT_ALERT_RADIUS_M);
    if (inZone) {
      bus.trip.alerted.push(key);
      const eta = etaMinutes(distanceM(bus.trip.location, stop), bus.trip.location.speed);
      alertsSent.push(
        notify.sendToParent(
          parent,
          notify.templates.busNear(student, parent, bus, stop, eta, bus.trip.direction),
          "bus-near"
        )
      );
    }
  }

  store.upsert("buses", bus);
  await Promise.all(alertsSent);
  return { alertsSent: alertsSent.length };
}

// A student scanned their ID card at the bus door. `code` is what's in the
// QR code on the card (see the Students > ID cards page).
async function recordScan(bus, code) {
  if (!bus.trip) throw new Error("No trip is running on this bus");
  const studentId = String(code || "").trim().replace(/^SC:/i, "");
  const student = store.find("students", studentId);
  if (!student) throw new Error("Card not recognised");

  // Ignore an accidental double-scan within 20 seconds.
  const mine = store.all("busEvents").filter((e) => e.tripId === bus.trip.id && e.studentId === studentId);
  const last = mine[mine.length - 1];
  if (last && Date.now() - new Date(last.at).getTime() < 20000) return { event: last, student, repeat: true };

  const type = last && last.type === "on" ? "off" : "on";
  const event = await recordEvent(bus, bus.trip, studentId, type);
  return { event, student, wrongBus: student.busId !== bus.id };
}

async function recordEvent(bus, trip, studentId, type, { atSchool = false } = {}) {
  const student = store.find("students", studentId);
  const stop = student ? stopById(bus, student.stopId) : null;
  const at = new Date().toISOString();
  const place = type === "on" ? null : atSchool || trip.direction === "morning" ? "school" : stop ? stop.name : "their stop";
  const event = {
    id: newId("evt"),
    date: today(),
    tripId: trip.id,
    busId: bus.id,
    studentId,
    type,
    at,
    place,
    location: trip.location ? { lat: trip.location.lat, lng: trip.location.lng } : null,
  };
  store.append("busEvents", event);

  const parent = student && store.find("parents", student.parentId);
  if (parent) {
    let body;
    if (type === "on") {
      body = notify.templates.boarded(student, bus, at);
    } else if (place === "school") {
      body = notify.templates.arrivedSchool(student, bus, at);
    } else {
      body = notify.templates.gotOff(student, bus, at, place);
    }
    await notify.sendToParent(parent, body, `bus-${type}`);
  }
  return event;
}

// The details a parent needs to recognise the bus and reach the driver.
function busInfo(bus) {
  return {
    id: bus.id,
    name: bus.name,
    number: bus.number,
    plate: bus.plate,
    description: bus.description,
    driverName: bus.driverName,
    driverPhone: bus.driverPhone,
  };
}

// Everything the parent's tracking page needs, in one JSON payload.
function statusForParent(parent) {
  const students = store.all("students").filter((s) => s.parentId === parent.id && s.busId);
  if (students.length === 0) return { hasBus: false };

  const bus = store.find("buses", students[0].busId);
  if (!bus) return { hasBus: false };
  const stop = familyPickup(parent, bus, students[0]);
  const radiusM = parent.alertRadiusM || DEFAULT_ALERT_RADIUS_M;

  const loc = bus.trip && bus.trip.location;
  let distance = null;
  let eta = null;
  if (loc && stop) {
    distance = Math.round(distanceM(loc, stop));
    eta = etaMinutes(distance, loc.speed);
  }

  const events = store.all("busEvents").filter((e) => e.date === today());
  const children = students.map((s) => {
    const mine = events.filter((e) => e.studentId === s.id);
    const last = mine.length ? mine[mine.length - 1] : null;
    return {
      name: s.name,
      status: !last ? "not_scanned" : last.type === "on" ? "on_bus" : "off_bus",
      at: last ? last.at : null,
      place: last ? last.place : null,
    };
  });

  const center = stop ? zoneCenter(parent, stop) : null;
  return {
    hasBus: true,
    bus: { ...busInfo(bus), route: bus.route, stops: bus.stops },
    school: bus.school ? { ...bus.school, name: bus.schoolName || "School" } : null,
    stop,
    radiusM,
    zone: center ? { lat: center.lat, lng: center.lng, moved: center !== stop } : null,
    home: parent.home || null,
    trip: bus.trip
      ? { direction: bus.trip.direction, startedAt: bus.trip.startedAt, location: loc }
      : null,
    stale: loc ? Date.now() - new Date(loc.at).getTime() > STALE_AFTER_MS : false,
    distanceM: distance,
    etaMin: eta,
    inZone: !!(loc && center && distanceM(loc, center) <= radiusM),
    children,
  };
}

module.exports = {
  ALERT_RADIUS_MIN,
  ALERT_RADIUS_MAX,
  DEFAULT_ALERT_RADIUS_M,
  zoneNearRoute,
  familyPickup,
  stopById,
  studentsOnBus,
  startTrip,
  endTrip,
  updateLocation,
  onBoard,
  recordScan,
  busInfo,
  statusForParent,
};
