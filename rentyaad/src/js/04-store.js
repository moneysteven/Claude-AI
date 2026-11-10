/* ============ state, persistence and marketplace rules ============ */
let S = null;

const Store = {
  backend: "memory",
  timer: 0,
  async load() {
    try {
      if (window.storage && typeof window.storage.get === "function") {
        this.backend = "window.storage";
        try {
          const r = await window.storage.get(CONFIG.STORAGE_KEY);
          const val = r && typeof r === "object" ? r.value : r;
          return typeof val === "string" && val ? JSON.parse(val) : null;
        } catch (e) { return null; } // a missing key throws in some runtimes
      }
    } catch (e) { /* fall through to localStorage */ }
    try { const s = localStorage.getItem(CONFIG.STORAGE_KEY); this.backend = "localStorage"; return s ? JSON.parse(s) : null; }
    catch (e) { this.backend = "memory"; return null; }
  },
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 220); },
  async flush() {
    clearTimeout(this.timer);
    if (!S) return;
    const json = JSON.stringify(S);
    try {
      if (this.backend === "window.storage") await window.storage.set(CONFIG.STORAGE_KEY, json);
      else if (this.backend === "localStorage") localStorage.setItem(CONFIG.STORAGE_KEY, json);
    } catch (e) {
      toast("Couldn’t save on this device. Storage may be full — try removing uploaded photos.", { tone: "warn", ms: 3600 });
    }
  },
  label() { return this.backend === "window.storage" ? "window.storage (artifact storage)" : this.backend === "localStorage" ? "This browser (localStorage)" : "Memory only — changes reset on reload"; },
};

/* Optimistic commit: mutate, re-render immediately, save in the background. */
function commit(fn, o = {}) {
  fn(S);
  Store.save();
  if (o.render !== false) Nav.invalidate({ skip: o.skip });
  else Nav.updateBadges();
}

/* ---- selectors ---- */
const getV = id => S.vehicles.find(v => v.id === id);
const getB = id => S.businesses.find(b => b.id === id);
const getBk = id => S.bookings.find(b => b.id === id);
const vName = v => `${v.make} ${v.model}`;
const vFull = v => `${v.make} ${v.model} ${v.year}`;
const hasFeat = (v, f) => (v.features || []).includes(f);
const bizLive = b => !!b && b.approval === "approved";
function isLive(v) { return !!v && v.approval === "approved" && !v.suspended && bizLive(getB(v.businessId)); }
function vehicleLocs(v) { const b = getB(v.businessId); return (b?.pickups || []).filter(l => LOC[l] && (!LOC[l].airport || hasFeat(v, "airport"))); }
function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }
const BLOCKING = new Set(["requested", "confirmed", "active"]);
const COUNTED = new Set(["confirmed", "active", "completed"]);

function seasonPct(v, key) {
  const md = key.slice(5); let pct = 0;
  for (const s of v.seasonal || []) {
    const inRange = s.from <= s.to ? (md >= s.from && md <= s.to) : (md >= s.from || md <= s.to);
    if (inRange) pct = Math.max(pct, +s.pct || 0);
  }
  return pct;
}

function checkAvail(v, start, end, ignoreId) {
  if (!v) return { ok: false, reason: "missing", label: "Not found" };
  if (v.maintenance) return { ok: false, reason: "maintenance", label: "In maintenance" };
  const s = toMs(start), e = toMs(end);
  if (!(e > s)) return { ok: false, reason: "dates", label: "Return must be after pick-up" };
  for (const bk of S.bookings) {
    if (bk.vehicleId !== v.id || bk.id === ignoreId || !BLOCKING.has(bk.status)) continue;
    if (overlaps(s, e, toMs(bk.start), toMs(bk.end))) return { ok: false, reason: "booked", label: "Booked for these dates", booking: bk };
  }
  for (const bl of v.blocks || []) {
    const ds = toMs(bl.date);
    if (overlaps(s, e, ds, ds + DAY)) return { ok: false, reason: bl.kind, label: bl.kind === "maintenance" ? "Maintenance on these dates" : "Host blocked these dates" };
  }
  return { ok: true, reason: "", label: "Available" };
}
function nextFree(v, start, end, ignoreId) {
  if (v.maintenance) return null;
  const len = toMs(end) - toMs(start);
  for (let i = 1; i <= 60; i++) { const s = fromMs(toMs(start) + i * DAY); const e = fromMs(toMs(s) + len); if (checkAvail(v, s, e, ignoreId).ok) return { start: s, end: e }; }
  return null;
}

