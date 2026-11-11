/* ============ host side ============ */
function myBusinesses() { const a = me(); return S.businesses.filter(b => (a.businessIds || []).includes(b.id)); }
function bizSwitcher() {
  const b = getB(S.hostBizId); if (!b) return "";
  return `<button type="button" class="biz-switch press" data-act="switchBiz">${bizLogo(b, "sm")}<span class="bs-txt"><small>Managing</small><b>${esc(b.name)} ${verified(b)} ${smp(b.sample)}</b></span>${icon("chevD", "muted")}</button>`;
}
function bizStatusBanner(b) {
  if (!b) return "";
  if (b.approval === "pending") return `<div class="banner warn">${icon("clock")}<span><b>Awaiting marketplace approval.</b> Your listings stay hidden until an admin approves the business. In this demo, switch to Admin → Businesses to approve it.</span></div>`;
  if (b.approval === "rejected") return `<div class="banner warn">${icon("ban")}<span><b>Application rejected.</b> Update your details and contact the marketplace team.</span></div>`;
  if (b.approval === "suspended") return `<div class="banner warn">${icon("ban")}<span><b>Business suspended.</b> Your listings are hidden from renters.</span></div>`;
  if (!b.verified) return `<div class="banner gold">${icon("shield")}<span><b>Verification pending.</b> Renters can book, but you won’t show the verified badge until the admin checks your ID.</span></div>`;
  return "";
}
const hostActions = {
  switchBiz: async () => {
    const list = myBusinesses();
    const r = await actionSheet({ title: "Manage which business?", message: me().demo ? "The demo account manages every sample host." : "", actions: [...list.map(b => ({ label: `${b.name}${b.id === S.hostBizId ? " ✓" : ""}`, value: b.id })), { label: "Add another business", value: "__new" }] });
    if (!r) return; if (r === "__new") { openAddBusiness(); return; }
    commit(st => { st.hostBizId = r; me().activeBizId = r; }, { render: false }); Nav.setRole("business"); toast(`Now managing ${getB(r).name}`);
  },
  listVehicle: () => Nav.push(ListingWizard, { id: null }),
  account: () => Nav.push(AccountView, {}),
};
function kpi(label, ic, value, fmt, sub, wide) { return `<div class="kpi ${wide ? "wide" : ""}"><span class="k">${icon(ic)}${label}</span><span class="v" data-count="${value}" data-fmt="${fmt}">${fmt === "money" ? moneyCompact(value) : value}</span>${sub ? `<span class="s">${sub}</span>` : ""}</div>`; }
function barChart(data, o = {}) {
  const W = 320, H = 150, padL = 40, padB = 22, padT = 10; const pw = W - padL - 4, ph = H - padB - padT;
  const max = Math.max(...data.map(d => d.value), 1); const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const n = Math.ceil(max / p); return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; })();
  const bw = pw / data.length; const w = Math.max(6, bw * 0.56);
  let g = [0, nice / 2, nice].map(t => { const y = padT + ph - (t / nice) * ph; return `<line class="grid" x1="${padL}" x2="${W - 2}" y1="${y}" y2="${y}"/><text x="${padL - 6}" y="${y + 3}" text-anchor="end">${moneyShort(t)}</text>`; }).join("");
  g += data.map((d, i) => {
    const h = Math.max(d.value ? 3 : 0, (d.value / nice) * ph); const x = padL + i * bw + (bw - w) / 2; const y = padT + ph - h; const r = Math.min(4, w / 2, h);
    const path = h ? `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z` : "";
    const tip = `${d.label}: ${money(d.value)}`;
    return `${path ? `<path class="bar ${d.current ? "hi" : ""}" style="--i:${i}" data-i="${i}" d="${path}"/>` : ""}<rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${ph}" data-act="tip" data-tip="${esc(tip)}" data-i="${i}"><title>${esc(tip)}</title></rect>${i % 2 === (data.length - 1) % 2 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${d.label}</text>` : ""}`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "Bar chart")}">${g}</svg><div class="chart-tip" aria-live="polite">${o.hint || "Tap a bar for the exact amount"}</div>`;
}
function chartTip(t) { const card = t.closest(".card"); card.querySelector(".chart-tip").innerHTML = `<b>${esc(t.dataset.tip)}</b>`; for (const b of $$(".bar", card)) b.classList.toggle("sel", b.dataset.i === t.dataset.i); haptic(3); }

