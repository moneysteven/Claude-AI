// Pointer companion: a small rose chip that trails the mouse, grows over links ("Tap")
// and over photos that open ("Look"). The real pointer stays visible the whole time.
// Loaded only for a mouse with normal motion settings (see initCursor in main.js),
// so it never runs on touch screens or with reduced motion.

export function mountCursor() {
  if (document.querySelector('.cursor')) return;
  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  el.dataset.mode = 'dot';
  el.innerHTML = '<div class="cursor__chip"><span class="cursor__label"></span></div>';
  document.body.appendChild(el);
  const label = el.querySelector('.cursor__label');

  let x = 0, y = 0, tx = 0, ty = 0, frame = 0, shown = false;

  const modeFor = (target) => {
    if (!target || !target.closest) return 'dot';
    if (target.closest('input, textarea, select, iframe, .map, .scratch__canvas')) return 'none';     // never in the way of typing, the map or the scratch card
    if (target.closest('[data-cursor="look"]')) return 'look';
    if (target.closest('[aria-disabled="true"]')) return 'dot';
    if (target.closest('a, button, summary, label')) return 'tap';
    return 'dot';
  };

  const draw = () => {
    frame = 0;
    x += (tx - x) * 0.3;
    y += (ty - y) * 0.3;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) frame = requestAnimationFrame(draw);
  };

  const hide = () => { shown = false; el.classList.remove('is-on'); };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') { hide(); return; }
    tx = e.clientX;
    ty = e.clientY;
    if (!shown) { shown = true; x = tx; y = ty; el.classList.add('is-on'); }
    if (!frame) frame = requestAnimationFrame(draw);
  }, { passive: true });

  window.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const mode = modeFor(e.target);
    if (el.dataset.mode === mode) return;
    el.dataset.mode = mode;
    if (mode === 'tap') label.textContent = 'Tap';
    if (mode === 'look') label.textContent = 'Look';
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') hide(); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', hide);
  window.addEventListener('blur', hide);
}
