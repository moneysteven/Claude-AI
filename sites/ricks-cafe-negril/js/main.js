/* Rick's Cafe, Negril — concept site. Vanilla JS, no libraries. */

/* ===== EDIT ME: business data (keep in step with content/business.json) ===== */
const SITE = {
  tz: 'America/Jamaica', // Jamaica time, UTC-5 all year (no daylight saving)
  // Published hours: official homepage ("Noon to 10pm Daily") and FAQ ("every day/365 days a year from Noon to 10PM").
  // A third-party guide lists a 9:30 p.m. close; confirm with the owner. Holiday exceptions were not published.
  hours: { mon: [['12:00', '22:00']], tue: [['12:00', '22:00']], wed: [['12:00', '22:00']], thu: [['12:00', '22:00']],
           fri: [['12:00', '22:00']], sat: [['12:00', '22:00']], sun: [['12:00', '22:00']] },
  // Two numbers are published by the business. Neither is "primary" until the owner confirms one.
  phones: [
    { display: '876-957-0380', tel: '+18769570380', label: 'Reservations & cabanas', source: 'Official FAQ & 2026 menu' },
    { display: '876.822.1764', tel: '+18768221764', label: 'General line', source: 'Official homepage footer' }
  ],
  email: 'info@rickscafejamaica.com',
  address: 'West End Road, Negril, Jamaica',
  directions: 'https://www.google.com/maps/search/?api=1&query=Rick%27s+Cafe+West+End+Road+Negril+Jamaica'
};
/* ============================================================================ */

window.RICKS = 1;   // tells the inline intro script that this file loaded
const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
const R = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const ico = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

/* ---------- hero video (sources are added by JS so phones get the 9:16 cut) ---------- */
const hv = $('[data-hero-video]'), vt = $('[data-video-toggle]');
const tall = matchMedia('(max-aspect-ratio: 1/1)').matches;
let heroStarted = false;
function setToggle(playing) {
  if (!vt) return;
  vt.setAttribute('aria-label', playing ? 'Pause background video' : 'Play background video');
  vt.innerHTML = ico(playing ? 'pause' : 'play', 'ico--fill');
}
function loadHero() {
  const base = 'assets/video/hero' + (tall ? '-mobile' : '');
  hv.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
  hv.muted = true; hv.load(); const p = hv.play(); p && p.catch(() => setToggle(false));
}
function startHero() {   // called once the intro is done (or straight away when there is no intro)
  if (!hv || heroStarted) return; heroStarted = true;
  if (reduce || saveData) { hv.removeAttribute('autoplay'); setToggle(false); return; }   // poster only
  loadHero();
}
if (hv) {
  hv.addEventListener('play', () => setToggle(true)); hv.addEventListener('pause', () => setToggle(false));
  vt && vt.addEventListener('click', () => {
    if (!hv.querySelector('source')) { hv.dataset.user = ''; loadHero(); return; }      // reduced motion / data saver: plays only on request
    if (hv.paused) { hv.dataset.user = ''; hv.play().catch(() => {}); } else { hv.dataset.user = 'paused'; hv.pause(); }
  });
  // pause while off-screen so scrolling stays smooth
  new IntersectionObserver(([e]) => { if (!hv.querySelector('source') || hv.dataset.user === 'paused') return; e.isIntersecting ? hv.play().catch(() => {}) : hv.pause(); }).observe(hv);
}

/* ---------- opening intro (plays once per visit) ---------- */
const op = document.getElementById('opener');
if (op && R.classList.contains('opener-on')) {
  const v = op.querySelector('video'); let stage = 0;
  const reveal = () => {
    if (stage === 2) return; stage = 2;
    try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {}
    startHero();
    op.classList.add('is-out'); R.classList.remove('opener-on');
    setTimeout(() => { v.pause(); op.remove(); }, 1100);
  };
  const logo = () => { if (stage) return; stage = 1; op.classList.add('is-logo'); startHero(); setTimeout(reveal, 1250); };
  const started = () => { op.classList.add('is-playing'); v.classList.add('is-playing'); };
  if (!v.paused && v.readyState > 2) started(); else v.addEventListener('playing', started, { once: true });
  v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime > v.duration - .45) logo(); });
  v.addEventListener('ended', logo);
  v.addEventListener('error', logo, true);
  setTimeout(() => { if (!op.classList.contains('is-playing')) logo(); }, 2200);
  setTimeout(logo, Math.max(0, 6500 - performance.now()));
  op.querySelector('[data-opener-skip]').addEventListener('click', reveal);
  addEventListener('keydown', e => { if (e.key === 'Escape' && stage < 2) reveal(); });
} else { op && op.remove(); startHero(); }

