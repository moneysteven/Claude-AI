/* Selfie TV Boss Entertainment: shared layout + page features.
   Every page includes site-config.js then this file. */
(function () {
  'use strict';
  var SITE = window.SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var page = document.body.dataset.page || 'home';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  var tel = SITE.phone ? 'tel:' + SITE.phone.replace(/[^\d+]/g, '') : '';
  var wa = SITE.whatsapp ? 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent('Hi Selfie TV Boss! I\'d like to book you for my event.') : '';

  // ---------- Header ----------
  var NAV = [
    ['home', 'index.html', 'Home'],
    ['services', 'services.html', 'Services'],
    ['events', 'events.html', 'Events'],
    ['gallery', 'gallery.html', 'Gallery'],
    ['about', 'about.html', 'About'],
  ];
  var header = el('header', { class: 'site-header' });
  header.innerHTML =
    '<a class="brand" href="index.html" aria-label="Selfie TV Boss Entertainment, home">' +
      '<span class="brand-mark" aria-hidden="true">S</span>' +
      '<span class="brand-name">Selfie TV Boss<small>Entertainment</small></span>' +
    '</a>' +
    '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>' +
    '<nav class="nav" id="site-nav" aria-label="Main"></nav>';
  var nav = $('.nav', header);
  NAV.forEach(function (n) {
    var a = el('a', { href: n[1] }, n[2]);
    if (n[0] === page) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  });
  var book = el('a', { href: 'book.html', class: 'btn btn-gold' }, 'Book Now');
  if (page === 'book') book.setAttribute('aria-current', 'page');
  nav.appendChild(book);
  document.body.insertBefore(header, document.body.firstChild);

  var menuBtn = $('.menu-btn', header);
  menuBtn.addEventListener('click', function () {
    var open = header.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Close' : 'Menu';
    document.body.style.overflow = open ? 'hidden' : '';
  });
  function onScroll() { header.classList.toggle('solid', window.scrollY > 30 || page !== 'home'); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Footer ----------
  var footer = el('footer', { class: 'site-footer' });
  footer.innerHTML =
    '<div class="foot-grid">' +
      '<div><p class="foot-big">Your event,<br><span class="foil">broadcast-level.</span></p><p class="muted">Host · DJ · Entertainer · Actor · Promoter · Project Manager</p></div>' +
      '<div><h4>Explore</h4><ul>' + NAV.map(function (n) { return '<li><a href="' + n[1] + '">' + n[2] + '</a></li>'; }).join('') + '<li><a href="book.html">Book Selfie TV Boss</a></li></ul></div>' +
      '<div><h4>Reach the Boss</h4><ul class="foot-contact"></ul><div class="socials" style="margin-top:16px"></div></div>' +
    '</div>' +
    '<div class="foot-base"><span>© ' + new Date().getFullYear() + ' Selfie TV Boss Entertainment</span><span>' + (SITE.location || '') + '</span></div>';
  var fc = $('.foot-contact', footer);
  if (tel) fc.appendChild(el('li')).appendChild(el('a', { href: tel }, SITE.phone));
  if (wa) fc.appendChild(el('li')).appendChild(el('a', { href: wa, target: '_blank', rel: 'noopener' }, 'WhatsApp'));
  if (SITE.email) fc.appendChild(el('li')).appendChild(el('a', { href: 'mailto:' + SITE.email }, SITE.email));
  fillSocials($('.socials', footer));
  document.body.appendChild(footer);

  function fillSocials(box) {
    Object.keys(SITE.social || {}).forEach(function (k) {
      if (SITE.social[k]) box.appendChild(el('a', { href: SITE.social[k], target: '_blank', rel: 'noopener' }, k));
    });
  }

  // ---------- Mobile action bar ----------
  var ICON = {
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.7-5.2A8.5 8.5 0 1 1 21 12z"/></svg>',
  };
  var bar = el('div', { class: 'action-bar' });
  bar.innerHTML = (tel ? '<a href="' + tel + '">' + ICON.phone + 'Call</a>' : '') +
    (wa ? '<a href="' + wa + '" target="_blank" rel="noopener">' + ICON.chat + 'WhatsApp</a>' : '') +
    '<a class="gold" href="book.html">Book Now</a>';
  document.body.appendChild(bar);

  // ---------- Fast page changes ----------
  // 1) Pages are fetched before the click: on hover (mouse), touch-down (phones)
  //    or focus (keyboard). Chrome goes further and pre-renders them.
  // 2) The old page's content fades out the moment a link is tapped, while the
  //    next page is already loading (no waiting); the new page glides in.
  // 3) A slim loading line runs only if a page is actually slow to arrive.
  var isPage = function (href) { return /^[\w-]+\.html(\?[^#]*)?(#.*)?$/.test(href || ''); };
  var fetched = {};
  var warm = function (a) {
    var href = a && a.getAttribute && a.getAttribute('href');
    if (!isPage(href)) return;
    var path = href.split('#')[0];
    if (fetched[path]) return;
    fetched[path] = true;
    var l = document.createElement('link'); l.rel = 'prefetch'; l.href = path;
    document.head.appendChild(l);
  };
  ['pointerover', 'touchstart', 'focusin'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { warm(e.target.closest && e.target.closest('a[href]')); }, { passive: true, capture: true });
  });
  if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
    var rules = document.createElement('script');
    rules.type = 'speculationrules';
    rules.textContent = JSON.stringify({ prerender: [{ where: { href_matches: '*.html*' }, eagerness: 'moderate' }] });
    document.head.appendChild(rules);
  }
  // Pre-fetch the main pages shortly after this one settles, so the menu feels instant.
  var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 1200); };
  idle(function () { NAV.forEach(function (n) { if (n[0] !== page) warm({ getAttribute: function () { return n[1]; } }); }); warm({ getAttribute: function () { return 'book.html'; } }); });

  var loader = el('div', { class: 'page-loader', 'aria-hidden': 'true' });
  document.body.appendChild(loader);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || !isPage(a.getAttribute('href'))) return;
    if (header.classList.contains('open')) { header.classList.remove('open'); document.body.style.overflow = ''; }
    loader.classList.remove('done'); void loader.offsetWidth; loader.classList.add('go');
    if (!reduceMotion) document.documentElement.classList.add('leaving');
  });
  window.addEventListener('pageshow', function () {
    loader.classList.remove('go'); loader.classList.add('done');
    document.documentElement.classList.remove('leaving');
  });

  // ---------- Contact links anywhere on the page ----------
  $$('[data-tel]').forEach(function (a) { if (tel) { a.href = tel; if (!a.textContent.trim()) a.textContent = SITE.phone; } else a.remove(); });
  $$('[data-wa]').forEach(function (a) { if (wa) a.href = wa; else a.remove(); });
  $$('[data-email]').forEach(function (a) { if (SITE.email) { a.href = 'mailto:' + SITE.email; if (!a.textContent.trim()) a.textContent = SITE.email; } else a.remove(); });
  $$('[data-phone-text]').forEach(function (s) { s.textContent = SITE.phone || ''; });
  $$('[data-socials]').forEach(fillSocials);

  // ---------- Scroll reveal ----------
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 }) : null;
  function observe(n) { if (io) io.observe(n); else n.classList.add('in'); }
  $$('.fade').forEach(observe);

  // ---------- Broadcast clock (home) ----------
  var clock = $('[data-clock]');
  if (clock) {
    var tick = function () {
      clock.textContent = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Jamaica', hour: 'numeric', minute: '2-digit', second: '2-digit' });
    };
    tick(); setInterval(tick, 1000);
  }

  // ---------- Events ----------
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function dateOf(e) { var p = e.date.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function startOf(e) {
    var d = dateOf(e);
    if (e.time) { var t = e.time.split(':').map(Number); d.setHours(t[0], t[1]); } else d.setHours(12);
    return d;
  }
  function niceTime(t) {
    if (!t) return '';
    var p = t.split(':').map(Number);
    return ((p[0] + 11) % 12 + 1) + (p[1] ? ':' + String(p[1]).padStart(2, '0') : '') + (p[0] < 12 ? ' am' : ' pm');
  }
  function longDate(e) { return dateOf(e).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  var PIN = '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  var CAL = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

  function loadEvents() {
    return fetch('api/events', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        return (list || []).filter(function (e) { return dateOf(e) >= today; });
      });
  }

  function featureCard(e) {
    var card = el('article', { class: 'feature-event fade r3d' });
    var main = el('div', { class: 'fe-main' });
    main.appendChild(el('p', { class: 'label' }, 'Next on air'));
    main.appendChild(el('h3', null, e.title));
    var meta = el('div', { class: 'fe-meta' });
    meta.innerHTML = '<span>' + CAL + '</span><span>' + PIN + '</span>';
    meta.children[0].appendChild(document.createTextNode(longDate(e) + (e.time ? ' · ' + niceTime(e.time) : '')));
    if (e.venue || e.city) meta.children[1].appendChild(document.createTextNode([e.venue, e.city].filter(Boolean).join(', ')));
    else meta.children[1].remove();
    main.appendChild(meta);
    if (e.description) main.appendChild(el('p', { class: 'muted', style: 'margin:0' }, e.description));
    var row = el('div', { class: 'btn-row' });
    if (e.ticketUrl) row.appendChild(el('a', { class: 'btn btn-gold', href: e.ticketUrl, target: '_blank', rel: 'noopener' }, 'Get Tickets'));
    row.appendChild(el('a', { class: 'btn', href: 'book.html' }, 'Book for your event'));
    main.appendChild(row);
    card.appendChild(main);

    var side = el('div', { class: 'fe-side' });
    if (e.role) side.appendChild(el('span', { class: 'role-chip' }, 'Selfie TV Boss: ' + e.role));
    var cd = el('div', { class: 'countdown', 'aria-label': 'Countdown to the event' });
    ['Days', 'Hrs', 'Min', 'Sec'].forEach(function (u) { var d = el('div'); d.appendChild(el('b', null, '00')); d.appendChild(el('span', null, u)); cd.appendChild(d); });
    side.appendChild(cd);
    side.appendChild(el('p', { class: 'muted', style: 'margin:0;font-size:.9rem' }, 'Until doors open'));
    card.appendChild(side);

    var target = startOf(e).getTime();
    var nums = $$('b', cd);
    var upd = function () {
      var s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].forEach(function (v, i) { nums[i].textContent = String(v).padStart(2, '0'); });
    };
    upd(); setInterval(upd, 1000);
    return card;
  }

  function stub(e) {
    var d = dateOf(e);
    var s = el('article', { class: 'stub fade r3d' });
    var dt = el('div', { class: 'stub-date' });
    dt.appendChild(el('small', null, MONTHS[d.getMonth()]));
    dt.appendChild(el('b', null, String(d.getDate())));
    s.appendChild(dt);
    var info = el('div');
    info.appendChild(el('h3', null, e.title));
    info.appendChild(el('p', null, [d.toLocaleDateString('en-US', { weekday: 'long' }) + (e.time ? ' · ' + niceTime(e.time) : ''), [e.venue, e.city].filter(Boolean).join(', '), e.role ? 'Selfie TV Boss: ' + e.role : ''].filter(Boolean).join('  ·  ')));
    s.appendChild(info);
    s.appendChild(e.ticketUrl ? el('a', { class: 'btn', href: e.ticketUrl, target: '_blank', rel: 'noopener' }, 'Tickets') : el('a', { class: 'btn', href: 'book.html' }, 'Book'));
    return s;
  }

  function emptyEvents(box) {
    var c = el('div', { class: 'empty-card fade r3d' });
    c.appendChild(el('h3', null, 'New dates dropping soon'));
    c.appendChild(el('p', null, 'No public events announced right now. Want Selfie TV Boss at yours?'));
    c.appendChild(el('a', { class: 'btn btn-gold', href: 'book.html' }, 'Book Selfie TV Boss'));
    box.appendChild(c);
    observe(c);
  }

  var featureBox = $('[data-next-event]');
  var listBox = $('[data-event-list]');
  var tickerTrack = $('.ticker-track');
  if (featureBox || listBox || tickerTrack) {
    loadEvents().then(function (list) {
      if (tickerTrack) {
        var items = list.slice(0, 3).map(function (e) {
          var d = dateOf(e);
          return 'Next on air: ' + e.title + ' · ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (e.venue ? ' · ' + e.venue : '') + (e.city ? ', ' + e.city : '');
        });
        items = items.concat(['Hosting', 'DJ', 'Entertainment', 'Movie Acting', 'Promotions', 'Project Management', 'Now booking: ' + (SITE.phone || 'book online')]);
        var html = items.map(function (t) { return '<span></span>'; }).join('');
        tickerTrack.innerHTML = html + html;
        $$('span', tickerTrack).forEach(function (sp, i) { sp.textContent = items[i % items.length]; });
      }
      if (featureBox) {
        if (list.length) { var f = featureCard(list[0]); featureBox.appendChild(f); observe(f); }
        else emptyEvents(featureBox);
      }
      if (listBox) {
        var rest = featureBox ? list.slice(1) : list;
        if (!rest.length && !featureBox) emptyEvents(listBox);
        rest.forEach(function (e) { var s = stub(e); listBox.appendChild(s); observe(s); });
        var more = $('[data-more-events]');
        if (more) more.hidden = rest.length === 0;
      }
    });
  }

  // ---------- Gallery ----------
  var gal = $('[data-gallery]');
  if (gal) {
    var lb = $('.lightbox'), lbBody = $('.lightbox-body', lb);
    var mediaUrl = function (src) { return /^https?:\/\//.test(src) ? src : 'media/' + src; };
    var open = function (it) {
      lbBody.innerHTML = '';
      if (it.type === 'image') lbBody.appendChild(el('img', { src: mediaUrl(it.src), alt: it.caption || '' }));
      if (it.type === 'video') lbBody.appendChild(el('video', { src: mediaUrl(it.src), controls: '', autoplay: '', playsinline: '' }));
      if (it.type === 'youtube') {
        var a = el('a', { class: 'btn btn-gold', href: 'https://www.youtube.com/watch?v=' + encodeURIComponent(it.id), target: '_blank', rel: 'noopener', style: 'display:flex;max-width:320px;margin:0 auto' }, 'Watch on YouTube');
        lbBody.appendChild(a);
      }
      if (it.caption) lbBody.appendChild(el('p', null, it.caption));
      lb.hidden = false; document.body.style.overflow = 'hidden';
    };
    var close = function () { lb.hidden = true; lbBody.innerHTML = ''; document.body.style.overflow = ''; };
    $('.lightbox-close', lb).addEventListener('click', close);
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) close(); });

    var SLOTS = [['Stage shows', '4/5'], ['Behind the mic', '1/1'], ['On the decks', '3/4'], ['Red carpet', '4/5'], ['On set', '1/1'], ['The crowd', '4/5']];
    var SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.8 5.7a9 9 0 0 1 0 12.6"/></svg>';
    var SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

    // A video that plays right in the page (muted until the viewer turns sound on).
    var videoTile = function (it) {
      var t = el('figure', { class: 'tile video-tile fade r3d' });
      if (it.ratio) t.style.aspectRatio = it.ratio;
      var v = el('video', { muted: '', loop: '', playsinline: '', preload: 'metadata' });
      v.appendChild(el('source', { src: mediaUrl(it.src), type: 'video/mp4' }));
      if (it.webm) v.appendChild(el('source', { src: mediaUrl(it.webm), type: 'video/webm' }));
      if (it.poster) v.setAttribute('poster', mediaUrl(it.poster));
      v.muted = true;
      t.appendChild(v);
      var btn = el('button', { class: 'mute-btn', type: 'button', 'aria-label': 'Turn sound on', 'aria-pressed': 'false' });
      btn.innerHTML = SPEAKER_OFF;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        v.muted = !v.muted;
        if (!v.muted) { $$('.video-tile video').forEach(function (o) { if (o !== v) { o.muted = true; o.parentNode.querySelector('.mute-btn').innerHTML = SPEAKER_OFF; } }); v.play().catch(function () {}); }
        btn.innerHTML = v.muted ? SPEAKER_OFF : SPEAKER_ON;
        btn.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Mute');
        btn.setAttribute('aria-pressed', String(!v.muted));
      });
      t.appendChild(btn);
      var pp = el('button', { class: 'pp-btn', type: 'button', 'aria-label': 'Pause video' });
      var PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1.4"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.4"/></svg>';
      var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>';
      pp.innerHTML = PAUSE;
      var sync = function () { pp.innerHTML = v.paused ? PLAY : PAUSE; pp.setAttribute('aria-label', v.paused ? 'Play video' : 'Pause video'); };
      pp.addEventListener('click', function (e) { e.stopPropagation(); if (v.paused) v.play().catch(function () {}); else v.pause(); });
      v.addEventListener('play', sync); v.addEventListener('pause', sync);
      v.addEventListener('click', function () { if (v.paused) v.play().catch(function () {}); else v.pause(); });
      t.appendChild(pp);
      if (it.caption) t.appendChild(el('figcaption', null, it.caption));
      // Play only while on screen, to save data and battery.
      if ('IntersectionObserver' in window && !reduceMotion) {
        new IntersectionObserver(function (en) {
          en.forEach(function (x) { if (x.isIntersecting) v.play().catch(function () {}); else v.pause(); });
        }, { threshold: 0.35 }).observe(t);
      }
      return t;
    };

    var mediaTile = function (it) {
      if (it.type === 'video') return videoTile(it);
      var t = el('button', { class: 'tile fade r3d tilt', type: 'button', 'aria-label': it.caption || 'Open' });
      var src = it.type === 'image' ? mediaUrl(it.src) : 'https://i.ytimg.com/vi/' + encodeURIComponent(it.id) + '/hqdefault.jpg';
      t.appendChild(el('img', { src: src, alt: it.caption || '', loading: 'lazy' }));
      if (it.type !== 'image') t.appendChild(el('span', { class: 'play', 'aria-hidden': 'true' }, '▶'));
      if (it.caption) t.appendChild(el('figcaption', null, it.caption));
      t.addEventListener('click', function () { open(it); });
      return t;
    };

    var soonTile = function (name, ar) {
      var t = el('div', { class: 'tile soon fade r3d tilt', style: '--ar:' + ar });
      var inner = el('div');
      inner.appendChild(el('b', null, name));
      inner.appendChild(el('span', null, 'Photos coming soon'));
      t.appendChild(inner);
      return t;
    };

    var render = function (items) {
      items = (items || []).filter(function (i) { return /^(image|video|youtube)$/.test(i.type); });
      var used = [];
      // Each named slot shows its media if there is one, otherwise a "coming soon" card.
      SLOTS.forEach(function (sl) {
        var mine = items.filter(function (i) { return i.slot === sl[0]; });
        if (!mine.length) { var e = soonTile(sl[0], sl[1]); gal.appendChild(e); observe(e); return; }
        mine.forEach(function (it) { used.push(it); var t = mediaTile(it); gal.appendChild(t); observe(t); });
      });
      items.forEach(function (it) { if (used.indexOf(it) < 0) { var t = mediaTile(it); gal.appendChild(t); observe(t); } });
    };
    fetch('media/gallery.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(render)
      .catch(function () { render([]); });
  }

  // ---------- Booking form ----------
  var form = $('#booking-form');
  if (form) {
    var pre = new URLSearchParams(location.search).get('service');
    if (pre) { var box = $('input[name="services"][value="' + pre + '"]', form); if (box) box.checked = true; }
    var status = $('.form-status', form);
    var say = function (m, c) { status.textContent = m; status.className = 'form-status ' + (c || ''); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form), body = {};
      data.forEach(function (v, k) { if (k !== 'services') body[k] = v; });
      body.services = data.getAll('services');
      if (!body.services.length) return say('Pick at least one service.', 'err');
      if (!body.name.trim()) return say('Add your name so we know who to call.', 'err');
      if (!body.phone.trim() && !body.email.trim()) return say('Add a phone number or email so we can reach you.', 'err');
      var btn = $('button[type="submit"]', form);
      btn.disabled = true; say('Sending…');
      fetch('api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || 'That didn\'t go through.');
          form.reset(); say('Request sent. Selfie TV Boss will be in touch soon.', 'ok');
        })
        .catch(function (err) { say(err.message + (SITE.phone ? ' You can also call ' + SITE.phone + '.' : ''), 'err'); })
        .then(function () { btn.disabled = false; });
    });
  }

  // ==========================================================
  //  Motion layer (all of it switches off for reduced motion)
  // ==========================================================

  // Headings rise in word by word.
  function splitWords(node) {
    var i = 0;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var wm = el('span', { class: 'wm' });
            var w = el('span', { style: '--i:' + (i++) }, part);
            wm.appendChild(w); frag.appendChild(wm);
          });
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
      });
    })(node);
  }
  $$('h2.split').forEach(function (h) {
    if (reduceMotion) return;
    var label = h.textContent;
    splitWords(h);
    h.setAttribute('aria-label', label.replace(/\s+/g, ' ').trim());
    observe(h);
  });
  $$('.split:not(h2)').forEach(observe);

  // Scroll-driven effects share one rAF loop.
  var scrollers = [];
  var progressBar = el('div', { class: 'progress', 'aria-hidden': 'true' });
  document.body.appendChild(progressBar);
  scrollers.push(function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
  });

  // Statement lights up word by word as it scrolls through the screen.
  $$('[data-lit]').forEach(function (p) {
    if (reduceMotion) return;
    var words = [];
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = el('span', { class: 'w' }, part); words.push(w); frag.appendChild(w);
          });
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(p);
    scrollers.push(function () {
      var r = p.getBoundingClientRect(), vh = window.innerHeight;
      var prog = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.25)));
      var lit = Math.round(prog * words.length);
      words.forEach(function (w, i) { w.classList.toggle('on', i < lit); });
    });
  });

  // Channels slide sideways while the section is pinned.
  $$('[data-hscroll]').forEach(function (sec) {
    var track = $('.hs-track', sec), bar = $('.hs-progress i', sec), sticky = $('.hs-sticky', sec);
    if (reduceMotion) { sec.classList.add('static-mode'); return; }
    var distance = 0;
    var size = function () {
      distance = Math.max(0, track.scrollWidth - window.innerWidth);
      sec.style.height = (sticky.offsetHeight + distance) + 'px';
    };
    size();
    window.addEventListener('resize', size);
    window.addEventListener('load', size);
    scrollers.push(function () {
      var r = sec.getBoundingClientRect();
      var prog = distance ? Math.min(1, Math.max(0, -r.top / distance)) : 0;
      track.style.transform = 'translate3d(' + (-prog * distance) + 'px,0,0)';
      if (bar) bar.style.transform = 'scaleX(' + prog + ')';
    });
  });

  // Hero: smooth (eased) scroll parallax + 3D tilt toward the pointer.
  var hero = $('.hero');
  if (hero && !reduceMotion) {
    var boss = $('.boss', hero), copy = $('.hero-copy', hero), word = $('.hero-word', hero), stage = $('.stage3d', hero);
    var sy = window.scrollY, hx = 0, hy = 0, thx = 0, thy = 0, heroRunning = false;
    var fine = window.matchMedia('(pointer: fine)').matches;
    if (fine && stage) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        thy = ((e.clientX - r.left) / r.width - 0.5) * 16;
        thx = -((e.clientY - r.top) / r.height - 0.5) * 9;
        kickHero();
      });
      hero.addEventListener('pointerleave', function () { thx = thy = 0; kickHero(); });
    }
    var heroFrame = function () {
      var target = Math.min(window.scrollY, hero.offsetHeight);
      sy += (target - sy) * 0.12;
      if (fine) { hx += (thx - hx) * 0.08; hy += (thy - hy) * 0.08; }
      var p = sy / hero.offsetHeight;
      if (boss) { boss.style.translate = '0 ' + (sy * 0.12).toFixed(1) + 'px'; boss.style.scale = (1 + p * 0.12).toFixed(4); }
      if (copy) { copy.style.transform = 'translate3d(0,' + (-sy * 0.18).toFixed(1) + 'px,0)'; copy.style.opacity = String(Math.max(0, 1 - p * 1.1)); }
      if (word) word.style.translate = (-sy * 0.5).toFixed(1) + 'px 0';
      if (stage && fine) { stage.style.setProperty('--hx', (hx + p * 10).toFixed(2) + 'deg'); stage.style.setProperty('--hy', hy.toFixed(2) + 'deg'); }
      if (Math.abs(target - sy) > 0.3 || Math.abs(thx - hx) > 0.02 || Math.abs(thy - hy) > 0.02) requestAnimationFrame(heroFrame);
      else heroRunning = false;
    };
    var kickHero = function () { if (!heroRunning) { heroRunning = true; requestAnimationFrame(heroFrame); } };
    window.addEventListener('scroll', kickHero, { passive: true });
    kickHero();
  }

  // Channels turn toward the centre like a 3D carousel as they slide past.
  $$('.hs-track').forEach(function (track) {
    if (reduceMotion) return;
    var cards = $$('.ch', track);
    scrollers.push(function () {
      var mid = window.innerWidth / 2;
      cards.forEach(function (c) {
        var r = c.getBoundingClientRect();
        var d = Math.max(-1.4, Math.min(1.4, (r.left + r.width / 2 - mid) / (window.innerWidth * 0.55)));
        c.style.setProperty('--cy', (-d * 28).toFixed(2) + 'deg');
        c.style.setProperty('--cz', (-Math.abs(d) * 140).toFixed(1) + 'px');
        c.style.opacity = String(1 - Math.min(0.45, Math.abs(d) * 0.35));
      });
    });
  });

  var ticking = false;
  function runScrollers() { ticking = false; scrollers.forEach(function (f) { f(); }); }
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(runScrollers); } }
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  runScrollers();

  // Cards tilt toward the pointer (mouse and trackpad only).
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    $$('.tilt').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--tx', ((0.5 - y) * 12).toFixed(2) + 'deg');
        card.style.setProperty('--ty', ((x - 0.5) * 14).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (x * 100) + '%');
        card.style.setProperty('--my', (y * 100) + '%');
      });
      card.addEventListener('pointerleave', function () { card.style.setProperty('--tx', '0deg'); card.style.setProperty('--ty', '0deg'); });
    });
    // Gold buttons lean toward the cursor.
    $$('.btn-gold').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.translate = ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px';
      });
      b.addEventListener('pointerleave', function () { b.style.translate = ''; });
    });
  }

  // 3D flip-up entrance for cards, events and gallery tiles.
  $$('.svc-row.fade, .stub, .value.fade, .tile, .feature-event, .empty-card, .form.fade, .contact-card.fade, .arch').forEach(function (n) {
    if (!n.classList.contains('arch')) n.classList.add('r3d');
  });

  // Spinning vinyl on every booking banner.
  $$('.cta-band').forEach(function (band, i) {
    var v = el('div', { class: 'vinyl' + (i % 2 ? ' left' : ''), 'aria-hidden': 'true' });
    v.innerHTML = '<div class="disc"><div class="spin"></div><span class="label">STB</span></div>';
    band.insertBefore(v, band.firstChild);
  });

  // Floating stage dust in the hero: soft gold, amethyst and aqua specks in 3D.
  var canvas = $('.sparkles');
  if (canvas && !reduceMotion && canvas.getContext) {
    var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var COLORS = ['244,220,156', '196,181,253', '153,246,228', '244,220,156'];
    var sprites = COLORS.map(function (c) {
      var s = document.createElement('canvas'); s.width = s.height = 64;
      var g = s.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(' + c + ',1)'); grd.addColorStop(0.25, 'rgba(' + c + ',.55)'); grd.addColorStop(1, 'rgba(' + c + ',0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return s;
    });
    var N = window.innerWidth < 700 ? 45 : 80, parts = [];
    var rand = function (a, b) { return a + Math.random() * (b - a); };
    for (var i = 0; i < N; i++) parts.push({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.15, 1), vy: rand(0.0006, 0.0018), ph: rand(0, 6.28), c: i % sprites.length });
    var mx = 0, my = 0, tmx = 0, tmy = 0;
    window.addEventListener('pointermove', function (e) { tmx = e.clientX / window.innerWidth - 0.5; tmy = e.clientY / window.innerHeight - 0.5; }, { passive: true });
    var size = function () { var r = canvas.getBoundingClientRect(); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; };
    size(); window.addEventListener('resize', size);
    var onScreen = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; if (onScreen) requestAnimationFrame(draw); }).observe(canvas);
    var t0 = performance.now();
    function draw(now) {
      if (!onScreen) return;
      var t = (now - t0) / 1000;
      mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      var scroll = Math.min(window.scrollY, H) / H;
      parts.forEach(function (p) {
        p.y -= p.vy; if (p.y < -1.1) { p.y = 1.1; p.x = rand(-1, 1); }
        var depth = 1 / (p.z * 1.6 + 0.4);
        var x = W / 2 + (p.x + Math.sin(t * 0.6 + p.ph) * 0.03 - mx * 0.25 * depth) * W * 0.6 * depth * 0.6;
        var y = H / 2 + (p.y - my * 0.2 * depth + scroll * 0.6 * depth) * H * 0.6 * depth * 0.6;
        var r = (2 + 10 * (1 - p.z)) * (0.8 + 0.2 * Math.sin(t * 2 + p.ph));
        ctx.globalAlpha = 0.25 + 0.6 * (1 - p.z);
        ctx.drawImage(sprites[p.c], x - r, y - r, r * 2, r * 2);
      });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  // ---------- Stat count-up (numbers are already correct at rest) ----------
  $$('[data-count]').forEach(function (n) {
    if (reduceMotion || !io) return;
    var target = Number(n.dataset.count), started = false;
    var o = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting || started) return;
      started = true; o.disconnect();
      var t0 = performance.now();
      (function step(t) {
        var p = Math.min((t - t0) / 1400, 1);
        n.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + (n.dataset.suffix || '');
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
    o.observe(n);
  });
})();
