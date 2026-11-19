-- =====================================================================================================
-- Glow by Launthia – automated tests for platform.sql (Stage 1: bookings, holds, payments, security).
--
-- For developers. Run on a copy of the database with psql, after setup.sql and platform.sql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking-platform.test.sql
-- Everything happens inside one transaction that is ROLLED BACK at the end: nothing is kept.
-- Every line of the report must say PASS, and the last line says how many passed.
-- Uses the same roles Supabase uses (anon = the public website, authenticated = signed in,
-- service_role = server-side Edge Functions).
-- =====================================================================================================

begin;

-- ---- test helpers (dropped by the rollback) ---------------------------------------------------------
create schema glow_test;
create table glow_test.results (n serial primary key, name text not null, ok boolean not null, detail text);
create table glow_test.vars (k text primary key, v jsonb);

create function glow_test.ok(p_name text, p_ok boolean, p_detail text default null) returns void
language sql security definer as $$ insert into glow_test.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
create function glow_test.put(p_k text, p_v jsonb) returns void
language sql security definer as $$ insert into glow_test.vars values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;
create function glow_test.get(p_k text) returns jsonb language sql stable security definer as $$ select v from glow_test.vars where k = p_k $$;
create function glow_test.id(p_k text) returns uuid language sql stable security definer as $$ select (v ->> 'booking_id')::uuid from glow_test.vars where k = p_k $$;
-- runs a statement as the CURRENT role and passes when it fails with a message containing p_like
create function glow_test.err(p_name text, p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform glow_test.ok(p_name, false, 'expected an error, got none');
  exception when others then
    perform glow_test.ok(p_name, sqlerrm ilike '%' || p_like || '%', sqlerrm);
  end;
end $$;
-- the test day: a Monday about 200 days ahead (nothing real is booked there), and times on it (Jamaica)
create function glow_test.day() returns date language sql stable as $$
  select d::date from generate_series((now() at time zone 'America/Jamaica')::date + 200, (now() at time zone 'America/Jamaica')::date + 206, interval '1 day') d
  where extract(dow from d) = 1 limit 1 $$;
create function glow_test.at(p_hhmm text, p_day date default null) returns timestamptz language sql stable as $$
  select (coalesce(p_day, glow_test.day()) + p_hhmm::time) at time zone 'America/Jamaica' $$;
create function glow_test.svc(p_slug text) returns uuid language sql stable security definer as $$ select id from public.services where slug = p_slug $$;
create function glow_test.slots(p_slug text, p_day date default null) returns text language sql stable as $$
  select coalesce(string_agg(to_char(s.slot_start at time zone 'America/Jamaica', 'HH24:MI'), ' ' order by s.slot_start), '')
  from public.get_available_slots(glow_test.svc(p_slug), coalesce(p_day, glow_test.day())) s $$;
create function glow_test.claims(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('email', p_email, 'role', 'authenticated')::text, true) $$;
create function glow_test.anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true) $$;
create function glow_test.server() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true) $$;
grant usage on schema glow_test to anon, authenticated, service_role;
grant execute on all functions in schema glow_test to anon, authenticated, service_role;

-- known starting point for the tests (only inside this transaction)
delete from public.availability_hours; delete from public.availability_breaks; delete from public.blocked_periods;
insert into public.availability_hours (weekday, start_time, end_time) select d, '09:00', '17:00' from generate_series(1, 6) d;
update public.booking_settings set slot_step_minutes = 60, buffer_minutes = 0, min_notice_minutes = 60, max_days_ahead = 365, hold_minutes = 15, max_active_holds = 30;
update public.services set active = true, bookable_online = true, price_jmd = 9500, duration_minutes = 60 where slug = 'soft-glam';
update public.payment_methods set enabled = false, jmd_per_usd = null, instructions = null;
delete from public.blocked_days where day = glow_test.day();
delete from public.admin_users where email <> 'launthiawatson@yahoo.com';
insert into public.admin_users (email) values ('launthiawatson@yahoo.com') on conflict do nothing;

-- ---- 1. starting data and rules ---------------------------------------------------------------------
select glow_test.ok('three starting services', (select count(*) from public.services where slug in ('soft-glam', 'full-glam', 'bridal-glam')) = 3);
select glow_test.ok('Full Glam is not bookable online until it has one price', (select not bookable_online and price_jmd is null from public.services where slug = 'full-glam'));
select glow_test.ok('Bridal is quote only', (select not bookable_online from public.services where slug = 'bridal-glam'));
select glow_test.err('an online service must have a price', $$update public.services set bookable_online = true where slug = 'full-glam'$$, 'services_online_needs_price');
select glow_test.err('Zelle cannot be switched on without instructions', $$update public.payment_methods set enabled = true, jmd_per_usd = 155 where method = 'zelle'$$, 'zelle_needs_instructions');
select glow_test.err('USD needs an exchange rate', $$update public.payment_methods set enabled = true where method = 'paypal'$$, 'usd_needs_rate');
select glow_test.err('durations come in 15-minute steps', $$update public.services set duration_minutes = 50 where slug = 'soft-glam'$$, 'services_duration_ok');

-- ---- 2. free times --------------------------------------------------------------------------------
select glow_test.ok('Monday 9 to 5, one-hour service: 8 start times', glow_test.slots('soft-glam') = '09:00 10:00 11:00 12:00 13:00 14:00 15:00 16:00', glow_test.slots('soft-glam'));
select glow_test.ok('Sunday: closed', glow_test.slots('soft-glam', glow_test.day() - 1) = '');
select glow_test.ok('no times for a service that is not bookable online', glow_test.slots('full-glam') = '');
select glow_test.ok('the past is never offered', glow_test.slots('soft-glam', (now() at time zone 'America/Jamaica')::date - 1) = '');
select glow_test.ok('today: nothing sooner than the minimum notice',
  not exists (select 1 from public.get_available_slots(glow_test.svc('soft-glam'), (now() at time zone 'America/Jamaica')::date) s where s.slot_start < now() + interval '60 minutes'));
