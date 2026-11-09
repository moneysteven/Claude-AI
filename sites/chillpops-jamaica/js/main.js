/* ====================================================================================
   EDIT HERE: business details, hours and flavours. One place for the whole site.
   Anything left empty shows as "To be confirmed" on the pages.
   ==================================================================================== */
const BIZ = {
  name: 'ChillPops Jamaica',
  phone: '',      // TODO: confirmed phone, e.g. '(876) 555-1234'. Public listings conflict, so none is shown yet.
  whatsapp: '',   // TODO: WhatsApp number, digits only, e.g. '18765551234'
  email: 'chillpopsjamaica@gmail.com', // DRAFT: from a Tripadvisor listing. Not yet confirmed by the business.
  instagram: 'https://www.instagram.com/chillpopsjamaica/',
  facebook: 'https://www.facebook.com/106477838678011/',
  timezone: 'America/Jamaica',
  // TODO: confirmed opening hours, 24-hour clock, Jamaica time. Example: mon: [['10:30', '21:00']]
  hours: {
    negril:   { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
    ochorios: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  },
};

// Flavours that have been publicly featured. NOT a guaranteed current menu, and no prices until the owner supplies them.
// g = group, c = illustration colours, dip/speck = illustration details, a = contains alcohol, ask = ask about alcohol,
// s = where it was published, f = show on the home page.
const GROUPS = {
  fruit:    ['Fruit paletas', 'Featured in the Jamaica Gleaner, June 2021.'],
  creamy:   ['Creamy & fudge paletas', 'Ice cream and fudge styles, featured in the Gleaner (2021) and the Observer (2022).'],
  spiked:   ['Alcohol-infused paletas', 'These contain alcohol. Featured in the Gleaner (2021); the Observer (2022) called them “Poptails”.'],
  soft:     ['Soft serve', 'Soft serve in a cup, ready for drizzles and toppings.'],
  toppings: ['Dips & toppings', 'Toppings featured in the Gleaner (2021). Chocolate dip appears in the Observer (2022).'],
};
// c: pop colours (top, bottom). Optional look: t 'cream' | 'ice', x 'chunk' (fruit bits, k = their colour), speck (cookie crumb colour), dip (chocolate shell), l (layer line, 0-1).
const FLAVOURS = [
  { n: 'Pine & ginger', g: 'fruit', c: ['#F6DE8A', '#E8BD58'], x: 'chunk', k: '#E2A92E', d: 'Sweet pine with a warm ginger finish.', s: 'Gleaner 2021', f: 1 },
  { n: 'Watermelon & lemongrass', g: 'fruit', c: ['#F0707F', '#D94C63'], d: 'Juicy watermelon with bright lemongrass.', s: 'Gleaner 2021', f: 1 },
  { n: 'Sorrel', g: 'fruit', c: ['#A8182F', '#6A0A1E'], d: 'The deep-red Jamaican favourite, frozen.', s: 'Gleaner 2021', f: 1 },
  { n: 'Mango passion fruit', g: 'fruit', c: ['#FDB646', '#EE8A26'], x: 'chunk', k: '#E9700F', d: 'Two island fruits on one stick.', s: 'Gleaner 2021', f: 1 },
  { n: 'Soursop', g: 'fruit', c: ['#F3F0E4', '#E2E4D0'], t: 'cream', d: 'Soft, creamy and tropical.', s: 'Gleaner 2021' },
  { n: 'Oreo cookies & cream', g: 'creamy', c: ['#F5F0E7', '#E6DDCE'], speck: '#2B1B14', d: 'Cookies and cream on a stick.', s: 'Gleaner 2021', f: 1 },
  { n: 'Blue Mountain coffee', g: 'creamy', c: ['#CFA780', '#A9774E'], d: 'Jamaica’s famous coffee, as a creamy pop.', s: 'Gleaner 2021', f: 1 },
  { n: 'Strawberry', g: 'creamy', c: ['#F6AFBD', '#E88A9E'], d: 'Creamy strawberry.', s: 'Gleaner 2021' },
  { n: 'Coconut', g: 'creamy', c: ['#FAF6EE', '#ECE4D4'], d: 'Cool, creamy coconut.', s: 'Gleaner 2021' },
  { n: 'Strawberry cookie', g: 'creamy', c: ['#F8BCC8', '#EC97AA'], speck: '#5A3324', d: 'Strawberry with cookie pieces.', s: 'Observer 2022' },
  { n: 'Coconut, chocolate & almonds', g: 'creamy', c: ['#FAF6EE', '#ECE4D4'], dip: 1, d: 'Coconut, dipped in chocolate with almonds.', s: 'Observer 2022' },
  { n: 'Rumsicle (rum punch)', g: 'spiked', c: ['#EE6840', '#C23B25'], a: 1, d: 'Rum punch on a stick.', s: 'Gleaner 2021', f: 1 },
  { n: 'Whiskey sour', g: 'spiked', c: ['#F1CB7C', '#D99D45'], a: 1, d: 'The classic cocktail, frozen.', s: 'Gleaner 2021' },
  { n: 'Piña colada', g: 'spiked', c: ['#FAF1D2', '#F1DE9E'], t: 'cream', x: 'chunk', k: '#EFC24A', a: 1, d: 'Pineapple and coconut, cocktail style.', s: 'Gleaner 2021' },
  { n: 'Scotch bonnet margarita', g: 'spiked', c: ['#D8E79A', '#EE7C3E'], l: .68, a: 1, d: 'A margarita with Scotch bonnet heat.', s: 'Gleaner 2021', f: 1 },
  { n: 'Soft serve', g: 'soft', icon: 'swirl', d: 'Swirled into a cup and finished your way.' },
  { n: 'Bailey’s Delight', g: 'soft', icon: 'swirl', ask: 1, d: 'A soft serve named for Bailey’s.', s: 'Observer 2022' },
  { n: 'Chocolate dip', g: 'toppings', icon: 'dip', d: 'A chocolate coat for your pop.', s: 'Observer 2022' },
  { n: 'Sprinkles', g: 'toppings', icon: 'dots', d: 'Rainbow sprinkles.', s: 'Gleaner 2021' },
  { n: 'Almonds', g: 'toppings', icon: 'dots', d: 'Crunchy almonds.', s: 'Gleaner 2021' },
  { n: 'Coconut flakes', g: 'toppings', icon: 'dots', d: 'Coconut flakes.', s: 'Gleaner 2021' },
  { n: 'Cookie crumbles', g: 'toppings', icon: 'dots', d: 'Crushed cookie.', s: 'Gleaner 2021' },
];
/* ==================================================================================== */

const R = document.documentElement;
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- opening intro ----------
const op = document.getElementById('opener');
if (op && R.classList.contains('opener-on')) {
  const v = op.querySelector('video'); let stage = 0;
  const reveal = () => {
    if (stage === 2) return; stage = 2;
    try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {}
    op.classList.add('is-out'); R.classList.remove('opener-on');
    setTimeout(() => { v.pause(); op.remove(); }, 1100);
  };
  const logo = () => { if (stage) return; stage = 1; op.classList.add('is-logo'); setTimeout(reveal, 1250); };
  const started = () => { op.classList.add('is-playing'); v.classList.add('is-playing'); };
  if (!v.paused && v.readyState > 2) started(); else v.addEventListener('playing', started, { once: true });
  v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime > v.duration - .45) logo(); });
  v.addEventListener('ended', logo);
  v.addEventListener('error', logo, true);
  setTimeout(() => { if (!op.classList.contains('is-playing')) logo(); }, 2200);
  setTimeout(logo, Math.max(0, 6500 - performance.now()));
  op.querySelector('[data-opener-skip]').addEventListener('click', reveal);
  addEventListener('keydown', e => { if (e.key === 'Escape' && stage < 2) reveal(); });
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- illustrated paletas ----------
const ICONS = {
  swirl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13h12l-1.6 8H7.6z"/><path d="M7 13c-1-2 1-3.5 3-3.5-1-2 1-4 2-6.5 1 2.5 3 4.5 2 6.5 2 0 4 1.5 3 3.5"/></svg>',
  dip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9a5 5 0 0 1 10 0v7H7z"/><path d="M7 11c2 1.5 3 0 5 1.5s3 0 5-1"/><path d="M11 16v5h2v-5"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="6" width="6" height="2.4" rx="1.2" transform="rotate(-20 7 7)"/><rect x="13" y="4" width="6" height="2.4" rx="1.2" transform="rotate(25 16 5)"/><rect x="9" y="12" width="6" height="2.4" rx="1.2" transform="rotate(-35 12 13)"/><rect x="15" y="15" width="6" height="2.4" rx="1.2" transform="rotate(15 18 16)"/><rect x="3" y="16" width="6" height="2.4" rx="1.2" transform="rotate(40 6 17)"/></svg>',
};
// Each pop is drawn as a frozen paleta: the shop's mould shape with its two grooves, frost, bits of fruit or cookie,
// soft light from the top left and a wooden stick. Shapes and textures are shared; colours come from FLAVOURS.
const POP_BODY = 'M10 140 L8 42 C8 18 23 5 50 5 C77 5 92 18 92 42 L90 140 Q90 152 78 152 L22 152 Q10 152 10 140 Z';
const POP_DEFS = `<svg class="pop-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <clipPath id="pp-clip"><path d="${POP_BODY}"/></clipPath>
  <linearGradient id="pp-shade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".16" stop-color="#fff" stop-opacity=".1"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".04"/><stop offset=".9" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
  <linearGradient id="pp-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
  <radialGradient id="pp-dome" cx=".3" cy=".06" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="pp-glow" cx=".45" cy=".42" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="pp-groove" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".16" stop-color="#000" stop-opacity=".14"/><stop offset=".5" stop-color="#000" stop-opacity=".02"/><stop offset=".78" stop-color="#fff" stop-opacity=".1"/><stop offset=".94" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient>
  <linearGradient id="pp-wood" x1="0" x2="1"><stop offset="0" stop-color="#EDD6B2"/><stop offset=".45" stop-color="#DDBB8E"/><stop offset="1" stop-color="#C39566"/></linearGradient>
  <linearGradient id="pp-neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2210" stop-opacity=".55"/><stop offset="1" stop-color="#3a2210" stop-opacity="0"/></linearGradient>
  <linearGradient id="pp-choc" x1="0" x2="1"><stop offset="0" stop-color="#6B3A22"/><stop offset=".5" stop-color="#4A2516"/><stop offset="1" stop-color="#2E160C"/></linearGradient>
  <filter id="pp-frost" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 6 -3.3"/><feGaussianBlur stdDeviation=".28"/></filter>
  <filter id="pp-crystal" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="4"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 22 -14.6"/><feGaussianBlur stdDeviation=".2"/></filter>
  <filter id="pp-haze" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".035 .02" numOctaves="4" seed="2"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.5 -.55"/></filter>
  <filter id="pp-mottle" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".09 .03" numOctaves="3" seed="11"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 1.25"/></filter>
  <filter id="pp-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".8"/></filter>
  <filter id="pp-edge" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="pp-crisp" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".45"/></filter>
</defs></svg>`;
if ($('[data-pops], [data-fan], #catalog')) document.body.insertAdjacentHTML('afterbegin', POP_DEFS);
let popN = 0;
const seeded = str => { let h = 1779033703; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); return () => { h = Math.imul(h ^ h >>> 15, h | 1); h ^= h + Math.imul(h ^ h >>> 7, h | 61); return ((h ^ h >>> 14) >>> 0) / 4294967296; }; };
const f1 = n => n.toFixed(1);
const blob = (r, cx, cy, size, pts, sharp) => { // an irregular piece: angular for cookie, rounded for fruit
  const p = Array.from({ length: pts }, (_, i) => { const a = (i / pts) * Math.PI * 2 + r() * .5, k = size * (.55 + r() * .6); return [cx + Math.cos(a) * k, cy + Math.sin(a) * k * (.7 + r() * .5)]; });
  if (sharp) return 'M' + p.map(q => q.map(f1).join(' ')).join('L') + 'Z';
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = 'M' + m(p[pts - 1], p[0]).map(f1).join(' ');
  p.forEach((q, i) => { const n = m(q, p[(i + 1) % pts]); d += `Q${f1(q[0])} ${f1(q[1])} ${f1(n[0])} ${f1(n[1])}`; });
  return d + 'Z';
};
const pop = f => {
  const id = 'pp' + (++popN), r = seeded(f.n), cream = f.t === 'cream' || (f.g === 'creamy' && f.t !== 'ice');
  const [c1, c2] = f.c, stops = `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${f.l ? c1 : c2}"/>`;
  let bits = '';
  if (f.l) { // a second layer poured in the mould first, with a slightly uneven line
    let y = f.l * 152, d = `M0 160V${f1(y)}`; for (let x = 0; x < 100; x += 20) d += `Q${x + 10} ${f1(y + (r() - .5) * 7)} ${x + 20} ${f1(y + (r() - .5) * 3)}`;
    bits += `<path d="${d}V160Z" fill="${c2}" filter="url(#pp-crisp)"/>`;
  }
  if (f.speck) { // cookie crumbs: a few chunks, many fine crumbs, some sitting deeper in the cream
    bits += `<rect x="-${(r() * 60) | 0}" y="0" width="200" height="260" filter="url(#pp-mottle)" opacity=".09"/>`;
    let deep = '', top = '';
    for (let i = 0; i < 90; i++) {
      const big = i < 12, s = big ? 1.8 + r() * 2.6 : .55 + r() * 1.3, d = `<path d="${blob(r, 9 + r() * 82, 7 + r() * 142, s, 5 + (r() * 3 | 0), 1)}" opacity="${f1(big ? .7 + r() * .3 : .3 + r() * .6)}"/>`;
      if (r() < .4) deep += d; else top += d;
    }
    bits += `<g fill="${f.speck}" filter="url(#pp-crisp)" opacity=".55">${deep}</g><g fill="${f.speck}">${top}</g>`;
  }
  if (f.x === 'chunk') { // pieces of fruit frozen in: deeper colour, soft edges, light catching the top of each
    let g = '', hi = '';
    for (let i = 0; i < 16; i++) { const x = 14 + r() * 72, y = 12 + r() * 132, k = 2.4 + r() * 4.2;
      g += `<path d="${blob(r, x, y, k, 7, 0)}" opacity="${f1(.35 + r() * .45)}"/>`; hi += `<path d="M${f1(x - k * .5)} ${f1(y - k * .35)}q${f1(k * .5)} ${f1(-k * .45)} ${f1(k)} 0" />`; }
    bits += `<g fill="${f.k || c2}" filter="url(#pp-soft)">${g}</g><g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".8" stroke-linecap="round" filter="url(#pp-crisp)">${hi}</g>`;
  }
  if (f.dip) { // chocolate shell over the top half, with almond pieces
    let y = 70 + r() * 4, d = `M0 0H100V${f1(y)}`; for (let x = 100; x > 0; x -= 12.5) { const yy = 66 + r() * 10; d += `Q${f1(x - 6)} ${f1(yy + 7 + r() * 5)} ${f1(x - 12.5)} ${f1(yy)}`; }
    let nuts = ''; for (let i = 0; i < 9; i++) nuts += `<ellipse cx="${f1(16 + r() * 68)}" cy="${f1(12 + r() * 50)}" rx="${f1(2.6 + r() * 1.6)}" ry="${f1(1.2 + r() * .8)}" transform="rotate(${(r() * 180) | 0} 50 40)" fill="#E9CFA4" opacity=".9"/>`;
    bits += `<path d="${d}V0Z" fill="url(#pp-choc)"/><path d="M14 30C16 18 26 11 36 9" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" fill="none" filter="url(#pp-soft)"/>${nuts}`;
  }
  const ox = (r() * 60) | 0, oy = (r() * 60) | 0, grain = [0, 1, 2].map(() => { const x = 44 + r() * 12; return `<path d="M${f1(x)} 152C${f1(x + 1.5 - r() * 3)} 166 ${f1(x - 1.5 + r() * 3)} 178 ${f1(x + .5)} 192"/>`; }).join('');
  return `<span class="pop" aria-hidden="true"><svg viewBox="0 0 100 200" focusable="false">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>
  <path d="M41 146H59V187A9 9 0 0 1 41 187Z" fill="url(#pp-wood)"/><g fill="none" stroke="#9C7042" stroke-opacity=".28" stroke-width=".6">${grain}</g><rect x="41" y="150" width="18" height="16" fill="url(#pp-neck)"/>
  <g clip-path="url(#pp-clip)">
    <rect width="100" height="160" fill="url(#${id})"/>
    ${cream ? '' : `<rect x="-${ox}" y="-${oy}" width="200" height="260" filter="url(#pp-mottle)" opacity=".1" transform="translate(${ox} ${oy})"/><rect width="100" height="160" fill="url(#pp-glow)"/>`}
    ${bits}
    <g filter="url(#pp-crisp)"><rect x="23" y="22" width="14" height="116" rx="7" fill="url(#pp-groove)"/><rect x="63" y="22" width="14" height="116" rx="7" fill="url(#pp-groove)"/>
</g><g filter="url(#pp-soft)" stroke-linecap="round"><path d="M25 31V129M65 31V129" stroke="#000" stroke-opacity=".1" stroke-width="1.6"/><path d="M35.6 31V129M75.6 31V129" stroke="#fff" stroke-opacity=".26" stroke-width="1.4"/></g>
    <rect width="100" height="160" fill="url(#pp-shade)"/><rect width="100" height="160" fill="url(#pp-depth)"/><rect width="100" height="70" fill="url(#pp-dome)"/>
    <rect x="-${ox}" y="-${oy}" width="200" height="260" filter="url(#pp-haze)" opacity="${cream ? .3 : .24}" transform="translate(${ox} ${oy})"/>
    <rect x="-${oy}" y="-${ox}" width="200" height="260" filter="url(#pp-frost)" opacity="${cream ? .38 : .3}" transform="translate(${oy} ${ox})"/>
    <rect x="-${ox}" y="-${ox}" width="200" height="260" filter="url(#pp-crystal)" opacity=".5" transform="translate(${ox} ${ox})"/>
    <path d="${POP_BODY}" fill="none" stroke="#fff" stroke-opacity="${cream ? .55 : .42}" stroke-width="7" filter="url(#pp-edge)"/>
  </g></svg></span>`;
};
const alcoholBadge = f => f.a ? '<span class="badge">Contains alcohol</span>' : f.ask ? '<span class="badge badge--ask">Ask about alcohol</span>' : '';

