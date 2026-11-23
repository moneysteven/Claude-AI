// Glow by Launthia – integration test for the "checkout" and "paypal-webhook" Edge Functions (for developers).
//
// Runs the real function code in Node (with a small Deno stand-in) against a REAL Postgres database that has
// setup.sql + platform.sql, and a PayPal stand-in that follows PayPal's official OpenAPI specification (paths,
// fields and allowed values) and lets each test choose what PayPal answers (approved, pending, declined, errors,
// wrong amount, refunds, forged notifications …). Nothing is sent to PayPal or anywhere else.
//
// !! It DELETES all bookings, payments and customers in the database it is given. Only ever point it at a
// !! throwaway copy, and confirm that with GLOW_TEST_DB_IS_DISPOSABLE=yes.
//
// Needs Node 22.18+ (runs TypeScript directly) and the "pg" package (npm install pg).
//   GLOW_TEST_DB_IS_DISPOSABLE=yes DATABASE_URL=postgres://… node supabase/tests/checkout.integration.mjs [main|unconfigured|live]
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
if (process.env.GLOW_TEST_DB_IS_DISPOSABLE !== 'yes') {
  console.error('Refusing to run: this test deletes all bookings and payments. Set GLOW_TEST_DB_IS_DISPOSABLE=yes for a throwaway database.');
  process.exit(2);
}
let pgMod;
try { pgMod = createRequire(import.meta.url)('pg'); } catch { pgMod = createRequire(process.cwd() + '/')('pg'); }
const { Pool } = pgMod;

const MODE = process.argv[2] || 'main';
const FN = fileURLToPath(new URL('../functions/', import.meta.url));
const SB = 'https://proj.supabase.co', SERVICE = 'service-role-key';
const HOOK = 'h'.repeat(48);
const ENV = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SERVICE, SITE_URL: 'https://glow.example/', PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_WEBHOOK_ID: 'WH7TEST',
  RESEND_API_KEY: 're_test_key', CONFIRM_FROM: 'Glow by Launthia <bookings@glow.example>', ALERT_FROM: 'Glow by Launthia <alerts@glow.example>', ALERT_WEBHOOK_SECRET: HOOK };
if (MODE === 'unconfigured') { delete ENV.PAYPAL_CLIENT_ID; delete ENV.PAYPAL_CLIENT_SECRET; delete ENV.PAYPAL_WEBHOOK_ID; delete ENV.RESEND_API_KEY; }
// retry pauses (1s, 3s) run at once in this test; the stand-ins answer immediately
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 1000 || ms === 3000 ? 0 : ms, ...a);
if (MODE === 'live') ENV.PAYPAL_ENV = 'live';
const PP_HOST = MODE === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';

let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 8 }
  : { host: process.env.PGHOST || '/var/lib/postgresql/glowtest', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'glow10', max: 8 });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

// ---------------- Supabase REST RPC stand-in (PostgREST behaviour, real database, service role) ----------------
const rpcCalls = [];
async function rpcStub(fn, args) {
  rpcCalls.push(fn);
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role service_role');
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const meta = (await c.query(`select p.proretset, t.typname from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype where n.nspname = 'public' and p.proname = $1`, [fn])).rows;
    if (meta.length !== 1) { await c.query('rollback'); return [404, { code: 'PGRST202', message: `function ${fn} not found (${meta.length})` }]; }
    const keys = Object.keys(args);
    const params = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    // like PostgREST: a JSON array becomes a Postgres array, an object stays JSON
    const vals = keys.map((k) => { const v = args[k]; return v === null || v === undefined ? null : Array.isArray(v) ? '{' + v.map((x) => JSON.stringify(x)).join(',') + '}' : typeof v === 'object' ? JSON.stringify(v) : String(v); });
    let r;
    if (meta[0].proretset) r = (await c.query(`select coalesce(json_agg(t), '[]'::json) as r from public.${fn}(${params}) t`, vals)).rows[0].r;
    else if (meta[0].typname === 'void') { await c.query(`select public.${fn}(${params})`, vals); r = null; }
    else r = (await c.query(`select to_json(public.${fn}(${params})) as r`, vals)).rows[0].r;
    await c.query('commit');
    return [200, r];
  } catch (e) {
    await c.query('rollback').catch(() => {});
    return [e.code === '42501' ? 401 : 400, { code: e.code, message: e.message, details: null, hint: null }];
  } finally { c.release(); }
}

// ---------------- PayPal stand-in (checked against PayPal's OpenAPI spec) ----------------
const pp = { orders: new Map(), captures: new Map(), refunds: new Map(), n: 0, captureCalls: new Map(), idem: new Map(), log: [], plan: new Map(), down: false, violations: [] };
const ORDER_STATUSES = ['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'];
const ppId = (p) => p + String(++pp.n).padStart(6, '0') + 'X';
const B = `https://${PP_HOST}`;
function orderView(o) {
  const pu = { reference_id: 'default', custom_id: o.custom_id, description: o.description, amount: o.amount };
  if (o.captures.length) pu.payments = { captures: o.captures.map((id) => capView(pp.captures.get(id), false)) };
  return { id: o.id, intent: 'CAPTURE', status: o.status, purchase_units: [pu], links: [{ href: `${B}/v2/checkout/orders/${o.id}`, rel: 'self', method: 'GET' }] };
}
function capView(c, withSupp = true) {
  const v = { id: c.id, status: c.status, amount: c.amount, custom_id: c.custom_id, final_capture: true,
    links: [{ href: `${B}/v2/payments/captures/${c.id}`, rel: 'self', method: 'GET' }, { href: `${B}/v2/payments/captures/${c.id}/refund`, rel: 'refund', method: 'POST' }, { href: `${B}/v2/checkout/orders/${c.order}`, rel: 'up', method: 'GET' }] };
  if (c.reason) v.status_details = { reason: c.reason };
  if (withSupp) v.supplementary_data = { related_ids: { order_id: c.order } };
  return v;
}
function violation(msg) { pp.violations.push(msg); }
async function paypalStub(u, method, h, bodyText) {
  const json = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (pp.down) return json(503, { name: 'SERVICE_UNAVAILABLE' });
  if (u.pathname === '/v1/oauth2/token') {
    if (method !== 'POST' || h.authorization !== 'Basic ' + Buffer.from('cid:secret').toString('base64') || h['content-type'] !== 'application/x-www-form-urlencoded' || bodyText !== 'grant_type=client_credentials') { violation('token request malformed'); return json(401, { error: 'invalid_client' }); }
    return json(200, { access_token: 'A21TOKEN', token_type: 'Bearer', expires_in: 32400 });
  }
  if (h.authorization !== 'Bearer A21TOKEN') { violation('missing bearer token on ' + u.pathname); return json(401, {}); }
  const body = bodyText ? JSON.parse(bodyText) : undefined;
  const rid = h['paypal-request-id'];
  if (rid !== undefined && (rid.length < 1 || rid.length > 108)) violation('PayPal-Request-Id length ' + rid.length);
  if (h.prefer !== undefined && !/^[a-zA-Z=,-]*$/.test(h.prefer)) violation('Prefer value ' + h.prefer);
  let m;
  if (u.pathname === '/v2/checkout/orders' && method === 'POST') {
    const pu = body?.purchase_units?.[0], ec = body?.payment_source?.paypal?.experience_context, hasPs = body?.payment_source !== undefined;
    const okAmount = /^((-?[0-9]+)|(-?([0-9]+)?[.][0-9]+))$/.test(pu?.amount?.value || '') && /^[A-Z]{3}$/.test(pu?.amount?.currency_code || '');
    const checks = [body?.intent === 'CAPTURE', Array.isArray(body?.purchase_units) && body.purchase_units.length === 1, okAmount,
      typeof pu?.custom_id === 'string' && pu.custom_id.length >= 1 && pu.custom_id.length <= 255,
      !pu?.description || pu.description.length <= 127,
      !hasPs || ['GET_FROM_FILE', 'NO_SHIPPING', 'SET_PROVIDED_ADDRESS'].includes(ec?.shipping_preference), !hasPs || ['CONTINUE', 'PAY_NOW'].includes(ec?.user_action),
      !hasPs || ['UNRESTRICTED', 'IMMEDIATE_PAYMENT_REQUIRED'].includes(ec?.payment_method_preference), !hasPs || (typeof ec?.brand_name === 'string' && ec.brand_name.length <= 127),
      (!ec?.return_url || /^https:\/\//.test(ec.return_url)) && (!ec?.cancel_url || /^https:\/\//.test(ec.cancel_url)),
      body?.application_context === undefined];   // deprecated in the specification: never used
    if (checks.includes(false)) { violation('create order body: ' + JSON.stringify(checks)); return json(400, { name: 'INVALID_REQUEST' }); }
    const o = { id: ppId('ORD'), status: hasPs ? 'PAYER_ACTION_REQUIRED' : 'CREATED', custom_id: pu.custom_id, description: pu.description, amount: pu.amount, captures: [], return_url: ec?.return_url, cancel_url: ec?.cancel_url, ec, ps: hasPs };
    pp.orders.set(o.id, o); pp.log.push(['create', o.id, pu.amount.value, pu.amount.currency_code]);
    const look = `https://www.${MODE === 'live' ? '' : 'sandbox.'}paypal.com/checkoutnow?token=${o.id}`;
    return json(200, { id: o.id, status: o.status, ...(hasPs ? { payment_source: { paypal: {} } } : {}), links: [{ href: `${B}/v2/checkout/orders/${o.id}`, rel: 'self', method: 'GET' }, { href: look, rel: hasPs ? 'payer-action' : 'approve', method: 'GET' }] });
  }
  if ((m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/)) && method === 'POST') {
    const o = pp.orders.get(decodeURIComponent(m[1]));
    pp.captureCalls.set(m[1], (pp.captureCalls.get(m[1]) || 0) + 1);
    if (!o) return json(404, { name: 'RESOURCE_NOT_FOUND' });
    if (rid && pp.idem.has(rid)) return pp.idem.get(rid)();
    const plan = pp.plan.get(o.id) || 'complete';
    if (plan === 'error500') { pp.plan.set(o.id, 'complete'); return json(500, { name: 'INTERNAL_SERVER_ERROR' }); }
    if (o.status === 'COMPLETED') return json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
    if (o.status !== 'APPROVED') return json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] });
    if (plan === 'declined422') return json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] });
    const capAmount = plan === 'wrongAmount' ? { currency_code: o.amount.currency_code, value: '1.00' } : o.amount;
    const c = { id: ppId('CAP'), order: o.id, custom_id: o.custom_id, amount: capAmount,
      status: plan === 'pending' ? 'PENDING' : plan === 'declinedCapture' ? 'DECLINED' : 'COMPLETED', reason: plan === 'pending' ? 'PENDING_REVIEW' : undefined };
    pp.captures.set(c.id, c); o.captures.push(c.id); o.status = 'COMPLETED';
    pp.log.push(['capture', o.id, c.id, c.status]);
    const resp = () => json(201, orderView(o));
    if (rid) pp.idem.set(rid, resp);
    if (plan === 'error500_taken') return json(500, { name: 'INTERNAL_SERVER_ERROR' });
    return resp();
  }
  if ((m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/)) && method === 'GET') {
    const o = pp.orders.get(decodeURIComponent(m[1]));
    return o ? json(200, orderView(o)) : json(404, { name: 'RESOURCE_NOT_FOUND' });
  }
  if ((m = u.pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/)) && method === 'GET') {
    const c = pp.captures.get(decodeURIComponent(m[1]));
    return c ? json(200, capView(c)) : json(404, { name: 'RESOURCE_NOT_FOUND' });
  }
  if ((m = u.pathname.match(/^\/v2\/payments\/refunds\/([^/]+)$/)) && method === 'GET') {
    const r = pp.refunds.get(decodeURIComponent(m[1]));
    return r ? json(200, { id: r.id, status: r.status, amount: r.amount, links: [{ href: `${B}/v2/payments/refunds/${r.id}`, rel: 'self', method: 'GET' }, { href: `${B}/v2/payments/captures/${r.capture}`, rel: 'up', method: 'GET' }] }) : json(404, {});
  }
  if (u.pathname === '/v1/notifications/verify-webhook-signature' && method === 'POST') {
    const need = ['auth_algo', 'cert_url', 'transmission_id', 'transmission_sig', 'transmission_time', 'webhook_id', 'webhook_event'];
    if (need.some((k) => body?.[k] === undefined || body[k] === '')) { violation('verify body missing fields'); return json(400, { name: 'VALIDATION_ERROR' }); }
    if (body.webhook_id !== 'WH7TEST') violation('wrong webhook id');
    return json(200, { verification_status: body.transmission_sig === 'good-sig' ? 'SUCCESS' : 'FAILURE' });
  }
  violation('unknown PayPal call ' + method + ' ' + u.pathname);
  return json(404, { name: 'RESOURCE_NOT_FOUND' });
}
// test helpers acting as PayPal / the buyer
const approve = (id) => { pp.orders.get(id).status = 'APPROVED'; };
function refund(captureId, value, status = 'COMPLETED') {
  const c = pp.captures.get(captureId); const r = { id: ppId('REF'), capture: captureId, amount: { currency_code: c.amount.currency_code, value }, status };
  pp.refunds.set(r.id, r); return r;
}

