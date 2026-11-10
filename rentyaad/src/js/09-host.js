/* ============ business (host) side ============ */
function bizSwitcher() {
  const b = getB(S.hostBizId);
  return `<button type="button" class="biz-switch press" data-act="switchBiz">${bizLogo(b, "sm")}<span class="bs-txt"><small>Managing</small><b>${esc(b.name)} ${verified(b)} ${smp(b.sample)}</b></span>${icon("chevD", "muted")}</button>`;
}
function bizStatusBanner(b) {
  if (b.approval === "pending") return `<div class="banner warn">${icon("clock")}<span><b>Awaiting marketplace approval.</b> Your listings stay hidden until an admin approves the business. In this demo, switch to Admin → Businesses to approve it.</span></div>`;
  if (b.approval === "rejected") return `<div class="banner warn">${icon("ban")}<span><b>Application rejected.</b> Update your details and contact the marketplace team.</span></div>`;
  if (b.approval === "suspended") return `<div class="banner warn">${icon("ban")}<span><b>Business suspended.</b> Your listings are hidden from customers.</span></div>`;
  if (!b.verified) return `<div class="banner gold">${icon("shield")}<span><b>Verification pending.</b> Customers can book, but you won’t show the verified badge until the admin verifies your documents.</span></div>`;
  return "";
}
const hostActions = {
  switchBiz: async () => {
    const list = S.businesses;
    const r = await actionSheet({ title: "Manage which business?", message: "For the demo you can act as any host.", actions: [...list.map(b => ({ label: `${b.name}${b.id === S.hostBizId ? " ✓" : ""}`, value: b.id })), { label: "Sign up a new business", value: "__new" }] });
    if (!r) return; if (r === "__new") { openSignup(); return; }
    commit(st => { st.hostBizId = r; }, { render: false }); Nav.setRole("business"); toast(`Now managing ${getB(r).name}`);
  },
};
function kpi(label, ic, value, fmt, sub, wide) { return `<div class="kpi ${wide ? "wide" : ""}"><span class="k">${icon(ic)}${label}</span><span class="v" data-count="${value}" data-fmt="${fmt}">${fmt === "money" ? money(value) : value}</span>${sub ? `<span class="s">${sub}</span>` : ""}</div>`; }
function barChart(data, o = {}) {
  const W = 320, H = 150, padL = 40, padB = 22, padT = 10; const pw = W - padL - 4, ph = H - padB - padT;
  const max = Math.max(...data.map(d => d.value), 1); const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const n = Math.ceil(max / p); return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; })();
  const bw = pw / data.length; const w = Math.max(6, bw * 0.62);
  const ticks = [0, nice / 2, nice];
  let g = ticks.map(t => { const y = padT + ph - (t / nice) * ph; return `<line class="grid" x1="${padL}" x2="${W - 2}" y1="${y}" y2="${y}"/><text x="${padL - 6}" y="${y + 3}" text-anchor="end">${moneyShort(t)}</text>`; }).join("");
  g += data.map((d, i) => {
    const h = Math.max(d.value ? 3 : 0, (d.value / nice) * ph); const x = padL + i * bw + (bw - w) / 2; const y = padT + ph - h; const r = Math.min(4, w / 2, h);
    const path = h ? `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z` : "";
    const tip = `${d.label}: ${money(d.value)}`;
    return `${path ? `<path class="bar ${d.current ? "hi" : ""}" style="--i:${i}" d="${path}"/>` : ""}<rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${ph}" data-act="tip" data-tip="${esc(tip)}" data-i="${i}"><title>${esc(tip)}</title></rect>${i % 2 === (data.length - 1) % 2 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${d.label}</text>` : ""}`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "Bar chart")}">${g}</svg><div class="chart-tip" aria-live="polite">${o.hint || "Tap a bar for the exact amount"}</div>`;
}
function chartTip(t, root) { const card = t.closest(".card"); card.querySelector(".chart-tip").innerHTML = `<b>${esc(t.dataset.tip)}</b>`; for (const b of $$(".bar", card)) b.classList.remove("sel"); const bars = $$(".bar", card); const idx = +t.dataset.i; const target = bars.find(b => +getComputedStyle(b).getPropertyValue("--i") === idx); target?.classList.add("sel"); haptic(3); }

const DashboardView = {
  id: "dash", large: true, ptr: true, title: () => "Dashboard",
  navRight: () => `<button type="button" class="nav-btn press" data-act="switchBiz" aria-label="Switch business">${icon("swap")}</button>`,
  render() {
    const b = getB(S.hostBizId); const st = hostStats(b.id); const comm = S.settings.commission;
    const dayRow = (bk, kind) => { const v = getV(bk.vehicleId); return `<button type="button" class="row tap" data-act="openHostBooking" data-id="${bk.id}"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><span class="lbl"><b>${kind === "pick" ? "Pick-up" : "Return"} · ${fmtTime(kind === "pick" ? bk.start : bk.end)}</b><small>${esc(vName(v))} · ${esc(customerName(bk))} · ${esc(LOC[bk.pickup].short)}</small></span>${statusPill(bk.status, true)}</button>`; };
    return `<div class="inner"><h1 class="large-title">Dashboard</h1>${bizSwitcher()}${bizStatusBanner(b)}
      ${st.requests.length ? `<button type="button" class="banner info press" style="width:100%;border:0;text-align:left" data-act="goTab" data-tab="hbookings">${icon("inbox")}<span><b>${plural(st.requests.length, "booking request")}</b> waiting for you to accept or decline.</span></button>` : ""}
      <div class="kpis stagger go">
        ${kpi("Revenue this week", "dollar", st.week, "money", `${st.weekCount} trips · ${money(st.weekNet)} after ${comm}%`)}
        ${kpi("Revenue this month", "chart", st.month, "money", `${MONL[new Date(jmNow()).getUTCMonth()]} · ${money(st.monthNet)} net`)}
        ${kpi("Fleet utilisation", "gauge", Math.round(st.util * 100), "pct", "Booked time, last 30 days")}
        ${kpi("Rating", "star", st.rating.count ? +st.rating.avg.toFixed(1) : 0, "dec", `${plural(st.rating.count, "review")}`)}
      </div>
      <h2 class="sec-title">Revenue · last 8 weeks</h2>
      <div class="card">${barChart(st.weeks, { label: "Revenue per week, last 8 weeks", hint: "Gross before commission, by pick-up week. Tap a bar." })}</div>
      <h2 class="sec-title">Today</h2>
      <div class="group">${st.pickups.length || st.returns.length ? [...st.pickups.map(x => dayRow(x, "pick")), ...st.returns.map(x => dayRow(x, "ret"))].join("") : `<div class="row"><span class="lbl"><b>No pick-ups or returns today</b><small>Enjoy the quiet day</small></span></div>`}</div>
      <h2 class="sec-title">Utilisation by vehicle</h2>
      <div class="card">${st.perVehicle.length ? st.perVehicle.map((u, i) => `<div class="urow"><span>${esc(vName(u.v))}${u.v.maintenance ? " 🔧" : ""}</span><div class="ubar"><i style="--p:${u.p.toFixed(3)};--i:${i}"></i></div><b>${Math.round(u.p * 100)}%</b></div>`).join("") : `<p class="muted">Add vehicles to see utilisation.</p>`}<p class="chart-tip">Share of the last 30 days each vehicle was out on a trip.</p></div>
      <h2 class="sec-title">Top vehicles · 90 days</h2>
      <div class="group">${st.top.slice(0, 5).map((t, i) => `<button type="button" class="row tap" data-act="openFleetVehicle" data-id="${t.v.id}"><span class="rank ${i === 0 ? "r1" : ""}">${i + 1}</span><span class="lbl"><b>${esc(vName(t.v))}</b><small>${plural(t.trips, "trip")}</small></span><span class="val strong">${money(t.rev)}</span>${chev()}</button>`).join("") || `<div class="row"><span class="lbl"><b>No trips yet</b></span></div>`}</div>
      <h2 class="sec-title">Cancellations · 90 days</h2>
      <div class="stat-row">${kpi("Cancelled", "x", st.cancelled.length, "num", "trips")}${kpi("Rate", "percent", Math.round(st.cancelRate * 100), "pct", "of bookings")}${kpi("Lost", "dollar", st.lost, "money", "after fees")}</div>
      <h2 class="sec-title">Latest reviews</h2>
      ${st.reviews.slice(0, 3).map(reviewHTML).join("") || `<div class="group pad"><p>No reviews yet. Reviews come only from completed trips.</p></div>`}
    </div>`;
  },
  actions: { ...hostActions, tip: chartTip, openFleetVehicle: t => Nav.push(FleetVehicleView, { id: t.dataset.id }) },
};

