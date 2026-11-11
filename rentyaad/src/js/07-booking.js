/* ============ booking flow, payments, trips, changes, cancellation, receipts, reviews ============ */
function defaultPickup(v, prefer) {
  const opts = pickupOptions(v); const w = S.search.where || {};
  if (prefer && opts.some(o => o.id === prefer)) return prefer;
  if (w.kind === "airport" && opts.some(o => o.id === w.airport)) return w.airport;
  return opts[0].id;
}

function openBooking(v, o = {}) {
  if (!v) return;
  if (Nav.role !== "customer") { toast("Switch to Renter to book", { tone: "warn" }); return; }
  const b = getB(v.businessId); const P = me(); const methods = acceptedMethods(b);
  const st = {
    step: 0, dir: 1, start: o.start || S.search.start, end: o.end || S.search.end,
    pickup: defaultPickup(v, o.pickup),
    extras: { childSeat: 0, extraDriver: false, chauffeur: false, hotel: "" }, insurance: "basic",
    driver: { name: P.name || "", phone: P.phone || "", licence: P.licence || "", expiry: P.licenceExpiry || "", age: P.age || 25 },
    saveProfile: true, agree: false, paying: false, booking: null, errors: [],
    method: methods.includes("app") ? "app" : methods[0] || "cash", plan: "deposit", card: null,
  };
  const STEPS = ["Trip details", "Driver details", "Review", "Payment", "Confirmed"];
  const Q = () => quote(v, st.start, st.end, { extras: st.extras, insurance: st.insurance, pickup: st.pickup });
  const AV = () => checkAvail(v, st.start, st.end);
  const go = (s, n) => { st.dir = n > st.step ? 1 : -1; st.step = n; s.setTitle(STEPS[n]); s.refresh({ keepScroll: false }); s.body.scrollTop = 0; };
  const updateLive = s => { const box = s.body.querySelector("#bkPrice"); if (box) box.innerHTML = breakdownHTML(Q()); const a = s.body.querySelector("#bkAvail"); if (a) a.outerHTML = availLine(); const d = s.body.querySelector("#dueBox"); if (d) d.innerHTML = dueLines(); s.refreshFoot(); };
  const availLine = () => { const av = AV(); if (av.ok) return `<div class="status-line ok" id="bkAvail">${icon("checkCircle")}Available · no clashes with other bookings</div>`; const nx = nextFree(v, st.start, st.end); return `<div class="status-line no" id="bkAvail">${icon("ban")}<span>${esc(av.label)}.${nx ? ` Next free from ${fmtDate(nx.start)}.` : ""}</span>${nx ? `<button type="button" class="btn sm plain press" data-act="useNext" data-s="${nx.start}" data-e="${nx.end}">Use</button>` : ""}</div>`; };
  const pay = () => makePayment(Q(), st.method, st.plan, st.card);
  const dueLines = () => { const p = pay(); const q = Q();
    const nowLabel = p.method === "bank" ? "Transfer now to confirm" : "Due now"; const laterLabel = "Due at pick-up";
    return `<div class="bl now"><span>${nowLabel}${p.method === "app" ? " · in app" : ""}</span><b>${money(p.nowAmount)}</b></div>
      <div class="bl"><span>${laterLabel}${p.method === "cash" ? " · cash" : ""}</span><b>${money(p.laterAmount)}</b></div>
      <div class="bl"><span>${icon("lock")} Includes refundable deposit</span><b>${money(q.deposit)}</b></div>`; };
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
      const q = Q(); const two = TWO_WHEEL.has(v.type); const ex = st.extras;
      return `<div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))}</b><small>${esc(locatedIn(v))}</small></div></div>
        <h3 class="group-title">Dates</h3>
        <div class="group icons">
          <button type="button" class="row tap" data-act="dates" data-which="start">${icoBox("cal")}<span class="lbl"><small>Pick-up</small><b>${fmtDT(st.start)}</b></span>${chev()}</button>
          <button type="button" class="row tap" data-act="dates" data-which="end">${icoBox("cal")}<span class="lbl"><small>Return · ${plural(q.days, "day")}</small><b>${fmtDT(st.end)}</b></span>${chev()}</button>
        </div>
        ${availLine()}
        <h3 class="group-title">Pick-up</h3>
        <div class="group">${pickupOptions(v).map(p => `<button type="button" class="row tap ${st.pickup === p.id ? "on" : ""}" data-act="pickup" data-v="${p.id}"><span class="radio-dot"></span><span class="lbl"><b>${esc(p.label)}</b><small>${esc(p.sub)}</small></span><span class="val">${p.fee ? "+" + money(p.fee) : "Free"}</span></button>`).join("")}
          <label class="frow" id="hotelRow" ${st.pickup === "hotel" ? "" : "hidden"}><span>Hotel</span><input type="text" placeholder="Hotel name and area" value="${esc(ex.hotel)}" data-input="hotel" autocomplete="off"></label></div>
        <h3 class="group-title">Extras</h3>
        <div class="group">
          ${hasFeat(v, "driver") ? `<div class="row"><span class="lbl"><b>Driver included</b><small>A professional driver comes with this vehicle</small></span>${icon("check", "accent")}</div>` : ""}
          ${two ? `<div class="row"><span class="lbl"><b>Helmets included</b><small>Helmets come with every rental</small></span>${icon("check", "accent")}</div>` : `<div class="row"><span class="lbl"><b>Child seat</b><small>${money(EXTRAS.childSeat.perDay)}/day each</small></span>${stepper("childSeat", ex.childSeat, 0, 3)}</div>`}
          ${!hasFeat(v, "driver") && !two ? `<label class="row"><span class="lbl"><b>Extra driver</b><small>${money(EXTRAS.extraDriver.perDay)}/day · must also meet the age rule</small></span>${switchEl("x_ed", ex.extraDriver, 'data-change="ex" data-k="extraDriver"', "Extra driver")}</label>` : ""}
          ${v.chauffeur && !hasFeat(v, "driver") ? `<label class="row"><span class="lbl"><b>Driver / chauffeur</b><small>${money(EXTRAS.chauffeur.perDay)}/day</small></span>${switchEl("x_ch", ex.chauffeur, 'data-change="ex" data-k="chauffeur"', "Driver or chauffeur")}</label>` : ""}
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
          <label class="frow ${err.phone ? "err" : ""}"><span>Phone</span><input type="tel" value="${esc(d.phone)}" placeholder="+1 876-XXX-XXXX" data-input="drv" data-k="phone" autocomplete="tel"></label>
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
          ${row({ label: "Where", value: esc(pickupOpt(v, st.pickup).id === "hotel" ? (st.extras.hotel || "Hotel delivery") : pickupOpt(v, st.pickup).short) })}
          ${row({ label: "Driver", value: `${esc(st.driver.name)} · ${st.driver.age}` })}
          ${row({ label: "Licence", value: `•••• ${esc(st.driver.licence.slice(-4))} · exp. ${fmtMonthYear(st.driver.expiry)}` })}
        </div>
        <h3 class="group-title">Price</h3>${breakdownHTML(q)}
        <h3 class="group-title">Before you pay</h3>
        <div class="policy">${icon("lock")}<div><b>Deposit & damage</b><p>A refundable deposit of <b>${money(q.deposit)}</b> applies. With ${ins.name} your damage excess is <b>${money(q.excess)}</b>. ${esc(b.damagePolicy)}</p></div></div>
        <div class="policy">${icon("cal")}<div><b>${pol.name} cancellation</b><p>${pol.desc}</p></div></div>
        <div class="policy">${icon("fuel")}<div><b>Fuel, mileage & late returns</b><p>${fuel.desc} ${v.mileage.limit ? `${v.mileage.limit} km/day included, then ${moneyJ(v.mileage.extraPerKm)}/km.` : "Unlimited kilometres."} Returns more than 59 minutes late are charged by the hour.</p></div></div>
        ${!v.instantBook ? `<div class="banner info" style="margin-top:10px">${icon("info")}<span>${esc(b.name)} reviews requests, usually within ${b.responseMins || 30} minutes. If they decline, anything you paid is refunded (demo).</span></div>` : ""}
        <div class="group" style="margin-top:12px"><label class="row"><span class="lbl"><b>I agree to the deposit, damage and cancellation policies</b></span>${switchEl("x_ag", st.agree, 'data-change="agree"', "Agree to policies")}</label></div>`;
    },
    () => {
      return `<p class="note" style="margin-bottom:12px">${icon("info")}<span>${esc(b.name)} accepts the options below. Choose how you’d like to pay.</span></p>
        ${methods.map(m => `<button type="button" class="pay-opt press ${st.method === m ? "on" : ""}" data-act="method" data-v="${m}"><span class="po-ico">${icon(PAYMENT_METHODS[m].icon)}</span><span class="po-txt"><b>${PAYMENT_METHODS[m].name}${m === "app" ? ` <span class="demo-label">Demo</span>` : ""}</b><small>${PAYMENT_METHODS[m].sub}</small></span><span class="radio-dot ${st.method === m ? "on" : ""}"></span></button>`).join("")}
        <div id="planBox" ${st.method === "app" ? "" : "hidden"} style="margin-top:14px">${seg("plan", [{ v: "deposit", label: "Pay deposit now" }, { v: "full", label: "Pay in full now" }], st.plan, "block")}</div>
        <div class="due-box" id="dueBox">${dueLines()}</div>
        <p class="group-foot" id="payNote">${payNote()}</p>`;
    },
    () => {
      const bk = st.booking; const conf = bk.status === "confirmed"; const p = bk.payment;
      return `<div class="confirm">
        <svg class="check-anim ${conf ? "" : "req"}" viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="48"/><path d="${conf ? "M31 54 L46 68 L74 38" : "M52 30 V56 L66 64"}"/></svg>
        <h2>${conf ? "Booking confirmed" : "Request sent"}</h2><span class="ref">${bk.ref}</span>
        <p>${esc(vFull(v))} · ${fmtRange(bk.start, bk.end)}</p>
        <p>${conf ? `Bring the licence you entered. Pick-up: ${esc(pickupLong(bk))}.` : `${esc(b.name)} usually replies within ${b.responseMins || 30} minutes. Track it in Trips and Messages.`}</p>
      </div>
      <div class="due-box"><div class="bl now"><span>${p.method === "app" ? `Paid now · ${p.card ? `${p.card.brand} •••• ${p.card.last4}` : "card"} (demo)` : p.method === "bank" ? "Transfer to confirm" : "Paid now"}</span><b>${money(p.nowAmount)}</b></div><div class="bl"><span>Due at pick-up${p.method === "cash" ? " · cash" : ""}</span><b>${money(p.laterAmount)}</b></div></div>
      ${p.method === "bank" ? `<p class="group-foot">${esc(b.name)} will share bank details in Messages (sample). Your booking is held while the transfer is pending.</p>` : ""}`;
    },
  ];
  const payNote = () => st.method === "app" ? "Demo payment screen: no real card is charged, stored or sent. Live payments will connect to a Jamaican-supported processor such as WiPay or Fygaro." : st.method === "cash" ? "Bring cash for the rental and the refundable deposit. The host gives you a receipt at pick-up." : "Transfer the deposit within 24 hours to hold the booking. The rest is due at pick-up.";
  const finish = s => { st.booking = createBooking(v, st); st.paying = false; haptic(25); go(s, 4); s.el.querySelector('[data-act="prev"]')?.setAttribute("hidden", ""); };
  const s = Sheets.open({
    title: STEPS[0], size: "full", local: st,
    left: `<button type="button" class="sh-link press" data-act="prev" hidden>Back</button>`,
    render: () => `<div class="steps-prog" aria-label="Step ${st.step + 1} of 5">${STEPS.map((_, i) => `<i class="${i <= st.step ? "on" : ""}"></i>`).join("")}</div><div class="${reduced() ? "" : st.dir > 0 ? "step-in-r" : "step-in-l"}">${steps[st.step]()}</div>`,
    mount: s => { const back = s.el.querySelector('[data-act="prev"]'); if (back) back.hidden = !(st.step > 0 && st.step < 4); },
    footer: () => {
      const q = Q(); const p = pay();
      if (st.step === 4) return `<div class="btn-row"><button type="button" class="btn plain press" data-act="receipt">${icon("receipt")}Receipt</button><button type="button" class="btn press" data-act="viewTrip">View trip</button></div>`;
      if (st.step === 3) { const lbl = st.method === "app" ? `${icon("lock")}Pay ${money(p.nowAmount)}` : st.method === "bank" ? (v.instantBook ? "Confirm & get bank details" : "Send request") : (v.instantBook ? "Confirm booking" : "Send request"); return `<button type="button" class="btn block press ${st.paying ? "loading" : ""}" data-act="pay">${lbl}</button>`; }
      const dis = (st.step === 0 && !AV().ok) || (st.step === 2 && !st.agree);
      return `<div class="bk-foot"><div class="bk-total"><b>${money(q.total)}</b><small>Total · ${money(q.deposit)} deposit</small></div><button type="button" class="btn press" data-act="next" ${dis ? "disabled" : ""}>Continue</button></div>`;
    },
    actions: {
      dates: async (t, s) => { const r = await pickTrip({ start: st.start, end: st.end, which: t.dataset.which }); if (r) { st.start = r.start; st.end = r.end; s.refresh(); } },
      useNext: (t, s) => { st.start = t.dataset.s; st.end = t.dataset.e; s.refresh(); toast("Dates updated"); },
      pickup: (t, s) => { st.pickup = t.dataset.v; for (const r of $$('[data-act="pickup"]', s.body)) r.classList.toggle("on", r.dataset.v === st.pickup); const hr = s.body.querySelector("#hotelRow"); if (hr) { const show = st.pickup === "hotel"; if (hr.hidden && show && !reduced()) hr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); hr.hidden = !show; } haptic(4); updateLive(s); },
      ins: (t, s) => { st.insurance = t.dataset.v; for (const r of $$('[data-act="ins"]', s.body)) r.classList.toggle("on", r.dataset.v === st.insurance); haptic(4); updateLive(s); },
      method: (t, s) => { st.method = t.dataset.v; for (const r of $$(".pay-opt", s.body)) { const on = r.dataset.v === st.method; r.classList.toggle("on", on); r.querySelector(".radio-dot").classList.toggle("on", on); } s.body.querySelector("#planBox").hidden = st.method !== "app"; s.body.querySelector("#payNote").textContent = payNote(); haptic(4); updateLive(s); },
      expiry: async (t, s) => { const r = await pickMonthYear({ value: st.driver.expiry }); if (r) { st.driver.expiry = r; s.refresh(); } },
      sampleDriver: (t, s) => { Object.assign(st.driver, { name: st.driver.name || me().name || "Demo Renter", phone: st.driver.phone || "+1 876-555-0199", licence: "SAMPLE-DL-204518", expiry: "2029-06", age: Math.max(+st.driver.age || 0, v.minAge, 30) }); st.errors = []; s.refresh(); toast("Sample driver details added"); },
      prev: (t, s) => { if (st.step > 0 && st.step < 4) go(s, st.step - 1); },
      next: (t, s) => {
        if (st.step === 0) { if (!AV().ok) { toast("Those dates clash with another booking", { tone: "warn" }); return; } if (st.pickup === "hotel" && !st.extras.hotel.trim()) { toast("Add the hotel for delivery", { tone: "warn" }); s.body.querySelector('[data-input="hotel"]')?.focus(); return; } go(s, 1); }
        else if (st.step === 1) { st.errors = validateDriver(); if (st.errors.length) { s.refresh(); haptic(20); if (!reduced()) s.el.animate([{ transform: "translateX(0)" }, { transform: "translateX(6px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" }], { duration: 280 }); return; } go(s, 2); }
        else if (st.step === 2) { if (!st.agree) return; go(s, 3); }
      },
      pay: async (t, s) => {
        if (st.paying) return;
        if (!AV().ok) { toast("Someone just booked these dates. Pick new ones.", { tone: "warn", ms: 3200 }); go(s, 0); return; }
        if (st.method === "app") { const card = await openCardSheet({ amount: pay().nowAmount, merchant: b.name, vehicle: vFull(v) }); if (!card) return; st.card = card; if (!AV().ok) { toast("Those dates were just taken. Your demo payment was voided.", { tone: "warn" }); go(s, 0); return; } finish(s); return; }
        st.paying = true; s.refreshFoot(); await wait(reduced() ? 50 : 700);
        if (!AV().ok) { st.paying = false; toast("Those dates were just taken.", { tone: "warn" }); go(s, 0); return; }
        finish(s);
      },
      receipt: () => openReceipt(getBk(st.booking.id)),
      viewTrip: (t, s) => { const id = st.booking.id; s.close(); Nav.goTo("trips", TripView, { id }); },
    },
    onStep: (s, name, val) => { if (name === "childSeat") { st.extras.childSeat = val; updateLive(s); } else if (name === "age") { st.driver.age = val; } },
    onSeg: (s, name, val) => { if (name === "plan") { st.plan = val; updateLive(s); } },
    inputs: {
      ex: (t, s) => { st.extras[t.dataset.k] = t.checked; haptic(4); updateLive(s); },
      hotel: t => { st.extras.hotel = t.value; },
      drv: t => { st.driver[t.dataset.k] = t.value; },
      saveProf: t => { st.saveProfile = t.checked; },
      agree: (t, s) => { st.agree = t.checked; haptic(6); s.refreshFoot(); },
    },
  });
  return s;
}

