/* Glow by Launthia – owner dashboard.
   Sign-in with Supabase (email + password). Only Launthia's account gets in: any other account is signed
   out at once and sees "Access denied." The real lock is in the database (Row Level Security): it lets
   only her account read or change anything. There is no sign-up anywhere.
   Nothing is fetched until she is signed in. No polling: lists load when the dashboard opens, when she
   switches tab, taps Refresh or comes back to the page; a failed request is retried at most twice.
   The site never messages clients: the only automatic emails are sent by the server (Edge Functions). */
(function(){
  'use strict';
  var ow = document.getElementById('owner'); if (!ow) return;
  var STANDALONE = ow.hasAttribute('data-standalone');
  var CFG = {
    url: typeof SUPABASE_URL !== 'undefined' ? String(SUPABASE_URL) : '',
    key: typeof SUPABASE_ANON_KEY !== 'undefined' ? String(SUPABASE_ANON_KEY) : '',
    owner: String(typeof OWNER_EMAIL !== 'undefined' ? OWNER_EMAIL : 'launthiawatson@yahoo.com').toLowerCase()
  };
  var TZ = 'America/Jamaica';
  var SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
  var SB_SRI = 'sha384-rwykjmWNwVxboyFmvK9OXN0wj9hnMHA2aAHtits54DuACyCq0M2PrSNxhRb+hvXT';
  var STORE = 'glow-owner', CACHE = 'glow-owner-cache';
  var NO_NET = 'We couldn’t reach the sign-in service. Check your internet connection and try again.';
  var OFFLINE = 'You’re offline – changes will wait until you’re back.';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function $(s, r){ return (r || ow).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || ow).querySelectorAll(s)); }
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function isOffline(){ return navigator.onLine === false; }
  function emailOk(v){ v = String(v || '').trim(); return v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function focusLater(e){ if (e) setTimeout(function(){ try { e.focus({ preventScroll: true }); } catch (er) {} }, 60); }
  function busy(btn, on, label){
    if (!btn) return;
    if (on){ if (btn.dataset.label == null) btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = label; }
    else { if (btn.dataset.label != null){ btn.innerHTML = btn.dataset.label; delete btn.dataset.label; } btn.removeAttribute('aria-busy'); btn.disabled = false; }
  }
  var toastT = 0;
  function toast(msg){ var t = $('#ow-toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, 3600); }

  /* ---------------- motion helpers (see OWNER-MOTION.md); all of them stand down for "reduce motion" ---------------- */
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var EASE = 'cubic-bezier(.2,.7,.15,1)';
  function anim(node, frames, opts){ if (!node || RM.matches || !node.animate) return null; try { return node.animate(frames, opts); } catch (e) { return null; } }
  /* replays a one-off CSS class animation */
  function replay(node, cls){ if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  /* exaggerated feedback: a short shake when something is wrong */
  function shake(node){ anim(node, [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: EASE }); }
  /* secondary action: a champagne ring and a burst of stars around a big win */
  function sparkle(target, small){
    if (!target || RM.matches || !target.isConnected) return;
    var r = target.getBoundingClientRect(); if (!r.width) return;
    var s = el('span', 'ow-spark' + (small ? ' sm' : '')); s.setAttribute('aria-hidden', 'true');
    s.style.left = (r.left + r.width / 2) + 'px'; s.style.top = (r.top + r.height / 2) + 'px';
    s.style.setProperty('--w', Math.max(r.width, 40) + 'px'); s.style.setProperty('--h', Math.max(r.height, 28) + 'px');
    s.style.setProperty('--r', Math.round(Math.max(r.height, 28) / 2) + 'px');
    for (var i = 0, n = small ? 7 : 12; i < n; i++){
      var d = el('i'); d.style.setProperty('--a', Math.round(i * 360 / n + (i % 2 ? 9 : -9)) + 'deg');
      d.style.setProperty('--d', (small ? 16 : 26 + (i % 3) * 9) + 'px'); d.style.animationDelay = (i % 3) * 35 + 'ms'; s.appendChild(d);
    }
    ow.appendChild(s); setTimeout(function(){ s.remove(); }, 1100);
  }
  /* pose to pose: a number glides from what it showed to what it is now ("JMD $20,500", "3") */
  function numOf(s){ var m = String(s).replace(/,/g, '').match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  function countTo(node, text, fromZero){
    text = String(text); var to = numOf(text), from = fromZero ? 0 : numOf(node.textContent);
    node._cid = (node._cid || 0) + 1;
    if (RM.matches || to === null || !/^[^\d]*[\d,]+[^\d]*$/.test(text)){ node.textContent = text; return; }
    if (from === null) from = 0;
    if (from === to){ node.textContent = text; return; }
    var pre = text.match(/^[^\d]*/)[0], post = text.match(/[^\d]*$/)[0], t0 = 0, id = node._cid, dur = Math.min(900, 420 + Math.abs(to - from) * 2);
    function step(now){
      if (node._cid !== id) return; if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = k < 1 ? pre + Math.round(from + (to - from) * e).toLocaleString('en-US') + post : text;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  /* one indicator that slides to the chosen tab / switch option (ink pill, thumb, dot) */
  function slideTo(mark, target, mode){
    if (!mark || !target) return;
    var box = mark.parentNode; if (!box.offsetWidth || !target.offsetWidth) return;
    var first = !box.classList.contains(mode === 'dot' ? 'has-dot' : mode === 'thumb' ? 'has-thumb' : 'has-ink');
    if (first) mark.style.transition = 'none';
    if (mode === 'dot') mark.style.left = Math.round(target.offsetLeft + target.offsetWidth / 2 - 2.5) + 'px';
    else { mark.style.width = target.offsetWidth + 'px'; mark.style.left = target.offsetLeft + 'px'; if (mode !== 'thumb'){ mark.style.height = target.offsetHeight + 'px'; mark.style.top = target.offsetTop + 'px'; } }
    if (first){ void mark.offsetWidth; mark.style.transition = ''; box.classList.add(mode === 'dot' ? 'has-dot' : mode === 'thumb' ? 'has-thumb' : 'has-ink'); return; }
    if (mode === 'dot') anim(mark, [{ transform: 'translateY(0)' }, { transform: 'translateY(-8px) scale(1.3)', offset: .45 }, { transform: 'translateY(0)' }], { duration: 440, easing: EASE });
    else anim(mark, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,.88)', offset: .35 }, { transform: 'scale(1,1)' }], { duration: 460, easing: EASE });
  }

  /* ---------------- dates: always Jamaica time ---------------- */
  function jm(d){ var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(function(x){ p[x.type] = x.value; }); return p.year + '-' + p.month + '-' + p.day; }
  function today(){ return jm(new Date()); }
  function utcOf(ymd){ var a = ymd.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)); }
  function addDays(ymd, n){ var d = utcOf(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekOf(ymd){ var mon = addDays(ymd, -((utcOf(ymd).getUTCDay() + 6) % 7)); return [mon, addDays(mon, 6)]; }
  function dayShort(ymd){ return utcOf(ymd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function dayLong(ymd){ var d = utcOf(ymd); return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) + ', ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function timeOf(t){ t = String(t || ''); var h = parseInt(t.slice(0, 2), 10); return isNaN(h) ? t : (h % 12 || 12) + ':' + (t.slice(3, 5) || '00') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function stamp(iso){ return iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''; }
  function money(n){ return typeof n === 'number' ? 'JMD $' + n.toLocaleString('en-US') : '—'; }
  function bday(r){ return r.birth_month && r.birth_day ? r.birth_day + ' ' + MONTHS_FULL[r.birth_month - 1] : ''; }
  function telOf(p){ p = String(p || ''); var d = p.replace(/\D/g, ''); if (/^\s*\+/.test(p)) return '+' + d; if (d.length === 7) return '+1876' + d; if (d.length === 10) return '+1' + d; if (d.length === 11 && d.charAt(0) === '1') return '+' + d; return d; }
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------------- Supabase ---------------- */
  function keyRole(k){ var part = k.split('.')[1]; if (!part) return ''; try { return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch (e) { return ''; } }
  function cfgProblem(){
    var role = keyRole(CFG.key);
    if (/^sb_secret_/i.test(CFG.key) || (role && role !== 'anon')) return 'This website has a secret Supabase key in it. Remove it and paste the anon public key instead.';
    if (!/^https:\/\/[^\s\/]+\/?$/.test(CFG.url) || !/^[\w.-]{20,}$/.test(CFG.key)) return 'The owner sign-in isn’t connected yet. The Supabase details still need to be added to the website.';
    return '';
  }
  var libP = null, client = null;
  function sbLoad(){
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (libP) return libP;
    libP = new Promise(function(res, rej){
      var t = document.createElement('script'); t.src = SB_SRC; t.integrity = SB_SRI; t.crossOrigin = 'anonymous'; t.async = true;
      t.onload = function(){ if (window.supabase && window.supabase.createClient) res(window.supabase); else { libP = null; rej(new Error('no supabase')); } };
      t.onerror = function(){ libP = null; rej(new Error('no supabase')); };
      document.head.appendChild(t);
    });
    return libP;
  }
  function getClient(){
    return sbLoad().then(function(lib){
      if (!client){
        client = lib.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: STORE } });
        client.auth.onAuthStateChange(function(event){ if (event === 'PASSWORD_RECOVERY'){ setTimeout(function(){ show('newpass'); }, 0); } });
      }
      return client;
    });
  }
  function isOwner(u){ return !!u && String(u.email || '').toLowerCase() === CFG.owner; }
  function authErr(e){ return !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt|expired/i.test(e.message || '')); }
  function authMessage(e){
    var m = String((e && (e.message || e.msg)) || '');
    if ((e && e.status === 429) || /rate limit|too many/i.test(m)) return 'Too many tries. Please wait a minute, then try again.';
    if (/not confirmed/i.test(m)) return 'This account isn’t ready yet. Open the invite email first.';
    if (/fetch|network|failed to fetch/i.test(m)) return NO_NET;
    return 'That email or password isn’t right.';
  }
  /* at most two retries, then the caller shows a clear message */
  function q(fn){
    var n = 0;
    function again(){ n++; return wait(n === 1 ? 600 : 1500).then(go); }
    function go(){ return fn().then(function(r){ if (r && r.error && !authErr(r.error) && n < 2) return again(); return r; }, function(e){ if (n < 2) return again(); return { error: e }; }); }
    return go();
  }

  /* ---------------- screens ---------------- */
  var gate = $('#ow-gate'), app = $('#ow-app'), bottom = $('#ow-bottom');
  var screens = { signin: $('#ow-signin'), forgot: $('#ow-forgot'), newpass: $('#ow-newpass'), denied: $('#ow-denied') };
  function show(name, text){
    var inApp = name === 'app';
    gate.hidden = inApp; app.hidden = !inApp; bottom.hidden = !inApp;
    Object.keys(screens).forEach(function(k){ screens[k].hidden = k !== name; });
    $$('.ow-status', gate).forEach(function(s){ s.textContent = ''; });
    $$('button[type="submit"]', gate).forEach(function(b){ busy(b, false); });
    if (inApp){ focusLater($('#ow-app-title')); return; }
    var st = $('.ow-status', screens[name]); if (st && text) st.textContent = text;
    focusLater($('input', screens[name]) || $('a, button', screens[name]));
  }
  $$('[data-screen]').forEach(function(b){ b.addEventListener('click', function(){ show(b.dataset.screen); }); });
  $$('[data-eye]').forEach(function(b){
    b.addEventListener('click', function(){
      var i = document.getElementById(b.dataset.eye), on = i.type === 'password';
      i.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
      /* the lid blinks (a little wind-up) while the line draws itself across or away */
      anim($('.ow-eye-lid', b), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: .42 }, { transform: 'scaleY(1.08)', offset: .75 }, { transform: 'scaleY(1)' }], { duration: 340, easing: EASE });
    });
  });
  /* "Back to the site": the home page, or (in the single file) back to the top of the site,
     or (on a link of its own) the address in data-home, in a new tab */
  var HOME = ow.getAttribute('data-home');
  $$('[data-back]').forEach(function(a){ a.setAttribute('href', HOME || (STANDALONE ? '/' : '#hero')); if (HOME){ a.target = '_blank'; a.rel = 'noopener'; } });

  /* the single file: #owner is its own full screen (the site is hidden behind it, not under a pop-up) */
  var viewOn = false;
  var BASE_TITLE = document.title;
  /* the bottom tab bar's real height (with the iPhone safe area): the dashboard keeps at least that much room below the
     last card, and anything focused or opened stays above the bar */
  function barRoom(){
    var bar = $('#ow-bottom'), h = bar && !bar.hidden ? bar.offsetHeight : 0, root = document.documentElement.style;
    if (h){ root.setProperty('--ow-bar', h + 'px'); root.scrollPaddingBottom = (h + 16) + 'px'; }
    else { root.removeProperty('--ow-bar'); root.scrollPaddingBottom = ''; }
  }
  addEventListener('resize', function(){ if (S.on && (STANDALONE || viewOn)) barRoom(); });
  /* "More" opened by her (a tap or a key on its title, not a redraw): the page scrolls so the last control of the open
     panel (Save note, or the last button) ends fully above the tab bar and the iPhone safe area – so "Agreed to terms",
     "Mark deposit paid", "Cancel" and "Save note" are never left under the bar */
  var moreTap = null;
  ow.addEventListener('click', function(e){ var s = e.target && e.target.closest ? e.target.closest('details.ow-more > summary') : null; if (s) moreTap = { d: s.parentNode, t: Date.now() }; }, true);
  ow.addEventListener('toggle', function(e){
    var d = e.target; if (!d || d.tagName !== 'DETAILS' || !d.open || !d.classList.contains('ow-more')) return;
    if (!moreTap || moreTap.d !== d || Date.now() - moreTap.t > 1500) return;
    var bar = $('#ow-bottom'); if (!bar || bar.hidden || !bar.offsetHeight) return;
    setTimeout(function(){
      var body = d.querySelector('.ow-more-body') || d, r = body.getBoundingClientRect(), ty = 0;
      try { var t = getComputedStyle(body).transform; if (t && t !== 'none') ty = new DOMMatrixReadOnly(t).m42; } catch (er) {}   /* its short slide-in */
      var dy = r.bottom - ty - (bar.getBoundingClientRect().top - 12);
      if (dy > 0) window.scrollBy({ top: dy, behavior: RM.matches ? 'auto' : 'smooth' });
    }, 60);
  }, true);
  function viewOpen(){ if (viewOn) return; viewOn = true; if (S.on) setTimeout(counts, 0); document.documentElement.classList.add('owner-mode'); ow.hidden = false; window.GLOW_PAUSED = true; window.scrollTo(0, 0); }
  function viewClose(){ if (!viewOn) return; viewOn = false; document.documentElement.style.removeProperty('--ow-bar'); document.documentElement.style.scrollPaddingBottom = ''; document.title = BASE_TITLE; document.documentElement.classList.remove('owner-mode'); ow.hidden = true; window.GLOW_PAUSED = false; window.dispatchEvent(new Event('resize')); }

  /* ---------------- state, cache (this browser tab only; never localStorage) ---------------- */
  var S = { me: '', on: false, bookings: [], club: [], pays: {}, settings: null, lastAlert: null, loadedAt: 0, loading: false,
            tab: 'bookings', when: 'upcoming', bq: '', st: 'all', day: 'all', dayPick: '', cq: '', pref: 'all', confirm: {}, resent: {}, testAt: 0, prices: null, daysOff: [] };
  function cacheGet(){ try { var c = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); return c && c.bookings && c.club ? c : null; } catch (e) { return null; } }
  function cacheSet(){ try { sessionStorage.setItem(CACHE, JSON.stringify({ bookings: S.bookings, club: S.club })); } catch (e) {} }
  function wipe(){
    try { sessionStorage.removeItem(CACHE); } catch (e) {}
    $('#ow-compose').hidden = true; $('#ow-cal').hidden = true; $('#ow-cancel').hidden = true;
    liveOff(); S.known = null; if (newbar) { newbar.hidden = true; newbar.classList.remove('in'); }
    S.on = false; S.me = ''; S.bookings = []; S.club = []; S.settings = null; S.lastAlert = null; S.loadedAt = 0; S.confirm = {}; S.resent = {}; S.prices = null; S.daysOff = [];
    ['#ow-blist', '#ow-clist', '#ow-stats', '#ow-bdays', '#ow-sched'].forEach(function(s){ $(s).textContent = ''; });
    if (typeof SC === 'object' && SC){ SC.gen++; SC.at = 0; SC.loading = null; }
    if (typeof TW === 'object' && TW) twClose(TW);
    $('#ow-alert-email').value = ''; banner('');
  }
  function signOutNow(){
    var c = client; if (!c) return;
    var drop = function(){ try { localStorage.removeItem(STORE); } catch (e) {} };
    c.auth.signOut({ scope: 'local' }).then(function(r){ if (r && r.error) drop(); }, drop);
  }
  function deny(){ wipe(); signOutNow(); show('denied'); }
  function enter(user){
    S.on = true; S.me = user.email || '';
    $('#ow-me').textContent = S.me;
    $('#ow-today').textContent = dayLong(today());
    show('app'); setTab(S.tab, false); applyNet(); loadAll(); liveOn(); counts(); setTimeout(barRoom, 0);
    /* the first time: how to open the dashboard like an app (not shown once it is opened from the home screen) */
    var app = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true, seenTip = false;
    try { seenTip = localStorage.getItem('glow.owner.tip') === 'seen'; } catch (e) {}
    $('#ow-tip').hidden = app || seenTip;
  }

  /* ---------------- sign in, forgot password, set password ---------------- */
  screens.signin.addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('button[type="submit"]', this), st = $('#ow-signin-status'), em = $('#ow-email').value.trim(), pw = $('#ow-password').value;
    var form = this;
    if (b.disabled) return;
    if (!emailOk(em) || !pw){ st.textContent = 'Please enter your email and password.'; shake(form); return; }
    var p = cfgProblem(); if (p){ st.textContent = p; shake(form); return; }
    if (em.toLowerCase() !== CFG.owner){ $('#ow-password').value = ''; show('denied'); setTimeout(function(){ shake(screens.denied); }, 420); return; }
    if (isOffline()){ st.textContent = NO_NET; shake(form); return; }
    busy(b, true, 'Signing in…'); st.textContent = '';
    getClient().then(function(c){ return c.auth.signInWithPassword({ email: em, password: pw }); }).then(function(r){
      busy(b, false); $('#ow-password').value = '';
      if (r.error || !r.data || !r.data.user){ st.textContent = authMessage(r.error); shake(form); return; }
      if (!isOwner(r.data.user)) deny(); else enter(r.data.user);
    }, function(){ busy(b, false); st.textContent = NO_NET; shake(form); });
  });
  function resetLink(){ return location.origin + location.pathname; }
  screens.forgot.addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('button[type="submit"]', this), st = $('#ow-forgot-status'), em = $('#ow-forgot-email').value.trim();
    var sent = 'If that email belongs to the owner, a reset link is on its way.';
    if (b.disabled) return;
    if (!emailOk(em)){ st.textContent = 'Please enter your email address.'; shake(this); return; }
    var p = cfgProblem(); if (p){ st.textContent = p; shake(this); return; }
    if (em.toLowerCase() !== CFG.owner){ st.textContent = sent; return; }
    if (isOffline()){ st.textContent = NO_NET; return; }
    busy(b, true, 'Sending…'); st.textContent = '';
    getClient().then(function(c){ return c.auth.resetPasswordForEmail(em, { redirectTo: resetLink() }); }).then(function(r){
      busy(b, false); st.textContent = r.error && (r.error.status === 429 || /rate/i.test(r.error.message || '')) ? 'Too many tries. Please wait a minute, then try again.' : sent;
    }, function(){ busy(b, false); st.textContent = NO_NET; });
  });
  function hints(){
    var a = $('#ow-new1').value, c = $('#ow-new2').value;
    $('[data-hint="len"]').classList.toggle('ok', a.length >= 8);
    $('[data-hint="match"]').classList.toggle('ok', !!a && a === c);
  }
  ['#ow-new1', '#ow-new2'].forEach(function(s){ $(s).addEventListener('input', hints); });
  screens.newpass.addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('button[type="submit"]', this), st = $('#ow-newpass-status'), a = $('#ow-new1').value, c = $('#ow-new2').value;
    var form = this;
    if (b.disabled) return;
    if (a.length < 8){ st.textContent = 'Please use at least 8 characters.'; shake(form); return; }
    if (a !== c){ st.textContent = 'The two passwords don’t match.'; shake(form); return; }
    if (isOffline()){ st.textContent = NO_NET; shake(form); return; }
    busy(b, true, 'Saving…'); st.textContent = '';
    getClient().then(function(cl){ return cl.auth.updateUser({ password: a }); }).then(function(r){
      busy(b, false);
      if (r.error){ var m = r.error.message || ''; st.textContent = /different|same/i.test(m) ? 'Please choose a password you haven’t used here before.' : /weak|short|least/i.test(m) ? 'Please choose a longer or stronger password.' : /session|missing|expired|invalid/i.test(m) ? 'That link has expired. Tap “Forgot password?” on the sign-in screen to get a new one.' : 'We couldn’t save the password. Please try again.'; shake(form); return; }
      $('#ow-new1').value = $('#ow-new2').value = ''; hints();
      if (!isOwner(r.data && r.data.user)) deny(); else { enter(r.data.user); toast('Your password is saved.'); setTimeout(function(){ sparkle($('#ow-toast')); }, 250); }
    }, function(){ busy(b, false); st.textContent = NO_NET; shake(form); });
  });

  /* ---------------- loading ---------------- */
  function banner(text, retry){ var bn = $('#ow-banner'); bn.hidden = !text; $('span', bn).textContent = text || ''; $('#ow-retry').hidden = !retry; }
  $('#ow-retry').addEventListener('click', function(){ banner(''); loadAll(); });
  function skeletons(){
    var bl = $('#ow-blist'), cl = $('#ow-clist'), stt = $('#ow-stats');
    bl.textContent = ''; cl.textContent = ''; stt.textContent = '';
    for (var i = 0; i < 3; i++){
      var c = el('div', 'ow-glass ow-skel'); c.setAttribute('aria-hidden', 'true');
      [['55%', 22], ['80%', 14], ['70%', 14], ['90%', 44]].forEach(function(l){ var x = el('span', 'sk-line'); x.style.width = l[0]; x.style.height = l[1] + 'px'; c.appendChild(x); });
      bl.appendChild(c); cl.appendChild(c.cloneNode(true));
    }
    for (var j = 0; j < 4; j++){ var s = el('div', 'ow-glass ow-skel'); s.setAttribute('aria-hidden', 'true'); s.appendChild(el('span', 'sk-line')).style.cssText = 'width:40%;height:34px'; s.appendChild(el('span', 'sk-line')).style.width = '70%'; stt.appendChild(s); }
    $$('[data-stat]').forEach(function(b){ b.textContent = '–'; });
  }
  var REFRESH_ICON = '<svg class="ow-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>';
  function loadAll(quiet, byHand){
    if (S.loading || !client || !S.on) return;
    S.loading = true;
    var have = S.loadedAt || S.bookings.length || S.club.length, fresh = !have || byHand;
    if (!have){ var c = cacheGet(); if (c){ S.bookings = c.bookings.filter(isBooking); S.club = c.club; have = true; fresh = byHand; renderAll(true); } else skeletons(); }
    if (isOffline()){ S.loading = false; banner(have ? 'You’re offline. This is the last list you loaded.' : 'You’re offline. Your lists will load when you’re back online.'); return; }
    var btn = $('#ow-refresh'); if (!quiet){ busy(btn, true, 'Refreshing…'); btn.insertAdjacentHTML('afterbegin', REFRESH_ICON); }
    Promise.all([
      q(function(){ return client.from('bookings').select('*').order('appt_date', { ascending: true }).order('appt_time', { ascending: true }).limit(5000); }),
      q(function(){ return client.from('glow_club').select('*').order('created_at', { ascending: false }).limit(5000); }),
      q(function(){ return client.from('owner_settings').select('*').eq('id', 1).maybeSingle(); }),
      q(function(){ return client.from('alert_log').select('created_at,kind,status,detail').in('kind', ['booking', 'test']).order('created_at', { ascending: false }).limit(1); }),
      q(function(){ return client.from('site_prices').select('service,price_text'); }),
      q(function(){ return client.from('blocked_days').select('day').gte('day', today()).order('day', { ascending: true }); }),
      q(function(){ return client.from('payments').select('booking_id,method,status,amount,currency,provider_ref,notes,receipt_path').eq('status', 'awaiting review').limit(500); }),
      q(function(){ return client.from('payment_methods').select('method,jmd_per_usd,enabled,paypalme,accounts').in('method', ['paypal', 'bank']); })
    ]).then(function(res){
      S.loading = false; busy(btn, false);
      if (res.some(function(r){ return r.error && authErr(r.error); })){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
      if (res[0].error || res[1].error){ banner('We couldn’t load your lists. Check your internet connection.', true); if (!have) ['#ow-blist', '#ow-clist', '#ow-stats'].forEach(function(s){ $(s).textContent = ''; }); return; }
      banner('');
      S.bookings = (res[0].data || []).filter(isBooking); S.club = res[1].data || [];
      var seen = S.known, arrived = []; S.known = {};
      S.bookings.forEach(function(b){ S.known[b.id] = 1; if (seen && !seen[b.id] && b.status !== 'Cancelled') arrived.push(b); });
      if (arrived.length && (STANDALONE || viewOn)) setTimeout(function(){ announce(arrived); }, 0);
      S.pays = {}; if (!res[6].error) (res[6].data || []).forEach(function(x){ S.pays[x.booking_id] = x; });
      if (!res[7].error) payLoaded(res[7].data || []);
      if (!res[2].error) S.settings = res[2].data || null;
      if (!res[3].error) S.lastAlert = (res[3].data || [])[0] || null;
      if (!res[4].error && res[4].data && res[4].data.length){ S.prices = {}; res[4].data.forEach(function(x){ S.prices[x.service] = x.price_text; }); }
      if (!res[5].error) S.daysOff = (res[5].data || []).map(function(x){ return String(x.day).slice(0, 10); }).sort();
      S.siteErr = !!(res[4].error || res[5].error);
      S.loadedAt = Date.now(); cacheSet(); renderAll(fresh); fillSettings(); fillSite(); siteNews();
    });
  }
  function quietRefresh(){ if (S.on && Date.now() - S.loadedAt > 15000) loadAll(true); }
  $('#ow-refresh').addEventListener('click', function(){ loadAll(false, true); if (S.tab === 'settings' && $('#ow-set-more').open) loadSchedule(true); });
  /* Settings → "Hours, prices & more": her schedule loads the first time it opens */
  $('#ow-set-more').addEventListener('toggle', function(){ if (this.open) loadSchedule(false); });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && (STANDALONE || viewOn)) quietRefresh(); });
  setInterval(function(){ if (!document.hidden && (STANDALONE || viewOn) && S.on && !typing() && !$('.ow-card .is-busy, [aria-busy="true"]')) quietRefresh(); }, 60000);
  /* she is typing something: the lists wait so nothing she typed is lost */
  function typing(){ var a = document.activeElement; return !!(a && ow.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'button'); }
  /* the moment a booking is made or changes, the database tells the dashboard (Realtime); the minute check is the back-up */
  function liveOn(){
    if (!client || typeof client.channel !== 'function' || S.rt) return;
    try {
      S.rt = client.channel('glow-dashboard-bookings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, function(){
          clearTimeout(S.rtT);
          S.rtT = setTimeout(function again(){ if (!S.on) return; if (S.loading){ S.rtT = setTimeout(again, 1500); return; } S.loadedAt = 0; loadAll(true); }, 600);
        })
        .subscribe();
    } catch (e) { S.rt = null; }
  }
  function liveOff(){ clearTimeout(S.rtT); try { if (S.rt && client && client.removeChannel) client.removeChannel(S.rt); } catch (e) {} S.rt = null; }
  /* a soft two-note chime (made here, no sound file); phones only allow sound after a first tap */
  var AC = null;
  function soundOn(){ try { return localStorage.getItem('glow.owner.sound') !== 'off'; } catch (e) { return true; } }
  function audio(){ try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = AC || new C(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  ow.addEventListener('pointerdown', function(){ if (!AC) audio(); }, { passive: true });
  function chime(force){
    if (!force && !soundOn()) return;
    var ac = audio(); if (!ac) return;
    try {
      var t = ac.currentTime + 0.02;
      [[987.77, 0], [1318.51, 0.14]].forEach(function(n){
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]); g.gain.exponentialRampToValueAtTime(0.16, t + n[1] + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.95);
        o.connect(g); g.connect(ac.destination); o.start(t + n[1]); o.stop(t + n[1] + 1);
      });
    } catch (e) {}
    window.GLOW_CHIMES = (window.GLOW_CHIMES || 0) + 1;
  }
  /* "New booking from … – tap to view" across the top, a chime, and a line for screen readers */
  var newbar = $('#ow-newbar'), barT = 0;
  function hideBar(){ clearTimeout(barT); if (newbar.hidden) return; newbar.classList.remove('in'); setTimeout(function(){ if (!newbar.classList.contains('in')) newbar.hidden = true; }, RM.matches ? 0 : 320); }
  function announce(list){
    var b = list[list.length - 1], more = list.length - 1;
    $('#ow-newbar-text').textContent = 'New booking from ' + b.client_name + (more ? ' and ' + more + ' more' : '') + ' – tap to view';
    $('#ow-new-live').textContent = 'New booking from ' + b.client_name + (more ? ' and ' + more + ' more' : '') + '.';
    newbar.dataset.id = b.id; newbar.hidden = false; void newbar.offsetWidth; newbar.classList.add('in');
    chime(); clearTimeout(barT); barT = setTimeout(hideBar, 15000);
  }
  newbar.addEventListener('click', function(){
    var id = newbar.dataset.id, b = find(id); hideBar(); if (!b) return;
    setTab('bookings', false); S.bq = ''; $('#ow-bq').value = ''; S.open[groupOf(b)] = true; renderBookings(false);
    var c = $('.ow-bk[data-id="' + id + '"]');
    if (c){ c.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' }); c.classList.add('just'); focusLater(c); }
  });
  /* lists play their entrance when they first appear, on Refresh and on a filter change; a quiet refresh or
     typing in a search redraws them instantly (the more often something happens, the less it should move) */
  function renderAll(fresh){ counts(); renderBookings(fresh); renderClub(fresh); renderStats(); }

  /* ---------------- tabs (top pills on wider screens, bottom bar on phones) ---------------- */
  var TABS = ['bookings', 'club', 'stats', 'settings'];
  /* the sliding indicators: an espresso pill on the laptop tabs, a champagne dot on the phone bar, a thumb on Upcoming/Past */
  var MARKS = [];
  $$('.ow-tablist').forEach(function(l){ var m = el('span', 'ow-ink'); m.setAttribute('aria-hidden', 'true'); l.appendChild(m); MARKS.push([m, function(){ return $('[aria-selected="true"]', l); }, 'ink']); });
  $$('.ow-bottom-in').forEach(function(l){ var m = el('span', 'ow-dot'); m.setAttribute('aria-hidden', 'true'); l.appendChild(m); MARKS.push([m, function(){ return $('[aria-selected="true"]', l); }, 'dot']); });
  $$('.ow-seg').forEach(function(l){ var m = el('span', 'ow-thumb'); m.setAttribute('aria-hidden', 'true'); l.appendChild(m); MARKS.push([m, function(){ return $('[aria-pressed="true"]', l); }, 'thumb']); });
  function placeMarks(){ MARKS.forEach(function(k){ slideTo(k[0], k[1](), k[2]); }); }
  var rzT = 0;
  addEventListener('resize', function(){ clearTimeout(rzT); rzT = setTimeout(function(){ MARKS.forEach(function(k){ var box = k[0].parentNode; box.classList.remove('has-ink', 'has-dot', 'has-thumb'); }); placeMarks(); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ requestAnimationFrame(placeMarks); });
  function setTab(name, refresh){
    var from = TABS.indexOf(S.tab), to = TABS.indexOf(name), moved = from !== to;
    S.tab = name;
    $$('[role="tab"]').forEach(function(t){ var on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    TABS.forEach(function(t){
      var p = $('#ow-p-' + t); var on = t === name;
      if (on && moved){ p.classList.remove('from-r', 'from-l'); p.classList.add(to > from ? 'from-r' : 'from-l'); }
      if (p.hidden === on){ p.hidden = !on; }
    });
    placeMarks();
    if (moved){
      /* the new phone tab's icon dips, then hops (wind-up, then the move) */
      $$('.ow-bottom [aria-selected="true"] svg').forEach(function(s){ anim(s, [{ transform: 'none' }, { transform: 'translateY(2px) scale(1.06,.9)', offset: .25 }, { transform: 'translateY(-5px) scale(.96,1.06)', offset: .6 }, { transform: 'none' }], { duration: 480, easing: EASE }); });
      if (name === 'stats') $$('#ow-stats b').forEach(function(b){ countTo(b, b.dataset.v || b.textContent, true); });
    }
    if (refresh) quietRefresh();
  }
  $$('[role="tablist"]').forEach(function(list){
    var tabs = $$('[role="tab"]', list);
    tabs.forEach(function(t, i){
      t.addEventListener('click', function(){ setTab(t.dataset.tab, true); if (window.scrollY > 200) window.scrollTo(0, 0); });
      t.addEventListener('keydown', function(e){
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (j === null) return; e.preventDefault(); var n = tabs[(j + tabs.length) % tabs.length]; setTab(n.dataset.tab, true); n.focus();
      });
    });
  });

  /* ---------------- A) bookings ---------------- */
  /* a time someone is holding while they pay ("Held"), or a hold that ended unpaid ("Expired"), is not a booking */
  function isBooking(b){ return b.status !== 'Held' && b.status !== 'Expired'; }
  /* ways to pay that Launthia checks herself: the client sends the money, she confirms once it has arrived */
  var MANUAL = { bank: 'Bank transfer', zelle: 'Zelle', cashapp: 'Cash App', paypal: 'PayPal' };
  function live(b){ return b.status !== 'Cancelled'; }
  /* bookings that still need her: a new request, a deposit to check, or one that needs attention */
  function needsConfirm(b){ return b.status === 'Requested' || b.status === 'Pending payment' || b.status === 'Needs attention'; }
  function counts(){
    var n = S.bookings.filter(needsConfirm).length, t = today();
    $$('[data-newcount]').forEach(function(x){ x.textContent = n > 9 ? '9+' : String(n); x.hidden = !n; });
    $$('[role="tab"][data-tab="bookings"]').forEach(function(x){ x.setAttribute('aria-label', 'Bookings' + (n ? ', ' + n + ' to confirm' : '')); });
    var h = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }), 10) % 24;
    $('#ow-greet').textContent = 'Good ' + (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening') + ', Launthia';
    var up = S.bookings.filter(function(b){ return live(b) && b.status !== 'Done' && b.appt_date >= t && !needsConfirm(b); }).length;
    $('#ow-greet-sub').textContent = n ? 'You have ' + n + ' new booking' + (n === 1 ? '' : 's') + ' to confirm.' : 'No new bookings to confirm right now.' + (up ? ' ' + up + ' coming up.' : '');
    if (S.on && (STANDALONE || viewOn)) document.title = (n ? '(' + n + ') ' : '') + 'Glow Dashboard';
  }
  /* the money on a booking: total (service + photos), the deposit paid online, the balance paid at the appointment */
  function depDefault(){ var d = Number(window.DEPOSIT_JMD); return d > 0 ? d : 3000; }
  function photosDefault(){ var d = Number(window.PHOTOS_ADDON_PRICE); return window.PHOTOS_ADDON_PRICE != null && d >= 0 ? d : 3000; }
  function moneyOf(b){
    var price = typeof b.price_jmd === 'number' ? b.price_jmd : null, ph = b.photos_addon ? (typeof b.photos_jmd === 'number' ? b.photos_jmd : photosDefault()) : 0;
    var total = typeof b.total_jmd === 'number' ? b.total_jmd : price != null ? price + ph : null;
    var dep = typeof b.deposit_jmd === 'number' ? b.deposit_jmd : total != null ? Math.min(depDefault(), total) : null;
    var bal = typeof b.balance_jmd === 'number' ? b.balance_jmd : total != null && dep != null ? total - dep : null;
    return { price: price, photos: ph, total: total, dep: dep, bal: bal, paid: b.payment_status === 'paid' || !!b.paid_at };
  }
  function depositsThisMonth(mo){ return S.bookings.filter(function(b){ return live(b) && b.paid_at && jm(new Date(b.paid_at)).slice(0, 7) === mo; }).reduce(function(s, b){ return s + (moneyOf(b).dep || 0); }, 0); }
  function hit(r, keys, query){
    if (!query) return true;
    var ql = query.toLowerCase(), qd = query.replace(/\D/g, '');
    return keys.some(function(k){ var v = String(r[k] || ''); return v.toLowerCase().indexOf(ql) >= 0 || (qd.length >= 3 && v.replace(/\D/g, '').indexOf(qd) >= 0); });
  }
  var GROUPS = [['new', 'New – needs confirming', 'No new bookings right now.'], ['upcoming', 'Upcoming', 'No upcoming bookings.'], ['past', 'Past', 'No past bookings yet.']];
  S.open = { new: true, upcoming: true, past: false }; S.moreOpen = {};
  function groupOf(b){ return needsConfirm(b) ? 'new' : b.status === 'Cancelled' || b.status === 'Done' || b.appt_date < today() ? 'past' : 'upcoming'; }
  function renderBookings(fresh){
    var box = $('#ow-blist'); box.textContent = '';
    var qy = S.bq.trim(), l = S.bookings.filter(function(b){ return hit(b, ['client_name', 'phone', 'reference'], qy); });
    if (!S.bookings.length){ box.appendChild(el('p', 'ow-glass ow-empty' + (fresh ? '' : ' still'), 'No bookings yet. New bookings appear here the moment clients book on your website.')); return; }
    GROUPS.forEach(function(g){
      var items = l.filter(function(b){ return groupOf(b) === g[0]; });
      items.sort(function(a, b){ var x = a.appt_date + a.appt_time, y = b.appt_date + b.appt_time; return x < y ? -1 : x > y ? 1 : 0; });
      if (g[0] === 'past') items.reverse();
      var open = qy ? items.length > 0 : S.open[g[0]] !== false;
      var sec = el('section', 'ow-group'), h = el('h2', 'ow-group-hh'), btn = el('button', 'ow-group-h'), body = el('div', 'ow-list');
      sec.dataset.group = g[0]; body.id = 'ow-gb-' + g[0]; body.hidden = !open;
      btn.type = 'button'; btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-controls', body.id);
      btn.appendChild(el('span', 'ow-group-t', g[1])); btn.appendChild(el('span', 'ow-group-n' + (g[0] === 'new' && items.length ? ' hot' : ''), String(items.length)));
      btn.insertAdjacentHTML('beforeend', '<svg class="ow-group-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
      btn.addEventListener('click', function(){ var o = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(o)); body.hidden = !o; if (!qy) S.open[g[0]] = o; });
      h.appendChild(btn); sec.appendChild(h);
      if (!items.length) body.appendChild(el('p', 'ow-glass ow-empty still', qy ? 'No matches here.' : g[2]));
      items.forEach(function(b, i){ var c = bookingCard(b); c.style.setProperty('--i', Math.min(i, 8)); if (!fresh) c.classList.add('still'); body.appendChild(c); });
      sec.appendChild(body); box.appendChild(sec);
    });
    applyNet();
  }
  var BADGE = { Requested: 'b-requested', 'Pending payment': 'b-requested', Confirmed: 'b-confirmed', Paid: 'b-paid', Done: 'b-done', Cancelled: 'b-cancelled' };
  /* payment status, in four plain words: Awaiting verification (the client says they paid – check your account),
     Pending payment (the deposit is not paid yet), Confirmed (paid), Cancelled */
  function statusKey(b){
    if (b.status === 'Cancelled') return 'cancelled';
    if (b.status === 'Pending payment' || b.status === 'Needs attention') return 'awaiting';
    if ((b.status === 'Confirmed' || b.status === 'Paid' || b.status === 'Done') && (b.payment_status === 'paid' || b.paid_at)) return 'confirmed';
    return 'pending';
  }
  var STATUS_WORDS = { 'Pending payment': 'Awaiting verification' };
  function actionsFor(b){
    var a = actionsBase(b);
    /* an upcoming booking made on the website can be moved to another time */
    if (b.start_at && b.appt_date >= today() && /^(Confirmed|Paid|Pending payment)$/.test(b.status) && a.indexOf('cancel') >= 0) a.splice(a.indexOf('cancel'), 0, 'move');
    return a;
  }
  function actionsBase(b){
    if (b.status === 'Pending payment') return S.pays[b.id] && MANUAL[S.pays[b.id].method] ? ['received', 'notreceived'] : [];
    if (b.status === 'Requested') return ['confirm', 'paid', 'cancel'];
    if (b.status === 'Confirmed') return (b.paid_at ? [] : ['paid']).concat(['done', 'cancel']);
    if (b.status === 'Paid') return (b.email && !b.confirmation_sent_at && !b.reference ? ['sendconf'] : []).concat(['done', 'cancel']);
    return [];
  }
  var LABEL = { move: 'Move', confirm: 'Confirm booking', paid: 'Mark deposit paid', done: 'Mark done', cancel: 'Cancel', sendconf: 'Send confirmation email', received: 'Confirm booking', notreceived: 'Deposit not received' };
  /* the one big button on a card; everything else waits under "More" */
  var PRIMARY = { received: 1, confirm: 1, sendconf: 1 };
  /* PayPal.Me lets the client change the amount and keeps no booking reference, so a PayPal deposit is checked by
     hand in PayPal and confirmed with "Mark deposit paid" */
  function labelOf(a, b){ var pay = S.pays[b.id]; return a === 'received' && pay && pay.method === 'paypal' ? 'Mark deposit paid' : LABEL[a]; }
  /* how a booking is paid: online, and by what – shown on every booking */
  var PAYNAME = { paypal: 'PayPal', bank: 'Bank transfer', zelle: 'Zelle', cashapp: 'Cash App', card: 'Card' };
  function payInfo(b){
    var paid = b.payment_status === 'paid' || !!b.paid_at;
    if (PAYNAME[b.payment_method]){
      if (paid) return ['Paid online', 'Paid online · ' + PAYNAME[b.payment_method], 'paid'];
      if (b.status === 'Pending payment') return ['Online · check payment', PAYNAME[b.payment_method] + ' · check your account', 'check'];
      return ['Online · not paid', PAYNAME[b.payment_method] + ' · not finished', 'due'];
    }
    return paid ? ['Paid', 'Marked paid', 'paid'] : ['Not paid yet', 'Not paid yet', 'due'];
  }
  function payMoney(x){ var n = Number(x.amount); return x.amount == null || !isFinite(n) ? '' : x.currency === 'JMD' ? money(Math.round(n)) : (x.currency || 'USD') + ' $' + n.toFixed(2); }
  /* the client's receipt: opened privately (a link that works for 5 minutes), shown on the booking */
  function receiptUrl(pay){
    if (pay.receipt_url) return Promise.resolve(pay.receipt_url);
    if (!client || !client.storage || !pay.receipt_path) return Promise.resolve('');
    return client.storage.from('payment-receipts').createSignedUrl(pay.receipt_path, 300).then(function(r){ return (r && r.data && r.data.signedUrl) || ''; }, function(){ return ''; });
  }
  function receiptBtn(pay){
    var wrap = el('span', 'ow-receipt-wrap'), b = el('button', 'btn btn-ghost ow-pill', 'View receipt'); b.type = 'button';
    b.addEventListener('click', function(){
      var old = $('.ow-receipt', wrap); if (old){ old.remove(); b.textContent = 'View receipt'; return; }
      busy(b, true, 'Opening…');
      receiptUrl(pay).then(function(u){
        busy(b, false);
        if (!u){ toast('The receipt couldn’t be opened. Please try again.'); return; }
        var pdf = /\.pdf$/i.test(pay.receipt_path || '') || /^data:application\/pdf/.test(u), node;
        if (pdf){ node = el('a', 'ow-receipt', 'Open the PDF receipt'); node.href = u; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
        else { node = el('img', 'ow-receipt'); node.src = u; node.alt = 'Payment receipt sent by the client'; }
        wrap.appendChild(node); b.textContent = 'Hide receipt';
      });
    });
    wrap.appendChild(b);
    return wrap;
  }
  function noteOf(x, k){ var m = String(x.notes || '').match(new RegExp(k + ': ([^·]+)')); return m ? m[1].trim() : ''; }
  /* one detail: its label above its value (a long one takes the full width) */
  function pair(dl, k, v, wide){
    var w = el('div', 'ow-kv-i' + (wide ? ' wide' : '')), dd = el('dd');
    w.appendChild(el('dt', '', k));
    if (v && v.nodeType) dd.appendChild(v); else dd.appendChild(el('span', 'ow-plain', v || '—'));
    w.appendChild(dd); dl.appendChild(w);
  }
  /* a group of details with a small heading */
  function kvGroup(card, title){ var g = el('section', 'ow-kv-g'), dl = el('dl', 'ow-kv'); g.appendChild(el('h4', 'ow-kv-h', title)); g.appendChild(dl); card.appendChild(g); return dl; }
  function link(text, href, label){ var a = el('a', '', text); a.href = href; if (label) a.setAttribute('aria-label', label); return a; }
  function first(name){ return String(name || '').trim().split(/\s+/)[0] || 'the client'; }
  function bookingCard(b){
    var card = el('article', 'ow-glass ow-bk'); card.dataset.id = b.id; card.tabIndex = -1;
    var top = el('div', 'ow-bk-top');
    top.appendChild(el('span', 'ow-av', (String(b.client_name || '?').trim().charAt(0) || '?').toUpperCase())).setAttribute('aria-hidden', 'true');
    var who = el('div', 'ow-who'); who.appendChild(el('h3', '', b.client_name));
    var line = el('p'); line.appendChild(document.createTextNode(b.service + ' · '));
    line.appendChild(el('span', 'ow-when' + (b.status === 'Cancelled' ? ' is-off' : ''), dayShort(b.appt_date) + ', ' + timeOf(b.appt_time)));
    who.appendChild(line);
    var tags = el('div', 'ow-tags'); tags.appendChild(el('span', 'ow-badge ' + (BADGE[b.status] || 'b-requested'), STATUS_WORDS[b.status] || b.status));
    who.appendChild(tags); top.appendChild(who); card.appendChild(top);
    /* deposit, balance and photos – in plain words */
    var m = moneyOf(b), pay = b.status === 'Pending payment' ? S.pays[b.id] : null, facts = el('ul', 'ow-facts');
    function fact(k, v, cls){ var li = el('li', cls || ''); li.appendChild(el('span', 'ow-fact-k', k)); li.appendChild(el('span', 'ow-fact-v', v)); facts.appendChild(li); }
    if (m.dep != null){
      fact('Deposit', money(m.dep) + (m.paid ? ' · paid ✓' : pay ? ' · sent by ' + (PAYNAME[pay.method] || pay.method) + ' – check your account' : b.status === 'Cancelled' ? '' : ' · not paid yet'), m.paid ? 'ok' : pay ? 'check' : 'due');
      if (b.status !== 'Cancelled') fact('Balance due at appointment', money(m.bal));
    }
    fact('Photos', b.photos_addon ? 'Yes' + (m.photos ? ' (' + money(m.photos) + ')' : '') : 'No');
    card.appendChild(facts);
    /* Call and Email: one tap */
    var reach = el('div', 'ow-reach');
    if (b.phone){ var call = el('a', 'btn btn-ghost ow-reach-btn'); call.href = 'tel:' + telOf(b.phone); call.setAttribute('aria-label', 'Call ' + b.client_name + ' on ' + b.phone); call.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/></svg>'; call.appendChild(el('span', '', 'Call')); reach.appendChild(call); }
    if (b.email){ var mail = el('a', 'btn btn-ghost ow-reach-btn'); mail.href = 'mailto:' + b.email; mail.setAttribute('aria-label', 'Email ' + b.client_name); mail.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7l7.5 6 7.5-6"/></svg>'; mail.appendChild(el('span', '', 'Email')); reach.appendChild(mail); }
    if (reach.children.length) card.appendChild(reach);
    /* one big button on a new booking */
    var acts = actionsFor(b), main = acts.filter(function(a){ return PRIMARY[a]; }), rest = acts.filter(function(a){ return !PRIMARY[a]; });
    if (main.length){
      if (main.indexOf('received') >= 0 && pay.method === 'paypal') card.appendChild(el('p', 'ow-hint', 'Check the amount and the client’s name in PayPal before marking the deposit paid. Look for ' + payMoney(pay) + ' from ' + (noteOf(pay, 'Sent from') || b.client_name) + '. The client then gets their confirmation and receipt by email.'));
      else if (main.indexOf('received') >= 0) card.appendChild(el('p', 'ow-hint', 'Check your ' + (pay.method === 'bank' ? 'bank account' : MANUAL[pay.method]) + ' first. Tap Confirm booking only when the ' + money(m.dep != null ? m.dep : 0) + ' deposit is there – the client then gets their confirmation and receipt by email.'));
      if (main.indexOf('confirm') >= 0) card.appendChild(el('p', 'ow-hint', 'Confirm the day and time – the client gets a confirmation email. Mark the deposit paid under More once it arrives.'));
      var row = el('div', 'ow-actions ow-main'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Confirm ' + b.client_name + '’s booking');
      main.forEach(function(a){ var btn = el('button', 'btn btn-dark ow-big', labelOf(a, b)); btn.type = 'button'; btn.dataset.act = a; btn.setAttribute('data-net', ''); row.appendChild(btn); });
      card.appendChild(row);
    }
    var cl = confirmLine(b); if (cl) card.appendChild(cl);
    /* More: the full details, payment to check, the other buttons and her private note */
    var more = el('details', 'ow-more'), sum = el('summary', '', 'More'), body = el('div', 'ow-more-body');
    more.appendChild(sum); more.open = !!S.moreOpen[b.id];
    more.addEventListener('toggle', function(){ if (more.open) S.moreOpen[b.id] = 1; else delete S.moreOpen[b.id]; });
    var dl = kvGroup(body, 'Booking');
    if (b.reference) pair(dl, 'Booking reference', b.reference);
    if (m.price != null) pair(dl, 'Service price', money(m.price));
    if (b.photos_addon) pair(dl, 'Professional photos', money(m.photos));
    if (m.total != null) pair(dl, 'Total', money(m.total));
    if (m.dep != null){ pair(dl, 'Deposit', money(m.dep) + (m.paid ? ' · paid' : ' · not paid yet')); pair(dl, 'Balance due at appointment', money(m.bal)); }
    pair(dl, 'Payment', payInfo(b)[1], true);
    dl = kvGroup(body, 'Client');
    pair(dl, 'Phone', b.phone ? link(b.phone, 'tel:' + telOf(b.phone), 'Call ' + b.client_name + ' on ' + b.phone) : '');
    pair(dl, 'Email', b.email ? link(b.email, 'mailto:' + b.email, 'Email ' + b.client_name) : '');
    pair(dl, 'Agreed to terms', stamp(b.terms_agreed_at));
    if (b.paid_at) pair(dl, 'Marked paid', stamp(b.paid_at));
    if (pay){
      dl = kvGroup(body, 'Payment to check');
      pair(dl, 'Paid by', MANUAL[pay.method] || pay.method);
      pair(dl, 'Amount to look for', payMoney(pay));
      if (noteOf(pay, 'Sent to')) pair(dl, 'Sent to', noteOf(pay, 'Sent to'), true);
      pair(dl, pay.method === 'bank' ? 'Transaction reference' : 'Reference', pay.provider_ref);
      if (pay.method === 'bank') pair(dl, 'Receipt', pay.receipt_path ? receiptBtn(pay) : 'None added');
      pair(dl, 'Sent from', noteOf(pay, 'Sent from'));
      if (noteOf(pay, 'Refund to')) pair(dl, 'Their account (for a refund)', noteOf(pay, 'Refund to'), true);
    }
    if (b.client_note){ var nq = el('p', 'ow-quote'); nq.appendChild(el('b', '', 'Client’s note: ')); nq.appendChild(document.createTextNode(b.client_note)); body.appendChild(nq); }
    if (rest.length){
      var row2 = el('div', 'ow-actions'); row2.setAttribute('role', 'group'); row2.setAttribute('aria-label', 'More for ' + b.client_name + '’s booking');
      rest.forEach(function(a){ var btn = el('button', 'btn btn-ghost', LABEL[a]); btn.type = 'button'; btn.dataset.act = a; btn.setAttribute('data-net', ''); row2.appendChild(btn); });
      body.appendChild(row2);
      if (rest.indexOf('paid') >= 0) body.appendChild(el('p', 'ow-hint', 'Mark deposit paid: check the deposit is in your account first.'));
      if (rest.indexOf('cancel') >= 0) body.appendChild(el('p', 'ow-hint', 'Cancel does not refund a deposit – if the client paid, refund them yourself.'));
    }
    var note = el('div', 'ow-note');
    var lab = el('label', '', 'Private note'); lab.htmlFor = 'ow-note-' + b.id;
    var ta = el('textarea'); ta.id = 'ow-note-' + b.id; ta.maxLength = 2000; ta.value = b.owner_note || ''; ta.placeholder = 'Only you can see this';
    var nr = el('div', 'ow-note-row'), sv = el('button', 'btn btn-ghost ow-pill', 'Save note'); sv.type = 'button'; sv.dataset.act = 'note'; sv.setAttribute('data-net', '');
    var flag = el('span', 'ow-saved'); flag.setAttribute('role', 'status');
    nr.appendChild(sv); nr.appendChild(flag); note.appendChild(lab); note.appendChild(ta); note.appendChild(nr); body.appendChild(note);
    more.appendChild(body); card.appendChild(more);
    return card;
  }
  function confirmLine(b){
    var st = S.confirm[b.id], p = el('p', 'ow-confirm'); p.setAttribute('role', 'status');
    if (st === 'sent'){ p.textContent = 'Confirmed ✓ – email sent'; return p; }
    if (b.confirmation_sent_at){ p.textContent = 'Confirmation email sent · ' + stamp(b.confirmation_sent_at); return p; }
    if (st === 'noemail' || ((b.status === 'Confirmed' || b.status === 'Paid') && !b.email)){ p.textContent = 'No email on this booking, so no confirmation email was sent.'; return p; }
    if (st === 'failed'){
      p.appendChild(document.createTextNode('Confirmation email didn’t send. '));
      if (!S.resent[b.id]){ var r = el('button', 'btn btn-ghost ow-pill', 'Resend'); r.type = 'button'; r.dataset.act = 'resend'; r.setAttribute('data-net', ''); p.appendChild(r); }
      else p.appendChild(document.createTextNode('Please let the client know yourself.'));
      return p;
    }
    return null;
  }
  function find(id){ return S.bookings.filter(function(x){ return x.id === id; })[0]; }
  /* the card is redrawn in place: no entrance, but its new status lands with a squash, and big wins sparkle */
  function redraw(card, b, win){
    var grp = card.closest('[data-group]');
    if (grp && grp.dataset.group !== groupOf(b)){
      counts(); renderBookings(false);
      var moved = $('.ow-bk[data-id="' + b.id + '"]');
      if (moved){ moved.classList.add('still', 'just'); moved.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'nearest' }); if (win) setTimeout(function(){ sparkle($('.ow-badge', moved), win === 'small'); }, 160); }
      return moved || card;
    }
    var fresh = bookingCard(b); fresh.classList.add('still', 'just'); card.parentNode.replaceChild(fresh, card); applyNet();
    if (win) setTimeout(function(){ sparkle($('.ow-badge', fresh), win === 'small'); }, 160);
    return fresh;
  }
  function lockCard(card, on){ $$('button', card).forEach(function(x){ if (on) x.disabled = true; else if (x.getAttribute('aria-busy') !== 'true') x.disabled = isOffline() && x.hasAttribute('data-net'); }); }
  /* only shows the new status after Supabase confirms it; on failure the card stays as it was */
  function update(b, patch, btn, card){
    if (isOffline()){ toast(OFFLINE); return Promise.resolve(false); }
    lockCard(card, true); busy(btn, true, 'Saving…');
    return q(function(){ return client.from('bookings').update(patch).eq('id', b.id).select('*'); }).then(function(r){
      if (r.error || !r.data || r.data.length !== 1){
        busy(btn, false); lockCard(card, false);
        if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return false; }
        toast('That didn’t save. Please try again.'); return false;
      }
      for (var k in r.data[0]) b[k] = r.data[0][k];
      cacheSet(); counts(); renderStats(); return true;
    });
  }
  function sendConfirmation(b){
    return client.functions.invoke('send-confirmation', { body: { booking_id: b.id } }).then(function(r){
      var d = r && r.data;
      if (d && (d.sent || d.already)){ b.confirmation_sent_at = d.at || b.confirmation_sent_at || new Date().toISOString(); S.confirm[b.id] = 'sent'; return 'sent'; }
      S.confirm[b.id] = d && /no client email/i.test(d.reason || '') ? 'noemail' : 'failed'; return S.confirm[b.id];
    }, function(){ S.confirm[b.id] = 'failed'; return 'failed'; });
  }
  function confirmAndEmail(b, btn, card, statusFirst){
    var step = statusFirst ? update(b, { status: 'Confirmed' }, btn, card) : Promise.resolve(true);
    step.then(function(ok){
      if (!ok) return;
      if (!b.email){ S.confirm[b.id] = 'noemail'; redraw(card, b); toast('Confirmed. There’s no client email, so no confirmation email was sent.'); return; }
      busy(btn, true, 'Sending…'); lockCard(card, true);
      sendConfirmation(b).then(function(res){
        var fresh = redraw(card, b, res === 'sent' ? 'big' : '');
        toast(res === 'sent' ? 'Confirmed ✓ – email sent' : res === 'noemail' ? 'Confirmed. There’s no client email, so no confirmation email was sent.' : 'Confirmed, but the confirmation email didn’t send.');
        var f = $('.ow-confirm .btn, .ow-actions .btn', fresh); if (f) focusLater(f);
      });
    });
  }
  $('#ow-blist').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-act]'); if (!btn || btn.disabled) return;
    var card = btn.closest('.ow-bk'), b = find(card.dataset.id); if (!b) return;
    var a = btn.dataset.act;
    if (isOffline()){ toast(OFFLINE); return; }
    if (a === 'confirm') confirmAndEmail(b, btn, card, true);
    else if (a === 'sendconf') confirmAndEmail(b, btn, card, false);
    else if (a === 'resend'){ S.resent[b.id] = true; confirmAndEmail(b, btn, card, false); }
    else if (a === 'paid') update(b, { status: 'Paid', paid_at: new Date().toISOString() }, btn, card).then(function(ok){ if (ok){ redraw(card, b, 'big'); toast(b.client_name + '’s deposit is marked paid.'); } });
    else if (a === 'done') update(b, { status: 'Done' }, btn, card).then(function(ok){ if (ok){ redraw(card, b, 'small'); toast(b.client_name + '’s booking is marked done.'); } });
    else if (a === 'cancel') askCancel(b, btn, card);
    else if (a === 'move') askMove(b, btn, card);
    else if (a === 'received') checkPayment(b, true, btn, card);
    else if (a === 'notreceived') askDlg('Mark ' + first(b.client_name) + '’s payment as not received? The booking is not confirmed and ' + dayShort(b.appt_date) + ' at ' + timeOf(b.appt_time) + ' becomes free again.',
      'Not received', 'Go back', btn, function(){ checkPayment(b, false, btn, card); });
    else if (a === 'note') saveNote(b, card, btn);
  });
  /* money received → the database confirms the booking (once) and emails the client; not received → the time is freed */
  function checkPayment(b, got, btn, card){
    if (isOffline()){ toast(OFFLINE); return; }
    var pay0 = S.pays[b.id];
    lockCard(card, true); busy(btn, true, got ? 'Confirming…' : 'Saving…');
    client.rpc('admin_verify_manual_payment', { p_booking: b.id, p_received: got }).then(function(r){
      if (r.error || !r.data){
        busy(btn, false); lockCard(card, false);
        if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
        toast(r.error && /no payment waiting/i.test(r.error.message || '') ? 'This payment was already checked. Tap Refresh.' : 'That didn’t save. Please try again.'); return;
      }
      delete S.pays[b.id];
      if (r.data.result === 'confirmed'){
        b.status = 'Confirmed'; b.paid_at = b.paid_at || new Date().toISOString(); b.payment_status = 'paid'; if (r.data.reference) b.reference = r.data.reference;
        if (b.email){ S.confirm[b.id] = 'sent'; b.confirmation_sent_at = b.confirmation_sent_at || new Date().toISOString(); }
        cacheSet(); counts(); renderStats(); redraw(card, b, 'big');
        toast((pay0 && pay0.method === 'paypal' ? 'Deposit marked paid ✓ ' : 'Confirmed ✓ ') + first(b.client_name) + ' gets the confirmation and receipt by email.');
      } else {
        b.status = 'Cancelled'; b.payment_status = 'failed';
        cacheSet(); counts(); renderStats(); redraw(card, b);
        toast('Marked not received. The booking is cancelled and the time is free again.');
      }
    }, function(){ busy(btn, false); lockCard(card, false); toast('That didn’t save. Please try again.'); });
  }
  $('#ow-blist').addEventListener('focusout', function(e){
    var ta = e.target; if (ta.tagName !== 'TEXTAREA') return;
    var card = ta.closest('.ow-bk'), b = card && find(card.dataset.id);
    if (b && (ta.value.trim() || null) !== (b.owner_note || null) && !isOffline()) saveNote(b, card, $('[data-act="note"]', card));
  });
  function saveNote(b, card, btn){
    var ta = $('textarea', card), flag = $('.ow-saved', card), v = ta.value.trim().slice(0, 2000) || null;
    if (btn.disabled) return;
    busy(btn, true, 'Saving…'); flag.textContent = '';
    q(function(){ return client.from('bookings').update({ owner_note: v }).eq('id', b.id).select('id,owner_note'); }).then(function(r){
      busy(btn, false);
      if (r.error || !r.data || r.data.length !== 1){ flag.textContent = ''; toast('Your note didn’t save. Please try again.'); return; }
      b.owner_note = r.data[0].owner_note; cacheSet(); flag.textContent = 'Saved'; if (!RM.matches) replay(flag, 'pop');
    });
  }
  /* cancel asks first */
  var dlg = $('#ow-cancel'), dlgFrom = null, dlgDo = null;
  function askDlg(text, yes, keep, btn, go){
    $('#ow-cancel-text').textContent = text; $('[data-yes]', dlg).textContent = yes; $('[data-keep]', dlg).textContent = keep;
    dlgFrom = btn; dlgDo = go;
    clearTimeout(dlgT); dlg.classList.remove('closing'); dlg.hidden = false; focusLater($('[data-keep]', dlg));
  }
  /* cancel and move go through the database's own functions: they check everything, free or block the time,
     and queue the client's email (cancellation / new time) */
  function adminCall(fn, args, btn, card, okFn){
    if (isOffline()){ toast(OFFLINE); return; }
    lockCard(card, true); busy(btn, true, 'Saving…');
    client.rpc(fn, args).then(function(r){
      busy(btn, false); lockCard(card, false);
      if (r.error || !r.data){
        if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
        toast((r.error && r.error.message && !/^(JWT|fetch|Failed)/i.test(r.error.message)) ? r.error.message : 'That didn’t save. Please try again.'); return;
      }
      okFn(r.data);
    }, function(){ busy(btn, false); lockCard(card, false); toast('That didn’t save. Please try again.'); });
  }
  function askCancel(b, btn, card){
    askDlg('Cancel ' + first(b.client_name) + '’s ' + b.service + ' on ' + dayShort(b.appt_date) + ' at ' + timeOf(b.appt_time) + '? ' + (b.email ? 'They get an email saying it is cancelled. ' : '') + 'This does not refund the deposit – if the client paid, refund them yourself.',
      'Yes, cancel', 'Keep booking', btn, function(){
        adminCall('admin_cancel_booking', { p_booking: b.id, p_reason: 'Cancelled by Launthia' }, btn, card, function(){
          b.status = 'Cancelled'; b.cancelled_at = new Date().toISOString(); delete S.pays[b.id];
          cacheSet(); counts(); renderStats(); redraw(card, b);
          toast(first(b.client_name) + '’s booking is cancelled.' + (b.email ? ' They get an email.' : ''));
        });
      });
  }
  /* move a booking to another day and time (Jamaica time); the database refuses a time that is taken */
  function askMove(b, btn, card){
    askDlg('Move ' + first(b.client_name) + '’s ' + b.service + ' (now ' + dayShort(b.appt_date) + ' at ' + timeOf(b.appt_time) + ') to:', 'Move booking', 'Keep this time', btn, function(){
      var d = $('#ow-move-day').value, t = $('#ow-move-time').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)){ toast('Please choose a day and a time.'); return; }
      adminCall('admin_reschedule_booking', { p_booking: b.id, p_new_start: d + 'T' + t + ':00-05:00' }, btn, card, function(){
        b.appt_date = d; b.appt_time = t; b.start_at = d + 'T' + t + ':00-05:00'; b.rescheduled_at = new Date().toISOString();
        cacheSet(); counts(); renderStats(); renderBookings(false);
        toast(first(b.client_name) + '’s booking is moved to ' + dayShort(d) + ' at ' + timeOf(t) + '.' + (b.email ? ' They get an email with the new time.' : ''));
      });
    });
    var f = el('span', 'ow-move'), di = el('input'), ti = el('input');
    di.type = 'date'; di.id = 'ow-move-day'; di.value = b.appt_date || ''; di.min = today(); di.setAttribute('aria-label', 'New day');
    ti.type = 'time'; ti.id = 'ow-move-time'; ti.value = String(b.appt_time || '').slice(0, 5); ti.step = 900; ti.setAttribute('aria-label', 'New time (Jamaica time)');
    f.appendChild(di); f.appendChild(ti); $('#ow-cancel-text').appendChild(f);
  }
  /* it eases away (about 0.2 s) instead of vanishing */
  var dlgT = 0;
  function hideDlg(){ if (RM.matches){ dlg.hidden = true; return; } dlg.classList.add('closing'); clearTimeout(dlgT); dlgT = setTimeout(function(){ dlg.hidden = true; dlg.classList.remove('closing'); }, 170); }
  function closeDlg(){ hideDlg(); if (dlgFrom && dlgFrom.isConnected) focusLater(dlgFrom); dlgDo = null; }
  $('[data-keep]', dlg).addEventListener('click', closeDlg);
  $('[data-yes]', dlg).addEventListener('click', function(){ var go = dlgDo; hideDlg(); dlgDo = null; if (go) go(); });
  dlg.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); closeDlg(); return; }
    if (e.key === 'Tab'){ var bs = $$('button', dlg), i = bs.indexOf(document.activeElement); e.preventDefault(); bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus(); }
  });
  dlg.addEventListener('click', function(e){ if (e.target === dlg) closeDlg(); });
  /* tools */
  $$('[data-when]').forEach(function(b){ b.addEventListener('click', function(){ S.when = b.dataset.when; $$('[data-when]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); placeMarks(); if (S.day !== 'all') setDay('all'); renderBookings(true); }); });
  var calBtn = $('#ow-bday'), cal = $('#ow-cal'), calM = { y: 0, m: 0 };
  function setDay(d){
    S.day = d; $$('[data-day]').forEach(function(x){ x.setAttribute('aria-pressed', String(x.dataset.day === d)); });
    calBtn.classList.toggle('on', d === 'date'); calBtn.setAttribute('aria-pressed', String(d === 'date'));
    $('#ow-bday-text').textContent = d === 'date' && S.dayPick ? dayShort(S.dayPick) : 'Pick a date';
  }
  $$('[data-day]').forEach(function(b){ b.addEventListener('click', function(){ calClose(false); setDay(b.dataset.day); renderBookings(true); }); });
  $$('[data-st]').forEach(function(b){ b.addEventListener('click', function(){
    S.st = b.dataset.st; $$('[data-st]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); renderBookings(true);
  }); });

  /* "Pick a date": the dashboard's own little calendar (the phone's date box can't be opened reliably from a
     chip, and inside some windows not at all). Days with bookings carry a champagne dot. */
  function two(n){ return ('0' + n).slice(-2); }
  function calOpen(){
    var base = S.day === 'date' && S.dayPick ? S.dayPick : today();
    calM = { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
    renderCal(base); cal.hidden = false; calBtn.setAttribute('aria-expanded', 'true');
  }
  function calClose(back){ if (cal.hidden) return; cal.hidden = true; calBtn.setAttribute('aria-expanded', 'false'); if (back) focusLater(calBtn); }
  function renderCal(focusYmd){
    var y = calM.y, m = calM.m, first = new Date(Date.UTC(y, m, 1, 12)), days = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
    var t = today(), picked = S.day === 'date' ? S.dayPick : '', key = y + '-' + two(m + 1), has = {};
    S.bookings.forEach(function(b){ if (b.appt_date && b.appt_date.slice(0, 7) === key && b.status !== 'Cancelled') (has[b.appt_date] = has[b.appt_date] || []).push(b); });
    if (!focusYmd || focusYmd.slice(0, 7) !== key) focusYmd = picked && picked.slice(0, 7) === key ? picked : t.slice(0, 7) === key ? t : key + '-01';
    cal.textContent = '';
    var head = el('div', 'ow-cal-head'), title = el('p', 'ow-cal-title', first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
    title.setAttribute('aria-live', 'polite');
    function nav(dir, label, d){ var b = el('button', 'ow-cal-nav'); b.type = 'button'; b.dataset.nav = dir; b.setAttribute('aria-label', label); b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="' + d + '"/></svg>'; return b; }
    head.appendChild(nav('-1', 'Previous month', 'M15 5l-7 7 7 7')); head.appendChild(title); head.appendChild(nav('1', 'Next month', 'M9 5l7 7-7 7'));
    cal.appendChild(head);
    var grid = el('div', 'ow-cal-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', title.textContent);
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function(w){ var c = el('span', 'ow-cal-wd', w); c.setAttribute('aria-hidden', 'true'); grid.appendChild(c); });
    for (var i = 0; i < lead; i++){ var blank = el('span', 'ow-cal-day out'); blank.setAttribute('aria-hidden', 'true'); grid.appendChild(blank); }
    for (var d = 1; d <= days; d++){
      var ymd = key + '-' + two(d), list = (has[ymd] || []).slice().sort(function(a, c){ return a.appt_time < c.appt_time ? -1 : 1; }), n = list.length, b = el('button', 'ow-cal-day' + (ymd === t ? ' is-today' : '') + (n ? ' has' : ''), String(d));
      b.type = 'button'; b.dataset.ymd = ymd; b.tabIndex = ymd === focusYmd ? 0 : -1;
      b.setAttribute('aria-pressed', String(ymd === picked));
      var who = list.map(function(x){ return x.client_name + ' at ' + timeOf(x.appt_time); }).join(', ');
      if (n){ b.dataset.n = n; b.title = 'Booked: ' + who; }
      b.setAttribute('aria-label', dayLong(ymd) + (ymd === t ? ', today' : '') + (n ? ', booked: ' + n + (n === 1 ? ' booking' : ' bookings') + ' (' + who + ')' : ''));
      grid.appendChild(b);
    }
    cal.appendChild(grid);
    var foot = el('div', 'ow-cal-foot'), keyNote = el('span', 'ow-cal-key');
    keyNote.innerHTML = '<span><i class="k-booked" aria-hidden="true"></i>Booked (number = bookings)</span><span><i class="k-today" aria-hidden="true"></i>Today</span>';
    foot.appendChild(keyNote);
    if (picked){ var clr = el('button', 'ow-link', 'Clear date'); clr.type = 'button'; clr.dataset.clear = ''; foot.appendChild(clr); }
    cal.appendChild(foot);
    return $('[data-ymd="' + focusYmd + '"]', cal);
  }
  function calShift(n, focusYmd){ calM.m += n; while (calM.m < 0){ calM.m += 12; calM.y--; } while (calM.m > 11){ calM.m -= 12; calM.y++; } return renderCal(focusYmd); }
  calBtn.addEventListener('click', function(){ if (cal.hidden){ calOpen(); focusLater($('.ow-cal-day[tabindex="0"]', cal)); } else calClose(true); });
  cal.addEventListener('click', function(e){
    var day = e.target.closest('[data-ymd]'), nv = e.target.closest('[data-nav]'), clr = e.target.closest('[data-clear]');
    if (day){ S.dayPick = day.dataset.ymd; setDay('date'); renderBookings(true); calClose(true); }
    else if (nv){ calShift(+nv.dataset.nav); focusLater($('[data-nav="' + nv.dataset.nav + '"]', cal)); }
    else if (clr){ setDay('all'); renderBookings(true); calClose(true); }
  });
  cal.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); calClose(true); return; }
    var day = e.target.closest('[data-ymd]'); if (!day) return;
    var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], target;
    if (step) target = addDays(day.dataset.ymd, step);
    else if (e.key === 'PageUp' || e.key === 'PageDown'){ var dd = day.dataset.ymd.slice(8); calShift(e.key === 'PageUp' ? -1 : 1); target = calM.y + '-' + two(calM.m + 1) + '-' + dd; }
    else return;
    e.preventDefault();
    var f = $('[data-ymd="' + target + '"]', cal) || (target.slice(0, 7) !== calM.y + '-' + two(calM.m + 1) ? calShift(target > day.dataset.ymd ? 1 : -1, target) : null);
    if (!f) f = $('[data-ymd="' + target + '"]', cal) || $('.ow-cal-day[tabindex="0"]', cal);
    if (f){ $$('.ow-cal-day[tabindex="0"]', cal).forEach(function(x){ x.tabIndex = -1; }); f.tabIndex = 0; f.focus(); }
  });
  /* a tap anywhere else closes it (the path is read at tap time, because month buttons are redrawn as they're tapped) */
  document.addEventListener('click', function(e){ if (cal.hidden) return; var path = e.composedPath ? e.composedPath() : [e.target]; if (path.indexOf(cal) < 0 && path.indexOf(calBtn) < 0) calClose(false); });
  $('#ow-bq').addEventListener('input', function(){ S.bq = this.value.trim(); renderBookings(false); });

  /* ---------------- B) Glow Club ---------------- */
  function clubShown(){ return S.club.filter(function(r){ return (S.pref === 'all' || r.contact_pref === S.pref) && hit(r, ['name', 'phone', 'email'], S.cq); }); }
  function consenting(r){ return !!r.marketing_consent && !r.unsubscribed_at; }
  function renderClub(fresh){
    var mo = parseInt(today().slice(5, 7), 10), bd = $('#ow-bdays'); bd.textContent = '';
    var bl = S.club.filter(function(r){ return r.birth_month === mo; }).sort(function(a, b){ return a.birth_day - b.birth_day; });
    bd.appendChild(el('h2', '', 'Birthdays this month'));
    if (!bl.length) bd.appendChild(el('p', '', 'No birthdays this month.'));
    else { var ul = el('ul'); bl.forEach(function(r, i){ var li = el('li', fresh ? '' : 'still', r.name + ' · ' + bday(r)); li.style.setProperty('--i', Math.min(i, 8)); ul.appendChild(li); }); bd.appendChild(ul); }
    var box = $('#ow-clist'); box.textContent = '';
    var l = clubShown();
    if (!l.length){ box.appendChild(el('p', 'ow-glass ow-empty' + (fresh ? '' : ' still'), !S.club.length ? 'No Glow Club members yet. New sign-ups will appear here.' : 'Nobody matches.')); return; }
    var listEl = el('div', 'ow-members');
    l.forEach(function(r, i){
      var card = el('article', 'ow-glass ow-member' + (fresh ? '' : ' still')); card.dataset.cid = r.id; card.style.setProperty('--i', Math.min(i, 10));
      card.appendChild(el('h3', 'ow-member-name', r.name));
      var facts = el('ul', 'ow-facts');
      [['Birthday', r.birth_month ? (r.birth_day ? r.birth_day + ' ' : '') + MONTHS_FULL[r.birth_month - 1] : '—'], ['Contact by', r.contact_pref || '—']].forEach(function(f){ var li = el('li'); li.appendChild(el('span', 'ow-fact-k', f[0])); li.appendChild(el('span', 'ow-fact-v', f[1])); facts.appendChild(li); });
      card.appendChild(facts);
      var more = el('details', 'ow-more'), mb = el('div', 'ow-more-body'); more.appendChild(el('summary', '', 'More'));
      var dl = el('dl', 'ow-kv');
      pair(dl, 'Contact', r.contact_pref === 'Email' ? (r.email ? link(r.email, 'mailto:' + r.email, 'Email ' + r.name) : '') : (r.phone ? link(r.phone, 'tel:' + telOf(r.phone), 'Call ' + r.name + ' on ' + r.phone) : ''));
      pair(dl, 'Offers', r.unsubscribed_at ? 'No – stopped ' + stamp(r.unsubscribed_at) : r.marketing_consent ? 'Yes · ' + stamp(r.consent_at) : 'No');
      pair(dl, 'Joined', new Date(r.created_at).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }));
      mb.appendChild(dl);
      var act = el('div', 'ow-actions');
      var fn = first(r.name), hi = 'Hi ' + fn + ', it’s Launthia from Glow by Launthia.\n\n\n\n';
      if (r.phone){ var tx = el('a', 'btn btn-ghost', 'Text'); tx.href = 'sms:' + telOf(r.phone) + (consenting(r) ? (IOS ? '&' : '?') + 'body=' + encodeURIComponent(hi + 'Reply STOP to stop these messages.') : ''); tx.setAttribute('aria-label', 'Text ' + r.name); act.appendChild(tx); }
      if (r.phone && r.contact_pref === 'WhatsApp'){ var wa = el('a', 'btn btn-ghost', 'WhatsApp'); wa.href = 'https://wa.me/' + telOf(r.phone).replace(/\D/g, '') + (consenting(r) ? '?text=' + encodeURIComponent(hi + 'Reply STOP to stop these messages.') : ''); wa.target = '_blank'; wa.rel = 'noopener'; wa.setAttribute('aria-label', 'WhatsApp ' + r.name + ' (opens in a new tab)'); act.appendChild(wa); }
      /* Email: members who agreed to offers get the message writer (birthday, thinking of you, new openings);
         anyone else gets a plain email with no offer in it */
      if (r.email && consenting(r)){ var em = el('button', 'btn btn-ghost', 'Email'); em.type = 'button'; em.dataset.compose = r.id; em.setAttribute('aria-label', 'Write an email to ' + r.name); act.appendChild(em); }
      else if (r.email){ var pe = el('a', 'btn btn-ghost', 'Email'); pe.href = 'mailto:' + r.email; pe.setAttribute('aria-label', 'Email ' + r.name); act.appendChild(pe); }
      if (consenting(r)){ var st = el('button', 'btn btn-ghost', 'Mark as STOP'); st.type = 'button'; st.dataset.stop = r.id; st.setAttribute('data-net', ''); st.setAttribute('aria-label', r.name + ' replied STOP: no more offers'); act.appendChild(st); }
      mb.appendChild(act); more.appendChild(mb); card.appendChild(more); listEl.appendChild(card);
    });
    box.appendChild(listEl); applyNet();
  }
  /* ---------------- Glow Club message writer ----------------
     Warm, polished emails written for one member, ready to send from her own email. Nothing is sent by the
     website. Offers only ever go to members who agreed, and every message says how to stop them. */
  var PHONE = '1-876-277-8913', MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function letter(kind, r){
    var fn = first(r.name), t = today(), mo = +t.slice(5, 7), d = +t.slice(8, 10);
    var sign = function(close){ return '\n\n' + close + ',\nLaunthia\nGlow by Launthia\nStation Road, Little London, Westmoreland\n' + PHONE + '\n\nYou’re receiving this because you joined the Glow Club. To stop these emails, just reply STOP.'; };
    if (kind === 'birthday'){
      var when = r.birth_month === mo && r.birth_day ? (r.birth_day > d ? 'soon' : r.birth_day === d ? 'today' : 'past') : 'month';
      var open = when === 'today' ? 'Happy birthday! Today is all about you, and I hope it is every bit as beautiful as you are.'
        : when === 'soon' ? 'Your birthday is almost here (' + r.birth_day + ' ' + MONTHS_LONG[mo - 1] + '), and I wanted to be one of the very first to wish you a happy birthday!'
        : when === 'past' ? 'I hope you had the most beautiful birthday! I was thinking of you and wanted to send a little love your way.'
        : 'Happy birthday from me at Glow by Launthia! I was thinking of you and wanted to send a little love your way.';
      var mid = when === 'past'
        ? 'And it is never too late to keep celebrating you. If you still have a birthday dinner, a party or photos coming up, I would love to create a look that makes you feel unforgettable.'
        : 'Your birthday deserves a look that feels as special as you are. Whether you are planning a dinner, a party, a photoshoot or simply a day that is all about you, I would love to create a glam that makes you look and feel unforgettable.';
      return { subject: 'Happy birthday, ' + fn + '! Let’s make it a glam one',
        body: 'Hi ' + fn + ',\n\n' + open + '\n\n' + mid + '\n\nAs one of my Glow Club members, you are always among the first I think of. Just reply to this email or call or text me on ' + PHONE + ', and I will do my very best to fit you in for your birthday glam.\n\nThank you for being part of the Glow family. Having you here truly means the world to me.' + sign('With love') };
    }
    if (kind === 'openings') return { subject: 'New appointments at Glow by Launthia – you’re the first to know',
      body: 'Hi ' + fn + ',\n\nI have just opened new appointments, and as a Glow Club member, you are the first to hear about them.\n\nIf you have something coming up – a celebration, a photoshoot, a wedding or simply a day you want to feel your very best – now is the perfect time to book your Soft Glam or Full Glam, or to ask me about Bridal.\n\nJust reply to this email or call or text me on ' + PHONE + ' to save your spot before they fill up.\n\nI cannot wait to see you!' + sign('With love') };
    return { subject: 'Thinking of you, ' + fn,
      body: 'Hi ' + fn + ',\n\nI hope you are doing well! I was thinking about you and just wanted to say hello.\n\nWhenever you are ready for your next look – a soft everyday glow, a full glam for a night out, or something special for an event – I would love to have you back in my chair.\n\nAs a Glow Club member, you get first access to my openings. Just reply to this email or call or text me on ' + PHONE + ', and we will find a time that suits you.\n\nThank you for trusting me with your beauty. It means more than you know.' + sign('Warmly') };
  }
  var cmp = $('#ow-compose'), cmpWho = null, cmpFrom = null, cmpT = 0;
  function cmpLinks(){
    var sub = $('#ow-compose-subject').value, body = $('#ow-compose-body').value;
    $('#ow-compose-mail').href = 'mailto:' + (cmpWho ? cmpWho.email : '') + '?subject=' + encodeURIComponent(sub) + '&body=' + encodeURIComponent(body);
  }
  function cmpPick(kind){
    $$('[data-msg]', cmp).forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.msg === kind)); });
    var m = letter(kind, cmpWho); $('#ow-compose-subject').value = m.subject; $('#ow-compose-body').value = m.body; cmpLinks();
    anim($('#ow-compose-body'), [{ opacity: .35 }, { opacity: 1 }], { duration: 260, easing: EASE });
  }
  function cmpOpen(r, from){
    cmpWho = r; cmpFrom = from;
    $('#ow-compose-title').textContent = ''; $('#ow-compose-title').appendChild(document.createTextNode('Email ')); $('#ow-compose-title').appendChild(el('em', '', first(r.name)));
    $('#ow-compose-to').textContent = r.name + ' · ' + r.email;
    var mo = +today().slice(5, 7);
    cmpPick(r.birth_month === mo ? 'birthday' : 'checkin');
    clearTimeout(cmpT); cmp.classList.remove('closing'); cmp.hidden = false; $('.ow-compose', cmp).scrollTop = 0;
    focusLater($('[data-msg][aria-pressed="true"]', cmp));
  }
  function cmpClose(){
    if (cmp.hidden) return;
    var done = function(){ cmp.hidden = true; cmp.classList.remove('closing'); };
    if (RM.matches) done(); else { cmp.classList.add('closing'); clearTimeout(cmpT); cmpT = setTimeout(done, 170); }
    if (cmpFrom && cmpFrom.isConnected) focusLater(cmpFrom);
  }
  $$('[data-msg]', cmp).forEach(function(b){ b.addEventListener('click', function(){ cmpPick(b.dataset.msg); }); });
  ['#ow-compose-subject', '#ow-compose-body'].forEach(function(s){ $(s).addEventListener('input', cmpLinks); });
  $('[data-close]', cmp).addEventListener('click', cmpClose);
  cmp.addEventListener('click', function(e){ if (e.target === cmp) cmpClose(); });
  cmp.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); cmpClose(); return; }
    if (e.key !== 'Tab') return;
    var f = $$('button, a[href], input, textarea', $('.ow-compose', cmp)).filter(function(x){ return !x.disabled && x.offsetParent; });
    var i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)){ e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1){ e.preventDefault(); f[0].focus(); }
  });
  $('#ow-compose-mail').addEventListener('click', function(){ cmpLinks(); toast('Your email is opening with the message ready to send.'); });
  $('#ow-compose-copy').addEventListener('click', function(){
    var b = this, text = $('#ow-compose-body').value;
    var ok = function(){ toast('Message copied. Paste it into your email to ' + first(cmpWho.name) + '.'); sparkle(b, true); };
    var fallback = function(){ var ta = $('#ow-compose-body'); ta.focus(); ta.select(); try { if (document.execCommand('copy')) { ok(); return; } } catch (er) {} toast('Select the message and copy it.'); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback(); } catch (er) { fallback(); }
  });

  $('#ow-clist').addEventListener('click', function(e){
    var c = e.target.closest('button[data-compose]');
    if (c){ var who = S.club.filter(function(x){ return x.id === c.dataset.compose; })[0]; if (who) cmpOpen(who, c); return; }
    var b = e.target.closest('button[data-stop]'); if (!b || b.disabled) return;
    if (isOffline()){ toast(OFFLINE); return; }
    var r = S.club.filter(function(x){ return x.id === b.dataset.stop; })[0]; if (!r) return;
    busy(b, true, 'Saving…');
    q(function(){ return client.from('glow_club').update({ marketing_consent: false, unsubscribed_at: new Date().toISOString() }).eq('id', r.id).select('*'); }).then(function(res){
      if (res.error || !res.data || res.data.length !== 1){ busy(b, false); toast('That didn’t save. Please try again.'); return; }
      for (var k in res.data[0]) r[k] = res.data[0][k];
      cacheSet(); renderClub(false); toast('Saved: no more offers to ' + r.name + '.');
    });
  });
  $('#ow-cq').addEventListener('input', function(){ S.cq = this.value.trim(); renderClub(false); });
  $$('[data-pref]').forEach(function(b){ b.addEventListener('click', function(){ S.pref = b.dataset.pref; $$('[data-pref]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); renderClub(true); }); });
  /* spreadsheets (UTF-8). Cells that start like a formula are made harmless. */
  function cell(v){ v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function download(name, rows){
    var head = ['Name', 'Phone', 'Email', 'Contact preference', 'Birthday', 'Marketing consent', 'Consent given', 'Stopped offers', 'Joined'];
    var body = rows.map(function(r){ return [r.name, r.phone, r.email, r.contact_pref, bday(r), r.marketing_consent && !r.unsubscribed_at ? 'Yes' : 'No', stamp(r.consent_at), stamp(r.unsubscribed_at), stamp(r.created_at)]; });
    var csv = '﻿' + [head].concat(body).map(function(row){ return row.map(cell).join(','); }).join('\r\n');
    try {
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
      var framed = true; try { framed = window.self !== window.top; } catch (er) {}
      toast(framed ? 'Downloading ' + name + '. If nothing appears, this window blocks downloads – open your dashboard in your browser and try again.' : 'Downloaded ' + name);
    } catch (e) { toast('We couldn’t make the file on this device.'); }
  }
  $('#ow-csv-all').addEventListener('click', function(){ download('glow-club-' + today() + '.csv', S.club); });
  $('#ow-csv-mkt').addEventListener('click', function(){ download('glow-club-marketing-' + today() + '.csv', S.club.filter(consenting)); });

  /* ---------------- C) stats (from her own data only) ---------------- */
  function renderStats(){
    var box = $('#ow-stats'); box.textContent = '';
    var t = today(), mo = t.slice(0, 7);
    var month = S.bookings.filter(function(b){ return live(b) && String(b.appt_date).slice(0, 7) === mo; }).length;
    var conf = S.bookings.filter(function(b){ return live(b) && b.appt_date >= t && (b.status === 'Confirmed' || b.status === 'Paid'); }).length;
    /* the numbers count up each time she opens the Stats tab (in setTab); data-v keeps the real value */
    function stat(big, label, why){ var c = el('div', 'ow-glass ow-stat'), n = el('b', '', big); n.dataset.v = big; c.appendChild(n); c.appendChild(el('span', '', label)); c.appendChild(el('p', '', why)); box.appendChild(c); }
    stat(String(month), 'Bookings this month', 'Appointments this month, not counting cancelled.');
    stat(String(conf), 'Confirmed upcoming', 'Confirmed appointments from today on.');
    stat(money(depositsThisMonth(mo)), 'Deposits received this month', 'Deposits you confirmed this month.');
    stat(String(S.club.length), 'Glow Club members', 'Everyone who has joined the Glow Club.');
  }

  /* ---------------- D) settings: booking alerts ---------------- */
  var sw = $('#ow-alerts-on');
  /* the words next to the switch flip it too */
  $('#ow-alerts-label').addEventListener('click', function(){ sw.click(); sw.focus(); });
  sw.addEventListener('click', function(){
    if (sw.disabled) return;
    var on = sw.getAttribute('aria-checked') !== 'true', st = $('#ow-alerts-status');
    if (isOffline()){ st.textContent = OFFLINE; return; }
    sw.setAttribute('aria-checked', String(on)); if (!RM.matches) replay(sw, 'flip');
    sw.disabled = true; st.textContent = 'Saving…';
    q(function(){ return client.from('owner_settings').update({ email_alerts: on, updated_at: new Date().toISOString() }).eq('id', 1).select('*'); }).then(function(r){
      sw.disabled = false;
      if (r.error || !r.data || r.data.length !== 1){ sw.setAttribute('aria-checked', String(!on)); st.textContent = 'That didn’t save. Please try again.'; shake(sw); return; }
      S.settings = r.data[0]; st.textContent = on ? 'Email alerts are on ✓' : 'Email alerts are off. New bookings still show in your dashboard.';
    });
  });
  /* the chime for new bookings (this phone or computer only) */
  var snd = $('#ow-sound-on');
  snd.setAttribute('aria-checked', String(soundOn()));
  $('#ow-sound-label').addEventListener('click', function(){ snd.click(); snd.focus(); });
  snd.addEventListener('click', function(){
    var on = snd.getAttribute('aria-checked') !== 'true';
    snd.setAttribute('aria-checked', String(on)); if (!RM.matches) replay(snd, 'flip');
    try { localStorage.setItem('glow.owner.sound', on ? 'on' : 'off'); } catch (e) {}
    $('#ow-alerts-status').textContent = on ? 'Sound on ✓ You’ll hear a soft chime when someone books.' : 'Sound off.';
    if (on) chime(true);
  });
  /* the first-time tip, once */
  $('#ow-tip-ok').addEventListener('click', function(){ try { localStorage.setItem('glow.owner.tip', 'seen'); } catch (e) {} $('#ow-tip').hidden = true; focusLater($('#ow-bq')); });
  sw.addEventListener('keydown', function(e){ if (e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); sw.click(); } });
  function fillSettings(){
    var s = S.settings;
    if (s){ sw.setAttribute('aria-checked', String(!!s.email_alerts)); if (document.activeElement !== $('#ow-alert-email')) $('#ow-alert-email').value = s.alert_email || ''; }
    var la = S.lastAlert, line = $('#ow-last-alert');
    line.textContent = !la ? 'No alerts sent yet.' : 'Last alert: ' + stamp(la.created_at) + ' · ' + (la.status === 'sent' ? 'Sent' : la.status === 'skipped' ? 'Skipped – ' + (la.detail || '') : 'Failed – ' + (la.detail || 'no reason given'));
  }
  $('#ow-alerts').addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('#ow-alerts-save'), st = $('#ow-addr-status'), em = $('#ow-alert-email').value.trim(), on = sw.getAttribute('aria-checked') === 'true';
    if (b.disabled) return;
    if (!emailOk(em)){ st.textContent = 'Please enter a valid email address for your alerts.'; $('#ow-alert-email').closest('.field').classList.add('invalid'); shake($('#ow-alert-email').closest('.field')); focusLater($('#ow-alert-email')); return; }
    $('#ow-alert-email').closest('.field').classList.remove('invalid');
    if (isOffline()){ st.textContent = OFFLINE; return; }
    busy(b, true, 'Saving…'); st.textContent = '';
    q(function(){ return client.from('owner_settings').update({ email_alerts: on, alert_email: em, updated_at: new Date().toISOString() }).eq('id', 1).select('*'); }).then(function(r){
      busy(b, false);
      if (r.error || !r.data || r.data.length !== 1){ st.textContent = 'That didn’t save. Your changes are still here – please try again.'; shake(b); return; }
      S.settings = r.data[0]; st.textContent = 'Saved ✓'; sparkle(b);
    });
  });
  $('#ow-test').addEventListener('click', function(){
    var b = this, st = $('#ow-alerts-status');
    if (b.disabled) return;
    var left = Math.ceil((30000 - (Date.now() - S.testAt)) / 1000);
    if (left > 0){ st.textContent = 'Please wait ' + left + ' seconds before sending another test.'; return; }
    if (isOffline()){ st.textContent = OFFLINE; return; }
    S.testAt = Date.now(); busy(b, true, 'Sending…'); st.textContent = '';
    client.functions.invoke('notify-owner', { body: { test: true } }).then(function(r){
      busy(b, false);
      var d = r && r.data;
      st.textContent = d && d.sent ? 'Test email sent – check your inbox (and spam folder).' : 'The test email didn’t send' + (d && d.reason ? ' (' + String(d.reason).slice(0, 120) + ')' : '') + '. Check the Resend key and sender in Supabase.';
      if (d && d.sent) sparkle(b); else shake(b);
      q(function(){ return client.from('alert_log').select('created_at,kind,status,detail').in('kind', ['booking', 'test']).order('created_at', { ascending: false }).limit(1); }).then(function(x){ if (!x.error){ S.lastAlert = (x.data || [])[0] || null; fillSettings(); } });
    }, function(){ busy(b, false); st.textContent = 'The test email didn’t send. Check your internet connection.'; });
  });
  $('#ow-change-pw').addEventListener('click', function(){
    var b = this, st = $('#ow-account-status');
    if (b.disabled || isOffline()) return;
    busy(b, true, 'Sending…');
    client.auth.resetPasswordForEmail(S.me, { redirectTo: resetLink() }).then(function(r){
      busy(b, false); st.textContent = r.error ? 'We couldn’t send the link. Please try again in a minute.' : 'A link to change your password is on its way to ' + S.me + '.';
    }, function(){ busy(b, false); st.textContent = NO_NET; });
  });
  $$('[data-signout]').forEach(function(b){ b.addEventListener('click', function(){ wipe(); signOutNow(); show('signin', 'You’re signed out.'); }); });

  /* ---------------- D) settings: prices and days off (shown on the website) ----------------
     Saved in the database; the website reads them when a page opens. When the dashboard is open in the same
     page as the site (the single file), the site also updates at once. */
  function siteNews(){ try { dispatchEvent(new CustomEvent('glow:site', { detail: { prices: S.prices || undefined, daysOff: S.daysOff.slice() } })); } catch (e) {} }
  function priceClean(v){ return String(v || '').replace(/\s+/g, ' ').trim().replace(/^\$\s*/, '').replace(/\s*[-–—]\s*\$?\s*/, ' – $'); }
  function priceOk(v){ return v.length >= 1 && v.length <= 40 && /^[0-9][0-9 ,.$–-]*$/.test(v); }
  function fillSite(){
    var p = S.prices || {}, w = { 'Soft Glam': window.SOFT_GLAM_PRICE, 'Natural Full Glam': window.FULL_GLAM_NATURAL_PRICE, 'Statement Full Glam': window.FULL_GLAM_STATEMENT_PRICE };
    PRICE_FIELDS.forEach(function(x){ var i = $(x[0]); if (document.activeElement !== i && !i.dataset.dirty) i.value = p[x[1]] || String(w[x[1]] || ''); });
    if (S.siteErr) $('#ow-off-status').textContent = 'Your prices and days off couldn’t load. Run the latest setup in Supabase, then tap Refresh.';
    renderOff();
  }
  var PRICE_FIELDS = [['#ow-price-sg', 'Soft Glam'], ['#ow-price-fgn', 'Natural Full Glam'], ['#ow-price-fgs', 'Statement Full Glam']];
  PRICE_FIELDS.forEach(function(x){ $(x[0]).addEventListener('input', function(){ this.dataset.dirty = '1'; this.closest('.field').classList.remove('invalid'); $('#ow-prices-status').textContent = ''; }); });
  /* one fixed price for a Full Glam look: numbers only, e.g. 10,500 */
  function lookNum(v){ var t = String(v || '').replace(/[\s$]/g, ''); return /^[0-9][0-9,]*$/.test(t) && +t.replace(/,/g, '') >= 1 ? +t.replace(/,/g, '') : null; }
  function fmtJ(n){ return n.toLocaleString('en-US'); }
  $('#ow-prices').addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('#ow-prices-save'), st = $('#ow-prices-status'), sg = priceClean($('#ow-price-sg').value), fn = lookNum($('#ow-price-fgn').value), fs = lookNum($('#ow-price-fgs').value);
    if (b.disabled) return;
    $$('#ow-prices .field').forEach(function(f){ f.classList.remove('invalid'); });
    var bad = !priceOk(sg) ? '#ow-price-sg' : fn == null ? '#ow-price-fgn' : fs == null ? '#ow-price-fgs' : '';
    if (bad){
      st.textContent = bad === '#ow-price-sg' ? 'Please write the price in numbers, like 9,500 or 10,500 – $12,000.' : 'Please write one price in numbers for each Full Glam look, like 10,500.';
      var f = $(bad).closest('.field'); f.classList.add('invalid'); shake(f); focusLater($(bad)); return;
    }
    if (isOffline()){ st.textContent = OFFLINE; return; }
    busy(b, true, 'Saving…'); st.textContent = '';
    var at = new Date().toISOString(), fnT = fmtJ(fn), fsT = fmtJ(fs), lo = Math.min(fn, fs), hi = Math.max(fn, fs);
    var fg = lo === hi ? fmtJ(lo) : fmtJ(lo) + ' – $' + fmtJ(hi);   /* the Full Glam card shows the range between the two looks */
    function save(svc, v){ return q(function(){ return client.from('site_prices').update({ price_text: v, updated_at: at }).eq('service', svc).select('service,price_text'); }); }
    Promise.all([save('Soft Glam', sg), save('Natural Full Glam', fnT), save('Statement Full Glam', fsT), save('Full Glam', fg)]).then(function(r){
      busy(b, false);
      if (r.some(function(x){ return x.error && authErr(x.error); })){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
      if (r.some(function(x){ return x.error || !x.data || x.data.length !== 1; })){ st.textContent = 'Your prices didn’t save. Your changes are still here – please try again.'; shake(b); return; }
      S.prices = { 'Soft Glam': sg, 'Full Glam': fg, 'Natural Full Glam': fnT, 'Statement Full Glam': fsT };
      PRICE_FIELDS.forEach(function(x){ $(x[0]).removeAttribute('data-dirty'); });
      $('#ow-price-sg').value = sg; $('#ow-price-fgn').value = fnT; $('#ow-price-fgs').value = fsT;
      st.textContent = 'Saved ✓ Soft Glam JMD $' + sg + ', Natural Full Glam JMD $' + fnT + ', Statement Full Glam JMD $' + fsT + ' (Full Glam shows JMD $' + fg + ')' + '.';
      sparkle(b); siteNews();
    });
  });
  /* ---------------- How clients pay ----------------
     Her PayPal.Me name, her US-dollar rate (PayPal charges the deposit in US dollars) and her bank accounts. A way to
     pay shows on her website only once its details are saved; nothing here is ever filled in for her. */
  var PAYME_RE = /^[A-Za-z0-9]{1,20}$/, MAX_BANKS = 4;
  function rateClean(v){ return String(v || '').replace(/[^0-9.]/g, ''); }
  function rateExample(r){ var d = depDefault(); return r > 0 ? 'Example: the ' + money(d) + ' deposit is USD $' + (Math.ceil(d * 100 / r - 1e-9) / 100).toFixed(2) + ' on PayPal at this rate.' : ''; }
  /* what she types or pastes: "LaunthiaW", "paypal.me/LaunthiaW" or the whole link all give the name */
  function payMeName(v){
    v = String(v || '').trim(); if (!v || /^\[/.test(v)) return '';
    var m = v.match(/^(?:https?:\/\/)?(?:www\.)?(?:paypal\.me\/|paypal\.com\/paypalme\/)?@?([A-Za-z0-9]+)\/?(?:[0-9.]+(?:USD)?)?\/?$/i);
    return m ? m[1] : null;
  }
  function payLoaded(rows){
    var pp = rows.filter(function(x){ return x.method === 'paypal'; })[0] || {}, bk = rows.filter(function(x){ return x.method === 'bank'; })[0] || {};
    S.payset = { name: pp.paypalme || '', rate: Number(pp.jmd_per_usd) > 0 ? Number(pp.jmd_per_usd) : null, accounts: Array.isArray(bk.accounts) ? bk.accounts : [] };
    S.payset.ppOn = !!(pp.enabled && S.payset.name && S.payset.rate); S.payset.bankOn = !!(bk.enabled && S.payset.accounts.length);
    S.rate = S.payset.rate; fillPay(); payNudge();
  }
  function payNudge(){
    var ps = S.payset; if (!ps) return;
    var none = !ps.ppOn && !ps.bankOn, nudge = $('#ow-pay-nudge'), rm = $('#ow-pay-remind');
    if (nudge) nudge.hidden = !none;
    var miss = [];
    if (!ps.ppOn) miss.push(ps.name && !ps.rate ? 'PayPal isn’t shown to clients yet – add your US dollar rate.' : 'PayPal isn’t shown to clients yet – add your PayPal.Me name and your US dollar rate.');
    if (!ps.bankOn) miss.push('Bank transfer isn’t shown to clients yet – add a bank account.');
    if (rm){ rm.textContent = none ? 'Clients can’t pay a deposit yet, so your website asks them to message you on WhatsApp or by text. ' + miss.join(' ') : miss.join(' '); rm.hidden = !miss.length; }
  }
  function bankRow(a){
    a = a || {};
    var row = el('fieldset', 'ow-bankrow'), lg = el('legend', 'ow-h3', 'Bank account'); row.appendChild(lg);
    [['bank', 'Bank', 60, 'for example NCB'], ['account_name', 'Account name', 80, 'the name on the account'], ['account_number', 'Account number', 30, ''], ['branch', 'Branch', 60, ''], ['account_type', 'Account type', 60, 'for example Savings']].forEach(function(f){
      var fd = el('div', 'field'), id = 'ow-bank-' + f[0] + '-' + (++bankSeq), lb = el('label', '', f[1]), inp = el('input');
      lb.htmlFor = id; inp.id = id; inp.type = 'text'; inp.maxLength = f[2]; inp.autocomplete = 'off'; inp.spellcheck = false; inp.dataset.k = f[0];
      if (f[3]) inp.placeholder = f[3]; if (f[0] === 'account_number') inp.inputMode = 'numeric';
      inp.value = a[f[0]] || ''; fd.appendChild(lb); fd.appendChild(inp); row.appendChild(fd);
    });
    var rm = el('button', 'btn btn-ghost ow-pill', 'Remove this account'); rm.type = 'button';
    rm.addEventListener('click', function(){ row.remove(); bankLabels(); $('#ow-pay').dataset.dirty = '1'; $('#ow-pay-status').textContent = ''; });
    var r2 = el('div', 'ow-row'); r2.appendChild(rm); row.appendChild(r2);
    return row;
  }
  var bankSeq = 0;
  function bankLabels(){
    var rows = $$('.ow-bankrow', $('#ow-banks'));
    rows.forEach(function(r, i){ $('legend', r).textContent = rows.length > 1 ? 'Bank account ' + (i + 1) : 'Bank account'; });
    $('#ow-bank-add').hidden = rows.length >= MAX_BANKS;
    $('#ow-banks-none').hidden = rows.length > 0;
  }
  function fillPay(){
    var f = $('#ow-pay'), ps = S.payset; if (!f || !ps || f.dataset.dirty) return;
    $('#ow-ppme').value = ps.name || '';
    $('#ow-rate-in').value = ps.rate ? String(ps.rate) : '';
    $('#ow-rate-eg').textContent = rateExample(ps.rate || 0);
    var box = $('#ow-banks'); box.textContent = '';
    ps.accounts.forEach(function(a){ box.appendChild(bankRow(a)); });
    bankLabels();
  }
  $('#ow-pay').addEventListener('input', function(e){
    this.dataset.dirty = '1'; $('#ow-pay-status').textContent = '';
    var fd = e.target.closest('.field'); if (fd) fd.classList.remove('invalid');
    if (e.target.id === 'ow-rate-in') $('#ow-rate-eg').textContent = rateExample(Number(rateClean(e.target.value)));
  });
  $('#ow-bank-add').addEventListener('click', function(){
    var box = $('#ow-banks'); if ($$('.ow-bankrow', box).length >= MAX_BANKS) return;
    var r = bankRow(null); box.appendChild(r); bankLabels(); $('#ow-pay').dataset.dirty = '1';
    focusLater($('input', r));
  });
  $('#ow-pay-go').addEventListener('click', function(){
    setTab('settings', true);
    var more = $('#ow-set-more'); if (more && !more.open){ more.open = true; more.dispatchEvent(new Event('toggle')); }
    setTimeout(function(){ var c = $('#ow-pay'); if (c){ c.scrollIntoView({ block: 'start', behavior: RM.matches ? 'auto' : 'smooth' }); focusLater($('#ow-ppme')); } }, 80);
  });
  $('#ow-pay').addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('#ow-pay-save'), st = $('#ow-pay-status'), form = this;
    if (b.disabled) return;
    function bad(inp, msg){ st.textContent = msg; var f = inp.closest('.field'); if (f){ f.classList.add('invalid'); shake(f); } focusLater(inp); }
    var name = payMeName($('#ow-ppme').value), rateTxt = rateClean($('#ow-rate-in').value), rate = rateTxt ? Number(rateTxt) : null;
    if (name === null) return bad($('#ow-ppme'), 'Your PayPal.Me name is only letters and numbers – the part after paypal.me/ (for example paypal.me/LaunthiaW → LaunthiaW).');
    if (name && name.length > 20) return bad($('#ow-ppme'), 'Your PayPal.Me name is at most 20 letters and numbers.');
    if (rate != null && !(rate >= 1 && rate <= 100000)) return bad($('#ow-rate-in'), 'Please write how many JMD make 1 US dollar, in numbers only.');
    if (name && rate == null) return bad($('#ow-rate-in'), 'Please add your US dollar rate too: PayPal charges the deposit in US dollars.');
    var accts = [], stop = false;
    $$('.ow-bankrow', $('#ow-banks')).forEach(function(r){
      if (stop) return;
      var a = {}; $$('input', r).forEach(function(i){ a[i.dataset.k] = i.value.trim(); });
      if (!a.bank && !a.account_name && !a.account_number && !a.branch && !a.account_type) return;   /* an empty row is skipped */
      var get = function(k){ return $('input[data-k="' + k + '"]', r); };
      if (a.bank.length < 2){ stop = true; return bad(get('bank'), 'Please add the bank’s name for each account.'); }
      if (a.account_name.length < 2){ stop = true; return bad(get('account_name'), 'Please add the name on each account.'); }
      if (!/^[0-9][0-9 -]{2,28}[0-9]$/.test(a.account_number)){ stop = true; return bad(get('account_number'), 'Please check the account number: numbers only (spaces or dashes are fine).'); }
      var o = { bank: a.bank, account_name: a.account_name, account_number: a.account_number };
      if (a.branch) o.branch = a.branch; if (a.account_type) o.account_type = a.account_type;
      accts.push(o);
    });
    if (stop) return;
    if (isOffline()){ st.textContent = OFFLINE; return; }
    busy(b, true, 'Saving…'); st.textContent = '';
    client.rpc('admin_save_payment_setup', { p_paypalme: name || null, p_rate: rate, p_accounts: accts.length ? accts : null }).then(function(r){
      busy(b, false);
      if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
      if (r.error || !r.data){ st.textContent = r.error && r.error.message && !/^(TypeError|Failed)/.test(r.error.message) ? r.error.message : 'That didn’t save. Please try again.'; shake(b); return; }
      delete form.dataset.dirty;
      payLoaded([{ method: 'paypal', paypalme: r.data.paypalme, jmd_per_usd: r.data.rate, enabled: !!r.data.paypal_on }, { method: 'bank', accounts: accts, enabled: !!r.data.bank_on }]);
      var said = [];
      said.push(r.data.paypal_on ? 'PayPal is on: paypal.me/' + r.data.paypalme + ', 1 US dollar = ' + Number(r.data.rate) + ' JMD' : 'PayPal is off');
      said.push(r.data.bank_on ? 'bank transfer is on (' + r.data.bank_accounts + (r.data.bank_accounts === 1 ? ' account' : ' accounts') + ')' : 'bank transfer is off');
      st.textContent = 'Saved ✓ ' + said.join('; ') + '.';
      sparkle(b);
    }, function(){ busy(b, false); st.textContent = 'That didn’t save. Please try again.'; });
  });
  /* days off: a calendar from this month on; tap a day to block it off or open it again */
  var offM = null;
  function renderOff(focusYmd){
    var box = $('#ow-offcal'), t = today();
    if (!offM) offM = { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1 };
    var y = offM.y, m = offM.m, first = new Date(Date.UTC(y, m, 1, 12)), days = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7, key = y + '-' + two(m + 1);
    var thisMonth = key === t.slice(0, 7), lastKey = (function(){ var d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 + 12, 1, 12)); return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1); })();
    var has = {}; S.bookings.forEach(function(b){ if (b.appt_date && b.appt_date.slice(0, 7) === key && b.status !== 'Cancelled') has[b.appt_date] = (has[b.appt_date] || 0) + 1; });
    box.textContent = '';
    var head = el('div', 'ow-cal-head'), title = el('p', 'ow-cal-title', first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
    function nav(dir, label, d, off){ var b = el('button', 'ow-cal-nav'); b.type = 'button'; b.dataset.offnav = dir; b.setAttribute('aria-label', label); b.disabled = off; b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="' + d + '"/></svg>'; return b; }
    head.appendChild(nav('-1', 'Previous month', 'M15 5l-7 7 7 7', thisMonth)); head.appendChild(title); head.appendChild(nav('1', 'Next month', 'M9 5l7 7-7 7', key >= lastKey));
    box.appendChild(head);
    var grid = el('div', 'ow-cal-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Days off in ' + title.textContent);
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function(w){ var c = el('span', 'ow-cal-wd', w); c.setAttribute('aria-hidden', 'true'); grid.appendChild(c); });
    for (var i = 0; i < lead; i++){ var blank = el('span', 'ow-cal-day out'); blank.setAttribute('aria-hidden', 'true'); grid.appendChild(blank); }
    for (var d = 1; d <= days; d++){
      var ymd = key + '-' + two(d), off = S.daysOff.indexOf(ymd) >= 0, past = ymd < t, n = has[ymd] || 0;
      var b = el('button', 'ow-cal-day' + (ymd === t ? ' is-today' : '') + (n ? ' has' : '') + (past ? ' past' : ''), String(d));
      b.type = 'button'; b.dataset.off = ymd; b.disabled = past; if (n) b.dataset.n = n;
      b.setAttribute('aria-pressed', String(off));
      b.setAttribute('aria-label', dayLong(ymd) + (off ? ', blocked off' : '') + (n ? ', ' + n + (n === 1 ? ' booking' : ' bookings') : ''));
      grid.appendChild(b);
    }
    box.appendChild(grid);
    var list = $('#ow-offlist'); list.textContent = '';
    if (!S.daysOff.length) list.appendChild(el('p', 'ow-fine', 'No days blocked off.'));
    else S.daysOff.forEach(function(k){ var c = el('button', 'ow-offchip'); c.type = 'button'; c.dataset.off = k; c.setAttribute('data-net', ''); c.setAttribute('aria-label', 'Open ' + dayShort(k) + ' for bookings again'); c.appendChild(el('span', '', dayShort(k))); c.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>'); list.appendChild(c); });
    applyNet();
    if (focusYmd){ var f = $('[data-off="' + focusYmd + '"]', box); if (f) focusLater(f); }
  }
  function toggleOff(ymd, btn){
    var st = $('#ow-off-status');
    if (!btn || btn.getAttribute('aria-busy') === 'true' || !S.on || !client) return;
    if (isOffline()){ st.textContent = OFFLINE; return; }
    var wasOff = S.daysOff.indexOf(ymd) >= 0;
    btn.setAttribute('aria-busy', 'true'); btn.classList.add('saving'); st.textContent = '';
    q(function(){ return wasOff ? client.from('blocked_days').delete().eq('day', ymd).select('day') : client.from('blocked_days').insert({ day: ymd }).select('day'); }).then(function(r){
      btn.removeAttribute('aria-busy'); btn.classList.remove('saving');
      if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
      if (r.error || !r.data || (!wasOff && r.data.length !== 1)){ st.textContent = 'That didn’t save. Please try again.'; shake(btn); return; }
      if (wasOff) S.daysOff = S.daysOff.filter(function(k){ return k !== ymd; }); else { S.daysOff.push(ymd); S.daysOff.sort(); }
      SC.at = 0;
      var n = S.bookings.filter(function(b){ return b.appt_date === ymd && b.status !== 'Cancelled'; }).length;
      st.textContent = wasOff ? dayShort(ymd) + ' is open for bookings again.' : dayShort(ymd) + ' is blocked off. Clients can’t book it on your website.' + (n ? ' You already have ' + n + (n === 1 ? ' booking' : ' bookings') + ' that day – blocking it doesn’t cancel them.' : '');
      var inCal = btn.closest('#ow-offcal');
      renderOff(inCal ? ymd : null); siteNews();
      var nb = $('#ow-offcal [data-off="' + ymd + '"]'); if (nb && !wasOff) anim(nb, [{ transform: 'scale(.6)' }, { transform: 'scale(1.15)', offset: .6 }, { transform: 'none' }], { duration: 420, easing: EASE });
      if (!inCal){ var nx = $('#ow-offlist .ow-offchip'); focusLater(nx || $('#ow-offcal .ow-cal-day:not(:disabled)')); }
    });
  }
  $('#ow-off').addEventListener('click', function(e){
    var nv = e.target.closest('[data-offnav]'), day = e.target.closest('[data-off]');
    if (nv && !nv.disabled){ offM.m += +nv.dataset.offnav; while (offM.m < 0){ offM.m += 12; offM.y--; } while (offM.m > 11){ offM.m -= 12; offM.y++; } renderOff(); var again = $('[data-offnav="' + nv.dataset.offnav + '"]'); focusLater(again && !again.disabled ? again : $('[data-offnav]:not(:disabled)')); return; }
    if (day && !day.disabled) toggleOff(day.dataset.off, day);
  });

  /* ================= SCHEDULE: online booking on/off, her working hours, time off & special days, services,
     booking settings and a day planner. Every change is saved through the database's own owner-only functions
     (checked there, all or nothing). The website's days and times are worked out by the same database, so a change
     shows on the website straight away. Kept simple: one switch at the top, then short sections that open on tap. ================= */
  var SC_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var SC_WS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var SC = { at: 0, loading: null, hours: [], breaks: [], dates: [], blocks: [], off: [], rules: {}, services: [], planDay: '', planSvc: '', planTok: 0, gen: 0, open: {}, kind: 'day' };
  var SC_ORDER = ['accept', 'week', 'off', 'svcs', 'rules', 'plan'], SCB = {};
  var SC_FAIL = 'That didn’t save. Please check your internet connection and try again.';
  var SC_UPDATE = 'This part of your dashboard needs the latest database update. Run supabase/platform.sql again in Supabase (see the README), then tap Try again.';
  function scHm(t){ return String(t || '').slice(0, 5); }
  function scAmPm(t){ t = scHm(t); var h = +t.slice(0, 2), m = t.slice(3, 5); return (h % 12 || 12) + (m !== '00' ? ':' + m : '') + (h < 12 ? 'am' : 'pm'); }   /* 9am, 5:30pm */
  function scTiny(t){ return scAmPm(t).replace('m', ''); }   /* 9a, 5:30p */
  function scSpan(p){ return scAmPm(p.start_time) + '–' + scAmPm(p.end_time); }
  function scByStart(a, b){ return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0; }
  function scIso(day, t){ return day + 'T' + t + ':00-05:00'; }   /* Jamaica has no daylight saving: always UTC-5 */
  function scClock(d){ return new Date(+d - 5 * 3600000).toISOString().slice(11, 16); }   /* Jamaica HH:MM */
  function scAddDays(k, n){ var d = utcOf(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function scLen(m){ m = +m; var h = Math.floor(m / 60), r = m % 60; return h ? h + (h === 1 ? ' hour' : ' hours') + (r ? ' ' + r + ' min' : '') : r + ' minutes'; }
  function scStatus(id, text, bad){ var x = $('#' + id); if (!x) return; x.textContent = text || ''; x.classList.toggle('bad', !!bad); }
  function scNeedsUpdate(e){ return !!e && (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883' || /could not find the (function|table)|does not exist/i.test(e.message || '')); }
  function scErr(e){
    var m = String((e && e.message) || '');
    if (scNeedsUpdate(e)) return SC_UPDATE;
    return m && !/^(JWT|fetch|Failed|TypeError|NetworkError|Load failed)/i.test(m) && !/permission denied|violates|syntax error/i.test(m) ? m : SC_FAIL;
  }
  function scLive(b){ return isBooking(b) && b.status !== 'Cancelled'; }
  /* save through one of the database's owner-only functions; on success reload the schedule and redraw the parts it touched */
  function scCall(fn, args, btn, statusId, okText, keys){
    if (!client || !S.on) return Promise.resolve(false);
    if (btn.getAttribute('aria-busy') === 'true') return Promise.resolve(false);
    if (isOffline()){ scStatus(statusId, OFFLINE, true); return Promise.resolve(false); }
    var sw = btn.classList.contains('ow-switch');
    var lock = function(on){ if (!sw) return busy(btn, on, 'Saving…'); btn.disabled = on; if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); };
    lock(true); scStatus(statusId, sw ? 'Saving…' : '');
    return client.rpc(fn, args).then(function(r){
      if (r.error || !r.data){
        lock(false);
        if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return false; }
        scStatus(statusId, scErr(r.error), true); return false;
      }
      return loadSchedule(true, true).then(function(fresh){
        lock(false); renderSchedule(keys);
        scStatus(statusId, fresh ? okText : okText + ' Tap Refresh to see it here.'); toast(okText); return true;
      });
    }, function(){ lock(false); scStatus(statusId, SC_FAIL, true); return false; });
  }
  /* her booking settings as they are now, with some changed (the database saves them all together) */
  function scRules(over){
    var R = SC.rules || {}, a = { p_step: R.slot_step_minutes || 60, p_buffer: R.buffer_minutes || 0, p_notice_minutes: R.min_notice_minutes == null ? 60 : R.min_notice_minutes,
      p_days_ahead: R.max_days_ahead || 90, p_max_per_day: R.max_per_day == null ? null : R.max_per_day, p_accepting: R.accepting !== false, p_message: R.notice || '' };
    for (var k in (over || {})) a[k] = over[k];
    return a;
  }
  function scFailBox(msg){
    var box = $('#ow-sched'); box.textContent = '';
    var p = el('div', 'ow-glass ow-empty ow-sc-fail'), b = el('button', 'btn btn-dark ow-pill', 'Try again');
    p.setAttribute('role', 'alert'); p.appendChild(el('p', '', msg)); b.type = 'button';
    b.addEventListener('click', function(){ loadSchedule(true); }); p.appendChild(b); box.appendChild(p);
  }
  /* tells the booking form on this page about the schedule (its note for clients, paused or not) */
  function scTell(){
    var sv = {}; SC.services.forEach(function(v){ if (v.slug) sv[v.slug] = { duration_minutes: v.duration_minutes, bookable_online: !!v.bookable_online, description: v.description || '' }; });
    try {
      dispatchEvent(new CustomEvent('glow:schedule', { detail: { hours: SC.hours, breaks: SC.breaks, off: SC.off.slice(), rules: SC.rules, services: sv,
        dates: SC.dates.map(function(x){ return { day: String(x.day).slice(0, 10), start_time: x.start_time, end_time: x.end_time }; }),
        blocks: SC.blocks.map(function(x){ return { starts_at: x.starts_at, ends_at: x.ends_at }; }) } }));
    } catch (e) {}
  }
  function loadSchedule(force, quiet){
    if (!client || !S.on) return Promise.resolve(false);
    if (SC.loading) return SC.loading;
    if (!force && SC.at && Date.now() - SC.at < 15000) return Promise.resolve(true);
    var box = $('#ow-sched');
    if (!SC.at && !quiet){ box.textContent = ''; var ld = el('p', 'ow-glass ow-empty', 'Loading your schedule…'); ld.setAttribute('role', 'status'); box.appendChild(ld); }
    var now = new Date().toISOString(), t0 = today(), gen = SC.gen;
    SC.loading = Promise.all([
      q(function(){ return client.from('availability_hours').select('weekday,start_time,end_time'); }),
      q(function(){ return client.from('availability_breaks').select('weekday,start_time,end_time,label'); }),
      q(function(){ return client.from('availability_dates').select('day,start_time,end_time').gte('day', t0); }),
      q(function(){ return client.from('blocked_periods').select('id,starts_at,ends_at,reason').gte('ends_at', now); }),
      q(function(){ return client.from('blocked_days').select('day').gte('day', t0); }),
      q(function(){ return client.from('booking_settings').select('*').eq('id', 1).maybeSingle(); }),
      q(function(){ return client.from('services').select('id,slug,name,description,duration_minutes,bookable_online,price_jmd,price_note,parent_slug,active,sort_order').eq('active', true); })
    ]).then(function(res){
      if (gen !== SC.gen || !S.on) return false;   /* signed out meanwhile */
      SC.loading = null;
      if (res.some(function(r){ return r.error && authErr(r.error); })){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return false; }
      var bad = res.filter(function(r){ return r.error; })[0];
      if (bad){
        var msg = scNeedsUpdate(bad.error) ? SC_UPDATE : 'We couldn’t load your schedule. Check your internet connection, then tap Try again.';
        if (!SC.at) scFailBox(msg); else toast(scNeedsUpdate(bad.error) ? SC_UPDATE : 'Couldn’t refresh your schedule. Please try again.');
        return false;
      }
      SC.hours = res[0].data || []; SC.breaks = res[1].data || []; SC.dates = res[2].data || []; SC.blocks = res[3].data || [];
      SC.off = (res[4].data || []).map(function(x){ return String(x.day).slice(0, 10); }).sort();
      SC.rules = res[5].data || {};
      SC.services = (res[6].data || []).slice().sort(function(a, b){ return (a.sort_order || 0) - (b.sort_order || 0) || (a.name < b.name ? -1 : 1); });
      SC.at = Date.now();
      S.daysOff = SC.off.slice(); renderOff(); siteNews(); scTell();   /* Settings → Days off shows the same days */
      if (!quiet) renderSchedule();
      return true;
    }, function(){
      if (gen !== SC.gen || !S.on) return false;
      SC.loading = null;
      if (!SC.at) scFailBox('We couldn’t load your schedule. Check your internet connection, then tap Try again.'); else toast('Couldn’t refresh your schedule. Please try again.');
      return false;
    });
    return SC.loading;
  }
  function renderSchedule(keys){
    var box = $('#ow-sched');
    if (!keys || !$('[data-sc]', box)){
      box.textContent = '';
      box.appendChild(el('p', 'ow-fine ow-sc-tz', 'Times are Jamaica time. Changes show on your website straight away.'));
      SC_ORDER.forEach(function(k){ box.appendChild(scBuild(k)); });
    } else keys.forEach(function(k){ var old = $('[data-sc="' + k + '"]', box); if (old) old.replaceWith(scBuild(k)); });
    applyNet();
  }
  function scBuild(k){ var c = SCB[k](); c.dataset.sc = k; return c; }

  /* ---- small builders ---- */
  /* a section that opens on tap: its title and a one-line summary show while it is closed */
  function scCard(key, title, summary){
    var c = el('section', 'ow-card ow-settings ow-sc'); c.id = 'ow-sc-' + key;
    var h = el('h2', 'ow-h2 ow-sc-h'), b = el('button', 'ow-sc-toggle'), body = el('div', 'ow-sc-body'), on = !!SC.open[key], t = el('span', 'ow-sc-title');
    body.id = c.id + '-body'; b.type = 'button'; b.setAttribute('aria-expanded', String(on)); b.setAttribute('aria-controls', body.id);
    t.innerHTML = title;   /* titles are fixed text from this file */
    b.appendChild(t); b.appendChild(el('span', 'ow-sc-sum', summary));
    b.insertAdjacentHTML('beforeend', '<svg class="ow-sc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
    h.appendChild(b); c.appendChild(h); body.hidden = !on; c.appendChild(body);
    b.addEventListener('click', function(){ var o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(o)); body.hidden = !o; SC.open[key] = o; if (o && c.onOpen) c.onOpen(); });
    c.body = body; return c;
  }
  function scSel(id, label, opts, val, fmt){
    var f = el('div', 'field'), l = el('label', '', label), s = el('select', 'ow-select'); s.id = id; l.htmlFor = id;
    var has = false;
    opts.forEach(function(o){ var op = el('option', '', o[1]); op.value = String(o[0]); if (String(o[0]) === String(val)){ op.selected = true; has = true; } s.appendChild(op); });
    if (!has && val != null && val !== ''){ var op2 = el('option', '', fmt ? fmt(val) : String(val)); op2.value = String(val); op2.selected = true; s.appendChild(op2); }
    f.appendChild(l); f.appendChild(s); return f;
  }
  function scInp(id, label, type, val, attrs){
    var f = el('div', 'field'), l = el('label', '', label), i = el(type === 'textarea' ? 'textarea' : 'input'); i.id = id; l.htmlFor = id;
    if (type !== 'textarea') i.type = type;
    if (val != null) i.value = val;
    for (var k in (attrs || {})) i.setAttribute(k, attrs[k]);
    f.appendChild(l); f.appendChild(i); return f;
  }
  function scSave(text, id){
    var st = el('p', 'ow-status'); st.id = id; st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
    var row = el('div', 'ow-row'), b = el('button', 'btn btn-dark ow-pill', text); b.type = 'button'; b.setAttribute('data-net', '');
    row.appendChild(b); return { st: st, row: row, btn: b };
  }
  function scSwitch(id, label, on){
    var b = el('button', 'ow-switch'); b.type = 'button'; if (id) b.id = id; b.setAttribute('role', 'switch'); b.setAttribute('aria-label', label);
    b.setAttribute('aria-checked', String(!!on)); b.innerHTML = '<i aria-hidden="true"></i>'; return b;
  }
  function scAdd(text){ var b = el('button', 'ow-add', text); b.type = 'button'; return b; }
  /* a list of from–to times; .addNext() adds one after the last, .read() gives them back */
  function scTimes(list, label, def){
    var wrap = el('div', 'ow-times'), rows = el('div', 'ow-times-rows');
    function addRow(st, en, focus){
      var r = el('div', 'ow-times-row'), a = el('input', 'ow-time'), b = el('input', 'ow-time'), x = el('button', 'ow-x');
      a.type = b.type = 'time'; a.step = b.step = 900; a.value = scHm(st); b.value = scHm(en);
      a.setAttribute('aria-label', label + ', from'); b.setAttribute('aria-label', label + ', to');
      x.type = 'button'; x.setAttribute('aria-label', 'Remove this ' + label.toLowerCase());
      x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
      x.addEventListener('click', function(){ var nx = r.nextElementSibling || r.previousElementSibling; r.remove(); if (nx && nx.classList.contains('ow-times-row')) focusLater($('.ow-tbtn', nx) || $('input', nx)); });
      r.appendChild(a); r.appendChild(el('span', 'ow-to', 'to')); r.appendChild(b); r.appendChild(x); rows.appendChild(r);
      if (focus) setTimeout(function(){ var f = a.dataset.wheel && a.nextElementSibling ? a.nextElementSibling : a; try { f.focus({ preventScroll: true }); } catch (er) {} }, 60);
    }
    (list || []).slice().sort(scByStart).forEach(function(p){ addRow(p.start_time, p.end_time); });
    wrap.appendChild(rows);
    wrap.addNext = function(){
      var last = $$('.ow-times-row', rows).pop(), from = def[0], to = def[1];
      if (last){ var e = $$('input', last)[1].value; if (/^\d{2}:\d{2}$/.test(e) && e < '22:00'){ var m = +e.slice(0, 2) * 60 + +e.slice(3) + 60; from = e; to = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); } }
      addRow(from, to, true);
    };
    wrap.read = function(){ return $$('.ow-times-row', rows).map(function(r){ var t = $$('input', r); return { start: t[0].value, end: t[1].value }; }); };
    return wrap;
  }
  /* the same checks the database makes, so a mistake is shown before anything is sent */
  function scCheck(list){
    for (var i = 0; i < list.length; i++){
      var x = list[i];
      if (!/^\d{2}:\d{2}$/.test(x.start) || !/^\d{2}:\d{2}$/.test(x.end) || x.end <= x.start) return 'Please check the times: each one must end after it starts.';
      for (var j = 0; j < i; j++){ var y = list[j]; if (x.weekday === y.weekday && x.start < y.end && y.start < x.end) return 'Two of the times overlap. Please change one of them.'; }
    }
    return '';
  }
  /* what one day looks like: closed, special hours, or the usual hours and breaks for its weekday */
  function scDay(day){
    var dow = utcOf(day).getUTCDay(), sp = SC.dates.filter(function(x){ return String(x.day).slice(0, 10) === day; }).sort(scByStart);
    return {
      closed: SC.off.indexOf(day) >= 0, special: sp.length > 0,
      hours: sp.length ? sp : SC.hours.filter(function(h){ return +h.weekday === dow; }).sort(scByStart),
      breaks: sp.length ? [] : SC.breaks.filter(function(h){ return +h.weekday === dow; }).sort(scByStart),
      blocks: SC.blocks.filter(function(x){ return jm(new Date(x.starts_at)) <= day && day <= jm(new Date(Date.parse(x.ends_at) - 1)); }),
      booked: S.bookings.filter(function(b){ return b.appt_date === day && scLive(b); }).sort(function(a, b){ return String(a.appt_time) < String(b.appt_time) ? -1 : 1; })
    };
  }
  /* "Mon–Sat 9am–5pm · Sun closed" */
  function scWeekSum(){
    var order = [1, 2, 3, 4, 5, 6, 0], txt = order.map(function(d){ return SC.hours.filter(function(h){ return +h.weekday === d; }).sort(scByStart).map(scSpan).join(', '); });
    var parts = [], i = 0;
    while (i < 7){ var j = i; while (j + 1 < 7 && txt[j + 1] === txt[i]) j++; parts.push(SC_WS[order[i]] + (j > i ? '–' + SC_WS[order[j]] : '') + ' ' + (txt[i] || 'closed')); i = j + 1; }
    return parts.join(' · ');
  }
  /* everything coming up that differs from her usual week: days off, special hours, blocked hours, holidays */
  function scOffItems(){
    var out = [], days = {};
    SC.dates.forEach(function(x){ var k = String(x.day).slice(0, 10); (days[k] = days[k] || []).push(x); });
    Object.keys(days).forEach(function(k){ out.push({ at: k + 'T00:00', kind: 'special', day: k, text: dayShort(k) + ' · Special hours ' + days[k].sort(scByStart).map(scSpan).join(', ') }); });
    SC.off.forEach(function(k){ out.push({ at: k + 'T00:00', kind: 'day', day: k, text: dayShort(k) + ' · Day off' }); });
    SC.blocks.forEach(function(x){
      var a = new Date(x.starts_at), z = new Date(x.ends_at), d1 = jm(a), d2 = jm(new Date(+z - 1)), t1 = scClock(a), t2 = scClock(z), text;
      if (t1 === '00:00' && t2 === '00:00') text = d1 === d2 ? dayShort(d1) + ' · Day off' : dayShort(d1) + ' – ' + dayShort(d2) + ' · Holiday';
      else if (d1 === d2) text = dayShort(d1) + ' · Off ' + scAmPm(t1) + '–' + scAmPm(t2);
      else text = dayShort(d1) + ' ' + scAmPm(t1) + ' – ' + dayShort(d2) + ' ' + scAmPm(t2) + ' · Off';
      out.push({ at: d1 + 'T' + t1, kind: 'block', id: x.id, text: text + (x.reason ? ' · ' + x.reason : '') });
    });
    return out.sort(function(a, b){ return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  }

  /* ---- 1. online booking on/off (saves at once) and a note for clients ---- */
  SCB.accept = function(){
    var R = SC.rules || {}, on = R.accepting !== false, c = el('section', 'ow-card ow-settings ow-sc ow-sc-accept'); c.id = 'ow-sc-accept-card';
    var sr = el('div', 'ow-switch-row'), lab = el('span', 'ow-switch-label ow-sc-big', 'Online booking'), sw = scSwitch('ow-sc-accept', 'Online booking', on);
    lab.id = 'ow-sc-accept-label'; sw.removeAttribute('aria-label'); sw.setAttribute('aria-labelledby', 'ow-sc-accept-label');
    sr.appendChild(lab); sr.appendChild(sw); c.appendChild(sr);
    c.appendChild(el('p', 'ow-fine', on ? 'On – clients can book and pay on your website.' : 'Paused – clients see a note to call or text you to book.'));
    sw.addEventListener('click', function(){
      var now = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(now));
      scCall('admin_save_rules', scRules({ p_accepting: now }), sw, 'ow-sc-accept-st', now ? 'Online booking is on ✓' : 'Online booking is paused ✓', ['accept', 'rules', 'plan'])
        .then(function(ok){ if (!ok) sw.setAttribute('aria-checked', String(!now)); });
    });
    lab.addEventListener('click', function(){ sw.click(); });
    /* her note on the website (above the booking form) */
    var links = el('div', 'ow-sc-links'), box = el('div', 'ow-sc-notebox'), add = scAdd(R.notice ? 'Change note' : '+ Add a note for clients'); add.id = 'ow-sc-note-add';
    if (R.notice) c.appendChild(el('p', 'ow-sc-curnote', 'Note on your website: “' + R.notice + '”'));
    box.hidden = true;
    box.appendChild(scInp('ow-sc-msg', 'Note for clients', 'textarea', R.notice || '', { maxlength: '300', rows: '2', placeholder: 'For example: Away until Monday.' }));
    var s = scSave('Save note', 'ow-sc-note-dummy'); s.btn.id = 'ow-sc-note-save'; box.appendChild(s.row);
    add.addEventListener('click', function(){ box.hidden = false; links.hidden = true; focusLater($('#ow-sc-msg')); });
    links.appendChild(add);
    if (R.notice){
      var rm = scAdd('Remove note'); rm.id = 'ow-sc-note-rm'; rm.setAttribute('data-net', '');
      rm.addEventListener('click', function(){ scCall('admin_save_rules', scRules({ p_message: '' }), rm, 'ow-sc-accept-st', 'Note removed ✓', ['accept', 'rules']); });
      links.appendChild(rm);
    }
    s.btn.addEventListener('click', function(){ scCall('admin_save_rules', scRules({ p_message: $('#ow-sc-msg').value }), s.btn, 'ow-sc-accept-st', $('#ow-sc-msg').value.trim() ? 'Note saved ✓' : 'Note removed ✓', ['accept', 'rules']); });
    c.appendChild(links); c.appendChild(box);
    var st = el('p', 'ow-status'); st.id = 'ow-sc-accept-st'; st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite'); c.appendChild(st);
    return c;
  };

  /* ---- 2. working hours: each day open or closed, its times, and breaks ---- */
  SCB.week = function(){
    var c = scCard('week', 'Working <em>hours</em>', scWeekSum()), body = c.body, eds = {};
    body.appendChild(el('p', 'ow-fine', 'Your usual hours. Clients can only book inside them.'));
    [1, 2, 3, 4, 5, 6, 0].forEach(function(d){
      var hrs = SC.hours.filter(function(h){ return +h.weekday === d; }), brs = SC.breaks.filter(function(h){ return +h.weekday === d; });
      var row = el('div', 'ow-day'), top = el('div', 'ow-day-top'), state = el('span', 'ow-day-state', hrs.length ? 'Open' : 'Closed'), sw = scSwitch('', SC_WD[d] + ' open', hrs.length > 0);
      row.dataset.wd = String(d); sw.classList.add('ow-day-on');
      top.appendChild(el('h3', 'ow-day-name', SC_WD[d])); top.appendChild(state); top.appendChild(sw); row.appendChild(top);
      var inner = el('div', 'ow-day-times'), e1 = scTimes(hrs, SC_WD[d] + ' working time', ['09:00', '17:00']), e2 = scTimes(brs, SC_WD[d] + ' break', ['12:00', '13:00']);
      e1.classList.add('ow-hours'); e2.classList.add('ow-breaks'); inner.hidden = !hrs.length;
      var links = el('div', 'ow-sc-links'), a1 = scAdd('+ Add time'), a2 = scAdd('+ Add a break');
      a1.classList.add('ow-add-time'); a2.classList.add('ow-add-break');
      a1.addEventListener('click', function(){ e1.addNext(); }); a2.addEventListener('click', function(){ e2.addNext(); });
      links.appendChild(a1); links.appendChild(a2);
      inner.appendChild(e1); inner.appendChild(e2); inner.appendChild(links); row.appendChild(inner);
      sw.addEventListener('click', function(){
        var o = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(o)); state.textContent = o ? 'Open' : 'Closed'; inner.hidden = !o;
        if (o && !e1.read().length) e1.addNext();
      });
      eds[d] = [e1, e2, sw]; body.appendChild(row);
    });
    var s = scSave('Save working hours', 'ow-sc-week-st'); body.appendChild(s.st); body.appendChild(s.row);
    s.btn.addEventListener('click', function(){
      var hours = [], breaks = [];
      Object.keys(eds).forEach(function(d){
        if (eds[d][2].getAttribute('aria-checked') !== 'true') return;   /* a closed day saves no times */
        eds[d][0].read().forEach(function(x){ hours.push({ weekday: +d, start: x.start, end: x.end }); });
        eds[d][1].read().forEach(function(x){ breaks.push({ weekday: +d, start: x.start, end: x.end }); });
      });
      var bad = scCheck(hours) || scCheck(breaks);
      if (bad){ scStatus('ow-sc-week-st', bad, true); return; }
      if (!hours.length){ scStatus('ow-sc-week-st', 'Please keep at least one day open. (To stop online booking for a while, switch Online booking off at the top.)', true); return; }
      scCall('admin_save_week', { p_hours: hours, p_breaks: breaks }, s.btn, 'ow-sc-week-st', 'Working hours saved ✓', ['week', 'plan']);
    });
    return c;
  };

  /* ---- 3. time off & special days: a day off, a few hours, a holiday, or special hours on one date ---- */
  SCB.off = function(){
    var items = scOffItems(), c = scCard('off', 'Time off <em>&amp; special days</em>', items.length ? items.length + ' coming up' : 'Nothing planned'), body = c.body;
    var kinds = [['day', 'Day off'], ['hours', 'A few hours'], ['holiday', 'Holiday'], ['special', 'Special hours']];
    var modes = el('div', 'ow-modes'); modes.setAttribute('role', 'radiogroup'); modes.setAttribute('aria-label', 'What do you need?');
    kinds.forEach(function(k){
      var l = el('label', 'ow-radio'), r = el('input'); r.type = 'radio'; r.name = 'ow-sc-kind'; r.value = k[0]; r.checked = SC.kind === k[0];
      r.addEventListener('change', function(){ SC.kind = r.value; sync(); });
      l.appendChild(r); l.appendChild(el('span', '', k[1])); modes.appendChild(l);
    });
    body.appendChild(modes);
    var hint = el('p', 'ow-fine ow-sc-hint'); body.appendChild(hint);
    var gDay = el('div', 'ow-grid2'); gDay.appendChild(scInp('ow-sc-odate', 'Date', 'date', '', { min: today() }));
    var gHol = el('div', 'ow-grid2'); gHol.appendChild(scInp('ow-sc-ofirst', 'First day off', 'date', '', { min: today() })); gHol.appendChild(scInp('ow-sc-olast', 'Last day off', 'date', '', { min: today() }));
    var gHrs = el('div', 'ow-grid2'); gHrs.appendChild(scInp('ow-sc-ofrom', 'Off from', 'time', '09:00', { step: '900' })); gHrs.appendChild(scInp('ow-sc-oto', 'Until', 'time', '12:00', { step: '900' }));
    var sp = scTimes([{ start_time: '10:00', end_time: '14:00' }], 'Special hours', ['10:00', '14:00']), spAdd = scAdd('+ Add time'), gSp = el('div', 'ow-sc-sp');
    spAdd.addEventListener('click', function(){ sp.addNext(); });
    gSp.appendChild(el('p', 'ow-sub', 'Working that day')); gSp.appendChild(sp); gSp.appendChild(spAdd);
    var note = scInp('ow-sc-onote', 'Note (only you see it)', 'text', '', { maxlength: '200', placeholder: 'For example: Vacation', autocomplete: 'off' });
    [gDay, gHol, gHrs, gSp, note].forEach(function(x){ body.appendChild(x); });
    var s = scSave('Save', 'ow-sc-off-st'); body.appendChild(s.st); body.appendChild(s.row);
    function sync(){
      var k = SC.kind;
      gDay.hidden = k === 'holiday'; gHol.hidden = k !== 'holiday'; gHrs.hidden = k !== 'hours'; gSp.hidden = k !== 'special'; note.hidden = !(k === 'hours' || k === 'holiday');
      hint.textContent = { day: 'Closed for one whole day.', hours: 'Closed for part of one day (an appointment, an errand).', holiday: 'Closed for several days in a row.', special: 'Open at different times on one date – even a day you are usually closed.' }[k];
      if (s.btn.getAttribute('aria-busy') !== 'true') s.btn.textContent = { day: 'Save day off', hours: 'Save time off', holiday: 'Save holiday', special: 'Save special hours' }[k];
      scStatus('ow-sc-off-st', '');
    }
    sync();
    function err(m, sel){ scStatus('ow-sc-off-st', m, true); if (sel) $(sel).focus(); }
    function warn(n){ return n ? ' You already have ' + n + (n === 1 ? ' booking' : ' bookings') + ' then – they are not cancelled.' : ''; }
    function count(d1, d2, t1, t2){ return S.bookings.filter(function(b){ var t = String(b.appt_time || '').slice(0, 5); return scLive(b) && b.appt_date >= d1 && b.appt_date <= d2 && (!t1 || (t >= t1 && t < t2)); }).length; }
    s.btn.addEventListener('click', function(){
      var k = SC.kind, st = 'ow-sc-off-st', day = $('#ow-sc-odate').value, keys = ['off', 'plan'];
      if (k !== 'holiday'){
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return err('Please choose a date.', '#ow-sc-odate');
        if (day < today()) return err('Please choose today or a later date.', '#ow-sc-odate');
      }
      if (k === 'day') return scCall('admin_save_day', { p_day: day, p_mode: 'closed', p_periods: [] }, s.btn, st, dayShort(day) + ' is a day off ✓' + warn(count(day, day)), keys);
      if (k === 'special'){
        var per = sp.read(); if (!per.length) return err('Please add at least one time you are working that day.');
        var bad = scCheck(per); if (bad) return err(bad);
        return scCall('admin_save_day', { p_day: day, p_mode: 'special', p_periods: per }, s.btn, st, dayShort(day) + ' has special hours ✓', keys);
      }
      if (k === 'hours'){
        var a = $('#ow-sc-ofrom').value, z = $('#ow-sc-oto').value;
        if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(z)) return err('Please choose both times.');
        if (z <= a) return err('The end time must be after the start time.', '#ow-sc-oto');
        if (Date.parse(scIso(day, z)) <= Date.now()) return err('That time has already passed.');
        return scCall('admin_block_time', { p_start: scIso(day, a), p_end: scIso(day, z), p_reason: $('#ow-sc-onote').value }, s.btn, st, 'Time off saved ✓' + warn(count(day, day, a, z)), keys);
      }
      var f1 = $('#ow-sc-ofirst').value, f2 = $('#ow-sc-olast').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f1)) return err('Please choose the first day off.', '#ow-sc-ofirst');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f2)) return err('Please choose the last day off.', '#ow-sc-olast');
      if (f1 < today()) return err('Please choose today or a later date.', '#ow-sc-ofirst');
      if (f2 < f1) return err('The last day must be on or after the first day.', '#ow-sc-olast');
      return scCall('admin_block_time', { p_start: scIso(f1, '00:00'), p_end: scIso(scAddDays(f2, 1), '00:00'), p_reason: $('#ow-sc-onote').value }, s.btn, st, 'Holiday saved ✓' + warn(count(f1, f2)), keys);
    });
    if (items.length){
      body.appendChild(el('p', 'ow-sub', 'Coming up'));
      var ul = el('ul', 'ow-sc-list'); ul.id = 'ow-sc-offlist';
      items.forEach(function(x){
        var li = el('li'), u = el('button', 'btn btn-ghost ow-pill', 'Remove'); li.dataset.kind = x.kind;
        li.appendChild(el('span', '', x.text));
        u.type = 'button'; u.setAttribute('data-net', ''); u.setAttribute('aria-label', 'Remove: ' + x.text);
        u.addEventListener('click', function(){
          if (x.kind === 'block') scCall('admin_unblock_time', { p_id: x.id }, u, 'ow-sc-off-st', 'Removed ✓ Clients can book that time again.', ['off', 'plan']);
          else scCall('admin_save_day', { p_day: x.day, p_mode: 'usual', p_periods: [] }, u, 'ow-sc-off-st', 'Removed ✓ ' + dayShort(x.day) + ' is back to your usual hours.', ['off', 'plan']);
        });
        li.appendChild(u); ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    return c;
  };

  /* ---- 4. services: length, online or not, description (prices stay in Settings → Your prices) ---- */
  SCB.svcs = function(){
    var n = SC.services.filter(function(v){ return v.bookable_online && v.price_jmd != null; }).length;
    var c = scCard('svcs', 'Your <em>services</em>', n + (n === 1 ? ' service' : ' services') + ' bookable online'), body = c.body;
    body.appendChild(el('p', 'ow-fine', 'How long each takes, and whether clients can book it online. Prices are in Settings.'));
    if (!SC.services.length) body.appendChild(el('p', 'ow-fine', 'No services yet.'));
    SC.services.forEach(function(v){
      var box = el('div', 'ow-svc'), priced = v.price_jmd != null; box.dataset.slug = v.slug || '';
      box.appendChild(el('h3', 'ow-day-name', v.name + (priced ? ' · ' + money(Number(v.price_jmd)) : v.price_note ? ' · ' + v.price_note : '')));
      var lens = []; for (var m = 15; m <= 600; m += m < 120 ? 15 : 30) lens.push([m, scLen(m)]);
      box.appendChild(scSel('ow-sc-len-' + v.id, 'How long it takes', lens, v.duration_minutes, scLen));
      var sr = el('div', 'ow-switch-row'), lab = el('span', 'ow-switch-label', priced ? 'Book online' : 'Booked by message (no fixed price yet)'), sw = scSwitch('ow-sc-book-' + v.id, '', priced && !!v.bookable_online);
      lab.id = 'ow-sc-book-label-' + v.id; sw.removeAttribute('aria-label'); sw.setAttribute('aria-labelledby', lab.id); sw.disabled = !priced;
      sw.addEventListener('click', function(){ sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); });
      if (priced) lab.addEventListener('click', function(){ sw.click(); });
      sr.appendChild(lab); sr.appendChild(sw); box.appendChild(sr);
      box.appendChild(scInp('ow-sc-desc-' + v.id, 'Description (optional)', 'textarea', v.description || '', { maxlength: '400', rows: '2' }));
      var s = scSave('Save', 'ow-sc-svc-st-' + v.id); s.btn.setAttribute('aria-label', 'Save ' + v.name); box.appendChild(s.st); box.appendChild(s.row);
      s.btn.addEventListener('click', function(){
        scCall('admin_save_service', { p_id: v.id, p_duration: +$('#ow-sc-len-' + v.id).value, p_description: $('#ow-sc-desc-' + v.id).value,
          p_bookable: priced ? $('#ow-sc-book-' + v.id).getAttribute('aria-checked') === 'true' : null }, s.btn, 'ow-sc-svc-st-' + v.id, v.name + ' saved ✓', ['svcs', 'plan']);
      });
      body.appendChild(box);
    });
    return c;
  };

  /* ---- 5. booking settings ---- */
  SCB.rules = function(){
    var R = SC.rules || {}, step = R.slot_step_minutes || 60, notice = R.min_notice_minutes == null ? 60 : R.min_notice_minutes;
    var c = scCard('rules', 'Booking <em>settings</em>', 'Start times every ' + scLen(step) + ' · ' + (notice ? scLen(notice) + ' notice' : 'no notice needed')), body = c.body;
    var g = el('div', 'ow-grid2');
    g.appendChild(scSel('ow-sc-step', 'Start times every', [[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1 hour 30 min'], [120, '2 hours']], step, scLen));
    g.appendChild(scSel('ow-sc-buf', 'Free time after each client', [[0, 'None'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1 hour 30 min'], [120, '2 hours']], R.buffer_minutes == null ? 0 : R.buffer_minutes, scLen));
    g.appendChild(scSel('ow-sc-notice', 'Clients must book at least', [[0, 'Any time'], [30, '30 minutes ahead'], [60, '1 hour ahead'], [120, '2 hours ahead'], [180, '3 hours ahead'], [360, '6 hours ahead'], [720, '12 hours ahead'], [1440, '1 day ahead'], [2880, '2 days ahead'], [4320, '3 days ahead'], [10080, '1 week ahead']], notice, function(v){ return scLen(v) + ' ahead'; }));
    g.appendChild(scInp('ow-sc-ahead', 'Clients can book up to (days ahead)', 'number', R.max_days_ahead || 90, { min: '1', max: '365', step: '1', inputmode: 'numeric' }));
    g.appendChild(scInp('ow-sc-max', 'Most clients in one day (empty: no limit)', 'number', R.max_per_day || '', { min: '1', max: '50', step: '1', inputmode: 'numeric' }));
    body.appendChild(g);
    var s = scSave('Save booking settings', 'ow-sc-rules-st'); body.appendChild(s.st); body.appendChild(s.row);
    s.btn.addEventListener('click', function(){
      var aRaw = $('#ow-sc-ahead').value.trim(), ahead = Number(aRaw), mx = $('#ow-sc-max').value.trim(), max = mx === '' ? null : Number(mx);
      if (!/^\d+$/.test(aRaw) || ahead < 1 || ahead > 365){ scStatus('ow-sc-rules-st', 'Please choose between 1 and 365 days ahead.', true); $('#ow-sc-ahead').focus(); return; }
      if (max !== null && (!/^\d+$/.test(mx) || max < 1 || max > 50)){ scStatus('ow-sc-rules-st', 'Please choose between 1 and 50 clients a day, or leave it empty.', true); $('#ow-sc-max').focus(); return; }
      scCall('admin_save_rules', scRules({ p_step: +$('#ow-sc-step').value, p_buffer: +$('#ow-sc-buf').value, p_notice_minutes: +$('#ow-sc-notice').value, p_days_ahead: ahead, p_max_per_day: max }),
        s.btn, 'ow-sc-rules-st', 'Booking settings saved ✓', ['rules', 'accept', 'plan']);
    });
    return c;
  };

  /* ---- 6. day planner: one day in detail, and its week at a glance ---- */
  SCB.plan = function(){
    var c = scCard('plan', 'Day <em>planner</em>', 'See any day: hours, bookings and free times'), body = c.body;
    var bookable = SC.services.filter(function(v){ return v.bookable_online && v.price_jmd != null; });
    if (!bookable.some(function(v){ return v.id === SC.planSvc; })) SC.planSvc = bookable[0] ? bookable[0].id : '';
    if (!SC.planDay || SC.planDay < today()) SC.planDay = today();
    var g = el('div', 'ow-grid2');
    g.appendChild(scInp('ow-sc-pday', 'Day', 'date', SC.planDay));
    g.appendChild(bookable.length ? scSel('ow-sc-psvc', 'Free times for', bookable.map(function(v){ return [v.id, v.name]; }), SC.planSvc) : el('p', 'ow-fine', 'No service can be booked online right now.'));
    body.appendChild(g);
    var wk = el('div', 'ow-week'); wk.setAttribute('role', 'group'); wk.setAttribute('aria-label', 'That week'); body.appendChild(wk);
    var out = el('div', 'ow-plan'); out.id = 'ow-sc-plan-out'; out.setAttribute('aria-live', 'polite'); body.appendChild(out);
    function week(){
      wk.textContent = '';
      var start = scAddDays(SC.planDay, -((utcOf(SC.planDay).getUTCDay() + 6) % 7));   /* that week's Monday */
      for (var i = 0; i < 7; i++){
        var k = scAddDays(start, i), d = scDay(k), b = el('button', 'ow-wday');
        b.type = 'button'; b.dataset.day = k; b.setAttribute('aria-pressed', String(k === SC.planDay));
        var mid = d.closed ? 'Closed' : !d.hours.length ? 'Day off' : scTiny(d.hours[0].start_time) + '–' + scTiny(d.hours[d.hours.length - 1].end_time);
        b.appendChild(el('b', '', utcOf(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })));
        b.appendChild(el('span', '', mid + (d.special ? ' *' : '')));
        b.appendChild(el('small', '', d.booked.length ? d.booked.length + ' booked' : d.blocks.length ? 'Time off' : ''));
        if (k < today()) b.classList.add('past');
        b.setAttribute('aria-label', dayShort(k) + ': ' + (d.closed ? 'closed' : !d.hours.length ? 'day off' : d.hours.map(scSpan).join(', ') + (d.special ? ' (special hours)' : '')) + (d.booked.length ? ', ' + d.booked.length + ' booked' : ''));
        b.addEventListener('click', function(){ SC.planDay = this.dataset.day; $('#ow-sc-pday').value = SC.planDay; plan(); });
        wk.appendChild(b);
      }
    }
    function row(k, v){ var r = el('div', 'ow-plan-row'); r.appendChild(el('b', '', k)); var s = el('span', '', v); r.appendChild(s); out.appendChild(r); return s; }
    function plan(){
      var day = $('#ow-sc-pday').value, sEl = $('#ow-sc-psvc'), sid = sEl ? sEl.value : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      SC.planDay = day; SC.planSvc = sid; out.textContent = ''; week();
      var d = scDay(day), tok = ++SC.planTok;
      row('Working', d.closed ? 'Closed all day' : d.hours.length ? d.hours.map(scSpan).join(', ') + (d.special ? ' (special hours)' : '') : 'Day off');
      if (!d.closed && d.breaks.length) row('Breaks', d.breaks.map(scSpan).join(', '));
      if (d.blocks.length) row('Time off', d.blocks.map(function(x){ var a = new Date(x.starts_at), z = new Date(x.ends_at); return (jm(a) === day ? scAmPm(scClock(a)) : 'from ' + dayShort(jm(a))) + '–' + (jm(new Date(+z - 1)) === day && scClock(z) !== '00:00' ? scAmPm(scClock(z)) : 'end of day') + (x.reason ? ' · ' + x.reason : ''); }).join('; '));
      row('Booked', d.booked.length ? d.booked.map(function(b){ return scAmPm(b.appt_time) + ' ' + b.client_name + ' (' + b.service + ', ' + (STATUS_WORDS[b.status] || b.status) + ')'; }).join('; ') : 'Nothing booked');
      var fv = row('Free to book', sid ? 'Checking…' : 'No service can be booked online.');
      if (SC.rules && SC.rules.accepting === false){ fv.textContent = 'None – online booking is paused.'; return; }
      if (!sid) return;
      client.rpc('get_available_slots', { p_service: sid, p_day: day }).then(function(r){
        if (tok !== SC.planTok) return;
        if (r.error){ fv.textContent = 'Couldn’t check right now. Please try again.'; return; }
        var l = (r.data || []).map(function(x){ return scAmPm(scClock(new Date(x.slot_start))); });
        fv.textContent = l.length ? l.join(', ') : 'None (closed, full, time off, or too soon / too far ahead).';
      }, function(){ if (tok === SC.planTok) fv.textContent = 'Couldn’t check right now. Please try again.'; });
    }
    $('#ow-sc-pday', body).addEventListener('change', plan);
    if ($('#ow-sc-psvc', body)) $('#ow-sc-psvc', body).addEventListener('change', plan);
    c.onOpen = plan;
    if (SC.open.plan) setTimeout(plan, 0);   /* once the section is on the page */
    return c;
  };

  /* ================= TIME WHEELS: every time she can change opens an iPhone-style wheel (hour, minutes, AM/PM) in
     the site's colours and fonts – it slides up from the bottom on a phone, and pops in on a laptop. Each step of a
     wheel gives a light tap on phones that can (iPhone: iOS 18 or newer; Android: vibration). The real
     <input type="time"> stays in the page, hidden, holding the value the rest of the dashboard reads. ================= */
  var TW_ITEM = 44, TW = null;
  var TW_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var TW_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  /* a light tap: Android through vibration; iPhone (iOS 18+) through the tick of a hidden native switch */
  function haptic(){
    try {
      if (!TW_IOS && typeof navigator.vibrate === 'function'){ navigator.vibrate(8); return; }
      if (!TW_IOS) return;
      var l = document.createElement('label'), i = document.createElement('input');
      l.setAttribute('aria-hidden', 'true'); l.style.display = 'none'; i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
      l.addEventListener('click', function(e){ e.stopPropagation(); });   /* nothing else on the page hears it */
      l.appendChild(i); document.head.appendChild(l); l.click(); document.head.removeChild(l);
    } catch (e) {}
  }
  function twPad(n){ return ('0' + n).slice(-2); }
  function twText(v){ return /^\d{2}:\d{2}/.test(v || '') ? timeOf(String(v).slice(0, 5)) : 'Choose a time'; }
  /* one wheel: scrolls and snaps like an iPhone's, the rows tilt away from the middle, a tap on each step */
  function twCol(items, label, idx, onStep){
    var c = el('div', 'ow-tw-col'), list = el('div', 'ow-tw-list'), rows = [], raf = 0;
    c.tabIndex = 0; c.setAttribute('role', 'spinbutton'); c.setAttribute('aria-label', label);
    c.setAttribute('aria-valuemin', '0'); c.setAttribute('aria-valuemax', String(items.length - 1));
    items.forEach(function(t, i){ var n = el('div', 'ow-tw-item', t); n.addEventListener('click', function(){ c.go(i, true); }); rows.push(n); list.appendChild(n); });
    c.appendChild(list); c.idx = idx;
    function mark(){ c.setAttribute('aria-valuenow', String(c.idx)); c.setAttribute('aria-valuetext', items[c.idx]); rows.forEach(function(n, i){ n.classList.toggle('on', i === c.idx); }); }
    function paint(){
      raf = 0;
      var pos = c.scrollTop / TW_ITEM;
      rows.forEach(function(n, i){
        var d = i - pos, a = Math.max(-72, Math.min(72, d * 24));
        n.style.transform = 'rotateX(' + (-a).toFixed(1) + 'deg) scale(' + (1 - Math.min(.3, Math.abs(d) * .06)).toFixed(3) + ')';
        n.style.opacity = String(Math.max(.16, 1 - Math.abs(d) * .32).toFixed(2));
      });
      var ni = Math.max(0, Math.min(items.length - 1, Math.round(pos)));
      if (c.tgt != null && Math.abs(pos - c.tgt) < .02) c.tgt = null;   /* arrived where a key or tap sent it */
      if (ni !== c.idx){ c.idx = ni; mark(); onStep(); }
    }
    /* where the wheel is going (a key or tap may still be turning it), else where it is */
    c.val = function(){ return c.tgt != null ? c.tgt : c.idx; };
    ['pointerdown', 'touchstart', 'wheel'].forEach(function(t){ c.addEventListener(t, function(){ c.tgt = null; }, { passive: true }); });
    c.addEventListener('scroll', function(){ if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
    c.go = function(i, smooth){
      i = Math.max(0, Math.min(items.length - 1, i)); c.tgt = i;
      c.scrollTo({ top: i * TW_ITEM, behavior: smooth && !RM.matches ? 'smooth' : 'auto' });
      if (c.onAim) c.onAim();   /* the big time shows where it is going at once */
      requestAnimationFrame(paint);
    };
    c.addEventListener('keydown', function(e){
      var step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (step){ e.preventDefault(); c.go(c.val() + step, true); }
      else if (e.key === 'Home' || e.key === 'End'){ e.preventDefault(); c.go(e.key === 'Home' ? 0 : items.length - 1, true); }
    });
    c.paint = paint; mark();
    return c;
  }
  function twClose(t){
    if (!t) return;
    if (TW === t) TW = null;
    t.back.classList.remove('in'); t.back.classList.add('out');
    setTimeout(function(){ t.back.remove(); }, RM.matches ? 0 : 300);
  }
  function twOpen(input, btn, name){
    if (TW) twClose(TW);
    var v = /^\d{2}:\d{2}/.test(input.value) ? input.value.slice(0, 5) : '09:00', h = +v.slice(0, 2), m = +v.slice(3, 5);
    var every = Math.max(1, Math.round((+input.step || 900) / 60)), mins = [];
    for (var x = 0; x < 60; x += every) mins.push(x);
    if (mins.indexOf(m) < 0){ mins.push(m); mins.sort(function(a, b){ return a - b; }); }   /* a time already saved off the steps stays choosable */
    var hrs = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    var back = el('div', 'ow-tw'), card = el('div', 'ow-tw-card'), head = el('div', 'ow-tw-head');
    var cancel = el('button', 'ow-tw-btn', 'Cancel'), done = el('button', 'ow-tw-btn ow-tw-done', 'Done'), title = el('p', 'ow-tw-title', name);
    var shown = el('p', 'ow-tw-now'), body = el('div', 'ow-tw-body'), band = el('div', 'ow-tw-band'), colon = el('div', 'ow-tw-colon', ':');
    cancel.type = done.type = 'button'; title.id = 'ow-tw-title'; band.setAttribute('aria-hidden', 'true'); colon.setAttribute('aria-hidden', 'true');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'ow-tw-title');
    shown.setAttribute('aria-hidden', 'true');
    var step = function(){ haptic(); now(); };
    var cH = twCol(hrs, 'Hour', (h % 12 || 12) - 1, step), cM = twCol(mins.map(twPad), 'Minutes', mins.indexOf(m), step), cP = twCol(['AM', 'PM'], 'AM or PM', h < 12 ? 0 : 1, step);
    function value(){ return twPad((+hrs[cH.val()] % 12) + (cP.val() ? 12 : 0)) + ':' + twPad(mins[cM.val()]); }
    function now(){ shown.textContent = timeOf(value()); }
    cH.onAim = cM.onAim = cP.onAim = now;
    head.appendChild(cancel); head.appendChild(title); head.appendChild(done);
    body.appendChild(band); body.appendChild(cH); body.appendChild(colon); body.appendChild(cM); body.appendChild(cP);
    card.appendChild(head); card.appendChild(shown); card.appendChild(body); back.appendChild(card);
    now(); ow.appendChild(back);
    var t = TW = { back: back, input: input, btn: btn };
    function finish(ok){
      if (TW !== t) return;
      if (ok){
        var nv = value();
        if (nv !== input.value){ input.value = nv; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
        haptic();
      }
      twClose(t); if (btn.isConnected) focusLater(btn);
    }
    t.finish = finish;
    cancel.addEventListener('click', function(){ finish(false); });
    done.addEventListener('click', function(){ finish(true); });
    back.addEventListener('click', function(e){ if (e.target === back) finish(false); });
    card.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key === 'Enter' && e.target.classList.contains('ow-tw-col')){ e.preventDefault(); finish(true); return; }
      if (e.key === 'Tab'){   /* focus stays in the wheel */
        var f = [cancel, cH, cM, cP, done], i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
      e.stopPropagation();
    });
    requestAnimationFrame(function(){
      [cH, cM, cP].forEach(function(c){ c.scrollTop = c.idx * TW_ITEM; c.paint(); });
      back.classList.add('in'); try { cH.focus({ preventScroll: true }); } catch (er) {}
    });
  }
  /* turns a time box into a button that opens the wheel (its label and value carry over) */
  function twEnhance(input){
    if (input.dataset.wheel) return;
    input.dataset.wheel = '1';
    var b = el('button', 'ow-tbtn' + (input.classList.contains('ow-time') ? ' ow-time' : '')), t = el('span', 'ow-tbtn-t');
    var lab = input.id ? $('label[for="' + input.id + '"]') : null, name = input.getAttribute('aria-label') || (lab ? lab.textContent : '') || 'Time';
    b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog');
    if (input.id){ b.id = input.id + '-pick'; if (lab) lab.htmlFor = b.id; }
    b.appendChild(t); b.insertAdjacentHTML('beforeend', TW_CLOCK);
    function sync(){ t.textContent = twText(input.value); b.setAttribute('aria-label', name + ', ' + t.textContent); }
    input.addEventListener('change', sync); input.addEventListener('input', sync); sync();
    input.classList.add('ow-time-real'); input.hidden = true; input.tabIndex = -1;
    input.insertAdjacentElement('afterend', b);
    b.addEventListener('click', function(){ haptic(); twOpen(input, b, name); });
  }
  function twScan(){ $$('input[type="time"]:not([data-wheel])').forEach(twEnhance); }
  new MutationObserver(twScan).observe(ow, { childList: true, subtree: true });
  twScan();

  /* ---------------- offline ---------------- */
  function applyNet(){
    var off = isOffline(); $('#ow-net').hidden = !off;
    $$('[data-net]').forEach(function(b){ if (b.getAttribute('aria-busy') !== 'true') b.disabled = off; });
  }
  addEventListener('offline', applyNet);
  addEventListener('online', function(){ applyNet(); if (S.on) loadAll(true); });

  /* ---------------- start ---------------- */
  /* the invite or password-reset email brings her back with #access_token=...&type=invite|recovery (or #error=...) */
  var ret = (function(){
    var h = location.hash.slice(1); if (!/(^|&)(access_token|error_description)=/.test(h)) return null;
    var o = {}; h.split('&').forEach(function(kv){ var i = kv.indexOf('='); if (i > 0) try { o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) {} });
    return o;
  })();
  var holding = !!ret;
  function start(){
    if (S.on){ show('app'); quietRefresh(); return; } /* already signed in: straight back in */
    var p = cfgProblem(); if (p){ show('signin', p); return; }
    gate.hidden = true; app.hidden = true; bottom.hidden = true;
    getClient().then(function(c){ return c.auth.getSession(); }).then(function(r){
      var ses = r && r.data && r.data.session;
      if (!ses) show('signin'); else if (!isOwner(ses.user)) deny(); else enter(ses.user);
    }, function(){ show('signin', NO_NET); });
  }
  function route(){ if (holding) return; if (location.hash === '#owner'){ viewOpen(); start(); } else viewClose(); }
  if (ret){
    if (!STANDALONE) viewOpen(); else ow.hidden = false;
    gate.hidden = true; app.hidden = true; bottom.hidden = true;
    var settle = function(){ holding = false; try { history.replaceState(null, '', location.pathname + location.search + (STANDALONE ? '' : '#owner')); } catch (e) {} };
    var p = cfgProblem();
    if (p){ settle(); show('signin', p); }
    else getClient().then(function(c){ return c.auth.getSession(); }).then(function(r){
      settle();
      var ses = r && r.data && r.data.session;
      if (ret.error_description || !ses){ show('signin', /expired|invalid/i.test(ret.error_description || '') || ret.error_code === 'otp_expired' ? 'That link has expired. Tap “Forgot password?” to get a new one.' : 'That link didn’t work. Tap “Forgot password?” to get a new one.'); return; }
      if (!isOwner(ses.user)){ deny(); return; }
      S.me = ses.user.email || '';
      if (ret.type === 'invite' || ret.type === 'recovery') show('newpass'); else enter(ses.user);
    }, function(){ settle(); show('signin', NO_NET); });
  } else if (STANDALONE){ ow.hidden = false; start(); }
  if (!STANDALONE) addEventListener('hashchange', route);
  if (!STANDALONE && !ret) route();
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !dlg.hidden){ e.preventDefault(); closeDlg(); }
  });
})();