function insPerDay(v, insId) { const d = INSURANCE.find(i => i.id === insId) || INSURANCE[0]; return Math.round(d.perDay * (TYPE_INS_MULT[v.type] || 1) / 50) * 50; }

function quote(v, start, end, o = {}) {
  const days = rentalDays(start, end);
  let tier = "daily", rate = v.rates.daily;
  if (days >= 28 && v.rates.monthly) { tier = "monthly"; rate = v.rates.monthly / 30; }
  else if (days >= 7 && v.rates.weekly) { tier = "weekly"; rate = v.rates.weekly / 7; }
  rate = Math.round(rate);
  const rental = rate * days;
  let seasonal = 0, seasonDays = 0; const s0 = toMs(start);
  for (let i = 0; i < days; i++) { const pct = seasonPct(v, dayKey(s0 + i * DAY)); if (pct) { seasonal += rate * pct / 100; seasonDays++; } }
  seasonal = Math.round(seasonal);
  const ex = o.extras || {}; const lines = []; const two = TWO_WHEEL.has(v.type);
  if (ex.childSeat > 0 && !two) lines.push({ key: "childSeat", label: `Child seat × ${ex.childSeat}`, amount: EXTRAS.childSeat.perDay * ex.childSeat * days });
  if (ex.extraDriver && !hasFeat(v, "driver")) lines.push({ key: "extraDriver", label: "Extra driver", amount: EXTRAS.extraDriver.perDay * days });
  if (ex.chauffeur && v.chauffeur && !hasFeat(v, "driver")) lines.push({ key: "chauffeur", label: "Driver / chauffeur", amount: EXTRAS.chauffeur.perDay * days });
  if (ex.delivery && hasFeat(v, "delivery")) lines.push({ key: "delivery", label: "Delivery to hotel", amount: EXTRAS.delivery.flat });
  if (o.pickup && LOC[o.pickup]?.airport) lines.push({ key: "airport", label: "Airport pick-up fee", amount: EXTRAS.airport.flat });
  const ins = INSURANCE.find(i => i.id === (o.insurance || "basic")) || INSURANCE[0];
  const ipd = insPerDay(v, ins.id); const insurance = ipd * days;
  const extrasTotal = sum(lines, l => l.amount);
  const serviceFee = CONFIG.SERVICE_FEE;
  const hostGross = rental + seasonal + extrasTotal + insurance;
  const gct = Math.round((hostGross + serviceFee) * CONFIG.GCT_RATE);
  const total = hostGross + serviceFee + gct;
  return { days, tier, rate, rental, seasonal, seasonDays, extras: lines, extrasTotal, insurance: { id: ins.id, name: ins.name, perDay: ipd, amount: insurance }, serviceFee, gct, total, deposit: v.deposit, excess: Math.round(v.deposit * ins.excessPct / 100), hostGross };
}

function rating(list) { if (!list.length) return { avg: 0, count: 0 }; return { avg: sum(list, r => r.rating) / list.length, count: list.length }; }
const vRating = id => rating(S.reviews.filter(r => r.vehicleId === id));
const bRating = id => rating(S.reviews.filter(r => r.businessId === id));
const custBookings = () => S.bookings.filter(b => b.customerId === "me");
const bizBookings = bid => S.bookings.filter(b => b.businessId === bid);
function tripPhase(bk) { if (["completed", "cancelled", "declined", "expired"].includes(bk.status)) return "past"; if (bk.status === "active") return "active"; return "upcoming"; }
function customerName(bk) { return bk.customerId === "me" ? (S.profile.name || "Demo Customer") : (bk.guest?.name || "Guest"); }
function reviewFor(bkId) { return S.reviews.find(r => r.bookingId === bkId); }
function canReview(bk) { return bk.customerId === "me" && bk.status === "completed" && toMs(bk.end) <= jmNow() && !reviewFor(bk.id); }
function threadMsgs(id) { return S.messages[id] || []; }
function unreadFor(id, side) { const last = (S.reads[id] || {})[side] || 0; return threadMsgs(id).filter(m => m.at > last && m.from !== side && m.from !== "system").length; }
function markRead(st, id, side) { st.reads[id] = st.reads[id] || {}; st.reads[id][side] = jmNow() + 1; }
function pushMsg(st, id, from, text, extra = {}) { (st.messages[id] = st.messages[id] || []).push({ from, text, at: jmNow(), ...extra }); }

/* Keeps statuses honest as time passes (runs on load and every minute). */
function tickStatuses() {
  const now = jmNow(); let changed = false;
  for (const b of S.bookings) {
    if (b.status === "confirmed" && toMs(b.end) < now) { b.status = "completed"; b.autoClosed = true; b.events.push({ at: now, text: "Trip closed automatically after the return date" }); changed = true; }
    else if (b.status === "requested" && toMs(b.start) < now) { b.status = "expired"; b.events.push({ at: now, text: "Request expired before the host replied" }); changed = true; }
  }
  return changed;
}

