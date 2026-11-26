// Money Muss Restaurant & Lounge: page behaviour. All of it is an enhancement: with scripts off, the page is complete.
// Motion follows the one system set in css/styles.css (--dur-1/2/3, --spring-smooth, --spring-snappy, --ease-out);
// scripted motion reads the same tokens.

import { menuHTML, favouritesHTML, specialsHTML, marqueeHTML, countPhrase } from './templates.js';

const root = document.documentElement;
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const mouse = matchMedia('(hover: hover) and (pointer: fine)');
const supports = (rule) => !!(window.CSS && CSS.supports && CSS.supports(rule));
const SCROLL_TIMELINES = supports('animation-timeline: scroll()');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const PHONE_LABEL = '(876) 438-6209';
const PHONE_HREF = 'tel:+18764386209';

const tokens = getComputedStyle(root);
const ms = (name, fallback) => { const v = parseFloat(tokens.getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; };
const MOTION = {
  d1: ms('--dur-1', 200),
  d2: ms('--dur-2', 350),
  d3: ms('--dur-3', 600),
  smooth: tokens.getPropertyValue('--spring-smooth').trim() || 'ease-out',
  out: tokens.getPropertyValue('--ease-out').trim() || 'ease-out',
};

let lenis = null;

/* ------------------------------------------------------------------ one frame loop for everything that follows the scroll or a finger */

// The page position is read once per frame, here; every task only writes transforms and opacity.
// A frame is asked for only when there is something to do: a scroll or wheel event, a finger on the sheet
// or a photo, or a task that is still moving (it returns true).
const frame = { y: 0, v: 0, dt: 16.7, t: 0 };
const frameTasks = new Set();
let frameQueued = false;
let still = calm.matches;      // reduced motion, kept as a plain value so no frame has to ask for it
calm.addEventListener('change', () => { still = calm.matches; });

function tick(t) {
  frameQueued = false;
  if (lenis) lenis.raf(t);
  const y = Math.max(0, window.scrollY);
  const gap = t - frame.t;
  frame.dt = frame.t && gap < 250 ? clamp(gap, 1, 64) : 16.7;
  frame.v = frame.t && gap < 250 ? (y - frame.y) / clamp(gap, 1, 250) : 0;      // pixels per millisecond, signed
  frame.y = y;
  frame.t = t;
  let again = !!(lenis && lenis.isScrolling);
  for (const task of frameTasks) if (task(frame) === true) again = true;
  if (again) wake();
}

function wake() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(tick);
}

const loop = {
  add(task) { frameTasks.add(task); wake(); },
  remove(task) { frameTasks.delete(task); },
  wake,
};

// Tidying up after an entrance (putting plain text back where a headline or a number was taken apart)
// changes the page itself, so it waits for a pause in the scrolling and is then done in one go.
const tidyJobs = [];
let tidyTimer = 0;
let scrolledAt = 0;

function tidy() {
  tidyTimer = 0;
  const wait = 260 - (performance.now() - scrolledAt);
  if (wait > 0) { tidyTimer = setTimeout(tidy, wait); return; }
  for (const job of tidyJobs.splice(0)) job();
}

function tidyAfter(delay, job) {
  setTimeout(() => { tidyJobs.push(job); if (!tidyTimer) tidyTimer = setTimeout(tidy, 0); }, delay);
}

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
  const later = (fn, wait) => timers.push(setTimeout(fn, wait));

  const leave = () => {
    if (leaving) return;
    leaving = true;
    if (still) {
      root.classList.remove('intro-armed');
      intro.classList.add('is-leaving');
      later(cleanUp, 240);                                 // a 150ms fade and it is gone
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
    later(() => root.classList.remove('intro-armed'), 240);                          // the nav fades in under the travelling logo
    later(() => { mark.style.opacity = ''; intro.classList.add('is-landed'); }, MOTION.d3 + 10);
    later(cleanUp, MOTION.d3 + MOTION.d1 + 60);
  };

  const skip = () => {
    if (leaving) return;
    leaving = true;
    timers.forEach(clearTimeout);
    root.classList.remove('intro-armed');
    intro.classList.add('is-skipped', 'is-leaving');
    later(cleanUp, MOTION.d1 + 60);
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
  // Lenis glides wheel and trackpad scrolling on desktop. Phones and tablets keep their own native
  // touch scrolling untouched, and anyone who asks for reduced motion gets plain scrolling.
  if (calm.matches || !mouse.matches) return;
  try {
    if (!window.Lenis) await loadScript(root.dataset.lenisSrc || new URL('./vendor/lenis.min.js', import.meta.url).href);
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false, autoRaf: false });
    wake();                                                // Lenis is stepped by the shared loop, not by a loop of its own
    calm.addEventListener('change', () => { if (calm.matches && lenis) { lenis.destroy(); lenis = null; } });
  } catch (e) {
    lenis = null;   // the page scrolls natively if the file cannot load
  }
}

function navHeight() {
  const bar = $('.nav__bar');
  return bar ? Math.round(bar.getBoundingClientRect().bottom) : 72;
}

// Where something sits down the page, in layout pixels (rotation, scaling and other transforms do not disturb it).
const layoutTop = (node) => { let top = 0; for (let n = node; n; n = n.offsetParent) top += n.offsetTop; return top; };