/* ---- bookings inbox ---- */
function hostCard(bk, i) {
  const v = getV(bk.vehicleId); const q = bk.quote;
  return `<article class="hcard" style="--i:${i}" data-id="${bk.id}">
    <div class="hcard-top" role="button" tabindex="0" data-act="openHostBooking" data-id="${bk.id}"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(customerName(bk))} ${bk.customerId === "me" ? "" : smp()}</b><small>${esc(vName(v))} · ${bk.ref}</small><small>${fmtDate(bk.start)} ${fmtTime(bk.start)} → ${fmtDate(bk.end)} · ${plural(q.days, "day")}</small></div>${statusPill(bk.status, true)}</div>
    <div class="tline">${icon("pin")}${esc(LOC[bk.pickup].short)} · ${money(q.hostGross)} before ${bk.commissionPct}% commission${bk.extras?.childSeat ? ` · ${bk.extras.childSeat} child seat` : ""}</div>
    ${bk.status === "requested" ? `<div class="tactions"><button type="button" class="btn sm plain press" data-act="decline" data-id="${bk.id}">Decline</button><button type="button" class="btn sm press" data-act="accept" data-id="${bk.id}">${icon("check")}Accept</button></div>` : ""}
  </article>`;
}
function acceptBooking(id) {
  const bk = getBk(id); const v = getV(bk.vehicleId);
  const clash = S.bookings.find(o => o.id !== id && o.vehicleId === v.id && ["confirmed", "active"].includes(o.status) && overlaps(toMs(bk.start), toMs(bk.end), toMs(o.start), toMs(o.end)));
  if (clash || v.maintenance) { toast(v.maintenance ? "Vehicle is in maintenance mode" : `Clashes with ${clash.ref}`, { tone: "warn" }); return false; }
  commit(st => { const b = getBk(id); b.status = "confirmed"; b.events.push({ at: jmNow(), text: "Host accepted the request" }); pushMsg(st, id, "system", `Request accepted by ${getB(b.businessId).name}. See you on ${fmtDate(b.start)}!`); });
  haptic(12); toast("Booking accepted"); return true;
}
async function declineBooking(id) {
  const r = await actionSheet({ title: "Decline this request?", message: "The customer’s deposit hold is released (mock) and they’re told by message.", actions: [{ label: "Decline request", style: "destructive", value: "yes" }] });
  if (r !== "yes") return false;
  commit(st => { const b = getBk(id); b.status = "declined"; b.events.push({ at: jmNow(), text: "Host declined the request" }); pushMsg(st, id, "system", "The host declined this request. Your deposit hold was released (mock)."); });
  toast("Request declined"); return true;
}
const HostBookingsView = {
  id: "hbookings", large: true, ptr: true, title: () => "Bookings",
  init(ctx) { ctx.local.tab = bizBookings(S.hostBizId).some(b => b.status === "requested") ? "requests" : "upcoming"; },
  render(ctx) {
    const b = getB(S.hostBizId); const all = bizBookings(b.id); const now = jmNow();
    const g = { requests: all.filter(x => x.status === "requested").sort((a, z) => a.start.localeCompare(z.start)), upcoming: all.filter(x => x.status === "confirmed").sort((a, z) => a.start.localeCompare(z.start)), active: all.filter(x => x.status === "active").sort((a, z) => a.end.localeCompare(z.end)), past: all.filter(x => tripPhase(x) === "past").sort((a, z) => z.start.localeCompare(a.start)).slice(0, 40) };
    const list = g[ctx.local.tab]; const instantN = S.vehicles.filter(v => v.businessId === b.id && v.instantBook).length; const total = S.vehicles.filter(v => v.businessId === b.id).length;
    return `<div class="inner"><h1 class="large-title">Bookings</h1>
      <div class="banner info">${icon("bolt")}<span>Instant book is on for ${instantN} of ${total} vehicles. Other vehicles send you requests to accept or decline. Change it per vehicle in Fleet.</span></div>
      ${seg("tab", [{ v: "requests", label: `Requests<span class="n">${g.requests.length}</span>` }, { v: "upcoming", label: `Upcoming<span class="n">${g.upcoming.length}</span>` }, { v: "active", label: `Active<span class="n">${g.active.length}</span>` }, { v: "past", label: "Past" }], ctx.local.tab, "block")}
      <div class="list stagger go" data-skel style="margin-top:14px">${list.length ? list.map(hostCard).join("") : emptyState("inbox", { requests: "No requests", upcoming: "No upcoming bookings", active: "Nobody on a trip", past: "No past bookings" }[ctx.local.tab], "New bookings for your fleet show up here.")}</div>
      ${ctx.local.tab === "active" && g.active.some(x => toMs(x.end) < now) ? `<p class="group-foot">Overdue returns are charged late fees at check-in.</p>` : ""}</div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; renderPage(ctx); },
  actions: {
    accept: (t, ctx) => { const card = t.closest(".hcard"); const id = t.dataset.id; const bk = getBk(id); const v = getV(bk.vehicleId); if (v.maintenance) { acceptBooking(id); return; } card.classList.add("leaving"); setTimeout(() => { if (!acceptBooking(id)) card.classList.remove("leaving"); }, reduced() ? 0 : 260); },
    decline: async (t, ctx) => { await declineBooking(t.dataset.id); },
  },
};

const HostBookingView = {
  id: "hbooking", title: ctx => getBk(ctx.params.id)?.ref || "Booking",
  navRight: ctx => `<button type="button" class="nav-btn press" data-act="openChat" data-id="${ctx.params.id}" data-side="business" aria-label="Message the customer">${icon("chat")}</button>`,
  render(ctx) {
    const bk = getBk(ctx.params.id); if (!bk) return emptyState("inbox", "Booking not found", "");
    const v = getV(bk.vehicleId); const q = bk.quote; const d = bk.driver; const now = jmNow();
    const ageOk = +d.age >= v.minAge; const licOk = d.expiry && d.expiry >= bk.end.slice(0, 7);
    const ex = []; if (bk.extras?.childSeat) ex.push(`${bk.extras.childSeat} child seat`); if (bk.extras?.extraDriver) ex.push("extra driver"); if (bk.extras?.chauffeur) ex.push("chauffeur"); if (bk.extras?.delivery) ex.push(`deliver to ${bk.extras.hotel || "hotel"}`);
    const fees = bk.checkin?.fees;
    return `<div class="inner" style="padding-top:8px">
      <div class="trip-hero sk"><img class="fade" src="${coverURL(v)}" alt=""><div class="th-over">${statusPill(bk.status, true)}<b>${esc(vFull(v))}</b><small>${esc(v.plate)} · ${bk.ref}</small></div></div>
      ${bk.status === "requested" ? `<div class="btn-row" style="margin-top:12px"><button type="button" class="btn pill plain press" data-act="decline">Decline</button><button type="button" class="btn pill press" data-act="accept">${icon("check")}Accept</button></div>` : ""}
      ${bk.status === "confirmed" ? `<button type="button" class="btn block pill press" style="margin-top:12px" data-act="checkout">${icon("key")}Check out · hand over keys</button>${toMs(bk.start) - now > DAY ? `<p class="group-foot">Pick-up is ${relDate(bk.start).toLowerCase() === "tomorrow" ? "tomorrow" : "on " + fmtDate(bk.start)}. You can still check out early for the demo.</p>` : ""}` : ""}
      ${bk.status === "active" ? `<button type="button" class="btn block pill green press" style="margin-top:12px" data-act="checkin">${icon("checkCircle")}Check in · vehicle returned</button>${toMs(bk.end) < now ? `<div class="banner warn" style="margin-top:10px">${icon("clock")}<span>Overdue since ${fmtDT(bk.end)}. Late fees are calculated at check-in.</span></div>` : ""}` : ""}
      <h3 class="group-title">Customer</h3>
      <div class="group">
        ${row({ label: esc(customerName(bk)), sub: bk.customerId === "me" ? "Demo customer" : `Sample guest from ${esc(bk.guest?.from || "")}` })}
        ${row({ label: "Phone", value: esc(d.phone), act: "copy", attrs: `data-copy="${esc(d.phone)}"`, chevron: false })}
        ${row({ label: "Licence", value: `${esc(d.licence)}` })}
        ${row({ label: "Licence expiry", value: `${fmtMonthYear(d.expiry)} ${licOk ? "✓" : "⚠︎"}` })}
        ${row({ label: "Driver age", value: `${d.age} ${ageOk ? `✓ (min ${v.minAge})` : `⚠︎ under ${v.minAge}`}` })}
      </div>
      <h3 class="group-title">Trip</h3>
      <div class="group">${row({ label: "Pick-up", value: fmtDT(bk.start) })}${row({ label: "Return", value: fmtDT(bk.end) })}${row({ label: "Location", value: esc(LOC[bk.pickup].short) })}${row({ label: "Extras", value: ex.length ? esc(ex.join(", ")) : "None" })}${row({ label: "Cover", value: `${q.insurance.name}` })}${row({ label: "Booked via", value: bk.instant ? "Instant book" : "Request" })}</div>
      <h3 class="group-title">Money</h3>
      ${breakdownHTML(q)}
      <div class="breakdown" style="margin-top:10px">
        <div class="bl"><span>Your share before commission</span><b>${money(q.hostGross)}</b></div>
        <div class="bl fee"><span>Marketplace commission (${bk.commissionPct}%)</span><b>−${money(bk.commission)}</b></div>
        ${fees?.total ? `<div class="bl"><span>Return fees collected</span><b>${money(fees.total)}</b></div>` : ""}
        ${bk.cancel?.fee ? `<div class="bl"><span>Cancellation fee kept</span><b>${money(bk.cancel.fee)}</b></div>` : ""}
        <div class="bl total"><span>Payout</span><b>${money(bk.status === "cancelled" ? (bk.cancel?.fee || 0) : (["declined", "expired"].includes(bk.status) ? 0 : q.hostGross - bk.commission + (fees?.total || 0)))}</b></div></div>
      ${bk.checkout ? recordHTML("Check-out", bk.checkout) : ""}
      ${bk.checkin ? recordHTML("Check-in", bk.checkin) + feesHTML(bk.checkin.fees, q.deposit) : ""}
      <h3 class="group-title">Timeline</h3>
      <ol class="timeline">${bk.events.slice().sort((a, z) => a.at - z.at).map(e => `<li><span class="dot"></span><div>${esc(e.text)}<small>${fmtDT(fromMs(e.at))}</small></div></li>`).join("")}</ol>
      <div class="group icons" style="margin-top:18px">${row({ ic: "chat", color: "#00A884", label: "Message customer", act: "openChat", attrs: `data-id="${bk.id}" data-side="business"` })}${row({ ic: "flag", color: "#FF3B30", label: "Report a problem", act: "report", attrs: `data-booking="${bk.id}"` })}</div>
    </div>`;
  },
  actions: {
    accept: (t, ctx) => acceptBooking(ctx.params.id),
    decline: (t, ctx) => declineBooking(ctx.params.id),
    checkout: (t, ctx) => openCheckSheet(getBk(ctx.params.id), "out"),
    checkin: (t, ctx) => openCheckSheet(getBk(ctx.params.id), "in"),
  },
};
function recordHTML(title, r) {
  return `<h3 class="group-title">${title} · ${fmtDT(r.at)}</h3><div class="group">${row({ label: "Fuel", value: `${r.fuel}/8 ${fuelWord(r.fuel)}` })}${row({ label: "Odometer", value: `${(+r.km).toLocaleString()} km` })}${r.notes ? row({ label: "Damage notes", sub: esc(r.notes) }) : ""}</div>
    <div class="photo-grid" style="margin-top:10px">${(r.photos || []).map(p => `<div class="ph ${p.img || p.placeholder ? "done" : ""}">${p.img ? `<img src="${p.img}" alt="${esc(p.label)}">` : icon("camera")}<span class="lab">${esc(p.label)}${p.img ? "" : " · placeholder"}</span></div>`).join("")}</div>`;
}
function fuelWord(n) { return n >= 8 ? "(full)" : n <= 0 ? "(empty)" : n === 4 ? "(half)" : ""; }
function feesHTML(f, deposit) {
  if (!f) return "";
  return `<h3 class="group-title">Return charges</h3><div class="breakdown fees">
    <div class="bl"><span>Late return${f.lateH ? ` (${f.lateH} h)` : ""}</span><b>${money(f.late)}</b></div>
    <div class="bl"><span>Extra mileage${f.extraKm ? ` (${f.extraKm} km)` : ""}</span><b>${money(f.mil)}</b></div>
    <div class="bl"><span>Fuel top-up</span><b>${money(f.fuelFee)}</b></div>
    <div class="bl"><span>Damage</span><b>${money(f.damage)}</b></div>
    <div class="bl"><span>Other</span><b>${money(f.other)}</b></div>
    <div class="bl total"><span>Total charges</span><b>${money(f.total)}</b></div>
    <div class="bl minus"><span>Deposit released (of ${money(deposit)})</span><b>${money(f.depositRefund)}</b></div>
    ${f.owed ? `<div class="bl fee"><span>Still owed by customer</span><b>${money(f.owed)}</b></div>` : ""}</div>`;
}
function openCheckSheet(bk, kind) {
  const v = getV(bk.vehicleId); const out = kind === "out"; const prev = bk.checkout || { fuel: 8, km: 0 };
  const L = { at: out ? (toMs(bk.start) > jmNow() ? bk.start : nowStr()) : nowStr(), fuel: out ? 8 : prev.fuel, km: out ? (prev.km || 40000 + Math.floor(Math.random() * 30000)) : (+prev.km + 120 * bk.quote.days), notes: "", damage: 0, other: 0, photos: ["Front", "Back", "Left", "Right", "Interior", "Odometer"].map(label => ({ label, img: "", placeholder: false })) };
  const feeBox = s => { const box = s.body.querySelector("#feeBox"); if (box) box.innerHTML = feesHTML(returnFees(bk, L), bk.quote.deposit); };
  Sheets.open({ title: out ? "Check out · pick-up" : "Check in · return", size: "full",
    render: () => `<div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))} · ${esc(v.plate)}</b><small>${esc(customerName(bk))} · ${bk.ref}</small></div></div>
      <h3 class="group-title">${out ? "Pick-up time" : "Returned at"}</h3>
      <div class="group"><button type="button" class="row tap" data-act="when"><span class="lbl"><b>${fmtDT(L.at)}</b><small>${out ? `Booked for ${fmtDT(bk.start)}` : `Due back ${fmtDT(bk.end)}`}</small></span>${chev()}</button></div>
      <h3 class="group-title">Fuel level</h3>
      <div class="group"><div class="fuel no-drag" role="radiogroup" aria-label="Fuel level in eighths">${Array.from({ length: 8 }, (_, i) => `<button type="button" class="${i < L.fuel ? "on" : ""}" data-act="fuel" data-n="${i + 1}" aria-label="${i + 1} eighths"></button>`).join("")}</div><div class="fuel-lbl"><span>E</span><span id="fuelTxt">${L.fuel}/8 ${fuelWord(L.fuel)}</span><span>F</span></div></div>
      <h3 class="group-title">Odometer</h3>
      <div class="group"><label class="frow"><span>Kilometres</span><input type="number" inputmode="numeric" value="${L.km}" data-input="km"><span class="unit">km</span></label></div>
      ${!out && v.mileage.limit ? `<p class="group-foot">Allowance: ${v.mileage.limit} km/day × ${bk.quote.days} days = ${(v.mileage.limit * bk.quote.days).toLocaleString()} km from ${(+prev.km).toLocaleString()} km.</p>` : ""}
      <h3 class="group-title">Damage notes</h3>
      <textarea class="textarea no-drag" data-input="notes" placeholder="${out ? "Existing scratches, dents, interior condition…" : "Anything new since pick-up?"}" aria-label="Damage notes"></textarea>
      <h3 class="group-title">Photos</h3>
      <div class="photo-grid">${L.photos.map((p, i) => `<label class="ph press file-btn" id="ph${i}">${icon("camera")}<span>${p.label}</span><input type="file" accept="image/*" data-change="photo" data-i="${i}" aria-label="${p.label} photo"></label>`).join("")}</div>
      <p class="group-foot">Tap a tile to attach a photo, or <button type="button" class="link" style="padding:0" data-act="placeholders">mark all as photo placeholders</button> for the demo.</p>
      ${!out ? `<h3 class="group-title">Extra charges</h3><div class="group"><label class="frow"><span>Damage (J$)</span><input type="number" inputmode="numeric" value="0" min="0" data-input="damage"></label><label class="frow"><span>Other fees (J$)</span><input type="number" inputmode="numeric" value="0" min="0" data-input="other"></label></div><div id="feeBox"></div>` : ""}`,
    mount: s => { if (!out) feeBox(s); },
    footer: () => `<button type="button" class="btn block pill ${out ? "" : "green"} press" data-act="done">${out ? "Complete check-out · start trip" : "Complete check-in · close trip"}</button>`,
    inputs: {
      km: (t, s) => { L.km = Math.max(0, +t.value || 0); if (!out) feeBox(s); },
      notes: t => { L.notes = t.value; },
      damage: (t, s) => { L.damage = Math.max(0, +t.value || 0); feeBox(s); },
      other: (t, s) => { L.other = Math.max(0, +t.value || 0); feeBox(s); },
      photo: async (t, s) => { const i = +t.dataset.i; const f = t.files[0]; if (!f) return; try { L.photos[i].img = await readImage(f, 600, 0.7); const el = s.body.querySelector(`#ph${i}`); el.classList.add("done"); el.insertAdjacentHTML("afterbegin", `<img src="${L.photos[i].img}" alt="" class="fade-in">`); } catch (e) { toast(e.message, { tone: "warn" }); } },
    },
    actions: {
      when: async (t, s) => { const r = await pickDateTime({ value: L.at, title: out ? "Pick-up time" : "Return time" }); if (r) { L.at = r; s.refresh(); } },
      fuel: (t, s) => { L.fuel = +t.dataset.n === L.fuel ? L.fuel - 1 : +t.dataset.n; $$(".fuel button", s.body).forEach((b, i) => b.classList.toggle("on", i < L.fuel)); s.body.querySelector("#fuelTxt").textContent = `${L.fuel}/8 ${fuelWord(L.fuel)}`; haptic(3); if (!out) feeBox(s); },
      placeholders: (t, s) => { L.photos.forEach((p, i) => { if (!p.img) { p.placeholder = true; s.body.querySelector(`#ph${i}`).classList.add("done"); } }); toast("Marked as photo placeholders"); },
      done: (t, s) => {
        const rec = { at: L.at, fuel: L.fuel, km: L.km, notes: L.notes.trim(), photos: L.photos.map(p => ({ ...p, placeholder: p.placeholder || !p.img })) };
        if (out) commit(st => { const b = getBk(bk.id); b.status = "active"; b.checkout = rec; b.events.push({ at: jmNow(), text: `Checked out · fuel ${L.fuel}/8 · ${(+L.km).toLocaleString()} km` }); pushMsg(st, b.id, "system", `Trip started · fuel ${L.fuel}/8 · ${(+L.km).toLocaleString()} km${rec.notes ? ` · notes: ${rec.notes}` : ""}`); });
        else {
          if (L.km < (+prev.km || 0)) { toast("Odometer is lower than at pick-up", { tone: "warn" }); return; }
          const fees = returnFees(bk, L);
          commit(st => { const b = getBk(bk.id); b.status = "completed"; b.checkin = { ...rec, fees }; b.events.push({ at: jmNow(), text: `Checked in · charges ${moneyJ(fees.total)} · deposit released ${moneyJ(fees.depositRefund)}` }); pushMsg(st, b.id, "system", `Trip completed. Charges ${moneyJ(fees.total)}${fees.late ? ` (late ${moneyJ(fees.late)})` : ""}. Deposit released ${moneyJ(fees.depositRefund)} (mock). You can now leave a review.`); });
        }
        s.close(); haptic(20); toast(out ? "Trip started" : "Trip closed");
      },
    } });
}

