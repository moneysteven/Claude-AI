/* ============ UI kit: navigation stack, sheets, pickers, toasts ============ */
function roleTabs(role) {
  if (role === "business") return [
    { id: "dash", label: "Today", icon: "gauge", view: DashboardView },
    { id: "hbookings", label: "Bookings", icon: "inbox", view: HostBookingsView },
    { id: "fleet", label: "Listings", icon: "car", view: FleetView },
    { id: "hmessages", label: "Messages", icon: "chat", view: MessagesView },
    { id: "bizprofile", label: "Business", icon: "store", view: BizProfileView },
  ];
  if (role === "admin") return [
    { id: "overview", label: "Overview", icon: "chart", view: OverviewView },
    { id: "abiz", label: "Businesses", icon: "store", view: AdminBizView },
    { id: "alistings", label: "Listings", icon: "list", view: ListingsView },
    { id: "disputes", label: "Disputes", icon: "flag", view: DisputesView },
    { id: "asettings", label: "Settings", icon: "settings", view: AdminSettingsView },
  ];
  return [
    { id: "explore", label: "Explore", icon: "compass", view: ExploreView },
    { id: "trips", label: "Trips", icon: "suitcase", view: TripsView },
    { id: "messages", label: "Messages", icon: "chat", view: MessagesView },
    { id: "favs", label: "Favourites", icon: "heart", view: FavsView },
    { id: "profile", label: "Profile", icon: "user", view: ProfileView },
  ];
}
function viewTitle(ctx) { const t = ctx.view.title; return typeof t === "function" ? t(ctx) : (t || ""); }