function scrollToTarget(target) {
  // Sections carry their own space for the nav; anything else lands just below it.
  const top = Math.max(0, layoutTop(target) - (target.matches('main > section, footer') ? 0 : navHeight() + 16));
  if (lenis) {
    lenis.scrollTo(top, { duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
    wake();
  } else {
    window.scrollTo({ top, behavior: calm.matches ? 'auto' : 'smooth' });
  }
}

// Move keyboard focus with the jump, without scrolling again.
function focusOn(target) {
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
    if (sheet.isOpen()) {
      // From the phone sheet: it slides away while the page is already on its way, and focus follows once it has gone.
      sheet.close(false, () => focusOn(target));
      scrollToTarget(target);
    } else {
      scrollToTarget(target);
      focusOn(target);
    }
    try { history.pushState(null, '', `#${id}`); } catch (err) { /* some embedded viewers do not allow it */ }
  });
}

/* ------------------------------------------------------------------ phone navigation sheet */

// Slides up over the page like an iOS sheet: the page behind steps back to 98% and dims.
// Drag the top strip down to put it away; Esc, the close button and a tap on the dimmed page do the same.
const sheet = { open() {}, close(instant, after) { if (after) after(); }, isOpen: () => false };

// Pulling the wrong way meets growing resistance, the way an iOS list does at its end.
const rubber = (distance, size) => (1 - 1 / ((distance * 0.55) / size + 1)) * size;