select glow_test.ok('nothing beyond the booking horizon', glow_test.slots('soft-glam', (now() at time zone 'America/Jamaica')::date + 400) = '');
insert into public.blocked_days (day) values (glow_test.day());
select glow_test.ok('a day off (Settings) has no times', glow_test.slots('soft-glam') = '');
delete from public.blocked_days where day = glow_test.day();
insert into public.availability_breaks (weekday, start_time, end_time, label) values (1, '12:00', '13:00', 'Lunch');
insert into public.blocked_periods (starts_at, ends_at, reason) values (glow_test.at('14:00'), glow_test.at('16:00'), 'test');
select glow_test.ok('a lunch break and a blocked afternoon are skipped', glow_test.slots('soft-glam') = '09:00 10:00 11:00 13:00 16:00', glow_test.slots('soft-glam'));
delete from public.availability_breaks; delete from public.blocked_periods;
update public.booking_settings set buffer_minutes = 30, slot_step_minutes = 30;
update public.services set duration_minutes = 90 where slug = 'soft-glam';
select glow_test.ok('90 minutes, 30-minute steps: last start leaves time to finish by 5', glow_test.slots('soft-glam') like '09:00 09:30 % 15:30', glow_test.slots('soft-glam'));
update public.booking_settings set buffer_minutes = 0, slot_step_minutes = 60;
update public.services set duration_minutes = 60 where slug = 'soft-glam';
select glow_test.ok('free days for the month include the Monday, not the Sunday',
  glow_test.day() in (select public.get_available_days(glow_test.svc('soft-glam'), glow_test.day() - 1, glow_test.day() + 1))
  and (glow_test.day() - 1) not in (select public.get_available_days(glow_test.svc('soft-glam'), glow_test.day() - 1, glow_test.day() + 1)));

