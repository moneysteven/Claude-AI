/* ============ admin (marketplace owner) ============ */
function approvalPill(b) {
  const a = { approved: ["t-green", "check", "Approved"], pending: ["t-orange", "clock", "Pending approval"], rejected: ["t-red", "x", "Rejected"], suspended: ["t-red", "ban", "Suspended"] }[b.approval] || ["t-grey", "info", b.approval];
  return `<span class="pill ${a[0]}">${icon(a[1])}${a[2]}</span>${b.approval === "approved" ? (b.verified ? `<span class="pill t-blue">${icon("shield")}Verified</span>` : `<span class="pill t-gold">${icon("clock")}Unverified</span>`) : ""}`;
}
const OverviewView = {
  id: "overview", large: true, ptr: true, title: () => "Overview",
  render() {
    const a = adminStats(); const c = S.settings.commission;
    return `<div class="inner"><h1 class="large-title">Overview</h1><p class="lede">Marketplace totals across all hosts (sample data).</p>
      <div class="kpis stagger go">
        ${kpi("Total bookings", "inbox", a.total, "num", `${a.active} confirmed, active or completed`)}
        ${kpi("Gross booking value", "dollar", a.gbv, "money", "Customer totals, excl. deposits")}
        ${kpi("Commission earned", "percent", a.earned, "money", `+ ${money(a.pending)} on upcoming trips`)}
        ${kpi("Service fees", "receipt", a.fees, "money", `${moneyJ(CONFIG.SERVICE_FEE)} per booking`)}
      </div>
      <h2 class="sec-title">Commission</h2>
      <div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div style="font-size:34px;font-weight:700;letter-spacing:-.03em" class="tnum" id="commVal">${c}%</div><div class="muted" style="font-size:13px">of each booking’s rental, extras and cover</div></div>${stepper("commission", c, 0, 30, 0.5, "pct")}</div>
        <p class="chart-tip">Default is ${CONFIG.COMMISSION_DEFAULT}%. Changes apply to new bookings; existing bookings keep the rate they were booked at.</p></div>
      <h2 class="sec-title">Gross booking value · 8 weeks</h2>
      <div class="card">${barChart(a.weeks, { label: "Gross booking value per week", hint: "By pick-up week. Tap a bar." })}</div>
      <h2 class="sec-title">Queues</h2>
      <div class="group icons">
        ${row({ ic: "store", color: "#FF9500", label: "Businesses awaiting approval", value: String(a.pendingBiz), act: "goTab", attrs: 'data-tab="abiz"' })}
        ${row({ ic: "shield", color: "#007AFF", label: "Approved but unverified", value: String(a.unverified), act: "goTab", attrs: 'data-tab="abiz"' })}
        ${row({ ic: "list", color: "#5856D6", label: "Listings awaiting approval", value: String(a.pendingListings), act: "goTab", attrs: 'data-tab="alistings"' })}
        ${row({ ic: "flag", color: "#FF3B30", label: "Open disputes & reports", value: String(a.openReports), act: "goTab", attrs: 'data-tab="disputes"' })}
      </div>
      <h2 class="sec-title">Hosts by booking value</h2>
      <div class="group">${a.byBiz.map((x, i) => `<button type="button" class="row tap" data-act="openAdminBiz" data-id="${x.b.id}"><span class="rank ${i === 0 ? "r1" : ""}">${i + 1}</span><span class="lbl"><b>${esc(x.b.name)} ${verified(x.b)}</b><small>${plural(x.n, "booking")} · commission ${money(sum(bizBookings(x.b.id).filter(b => COUNTED.has(b.status)), b => b.commission))}</small></span><span class="val strong">${money(x.gbv)}</span>${chev()}</button>`).join("")}</div>
      <p class="fineprint">${a.live} live listings · ${a.cancelled} cancelled bookings · all figures are SAMPLE data.</p>
    </div>`;
  },
  onStep(ctx, name, v) { commit(st => { st.settings.commission = v; }, { skip: ctx }); const el = ctx.content.querySelector("#commVal"); if (el) el.textContent = `${v}%`; },
  actions: { tip: chartTip, openAdminBiz: t => Nav.push(AdminBizDetail, { id: t.dataset.id }) },
};