// ---------------- Resend stand-in (checked against Resend's OpenAPI spec: POST /emails; from, to, subject required;
// Idempotency-Key up to 256 characters makes a repeated request return the first result without a second email) ----
const rs = { delivered: [], keys: new Map(), plan: [], calls: 0, violations: [] };
function resendStub(method, h, bodyText) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  rs.calls++;
  if (method !== 'POST' || h.authorization !== 'Bearer re_test_key') { rs.violations.push('bad auth or method'); return json(401, { message: 'missing api key' }); }
  const key = h['idempotency-key'];
  if (!key || key.length > 256) rs.violations.push('Idempotency-Key missing or too long');
  let b; try { b = JSON.parse(bodyText); } catch { rs.violations.push('not JSON'); return json(422, { message: 'invalid json' }); }
  const allowed = ['from', 'to', 'subject', 'bcc', 'cc', 'reply_to', 'html', 'text', 'template', 'headers', 'scheduled_at', 'attachments', 'tags', 'topic_id'];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) rs.violations.push('unknown field ' + k);
  if (typeof b.from !== 'string' || !b.from || !b.to || typeof b.subject !== 'string' || !b.subject) { rs.violations.push('required field missing'); return json(422, { message: 'missing field' }); }
  if (Array.isArray(b.to) && b.to.length > 50) rs.violations.push('too many recipients');
  if (key && rs.keys.has(key)) return json(200, { id: rs.keys.get(key) });
  const plan = rs.plan.shift() ?? 200;
  if (plan !== 200) return json(plan, { message: 'resend error ' + plan });
  const id = 'em_' + (rs.delivered.length + 1);
  rs.delivered.push({ id, key, ...b });
  if (key) rs.keys.set(key, id);
  return json(200, { id });
}
const mailsTo = (addr) => rs.delivered.filter((m) => [].concat(m.to).includes(addr));

const STORED = {};
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), method = (init.method || 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (url.startsWith(SB + '/rest/v1/rpc/')) {
    if (h.apikey !== SERVICE || h.authorization !== 'Bearer ' + SERVICE) return new Response('{}', { status: 401 });
    const [st, body] = await rpcStub(u.pathname.split('/').pop(), JSON.parse(init.body || '{}'));
    return new Response(body === null ? '' : JSON.stringify(body), { status: st, headers: { 'content-type': 'application/json' } });
  }
  if (url.startsWith(SB + '/storage/v1/object/payment-receipts/')) {
    if (h.apikey !== SERVICE || h.authorization !== 'Bearer ' + SERVICE) return new Response('{}', { status: 401 });
    if (globalThis.STORAGE_DOWN) return new Response('{"error":"down"}', { status: 503 });
    const key = u.pathname.replace('/storage/v1/object/payment-receipts/', '');
    if (STORED[key] && h['x-upsert'] !== 'true') return new Response('{"error":"Duplicate"}', { status: 409 });
    STORED[key] = { type: h['content-type'], size: init.body ? init.body.length : 0 };
    return new Response(JSON.stringify({ Key: 'payment-receipts/' + key }), { status: 200 });
  }
  if (u.host === PP_HOST) return paypalStub(u, method, h, init.body);
  if (u.host === 'api.resend.com' && u.pathname === '/emails') return resendStub(method, h, init.body);
  if (url.startsWith(SB + '/auth/v1/user')) {
    if (h.apikey !== SERVICE) return new Response('{}', { status: 401 });
    const tok = (h.authorization || '').replace('Bearer ', '');
    if (tok === 'owner-token') return new Response(JSON.stringify({ id: 'u1', email: 'Launthiawatson@yahoo.com' }), { status: 200 });
    if (tok === 'other-token') return new Response(JSON.stringify({ id: 'u2', email: 'someone@else.example' }), { status: 200 });
    return new Response('{"msg":"invalid JWT"}', { status: 401 });
  }
  if (u.host.endsWith('paypal.com')) { violation('call to the wrong PayPal host ' + u.host); return new Response('{}', { status: 404 }); }
  return new Response(JSON.stringify({ error: 'no stand-in for ' + url }), { status: 404 });
};

async function load(name) { handler = null; await import(pathToFileURL(FN + name + '/index.ts').href); return handler; }
const R = [];
const check = (name, ok, extra = '') => R.push((ok ? 'OK   ' : 'FAIL ') + name + (ok || !extra ? '' : '  [' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) + ']'));
let ipN = 0;
const freshIp = () => `203.0.113.${++ipN}`;
async function call(h, body, { ip = freshIp(), method = 'POST', headers = {}, raw } = {}) {
  const res = await h(new Request('https://proj.functions.supabase.co/checkout', { method, headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': `${ip}, 10.0.0.1` } : {}), ...headers }, body: method === 'GET' ? undefined : raw ?? JSON.stringify(body) }));
  const t = await res.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: res.status, body: j, headers: res.headers };
}
let evN = 0;
async function hook(h, eventType, resourceType, resource, { sig = 'good-sig', id } = {}) {
  const ev = { id: id || `WH-${++evN}-TEST`, event_version: '1.0', create_time: new Date().toISOString(), resource_type: resourceType, event_type: eventType, resource };
  const res = await h(new Request('https://proj.functions.supabase.co/paypal-webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT', 'paypal-transmission-id': 'tx-' + evN, 'paypal-transmission-sig': sig, 'paypal-transmission-time': new Date().toISOString() }, body: JSON.stringify(ev) }));
  const t = await res.text(); return { status: res.status, body: t ? JSON.parse(t) : null, id: ev.id };
}
const bk = async (id) => (await q('select * from public.bookings where id = $1', [id]))[0];
const pays = async (id) => q('select * from public.payments where booking_id = $1 order by created_at', [id]);

// ---------------- set-up: a clean, known state ----------------
await q(`delete from public.payment_refunds; delete from public.payment_events; delete from public.payments; delete from public.email_log; delete from public.bookings; delete from public.customers; delete from public.request_limits;
  delete from public.availability_hours; delete from public.availability_breaks; delete from public.blocked_periods; delete from public.blocked_days;
  insert into public.availability_hours (weekday, start_time, end_time) select d, '09:00', '17:00' from generate_series(1, 6) d;
  update public.booking_settings set slot_step_minutes = 60, buffer_minutes = 0, min_notice_minutes = 60, max_days_ahead = 90, hold_minutes = 15, max_active_holds = 30, deposit_jmd = null, photos_addon_jmd = 3000;
  update public.payment_methods set enabled = true where method = 'cash';
  update public.services set active = true, bookable_online = true, price_jmd = 9500, duration_minutes = 60 where slug = 'soft-glam';
  update public.payment_methods set enabled = true where method = 'card';
  update public.payment_methods set enabled = true, jmd_per_usd = 155 where method = 'paypal';
  update public.payment_methods set enabled = true, jmd_per_usd = 155, instructions = '[Owner to confirm: Zelle email or phone and name]' where method = 'zelle';
  update public.payment_methods set enabled = true, jmd_per_usd = 155, instructions = '[Owner to confirm: $Cashtag and name]' where method = 'cashapp';
  update public.payment_methods set enabled = true, accounts = '[{"bank":"Test Bank A","account_name":"Test Name A","account_number":"1234 5678","branch":"Test Branch","account_type":"Savings"},
    {"bank":"Test Bank B","account_name":"Test Name B","account_number":"987654","branch":"Test Branch","account_type":"Savings"}]' where method = 'bank';
  update public.owner_settings set email_alerts = true, alert_email = 'Launthiawatson@yahoo.com' where id = 1;`);