const Nav = {
  role: "customer", tab: null, stacks: {}, busy: false, _sc: null,
  init() {
    this.stage = $("#stage"); this.topbar = $("#topbar"); this.tabbar = $("#tabbar"); this.layers = $("#layers");
    this.navTitle = $("#navTitle"); this.navRight = $("#navRight"); this.navBack = $("#navBack"); this.navBackLabel = $("#navBackLabel");
    this.roleSeg = $("#roleSeg");
    this.navBack.addEventListener("click", () => this.pop());
    this.navRight.addEventListener("click", e => { const top = this.top(); if (top) handleAct(e, top, this.navRight); });
    this.tabbar.addEventListener("click", e => { const t = e.target.closest("[data-tab]"); if (t) this.switchTab(t.dataset.tab); });
    this.roleSeg.addEventListener("click", e => { const b = e.target.closest("[data-role]"); if (b && b.dataset.role !== this.role) requestRole(b.dataset.role); });
    setupSwipeBack();
  },
  top() { const st = this.stacks[this.tab]; return st ? st.pages[st.pages.length - 1] : null; },
  reset() { Sheets.closeAll(); for (const k in this.stacks) this.stacks[k].el.remove(); this.stacks = {}; this.tab = null; this.busy = false; if (this.tabbar) this.tabbar.innerHTML = ""; },
  setRole(role, o = {}) {
    this.role = role; if (S.role !== role) { S.role = role; Store.save(); } if (me().id !== "guest") me().lastRole = role;
    Sheets.closeAll();
    for (const k in this.stacks) this.stacks[k].el.remove();
    this.stacks = {}; this.tab = null; this.busy = false;
    const btn = $(`[data-role="${role}"]`, this.roleSeg); if (btn) segSelect(btn);
    const tabs = roleTabs(role);
    this.tabbar.innerHTML = tabs.map((t, i) => `<button class="tab" type="button" data-tab="${t.id}" style="--i:${i}" aria-label="${t.label}">${icon(t.icon)}<span>${t.label}</span><b class="badge" hidden></b></button>`).join("");
    this.switchTab(tabs[0].id, { initial: true });
    if (o.animate !== false && !reduced()) this.stage.animate([{ opacity: 0, transform: "scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 340, easing: EASE });
  },
  createStack(id) {
    const tab = roleTabs(this.role).find(t => t.id === id);
    const el = document.createElement("section"); el.className = "tabstack"; el.dataset.tab = id; this.stage.appendChild(el);
    const st = { id, el, pages: [] }; this.stacks[id] = st;
    const ctx = createPage(tab.view, {}, st); st.pages.push(ctx); el.appendChild(ctx.el);
    renderPage(ctx, { animate: true, keepScroll: false });
    return st;
  },
  switchTab(id, o = {}) {
    if (this.busy) return;
    if (id === this.tab) {
      const st = this.stacks[id];
      if (st.pages.length > 1) this.popToRoot(); else st.pages[0].scroller.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
      return;
    }
    const prev = this.stacks[this.tab]; this.tab = id;
    let st = this.stacks[id]; const fresh = !st;
    if (prev) prev.el.hidden = true;
    if (!st) st = this.createStack(id);
    st.el.hidden = false;
    const top = st.pages[st.pages.length - 1];
    if (!fresh && top.dirty) renderPage(top);
    if (!o.initial && !reduced()) st.el.animate([{ opacity: 0, transform: "translate3d(0,8px,0)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: EASE });
    this.updateNav(top); this.updateTabbar();
  },
  updateTabbar() { for (const t of $$(".tab", this.tabbar)) { const on = t.dataset.tab === this.tab; t.classList.toggle("on", on); t.setAttribute("aria-current", on ? "page" : "false"); } this.updateBadges(); },
  updateBadges() {
    if (!this.tabbar) return;
    const counts = badgeCounts(this.role);
    for (const t of $$(".tab", this.tabbar)) {
      const b = t.querySelector(".badge"); const n = counts[t.dataset.tab] || 0;
      if (n) { const txt = n > 99 ? "99+" : String(n); if (b.hidden || b.textContent !== txt) { b.hidden = false; b.textContent = txt; if (!reduced()) b.animate([{ transform: "scale(.3)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" }); } }
      else { b.hidden = true; b.textContent = ""; }
    }
  },
  updateNav(ctx, dir = 0) {
    const st = this.stacks[this.tab]; const depth = st.pages.length;
    this.navTitle.textContent = viewTitle(ctx);
    this.navBack.hidden = depth < 2;
    if (depth > 1) { const pt = viewTitle(st.pages[depth - 2]); this.navBackLabel.textContent = pt && pt.length <= 12 ? pt : "Back"; }
    this.navRight.innerHTML = ctx.view.navRight ? ctx.view.navRight(ctx) : "";
    this.tabbar.classList.toggle("hide", !!ctx.view.hideTabs);
    this.onScroll(ctx, true);
    if (dir && !reduced()) {
      const x = dir > 0 ? 16 : -16;
      for (const el of [this.navTitle, this.navRight, this.navBack]) el.animate([{ opacity: 0, transform: `translate3d(${x}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 320, easing: EASE });
    }
  },
  onScroll(ctx, force) {
    if (ctx !== this.top()) return;
    const y = ctx.scroller.scrollTop; const sc = y > 2;
    if (force || sc !== this._sc) { this._sc = sc; this.topbar.classList.toggle("scrolled", sc); }
    if (ctx.view.large) {
      const p = clamp((y - 24) / 20, 0, 1);
      if (force || p !== this._p) { this._p = p; this.navTitle.style.opacity = p; }
      const lt = ctx.largeTitle; if (lt) lt.style.transform = y < 0 ? `scale(${1 + Math.min(-y, 120) / 520})` : "";
    } else if (force || this._p !== 1) { this._p = 1; this.navTitle.style.opacity = 1; }
    ctx.view.onScroll?.(ctx, y);
  },
  async push(view, params = {}) {
    if (this.busy) return null;
    const st = this.stacks[this.tab]; const prev = st.pages[st.pages.length - 1];
    const ctx = createPage(view, params, st); st.pages.push(ctx); st.el.appendChild(ctx.el);
    renderPage(ctx, { animate: true, keepScroll: false });
    this.updateNav(ctx, 1);
    if (reduced()) { prev.el.hidden = true; return ctx; }
    this.busy = true; const W = this.stage.clientWidth;
    ctx.el.classList.add("edge-shadow");
    const a = ctx.el.animate([{ transform: `translate3d(${W}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 440, easing: EASE });
    const b = prev.el.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-W * 0.28}px,0,0)` }], { duration: 440, easing: EASE, fill: "forwards" });
    const c = prev.dim.animate([{ opacity: 0 }, { opacity: 0.1 }], { duration: 440, easing: EASE, fill: "forwards" });
    await a.finished.catch(() => {});
    b.cancel(); c.cancel(); prev.el.hidden = true; ctx.el.classList.remove("edge-shadow"); this.busy = false;
    return ctx;
  },
  async pop(o = {}) {
    const st = this.stacks[this.tab]; if (this.busy || !st || st.pages.length < 2) return;
    this.busy = true; const top = st.pages.pop(); const prev = st.pages[st.pages.length - 1];
    prev.el.hidden = false; if (prev.dirty) renderPage(prev);
    this.updateNav(prev, -1);
    if (!reduced()) {
      const W = this.stage.clientWidth; const from = o.fromX || 0; const dur = o.duration || 400; const easing = o.easing || EASE; const f = 1 - from / W;
      top.el.classList.add("edge-shadow");
      const a = top.el.animate([{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${W}px,0,0)` }], { duration: dur, easing, fill: "forwards" });
      prev.el.animate([{ transform: `translate3d(${-W * 0.28 * f}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: dur, easing });
      prev.dim.animate([{ opacity: 0.1 * f }, { opacity: 0 }], { duration: dur, easing });
      await a.finished.catch(() => {});
    }
    top.view.destroy?.(top); top.el.remove(); this.busy = false;
  },
  async popToRoot() { const st = this.stacks[this.tab]; while (st.pages.length > 2) { const p = st.pages.splice(1, 1)[0]; p.view.destroy?.(p); p.el.remove(); } await this.pop(); },
  async goTo(tabId, view, params) {
    if (this.tab !== tabId) this.switchTab(tabId);
    const st = this.stacks[this.tab]; while (st.pages.length > 1) { const p = st.pages.pop(); p.view.destroy?.(p); p.el.remove(); }
    st.pages[0].el.hidden = false; st.pages[0].el.style.transform = ""; if (st.pages[0].dirty) renderPage(st.pages[0]);
    this.updateNav(st.pages[0]);
    if (view) { await wait(30); await this.push(view, params); }
  },
  invalidate(o = {}) {
    for (const k in this.stacks) for (const p of this.stacks[k].pages) p.dirty = true;
    const top = this.top(); if (top && top !== o.skip) renderPage(top);
    for (const s of Sheets.stack) s.opts.onInvalidate?.(s);
    this.updateBadges();
  },
};

function badgeCounts(role) {
  if (role === "business") {
    const bks = bizBookings(S.hostBizId) || [];
    return { hbookings: bks.filter(b => b.status === "requested").length, hmessages: sum(bks, b => unreadFor(b.id, "business")) };
  }
  if (role === "admin") {
    const a = adminStats();
    return { abiz: a.pendingBiz, alistings: a.pendingListings, disputes: S.reports.filter(r => r.status === "open").length };
  }
  return { messages: sum(custBookings(), b => unreadFor(b.id, "customer")), trips: custBookings().filter(b => b.status === "active").length };
}

/* ---- pages ---- */
function createPage(view, params, st) {
  const el = document.createElement("div");
  el.className = "page" + (view.pageClass ? " " + view.pageClass : "") + (view.hideTabs ? " no-tabs" : "");
  el.innerHTML = `<div class="scroller"><div class="content"></div></div><div class="ptr" aria-hidden="true"><span class="ptr-ico">${icon("refresh")}</span></div><div class="page-fixed"></div><div class="page-dim"></div>`;
  const ctx = { view, params: params || {}, el, stack: st, local: {}, dirty: true, scroller: el.querySelector(".scroller"), content: el.querySelector(".content"), fixed: el.querySelector(".page-fixed"), dim: el.querySelector(".page-dim"), ptrIco: el.querySelector(".ptr-ico") };
  ctx.refresh = o => renderPage(ctx, o);
  view.init?.(ctx);
  el.addEventListener("click", e => handleAct(e, ctx, el));
  el.addEventListener("input", e => handleInput(e, ctx, "input"));
  el.addEventListener("change", e => handleInput(e, ctx, "change"));
  el.addEventListener("keydown", e => onKeyAct(e));
  ctx.scroller.addEventListener("scroll", rafThrottle(() => Nav.onScroll(ctx)), { passive: true });
  if (view.ptr) setupPTR(ctx);
  return ctx;
}
function renderPage(ctx, o = {}) {
  const y = ctx.scroller.scrollTop;
  ctx.content.innerHTML = ctx.view.render(ctx);
  ctx.content.classList.toggle("anim", !!o.animate && !reduced());
  const fx = ctx.view.fixed ? ctx.view.fixed(ctx) : "";
  ctx.fixed.innerHTML = fx; ctx.el.classList.toggle("has-buybar", !!fx && !!ctx.view.buybar);
  ctx.largeTitle = ctx.content.querySelector(".large-title");
  hydrate(ctx.el);
  ctx.view.mount?.(ctx, o);
  if (o.keepScroll !== false) ctx.scroller.scrollTop = y;
  ctx.dirty = false;
  if (ctx === Nav.top()) { Nav.navTitle.textContent = viewTitle(ctx); Nav.navRight.innerHTML = ctx.view.navRight ? ctx.view.navRight(ctx) : ""; Nav.onScroll(ctx, true); }
}
function onKeyAct(e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
}

/* ---- delegated actions ---- */
const Actions = {
  close: (t, ctx) => ctx.close?.(),
  back: () => Nav.pop(),
  openVehicle: (t, ctx) => { if (ctx.layer) ctx.close(); Nav.push(VehicleView, { id: t.dataset.id, start: t.dataset.start, end: t.dataset.end }); },
  fav: t => toggleFav(t),
  openTrip: (t, ctx) => { if (ctx.layer) ctx.close(); Nav.push(TripView, { id: t.dataset.id }); },
  openHostBooking: (t, ctx) => { if (ctx.layer) ctx.close(); Nav.push(HostBookingView, { id: t.dataset.id }); },
  openChat: (t, ctx) => { if (ctx.layer) ctx.close(); Nav.push(ChatView, { id: t.dataset.id, side: t.dataset.side || (Nav.role === "business" ? "business" : "customer") }); },
  openAssistant: () => Nav.push(AssistantView, {}),
  account: () => Nav.push(AccountView, {}),
  report: t => openReport({ vehicleId: t.dataset.vehicle, bookingId: t.dataset.booking, businessId: t.dataset.biz }),
  openBiz: t => openBizSheet(t.dataset.id),
  copy: t => copyText(t.dataset.copy),
  goTab: t => Nav.switchTab(t.dataset.tab),
  noop: () => {},
};
function handleAct(e, ctx, root) {
  const t = e.target.closest("[data-act]"); if (!t || !root.contains(t)) return;
  const act = t.dataset.act; const view = ctx.view || {};
  if (act === "seg") { if (t.classList.contains("on")) return; segSelect(t); haptic(4); view.onSeg?.(ctx, t.closest(".seg").dataset.seg, t.dataset.v); return; }
  if (act === "step") { stepClick(t, ctx); return; }
  const fn = (view.actions && view.actions[act]) || Actions[act];
  if (fn) fn(t, ctx, e);
}
function handleInput(e, ctx, kind) {
  const t = e.target; const view = ctx.view || {};
  const name = kind === "input" ? t.dataset?.input : t.dataset?.change; if (!name) return;
  (view.inputs || {})[name]?.(t, ctx, e);
}

/* ---- small components ---- */
function seg(name, opts, value, cls = "") {
  const i = Math.max(0, opts.findIndex(o => String(o.v) === String(value)));
  return `<div class="seg ${cls}" data-seg="${name}" role="tablist" style="--n:${opts.length};--i:${i}"><span class="seg-thumb"></span>${opts.map((o, k) => `<button type="button" role="tab" data-act="seg" data-v="${esc(o.v)}" class="${k === i ? "on" : ""}" aria-selected="${k === i}">${o.label}</button>`).join("")}</div>`;
}
function segSelect(btn) { const s = btn.closest(".seg"); const btns = Array.from(s.children).filter(c => c.tagName === "BUTTON"); const i = btns.indexOf(btn); s.style.setProperty("--i", i); btns.forEach(b => { b.classList.toggle("on", b === btn); b.setAttribute("aria-selected", b === btn); }); }
function switchEl(id, checked, attrs = "", label = "") { return `<span class="switch"><input type="checkbox" role="switch" id="${id}" ${checked ? "checked" : ""} ${attrs} aria-label="${esc(label)}"><span class="track"></span><span class="knob"></span></span>`; }
function stepper(name, val, min, max, step = 1, fmt = "") { return `<span class="stepper" data-name="${name}" data-min="${min}" data-max="${max}" data-step="${step}" data-val="${val}" data-fmt="${fmt}"><button type="button" data-act="step" data-d="-1" aria-label="Decrease">${icon("minus")}</button><span class="sep"></span><span class="stepper-val">${fmtStep(val, fmt)}</span><span class="sep"></span><button type="button" data-act="step" data-d="1" aria-label="Increase">${icon("plus")}</button></span>`; }
function fmtStep(v, fmt) { return fmt === "pct" ? `${v}%` : fmt === "seats" ? (v <= 1 ? "Any" : `${v}+`) : String(v); }
function stepClick(btn, ctx) {
  const s = btn.closest(".stepper"); const step = +s.dataset.step || 1; const prev = +s.dataset.val;
  const val = clamp(Math.round((prev + step * +btn.dataset.d) * 100) / 100, +s.dataset.min, +s.dataset.max);
  if (val === prev) { if (!reduced()) s.animate([{ transform: "translateX(0)" }, { transform: "translateX(4px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 260 }); return; }
  s.dataset.val = val; const v = s.querySelector(".stepper-val"); v.textContent = fmtStep(val, s.dataset.fmt); v.classList.remove("bump"); void v.offsetWidth; v.classList.add("bump"); haptic(4);
  ctx.view.onStep?.(ctx, s.dataset.name, val, s);
}
function icoBox(name) { return `<span class="ico-box">${icon(name)}</span>`; }
function statusPill(st, host) { const m = STATUS[st] || STATUS.confirmed; return `<span class="pill t-${m.tone}">${icon(m.icon)}${host ? m.host : m.label}</span>`; }
function verified(b, cls = "") { return b && b.verified ? `<span class="vbadge ${cls}" title="Verified business" aria-label="Verified business">${icon("shield")}</span>` : ""; }
function smp(on = true) { return on ? `<span class="smp">Sample</span>` : ""; }
function bizLogo(b, size = "") { if (!b) return ""; return b.logo ? `<span class="logo has-img ${size}"><img src="${b.logo}" alt=""></span>` : `<span class="logo ${size}" style="--c:${b.color || "#333"}" aria-hidden="true">${esc(initials(b.name))}</span>`; }
function avatar(name) { return `<span class="avatar" style="--c:${hashColor(name)}" aria-hidden="true">${esc(initials(name))}</span>`; }
function stars(n) { let s = ""; for (let i = 1; i <= 5; i++) s += `<svg class="i ${i <= Math.round(n) ? "f" : ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS.star}</svg>`; return `<span class="stars" aria-label="${n} out of 5 stars">${s}</span>`; }
function ratingHTML(r) { return r.count ? `<span class="rating">${icon("star")}${r.avg.toFixed(1)}<span class="cnt">(${r.count})</span></span>` : `<span class="rating new">New</span>`; }
function heartBtn(id) { const on = (me().favs || []).includes(id); return `<button type="button" class="heart-btn" data-act="fav" data-id="${id}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Save to"} favourites">${icon("heart")}</button>`.replace('class="heart-btn"', `class="heart-btn${on ? " on" : ""}"`); }
function emptyState(ic, title, text, extra = "") { return `<div class="empty fade-in"><div class="e-ico">${icon(ic)}</div><h3>${title}</h3><p>${text}</p>${extra}</div>`; }
function skelCards(n = 3) { return Array.from({ length: n }, () => `<div class="sk sk-card"></div>`).join(""); }
function chev() { return icon("chevR", "chev"); }
function row({ ic, color, label, sub, value, act, attrs = "", chevron = true, cls = "" }) {
  const tag = act ? "button" : "div";
  return `<${tag} ${act ? `type="button" data-act="${act}"` : ""} class="row ${act ? "tap" : ""} ${cls}" ${attrs}>${ic ? icoBox(ic, color) : ""}<span class="lbl"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span>${value != null ? `<span class="val">${value}</span>` : ""}${act && chevron ? chev() : ""}</${tag}>`;
}

/* ---- favourites with heart pop ---- */
function toggleFav(btn) {
  const id = btn.dataset.id; const acc = me(); acc.favs = acc.favs || []; const on = !acc.favs.includes(id);
  for (const b of $$(`.heart-btn[data-id="${id}"]`)) {
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Remove from favourites" : "Save to favourites");
    if (on && !reduced()) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); burst(b); }
  }
  haptic(on ? 14 : 6);
  commit(() => { acc.favs = on ? [...acc.favs, id] : acc.favs.filter(x => x !== id); }, { render: false });
  const top = Nav.top();
  for (const k in Nav.stacks) for (const p of Nav.stacks[k].pages) if (p !== top) p.dirty = true;
  if (top && top.view === FavsView && !on) setTimeout(() => renderPage(top), 260);
  toast(on ? "Saved to Favourites" : "Removed from Favourites", { icon: "heart", tone: on ? "heart" : "" });
}
function burst(host) { const b = document.createElement("span"); b.className = "burst"; b.innerHTML = Array.from({ length: 8 }, (_, k) => `<i style="--a:${k * 45}deg"></i>`).join(""); host.appendChild(b); setTimeout(() => b.remove(), 700); }

/* ---- hydrate: image fade-in, carousels, count-ups ---- */
function hydrate(root) {
  for (const img of root.querySelectorAll("img.fade")) {
    if (img._h) continue; img._h = 1;
    const done = () => { img.classList.add("loaded"); img.closest(".sk")?.classList.add("done"); };
    if (img.complete && img.naturalWidth) done(); else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
  }
  for (const c of root.querySelectorAll(".carousel")) if (!c._h) { c._h = 1; setupCarousel(c); }
  for (const n of root.querySelectorAll("[data-count]")) if (!n._h) { n._h = 1; countUp(n); }
  for (const w of root.querySelectorAll(".wheel")) if (!w._h && w._onPick) { w._h = 1; setupWheel(w, w._onPick); }
}
function setupCarousel(c) {
  const wrap = c.parentElement; const dots = wrap.querySelector(".dots"); const counter = wrap.querySelector(".counter"); let cur = 0;
  c.addEventListener("scroll", rafThrottle(() => {
    const i = Math.round(c.scrollLeft / Math.max(1, c.clientWidth));
    if (i !== cur) { cur = i; if (dots) Array.from(dots.children).forEach((d, k) => d.classList.toggle("on", k === i)); if (counter) counter.textContent = `${i + 1} / ${c.children.length}`; }
  }), { passive: true });
}
function countUp(el) {
  const target = +el.dataset.count; const fmt = el.dataset.fmt;
  const f = v => fmt === "money" ? moneyCompact(v) : fmt === "pct" ? Math.round(v) + "%" : fmt === "dec" ? v.toFixed(1) : Math.round(v).toLocaleString("en-US");
  if (reduced() || !target) { el.textContent = f(target); return; }
  const t0 = performance.now(), D = 950;
  const step = t => { const p = Math.min(1, (t - t0) / D); const e = 1 - Math.pow(1 - p, 3); el.textContent = f(target * e); if (p < 1) requestAnimationFrame(step); };
  el.textContent = f(0); requestAnimationFrame(step);
}

/* ---- pull to refresh (touch) ---- */
function setupPTR(ctx) {
  const sc = ctx.scroller, ico = ctx.ptrIco; let y0 = null, pull = 0, busy = false;
  const show = p => { pull = p; ico.style.opacity = clamp(p / 64, 0, 1); ico.style.transform = `translate3d(0,${Math.min(p, 96) * 0.55 - 10}px,0) rotate(${p * 3.2}deg)`; };
  sc.addEventListener("touchstart", e => { if (busy) return; y0 = sc.scrollTop <= 0 ? e.touches[0].clientY : null; pull = 0; }, { passive: true });
  sc.addEventListener("touchmove", e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; const native = -Math.min(0, sc.scrollTop); show(Math.max(native, dy > 0 && sc.scrollTop <= 0 ? dy * 0.45 : 0)); }, { passive: true });
  sc.addEventListener("touchend", async () => {
    if (y0 == null) return; y0 = null;
    if (pull > 64 && !busy) { busy = true; haptic(10); ico.classList.add("spin"); await refreshPage(ctx); ico.classList.remove("spin"); busy = false; }
    ico.animate([{ opacity: ico.style.opacity || 0 }, { opacity: 0 }], { duration: 220 }); ico.style.opacity = 0; ico.style.transform = ""; pull = 0;
  }, { passive: true });
}
async function refreshPage(ctx) {
  const target = ctx.content.querySelector("[data-skel]");
  if (target) target.innerHTML = skelCards(Math.min(3, target.children.length || 3));
  if (tickStatuses()) Store.save();
  await wait(520);
  renderPage(ctx, { animate: true });
}

/* ---- toast ---- */
function toast(msg, o = {}) {
  const wrap = $("#toasts"); if (!wrap) return;
  const t = document.createElement("div"); t.className = "toast " + (o.tone || ""); t.setAttribute("role", "status");
  t.innerHTML = `${icon(o.icon || (o.tone === "warn" ? "alert" : "checkCircle"))}<span>${esc(msg)}</span>`;
  wrap.appendChild(t); while (wrap.children.length > 2) wrap.firstElementChild.remove();
  if (!reduced()) t.animate([{ transform: "translate3d(0,-26px,0) scale(.94)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: EASE });
  setTimeout(() => { const a = t.animate([{ opacity: 1 }, { opacity: 0, transform: "translate3d(0,-12px,0) scale(.97)" }], { duration: 260, easing: "ease-in", fill: "forwards" }); a.finished.then(() => t.remove(), () => t.remove()); }, o.ms || 2200);
}

/* ---- bottom sheets (drag to dismiss with momentum) ---- */
function currentY(el) { const t = getComputedStyle(el).transform; if (!t || t === "none") return 0; try { return new DOMMatrixReadOnly(t).m42; } catch (e) { return 0; } }
const Sheets = {
  stack: [],
  open(opts) {
    const layer = document.createElement("div"); layer.className = "layer sheet-layer";
    layer.innerHTML = `<div class="backdrop"></div><section class="sheet ${opts.size || "auto"}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || "")}">
      <div class="sheet-grab" aria-hidden="true"><i></i></div>
      <header class="sheet-head"><div class="sh-l">${opts.left || ""}</div><h2 class="sh-t">${esc(opts.title || "")}</h2><div class="sh-r">${opts.right ?? `<button type="button" class="sh-x press" data-act="close" aria-label="Close">${icon("x")}</button>`}</div></header>
      <div class="sheet-body"></div><footer class="sheet-foot" hidden></footer></section>`;
    Nav.layers.appendChild(layer);
    const s = { view: opts, opts, layer, el: layer.querySelector(".sheet"), body: layer.querySelector(".sheet-body"), foot: layer.querySelector(".sheet-foot"), backdrop: layer.querySelector(".backdrop"), titleEl: layer.querySelector(".sh-t"), local: opts.local || {}, params: opts.params || {} };
    s.refresh = (o = {}) => { const y = s.body.scrollTop; s.body.innerHTML = opts.render(s); s.refreshFoot(); hydrate(s.el); opts.mount?.(s); if (o.keepScroll !== false) s.body.scrollTop = y; };
    s.refreshFoot = () => { if (opts.footer) { s.foot.hidden = false; s.foot.innerHTML = opts.footer(s); hydrate(s.foot); } else s.foot.hidden = true; };
    s.close = o => Sheets.close(s, o);
    s.setTitle = t => { s.titleEl.textContent = t; };
    s.done = new Promise(r => { s._resolve = r; });
    layer.addEventListener("click", e => { if (e.target === s.backdrop) { if (!opts.modal) s.close(); return; } handleAct(e, s, layer); });
    layer.addEventListener("input", e => handleInput(e, s, "input"));
    layer.addEventListener("change", e => handleInput(e, s, "change"));
    layer.addEventListener("keydown", e => onKeyAct(e));
    s.refresh();
    const prev = this.stack[this.stack.length - 1]; this.stack.push(s);
    if (prev && !reduced()) { prev.el.style.transform = "translate3d(0,-8px,0) scale(.94)"; prev.el.animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,-8px,0) scale(.94)" }], { duration: 420, easing: EASE }); }
    s.backdrop.style.opacity = 1;
    if (!reduced()) { s.el.animate([{ transform: "translate3d(0,100%,0)" }, { transform: "translate3d(0,0,0)" }], { duration: 460, easing: EASE }); s.backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease" }); }
    setupSheetDrag(s);
    setTimeout(() => s.el.querySelector(".sh-x, .sh-done, button")?.focus({ preventScroll: true }), 60);
    return s;
  },
  close(s, o = {}) {
    if (s.closing) return; s.closing = true;
    const i = this.stack.indexOf(s); if (i >= 0) this.stack.splice(i, 1);
    const prev = this.stack[this.stack.length - 1];
    if (prev) { const from = prev.el.style.transform; prev.el.style.transform = "translate3d(0,0,0)"; if (!reduced() && from) prev.el.animate([{ transform: from }, { transform: "translate3d(0,0,0)" }], { duration: 380, easing: EASE }); }
    const done = () => { s.layer.remove(); s.opts.onClose?.(o.result); s._resolve(o.result); };
    if (reduced()) return done();
    const h = s.el.offsetHeight; const cur = currentY(s.el); const remaining = Math.max(40, h - cur);
    let dur = 380, easing = EASE;
    if (o.velocity > 0.2) { dur = clamp(3 * remaining / o.velocity, 140, 380); easing = "cubic-bezier(0.25, 0.75, 0.3, 1)"; }
    s.el.style.transform = `translate3d(0,${h + 40}px,0)`;
    const a = s.el.animate([{ transform: `translate3d(0,${cur}px,0)` }, { transform: `translate3d(0,${h + 40}px,0)` }], { duration: dur, easing });
    s.backdrop.animate([{ opacity: getComputedStyle(s.backdrop).opacity }, { opacity: 0 }], { duration: dur, easing: "ease", fill: "forwards" });
    a.finished.then(done, done);
  },
  closeAll() { for (const s of this.stack.splice(0)) { s.layer.remove(); s._resolve?.(); } for (const l of $$(".layer", Nav.layers || document)) l.remove(); },
  top() { return this.stack[this.stack.length - 1]; },
};
function setupSheetDrag(s) {
  const el = s.el, body = s.body; let g = null;
  const start = (y, target) => {
    if (s.closing) return;
    const inHead = !!target.closest(".sheet-grab, .sheet-head");
    if (inHead && target.closest("button, input, a, select")) return;
    const inBody = !inHead && body.contains(target);
    if (!inHead && !inBody) return;
    if (inBody && (body.scrollTop > 0 || target.closest(".wheel, input[type=range], textarea, .hscroll, .no-drag, .dual"))) return;
    g = { y0: y, inBody, active: false, samples: [], h: el.offsetHeight, t: 0 };
  };
  const move = y => {
    if (!g) return false; const dy = y - g.y0;
    if (!g.active) { if (g.inBody && (dy < 0 || body.scrollTop > 0)) { g = null; return false; } if (Math.abs(dy) < 6) return false; g.active = true; }
    const t = dy > 0 ? dy : -Math.sqrt(-dy) * 2.2;
    g.t = t; el.style.transform = `translate3d(0,${t}px,0)`; s.backdrop.style.opacity = clamp(1 - t / g.h, 0, 1);
    g.samples.push([performance.now(), dy]); if (g.samples.length > 6) g.samples.shift();
    return true;
  };
  const end = () => {
    if (!g) return; const d = g; g = null; if (!d.active) return;
    const a = d.samples[0], b = d.samples[d.samples.length - 1];
    const v = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    if ((d.t > d.h * 0.28 && v > -0.1) || v > 0.55) { s.close({ velocity: Math.max(v, 0.3) }); return; }
    const from = d.t; el.style.transform = "translate3d(0,0,0)"; s.backdrop.style.opacity = 1;
    if (!reduced()) el.animate([{ transform: `translate3d(0,${from}px,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 460, easing: "cubic-bezier(0.34, 1.25, 0.64, 1)" });
  };
  el.addEventListener("touchstart", e => { if (e.touches.length === 1) start(e.touches[0].clientY, e.target); }, { passive: true });
  el.addEventListener("touchmove", e => { if (move(e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
  el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
  el.addEventListener("mousedown", e => {
    if (e.button !== 0 || !e.target.closest(".sheet-grab, .sheet-head") || e.target.closest("button")) return;
    start(e.clientY, e.target);
    const mm = ev => { if (move(ev.clientY)) ev.preventDefault(); };
    const mu = () => { end(); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  });
}
document.addEventListener("keydown", e => { if (e.key === "Escape") { const s = Sheets.top(); if (s && !s.opts.modal) s.close(); } });

/* ---- action sheet (iOS style confirm) ---- */
function actionSheet({ title, message, actions, cancel = "Cancel" }) {
  return new Promise(resolve => {
    const layer = document.createElement("div"); layer.className = "layer";
    layer.innerHTML = `<div class="backdrop"></div><div class="asheet" role="alertdialog" aria-modal="true" aria-label="${esc(title || "Choose an option")}">
      <div class="as-group">${title || message ? `<div class="as-msg">${title ? `<b>${esc(title)}</b>` : ""}${message ? `<span>${message}</span>` : ""}</div>` : ""}
      ${actions.map((a, i) => `<button type="button" class="as-btn ${a.style || ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>
      <div class="as-group"><button type="button" class="as-btn cancel" data-i="-1">${esc(cancel)}</button></div></div>`;
    Nav.layers.appendChild(layer);
    const sh = layer.querySelector(".asheet"), bd = layer.querySelector(".backdrop");
    bd.style.opacity = 1;
    if (!reduced()) { sh.animate([{ transform: "translate3d(0,110%,0)" }, { transform: "translate3d(0,0,0)" }], { duration: 420, easing: EASE }); bd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); }
    let closed = false;
    const close = val => {
      if (closed) return; closed = true; resolve(val);
      if (reduced()) { layer.remove(); return; }
      sh.animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,115%,0)" }], { duration: 300, easing: EASE, fill: "forwards" });
      bd.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: "forwards" }).finished.then(() => layer.remove(), () => layer.remove());
    };
    layer.addEventListener("click", e => { if (e.target === bd) return close(null); const b = e.target.closest("[data-i]"); if (!b) return; haptic(5); const i = +b.dataset.i; close(i < 0 ? null : (actions[i].value ?? i)); });
    layer.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(null); } });
    setTimeout(() => layer.querySelector(".as-btn")?.focus({ preventScroll: true }), 50);
  });
}

/* ---- wheel pickers ---- */
const WHEEL_H = 36;
function wheelHTML(name, items, sel, cls = "") { return `<div class="wheel ${cls}" data-wheel="${name}" data-sel="${sel}" role="listbox" tabindex="0" aria-label="${name}">${items.map((t, i) => `<div class="wheel-item" data-i="${i}" role="option">${esc(t)}</div>`).join("")}</div>`; }
function setupWheel(w, onChange) {
  const items = Array.from(w.children); let sel = +w.dataset.sel || 0; let timer = 0; let last = -1;
  const paint = () => {
    const c = w.scrollTop / WHEEL_H; const lo = Math.max(0, Math.floor(c) - 5), hi = Math.min(items.length - 1, Math.ceil(c) + 5);
    for (let i = lo; i <= hi; i++) { const d = i - c; const a = clamp(d * 19, -80, 80); items[i].style.transform = `perspective(360px) rotateX(${-a}deg) scale(${1 - Math.min(Math.abs(d) * 0.045, 0.22)})`; items[i].style.opacity = clamp(1 - Math.abs(d) * 0.25, 0.1, 1); }
    const idx = clamp(Math.round(c), 0, items.length - 1);
    if (idx !== last) { if (last >= 0) { items[last]?.classList.remove("sel"); items[last]?.setAttribute("aria-selected", "false"); } items[idx].classList.add("sel"); items[idx].setAttribute("aria-selected", "true"); if (last >= 0) haptic(2); last = idx; }
  };
  const settle = () => { const idx = clamp(Math.round(w.scrollTop / WHEEL_H), 0, items.length - 1); if (idx !== sel) { sel = idx; w.dataset.sel = idx; onChange(idx); } };
  w.addEventListener("scroll", () => { requestAnimationFrame(paint); clearTimeout(timer); timer = setTimeout(settle, 120); }, { passive: true });
  w.addEventListener("click", e => { const it = e.target.closest(".wheel-item"); if (it) w.scrollTo({ top: +it.dataset.i * WHEEL_H, behavior: reduced() ? "auto" : "smooth" }); });
  w.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = clamp(sel + (e.key === "ArrowDown" ? 1 : -1), 0, items.length - 1); w.scrollTo({ top: n * WHEEL_H, behavior: reduced() ? "auto" : "smooth" }); } });
  w.setTo = i => { sel = i; w.dataset.sel = i; w.scrollTop = i * WHEEL_H; paint(); };
  requestAnimationFrame(() => { w.scrollTop = sel * WHEEL_H; paint(); });
}

/* Pick-up & return picker: one sheet, two tabs, iOS wheels, quick-duration chips */
function pickTrip({ start, end, which = "start", title = "Pick-up & return", lockStart = false, single = false }) {
  return new Promise(resolve => {
    const T0 = sod(jmNow());
    const N = 366;
    const dateItems = Array.from({ length: N }, (_, i) => i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDate(fromMs(T0 + i * DAY)));
    const hourItems = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    const minItems = ["00", "15", "30", "45"];
    const split = s => { const ms = toMs(s); const d = new Date(ms); const h = d.getUTCHours(); return { di: clamp(Math.round((sod(ms) - T0) / DAY), 0, N - 1), h12: h % 12, mi: clamp(Math.round(d.getUTCMinutes() / 15), 0, 3), ap: h >= 12 ? 1 : 0 }; };
    const join = p => fromMs(T0 + p.di * DAY + ((p.h12 % 12) + (p.ap ? 12 : 0)) * HOUR + p.mi * 15 * MIN);
    const L = { which: lockStart ? "end" : which, start, end, result: null };
    const labels = s => {
      for (const k of ["start", "end"]) { const b = s.body.querySelector(`[data-k="${k}"]`); if (!b) continue; b.querySelector("b").textContent = relDate(L[k]); b.querySelector("span").textContent = fmtTime(L[k]); }
      const n = s.body.querySelector("#dtNote"); if (n) n.textContent = single ? `${CONFIG.TZ_LABEL} (UTC−5).` : `${plural(rentalDays(L.start, L.end), "rental day")} · ${CONFIG.TZ_LABEL} (UTC−5).`;
    };
    const sheet = Sheets.open({
      title, size: "auto", local: L,
      render: s => {
        const p = split(L[L.which]);
        const tabs = single ? `<div class="dt-tabs single"><div class="dt-tab on" data-k="${L.which}"><small>${L.which === "start" ? "Pick-up" : "Return"}</small><b></b><span></span></div></div>`
          : `<div class="dt-tabs">${["start", "end"].map(k => `<button type="button" class="dt-tab press glowable ${L.which === k ? "on" : ""}" data-act="which" data-k="${k}" ${lockStart && k === "start" ? "disabled" : ""}><small>${k === "start" ? "Pick-up" : "Return"}${lockStart && k === "start" ? " · locked" : ""}</small><b></b><span></span></button>`).join("")}</div>`;
        return `${tabs}
          <div class="wheels no-drag"><div class="wheel-band"></div>${wheelHTML("date", dateItems, p.di, "w-date")}${wheelHTML("hour", hourItems, p.h12)}${wheelHTML("min", minItems, p.mi)}${wheelHTML("ampm", ["AM", "PM"], p.ap)}</div>
          ${single ? "" : `<div class="quick hscroll no-drag">${[[1, "1 day"], [2, "2 days"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"], [30, "1 month"]].map(([d, l]) => `<button type="button" class="chip press" data-act="dur" data-d="${d}">${l}</button>`).join("")}</div>`}
          <p class="note" style="margin-top:10px">${icon("clock")}<span id="dtNote"></span></p>`;
      },
      mount: s => {
        labels(s);
        const p = split(L[L.which]);
        for (const w of $$(".wheel", s.body)) setupWheel(w, idx => {
          const k = w.dataset.wheel; const cur = split(L[L.which]);
          if (k === "date") cur.di = idx; else if (k === "hour") cur.h12 = idx; else if (k === "min") cur.mi = idx; else cur.ap = idx;
          const val = join(cur); const len = Math.max(HOUR, toMs(L.end) - toMs(L.start));
          L[L.which] = val;
          if (L.which === "start" && toMs(L.end) <= toMs(L.start)) L.end = fromMs(toMs(L.start) + Math.max(DAY, len));
          if (L.which === "end" && toMs(L.end) <= toMs(L.start)) { L.end = fromMs(toMs(L.start) + HOUR); }
          labels(s);
        });
        void p;
      },
      footer: () => `<button type="button" class="btn block pill press" data-act="done">Done</button>`,
      actions: {
        which: (t, s) => { if (L.which === t.dataset.k) return; L.which = t.dataset.k; s.refresh(); },
        dur: (t, s) => { L.end = fromMs(toMs(L.start) + (+t.dataset.d) * DAY); if (L.which === "end") s.refresh(); else labels(s); haptic(5); },
        done: (t, s) => { if (toMs(L.start) < jmNow() - HOUR && !lockStart) { toast("Pick-up can’t be in the past", { tone: "warn" }); return; } if (toMs(L.end) <= toMs(L.start)) { toast("Return must be after pick-up", { tone: "warn" }); return; } L.result = { start: L.start, end: L.end }; s.close({ result: L.result }); },
      },
      onClose: r => resolve(r || null),
    });
    void sheet;
  });
}
function pickDateTime({ value, title = "Date & time" }) { return pickTrip({ start: value, end: fromMs(toMs(value) + DAY), which: "start", title, single: true }).then(r => r ? r.start : null); }
function pickMonthYear({ value, title = "Licence expiry" }) {
  return new Promise(resolve => {
    const now = new Date(jmNow()); const y0 = now.getUTCFullYear();
    const years = Array.from({ length: 16 }, (_, i) => String(y0 + i));
    let [y, m] = (value || `${y0 + 3}-06`).split("-").map(Number); if (!(y >= y0)) y = y0 + 3; if (!(m >= 1)) m = 6;
    const L = { m: m - 1, y: y - y0 };
    Sheets.open({ title, size: "auto",
      render: () => `<div class="wheels no-drag"><div class="wheel-band"></div>${wheelHTML("m", MONL, L.m, "w-date")}${wheelHTML("y", years, L.y)}</div><p class="note" style="margin-top:10px">${icon("info")}<span>Your licence must be valid on the return date.</span></p>`,
      mount: s => { for (const w of $$(".wheel", s.body)) setupWheel(w, idx => { L[w.dataset.wheel] = idx; }); },
      footer: () => `<button type="button" class="btn block pill press" data-act="done">Done</button>`,
      actions: { done: (t, s) => s.close({ result: `${y0 + L.y}-${String(L.m + 1).padStart(2, "0")}` }) },
      onClose: r => resolve(r || null) });
  });
}
/* Simple text/number edit sheet */
function editField({ title, label, value = "", type = "text", placeholder = "", hint = "", inputmode = "" }) {
  return new Promise(resolve => {
    const L = { v: value };
    Sheets.open({ title, size: "auto",
      render: () => `<div class="group"><label class="frow"><span>${esc(label)}</span><input id="ef_input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${inputmode ? `inputmode="${inputmode}"` : ""} data-input="v" autocomplete="off"></label></div>${hint ? `<p class="group-foot">${hint}</p>` : ""}`,
      mount: s => setTimeout(() => s.body.querySelector("input")?.focus(), 380),
      inputs: { v: t => { L.v = t.value; } },
      footer: () => `<button type="button" class="btn block pill press" data-act="save">Save</button>`,
      actions: { save: (t, s) => s.close({ result: { v: L.v } }) },
      onClose: r => resolve(r ? r.v : null) });
  });
}

/* ---- swipe back from the left edge (touch) ---- */
function setupSwipeBack() {
  const stage = Nav.stage; let g = null;
  stage.addEventListener("touchstart", e => {
    if (Nav.busy || Sheets.stack.length || e.touches.length !== 1) return;
    const st = Nav.stacks[Nav.tab]; if (!st || st.pages.length < 2) return;
    const rect = stage.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left;
    if (x > 26) return;
    g = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, active: false, top: st.pages[st.pages.length - 1], prev: st.pages[st.pages.length - 2], W: rect.width, samples: [], d: 0 };
  }, { passive: true });
  stage.addEventListener("touchmove", e => {
    if (!g) return; const t = e.touches[0]; const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
      if (dx < 8) return;
      g.active = true; g.prev.el.hidden = false; if (g.prev.dirty) renderPage(g.prev); g.top.el.classList.add("edge-shadow");
    }
    e.preventDefault();
    const d = clamp(dx, 0, g.W); g.d = d; const f = 1 - d / g.W;
    g.top.el.style.transform = `translate3d(${d}px,0,0)`; g.prev.el.style.transform = `translate3d(${-g.W * 0.28 * f}px,0,0)`; g.prev.dim.style.opacity = 0.1 * f;
    g.samples.push([performance.now(), d]); if (g.samples.length > 5) g.samples.shift();
  }, { passive: false });
  const end = () => {
    if (!g) return; const s = g; g = null; if (!s.active) return;
    const a = s.samples[0] || [0, 0], b = s.samples[s.samples.length - 1] || [1, 0]; const v = (b[1] - a[1]) / Math.max(1, b[0] - a[0]);
    s.top.el.style.transform = ""; s.prev.el.style.transform = ""; s.prev.dim.style.opacity = "";
    if (s.d > s.W * 0.4 || v > 0.35) { const remaining = s.W - s.d; Nav.pop({ fromX: s.d, duration: clamp(remaining / Math.max(v, 0.7) * 1.3, 160, 380), easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }); return; }
    const f = 1 - s.d / s.W;
    const an = s.top.el.animate([{ transform: `translate3d(${s.d}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 300, easing: EASE });
    s.prev.el.animate([{ transform: `translate3d(${-s.W * 0.28 * f}px,0,0)` }, { transform: `translate3d(${-s.W * 0.28}px,0,0)` }], { duration: 300, easing: EASE });
    an.finished.then(() => { s.prev.el.hidden = true; s.top.el.classList.remove("edge-shadow"); }, () => {});
  };
  stage.addEventListener("touchend", end); stage.addEventListener("touchcancel", end);
}
