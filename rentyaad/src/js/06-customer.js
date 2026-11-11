/* ============ renter: explore, location search, vehicle detail, favourites, account ============ */
function activeFilterCount(q) { return (q.seats > 1 ? 1 : 0) + (q.trans ? 1 : 0) + (q.pmin > 0 || q.pmax < CONFIG.PRICE_MAX ? 1 : 0) + q.features.length + (q.payMethods || []).length + (q.verifiedOnly ? 1 : 0) + (q.instantOnly ? 1 : 0) + (q.availOnly ? 1 : 0); }
function resetFilters() { Object.assign(S.search, { seats: 1, trans: "", pmin: 0, pmax: CONFIG.PRICE_MAX, features: [], payMethods: [], verifiedOnly: false, instantOnly: false, availOnly: false, sort: S.search.where?.kind === "near" ? "near" : "rec", type: "", text: "" }); Store.save(); }
function matchFilterFeature(v, f) { return f === "airport" ? offers(v, "airport") : f === "hotel" ? offers(v, "hotel") : hasFeat(v, f); }

function searchVehicles(q) {
  const tokens = (q.text || "").toLowerCase().split(/\s+/).filter(Boolean); const w = q.where || { kind: "any" };
  const out = [];
  for (const v of S.vehicles) {
    if (!isLive(v)) continue;
    const b = getB(v.businessId);
    if (!matchWhere(v, w)) continue;
    if (q.type && v.type !== q.type) continue;
    if (q.seats > 1 && v.seats < q.seats) continue;
    if (q.trans && v.transmission !== q.trans) continue;
    if (v.rates.daily < q.pmin || (q.pmax < CONFIG.PRICE_MAX && v.rates.daily > q.pmax)) continue;
    if (q.features.some(f => !matchFilterFeature(v, f))) continue;
    if ((q.payMethods || []).some(m => !b.payments?.[m])) continue;
    if (q.verifiedOnly && !b.verified) continue;
    if (q.instantOnly && !v.instantBook) continue;
    if (tokens.length) { const hay = `${v.make} ${v.model} ${v.year} ${v.title} ${TYPE[v.type].name} ${b.name} ${v.location?.town} ${v.location?.parish}`.toLowerCase(); if (!tokens.every(t => hay.includes(t))) continue; }
    const avail = checkAvail(v, q.start, q.end);
    if (q.availOnly && !avail.ok) continue;
    out.push({ v, b, avail, r: vRating(v.id), dist: w.kind === "near" ? distanceKm(v, w) : null });
  }
  const byRec = (a, z) => (z.avail.ok - a.avail.ok) || (z.b.verified - a.b.verified) || (z.r.avg - a.r.avg) || (a.v.rates.daily - z.v.rates.daily);
  const sorters = { rec: byRec, near: (a, z) => (z.avail.ok - a.avail.ok) || ((a.dist ?? 1e9) - (z.dist ?? 1e9)), price: (a, z) => (z.avail.ok - a.avail.ok) || (a.v.rates.daily - z.v.rates.daily), rating: (a, z) => (z.r.avg - a.r.avg) || (z.r.count - a.r.count) };
  let sort = q.sort; if (sort === "near" && w.kind !== "near") sort = "rec";
  return out.sort(sorters[sort] || byRec);
}