function initSheet() {
  const el = $('#sheet');
  const toggle = $('#nav-toggle');
  const panel = $('#sheet-panel');
  const scrim = $('#sheet-scrim');
  const grip = $('#sheet-grip');
  if (!el || !toggle || !panel || !scrim || typeof el.showModal !== 'function') { if (toggle) toggle.hidden = true; return; }
  const behind = () => [$('main'), $('footer'), $('#nav')].filter(Boolean);
  // While the sheet is up, everything under it is out of reach for the keyboard, pointers and screen readers.
  const cover = (on) => { for (const part of [...behind(), $('#callbar')]) if (part) part.inert = on; };
  let busy = false;

  const pageBack = (amount) => {                           // 0 = where it was, 1 = fully stepped back
    for (const part of behind()) part.style.transform = amount > 0 && !calm.matches ? `scale(${(1 - 0.02 * amount).toFixed(4)})` : '';
  };
  const restorePage = () => {
    for (const part of behind()) { part.classList.remove('is-behind'); part.style.transform = ''; part.style.transformOrigin = ''; }
  };

  sheet.isOpen = () => el.open;
  sheet.open = () => {
    if (el.open) return;
    // Read first: the page shrinks towards the middle of the screen, wherever it is scrolled to.
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const origins = behind().map((part) => { const r = part.getBoundingClientRect(); return [part, cx - r.left, cy - r.top]; });
    el.showModal();
    cover(true);
    if (lenis) lenis.stop();
    toggle.setAttribute('aria-expanded', 'true');
    for (const [part, x, y] of origins) { part.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`; part.classList.add('is-behind'); }
    requestAnimationFrame(() => { el.classList.add('is-open'); pageBack(1); });
  };
  sheet.close = (instant = false, after = null) => {
    if (!el.open || busy) return;
    const done = () => {
      busy = false;
      el.classList.remove('is-open', 'is-dragging');
      root.classList.remove('sheet-dragging');
      panel.style.transform = '';
      scrim.style.opacity = '';
      cover(false);                                         // before closing, so focus can go back to the menu button
      el.close();
      restorePage();
      toggle.setAttribute('aria-expanded', 'false');
      if (after) after();
    };
    if (lenis) lenis.start();
    if (instant) { done(); return; }
    busy = true;
    el.classList.remove('is-open', 'is-dragging');
    root.classList.remove('sheet-dragging');
    panel.style.transform = '';
    scrim.style.opacity = '';
    pageBack(0);
    setTimeout(done, (calm.matches ? 150 : MOTION.d2) + 40);
  };

  toggle.addEventListener('click', sheet.open);
  $('#sheet-close').addEventListener('click', () => sheet.close());
  scrim.addEventListener('click', () => sheet.close());
  el.addEventListener('cancel', (e) => { e.preventDefault(); sheet.close(); });   // Esc
  matchMedia('(min-width: 1000px)').addEventListener('change', (e) => { if (e.matches) sheet.close(true); });

  // Drag down to dismiss. The finger sets a target; the frame loop does the writing.
  if (!grip || calm.matches) return;
  let drag = null;
  const apply = () => {
    if (!drag || !drag.dirty) return false;
    drag.dirty = false;
    const y = drag.dy > 0 ? drag.dy : -rubber(-drag.dy, drag.h);
    const p = clamp(y / drag.h, 0, 1);
    panel.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    scrim.style.opacity = (1 - p).toFixed(3);
    pageBack(1 - p);
    return false;                                           // the next move of the finger asks for the next frame
  };
  grip.addEventListener('pointerdown', (e) => {
    if (busy || !el.classList.contains('is-open') || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, a')) return;
    drag = { id: e.pointerId, y0: e.clientY, dy: 0, v: 0, t: e.timeStamp, h: panel.offsetHeight, dirty: false };
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    el.classList.add('is-dragging');
    root.classList.add('sheet-dragging');
    loop.add(apply);
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    const dt = Math.max(1, e.timeStamp - drag.t);
    drag.v = 0.6 * drag.v + 0.4 * ((dy - drag.dy) / dt);     // smoothed, pixels per millisecond
    drag.t = e.timeStamp;
    drag.dy = dy;
    drag.dirty = true;
    wake();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, v } = drag;
    drag = null;
    loop.remove(apply);
    el.classList.remove('is-dragging');
    root.classList.remove('sheet-dragging');
    if (dy > 110 || (dy > 24 && v > 0.6)) { sheet.close(); return; }
    panel.style.transform = '';                             // not far enough: it springs back up
    scrim.style.opacity = '';
    pageBack(1);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------------ nav: section in view, compact bar, away and back */

function initNav() {
  const nav = $('#nav');
  if (!nav) return;
  const linksNav = $('.nav__links', nav);
  const ink = $('.nav__ink', nav);
  const links = $$('.nav__links a', nav);
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  let current = null;
  let inkShown = false;

  // One underline glides to the link for the section in view (the same marker technique as the menu tabs).
  const placeInk = () => {
    if (!linksNav || !ink) return;
    if (!current || !linksNav.offsetWidth) { linksNav.style.setProperty('--ink-o', '0'); inkShown = false; return; }
    const pad = 14;                                        // the link's own side padding
    const set = () => {
      linksNav.style.setProperty('--ink-x', String(current.offsetLeft + pad));
      linksNav.style.setProperty('--ink-s', String(Math.max(8, current.offsetWidth - pad * 2) / 100));
    };
    if (inkShown) { set(); return; }
    // First appearance: arrive in place, then fade in, instead of sliding in from the edge.
    inkShown = true;
    ink.style.transition = 'none';
    set();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ink.style.transition = '';
      if (current) linksNav.style.setProperty('--ink-o', '1');
    }));
  };
  if ('IntersectionObserver' in window && links.length) {
    const spy = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const hit = byId.get(entry.target.dataset.nav || entry.target.id) || null;
        if (hit === current) continue;
        links.forEach((a) => a.removeAttribute('aria-current'));
        if (hit) hit.setAttribute('aria-current', 'true');
        current = hit;
        placeInk();
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section').forEach((s) => spy.observe(s));
    if ('ResizeObserver' in window && linksNav) new ResizeObserver(placeInk).observe(linksNav);
  }

  // Past 80px the bar compacts (its frosted fill comes a moment sooner if the headline would otherwise slide
  // under a clear bar). Scrolling down, it slides away; any scroll up returns it. It always shows near the
  // top, under the mouse, and for anyone using the keyboard inside it.
  const progress = $('.nav__progress', nav);
  const bar = $('.nav__bar', nav);
  const headline = $('.hero__title');
  let span = 1;
  let fillAt = 80;
  const measure = () => {
    span = Math.max(1, root.scrollHeight - window.innerHeight);
    if (headline && bar) fillAt = clamp(layoutTop(headline) - (bar.offsetTop + bar.offsetHeight) - 4, 16, 80);
  };
  measure();
  window.addEventListener('resize', measure, { passive: true });
  if (!SCROLL_TIMELINES && progress && 'ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  const held = () => {
    if (sheet.isOpen()) return true;
    try { return !!nav.querySelector(':focus-visible') || (mouse.matches && nav.matches(':hover')); } catch (e) { return nav.contains(document.activeElement); }
  };
  let compact = false;
  let filled = false;
  let away = false;
  let from = 0;
  let down = 0;            // how far down since the last move up
  let burst = 0;           // how far down in the current unbroken run of scrolling
  let burstAt = 0;         // when that run began
  let movedAt = 0;
  loop.add(({ y, t }) => {
    if ((y > 80) !== compact) { compact = y > 80; nav.classList.toggle('is-compact', compact); }
    if ((y > fillAt) !== filled) { filled = y > fillAt; nav.classList.toggle('is-filled', filled); }
    if (!SCROLL_TIMELINES && progress) progress.style.setProperty('--progress', clamp(y / span, 0, 1).toFixed(4));
    let next = away;
    if (still || y < 120) { next = false; from = y; down = 0; burst = 0; }
    else if (Math.abs(y - from) >= 6) {
      if (y > from) {
        if (!burst || t - movedAt > 120) { burst = 0; burstAt = t; }
        burst += y - from;
        down += y - from;
        // Fast: 40px or more at over half a pixel a millisecond. Steady: 160px without turning back.
        if ((burst >= 40 && burst / (t - burstAt + 16) > 0.5) || down > 160) next = true;
      } else { down = 0; burst = 0; next = false; }
      movedAt = t;
      from = y;
    }
    if (next && !away && held()) next = false;
    if (next !== away) { away = next; nav.classList.toggle('is-away', away); }
    return false;
  });
  nav.addEventListener('focusin', () => { if (away) { away = false; down = 0; nav.classList.remove('is-away'); } });   // tabbing back to the nav brings it back
}

/* ------------------------------------------------------------------ entrances: three kinds, each plays once */

// a) Headlines ([data-rise]): the lines rise out of a masked baseline, 50ms apart.
// b) Groups ([data-stagger]): the children fade up 12px, 50ms apart, the seventh onwards together.
// c) Photos (.rise): an inset wipe from the bottom while the photo settles from 108%.
// Nothing is touched until it is about a screen away, still below the fold, so only a handful of elements
// are ever waiting. Anything seen some other way (there at load, reached from above, jumped to) is left as it is.
let nearWatch = null;      // "about a screen away": time to get ready
let watcher = null;        // "in view": play
const seen = new WeakSet();
const REACH = '0px 0px 120% 0px';
const ABOVE = '200000px';
const OWN_ENTRANCE = '[data-rise], .print, .reels';       // children of a group that have an entrance of their own
const STEPS = ['stg', 'stg-1', 'stg-2', 'stg-3', 'stg-4', 'stg-5', 'stg-6'];
const belowFold = (entry) => entry.boundingClientRect.top >= window.innerHeight * 0.94;

function wrapWords(node, out) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/([ \t\n\r]+)/)) {
        if (!part) continue;
        if (/^[ \t\n\r]+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
        const word = document.createElement('span');
        word.className = 'rise-word';
        const inner = document.createElement('span');
        inner.textContent = part;
        word.appendChild(inner);
        frag.appendChild(word);
        out.push(word);
      }
      child.replaceWith(frag);
    } else if (child.nodeType === 1) {
      if (child.matches('.nowrap, .circled, svg')) {          // these stay whole
        const word = document.createElement('span');
        word.className = 'rise-word';
        const inner = document.createElement('span');
        child.replaceWith(word);
        inner.appendChild(child);
        word.appendChild(inner);
        out.push(word);
      } else wrapWords(child, out);
    }
  }
}

// Puts the plain text back exactly as it was, once the entrance is over (or if it has to be called off).
function unwrapWords(el) {
  for (const word of $$('.rise-word', el)) {
    const inner = word.firstChild;
    if (inner) word.replaceWith(...inner.childNodes); else word.remove();
  }
  el.normalize();
  el.classList.remove('is-waiting');
  if (el.dataset.riseLabel) { el.removeAttribute('aria-label'); delete el.dataset.riseLabel; }
  delete el.dataset.lines;
}

// Gets a batch of elements ready to make their entrance: all the writes, then all the reads, then the rest.
function prepare(list) {
  const heads = list.filter((el) => el.hasAttribute('data-rise')).map((el) => ({ el, height: el.offsetHeight, words: [] }));
  for (const el of list) {
    if (el.hasAttribute('data-rise')) continue;
    if (el.hasAttribute('data-stagger')) {
      // The waiting state goes on the children themselves, so only they are restyled (never everything inside the group).
      el.setAttribute('data-hold', '');                                   // its numbers wait for it (see below)
      Array.from(el.children).forEach((child, i) => {
        if (child.matches(OWN_ENTRANCE)) return;
        child.classList.add('stg-wait');
        if (i) child.classList.add(STEPS[Math.min(i, 6)]);                // how long after the first it follows
      });
    } else el.classList.add('is-waiting');                                // a photo frame
    watcher.observe(el);
  }
  for (const h of heads) {
    // While it is in pieces, a heading is still read out as one line.
    if (/^H[1-6]$/.test(h.el.tagName) && !h.el.hasAttribute('aria-label')) {
      h.el.setAttribute('aria-label', h.el.textContent.replace(/\s+/g, ' ').trim());
      h.el.dataset.riseLabel = '1';
    }
    wrapWords(h.el, h.words);
    if (h.el.dataset.riseLabel) for (const word of h.words) word.setAttribute('aria-hidden', 'true');
  }
  for (const h of heads) { h.tops = h.words.map(layoutTop); h.gap = h.words.length ? h.words[0].offsetHeight * 0.4 : 0; h.after = h.el.offsetHeight; }
  for (const h of heads) {
    if (!h.words.length || Math.abs(h.after - h.height) > 1) { unwrapWords(h.el); continue; }   // wrapping moved something: leave this one be
    let line = -1;
    let last = -1e6;
    h.words.forEach((word, i) => {
      if (Math.abs(h.tops[i] - last) > h.gap) { line += 1; last = h.tops[i]; }
      word.firstChild.style.setProperty('--line', String(line));
    });
    h.el.dataset.lines = String(line + 1);
    h.el.classList.add('is-waiting');
    watcher.observe(h.el);
  }
}

// Takes the entrance classes off a group's children (all at once, so nothing animates because of it).
function clearCast(group) {
  for (const child of $$(':scope > .stg, :scope > .stg-wait', group)) child.classList.remove('stg-wait', ...STEPS);
}

function enter(el) {
  if (el.hasAttribute('data-rise')) {
    el.classList.remove('is-waiting');
    tidyAfter(MOTION.d3 + Number(el.dataset.lines || 1) * 50 + 120, () => unwrapWords(el));
  } else if (el.hasAttribute('data-stagger')) {
    // The transition arrives with the change itself, so each child fades up from where it was waiting.
    for (const child of $$(':scope > .stg-wait', el)) { child.classList.add('stg'); child.classList.remove('stg-wait'); }
    setTimeout(() => releaseRolls(el), MOTION.d2 + 300);                      // the last child has all but landed: now its numbers may spin
    tidyAfter(MOTION.d3 + 300 + 120, () => clearCast(el));
  } else el.classList.remove('is-waiting');
}

// Shows something at once, with no entrance: a group when a menu tab swaps what is on show, or anything
// that was waiting and has been jumped straight past (so nothing ever plays on the way back up).
function settle(el) {
  seen.add(el);
  if (nearWatch) nearWatch.unobserve(el);
  if (watcher) watcher.unobserve(el);
  if (el.hasAttribute('data-rise')) { if ($('.rise-word', el)) unwrapWords(el); return; }
  if (el.hasAttribute('data-stagger')) { clearCast(el); requeueRolls(el); } else el.classList.remove('is-waiting');
}

function armEntrances(scope = document) {
  if (calm.matches || !('IntersectionObserver' in window)) return;
  if (!watcher) {
    // The watched area reaches far above the screen as well, so something that was waiting and is suddenly
    // above the screen (a jump went straight past it) is noticed too, and is simply shown.
    watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        watcher.unobserve(entry.target);
        if (entry.boundingClientRect.bottom < 0) settle(entry.target); else enter(entry.target);
      }
    }, { rootMargin: ABOVE + ' 0px -8% 0px', threshold: 0.1 });
    nearWatch = new IntersectionObserver((entries) => {
      const coming = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        nearWatch.unobserve(entry.target);
        if (belowFold(entry)) coming.push(entry.target);      // otherwise it is already on screen: it is simply there
      }
      if (coming.length) prepare(coming);
    }, { rootMargin: REACH });
  }
  for (const el of $$('[data-rise], [data-stagger], .rise', scope)) {
    if (seen.has(el)) continue;
    seen.add(el);
    nearWatch.observe(el);
  }
}

/* ------------------------------------------------------------------ numbers that roll */

// Prices, dates, counts and ticket serials spin into place like slot reels the first time they come into view.
// A number is wound back to zero only when it is about a screen away; its real value stays in the page as
// text throughout (the strips are aria-hidden) and the plain text is put back afterwards. A number inside
// something still arriving (a group, a menu cross-fade, the scratch foil) waits for that to finish.
const REEL = Array.from({ length: 20 }, (_, i) => i % 10).join('\n');
const rollWait = new WeakMap();        // a holder ([data-hold]) -> the numbers waiting on it
let rollNear = null;
let rollWatch = null;
const canRoll = (el) => !el.dataset.rolls && !el.childElementCount && /\d/.test(el.textContent);     // a placeholder never rolls

// Winds a number back: each digit becomes a strip of 0 to 9, resting on zero.
function wind(el) {
  const text = el.textContent;
  const real = document.createElement('span');
  real.className = 'sr-only';
  real.textContent = text;
  const show = document.createElement('span');
  show.setAttribute('aria-hidden', 'true');
  let i = 0;
  for (const ch of text) {
    if (ch < '0' || ch > '9') { show.appendChild(document.createTextNode(ch)); continue; }
    const reel = document.createElement('span');
    reel.className = 'roll';
    const strip = document.createElement('span');
    strip.className = 'roll__strip';
    strip.textContent = REEL;
    strip.style.setProperty('--to', String(10 + Number(ch)));
    strip.style.setProperty('--i', String(i));
    i += 1;
    reel.appendChild(strip);
    show.appendChild(reel);
  }
  el.dataset.rolls = String(i);
  el.textContent = '';
  el.append(real, show);
  el.classList.add('is-set');
  rollWatch.observe(el);
}

// Puts the plain number back.
function unwind(el) {
  const real = el.firstElementChild;
  if (real && real.classList.contains('sr-only')) el.textContent = real.textContent;
  el.classList.remove('is-set', 'is-rolled');
}

function spin(el) {
  if (!el.classList.contains('is-set')) return;
  el.classList.replace('is-set', 'is-rolled');
  tidyAfter(MOTION.d3 + (Number(el.dataset.rolls) || 1) * 40 + 160, () => unwind(el));
}

function releaseRolls(holder) {
  holder.removeAttribute('data-hold');
  const list = rollWait.get(holder);
  rollWait.delete(holder);
  if (list) list.forEach(spin);
}

function requeueRolls(holder) {           // its entrance was called off: let its numbers be judged afresh
  holder.removeAttribute('data-hold');
  const list = rollWait.get(holder);
  rollWait.delete(holder);
  if (list && rollWatch) list.forEach((el) => rollWatch.observe(el));
}

const underFoil = (el) => { const box = el.closest('[data-scratch]'); return !!box && !box.classList.contains('is-done') && !!$('.scratch__foil', box); };

// Winds back the numbers in something nobody can see yet: a menu behind another tab that is about to be
// shown, or the price list once the scratch foil is over it.
function primeRolls(scope, covered = false) {
  if (!rollWatch) return;
  for (const el of $$('[data-roll]', scope)) {
    if (covered && el.dataset.rolls === '0') delete el.dataset.rolls;      // it was left plain, but the foil has it now
    if (canRoll(el)) { rollNear.unobserve(el); wind(el); }
  }
}

function armRolls(scope = document) {
  if (calm.matches || !supports('height: 1lh') || !('IntersectionObserver' in window)) return;
  if (!rollWatch) {
    rollWatch = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        rollWatch.unobserve(el);
        // Jumped straight past: it simply shows its value. (Under the scratch foil it stays wound for the reveal.)
        if (entry.boundingClientRect.bottom < 0 && !underFoil(el)) { unwind(el); continue; }
        const holder = el.closest('[data-hold]');
        if (!holder) { spin(el); continue; }
        if (!rollWait.has(holder)) rollWait.set(holder, []);
        rollWait.get(holder).push(el);
      }
    }, { rootMargin: ABOVE + ' 0px -6% 0px', threshold: 0.6 });
    rollNear = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        rollNear.unobserve(el);
        if (!canRoll(el)) continue;
        // Already on screen: it simply shows its value. (Unless it is under the scratch foil, where nobody can see it yet.)
        if (belowFold(entry) || underFoil(el)) wind(el); else el.dataset.rolls = '0';
      }
    }, { rootMargin: REACH });
  }
  for (const el of $$('[data-roll]', scope)) if (canRoll(el)) rollNear.observe(el);
}

/* ------------------------------------------------------------------ menu tabs */

function initTabs(scope) {
  const bar = $('.tabs', scope);
  const list = $('.tabs__list', scope);
  const stack = $('.menu-panels', scope);
  if (!bar || !list || !stack) return;
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

  let current = Math.max(0, tabs.findIndex((t) => t.classList.contains('is-active')));
  let fadeTimer = 0;

  // One cream marker sits behind the labels; two numbers slide and stretch it to the chosen tab.
  // Where each tab sits is measured when the row is laid out (and again whenever it changes size), not at
  // the moment of a tap, so changing tab asks the browser for no measurements at all. A browser that cannot
  // watch for size changes measures at the tap instead.
  const watching = 'ResizeObserver' in window;
  let spots = [];
  const measure = (tab) => (tab.offsetWidth ? { x: tab.offsetLeft, s: tab.offsetWidth / 100 } : null);
  const mark = (spot) => {
    if (!spot) return;
    list.style.setProperty('--tab-x', String(spot.x));
    list.style.setProperty('--tab-s', String(spot.s));
  };
  const place = () => { spots = tabs.map(measure); mark(spots[current]); };
  const show = (spot) => {
    tabs.forEach((tab, i) => {
      const on = i === current;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].classList.toggle('is-active', on);
    });
    mark(spot);
  };

  const select = (index, focus = false) => {
    if (focus) tabs[index].focus();
    if (index === current) return;
    const old = panels[current];
    const spot = (watching && spots[index]) || measure(tabs[index]);
    stack.classList.toggle('is-back', index < current);                     // which way the menus slide
    current = index;
    if (calm.matches) { show(spot); return; }
    // A menu brought in by a tab arrives by the cross-fade alone: its rows skip their own entrance,
    // and its prices wait for the cross-fade before they spin.
    for (const group of $$('[data-stagger]', stack)) settle(group);
    primeRolls(panels[index]);
    stack.setAttribute('data-hold', '');

    // The two menus cross-fade: opacity and a 6px slide on the menus themselves, which the browser can run
    // off the main thread, so once the fade has started nothing here has to keep up with it. (View transitions
    // were measured for this, page-wide and inside the menu stack, and dropped: they kept the main thread
    // busy on every frame of the fade, and with the processor slowed four times that cost frames.)
    show(spot);
    for (const p of panels) p.classList.remove('is-leaving', 'is-entering');
    old.classList.add('is-leaving');
    panels[index].classList.add('is-entering');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      for (const p of panels) p.classList.remove('is-leaving', 'is-entering');
      releaseRolls(stack);
    }, MOTION.d2 + 40);
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
    select((move + tabs.length) % tabs.length, true);
  });

  show();
  place();
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('is-ready')));   // from here on the marker glides
  if (watching) new ResizeObserver(place).observe(list);
}

/* ------------------------------------------------------------------ menu, favourites, tickets and marquee from the data files */

const cleanHTML = (el) => {
  const copy = el.cloneNode(true);
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  return copy.innerHTML.replace(/\s+/g, ' ').trim();
};

const builtCopy = new WeakMap();      // what index.html shipped with, before any script touched it

async function loadJSON(src) {
  const res = await fetch(src, { cache: 'no-cache' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Only redraw when the data file has changed since the page was built.
function redraw(el, html, after) {
  if (!el) return;
  const probe = document.createElement('div');
  probe.innerHTML = html;
  if (builtCopy.get(el) === cleanHTML(probe)) return;
  el.innerHTML = html;
  seen.delete(el);
  if (after) after(el);
  armEntrances(el.parentElement || el);
  armRolls(el);
}

function initData() {
  const menu = $('#menu-root');
  const favs = $('#favs-root');
  const nights = $('#specials-root');
  const strip = $('#marquee-root');
  for (const el of [menu, favs, nights, strip]) if (el) builtCopy.set(el, cleanHTML(el));
  if (menu) initTabs(menu);
  // Offline, or opened straight from disk: the built-in copy simply stays.
  if (menu || favs) {
    loadJSON((menu || favs).dataset.src).then((data) => {
      redraw(menu, menuHTML(data), (el) => initTabs(el));
      redraw(favs, favouritesHTML(data));
    }).catch(() => {});
  }
  if (nights || strip) {
    loadJSON((nights || strip).dataset.src).then((data) => {
      redraw(nights, specialsHTML(data), (el) => initScratch(el));
      redraw(strip, marqueeHTML(data));
      const count = $('#nights-count');
      if (count && count.textContent.replace(/\s+/g, ' ').trim() !== countPhrase(data)) count.textContent = countPhrase(data);
    }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ photo viewer (its script is fetched only when there are photos to open) */

function initLightbox() {
  const box = $('#lightbox');
  const tiles = $$('[data-open]').filter((tile) => $('picture', tile));       // a photo that is not in /images has nothing to open
  if (!box || !tiles.length || typeof box.showModal !== 'function') return;
  let ready = null;
  const load = () => ready || (ready = import('./lightbox.js').then((m) => m.createLightbox({
    box, tiles, calm, loop, motion: MOTION,
    hold: () => { if (lenis) lenis.stop(); },
    release: () => { if (lenis) lenis.start(); },
  })));
  for (const tile of tiles) tile.addEventListener('click', () => load().then((viewer) => viewer.open(tile)).catch(() => { ready = null; }));
  // Have it in hand before the first tap.
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      load().catch(() => { ready = null; });
    }, { rootMargin: '1200px 0px' });
    tiles.forEach((tile) => near.observe(tile));
  }
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
  const key = String(site.web3formsKey || '').trim();
  const endpoint = String(site.formEndpoint || '').trim();

  // The WhatsApp buttons stay out of the page entirely until there is a number to send to.
  if (number) {
    const href = `https://wa.me/${number}?text=${encodeURIComponent('Hello Money Muss, I would like to ask about booking an event.')}`;
    for (const link of [$('#wa-button'), $('#wa-bar')]) {
      if (!link) continue;
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener';
      link.hidden = false;
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

  // state: '' (plain), 'busy', 'ok' or 'error'. The stylesheet gives the last two their own look.
  const say = (html, state = '') => {
    status.innerHTML = html;
    if (state) status.dataset.state = state; else delete status.dataset.state;
  };
  const callUs = `<a class="link" href="${PHONE_HREF}">${PHONE_LABEL}</a>`;

  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const reply = await res.json().catch(() => ({}));
    if (!res.ok || reply.success === false) throw new Error(reply.message || String(res.status));
  };

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
    if (form.elements.website.value) return;              // the trap field: filled in by a bot, never by a person

    const data = Object.fromEntries(['name', 'phone', 'email', 'date', 'guests', 'type', 'message'].map((k) => [k, form.elements[k].value.trim()]));
    const text = enquiryText(data);
    const subject = `Function enquiry: ${data.type}, ${data.date}`;
    const mailto = email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : '';

    // 1. A Web3Forms key (or another form service's address) in data/site.json: the enquiry is sent from here.
    if (key || endpoint) {
      form.dataset.busy = '1';
      send.setAttribute('aria-disabled', 'true');
      const wait = setTimeout(() => say('Sending your enquiry.', 'busy'), 300);
      try {
        if (key) await post('https://api.web3forms.com/submit', { access_key: key, subject, from_name: 'Money Muss website', ...data });
        else await post(endpoint, data);
        say(`Sent. Thank you, ${data.name.replace(/[<>&"]/g, '')}. We have your enquiry and will be in touch.`, 'ok');
        form.reset();
      } catch (err) {
        // It did not go: say so plainly, and give the phone (and the email, if there is one) instead.
        say(`That did not send. Please call us on ${callUs}${mailto ? `, or <a class="link" href="${mailto}">send it by email</a>` : ''}.`, 'error');
      } finally {
        clearTimeout(wait);
        delete form.dataset.busy;
        send.removeAttribute('aria-disabled');
      }
      return;
    }
    // 2. No key, but a WhatsApp number or an email address: hand the filled-in enquiry to that app.
    if (number) {
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      say('WhatsApp is opening with your enquiry filled in. Press send there to reach us.', 'ok');
      return;
    }
    if (mailto) {
      window.location.href = mailto;
      say('Your email app is opening with your enquiry filled in. Press send there to reach us.', 'ok');
      return;
    }
    // 3. Nothing is connected yet, so say so plainly instead of pretending it sent.
    say(`This form is not connected yet. <span class="todo">[Owner to fill in: WhatsApp number and email for enquiries]</span> For now, please call ${callUs}.`, 'error');
  });
}

