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

  // ---------- Channel-change flash between pages ----------
  var zap = el('div', { class: 'static', 'aria-hidden': 'true' });
  document.body.appendChild(zap);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    var href = a.getAttribute('href');
    if (!/^[\w-]+\.html(\?[^#]*)?(#.*)?$/.test(href)) return;
    e.preventDefault();
    zap.classList.add('on');
    setTimeout(function () { window.location.href = href; }, 280);
  });
  window.addEventListener('pageshow', function () { zap.classList.remove('on'); });

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
    var card = el('article', { class: 'feature-event fade' });
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
    var s = el('article', { class: 'stub fade' });
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
    var c = el('div', { class: 'empty-card' });
    c.appendChild(el('h3', null, 'New dates dropping soon'));
    c.appendChild(el('p', null, 'No public events announced right now. Want Selfie TV Boss at yours?'));
    c.appendChild(el('a', { class: 'btn btn-gold', href: 'book.html' }, 'Book Selfie TV Boss'));
    box.appendChild(c);
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

    var soon = function () {
      ['4/5', '1/1', '3/4', '4/5', '1/1', '4/5'].forEach(function (ar, i) {
        var t = el('div', { class: 'tile soon fade', style: '--ar:' + ar });
        var inner = el('div');
        inner.appendChild(el('b', null, ['Stage shows', 'Behind the mic', 'On the decks', 'Red carpet', 'On set', 'The crowd'][i]));
        inner.appendChild(el('span', null, 'Photos coming soon'));
        t.appendChild(inner);
        gal.appendChild(t); observe(t);
      });
    };
    fetch('media/gallery.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (items) {
        items = (items || []).filter(function (i) { return /^(image|video|youtube)$/.test(i.type); });
        if (!items.length) return soon();
        items.forEach(function (it) {
          var t = el('button', { class: 'tile fade', type: 'button', 'aria-label': it.caption || 'Open' });
          var src = it.type === 'image' ? mediaUrl(it.src) : it.type === 'video' ? (it.poster ? mediaUrl(it.poster) : '') : 'https://i.ytimg.com/vi/' + encodeURIComponent(it.id) + '/hqdefault.jpg';
          if (src) t.appendChild(el('img', { src: src, alt: it.caption || '', loading: 'lazy' }));
          else t.appendChild(el('video', { src: mediaUrl(it.src) + '#t=0.5', muted: '', preload: 'metadata', playsinline: '' }));
          if (it.type !== 'image') t.appendChild(el('span', { class: 'play', 'aria-hidden': 'true' }, '▶'));
          if (it.caption) t.appendChild(el('figcaption', null, it.caption));
          t.addEventListener('click', function () { open(it); });
          gal.appendChild(t); observe(t);
        });
      })
      .catch(soon);
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
