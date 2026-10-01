'use strict';

const path = require('node:path');
const express = require('express');
const { tx } = require('./db');
const auth = require('./auth');

function localDate(timeZone, date = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return date.toLocaleDateString('en-CA', { timeZone });
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const clean = (v, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isUniqueViolation = (err) => /UNIQUE constraint failed/i.test(String(err && err.message));

// Minimal CSV parser: handles quoted fields, escaped quotes and CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// Prevents spreadsheet formula injection when staff open the export in Excel.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function createApp({ db, timeZone, secureCookies = false, trustProxy = false }) {
  const app = express();
  const limiter = new auth.LoginLimiter();
  const today = () => localDate(timeZone);
  const audit = (userId, action, details = '') =>
    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, details);

  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

  // ---- API plumbing ------------------------------------------------------
  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    // CSRF defence (on top of SameSite=Strict cookies): writes must be JSON
    // and, when the browser says where they came from, from this same site.
    if (!req.is('application/json')) return res.status(415).json({ error: 'Expected JSON.' });
    const origin = req.headers.origin;
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { host = null; }
      if (host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request blocked.' });
    }
    next();
  });
  api.use(express.json({ limit: '2mb' }));
  api.use((req, res, next) => {
    req.user = auth.userFromRequest(db, req);
    next();
  });

  const requireUser = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Please sign in.' });
  const requireAdmin = (req, res, next) =>
    !req.user ? res.status(401).json({ error: 'Please sign in.' })
      : req.user.role !== 'admin' ? res.status(403).json({ error: 'Administrators only.' })
        : next();

  const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const secure = (req) => secureCookies || req.secure;

  // ---- First-run setup & sign-in ---------------------------------------
  api.get('/status', (req, res) => {
    res.json({
      needsSetup: userCount() === 0,
      user: req.user ? { id: req.user.id, name: req.user.name, username: req.user.username, role: req.user.role } : null,
      today: today(),
      timeZone,
    });
  });

  api.post('/setup', (req, res) => {
    const name = clean(req.body.name);
    const username = clean(req.body.username, 50);
    const { password } = req.body;
    if (!name || !username) return res.status(400).json({ error: 'Name and username are required.' });
    const problem = auth.passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    let userId;
    try {
      userId = tx(db, () => {
        if (userCount() > 0) throw Object.assign(new Error('done'), { setupDone: true });
        return Number(db.prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)')
          .run(username, name, auth.hashPassword(password), 'admin').lastInsertRowid);
      });
    } catch (err) {
      if (err.setupDone) return res.status(409).json({ error: 'Setup has already been completed.' });
      throw err;
    }
    audit(userId, 'setup', `Created first administrator "${username}"`);
    res.set('Set-Cookie', auth.sessionCookie(auth.createSession(db, userId), { secure: secure(req) }));
    res.status(201).json({ ok: true });
  });

  api.post('/login', (req, res) => {
    const username = clean(req.body.username, 50);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (limiter.isLocked(req.ip, username)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    if (!user || !auth.verifyPassword(password, user.password_hash)) {
      limiter.fail(req.ip, username);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    limiter.succeed(req.ip, username);
    audit(user.id, 'login');
    res.set('Set-Cookie', auth.sessionCookie(auth.createSession(db, user.id), { secure: secure(req) }));
    res.json({ ok: true });
  });

  api.post('/logout', (req, res) => {
    auth.destroySession(db, req);
    res.set('Set-Cookie', auth.sessionCookie('', { secure: secure(req), clear: true }));
    res.json({ ok: true });
  });

  api.post('/me/password', requireUser, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!auth.verifyPassword(String(currentPassword || ''), row.password_hash)) {
      return res.status(400).json({ error: 'Current password is wrong.' });
    }
    const problem = auth.passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(newPassword), req.user.id);
    // Sign out every other device that was using the old password.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, req.user.token_hash);
    audit(req.user.id, 'change_password');
    res.json({ ok: true });
  });

  // ---- Products ----------------------------------------------------------
  api.get('/products', requireUser, (req, res) => {
    const all = req.query.all === '1' && req.user.role === 'admin';
    res.json(db.prepare(`SELECT id, name, active FROM products ${all ? '' : 'WHERE active = 1'} ORDER BY name`).all());
  });

  api.post('/products', requireAdmin, (req, res) => {
    const name = clean(req.body.name);
    if (!name) return res.status(400).json({ error: 'Product name is required.' });
    try {
      const id = db.prepare('INSERT INTO products (name) VALUES (?)').run(name).lastInsertRowid;
      audit(req.user.id, 'add_product', name);
      res.status(201).json({ id: Number(id), name, active: 1 });
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'A product with that name already exists.' });
      throw err;
    }
  });

  api.patch('/products/:id', requireAdmin, (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    const name = req.body.name !== undefined ? clean(req.body.name) : product.name;
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : product.active;
    if (!name) return res.status(400).json({ error: 'Product name is required.' });
    try {
      db.prepare('UPDATE products SET name = ?, active = ? WHERE id = ?').run(name, active, product.id);
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'A product with that name already exists.' });
      throw err;
    }
    audit(req.user.id, 'edit_product', `${product.name} -> ${name}, active=${active}`);
    res.json({ id: product.id, name, active });
  });

  // ---- Students ----------------------------------------------------------
  const studentFields = (body) => ({
    student_number: clean(body.student_number, 50),
    first_name: clean(body.first_name),
    last_name: clean(body.last_name),
    grade: clean(body.grade, 20),
    program: clean(body.program),
  });

  api.get('/students', requireAdmin, (req, res) => {
    const q = clean(req.query.q);
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const rows = db.prepare(`
      SELECT * FROM students
      WHERE ? = '' OR student_number LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\'
         OR last_name LIKE ? ESCAPE '\\' OR (first_name || ' ' || last_name) LIKE ? ESCAPE '\\'
      ORDER BY last_name, first_name LIMIT 500
    `).all(q, like, like, like, like);
    const total = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
    res.json({ students: rows, total });
  });

  api.post('/students', requireAdmin, (req, res) => {
    const s = studentFields(req.body);
    if (!s.student_number || !s.first_name || !s.last_name) {
      return res.status(400).json({ error: 'School ID number, first name and last name are required.' });
    }
    try {
      const id = db.prepare(`INSERT INTO students (student_number, first_name, last_name, grade, program)
        VALUES (?, ?, ?, ?, ?)`).run(s.student_number, s.first_name, s.last_name, s.grade, s.program).lastInsertRowid;
      audit(req.user.id, 'add_student', s.student_number);
      res.status(201).json({ id: Number(id), ...s, active: 1 });
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'A student with that School ID already exists.' });
      throw err;
    }
  });

  api.patch('/students/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Student not found.' });
    const s = { ...existing };
    for (const [k, v] of Object.entries(studentFields(req.body))) if (req.body[k] !== undefined) s[k] = v;
    if (req.body.active !== undefined) s.active = req.body.active ? 1 : 0;
    if (!s.student_number || !s.first_name || !s.last_name) {
      return res.status(400).json({ error: 'School ID number, first name and last name are required.' });
    }
    try {
      db.prepare(`UPDATE students SET student_number = ?, first_name = ?, last_name = ?, grade = ?, program = ?, active = ?
        WHERE id = ?`).run(s.student_number, s.first_name, s.last_name, s.grade, s.program, s.active, s.id);
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'A student with that School ID already exists.' });
      throw err;
    }
    audit(req.user.id, 'edit_student', `${existing.student_number} active=${s.active}`);
    res.json(s);
  });

  // CSV columns: school_id, first_name, last_name, grade, program (header row optional).
  // Existing School IDs are updated; new ones are added.
  api.post('/students/import', requireAdmin, (req, res) => {
    const rows = parseCsv(String(req.body.csv || ''));
    if (rows.length && /id|number/i.test(rows[0][0]) && /first/i.test(rows[0][1] || '')) rows.shift();
    const errors = [];
    let added = 0, updated = 0;
    tx(db, () => {
      const find = db.prepare('SELECT id FROM students WHERE student_number = ?');
      const insert = db.prepare(`INSERT INTO students (student_number, first_name, last_name, grade, program) VALUES (?, ?, ?, ?, ?)`);
      const update = db.prepare(`UPDATE students SET first_name = ?, last_name = ?, grade = ?, program = ?, active = 1 WHERE id = ?`);
      rows.forEach((r, i) => {
        const [student_number, first_name, last_name, grade, program] =
          [r[0], r[1], r[2], r[3], r[4]].map((v, j) => clean(v || '', j === 0 ? 50 : 100));
        if (!student_number || !first_name || !last_name) {
          errors.push(`Line ${i + 1}: needs School ID, first name and last name.`);
          return;
        }
        const existing = find.get(student_number);
        if (existing) { update.run(first_name, last_name, grade, program, existing.id); updated++; }
        else { insert.run(student_number, first_name, last_name, grade, program); added++; }
      });
    });
    audit(req.user.id, 'import_students', `added=${added} updated=${updated} errors=${errors.length}`);
    res.json({ added, updated, errors: errors.slice(0, 50), errorCount: errors.length });
  });

  api.get('/students/:id/history', requireAdmin, (req, res) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const history = db.prepare(`
      SELECT d.id, d.served_on, d.served_at, d.voided, d.void_reason, p.name AS product, u.name AS served_by
      FROM distributions d JOIN products p ON p.id = d.product_id JOIN users u ON u.id = d.served_by
      WHERE d.student_id = ? ORDER BY d.served_at DESC LIMIT 365
    `).all(student.id);
    res.json({ student, history });
  });

  // ---- Serving (the main screen) ---------------------------------------
  const receivedToday = (studentId) => db.prepare(`
    SELECT d.id, d.served_at, p.id AS product_id, p.name AS product, u.name AS served_by
    FROM distributions d JOIN products p ON p.id = d.product_id JOIN users u ON u.id = d.served_by
    WHERE d.student_id = ? AND d.served_on = ? AND d.voided = 0 ORDER BY d.served_at
  `).all(studentId, today());

  const publicStudent = (s) => ({
    id: s.id, student_number: s.student_number, first_name: s.first_name,
    last_name: s.last_name, grade: s.grade, program: s.program, active: s.active,
  });

  api.get('/lookup/:number', requireUser, (req, res) => {
    const student = db.prepare('SELECT * FROM students WHERE student_number = ?').get(clean(req.params.number, 50));
    if (!student) return res.status(404).json({ result: 'not_found', error: 'No student with that School ID.' });
    res.json({ student: publicStudent(student), today: receivedToday(student.id) });
  });

  api.post('/serve', requireUser, (req, res) => {
    const number = clean(String(req.body.studentNumber ?? ''), 50);
    const productId = Number(req.body.productId);
    if (!number) return res.status(400).json({ result: 'error', error: 'Enter or scan a School ID.' });

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
    if (!product) return res.status(400).json({ result: 'error', error: 'Choose a product first.' });

    const student = db.prepare('SELECT * FROM students WHERE student_number = ?').get(number);
    if (!student) {
      return res.status(404).json({ result: 'not_found', error: `School ID "${number}" is not on the program list.` });
    }
    if (!student.active) {
      return res.status(403).json({
        result: 'not_eligible', student: publicStudent(student),
        error: `${student.first_name} ${student.last_name} is not currently active on the program.`,
      });
    }

    const day = today();
    try {
      const servedAt = new Date().toISOString();
      const id = db.prepare(`INSERT INTO distributions (student_id, product_id, served_on, served_at, served_by)
        VALUES (?, ?, ?, ?, ?)`).run(student.id, product.id, day, servedAt, req.user.id).lastInsertRowid;
      res.status(201).json({
        result: 'served', id: Number(id), served_at: servedAt,
        student: publicStudent(student), product: { id: product.id, name: product.name },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const previous = db.prepare(`
        SELECT d.served_at, u.name AS served_by FROM distributions d JOIN users u ON u.id = d.served_by
        WHERE d.student_id = ? AND d.product_id = ? AND d.served_on = ? AND d.voided = 0
      `).get(student.id, product.id, day);
      res.status(409).json({
        result: 'duplicate', student: publicStudent(student), product: { id: product.id, name: product.name }, previous,
        error: `${student.first_name} ${student.last_name} already received ${product.name} today.`,
      });
    }
  });

  // ---- Records & reports -----------------------------------------------
  function distributionQuery(q) {
    const from = isDate(q.from) ? q.from : today();
    const to = isDate(q.to) ? q.to : from;
    const params = [from, to];
    let where = 'd.served_on BETWEEN ? AND ?';
    if (q.productId) { where += ' AND d.product_id = ?'; params.push(Number(q.productId)); }
    if (q.includeVoided !== '1') where += ' AND d.voided = 0';
    return { from, to, where, params };
  }

  const distributionSelect = (where) => `
    SELECT d.id, d.served_on, d.served_at, d.voided, d.void_reason,
           s.student_number, s.first_name, s.last_name, s.grade, s.program,
           p.name AS product, u.name AS served_by
    FROM distributions d
    JOIN students s ON s.id = d.student_id
    JOIN products p ON p.id = d.product_id
    JOIN users u ON u.id = d.served_by
    WHERE ${where} ORDER BY d.served_at DESC`;

  api.get('/distributions', requireUser, (req, res) => {
    const q = distributionQuery(req.query);
    // Staff can see today's list; date ranges are for administrators.
    if (req.user.role !== 'admin' && (q.from !== today() || q.to !== today())) {
      return res.status(403).json({ error: 'Administrators only.' });
    }
    const rows = db.prepare(`${distributionSelect(q.where)} LIMIT 5000`).all(...q.params);
    const summary = db.prepare(`
      SELECT p.name AS product, COUNT(*) AS count, COUNT(DISTINCT d.student_id) AS students
      FROM distributions d JOIN products p ON p.id = d.product_id
      WHERE ${q.where.replace(' AND d.voided = 0', '')} AND d.voided = 0 GROUP BY p.name ORDER BY p.name
    `).all(...q.params);
    res.json({ from: q.from, to: q.to, rows, summary });
  });

  api.get('/distributions.csv', requireAdmin, (req, res) => {
    const q = distributionQuery(req.query);
    const rows = db.prepare(distributionSelect(q.where)).all(...q.params);
    const header = ['Date', 'Time (UTC)', 'School ID', 'First name', 'Last name', 'Grade', 'Program', 'Product', 'Served by', 'Voided', 'Void reason'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([r.served_on, r.served_at, r.student_number, r.first_name, r.last_name, r.grade, r.program,
        r.product, r.served_by, r.voided ? 'yes' : '', r.void_reason || ''].map(csvCell).join(','));
    }
    audit(req.user.id, 'export_csv', `${q.from}..${q.to}`);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="solution-${q.from}_to_${q.to}.csv"`,
    });
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  });

  // Undo a mistaken entry. The record is kept (marked void) for the audit trail.
  api.post('/distributions/:id/void', requireAdmin, (req, res) => {
    const reason = clean(req.body.reason, 200);
    if (!reason) return res.status(400).json({ error: 'Please give a reason.' });
    const r = db.prepare(`UPDATE distributions SET voided = 1, void_reason = ?, voided_by = ?, voided_at = ?
      WHERE id = ? AND voided = 0`).run(reason, req.user.id, new Date().toISOString(), req.params.id);
    if (!r.changes) return res.status(404).json({ error: 'Record not found or already voided.' });
    audit(req.user.id, 'void_distribution', `#${req.params.id}: ${reason}`);
    res.json({ ok: true });
  });

  // ---- Staff accounts ---------------------------------------------------
  api.get('/users', requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT id, username, name, role, active, created_at FROM users ORDER BY name').all());
  });

  api.post('/users', requireAdmin, (req, res) => {
    const name = clean(req.body.name);
    const username = clean(req.body.username, 50);
    const role = req.body.role === 'admin' ? 'admin' : 'staff';
    if (!name || !username) return res.status(400).json({ error: 'Name and username are required.' });
    const problem = auth.passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ error: problem });
    try {
      const id = db.prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(username, name, auth.hashPassword(req.body.password), role).lastInsertRowid;
      audit(req.user.id, 'add_user', `${username} (${role})`);
      res.status(201).json({ id: Number(id), username, name, role, active: 1 });
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'That username is taken.' });
      throw err;
    }
  });

  api.patch('/users/:id', requireAdmin, (req, res) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const role = req.body.role !== undefined ? (req.body.role === 'admin' ? 'admin' : 'staff') : target.role;
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : target.active;
    if (target.id === req.user.id && (role !== 'admin' || !active)) {
      return res.status(400).json({ error: "You can't remove your own administrator access." });
    }
    if (req.body.password !== undefined) {
      const problem = auth.passwordProblem(req.body.password);
      if (problem) return res.status(400).json({ error: problem });
    }
    tx(db, () => {
      db.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').run(role, active, target.id);
      if (req.body.password !== undefined) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(req.body.password), target.id);
      }
      if (!active || req.body.password !== undefined) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    });
    audit(req.user.id, 'edit_user', `${target.username} role=${role} active=${active}${req.body.password !== undefined ? ' password reset' : ''}`);
    res.json({ id: target.id, username: target.username, name: target.name, role, active });
  });

  api.get('/audit', requireAdmin, (req, res) => {
    res.json(db.prepare(`SELECT a.at, a.action, a.details, u.name AS user FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300`).all());
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  app.use('/api', api);
  return app;
}

module.exports = { createApp, localDate, parseCsv, csvCell };
