// Page overlay for recordings: smooth in-page cursor (window.__glide), click ring in the site's --brand colour, no map iframe.
const CURSOR = () => {
  const style = document.createElement('style');
  style.textContent = `html{scroll-behavior:auto!important}
    #__cur{position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .4s;filter:drop-shadow(0 2px 5px rgba(0,0,0,.7))}
    #__cur.on{opacity:1}
    #__cur::before{content:"";position:absolute;left:-14px;top:-14px;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--brand,#A3CF3E) 45%,transparent),transparent 70%)}
    #__ring{position:fixed;left:0;top:0;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:3px solid var(--brand,#A3CF3E);z-index:2147483646;pointer-events:none;opacity:0}
    #__ring.go{animation:__ring .55s ease-out}
    @keyframes __ring{from{opacity:.95;transform:scale(.25)}to{opacity:0;transform:scale(1.5)}}`;
  const add = () => {
    document.head.appendChild(style);
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" style="position:relative"><path d="M4 2l15 9.5-6.6 1.4 3.9 7.4-2.7 1.4-3.9-7.5L4 19z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = '__ring';
    document.body.append(c, r);
    // the visible cursor animates in the page (smooth at full frame rate); real mouse events only land at the end of a move
    let cx = innerWidth / 2, cy = innerHeight * 0.8;
    try { const p = JSON.parse(sessionStorage.getItem('__cur') || 'null'); if (p) { cx = p[0]; cy = p[1]; c.classList.add('on'); } } catch (e) {}
    const place = () => { c.style.transform = `translate(${cx - 4}px,${cy - 3}px)`; try { sessionStorage.setItem('__cur', JSON.stringify([cx, cy])); } catch (e) {} };
    place();
    window.__glide = (x, y, ms) => new Promise(res => {
      c.classList.add('on'); const sx = cx, sy = cy, t = performance.now();
      const st = n => { const p = Math.min(1, (n - t) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; cx = sx + (x - sx) * e; cy = sy + (y - sy) * e; place(); p < 1 ? requestAnimationFrame(st) : res(); };
      requestAnimationFrame(st);
    });
    addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; place(); c.classList.add('on'); }, true);
    addEventListener('mousedown', e => { r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); }, true);
    document.querySelectorAll('iframe[src*="google.com/maps"]').forEach(f => f.remove());
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
};
module.exports = { CURSOR };
