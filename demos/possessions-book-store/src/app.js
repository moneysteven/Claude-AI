// UI layer: intro orchestration, nav, mobile menu, scroll reveals, pointer/tilt input.
import { initStock } from "./stock.js";
// No timers: CSS/WAAPI animations run on the compositor; JS only reacts to their events.
(() => {
  const d = document;
  const w = window;
  const html = d.documentElement;
  const reduce = w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = d) => el.querySelector(s);
  const $$ = (s, el = d) => Array.from(el.querySelectorAll(s));

  // Shared state with the 3D header (scene.js reads this).
  const PBS = (w.PBS = w.PBS || {});
  PBS.reduce = reduce;
  PBS.input = { tx: 0, ty: 0, tilt: false };
  PBS.revealed = false;
  PBS.heroVisible = true;
  const revealCbs = [];
  PBS.onReveal = (cb) => (PBS.revealed ? cb(PBS.revealTime) : revealCbs.push(cb));
  const reveal = () => {
    if (PBS.revealed) return;
    PBS.revealed = true;
    PBS.revealTime = performance.now();
    revealCbs.splice(0).forEach((cb) => cb(PBS.revealTime));
  };

  const nav = $('#nav');
  const main = $('#main');
  const footer = $('.footer');
  const hero = $('.hero');

  // ------------------------------------------------------------ intro
  const intro = $('#intro');
  const introOn = html.classList.contains('intro-on') && intro && !reduce;

  if (introOn) {
    try { sessionStorage.setItem('pbs-intro', '1'); } catch (e) { /* private mode */ }
    const shelved = [nav, main, footer].filter(Boolean);
    shelved.forEach((el) => (el.inert = true));
    spawnLetters();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      shelved.forEach((el) => (el.inert = false));
      intro.remove();
      d.removeEventListener('keydown', onKey);
    };
    const skip = () => {
      if (PBS.revealed) return; // header is already on its way in
      html.classList.add('intro-skip');
      reveal();
    };
    const onKey = (e) => { if (e.key === 'Escape') skip(); };

    intro.addEventListener('animationstart', (e) => {
      if (e.target === intro && e.animationName === 'intro-out') reveal();
    });
    intro.addEventListener('animationend', (e) => {
      if (e.target === intro && /^intro-out/.test(e.animationName)) finish();
    });
    $('.intro__skip', intro).addEventListener('click', skip);
    d.addEventListener('keydown', onKey);
  } else {
    if (intro) intro.remove();
    reveal();
  }

  function spawnLetters() {
    const box = $('.intro__letters', intro);
    if (!box || !box.animate) return;
    const glyphs = 'PossesinBkStreAabcdefghklmnoprstuwy&';
    const vw = w.innerWidth;
    const vh = w.innerHeight;
    const n = vw < 640 ? 22 : 34;
    const spread = Math.min(vw * 0.92, 980);
    const frag = d.createDocumentFragment();
    const items = [];
    for (let i = 0; i < n; i++) {
      const s = d.createElement('span');
      s.textContent = glyphs[(Math.random() * glyphs.length) | 0];
      s.style.fontSize = (16 + Math.random() * (vw < 640 ? 18 : 30)).toFixed(1) + 'px';
      frag.appendChild(s);
      items.push(s);
    }
    box.appendChild(frag);
    items.forEach((s, i) => {
      const x0 = (Math.random() - 0.5) * Math.min(vw * 0.3, 220);
      const y0 = (Math.random() - 0.5) * 40;
      const dx = (Math.random() - 0.5) * spread;
      const dy = -(vh * 0.22 + Math.random() * vh * 0.38);
      const r0 = (Math.random() - 0.5) * 30;
      const r1 = (Math.random() - 0.5) * 120;
      s.animate(
        [
          { transform: `translate3d(${x0}px, ${y0}px, 0) rotate(${r0}deg)`, opacity: 0 },
          { opacity: 1, offset: 0.18 },
          { opacity: 0.85, offset: 0.68 },
          { transform: `translate3d(${x0 + dx}px, ${y0 + dy}px, 0) rotate(${r1}deg)`, opacity: 0 },
        ],
        {
          duration: 1300 + Math.random() * 700,
          delay: 1050 + (i / n) * 1000 + Math.random() * 160,
          easing: 'cubic-bezier(.2,.65,.3,1)',
          fill: 'both',
        }
      );
    });
  }

  // ------------------------------------------------------------ nav state (no scroll listeners)
  if ('IntersectionObserver' in w) {
    const sentinel = d.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:48px;pointer-events:none';
    hero.appendChild(sentinel);
    new IntersectionObserver(([e]) => nav.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);

    const title = $('.hero__title');
    new IntersectionObserver(([e]) => nav.classList.toggle('show-brand', !e.isIntersecting), {
      rootMargin: '-80px 0px 0px 0px',
    }).observe(title);

    new IntersectionObserver(([e]) => {
      PBS.heroVisible = e.isIntersecting;
      html.classList.toggle('hero-off', !e.isIntersecting);
      if (PBS.onHeroVisibility) PBS.onHeroVisibility(e.isIntersecting);
    }).observe(hero);

    // active section in the desktop menu
    const links = new Map($$('.nav__links a').map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const a = links.get(e.target.id);
          if (!a) return;
          if (e.isIntersecting) {
            links.forEach((l) => l.removeAttribute('aria-current'));
            a.setAttribute('aria-current', 'true');
          } else if (a.getAttribute('aria-current')) {
            a.removeAttribute('aria-current');
          }
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    links.forEach((_, id) => { const s = d.getElementById(id); if (s) io.observe(s); });
  }

  // ------------------------------------------------------------ mobile menu
  const toggle = $('.nav__toggle');
  const menu = $('#menu');
  const label = $('.nav__toggle-label');
  let menuOpen = false;
  const focusables = () => [toggle, ...$$('a', menu)];
  const setMenu = (open, restoreFocus) => {
    if (open === menuOpen) return;
    menuOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Close' : 'Menu';
    html.classList.toggle('menu-open', open);
    menu.inert = !open;
    main.inert = open;
    if (footer) footer.inert = open;
    if (open) $('a', menu).focus({ preventScroll: true });
    else if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => setMenu(!menuOpen, true));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false, false)));
  d.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    if (e.key === 'Escape') { setMenu(false, true); return; }
    if (e.key === 'Tab') {
      const f = focusables();
      const i = f.indexOf(d.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  w.matchMedia('(min-width: 960px)').addEventListener('change', (m) => m.matches && setMenu(false, false));

  // ------------------------------------------------------------ scroll reveals
  const rvEls = $$('.rv');
  if (reduce || !('IntersectionObserver' in w)) {
    rvEls.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target;
          io.unobserve(el);
          el.style.willChange = 'transform, opacity';
          const done = (ev) => {
            if (ev.target !== el || ev.propertyName !== 'transform') return;
            el.style.willChange = '';
            el.removeEventListener('transitionend', done);
          };
          el.addEventListener('transitionend', done);
          requestAnimationFrame(() => el.classList.add('in'));
        });
      },
      // fire when the top edge is 10% into the viewport, however tall the element is
      { rootMargin: '0px 0px -10% 0px', threshold: 0 }
    );
    rvEls.forEach((el) => io.observe(el));
  }

  // ------------------------------------------------------------ stock list + my booklist
  initStock({ reduce, html });

  // ------------------------------------------------------------ pointer + tilt (passive, stored only)
  if (!reduce) {
    const inp = PBS.input;
    w.addEventListener(
      'pointermove',
      (e) => {
        if (inp.tilt && e.pointerType !== 'mouse') return;
        inp.tx = (e.clientX / w.innerWidth) * 2 - 1;
        inp.ty = (e.clientY / w.innerHeight) * 2 - 1;
      },
      { passive: true }
    );

    let base = null;
    const onOrient = (e) => {
      if (e.beta == null || e.gamma == null) return;
      const angle = (screen.orientation && screen.orientation.angle) || w.orientation || 0;
      let x = e.gamma, y = e.beta;
      if (angle === 90) { x = e.beta; y = -e.gamma; }
      else if (angle === -90 || angle === 270) { x = -e.beta; y = e.gamma; }
      if (!base) base = { x, y };
      // slowly re-centre so any holding angle feels neutral
      base.x += (x - base.x) * 0.004;
      base.y += (y - base.y) * 0.004;
      inp.tx = Math.max(-1, Math.min(1, (x - base.x) / 18));
      inp.ty = Math.max(-1, Math.min(1, (y - base.y) / 18));
      inp.tilt = true;
    };
    const listen = () => w.addEventListener('deviceorientation', onOrient, { passive: true });
    const DOE = w.DeviceOrientationEvent;
    const coarse = w.matchMedia('(pointer: coarse)').matches;
    if (DOE && coarse) {
      if (typeof DOE.requestPermission === 'function') {
        // iOS: ask only after a tap on the header background, never on a link/button tap.
        const ask = (e) => {
          if (e.target.closest('a, button')) return;
          hero.removeEventListener('click', ask);
          DOE.requestPermission().then((s) => s === 'granted' && listen()).catch(() => {});
        };
        hero.addEventListener('click', ask);
      } else {
        listen();
      }
    }
  }
})();