function cancelTerms(bk, now = jmNow()) {
  const b = getB(bk.businessId); const pol = POLICIES[b.policy] || POLICIES.moderate; const q = bk.quote;
  const hrs = (toMs(bk.start) - now) / HOUR; const rental = q.rental + q.seasonal; let fee = 0; let note;
  if (bk.status === "requested") note = "Requests can be withdrawn for free.";
  else if (pol.id === "flexible") { if (hrs >= 24) note = "Free: more than 24 hours before pick-up."; else { fee = Math.round(rental / q.days); note = "Less than 24 hours before pick-up, so one day’s rental is charged."; } }
  else if (pol.id === "moderate") { if (hrs >= 120) note = "Free: more than 5 days before pick-up."; else { fee = Math.round(rental * 0.5); note = "Less than 5 days before pick-up, so 50% of the rental is charged."; } }
  else { if (hrs >= 168) { fee = Math.round(rental * 0.5); note = "Strict policy: 50% of the rental is charged more than 7 days out."; } else { fee = rental; note = "Strict policy: within 7 days of pick-up the full rental is charged."; } }
  return { fee, refund: Math.max(0, q.deposit - fee), owed: Math.max(0, fee - q.deposit), note, policy: pol };
}
function changeTerms(bk, now = jmNow()) {
  const b = getB(bk.businessId); const hrs = (toMs(bk.start) - now) / HOUR;
  if (bk.status === "active") return { ok: true, extendOnly: true, fee: 0, note: "You’re on this trip, so you can change the return time if the vehicle is free." };
  if (bk.status === "requested") return { ok: true, fee: 0, note: "Requests can be changed for free. The host still needs to accept." };
  if (hrs < 24) return { ok: false, fee: 0, note: "Date changes close 24 hours before pick-up. Message the host to ask." };
  const fee = b.policy === "strict" ? STRICT_CHANGE_FEE : 0;
  return { ok: true, fee, note: fee ? `Strict policy: ${moneyJ(fee)} change fee.` : "Free date change under this host’s policy." };
}
function returnFees(bk, { at, fuel, km, damage, other }) {
  const v = getV(bk.vehicleId); const co = bk.checkout || { fuel: 8, km: 0 };
  const lateMin = (toMs(at) - toMs(bk.end)) / MIN; let late = 0, lateH = 0;
  if (lateMin > LATE_GRACE_MIN) { lateH = Math.ceil(lateMin / 60); late = Math.min(lateH * Math.round(v.rates.daily / 6), Math.ceil(lateH / 24) * v.rates.daily); }
  let mil = 0, extraKm = 0;
  if (v.mileage?.limit && km > co.km) { const allowed = v.mileage.limit * bk.quote.days; extraKm = Math.max(0, km - co.km - allowed); mil = extraKm * (v.mileage.extraPerKm || 40); }
  const fuelFee = Math.max(0, (co.fuel ?? 8) - fuel) * FUEL_PER_EIGHTH;
  const dmg = Math.max(0, +damage || 0), oth = Math.max(0, +other || 0);
  const total = late + mil + fuelFee + dmg + oth;
  return { late, lateH, mil, extraKm, fuelFee, damage: dmg, other: oth, total, depositRefund: Math.max(0, bk.quote.deposit - total), owed: Math.max(0, total - bk.quote.deposit) };
}
function hostRevenue(bk) {
  if (bk.status === "cancelled") return bk.cancel?.fee || 0;
  if (!COUNTED.has(bk.status)) return 0;
  return bk.quote.hostGross + (bk.checkin?.fees?.total || 0);
}
function mileageText(v) { return v.mileage?.limit ? `${v.mileage.limit} km/day` : "Unlimited km"; }
function bizName(b) { return b ? b.name : "Unknown host"; }
function bizNamePlain(b) { return b ? `${b.name}${b.sample ? " (sample)" : ""}` : "Unknown host"; }

