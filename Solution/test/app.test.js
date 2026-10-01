'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../lib/db');
const { createApp, parseCsv, csvCell } = require('../lib/app');

// Starts the app on a random port and returns a small client that keeps cookies.
async function start() {
  const db = openDb(':memory:');
  const server = createApp({ db, timeZone: 'America/Jamaica' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {} } = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    };
  };
  return { db, server, client };
}

test('full serving flow blocks duplicates', async (t) => {
  const { server, client } = await start();
  t.after(() => server.close());
  const admin = client();

  assert.equal((await admin('/api/status')).body.needsSetup, true);
  assert.equal((await admin('/api/setup', { method: 'POST', body: { name: 'Ms Admin', username: 'admin', password: 'short' } })).status, 400);
  assert.equal((await admin('/api/setup', { method: 'POST', body: { name: 'Ms Admin', username: 'admin', password: 'correct horse' } })).status, 201);
  // Setup can only happen once.
  assert.equal((await client()('/api/setup', { method: 'POST', body: { name: 'X', username: 'x', password: 'password123' } })).status, 409);

  const lunch = (await admin('/api/products', { method: 'POST', body: { name: 'Lunch' } })).body;
  const snack = (await admin('/api/products', { method: 'POST', body: { name: 'Snack' } })).body;
  const imp = await admin('/api/students/import', { method: 'POST', body: {
    csv: 'school_id,first_name,last_name,grade,program\n1001,Maria,Brown,4,Grant\n"1002","Andre","Campbell, Jr",5,Grant\n,bad,row\n',
  } });
  assert.deepEqual([imp.body.added, imp.body.updated, imp.body.errorCount], [2, 0, 1]);

  // Staff login
  assert.equal((await admin('/api/users', { method: 'POST', body: { name: 'Mr Staff', username: 'staff', password: 'password123', role: 'staff' } })).status, 201);
  const staff = client();
  assert.equal((await staff('/api/login', { method: 'POST', body: { username: 'staff', password: 'nope' } })).status, 401);
  assert.equal((await staff('/api/login', { method: 'POST', body: { username: 'STAFF', password: 'password123' } })).status, 200);
  assert.equal((await staff('/api/students')).status, 403, 'staff cannot list all students');

  const first = await staff('/api/serve', { method: 'POST', body: { studentNumber: ' 1001 ', productId: lunch.id } });
  assert.equal(first.status, 201);
  assert.equal(first.body.result, 'served');

  const again = await admin('/api/serve', { method: 'POST', body: { studentNumber: '1001', productId: lunch.id } });
  assert.equal(again.status, 409);
  assert.equal(again.body.result, 'duplicate');
  assert.equal(again.body.previous.served_by, 'Mr Staff');

  // A different product the same day is fine.
  assert.equal((await staff('/api/serve', { method: 'POST', body: { studentNumber: '1001', productId: snack.id } })).status, 201);
  assert.equal((await staff('/api/serve', { method: 'POST', body: { studentNumber: '9999', productId: lunch.id } })).body.result, 'not_found');

  // Deactivated students are refused.
  const andre = (await admin('/api/students?q=1002')).body.students[0];
  await admin(`/api/students/${andre.id}`, { method: 'PATCH', body: { active: false } });
  assert.equal((await staff('/api/serve', { method: 'POST', body: { studentNumber: '1002', productId: lunch.id } })).body.result, 'not_eligible');

  const today = await staff('/api/distributions');
  assert.equal(today.body.rows.length, 2);
  assert.equal(today.body.summary.find((s) => s.product === 'Lunch').count, 1);
  assert.equal((await staff('/api/distributions?from=2020-01-01&to=2030-01-01')).status, 403);

  // Undo lets the student be served again; the undone row stays on record.
  assert.equal((await staff(`/api/distributions/${first.body.id}/void`, { method: 'POST', body: { reason: 'x' } })).status, 403);
  assert.equal((await admin(`/api/distributions/${first.body.id}/void`, { method: 'POST', body: { reason: 'Scanned wrong card' } })).status, 200);
  assert.equal((await staff('/api/serve', { method: 'POST', body: { studentNumber: '1001', productId: lunch.id } })).status, 201);
  const all = await admin('/api/distributions?includeVoided=1');
  assert.equal(all.body.rows.length, 3);

  const csv = await admin('/api/distributions.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.body, /Maria/);

  // Disabling a user signs them out.
  const staffId = (await admin('/api/users')).body.find((u) => u.username === 'staff').id;
  await admin(`/api/users/${staffId}`, { method: 'PATCH', body: { active: false } });
  assert.equal((await staff('/api/distributions')).status, 401);
});

test('cross-site and non-JSON writes are rejected', async (t) => {
  const { server, client } = await start();
  t.after(() => server.close());
  const c = client();
  assert.equal((await c('/api/login', { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=a&password=b',
  });
  assert.equal(res.status, 415);
});

test('login lockout after repeated failures', async (t) => {
  const { server, client } = await start();
  t.after(() => server.close());
  const c = client();
  await c('/api/setup', { method: 'POST', body: { name: 'A', username: 'admin', password: 'password123' } });
  const other = client();
  for (let i = 0; i < 5; i++) await other('/api/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } });
  assert.equal((await other('/api/login', { method: 'POST', body: { username: 'admin', password: 'password123' } })).status, 429);
});

test('csv helpers', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n'), [['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
});

test('name search, per-student totals and backups', async (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { dailyBackup } = require('../lib/backup');
  const { db, server, client } = await start();
  t.after(() => server.close());
  const admin = client();
  await admin('/api/setup', { method: 'POST', body: { name: 'A', username: 'admin', password: 'password123' } });
  const lunch = (await admin('/api/products', { method: 'POST', body: { name: 'Lunch' } })).body;
  const snack = (await admin('/api/products', { method: 'POST', body: { name: 'Snack' } })).body;
  await admin('/api/students/import', { method: 'POST', body: { csv: '1001,Maria,Brown,4,G\n1002,Andre,Campbell,5,G\n1003,Mary,Bryan,4,G' } });
  await admin('/api/users', { method: 'POST', body: { name: 'S', username: 'staff', password: 'password123' } });
  const staff = client();
  await staff('/api/login', { method: 'POST', body: { username: 'staff', password: 'password123' } });

  // Staff can search by name (min 2 letters) but only get a short list.
  assert.deepEqual((await staff('/api/search-students?q=m')).body, []);
  const found = (await staff('/api/search-students?q=maria b')).body;
  assert.deepEqual(found.map((s) => s.student_number), ['1001']);
  assert.equal((await staff('/api/search-students?q=%25')).body.length, 0, 'wildcards are escaped');
  assert.equal((await client()('/api/search-students?q=mar')).status, 401);

  for (const [n, p] of [['1001', lunch], ['1001', snack], ['1002', lunch]]) {
    await staff('/api/serve', { method: 'POST', body: { studentNumber: n, productId: p.id } });
  }
  assert.equal((await staff('/api/report/students')).status, 403);
  const r = (await admin('/api/report/students')).body;
  assert.equal(r.students.length, 2);
  assert.equal(r.servingDays, 1);
  const maria = r.students.find((s) => s.student_number === '1001');
  assert.equal(maria.total, 2);
  assert.equal(maria.counts[lunch.id], 1);
  const csv = (await admin('/api/report/students.csv')).body;
  assert.match(csv, /School ID,First name,Last name,Grade,Program,Lunch,Snack,Total/);
  assert.match(csv, /1001,Maria,Brown,4,G,1,1,2/);

  // Downloadable backup is a real SQLite file.
  assert.equal((await staff('/api/backup')).status, 403);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/backup`, { headers: { cookie: (await loginCookie(server)) } });
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');

  // Daily backups: one per day, oldest pruned.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-bk-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const day of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-03']) dailyBackup(db, dir, day, 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['solution-2026-01-02.db', 'solution-2026-01-03.db']);
});

async function loginCookie(server) {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'password123' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}