-- ---- 3. holding a time (through the checkout server; the public may only read) ----------------------------
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot hold a time directly (only through the checkout server)', format($$select public.create_booking_hold(%L, %L, 'Ama Brown', 'ama@example.com', '876-555-0101', true)$$, glow_test.svc('soft-glam'), glow_test.at('10:00')), 'permission denied');
select glow_test.err('the public cannot cancel a hold directly', 'select public.cancel_booking_hold(gen_random_uuid())', 'permission denied');
select glow_test.err('the public cannot send a Zelle reference directly', $$select public.submit_zelle_payment(gen_random_uuid(), 'ZL-0000', 'X Y')$$, 'permission denied');
reset role;
set local role service_role;
select glow_test.server();
select glow_test.put('a', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('10:00'), 'Ama Brown', 'Ama@Example.com', '876-555-0101', true));
select glow_test.ok('hold made: 15 minutes, JMD 9,500', (glow_test.get('a') ->> 'amount_jmd')::int = 9500 and (glow_test.get('a') ->> 'hold_expires_at')::timestamptz = now() + interval '15 minutes');
select glow_test.ok('the held time disappears for everyone else', glow_test.slots('soft-glam') not like '%10:00%');
select glow_test.err('the same time cannot be held twice', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@example.com', '876-555-0102', true)$$, glow_test.svc('soft-glam'), glow_test.at('10:00')), 'no longer available');
select glow_test.err('terms must be agreed', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@example.com', '876-555-0102', false)$$, glow_test.svc('soft-glam'), glow_test.at('11:00')), 'agree to the Terms');
select glow_test.err('a valid email is needed', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@', '876-555-0102', true)$$, glow_test.svc('soft-glam'), glow_test.at('11:00')), 'valid email');
select glow_test.err('a valid phone is needed', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@example.com', 'call me', true)$$, glow_test.svc('soft-glam'), glow_test.at('11:00')), 'valid phone');
select glow_test.err('a quote-only service cannot be held', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@example.com', '876-555-0102', true)$$, glow_test.svc('bridal-glam'), glow_test.at('11:00')), 'can’t be booked online');
select glow_test.err('a time that is not a real start time is refused', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@example.com', '876-555-0102', true)$$, glow_test.svc('soft-glam'), glow_test.at('11:20')), 'no longer available');
select glow_test.err('a past time is refused', format($$select public.create_booking_hold(%L, %L, 'Bea Clarke', 'bea@example.com', '876-555-0102', true)$$, glow_test.svc('soft-glam'), glow_test.at('10:00', (now() at time zone 'America/Jamaica')::date - 7)), 'no longer available');
select glow_test.put('a2', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('11:00'), 'Ama Brown', 'ama@example.com', '876-555-0101', true));
select glow_test.err('a third hold at once for the same person is refused', format($$select public.create_booking_hold(%L, %L, 'Ama Brown', 'ama@example.com', '(876) 555 0101', true)$$, glow_test.svc('soft-glam'), glow_test.at('13:00')), 'waiting for payment');
select glow_test.put('x29', public.cancel_booking_hold(glow_test.id('a2')));
select glow_test.ok('changing their mind frees the time at once', (glow_test.get('x29') ->> 'released')::boolean and glow_test.slots('soft-glam') like '%11:00%');
select glow_test.put('a3', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('16:00'), 'Someone Else', 'AMA@example.com', '876-555-0199', true));
select glow_test.put('x29b', public.cancel_booking_hold(glow_test.id('a3')));
reset role;
select glow_test.ok('typing an existing email never changes that customer''s saved name or phone',
  (select full_name = 'Ama Brown' and phone = '876-555-0101' from public.customers where email = 'ama@example.com')
  and (select client_name = 'Someone Else' from public.bookings where id = glow_test.id('a3')));
set local role anon;
select glow_test.anon();
select glow_test.ok('the public sees the hold status, but no reference, name, email or phone',
  (select s ->> 'status' = 'Held' and s ->> 'reference' is null and not (s ? 'client_name') and not (s ? 'email') and not (s ? 'phone')
   from public.get_booking_status(glow_test.id('a')) s));
select glow_test.err('the public cannot read bookings', 'select count(*) from public.bookings', 'permission denied');
select glow_test.err('the public cannot read customers', 'select count(*) from public.customers', 'permission denied');
select glow_test.err('the public cannot read payments', 'select count(*) from public.payments', 'permission denied');
select glow_test.err('the public cannot read blocked times', 'select count(*) from public.blocked_periods', 'permission denied');
select glow_test.err('the public cannot confirm a payment', format($$select public.confirm_booking_payment(%L, 'card', 'FAKE-1', 9500, 'JMD')$$, glow_test.id('a')), 'permission denied');
select glow_test.err('the public cannot start a payment', format($$select public.prepare_payment(%L, 'card')$$, glow_test.id('a')), 'permission denied');
select glow_test.err('the public cannot release holds', 'select public.release_expired_holds()', 'permission denied');
select glow_test.err('the public cannot write a hold directly', format($$insert into public.bookings (client_name, phone, service, appt_date, appt_time, terms_agreed_at, start_at, block_until, status) values ('X', '876-555-0109', 'Soft Glam', %L, '15:00', now(), %L, %L, 'Requested')$$, glow_test.day(), glow_test.at('15:00'), glow_test.at('16:00')), 'permission denied');
select glow_test.ok('the public sees only payment methods that are switched on (none yet)', (select count(*) from public.payment_methods) = 0 and jsonb_array_length(public.get_booking_options() -> 'payment_methods') = 0);
-- the website's current booking form still works (same columns as today), and blocks its hour
insert into public.bookings (client_name, phone, email, service, appt_date, appt_time, price_jmd, terms_agreed_at) values ('Old Form', '876-555-0110', 'old@example.com', 'Soft Glam', glow_test.day(), '13:00', 9500, now());
select glow_test.ok('a request from the current form blocks its hour', glow_test.slots('soft-glam') not like '%13:00%', glow_test.slots('soft-glam'));
reset role;

-- even if setup.sql is run again (it gives the public the whole table back), a direct row keeps no platform fields
grant insert on public.bookings to anon;
set local role anon;
select glow_test.anon();
insert into public.bookings (client_name, phone, service, appt_date, appt_time, terms_agreed_at, start_at, end_at, block_until, payment_status, reference, amount_jmd)
values ('Sneaky', '876-555-0111', 'Soft Glam', glow_test.day(), '15:00', now(), glow_test.at('15:00'), glow_test.at('16:00'), glow_test.at('16:00'), 'paid', 'GBL-AAAAAA', 1);
reset role;
select glow_test.ok('a direct row cannot pretend to be paid or hold a time',
  (select payment_status = 'unpaid' and reference is null and start_at is null and amount_jmd is null and status = 'Requested' from public.bookings where client_name = 'Sneaky'));
revoke insert on public.bookings from anon;
grant insert (client_name, phone, email, service, appt_date, appt_time, price_jmd, client_note, terms_agreed_at, status) on public.bookings to anon;
delete from public.bookings where client_name in ('Sneaky', 'Old Form');

-- the database itself refuses overlaps, whatever writes the row
select glow_test.err('the database refuses two overlapping bookings', format($$insert into public.bookings (client_name, phone, service, appt_date, appt_time, terms_agreed_at, start_at, end_at, block_until, status) values ('Race', '876-555-0112', 'Soft Glam', %L, '10:30', now(), %L, %L, %L, 'Held')$$, glow_test.day(), glow_test.at('10:30'), glow_test.at('11:30'), glow_test.at('11:30')), 'bookings_no_overlap');

-- ---- 4. holds that run out ---------------------------------------------------------------------------
update public.bookings set hold_expires_at = now() - interval '1 second' where id = glow_test.id('a');
select glow_test.ok('an expired hold gives the time back', glow_test.slots('soft-glam') like '%10:00%');
set local role service_role;
select glow_test.server();
select glow_test.put('b', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('10:00'), 'Bea Clarke', 'bea@example.com', '876-555-0102', true));
select glow_test.ok('the expired hold shows as Expired to its client', (public.get_booking_status(glow_test.id('a')) ->> 'status') = 'Expired');
reset role;
select glow_test.ok('someone else can then hold it; the old hold is marked Expired', (select status from public.bookings where id = glow_test.id('a')) = 'Expired' and (select status from public.bookings where id = glow_test.id('b')) = 'Held');
update public.booking_settings set max_active_holds = (select count(*) from public.bookings where status = 'Held' and hold_expires_at > now());
set local role service_role;
select glow_test.server();
select glow_test.err('a cap on holds at once stops anyone holding every time', format($$select public.create_booking_hold(%L, %L, 'Cid Dunn', 'cid@example.com', '876-555-0103', true)$$, glow_test.svc('soft-glam'), glow_test.at('15:00')), 'very busy');
reset role;
update public.booking_settings set max_active_holds = 30;

-- ---- 5. card payment (server side) -------------------------------------------------------------------
update public.payment_methods set enabled = true where method = 'card';
set local role anon;
select glow_test.anon();
select glow_test.ok('the public now sees the card option only', (select string_agg(method, ',') from public.payment_methods) = 'card' and (public.get_booking_options() -> 'payment_methods' -> 0 ->> 'method') = 'card');
reset role;
set local role service_role;
select glow_test.put('pb', public.prepare_payment(glow_test.id('b'), 'card'));
select glow_test.ok('prepare: exact amount from the database (JMD 9,500)', (glow_test.get('pb') ->> 'ok')::boolean and (glow_test.get('pb') ->> 'amount')::numeric = 9500 and glow_test.get('pb') ->> 'currency' = 'JMD');
select glow_test.ok('prepare refuses a method that is off', not (public.prepare_payment(glow_test.id('b'), 'paypal') ->> 'ok')::boolean);
select glow_test.put('rb', public.record_payment_started(glow_test.id('b'), 'card', 'FAC-TEST-1', 9500, 'JMD'));
select glow_test.put('cb', public.confirm_booking_payment(glow_test.id('b'), 'card', 'FAC-TEST-1', 9500, 'JMD', 'approved'));
select glow_test.ok('verified payment confirms the booking with a reference', glow_test.get('cb') ->> 'result' = 'confirmed' and glow_test.get('cb') ->> 'reference' ~ '^GBL-[A-Z2-9]{6}$', glow_test.get('cb')::text);
select glow_test.put('cb2', public.confirm_booking_payment(glow_test.id('b'), 'card', 'FAC-TEST-1', 9500, 'JMD', 'approved'));
select glow_test.ok('the same payment again changes nothing (once only)', glow_test.get('cb2') ->> 'result' = 'already' and glow_test.get('cb2') ->> 'reference' = glow_test.get('cb') ->> 'reference');
reset role;
select glow_test.ok('booking Confirmed + paid; one succeeded payment, checked by the gateway',
  (select status = 'Confirmed' and payment_status = 'paid' and confirmed_at is not null and hold_expires_at is null from public.bookings where id = glow_test.id('b'))
  and (select count(*) = 1 and bool_and(status = 'succeeded' and verified_by = 'gateway') from public.payments where booking_id = glow_test.id('b')));
set local role anon;
select glow_test.anon();
select glow_test.ok('the client''s status page now shows the reference', public.get_booking_status(glow_test.id('b')) ->> 'reference' = glow_test.get('cb') ->> 'reference');
reset role;
set local role service_role;
select glow_test.put('cb3', public.confirm_booking_payment(glow_test.id('b'), 'card', 'FAC-TEST-2', 9500, 'JMD'));
select glow_test.ok('a second, different payment for a paid booking is flagged for refund', glow_test.get('cb3') ->> 'result' = 'duplicate_payment');
reset role;

-- ---- 6. PayPal in USD, wrong amounts, declines ------------------------------------------------------
update public.payment_methods set enabled = true, jmd_per_usd = 155 where method = 'paypal';
set local role service_role;
select glow_test.server();
select glow_test.put('c', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('11:00'), 'Cid Dunn', 'cid@example.com', '876-555-0103', true));
reset role;
set local role service_role;
select glow_test.put('pc', public.prepare_payment(glow_test.id('c'), 'paypal'));
select glow_test.ok('PayPal amount: JMD 9,500 at 155 = USD 61.30 (rounded up to the cent)', (glow_test.get('pc') ->> 'amount')::numeric = 61.30 and glow_test.get('pc') ->> 'currency' = 'USD', glow_test.get('pc')::text);
select glow_test.put('rc', public.record_payment_started(glow_test.id('c'), 'paypal', 'PP-ORDER-1', 61.30, 'USD'));
select glow_test.ok('a payment for less than asked is not accepted', public.confirm_booking_payment(glow_test.id('c'), 'paypal', 'PP-ORDER-1', 50, 'USD') ->> 'result' = 'amount_mismatch');
reset role;
select glow_test.ok('…the booking is flagged Needs attention, never Confirmed', (select status = 'Needs attention' and payment_status <> 'paid' and reference is null from public.bookings where id = glow_test.id('c')));
set local role service_role;
select glow_test.server();
select glow_test.put('d', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('12:00'), 'Dee Ellis', 'dee@example.com', '876-555-0104', true));
reset role;
set local role service_role;
select glow_test.ok('wrong currency is not accepted', public.confirm_booking_payment(glow_test.id('d'), 'paypal', 'PP-ORDER-2', 9500, 'JMD') ->> 'result' = 'amount_mismatch');
reset role;
update public.bookings set status = 'Held' where id = glow_test.id('d');
set local role service_role;
select glow_test.ok('client pressed back: the hold is kept to try again', public.fail_booking_payment(glow_test.id('d'), 'paypal', 'PP-ORDER-3', 'cancelled', 'buyer cancelled') ->> 'result' = 'recorded');
select glow_test.ok('declined: the time is released', public.fail_booking_payment(glow_test.id('d'), 'card', 'FAC-TEST-3', 'failed', 'declined') ->> 'result' = 'released');
reset role;
select glow_test.ok('…and is free again, with the failed payment on record', glow_test.slots('soft-glam') like '%12:00%'
  and (select status from public.payments where provider_ref = 'FAC-TEST-3') = 'failed');
set local role service_role;
select glow_test.ok('a failure report never undoes a success', (public.fail_booking_payment(glow_test.id('b'), 'card', 'FAC-TEST-1', 'failed') ->> 'result') = 'recorded'
  and (select status from public.payments where provider_ref = 'FAC-TEST-1') = 'succeeded');
select glow_test.put('ev1', to_jsonb(public.record_payment_event('paypal', 'WH-1', 'PAYMENT.CAPTURE.COMPLETED')));
select glow_test.put('ev2', to_jsonb(public.record_payment_event('paypal', 'WH-1', 'PAYMENT.CAPTURE.COMPLETED')));
select public.finish_payment_event('paypal', 'WH-1', 'test');
select glow_test.put('ev3', to_jsonb(public.record_payment_event('paypal', 'WH-1', 'PAYMENT.CAPTURE.COMPLETED')));
select glow_test.ok('a gateway notification: new, then retried until handled, then skipped',
  glow_test.get('ev1') #>> '{}' = 'new' and glow_test.get('ev2') #>> '{}' = 'retry' and glow_test.get('ev3') #>> '{}' = 'done');
reset role;

-- ---- 7. paid after the hold ran out ---------------------------------------------------------------------
set local role service_role;
select glow_test.server();
select glow_test.put('e', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('15:00'), 'Eve Fox', 'eve@example.com', '876-555-0105', true));
reset role;
update public.bookings set hold_expires_at = now() - interval '1 second' where id = glow_test.id('e');
set local role service_role;
select glow_test.server();
select glow_test.put('f', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('15:00'), 'Fay Gale', 'fay@example.com', '876-555-0106', true));
reset role;
set local role service_role;
select glow_test.put('ce', public.confirm_booking_payment(glow_test.id('e'), 'card', 'FAC-TEST-4', 9500, 'JMD'));
reset role;
select glow_test.ok('paid too late for a time someone else now holds: Needs attention, no double booking',
  glow_test.get('ce') ->> 'result' = 'conflict'
  and (select status = 'Needs attention' and payment_status = 'paid' from public.bookings where id = glow_test.id('e'))
  and (select status from public.bookings where id = glow_test.id('f')) = 'Held', glow_test.get('ce')::text);