const DashboardView = {
  id: "dash", large: true, ptr: true, title: () => "Today",
  navRight: () => `<button type="button" class="nav-btn press" data-act="listVehicle" aria-label="List a vehicle">${icon("plus")}</button>`,
  render() {
    const b = getB(S.hostBizId); if (!b) return emptyState("store", "No business yet", "Add your business to start hosting.", `<button type="button" class="btn sm press" data-act="switchBiz">Add a business</button>`);
    const st = hostStats(b.id); const comm = S.settings.commission; const nV = S.vehicles.filter(v => v.businessId === b.id).length;
    const dayRow = (bk, kind) => { const v = getV(bk.vehicleId); return `<button type="button" class="row tap" data-act="openHostBooking" data-id="${bk.id}"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><span class="lbl"><b>${kind === "pick" ? "Pick-up" : "Return"} · ${fmtTime(kind === "pick" ? bk.start : bk.end)}</b><small>${esc(vName(v))} · ${esc(customerName(bk))} · ${esc(pickupShort(bk))}</small></span>${statusPill(bk.status, true)}</button>`; };
    return `<div class="inner"><h1 class="large-title">Today</h1>${bizSwitcher()}${bizStatusBanner(b)}
      ${!nV ? `<div class="card" style="text-align:center;padding:26px 18px"><h3 style="font-size:18px;font-weight:650;letter-spacing:-.02em">List your first vehicle</h3><p class="muted" style="margin:6px 0 14px">Six quick steps: basics, photos, description, location, pricing and review.</p><button type="button" class="btn press" data-act="listVehicle">${icon("plus")}List a vehicle</button></div>` : ""}
      ${st.requests.length ? `<button type="button" class="banner info press" style="width:100%;text-align:left" data-act="goTab" data-tab="hbookings">${icon("inbox")}<span><b>${plural(st.requests.length, "booking request")}</b> waiting for you to accept or decline.</span></button>` : ""}
      <div class="kpis stagger go">
        ${kpi("Revenue this week", "dollar", st.week, "money", `${st.weekCount} trips · ${money(st.weekNet)} after ${comm}%`)}
        ${kpi("Revenue this month", "chart", st.month, "money", `${MONL[new Date(jmNow()).getUTCMonth()]} · ${money(st.monthNet)} net`)}
        ${kpi("Fleet utilisation", "gauge", Math.round(st.util * 100), "pct", "Booked time, last 30 days")}
        ${kpi("Rating", "star", st.rating.count ? +st.rating.avg.toFixed(1) : 0, "dec", `${plural(st.rating.count, "review")}`)}
      </div>
      <h2 class="sec-title">Today’s pick-ups & returns</h2>
      <div class="group">${st.pickups.length || st.returns.length ? [...st.pickups.map(x => dayRow(x, "pick")), ...st.returns.map(x => dayRow(x, "ret"))].join("") : `<div class="row"><span class="lbl"><b>Nothing scheduled today</b><small>New bookings show up here on the day</small></span></div>`}</div>
      ${st.pendingPay.length ? `<h2 class="sec-title">Payments to collect</h2><div class="group">${st.pendingPay.slice(0, 5).map(bk => row({ label: `${esc(customerName(bk))} · ${bk.ref}`, sub: esc(paymentLine(bk.payment)), value: money(bk.payment.method === "bank" && bk.payment.status === "pending" ? bk.payment.nowAmount : bk.payment.laterAmount), act: "openHostBooking", attrs: `data-id="${bk.id}"` })).join("")}</div>` : ""}
      <h2 class="sec-title">Revenue · last 8 weeks</h2>
      <div class="card">${barChart(st.weeks, { label: "Revenue per week, last 8 weeks", hint: "Gross before commission, by pick-up week. Tap a bar." })}</div>
      <h2 class="sec-title">Utilisation by vehicle</h2>
      <div class="card">${st.perVehicle.length ? st.perVehicle.map((u, i) => `<div class="urow"><span>${esc(vName(u.v))}${u.v.maintenance ? " · service" : u.v.paused ? " · paused" : ""}</span><div class="ubar"><i style="--p:${u.p.toFixed(3)};--i:${i}"></i></div><b>${Math.round(u.p * 100)}%</b></div>`).join("") : `<p class="muted">Add vehicles to see utilisation.</p>`}<p class="chart-tip">Share of the last 30 days each vehicle was out on a trip.</p></div>
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

/* ---- bookings ---- */
function hostCard(bk, i) {
  const v = getV(bk.vehicleId); const q = bk.quote; const p = bk.payment;
  return `<article class="hcard" style="--i:${i}" data-id="${bk.id}">
    <div class="hcard-top" role="button" tabindex="0" data-act="openHostBooking" data-id="${bk.id}"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(customerName(bk))} ${isSampleCustomer(bk) ? smp() : ""}</b><small>${esc(vName(v))} · ${bk.ref}</small><small>${fmtDate(bk.start)} ${fmtTime(bk.start)} → ${fmtDate(bk.end)} · ${plural(q.days, "day")}</small></div>${statusPill(bk.status, true)}</div>
    <div class="tline">${icon(PAYMENT_METHODS[p?.method]?.icon || "card")}<span>${esc(paymentLine(p))} · ${esc(pickupShort(bk))}</span></div>
    ${bk.status === "requested" ? `<div class="tactions"><button type="button" class="btn sm plain press" data-act="decline" data-id="${bk.id}">Decline</button><button type="button" class="btn sm press" data-act="accept" data-id="${bk.id}">Accept</button></div>` : ""}
  </article>`;
}
function acceptBooking(id) {
  const bk = getBk(id); const v = getV(bk.vehicleId);
  const clash = S.bookings.find(o => o.id !== id && o.vehicleId === v.id && ["confirmed", "active"].includes(o.status) && overlaps(toMs(bk.start), toMs(bk.end), toMs(o.start), toMs(o.end)));
  if (clash || v.maintenance) { toast(v.maintenance ? "Vehicle is in maintenance mode" : `Clashes with ${clash.ref}`, { tone: "warn" }); return false; }
  commit(st => { const b = getBk(id); b.status = "confirmed"; b.events.push({ at: jmNow(), text: "Host accepted the request" }); pushMsg(st, id, "system", `Request accepted by ${getB(b.businessId).name}. See you on ${fmtDate(b.start)}.`); });
  haptic(12); toast("Booking accepted"); return true;
}
async function declineBooking(id) {
  const r = await actionSheet({ title: "Decline this request?", message: "Anything the renter paid is refunded (demo) and they’re told by message.", actions: [{ label: "Decline request", style: "destructive", value: "yes" }] });
  if (r !== "yes") return false;
  commit(st => { const b = getBk(id); b.status = "declined"; b.events.push({ at: jmNow(), text: "Host declined the request" }); pushMsg(st, id, "system", "The host declined this request. Anything you paid was refunded (demo)."); });
  toast("Request declined"); return true;
}
const HostBookingsView = {
  id: "hbookings", large: true, ptr: true, title: () => "Bookings",
  init(ctx) { ctx.local.tab = bizBookings(S.hostBizId).some(b => b.status === "requested") ? "requests" : "upcoming"; },
  render(ctx) {
    const b = getB(S.hostBizId); if (!b) return emptyState("inbox", "No business yet", "");
    const all = bizBookings(b.id);
    const g = { requests: all.filter(x => x.status === "requested").sort((a, z) => a.start.localeCompare(z.start)), upcoming: all.filter(x => x.status === "confirmed").sort((a, z) => a.start.localeCompare(z.start)), active: all.filter(x => x.status === "active").sort((a, z) => a.end.localeCompare(z.end)), past: all.filter(x => tripPhase(x) === "past").sort((a, z) => z.start.localeCompare(a.start)).slice(0, 40) };
    const list = g[ctx.local.tab]; const vs = S.vehicles.filter(v => v.businessId === b.id); const instantN = vs.filter(v => v.instantBook).length;
    return `<div class="inner"><h1 class="large-title">Bookings</h1>
      <p class="lede">Instant book is on for ${instantN} of ${vs.length} vehicles. The rest send you requests.</p>
      ${seg("tab", [{ v: "requests", label: `Requests<span class="n">${g.requests.length}</span>` }, { v: "upcoming", label: `Upcoming<span class="n">${g.upcoming.length}</span>` }, { v: "active", label: `Active<span class="n">${g.active.length}</span>` }, { v: "past", label: "Past" }], ctx.local.tab, "block")}
      <div class="list stagger go" data-skel style="margin-top:16px">${list.length ? list.map(hostCard).join("") : emptyState("inbox", { requests: "No requests", upcoming: "No upcoming bookings", active: "Nobody on a trip", past: "No past bookings" }[ctx.local.tab], "New bookings for your vehicles show up here.")}</div></div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; renderPage(ctx); },
  actions: {
    accept: (t) => { const card = t.closest(".hcard"); const id = t.dataset.id; const v = getV(getBk(id).vehicleId); if (v.maintenance) { acceptBooking(id); return; } card.classList.add("leaving"); setTimeout(() => { if (!acceptBooking(id)) card.classList.remove("leaving"); }, reduced() ? 0 : 260); },
    decline: async (t) => { await declineBooking(t.dataset.id); },
  },
};
const HostBookingView = {
  id: "hbooking", title: ctx => getBk(ctx.params.id)?.ref || "Booking",
  navRight: ctx => `<button type="button" class="nav-btn press" data-act="openChat" data-id="${ctx.params.id}" data-side="business" aria-label="Message the renter">${icon("chat")}</button>`,
  render(ctx) {
    const bk = getBk(ctx.params.id); if (!bk) return emptyState("inbox", "Booking not found", "");
    const v = getV(bk.vehicleId); const q = bk.quote; const d = bk.driver; const now = jmNow(); const p = bk.payment;
    const ageOk = +d.age >= v.minAge; const licOk = d.expiry && d.expiry >= bk.end.slice(0, 7);
    const ex = []; if (bk.extras?.childSeat) ex.push(`${bk.extras.childSeat} child seat`); if (bk.extras?.extraDriver) ex.push("extra driver"); if (bk.extras?.chauffeur) ex.push("chauffeur");
    const fees = bk.checkin?.fees; const collect = p && (p.status === "due" || p.status === "pending") && COUNTED.has(bk.status);
    return `<div class="inner" style="padding-top:8px">
      <div class="trip-hero sk"><img class="fade" src="${coverURL(v)}" alt=""><div class="th-over">${statusPill(bk.status, true)}<b>${esc(vFull(v))}</b><small>${esc(v.plate)} · ${bk.ref}</small></div></div>
      ${bk.status === "requested" ? `<div class="btn-row" style="margin-top:12px"><button type="button" class="btn plain press" data-act="decline">Decline</button><button type="button" class="btn press" data-act="accept">Accept request</button></div>` : ""}
      ${bk.status === "confirmed" ? `<button type="button" class="btn block press" style="margin-top:12px" data-act="checkout">${icon("key")}Check out · hand over keys</button>${toMs(bk.start) - now > DAY ? `<p class="group-foot">Pick-up is on ${fmtDate(bk.start)}. You can still check out early for the demo.</p>` : ""}` : ""}
      ${bk.status === "active" ? `<button type="button" class="btn block press" style="margin-top:12px" data-act="checkin">${icon("checkCircle")}Check in · vehicle returned</button>${toMs(bk.end) < now ? `<div class="banner warn" style="margin-top:10px">${icon("clock")}<span>Overdue since ${fmtDT(bk.end)}. Late fees are calculated at check-in.</span></div>` : ""}` : ""}
      <h3 class="group-title">Renter</h3>
      <div class="group">
        ${row({ label: esc(customerName(bk)), sub: bk.guest ? `Sample guest from ${esc(bk.guest.from || "")}` : "Registered renter" })}
        ${row({ label: "Phone", value: esc(d.phone), act: "copy", attrs: `data-copy="${esc(d.phone)}"`, chevron: false })}
        ${row({ label: "Licence", value: esc(d.licence) })}
        ${row({ label: "Licence expiry", value: `${fmtMonthYear(d.expiry)} · ${licOk ? "valid for trip" : "check needed"}` })}
        ${row({ label: "Driver age", value: `${d.age} · ${ageOk ? `meets ${v.minAge}+` : `under ${v.minAge}`}` })}
      </div>
      <h3 class="group-title">Trip</h3>
      <div class="group">${row({ label: "Pick-up", value: fmtDT(bk.start) })}${row({ label: "Return", value: fmtDT(bk.end) })}${row({ label: "Where", sub: esc(pickupLong(bk)), value: esc(pickupShort(bk)) })}${row({ label: "Extras", value: ex.length ? esc(ex.join(", ")) : "None" })}${row({ label: "Cover", value: q.insurance.name })}${row({ label: "Booked via", value: bk.instant ? "Instant book" : "Request" })}</div>
      <h3 class="group-title">Payment</h3>
      <div class="breakdown"><div class="bl now"><span>${esc(paymentLine(p))}</span><b>${money(p?.nowAmount || 0)}</b></div><div class="bl"><span>Due at pick-up</span><b>${money(p?.laterAmount || 0)}</b></div></div>
      ${collect ? `<button type="button" class="btn block plain press" style="margin-top:10px" data-act="markPaid">${icon(p.method === "bank" ? "bank" : "cash")}Mark ${p.method === "bank" ? "transfer" : "cash payment"} as received</button>` : ""}
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
      <div class="group icons" style="margin-top:20px">${row({ ic: "chat", label: "Message renter", act: "openChat", attrs: `data-id="${bk.id}" data-side="business"` })}${row({ ic: "flag", label: "Report a problem", act: "report", attrs: `data-booking="${bk.id}"` })}</div>
    </div>`;
  },
  actions: {
    accept: (t, ctx) => acceptBooking(ctx.params.id),
    decline: (t, ctx) => declineBooking(ctx.params.id),
    checkout: (t, ctx) => openCheckSheet(getBk(ctx.params.id), "out"),
    checkin: (t, ctx) => openCheckSheet(getBk(ctx.params.id), "in"),
    markPaid: (t, ctx) => { commit(st => { const b = getBk(ctx.params.id); b.payment.status = "received"; b.events.push({ at: jmNow(), text: `${b.payment.method === "bank" ? "Bank transfer" : "Cash payment"} marked as received` }); pushMsg(st, b.id, "system", `${b.payment.method === "bank" ? "Bank transfer" : "Cash payment"} received by the host.`); }); haptic(10); toast("Payment marked as received"); },
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
    ${f.owed ? `<div class="bl fee"><span>Still owed by renter</span><b>${money(f.owed)}</b></div>` : ""}</div>`;
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
      <div class="photo-grid">${L.photos.map((p, i) => `<label class="ph press file-btn" id="ph${i}">${icon("camera")}<span>${p.label}</span><input type="file" accept="image/*" capture="environment" data-change="photo" data-i="${i}" aria-label="${p.label} photo"></label>`).join("")}</div>
      <p class="group-foot">Tap a tile to take a photo, or <button type="button" class="link" style="padding:0" data-act="placeholders">mark all as photo placeholders</button> for the demo.</p>
      ${!out ? `<h3 class="group-title">Extra charges</h3><div class="group"><label class="frow"><span>Damage (J$)</span><input type="number" inputmode="numeric" value="0" min="0" data-input="damage"></label><label class="frow"><span>Other fees (J$)</span><input type="number" inputmode="numeric" value="0" min="0" data-input="other"></label></div><div id="feeBox"></div>` : ""}`,
    mount: s => { if (!out) feeBox(s); },
    footer: () => `<button type="button" class="btn block press" data-act="done">${out ? "Complete check-out · start trip" : "Complete check-in · close trip"}</button>`,
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
          commit(st => { const b = getBk(bk.id); b.status = "completed"; b.checkin = { ...rec, fees }; if (b.payment && b.payment.status === "due") b.payment.status = "received"; b.events.push({ at: jmNow(), text: `Checked in · charges ${moneyJ(fees.total)} · deposit released ${moneyJ(fees.depositRefund)}` }); pushMsg(st, b.id, "system", `Trip completed. Charges ${moneyJ(fees.total)}${fees.late ? ` (late ${moneyJ(fees.late)})` : ""}. Deposit released ${moneyJ(fees.depositRefund)} (demo). You can now leave a review.`); });
        }
        s.close(); haptic(20); toast(out ? "Trip started" : "Trip closed");
      },
    } });
}

