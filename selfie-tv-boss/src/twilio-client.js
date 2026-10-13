const twilio = require('twilio');
const config = require('./config');

let client;

function isConfigured() {
  return Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Twilio is not set up yet — fill in TWILIO_* values in .env');
  }
  if (!client) client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return client;
}

// Text the owner about a new lead/booking. Never throws: a failed text must
// not break a call or a booking.
async function notifyOwner(body) {
  if (!config.smsNotifyOwner || !config.ownerPhone || !isConfigured()) return;
  try {
    await getClient().messages.create({
      to: config.ownerPhone,
      from: config.twilio.phoneNumber,
      body: body.slice(0, 1500),
    });
  } catch (err) {
    console.error('Could not text owner:', err.message);
  }
}

// Text a caller. Resolves to { ok, error } and never throws: landlines and
// some numbers can't receive texts, and that must not break the call.
async function sendText(to, body) {
  if (!isConfigured()) return { ok: false, error: 'Twilio not set up' };
  try {
    await getClient().messages.create({ to, from: config.twilio.phoneNumber, body: body.slice(0, 600) });
    return { ok: true };
  } catch (err) {
    console.error(`Could not text ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// Express middleware: reject requests that weren't signed by Twilio.
function validateTwilioRequest(req, res, next) {
  if (!config.twilio.validate || !config.twilio.authToken) return next();
  const signature = req.get('X-Twilio-Signature') || '';
  const url = config.publicUrl + req.originalUrl;
  if (twilio.validateRequest(config.twilio.authToken, signature, url, req.body || {})) {
    return next();
  }
  console.warn(`Rejected unsigned request to ${req.originalUrl} (check PUBLIC_URL matches your real address)`);
  return res.status(403).send('Forbidden');
}

module.exports = { isConfigured, getClient, notifyOwner, sendText, validateTwilioRequest };
