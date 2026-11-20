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
  /* pose to pose: a number glides from what it showed to what it is now ("J$20,500", "3") */
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
  function money(n){ return typeof n === 'number' ? 'J$' + n.toLocaleString('en-US') : '—'; }
  function bday(r){ return r.birth_month && r.birth_day ? r.birth_day + ' ' + MONTHS[r.birth_month - 1] : ''; }
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
  /* ---------------- preview sign-in (only while Supabase is NOT connected) ----------------
     So the owner page can be looked at before the database exists: her email with the preview password
     opens a clean, empty dashboard kept in memory only. Nothing is saved or sent.
     The moment real Supabase details are pasted into the settings, this switches itself off for good and
     only her real Supabase account can sign in. It never reads, shows or touches real data. */
  var PREVIEW_PW = ['secret123', 'secret 123'], PREVIEW = false, PREVIEW_INBOX = [], PREVIEW_PAYS = [], PREVIEW_RATE = 150;
  /* preview only: a booking made on the website in this same page (the single file) shows up in the preview
     dashboard, in memory, so the whole flow can be seen before Supabase exists. Nothing is saved anywhere. */
  addEventListener('glow:booked', function(e){
    var r = e.detail; if (!r || !previewReady()) return;
    var o = { id: 'pv' + Date.now(), created_at: new Date().toISOString(), client_name: r.client_name, phone: r.phone, email: r.email || null, service: r.service, appt_date: r.appt_date, appt_time: r.appt_time,
      price_jmd: typeof r.price_jmd === 'number' ? r.price_jmd : null, client_note: null, terms_agreed_at: r.terms_agreed_at, status: 'Requested', paid_at: null, owner_note: null, confirmation_sent_at: null };
    var pay = null;
    if (r.status === 'Confirmed' && r.payment_method === 'paypal'){
      o.status = 'Confirmed'; o.payment_method = 'paypal'; o.payment_status = 'paid'; o.paid_at = new Date().toISOString(); o.reference = r.reference || null;
    }
    if (r.status === 'Confirmed' && r.payment_method === 'cash'){
      o.status = 'Confirmed'; o.payment_method = 'cash'; o.payment_status = 'unpaid'; o.reference = r.reference || null;
    }
    if (r.status === 'Pending payment' && MANUAL[r.payment_method]){
      o.status = 'Pending payment'; o.payment_method = r.payment_method;
      pay = { booking_id: o.id, method: r.payment_method, status: 'awaiting review', amount: r.payment_method === 'bank' ? o.price_jmd : null, currency: r.payment_method === 'bank' ? 'JMD' : 'USD',
              provider_ref: r.reference || '', notes: 'Sent from: ' + (r.sender_name || '') + (r.sent_to ? ' · Sent to: ' + r.sent_to : '') };
      PREVIEW_PAYS.push(pay);
    }
    PREVIEW_INBOX.push(o);
    if (PREVIEW && client && client.preview){ client.db.bookings.push(JSON.parse(JSON.stringify(o))); if (pay) client.db.payments.push(JSON.parse(JSON.stringify(pay))); S.loadedAt = 0; loadAll(true); }
  });
  function previewReady(){ return !/^sb_secret_/i.test(CFG.key) && (!/^https:\/\/[^\s\/]+\/?$/.test(CFG.url) || !/^[\w.-]{20,}$/.test(CFG.key)); }
  function previewData(){
    var now = new Date().toISOString();
    return {
      bookings: PREVIEW_INBOX.map(function(b){ return JSON.parse(JSON.stringify(b)); }),
      payments: PREVIEW_PAYS.map(function(x){ return JSON.parse(JSON.stringify(x)); }),
      payment_methods: [{ method: 'paypal', jmd_per_usd: PREVIEW_RATE, enabled: true }, { method: 'zelle', jmd_per_usd: PREVIEW_RATE, enabled: true }],
      glow_club: [],
      site_prices: [{ service: 'Soft Glam', price_text: String(window.SOFT_GLAM_PRICE || '9,500'), updated_at: now }, { service: 'Full Glam', price_text: String(window.FULL_GLAM_PRICE || '10,500 – $12,000'), updated_at: now },
                    { service: 'Natural Full Glam', price_text: String(window.FULL_GLAM_NATURAL_PRICE || '10,500'), updated_at: now }, { service: 'Statement Full Glam', price_text: String(window.FULL_GLAM_STATEMENT_PRICE || '12,000'), updated_at: now }],
      blocked_days: [],
      owner_settings: [{ id: 1, email_alerts: true, alert_email: 'Launthiawatson@yahoo.com', updated_at: now }],
      alert_log: []
    };
  }
  /* a stand-in for the few Supabase calls the dashboard makes, answered from memory */
  function previewClient(){
    var db = previewData(), copy = function(x){ return JSON.parse(JSON.stringify(x)); };
    function later(v, ms){ return new Promise(function(res){ setTimeout(function(){ res(v); }, ms); }); }
    function table(name){
      var f = [], one = false, patch = null, lim = 0, ins = null, del = false, b = {
        select: function(){ return b; }, order: function(){ return b; },
        limit: function(n){ lim = n; return b; },
        eq: function(k, v){ f.push(function(r){ return String(r[k]) === String(v); }); return b; },
        gte: function(k, v){ f.push(function(r){ return String(r[k]) >= String(v); }); return b; },
        in: function(k, vs){ f.push(function(r){ return vs.indexOf(r[k]) >= 0; }); return b; },
        maybeSingle: function(){ one = true; return b; },
        update: function(p){ patch = p; return b; },
        insert: function(row){ ins = [].concat(row); return b; },
        delete: function(){ del = true; return b; },
        then: function(ok, no){
          if (ins){ var added = ins.map(function(r){ var o = copy(r); o.created_at = new Date().toISOString(); db[name].push(o); return o; }); return later({ data: copy(added), error: null }, 380).then(ok, no); }
          var rows = (db[name] || []).filter(function(r){ return f.every(function(fn){ return fn(r); }); });
          if (del) db[name] = db[name].filter(function(r){ return rows.indexOf(r) < 0; });
          if (patch) rows.forEach(function(r){ for (var k in patch) r[k] = patch[k]; });
          if (lim) rows = rows.slice(0, lim);
          return later({ data: one ? (rows[0] ? copy(rows[0]) : null) : copy(rows), error: null }, patch ? 380 : 450).then(ok, no);
        }
      };
      return b;
    }
    return {
      preview: true,
      db: db,
      from: table,
      /* the money-received check, as the database does it: confirmed (the client's emails go out) or released */
      rpc: function(fn, args){
        if (fn === 'admin_set_usd_rate'){
          var rt = Number(args.p_rate); if (!(rt >= 1 && rt <= 100000)) return later({ data: null, error: { message: 'Please enter how many JMD make 1 US dollar, for example 157.50.' } }, 400);
          PREVIEW_RATE = rt; db.payment_methods.forEach(function(x){ x.jmd_per_usd = rt; x.enabled = true; });
          try { dispatchEvent(new CustomEvent('glow:rate', { detail: { rate: rt } })); } catch (er) {}
          return later({ data: { rate: rt, methods: { paypal: true, zelle: true } }, error: null }, 600);
        }
        if (fn === 'admin_mark_cash_paid'){
          var cb = db.bookings.filter(function(x){ return x.id === args.p_booking; })[0];
          if (!cb || cb.payment_method !== 'cash' || cb.payment_status === 'paid') return later({ data: null, error: { message: 'This booking is not waiting for a cash payment.' } }, 400);
          cb.status = cb.status === 'Confirmed' ? 'Paid' : cb.status; cb.payment_status = 'paid'; cb.paid_at = new Date().toISOString();
          return later({ data: { result: 'paid', paid_at: cb.paid_at }, error: null }, 600);
        }
        if (fn !== 'admin_verify_manual_payment') return later({ data: null, error: { message: 'Unknown request.' } }, 300);
        var pay = db.payments.filter(function(x){ return x.booking_id === args.p_booking && x.status === 'awaiting review'; })[0],
            bk = db.bookings.filter(function(x){ return x.id === args.p_booking; })[0];
        if (!pay || !bk) return later({ data: null, error: { message: 'There is no payment waiting to be checked on this booking.' } }, 500);
        if (args.p_received){ pay.status = 'succeeded'; bk.status = 'Confirmed'; bk.paid_at = new Date().toISOString(); bk.reference = 'GBL-PREVW' + (db.bookings.indexOf(bk) % 10); return later({ data: { result: 'confirmed', reference: bk.reference }, error: null }, 700); }
        pay.status = 'failed'; bk.status = 'Expired'; return later({ data: { result: 'rejected' }, error: null }, 700);
      },
      functions: { invoke: function(fn, o){
        var body = (o && o.body) || {};
        if (fn === 'send-confirmation'){
          var bk = db.bookings.filter(function(x){ return x.id === body.booking_id; })[0];
          if (!bk || !bk.email) return later({ data: { sent: false, reason: 'no client email on this booking' } }, 700);
          bk.confirmation_sent_at = new Date().toISOString(); return later({ data: { sent: true, at: bk.confirmation_sent_at } }, 800);
        }
        db.alert_log.unshift({ id: Date.now(), created_at: new Date().toISOString(), kind: 'test', status: 'sent', detail: 'preview' });
        return later({ data: { sent: true } }, 800);
      } },
      auth: { resetPasswordForEmail: function(){ return later({ error: null }, 600); }, signOut: function(){ return Promise.resolve({ error: null }); } }
    };
  }
  function startPreview(btn){
    busy(btn, true, 'Signing in…');
    setTimeout(function(){
      busy(btn, false); $('#ow-password').value = '';
      PREVIEW = true; client = previewClient();
      enter({ email: CFG.owner }); S.rate = PREVIEW_RATE; fillRate();
      var note = el('p', 'ow-banner ow-preview', 'Preview – nothing here is saved or sent.');
      note.setAttribute('role', 'note'); app.insertBefore(note, $('#ow-banner'));
    }, 650);
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
     or (on a preview link of its own) the address in data-home, in a new tab */
  var HOME = ow.getAttribute('data-home');
  $$('[data-back]').forEach(function(a){ a.setAttribute('href', HOME || (STANDALONE ? '/' : '#hero')); if (HOME){ a.target = '_blank'; a.rel = 'noopener'; } });

  /* the single file: #owner is its own full screen (the site is hidden behind it, not under a pop-up) */
  var viewOn = false;
  function viewOpen(){ if (viewOn) return; viewOn = true; document.documentElement.classList.add('owner-mode'); ow.hidden = false; window.GLOW_PAUSED = true; window.scrollTo(0, 0); }
  function viewClose(){ if (!viewOn) return; viewOn = false; document.documentElement.classList.remove('owner-mode'); ow.hidden = true; window.GLOW_PAUSED = false; window.dispatchEvent(new Event('resize')); }

  /* ---------------- state, cache (this browser tab only; never localStorage) ---------------- */
  var S = { me: '', on: false, bookings: [], club: [], pays: {}, settings: null, lastAlert: null, loadedAt: 0, loading: false,
            tab: 'bookings', when: 'upcoming', bq: '', day: 'all', dayPick: '', cq: '', pref: 'all', confirm: {}, resent: {}, testAt: 0, prices: null, daysOff: [] };
  /* the preview's example data is never kept, so it can never mix with real lists */
  function cacheGet(){ if (PREVIEW) return null; try { var c = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); return c && c.bookings && c.club ? c : null; } catch (e) { return null; } }
  function cacheSet(){ if (PREVIEW) return; try { sessionStorage.setItem(CACHE, JSON.stringify({ bookings: S.bookings, club: S.club })); } catch (e) {} }
  function wipe(){
    try { sessionStorage.removeItem(CACHE); } catch (e) {}
    if (PREVIEW){ PREVIEW = false; client = null; $$('.ow-preview').forEach(function(n){ n.remove(); }); }
    $('#ow-compose').hidden = true; $('#ow-cal').hidden = true; $('#ow-cancel').hidden = true;
    S.on = false; S.me = ''; S.bookings = []; S.club = []; S.settings = null; S.lastAlert = null; S.loadedAt = 0; S.confirm = {}; S.resent = {}; S.prices = null; S.daysOff = [];
    ['#ow-blist', '#ow-clist', '#ow-stats', '#ow-bdays'].forEach(function(s){ $(s).textContent = ''; });
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
    show('app'); setTab(S.tab, false); applyNet(); loadAll();
  }

  /* ---------------- sign in, forgot password, set password ---------------- */
  screens.signin.addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('button[type="submit"]', this), st = $('#ow-signin-status'), em = $('#ow-email').value.trim(), pw = $('#ow-password').value;
    var form = this;
    if (b.disabled) return;
    if (!emailOk(em) || !pw){ st.textContent = 'Please enter your email and password.'; shake(form); return; }
    if (previewReady() && em.toLowerCase() === CFG.owner && PREVIEW_PW.indexOf(pw) >= 0){ st.textContent = ''; startPreview(b); return; }
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
      q(function(){ return client.from('payments').select('booking_id,method,status,amount,currency,provider_ref,notes').eq('status', 'awaiting review').limit(500); }),
      q(function(){ return client.from('payment_methods').select('method,jmd_per_usd,enabled').in('method', ['paypal', 'zelle']); })
    ]).then(function(res){
      S.loading = false; busy(btn, false);
      if (res.some(function(r){ return r.error && authErr(r.error); })){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
      if (res[0].error || res[1].error){ banner('We couldn’t load your lists. Check your internet connection.', true); if (!have) ['#ow-blist', '#ow-clist', '#ow-stats'].forEach(function(s){ $(s).textContent = ''; }); return; }
      banner('');
      S.bookings = (res[0].data || []).filter(isBooking); S.club = res[1].data || [];
      S.pays = {}; if (!res[6].error) (res[6].data || []).forEach(function(x){ S.pays[x.booking_id] = x; });
      if (!res[7].error){ var rr = (res[7].data || []).map(function(x){ return Number(x.jmd_per_usd); }).filter(function(x){ return x > 0; }); S.rate = rr.length ? rr[0] : null; fillRate(); }
      if (!res[2].error) S.settings = res[2].data || null;
      if (!res[3].error) S.lastAlert = (res[3].data || [])[0] || null;
      if (!res[4].error && res[4].data && res[4].data.length){ S.prices = {}; res[4].data.forEach(function(x){ S.prices[x.service] = x.price_text; }); }
      if (!res[5].error) S.daysOff = (res[5].data || []).map(function(x){ return String(x.day).slice(0, 10); }).sort();
      S.siteErr = !!(res[4].error || res[5].error);
      S.loadedAt = Date.now(); cacheSet(); renderAll(fresh); fillSettings(); fillSite(); siteNews();
    });
  }
  function quietRefresh(){ if (S.on && Date.now() - S.loadedAt > 15000) loadAll(true); }
  $('#ow-refresh').addEventListener('click', function(){ loadAll(false, true); });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && (STANDALONE || viewOn)) quietRefresh(); });
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
  var MANUAL = { bank: 'Bank transfer', zelle: 'Zelle', cashapp: 'Cash App' };
  function live(b){ return b.status !== 'Cancelled'; }
  function counts(){
    var t = today(), wk = weekOf(t), mo = t.slice(0, 7);
    countTo($('[data-stat="upcoming"]'), S.bookings.filter(function(b){ return b.appt_date >= t && live(b) && b.status !== 'Done'; }).length);
    countTo($('[data-stat="week"]'), S.bookings.filter(function(b){ return live(b) && b.appt_date >= wk[0] && b.appt_date <= wk[1]; }).length);
    countTo($('[data-stat="paidMonth"]'), money(paidThisMonth(mo)));
  }
  function paidThisMonth(mo){ return S.bookings.filter(function(b){ return live(b) && b.paid_at && jm(new Date(b.paid_at)).slice(0, 7) === mo; }).reduce(function(s, b){ return s + (typeof b.price_jmd === 'number' ? b.price_jmd : 0); }, 0); }
  function hit(r, keys, query){
    if (!query) return true;
    var ql = query.toLowerCase(), qd = query.replace(/\D/g, '');
    return keys.some(function(k){ var v = String(r[k] || ''); return v.toLowerCase().indexOf(ql) >= 0 || (qd.length >= 3 && v.replace(/\D/g, '').indexOf(qd) >= 0); });
  }
  function bookingsShown(){
    var t = today(), wk = weekOf(t);
    var l = S.bookings.filter(function(b){
      if (S.day === 'all'){ if (S.when === 'upcoming' ? b.appt_date < t : b.appt_date >= t) return false; }
      else if (S.day === 'today'){ if (b.appt_date !== t) return false; }
      else if (S.day === 'tomorrow'){ if (b.appt_date !== addDays(t, 1)) return false; }
      else if (S.day === 'week'){ if (b.appt_date < wk[0] || b.appt_date > wk[1]) return false; }
      else if (S.day === 'date'){ if (b.appt_date !== S.dayPick) return false; }
      return hit(b, ['client_name', 'phone', 'service'], S.bq);
    });
    l.sort(function(a, b){ var x = a.appt_date + a.appt_time, y = b.appt_date + b.appt_time; return x < y ? -1 : x > y ? 1 : 0; });
    return S.day === 'all' && S.when === 'past' ? l.reverse() : l;
  }
  function renderBookings(fresh){
    var list = $('#ow-blist'); list.textContent = '';
    var l = bookingsShown();
    if (!l.length){
      list.appendChild(el('p', 'ow-glass ow-empty' + (fresh ? '' : ' still'), !S.bookings.length ? 'No bookings yet. New bookings will appear here as soon as clients book on your website.' : 'No bookings match.'));
      return;
    }
    l.forEach(function(b, i){ var c = bookingCard(b); c.style.setProperty('--i', Math.min(i, 8)); if (!fresh) c.classList.add('still'); list.appendChild(c); });
    applyNet();
  }
  var BADGE = { Requested: 'b-requested', 'Pending payment': 'b-requested', Confirmed: 'b-confirmed', Paid: 'b-paid', Done: 'b-done', Cancelled: 'b-cancelled' };
  function actionsFor(b){
    if (b.status === 'Pending payment') return S.pays[b.id] && MANUAL[S.pays[b.id].method] ? ['received', 'notreceived'] : [];
    if (b.payment_method === 'cash' && b.payment_status !== 'paid' && (b.status === 'Confirmed' || b.status === 'Done')) return ['cashpaid'].concat(b.status === 'Confirmed' ? ['done', 'cancel'] : []);
    if (b.status === 'Requested') return ['confirm', 'paid', 'cancel'];
    if (b.status === 'Confirmed') return (b.paid_at ? [] : ['paid']).concat(['done', 'cancel']);
    if (b.status === 'Paid') return (b.email && !b.confirmation_sent_at && !b.reference ? ['sendconf'] : []).concat(['done', 'cancel']);
    return [];
  }
  var LABEL = { confirm: 'Confirm', paid: 'Mark paid', done: 'Mark done', cancel: 'Cancel', sendconf: 'Send confirmation email', received: 'Money received', notreceived: 'Not received', cashpaid: 'Cash received' };
  /* how a booking is paid: online (and by what), or cash in person – shown on every booking */
  var PAYNAME = { paypal: 'PayPal', bank: 'Bank transfer', zelle: 'Zelle', cashapp: 'Cash App', card: 'Card' };
  function payInfo(b){
    var paid = b.payment_status === 'paid' || !!b.paid_at;
    if (b.payment_method === 'cash') return paid ? ['Paid in cash', 'Cash · paid in person', 'paid'] : ['Cash · pay in person', 'Cash at the appointment · ' + money(typeof b.amount_jmd === 'number' ? b.amount_jmd : b.price_jmd) + ' to collect', 'due'];
    if (PAYNAME[b.payment_method]){
      if (paid) return ['Paid online', 'Paid online · ' + PAYNAME[b.payment_method], 'paid'];
      if (b.status === 'Pending payment') return ['Online · check payment', PAYNAME[b.payment_method] + ' · check your account', 'check'];
      return ['Online · not paid', PAYNAME[b.payment_method] + ' · not finished', 'due'];
    }
    return paid ? ['Paid', 'Marked paid', 'paid'] : ['Not paid yet', 'Not paid yet', 'due'];
  }
  function payMoney(x){ var n = Number(x.amount); return x.amount == null || !isFinite(n) ? '' : x.currency === 'JMD' ? money(Math.round(n)) : (x.currency || 'USD') + ' $' + n.toFixed(2); }
  function noteOf(x, k){ var m = String(x.notes || '').match(new RegExp(k + ': ([^·]+)')); return m ? m[1].trim() : ''; }
  function pair(dl, k, v){ dl.appendChild(el('dt', '', k)); var dd = el('dd'); if (v && v.nodeType) dd.appendChild(v); else dd.appendChild(el('span', 'ow-plain', v || '—')); dl.appendChild(dd); }
  function link(text, href, label){ var a = el('a', '', text); a.href = href; if (label) a.setAttribute('aria-label', label); return a; }
  function first(name){ return String(name || '').trim().split(/\s+/)[0] || 'the client'; }
  function bookingCard(b){
    var card = el('article', 'ow-glass ow-bk'); card.dataset.id = b.id;
    var top = el('div', 'ow-bk-top');
    top.appendChild(el('span', 'ow-av', (String(b.client_name || '?').trim().charAt(0) || '?').toUpperCase())).setAttribute('aria-hidden', 'true');
    var who = el('div', 'ow-who'); who.appendChild(el('h3', '', b.client_name));
    var line = el('p'); line.appendChild(document.createTextNode(b.service + ' · '));
    line.appendChild(el('span', 'ow-when' + (b.status === 'Cancelled' ? ' is-off' : ''), dayShort(b.appt_date) + ', ' + timeOf(b.appt_time)));
    who.appendChild(line);
    var pi = payInfo(b); if (b.status !== 'Cancelled') who.appendChild(el('span', 'ow-pay ow-pay-' + pi[2], pi[0]));
    top.appendChild(who);
    top.appendChild(el('span', 'ow-badge ' + (BADGE[b.status] || 'b-requested'), b.status));
    card.appendChild(top);
    var dl = el('dl', 'ow-kv');
    pair(dl, 'Price', money(typeof b.amount_jmd === 'number' ? b.amount_jmd : b.price_jmd));
    pair(dl, 'Payment', pi[1]);
    pair(dl, 'Phone', link(b.phone, 'tel:' + telOf(b.phone), 'Call ' + b.client_name + ' on ' + b.phone));
    pair(dl, 'Email', b.email ? link(b.email, 'mailto:' + b.email, 'Email ' + b.client_name) : '');
    pair(dl, 'Agreed to terms', stamp(b.terms_agreed_at));
    if (b.paid_at) pair(dl, 'Marked paid', stamp(b.paid_at));
    var pay = b.status === 'Pending payment' ? S.pays[b.id] : null;
    if (pay){
      pair(dl, 'Paid by', MANUAL[pay.method] || pay.method);
      pair(dl, 'Amount to look for', payMoney(pay));
      if (noteOf(pay, 'Sent to')) pair(dl, 'Sent to', noteOf(pay, 'Sent to'));
      pair(dl, pay.method === 'bank' ? 'Transfer reference' : 'Reference', pay.provider_ref);
      pair(dl, 'Sent from', noteOf(pay, 'Sent from'));
    }
    card.appendChild(dl);
    if (b.client_note){ var nq = el('p', 'ow-quote'); nq.appendChild(el('b', '', 'Client’s note: ')); nq.appendChild(document.createTextNode(b.client_note)); card.appendChild(nq); }
    var acts = actionsFor(b);
    if (acts.length){
      var row = el('div', 'ow-actions'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Update ' + b.client_name + '’s booking');
      acts.forEach(function(a){ var btn = el('button', 'btn ' + (a === 'confirm' || a === 'sendconf' || a === 'received' || a === 'cashpaid' ? 'btn-dark' : 'btn-ghost'), LABEL[a]); btn.type = 'button'; btn.dataset.act = a; btn.setAttribute('data-net', ''); row.appendChild(btn); });
      card.appendChild(row);
      if (acts.indexOf('cashpaid') >= 0) card.appendChild(el('p', 'ow-hint', 'When they pay you in cash, tap Cash received – they get a receipt by email.'));
      if (acts.indexOf('received') >= 0) card.appendChild(el('p', 'ow-hint', 'Check your ' + (pay.method === 'bank' ? 'bank account' : MANUAL[pay.method]) + ' first. Tap Money received only when the money is there – the client then gets their confirmation and receipt by email. Not received frees the time.'));
      if (acts.indexOf('paid') >= 0) card.appendChild(el('p', 'ow-hint', 'Mark paid: check the money is in your account first.'));
    }
    var cl = confirmLine(b); if (cl) card.appendChild(cl);
    var note = el('div', 'ow-note');
    var lab = el('label', '', 'Private note'); lab.htmlFor = 'ow-note-' + b.id;
    var ta = el('textarea'); ta.id = 'ow-note-' + b.id; ta.maxLength = 2000; ta.value = b.owner_note || ''; ta.placeholder = 'Only you can see this';
    var nr = el('div', 'ow-note-row'), sv = el('button', 'btn btn-ghost ow-pill', 'Save note'); sv.type = 'button'; sv.dataset.act = 'note'; sv.setAttribute('data-net', '');
    var flag = el('span', 'ow-saved'); flag.setAttribute('role', 'status');
    nr.appendChild(sv); nr.appendChild(flag); note.appendChild(lab); note.appendChild(ta); note.appendChild(nr); card.appendChild(note);
    return card;
  }
  function confirmLine(b){
    var st = S.confirm[b.id], p = el('p', 'ow-confirm'); p.setAttribute('role', 'status');
    if (b.confirmation_sent_at){ p.textContent = st === 'sent' ? 'Confirmed ✓ – email sent' : 'Confirmation email sent · ' + stamp(b.confirmation_sent_at); return p; }
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
    else if (a === 'paid') update(b, { status: 'Paid', paid_at: new Date().toISOString() }, btn, card).then(function(ok){ if (ok){ redraw(card, b, 'big'); toast(b.client_name + ' is marked paid.'); } });
    else if (a === 'done') update(b, { status: 'Done' }, btn, card).then(function(ok){ if (ok){ redraw(card, b, 'small'); toast(b.client_name + '’s booking is marked done.'); } });
    else if (a === 'cancel') askCancel(b, btn, card);
    else if (a === 'received') checkPayment(b, true, btn, card);
    else if (a === 'cashpaid') cashPaid(b, btn, card);
    else if (a === 'notreceived') askDlg('Mark ' + first(b.client_name) + '’s payment as not received? The booking is not confirmed and ' + dayShort(b.appt_date) + ' at ' + timeOf(b.appt_time) + ' becomes free again.',
      'Not received', 'Go back', btn, function(){ checkPayment(b, false, btn, card); });
    else if (a === 'note') saveNote(b, card, btn);
  });
  /* cash received at the appointment → recorded once as paid; the client gets a receipt */
  function cashPaid(b, btn, card){
    if (isOffline()){ toast(OFFLINE); return; }
    lockCard(card, true); busy(btn, true, 'Saving…');
    client.rpc('admin_mark_cash_paid', { p_booking: b.id }).then(function(r){
      if (r.error || !r.data){
        busy(btn, false); lockCard(card, false);
        if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
        toast(r.error && /not waiting for a cash payment/i.test(r.error.message || '') ? 'This booking is already marked paid. Tap Refresh.' : 'That didn’t save. Please try again.'); return;
      }
      if (b.status === 'Confirmed') b.status = 'Paid'; b.payment_status = 'paid'; b.paid_at = r.data.paid_at || new Date().toISOString();
      cacheSet(); counts(); renderStats(); redraw(card, b, 'big');
      toast('Cash received ✓ ' + first(b.client_name) + ' gets a receipt by email.');
    }, function(){ busy(btn, false); lockCard(card, false); toast('That didn’t save. Please try again.'); });
  }
  /* money received → the database confirms the booking (once) and emails the client; not received → the time is freed */
  function checkPayment(b, got, btn, card){
    if (isOffline()){ toast(OFFLINE); return; }
    lockCard(card, true); busy(btn, true, got ? 'Confirming…' : 'Saving…');
    client.rpc('admin_verify_manual_payment', { p_booking: b.id, p_received: got }).then(function(r){
      if (r.error || !r.data){
        busy(btn, false); lockCard(card, false);
        if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
        toast(r.error && /no payment waiting/i.test(r.error.message || '') ? 'This payment was already checked. Tap Refresh.' : 'That didn’t save. Please try again.'); return;
      }
      delete S.pays[b.id];
      if (r.data.result === 'confirmed'){
        b.status = 'Confirmed'; b.paid_at = b.paid_at || new Date().toISOString(); if (r.data.reference) b.reference = r.data.reference;
        cacheSet(); counts(); renderStats(); redraw(card, b, 'big');
        toast('Payment confirmed ✓ ' + first(b.client_name) + ' gets the confirmation and receipt by email.');
      } else {
        S.bookings = S.bookings.filter(function(x){ return x.id !== b.id; });
        cacheSet(); counts(); renderStats(); renderBookings(false);
        toast('Marked not received. The time is free again.');
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
  function askCancel(b, btn, card){
    askDlg('Cancel ' + first(b.client_name) + '’s ' + b.service + ' on ' + dayShort(b.appt_date) + ' at ' + timeOf(b.appt_time) + '? This does not refund any payment – if the client paid, refund them yourself.',
      'Yes, cancel', 'Keep booking', btn, function(){ update(b, { status: 'Cancelled' }, btn, card).then(function(ok){ if (ok){ redraw(card, b); toast(first(b.client_name) + '’s booking is cancelled.'); } }); });
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

  /* "Pick a date": the dashboard's own little calendar (the phone's date box can't be opened reliably from a
     chip, and inside some previews not at all). Days with bookings carry a champagne dot. */
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
    var wrap = el('div', 'ow-table-wrap'), t = el('table', 'ow-table'); t.setAttribute('role', 'table'); t.setAttribute('aria-label', 'Glow Club members');
    var th = el('thead'), hr = el('tr'); hr.setAttribute('role', 'row');
    ['Name', 'Birthday', 'Contact by', 'Contact', 'Marketing', 'Joined', 'Message'].forEach(function(h){ var c = el('th', '', h); c.scope = 'col'; c.setAttribute('role', 'columnheader'); hr.appendChild(c); });
    th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    l.forEach(function(r, i){
      var tr = el('tr', fresh ? '' : 'still'); tr.setAttribute('role', 'row'); tr.dataset.cid = r.id; tr.style.setProperty('--i', Math.min(i, 10));
      function td(label, v, cls){ var c = el('td', cls || ''); c.setAttribute('role', 'cell'); c.dataset.label = label; if (v && v.nodeType) c.appendChild(v); else c.textContent = v || '—'; tr.appendChild(c); return c; }
      td('Name', r.name, 'ow-td-name');
      td('Birthday', bday(r));
      td('Contact by', r.contact_pref);
      td('Contact', r.contact_pref === 'Email' ? link(r.email, 'mailto:' + r.email, 'Email ' + r.name) : link(r.phone, 'tel:' + telOf(r.phone), 'Call ' + r.name + ' on ' + r.phone));
      td('Marketing', r.unsubscribed_at ? 'No – stopped ' + stamp(r.unsubscribed_at) : r.marketing_consent ? 'Yes · ' + stamp(r.consent_at) : 'No');
      td('Joined', new Date(r.created_at).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }));
      var act = td('Message', document.createTextNode(''), 'ow-td-act');
      /* her own phone or mail app opens; the website sends nothing. Offers always say how to stop. */
      var fn = first(r.name), hi = 'Hi ' + fn + ', it’s Launthia from Glow by Launthia.\n\n\n\n';
      if (r.phone){ var tx = el('a', 'btn btn-ghost', 'Text'); tx.href = 'sms:' + telOf(r.phone) + (consenting(r) ? (IOS ? '&' : '?') + 'body=' + encodeURIComponent(hi + 'Reply STOP to stop these messages.') : ''); tx.setAttribute('aria-label', 'Text ' + r.name); act.appendChild(tx); }
      if (r.phone && r.contact_pref === 'WhatsApp'){ var wa = el('a', 'btn btn-ghost', 'WhatsApp'); wa.href = 'https://wa.me/' + telOf(r.phone).replace(/\D/g, '') + (consenting(r) ? '?text=' + encodeURIComponent(hi + 'Reply STOP to stop these messages.') : ''); wa.target = '_blank'; wa.rel = 'noopener'; wa.setAttribute('aria-label', 'WhatsApp ' + r.name + ' (opens in a new tab)'); act.appendChild(wa); }
      /* Email: members who agreed to offers get the message writer (birthday, thinking of you, new openings);
         anyone else gets a plain email with no offer in it */
      if (r.email && consenting(r)){ var em = el('button', 'btn btn-ghost', 'Email'); em.type = 'button'; em.dataset.compose = r.id; em.setAttribute('aria-label', 'Write an email to ' + r.name); act.appendChild(em); }
      else if (r.email){ var pe = el('a', 'btn btn-ghost', 'Email'); pe.href = 'mailto:' + r.email; pe.setAttribute('aria-label', 'Email ' + r.name); act.appendChild(pe); }
      if (consenting(r)){ var st = el('button', 'btn btn-ghost', 'Mark as STOP'); st.type = 'button'; st.dataset.stop = r.id; st.setAttribute('data-net', ''); st.setAttribute('aria-label', r.name + ' replied STOP: no more offers'); act.appendChild(st); }
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap); applyNet();
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
      toast(framed ? 'Downloading ' + name + '. If nothing appears, this preview window blocks downloads – it works on the real site.' : 'Downloaded ' + name);
    } catch (e) { toast('We couldn’t make the file on this device.'); }
  }
  $('#ow-csv-all').addEventListener('click', function(){ download('glow-club-' + today() + '.csv', S.club); });
  $('#ow-csv-mkt').addEventListener('click', function(){ download('glow-club-marketing-' + today() + '.csv', S.club.filter(consenting)); });

  /* ---------------- C) stats (from her own data only) ---------------- */
  function renderStats(){
    var box = $('#ow-stats'); box.textContent = '';
    var t = today(), wk = weekOf(t), mo = t.slice(0, 7);
    var month = S.bookings.filter(function(b){ return live(b) && b.appt_date.slice(0, 7) === mo; });
    var week = S.bookings.filter(function(b){ return live(b) && b.appt_date >= wk[0] && b.appt_date <= wk[1]; }).length;
    var by = {}; month.forEach(function(b){ by[b.service] = (by[b.service] || 0) + 1; });
    var top = Math.max.apply(null, [0].concat(Object.keys(by).map(function(k){ return by[k]; })));
    var leaders = Object.keys(by).filter(function(k){ return by[k] === top && top > 0; });
    /* the numbers count up each time she opens the Stats tab (in setTab); data-v keeps the real value */
    function stat(big, label, why, cls){ var c = el('div', 'ow-glass ow-stat'), n = el('b', cls || '', big); n.dataset.v = big; c.appendChild(n); c.appendChild(el('span', '', label)); c.appendChild(el('p', '', why)); box.appendChild(c); }
    stat(String(week), 'Bookings this week', 'Monday to Sunday, by appointment date, not counting cancelled.' + (week ? '' : ' No bookings yet this week.'));
    stat(String(month.length), 'Bookings this month', 'By appointment date this month, not counting cancelled.' + (month.length ? '' : ' No bookings yet this month.'));
    stat(money(paidThisMonth(mo)), 'Paid this month', 'Bookings you marked paid this month, not counting cancelled.');
    stat(leaders.length ? leaders.join(' and ') : '0', 'Most booked service this month', leaders.length ? (leaders.length > 1 ? 'A tie: ' + top + ' bookings each.' : top + (top === 1 ? ' booking' : ' bookings') + ' this month.') : 'No bookings yet this month.', leaders.length ? 'ow-stat-svc' : '');
  }

  /* ---------------- D) settings: booking alerts ---------------- */
  var sw = $('#ow-alerts-on');
  /* the words next to the switch flip it too */
  $('#ow-alerts-label').addEventListener('click', function(){ sw.click(); sw.focus(); });
  sw.addEventListener('click', function(){ sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); $('#ow-alerts-status').textContent = ''; if (!RM.matches) replay(sw, 'flip'); });
  sw.addEventListener('keydown', function(e){ if (e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); sw.click(); } });
  function fillSettings(){
    var s = S.settings;
    if (s){ sw.setAttribute('aria-checked', String(!!s.email_alerts)); if (document.activeElement !== $('#ow-alert-email')) $('#ow-alert-email').value = s.alert_email || ''; }
    var la = S.lastAlert, line = $('#ow-last-alert');
    line.textContent = !la ? 'No alerts sent yet.' : 'Last alert: ' + stamp(la.created_at) + ' · ' + (la.status === 'sent' ? 'Sent' : la.status === 'skipped' ? 'Skipped – ' + (la.detail || '') : 'Failed – ' + (la.detail || 'no reason given'));
  }
  $('#ow-alerts').addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('#ow-alerts-save'), st = $('#ow-alerts-status'), em = $('#ow-alert-email').value.trim(), on = sw.getAttribute('aria-checked') === 'true';
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
      st.textContent = d && d.sent ? 'Test email sent – check your inbox (and spam folder).' + (PREVIEW ? ' (Preview: no real email was sent.)' : '') : 'The test email didn’t send' + (d && d.reason ? ' (' + String(d.reason).slice(0, 120) + ')' : '') + '. Check the Resend key and sender in Supabase.';
      if (d && d.sent) sparkle(b); else shake(b);
      q(function(){ return client.from('alert_log').select('created_at,kind,status,detail').in('kind', ['booking', 'test']).order('created_at', { ascending: false }).limit(1); }).then(function(x){ if (!x.error){ S.lastAlert = (x.data || [])[0] || null; fillSettings(); } });
    }, function(){ busy(b, false); st.textContent = 'The test email didn’t send. Check your internet connection.'; });
  });
  $('#ow-change-pw').addEventListener('click', function(){
    var b = this, st = $('#ow-account-status');
    if (b.disabled || isOffline()) return;
    busy(b, true, 'Sending…');
    client.auth.resetPasswordForEmail(S.me, { redirectTo: resetLink() }).then(function(r){
      busy(b, false); st.textContent = r.error ? 'We couldn’t send the link. Please try again in a minute.' : 'A link to change your password is on its way to ' + S.me + '.' + (PREVIEW ? ' (Preview: no real email was sent.)' : '');
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
      st.textContent = 'Saved ✓ Soft Glam JMD $' + sg + ', Natural Full Glam JMD $' + fnT + ', Statement Full Glam JMD $' + fsT + ' (Full Glam shows JMD $' + fg + ')' + (PREVIEW ? '. (Preview: not saved anywhere.)' : '.');
      sparkle(b); siteNews();
    });
  });
  /* her US-dollar rate (PayPal, Zelle) */
  function rateClean(v){ return String(v || '').replace(/[^0-9.]/g, ''); }
  function rateExample(r){ return r > 0 ? 'Example: JMD $9,500 is USD $' + (Math.ceil(9500 * 100 / r - 1e-9) / 100).toFixed(2) + ' at this rate.' : ''; }
  function fillRate(){
    var i = $('#ow-rate-in'); if (!i) return;
    if (document.activeElement !== i && !i.dataset.dirty) i.value = S.rate ? String(S.rate) : '';
    $('#ow-rate-eg').textContent = rateExample(Number(rateClean(i.value)) || S.rate || 0);
  }
  $('#ow-rate-in').addEventListener('input', function(){ this.dataset.dirty = '1'; this.closest('.field').classList.remove('invalid'); $('#ow-rate-status').textContent = ''; $('#ow-rate-eg').textContent = rateExample(Number(rateClean(this.value))); });
  $('#ow-rate').addEventListener('submit', function(e){
    e.preventDefault();
    var b = $('#ow-rate-save'), st = $('#ow-rate-status'), v = Number(rateClean($('#ow-rate-in').value));
    if (b.disabled) return;
    if (!(v >= 1 && v <= 100000)){ st.textContent = 'Please write how many JMD make 1 US dollar, in numbers – for example 157.50.'; var f = $('#ow-rate-in').closest('.field'); f.classList.add('invalid'); shake(f); focusLater($('#ow-rate-in')); return; }
    if (isOffline()){ st.textContent = OFFLINE; return; }
    busy(b, true, 'Saving…'); st.textContent = '';
    client.rpc('admin_set_usd_rate', { p_rate: v }).then(function(r){
      busy(b, false);
      if (r.error && authErr(r.error)){ wipe(); signOutNow(); show('signin', 'Please sign in again.'); return; }
      if (r.error || !r.data){ st.textContent = 'Your rate didn’t save. Please try again.'; shake(b); return; }
      S.rate = v; delete $('#ow-rate-in').dataset.dirty; fillRate();
      st.textContent = 'Saved ✓ 1 US dollar = ' + v + ' JMD. PayPal and Zelle now show clients the US dollar price.' + (PREVIEW ? ' (Preview: not saved anywhere.)' : '');
      sparkle(b);
    }, function(){ busy(b, false); st.textContent = 'Your rate didn’t save. Please try again.'; });
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
    if (S.on){ show('app'); quietRefresh(); return; } /* already signed in (also the preview): straight back in */
    var p = cfgProblem(); if (p){ show('signin', previewReady() ? '' : p); return; }
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