/* ---- listings (fleet) ---- */
function vStatusChips(v) {
  const c = [];
  if (v.approval === "pending") c.push(`<span class="pill t-warn">${icon("clock")}In review</span>`);
  if (v.approval === "rejected") c.push(`<span class="pill t-neg">${icon("x")}Rejected</span>`);
  if (v.suspended) c.push(`<span class="pill t-neg">${icon("ban")}Suspended</span>`);
  if (v.paused) c.push(`<span class="pill t-grey">${icon("pause")}Paused</span>`);
  if (v.maintenance) c.push(`<span class="pill t-info">${icon("wrench")}Maintenance</span>`);
  if (!c.length) c.push(`<span class="pill t-pos">${icon("check")}Live</span>`);
  if (v.instantBook) c.push(`<span class="pill t-outline">${icon("bolt")}Instant</span>`);
  return c.join(" ");
}
const FleetView = {
  id: "fleet", large: true, ptr: true, title: () => "Listings",
  navRight: () => `<button type="button" class="nav-btn press" data-act="listVehicle" aria-label="List a vehicle">${icon("plus")}</button>`,
  render() {
    const b = getB(S.hostBizId); if (!b) return emptyState("car", "No business yet", "");
    const vs = S.vehicles.filter(v => v.businessId === b.id); const live = vs.filter(isLive).length;
    return `<div class="inner"><h1 class="large-title">Listings</h1>
      <p class="lede">${plural(vs.length, "vehicle")} · ${live} live · ${vs.filter(v => v.paused).length} paused · ${vs.filter(v => v.approval === "pending").length} in review</p>
      ${bizStatusBanner(b)}
      <button type="button" class="btn block press" style="margin-bottom:16px" data-act="listVehicle">${icon("plus")}List a vehicle</button>
      <div class="list stagger go" data-skel>${vs.map((v, i) => `<article class="tcard press" style="--i:${i}" role="button" tabindex="0" data-act="openFleetVehicle" data-id="${v.id}"><span class="tthumb sk"><img class="fade" src="${coverURL(v)}" alt="" loading="lazy"></span><div class="tinfo"><div class="trow1"><b>${esc(vName(v))} ${v.year}</b></div><small>${esc(vLoc(v))} · ${v.seats} seats</small><div style="display:flex;gap:4px;flex-wrap:wrap;margin:3px 0">${vStatusChips(v)}</div><span class="tline">${icon("dollar")}<span>${money(v.rates.daily)}/day · ${(v.photos || []).length ? plural(v.photos.length, "photo") : "sample render"}</span></span></div></article>`).join("") || emptyState("car", "No vehicles yet", "List your first vehicle to start taking bookings.")}</div></div>`;
  },
  actions: { ...hostActions, openFleetVehicle: t => Nav.push(FleetVehicleView, { id: t.dataset.id }) },
};
const FleetVehicleView = {
  id: "fleetv", title: ctx => { const v = getV(ctx.params.id); return v ? vName(v) : "Vehicle"; },
  navRight: () => `<button type="button" class="nav-btn text press" data-act="edit">Edit</button>`,
  render(ctx) {
    const v = getV(ctx.params.id); if (!v) return emptyState("car", "Vehicle removed", "");
    const bks = S.bookings.filter(b => b.vehicleId === v.id); const st = hostStats(v.businessId); const u = st.perVehicle.find(x => x.v.id === v.id); const top = st.top.find(x => x.v.id === v.id); const r = vRating(v.id);
    const upcoming = bks.filter(b => ["requested", "confirmed", "active"].includes(b.status)).sort((a, z) => a.start.localeCompare(z.start));
    return `<div class="inner" style="padding-top:8px">
      <div class="trip-hero sk"><img class="fade" src="${coverURL(v)}" alt=""><div class="th-over"><span style="display:flex;gap:4px;flex-wrap:wrap">${vStatusChips(v)}</span><b>${esc(v.title || vFull(v))}</b><small>${esc(vLoc(v))} · ${money(v.rates.daily)}/day · plate ${esc(v.plate)} (private)</small></div></div>
      <div class="stat-row" style="margin-top:12px">${kpi("Utilisation", "gauge", Math.round((u?.p || 0) * 100), "pct", "30 days")}${kpi("Revenue", "dollar", top?.rev || 0, "money", "90 days")}${kpi("Rating", "star", r.count ? +r.avg.toFixed(1) : 0, "dec", plural(r.count, "review"))}</div>
      <h3 class="group-title">Status</h3>
      <div class="group">
        <label class="row"><span class="lbl"><b>Listing visible</b><small>Turn off to pause the listing. Existing bookings stay.</small></span>${switchEl("m_pa", !v.paused, 'data-change="visible"', "Listing visible")}</label>
        <label class="row"><span class="lbl"><b>Maintenance mode</b><small>Blocks new bookings while it’s being serviced</small></span>${switchEl("m_mt", v.maintenance, 'data-change="flag" data-k="maintenance"', "Maintenance mode")}</label>
        <label class="row"><span class="lbl"><b>Instant book</b><small>Confirm bookings without your approval</small></span>${switchEl("m_ib", v.instantBook, 'data-change="flag" data-k="instantBook"', "Instant book")}</label>
      </div>
      ${v.approval === "pending" ? `<p class="group-foot">This listing is waiting for marketplace approval (Admin → Listings).</p>` : ""}
      <div class="group icons" style="margin-top:20px">
        ${row({ ic: "pencil", label: "Edit listing", sub: "Basics, photos, description, location, pricing", act: "edit" })}
        ${row({ ic: "cal", label: "Availability calendar", sub: "Bookings, blocked days and maintenance", act: "calendar" })}
        ${row({ ic: "eye", label: "Preview as renter", act: "openVehicle", attrs: `data-id="${v.id}"` })}
        ${row({ ic: "trash", label: "Delete listing", act: "remove", cls: "danger" })}
      </div>
      <h3 class="group-title">Upcoming & active bookings</h3>
      <div class="list">${upcoming.length ? upcoming.map((b, i) => tripCard(b, i, "host")).join("") : `<div class="group pad"><p>No upcoming bookings.</p></div>`}</div>
    </div>`;
  },
  actions: {
    edit: (t, ctx) => Nav.push(ListingWizard, { id: ctx.params.id }),
    calendar: (t, ctx) => Nav.push(CalendarView, { id: ctx.params.id }),
    remove: async (t, ctx) => {
      const v = getV(ctx.params.id); const live = S.bookings.filter(b => b.vehicleId === v.id && ["requested", "confirmed", "active"].includes(b.status));
      if (live.length) { toast(`${plural(live.length, "booking")} still open. Pause the listing instead.`, { tone: "warn", ms: 3200 }); return; }
      const r = await actionSheet({ title: `Delete ${vName(v)}?`, message: "The listing disappears from search. Past bookings and reviews are kept.", actions: [{ label: "Delete listing", style: "destructive", value: "yes" }] });
      if (r !== "yes") return;
      await Nav.pop(); commit(st => { st.vehicles = st.vehicles.filter(x => x.id !== v.id); for (const a of st.accounts) a.favs = (a.favs || []).filter(x => x !== v.id); }); toast("Listing deleted");
    },
  },
  inputs: {
    flag: (t, ctx) => { const k = t.dataset.k; const val = t.checked; haptic(5); commit(() => { getV(ctx.params.id)[k] = val; }, { skip: ctx }); setTimeout(() => { if (ctx.el.isConnected) renderPage(ctx); }, 420); toast(k === "maintenance" ? (val ? "Maintenance mode on" : "Back in service") : (val ? "Instant book on" : "Requests only")); },
    visible: (t, ctx) => { const val = !t.checked; haptic(5); commit(() => { getV(ctx.params.id).paused = val; }, { skip: ctx }); setTimeout(() => { if (ctx.el.isConnected) renderPage(ctx); }, 420); toast(val ? "Listing paused" : "Listing visible again"); },
  },
};