/* ------------------------------------------------------------------ map */

// A card with the place, the address and a directions button is there from the start. The live Google
// map loads over it when this part of the page comes into view, or when "Show the map here" is tapped.
// With data saving switched on, it waits for the tap.
function initMap() {
  const map = $('#map');
  const view = map && $('.map__frame', map);
  const button = $('#map-load');
  if (!view || !view.dataset.src) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    view.addEventListener('load', () => { map.classList.add('is-live'); if (button) button.hidden = true; }, { once: true });
    view.src = view.dataset.src;
  };
  if (button) { button.hidden = false; button.addEventListener('click', start); }
  const saving = !!(navigator.connection && navigator.connection.saveData);
  if (saving && button) return;
  if (!('IntersectionObserver' in window)) { if (!button) start(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '160px 0px' });
  io.observe(map);
}

/* ------------------------------------------------------------------ the living hero, the stamps, the marquee */

function initAmbient() {
  const strip = $('#marquee');
  // Anything that moves on its own needs a way to stop it. A mouse pauses the strip by hovering and
  // the keyboard by focusing it (both in the stylesheet); on a touch screen a tap stops and restarts it.
  if (strip && !calm.matches && !mouse.matches) {
    strip.addEventListener('click', () => strip.classList.toggle('is-paused'));
  }
  if (!('IntersectionObserver' in window)) return;

  // The marquee and the glow behind the glass rest while they are off screen.
  const rest = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
  }, { rootMargin: '80px 0px' });
  $$('.marquee, .hero').forEach((el) => rest.observe(el));
  if (calm.matches) return;

  // The stamp and the token lean with the speed of the scroll and settle back, only while on screen. The loop
  // sets a new angle a few times a second; the stylesheet eases to it on --spring-smooth.
  const turners = $$('.stamp__ring, .token__spin').map((el) => ({ el, on: false, r: 0 }));
  if (turners.length) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) { const t = turners.find((x) => x.el === entry.target); if (t) t.on = entry.isIntersecting; }
      wake();
    }, { rootMargin: '60px 0px' });
    turners.forEach((t) => io.observe(t.el));
    let speed = 0;           // the scroll speed, smoothed
    let setAt = 0;
    let rest = 0;
    const turn = (want) => {
      for (const turner of turners) {
        const r = turner.on ? want : 0;
        if (r === turner.r) continue;
        // Its own layer just for the turn; given back once it is at rest again.
        if (r) turner.el.style.willChange = 'transform'; else setTimeout(() => { if (!turner.r) turner.el.style.willChange = ''; }, MOTION.d2 + 60);
        turner.r = r;
        turner.el.style.transform = r ? `rotate(${r}deg)` : '';
      }
    };
    loop.add(({ v, dt, t }) => {
      speed += (v - speed) * Math.min(1, dt / 90);
      if (t - setAt < 110) return false;
      setAt = t;
      turn(Math.abs(speed) < 0.04 ? 0 : Math.round(clamp(speed * 14, -18, 18)));
      // No scroll for a moment means it has stopped: back to rest (the loop itself is not kept running to find that out).
      clearTimeout(rest);
      rest = setTimeout(() => { speed = 0; turn(0); }, 170);
      return false;
    });
  }

  // Depth in the hero, for browsers without CSS scroll timelines: the glass a little ahead of the page,
  // the stamp a little behind it (never more than 40px), the headline moving with the page.
  if (SCROLL_TIMELINES) return;
  const hero = $('.hero');
  const glass = $('.hero__glass');
  const drink = $('.glass__drink');
  const stamp = $('.hero__stamp');
  if (!hero || !glass || !drink) return;
  let heroOn = true;
  let vh = window.innerHeight;
  let wide = window.innerWidth >= 1000;
  window.addEventListener('resize', () => { vh = window.innerHeight; wide = window.innerWidth >= 1000; }, { passive: true });
  new IntersectionObserver((entries) => { heroOn = entries[0].isIntersecting; wake(); }).observe(hero);
  loop.add(({ y }) => {
    if (!heroOn) return false;
    const p = clamp(y / (vh * 1.1), 0, 1);
    glass.style.transform = `translate3d(${(0.22 * p).toFixed(3)}em, ${(1.25 * p).toFixed(3)}em, 0) rotate(${(-7 + 20 * p).toFixed(2)}deg)`;
    drink.style.transform = `rotate(${(7 - 20 * p).toFixed(2)}deg)`;
    if (stamp) stamp.style.transform = wide ? `translate3d(0, ${Math.min(40, y * 0.1).toFixed(1)}px, 0)` : '';
    return false;
  });
}