/* ---- fleet ---- */
function vStatusChips(v) {
  const c = [];
  if (v.approval === "pending") c.push(`<span class="pill t-orange">${icon("clock")}In review</span>`);
  if (v.approval === "rejected") c.push(`<span class="pill t-red">${icon("x")}Rejected</span>`);
  if (v.suspended) c.push(`<span class="pill t-red">${icon("ban")}Suspended</span>`);
  if (v.maintenance) c.push(`<span class="pill t-purple">${icon("wrench")}Maintenance</span>`);
  if (!c.length) c.push(`<span class="pill t-green">${icon("check")}Live</span>`);
  if (v.instantBook) c.push(`<span class="pill t-gold">${icon("bolt")}Instant</span>`);
  return c.join(" ");
}
const FleetView = {
  id: "fleet", large: true, ptr: true, title: () => "Fleet",
  navRight: () => `<button type="button" class="nav-btn press" data-act="addVehicle" aria-label="Add a vehicle">${icon("plus")}</button>`,
  render() {
    const b = getB(S.hostBizId); const vs = S.vehicles.filter(v => v.businessId === b.id);
    const live = vs.filter(isLive).length;
    return `<div class="inner"><h1 class="large-title">Fleet</h1>
      <p class="lede">${plural(vs.length, "vehicle")} · ${live} live · ${vs.filter(v => v.maintenance).length} in maintenance · ${vs.filter(v => v.approval === "pending").length} in review</p>
      ${bizStatusBanner(b)}
      <div class="list stagger go" data-skel>${vs.map((v, i) => `<article class="tcard press" style="--i:${i}" role="button" tabindex="0" data-act="openFleetVehicle" data-id="${v.id}"><span class="tthumb sk"><img class="fade" src="${coverURL(v)}" alt="" loading="lazy"></span><div class="tinfo"><div class="trow1"><b>${esc(vName(v))} ${v.year}</b></div><small>${esc(v.plate)} · ${TYPE[v.type].name} · ${v.seats} seats</small><div style="display:flex;gap:4px;flex-wrap:wrap;margin:2px 0">${vStatusChips(v)}</div><span class="tline">${icon("dollar")}${money(v.rates.daily)}/day · deposit ${money(v.deposit)}</span></div></article>`).join("") || emptyState("car", "No vehicles yet", "Add your first vehicle to start taking bookings.")}</div>
      <button type="button" class="btn block pill press" style="margin-top:18px" data-act="addVehicle">${icon("plus")}Add a vehicle</button></div>`;
  },
  actions: { addVehicle: () => Nav.push(VehicleEditor, { id: null }), openFleetVehicle: t => Nav.push(FleetVehicleView, { id: t.dataset.id }) },
};
const FleetVehicleView = {
  id: "fleetv", title: ctx => { const v = getV(ctx.params.id); return v ? vName(v) : "Vehicle"; },
  navRight: () => `<button type="button" class="nav-btn text press" data-act="edit">Edit</button>`,
  render(ctx) {
    const v = getV(ctx.params.id); if (!v) return emptyState("car", "Vehicle removed", "");
    const bks = S.bookings.filter(b => b.vehicleId === v.id); const st = hostStats(v.businessId); const u = st.perVehicle.find(x => x.v.id === v.id); const top = st.top.find(x => x.v.id === v.id); const r = vRating(v.id);
    const upcoming = bks.filter(b => ["requested", "confirmed", "active"].includes(b.status)).sort((a, z) => a.start.localeCompare(z.start));
    return `<div class="inner" style="padding-top:8px">
      <div class="trip-hero sk"><img class="fade" src="${coverURL(v)}" alt=""><div class="th-over"><span style="display:flex;gap:4px;flex-wrap:wrap">${vStatusChips(v)}</span><b>${esc(vFull(v))}</b><small>${esc(v.plate)} · ${money(v.rates.daily)}/day</small></div></div>
      <div class="stat-row" style="margin-top:12px">${kpi("Utilisation", "gauge", Math.round((u?.p || 0) * 100), "pct", "30 days")}${kpi("Revenue", "dollar", top?.rev || 0, "money", "90 days")}${kpi("Rating", "star", r.count ? +r.avg.toFixed(1) : 0, "dec", plural(r.count, "review"))}</div>
      <h3 class="group-title">Status</h3>
      <div class="group">
        <label class="row"><span class="lbl"><b>Maintenance mode</b><small>Hide from bookings while it’s being serviced</small></span>${switchEl("m_mt", v.maintenance, 'data-change="flag" data-k="maintenance"', "Maintenance mode")}</label>
        <label class="row"><span class="lbl"><b>Instant book</b><small>Confirm bookings without your approval</small></span>${switchEl("m_ib", v.instantBook, 'data-change="flag" data-k="instantBook"', "Instant book")}</label>
      </div>
      ${v.approval === "pending" ? `<p class="group-foot">This listing is waiting for marketplace approval (Admin → Listings).</p>` : ""}
      <div class="group icons" style="margin-top:18px">
        ${row({ ic: "cal", color: "#5856D6", label: "Availability calendar", sub: "Bookings, blocked days and maintenance", act: "calendar" })}
        ${row({ ic: "pencil", label: "Edit listing", sub: "Photos, rates, seasonal pricing, rules", act: "edit" })}
        ${row({ ic: "eye", color: "#8E8E93", label: "Preview as customer", act: "openVehicle", attrs: `data-id="${v.id}"` })}
        ${row({ ic: "trash", color: "#FF3B30", label: "Remove vehicle", act: "remove", cls: "danger" })}
      </div>
      <h3 class="group-title">Upcoming & active bookings</h3>
      <div class="list">${upcoming.length ? upcoming.map((b, i) => tripCard(b, i, "host")).join("") : `<div class="group pad"><p>No upcoming bookings.</p></div>`}</div>
    </div>`;
  },
  actions: {
    edit: (t, ctx) => Nav.push(VehicleEditor, { id: ctx.params.id }),
    calendar: (t, ctx) => Nav.push(CalendarView, { id: ctx.params.id }),
    remove: async (t, ctx) => {
      const v = getV(ctx.params.id); const live = S.bookings.filter(b => b.vehicleId === v.id && ["requested", "confirmed", "active"].includes(b.status));
      if (live.length) { toast(`${plural(live.length, "booking")} still open. Use maintenance mode instead.`, { tone: "warn", ms: 3200 }); return; }
      const r = await actionSheet({ title: `Remove ${vName(v)}?`, message: "The listing disappears from search. Past bookings and reviews are kept.", actions: [{ label: "Remove vehicle", style: "destructive", value: "yes" }] });
      if (r !== "yes") return;
      await Nav.pop(); commit(st => { st.vehicles = st.vehicles.filter(x => x.id !== v.id); st.favs = st.favs.filter(x => x !== v.id); }); toast("Vehicle removed");
    },
  },
  inputs: { flag: (t, ctx) => { const k = t.dataset.k; const val = t.checked; haptic(5); commit(st => { getV(ctx.params.id)[k] = val; }, { skip: ctx }); setTimeout(() => { if (ctx.el.isConnected) renderPage(ctx); }, 420); toast(k === "maintenance" ? (val ? "Maintenance mode on" : "Back in service") : (val ? "Instant book on" : "Requests only")); } },
};