$$('[data-pops="featured"]').forEach(el => {
  el.innerHTML = FLAVOURS.filter(f => f.f).map((f, i) => `<li class="pops__item" data-reveal style="--delay:${(i % 4) * .07}s">${pop(f)}
    <span class="pops__name">${esc(f.n)}</span>${alcoholBadge(f)}</li>`).join('');
});
$$('[data-fan]').forEach(el => {
  el.innerHTML = FLAVOURS.filter(f => f.g === el.dataset.fan && f.c).slice(0, 3).map(pop).join('');
});

// ---------- flavours catalog: search + chips ----------
const cat = $('#catalog');
if (cat) {
  const list = $('[data-menu]', cat), input = $('#flavour-search'), status = $('#catalog-status'), empty = $('[data-empty]', cat);
  list.innerHTML = Object.entries(GROUPS).map(([k, [title, note]]) => `<section class="mgroup" data-group="${k}" aria-labelledby="g-${k}">
    <div class="mgroup__head"><h2 id="g-${k}">${esc(title)}</h2><p>${esc(note)}</p></div>
    <ul class="menu">${FLAVOURS.filter(f => f.g === k).map(f => `<li class="mitem" data-name="${esc((f.n + ' ' + f.d + ' ' + title).toLowerCase())}">
      ${f.c ? pop(f) : `<span class="mitem__icon" aria-hidden="true">${ICONS[f.icon]}</span>`}
      <div><div class="mitem__row"><h3 class="mitem__name">${esc(f.n)}</h3><span class="mitem__lead" aria-hidden="true"></span>${f.s ? `<span class="mitem__src">${esc(f.s)}</span>` : ''}</div>
      <p class="mitem__desc">${esc(f.d)}</p>${f.a || f.ask ? `<div class="mitem__tags">${alcoholBadge(f)}</div>` : ''}</div></li>`).join('')}</ul></section>`).join('');
  let filter = 'all';
  const run = () => {
    const q = input.value.trim().toLowerCase(); let n = 0;
    $$('.mgroup', list).forEach(g => {
      const on = filter === 'all' || g.dataset.group === filter; let shown = 0;
      $$('.mitem', g).forEach(it => {
        const hit = on && (!q || it.dataset.name.includes(q)); it.hidden = !hit; if (!hit) return;
        it.style.setProperty('--i', n + shown++); it.classList.remove('pop-in'); void it.offsetWidth; it.classList.add('pop-in'); // replay the glide-in
      });
      g.hidden = !shown; n += shown;
    });
    status.textContent = `${n} ${n === 1 ? 'item' : 'items'} shown`;
    empty.hidden = n > 0;
  };
  input.addEventListener('input', run);
  $$('[data-filter]', cat).forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter; $$('[data-filter]', cat).forEach(x => x.setAttribute('aria-pressed', String(x === b))); run();
  }));
  $('[data-reset]', cat).addEventListener('click', () => { input.value = ''; $('[data-filter="all"]', cat).click(); input.focus(); });
  run();
}

