/* ============ utilities ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const wait = ms => new Promise(r => setTimeout(r, ms));
const MQ_REDUCED = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const reduced = () => MQ_REDUCED.matches;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

function icon(name, cls = "") { return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function rafThrottle(fn) { let queued = false, args; return (...a) => { args = a; if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fn(...args); }); } }; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function uid(p = "id") { return p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7); }
function refCode() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = "RY-"; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function haptic(ms = 8) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }
function initials(name) { return String(name || "?").replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + "s")}`; }
function hashColor(str) { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; const hues = [150, 210, 25, 260, 190, 340]; return `hsl(${hues[Math.abs(h) % hues.length]} 14% 40%)`; }
function digits(s) { return String(s || "").replace(/\D/g, ""); }

/* ---- time: everything is a naive "YYYY-MM-DDTHH:MM" string in Jamaica time (UTC−5, no DST) ---- */
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function jmNow() { return Date.now() + CONFIG.TZ_OFFSET_H * HOUR; }
function toMs(s) { if (!s) return NaN; return Date.parse(s.length <= 10 ? s.slice(0, 10) + "T00:00:00Z" : s.slice(0, 16) + ":00Z"); }
function fromMs(ms) { return new Date(ms).toISOString().slice(0, 16); }
function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
function sod(ms) { return Math.floor(ms / DAY) * DAY; }
function nowStr() { return fromMs(jmNow()); }
function todayKey() { return dayKey(jmNow()); }
function addDays(s, n) { return fromMs(toMs(s) + n * DAY); }
function fmtDate(s, withYear) { const d = new Date(toMs(s)); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${withYear ? " " + d.getUTCFullYear() : ""}`; }
function fmtTime(s) { const d = new Date(toMs(s)); let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${ap}`; }
function fmtDT(s) { return `${fmtDate(s)}, ${fmtTime(s)}`; }
function relDate(s) { const d = Math.round((sod(toMs(s)) - sod(jmNow())) / DAY); if (d === 0) return "Today"; if (d === 1) return "Tomorrow"; if (d === -1) return "Yesterday"; return fmtDate(s); }
function fmtRange(a, b) { return `${fmtDate(a)}, ${fmtTime(a)} → ${fmtDate(b)}, ${fmtTime(b)}`; }
function rentalDays(a, b) { return Math.max(1, Math.ceil((toMs(b) - toMs(a)) / DAY - 1e-9)); }
function fmtClock(ms) { return fmtTime(fromMs(ms)); }
function fmtWhen(ms) { const d = Math.round((sod(jmNow()) - sod(ms)) / DAY); if (d === 0) return fmtClock(ms); if (d === 1) return "Yesterday"; if (d < 7) return DOW[new Date(ms).getUTCDay()]; return fmtDate(fromMs(ms)); }
function fmtDayHeader(ms) { const d = Math.round((sod(jmNow()) - sod(ms)) / DAY); if (d === 0) return "Today"; if (d === 1) return "Yesterday"; return fmtDate(fromMs(ms), true); }
function fmtMonthYear(ym) { if (!ym) return ""; const [y, m] = ym.split("-").map(Number); return `${MONL[m - 1]} ${y}`; }

