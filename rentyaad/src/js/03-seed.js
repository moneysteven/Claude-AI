/* ============ SAMPLE data (clearly labelled; regenerated relative to today) ============ */
const SAMPLE_GUESTS = [
  { name: "Andre W.", from: "Spanish Town" }, { name: "Keisha M.", from: "Portmore" }, { name: "Marcus T.", from: "Toronto" },
  { name: "Shanice R.", from: "May Pen" }, { name: "Devon B.", from: "Brooklyn" }, { name: "Priya S.", from: "London" },
  { name: "Jordan K.", from: "Miami" }, { name: "Tamika H.", from: "Ocho Rios" }, { name: "Ricardo F.", from: "Kingston" },
  { name: "Alicia G.", from: "Birmingham" }, { name: "Omar P.", from: "Mandeville" }, { name: "Natalie C.", from: "Atlanta" },
];
const REVIEW_TEXT = {
  5: ["Everything smooth from start to finish. Big up the team!", "Vehicle was spotless and the A/C ice cold. Would rent again.", "Pick-up took five minutes. Real professional service.", "Host answered WhatsApp fast and gave great tips for the drive.", "Deposit was released the same day. No stress at all.", "Perfect fi the family trip. Plenty space for the bags.", "Handled the hills like nothing. Clean and on time."],
  4: ["Good value. Small wait at pick-up but otherwise great.", "Clean vehicle, friendly host. Tyres a bit worn but it drove fine.", "Solid experience. Would like an earlier pick-up option.", "Delivery to the hotel was on time. Fuel was a little under full."],
  3: ["Vehicle was okay but not as clean as the photos.", "Pick-up was 40 minutes late. The host apologised."],
  2: ["A/C was weak and the host was slow to respond."],
};
const REVIEW_TEXT_2W = ["Scooter perfect fi Negril, easy to park by the beach.", "Helmets were clean and the bike ran sweet along the West End.", "Fun ride, fuel-efficient, host showed us the best route."];

function seedBusinesses() {
  const base = { delivery: true, fuelPolicy: "full-to-full", approval: "approved", verified: true, sample: true, logo: "",
    damagePolicy: "Damage is checked with photos at pick-up and return. Repairs up to your insurance excess come out of the deposit. Anything above the excess is covered by the insurance you chose.",
    rules: "Drive on the left. Seatbelts at all times. No smoking in the vehicle. Valid driver’s licence held for 2+ years." };
  return [
    { ...base, id: "b1", name: "Yaad Wheels Rentals", parish: "St. Andrew", address: "12 Sample Avenue, New Kingston", phone: "+1 876-555-0101", whatsapp: "+1 876-555-0101", hours: "Mon–Sat 7:00 AM–7:00 PM · Sun 9:00 AM–3:00 PM", pickups: ["kingston", "kin"], pickupNotes: { kingston: "Office at 12 Sample Avenue, New Kingston", kin: "Arrivals hall, look for the host with your name" }, policy: "moderate", color: "#1F5FD1", since: 2019, responseMins: 15 },
    { ...base, id: "b2", name: "MoBay Island Drive", parish: "St. James", address: "Sample Plaza, Gloucester Avenue (Hip Strip), Montego Bay", phone: "+1 876-555-0102", whatsapp: "+1 876-555-0112", hours: "Daily 6:00 AM–10:00 PM", pickups: ["montego-bay", "mbj"], pickupNotes: { "montego-bay": "Sample Plaza on the Hip Strip", mbj: "Arrivals meeting point, opposite the taxi rank" }, policy: "flexible", color: "#0A8F6A", since: 2017, responseMins: 10 },
    { ...base, id: "b3", name: "Negril Cliffside Rides", parish: "Westmoreland", address: "West End Road (sample address), Negril", phone: "+1 876-555-0103", whatsapp: "+1 876-555-0103", hours: "Daily 8:00 AM–8:00 PM", pickups: ["negril", "mbj"], pickupNotes: { negril: "West End Road shop near the cliffs", mbj: "Airport delivery on request (about 75 minutes’ drive)" }, policy: "flexible", color: "#E07A1F", since: 2020, responseMins: 30, rules: "Helmets must be worn on bikes and scooters. Drive on the left. No riding on the beach. Valid licence required." },
    { ...base, id: "b4", name: "Ochi Coastline Auto", parish: "St. Ann", address: "Main Street (sample address), Ocho Rios", phone: "+1 876-555-0104", whatsapp: "+1 876-555-0104", hours: "Mon–Sat 8:00 AM–6:00 PM", pickups: ["ocho-rios", "mbj", "kin"], pickupNotes: { "ocho-rios": "Main Street office", mbj: "Sangster arrivals by appointment", kin: "Norman Manley arrivals by appointment" }, policy: "strict", color: "#7A3FD0", since: 2016, responseMins: 45 },
    { ...base, id: "b5", name: "Manchester Hills Motors", parish: "Manchester", address: "Manchester Road (sample address), Mandeville", phone: "+1 876-555-0105", whatsapp: "+1 876-555-0105", hours: "Mon–Fri 8:00 AM–5:00 PM · Sat 9:00 AM–1:00 PM", pickups: ["mandeville", "kin"], pickupNotes: { mandeville: "Yard on Manchester Road", kin: "Norman Manley arrivals, 48 hours’ notice" }, policy: "moderate", delivery: false, verified: false, color: "#A23B2A", since: 2022, responseMins: 60, fuelPolicy: "same-to-same" },
    { ...base, id: "b6", name: "Sav-la-Mar Tours & Vans", parish: "Westmoreland", address: "Great George Street (sample address), Savanna-la-Mar", phone: "+1 876-555-0106", whatsapp: "+1 876-555-0116", hours: "Daily 6:00 AM–9:00 PM", pickups: ["sav", "negril", "mbj"], pickupNotes: { sav: "Great George Street depot", negril: "Hotel pick-ups along Norman Manley Blvd", mbj: "Arrivals meeting point" }, policy: "moderate", color: "#0F6E8C", since: 2018, responseMins: 20 },
  ];
}

