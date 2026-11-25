/* Sealand Foods International Co. Ltd · main.js (vanilla, no libraries)
   ───────────────────────────────────────────────────────────────────────
   EDIT HERE: catalog, hours and phone numbers (from content/business.json).
   Prices: add e.g. price: "JMD $1,200". Leave "" to hide the price.          */
const DATA = {
  tz: 'America/Jamaica',
  // 24-hour clock. Friday closing reads "7:0…" on the door sign (partly hidden): TODO confirm 7:00 pm.
  hours: { mon: [['08:00', '17:00']], tue: [['08:00', '17:00']], wed: [['08:00', '17:00']], thu: [['08:00', '17:00']],
           fri: [['08:00', '19:00']], sat: [['08:00', '17:00']], sun: [] },
  hoursNote: 'Closed on Sundays & public holidays',
  catalog: [
    { name: 'Red Snapper', desc: 'Whole fish, kept on ice.', price: '', category: 'Seafood', tag: '' },
    { name: 'Fish Fillet', desc: 'Skin-on white fish fillets.', price: '', category: 'Seafood', tag: '' },
    { name: 'Shrimp', desc: 'Fresh from the ocean.', price: '', category: 'Seafood', tag: '' },
    { name: 'Lobster', desc: 'Whole spiny lobster.', price: '', category: 'Seafood', tag: '' },
    { name: 'Lobster Tails', desc: 'Lobster tails, packed.', price: '', category: 'Seafood', tag: '' },
    { name: 'Pork Chops', desc: 'Shoulder chops, cut thick.', price: '', category: 'Pork', tag: '' },
    { name: 'Pork Belly', desc: 'Strips of pork belly.', price: '', category: 'Pork', tag: '' },
    { name: 'Pork Ribs', desc: 'Whole racks and rib cuts.', price: '', category: 'Pork', tag: '' },
    { name: 'Pork Leg', desc: 'Bone-in pork leg.', price: '', category: 'Pork', tag: '' },
    { name: 'Diced Pork', desc: 'Cut and ready for the pot.', price: '', category: 'Pork', tag: '' },
    { name: 'Beef Steak', desc: 'Sliced steaks, fresh from the land.', price: '', category: 'Beef', tag: '' },
    { name: 'Stew Beef', desc: 'Beef cubes for stewing.', price: '', category: 'Beef', tag: '' },
    { name: 'Chicken Wings', desc: 'Whole wings.', price: '', category: 'Chicken', tag: '' },
    { name: 'Chicken Breast', desc: 'Boneless chicken breast.', price: '', category: 'Chicken', tag: '' },
    // Prices from the @sealandfoods Instagram "Sweet Deals" reel. TODO: confirm they're current.
    { name: 'Red Beans (100 lb)', desc: 'Sweet deal on a 100 lb bag.', price: 'JMD $17,000', category: 'Dry Goods', tag: 'Deal' },
    { name: 'Flour (100 lb)', desc: 'Sweet deal on a 100 lb bag.', price: 'JMD $3,900', category: 'Dry Goods', tag: 'Deal' },
    { name: 'Gourmet Items', desc: 'Special gourmet items to elevate your meals.', price: '', category: 'Dry Goods', tag: '' },
    { name: 'Sealand Sub', desc: 'Subs made to order at our deli counter.', price: '', category: 'Deli', tag: '' },
    { name: 'Breakfast Pancakes', desc: 'Pancakes, now served for breakfast.', price: '', category: 'Deli', tag: 'New' },
    { name: 'Hot Dogs', desc: 'Now available at the deli counter.', price: '', category: 'Deli', tag: 'New' },
    { name: 'Chocolate Mocha Cake', desc: 'Rich chocolate with a mocha finish.', price: '', category: 'Desserts', tag: '' },
    { name: 'Red Velvet Cake', desc: 'A classic slice of red velvet.', price: '', category: 'Desserts', tag: '' },
    { name: 'Black Forest Cake', desc: 'Chocolate layers, cream and cherry.', price: '', category: 'Desserts', tag: '' },
    { name: 'Cheesecake', desc: 'Creamy, cool and made for sharing.', price: '', category: 'Desserts', tag: '' },
    { name: 'Christmas Cake', desc: 'Now available for the season.', price: '', category: 'Desserts', tag: 'Seasonal' },
    { name: 'Cold Drinks', desc: 'Sodas, juices and water from the chillers.', price: '', category: 'Drinks', tag: '' }
  ]
};