/* ------------------------------------------------------------------ slot reels: one spin into place */

function initReels() {
  const reels = $('#reels');
  if (!reels) return;
  const live = $$('.reel', reels).filter((r) => r.offsetParent !== null);
  if (!live.length) return;
  // On a phone the reels are a row to swipe; let the keyboard reach it too.
  if (reels.scrollWidth > reels.clientWidth + 4) {
    reels.tabIndex = 0;
    reels.setAttribute('role', 'group');
    reels.setAttribute('aria-label', 'Photos of the lounge. Swipe sideways for more.');
  }
  if (calm.matches || !('IntersectionObserver' in window)) return;
  if (reels.getBoundingClientRect().top < window.innerHeight * 0.9) return;      // already on screen: leave the photos showing
  reels.classList.add('is-armed');
  const warm = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    warm.disconnect();
    $$('img', reels).forEach((img) => { img.loading = 'eager'; });             // have the photos ready before they land
  }, { rootMargin: '900px 0px' });
  warm.observe(reels);
  const turn = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    turn.disconnect();
    reels.classList.add('is-spun');
  }, { threshold: 0.3 });
  turn.observe(reels);
}

/* ------------------------------------------------------------------ tickets: press, then lift */

function initTickets() {
  const home = $('#specials-root');
  if (!home) return;
  // The scratch panel and anything clickable inside a ticket keep their own feedback.
  const ticketOf = (e) => (e.target.closest && !e.target.closest('.scratch, a, button') ? e.target.closest('.ticket') : null);
  const letGo = () => { for (const t of $$('.ticket.is-pressed', home)) t.classList.remove('is-pressed'); };
  home.addEventListener('pointerdown', (e) => { const t = ticketOf(e); if (t) t.classList.add('is-pressed'); }, { passive: true });
  home.addEventListener('pointerup', (e) => {
    const t = ticketOf(e);
    letGo();
    // A mouse lifts a ticket by hovering. A finger has no hover, so the tap itself lifts it for a moment.
    if (!t || e.pointerType === 'mouse') return;
    t.classList.add('is-lifted');
    clearTimeout(t.liftTimer);
    t.liftTimer = setTimeout(() => t.classList.remove('is-lifted'), 900);
  }, { passive: true });
  home.addEventListener('pointercancel', letGo, { passive: true });
  home.addEventListener('pointerleave', letGo, { passive: true });
}

