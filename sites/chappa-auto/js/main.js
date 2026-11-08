/* Chappa Auto | main.js (vanilla, no libraries)
   ===== DATA: branches, hours and catalog (from content/business.json) =====
   Confirmed hours: replace `hours: null` with { mon:[["08:30","17:00"]], ..., sun:[] }
   (24 h, Jamaica time) and the hours table + "Open now" badge switch on. */
const SITE = { "tz":"America/Jamaica", "email":"chappasales@gmail.com", "wholesale":{ "subject":"Wholesaler Request", "body":"Hi Team,\n\nI'd like to apply to become a wholesaler. Here are my details:\n• Name:\n• Company:\n• Phone Number:\n• Additional Information:" }, "branches":[
 { "id":"savanna-la-mar", "label":"Savanna La Mar", "kind":"Retail Only", "printed":[ "Tanker Plaza", "Tanker Plaza", "60 Beckford Street,", "Savanna La Mar", "Westmoreland, Jamaica" ], "whatsapp":[ "876-790-9076" ], "landline":[ "876-918-2537" ], "hoursPrinted":null, "hours":null },
 { "id":"lucea", "label":"Lucea", "kind":"Retail Only", "printed":[ "Main Street", "Lucea", "Hanover, Jamaica" ], "whatsapp":[ "876-279-0553", "876-956-2928" ], "landline":[ "876-956-2928" ], "hoursPrinted":"8:30pm – 5:00pm", "hours":null },
 { "id":"river-bay-road", "label":"River Bay Road", "kind":"Retail Only", "printed":[ "Western Lubricants", "River Bay Road,", "Montego Bay", "St. James, Jamaica" ], "whatsapp":[ "876-504-6730" ], "landline":[ "876-971-6650" ], "hoursPrinted":"8:30pm – 5:00pm", "hours":null },
 { "id":"barnett-lane", "label":"Barnett Lane", "kind":"Wholesale Only", "printed":[ "Barnett Lane", "Montego Bay,", "St. James, Jamaica" ], "whatsapp":[ "876-633-5253" ], "landline":[ "876-289-8824" ], "hoursPrinted":"8:30pm – 5:00pm", "hours":null },
 { "id":"molynes-road", "label":"Molynes Road", "kind":"Retail & Wholesale", "printed":[ "48 Molynes Road", "Kingston, Jamaica" ], "whatsapp":[ "876-462-9870" ], "landline":[ "876-622-3917" ], "hoursPrinted":"8:30pm – 5:00pm", "hours":null } ], "catalog":[
 { "name":"BMK Disc Pads", "category":"Brakes", "desc":"A wide variety of BMK disc pads. BMK says its pads are engineered to meet or exceed OEM standards.", "tag":"BMK" },
 { "name":"BMK Brake Shoes", "category":"Brakes", "desc":"BMK brake shoes in a wide variety. Ask any branch for the right shoe for your vehicle.", "tag":"BMK" },
 { "name":"Power King", "category":"Brands", "desc":"Power King distributor of Jamaica. Product details to be confirmed by the owner.", "tag":"To confirm", "tbc":true },
 { "name":"iLink Tyres", "category":"Tyres", "desc":"Reliable performance, durability and value, with traction, stability and fuel efficiency for drivers and fleets.", "tag":"iLink" },
 { "name":"Aoteli Tyres", "category":"Tyres", "desc":"Affordable, dependable tyres with advanced tread for grip and wear resistance on Jamaica's roads.", "tag":"Aoteli" },
 { "name":"Shell Helix HX5 SN 10W-30 · 1 L", "category":"Shell Lubricants", "desc":"Shell Helix premium motor oil for gasoline and diesel engines.", "tag":"Helix" },
 { "name":"Shell Helix HX5 SN 20W-50 · 4 L", "category":"Shell Lubricants", "desc":"Shell Helix premium motor oil: engine protection and fuel efficiency.", "tag":"Helix" },
 { "name":"Shell Helix HX7 10W-30 · 4 L", "category":"Shell Lubricants", "desc":"Shell Helix motor oil for gasoline and diesel engines.", "tag":"Helix" },
 { "name":"Shell Rimula R4 X 15W-40 · 4 L", "category":"Shell Lubricants", "desc":"Heavy-duty engine oil for commercial vehicles and long-haul work.", "tag":"Rimula" },
 { "name":"Shell Omala S2 G", "category":"Shell Lubricants", "desc":"Industrial gear oil for extreme operating conditions.", "tag":"Omala" },
 { "name":"Shell marine, hydraulic & transmission oils", "category":"Shell Lubricants", "desc":"More Shell products for marine, hydraulic, transmission and industrial use. Ask for the range.", "tag":"Shell" },
 { "name":"Auto accessories", "category":"Brands", "desc":"Accessories are part of the range. An itemised list is to be confirmed by the owner.", "tag":"To confirm", "tbc":true } ]
};

