'use strict';

const os = require('node:os');
const path = require('node:path');
const { openDb } = require('./lib/db');
const { createApp, localDate } = require('./lib/app');
const { dailyBackup } = require('./lib/backup');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = reachable from phones on the same Wi-Fi
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'solution.db');
const TIME_ZONE = process.env.SCHOOL_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DATA_FILE), 'backups');

const db = openDb(DATA_FILE);
const app = createApp({
  db,
  timeZone: TIME_ZONE,
  secureCookies: process.env.COOKIE_SECURE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
});

// One automatic backup per day (last 30 kept), checked at start-up and hourly.
function backupNow() {
  try { dailyBackup(db, BACKUP_DIR, localDate(TIME_ZONE)); } catch (err) { console.error('  Backup failed:', err.message); }
}
backupNow();
setInterval(backupNow, 60 * 60 * 1000).unref();

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Solution is running.');
  console.log('');
  console.log(`  On this computer:  http://localhost:${PORT}`);
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  for (const ip of lan) console.log(`  On your phone:     http://${ip}:${PORT}   (phone must be on the same Wi-Fi)`);
  console.log('');
  console.log(`  School time zone:  ${TIME_ZONE}`);
  console.log(`  Data is saved in:  ${DATA_FILE}`);
  console.log(`  Daily backups in:  ${BACKUP_DIR}`);
  console.log('  Keep this window open while Solution is in use. Press Ctrl+C to stop.');
  console.log('');
});
