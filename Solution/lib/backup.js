'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Writes a consistent copy of the live database to `file` (safe while in use).
function snapshot(db, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}

// Keeps one backup per day in `dir`, deleting all but the newest `keep`.
function dailyBackup(db, dir, day, keep = 30) {
  const file = path.join(dir, `solution-${day}.db`);
  if (!fs.existsSync(file)) snapshot(db, file);
  const old = fs.readdirSync(dir).filter((f) => /^solution-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return file;
}

module.exports = { snapshot, dailyBackup };
