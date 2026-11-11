/* ============ AI rental assistant ============
   Instant answers come from a local parser + the real listings. When the artifact AI is
   available (claude.use("sample"), or the legacy window.claude.complete), it adds a
   conversational answer grounded ONLY in the listing data we pass it. */
const AI = {
  mode: "checking", sample: null, history: [], busy: false, ctl: null,
  async init() {
    const c = window.claude;
    try {
      if (c && typeof c.use === "function") {
        const s = await c.use("sample");
        if (s) { this.sample = s; this.mode = "sample"; this.notify(); return; }
      }
    } catch (e) { /* fall through */ }
    if (c && typeof c.complete === "function") { this.mode = "complete"; this.notify(); return; }
    this.mode = "none"; this.notify();
  },
  available() { return this.mode === "sample" || this.mode === "complete"; },
  notify() { for (const el of $$("[data-ai-status]")) el.outerHTML = aiStatusHTML(); },
  async ask(input, o = {}) {
    if (this.mode === "sample") {
      const opts = { modelTier: "quick", cache: false }; if (o.signal) opts.signal = o.signal; if (o.onText) opts.onText = o.onText;
      if (o.json) return await this.sample.json(input, opts);
      return (await this.sample(input, opts)).text;
    }
    if (this.mode === "complete") {
      const prompt = typeof input === "string" ? input : input.map(t => (t.role === "user" ? "Human: " : "Assistant: ") + t.content).join("\n\n");
      const txt = await window.claude.complete(prompt);
      if (o.signal?.aborted) throw { code: "cancelled" };
      if (o.json) { const m = String(txt).match(/[[{][\s\S]*[\]}]/); if (!m) throw { code: "invalid_json", text: txt }; return JSON.parse(m[0]); }
      o.onText?.({ text: txt, delta: txt });
      return txt;
    }
    throw { code: "unavailable" };
  },
};

/* ---- local understanding of English + Jamaican Patois ---- */
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, twenty: 20, thirty: 30, tree: 3, fi: null };
const PATOIS_RE = /\b(mi|wi|unu|fi|di|wah|weh|nuh|deh|yuh|dem|gwaan|pickney|ting|tek|cyaan|haffi|inna|likkle|wid|seh|ah|bwoy|pon|nah|irie|smaddy|sumaddy|tideh|tumaro|yah)\b/;
/* map free text to a parish / town / airport / area */
const WHERE_ALIASES = [
  [/\b(sangster|mbj|mo ?bay airport|montego bay airport)\b/, { kind: "airport", airport: "mbj" }],
  [/\b(norman manley|nmia|kin airport|kingston airport|palisadoes)\b/, { kind: "airport", airport: "kin" }],
  [/\b(mobay|mo bay|montego( bay)?|hip strip)\b/, { kind: "town", parish: "St James", town: "Montego Bay" }],
  [/\b(ochi|ocho rios)\b/, { kind: "town", parish: "St Ann", town: "Ocho Rios" }],
  [/\b(sav|sav-la-mar|savlamar|savanna-la-mar|savanna la mar|savanna)\b/, { kind: "town", parish: "Westmoreland", town: "Savanna-la-Mar" }],
  [/\b(new kingston)\b/, { kind: "town", parish: "St Andrew", town: "New Kingston" }],
  [/\b(half way tree|hwt)\b/, { kind: "town", parish: "St Andrew", town: "Half Way Tree" }],
  [/\b(kingston|town|corporate area)\b/, { kind: "area", id: "corporate" }],
];
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function parseWhere(t) {
  for (const [re, w] of WHERE_ALIASES.slice(0, 2)) if (re.test(t)) return { ...w };
  for (const [re, w] of WHERE_ALIASES.slice(2, 7)) if (re.test(t)) return { ...w };
  const towns = TOWN_INDEX.slice().sort((a, b) => b.town.length - a.town.length);
  for (const x of towns) { const key = x.town.toLowerCase(); if (key.length >= 4 && !["reading", "junction", "bath", "mona", "hayes", "town"].includes(key) && new RegExp(`(^|[^a-z])${reEsc(key)}([^a-z]|$)`).test(t)) return { kind: "town", parish: x.parish, town: x.town }; }
  for (const [re, w] of WHERE_ALIASES.slice(7)) if (re.test(t)) return { ...w };
  for (const p of PARISHES) { const key = p.toLowerCase(); if (new RegExp(`(^|[^a-z])${reEsc(key).replace("st ", "st\\.? ")}([^a-z]|$)`).test(t)) return { kind: "parish", parish: p }; }
  return null;
}