const DAY = (await q(`select d::date::text as d from generate_series((now() at time zone 'America/Jamaica')::date + 7, (now() at time zone 'America/Jamaica')::date + 13, interval '1 day') d where extract(dow from d) = 1 limit 1`))[0].d;
const NEXT = (await q(`select ($1::date + 1)::text as d`, [DAY]))[0].d;
const DAY3 = (await q(`select ($1::date + 2)::text as d`, [DAY]))[0].d;
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00-05:00`).toISOString(); // Jamaica is UTC-5 all year
const SVC = (await q(`select id from public.services where slug = 'soft-glam'`))[0].id;
const person = (n) => ({ name: `Client ${n}`, email: `client${n}@example.com`, phone: `876-555-${String(1000 + n).slice(-4)}`, agree_terms: true });

const co = await load('checkout');
const wh = MODE === 'unconfigured' ? null : await load('paypal-webhook');
const em = await load('booking-emails');
const OWNER = 'launthiawatson@yahoo.com';
const logOf = async (id) => q(`select kind, audience, status, attempts, provider_id, detail from public.email_log where booking_id = $1 order by kind`, [id]);
async function emHook(id, { secret = HOOK, table = 'email_log' } = {}) {
  const res = await em(new Request('https://proj.functions.supabase.co/booking-emails', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': secret }, body: JSON.stringify({ type: 'INSERT', table, schema: 'public', record: { id }, old_record: null }) }));
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function emFlush(token) {
  const res = await em(new Request('https://proj.functions.supabase.co/booking-emails', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action: 'flush' }) }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

if (MODE === 'unconfigured') {
  const o = await call(co, { action: 'options' });
  const pm = Object.fromEntries(o.body.payment_methods.map((m) => [m.method, m]));
  check('no PayPal keys: PayPal shown as "being set up", not available', pm.paypal.available === false && pm.paypal.note === 'PayPal is being set up.' && !pm.paypal.client_id && !pm.paypal.sdk_url, pm.paypal);
  const h = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '10:00'), ...person(1) });
  const p = await call(co, { action: 'pay', booking_id: h.body.booking_id, method: 'paypal' });
  check('no PayPal keys: paying by PayPal is refused, nothing recorded', p.status === 503 && (await pays(h.body.booking_id)).length === 0, p);
  check('no PayPal keys: nothing was sent to PayPal', pp.log.length === 0 && pp.violations.length === 0, pp);
  const zh = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '11:00'), ...person(2) });
  await call(co, { action: 'pay', booking_id: zh.body.booking_id, method: 'zelle' });
  const zs = await call(co, { action: 'zelle_submit', booking_id: zh.body.booking_id, zelle_reference: 'ZL-1000', sender_name: 'Client 2' });
  check('no email keys: the booking still works; Launthia\'s email waits in the queue, nothing is sent', zs.status === 200 && rs.calls === 0
    && (await logOf(zh.body.booking_id)).map((r) => `${r.kind}:${r.status}`).join() === 'owner_zelle_check:queued');
} else if (MODE === 'live') {
  const o = await call(co, { action: 'options' });
  const pm = Object.fromEntries(o.body.payment_methods.map((m) => [m.method, m]));
  check('live mode: PayPal is live, no test note', pm.paypal.available && pm.paypal.status === 'live' && pm.paypal.note === null, pm.paypal);
  check('live mode: PayPal\'s checkout window loads from PayPal\'s production address', pm.paypal.sdk_url === 'https://www.paypal.com/sdk/js' && pm.paypal.client_id === 'cid', pm.paypal);
  const h = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '10:00'), ...person(1) });
  const p = await call(co, { action: 'pay', booking_id: h.body.booking_id, method: 'paypal' });
  check('live mode: real PayPal host, buyer sent to www.paypal.com, not flagged as a test', p.status === 200 && p.body.test_mode === false && p.body.redirect_url.startsWith('https://www.paypal.com/')
    && (await pays(h.body.booking_id))[0].is_test === false, p);
  approve(p.body.order_id);
  const r = await call(co, { action: 'paypal_return', booking_id: h.body.booking_id });
  check('live mode: confirmed, not a test', r.body.status === 'confirmed' && r.body.test_mode === false, r);
  check('live mode: no call went to the sandbox', pp.violations.length === 0, pp.violations);
  const lm = mailsTo('client1@example.com');
  check('live mode: confirmation and receipt sent with no TEST marks', lm.length === 2 && lm.every((m) => !m.subject.includes('[TEST]') && !m.html.includes('TEST MODE')), lm.map((m) => m.subject));
} else {
  // ---- 1. requests the function refuses
  check('GET is refused (405)', (await call(co, null, { method: 'GET' })).status === 405);
  check('not JSON is refused (400)', (await call(co, null, { raw: 'nope' })).status === 400);
  check('too much data is refused (413)', (await call(co, null, { raw: JSON.stringify({ action: 'options', x: 'a'.repeat(11000) }) })).status === 413);
  check('an unknown action is refused (400)', (await call(co, { action: 'drop_tables' })).status === 400);
  check('a bad booking id is refused (400)', (await call(co, { action: 'status', booking_id: "1' or '1'='1" })).status === 400);
  check('CORS preflight answers', (await co(new Request('https://x/checkout', { method: 'OPTIONS' }))).status === 200);

  // ---- 2. options, days, slots
  const o = await call(co, { action: 'options' });
  const pm = Object.fromEntries(o.body.payment_methods.map((m) => [m.method, m]));
  check('options: the services from the database, with Full Glam\'s two looks under it', o.status === 200 && o.body.services.length === 5 && o.body.services[0].price_jmd === 9500
    && o.body.services.filter((x) => x.parent_slug === 'full-glam').map((x) => x.name + '=' + x.price_jmd).join() === 'Natural Full Glam=10500,Statement Full Glam=12000', o.body.services);
  check('options: card switched on but shown as "awaiting merchant integration", not selectable', pm.card.available === false && pm.card.status === 'awaiting merchant integration', pm.card);
  check('options: PayPal available in TEST MODE (clearly marked)', pm.paypal.available === true && pm.paypal.status === 'test' && /TEST MODE/.test(pm.paypal.note), pm.paypal);
  check('options: Zelle available, confirmed by Launthia', pm.zelle.available === true && pm.zelle.status === 'manual', pm.zelle);
  check('options: Cash App available, confirmed by Launthia', pm.cashapp && pm.cashapp.available === true && pm.cashapp.status === 'manual' && pm.cashapp.label === 'Cash App', pm.cashapp);
  check('options: bank transfer available, in JMD, confirmed by Launthia', pm.bank && pm.bank.available === true && pm.bank.status === 'manual' && pm.bank.currency === 'JMD' && pm.bank.label === 'Bank transfer', pm.bank);
  check('options: never include her bank accounts or payment instructions', !/1234 5678|987654|Test Name|Owner to confirm|"accounts"|"instructions"/.test(JSON.stringify(o.body)), o.body.payment_methods);
  check('options: the ways to pay, in order: card, bank transfer, PayPal, Zelle, Cash App, pay in person', o.body.payment_methods.map((m) => m.method).join() === 'card,bank,paypal,zelle,cashapp,cash', o.body.payment_methods.map((m) => m.method));
  check('options: pay in person (cash) is available, in JMD', pm.cash && pm.cash.available === true && pm.cash.status === 'in person' && pm.cash.currency === 'JMD', pm.cash);
  check('options: no secret or private key in the answer (only PayPal\'s public client id)', !/secret|service-role|WH7TEST|A21TOKEN|re_test_key/i.test(JSON.stringify(o.body)) && (JSON.stringify(o.body).match(/"cid"/g) || []).length === 1);
  const slots = await call(co, { action: 'slots', service_id: SVC, day: DAY });
  check('slots: 8 free start times on the test Monday', slots.status === 200 && slots.body.slots.length === 8, slots.body);
  const days = await call(co, { action: 'days', service_id: SVC, from: DAY, to: NEXT });
  check('days: the Monday and Tuesday are open', JSON.stringify(days.body.days) === JSON.stringify([DAY, NEXT]), days.body);
  check('days: a bad date is refused', (await call(co, { action: 'days', service_id: SVC, from: '2026-02-30', to: NEXT })).status === 400);

  // ---- 3. holding a time
  const hp = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '10:00'), ...person(1), company: 'spam inc' });
  check('a robot filling the hidden field is refused, nothing held', hp.status === 400 && (await q('select count(*)::int as n from public.bookings'))[0].n === 0);
  const h1 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '10:00'), ...person(1) });
  check('hold: made for 15 minutes at JMD 9,500', h1.status === 200 && h1.body.amount_jmd === 9500 && !!h1.body.booking_id, h1.body);
  const h1b = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '10:00'), ...person(2) });
  check('hold: the same time again is refused with a clear message', h1b.status === 409 && /no longer available/.test(h1b.body.error), h1b.body);
  const h1c = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '11:00'), ...person(2), agree_terms: false });
  check('hold: terms not agreed is refused', h1c.status === 409 && /agree to the Terms/.test(h1c.body.error), h1c.body);
  const st = await call(co, { action: 'status', booking_id: h1.body.booking_id });
  check('status: shows the hold, never the name, email or phone', st.body.status === 'Held' && !/Client 1|client1@|555-1001/.test(JSON.stringify(st.body)), st.body);

  // ---- 4. card is awaiting integration
  const pc = await call(co, { action: 'pay', booking_id: h1.body.booking_id, method: 'card' });
  check('card: refused as "being set up"; nothing recorded or sent anywhere', pc.status === 503 && pc.body.awaiting_integration === true && (await pays(h1.body.booking_id)).length === 0, pc.body);

  // ---- 5. PayPal: happy path
  const p1 = await call(co, { action: 'pay', booking_id: h1.body.booking_id, method: 'paypal' });
  const o1 = p1.body.order_id, order1 = pp.orders.get(o1);
  check('PayPal: buyer sent to PayPal\'s own page; USD 61.30 (JMD 9,500 at 155); TEST MODE', p1.status === 200 && p1.body.redirect_url.startsWith('https://www.sandbox.paypal.com/checkoutnow?token=') && p1.body.amount === 61.3 && p1.body.currency === 'USD' && p1.body.test_mode === true, p1.body);
  check('PayPal: order made with the booking id, exact amount, no shipping, return links to the site', order1.custom_id === h1.body.booking_id && order1.amount.value === '61.30' && order1.amount.currency_code === 'USD'
    && order1.return_url === `https://glow.example/?glow_pay=paypal&booking=${h1.body.booking_id}` && order1.cancel_url === `https://glow.example/?glow_pay=paypal_cancel&booking=${h1.body.booking_id}`, order1);
  check('PayPal: payment recorded as started and flagged as a test', (await pays(h1.body.booking_id)).map((p) => `${p.status}|${p.is_test}|${p.amount}|${p.currency}`).join() === 'started|true|61.30|USD');
  const r0 = await call(co, { action: 'paypal_return', booking_id: h1.body.booking_id });
  check('return before approving: "not finished", PayPal not even asked to capture, nothing confirmed', r0.body.status === 'not_approved' && !pp.captureCalls.get(o1) && (await bk(h1.body.booking_id)).status === 'Held', r0.body);
  approve(o1);
  const r1 = await call(co, { action: 'paypal_return', booking_id: h1.body.booking_id });
  const b1 = await bk(h1.body.booking_id), ps1 = await pays(h1.body.booking_id);
  check('return after approving: confirmed with a GBL- reference', r1.body.status === 'confirmed' && /^GBL-[A-Z2-9]{6}$/.test(r1.body.reference || '') && r1.body.test_mode === true, r1.body);
  check('…booking Confirmed + paid; payment succeeded with PayPal\'s capture id, checked by the gateway', b1.status === 'Confirmed' && b1.payment_status === 'paid' && b1.reference === r1.body.reference
    && ps1.length === 1 && ps1[0].status === 'succeeded' && /^CAP/.test(ps1[0].gateway_txn_id) && ps1[0].verified_by === 'gateway', { b1, ps1 });
  const capCountAfter = [...pp.captureCalls.values()].reduce((a, b) => a + b, 0);
  const r1b = await call(co, { action: 'paypal_return', booking_id: h1.body.booking_id, order_id: o1 });
  check('refreshing the return page: same reference, the money is not taken again', r1b.body.status === 'confirmed' && r1b.body.reference === r1.body.reference
    && [...pp.captureCalls.values()].reduce((a, b) => a + b, 0) === capCountAfter, r1b.body);
  const s1 = await call(co, { action: 'status', booking_id: h1.body.booking_id });
  check('status page: Confirmed with the reference', s1.body.status === 'Confirmed' && s1.body.reference === r1.body.reference && s1.body.payment.is_test === true, s1.body);

  // ---- 5b. PayPal's checkout window on the site (PayPal JavaScript SDK): pay with PayPal, or by card in that window
  check('options: PayPal gives the site its PUBLIC client id and the sandbox SDK address, never the secret', pm.paypal.client_id === 'cid' && pm.paypal.sdk_url === 'https://www.sandbox.paypal.com/sdk/js'
    && !JSON.stringify(o.body).includes('"secret"') && !JSON.stringify(o.body).includes('A21TOKEN'), pm.paypal);
  const hw = await call(co, { action: 'hold', service_id: SVC, start: at(DAY3, '14:00'), ...person(43) });
  const pw = await call(co, { action: 'pay', booking_id: hw.body.booking_id, method: 'paypal', popup: true });
  const ow = pp.orders.get(pw.body.order_id);
  check('checkout window: an order for the window – exact USD 61.30, Pay now, no shipping, no return links', pw.status === 200 && !!ow && ow.amount.value === '61.30' && ow.amount.currency_code === 'USD'
    && ow.ps === true && ow.ec.user_action === 'PAY_NOW' && ow.ec.shipping_preference === 'NO_SHIPPING' && ow.ec.brand_name === 'Glow by Launthia' && !ow.return_url && !ow.cancel_url, { body: pw.body, ow });
  check('checkout window: payment recorded as started (a test)', (await pays(hw.body.booking_id)).map((p) => `${p.status}|${p.is_test}|${p.provider_ref}`).join() === `started|true|${pw.body.order_id}`);
  approve(pw.body.order_id);
  const rw = await call(co, { action: 'paypal_return', booking_id: hw.body.booking_id, order_id: pw.body.order_id });
  check('checkout window approved: the server takes the money once and confirms with a GBL- reference', rw.body.status === 'confirmed' && /^GBL-[A-Z2-9]{6}$/.test(rw.body.reference || '')
    && (await bk(hw.body.booking_id)).status === 'Confirmed' && pp.captureCalls.get(pw.body.order_id) === 1, rw.body);
  const hc9 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY3, '15:00'), ...person(44) });
  const pc9 = await call(co, { action: 'pay', booking_id: hc9.body.booking_id, method: 'paypal', popup: true, funding: 'card' });
  const oc9 = pp.orders.get(pc9.body.order_id);
  check('checkout window, paying by card: the order carries no PayPal-account settings, same exact amount', pc9.status === 200 && !!oc9 && oc9.ps === false && oc9.amount.value === '61.30', { body: pc9.body, oc9 });
  approve(pc9.body.order_id);
  const rc9 = await call(co, { action: 'paypal_return', booking_id: hc9.body.booking_id, order_id: pc9.body.order_id });
  check('paid by card in the checkout window: confirmed', rc9.body.status === 'confirmed' && (await bk(hc9.body.booking_id)).payment_status === 'paid', rc9.body);

  // ---- 6. webhooks
  const wBad = await hook(wh, 'CHECKOUT.ORDER.APPROVED', 'checkout-order', orderView(order1), { sig: 'forged' });
  check('webhook with a bad signature is refused and not recorded', wBad.status === 400 && (await q('select count(*)::int as n from public.payment_events'))[0].n === 0, wBad);
  const wLate = await hook(wh, 'CHECKOUT.ORDER.APPROVED', 'checkout-order', { id: o1, status: 'APPROVED', purchase_units: [{ custom_id: h1.body.booking_id }] });
  check('late "order approved" webhook: handled, the money is not taken again', wLate.status === 200 && pp.captureCalls.get(o1) === 1 && (await pays(h1.body.booking_id)).length === 1, { wLate, calls: pp.captureCalls.get(o1) });
  const cap1 = order1.captures[0];
  const wc = await hook(wh, 'PAYMENT.CAPTURE.COMPLETED', 'capture', capView(pp.captures.get(cap1)), { id: 'WH-CAP-1' });
  const wc2 = await hook(wh, 'PAYMENT.CAPTURE.COMPLETED', 'capture', capView(pp.captures.get(cap1)), { id: 'WH-CAP-1' });
  check('capture-completed webhook: handled once, the second delivery is skipped', wc.status === 200 && wc2.body.duplicate === true
    && (await q(`select handled from public.payment_events where event_id = 'WH-CAP-1'`))[0].handled === true, { wc, wc2 });
  const wForeign = await hook(wh, 'CHECKOUT.ORDER.APPROVED', 'checkout-order', { id: 'ORDNOTOURS1', status: 'APPROVED', purchase_units: [{ custom_id: h1.body.booking_id }] });
  check('a webhook for an order not made by this site changes nothing', wForeign.status === 200 && (await q(`select note from public.payment_events where event_id = $1`, [wForeign.id]))[0].note === 'order not from this site');

  // ---- 7. the client closed the tab after approving: the webhook finishes the booking
  const h2 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '11:00'), ...person(2) });
  const p2 = await call(co, { action: 'pay', booking_id: h2.body.booking_id, method: 'paypal' });
  approve(p2.body.order_id);
  const w2 = await hook(wh, 'CHECKOUT.ORDER.APPROVED', 'checkout-order', { id: p2.body.order_id, status: 'APPROVED', purchase_units: [{ custom_id: h2.body.booking_id }] });
  check('closed the tab after approving: the webhook takes the payment once and confirms', w2.status === 200 && (await bk(h2.body.booking_id)).status === 'Confirmed' && pp.captureCalls.get(p2.body.order_id) === 1, w2);

  // ---- 8. the return page and the webhook at the same moment
  const h3 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '12:00'), ...person(3) });
  const p3 = await call(co, { action: 'pay', booking_id: h3.body.booking_id, method: 'paypal' });
  approve(p3.body.order_id);
  const [ra, rb] = await Promise.all([
    call(co, { action: 'paypal_return', booking_id: h3.body.booking_id }),
    hook(wh, 'CHECKOUT.ORDER.APPROVED', 'checkout-order', { id: p3.body.order_id, status: 'APPROVED', purchase_units: [{ custom_id: h3.body.booking_id }] }),
  ]);
  const ps3 = await pays(h3.body.booking_id), caps3 = pp.orders.get(p3.body.order_id).captures.length;
  // whichever comes second either sees it already paid (200) or finds the capture in progress and asks PayPal to resend (500)
  check('return page and webhook at the same moment: PayPal asked once, one payment, confirmed', [ra.body.status, rb.status].length === 2 && caps3 === 1 && (pp.captureCalls.get(p3.body.order_id) || 0) === 1
    && ps3.length === 1 && ps3[0].status === 'succeeded' && (await bk(h3.body.booking_id)).status === 'Confirmed', { ra: ra.body, rb, caps3, calls: pp.captureCalls.get(p3.body.order_id), ps3: ps3.length });
  const rb2 = await hook(wh, 'CHECKOUT.ORDER.APPROVED', 'checkout-order', { id: p3.body.order_id, status: 'APPROVED', purchase_units: [{ custom_id: h3.body.booking_id }] }, { id: rb.id });
  check('…PayPal\'s resend of that notification is then handled without asking PayPal again', rb2.status === 200 && (pp.captureCalls.get(p3.body.order_id) || 0) === 1, rb2);

  // ---- 9. hold ran out while on PayPal
  const h4 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '13:00'), ...person(4) });
  const p4 = await call(co, { action: 'pay', booking_id: h4.body.booking_id, method: 'paypal' });
  approve(p4.body.order_id);
  await q(`update public.bookings set hold_expires_at = now() - interval '1 second' where id = $1`, [h4.body.booking_id]);
  const r4 = await call(co, { action: 'paypal_return', booking_id: h4.body.booking_id });
  check('hold ran out, time still free: payment taken and confirmed', r4.body.status === 'confirmed' && (await bk(h4.body.booking_id)).status === 'Confirmed', r4.body);

  const h5 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '14:00'), ...person(5) });
  const p5 = await call(co, { action: 'pay', booking_id: h5.body.booking_id, method: 'paypal' });
  approve(p5.body.order_id);
  await q(`update public.bookings set hold_expires_at = now() - interval '1 second' where id = $1`, [h5.body.booking_id]);
  const h5other = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '14:00'), ...person(6) });
  const r5 = await call(co, { action: 'paypal_return', booking_id: h5.body.booking_id });
  check('hold ran out and someone else took the time: NOT charged (PayPal never asked to capture)', r5.body.status === 'not_charged' && !pp.captureCalls.get(p5.body.order_id)
    && (await bk(h5other.body.booking_id)).status === 'Held' && ['cancelled', 'expired'].includes((await pays(h5.body.booking_id))[0].status), { r5: r5.body, other: h5other.body, pay: (await pays(h5.body.booking_id))[0].status });

  // ---- 10. PayPal answers: pending, declined, errors, wrong amount
  const h6 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '15:00'), ...person(7) });
  const p6 = await call(co, { action: 'pay', booking_id: h6.body.booking_id, method: 'paypal' });
  approve(p6.body.order_id); pp.plan.set(p6.body.order_id, 'pending');
  const r6 = await call(co, { action: 'paypal_return', booking_id: h6.body.booking_id });
  const b6 = await bk(h6.body.booking_id);
  check('capture PENDING: Pending payment, time kept, NOT confirmed', r6.body.status === 'pending' && b6.status === 'Pending payment' && b6.payment_status !== 'paid' && /^GBL-/.test(b6.reference || '') && b6.payment_status === 'pending', { r6: r6.body, b6 });
  const c6 = pp.captures.get(pp.orders.get(p6.body.order_id).captures[0]); c6.status = 'COMPLETED'; delete c6.reason;
  const w6 = await hook(wh, 'PAYMENT.CAPTURE.COMPLETED', 'capture', capView(c6));
  check('…then PayPal reports it COMPLETED: confirmed with a reference', w6.status === 200 && (await bk(h6.body.booking_id)).status === 'Confirmed' && /^GBL-/.test((await bk(h6.body.booking_id)).reference), w6);

  const h7 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '16:00'), ...person(8) });
  const p7 = await call(co, { action: 'pay', booking_id: h7.body.booking_id, method: 'paypal' });
  approve(p7.body.order_id); pp.plan.set(p7.body.order_id, 'declined422');
  const r7 = await call(co, { action: 'paypal_return', booking_id: h7.body.booking_id });
  const b7 = await bk(h7.body.booking_id);
  check('PayPal refuses the capture (422): "not charged", time released, payment failed', r7.body.status === 'declined' && b7.status === 'Expired' && (await pays(h7.body.booking_id))[0].status === 'failed'
    && (await call(co, { action: 'slots', service_id: SVC, day: DAY })).body.slots.some((s) => new Date(s.slot_start).toISOString() === at(DAY, '16:00')), { r7: r7.body, b7: b7.status });

  const h8 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '09:00'), ...person(9) });
  const p8 = await call(co, { action: 'pay', booking_id: h8.body.booking_id, method: 'paypal' });
  approve(p8.body.order_id); pp.plan.set(p8.body.order_id, 'error500');
  const r8 = await call(co, { action: 'paypal_return', booking_id: h8.body.booking_id });
  check('PayPal error and the money NOT taken: "check again", nothing changed', r8.body.status === 'error' && r8.body.retry === true && (await bk(h8.body.booking_id)).status === 'Held' && (await pays(h8.body.booking_id))[0].status === 'started', r8.body);
  const r8b = await call(co, { action: 'paypal_return', booking_id: h8.body.booking_id });
  check('…checking again: captured once and confirmed', r8b.body.status === 'confirmed' && pp.orders.get(p8.body.order_id).captures.length === 1, r8b.body);

  const h9 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '10:00'), ...person(10) });
  const p9 = await call(co, { action: 'pay', booking_id: h9.body.booking_id, method: 'paypal' });
  approve(p9.body.order_id); pp.plan.set(p9.body.order_id, 'error500_taken');
  const r9 = await call(co, { action: 'paypal_return', booking_id: h9.body.booking_id });
  check('PayPal error but the money WAS taken: read back from PayPal and confirmed', r9.body.status === 'confirmed' && (await bk(h9.body.booking_id)).status === 'Confirmed', r9.body);

  const h10 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '11:00'), ...person(11) });
  const p10 = await call(co, { action: 'pay', booking_id: h10.body.booking_id, method: 'paypal' });
  approve(p10.body.order_id); pp.plan.set(p10.body.order_id, 'wrongAmount');
  const r10 = await call(co, { action: 'paypal_return', booking_id: h10.body.booking_id });
  const b10 = await bk(h10.body.booking_id);
  check('PayPal reports a different amount: Needs attention, never Confirmed', r10.body.status === 'needs_attention' && b10.status === 'Needs attention' && b10.payment_status !== 'paid' && /^GBL-/.test(b10.reference || ''), { r10: r10.body, b10: b10.status });

  const h11 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '12:00'), ...person(12) });
  const p11 = await call(co, { action: 'pay', booking_id: h11.body.booking_id, method: 'paypal' });
  approve(p11.body.order_id); pp.plan.set(p11.body.order_id, 'declinedCapture');
  const r11 = await call(co, { action: 'paypal_return', booking_id: h11.body.booking_id });
  check('capture DECLINED: not confirmed, time released', r11.body.status === 'declined' && (await bk(h11.body.booking_id)).status === 'Expired', r11.body);

  // ---- 11. the client leaves PayPal, then tries again
  const h12 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '13:00'), ...person(13) });
  const p12 = await call(co, { action: 'pay', booking_id: h12.body.booking_id, method: 'paypal' });
  const c12 = await call(co, { action: 'paypal_cancel', booking_id: h12.body.booking_id });
  check('left PayPal: not charged, the hold is kept to try again', c12.body.status === 'cancelled' && (await bk(h12.body.booking_id)).status === 'Held' && (await pays(h12.body.booking_id))[0].status === 'cancelled', c12.body);
  const p12b = await call(co, { action: 'pay', booking_id: h12.body.booking_id, method: 'paypal' });
  approve(p12b.body.order_id);
  const r12 = await call(co, { action: 'paypal_return', booking_id: h12.body.booking_id });
  check('…tries again with a new PayPal order: confirmed (the latest order is the one taken)', r12.body.status === 'confirmed' && p12b.body.order_id !== p12.body.order_id && !pp.captureCalls.get(p12.body.order_id), r12.body);
  const h13 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '14:00'), ...person(14) });
  const p13 = await call(co, { action: 'pay', booking_id: h13.body.booking_id, method: 'paypal' });
  approve(p13.body.order_id);
  const c13 = await call(co, { action: 'paypal_cancel', booking_id: h13.body.booking_id });
  check('cancel link opened after actually approving: the payment is completed, not cancelled', c13.body.status === 'confirmed', c13.body);
  check('another booking\'s order id is never accepted', (await call(co, { action: 'paypal_return', booking_id: h13.body.booking_id, order_id: p12b.body.order_id })).status === 404);

  // ---- 12. refunds reported by PayPal
  const capJ = pp.orders.get(o1).captures[0];
  const rf1 = refund(capJ, '20.00');
  const wr1 = await hook(wh, 'PAYMENT.CAPTURE.REFUNDED', 'refund', { id: rf1.id, status: 'COMPLETED', amount: rf1.amount, links: [{ href: `${B}/v2/payments/refunds/${rf1.id}`, rel: 'self' }, { href: `${B}/v2/payments/captures/${capJ}`, rel: 'up' }] }, { id: 'WH-REF-1' });
  const p1row = (await pays(h1.body.booking_id))[0];
  check('PayPal refund USD 20: recorded as JMD 3,100 back, partly refunded', wr1.status === 200 && p1row.refunded_jmd === 3100 && p1row.status === 'partly refunded' && (await bk(h1.body.booking_id)).payment_status === 'partly refunded', { wr1, p1row });
  const wr1b = await hook(wh, 'PAYMENT.CAPTURE.REFUNDED', 'refund', { id: rf1.id, status: 'COMPLETED', amount: rf1.amount, links: [{ href: `${B}/v2/payments/refunds/${rf1.id}`, rel: 'self' }] }, { id: 'WH-REF-1-RESENT-AS-NEW' });
  check('the same PayPal refund in another notification is not counted twice', wr1b.status === 200 && (await pays(h1.body.booking_id))[0].refunded_jmd === 3100, wr1b);
  const rf2 = refund(capJ, '41.30');
  await hook(wh, 'PAYMENT.CAPTURE.REFUNDED', 'refund', { id: rf2.id, status: 'COMPLETED', amount: rf2.amount, links: [{ href: `${B}/v2/payments/refunds/${rf2.id}`, rel: 'self' }] });
  check('the rest refunded: JMD 9,500 back, booking refunded', (await pays(h1.body.booking_id))[0].refunded_jmd === 9500 && (await bk(h1.body.booking_id)).payment_status === 'refunded');
  const rf3 = refund(capJ, '5.00', 'PENDING');
  await hook(wh, 'PAYMENT.CAPTURE.REFUNDED', 'refund', { id: rf3.id, status: 'PENDING', amount: rf3.amount, links: [{ href: `${B}/v2/payments/refunds/${rf3.id}`, rel: 'self' }] });
  check('a refund PayPal still shows as PENDING is not counted', (await q(`select count(*)::int as n from public.payment_refunds`))[0].n === 2);

  // ---- 13. Zelle
  const h14 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '15:00'), ...person(15) });
  const z1 = await call(co, { action: 'pay', booking_id: h14.body.booking_id, method: 'zelle' });
  check('Zelle: exact USD amount and Launthia\'s instructions; nothing sent anywhere', z1.status === 200 && z1.body.amount === 61.3 && z1.body.currency === 'USD' && /Owner to confirm/.test(z1.body.instructions), z1.body);
  const z2 = await call(co, { action: 'zelle_submit', booking_id: h14.body.booking_id, zelle_reference: 'ZL-778899', sender_name: 'Client 15' });
  const b14 = await bk(h14.body.booking_id);
  check('Zelle reference sent: Pending payment, never confirmed automatically', z2.status === 200 && b14.status === 'Pending payment' && b14.payment_status === 'pending' && b14.payment_status !== 'paid' && /^GBL-/.test(b14.reference || ''), { z2: z2.body, b14: b14.status });
  const z3 = await call(co, { action: 'zelle_submit', booking_id: h14.body.booking_id, zelle_reference: 'ZL-778899', sender_name: 'Client 15' });
  check('the same Zelle reference again is refused', z3.status === 409, z3.body);
  // Cash App: the same rules as Zelle
  const hc = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '11:00'), ...person(40) });
  const c1p = await call(co, { action: 'pay', booking_id: hc.body.booking_id, method: 'cashapp' });
  check('Cash App: exact USD amount and Launthia\'s Cash App details; nothing sent anywhere', c1p.status === 200 && c1p.body.method === 'cashapp' && c1p.body.amount === 61.3 && /\$Cashtag/.test(c1p.body.instructions), c1p.body);
  check('Cash App: a reference is required', (await call(co, { action: 'manual_submit', booking_id: hc.body.booking_id, method: 'cashapp', reference: '', sender_name: 'Client 40' })).status === 409);
  check('an unknown way to pay is refused', (await call(co, { action: 'manual_submit', booking_id: hc.body.booking_id, method: 'venmo', reference: 'V-123456', sender_name: 'Client 40' })).status === 400
    && (await call(co, { action: 'pay', booking_id: hc.body.booking_id, method: 'venmo' })).status === 400);
  const c2p = await call(co, { action: 'manual_submit', booking_id: hc.body.booking_id, method: 'cashapp', reference: 'CA-24680', sender_name: 'Client 40' });
  const bc = await bk(hc.body.booking_id);
  check('Cash App reference sent: Pending payment, never confirmed automatically', c2p.status === 200 && bc.status === 'Pending payment' && bc.payment_method === 'cashapp' && bc.payment_status !== 'paid' && /^GBL-/.test(bc.reference || ''), { c2p: c2p.body, bc: bc.status });
  const cmail = mailsTo(OWNER).find((m) => m.subject.includes('Cash App payment to check'));
  check('Launthia is asked to check her Cash App (amount, reference, sender); the client gets nothing yet', !!cmail && cmail.html.includes('CA-24680') && cmail.html.includes('USD $61.30')
    && cmail.html.includes('Cash App reference') && mailsTo('client40@example.com').length === 0, cmail && cmail.subject);
  // Bank transfer (JMD): the client sends it from their own banking app to one of her accounts
  const hb = await call(co, { action: 'hold', service_id: SVC, start: at(DAY3, '10:00'), ...person(41) });
  const b1p = await call(co, { action: 'pay', booking_id: hb.body.booking_id, method: 'bank' });
  check('bank transfer: the exact JMD price and both of her accounts, only for the client holding the time', b1p.status === 200 && b1p.body.method === 'bank' && b1p.body.amount === 9500
    && b1p.body.currency === 'JMD' && b1p.body.accounts.length === 2 && b1p.body.accounts[0].account_number === '1234 5678' && b1p.body.accounts[1].bank === 'Test Bank B', b1p.body);
  const bNoTo = await call(co, { action: 'manual_submit', booking_id: hb.body.booking_id, method: 'bank', reference: 'TR-1357', sender_name: 'Client 41' });
  check('bank transfer: which account it went to is required', bNoTo.status === 409 && /which account/.test(bNoTo.body.error), bNoTo.body);
  const bNoRef = await call(co, { action: 'manual_submit', booking_id: hb.body.booking_id, method: 'bank', reference: 'ab', sender_name: 'Client 41', sent_to: '1' });
  check('bank transfer: a transaction reference is needed (a too-short one is refused)', bNoRef.status === 409 && /transaction reference from your bank/.test(bNoRef.body.error), bNoRef.body);
  const b2p = await call(co, { action: 'manual_submit', booking_id: hb.body.booking_id, method: 'bank', reference: 'TR-1357', sender_name: 'Client 41', sent_to: '1' });
  const bb = await bk(hb.body.booking_id);
  check('transfer reported: Pending payment, never confirmed automatically', b2p.status === 200 && b2p.body.currency === 'JMD' && bb.status === 'Pending payment' && bb.payment_method === 'bank' && bb.payment_status !== 'paid' && /^GBL-/.test(bb.reference || ''), { b2p: b2p.body, bb: bb.status });
  const bmail = mailsTo(OWNER).find((m) => m.subject.includes('Bank transfer sent to you'));
  check('Launthia is emailed to check her account: JMD amount, which account (last 4 digits only), reference, sender; the client gets nothing yet',
    !!bmail && bmail.subject.startsWith('Bank transfer sent to you – please check – Soft Glam – ') && bmail.html.includes('JMD $9,500') && bmail.html.includes('Test Bank A (account ending 5678)')
    && bmail.html.includes('TR-1357') && bmail.html.includes('Client 41') && bmail.html.includes("Don't confirm from a screenshot") && !bmail.html.includes('1234 5678')
    && bmail.text.includes('TR-1357') && bmail.text.includes('JMD $9,500') && mailsTo('client41@example.com').length === 0, bmail && bmail.subject);
  const hb2 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY3, '11:00'), ...person(42) });
  await call(co, { action: 'pay', booking_id: hb2.body.booking_id, method: 'bank' });
  const bDup = await call(co, { action: 'manual_submit', booking_id: hb2.body.booking_id, method: 'bank', reference: 'TR-1357', sender_name: 'Client 42', sent_to: '2' });
  check('the same transfer reference again is refused', bDup.status === 409 && /already been used/.test(bDup.body.error), bDup.body);
  // Pay in person (cash at the appointment)
  const hp7 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY3, '16:00'), ...person(45) });
  const cip = await call(co, { action: 'in_person', booking_id: hp7.body.booking_id });
  const bip = await bk(hp7.body.booking_id);
  check('pay in person: booked with a GBL- reference; cash still to pay; no payment recorded', cip.status === 200 && cip.body.status === 'confirmed' && /^GBL-[A-Z2-9]{6}$/.test(cip.body.reference || '')
    && bip.status === 'Confirmed' && bip.payment_method === 'cash' && bip.payment_status === 'unpaid' && (await pays(hp7.body.booking_id)).length === 0, { cip: cip.body, bip });
  const ipc = mailsTo('client45@example.com'), ipo = mailsTo(OWNER).find((m) => m.subject.includes('pay in person'));
  check('pay in person: the client\'s confirmation says to pay JMD $9,500 in cash at the appointment (no receipt yet)', ipc.length === 1 && /^\[TEST\] Booking confirmed|^Booking confirmed/.test(ipc[0].subject)
    && ipc[0].html.includes('Please pay JMD $9,500 in cash at your appointment') && ipc[0].html.includes('To pay at your appointment') && !ipc[0].html.includes('paid in full') && ipc[0].text.includes('You’ll get a receipt when you pay'), ipc.map((m) => m.subject));
  check('pay in person: Launthia is told it is a cash booking to collect at the appointment', !!ipo && ipo.subject.startsWith('New booking – pay in person (cash) – Soft Glam – ') && ipo.html.includes('JMD $9,500 in cash') && ipo.html.includes('Cash received'), ipo && ipo.subject);
  const cip2 = await call(co, { action: 'in_person', booking_id: hp7.body.booking_id });
  check('pay in person: a second tap does not book twice', cip2.status === 409 && /no longer held/.test(cip2.body.error), cip2.body);
  // on-site bank transfer: the booking reference from the start, the transaction reference, an optional receipt
  const hb3 = await call(co, { action: 'hold', service_id: SVC, start: at(DAY3, '13:00'), ...person(46) });
  const st3 = await call(co, { action: 'status', booking_id: hb3.body.booking_id });
  check('a booking has its own reference from the moment it is made (and its client sees it)', /^GBL-[A-Z2-9]{6}$/.test(hb3.body.reference || '') && st3.body.reference === hb3.body.reference
    && (await bk(hb3.body.booking_id)).reference === hb3.body.reference, { h: hb3.body.reference, s: st3.body.reference });
  await call(co, { action: 'pay', booking_id: hb3.body.booking_id, method: 'bank' });
  const bnr = await call(co, { action: 'manual_submit', booking_id: hb3.body.booking_id, method: 'bank', reference: '', sender_name: 'Client 46', sent_to: '2' });
  check('bank transfer with no transaction reference: refused, nothing saved', bnr.status === 409 && /transaction reference from your bank/.test(bnr.body.error) && (await bk(hb3.body.booking_id)).status === 'Held', bnr.body);
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const badRc = await call(co, { action: 'manual_submit', booking_id: hb3.body.booking_id, method: 'bank', reference: 'NCB-TX-4646', sender_name: 'Client 46', sent_to: '2',
    receipt: { name: 'x.png', type: 'image/png', data: Buffer.from('<script>alert(1)</script> not an image at all').toString('base64') } });
  check('a "receipt" that is not really a photo or PDF is refused before anything is saved', badRc.status === 400 && /photo \(JPG, PNG or WebP\) or a PDF/.test(badRc.body.error)
    && (await bk(hb3.body.booking_id)).status === 'Held' && Object.keys(STORED).length === 0, badRc.body);
  const bigRc = await call(co, { action: 'manual_submit', booking_id: hb3.body.booking_id, method: 'bank', reference: 'NCB-TX-4646', sender_name: 'Client 46', sent_to: '2',
    receipt: { name: 'big.png', type: 'image/png', data: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(5 * 1024 * 1024)]).toString('base64') } });
  check('a receipt over 5 MB is refused', bigRc.status === 400 && Object.keys(STORED).length === 0, bigRc.body);
  const okRc = await call(co, { action: 'manual_submit', booking_id: hb3.body.booking_id, method: 'bank', reference: 'NCB-TX-4646', sender_name: 'Client 46', sent_to: '2', receipt: { name: 'r.png', type: 'image/png', data: PNG } });
  const pr3 = (await q(`select id, status, provider_ref, receipt_path from public.payments where booking_id = $1`, [hb3.body.booking_id]))[0];
  check('with the transaction reference and a receipt: Awaiting verification, receipt stored privately under the booking and payment (never the client\'s file name)',
    okRc.status === 200 && okRc.body.receipt === 'saved' && okRc.body.reference === hb3.body.reference && (await bk(hb3.body.booking_id)).status === 'Pending payment'
    && pr3.status === 'awaiting review' && pr3.provider_ref === 'NCB-TX-4646' && pr3.receipt_path === hb3.body.booking_id + '/' + pr3.id + '.png'
    && STORED[pr3.receipt_path] && STORED[pr3.receipt_path].type === 'image/png' && !Object.keys(STORED).some((k) => /r\.png$/.test(k)), { b: okRc.body, pr3, stored: Object.keys(STORED) });
  const om3 = mailsTo(OWNER).find((m) => m.subject.startsWith('Bank transfer sent to you') && m.html.includes('Client 46'));
  check('Launthia is emailed with the booking reference, the transaction reference and "receipt added"', !!om3 && om3.html.includes(hb3.body.reference) && om3.html.includes('NCB-TX-4646') && /Added – open it on the booking/.test(om3.html), om3 && om3.subject);
  check('the customer can never mark it paid: a second submit is refused', (await call(co, { action: 'manual_submit', booking_id: hb3.body.booking_id, method: 'bank', reference: 'NCB-TX-4647', sender_name: 'Client 46', sent_to: '2' })).status === 409
    && (await bk(hb3.body.booking_id)).payment_status === 'pending');
  // storage down: the payment details still count; the client is told the receipt didn't upload
  globalThis.STORAGE_DOWN = true;
  const free4 = ((await call(co, { action: 'slots', service_id: SVC, day: DAY3 })).body.slots || [])[0];
  const hb4 = await call(co, { action: 'hold', service_id: SVC, start: free4 && free4.slot_start, ...person(47) });
  await call(co, { action: 'pay', booking_id: hb4.body.booking_id, method: 'bank' });
  const sd = await call(co, { action: 'manual_submit', booking_id: hb4.body.booking_id, method: 'bank', reference: 'NCB-TX-4747', sender_name: 'Client 47', sent_to: '1', receipt: { name: 'r.png', type: 'image/png', data: PNG } });
  globalThis.STORAGE_DOWN = false;
  check('if the receipt can\'t be stored, the payment details are still received (and the client is told)', sd.status === 200 && sd.body.receipt === 'not saved' && (await bk(hb4.body.booking_id)).status === 'Pending payment', sd.body);

  // ---- 14. release, limits
  const h15 = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '16:00'), ...person(16) });
  const rel = await call(co, { action: 'release', booking_id: h15.body.booking_id });
  check('release: the time is free again at once', rel.body.released === true && (await call(co, { action: 'slots', service_id: SVC, day: NEXT })).body.slots.some((s) => new Date(s.slot_start).toISOString() === at(NEXT, '16:00')), rel.body);
  const ip = '198.51.100.7'; let last;
  for (let i = 0; i < 9; i++) last = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '09:00'), ...person(100 + i) }, { ip });
  check('one visitor: the 9th hold attempt in 10 minutes is refused (429)', last.status === 429 && /Too many tries/.test(last.body.error), last.body);
  check('…another visitor is not affected', (await call(co, { action: 'options' }, { ip: '198.51.100.8' })).status === 200);
  check('visitors are counted under a code, never their address', !(await q(`select bucket from public.request_limits`)).some((r) => r.bucket.includes('198.51') || r.bucket.includes('203.0')));

  // ---- 15. emails (stage 3)
  const ref1 = (await bk(h1.body.booking_id)).reference;
  const c1 = mailsTo('client1@example.com'), conf = c1.find((m) => /Booking confirmed/.test(m.subject)), rcpt = c1.find((m) => /Receipt/.test(m.subject));
  check('paid by PayPal: the client got exactly 2 emails (confirmation + receipt)', c1.length === 2 && !!conf && !!rcpt, c1.map((m) => m.subject));
  check('confirmation: from the bookings address, replies go to Launthia, marked TEST, with the reference',
    conf.from === ENV.CONFIRM_FROM && conf.reply_to === 'Launthiawatson@yahoo.com' && conf.subject.startsWith('[TEST] Booking confirmed – Soft Glam, ') && conf.subject.endsWith(`(${ref1})`), conf && { from: conf.from, subject: conf.subject, reply_to: conf.reply_to });
  check('confirmation: date, time, length, amount, studio, how to change, policy link, test banner',
    conf.html.includes(ref1) && /Monday, \d+ \w+ \d{4}/.test(conf.html) && conf.html.includes('10:00 AM') && conf.html.includes('1 hour') && conf.html.includes('USD $61.30') && conf.html.includes('JMD $9,500')
    && conf.html.includes('Station Road, Little London, Westmoreland, Jamaica') && conf.html.includes('tel:+18762778913') && conf.html.includes('https://glow.example/#cancellation') && conf.html.includes('TEST MODE'));
  check('confirmation: has a plain-text version with the same details', conf.text.includes(ref1) && conf.text.includes('10:00 AM') && !/<[a-z]/i.test(conf.text), conf.text);
  const cap1id = pp.orders.get(o1).captures[0];
  check('receipt: reference, amount in USD and the JMD price, PayPal, transaction id, paid to the business',
    rcpt.subject === `[TEST] Receipt for your booking ${ref1} – Glow by Launthia` && rcpt.html.includes('USD $61.30') && rcpt.html.includes('JMD $9,500') && rcpt.html.includes('PayPal')
    && rcpt.html.includes(cap1id) && rcpt.html.includes('Paid to Glow by Launthia (Launthia Watson)'), rcpt.subject);
  const ownerMails = mailsTo(OWNER), alert1 = ownerMails.find((m) => m.html.includes(ref1));
  check('Launthia\'s alert: from the alerts address, service, time, client, tap-to-call phone, amount, reference, dashboard link',
    !!alert1 && alert1.from === ENV.ALERT_FROM && !alert1.reply_to && alert1.subject.startsWith('[TEST] New paid booking – Soft Glam – ') && alert1.html.includes('Client 1')
    && alert1.html.includes('tel:+18765551001') && alert1.html.includes('USD $61.30') && alert1.html.includes('https://glow.example/owner'), alert1 && alert1.subject);
  check('Launthia\'s alert never includes the client\'s email address', !!alert1 && !alert1.html.includes('client1@example.com') && !alert1.text.includes('client1@example.com'));
  check('every email for that booking is logged as sent with Resend\'s id', (await logOf(h1.body.booking_id)).every((r) => r.status === 'sent' && /^em_/.test(r.provider_id)), await logOf(h1.body.booking_id));
  check('refreshing the return page and repeated notifications sent nothing twice', mailsTo('client1@example.com').length === 2 && ownerMails.filter((m) => m.html.includes(ref1)).length === 1);
  check('closed the tab: the PayPal notification also sends the confirmation, receipt and alert', mailsTo('client2@example.com').length === 2 && mailsTo(OWNER).some((m) => m.html.includes('Client 2')));
  check('return page and notification at the same moment: still exactly one of each email', mailsTo('client3@example.com').length === 2 && mailsTo(OWNER).filter((m) => m.html.includes('Client 3')).length === 1);
  check('not charged (time taken), refused, capture declined: no email to those clients', ['client5@example.com', 'client8@example.com', 'client12@example.com'].every((a) => mailsTo(a).length === 0));
  check('left PayPal then paid with a new order: confirmation + receipt once', mailsTo('client13@example.com').length === 2);
  check('a wrong amount: no client email; Launthia is told it needs her attention', mailsTo('client11@example.com').length === 0
    && mailsTo(OWNER).some((m) => m.subject.startsWith('[TEST] Booking needs your attention') && m.html.includes('Client 11')));
  check('pending, then completed by PayPal: confirmation and receipt sent once, after completion', mailsTo('client7@example.com').length === 2);
  const zmail = mailsTo(OWNER).find((m) => m.subject.includes('Zelle payment to check'));
  check('Zelle: Launthia is asked to check her bank (amount, confirmation number, sender); the client gets nothing yet',
    !!zmail && zmail.html.includes('ZL-778899') && zmail.html.includes('USD $61.30') && zmail.html.includes('Client 15') && zmail.html.includes("Don't confirm from a screenshot") && mailsTo('client15@example.com').length === 0, zmail && zmail.subject);
  check('no email contains a key or secret', !rs.delivered.some((m) => /re_test_key|service-role-key|A21TOKEN|WH7TEST/.test(JSON.stringify(m))));
  // a name that looks like code is shown as text, never as HTML
  const hx = await call(co, { action: 'hold', service_id: SVC, start: at(NEXT, '16:00'), name: '<b>Bo</b> & "Co"', email: 'bo@example.com', phone: '876-555-2001', agree_terms: true });
  const px = await call(co, { action: 'pay', booking_id: hx.body.booking_id, method: 'paypal' });
  approve(px.body.order_id);
  await call(co, { action: 'paypal_return', booking_id: hx.body.booking_id });
  const bx = mailsTo('bo@example.com');
  check('a client name with HTML in it is escaped in every email', bx.length === 2 && bx.every((m) => !m.html.includes('<b>Bo</b>') && m.html.includes('&lt;b&gt;Bo&lt;/b&gt;'))
    && mailsTo(OWNER).some((m) => m.html.includes('&lt;b&gt;Bo&lt;/b&gt; &amp; &quot;Co&quot;')), bx.map((m) => m.subject));
  // Resend fails: the email waits and is sent later, once
  await q(`update public.bookings set status = 'Expired' where status = 'Held'`);
  const hr = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '09:00'), ...person(30) });
  const pr = await call(co, { action: 'pay', booking_id: hr.body.booking_id, method: 'paypal' });
  approve(pr.body.order_id);
  rs.plan.push(500, 500, 500);
  const rr = await call(co, { action: 'paypal_return', booking_id: hr.body.booking_id });
  const lr = await logOf(hr.body.booking_id);
  check('Resend down for one email: the booking is still confirmed; that email waits for another try', rr.body.status === 'confirmed'
    && lr.filter((r) => r.status === 'queued' && r.attempts === 1).length === 1 && lr.filter((r) => r.status === 'sent').length === 2, lr);
  check('the email function refuses anyone else', (await emFlush()).status === 401 && (await emFlush('other-token')).status === 401 && (await emFlush('service-role-key')).status === 401);
  const fl = await emFlush('owner-token');
  check('Launthia\'s "send now" sends what was waiting, once', fl.status === 200 && fl.body.sent >= 1 && (await logOf(hr.body.booking_id)).every((r) => r.status === 'sent') && mailsTo('client30@example.com').length === 2, fl.body);
  // an email that was sent but not recorded (the sender stopped) is not delivered twice
  const before = rs.delivered.length;
  await q(`update public.email_log set status = 'sending', updated_at = now() - interval '11 minutes' where booking_id = $1 and kind = 'payment_receipt'`, [hr.body.booking_id]);
  await emFlush('owner-token');
  check('sent, but not recorded, then tried again: Resend\'s Idempotency-Key stops a second copy', rs.delivered.length === before && (await logOf(hr.body.booking_id)).every((r) => r.status === 'sent'));
  // a refused address is not retried
  await q(`update public.bookings set status = 'Expired' where status = 'Held'`);
  const hf = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '14:00'), ...person(31) });
  const pf = await call(co, { action: 'pay', booking_id: hf.body.booking_id, method: 'paypal' });
  approve(pf.body.order_id);
  rs.plan.push(422);
  const callsBefore = rs.calls;
  await call(co, { action: 'paypal_return', booking_id: hf.body.booking_id });
  const lf = await logOf(hf.body.booking_id);
  check('an address Resend refuses (422) is marked failed at once, not retried', lf.filter((r) => r.status === 'failed').length === 1 && rs.calls - callsBefore === 3, { lf, calls: rs.calls - callsBefore });
  // the database webhook path (for example after Launthia confirms a Zelle payment in her dashboard)
  const [{ id: qid }] = await q(`select id from public.email_log where kind = 'owner_zelle_check' order by id desc limit 1`);
  await q(`update public.email_log set status = 'queued', attempts = 0 where id = $1`, [qid]);
  const zBefore = rs.delivered.length;
  check('the database webhook needs the secret, and only for new emails', (await emHook(qid, { secret: 'x'.repeat(48) })).status === 401 && (await emHook(qid, { table: 'bookings' })).status === 400);
  const hk = await emHook(qid);
  check('the database webhook sends that email (Resend\'s key stops a duplicate of one already sent)', hk.status === 200 && rs.delivered.length === zBefore
    && (await q(`select status from public.email_log where id = $1`, [qid]))[0].status === 'sent', hk);
  const [{ glow_queue_email: queued }] = await q(`select public.glow_queue_email($1::uuid, null, 'booking_rescheduled', 'test:moved:' || $1::text)`, [h12.body.booking_id]);
  const [{ id: mid }] = await q(`select id from public.email_log where dedupe_key = 'test:moved:' || $1::text`, [h12.body.booking_id]);
  const hk2 = await emHook(mid);
  const moved = mailsTo('client13@example.com').find((m) => /new time/.test(m.subject));
  check('a new-time email Launthia chose to send: new date and time, how to reach her', queued === true && hk2.status === 200 && !!moved && moved.html.includes('1:00 PM') && moved.html.includes('New date'), moved && moved.subject);
  // alerts switched off
  await q(`update public.owner_settings set email_alerts = false where id = 1`);
  await q(`update public.bookings set status = 'Expired' where status = 'Held'`);
  const ho = await call(co, { action: 'hold', service_id: SVC, start: at(DAY, '16:00'), ...person(32) });
  const po = await call(co, { action: 'pay', booking_id: ho.body.booking_id, method: 'paypal' });
  approve(po.body.order_id);
  await call(co, { action: 'paypal_return', booking_id: ho.body.booking_id });
  check('email alerts switched off: the client still gets confirmation + receipt; Launthia\'s alert is skipped', mailsTo('client32@example.com').length === 2
    && (await logOf(ho.body.booking_id)).find((r) => r.kind === 'owner_new_booking').status === 'skipped' && !mailsTo(OWNER).some((m) => m.html.includes('Client 32')));
  await q(`update public.owner_settings set email_alerts = true where id = 1`);
  check('every email request matched Resend\'s spec', rs.violations.length === 0, rs.violations);

  // ---- 15b. the deposit (JMD 3,000 online, the rest in person) and the professional-photos add-on (JMD 3,000)
  await q(`update public.booking_settings set deposit_jmd = 3000, photos_addon_jmd = 3000; update public.payment_methods set enabled = false where method = 'cash'; update public.bookings set status = 'Expired' where status = 'Held'`);
  const od = await call(co, { action: 'options' });
  check('options: the website is told whether online booking is on, and her note for clients', od.status === 200 && od.body.accepting === true && 'message' in od.body, od.body);
  check('deposit: the website is told the deposit (3,000) and the photos price (3,000); pay in person is not offered', od.status === 200 && od.body.deposit_jmd === 3000 && od.body.photos_addon_jmd === 3000
    && !od.body.payment_methods.some((m) => m.method === 'cash'), od.body.payment_methods && od.body.payment_methods.map((m) => m.method));
  const DAYD = (await q(`select ($1::date + 4)::text as d`, [DAY]))[0].d;
  const hd = await call(co, { action: 'hold', service_id: SVC, start: at(DAYD, '11:00'), ...person(51), photos: true });
  check('deposit: a hold with photos: total 12,500 – deposit 3,000 now, balance 9,500 at the appointment', hd.status === 200 && hd.body.amount_jmd === 3000 && hd.body.total_jmd === 12500
    && hd.body.deposit_jmd === 3000 && hd.body.balance_jmd === 9500 && hd.body.photos_addon === true, hd.body);
  const hd2 = await call(co, { action: 'hold', service_id: SVC, start: at(DAYD, '13:00'), ...person(52), photos: 'yes' });
  check('deposit: only a real yes adds photos (anything else means no)', hd2.status === 200 && hd2.body.photos_addon === false && hd2.body.total_jmd === 9500 && hd2.body.balance_jmd === 6500, hd2.body);
  const ipd = await call(co, { action: 'in_person', booking_id: hd2.body.booking_id });
  check('deposit: booking with "pay in person" is refused by the server', ipd.status >= 400 && /not available/i.test(ipd.body.error || ''), ipd.body);
  const bd = await call(co, { action: 'pay', booking_id: hd.body.booking_id, method: 'bank' });
  const pd = await call(co, { action: 'pay', booking_id: hd2.body.booking_id, method: 'paypal' });
  check('deposit: the client is asked for the deposit only – JMD 3,000 by bank transfer, USD 19.36 by PayPal (at 155)', bd.status === 200 && bd.body.amount === 3000 && bd.body.currency === 'JMD'
    && pd.status === 200 && pd.body.amount === 19.36 && pd.body.currency === 'USD', [bd.body.amount, pd.body.amount]);
  const sdep = await call(co, { action: 'manual_submit', booking_id: hd.body.booking_id, method: 'bank', reference: 'TR-DEP-51', sender_name: 'Client 51', sent_to: '1' });
  const dmail = mailsTo(OWNER).find((m) => m.html.includes('TR-DEP-51'));
  check('deposit: Launthia looks for the JMD 3,000 deposit; her email shows the photos, the total and the balance', sdep.status === 200 && !!dmail && dmail.html.includes('Deposit to look for')
    && dmail.html.includes('JMD $3,000') && dmail.html.includes('Professional photos') && dmail.html.includes('JMD $12,500') && dmail.html.includes('JMD $9,500'), dmail && dmail.subject);

  // ---- 16. nothing PayPal-shaped was guessed
  check('every PayPal request matched PayPal\'s spec (no violations)', pp.violations.length === 0, pp.violations);
  const unknown = rpcCalls.filter((f) => !/^[a-z_]+$/.test(f));
  check('only known database functions were called', unknown.length === 0, unknown);
}

await pool.end();
console.log(R.join('\n'));
const fails = R.filter((x) => x.startsWith('FAIL')).length;
console.log(fails ? `${fails} FAILED of ${R.length}` : `ALL ${R.length} PASSED (${MODE})`);
process.exit(fails ? 1 : 0);
