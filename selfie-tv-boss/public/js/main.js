(function () {
  'use strict';
  var SITE = window.SITE || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---- Nav ----
  var nav = $('.nav');
  var toggle = $('.nav-toggle');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 20); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
  $$('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // ---- Contact details from site-config.js ----
  var telHref = SITE.phone ? 'tel:' + SITE.phone.replace(/[^\d+]/g, '') : '';
  $$('.js-call').forEach(function (a) { if (telHref) a.href = telHref; });
  var contactLinks = {
    phone: SITE.phone && { href: telHref, text: SITE.phone },
    whatsapp: SITE.whatsapp && { href: 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent('Hi Selfie TV Boss, I want to book you for an event!'), text: 'Chat now' },
    email: SITE.email && { href: 'mailto:' + SITE.email, text: SITE.email },
  };
  $$('[data-contact]').forEach(function (el) {
    var c = contactLinks[el.dataset.contact];
    if (!c) { el.remove(); return; }
    el.href = c.href;
    $('em', el).textContent = c.text;
  });
  $$('[data-contact-text]').forEach(function (el) { el.textContent = SITE[el.dataset.contactText] || ''; });
  var socials = $('#socials');
  Object.keys(SITE.social || {}).forEach(function (name) {
    if (!SITE.social[name]) return;
    var a = document.createElement('a');
    a.href = SITE.social[name];
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    socials.appendChild(a);
  });
  $('#year').textContent = new Date().getFullYear();

  // ---- Media fallbacks (before real photos/videos are added) ----
  var heroVideo = $('.hero-video');
  if (heroVideo) {
    var source = $('source', heroVideo);
    source.addEventListener('error', function () { heroVideo.remove(); });
    if (heroVideo.networkState === 3) heroVideo.remove(); // already failed: no hero.mp4 yet
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) heroVideo.removeAttribute('autoplay');
  }
  $$('img[data-fallback]').forEach(function (img) {
    function swap() {
      var ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = img.dataset.fallback;
      img.replaceWith(ph);
    }
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener('error', swap);
  });

  // ---- Gallery ----
  var grid = $('#gallery-grid');
  var lightbox = $('#lightbox');
  var lbBody = $('.lightbox-body', lightbox);

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text) e.textContent = text;
    return e;
  }
  function mediaUrl(src) { return /^https?:\/\//.test(src) ? src : '/media/' + src; }

  function showPlaceholders() {
    for (var i = 0; i < 6; i++) {
      var t = el('div', { class: 'tile empty' });
      var inner = el('div');
      inner.appendChild(el('b', null, 'Coming Soon'));
      inner.appendChild(document.createTextNode('Photos & videos on the way'));
      t.appendChild(inner);
      grid.appendChild(t);
    }
  }

  function openLightbox(item) {
    lbBody.innerHTML = '';
    if (item.type === 'image') {
      lbBody.appendChild(el('img', { src: mediaUrl(item.src), alt: item.caption || '' }));
    } else if (item.type === 'video') {
      var v = el('video', { src: mediaUrl(item.src), controls: '', autoplay: '', playsinline: '' });
      lbBody.appendChild(v);
    } else if (item.type === 'youtube') {
      lbBody.appendChild(el('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(item.id) + '?autoplay=1',
        allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: '', title: item.caption || 'Video',
      }));
    }
    if (item.caption) lbBody.appendChild(el('p', null, item.caption));
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lbBody.innerHTML = '';
    document.body.style.overflow = '';
  }
  $('.lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lightbox.hidden) closeLightbox(); });

  fetch('/media/gallery.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (items) {
      items = (items || []).filter(function (i) { return i.type === 'image' || i.type === 'video' || i.type === 'youtube'; });
      if (!items.length) return showPlaceholders();
      items.forEach(function (item) {
        var tile = el('button', { class: 'tile reveal', type: 'button', 'aria-label': item.caption || 'Open media' });
        var thumb;
        if (item.type === 'image') thumb = el('img', { src: mediaUrl(item.src), alt: item.caption || '', loading: 'lazy' });
        else if (item.type === 'video') thumb = item.poster
          ? el('img', { src: mediaUrl(item.poster), alt: item.caption || '', loading: 'lazy' })
          : el('video', { src: mediaUrl(item.src) + '#t=0.5', muted: '', preload: 'metadata', playsinline: '' });
        else thumb = el('img', { src: 'https://i.ytimg.com/vi/' + encodeURIComponent(item.id) + '/hqdefault.jpg', alt: item.caption || '', loading: 'lazy' });
        tile.appendChild(thumb);
        if (item.type !== 'image') tile.appendChild(el('span', { class: 'play', 'aria-hidden': 'true' }, '▶'));
        if (item.caption) tile.appendChild(el('figcaption', null, item.caption));
        tile.addEventListener('click', function () { openLightbox(item); });
        grid.appendChild(tile);
        observe(tile);
      });
    })
    .catch(showPlaceholders);

  // ---- "Book this" buttons pre-select the service ----
  var form = $('#booking-form');
  function preselect(service) {
    var box = $('input[name="services"][value="' + service + '"]', form);
    if (box) box.checked = true;
  }
  $$('[data-service]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      preselect(btn.dataset.service);
      if (btn.tagName === 'BUTTON') {
        e.preventDefault();
        $('#book').scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
  var fromUrl = new URLSearchParams(location.search).get('service');
  if (fromUrl) preselect(fromUrl);

  // ---- Booking form ----
  var statusEl = $('.form-status', form);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var payload = {};
    data.forEach(function (v, k) { if (k !== 'services') payload[k] = v; });
    payload.services = data.getAll('services');

    if (!payload.services.length) return setStatus('Please pick at least one service.', 'err');
    if (!payload.name.trim()) return setStatus('Please add your name.', 'err');
    if (!payload.phone.trim() && !payload.email.trim()) return setStatus('Please add a phone number or email so we can reach you.', 'err');

    var btn = $('button[type="submit"]', form);
    btn.disabled = true;
    setStatus('Sending…', '');
    fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || 'Something went wrong.');
        form.reset();
        setStatus('🎉 Request sent! Selfie TV Boss will be in touch soon.', 'ok');
      })
      .catch(function (err) {
        setStatus(err.message + (SITE.phone ? ' You can also call ' + SITE.phone + '.' : ''), 'err');
      })
      .then(function () { btn.disabled = false; });
  });
  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'form-status ' + cls;
  }

  // ---- Reveal on scroll + stat counters ----
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      $$('[data-count]', entry.target).forEach(countUp);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.15 }) : null;
  function observe(node) { if (io) io.observe(node); else node.classList.add('in'); }
  $$('.reveal').forEach(observe);

  function countUp(node) {
    var target = Number(node.dataset.count);
    var start = performance.now();
    (function tick(now) {
      var p = Math.min((now - start) / 1200, 1);
      node.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }
})();