set local role service_role;
select glow_test.server();
select glow_test.put('g', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('16:00'), 'Gia Hill', 'gia@example.com', '876-555-0107', true));
reset role;
update public.bookings set hold_expires_at = now() - interval '1 second' where id = glow_test.id('g');
set local role service_role;
select glow_test.ok('paid a little late but the time is still free: confirmed', public.confirm_booking_payment(glow_test.id('g'), 'card', 'FAC-TEST-5', 9500, 'JMD') ->> 'result' = 'confirmed');
reset role;
update public.bookings set created_at = now() - interval '25 minutes', hold_expires_at = now() + interval '1 minute' where id = glow_test.id('f');
set local role service_role;
select glow_test.ok('a hold can be refreshed for payment, but never past twice its length', (public.prepare_payment(glow_test.id('f'), 'card') ->> 'hold_expires_at')::timestamptz = now() + interval '5 minutes');
reset role;

-- ---- 8. Zelle (manual check by Launthia) -----------------------------------------------------------------
update public.payment_methods set enabled = true, jmd_per_usd = 155, instructions = '[Owner to confirm: Zelle instructions]' where method = 'zelle';
set local role service_role;
select glow_test.server();
select glow_test.put('h', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('09:00'), 'Hana Ives', 'hana@example.com', '876-555-0108', true));
select glow_test.put('zh', public.submit_zelle_payment(glow_test.id('h'), 'ZL-12345', 'Hana Ives'));
select glow_test.ok('Zelle reference sent: Pending payment, never paid by itself',
  glow_test.get('zh') ->> 'status' = 'Pending payment' and (glow_test.get('zh') ->> 'amount')::numeric = 61.30
  and public.get_booking_status(glow_test.id('h')) ->> 'payment_status' = 'pending' and public.get_booking_status(glow_test.id('h')) ->> 'reference' is null);
