/* =====================================================================================
   KENNY'S ITALIAN CAFE · EDIT HERE
   Everything the restaurant may want to change lives in this block: hours, menu, events,
   reviews and social links. Save the file and reload: every page updates.
   ===================================================================================== */
const SITE = {
  name: "Kenny's Italian Cafe",
  phone: "876-912-3719",            // shown on the site
  tel: "+18769123719",              // tap-to-call
  whatsapp: "18769123719",          // WhatsApp: country code + number, digits only
  email: "info@kennysitaliancafe.com",
  timezone: "America/Jamaica",

  // Opening hours, 24-hour clock. "24:00" = midnight. A closing time earlier than the opening
  // time runs past midnight ("02:00" = 2 am the next morning). null = not published: shows "Call to confirm".
  hours: {
    mon: ["15:00", "24:00"], tue: ["15:00", "24:00"], wed: ["15:00", "24:00"], thu: ["15:00", "24:00"],
    fri: ["15:00", "02:00"], sat: null, sun: ["15:00", "24:00"]
  },

  // Social links. TODO: paste the real page addresses here.
  socials: {
    instagram: { label: "@italiancafejamaica", url: "https://www.instagram.com/italiancafejamaica/" },
    facebook: { label: "Italian Cafe Negril", url: "https://www.facebook.com/search/top?q=Italian%20Cafe%20Negril" }
  },

  // MENU. Each tab is one category. Add dishes to "items" as { name: "", desc: "", price: "" }.
  // Leave price as "" when it isn't confirmed (the site then says "Price to be confirmed", never $0).
  // "photos" are image names from assets/img (without size or extension).
  priceNote: "Prices to be confirmed",
  menu: [
    { id: "pasta", label: "Pasta", title: "Pasta", intro: "Handmade pasta, from the Italian classics to Rasta Pasta.",
      photos: ["lobster-linguine", "scoglio", "carbonara", "pasta-ragu"],
      items: [
        { name: "Spaghetti Aglio, Olio e Peperoncino", desc: "Extra virgin olive oil, garlic, red pepper", price: "$12.05" },
        { name: "Pasta al Pomodoro", desc: "Meat sauce", price: "$14.05" },
        { name: "Pasta al Ragu", desc: "Meat sauce", price: "$17" },
        { name: "Rasta Pasta", desc: "Tomato sauce, olive, green pepper, mushrooms, onions", price: "$16.05" },
        { name: "Penne all'Arrabbiata", desc: "Tomato sauce, red pepper", price: "$14.05" },
        { name: "Pasta alla Puttanesca", desc: "Tomato sauce, olive, capers, red pepper, garlic", price: "$15.75" },
        { name: "Pasta alla Montanara", desc: "Cream sauce, Italian sausage", price: "$18" },
        { name: "Spaghetti all'Amatriciana", desc: "Tomato sauce, bacon, garlic", price: "$17.05" },
        { name: "Spaghetti alla Carbonara", desc: "Extra virgin olive oil with bacon, egg, garlic, parmesan cheese", price: "$15.50" },
        { name: "Pasta alla Pescatora", desc: "Tomato sauce, fish, onions, capers", price: "$19.05" },
        { name: "Spaghetti allo Scoglio", desc: "Tomato sauce, shrimp, mussels, onions, capers", price: "$24.05" },
        { name: "Chicken & Shrimp Alfredo", desc: "Alfredo sauce, chicken, shrimp", price: "$23.05" },
        { name: "Linguine all'Aragosta", desc: "Tomato sauce, lobster", price: "$26.05" },
        { name: "Seafood Alfredo", desc: "Cream sauce, lobster, shrimp, fish", price: "$28.05" },
        { name: "My Pasta", desc: "Your choice of penne, spaghetti or linguine", price: "" }
      ] },
    { id: "pizza", label: "Pizza", title: "Thin-crust pizza", photos: ["pepperoni-pizza", "hawaiian-pizza", "veggie-pizza", "sausage-pizza"], items: [] },
    { id: "seafood", label: "Seafood", title: "Seafood & lobster", photos: ["grilled-lobster", "escovitch-fish", "lobster-dinner", "fish-vegetables"], items: [] },
    { id: "steak", label: "Steak", title: "Steak", photos: [], items: [] },
    { id: "appetizers", label: "Appetizers & Sides", title: "Appetizers & sides", photos: ["bruschetta", "garlic-bread", "fish-cakes", "bruschetta-2"], items: [] },
    { id: "salad", label: "Salad", title: "Salad", photos: ["caprese-salad"], items: [] },
    { id: "desserts", label: "Ice Cream & Desserts", title: "Ice cream & desserts", intro: "Dolce Vita is our dessert spot.", photos: ["dolce-vita"], items: [] }
  ],

  // EVENTS. Recurring events show every week; dated events ("date": "2026-12-31") hide themselves once they've passed.
  events: [
    { title: "Uptown Fridayz", recurring: "Fri", when: "Every Friday night", meta: "DJ · Full bar · Open until 2 am",
      desc: "Friday nights on the Hip Strip with a DJ, handcrafted cocktails and a lively crowd." }
    // { title: "New Year's Eve", date: "2026-12-31", meta: "8 pm · DJ", desc: "One line about the night." }
  ],

  // REVIEWS. Paste real reviews only, word for word, e.g.
  // { quote: "Best pizza in Negril!", name: "Sarah", source: "Google review" }
  testimonials: []
};
/* ============================ end of the editable block ============================ */

