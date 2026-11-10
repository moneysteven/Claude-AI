/* ============ booking flow, trips, changes, cancellation, receipts, reviews ============ */
function defaultPickup(v) { const locs = vehicleLocs(v); return locs.includes(S.search.loc) ? S.search.loc : locs.find(l => !LOC[l].airport) || locs[0]; }

function openBooking(v, o = {}) {
  if (!v) return;
  if (Nav.role !== "customer") { toast("Switch to Customer to book", { tone: "warn" }); return; }
  const b = getB(v.businessId); const P = S.profile;
  const st = {
    step: 0, dir: 1, start: o.start || S.search.start, end: o.end || S.search.end,
    pickup: o.pickup && vehicleLocs(v).includes(o.pickup) ? o.pickup : defaultPickup(v),
    extras: { childSeat: 0, extraDriver: false, chauffeur: false, delivery: false, hotel: "" }, insurance: "basic",
    driver: { name: P.name || "", phone: P.phone || "", licence: P.licence || "", expiry: P.licenceExpiry || "", age: P.age || 25 },
    saveProfile: true, agree: false, paying: false, booking: null, errors: [],
  };
  const STEPS = ["Trip details", "Driver details", "Review & policies", "Pay deposit", "Confirmed"];
  const Q = () => quote(v, st.start, st.end, { extras: st.extras, insurance: st.insurance, pickup: st.pickup });
  const AV = () => checkAvail(v, st.start, st.end);
  const go = (s, n) => { st.dir = n > st.step ? 1 : -1; st.step = n; s.setTitle(STEPS[n]); s.refresh({ keepScroll: false }); s.body.scrollTop = 0; };
  const updateLive = s => { const box = s.body.querySelector("#bkPrice"); if (box) box.innerHTML = breakdownHTML(Q()); const a = s.body.querySelector("#bkAvail"); if (a) a.outerHTML = availLine(); s.refreshFoot(); };
  const availLine = () => { const av = AV(); if (av.ok) return `<div class="status-line ok" id="bkAvail">${icon("checkCircle")}Available · no clashes with other bookings</div>`; const nx = nextFree(v, st.start, st.end); return `<div class="status-line no" id="bkAvail">${icon("ban")}<span>${esc(av.label)}.${nx ? ` Next free from ${fmtDate(nx.start)}.` : ""}</span>${nx ? `<button type="button" class="btn sm plain press" data-act="useNext" data-s="${nx.start}" data-e="${nx.end}">Use</button>` : ""}</div>`; };
  const validateDriver = () => {
    const d = st.driver; const e = [];
    if (d.name.trim().length < 2) e.push(["name", "Enter the driver’s full name as on the licence."]);
    if (digits(d.phone).length < 7) e.push(["phone", "Enter a phone number the host can reach."]);
    if (d.licence.trim().length < 5) e.push(["licence", "Enter the driver’s licence number."]);
    if (!d.expiry) e.push(["expiry", "Add the licence expiry date."]);
    else if (d.expiry < st.end.slice(0, 7)) e.push(["expiry", "The licence expires before the return date."]);
    if (!(+d.age >= v.minAge)) e.push(["age", `This vehicle needs a driver aged ${v.minAge} or older.`]);
    return e;
  };
  const steps = [
    () => {
      const q = Q(); const two = TWO_WHEEL.has(v.type);
      const ex = st.extras;
      return `<div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))}</b><small>${esc(b.name)} ${verified(b)} ${smp(b.sample)}</small></div></div>
        <h3 class="group-title">Dates</h3>
        <div class="group icons">
          <button type="button" class="row tap" data-act="dates" data-which="start">${icoBox("cal")}<span class="lbl"><small>Pick-up</small><b>${fmtDT(st.start)}</b></span>${chev()}</button>
          <button type="button" class="row tap" data-act="dates" data-which="end">${icoBox("cal", "#5856D6")}<span class="lbl"><small>Return · ${plural(q.days, "day")}</small><b>${fmtDT(st.end)}</b></span>${chev()}</button>
        </div>
        ${availLine()}
        <h3 class="group-title">Pick-up location</h3>
        <div class="group">${vehicleLocs(v).map(l => `<button type="button" class="row tap ${st.pickup === l ? "on" : ""}" data-act="pickup" data-v="${l}"><span class="radio-dot"></span><span class="lbl"><b>${esc(LOC[l].name)}</b><small>${esc(b.pickupNotes?.[l] || LOC[l].parish)}${LOC[l].airport ? ` · +${moneyJ(EXTRAS.airport.flat)} airport fee` : ""}</small></span></button>`).join("")}</div>
        <h3 class="group-title">Extras</h3>
        <div class="group">
          ${hasFeat(v, "driver") ? `<div class="row"><span class="lbl"><b>Driver included</b><small>A professional driver comes with this vehicle</small></span>${icon("check", "accent")}</div>` : ""}
          ${two ? `<div class="row"><span class="lbl"><b>Helmets included</b><small>Two helmets come with every rental</small></span>${icon("check", "accent")}</div>` : `<div class="row"><span class="lbl"><b>Child seat</b><small>${money(EXTRAS.childSeat.perDay)}/day each</small></span>${stepper("childSeat", ex.childSeat, 0, 3)}</div>`}
          ${!hasFeat(v, "driver") && !two ? `<label class="row"><span class="lbl"><b>Extra driver</b><small>${money(EXTRAS.extraDriver.perDay)}/day · must also meet the age rule</small></span>${switchEl("x_ed", ex.extraDriver, 'data-change="ex" data-k="extraDriver"', "Extra driver")}</label>` : ""}
          ${v.chauffeur && !hasFeat(v, "driver") ? `<label class="row"><span class="lbl"><b>Driver / chauffeur</b><small>${money(EXTRAS.chauffeur.perDay)}/day · sit back and enjoy the ride</small></span>${switchEl("x_ch", ex.chauffeur, 'data-change="ex" data-k="chauffeur"', "Driver or chauffeur")}</label>` : ""}
          ${hasFeat(v, "delivery") ? `<label class="row"><span class="lbl"><b>Delivery to hotel</b><small>${money(EXTRAS.delivery.flat)} flat</small></span>${switchEl("x_dl", ex.delivery, 'data-change="ex" data-k="delivery"', "Delivery to hotel")}</label>
            <label class="frow" id="hotelRow" ${ex.delivery ? "" : "hidden"}><span>Hotel</span><input type="text" placeholder="Hotel name and area" value="${esc(ex.hotel)}" data-input="hotel" autocomplete="off"></label>` : ""}
        </div>
        <h3 class="group-title">Insurance</h3>
        <div class="group">${INSURANCE.map(i => { const ppd = insPerDay(v, i.id); return `<button type="button" class="row tap ${st.insurance === i.id ? "on" : ""}" data-act="ins" data-v="${i.id}"><span class="radio-dot"></span><span class="lbl"><b>${i.name}</b><small>${i.desc} Excess ${money(Math.round(v.deposit * i.excessPct / 100))}.</small></span><span class="val strong">${ppd ? `${money(ppd)}/day` : "Included"}</span></button>`; }).join("")}</div>
        <h3 class="group-title">Price</h3><div id="bkPrice">${breakdownHTML(q)}</div>`;
    },
    () => {
      const d = st.driver; const err = Object.fromEntries(st.errors);
      return `<p class="note" style="margin-bottom:4px">${icon("lock")}<span>Every host needs the driver’s licence details before booking. They’re shared only with ${esc(b.name)}.</span></p>
        <div class="group" style="margin-top:12px">
          <label class="frow ${err.name ? "err" : ""}"><span>Full name</span><input type="text" value="${esc(d.name)}" placeholder="As on licence" data-input="drv" data-k="name" autocomplete="name"></label>
          <label class="frow ${err.phone ? "err" : ""}"><span>Phone</span><input type="tel" value="${esc(d.phone)}" placeholder="+1 876…" data-input="drv" data-k="phone" autocomplete="tel"></label>
          <label class="frow ${err.licence ? "err" : ""}"><span>Licence no.</span><input type="text" value="${esc(d.licence)}" placeholder="Licence number" data-input="drv" data-k="licence" autocomplete="off" autocapitalize="characters"></label>
          <div class="frow ${err.expiry ? "err" : ""}"><span>Licence expiry</span><button type="button" class="pick" data-act="expiry">${d.expiry ? fmtMonthYear(d.expiry) : "Choose"}</button></div>
          <div class="frow ${err.age ? "err" : ""}"><span>Driver age</span><span style="flex:1"></span>${stepper("age", +d.age || 25, 16, 90)}</div>
        </div>
        <p class="group-foot">Minimum age for this vehicle: <b>${v.minAge}</b>. The licence must be valid until ${fmtDate(st.end, true)}.</p>
        ${st.errors.length ? `<div class="errs">${st.errors.map(([, m]) => `<div class="err-msg">${icon("alert")}${m}</div>`).join("")}</div>` : ""}
        <button type="button" class="link" data-act="sampleDriver">${icon("sparkles")}Fill sample driver details</button>
        <div class="group" style="margin-top:8px"><label class="row"><span class="lbl"><b>Save to my profile</b><small>Prefill these next time</small></span>${switchEl("x_sp", st.saveProfile, 'data-change="saveProf"', "Save to my profile")}</label></div>`;
    },
    () => {
      const q = Q(); const pol = POLICIES[b.policy]; const fuel = FUEL_POLICIES[b.fuelPolicy]; const ins = INSURANCE.find(i => i.id === st.insurance);
      return `<div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))}</b><small>${esc(b.name)} ${verified(b)} · ${v.instantBook ? "Instant book" : "Host approval needed"}</small></div></div>
        <div class="group" style="margin-top:12px">
          ${row({ label: "Pick-up", value: fmtDT(st.start) })}${row({ label: "Return", value: fmtDT(st.end) })}
          ${row({ label: "Location", value: esc(LOC[st.pickup].short) })}${row({ label: "Driver", value: `${esc(st.driver.name)} · ${st.driver.age}` })}
          ${row({ label: "Licence", value: `•••• ${esc(st.driver.licence.slice(-4))} · exp. ${fmtMonthYear(st.driver.expiry)}` })}
          ${st.extras.delivery && st.extras.hotel ? row({ label: "Deliver to", value: esc(st.extras.hotel) }) : ""}
        </div>
        <h3 class="group-title">Price</h3>${breakdownHTML(q)}
        <h3 class="group-title">Before you pay</h3>
        <div class="policy">${icon("lock")}<div><b>Deposit & damage</b><p>A refundable deposit of <b>${money(q.deposit)}</b> is held (mock). With ${ins.name} your damage excess is <b>${money(q.excess)}</b>. ${esc(b.damagePolicy)}</p></div></div>
        <div class="policy">${icon("cal")}<div><b>${pol.name} cancellation</b><p>${pol.desc}</p></div></div>
        <div class="policy">${icon("fuel")}<div><b>Fuel, mileage & late returns</b><p>${fuel.desc} ${v.mileage.limit ? `${v.mileage.limit} km/day included, then ${moneyJ(v.mileage.extraPerKm)}/km.` : "Unlimited kilometres."} Returns more than 59 minutes late are charged by the hour.</p></div></div>
        ${!v.instantBook ? `<div class="banner info" style="margin-top:10px">${icon("info")}<span>${esc(b.name)} reviews requests, usually within ${b.responseMins || 30} minutes. If they decline, your deposit hold is released (mock).</span></div>` : ""}
        <div class="group" style="margin-top:12px"><label class="row"><span class="lbl"><b>I agree to the deposit, damage and cancellation policies</b></span>${switchEl("x_ag", st.agree, 'data-change="agree"', "Agree to policies")}</label></div>`;
    },
    () => {
      const q = Q();
      return `<div class="mock-banner">${icon("info")}<span>MOCK PAYMENT · demo only. No card details are collected and no money moves.</span></div>
        <div class="paycard" aria-hidden="true"><div class="pc-top"><span>${esc(CONFIG.APP_NAME)} Demo Wallet</span>${icon("lock")}</div><div class="pc-num">•••• •••• •••• DEMO</div><div class="pc-bot"><span>${esc(st.driver.name || "Demo Customer")}</span><span>Mock only</span></div></div>
        <div class="group">
          <div class="row"><span class="lbl"><b>Due now</b><small>Refundable deposit hold</small></span><span class="val strong">${money(q.deposit)}</span></div>
          <div class="row"><span class="lbl"><b>Due at pick-up</b><small>Rental, extras, cover, fees & GCT</small></span><span class="val strong">${money(q.total)}</span></div>
        </div>
        <p class="group-foot">${v.instantBook ? "Instant book: your booking is confirmed as soon as the deposit is paid." : "Request: the host has to accept. If they decline, the deposit hold is released."} The deposit is released 3–5 business days after return if there’s no damage (sample policy).</p>`;
    },
    () => {
      const bk = st.booking; const conf = bk.status === "confirmed";
      return `<div class="confirm">
        <svg class="check-anim ${conf ? "" : "req"}" viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="48"/><path d="${conf ? "M31 54 L46 68 L74 38" : "M52 30 V56 L66 64"}"/></svg>
        <h2>${conf ? "Booking confirmed" : "Request sent"}</h2>
        <span class="ref">${bk.ref}</span>
        <p>${esc(vFull(v))} · ${fmtRange(bk.start, bk.end)}</p>
        <p>${conf ? `Bring the licence you entered. ${esc(b.name)} will meet you at ${esc(LOC[bk.pickup].name)}.` : `${esc(b.name)} usually replies within ${b.responseMins || 30} minutes. Track it in Trips and Messages.`}</p>
        <p class="muted" style="font-size:13px">Deposit ${money(bk.quote.deposit)} paid (mock) · ${money(bk.quote.total)} due at pick-up</p>
      </div>`;
    },
  ];
  const s = Sheets.open({
    title: STEPS[0], size: "full", local: st,
    left: `<button type="button" class="sh-link press" data-act="prev" ${st.step ? "" : "hidden"}>Back</button>`,
    render: () => `<div class="steps-prog" aria-label="Step ${st.step + 1} of 5">${STEPS.map((_, i) => `<i class="${i <= st.step ? "on" : ""}"></i>`).join("")}</div><div class="${reduced() ? "" : st.dir > 0 ? "step-in-r" : "step-in-l"}">${steps[st.step]()}</div>`,
    mount: s => { const back = s.el.querySelector('[data-act="prev"]'); if (back) back.hidden = !(st.step > 0 && st.step < 4); },
    footer: () => {
      const q = Q();
      if (st.step === 4) return `<div class="btn-row"><button type="button" class="btn pill plain press" data-act="msg">${icon("chat")}Message host</button><button type="button" class="btn pill press" data-act="viewTrip">View trip</button></div>`;
      if (st.step === 3) return `<button type="button" class="btn block pill gold press ${st.paying ? "loading" : ""}" data-act="pay">${icon("lock")}${st.paying ? "Processing mock payment…" : `Pay deposit ${money(q.deposit)} (mock)`}</button>`;
      const dis = (st.step === 0 && !AV().ok) || (st.step === 2 && !st.agree);
      return `<div class="bk-foot"><div class="bk-total"><b>${money(q.total)}</b><small>Total · ${money(q.deposit)} deposit held</small></div><button type="button" class="btn pill press" data-act="next" ${dis ? "disabled" : ""}>Continue</button></div>`;
    },
    actions: {
      dates: async (t, s) => { const r = await pickTrip({ start: st.start, end: st.end, which: t.dataset.which }); if (r) { st.start = r.start; st.end = r.end; s.refresh(); } },
      useNext: (t, s) => { st.start = t.dataset.s; st.end = t.dataset.e; s.refresh(); toast("Dates updated"); },
      pickup: (t, s) => { st.pickup = t.dataset.v; for (const r of $$('[data-act="pickup"]', s.body)) r.classList.toggle("on", r.dataset.v === st.pickup); haptic(4); updateLive(s); },
      ins: (t, s) => { st.insurance = t.dataset.v; for (const r of $$('[data-act="ins"]', s.body)) r.classList.toggle("on", r.dataset.v === st.insurance); haptic(4); updateLive(s); },
      expiry: async (t, s) => { const r = await pickMonthYear({ value: st.driver.expiry }); if (r) { st.driver.expiry = r; s.refresh(); } },
      sampleDriver: (t, s) => { Object.assign(st.driver, { name: st.driver.name || "Demo Customer", phone: st.driver.phone || "+1 876-555-0199", licence: "SAMPLE-DL-204518", expiry: "2029-06", age: Math.max(+st.driver.age || 0, v.minAge, 30) }); st.errors = []; s.refresh(); toast("Sample driver details added"); },
      prev: (t, s) => { if (st.step > 0 && st.step < 4) go(s, st.step - 1); },
      next: (t, s) => {
        if (st.step === 0) { if (!AV().ok) { toast("Those dates clash with another booking", { tone: "warn" }); return; } if (st.extras.delivery && !st.extras.hotel.trim()) { toast("Add the hotel for delivery", { tone: "warn" }); s.body.querySelector('[data-input="hotel"]')?.focus(); return; } go(s, 1); }
        else if (st.step === 1) { st.errors = validateDriver(); if (st.errors.length) { s.refresh(); haptic(20); if (!reduced()) s.el.animate([{ transform: "translateX(0)" }, { transform: "translateX(6px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" }], { duration: 280 }); return; } go(s, 2); }
        else if (st.step === 2) { if (!st.agree) return; go(s, 3); }
      },
      pay: async (t, s) => {
        if (st.paying) return;
        const av = AV(); if (!av.ok) { toast("Someone just booked these dates. Pick new ones.", { tone: "warn", ms: 3200 }); go(s, 0); return; }
        st.paying = true; s.refreshFoot(); await wait(reduced() ? 50 : 1100);
        if (!checkAvail(v, st.start, st.end).ok) { st.paying = false; toast("Those dates were just taken.", { tone: "warn" }); go(s, 0); return; }
        st.booking = createBooking(v, st); st.paying = false; haptic(25); go(s, 4); s.el.querySelector('[data-act="prev"]')?.setAttribute("hidden", "");
      },
      viewTrip: (t, s) => { const id = st.booking.id; s.close(); Nav.goTo("trips", TripView, { id }); },
      msg: (t, s) => { const id = st.booking.id; s.close(); Nav.goTo("messages", ChatView, { id, side: "customer" }); },
    },
    onStep: (s, name, val) => { if (name === "childSeat") { st.extras.childSeat = val; updateLive(s); } else if (name === "age") { st.driver.age = val; } },
    inputs: {
      ex: (t, s) => { st.extras[t.dataset.k] = t.checked; haptic(4); if (t.dataset.k === "delivery") { const hr = s.body.querySelector("#hotelRow"); if (hr) { hr.hidden = !t.checked; if (t.checked && !reduced()) hr.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: EASE }); } } updateLive(s); },
      hotel: t => { st.extras.hotel = t.value; },
      drv: t => { st.driver[t.dataset.k] = t.value; },
      saveProf: t => { st.saveProfile = t.checked; },
      agree: (t, s) => { st.agree = t.checked; haptic(6); s.refreshFoot(); },
    },
  });
  return s;
}