/* ---- "List a vehicle" wizard ---- */
const WIZ = [
  { id: "basics", title: "Vehicle basics", sub: "Tell renters what you’re listing." },
  { id: "photos", title: "Photos", sub: "Clear daylight photos get more bookings. The first photo is the cover." },
  { id: "desc", title: "Description", sub: "Help renters picture the trip." },
  { id: "loc", title: "Location", sub: "Where renters collect the vehicle." },
  { id: "price", title: "Pricing", sub: "Set your rates, deposit and limits." },
  { id: "review", title: "Review & publish", sub: "Check everything before it goes live." },
];
function blankVehicle() {
  const b = getB(S.hostBizId) || {};
  return { id: null, businessId: b.id, make: "", model: "", year: new Date(jmNow()).getUTCFullYear() - 3, type: "car", seats: 5, transmission: "auto", fuel: "Petrol", title: "", description: "",
    rates: { daily: 7000, weekly: 43400, monthly: 154000 }, seasonal: DEFAULT_SEASONS.map(s => ({ ...s })), deposit: 40000, mileage: { limit: 200, extraPerKm: 40 }, minAge: 21,
    features: ["ac"], rules: ["no_smoking", "clean"], customRules: [], color: COLORS[1].c, plate: "", photos: [],
    location: { parish: b.parish || "Kingston", town: b.town || "", landmark: "" }, pickupOpts: { atLocation: true, airport: { enabled: false, fee: CONFIG.AIRPORT_FEE, airports: [] }, hotel: { enabled: false, fee: CONFIG.HOTEL_FEE } },
    approval: "pending", suspended: false, maintenance: false, paused: false, instantBook: true, chauffeur: false, blocks: [], sample: false };
}
function wizCheck(d, step) {
  const e = [];
  if (step === 0) { if (d.make.trim().length < 2) e.push("Add the make (e.g. Toyota)."); if (d.model.trim().length < 1) e.push("Add the model."); if (!(d.year >= 1980 && d.year <= 2027)) e.push("Year should be between 1980 and 2027."); if (d.plate.trim().length < 3) e.push("Add the plate number (kept private)."); }
  if (step === 2) { if (d.title.trim().length < 8) e.push("Write a title of at least 8 characters."); if (d.description.trim().length < 30) e.push("Write a description of at least 30 characters."); }
  if (step === 3) { if (!d.location.parish) e.push("Choose a parish."); if (!d.location.town.trim()) e.push("Choose or type the town or district."); if (!d.pickupOpts.atLocation && !d.pickupOpts.airport.enabled && !d.pickupOpts.hotel.enabled) e.push("Turn on at least one pick-up option."); if (d.pickupOpts.airport.enabled && !d.pickupOpts.airport.airports.length) e.push("Choose which airport you deliver to."); }
  if (step === 4) { if (!(d.rates.daily > 0)) e.push("Set a daily rate above J$0."); if (d.deposit < 0) e.push("Deposit can’t be negative."); if (d.seasonal.some(s => !/^\d{2}-\d{2}$/.test(s.from) || !/^\d{2}-\d{2}$/.test(s.to))) e.push("Season dates must look like 12-15 (MM-DD)."); }
  return e;
}
const ListingWizard = {
  id: "wizard", hideTabs: true, pageClass: "has-wizfoot",
  title: ctx => ctx.params.id ? "Edit listing" : "List a vehicle",
  navRight: ctx => ctx.params.id ? `<button type="button" class="nav-btn text press" data-act="publish">Save</button>` : "",
  init(ctx) { const v = ctx.params.id ? getV(ctx.params.id) : null; const d = v ? JSON.parse(JSON.stringify(v)) : blankVehicle(); d.customRules = d.customRules || []; d.location = d.location || { parish: "Kingston", town: "", landmark: "" }; ctx.local.d = d; ctx.local.step = ctx.params.step || 0; ctx.local.dir = 1; ctx.local.errors = []; ctx.local.otherTown = !!(d.location.town && !PARISH_TOWNS[d.location.parish]?.some(t => t[0] === d.location.town)); },
  render(ctx) {
    const L = ctx.local; const d = L.d; const s = WIZ[L.step];
    return `<div class="inner">
      <div class="wiz-head"><div class="wiz-bar"><i style="transform:scaleX(${(L.step + 1) / WIZ.length})"></i></div><div class="wiz-step"><span>Step <b>${L.step + 1}</b> of ${WIZ.length}</span><span>${s.title}</span></div></div>
      <div class="${reduced() || !L.dir ? "" : L.dir > 0 ? "step-in-r" : "step-in-l"}">
      <h2 class="wiz-title">${s.title}</h2><p class="wiz-sub">${s.sub}</p>
      ${L.errors.length ? `<div class="auth-error">${icon("alert")}<span>${L.errors.map(esc).join("<br>")}</span></div>` : ""}
      ${wizStep(ctx, d, L.step)}
      </div></div>`;
  },
  fixed(ctx) { const L = ctx.local; const last = L.step === WIZ.length - 1; return `<div class="wiz-foot glass">${L.step ? `<button type="button" class="btn ghost press" data-act="wPrev">Back</button>` : ""}<button type="button" class="btn press" data-act="${last ? "publish" : "wNext"}">${last ? (ctx.params.id ? "Save changes" : "Publish listing") : "Continue"}</button></div>`; },
  mount(ctx) { setupPhotoDrag(ctx); },
  onSeg(ctx, name, v) { const d = ctx.local.d; if (name === "trans") d.transmission = v; if (name === "fuel") d.fuel = v; },
  onStep(ctx, name, v) { ctx.local.d[name] = v; },
  inputs: {
    f: (t, ctx) => { const d = ctx.local.d; const path = t.dataset.k.split("."); const num = t.type === "number"; let o = d; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path[path.length - 1]] = num ? (t.value === "" ? 0 : +t.value) : t.value; const cc = t.closest(".field")?.querySelector(".char-count"); if (cc && t.maxLength > 0) { cc.textContent = `${t.value.length}/${t.maxLength}`; cc.classList.toggle("over", t.value.length >= t.maxLength); } },
    season: (t, ctx) => { const s = ctx.local.d.seasonal[+t.dataset.i]; s[t.dataset.k] = t.dataset.k === "pct" ? +t.value || 0 : t.value; },
    customRules: (t, ctx) => { ctx.local.d.customRules = t.value.split("\n").map(x => x.trim()).filter(Boolean); },
    feat: (t, ctx) => { const d = ctx.local.d; const f = t.dataset.v; d.features = t.checked ? [...new Set([...d.features, f])] : d.features.filter(x => x !== f); haptic(3); },
    rule: (t, ctx) => { const d = ctx.local.d; const f = t.dataset.v; d.rules = t.checked ? [...new Set([...d.rules, f])] : d.rules.filter(x => x !== f); haptic(3); },
    bool: (t, ctx) => { const d = ctx.local.d; const path = t.dataset.k.split("."); let o = d; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path[path.length - 1]] = t.checked; haptic(4); if (/airport|hotel/.test(t.dataset.k)) { const box = ctx.content.querySelector(`[data-dep="${path[1]}"]`); if (box) box.hidden = !t.checked; } },
    town: (t, ctx) => { ctx.local.d.location.town = t.value; },
    addPhotos: async (t, ctx) => {
      const d = ctx.local.d; const all = Array.from(t.files || []); const files = all.slice(0, Math.max(0, 10 - d.photos.length)); if (!files.length) { if (all.length) toast("Up to 10 photos per listing", { tone: "warn" }); return; }
      const grid = ctx.content.querySelector(".ph-grid"); if (grid) for (const f of files) { void f; grid.insertAdjacentHTML("beforeend", `<div class="ph-tile busy sk"></div>`); }
      let added = 0; for (const f of files) { try { d.photos.push(await readImage(f, 1080, 0.74)); added++; } catch (e) { toast(e.message, { tone: "warn" }); } }
      t.value = ""; ctx.local.dir = 0; renderPage(ctx); if (added) toast(`${plural(added, "photo")} added and optimised`);
    },
  },
  actions: {
    wNext: (t, ctx) => { const L = ctx.local; L.errors = wizCheck(L.d, L.step); if (L.errors.length) { L.dir = 0; renderPage(ctx, { keepScroll: false }); haptic(20); return; } L.dir = 1; L.step++; L.errors = []; renderPage(ctx, { keepScroll: false }); },
    wPrev: (t, ctx) => { const L = ctx.local; L.dir = -1; L.step = Math.max(0, L.step - 1); L.errors = []; renderPage(ctx, { keepScroll: false }); },
    goStep: (t, ctx) => { const L = ctx.local; L.dir = -1; L.step = +t.dataset.n; L.errors = []; renderPage(ctx, { keepScroll: false }); },
    setType: (t, ctx) => { const d = ctx.local.d; d.type = t.dataset.v; if (TWO_WHEEL.has(d.type)) { d.seats = 2; d.features = d.features.filter(f => !["ac", "4x4", "driver", "child_seat", "sunroof", "carplay"].includes(f)); if (!d.rules.includes("helmet")) d.rules.push("helmet"); } else if (d.type === "bus" && d.seats < 12) d.seats = 15; else if (d.type === "van" && d.seats < 7) d.seats = 8; ctx.local.dir = 0; renderPage(ctx); },
    setColor: (t, ctx) => { ctx.local.d.color = t.dataset.v; for (const s of $$(".swatch", ctx.content)) s.classList.toggle("on", s.dataset.v === t.dataset.v); const n = ctx.content.querySelector("#colorName"); if (n) n.textContent = colorName(t.dataset.v); haptic(3); },
    rmPhoto: (t, ctx) => { ctx.local.d.photos.splice(+t.dataset.i, 1); ctx.local.dir = 0; renderPage(ctx); haptic(6); },
    cover: (t, ctx) => { const p = ctx.local.d.photos; const [x] = p.splice(+t.dataset.i, 1); p.unshift(x); ctx.local.dir = 0; renderPage(ctx); toast("Cover photo set"); },
    parish: async (t, ctx) => { const r = await pickParish(ctx.local.d.location.parish); if (r && r !== ctx.local.d.location.parish) { ctx.local.d.location.parish = r; ctx.local.d.location.town = ""; ctx.local.otherTown = false; ctx.local.dir = 0; renderPage(ctx); } },
    town: async (t, ctx) => { const d = ctx.local.d; const towns = PARISH_TOWNS[d.location.parish].map(x => x[0]); const r = await actionSheet({ title: `Town or district in ${d.location.parish}`, actions: [...towns.map(x => ({ label: x + (x === d.location.town ? " ✓" : ""), value: x })), { label: "Other (type it)", value: "__other" }] }); if (!r) return; if (r === "__other") { ctx.local.otherTown = true; d.location.town = ""; } else { ctx.local.otherTown = false; d.location.town = r; } ctx.local.dir = 0; renderPage(ctx); if (ctx.local.otherTown) setTimeout(() => ctx.content.querySelector("#townOther")?.focus(), 50); },
    airport: (t, ctx) => { const a = ctx.local.d.pickupOpts.airport; const id = t.dataset.v; a.airports = a.airports.includes(id) ? a.airports.filter(x => x !== id) : [...a.airports, id]; t.classList.toggle("on", a.airports.includes(id)); haptic(3); },
    autoRates: (t, ctx) => { const d = ctx.local.d; d.rates.weekly = Math.round(d.rates.daily * 6.2 / 100) * 100; d.rates.monthly = Math.round(d.rates.daily * 22 / 500) * 500; ctx.local.dir = 0; renderPage(ctx); toast("Weekly and monthly rates filled in"); },
    addSeason: (t, ctx) => { ctx.local.d.seasonal.push({ name: "Summer", from: "07-01", to: "08-31", pct: 10 }); ctx.local.dir = 0; renderPage(ctx); },
    rmSeason: (t, ctx) => { ctx.local.d.seasonal.splice(+t.dataset.i, 1); ctx.local.dir = 0; renderPage(ctx); },
    publish: async (t, ctx) => {
      const L = ctx.local; const d = L.d;
      for (let i = 0; i < 5; i++) { const e = wizCheck(d, i); if (e.length) { L.errors = e; L.dir = -1; L.step = i; renderPage(ctx, { keepScroll: false }); haptic(20); toast("Fix the highlighted step first", { tone: "warn" }); return; } }
      d.make = d.make.trim(); d.model = d.model.trim(); d.title = d.title.trim(); d.description = d.description.trim(); d.year = clamp(+d.year || 2020, 1980, 2027);
      d.mileage.limit = d.mileage.limit > 0 ? d.mileage.limit : null; d.location.town = d.location.town.trim();
      if (!d.rates.weekly) d.rates.weekly = Math.round(d.rates.daily * 6.2); if (!d.rates.monthly) d.rates.monthly = Math.round(d.rates.daily * 22);
      const isNew = !ctx.params.id;
      commit(st => { if (isNew) { d.id = "v" + Date.now().toString(36); d.createdAt = jmNow(); d.approval = "pending"; st.vehicles.push(d); } else { const i = st.vehicles.findIndex(v => v.id === d.id); if (d.approval === "rejected") d.approval = "pending"; st.vehicles[i] = { ...d }; } }, { render: false });
      await Nav.pop(); Nav.invalidate(); haptic(14); toast(isNew ? "Submitted for review. An admin approves new listings." : "Listing saved");
    },
  },
};
function checkItem(name, on, attrs, ic) { return `<label class="check-item">${ic ? icon(ic, "fi") : ""}<span class="t">${esc(name)}</span><input type="checkbox" ${on ? "checked" : ""} ${attrs}><span class="check-box">${icon("check")}</span></label>`; }
function wizStep(ctx, d, step) {
  const two = TWO_WHEEL.has(d.type);
  const field = (label, k, val, extra = "", hint = "", count = 0) => `<div class="field"><label>${label}</label><input class="input" value="${esc(val)}" data-input="f" data-k="${k}" ${count ? `maxlength="${count}"` : ""} ${extra}>${hint ? `<span class="hint">${hint}</span>` : ""}${count ? `<span class="char-count">${String(val).length}/${count}</span>` : ""}</div>`;
  if (step === 0) return `
    <div class="cc-grid">${field("Make", "make", d.make, 'placeholder="Toyota" autocapitalize="words"')}${field("Model", "model", d.model, 'placeholder="Corolla"')}</div>
    <div class="cc-grid">${field("Year", "year", d.year, 'type="number" inputmode="numeric"')}${field("Plate number", "plate", d.plate, 'placeholder="1234 AB" autocapitalize="characters"')}</div>
    <p class="note" style="margin:-6px 0 16px">${icon("lock")}<span>The plate is private. Only you and renters with a confirmed booking see it.</span></p>
    <div class="field"><span class="lab">Type</span><div class="chips types">${TYPES.map(t => `<button type="button" class="type-chip press ${d.type === t.id ? "on" : ""}" data-act="setType" data-v="${t.id}">${icon(t.icon)}${t.name}</button>`).join("")}</div></div>
    <div class="group" style="margin-top:6px">
      <div class="row"><span class="lbl"><b>Seats</b></span>${stepper("seats", d.seats, 1, 40)}</div>
      <div class="row"><span class="lbl"><b>Transmission</b></span><span style="width:190px">${seg("trans", [{ v: "auto", label: "Automatic" }, { v: "manual", label: "Manual" }], d.transmission)}</span></div>
      <div class="row"><span class="lbl"><b>Fuel</b></span><span style="width:220px">${seg("fuel", [{ v: "Petrol", label: "Petrol" }, { v: "Diesel", label: "Diesel" }, { v: "Hybrid", label: "Hybrid" }, { v: "Electric", label: "EV" }], d.fuel)}</span></div>
    </div>
    <h3 class="group-title">Colour · <span id="colorName">${colorName(d.color)}</span></h3>
    <div class="group"><div class="swatches">${COLORS.map(c => `<button type="button" class="swatch ${d.color === c.c ? "on" : ""}" style="--c:${c.c}" data-act="setColor" data-v="${c.c}" aria-label="${c.n}" title="${c.n}"></button>`).join("")}</div></div>`;
  if (step === 1) return `
    ${d.photos.length ? `<div class="ph-grid no-drag">${d.photos.map((p, i) => `<div class="ph-tile" data-i="${i}"><img src="${p}" alt="Photo ${i + 1}">${i === 0 ? `<span class="cover">Cover</span>` : ""}<span class="pt-btns">${i ? `<button type="button" class="pt-btn" data-act="cover" data-i="${i}" aria-label="Set as cover">${icon("star")}</button>` : ""}<button type="button" class="pt-btn" data-act="rmPhoto" data-i="${i}" aria-label="Delete photo">${icon("x")}</button></span><span class="grip" aria-label="Drag to reorder">${icon("grip")}</span></div>`).join("")}</div>
      <p class="group-foot">Drag the handle at the bottom of a photo to reorder. The star sets a photo as the cover.</p>`
      : `<div class="card" style="text-align:center;padding:26px"><div style="margin:0 auto 10px;width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:var(--fill)">${icon("image")}</div><b>No photos yet</b><p class="muted" style="font-size:14px;margin-top:4px">Add up to 10. Until you do, a sample render is shown.</p></div>`}
    <div class="add-row"><label class="add-btn press">${icon("camera")}Take photo<input type="file" accept="image/*" capture="environment" data-change="addPhotos"></label><label class="add-btn press">${icon("image")}Choose photos<input type="file" accept="image/*" multiple data-change="addPhotos"></label></div>
    <p class="note" style="margin-top:14px">${icon("info")}<span>Photos are resized and compressed on your device before saving (about 1080 px, JPEG). Tip: shoot in daylight, from the front three-quarter angle, the side, the interior and the boot.</span></p>`;
  if (step === 2) return `
    ${field("Listing title", "title", d.title, 'placeholder="e.g. 7-seat Prado for the Blue Mountains"', "", 60)}
    <div class="field"><label>Description</label><textarea class="textarea" data-input="f" data-k="description" maxlength="600" placeholder="What’s great about this vehicle? Condition, comfort, what it’s perfect for…">${esc(d.description)}</textarea><span class="char-count">${d.description.length}/600</span></div>
    <h3 class="group-title">Features</h3>
    <div class="check-list">${FEATURES.filter(f => two ? ["bluetooth", "usb", "helmet", "gps"].includes(f.id) : f.id !== "helmet").map(f => checkItem(f.name, d.features.includes(f.id), `data-change="feat" data-v="${f.id}"`, f.icon)).join("")}</div>
    <h3 class="group-title">House rules</h3>
    <div class="check-list">${RULES.filter(r => two ? true : !["helmet", "no_beach"].includes(r.id)).map(r => checkItem(r.name, d.rules.includes(r.id), `data-change="rule" data-v="${r.id}"`)).join("")}</div>
    <div class="field" style="margin-top:12px"><label>Other rules (one per line)</label><textarea class="textarea" data-input="customRules" placeholder="e.g. Pets allowed with a carrier">${esc((d.customRules || []).join("\n"))}</textarea></div>`;
  if (step === 3) {
    const pk = d.pickupOpts; const towns = PARISH_TOWNS[d.location.parish] || [];
    return `
    <div class="field"><span class="lab">Parish</span><button type="button" class="select-btn press" data-act="parish"><span>${esc(d.location.parish || "Choose a parish")}</span>${icon("chevD")}</button></div>
    <div class="field"><span class="lab">Town or district</span><button type="button" class="select-btn press" data-act="town">${d.location.town && !ctx.local.otherTown ? `<span>${esc(d.location.town)}</span>` : `<span class="sel-ph">${ctx.local.otherTown ? "Other (type below)" : "Choose a town"}</span>`}${icon("chevD")}</button>
      ${ctx.local.otherTown ? `<input id="townOther" class="input" style="margin-top:8px" placeholder="Town or district name" value="${esc(d.location.town)}" data-input="town">` : ""}<span class="hint">${towns.slice(0, 4).map(t => t[0]).join(", ")}${towns.length > 4 ? "…" : ""}</span></div>
    ${field("Street or landmark (optional)", "location.landmark", d.location.landmark, 'placeholder="e.g. Opposite the square"', "Shown to renters after they book.")}
    <h3 class="group-title">Pick-up options</h3>
    <div class="group">
      <label class="row"><span class="lbl"><b>Pick-up at my location</b><small>${esc(d.location.town ? `${d.location.town}, ${d.location.parish}` : d.location.parish)}</small></span>${switchEl("po_loc", pk.atLocation, 'data-change="bool" data-k="pickupOpts.atLocation"', "Pick-up at my location")}</label>
      <label class="row"><span class="lbl"><b>Airport delivery</b><small>Meet renters at the airport</small></span>${switchEl("po_air", pk.airport.enabled, 'data-change="bool" data-k="pickupOpts.airport.enabled"', "Airport delivery")}</label>
      <div data-dep="airport" ${pk.airport.enabled ? "" : "hidden"} style="padding:2px 16px 14px"><div class="chips" style="margin-bottom:10px">${Object.values(AIRPORTS).map(a => `<button type="button" class="sel-chip press ${pk.airport.airports.includes(a.id) ? "on" : ""}" data-act="airport" data-v="${a.id}">${icon("plane")}${a.short}</button>`).join("")}</div><div class="inp"><span class="muted" style="margin-right:8px;font-size:14px">Fee J$</span><input type="number" inputmode="numeric" value="${pk.airport.fee}" data-input="f" data-k="pickupOpts.airport.fee" aria-label="Airport delivery fee"></div></div>
      <label class="row"><span class="lbl"><b>Hotel delivery</b><small>Bring the vehicle to the renter’s hotel</small></span>${switchEl("po_hot", pk.hotel.enabled, 'data-change="bool" data-k="pickupOpts.hotel.enabled"', "Hotel delivery")}</label>
      <div data-dep="hotel" ${pk.hotel.enabled ? "" : "hidden"} style="padding:2px 16px 14px"><div class="inp"><span class="muted" style="margin-right:8px;font-size:14px">Fee J$</span><input type="number" inputmode="numeric" value="${pk.hotel.fee}" data-input="f" data-k="pickupOpts.hotel.fee" aria-label="Hotel delivery fee"></div></div>
    </div>`;
  }
  if (step === 4) return `
    <div class="group">
      <label class="frow"><span>Daily rate</span><input type="number" inputmode="numeric" value="${d.rates.daily}" data-input="f" data-k="rates.daily"><span class="unit">J$</span></label>
      <label class="frow"><span>Weekly rate</span><input type="number" inputmode="numeric" value="${d.rates.weekly}" data-input="f" data-k="rates.weekly"><span class="unit">J$</span></label>
      <label class="frow"><span>Monthly rate</span><input type="number" inputmode="numeric" value="${d.rates.monthly}" data-input="f" data-k="rates.monthly"><span class="unit">J$</span></label>
    </div>
    <p class="group-foot">Trips of 7+ days use the weekly rate per day; 28+ days use the monthly rate. <button type="button" class="link" style="padding:0" data-act="autoRates">Suggest weekly & monthly from daily</button></p>
    <h3 class="group-title">Seasonal pricing</h3>
    <div class="group">${d.seasonal.map((s, i) => `<div class="season"><div class="srow"><input class="nm" value="${esc(s.name)}" data-input="season" data-i="${i}" data-k="name" aria-label="Season name"><input class="dt" value="${esc(s.from)}" placeholder="MM-DD" data-input="season" data-i="${i}" data-k="from" aria-label="From (MM-DD)"><span class="muted">to</span><input class="dt" value="${esc(s.to)}" placeholder="MM-DD" data-input="season" data-i="${i}" data-k="to" aria-label="To (MM-DD)"><input class="pc" type="number" value="${s.pct}" data-input="season" data-i="${i}" data-k="pct" aria-label="Percent increase"><span class="muted">%</span></div><button type="button" class="sh-x" data-act="rmSeason" data-i="${i}" aria-label="Remove season">${icon("x")}</button></div>`).join("") || `<div class="row"><span class="lbl"><small>No seasonal pricing</small></span></div>`}
      <button type="button" class="row tap accent-row" data-act="addSeason">${icon("plus")}<span class="lbl"><b>Add season</b></span></button></div>
    <h3 class="group-title">Deposit, mileage & age</h3>
    <div class="group">
      <label class="frow"><span>Deposit</span><input type="number" inputmode="numeric" value="${d.deposit}" data-input="f" data-k="deposit"><span class="unit">J$</span></label>
      <label class="frow"><span>Km per day</span><input type="number" inputmode="numeric" value="${d.mileage.limit || 0}" data-input="f" data-k="mileage.limit"><span class="unit">0 = no limit</span></label>
      <label class="frow"><span>Extra per km</span><input type="number" inputmode="numeric" value="${d.mileage.extraPerKm}" data-input="f" data-k="mileage.extraPerKm"><span class="unit">J$</span></label>
      <div class="row"><span class="lbl"><b>Minimum driver age</b></span>${stepper("minAge", d.minAge, 18, 30)}</div>
    </div>
    <h3 class="group-title">Booking</h3>
    <div class="group">
      <label class="row"><span class="lbl"><b>Instant book</b><small>Renters book without waiting for you</small></span>${switchEl("w_ib", d.instantBook, 'data-change="bool" data-k="instantBook"', "Instant book")}</label>
      ${two ? "" : `<label class="row"><span class="lbl"><b>Chauffeur available</b><small>Renters can add a driver for ${moneyJ(EXTRAS.chauffeur.perDay)}/day</small></span>${switchEl("w_ch", d.chauffeur, 'data-change="bool" data-k="chauffeur"', "Chauffeur available")}</label>`}
    </div>`;
  const pv = { ...d, id: d.id || "__preview" };
  const checks = [[d.photos.length >= 3, d.photos.length ? `${plural(d.photos.length, "photo")}${d.photos.length < 3 ? " (3+ recommended)" : ""}` : "No photos yet. A sample render will be shown."], [d.description.length >= 80, `${d.description.length}-character description${d.description.length < 80 ? " (80+ recommended)" : ""}`], [d.features.length >= 3, plural(d.features.length, "feature")], [true, `Pick-up: ${pickupOptions(pv).map(o => o.short).join(", ")}`]];
  const b = getB(d.businessId);
  return `<div style="pointer-events:none">${vehicleCard(pv, { avail: { ok: true } })}</div>
    <div class="checks">${checks.map(([ok, t]) => `<div class="${ok ? "ok" : "no"}">${icon(ok ? "checkCircle" : "info")}<span>${esc(t)}</span></div>`).join("")}</div>
    <h3 class="group-title">Summary</h3>
    <div class="group review-list">
      <div class="row"><span class="lbl"><b>${esc(vFull(d))}</b><small>${TYPE[d.type].name} · ${d.seats} seats · ${d.transmission === "auto" ? "Automatic" : "Manual"} · ${esc(d.fuel)} · ${colorName(d.color)} · plate ${esc(d.plate)}</small></span><button type="button" class="edit-link" data-act="goStep" data-n="0">Edit</button></div>
      <div class="row"><span class="lbl"><b>${plural(d.photos.length, "photo")}</b><small>${d.photos.length ? "Cover set from the first photo" : "Sample render until you add photos"}</small></span><button type="button" class="edit-link" data-act="goStep" data-n="1">Edit</button></div>
      <div class="row"><span class="lbl"><b>${esc(d.title)}</b><small>${esc(d.description.slice(0, 90))}${d.description.length > 90 ? "…" : ""}</small></span><button type="button" class="edit-link" data-act="goStep" data-n="2">Edit</button></div>
      <div class="row"><span class="lbl"><b>${esc(locatedIn(pv))}</b><small>${esc(pickupOptions(pv).map(o => o.short + (o.fee ? ` (${moneyJ(o.fee)})` : "")).join(" · "))}</small></span><button type="button" class="edit-link" data-act="goStep" data-n="3">Edit</button></div>
      <div class="row"><span class="lbl"><b>${moneyJ(d.rates.daily)}/day · ${moneyJ(d.deposit)} deposit</b><small>${d.mileage.limit ? `${d.mileage.limit} km/day` : "Unlimited km"} · ${d.minAge}+ drivers · ${d.instantBook ? "Instant book" : "Requests"}</small></span><button type="button" class="edit-link" data-act="goStep" data-n="4">Edit</button></div>
    </div>
    <p class="group-foot">${ctx.params.id ? "Changes go live right away." : "New listings are reviewed by the marketplace team before renters can see them."} Payments accepted: ${acceptedMethods(b).map(m => PAYMENT_METHODS[m].name).join(", ") || "set them in Business"}.</p>`;
}
function setupPhotoDrag(ctx) {
  const grid = ctx.content.querySelector(".ph-grid"); if (!grid) return;
  grid.addEventListener("pointerdown", e => {
    const grip = e.target.closest(".grip"); if (!grip) return; e.preventDefault();
    const tile = grip.closest(".ph-tile"); const tiles = $$(".ph-tile", grid); const from = tiles.indexOf(tile);
    const rects = tiles.map(t => t.getBoundingClientRect()); const sx = e.clientX, sy = e.clientY; let to = from;
    tile.classList.add("dragging"); try { grip.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } haptic(8);
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy; tile.style.transform = `translate3d(${dx}px,${dy}px,0) scale(1.06)`;
      const cx = rects[from].left + rects[from].width / 2 + dx, cy = rects[from].top + rects[from].height / 2 + dy;
      let best = from, bd = Infinity; rects.forEach((r, i) => { const d2 = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d2 < bd) { bd = d2; best = i; } });
      if (best !== to) { to = best; haptic(3); tiles.forEach((t, i) => { if (t === tile) return; let target = i; if (from < to && i > from && i <= to) target = i - 1; else if (from > to && i >= to && i < from) target = i + 1; const r0 = rects[i], r1 = rects[target]; t.style.transform = target === i ? "" : `translate3d(${r1.left - r0.left}px,${r1.top - r0.top}px,0)`; }); }
    };
    const up = () => {
      grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
      if (to !== from) { const p = ctx.local.d.photos; const [m] = p.splice(from, 1); p.splice(to, 0, m); }
      const y = ctx.scroller.scrollTop; ctx.local.dir = 0; renderPage(ctx); ctx.scroller.scrollTop = y;
      if (to !== from) toast(to === 0 ? "New cover photo" : "Photos reordered");
    };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  });
}