// ---------- business details: phone, email, hours ----------
const tel = p => '+' + (p.replace(/\D/g, '').length === 10 ? '1' : '') + p.replace(/\D/g, '');
$$('[data-biz="phone"]').forEach(el => { if (BIZ.phone) el.innerHTML = `<a href="tel:${tel(BIZ.phone)}">${esc(BIZ.phone)}</a>`; });
$$('[data-biz="email"]').forEach(el => { el.textContent = BIZ.email; });
$$('[data-mailto]').forEach(el => { el.href = 'mailto:' + BIZ.email; });
if (!BIZ.email) $$('[data-biz-row="email"]').forEach(el => el.remove());
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], DAY = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
function nowIn(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: p.weekday.toLowerCase().slice(0, 3), time: `${p.hour.replace('24', '00')}:${p.minute}` };
}
const openNow = (hours, tz) => { const n = nowIn(tz); return (hours[n.day] || []).some(([a, b]) => n.time >= a && n.time < b); };
const fmt = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
$$('[data-hours]').forEach(el => {
  const h = BIZ.hours[el.dataset.hours]; if (!h || !DAYS.some(d => (h[d] || []).length)) return;
  const today = nowIn(BIZ.timezone).day, open = openNow(h, BIZ.timezone);
  el.innerHTML = `<span class="status${open ? '' : ' status--closed'}">${open ? 'Open now' : 'Closed now'}</span>
    <table class="hours"><caption class="sr-only">Opening hours, Jamaica time</caption><tbody>${DAYS.map(d => `<tr${d === today ? ' class="is-today"' : ''}><th scope="row">${DAY[d]}</th>
    <td>${(h[d] || []).length ? h[d].map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(', ') : 'Closed'}</td></tr>`).join('')}</tbody></table>`;
});
if (BIZ.phone && Object.values(BIZ.hours).every(h => DAYS.some(d => (h[d] || []).length))) $$('[data-tbc-note]').forEach(el => el.remove());
$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  const t = $(b.dataset.copy)?.textContent.trim(); if (!t) return;
  try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; }
  catch (e) { const r = document.createRange(); r.selectNodeContents($(b.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Selected'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1800);
}));