function availTag(av) {
  if (av.ok) return `<span class="tag"><span class="dot"></span>Available</span>`;
  if (av.reason === "maintenance") return `<span class="tag warn"><span class="dot"></span>In maintenance</span>`;
  return `<span class="tag no"><span class="dot"></span>${av.reason === "booked" ? "Booked" : "Unavailable"}</span>`;
}
function vehicleCard(v, o = {}) {
  const b = getB(v.businessId); const r = o.r || vRating(v.id); const photos = vehiclePhotos(v).slice(0, 4); const i = o.i || 0;
  const av = o.avail || checkAvail(v, S.search.start, S.search.end);
  const dist = o.dist != null ? o.dist : (S.search.where?.kind === "near" ? distanceKm(v, S.search.where) : null);
  return `<article class="vcard" style="--i:${i}">
    <div class="vphoto sk">
      <div class="carousel hscroll">${photos.map((p, k) => `<img class="fade" src="${p}" alt="${esc(vFull(v))}${isRender(v) ? ", sample render" : ""} ${k + 1}" loading="${i < 2 && k === 0 ? "eager" : "lazy"}" decoding="async" data-act="openVehicle" data-id="${v.id}" draggable="false">`).join("")}</div>
      <div class="vtags">${v.sample ? `<span class="tag sample">Sample</span>` : isRender(v) ? `<span class="tag sample">Render</span>` : ""}${availTag(av)}</div>
      ${heartBtn(v.id)}
      ${photos.length > 1 ? `<div class="dots">${photos.map((_, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</div>` : ""}
    </div>
    <div class="vbody" role="button" tabindex="0" data-act="openVehicle" data-id="${v.id}" aria-label="${esc(vFull(v))}, ${esc(locatedIn(v))}">
      <div class="vline1"><h3>${esc(vName(v))} <span class="yr">${v.year}</span></h3>${ratingHTML(r)}</div>
      <div class="v-sub">${esc(locatedIn(v))}${dist != null ? ` · <b>${fmtKm(dist)} away</b>` : ""}</div>
      <div class="v-sub">${v.seats} seats · ${v.transmission === "auto" ? "Automatic" : "Manual"} · ${esc(v.fuel)}${hasFeat(v, "driver") ? " · Driver included" : ""}</div>
      <div class="vbiz">${esc(b.name)} ${verified(b)} ${smp(b.sample)}</div>
      <div class="vprice"><div><span class="price">${money(v.rates.daily)}</span><span class="per">/ day</span><span class="alt">${money(v.rates.daily, { cur: otherCur() })}</span></div><div class="dep">${money(v.deposit)} deposit · ${mileageText(v)}</div></div>
    </div>
  </article>`;
}

const ExploreView = {
  id: "explore", large: true, ptr: true,
  title: () => "Explore",
  navRight: () => `<button type="button" class="nav-btn press" data-act="openAssistant" aria-label="Open the rental assistant">${icon("sparkles")}</button>`,
  render() {
    const q = S.search; const days = rentalDays(q.start, q.end); const w = q.where || { kind: "any" };
    const cats = [{ id: "", plural: "All", icon: "grid" }, ...TYPES];
    const first = me().name && me().id !== "guest" ? me().name.split(" ")[0] : "";
    return `<div class="inner">
      <h1 class="large-title">Explore</h1>
      <p class="lede">${first ? `Welcome back, ${esc(first)}. ` : ""}Cars, SUVs, vans and scooters from trusted local hosts.</p>
      <section class="search-card" aria-label="Search">
        <button type="button" class="sc-row" data-act="pickLoc">${icon(w.kind === "near" ? "locate" : w.kind === "airport" ? "plane" : "pin")}<span class="sc-txt"><small>Where</small><b>${esc(whereLabel(w))}</b></span>${icon("chevD", "muted")}</button>
        <div class="sc-split">
          <button type="button" class="sc-row" data-act="pickDates" data-which="start"><span class="sc-txt"><small>Pick-up</small><b>${relDate(q.start)}</b><em>${fmtTime(q.start)}</em></span></button>
          <button type="button" class="sc-row" data-act="pickDates" data-which="end"><span class="sc-txt"><small>Return</small><b>${relDate(q.end)}</b><em>${fmtTime(q.end)}</em></span></button>
        </div>
        <div class="sc-foot"><span>${plural(days, "day")} · ${CONFIG.TZ_LABEL}</span>${seg("cur", [{ v: "JMD", label: "J$" }, { v: "USD", label: "US$" }], S.settings.currency, "mini")}</div>
      </section>
      <label class="searchbar">${icon("search")}<span class="vh">Search listings</span><input id="exploreQ" type="search" placeholder="Make, model, town or host" value="${esc(q.text || "")}" data-input="q" autocomplete="off" enterkeyhint="search"></label>
      <div class="catbar hscroll no-drag" role="tablist" aria-label="Vehicle type">${cats.map(t => `<button type="button" class="cat ${q.type === t.id ? "on" : ""}" data-act="type" data-v="${t.id}" role="tab" aria-selected="${q.type === t.id}">${icon(t.icon)}<span>${t.plural}</span></button>`).join("")}</div>
      <button type="button" class="assist-row press" data-act="openAssistant"><span class="a-ico">${icon("sparkles")}</span><span class="a-txt"><b>Ask the rental assistant</b><span>“Mi need a van fi 10 people from MoBay airport Friday”</span></span>${icon("chevR", "muted")}</button>
      <div class="results-head"><h2 id="rcount">Vehicles</h2><div class="rh-r"><button type="button" class="chip press" data-act="filters">${icon("sliders")}<span>Filters</span><b class="cnt" id="fcount" hidden></b></button></div></div>
      <div class="results stagger go" id="results" data-skel></div>
      <p class="fineprint">Every host, vehicle, price and review here is SAMPLE data. Sample listings use studio renders, not real photos. US$ uses J$${S.settings.fx} = US$1.</p>
    </div>`;
  },
  mount(ctx) { renderResults(ctx); },
  actions: {
    pickLoc: (t, ctx) => openLocationSheet(ctx),
    pickDates: async (t, ctx) => { const r = await pickTrip({ start: S.search.start, end: S.search.end, which: t.dataset.which }); if (r) { S.search.start = r.start; S.search.end = r.end; Store.save(); Nav.invalidate(); } },
    type: (t, ctx) => { S.search.type = t.dataset.v; Store.save(); haptic(4); for (const c of $$(".cat", ctx.content)) { const on = c.dataset.v === S.search.type; c.classList.toggle("on", on); c.setAttribute("aria-selected", on); } renderResults(ctx); },
    filters: (t, ctx) => openFilters(ctx),
    clearFilters: () => { resetFilters(); S.search.where = { kind: "any" }; Nav.invalidate(); },
  },
  onSeg(ctx, name, v) { if (name === "cur") { setCurrency(v, ctx); renderResults(ctx); } },
  inputs: { q: (el, ctx) => { S.search.text = el.value; Store.save(); (ctx.local.deb ||= debounce(() => renderResults(ctx), 110))(); } },
};
function setCurrency(v, skip) { commit(st => { st.settings.currency = v; }, { render: false }); for (const k in Nav.stacks) for (const p of Nav.stacks[k].pages) if (p !== skip) p.dirty = true; const top = Nav.top(); if (top && top !== skip) renderPage(top); }
function renderResults(ctx) {
  const box = ctx.content.querySelector("#results"); if (!box) return;
  const list = searchVehicles(S.search); const avail = list.filter(x => x.avail.ok).length;
  ctx.content.querySelector("#rcount").textContent = list.length ? `${plural(list.length, "vehicle")}` : "No matches";
  const fc = activeFilterCount(S.search); const fEl = ctx.content.querySelector("#fcount"); fEl.hidden = !fc; fEl.textContent = fc;
  box.innerHTML = list.length ? list.map((x, i) => vehicleCard(x.v, { avail: x.avail, r: x.r, dist: x.dist, i })).join("")
    : emptyState("search", "No vehicles match", "Try another town or dates, or loosen a filter.", `<button type="button" class="btn sm plain press" data-act="clearFilters">Clear search & filters</button>`);
  box.setAttribute("aria-label", `${list.length} vehicles, ${avail} available`);
  hydrate(box);
}

/* ---- location: parish → town, airports, near me ---- */
function vehiclesWhere(w) { return S.vehicles.filter(v => isLive(v) && matchWhere(v, w)).length; }
function setWhere(w, ctx) { S.search.where = w; if (w.kind === "near") S.search.sort = "near"; else if (S.search.sort === "near") S.search.sort = "rec"; Store.save(); if (ctx) renderPage(ctx); else Nav.invalidate(); }
function openLocationSheet(ctx) {
  const L = { parish: null };
  const cur = S.search.where || { kind: "any" };
  const sel = w => JSON.stringify(w) === JSON.stringify(cur) || (w.kind === cur.kind && w.parish === cur.parish && w.town === cur.town && w.airport === cur.airport && w.id === cur.id && w.kind !== "near");
  const choose = (s, w) => { haptic(5); s.close(); setWhere(w, ctx); };
  Sheets.open({ title: "Where", size: "large",
    render: s => {
      if (L.parish) {
        const p = L.parish;
        return `<button type="button" class="link" data-act="back" style="padding:0 0 10px">${icon("chevL")}All parishes</button>
          <h3 class="sec-title" style="margin-top:4px">${esc(p)}</h3>
          <div class="group">
            <button type="button" class="row tap ${sel({ kind: "parish", parish: p }) ? "on" : ""}" data-act="pick" data-w='${esc(JSON.stringify({ kind: "parish", parish: p }))}'><span class="lbl"><b>All of ${esc(p)}</b><small>${plural(vehiclesWhere({ kind: "parish", parish: p }), "vehicle")}</small></span>${sel({ kind: "parish", parish: p }) ? icon("check", "accent") : ""}</button>
            ${PARISH_TOWNS[p].map(([t]) => { const w = { kind: "town", parish: p, town: t }; const n = vehiclesWhere(w); return `<button type="button" class="row tap" data-act="pick" data-w='${esc(JSON.stringify(w))}'><span class="lbl"><b>${esc(t)}</b><small>${n ? plural(n, "vehicle") : "No vehicles yet"}</small></span>${sel(w) ? icon("check", "accent") : ""}</button>`; }).join("")}
          </div>`;
      }
      return `<div class="group icons">
          <button type="button" class="row tap" data-act="near">${icoBox("locate")}<span class="lbl"><b>Near me</b><small>Sort by distance from where you are</small></span>${cur.kind === "near" ? icon("check", "accent") : chev()}</button>
          <button type="button" class="row tap" data-act="pick" data-w='{"kind":"any"}'>${icoBox("compass")}<span class="lbl"><b>Anywhere in Jamaica</b><small>${plural(vehiclesWhere({ kind: "any" }), "vehicle")}</small></span>${cur.kind === "any" ? icon("check", "accent") : ""}</button>
        </div>
        <h3 class="group-title">Popular</h3>
        <div class="loc-chips">${POPULAR.map(p => { const w = p.kind === "area" ? { kind: "area", id: p.id } : { kind: "town", parish: p.parish, town: p.town }; return `<button type="button" class="sel-chip press ${sel(w) ? "on" : ""}" data-act="pick" data-w='${esc(JSON.stringify(w))}'>${esc(p.label)}</button>`; }).join("")}</div>
        <h3 class="group-title">Airport delivery</h3>
        <div class="group icons">${Object.values(AIRPORTS).map(a => { const w = { kind: "airport", airport: a.id }; return `<button type="button" class="row tap" data-act="pick" data-w='${esc(JSON.stringify(w))}'>${icoBox("plane")}<span class="lbl"><b>${esc(a.name)}</b><small>${plural(vehiclesWhere(w), "vehicle")} delivered here</small></span>${sel(w) ? icon("check", "accent") : ""}</button>`; }).join("")}</div>
        <h3 class="group-title">Browse by parish</h3>
        <div class="group">${PARISHES.map(p => `<button type="button" class="row tap" data-act="parish" data-p="${esc(p)}"><span class="lbl"><b>${esc(p)}</b><small>${plural(vehiclesWhere({ kind: "parish", parish: p }), "vehicle")}</small></span>${chev()}</button>`).join("")}</div>`;
    },
    actions: {
      pick: (t, s) => choose(s, JSON.parse(t.dataset.w)),
      parish: (t, s) => { L.parish = t.dataset.p; s.refresh({ keepScroll: false }); s.body.firstElementChild?.parentElement.animate?.([{ opacity: 0, transform: "translateX(20px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE }); },
      back: (t, s) => { L.parish = null; s.refresh({ keepScroll: false }); },
      near: (t, s) => { s.close(); findNearMe(ctx); },
    } });
}
function findNearMe(ctx) {
  const fallback = reason => openApproxLocation(ctx, reason);
  if (!navigator.geolocation) { fallback("Location isn’t supported in this browser."); return; }
  toast("Finding your location…", { icon: "locate", ms: 1600 });
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; fallback("Your location took too long to arrive."); } }, 9000);
  try {
    navigator.geolocation.getCurrentPosition(pos => {
      if (done) return; done = true; clearTimeout(timer);
      const { latitude: lat, longitude: lng } = pos.coords; const t = nearestTown(lat, lng);
      const inJa = lat > 17.6 && lat < 18.6 && lng > -78.5 && lng < -76.1;
      if (!inJa) { fallback("You seem to be outside Jamaica, so distances wouldn’t be useful."); return; }
      setWhere({ kind: "near", lat, lng, label: `Near ${t.town}`, approx: false }, ctx); toast(`Sorted by distance from ${t.town}`);
    }, err => { if (done) return; done = true; clearTimeout(timer); fallback(err && err.code === 1 ? "Location permission was blocked in this preview." : "Your location isn’t available here."); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  } catch (e) { done = true; clearTimeout(timer); fallback("Location isn’t available in this preview."); }
}
function openApproxLocation(ctx, reason) {
  const L = { parish: null };
  Sheets.open({ title: "Where are you?", size: "large",
    render: () => L.parish ? `<button type="button" class="link" data-act="back" style="padding:0 0 10px">${icon("chevL")}All parishes</button><div class="group">${PARISH_TOWNS[L.parish].map(([t]) => `<button type="button" class="row tap" data-act="town" data-p="${esc(L.parish)}" data-t="${esc(t)}"><span class="lbl"><b>${esc(t)}</b><small>${esc(L.parish)}</small></span></button>`).join("")}</div>`
      : `<div class="mock-banner">${icon("info")}<span>${esc(reason)} Pick the town you’re near and we’ll sort by approximate distance. On the live HTTPS site, “Near me” asks for your device location.</span></div>
        <h3 class="group-title">Popular</h3><div class="loc-chips">${POPULAR.filter(p => p.kind === "town").map(p => `<button type="button" class="sel-chip press" data-act="town" data-p="${esc(p.parish)}" data-t="${esc(p.town)}">${esc(p.label)}</button>`).join("")}<button type="button" class="sel-chip press" data-act="town" data-p="St Andrew" data-t="New Kingston">Kingston</button></div>
        <h3 class="group-title">Choose by parish</h3><div class="group">${PARISHES.map(p => `<button type="button" class="row tap" data-act="parish" data-p="${esc(p)}"><span class="lbl"><b>${esc(p)}</b></span>${chev()}</button>`).join("")}</div>`,
    actions: {
      parish: (t, s) => { L.parish = t.dataset.p; s.refresh({ keepScroll: false }); },
      back: (t, s) => { L.parish = null; s.refresh({ keepScroll: false }); },
      town: (t, s) => { const [lat, lng] = townCoords(t.dataset.p, t.dataset.t); s.close(); setWhere({ kind: "near", lat, lng, label: `Near ${t.dataset.t} (approx.)`, approx: true }, ctx); toast(`Sorted by distance from ${t.dataset.t}`); },
    } });
}

function openFilters(ctx) {
  const q = S.search; const PM = CONFIG.PRICE_MAX; q.payMethods = q.payMethods || [];
  const prices = S.vehicles.filter(isLive).map(v => v.rates.daily);
  const bins = 20; const hist = Array(bins).fill(0); prices.forEach(p => hist[Math.min(bins - 1, Math.floor(p / PM * bins))]++); const hmax = Math.max(...hist, 1);
  const count = () => searchVehicles(q).length;
  const syncRange = s => {
    const lo = Math.min(q.pmin, q.pmax), hi = Math.max(q.pmin, q.pmax);
    s.body.querySelector("#pmin").textContent = money(lo); s.body.querySelector("#pmax").textContent = hi >= PM ? money(PM) + "+" : money(hi);
    s.body.querySelector(".fillr").style.transform = `translateX(${lo / PM * 100}%) scaleX(${(hi - lo) / PM})`;
    s.body.querySelectorAll(".histo i").forEach((el, k) => el.classList.toggle("in", (k + 0.5) / bins * PM >= lo && (k + 0.5) / bins * PM <= hi));
  };
  const apply = s => { Store.save(); renderResults(ctx); s.refreshFoot(); };
  const sortOpts = [{ v: "rec", label: "Best match" }, { v: "price", label: "Lowest price" }, { v: "rating", label: "Top rated" }];
  if (q.where?.kind === "near") sortOpts.splice(1, 0, { v: "near", label: "Nearest" });
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
      <h3 class="group-title">Features & pick-up</h3>
      <div class="group icons">${FILTER_FEATURES.map(f => `<label class="row">${icoBox(f.icon)}<span class="lbl"><b>${f.name}</b></span>${switchEl("f_" + f.id, q.features.includes(f.id), `data-change="feat" data-v="${f.id}"`, f.name)}</label>`).join("")}</div>
      <h3 class="group-title">Payment the host accepts</h3>
      <div class="group icons">${Object.values(PAYMENT_METHODS).map(m => `<label class="row">${icoBox(m.icon)}<span class="lbl"><b>${m.name}</b></span>${switchEl("pm_" + m.id, q.payMethods.includes(m.id), `data-change="pay" data-v="${m.id}"`, m.name)}</label>`).join("")}</div>
      <h3 class="group-title">Trust & booking</h3>
      <div class="group icons">
        <label class="row">${icoBox("shield")}<span class="lbl"><b>Verified hosts only</b><small>ID and business checked by the marketplace</small></span>${switchEl("f_ver", q.verifiedOnly, 'data-change="flag" data-k="verifiedOnly"', "Verified hosts only")}</label>
        <label class="row">${icoBox("bolt")}<span class="lbl"><b>Instant book</b><small>Confirmed without waiting for the host</small></span>${switchEl("f_ins", q.instantOnly, 'data-change="flag" data-k="instantOnly"', "Instant book only")}</label>
        <label class="row">${icoBox("cal")}<span class="lbl"><b>Free for my dates</b><small>Hide vehicles already booked</small></span>${switchEl("f_av", q.availOnly, 'data-change="flag" data-k="availOnly"', "Available for my dates only")}</label>
      </div>
      <h3 class="group-title">Sort by</h3>
      ${seg("sort", sortOpts, q.sort || "rec", "block")}`,
    mount: s => syncRange(s),
    footer: () => { const n = count(); return `<button type="button" class="btn block press" data-act="close" ${n ? "" : "disabled"}>${n ? `Show ${plural(n, "vehicle")}` : "No vehicles match"}</button>`; },
    onSeg: (s, name, v) => { q[name] = v; apply(s); },
    onStep: (s, name, v) => { q.seats = v; apply(s); },
    inputs: {
      pmin: (t, s) => { q.pmin = Math.min(+t.value, q.pmax - 500); if (+t.value !== q.pmin) t.value = q.pmin; syncRange(s); (s.local.deb ||= debounce(() => apply(s), 90))(); },
      pmax: (t, s) => { q.pmax = Math.max(+t.value, q.pmin + 500); if (+t.value !== q.pmax) t.value = q.pmax; syncRange(s); (s.local.deb ||= debounce(() => apply(s), 90))(); },
      feat: (t, s) => { const f = t.dataset.v; q.features = t.checked ? [...new Set([...q.features, f])] : q.features.filter(x => x !== f); haptic(4); apply(s); },
      pay: (t, s) => { const m = t.dataset.v; q.payMethods = t.checked ? [...new Set([...q.payMethods, m])] : q.payMethods.filter(x => x !== m); haptic(4); apply(s); },
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
    const live = isLive(v); const w = S.search.where; const dist = w?.kind === "near" ? distanceKm(v, w) : null;
    const specs = [["seat", "Seats", v.seats], ["gear", "Gearbox", v.transmission === "auto" ? "Automatic" : "Manual"], ["fuel", "Fuel", v.fuel], ["cal", "Year", v.year], ["image", "Colour", colorName(v.color)], ["road", "Mileage", v.mileage.limit ? `${v.mileage.limit} km/day` : "Unlimited"], ["user", "Min. driver age", `${v.minAge}+`], ["lock", "Deposit", money(v.deposit)]];
    const reviews = S.reviews.filter(x => x.vehicleId === v.id).sort((a, z) => z.at - a.at);
    const pol = POLICIES[b.policy]; const fuel = FUEL_POLICIES[b.fuelPolicy];
    const rules = [...(v.rules || []).map(id => RULE[id]?.name).filter(Boolean), ...(v.customRules || []), ...(b.rules || "").split(/\.\s+/).filter(Boolean).map(x => x.replace(/\.$/, ""))];
    const methods = acceptedMethods(b);
    return `<div class="gallery sk">
        <div class="carousel hscroll">${photos.map((p, k) => `<img class="fade" src="${p}" alt="${esc(vFull(v))}${isRender(v) ? ", sample render" : ""} ${k + 1}" ${k ? 'loading="lazy"' : ""} decoding="async" draggable="false">`).join("")}</div>
        <div class="vtags">${isRender(v) ? `<span class="tag sample">Sample render</span>` : v.sample ? `<span class="tag sample">Sample</span>` : ""}</div>${heartBtn(v.id)}<span class="counter">1 / ${photos.length}</span>
      </div>
      <div class="inner">
        ${!live ? `<div class="banner warn" style="margin-top:14px">${icon("alert")}<span>This listing isn’t bookable right now (${v.paused ? "paused by the host" : v.suspended ? "suspended by the marketplace" : v.approval !== "approved" ? "awaiting approval" : "host not approved"}).</span></div>` : ""}
        <header class="d-head"><h1 class="d-title">${esc(vName(v))} <span>${v.year}</span></h1>
          ${v.title && v.title !== vName(v) ? `<p class="d-tag">${esc(v.title)}</p>` : ""}
          <div class="d-loc">${icon("pin")}<span>${esc(locatedIn(v))}${dist != null ? ` · ${fmtKm(dist)} away` : ""}</span></div>
          <div class="d-sub">${ratingHTML(r)}<span>${TYPE[v.type].name}</span><span>${v.seats} seats</span>${v.instantBook ? `<span class="pill t-outline">${icon("bolt")}Instant book</span>` : `<span class="pill t-outline">${icon("clock")}Host approval</span>`}${smp(v.sample)}</div></header>
        <button type="button" class="host-row press" data-act="openBiz" data-id="${b.id}">${bizLogo(b)}<div><b>${esc(b.name)} ${verified(b)} ${smp(b.sample)}</b><small>${b.verified ? "Verified host" : "Verification pending"} · ${esc(b.town || b.parish)} · ${br.count ? `${br.avg.toFixed(1)} rating (${br.count})` : "No reviews yet"}</small></div>${chev()}</button>
        <div class="avail-banner ${av.ok ? "ok" : "no"}">${icon(av.ok ? "checkCircle" : "ban")}<div><b>${av.ok ? "Available for your dates" : esc(av.label)}</b><small>${fmtRange(L.start, L.end)}</small></div><button type="button" class="btn sm plain press" data-act="dates">Change</button></div>
        ${!av.ok ? (() => { const nx = nextFree(v, L.start, L.end); return nx ? `<p class="note" style="margin-top:8px">${icon("info")}<span>Next free: ${fmtRange(nx.start, nx.end)}. <button type="button" class="link" data-act="useNext" data-s="${nx.start}" data-e="${nx.end}" style="padding:0">Use these dates</button></span></p>` : ""; })() : ""}
        ${v.description ? `<p style="margin-top:18px;font-size:15.5px;line-height:1.6">${esc(v.description)}</p>` : ""}
        <h2 class="sec-title">Details</h2>
        <div class="spec-grid">${specs.map(([ic, k, val]) => `<div class="spec">${icon(ic)}<div><small>${k}</small><b>${esc(String(val))}</b></div></div>`).join("")}</div>
        ${v.features.length ? `<h2 class="sec-title">Features</h2><div class="feat-list">${v.features.filter(f => FEAT[f]).map(f => `<span class="feat">${icon(FEAT[f].icon)}${FEAT[f].name}</span>`).join("")}${v.chauffeur && !hasFeat(v, "driver") ? `<span class="feat">${icon("steer")}Chauffeur available</span>` : ""}</div>` : ""}
        <h2 class="sec-title">Pick-up options</h2>
        <div class="group">${pickupOptions(v).map(o => row({ label: esc(o.label), sub: esc(o.sub), value: o.fee ? money(o.fee) : "Free" })).join("")}</div>
        <h2 class="sec-title">Payment options</h2>
        <div class="pay-methods">${methods.map(m => `<span class="pay-chip">${icon(PAYMENT_METHODS[m].icon)}${PAYMENT_METHODS[m].name}</span>`).join("")}</div>
        <p class="group-foot">You choose how to pay at checkout.${methods.includes("app") ? " In-app card payment is a demo screen in this preview." : ""}</p>
        <h2 class="sec-title">Price for your dates</h2>
        ${breakdownHTML(q)}
        <h2 class="sec-title">Insurance options</h2>
        <div class="group">${INSURANCE.map(i => { const ppd = insPerDay(v, i.id); return `<div class="row ins-row"><span class="lbl"><b>${i.name}</b><small>${i.desc} Excess: ${money(Math.round(v.deposit * i.excessPct / 100))}.</small></span><span class="price-tag">${ppd ? `${money(ppd)}/day` : "Included"}</span></div>`; }).join("")}</div>
        <h2 class="sec-title">Policies</h2>
        <div class="policy">${icon("lock")}<div><b>${money(v.deposit)} refundable deposit</b><p>Released 3–5 business days after return. ${esc(b.damagePolicy)}</p></div></div>
        <div class="policy">${icon("fuel")}<div><b>Fuel: ${fuel.name}</b><p>${fuel.desc}</p></div></div>
        <div class="policy">${icon("road")}<div><b>Mileage: ${v.mileage.limit ? `${v.mileage.limit} km per day` : "Unlimited"}</b><p>${v.mileage.limit ? `Extra kilometres cost ${moneyJ(v.mileage.extraPerKm)} each.` : "Drive as far as you like."} Late returns over 59 minutes are charged by the hour.</p></div></div>
        <div class="policy">${icon("cal")}<div><b>Cancellation: ${pol.name}</b><p>${pol.desc}</p></div></div>
        <h2 class="sec-title">House rules</h2>
        <ul class="bullets">${rules.map(x => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}<li>${icon("check")}<span>Driver must be ${v.minAge} or older with a valid licence</span></li></ul>
        <h2 class="sec-title">Availability</h2>
        <div class="card">${availMonths(v, 2)}${calLegend()}</div>
        <h2 class="sec-title">Reviews</h2>
        ${reviews.length ? `<div class="rev-sum"><span class="big">${r.avg.toFixed(1)}</span><div>${stars(r.avg)}<div class="muted" style="font-size:13px">${plural(r.count, "review")} · only from completed trips</div></div></div>${reviews.slice(0, 4).map(reviewHTML).join("")}${reviews.length > 4 ? `<button type="button" class="btn block plain press" style="margin-top:12px" data-act="allReviews">Show all ${reviews.length} reviews</button>` : ""}`
          : `<div class="group pad"><p>No reviews yet. Reviews can only be left after a completed trip.</p></div>`}
        <button type="button" class="link report-link" data-act="report" data-vehicle="${v.id}">${icon("flag")}Report this listing</button>
      </div>`;
  },
  fixed(ctx) {
    const v = getV(ctx.params.id); if (!v) return "";
    const L = ctx.local; const q = quote(v, L.start, L.end, {}); const av = checkAvail(v, L.start, L.end);
    const can = isLive(v) && Nav.role === "customer";
    const label = Nav.role !== "customer" ? "Renter preview" : !isLive(v) ? "Not bookable" : !av.ok ? "Pick other dates" : v.instantBook ? "Reserve" : "Request to book";
    return `<div class="buybar glass"><div class="bb-price"><b>${money(q.total)}</b><span>Total · ${plural(q.days, "day")} incl. fees</span><small>${money(v.rates.daily)} / day · ${money(q.total, { cur: otherCur() })}</small></div>
      <button type="button" class="btn press" data-act="${can ? (av.ok ? "reserve" : "dates") : "noop"}" ${can ? "" : "disabled"}>${label}</button></div>`;
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
    <div class="bl dep"><span>${icon("lock")}Refundable deposit</span><b>${money(q.deposit)}</b></div>
    <p class="bl-note">Sample prices. ${S.settings.currency === "USD" ? `Converted from J$ at J$${fx} = US$1.` : `About ${money(q.total, { cur: "USD" })} at J$${fx} = US$1.`}</p>
  </div>`;
}

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
    const ms = Date.UTC(y, m, d); const k = dayKey(ms); let st = states[k] || ""; if (!st && (v.maintenance || v.paused) && ms >= T0) st = v.maintenance ? "maint" : "blocked";
    const cls = `d ${st} ${k === tk ? "today" : ""} ${ms < T0 ? "past" : ""}`;
    const lbl = `${d} ${MONL[m]}${st ? ", " + ({ booked: "booked", requested: "requested", blocked: "blocked", maint: "maintenance" }[st]) : ", free"}`;
    cells += o.interactive ? `<button type="button" class="${cls}" data-act="day" data-k="${k}" aria-label="${lbl}">${d}</button>` : `<span class="${cls}" title="${lbl}">${d}</span>`;
  }
  return `<div class="cal ${o.mini ? "mini" : ""}">${cells}</div>`;
}
function availMonths(v, n) { const d = new Date(jmNow()); const states = dayStates(v); let html = ""; for (let i = 0; i < n; i++) { const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)); html += `<div><div class="month-name">${MONL[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</div>${monthGrid(v, dt.getUTCFullYear(), dt.getUTCMonth(), { states, mini: true })}</div>`; } return `<div class="months">${html}</div>`; }
function calLegend(host) { return `<div class="legend"><span><i class="lg-free"></i>Free</span><span><i class="lg-booked"></i>Booked</span><span><i class="lg-req"></i>Requested</span><span><i class="lg-block"></i>Blocked${host ? " by you" : ""}</span><span><i class="lg-maint"></i>Maintenance</span></div>`; }

function openBizSheet(id) {
  const b = getB(id); if (!b) return; const r = bRating(b.id); const vs = S.vehicles.filter(v => v.businessId === b.id && isLive(v));
  Sheets.open({ title: b.name, size: "large",
    render: () => `<div style="display:flex;gap:14px;align-items:center;margin:4px 0 16px">${bizLogo(b, "lg")}<div><h3 style="font-size:20px;letter-spacing:-.02em;font-weight:650">${esc(b.name)} ${smp(b.sample)}</h3><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${b.verified ? `<span class="pill t-pos">${icon("shield")}Verified ${b.kind === "individual" ? "host" : "business"}</span>` : `<span class="pill t-warn">${icon("clock")}Verification pending</span>`}<span class="pill t-grey">${r.count ? `${r.avg.toFixed(1)} · ${r.count} reviews` : "No reviews yet"}</span></div></div></div>
      <div class="group icons">
        ${row({ ic: "pin", label: esc(`${b.town ? b.town + ", " : ""}${b.parish}`), sub: esc(b.address || "") })}
        ${row({ ic: "clock", label: "Hours", sub: esc(b.hours) })}
        ${row({ ic: "phone", label: esc(b.phone), sub: "Phone (sample number)", act: "copy", attrs: `data-copy="${esc(b.phone)}"`, chevron: false, value: icon("copy", "sm") })}
        ${row({ ic: "whatsapp", label: esc(b.whatsapp), sub: "WhatsApp (sample number)", act: "copy", attrs: `data-copy="${esc(b.whatsapp)}"`, chevron: false, value: icon("copy", "sm") })}
        ${row({ ic: "chat", label: `Usually replies within ${b.responseMins || 30} min`, sub: `Hosting on ${esc(CONFIG.APP_NAME)} since ${b.since || 2024}` })}
      </div>
      <h3 class="group-title">Payment options</h3>
      <div class="pay-methods">${acceptedMethods(b).map(m => `<span class="pay-chip">${icon(PAYMENT_METHODS[m].icon)}${PAYMENT_METHODS[m].name}</span>`).join("")}</div>
      <h3 class="group-title">Policies</h3>
      <div class="policy">${icon("cal")}<div><b>${POLICIES[b.policy].name} cancellation</b><p>${POLICIES[b.policy].desc}</p></div></div>
      <div class="policy">${icon("fuel")}<div><b>Fuel: ${FUEL_POLICIES[b.fuelPolicy].name}</b><p>${FUEL_POLICIES[b.fuelPolicy].desc}</p></div></div>
      <div class="policy">${icon("lock")}<div><b>Deposit & damage</b><p>${esc(b.damagePolicy)}</p></div></div>
      <h3 class="group-title">${plural(vs.length, "vehicle")}</h3>
      <div class="hscroll mini-cards no-drag" style="margin:0 calc(-1*var(--gr)) 0 calc(-1*var(--gl));padding:0 var(--gr) 6px var(--gl)">${vs.map(v => miniCard(v)).join("")}</div>
      <button type="button" class="link report-link" data-act="report" data-biz="${b.id}">${icon("flag")}Report this host</button>`,
  });
}
function miniCard(v, o = {}) {
  const start = o.start || S.search.start, end = o.end || S.search.end; const av = checkAvail(v, start, end); const q = quote(v, start, end, { pickup: o.pickup });
  return `<div class="mcard"><div class="mphoto sk"><img class="fade" src="${coverURL(v)}" alt="${esc(vFull(v))}" loading="lazy"><div class="vtags">${v.sample ? `<span class="tag sample">Sample</span>` : ""}${availTag(av)}</div></div>
    <div class="mb"><b>${esc(vName(v))} ${v.year}</b><small>${esc(vLoc(v))} · ${v.seats} seats · ${v.transmission === "auto" ? "Auto" : "Manual"}</small>
    <div class="mp"><b>${money(v.rates.daily)}<span class="per">/ day</span></b><small>${money(q.total)} total</small></div>
    <div class="mbtns"><button type="button" class="btn sm plain press" data-act="openVehicle" data-id="${v.id}" data-start="${start}" data-end="${end}">View</button>${o.book && av.ok ? `<button type="button" class="btn sm press" data-act="aiBook" data-id="${v.id}" data-start="${start}" data-end="${end}" data-pickup="${o.pickup || ""}">Book</button>` : ""}</div></div></div>`;
}

const FavsView = {
  id: "favs", large: true, ptr: true, title: () => "Favourites",
  render() {
    const list = (me().favs || []).map(getV).filter(Boolean);
    return `<div class="inner"><h1 class="large-title">Favourites</h1><p class="lede">${list.length ? `${plural(list.length, "saved vehicle")}. Tap the heart to remove one.` : "Vehicles you save show up here."}</p>
      <div class="results stagger" data-skel>${list.length ? list.map((v, i) => vehicleCard(v, { i })).join("") : emptyState("heart", "No favourites yet", "Tap the heart on any vehicle to save it for later.", `<button type="button" class="btn sm plain press" data-act="goTab" data-tab="explore">Explore vehicles</button>`)}</div></div>`;
  },
};

/* ---- account / profile ---- */
function accAvatar(a, cls = "") { return a.avatar ? `<img src="${a.avatar}" alt="">` : esc(initials(a.name || "?")); }
const AccountView = {
  id: "account", large: true, title: () => "Profile",
  render(ctx) {
    const a = me(); const bio = a.biometric; const isRoot = ctx.stack.pages[0] === ctx;
    const vb = (ok, label, pend) => `<span class="vb ${ok ? "ok" : pend ? "pending" : ""}">${icon(ok ? "checkCircle" : pend ? "clock" : "info")}${label}</span>`;
    const idS = a.verified?.id || a.idDoc?.status || "none";
    return `<div class="inner">${isRoot ? `<h1 class="large-title">Profile</h1>` : ""}
      <div class="acc-head">
        <label class="acc-avatar" aria-label="Change profile photo">${accAvatar(a)}<span class="cam">${icon("camera")}</span><input type="file" accept="image/*" data-change="avatar"></label>
        <h2>${esc(a.name)}</h2><p>${esc(a.email)} · ${esc(a.phone)}</p>
        <div class="badges">${vb(a.verified?.email, "Email")}${vb(a.verified?.phone, "Phone")}${vb(idS === "verified", idS === "verified" ? "ID verified" : idS === "submitted" ? "ID in review" : "ID not added", idS === "submitted")}${a.roles?.host ? `<span class="vb">${icon("store")}Host</span>` : ""}${a.demo ? `<span class="vb pending">${icon("info")}Demo account</span>` : ""}</div>
      </div>
      <h3 class="group-title">Personal details</h3>
      <div class="group">
        ${row({ label: "Full name", value: esc(a.name), act: "edit", attrs: 'data-k="name"' })}
        ${row({ label: "Phone", value: esc(a.phone || "Add"), act: "edit", attrs: 'data-k="phone"' })}
        ${row({ label: "Email", value: esc(a.email), act: "edit", attrs: 'data-k="email"' })}
        ${row({ label: "Parish", value: esc(a.parish || "Choose"), act: "parish" })}
      </div>
      <h3 class="group-title">Driver details</h3>
      <div class="group">
        ${row({ label: "Licence number", value: a.licence ? `•••• ${esc(a.licence.slice(-4))}` : "Add", act: "edit", attrs: 'data-k="licence"' })}
        ${row({ label: "Licence expiry", value: a.licenceExpiry ? fmtMonthYear(a.licenceExpiry) : "Add", act: "expiry" })}
        ${row({ label: "Age", value: a.age ? String(a.age) : "Add", act: "edit", attrs: 'data-k="age"' })}
        ${row({ label: "Licence photo (ID check)", value: idS === "verified" ? "Verified" : idS === "submitted" ? "In review" : "Upload", act: "idDoc" })}
      </div>
      <p class="group-foot">Hosts see licence details only for your bookings. ID checks are placeholders in this demo.</p>
      <h3 class="group-title">Account type</h3>
      <div class="group icons">
        ${row({ ic: "key", label: "Renter", sub: a.roles?.renter ? "On · book vehicles from hosts" : "Off", value: a.roles?.renter ? "Active" : "Turn on", act: a.roles?.renter ? "" : "enableRenter", chevron: !a.roles?.renter })}
        ${row({ ic: "store", label: "Host", sub: a.roles?.host ? `${plural((a.businessIds || []).length, "business", "businesses")} · list vehicles and earn` : "List your vehicles and earn", value: a.roles?.host ? "Active" : "Become a host", act: a.roles?.host ? "" : "becomeHost", chevron: !a.roles?.host })}
      </div>
      <h3 class="group-title">Sign-in & security</h3>
      <div class="group icons">
        <label class="row">${icoBox(Bio.icon())}<span class="lbl"><b>${Bio.label()}</b><small>${bio ? (bio.type === "webauthn" ? "On · device biometrics (WebAuthn)" : "On · simulated in this preview") : "Unlock the app with your face or fingerprint"}</small></span>${switchEl("bio_sw", !!bio, 'data-change="bio"', Bio.label())}</label>
        ${row({ ic: "lock", label: "Change password", act: "changePw" })}
        ${row({ ic: "phoneCar", label: "This device", sub: S.session?.remember ? "Remembered · you stay signed in" : "Not remembered · sign in each visit" })}
      </div>
      <p class="group-foot">Demo authentication: accounts and salted SHA-256 password hashes are stored on this device only. A real server with proper password hashing is needed for production.</p>
      ${settingsGroups()}
      <h3 class="group-title">Trust & safety</h3>
      <div class="group icons">
        ${row({ ic: "shield", label: "Verified hosts", sub: "Businesses checked by the marketplace show a shield badge" })}
        ${row({ ic: "star", label: "Honest reviews", sub: "Only customers with a completed trip can review" })}
        ${row({ ic: "flag", label: "Report a problem", act: "report" })}
      </div>
      <div class="group icons" style="margin-top:24px">
        ${row({ ic: "logout", label: "Sign out", act: "signOut", chevron: false })}
        ${row({ ic: "trash", label: "Delete account", act: "deleteAcc", cls: "danger", chevron: false })}
      </div>
      <p class="fineprint">${esc(CONFIG.APP_NAME)} is a demo. All businesses, vehicles, prices, bookings and reviews are SAMPLE data. Payments are simulated and no real card details are stored or sent.</p>
    </div>`;
  },
  inputs: {
    avatar: async (t, ctx) => { const f = t.files[0]; if (!f) return; try { const img = await readImage(f, 320, 0.8); commit(() => { me().avatar = img; }); toast("Profile photo updated"); } catch (e) { toast(e.message, { tone: "warn" }); } },
    bio: async (t, ctx) => { if (t.checked) { const ok = await Bio.enroll(me()); if (!ok) t.checked = false; renderPage(ctx); } else { commit(() => { me().biometric = null; }); toast(`${Bio.label()} turned off`); } },
  },
  actions: {
    edit: async (t) => {
      const k = t.dataset.k; const a = me(); const labels = { name: "Full name", phone: "Phone", email: "Email", licence: "Licence number", age: "Age" };
      const v = await editField({ title: labels[k], label: labels[k], value: a[k] || "", type: k === "age" ? "number" : k === "phone" ? "tel" : k === "email" ? "email" : "text", inputmode: k === "age" ? "numeric" : "" });
      if (v == null) return; let val = v.trim();
      if (k === "phone") { if (!validJmPhone(val)) { toast("Use a Jamaican number: +1 876-XXX-XXXX", { tone: "warn" }); return; } val = formatPhone(val); if (S.accounts.some(x => x.id !== a.id && phoneKey(x.phone) === phoneKey(val))) { toast("Another account uses that phone", { tone: "warn" }); return; } }
      if (k === "email") { if (!validEmail(val)) { toast("Enter a valid email", { tone: "warn" }); return; } val = val.toLowerCase(); if (S.accounts.some(x => x.id !== a.id && x.email === val)) { toast("Another account uses that email", { tone: "warn" }); return; } }
      if (k === "name" && val.length < 2) { toast("Enter your full name", { tone: "warn" }); return; }
      commit(() => { a[k] = k === "age" ? clamp(parseInt(val, 10) || 0, 16, 99) : val; }); toast("Saved");
    },
    parish: async () => { const r = await pickParish(me().parish); if (r) { commit(() => { me().parish = r; }); toast("Saved"); } },
    expiry: async () => { const v = await pickMonthYear({ value: me().licenceExpiry }); if (v) { commit(() => { me().licenceExpiry = v; }); toast("Saved"); } },
    idDoc: () => openIdUpload(),
    enableRenter: () => { commit(() => { me().roles.renter = true; }); toast("Renter mode is on"); },
    becomeHost: () => openBecomeHost(),
    changePw: () => openChangePassword(),
    signOut: async () => { const r = await actionSheet({ title: "Sign out?", message: me().biometric ? `${Bio.label()} stays set up on this device for next time.` : "", actions: [{ label: "Sign out", style: "destructive", value: "yes" }] }); if (r === "yes") Auth.signOut(); },
    deleteAcc: async () => {
      const a = me(); const r = await actionSheet({ title: "Delete your account?", message: `This removes ${esc(a.email)} and its sign-in from this device. Past bookings stay on hosts’ records as “Deleted user”.${a.demo ? " Use Reset demo to restore the demo account." : ""}`, actions: [{ label: "Delete account", style: "destructive", value: "yes" }] });
      if (r === "yes") Auth.deleteAccount();
    },
    ...settingsActions(),
  },
  onSeg(ctx, name, v) { if (name === "cur") { setCurrency(v, ctx); toast(v === "USD" ? `Showing US$ at J$${S.settings.fx} = US$1` : "Showing J$"); } },
};
const ProfileView = AccountView;
function pickParish(current) { return actionSheet({ title: "Parish", actions: PARISHES.map(p => ({ label: p + (p === current ? " ✓" : ""), value: p })) }); }
function openIdUpload() {
  const a = me();
  Sheets.open({ title: "Licence photo", size: "auto",
    render: () => `<p class="note" style="margin-bottom:12px">${icon("idcard")}<span>Upload a clear photo of the front of your driver’s licence. In this demo it’s a placeholder: nothing is checked automatically and the image stays on this device.</span></p>
      <label class="upload-tile"><span class="ut-img">${a.idDoc?.img ? `<img src="${a.idDoc.img}" alt="">` : icon("camera")}</span><div class="ut-txt"><b>${a.idDoc?.img ? "Replace photo" : "Take or choose a photo"}</b><span>JPG or PNG · resized on your device</span></div><input type="file" accept="image/*" capture="environment" data-change="file"></label>`,
    inputs: { file: async (t, s) => { const f = t.files[0]; if (!f) return; try { const img = await readImage(f, 1000, 0.75); commit(() => { a.idDoc = { img, status: "submitted" }; a.verified = a.verified || {}; a.verified.id = a.verified.id === "verified" ? "verified" : "submitted"; }); s.close(); toast("Licence photo submitted for review"); } catch (e) { toast(e.message, { tone: "warn" }); } } } });
}

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
    <div class="group"><div class="row"><span class="lbl"><b>Show prices in</b></span><span style="width:170px">${seg("cur", [{ v: "JMD", label: "J$" }, { v: "USD", label: "US$" }], S.settings.currency, "")}</span></div>
    ${row({ label: "Exchange rate", sub: "Used for every US$ price in the app", value: `J$${S.settings.fx} = US$1`, act: "fx" })}</div>
    <h3 class="group-title">Appearance</h3>
    <div class="group">${row({ ic: "moon", label: "Dark mode", sub: "Follows your device setting automatically" })}</div>
    <h3 class="group-title">Rental assistant</h3>
    ${aiStatusHTML()}
    <h3 class="group-title">Demo data</h3>
    <div class="group icons">
      ${row({ ic: "lock", label: "Saved to", sub: `${esc(Store.label())} · about ${Store.sizeKB()} KB` })}
      ${row({ ic: "download", label: "Export JSON", sub: "Back up or move the demo data", act: "exportData" })}
      ${row({ ic: "upload", label: "Import JSON", sub: "Replace the demo data from a backup", act: "importData" })}
      ${row({ ic: "refresh", label: "Reset demo", sub: "Restore the original SAMPLE data and demo account", act: "resetData", cls: "danger" })}
    </div>`;
}
function settingsActions() {
  return {
    fx: async () => { const v = await editField({ title: "Exchange rate", label: "J$ per US$1", value: String(S.settings.fx), type: "number", inputmode: "decimal", hint: "One editable rate converts every price between J$ and US$. Sample default: J$157." }); if (v != null) { const n = Math.round(parseFloat(v) * 100) / 100; if (!(n > 0 && n < 10000)) { toast("Enter a rate between 1 and 10,000", { tone: "warn" }); return; } commit(st => { st.settings.fx = n; }); toast(`Rate set to J$${n} = US$1`); } },
    exportData: () => openExport(),
    importData: () => openImport(),
    resetData: async () => { const r = await actionSheet({ title: "Reset the demo?", message: "This replaces everything on this device with the original SAMPLE data, including accounts. You’ll return to the welcome screen.", actions: [{ label: "Reset demo data", style: "destructive", value: "yes" }] }); if (r === "yes") { S = seedState(); await ensureDemoPassword(); await Store.flush(); Auth.signOut(true); toast("Demo data reset"); } },
  };
}
let DL = null;
function openExport() {
  const safe = JSON.parse(JSON.stringify(S)); const json = JSON.stringify(safe, null, 2);
  Sheets.open({ title: "Export demo data", size: "large",
    render: () => `<p class="note" style="margin-bottom:10px">${icon("info")}<span>Copy this JSON to back up your demo, or ${DL ? "save it as a file" : "paste it into Import on another device"}. Password hashes are included (never plain passwords). ${(json.length / 1024).toFixed(0)} KB.</span></p><textarea class="code no-drag" id="exportJson" readonly aria-label="Demo data JSON">${esc(json)}</textarea>`,
    footer: () => `<div class="btn-row"><button type="button" class="btn plain press" data-act="copyJson">${icon("copy")}Copy</button>${DL ? `<button type="button" class="btn press" data-act="saveJson">${icon("download")}Save file</button>` : ""}</div>`,
    actions: {
      copyJson: (t, s) => { s.body.querySelector("textarea").select(); copyText(json, "JSON copied"); },
      saveJson: async () => { try { await DL.save({ filename: "rentyaad-demo.json", data: json }); toast("Saved"); } catch (e) { if (e?.code !== "declined") toast("Couldn’t save the file here. Use Copy instead.", { tone: "warn" }); } },
    } });
}
function openImport() {
  const L = { text: "" };
  Sheets.open({ title: "Import demo data", size: "large",
    render: () => `<p class="note" style="margin-bottom:10px">${icon("info")}<span>Paste JSON exported from ${esc(CONFIG.APP_NAME)}, or choose a .json file. This replaces the current demo data and signs you out.</span></p>
      <textarea class="code no-drag" id="importJson" placeholder="{ … }" data-input="txt" aria-label="Paste demo data JSON" style="min-height:220px"></textarea>
      <label class="btn block plain press file-btn" style="margin-top:12px">${icon("upload")}Choose a .json file<input type="file" accept="application/json,.json" data-change="file"></label>`,
    inputs: {
      txt: t => { L.text = t.value; },
      file: (t, s) => { const f = t.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { L.text = String(fr.result); s.body.querySelector("textarea").value = L.text; toast("File loaded"); }; fr.readAsText(f); },
    },
    footer: () => `<button type="button" class="btn block press" data-act="doImport">Import</button>`,
    actions: { doImport: async (t, s) => {
      let data; try { data = JSON.parse(L.text); } catch (e) { toast("That isn’t valid JSON", { tone: "warn" }); return; }
      if (!data || !Array.isArray(data.vehicles) || !Array.isArray(data.businesses) || !Array.isArray(data.bookings) || !data.settings) { toast("JSON is missing vehicles, businesses or bookings", { tone: "warn" }); return; }
      const r = await actionSheet({ title: "Replace demo data?", message: `Import ${data.vehicles.length} vehicles, ${data.businesses.length} businesses and ${data.bookings.length} bookings.`, actions: [{ label: "Replace data", style: "destructive", value: "yes" }] });
      if (r !== "yes") return;
      const migrated = migrateState(data); if (!migrated) { toast("This file is from an unsupported version", { tone: "warn" }); return; }
      S = normalizeState(migrated); await ensureDemoPassword(); await Store.flush(); s.close(); Auth.signOut(true); toast("Demo data imported");
    } } });
}

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
      commit(st => { st.reports.unshift({ id: uid("rp_"), kind: bk ? "dispute" : "report", category: L.cat, title: L.cat + (v ? ` · ${vName(v)}` : b ? ` · ${b.name}` : ""), text: L.text.trim(), by, reporter: by === "business" ? (getB(S.hostBizId)?.name || "Host") : me().name, bookingId: bk?.id || null, vehicleId: v?.id || null, businessId: b?.id || null, status: "open", at: jmNow(), sample: false }); });
      s.close(); toast("Report sent to the trust & safety team");
    } },
    footer: () => `<button type="button" class="btn block press" data-act="send">Send report</button>`,
  });
}
