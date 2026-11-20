/* =========================================================================
   SETTINGS – everything to fill in or change is in this one block.
   ========================================================================= */

/* Prices in JMD, written after "JMD $". They show on the service cards, the booking choices and in the
   Terms. A range (like Full Glam) shows as "from JMD $<first amount>" in the booking summary and on the
   Pay button; Launthia sets the final amount within the range.
   These are the starting prices: once Supabase is connected, the prices Launthia saves in her dashboard
   (Settings > Your prices) replace them on every page. */
var SOFT_GLAM_PRICE = '9,500';
var FULL_GLAM_PRICE = '10,500 – $12,000';

/* Full Glam comes in two looks, each with one fixed price (numbers only). The client chooses the look when booking.
   Once Supabase is connected, the prices Launthia saves in her dashboard replace these. */
var FULL_GLAM_NATURAL_PRICE = '10,500';
var FULL_GLAM_STATEMENT_PRICE = '12,000';


/* The business's legal status or registered name, shown in all three policies. */
var LEGAL_ENTITY = '[Owner to confirm: sole trader / registered business name]';

/* Supabase Project URL, from Supabase > Project Settings > API. */
var SUPABASE_URL = '[PASTE SUPABASE URL]';

/* Supabase "anon public" key, from the same page. NEVER paste the service_role key
   or any other secret key here: the site refuses to use one. */
var SUPABASE_ANON_KEY = '[PASTE SUPABASE ANON KEY]';

/* The only account that can open the owner dashboard (#owner, or /owner on Hostinger). */
var OWNER_EMAIL = 'launthiawatson@yahoo.com';

/* Formspree form for Launthia's payment emails, e.g. 'https://formspree.io/f/abcdwxyz' (Formspree > the form >
   Integration; set the form to send to Launthiawatson@yahoo.com). Once it is filled in, Launthia gets an email
   each time a client says they have sent a bank transfer or Zelle payment, so she can check her account.
   It never includes the full account number or the client's email address. */
var FORMSPREE_FORM = '[PASTE FORMSPREE FORM LINK]';

/* Server side only. These are Supabase Edge Function secrets (Supabase > Project Settings >
   Edge Functions > Secrets). They must NEVER be pasted into this website:
     RESEND_API_KEY        the Resend API key (sending access only)
     ALERT_FROM            Glow by Launthia <alerts@[verified domain]>
     CONFIRM_FROM          Glow by Launthia <bookings@[verified domain]>
     ALERT_WEBHOOK_SECRET  a long random string, also added to the Database Webhook
     SITE_URL              https://glow-by-launthia.com (the domain, once it is bought) */

/* Booking calendar.
   - hours: opening hours for each day, like '9am-5pm', or 'closed'. Each booking is
     a 1-hour slot starting on the hour, so bookings are always 1 hour apart and the
     last start time is 1 hour before closing.
   - booked: start times already taken, by day (YYYY-MM-DD). Each one shows pale and
     can't be picked. A day with every time taken shows pale too.
   - fullDays: whole days that are full or off (YYYY-MM-DD). */
var BOOKING = {
  hours: {
    Monday:    '9am-5pm',
    Tuesday:   '9am-5pm',
    Wednesday: '9am-5pm',
    Thursday:  '9am-5pm',
    Friday:    '9am-5pm',
    Saturday:  '9am-5pm',
    Sunday:    'closed'
  },
  booked: {
    // '2026-12-19': ['10am', '2pm'],
  },
  fullDays: [
    // '2026-12-24',
  ],
  payLinks: {}
};

/* Shop Launthia's favourites (Amazon). A product shows once it has a name and a link;
   the Shop section stays hidden until at least one product (or the storefront link) is in.
   - STOREFRONT_URL: her Amazon storefront link, e.g. 'https://www.amazon.com/shop/...'
   - AMAZON_ASSOCIATE: true only once she is an approved Amazon Associate (shows the disclosure)
   - each product: category ('Face' | 'Eyes' | 'Lips' | 'Brushes & Tools' | 'Skin Prep'),
     name, note ("Why I love it"), url (Amazon product or affiliate link), optional image URL */