const CalendarView = {
  id: "calendar", title: () => "Availability",
  init(ctx) { const d = new Date(jmNow()); ctx.local.y = d.getUTCFullYear(); ctx.local.m = d.getUTCMonth(); },
  render(ctx) {
    const v = getV(ctx.params.id); if (!v) return ""; const { y, m } = ctx.local;
    const a = Date.UTC(y, m, 1), z = Date.UTC(y, m + 1, 1);
    const bks = S.bookings.filter(b => b.vehicleId === v.id && ["requested", "confirmed", "active", "completed"].includes(b.status) && overlaps(toMs(b.start), toMs(b.end), a, z)).sort((p, q) => p.start.localeCompare(q.start));
    return `<div class="inner" style="padding-top:8px">
      <div class="bk-veh"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt=""></span><div><b>${esc(vFull(v))}</b><small>${esc(vLoc(v))} · ${v.maintenance ? "Maintenance mode on" : v.paused ? "Paused" : "In service"}</small></div></div>
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
      commit(() => { const veh = getV(v.id); veh.blocks = (veh.blocks || []).filter(x => x.date !== k); if (r !== "free") veh.blocks.push({ date: k, kind: r, note: r === "maintenance" ? "Maintenance" : "Blocked by host" }); });
      haptic(6); toast(r === "free" ? "Day is available" : r === "maintenance" ? "Marked for maintenance" : "Day blocked");
    },
  },
};
function shiftMonth(ctx, d) {
  let { y, m } = ctx.local; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } ctx.local.y = y; ctx.local.m = m;
  renderPage(ctx); const g = ctx.content.querySelector("#grid"); if (g && !reduced()) g.animate([{ opacity: 0, transform: `translate3d(${d * 30}px,0,0)` }, { opacity: 1, transform: "none" }], { duration: 340, easing: EASE });
}

/* ---- business profile, payments, become a host ---- */
function bizForm(d, mode) {
  const inp = (label, k, type = "text", extra = "") => `<div class="field"><label>${label}</label><input class="input" type="${type}" value="${esc(d[k] || "")}" data-input="bf" data-k="${k}" ${extra}></div>`;
  return `<h3 class="group-title">Profile</h3>
    ${seg("kind", [{ v: "business", label: "Business" }, { v: "individual", label: "Individual" }], d.kind || "business", "block")}
    <div style="height:12px"></div>
    ${inp(d.kind === "individual" ? "Name shown to renters" : "Business name", "name", "text", 'placeholder="Your rental company"')}
    <div class="cc-grid"><div class="field"><span class="lab">Parish</span><button type="button" class="select-btn press" data-act="bParish"><span>${esc(d.parish || "Choose")}</span>${icon("chevD")}</button></div><div class="field"><span class="lab">Town</span><button type="button" class="select-btn press" data-act="bTown"><span>${esc(d.town || "Choose")}</span>${icon("chevD")}</button></div></div>
    ${inp("Address", "address", "text", 'placeholder="Street, town"')}
    <div class="cc-grid">${inp("Phone", "phone", "tel", 'placeholder="+1 876-XXX-XXXX" data-phone')}${inp("WhatsApp", "whatsapp", "tel", 'placeholder="+1 876-XXX-XXXX" data-phone')}</div>
    ${inp("Opening hours", "hours", "text", 'placeholder="Mon–Sat 8 AM–6 PM"')}
    <h3 class="group-title">Payments you accept</h3>
    <div class="check-list">${Object.values(PAYMENT_METHODS).map(m => checkItem(m.name + (m.id === "app" ? " (demo)" : ""), !!d.payments?.[m.id], `data-change="bpay" data-v="${m.id}"`, m.icon)).join("")}</div>
    <p class="group-foot">Renters see these on your listings and choose at checkout. In-app card payments are a demo screen until a Jamaican processor (e.g. WiPay or Fygaro) is connected.</p>
    <h3 class="group-title">Payout preference (optional)</h3>
    ${seg("payout", PAYOUT_OPTIONS, d.payout || "later", "block")}
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
    bf: (t, ctx) => { let v = t.value; if (t.hasAttribute("data-phone")) { v = formatPhone(v); t.value = v; } ctx.local.d[t.dataset.k] = v; },
    bpay: (t, ctx) => { const d = ctx.local.d; d.payments = d.payments || {}; d.payments[t.dataset.v] = t.checked; haptic(3); },
  },
  onSeg(ctx, name, v) { ctx.local.d[name] = v; if (name === "policy") { const p = (ctx.body || ctx.content).querySelector("#polDesc"); if (p) p.textContent = POLICIES[v].desc; } },
  bParish: async (t, ctx) => { const r = await pickParish(ctx.local.d.parish); if (r) { ctx.local.d.parish = r; ctx.local.d.town = ""; t.querySelector("span").textContent = r; const tb = t.closest(".cc-grid").querySelector('[data-act="bTown"] span'); if (tb) tb.textContent = "Choose"; } },
  bTown: async (t, ctx) => { const p = ctx.local.d.parish; if (!p) { toast("Choose a parish first", { tone: "warn" }); return; } const r = await actionSheet({ title: `Town in ${p}`, actions: PARISH_TOWNS[p].map(x => ({ label: x[0], value: x[0] })) }); if (r) { ctx.local.d.town = r; t.querySelector("span").textContent = r; } },
};
function validateBiz(d) {
  const miss = [d.name.trim().length < 2 && "a name", !d.parish && "a parish", !d.town && "a town", !validJmPhone(d.phone) && "a Jamaican phone number (+1 876-XXX-XXXX)", !Object.values(d.payments || {}).some(Boolean) && "at least one payment option"].filter(Boolean);
  return miss.length ? `Add ${miss.join(", ")}.` : "";
}
const BizProfileView = {
  id: "bizprofile", large: true, title: () => "Business",
  navRight: () => `<button type="button" class="nav-btn text press" data-act="save">Save</button>`,
  init(ctx) { const b = getB(S.hostBizId); ctx.local.d = b ? JSON.parse(JSON.stringify(b)) : null; },
  render(ctx) {
    const b = getB(S.hostBizId); if (!b) return emptyState("store", "No business yet", "", `<button type="button" class="btn sm press" data-act="addBiz">Add a business</button>`);
    if (!ctx.local.d || ctx.local.d.id !== b.id) ctx.local.d = JSON.parse(JSON.stringify(b)); const d = ctx.local.d;
    const all = S.vehicles.filter(v => v.businessId === b.id); const allInstant = all.length && all.every(v => v.instantBook);
    return `<div class="inner"><h1 class="large-title">Business</h1>${bizSwitcher()}
      <div class="host-row" style="margin-top:0">
        <label class="file-btn press" style="border-radius:16px" aria-label="Upload logo">${bizLogo(d, "lg")}<input type="file" accept="image/*" data-change="logo"></label>
        <div><b>${esc(d.name)} ${verified(b)}</b><small>Tap the logo to upload a new one</small>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${b.approval === "approved" ? `<span class="pill t-pos">${icon("check")}Approved</span>` : `<span class="pill t-warn">${icon("clock")}${b.approval === "pending" ? "Awaiting approval" : b.approval}</span>`}${b.verified ? `<span class="pill t-pos">${icon("shield")}Verified</span>` : `<span class="pill t-warn">${icon("clock")}Verification pending</span>`}</div></div></div>
      <p class="group-foot">Approval and verification are set by the marketplace admin. ID document: ${b.idDoc?.status === "verified" ? "verified" : b.idDoc?.status === "submitted" ? "submitted, in review" : "not uploaded"}.</p>
      ${bizForm(d, "p")}
      <h3 class="group-title">Booking mode</h3>
      <div class="group"><label class="row"><span class="lbl"><b>Instant book for all vehicles</b><small>Turn off to review every request yourself</small></span>${switchEl("ib_all", allInstant, 'data-change="ibAll"', "Instant book for all vehicles")}</label></div>
      <button type="button" class="btn block press" style="margin-top:22px" data-act="save">Save business profile</button>
      <div class="group icons" style="margin-top:20px">${row({ ic: "user", label: "Your account", sub: `${esc(me().name)} · ${esc(me().email)}`, act: "account" })}${row({ ic: "swap", label: "Switch business", act: "switchBiz" })}${row({ ic: "plus", label: "Add another business", act: "addBiz" })}</div>
    </div>`;
  },
  inputs: { ...bizFormHandlers.inputs,
    logo: async (t, ctx) => { const f = t.files[0]; if (!f) return; try { ctx.local.d.logo = await readImage(f, 240, 0.8); renderPage(ctx); toast("Logo ready. Tap Save to keep it."); } catch (e) { toast(e.message, { tone: "warn" }); } },
    ibAll: (t, ctx) => { const on = t.checked; commit(st => { st.vehicles.forEach(v => { if (v.businessId === S.hostBizId) v.instantBook = on; }); }, { skip: ctx }); toast(on ? "Instant book on for all vehicles" : "All vehicles now need your approval"); },
  },
  onSeg: bizFormHandlers.onSeg,
  actions: { ...hostActions,
    bParish: bizFormHandlers.bParish, bTown: bizFormHandlers.bTown,
    addBiz: () => openAddBusiness(),
    save: (t, ctx) => { const d = ctx.local.d; const err = validateBiz(d); if (err) { toast(err, { tone: "warn", ms: 3200 }); return; } commit(st => { const i = st.businesses.findIndex(b => b.id === d.id); const cur = st.businesses[i]; st.businesses[i] = { ...d, approval: cur.approval, verified: cur.verified }; }); haptic(12); toast("Business profile saved"); },
  },
};
function newBusinessDraft(a) {
  return { id: null, name: a.hostName || "", kind: a.hostKind || "business", parish: a.parish || "", town: "", address: "", phone: a.phone || "", whatsapp: a.phone || "", hours: "Mon–Sat 8:00 AM–6:00 PM", policy: "moderate", fuelPolicy: "full-to-full", payments: { app: true, cash: true, bank: false }, payout: a.payout || "later",
    damagePolicy: "Damage is checked with photos at pick-up and return. Repairs up to the insurance excess come out of the deposit.", rules: "Drive on the left. Seatbelts at all times. No smoking.", approval: "pending", verified: false, color: COLORS[2 + Math.floor(Math.random() * 6)].c, since: new Date(jmNow()).getUTCFullYear(), responseMins: 30, logo: "", sample: false, ownerId: a.id, idDoc: a.idDoc || { status: "none", img: "" } };
}
function createBusinessFor(a, d) {
  d.id = "b" + Date.now().toString(36); d.whatsapp = d.whatsapp || d.phone;
  S.businesses.push({ ...d }); a.businessIds = [...(a.businessIds || []), d.id]; a.activeBizId = d.id; a.roles = { ...(a.roles || {}), host: true }; S.hostBizId = d.id;
  return d.id;
}
function openAddBusiness() {
  const L = { d: newBusinessDraft(me()) };
  Sheets.open({ title: "Add a business", size: "full", local: L,
    render: () => `<div class="banner info">${icon("store")}<span>The marketplace reviews every business, then verifies ID for the shield badge.</span></div>${bizForm(L.d, "s")}<p class="group-foot">Commission: ${S.settings.commission}% of each booking.</p>`,
    footer: () => `<button type="button" class="btn block press" data-act="submit">Submit for review</button>`,
    inputs: bizFormHandlers.inputs, onSeg: bizFormHandlers.onSeg,
    actions: { bParish: bizFormHandlers.bParish, bTown: bizFormHandlers.bTown, submit: (t, s) => {
      const err = validateBiz(L.d); if (err) { toast(err, { tone: "warn", ms: 3200 }); return; }
      commit(() => { createBusinessFor(me(), L.d); }, { render: false });
      s.close(); Nav.setRole("business"); haptic(15); toast("Submitted. Awaiting admin approval.");
    } } });
}
function openBecomeHost() {
  const a = me(); const L = { kind: "business", name: a.hostName || "", parish: a.parish || "", phone: a.phone || "", payout: "later", idImg: a.idDoc?.img || "", agree: false };
  Sheets.open({ title: "Become a host", size: "full",
    render: () => `<p class="auth-sub" style="margin-bottom:16px">List your vehicles on ${esc(CONFIG.APP_NAME)}. Your renter account stays the same; switch between Renter and Host any time.</p>
      <div id="bhErr"></div>
      ${seg("kind", [{ v: "business", label: "Business" }, { v: "individual", label: "Individual" }], L.kind, "block")}
      <div style="height:12px"></div>
      <div class="field"><label for="bhName">${L.kind === "business" ? "Business name" : "Name shown to renters"}</label><input id="bhName" class="input" value="${esc(L.name)}" data-input="name" placeholder="${L.kind === "business" ? "e.g. Island Wheels Ltd" : esc(a.name)}"></div>
      <div class="cc-grid"><div class="field"><span class="lab">Parish</span><button type="button" class="select-btn press" data-act="parish"><span>${esc(L.parish || "Choose")}</span>${icon("chevD")}</button></div><div class="field"><label for="bhPhone">Phone</label><input id="bhPhone" class="input" type="tel" value="${esc(L.phone)}" data-input="phone" placeholder="+1 876-XXX-XXXX"></div></div>
      <div class="field"><span class="lab">ID verification</span><label class="upload-tile"><span class="ut-img">${L.idImg ? `<img src="${L.idImg}" alt="">` : icon("idcard")}</span><div class="ut-txt"><b>${L.idImg ? "Licence photo added" : "Upload your driver’s licence"}</b><span>Placeholder in this demo · stays on this device</span></div><input type="file" accept="image/*" capture="environment" data-change="id"></label></div>
      <div class="field"><span class="lab">Payout preference (optional)</span>${seg("payout", PAYOUT_OPTIONS, L.payout, "block")}</div>
      <label class="check-line"><input type="checkbox" data-change="agree" ${L.agree ? "checked" : ""}><span class="check-box">${icon("check")}</span><span>I agree to the host terms and the ${S.settings.commission}% marketplace commission (demo).</span></label>`,
    footer: () => `<button type="button" class="btn block press" data-act="go">Create host profile</button>`,
    onSeg: (s, name, v) => { L[name] = v; if (name === "kind") { const lab = s.body.querySelector('label[for="bhName"]'); if (lab) lab.textContent = v === "business" ? "Business name" : "Name shown to renters"; } },
    inputs: { name: t => { L.name = t.value; }, phone: t => { t.value = formatPhone(t.value); L.phone = t.value; }, agree: t => { L.agree = t.checked; },
      id: async (t, s) => { const f = t.files[0]; if (!f) return; try { L.idImg = await readImage(f, 1000, 0.75); s.refresh(); toast("Licence photo added"); } catch (e) { toast(e.message, { tone: "warn" }); } } },
    actions: {
      parish: async (t) => { const r = await pickParish(L.parish); if (r) { L.parish = r; t.querySelector("span").textContent = r; } },
      go: (t, s) => {
        const err = L.name.trim().length < 2 ? "Add your business or host name." : !L.parish ? "Choose your parish." : !validJmPhone(L.phone) ? "Use a Jamaican phone number: +1 876-XXX-XXXX." : !L.agree ? "Agree to the host terms to continue." : "";
        const box = s.body.querySelector("#bhErr"); box.innerHTML = err ? `<div class="auth-error fade-in">${icon("alert")}<span>${esc(err)}</span></div>` : ""; if (err) { s.body.scrollTop = 0; haptic(20); return; }
        commit(() => { a.hostKind = L.kind; a.hostName = L.name.trim(); a.payout = L.payout; if (L.idImg) { a.idDoc = { img: L.idImg, status: "submitted" }; a.verified = { ...(a.verified || {}), id: a.verified?.id === "verified" ? "verified" : "submitted" }; } if (!a.phone) a.phone = L.phone;
          const d = newBusinessDraft(a); d.name = L.name.trim(); d.kind = L.kind; d.parish = L.parish; d.town = PARISH_TOWNS[L.parish][0][0]; d.phone = L.phone; d.whatsapp = L.phone; d.payout = L.payout; createBusinessFor(a, d); }, { render: false });
        s.close(); Nav.setRole("business"); haptic(15); toast("You’re a host. List your first vehicle.");
      },
    } });
}
