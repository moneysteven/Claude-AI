// Money Muss Restaurant & Lounge: page behaviour.
// Everything here is an enhancement. With scripts off, the page still shows all its content.

import { menuHTML, specialsHTML } from './templates.js';

const root = document.documentElement;
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const mouse = matchMedia('(hover: hover) and (pointer: fine)');
const PHONE_LABEL = '(876) 438-6209';
const PHONE_HREF = 'tel:+18764386209';

let lenis = null;

/* ------------------------------------------------------------------ logo intro */

function runIntro() {
  const intro = $('#intro');
  if (!intro) return;
  if (!root.classList.contains('intro-on')) { intro.remove(); return; }

  const logo = $('#intro-logo');
  const mark = $('#nav-mark');
  const still = root.classList.contains('intro-fade');     // reduced motion: no drawing, no travel
  const timers = [];
  let leaving = false;

  window.__mmIntroRunning = true;                          // tells the safety net in <head> that we have it
  root.classList.add('intro-armed');

  const cleanUp = () => {
    timers.forEach(clearTimeout);
    root.classList.remove('intro-on', 'intro-play', 'intro-fade', 'intro-armed');
    intro.remove();
    off();
  };
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const leave = () => {
    if (leaving) return;
    leaving = true;
    if (still) {
      root.classList.remove('intro-armed');
      intro.classList.add('is-leaving');
      later(cleanUp, 660);
      return;
    }
    // One move: from the middle of the screen into the mark's spot in the nav.
    const to = mark.getBoundingClientRect();
    const from = logo.getBoundingClientRect();
    logo.style.setProperty('--to-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    logo.style.setProperty('--to-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    logo.style.setProperty('--to-s', String(to.width / from.width));
    mark.style.opacity = '0';
    intro.classList.add('is-leaving');
    later(() => root.classList.remove('intro-armed'), 280);          // the nav fades in under the travelling logo
    later(() => { mark.style.opacity = ''; intro.classList.add('is-landed'); }, 730);
    later(cleanUp, 960);
  };

  const skip = () => {
    if (leaving) return;
    leaving = true;
    timers.forEach(clearTimeout);
    root.classList.remove('intro-armed');
    intro.classList.add('is-skipped', 'is-leaving');
    later(cleanUp, 260);
  };

  // The page underneath stays readable to screen readers throughout. Any key that shows
  // someone wants to get on with it, Tab included, clears the intro at once.
  const onKey = (e) => {
    if (e.key === 'Tab') { skip(); return; }
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); }
  };
  const opts = { passive: true };
  const off = () => {
    intro.removeEventListener('click', skip);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('wheel', skip, opts);
    window.removeEventListener('touchmove', skip, opts);
  };
  intro.addEventListener('click', skip);
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', skip, opts);
  window.addEventListener('touchmove', skip, opts);

  later(leave, still ? 800 : 1960);
}

/* ------------------------------------------------------------------ smooth scrolling */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initSmoothScroll() {
  // Lenis glides wheel and trackpad scrolling. Phones and tablets keep their own native
  // touch scrolling, and anyone who asks for reduced motion gets plain scrolling.
  if (calm.matches || !mouse.matches) return;
  try {
    await loadScript(root.dataset.lenisSrc || new URL('./vendor/lenis.min.js', import.meta.url).href);
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, autoRaf: true });
    calm.addEventListener('change', () => { if (calm.matches && lenis) { lenis.destroy(); lenis = null; } });
  } catch (e) {
    lenis = null;   // the page scrolls natively if the file cannot load
  }
}

function navHeight() {
  const bar = $('.nav__bar');
  return bar ? Math.round(bar.getBoundingClientRect().bottom) : 72;
}

function goTo(target) {
  const offset = target.classList.contains('scene') ? 0 : -(navHeight() + 16);
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.1 });
  } else {
    const top = target.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top, behavior: calm.matches ? 'auto' : 'smooth' });
  }
  // Move keyboard focus with the jump, without scrolling again.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

