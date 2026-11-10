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
function hashColor(str) { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; const hues = [211, 145, 28, 340, 265, 190, 8, 45]; return `hsl(${hues[Math.abs(h) % hues.length]} 55% 46%)`; }
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