function createBooking(v, st) {
  const q = quote(v, st.start, st.end, { extras: st.extras, insurance: st.insurance, pickup: st.pickup });
  const now = jmNow(); const pct = S.settings.commission;
  const bk = {
    id: uid("bk_"), ref: refCode(), vehicleId: v.id, businessId: v.businessId, customerId: "me", guest: null,
    driver: { ...st.driver, age: +st.driver.age }, start: st.start, end: st.end, pickup: st.pickup,
    extras: { ...st.extras }, insurance: st.insurance, quote: q, commissionPct: pct, commission: Math.round(q.hostGross * pct / 100),
    status: v.instantBook ? "confirmed" : "requested", instant: !!v.instantBook, createdAt: now,
    events: [{ at: now, text: v.instantBook ? "Booked with instant book" : "Request sent to host" }, { at: now + 1, text: `Deposit ${moneyJ(q.deposit)} paid (mock)` }],
    checkout: null, checkin: null, cancel: null, depositPaid: true, sample: false,
  };
  commit(s => {
    s.bookings.push(bk);
    pushMsg(s, bk.id, "system", v.instantBook ? `Booking ${bk.ref} confirmed. Deposit ${moneyJ(q.deposit)} paid (mock).` : `Request ${bk.ref} sent. The host will accept or decline soon.`);
    markRead(s, bk.id, "customer");
    if (st.saveProfile) Object.assign(s.profile, { name: st.driver.name, phone: st.driver.phone, licence: st.driver.licence, licenceExpiry: st.driver.expiry, age: +st.driver.age });
  });
  return bk;
}