function initAnchors() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const id = link.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    const sheet = $('#sheet');
    if (sheet && sheet.open) closeSheet(true);
    goTo(target);
    try { history.pushState(null, '', `#${id}`); } catch (err) { /* some embedded viewers do not allow it */ }
  });
}

/* ------------------------------------------------------------------ nav */

let sheetBusy = false;

function openSheet() {
  const sheet = $('#sheet');
  const toggle = $('#nav-toggle');
  if (!sheet || sheet.open) return;
  sheet.classList.remove('is-closing');
  sheet.showModal();
  if (lenis) lenis.stop();
  toggle.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
}

function closeSheet(instant = false) {
  const sheet = $('#sheet');
  const toggle = $('#nav-toggle');
  if (!sheet || !sheet.open || sheetBusy) return;
  const done = () => {
    sheetBusy = false;
    sheet.classList.remove('is-open', 'is-closing');
    sheet.close();
    if (lenis) lenis.start();
    toggle.setAttribute('aria-expanded', 'false');
  };
  if (instant || calm.matches) { done(); return; }
  sheetBusy = true;
  sheet.classList.add('is-closing');
  sheet.classList.remove('is-open');
  setTimeout(done, 200);
}

function initNav() {
  const sheet = $('#sheet');
  const toggle = $('#nav-toggle');
  if (sheet && toggle && typeof sheet.showModal === 'function') {
    toggle.addEventListener('click', openSheet);
    $('#sheet-close').addEventListener('click', () => closeSheet());
    sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });   // Esc
    matchMedia('(min-width: 1000px)').addEventListener('change', (e) => { if (e.matches) closeSheet(true); });
  } else if (toggle) {
    toggle.hidden = true;
  }

  // Underline the nav link for the section in view.
  const links = $$('.nav__links a');
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  if (!('IntersectionObserver' in window) || !links.length) return;
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const owner = entry.target.dataset.nav || entry.target.id;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const hit = byId.get(owner);
      if (hit) hit.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section').forEach((s) => spy.observe(s));
}

/* ------------------------------------------------------------------ reveal on entering view */

let revealer = null;

function armReveals(scope = document) {
  const items = $$('.reveal', scope).filter((el) => !el.dataset.seen);
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) return;
  if (!revealer) {
    revealer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove('is-waiting');
        revealer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
  }
  const fold = window.innerHeight * 0.94;
  const groups = new Map();
  for (const el of items) {
    el.dataset.seen = '1';
    if (el.getBoundingClientRect().top < fold) continue;      // already on screen: never hide it
    // Siblings arrive a beat apart, with shrinking gaps.
    const n = groups.get(el.parentElement) || 0;
    groups.set(el.parentElement, n + 1);
    el.style.setProperty('--reveal-delay', `${[0, 70, 120, 160][Math.min(n, 3)]}ms`);
    el.classList.add('is-waiting');
    revealer.observe(el);
  }
}

/* ------------------------------------------------------------------ menu tabs */