/* ===== opening intro ===== */
const op = document.getElementById('opener'), R = document.documentElement;
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

/* ===== helpers ===== */
const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const digits = n => n.replace(/\D/g, '');
const tel = n => 'tel:+1' + digits(n); // 876-622-3917 -> tel:+18766223917
const wa = (n, msg) => 'https://wa.me/1' + digits(n) + '?text=' + encodeURIComponent(msg);
const mail = (s, b) => 'mailto:' + SITE.email + '?subject=' + encodeURIComponent(s) + '&body=' + encodeURIComponent(b);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mem = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const byId = id => SITE.branches.find(b => b.id === id) || SITE.branches[0];
const FOCUS = 'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])';

function trap(el) {
  const h = e => {
    if (e.key !== 'Tab') return;
    const f = $$(FOCUS, el).filter(x => x.offsetWidth || x.offsetHeight), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', h); return () => el.removeEventListener('keydown', h);
}
let current = null; // open drawer / modal / lightbox
function layer(el, scrim) {
  let release, back;
  const api = {
    open(focusEl) {
      if (current) current.close(true);
      back = document.activeElement; el.classList.add('is-open'); scrim && scrim.classList.add('is-open');
      R.classList.add('lock'); el.setAttribute('aria-hidden', 'false'); release = trap(el); current = api;
      (focusEl || $(FOCUS, el)).focus();
    },
    close(silent) {
      el.classList.remove('is-open'); scrim && scrim.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
      R.classList.remove('lock'); release && release(); current = null; el.dispatchEvent(new Event('closed'));
      if (!silent && back) back.focus();
    }
  };
  return api;
}
addEventListener('keydown', e => { if (e.key === 'Escape' && current) current.close(); });

/* ===== nav, drawer, floating button ===== */
const nav = $('.nav'), fab = $('.fab'), hero = $('.hero');
const onScroll = () => {
  nav.classList.toggle('is-scrolled', scrollY > 80);
  fab && fab.classList.toggle('is-visible', scrollY > (hero ? hero.offsetHeight * .8 : 300));
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();
const drawer = $('#drawer'), burger = $('.burger');
if (drawer) {
  const d = layer(drawer, $('.scrim'));
  burger.addEventListener('click', () => { burger.setAttribute('aria-expanded', 'true'); d.open($('.drawer__close', drawer)); });
  drawer.addEventListener('closed', () => burger.setAttribute('aria-expanded', 'false'));
  $('.drawer__close', drawer).addEventListener('click', () => d.close());
  $('.scrim').addEventListener('click', () => d.close());
  $$('a', drawer).forEach(a => a.addEventListener('click', () => { if (!a.dataset.action) d.close(true); }));
}
// home: highlight the link of the section on screen
const tracked = $$('[data-section]').map(a => [a, document.getElementById(a.dataset.section)]).filter(x => x[1]);
if (tracked.length) {
  const so = new IntersectionObserver(es => es.forEach(e => {
    tracked.forEach(([a, s]) => { if (s === e.target) a.classList.toggle('is-active', e.isIntersecting); });
  }), { rootMargin: '-45% 0px -50% 0px' });
  tracked.forEach(([, s]) => so.observe(s));
}

/* ===== reveals, hero video, parallax ===== */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .15 });
$$('[data-reveal], .hero').forEach(el => io.observe(el));
const hv = $('.hero video');
if (hv) {
  if (reduce || saveData) { hv.removeAttribute('autoplay'); hv.pause(); }
  else { hv.muted = true; const p = hv.play(); p && p.catch(() => {}); }
}
const px = $('[data-parallax]');
if (px && !reduce) addEventListener('scroll', () => requestAnimationFrame(() => {
  const r = px.parentElement.getBoundingClientRect(), lim = r.height * .1, y = Math.max(-lim, Math.min(lim, (r.top + r.height / 2 - innerHeight / 2) * -0.15));
  px.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
}), { passive: true });

