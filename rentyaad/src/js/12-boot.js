/* ============ boot ============ */
function normalizeState(st) {
  const base = { role: "customer", hostBizId: "b1", settings: {}, profile: {}, search: defaultSearch(), favs: [], businesses: [], vehicles: [], bookings: [], reviews: [], messages: {}, reads: {}, reports: [] };
  const s = Object.assign(base, st);
  s.settings = Object.assign({ currency: "JMD", fx: CONFIG.FX_DEFAULT, commission: CONFIG.COMMISSION_DEFAULT }, s.settings);
  s.profile = Object.assign({ name: "Demo Customer", phone: "", email: "", licence: "", licenceExpiry: "", age: 30 }, s.profile);
  s.search = Object.assign(defaultSearch(), s.search); if (!Array.isArray(s.search.features)) s.search.features = [];
  if (!s.businesses.some(b => b.id === s.hostBizId)) s.hostBizId = s.businesses[0]?.id || "b1";
  for (const v of s.vehicles) { v.blocks = v.blocks || []; v.photos = v.photos || []; v.features = v.features || []; v.seasonal = v.seasonal || []; v.mileage = v.mileage || { limit: null, extraPerKm: 40 }; v.rates = v.rates || { daily: 5000, weekly: 31000, monthly: 110000 }; }
  for (const b of s.bookings) { b.events = b.events || []; b.extras = b.extras || {}; }
  s.v = CONFIG.DATA_VERSION;
  return s;
}
async function boot() {
  document.title = CONFIG.APP_NAME;
  for (const el of $$("[data-app-name]")) el.textContent = CONFIG.APP_NAME;
  let st = null;
  try { st = await Store.load(); } catch (e) { st = null; }
  if (!st || st.v !== CONFIG.DATA_VERSION || !Array.isArray(st.vehicles)) S = seedState();
  else S = normalizeState(st);
  // keep the default search window in the future
  if (toMs(S.search.start) < jmNow() - HOUR || toMs(S.search.end) <= toMs(S.search.start)) { const d = defaultSearch(); S.search.start = d.start; S.search.end = d.end; }
  tickStatuses();
  Store.save();
  Nav.init();
  Nav.setRole(S.role || "customer", { animate: false });
  const bp = $("#bootPage");
  if (bp) { if (reduced()) bp.remove(); else bp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease", fill: "forwards" }).finished.then(() => bp.remove(), () => bp.remove()); }
  document.addEventListener("touchstart", () => {}, { passive: true }); // enables :active on iOS
  setInterval(() => { if (tickStatuses()) { Store.save(); Nav.invalidate(); } }, 60000);
  AI.init();
  try { if (window.claude && typeof window.claude.use === "function") window.claude.use("downloads").then(d => { DL = d || null; }, () => {}); } catch (e) { /* downloads optional */ }
}
boot();
