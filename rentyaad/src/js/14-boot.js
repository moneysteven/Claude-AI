/* ============ boot ============ */
function normalizeState(st) {
  const base = { role: "customer", hostBizId: "b1", settings: {}, search: defaultSearch(), accounts: [], session: null, lastUserId: null, businesses: [], vehicles: [], bookings: [], reviews: [], messages: {}, reads: {}, reports: [] };
  const s = Object.assign(base, st);
  s.settings = Object.assign({ currency: "JMD", fx: CONFIG.FX_DEFAULT, commission: CONFIG.COMMISSION_DEFAULT }, s.settings);
  s.search = Object.assign(defaultSearch(), s.search); if (!Array.isArray(s.search.features)) s.search.features = []; if (!Array.isArray(s.search.payMethods)) s.search.payMethods = []; if (!s.search.where) s.search.where = { kind: "any" };
  if (!s.accounts.length) s.accounts = [demoAccount(jmNow())];
  for (const a of s.accounts) { a.roles = a.roles || { renter: true, host: false }; a.favs = a.favs || []; a.businessIds = a.businessIds || []; a.verified = a.verified || {}; }
  if (!s.businesses.some(b => b.id === s.hostBizId)) s.hostBizId = s.businesses[0]?.id || "b1";
  for (const b of s.businesses) { b.payments = b.payments || { app: true, cash: true, bank: false }; b.town = b.town || PARISH_TOWNS[b.parish]?.[0]?.[0] || ""; }
  for (const v of s.vehicles) {
    v.blocks = v.blocks || []; v.photos = v.photos || []; v.features = v.features || []; v.seasonal = v.seasonal || []; v.rules = v.rules || []; v.customRules = v.customRules || [];
    v.mileage = v.mileage || { limit: null, extraPerKm: 40 }; v.rates = v.rates || { daily: 5000, weekly: 31000, monthly: 110000 };
    v.location = v.location || { parish: "Kingston", town: "", landmark: "" };
    v.pickupOpts = v.pickupOpts || { atLocation: true, airport: { enabled: false, fee: CONFIG.AIRPORT_FEE, airports: [] }, hotel: { enabled: false, fee: CONFIG.HOTEL_FEE } };
    v.title = v.title || `${v.make} ${v.model}`;
  }
  for (const b of s.bookings) { b.events = b.events || []; b.extras = b.extras || {}; if (!b.payment) b.payment = makePayment(b.quote, "app", "deposit", null); }
  s.v = CONFIG.DATA_VERSION;
  return s;
}
async function boot() {
  document.title = CONFIG.APP_NAME;
  for (const el of $$("[data-app-name]")) el.textContent = CONFIG.APP_NAME;
  let st = null;
  try { st = await Store.load(); } catch (e) { st = null; }
  try { st = st ? migrateState(st) : null; } catch (e) { st = null; }
  if (!st || !Array.isArray(st.vehicles)) S = seedState();
  else S = normalizeState(st);
  await ensureDemoPassword();
  if (toMs(S.search.start) < jmNow() - HOUR || toMs(S.search.end) <= toMs(S.search.start)) { const d = defaultSearch(); S.search.start = d.start; S.search.end = d.end; }
  tickStatuses();
  Store.save();
  Nav.init(); Auth.init();
  await Bio.check();
  const bp = $("#bootPage");
  if (bp) { if (reduced()) bp.remove(); else bp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease", fill: "forwards" }).finished.then(() => bp.remove(), () => bp.remove()); }
  const r = Auth.restore();
  if (r && r.remembered && r.acc.biometric) Auth.show(LockScreen, { acc: r.acc });
  else if (r) Auth.enter(r.acc, { remember: r.remembered });
  else Auth.show(WelcomeScreen);
  document.addEventListener("touchstart", () => {}, { passive: true });
  // fixed containers must never scroll (focus() and scrollIntoView can nudge overflow:hidden boxes)
  for (const el of [$("#app"), $("#stage"), $("#auth"), $("#layers")]) el.addEventListener("scroll", () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } }, { passive: true });
  setInterval(() => { if (tickStatuses()) { Store.save(); Nav.invalidate(); } }, 60000);
  AI.init();
  try { if (window.claude && typeof window.claude.use === "function") window.claude.use("downloads").then(d => { DL = d || null; }, () => {}); } catch (e) { /* downloads optional */ }
}
boot();
