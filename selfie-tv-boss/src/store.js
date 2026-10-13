// Tiny JSON-file storage. Every write goes through this one process, so
// there is no locking to worry about. Swap for a real database later if the
// lists grow into the tens of thousands.
const fs = require('fs');
const path = require('path');
const { dataDir, ROOT } = require('./config');

function file(name) {
  return path.join(dataDir, `${name}.json`);
}

// Starting data shipped with the code (data/<name>.seed.json), used until
// the first real save creates the live file.
function seed(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${name}.seed.json`), 'utf8'));
  } catch {
    return [];
  }
}

function readAll(name) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return seed(name);
    throw err;
  }
}

function writeAll(name, items) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file(name)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, file(name));
}

function append(name, item) {
  const items = readAll(name);
  items.push(item);
  writeAll(name, items);
  return item;
}

// Merge `patch` into the first item where item[key] === value, or add it.
function upsert(name, key, value, patch) {
  const items = readAll(name);
  let item = items.find((i) => i[key] === value);
  if (item) {
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  } else {
    item = { [key]: value, createdAt: new Date().toISOString(), ...patch };
    items.push(item);
  }
  writeAll(name, items);
  return item;
}

module.exports = { readAll, writeAll, append, upsert };
