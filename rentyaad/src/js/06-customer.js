/* ============ customer: explore, search, vehicle detail, favourites, profile ============ */
function activeFilterCount(q) { return (q.seats > 1 ? 1 : 0) + (q.trans ? 1 : 0) + (q.pmin > 0 || q.pmax < CONFIG.PRICE_MAX ? 1 : 0) + q.features.length + (q.verifiedOnly ? 1 : 0) + (q.instantOnly ? 1 : 0) + (q.availOnly ? 1 : 0); }
function resetFilters() { const q = S.search; Object.assign(q, { seats: 1, trans: "", pmin: 0, pmax: CONFIG.PRICE_MAX, features: [], verifiedOnly: false, instantOnly: false, availOnly: false, sort: "rec", type: "", text: "" }); Store.save(); }

function searchVehicles(q) {
  const tokens = (q.text || "").toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const v of S.vehicles) {
    if (!isLive(v)) continue;
    const b = getB(v.businessId);
    if (q.loc && !vehicleLocs(v).includes(q.loc)) continue;
    if (q.type && v.type !== q.type) continue;
    if (q.seats > 1 && v.seats < q.seats) continue;
    if (q.trans && v.transmission !== q.trans) continue;
    if (v.rates.daily < q.pmin || (q.pmax < CONFIG.PRICE_MAX && v.rates.daily > q.pmax)) continue;
    if (q.features.some(f => !hasFeat(v, f))) continue;
    if (q.verifiedOnly && !b.verified) continue;
    if (q.instantOnly && !v.instantBook) continue;
    if (tokens.length) { const hay = `${v.make} ${v.model} ${v.year} ${TYPE[v.type].name} ${b.name} ${b.parish}`.toLowerCase(); if (!tokens.every(t => hay.includes(t))) continue; }
    const avail = checkAvail(v, q.start, q.end);
    if (q.availOnly && !avail.ok) continue;
    out.push({ v, b, avail, r: vRating(v.id) });
  }
  const byRec = (a, z) => (z.avail.ok - a.avail.ok) || (z.b.verified - a.b.verified) || (z.r.avg - a.r.avg) || (a.v.rates.daily - z.v.rates.daily);
  const sorters = { rec: byRec, price: (a, z) => (z.avail.ok - a.avail.ok) || (a.v.rates.daily - z.v.rates.daily), "price-desc": (a, z) => z.v.rates.daily - a.v.rates.daily, rating: (a, z) => (z.r.avg - a.r.avg) || (z.r.count - a.r.count) };
  return out.sort(sorters[q.sort] || byRec);
}

function vehicleCard(v, o = {}) {
  const b = getB(v.businessId); const r = o.r || vRating(v.id); const photos = vehiclePhotos(v).slice(0, 3); const i = o.i || 0;
  const av = o.avail || checkAvail(v, S.search.start, S.search.end);
  const badge = av.ok ? `<span class="tag ok">${icon("check")}Available</span>` : av.reason === "maintenance" ? `<span class="tag warn">In maintenance</span>` : `<span class="tag no">${av.reason === "booked" ? "Booked" : "Unavailable"}</span>`;
  const meta = [`${icon("seat")}${v.seats} seats`, `${icon("gear")}${v.transmission === "auto" ? "Automatic" : "Manual"}`, hasFeat(v, "driver") ? `${icon("steer")}Driver incl.` : `${icon(TYPE[v.type].icon)}${TYPE[v.type].name}`, `${icon("road")}${mileageText(v)}`];
  return `<article class="vcard" style="--i:${i}">
    <div class="vphoto sk">
      <div class="carousel hscroll">${photos.map((p, k) => `<img class="fade" src="${p}" alt="${esc(vFull(v))}, sample photo ${k + 1}" loading="${i < 2 && k === 0 ? "eager" : "lazy"}" decoding="async" data-act="openVehicle" data-id="${v.id}" draggable="false">`).join("")}</div>
      <div class="vtags"><span class="tag sample">Sample</span>${badge}${v.instantBook ? `<span class="tag">${icon("bolt")}Instant</span>` : ""}</div>
      ${heartBtn(v.id)}
      <div class="dots">${photos.map((_, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</div>
    </div>
    <div class="vbody" role="button" tabindex="0" data-act="openVehicle" data-id="${v.id}" aria-label="${esc(vFull(v))} from ${esc(b.name)}">
      <div class="vline1"><h3>${esc(vName(v))} <span class="yr">${v.year}</span></h3>${ratingHTML(r)}</div>
      <div class="vbiz">${esc(b.name)} ${verified(b)} ${smp(b.sample)}</div>
      <div class="vmeta">${meta.map(m => `<span class="mchip">${m}</span>`).join("")}</div>
      <div class="vprice">
        <div><span class="price">${money(v.rates.daily)}</span><span class="per">/day</span><span class="alt">${money(v.rates.daily, { cur: otherCur(), dec: otherCur() === "USD" })} /day</span></div>
        <div class="dep">Deposit ${money(v.deposit)}<br>${mileageText(v)}</div>
      </div>
    </div>
  </article>`;
}