// ---------- reveals ----------
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .15 });
$$('[data-reveal], .hero').forEach(el => io.observe(el));

// ---------- videos: hero and in-view loops ----------
$$('video[autoplay]').forEach(v => { if (reduce || saveData) { v.removeAttribute('autoplay'); v.pause(); } });
if (!reduce && !saveData) {
  const vio = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { const p = v.play(); p && p.catch(() => {}); } else v.pause(); }), { threshold: .35 });
  $$('video[data-inview]').forEach(v => vio.observe(v));
}

// ---------- nav, floating button, parallax ----------
// The ChillPops logo (and any Home link) on the home page glides back to the top instead of reloading.
// On the other pages it goes to the home page as usual.
if ($('.hero:not(.hero--page)')) document.addEventListener('click', e => {
  const a = e.target.closest('a.brand, a[href="index.html"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
});

const nav = $('.nav'), fab = $('.fab'), hero = $('.hero');
const onScroll = () => {
  nav.classList.toggle('is-scrolled', scrollY > 80);
  if (fab) fab.classList.toggle('is-visible', scrollY > (hero ? hero.offsetHeight * .8 : 300));
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();
const px = $('[data-parallax]');
if (px && !reduce) {
  let tick = false;
  const move = () => { // image moves at 0.85x scroll speed, clamped to the 12% overscan of its band
    const r = px.parentElement.getBoundingClientRect(), max = r.height * .11;
    const y = Math.max(-max, Math.min(max, (r.top + r.height / 2 - innerHeight / 2) * -0.15));
    px.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`; tick = false;
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(move); } }, { passive: true }); move();
}

// ---------- focus trap for drawer / modal / lightbox ----------
function trap(el) {
  const f = () => $$('a[href],button:not([disabled]),input,video[controls],[tabindex]:not([tabindex="-1"])', el).filter(x => x.offsetParent !== null);
  const h = e => {
    if (e.key !== 'Tab') return; const a = f(), first = a[0], last = a[a.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', h); (f()[0] || el).focus();
  return () => el.removeEventListener('keydown', h);
}
function layer(el, { onOpen, onClose } = {}) {
  let untrap = null, back = null;
  const open = () => { back = document.activeElement; el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); R.classList.add('lock'); onOpen && onOpen(); untrap = trap(el); };
  const close = () => { if (!el.classList.contains('is-open')) return; el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); R.classList.remove('lock'); untrap && untrap(); onClose && onClose(); back && back.focus(); };
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $$('[data-close]', el).forEach(b => b.addEventListener('click', close));
  return { open, close };
}

// drawer
const drawerEl = $('#drawer'), burger = $('.nav__burger');
if (drawerEl) {
  const d = layer(drawerEl, { onOpen: () => burger.setAttribute('aria-expanded', 'true'), onClose: () => burger.setAttribute('aria-expanded', 'false') });
  burger.addEventListener('click', d.open);
  $$('a', drawerEl).forEach(a => a.addEventListener('click', d.close));
}

// action modal (every [data-action] opens it)
const modalEl = $('#action');
if (modalEl) {
  const opts = $('.options', modalEl), ic = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  if (BIZ.whatsapp) opts.insertAdjacentHTML('afterbegin', `<a class="option" style="--ic:#1FA855" href="https://wa.me/${BIZ.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hi ChillPops! ')}" target="_blank" rel="noopener"><span class="option__icon">${ic}<path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z"/></svg></span><span><strong>Chat on WhatsApp</strong><small>Ask what's in the freezer</small></span><span class="arrow" aria-hidden="true">↗</span></a>`);
  if (BIZ.phone) opts.insertAdjacentHTML('afterbegin', `<a class="option" style="--ic:#2EC4C9" href="tel:${tel(BIZ.phone)}"><span class="option__icon">${ic}<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></span><span><strong>Call ChillPops</strong><small>${esc(BIZ.phone)}</small></span><span class="arrow" aria-hidden="true">→</span></a>`);
  const m = layer(modalEl);
  document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) { e.preventDefault(); m.open(); } });
}