/* ── 0. opening intro ─────────────────────────────────────────────────── */
const op = document.getElementById('opener'), R = document.documentElement;
if (op && R.classList.contains('opener-on')) {
  const v = op.querySelector('video'); let stage = 0;
  const reveal = () => {
    if (stage === 2) return; stage = 2;
    try { sessionStorage.setItem('opener-seen', '1'); } catch (e) {}
    op.classList.add('is-out'); R.classList.remove('opener-on');
    const hv = document.querySelector('.hero__media video');   // start the walk-in from the storefront as the site appears
    if (hv && hv.querySelector('source')) { try { hv.currentTime = 0; const p = hv.play(); p && p.catch(() => {}); } catch (e) {} }
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

const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── focus trap + scroll lock (drawer, modal, lightbox) ───────────────── */
const FOCUSABLE = 'a[href],button:not([disabled]),input,video[controls],[tabindex]:not([tabindex="-1"])';
function trap(el, first) {
  const h = e => {
    if (e.key !== 'Tab') return;
    const f = $$(FOCUSABLE, el).filter(x => x.offsetParent !== null); if (!f.length) return;
    const a = f[0], b = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
    else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
  };
  el.addEventListener('keydown', h);
  (first || $$(FOCUSABLE, el)[0])?.focus();
  return () => el.removeEventListener('keydown', h);
}
let locks = 0;
const lock = on => { locks = Math.max(0, locks + (on ? 1 : -1)); R.classList.toggle('is-locked', locks > 0); };

/* ── hero video: chosen by the inline script under the <video> (phones get the 9:16 cut; reduced motion / data saver get the poster) ── */

/* ── reveals ──────────────────────────────────────────────────────────── */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}), { threshold: .15 }) : null;
$$('[data-reveal]:not(.hero [data-reveal]), .hero').forEach(el => io ? io.observe(el) : el.classList.add('is-in'));

