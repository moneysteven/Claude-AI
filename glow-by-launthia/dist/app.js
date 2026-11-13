/* =========================================================================
   BOOKING SETTINGS: edit this block to change the booking calendar.
   - hours: opening hours for each day, like '9am-5pm', or 'closed'.
     Each booking is a 1-hour slot starting on the hour, so bookings are
     always 1 hour apart and the last start time is 1 hour before closing.
   - booked: start times already taken, by day (YYYY-MM-DD). Each one shows
     pale and can't be picked. A day with every time taken shows pale too.
   - fullDays: whole days that are full or off (YYYY-MM-DD).
   - payOnline: the Whop checkout link (or plan ID, plan_...) for each service.
     With a plan ID the payment form opens right inside the booking card.
     Until one is added, "Pay online" is hidden and customers pay in person.
   ========================================================================= */
var BOOKING = {
hours: {
Monday: '9am-5pm',
Tuesday: '9am-5pm',
Wednesday: '9am-5pm',
Thursday: '9am-5pm',
Friday: '9am-5pm',
Saturday: '9am-5pm',
Sunday: 'closed'
},
booked: {},
fullDays: [],
payOnline: {
'Soft Glam': '',
'Full Glam': ''
}
};
var STOREFRONT_URL = '';
var PRODUCTS = [
{ category: 'Face', name: '', note: '', url: '', image: '' },
{ category: 'Face', name: '', note: '', url: '', image: '' },
{ category: 'Eyes', name: '', note: '', url: '', image: '' },
{ category: 'Eyes', name: '', note: '', url: '', image: '' },
{ category: 'Lips', name: '', note: '', url: '', image: '' },
{ category: 'Lips', name: '', note: '', url: '', image: '' },
{ category: 'Brushes & Tools', name: '', note: '', url: '', image: '' },
{ category: 'Brushes & Tools', name: '', note: '', url: '', image: '' },
{ category: 'Skin Prep', name: '', note: '', url: '', image: '' },
{ category: 'Skin Prep', name: '', note: '', url: '', image: '' }
];
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
var OWNER_OPEN = false;
function tick(now) {
var dt = Math.min(0.05, Math.max(0.001, (now - loop.last) / 1000));
loop.last = now;
if (!OWNER_OPEN && !window.GLOW_PAUSED)
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
'uniform float uHeader; uniform vec4 uPhotoRectH; uniform float uPhotoWideH; uniform vec4 uFaceH;',
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
var renderer = makeRenderer(canvas, { antialias: !LITE, alpha: false });
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
uniforms: { tBg: { value: bgRT.texture }, tText: { value: blank }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uMouseAmt: { value: 0 }, uTime: { value: 0 }, uReveal: { value: REDUCED ? 1 : 0 }, uHasText: { value: 0 }, uRectAsp: { value: 3 }, uTextAmt: { value: 1 }, uFade: { value: 0 }, tPhoto: { value: null }, uPhoto: { value: 0 }, uPhotoRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uPhotoWide: { value: 0 }, uFace: { value: new THREE.Vector4(0.575, 0.58, 0.13, 0.17) }, uHeader: { value: 0 }, uPhotoRectH: { value: new THREE.Vector4(0, 0, 1, 1) }, uPhotoWideH: { value: 0 }, uFaceH: { value: new THREE.Vector4(0.57, 0.615, 0.15, 0.215) } },
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
var seg = LITE ? 64 : 128;
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
var W = LITE ? 2048 : 4096, Hc = Math.round(W * bandH / (2 * Math.PI * R));
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
ringTex.anisotropy = 4;
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
function layoutPhotoHeader() {
var u = compMat.uniforms, asp = W / H, pa = photo.asp;
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
var HDR = 5.5, SEEN = false;
try {
SEEN = sessionStorage.getItem('glow.introSeen') === '1';
}
catch (e) { }
var intro = { T: REDUCED || SEEN ? 99 : 0, marks: {} };
if (/[?&]debug\b/.test(location.search))
window.__glowIntro = intro;
var black = $('#intro-black'), skipBtn = $('#intro-skip');
function show(sel) { $$(sel, section).forEach(function (el) { el.classList.add('on'); }); }
function mark(name, t, fn) { if (!intro.marks[name] && intro.T >= t) {
intro.marks[name] = 1;
fn();
} }
function finishCues() {
root.classList.add('nav-in');
show('.hi');
root.classList.remove('intro-run');
skipBtn.classList.add('out');
setTimeout(function () { skipBtn.hidden = true; }, 600);
}
function skip() {
if (intro.T >= 3.5)
return;
intro.T = 3.5;
black.classList.add('gone');
['nav', 'eyebrow', 'by'].forEach(function (n) { intro.marks[n] = 1; });
root.classList.add('nav-in');
show('.hero-eyebrow');
show('.hero-by');
skipBtn.classList.add('out');
}
skipBtn.addEventListener('click', skip);
function frame(dt, now) {
if (!state.visible || !state.ready)
return;
var animate = !REDUCED;
if (!animate && !state.needs)
return;
state.needs = false;
var rdt = state.lastNow ? Math.min(0.25, Math.max(0, now - state.lastNow)) : dt;
state.lastNow = now;
if (animate) {
intro.T += rdt * (window.GLOW_INTRO_SPEED == null ? 1 : window.GLOW_INTRO_SPEED);
state.time += dt;
}
var T = animate ? intro.T : 99, t = animate ? state.time : 6;
var k = 1 - Math.pow(0.0015, dt);
state.mouse.lerp(state.mouseT, k);
state.amt = lerp(state.amt, state.amtT, 1 - Math.pow(0.15, dt));
if (animate) {
mark('nav', 1.4, function () { root.classList.add('nav-in'); });
mark('eyebrow', 2.3, function () { show('.hero-eyebrow'); });
mark('by', 3.3, function () { show('.hero-by'); });
mark('tag', 4.2, function () { show('.hero-tag'); show('.hero-hint'); });
mark('cta', 4.45, function () { show('.hero-ctas'); });
mark('meta', 4.8, function () { show('.hero-meta'); finishCues(); });
mark('hdrOut', HDR, function () { if (section.classList.contains('veil'))
section.classList.add('swap'); });
mark('hdr', HDR + 0.5, function () { section.classList.remove('veil'); requestAnimationFrame(function () { section.classList.remove('swap'); }); try {
sessionStorage.setItem('glow.introSeen', '1');
}
catch (e) { } });
}
var p = state.prog;
compMat.uniforms.uPhoto.value = photo.tex ? (animate ? easeOut(clamp((T - 0.2) / 2.2, 0, 1)) : 1) : 0;
var hdr = animate ? smooth(HDR, HDR + 1, T) : 1;
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
if (state.frames === 90 && state.slow / 90 > 1 / 42 && pr > 1) {
pr = Math.max(1, pr * 0.7);
renderer.setPixelRatio(pr);
bgScale *= 0.8;
layout();
}
}
if (animate || !photo.tex)
state.needs = true;
}
if (!REDUCED && !SEEN) {
root.classList.add('intro-run');
skipBtn.hidden = false;
section.classList.add('veil');
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
if (!REDUCED)
requestAnimationFrame(function () { black.classList.add('gone'); });
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
var WA = 'https://wa.me/18762778913?text=';
var PRICES = { 'Soft Glam': '$9,500', 'Full Glam': '$10,500 – $12,000' };
function payPlan(v) { var m = String(((window.BOOKING || {}).payOnline || {})[v] || '').match(/plan_[A-Za-z0-9]+/); return m ? m[0] : ''; }
var whop = { state: '', waiting: [] };
function loadWhop(cb) {
if (whop.state === 'ok' || whop.state === 'fail') {
cb(whop.state === 'ok');
return;
}
whop.waiting.push(cb);
if (whop.state)
return;
whop.state = 'loading';
var sc = document.createElement('script');
sc.src = 'https://js.whop.com/static/checkout/loader.js';
sc.async = true;
function end(ok) { whop.state = ok ? 'ok' : 'fail'; whop.waiting.splice(0).forEach(function (f) { f(ok); }); }
sc.onload = function () { end(true); };
sc.onerror = function () { end(false); };
document.head.appendChild(sc);
}
function payLink(v) { var l = ((window.BOOKING || {}).payOnline || {})[v]; if (!l)
return ''; try {
var u = new URL(l);
return u.protocol === 'https:' && /(^|\.)whop\.com$/.test(u.hostname) ? u.href : '';
}
catch (e) {
return '';
} }
var BRIDAL_MSG = 'Hi Launthia, I’m interested in Bridal Glam. My wedding date is ___ and the location is ___. Could you send me your bridal pricing?';
$$('[data-wa-service]').forEach(function (a) { a.href = WA + encodeURIComponent('Hi Launthia, I’d like to book ' + a.dataset.waService + '. My event date is ___ and the location is ___.'); });
$$('[data-wa-bridal]').forEach(function (a) { a.href = WA + encodeURIComponent(BRIDAL_MSG); });
var fab = $('#fab'), inHero = true, inBook = false;
function fabSync() { fab.classList.toggle('show', !inHero && !inBook); }
new IntersectionObserver(function (en) { inHero = en[0].isIntersecting; fabSync(); }, { threshold: 0.15 }).observe($('#hero'));
new IntersectionObserver(function (en) { inBook = en[0].isIntersecting; fabSync(); }).observe($('#book'));
var form = $('#book-form'), status = $('#form-status'), done = $('#bk-done'), quote = $('#bk-quote');
var svcBtns = $$('.bk-svc', form), stepDay = $('#bk-s2'), stepTime = $('#bk-s3'), stepYou = $('#bk-s4');
var pick = { svc: '', day: '', hour: -1 };
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
function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function fmtHour(h, short) { var n = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'; return short ? n + ap : n + ':00 ' + ap; }
function longDay(key) { return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function slots(key) {
var hrs = HOURS[new Date(key + 'T12:00:00').getDay()], now = new Date(), today = key === ymd(now), out = [];
if (!hrs || FULL[key])
return out;
for (var h = hrs.open; h < hrs.close; h++)
out.push({ h: h, taken: !!(TAKEN[key] && TAKEN[key][h]), past: today && h <= now.getHours() });
return out;
}
function isOpen(key) { return slots(key).some(function (x) { return !x.taken && !x.past; }); }
(function () {
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
})();
function nudge(el) { var r = el.getBoundingClientRect(); if (r.top > innerHeight * 0.6 || r.top < 60) {
if (window.glowScrollTo)
glowScrollTo(el, { noFocus: true });
else
el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
} }
function show(el, scroll) {
if (el.hidden) {
el.hidden = false;
if (!REDUCED) {
el.classList.remove('bk-in');
void el.offsetWidth;
el.classList.add('bk-in');
}
}
if (scroll)
nudge(el);
}
quote.href = WA + encodeURIComponent(BRIDAL_MSG);
var payOnline = $('input[name="pay"][value="Online"]', form), payPerson = $('input[name="pay"][value="In person"]', form);
function syncPay() { var ok = !!(payLink(pick.svc) || payPlan(pick.svc)); $('#pay-online').hidden = !ok; if (!ok) {
payOnline.checked = false;
payPerson.checked = true;
} }
$$('input[name="pay"]', form).forEach(function (r) { r.addEventListener('change', function () { $('#pay-field').classList.remove('invalid'); if (status.textContent)
status.textContent = ''; }); });
function setService(v, scroll) {
pick.svc = v;
syncPay();
svcBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === v)); });
var bridal = v === 'Bridal Glam';
status.textContent = '';
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
if (dt < day0)
b.disabled = true;
else if (!isOpen(key)) {
b.disabled = true;
b.classList.add('full');
anyFull = true;
label += HOURS[dt.getDay()] ? ', fully booked' : ', closed';
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
calNext.addEventListener('click', function () { shiftMonth(1); });
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
pick.hour = +b.dataset.hour;
$$('.bk-time', timesEl).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
show(stepYou, true);
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
check(nm.closest('.field'), nm.value.trim().length > 1, 'name', nm);
check(ph.closest('.field'), ph.value.replace(/\D/g, '').length >= 7, 'WhatsApp number', ph);
check($('#pay-field'), !!$('input[name="pay"]:checked', form), 'payment choice', $('input[name="pay"]:not(:disabled)', form));
if (first)
first.focus();
return bad;
}
['f-name', 'f-phone'].forEach(function (id) { $('#' + id).addEventListener('input', function () { this.closest('.field').classList.remove('invalid'); if (status.textContent)
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
});
function needs(bad) { return bad.length > 1 ? bad.slice(0, -1).join(', ') + ' and ' + bad[bad.length - 1] : bad[0]; }
function showPay(online, name) {
var panel = $('#pay-panel'), embed = $('#pp-embed'), btn = $('#bk-pay'), msg = $('#pp-msg');
panel.hidden = !online;
embed.innerHTML = '';
btn.hidden = true;
msg.hidden = true;
if (!online)
return;
var price = PRICES[pick.svc] || '', link = payLink(pick.svc), plan = payPlan(pick.svc), shown = false;
$('#pp-svc').textContent = pick.svc;
$('#pp-amt').textContent = price.indexOf('–') < 0 ? price : '';
if (link)
btn.href = link;
function fallback() { if (shown)
return; shown = true; embed.innerHTML = ''; if (link)
btn.hidden = false;
else
msg.hidden = false; }
if (!plan) {
fallback();
return;
}
var box = document.createElement('div');
box.setAttribute('data-whop-checkout-plan-id', plan);
if (name)
box.setAttribute('data-whop-checkout-prefill-name', name);
embed.appendChild(box);
loadWhop(function (ok) { if (!ok)
fallback(); });
setTimeout(function () { if (!box.querySelector('iframe') && !box.children.length)
fallback(); }, 9000);
}
form.addEventListener('submit', function (e) {
e.preventDefault();
if (!pick.svc || pick.svc === 'Bridal Glam' || !pick.day || pick.hour < 0) {
status.textContent = 'Please choose your service, day and time first.';
return;
}
var bad = validate();
if (bad.length) {
status.textContent = 'Please add your ' + needs(bad) + '.';
return;
}
var day = longDay(pick.day), time = fmtHour(pick.hour), online = $('input[name="pay"]:checked', form).value === 'Online', payWay = online ? 'Online' : 'In person';
var msg = ['Hi Launthia! I just booked on the Glow by Launthia website.', '', 'Service: ' + pick.svc + (PRICES[pick.svc] ? ' (' + PRICES[pick.svc] + ')' : ''), 'Day: ' + day, 'Time: ' + time, 'Name: ' + $('#f-name').value.trim(), 'WhatsApp: ' + $('#f-phone').value.trim(), 'Payment: ' + payWay].join('\n');
var url = WA + encodeURIComponent(msg);
window.open(url, '_blank', 'noopener');
$('#bk-d-svc').textContent = pick.svc;
$('#bk-d-day').textContent = day;
$('#bk-d-time').textContent = time;
$('#bk-send').href = url;
$('#bk-d-pay').textContent = payWay;
showPay(online, $('#f-name').value.trim());
$('#bk-note').textContent = 'Your booking opened in WhatsApp. Tap send so Launthia gets it' + (online ? ', then pay below.' : '. You’ll pay in person.');
form.hidden = true;
done.hidden = false;
if (!REDUCED) {
done.classList.remove('bk-in');
void done.offsetWidth;
done.classList.add('bk-in');
}
try {
done.focus({ preventScroll: true });
}
catch (er) { }
nudge(done.parentNode);
});
$('#bk-again').addEventListener('click', function () {
pick = { svc: '', day: '', hour: -1 };
form.reset();
syncPay();
status.textContent = '';
svcBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
quote.hidden = stepDay.hidden = stepTime.hidden = stepYou.hidden = true;
done.hidden = true;
form.hidden = false;
renderCal(0);
nudge(form.parentNode);
svcBtns[0].focus({ preventScroll: true });
});
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
function linkOrPlaceholder(a, url, msg) {
if (url) {
a.href = url;
a.target = '_blank';
a.rel = 'noopener sponsored';
a.removeAttribute('aria-disabled');
return true;
}
a.setAttribute('aria-disabled', 'true');
a.removeAttribute('target');
a.addEventListener('click', function (e) { e.preventDefault(); toast(msg); });
return false;
}
var CAT_ICONS = {
'Face': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="32" cy="34" r="20"/><circle cx="32" cy="34" r="13"/><path d="M14 30c3-10 10-15 18-15s15 5 18 15"/></svg>',
'Eyes': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="10" y="18" width="44" height="30" rx="5"/><circle cx="21" cy="29" r="5"/><circle cx="32" cy="29" r="5"/><circle cx="43" cy="29" r="5"/><path d="M14 41h36"/></svg>',
'Lips': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="24" y="34" width="16" height="20" rx="2"/><path d="M26 34V22l12-8v20"/><path d="M22 54h20"/></svg>',
'Brushes & Tools': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M20 52l18-26"/><path d="M36 28c2-7 7-14 14-16-1 8-6 14-12 18z"/><path d="M30 54l8-12"/><path d="M38 42c5 0 10-4 12-9-5 0-10 3-12 9z"/></svg>',
'Skin Prep': '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="22" y="22" width="20" height="32" rx="6"/><path d="M27 22v-6h10v6M29 16v-4h6"/><path d="M26 34h12"/></svg>'
};
function initShop() {
var tabsEl = $('#shop-tabs'), grid = $('#shop-grid');
if (!tabsEl || !grid)
return;
var CATS = ['All', 'Face', 'Eyes', 'Lips', 'Brushes & Tools', 'Skin Prep'];
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
PRODUCTS.forEach(function (p) {
var card = document.createElement('article');
card.className = 'p-card';
card.dataset.cat = p.category;
var img = p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name || p.category + ' product') + '" loading="lazy">' : (CAT_ICONS[p.category] || '') + '<span class="ph">[Owner to fill in: product image]</span>';
card.innerHTML = '<div class="p-inner"><span class="p-glare" aria-hidden="true"><i></i></span>' +
'<div class="p-img">' + img + '<span class="p-cat">' + esc(p.category) + '</span></div>' +
'<div class="p-body"><h3 class="p-name">' + (p.name ? esc(p.name) : '<span class="ph">[Owner to fill in: product name]</span>') + '</h3>' +
'<p class="p-note"><small>Why I love it</small>' + (p.note ? '<em>' + esc(p.note) + '</em>' : '<span class="ph">[Owner to fill in: why I love it]</span>') + '</p>' +
'<div class="p-actions"><a class="btn btn-dark" href="#shop">Shop on Amazon<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>' +
(p.url ? '' : '<span class="ph">[Owner to fill in: Amazon product or affiliate link]</span>') + '</div></div></div>';
linkOrPlaceholder($('.btn', card), p.url, 'This product link is coming soon.');
grid.appendChild(card);
});
$$('[data-storefront]').forEach(function (a) { linkOrPlaceholder(a, STOREFRONT_URL, 'Launthia’s Amazon storefront link is coming soon.'); });
if (STOREFRONT_URL)
$$('[data-storefront-ph]').forEach(function (el) { el.hidden = true; });
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
var CLUB = (function () {
var KEY = 'glowclub.v1', DAY = 86400000, mem = null, memOnly = false;
var SERVICES = ['Soft Glam', 'Full Glam', 'Bridal Glam'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var TEMPLATES = {
fresh: 'Hi {name}! It’s been a while since your {service} with Glow by Launthia 💛 I have openings this week. Want me to save you a spot?',
winback: 'Hi {name}, we miss you at Glow by Launthia! It’s been {weeks} weeks since your last glam. {offer} Shall I save you a spot?',
birthday: 'Hi {name}! Your birthday is coming up on {birthday} 🎂 Want a birthday glam? I’m holding a few spots that week.',
anniversary: 'Hi {name}! It’s almost a year since your Bridal Glam with Glow by Launthia 💍 Celebrating your anniversary? I’d love to glam you again.',
seasonal: 'Hi {name}! {campaign} is coming up and I’m opening glam spots. Want me to save you one?'
};
var RULE_LABEL = { fresh: 'Fresh glam', winback: 'We miss you', birthday: 'Birthday', anniversary: 'Anniversary', seasonal: 'Seasonal' };
function pad(n) { return ('0' + n).slice(-2); }
function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parse(s) { return new Date(s + 'T00:00:00'); }
function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function between(a, b) { return Math.round((b - a) / DAY); }
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function waNumber(s) { var d = digits(s); if (d.length === 7)
d = '1876' + d;
else if (d.length === 10 && d.slice(0, 3) === '876')
d = '1' + d; return d; }
function nice(s) { if (!s)
return '—'; var d = parse(s); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function bdayNice(mmdd) { if (!mmdd)
return '—'; var p = mmdd.split('-'); return +p[1] + ' ' + MONTHS[+p[0] - 1]; }
function defaults() {
var t = today();
return { v: 1, clients: [], log: [], offer: '[Owner to fill in: offer]', templates: Object.assign({}, TEMPLATES),
prices: { 'Soft Glam': '', 'Full Glam': '', 'Bridal Glam': '' },
rules: { fresh: { on: true, weeks: 4 }, winback: { on: true, weeks: 8 }, birthday: { on: true, days: 7 }, anniversary: { on: true }, seasonal: { on: true, name: 'Graduation season', start: ymd(t), end: ymd(addDays(t, 30)), clientIds: [] } } };
}
function merge(d, s) {
if (!s || typeof s !== 'object')
return d;
if (Array.isArray(s.clients))
d.clients = s.clients;
if (Array.isArray(s.log))
d.log = s.log;
if (typeof s.offer === 'string')
d.offer = s.offer;
if (s.privacy1)
d.privacy1 = true;
if (s.templates)
Object.keys(d.templates).forEach(function (k) { if (typeof s.templates[k] === 'string')
d.templates[k] = s.templates[k]; });
if (s.prices)
Object.keys(d.prices).forEach(function (k) { if (s.prices[k] !== undefined)
d.prices[k] = s.prices[k]; });
if (s.rules)
Object.keys(d.rules).forEach(function (k) { if (s.rules[k])
d.rules[k] = Object.assign(d.rules[k], s.rules[k]); });
d.clients.forEach(function (c) { c.visits = c.visits || []; c.eventTypes = c.eventTypes || []; });
return d;
}
function load() {
if (mem)
return mem;
var s = null;
try {
s = JSON.parse(localStorage.getItem(KEY) || 'null');
}
catch (e) {
memOnly = true;
}
mem = merge(defaults(), s);
if (!mem.privacy1) {
var gone = {};
mem.clients = mem.clients.filter(function (c) { var drop = !c.sample && (c.source === 'booking' || c.source === 'club'); if (drop)
gone[c.id] = 1; return !drop; });
mem.log = mem.log.filter(function (l) { return !gone[l.clientId]; });
mem.privacy1 = true;
if (s)
save();
}
return mem;
}
function save() { try {
localStorage.setItem(KEY, JSON.stringify(mem));
memOnly = false;
}
catch (e) {
memOnly = true;
} }
function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function byPhone(st, phone) { var d = digits(phone).slice(-7); if (d.length < 7)
return null; return st.clients.filter(function (c) { return digits(c.phone).slice(-7) === d; })[0] || null; }
function attributed(st, c, bookedAt) { var b = parse(bookedAt); return st.log.some(function (l) { if (l.clientId !== c.id)
return false; var d = between(parse(l.date), b); return d >= 0 && d <= 45; }); }
function upsert(rec) {
var st = load(), c = byPhone(st, rec.phone);
if (!c) {
c = { id: uid(), name: rec.name || 'Client', phone: rec.phone || '', consent: false, birthday: '', eventTypes: [], visits: [], joined: ymd(today()), source: rec.source || 'booking', sample: false };
st.clients.push(c);
}
if (rec.name)
c.name = rec.name;
if (rec.birthday)
c.birthday = rec.birthday;
if (rec.consent)
c.consent = true;
if (rec.club)
c.club = true;
if (rec.eventType && c.eventTypes.indexOf(rec.eventType) < 0)
c.eventTypes.push(rec.eventType);
if (rec.service) {
var v = { date: rec.date || ymd(today()), service: rec.service, eventType: rec.eventType || '', bookedAt: ymd(today()), source: rec.source || 'booking' };
v.fromReminder = attributed(st, c, v.bookedAt);
c.visits.push(v);
}
save();
return c;
}
function lastVisit(c) { var t = ymd(today()); var past = c.visits.filter(function (v) { return v.date && v.date <= t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); return past[past.length - 1] || null; }
function upcoming(c) { var t = ymd(today()); return c.visits.filter(function (v) { return v.date > t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0] || null; }
function daysSince(c) { var lv = lastVisit(c); return lv ? between(parse(lv.date), today()) : null; }
function status(c) {
var st = load(), d = daysSince(c);
if (upcoming(c) || (d !== null && d < st.rules.fresh.weeks * 7))
return { key: 'active', label: 'Active' };
if (d === null)
return { key: 'new', label: 'New' };
if (d < st.rules.winback.weeks * 7)
return { key: 'due', label: 'Due for a glam' };
return { key: 'quiet', label: 'Gone quiet' };
}
function daysToBirthday(mmdd) {
if (!mmdd)
return null;
var p = mmdd.split('-'), t = today(), d = new Date(t.getFullYear(), +p[0] - 1, +p[1]);
if (d < t)
d = new Date(t.getFullYear() + 1, +p[0] - 1, +p[1]);
return between(t, d);
}
function first(name) { return String(name || '').split(' ')[0] || 'there'; }
function render(tpl, c, extra) {
var st = load(), lv = lastVisit(c), d = daysSince(c);
var vars = { name: c.sample ? c.name : first(c.name), service: lv ? lv.service : 'last glam', weeks: d !== null ? Math.max(1, Math.floor(d / 7)) : '', birthday: bdayNice(c.birthday), offer: st.offer, campaign: st.rules.seasonal.name };
Object.assign(vars, extra || {});
return tpl.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }).replace(/\s{2,}/g, ' ').trim();
}
function due() {
var st = load(), r = st.rules, t = today(), items = [];
var sent = {};
st.log.forEach(function (l) { sent[l.key] = l; });
st.clients.forEach(function (c) {
if (!c.consent)
return;
var lv = lastVisit(c), d = daysSince(c), up = upcoming(c);
function add(rule, key, reason) { items.push({ rule: rule, key: key, client: c, reason: reason, sent: sent[key] || null, msg: render(st.templates[rule], c) }); }
var everyday = lv && (lv.service === 'Soft Glam' || lv.service === 'Full Glam');
if (r.fresh.on && !up && everyday && d >= r.fresh.weeks * 7 && d < r.winback.weeks * 7)
add('fresh', 'fresh:' + c.id + ':' + lv.date, d + ' days since ' + lv.service);
if (r.winback.on && !up && everyday && d >= r.winback.weeks * 7)
add('winback', 'winback:' + c.id + ':' + lv.date, Math.floor(d / 7) + ' weeks with no booking');
var bd = daysToBirthday(c.birthday);
if (r.birthday.on && bd !== null && bd <= r.birthday.days)
add('birthday', 'birthday:' + c.id + ':' + addDays(t, bd).getFullYear(), bd === 0 ? 'Birthday today' : 'Birthday in ' + bd + (bd === 1 ? ' day' : ' days'));
if (r.anniversary.on)
c.visits.forEach(function (v) { if (v.service !== 'Bridal Glam')
return; var ann = parse(v.date); ann.setFullYear(ann.getFullYear() + 1); var diff = between(ann, t); if (diff >= -3 && diff <= 14)
add('anniversary', 'anniversary:' + c.id + ':' + v.date, diff < 0 ? 'Wedding anniversary in ' + (-diff) + ' days' : 'Wedding anniversary'); });
var sv = r.seasonal, ts = ymd(t);
if (sv.on && sv.name && ts >= sv.start && ts <= sv.end && sv.clientIds.indexOf(c.id) >= 0)
add('seasonal', 'seasonal:' + c.id + ':' + sv.name + ':' + sv.start, sv.name + ' campaign');
});
var ts = ymd(t);
return items.filter(function (it) { return !it.sent || it.sent.date === ts; });
}
function markSent(item, msg) {
var st = load();
if (st.log.some(function (l) { return l.key === item.key; }))
return;
st.log.push({ key: item.key, clientId: item.client.id, rule: item.rule, date: ymd(today()), message: msg });
save();
}
function waLink(c, msg) { var n = waNumber(c.phone); return 'https://wa.me/' + (c.sample || n.length < 10 ? '' : n) + '?text=' + encodeURIComponent(msg); }
function rebook(c) {
var st = load(), lv = lastVisit(c) || upcoming(c);
var v = { date: ymd(today()), service: lv ? lv.service : 'Soft Glam', eventType: '', bookedAt: ymd(today()), source: 'owner' };
v.fromReminder = attributed(st, c, v.bookedAt);
c.visits.push(v);
save();
return v;
}
function results() {
var st = load(), reb = 0, rev = 0, priced = true, clients = 0;
st.clients.forEach(function (c) { var n = 0; c.visits.forEach(function (v) { if (v.fromReminder) {
n++;
var p = parseFloat(String(st.prices[v.service] || '').replace(/[^\d.]/g, ''));
if (p > 0)
rev += p;
else
priced = false;
} }); if (n) {
clients++;
reb += n;
} });
return { clients: clients, rebookings: reb, revenue: rev, priced: priced && reb > 0 };
}
function sample() {
var t = today(), ago = function (n) { return ymd(addDays(t, -n)); }, bd = function (n) { var x = addDays(t, n); return pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
var S = [
{ consent: true, birthday: bd(6), types: ['Birthday'], visits: [[31, 'Soft Glam', 'Birthday', 40]] },
{ consent: true, birthday: bd(120), types: ['Photoshoot'], visits: [[64, 'Full Glam', 'Photoshoot', 70]] },
{ consent: true, birthday: bd(200), types: ['Wedding'], visits: [[363, 'Bridal Glam', 'Wedding', 420]] },
{ consent: true, birthday: bd(80), types: ['Graduation', 'Other'], visits: [[75, 'Soft Glam', 'Graduation', 80], [9, 'Soft Glam', 'Other', 14, true]] },
{ consent: false, birthday: '', types: ['Birthday'], visits: [[44, 'Full Glam', 'Birthday', 50]] },
{ consent: true, birthday: bd(30), types: ['Photoshoot', 'Graduation'], visits: [[90, 'Full Glam', 'Photoshoot', 95], [18, 'Full Glam', 'Graduation', 24, true]] }
];
var st = load();
clearSample(true);
S.forEach(function (s, i) {
st.clients.push({ id: 'sample-' + (i + 1), name: 'Sample Client ' + (i + 1), phone: '', sample: true, consent: s.consent, birthday: s.birthday, eventTypes: s.types, joined: ago(120), source: 'sample',
visits: s.visits.map(function (v) { return { date: ago(v[0]), service: v[1], eventType: v[2], bookedAt: ago(v[3]), source: 'sample', fromReminder: !!v[4] }; }) });
});
st.log.push({ key: 'winback:sample-4:' + ago(75), clientId: 'sample-4', rule: 'winback', date: ago(16), message: 'Sample message', sample: true });
st.log.push({ key: 'winback:sample-6:' + ago(90), clientId: 'sample-6', rule: 'winback', date: ago(27), message: 'Sample message', sample: true });
st.rules.seasonal.clientIds = st.rules.seasonal.clientIds.filter(function (id) { return id.indexOf('sample-') !== 0; }).concat(['sample-4', 'sample-6']);
save();
}
function clearSample(silent) {
var st = load();
st.clients = st.clients.filter(function (c) { return !c.sample; });
st.log = st.log.filter(function (l) { return String(l.clientId).indexOf('sample-') !== 0; });
st.rules.seasonal.clientIds = st.rules.seasonal.clientIds.filter(function (id) { return id.indexOf('sample-') !== 0; });
if (!silent)
save();
}
function hasSample() { return load().clients.some(function (c) { return c.sample; }); }
function exportJSON() { return JSON.stringify(load(), null, 2); }
function importJSON(text) { var s = JSON.parse(text); if (!s || !Array.isArray(s.clients))
throw new Error('No client list found in that file.'); mem = merge(defaults(), s); save(); return mem.clients.length; }
function eraseAll() { mem = defaults(); save(); }
return { load: load, save: save, upsert: upsert, due: due, markSent: markSent, waLink: waLink, rebook: rebook, results: results, sample: sample, clearSample: clearSample, hasSample: hasSample,
exportJSON: exportJSON, importJSON: importJSON, eraseAll: eraseAll, status: status, lastVisit: lastVisit, upcoming: upcoming, daysSince: daysSince, nice: nice, bdayNice: bdayNice,
RULE_LABEL: RULE_LABEL, TEMPLATES: TEMPLATES, SERVICES: SERVICES, MONTHS: MONTHS, isMemoryOnly: function () { return memOnly; }, today: function () { return ymd(today()); } };
})();
function fillBirthdaySelects() {
$$('select.bday-d').forEach(function (s) { for (var d = 1; d <= 31; d++) {
var o = document.createElement('option');
o.value = ('0' + d).slice(-2);
o.textContent = d;
s.appendChild(o);
} });
$$('select.bday-m').forEach(function (s) { CLUB.MONTHS.forEach(function (m, i) { var o = document.createElement('option'); o.value = ('0' + (i + 1)).slice(-2); o.textContent = m; s.appendChild(o); }); });
}
function initClub() {
var form = $('#club-form'), done = $('#club-done'), status = $('#club-status');
if (!form)
return null;
var WAYS = { Email: { field: 'email', label: 'Email address', by: 'by email', need: 'your email address' },
SMS: { field: 'phone', label: 'Mobile number', by: 'by text', need: 'your mobile number' },
WhatsApp: { field: 'phone', label: 'WhatsApp number', by: 'on WhatsApp', need: 'your WhatsApp number' } };
var emailField = $('#c-email-field'), phoneField = $('#c-phone-field'), consentText = $('#c-consent-text');
function chosenWay() { var r = $('input[name="way"]:checked', form); return r ? r.value : ''; }
function waySync() {
var w = WAYS[chosenWay()];
emailField.hidden = !w || w.field !== 'email';
phoneField.hidden = !w || w.field !== 'phone';
if (w && w.field === 'phone')
$('#c-phone-label').textContent = w.label;
consentText.textContent = 'Yes, Glow by Launthia can send me booking reminders and offers' + (w ? ' ' + w.by : '') + '.';
if (w)
$('#c-way-field').classList.remove('invalid');
}
$$('input[name="way"]', form).forEach(function (r) { r.addEventListener('change', waySync); });
form.addEventListener('submit', function (e) {
e.preventDefault();
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
check(name, name.value.trim().length > 1, 'your name');
check($('#c-way-field .club-ways'), !!w, 'how you’d like reminders');
if (w && w.field === 'email')
check(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()), w.need);
if (w && w.field === 'phone')
check(phone, phone.value.replace(/\D/g, '').length >= 7, w.need);
check(consent, consent.checked, 'a tick to say yes to reminders and offers');
if (bad.length) {
status.textContent = 'Please add ' + bad.join(', ') + '.';
return;
}
var d = $('#c-bday-d').value, m = $('#c-bday-m').value;
var msg = ['Hi Launthia! I’d like to join the Glow Club.', '', 'Name: ' + name.value.trim(), 'Reminders by: ' + way, w.label + ': ' + (w.field === 'email' ? email.value.trim() : phone.value.trim())];
if (d && m)
msg.push('Birthday: ' + parseInt(d, 10) + ' ' + new Date(2000, parseInt(m, 10) - 1, 1).toLocaleDateString('en-GB', { month: 'long' }));
msg.push('Yes to booking reminders and offers ' + w.by);
window.open('https://wa.me/18762778913?text=' + encodeURIComponent(msg.join('\n')), '_blank', 'noopener');
$('#club-done-name').textContent = name.value.trim().split(' ')[0];
form.hidden = true;
done.hidden = false;
status.textContent = '';
});
$('#club-again').addEventListener('click', function () { form.reset(); waySync(); done.hidden = true; form.hidden = false; $('#c-name').focus(); });
var canvas = $('#club-canvas');
if (!canvas || !HAS3 || !root.classList.contains('webgl'))
return null;
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
var FRAMED = (function () { try {
return window.top !== window.self;
}
catch (e) {
return true;
} })();
function initOwner() {
var ow = $('#owner');
if (!ow)
return;
var gate = $('#ow-gate'), app = $('#ow-app'), panels = $('#ow-panels'), stepEl = $('#ow-step'), stepCard = $('#ow-step-card');
var tab = 'today', unlocked = false, filter = 'all', query = '';
try {
unlocked = sessionStorage.getItem('glowclub.unlocked') === '1';
}
catch (e) { }
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
var initial = function (n) { return esc(String(n || '?').trim().charAt(0).toUpperCase()); };
function open() {
ow.hidden = false;
OWNER_OPEN = true;
root.classList.add('lb-lock');
gate.hidden = unlocked;
app.hidden = !unlocked;
if (unlocked)
render();
else
setTimeout(function () { $('#ow-pass').focus(); }, 60);
}
function close() { if (ow.hidden)
return; ow.hidden = true; OWNER_OPEN = false; stepEl.hidden = true; root.classList.remove('lb-lock'); }
function route() { if (location.hash === '#owner')
open();
else
close(); }
addEventListener('hashchange', route);
route();
$('#ow-gate-form').addEventListener('submit', function (e) {
e.preventDefault();
var v = $('#ow-pass').value.trim().toLowerCase();
if (v === 'glow') {
unlocked = true;
try {
sessionStorage.setItem('glowclub.unlocked', '1');
}
catch (er) { }
gate.hidden = true;
app.hidden = false;
render();
$('#ow-title').focus && app.focus && app.focus();
}
else {
$('#ow-gate-status').textContent = 'That passcode isn’t right. The demo passcode is glow.';
var f = $('#ow-pass').closest('.field');
f.classList.add('invalid');
if (!REDUCED) {
f.classList.remove('shake');
void f.offsetWidth;
f.classList.add('shake');
}
}
});
$$('.ow-tabs [data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.dataset.tab; $$('.ow-tabs [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); render(); }); });
function sampleNote() { return CLUB.hasSample() ? '<span class="st st-plain">Showing sample clients</span>' : ''; }
function itemHTML(it, i) {
var c = it.client, sent = it.sent;
return '<article class="ow-item ow-glass' + (sent ? ' is-sent' : '') + '" style="animation-delay:' + (i * 55) + 'ms" data-key="' + esc(it.key) + '">' +
'<div class="ow-item-top"><span class="ow-av">' + initial(c.name) + '</span><span class="ow-who"><b>' + esc(c.name) + (c.sample ? '<span class="ow-tag">Sample</span>' : '') + '</b><span>' + esc(it.reason) + '</span></span><span class="st st-rule">' + esc(CLUB.RULE_LABEL[it.rule]) + '</span></div>' +
'<textarea class="ow-msg" aria-label="Message to ' + esc(c.name) + '"' + (sent ? ' readonly' : '') + '>' + esc(sent ? sent.message : it.msg) + '</textarea>' +
'<div class="ow-actions">' + (sent ? '<span class="ow-sent"><i>✓</i>Sent · logged ' + esc(CLUB.nice(sent.date)) + '</span>' :
'<a class="btn btn-dark" data-send href="' + esc(CLUB.waLink(c, it.msg)) + '" target="_blank" rel="noopener">Send on WhatsApp</a>') +
'<span class="ow-sub">' + (c.sample ? 'Sample client: WhatsApp opens without a number' : esc(c.phone)) + '</span></div></article>';
}
function today() {
var items = CLUB.due(), pending = items.filter(function (i) { return !i.sent; }), sentN = items.length - pending.length;
var html = '<section class="ow-panel"><div class="ow-row"><div><h3>Today’s <em>reminders</em></h3><p class="ow-sub">' + pending.length + ' due · ' + sentN + ' sent today · only clients who ticked “yes” to WhatsApp messages</p></div>' +
'<div class="ow-actions">' + sampleNote() + '<button class="btn btn-dark" type="button" data-act="sendall"' + (pending.length ? '' : ' disabled') + '>Send to all due (' + pending.length + ')</button></div></div>';
html += items.length ? '<div class="ow-list">' + items.map(itemHTML).join('') + '</div>' :
'<div class="ow-empty ow-glass"><p class="h3">All <em>caught up</em></p><p>No one is due for a reminder today. New clients appear here when the website booking form or the Glow Club form saves them.' + (CLUB.hasSample() ? '' : ' Load the sample clients from Data to see it in action.') + '</p></div>';
return html + '</section>';
}
function clientCard(c, i) {
var s = CLUB.status(c), lv = CLUB.lastVisit(c), up = CLUB.upcoming(c), d = CLUB.daysSince(c);
return '<article class="ow-card ow-glass" style="animation-delay:' + (i * 45) + 'ms">' +
'<div class="ow-item-top"><span class="ow-av">' + initial(c.name) + '</span><span class="ow-who"><b>' + esc(c.name) + (c.sample ? '<span class="ow-tag">Sample</span>' : '') + '</b><span>' + (c.sample ? 'Sample number' : esc(c.phone || 'No number')) + '</span></span></div>' +
'<div class="ow-chips"><span class="st st-' + s.key + '">' + s.label + '</span><span class="st st-plain">' + (c.consent ? 'Reminders on' : 'No consent') + '</span>' + (c.club ? '<span class="st st-plain">Glow Club</span>' : '') + '</div>' +
'<dl class="ow-kv"><dt>Last service</dt><dd>' + esc(lv ? lv.service : '—') + '</dd><dt>Last visit</dt><dd>' + esc(lv ? CLUB.nice(lv.date) : '—') + '</dd>' +
(up ? '<dt>Upcoming</dt><dd>' + esc(up.service + ' · ' + CLUB.nice(up.date)) + '</dd>' : '') +
'<dt>Birthday</dt><dd>' + esc(CLUB.bdayNice(c.birthday)) + '</dd><dt>Events</dt><dd>' + esc((c.eventTypes || []).join(', ') || '—') + '</dd></dl>' +
'<div class="ow-days"><b>' + (d === null ? '—' : d) + '</b><span>days since last glam</span></div>' +
'<div class="ow-actions"><button class="btn btn-ghost" type="button" data-rebook="' + esc(c.id) + '">Log a rebooking</button><button class="link-arrow" type="button" data-remove="' + esc(c.id) + '">Remove</button></div></article>';
}
function clients() {
var st = CLUB.load(), list = st.clients.filter(function (c) {
var s = CLUB.status(c).key;
if (filter === 'active' && s !== 'active')
return false;
if (filter === 'due' && s !== 'due')
return false;
if (filter === 'quiet' && s !== 'quiet')
return false;
if (filter === 'noconsent' && c.consent)
return false;
return !query || (c.name + ' ' + c.phone).toLowerCase().indexOf(query) >= 0;
});
var f = function (k, l) { return '<button class="shop-tab" type="button" data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' + l + '</button>'; };
return '<section class="ow-panel"><div class="ow-row"><div><h3>Client <em>list</em></h3><p class="ow-sub">' + st.clients.length + ' clients · Active under ' + st.rules.fresh.weeks + ' weeks · Due for a glam ' + st.rules.fresh.weeks + '–' + st.rules.winback.weeks + ' weeks · Gone quiet ' + st.rules.winback.weeks + '+ weeks</p></div>' + sampleNote() + '</div>' +
'<div class="ow-row"><input class="ow-search" type="search" placeholder="Search by name or number" value="' + esc(query) + '" aria-label="Search clients" data-search><div class="ow-filter">' + f('all', 'All') + f('active', 'Active') + f('due', 'Due') + f('quiet', 'Gone quiet') + f('noconsent', 'No consent') + '</div></div>' +
(list.length ? '<div class="ow-cards">' + list.map(clientCard).join('') + '</div>' : '<div class="ow-empty ow-glass">No clients match. For privacy the website never saves customer details; bookings and Glow Club sign-ups arrive on WhatsApp.</div>') + '</section>';
}
function rules() {
var st = CLUB.load(), r = st.rules, T = st.templates;
function tg(path, on) { return '<label class="tgl"><input type="checkbox" data-rule-on="' + path + '"' + (on ? ' checked' : '') + '><span></span><b class="sr-only">On</b></label>'; }
function tpl(k) { return '<textarea class="ow-msg" data-tpl="' + k + '" aria-label="' + esc(CLUB.RULE_LABEL[k]) + ' message">' + esc(T[k]) + '</textarea>'; }
var picks = st.clients.filter(function (c) { return c.consent; }).map(function (c) { return '<label class="chip"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (r.seasonal.clientIds.indexOf(c.id) >= 0 ? ' checked' : '') + '><span>' + esc(c.name) + '</span></label>'; }).join('') || '<span class="ow-help">Clients who said yes to reminders will appear here.</span>';
return '<section class="ow-panel"><div class="ow-row"><div><h3>Rules &amp; <em>messages</em></h3><p class="ow-sub">Changes save automatically. Placeholders: <code>{name}</code> <code>{service}</code> <code>{weeks}</code> <code>{birthday}</code> <code>{offer}</code> <code>{campaign}</code></p></div><button class="btn btn-ghost" type="button" data-act="resettpl">Reset messages</button></div>' +
'<div class="ow-rule ow-glass"><div class="ow-rule-head"><span><b>Fresh glam reminder</b><small>After a Soft Glam or Full Glam</small></span>' + tg('fresh', r.fresh.on) + '</div><div class="ow-inline">Send after <input class="ow-num" type="number" min="1" max="52" value="' + r.fresh.weeks + '" data-num="fresh.weeks" aria-label="Weeks after the last glam"> weeks</div>' + tpl('fresh') + '</div>' +
'<div class="ow-rule ow-glass"><div class="ow-rule-head"><span><b>We miss you (win-back)</b><small>No booking for a while. Brides get the anniversary message instead.</small></span>' + tg('winback', r.winback.on) + '</div><div class="ow-inline">After <input class="ow-num" type="number" min="2" max="104" value="' + r.winback.weeks + '" data-num="winback.weeks" aria-label="Weeks with no booking"> weeks with no booking · Offer <input class="ow-text" type="text" value="' + esc(st.offer) + '" data-offer aria-label="Win-back offer"></div>' + tpl('winback') + '</div>' +
'<div class="ow-rule ow-glass"><div class="ow-rule-head"><span><b>Birthday glam</b><small>For clients who shared their birthday</small></span>' + tg('birthday', r.birthday.on) + '</div><div class="ow-inline">Send <input class="ow-num" type="number" min="1" max="30" value="' + r.birthday.days + '" data-num="birthday.days" aria-label="Days before the birthday"> days before</div>' + tpl('birthday') + '</div>' +
'<div class="ow-rule ow-glass"><div class="ow-rule-head"><span><b>Bridal anniversary</b><small>One year after a Bridal Glam</small></span>' + tg('anniversary', r.anniversary.on) + '</div>' + tpl('anniversary') + '</div>' +
'<div class="ow-rule ow-glass"><div class="ow-rule-head"><span><b>Seasonal campaign</b><small>Graduation season, holidays and more, to the clients you choose</small></span>' + tg('seasonal', r.seasonal.on) + '</div>' +
'<div class="ow-inline">Name <input class="ow-text" type="text" value="' + esc(r.seasonal.name) + '" data-season="name" aria-label="Campaign name"></div>' +
'<div class="ow-inline">From <input class="ow-date" type="date" value="' + esc(r.seasonal.start) + '" data-season="start" aria-label="Campaign start"> to <input class="ow-date" type="date" value="' + esc(r.seasonal.end) + '" data-season="end" aria-label="Campaign end"></div>' +
'<div class="ow-pick">' + picks + '</div>' + tpl('seasonal') + '</div></section>';
}
function results() {
var st = CLUB.load(), R = CLUB.results(), logs = st.log.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 12);
var byId = {};
st.clients.forEach(function (c) { byId[c.id] = c; });
var price = function (s) { return '<label class="ow-inline">' + s + ' <span>J$</span><input class="ow-text" type="text" inputmode="numeric" placeholder="[Owner to fill in]" value="' + esc(st.prices[s]) + '" data-price="' + s + '" aria-label="' + s + ' price in J$"></label>'; };
return '<section class="ow-panel"><div class="ow-row"><div><h3>Results</h3><p class="ow-sub">A rebooking counts as “from a reminder” when it comes within 45 days of a message you sent.</p></div>' + sampleNote() + '</div>' +
'<div class="ow-stats"><div class="ow-stat ow-glass"><span>Clients reactivated</span><b data-count="' + R.clients + '">0</b><p>Came back after a reminder</p></div>' +
'<div class="ow-stat ow-glass" style="animation-delay:80ms"><span>Rebookings from reminders</span><b data-count="' + R.rebookings + '">0</b><p>Bookings made after a message</p></div>' +
'<div class="ow-stat ow-glass" style="animation-delay:160ms"><span>Estimated revenue recovered</span><b data-count="' + R.revenue + '" data-prefix="J$">' + (R.revenue ? 'J$0' : 'J$ —') + '</b><p>' + (R.priced ? 'Rebookings × your price for each service' : 'Add your prices below: rebookings × your price for each service') + '</p></div></div>' +
'<div class="ow-prices ow-glass"><b>Your prices</b>' + CLUB.SERVICES.map(price).join('') + '</div>' +
'<div class="ow-log ow-glass"><b>Message log</b><ul>' + (logs.length ? logs.map(function (l) { var c = byId[l.clientId]; return '<li><span>' + esc(c ? c.name : 'Removed client') + ' · ' + esc(CLUB.RULE_LABEL[l.rule] || l.rule) + '</span><span>Sent ' + esc(CLUB.nice(l.date)) + '</span></li>'; }).join('') : '<li><span>No messages sent yet.</span><span></span></li>') + '</ul></div></section>';
}
function data() {
return '<section class="ow-panel"><div class="ow-row"><div><h3>Your <em>data</em></h3><p class="ow-sub">Saved in this browser' + (CLUB.isMemoryOnly() ? ' (storage is blocked here, so data lasts until you close the page)' : '') + '. Export a backup before clearing your browser.</p></div></div>' +
'<div class="ow-data ow-glass"><b>Sample clients</b><p class="ow-help">Six clearly labelled sample clients (no real names or numbers) to show how the dashboard works.</p><div class="ow-actions"><button class="btn btn-dark" type="button" data-act="sample">Load sample clients</button><button class="btn btn-ghost" type="button" data-act="clearsample"' + (CLUB.hasSample() ? '' : ' disabled') + '>Clear sample data</button></div></div>' +
'<div class="ow-data ow-glass"><b>Export</b><textarea readonly aria-label="Exported JSON" data-export>' + esc(CLUB.exportJSON()) + '</textarea><div class="ow-actions"><button class="btn btn-dark" type="button" data-act="copy">Copy JSON</button>' + (FRAMED ? '' : '<button class="btn btn-ghost" type="button" data-act="download">Download .json</button>') + '</div><p class="ow-help">' + (FRAMED ? 'Copy the JSON and keep it somewhere safe as a backup. On the live site there is also a download button.' : 'Download a backup file, or copy the JSON.') + '</p></div>' +
'<div class="ow-data ow-glass"><b>Import</b><textarea aria-label="Paste JSON to import" placeholder="Paste an exported JSON backup here" data-import></textarea><div class="ow-actions"><button class="btn btn-dark" type="button" data-act="import">Import JSON</button><label class="ow-file">or choose a file <input type="file" accept="application/json,.json" data-file></label></div><p class="form-status" data-import-status role="status" aria-live="polite"></p></div>' +
'<div class="ow-data ow-glass"><b>Erase everything</b><p class="ow-help">Removes every client, message log and setting from this browser.</p><div class="ow-actions"><button class="btn btn-ghost" type="button" data-act="erase">Erase all data</button></div></div></section>';
}
function countUp() {
$$('[data-count]', panels).forEach(function (el) {
var to = +el.dataset.count, pre = el.dataset.prefix || '', fmt = function (v) { return pre + Math.round(v).toLocaleString('en-JM'); };
if (!to) {
if (pre)
el.textContent = 'J$ —';
return;
}
if (REDUCED) {
el.textContent = fmt(to);
return;
}
var t0 = performance.now();
(function step(now) { var k = Math.min(1, (now - t0) / 1300); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1)
requestAnimationFrame(step); })(t0);
});
}
function render() {
panels.innerHTML = { today: today, clients: clients, rules: rules, results: results, data: data }[tab]();
if (tab === 'results')
countUp();
}
function itemByKey(key) { return CLUB.due().filter(function (i) { return i.key === key; })[0]; }
panels.addEventListener('input', function (e) {
var el = e.target, st = CLUB.load();
if (el.matches('.ow-item .ow-msg')) {
var card = el.closest('.ow-item'), it = itemByKey(card.dataset.key), a = $('[data-send]', card);
if (it && a)
a.href = CLUB.waLink(it.client, el.value);
return;
}
if (el.dataset.tpl) {
st.templates[el.dataset.tpl] = el.value;
CLUB.save();
return;
}
if (el.dataset.num) {
var p = el.dataset.num.split('.'), v = Math.max(1, parseInt(el.value, 10) || 1);
st.rules[p[0]][p[1]] = v;
CLUB.save();
return;
}
if (el.hasAttribute('data-offer')) {
st.offer = el.value;
CLUB.save();
return;
}
if (el.dataset.season) {
st.rules.seasonal[el.dataset.season] = el.value;
CLUB.save();
return;
}
if (el.dataset.price) {
st.prices[el.dataset.price] = el.value.replace(/[^\d.]/g, '');
CLUB.save();
var R = CLUB.results(), b = $('[data-prefix]', panels);
if (b) {
b.dataset.count = R.revenue;
b.textContent = R.revenue ? 'J$' + Math.round(R.revenue).toLocaleString('en-JM') : 'J$ —';
}
return;
}
if (el.hasAttribute('data-search')) {
query = el.value.trim().toLowerCase();
var pos = el.selectionStart;
render();
var s = $('[data-search]', panels);
s.focus();
try {
s.setSelectionRange(pos, pos);
}
catch (er) { }
}
});
panels.addEventListener('change', function (e) {
var el = e.target, st = CLUB.load();
if (el.dataset.ruleOn) {
st.rules[el.dataset.ruleOn].on = el.checked;
CLUB.save();
return;
}
if (el.dataset.pick) {
var ids = st.rules.seasonal.clientIds, i = ids.indexOf(el.dataset.pick);
if (el.checked && i < 0)
ids.push(el.dataset.pick);
if (!el.checked && i >= 0)
ids.splice(i, 1);
CLUB.save();
return;
}
if (el.hasAttribute('data-file') && el.files && el.files[0]) {
var r = new FileReader();
r.onload = function () { doImport(String(r.result)); };
r.readAsText(el.files[0]);
}
});
function doImport(text) {
var out = $('[data-import-status]', panels);
try {
var n = CLUB.importJSON(text);
toast('Imported ' + n + ' clients.');
render();
}
catch (er) {
if (out)
out.textContent = 'That doesn’t look like a Glow Club backup: ' + er.message;
}
}
var armed = {};
panels.addEventListener('click', function (e) {
var el = e.target.closest('button, a');
if (!el)
return;
if (el.matches('[data-send]')) {
var card = el.closest('.ow-item'), it = itemByKey(card.dataset.key);
if (it) {
CLUB.markSent(it, $('.ow-msg', card).value);
setTimeout(render, 350);
}
return;
}
if (el.dataset.filter) {
filter = el.dataset.filter;
render();
return;
}
if (el.dataset.rebook) {
var c = CLUB.load().clients.filter(function (x) { return x.id === el.dataset.rebook; })[0];
if (c) {
var v = CLUB.rebook(c);
toast('Rebooking logged for ' + c.name + (v.fromReminder ? ', counted as a reminder win.' : '.'));
render();
}
return;
}
if (el.dataset.remove) {
var id = el.dataset.remove;
if (!armed[id]) {
armed[id] = 1;
el.textContent = 'Tap again to remove';
setTimeout(function () { delete armed[id]; if (el.isConnected)
el.textContent = 'Remove'; }, 3000);
return;
}
var st = CLUB.load();
st.clients = st.clients.filter(function (x) { return x.id !== id; });
CLUB.save();
render();
return;
}
var act = el.dataset.act;
if (!act)
return;
if (act === 'sendall')
startSteps();
else if (act === 'sample') {
CLUB.sample();
toast('Six sample clients loaded.');
tab = 'today';
$$('.ow-tabs [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', String(x.dataset.tab === 'today')); });
render();
}
else if (act === 'clearsample') {
CLUB.clearSample();
toast('Sample data cleared.');
render();
}
else if (act === 'resettpl') {
var s2 = CLUB.load();
s2.templates = Object.assign({}, CLUB.TEMPLATES);
CLUB.save();
render();
toast('Messages reset.');
}
else if (act === 'copy') {
var ta = $('[data-export]', panels);
try {
navigator.clipboard.writeText(ta.value).then(function () { toast('JSON copied.'); }, function () { ta.select(); toast('Selected: press copy.'); });
}
catch (er) {
ta.select();
toast('Selected: press copy.');
}
}
else if (act === 'download') {
try {
var url = URL.createObjectURL(new Blob([CLUB.exportJSON()], { type: 'application/json' })), a = document.createElement('a');
a.href = url;
a.download = 'glow-club-backup-' + CLUB.today() + '.json';
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}
catch (er) { }
toast('If nothing downloaded, use Copy JSON instead.');
}
else if (act === 'import') {
doImport($('[data-import]', panels).value);
}
else if (act === 'erase') {
if (!armed.erase) {
armed.erase = 1;
el.textContent = 'Tap again to erase everything';
setTimeout(function () { delete armed.erase; if (el.isConnected)
el.textContent = 'Erase all data'; }, 3000);
return;
}
CLUB.eraseAll();
toast('All Glow Club data erased.');
render();
}
});
var queue = [], qi = 0, sentCount = 0;
function startSteps() { queue = CLUB.due().filter(function (i) { return !i.sent; }); qi = 0; sentCount = 0; if (!queue.length)
return; stepEl.hidden = false; showStep(); }
function showStep() {
if (qi >= queue.length) {
stepCard.innerHTML = '<p class="eyebrow">Send to all due</p><p class="h3">All <em>done</em></p><p class="muted">' + sentCount + ' of ' + queue.length + ' messages opened in WhatsApp and logged.</p><div class="ow-actions"><button class="btn btn-dark" type="button" data-step="close">Back to today</button></div>';
$('[data-step="close"]', stepCard).focus();
return;
}
var it = queue[qi], c = it.client;
stepCard.innerHTML = '<div class="ow-row"><p class="eyebrow" id="ow-step-title">Reminder ' + (qi + 1) + ' of ' + queue.length + '</p><button class="link-arrow" type="button" data-step="close">Stop</button></div>' +
'<div class="ow-prog"><i style="transform:scaleX(' + (qi / queue.length) + ')"></i></div>' +
'<div class="ow-item-top"><span class="ow-av">' + initial(c.name) + '</span><span class="ow-who"><b>' + esc(c.name) + (c.sample ? '<span class="ow-tag">Sample</span>' : '') + '</b><span>' + esc(it.reason) + '</span></span><span class="st st-rule">' + esc(CLUB.RULE_LABEL[it.rule]) + '</span></div>' +
'<textarea class="ow-msg" aria-label="Message to ' + esc(c.name) + '">' + esc(it.msg) + '</textarea>' +
'<div class="ow-actions"><a class="btn btn-dark" data-step="send" href="' + esc(CLUB.waLink(c, it.msg)) + '" target="_blank" rel="noopener">Send on WhatsApp</a><button class="btn btn-ghost" type="button" data-step="skip">Skip</button></div>';
var ta = $('textarea', stepCard), a = $('[data-step="send"]', stepCard);
ta.addEventListener('input', function () { a.href = CLUB.waLink(c, ta.value); });
requestAnimationFrame(function () { var bar = $('.ow-prog i', stepCard); if (bar)
bar.style.transform = 'scaleX(' + ((qi + 0.5) / queue.length) + ')'; });
a.focus();
}
stepCard.addEventListener('click', function (e) {
var el = e.target.closest('[data-step]');
if (!el)
return;
var s = el.dataset.step;
if (s === 'send') {
var it = queue[qi];
CLUB.markSent(it, $('textarea', stepCard).value);
sentCount++;
qi++;
setTimeout(showStep, 450);
}
else if (s === 'skip') {
qi++;
showStep();
}
else if (s === 'close') {
stepEl.hidden = true;
render();
}
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !stepEl.hidden) {
stepEl.hidden = true;
render();
} });
}
var hero = null, about = null, scroll = null, writer = null, foot = null;
fillBirthdaySelects();
initUI();
initShop();
try {
CLUB.load();
}
catch (e) { }
var club = initClub();
initOwner();
writer = initWrite();
if (HAS3) {
hero = initHero();
}
if (HAS3 && root.classList.contains('webgl')) {
about = initAbout();
foot = initFooterLiquid();
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