/* vehicle editor (add / edit) */
function blankVehicle() {
  const b = getB(S.hostBizId);
  return { id: null, businessId: b.id, make: "", model: "", year: new Date(jmNow()).getUTCFullYear() - 3, type: "car", seats: 5, transmission: "auto", fuel: "Petrol", rates: { daily: 7000, weekly: 43400, monthly: 154000 }, seasonal: DEFAULT_SEASONS.map(s => ({ ...s })), deposit: 40000, mileage: { limit: 200, extraPerKm: 40 }, minAge: 21, features: ["ac"], color: COLORS[1], plate: "", photos: [], approval: "pending", suspended: false, maintenance: false, instantBook: true, chauffeur: false, blocks: [], rules: [], description: "", sample: false };
}
const VehicleEditor = {
  id: "veditor", hideTabs: true,
  title: ctx => ctx.params.id ? "Edit listing" : "Add vehicle",
  navRight: () => `<button type="button" class="nav-btn text press" data-act="save">Save</button>`,
  init(ctx) { const v = ctx.params.id ? getV(ctx.params.id) : null; ctx.local.d = v ? JSON.parse(JSON.stringify(v)) : blankVehicle(); },
  render(ctx) {
    const d = ctx.local.d; const two = TWO_WHEEL.has(d.type);
    const inp = (label, k, val, type = "text", extra = "") => `<label class="frow"><span>${label}</span><input type="${type}" value="${esc(val)}" data-input="f" data-k="${k}" ${extra}></label>`;
    return `<div class="inner" style="padding-top:8px">
      <h3 class="group-title">Photos</h3>
      <div class="group"><div class="upl no-drag">${d.photos.map((p, i) => `<div class="ph done"><img src="${p}" alt="Photo ${i + 1}"><button type="button" class="rm" data-act="rmPhoto" data-i="${i}" aria-label="Remove photo">${icon("x")}</button></div>`).join("")}
        <label class="ph press file-btn">${icon("camera")}<span>Add photo</span><input type="file" accept="image/*" multiple data-change="photos" aria-label="Add photos"></label></div></div>
      <p class="group-foot">Without photos, the listing uses generated sample illustrations. Photos are resized and stored on this device.</p>
      <h3 class="group-title">Vehicle</h3>
      <div class="group">${inp("Make", "make", d.make, "text", 'placeholder="Toyota" autocapitalize="words"')}${inp("Model", "model", d.model, "text", 'placeholder="Corolla"')}${inp("Year", "year", d.year, "number", 'inputmode="numeric"')}${inp("Plate", "plate", d.plate, "text", 'placeholder="1234 AB" autocapitalize="characters"')}</div>
      <h3 class="group-title">Type</h3>
      <div class="chips">${TYPES.map(t => `<button type="button" class="sel-chip press ${d.type === t.id ? "on" : ""}" data-act="setType" data-v="${t.id}">${icon(t.icon)}${t.name}</button>`).join("")}</div>
      <div class="group" style="margin-top:12px">
        <div class="row"><span class="lbl"><b>Seats</b></span>${stepper("seats", d.seats, 1, 40)}</div>
        <div class="row"><span class="lbl"><b>Gearbox</b></span><span style="width:190px">${seg("trans", [{ v: "auto", label: "Automatic" }, { v: "manual", label: "Manual" }], d.transmission)}</span></div>
        <div class="row"><span class="lbl"><b>Fuel</b></span><span style="width:220px">${seg("fuel", ["Petrol", "Diesel", "Hybrid", "EV"].map(x => ({ v: x === "EV" ? "Electric" : x, label: x })), d.fuel)}</span></div>
      </div>
      <h3 class="group-title">Colour (for sample illustrations)</h3>
      <div class="group"><div class="swatches">${COLORS.map(c => `<button type="button" class="swatch ${d.color === c ? "on" : ""}" style="--c:${c}" data-act="setColor" data-v="${c}" aria-label="Colour ${c}"></button>`).join("")}</div></div>
      <h3 class="group-title">Features</h3>
      <div class="group">${FEATURES.filter(f => !(two && ["ac", "4x4"].includes(f.id))).map(f => `<label class="row"><span class="lbl"><b>${f.name}</b></span>${switchEl("fe_" + f.id, d.features.includes(f.id), `data-change="feat" data-v="${f.id}"`, f.name)}</label>`).join("")}
        <label class="row"><span class="lbl"><b>Chauffeur available</b><small>Customers can add a driver for ${moneyJ(EXTRAS.chauffeur.perDay)}/day</small></span>${switchEl("fe_ch", d.chauffeur, 'data-change="bool" data-k="chauffeur"', "Chauffeur available")}</label></div>
      <h3 class="group-title">Rates (J$)</h3>
      <div class="group">${inp("Daily", "rates.daily", d.rates.daily, "number", 'inputmode="numeric" min="0"')}${inp("Weekly", "rates.weekly", d.rates.weekly, "number", 'inputmode="numeric" min="0"')}${inp("Monthly", "rates.monthly", d.rates.monthly, "number", 'inputmode="numeric" min="0"')}</div>
      <p class="group-foot">Trips of 7+ days use the weekly rate per day, 28+ days the monthly rate. <button type="button" class="link" style="padding:0" data-act="autoRates">Fill weekly & monthly from daily</button></p>
      <h3 class="group-title">Seasonal pricing</h3>
      <div class="group">${d.seasonal.map((s, i) => `<div class="season"><div class="srow"><input class="nm" value="${esc(s.name)}" data-input="season" data-i="${i}" data-k="name" aria-label="Season name"><input class="dt" value="${esc(s.from)}" placeholder="MM-DD" data-input="season" data-i="${i}" data-k="from" aria-label="From (MM-DD)"><span class="muted">to</span><input class="dt" value="${esc(s.to)}" placeholder="MM-DD" data-input="season" data-i="${i}" data-k="to" aria-label="To (MM-DD)"><input class="pc" type="number" value="${s.pct}" data-input="season" data-i="${i}" data-k="pct" aria-label="Percent increase"><span class="muted">%</span></div><button type="button" class="sh-x" data-act="rmSeason" data-i="${i}" aria-label="Remove season">${icon("x")}</button></div>`).join("") || `<div class="row"><span class="lbl"><small>No seasonal pricing</small></span></div>`}
        <button type="button" class="row tap accent-row" data-act="addSeason">${icon("plus")}<span class="lbl"><b>Add season</b></span></button></div>
      <h3 class="group-title">Deposit, mileage & age</h3>
      <div class="group">${inp("Deposit (J$)", "deposit", d.deposit, "number", 'inputmode="numeric" min="0"')}${inp("Km per day", "mileage.limit", d.mileage.limit || 0, "number", 'inputmode="numeric" min="0"')}${inp("Extra per km (J$)", "mileage.extraPerKm", d.mileage.extraPerKm, "number", 'inputmode="numeric" min="0"')}
        <div class="row"><span class="lbl"><b>Minimum driver age</b></span>${stepper("minAge", d.minAge, 18, 30)}</div></div>
      <p class="group-foot">Set km per day to 0 for unlimited mileage.</p>
      <h3 class="group-title">Description & extra rules</h3>
      <textarea class="textarea" data-input="f" data-k="description" placeholder="What makes this vehicle great?" aria-label="Description">${esc(d.description)}</textarea>
      <textarea class="textarea" style="margin-top:10px" data-input="rules" placeholder="One rule per line (added to your business rules)" aria-label="Extra rules">${esc((d.rules || []).join("\n"))}</textarea>
      <h3 class="group-title">Booking</h3>
      <div class="group"><label class="row"><span class="lbl"><b>Instant book</b></span>${switchEl("fe_ib", d.instantBook, 'data-change="bool" data-k="instantBook"', "Instant book")}</label><label class="row"><span class="lbl"><b>Maintenance mode</b></span>${switchEl("fe_mt", d.maintenance, 'data-change="bool" data-k="maintenance"', "Maintenance mode")}</label></div>
      ${!ctx.params.id ? `<p class="group-foot">New listings are reviewed by the marketplace before customers can see them.</p>` : ""}
      <button type="button" class="btn block pill press" style="margin-top:20px" data-act="save">${ctx.params.id ? "Save changes" : "Submit for approval"}</button>
    </div>`;
  },
  onSeg(ctx, name, v) { if (name === "trans") ctx.local.d.transmission = v; if (name === "fuel") ctx.local.d.fuel = v; },
  onStep(ctx, name, v) { ctx.local.d[name] = v; },
  inputs: {
    f: (t, ctx) => { const d = ctx.local.d; const path = t.dataset.k.split("."); const num = t.type === "number"; let o = d; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path[path.length - 1]] = num ? (t.value === "" ? 0 : +t.value) : t.value; },
    season: (t, ctx) => { const s = ctx.local.d.seasonal[+t.dataset.i]; s[t.dataset.k] = t.dataset.k === "pct" ? +t.value || 0 : t.value; },
    rules: (t, ctx) => { ctx.local.d.rules = t.value.split("\n").map(x => x.trim()).filter(Boolean); },
    feat: (t, ctx) => { const d = ctx.local.d; const f = t.dataset.v; d.features = t.checked ? [...new Set([...d.features, f])] : d.features.filter(x => x !== f); haptic(4); },
    bool: (t, ctx) => { ctx.local.d[t.dataset.k] = t.checked; haptic(4); },
    photos: async (t, ctx) => { const files = Array.from(t.files || []).slice(0, 6); for (const f of files) { try { ctx.local.d.photos.push(await readImage(f)); } catch (e) { toast(e.message, { tone: "warn" }); } } renderPage(ctx); },
  },
  actions: {
    setType: (t, ctx) => { const d = ctx.local.d; d.type = t.dataset.v; if (TWO_WHEEL.has(d.type)) { d.seats = 2; d.features = d.features.filter(f => !["ac", "4x4", "driver"].includes(f)); } else if (d.type === "bus" && d.seats < 12) d.seats = 15; else if (d.type === "van" && d.seats < 7) d.seats = 8; renderPage(ctx); },
    setColor: (t, ctx) => { ctx.local.d.color = t.dataset.v; for (const s of $$(".swatch", ctx.content)) s.classList.toggle("on", s.dataset.v === t.dataset.v); haptic(3); },
    rmPhoto: (t, ctx) => { ctx.local.d.photos.splice(+t.dataset.i, 1); renderPage(ctx); },
    addSeason: (t, ctx) => { ctx.local.d.seasonal.push({ name: "Summer", from: "07-01", to: "08-31", pct: 10 }); renderPage(ctx); },
    rmSeason: (t, ctx) => { ctx.local.d.seasonal.splice(+t.dataset.i, 1); renderPage(ctx); },
    autoRates: (t, ctx) => { const d = ctx.local.d; d.rates.weekly = Math.round(d.rates.daily * 6.2 / 100) * 100; d.rates.monthly = Math.round(d.rates.daily * 22 / 500) * 500; renderPage(ctx); toast("Rates filled in"); },
    save: async (t, ctx) => {
      const d = ctx.local.d;
      if (!d.make.trim() || !d.model.trim()) { toast("Add the make and model", { tone: "warn" }); return; }
      if (!(d.rates.daily > 0)) { toast("Set a daily rate above J$0", { tone: "warn" }); return; }
      if (d.seasonal.some(s => !/^\d{2}-\d{2}$/.test(s.from) || !/^\d{2}-\d{2}$/.test(s.to))) { toast("Season dates must look like 12-15 (MM-DD)", { tone: "warn" }); return; }
      d.make = d.make.trim(); d.model = d.model.trim(); d.year = clamp(+d.year || 2020, 1980, 2030); d.mileage.limit = d.mileage.limit > 0 ? d.mileage.limit : null;
      if (!d.rates.weekly) d.rates.weekly = Math.round(d.rates.daily * 6.2); if (!d.rates.monthly) d.rates.monthly = Math.round(d.rates.daily * 22);
      if (!d.plate) d.plate = "NEW " + Math.floor(1000 + Math.random() * 8999);
      const isNew = !ctx.params.id;
      commit(st => { if (isNew) { d.id = "v" + Date.now().toString(36); d.createdAt = jmNow(); st.vehicles.push(d); } else { const i = st.vehicles.findIndex(v => v.id === d.id); st.vehicles[i] = { ...d }; } }, { render: false });
      await Nav.pop(); Nav.invalidate(); haptic(14); toast(isNew ? "Submitted for approval" : "Listing saved");
    },
  },
};