/* ---------- reveals ---------- */
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal], .hero, .page-hero, [data-lines]').forEach(el => io.observe(el));
} else $$('[data-reveal], .hero, .page-hero, [data-lines]').forEach(el => el.classList.add('is-in'));

/* ---------- layers: drawer, modal, lightbox (shared focus trap) ---------- */
let layer = null, lastFocus = null;
const focusables = el => $$('a[href],button:not([disabled]),input,select,textarea,iframe,[tabindex]:not([tabindex="-1"])', el).filter(x => x.getClientRects().length);
function openLayer(el, onClose) {
  if (layer) closeLayer(true);
  lastFocus = document.activeElement; layer = { el, onClose };
  el.classList.add('is-open'); R.classList.add('is-locked');
  setTimeout(() => { const f = focusables(el); (f[1] || f[0])?.focus(); }, 80);
}
function closeLayer(silent) {
  if (!layer) return; const { el, onClose } = layer; layer = null;
  el.classList.remove('is-open'); R.classList.remove('is-locked'); onClose && onClose();
  if (!silent && lastFocus) lastFocus.focus();
}
document.addEventListener('keydown', e => {
  if (!layer) return;
  if (e.key === 'Escape') { e.preventDefault(); closeLayer(); return; }
  if (e.key !== 'Tab') return;
  const f = focusables(layer.el); if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* drawer */
const drawer = $('#drawer'), burger = $('[data-burger]');
if (drawer && burger) {
  burger.addEventListener('click', () => { burger.setAttribute('aria-expanded', 'true'); openLayer(drawer, () => burger.setAttribute('aria-expanded', 'false')); });
  $$('[data-close], .drawer__backdrop, .drawer__links a', drawer).forEach(b => b.addEventListener('click', () => closeLayer()));
}

/* action modal — built from SITE so every page shows the same options */
const modal = $('#action');
if (modal) {
  const opts = $('.opts', modal);
  const row = (href, icon, title, sub, ext) => `<li><a class="opt" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="opt__ico">${ico(icon)}</span><span><b>${title}</b><small>${sub}</small></span><span class="arrow" aria-hidden="true">→</span></a></li>`;
  opts.innerHTML = row(SITE.directions, 'pin', 'Get directions', 'Opens Google Maps (new tab)', true) +
    SITE.phones.map(p => row(`tel:${p.tel}`, 'phone', `Call ${p.display}`, `${p.label} · ${p.source}`)).join('') +
    row(`mailto:${SITE.email}?subject=${encodeURIComponent("Question for Rick's Cafe")}`, 'mail', 'Email ' + SITE.email, 'General & group inquiries') +
    row('menu.html', 'menu', 'See the 2026 menu', 'Food & drinks in USD') +
    row('groups.html#inquire', 'users', 'Groups, weddings & cabanas', 'Inquiry details and published cabana rates');
  $$('[data-action]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openLayer(modal); }));
  $$('[data-close], .modal__backdrop', modal).forEach(b => b.addEventListener('click', () => closeLayer()));
}

/* ---------- scroll: nav, FAB, parallax, timeline ---------- */
const head = $('.site-head'), fab = $('.fab'), px = $$('[data-parallax]'), tl = $('.timeline');
let ticking = false;
function onScroll() {
  ticking = false; const y = scrollY, vh = innerHeight;
  head && head.classList.toggle('is-scrolled', y > 80);
  fab && fab.classList.toggle('is-visible', y > vh * .75);
  if (!reduce) px.forEach(el => { const r = el.parentElement.getBoundingClientRect(); if (r.bottom > 0 && r.top < vh) el.style.transform = `translate3d(0,${(r.top * -0.15).toFixed(1)}px,0)`; });
  if (tl) { const r = tl.getBoundingClientRect(); tl.style.setProperty('--p', Math.min(1, Math.max(0, (vh * .62 - r.top) / r.height)).toFixed(3)); }
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

/* ---------- hours + open-now, in Jamaica time ---------- */
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
function jmNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: SITE.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: p.weekday.toLowerCase().slice(0, 3), now: `${p.hour.replace('24', '00')}:${p.minute}` };
}
const t12 = t => { let [h, m] = t.split(':').map(Number); if (h === 12 && !m) return 'Noon'; if (h === 0 && !m) return 'Midnight';
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}`; };
const span = d => (SITE.hours[d] || []).map(([a, b]) => `${t12(a)} – ${t12(b)}`).join(', ') || 'Closed';
const { day, now } = jmNow();
const isOpen = (SITE.hours[day] || []).some(([a, b]) => now >= a && now < b);
$$('[data-hours]').forEach(t => {
  t.innerHTML = `<caption class="sr-only">Published opening hours, Jamaica time</caption><tbody>${DAYS.map(([k, n]) =>
    `<tr${k === day ? ' class="is-today"' : ''}><th scope="row">${n}</th><td>${span(k)}</td></tr>`).join('')}</tbody>`;
});
$$('[data-open]').forEach(el => {
  el.classList.add(isOpen ? 'is-open' : 'is-closed');
  const txt = $('[data-open-text]', el) || el;
  txt.textContent = isOpen ? `Open now · until ${t12(SITE.hours[day][0][1])}` : `Closed now · daily from ${t12((SITE.hours[day] || [['12:00']])[0][0]).toLowerCase()}`;
  el.title = 'Based on the published hours, in Jamaica time. Please confirm before you travel.';
});

/* ---------- spotlight tabs (ARIA tabs + arrow keys) ---------- */
$$('[data-tabs]').forEach(box => {
  const tabs = $$('[role="tab"]', box), imgs = $$('.spot__media img', box);
  const select = (i, focus) => tabs.forEach((t, k) => {
    const on = k === i, panel = document.getElementById(t.getAttribute('aria-controls'));
    t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panel.hidden = !on;
    if (on) { panel.classList.remove('is-swap'); void panel.offsetWidth; panel.classList.add('is-swap'); box.style.setProperty('--c', t.dataset.c); focus && t.focus(); }
    imgs[k] && imgs[k].classList.toggle('is-active', on);
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', e => {
      const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return; e.preventDefault(); select((n + tabs.length) % tabs.length, true);
    });
  });
  box.style.setProperty('--c', tabs[0].dataset.c);
});

/* ---------- gallery: filters + lightbox (keys, swipe, focus return) ---------- */
const gal = $('[data-gallery]');
if (gal) {
  const lb = document.createElement('div');
  lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photo viewer');
  lb.innerHTML = `<div class="lightbox__top"><span class="lightbox__count" aria-live="polite"></span><button class="lb-btn" type="button" data-lb="close" aria-label="Close photo viewer">${ico('x')}</button></div>
    <div class="lightbox__stage"><img alt=""><button class="lb-btn lb-prev" type="button" data-lb="prev" aria-label="Previous photo">${ico('left')}</button><button class="lb-btn lb-next" type="button" data-lb="next" aria-label="Next photo">${ico('right')}</button></div>
    <p class="lightbox__cap"></p>`;
  document.body.appendChild(lb);
  const img = $('img', lb), cap = $('.lightbox__cap', lb), cnt = $('.lightbox__count', lb);
  let list = [], idx = 0;
  const show = i => { idx = (i + list.length) % list.length; const b = list[idx], t = $('img', b);
    img.src = b.dataset.full; img.alt = t.alt; img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    cap.innerHTML = b.closest('figure').querySelector('figcaption')?.innerHTML || ''; cnt.textContent = `${idx + 1} / ${list.length}`; };
  gal.addEventListener('click', e => { const b = e.target.closest('button[data-full]'); if (!b) return;
    list = $$('button[data-full]', gal).filter(x => !x.closest('[hidden]')); show(list.indexOf(b)); openLayer(lb); });
  lb.addEventListener('click', e => { const a = e.target.closest('[data-lb]')?.dataset.lb; if (a === 'close' || e.target === lb || e.target.classList.contains('lightbox__stage')) closeLayer(); else if (a) show(idx + (a === 'next' ? 1 : -1)); });
  addEventListener('keydown', e => { if (layer?.el !== lb) return; if (e.key === 'ArrowRight') show(idx + 1); if (e.key === 'ArrowLeft') show(idx - 1); });
  let sx = 0; lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); });
  const fl = $('[data-filters]');
  fl && fl.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return;
    $$('.chip', fl).forEach(x => x.setAttribute('aria-pressed', x === c)); const f = c.dataset.filter;
    $$('.tile', gal).forEach(t => { t.hidden = f !== 'all' && !t.dataset.cat.split(' ').includes(f); });
    $('[data-gal-count]').textContent = `${$$('.tile:not([hidden])', gal).length} photos`; });
}

/* ---------- menu: render from js/menu-data.js, live search + category chips ---------- */
const mroot = $('#menu-root');
if (mroot && window.MENU) {
  const TAG = { chef: ['tag--chef', 'Chef specialty'], spicy: ['tag--spicy', 'Spicy mon'], season: ['tag--season', 'Jul 1 – Mar 31 only'], super: ['tag--super', 'Supersize'], special: ['tag--note', "Rick's anniversary special"] };
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  mroot.innerHTML = MENU.map(g => `<section class="menu-group" id="m-${g.id}" data-group="${g.id}" aria-labelledby="h-${g.id}">
    <div class="menu-group__head"><h2 id="h-${g.id}">${g.title}</h2>${g.note ? `<p>${g.note}</p>` : ''}</div>
    <div class="items">${g.items.map(it => `<article class="item" data-q="${esc((it.n + ' ' + (it.d || '') + ' ' + g.title).toLowerCase())}">
      <div class="item__head"><h3 class="item__name">${esc(it.n)}${it.star ? '<span aria-label=" (asterisk: see gluten note)">*</span>' : ''}</h3><span class="item__lead" aria-hidden="true"></span>${it.p ? `<span class="item__price">${it.p}</span>` : ''}</div>
      ${it.d ? `<p class="item__desc">${it.d}</p>` : ''}${(it.t || []).length ? `<div class="item__tags">${it.t.map(k => `<span class="tag ${TAG[k][0]}">${TAG[k][1]}</span>`).join('')}</div>` : ''}
    </article>`).join('')}${g.after ? `<p class="group-note">${g.after}</p>` : ''}</div></section>`).join('') +
    '<p class="menu-empty" hidden>Nothing on the 2026 menu matches that. Try “jerk”, “rum” or “shrimp”.</p>';
  const q = $('#menu-q'), chips = $('[data-menu-chips]'), count = $('[data-menu-count]'), empty = $('.menu-empty', mroot);
  chips.innerHTML = `<button class="chip" type="button" aria-pressed="true" data-g="all">All</button>` + MENU.map(g => `<button class="chip" type="button" aria-pressed="false" data-g="${g.id}">${g.chip || g.title}</button>`).join('');
  let cat = 'all';
  const apply = () => {
    const term = q.value.trim().toLowerCase(); let n = 0;
    $$('.menu-group', mroot).forEach(s => { let k = 0;
      $$('.item', s).forEach(it => { const ok = (cat === 'all' || s.dataset.group === cat) && (!term || it.dataset.q.includes(term)); it.hidden = !ok; ok && k++; });
      s.hidden = !k; n += k; });
    empty.hidden = !!n; count.textContent = `${n} item${n === 1 ? '' : 's'}${term ? ` matching “${q.value.trim()}”` : ''}`;
  };
  q.addEventListener('input', apply);
  chips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; cat = c.dataset.g;
    $$('.chip', chips).forEach(x => x.setAttribute('aria-pressed', x === c)); apply();
    const top = mroot.getBoundingClientRect().top + scrollY - 140; if (scrollY > top) scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' }); });
  apply();
  if (location.hash.startsWith('#m-')) { const t = document.getElementById(location.hash.slice(1)); t && setTimeout(() => t.scrollIntoView({ behavior: 'instant' }), 60); }
}

/* ---------- official film: load the YouTube player only when asked ---------- */
$$('[data-yt]').forEach(b => b.addEventListener('click', () => {
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  f.title = b.dataset.title || 'Video'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
  b.replaceWith(f); f.focus();
}));

/* ---------- group inquiry form: a non-sending draft ---------- */
$$('form[data-draft]').forEach(f => f.addEventListener('submit', e => {
  e.preventDefault(); if (!f.reportValidity()) return;
  const d = Object.fromEntries(new FormData(f)), msg = $('.form__msg', f);
  const body = Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  msg.innerHTML = `<div class="note" role="status">${ico('info')}<div><b>This form isn't connected yet</b> (concept preview), so nothing was sent and no details were stored.
    To reach Rick's now, <a href="mailto:${SITE.email}?subject=${encodeURIComponent('Group inquiry')}&body=${encodeURIComponent(body)}">email your details to ${SITE.email}</a> or call ${SITE.phones[0].display}.</div></div>`;
  msg.querySelector('a').focus();
}));

/* ---------- in-page links: draw every section first, so the smooth scroll lands exactly ---------- */
let cvT;
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a || a.hasAttribute('data-action')) return;
  const t = a.getAttribute('href').length > 1 && document.getElementById(a.getAttribute('href').slice(1)); if (!t) return;
  e.preventDefault(); R.classList.add('cv-off'); t.getBoundingClientRect();
  t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  if (t.id === 'main') t.focus({ preventScroll: true });
  try { history.replaceState(null, '', '#' + t.id); } catch (err) {}
  clearTimeout(cvT); cvT = setTimeout(() => R.classList.remove('cv-off'), 1600);
});

/* ---------- small touches ---------- */
if (matchMedia('(hover:hover)').matches && !reduce) $$('.card').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
}));
$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
