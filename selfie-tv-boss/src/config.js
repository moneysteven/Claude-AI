const path = require('path');

const env = process.env;
const ROOT = path.join(__dirname, '..');

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// The app's public address. Render fills in RENDER_EXTERNAL_URL by itself,
// so a Render deploy works without setting PUBLIC_URL.
const publicUrl = (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/+$/, '');

module.exports = {
  ROOT,
  port: int(env.PORT, 3000),
  publicUrl,
  // The website address texted to callers (defaults to this app's address).
  websiteUrl: (env.WEBSITE_URL || publicUrl).replace(/\/+$/, ''),
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  audioDir: path.join(ROOT, 'public', 'audio'),
  scriptFile: path.join(ROOT, 'call-script.json'),

  admin: {
    user: env.ADMIN_USER || 'boss',
    password: env.ADMIN_PASSWORD || 'change-me-now',
  },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID || '',
    authToken: env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: env.TWILIO_PHONE_NUMBER || '',
    validate: env.TWILIO_VALIDATE_REQUESTS !== 'false',
  },

  ownerPhone: env.OWNER_PHONE || '',
  smsNotifyOwner: env.SMS_NOTIFY_OWNER !== 'false',
  transcribeAnswers: env.TRANSCRIBE_ANSWERS !== 'false',

  calling: {
    defaultCountryCode: (env.DEFAULT_COUNTRY_CODE || '1').replace(/\D/g, ''),
    timezone: env.TIMEZONE || 'America/Jamaica',
    startHour: int(env.CALL_START_HOUR, 9),
    endHour: int(env.CALL_END_HOUR, 19),
    days: (env.CALL_DAYS || '1,2,3,4,5,6').split(',').map((d) => int(d.trim(), -1)),
    delaySeconds: int(env.CALL_DELAY_SECONDS, 20),
    recallAfterDays: int(env.RECALL_AFTER_DAYS, 30),
  },
};