function initTabs(scope) {
  const bar = $('.tabs', scope);
  const list = $('.tabs__list', scope);
  if (!bar || !list) return;
  const tabs = $$('.tabs__tab', list);
  const panels = $$('.menu-panel', scope);
  if (!tabs.length || tabs.length !== panels.length) return;

  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Menu');
  tabs.forEach((tab, i) => {
    const key = tab.dataset.tab;
    tab.id = `tab-${key}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].setAttribute('tabindex', '0');
  });

  const select = (index, { focus = false, animate = true } = {}) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].classList.toggle('is-active', on);
      panels[i].classList.remove('is-entering');
    });
    // Arrow-key moves land at once; clicks get the short slide.
    bar.classList.toggle('tabs--snap', !animate);
    list.style.setProperty('--i', String(index));
    if (animate && !calm.matches) {
      void panels[index].offsetWidth;
      panels[index].classList.add('is-entering');
    }
    if (focus) tabs[index].focus();
  };

  list.addEventListener('click', (e) => {
    const tab = e.target.closest('.tabs__tab');
    if (tab) select(tabs.indexOf(tab));
  });
  list.addEventListener('keydown', (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const move = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (move === undefined) return;
    e.preventDefault();
    select((move + tabs.length) % tabs.length, { focus: true, animate: false });
  });
  select(Math.max(0, tabs.findIndex((t) => t.classList.contains('is-active'))), { animate: false });
}

/* ------------------------------------------------------------------ menu + specials from the data files */

const cleanHTML = (el) => {
  const copy = el.cloneNode(true);
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  return copy.innerHTML.replace(/\s+/g, ' ').trim();
};

const builtCopy = new WeakMap();      // what index.html shipped with, before any script touched it

async function refreshFromData(el, render, after) {
  if (!el) return;
  try {
    const res = await fetch(el.dataset.src, { cache: 'no-cache' });
    if (!res.ok) return;
    const html = render(await res.json());
    const probe = document.createElement('div');
    probe.innerHTML = html;
    // Only redraw when the data file has changed since the page was built.
    if (builtCopy.get(el) === cleanHTML(probe)) return;
    el.innerHTML = html;
    after(el);
  } catch (e) {
    /* offline or opened straight from disk: the built-in copy stays */
  }
}

function initData() {
  const menu = $('#menu-root');
  const specials = $('#specials-root');
  if (menu) { builtCopy.set(menu, cleanHTML(menu)); initTabs(menu); }
  if (specials) builtCopy.set(specials, cleanHTML(specials));
  refreshFromData(menu, menuHTML, (el) => initTabs(el));
  refreshFromData(specials, specialsHTML, (el) => armReveals(el));
}

/* ------------------------------------------------------------------ photo viewer */

function initLightbox() {
  const box = $('#lightbox');
  const track = $('#lightbox-track');
  const tiles = $$('[data-open]');
  if (!box || !track || !tiles.length || typeof box.showModal !== 'function') return;
  const count = $('#lightbox-count');
  const prev = $('#lightbox-prev');
  const next = $('#lightbox-next');
  let names = [];
  let busy = false;

  const build = () => {
    names = [];
    track.textContent = '';
    for (const tile of tiles) {
      const name = tile.dataset.open;
      if (names.includes(name)) continue;
      // Prefer the uncropped view of each photo.
      const source = tiles.find((t) => t.dataset.open === name && !$('.photo--zoom', t)) || tile;
      const media = $('picture, .stand-in', source);
      if (!media) continue;
      names.push(name);
      const clone = media.cloneNode(true);
      clone.removeAttribute('style');
      const img = $('img', clone);
      if (img) {
        img.classList.remove('photo', 'photo--zoom');
        img.removeAttribute('style');
        img.loading = 'lazy';
        img.decoding = 'async';
        // Tell the browser how wide the photo will really be shown, so it fetches the right file.
        const ratio = (Number(img.getAttribute('width')) || 3) / (Number(img.getAttribute('height')) || 4);
        const shown = Math.ceil(Math.min(window.innerWidth - 32, (window.innerHeight - 144) * ratio));
        $$('source, img', clone).forEach((n) => n.setAttribute('sizes', `${Math.max(240, shown)}px`));
      }
      const slide = document.createElement('div');
      slide.className = 'slide';
      const holder = document.createElement('div');
      holder.className = 'slide__media';
      holder.appendChild(clone);
      slide.appendChild(holder);
      track.appendChild(slide);
    }
  };

  const index = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const sync = () => {
    const i = index();
    count.textContent = `${i + 1} / ${names.length}`;
    prev.disabled = i <= 0;
    next.disabled = i >= names.length - 1;
  };
  const go = (i, smooth) => {
    const to = Math.max(0, Math.min(names.length - 1, i));
    track.scrollTo({ left: to * track.clientWidth, behavior: smooth && !calm.matches ? 'smooth' : 'auto' });
  };

  const open = (name) => {
    if (box.open) return;
    if (!track.children.length) build();
    box.classList.remove('is-closing');
    box.showModal();
    if (lenis) lenis.stop();
    go(Math.max(0, names.indexOf(name)), false);
    sync();
    requestAnimationFrame(() => box.classList.add('is-open'));
  };
  const close = () => {
    if (!box.open || busy) return;
    const done = () => {
      busy = false;
      box.classList.remove('is-open', 'is-closing');
      box.close();
      if (lenis) lenis.start();
    };
    if (calm.matches) { done(); return; }
    busy = true;
    box.classList.add('is-closing');
    box.classList.remove('is-open');
    setTimeout(done, 170);
  };

  tiles.forEach((tile) => tile.addEventListener('click', () => open(tile.dataset.open)));
  $('#lightbox-close').addEventListener('click', close);
  prev.addEventListener('click', () => go(index() - 1, true));
  next.addEventListener('click', () => go(index() + 1, true));
  box.addEventListener('cancel', (e) => { e.preventDefault(); close(); });                 // Esc
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index() - 1, false); }             // keys land at once
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index() + 1, false); }
  });
  // A tap on the dark space around a photo closes the viewer.
  track.addEventListener('click', (e) => { if (!e.target.closest('img, .stand-in')) close(); });
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; sync(); });
  }, { passive: true });
  window.addEventListener('resize', () => { if (box.open) go(index(), false); });
}

/* ------------------------------------------------------------------ enquiry form + WhatsApp */

const digits = (v) => String(v || '').replace(/\D/g, '');

function enquiryText(data) {
  return [
    'Hello Money Muss, I would like to book a function.',
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    data.email ? `Email: ${data.email}` : '',
    `Date: ${data.date}`,
    `Guests: ${data.guests}`,
    `Type of event: ${data.type}`,
    data.message ? `Message: ${data.message}` : '',
  ].filter(Boolean).join('\n');
}

async function initEnquiry() {
  const form = $('#enquiry');
  const wa = $('#wa-button');
  const pending = $('#wa-pending');
  if (!form) return;
  const status = $('#form-status');
  const send = $('.form__send', form);

  let site = {};
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache' });
    if (res.ok) site = await res.json();
  } catch (e) { /* keep the unconfigured state */ }
  const number = digits(site.whatsappNumber);
  const email = String(site.enquiryEmail || '').trim();
  const endpoint = String(site.formEndpoint || '').trim();

  // WhatsApp button: live only once a number has been supplied.
  if (wa) {
    if (number) {
      wa.href = `https://wa.me/${number}?text=${encodeURIComponent('Hello Money Muss, I would like to ask about booking an event.')}`;
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.removeAttribute('aria-disabled');
      wa.removeAttribute('role');
    } else {
      wa.addEventListener('click', (e) => e.preventDefault());
    }
  }
  if (pending) {
    const missing = [!number && 'WhatsApp number', !email && 'email for enquiries'].filter(Boolean);
    if (!missing.length) pending.hidden = true;
    else $('.todo', pending).textContent = `[Owner to fill in: ${missing.join(' and ')}]`;
  }

  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  form.elements.date.min = iso;

  const rules = {
    name: (v) => (v.trim().length >= 2 ? '' : 'Enter your name.'),
    phone: (v) => (digits(v).length >= 7 ? '' : 'Enter a phone number we can reach you on, with at least 7 digits.'),
    email: (v) => (!v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Check the email address. It should look like name@example.com.'),
    date: (v) => (!v ? 'Choose the date of your event.' : v < iso ? 'Choose a date from today onwards.' : ''),
    guests: (v) => (/^\d+$/.test(v.trim()) && Number(v) >= 1 ? '' : 'Enter the number of guests, for example 20.'),
    type: (v) => (v ? '' : 'Choose the type of event.'),
  };

  const showError = (name, message) => {
    const field = form.elements[name];
    const note = $(`#e-${name}`);
    if (!field || !note) return;
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      note.textContent = message;
      note.hidden = false;
    } else {
      field.removeAttribute('aria-invalid');
      note.textContent = '';
      note.hidden = true;
    }
  };

  Object.keys(rules).forEach((name) => {
    const field = form.elements[name];
    const recheck = () => { if (field.getAttribute('aria-invalid') === 'true') showError(name, rules[name](field.value)); };
    field.addEventListener('input', recheck);
    field.addEventListener('change', recheck);
  });

  const say = (html) => { status.innerHTML = html; };
  const callUs = `<a class="link" href="${PHONE_HREF}">${PHONE_LABEL}</a>`;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.busy) return;
    say('');
    let first = null;
    for (const name of Object.keys(rules)) {
      const message = rules[name](form.elements[name].value);
      showError(name, message);
      if (message && !first) first = form.elements[name];
    }
    if (first) { first.focus(); return; }
    if (form.elements.website.value) return;              // filled by a bot, never by a person

    const data = Object.fromEntries(['name', 'phone', 'email', 'date', 'guests', 'type', 'message'].map((k) => [k, form.elements[k].value.trim()]));
    const text = enquiryText(data);

    if (endpoint) {
      form.dataset.busy = '1';
      send.setAttribute('aria-disabled', 'true');
      const wait = setTimeout(() => say('Sending your enquiry.'), 300);
      try {
        const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(String(res.status));
        say('Your enquiry has been sent.');
        form.reset();
      } catch (err) {
        say(`That did not send. Please try again, or call us on ${callUs}.`);
      } finally {
        clearTimeout(wait);
        delete form.dataset.busy;
        send.removeAttribute('aria-disabled');
      }
      return;
    }
    if (number) {
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      say('WhatsApp is opening with your enquiry filled in. Press send there to reach us.');
      return;
    }
    if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Function enquiry: ${data.type}, ${data.date}`)}&body=${encodeURIComponent(text)}`;
      say('Your email app is opening with your enquiry filled in. Press send there to reach us.');
      return;
    }
    // Nothing is connected yet, so say so plainly instead of pretending it sent.
    say(`This form is not connected yet. <span class="todo">[Owner to fill in: WhatsApp number and email for enquiries]</span> For now, please call ${callUs}.`);
  });
}