const ExploreView = {
  id: "explore", large: true, ptr: true,
  title: () => "Explore",
  navRight: () => `<button type="button" class="nav-btn press" data-act="openAssistant" aria-label="Open the rental assistant">${icon("sparkles")}</button>`,
  render() {
    const q = S.search; const days = rentalDays(q.start, q.end);
    const cats = [{ id: "", plural: "All", icon: "grid" }, ...TYPES];
    return `<div class="inner">
      <h1 class="large-title">Explore</h1>
      <p class="lede">Wah gwaan! Rent cars, vans and scooters from local hosts across Jamaica.</p>
      <section class="search-card" aria-label="Search">
        <button type="button" class="sc-loc press" data-act="pickLoc">${icon(q.loc && LOC[q.loc].airport ? "plane" : "pin")}<span class="sc-txt"><small>Pick-up location</small><b>${esc(q.loc ? LOC[q.loc].name : "Anywhere in Jamaica")}</b></span>${icon("chevD", "muted")}</button>
        <div class="sc-dates">
          <button type="button" class="sc-date press" data-act="pickDates" data-which="start">${icon("cal")}<span class="sc-txt"><small>Pick-up</small><b>${relDate(q.start)}</b><em>${fmtTime(q.start)}</em></span></button>
          <span class="sc-arrow">${icon("arrowR")}</span>
          <button type="button" class="sc-date press" data-act="pickDates" data-which="end"><span class="sc-txt"><small>Return</small><b>${relDate(q.end)}</b><em>${fmtTime(q.end)}</em></span></button>
        </div>
        <div class="sc-foot"><span>${plural(days, "day")} · ${CONFIG.TZ_LABEL}</span>${seg("cur", [{ v: "JMD", label: "J$" }, { v: "USD", label: "US$" }], S.settings.currency, "mini")}</div>
      </section>
      <label class="searchbar">${icon("search")}<span class="vh">Search listings</span><input id="exploreQ" type="search" placeholder="Search make, model or host" value="${esc(q.text || "")}" data-input="q" autocomplete="off" enterkeyhint="search"></label>
      <div class="cats hscroll no-drag" role="tablist" aria-label="Vehicle type">${cats.map(t => `<button type="button" class="cat press glowable ${q.type === t.id ? "on" : ""}" data-act="type" data-v="${t.id}" role="tab" aria-selected="${q.type === t.id}">${icon(t.icon)}<span>${t.plural}</span></button>`).join("")}</div>
      <button type="button" class="ai-card press" data-act="openAssistant"><span class="ai-ico">${icon("sparkles")}</span><span class="ai-txt"><b>Ask the rental assistant</b><span>“Mi need a van fi 10 people from MoBay airport Friday”</span></span>${icon("chevR", "muted")}</button>
      <div class="results-head"><h2 id="rcount">Vehicles</h2><button type="button" class="chip press" data-act="filters">${icon("sliders")}<span>Filters</span><b class="cnt" id="fcount" hidden></b></button></div>
      <div class="results stagger go" id="results" data-skel></div>
      <p class="fineprint">Every host, vehicle, price and review here is SAMPLE data for this demo. Prices in J$; US$ uses J$${S.settings.fx} = US$1.</p>
    </div>`;
  },
  mount(ctx) { renderResults(ctx); },
  actions: {
    pickLoc: (t, ctx) => openLocationSheet(ctx),
    pickDates: async (t, ctx) => { const r = await pickTrip({ start: S.search.start, end: S.search.end, which: t.dataset.which }); if (r) { S.search.start = r.start; S.search.end = r.end; Store.save(); Nav.invalidate(); } },
    type: (t, ctx) => { S.search.type = t.dataset.v; Store.save(); haptic(4); for (const c of $$(".cat", ctx.content)) { const on = c.dataset.v === S.search.type; c.classList.toggle("on", on); c.setAttribute("aria-selected", on); } renderResults(ctx); },
    filters: (t, ctx) => openFilters(ctx),
    clearFilters: (t, ctx) => { resetFilters(); S.search.loc = ""; Nav.invalidate(); },
  },
  onSeg(ctx, name, v) { if (name === "cur") { setCurrency(v, ctx); renderResults(ctx); } },
  inputs: { q: (el, ctx) => { S.search.text = el.value; Store.save(); (ctx.local.deb ||= debounce(() => renderResults(ctx), 110))(); } },
};
function setCurrency(v, skip) { commit(st => { st.settings.currency = v; }, { render: false }); for (const k in Nav.stacks) for (const p of Nav.stacks[k].pages) if (p !== skip) p.dirty = true; const top = Nav.top(); if (top && top !== skip) renderPage(top); }
function renderResults(ctx) {
  const box = ctx.content.querySelector("#results"); if (!box) return;
  const list = searchVehicles(S.search); const avail = list.filter(x => x.avail.ok).length;
  ctx.content.querySelector("#rcount").textContent = list.length ? `${plural(list.length, "vehicle")} · ${avail} free` : "No matches";
  const fc = activeFilterCount(S.search); const fEl = ctx.content.querySelector("#fcount"); fEl.hidden = !fc; fEl.textContent = fc;
  box.innerHTML = list.length ? list.map((x, i) => vehicleCard(x.v, { avail: x.avail, r: x.r, i })).join("")
    : emptyState("search", "No vehicles match", "Try another location or dates, or loosen a filter.", `<button type="button" class="btn sm secondary press" data-act="clearFilters">Clear search & filters</button>`);
  hydrate(box);
}

function openLocationSheet(ctx) {
  const opt = l => `<button type="button" class="row tap ${S.search.loc === l.id ? "on" : ""}" data-act="choose" data-v="${l.id}">${icoBox(l.id === "" ? "compass" : l.airport ? "plane" : "pin", l.airport ? "#5856D6" : l.id === "" ? "#8E8E93" : "var(--blue)")}<span class="lbl"><b>${esc(l.name)}</b><small>${esc(l.parish)} · ${S.vehicles.filter(v => isLive(v) && (!l.id || vehicleLocs(v).includes(l.id))).length} vehicles</small></span>${S.search.loc === l.id ? icon("check", "accent") : ""}</button>`;
  Sheets.open({ title: "Pick-up location", size: "large",
    render: () => `<div class="group icons">${opt({ id: "", name: "Anywhere in Jamaica", parish: "All parishes" })}</div>
      <h3 class="group-title">Towns</h3><div class="group icons">${LOCATIONS.filter(l => !l.airport).map(opt).join("")}</div>
      <h3 class="group-title">Airports</h3><div class="group icons">${LOCATIONS.filter(l => l.airport).map(opt).join("")}</div>
      <p class="group-foot">Airport pick-ups add a ${moneyJ(EXTRAS.airport.flat)} fee (sample).</p>`,
    actions: { choose: (t, s) => { S.search.loc = t.dataset.v; Store.save(); haptic(5); s.close(); renderPage(ctx); } } });
}