/* ===== hours + "open now" (Jamaica time) ===== */
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DN = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
function nowParts(tz) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
}
function openNow(hours, tz) {
  const p = nowParts(tz), day = p.weekday.toLowerCase().slice(0, 3), now = `${p.hour.replace('24', '00')}:${p.minute}`;
  return (hours[day] || []).some(([a, b]) => now >= a && now < b);
}
const t12 = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
function hoursHTML(b) {
  const today = nowParts(SITE.tz).weekday.toLowerCase().slice(0, 3), open = openNow(b.hours, SITE.tz);
  return `<div class="hours__head"><h4>Opening hours</h4><span class="status status--${open ? 'open' : 'closed'}">${open ? 'Open now' : 'Closed now'}</span></div><table><tbody>${DAYS.map(d => `<tr${d === today ? ' class="is-today"' : ''}><td>${DN[d]}</td><td>${(b.hours[d] || []).length ? b.hours[d].map(([a, z]) => t12(a) + ' – ' + t12(z)).join(', ') : 'Closed'}</td></tr>`).join('')}</tbody></table><p class="note">Jamaica time.</p>`;
}
$$('[data-hours]').forEach(el => { const b = byId(el.dataset.hours); if (b.hours) el.innerHTML = hoursHTML(b); });

/* ===== ARIA tabs: spotlight + branch finder ===== */
$$('[data-tabs]').forEach(box => {
  const tabs = $$('[role="tab"]', box), imgs = $$('[data-tab-img]', box), big = $('.vpanel__big', box), sub = $('.vpanel__sub', box);
  const show = (t, focus) => {
    tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
    imgs.forEach(im => im.classList.toggle('is-on', im.dataset.tabImg === t.id));
    if (big) { big.textContent = t.dataset.big; sub.textContent = t.dataset.sub; }
    focus && t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', e => {
      const n = tabs.length, k = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
      if (k !== undefined) { e.preventDefault(); show(tabs[(k + n) % n], true); }
    });
  });
});