function parseQuery(raw) {
  let t = " " + String(raw).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$.,:/'\- ]+/g, " ") + " ";
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|twenty|thirty|tree)\b/g, w => NUMW[w]);
  const r = { loc: null, type: null, seats: null, trans: null, features: [], maxPrice: null, cheap: false, start: null, end: null, days: null, childSeat: false, intents: [], patois: PATOIS_RE.test(t), bizId: null, vehicleId: null };
  r.where = parseWhere(t);
  if (r.where) r.loc = whereLabel(r.where);
  if (/\b(airport|air port|aiport|airpot|plane|flight|landing)\b/.test(t)) {
    const w = r.where;
    const west = !!w && ((w.kind === "town" && ["St James", "Westmoreland", "Hanover", "Trelawny", "St Ann"].includes(w.parish)) || (w.kind === "parish" && ["St James", "Westmoreland", "Hanover", "Trelawny", "St Ann", "St Elizabeth"].includes(w.parish)));
    const east = !!w && (w.kind === "area" || ["Kingston", "St Andrew", "St Catherine", "St Thomas", "Portland", "Clarendon", "Manchester"].includes(w.parish));
    if (!w || w.kind !== "airport") { if (east) r.where = { kind: "airport", airport: "kin" }; else if (west) r.where = { kind: "airport", airport: "mbj" }; else r.features.push("airport"); }
    if (r.where) r.loc = whereLabel(r.where);
  }
  const T = [[/\b(mini ?bus|bus|buses|coaster|coach|rosa)\b/, "bus"], [/\b(van|vans|minivan|noah|voxy|caravan|hiace)\b/, "van"], [/\b(suv|suvs|jeep|4x4|4 x 4|four wheel|prado|rav ?4|cr-?v|jimny|vitara)\b/, "suv"], [/\b(pickup truck|pick-up truck|pickups|hilux|navara|d-?max|truck)\b/, "pickup"], [/\b(scooter|scooters|moped|vespa|pcx|nmax)\b/, "scooter"], [/\b(bike|bikes|motorbike|motor bike|motorcycle)\b/, "bike"], [/\b(car|cars|sedan|hatchback|saloon|yaris|corolla|axio|swift)\b/, "car"]];
  for (const [re, id] of T) if (re.test(t)) { r.type = id; break; }
  if (!r.type && /\bpickup\b/.test(t) && !/\b(airport pickup|pickup (at|from|time|location|point|in|on))\b/.test(t)) r.type = "pickup";
  let m = t.match(/(\d+)\s*(people|persons|person|passengers|passenger|pax|seats|seater|adults|smaddy|sumaddy|heads|ah we|a we|of we|of us|guests)\b/) || t.match(/\b(?:fi|for|carry|tek|take|hold)\s+(\d+)\b(?!\s*(day|days|night|nights|week|weeks|am|pm|k|000|hour|hours|:))/) || t.match(/\b(family|party|group|crew) of (\d+)/);
  if (m) { const n = +(m[2] && /^\d+$/.test(m[2]) ? m[2] : m[1]); if (n > 0 && n < 60) r.seats = n; }
  if (/\b(automatic|auto)\b/.test(t)) r.trans = "auto"; else if (/\b(manual|stick ?shift|stick)\b/.test(t)) r.trans = "manual";
  if (/(a\/c|\bac\b|air con|aircon|air condition)/.test(t)) r.features.push("ac");
  if (/\b(driver|chauffeur|driva|drive wi|drive we|drive us)\b/.test(t) && !/\b(extra driver|driver'?s licen[cs]e|driver age)\b/.test(t)) r.features.push("driver");
  if (/\b(hotel|deliver|delivery|drop it off|bring it)\b/.test(t)) r.features.push("delivery");
  if (/(child seat|car seat|baby seat|booster|pickney seat|pickney)/.test(t)) r.childSeat = true;
  m = t.match(/(under|below|less than|max|maximum|no more than|nuh more than|cheaper than|budget of|up to)\s*(us\$|\$|j\$|jmd|usd)?\s*([\d,.]+)\s*(k|thousand)?/);
  if (m) { let n = parseFloat(m[3].replace(/,/g, "")); if (m[4]) n *= 1000; const usd = m[2] === "us$" || m[2] === "usd" || (m[2] === "$" && n < 500) || (!m[2] && n < 300); r.maxPrice = Math.round(usd ? n * S.settings.fx : n); }
  if (/\b(cheap|cheapest|budget|lowest|low price|affordable|nuh too dear|not too expensive|inexpensive|save money)\b/.test(t)) r.cheap = true;
  // dates (Jamaica time)
  const T0 = sod(jmNow()); const dowNow = new Date(T0).getUTCDay();
  const DAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
  const until = d => { let n = (d - dowNow + 7) % 7; if (n === 0) n = 7; return n; };
  let sd = null, hour = 10, minute = 0;
  if (/\b(today|tiday|tideh|this evening|tonight|right now|now)\b/.test(t)) sd = 0;
  else if (/\b(tomorrow|tomorra|tumaro|tmrw|tomoro|tomorow|tmr)\b/.test(t)) sd = 1;
  else if (/\b(this )?weekend\b/.test(t)) { sd = until(6); if (dowNow === 6) sd = 0; if (!r.days) r.days = 2; }
  else if (/\bnext week\b/.test(t)) sd = until(1);
  else {
    const dm = t.match(/\b(?:on |dis |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/);
    if (dm) sd = until(DAYS[dm[1]]);
    else {
      const mons = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
      const md = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${mons})[a-z]*`)) || t.match(new RegExp(`\\b(${mons})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
      if (md) { const day = +(/\d/.test(md[1]) ? md[1] : md[2]); const mon = mons.split("|").indexOf((/\d/.test(md[1]) ? md[2] : md[1]).slice(0, 3)); const y = new Date(T0).getUTCFullYear(); let ms = Date.UTC(y, mon, day); if (ms < T0) ms = Date.UTC(y + 1, mon, day); sd = Math.round((ms - T0) / DAY); }
      else { const dd = t.match(/\b(\d{1,2})\/(\d{1,2})\b/); if (dd) { const y = new Date(T0).getUTCFullYear(); let ms = Date.UTC(y, +dd[2] - 1, +dd[1]); if (ms < T0) ms = Date.UTC(y + 1, +dd[2] - 1, +dd[1]); sd = Math.round((ms - T0) / DAY); } }
    }
  }
  const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || t.match(/\bat (\d{1,2}):(\d{2})\b/);
  if (tm) { hour = +tm[1] % 12 + (tm[3] === "pm" ? 12 : 0); if (!tm[3]) hour = +tm[1]; minute = +(tm[2] || 0); }
  const dur = t.match(/(\d+)\s*(day|days|night|nights|dayz)\b/); if (dur) r.days = +dur[1];
  if (/\b(a|1)\s*week\b|\bweek long\b|\bfi a week\b/.test(t)) r.days = 7;
  const wk = t.match(/(\d+)\s*weeks?\b/); if (wk) r.days = 7 * +wk[1];
  if (/\b(a|1)\s*month\b/.test(t)) r.days = 30;
  const um = t.match(/\b(till|until|til|to|return(?:ing)?(?: on)?|back(?: on)?|bring it back)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
  if (sd != null) {
    r.start = fromMs(T0 + sd * DAY + hour * HOUR + minute * MIN);
    if (sd === 0 && toMs(r.start) < jmNow()) r.start = fromMs(Math.ceil((jmNow() + HOUR) / (30 * MIN)) * 30 * MIN);
    let endMs = toMs(r.start) + (r.days || 2) * DAY;
    if (um) { let n = (DAYS[um[2]] - new Date(toMs(r.start)).getUTCDay() + 7) % 7; if (n === 0) n = 7; endMs = sod(toMs(r.start)) + n * DAY + hour * HOUR + minute * MIN; r.days = n; }
    r.end = fromMs(endMs);
  }
  const I = [["cancel", /\b(cancel|cancellation|refund|cancelling)\b/], ["deposit", /\b(deposit|hold|security)\b/], ["insurance", /\b(insurance|insure|cover|cdw|excess|damage)\b/], ["age", /\b(age|how old|young|years old|minimum age)\b/], ["fuel", /\b(fuel|gas|petrol|diesel|tank)\b/], ["mileage", /\b(mileage|km|kilometre|kilometer|miles|limit)\b/], ["book", /\b(book|reserve|tek it|mi want it|i'?ll take|yes please|go ahead|confirm)\b/], ["compare", /\b(compare|vs|versus|difference|better|which one)\b/], ["price", /\b(price|cost|how much|rate|dear|expensive|total)\b/], ["licence", /\b(licen[cs]e|permit|idp)\b/], ["greet", /^\s*(hi|hello|hey|wah gwaan|wha gwaan|yo|good (morning|afternoon|evening))\b/]];
  for (const [k, re] of I) if (re.test(t)) r.intents.push(k);
  for (const b of S.businesses) { const key = b.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" "); if (key.length > 6 && t.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").includes(key)) { r.bizId = b.id; break; } }
  const STOP = new Set(["land", "cruiser", "note", "commuter", "seater", "fit"]);
  outer: for (const v of S.vehicles) {
    if (!isLive(v)) continue;
    for (const w of v.model.toLowerCase().split(/[\s()]+/).map(x => x.replace(/[^a-z0-9-]/g, "")).filter(x => x.length >= 4 && !STOP.has(x))) if (new RegExp(`\\b${w}\\b`).test(t)) { r.vehicleId = v.id; break outer; }
  }
  return r;
}
function hasSearch(p) { return !!(p.loc || p.type || p.seats || p.trans || p.features.length || p.maxPrice || p.cheap || p.start || p.vehicleId); }
function assistantSearch(p) {
  const days = p.days || rentalDays(S.search.start, S.search.end);
  const start = p.start || S.search.start; const end = p.end || fromMs(toMs(start) + days * DAY);
  const match = (v, relax = {}) => (relax.loc || !p.where || matchWhere(v, p.where)) && (!p.type || v.type === p.type || (relax.type && p.seats && v.seats >= p.seats)) && (!p.seats || v.seats >= p.seats) && (!p.trans || v.transmission === p.trans) && p.features.every(f => matchFilterFeature(v, f === "delivery" ? "hotel" : f)) && (!p.maxPrice || v.rates.daily <= p.maxPrice) && (!p.bizId || v.businessId === p.bizId);
  const pu = v => p.where?.kind === "airport" && offers(v, "airport", p.where.airport) ? p.where.airport : defaultPickup(v);
  const build = relax => S.vehicles.filter(isLive).filter(v => match(v, relax)).map(v => { const pickup = pu(v); return { v, avail: checkAvail(v, start, end), q: quote(v, start, end, { pickup, extras: p.childSeat ? { childSeat: 1 } : {} }), pickup, r: vRating(v.id) }; })
    .sort((a, z) => (z.avail.ok - a.avail.ok) || (p.cheap ? a.v.rates.daily - z.v.rates.daily : (z.r.avg - a.r.avg) || (a.v.rates.daily - z.v.rates.daily)));
  let res = build({}); let relaxed = "";
  if (p.vehicleId) { const v = getV(p.vehicleId); if (v) { const pickup = pu(v); res = [{ v, avail: checkAvail(v, start, end), q: quote(v, start, end, { pickup }), pickup, r: vRating(v.id) }, ...res.filter(x => x.v.id !== v.id)]; } }
  if (!res.some(x => x.avail.ok) && p.loc) { const alt = build({ loc: true }).filter(x => x.avail.ok); if (alt.length) { res = [...res, ...alt.filter(a => !res.some(b => b.v.id === a.v.id))]; relaxed = `Nothing free in ${whereLabel(p.where)}, so I added options from other areas.`; } }
  if (!res.some(x => x.avail.ok) && p.type && p.seats) { const alt = build({ type: true }).filter(x => x.avail.ok); if (alt.length) { res = [...res, ...alt.filter(a => !res.some(b => b.v.id === a.v.id))]; relaxed = (relaxed ? relaxed + " " : "") + `No free ${TYPE[p.type].plural.toLowerCase()} with ${p.seats}+ seats, so I included other vehicle types that fit everyone.`; } }
  return { res, start, end, relaxed };
}
function localAnswer(p, sr) {
  const lines = []; const avail = sr.res.filter(x => x.avail.ok); const pat = p.patois;
  const what = p.type ? TYPE[p.type].plural.toLowerCase() : "vehicles"; const where = !p.where ? "across Jamaica" : p.where.kind === "airport" ? `with delivery to ${AIRPORTS[p.where.airport].short}` : `in ${whereLabel(p.where)}`;
  if (hasSearch(p)) {
    if (avail.length) lines.push(`${pat ? "Yes mi friend! " : ""}${plural(avail.length, "match", "matches")} free ${where} for **${fmtDT(sr.start)} → ${fmtDT(sr.end)}**${p.seats ? ` with ${p.seats}+ seats` : ""}.`);
    else lines.push(`${pat ? "Sorry, " : ""}No ${what} are free ${where} for ${fmtDT(sr.start)} → ${fmtDT(sr.end)}.${sr.res.length ? " These match but are booked for those dates:" : " Try other dates or a nearby pick-up point."}`);
    if (sr.relaxed) lines.push(sr.relaxed);
    const best = (avail.length ? avail : sr.res).slice(0, 3);
    for (const x of best) lines.push(`- **${vFull(x.v)}** · ${getB(x.v.businessId).name}: ${money(x.v.rates.daily)}/day, ${money(x.q.total)} total, ${x.v.seats} seats${x.avail.ok ? "" : " (booked)"}`);
    if (!p.start) lines.push(`Using your search dates. Tell me a day (like “Friday 9am for 3 days”) to change them.`);
  }
  const pick = (avail[0] || sr.res[0])?.v; const b = pick ? getB(pick.businessId) : (p.bizId ? getB(p.bizId) : null);
  if (p.intents.includes("cancel")) lines.push(b ? `**Cancellation at ${b.name}:** ${POLICIES[b.policy].desc}` : `**Cancellation:** each host picks Flexible (free until 24h before), Moderate (free until 5 days before) or Strict (50% refund until 7 days before).`);
  if (p.intents.includes("deposit")) lines.push(pick ? `**Deposit for the ${vName(pick)}:** ${money(pick.deposit)}, held when you pay the deposit (mock) and released 3–5 business days after return.` : `**Deposits** range from ${money(Math.min(...S.vehicles.filter(isLive).map(v => v.deposit)))} to ${money(Math.max(...S.vehicles.filter(isLive).map(v => v.deposit)))} depending on the vehicle.`);
  if (p.intents.includes("insurance")) lines.push(`**Insurance:** Basic is included (excess = full deposit), Standard CDW halves the excess, Premium makes it ${money(0)}.${pick ? ` For the ${vName(pick)}: Standard ${money(insPerDay(pick, "standard"))}/day, Premium ${money(insPerDay(pick, "premium"))}/day.` : ""}`);
  if (p.intents.includes("age")) lines.push(pick ? `**Minimum age for the ${vName(pick)}:** ${pick.minAge}.` : `**Minimum ages** run from ${Math.min(...S.vehicles.filter(isLive).map(v => v.minAge))} to ${Math.max(...S.vehicles.filter(isLive).map(v => v.minAge))}, set per vehicle.`);
  if (p.intents.includes("fuel") && b) lines.push(`**Fuel (${b.name}):** ${FUEL_POLICIES[b.fuelPolicy].desc}`);
  if (p.intents.includes("mileage") && pick) lines.push(`**Mileage:** ${pick.mileage.limit ? `${pick.mileage.limit} km/day, then ${moneyJ(pick.mileage.extraPerKm)}/km` : "unlimited"} on the ${vName(pick)}.`);
  if (p.intents.includes("licence")) lines.push(`**Licence:** every booking needs the driver’s licence number and expiry, and it must be valid on the return date.`);
  if (p.childSeat) lines.push(`Child seats are ${money(EXTRAS.childSeat.perDay)}/day each (not on bikes or scooters).`);
  if (!lines.length) lines.push(p.intents.includes("greet") ? `Wah gwaan! Tell me where you’re picking up, when, and how many people. Example: “Mi need a van fi 10 people from MoBay airport Friday.”` : `I can search the listings, compare vehicles and explain deposits, insurance and cancellation. Try “cheapest automatic car in Kingston this weekend”.`);
  const ids = hasSearch(p) ? (avail.length ? avail : sr.res).slice(0, 3).map(x => x.v.id) : [];
  return { text: lines.join("\n"), ids };
}
function aiRules(p, sr) {
  const rows = S.vehicles.filter(isLive).map(v => {
    const b = getB(v.businessId); const r = vRating(v.id); const x = sr.res.find(y => y.v.id === v.id);
    const av = x ? x.avail : checkAvail(v, sr.start, sr.end); const q = x ? x.q : quote(v, sr.start, sr.end, {});
    return { id: v.id, vehicle: vFull(v), type: v.type, seats: v.seats, transmission: v.transmission, host: b.name, host_verified: b.verified, located_in: vLoc(v), pickup_options: pickupOptions(v).map(o => `${o.label}${o.fee ? ` (+J$${o.fee})` : " (free)"}`), payment_methods: acceptedMethods(b).map(m => PAYMENT_METHODS[m].name), daily_jmd: v.rates.daily, weekly_jmd: v.rates.weekly, deposit_jmd: v.deposit, mileage: v.mileage.limit ? `${v.mileage.limit} km/day then J$${v.mileage.extraPerKm}/km` : "unlimited", min_age: v.minAge, features: v.features.map(f => FEAT[f].name), chauffeur_extra: !!v.chauffeur && !hasFeat(v, "driver"), instant_book: v.instantBook, rating: r.count ? +r.avg.toFixed(1) : null, reviews: r.count, cancellation: POLICIES[b.policy].name, fuel_policy: FUEL_POLICIES[b.fuelPolicy].name, free_for_requested_dates: av.ok, total_jmd_for_requested_dates: q.total };
  });
  const policies = { cancellation: Object.fromEntries(Object.values(POLICIES).map(p => [p.name, p.desc])), fuel: Object.fromEntries(Object.values(FUEL_POLICIES).map(f => [f.name, f.desc])), insurance_per_day_jmd_for_a_car: { Basic: "included, excess = full deposit", "Standard CDW": "1500, excess = 50% of deposit", Premium: "2800, excess = 0" }, insurance_multiplier_by_type: TYPE_INS_MULT, extras_jmd: { child_seat_per_day: 800, extra_driver_per_day: 1000, chauffeur_per_day: 6500, hotel_delivery_flat: 3500, airport_pickup_fee_flat: 2500 }, service_fee_jmd: CONFIG.SERVICE_FEE, gct: "15% on rental, extras, cover and service fee", late_returns: "59-minute grace, then charged by the hour", reviews: "only from completed trips", licence: "licence number + expiry required before booking; must be valid on return date", deposit_release: "3-5 business days after return (mock payments in this demo)" };
  return `You are the ${CONFIG.APP_NAME} rental assistant inside a DEMO web app that connects customers with vehicle rental businesses in Jamaica. Every host, vehicle, price and review is SAMPLE data.

Hard rules:
1. Use ONLY the DATA and POLICIES below. Never invent vehicles, prices, fees, availability, hosts, phone numbers, addresses or policies. If something isn't in the data, say the app doesn't have that information.
2. Availability: "free_for_requested_dates" refers to ${fmtDT(sr.start)} → ${fmtDT(sr.end)} (Jamaica time). Only call a vehicle available if that field is true. Totals in "total_jmd_for_requested_dates" include service fee and 15% GCT but not extras or insurance upgrades.
3. Money is Jamaican dollars (J$). US$ = J$ ÷ ${S.settings.fx}. ${S.settings.currency === "USD" ? "The customer prefers US$, so give US$ after the J$ figure." : "Show J$."} Mention once that prices are sample prices.
4. If the customer writes Jamaican Patois, reply in warm, light Patois that is still easy to read. Otherwise reply in clear, friendly English.
5. Be brief: at most about 110 words, short lines, "- " bullets for options, **bold** for vehicle names. Recommend at most 3 vehicles and say why (seats, price, pick-up point, policy).
6. End with a line "SHOW: id1,id2" listing the vehicle ids you recommended (omit if none).
7. If the customer clearly wants to book one specific vehicle, add a line "BOOK: <id>". The app then opens the booking form with the requested dates. Never claim a booking is made or confirmed.
8. Today in Jamaica: ${fmtDT(nowStr())}.

POLICIES: ${JSON.stringify(policies)}
The app's reading of the latest message: ${JSON.stringify({ location: p.where ? whereLabel(p.where) : null, type: p.type, min_seats: p.seats, transmission: p.trans, features: p.features, max_daily_jmd: p.maxPrice, cheapest_first: p.cheap, dates: `${sr.start} → ${sr.end}`, patois: p.patois })}
DATA (live listings): ${JSON.stringify(rows)}`;
}
function parseAIText(text) {
  const out = { body: text, show: [], book: null };
  const sm = text.match(/^\s*SHOW:\s*(.+)$/mi); if (sm) out.show = sm[1].split(/[,\s]+/).map(x => x.trim()).filter(id => getV(id) && isLive(getV(id))).slice(0, 3);
  const bm = text.match(/^\s*BOOK:\s*(\S+)/mi); if (bm && getV(bm[1].trim()) && isLive(getV(bm[1].trim()))) out.book = bm[1].trim();
  out.body = text.replace(/^\s*(SHOW|BOOK):.*$/gmi, "").replace(/\n?\s*(S(H(O(W)?)?)?|B(O(O(K)?)?)?)\s*$/, "").trim();
  return out;
}
function mdLite(s) {
  const lines = esc(s).split(/\n+/); let html = "", inList = false;
  for (const raw of lines) { const l = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); if (/^\s*[-•]\s+/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${l.replace(/^\s*[-•]\s+/, "")}</li>`; } else { if (inList) { html += "</ul>"; inList = false; } if (l.trim()) html += `<p>${l}</p>`; } }
  return html + (inList ? "</ul>" : "");
}
function aiMsgHTML(m, i) {
  if (m.role === "user") return `<div class="ai-b user">${esc(m.text)}</div>`;
  const cards = (m.cards || []).map(id => getV(id)).filter(Boolean);
  const src = m.local ? `<div class="src">${icon("bolt")}Instant results · from the listings</div>` : `<div class="src">${icon("sparkles")}Assistant${m.error ? " · offline" : ""}</div>`;
  const body = m.pending && !m.text ? `<div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line"></div>` : `<div class="txt">${mdLite(m.text || "")}</div>`;
  return `<div class="ai-b bot ${m.local ? "local" : ""} ${m.error ? "err" : ""}" data-mi="${i}">${src}${body}
    ${cards.length ? `<div class="hscroll mini-cards no-drag">${cards.map(v => miniCard(v, { start: m.start, end: m.end, pickup: m.pickup, book: true })).join("")}</div>` : ""}
    ${m.book && getV(m.book) ? `<button type="button" class="btn block pill press book-cta" data-act="aiBook" data-id="${m.book}" data-start="${m.start}" data-end="${m.end}" data-pickup="${m.pickup || ""}">${icon("bolt")}Book the ${esc(vName(getV(m.book)))}</button>` : ""}</div>`;
}
const AI_SUGGESTIONS = ["Mi need a van fi 10 people from MoBay airport Friday", "Cheapest automatic car in Kingston this weekend", "Compare SUVs in Ocho Rios for 5 days", "What’s the deposit and cancellation policy for scooters in Negril?", "Bus with driver for a church trip of 20 people next Saturday"];
const AssistantView = {
  id: "assistant", hideTabs: true, pageClass: "ai-page", title: () => "Rental assistant",
  navRight: () => AI.history.length ? `<button type="button" class="nav-btn text press" data-act="clear">Clear</button>` : "",
  render() {
    return `<div class="inner">
      ${aiStatusHTML()}
      ${AI.history.length ? "" : `<div class="ai-hero"><span class="brand-mark">${BRAND_SVG}</span><h2>Ask in English or Patois</h2><p>I search the listings in this app, compare options and explain deposits, cover and cancellation. I never make up prices or availability. All data is SAMPLE.</p></div>
        <div class="ai-sugg stagger go">${AI_SUGGESTIONS.map((s, i) => `<button type="button" class="press" style="--i:${i}" data-act="ask" data-q="${esc(s)}">${icon("sparkles")}<span>${esc(s)}</span></button>`).join("")}</div>`}
      <div class="ai-msgs" id="aiMsgs">${AI.history.map(aiMsgHTML).join("")}</div></div>`;
  },
  fixed: () => `<div class="composer glass ai-composer"><div class="comp-row"><input id="aiInput" type="text" placeholder="Ask about vehicles, prices, policies…" autocomplete="off" enterkeyhint="send" aria-label="Ask the assistant"><button type="button" class="send blue press ${AI.busy ? "stop" : ""}" data-act="${AI.busy ? "stop" : "send"}" aria-label="${AI.busy ? "Stop" : "Send"}">${icon(AI.busy ? "stop" : "send")}</button></div></div>`,
  mount(ctx) {
    requestAnimationFrame(() => { if (AI.history.length) ctx.scroller.scrollTop = ctx.scroller.scrollHeight; });
    ctx.fixed.querySelector("#aiInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); AssistantView.actions.send(null, ctx); } });
  },
  actions: {
    send: (t, ctx) => { const inp = ctx.fixed.querySelector("#aiInput"); const q = inp.value.trim(); if (!q || AI.busy) return; inp.value = ""; aiSend(ctx, q); },
    ask: (t, ctx) => { if (!AI.busy) aiSend(ctx, t.dataset.q); },
    stop: () => AI.ctl?.abort(),
    clear: (t, ctx) => { AI.ctl?.abort(); AI.history = []; renderPage(ctx); },
    aiBook: (t) => { const v = getV(t.dataset.id); if (v) openBooking(v, { start: t.dataset.start, end: t.dataset.end, pickup: t.dataset.pickup || undefined }); },
  },
};
Actions.aiBook = AssistantView.actions.aiBook;
function setSendBtn(ctx) { const b = ctx.fixed.querySelector(".send"); if (!b) return; b.dataset.act = AI.busy ? "stop" : "send"; b.classList.toggle("stop", AI.busy); b.innerHTML = icon(AI.busy ? "stop" : "send"); b.setAttribute("aria-label", AI.busy ? "Stop" : "Send"); }
function appendAI(ctx, m) {
  const box = ctx.content.querySelector("#aiMsgs"); if (!box) return null;
  const hero = ctx.content.querySelector(".ai-hero"); if (hero) { hero.remove(); ctx.content.querySelector(".ai-sugg")?.remove(); Nav.navRight.innerHTML = AssistantView.navRight(ctx); }
  const tmp = document.createElement("div"); tmp.innerHTML = aiMsgHTML(m, AI.history.indexOf(m)); const el = tmp.firstElementChild; if (!reduced()) el.style.animation = "bubbleIn .4s var(--ease) both";
  box.appendChild(el); hydrate(el); ctx.scroller.scrollTo({ top: ctx.scroller.scrollHeight, behavior: reduced() ? "auto" : "smooth" }); return el;
}
function updateAI(ctx, m, el) { if (!el || !el.isConnected) return; const tmp = document.createElement("div"); tmp.innerHTML = aiMsgHTML(m, AI.history.indexOf(m)); const fresh = tmp.firstElementChild; el.replaceWith(fresh); hydrate(fresh); return fresh; }
async function aiSend(ctx, text) {
  const u = { role: "user", text }; AI.history.push(u); appendAI(ctx, u); haptic(5);
  const p = parseQuery(text); const sr = assistantSearch(p);
  const pickup = p.where?.kind === "airport" ? p.where.airport : "";
  const lastLocalIds = [];
  if (hasSearch(p) || p.intents.length || !AI.available()) {
    const la = localAnswer(p, sr);
    const lm = { role: "assistant", local: true, text: la.text, cards: la.ids, start: sr.start, end: sr.end, pickup, book: !p.intents.includes("book") ? null : (p.vehicleId && checkAvail(getV(p.vehicleId), sr.start, sr.end).ok ? p.vehicleId : la.ids.length === 1 ? la.ids[0] : null) };
    AI.history.push(lm); appendAI(ctx, lm); lastLocalIds.push(...la.ids);
  }
  if (!AI.available()) {
    if (AI.mode === "checking") { const n = { role: "assistant", text: "Still connecting to the artifact AI, so this answer came from instant local search. Ask again in a moment for a fuller reply.", error: true }; AI.history.push(n); appendAI(ctx, n); }
    return;
  }
  const m = { role: "assistant", text: "", pending: true, start: sr.start, end: sr.end, pickup }; AI.history.push(m); let el = appendAI(ctx, m);
  AI.busy = true; setSendBtn(ctx); AI.ctl = new AbortController();
  const hist = AI.history.slice(0, -1).filter(x => !x.local && !x.error && x.text).slice(-8).map(x => ({ role: x.role === "user" ? "user" : "assistant", content: x.text }));
  if (hist.length && hist[hist.length - 1].role === "user" && hist[hist.length - 1].content === text) hist.pop();
  const turns = [{ role: "user", content: aiRules(p, sr) }, ...hist, { role: "user", content: text }];
  try {
    const full = await AI.ask(turns, { signal: AI.ctl.signal, onText: ({ text: tx }) => { const parsed = parseAIText(tx); m.text = parsed.body; if (m.pending) { m.pending = false; } el = updateAI(ctx, m, el) || el; } });
    const parsed = parseAIText(full); m.text = parsed.body || "Here’s what I found."; m.pending = false;
    m.cards = parsed.show.filter(id => !lastLocalIds.includes(id)); if (!m.cards.length && !lastLocalIds.length) m.cards = parsed.show;
    m.book = parsed.book; el = updateAI(ctx, m, el) || el;
  } catch (e) {
    m.pending = false; m.error = true; const code = e && e.code;
    if (code === "cancelled") m.text = (e.text ? parseAIText(e.text).body + "\n\n" : "") + "Stopped.";
    else if (code === "not_granted" || code === "sampling_disabled" || code === "capability_disabled" || code === "not_declared") { AI.mode = "denied"; AI.notify(); m.text = "AI access isn’t allowed in this view, so I’ll stick to instant answers from the listings."; }
    else if (code === "rate_limited") m.text = "The AI is busy right now. The instant results above come straight from the listings — try again in a minute.";
    else m.text = (e && e.text ? parseAIText(e.text).body + "\n\n" : "") + "I couldn’t reach the AI just now. The instant results above come straight from the listings.";
    updateAI(ctx, m, el);
  } finally { AI.busy = false; AI.ctl = null; setSendBtn(ctx); ctx.scroller.scrollTo({ top: ctx.scroller.scrollHeight, behavior: reduced() ? "auto" : "smooth" }); }
}

async function suggestReplies(bk) {
  if (!AI.available()) throw { code: "unavailable" };
  const b = getB(bk.businessId), v = getV(bk.vehicleId); const msgs = threadMsgs(bk.id).slice(-8);
  const facts = { host: b.name, hours: b.hours, whatsapp: b.whatsapp, located_in: vLoc(v), pickup_options: pickupOptions(v).map(o => `${o.label}${o.fee ? ` (+J$${o.fee})` : ""}`), payment_methods: acceptedMethods(b).map(m => PAYMENT_METHODS[m].name), booking_payment: paymentLine(bk.payment), vehicle: vFull(v), seats: v.seats, driver_included: hasFeat(v, "driver"), booking: { ref: bk.ref, status: STATUS[bk.status].host, pickup: fmtDT(bk.start), return: fmtDT(bk.end), location: pickupLong(bk), customer: customerName(bk) }, extras_jmd: { child_seat_per_day: 800, extra_driver_per_day: 1000, chauffeur_per_day: 6500 }, deposit_jmd: v.deposit, cancellation: POLICIES[b.policy].desc, fuel: FUEL_POLICIES[b.fuelPolicy].desc };
  const prompt = `You help a vehicle rental host in Jamaica reply to a customer inside a DEMO app (all data is sample data). Write 3 short reply options the HOST could send next. Each under 35 words, friendly and professional; light Jamaican warmth is fine. Use ONLY these facts and never invent prices, times or policies. If something isn't covered, the reply should say the host will check and confirm.
FACTS: ${JSON.stringify(facts)}
CONVERSATION (oldest first): ${msgs.map(m => `${m.from}: ${m.text}`).join("\n") || "(no messages yet)"}
Reply with only a JSON array of 3 strings.`;
  const arr = await AI.ask(prompt, { json: true });
  const out = (Array.isArray(arr) ? arr : []).filter(x => typeof x === "string" && x.trim()).map(x => x.trim()).slice(0, 3);
  if (!out.length) throw { code: "empty_completion" };
  return out;
}