function openFilters(ctx) {
  const q = S.search; const PM = CONFIG.PRICE_MAX;
  const prices = S.vehicles.filter(isLive).map(v => v.rates.daily);
  const bins = 20; const hist = Array(bins).fill(0); prices.forEach(p => hist[Math.min(bins - 1, Math.floor(p / PM * bins))]++); const hmax = Math.max(...hist, 1);
  const count = () => searchVehicles(q).length;
  const syncRange = s => {
    const lo = Math.min(q.pmin, q.pmax), hi = Math.max(q.pmin, q.pmax);
    s.body.querySelector("#pmin").textContent = money(lo); s.body.querySelector("#pmax").textContent = hi >= PM ? money(PM) + "+" : money(hi);
    const f = s.body.querySelector(".fillr"); f.style.transform = `translateX(${lo / PM * 100}%) scaleX(${(hi - lo) / PM})`;
    s.body.querySelectorAll(".histo i").forEach((el, k) => el.classList.toggle("in", (k + 0.5) / bins * PM >= lo && (k + 0.5) / bins * PM <= hi));
  };
  const apply = s => { Store.save(); renderResults(ctx); s.refreshFoot(); };
  Sheets.open({ title: "Filters", size: "large",
    left: `<button type="button" class="sh-link press" data-act="reset">Reset</button>`, right: `<button type="button" class="sh-done press" data-act="close">Done</button>`,
    render: () => `
      <h3 class="group-title" style="margin-top:6px">Seats</h3>
      <div class="group"><div class="row"><span class="lbl"><b>Minimum seats</b><small>Vans seat 8–15, buses 15–26</small></span>${stepper("seats", q.seats || 1, 1, 26, 1, "seats")}</div></div>
      <h3 class="group-title">Transmission</h3>
      ${seg("trans", [{ v: "", label: "Any" }, { v: "auto", label: "Automatic" }, { v: "manual", label: "Manual" }], q.trans || "", "block")}
      <h3 class="group-title">Daily price</h3>
      <div class="group pad no-drag">
        <div class="range-vals"><b id="pmin"></b><span class="muted">to</span><b id="pmax"></b></div>
        <div class="histo" aria-hidden="true">${hist.map(n => `<i style="height:${Math.max(6, n / hmax * 100)}%"></i>`).join("")}</div>
        <div class="dual"><div class="track"><div class="fillr"></div></div>
          <input type="range" min="0" max="${PM}" step="500" value="${q.pmin}" data-input="pmin" aria-label="Minimum daily price">
          <input type="range" min="0" max="${PM}" step="500" value="${q.pmax}" data-input="pmax" aria-label="Maximum daily price"></div>
      </div>
      <h3 class="group-title">Features</h3>
      <div class="group icons">${FEATURES.filter(f => f.filter).map(f => `<label class="row">${icoBox(f.icon)}<span class="lbl"><b>${f.name}</b></span>${switchEl("f_" + f.id, q.features.includes(f.id), `data-change="feat" data-v="${f.id}"`, f.name)}</label>`).join("")}</div>
      <h3 class="group-title">Trust & booking</h3>
      <div class="group icons">
        <label class="row">${icoBox("shield", "#34C759")}<span class="lbl"><b>Verified hosts only</b><small>Checked by the ${esc(CONFIG.APP_NAME)} team</small></span>${switchEl("f_ver", q.verifiedOnly, 'data-change="flag" data-k="verifiedOnly"', "Verified hosts only")}</label>
        <label class="row">${icoBox("bolt", "#FF9500")}<span class="lbl"><b>Instant book</b><small>Confirmed without waiting for the host</small></span>${switchEl("f_ins", q.instantOnly, 'data-change="flag" data-k="instantOnly"', "Instant book only")}</label>
        <label class="row">${icoBox("cal", "#5856D6")}<span class="lbl"><b>Free for my dates</b><small>Hide vehicles already booked</small></span>${switchEl("f_av", q.availOnly, 'data-change="flag" data-k="availOnly"', "Available for my dates only")}</label>
      </div>
      <h3 class="group-title">Sort by</h3>
      ${seg("sort", [{ v: "rec", label: "Best match" }, { v: "price", label: "Lowest price" }, { v: "rating", label: "Top rated" }], q.sort || "rec", "block")}`,
    mount: s => syncRange(s),
    footer: () => { const n = count(); return `<button type="button" class="btn block pill press" data-act="close" ${n ? "" : "disabled"}>${n ? `Show ${plural(n, "vehicle")}` : "No vehicles match"}</button>`; },
    onSeg: (s, name, v) => { q[name] = v; apply(s); },
    onStep: (s, name, v) => { q.seats = v; apply(s); },
    inputs: {
      pmin: (t, s) => { q.pmin = Math.min(+t.value, q.pmax - 500); if (+t.value !== q.pmin) t.value = q.pmin; syncRange(s); (s.local.deb ||= debounce(() => apply(s), 90))(); },
      pmax: (t, s) => { q.pmax = Math.max(+t.value, q.pmin + 500); if (+t.value !== q.pmax) t.value = q.pmax; syncRange(s); (s.local.deb ||= debounce(() => apply(s), 90))(); },
      feat: (t, s) => { const f = t.dataset.v; q.features = t.checked ? [...new Set([...q.features, f])] : q.features.filter(x => x !== f); haptic(4); apply(s); },
      flag: (t, s) => { q[t.dataset.k] = t.checked; haptic(4); apply(s); },
    },
    actions: { reset: s => { const keep = { type: q.type, text: q.text }; resetFilters(); Object.assign(q, keep); s.refresh(); apply(s); } },
  });
}