/* ---- money (J$ is the source of truth; US$ uses the one editable rate) ---- */
function otherCur() { return S.settings.currency === "USD" ? "JMD" : "USD"; }
function money(j, o = {}) {
  const cur = o.cur || S.settings.currency;
  const neg = j < 0; const a = Math.abs(+j || 0);
  if (cur === "USD") { const u = a / S.settings.fx; const dec = o.dec ? 2 : 0; return (neg ? "−" : "") + "US$" + u.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  return (neg ? "−" : "") + "J$" + Math.round(a).toLocaleString("en-US");
}
function moneyJ(j) { return money(j, { cur: "JMD" }); }
/* KPI tiles: millions shown as J$17.44M so big totals never get cut off */
function moneyCompact(j) {
  const usd = S.settings.currency === "USD"; const v = Math.abs(usd ? j / S.settings.fx : j);
  if (v < 1e6) return money(j);
  return (j < 0 ? "−" : "") + (usd ? "US$" : "J$") + (v / 1e6).toFixed(v >= 1e8 ? 0 : v >= 1e7 ? 1 : 2) + "M";
}
function moneyShort(j) {
  const usd = S.settings.currency === "USD"; const v = usd ? j / S.settings.fx : j; const p = usd ? "US$" : "J$";
  if (v >= 1e6) return p + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return p + Math.round(v / 1e3) + "k";
  return p + Math.round(v);
}

/* ---- images: shrink an uploaded photo so localStorage stays small ---- */
function readImage(file, max = 900, q = 0.74) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file."));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Couldn’t read that file."));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL("image/jpeg", q)); } catch (e) { resolve(fr.result); }
      };
      img.onerror = () => reject(new Error("That image couldn’t be opened."));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function copyText(text, label = "Copied") {
  const done = () => toast(label);
  try {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text) && done());
  } catch (e) { if (fallbackCopy(text)) done(); }
}
function fallbackCopy(text) {
  try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); if (!ok) toast("Select the text and copy it manually", { tone: "warn" }); return ok; } catch (e) { toast("Select the text and copy it manually", { tone: "warn" }); return false; }
}

/* ---- geo ---- */
function haversineKm(a1, o1, a2, o2) { const R = 6371, r = Math.PI / 180; const dA = (a2 - a1) * r, dO = (o2 - o1) * r; const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function townCoords(parish, town) { const t = TOWN_INDEX.find(x => x.parish === parish && x.town === town); if (t) return [t.lat, t.lng]; return PARISH_CENTER[parish] || [18.1, -77.3]; }
function nearestTown(lat, lng) { let best = null, bd = Infinity; for (const t of TOWN_INDEX) { const d = haversineKm(lat, lng, t.lat, t.lng); if (d < bd) { bd = d; best = t; } } return best; }
function fmtKm(km) { return km < 1 ? "Under 1 km" : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`; }

/* ---- auth helpers (DEMO: local only) ---- */
function sha256Fallback(ascii) {
  const rotr = (v, n) => (v >>> n) | (v << (32 - n)); const K = []; const H = []; let p = 2;
  const isPrime = n => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
  while (K.length < 64) { if (isPrime(p)) { if (H.length < 8) H.push((Math.pow(p, 1 / 2) * 2 ** 32) | 0); K.push((Math.pow(p, 1 / 3) * 2 ** 32) | 0); } p++; }
  const bytes = new TextEncoder().encode(ascii); const l = bytes.length; const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6); withPad.set(bytes); withPad[l] = 0x80;
  const dv = new DataView(withPad.buffer); dv.setUint32(withPad.length - 4, l * 8); const h = H.slice();
  for (let i = 0; i < withPad.length; i += 64) {
    const w = new Array(64); for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4);
    for (let j = 16; j < 64; j++) { const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3); const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let j = 0; j < 64; j++) { const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (hh + S1 + ch + K[j] + w[j]) | 0; const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) | 0; hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
async function sha256Hex(str) {
  try { if (window.crypto && crypto.subtle) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""); } } catch (e) { /* fall back */ }
  return sha256Fallback(str);
}
function randHex(n = 16) { const a = new Uint8Array(n); try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); } return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(pw, salt) { return sha256Hex(`${salt}:${pw}`); }
function formatPhone(raw) {
  let d = digits(raw); if (d.startsWith("1")) d = d.slice(1); d = d.slice(0, 10);
  if (!d) return "";
  if (d.length <= 3) return `+1 ${d}`;
  if (d.length <= 6) return `+1 ${d.slice(0, 3)}-${d.slice(3)}`;
  return `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}
function phoneKey(raw) { let d = digits(raw); if (d.length === 11 && d.startsWith("1")) d = d.slice(1); return d; }
function validJmPhone(raw) { const d = phoneKey(raw); return d.length === 10 && /^(876|658)/.test(d); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim()); }
function pwStrength(pw) {
  let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  const level = pw.length < 8 ? 0 : s <= 2 ? 1 : s === 3 ? 2 : s === 4 ? 3 : 4;
  return { level, label: ["Too short", "Weak", "Fair", "Good", "Strong"][level], ok: pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw) };
}