(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const R = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wa = text => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  /* ---------- opening intro (home page) ---------- */
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

  /* ---------- focus trap (drawer, lightbox) ---------- */
  function trap(el, e) {
    if (e.key !== 'Tab') return;
    const f = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', el).filter(x => x.offsetParent !== null);
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- header + drawer ---------- */
  const hdr = $('[data-hdr]');
  const fab = $('.fab'), hasHero = !!$('.hero');
  const onScroll = () => {
    hdr && hdr.classList.toggle('is-scrolled', scrollY > 80);
    fab && hasHero && fab.classList.toggle('is-hidden', scrollY < innerHeight * .6);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const drawer = $('#drawer'), burger = $('[data-burger]');
  if (drawer && burger) {
    let opener = null;
    const close = () => {
      drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); drawer.inert = true;
      burger.setAttribute('aria-expanded', 'false'); R.classList.remove('is-locked'); opener && opener.focus();
    };
    const open = () => {
      opener = document.activeElement; drawer.inert = false;
      drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true'); R.classList.add('is-locked');
      setTimeout(() => $('.drawer__close', drawer).focus(), 50);
    };
    drawer.inert = true;
    burger.addEventListener('click', open);
    drawer.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.closest('.drawer__nav a')) close(); });
    drawer.addEventListener('keydown', e => { if (e.key === 'Escape') close(); else trap(drawer, e); });
  }

  /* ---------- background videos: poster only with reduced motion / data saver; pause when off screen ---------- */
  $$('video[data-bg]').forEach(v => {
    if (reduce || saveData) { v.removeAttribute('autoplay'); v.pause(); v.preload = 'none'; return; }
    v.muted = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { const p = v.play(); p && p.catch(() => {}); } else v.pause();
    }), { threshold: .05 }).observe(v);
  });

  /* ---------- WhatsApp links + socials + year ---------- */
  $$('[data-wa]').forEach(a => { a.href = wa(a.dataset.wa || `Hi ${SITE.name}!`); });
  $$('[data-social]').forEach(a => { const s = SITE.socials[a.dataset.social]; if (s && s.url) a.href = s.url; });
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* ---------- hours + open now (in Jamaica time) ---------- */
  const min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmt = t => {
    if (t === '24:00' || t === '00:00') return 'midnight';
    let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
  };
  const span = h => h ? `${fmt(h[0])} – ${fmt(h[1])}` : 'Call to confirm';
  function now() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: SITE.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    return { d: DAYS.indexOf(p.weekday.toLowerCase().slice(0, 3)), m: (+p.hour % 24) * 60 + +p.minute };
  }
  function status() {
    const { d, m } = now(), H = SITE.hours, today = H[DAYS[d]], prev = H[DAYS[(d + 6) % 7]];
    if (prev && min(prev[1]) < min(prev[0]) && m < min(prev[1])) return ['open', `Open now · until ${fmt(prev[1])}`];
    if (prev === null && m < 4 * 60) return ['unknown', 'Late hours: call to confirm'];
    if (!today) return ['unknown', `${NAMES[DAYS[d]]}: call to confirm`];
    const o = min(today[0]), c = min(today[1]), late = c <= o;
    if (m >= o && (late || m < c)) return ['open', `Open now · until ${fmt(today[1])}`];
    if (m < o) return ['closed', `Closed · opens ${fmt(today[0])}`];
    const next = H[DAYS[(d + 1) % 7]];
    return ['closed', next ? `Closed · opens ${fmt(next[0])} tomorrow` : 'Closed now'];
  }
  const today = DAYS[now().d];
  $$('[data-hours]').forEach(t => {
    t.innerHTML = '<caption class="sr-only">Opening hours</caption><tbody>' + ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k =>
      `<tr${k === today ? ' class="is-today"' : ''}><th scope="row">${NAMES[k]}</th><td>${span(SITE.hours[k])}</td></tr>`).join('') + '</tbody>';
  });
  const [st, label] = status();
  $$('[data-open-status]').forEach(el => { el.dataset.state = st; el.textContent = label; });
  $$('[data-today]').forEach(el => { el.textContent = SITE.hours[today] ? `Today ${span(SITE.hours[today])}` : `${NAMES[today]}: call to confirm`; });

  /* ---------- picture helper (menu photos; sizes come from window.IMGS in menu.html) ---------- */
  const IMGS = window.IMGS || {};
  const pic = (n, sizes = '(max-width:700px) 50vw, 25vw') => {
    const m = IMGS[n]; if (!m) return '';
    return `<picture><source type="image/webp" srcset="${m.s}" sizes="${sizes}"><img src="assets/img/${n}.jpg" alt="${esc(m.a)}" loading="lazy" decoding="async" width="${m.w}" height="${m.h}"></picture>`;
  };

  /* ---------- menu tabs ---------- */
  const tabsEl = $('[data-menu-tabs]'), panelsEl = $('[data-menu-panels]');
  if (tabsEl && panelsEl) {
    tabsEl.innerHTML = SITE.menu.map((c, i) =>
      `<button class="tab" role="tab" id="tab-${c.id}" aria-controls="panel-${c.id}" aria-selected="${i ? 'false' : 'true'}" tabindex="${i ? -1 : 0}">${esc(c.label)}</button>`).join('');
    panelsEl.innerHTML = SITE.menu.map((c, i) => {
      const photos = (c.photos || []).map(n => `<div class="frame">${pic(n)}</div>`).join('');
      let body;
      if (c.items.length) {
        body = `<ul class="items">${c.items.map(it => `<li class="item"><div class="item__top"><h3 class="item__name">${esc(it.name)}</h3><span class="item__dots" aria-hidden="true"></span>` +
          (it.price ? `<span class="item__price">${esc(it.price)}</span>` : `<span class="item__price item__price--tbc">Price to be confirmed</span>`) + `</div>` +
          `<div class="item__bottom"><p class="item__desc">${esc(it.desc || '')}</p>${it.price ? `<span class="item__note">${esc(SITE.priceNote)}</span>` : ''}</div></li>`).join('')}</ul>` +
          (photos ? `<div class="menu-photos">${photos}</div>` : '');
      } else {
        const lead = c.photos && c.photos[0];
        body = `<div class="soon"><div class="soon__media${lead ? '' : ' soon__media--type'}">${lead ? pic(lead, '(max-width:760px) 100vw, 50vw') : `<span aria-hidden="true">${esc(c.label.split(' ')[0])}</span>`}</div>` +
          `<div class="soon__body"><span class="tag">Coming soon</span><h3>${esc(c.title)}</h3><p class="muted">Our ${esc(c.label.toLowerCase())} menu is coming to the website soon. Ask your server, or message us on WhatsApp for today's options.</p>` +
          `<div class="btn-row"><a class="btn btn--wa btn--sm" href="${wa(`Hi ${SITE.name}! What's on the ${c.label.toLowerCase()} menu today?`)}" target="_blank" rel="noopener">Ask on WhatsApp</a>` +
          `<a class="btn btn--outline btn--sm" href="tel:${SITE.tel}">Call ${esc(SITE.phone)}</a></div></div></div>` +
          (c.photos && c.photos.length > 1 ? `<div class="menu-photos">${c.photos.slice(1).map(n => `<div class="frame">${pic(n)}</div>`).join('')}</div>` : '');
      }
      return `<section class="menu-panel" role="tabpanel" id="panel-${c.id}" aria-labelledby="tab-${c.id}" tabindex="0"${i ? ' hidden' : ''}>` +
        `<div class="menu-panel__head"><h2>${esc(c.title)}</h2>${c.intro ? `<p>${esc(c.intro)}</p>` : ''}</div>${body}</section>`;
    }).join('');
    const tabs = $$('[role="tab"]', tabsEl);
    const select = (t, focus, push) => {
      tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
      focus && t.focus(); t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
      push && history.replaceState(null, '', '#' + t.id.slice(4));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false, true));
      t.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
        if (k === undefined) return; e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length], true, true);
      });
    });
    const fromHash = () => { const t = $('#tab-' + location.hash.slice(1)); t && select(t); };
    fromHash(); addEventListener('hashchange', fromHash);
  }

  /* ---------- events ---------- */
  const evEl = $('[data-events]');
  if (evEl) {
    const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: SITE.timezone });
    const list = SITE.events.filter(e => e.recurring || !e.date || e.date >= todayISO);
    evEl.innerHTML = list.length ? list.map(e => {
      let big = e.recurring || '', small = 'Weekly';
      if (e.date) { const d = new Date(e.date + 'T12:00:00'); big = d.getDate(); small = d.toLocaleDateString('en-US', { month: 'short', weekday: 'short' }); }
      return `<article class="event" data-reveal><div class="event__date"><div><b>${esc(big)}</b><small>${esc(small)}</small></div></div>` +
        `<div><p class="event__meta">${esc([e.when, e.meta].filter(Boolean).join(' · '))}</p><h3>${esc(e.title)}</h3><p>${esc(e.desc || '')}</p></div>` +
        `<a class="btn btn--gold btn--sm" href="reservations.html?occasion=${encodeURIComponent(e.title)}">Reserve</a></article>`;
    }).join('') : '<p class="empty">New events are on the way. Message us on WhatsApp to hear what\'s on.</p>';
  }

  /* ---------- testimonials (only real reviews; the grid hides itself when empty) ---------- */
  const qEl = $('[data-testimonials]');
  if (qEl) qEl.innerHTML = SITE.testimonials.map(t => `<figure class="quote"><blockquote>“${esc(t.quote)}”</blockquote><figcaption>${esc(t.name)}${t.source ? ' · ' + esc(t.source) : ''}</figcaption></figure>`).join('');

  /* ---------- reservation form → WhatsApp ---------- */
  const form = $('[data-reserve]');
  if (form) {
    const f = n => form.elements[n];
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: SITE.timezone });
    f('date').min = todayStr;
    const occ = new URLSearchParams(location.search).get('occasion');
    if (occ) {
      const o = [...f('occasion').options].find(x => x.value.toLowerCase() === occ.toLowerCase());
      if (o) f('occasion').value = o.value; else if (/fridayz/i.test(occ)) f('notes').value = 'Uptown Fridayz';
    }
    const hint = $('[data-date-hint]', form);
    const slots = () => {
      const v = f('date').value, sel = f('time'), keep = sel.value;
      const day = v ? DAYS[new Date(v + 'T12:00:00').getDay()] : null, h = day ? SITE.hours[day] : null;
      const o = h ? min(h[0]) : 15 * 60; let c = h ? min(h[1]) : 23 * 60 + 60; if (c <= o) c += 24 * 60;
      sel.innerHTML = '<option value="">Choose a time</option>';
      for (let t = o; t <= c - 60; t += 30) { const lbl = fmt(`${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`); sel.add(new Option(lbl === 'midnight' ? '12 am (midnight)' : lbl, lbl)); }
      if ([...sel.options].some(x => x.value === keep)) sel.value = keep;
      hint.textContent = day && !h ? `${NAMES[day]} hours aren't published yet, so we'll confirm your time on WhatsApp.` : day ? `${NAMES[day]}: ${span(h)}` : '';
    };
    f('date').addEventListener('change', slots); slots();
    const err = (n, msg) => { const el = f(n), e = $(`#err-${n}`, form); el.setAttribute('aria-invalid', msg ? 'true' : 'false'); e.textContent = msg || ''; return !msg; };
    form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true') err(e.target.name, ''); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = f('name').value.trim(), phone = f('phone').value.trim(), date = f('date').value, time = f('time').value, size = f('size').value;
      const ok = [err('name', name ? '' : 'Please add your name.'),
        err('phone', phone.replace(/\D/g, '').length >= 7 ? '' : 'Please add a phone number we can reach you on.'),
        err('date', !date ? 'Please pick a date.' : date < todayStr ? 'Please pick today or a later date.' : ''),
        err('time', time ? '' : 'Please choose a time.'), err('size', size ? '' : 'How many people?')];
      if (ok.includes(false)) { form.querySelector('[aria-invalid="true"]').focus(); return; }
      const nice = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const lines = [`Hi ${SITE.name}! I'd like to reserve a table.`, '', `Name: ${name}`, `Phone: ${phone}`, `Date: ${nice}`, `Time: ${time}`, `Party size: ${size}`,
        `Occasion: ${f('occasion').value || 'None'}`];
      if (f('notes').value.trim()) lines.push(`Notes: ${f('notes').value.trim()}`);
      const url = wa(lines.join('\n')), done = $('[data-done]'), link = $('[data-done-link]');
      link.href = url; done.classList.add('is-shown');
      const w = window.open(url, '_blank');
      if (w) w.opener = null; else location.href = url;
      done.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); link.focus({ preventScroll: true });
    });
  }

  /* ---------- gallery filters + lightbox ---------- */
  const grid = $('[data-gallery]');
  if (grid) {
    const items = $$('.masonry__item', grid);
    $$('[data-filter]').forEach(b => b.addEventListener('click', () => {
      $$('[data-filter]').forEach(x => x.setAttribute('aria-pressed', x === b));
      items.forEach(it => { it.hidden = !(b.dataset.filter === 'all' || it.dataset.group.split(' ').includes(b.dataset.filter)); });
      $('[data-gallery-count]').textContent = `${items.filter(i => !i.hidden).length} photos and videos`;
    }));
    const lb = $('#lightbox'), stage = $('.lb__stage', lb), cap = $('.lb__cap', lb), count = $('.lb__count', lb);
    let cur = 0, back = null, list = [];
    const show = i => {
      cur = (i + list.length) % list.length; const it = list[cur];
      const old = $('img,video', stage); old && old.remove();
      let m;
      if (it.dataset.video) {
        m = document.createElement('video'); Object.assign(m, { src: it.dataset.video, poster: it.dataset.poster || '', controls: true, playsInline: true, loop: true, muted: true, autoplay: !reduce });
      } else { m = new Image(); m.src = it.dataset.full; m.alt = $('img', it).alt; }
      stage.prepend(m); cap.textContent = it.dataset.caption || ''; count.textContent = `${cur + 1} / ${list.length}`;
    };
    const open = it => {
      list = items.filter(i => !i.hidden); back = it; show(list.indexOf(it));
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); lb.inert = false; R.classList.add('is-locked');
      $('.lb__close', lb).focus();
    };
    const close = () => {
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); lb.inert = true; R.classList.remove('is-locked');
      const v = $('video', stage); v && v.pause(); back && back.focus();
    };
    lb.inert = true;
    items.forEach(it => it.addEventListener('click', () => open(it)));
    $('.lb__close', lb).addEventListener('click', close);
    $('.lb__prev', lb).addEventListener('click', () => show(cur - 1));
    $('.lb__next', lb).addEventListener('click', () => show(cur + 1));
    lb.addEventListener('click', e => { if (e.target === lb || e.target === stage) close(); });
    lb.addEventListener('keydown', e => {
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(cur - 1); else if (e.key === 'ArrowRight') show(cur + 1); else trap(lb, e);
    });
    let x0 = null;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  }

  /* ---------- reveals (last, so the menu, events and reviews drawn above are included) ---------- */
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    $$('[data-reveal], .hero, .phead').forEach(el => io.observe(el));
  } else $$('[data-reveal], .hero, .phead').forEach(el => el.classList.add('is-in'));
})();