const AdminBizView = {
  id: "abiz", large: true, ptr: true, title: () => "Businesses",
  init(ctx) { ctx.local.tab = S.businesses.some(b => b.approval === "pending") ? "pending" : "all"; },
  render(ctx) {
    const f = { all: () => true, pending: b => b.approval === "pending" || (b.approval === "approved" && !b.verified), verified: b => b.verified && b.approval === "approved", suspended: b => b.approval === "suspended" || b.approval === "rejected" }[ctx.local.tab];
    const list = S.businesses.filter(f);
    return `<div class="inner"><h1 class="large-title">Businesses</h1>
      ${seg("tab", [{ v: "pending", label: "To review" }, { v: "verified", label: "Verified" }, { v: "suspended", label: "Suspended" }, { v: "all", label: "All" }], ctx.local.tab, "block")}
      <div class="group stagger go" data-skel style="margin-top:14px">${list.map((b, i) => { const n = S.vehicles.filter(v => v.businessId === b.id).length; return `<button type="button" class="row tap" style="--i:${i}" data-act="openAdminBiz" data-id="${b.id}">${bizLogo(b, "sm")}<span class="lbl"><b>${esc(b.name)} ${smp(b.sample)}</b><small>${esc(b.parish || "")} · ${plural(n, "vehicle")}</small><span style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${approvalPill(b)}</span></span>${chev()}</button>`; }).join("") || `<div class="row"><span class="lbl"><b>Nothing here</b><small>No businesses match this filter.</small></span></div>`}</div></div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; renderPage(ctx); },
  actions: { openAdminBiz: t => Nav.push(AdminBizDetail, { id: t.dataset.id }) },
};
const AdminBizDetail = {
  id: "abizd", title: ctx => getB(ctx.params.id)?.name || "Business",
  render(ctx) {
    const b = getB(ctx.params.id); if (!b) return ""; const vs = S.vehicles.filter(v => v.businessId === b.id); const bks = bizBookings(b.id).filter(x => COUNTED.has(x.status)); const r = bRating(b.id);
    return `<div class="inner" style="padding-top:8px">
      <div class="host-row" style="margin-top:0">${bizLogo(b, "lg")}<div><b>${esc(b.name)} ${smp(b.sample)}</b><small>${esc(b.address)} · ${esc(b.parish)}</small><span style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${approvalPill(b)}</span></div></div>
      <div class="stat-row" style="margin-top:12px">${kpi("Vehicles", "car", vs.length, "num", `${vs.filter(isLive).length} live`)}${kpi("Bookings", "inbox", bks.length, "num", "all time")}${kpi("GBV", "dollar", sum(bks, x => x.quote.total), "money", r.count ? `★ ${r.avg.toFixed(1)}` : "No reviews")}</div>
      <h3 class="group-title">Decisions</h3>
      <div class="group icons">
        ${b.approval !== "approved" ? row({ ic: "check", color: "#34C759", label: "Approve business", sub: "Listings become visible to customers", act: "set", attrs: 'data-k="approval" data-v="approved"' }) : ""}
        ${b.approval === "approved" && !b.verified ? row({ ic: "shield", color: "#007AFF", label: "Verify business", sub: "Documents checked · shows the shield badge", act: "set", attrs: 'data-k="verified" data-v="1"' }) : ""}
        ${b.verified ? row({ ic: "shield", color: "#8E8E93", label: "Remove verification", act: "set", attrs: 'data-k="verified" data-v="0"' }) : ""}
        ${b.approval === "pending" ? row({ ic: "x", color: "#FF3B30", label: "Reject application", act: "set", attrs: 'data-k="approval" data-v="rejected"', cls: "danger" }) : ""}
        ${b.approval === "approved" ? row({ ic: "ban", color: "#FF3B30", label: "Suspend business", sub: "Hides all of its listings", act: "set", attrs: 'data-k="approval" data-v="suspended"', cls: "danger" }) : ""}
        ${b.approval === "suspended" ? row({ ic: "refresh", color: "#34C759", label: "Reinstate business", act: "set", attrs: 'data-k="approval" data-v="approved"' }) : ""}
      </div>
      <h3 class="group-title">Contact (sample)</h3>
      <div class="group">${row({ label: "Phone", value: esc(b.phone) })}${row({ label: "WhatsApp", value: esc(b.whatsapp) })}${row({ label: "Hours", sub: esc(b.hours) })}${row({ label: "Policy", value: POLICIES[b.policy].name })}</div>
      <h3 class="group-title">Documents</h3>
      <div class="group">${row({ ic: "receipt", color: "#8E8E93", label: "Business registration & TRN", sub: "Placeholder in this demo — no documents are stored" })}${row({ ic: "car", color: "#8E8E93", label: "Fleet insurance certificate", sub: "Placeholder in this demo" })}</div>
      <h3 class="group-title">Listings</h3>
      <div class="group">${vs.map(v => listingRow(v)).join("") || `<div class="row"><span class="lbl"><b>No vehicles yet</b></span></div>`}</div>
    </div>`;
  },
  actions: {
    set: async (t, ctx) => {
      const k = t.dataset.k; let v = t.dataset.v; if (k === "verified") v = v === "1";
      const b = getB(ctx.params.id);
      if (v === "suspended" || v === "rejected") { const r = await actionSheet({ title: `${v === "suspended" ? "Suspend" : "Reject"} ${b.name}?`, message: v === "suspended" ? "All of its listings disappear from search. Existing bookings stay." : "The business can’t list vehicles.", actions: [{ label: v === "suspended" ? "Suspend" : "Reject", style: "destructive", value: "yes" }] }); if (r !== "yes") return; }
      commit(st => { getB(b.id)[k] = v; if (k === "approval" && v === "approved" && b.approval === "pending") { /* approving also leaves verification pending */ } });
      haptic(10); toast({ approved: "Business approved", rejected: "Application rejected", suspended: "Business suspended", true: "Business verified", false: "Verification removed" }[String(v)] || "Updated");
    },
    openListing: t => openListingSheet(t.dataset.id),
  },
};

function listingRow(v) {
  const b = getB(v.businessId);
  return `<button type="button" class="row tap" data-act="openListing" data-id="${v.id}"><span class="thumb-wrap sk"><img class="thumb fade" src="${coverURL(v)}" alt="" loading="lazy"></span><span class="lbl"><b>${esc(vName(v))} ${v.year}</b><small>${esc(b?.name || "")} · ${money(v.rates.daily)}/day</small><span style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${vStatusChips(v)}</span></span>${chev()}</button>`;
}
const ListingsView = {
  id: "alistings", large: true, ptr: true, title: () => "Listings",
  init(ctx) { ctx.local.tab = S.vehicles.some(v => v.approval === "pending") ? "pending" : "live"; },
  render(ctx) {
    const f = { pending: v => v.approval === "pending", live: v => isLive(v), suspended: v => v.suspended, rejected: v => v.approval === "rejected" || (v.approval === "approved" && !v.suspended && !bizLive(getB(v.businessId))) }[ctx.local.tab];
    const list = S.vehicles.filter(f);
    return `<div class="inner"><h1 class="large-title">Listings</h1>
      ${seg("tab", [{ v: "pending", label: `Pending<span class="n">${S.vehicles.filter(v => v.approval === "pending").length}</span>` }, { v: "live", label: "Live" }, { v: "suspended", label: "Suspended" }, { v: "rejected", label: "Hidden" }], ctx.local.tab, "block")}
      <div class="group stagger go" data-skel style="margin-top:14px">${list.map(listingRow).join("") || `<div class="row"><span class="lbl"><b>Nothing here</b><small>No listings match this filter.</small></span></div>`}</div>
      <p class="group-foot">“Hidden” covers rejected listings and listings whose host isn’t approved.</p></div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; renderPage(ctx); },
  actions: { openListing: t => openListingSheet(t.dataset.id) },
};
function openListingSheet(id) {
  const v = getV(id); if (!v) return; const b = getB(v.businessId);
  const reports = S.reports.filter(r => r.vehicleId === id);
  Sheets.open({ title: vName(v), size: "large",
    render: () => { const vv = getV(id); return `${vehicleCard(vv, {})}
      <h3 class="group-title">Status</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${vStatusChips(vv)}</div>
      <h3 class="group-title">Host</h3><div class="group">${row({ label: esc(b.name), sub: `${b.verified ? "Verified" : "Unverified"} · ${b.approval}` })}</div>
      ${reports.length ? `<h3 class="group-title">Reports</h3><div class="group">${reports.map(r => row({ label: esc(r.title), sub: `${r.status} · ${fmtDate(fromMs(r.at))}` })).join("")}</div>` : ""}
      <h3 class="group-title">Actions</h3>
      <div class="group icons">
        ${vv.approval !== "approved" ? row({ ic: "check", color: "#34C759", label: "Approve listing", act: "lset", attrs: 'data-k="approval" data-v="approved"' }) : ""}
        ${vv.approval === "pending" ? row({ ic: "x", color: "#FF3B30", label: "Reject listing", act: "lset", attrs: 'data-k="approval" data-v="rejected"', cls: "danger" }) : ""}
        ${vv.approval === "approved" && !vv.suspended ? row({ ic: "ban", color: "#FF3B30", label: "Suspend listing", sub: "Hide it from search immediately", act: "lset", attrs: 'data-k="suspended" data-v="1"', cls: "danger" }) : ""}
        ${vv.suspended ? row({ ic: "refresh", color: "#34C759", label: "Unsuspend listing", act: "lset", attrs: 'data-k="suspended" data-v="0"' }) : ""}
      </div>`; },
    actions: { lset: (t, s) => { const k = t.dataset.k; let val = t.dataset.v; if (k === "suspended") val = val === "1"; commit(st => { getV(id)[k] = val; }); s.refresh(); haptic(10); toast({ approved: "Listing approved", rejected: "Listing rejected", true: "Listing suspended", false: "Listing unsuspended" }[String(val)]); } },
  });
}

