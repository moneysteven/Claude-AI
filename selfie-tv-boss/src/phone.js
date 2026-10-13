const { calling } = require('./config');
const store = require('./store');

// Turn "876-555-1234", "(876) 555 1234", "18765551234" into "+18765551234".
function normalize(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (calling.defaultCountryCode === '1') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return '';
  }
  return `+${calling.defaultCountryCode}${digits.replace(/^0+/, '')}`;
}

function isOptedOut(number) {
  const n = normalize(number);
  return store.readAll('do-not-call').some((e) => e.phone === n);
}

function optOut(number, source) {
  const n = normalize(number);
  if (!n || isOptedOut(n)) return;
  store.append('do-not-call', { phone: n, source, createdAt: new Date().toISOString() });
}

// Is "now" inside the allowed calling window?
function withinCallingHours(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: calling.timezone,
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find((p) => p.type === 'weekday').value
  );
  return calling.days.includes(weekday) && hour >= calling.startHour && hour < calling.endHour;
}

module.exports = { normalize, isOptedOut, optOut, withinCallingHours };