select glow_test.err('a Zelle confirmation number can be used once', format($$select public.submit_zelle_payment(%L, 'ZL-12345', 'Bea Clarke')$$, glow_test.id('f')), 'already been used');
reset role;
select glow_test.ok('the Zelle time stays booked while Launthia checks', glow_test.slots('soft-glam') not like '%09:00%');
set local role authenticated;
select glow_test.claims('someone@example.com');
select glow_test.err('a signed-in non-owner cannot verify Zelle', format($$select public.admin_verify_zelle(%L, true)$$, glow_test.id('h')), 'Only the owner');
select glow_test.ok('a signed-in non-owner sees no bookings, payments or customers',
  (select count(*) from public.bookings) = 0 and (select count(*) from public.payments) = 0 and (select count(*) from public.customers) = 0);
select glow_test.err('a signed-in non-owner cannot add a service', $$insert into public.services (slug, name, price_jmd) values ('x-test', 'X Test', 100)$$, 'row-level security');
select glow_test.claims('LaunthiaWatson@yahoo.com');
select glow_test.put('vh', public.admin_verify_zelle(glow_test.id('h'), true, 'seen in bank'));
select glow_test.ok('Launthia confirms the money arrived: Confirmed with a reference', glow_test.get('vh') ->> 'result' = 'confirmed' and glow_test.get('vh') ->> 'reference' like 'GBL-%');
select glow_test.ok('…recorded as checked by her', (select verified_by from public.payments where provider_ref = 'ZL-12345') = 'launthiawatson@yahoo.com');
select glow_test.err('…and cannot be confirmed twice', format($$select public.admin_verify_zelle(%L, true)$$, glow_test.id('h')), 'no Zelle payment waiting');
reset role;
set local role service_role;
select glow_test.server();
select glow_test.put('i', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('14:00'), 'Ian Jay', 'ian@example.com', '876-555-0113', true));
select glow_test.put('zi', public.submit_zelle_payment(glow_test.id('i'), 'ZL-99999', 'Ian Jay'));
reset role;
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('x75', public.admin_verify_zelle(glow_test.id('i'), false, 'not in account'));
select glow_test.ok('money never arrived: rejected and the time is free again',
  glow_test.get('x75') ->> 'result' = 'rejected' and glow_test.slots('soft-glam') like '%14:00%');

