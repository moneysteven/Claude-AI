/* =========================================================================
   OWNER DASHBOARD SETTINGS – the same values as the settings in the site's app.js.
   ========================================================================= */

/* Supabase Project URL, from Supabase > Project Settings > API. */
var SUPABASE_URL = '[PASTE SUPABASE URL]';

/* Supabase "anon public" key. NEVER the service_role key or any other secret key. */
var SUPABASE_ANON_KEY = '[PASTE SUPABASE ANON KEY]';

/* The only account that can open this dashboard. */
var OWNER_EMAIL = 'launthiawatson@yahoo.com';
/* ===== END OF SETTINGS ===== */
(function () {
'use strict';
var ow = document.getElementById('owner');
if (!ow)
return;
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
function $(s, r) { return (r || ow).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || ow).querySelectorAll(s)); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls)
e.className = cls; if (text != null)
e.textContent = text; return e; }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function isOffline() { return navigator.onLine === false; }
function emailOk(v) { v = String(v || '').trim(); return v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function focusLater(e) { if (e)
setTimeout(function () { try {
e.focus({ preventScroll: true });
}
catch (er) { } }, 60); }
function busy(btn, on, label) {
if (!btn)
return;
if (on) {
if (btn.dataset.label == null)
btn.dataset.label = btn.innerHTML;
btn.disabled = true;
btn.setAttribute('aria-busy', 'true');
btn.textContent = label;
}
else {
if (btn.dataset.label != null) {
btn.innerHTML = btn.dataset.label;
delete btn.dataset.label;
}
btn.removeAttribute('aria-busy');
btn.disabled = false;
}
}
var toastT = 0;
function toast(msg) { var t = $('#ow-toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3600); }
function jm(d) { var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; }); return p.year + '-' + p.month + '-' + p.day; }
function today() { return jm(new Date()); }
function utcOf(ymd) { var a = ymd.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)); }
function addDays(ymd, n) { var d = utcOf(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekOf(ymd) { var mon = addDays(ymd, -((utcOf(ymd).getUTCDay() + 6) % 7)); return [mon, addDays(mon, 6)]; }
function dayShort(ymd) { return utcOf(ymd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
function dayLong(ymd) { var d = utcOf(ymd); return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) + ', ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
function timeOf(t) { t = String(t || ''); var h = parseInt(t.slice(0, 2), 10); return isNaN(h) ? t : (h % 12 || 12) + ':' + (t.slice(3, 5) || '00') + ' ' + (h < 12 ? 'AM' : 'PM'); }
function stamp(iso) { return iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''; }
function money(n) { return typeof n === 'number' ? 'J$' + n.toLocaleString('en-US') : '—'; }
function bday(r) { return r.birth_month && r.birth_day ? r.birth_day + ' ' + MONTHS[r.birth_month - 1] : ''; }
function telOf(p) { p = String(p || ''); var d = p.replace(/\D/g, ''); if (/^\s*\+/.test(p))
return '+' + d; if (d.length === 7)
return '+1876' + d; if (d.length === 10)
return '+1' + d; if (d.length === 11 && d.charAt(0) === '1')
return '+' + d; return d; }
var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function keyRole(k) { var part = k.split('.')[1]; if (!part)
return ''; try {
return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role || '';
}
catch (e) {
return '';
} }
function cfgProblem() {
var role = keyRole(CFG.key);
if (/^sb_secret_/i.test(CFG.key) || (role && role !== 'anon'))
return 'This website has a secret Supabase key in it. Remove it and paste the anon public key instead.';
if (!/^https:\/\/[^\s\/]+\/?$/.test(CFG.url) || !/^[\w.-]{20,}$/.test(CFG.key))
return 'The owner sign-in isn’t connected yet. The Supabase details still need to be added to the website.';
return '';
}
var libP = null, client = null;
function sbLoad() {
if (window.supabase && window.supabase.createClient)
return Promise.resolve(window.supabase);
if (libP)
return libP;
libP = new Promise(function (res, rej) {
var t = document.createElement('script');
t.src = SB_SRC;
t.integrity = SB_SRI;
t.crossOrigin = 'anonymous';
t.async = true;
t.onload = function () { if (window.supabase && window.supabase.createClient)
res(window.supabase);
else {
libP = null;
rej(new Error('no supabase'));
} };
t.onerror = function () { libP = null; rej(new Error('no supabase')); };
document.head.appendChild(t);
});
return libP;
}
function getClient() {
return sbLoad().then(function (lib) {
if (!client) {
client = lib.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: STORE } });
client.auth.onAuthStateChange(function (event) { if (event === 'PASSWORD_RECOVERY') {
setTimeout(function () { show('newpass'); }, 0);
} });
}
return client;
});
}
function isOwner(u) { return !!u && String(u.email || '').toLowerCase() === CFG.owner; }
function authErr(e) { return !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt|expired/i.test(e.message || '')); }
function authMessage(e) {
var m = String((e && (e.message || e.msg)) || '');
if ((e && e.status === 429) || /rate limit|too many/i.test(m))
return 'Too many tries. Please wait a minute, then try again.';
if (/not confirmed/i.test(m))
return 'This account isn’t ready yet. Open the invite email first.';
if (/fetch|network|failed to fetch/i.test(m))
return NO_NET;
return 'That email or password isn’t right.';
}
function q(fn) {
var n = 0;
function again() { n++; return wait(n === 1 ? 600 : 1500).then(go); }
function go() { return fn().then(function (r) { if (r && r.error && !authErr(r.error) && n < 2)
return again(); return r; }, function (e) { if (n < 2)
return again(); return { error: e }; }); }
return go();
}
var gate = $('#ow-gate'), app = $('#ow-app'), bottom = $('#ow-bottom');
var screens = { signin: $('#ow-signin'), forgot: $('#ow-forgot'), newpass: $('#ow-newpass'), denied: $('#ow-denied') };
function show(name, text) {
var inApp = name === 'app';
gate.hidden = inApp;
app.hidden = !inApp;
bottom.hidden = !inApp;
Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
$$('.ow-status', gate).forEach(function (s) { s.textContent = ''; });
$$('button[type="submit"]', gate).forEach(function (b) { busy(b, false); });
if (inApp) {
focusLater($('#ow-app-title'));
return;
}
var st = $('.ow-status', screens[name]);
if (st && text)
st.textContent = text;
focusLater($('input', screens[name]) || $('a, button', screens[name]));
}
$$('[data-screen]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.screen); }); });
$$('[data-eye]').forEach(function (b) {
b.addEventListener('click', function () {
var i = document.getElementById(b.dataset.eye), on = i.type === 'password';
i.type = on ? 'text' : 'password';
b.setAttribute('aria-pressed', String(on));
b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
});
});
$$('[data-back]').forEach(function (a) { a.setAttribute('href', STANDALONE ? '/' : '#hero'); });
var viewOn = false;
function viewOpen() { if (viewOn)
return; viewOn = true; document.documentElement.classList.add('owner-mode'); ow.hidden = false; window.GLOW_PAUSED = true; window.scrollTo(0, 0); }
function viewClose() { if (!viewOn)
return; viewOn = false; document.documentElement.classList.remove('owner-mode'); ow.hidden = true; window.GLOW_PAUSED = false; window.dispatchEvent(new Event('resize')); }
var S = { me: '', on: false, bookings: [], club: [], settings: null, lastAlert: null, loadedAt: 0, loading: false,
tab: 'bookings', when: 'upcoming', bq: '', day: 'all', dayPick: '', cq: '', pref: 'all', confirm: {}, resent: {}, testAt: 0 };
function cacheGet() { try {
var c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
return c && c.bookings && c.club ? c : null;
}
catch (e) {
return null;
} }
function cacheSet() { try {
sessionStorage.setItem(CACHE, JSON.stringify({ bookings: S.bookings, club: S.club }));
}
catch (e) { } }
function wipe() {
try {
sessionStorage.removeItem(CACHE);
}
catch (e) { }
S.on = false;
S.me = '';
S.bookings = [];
S.club = [];
S.settings = null;
S.lastAlert = null;
S.loadedAt = 0;
S.confirm = {};
S.resent = {};
['#ow-blist', '#ow-clist', '#ow-stats', '#ow-bdays'].forEach(function (s) { $(s).textContent = ''; });
$('#ow-alert-email').value = '';
banner('');
}
function signOutNow() {
var c = client;
if (!c)
return;
var drop = function () { try {
localStorage.removeItem(STORE);
}
catch (e) { } };
c.auth.signOut({ scope: 'local' }).then(function (r) { if (r && r.error)
drop(); }, drop);
}
function deny() { wipe(); signOutNow(); show('denied'); }
function enter(user) {
S.on = true;
S.me = user.email || '';
$('#ow-me').textContent = S.me;
$('#ow-today').textContent = dayLong(today());
show('app');
setTab(S.tab, false);
applyNet();
loadAll();
}
screens.signin.addEventListener('submit', function (e) {
e.preventDefault();
var b = $('button[type="submit"]', this), st = $('#ow-signin-status'), em = $('#ow-email').value.trim(), pw = $('#ow-password').value;
if (b.disabled)
return;
if (!emailOk(em) || !pw) {
st.textContent = 'Please enter your email and password.';
return;
}
var p = cfgProblem();
if (p) {
st.textContent = p;
return;
}
if (em.toLowerCase() !== CFG.owner) {
$('#ow-password').value = '';
show('denied');
return;
}
if (isOffline()) {
st.textContent = NO_NET;
return;
}
busy(b, true, 'Signing in…');
st.textContent = '';
getClient().then(function (c) { return c.auth.signInWithPassword({ email: em, password: pw }); }).then(function (r) {
busy(b, false);
$('#ow-password').value = '';
if (r.error || !r.data || !r.data.user) {
st.textContent = authMessage(r.error);
return;
}
if (!isOwner(r.data.user))
deny();
else
enter(r.data.user);
}, function () { busy(b, false); st.textContent = NO_NET; });
});
function resetLink() { return location.origin + location.pathname; }
screens.forgot.addEventListener('submit', function (e) {
e.preventDefault();
var b = $('button[type="submit"]', this), st = $('#ow-forgot-status'), em = $('#ow-forgot-email').value.trim();
var sent = 'If that email belongs to the owner, a reset link is on its way.';
if (b.disabled)
return;
if (!emailOk(em)) {
st.textContent = 'Please enter your email address.';
return;
}
var p = cfgProblem();
if (p) {
st.textContent = p;
return;
}
if (em.toLowerCase() !== CFG.owner) {
st.textContent = sent;
return;
}
if (isOffline()) {
st.textContent = NO_NET;
return;
}
busy(b, true, 'Sending…');
st.textContent = '';
getClient().then(function (c) { return c.auth.resetPasswordForEmail(em, { redirectTo: resetLink() }); }).then(function (r) {
busy(b, false);
st.textContent = r.error && (r.error.status === 429 || /rate/i.test(r.error.message || '')) ? 'Too many tries. Please wait a minute, then try again.' : sent;
}, function () { busy(b, false); st.textContent = NO_NET; });
});
function hints() {
var a = $('#ow-new1').value, c = $('#ow-new2').value;
$('[data-hint="len"]').classList.toggle('ok', a.length >= 8);
$('[data-hint="match"]').classList.toggle('ok', !!a && a === c);
}
['#ow-new1', '#ow-new2'].forEach(function (s) { $(s).addEventListener('input', hints); });
screens.newpass.addEventListener('submit', function (e) {
e.preventDefault();
var b = $('button[type="submit"]', this), st = $('#ow-newpass-status'), a = $('#ow-new1').value, c = $('#ow-new2').value;
if (b.disabled)
return;
if (a.length < 8) {
st.textContent = 'Please use at least 8 characters.';
return;
}
if (a !== c) {
st.textContent = 'The two passwords don’t match.';
return;
}
if (isOffline()) {
st.textContent = NO_NET;
return;
}
busy(b, true, 'Saving…');
st.textContent = '';
getClient().then(function (cl) { return cl.auth.updateUser({ password: a }); }).then(function (r) {
busy(b, false);
if (r.error) {
var m = r.error.message || '';
st.textContent = /different|same/i.test(m) ? 'Please choose a password you haven’t used here before.' : /weak|short|least/i.test(m) ? 'Please choose a longer or stronger password.' : /session|missing|expired|invalid/i.test(m) ? 'That link has expired. Tap “Forgot password?” on the sign-in screen to get a new one.' : 'We couldn’t save the password. Please try again.';
return;
}
$('#ow-new1').value = $('#ow-new2').value = '';
hints();
if (!isOwner(r.data && r.data.user))
deny();
else {
enter(r.data.user);
toast('Your password is saved.');
}
}, function () { busy(b, false); st.textContent = NO_NET; });
});
function banner(text, retry) { var bn = $('#ow-banner'); bn.hidden = !text; $('span', bn).textContent = text || ''; $('#ow-retry').hidden = !retry; }
$('#ow-retry').addEventListener('click', function () { banner(''); loadAll(); });
function skeletons() {
var bl = $('#ow-blist'), cl = $('#ow-clist'), stt = $('#ow-stats');
bl.textContent = '';
cl.textContent = '';
stt.textContent = '';
for (var i = 0; i < 3; i++) {
var c = el('div', 'ow-glass ow-skel');
c.setAttribute('aria-hidden', 'true');
[['55%', 22], ['80%', 14], ['70%', 14], ['90%', 44]].forEach(function (l) { var x = el('span', 'sk-line'); x.style.width = l[0]; x.style.height = l[1] + 'px'; c.appendChild(x); });
bl.appendChild(c);
cl.appendChild(c.cloneNode(true));
}
for (var j = 0; j < 4; j++) {
var s = el('div', 'ow-glass ow-skel');
s.setAttribute('aria-hidden', 'true');
s.appendChild(el('span', 'sk-line')).style.cssText = 'width:40%;height:34px';
s.appendChild(el('span', 'sk-line')).style.width = '70%';
stt.appendChild(s);
}
$$('[data-stat]').forEach(function (b) { b.textContent = '–'; });
}
function loadAll(quiet) {
if (S.loading || !client || !S.on)
return;
S.loading = true;
var have = S.loadedAt || S.bookings.length || S.club.length;
if (!have) {
var c = cacheGet();
if (c) {
S.bookings = c.bookings;
S.club = c.club;
have = true;
renderAll();
}
else
skeletons();
}
if (isOffline()) {
S.loading = false;
banner(have ? 'You’re offline. This is the last list you loaded.' : 'You’re offline. Your lists will load when you’re back online.');
return;
}
var btn = $('#ow-refresh');
if (!quiet)
busy(btn, true, 'Refreshing…');
Promise.all([
q(function () { return client.from('bookings').select('*').order('appt_date', { ascending: true }).order('appt_time', { ascending: true }).limit(5000); }),
q(function () { return client.from('glow_club').select('*').order('created_at', { ascending: false }).limit(5000); }),
q(function () { return client.from('owner_settings').select('*').eq('id', 1).maybeSingle(); }),
q(function () { return client.from('alert_log').select('created_at,kind,status,detail').in('kind', ['booking', 'test']).order('created_at', { ascending: false }).limit(1); })
]).then(function (res) {
S.loading = false;
busy(btn, false);
if (res.some(function (r) { return r.error && authErr(r.error); })) {
wipe();
signOutNow();
show('signin', 'Please sign in again.');
return;
}
if (res[0].error || res[1].error) {
banner('We couldn’t load your lists. Check your internet connection.', true);
if (!have)
['#ow-blist', '#ow-clist', '#ow-stats'].forEach(function (s) { $(s).textContent = ''; });
return;
}
banner('');
S.bookings = res[0].data || [];
S.club = res[1].data || [];
if (!res[2].error)
S.settings = res[2].data || null;
if (!res[3].error)
S.lastAlert = (res[3].data || [])[0] || null;
S.loadedAt = Date.now();
cacheSet();
renderAll();
fillSettings();
});
}
function quietRefresh() { if (S.on && Date.now() - S.loadedAt > 15000)
loadAll(true); }
$('#ow-refresh').addEventListener('click', function () { loadAll(false); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && (STANDALONE || viewOn))
quietRefresh(); });
function renderAll() { counts(); renderBookings(); renderClub(); renderStats(); }
var TABS = ['bookings', 'club', 'stats', 'settings'];
function setTab(name, refresh) {
S.tab = name;
$$('[role="tab"]').forEach(function (t) { var on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
TABS.forEach(function (t) { var p = $('#ow-p-' + t); var on = t === name; if (p.hidden === on) {
p.hidden = !on;
} });
if (refresh)
quietRefresh();
}
$$('[role="tablist"]').forEach(function (list) {
var tabs = $$('[role="tab"]', list);
tabs.forEach(function (t, i) {
t.addEventListener('click', function () { setTab(t.dataset.tab, true); if (window.scrollY > 200)
window.scrollTo(0, 0); });
t.addEventListener('keydown', function (e) {
var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
if (j === null)
return;
e.preventDefault();
var n = tabs[(j + tabs.length) % tabs.length];
setTab(n.dataset.tab, true);
n.focus();
});
});
});
function live(b) { return b.status !== 'Cancelled'; }
function counts() {
var t = today(), wk = weekOf(t), mo = t.slice(0, 7);
$('[data-stat="upcoming"]').textContent = S.bookings.filter(function (b) { return b.appt_date >= t && live(b) && b.status !== 'Done'; }).length;
$('[data-stat="week"]').textContent = S.bookings.filter(function (b) { return live(b) && b.appt_date >= wk[0] && b.appt_date <= wk[1]; }).length;
$('[data-stat="paidMonth"]').textContent = money(paidThisMonth(mo));
}
function paidThisMonth(mo) { return S.bookings.filter(function (b) { return live(b) && b.paid_at && jm(new Date(b.paid_at)).slice(0, 7) === mo; }).reduce(function (s, b) { return s + (typeof b.price_jmd === 'number' ? b.price_jmd : 0); }, 0); }
function hit(r, keys, query) {
if (!query)
return true;
var ql = query.toLowerCase(), qd = query.replace(/\D/g, '');
return keys.some(function (k) { var v = String(r[k] || ''); return v.toLowerCase().indexOf(ql) >= 0 || (qd.length >= 3 && v.replace(/\D/g, '').indexOf(qd) >= 0); });
}
function bookingsShown() {
var t = today(), wk = weekOf(t);
var l = S.bookings.filter(function (b) {
if (S.day === 'all') {
if (S.when === 'upcoming' ? b.appt_date < t : b.appt_date >= t)
return false;
}
else if (S.day === 'today') {
if (b.appt_date !== t)
return false;
}
else if (S.day === 'tomorrow') {
if (b.appt_date !== addDays(t, 1))
return false;
}
else if (S.day === 'week') {
if (b.appt_date < wk[0] || b.appt_date > wk[1])
return false;
}
else if (S.day === 'date') {
if (b.appt_date !== S.dayPick)
return false;
}
return hit(b, ['client_name', 'phone', 'service'], S.bq);
});
l.sort(function (a, b) { var x = a.appt_date + a.appt_time, y = b.appt_date + b.appt_time; return x < y ? -1 : x > y ? 1 : 0; });
return S.day === 'all' && S.when === 'past' ? l.reverse() : l;
}
function renderBookings() {
var list = $('#ow-blist');
list.textContent = '';
var l = bookingsShown();
if (!l.length) {
list.appendChild(el('p', 'ow-glass ow-empty', !S.bookings.length ? 'No bookings yet. New bookings will appear here as soon as clients book on your website.' : 'No bookings match.'));
return;
}
l.forEach(function (b) { list.appendChild(bookingCard(b)); });
applyNet();
}
var BADGE = { Requested: 'b-requested', Confirmed: 'b-confirmed', Paid: 'b-paid', Done: 'b-done', Cancelled: 'b-cancelled' };
function actionsFor(b) {
if (b.status === 'Requested')
return ['confirm', 'paid', 'cancel'];
if (b.status === 'Confirmed')
return (b.paid_at ? [] : ['paid']).concat(['done', 'cancel']);
if (b.status === 'Paid')
return (b.email && !b.confirmation_sent_at ? ['sendconf'] : []).concat(['done', 'cancel']);
return [];
}
var LABEL = { confirm: 'Confirm', paid: 'Mark paid', done: 'Mark done', cancel: 'Cancel', sendconf: 'Send confirmation email' };
function pair(dl, k, v) { dl.appendChild(el('dt', '', k)); var dd = el('dd'); if (v && v.nodeType)
dd.appendChild(v);
else
dd.appendChild(el('span', 'ow-plain', v || '—')); dl.appendChild(dd); }
function link(text, href, label) { var a = el('a', '', text); a.href = href; if (label)
a.setAttribute('aria-label', label); return a; }
function first(name) { return String(name || '').trim().split(/\s+/)[0] || 'the client'; }
function bookingCard(b) {
var card = el('article', 'ow-glass ow-bk');
card.dataset.id = b.id;
var top = el('div', 'ow-bk-top');
top.appendChild(el('span', 'ow-av', (String(b.client_name || '?').trim().charAt(0) || '?').toUpperCase())).setAttribute('aria-hidden', 'true');
var who = el('div', 'ow-who');
who.appendChild(el('h3', '', b.client_name));
var line = el('p');
line.appendChild(document.createTextNode(b.service + ' · '));
line.appendChild(el('span', 'ow-when' + (b.status === 'Cancelled' ? ' is-off' : ''), dayShort(b.appt_date) + ', ' + timeOf(b.appt_time)));
who.appendChild(line);
top.appendChild(who);
top.appendChild(el('span', 'ow-badge ' + (BADGE[b.status] || 'b-requested'), b.status));
card.appendChild(top);
var dl = el('dl', 'ow-kv');
pair(dl, 'Price', money(b.price_jmd));
pair(dl, 'Phone', link(b.phone, 'tel:' + telOf(b.phone), 'Call ' + b.client_name + ' on ' + b.phone));
pair(dl, 'Email', b.email ? link(b.email, 'mailto:' + b.email, 'Email ' + b.client_name) : '');
pair(dl, 'Agreed to terms', stamp(b.terms_agreed_at));
if (b.paid_at)
pair(dl, 'Marked paid', stamp(b.paid_at));
card.appendChild(dl);
if (b.client_note) {
var nq = el('p', 'ow-quote');
nq.appendChild(el('b', '', 'Client’s note: '));
nq.appendChild(document.createTextNode(b.client_note));
card.appendChild(nq);
}
var acts = actionsFor(b);
if (acts.length) {
var row = el('div', 'ow-actions');
row.setAttribute('role', 'group');
row.setAttribute('aria-label', 'Update ' + b.client_name + '’s booking');
acts.forEach(function (a) { var btn = el('button', 'btn ' + (a === 'confirm' || a === 'sendconf' ? 'btn-dark' : 'btn-ghost'), LABEL[a]); btn.type = 'button'; btn.dataset.act = a; btn.setAttribute('data-net', ''); row.appendChild(btn); });
card.appendChild(row);
if (acts.indexOf('paid') >= 0)
card.appendChild(el('p', 'ow-hint', 'Mark paid: check the payment in your Whop dashboard first.'));
}
var cl = confirmLine(b);
if (cl)
card.appendChild(cl);
var note = el('div', 'ow-note');
var lab = el('label', '', 'Private note');
lab.htmlFor = 'ow-note-' + b.id;
var ta = el('textarea');
ta.id = 'ow-note-' + b.id;
ta.maxLength = 2000;
ta.value = b.owner_note || '';
ta.placeholder = 'Only you can see this';
var nr = el('div', 'ow-note-row'), sv = el('button', 'btn btn-ghost ow-pill', 'Save note');
sv.type = 'button';
sv.dataset.act = 'note';
sv.setAttribute('data-net', '');
var flag = el('span', 'ow-saved');
flag.setAttribute('role', 'status');
nr.appendChild(sv);
nr.appendChild(flag);
note.appendChild(lab);
note.appendChild(ta);
note.appendChild(nr);
card.appendChild(note);
return card;
}
function confirmLine(b) {
var st = S.confirm[b.id], p = el('p', 'ow-confirm');
p.setAttribute('role', 'status');
if (b.confirmation_sent_at) {
p.textContent = st === 'sent' ? 'Confirmed ✓ – email sent' : 'Confirmation email sent · ' + stamp(b.confirmation_sent_at);
return p;
}
if (st === 'noemail' || ((b.status === 'Confirmed' || b.status === 'Paid') && !b.email)) {
p.textContent = 'No email on this booking, so no confirmation email was sent.';
return p;
}
if (st === 'failed') {
p.appendChild(document.createTextNode('Confirmation email didn’t send. '));
if (!S.resent[b.id]) {
var r = el('button', 'btn btn-ghost ow-pill', 'Resend');
r.type = 'button';
r.dataset.act = 'resend';
r.setAttribute('data-net', '');
p.appendChild(r);
}
else
p.appendChild(document.createTextNode('Please let the client know yourself.'));
return p;
}
return null;
}
function find(id) { return S.bookings.filter(function (x) { return x.id === id; })[0]; }
function redraw(card, b) { var fresh = bookingCard(b); fresh.style.animation = 'none'; card.parentNode.replaceChild(fresh, card); applyNet(); return fresh; }
function lockCard(card, on) { $$('button', card).forEach(function (x) { if (on)
x.disabled = true;
else if (x.getAttribute('aria-busy') !== 'true')
x.disabled = isOffline() && x.hasAttribute('data-net'); }); }
function update(b, patch, btn, card) {
if (isOffline()) {
toast(OFFLINE);
return Promise.resolve(false);
}
lockCard(card, true);
busy(btn, true, 'Saving…');
return q(function () { return client.from('bookings').update(patch).eq('id', b.id).select('*'); }).then(function (r) {
if (r.error || !r.data || r.data.length !== 1) {
busy(btn, false);
lockCard(card, false);
if (r.error && authErr(r.error)) {
wipe();
signOutNow();
show('signin', 'Please sign in again.');
return false;
}
toast('That didn’t save. Please try again.');
return false;
}
for (var k in r.data[0])
b[k] = r.data[0][k];
cacheSet();
counts();
renderStats();
return true;
});
}
function sendConfirmation(b) {
return client.functions.invoke('send-confirmation', { body: { booking_id: b.id } }).then(function (r) {
var d = r && r.data;
if (d && (d.sent || d.already)) {
b.confirmation_sent_at = d.at || b.confirmation_sent_at || new Date().toISOString();
S.confirm[b.id] = 'sent';
return 'sent';
}
S.confirm[b.id] = d && /no client email/i.test(d.reason || '') ? 'noemail' : 'failed';
return S.confirm[b.id];
}, function () { S.confirm[b.id] = 'failed'; return 'failed'; });
}
function confirmAndEmail(b, btn, card, statusFirst) {
var step = statusFirst ? update(b, { status: 'Confirmed' }, btn, card) : Promise.resolve(true);
step.then(function (ok) {
if (!ok)
return;
if (!b.email) {
S.confirm[b.id] = 'noemail';
redraw(card, b);
toast('Confirmed. There’s no client email, so no confirmation email was sent.');
return;
}
busy(btn, true, 'Sending…');
lockCard(card, true);
sendConfirmation(b).then(function (res) {
var fresh = redraw(card, b);
toast(res === 'sent' ? 'Confirmed ✓ – email sent' : res === 'noemail' ? 'Confirmed. There’s no client email, so no confirmation email was sent.' : 'Confirmed, but the confirmation email didn’t send.');
var f = $('.ow-confirm .btn, .ow-actions .btn', fresh);
if (f)
focusLater(f);
});
});
}
$('#ow-blist').addEventListener('click', function (e) {
var btn = e.target.closest('button[data-act]');
if (!btn || btn.disabled)
return;
var card = btn.closest('.ow-bk'), b = find(card.dataset.id);
if (!b)
return;
var a = btn.dataset.act;
if (isOffline()) {
toast(OFFLINE);
return;
}
if (a === 'confirm')
confirmAndEmail(b, btn, card, true);
else if (a === 'sendconf')
confirmAndEmail(b, btn, card, false);
else if (a === 'resend') {
S.resent[b.id] = true;
confirmAndEmail(b, btn, card, false);
}
else if (a === 'paid')
update(b, { status: 'Paid', paid_at: new Date().toISOString() }, btn, card).then(function (ok) { if (ok) {
redraw(card, b);
toast(b.client_name + ' is marked paid.');
} });
else if (a === 'done')
update(b, { status: 'Done' }, btn, card).then(function (ok) { if (ok) {
redraw(card, b);
toast(b.client_name + '’s booking is marked done.');
} });
else if (a === 'cancel')
askCancel(b, btn, card);
else if (a === 'note')
saveNote(b, card, btn);
});
$('#ow-blist').addEventListener('focusout', function (e) {
var ta = e.target;
if (ta.tagName !== 'TEXTAREA')
return;
var card = ta.closest('.ow-bk'), b = card && find(card.dataset.id);
if (b && (ta.value.trim() || null) !== (b.owner_note || null) && !isOffline())
saveNote(b, card, $('[data-act="note"]', card));
});
function saveNote(b, card, btn) {
var ta = $('textarea', card), flag = $('.ow-saved', card), v = ta.value.trim().slice(0, 2000) || null;
if (btn.disabled)
return;
busy(btn, true, 'Saving…');
flag.textContent = '';
q(function () { return client.from('bookings').update({ owner_note: v }).eq('id', b.id).select('id,owner_note'); }).then(function (r) {
busy(btn, false);
if (r.error || !r.data || r.data.length !== 1) {
flag.textContent = '';
toast('Your note didn’t save. Please try again.');
return;
}
b.owner_note = r.data[0].owner_note;
cacheSet();
flag.textContent = 'Saved';
});
}
var dlg = $('#ow-cancel'), dlgFrom = null, dlgDo = null;
function askCancel(b, btn, card) {
$('#ow-cancel-text').textContent = 'Cancel ' + first(b.client_name) + '’s ' + b.service + ' on ' + dayShort(b.appt_date) + ' at ' + timeOf(b.appt_time) + '? This does not refund the card – refunds are done in Whop.';
dlgFrom = btn;
dlgDo = function () { update(b, { status: 'Cancelled' }, btn, card).then(function (ok) { if (ok) {
redraw(card, b);
toast(first(b.client_name) + '’s booking is cancelled.');
} }); };
dlg.hidden = false;
focusLater($('[data-keep]', dlg));
}
function closeDlg() { dlg.hidden = true; if (dlgFrom && dlgFrom.isConnected)
focusLater(dlgFrom); dlgDo = null; }
$('[data-keep]', dlg).addEventListener('click', closeDlg);
$('[data-yes]', dlg).addEventListener('click', function () { var go = dlgDo; dlg.hidden = true; dlgDo = null; if (go)
go(); });
dlg.addEventListener('keydown', function (e) {
if (e.key === 'Escape') {
e.preventDefault();
closeDlg();
return;
}
if (e.key === 'Tab') {
var bs = $$('button', dlg), i = bs.indexOf(document.activeElement);
e.preventDefault();
bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
}
});
dlg.addEventListener('click', function (e) { if (e.target === dlg)
closeDlg(); });
$$('[data-when]').forEach(function (b) { b.addEventListener('click', function () { S.when = b.dataset.when; $$('[data-when]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); if (S.day !== 'all')
setDay('all'); renderBookings(); }); });
function setDay(d) { S.day = d; $$('[data-day]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.day === d)); }); $('.ow-datepick').classList.toggle('on', d === 'date'); if (d !== 'date')
$('#ow-bday').value = ''; }
$$('[data-day]').forEach(function (b) { b.addEventListener('click', function () { setDay(b.dataset.day); renderBookings(); }); });
$('#ow-bday').addEventListener('change', function () { if (this.value) {
S.dayPick = this.value;
setDay('date');
}
else
setDay('all'); renderBookings(); });
$('#ow-bq').addEventListener('input', function () { S.bq = this.value.trim(); renderBookings(); });
function clubShown() { return S.club.filter(function (r) { return (S.pref === 'all' || r.contact_pref === S.pref) && hit(r, ['name', 'phone', 'email'], S.cq); }); }
function consenting(r) { return !!r.marketing_consent && !r.unsubscribed_at; }
function renderClub() {
var mo = parseInt(today().slice(5, 7), 10), bd = $('#ow-bdays');
bd.textContent = '';
var bl = S.club.filter(function (r) { return r.birth_month === mo; }).sort(function (a, b) { return a.birth_day - b.birth_day; });
bd.appendChild(el('h2', '', 'Birthdays this month'));
if (!bl.length)
bd.appendChild(el('p', '', 'No birthdays this month.'));
else {
var ul = el('ul');
bl.forEach(function (r) { ul.appendChild(el('li', '', r.name + ' · ' + bday(r))); });
bd.appendChild(ul);
}
var box = $('#ow-clist');
box.textContent = '';
var l = clubShown();
if (!l.length) {
box.appendChild(el('p', 'ow-glass ow-empty', !S.club.length ? 'No Glow Club members yet. New sign-ups will appear here.' : 'Nobody matches.'));
return;
}
var wrap = el('div', 'ow-table-wrap'), t = el('table', 'ow-table');
t.setAttribute('role', 'table');
t.setAttribute('aria-label', 'Glow Club members');
var th = el('thead'), hr = el('tr');
hr.setAttribute('role', 'row');
['Name', 'Birthday', 'Contact by', 'Contact', 'Marketing', 'Joined', 'Message'].forEach(function (h) { var c = el('th', '', h); c.scope = 'col'; c.setAttribute('role', 'columnheader'); hr.appendChild(c); });
th.appendChild(hr);
t.appendChild(th);
var tb = el('tbody');
l.forEach(function (r) {
var tr = el('tr');
tr.setAttribute('role', 'row');
tr.dataset.cid = r.id;
function td(label, v, cls) { var c = el('td', cls || ''); c.setAttribute('role', 'cell'); c.dataset.label = label; if (v && v.nodeType)
c.appendChild(v);
else
c.textContent = v || '—'; tr.appendChild(c); return c; }
td('Name', r.name, 'ow-td-name');
td('Birthday', bday(r));
td('Contact by', r.contact_pref);
td('Contact', r.contact_pref === 'Email' ? link(r.email, 'mailto:' + r.email, 'Email ' + r.name) : link(r.phone, 'tel:' + telOf(r.phone), 'Call ' + r.name + ' on ' + r.phone));
td('Marketing', r.unsubscribed_at ? 'No – stopped ' + stamp(r.unsubscribed_at) : r.marketing_consent ? 'Yes · ' + stamp(r.consent_at) : 'No');
td('Joined', new Date(r.created_at).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }));
var act = td('Message', document.createTextNode(''), 'ow-td-act');
var fn = first(r.name), hi = 'Hi ' + fn + ', it’s Launthia from Glow by Launthia.\n\n\n\n';
if (r.phone) {
var tx = el('a', 'btn btn-ghost', 'Text');
tx.href = 'sms:' + telOf(r.phone) + (consenting(r) ? (IOS ? '&' : '?') + 'body=' + encodeURIComponent(hi + 'Reply STOP to stop these messages.') : '');
tx.setAttribute('aria-label', 'Text ' + r.name);
act.appendChild(tx);
}
if (r.phone && r.contact_pref === 'WhatsApp') {
var wa = el('a', 'btn btn-ghost', 'WhatsApp');
wa.href = 'https://wa.me/' + telOf(r.phone).replace(/\D/g, '') + (consenting(r) ? '?text=' + encodeURIComponent(hi + 'Reply STOP to stop these messages.') : '');
wa.target = '_blank';
wa.rel = 'noopener';
wa.setAttribute('aria-label', 'WhatsApp ' + r.name + ' (opens in a new tab)');
act.appendChild(wa);
}
if (r.email) {
var em = el('a', 'btn btn-ghost', 'Email');
em.href = 'mailto:' + r.email + (consenting(r) ? '?subject=' + encodeURIComponent('Glow by Launthia') + '&body=' + encodeURIComponent(hi + 'To stop these emails, reply STOP.') : '');
em.setAttribute('aria-label', 'Email ' + r.name);
act.appendChild(em);
}
if (consenting(r)) {
var st = el('button', 'btn btn-ghost', 'Mark as STOP');
st.type = 'button';
st.dataset.stop = r.id;
st.setAttribute('data-net', '');
st.setAttribute('aria-label', r.name + ' replied STOP: no more offers');
act.appendChild(st);
}
tb.appendChild(tr);
});
t.appendChild(tb);
wrap.appendChild(t);
box.appendChild(wrap);
applyNet();
}
$('#ow-clist').addEventListener('click', function (e) {
var b = e.target.closest('button[data-stop]');
if (!b || b.disabled)
return;
if (isOffline()) {
toast(OFFLINE);
return;
}
var r = S.club.filter(function (x) { return x.id === b.dataset.stop; })[0];
if (!r)
return;
busy(b, true, 'Saving…');
q(function () { return client.from('glow_club').update({ marketing_consent: false, unsubscribed_at: new Date().toISOString() }).eq('id', r.id).select('*'); }).then(function (res) {
if (res.error || !res.data || res.data.length !== 1) {
busy(b, false);
toast('That didn’t save. Please try again.');
return;
}
for (var k in res.data[0])
r[k] = res.data[0][k];
cacheSet();
renderClub();
toast('Saved: no more offers to ' + r.name + '.');
});
});
$('#ow-cq').addEventListener('input', function () { S.cq = this.value.trim(); renderClub(); });
$$('[data-pref]').forEach(function (b) { b.addEventListener('click', function () { S.pref = b.dataset.pref; $$('[data-pref]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderClub(); }); });
function cell(v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v))
v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function download(name, rows) {
var head = ['Name', 'Phone', 'Email', 'Contact preference', 'Birthday', 'Marketing consent', 'Consent given', 'Stopped offers', 'Joined'];
var body = rows.map(function (r) { return [r.name, r.phone, r.email, r.contact_pref, bday(r), r.marketing_consent && !r.unsubscribed_at ? 'Yes' : 'No', stamp(r.consent_at), stamp(r.unsubscribed_at), stamp(r.created_at)]; });
var csv = '﻿' + [head].concat(body).map(function (row) { return row.map(cell).join(','); }).join('\r\n');
try {
var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
a.href = url;
a.download = name;
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
toast('Downloaded ' + name);
}
catch (e) {
toast('We couldn’t make the file on this device.');
}
}
$('#ow-csv-all').addEventListener('click', function () { download('glow-club-' + today() + '.csv', S.club); });
$('#ow-csv-mkt').addEventListener('click', function () { download('glow-club-marketing-' + today() + '.csv', S.club.filter(consenting)); });
function renderStats() {
var box = $('#ow-stats');
box.textContent = '';
var t = today(), wk = weekOf(t), mo = t.slice(0, 7);
var month = S.bookings.filter(function (b) { return live(b) && b.appt_date.slice(0, 7) === mo; });
var week = S.bookings.filter(function (b) { return live(b) && b.appt_date >= wk[0] && b.appt_date <= wk[1]; }).length;
var by = {};
month.forEach(function (b) { by[b.service] = (by[b.service] || 0) + 1; });
var top = Math.max.apply(null, [0].concat(Object.keys(by).map(function (k) { return by[k]; })));
var leaders = Object.keys(by).filter(function (k) { return by[k] === top && top > 0; });
function stat(big, label, why, cls) { var c = el('div', 'ow-glass ow-stat'); c.appendChild(el('b', cls || '', big)); c.appendChild(el('span', '', label)); c.appendChild(el('p', '', why)); box.appendChild(c); }
stat(String(week), 'Bookings this week', 'Monday to Sunday, by appointment date, not counting cancelled.' + (week ? '' : ' No bookings yet this week.'));
stat(String(month.length), 'Bookings this month', 'By appointment date this month, not counting cancelled.' + (month.length ? '' : ' No bookings yet this month.'));
stat(money(paidThisMonth(mo)), 'Paid this month', 'Bookings you marked paid this month, not counting cancelled.');
stat(leaders.length ? leaders.join(' and ') : '0', 'Most booked service this month', leaders.length ? (leaders.length > 1 ? 'A tie: ' + top + ' bookings each.' : top + (top === 1 ? ' booking' : ' bookings') + ' this month.') : 'No bookings yet this month.', leaders.length ? 'ow-stat-svc' : '');
}
var sw = $('#ow-alerts-on');
sw.addEventListener('click', function () { sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); $('#ow-alerts-status').textContent = ''; });
sw.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') {
e.preventDefault();
sw.click();
} });
function fillSettings() {
var s = S.settings;
if (s) {
sw.setAttribute('aria-checked', String(!!s.email_alerts));
if (document.activeElement !== $('#ow-alert-email'))
$('#ow-alert-email').value = s.alert_email || '';
}
var la = S.lastAlert, line = $('#ow-last-alert');
line.textContent = !la ? 'No alerts sent yet.' : 'Last alert: ' + stamp(la.created_at) + ' · ' + (la.status === 'sent' ? 'Sent' : la.status === 'skipped' ? 'Skipped – ' + (la.detail || '') : 'Failed – ' + (la.detail || 'no reason given'));
}
$('#ow-alerts').addEventListener('submit', function (e) {
e.preventDefault();
var b = $('#ow-alerts-save'), st = $('#ow-alerts-status'), em = $('#ow-alert-email').value.trim(), on = sw.getAttribute('aria-checked') === 'true';
if (b.disabled)
return;
if (!emailOk(em)) {
st.textContent = 'Please enter a valid email address for your alerts.';
$('#ow-alert-email').closest('.field').classList.add('invalid');
focusLater($('#ow-alert-email'));
return;
}
$('#ow-alert-email').closest('.field').classList.remove('invalid');
if (isOffline()) {
st.textContent = OFFLINE;
return;
}
busy(b, true, 'Saving…');
st.textContent = '';
q(function () { return client.from('owner_settings').update({ email_alerts: on, alert_email: em, updated_at: new Date().toISOString() }).eq('id', 1).select('*'); }).then(function (r) {
busy(b, false);
if (r.error || !r.data || r.data.length !== 1) {
st.textContent = 'That didn’t save. Your changes are still here – please try again.';
return;
}
S.settings = r.data[0];
st.textContent = 'Saved ✓';
});
});
$('#ow-test').addEventListener('click', function () {
var b = this, st = $('#ow-alerts-status');
if (b.disabled)
return;
var left = Math.ceil((30000 - (Date.now() - S.testAt)) / 1000);
if (left > 0) {
st.textContent = 'Please wait ' + left + ' seconds before sending another test.';
return;
}
if (isOffline()) {
st.textContent = OFFLINE;
return;
}
S.testAt = Date.now();
busy(b, true, 'Sending…');
st.textContent = '';
client.functions.invoke('notify-owner', { body: { test: true } }).then(function (r) {
busy(b, false);
var d = r && r.data;
st.textContent = d && d.sent ? 'Test email sent – check your inbox (and spam folder).' : 'The test email didn’t send' + (d && d.reason ? ' (' + String(d.reason).slice(0, 120) + ')' : '') + '. Check the Resend key and sender in Supabase.';
q(function () { return client.from('alert_log').select('created_at,kind,status,detail').in('kind', ['booking', 'test']).order('created_at', { ascending: false }).limit(1); }).then(function (x) { if (!x.error) {
S.lastAlert = (x.data || [])[0] || null;
fillSettings();
} });
}, function () { busy(b, false); st.textContent = 'The test email didn’t send. Check your internet connection.'; });
});
$('#ow-change-pw').addEventListener('click', function () {
var b = this, st = $('#ow-account-status');
if (b.disabled || isOffline())
return;
busy(b, true, 'Sending…');
client.auth.resetPasswordForEmail(S.me, { redirectTo: resetLink() }).then(function (r) {
busy(b, false);
st.textContent = r.error ? 'We couldn’t send the link. Please try again in a minute.' : 'A link to change your password is on its way to ' + S.me + '.';
}, function () { busy(b, false); st.textContent = NO_NET; });
});
$$('[data-signout]').forEach(function (b) { b.addEventListener('click', function () { wipe(); signOutNow(); show('signin', 'You’re signed out.'); }); });
function applyNet() {
var off = isOffline();
$('#ow-net').hidden = !off;
$$('[data-net]').forEach(function (b) { if (b.getAttribute('aria-busy') !== 'true')
b.disabled = off; });
}
addEventListener('offline', applyNet);
addEventListener('online', function () { applyNet(); if (S.on)
loadAll(true); });
var ret = (function () {
var h = location.hash.slice(1);
if (!/(^|&)(access_token|error_description)=/.test(h))
return null;
var o = {};
h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0)
try {
o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
}
catch (e) { } });
return o;
})();
var holding = !!ret;
function start() {
var p = cfgProblem();
if (p) {
show('signin', p);
return;
}
if (S.on) {
show('app');
quietRefresh();
return;
}
gate.hidden = true;
app.hidden = true;
bottom.hidden = true;
getClient().then(function (c) { return c.auth.getSession(); }).then(function (r) {
var ses = r && r.data && r.data.session;
if (!ses)
show('signin');
else if (!isOwner(ses.user))
deny();
else
enter(ses.user);
}, function () { show('signin', NO_NET); });
}
function route() { if (holding)
return; if (location.hash === '#owner') {
viewOpen();
start();
}
else
viewClose(); }
if (ret) {
if (!STANDALONE)
viewOpen();
else
ow.hidden = false;
gate.hidden = true;
app.hidden = true;
bottom.hidden = true;
var settle = function () { holding = false; try {
history.replaceState(null, '', location.pathname + location.search + (STANDALONE ? '' : '#owner'));
}
catch (e) { } };
var p = cfgProblem();
if (p) {
settle();
show('signin', p);
}
else
getClient().then(function (c) { return c.auth.getSession(); }).then(function (r) {
settle();
var ses = r && r.data && r.data.session;
if (ret.error_description || !ses) {
show('signin', /expired|invalid/i.test(ret.error_description || '') || ret.error_code === 'otp_expired' ? 'That link has expired. Tap “Forgot password?” to get a new one.' : 'That link didn’t work. Tap “Forgot password?” to get a new one.');
return;
}
if (!isOwner(ses.user)) {
deny();
return;
}
S.me = ses.user.email || '';
if (ret.type === 'invite' || ret.type === 'recovery')
show('newpass');
else
enter(ses.user);
}, function () { settle(); show('signin', NO_NET); });
}
else if (STANDALONE) {
ow.hidden = false;
start();
}
if (!STANDALONE)
addEventListener('hashchange', route);
if (!STANDALONE && !ret)
route();
document.addEventListener('keydown', function (e) {
if (e.key === 'Escape' && !dlg.hidden) {
e.preventDefault();
closeDlg();
}
});
})();