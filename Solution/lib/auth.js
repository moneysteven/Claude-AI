'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE = 'solution_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one school day, roughly

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

function sessionCookie(token, { secure, clear = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${clear ? 0 : Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function userFromRequest(db, req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, s.token_hash
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(sha256(token), Date.now());
  return row || null;
}

function destroySession(db, req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

// Simple lockout: 5 failed logins for a username/IP pair locks it for 15 minutes.
class LoginLimiter {
  constructor({ maxFails = 5, lockMs = 15 * 60 * 1000 } = {}) {
    this.maxFails = maxFails;
    this.lockMs = lockMs;
    this.entries = new Map();
  }
  key(ip, username) { return `${ip}|${String(username).toLowerCase()}`; }
  isLocked(ip, username) {
    const e = this.entries.get(this.key(ip, username));
    if (!e) return false;
    if (e.lockedUntil && e.lockedUntil > Date.now()) return true;
    if (e.lockedUntil) this.entries.delete(this.key(ip, username));
    return false;
  }
  fail(ip, username) {
    const k = this.key(ip, username);
    const e = this.entries.get(k) || { fails: 0, lockedUntil: 0 };
    e.fails += 1;
    if (e.fails >= this.maxFails) e.lockedUntil = Date.now() + this.lockMs;
    this.entries.set(k, e);
  }
  succeed(ip, username) { this.entries.delete(this.key(ip, username)); }
}

module.exports = {
  hashPassword,
  verifyPassword,
  passwordProblem,
  createSession,
  sessionCookie,
  userFromRequest,
  destroySession,
  LoginLimiter,
};