/* availability calendar per vehicle */
const CalendarView = {
  id: "calendar", title: () => "Availability",
  init(ctx) { const d = new Date(jmNow()); ctx.local.y = d.getUTCFullYear(); ctx.local.m = d.getUTCMonth(); },
  render(ctx) {
    const v = getV(ctx.params.id); if (!v) return ""; const { y, m } = ctx.local;
    const a = Date.UTC(y, m, 1), z = Date.UTC(y, m + 1, 1);
    const bks = S.bookings.filter(b => b.vehicleId === v.id && ["requested", "confirmed", "active", "completed"].includes(b.status) && overlaps(toMs(b.start), toMs(b.end), a, z)).sort((p, q) => p.start.localeCompare(q.start));
    return `<div class="inner" style="padding-top:8px">
      <div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))}</b><small>${esc(v.plate)} · ${v.maintenance ? "Maintenance mode on" : "In service"}</small></div></div>
      <div class="card" style="margin-top:14px">
        <div class="cal-head"><h3>${MONL[m]} ${y}</h3><div class="btns"><button type="button" class="sh-x press" data-act="prevM" aria-label="Previous month">${icon("chevL")}</button><button type="button" class="sh-x press" data-act="nextM" aria-label="Next month">${icon("chevR")}</button></div></div>
        <div id="grid">${monthGrid(v, y, m, { interactive: true })}</div>${calLegend(true)}
      </div>
      <p class="group-foot">Tap a free day to block it or mark maintenance. Tap a blocked day to free it.</p>
      <h3 class="group-title">Bookings this month</h3>
      <div class="list">${bks.length ? bks.map((b, i) => tripCard(b, i, "host")).join("") : `<div class="group pad"><p>No bookings in ${MONL[m]}.</p></div>`}</div>
    </div>`;
  },
  actions: {
    prevM: (t, ctx) => shiftMonth(ctx, -1), nextM: (t, ctx) => shiftMonth(ctx, 1),
    day: async (t, ctx) => {
      const v = getV(ctx.params.id); const k = t.dataset.k; const ms = toMs(k);
      if (ms < sod(jmNow())) { toast("That day has passed", { tone: "warn" }); return; }
      const bk = S.bookings.find(b => b.vehicleId === v.id && BLOCKING.has(b.status) && overlaps(ms, ms + DAY, toMs(b.start), toMs(b.end)));
      if (bk) { const r = await actionSheet({ title: `${fmtDate(k, true)}`, message: `${esc(customerName(bk))} · ${bk.ref} · ${STATUS[bk.status].host}`, actions: [{ label: "Open booking", value: "open" }] }); if (r === "open") Nav.push(HostBookingView, { id: bk.id }); return; }
      const bl = (v.blocks || []).find(x => x.date === k);
      const r = await actionSheet({ title: fmtDate(k, true), message: bl ? `Currently ${bl.kind === "maintenance" ? "in maintenance" : "blocked"}${bl.note ? ` · ${esc(bl.note)}` : ""}` : "This day is free for bookings.", actions: bl ? [{ label: "Make available", value: "free" }] : [{ label: "Block this day", value: "blocked" }, { label: "Mark maintenance", value: "maintenance" }] });
      if (!r) return;
      commit(st => { const veh = getV(v.id); veh.blocks = (veh.blocks || []).filter(x => x.date !== k); if (r !== "free") veh.blocks.push({ date: k, kind: r, note: r === "maintenance" ? "Maintenance" : "Blocked by host" }); });
      haptic(6); toast(r === "free" ? "Day is available" : r === "maintenance" ? "Marked for maintenance" : "Day blocked");
    },
  },
};
function shiftMonth(ctx, d) {
  let { y, m } = ctx.local; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } ctx.local.y = y; ctx.local.m = m;
  renderPage(ctx); const g = ctx.content.querySelector("#grid"); if (g && !reduced()) g.animate([{ opacity: 0, transform: `translate3d(${d * 30}px,0,0)` }, { opacity: 1, transform: "none" }], { duration: 340, easing: EASE });
}