function mkV(id, businessId, make, model, year, type, seats, transmission, fuel, daily, deposit, kmLimit, minAge, features, color, more = {}) {
  const n = parseInt(id.slice(1), 10);
  return Object.assign({
    id, businessId, make, model, year, type, seats, transmission, fuel,
    rates: { daily, weekly: Math.round(daily * 6.2 / 100) * 100, monthly: Math.round(daily * 22 / 500) * 500 },
    seasonal: DEFAULT_SEASONS.map(s => ({ ...s })), deposit, mileage: { limit: kmLimit, extraPerKm: 40 }, minAge, features, color,
    plate: "SMPL " + String(4000 + n * 137).slice(-4), photos: [], approval: "approved", suspended: false, maintenance: false,
    instantBook: true, chauffeur: false, blocks: [], rules: [], description: "", sample: true,
  }, more);
}

function seedVehicles() {
  return [
    mkV("v1", "b1", "Toyota", "Yaris", 2020, "car", 5, "auto", "Petrol", 7500, 40000, 200, 23, ["ac", "bluetooth", "airport", "delivery"], "#D64545", { description: "Easy-to-park hatchback for Kingston traffic. Great on fuel." }),
    mkV("v2", "b1", "Honda", "Fit", 2019, "car", 5, "auto", "Petrol", 6800, 35000, null, 21, ["ac", "airport", "delivery"], "#2F6FD6"),
    mkV("v3", "b1", "Toyota", "Land Cruiser Prado", 2018, "suv", 7, "auto", "Diesel", 22000, 100000, 250, 25, ["ac", "4x4", "bluetooth", "airport", "delivery"], "#1F1F22", { chauffeur: true, instantBook: false, description: "Seven-seat 4x4 for the Blue Mountains or a comfortable airport run." }),
    mkV("v4", "b1", "Toyota", "HiAce Commuter", 2017, "bus", 15, "manual", "Diesel", 28000, 80000, null, 25, ["ac", "driver", "airport"], "#F2F2F4", { instantBook: false, description: "15-seat bus with a professional driver. Ideal for church trips and groups." }),
    mkV("v5", "b1", "Nissan", "Note", 2018, "car", 5, "auto", "Petrol", 6200, 30000, 150, 21, ["ac"], "#B8BEC6", { maintenance: true }),
    mkV("v6", "b2", "Toyota", "Noah", 2019, "van", 8, "auto", "Petrol", 16500, 60000, 250, 23, ["ac", "airport", "delivery", "bluetooth"], "#E9EAF0", { description: "Eight-seat family van with sliding doors. Child seats available." }),
    mkV("v7", "b2", "Nissan", "Caravan", 2018, "van", 12, "auto", "Diesel", 19500, 75000, 300, 25, ["ac", "airport", "delivery"], "#FAFAFA", { chauffeur: true, description: "Twelve seats plus luggage space. Book a driver if you’d rather relax." }),
    mkV("v8", "b2", "Honda", "CR-V", 2020, "suv", 5, "auto", "Petrol", 15000, 70000, null, 23, ["ac", "airport", "bluetooth"], "#5B6B7A"),
    mkV("v9", "b2", "Suzuki", "Swift", 2021, "car", 5, "manual", "Petrol", 5900, 30000, 200, 21, ["ac", "airport"], "#E8A500"),
    mkV("v10", "b2", "Toyota", "Coaster", 2015, "bus", 25, "manual", "Diesel", 42000, 50000, null, 25, ["ac", "driver", "airport"], "#F5F5F5", { instantBook: false, description: "25-seat coach with driver for weddings, tours and airport transfers." }),
    mkV("v11", "b2", "Toyota", "Hilux", 2019, "pickup", 5, "manual", "Diesel", 14500, 70000, 250, 25, ["ac", "4x4"], "#8A1C1C"),
    mkV("v12", "b3", "Honda", "PCX 150", 2022, "scooter", 2, "auto", "Petrol", 3800, 15000, 100, 21, ["helmet"], "#1F8A5B", { instantBook: false }),
    mkV("v13", "b3", "Yamaha", "NMAX", 2021, "scooter", 2, "auto", "Petrol", 3500, 15000, 100, 21, ["helmet"], "#0F4C81", { suspended: true }),
    mkV("v14", "b3", "Honda", "CB500X", 2020, "bike", 2, "manual", "Petrol", 6500, 40000, 200, 23, ["helmet"], "#C0392B", { instantBook: false }),
    mkV("v15", "b3", "Suzuki", "Jimny", 2021, "suv", 4, "manual", "Petrol", 12500, 55000, 200, 23, ["ac", "4x4", "delivery"], "#6B8E23"),
    mkV("v16", "b4", "Toyota", "RAV4", 2021, "suv", 5, "auto", "Hybrid", 16000, 70000, null, 23, ["ac", "airport", "delivery", "bluetooth"], "#2F4F6F"),
    mkV("v17", "b4", "Toyota", "Voxy", 2018, "van", 8, "auto", "Petrol", 15500, 60000, 250, 23, ["ac", "delivery"], "#1B1B1F"),
    mkV("v18", "b4", "Toyota", "Corolla", 2019, "car", 5, "auto", "Petrol", 8500, 45000, 250, 21, ["ac", "airport", "bluetooth"], "#7A7F87"),
    mkV("v19", "b4", "Toyota", "HiAce (14-seater)", 2019, "van", 14, "auto", "Diesel", 24000, 90000, 300, 25, ["ac", "airport", "delivery"], "#EDEDED", { approval: "pending", chauffeur: true, instantBook: false }),
    mkV("v20", "b5", "Nissan", "Navara", 2018, "pickup", 5, "manual", "Diesel", 13000, 60000, 250, 23, ["ac", "4x4"], "#D9D9D9"),
    mkV("v21", "b5", "Toyota", "Axio", 2017, "car", 5, "auto", "Petrol", 6000, 30000, 200, 21, ["ac"], "#4A4A4A"),
    mkV("v22", "b5", "Suzuki", "Vitara", 2020, "suv", 5, "auto", "Petrol", 13500, 60000, 250, 23, ["ac", "bluetooth"], "#A23B2A"),
    mkV("v23", "b6", "Mitsubishi", "Rosa", 2017, "bus", 26, "manual", "Diesel", 40000, 50000, null, 25, ["ac", "driver", "airport", "delivery"], "#F5F5F5", { instantBook: false }),
    mkV("v24", "b6", "Toyota", "HiAce Commuter", 2020, "van", 15, "auto", "Diesel", 26000, 90000, 300, 25, ["ac", "airport", "delivery"], "#0F6E8C", { chauffeur: true, instantBook: false }),
    mkV("v25", "b6", "Isuzu", "D-Max", 2019, "pickup", 5, "manual", "Diesel", 13800, 60000, 250, 23, ["ac", "4x4"], "#3C5A3C"),
  ];
}