/* ------------------------------------------------------------------ map */

function initMap() {
  const map = $('#map');
  const frame = map && $('.map__frame', map);
  if (!frame || !frame.dataset.src) return;
  const start = () => {
    frame.addEventListener('load', () => map.classList.add('is-live'), { once: true });
    frame.src = frame.dataset.src;
  };
  if (!('IntersectionObserver' in window)) { start(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '700px 0px' });
  io.observe(map);
}

/* ------------------------------------------------------------------ hero glass, for browsers without CSS scroll timelines */

function initGlassFallback() {
  const supported = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');
  if (supported || calm.matches || !mouse.matches) return;      // otherwise it stays a still drawing
  const glass = $('.hero__glass');
  const drink = $('.glass__drink');
  const hero = $('.hero');
  if (!glass || !drink || !hero) return;
  let queued = false;
  let onScreen = true;
  const draw = () => {
    queued = false;
    const p = Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * 1.1)));
    glass.style.transform = `translate3d(${0.28 * p}em, ${1.5 * p}em, 0) rotate(${-7 + 20 * p}deg)`;
    drink.style.transform = `rotate(${7 - 20 * p}deg)`;
  };
  new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; }).observe(hero);
  window.addEventListener('scroll', () => {
    if (queued || !onScreen) return;
    queued = true;
    requestAnimationFrame(draw);
  }, { passive: true });
  draw();
}

/* ------------------------------------------------------------------ start */

function start() {
  runIntro();
  initAnchors();
  initNav();
  initData();
  armReveals();
  initLightbox();
  initEnquiry();
  initMap();
  initGlassFallback();
  initSmoothScroll();
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