/* ── nav: solid after 80px, active link, mobile drawer ────────────────── */
const nav = $('.nav'), fab = $('.fab'), hero = $('.hero');
const onScroll = () => {
  nav.classList.toggle('is-scrolled', scrollY > 80);
  fab && fab.classList.toggle('is-shown', scrollY > (hero ? hero.offsetHeight * .8 : 400));
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();
const links = $$('.nav__links a[href^="#"]');
if (io) {
  const so = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(a => { const s = $(a.getAttribute('href')); s && so.observe(s); });
}
const drawer = $('#drawer'), burger = $('.burger');
let untrapDrawer = null;
const setDrawer = open => {
  if (open === drawer.classList.contains('is-open')) return;
  drawer.classList.toggle('is-open', open); burger.setAttribute('aria-expanded', open); drawer.setAttribute('aria-hidden', !open);
  lock(open);
  if (open) untrapDrawer = trap($('.drawer__panel', drawer)); else { untrapDrawer && untrapDrawer(); burger.focus(); }
};
burger.addEventListener('click', () => setDrawer(true));
$$('[data-drawer-close]', drawer).forEach(b => b.addEventListener('click', () => setDrawer(false)));
$$('.drawer__panel nav a', drawer).forEach(a => a.addEventListener('click', () => setDrawer(false)));

/* ── action modal (every [data-action] opens it) ──────────────────────── */
const modal = $('#action'); let modalFrom = null, untrapModal = null;
const setModal = (open, from) => {
  if (open === modal.classList.contains('is-open')) return;
  if (open && drawer.classList.contains('is-open')) setDrawer(false);
  modal.classList.toggle('is-open', open); modal.setAttribute('aria-hidden', !open); lock(open);
  if (open) { modalFrom = from; untrapModal = trap($('.modal__box', modal), $('.opt', modal)); }
  else { untrapModal && untrapModal(); modalFrom && modalFrom.focus(); }
};
$$('[data-action]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); setModal(true, b); }));
$$('[data-modal-close]', modal).forEach(b => b.addEventListener('click', () => setModal(false)));

/* ── parallax promo band ──────────────────────────────────────────────── */
const px = $('[data-parallax]');
if (px && !reduce) {
  let tick = false;
  addEventListener('scroll', () => { if (tick) return; tick = true; requestAnimationFrame(() => {
    const r = px.parentElement.getBoundingClientRect();
    const lim = r.height * .12, y = Math.max(-lim, Math.min(lim, (r.top + r.height / 2 - innerHeight / 2) * -0.15));
    if (r.bottom > 0 && r.top < innerHeight) px.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
    tick = false; }); }, { passive: true });
}

/* ── catalog: search + category chips ─────────────────────────────────── */
const list = $('#menu-list'), q = $('#menu-q'), count = $('#menu-count'), chipsBox = $('#menu-chips');
if (list) {
  const cats = ['All', ...new Set(DATA.catalog.map(i => i.category))];
  chipsBox.innerHTML = cats.map((c, i) => `<button class="chip" type="button" aria-pressed="${i === 0}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  let cat = 'All';
  const render = () => {
    const term = q.value.trim().toLowerCase();
    const items = DATA.catalog.filter(i => (cat === 'All' || i.category === cat) &&
      (!term || (i.name + ' ' + i.desc + ' ' + i.category + ' ' + i.tag).toLowerCase().includes(term)));
    list.innerHTML = items.length ? items.map(i => `<li class="menu__item"><div class="menu__row"><span class="menu__name">${esc(i.name)}</span>` +
      `<span class="menu__dots" aria-hidden="true"></span>${i.price ? `<span class="menu__price">${esc(i.price)}</span>` : `<span class="menu__cat">${esc(i.category)}</span>`}</div>` +
      `<p class="menu__desc">${esc(i.desc)}${i.tag ? ` <span class="tag${/season|deal/i.test(i.tag) ? ' tag--seasonal' : ''}">${esc(i.tag)}</span>` : ''}</p></li>`).join('')
      : `<li class="empty">Nothing matches “${esc(q.value)}”. Try “cake”, “sub” or “seafood”, or call us and ask.</li>`;
    count.textContent = `${items.length} item${items.length === 1 ? '' : 's'}${cat !== 'All' ? ' in ' + cat : ''}${term ? ` matching “${q.value.trim()}”` : ''}`;
  };
  q.addEventListener('input', render);
  chipsBox.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.cat;
    $$('.chip', chipsBox).forEach(c => c.setAttribute('aria-pressed', c === b)); render();
  });
  render();
}

/* ── spotlight tabs (ARIA tabs, arrow keys) ───────────────────────────── */
const tabs = $$('[role="tab"]');
const pick = (t, focus) => {
  tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
    $('#' + x.getAttribute('aria-controls')).hidden = !on; });
  $$('.spot__media picture').forEach(p => p.classList.toggle('is-active', p.dataset.for === t.id));
  focus && t.focus();
};
tabs.forEach((t, i) => {
  t.addEventListener('click', () => pick(t));
  t.addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); pick(tabs[(i + k + tabs.length) % tabs.length], true); }
    if (e.key === 'Home') { e.preventDefault(); pick(tabs[0], true); }
    if (e.key === 'End') { e.preventDefault(); pick(tabs[tabs.length - 1], true); }
  });
});

/* ── gallery lightbox ─────────────────────────────────────────────────── */
const lb = $('#lightbox'), tiles = $$('.tile');
if (lb && tiles.length) {
  const stage = $('.lightbox__media', lb), cap = $('.lightbox__cap', lb), cnt = $('.lightbox__count', lb);
  let idx = 0, from = null, untrapLb = null;
  const show = i => {
    idx = (i + tiles.length) % tiles.length; const t = tiles[idx];
    stage.innerHTML = t.dataset.video
      ? `<video src="${t.dataset.video}" poster="${t.dataset.poster}" controls autoplay muted loop playsinline aria-label="${esc(t.dataset.caption)}"></video>`
      : `<img src="${t.dataset.full}" alt="${esc($('img', t).alt)}">`;
    cap.textContent = t.dataset.caption; cnt.textContent = `${idx + 1} / ${tiles.length}`;
  };
  const open = (i, t) => { from = t; show(i); lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); lock(true); untrapLb = trap(lb, $('.lb-close', lb)); };
  const close = () => { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); stage.innerHTML = ''; lock(false); untrapLb && untrapLb(); from && from.focus(); };
  tiles.forEach((t, i) => t.addEventListener('click', () => open(i, t)));
  $('.lb-close', lb).addEventListener('click', close);
  $('.lb-prev', lb).addEventListener('click', () => show(idx - 1));
  $('.lb-next', lb).addEventListener('click', () => show(idx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  let sx = null;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); sx = null; });
  addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'ArrowRight') show(idx + 1); else if (e.key === 'ArrowLeft') show(idx - 1); else if (e.key === 'Escape') close();
  });
}

/* ── Esc closes drawer / modal ────────────────────────────────────────── */
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (modal.classList.contains('is-open')) setModal(false);
  else if (drawer.classList.contains('is-open')) setDrawer(false);
});

/* ── hours table + open-now badge, in Jamaica time ────────────────────── */
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const fmt = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
function nowParts(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: p.weekday.toLowerCase().slice(0, 3), now: `${p.hour.replace(/^24/, '00')}:${p.minute}` };
}
function openNow(hours, tz) { const { day, now } = nowParts(tz); return (hours[day] || []).some(([a, b]) => now >= a && now < b); }
const today = nowParts(DATA.tz).day;
$$('[data-hours]').forEach(tb => {
  const short = tb.dataset.hours === 'short';
  tb.innerHTML = DAYS.map(([k, n]) => `<tr${k === today ? ' class="is-today"' : ''}><th scope="row">${short ? n.slice(0, 3) : n}${k === today ? ' <span class="sr-only">(today)</span>' : ''}</th>` +
    `<td>${DATA.hours[k].length ? DATA.hours[k].map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(', ') : 'Closed'}</td></tr>`).join('');
});
$$('[data-status]').forEach(s => {
  const o = openNow(DATA.hours, DATA.tz);
  s.classList.add(o ? 'is-open' : 'is-closed'); s.textContent = o ? 'Open now' : 'Closed now';
});
$$('[data-year]').forEach(y => { y.textContent = new Date().getFullYear(); });

/* ── Christmas snow (only while html.xmas is set; never with reduced motion or data saver) ── */
if (R.classList.contains('xmas') && !reduce && !saveData) {
  $$('canvas.snow').forEach(cv => {
    const ctx = cv.getContext('2d'); let flakes = [], on = false, raf = 0, w = 0, h = 0;
    const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      const n = Math.round(Math.min(90, w / 16));
      flakes = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: .8 + Math.random() * 2.2, s: .25 + Math.random() * .7, a: Math.random() * 6.28 })); };
    const draw = () => {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (const f of flakes) {
        f.y += f.s; f.a += .01; f.x += Math.sin(f.a) * .35;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        ctx.globalAlpha = .35 + f.r / 5; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
      raf = on ? requestAnimationFrame(draw) : 0;
    };
    size(); addEventListener('resize', size, { passive: true });
    new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on && !raf) raf = requestAnimationFrame(draw); }).observe(cv);
  });
}
/* coloured, staggered bulbs */
$$('.lights i').forEach((b, i) => { b.style.setProperty('--c', ['#FF4D4D', '#F2C230', '#45D69A', '#6F8BFF'][i % 4]);
  b.style.setProperty('--d', (i % 5) * .35 + 's'); b.style.left = `calc(${(i + .5) / 28 * 100}% - 4px)`; b.style.top = (4 + Math.sin(i / 28 * 6.283 * 7) * 3).toFixed(1) + 'px'; });