function seedState() {
  const rnd = mulberry32(876);
  const now = jmNow(); const T0 = sod(now);
  const at = (d, h = 10, m = 0) => fromMs(T0 + d * DAY + h * HOUR + m * MIN);
  const st = {
    v: CONFIG.DATA_VERSION, seededAt: now, role: "customer", hostBizId: "b1",
    settings: { currency: "JMD", fx: CONFIG.FX_DEFAULT, commission: CONFIG.COMMISSION_DEFAULT },
    profile: { name: "Demo Customer", phone: "+1 876-555-0199", email: "", licence: "", licenceExpiry: "", age: 32 },
    search: defaultSearch(),
    favs: ["v7", "v16"],
    businesses: seedBusinesses(), vehicles: seedVehicles(), bookings: [], reviews: [], messages: {}, reads: {}, reports: [],
  };
  S = st; // quote() and helpers read the global state
  const veh = id => st.vehicles.find(v => v.id === id);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const insPick = () => { const x = rnd(); return x < 0.45 ? "basic" : x < 0.85 ? "standard" : "premium"; };
  const ME = { name: "Demo Customer", phone: "+1 876-555-0199", licence: "SAMPLE-DL-204518", expiry: "2029-06", age: 32 };
  const guestDriver = g => ({ name: g.name.replace(".", "") + " (sample)", phone: "+1 876-555-0" + String(100 + Math.floor(rnd() * 800)), licence: "SAMPLE-DL-" + Math.floor(100000 + rnd() * 899999), expiry: "2028-0" + (1 + Math.floor(rnd() * 9)), age: 24 + Math.floor(rnd() * 30) });
  const photos = () => ["Front", "Back", "Left", "Right"].map(label => ({ label, img: "", placeholder: true }));
  const add = o => {
    const v = veh(o.vehicleId);
    const q = quote(v, o.start, o.end, { extras: o.extras || {}, insurance: o.insurance || "basic", pickup: o.pickup });
    const created = toMs(o.start) - (2 + Math.floor(rnd() * 18)) * DAY;
    const bk = {
      id: o.id || uid("bk_"), ref: o.ref || refCode(), vehicleId: v.id, businessId: v.businessId,
      customerId: o.customerId || "guest", guest: o.guest || null, driver: o.customerId === "me" ? { ...ME } : guestDriver(o.guest || SAMPLE_GUESTS[0]),
      start: o.start, end: o.end, pickup: o.pickup || vehicleLocs(v)[0], extras: o.extras || {}, insurance: o.insurance || "basic",
      quote: q, commissionPct: CONFIG.COMMISSION_DEFAULT, commission: Math.round(q.hostGross * CONFIG.COMMISSION_DEFAULT / 100),
      status: o.status, instant: !!v.instantBook, createdAt: Math.min(created, now - HOUR), events: [], checkout: o.checkout || null, checkin: o.checkin || null, cancel: o.cancel || null,
      depositPaid: true, sample: true,
    };
    bk.events.push({ at: bk.createdAt, text: v.instantBook ? "Booked with instant book" : "Request sent to host" });
    if (["confirmed", "active", "completed"].includes(o.status) && !v.instantBook) bk.events.push({ at: bk.createdAt + 40 * MIN, text: "Host accepted the request" });
    if (o.status === "active" || o.status === "completed") {
      bk.checkout = bk.checkout || { at: o.start, fuel: 8, km: 20000 + Math.floor(rnd() * 60000), notes: "No new damage. Sample check-out record.", photos: photos() };
      bk.events.push({ at: toMs(bk.checkout.at), text: "Checked out · trip started" });
    }
    if (o.status === "completed") {
      const late = rnd() < 0.12;
      const backAt = late ? fromMs(toMs(o.end) + (2 + Math.floor(rnd() * 3)) * HOUR) : o.end;
      const km = bk.checkout.km + q.days * (60 + Math.floor(rnd() * 120));
      const fees = returnFees(bk, { at: backAt, fuel: late ? 6 : 8, km, damage: 0, other: 0 });
      bk.checkin = bk.checkin || { at: backAt, fuel: late ? 6 : 8, km, notes: late ? "Returned late. Fuel a quarter under." : "Returned in good condition.", photos: photos(), fees };
      bk.events.push({ at: toMs(backAt), text: "Checked in · trip completed" });
    }
    if (o.status === "cancelled") { bk.cancel = bk.cancel || { at: toMs(o.start) - 3 * DAY, fee: 0, refund: q.deposit, by: "customer" }; bk.events.push({ at: bk.cancel.at, text: "Cancelled by customer" }); }
    st.bookings.push(bk);
    return bk;
  };

  // The demo customer's own trips
  add({ id: "bk_me1", ref: "RY-K7M2Q", vehicleId: "v6", customerId: "me", start: at(5, 10), end: at(9, 10), pickup: "mbj", extras: { childSeat: 1 }, insurance: "standard", status: "confirmed" });
  add({ id: "bk_me2", ref: "RY-T4HX8", vehicleId: "v1", customerId: "me", start: at(-1, 9), end: at(2, 9), pickup: "kingston", insurance: "premium", status: "active", checkout: { at: at(-1, 9, 10), fuel: 8, km: 48210, notes: "Small scuff on the rear bumper noted before the trip.", photos: photos() } });
  add({ id: "bk_me3", ref: "RY-N9P3C", vehicleId: "v12", customerId: "me", start: at(12, 9), end: at(15, 9), pickup: "negril", status: "requested" });
  add({ id: "bk_me4", ref: "RY-D2WQ6", vehicleId: "v17", customerId: "me", start: at(-20, 10), end: at(-16, 10), pickup: "ocho-rios", extras: { delivery: true, hotel: "Sample Beach Resort, Ocho Rios" }, status: "completed" });
  add({ id: "bk_me5", ref: "RY-H3LV5", vehicleId: "v20", customerId: "me", start: at(-45, 8), end: at(-42, 8), pickup: "mandeville", status: "completed" });
  add({ id: "bk_me6", ref: "RY-Z8BF4", vehicleId: "v8", customerId: "me", start: at(-9, 10), end: at(-6, 10), pickup: "mbj", status: "cancelled" });
  // Host-side demo bookings (today’s pick-ups, returns and requests)
  add({ id: "bk_o1", vehicleId: "v3", guest: SAMPLE_GUESTS[2], start: at(0, 14), end: at(3, 14), pickup: "kin", insurance: "standard", status: "confirmed" });
  add({ id: "bk_o2", vehicleId: "v2", guest: SAMPLE_GUESTS[0], start: at(-3, 11), end: at(0, 16), pickup: "kingston", status: "active" });
  add({ id: "bk_o3", vehicleId: "v4", guest: SAMPLE_GUESTS[7], start: at(2, 7), end: at(3, 19), pickup: "kingston", status: "requested" });
  add({ id: "bk_o4", vehicleId: "v3", guest: SAMPLE_GUESTS[5], start: at(8, 10), end: at(11, 10), pickup: "kin", extras: { childSeat: 2 }, status: "requested" });
  add({ id: "bk_o5", vehicleId: "v9", guest: SAMPLE_GUESTS[4], start: at(0, 15), end: at(4, 15), pickup: "mbj", status: "confirmed" });
  add({ id: "bk_o6", vehicleId: "v16", guest: SAMPLE_GUESTS[9], start: at(-4, 9), end: at(0, 12), pickup: "ocho-rios", status: "active" });
  add({ id: "bk_o7", vehicleId: "v10", guest: SAMPLE_GUESTS[11], start: at(6, 8), end: at(6, 20), pickup: "mbj", status: "requested" });

  // Random past and future SAMPLE bookings so calendars and dashboards have history
  const KEEP_FREE = ["v7", "v24", "v6", "v12"];
  for (const v of st.vehicles) {
    if (v.approval !== "approved") continue;
    let cur = T0 - 80 * DAY + Math.floor(rnd() * 4) * DAY;
    for (let guard = 0; guard < 40; guard++) {
      const gap = (1 + Math.floor(rnd() * 7)) * DAY;
      const dur = v.type === "bus" ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 5);
      const sMs = sod(cur + gap) + (8 + Math.floor(rnd() * 5)) * HOUR;
      const eMs = sMs + dur * DAY;
      if (sMs > T0 + 45 * DAY) break;
      cur = sod(eMs) + DAY;
      if (overlaps(sMs, eMs, T0 - DAY, T0 + 7 * DAY) && rnd() < 0.85) continue;
      if (KEEP_FREE.includes(v.id) && overlaps(sMs, eMs, T0 - DAY, T0 + 12 * DAY)) continue;
      if (v.maintenance && eMs > T0 - DAY) continue;
      if (v.suspended && eMs > T0 - 20 * DAY) continue;
      if (st.bookings.some(b => b.vehicleId === v.id && overlaps(sMs, eMs, toMs(b.start) - DAY, toMs(b.end) + DAY))) continue;
      let status;
      if (eMs < now) status = rnd() < 0.1 ? "cancelled" : "completed";
      else if (sMs <= now) status = "active";
      else status = rnd() < 0.06 ? "cancelled" : (v.instantBook ? "confirmed" : (rnd() < 0.45 ? "requested" : "confirmed"));
      const extras = {};
      if (!TWO_WHEEL.has(v.type) && rnd() < 0.2) extras.childSeat = 1;
      if (hasFeat(v, "delivery") && rnd() < 0.15) { extras.delivery = true; extras.hotel = "Sample hotel"; }
      add({ vehicleId: v.id, guest: pick(SAMPLE_GUESTS), start: fromMs(sMs), end: fromMs(eMs), pickup: pick(vehicleLocs(v)), extras, insurance: insPick(), status });
    }
  }

  // Blocked days and maintenance windows
  veh("v5").blocks = [0, 1, 2, 3, 4].map(d => ({ date: dayKey(T0 + d * DAY), kind: "maintenance", note: "Brake service" }));
  veh("v15").blocks = [10, 11].map(d => ({ date: dayKey(T0 + d * DAY), kind: "blocked", note: "Owner use" }));
  veh("v16").blocks = [20, 21].map(d => ({ date: dayKey(T0 + d * DAY), kind: "maintenance", note: "Tyre change" }));
  veh("v3").blocks = [14].map(d => ({ date: dayKey(T0 + d * DAY), kind: "blocked", note: "Owner use" }));

  // SAMPLE reviews — only from completed trips
  for (const bk of st.bookings) {
    if (bk.status !== "completed" || bk.id === "bk_me4") continue;
    if (bk.id !== "bk_me5" && rnd() > 0.64) continue;
    const v = veh(bk.vehicleId);
    const x = rnd(); const rating = bk.id === "bk_me5" ? 5 : x < 0.56 ? 5 : x < 0.86 ? 4 : x < 0.96 ? 3 : 2;
    let text = bk.id === "bk_me5" ? "Navara handled the hills to Mandeville no problem. Owner very helpful." : pick(REVIEW_TEXT[rating]);
    if (TWO_WHEEL.has(v.type) && rating >= 4 && rnd() < 0.7) text = pick(REVIEW_TEXT_2W);
    st.reviews.push({ id: uid("rv_"), bookingId: bk.id, vehicleId: v.id, businessId: v.businessId, author: bk.customerId === "me" ? "Demo Customer" : bk.guest.name, from: bk.customerId === "me" ? "Kingston" : bk.guest.from, rating, text, at: toMs(bk.end) + (8 + Math.floor(rnd() * 40)) * HOUR, sample: true });
  }

  // SAMPLE message threads
  const m = (from, text, d, h, mi = 0) => ({ from, text, at: T0 + d * DAY + h * HOUR + mi * MIN });
  st.messages = {
    bk_me1: [m("system", "Booking RY-K7M2Q confirmed. Deposit paid (mock).", -3, 18), m("business", "Hi! Your Noah is reserved. We’ll meet you at the MBJ arrivals meeting point with a sign.", -3, 18, 20), m("customer", "Great, my flight lands at 9:40 AM. Is the child seat already installed?", -2, 9, 5), m("business", "Yes, the child seat will be installed and the A/C ready. Safe travels!", -2, 9, 31), m("business", "Reminder: please bring the driver’s licence you entered for this booking.", 0, 8, 2)],
    bk_me2: [m("system", "Trip started · Fuel full · 48,210 km", -1, 9, 10), m("business", "Hope the Yaris is running sweet. WhatsApp us anytime if you need anything.", -1, 12, 4)],
    bk_me3: [m("system", "Request RY-N9P3C sent. The host usually replies within an hour.", -1, 16)],
    bk_me4: [m("system", "Trip completed. Deposit released (mock).", -16, 11), m("business", "Thanks for renting with us! Hope Ochi treated you well.", -16, 12)],
    bk_o3: [m("system", "New request from Tamika H. (sample guest).", -1, 7), m("customer", "Good morning! Can the driver collect us at 7:30 instead of 7:00? We have 12 people for a church outing.", 0, 7, 48)],
    bk_o1: [m("customer", "Hi, landing at 1:30 PM on the flight from Toronto. Is 2 PM still fine for pick-up at Norman Manley?", -1, 20, 15)],
  };
  st.reads = { bk_me1: { customer: T0 - 2 * DAY + 10 * HOUR, business: now }, bk_me2: { customer: now, business: now }, bk_me3: { customer: now, business: now }, bk_me4: { customer: now, business: now }, bk_o3: { business: T0 - DAY }, bk_o1: { business: T0 - 2 * DAY } };

  // SAMPLE disputes & reports for the admin queue
  const pastB2 = st.bookings.find(b => b.businessId === "b2" && b.status === "completed" && b.customerId !== "me");
  const pastB1 = st.bookings.find(b => b.businessId === "b1" && b.status === "completed" && b.customerId !== "me");
  st.reports = [
    { id: "rp1", kind: "dispute", category: "Billing or deposit", title: "Deposit not released after return", text: "Returned the vehicle on time with a full tank, but the deposit hold is still showing on my card a week later. (SAMPLE dispute)", by: "customer", reporter: pastB2 ? pastB2.guest.name : "Sample guest", bookingId: pastB2?.id || null, vehicleId: pastB2?.vehicleId || "v8", businessId: "b2", status: "open", at: now - 2 * DAY, sample: true },
    { id: "rp2", kind: "report", category: "Vehicle condition", title: "Scratch on rear bumper after return", text: "Customer returned the car with a new scratch on the rear bumper. Photos attached at check-in. (SAMPLE report)", by: "business", reporter: "Yaad Wheels Rentals", bookingId: pastB1?.id || null, vehicleId: pastB1?.vehicleId || "v2", businessId: "b1", status: "investigating", at: now - 4 * DAY, sample: true },
    { id: "rp3", kind: "report", category: "Listing is inaccurate", title: "Photos don’t match the scooter", text: "The scooter delivered was a different colour and model year from the listing. (SAMPLE report)", by: "customer", reporter: "Jordan K.", bookingId: null, vehicleId: "v13", businessId: "b3", status: "resolved", resolution: "Listing suspended until the host updates photos.", at: now - 9 * DAY, sample: true },
  ];
  return st;
}

function defaultSearch() {
  const T0 = sod(jmNow());
  return { loc: "", start: fromMs(T0 + DAY + 10 * HOUR), end: fromMs(T0 + 4 * DAY + 10 * HOUR), type: "", seats: 1, trans: "", pmin: 0, pmax: CONFIG.PRICE_MAX, features: [], text: "", sort: "rec", verifiedOnly: false, instantOnly: false, availOnly: false };
}