// spotlight tabs (ARIA tabs with arrow keys)
$$('[role="tablist"]').forEach(tl => {
  const tabs = $$('[role="tab"]', tl), wrap = tl.closest('[data-tabs]');
  const select = (t, focus) => {
    tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
    wrap.style.setProperty('--tab', getComputedStyle(t).getPropertyValue('--accent')); if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length], true); }
      if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); } if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
    });
  });
  select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
});

// gallery lightbox
const lbEl = $('#lightbox');
if (lbEl) {
  const stage = $('.lightbox__stage', lbEl), cap = $('.lightbox__cap', lbEl), count = $('.lightbox__count', lbEl);
  let items = [], i = 0;
  const show = n => {
    i = (n + items.length) % items.length; const it = items[i].dataset;
    $$('img,video', stage).forEach(x => x.remove());
    stage.insertAdjacentHTML('afterbegin', it.type === 'video'
      ? `<video src="${it.src}" poster="${it.poster || ''}" controls autoplay muted loop playsinline aria-label="${esc(it.cap)}"></video>`
      : `<img src="${it.src}" alt="${esc(it.alt || it.cap)}">`);
    cap.textContent = it.cap; count.textContent = `${i + 1} / ${items.length}`;
  };
  const lb = layer(lbEl, { onClose: () => $$('video', stage).forEach(v => v.pause()) });
  $$('[data-gallery]').forEach(g => $$('[data-lb]', g).forEach((t, k, all) => t.addEventListener('click', () => { items = all; show(k); lb.open(); })));
  $('.lightbox__prev', lbEl).addEventListener('click', () => show(i - 1));
  $('.lightbox__next', lbEl).addEventListener('click', () => show(i + 1));
  lbEl.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
  let x0 = null;
  stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
}