-- ---- 9. the dashboard: reschedule, cancel, refund, services --------------------------------------------
select glow_test.err('cannot move onto another booking', format($$select public.admin_reschedule_booking(%L, %L)$$, glow_test.id('b'), glow_test.at('09:00')), 'overlaps another booking');
select glow_test.err('cannot move into the past', format($$select public.admin_reschedule_booking(%L, %L)$$, glow_test.id('b'), now() - interval '1 day'), 'future time');
select glow_test.put('x78', public.admin_reschedule_booking(glow_test.id('b'), glow_test.at('13:00')));
select glow_test.ok('moves to a free time (date and time on the booking updated)', glow_test.get('x78') ->> 'result' = 'moved'
  and (select appt_time = '13:00' and start_at = glow_test.at('13:00') and rescheduled_at is not null from public.bookings where id = glow_test.id('b')));
select glow_test.ok('…the old time is free, the new one is taken', glow_test.slots('soft-glam') like '%10:00%' and glow_test.slots('soft-glam') not like '%13:00%');
select glow_test.put('x80', public.admin_reschedule_booking(glow_test.id('e'), glow_test.at('10:00')));
select glow_test.ok('the late-paid booking can be moved to a free time and becomes Confirmed', glow_test.get('x80') ->> 'result' = 'moved'
  and (select status = 'Confirmed' and reference like 'GBL-%' from public.bookings where id = glow_test.id('e')));
