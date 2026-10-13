// Outbound calling campaign: works through a contact list one call at a
// time, skipping anyone who opted out or was called recently, and only
// dialing during the allowed calling hours.
const config = require('./config');
const store = require('./store');
const phone = require('./phone');
const { getClient } = require('./twilio-client');

const state = {
  running: false,
  stopRequested: false,
  dryRun: false,
  total: 0,
  processed: 0,
  dialed: 0,
  skipped: 0,
  log: [],
  startedAt: null,
};

function log(message) {
  state.log.unshift(`${new Date().toLocaleTimeString('en-US', { timeZone: config.calling.timezone })}  ${message}`);
  state.log.length = Math.min(state.log.length, 200);
}

// Accepts "name,phone,company,notes" CSV (header optional) or one number per line.
function parseContacts(text) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitCsvLine);
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.includes('phone');
  const col = (name, fallback) => (hasHeader ? header.indexOf(name) : fallback);
  const iName = col('name', -1);
  const iPhone = hasHeader ? header.indexOf('phone') : -1;
  const iCompany = col('company', -1);
  const iNotes = col('notes', -1);

  return rows.slice(hasHeader ? 1 : 0).map((cells) => {
    // Without a header, take whichever cell looks like a phone number.
    const rawPhone = iPhone >= 0 ? cells[iPhone] : cells.find((c) => /\d{7,}/.test(c.replace(/\D/g, ''))) || '';
    return {
      name: iName >= 0 ? cells[iName] || '' : cells.find((c) => c !== rawPhone) || '',
      phone: phone.normalize(rawPhone),
      rawPhone,
      company: iCompany >= 0 ? cells[iCompany] || '' : '',
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
    };
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function calledRecently(number) {
  const cutoff = Date.now() - config.calling.recallAfterDays * 24 * 60 * 60 * 1000;
  return store.readAll('dialed').some((d) => d.phone === number && Date.parse(d.createdAt) > cutoff);
}

function skipReason(contact, seen) {
  if (!contact.phone) return `invalid number "${contact.rawPhone}"`;
  if (seen.has(contact.phone)) return 'duplicate in list';
  if (phone.isOptedOut(contact.phone)) return 'on do-not-call list';
  if (calledRecently(contact.phone)) return `already called in the last ${config.calling.recallAfterDays} days`;
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(contacts) {
  const seen = new Set();
  for (const contact of contacts) {
    if (state.stopRequested) { log('Stopped.'); break; }
    if (!state.dryRun && !phone.withinCallingHours()) {
      log(`Outside calling hours (${config.calling.startHour}:00–${config.calling.endHour}:00). Paused — start again later; already-called numbers will be skipped.`);
      break;
    }

    state.processed++;
    const label = contact.name ? `${contact.name} (${contact.phone || contact.rawPhone})` : contact.phone || contact.rawPhone;
    const reason = skipReason(contact, seen);
    seen.add(contact.phone);
    if (reason) { state.skipped++; log(`Skipped ${label}: ${reason}`); continue; }

    if (state.dryRun) { state.dialed++; log(`[test run] Would call ${label}`); continue; }

    try {
      const call = await getClient().calls.create({
        to: contact.phone,
        from: config.twilio.phoneNumber,
        url: `${config.publicUrl}/voice/answer`,
        statusCallback: `${config.publicUrl}/voice/status`,
        statusCallbackEvent: ['completed'],
        machineDetection: 'DetectMessageEnd',
        timeout: 30,
      });
      store.append('dialed', { callSid: call.sid, ...contact, createdAt: new Date().toISOString() });
      state.dialed++;
      log(`Calling ${label}`);
    } catch (err) {
      state.skipped++;
      log(`Could not call ${label}: ${err.message}`);
    }
    await sleep(config.calling.delaySeconds * 1000);
  }
}

function start(text, { dryRun }) {
  if (state.running) throw new Error('A campaign is already running.');
  const contacts = parseContacts(text);
  if (!contacts.length) throw new Error('No contacts found — paste at least one phone number.');
  if (!dryRun) getClient(); // fail fast if Twilio isn't configured

  Object.assign(state, {
    running: true, stopRequested: false, dryRun, total: contacts.length,
    processed: 0, dialed: 0, skipped: 0, log: [], startedAt: new Date().toISOString(),
  });
  log(`${dryRun ? 'Test run' : 'Campaign'} started with ${contacts.length} contact(s).`);

  run(contacts)
    .catch((err) => log(`Campaign error: ${err.message}`))
    .finally(() => {
      state.running = false;
      log(`Finished: ${state.dialed} ${state.dryRun ? 'would be called' : 'called'}, ${state.skipped} skipped.`);
    });
}

function stop() {
  if (state.running) state.stopRequested = true;
}

module.exports = { start, stop, state, parseContacts };