/* ---- trips ---- */
function tripCard(bk, i, side = "customer") {
  const v = getV(bk.vehicleId); const b = getB(bk.businessId); if (!v || !b) return "";
  const review = side === "customer" && canReview(bk);
  return `<article class="tcard press" style="--i:${i}" role="button" tabindex="0" data-act="${side === "customer" ? "openTrip" : "openHostBooking"}" data-id="${bk.id}">
    <span class="tthumb sk"><img class="fade" src="${coverURL(v)}" alt="" loading="lazy"></span>
    <div class="tinfo"><div class="trow1"><b>${esc(vName(v))}</b>${statusPill(bk.status, side !== "customer")}</div>
      <small>${side === "customer" ? `${esc(b.name)} ${smp(b.sample)}` : `${esc(customerName(bk))} ${bk.customerId === "me" ? "" : smp()} · ${bk.ref}`}</small>
      <span class="tline">${icon("cal")}${fmtDate(bk.start)} ${fmtTime(bk.start)} → ${fmtDate(bk.end)}</span>
      <span class="tline">${icon("pin")}${esc(LOC[bk.pickup]?.short || "")} · ${money(bk.quote.total)}</span>
      ${review ? `<span class="tline" style="color:var(--gold-ink);font-weight:600">${icon("star")}Leave a review</span>` : ""}
    </div></article>`;
}
const TripsView = {
  id: "trips", large: true, ptr: true, title: () => "Trips",
  init(ctx) { ctx.local.tab = custBookings().some(b => b.status === "active") ? "active" : "upcoming"; },
  render(ctx) {
    const groups = { upcoming: [], active: [], past: [] }; custBookings().forEach(b => groups[tripPhase(b)].push(b));
    groups.upcoming.sort((a, b) => a.start.localeCompare(b.start)); groups.active.sort((a, b) => a.end.localeCompare(b.end)); groups.past.sort((a, b) => b.start.localeCompare(a.start));
    const list = groups[ctx.local.tab];
    const empty = { upcoming: ["suitcase", "No upcoming trips", "Find a ride and it will show up here."], active: ["key", "No active trips", "Trips you’re on right now appear here."], past: ["clock", "No past trips", "Completed and cancelled trips appear here."] }[ctx.local.tab];
    return `<div class="inner"><h1 class="large-title">Trips</h1>
      ${seg("tab", [{ v: "upcoming", label: `Upcoming<span class="n">${groups.upcoming.length}</span>` }, { v: "active", label: `Active<span class="n">${groups.active.length}</span>` }, { v: "past", label: `Past<span class="n">${groups.past.length}</span>` }], ctx.local.tab, "block")}
      <div class="list stagger go" id="tripList" data-skel style="margin-top:14px">${list.length ? list.map((b, i) => tripCard(b, i)).join("") : emptyState(empty[0], empty[1], empty[2], ctx.local.tab === "upcoming" ? `<button type="button" class="btn sm secondary press" data-act="goTab" data-tab="explore">Explore vehicles</button>` : "")}</div></div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; const y = ctx.scroller.scrollTop; renderPage(ctx); ctx.scroller.scrollTop = y; },
};

const TripView = {
  id: "trip", title: ctx => { const bk = getBk(ctx.params.id); return bk ? bk.ref : "Trip"; },
  navRight: ctx => `<button type="button" class="nav-btn press" data-act="openChat" data-id="${ctx.params.id}" data-side="customer" aria-label="Message the host">${icon("chat")}</button>`,
  render(ctx) {
    const bk = getBk(ctx.params.id); if (!bk) return emptyState("suitcase", "Trip not found", "It may have been removed after a reset.");
    const v = getV(bk.vehicleId); const b = getB(bk.businessId); const q = bk.quote; const ct = changeTerms(bk); const phase = tripPhase(bk);
    const explain = {
      requested: ["t-orange", "clock", `Waiting for ${esc(b.name)} to accept. Requests expire if the host doesn’t reply before pick-up.`],
      confirmed: ["t-blue", "check", `You’re booked. Meet ${esc(b.name)} at ${esc(LOC[bk.pickup].name)} on ${fmtDT(bk.start)}. Bring your licence.`],
      active: ["t-green", "key", `Enjoy the drive! Return by ${fmtDT(bk.end)} to ${esc(LOC[bk.pickup].name)}.${toMs(bk.end) < jmNow() ? " You’re past the return time, so late fees may apply." : ""}`],
      completed: ["t-grey", "checkCircle", `Trip completed${bk.checkin ? ` on ${fmtDT(bk.checkin.at)}` : ""}. ${bk.checkin?.fees?.total ? `Extra charges of ${money(bk.checkin.fees.total)} were taken from the deposit.` : "Deposit released (mock)."}`],
      cancelled: ["t-red", "x", `Cancelled. ${bk.cancel ? `Fee ${money(bk.cancel.fee)} · ${money(bk.cancel.refund)} of the deposit released (mock).` : ""}`],
      declined: ["t-red", "x", "The host declined this request. Your deposit hold was released (mock)."],
      expired: ["t-grey", "clock", "This request expired before the host replied. Your deposit hold was released (mock)."],
    }[bk.status];
    const reviewed = reviewFor(bk.id);
    return `<div class="inner" style="padding-top:8px">
      <div class="trip-hero sk"><img class="fade" src="${coverURL(v)}" alt="${esc(vFull(v))}, sample photo"><div class="th-over">${statusPill(bk.status)}<b>${esc(vFull(v))}</b><small>${esc(b.name)} · ${bk.ref}</small></div></div>
      <div class="explain ${explain[0]}">${icon(explain[1])}<span>${explain[2]}</span></div>
      <h3 class="group-title">Trip</h3>
      <div class="group">
        ${row({ label: "Pick-up", value: fmtDT(bk.start) })}${row({ label: "Return", value: fmtDT(bk.end) })}
        ${row({ label: "Location", sub: esc(b.pickupNotes?.[bk.pickup] || ""), value: esc(LOC[bk.pickup].short) })}
        ${row({ label: "Driver", value: `${esc(bk.driver.name)} · licence •••• ${esc(String(bk.driver.licence).slice(-4))}` })}
        ${row({ label: "Cover", value: `${q.insurance.name} · excess ${money(q.excess)}` })}
        ${row({ label: "Total", value: `<b style="color:var(--label)">${money(q.total)}</b>` })}
      </div>
      ${bk.checkout ? `<h3 class="group-title">Check-out record</h3><div class="group">${row({ label: "Fuel at pick-up", value: `${bk.checkout.fuel}/8` })}${row({ label: "Odometer", value: `${(+bk.checkout.km).toLocaleString()} km` })}${bk.checkout.notes ? row({ label: "Notes", sub: esc(bk.checkout.notes) }) : ""}</div>` : ""}
      <h3 class="group-title">Manage</h3>
      <div class="group icons">
        ${row({ ic: "chat", color: "#00A884", label: `Message ${esc(b.name)}`, sub: "WhatsApp-style chat for this booking", act: "openChat", attrs: `data-id="${bk.id}" data-side="customer"` })}
        ${row({ ic: "receipt", color: "#8E8E93", label: "Receipt", act: "receipt" })}
        ${phase !== "past" ? row({ ic: "cal", color: "#5856D6", label: ct.extendOnly ? "Change return time" : "Change dates", sub: esc(ct.note), act: ct.ok ? "change" : "noop", chevron: ct.ok }) : ""}
        ${bk.status === "confirmed" || bk.status === "requested" ? row({ ic: "x", color: "#FF3B30", label: bk.status === "requested" ? "Withdraw request" : "Cancel booking", sub: esc(cancelTerms(bk).note), act: "cancel", cls: "danger" }) : ""}
        ${canReview(bk) ? row({ ic: "star", color: "#FF9500", label: "Leave a review", sub: "Only customers with a completed trip can review", act: "review" }) : reviewed ? row({ ic: "star", color: "#FF9500", label: "Your review", sub: `${"★".repeat(reviewed.rating)} · “${esc(reviewed.text.slice(0, 60))}${reviewed.text.length > 60 ? "…" : ""}”` }) : ""}
        ${row({ ic: "flag", color: "#FF3B30", label: "Report a problem", act: "report", attrs: `data-booking="${bk.id}"` })}
      </div>
      <h3 class="group-title">Policies</h3>
      <div class="policy">${icon("cal")}<div><b>${POLICIES[b.policy].name} cancellation</b><p>${POLICIES[b.policy].desc}</p></div></div>
      <div class="policy">${icon("lock")}<div><b>Deposit ${money(q.deposit)}</b><p>${esc(b.damagePolicy)}</p></div></div>
      <h3 class="group-title">Timeline</h3>
      <ol class="timeline">${bk.events.slice().sort((a, z) => a.at - z.at).map(e => `<li><span class="dot"></span><div>${esc(e.text)}<small>${fmtDT(fromMs(e.at))}</small></div></li>`).join("")}</ol>
      <button type="button" class="btn block plain press" style="margin-top:18px" data-act="openVehicle" data-id="${v.id}">${icon("car")}View listing</button>
    </div>`;
  },
  actions: {
    receipt: (t, ctx) => openReceipt(getBk(ctx.params.id)),
    change: (t, ctx) => openChangeDates(getBk(ctx.params.id)),
    review: (t, ctx) => openReview(getBk(ctx.params.id)),
    cancel: async (t, ctx) => {
      const bk = getBk(ctx.params.id); const terms = cancelTerms(bk);
      const msg = `${esc(terms.note)}<br>${terms.fee ? `Fee ${money(terms.fee)} is kept from your deposit hold.` : "No cancellation fee."} ${money(terms.refund)} of the deposit is released (mock).${terms.owed ? ` ${money(terms.owed)} more would be charged.` : ""}`;
      const r = await actionSheet({ title: bk.status === "requested" ? "Withdraw this request?" : "Cancel this booking?", message: msg, actions: [{ label: bk.status === "requested" ? "Withdraw request" : "Cancel booking", style: "destructive", value: "yes" }], cancel: "Keep booking" });
      if (r !== "yes") return;
      commit(s => { const b = getBk(bk.id); b.status = "cancelled"; b.cancel = { at: jmNow(), fee: terms.fee, refund: terms.refund, by: "customer" }; b.events.push({ at: jmNow(), text: `Cancelled by customer · fee ${moneyJ(terms.fee)}` }); pushMsg(s, b.id, "system", `Booking cancelled by the customer. Fee ${moneyJ(terms.fee)}, deposit release ${moneyJ(terms.refund)} (mock).`); });
      haptic(15); toast(bk.status === "requested" ? "Request withdrawn" : "Booking cancelled");
    },
  },
};

function openChangeDates(bk) {
  const v = getV(bk.vehicleId); const ct = changeTerms(bk); const L = { start: bk.start, end: bk.end };
  if (!ct.ok) { toast(ct.note, { tone: "warn", ms: 3200 }); return; }
  Sheets.open({ title: ct.extendOnly ? "Change return time" : "Change dates", size: "auto",
    render: () => {
      const av = checkAvail(v, L.start, L.end, bk.id); const q = quote(v, L.start, L.end, { extras: bk.extras, insurance: bk.insurance, pickup: bk.pickup }); const diff = q.total - bk.quote.total + ct.fee;
      const same = L.start === bk.start && L.end === bk.end;
      return `<div class="group icons">
          <button type="button" class="row tap" data-act="pick" ${ct.extendOnly ? "disabled" : ""}>${icoBox("cal")}<span class="lbl"><small>Pick-up${ct.extendOnly ? " · on trip" : ""}</small><b>${fmtDT(L.start)}</b></span>${ct.extendOnly ? "" : chev()}</button>
          <button type="button" class="row tap" data-act="pick" data-which="end">${icoBox("cal", "#5856D6")}<span class="lbl"><small>Return</small><b>${fmtDT(L.end)}</b></span>${chev()}</button></div>
        ${same ? "" : `<div class="status-line ${av.ok ? "ok" : "no"}">${icon(av.ok ? "checkCircle" : "ban")}${av.ok ? "Vehicle is free for the new dates" : esc(av.label) + " — try other dates"}</div>`}
        <div class="breakdown" style="margin-top:12px">
          <div class="bl"><span>Current total</span><b>${money(bk.quote.total)}</b></div>
          <div class="bl"><span>New total (${plural(q.days, "day")})</span><b>${money(q.total)}</b></div>
          ${ct.fee ? `<div class="bl fee"><span>Change fee (strict policy)</span><b>${money(ct.fee)}</b></div>` : ""}
          <div class="bl total"><span>${diff >= 0 ? "You’ll pay" : "You’ll save"}</span><b>${money(Math.abs(diff))}</b></div></div>
        <p class="group-foot">${esc(ct.note)} Balances are settled at pick-up or return (mock).</p>`;
    },
    footer: () => { const av = checkAvail(v, L.start, L.end, bk.id); const same = L.start === bk.start && L.end === bk.end; return `<button type="button" class="btn block pill press" data-act="save" ${av.ok && !same ? "" : "disabled"}>Confirm new dates</button>`; },
    actions: {
      pick: async (t, s) => { const r = await pickTrip({ start: L.start, end: L.end, which: t.dataset.which || "start", lockStart: !!ct.extendOnly }); if (r) { if (ct.extendOnly) r.start = bk.start; Object.assign(L, r); s.refresh(); } },
      save: (t, s) => {
        if (!checkAvail(v, L.start, L.end, bk.id).ok) { toast("Those dates aren’t free", { tone: "warn" }); return; }
        commit(st => { const b = getBk(bk.id); const old = `${fmtDate(b.start)}–${fmtDate(b.end)}`; b.start = L.start; b.end = L.end; b.quote = quote(v, L.start, L.end, { extras: b.extras, insurance: b.insurance, pickup: b.pickup }); b.commission = Math.round(b.quote.hostGross * b.commissionPct / 100); if (ct.fee) b.changeFees = (b.changeFees || 0) + ct.fee; b.events.push({ at: jmNow(), text: `Dates changed from ${old} to ${fmtDate(L.start)}–${fmtDate(L.end)}${ct.fee ? ` · fee ${moneyJ(ct.fee)}` : ""}` }); pushMsg(st, b.id, "system", `Dates changed by the customer: ${fmtRange(L.start, L.end)}.`); });
        s.close(); haptic(12); toast("Dates updated");
      },
    } });
}

function openReceipt(bk) {
  const v = getV(bk.vehicleId); const b = getB(bk.businessId); const q = bk.quote; const f = bk.checkin?.fees;
  const text = () => [`${CONFIG.APP_NAME} receipt (DEMO · sample data)`, `Ref ${bk.ref}`, `${vFull(v)} from ${b.name}`, `${fmtRange(bk.start, bk.end)}`, `Rental ${moneyJ(q.rental + q.seasonal)}`, ...q.extras.map(e => `${e.label} ${moneyJ(e.amount)}`), `${q.insurance.name} ${moneyJ(q.insurance.amount)}`, `Service fee ${moneyJ(q.serviceFee)}`, `GCT ${moneyJ(q.gct)}`, `Total ${moneyJ(q.total)}`, `Deposit held ${moneyJ(q.deposit)} (mock)`].join("\n");
  Sheets.open({ title: "Receipt", size: "large",
    render: () => `<div class="receipt"><div class="receipt-head"><span class="brand-mark" style="width:40px;height:40px;border-radius:11px">${BRAND_SVG}</span><div><b>${esc(CONFIG.APP_NAME)}</b><small>Demo receipt · sample data · ${bk.ref}</small></div>${statusPill(bk.status)}</div>
      <dl class="kv"><dt>Vehicle</dt><dd>${esc(vFull(v))}</dd><dt>Host</dt><dd>${esc(b.name)}</dd><dt>Customer</dt><dd>${esc(customerName(bk))}</dd><dt>Pick-up</dt><dd>${fmtDT(bk.start)}</dd><dt>Return</dt><dd>${fmtDT(bk.end)}</dd><dt>Location</dt><dd>${esc(LOC[bk.pickup].short)}</dd><dt>Booked</dt><dd>${fmtDT(fromMs(bk.createdAt))}</dd></dl>
      <div class="hr"></div>${breakdownHTML(q)}
      <div class="hr"></div>
      <div class="breakdown" style="padding:0;background:none;box-shadow:none">
        <div class="bl"><span>Deposit hold paid (mock)</span><b>${money(q.deposit)}</b></div>
        ${bk.changeFees ? `<div class="bl fee"><span>Date change fees</span><b>${money(bk.changeFees)}</b></div>` : ""}
        ${f ? `${f.late ? `<div class="bl fee"><span>Late return (${f.lateH} h)</span><b>${money(f.late)}</b></div>` : ""}${f.mil ? `<div class="bl fee"><span>Extra mileage (${f.extraKm} km)</span><b>${money(f.mil)}</b></div>` : ""}${f.fuelFee ? `<div class="bl fee"><span>Fuel top-up</span><b>${money(f.fuelFee)}</b></div>` : ""}${f.damage ? `<div class="bl fee"><span>Damage</span><b>${money(f.damage)}</b></div>` : ""}${f.other ? `<div class="bl fee"><span>Other fees</span><b>${money(f.other)}</b></div>` : ""}<div class="bl minus"><span>Deposit released</span><b>${money(f.depositRefund)}</b></div>` : ""}
        ${bk.cancel ? `<div class="bl fee"><span>Cancellation fee</span><b>${money(bk.cancel.fee)}</b></div><div class="bl minus"><span>Deposit released</span><b>${money(bk.cancel.refund)}</b></div>` : ""}
      </div>
      <p class="bl-note">This is a demo receipt. No real payment was taken.</p></div>`,
    footer: () => `<button type="button" class="btn block pill plain press" data-act="copyR">${icon("copy")}Copy receipt text</button>`,
    actions: { copyR: () => copyText(text(), "Receipt copied") } });
}

function openReview(bk) {
  if (!canReview(bk)) { toast("Reviews open after a completed trip", { tone: "warn" }); return; }
  const v = getV(bk.vehicleId); const L = { rating: 0, text: "" };
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
  Sheets.open({ title: "Leave a review", size: "large",
    render: () => `<div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))}</b><small>${fmtRange(bk.start, bk.end)}</small></div></div>
      <div class="star-input" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="star" data-n="${n}" class="${n <= L.rating ? "on" : ""}" role="radio" aria-checked="${n === L.rating}" aria-label="${n} star${n > 1 ? "s" : ""}">${icon("star")}</button>`).join("")}</div>
      <p style="text-align:center;font-weight:600;min-height:22px" id="starLbl">${labels[L.rating] || "Tap to rate"}</p>
      <textarea class="textarea no-drag" style="margin-top:12px" data-input="txt" placeholder="How was the vehicle, pick-up and host?" aria-label="Your review">${esc(L.text)}</textarea>
      <p class="group-foot">Reviews show “Completed trip” because only customers who finished a trip can post them.</p>`,
    footer: () => `<button type="button" class="btn block pill press" data-act="post">Post review</button>`,
    inputs: { txt: t => { L.text = t.value; } },
    actions: {
      star: (t, s) => { L.rating = +t.dataset.n; haptic(6); for (const b of $$(".star-input button", s.body)) { const n = +b.dataset.n; b.classList.toggle("on", n <= L.rating); b.setAttribute("aria-checked", n === L.rating); b.classList.remove("pop"); if (n <= L.rating && !reduced()) { void b.offsetWidth; b.style.animationDelay = `${(n - 1) * 40}ms`; b.classList.add("pop"); } } s.body.querySelector("#starLbl").textContent = labels[L.rating]; },
      post: (t, s) => {
        if (!L.rating) { toast("Tap the stars to rate", { tone: "warn" }); return; }
        if (L.text.trim().length < 4) { toast("Add a few words about the trip", { tone: "warn" }); return; }
        commit(st => { st.reviews.push({ id: uid("rv_"), bookingId: bk.id, vehicleId: v.id, businessId: v.businessId, author: S.profile.name || "Demo Customer", from: "Jamaica", rating: L.rating, text: L.text.trim(), at: jmNow(), sample: false }); getBk(bk.id).events.push({ at: jmNow(), text: `Review posted · ${L.rating}★` }); });
        s.close(); haptic(15); toast("Thanks for your review!", { icon: "star" });
      },
    } });
}
