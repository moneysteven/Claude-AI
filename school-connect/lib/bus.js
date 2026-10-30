// Live bus tracking.
//
// The driver's phone sends its GPS position every few seconds while a trip
// is running. On every update we check each parent's "alert zone" (a circle
// around their child's stop). The first time the bus enters it on a trip,
// the parent gets an SMS/WhatsApp — so they can leave home just in time
// instead of waiting at the stop for 20 minutes.

const store = require("./store");
const notify = require("./notify");
const { distanceM, etaMinutes } = require("./geo");
const { newId, today } = require("./util");

const ALERT_RADIUS_OPTIONS = [300, 500, 1000, 1500, 2000, 3000, 5000];
const DEFAULT_ALERT_RADIUS_M = 1000;
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

function endTrip(bus) {
  bus.trip = null;
  store.upsert("buses", bus);
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
    const stop = stopById(bus, student.stopId);
    const parent = parents.find((p) => p.id === student.parentId);
    if (!stop || !parent) continue;

    // One alert per parent per stop per trip, even with several children.
    const key = `${parent.id}:${stop.id}`;
    if (bus.trip.alerted.includes(key)) continue;

    const dist = distanceM(bus.trip.location, stop);
    if (dist <= (parent.alertRadiusM || DEFAULT_ALERT_RADIUS_M)) {
      bus.trip.alerted.push(key);
      const eta = etaMinutes(dist, bus.trip.location.speed);
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

// Driver taps "On" / "Off" for a student.
async function recordBoarding(bus, studentId, type) {
  const student = studentsOnBus(bus).find((s) => s.id === studentId);
  if (!student) throw new Error("Student is not on this bus");

  const at = new Date().toISOString();
  const event = {
    id: newId("evt"),
    date: today(),
    tripId: bus.trip ? bus.trip.id : null,
    busId: bus.id,
    studentId,
    type: type === "off" ? "off" : "on",
    at,
    location: bus.trip && bus.trip.location ? { lat: bus.trip.location.lat, lng: bus.trip.location.lng } : null,
  };
  store.append("busEvents", event);

  const parent = store.find("parents", student.parentId);
  if (parent) {
    let body;
    if (event.type === "on") {
      body = notify.templates.boarded(student, bus, at);
    } else {
      const morning = bus.trip && bus.trip.direction === "morning";
      const stop = stopById(bus, student.stopId);
      body = notify.templates.gotOff(student, bus, at, morning ? "school" : stop ? stop.name : "their stop");
    }
    await notify.sendToParent(parent, body, `bus-${event.type}`);
  }
  return event;
}

// Today's on/off state for every student on a bus (latest event wins).
function boardingState(bus) {
  const events = store.all("busEvents").filter((e) => e.busId === bus.id && e.date === today());
  const state = {};
  for (const e of events) state[e.studentId] = e;
  return state;
}

// Everything the parent's tracking page needs, in one JSON payload.
function statusForParent(parent) {
  const students = store.all("students").filter((s) => s.parentId === parent.id && s.busId);
  if (students.length === 0) return { hasBus: false };

  const bus = store.find("buses", students[0].busId);
  if (!bus) return { hasBus: false };
  const stop = stopById(bus, students[0].stopId);
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
    return { name: s.name, last: mine.length ? mine[mine.length - 1] : null };
  });

  return {
    hasBus: true,
    bus: { id: bus.id, name: bus.name, driverName: bus.driverName, route: bus.route, stops: bus.stops },
    stop,
    radiusM,
    trip: bus.trip
      ? { direction: bus.trip.direction, startedAt: bus.trip.startedAt, location: loc }
      : null,
    stale: loc ? Date.now() - new Date(loc.at).getTime() > STALE_AFTER_MS : false,
    distanceM: distance,
    etaMin: eta,
    inZone: distance !== null && distance <= radiusM,
    children,
  };
}

module.exports = {
  ALERT_RADIUS_OPTIONS,
  DEFAULT_ALERT_RADIUS_M,
  stopById,
  studentsOnBus,
  startTrip,
  endTrip,
  updateLocation,
  recordBoarding,
  boardingState,
  statusForParent,
};