/* ---- vehicle detail ---- */
const VehicleView = {
  id: "vehicle", hideTabs: true, buybar: true,
  title: ctx => { const v = getV(ctx.params.id); return v ? vName(v) : "Vehicle"; },
  navRight: ctx => `<button type="button" class="nav-btn press" data-act="report" data-vehicle="${ctx.params.id}" aria-label="Report this listing">${icon("flag")}</button>`,
  init(ctx) { ctx.local.start = ctx.params.start || S.search.start; ctx.local.end = ctx.params.end || S.search.end; },
  render(ctx) {
    const v = getV(ctx.params.id); if (!v) return emptyState("car", "Listing removed", "This vehicle is no longer on the marketplace.");
    const b = getB(v.businessId); const r = vRating(v.id); const br = bRating(b.id); const L = ctx.local;
    const av = checkAvail(v, L.start, L.end); const q = quote(v, L.start, L.end, {}); const photos = vehiclePhotos(v);
    const live = isLive(v);
    const specs = [["seat", "Seats", v.seats], ["gear", "Gearbox", v.transmission === "auto" ? "Automatic" : "Manual"], ["fuel", "Fuel", v.fuel], ["cal", "Year", v.year], ["road", "Mileage", v.mileage.limit ? `${v.mileage.limit} km/day` : "Unlimited"], ["user", "Min. age", `${v.minAge}+`], ["lock", "Deposit", money(v.deposit)], ["key", "Plate", v.plate]];
    const reviews = S.reviews.filter(x => x.vehicleId === v.id).sort((a, z) => z.at - a.at);
    const pol = POLICIES[b.policy]; const fuel = FUEL_POLICIES[b.fuelPolicy];
    const rules = [...(b.rules || "").split(/\.\s+/).filter(Boolean).map(x => x.replace(/\.$/, "")), ...(v.rules || [])];
    return `<div class="gallery sk">
        <div class="carousel hscroll">${photos.map((p, k) => `<img class="fade" src="${p}" alt="${esc(vFull(v))}, sample photo ${k + 1}" ${k ? 'loading="lazy"' : ""} decoding="async" draggable="false">`).join("")}</div>
        <div class="vtags"><span class="tag sample">Sample photos</span></div>${heartBtn(v.id)}<span class="counter">1 / ${photos.length}</span>
      </div>
      <div class="inner">
        ${!live ? `<div class="banner warn" style="margin-top:14px">${icon("alert")}<span>This listing isn’t bookable right now (${v.suspended ? "suspended by the marketplace" : v.approval !== "approved" ? "awaiting approval" : "host not approved"}).</span></div>` : ""}
        <header class="d-head"><h1 class="d-title">${esc(vName(v))} <span>${v.year}</span></h1>
          <div class="d-sub">${ratingHTML(r)}<span>${TYPE[v.type].name}</span><span>${v.seats} seats</span>${v.instantBook ? `<span class="pill t-gold">${icon("bolt")}Instant book</span>` : `<span class="pill t-grey">${icon("clock")}Host approval</span>`}${smp(v.sample)}</div></header>
        <button type="button" class="host-row press" data-act="openBiz" data-id="${b.id}">${bizLogo(b)}<div><b>${esc(b.name)} ${verified(b)} ${smp(b.sample)}</b><small>${b.verified ? "Verified host" : "Verification pending"} · ${esc(b.parish)} · ${br.count ? `★ ${br.avg.toFixed(1)} (${br.count})` : "No reviews yet"}</small></div>${chev()}</button>
        <div class="avail-banner ${av.ok ? "ok" : "no"}">${icon(av.ok ? "checkCircle" : "ban")}<div><b>${av.ok ? "Available for your dates" : esc(av.label)}</b><small>${fmtRange(L.start, L.end)}</small></div><button type="button" class="btn sm plain press" data-act="dates">Change</button></div>
        ${!av.ok && v.description !== null ? (() => { const nx = nextFree(v, L.start, L.end); return nx ? `<p class="note" style="margin-top:8px">${icon("info")}<span>Next free: ${fmtRange(nx.start, nx.end)}. <button type="button" class="link" data-act="useNext" data-s="${nx.start}" data-e="${nx.end}" style="padding:0">Use these dates</button></span></p>` : ""; })() : ""}
        ${v.description ? `<p style="margin-top:14px;color:var(--label-2);font-size:15px">${esc(v.description)}</p>` : ""}
        <h2 class="sec-title">Specs</h2>
        <div class="spec-grid">${specs.map(([ic, k, val]) => `<div class="spec">${icon(ic)}<small>${k}</small><b>${esc(String(val))}</b></div>`).join("")}</div>
        <h2 class="sec-title">Features</h2>
        <div class="feat-list">${v.features.map(f => `<span class="feat">${icon(FEAT[f].icon)}${FEAT[f].name}</span>`).join("")}${v.chauffeur && !hasFeat(v, "driver") ? `<span class="feat gold">${icon("steer")}Chauffeur available</span>` : ""}${hasFeat(v, "airport") ? "" : `<span class="feat">${icon("pin")}Town pick-up</span>`}</div>
        <h2 class="sec-title">Price for your dates</h2>
        ${breakdownHTML(q)}
        <h2 class="sec-title">Insurance options</h2>
        <div class="group">${INSURANCE.map(i => { const ppd = insPerDay(v, i.id); return `<div class="row ins-row"><span class="lbl"><b>${i.name}</b><small>${i.desc} Excess: ${money(Math.round(v.deposit * i.excessPct / 100))}.</small></span><span class="price-tag">${ppd ? `${money(ppd)}/day` : "Included"}</span></div>`; }).join("")}</div>
        <p class="group-foot">You choose cover when you book. Sample prices.</p>
        <h2 class="sec-title">Deposit & damage</h2>
        <div class="policy">${icon("lock")}<div><b>${money(v.deposit)} refundable deposit</b><p>Held when you pay the deposit (mock) and released 3–5 business days after return. ${esc(b.damagePolicy)}</p></div></div>
        <div class="policy">${icon("fuel")}<div><b>Fuel: ${fuel.name}</b><p>${fuel.desc}</p></div></div>
        <div class="policy">${icon("road")}<div><b>Mileage: ${v.mileage.limit ? `${v.mileage.limit} km per day` : "Unlimited"}</b><p>${v.mileage.limit ? `Extra kilometres cost ${moneyJ(v.mileage.extraPerKm)} each.` : "Drive as far as you like."} Late returns over 59 minutes are charged by the hour.</p></div></div>
        <div class="policy">${icon("cal")}<div><b>Cancellation: ${pol.name}</b><p>${pol.desc}</p></div></div>
        <h2 class="sec-title">Rules</h2>
        <ul class="bullets">${rules.map(x => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}<li>${icon("check")}<span>Driver must be ${v.minAge} or older with a valid licence</span></li></ul>
        <h2 class="sec-title">Pick-up locations</h2>
        <div class="group icons">${vehicleLocs(v).map(l => row({ ic: LOC[l].airport ? "plane" : "pin", color: LOC[l].airport ? "#5856D6" : "var(--blue)", label: esc(LOC[l].name), sub: esc(b.pickupNotes?.[l] || LOC[l].parish) + (LOC[l].airport ? ` · ${moneyJ(EXTRAS.airport.flat)} airport fee` : "") })).join("")}${hasFeat(v, "delivery") ? row({ ic: "hotel", color: "#FF9500", label: "Delivery to your hotel", sub: `${moneyJ(EXTRAS.delivery.flat)} flat fee` }) : ""}</div>
        <h2 class="sec-title">Availability</h2>
        <div class="card">${availMonths(v, 2)}${calLegend()}</div>
        <h2 class="sec-title">Reviews</h2>
        ${reviews.length ? `<div class="rev-sum"><span class="big">${r.avg.toFixed(1)}</span><div>${stars(r.avg)}<div class="muted" style="font-size:13px">${plural(r.count, "review")} · only from completed trips</div></div></div>${reviews.slice(0, 4).map(reviewHTML).join("")}${reviews.length > 4 ? `<button type="button" class="btn block plain press" style="margin-top:12px" data-act="allReviews">Show all ${reviews.length} reviews</button>` : ""}`
          : `<div class="group pad"><p>No reviews yet. Reviews can only be left after a completed trip.</p></div>`}
        <button type="button" class="link danger report-link" data-act="report" data-vehicle="${v.id}">${icon("flag")}Report this listing</button>
      </div>`;
  },
  fixed(ctx) {
    const v = getV(ctx.params.id); if (!v) return "";
    const L = ctx.local; const q = quote(v, L.start, L.end, {}); const av = checkAvail(v, L.start, L.end);
    const can = isLive(v) && Nav.role === "customer";
    const label = Nav.role !== "customer" ? "Customer preview" : !isLive(v) ? "Not bookable" : !av.ok ? "Pick other dates" : v.instantBook ? "Book now" : "Request to book";
    return `<div class="buybar glass"><div class="bb-price"><b>${money(q.total)}</b><span>Total for ${plural(q.days, "day")} · incl. fees</span><small>${money(v.rates.daily)}/day · ${money(q.total, { cur: otherCur() })}</small></div>
      <button type="button" class="btn pill press" data-act="${can ? (av.ok ? "reserve" : "dates") : "noop"}" ${can ? "" : "disabled"}>${v.instantBook && av.ok && can ? icon("bolt") : ""}${label}</button></div>`;
  },
  actions: {
    reserve: (t, ctx) => openBooking(getV(ctx.params.id), { start: ctx.local.start, end: ctx.local.end }),
    dates: async (t, ctx) => { const r = await pickTrip({ start: ctx.local.start, end: ctx.local.end }); if (r) { Object.assign(ctx.local, r); renderPage(ctx); } },
    useNext: (t, ctx) => { ctx.local.start = t.dataset.s; ctx.local.end = t.dataset.e; renderPage(ctx); toast("Dates updated"); },
    allReviews: (t, ctx) => { const v = getV(ctx.params.id); const list = S.reviews.filter(x => x.vehicleId === v.id).sort((a, z) => z.at - a.at); Sheets.open({ title: `Reviews · ${vName(v)}`, size: "large", render: () => list.map(reviewHTML).join("") }); },
  },
};
function reviewHTML(r) {
  return `<article class="rev"><div class="rev-top">${avatar(r.author)}<div><b>${esc(r.author)} ${r.sample ? smp() : ""}</b><small>${esc(r.from || "")} · ${fmtDate(fromMs(r.at), true)}</small></div>${stars(r.rating)}</div><p>${esc(r.text)}</p><span class="vtrip">${icon("check")}Completed trip</span></article>`;
}
function breakdownHTML(q, o = {}) {
  const fx = S.settings.fx;
  return `<div class="breakdown">
    <div class="bl"><span>${q.days} ${q.days === 1 ? "day" : "days"} × ${money(q.rate)}${q.tier !== "daily" ? `<em>${q.tier} rate</em>` : ""}</span><b>${money(q.rental)}</b></div>
    ${q.seasonal ? `<div class="bl"><span>Peak season (${plural(q.seasonDays, "day")})</span><b>${money(q.seasonal)}</b></div>` : ""}
    ${q.extras.map(e => `<div class="bl"><span>${esc(e.label)}</span><b>${money(e.amount)}</b></div>`).join("")}
    <div class="bl"><span>${q.insurance.name}${q.insurance.perDay ? ` · ${money(q.insurance.perDay)}/day` : ""}</span><b>${q.insurance.amount ? money(q.insurance.amount) : "Included"}</b></div>
    <div class="bl"><span>Service fee</span><b>${money(q.serviceFee)}</b></div>
    <div class="bl"><span>GCT (15%)</span><b>${money(q.gct)}</b></div>
    ${o.extraLines || ""}
    <div class="bl total"><span>Total</span><b>${money(q.total)}</b></div>
    <div class="bl dep"><span>${icon("lock")}Refundable deposit held</span><b>${money(q.deposit)}</b></div>
    <p class="bl-note">Sample prices. ${S.settings.currency === "USD" ? `Converted from J$ at J$${fx} = US$1.` : `About ${money(q.total, { cur: "USD" })} at J$${fx} = US$1.`}</p>
  </div>`;
}

