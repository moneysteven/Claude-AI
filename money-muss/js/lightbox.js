// Photo viewer. Fetched only when there are photos to open (see initLightbox in main.js).
// - A photo zooms out of its own thumbnail and, on closing, back into it. A copy makes the flight (a FLIP:
//   laid out where it will end up, only its transform and clip-path animated); the real photos swap in.
// - Swipe sideways for the next photo (the track's own scrolling); swipe down to put it away: it follows
//   the finger, and pulling the wrong way meets resistance. Keys, buttons, Esc and a tap outside all work.
// - With reduced motion nothing zooms or follows the finger: the viewer simply fades.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rubber = (distance, size) => (1 - 1 / ((distance * 0.55) / size + 1)) * size;

export function createLightbox({ box, tiles, calm, loop, motion, hold, release }) {
  const track = box.querySelector('#lightbox-track');
  const shade = box.querySelector('.lightbox__shade');
  const count = box.querySelector('#lightbox-count');
  const prev = box.querySelector('#lightbox-prev');
  const next = box.querySelector('#lightbox-next');
  let names = [];
  let busy = false;          // a flight or a fade is under way
  let opener = null;         // the thumbnail the viewer was opened from
  let ghost = null;          // the copy that flies
  let drag = null;
  let draggedAt = 0;

  /* ---------- slides ---------- */

  const build = () => {
    names = [];
    track.textContent = '';
    for (const tile of tiles) {
      const name = tile.dataset.open;
      if (names.includes(name)) continue;
      const media = tile.querySelector('picture');
      if (!media) continue;
      names.push(name);
      const clone = media.cloneNode(true);
      clone.removeAttribute('style');
      const img = clone.querySelector('img');
      if (img) {
        img.classList.remove('photo');
        img.removeAttribute('style');
        img.loading = 'lazy';
        img.decoding = 'async';
        // Tell the browser how wide the photo will really be shown, so it fetches the right file.
        const ratio = (Number(img.getAttribute('width')) || 3) / (Number(img.getAttribute('height')) || 4);
        const shown = Math.ceil(Math.min(window.innerWidth - 32, (window.innerHeight - 144) * ratio));
        clone.querySelectorAll('source, img').forEach((n) => n.setAttribute('sizes', `${Math.max(240, shown)}px`));
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

  const index = () => clamp(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)), 0, Math.max(0, names.length - 1));
  const imgAt = (i) => (track.children[i] ? track.children[i].querySelector('img') : null);
  const sync = () => {
    const i = index();
    count.textContent = `${i + 1} / ${names.length}`;
    prev.disabled = i <= 0;
    next.disabled = i >= names.length - 1;
  };
  const go = (i, smooth) => {
    const to = clamp(i, 0, names.length - 1);
    track.scrollTo({ left: to * track.clientWidth, behavior: smooth && !calm.matches ? 'smooth' : 'auto' });
  };

  /* ---------- the flight between a thumbnail and the viewer ---------- */

  // Where a thumbnail is and how it shows its photo: centre, laid-out size, tilt, and which part it crops to.
  const thumbOf = (tile) => {
    const img = tile ? tile.querySelector('img') : null;
    if (!img || img.offsetParent === null) return null;
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;   // not on screen: nothing to fly to
    let turn = 0;
    for (let n = img; n && n !== tile.parentElement; n = n.parentElement) {
      const deg = parseFloat(getComputedStyle(n).rotate);
      if (Number.isFinite(deg)) turn += deg;
    }
    const pos = getComputedStyle(img).objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
    return { img, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: img.offsetWidth || r.width, h: img.offsetHeight || r.height, turn, px: pos[0] ?? 0.5, py: pos[1] ?? 0.5 };
  };

  // The thumbnail a photo should fly home to: the one it was opened from if that is still its photo, else any on screen.
  const homeOf = (name) => {
    if (opener && opener.dataset.open === name) { const t = thumbOf(opener); if (t) return t; }
    for (const tile of tiles) { if (tile.dataset.open === name) { const t = thumbOf(tile); if (t) return t; } }
    return null;
  };

  // Where the photo rests in the viewer. Measured if it is already laid out, worked out from its slide if it is still loading.
  const restOf = (slide, img) => {
    const real = img.getBoundingClientRect();
    if (img.complete && img.naturalWidth && real.width > 2) return real;
    const cs = getComputedStyle(slide);
    const outer = slide.getBoundingClientRect();
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const ratio = (Number(img.getAttribute('width')) || 3) / (Number(img.getAttribute('height')) || 4);
    const width = Math.min(outer.width - padX, (outer.height - padY) * ratio, parseFloat(img.sizes) || Infinity);
    const height = width / ratio;
    return { left: outer.left + (outer.width - width) / 2, top: outer.top + (outer.height - height) / 2, width, height };
  };

  const clearGhost = () => { if (ghost) { ghost.remove(); ghost = null; } };

  // Lays a copy of the photo over its place in the viewer and animates it from (or to) the thumbnail:
  // one transform (move, tilt, scale) and one clip-path (the thumbnail's crop). Nothing else changes.
  const fly = (thumb, rect, opening, src) => {
    const s = Math.max(thumb.w / rect.width, thumb.h / rect.height);            // the photo covers its thumbnail
    const seenW = thumb.w / s;                                                   // the part of the photo the thumbnail shows
    const seenH = thumb.h / s;
    const left = (rect.width - seenW) * thumb.px;
    const top = (rect.height - seenH) * thumb.py;
    const offX = (left + seenW / 2 - rect.width / 2) * s;                        // that part's centre, measured from the photo's centre
    const offY = (top + seenH / 2 - rect.height / 2) * s;
    const a = (thumb.turn * Math.PI) / 180;
    const tx = thumb.cx - (rect.left + rect.width / 2) - (offX * Math.cos(a) - offY * Math.sin(a));
    const ty = thumb.cy - (rect.top + rect.height / 2) - (offX * Math.sin(a) + offY * Math.cos(a));
    const small = {
      transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${thumb.turn}deg) scale(${s.toFixed(5)})`,
      clipPath: `inset(${top.toFixed(2)}px ${(rect.width - seenW - left).toFixed(2)}px ${(rect.height - seenH - top).toFixed(2)}px ${left.toFixed(2)}px)`,
    };
    const large = { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', clipPath: 'inset(0px 0px 0px 0px)' };

    clearGhost();
    ghost = document.createElement('img');
    ghost.className = 'lightbox__ghost';
    ghost.alt = '';
    ghost.decoding = 'sync';
    ghost.src = src;
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    box.appendChild(ghost);
    const frames = opening ? [small, large] : [large, small];
    let anim;
    try { anim = ghost.animate(frames, { duration: motion.d3, easing: motion.smooth, fill: 'both' }); }
    catch (err) { anim = ghost.animate(frames, { duration: motion.d3, easing: motion.out, fill: 'both' }); }
    return anim.finished.catch(() => {});
  };

  /* ---------- open and close ---------- */

  const open = (tile) => {
    if (box.open || busy) return;
    if (!track.children.length) build();
    const at = Math.max(0, names.indexOf(tile.dataset.open));
    const thumb = calm.matches ? null : thumbOf(tile);                           // read the thumbnail before anything moves
    opener = tile;
    box.showModal();
    hold();
    go(at, false);
    sync();
    const img = imgAt(at);
    if (img) img.loading = 'eager';
    if (thumb && img) {
      const rect = restOf(track.children[at], img);
      busy = true;
      box.classList.add('is-flying');
      thumb.img.style.visibility = 'hidden';                                     // the photo has left its frame
      const mine = fly(thumb, rect, true, thumb.img.currentSrc || thumb.img.src);
      mine.then(() => {
        busy = false;
        thumb.img.style.visibility = '';
        // Swap the copy for the real photo as soon as that is ready to show (it nearly always is by now).
        const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
        const flown = ghost;
        Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 1500))]).then(() => {
          if (ghost !== flown) return;                                           // a close has already taken over
          box.classList.remove('is-flying');
          clearGhost();
        });
      });
    }
    requestAnimationFrame(() => box.classList.add('is-open'));
  };

  const close = () => {
    if (!box.open || busy) return;
    busy = true;
    const i = index();
    const img = imgAt(i);
    const from = img ? img.getBoundingClientRect() : null;                       // wherever a swipe has left it
    const thumb = !calm.matches && img && img.complete && img.naturalWidth && from.width > 2 ? homeOf(names[i]) : null;
    const done = () => {
      busy = false;
      clearGhost();
      box.classList.remove('is-open', 'is-flying', 'is-dragging');
      for (const m of track.querySelectorAll('.slide__media')) { m.style.transform = ''; m.style.willChange = ''; }
      box.close();
      release();
      opener = null;
    };
    if (shade) shade.style.opacity = '';                                         // from wherever a swipe left it, it now fades out
    if (thumb) {
      box.classList.add('is-flying');
      box.classList.remove('is-open', 'is-dragging');                            // the shade and the buttons fade as it goes
      thumb.img.style.visibility = 'hidden';
      fly(thumb, from, false, img.currentSrc || img.src).then(() => { thumb.img.style.visibility = ''; done(); });
    } else {
      clearGhost();
      box.classList.remove('is-open', 'is-flying', 'is-dragging');               // no thumbnail on screen to return to: it fades
      setTimeout(done, (calm.matches ? 150 : motion.d2) + 40);
    }
  };

  /* ---------- swipe down to put it away (touch) ---------- */

  const paint = () => {
    if (!drag || !drag.dirty) return false;
    drag.dirty = false;
    const y = drag.dy > 0 ? drag.dy : -rubber(-drag.dy, drag.h);
    const p = clamp(y / (drag.h * 0.5), 0, 1);
    drag.media.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${(1 - 0.1 * p).toFixed(4)})`;
    if (shade) shade.style.opacity = (1 - 0.8 * p).toFixed(3);
    return false;                                                                // the next move of the finger asks for the next frame
  };
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || busy || calm.matches) return;
    const slide = track.children[index()];
    const media = slide ? slide.querySelector('.slide__media') : null;
    if (!media) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dy: 0, v: 0, t: e.timeStamp, h: window.innerHeight, on: false, dirty: false, media };
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx) * 1.3) return;         // sideways belongs to the track
      drag.on = true;
      drag.y0 = e.clientY;                                                       // start from here, so nothing jumps
      drag.t = e.timeStamp;
      clearGhost();
      box.classList.remove('is-flying');
      box.classList.add('is-dragging');
      drag.media.style.willChange = 'transform';
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      loop.add(paint);
    }
    const dy = e.clientY - drag.y0;
    const dt = Math.max(1, e.timeStamp - drag.t);
    drag.v = 0.6 * drag.v + 0.4 * ((dy - drag.dy) / dt);                         // smoothed, pixels per millisecond
    drag.t = e.timeStamp;
    drag.dy = dy;
    drag.dirty = true;
    loop.wake();
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { on, dy, v, media } = drag;
    drag = null;
    if (!on) return;
    loop.remove(paint);
    draggedAt = e.timeStamp;
    if (e.type === 'pointerup' && (dy > 110 || (dy > 24 && v > 0.55))) { close(); return; }
    box.classList.remove('is-dragging');                                         // not far enough: it springs back
    media.style.transform = '';
    if (shade) shade.style.opacity = '';
    setTimeout(() => { if (!drag) media.style.willChange = ''; }, motion.d2 + 40);
  };
  track.addEventListener('pointerup', drop);
  track.addEventListener('pointercancel', drop);

  /* ---------- controls ---------- */

  box.querySelector('#lightbox-close').addEventListener('click', close);
  prev.addEventListener('click', () => go(index() - 1, true));
  next.addEventListener('click', () => go(index() + 1, true));
  box.addEventListener('cancel', (e) => { e.preventDefault(); close(); });                 // Esc
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index() - 1, false); }             // keys land at once
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index() + 1, false); }
  });
  // A tap on the dark space around a photo closes the viewer.
  track.addEventListener('click', (e) => {
    if (e.timeStamp - draggedAt < 350) return;                                             // that was the end of a swipe, not a tap
    if (!e.target.closest('img')) close();
  });
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      sync();
      if (ghost && !busy) { box.classList.remove('is-flying'); clearGhost(); }             // moved on before the swap: drop the copy
    });
  }, { passive: true });
  window.addEventListener('resize', () => { if (box.open) go(index(), false); });

  return { open, close };
}