var STOREFRONT_URL = '';
var AMAZON_ASSOCIATE = false;
var PRODUCTS = [
  { category: 'Face',            name: '', note: '', url: '', image: '' },
  { category: 'Face',            name: '', note: '', url: '', image: '' },
  { category: 'Eyes',            name: '', note: '', url: '', image: '' },
  { category: 'Eyes',            name: '', note: '', url: '', image: '' },
  { category: 'Lips',            name: '', note: '', url: '', image: '' },
  { category: 'Lips',            name: '', note: '', url: '', image: '' },
  { category: 'Brushes & Tools', name: '', note: '', url: '', image: '' },
  { category: 'Brushes & Tools', name: '', note: '', url: '', image: '' },
  { category: 'Skin Prep',       name: '', note: '', url: '', image: '' },
  { category: 'Skin Prep',       name: '', note: '', url: '', image: '' }
];
/* ===== END OF SETTINGS ===== */
window.GLOW = (function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var root = document.documentElement;
root.lang = 'en';
var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
var COARSE = matchMedia('(pointer: coarse)').matches;
var LITE = COARSE || innerWidth < 768 || Math.min(innerWidth, innerHeight) < 600;
var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function mailHref(subject, t) { return 'https://mail.google.com/mail/?view=cm&fs=1&to=Launthiawatson@yahoo.com&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(t); }
function smsHref(t) { return 'sms:+18762778913' + (t ? (IOS ? '&' : '?') + 'body=' + encodeURIComponent(t) : ''); }
var DPR = Math.min(window.devicePixelRatio || 1, 2);
var HAS3 = typeof THREE !== 'undefined';
root.classList.add(HAS3 ? 'webgl' : 'no-webgl');
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var smooth = function (a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
var easeOut = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
var easeInOut = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
var yearEl = $('#year');
if (yearEl)
yearEl.textContent = String(new Date().getFullYear());
function noWebGL() { root.classList.remove('webgl'); root.classList.add('no-webgl'); }
function whenNear(el, fn) { if (!el || !window.IntersectionObserver) {
fn();
return;
} var io = new IntersectionObserver(function (en) { if (en.some(function (e) { return e.isIntersecting; })) {
io.disconnect();
fn();
} }, { rootMargin: '600px 0px' }); io.observe(el); }
function whenIdle(fn) { if (window.requestIdleCallback)
requestIdleCallback(fn, { timeout: 4000 });
else
setTimeout(fn, 1500); }
var loop = {
tasks: [], running: false, last: 0,
add: function (fn) { if (this.tasks.indexOf(fn) < 0)
this.tasks.push(fn); this.start(); },
remove: function (fn) { var i = this.tasks.indexOf(fn); if (i >= 0)
this.tasks.splice(i, 1); },
start: function () { if (this.running)
return; this.running = true; this.last = performance.now(); requestAnimationFrame(tick); }
};
var LEGAL_OPEN = false;
function tick(now) {
var dt = Math.min(0.05, Math.max(0.001, (now - loop.last) / 1000));
loop.last = now;
if (!LEGAL_OPEN && !window.GLOW_PAUSED)
for (var i = 0; i < loop.tasks.length; i++)
loop.tasks[i](dt, now / 1000);
if (loop.tasks.length)
requestAnimationFrame(tick);
else
loop.running = false;
}
var S = { y: window.scrollY || 0, vh: innerHeight, vw: innerWidth, mx: innerWidth / 2, my: innerHeight / 2 };
addEventListener('scroll', function () { S.y = window.scrollY; }, { passive: true });
addEventListener('pointermove', function (e) { S.mx = e.clientX; S.my = e.clientY; }, { passive: true });
var MEDIA = {}, imgCache = {}, mediaWaiters = [];
function mediaImage(key) {
var im = imgCache[key];
if (!im) {
im = new Image();
im.decoding = 'async';
im.dataset.key = key;
if (MEDIA[key] && MEDIA[key].slice(0, 5) !== 'data:')
im.crossOrigin = 'anonymous';
if (MEDIA[key])
im.src = MEDIA[key];
imgCache[key] = im;
}
else if (!im.getAttribute('src') && MEDIA[key])
im.src = MEDIA[key];
return im;
}
function loaded(img) {
return new Promise(function (res) {
if (img.complete && img.naturalWidth)
return res(img);
img.addEventListener('load', function () { res(img); }, { once: true });
img.addEventListener('error', function () { res(img); }, { once: true });
});
}
function onMedia(fn) { if (Object.keys(MEDIA).length)
fn();
else
mediaWaiters.push(fn); }
function mediaReady(map) {
for (var k in map)
MEDIA[k] = map[k];
$$('img[data-media]').forEach(function (el) { var k = el.dataset.media; if (MEDIA[k]) {
el.dataset.key = k;
el.src = MEDIA[k];
if (!imgCache[k] && el.getAttribute('loading') !== 'lazy')
imgCache[k] = el;
} });
for (var ck in imgCache)
if (!imgCache[ck].getAttribute('src') && MEDIA[ck])
imgCache[ck].src = MEDIA[ck];
$$('video[data-media]').forEach(function (v) {
if (MEDIA[v.dataset.poster])
v.poster = MEDIA[v.dataset.poster];
if (MEDIA[v.dataset.media])
v.src = MEDIA[v.dataset.media];
v.addEventListener('error', function retry() {
v.removeEventListener('error', retry);
try {
var s = MEDIA[v.dataset.media], b = atob(s.split(',')[1]), u = new Uint8Array(b.length);
for (var i = 0; i < b.length; i++)
u[i] = b.charCodeAt(i);
v.src = URL.createObjectURL(new Blob([u], { type: 'video/mp4' }));
}
catch (e) { }
});
});
var w = mediaWaiters;
mediaWaiters = [];
w.forEach(function (f) { f(); });
}
var NOISE = [
'vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }',
'float snoise(vec2 v){',
' const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
' vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);',
' vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
' vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);',
' vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
' vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0); m = m*m; m = m*m;',
' vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;',
' m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);',
' vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
' return 130.0 * dot(m, g); }'
].join('\n');
var VS_QUAD = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
var FS_BG = [
'precision highp float;',
'varying vec2 vUv;',
'uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uMouseAmt; uniform float uIntro;',
NOISE,
'float fbm(vec2 p){ float f = 0.0, a = 0.5; for (int i = 0; i < OCT; i++){ f += a * snoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return f; }',
'void main(){',
' float asp = uRes.x / uRes.y;',
' vec2 p = (vUv - 0.5) * vec2(asp, 1.0);',
' float t = uTime * 0.035;',
' vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);',
' vec2 dm = p - m; float md = dot(dm, dm);',
' p -= dm * exp(-md * 4.0) * 0.22 * uMouseAmt;',
' vec2 q = vec2(fbm(p * 0.45 + vec2(0.0, t)), fbm(p * 0.45 + vec2(5.2, 1.3) - t * 0.8));',
' vec2 r = vec2(fbm(p * 0.55 + 1.2 * q + vec2(1.7, 9.2) + t * 1.1), fbm(p * 0.55 + 1.2 * q + vec2(8.3, 2.8) - t));',
' float h = fbm(p * 0.5 + 1.2 * r);',
' float fold = sin(h * 3.4 + r.x * 1.6 + t * 1.2);',
' float s = 0.5 + 0.5 * fold;',
' vec3 ivory = vec3(0.969, 0.949, 0.925);',
' vec3 cream = vec3(0.937, 0.902, 0.855);',
' vec3 sand = vec3(0.851, 0.784, 0.706);',
' vec3 nude = vec3(0.788, 0.663, 0.557);',
' vec3 taupe = vec3(0.639, 0.549, 0.478);',
' vec3 col = mix(sand, cream, smoothstep(0.08, 0.6, s));',
' col = mix(col, ivory, smoothstep(0.55, 0.95, s));',
' col = mix(col, nude, smoothstep(0.3, 0.0, s) * 0.32);',
' col = mix(col, taupe, smoothstep(0.08, 0.0, s) * 0.14);',
' col += vec3(1.0, 0.995, 0.98) * pow(s, 8.0) * 0.12;',
' col = mix(col, ivory, 0.16);',
' col = mix(col, ivory, exp(-md * 6.0) * 0.22 * uMouseAmt);',
' vec2 vv = (vUv - vec2(0.5, 0.55)) * vec2(1.0, 1.1);',
' col = mix(col, sand, smoothstep(0.5, 1.15, length(vv)) * 0.35);',
' col = mix(ivory, col, uIntro);',
' gl_FragColor = vec4(col, 1.0);',
'}'
].join('\n');
var FS_COMP = [
'precision highp float;',
'varying vec2 vUv;',
'uniform sampler2D tBg; uniform sampler2D tText;',
'uniform vec4 uRect; uniform vec2 uRes; uniform vec2 uMouse;',
'uniform float uMouseAmt; uniform float uTime; uniform float uReveal; uniform float uHasText; uniform float uRectAsp;',
'uniform float uTextAmt; uniform float uFade;',
'uniform sampler2D tPhoto; uniform float uPhoto; uniform vec4 uPhotoRect; uniform float uPhotoWide; uniform vec4 uFace;',
'uniform float uHeader; uniform vec4 uPhotoRectH; uniform float uPhotoWideH; uniform vec4 uFaceH; uniform vec4 uClearA; uniform vec4 uClearB;',
'float clearPatch(vec2 uv, vec4 r){ if (r.z <= 0.0) return 0.0; vec2 q = abs(uv - (r.xy + r.zw * 0.5)) / (r.zw * 0.5 + vec2(0.08, 0.035)); return 1.0 - smoothstep(0.6, 1.0, pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25)); }',
NOISE,
'vec3 photoLayer(vec2 uv){',
' vec2 p = (uv - uPhotoRect.xy) / uPhotoRect.zw;',
' vec3 fill = vec3(0.333, 0.216, 0.153) * mix(0.92, 1.02, uv.y);',
' vec3 ph = texture2D(tPhoto, clamp(p, 0.0, 1.0)).rgb;',
' float a = step(0.0, p.y) * step(p.y, 1.0);',
' a *= uPhotoWide > 0.0 ? smoothstep(0.0, uPhotoWide, p.x) * smoothstep(0.0, uPhotoWide, 1.0 - p.x) : step(0.0, p.x) * step(p.x, 1.0);',
' vec3 c = mix(fill, ph, a);',
' float k = 0.2 + 0.34 * smoothstep(0.5, 0.0, uv.y) + 0.12 * smoothstep(0.8, 1.0, uv.y);',
' return mix(c, vec3(0.09, 0.06, 0.045), k);',
'}',
'vec3 photoHeader(vec2 uv, vec3 bg){',
' vec2 p = (uv - uPhotoRectH.xy) / uPhotoRectH.zw;',
' vec3 fill = vec3(0.333, 0.216, 0.153) * mix(0.9, 1.03, uv.y);',
' vec3 ph = texture2D(tPhoto, clamp(p, 0.0, 1.0)).rgb;',
' float a = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);',
' if (uPhotoWideH > 1.5) {',
'  float e = a * smoothstep(0.0, 0.22, p.x) * smoothstep(1.0, 0.8, p.y) * smoothstep(1.0, 0.93, p.x) * smoothstep(0.0, 0.07, p.y);',
'  float vp = 0.1 + 0.64 * smoothstep(0.36, 0.15, uv.y) + 0.3 * smoothstep(0.86, 0.97, uv.y);',
'  vp = max(vp, 0.8 * max(clearPatch(uv, uClearA), clearPatch(uv, uClearB)));',
'  return mix(bg, mix(ph, bg, clamp(vp, 0.0, 0.88)), e);',
' }',
' float v;',
' if (uPhotoWideH > 0.5) {',
'  a *= smoothstep(0.0, 0.3, p.x);',
'  v = 0.12 + 0.62 * (1.0 - smoothstep(uPhotoRectH.x - 0.04, uPhotoRectH.x + uPhotoRectH.z * 0.4, uv.x));',
'  v += 0.22 * smoothstep(0.3, 0.04, uv.y);',
' } else {',
'  v = 0.36 + 0.3 * smoothstep(0.47, 0.12, uv.y) + 0.26 * smoothstep(0.8, 0.93, uv.y);',
' }',
' return mix(mix(fill, ph, a), bg, clamp(v, 0.0, 0.88));',
'}',
'float oval(vec2 uv, vec4 rect, vec4 face){ vec2 d = ((uv - rect.xy) / rect.zw - face.xy) / face.zw; return 1.0 - smoothstep(0.72, 1.12, length(d)); }',
'float faceMask(vec2 uv){ return mix(0.5 * oval(uv, uPhotoRect, uFace), 0.94 * oval(uv, uPhotoRectH, uFaceH), uHeader) * uPhoto; }',
'vec3 scene(vec2 uv){',
' vec3 c = mix(vec3(0.09, 0.06, 0.045), photoLayer(uv), uPhoto);',
' if (uHeader > 0.001) { vec3 bg = texture2D(tBg, uv).rgb; c = mix(c, uPhoto > 0.001 ? mix(bg, photoHeader(uv, bg), uPhoto) : bg, uHeader); }',
' return c;',
'}',
'vec3 env(vec3 r){',
' float y = r.y + 0.05 * sin(r.x * 4.0 + uTime * 0.25);',
' vec3 skyLo = vec3(1.0, 0.99, 0.97); vec3 skyHi = vec3(0.86, 0.81, 0.75);',
' vec3 sky = mix(skyLo, skyHi, smoothstep(0.02, 0.65, y));',
' vec3 gnd = mix(vec3(0.72, 0.64, 0.56), vec3(0.45, 0.36, 0.29), smoothstep(0.0, -0.42, y));',
' vec3 c = mix(gnd, sky, smoothstep(-0.014, 0.014, y));',
' c += vec3(1.0) * exp(-abs(y - 0.015) * 55.0) * 0.3;',
' c += vec3(1.0, 0.99, 0.97) * smoothstep(0.07, 0.0, abs(r.x + 0.42)) * smoothstep(-0.05, 0.3, y) * 0.35;',
' c += vec3(1.0, 0.98, 0.95) * smoothstep(0.045, 0.0, abs(r.x - 0.58)) * 0.25;',
' return c;',
'}',
'void main(){',
' vec2 uv = vUv;',
' vec3 col = scene(uv);',
' if (uHasText > 0.5) {',
'  vec2 tuv = (uv - uRect.xy) / uRect.zw;',
'  if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {',
'   vec4 tx = texture2D(tText, tuv);',
'   float n = snoise(tuv * vec2(7.0, 3.0) + uTime * 0.3);',
'   float edge = tuv.x * 0.88 + (1.0 - tuv.y) * 0.1 + n * 0.03;',
'   float vis = smoothstep(edge, edge + 0.1, uReveal * 1.25 - 0.08);',
'   float behind = 1.0 - faceMask(uv);',
'   float sh = texture2D(tText, tuv + vec2(-0.004, 0.06)).a;',
'   col = mix(col, vec3(0.43, 0.34, 0.27), sh * 0.2 * vis * uTextAmt * behind);',
'   col = mix(col, vec3(1.0, 0.99, 0.97), tx.a * 0.12 * vis * uTextAmt * behind);',
'   float mask = smoothstep(0.32, 0.68, tx.b) * vis * uTextAmt * behind;',
'   if (mask > 0.002) {',
'    vec3 nrm = vec3(tx.rg * 2.0 - 1.0, 0.0);',
'    vec2 w = vec2(snoise(tuv * vec2(5.0, 2.2) + vec2(uTime * 0.11, 0.0)), snoise(tuv * vec2(5.0, 2.2) + vec2(3.1, uTime * 0.09)));',
'    nrm.xy += w * 0.07;',
'    nrm.z = sqrt(max(1.0 - dot(nrm.xy, nrm.xy), 0.03));',
'    nrm = normalize(nrm);',
'    vec3 V = normalize(vec3((tuv - vec2(0.5, 0.46)) * vec2(uRectAsp, 1.0) * 0.32, -1.0));',
'    vec3 R = reflect(V, nrm);',
'    vec3 e = env(R);',
'    float lum = dot(e, vec3(0.333));',
'    vec3 tint = mix(vec3(0.9, 0.82, 0.68), vec3(1.0, 0.985, 0.96), smoothstep(0.6, 0.97, lum));',
'    vec3 chrome = e * tint;',
'    chrome += snoise(vec2(tuv.x * 3.0, tuv.y * 320.0)) * 0.028;',
'    chrome *= mix(0.74, 1.0, smoothstep(0.25, 0.9, nrm.z));',
'    vec3 refr = scene(uv + nrm.xy * 0.04);',
'    chrome = mix(chrome, refr * 0.96, 0.12);',
'    vec2 mp = (uMouse - uv) * vec2(uRes.x / uRes.y, 1.0);',
'    vec3 L = normalize(vec3(mp, 0.32));',
'    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));',
'    chrome += vec3(1.0, 0.99, 0.97) * pow(max(dot(nrm, H), 0.0), 70.0) * 0.45 * uMouseAmt;',
'    float cyc = mod(uTime - 2.6, 8.0);',
'    float sw = cyc / 3.2 * 1.7 - 0.35;',
'    float sd = (tuv.x + (1.0 - tuv.y) * 0.32) - sw;',
'    chrome += vec3(1.0, 0.99, 0.97) * exp(-sd * sd * 60.0) * step(cyc, 3.2) * (0.3 + 0.7 * nrm.z) * 0.42;',
'    float molten = vis * (1.0 - vis) * 4.0;',
'    chrome += vec3(0.78, 0.69, 0.54) * molten * 0.25;',
'    col = mix(col, chrome, mask);',
'   }',
'  }',
' }',
' float g = fract(sin(dot(uv * uRes + fract(uTime * 7.0) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);',
' col += (g - 0.5) * 0.018;',
' col = mix(col, mix(vec3(0.937, 0.902, 0.855), col, smoothstep(0.0, 0.14, uv.y)), uHeader);',
' col = mix(col, vec3(0.969, 0.949, 0.925), uFade);',
' gl_FragColor = vec4(col, 1.0);',
'}'
].join('\n');
var VS_PARTICLES = [
'attribute vec3 aSeed;',
'uniform float uTime; uniform float uPR; uniform float uSize; uniform float uSpan; uniform vec2 uMouse; uniform float uAspect; uniform float uIntro;',
'varying float vAlpha; varying float vHot;',
'void main(){',
' vec3 p = position;',
' float t = uTime;',
' p.y = mod(p.y + t * (0.05 + aSeed.y * 0.12) + uSpan * 0.5, uSpan) - uSpan * 0.5;',
' p.x += sin(t * 0.35 * aSeed.y + aSeed.x * 6.283) * 0.22;',
' p.z += cos(t * 0.28 * aSeed.y + aSeed.x * 4.0) * 0.18;',
' vec4 mv = modelViewMatrix * vec4(p, 1.0);',
' vec4 clip = projectionMatrix * mv;',
' vec2 ndc = clip.xy / clip.w;',
' vec2 d = (ndc - uMouse) * vec2(uAspect, 1.0);',
' float l = length(d);',
' float f = smoothstep(0.42, 0.0, l);',
' mv.xy += normalize(d + 1e-4) * f * (-mv.z) * 0.07;',
' gl_Position = projectionMatrix * mv;',
' float tw = 0.5 + 0.5 * sin(t * (1.2 + aSeed.y * 2.0) + aSeed.x * 40.0);',
' gl_PointSize = uSize * aSeed.z * uPR * (1.0 + f * 0.9) / -mv.z;',
' vAlpha = (0.25 + 0.75 * tw) * uIntro * smoothstep(16.0, 6.0, -mv.z);',
' vHot = f;',
'}'
].join('\n');
var FS_PARTICLES = [
'precision mediump float;',
'varying float vAlpha; varying float vHot;',
'void main(){',
' vec2 c = gl_PointCoord - 0.5; float d = length(c);',
' float core = smoothstep(0.5, 0.0, d);',
' float a = pow(core, 2.2) * vAlpha * 0.6 * (1.0 + vHot * 0.6);',
' vec3 col = mix(vec3(0.64, 0.55, 0.48), vec3(0.78, 0.69, 0.54), core);',
' gl_FragColor = vec4(col, a);',
'}'
].join('\n');
var FS_PORTRAIT = [
'precision highp float;',
'varying vec2 vUv;',
'uniform sampler2D tMap; uniform vec2 uImg; uniform vec2 uSize; uniform float uRadius; uniform float uReady;',
'float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
'void main(){',
' float rb = uSize.x / uSize.y; float ri = uImg.x / uImg.y;',
' vec2 s = rb > ri ? vec2(1.0, ri / rb) : vec2(rb / ri, 1.0);',
' vec2 uv = (vUv - 0.5) * s + vec2(0.5, 0.5 + (1.0 - s.y) * 0.2);',
' vec3 c = texture2D(tMap, uv).rgb;',
' vec2 p = (vUv - 0.5) * uSize;',
' float d = sdRound(p, uSize * 0.5, uRadius);',
' float a = 1.0 - smoothstep(-1.0, 0.5, d);',
' float line = 1.0 - smoothstep(0.4, 1.2, abs(d + 14.0));',
' c = mix(c, vec3(1.0, 0.99, 0.97), line * 0.75);',
' gl_FragColor = vec4(c, a * uReady);',
'}'
].join('\n');
var VS_PLANE = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
function makeRenderer(canvas, opts) {
try {
var r = new THREE.WebGLRenderer(Object.assign({ canvas: canvas, powerPreference: 'high-performance', stencil: false }, opts));
r.setPixelRatio(DPR);
return r;
}
catch (e) {
return null;
}
}
function studioEnv(renderer, opts) {
opts = opts || {};
var scene = new THREE.Scene();
var top = new THREE.Color(opts.top || 0xf7f2ec), mid = new THREE.Color(opts.mid || 0xc9b8a6), bot = new THREE.Color(opts.bot || 0x5a4638);
var skyGeo = new THREE.SphereGeometry(20, 32, 24), sp = skyGeo.attributes.position, cols = new Float32Array(sp.count * 3), tmp = new THREE.Color();
for (var i = 0; i < sp.count; i++) {
var y = sp.getY(i) / 20;
if (y > 0)
tmp.copy(mid).lerp(top, smooth(0, 0.8, y));
else
tmp.copy(mid).lerp(bot, smooth(0, 0.5, -y));
cols[i * 3] = tmp.r;
cols[i * 3 + 1] = tmp.g;
cols[i * 3 + 2] = tmp.b;
}
skyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
var skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, toneMapped: false });
var geoms = [skyGeo], mats = [skyMat];
scene.add(new THREE.Mesh(skyGeo, skyMat));
(opts.panels || [
[5.5, 3.4, -6, 4.5, 6, 3.0, 0xfffaf4],
[1.0, 10, 7.5, 0.5, -1.5, 5.0, 0xfff7ee],
[0.8, 10, -7.5, 0, -2.5, 3.0, 0xfff4ea],
[7, 7, 0, 10, 0, 1.3, 0xffffff],
[9, 2.2, 0, -6, 5, 0.5, 0xd9c8b4]
]).forEach(function (p) {
var m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p[6]).multiplyScalar(p[5]), side: THREE.DoubleSide, toneMapped: false });
var mesh = new THREE.Mesh(new THREE.PlaneGeometry(p[0], p[1]), m);
mesh.position.set(p[2], p[3], p[4]);
mesh.lookAt(0, 0, 0);
geoms.push(mesh.geometry);
mats.push(m);
scene.add(mesh);
});
var pm = new THREE.PMREMGenerator(renderer);
var tex = pm.fromScene(scene, 0.03).texture;
pm.dispose();
geoms.forEach(function (g) { g.dispose(); });
mats.forEach(function (m) { m.dispose(); });
return tex;
}
function whenFont(spec) {
if (!document.fonts || !document.fonts.load)
return Promise.resolve(false);
var timeout = new Promise(function (res) { setTimeout(function () { res(false); }, 3000); });
var load = document.fonts.ready.then(function () { return document.fonts.load(spec); }).then(function () { return document.fonts.check(spec); }).catch(function () { return false; });
return Promise.race([load, timeout]);
}
function initHero() {
var section = $('#hero'), canvas = $('#hero-canvas'), word = $('#hero-word'), anchor = $('#hero-object');
var renderer = makeRenderer(canvas, { antialias: true, alpha: false });
if (!renderer) {
noWebGL();
return null;
}
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
renderer.setClearColor(0xf7f2ec, 1);
var pr = renderer.getPixelRatio();
var bgScale = LITE ? 0.34 : 0.5;
var MQ_WIDE = matchMedia('(min-width: 900px) and (min-aspect-ratio: 23/20)');
var ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
var quad = new THREE.PlaneGeometry(2, 2);
var bgMat = new THREE.ShaderMaterial({
defines: { OCT: 3 },
uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uMouseAmt: { value: 0 }, uIntro: { value: REDUCED ? 1 : 0 } },
vertexShader: VS_QUAD, fragmentShader: FS_BG, depthTest: false, depthWrite: false
});
var bgScene = new THREE.Scene();
bgScene.add(new THREE.Mesh(quad, bgMat));
var bgRT = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
var blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
blank.needsUpdate = true;
var compMat = new THREE.ShaderMaterial({
uniforms: { tBg: { value: bgRT.texture }, tText: { value: blank }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uMouseAmt: { value: 0 }, uTime: { value: 0 }, uReveal: { value: REDUCED ? 1 : 0 }, uHasText: { value: 0 }, uRectAsp: { value: 3 }, uTextAmt: { value: 1 }, uFade: { value: 0 }, tPhoto: { value: null }, uPhoto: { value: 0 }, uPhotoRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uPhotoWide: { value: 0 }, uFace: { value: new THREE.Vector4(0.575, 0.58, 0.13, 0.17) }, uHeader: { value: 0 }, uPhotoRectH: { value: new THREE.Vector4(0, 0, 1, 1) }, uPhotoWideH: { value: 0 }, uClearA: { value: new THREE.Vector4(0, 0, 0, 0) }, uClearB: { value: new THREE.Vector4(0, 0, 0, 0) }, uFaceH: { value: new THREE.Vector4(0.57, 0.615, 0.15, 0.215) } },
vertexShader: VS_QUAD, fragmentShader: FS_COMP, depthTest: false, depthWrite: false
});
var compScene = new THREE.Scene();
compScene.add(new THREE.Mesh(quad, compMat));
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 10);
scene.environment = studioEnv(renderer);
var keyLight = new THREE.PointLight(0xfff6ec, 0.6, 30);
keyLight.position.set(2, 2, 4);
scene.add(keyLight);
var seg = LITE ? 96 : 160;
var gold = new THREE.MeshPhysicalMaterial({ color: lin('#D9C29C'), metalness: 1, roughness: 0.2, envMapIntensity: 1.15 });
var goldSatin = new THREE.MeshPhysicalMaterial({ color: lin('#CDB48E'), metalness: 1, roughness: 0.36, envMapIntensity: 1.1 });
var lacquer = new THREE.MeshPhysicalMaterial({ color: lin('#EFE6DA'), metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.0 });
var rouge = new THREE.MeshPhysicalMaterial({ color: lin('#C9A98E'), metalness: 0, roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3 });
function lathe(pts, mat, side) {
var g = new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg);
var m = new THREE.Mesh(g, mat);
if (side) {
m.material = mat.clone();
m.material.side = side;
}
return m;
}
var product = new THREE.Group();
var spin = new THREE.Group();
product.add(spin);
var body = new THREE.Group();
spin.add(body);
body.position.y = -2.02;
body.add(lathe([[0, 0], [0.42, 0], [0.462, 0.008], [0.478, 0.03], [0.48, 0.06], [0.48, 0.112], [0.47, 0.132], [0.455, 0.142]], gold));
body.add(lathe([[0.455, 0.142], [0.461, 0.152], [0.461, 1.12], [0.455, 1.132]], lacquer));
body.add(lathe([[0.455, 1.132], [0.47, 1.137], [0.482, 1.152], [0.482, 1.198], [0.474, 1.212], [0.474, 1.226], [0.482, 1.238], [0.482, 1.29], [0.47, 1.304], [0.43, 1.31], [0.415, 1.316]], gold));
body.add(lathe([[0.415, 1.316], [0.404, 1.33], [0.398, 1.36], [0.398, 1.69], [0.39, 1.712], [0.37, 1.72], [0.34, 1.718]], goldSatin));
(function () {
var g = new THREE.CylinderGeometry(0.335, 0.335, 1.15, seg, 36, false);
g.translate(0, 1.6 + 0.575, 0);
var pos = g.attributes.position;
for (var i = 0; i < pos.count; i++) {
var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
var top = 2.37 - 0.3 * (x / 0.335);
if (y > top)
pos.setY(i, top);
else {
var d = top - y;
if (d < 0.06) {
var k = 1 - Math.pow(1 - d / 0.06, 2) * 0.045;
pos.setX(i, x * k);
pos.setZ(i, z * k);
}
}
}
g.computeVertexNormals();
body.add(new THREE.Mesh(g, rouge));
})();
(function () {
var c = document.createElement('canvas');
c.width = 512;
c.height = 128;
var x = c.getContext('2d');
x.fillStyle = '#000';
x.fillRect(0, 0, 512, 128);
x.fillStyle = '#fff';
x.font = '700 78px "Hanken Grotesk", Arial, sans-serif';
x.textAlign = 'center';
x.textBaseline = 'middle';
var letters = 'GLOW'.split(''), track = 34, total = 0;
letters.forEach(function (l) { total += x.measureText(l).width + track; });
total -= track;
var px = 256 - total / 2;
letters.forEach(function (l) { var w = x.measureText(l).width; x.fillText(l, px + w / 2, 68); px += w + track; });
var t = new THREE.CanvasTexture(c);
var m = new THREE.MeshPhysicalMaterial({ color: lin('#C8B08A'), metalness: 1, roughness: 0.22, alphaMap: t, transparent: true, depthWrite: false });
var g = new THREE.CylinderGeometry(0.4635, 0.4635, 0.15, 64, 1, true, -0.62, 1.24);
var mesh = new THREE.Mesh(g, m);
mesh.position.y = 0.66;
body.add(mesh);
})();
var cap = new THREE.Group();
spin.add(cap);
cap.add(lathe([[0.462, 0], [0.488, 0.006], [0.494, 0.03], [0.494, 0.11], [0.487, 0.122]], gold));
cap.add(lathe([[0.487, 0.122], [0.491, 0.132], [0.491, 0.95], [0.486, 0.962]], lacquer));
cap.add(lathe([[0.486, 0.962], [0.494, 0.978], [0.494, 1.05], [0.482, 1.085], [0.45, 1.1], [0, 1.106]], gold));
cap.add(lathe([[0, 1.0], [0.44, 1.0], [0.44, 0.02], [0.462, 0]], lacquer, THREE.DoubleSide));
var capBase = new THREE.Vector3(0.34, 0.86, 0);
cap.position.copy(capBase);
cap.rotation.set(0.12, 0, -0.34);
var ring = new THREE.Group();
product.add(ring);
ring.position.y = -0.95;
ring.rotation.set(0.3, 0, -0.1);
var ringTex = null;
function buildRing() {
var R = 1.3, bandH = 0.19;
var W = LITE ? 3072 : 4096, Hc = Math.round(W * bandH / (2 * Math.PI * R));
var c = document.createElement('canvas');
c.width = W;
c.height = Hc;
var x = c.getContext('2d');
var phrase = 'FULL GLAM • SOFT GLAM • BRIDAL GLAM • '.split('');
var fs = Hc * 0.6;
x.font = '500 ' + fs + 'px "Hanken Grotesk", Arial, sans-serif';
var track = fs * 0.32, unit = 0;
phrase.forEach(function (ch) { unit += x.measureText(ch).width + track; });
var reps = Math.max(1, Math.round(W / unit)), sx = W / (unit * reps);
x.fillStyle = '#fff';
x.textBaseline = 'middle';
var px = 0;
for (var r = 0; r < reps; r++)
phrase.forEach(function (ch) { x.fillText(ch, px, Hc / 2 + fs * 0.05); px += (x.measureText(ch).width + track) * sx; });
if (ringTex)
ringTex.dispose();
ringTex = new THREE.CanvasTexture(c);
ringTex.encoding = THREE.sRGBEncoding;
ringTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
while (ring.children.length)
ring.remove(ring.children[0]);
var g = new THREE.CylinderGeometry(R, R, bandH, LITE ? 96 : 160, 1, true);
var back = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: ringTex, color: lin('#A38C7A'), transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
var front = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: ringTex, color: lin('#6E5646'), transparent: true, opacity: 0, side: THREE.FrontSide, depthWrite: false, toneMapped: false }));
back.renderOrder = 1;
front.renderOrder = 3;
ring.add(back);
ring.add(front);
ring.userData.front = front.material;
ring.userData.back = back.material;
}
buildRing();
scene.add(product);
var COUNT = LITE ? 520 : 1500, SPAN = 8;
var pg = new THREE.BufferGeometry();
var pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT * 3);
for (var i = 0; i < COUNT; i++) {
pos[i * 3] = (Math.random() - 0.5) * 12;
pos[i * 3 + 1] = (Math.random() - 0.5) * SPAN;
pos[i * 3 + 2] = (Math.random() - 0.5) * 7 - 0.5;
seed[i * 3] = Math.random();
seed[i * 3 + 1] = Math.random();
seed[i * 3 + 2] = Math.random() < 0.05 ? 3 + Math.random() * 3 : 0.5 + Math.random() * 1.3;
}
pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
var pMat = new THREE.ShaderMaterial({
uniforms: { uTime: { value: 0 }, uPR: { value: pr }, uSize: { value: 24 }, uSpan: { value: SPAN }, uMouse: { value: new THREE.Vector2(9, 9) }, uAspect: { value: 1 }, uIntro: { value: REDUCED ? 1 : 0 } },
vertexShader: VS_PARTICLES, fragmentShader: FS_PARTICLES, transparent: true, depthWrite: false, blending: THREE.NormalBlending
});
var points = new THREE.Points(pg, pMat);
points.frustumCulled = false;
points.renderOrder = 2;
scene.add(points);
var PHOTO_FACE = { l: 0.44, r: 0.70, t: 0.19, b: 0.58 }, PHOTO_CORE = { l: 0.47, r: 0.68, t: 0.29, b: 0.55 };
var photo = { tex: null, asp: 1023 / 1280 }, navEl = $('#nav');
compMat.uniforms.tPhoto.value = blank;
onMedia(function () {
var im = mediaImage('hero-portrait');
loaded(im).then(function () {
if (!im.naturalWidth)
return;
var t = new THREE.Texture(im), gl2 = renderer.capabilities.isWebGL2;
t.generateMipmaps = gl2;
t.minFilter = gl2 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
t.magFilter = THREE.LinearFilter;
t.needsUpdate = true;
photo.tex = t;
photo.asp = im.naturalWidth / im.naturalHeight;
compMat.uniforms.tPhoto.value = t;
layoutPhoto();
layoutPhotoHeader();
state.needs = true;
});
});
function layoutPhoto() {
var u = compMat.uniforms, asp = W / H, pa = photo.asp, navB = navEl ? navEl.offsetHeight : 64, obs = [], best = null;
['.hero-ctas', '.hero-tag', '.hero-by'].forEach(function (sel) { var el = $(sel, section); if (el) {
var r = rel(el);
if (r.w)
obs.push([r.x, r.y, r.x + r.w, r.y + r.h]);
} });
var pb = product.userData.base, ps = product.userData.scale;
if (pb && ps) {
var vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wpp = vh / H, cx = W / 2 + pb.x / wpp, cy = H / 2 - pb.y / wpp;
obs.push([cx - 0.62 * ps / wpp, cy - 2.1 * ps / wpp, cx + 0.95 * ps / wpp, cy + 2.15 * ps / wpp]);
}
function area(a, b) { var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return w > 0 && h > 0 ? w * h : 0; }
for (var z = 1; z <= 1.42; z += 0.05) {
var w = asp < pa ? pa / asp * z : z, h = asp < pa ? z : asp / pa * z;
if ((PHOTO_FACE.b - PHOTO_FACE.t) * h * H > H - navB - 16)
break;
for (var i = 0; i <= 12; i++)
for (var j = 0; j <= 12; j++) {
var ox = (w - 1) * i / 12, oy = (h - 1) * j / 12;
var face = [(PHOTO_FACE.l * w - ox) * W, (PHOTO_FACE.t * h - oy) * H, (PHOTO_FACE.r * w - ox) * W, (PHOTO_FACE.b * h - oy) * H];
if (face[0] < 8 || face[2] > W - 8 || face[1] < navB + 4 || face[3] > H - 8)
continue;
var core = [(PHOTO_CORE.l * w - ox) * W, (PHOTO_CORE.t * h - oy) * H, (PHOTO_CORE.r * w - ox) * W, (PHOTO_CORE.b * h - oy) * H], score = 0;
for (var q = 0; q < obs.length; q++)
score += area(face, obs[q]) + 3 * area(core, obs[q]);
score = score / (W * H) + (z - 1) * 0.02 + Math.abs((face[0] + face[2]) / 2 / W - 0.5) * 0.004;
if (!best || score < best.score)
best = { score: score, w: w, h: h, ox: ox, oy: oy, f: 0 };
if (h === 1 && w === 1)
break;
}
}
if (!best) {
var hh = Math.max(1, (H - navB - 24) / H / (PHOTO_FACE.b - PHOTO_FACE.t)), ww = hh * pa / asp;
best = { w: ww, h: hh, ox: -(0.62 - (PHOTO_FACE.l + PHOTO_FACE.r) / 2 * ww), oy: clamp(PHOTO_FACE.t * hh - (navB + 12) / H, 0, hh - 1), f: ww < 1 ? 0.14 : 0 };
}
u.uPhotoRect.value.set(-best.ox, 1 + best.oy - best.h, best.w, best.h);
u.uPhotoWide.value = best.f;
}
function layoutPhotoPhone() {
var u = compMat.uniforms, pa = photo.asp, navB = navEl ? navEl.offsetHeight : 64, hard = [], soft = [], best = null, least = null;
function box(el, pad) { if (!el)
return null; var r = rel(el); return r.w ? [r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad] : null; }
function area(a, b) { var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return w > 0 && h > 0 ? w * h : 0; }
[box(word, 4), box($('.hero-by', section), 8)].forEach(function (b) { if (b)
hard.push(b); });
var pb = product.userData.base, ps = product.userData.scale;
if (pb && ps) {
var vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wpp = vh / H, cx = W / 2 + pb.x / wpp, cy = H / 2 - pb.y / wpp;
hard.push([cx - 1.1 * ps / wpp, cy - 2.15 * ps / wpp, cx + 1.1 * ps / wpp, cy + 2.2 * ps / wpp]);
}
['.hero-eyebrow', '.hero-hint', '.hero-tag', '.hero-ctas', '.hero-meta'].forEach(function (sel) { var b = box($(sel, section), 4); if (b)
soft.push(b); });
for (var h = H * 1.1; h >= H * 0.4; h -= H * 0.02) {
var w = h * pa, fw = (PHOTO_FACE.r - PHOTO_FACE.l) * w, fh = (PHOTO_FACE.b - PHOTO_FACE.t) * h, found = null;
if (fw > W - 12 || fh > H - navB - 8)
continue;
for (var i = 0; i <= 32; i++)
for (var j = 0; j <= 32; j++) {
var fx = 6 + (W - 12 - fw) * i / 32, fy = navB + 4 + (H - navB - 8 - fh) * j / 32, face = [fx, fy, fx + fw, fy + fh], hit = 0, sc = 0, q;
for (q = 0; q < hard.length; q++)
hit += area(face, hard[q]);
var px = fx - PHOTO_FACE.l * w, py = fy - PHOTO_FACE.t * h;
if (hit > 0) {
if (!least || hit < least.hit)
least = { hit: hit, px: px, py: py, w: w, h: h };
continue;
}
for (q = 0; q < soft.length; q++)
sc += area(face, soft[q]);
sc = sc / (fw * fh) + (px + w < W - 1 ? 0.3 : 0) + (py + h < H - 1 ? 0.15 : 0);
if (!found || sc < found.sc)
found = { sc: sc, px: px, py: py, w: w, h: h };
}
if (found && (!best || found.sc < best.sc - 0.05))
best = found;
if (best && best.sc < 0.08)
break;
}
best = best || least;
if (!best)
return false;
u.uPhotoRectH.value.set(best.px / W, 1 - (best.py + best.h) / H, best.w / W, best.h / H);
u.uPhotoWideH.value = 2;
[[u.uClearA, $('.hero-by', section)], [u.uClearB, $('.hero-tag', section)]].forEach(function (c) {
var r = c[1] ? rel(c[1]) : null;
if (r && r.w)
c[0].value.set((r.x - 6) / W, 1 - (r.y + r.h + 4) / H, (r.w + 12) / W, (r.h + 8) / H);
else
c[0].value.set(0, 0, 0, 0);
});
return true;
}
function layoutPhotoHeader() {
var u = compMat.uniforms, asp = W / H, pa = photo.asp;
if (!MQ_WIDE.matches && W < 760 && layoutPhotoPhone())
return;
if (MQ_WIDE.matches) {
var pw = pa / asp, r = rel(word), wr = (r.x + r.w) / W;
var shift = clamp(wr + 0.02 - (1 - pw) - PHOTO_FACE.l * pw, 0, Math.max(0, (0.97 - PHOTO_FACE.r) * pw));
u.uPhotoRectH.value.set(1 - pw + shift, 0, pw, 1);
u.uPhotoWideH.value = 1;
}
else if (asp < pa) {
var c = 0.055 * H / W, best = null;
for (var z = 1; z <= 1.61; z += 0.1) {
var w = pa / asp * z, lo = Math.max(0, PHOTO_FACE.r - 0.985 / w), hi = Math.min(1 - 1 / w, PHOTO_FACE.l - 0.015 / w);
if (hi < lo)
continue;
[lo, hi].forEach(function (a) {
var fl = (PHOTO_FACE.l - a) * w, fr = (PHOTO_FACE.r - a) * w, ov = Math.max(0, Math.min(fr, 0.5 + c) - Math.max(fl, 0.5 - c));
if (!best || ov < best.ov - 1e-4)
best = { ov: ov, a: a, w: w, z: z };
});
if (best && best.ov <= 0)
break;
}
if (!best) {
var w0 = pa / asp;
best = { a: Math.max(0, Math.min(1 - 1 / w0, (PHOTO_FACE.l + PHOTO_FACE.r) / 2 - 0.5 / w0)), w: w0, z: 1 };
}
var top = clamp(0.385 - 0.5 / best.z, 0, 1 - 1 / best.z);
u.uPhotoRectH.value.set(-best.a * best.w, 1 - best.z * (1 - top), best.w, best.z);
u.uPhotoWideH.value = 0;
}
else {
var h = asp / pa, top = clamp(0.385 - 0.5 / h, 0, 1 - 1 / h);
u.uPhotoRectH.value.set(0, 1 - h * (1 - top), 1, h);
u.uPhotoWideH.value = 0;
}
}
var orbBox = {};
var orbSphere = new THREE.SphereGeometry(1, LITE ? 28 : 44, LITE ? 20 : 32), orbTorus = new THREE.TorusGeometry(1, 0.06, LITE ? 14 : 22, LITE ? 64 : 120);
var orbMats = {
pearl: new THREE.MeshPhysicalMaterial({ color: lin('#F7F2EC'), metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
nude: new THREE.MeshPhysicalMaterial({ color: lin('#C9A98E'), metalness: 0, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1 }),
ring: new THREE.MeshPhysicalMaterial({ color: lin('#C8B08A'), metalness: 1, roughness: 0.22 })
};
var ORBS = [
['pearl', -0.78, 0.55, 0.7, 0.07, 0.9, 0.0], ['ring', 0.72, 0.42, -0.4, 0.15, 0.5, 1.2], ['nude', 0.76, -0.46, 0.6, 0.09, 1.0, 2.1],
['pearl', -0.68, -0.52, -0.5, 0.05, 1.1, 3.0], ['ring', -0.62, 0.06, 1.0, 0.11, 0.7, 4.2], ['pearl', 0.34, 0.78, 0.9, 0.045, 1.2, 5.0],
['nude', -0.22, -0.8, 0.8, 0.06, 0.8, 0.6], ['ring', 0.16, -0.7, -0.7, 0.19, 0.4, 2.6]
].slice(0, LITE ? 5 : 8);
var orbs = ORBS.map(function (o) {
var m = new THREE.Mesh(o[0] === 'ring' ? orbTorus : orbSphere, orbMats[o[0]]);
m.visible = false;
scene.add(m);
return { m: m, x: o[1], y: o[2], z: o[3], size: o[4], speed: o[5], phase: o[6], ring: o[0] === 'ring' };
});
var text = { ready: false, key: '' };
function blur(src, w, h, r, passes) {
var a = new Float32Array(src), b = new Float32Array(w * h), inv = 1 / (r + r + 1), x, y, i, acc, row;
for (var p = 0; p < passes; p++) {
for (y = 0; y < h; y++) {
row = y * w;
acc = 0;
for (x = -r; x <= r; x++)
if (x >= 0 && x < w)
acc += a[row + x];
for (x = 0; x < w; x++) {
b[row + x] = acc * inv;
var xa = x + r + 1, xs = x - r;
if (xa < w)
acc += a[row + xa];
if (xs >= 0)
acc -= a[row + xs];
}
}
for (x = 0; x < w; x++) {
acc = 0;
for (y = -r; y <= r; y++)
if (y >= 0 && y < h)
acc += b[y * w + x];
for (y = 0; y < h; y++) {
a[y * w + x] = acc * inv;
var ya = y + r + 1, ys = y - r;
if (ya < h)
acc += b[ya * w + x];
if (ys >= 0)
acc -= b[ys * w + x];
}
}
}
return a;
}
function buildText(rect, gapMode) {
var pad = rect.h * 0.42;
var cw = rect.w + pad * 2, ch = rect.h + pad * 2;
var maxW = LITE ? 1280 : 2048;
var k = Math.min(maxW / cw, LITE ? 1.6 : 2);
var tw = Math.round(cw * k), th = Math.round(ch * k);
var c = document.createElement('canvas');
c.width = tw;
c.height = th;
var x = c.getContext('2d');
x.fillStyle = '#000';
x.fillRect(0, 0, tw, th);
x.fillStyle = '#fff';
var FONT = function (s) { return '800 ' + s + 'px "Hanken Grotesk", "Helvetica Neue", Arial, sans-serif'; };
var letters = ['G', 'L', 'O', 'W'], track = -0.045, gap = gapMode ? 0.62 : 0;
function widths(fs) { x.font = FONT(fs); return letters.map(function (l) { return x.measureText(l).width; }); }
function total(fs) { var ws = widths(fs), t = 0; ws.forEach(function (w, i) { t += w; if (i < 3)
t += track * fs + (i === 1 ? gap * fs : 0); }); return t; }
var fs = 100 * (rect.w * k * 0.985) / total(100);
x.font = FONT(fs);
var m = x.measureText('GLOW');
var asc = m.actualBoundingBoxAscent || fs * 0.72, desc = m.actualBoundingBoxDescent || 0;
var capH = asc + desc;
if (capH > rect.h * k * 0.98) {
fs *= rect.h * k * 0.98 / capH;
x.font = FONT(fs);
m = x.measureText('GLOW');
asc = m.actualBoundingBoxAscent || fs * 0.72;
desc = m.actualBoundingBoxDescent || 0;
}
var ws = widths(fs), tot = total(fs);
var px = (tw - tot) / 2, base = th / 2 + (asc - desc) / 2, gapCenter = 0;
ws.forEach(function (w, i) {
x.fillText(letters[i], px, base);
px += w;
if (i === 1)
gapCenter = px + (track * fs + gap * fs) / 2;
if (i < 3)
px += track * fs + (i === 1 ? gap * fs : 0);
});
var img = x.getImageData(0, 0, tw, th).data, N = tw * th;
var mask = new Float32Array(N);
for (var i = 0; i < N; i++)
mask[i] = img[i * 4] / 255;
var r1 = Math.max(2, Math.round(fs * 0.04));
var h = blur(mask, tw, th, r1, 3);
var glow = blur(h, tw, th, Math.max(3, Math.round(fs * 0.09)), 2);
var out = new Uint8Array(N * 4), K = r1 * 3.6;
for (var yy = 0; yy < th; yy++) {
var gy = th - 1 - yy;
for (var xx = 0; xx < tw; xx++) {
var idx = yy * tw + xx;
var dx = (xx > 0 && xx < tw - 1) ? (h[idx + 1] - h[idx - 1]) * 0.5 : 0;
var dy = (yy > 0 && yy < th - 1) ? (h[idx + tw] - h[idx - tw]) * 0.5 : 0;
var nx = -dx * K, ny = dy * K, l = Math.sqrt(nx * nx + ny * ny + 1);
var o = (gy * tw + xx) * 4;
out[o] = (nx / l * 0.5 + 0.5) * 255;
out[o + 1] = (ny / l * 0.5 + 0.5) * 255;
out[o + 2] = mask[idx] * 255;
out[o + 3] = Math.min(1, glow[idx] * 1.15) * 255;
}
}
var tex = new THREE.DataTexture(out, tw, th, THREE.RGBAFormat);
tex.minFilter = THREE.LinearFilter;
tex.magFilter = THREE.LinearFilter;
tex.generateMipmaps = false;
tex.needsUpdate = true;
return { tex: tex, x: rect.x - pad, y: rect.y - pad, w: cw, h: ch, gapX: rect.x - pad + gapCenter / k };
}
var W = 1, H = 1, layoutInfo = null, fontOK = false;
var state = { mouse: new THREE.Vector2(0.5, 0.5), mouseT: new THREE.Vector2(0.5, 0.5), amt: 0, amtT: 0, spin: -2.6, vel: 0, drag: false, lastX: 0, tiltX: 0, tiltZ: 0, visible: true, t0: -1, time: 0, ready: false, needs: true, frames: 0, slow: 0, prog: 0 };
function rel(el) { var a = el.getBoundingClientRect(), b = section.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; }
function layout() {
if (!section.clientWidth || !section.clientHeight)
return;
W = section.clientWidth;
H = section.clientHeight;
renderer.setSize(W, H, false);
bgRT.setSize(Math.max(2, Math.round(W * pr * bgScale)), Math.max(2, Math.round(H * pr * bgScale)));
bgMat.uniforms.uRes.value.set(W, H);
compMat.uniforms.uRes.value.set(W, H);
camera.aspect = W / H;
camera.updateProjectionMatrix();
pMat.uniforms.uAspect.value = W / H;
pMat.uniforms.uPR.value = pr;
var vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wpp = vh / H;
points.scale.set(vh * camera.aspect / 12, vh / SPAN * 1.1, 1);
var wide = MQ_WIDE.matches;
var r = rel(word);
var key = [Math.round(r.w), Math.round(r.h), wide, fontOK].join('|');
if (key !== text.key && r.w > 10) {
if (compMat.uniforms.tText.value !== blank)
compMat.uniforms.tText.value.dispose();
layoutInfo = buildText(r, wide);
text.key = key;
compMat.uniforms.tText.value = layoutInfo.tex;
compMat.uniforms.uHasText.value = 1;
text.ready = true;
}
else if (layoutInfo) {
var ddx = r.x - layoutInfo.srcX, ddy = r.y - layoutInfo.srcY;
layoutInfo.x += ddx;
layoutInfo.y += ddy;
layoutInfo.gapX += ddx;
}
if (layoutInfo) {
layoutInfo.srcX = r.x;
layoutInfo.srcY = r.y;
compMat.uniforms.uRect.value.set(layoutInfo.x / W, 1 - (layoutInfo.y + layoutInfo.h) / H, layoutInfo.w / W, layoutInfo.h / H);
compMat.uniforms.uRectAsp.value = layoutInfo.w / layoutInfo.h;
}
var a = rel(anchor);
var cx = a.x + a.w / 2, cy = a.y + a.h / 2;
if (wide && layoutInfo)
cx = layoutInfo.gapX;
var s = Math.min(a.h * 0.86 * wpp / 4.2, W * 0.86 * wpp / 2.75);
product.userData.base = new THREE.Vector3((cx - W / 2) * wpp, -(cy - H / 2) * wpp, 0);
product.userData.scale = s;
product.position.copy(product.userData.base);
product.scale.setScalar(s);
var fh = vh * (wide ? 0.64 : W / H < 0.8 ? 0.5 : 0.56);
var my = wide ? product.userData.base.y : -((a.y + a.h * 0.42) - H / 2) * wpp;
orbBox.base = new THREE.Vector3(product.userData.base.x, wide ? my : Math.max(my, -vh * 0.06), 0);
orbBox.h = fh;
if (photo.tex) {
layoutPhoto();
layoutPhotoHeader();
}
state.needs = true;
}
function touched() { anchor.classList.add('touched'); }
anchor.addEventListener('pointerdown', function (e) { state.drag = true; state.lastX = state.sx = e.clientX; state.sy = e.clientY; state.axis = e.pointerType === 'mouse' ? 'x' : ''; state.vel = 0; touched(); });
anchor.addEventListener('pointermove', function (e) {
if (!state.drag)
return;
if (!state.axis) {
var ax = Math.abs(e.clientX - state.sx), ay = Math.abs(e.clientY - state.sy);
if (ax < 6 && ay < 6)
return;
state.axis = ax > ay ? 'x' : 'y';
if (state.axis === 'y') {
state.drag = false;
return;
}
state.lastX = e.clientX;
try {
anchor.setPointerCapture(e.pointerId);
}
catch (er) { }
}
var dx = e.clientX - state.lastX;
state.lastX = e.clientX;
state.spin += dx * 0.011;
state.vel = dx * 0.011;
state.needs = true;
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { anchor.addEventListener(t, function () { state.drag = false; }); });
anchor.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
e.preventDefault();
state.vel += (e.key === 'ArrowLeft' ? -1 : 1) * 0.09;
state.needs = true;
touched();
} });
section.addEventListener('pointermove', function (e) {
var b = section.getBoundingClientRect();
state.mouseT.set((e.clientX - b.left) / b.width, 1 - (e.clientY - b.top) / b.height);
state.amtT = 1;
state.needs = true;
}, { passive: true });
section.addEventListener('pointerleave', function () { state.amtT = 0; });
new IntersectionObserver(function (en) {
state.visible = en[0].isIntersecting;
if (state.visible)
loop.add(frame);
}, { rootMargin: '80px' }).observe(section);
root.classList.add('nav-in');
$$('.hi', section).forEach(function (el) { el.classList.add('on'); });
function frame(dt, now) {
if (!state.visible || !state.ready)
return;
var animate = !REDUCED;
if (!animate && !state.needs)
return;
state.needs = false;
if (animate)
state.time += dt;
var T = 99, t = animate ? state.time : 6;
var k = 1 - Math.pow(0.0015, dt);
state.mouse.lerp(state.mouseT, k);
state.amt = lerp(state.amt, state.amtT, 1 - Math.pow(0.15, dt));
var p = state.prog;
compMat.uniforms.uPhoto.value = photo.tex ? 1 : 0;
var hdr = 1;
compMat.uniforms.uHeader.value = hdr;
bgMat.uniforms.uTime.value = t + 20;
bgMat.uniforms.uIntro.value = 1;
bgMat.uniforms.uMouse.value.copy(state.mouse);
bgMat.uniforms.uMouseAmt.value = state.amt;
compMat.uniforms.uTime.value = animate ? T : 99;
compMat.uniforms.uMouse.value.copy(state.mouse);
compMat.uniforms.uMouseAmt.value = state.amt;
compMat.uniforms.uReveal.value = animate ? clamp((T - 2.0) / 1.5, 0, 1) : 1;
compMat.uniforms.uTextAmt.value = 1;
compMat.uniforms.uFade.value = smooth(0.3, 1.0, p) * 0.85;
var mb = orbBox, oIn = hdr, spread = 1.45;
if (mb.base)
orbs.forEach(function (o) {
var s = o.size * mb.h * oIn;
o.m.visible = s > 1e-3;
if (!o.m.visible)
return;
o.m.scale.setScalar(s);
o.m.position.set(mb.base.x + o.x * mb.h * 0.6 * spread, mb.base.y + o.y * mb.h * 0.55 * spread + Math.sin(t * o.speed + o.phase) * 0.04 * mb.h + p * (0.6 + o.z) * mb.h * 0.6, o.z * mb.h * 0.45);
if (o.ring) {
o.m.rotation.x = 1.1 + Math.sin(t * 0.3 + o.phase) * 0.3;
o.m.rotation.y = t * 0.25 * o.speed + o.phase;
}
else
o.m.rotation.y = t * 0.2;
});
var pIn = animate ? easeOut(clamp((T - 3.7) / 1.7, 0, 1)) : 1;
product.visible = pIn > 0.001;
if (!state.drag) {
state.spin += (animate ? 0.32 * dt : 0) + state.vel;
state.vel *= Math.pow(0.03, dt);
if (Math.abs(state.vel) > 1e-4)
state.needs = true;
}
spin.rotation.y = state.spin + (1 - pIn) * -2.4 + p * 1.4;
state.tiltX = lerp(state.tiltX, (state.mouse.y - 0.5) * -0.22 * state.amt, k);
state.tiltZ = lerp(state.tiltZ, (state.mouse.x - 0.5) * -0.12 * state.amt, k);
spin.rotation.x = state.tiltX + 0.06;
spin.rotation.z = state.tiltZ;
var base = product.userData.base, s = product.userData.scale;
if (base) {
product.position.set(base.x, base.y + (animate ? Math.sin(t * 0.9) * 0.05 * s : 0) - (1 - pIn) * 0.9 * s + p * 1.6 * s, 0);
product.scale.setScalar(s * (0.82 + 0.18 * pIn) * (1 - 0.22 * p));
}
cap.position.set(capBase.x, capBase.y + (animate ? Math.sin(t * 1.1 + 1) * 0.06 : 0) + (1 - pIn) * 0.8, capBase.z);
cap.rotation.z = -0.34 + (animate ? Math.sin(t * 0.7) * 0.04 : 0);
ring.rotation.y = animate ? -t * 0.28 : -0.6;
var rIn = animate ? smooth(4.1, 5.5, T) : 1;
ring.userData.front.opacity = 0.95 * rIn;
ring.userData.back.opacity = 0.3 * rIn;
ring.scale.setScalar(0.9 + 0.1 * rIn);
keyLight.position.set((state.mouse.x - 0.5) * 8, (state.mouse.y - 0.5) * 6, 4);
pMat.uniforms.uTime.value = t;
pMat.uniforms.uIntro.value = animate ? smooth(0.4, 2.6, T) : 1;
pMat.uniforms.uMouse.value.set(state.amt > 0.05 ? state.mouse.x * 2 - 1 : 9, state.amt > 0.05 ? state.mouse.y * 2 - 1 : 9);
if (hdr > 0.001) {
renderer.setRenderTarget(bgRT);
renderer.render(bgScene, ortho);
}
renderer.setRenderTarget(null);
renderer.clear();
renderer.render(compScene, ortho);
renderer.clearDepth();
renderer.render(scene, camera);
if (animate && T > 2.6 && state.frames < 90) {
state.frames++;
state.slow += dt;
if (state.frames === 90 && state.slow / 90 > 1 / 30 && pr > 1.5) {
pr = Math.max(1.5, pr * 0.8);
renderer.setPixelRatio(pr);
bgScale *= 0.85;
layout();
}
}
if (animate || !photo.tex)
state.needs = true;
}
whenFont('800 100px "Hanken Grotesk"').then(function (ok) {
fontOK = ok;
layout();
buildRing();
try {
var vis = product.visible;
product.visible = true;
orbs.forEach(function (o) { o.m.visible = true; });
renderer.compile(scene, camera);
renderer.compile(compScene, ortho);
renderer.setRenderTarget(bgRT);
renderer.render(bgScene, ortho);
renderer.setRenderTarget(null);
product.visible = vis;
orbs.forEach(function (o) { o.m.visible = false; });
}
catch (e) { }
state.ready = true;
state.needs = true;
root.classList.add('glow-ready');
loop.add(frame);
if (!ok && document.fonts)
document.fonts.addEventListener('loadingdone', function once() { if (document.fonts.check('800 100px "Hanken Grotesk"')) {
document.fonts.removeEventListener('loadingdone', once);
fontOK = true;
text.key = '';
layout();
buildRing();
} });
});
return {
resize: function () { layout(); },
scroll: function (y) {
var h = H || 1;
if (!REDUCED)
canvas.style.transform = 'translate3d(0,' + (y * 0.25).toFixed(1) + 'px,0)';
state.prog = clamp(y / h, 0, 1.2);
state.needs = true;
}
};
}
function initAbout() {
var stage = $('#about-stage'), canvas = $('#about-canvas'), img = $('#about-photo');
var renderer = makeRenderer(canvas, { antialias: true, alpha: true, premultipliedAlpha: true });
if (!renderer)
return null;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setClearColor(0x000000, 0);
var scene = new THREE.Scene();
scene.environment = studioEnv(renderer, { top: 0xf7f2ec, mid: 0xc9b8a6, bot: 0x6e5646, panels: [
[6, 4, -5, 5, 6, 3.0, 0xfffaf4], [1.2, 10, 7.5, 1, -1, 4.2, 0xfff7ee], [1, 9, -7.5, 0, -2, 2.4, 0xfff4ea], [8, 8, 0, 10, 0, 2, 0xffffff], [10, 3, 0, -6, 4, 0.8, 0xd9c8b4]
] });
var camera = new THREE.PerspectiveCamera(22, 1, 0.1, 60);
camera.position.set(0, 0, 12);
var dl = new THREE.DirectionalLight(0xfffaf4, 0.6);
dl.position.set(-3, 4, 5);
scene.add(dl);
var planeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: true,
uniforms: { tMap: { value: null }, uImg: { value: new THREE.Vector2(1, 1) }, uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 22 }, uReady: { value: 0 } },
vertexShader: VS_PLANE, fragmentShader: FS_PORTRAIT });
var plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), planeMat);
scene.add(plane);
var sg = new THREE.SphereGeometry(1, LITE ? 32 : 56, LITE ? 24 : 40);
var pearl = new THREE.MeshPhysicalMaterial({ color: lin('#F7F2EC'), metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 });
var goldM = new THREE.MeshPhysicalMaterial({ color: lin('#C9A98E'), metalness: 0, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 });
var rose = new THREE.MeshPhysicalMaterial({ color: lin('#C8B08A'), metalness: 1, roughness: 0.22, envMapIntensity: 1.15 });
var SPEC = [
['pearl', -1.12, 0.62, 1.0, 0.17, 0.8, 0.0], ['pearl', 1.08, -0.38, 1.4, 0.14, 1.0, 1.2], ['pearl', 0.72, 1.07, -0.8, 0.11, 0.7, 2.1],
['pearl', -0.62, -1.08, 0.7, 0.09, 1.1, 3.0], ['pearl', -1.2, -0.2, -1.2, 0.07, 0.9, 4.2],
['gold', 1.16, 0.74, 0.5, 0.24, 0.6, 0.6], ['gold', -1.22, -0.62, -0.9, 0.28, 0.5, 2.6], ['gold', 0.18, -1.17, 1.6, 0.08, 1.2, 1.7], ['gold', -0.3, 1.12, 1.2, 0.06, 1.3, 5.0],
['ring', -0.98, 1.02, 0.3, 0.3, 0.5, 0.3], ['ring', 1.04, -1.0, -0.4, 0.4, 0.4, 2.2], ['ring', 1.28, 0.16, 1.1, 0.16, 0.8, 3.3]
];
var items = SPEC.map(function (s) {
var m;
if (s[0] === 'ring') {
m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, LITE ? 16 : 24, LITE ? 64 : 140), rose);
m.rotation.set(1.1 + s[6], s[6], 0.4);
}
else
m = new THREE.Mesh(sg, s[0] === 'pearl' ? pearl : goldM);
scene.add(m);
return { m: m, nx: s[1], ny: s[2], z: s[3], size: s[4], speed: s[5], phase: s[6], ring: s[0] === 'ring' };
});
var st = { visible: false, w: 1, h: 1, hw: 1, hh: 1, unit: 1, mx: 0, my: 0, time: 0, needs: true, top: 0 };
function layout() {
var cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
if (!cr.width)
return;
st.w = cr.width;
st.h = cr.height;
renderer.setSize(cr.width, cr.height, false);
camera.aspect = cr.width / cr.height;
camera.updateProjectionMatrix();
var vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wpp = vh / cr.height;
var pw = sr.width * wpp, ph = sr.height * wpp;
plane.scale.set(pw, ph, 1);
plane.position.set(((sr.left + sr.width / 2) - (cr.left + cr.width / 2)) * wpp, -((sr.top + sr.height / 2) - (cr.top + cr.height / 2)) * wpp, 0);
planeMat.uniforms.uSize.value.set(sr.width, sr.height);
st.hw = pw / 2;
st.hh = ph / 2;
st.unit = pw / 2.6;
var spread = innerWidth < 600 ? 0.9 : 1;
items.forEach(function (it) { it.bx = plane.position.x + it.nx * st.hw * spread; it.by = plane.position.y + it.ny * st.hh; it.m.scale.setScalar(it.size * st.unit * (it.ring ? 1 : 1)); });
var r = stage.getBoundingClientRect();
st.top = r.top + window.scrollY + r.height / 2;
st.needs = true;
}
function frame(dt) {
if (!st.visible)
return;
if (REDUCED && !st.needs)
return;
st.needs = false;
st.time += REDUCED ? 0 : dt;
var t = st.time;
var tx = (S.mx / innerWidth - 0.5) * 2, ty = (S.my / innerHeight - 0.5) * 2;
if (!FINE) {
tx = 0;
ty = 0;
}
var k = 1 - Math.pow(0.02, dt);
st.mx = lerp(st.mx, tx, k);
st.my = lerp(st.my, ty, k);
var q = clamp((S.y + innerHeight / 2 - st.top) / innerHeight, -1.2, 1.2);
camera.position.x = st.mx * 0.55;
camera.position.y = -st.my * 0.4;
camera.lookAt(0, 0, 0);
items.forEach(function (it) {
var bob = REDUCED ? 0 : Math.sin(t * it.speed + it.phase) * 0.06 * st.unit;
it.m.position.set(it.bx, it.by + bob - q * it.z * 0.22 * st.unit, it.z * st.unit);
if (it.ring) {
it.m.rotation.y = it.phase + t * 0.25 * it.speed;
it.m.rotation.x = 1.1 + Math.sin(t * 0.3 + it.phase) * 0.25;
}
else
it.m.rotation.y = t * 0.2;
});
renderer.render(scene, camera);
if (!REDUCED)
st.needs = true;
}
onMedia(function () {
loaded(img).then(function (im) { return (im.decode ? im.decode() : Promise.resolve()).then(function () { return im; }, function () { return im; }); }).then(function (im) {
if (!im.naturalWidth)
return;
var tex = new THREE.Texture(im), mip = renderer.capabilities.isWebGL2;
tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
tex.generateMipmaps = mip;
tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
tex.needsUpdate = true;
planeMat.uniforms.tMap.value = tex;
planeMat.uniforms.uImg.value.set(im.naturalWidth, im.naturalHeight);
planeMat.uniforms.uReady.value = 1;
stage.classList.add('gl-on');
st.needs = true;
});
});
new IntersectionObserver(function (en) { st.visible = en[0].isIntersecting; if (st.visible) {
st.needs = true;
loop.add(frame);
} }, { rootMargin: '100px' }).observe(stage);
layout();
whenIdle(function () { try {
renderer.compile(scene, camera);
}
catch (e) { } });
return { resize: layout };
}
function initScroll(hero) {
var par = $$('[data-speed]').map(function (el) { return { el: el, speed: parseFloat(el.dataset.speed) || 0, c: 0, last: 1e9 }; }).filter(function (p) { return p.speed !== 0; });
var zoom = { sec: $('#signature'), frame: $('#zoom-frame'), imgs: $$('#zoom-frame img'), wipe: $('.zf-wipe'), wipeIn: $('.zf-wipe-in'), sheen: $('.zf-sheen'),
t1: $('.zt-1'), t2: $('.zt-2'), ca: $('.zc-a'), cb: $('.zc-b'), badge: $('.zoom-badge'), prog: $('.zoom-progress'), bar: $('.zoom-progress b'), rows: $$('.zoom-row'),
sats: $$('.zs').map(function (el) { var d = el.dataset.zs.split(',').map(Number); return { el: el, bx: d[0], by: d[1], k: d[2], r: d[3] }; }),
top: 0, h: 1, rw: [], fw: 1, fh: 1, bw: 100, navH: 64 };
var br = { sec: $('#bridal'), frame: $('[data-bridal-layer="frame"]'), art: $('[data-bridal-layer="art"]'), p1: $('[data-bridal-layer="p1"]'), p2: $('[data-bridal-layer="p2"]'), copy: $('[data-bridal-layer="copy"]'), back: $('.bridal-back'), top: 0, h: 1, sticky: false };
var heroBits = $$('.hero-bottom, .hero-eyebrow'), nav = $('#nav'), lights = $$('.dark, .footer'), ranges = [], solid = false;
function measure() {
S.vh = innerHeight;
S.vw = innerWidth;
var big = innerWidth >= 720;
par.forEach(function (p) { p.el.style.transform = ''; p.active = big; var r = p.el.getBoundingClientRect(); p.c = r.top + scrollY + r.height / 2; p.last = 1e9; });
ranges = lights.map(function (el) { var b = el.getBoundingClientRect(); return [b.top + scrollY, b.bottom + scrollY]; });
var r = zoom.sec.getBoundingClientRect();
zoom.top = r.top + scrollY;
zoom.h = zoom.sec.offsetHeight;
zoom.rw = zoom.rows.map(function (row) { return row.scrollWidth; });
zoom.fw = zoom.frame.offsetWidth;
zoom.fh = zoom.frame.offsetHeight;
zoom.bw = zoom.badge.offsetWidth;
zoom.navH = nav.offsetHeight;
var b = br.sec.getBoundingClientRect();
br.top = b.top + scrollY;
br.h = br.sec.offsetHeight;
br.sticky = innerWidth >= 960;
if (!br.sticky)
[br.frame, br.art, br.p1, br.p2, br.copy, br.back].forEach(function (el) { if (el)
el.style.transform = ''; });
}
function update() {
var y = S.y, vh = S.vh;
if (hero)
hero.scroll(y);
var probe = y + 40, onLight = ranges.some(function (rg) { return probe >= rg[0] && probe < rg[1]; });
if (onLight !== solid) {
solid = onLight;
nav.classList.toggle('solid', solid);
}
if (REDUCED)
return;
var hp = clamp(y / vh, 0, 1);
heroBits.forEach(function (el) { el.style.transform = 'translate3d(0,' + (-hp * 90).toFixed(1) + 'px,0)'; el.style.opacity = (1 - hp * 1.4).toFixed(3); });
par.forEach(function (p) { if (!p.active)
return; var d = y + vh / 2 - p.c; if (Math.abs(d) > vh * 1.6)
return; var ty = Math.round(d * p.speed * 10) / 10; if (ty !== p.last) {
p.el.style.transform = 'translate3d(0,' + ty + 'px,0)';
p.last = ty;
} });
var zp = clamp((y - zoom.top) / Math.max(1, zoom.h - vh), 0, 1), ze = easeInOut(clamp(zp / 0.5, 0, 1));
if (y > zoom.top - vh && y < zoom.top + zoom.h) {
var sc = lerp(0.42, 1, ze);
zoom.frame.style.transform = 'scale(' + sc.toFixed(4) + ')';
var inner = 'scale(' + lerp(1.28, 1, ze).toFixed(4) + ')';
zoom.imgs.forEach(function (im) { im.style.transform = inner; });
var w = easeInOut(clamp((zp - 0.5) / 0.28, 0, 1));
zoom.wipe.style.transform = 'translate3d(0,' + ((1 - w) * 100).toFixed(2) + '%,0)';
zoom.wipeIn.style.transform = 'translate3d(0,' + (-(1 - w) * 100).toFixed(2) + '%,0)';
zoom.sheen.style.transform = 'translate3d(' + lerp(-80, 80, smooth(0.04, 0.46, zp)).toFixed(1) + '%,0,0)';
zoom.t1.style.transform = 'translate3d(0,' + (-zp * vh * 0.7).toFixed(1) + 'px,0)';
zoom.t1.style.opacity = (1 - smooth(0.1, 0.34, zp)).toFixed(3);
var t2 = smooth(0.6, 0.8, zp);
zoom.t2.style.opacity = t2.toFixed(3);
zoom.t2.style.transform = 'translate3d(0,' + ((1 - t2) * 50).toFixed(1) + 'px,0)';
zoom.ca.style.opacity = (smooth(0.3, 0.44, zp) * (1 - smooth(0.52, 0.6, zp))).toFixed(3);
zoom.cb.style.opacity = smooth(0.74, 0.86, zp).toFixed(3);
zoom.prog.style.opacity = smooth(0.3, 0.44, zp).toFixed(3);
zoom.bar.style.transform = 'scaleX(' + clamp((zp - 0.42) / 0.4, 0, 1).toFixed(3) + ')';
var q = clamp(zp / 0.55, 0, 1), qe = q * q;
zoom.sats.forEach(function (s) {
var f = 1 + qe * s.k * 2.2;
var sx = s.bx * S.vw * f, sy = s.by * vh * f - q * vh * 0.14 * s.k;
s.el.style.transform = 'translate(-50%,-50%) translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) rotate(' + (s.r * (1 - q)).toFixed(2) + 'deg) scale(' + (1 + q * 0.3 * s.k).toFixed(3) + ')';
s.el.style.opacity = (1 - smooth(0.4, 0.8, q)).toFixed(3);
});
var bxp = Math.min(zoom.fw / 2 * sc - zoom.bw * 0.15, S.vw / 2 - zoom.bw / 2 - 10);
var byp = Math.max(-zoom.fh / 2 * sc + zoom.bw * 0.15, -vh / 2 + zoom.navH + zoom.bw / 2 + (S.vw < 900 ? 64 : 8));
zoom.badge.style.transform = 'translate(-50%,-50%) translate3d(' + bxp.toFixed(1) + 'px,' + byp.toFixed(1) + 'px,0)';
zoom.rows.forEach(function (row, i) { var dir = i ? -1 : 1, rw = zoom.rw[i] - S.vw; var x = dir > 0 ? -zp * rw * 0.75 : -rw * 0.75 + zp * rw * 0.75; row.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)'; });
}
if (br.sticky && y > br.top - vh && y < br.top + br.h) {
var bp = clamp((y - br.top) / Math.max(1, br.h - vh), 0, 1), be = easeInOut(bp);
br.frame.style.transform = 'scale(' + lerp(0.88, 1, be).toFixed(4) + ')';
br.art.style.transform = 'scale(' + lerp(1.25, 1, be).toFixed(4) + ')';
br.p1.style.transform = 'translate3d(0,' + lerp(vh * 0.05, -vh * 0.1, bp).toFixed(1) + 'px,0)';
if (br.p2)
br.p2.style.transform = 'translate3d(0,' + lerp(vh * 0.1, -vh * 0.05, bp).toFixed(1) + 'px,0)';
br.copy.style.transform = 'translate3d(0,' + lerp(vh * 0.06, -vh * 0.06, bp).toFixed(1) + 'px,0)';
br.back.style.transform = 'translate3d(' + lerp(0, -S.vw * 0.08, bp).toFixed(1) + 'px,' + lerp(vh * 0.1, -vh * 0.05, bp).toFixed(1) + 'px,0)';
}
}
measure();
var lastY = -1, lastW = -1;
loop.add(function () { if (S.y !== lastY || S.vw !== lastW) {
lastY = S.y;
lastW = S.vw;
update();
} });
return { measure: function () { measure(); lastY = -1; } };
}
function initUI() {
var links = $$('.nav-links a');
var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) {
links.forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + e.target.id)); });
} }); }, { rootMargin: '-45% 0px -50% 0px' });
['about', 'services', 'portfolio', 'bridal', 'shop', 'book'].forEach(function (id) { var s = document.getElementById(id); if (s)
io.observe(s); });
function priceLabel(t) { t = String(t || '').trim().replace(/^\$/, ''); var from = t.split(/\s*[–—-]\s*/)[0].replace(/^\$/, ''); return from !== t ? 'from JMD $' + from : 'JMD $' + t; }
var PRICES = { 'Soft Glam': priceLabel(window.SOFT_GLAM_PRICE || '9,500'), 'Full Glam': priceLabel(window.FULL_GLAM_PRICE || '10,500 – $12,000'),
'Natural Full Glam': priceLabel(window.FULL_GLAM_NATURAL_PRICE || '10,500'), 'Statement Full Glam': priceLabel(window.FULL_GLAM_STATEMENT_PRICE || '12,000') };
function payLink(v) { if (/Full Glam$/.test(v))
v = 'Full Glam'; var l = ((window.BOOKING || {}).payLinks || {})[v]; if (!l)
return ''; try {
var u = new URL(l);
return u.protocol === 'https:' && /(^|\.)whop\.com$/.test(u.hostname) ? u.href : '';
}
catch (e) {
return '';
} }
var BRIDAL_MSG = 'Hi Launthia, I’m interested in Bridal Glam. My wedding date is ___ and the location is ___. Could you send me your bridal pricing?';
$$('[data-quote-sms]').forEach(function (a) { a.href = smsHref(BRIDAL_MSG); });
$$('[data-quote-email]').forEach(function (a) { a.href = mailHref('Bridal quote request', BRIDAL_MSG); });
var fab = $('#fab'), inHero = true, inBook = false, inClub = false;
function fabSync() { fab.classList.toggle('show', !inHero && !inBook && !(inClub && innerWidth < 760)); }
new IntersectionObserver(function (en) { inClub = en[0].isIntersecting; fabSync(); }).observe($('#club-form').parentNode);
new IntersectionObserver(function (en) { inHero = en[0].isIntersecting; fabSync(); }, { threshold: 0.15 }).observe($('#hero'));
new IntersectionObserver(function (en) { inBook = en[0].isIntersecting; fabSync(); }).observe($('#book'));
var form = $('#book-form'), status = $('#form-status'), done = $('#bk-done'), quote = $('#bk-quote');
var svcBtns = $$('.bk-svc', form), stepDay = $('#bk-s2'), stepTime = $('#bk-s3'), stepYou = $('#bk-s4');
var pick = { svc: '', day: '', hour: -1, sid: '', slot: '' };
var FLOW = 'old', LIVE = null, CHECKED = {}, SLOTS = [], HOLD = null;
var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function hourOf(t) { var m = String(t).trim().toLowerCase().match(/^(\d{1,2})(?::00)?\s*(am|pm)?$/); if (!m)
return null; var h = parseInt(m[1], 10); if (m[2] === 'pm' && h < 12)
h += 12; if (m[2] === 'am' && h === 12)
h = 0; return h > 23 ? null : h; }
function hoursOf(v) { var p = String(v || '').split(/\s*(?:-|–|to)\s*/i); if (p.length !== 2)
return null; var o = hourOf(p[0]), c = hourOf(p[1]); return o == null || c == null || c <= o ? null : { open: o, close: c }; }
var BK = window.BOOKING || {}, HOURS = DAYS.map(function (d) { return hoursOf((BK.hours || {})[d]); }), TAKEN = {}, FULL = {};
Object.keys(BK.booked || {}).forEach(function (k) { TAKEN[k] = {}; (BK.booked[k] || []).forEach(function (t) { var h = hourOf(t); if (h != null)
TAKEN[k][h] = 1; }); });
(BK.fullDays || []).forEach(function (k) { FULL[k] = 1; });
var OFF = {};
function applySite(d) {
if (!d)
return;
if (d.prices) {
var sg = d.prices['Soft Glam'], fg = d.prices['Full Glam'];
if (sg) {
window.SOFT_GLAM_PRICE = sg;
PRICES['Soft Glam'] = priceLabel(sg);
$$('[data-sg-price]').forEach(function (e) { e.textContent = sg; });
}
if (fg) {
window.FULL_GLAM_PRICE = fg;
PRICES['Full Glam'] = priceLabel(fg);
$$('[data-fg-price]').forEach(function (e) { e.textContent = fg; });
}
var fn = d.prices['Natural Full Glam'], fs = d.prices['Statement Full Glam'];
if (fn) {
window.FULL_GLAM_NATURAL_PRICE = fn;
PRICES['Natural Full Glam'] = priceLabel(fn);
}
if (fs) {
window.FULL_GLAM_STATEMENT_PRICE = fs;
PRICES['Statement Full Glam'] = priceLabel(fs);
}
if ((fn || fs) && !looksEl.hidden)
renderLooks(isLook(pick.svc) ? pick.svc : 'Full Glam');
}
if (d.daysOff) {
OFF = {};
d.daysOff.forEach(function (k) { OFF[k] = 1; });
if (pick.day && OFF[pick.day]) {
pick.day = '';
pick.hour = -1;
stepTime.hidden = stepYou.hidden = true;
}
renderCal(0);
}
if (FLOW === 'preview') {
CHECKED = {};
applyOptions(PV.options());
}
review();
}
addEventListener('glow:site', function (e) { applySite(e.detail); });
var MINE = 'glow.booked';
function mineLoad() { try {
var t = ymd(new Date());
return (JSON.parse(localStorage.getItem(MINE) || '[]') || []).filter(function (k) { return typeof k === 'string' && k.slice(0, 10) >= t; });
}
catch (e) {
return [];
} }
function markTaken(day, h) { if (!TAKEN[day])
TAKEN[day] = {}; TAKEN[day][h] = 1; }
mineLoad().forEach(function (k) { markTaken(k.slice(0, 10), parseInt(k.slice(11), 10)); });
function mineAdd(day, h) { var l = mineLoad(), k = day + ' ' + ('0' + h).slice(-2); if (l.indexOf(k) < 0)
l.push(k); try {
localStorage.setItem(MINE, JSON.stringify(l));
}
catch (e) { } markTaken(day, h); }
function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function fmtHour(h, short) { var n = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'; return short ? n + ap : n + ':00 ' + ap; }
function longDay(key) { return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function slots(key) {
var hrs = HOURS[new Date(key + 'T12:00:00').getDay()], now = new Date(), today = key === ymd(now), out = [];
if (!hrs || FULL[key] || OFF[key])
return out;
for (var h = hrs.open; h < hrs.close; h++)
out.push({ h: h, taken: !!(TAKEN[key] && TAKEN[key][h]), past: today && h <= now.getHours() });
return out;
}
function isOpen(key) {
if (FLOW !== 'old')
return key <= MAX_KEY && !!(CHECKED[pick.sid] && CHECKED[pick.sid][key] === true) && !OFF[key];
return key <= MAX_KEY && slots(key).some(function (x) { return !x.taken && !x.past; });
}
function dayNote(key, dt) {
if (FLOW !== 'old') {
if (dt < day0)
return 'Past';
if (key > MAX_KEY)
return 'Not open for booking yet';
if (LIVE.paused)
return 'Online booking paused';
if (!LIVE.open[dt.getDay()] && !(CHECKED[pick.sid] && CHECKED[pick.sid][key] === true))
return 'Closed';
if (OFF[key])
return 'Not available';
var got = CHECKED[pick.sid];
if (!got || !(key in got))
return 'Checking';
return got[key] ? '' : 'Fully booked';
}
if (dt < day0)
return 'Past';
if (key > MAX_KEY)
return 'Not open for booking yet';
if (!HOURS[dt.getDay()])
return 'Closed';
if (FULL[key])
return 'Fully booked';
if (OFF[key])
return 'Not available';
var list = slots(key);
if (list.some(function (x) { return !x.taken && !x.past; }))
return '';
return list.some(function (x) { return x.past && !x.taken; }) ? 'Closed for today' : 'Fully booked';
}
function writeHours(HOURS) {
var order = [1, 2, 3, 4, 5, 6, 0], parts = [], i = 0, el = $('#bk-hours');
function same(a, b) { return a === b || (a && b && a.open === b.open && a.close === b.close); }
while (i < order.length) {
var v = HOURS[order[i]], j = i;
while (j + 1 < order.length && same(HOURS[order[j + 1]], v))
j++;
var days = j > i ? DAYS[order[i]] + ' to ' + DAYS[order[j]] : DAYS[order[i]];
parts.push(v ? days + ', ' + fmtHour(v.open, 1) + ' to ' + fmtHour(v.close, 1) : days + ' closed');
i = j + 1;
}
if (el)
el.textContent = parts.join(' · ');
}
writeHours(HOURS);
function nudge(el) {
var nav = $('#nav'), navH = nav ? nav.offsetHeight : 64, r = el.getBoundingClientRect();
if (r.top > innerHeight * 0.6 || r.top < navH + 8) {
var y = Math.max(0, r.top + scrollY - navH - 24);
if (window.glowScrollTo)
glowScrollTo(y);
else
scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
}
}
function show(el, scroll) {
var wasHidden = el.hidden;
el.hidden = false;
el.classList.remove('bk-in');
if (scroll)
nudge(el);
if (wasHidden && !REDUCED) {
void el.offsetWidth;
el.classList.add('bk-in');
}
}
$('#bk-quote-sms').href = smsHref(BRIDAL_MSG);
$('#bk-quote-email').href = mailHref('Bridal quote request', BRIDAL_MSG);
function priceText(v) { return PRICES[v] || ''; }
function review() {
var live = FLOW !== 'old';
var r = { svc: live && svcOf(pick.svc) ? svcOf(pick.svc).name : pick.svc, day: pick.day ? longDay(pick.day) : '', time: live ? (pick.slot ? jmTime(pick.slot) : '') : pick.hour >= 0 ? fmtHour(pick.hour) : '', name: $('#f-name').value.trim(), phone: $('#f-phone').value.trim(), email: $('#f-email').value.trim(), price: live ? svcPrice(svcOf(pick.svc)) : priceText(pick.svc) };
$$('#bk-review [data-r]').forEach(function (dd) { dd.textContent = r[dd.dataset.r] || ''; });
}
$('#f-name').addEventListener('input', review);
$('#f-email').addEventListener('input', review);
var LOOKS = [
{ name: 'Natural Full Glam', cfg: 'FULL_GLAM_NATURAL_PRICE', desc: 'Polished full glam that still looks like you: luminous skin, a soft sculpt, defined brows, a refined eye and light, wispy lashes.' },
{ name: 'Statement Full Glam', cfg: 'FULL_GLAM_STATEMENT_PRICE', desc: 'Every feature defined for big moments and the camera: fuller coverage, a sculpted contour, a bolder or smoky eye and fuller lashes.' }
];
var looksEl = $('#bk-looks'), looksList = $('#bk-looks-list');
function isLook(v) { return LOOKS.some(function (l) { return l.name === v; }); }
function lookPrice(l) {
if (FLOW !== 'old') {
var sv = svcOf(l.name);
return sv && sv.bookable_online && sv.price_jmd != null ? sv.price_jmd : null;
}
var t = String(window[l.cfg] || '').replace(/^\$/, '').trim();
return /^[0-9][0-9,]*$/.test(t) ? parseInt(t.replace(/,/g, ''), 10) : null;
}
function lookDesc(l) { var sv = FLOW !== 'old' ? svcOf(l.name) : null; return sv && sv.description ? sv.description : l.desc; }
function looksReady() { return LOOKS.every(function (l) { return lookPrice(l) != null; }); }
function renderLooks(sel) {
if (!sel) {
looksEl.hidden = true;
return;
}
looksEl.hidden = false;
looksList.innerHTML = '';
LOOKS.forEach(function (l, i) {
var b = el('button', 'bk-look'), on = sel === l.name, top = el('span', 'bk-look-top');
b.type = 'button';
b.dataset.look = l.name;
b.setAttribute('role', 'radio');
b.setAttribute('aria-checked', String(on));
b.tabIndex = on || (!isLook(sel) && i === 0) ? 0 : -1;
top.appendChild(el('span', 'bk-look-name', l.name));
top.appendChild(el('span', 'bk-look-price', jmd(lookPrice(l))));
b.appendChild(top);
b.appendChild(el('span', 'bk-look-desc', lookDesc(l)));
b.addEventListener('click', function () { setService(l.name, true); });
looksList.appendChild(b);
});
}
looksList.addEventListener('keydown', function (e) {
var all = $$('.bk-look', looksList), i = all.indexOf(document.activeElement);
if (i < 0)
return;
var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
if (!d)
return;
e.preventDefault();
var n = all[(i + d + all.length) % all.length];
setService(n.dataset.look, false);
var f = $('.bk-look[data-look="' + n.dataset.look + '"]', looksList);
if (f)
f.focus();
});
function setService(v, scroll) {
var looks = (v === 'Full Glam' || isLook(v)) && looksReady();
if (v === 'Full Glam' && looks && isLook(pick.svc))
v = pick.svc;
if (FLOW !== 'old' && pick.svc !== v) {
pick.day = '';
pick.slot = '';
stepTime.hidden = stepYou.hidden = true;
}
pick.svc = v;
review();
svcBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === v || (b.dataset.value === 'Full Glam' && isLook(v)))); });
renderLooks(looks ? v : null);
var bridal = v === 'Bridal Glam';
status.textContent = '';
if (looks && v === 'Full Glam') {
pick.sid = '';
pick.day = '';
pick.hour = -1;
pick.slot = '';
quote.hidden = true;
stepDay.hidden = stepTime.hidden = stepYou.hidden = true;
show(looksEl, scroll);
return;
}
if (FLOW !== 'old') {
var sv = svcOf(v);
pick.sid = sv ? sv.id : '';
setQuote(v, sv);
if (!sv || !sv.bookable_online) {
stepDay.hidden = stepTime.hidden = stepYou.hidden = true;
show(quote, scroll);
return;
}
quote.hidden = true;
loadDays(sv.id);
if (pick.slot) {
show(stepDay);
show(stepTime);
show(stepYou);
}
else if (pick.day) {
show(stepDay);
show(stepTime, scroll);
}
else
show(stepDay, scroll);
return;
}
if (bridal) {
stepDay.hidden = stepTime.hidden = stepYou.hidden = true;
show(quote, scroll);
return;
}
quote.hidden = true;
if (pick.hour >= 0) {
show(stepDay);
show(stepTime);
show(stepYou);
}
else if (pick.day) {
show(stepDay);
show(stepTime, scroll);
}
else
show(stepDay, scroll);
}
svcBtns.forEach(function (b) { b.addEventListener('click', function () { setService(b.dataset.value, true); }); });
var calGrid = $('#cal-grid'), calTitle = $('#cal-title'), calPrev = $('#cal-prev'), calNext = $('#cal-next'), calKey = $('#cal-key');
var day0 = new Date();
day0.setHours(0, 0, 0, 0);
var calY = day0.getFullYear(), calM = day0.getMonth();
var maxDay = new Date(day0);
maxDay.setMonth(maxDay.getMonth() + 3);
if (maxDay.getDate() !== day0.getDate())
maxDay.setDate(0);
var MAX_KEY = ymd(maxDay);
function renderCal(dir, focusKey) {
calTitle.innerHTML = MONTHS[calM] + '<em>' + calY + '</em>';
calGrid.innerHTML = '';
var offset = (new Date(calY, calM, 1).getDay() + 6) % 7, days = new Date(calY, calM + 1, 0).getDate(), anyFull = false;
for (var i = 0; i < offset; i++)
calGrid.appendChild(document.createElement('span'));
for (var d = 1; d <= days; d++) {
var dt = new Date(calY, calM, d), key = ymd(dt), b = document.createElement('button');
var label = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
b.type = 'button';
b.className = 'cal-day';
b.textContent = d;
b.dataset.date = key;
b.tabIndex = -1;
var why = dayNote(key, dt);
if (why) {
b.disabled = true;
b.classList.add('full');
b.title = why;
label += ', ' + why.toLowerCase();
if (dt >= day0)
anyFull = true;
}
if (+dt === +day0)
b.classList.add('today');
if (key === pick.day) {
b.classList.add('sel');
b.setAttribute('aria-pressed', 'true');
}
b.setAttribute('aria-label', label);
calGrid.appendChild(b);
}
calKey.hidden = !anyFull;
calPrev.disabled = calY === day0.getFullYear() && calM === day0.getMonth();
calNext.disabled = calY > maxDay.getFullYear() || (calY === maxDay.getFullYear() && calM >= maxDay.getMonth());
calGrid.classList.remove('slide-l', 'slide-r');
if (dir && !REDUCED) {
void calGrid.offsetWidth;
calGrid.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
}
var t = (focusKey && $('.cal-day[data-date="' + focusKey + '"]:not(:disabled)', calGrid)) || $('.cal-day.sel', calGrid) || $('.cal-day:not(:disabled)', calGrid);
if (t)
t.tabIndex = 0;
return t;
}
function shiftMonth(n, focusKey) { calM += n; while (calM < 0) {
calM += 12;
calY--;
} while (calM > 11) {
calM -= 12;
calY++;
} var t = renderCal(n, focusKey); if (focusKey && t)
t.focus({ preventScroll: true }); }
calPrev.addEventListener('click', function () { if (!calPrev.disabled)
shiftMonth(-1); });
calNext.addEventListener('click', function () { if (!calNext.disabled)
shiftMonth(1); });
calGrid.addEventListener('click', function (e) {
var b = e.target.closest('.cal-day');
if (!b || b.disabled)
return;
pick.day = b.dataset.date;
$$('.cal-day.sel', calGrid).forEach(function (x) { x.classList.remove('sel'); x.removeAttribute('aria-pressed'); });
b.classList.add('sel');
b.setAttribute('aria-pressed', 'true');
renderTimes();
show(stepTime, true);
});
calGrid.addEventListener('keydown', function (e) {
var b = e.target.closest('.cal-day');
if (!b)
return;
if (e.key === 'PageUp' || e.key === 'PageDown') {
e.preventDefault();
shiftMonth(e.key === 'PageUp' ? -1 : 1);
return;
}
var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
if (!step)
return;
e.preventDefault();
var cur = new Date(b.dataset.date + 'T00:00:00'), hop = 0;
do {
cur.setDate(cur.getDate() + step);
hop++;
} while (hop < 62 && cur >= day0 && !isOpen(ymd(cur)));
if (cur < day0 || !isOpen(ymd(cur)))
return;
var key = ymd(cur);
if (cur.getMonth() !== calM || cur.getFullYear() !== calY)
shiftMonth(cur.getMonth() - calM + (cur.getFullYear() - calY) * 12, key);
else {
var nb = $('.cal-day[data-date="' + key + '"]', calGrid);
if (nb) {
b.tabIndex = -1;
nb.tabIndex = 0;
nb.focus();
}
}
});
renderCal(0);
var timesEl = $('#bk-times'), timeKey = $('#time-key');
function renderTimes() {
if (FLOW !== 'old') {
renderLiveTimes();
return;
}
var list = slots(pick.day), anyTaken = false;
$('#bk-when').textContent = longDay(pick.day).replace(/ \d{4}$/, '');
timesEl.innerHTML = '';
list.forEach(function (x) {
var b = document.createElement('button'), label = fmtHour(x.h);
b.type = 'button';
b.className = 'bk-time';
b.dataset.hour = x.h;
b.innerHTML = (x.h % 12 || 12) + ':00<small>' + (x.h < 12 ? 'am' : 'pm') + '</small>';
if (x.taken) {
b.disabled = true;
b.classList.add('taken');
anyTaken = true;
label += ', booked';
}
else if (x.past) {
b.disabled = true;
label += ', already passed';
}
b.setAttribute('aria-label', label);
b.setAttribute('aria-pressed', String(!b.disabled && x.h === pick.hour));
timesEl.appendChild(b);
});
timeKey.hidden = !anyTaken;
if (pick.hour >= 0 && !list.some(function (x) { return x.h === pick.hour && !x.taken && !x.past; })) {
pick.hour = -1;
stepYou.hidden = true;
}
}
timesEl.addEventListener('click', function (e) {
var b = e.target.closest('.bk-time');
if (!b || b.disabled)
return;
if (FLOW !== 'old') {
pick.slot = b.dataset.slot;
$$('.bk-time', timesEl).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
review();
show(stepYou, true);
return;
}
pick.hour = +b.dataset.hour;
$$('.bk-time', timesEl).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
review();
show(stepYou, true);
sbWarm();
});
function validate() {
var bad = [], first = null;
function check(fieldEl, ok, label, focusEl) { fieldEl.classList.toggle('invalid', !ok); if (!ok) {
bad.push(label);
if (!first)
first = focusEl;
if (!REDUCED) {
fieldEl.classList.remove('shake');
void fieldEl.offsetWidth;
fieldEl.classList.add('shake');
}
} }
var nm = $('#f-name'), ph = $('#f-phone');
check(nm.closest('.field'), nm.value.trim().length > 1 && nm.value.trim().length <= 80, 'name', nm);
check(ph.closest('.field'), phoneOk(ph.value), 'phone number', ph);
var em = $('#f-email');
check(em.closest('.field'), emailOk(em.value), 'email', em);
var tb = $('#f-terms');
check(tb.closest('.consent'), tb.checked, 'terms', tb);
if (first)
first.focus();
return bad;
}
var termsAt = '';
$('#f-terms').addEventListener('change', function () { termsAt = this.checked ? new Date().toISOString() : ''; this.closest('.consent').classList.remove('invalid'); if (status.textContent)
status.textContent = ''; });
['f-name', 'f-phone', 'f-email'].forEach(function (id) { $('#' + id).addEventListener('input', function () { this.closest('.field').classList.remove('invalid'); if (status.textContent)
status.textContent = ''; }); });
function fmtPhone(v) {
var d = v.replace(/\D/g, '').slice(0, 11), p = '';
if (d.charAt(0) === '1' && d.length > 1) {
p = '1-';
d = d.slice(1);
}
var a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6, 10);
return p + a + (b ? '-' + b : '') + (c ? '-' + c : '');
}
var phoneEl = $('#f-phone'), phoneLast = phoneEl.value;
phoneEl.addEventListener('input', function (e) {
var v = phoneEl.value;
if (/^\s*\+/.test(v)) {
phoneLast = v;
review();
return;
}
var pos = phoneEl.selectionStart == null ? v.length : phoneEl.selectionStart, before = v.slice(0, pos).replace(/\D/g, '').length;
if (e.inputType === 'deleteContentBackward' && v.replace(/\D/g, '') === phoneLast.replace(/\D/g, '') && before > 0) {
var dg = v.replace(/\D/g, '');
v = dg.slice(0, before - 1) + dg.slice(before);
before--;
}
var out = fmtPhone(v), i = 0, n = 0;
while (i < out.length && n < before) {
if (/\d/.test(out.charAt(i)))
n++;
i++;
}
phoneEl.value = out;
phoneLast = out;
if (document.activeElement === phoneEl)
try {
phoneEl.setSelectionRange(i, i);
}
catch (er) { }
review();
});
function needs(bad) { return bad.length > 1 ? bad.slice(0, -1).join(', ') + ' and ' + bad[bad.length - 1] : bad[0]; }
var confirmBtn = $('#bk-s4 button[type="submit"]'), payBtn = $('#bk-pay'), savedLine = $('#bk-saved'), payNote = $('#bk-pay-note'), setSends = function () { };
form.addEventListener('submit', function (e) {
e.preventDefault();
if (confirmBtn.disabled)
return;
if (FLOW !== 'old') {
holdTime();
return;
}
if (pick.svc === 'Full Glam' && looksReady()) {
status.textContent = 'Please choose your Full Glam look first.';
return;
}
if (!pick.svc || pick.svc === 'Bridal Glam' || !pick.day || pick.hour < 0) {
status.textContent = 'Please choose your service, day and time first.';
return;
}
var bad = validate(), fields = bad.filter(function (b) { return b !== 'terms' && b !== 'email'; });
if (bad.length) {
status.textContent = [fields.length ? 'Please add your ' + needs(fields) + '.' : '',
bad.indexOf('email') >= 0 ? 'Please enter a valid email so we can send your confirmation.' : '',
bad.indexOf('terms') >= 0 ? 'Please tick the box to agree to the Terms and Cancellation & Refund Policy.' : ''].filter(Boolean).join(' ');
return;
}
if ($('#f-website').value)
return;
if (isOffline()) {
status.textContent = 'You’re offline. Your details are still here. Tap Pay & Book again when you’re back online.';
return;
}
var who = 'p' + $('#f-phone').value.replace(/\D/g, '');
if (tooSoon(who)) {
status.textContent = 'You just sent a booking with this number. Please wait 2 minutes, then try again.';
return;
}
var day = longDay(pick.day), time = fmtHour(pick.hour), price = priceText(pick.svc), link = payLink(pick.svc);
var lines = ['New booking from the Glow by Launthia website', '', 'Name: ' + $('#f-name').value.trim(), 'Phone: ' + $('#f-phone').value.trim(), 'Email: ' + $('#f-email').value.trim(), 'Service: ' + pick.svc, 'Day: ' + day, 'Time: ' + time, 'Price: ' + price];
setSends = function (payment) { var msg = lines.concat('Payment: ' + payment).join('\n'); $('#bk-send-sms').href = smsHref(msg); $('#bk-send-email').href = mailHref('New booking - ' + pick.svc + ' - ' + day + ' ' + time, msg); };
busy(confirmBtn, true, 'Saving…');
status.textContent = '';
markSent(who);
var priceNum = parseInt(price.replace(/\D/g, ''), 10);
var row = { client_name: $('#f-name').value.trim(), phone: $('#f-phone').value.trim(), email: $('#f-email').value.trim(), service: pick.svc, appt_date: pick.day, appt_time: ('0' + pick.hour).slice(-2) + ':00', price_jmd: isNaN(priceNum) ? null : priceNum, terms_agreed_at: termsAt || new Date().toISOString() };
try {
dispatchEvent(new CustomEvent('glow:booked', { detail: row }));
}
catch (er) { }
saveRow('bookings', row).then(function (saved) {
busy(confirmBtn, false);
confirmBtn.disabled = true;
savedLine.textContent = saved ? 'Saved. Launthia can see your booking request.' : sbReady() ? 'We couldn’t save your request online, so please send it by text or email below.' : 'Please send your request by text or email below so Launthia gets it.';
setSends('not yet paid');
payNote.textContent = '';
$('#bk-pay-label').textContent = 'Pay ' + PRICES[pick.svc] + ' & Book';
payBtn.classList.remove('used');
payBtn.removeAttribute('aria-disabled');
if (link) {
payBtn.href = link;
payBtn.removeAttribute('role');
payBtn.removeAttribute('tabindex');
}
else {
payBtn.removeAttribute('href');
payBtn.setAttribute('role', 'button');
payBtn.tabIndex = 0;
}
mineAdd(pick.day, pick.hour);
$('#bk-d-svc').textContent = pick.svc;
$('#bk-d-day').textContent = day;
$('#bk-d-time').textContent = time;
$('#bk-d-pay').textContent = price;
form.hidden = true;
done.hidden = false;
done.classList.remove('bk-in');
nudge(done.parentNode);
if (!REDUCED) {
void done.offsetWidth;
done.classList.add('bk-in');
}
try {
done.focus({ preventScroll: true });
}
catch (er) { }
});
});
function comingSoon(e) { e.preventDefault(); payNote.textContent = 'Online payment is coming soon. Please text or email Launthia to book.'; }
payBtn.addEventListener('click', function (e) {
if (payBtn.classList.contains('used')) {
e.preventDefault();
return;
}
if (!payBtn.getAttribute('href')) {
comingSoon(e);
return;
}
if (isOffline()) {
e.preventDefault();
payNote.textContent = 'You’re offline. Please connect to the internet before you pay.';
return;
}
setSends('started on Whop’s checkout, not confirmed yet');
setTimeout(function () { payBtn.classList.add('used'); payBtn.setAttribute('aria-disabled', 'true'); payBtn.removeAttribute('href'); }, 0);
});
payBtn.addEventListener('keydown', function (e) { if (!payBtn.getAttribute('href') && !payBtn.classList.contains('used') && (e.key === 'Enter' || e.key === ' '))
comingSoon(e); });
$('#bk-again').addEventListener('click', function () {
pick = { svc: '', day: '', hour: -1 };
form.reset();
termsAt = '';
review();
status.textContent = '';
savedLine.textContent = '';
payNote.textContent = '';
confirmBtn.disabled = false;
svcBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
quote.hidden = stepDay.hidden = stepTime.hidden = stepYou.hidden = true;
done.hidden = true;
form.hidden = false;
renderCal(0);
nudge(form.parentNode);
svcBtns[0].focus({ preventScroll: true });
});
$('#bk-change-sms').href = smsHref('');
var TZ = 'America/Jamaica';
var step5 = $('#bk-s5'), methodsEl = $('#bk-methods'), panel = $('#bk-panel'), payStatus = $('#bk-pay-status'), result = $('#bk-result');
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function plainSp(t) { return String(t).replace(/[   ]/g, ' '); }
function jmTime(iso) { return plainSp(new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })); }
function jmDay(iso) { return plainSp(new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })); }
function jmKey(iso) { var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)), o = {}; p.forEach(function (x) { o[x.type] = x.value; }); return o.year + '-' + o.month + '-' + o.day; }
function jmd(n) { return 'JMD $' + Number(n).toLocaleString('en-US'); }
function usd(n) { return 'USD $' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function money(n, c) { return c === 'USD' ? usd(n) : jmd(n); }
var KEY_OF = { 'Soft Glam': 'soft-glam', 'Full Glam': 'full-glam', 'Bridal Glam': 'bridal-glam', 'Natural Full Glam': 'full-glam-natural', 'Statement Full Glam': 'full-glam-statement' };
function svcOf(name) { return LIVE ? LIVE.services.filter(function (x) { return KEY_OF[name] ? x.slug === KEY_OF[name] : x.name === name; })[0] || null : null; }
function svcPrice(sv) { return !sv ? '' : sv.bookable_online && sv.price_jmd != null ? jmd(sv.price_jmd) : (sv.price_note || 'Price on request'); }
function priceLine(sv, name) {
if (sv.bookable_online && sv.price_jmd != null)
return svcPrice(sv);
if (name === 'Bridal Glam')
return 'Quote by text or email';
return sv.price_note ? 'JMD ' + sv.price_note.replace(/^JMD\s*/, '') : 'Price by message';
}
function api(action, body) {
if (FLOW === 'preview')
return PV.call(action, body || {});
var c = sbCfg(), ctrl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctrl)
ctrl.abort(); }, 20000);
return fetch(c.url.replace(/\/+$/, '') + '/functions/v1/checkout', {
method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey },
body: JSON.stringify(Object.assign({ action: action }, body || {})), signal: ctrl ? ctrl.signal : undefined
}).then(function (r) {
clearTimeout(t);
return r.json().catch(function () { return {}; }).then(function (j) {
if (!r.ok) {
var er = new Error(j && j.error || 'Something went wrong. Please try again.');
er.status = r.status;
er.body = j;
throw er;
}
return j;
});
}, function () { clearTimeout(t); var er = new Error(isOffline() ? 'You’re offline. Please connect to the internet and try again.' : 'We couldn’t reach the booking system. Please try again.'); er.status = 0; throw er; });
}
function hm(t) { var p = String(t).split(':'), h = +p[0], m = +p[1]; return (h % 12 || 12) + (m ? ':' + ('0' + m).slice(-2) : '') + (h < 12 ? 'am' : 'pm'); }
function showBookingMsg(accepting, msg) {
var m = $('#bk-msg');
if (!m)
return;
var t = accepting === false ? 'Online booking is paused right now. Please text or call Launthia to book.' + (msg ? ' ' + msg : '') : (msg || '');
m.textContent = t;
m.hidden = !t;
m.classList.toggle('paused', accepting === false);
}
addEventListener('glow:schedule', function (e) { var r = (e.detail || {}).rules || {}; showBookingMsg(r.accepting, r.notice || ''); });
function applyOptions(o) {
showBookingMsg(o && o.accepting, o && o.message);
var open = [0, 0, 0, 0, 0, 0, 0], first = {};
(o.hours || []).forEach(function (h) { open[h.weekday] = 1; var f = first[h.weekday]; if (!f)
first[h.weekday] = { start: h.start, end: h.end };
else {
if (h.start < f.start)
f.start = h.start;
if (h.end > f.end)
f.end = h.end;
} });
LIVE = { services: o.services || [], methods: (o.payment_methods || []).filter(function (m) { return !!NAMES[m.method]; }), open: open, hold: o.hold_minutes || 15, paused: o.accepting === false };
var days = DAYS.map(function (_, i) { var h = first[i]; return h ? { open: h.start, close: h.end } : null; });
var el = $('#bk-hours'), order = [1, 2, 3, 4, 5, 6, 0], parts = [], i = 0;
function same(a, b) { return a === b || (a && b && a.open === b.open && a.close === b.close); }
while (i < order.length) {
var v = days[order[i]], j = i;
while (j + 1 < order.length && same(days[order[j + 1]], v))
j++;
var span = j > i ? DAYS[order[i]] + ' to ' + DAYS[order[j]] : DAYS[order[i]];
parts.push(v ? span + ', ' + hm(v.open) + ' to ' + hm(v.close) : span + ' closed');
i = j + 1;
}
if (el)
el.textContent = parts.join(' · ');
maxDay = new Date(day0);
maxDay.setDate(maxDay.getDate() + (o.max_days_ahead || 90));
MAX_KEY = ymd(maxDay);
$$('.bk-svc[data-extra]', form).forEach(function (b) { b.remove(); });
svcBtns = svcBtns.filter(function (b) { return !b.hasAttribute('data-extra'); });
var used = {};
svcBtns.forEach(function (b) {
var sv = svcOf(b.dataset.value);
b.hidden = !sv;
if (!sv)
return;
used[sv.id] = 1;
var nm = $('.bk-svc-name', b);
if (nm && sv.name !== b.dataset.value)
nm.textContent = sv.name;
var pr = $('.bk-svc-price', b);
if (pr)
pr.textContent = priceLine(sv, b.dataset.value);
});
var list = $('.bk-svcs', form);
LIVE.services.forEach(function (sv) {
if (used[sv.id] || sv.parent_slug)
return;
var b = document.createElement('button'), th = el('span', 'bk-thumb'), tx = el('span', 'bk-svc-text');
b.type = 'button';
b.className = 'bk-svc';
b.dataset.value = sv.name;
b.setAttribute('data-extra', '');
b.setAttribute('aria-pressed', 'false');
th.setAttribute('aria-hidden', 'true');
var path = String(sv.image_path || '');
if (path && !/^site:/.test(path) && FLOW === 'live') {
var im = document.createElement('img');
im.alt = '';
im.loading = 'lazy';
im.src = sbCfg().url.replace(/\/+$/, '') + '/storage/v1/object/public/service-images/' + path.split('/').map(encodeURIComponent).join('/');
th.appendChild(im);
}
else
th.appendChild(el('span', 'bk-mono', sv.name.charAt(0)));
tx.appendChild(el('span', 'bk-svc-name', sv.name));
tx.appendChild(el('span', 'bk-svc-price', priceLine(sv, sv.name)));
b.appendChild(th);
b.appendChild(tx);
var tick = el('span', 'bk-tick');
tick.setAttribute('aria-hidden', 'true');
tick.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
b.appendChild(tick);
b.addEventListener('click', function () { setService(sv.name, true); });
list.appendChild(b);
svcBtns.push(b);
});
$('#f-email-note').textContent = 'Your confirmation and receipt will be emailed here once your payment is confirmed.';
$('#bk-review-note').textContent = 'Next, choose how to pay. Your time is held for ' + LIVE.hold + ' minutes while you pay.';
$('#bk-submit-label').textContent = 'Continue to payment';
if (pick.svc)
setService(pick.svc, false);
else
renderCal(0);
}
function setQuote(name, sv) {
var bridal = name === 'Bridal Glam';
var msg = bridal ? BRIDAL_MSG : 'Hi Launthia, I’d like to book ' + name + ' on ___ at ___. Could you confirm the price?';
$('#bk-quote-text').textContent = bridal ? 'Bridal is priced on request. Send your quote request to Launthia by text or email.'
: name + (sv && sv.price_note ? ' is ' + sv.price_note.replace(/^JMD\s*/, 'JMD ') + ', and Launthia confirms the price with you' : ' is priced by Launthia') + ', so it’s booked by message for now. Text or email her with the day and time you’d like.';
$('#bk-quote-sms-label').textContent = bridal ? 'Get a quote by text' : 'Book by text';
$('#bk-quote-email-label').textContent = bridal ? 'Get a quote by email' : 'Book by email';
$('#bk-quote-wa-text').textContent = bridal ? 'For bridal prices, message Launthia on WhatsApp.' : 'Or message Launthia on WhatsApp.';
$('#bk-quote-sms').href = smsHref(msg);
$('#bk-quote-email').href = mailHref(bridal ? 'Bridal quote request' : name + ' booking request', msg);
}
function addDays(key, n) { var d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function loadDays(sid) {
if (sid in CHECKED) {
renderCal(0);
return;
}
CHECKED[sid] = null;
renderCal(0);
var start = ymd(day0), mid = addDays(start, 61), parts = [[start, mid < MAX_KEY ? mid : MAX_KEY]];
if (mid < MAX_KEY)
parts.push([addDays(mid, 1), MAX_KEY]);
Promise.all(parts.map(function (r) { return api('days', { service_id: sid, from: r[0], to: r[1] }).then(function (x) { return { r: r, days: x.days || [] }; }); })).then(function (res) {
var got = {};
res.forEach(function (x) { for (var k = x.r[0]; k <= x.r[1]; k = addDays(k, 1))
got[k] = false; x.days.forEach(function (k) { got[k] = true; }); });
CHECKED[sid] = got;
if (pick.sid === sid) {
renderCal(0);
if (pick.day && !got[pick.day]) {
pick.day = '';
pick.slot = '';
stepTime.hidden = stepYou.hidden = true;
}
}
}, function (er) { delete CHECKED[sid]; if (pick.sid === sid) {
status.textContent = er.message;
renderCal(0);
} });
}
function renderLiveTimes() {
var day = pick.day, sid = pick.sid;
$('#bk-when').textContent = longDay(day).replace(/ \d{4}$/, '');
timesEl.innerHTML = '<p class="form-fine">Finding free times…</p>';
timeKey.hidden = true;
api('slots', { service_id: sid, day: day }).then(function (x) {
if (pick.day !== day || pick.sid !== sid)
return;
SLOTS = (x.slots || []).filter(function (sl) { return !OFF[jmKey(sl.slot_start)]; });
timesEl.innerHTML = '';
if (!SLOTS.length) {
timesEl.innerHTML = '<p class="form-fine">No free times are left on this day. Please pick another day.</p>';
if (CHECKED[sid])
CHECKED[sid][day] = false;
renderCal(0);
pick.slot = '';
stepYou.hidden = true;
return;
}
SLOTS.forEach(function (sl) {
var b = document.createElement('button'), t = jmTime(sl.slot_start), m = t.match(/^(\d+:\d\d)\s*(AM|PM)$/i);
b.type = 'button';
b.className = 'bk-time';
b.dataset.slot = sl.slot_start;
b.innerHTML = m ? m[1] + '<small>' + m[2].toLowerCase() + '</small>' : t;
b.setAttribute('aria-label', t);
b.setAttribute('aria-pressed', String(sl.slot_start === pick.slot));
timesEl.appendChild(b);
});
if (pick.slot && !SLOTS.some(function (sl) { return sl.slot_start === pick.slot; })) {
pick.slot = '';
stepYou.hidden = true;
review();
}
}, function (er) { if (pick.day === day)
timesEl.innerHTML = ''; status.textContent = er.message; });
}
function holdTime() {
if (!pick.sid || !pick.day || !pick.slot) {
status.textContent = 'Please choose your service, day and time first.';
return;
}
var bad = validate(), fields = bad.filter(function (b) { return b !== 'terms' && b !== 'email'; });
if (bad.length) {
status.textContent = [fields.length ? 'Please add your ' + needs(fields) + '.' : '',
bad.indexOf('email') >= 0 ? 'Please enter a valid email so we can send your confirmation.' : '',
bad.indexOf('terms') >= 0 ? 'Please tick the box to agree to the Terms and Cancellation & Refund Policy.' : ''].filter(Boolean).join(' ');
return;
}
if ($('#f-website').value)
return;
if (FLOW === 'live' && isOffline()) {
status.textContent = 'You’re offline. Your details are still here. Try again when you’re back online.';
return;
}
busy(confirmBtn, true, 'Holding your time…');
status.textContent = '';
api('hold', { service_id: pick.sid, start: pick.slot, name: $('#f-name').value.trim(), email: $('#f-email').value.trim(), phone: $('#f-phone').value.trim(), agree_terms: true, company: $('#f-website').value })
.then(function (h) {
busy(confirmBtn, false);
confirmBtn.disabled = false;
HOLD = { id: h.booking_id, reference: h.reference || '', until: h.hold_expires_at, service: h.service, starts_at: h.starts_at, amount_jmd: h.amount_jmd, name: $('#f-name').value.trim(), phone: $('#f-phone').value.trim(), email: $('#f-email').value.trim() };
openPay('');
}, function (er) {
busy(confirmBtn, false);
confirmBtn.disabled = false;
status.textContent = er.message;
if (er.status === 409 && /no longer available|just taken/.test(er.message)) {
pick.slot = '';
renderTimes();
}
});
}
var ICONS = {
card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 9.5h18M6.5 15h4"/></svg>',
bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9 12 4.5 20.5 9Z"/><path d="M5.5 9.5v8M10 9.5v8M14 9.5v8M18.5 9.5v8M3.5 20h17"/></svg>',
cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
paypal: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z"/></svg>',
zelle: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.559 24h-2.841a.483.483 0 0 1-.483-.483v-2.765H5.638a.667.667 0 0 1-.666-.666v-2.234a.67.67 0 0 1 .142-.412l8.139-10.382h-7.25a.667.667 0 0 1-.667-.667V3.914c0-.367.299-.666.666-.666h4.23V.483c0-.266.217-.483.483-.483h2.841c.266 0 .483.217.483.483v2.765h4.323c.367 0 .666.299.666.666v2.137a.67.67 0 0 1-.141.41l-8.19 10.481h7.665c.367 0 .666.299.666.666v2.477a.667.667 0 0 1-.666.667h-4.32v2.765a.483.483 0 0 1-.483.483Z"/></svg>'
};
var NAMES = { bank: 'Bank transfer', paypal: 'PayPal', cash: 'Pay in person' };
var BRAND = { paypal: true, zelle: true };
function methodBadge(m) {
if (!m.available)
return ['Being set up', ''];
if (m.method === 'paypal' && m.status === 'test')
return ['Test mode', 'test'];
return ['', ''];
}
var holdTick = 0, holdWarned = false;
function openPay(intro) {
step5.hidden = false;
form.hidden = true;
result.hidden = true;
done.hidden = true;
$('#bk-preview').hidden = FLOW !== 'preview';
$('#bk-pay-intro').textContent = intro || '';
$('#bk-p-svc').textContent = HOLD.service;
$('#bk-p-day').textContent = jmDay(HOLD.starts_at);
$('#bk-p-time').textContent = jmTime(HOLD.starts_at) + ' (Jamaica time)';
$('#bk-p-total').textContent = jmd(HOLD.amount_jmd);
$('#bk-p-ref').textContent = HOLD.reference || '';
$('#bk-p-ref-row').hidden = !HOLD.reference;
closeSheet(false);
methodsEl.innerHTML = '';
panel.innerHTML = '';
payStatus.textContent = '';
var shown = (LIVE.methods || []).filter(function (m) { return m.available; });
var online = shown.filter(function (m) { return m.method !== 'cash'; }), inPerson = shown.filter(function (m) { return m.method === 'cash'; });
var both = online.length && inPerson.length;
if (both)
methodsEl.appendChild(el('p', 'bk-m-group', 'Pay online now'));
online.concat(inPerson).forEach(function (m) {
if (both && m.method === 'cash')
methodsEl.appendChild(el('p', 'bk-m-group', 'Or pay at your appointment'));
var isLink = m.method === 'paypal' && m.status === 'link';
var b = document.createElement(isLink ? 'a' : 'button'), badge = methodBadge(m);
if (isLink) {
b.target = '_blank';
b.rel = 'noopener noreferrer';
}
else
b.type = 'button';
b.className = 'bk-method';
b.dataset.method = m.method;
b.setAttribute('role', 'radio');
b.setAttribute('aria-checked', 'false');
b.innerHTML = '<span class="bk-m-icon' + (BRAND[m.method] ? ' brand ' + m.method : '') + '">' + (ICONS[m.method] || ICONS.card) + '</span><span class="bk-m-text"><span class="bk-m-name"></span></span>' + (badge[0] ? '<span class="bk-m-badge ' + badge[1] + '"></span>' : '');
$('.bk-m-name', b).textContent = NAMES[m.method] || m.label;
if (badge[0])
$('.bk-m-badge', b).textContent = badge[0];
if (!m.available) {
b.disabled = true;
b.setAttribute('aria-disabled', 'true');
}
methodsEl.appendChild(b);
});
ppPrefetch();
var firstOn = $('.bk-method:not(:disabled)', methodsEl);
if (firstOn)
firstOn.tabIndex = 0;
$$('.bk-method', methodsEl).forEach(function (b) { if (b !== firstOn)
b.tabIndex = -1; });
if (!firstOn)
payStatus.textContent = 'Online payment isn’t switched on yet. Please text or call Launthia to book.';
step5.classList.remove('bk-in');
nudge(step5.parentNode);
if (!REDUCED) {
void step5.offsetWidth;
step5.classList.add('bk-in');
}
try {
step5.focus({ preventScroll: true });
}
catch (er) { }
holdWarned = false;
clearInterval(holdTick);
tickHold();
holdTick = setInterval(tickHold, 1000);
}
function tickHold() {
if (!HOLD || !HOLD.until)
return;
var left = Math.max(0, Date.parse(HOLD.until) - Date.now()), sec = Math.ceil(left / 1000);
$('#bk-hold-left').textContent = Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2);
$('#bk-hold').classList.toggle('low', sec <= 120);
$('#bk-sheet-left').textContent = $('#bk-hold-left').textContent;
if (sec <= 120 && !holdWarned && sec > 0) {
holdWarned = true;
payStatus.textContent = 'About 2 minutes left to finish paying.';
}
if (left <= 0)
holdEnded();
}
function holdEnded() {
clearInterval(holdTick);
closeSheet(false);
$$('.bk-method', methodsEl).forEach(function (b) { b.disabled = true; });
payStatus.innerHTML = '';
var p = document.createElement('span');
p.textContent = 'Your hold has ended, so the time is free again. ';
payStatus.appendChild(p);
var a = document.createElement('button');
a.type = 'button';
a.className = 'link-arrow';
a.textContent = 'Pick a time again';
a.addEventListener('click', function () { backToTimes(false); });
payStatus.appendChild(a);
}
function backToTimes(toStart) {
closeSheet(false);
clearInterval(holdTick);
HOLD = null;
confirmBtn.disabled = false;
step5.hidden = true;
result.hidden = true;
form.hidden = false;
if (pick.sid && pick.day) {
pick.slot = '';
delete CHECKED[pick.sid];
loadDays(pick.sid);
renderTimes();
show(stepTime, !toStart);
stepYou.hidden = true;
}
else
resetFlow();
if (toStart) {
nudge($('#bk-s1'));
var sb = $('.bk-svc[aria-pressed="true"]', form) || $('.bk-svc', form);
if (sb)
try {
sb.focus({ preventScroll: true });
}
catch (er) { }
}
}
function goBack(toStart) {
var id = HOLD && HOLD.id;
if (id)
api('release', { booking_id: id }).catch(function () { });
backToTimes(toStart);
}
$('#bk-change-time').addEventListener('click', function () { goBack(false); });
$('#bk-back').addEventListener('click', function () { goBack(true); });
methodsEl.addEventListener('click', function (e) {
var b = e.target.closest('.bk-method');
if (!b || b.disabled)
return;
chooseMethod(b.dataset.method, b);
});
methodsEl.addEventListener('keydown', function (e) {
var all = $$('.bk-method:not(:disabled)', methodsEl), i = all.indexOf(document.activeElement);
if (i < 0)
return;
var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
if (!d)
return;
e.preventDefault();
var n = all[(i + d + all.length) % all.length];
all.forEach(function (x) { x.tabIndex = -1; x.setAttribute('aria-checked', String(x === n)); });
n.tabIndex = 0;
n.focus();
});
function el(tag, cls, text) { var x = document.createElement(tag); if (cls)
x.className = cls; if (text != null)
x.textContent = text; return x; }
var sheet = $('#bk-sheet'), sheetCard = $('#bk-sheet-card'), sheetFrom = null, statusHome = payStatus.parentNode, statusNext = payStatus.nextSibling, ppBusy = false;
document.body.appendChild(sheet);
function openSheet(method, btn) {
sheetFrom = btn || null;
$('#bk-sheet-title').textContent = NAMES[method] || 'Pay';
var ic = $('#bk-sheet-icon');
ic.className = 'bk-m-icon' + (BRAND[method] ? ' brand ' + method : '');
ic.innerHTML = ICONS[method] || '';
$('#bk-sheet-what').textContent = HOLD.service + ' · ' + jmDay(HOLD.starts_at) + ', ' + jmTime(HOLD.starts_at);
panel.innerHTML = '';
ppBusy = false;
sheetCard.appendChild(payStatus);
payStatus.textContent = '';
if (sheet.hidden) {
sheet.hidden = false;
document.documentElement.classList.add('lb-lock');
sheet.classList.remove('bk-sheet-in');
if (!REDUCED) {
void sheet.offsetWidth;
sheet.classList.add('bk-sheet-in');
}
}
sheetCard.scrollTop = 0;
tickHold();
try {
sheetCard.focus({ preventScroll: true });
}
catch (er) { }
}
function closeSheet(back) {
if (sheet.hidden)
return;
sheet.hidden = true;
sheet.classList.remove('bk-sheet-in');
document.documentElement.classList.remove('lb-lock');
panel.innerHTML = '';
ppBusy = false;
if (statusNext && statusNext.parentNode === statusHome)
statusHome.insertBefore(payStatus, statusNext);
else
statusHome.appendChild(payStatus);
$$('.bk-method', methodsEl).forEach(function (x) { x.setAttribute('aria-checked', 'false'); });
if (back && sheetFrom && sheetFrom.isConnected)
try {
sheetFrom.focus({ preventScroll: true });
}
catch (er) { }
}
function userClose() { if (ppBusy)
return; closeSheet(true); }
$('#bk-sheet-x').addEventListener('click', userClose);
sheet.addEventListener('click', function (e) { if (e.target === sheet)
userClose(); });
sheet.addEventListener('keydown', function (e) {
if (e.key === 'Escape') {
e.preventDefault();
userClose();
return;
}
if (e.key !== 'Tab')
return;
var f = $$('button:not([disabled]), input:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])', sheetCard).filter(function (x) { return x.getClientRects().length > 0; });
if (!f.length)
return;
var first = f[0], last = f[f.length - 1], at = document.activeElement;
if (e.shiftKey && (at === first || at === sheetCard)) {
e.preventDefault();
last.focus();
}
else if (!e.shiftKey && at === last) {
e.preventDefault();
first.focus();
}
});
function chooseMethod(method, btn, byKeys) {
if (!HOLD)
return;
$$('.bk-method', methodsEl).forEach(function (x) { x.setAttribute('aria-checked', String(x === btn)); x.tabIndex = x === btn ? 0 : -1; });
var m = (LIVE.methods || []).filter(function (x) { return x.method === method; })[0] || {};
if (method === 'paypal' && m.status === 'link') {
payPalLink(btn);
return;
}
openSheet(method, btn);
btn && btn.setAttribute('aria-checked', 'true');
if (method === 'paypal') {
payPalSheet(m);
return;
}
if (method === 'cash') {
cashSheet(m);
return;
}
if (method === 'zelle' && zePre && zePre.id === HOLD.id) {
var zm = String(zePre.x.instructions || '').match(EMAIL_RE);
manualPanel('zelle', zePre.x);
if (zm)
copyText(zm[0]).then(function () { payStatus.textContent = 'Launthia’s Zelle email is copied – paste it in Zelle in your bank’s app.'; }, function () { });
return;
}
if (method === 'zelle' || method === 'bank') {
var wait = el('p', 'form-fine', method === 'bank' ? 'Getting the bank details…' : 'Getting Launthia’s ' + NAMES[method] + ' details…');
panel.appendChild(wait);
var at = HOLD.id;
api('pay', { booking_id: at, method: method }).then(function (x) {
if (!HOLD || HOLD.id !== at || sheet.hidden)
return;
if (x.hold_expires_at)
HOLD.until = x.hold_expires_at;
manualPanel(method, x);
}, function (er) {
if (er.status === 409 && /no longer held/i.test(er.message)) {
holdEnded();
return;
}
if (sheet.hidden)
return;
panel.innerHTML = '';
payStatus.textContent = er.message;
});
return;
}
closeSheet(false);
payStatus.textContent = 'Please choose another way to pay.';
}
var ppAway = null, ppPre = null, zePre = null;
var EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
function ppPrefetch() {
ppPre = null;
var m = (LIVE.methods || []).filter(function (z) { return z.method === 'paypal'; })[0];
if (!HOLD)
return;
var at = HOLD.id;
if (!m || m.status !== 'link' || !m.available) {
ppZelle(at);
return;
}
api('pay', { booking_id: at, method: 'paypal' }).then(function (x) {
if (!HOLD || HOLD.id !== at)
return;
var mail = String(x.instructions || '').match(EMAIL_RE);
if (!mail)
return;
ppPre = { id: at, x: x, url: ppUrl(x, mail[0]) };
var a = $('a.bk-method[data-method="paypal"]', methodsEl);
if (a)
a.href = ppPre.url;
}, function () { });
ppZelle(at);
}
function ppZelle(at) {
zePre = null;
var z = (LIVE.methods || []).filter(function (y) { return y.method === 'zelle'; })[0];
if (z && z.available) {
api('pay', { booking_id: at, method: 'zelle' }).then(function (x) { if (HOLD && HOLD.id === at && x.instructions)
zePre = { id: at, x: x }; }, function () { });
}
}
function ppUrl(x, mail) {
return 'https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=' + encodeURIComponent(mail)
+ '&item_name=' + encodeURIComponent('Glow by Launthia – ' + HOLD.service + ', ' + jmDay(HOLD.starts_at) + ', ' + jmTime(HOLD.starts_at))
+ '&currency_code=USD&no_shipping=1&no_note=1';
}
function ppFinish() {
if (!ppAway || !HOLD || HOLD.id !== ppAway.id)
return;
var a = ppAway;
openSheet('paypal', a.btn);
manualPanel('paypal', a.x);
}
function ppOpened(at, x, url, btn, w) {
ppAway = { id: at, x: x, btn: btn, url: url };
payStatus.textContent = '';
var done = el('button', 'btn bk-wide bk-pp-done ' + (w ? 'btn-dark' : 'btn-ghost'));
done.type = 'button';
done.textContent = 'I’ve paid on PayPal';
done.addEventListener('click', ppFinish);
if (w) {
payStatus.appendChild(done);
return;
}
var open = outLink('btn btn-dark bk-wide bk-pp-open', url, 'Open PayPal');
open.addEventListener('click', function () { done.className = 'btn btn-dark bk-wide bk-pp-done'; });
payStatus.appendChild(open);
payStatus.appendChild(done);
}
function payPalLink(btn) {
var at = HOLD.id, w = null;
if (ppPre && ppPre.id === at) {
if (btn && btn.tagName === 'A' && btn.href === ppPre.url) {
ppOpened(at, ppPre.x, ppPre.url, btn, true);
return;
}
try {
w = window.open(ppPre.url, '_blank');
if (w)
try {
w.opener = null;
}
catch (e2) { }
}
catch (er) {
w = null;
}
ppOpened(at, ppPre.x, ppPre.url, btn, w);
return;
}
try {
w = window.open('', '_blank');
if (w)
w.opener = null;
}
catch (er) {
w = null;
}
payStatus.textContent = 'Opening PayPal…';
api('pay', { booking_id: at, method: 'paypal' }).then(function (x) {
if (!HOLD || HOLD.id !== at) {
if (w)
try {
w.close();
}
catch (er) { }
return;
}
if (x.hold_expires_at)
HOLD.until = x.hold_expires_at;
var mail = String(x.instructions || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
if (!mail) {
if (w)
try {
w.close();
}
catch (er) { }
payStatus.textContent = 'PayPal isn’t ready yet. Please choose another way to pay.';
return;
}
var url = ppUrl(x, mail[0]);
if (w)
try {
w.location.href = url;
}
catch (er) {
w = null;
}
ppOpened(at, x, url, btn, w);
}, function (er) {
if (w)
try {
w.close();
}
catch (e2) { }
payStatus.textContent = er.message;
if (er.status === 409 && /no longer held/i.test(er.message))
holdEnded();
});
}
document.addEventListener('visibilitychange', function () {
if (document.visibilityState === 'visible' && ppAway && sheet.hidden && !step5.hidden && HOLD && HOLD.id === ppAway.id)
ppFinish();
});
function cashSheet(m) {
var at = HOLD.id;
var amt = el('div', 'bk-amount');
amt.appendChild(el('span', '', 'Pay at your appointment'));
amt.appendChild(el('strong', '', jmd(HOLD.amount_jmd)));
amt.appendChild(el('small', '', 'in cash, to Launthia'));
panel.appendChild(amt);
panel.appendChild(el('p', 'form-fine', 'Your time is booked as soon as you tap below, and you pay in cash when you arrive. Your booking confirmation comes by email.'));
panel.appendChild(el('p', 'form-fine', 'If you can’t make it, please let Launthia know as early as you can.'));
var go = el('button', 'btn btn-dark bk-wide');
go.type = 'button';
go.textContent = 'Book – I’ll pay in person';
go.addEventListener('click', function () {
if (FLOW === 'live' && isOffline()) {
payStatus.textContent = 'You’re offline. Please connect to the internet and try again.';
return;
}
busy(go, true, 'Booking…');
payStatus.textContent = '';
api('in_person', { booking_id: at }).then(function (r) {
var h = HOLD, when = jmDay(h.starts_at) + ', ' + jmTime(h.starts_at) + ' (Jamaica time)';
tellLaunthia({
_subject: 'New booking – pay in person (cash) – ' + h.service + ' – ' + jmDay(h.starts_at) + ', ' + jmTime(h.starts_at),
message: 'A client booked and will pay you in cash at the appointment. When they pay, tap Cash received on the booking in your dashboard.',
'Way to pay': 'Pay in person (cash)', 'To pay at the appointment': jmd(h.amount_jmd) + ' in cash', 'Booking reference': r.reference,
'Client': h.name, 'Phone': h.phone, 'Service': h.service, 'Day and time': when
});
if (FLOW === 'preview')
try {
dispatchEvent(new CustomEvent('glow:booked', { detail: { client_name: h.name, phone: h.phone, email: h.email, service: h.service, appt_date: jmKey(h.starts_at), appt_time: jmTime24(h.starts_at), price_jmd: h.amount_jmd, terms_agreed_at: termsAt || new Date().toISOString(), status: 'Confirmed', payment_method: 'cash', reference: r.reference } }));
}
catch (er) { }
showResult('cash', { reference: r.reference, hold: h });
}, function (er) { busy(go, false); if (er.status === 409 && /no longer held/i.test(er.message))
holdEnded();
else
payStatus.textContent = er.message; });
});
panel.appendChild(go);
}
var ppLoad = null;
function rateText(m) { var r = Number(m.jmd_per_usd); return r > 0 ? 'Launthia’s rate: 1 US dollar = ' + r.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' JMD' + (FLOW === 'preview' ? ' (example rate)' : '') : ''; }
function usdOf(m) { var r = Number(m.jmd_per_usd); if (!(r > 0) || typeof HOLD.amount_jmd !== 'number')
return null; return Math.ceil(HOLD.amount_jmd * 100 / r - 1e-9) / 100; }
function loadPayPal(m) {
if (window.paypal && typeof window.paypal.Buttons === 'function')
return Promise.resolve(window.paypal);
var id = String(m.client_id || ''), base = String(m.sdk_url || ''), cur = /^[A-Z]{3}$/.test(m.currency || '') ? m.currency : 'USD';
if (!/^[A-Za-z0-9_-]{10,200}$/.test(id) || (base !== 'https://www.paypal.com/sdk/js' && base !== 'https://www.sandbox.paypal.com/sdk/js'))
return Promise.reject(new Error('PayPal is not set up'));
if (!ppLoad)
ppLoad = new Promise(function (ok, no) {
var sc = document.createElement('script'), settled = false;
sc.src = base + '?client-id=' + encodeURIComponent(id) + '&currency=' + cur + '&intent=capture&components=buttons&commit=true&disable-funding=paylater,venmo,credit';
sc.async = true;
sc.onload = function () { settled = true; if (window.paypal && typeof window.paypal.Buttons === 'function')
ok(window.paypal);
else {
ppLoad = null;
no(new Error('PayPal did not load'));
} };
sc.onerror = function () { settled = true; ppLoad = null; sc.remove(); no(new Error('PayPal did not load')); };
setTimeout(function () { if (!settled) {
settled = true;
ppLoad = null;
no(new Error('PayPal is slow to load'));
} }, 15000);
document.head.appendChild(sc);
});
return ppLoad;
}
function payPalSheet(m) {
var usd = usdOf(m), at = HOLD.id;
var amt = el('div', 'bk-amount');
amt.appendChild(el('span', '', 'You pay'));
amt.appendChild(el('strong', '', usd != null ? money(usd, 'USD') : jmd(HOLD.amount_jmd)));
amt.appendChild(el('small', '', usd != null ? 'for ' + jmd(HOLD.amount_jmd) + ' · PayPal charges in US dollars' : 'charged in US dollars at Launthia’s rate'));
if (usd != null)
amt.appendChild(el('small', 'bk-rate', rateText(m)));
panel.appendChild(amt);
if (m.status === 'test' && FLOW !== 'preview')
panel.appendChild(el('p', 'bk-test', 'TEST MODE – no real money is taken.'));
panel.appendChild(el('p', 'form-fine', 'Pay with your PayPal account or a debit or credit card. PayPal’s secure window opens in front of this page, so you stay on this site, and the money goes straight to Launthia.'));
var box = el('div', 'bk-pp');
box.id = 'bk-pp-buttons';
panel.appendChild(box);
if (FLOW === 'preview') {
box.appendChild(el('p', 'bk-test', 'Preview: on the live site PayPal’s own secure window opens right here, with the amount filled in. Nothing is charged in this preview.'));
var demo = el('button', 'btn btn-dark bk-wide');
demo.type = 'button';
demo.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><span>Try paying (preview)</span>';
demo.addEventListener('click', function () {
busy(demo, true, 'Paying…');
api('pay', { booking_id: at, method: 'paypal', popup: true, funding: 'paypal' }).then(function (x) {
return api('paypal_return', { booking_id: at, order_id: x.order_id });
}).then(function (out) {
var h = HOLD;
closeSheet(false);
try {
dispatchEvent(new CustomEvent('glow:booked', { detail: { client_name: h.name, phone: h.phone, email: h.email, service: h.service, appt_date: jmKey(h.starts_at), appt_time: jmTime24(h.starts_at), price_jmd: h.amount_jmd, terms_agreed_at: termsAt || new Date().toISOString(), status: 'Confirmed', payment_method: 'paypal', reference: out.reference } }));
}
catch (er) { }
paypalOutcome(at, out);
}, function (er) { busy(demo, false); payStatus.textContent = er.message; });
});
box.appendChild(demo);
return;
}
box.appendChild(el('p', 'form-fine', 'Opening PayPal…'));
var fb = el('button', 'btn btn-ghost bk-wide');
fb.type = 'button';
fb.hidden = true;
fb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><span>Pay on PayPal’s page</span>';
fb.addEventListener('click', function () { payPal(fb); });
panel.appendChild(fb);
function fallback() {
if (!panel.contains(box))
return;
box.innerHTML = '';
box.appendChild(el('p', 'form-fine', 'PayPal’s window can’t open here, so you can pay on PayPal’s own page instead. You’ll come straight back.'));
fb.hidden = false;
}
if (FLOW === 'live' && isOffline()) {
box.innerHTML = '';
payStatus.textContent = 'You’re offline. Please connect to the internet before you pay.';
return;
}
loadPayPal(m).then(function (paypal) {
if (!HOLD || HOLD.id !== at || !panel.contains(box))
return;
var btns;
try {
btns = paypal.Buttons({
style: { layout: 'vertical', shape: 'pill', color: 'gold', label: 'pay', height: 48, tagline: false },
createOrder: function (data) {
payStatus.textContent = '';
ppBusy = true;
return api('pay', { booking_id: at, method: 'paypal', popup: true, funding: data && data.paymentSource ? String(data.paymentSource) : 'paypal' }).then(function (x) {
if (HOLD && HOLD.id === at && x.hold_expires_at)
HOLD.until = x.hold_expires_at;
return x.order_id;
}, function (er) {
ppBusy = false;
if (er.status === 409 && /no longer held/i.test(er.message))
holdEnded();
else
payStatus.textContent = er.message;
throw er;
});
},
onApprove: function (data) {
ppBusy = false;
closeSheet(false);
showResult('checking', {});
return api('paypal_return', { booking_id: at, order_id: data && data.orderID }).then(function (out) { paypalOutcome(at, out); }, function (er) {
showResult('problem', { title: 'One <em>moment.</em>', message: er.message, text: 'Please don’t pay again.', retry: function () { afterPayPal(at); } });
});
},
onCancel: function (data) {
ppBusy = false;
if (sheet.hidden)
return;
payStatus.textContent = 'You closed PayPal before paying, so nothing was charged. You can try again, or choose another way to pay.';
if (data && data.orderID)
api('paypal_cancel', { booking_id: at, order_id: data.orderID }).then(function (out) {
if (out && out.status && out.status !== 'cancelled') {
closeSheet(false);
paypalOutcome(at, out);
}
}, function () { });
},
onError: function () {
ppBusy = false;
if (sheet.hidden || payStatus.textContent)
return;
payStatus.textContent = 'PayPal had a problem, so nothing was charged. Please try again, or choose another way to pay.';
}
});
}
catch (er) {
fallback();
return;
}
if (!btns.isEligible()) {
fallback();
return;
}
box.innerHTML = '';
btns.render(box).catch(fallback);
}, fallback);
}
function payPal(go) {
if (FLOW === 'live' && isOffline()) {
payStatus.textContent = 'You’re offline. Please connect to the internet before you pay.';
return;
}
busy(go, true, 'Opening PayPal…');
payStatus.textContent = '';
api('pay', { booking_id: HOLD.id, method: 'paypal' }).then(function (x) {
if (x.preview) {
busy(go, false);
payStatus.textContent = x.message;
return;
}
var ok = false;
try {
var u = new URL(x.redirect_url);
ok = u.protocol === 'https:' && /(^|\.)paypal\.com$/.test(u.hostname);
}
catch (er) { }
if (!ok) {
busy(go, false);
payStatus.textContent = 'PayPal isn’t answering right now. Please try again in a moment.';
return;
}
location.assign(x.redirect_url);
}, function (er) { busy(go, false); payStatus.textContent = er.message; if (er.status === 409 && /no longer held/i.test(er.message))
holdEnded(); });
}
function copyBtn(text, label, said) {
var b = el('button', 'bk-copy', 'Copy');
b.type = 'button';
b.setAttribute('aria-label', label);
b.addEventListener('click', function () {
copyText(text).then(function () { b.textContent = 'Copied'; payStatus.textContent = said; setTimeout(function () { b.textContent = 'Copy'; }, 2200); }, function () { payStatus.textContent = 'Couldn’t copy it here. Please type it in.'; });
});
return b;
}
function copyText(t) {
return new Promise(function (ok, no) {
function old() {
var ta = document.createElement('textarea');
ta.value = t;
ta.setAttribute('readonly', '');
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
var done = false;
try {
done = document.execCommand('copy');
}
catch (er) { }
ta.remove();
done ? ok() : no();
}
if (navigator.clipboard && window.isSecureContext)
navigator.clipboard.writeText(t).then(ok, old);
else
old();
});
}
var BANK_APPS = [
{ test: /^\s*(ncb\b|national commercial)/i, pay: 'Pay with NCB', app: 'the NCB app', web: 'https://www.jncb.com/', webName: 'NCB Online Banking', android: 'com.jncb.mobile', ios: '1435405040' },
{ test: /scotia/i, pay: 'Pay with Scotiabank', app: 'the Scotiabank app', web: 'https://jm.scotiabank.com/', webName: 'Scotia OnLine', android: 'com.scotiabank.cca.mobile', ios: '1461469582' }
];
function bankApp(a) { var n = String(a && a.bank || ''); for (var i = 0; i < BANK_APPS.length; i++)
if (BANK_APPS[i].test.test(n))
return BANK_APPS[i]; return null; }
function phoneOS() {
var ua = navigator.userAgent || '';
if (/Android/i.test(ua))
return 'android';
if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
return 'ios';
return '';
}
function storeLink(app, os) { return os === 'android' ? 'https://play.google.com/store/apps/details?id=' + app.android : 'https://apps.apple.com/app/id' + app.ios; }
function outLink(cls, href, text) { var a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
var ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>';
var CHEV_R = '<svg class="bk-bank-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
function acctDigits(a) { return String(a && a.account_number || '').replace(/[^0-9]/g, ''); }
function acctCard(a) {
var c = el('div', 'bk-acct'), dl = el('dl'), h = el('p', 'bk-acct-bank', a.bank || '');
h.tabIndex = -1;
c.appendChild(h);
[['Account name', a.account_name], ['Account number', a.account_number], ['Branch', a.branch], ['Account type', a.account_type]].forEach(function (r) {
if (!r[1])
return;
var d = el('div'), dd = el('dd');
d.appendChild(el('dt', '', r[0]));
if (r[0] === 'Account name') {
dd.appendChild(el('span', '', r[1]));
dd.appendChild(copyBtn(String(r[1]), 'Copy the account name', 'Account name copied.'));
}
else if (r[0] === 'Account number') {
dd.appendChild(el('span', 'bk-acct-no', r[1]));
var digits = acctDigits(a);
if (digits)
dd.appendChild(copyBtn(digits, 'Copy the ' + (a.bank || '') + ' account number', (a.bank ? a.bank + ' account' : 'Account') + ' number copied.'));
}
else
dd.textContent = r[1];
d.appendChild(dd);
dl.appendChild(d);
});
c.appendChild(dl);
return c;
}
function bankChooser(x, accts, from) {
panel.innerHTML = '';
var box = el('div', 'bk-view');
panel.appendChild(box);
var amt = el('div', 'bk-amount');
amt.appendChild(el('span', '', 'To pay'));
amt.appendChild(el('strong', '', x.amount != null ? money(x.amount, x.currency) : jmd(x.amount_jmd)));
box.appendChild(amt);
var g = el('div', 'bk-banks'), gh = el('p', 'bk-accts-h', 'Choose the account to pay into');
gh.id = 'bk-banks-h';
g.setAttribute('role', 'group');
g.setAttribute('aria-labelledby', 'bk-banks-h');
box.appendChild(gh);
accts.forEach(function (a, i) {
var b = el('button', 'bk-bank');
b.type = 'button';
b.dataset.acct = String(i + 1);
b.innerHTML = '<span class="bk-m-icon" aria-hidden="true">' + ICONS.bank + '</span><span class="bk-bank-name"></span>' + CHEV_R;
$('.bk-bank-name', b).textContent = a.bank || ('Account ' + (i + 1));
b.addEventListener('click', function () {
payStatus.textContent = '';
manualPanel('bank', x, i);
sheetCard.scrollTop = 0;
var h = $('.bk-acct-bank', panel);
if (h)
try {
h.focus({ preventScroll: true });
}
catch (er) { }
});
g.appendChild(b);
});
box.appendChild(g);
if (from != null) {
var back = $('.bk-bank[data-acct="' + (from + 1) + '"]', g);
if (back)
try {
back.focus({ preventScroll: true });
}
catch (er) { }
}
}
function formspreeUrl() {
var f = String(window.FORMSPREE_FORM || '').trim();
if (/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+\/?$/.test(f))
return f.replace(/\/$/, '');
if (/^[A-Za-z0-9]{6,}$/.test(f))
return 'https://formspree.io/f/' + f;
return '';
}
function tellLaunthia(fields) {
var url = formspreeUrl();
if (!url || FLOW !== 'live')
return;
var body = {};
Object.keys(fields).forEach(function (k) { if (fields[k] != null && String(fields[k]).trim() !== '')
body[k] = String(fields[k]); });
try {
fetch(url, { method: 'POST', mode: 'cors', keepalive: true, headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function () { });
}
catch (er) { }
}
var bankAway = null;
document.addEventListener('visibilitychange', function () {
if (document.visibilityState !== 'visible' || !bankAway)
return;
var b = bankAway;
bankAway = null;
if (!b.isConnected || sheet.hidden)
return;
try {
b.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
}
catch (er) { }
payStatus.textContent = 'Welcome back. Once your transfer has gone through, tap “I’ve sent the payment”.';
});
function manualPanel(method, x, pick) {
var name = NAMES[method], bank = method === 'bank', pp = method === 'paypal', accts = bank && Array.isArray(x.accounts) ? x.accounts : [];
if (bank && accts.length > 1 && pick == null) {
bankChooser(x, accts);
return;
}
panel.innerHTML = '';
var at = bank ? (pick == null ? 0 : pick) : -1, acct = bank ? accts[at] || null : null, sent = el('button', 'btn btn-dark bk-wide'), sub = null;
var box = el('div', 'bk-view' + (bank && pick != null && !REDUCED ? ' bk-rise' : ''));
panel.appendChild(box);
if (bank && accts.length > 1) {
var back = el('button', 'bk-back bk-acct-back');
back.type = 'button';
back.innerHTML = ARROW_L + '<span>Other account</span>';
back.setAttribute('aria-label', 'Back – choose the other account');
back.addEventListener('click', function () { payStatus.textContent = ''; bankChooser(x, accts, at); });
box.appendChild(back);
}
if (acct)
box.appendChild(acctCard(acct));
var amt = el('div', 'bk-amount');
amt.appendChild(el('span', '', pp ? 'To pay on PayPal' : 'Send exactly'));
if (x.amount != null) {
var line = el('div', 'bk-copy-row');
line.appendChild(el('strong', '', money(x.amount, x.currency)));
var exact = x.currency === 'JMD' ? String(Math.round(Number(x.amount))) : Number(x.amount).toFixed(2);
line.appendChild(copyBtn(exact, 'Copy the amount', 'Amount copied.'));
amt.appendChild(line);
if (x.currency !== 'JMD') {
amt.appendChild(el('small', '', 'for ' + jmd(x.amount_jmd)));
var mm = (LIVE.methods || []).filter(function (z) { return z.method === method; })[0];
if (mm && mm.jmd_per_usd)
amt.appendChild(el('small', 'bk-rate', rateText(mm)));
}
}
else {
amt.appendChild(el('strong', '', 'The US dollar amount for ' + jmd(x.amount_jmd)));
amt.appendChild(el('small', '', 'Launthia’s exchange rate is shown here once she sets it.'));
}
if (!pp && method !== 'zelle')
box.appendChild(amt);
if (bank) {
if (x.preview)
box.appendChild(el('p', 'bk-test', 'Preview: the real account details are shown here only on the live site, to a client who is paying.'));
if (x.instructions) {
var note = el('div', 'bk-to');
note.appendChild(el('b', '', 'Please note'));
note.appendChild(document.createTextNode(x.instructions));
box.appendChild(note);
}
var bref = HOLD.reference || '';
if (bref) {
var rb = el('div', 'bk-amount bk-bref');
rb.appendChild(el('span', '', 'Booking reference'));
var rbl = el('div', 'bk-copy-row');
rbl.appendChild(el('strong', 'bk-ref', bref));
rbl.appendChild(copyBtn(bref, 'Copy the booking reference', 'Booking reference copied.'));
rb.appendChild(rbl);
rb.appendChild(el('small', '', 'Put it in your transfer’s description, so Launthia can match your payment.'));
box.appendChild(rb);
}
var allTxt = [];
if (acct) {
[['Bank', acct.bank], ['Account name', acct.account_name], ['Account number', acct.account_number], ['Branch', acct.branch], ['Account type', acct.account_type]].forEach(function (r) { if (r[1])
allTxt.push(r[0] + ': ' + r[1]); });
}
if (x.amount != null)
allTxt.push('Amount: ' + money(x.amount, x.currency));
if (bref)
allTxt.push('Reference: ' + bref);
var all = el('button', 'btn btn-ghost bk-wide bk-copyall');
all.type = 'button';
all.textContent = 'Copy all details';
all.addEventListener('click', function () {
copyText(allTxt.join('\n')).then(function () { all.textContent = 'Copied ✓'; payStatus.textContent = 'All the payment details are copied.'; setTimeout(function () { all.textContent = 'Copy all details'; }, 2200); }, function () { payStatus.textContent = 'Couldn’t copy here. Please copy each detail with its own Copy button.'; });
});
box.appendChild(all);
var how = el('ol', 'bk-steps');
['Keep this page open, and open your own bank’s app or online banking.',
'Send exactly ' + (x.amount != null ? money(x.amount, x.currency) : jmd(x.amount_jmd)) + ' to the account above.',
bref ? 'Put ' + bref + ' in the transfer’s description.' : 'Put your name in the transfer’s description.',
'Come back here and tap “I’ve Made My Payment”.'].forEach(function (t) { how.appendChild(el('li', '', t)); });
box.appendChild(how);
box.appendChild(el('p', 'form-fine', 'Bank transfers are made in your own banking app or online banking – this website can’t move money for you. Glow by Launthia will never ask for your banking password, PIN or one-time code.'));
var made = el('button', 'btn btn-dark bk-wide bk-made');
made.type = 'button';
made.textContent = 'I’ve Made My Payment';
box.appendChild(made);
sub = el('div', 'bk-view bk-submit');
sub.hidden = true;
sub.appendChild(el('p', 'bk-then', 'Your payment details'));
made.addEventListener('click', function () {
made.hidden = true;
sub.hidden = false;
payStatus.textContent = '';
if (!REDUCED) {
sub.classList.remove('bk-rise');
void sub.offsetWidth;
sub.classList.add('bk-rise');
}
try {
sub.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
}
catch (er) { }
try {
i1.focus({ preventScroll: true });
}
catch (er) { }
});
}
else if (pp) {
box.appendChild(el('p', 'bk-then', 'Paid on PayPal? Finish here'));
}
else {
var to = el('div', 'bk-to');
to.appendChild(el('b', '', 'Send it to'));
to.appendChild(document.createTextNode(x.instructions || ''));
var mail = String(x.instructions || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
if (mail) {
var cr = el('div', 'bk-copy-row');
cr.style.marginTop = '10px';
cr.appendChild(copyBtn(mail[0], 'Copy the Zelle email', 'Zelle email copied.'));
to.appendChild(cr);
}
box.appendChild(to);
if (method === 'zelle')
box.appendChild(el('p', 'bk-then', 'Sent it? Finish here'));
}
var refId = 'bk-ref-' + method, fromId = 'bk-from-' + method;
var f1 = el('div', 'field'), l1 = el('label'), i1 = el('input');
if (bank) {
l1.appendChild(document.createTextNode('Transaction reference '));
l1.appendChild(el('small', '', '(or confirmation number, from your bank’s receipt)'));
}
else if (pp) {
l1.appendChild(document.createTextNode('PayPal transaction ID '));
l1.appendChild(el('small', '', '(optional – from PayPal’s receipt)'));
}
else
l1.textContent = 'Zelle confirmation number';
l1.htmlFor = refId;
i1.id = refId;
i1.type = 'text';
i1.maxLength = 60;
i1.autocomplete = 'off';
i1.required = !pp;
f1.appendChild(l1);
f1.appendChild(i1);
var f2 = el('div', 'field'), l2 = el('label', '', bank ? 'Name on your bank account' : pp ? 'Name on your PayPal account' : 'Name it was sent from'), i2 = el('input');
l2.htmlFor = fromId;
i2.id = fromId;
i2.type = 'text';
i2.maxLength = 80;
i2.autocomplete = 'name';
i2.required = true;
i2.value = HOLD.name || '';
f2.appendChild(l2);
f2.appendChild(i2);
var rf = null, rcF = null, rcI = null, rcData = null, rcBusy = false;
if (bank) {
rcF = el('div', 'field');
var rcL = el('label');
rcL.appendChild(document.createTextNode('Receipt or screenshot '));
rcL.appendChild(el('small', '', '(optional – JPG, PNG, WebP or PDF, up to 5 MB)'));
rcI = el('input');
rcI.type = 'file';
rcI.id = 'bk-receipt';
rcI.accept = 'image/jpeg,image/png,image/webp,application/pdf';
rcL.htmlFor = rcI.id;
var rcN = el('p', 'form-fine bk-rc-note');
rcN.setAttribute('aria-live', 'polite');
rcF.appendChild(rcL);
rcF.appendChild(rcI);
rcF.appendChild(rcN);
rcI.addEventListener('change', function () {
rcData = null;
rcF.classList.remove('invalid');
rcN.textContent = '';
var f = rcI.files && rcI.files[0];
if (!f)
return;
if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type) || f.size > 5 * 1024 * 1024 || f.size < 16) {
rcI.value = '';
rcF.classList.add('invalid');
rcN.textContent = 'Please choose a photo (JPG, PNG or WebP) or a PDF, no bigger than 5 MB.';
return;
}
rcBusy = true;
var fr = new FileReader();
fr.onload = function () { rcBusy = false; var u = String(fr.result || ''), c = u.indexOf(','); rcData = { name: f.name.slice(0, 80), type: f.type, data: u.slice(c + 1), url: u }; rcN.textContent = 'Added: ' + f.name; };
fr.onerror = function () { rcBusy = false; rcI.value = ''; rcN.textContent = 'That file couldn’t be read. Please try another one.'; };
fr.readAsDataURL(f);
});
rf = {};
var rfh = el('p', 'form-fine bk-rf-h', 'Your account, so Launthia can refund you if she ever has to cancel');
var mk = function (key, label, attrs) {
var f = el('div', 'field'), l = el('label', '', label), i = el(attrs.select ? 'select' : 'input');
i.id = 'bk-rf-' + key;
if (attrs.select) {
i.className = 'bk-select';
attrs.select.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; i.appendChild(op); });
}
else {
i.type = 'text';
i.maxLength = attrs.max;
i.autocomplete = 'off';
if (attrs.mode)
i.inputMode = attrs.mode;
}
i.required = true;
l.htmlFor = i.id;
f.appendChild(l);
f.appendChild(i);
rf[key] = { f: f, i: i };
return f;
};
sub.appendChild(f1);
sub.appendChild(rcF);
sub.appendChild(f2);
sub.appendChild(rfh);
sub.appendChild(mk('bank', 'Your bank', { max: 60 }));
sub.appendChild(mk('no', 'Your account number', { max: 24, mode: 'numeric' }));
sub.appendChild(mk('branch', 'Your branch', { max: 60 }));
sub.appendChild(mk('type', 'Account type', { select: [['', 'Choose…'], ['Savings', 'Savings'], ['Chequing', 'Chequing']] }));
}
else if (pp) {
box.appendChild(f2);
box.appendChild(f1);
}
else {
box.appendChild(f1);
box.appendChild(f2);
}
(bank ? sub : box).appendChild(el('p', 'form-fine', bank || pp ? 'Launthia confirms your booking once the money arrives. A screenshot alone can’t confirm it. Your time is kept for you until she checks.'
: 'Launthia confirms your booking once the money is in her account. A screenshot alone can’t confirm it. Your time is kept for you until she checks.'));
sent.type = 'button';
sent.textContent = pp ? 'I’ve paid on PayPal' : bank ? 'Submit payment details' : 'I’ve sent the payment';
sent.addEventListener('click', function () {
var ref = i1.value.trim(), from = i2.value.trim(), sentTo = acct ? String(at + 1) : '', adds = [];
var refBad = pp ? (ref.length > 0 && ref.length < 4) : ref.length < 4;
if (bank && rcBusy) {
payStatus.textContent = 'Your receipt is still being added. Please try again in a moment.';
return;
}
f1.classList.toggle('invalid', refBad);
f2.classList.toggle('invalid', from.length < 2);
if (refBad)
adds.push(bank ? 'the transaction reference from your bank’s receipt' : pp ? 'the full PayPal transaction ID (or leave it empty)' : 'the Zelle confirmation number');
if (from.length < 2)
adds.push(bank ? 'the name on your bank account' : pp ? 'the name on your PayPal account' : 'the name it was sent from');
var refund = null, rfBad = null;
if (rf) {
refund = { bank: rf.bank.i.value.trim(), account_number: rf.no.i.value.trim(), branch: rf.branch.i.value.trim(), account_type: rf.type.i.value };
var okB = refund.bank.length >= 2, okN = /^[0-9][0-9 -]{3,22}[0-9]$/.test(refund.account_number), okR = refund.branch.length >= 2, okT = refund.account_type === 'Savings' || refund.account_type === 'Chequing';
rf.bank.f.classList.toggle('invalid', !okB);
rf.no.f.classList.toggle('invalid', !okN);
rf.branch.f.classList.toggle('invalid', !okR);
rf.type.f.classList.toggle('invalid', !okT);
var miss = [];
if (!okB)
miss.push('your bank');
if (!okN)
miss.push('your account number');
if (!okR)
miss.push('your branch');
if (!okT)
miss.push('the account type');
if (miss.length) {
adds.push(miss.join(', '));
rfBad = !okB ? rf.bank.i : !okN ? rf.no.i : !okR ? rf.branch.i : rf.type.i;
}
}
if (bank && !acct) {
payStatus.textContent = 'The bank details aren’t ready yet. Please choose another way to pay.';
return;
}
if (adds.length) {
payStatus.textContent = 'Please add ' + adds.join(' and ') + '.';
(refBad ? i1 : from.length < 2 ? i2 : rfBad || i2).focus();
return;
}
if (FLOW === 'live' && isOffline()) {
payStatus.textContent = 'You’re offline. Please connect to the internet and try again.';
return;
}
busy(sent, true, 'Sending…');
payStatus.textContent = '';
var body = { booking_id: HOLD.id, method: method, reference: ref, sender_name: from };
if (bank) {
body.sent_to = sentTo;
body.refund = refund;
if (rcData)
body.receipt = { name: rcData.name, type: rcData.type, data: rcData.data };
}
api('manual_submit', body).then(function (r) {
clearInterval(holdTick);
if (pp)
ppAway = null;
var h = HOLD, when = jmDay(h.starts_at) + ', ' + jmTime(h.starts_at) + ' (Jamaica time)', last4 = acct ? acctDigits(acct).slice(-4) : '';
tellLaunthia({
_subject: (bank ? 'Bank transfer' : name + ' payment') + ' sent to you – please check – ' + h.service + ' – ' + jmDay(h.starts_at) + ', ' + jmTime(h.starts_at),
message: 'A client says they have sent this payment. Please check that the money is in your account, then tap Money received in your dashboard. Don’t confirm from a screenshot or a message alone.',
'Way to pay': name,
'Amount to look for': r.amount != null ? money(r.amount, r.currency) : 'The US dollar amount for ' + jmd(h.amount_jmd),
'Sent to': acct ? (acct.bank || '') + (last4.length === 4 ? ' (account ending ' + last4 + ')' : '') : '',
'Their account (for a refund)': refund ? refund.bank + ' (account ending ' + refund.account_number.replace(/[^0-9]/g, '').slice(-4) + '), ' + refund.branch + ' branch, ' + refund.account_type + ' – full details in your dashboard' : '',
'Booking reference': h.reference || '',
'Transaction reference': ref,
'Receipt': bank ? (rcData ? 'Added – open it on the booking in your dashboard' : 'None') : '',
'Sent from': from,
'Client': h.name,
'Phone': h.phone,
'Service': h.service,
'Day and time': when
});
if (FLOW === 'preview')
try {
dispatchEvent(new CustomEvent('glow:booked', { detail: { client_name: h.name, phone: h.phone, email: h.email, service: h.service, appt_date: jmKey(h.starts_at), appt_time: jmTime24(h.starts_at), price_jmd: h.amount_jmd, terms_agreed_at: termsAt || new Date().toISOString(), status: 'Pending payment', payment_method: method, reference: ref, sender_name: from, sent_to: acct ? acct.bank : '', booking_id: h.id,
refund_text: refund ? refund.bank + ', ' + from + ', account ' + refund.account_number + ', ' + refund.branch + ' branch, ' + refund.account_type : '',
booking_ref: h.reference || '', receipt_url: rcData ? rcData.url : '' } }));
}
catch (er) { }
showResult('pending', { method: method, amount: r.amount, currency: r.currency, hold: h, txref: ref, receipt: bank ? (rcData ? (r.receipt === 'not saved' ? 'failed' : 'added') : 'none') : '' });
}, function (er) { busy(sent, false); payStatus.textContent = er.message; if (er.status === 409 && /no longer held/i.test(er.message))
holdEnded(); });
});
(bank ? sub : box).appendChild(sent);
if (bank)
box.appendChild(sub);
}
function jmTime24(iso) { var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); return plainSp(p).replace(/^24/, '00'); }
function row(dl, k, v, cls) { var d = el('div'); d.appendChild(el('dt', '', k)); var dd = el('dd', cls || '', v); d.appendChild(dd); dl.appendChild(d); }
var paidWatch = null;
function watchPaid(id) {
stopWatch();
var busyNow = false, check = function () {
if (busyNow || !paidWatch || paidWatch.id !== id || result.hidden)
return;
busyNow = true;
api('status', { booking_id: id }).then(function (st) {
busyNow = false;
if (!paidWatch || paidWatch.id !== id)
return;
if (/^(Confirmed|Paid|Done)$/.test(st.status)) {
stopWatch();
showResult('confirmed', { reference: st.reference, message: 'Payment received – your booking is confirmed.', st: st });
}
else if (/^(Expired|Cancelled)$/.test(st.status)) {
stopWatch();
showResult('failed', { title: 'Payment not <em>found.</em>', message: 'Launthia couldn’t find your transfer, so this time has been released.', text: 'If you did send it, please call or message her and she will sort it out with you.' });
}
}, function () { busyNow = false; });
};
paidWatch = { id: id, timer: setInterval(check, 15000), check: check };
}
function stopWatch() { if (paidWatch) {
clearInterval(paidWatch.timer);
paidWatch = null;
} }
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && paidWatch)
paidWatch.check(); });
addEventListener('glow:verified', function () { if (paidWatch)
setTimeout(function () { if (paidWatch)
paidWatch.check(); }, 400); });
function showResult(kind, d) {
if (!(kind === 'pending' && (d.method === 'bank' || d.method === 'paypal')))
stopWatch();
closeSheet(false);
clearInterval(holdTick);
var t = { title: '', lead: '', text: '' }, sum = $('#bk-r-sum'), acts = $('#bk-r-actions');
sum.innerHTML = '';
acts.innerHTML = '';
if (kind === 'pending') {
var nm = NAMES[d.method];
if (d.method === 'bank') {
t.title = 'Thank <em>you.</em>';
t.lead = 'Payment details received – awaiting verification.';
t.text = 'Launthia will check that your transfer has arrived in her account, then confirm your booking. This page updates by itself, and your confirmation and receipt come by email. Your time is kept for you.'
+ (d.receipt === 'failed' ? ' (Your receipt couldn’t be uploaded, but your payment details were received.)' : '');
watchPaid(d.hold.id);
}
else if (d.method === 'paypal') {
t.title = 'Thank <em>you.</em>';
t.lead = 'Waiting for Launthia to confirm your payment.';
t.text = 'Your time is kept for you. As soon as she sees your ' + (d.method === 'bank' ? 'transfer' : 'PayPal payment') + ' arrive, this page shows “You’re booked” and your confirmation and receipt come by email.';
watchPaid(d.hold.id);
}
else {
t.title = 'Thank <em>you.</em>';
t.lead = 'Your payment is being checked.';
t.text = 'Launthia will confirm your booking as soon as she sees your ' + nm + ' payment in her account. You’ll get your confirmation and receipt by email then. Your time is kept for you.';
}
if (d.method === 'bank' && d.hold.reference)
row(sum, 'Booking reference', d.hold.reference, 'bk-ref');
row(sum, 'Service', d.hold.service);
row(sum, 'Day', jmDay(d.hold.starts_at));
row(sum, 'Time', jmTime(d.hold.starts_at));
if (d.method === 'bank') {
if (d.amount != null)
row(sum, 'Sent by bank transfer', money(d.amount, d.currency));
if (d.txref)
row(sum, 'Transaction reference', d.txref);
row(sum, 'Receipt', d.receipt === 'added' ? 'Added' : d.receipt === 'failed' ? 'Not uploaded' : 'Not added');
row(sum, 'Status', 'Awaiting verification');
}
else {
row(sum, 'Way to pay', nm);
row(sum, 'Booking price', jmd(d.hold.amount_jmd));
}
}
else if (kind === 'cash') {
t.title = 'You’re <em>booked.</em>';
t.lead = 'Please pay ' + jmd(d.hold.amount_jmd) + ' in cash at your appointment.';
t.text = 'Your booking confirmation is on its way to your email.';
if (d.reference)
row(sum, 'Booking reference', d.reference, 'bk-ref');
row(sum, 'Service', d.hold.service);
row(sum, 'Day', jmDay(d.hold.starts_at));
row(sum, 'Time', jmTime(d.hold.starts_at));
row(sum, 'To pay at your appointment', jmd(d.hold.amount_jmd));
}
else if (kind === 'checking') {
t.title = 'One <em>moment.</em>';
t.lead = 'Confirming your payment with PayPal…';
}
else if (kind === 'confirmed') {
t.title = 'You’re <em>booked.</em>';
t.lead = d.message || 'Payment received – your booking is confirmed.';
t.text = 'A confirmation and a receipt are on their way to your email.' + (d.test ? ' This was a TEST payment: no real money was taken.' : '');
if (d.reference)
row(sum, 'Booking reference', d.reference, 'bk-ref');
if (d.st) {
row(sum, 'Service', d.st.service);
row(sum, 'Day', jmDay(d.st.starts_at));
row(sum, 'Time', jmTime(d.st.starts_at));
if (d.st.payment)
row(sum, 'Paid', money(d.st.payment.amount, d.st.payment.currency));
}
}
else {
t.title = d.title || 'Payment not <em>finished.</em>';
t.lead = d.message || 'Something went wrong.';
t.text = d.text || '';
if (d.retry) {
var again = el('button', 'btn btn-dark');
again.type = 'button';
again.textContent = 'Check again';
again.addEventListener('click', d.retry);
acts.appendChild(again);
}
var pickAgain = el('button', d.retry ? 'btn btn-ghost' : 'btn btn-dark');
pickAgain.type = 'button';
pickAgain.textContent = 'Pick a time';
pickAgain.addEventListener('click', resetFlow);
acts.appendChild(pickAgain);
}
var booked = kind === 'cash' || kind === 'confirmed', ck = $('#bk-r-check');
ck.hidden = !booked;
$('#bk-r-mark').hidden = booked;
ck.classList.remove('go');
if (booked && !REDUCED) {
void ck.offsetWidth;
ck.classList.add('go');
}
$('#bk-r-title').innerHTML = t.title;
$('#bk-r-lead').textContent = t.lead;
$('#bk-r-text').textContent = t.text;
$('#bk-r-text').hidden = !t.text;
sum.hidden = !sum.children.length;
acts.hidden = !acts.children.length;
$('#bk-r-preview').hidden = FLOW !== 'preview';
$('#bk-r-note').hidden = kind === 'checking';
$('#bk-r-again').parentNode.hidden = kind === 'checking';
step5.hidden = true;
form.hidden = true;
done.hidden = true;
result.hidden = false;
result.classList.remove('bk-in');
nudge(result.parentNode);
if (!REDUCED) {
void result.offsetWidth;
result.classList.add('bk-in');
}
try {
result.focus({ preventScroll: true });
}
catch (er) { }
}
function resetFlow() {
clearInterval(holdTick);
HOLD = null;
pick = { svc: '', day: '', hour: -1, sid: '', slot: '' };
form.reset();
termsAt = '';
review();
status.textContent = '';
confirmBtn.disabled = false;
svcBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
quote.hidden = stepDay.hidden = stepTime.hidden = stepYou.hidden = true;
step5.hidden = true;
result.hidden = true;
done.hidden = true;
form.hidden = false;
CHECKED = {};
renderCal(0);
nudge(form.parentNode);
var first = svcBtns.filter(function (b) { return !b.hidden; })[0];
if (first)
first.focus({ preventScroll: true });
}
$('#bk-r-again').addEventListener('click', resetFlow);
var OUT_TEXT = {
pending: ['Almost <em>there.</em>', 'PayPal is still processing your payment.'],
needs_attention: ['Payment <em>received.</em>', ''],
not_charged: ['Not <em>charged.</em>', ''],
declined: ['Payment not <em>finished.</em>', ''],
not_approved: ['Payment not <em>finished.</em>', ''],
already_paid: ['Already <em>paid.</em>', ''],
error: ['One <em>moment.</em>', '']
};
function afterPayPal(id) {
showResult('checking', {});
api('paypal_return', { booking_id: id }).then(function (out) { paypalOutcome(id, out); }, function (er) {
showResult('problem', { title: 'One <em>moment.</em>', message: er.message, text: 'Please don’t pay again.', retry: function () { afterPayPal(id); } });
});
}
function paypalOutcome(id, out) {
if (out.status === 'confirmed' || out.status === 'already_paid') {
api('status', { booking_id: id }).then(function (st) {
if (out.status === 'confirmed') {
var h = HOLD && HOLD.id === id ? HOLD : null;
tellLaunthia({ _subject: 'New paid booking (PayPal) – ' + st.service + ' – ' + jmDay(st.starts_at) + ', ' + jmTime(st.starts_at),
message: 'A client paid online with PayPal. The booking is confirmed.', 'Way to pay': 'PayPal (paid online)' + (out.test_mode ? ' – TEST' : ''),
'Paid': st.payment ? money(st.payment.amount, st.payment.currency) : '', 'Booking reference': out.reference || st.reference,
'Client': h ? h.name : '', 'Phone': h ? h.phone : '', 'Service': st.service, 'Day and time': jmDay(st.starts_at) + ', ' + jmTime(st.starts_at) + ' (Jamaica time)' });
}
showResult('confirmed', { reference: out.reference || st.reference, message: out.message, st: st, test: !!out.test_mode });
}, function () { showResult('confirmed', { reference: out.reference, message: out.message, test: !!out.test_mode }); });
return;
}
var tx = OUT_TEXT[out.status] || OUT_TEXT.error;
showResult('problem', { title: tx[0], message: out.message || tx[1], text: out.retry ? 'Please don’t pay again.' : '', retry: out.retry ? function () { afterPayPal(id); } : null });
}
function cameBackFromPayPal(id) {
showResult('checking', {});
api('paypal_cancel', { booking_id: id }).then(function (out) {
if (out.status !== 'cancelled') {
paypalOutcome(id, out);
return;
}
api('status', { booking_id: id }).then(function (st) {
if (st.status === 'Held' && st.hold_expires_at && Date.parse(st.hold_expires_at) > Date.now()) {
HOLD = { id: id, reference: st.reference || '', until: st.hold_expires_at, service: st.service, starts_at: st.starts_at, amount_jmd: st.amount_jmd, name: '', phone: '', email: '' };
openPay(out.message + ' You can choose another way to pay below.');
}
else
showResult('problem', { title: 'Not <em>charged.</em>', message: out.message, text: 'Your hold has ended, so please pick your time again.' });
}, function () { showResult('problem', { title: 'Not <em>charged.</em>', message: out.message }); });
}, function (er) { showResult('problem', { message: er.message, retry: function () { cameBackFromPayPal(id); } }); });
}
function returnFromPayPal() {
var q = new URLSearchParams(location.search), gp = q.get('glow_pay'), id = q.get('booking') || '';
if ((gp !== 'paypal' && gp !== 'paypal_cancel') || !UUID_RE.test(id))
return;
try {
history.replaceState(null, '', location.pathname + '#book');
}
catch (er) { }
var bookEl = $('#book .form-card') || $('#book');
if (bookEl) {
var y = bookEl.getBoundingClientRect().top + scrollY - 80;
if (window.glowScrollTo)
glowScrollTo(y);
else
scrollTo(0, y);
}
if (gp === 'paypal')
afterPayPal(id);
else
cameBackFromPayPal(id);
}
var PVRATE = 150;
addEventListener('glow:rate', function (e) { var r = Number(e.detail && e.detail.rate); if (r > 0) {
PVRATE = r;
if (FLOW === 'preview')
applyOptions(PV.options());
} });
function pvUsd(j) { return typeof j === 'number' ? Math.ceil(j * 100 / PVRATE - 1e-9) / 100 : null; }
var PV = (function () {
var held = {}, n = 0;
function priceOf(t) { t = String(t || '').replace(/^\$/, '').trim(); return /^[0-9][0-9,]*(\.\d+)?$/.test(t) ? Math.round(parseFloat(t.replace(/,/g, ''))) : null; }
function services() {
var sg = priceOf(window.SOFT_GLAM_PRICE), fg = priceOf(window.FULL_GLAM_PRICE), fn = priceOf(window.FULL_GLAM_NATURAL_PRICE), fs = priceOf(window.FULL_GLAM_STATEMENT_PRICE);
return [
{ id: '00000000-0000-4000-8000-000000000001', slug: 'soft-glam', name: 'Soft Glam', price_jmd: sg, price_note: sg == null ? 'JMD ' + String(window.SOFT_GLAM_PRICE || '').replace(/^\$/, '') : null, duration_minutes: 60, bookable_online: sg != null },
{ id: '00000000-0000-4000-8000-000000000002', slug: 'full-glam', name: 'Full Glam', price_jmd: fg, price_note: fg == null ? 'JMD $' + String(window.FULL_GLAM_PRICE || '').replace(/^\$/, '') : null, duration_minutes: 60, bookable_online: fg != null },
{ id: '00000000-0000-4000-8000-000000000003', slug: 'bridal-glam', name: 'Bridal Glam', price_jmd: null, price_note: 'Pricing on request', duration_minutes: 60, bookable_online: false },
{ id: '00000000-0000-4000-8000-000000000004', slug: 'full-glam-natural', name: 'Natural Full Glam', price_jmd: fn, price_note: null, duration_minutes: 60, bookable_online: fn != null, parent_slug: 'full-glam' },
{ id: '00000000-0000-4000-8000-000000000005', slug: 'full-glam-statement', name: 'Statement Full Glam', price_jmd: fs, price_note: null, duration_minutes: 60, bookable_online: fs != null, parent_slug: 'full-glam' }
].map(function (s) {
var o = SCHED && SCHED.services && SCHED.services[s.slug];
if (o) {
s.duration_minutes = o.duration_minutes || s.duration_minutes;
s.bookable_online = s.bookable_online && o.bookable_online !== false;
if (o.description)
s.description = o.description;
}
return s;
});
}
function options() {
var R = (SCHED && SCHED.rules) || {};
var hrs = SCHED ? (SCHED.hours || []).map(function (h) { return { weekday: +h.weekday, start: String(h.start_time).slice(0, 5), end: String(h.end_time).slice(0, 5) }; }).sort(function (a, b) { return a.weekday - b.weekday || (a.start < b.start ? -1 : 1); })
: [1, 2, 3, 4, 5, 6].map(function (d) { return { weekday: d, start: '09:00', end: '17:00' }; });
return { timezone: TZ, max_days_ahead: R.max_days_ahead || 90, min_notice_minutes: R.min_notice_minutes == null ? 60 : R.min_notice_minutes, hold_minutes: 15,
accepting: R.accepting !== false, message: R.notice || null,
hours: hrs,
services: services(),
payment_methods: [
{ method: 'bank', label: 'Bank transfer', available: true, status: 'manual', currency: 'JMD' },
{ method: 'cash', label: 'Pay in person', available: true, status: 'in person', currency: 'JMD' },
PVPAY.paypal ? { method: 'paypal', label: 'PayPal', available: true, status: 'link', currency: 'USD', jmd_per_usd: PVRATE }
: { method: 'paypal', label: 'PayPal', available: true, status: 'test', note: 'TEST MODE – no real money is taken.', currency: 'USD', jmd_per_usd: PVRATE },
{ method: 'zelle', label: 'Zelle', available: true, status: 'manual', currency: 'USD', jmd_per_usd: PVRATE }
] };
}
var PVPAY = window.GLOW_PREVIEW_PAY && typeof window.GLOW_PREVIEW_PAY === 'object' ? window.GLOW_PREVIEW_PAY : {};
var INSTR = { zelle: typeof PVPAY.zelle === 'string' && PVPAY.zelle ? PVPAY.zelle : '[Owner to confirm: Zelle email or phone number, and the name on the account]' };
var PV_REAL = Array.isArray(PVPAY.accounts) && PVPAY.accounts.length > 0;
var PV_ACCTS = PV_REAL ? PVPAY.accounts : [{ bank: 'Bank account 1 (hidden in this preview)' }, { bank: 'Bank account 2 (hidden in this preview)' }];
function svc(id) { return services().filter(function (x) { return x.id === id; })[0]; }
var SCHED = null;
addEventListener('glow:schedule', function (e) { SCHED = e.detail || null; if (FLOW === 'preview') {
CHECKED = {};
applyOptions(options());
} });
function hmMin(t) { var m = String(t || '').match(/^(\d{2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; }
function slotsOf(id, day) {
var s = svc(id), out = [];
if (!s)
return out;
var R = (SCHED && SCHED.rules) || {}, so = SCHED && SCHED.services && SCHED.services[s.slug];
if (!s.bookable_online || (so && so.bookable_online === false) || R.accepting === false)
return out;
if (OFF[day] || (SCHED && (SCHED.off || []).indexOf(day) >= 0))
return out;
var dur = (so && so.duration_minutes) || s.duration_minutes, step = R.slot_step_minutes || 60, buf = R.buffer_minutes || 0, notice = R.min_notice_minutes == null ? 60 : R.min_notice_minutes, ahead = R.max_days_ahead || 90;
if (day > addDays(jmKey(new Date().toISOString()), ahead))
return out;
var dow = new Date(day + 'T12:00:00').getDay(), periods, breaks = [];
var sp = SCHED ? (SCHED.dates || []).filter(function (d) { return d.day === day; }) : [];
if (sp.length)
periods = sp;
else if (SCHED) {
periods = (SCHED.hours || []).filter(function (h) { return +h.weekday === dow; });
breaks = (SCHED.breaks || []).filter(function (b) { return +b.weekday === dow; });
}
else
periods = dow === 0 ? [] : [{ start_time: '09:00', end_time: '17:00' }];
var live = function (b) { return b.status === 'Pending payment' || b.status === 'Confirmed' || (b.status === 'Held' && b.until > Date.now()); };
if (R.max_per_day && Object.keys(held).filter(function (k) { return live(held[k]) && jmKey(new Date(held[k].start).toISOString()) === day; }).length >= R.max_per_day)
return out;
periods.forEach(function (pd) {
for (var t = hmMin(pd.start_time); t + dur <= hmMin(pd.end_time); t += step) {
var hh = ('0' + Math.floor(t / 60)).slice(-2), mm = ('0' + (t % 60)).slice(-2);
var start = new Date(day + 'T' + hh + ':' + mm + ':00-05:00'), end = new Date(+start + dur * 60000), endBuf = +end + buf * 60000;
if (+start < Date.now() + notice * 60000)
continue;
if (breaks.some(function (b) { return hmMin(b.start_time) < t + dur && t < hmMin(b.end_time); }))
continue;
if (SCHED && (SCHED.blocks || []).some(function (b) { return Date.parse(b.starts_at) < endBuf && +start < Date.parse(b.ends_at); }))
continue;
var clash = Object.keys(held).some(function (k) { var b = held[k]; return live(b) && b.start < endBuf && +start < b.end + buf * 60000; });
if (!clash)
out.push({ slot_start: start.toISOString(), slot_end: end.toISOString() });
}
});
out.sort(function (x, y) { return x.slot_start < y.slot_start ? -1 : 1; });
return out;
}
function fail(msg, code) { var e = new Error(msg); e.status = code || 409; return Promise.reject(e); }
addEventListener('glow:verified', function (e) {
var d = e.detail || {}, h = d.booking_id && held[d.booking_id];
if (!h || h.status !== 'Pending payment')
return;
if (d.received) {
h.status = 'Confirmed';
h.ref = h.ref || d.reference || 'GBL-PREVW';
}
else
h.status = 'Cancelled';
});
function call(action, b) {
return new Promise(function (r) { setTimeout(r, 220); }).then(function () {
if (action === 'days') {
var out = [];
for (var k = b.from; k <= b.to; k = addDays(k, 1))
if (slotsOf(b.service_id, k).length)
out.push(k);
return { days: out };
}
if (action === 'slots')
return { slots: slotsOf(b.service_id, b.day) };
if (action === 'hold') {
var s = svc(b.service_id);
if (!s || !s.bookable_online)
return fail('This service can’t be booked online yet. Please contact Launthia.');
if (!slotsOf(b.service_id, jmKey(b.start)).some(function (x) { return x.slot_start === b.start; }))
return fail('That time is no longer available. Please pick another time.');
var id = '00000000-0000-4000-9000-' + ('00000000000' + (++n)).slice(-12), start = Date.parse(b.start), until = Date.now() + 15 * 60000;
held[id] = { start: start, end: start + s.duration_minutes * 60000, until: until, status: 'Held', svc: s, ref: 'GBL-' + Array.apply(null, Array(6)).map(function () { return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)); }).join('') };
return { booking_id: id, reference: held[id].ref, hold_expires_at: new Date(until).toISOString(), service: s.name, starts_at: b.start, ends_at: new Date(start + s.duration_minutes * 60000).toISOString(), amount_jmd: s.price_jmd };
}
var h = held[b.booking_id];
if (action === 'status' && h)
return { status: h.status, reference: h.ref || null, service: h.svc.name, starts_at: new Date(h.start).toISOString(), ends_at: new Date(h.end).toISOString(),
amount_jmd: h.svc.price_jmd, payment: h.status === 'Confirmed' && h.paidBy !== 'cash' ? { method: h.paidBy || 'paypal', amount: h.svc.price_jmd, currency: 'JMD', status: 'succeeded', is_test: false } : null };
if (action === 'release') {
if (h && h.status === 'Held')
h.status = 'Expired';
return { released: !!h };
}
if (!h || (h.status === 'Held' && h.until <= Date.now()))
return fail('This booking is no longer held. Please pick your time again.');
if (action === 'pay') {
if (b.method === 'paypal' && PVPAY.paypal) {
h.until = Math.max(h.until, Math.min(Date.now() + 15 * 60000, h.until + 15 * 60000));
return { method: 'paypal', mode: 'link', amount: pvUsd(h.svc.price_jmd), currency: 'USD', amount_jmd: h.svc.price_jmd, instructions: PVPAY.paypal, hold_expires_at: new Date(h.until).toISOString() };
}
if (b.method === 'paypal') {
h.order = 'PREVIEW-' + (++n);
return { method: 'paypal', order_id: h.order, amount: null, currency: 'USD', amount_jmd: h.svc.price_jmd, test_mode: false };
}
if (b.method === 'bank' || INSTR[b.method])
h.until = Math.max(h.until, Math.min(Date.now() + 15 * 60000, h.until + 15 * 60000));
if (b.method === 'bank')
return { method: 'bank', preview: !PV_REAL, amount: h.svc.price_jmd, currency: 'JMD', amount_jmd: h.svc.price_jmd, instructions: null, accounts: PV_ACCTS, hold_expires_at: new Date(h.until).toISOString() };
if (INSTR[b.method])
return { method: b.method, amount: pvUsd(h.svc.price_jmd), currency: 'USD', amount_jmd: h.svc.price_jmd, instructions: INSTR[b.method], hold_expires_at: new Date(h.until).toISOString() };
return fail('Please choose a way to pay.', 400);
}
if (action === 'in_person') {
if (h.status !== 'Held')
return fail('This booking is no longer held. Please pick your time again.');
h.status = 'Confirmed';
h.ref = h.ref || 'GBL-' + Array.apply(null, Array(6)).map(function () { return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)); }).join('');
return { status: 'confirmed', reference: h.ref, payment: 'in person', amount_jmd: h.svc.price_jmd };
}
if (action === 'paypal_return') {
if (!h.order || b.order_id !== h.order)
return fail('We couldn’t find this payment.', 404);
if (h.status !== 'Confirmed') {
h.status = 'Confirmed';
h.ref = h.ref || 'GBL-' + Array.apply(null, Array(6)).map(function () { return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)); }).join('');
}
return { status: 'confirmed', reference: h.ref, message: 'Payment received – your booking is confirmed.', test_mode: false };
}
if (action === 'manual_submit') {
if (b.method !== 'bank' && !INSTR[b.method] && !(b.method === 'paypal' && PVPAY.paypal))
return fail('Please choose a way to pay.', 400);
if (b.method === 'bank' && !(/^[1-9]$/.test(String(b.sent_to || '')) && +b.sent_to <= PV_ACCTS.length))
return fail('Please choose which account you sent the money to.');
var rl = String(b.reference || '').trim().length;
if (b.receipt && !(b.receipt.data && /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(b.receipt.type || '') && b.receipt.data.length <= Math.ceil(5 * 1024 * 1024 * 4 / 3) + 8))
return fail('Please add the receipt as a photo (JPG, PNG or WebP) or a PDF, no bigger than 5 MB.', 400);
if (b.method === 'paypal' ? (rl > 0 && rl < 4) : rl < 4)
return fail(b.method === 'bank' ? 'Please enter the transaction reference from your bank’s receipt.' : b.method === 'paypal' ? 'Please check the PayPal transaction ID (or leave it empty).' : 'Please enter the Zelle confirmation number.');
h.status = 'Pending payment';
h.paidBy = b.method;
return b.method === 'bank' ? { status: 'Pending payment', method: 'bank', amount: h.svc.price_jmd, currency: 'JMD', reference: h.ref, receipt: b.receipt ? 'saved' : 'none' } : { status: 'Pending payment', method: b.method, amount: pvUsd(h.svc.price_jmd), currency: 'USD' };
}
return fail('Unknown request.', 400);
});
}
return { options: options, call: call };
})();
if (sbReady()) {
api('options').then(function (o) { FLOW = 'live'; applyOptions(o); returnFromPayPal(); }, function () { FLOW = 'old'; });
}
else if (window.GLOW_BOOKING_PREVIEW === true) {
FLOW = 'preview';
applyOptions(PV.options());
}
$$('[data-service]').forEach(function (a) { a.addEventListener('click', function () { setService(a.dataset.service, false); }); });
function copy(text, btn, done) {
var ok = function () { var o = btn.textContent; btn.textContent = done; setTimeout(function () { btn.textContent = o; }, 1800); };
try {
navigator.clipboard.writeText(text).then(ok, function () { selectFallback(); });
}
catch (e) {
selectFallback();
}
function selectFallback() { var o = btn.textContent; btn.textContent = '1-876-277-8913'; setTimeout(function () { btn.textContent = o; }, 2400); }
}
$('#copy-num').addEventListener('click', function () { copy('18762778913', this, 'Copied'); });
$('#to-top').addEventListener('click', function () { if (window.glowScrollTo)
glowScrollTo(0);
else
window.scrollTo(0, 0); var b = $('.brand'); if (b)
b.focus({ preventScroll: true }); });
if (FINE && !REDUCED) {
var cur = $('.cursor'), label = $('.cursor-label'), x = -100, y = -100;
addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') {
cur.classList.add('on');
loop.add(curFrame);
} }, { passive: true });
document.addEventListener('pointerleave', function () { cur.classList.remove('on'); });
document.addEventListener('mouseover', function (e) {
var t = e.target.closest ? e.target.closest('[data-cursor]') : null, l = e.target.closest ? e.target.closest('a,button,input,select,textarea,summary') : null;
label.textContent = t ? t.dataset.cursor : '';
cur.classList.toggle('label', !!t);
cur.classList.toggle('link', !t && !!l);
});
function curFrame(dt) { var k = 1 - Math.pow(0.0005, dt); x = lerp(x, S.mx, k); y = lerp(y, S.my, k); cur.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; if (Math.abs(x - S.mx) + Math.abs(y - S.my) < 0.1)
loop.remove(curFrame); }
}
}
function initWrite() {
var h = $('#reviews-title'), lead = $('#reviews .sec-head .lead');
if (!h || REDUCED || !window.IntersectionObserver)
return;
var NS = 'http://www.w3.org/2000/svg', lines = [{ text: 'Client love', serif: false }, { text: 'coming soon', serif: true }];
var label = h.textContent.replace(/\s+/g, ' ').trim();
var svg = document.createElementNS(NS, 'svg');
svg.setAttribute('class', 'write-svg');
svg.setAttribute('aria-hidden', 'true');
var sr = document.createElement('span');
sr.className = 'sr-only';
sr.textContent = label;
var lastW = 0;
function build() {
var W = h.clientWidth;
if (!W || W === lastW)
return;
lastW = W;
var fs = parseFloat(getComputedStyle(h).fontSize), y = fs * 0.84, ci = 0;
while (svg.firstChild)
svg.removeChild(svg.firstChild);
svg.style.setProperty('--dash', Math.round(fs * 3.2));
lines.forEach(function (L, li) {
var t = document.createElementNS(NS, 'text');
t.setAttribute('x', '0');
t.setAttribute('y', y.toFixed(1));
t.setAttribute('class', L.serif ? 'w-serif' : 'w-sans');
t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
t.style.fontSize = (L.serif ? fs * 1.04 : fs) + 'px';
L.text.split('').forEach(function (ch) {
var s = document.createElementNS(NS, 'tspan');
s.textContent = ch;
if (ch !== ' ') {
var d = ci * 0.085 + li * 0.25;
s.style.animationDelay = d.toFixed(3) + 's,' + (d + 0.6).toFixed(3) + 's';
ci++;
}
t.appendChild(s);
});
svg.appendChild(t);
if (li < lines.length - 1)
y += fs * 0.98;
});
var H = y + fs * 0.32;
svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H.toFixed(1));
svg.setAttribute('width', W);
svg.setAttribute('height', H.toFixed(1));
}
h.textContent = '';
h.appendChild(sr);
h.appendChild(svg);
build();
var words = [];
if (lead) {
var txt = lead.textContent.trim().split(/\s+/);
lead.textContent = '';
txt.forEach(function (w, i) { var s = document.createElement('span'); s.className = 'w-word'; s.textContent = w; s.style.transitionDelay = (1.9 + i * 0.05).toFixed(2) + 's'; lead.appendChild(s); if (i < txt.length - 1)
lead.appendChild(document.createTextNode(' ')); words.push(s); });
}
var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) {
svg.classList.add('go');
if (lead)
lead.classList.add('words-go');
io.disconnect();
} }, { threshold: 0.45 });
io.observe(h);
return { resize: build };
}
var FS_LIQUID = [
'precision highp float;',
'varying vec2 vUv;',
'uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uAmt;',
NOISE,
'float fbm(vec2 p){ float f = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ f += a * snoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return f; }',
'void main(){',
' float asp = uRes.x / uRes.y;',
' vec2 p = (vUv - 0.5) * vec2(asp, 1.0) * 1.3;',
' float t = uTime * 0.07;',
' vec2 m = (uMouse - 0.5) * vec2(asp, 1.0) * 1.3; vec2 dm = p - m;',
' p -= dm * exp(-dot(dm, dm) * 3.0) * 0.3 * uAmt;',
' vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));',
' float f = fbm(p * 1.2 + 2.1 * q + vec2(t * 0.6, -t * 0.4));',
' float band = 0.5 + 0.5 * sin(f * 8.5 + q.x * 4.0 + t * 2.0);',
' vec3 deep = vec3(0.55, 0.45, 0.38), bro = vec3(0.79, 0.66, 0.56), hi = vec3(0.78, 0.69, 0.54), champ = vec3(0.94, 0.9, 0.85), white = vec3(0.99, 0.98, 0.96);',
' vec3 col = mix(deep, bro, smoothstep(0.0, 0.42, band));',
' col = mix(col, hi, smoothstep(0.38, 0.72, band));',
' col = mix(col, champ, smoothstep(0.68, 0.9, band));',
' col = mix(col, white, smoothstep(0.92, 1.0, band) * 0.85);',
' col *= 0.82 + 0.32 * smoothstep(-0.4, 0.5, q.y);',
' col += vec3(1.0, 0.99, 0.97) * exp(-dot(dm, dm) * 6.0) * 0.16 * uAmt;',
' gl_FragColor = vec4(col, 1.0);',
'}'
].join('\n');
function initFooterLiquid() {
var wrap = $('#foot-liquid'), canvas = $('#foot-canvas');
if (!wrap || !canvas)
return null;
var renderer = makeRenderer(canvas, { antialias: false, alpha: false });
if (!renderer) {
wrap.classList.add('no-gl');
return null;
}
renderer.setPixelRatio(Math.min(DPR, 2) * 0.6);
var u = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 0 } };
var scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS_QUAD, fragmentShader: FS_LIQUID })));
var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
var st = { visible: false, needs: true, t: 10, amtT: 0, mouse: new THREE.Vector2(0.5, 0.5), mouseT: new THREE.Vector2(0.5, 0.5) };
function layout() { var r = wrap.getBoundingClientRect(); if (!r.width)
return; renderer.setSize(r.width, r.height, false); u.uRes.value.set(r.width, r.height); st.needs = true; }
wrap.addEventListener('pointermove', function (e) { var r = wrap.getBoundingClientRect(); st.mouseT.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height); st.amtT = 1; st.needs = true; }, { passive: true });
wrap.addEventListener('pointerleave', function () { st.amtT = 0; });
function frame(dt) {
if (!st.visible || (REDUCED && !st.needs))
return;
st.needs = false;
if (!REDUCED)
st.t += dt;
st.mouse.lerp(st.mouseT, 1 - Math.pow(0.01, dt));
u.uAmt.value = lerp(u.uAmt.value, st.amtT, 1 - Math.pow(0.1, dt));
u.uTime.value = st.t;
u.uMouse.value.copy(st.mouse);
renderer.render(scene, cam);
}
new IntersectionObserver(function (en) { st.visible = en[0].isIntersecting; if (st.visible) {
st.needs = true;
loop.add(frame);
} }, { rootMargin: '200px' }).observe(wrap);
layout();
whenIdle(function () { try {
renderer.compile(scene, cam);
}
catch (e) { } });
return { resize: layout };
}
var toastTimer = 0;
function toast(msg) { var t = $('#toast'); if (!t)
return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600); }
var CAT_ICONS = {
'Face': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="32" cy="34" r="20"/><circle cx="32" cy="34" r="13"/><path d="M14 30c3-10 10-15 18-15s15 5 18 15"/></svg>',
'Eyes': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="10" y="18" width="44" height="30" rx="5"/><circle cx="21" cy="29" r="5"/><circle cx="32" cy="29" r="5"/><circle cx="43" cy="29" r="5"/><path d="M14 41h36"/></svg>',
'Lips': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="24" y="34" width="16" height="20" rx="2"/><path d="M26 34V22l12-8v20"/><path d="M22 54h20"/></svg>',
'Brushes & Tools': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M20 52l18-26"/><path d="M36 28c2-7 7-14 14-16-1 8-6 14-12 18z"/><path d="M30 54l8-12"/><path d="M38 42c5 0 10-4 12-9-5 0-10 3-12 9z"/></svg>',
'Skin Prep': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="22" y="22" width="20" height="32" rx="6"/><path d="M27 22v-6h10v6M29 16v-4h6"/><path d="M26 34h12"/></svg>'
};
function initShop() {
var tabsEl = $('#shop-tabs'), grid = $('#shop-grid'), shop = $('#shop');
if (!tabsEl || !grid || !shop)
return;
var isLink = function (u) { return /^https:\/\/\S+$/.test(u || ''); };
var ready = PRODUCTS.filter(function (p) { return p.name && isLink(p.url); }), store = isLink(STOREFRONT_URL) ? STOREFRONT_URL : '';
if (!ready.length && !store)
return;
shop.hidden = false;
$$('[data-shop-link]').forEach(function (el) { el.hidden = false; });
$$('.menu-nav .menu-list > li:not([hidden]) .menu-num').forEach(function (n, i) { n.textContent = ('0' + (i + 1)).slice(-2); });
$('#shop-disclosure').hidden = !AMAZON_ASSOCIATE;
var CATS = ['All'].concat(['Face', 'Eyes', 'Lips', 'Brushes & Tools', 'Skin Prep'].filter(function (c) { return ready.some(function (p) { return p.category === c; }); }));
if (ready.length)
CATS.forEach(function (c, i) {
var b = document.createElement('button');
b.type = 'button';
b.className = 'shop-tab';
b.textContent = c;
b.dataset.cat = c;
b.setAttribute('aria-pressed', String(i === 0));
tabsEl.appendChild(b);
});
var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
ready.forEach(function (p) {
var card = document.createElement('article');
card.className = 'p-card';
card.dataset.cat = p.category;
var img = isLink(p.image) ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' : (CAT_ICONS[p.category] || '');
card.innerHTML = '<div class="p-inner"><span class="p-glare" aria-hidden="true"><i></i></span>' +
'<div class="p-img">' + img + '<span class="p-cat">' + esc(p.category) + '</span></div>' +
'<div class="p-body"><h3 class="p-name">' + esc(p.name) + '</h3>' +
(p.note ? '<p class="p-note"><small>Why I love it</small><em>' + esc(p.note) + '</em></p>' : '') +
'<div class="p-actions"><a class="btn btn-dark" href="' + esc(p.url) + '" target="_blank" rel="noopener sponsored">Shop on Amazon<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>' +
(AMAZON_ASSOCIATE ? '<span class="paid">(paid link)</span>' : '') + '</div></div></div>';
grid.appendChild(card);
});
$$('[data-storefront]').forEach(function (a) {
if (!store) {
(a.closest('li') || a).hidden = true;
return;
}
a.href = store;
if (AMAZON_ASSOCIATE) {
var t = document.createElement('span');
t.className = 'paid';
t.textContent = '(paid link)';
a.insertAdjacentElement('afterend', t);
}
});
var cards = $$('.p-card', grid);
tabsEl.addEventListener('click', function (e) {
var b = e.target.closest('.shop-tab');
if (!b || b.getAttribute('aria-pressed') === 'true')
return;
$$('.shop-tab', tabsEl).forEach(function (t) { t.setAttribute('aria-pressed', String(t === b)); });
var cat = b.dataset.cat, first = new Map();
cards.forEach(function (c) { if (!c.hidden)
first.set(c, c.getBoundingClientRect()); });
cards.forEach(function (c) { c.hidden = !(cat === 'All' || c.dataset.cat === cat); if (!c.hidden && window.glowRevealed)
glowRevealed(c); });
if (REDUCED || !grid.animate)
return;
var k = 0;
cards.forEach(function (c) {
if (c.hidden)
return;
var last = c.getBoundingClientRect(), f = first.get(c);
if (f) {
var dx = f.left - last.left, dy = f.top - last.top;
if (dx || dy)
c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.7,.15,1)' });
}
else
c.animate([{ opacity: 0, transform: 'translate3d(0,26px,0) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 50 * k++, easing: 'cubic-bezier(.2,.7,.15,1)', fill: 'backwards' });
});
});
if (FINE && !REDUCED) {
cards.forEach(function (c) {
var inner = $('.p-inner', c), glare = $('.p-glare i', c), x = 0.5, y = 0, raf = 0;
function apply() {
raf = 0;
inner.style.transition = 'transform .15s ease-out';
inner.style.transform = 'rotateX(' + ((0.5 - y) * 12).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 14).toFixed(2) + 'deg) translateZ(10px)';
if (glare)
glare.style.transform = 'translate3d(' + ((x - 0.5) * 100).toFixed(1) + '%,' + ((y - 0.5) * 100).toFixed(1) + '%,0)';
}
c.addEventListener('pointermove', function (e) {
var r = c.getBoundingClientRect();
x = (e.clientX - r.left) / r.width;
y = (e.clientY - r.top) / r.height;
if (!raf)
raf = requestAnimationFrame(apply);
}, { passive: true });
c.addEventListener('pointerleave', function () { if (raf) {
cancelAnimationFrame(raf);
raf = 0;
} inner.style.transition = ''; inner.style.transform = ''; });
});
}
}
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
var SB_SRI = 'sha384-rwykjmWNwVxboyFmvK9OXN0wj9hnMHA2aAHtits54DuACyCq0M2PrSNxhRb+hvXT';
function sbCfg() { return { url: String(window.SUPABASE_URL || ''), anonKey: String(window.SUPABASE_ANON_KEY || '') }; }
function sbSecretKey() {
var k = String(sbCfg().anonKey || '');
if (/^sb_secret_/i.test(k))
return true;
var part = k.split('.')[1];
if (!part)
return false;
try {
var claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
return !!claims.role && claims.role !== 'anon';
}
catch (e) {
return false;
}
}
function sbReady() { var c = sbCfg(); return /^https:\/\/[^\s\/]+\/?$/.test(c.url || '') && /^[\w.-]{20,}$/.test(c.anonKey || '') && !sbSecretKey(); }
var sbLib = null;
function sbLoad() {
if (sbLib)
return sbLib;
sbLib = new Promise(function (res, rej) {
if (window.supabase && window.supabase.createClient)
return res(window.supabase);
var t = document.createElement('script');
t.src = SB_SRC;
t.integrity = SB_SRI;
t.crossOrigin = 'anonymous';
t.async = true;
t.onload = function () { if (window.supabase && window.supabase.createClient)
res(window.supabase);
else {
sbLib = null;
rej(new Error('no supabase'));
} };
t.onerror = function () { sbLib = null; rej(new Error('no supabase')); };
document.head.appendChild(t);
});
return sbLib;
}
function sbWarm() { if (sbReady())
sbLoad().catch(function () { }); }
var sbPublic = null;
function saveRow(table, row) {
if (!sbReady())
return Promise.resolve(false);
var done = sbLoad().then(function (lib) {
if (!sbPublic)
sbPublic = lib.createClient(sbCfg().url, sbCfg().anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'glow-public' } });
return sbPublic.from(table).insert(row);
}).then(function (r) { return !(r && r.error); }, function () { return false; });
return Promise.race([done, new Promise(function (res) { setTimeout(function () { res(false); }, 6000); })]);
}
function busy(btn, on, label) {
if (!btn)
return;
if (on) {
if (btn.dataset.label == null)
btn.dataset.label = btn.innerHTML;
btn.disabled = true;
btn.setAttribute('aria-busy', 'true');
btn.textContent = label;
}
else if (btn.dataset.label != null) {
btn.innerHTML = btn.dataset.label;
delete btn.dataset.label;
btn.removeAttribute('aria-busy');
}
}
var OFFLINE_MSG = 'You’re offline. Anything you’ve typed stays here, and you can send it when you’re back online.';
function isOffline() { return navigator.onLine === false; }
function initNet() {
var note = $('#net-note'), t = 0;
if (!note)
return;
function say(text, ms) { clearTimeout(t); note.textContent = text; note.hidden = false; if (ms)
t = setTimeout(function () { note.hidden = true; }, ms); }
addEventListener('offline', function () { say(OFFLINE_MSG); });
addEventListener('online', function () { say('You’re back online.', 3000); });
if (isOffline())
say(OFFLINE_MSG);
}
function initSkeletons() {
$$('img').forEach(function (img) {
if (img.complete && img.naturalWidth)
return;
img.classList.add('sk');
var done = function () { img.classList.remove('sk'); };
img.addEventListener('load', done);
img.addEventListener('error', done);
});
}
function phoneOk(v) { v = String(v || '').trim(); var n = v.replace(/\D/g, '').length; return /^[0-9+() .-]+$/.test(v) && n >= 7 && n <= 15; }
function emailOk(v) { v = String(v || '').trim(); return v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
var RECENT = 'glow.recent', TWO_MIN = 120000;
function codeOf(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) {
h ^= t.charCodeAt(i);
h = Math.imul(h, 16777619) >>> 0;
} return h.toString(36); }
function recent() { var m = {}, now = Date.now(); try {
m = JSON.parse(localStorage.getItem(RECENT) || '{}') || {};
}
catch (e) { } Object.keys(m).forEach(function (k) { if (!(now - m[k] < TWO_MIN))
delete m[k]; }); return m; }
function tooSoon(key) { return !!recent()[codeOf(key)]; }
function markSent(key) { var m = recent(); m[codeOf(key)] = Date.now(); try {
localStorage.setItem(RECENT, JSON.stringify(m));
}
catch (e) { } }
function fillBirthdaySelects() {
$$('select.bday-d').forEach(function (s) { for (var d = 1; d <= 31; d++) {
var o = document.createElement('option');
o.value = ('0' + d).slice(-2);
o.textContent = d;
s.appendChild(o);
} });
$$('select.bday-m').forEach(function (s) { MONTHS.forEach(function (m, i) { var o = document.createElement('option'); o.value = ('0' + (i + 1)).slice(-2); o.textContent = m; s.appendChild(o); }); });
var DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
$$('.bday').forEach(function (g) {
var d = $('select.bday-d', g), m = $('select.bday-m', g);
if (!d || !m)
return;
m.addEventListener('change', function () {
var max = m.value ? DAYS_IN[parseInt(m.value, 10) - 1] : 31, keep = d.value;
while (d.options.length > 1)
d.remove(1);
for (var i = 1; i <= max; i++) {
var o = document.createElement('option');
o.value = ('0' + i).slice(-2);
o.textContent = i;
d.appendChild(o);
}
d.value = keep && parseInt(keep, 10) <= max ? keep : '';
});
});
}
function initClub() {
var form = $('#club-form'), done = $('#club-done'), status = $('#club-status');
if (!form)
return null;
var WAYS = { Email: { field: 'email', label: 'Email address', by: 'by email', need: 'your email address' },
SMS: { field: 'phone', label: 'Mobile number', by: 'by text', need: 'your mobile number' },
WhatsApp: { field: 'phone', label: 'WhatsApp number', by: 'by WhatsApp', need: 'your WhatsApp number' } };
var emailField = $('#c-email-field'), phoneField = $('#c-phone-field'), consentText = $('#c-consent-text');
function chosenWay() { var r = $('input[name="way"]:checked', form); return r ? r.value : ''; }
function waySync() {
var w = WAYS[chosenWay()];
emailField.hidden = !w || w.field !== 'email';
phoneField.hidden = !w || w.field !== 'phone';
if (w && w.field === 'phone')
$('#c-phone-label').textContent = w.label;
consentText.textContent = 'Yes, Glow by Launthia may message me about openings and offers' + (w ? ' ' + w.by : '') + '. I can opt out at any time by messaging STOP or emailing Launthiawatson@yahoo.com.';
if (w)
$('#c-way-field').classList.remove('invalid');
}
$$('input[name="way"]', form).forEach(function (r) { r.addEventListener('change', waySync); });
$$('#club-form .bday select').forEach(function (sel) { sel.addEventListener('change', function () { sel.closest('.field').classList.remove('invalid'); if (/month|day too/.test(status.textContent))
status.textContent = ''; }); });
var joinBtn = $('button[type="submit"]', form), clubSaved = $('#club-saved'), consentAt = '';
$('#c-consent').addEventListener('change', function () { consentAt = this.checked ? new Date().toISOString() : ''; });
function listOf(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0]; }
form.addEventListener('submit', function (e) {
e.preventDefault();
if (joinBtn.disabled)
return;
var name = $('#c-name'), phone = $('#c-phone'), email = $('#c-email'), consent = $('#c-consent'), way = chosenWay(), w = WAYS[way], bad = [];
function check(el, ok, label) { var f = el.closest('.field') || el.closest('.consent'); if (f) {
f.classList.toggle('invalid', !ok);
if (!ok && !REDUCED) {
f.classList.remove('shake');
void f.offsetWidth;
f.classList.add('shake');
}
} if (!ok)
bad.push(label); }
check(name, name.value.trim().length > 1 && name.value.trim().length <= 80, 'your name');
check($('#c-way-field .club-ways'), !!w, 'how you’d like reminders');
if (w && w.field === 'email')
check(email, emailOk(email.value), w.need);
if (w && w.field === 'phone')
check(phone, phoneOk(phone.value), w.need);
if (bad.length) {
status.textContent = 'Please add ' + listOf(bad) + '.';
return;
}
var bd = $('#c-bday-d').value, bm = $('#c-bday-m').value;
if ((bd && !bm) || (bm && !bd)) {
var g = $('#club-form .bday').closest('.field');
g.classList.add('invalid');
if (!REDUCED) {
g.classList.remove('shake');
void g.offsetWidth;
g.classList.add('shake');
}
status.textContent = bd ? 'Please choose the month too.' : 'Please choose the day too.';
(bd ? $('#c-bday-m') : $('#c-bday-d')).focus();
return;
}
if ($('#c-website').value)
return;
if (isOffline()) {
status.textContent = 'You’re offline. Your details are still here. Tap Join again when you’re back online.';
return;
}
var contact = w.field === 'email' ? email.value.trim() : phone.value.trim(), who = w.field === 'email' ? 'e' + contact.toLowerCase() : 'p' + contact.replace(/\D/g, '');
if (tooSoon(who)) {
status.textContent = 'You just sent a join request with these details. Please wait 2 minutes, then try again.';
return;
}
var d = $('#c-bday-d').value, m = $('#c-bday-m').value, yes = consent.checked;
var msg = ['Hi Launthia! I’d like to join the Glow Club.', '', 'Name: ' + name.value.trim(), 'Contact me by: ' + (way === 'SMS' ? 'SMS (text)' : way), w.label + ': ' + contact];
if (d && m)
msg.push('Birthday: ' + parseInt(d, 10) + ' ' + new Date(2000, parseInt(m, 10) - 1, 1).toLocaleDateString('en-GB', { month: 'long' }));
msg.push(yes ? 'Yes to openings and offers ' + w.by + '. I can opt out any time by messaging STOP.' : 'No offers for now, please.');
busy(joinBtn, true, 'Saving…');
status.textContent = '';
markSent(who);
saveRow('glow_club', { name: name.value.trim(), contact_pref: way, phone: w.field === 'phone' ? contact : null, email: w.field === 'email' ? contact : null, birth_month: d && m ? parseInt(m, 10) : null, birth_day: d && m ? parseInt(d, 10) : null, marketing_consent: yes, consent_at: yes ? (consentAt || new Date().toISOString()) : null }).then(function (saved) {
busy(joinBtn, false);
joinBtn.disabled = true;
clubSaved.textContent = saved ? 'Saved. You’re on the Glow Club list.' : sbReady() ? 'We couldn’t save your details online, so please send them by text or email below.' : 'Please send your join request by text or email below so Launthia gets it.';
var body = msg.join('\n'), sends = $('#club-done .bk-sends'), bE = $('#club-send-email'), bS = $('#club-send-sms');
bS.href = smsHref(body);
bE.href = mailHref('Glow Club join request', body);
var order = way === 'Email' ? [bE, bS] : [bS, bE];
[bE, bS].forEach(function (b) { b.hidden = false; b.classList.remove('btn-dark'); b.classList.add('btn-ghost'); });
order.forEach(function (b, n) { sends.appendChild(b); if (!n) {
b.classList.add('btn-dark');
b.classList.remove('btn-ghost');
} });
$('#club-done-name').textContent = name.value.trim().split(' ')[0];
form.hidden = true;
done.hidden = false;
status.textContent = '';
});
});
$('#club-again').addEventListener('click', function () { form.reset(); consentAt = ''; clubSaved.textContent = ''; waySync(); $$('select.bday-m', form).forEach(function (m) { m.dispatchEvent(new Event('change')); }); joinBtn.disabled = false; done.hidden = true; form.hidden = false; $('#c-name').focus(); });
var canvas = $('#club-canvas');
if (!canvas || !HAS3 || !root.classList.contains('webgl'))
return null;
if (LITE) {
var gl = null;
whenNear(canvas, function () { gl = clubPearls(canvas); });
return { resize: function () { if (gl)
gl.resize(); } };
}
return clubPearls(canvas);
}
function clubPearls(canvas) {
var renderer = makeRenderer(canvas, { antialias: true, alpha: true });
if (!renderer)
return null;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setClearColor(0x000000, 0);
var scene = new THREE.Scene();
scene.environment = studioEnv(renderer, { top: 0xf7f2ec, mid: 0xc9b8a6, bot: 0x6e5646, panels: [[6, 4, -5, 5, 6, 3.0, 0xfffaf4], [1.2, 10, 7.5, 1, -1, 4.2, 0xfff7ee], [1, 9, -7.5, 0, -2, 2.4, 0xfff4ea], [8, 8, 0, 10, 0, 2, 0xffffff], [10, 3, 0, -6, 4, 0.8, 0xd9c8b4]] });
var cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
cam.position.set(0, 0.5, 9.5);
cam.lookAt(0, 0, 0);
var pearlM = new THREE.MeshPhysicalMaterial({ color: lin('#F7F2EC'), metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 });
var nudeM = new THREE.MeshPhysicalMaterial({ color: lin('#C9A98E'), metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
var champM = new THREE.MeshPhysicalMaterial({ color: lin('#C8B08A'), metalness: 1, roughness: 0.2 });
var sph = new THREE.SphereGeometry(1, LITE ? 28 : 40, LITE ? 20 : 30);
var strand = new THREE.Group();
scene.add(strand);
strand.rotation.x = 0.45;
var N = LITE ? 28 : 40;
for (var i = 0; i < N; i++) {
var a = i / N * Math.PI * 2, m = new THREE.Mesh(sph, i % 10 === 5 ? nudeM : pearlM);
m.position.set(Math.cos(a) * 1.95, Math.sin(a * 3) * 0.06, Math.sin(a) * 1.95);
m.scale.setScalar(i % 10 === 0 ? 0.17 : 0.13);
strand.add(m);
}
var heart = new THREE.Mesh(sph, pearlM);
heart.scale.setScalar(0.62);
scene.add(heart);
var halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.028, 16, 140), champM);
halo.rotation.set(1.2, 0.2, 0);
scene.add(halo);
var thin = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.012, 10, 200), champM);
thin.rotation.set(1.35, -0.25, 0.1);
scene.add(thin);
var st = { vis: false, t: 0, needs: true, mx: 0, my: 0 };
function size() { var r = canvas.getBoundingClientRect(); if (!r.width)
return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); st.needs = true; }
function frame(dt) {
if (!st.vis || (REDUCED && !st.needs))
return;
st.needs = false;
if (!REDUCED)
st.t += dt;
var t = st.t;
var tx = FINE ? (S.mx / innerWidth - 0.5) : 0, ty = FINE ? (S.my / innerHeight - 0.5) : 0, k = 1 - Math.pow(0.03, dt);
st.mx = lerp(st.mx, tx, k);
st.my = lerp(st.my, ty, k);
strand.rotation.y = t * 0.16;
strand.rotation.x = 0.45 + st.my * 0.25;
strand.rotation.z = st.mx * 0.15;
heart.position.y = Math.sin(t * 0.9) * 0.08;
heart.rotation.y = t * 0.2;
halo.rotation.z = t * 0.22;
halo.rotation.x = 1.2 + Math.sin(t * 0.5) * 0.12;
thin.rotation.z = -t * 0.08;
renderer.render(scene, cam);
if (!REDUCED)
st.needs = true;
}
new IntersectionObserver(function (en) { st.vis = en[0].isIntersecting; if (st.vis) {
st.needs = true;
loop.add(frame);
} }, { rootMargin: '100px' }).observe(canvas);
size();
whenIdle(function () { try {
renderer.compile(scene, cam);
}
catch (e) { } });
return { resize: size };
}
function initLegal() {
var box = $('#legal');
if (!box)
return;
var keys = ['privacy', 'terms', 'cancellation'], opener = null, pushed = false;
function route() {
var key = location.hash.slice(1);
if (keys.indexOf(key) >= 0) {
if (box.hidden)
opener = document.activeElement;
keys.forEach(function (k) { $('#lp-' + k).hidden = k !== key; });
box.hidden = false;
LEGAL_OPEN = true;
root.classList.add('lb-lock');
box.scrollTop = 0;
var h = $('#lt-' + key);
h.setAttribute('tabindex', '-1');
try {
h.focus({ preventScroll: true });
}
catch (e) { }
}
else if (!box.hidden) {
box.hidden = true;
LEGAL_OPEN = false;
root.classList.remove('lb-lock');
if (opener && opener.focus)
try {
opener.focus({ preventScroll: true });
}
catch (e) { }
}
}
function back() {
if (pushed) {
pushed = false;
history.back();
return;
}
try {
history.replaceState(null, '', location.pathname + location.search);
}
catch (e) {
location.hash = '';
}
route();
}
addEventListener('hashchange', function () { if (keys.indexOf(location.hash.slice(1)) >= 0)
pushed = true; route(); });
$$('[data-legal-back]', box).forEach(function (b) { b.addEventListener('click', back); });
box.addEventListener('keydown', function (e) { if (e.key === 'Escape') {
e.preventDefault();
back();
} });
route();
}
var hero = null, about = null, scroll = null, writer = null, foot = null;
(function () {
var sg = String(window.SOFT_GLAM_PRICE || '').trim(), fg = String(window.FULL_GLAM_PRICE || '').trim(), le = String(window.LEGAL_ENTITY || '').trim();
if (sg)
$$('[data-sg-price]').forEach(function (e) { e.textContent = sg; });
if (fg)
$$('[data-fg-price]').forEach(function (e) { e.textContent = fg; });
if (le)
$$('[data-legal-entity]').forEach(function (e) { e.textContent = le; e.classList.toggle('ph', /^\[/.test(le)); });
})();
fillBirthdaySelects();
initNet();
initSkeletons();
initUI();
(function () {
if (!sbReady() || !window.fetch)
return;
var c = sbCfg(), base = c.url.replace(/\/+$/, '') + '/rest/v1/', h = { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey };
function get(p) { return fetch(base + p, { headers: h }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }); }
var t = new Date(), day = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
Promise.all([get('site_prices?select=service,price_text'), get('blocked_days?select=day&day=gte.' + day)]).then(function (r) {
var d = {};
if (Array.isArray(r[0]) && r[0].length) {
d.prices = {};
r[0].forEach(function (x) { if (/^[0-9][0-9 ,.$–-]*$/.test(String(x.price_text || '')) && String(x.price_text).length <= 40)
d.prices[x.service] = x.price_text; });
}
if (Array.isArray(r[1]))
d.daysOff = r[1].map(function (x) { return String(x.day).slice(0, 10); });
dispatchEvent(new CustomEvent('glow:site', { detail: d }));
});
})();
initShop();
try {
localStorage.removeItem('glowclub.v1');
sessionStorage.removeItem('glowclub.unlocked');
}
catch (e) { }
var club = initClub();
initLegal();
writer = initWrite();
if (HAS3) {
hero = initHero();
}
if (HAS3 && root.classList.contains('webgl')) {
if (LITE) {
whenNear($('#about-stage'), function () { about = initAbout(); });
whenNear($('#foot-liquid'), function () { foot = initFooterLiquid(); });
}
else {
about = initAbout();
foot = initFooterLiquid();
}
}
if ('IntersectionObserver' in window) {
var liveIO = new IntersectionObserver(function (en) { en.forEach(function (e) { e.target.classList.toggle('is-live', e.isIntersecting); }); }, { rootMargin: '25% 0px' });
['#hero', '#signature', '#bridal', '#footer'].forEach(function (sel) { var el = $(sel); if (el)
liveIO.observe(el); });
}
else
['#hero', '#signature', '#bridal', '#footer'].forEach(function (sel) { var el = $(sel); if (el)
el.classList.add('is-live'); });
scroll = initScroll(hero);
var rt = 0, lastW = innerWidth;
addEventListener('orientationchange', function () { setTimeout(function () { dispatchEvent(new Event('resize')); }, 250); });
addEventListener('resize', function () {
clearTimeout(rt);
rt = setTimeout(function () {
var widthChanged = innerWidth !== lastW;
lastW = innerWidth;
if (hero)
hero.resize();
if (about)
about.resize();
if (writer)
writer.resize();
if (foot)
foot.resize();
if (club)
club.resize();
if (scroll)
scroll.measure();
if (!widthChanged)
return;
}, 160);
});
addEventListener('load', function () { if (scroll)
scroll.measure(); if (about)
about.resize(); });
if (document.fonts && document.fonts.ready)
document.fonts.ready.then(function () { if (scroll)
scroll.measure(); if (about)
about.resize(); });
return { mediaReady: mediaReady };
})();
window.GLOW && GLOW.mediaReady({ "avatar": "media/avatar-150.webp", "bridal-pearl": "media/bridal-pearl-800.webp", "bridal-sleek": "media/bridal-sleek-800.webp", "full-glam": "media/full-glam-800.webp", "hero-portrait": "media/hero-portrait-1023.webp", "launthia-portrait": "media/launthia-portrait-800.webp", "soft-glam": "media/soft-glam-800.webp" });