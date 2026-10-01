'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id             INTEGER PRIMARY KEY,
      student_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
      first_name     TEXT NOT NULL,
      last_name      TEXT NOT NULL,
      grade          TEXT NOT NULL DEFAULT '',
      program        TEXT NOT NULL DEFAULT '',
      active         INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id     INTEGER PRIMARY KEY,
      name   TEXT NOT NULL UNIQUE COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS distributions (
      id          INTEGER PRIMARY KEY,
      student_id  INTEGER NOT NULL REFERENCES students(id),
      product_id  INTEGER NOT NULL REFERENCES products(id),
      served_on   TEXT NOT NULL,              -- school-local date, YYYY-MM-DD
      served_at   TEXT NOT NULL,              -- ISO timestamp (UTC)
      served_by   INTEGER NOT NULL REFERENCES users(id),
      voided      INTEGER NOT NULL DEFAULT 0,
      void_reason TEXT,
      voided_by   INTEGER REFERENCES users(id),
      voided_at   TEXT
    );

    -- The core rule: one non-voided record per student, per product, per day.
    -- Enforced by the database itself, so two staff phones serving the same
    -- student at the same moment cannot both succeed.
    CREATE UNIQUE INDEX IF NOT EXISTS one_per_day
      ON distributions (student_id, product_id, served_on) WHERE voided = 0;
    CREATE INDEX IF NOT EXISTS distributions_by_day ON distributions (served_on);

    CREATE TABLE IF NOT EXISTS audit_log (
      id      INTEGER PRIMARY KEY,
      at      TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER REFERENCES users(id),
      action  TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT ''
    );
  `);

  return db;
}

// Runs fn inside a transaction; rolls back if it throws.
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, tx };
