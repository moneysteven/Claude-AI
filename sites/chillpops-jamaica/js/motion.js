/* Motion layer: ambient, smooth animation on top of main.js. Everything here is skipped with reduced motion.
   Remove the <script src="js/motion.js"> tag from a page to turn it all off. */
(() => {
  const R = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('svg').forEach(s => s.pauseAnimations && s.pauseAnimations());
    return;
  }
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lite = !!(navigator.connection && navigator.connection.saveData);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }),
    { threshold: .12, rootMargin: '0px 0px -6% 0px' });

  // 1. headline letters rise one by one (screen readers still get the whole heading)
  $$('.hero h1').forEach(h1 => {
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
    let k = 0;
    $$('.mask > span', h1).forEach(line => {
      line.parentElement.setAttribute('aria-hidden', 'true');
      const walk = node => [...node.childNodes].forEach(n => {
        if (n.nodeType !== 3) return walk(n);
        const f = document.createDocumentFragment();
        for (const c of n.textContent) {
          if (c === ' ') { f.append(' '); continue; }
          const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; s.style.setProperty('--i', k++); f.append(s);
        }
        n.replaceWith(f);
      });
      walk(line); line.classList.add('chars'); k += 2;
    });
  });

  // 2. section headings slide up line by line
  $$('h2[data-reveal], .footer__cta h2').forEach(h => {
    h.innerHTML = h.innerHTML.split(/<br\s*\/?>/i).map(p => `<span class="mask"><span>${p.trim()}</span></span>`).join('');
    h.classList.add('lines'); io.observe(h);
  });

  // 3. photos open like a rising curtain. A fully clipped element counts as invisible to IntersectionObserver,
  //    so these are revealed from the scroll handler below, by position.
  const curtains = new Set();
  $$('.card, .chapter__media, .welcome__media picture, .footer__word').forEach(el => { el.classList.add('rv-clip'); curtains.add(el); });
  $$('.masonry .tile:not(.tile--ph)').forEach((el, i) => { el.classList.add('rv-clip'); el.style.setProperty('--delay', `${(i % 3) * .09}s`); curtains.add(el); });
  const openCurtains = H => curtains.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height && r.top < H * .9 && r.bottom > 0) { el.classList.add('is-in'); curtains.delete(el); }
  });

  // 4. one scroll handler: progress line, hero depth, drifting outline word, promo headline zoom
  const nav = $('.nav'), bar = document.createElement('span');
  bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true'); nav && nav.append(bar);
  const hero = $('.hero'), home = hero && !hero.classList.contains('hero--page');
  const heroContent = hero && $('.hero__content', hero), heroMedia = home && $('.hero__media', hero);
  const drift = $('.welcome__media'), promoH = $('.promo h2');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = scrollY, H = innerHeight, max = R.scrollHeight - H;
    bar.style.transform = `scaleX(${max > 0 ? (y / max).toFixed(4) : 0})`;
    if (curtains.size) openCurtains(H);
    if (heroContent && y < hero.offsetHeight) {
      heroContent.style.translate = `0 ${(y * .22).toFixed(1)}px`;
      heroContent.style.opacity = (1 - clamp(y / (hero.offsetHeight * .85), 0, 1)).toFixed(3);
      if (heroMedia && innerWidth > 860) heroMedia.style.translate = `0 ${(y * .08).toFixed(1)}px`;
    }
    if (drift) { const r = drift.getBoundingClientRect(); drift.style.setProperty('--drift', `${((r.top + r.height / 2 - H / 2) * -.12).toFixed(1)}px`); }
    if (promoH) { const r = promoH.getBoundingClientRect(); promoH.style.scale = (1 - clamp(Math.abs(r.top + r.height / 2 - H / 2) / H, 0, 1) * .12).toFixed(3); }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  requestAnimationFrame(() => requestAnimationFrame(onScroll)); // after first paint, so photos already on screen still animate open

  // 5. the pink strip speeds up and changes direction with your scrolling
  const track = $('.marquee__track');
  if (track) {
    const strip = track.closest('.marquee'); track.style.animation = 'none';
    let x = 0, v = 0, dir = 1, last = scrollY, run = false, hover = false, id = 0;
    const step = () => {
      const dy = scrollY - last; last = scrollY; if (dy) dir = dy > 0 ? 1 : -1;
      v += (Math.min(Math.abs(dy), 60) - v) * .08;
      const half = track.scrollWidth / 2;
      x -= (hover ? 0 : 1) * (.9 + v * .35) * dir;
      if (x <= -half) x += half; if (x > 0) x -= half;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      id = run ? requestAnimationFrame(step) : 0;
    };
    strip.addEventListener('mouseenter', () => { hover = true; }); strip.addEventListener('mouseleave', () => { hover = false; });
    new IntersectionObserver(([e]) => { run = e.isIntersecting; if (run && !id) { last = scrollY; id = requestAnimationFrame(step); } }).observe(strip);
  }

  // 6. warm embers drifting up through the hero, like the shop's filament glow
  if (hero && !lite) {
    const cv = document.createElement('canvas'); cv.className = 'embers'; cv.setAttribute('aria-hidden', 'true');
    hero.insertBefore(cv, $('.bulbs', hero));
    const ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const sc = sprite.getContext('2d'), g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(.22, 'rgba(255,196,96,.7)'); g.addColorStop(1, 'rgba(255,140,60,0)');
    sc.fillStyle = g; sc.fillRect(0, 0, 64, 64);
    let W = 0, H = 0, P = [], run = false, id = 0;
    const spawn = any => ({ x: Math.random() * W, y: any ? Math.random() * H : H + 20, r: 3 + Math.random() * 11, vy: .18 + Math.random() * .5,
      ph: Math.random() * 6.28, sp: .006 + Math.random() * .012, a: .3 + Math.random() * .5 });
    const size = () => {
      if (hero.offsetWidth === W) return;
      W = hero.offsetWidth; H = hero.offsetHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      P = Array.from({ length: W < 760 ? 16 : 34 }, () => spawn(true));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
      for (const p of P) {
        p.y -= p.vy; p.ph += p.sp; if (p.y < -30) Object.assign(p, spawn(false));
        ctx.globalAlpha = p.a * (.6 + .4 * Math.sin(p.ph * 2.3)) * clamp(p.y / (H * .35), 0, 1);
        ctx.drawImage(sprite, p.x + Math.sin(p.ph) * 16 - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      id = run ? requestAnimationFrame(draw) : 0;
    };
    size(); addEventListener('resize', size);
    new IntersectionObserver(([e]) => { run = e.isIntersecting; if (run && !id) id = requestAnimationFrame(draw); }).observe(hero);
  }

  // 7. the paleta frame tilts toward the cursor, with a moving shine
  const pop = home && $('.hero__pop', hero);
  if (pop && fine) {
    let tx = 0, ty = 0, cx = 0, cy = 0, id = 0;
    const loop = () => {
      cx += (tx - cx) * .08; cy += (ty - cy) * .08;
      pop.style.transform = `perspective(1000px) rotateY(${(cx * 10).toFixed(2)}deg) rotateX(${(-cy * 7).toFixed(2)}deg)`;
      pop.style.setProperty('--mx', `${(30 + cx * 40).toFixed(1)}%`); pop.style.setProperty('--my', `${(28 + cy * 40).toFixed(1)}%`);
      id = Math.abs(tx - cx) + Math.abs(ty - cy) > .002 ? requestAnimationFrame(loop) : 0;
    };
    hero.addEventListener('pointermove', e => {
      const r = pop.getBoundingClientRect();
      tx = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1); ty = clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1);
      if (!id) id = requestAnimationFrame(loop);
    });
    hero.addEventListener('pointerleave', () => { tx = ty = 0; if (!id) id = requestAnimationFrame(loop); });
  }

  // 8. cards tilt under a soft light; key buttons lean toward the cursor
  if (fine) {
    $$('.card').forEach(c => {
      c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.transform = `perspective(900px) rotateY(${((x - .5) * 7).toFixed(2)}deg) rotateX(${((.5 - y) * 7).toFixed(2)}deg)`;
        c.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`); c.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
      c.addEventListener('pointerleave', () => { c.style.transform = ''; });
    });
    $$('.hero .btn, .promo .btn, .footer__cta .btn, .nav__cta').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        b.style.translate = `${((e.clientX - r.left - r.width / 2) * .2).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * .3).toFixed(1)}px`;
      });
      b.addEventListener('pointerleave', () => { b.style.translate = ''; });
    });
  }

  // 9. tabs: one pill slides to the chosen tab
  $$('[role="tablist"]').forEach(tl => {
    const ind = document.createElement('span'); ind.className = 'tabs__ind'; ind.setAttribute('aria-hidden', 'true');
    tl.prepend(ind); tl.classList.add('has-ind');
    const place = () => {
      const t = $('[aria-selected="true"]', tl); if (!t) return;
      ind.style.width = `${t.offsetWidth}px`; ind.style.transform = `translateX(${t.offsetLeft}px)`;
      ind.style.backgroundColor = getComputedStyle(t).getPropertyValue('--accent').trim();
    };
    new MutationObserver(place).observe(tl, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    addEventListener('resize', place); document.fonts && document.fonts.ready.then(place); place();
  });

  // 10. palm-frond shade swaying over the light sections, drawn once
  if (!lite) $$('.section.light').forEach((sec, n) => {
    const cv = document.createElement('canvas'); cv.className = 'palm'; cv.setAttribute('aria-hidden', 'true'); cv.width = cv.height = 900;
    const c = cv.getContext('2d'); c.fillStyle = c.strokeStyle = '#3a1630';
    const frond = (ang, len) => {
      c.save(); c.translate(900, 0); c.rotate(ang);
      const leaves = 24; c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0);
      for (let i = 1; i <= 20; i++) { const t = i / 20; c.lineTo(t * len, Math.sin(t * Math.PI * .9) * len * .14); }
      c.stroke();
      for (let i = 2; i <= leaves; i++) {
        const t = i / leaves, px = t * len, py = Math.sin(t * Math.PI * .9) * len * .14, l = len * .36 * Math.sin(Math.PI * Math.min(1, t * 1.02)) + 14;
        for (const s of [-1, 1]) {
          c.save(); c.translate(px, py); c.rotate(s * (1 - t * .45) + .35);
          c.beginPath(); c.ellipse(l / 2, 0, l / 2, 4 + 5 * (1 - t), 0, 0, Math.PI * 2); c.fill(); c.restore();
        }
      }
      c.restore();
    };
    [[2.05, 700], [2.45, 760], [2.85, 640], [1.7, 520]].forEach(([a, l]) => frond(a + n * .08, l));
    sec.prepend(cv);
  });
})();
