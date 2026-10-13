// Password-protected dashboard: leads, bookings, campaigns, do-not-call list.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const store = require('./store');
const phone = require('./phone');
const campaign = require('./campaign');
const { getClient, isConfigured } = require('./twilio-client');
const events = require('./events');

const router = express.Router();
const draftFile = path.join(config.dataDir, 'contacts-draft.txt');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

router.use((req, res, next) => {
  const [scheme, encoded] = (req.get('Authorization') || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
    if (safeEqual(user, config.admin.user) && safeEqual(rest.join(':'), config.admin.password)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Selfie TV Boss Admin"').status(401).send('Login required');
});

// Block form posts coming from other websites.
router.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const origin = req.get('Origin') || req.get('Referer') || '';
  if (origin && !origin.startsWith(`${req.protocol}://${req.get('host')}`) && !origin.startsWith(config.publicUrl)) {
    return res.status(403).send('Forbidden');
  }
  next();
});
router.use(express.urlencoded({ extended: false, limit: '8mb' })); // room for an event flyer photo

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: config.calling.timezone, dateStyle: 'medium', timeStyle: 'short' }) : '';

function flashRedirect(res, msg, hash = '') {
  res.redirect(`/admin?msg=${encodeURIComponent(msg)}${hash}`);
}

const eventDate = (e) =>
  new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const eventTime = (e) => {
  if (!e.time) return '';
  const [h, m] = e.time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

function eventsCard(editId) {
  const all = events.sortByDate(store.readAll('events'));
  const t = events.today();
  const upcoming = all.filter((e) => e.date >= t);
  const past = all.filter((e) => e.date < t).reverse();
  const ev = all.find((e) => e.id === editId) || {};
  const row = (e) => `<li class="event-row">
      ${e.flyer ? `<img src="/flyers/${esc(e.flyer)}" alt="">` : '<div class="no-flyer">🎤</div>'}
      <div class="event-info">
        <strong>${esc(e.title)}</strong>
        <small>${esc(eventDate(e))}${e.time ? ` · ${esc(eventTime(e))}` : ''}${e.venue ? ` · ${esc(e.venue)}` : ''}${e.city ? `, ${esc(e.city)}` : ''}</small>
        ${e.role ? `<span class="tag">${esc(e.role)}</span>` : ''}
      </div>
      <div class="event-actions">
        <a class="btn-link" href="/admin?edit=${esc(e.id)}#events">Edit</a>
        <form method="post" action="/admin/events/${esc(e.id)}/delete" onsubmit="return confirm('Delete this event?')"><button class="link-danger">Delete</button></form>
      </div>
    </li>`;

  return `<section class="card" id="events">
  <h2>🎤 Upcoming events <small>(shown on the website; past events hide automatically)</small></h2>
  <form method="post" action="/admin/events" id="event-form" class="event-form">
    <input type="hidden" name="id" value="${esc(ev.id)}">
    <input type="hidden" name="flyerData" id="flyer-data">
    <div class="grid">
      <label>Event name *<input name="title" required maxlength="120" value="${esc(ev.title)}"></label>
      <label>Date *<input type="date" name="date" required value="${esc(ev.date)}"></label>
      <label>Start time<input type="time" name="time" value="${esc(ev.time)}"></label>
      <label>Selfie TV Boss is…<select name="role"><option value="">(not shown)</option>${events.ROLES.map((r) => `<option${ev.role === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <label>Venue<input name="venue" maxlength="150" value="${esc(ev.venue)}"></label>
      <label>Town / city<input name="city" maxlength="80" value="${esc(ev.city)}"></label>
      <label class="full">Tickets / info link<input type="url" name="ticketUrl" placeholder="https://" value="${esc(ev.ticketUrl)}"></label>
      <label class="full">Description<textarea name="description" rows="3" maxlength="1000">${esc(ev.description)}</textarea></label>
      <label class="full">Flyer photo <small>(optional)</small><input type="file" accept="image/*" id="flyer-file"></label>
      ${ev.flyer ? `<div class="full current-flyer"><img src="/flyers/${esc(ev.flyer)}" alt=""><label class="check"><input type="checkbox" name="removeFlyer"> Remove this flyer</label></div>` : ''}
    </div>
    <div class="row">
      <button id="event-submit">${ev.id ? 'Save changes' : 'Add event'}</button>
      ${ev.id ? '<a class="btn-link" href="/admin#events">Cancel</a>' : ''}
      <span class="hint" id="flyer-status"></span>
    </div>
  </form>
  ${upcoming.length ? `<ul class="events">${upcoming.map(row).join('')}</ul>` : '<p class="empty">No upcoming events. Add one above and it appears on the website straight away.</p>'}
  ${past.length ? `<details><summary>Past events (${past.length})</summary><ul class="events past">${past.map(row).join('')}</ul></details>` : ''}
</section>
<script>
// Shrink the flyer photo on the phone before uploading, so it's fast.
(function () {
  var file = document.getElementById('flyer-file');
  var out = document.getElementById('flyer-data');
  var btn = document.getElementById('event-submit');
  var status = document.getElementById('flyer-status');
  file.addEventListener('change', function () {
    out.value = '';
    var f = file.files[0];
    if (!f) { status.textContent = ''; return; }
    btn.disabled = true;
    status.textContent = 'Preparing flyer…';
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      out.value = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      btn.disabled = false;
      status.textContent = 'Flyer ready ✓';
    };
    img.onerror = function () { btn.disabled = false; status.textContent = 'Could not read that image, try another.'; };
    img.src = URL.createObjectURL(f);
  });
})();
</script>`;
}

router.get('/', (req, res) => {
  const calls = store.readAll('calls').slice().reverse();
  const dialed = Object.fromEntries(store.readAll('dialed').map((d) => [d.callSid, d]));
  const bookings = store.readAll('bookings').slice().reverse();
  const dnc = store.readAll('do-not-call').slice().reverse();
  const leads = calls.filter((c) => c.service);
  const s = campaign.state;
  let draft = '';
  try { draft = fs.readFileSync(draftFile, 'utf8'); } catch { /* none saved yet */ }

  const warnings = [];
  if (config.admin.password === 'change-me-now') warnings.push('Change ADMIN_PASSWORD in your .env before going live.');
  if (!isConfigured()) warnings.push('Twilio is not set up yet — calls are disabled. You can still do test runs.');
  if (/localhost|example\.com/.test(config.publicUrl)) warnings.push(`PUBLIC_URL is "${config.publicUrl}" — Twilio can't reach that. Use your ngrok or live URL.`);

  const leadRows = leads.map((c) => {
    const d = dialed[c.callSid] || {};
    return `<tr>
      <td>${esc(when(c.updatedAt || c.createdAt))}</td>
      <td><strong>${esc(d.name || '')}</strong>${d.company ? `<br><small>${esc(d.company)}</small>` : ''}</td>
      <td><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td>
      <td><span class="tag">${esc(c.service)}</span></td>
      <td>${esc(c.status)}</td>
      <td>${c.recordingUrl ? `<audio controls preload="none" src="${esc(c.recordingUrl)}"></audio>` : '—'}</td>
    </tr>`;
  }).join('');

  const bookingRows = bookings.map((b) => `<tr>
      <td>${esc(when(b.createdAt))}</td>
      <td><strong>${esc(b.name)}</strong></td>
      <td>${b.phone ? `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}${b.email ? `<br><a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</td>
      <td>${b.services.map((x) => `<span class="tag">${esc(x)}</span>`).join(' ')}</td>
      <td>${esc(b.eventName)}${b.eventDate ? `<br><small>${esc(b.eventDate)}</small>` : ''}${b.venue ? `<br><small>${esc(b.venue)}</small>` : ''}</td>
      <td class="msg">${esc(b.message)}</td>
    </tr>`).join('');

  const callRows = calls.slice(0, 100).map((c) => `<tr>
      <td>${esc(when(c.createdAt))}</td>
      <td>${esc((dialed[c.callSid] || {}).name || '')}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.direction)}</td>
      <td>${esc(c.status)}</td>
      <td>${esc(c.durationSeconds ? `${c.durationSeconds}s` : '')}</td>
    </tr>`).join('');

  res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${s.running ? '<meta http-equiv="refresh" content="10">' : ''}
<title>Boss Dashboard — Selfie TV Boss</title>
<link rel="icon" href="/icon.svg">
<link rel="stylesheet" href="/css/admin.css">
</head><body>
<header><a href="/" class="brand">SELFIE TV <span>BOSS</span></a><span>Dashboard</span></header>
<main>
${req.query.msg ? `<p class="flash">${esc(req.query.msg)}</p>` : ''}
${warnings.map((w) => `<p class="warn">⚠️ ${esc(w)}</p>`).join('')}

<section class="stats">
  <div><b>${leads.length}</b><span>Interested callers</span></div>
  <div><b>${leads.filter((c) => c.recordingUrl).length}</b><span>Voice messages</span></div>
  <div><b>${bookings.length}</b><span>Website bookings</span></div>
  <div><b>${dnc.length}</b><span>Opted out</span></div>
</section>

<section class="card">
  <h2>📞 Call campaign</h2>
  <p class="status ${s.running ? 'live' : ''}">${s.running ? `● RUNNING${s.dryRun ? ' (test run)' : ''}` : 'Not running'} — ${s.processed}/${s.total} processed, ${s.dialed} ${s.dryRun ? 'would be called' : 'called'}, ${s.skipped} skipped</p>
  ${s.running ? '<form method="post" action="/admin/campaign/stop"><button class="danger">Stop campaign</button></form>' : `
  <form method="post" action="/admin/campaign/start">
    <label for="contacts">Contacts — one per line: <code>name,phone,company,notes</code> (or just phone numbers)</label>
    <textarea id="contacts" name="contacts" rows="8" placeholder="name,phone,company,notes&#10;Jane Brown,876-555-0101,Vibez Promotions,Summer fest promoter&#10;8765550102">${esc(draft)}</textarea>
    <label class="check"><input type="checkbox" name="dryRun" checked> Test run only (checks the list, makes no calls)</label>
    <p class="hint">Calls only go out ${esc(config.calling.startHour)}:00–${esc(config.calling.endHour)}:00 (${esc(config.calling.timezone)}), one every ${esc(config.calling.delaySeconds)}s. Opted-out numbers and anyone called in the last ${esc(config.calling.recallAfterDays)} days are skipped automatically.</p>
    <button>Start</button>
  </form>`}
  <div class="row">
    <form method="post" action="/admin/test-call"><button class="ghost" ${config.ownerPhone ? '' : 'disabled'}>📲 Call my phone to test${config.ownerPhone ? ` (${esc(config.ownerPhone)})` : ' — set OWNER_PHONE'}</button></form>
  </div>
  ${s.log.length ? `<pre class="log">${s.log.map(esc).join('\n')}</pre>` : ''}
</section>

<section class="card">
  <h2>🔥 Interested callers</h2>
  ${leads.length ? `<div class="table"><table><thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Wants</th><th>Status</th><th>Voice message</th></tr></thead><tbody>${leadRows}</tbody></table></div>` : '<p class="empty">No leads yet — they appear here when someone presses a service number.</p>'}
</section>

${eventsCard(req.query.edit)}

<section class="card">
  <h2>🗓️ Website booking requests</h2>
  ${bookings.length ? `<div class="table"><table><thead><tr><th>When</th><th>Name</th><th>Contact</th><th>Services</th><th>Event</th><th>Message</th></tr></thead><tbody>${bookingRows}</tbody></table></div>` : '<p class="empty">No bookings yet.</p>'}
</section>

<section class="card">
  <h2>📋 Call history <small>(latest 100)</small></h2>
  ${calls.length ? `<div class="table"><table><thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Direction</th><th>Result</th><th>Length</th></tr></thead><tbody>${callRows}</tbody></table></div>` : '<p class="empty">No calls yet.</p>'}
</section>

<section class="card">
  <h2>🚫 Do-not-call list</h2>
  <form method="post" action="/admin/dnc" class="row">
    <input name="phone" placeholder="876-555-0101" inputmode="tel" required>
    <button>Add number</button>
  </form>
  ${dnc.length ? `<ul class="dnc">${dnc.map((d) => `<li>${esc(d.phone)} <small>${esc(d.source)} · ${esc(when(d.createdAt))}</small></li>`).join('')}</ul>` : '<p class="empty">Nobody has opted out.</p>'}
</section>
</main>
</body></html>`);
});

router.post('/campaign/start', (req, res) => {
  const text = req.body.contacts || '';
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(draftFile, text);
  try {
    campaign.start(text, { dryRun: req.body.dryRun === 'on' });
    flashRedirect(res, req.body.dryRun === 'on' ? 'Test run started — no calls will be made.' : 'Campaign started!');
  } catch (err) {
    flashRedirect(res, err.message);
  }
});

router.post('/campaign/stop', (req, res) => {
  campaign.stop();
  flashRedirect(res, 'Stopping after the current call…');
});

router.post('/test-call', async (req, res) => {
  try {
    if (!config.ownerPhone) throw new Error('Set OWNER_PHONE in .env first.');
    await getClient().calls.create({
      to: config.ownerPhone,
      from: config.twilio.phoneNumber,
      url: `${config.publicUrl}/voice/answer`,
      statusCallback: `${config.publicUrl}/voice/status`,
      statusCallbackEvent: ['completed'],
    });
    flashRedirect(res, `Calling ${config.ownerPhone} now — pick up to hear the menu.`);
  } catch (err) {
    flashRedirect(res, `Test call failed: ${err.message}`);
  }
});

router.post('/events', (req, res) => {
  try {
    const e = events.saveEvent(req.body);
    flashRedirect(res, req.body.id ? `Saved "${e.title}".` : `"${e.title}" added to the website.`, '#events');
  } catch (err) {
    flashRedirect(res, err.message, '#events');
  }
});

router.post('/events/:id/delete', (req, res) => {
  events.deleteEvent(req.params.id);
  flashRedirect(res, 'Event deleted.', '#events');
});

router.post('/dnc', (req, res) => {
  const n = phone.normalize(req.body.phone);
  if (!n) return flashRedirect(res, 'That phone number doesn\'t look right.');
  phone.optOut(n, 'added by admin');
  flashRedirect(res, `${n} added to the do-not-call list.`);
});

module.exports = router;
