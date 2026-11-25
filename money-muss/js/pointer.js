// Pointer extras, fetched only for a mouse with normal motion settings (see initPointer in main.js).
// 1. A small rose dot trails the pointer and opens to say "Look" over a photo that can be opened.
// 2. A magnetic pull: the main buttons and the footer chip lean up to 6px towards the pointer, and spring back.
// Both ride the page's one frame loop: the pointer sets a target, the loop eases towards it, then sleeps.

const MAGNETS = '.btn:not(.btn--line), .nav__cta, .token';
const PULL = 6;            // the furthest a magnet leans, in pixels
const REACH = 0.3;         // how much of the pointer's distance from the centre it follows

export function mountPointer({ loop }) {
  if (document.querySelector('.cursor')) return;
  const chip = document.createElement('div');
  chip.className = 'cursor';
  chip.setAttribute('aria-hidden', 'true');
  chip.dataset.mode = 'dot';
  chip.innerHTML = '<div class="cursor__chip"><span class="cursor__label">Look</span></div>';
  document.body.appendChild(chip);

  let shown = false;
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let pull = null;         // the magnet under the pointer: { el, x, y, tx, ty, cx, cy, fresh }

  const modeFor = (target) => {
    if (!target || !target.closest) return 'dot';
    if (target.closest('input, textarea, select, iframe, .map, .scratch__canvas')) return 'none';   // never in the way of typing, the map or the scratch card
    if (target.closest(MAGNETS)) return 'none';                                                     // the pull is the feedback there: one effect at a time
    if (target.closest('[data-cursor="look"]')) return 'look';
    return 'dot';
  };

  const letGo = () => {
    if (!pull) return;
    pull.el.classList.remove('is-pulled');                 // from here the stylesheet springs it back (--spring-smooth)
    pull.el.style.translate = '';
    pull = null;
  };
  const hide = () => { shown = false; chip.classList.remove('is-on'); letGo(); };

  loop.add(({ dt }) => {
    const k = dt / 16.7;                                   // the same feel at 60 and at 120 frames a second
    let live = false;
    if (shown) {
      const f = 1 - Math.pow(0.7, k);
      x += (tx - x) * f;
      y += (ty - y) * f;
      chip.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) live = true;
    }
    if (pull) {
      const f = 1 - Math.pow(0.85, k);                     // a lerp of 0.15 a frame
      pull.x += (pull.tx - pull.x) * f;
      pull.y += (pull.ty - pull.y) * f;
      pull.el.style.translate = `${pull.x.toFixed(2)}px ${pull.y.toFixed(2)}px`;
      if (Math.abs(pull.tx - pull.x) > 0.05 || Math.abs(pull.ty - pull.y) > 0.05) live = true;
    }
    return live;
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') { hide(); return; }
    tx = e.clientX;
    ty = e.clientY;
    if (!shown) { shown = true; x = tx; y = ty; chip.classList.add('is-on'); }
    if (pull) {
      if (!pull.fresh) {
        // Read the button's resting centre once (and again after a scroll), never inside the frame loop.
        const r = pull.el.getBoundingClientRect();
        pull.cx = r.left + r.width / 2 - pull.x;
        pull.cy = r.top + r.height / 2 - pull.y;
        pull.fresh = true;
      }
      let px = (tx - pull.cx) * REACH;
      let py = (ty - pull.cy) * REACH;
      const far = Math.hypot(px, py);
      if (far > PULL) { px *= PULL / far; py *= PULL / far; }
      pull.tx = px;
      pull.ty = py;
    }
    loop.wake();
  }, { passive: true });

  window.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const mode = modeFor(e.target);
    if (chip.dataset.mode !== mode) chip.dataset.mode = mode;
    const magnet = e.target.closest ? e.target.closest(MAGNETS) : null;
    if (magnet === (pull && pull.el)) return;
    letGo();
    if (magnet) {
      pull = { el: magnet, x: 0, y: 0, tx: 0, ty: 0, cx: 0, cy: 0, fresh: false };
      magnet.classList.add('is-pulled');
    }
  }, { passive: true });

  window.addEventListener('scroll', () => { if (pull) pull.fresh = false; }, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') hide(); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', hide);
  window.addEventListener('blur', hide);
}