/* host & admin stats */
function weekStartMs(ms = jmNow()) { const T0 = sod(ms); return T0 - ((new Date(T0).getUTCDay() + 6) % 7) * DAY; }
function hostStats(bid) {
  const now = jmNow(); const T0 = sod(now); const ws = weekStartMs(now); const d = new Date(T0); const ms0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const bks = bizBookings(bid); const startIn = (b, a, z) => toMs(b.start) >= a && toMs(b.start) < z;
  const revIn = (a, z) => sum(bks.filter(b => startIn(b, a, z)), hostRevenue);
  const comIn = (a, z) => sum(bks.filter(b => startIn(b, a, z) && COUNTED.has(b.status)), b => b.commission);
  const week = revIn(ws, ws + 7 * DAY), month = revIn(ms0, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const weeks = []; for (let k = 7; k >= 0; k--) { const a = ws - k * 7 * DAY; weeks.push({ label: `${new Date(a).getUTCDate()} ${MON[new Date(a).getUTCMonth()]}`, value: revIn(a, a + 7 * DAY), current: k === 0 }); }
  const vehicles = S.vehicles.filter(v => v.businessId === bid);
  const w0 = now - 30 * DAY;
  const perVehicle = vehicles.map(v => { let ms = 0; for (const b of bks) if (b.vehicleId === v.id && COUNTED.has(b.status)) { const a = Math.max(w0, toMs(b.start)), z = Math.min(now, toMs(b.end)); if (z > a) ms += z - a; } return { v, p: clamp(ms / (30 * DAY), 0, 1) }; }).sort((a, b) => b.p - a.p);
  const util = perVehicle.length ? sum(perVehicle, x => x.p) / perVehicle.length : 0;
  const q0 = now - 90 * DAY;
  const top = vehicles.map(v => ({ v, rev: sum(bks.filter(b => b.vehicleId === v.id && toMs(b.start) >= q0 && toMs(b.start) <= now + 30 * DAY), hostRevenue), trips: bks.filter(b => b.vehicleId === v.id && COUNTED.has(b.status) && toMs(b.start) >= q0).length })).sort((a, b) => b.rev - a.rev);
  const recent = bks.filter(b => toMs(b.start) >= q0 && toMs(b.start) <= now + 30 * DAY && b.status !== "requested" && b.status !== "expired");
  const cancelled = recent.filter(b => b.status === "cancelled" || b.status === "declined");
  const pickups = bks.filter(b => sod(toMs(b.start)) === T0 && ["requested", "confirmed", "active"].includes(b.status)).sort((a, b) => a.start.localeCompare(b.start));
  const returns = bks.filter(b => sod(toMs(b.end)) === T0 && ["active", "confirmed"].includes(b.status)).sort((a, b) => a.end.localeCompare(b.end));
  const reviews = S.reviews.filter(r => r.businessId === bid).sort((a, b) => b.at - a.at);
  return { week, month, weekNet: week - comIn(ws, ws + 7 * DAY), monthNet: month - comIn(ms0, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)), weekCount: bks.filter(b => startIn(b, ws, ws + 7 * DAY) && COUNTED.has(b.status)).length, weeks, perVehicle, util, top, cancelled, cancelRate: recent.length ? cancelled.length / recent.length : 0, lost: sum(cancelled, b => b.quote.hostGross - (b.cancel?.fee || 0)), pickups, returns, reviews, rating: bRating(bid), requests: bks.filter(b => b.status === "requested") };
}
function adminStats() {
  const all = S.bookings; const counted = all.filter(b => COUNTED.has(b.status));
  const gbv = sum(counted, b => b.quote.total);
  const earned = sum(all.filter(b => b.status === "completed"), b => b.commission);
  const pending = sum(all.filter(b => b.status === "confirmed" || b.status === "active"), b => b.commission);
  const fees = sum(counted, b => b.quote.serviceFee);
  const ws = weekStartMs(); const weeks = [];
  for (let k = 7; k >= 0; k--) { const a = ws - k * 7 * DAY; weeks.push({ label: `${new Date(a).getUTCDate()} ${MON[new Date(a).getUTCMonth()]}`, value: sum(counted.filter(b => toMs(b.start) >= a && toMs(b.start) < a + 7 * DAY), b => b.quote.total), current: k === 0 }); }
  const byBiz = S.businesses.map(b => ({ b, gbv: sum(counted.filter(x => x.businessId === b.id), x => x.quote.total), n: counted.filter(x => x.businessId === b.id).length })).sort((a, b) => b.gbv - a.gbv);
  return { total: all.length, active: counted.length, cancelled: all.filter(b => b.status === "cancelled").length, gbv, earned, pending, fees, weeks, byBiz,
    pendingBiz: S.businesses.filter(b => b.approval === "pending").length, unverified: S.businesses.filter(b => b.approval === "approved" && !b.verified).length,
    pendingListings: S.vehicles.filter(v => v.approval === "pending").length, openReports: S.reports.filter(r => r.status !== "resolved" && r.status !== "dismissed").length,
    live: S.vehicles.filter(isLive).length };
}
