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
const FLAVOURS = [
  { n: 'Pine & ginger', g: 'fruit', c: ['#FFE066', '#F2A93B'], d: 'Sweet pine with a warm ginger finish.', s: 'Gleaner 2021', f: 1 },
  { n: 'Watermelon & lemongrass', g: 'fruit', c: ['#FF5E78', '#E83A5F'], d: 'Juicy watermelon with bright lemongrass.', s: 'Gleaner 2021', f: 1 },
  { n: 'Sorrel', g: 'fruit', c: ['#C2183F', '#7E0B2D'], d: 'The deep-red Jamaican favourite, frozen.', s: 'Gleaner 2021', f: 1 },
  { n: 'Mango passion fruit', g: 'fruit', c: ['#FFC12E', '#FF7A1A'], d: 'Two island fruits on one stick.', s: 'Gleaner 2021', f: 1 },
  { n: 'Soursop', g: 'fruit', c: ['#F6F3E4', '#DDE8C6'], d: 'Soft, creamy and tropical.', s: 'Gleaner 2021' },
  { n: 'Oreo cookies & cream', g: 'creamy', c: ['#FBF7F0', '#EDE5D8'], speck: '#2B1B14', d: 'Cookies and cream on a stick.', s: 'Gleaner 2021', f: 1 },
  { n: 'Blue Mountain coffee', g: 'creamy', c: ['#C69A70', '#8C5B3C'], d: 'Jamaica’s famous coffee, as a creamy pop.', s: 'Gleaner 2021', f: 1 },
  { n: 'Strawberry', g: 'creamy', c: ['#FFA3BE', '#F2577F'], d: 'Creamy strawberry.', s: 'Gleaner 2021' },
  { n: 'Coconut', g: 'creamy', c: ['#FFFDF7', '#EEE6D6'], d: 'Cool, creamy coconut.', s: 'Gleaner 2021' },
  { n: 'Strawberry cookie', g: 'creamy', c: ['#FFC0D0', '#F58BA8'], speck: '#5A3324', d: 'Strawberry with cookie pieces.', s: 'Observer 2022' },
  { n: 'Coconut, chocolate & almonds', g: 'creamy', c: ['#FFFDF7', '#EEE6D6'], dip: '#4A2516', d: 'Coconut, dipped in chocolate with almonds.', s: 'Observer 2022' },
  { n: 'Rumsicle (rum punch)', g: 'spiked', c: ['#FF6A3D', '#C2321F'], a: 1, d: 'Rum punch on a stick.', s: 'Gleaner 2021', f: 1 },
  { n: 'Whiskey sour', g: 'spiked', c: ['#FFD27A', '#E09A2B'], a: 1, d: 'The classic cocktail, frozen.', s: 'Gleaner 2021' },
  { n: 'Piña colada', g: 'spiked', c: ['#FFF4C2', '#FFE07A'], a: 1, d: 'Pineapple and coconut, cocktail style.', s: 'Gleaner 2021' },
  { n: 'Scotch bonnet margarita', g: 'spiked', c: ['#D4EE6E', '#FF6A2A'], a: 1, d: 'A margarita with Scotch bonnet heat.', s: 'Gleaner 2021', f: 1 },
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
const pop = f => `<span class="pop" aria-hidden="true" style="--c1:${f.c[0]};--c2:${f.c[1]}${f.dip ? `;--dip:${f.dip};--dip-at:46%` : ''}${f.speck ? `;--speck:${f.speck}` : ''}"><span class="pop__body"></span><span class="pop__stick"></span></span>`;
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
      $$('.mitem', g).forEach(it => { const hit = on && (!q || it.dataset.name.includes(q)); it.hidden = !hit; if (hit) shown++; });
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