/* ===== catalog: search + category chips ===== */
const cl = $('#cat-list');
if (cl) {
  const chips = $('#cat-chips'), q = $('#cat-q'), count = $('#cat-count'), empty = $('#cat-empty'); let cat = 'All';
  const cats = ['All', ...new Set(SITE.catalog.map(i => i.category))];
  chips.innerHTML = cats.map(c => `<button type="button" class="chip" aria-pressed="${c === 'All'}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  cl.innerHTML = SITE.catalog.map((it, i) => `<li class="cat-item" data-i="${i}"><div class="cat-item__row"><span class="cat-item__name">${esc(it.name)}</span><span class="cat-item__dots" aria-hidden="true"></span>${it.price ? `<span class="cat-item__price">${esc(it.price)}</span>` : ''}<a class="cat-item__ask" href="locations.html" data-action="quote" data-item="${esc(it.name)}">Ask ↗<span class="sr-only"> for a quote on ${esc(it.name)}</span></a></div><p>${esc(it.desc)}</p><span class="tag${it.tbc ? ' tag--tbc' : ''}">${esc(it.tag)}</span></li>`).join('');
  const run = () => {
    const t = q.value.trim().toLowerCase(); let n = 0;
    $$('.cat-item', cl).forEach(li => {
      const it = SITE.catalog[li.dataset.i];
      const ok = (cat === 'All' || it.category === cat) && (!t || [it.name, it.desc, it.tag, it.category].join(' ').toLowerCase().includes(t));
      li.hidden = !ok; n += ok;
    });
    count.textContent = `Showing ${n} ${n === 1 ? 'line' : 'lines'}${cat !== 'All' ? ' in ' + cat : ''}${t ? ` matching “${q.value.trim()}”` : ''}`;
    empty.hidden = n > 0;
  };
  q.addEventListener('input', run);
  chips.addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.cat; $$('.chip', chips).forEach(c => c.setAttribute('aria-pressed', c === b)); run(); });
  run();
}

/* ===== gallery lightbox ===== */
const lb = $('#lightbox');
if (lb) {
  const items = $$('.g-item'), stage = $('.lb__stage', lb), L = layer(lb); let i = 0, img = null;
  const show = n => {
    i = (n + items.length) % items.length; const it = items[i];
    if (!img) { img = new Image(); img.decoding = 'async'; stage.insertBefore(img, $('.lb__next', lb)); }
    img.src = it.dataset.full; img.alt = $('img', it).alt; $('.lb__cap', lb).textContent = it.dataset.cap;
    $('.lb__count', lb).textContent = `${i + 1} / ${items.length}`; stage.className = 'lb__stage' + (it.dataset.kind ? ' is-' + it.dataset.kind : '');
  };
  items.forEach((it, n) => it.addEventListener('click', () => { show(n); L.open($('.lb__close', lb)); }));
  $('.lb__close', lb).addEventListener('click', () => L.close());
  $('.lb__prev', lb).addEventListener('click', () => show(i - 1));
  $('.lb__next', lb).addEventListener('click', () => show(i + 1));
  lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
  let x0 = null;
  stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
  stage.addEventListener('click', e => { if (e.target === stage) L.close(); });
}

/* ===== action modal: every CTA opens it ===== */
const am = $('#action');
if (am) {
  const L = layer(am, null); let mode = 'quote', item = '', bid = mem.get('branch') || SITE.branches[0].id;
  const ICON = { wa: '#i-wa', call: '#i-call', mail: '#i-mail' };
  const row = (k, href, title, sub, ext) => `<li><a class="opt opt--${k}" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="opt__icon"><svg aria-hidden="true"><use href="${ICON[k]}"/></svg></span><span><b>${title}</b><small>${sub}</small></span></a></li>`;
  const render = () => {
    const list = mode === 'wholesale' ? SITE.branches.filter(b => /Wholesale/.test(b.kind)) : SITE.branches;
    if (!list.some(b => b.id === bid)) bid = list[0].id;
    const b = byId(bid), hi = `Hi Chappa Auto (${b.label}), `;
    const T = { quote: ['Quote', 'Get a quote.'], wholesale: ['Wholesale', 'Become a wholesale customer.'], contact: ['Contact', 'Talk to a branch.'] }[mode];
    $('.modal__eyebrow', am).textContent = item ? T[0] + ' · ' + item : T[0];
    $('#action-title', am).textContent = T[1];
    $('#action-chips', am).innerHTML = list.map(x => `<button type="button" class="chip" aria-pressed="${x.id === bid}" data-b="${x.id}">${esc(x.label)}</button>`).join('');
    const msg = mode === 'wholesale' ? hi + "I'd like to apply to become a wholesale customer." : hi + (item ? `I'd like a quote for: ${item}. ` : "I'd like a quote. ") + 'My vehicle (make, model, year) is: ';
    const subj = mode === 'wholesale' ? SITE.wholesale.subject : 'Quote request' + (item ? ': ' + item : '');
    const body = mode === 'wholesale' ? SITE.wholesale.body : `Hi Chappa Auto team,\n\nI'd like a quote for:\n• Part / tyre / oil: ${item}\n• Vehicle (make, model, year):\n• Quantity:\n• Nearest branch: ${b.label}\n• Name:\n• Phone:\n`;
    $('#action-opts', am).innerHTML =
      b.whatsapp.map(n => row('wa', wa(n, msg), 'WhatsApp ' + b.label, n, 1)).join('') +
      b.landline.map(n => row('call', tel(n), 'Call ' + b.label, n + ' (landline)')).join('') +
      row('mail', mail(subj, body), mode === 'wholesale' ? 'Email a wholesale application' : 'Email a quote request', SITE.email);
    $('#action-foot', am).innerHTML = `<strong>${esc(b.kind)}</strong><span>${b.printed.map(esc).join(', ')}</span><span>${b.hoursPrinted ? 'Hours printed on the current site: ' + esc(b.hoursPrinted) + ' (no days listed). ' : ''}Please confirm opening hours with the branch before visiting.</span>`;
  };
  $('#action-chips', am).addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; bid = c.dataset.b; mem.set('branch', bid); render(); $(`[data-b="${bid}"]`, am).focus(); });
  $('.modal__close', am).addEventListener('click', () => L.close());
  $('.modal__scrim', am).addEventListener('click', () => L.close());
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]'); if (!t) return;
    e.preventDefault(); mode = t.dataset.action; item = t.dataset.item || ''; render(); L.open($('.modal__close', am));
  });
}

/* ===== forms -> email app (nothing sent from the page) ===== */
$$('form[data-mailto]').forEach(f => f.addEventListener('submit', e => {
  e.preventDefault(); if (!f.reportValidity()) return;
  const d = Object.fromEntries(new FormData(f)), w = f.dataset.mailto === 'wholesale';
  const subject = w ? SITE.wholesale.subject : 'Website enquiry from ' + d.name;
  const body = w ? SITE.wholesale.body.replace('Name:', 'Name: ' + d.name).replace('Company:', 'Company: ' + d.company).replace('Phone Number:', 'Phone Number: ' + d.phone).replace('Information:', 'Information: ' + (d.info || ''))
    : `${d.message}\n\n${d.name}\n${d.email}${d.phone ? '\n' + d.phone : ''}`;
  location.href = mail(subject, body);
  $('.form__status', f).textContent = `Your email app should open with this message ready. Nothing is sent until you press Send there. No email app? Write to ${SITE.email}.`;
}));

/* ===== locations page filter ===== */
const bf = $('#branch-filter');
if (bf) bf.addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return; const k = c.dataset.kind;
  $$('.chip', bf).forEach(x => x.setAttribute('aria-pressed', x === c));
  $$('#branch-grid > li').forEach(li => { li.hidden = k !== 'all' && !li.dataset.kind.toLowerCase().includes(k); });
});
$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