select glow_test.put('x81', public.admin_cancel_booking(glow_test.id('b'), 'client asked'));
select glow_test.ok('cancel frees the time', glow_test.get('x81') ->> 'result' = 'cancelled' and glow_test.slots('soft-glam') like '%13:00%');
select glow_test.err('cannot cancel twice', format($$select public.admin_cancel_booking(%L)$$, glow_test.id('b')), 'can’t be cancelled');
select glow_test.put('pay_b', (select to_jsonb(p.id) from public.payments p where p.provider_ref = 'FAC-TEST-1'));
select glow_test.put('pay_b2', (select to_jsonb(p.id) from public.payments p where p.provider_ref = 'FAC-TEST-2'));
select glow_test.put('x82', public.admin_record_refund((glow_test.get('pay_b2') #>> '{}')::uuid, 9500, 'paid twice'));
select glow_test.ok('refunding the duplicate payment: that payment refunded, the booking still paid',
  (select status from public.payments where provider_ref = 'FAC-TEST-2') = 'refunded'
  and (select payment_status from public.bookings where id = glow_test.id('b')) = 'paid');
select glow_test.put('x83', public.admin_record_refund((glow_test.get('pay_b') #>> '{}')::uuid, 2000, 'part refund'));
select glow_test.ok('part refund recorded', glow_test.get('x83') ->> 'refunded_jmd' = '2000'
  and (select payment_status from public.bookings where id = glow_test.id('b')) = 'partly refunded');
select glow_test.err('cannot refund more than was paid', format($$select public.admin_record_refund(%L, 8000)$$, glow_test.get('pay_b') #>> '{}'), 'more than what was paid');
select glow_test.put('x85', public.admin_record_refund((glow_test.get('pay_b') #>> '{}')::uuid, 7500));
select glow_test.ok('rest refunded: fully refunded', glow_test.get('x85') ->> 'refunded_jmd' = '9500'
  and (select status from public.payments where provider_ref = 'FAC-TEST-1') = 'refunded'
  and (select payment_status from public.bookings where id = glow_test.id('b')) = 'refunded');
select glow_test.ok('each refund is kept as its own row, by Launthia', (select count(*) = 3 and bool_and(source = 'manual' and recorded_by = 'launthiawatson@yahoo.com')
  from public.payment_refunds r join public.payments p on p.id = r.payment_id where p.booking_id = glow_test.id('b')));
insert into public.services (slug, name, description, price_jmd, duration_minutes) values ('lash-add-on', 'Lash Add-on', 'Test', 2000, 30);
select glow_test.ok('Launthia can add, price and switch off a service', (select count(*) from public.services where slug = 'lash-add-on') = 1);
update public.services set active = false where slug = 'lash-add-on';
select glow_test.ok('Launthia sees all bookings, payments and customers', (select count(*) from public.bookings) > 0 and (select count(*) from public.payments) > 0 and (select count(*) from public.customers) > 0);
update public.bookings set status = 'Done' where id = glow_test.id('g');
select glow_test.ok('Launthia can still use the current dashboard (mark a booking Done)', (select status from public.bookings where id = glow_test.id('g')) = 'Done');
reset role;
set local role anon;
select glow_test.anon();
select glow_test.ok('a switched-off service is hidden from the public', not exists (select 1 from public.services where slug = 'lash-add-on'));
select glow_test.put('jwt', to_jsonb(set_config('request.jwt.claims', '{"role":"anon","email":"launthiawatson@yahoo.com"}', true)));
select glow_test.ok('an admin email without a signed-in token is not an admin', not public.is_admin());
reset role;

-- ---- 10. one confirmation per booking ------------------------------------------------------------------------
insert into public.email_log (booking_id, kind, to_email, status) values (glow_test.id('h'), 'booking_confirmation', 'hana@example.com', 'sent');
select glow_test.err('an email kind is recorded as sent once per booking', format($$insert into public.email_log (booking_id, kind, to_email, status) values (%L, 'booking_confirmation', 'hana@example.com', 'sent')$$, glow_test.id('h')), 'email_log_once');
select glow_test.ok('every new table has Row Level Security on', (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'
  and tablename in ('admin_users', 'services', 'availability_hours', 'availability_breaks', 'blocked_periods', 'booking_settings', 'payment_methods', 'customers', 'bookings', 'payments', 'payment_events', 'email_log', 'payment_refunds', 'request_limits')));

-- ---- 11. payments backend (stage 2) ---------------------------------------------------------------------------
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot check a payment before capture', $$select public.lock_for_capture(gen_random_uuid(), 'paypal', 'X-1')$$, 'permission denied');
select glow_test.err('the public cannot clear a capture claim', $$select public.release_capture_claim('paypal', 'X-1')$$, 'permission denied');
select glow_test.err('the public cannot look up payments', $$select public.find_payment('paypal', 'X-1')$$, 'permission denied');
select glow_test.err('the public cannot record a refund', $$select public.record_gateway_refund('paypal', 'T-1', 'R-1', 1, 'USD')$$, 'permission denied');
select glow_test.err('the public cannot touch the request counters', $$select public.glow_rate_hit('x', 1, 60)$$, 'permission denied');
select glow_test.err('the public cannot read the request counters', 'select count(*) from public.request_limits', 'permission denied');
select glow_test.err('the public cannot read refunds', 'select count(*) from public.payment_refunds', 'permission denied');
select glow_test.ok('the public can still ask for free times, services and a booking''s status',
  jsonb_array_length(public.get_booking_options() -> 'services') = 3 and glow_test.slots('soft-glam') <> '');
reset role;

set local role service_role;
select glow_test.server();
-- PayPal: an approved order, captured later as PENDING, then COMPLETED
select glow_test.put('j', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('11:00', glow_test.day() + 1), 'Jo King', 'jo@example.com', '876-555-0114', true));
select glow_test.put('pj', public.prepare_payment(glow_test.id('j'), 'paypal'));
select glow_test.ok('record start: a different amount is refused', not (public.record_payment_started(glow_test.id('j'), 'paypal', 'PP-J-1', 61.29, 'USD', true) ->> 'ok')::boolean);
select glow_test.put('rj', public.record_payment_started(glow_test.id('j'), 'paypal', 'PP-J-1', 61.30, 'USD', true));
select glow_test.ok('record start: the exact amount is kept, flagged as a test', (glow_test.get('rj') ->> 'ok')::boolean
  and (public.find_payment('paypal', 'PP-J-1') ->> 'is_test')::boolean and public.find_payment('paypal', null, null, glow_test.id('j')) ->> 'provider_ref' = 'PP-J-1');
select glow_test.ok('record start: a reference of another booking is refused', public.record_payment_started(glow_test.id('f'), 'card', 'FAC-TEST-1', 9500, 'JMD') ->> 'reason' = 'reference belongs to another booking');
select glow_test.ok('before capture: an unknown order is never captured', public.lock_for_capture(glow_test.id('j'), 'paypal', 'PP-NOPE') ->> 'result' = 'unknown_payment');
select glow_test.ok('before capture: the held time is confirmed free', (public.lock_for_capture(glow_test.id('j'), 'paypal', 'PP-J-1') ->> 'ok')::boolean);
select glow_test.put('mj', public.mark_payment_pending(glow_test.id('j'), 'paypal', 'PP-J-1', 'PENDING', 'CAP-J-1'));
reset role;
select glow_test.ok('capture PENDING: Pending payment, time kept, nothing confirmed',
  glow_test.get('mj') ->> 'result' = 'pending'
  and (select status = 'Pending payment' and payment_status = 'pending' and reference is null and hold_expires_at is null from public.bookings where id = glow_test.id('j'))
  and (select status = 'awaiting review' and gateway_txn_id = 'CAP-J-1' from public.payments where provider_ref = 'PP-J-1')
  and glow_test.slots('soft-glam', glow_test.day() + 1) not like '%11:00%');
set local role service_role;
select glow_test.server();
select glow_test.put('cj', public.confirm_booking_payment(glow_test.id('j'), 'paypal', 'PP-J-1', 61.30, 'USD', 'COMPLETED', 'gateway', 'CAP-J-1'));
select glow_test.ok('then COMPLETED: Confirmed with a reference', glow_test.get('cj') ->> 'result' = 'confirmed');
select glow_test.ok('a late PENDING report after completion changes nothing', public.mark_payment_pending(glow_test.id('j'), 'paypal', 'PP-J-1', 'PENDING') ->> 'result' = 'already');
select glow_test.ok('the payment can be found by its PayPal capture id', public.find_payment('paypal', null, 'CAP-J-1') ->> 'provider_ref' = 'PP-J-1');
-- PayPal refunds reported by PayPal
select glow_test.put('gr1', public.record_gateway_refund('paypal', 'CAP-J-1', 'REF-J-1', 20.00, 'USD'));
select glow_test.ok('PayPal partial refund USD 20 of 61.30 = JMD 3,100 back', glow_test.get('gr1') ->> 'refunded_jmd' = '3100', glow_test.get('gr1')::text);
select glow_test.ok('the same PayPal refund reported again is counted once', public.record_gateway_refund('paypal', 'CAP-J-1', 'REF-J-1', 20.00, 'USD') ->> 'result' = 'already');
select glow_test.ok('a refund in another currency is not counted', public.record_gateway_refund('paypal', 'CAP-J-1', 'REF-J-X', 5, 'JMD') ->> 'result' = 'currency_mismatch');
select glow_test.ok('a refund for an unknown payment is not counted', public.record_gateway_refund('paypal', 'CAP-NOPE', 'REF-J-Y', 5, 'USD') ->> 'result' = 'unknown_payment');
select glow_test.put('gr2', public.record_gateway_refund('paypal', 'CAP-J-1', 'REF-J-2', 41.30, 'USD'));
reset role;
select glow_test.ok('the rest refunded: exactly JMD 9,500 back, payment and booking refunded',
  glow_test.get('gr2') ->> 'refunded_jmd' = '9500'
  and (select status = 'refunded' and refunded_jmd = 9500 from public.payments where provider_ref = 'PP-J-1')
  and (select payment_status from public.bookings where id = glow_test.id('j')) = 'refunded'
  and (select count(*) from public.payment_refunds r join public.payments p on p.id = r.payment_id where r.source = 'gateway' and p.provider_ref = 'PP-J-1') = 2);

-- the hold ran out while the client was on PayPal
set local role service_role;
select glow_test.server();
select glow_test.put('k', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('12:00', glow_test.day() + 1), 'Kay Lee', 'kay@example.com', '876-555-0115', true));
select glow_test.put('pk', public.prepare_payment(glow_test.id('k'), 'paypal'));
select glow_test.put('rk', public.record_payment_started(glow_test.id('k'), 'paypal', 'PP-K-1', 61.30, 'USD', true));
reset role;
update public.bookings set hold_expires_at = now() - interval '1 second' where id = glow_test.id('k');
set local role service_role;
select glow_test.server();
select glow_test.put('lk', public.lock_for_capture(glow_test.id('k'), 'paypal', 'PP-K-1'));
select glow_test.put('lk_busy', public.lock_for_capture(glow_test.id('k'), 'paypal', 'PP-K-1'));
select public.release_capture_claim('paypal', 'PP-K-1');
reset role;
select glow_test.ok('only one capture at a time: a second request meanwhile is told it is in progress', glow_test.get('lk_busy') ->> 'result' = 'in_progress');
select glow_test.ok('…and the claim is cleared once the attempt is over', (select capture_claimed_at is null from public.payments where provider_ref = 'PP-K-1'));
select glow_test.ok('hold ran out but the time is still free: held again, then captured',
  (glow_test.get('lk') ->> 'ok')::boolean and (select status = 'Held' and hold_expires_at = now() + interval '5 minutes' from public.bookings where id = glow_test.id('k')));
update public.bookings set hold_expires_at = now() - interval '1 second' where id = glow_test.id('k');
set local role service_role;
select glow_test.server();
select glow_test.put('l', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('12:00', glow_test.day() + 1), 'Lia Moss', 'lia@example.com', '876-555-0116', true));
select glow_test.put('lk2', public.lock_for_capture(glow_test.id('k'), 'paypal', 'PP-K-1'));
select glow_test.ok('hold ran out and someone else took the time: the money is NOT taken', glow_test.get('lk2') ->> 'result' = 'slot_taken' and not (glow_test.get('lk2') ->> 'ok')::boolean);
select glow_test.put('fk', public.fail_booking_payment(glow_test.id('k'), 'paypal', 'PP-K-1', 'cancelled', 'time taken before capture; not charged', false));
-- a payment that was declined after it was pending frees the time
select glow_test.put('pl', public.prepare_payment(glow_test.id('l'), 'paypal'));
select glow_test.put('rl', public.record_payment_started(glow_test.id('l'), 'paypal', 'PP-L-1', 61.30, 'USD', true));
select glow_test.put('ml', public.mark_payment_pending(glow_test.id('l'), 'paypal', 'PP-L-1', 'PENDING', 'CAP-L-1'));
select glow_test.put('dl', public.fail_booking_payment(glow_test.id('l'), 'paypal', 'PP-L-1', 'failed', 'capture DECLINED'));
reset role;
select glow_test.ok('pending, then declined: the time is free again and nothing is paid',
  glow_test.get('dl') ->> 'result' = 'released'
  and (select status = 'Expired' and payment_status = 'failed' from public.bookings where id = glow_test.id('l'))
  and glow_test.slots('soft-glam', glow_test.day() + 1) like '%12:00%');
set local role service_role;
select glow_test.server();
select glow_test.ok('a paid booking is never captured again', public.lock_for_capture(glow_test.id('g'), 'card', 'FAC-TEST-5') ->> 'result' = 'already_succeeded');
select glow_test.put('pz', public.prepare_payment(glow_test.id('f'), 'zelle'));
select glow_test.ok('Zelle: exact USD amount and Launthia''s instructions', (glow_test.get('pz') ->> 'amount')::numeric = 61.30 and glow_test.get('pz') ->> 'instructions' like '[Owner to confirm%');
-- request limits
select glow_test.put('rl1', to_jsonb(array[public.glow_rate_hit('test:v1', 3, 600), public.glow_rate_hit('test:v1', 3, 600), public.glow_rate_hit('test:v1', 3, 600)]));
select glow_test.put('rl2', to_jsonb(public.glow_rate_hit('test:v1', 3, 600)));
select glow_test.put('rl3', to_jsonb(public.glow_rate_hit('test:v2', 3, 600)));
select glow_test.ok('request limit: 3 allowed, the 4th refused, another visitor unaffected',
  glow_test.get('rl1') = '[true, true, true]'::jsonb and glow_test.get('rl2') = 'false'::jsonb and glow_test.get('rl3') = 'true'::jsonb);
reset role;
-- a booking request Launthia moves to an exact time blocks that time
insert into public.bookings (client_name, phone, service, appt_date, appt_time, terms_agreed_at) values ('Moved Request', '876-555-0117', 'Soft Glam', glow_test.day() + 2, '09:00', now());
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('mv', public.admin_reschedule_booking((select id from public.bookings where client_name = 'Moved Request'), glow_test.at('14:00', glow_test.day() + 2)));
reset role;
select glow_test.ok('a booking request moved to an exact time blocks it', glow_test.slots('soft-glam', glow_test.day() + 2) not like '%14:00%'
  and glow_test.slots('soft-glam', glow_test.day() + 2) like '%09:00%');

-- ---- report -----------------------------------------------------------------------------------------------------
select lpad(n::text, 3) || '  ' || case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when not ok then '   [' || coalesce(detail, '') || ']' else '' end as result
from glow_test.results order by n;
select format('%s of %s passed', count(*) filter (where ok), count(*)) as summary from glow_test.results;

rollback;