/* availability months (read-only for customers, interactive for hosts) */
function dayStates(v) {
  const map = {}; const mark = (k, st) => { const rank = { maint: 4, booked: 3, requested: 2, blocked: 1 }; if (!map[k] || rank[st] > rank[map[k]]) map[k] = st; };
  for (const b of S.bookings) {
    if (b.vehicleId !== v.id || !["requested", "confirmed", "active", "completed"].includes(b.status)) continue;
    for (let t = sod(toMs(b.start)); t < toMs(b.end); t += DAY) mark(dayKey(t), b.status === "requested" ? "requested" : "booked");
  }
  for (const bl of v.blocks || []) mark(bl.date, bl.kind === "maintenance" ? "maint" : "blocked");
  return map;
}
function monthGrid(v, y, m, o = {}) {
  const states = o.states || dayStates(v); const first = Date.UTC(y, m, 1); const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (new Date(first).getUTCDay() + 6) % 7; const tk = todayKey(); const T0 = sod(jmNow());
  let cells = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<span class="dow">${d[0]}</span>`).join("");
  for (let i = 0; i < lead; i++) cells += `<span class="d empty"></span>`;
  for (let d = 1; d <= days; d++) {
    const ms = Date.UTC(y, m, d); const k = dayKey(ms); let st = states[k] || ""; if (!st && v.maintenance && ms >= T0) st = "maint";
    const cls = `d ${st} ${k === tk ? "today" : ""} ${ms < T0 ? "past" : ""}`;
    const lbl = `${d} ${MONL[m]}${st ? ", " + ({ booked: "booked", requested: "requested", blocked: "blocked", maint: "maintenance" }[st]) : ", free"}`;
    cells += o.interactive ? `<button type="button" class="${cls}" data-act="day" data-k="${k}" aria-label="${lbl}">${d}</button>` : `<span class="${cls}" title="${lbl}">${d}</span>`;
  }
  return `<div class="cal ${o.mini ? "mini" : ""}">${cells}</div>`;
}
function availMonths(v, n) { const d = new Date(jmNow()); const states = dayStates(v); let html = ""; for (let i = 0; i < n; i++) { const y = d.getUTCFullYear(), m = d.getUTCMonth() + i; const dt = new Date(Date.UTC(y, m, 1)); html += `<div><div class="month-name">${MONL[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</div>${monthGrid(v, dt.getUTCFullYear(), dt.getUTCMonth(), { states, mini: true })}</div>`; } return `<div class="months">${html}</div>`; }
function calLegend(host) { return `<div class="legend"><span><i class="lg-free"></i>Free</span><span><i class="lg-booked"></i>Booked</span><span><i class="lg-req"></i>Requested</span><span><i class="lg-block"></i>Blocked${host ? " by you" : ""}</span><span><i class="lg-maint"></i>Maintenance</span></div>`; }

/* business profile sheet (customer view) */
function openBizSheet(id) {
  const b = getB(id); if (!b) return; const r = bRating(b.id); const vs = S.vehicles.filter(v => v.businessId === b.id && isLive(v));
  Sheets.open({ title: b.name, size: "large",
    render: () => `<div style="display:flex;gap:14px;align-items:center;margin:4px 0 14px">${bizLogo(b, "lg")}<div><h3 style="font-size:20px;letter-spacing:-.02em">${esc(b.name)} ${smp(b.sample)}</h3><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${b.verified ? `<span class="pill t-blue">${icon("shield")}Verified business</span>` : `<span class="pill t-orange">${icon("clock")}Verification pending</span>`}<span class="pill t-grey">${r.count ? `★ ${r.avg.toFixed(1)} · ${r.count} reviews` : "No reviews yet"}</span></div></div></div>
      <div class="group icons">
        ${row({ ic: "pin", label: esc(b.address), sub: esc(b.parish) })}
        ${row({ ic: "clock", color: "#FF9500", label: "Hours", sub: esc(b.hours) })}
        ${row({ ic: "phone", color: "#34C759", label: esc(b.phone), sub: "Phone (sample number)", act: "copy", attrs: `data-copy="${esc(b.phone)}"`, chevron: false, value: icon("copy", "sm") })}
        ${row({ ic: "whatsapp", color: "#25D366", label: esc(b.whatsapp), sub: "WhatsApp (sample number)", act: "copy", attrs: `data-copy="${esc(b.whatsapp)}"`, chevron: false, value: icon("copy", "sm") })}
        ${row({ ic: "chat", color: "#5856D6", label: `Usually replies within ${b.responseMins || 30} min`, sub: `Hosting on ${esc(CONFIG.APP_NAME)} since ${b.since || 2024}` })}
      </div>
      <h3 class="group-title">Policies</h3>
      <div class="policy">${icon("cal")}<div><b>${POLICIES[b.policy].name} cancellation</b><p>${POLICIES[b.policy].desc}</p></div></div>
      <div class="policy">${icon("fuel")}<div><b>Fuel: ${FUEL_POLICIES[b.fuelPolicy].name}</b><p>${FUEL_POLICIES[b.fuelPolicy].desc}</p></div></div>
      <div class="policy">${icon("lock")}<div><b>Deposit & damage</b><p>${esc(b.damagePolicy)}</p></div></div>
      <h3 class="group-title">Pick-up</h3>
      <div class="group icons">${b.pickups.map(l => row({ ic: LOC[l].airport ? "plane" : "pin", color: LOC[l].airport ? "#5856D6" : "var(--blue)", label: esc(LOC[l].name), sub: esc(b.pickupNotes?.[l] || "") })).join("")}${b.delivery ? row({ ic: "hotel", color: "#FF9500", label: "Delivers to hotels", sub: `${moneyJ(EXTRAS.delivery.flat)} flat` }) : ""}</div>
      <h3 class="group-title">${plural(vs.length, "vehicle")}</h3>
      <div class="hscroll mini-cards no-drag" style="margin:0 calc(-1*var(--gr)) 0 calc(-1*var(--gl));padding:0 var(--gr) 6px var(--gl)">${vs.map(v => miniCard(v)).join("")}</div>
      <button type="button" class="link danger report-link" data-act="report" data-biz="${b.id}">${icon("flag")}Report this business</button>`,
    actions: { },
  });
}
function miniCard(v, o = {}) {
  const start = o.start || S.search.start, end = o.end || S.search.end; const av = checkAvail(v, start, end); const q = quote(v, start, end, { pickup: o.pickup });
  return `<div class="mcard"><div class="mphoto sk"><img class="fade" src="${coverURL(v)}" alt="${esc(vFull(v))}, sample photo" loading="lazy"><div class="vtags"><span class="tag sample">Sample</span>${av.ok ? `<span class="tag ok">${icon("check")}Free</span>` : `<span class="tag no">Booked</span>`}</div></div>
    <div class="mb"><b>${esc(vName(v))} ${v.year}</b><small>${esc(getB(v.businessId).name)} · ${v.seats} seats · ${v.transmission === "auto" ? "Auto" : "Manual"}</small>
    <div class="mp"><b>${money(v.rates.daily)}<span class="per">/day</span></b><small>${money(q.total)} total</small></div>
    <div class="mbtns"><button type="button" class="btn sm plain press" data-act="openVehicle" data-id="${v.id}" data-start="${start}" data-end="${end}">View</button>${o.book && av.ok ? `<button type="button" class="btn sm press" data-act="aiBook" data-id="${v.id}" data-start="${start}" data-end="${end}" data-pickup="${o.pickup || ""}">Book</button>` : ""}</div></div></div>`;
}

/* ---- favourites ---- */
const FavsView = {
  id: "favs", large: true, ptr: true, title: () => "Favourites",
  render() {
    const list = S.favs.map(getV).filter(Boolean);
    return `<div class="inner"><h1 class="large-title">Favourites</h1><p class="lede">${list.length ? `${plural(list.length, "saved vehicle")} · tap the heart to remove` : "Vehicles you save show up here."}</p>
      <div class="results stagger" data-skel>${list.length ? list.map((v, i) => vehicleCard(v, { i })).join("") : emptyState("heart", "No favourites yet", "Tap the heart on any vehicle to save it for later.", `<button type="button" class="btn sm secondary press" data-act="goTab" data-tab="explore">Explore vehicles</button>`)}</div></div>`;
  },
};

/* ---- customer profile & settings ---- */
const ProfileView = {
  id: "profile", large: true, title: () => "Profile",
  render() {
    const p = S.profile; const lic = p.licence ? `•••• ${esc(p.licence.slice(-4))}` : "Not added";
    return `<div class="inner"><h1 class="large-title">Profile</h1>
      <div class="host-row" style="margin-top:6px">${avatar(p.name || "You")}<div><b>${esc(p.name || "Demo Customer")}</b><small>Demo customer account · ${custBookings().length} bookings</small></div></div>
      <h3 class="group-title">Driver details</h3>
      <div class="group">
        ${row({ label: "Full name", value: esc(p.name || "Add"), act: "edit", attrs: 'data-k="name"' })}
        ${row({ label: "Phone", value: esc(p.phone || "Add"), act: "edit", attrs: 'data-k="phone"' })}
        ${row({ label: "Licence number", value: lic, act: "edit", attrs: 'data-k="licence"' })}
        ${row({ label: "Licence expiry", value: p.licenceExpiry ? fmtMonthYear(p.licenceExpiry) : "Add", act: "expiry" })}
        ${row({ label: "Age", value: p.age ? String(p.age) : "Add", act: "edit", attrs: 'data-k="age"' })}
      </div>
      <p class="group-foot">Hosts need licence details before you can book. They’re saved on this device only.</p>
      ${settingsGroups()}
      <h3 class="group-title">Trust & safety</h3>
      <div class="group icons">
        ${row({ ic: "shield", color: "#34C759", label: "Verified hosts", sub: "Businesses checked by the marketplace show a shield badge" })}
        ${row({ ic: "lock", color: "#5856D6", label: "Deposits & damage", sub: "Shown before you pay, with your excess for each cover level" })}
        ${row({ ic: "star", color: "#FF9500", label: "Honest reviews", sub: "Only customers with a completed trip can review" })}
        ${row({ ic: "flag", color: "#FF3B30", label: "Report a problem", act: "report" })}
      </div>
      <p class="fineprint">${esc(CONFIG.APP_NAME)} is a demo. All businesses, vehicles, prices, bookings and reviews are SAMPLE data. Payments are simulated and no card details are collected.</p>
    </div>`;
  },
  actions: {
    edit: async (t) => { const k = t.dataset.k; const labels = { name: "Full name", phone: "Phone", licence: "Licence number", age: "Age" }; const v = await editField({ title: labels[k], label: labels[k], value: S.profile[k] || "", type: k === "age" ? "number" : k === "phone" ? "tel" : "text", inputmode: k === "age" ? "numeric" : "" }); if (v != null) { commit(st => { st.profile[k] = k === "age" ? clamp(parseInt(v, 10) || 0, 16, 99) : v.trim(); }); toast("Saved"); } },
    expiry: async () => { const v = await pickMonthYear({ value: S.profile.licenceExpiry }); if (v) { commit(st => { st.profile.licenceExpiry = v; }); toast("Saved"); } },
    ...settingsActions(),
  },
  onSeg(ctx, name, v) { if (name === "cur") { setCurrency(v, ctx); toast(v === "USD" ? `Showing US$ at J$${S.settings.fx} = US$1` : "Showing J$"); } },
};

function aiStatusHTML() {
  const m = AI.mode;
  if (m === "checking") return `<div class="ai-status wait" data-ai-status>${icon("clock")}<span>Connecting to the artifact AI…</span></div>`;
  if (m === "sample") return `<div class="ai-status on" data-ai-status>${icon("checkCircle")}<span>AI connected through the artifact AI (claude.use("sample")). Instant answers come from local search.</span></div>`;
  if (m === "complete") return `<div class="ai-status on" data-ai-status>${icon("checkCircle")}<span>AI connected through window.claude.complete.</span></div>`;
  if (m === "denied") return `<div class="ai-status off" data-ai-status>${icon("alert")}<span>AI access was declined in this view. Instant local search still works.</span></div>`;
  return `<div class="ai-status off" data-ai-status>${icon("alert")}<span>AI isn’t available here: window.claude.complete (and the artifact AI) can’t be reached in this viewer. Instant local search and booking still work.</span></div>`;
}
function settingsGroups() {
  return `<h3 class="group-title">Currency</h3>
    <div class="group"><div class="row"><span class="lbl"><b>Show prices in</b></span>${seg("cur", [{ v: "JMD", label: "J$ JMD" }, { v: "USD", label: "US$ USD" }], S.settings.currency, "")}</div>
    ${row({ label: "Exchange rate", sub: "Used for every US$ price in the app", value: `J$${S.settings.fx} = US$1`, act: "fx" })}</div>
    <h3 class="group-title">Appearance</h3>
    <div class="group">${row({ ic: "moon", color: "#5856D6", label: "Dark mode", sub: "Follows your device setting automatically" })}</div>
    <h3 class="group-title">Rental assistant</h3>
    ${aiStatusHTML()}
    <h3 class="group-title">Demo data</h3>
    <div class="group icons">
      ${row({ ic: "lock", color: "#8E8E93", label: "Saved to", sub: esc(Store.label()) })}
      ${row({ ic: "download", color: "#34C759", label: "Export JSON", sub: "Back up or move the demo data", act: "exportData" })}
      ${row({ ic: "upload", color: "#007AFF", label: "Import JSON", sub: "Replace the demo data from a backup", act: "importData" })}
      ${row({ ic: "refresh", color: "#FF3B30", label: "Reset demo", sub: "Restore the original SAMPLE data", act: "resetData", cls: "danger" })}
    </div>`;
}
function settingsActions() {
  return {
    fx: async () => { const v = await editField({ title: "Exchange rate", label: "J$ per US$1", value: String(S.settings.fx), type: "number", inputmode: "decimal", hint: "One editable rate converts every price between J$ and US$. Sample default: J$157." }); if (v != null) { const n = Math.round(parseFloat(v) * 100) / 100; if (!(n > 0 && n < 10000)) { toast("Enter a rate between 1 and 10,000", { tone: "warn" }); return; } commit(st => { st.settings.fx = n; }); toast(`Rate set to J$${n} = US$1`); } },
    exportData: () => openExport(),
    importData: () => openImport(),
    resetData: async () => { const r = await actionSheet({ title: "Reset the demo?", message: "This replaces everything on this device with the original SAMPLE data. Your bookings, edits and uploads will be lost.", actions: [{ label: "Reset demo data", style: "destructive", value: "yes" }] }); if (r === "yes") { const role = S.role; S = seedState(); S.role = role; await Store.flush(); Nav.setRole(role); toast("Demo data reset"); } },
  };
}
let DL = null;
function openExport() {
  const json = JSON.stringify(S, null, 2);
  Sheets.open({ title: "Export demo data", size: "large",
    render: () => `<p class="note" style="margin-bottom:10px">${icon("info")}<span>Copy this JSON to back up your demo, or ${DL ? "save it as a file" : "paste it into Import on another device"}. ${(json.length / 1024).toFixed(0)} KB.</span></p><textarea class="code no-drag" id="exportJson" readonly aria-label="Demo data JSON">${esc(json)}</textarea>`,
    footer: () => `<div class="btn-row"><button type="button" class="btn pill secondary press" data-act="copyJson">${icon("copy")}Copy</button>${DL ? `<button type="button" class="btn pill press" data-act="saveJson">${icon("download")}Save file</button>` : ""}</div>`,
    actions: {
      copyJson: (t, s) => { const ta = s.body.querySelector("textarea"); ta.select(); copyText(json, "JSON copied"); },
      saveJson: async () => { try { await DL.save({ filename: "rentyaad-demo.json", data: json }); toast("Saved"); } catch (e) { if (e?.code !== "declined") toast("Couldn’t save the file here. Use Copy instead.", { tone: "warn" }); } },
    } });
}
function openImport() {
  const L = { text: "" };
  Sheets.open({ title: "Import demo data", size: "large",
    render: () => `<p class="note" style="margin-bottom:10px">${icon("info")}<span>Paste JSON exported from ${esc(CONFIG.APP_NAME)}, or choose a .json file. This replaces the current demo data.</span></p>
      <textarea class="code no-drag" id="importJson" placeholder="{ … }" data-input="txt" aria-label="Paste demo data JSON" style="min-height:220px"></textarea>
      <label class="btn block plain press file-btn" style="margin-top:12px">${icon("upload")}Choose a .json file<input type="file" accept="application/json,.json" data-change="file"></label>`,
    inputs: {
      txt: t => { L.text = t.value; },
      file: (t, s) => { const f = t.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { L.text = String(fr.result); s.body.querySelector("textarea").value = L.text; toast("File loaded"); }; fr.readAsText(f); },
    },
    footer: () => `<button type="button" class="btn block pill press" data-act="doImport">Import</button>`,
    actions: { doImport: async (t, s) => {
      let data; try { data = JSON.parse(L.text); } catch (e) { toast("That isn’t valid JSON", { tone: "warn" }); return; }
      if (!data || !Array.isArray(data.vehicles) || !Array.isArray(data.businesses) || !Array.isArray(data.bookings) || !data.settings) { toast("JSON is missing vehicles, businesses or bookings", { tone: "warn" }); return; }
      const r = await actionSheet({ title: "Replace demo data?", message: `Import ${data.vehicles.length} vehicles, ${data.businesses.length} businesses and ${data.bookings.length} bookings.`, actions: [{ label: "Replace data", style: "destructive", value: "yes" }] });
      if (r !== "yes") return;
      S = normalizeState(data); await Store.flush(); s.close(); Nav.setRole(S.role || "customer"); toast("Demo data imported");
    } } });
}

/* ---- report a problem ---- */
function openReport({ vehicleId, bookingId, businessId } = {}) {
  const bk = bookingId ? getBk(bookingId) : null; const v = getV(vehicleId || bk?.vehicleId); const b = getB(businessId || bk?.businessId || v?.businessId);
  const cats = ["Safety concern", "Vehicle condition", "Billing or deposit", "Listing is inaccurate", "Host or customer behaviour", "Other"];
  const L = { cat: cats[0], text: "" };
  Sheets.open({ title: "Report a problem", size: "large",
    render: () => `<p class="note" style="margin-bottom:12px">${icon("shield")}<span>Reports go to the ${esc(CONFIG.APP_NAME)} trust & safety team (the Admin view in this demo). ${v ? `About: <b>${esc(vFull(v))}</b>` : b ? `About: <b>${esc(b.name)}</b>` : ""}${bk ? ` · booking ${esc(bk.ref)}` : ""}</span></p>
      <div class="group">${cats.map(c => `<button type="button" class="row tap ${L.cat === c ? "on" : ""}" data-act="cat" data-v="${esc(c)}"><span class="radio-dot ${L.cat === c ? "on" : ""}"></span><span class="lbl"><b>${c}</b></span></button>`).join("")}</div>
      <h3 class="group-title">What happened?</h3>
      <textarea class="textarea no-drag" data-input="txt" placeholder="Describe the problem (dates, what you saw, what you need)" aria-label="Describe the problem">${esc(L.text)}</textarea>
      <p class="group-foot">In an emergency, call 119 (police) or 110 (fire & ambulance) in Jamaica first.</p>`,
    inputs: { txt: t => { L.text = t.value; } },
    actions: { cat: (t, s) => { L.cat = t.dataset.v; for (const r of $$(".row", s.body)) { const on = r.dataset.v === L.cat; r.classList.toggle("on", on); r.querySelector(".radio-dot")?.classList.toggle("on", on); } }, send: (t, s) => {
      if (L.text.trim().length < 10) { toast("Add a few more details (10+ characters)", { tone: "warn" }); return; }
      const by = Nav.role === "business" ? "business" : "customer";
      commit(st => { st.reports.unshift({ id: uid("rp_"), kind: bk ? "dispute" : "report", category: L.cat, title: L.cat + (v ? ` · ${vName(v)}` : b ? ` · ${b.name}` : ""), text: L.text.trim(), by, reporter: by === "business" ? (getB(S.hostBizId)?.name || "Host") : (S.profile.name || "Demo Customer"), bookingId: bk?.id || null, vehicleId: v?.id || null, businessId: b?.id || null, status: "open", at: jmNow(), sample: false }); });
      s.close(); toast("Report sent to the trust & safety team");
    } },
    footer: () => `<button type="button" class="btn block pill press" data-act="send">Send report</button>`,
  });
}