/* ---- DEMO card payment sheet (Apple Pay-style). Card numbers never leave this sheet and are never stored. ---- */
function cardBrand(num) { const d = digits(num); if (/^4/.test(d)) return "Visa"; if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard"; if (/^3[47]/.test(d)) return "Amex"; if (/^6(011|5)/.test(d)) return "Discover"; return ""; }
function luhn(num) { const d = digits(num); if (d.length < 13) return false; let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
function openCardSheet({ amount, merchant, vehicle }) {
  return new Promise(resolve => {
    const L = { num: "", exp: "", cvc: "", name: "", busy: false, done: false, err: "" };
    const masked = () => { const d = digits(L.num).padEnd(16, "•"); return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`.replace(/\d(?=.{5})/g, (c, i) => i < 15 ? "•" : c); };
    const preview = s => { if (L.err) { L.err = ""; const e = s.body.querySelector("#ccErr"); if (e) e.innerHTML = ""; } const c = s.body.querySelector(".cc-card"); if (!c) return; c.querySelector(".cc-num").textContent = masked(); c.querySelector(".cc-brand").textContent = cardBrand(L.num) || "Card"; c.querySelector(".cc-name").textContent = L.name || "Name on card"; c.querySelector(".cc-exp").textContent = L.exp || "MM/YY"; };
    const sheet = Sheets.open({ title: "Pay", size: "large", modal: true,
      right: `<button type="button" class="sh-link press" data-act="cancel">Cancel</button>`,
      render: s => L.done ? `<div class="paid"><svg class="check-anim" viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="48"/><path d="M31 54 L46 68 L74 38"/></svg><h3>Payment approved</h3><p class="muted">${money(amount)} · demo payment, nothing was charged</p></div>`
        : `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span class="demo-label">${icon("info")}Demo payment screen</span><span class="muted" style="font-size:13px">${esc(merchant)}</span></div>
        <div class="cc-card" aria-hidden="true"><div class="cc-top"><span>${esc(CONFIG.APP_NAME)} · demo</span><span class="cc-brand">Card</span></div><div class="cc-chip"></div><div class="cc-num">•••• •••• •••• ••••</div><div class="cc-bot"><span><small>Card holder</small><span class="cc-name">Name on card</span></span><span><small>Expires</small><span class="cc-exp">MM/YY</span></span></div></div>
        <div id="ccErr"></div>
        <div class="field"><label for="ccNum">Card number</label><div class="inp">${icon("card")}<input id="ccNum" inputmode="numeric" autocomplete="off" placeholder="1234 5678 9012 3456" data-input="num" maxlength="23"></div></div>
        <div class="cc-grid"><div class="field"><label for="ccExp">Expiry</label><input id="ccExp" class="input" inputmode="numeric" autocomplete="off" placeholder="MM/YY" data-input="exp" maxlength="5"></div><div class="field"><label for="ccCvc">CVC</label><input id="ccCvc" class="input" inputmode="numeric" autocomplete="off" placeholder="123" data-input="cvc" maxlength="4"></div></div>
        <div class="field"><label for="ccName">Name on card</label><input id="ccName" class="input" autocomplete="off" placeholder="As shown on the card" data-input="name"></div>
        <button type="button" class="link" data-act="test">${icon("sparkles")}Use test card 4242 4242 4242 4242</button>
        <div class="due-box"><div class="bl total"><span>${esc(vehicle)}</span><b>${money(amount)}</b></div></div>
        <p class="group-foot">Demo only: card details stay on this screen, are never stored or sent anywhere, and are cleared when it closes. Live payments will connect to a Jamaican-supported processor such as WiPay or Fygaro.</p>`,
      mount: s => preview(s),
      footer: () => L.done ? "" : `<button type="button" class="btn block ink press ${L.busy ? "loading" : ""}" data-act="pay">${icon("lock")}${L.busy ? "Processing…" : `Pay ${money(amount)}`}</button>`,
      inputs: {
        num: (t, s) => { const d = digits(t.value).slice(0, 19); t.value = d.replace(/(.{4})/g, "$1 ").trim(); L.num = d; preview(s); },
        exp: (t, s) => { let d = digits(t.value).slice(0, 4); if (d.length >= 3) d = d.slice(0, 2) + "/" + d.slice(2); t.value = d; L.exp = d; preview(s); },
        cvc: (t, s) => { t.value = digits(t.value).slice(0, 4); L.cvc = t.value; preview(s); },
        name: (t, s) => { L.name = t.value.slice(0, 40); preview(s); },
      },
      actions: {
        cancel: (t, s) => { L.num = L.cvc = ""; s.close({ result: null }); },
        test: (t, s) => { const set = (id, v) => { const el = s.body.querySelector(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }; set("#ccNum", "4242424242424242"); set("#ccExp", "12/29"); set("#ccCvc", "123"); set("#ccName", me().name || "Demo Renter"); haptic(5); },
        pay: async (t, s) => {
          const [mm, yy] = L.exp.split("/").map(Number); const now = new Date(jmNow()); const expOk = mm >= 1 && mm <= 12 && yy >= 0 && (2000 + yy > now.getUTCFullYear() || (2000 + yy === now.getUTCFullYear() && mm >= now.getUTCMonth() + 1));
          L.err = !luhn(L.num) ? "That card number doesn’t look right. Try the test card." : !expOk ? "Check the expiry date (MM/YY)." : !/^\d{3,4}$/.test(L.cvc) ? "Enter the 3 or 4 digit security code." : L.name.trim().length < 2 ? "Enter the name on the card." : "";
          const errBox = s.body.querySelector("#ccErr"); errBox.innerHTML = L.err ? `<div class="auth-error fade-in">${icon("alert")}<span>${esc(L.err)}</span></div>` : "";
          if (L.err) { haptic(20); if (!reduced()) s.el.animate([{ transform: "translateX(0)" }, { transform: "translateX(6px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" }], { duration: 280 }); return; }
          L.busy = true; s.refreshFoot(); await wait(reduced() ? 50 : 1300);
          const card = { brand: cardBrand(L.num) || "Card", last4: L.num.slice(-4) };
          L.num = L.cvc = ""; L.done = true; L.busy = false; s.setTitle("Paid"); s.refresh(); haptic(25);
          await wait(reduced() ? 50 : 1100); s.close({ result: card });
        },
      },
      onClose: r => { L.num = L.cvc = ""; resolve(r || null); } });
    void sheet;
  });
}

function createBooking(v, st) {
  const q = quote(v, st.start, st.end, { extras: st.extras, insurance: st.insurance, pickup: st.pickup });
  const now = jmNow(); const pct = S.settings.commission; const payment = makePayment(q, st.method, st.plan, st.card);
  const bk = {
    id: uid("bk_"), ref: refCode(), vehicleId: v.id, businessId: v.businessId, customerId: me().id, guest: null,
    driver: { ...st.driver, age: +st.driver.age }, start: st.start, end: st.end, pickup: st.pickup,
    extras: { ...st.extras }, insurance: st.insurance, quote: q, commissionPct: pct, commission: Math.round(q.hostGross * pct / 100),
    status: v.instantBook ? "confirmed" : "requested", instant: !!v.instantBook, createdAt: now,
    events: [{ at: now, text: v.instantBook ? "Booked with instant book" : "Request sent to host" }, { at: now + 1, text: paymentLine(payment) + (payment.nowAmount ? ` · ${moneyJ(payment.nowAmount)}` : "") }],
    checkout: null, checkin: null, cancel: null, payment, sample: false,
  };
  commit(s => {
    s.bookings.push(bk);
    pushMsg(s, bk.id, "system", `${v.instantBook ? `Booking ${bk.ref} confirmed.` : `Request ${bk.ref} sent.`} ${paymentLine(payment)}.`);
    if (payment.method === "bank") pushMsg(s, bk.id, "business", `Thanks! Please transfer ${moneyJ(payment.nowAmount)} to our account (sample: NCB · Account 000-SAMPLE-000) and reply with the reference ${bk.ref}.`, { auto: true });
    markRead(s, bk.id, "customer");
    if (st.saveProfile) Object.assign(me(), { phone: st.driver.phone || me().phone, licence: st.driver.licence, licenceExpiry: st.driver.expiry, age: +st.driver.age });
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
      <small>${side === "customer" ? `${esc(b.name)}` : `${esc(customerName(bk))} · ${bk.ref}`}</small>
      <span class="tline">${icon("cal")}<span>${fmtDate(bk.start)} ${fmtTime(bk.start)} → ${fmtDate(bk.end)}</span></span>
      <span class="tline">${icon("pin")}<span>${esc(pickupShort(bk))} · ${money(bk.quote.total)}</span></span>
      ${review ? `<span class="tline" style="color:var(--label);font-weight:500">${icon("star")}<span>Leave a review</span></span>` : ""}
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
      <div class="list stagger go" id="tripList" data-skel style="margin-top:16px">${list.length ? list.map((b, i) => tripCard(b, i)).join("") : emptyState(empty[0], empty[1], empty[2], ctx.local.tab === "upcoming" ? `<button type="button" class="btn sm plain press" data-act="goTab" data-tab="explore">Explore vehicles</button>` : "")}</div></div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; renderPage(ctx); },
};

const TripView = {
  id: "trip", title: ctx => { const bk = getBk(ctx.params.id); return bk ? bk.ref : "Trip"; },
  navRight: ctx => `<button type="button" class="nav-btn press" data-act="openChat" data-id="${ctx.params.id}" data-side="customer" aria-label="Message the host">${icon("chat")}</button>`,
  render(ctx) {
    const bk = getBk(ctx.params.id); if (!bk) return emptyState("suitcase", "Trip not found", "It may have been removed after a reset.");
    const v = getV(bk.vehicleId); const b = getB(bk.businessId); const q = bk.quote; const ct = changeTerms(bk); const phase = tripPhase(bk); const p = bk.payment;
    const explain = {
      requested: ["t-warn", "clock", `Waiting for ${esc(b.name)} to accept. Requests expire if the host doesn’t reply before pick-up.`],
      confirmed: ["t-info", "check", `You’re booked. Pick-up: ${esc(pickupLong(bk))} on ${fmtDT(bk.start)}. Bring your licence.`],
      active: ["t-pos", "key", `Enjoy the drive. Return by ${fmtDT(bk.end)}.${toMs(bk.end) < jmNow() ? " You’re past the return time, so late fees may apply." : ""}`],
      completed: ["t-grey", "checkCircle", `Trip completed${bk.checkin ? ` on ${fmtDT(bk.checkin.at)}` : ""}. ${bk.checkin?.fees?.total ? `Extra charges of ${money(bk.checkin.fees.total)} were taken from the deposit.` : "Deposit released (demo)."}`],
      cancelled: ["t-neg", "x", `Cancelled. ${bk.cancel ? `Fee ${money(bk.cancel.fee)} · ${money(bk.cancel.refund)} refunded (demo).` : ""}`],
      declined: ["t-neg", "x", "The host declined this request. Anything you paid was refunded (demo)."],
      expired: ["t-grey", "clock", "This request expired before the host replied. Anything you paid was refunded (demo)."],
    }[bk.status];
    const reviewed = reviewFor(bk.id);
    return `<div class="inner" style="padding-top:8px">
      <div class="trip-hero sk"><img class="fade" src="${coverURL(v)}" alt="${esc(vFull(v))}"><div class="th-over">${statusPill(bk.status)}<b>${esc(vFull(v))}</b><small>${esc(b.name)} · ${bk.ref}</small></div></div>
      <div class="explain ${explain[0]}">${icon(explain[1])}<span>${explain[2]}</span></div>
      <h3 class="group-title">Trip</h3>
      <div class="group">
        ${row({ label: "Pick-up", value: fmtDT(bk.start) })}${row({ label: "Return", value: fmtDT(bk.end) })}
        ${row({ label: "Where", sub: esc(pickupLong(bk)), value: esc(pickupShort(bk)) })}
        ${row({ label: "Vehicle", sub: esc(locatedIn(v)), value: ["confirmed", "active"].includes(bk.status) ? esc(v.plate) : "" })}
        ${row({ label: "Driver", value: `${esc(bk.driver.name)} · licence •••• ${esc(String(bk.driver.licence).slice(-4))}` })}
        ${row({ label: "Cover", value: `${q.insurance.name} · excess ${money(q.excess)}` })}
      </div>
      <h3 class="group-title">Payment</h3>
      <div class="breakdown"><div class="bl total"><span>Total</span><b>${money(q.total)}</b></div><div class="bl now"><span>${esc(paymentLine(p))}</span><b>${money(p?.nowAmount ?? q.deposit)}</b></div><div class="bl"><span>Due at pick-up</span><b>${money(p?.laterAmount ?? q.total)}</b></div></div>
      ${bk.checkout ? `<h3 class="group-title">Check-out record</h3><div class="group">${row({ label: "Fuel at pick-up", value: `${bk.checkout.fuel}/8` })}${row({ label: "Odometer", value: `${(+bk.checkout.km).toLocaleString()} km` })}${bk.checkout.notes ? row({ label: "Notes", sub: esc(bk.checkout.notes) }) : ""}</div>` : ""}
      <h3 class="group-title">Manage</h3>
      <div class="group icons">
        ${row({ ic: "chat", label: `Message ${esc(b.name)}`, act: "openChat", attrs: `data-id="${bk.id}" data-side="customer"` })}
        ${row({ ic: "receipt", label: "Receipt", act: "receipt" })}
        ${phase !== "past" ? row({ ic: "cal", label: ct.extendOnly ? "Change return time" : "Change dates", sub: esc(ct.note), act: ct.ok ? "change" : "noop", chevron: ct.ok }) : ""}
        ${bk.status === "confirmed" || bk.status === "requested" ? row({ ic: "x", label: bk.status === "requested" ? "Withdraw request" : "Cancel booking", sub: esc(cancelTerms(bk).note), act: "cancel", cls: "danger" }) : ""}
        ${canReview(bk) ? row({ ic: "star", label: "Leave a review", sub: "Only customers with a completed trip can review", act: "review" }) : reviewed ? row({ ic: "star", label: "Your review", sub: `${reviewed.rating} of 5 · “${esc(reviewed.text.slice(0, 60))}${reviewed.text.length > 60 ? "…" : ""}”` }) : ""}
        ${row({ ic: "flag", label: "Report a problem", act: "report", attrs: `data-booking="${bk.id}"` })}
      </div>
      <h3 class="group-title">Policies</h3>
      <div class="policy">${icon("cal")}<div><b>${POLICIES[b.policy].name} cancellation</b><p>${POLICIES[b.policy].desc}</p></div></div>
      <div class="policy">${icon("lock")}<div><b>Deposit ${money(q.deposit)}</b><p>${esc(b.damagePolicy)}</p></div></div>
      <h3 class="group-title">Timeline</h3>
      <ol class="timeline">${bk.events.slice().sort((a, z) => a.at - z.at).map(e => `<li><span class="dot"></span><div>${esc(e.text)}<small>${fmtDT(fromMs(e.at))}</small></div></li>`).join("")}</ol>
      <button type="button" class="btn block plain press" style="margin-top:20px" data-act="openVehicle" data-id="${v.id}">${icon("car")}View listing</button>
    </div>`;
  },
  actions: {
    receipt: (t, ctx) => openReceipt(getBk(ctx.params.id)),
    change: (t, ctx) => openChangeDates(getBk(ctx.params.id)),
    review: (t, ctx) => openReview(getBk(ctx.params.id)),
    cancel: async (t, ctx) => {
      const bk = getBk(ctx.params.id); const terms = cancelTerms(bk);
      const msg = `${esc(terms.note)}<br>${terms.fee ? `Cancellation fee ${money(terms.fee)}.` : "No cancellation fee."} ${terms.paid ? `${money(terms.refund)} of the ${money(terms.paid)} you paid is refunded (demo).` : "Nothing was paid in advance."}${terms.owed ? ` ${money(terms.owed)} would be owed to the host.` : ""}`;
      const r = await actionSheet({ title: bk.status === "requested" ? "Withdraw this request?" : "Cancel this booking?", message: msg, actions: [{ label: bk.status === "requested" ? "Withdraw request" : "Cancel booking", style: "destructive", value: "yes" }], cancel: "Keep booking" });
      if (r !== "yes") return;
      commit(s => { const b = getBk(bk.id); b.status = "cancelled"; b.cancel = { at: jmNow(), fee: terms.fee, refund: terms.refund, owed: terms.owed, by: "customer" }; b.events.push({ at: jmNow(), text: `Cancelled by customer · fee ${moneyJ(terms.fee)}` }); pushMsg(s, b.id, "system", `Booking cancelled by the customer. Fee ${moneyJ(terms.fee)}, refund ${moneyJ(terms.refund)} (demo).`); });
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
          <button type="button" class="row tap" data-act="pick" data-which="end">${icoBox("cal")}<span class="lbl"><small>Return</small><b>${fmtDT(L.end)}</b></span>${chev()}</button></div>
        ${same ? "" : `<div class="status-line ${av.ok ? "ok" : "no"}">${icon(av.ok ? "checkCircle" : "ban")}${av.ok ? "Vehicle is free for the new dates" : esc(av.label) + ". Try other dates."}</div>`}
        <div class="breakdown" style="margin-top:12px">
          <div class="bl"><span>Current total</span><b>${money(bk.quote.total)}</b></div>
          <div class="bl"><span>New total (${plural(q.days, "day")})</span><b>${money(q.total)}</b></div>
          ${ct.fee ? `<div class="bl fee"><span>Change fee (strict policy)</span><b>${money(ct.fee)}</b></div>` : ""}
          <div class="bl total"><span>${diff >= 0 ? "You’ll pay" : "You’ll save"}</span><b>${money(Math.abs(diff))}</b></div></div>
        <p class="group-foot">${esc(ct.note)} Balances are settled at pick-up or return.</p>`;
    },
    footer: () => { const av = checkAvail(v, L.start, L.end, bk.id); const same = L.start === bk.start && L.end === bk.end; return `<button type="button" class="btn block press" data-act="save" ${av.ok && !same ? "" : "disabled"}>Confirm new dates</button>`; },
    actions: {
      pick: async (t, s) => { const r = await pickTrip({ start: L.start, end: L.end, which: t.dataset.which || "start", lockStart: !!ct.extendOnly }); if (r) { if (ct.extendOnly) r.start = bk.start; Object.assign(L, r); s.refresh(); } },
      save: (t, s) => {
        if (!checkAvail(v, L.start, L.end, bk.id).ok) { toast("Those dates aren’t free", { tone: "warn" }); return; }
        commit(st => { const b = getBk(bk.id); const old = `${fmtDate(b.start)}–${fmtDate(b.end)}`; b.start = L.start; b.end = L.end; b.quote = quote(v, L.start, L.end, { extras: b.extras, insurance: b.insurance, pickup: b.pickup }); b.commission = Math.round(b.quote.hostGross * b.commissionPct / 100); if (b.payment) { b.payment.laterAmount = b.payment.plan === "full" ? Math.max(0, b.quote.total + b.quote.deposit - b.payment.nowAmount) : b.payment.method === "cash" ? b.quote.total + b.quote.deposit : b.quote.total; } if (ct.fee) b.changeFees = (b.changeFees || 0) + ct.fee; b.events.push({ at: jmNow(), text: `Dates changed from ${old} to ${fmtDate(L.start)}–${fmtDate(L.end)}${ct.fee ? ` · fee ${moneyJ(ct.fee)}` : ""}` }); pushMsg(st, b.id, "system", `Dates changed by the customer: ${fmtRange(L.start, L.end)}.`); });
        s.close(); haptic(12); toast("Dates updated");
      },
    } });
}

function openReceipt(bk) {
  const v = getV(bk.vehicleId); const b = getB(bk.businessId); const q = bk.quote; const f = bk.checkin?.fees; const p = bk.payment;
  const text = () => [`${CONFIG.APP_NAME} receipt (DEMO · sample data)`, `Ref ${bk.ref}`, `${vFull(v)} from ${b.name}`, `${fmtRange(bk.start, bk.end)}`, `Rental ${moneyJ(q.rental + q.seasonal)}`, ...q.extras.map(e => `${e.label} ${moneyJ(e.amount)}`), `${q.insurance.name} ${moneyJ(q.insurance.amount)}`, `Service fee ${moneyJ(q.serviceFee)}`, `GCT ${moneyJ(q.gct)}`, `Total ${moneyJ(q.total)}`, `Deposit ${moneyJ(q.deposit)}`, `Payment: ${paymentLine(p)} ${moneyJ(p?.nowAmount || 0)}`].join("\n");
  Sheets.open({ title: "Receipt", size: "large",
    render: () => `<div class="receipt"><div class="receipt-head"><span class="brand-mark" style="width:40px;height:40px;border-radius:11px">${BRAND_SVG}</span><div><b>${esc(CONFIG.APP_NAME)}</b><small>Demo receipt · sample data · ${bk.ref}</small></div>${statusPill(bk.status)}</div>
      <dl class="kv"><dt>Vehicle</dt><dd>${esc(vFull(v))}</dd><dt>Host</dt><dd>${esc(b.name)}</dd><dt>Customer</dt><dd>${esc(customerName(bk))}</dd><dt>Pick-up</dt><dd>${fmtDT(bk.start)}</dd><dt>Return</dt><dd>${fmtDT(bk.end)}</dd><dt>Where</dt><dd>${esc(pickupShort(bk))}</dd><dt>Booked</dt><dd>${fmtDT(fromMs(bk.createdAt))}</dd></dl>
      <div class="hr"></div>${breakdownHTML(q)}
      <div class="hr"></div>
      <div class="breakdown">
        <div class="bl now"><span>${esc(paymentLine(p))}</span><b>${money(p?.nowAmount ?? q.deposit)}</b></div>
        <div class="bl"><span>Due at pick-up</span><b>${money(p?.laterAmount ?? q.total)}</b></div>
        ${bk.changeFees ? `<div class="bl fee"><span>Date change fees</span><b>${money(bk.changeFees)}</b></div>` : ""}
        ${f ? `${f.late ? `<div class="bl fee"><span>Late return (${f.lateH} h)</span><b>${money(f.late)}</b></div>` : ""}${f.mil ? `<div class="bl fee"><span>Extra mileage (${f.extraKm} km)</span><b>${money(f.mil)}</b></div>` : ""}${f.fuelFee ? `<div class="bl fee"><span>Fuel top-up</span><b>${money(f.fuelFee)}</b></div>` : ""}${f.damage ? `<div class="bl fee"><span>Damage</span><b>${money(f.damage)}</b></div>` : ""}${f.other ? `<div class="bl fee"><span>Other fees</span><b>${money(f.other)}</b></div>` : ""}<div class="bl minus"><span>Deposit released</span><b>${money(f.depositRefund)}</b></div>` : ""}
        ${bk.cancel ? `<div class="bl fee"><span>Cancellation fee</span><b>${money(bk.cancel.fee)}</b></div><div class="bl minus"><span>Refunded</span><b>${money(bk.cancel.refund)}</b></div>` : ""}
      </div>
      <p class="bl-note">Demo receipt. No real payment was taken${p?.card ? `; the card shown is from the demo payment screen` : ""}.</p></div>`,
    footer: () => `<button type="button" class="btn block plain press" data-act="copyR">${icon("copy")}Copy receipt text</button>`,
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
    footer: () => `<button type="button" class="btn block press" data-act="post">Post review</button>`,
    inputs: { txt: t => { L.text = t.value; } },
    actions: {
      star: (t, s) => { L.rating = +t.dataset.n; haptic(6); for (const b of $$(".star-input button", s.body)) { const n = +b.dataset.n; b.classList.toggle("on", n <= L.rating); b.setAttribute("aria-checked", n === L.rating); b.classList.remove("pop"); if (n <= L.rating && !reduced()) { void b.offsetWidth; b.style.animationDelay = `${(n - 1) * 40}ms`; b.classList.add("pop"); } } s.body.querySelector("#starLbl").textContent = labels[L.rating]; },
      post: (t, s) => {
        if (!L.rating) { toast("Tap the stars to rate", { tone: "warn" }); return; }
        if (L.text.trim().length < 4) { toast("Add a few words about the trip", { tone: "warn" }); return; }
        const nm = me().name.split(" "); const author = nm.length > 1 ? `${nm[0]} ${nm[nm.length - 1][0]}.` : nm[0];
        commit(st => { st.reviews.push({ id: uid("rv_"), bookingId: bk.id, vehicleId: v.id, businessId: v.businessId, author, from: me().parish || "Jamaica", rating: L.rating, text: L.text.trim(), at: jmNow(), sample: false }); getBk(bk.id).events.push({ at: jmNow(), text: `Review posted · ${L.rating} of 5` }); });
        s.close(); haptic(15); toast("Thanks for your review", { icon: "star" });
      },
    } });
}