/* ---- business profile & sign-up ---- */
function bizForm(d, mode) {
  const inp = (label, k, type = "text", extra = "") => `<label class="frow"><span>${label}</span><input type="${type}" value="${esc(d[k] || "")}" data-input="bf" data-k="${k}" ${extra}></label>`;
  return `<h3 class="group-title">Profile</h3>
    <div class="group">${inp("Business name", "name", "text", 'placeholder="Your rental company"')}
      <div class="frow"><span>Parish</span><button type="button" class="pick" data-act="parish">${esc(d.parish || "Choose")}</button></div>
      ${inp("Address", "address", "text", 'placeholder="Street, town"')}${inp("Phone", "phone", "tel", 'placeholder="+1 876…"')}${inp("WhatsApp", "whatsapp", "tel", 'placeholder="+1 876…"')}${inp("Hours", "hours", "text", 'placeholder="Mon–Sat 8 AM–6 PM"')}</div>
    <h3 class="group-title">Pick-up locations</h3>
    <div class="group">${LOCATIONS.map(l => `<label class="row"><span class="lbl"><b>${esc(l.name)}</b><small>${esc(l.parish)}</small></span>${switchEl(`pl_${mode}_${l.id}`, d.pickups.includes(l.id), `data-change="pick" data-v="${l.id}"`, l.name)}</label>`).join("")}
      <label class="row"><span class="lbl"><b>Deliver to hotels</b><small>${moneyJ(EXTRAS.delivery.flat)} flat fee for customers</small></span>${switchEl(`dl_${mode}`, d.delivery, 'data-change="bbool" data-k="delivery"', "Deliver to hotels")}</label></div>
    <h3 class="group-title">Cancellation policy</h3>
    ${seg("policy", Object.values(POLICIES).map(p => ({ v: p.id, label: p.name })), d.policy, "block")}
    <p class="group-foot" id="polDesc">${POLICIES[d.policy].desc}</p>
    <h3 class="group-title">Fuel policy</h3>
    ${seg("fuelPolicy", Object.entries(FUEL_POLICIES).map(([k, p]) => ({ v: k, label: p.name })), d.fuelPolicy, "block")}
    <h3 class="group-title">Deposit & damage policy</h3>
    <textarea class="textarea no-drag" data-input="bf" data-k="damagePolicy" aria-label="Deposit and damage policy">${esc(d.damagePolicy || "")}</textarea>
    <h3 class="group-title">House rules</h3>
    <textarea class="textarea no-drag" data-input="bf" data-k="rules" aria-label="House rules">${esc(d.rules || "")}</textarea>`;
}
const bizFormHandlers = {
  inputs: {
    bf: (t, ctx) => { ctx.local.d[t.dataset.k] = t.value; },
    pick: (t, ctx) => { const d = ctx.local.d; d.pickups = t.checked ? [...new Set([...d.pickups, t.dataset.v])] : d.pickups.filter(x => x !== t.dataset.v); haptic(4); },
    bbool: (t, ctx) => { ctx.local.d[t.dataset.k] = t.checked; haptic(4); },
  },
  onSeg(ctx, name, v) { ctx.local.d[name] = v; if (name === "policy") { const p = (ctx.body || ctx.content).querySelector("#polDesc"); if (p) p.textContent = POLICIES[v].desc; } },
  parish: async (t, ctx) => { const r = await actionSheet({ title: "Parish", actions: PARISHES.map(p => ({ label: p, value: p })) }); if (r) { ctx.local.d.parish = r; t.textContent = r; } },
};
const BizProfileView = {
  id: "bizprofile", large: true, title: () => "Business",
  navRight: () => `<button type="button" class="nav-btn text press" data-act="save">Save</button>`,
  init(ctx) { ctx.local.d = JSON.parse(JSON.stringify(getB(S.hostBizId))); },
  render(ctx) {
    const b = getB(S.hostBizId); if (ctx.local.d.id !== b.id) ctx.local.d = JSON.parse(JSON.stringify(b)); const d = ctx.local.d;
    const all = S.vehicles.filter(v => v.businessId === b.id); const allInstant = all.length && all.every(v => v.instantBook);
    return `<div class="inner"><h1 class="large-title">Business</h1>${bizSwitcher()}
      <div class="host-row" style="margin-top:0">
        <label class="file-btn press" style="border-radius:16px" aria-label="Upload logo">${bizLogo(d, "lg")}<input type="file" accept="image/*" data-change="logo"></label>
        <div><b>${esc(d.name)} ${verified(b)}</b><small>Tap the logo to upload a new one</small>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${b.approval === "approved" ? `<span class="pill t-green">${icon("check")}Approved</span>` : `<span class="pill t-orange">${icon("clock")}${b.approval === "pending" ? "Awaiting approval" : b.approval}</span>`}${b.verified ? `<span class="pill t-blue">${icon("shield")}Verified</span>` : `<span class="pill t-gold">${icon("clock")}Verification pending</span>`}</div></div></div>
      <p class="group-foot">Approval and verification are set by the marketplace admin.</p>
      ${bizForm(d, "p")}
      <h3 class="group-title">Booking mode</h3>
      <div class="group"><label class="row"><span class="lbl"><b>Instant book for all vehicles</b><small>Turn off to review every request yourself</small></span>${switchEl("ib_all", allInstant, 'data-change="ibAll"', "Instant book for all vehicles")}</label></div>
      <button type="button" class="btn block pill press" style="margin-top:20px" data-act="save">Save business profile</button>
      <div class="group icons" style="margin-top:18px">${row({ ic: "swap", color: "#8E8E93", label: "Switch business", act: "switchBiz" })}${row({ ic: "plus", color: "#34C759", label: "Sign up a new business", act: "signup" })}</div>
    </div>`;
  },
  inputs: { ...bizFormHandlers.inputs,
    logo: async (t, ctx) => { const f = t.files[0]; if (!f) return; try { ctx.local.d.logo = await readImage(f, 240, 0.8); renderPage(ctx); toast("Logo ready. Tap Save to keep it."); } catch (e) { toast(e.message, { tone: "warn" }); } },
    ibAll: (t, ctx) => { const on = t.checked; commit(st => { st.vehicles.forEach(v => { if (v.businessId === S.hostBizId) v.instantBook = on; }); }, { skip: ctx }); toast(on ? "Instant book on for all vehicles" : "All vehicles now need your approval"); },
  },
  onSeg: bizFormHandlers.onSeg,
  actions: { ...hostActions,
    parish: bizFormHandlers.parish,
    signup: () => openSignup(),
    save: (t, ctx) => { const d = ctx.local.d; if (!d.name.trim()) { toast("Add a business name", { tone: "warn" }); return; } if (!d.pickups.length) { toast("Choose at least one pick-up location", { tone: "warn" }); return; } commit(st => { const i = st.businesses.findIndex(b => b.id === d.id); const cur = st.businesses[i]; st.businesses[i] = { ...d, approval: cur.approval, verified: cur.verified }; }); haptic(12); toast("Business profile saved"); },
  },
};
function openSignup() {
  const L = { d: { id: null, name: "", parish: "", address: "", phone: "", whatsapp: "", hours: "Mon–Sat 8:00 AM–6:00 PM", pickups: [], pickupNotes: {}, delivery: false, policy: "moderate", fuelPolicy: "full-to-full", damagePolicy: "Damage is checked with photos at pick-up and return. Repairs up to the insurance excess come out of the deposit.", rules: "Drive on the left. Seatbelts at all times. No smoking.", approval: "pending", verified: false, color: COLORS[Math.floor(Math.random() * COLORS.length)], since: new Date(jmNow()).getUTCFullYear(), responseMins: 30, logo: "", sample: false } };
  Sheets.open({ title: "Sign up your business", size: "full", local: L,
    render: () => `<div class="banner info">${icon("store")}<span>List your rental company on ${esc(CONFIG.APP_NAME)}. The marketplace team reviews every business, then verifies documents for the shield badge.</span></div>${bizForm(L.d, "s")}<p class="group-foot">Commission: ${S.settings.commission}% of each booking (set by the marketplace).</p>`,
    footer: () => `<button type="button" class="btn block pill press" data-act="submit">Submit for review</button>`,
    inputs: bizFormHandlers.inputs, onSeg: bizFormHandlers.onSeg,
    actions: { parish: bizFormHandlers.parish, submit: (t, s) => {
      const d = L.d; const miss = [!d.name.trim() && "business name", !d.parish && "parish", !d.address.trim() && "address", digits(d.phone).length < 7 && "phone", !d.pickups.length && "a pick-up location"].filter(Boolean);
      if (miss.length) { toast(`Add ${miss.join(", ")}`, { tone: "warn", ms: 3000 }); return; }
      d.id = "b" + Date.now().toString(36); d.whatsapp = d.whatsapp || d.phone; d.pickupNotes = Object.fromEntries(d.pickups.map(l => [l, LOC[l].name]));
      commit(st => { st.businesses.push({ ...d }); st.hostBizId = d.id; }, { render: false });
      s.close(); Nav.setRole("business"); haptic(15); toast("Submitted. Awaiting admin approval.");
    } } });
}
