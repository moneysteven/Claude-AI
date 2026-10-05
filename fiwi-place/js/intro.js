/*
 * Opening bonfire: logs come together and catch, the fire flares up into the
 * bonfire photo with "Bonfire Coming Up" and the FiWi logo, then the whole
 * screen fades away to the site. Runs for DURATION ms on every visit; a tap
 * or key press skips it. Visitors who ask their device to reduce motion skip
 * it entirely.
 *
 * Timeline (ms): logs 0-1900, fire catches 1100-3300, flare to photo
 * 3300-4100, text 4000-4700, hold so the details can be read, fade out
 * from DURATION - FADE_OUT.
 */
(function () {
  var intro = document.getElementById('intro');
  if (!intro) return;

  var DURATION = 10000;
  var FADE_OUT = 800;
  var root = document.documentElement;
  var done = false;

  function finish() {
    if (done) return;
    done = true;
    if (intro.parentNode) intro.parentNode.removeChild(intro);
    root.classList.remove('intro-lock');
    document.dispatchEvent(new Event('fiwi:intro-done'));
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = intro.querySelector('canvas');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (reduce || !ctx) { finish(); return; }

  root.classList.add('intro-lock');
  var photo = intro.querySelector('.intro-photo');
  var photoBg = intro.querySelector('.intro-photo-bg');
  var flash = intro.querySelector('.intro-flash');
  var text = intro.querySelector('.intro-text');

  // ---- sizing ----
  var W, H, u, cx, by, dpr;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    u = Math.min(W * 1.1, H * 0.9) / 10;
    cx = W / 2; by = H * 0.8;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- soft glow sprites, one per flame colour ----
  function sprite(r, g, b) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    var grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    grd.addColorStop(0.4, 'rgba(' + r + ',' + g + ',' + b + ',0.55)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }
  var SPR_CORE = sprite(255, 236, 180);
  var SPR_YELLOW = sprite(255, 196, 64);
  var SPR_ORANGE = sprite(255, 128, 26);
  var SPR_RED = sprite(214, 58, 18);

  // ---- logs: [start offset x, start offset y, extra spin, final x, final y, angle, length, delay] (units of u) ----
  var LOGS = [
    [-7, 1.5, -0.9, -0.42, -1.25, -1.08, 3.0, 0],
    [7, 1.5, 0.9, 0.42, -1.25, 1.08, 3.0, 180],
    [-8, -1, -0.6, -0.82, -1.05, -0.86, 3.3, 380],
    [8, -1, 0.6, 0.82, -1.05, 0.86, 3.3, 560],
    [-9, 0.4, -0.3, -0.15, 0.08, 0.1, 4.3, 760],
    [9, 0.4, 0.3, 0.15, 0.12, -0.1, 4.3, 900]
  ];
  var FRONT = 4; // logs from this index are drawn in front of the flames

  function easeOutBack(x) { var c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

  function drawLog(L, t, heat) {
    var p = clamp01((t - L[7]) / 1000);
    if (p <= 0) return;
    var e = easeOutBack(p);
    var x = cx + (L[3] + L[0] * (1 - e)) * u;
    var y = by + (L[4] + L[1] * (1 - e)) * u;
    var ang = L[5] + L[2] * (1 - e);
    var len = L[6] * u, r = 0.2 * u;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 2.5);
    ctx.translate(x, y); ctx.rotate(ang);
    var g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#2a1a0f'); g.addColorStop(0.45, '#6b4527'); g.addColorStop(1, '#1c110a');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-len / 2, -r, len, 2 * r, r); else ctx.rect(-len / 2, -r, len, 2 * r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 8, 4, 0.55)'; ctx.lineWidth = Math.max(1, u * 0.03);
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(-len * 0.42 + i * u * 0.3, r * 0.15 * i); ctx.lineTo(len * 0.3 + i * u * 0.2, r * 0.15 * i); ctx.stroke();
    }
    // cut end with rings
    ctx.fillStyle = '#b98856';
    ctx.beginPath(); ctx.ellipse(len / 2, 0, r * 0.45, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90, 55, 28, 0.8)';
    ctx.beginPath(); ctx.ellipse(len / 2, 0, r * 0.25, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    // firelight on the log
    if (heat > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 110, 30, ' + (0.28 * heat) + ')';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-len / 2, -r, len, 2 * r, r); else ctx.rect(-len / 2, -r, len, 2 * r);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- particles ----
  var flames = [], sparks = [];
  function heatAt(t) { return smooth((t - 1400) / 1900); }

  function spawn(dt, heat) {
    var n = heat * 240 * dt + Math.random() * heat;
    var spread = 0.35 + 0.75 * heat;
    while (n-- > 0.5) {
      var off = (Math.random() + Math.random() - 1) * 1.05 * spread;
      flames.push({
        x: off, y: -0.35 - Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.4, vy: -(2.4 + Math.random() * 2.2) * (0.55 + 0.45 * heat),
        age: 0, life: 0.45 + Math.random() * 0.5,
        size: (0.42 + Math.random() * 0.42) * (0.6 + 0.4 * heat)
      });
    }
    var s = heat * 22 * dt;
    if (Math.random() < s) {
      sparks.push({
        x: (Math.random() - 0.5) * 1.4, y: -0.8,
        vx: (Math.random() - 0.5) * 1.2, vy: -(2.6 + Math.random() * 3),
        age: 0, life: 1 + Math.random() * 0.9, seed: Math.random() * 6
      });
    }
  }

  function step(dt) {
    var i, p;
    for (i = flames.length - 1; i >= 0; i--) {
      p = flames[i];
      p.age += dt;
      if (p.age >= p.life) { flames.splice(i, 1); continue; }
      p.vx += -p.x * (2 + 5 * p.age / p.life) * dt + (Math.random() - 0.5) * 4 * dt; // draw in to flame tips
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) { sparks.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(p.age * 6 + p.seed) * 0.6) * dt; p.y += p.vy * dt;
    }
  }

  function draw(t, heat) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#070504';
    ctx.fillRect(0, 0, W, H);

    var flicker = 0.9 + Math.sin(t / 70) * 0.05 + Math.sin(t / 37) * 0.05;

    // warm light on the surroundings and the ground
    ctx.globalCompositeOperation = 'lighter';
    if (heat > 0) {
      var R = u * (3 + 5 * heat);
      var glow = ctx.createRadialGradient(cx, by - u, 0, cx, by - u, R);
      glow.addColorStop(0, 'rgba(255, 120, 35, ' + (0.38 * heat * flicker) + ')');
      glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(cx, by + 0.35 * u); ctx.scale(1, 0.22);
      var gg = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 4.5);
      gg.addColorStop(0, 'rgba(255, 130, 50, ' + (0.45 * heat) + ')');
      gg.addColorStop(1, 'rgba(255, 100, 30, 0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, u * 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    var i;
    for (i = 0; i < FRONT; i++) drawLog(LOGS[i], t, heat);

    // embers catching at the base
    var ember = smooth((t - 1100) / 1000);
    if (ember > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(cx, by - 0.25 * u); ctx.scale(1, 0.4);
      var eg = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 1.6);
      eg.addColorStop(0, 'rgba(255, 190, 90, ' + (0.85 * ember * flicker) + ')');
      eg.addColorStop(0.5, 'rgba(255, 90, 20, ' + (0.5 * ember) + ')');
      eg.addColorStop(1, 'rgba(160, 30, 0, 0)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, u * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // flames
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < flames.length; i++) {
      var p = flames[i], f = p.age / p.life;
      var size = p.size * (1 - 0.65 * f) * u;
      var img = f < 0.1 ? SPR_CORE : f < 0.3 ? SPR_YELLOW : f < 0.6 ? SPR_ORANGE : SPR_RED;
      ctx.globalAlpha = Math.pow(1 - f, 1.1) * 0.4;
      ctx.drawImage(img, cx + p.x * u - size, by + p.y * u - size, size * 2, size * 2);
    }
    // sparks
    for (i = 0; i < sparks.length; i++) {
      var s = sparks[i], sf = s.age / s.life;
      ctx.globalAlpha = (1 - sf) * (0.6 + 0.4 * Math.sin(s.age * 30 + s.seed));
      var sz = Math.max(1.5, u * 0.05);
      ctx.drawImage(SPR_CORE, cx + s.x * u - sz * 2, by + s.y * u - sz * 2, sz * 4, sz * 4);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (i = FRONT; i < LOGS.length; i++) drawLog(LOGS[i], t, heat);
  }

  // ---- timeline ----
  var start = null, last = null, endAt = DURATION, fadeLen = FADE_OUT;
  function frame(now) {
    if (done) return;
    if (start === null) { start = now; last = now; }
    var t = now - start;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var heat = heatAt(t);
    spawn(dt, heat);
    step(dt);
    if (t < 4200) draw(t, heat); // the photo covers the drawing after this
    var ph = smooth((t - 3300) / 800);
    canvas.style.opacity = smooth(t / 600) * (1 - ph);
    if (photoBg) photoBg.style.opacity = ph;
    if (photo) {
      photo.style.opacity = ph;
      photo.style.transform = 'translateX(-50%) scale(' + (1.14 - 0.12 * smooth((t - 3300) / 3700)) + ')';
    }
    if (flash) flash.style.opacity = 0.9 * Math.max(0, 1 - Math.abs(t - 3600) / 550);
    if (text) {
      var tx = smooth((t - 4000) / 700);
      text.style.opacity = tx;
      text.style.transform = 'translateY(' + (16 * (1 - tx)) + 'px)';
    }
    intro.style.opacity = 1 - smooth((t - (endAt - fadeLen)) / fadeLen);
    if (t >= endAt) { finish(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function skip() {
    if (start === null || done) return;
    var t = performance.now() - start;
    if (t < endAt - 350) { endAt = t + 350; fadeLen = 350; }
  }
  intro.addEventListener('click', skip);
  window.addEventListener('keydown', function onKey() { skip(); window.removeEventListener('keydown', onKey); });
  // never leave the site covered, even if animation frames stop
  setTimeout(finish, DURATION + 2500);
})();