const DisputesView = {
  id: "disputes", large: true, ptr: true, title: () => "Disputes",
  init(ctx) { ctx.local.tab = "open"; },
  render(ctx) {
    const f = { open: r => r.status === "open", investigating: r => r.status === "investigating", resolved: r => r.status === "resolved" || r.status === "dismissed" }[ctx.local.tab];
    const list = S.reports.filter(f).sort((a, z) => z.at - a.at);
    return `<div class="inner"><h1 class="large-title">Disputes</h1><p class="lede">Disputes and problem reports from customers and hosts.</p>
      ${seg("tab", [{ v: "open", label: `Open<span class="n">${S.reports.filter(r => r.status === "open").length}</span>` }, { v: "investigating", label: "Investigating" }, { v: "resolved", label: "Closed" }], ctx.local.tab, "block")}
      <div class="group stagger go" data-skel style="margin-top:14px">${list.map((r, i) => `<button type="button" class="row tap" style="--i:${i}" data-act="openReportItem" data-id="${r.id}">${icoBox(r.kind === "dispute" ? "dispute" : "flag", r.kind === "dispute" ? "#FF9500" : "#FF3B30")}<span class="lbl"><b>${esc(r.title)} ${r.sample ? smp() : ""}</b><small>${esc(r.category)} · by ${esc(r.reporter)} (${r.by}) · ${fmtWhen(r.at)}</small></span>${chev()}</button>`).join("") || `<div class="row"><span class="lbl"><b>All clear</b><small>Nothing in this queue.</small></span></div>`}</div></div>`;
  },
  onSeg(ctx, name, v) { ctx.local.tab = v; renderPage(ctx); },
  actions: { openReportItem: t => openReportSheet(t.dataset.id) },
};
function openReportSheet(id) {
  Sheets.open({ title: "Case details", size: "large",
    render: () => {
      const r = S.reports.find(x => x.id === id); const v = r.vehicleId ? getV(r.vehicleId) : null; const b = r.businessId ? getB(r.businessId) : null; const bk = r.bookingId ? getBk(r.bookingId) : null;
      return `<div class="policy">${icon(r.kind === "dispute" ? "dispute" : "flag")}<div><b>${esc(r.title)} ${r.sample ? smp() : ""}</b><p>${esc(r.text)}</p></div></div>
        <div class="group" style="margin-top:12px">${row({ label: "Type", value: r.kind === "dispute" ? "Dispute" : "Report" })}${row({ label: "Category", value: esc(r.category) })}${row({ label: "Reported by", value: `${esc(r.reporter)} (${r.by})` })}${row({ label: "When", value: fmtDT(fromMs(r.at)) })}${row({ label: "Status", value: `<span class="pill ${r.status === "open" ? "t-orange" : r.status === "investigating" ? "t-blue" : "t-green"}">${r.status}</span>` })}
          ${b ? row({ label: "Host", value: esc(b.name) }) : ""}${v ? row({ label: "Vehicle", value: `${esc(vName(v))}${v.suspended ? " · suspended" : ""}` }) : ""}${bk ? row({ label: "Booking", value: `${bk.ref} · ${STATUS[bk.status].label}` }) : ""}</div>
        ${r.resolution ? `<p class="group-foot">Resolution: ${esc(r.resolution)}</p>` : ""}
        <h3 class="group-title">Actions</h3>
        <div class="group icons">
          ${r.status === "open" ? row({ ic: "eye", color: "#007AFF", label: "Mark as investigating", act: "rs", attrs: 'data-v="investigating"' }) : ""}
          ${r.status !== "resolved" ? row({ ic: "checkCircle", color: "#34C759", label: "Resolve", act: "rs", attrs: 'data-v="resolved"' }) : ""}
          ${r.status !== "dismissed" && r.status !== "resolved" ? row({ ic: "x", color: "#8E8E93", label: "Dismiss", act: "rs", attrs: 'data-v="dismissed"' }) : ""}
          ${v && !v.suspended ? row({ ic: "ban", color: "#FF3B30", label: "Suspend this listing", sub: "Hides it from search right away", act: "suspend", cls: "danger" }) : ""}
          ${v && v.suspended ? row({ ic: "refresh", color: "#34C759", label: "Unsuspend listing", act: "unsuspend" }) : ""}
          ${r.status !== "open" ? row({ ic: "refresh", color: "#FF9500", label: "Reopen case", act: "rs", attrs: 'data-v="open"' }) : ""}
        </div>`;
    },
    actions: {
      rs: (t, s) => { const val = t.dataset.v; commit(st => { const r = st.reports.find(x => x.id === id); r.status = val; if (val === "resolved") r.resolution = r.resolution || "Resolved by the marketplace team."; if (val === "open") r.resolution = ""; }); s.refresh(); haptic(8); toast(`Case ${val}`); },
      suspend: async (t, s) => { const r = S.reports.find(x => x.id === id); const v = getV(r.vehicleId); const ok = await actionSheet({ title: `Suspend ${vName(v)}?`, message: "Customers won’t see it until it’s unsuspended.", actions: [{ label: "Suspend listing", style: "destructive", value: "yes" }] }); if (ok !== "yes") return; commit(st => { getV(v.id).suspended = true; const rr = st.reports.find(x => x.id === id); rr.resolution = "Listing suspended pending review."; if (rr.status === "open") rr.status = "investigating"; }); s.refresh(); toast("Listing suspended"); },
      unsuspend: (t, s) => { const r = S.reports.find(x => x.id === id); commit(() => { getV(r.vehicleId).suspended = false; }); s.refresh(); toast("Listing unsuspended"); },
    } });
}

const AdminSettingsView = {
  id: "asettings", large: true, title: () => "Settings",
  render() {
    return `<div class="inner"><h1 class="large-title">Settings</h1>
      <h3 class="group-title">Marketplace fees</h3>
      <div class="group"><div class="row"><span class="lbl"><b>Commission</b><small>Taken from each host payout</small></span>${stepper("commission", S.settings.commission, 0, 30, 0.5, "pct")}</div>
        ${row({ label: "Customer service fee", value: moneyJ(CONFIG.SERVICE_FEE) })}${row({ label: "GCT on customer totals", value: `${CONFIG.GCT_RATE * 100}%` })}</div>
      <p class="group-foot">Changing the commission affects new bookings only.</p>
      ${settingsGroups()}
      <p class="fineprint">${esc(CONFIG.APP_NAME)} demo · rename the app in CONFIG.APP_NAME · all data is SAMPLE.</p></div>`;
  },
  onStep(ctx, name, v) { commit(st => { st.settings.commission = v; }, { skip: ctx }); toast(`Commission set to ${v}%`); },
  onSeg(ctx, name, v) { if (name === "cur") setCurrency(v, ctx); },
  actions: { ...settingsActions() },
};