/* ------------------------------------------------------------------ scratch panel and pointer extras: fetched only when needed */

let scratchWatch = null;

function initScratch(scope = document) {
  const boxes = $$('[data-scratch]', scope);
  if (!boxes.length || calm.matches) return;                  // reduced motion: the deals are simply listed
  for (const box of boxes) {
    // The prices under the foil wait for it to come off before they roll.
    box.setAttribute('data-hold', '');
    box.addEventListener('scratch:done', () => setTimeout(() => releaseRolls(box), MOTION.d3 * 0.5), { once: true });   // once the foil is all but gone
  }
  const mount = (box) => import('./scratch.js')
    .then((m) => { m.mountScratch(box, { rub: mouse.matches, wipe: MOTION.d3 }); setTimeout(() => primeRolls(box, true), 0); })   // the foil first; the numbers under it in a turn of their own
    .catch(() => releaseRolls(box));                          // no foil after all: the list is simply there
  if (!('IntersectionObserver' in window)) { boxes.forEach(mount); return; }
  if (!scratchWatch) {
    scratchWatch = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        scratchWatch.unobserve(entry.target);
        mount(entry.target);
      }
    }, { rootMargin: '500px 0px' });
  }
  boxes.forEach((box) => scratchWatch.observe(box));
}

function initPointer() {
  if (!mouse.matches || calm.matches) return;                 // mouse only; never on touch or with reduced motion
  const load = () => import('./pointer.js').then((m) => m.mountPointer({ loop })).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 });
  else setTimeout(load, 1200);
}

/* ------------------------------------------------------------------ start */

function start() {
  runIntro();
  initAnchors();
  initSheet();
  initScratch();
  initData();
  initNav();
  initLightbox();
  initEnquiry();
  initMap();
  initAmbient();
  initReels();
  initTickets();
  initSmoothScroll();
  initPointer();

  // The entrances and the number reels measure text, so they wait for the fonts (but never for long).
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 1200))]).then(() => { armEntrances(); armRolls(); });

  // A scroll (however it was made) or a turn of the wheel asks for one frame.
  window.addEventListener('scroll', () => { scrolledAt = performance.now(); wake(); }, { passive: true });
  window.addEventListener('wheel', wake, { passive: true });
  document.addEventListener('touchstart', () => {}, { passive: true });        // lets :active show its press on a touch screen
  // On paper, every number shows its value.
  window.addEventListener('beforeprint', () => { for (const el of $$('.is-set')) unwind(el); });

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
