// Scratch-to-reveal for the deals on a weekly-night ticket.
// Loaded only when a scratch panel comes near the screen (see initScratch in main.js).
//
// - Mouse: a foil drawn on a canvas, rubbed away by pressing and dragging.
// - Touch: one big "Tap to reveal" button.
// - Keyboard: a "Reveal" button that shows itself when focused.
// The deals underneath stay in the page the whole time, so screen readers can always read them.
// With scripts off or reduced motion this file never runs and the deals are a plain list.

const INK = '#2B2F3A';
const CREAM = '#EFE6C8';
const YELLOW = '#E9B949';

function paintFoil(canvas) {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, box.width, box.height);
  // A fine dot screen, like the silver on a scratch card.
  ctx.fillStyle = 'rgba(239, 230, 200, 0.16)';
  for (let y = 6; y < box.height; y += 12) {
    for (let x = 6 + ((y / 12) % 2) * 6; x < box.width; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const size = Math.max(22, Math.min(34, box.width / 9));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CREAM;
  ctx.font = `800 condensed ${size}px "Bricolage Grotesque", "Arial Narrow", Arial, sans-serif`;
  ctx.fillText('SCRATCH HERE', box.width / 2, box.height / 2 - size * 0.32);
  ctx.fillStyle = YELLOW;
  ctx.font = '500 11px "DM Mono", "Courier New", monospace';
  ctx.fillText('PRESS AND RUB', box.width / 2, box.height / 2 + size * 0.62);
  return { ctx, width: box.width, height: box.height, dpr };
}

// How much of the foil has been rubbed off (0 to 1), read from a coarse grid of pixels.
function cleared(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(4, Math.round(Math.min(width, height) / 40)) * 4;
  let seen = 0;
  let open = 0;
  for (let y = 0; y < height; y += step / 4) {
    for (let x = 0; x < width; x += step / 4) {
      seen += 1;
      if (data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] < 40) open += 1;
    }
  }
  return seen ? open / seen : 0;
}

export function mountScratch(box, { rub = false } = {}) {
  if (!box || box.dataset.scratchReady) return;
  box.dataset.scratchReady = '1';
  const deals = box.querySelector('.scratch__deals');
  const foil = document.createElement('div');
  foil.className = 'scratch__foil';

  const reveal = () => {
    if (box.classList.contains('is-done')) return;
    const hadFocus = foil.contains(document.activeElement);
    box.classList.add('is-done');
    if (hadFocus && deals) { deals.tabIndex = -1; deals.focus({ preventScroll: true }); }
    setTimeout(() => foil.remove(), 560);
  };

  if (!rub) {
    // Touch: lift the whole foil with one tap.
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'scratch__cover';
    cover.innerHTML = 'Tap to reveal<small>The deals are under here</small>';
    cover.addEventListener('click', reveal);
    foil.appendChild(cover);
    box.appendChild(foil);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'scratch__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const key = document.createElement('button');
  key.type = 'button';
  key.className = 'scratch__key';
  key.textContent = 'Reveal';
  key.setAttribute('aria-label', 'Reveal the deals without scratching');
  key.addEventListener('click', reveal);
  foil.append(canvas, key);
  box.appendChild(foil);

  let surface = paintFoil(canvas);
  // The lettering wants the site fonts; repaint once they are in, if nothing has been rubbed yet.
  let touched = false;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!touched && canvas.isConnected) surface = paintFoil(canvas); });

  let last = null;
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const rubTo = (p) => {
    const { ctx } = surface;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo((last || p).x, (last || p).y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    last = p;
  };
  canvas.addEventListener('pointerdown', (e) => {
    touched = true;
    last = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    rubTo(point(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    if (last === null && e.pointerType === 'mouse') return;
    rubTo(point(e));
  });
  const stop = () => {
    last = null;
    if (touched && cleared(canvas) > 0.45) reveal();
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  // If the ticket changes size before anything is rubbed, redraw the foil to fit.
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      if (!canvas.isConnected) { ro.disconnect(); return; }
      if (!touched) surface = paintFoil(canvas);
    });
    ro.observe(box);
  }
}
