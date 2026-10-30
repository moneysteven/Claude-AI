// Tiny file-backed data store: one JSON file per collection in data/.
// Good enough for a pilot at a handful of schools. When you outgrow it,
// swap this file for a real database (Postgres/SQLite) — the rest of the
// app only talks to the functions exported here.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function all(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, "utf8") || "[]");
}

function saveAll(name, items) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file then rename, so a crash mid-write can't leave a
  // half-written (corrupt) JSON file behind.
  const tmp = `${filePath(name)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, filePath(name));
}

function find(name, id) {
  return all(name).find((item) => item.id === id) || null;
}

function upsert(name, item) {
  const items = all(name);
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  saveAll(name, items);
  return item;
}

function append(name, item) {
  const items = all(name);
  items.push(item);
  saveAll(name, items);
  return item;
}

function isSeeded() {
  return fs.existsSync(filePath("students"));
}

module.exports = { all, saveAll, find, upsert, append, isSeeded, DATA_DIR };
