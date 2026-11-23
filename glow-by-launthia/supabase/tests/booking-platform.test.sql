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
-- sections 1–19 check the payment mechanics with the full price taken online; section 20 checks the deposit
select glow_test.ok('the deposit starts at JMD 3,000 and the photos add-on at JMD 3,000', (select deposit_jmd = 3000 and photos_addon_jmd = 3000 from public.booking_settings where id = 1));
update public.booking_settings set deposit_jmd = null;
update public.services set active = true, bookable_online = true, price_jmd = 9500, duration_minutes = 60 where slug = 'soft-glam';
update public.payment_methods set enabled = false, jmd_per_usd = null, instructions = null, accounts = null;
delete from public.blocked_days where day = glow_test.day();
delete from public.admin_users where email <> 'launthiawatson@yahoo.com';
update public.owner_settings set email_alerts = true, alert_email = 'Launthiawatson@yahoo.com' where id = 1;
create function glow_test.kinds(p_booking uuid) returns text language sql stable security definer as $$
  select coalesce(string_agg(kind || '>' || audience || '>' || status, ',' order by kind), '') from public.email_log where booking_id = p_booking $$;
grant execute on function glow_test.kinds(uuid) to anon, authenticated, service_role;
insert into public.admin_users (email) values ('launthiawatson@yahoo.com') on conflict do nothing;

-- ---- 1. starting data and rules ---------------------------------------------------------------------
select glow_test.ok('three starting services', (select count(*) from public.services where slug in ('soft-glam', 'full-glam', 'bridal-glam')) = 3);
select glow_test.ok('Full Glam is not bookable online until it has one price', (select not bookable_online and price_jmd is null from public.services where slug = 'full-glam'));
select glow_test.ok('Bridal is quote only', (select not bookable_online from public.services where slug = 'bridal-glam'));
select glow_test.err('an online service must have a price', $$update public.services set bookable_online = true where slug = 'full-glam'$$, 'services_online_needs_price');
select glow_test.err('Zelle cannot be switched on without instructions', $$update public.payment_methods set enabled = true, jmd_per_usd = 155 where method = 'zelle'$$, 'manual_needs_instructions');
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
select glow_test.ok('the client sees the hold status and their own booking reference, but no name, email or phone',
  (select s ->> 'status' = 'Held' and s ->> 'reference' ~ '^GBL-[A-Z2-9]{6}$' and not (s ? 'client_name') and not (s ? 'email') and not (s ? 'phone')
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
-- no booking request without a deposit: the public key cannot write a booking into the table at all
select glow_test.err('the public cannot write a booking request straight into the table (every booking pays its deposit through the booking server)',
  format($$insert into public.bookings (client_name, phone, email, service, appt_date, appt_time, price_jmd, terms_agreed_at) values ('Old Form', '876-555-0110', 'old@example.com', 'Soft Glam', %L, '13:00', 9500, now())$$, glow_test.day()), 'permission denied');
reset role;
select glow_test.ok('…so no request without a deposit can block a time', glow_test.slots('soft-glam') like '%13:00%', glow_test.slots('soft-glam'));

-- even if setup.sql is run again (it gives the public the whole table back), a direct row is still refused
grant insert on public.bookings to anon;
set local role anon;
select glow_test.anon();
select glow_test.err('even with the old insert right back, a direct booking from the public is refused (no booking without a deposit)',
  format($$insert into public.bookings (client_name, phone, service, appt_date, appt_time, terms_agreed_at, start_at, end_at, block_until, payment_status, reference, amount_jmd)
           values ('Sneaky', '876-555-0111', 'Soft Glam', %L, '15:00', now(), %L, %L, %L, 'paid', 'GBL-AAAAAA', 1)$$, glow_test.day(), glow_test.at('15:00'), glow_test.at('16:00'), glow_test.at('16:00')),
  'every booking pays its deposit first');
reset role;
select glow_test.ok('…and nothing was written', not exists (select 1 from public.bookings where client_name in ('Sneaky', 'Old Form')));
revoke insert on public.bookings from anon;

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
select glow_test.ok('card is switched on in the table, but clients are only ever offered bank transfer and PayPal.Me (none set up yet)', (select string_agg(method, ',') from public.payment_methods) = 'card' and jsonb_array_length(public.get_booking_options() -> 'payment_methods') = 0);
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
select glow_test.ok('…the booking is flagged Needs attention, never Confirmed', (select status = 'Needs attention' and payment_status <> 'paid' and reference ~ '^GBL-' from public.bookings where id = glow_test.id('c')));
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
  and public.get_booking_status(glow_test.id('h')) ->> 'payment_status' = 'pending' and public.get_booking_status(glow_test.id('h')) ->> 'reference' ~ '^GBL-');
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
select glow_test.err('…and cannot be confirmed twice', format($$select public.admin_verify_zelle(%L, true)$$, glow_test.id('h')), 'no payment waiting to be checked');
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
select glow_test.ok('moving and cancelling queue the client''s emails (new time, then cancelled), once each',
  (select count(*) = 1 from public.email_log where booking_id = glow_test.id('b') and kind = 'booking_rescheduled' and audience = 'client')
  and (select count(*) = 1 from public.email_log where booking_id = glow_test.id('b') and kind = 'booking_cancelled' and audience = 'client')
  and (select cancelled_at is not null and cancel_reason = 'client asked' from public.bookings where id = glow_test.id('b')), glow_test.kinds(glow_test.id('b')));
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

-- ---- 10. one email per dedupe key ----------------------------------------------------------------------------
insert into public.email_log (booking_id, kind, to_email, status, dedupe_key) values (glow_test.id('h'), 'booking_cancelled', 'hana@example.com', 'sent', 'test:once');
select glow_test.err('an email with the same dedupe key cannot be queued twice', format($$insert into public.email_log (booking_id, kind, to_email, status, dedupe_key) values (%L, 'booking_cancelled', 'hana@example.com', 'queued', 'test:once')$$, glow_test.id('h')), 'email_log_dedupe');
delete from public.email_log where dedupe_key = 'test:once';
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
  jsonb_array_length(public.get_booking_options() -> 'services') = 5 and glow_test.slots('soft-glam') <> '');
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
  and (select status = 'Pending payment' and payment_status = 'pending' and reference ~ '^GBL-' and hold_expires_at is null from public.bookings where id = glow_test.id('j'))
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

-- ---- 12. emails (stage 3): queued in the same step as the payment, once each -----------------------------------
select glow_test.ok('card payment confirmed: confirmation + receipt to the client, alert to Launthia (queued)',
  glow_test.kinds(glow_test.id('g')) = 'booking_confirmation>client>queued,owner_new_booking>owner>queued,payment_receipt>client>queued', glow_test.kinds(glow_test.id('g')));
select glow_test.ok('client emails go to the client''s email, Launthia''s alert to her alert email',
  (select bool_and(case when audience = 'client' then to_email = 'gia@example.com' else to_email = 'launthiawatson@yahoo.com' end) from public.email_log where booking_id = glow_test.id('g')));
select glow_test.ok('confirming the same payment again queued nothing more', (select count(*) from public.email_log where booking_id = glow_test.id('b') and kind = 'booking_confirmation') = 1);
select glow_test.ok('a second payment for a paid booking: Launthia is alerted to refund it',
  exists (select 1 from public.email_log l join public.payments p on p.id = l.payment_id where l.kind = 'owner_attention' and p.provider_ref = 'FAC-TEST-2'));
select glow_test.ok('a wrong amount: only Launthia is alerted, the client gets no confirmation', glow_test.kinds(glow_test.id('c')) = 'owner_attention>owner>queued', glow_test.kinds(glow_test.id('c')));
select glow_test.ok('paid after the time was taken: only Launthia is alerted (no confirmation sent)',
  (select string_agg(kind, ',' order by id) from public.email_log where booking_id = glow_test.id('e') and kind <> 'booking_rescheduled') = 'owner_attention');
select glow_test.ok('Zelle: Launthia is asked to check her bank; once she confirms, the client gets confirmation + receipt (no alert to herself)',
  glow_test.kinds(glow_test.id('h')) = 'booking_confirmation>client>queued,owner_zelle_check>owner>queued,payment_receipt>client>queued', glow_test.kinds(glow_test.id('h')));
select glow_test.ok('Zelle money never arrived: the client is only told the booking is cancelled (no confirmation or receipt)', glow_test.kinds(glow_test.id('i')) = 'booking_cancelled>client>queued,owner_zelle_check>owner>queued', glow_test.kinds(glow_test.id('i')));
select glow_test.ok('a PayPal payment that was pending, then completed: confirmation, receipt and alert once each',
  glow_test.kinds(glow_test.id('j')) = 'booking_confirmation>client>queued,owner_new_booking>owner>queued,payment_receipt>client>queued', glow_test.kinds(glow_test.id('j')));
select glow_test.ok('declined or never-paid holds: no emails', glow_test.kinds(glow_test.id('l')) = '' and glow_test.kinds(glow_test.id('a')) = '');

-- the sender
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot take emails from the queue', 'select public.claim_emails()', 'permission denied');
select glow_test.err('the public cannot mark an email sent', 'select public.finish_email(1, true)', 'permission denied');
select glow_test.err('the public cannot queue a client email', format($$select public.admin_queue_client_email(%L, 'booking_cancelled')$$, glow_test.id('b')), 'permission denied');
reset role;
set local role service_role;
select glow_test.server();
select glow_test.put('cl1', public.claim_emails(glow_test.id('g')));
select glow_test.put('cl2', public.claim_emails(glow_test.id('g')));
reset role;
select glow_test.ok('the sender takes the 3 emails with what it needs to write them',
  jsonb_array_length(glow_test.get('cl1')) = 3
  and (select bool_and(x -> 'booking' ->> 'reference' like 'GBL-%' and (x -> 'payment' ->> 'amount')::numeric = 9500 and x -> 'payment' ->> 'method' = 'card'
                       and x ->> 'dedupe_key' is not null) from jsonb_array_elements(glow_test.get('cl1')) x), glow_test.get('cl1')::text);
select glow_test.ok('…and no other sender can take them meanwhile', jsonb_array_length(glow_test.get('cl2')) = 0);
set local role service_role;
select glow_test.server();
select public.finish_email((select id from public.email_log where booking_id = glow_test.id('g') and kind = 'booking_confirmation'), true, 're_123', 'to gia@example.com');
select public.finish_email((select id from public.email_log where booking_id = glow_test.id('g') and kind = 'payment_receipt'), false, null, 'Resend 500');
select public.finish_email((select id from public.email_log where booking_id = glow_test.id('g') and kind = 'owner_new_booking'), false, null, 'Resend 422: invalid to', true);
reset role;
select glow_test.ok('sent: recorded with Resend''s id', (select status = 'sent' and provider_id = 're_123' and sent_at is not null from public.email_log where booking_id = glow_test.id('g') and kind = 'booking_confirmation'));
select glow_test.ok('a failed try goes back in the queue; a final failure is not retried',
  (select status = 'queued' and attempts = 1 from public.email_log where booking_id = glow_test.id('g') and kind = 'payment_receipt')
  and (select status = 'failed' from public.email_log where booking_id = glow_test.id('g') and kind = 'owner_new_booking'));
update public.email_log set status = 'sending', updated_at = now() - interval '11 minutes' where booking_id = glow_test.id('j') and kind = 'payment_receipt';
set local role service_role;
select glow_test.server();
select glow_test.put('cl3', public.claim_emails(glow_test.id('j')));
reset role;
select glow_test.ok('an email stuck "sending" for 10 minutes is taken again', jsonb_array_length(glow_test.get('cl3')) = 3);
update public.email_log set attempts = 3, status = 'queued' where booking_id = glow_test.id('j') and kind = 'payment_receipt';
set local role service_role;
select glow_test.server();
select glow_test.put('cl4', public.claim_emails(glow_test.id('j')));
reset role;
select glow_test.ok('after 3 tries an email is not taken again', jsonb_array_length(glow_test.get('cl4')) = 0);
-- Launthia's switches and limits
update public.owner_settings set email_alerts = false where id = 1;
select glow_test.put('q1', to_jsonb(public.glow_queue_email(glow_test.id('f'), null, 'owner_attention', 'test:alerts-off')));
select glow_test.ok('with email alerts switched off, Launthia''s alerts are logged as skipped, not sent',
  (select status = 'skipped' and detail = 'email alerts are off' from public.email_log where dedupe_key = 'test:alerts-off'));
update public.owner_settings set email_alerts = true where id = 1;
insert into public.email_log (booking_id, kind, audience, to_email, status, dedupe_key, updated_at)
  select glow_test.id('f'), 'owner_attention', 'owner', 'launthiawatson@yahoo.com', 'sent', 'test:hour:' || n, now() from generate_series(1, 30) n;
select glow_test.put('q2', to_jsonb(public.glow_queue_email(glow_test.id('f'), null, 'owner_attention', 'test:over-limit')));
set local role service_role;
select glow_test.server();
select glow_test.put('cl5', public.claim_emails(null, array[(select id from public.email_log where dedupe_key = 'test:over-limit')]));
reset role;
select glow_test.ok('no more than 30 alerts to Launthia in an hour', jsonb_array_length(glow_test.get('cl5')) = 0
  and (select status = 'skipped' and detail = 'hourly limit reached' from public.email_log where dedupe_key = 'test:over-limit'));
delete from public.email_log where dedupe_key like 'test:%';
-- emails Launthia chooses to send
set local role authenticated;
select glow_test.claims('someone@example.com');
select glow_test.err('a signed-in non-owner cannot email clients', format($$select public.admin_queue_client_email(%L, 'booking_cancelled')$$, glow_test.id('b')), 'Only the owner');
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('aq1', public.admin_queue_client_email(glow_test.id('b'), 'booking_cancelled'));
select glow_test.put('aq2', public.admin_queue_client_email(glow_test.id('b'), 'booking_cancelled'));
select glow_test.err('a cancellation email only for a cancelled booking', format($$select public.admin_queue_client_email(%L, 'booking_cancelled')$$, glow_test.id('e')), 'Cancel the booking first');
select glow_test.put('aq3', public.admin_queue_client_email(glow_test.id('e'), 'booking_rescheduled'));
select glow_test.put('aq4', public.admin_queue_client_email(glow_test.id('h'), 'payment_receipt'));
select glow_test.err('no confirmation for a booking that is not paid and confirmed', format($$select public.admin_queue_client_email(%L, 'booking_confirmation')$$, glow_test.id('i')), 'Only a paid, confirmed booking');
select glow_test.err('an unknown email kind is refused', format($$select public.admin_queue_client_email(%L, 'owner_new_booking')$$, glow_test.id('h')), 'Unknown email');
reset role;
select glow_test.ok('the cancellation and the new time go once only (already sent when she cancelled or moved); the receipt can be sent again',
  not (glow_test.get('aq1') ->> 'queued')::boolean and not (glow_test.get('aq2') ->> 'queued')::boolean and not (glow_test.get('aq3') ->> 'queued')::boolean and (glow_test.get('aq4') ->> 'queued')::boolean
  and (select count(*) from public.email_log where booking_id = glow_test.id('h') and kind = 'payment_receipt') = 2);
select glow_test.ok('a cancellation or new time is emailed when Launthia cancels or moves a booking (never otherwise), once each',
  (select count(*) from public.email_log e where e.kind in ('booking_cancelled', 'booking_rescheduled')
     and e.dedupe_key not like 'booking_cancelled:%' and e.dedupe_key not like 'booking_rescheduled:%') = 0
  and (select count(*) = count(distinct dedupe_key) from public.email_log where kind in ('booking_cancelled', 'booking_rescheduled')));

-- ---- 13. Cash App (sent by the client, checked by Launthia – the same rules as Zelle) -------------------------
select glow_test.err('Cash App cannot be switched on without Launthia''s instructions', $$update public.payment_methods set enabled = true, jmd_per_usd = 155 where method = 'cashapp'$$, 'manual_needs_instructions');
update public.payment_methods set enabled = true, jmd_per_usd = 155, instructions = '[Owner to confirm: $Cashtag and name]' where method = 'cashapp';
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot send a Cash App reference directly', $$select public.submit_manual_payment(gen_random_uuid(), 'cashapp', 'CA-0000', 'X Y')$$, 'permission denied');
select glow_test.ok('the public now sees Cash App as a way to pay', exists (select 1 from public.payment_methods where method = 'cashapp'));
reset role;
set local role service_role;
select glow_test.server();
select glow_test.put('m', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('15:00', glow_test.day() + 2), 'Mia Neal', 'mia@example.com', '876-555-0118', true));
select glow_test.put('pm', public.prepare_payment(glow_test.id('m'), 'cashapp'));
select glow_test.ok('Cash App: exact USD amount and Launthia''s instructions', (glow_test.get('pm') ->> 'amount')::numeric = 61.30 and glow_test.get('pm') ->> 'currency' = 'USD'
  and glow_test.get('pm') ->> 'instructions' like '[Owner to confirm: $Cashtag%', glow_test.get('pm')::text);
select glow_test.err('a way to pay that does not exist is refused', format($$select public.submit_manual_payment(%L, 'venmo', 'V-1234', 'Mia Neal')$$, glow_test.id('m')), 'choose a way to pay');
select glow_test.err('a Cash App reference is required', format($$select public.submit_manual_payment(%L, 'cashapp', '', 'Mia Neal')$$, glow_test.id('m')), 'Cash App payment reference');
select glow_test.put('sm', public.submit_manual_payment(glow_test.id('m'), 'cashapp', 'CA-55667788', 'Mia Neal'));
reset role;
select glow_test.ok('Cash App reference sent: Pending payment, never confirmed by itself; Launthia asked to check her Cash App',
  glow_test.get('sm') ->> 'status' = 'Pending payment' and glow_test.get('sm') ->> 'method' = 'cashapp'
  and (select status = 'Pending payment' and payment_status = 'pending' and payment_method = 'cashapp' and reference ~ '^GBL-' from public.bookings where id = glow_test.id('m'))
  and glow_test.kinds(glow_test.id('m')) = 'owner_cashapp_check>owner>queued', glow_test.kinds(glow_test.id('m')));
set local role service_role;
select glow_test.server();
select glow_test.put('m2', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('16:00', glow_test.day() + 2), 'Ned Ola', 'ned@example.com', '876-555-0119', true));
select glow_test.err('the same Cash App reference cannot be used twice', format($$select public.submit_manual_payment(%L, 'cashapp', 'CA-55667788', 'Ned Ola')$$, glow_test.id('m2')), 'already been used');
reset role;
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('vm', public.admin_verify_manual_payment(glow_test.id('m'), true, 'seen in Cash App'));
reset role;
select glow_test.ok('Launthia confirms the Cash App money arrived: Confirmed with a reference; the client gets confirmation + receipt',
  glow_test.get('vm') ->> 'result' = 'confirmed' and glow_test.get('vm') ->> 'reference' like 'GBL-%'
  and glow_test.kinds(glow_test.id('m')) = 'booking_confirmation>client>queued,owner_cashapp_check>owner>queued,payment_receipt>client>queued', glow_test.kinds(glow_test.id('m')));
select glow_test.ok('…recorded as a Cash App payment checked by her', (select method = 'cashapp' and status = 'succeeded' and verified_by = 'launthiawatson@yahoo.com' from public.payments where provider_ref = 'CA-55667788'));

-- ---- 14. Bank transfer (JMD, sent by the client to one of her accounts, checked by Launthia) ----------------------
-- (made-up accounts: her real details are never in the code or the tests)
select glow_test.err('bank transfer cannot be switched on without her bank accounts', $$update public.payment_methods set enabled = true where method = 'bank'$$, 'bank_needs_accounts');
select glow_test.err('a bank account number with letters is refused',
  $$update public.payment_methods set accounts = '[{"bank":"Test Bank A","account_name":"Test Name","account_number":"12AB5678"}]' where method = 'bank'$$, 'accounts_ok');
select glow_test.err('a bank account without a bank name is refused',
  $$update public.payment_methods set accounts = '[{"account_name":"Test Name","account_number":"12345678"}]' where method = 'bank'$$, 'accounts_ok');
select glow_test.err('bank accounts can only be set on bank transfer',
  $$update public.payment_methods set accounts = '[{"bank":"Test Bank A","account_name":"Test Name","account_number":"12345678"}]' where method = 'zelle'$$, 'accounts_ok');
update public.payment_methods set enabled = true, accounts = '[
  {"bank":"Test Bank A","account_name":"Test Name A","account_number":"1234 5678","branch":"Test Branch","account_type":"Savings"},
  {"bank":"Test Bank B","account_name":"Test Name B","account_number":"987654","branch":"Test Branch","account_type":"Savings"}]' where method = 'bank';
set local role anon;
select glow_test.anon();
select glow_test.put('bo', public.get_booking_options());
select glow_test.ok('the public sees bank transfer (JMD) as ready – and nothing that is not set up (card, Zelle, Cash App, or PayPal without a PayPal.Me name)',
  (select string_agg(e ->> 'method', ',' order by o) from jsonb_array_elements(glow_test.get('bo') -> 'payment_methods') with ordinality x(e, o)) = 'bank'
  and exists (select 1 from jsonb_array_elements(glow_test.get('bo') -> 'payment_methods') e where e ->> 'method' = 'bank' and (e ->> 'ready')::boolean and e ->> 'currency' = 'JMD'),
  glow_test.get('bo') ->> 'payment_methods');
select glow_test.ok('…but the public options never contain her bank accounts or payment instructions',
  glow_test.get('bo')::text not like '%1234 5678%' and glow_test.get('bo')::text not like '%987654%' and glow_test.get('bo')::text not like '%Test Name%'
  and glow_test.get('bo')::text not like '%Owner to confirm%' and not (glow_test.get('bo')::text ~ '"(accounts|instructions)"'));
select glow_test.err('the public cannot read her bank accounts from the table', $$select accounts from public.payment_methods$$, 'permission denied');
select glow_test.err('the public cannot read the payment instructions from the table', $$select instructions from public.payment_methods$$, 'permission denied');
select glow_test.ok('the public can still read which ways to pay are on (names only)', (select count(*) from public.payment_methods where method = 'bank' and label = 'Bank transfer') = 1);
select glow_test.err('the public cannot send a transfer reference directly', $$select public.submit_manual_payment(gen_random_uuid(), 'bank', 'TR-0000', 'X Y', '1')$$, 'permission denied');
select glow_test.err('the public cannot get the payment details without holding a time', format($$select public.prepare_payment(%L, 'bank')$$, gen_random_uuid()), 'permission denied');
reset role;
set local role authenticated;
select glow_test.claims('someone.else@example.com');
select glow_test.ok('a signed-in account that is not Launthia''s sees no payment details', (select count(*) from public.payment_methods) = 0);
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.ok('Launthia (signed in) can read her bank accounts', (select jsonb_array_length(accounts) from public.payment_methods where method = 'bank') = 2);
reset role;
set local role service_role;
select glow_test.server();
select glow_test.put('k', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('09:00', glow_test.day() + 3), 'Kim Lee', 'kim@example.com', '876-555-0121', true));
select glow_test.put('pk', public.prepare_payment(glow_test.id('k'), 'bank'));
select glow_test.ok('bank transfer: the exact JMD price and both accounts, given only to the client holding the time',
  (glow_test.get('pk') ->> 'ok')::boolean and (glow_test.get('pk') ->> 'amount')::numeric = 9500 and glow_test.get('pk') ->> 'currency' = 'JMD'
  and jsonb_array_length(glow_test.get('pk') -> 'accounts') = 2 and glow_test.get('pk') -> 'accounts' -> 0 ->> 'account_number' = '1234 5678',
  glow_test.get('pk')::text);
select glow_test.err('the account it was sent to is required', format($$select public.submit_manual_payment(%L, 'bank', 'TR-77001', 'Kim Lee')$$, glow_test.id('k')), 'which account');
select glow_test.err('an account that is not on the list is refused', format($$select public.submit_manual_payment(%L, 'bank', 'TR-77001', 'Kim Lee', '3')$$, glow_test.id('k')), 'which account');
select glow_test.err('…and so is anything that is not its number', format($$select public.submit_manual_payment(%L, 'bank', 'TR-77001', 'Kim Lee', 'Test Bank B')$$, glow_test.id('k')), 'which account');
select glow_test.err('a transaction reference that is too short is refused', format($$select public.submit_manual_payment(%L, 'bank', 'ab', 'Kim Lee', '2')$$, glow_test.id('k')), 'transaction reference from your bank');
select glow_test.err('the sender''s name is required', format($$select public.submit_manual_payment(%L, 'bank', 'TR-77001', '', '2')$$, glow_test.id('k')), 'name on the account');
select glow_test.put('sk', public.submit_manual_payment(glow_test.id('k'), 'bank', 'TR-77001', 'Kim Lee', '2'));
reset role;
select glow_test.ok('transfer reported: Pending payment in JMD, never confirmed by itself; Launthia is emailed to check her account',
  glow_test.get('sk') ->> 'status' = 'Pending payment' and glow_test.get('sk') ->> 'method' = 'bank' and (glow_test.get('sk') ->> 'amount')::numeric = 9500 and glow_test.get('sk') ->> 'currency' = 'JMD'
  and (select status = 'Pending payment' and payment_status = 'pending' and payment_method = 'bank' and reference ~ '^GBL-' and hold_expires_at is null from public.bookings where id = glow_test.id('k'))
  and glow_test.kinds(glow_test.id('k')) = 'owner_bank_check>owner>queued', glow_test.kinds(glow_test.id('k')));
select glow_test.ok('…it records who sent it and which account (bank and last 4 digits only)',
  (select notes = 'Sent from: Kim Lee · Sent to: Test Bank B (account ending 7654)' and provider_ref = 'TR-77001' and status = 'awaiting review' and amount = 9500 and currency = 'JMD'
   from public.payments where booking_id = glow_test.id('k')),
  (select notes from public.payments where booking_id = glow_test.id('k')));
select glow_test.ok('…and the time stays taken while she checks', not exists (select 1 from public.get_available_slots(glow_test.svc('soft-glam'), glow_test.day() + 3) s where s.slot_start = glow_test.at('09:00', glow_test.day() + 3)));
set local role service_role;
select glow_test.server();
select glow_test.put('k2', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('11:00', glow_test.day() + 3), 'Lou Moss', 'lou@example.com', '876-555-0122', true));
select glow_test.err('the same transfer reference cannot be used twice', format($$select public.submit_manual_payment(%L, 'bank', 'TR-77001', 'Lou Moss', '1')$$, glow_test.id('k2')), 'transfer reference has already been used');
select glow_test.put('sk2', public.submit_manual_payment(glow_test.id('k2'), 'bank', 'TR-88002', 'Lou Moss', '1'));
reset role;
set local role authenticated;
select glow_test.claims('someone.else@example.com');
select glow_test.err('another account cannot confirm a transfer', format($$select public.admin_verify_manual_payment(%L, true)$$, glow_test.id('k')), 'Only the owner');
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('vk', public.admin_verify_manual_payment(glow_test.id('k'), true));
select glow_test.put('vk2', public.admin_verify_manual_payment(glow_test.id('k2'), false, 'not in my account'));
reset role;
select glow_test.ok('Launthia confirms the money is in her account: Confirmed with a reference; the client gets confirmation + receipt',
  glow_test.get('vk') ->> 'result' = 'confirmed' and glow_test.get('vk') ->> 'reference' like 'GBL-%'
  and (select status = 'Confirmed' and payment_status = 'paid' from public.bookings where id = glow_test.id('k'))
  and (select method = 'bank' and status = 'succeeded' and verified_by = 'launthiawatson@yahoo.com' from public.payments where provider_ref = 'TR-77001')
  and glow_test.kinds(glow_test.id('k')) = 'booking_confirmation>client>queued,owner_bank_check>owner>queued,payment_receipt>client>queued', glow_test.kinds(glow_test.id('k')));
select glow_test.ok('money not there: the booking is Cancelled (never paid), the client is told it is cancelled, and the time is free again',
  glow_test.get('vk2') ->> 'result' = 'rejected'
  and (select status = 'Cancelled' and payment_status = 'failed' and cancel_reason = 'Payment not received' and cancelled_at is not null from public.bookings where id = glow_test.id('k2'))
  and (select status = 'failed' from public.payments where provider_ref = 'TR-88002')
  and glow_test.kinds(glow_test.id('k2')) = 'booking_cancelled>client>queued,owner_bank_check>owner>queued'
  and exists (select 1 from public.get_available_slots(glow_test.svc('soft-glam'), glow_test.day() + 3) s where s.slot_start = glow_test.at('11:00', glow_test.day() + 3)),
  glow_test.kinds(glow_test.id('k2')));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.err('a transfer cannot be confirmed twice', format($$select public.admin_verify_manual_payment(%L, true)$$, glow_test.id('k')), 'no payment waiting to be checked');
reset role;

-- ---- 15. the prices she types in the dashboard are the prices the booking form charges ---------------------------
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
update public.site_prices set price_text = '11,000' where service = 'Full Glam';
reset role;
select glow_test.ok('one price for Full Glam in the dashboard: bookable online at exactly that price',
  (select price_jmd = 11000 and bookable_online and price_note is null from public.services where slug = 'full-glam'));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
update public.site_prices set price_text = '10,000' where service = 'Soft Glam';
update public.site_prices set price_text = '10,500 – $12,000' where service = 'Full Glam';
reset role;
select glow_test.ok('a new Soft Glam price is charged; a price range goes back to "ask for a quote" (shown as typed)',
  (select price_jmd = 10000 and bookable_online from public.services where slug = 'soft-glam')
  and (select price_jmd is null and not bookable_online and price_note = 'JMD $10,500 – $12,000' from public.services where slug = 'full-glam'));
select glow_test.ok('…and a time already held keeps the price it was held at', (select amount_jmd = 9500 from public.bookings where id = glow_test.id('k')));
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot change prices', $$update public.site_prices set price_text = '1' where service = 'Soft Glam'$$, 'permission denied');
reset role;

-- ---- 16. no "pay in person" booking, no "Cash received"; her US-dollar rate --------------------------------------
select glow_test.ok('pay in person is OFF: every booking pays the deposit', (select not enabled from public.payment_methods where method = 'cash'));
select glow_test.ok('there is no way to book "pay in person" or to mark cash received (both are gone from the database)',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('book_pay_in_person', 'admin_mark_cash_paid')));
update public.payment_methods set enabled = true where method = 'cash';
set local role anon;
select glow_test.anon();
select glow_test.ok('even if "cash" is switched on in the table by mistake, clients are never offered it',
  not exists (select 1 from jsonb_array_elements(public.get_booking_options() -> 'payment_methods') e where e ->> 'method' = 'cash'));
reset role;
update public.payment_methods set enabled = false where method = 'cash';
set local role authenticated;
select glow_test.claims('someone.else@example.com');
select glow_test.err('another account cannot set the US-dollar rate', $$select public.admin_set_usd_rate(150)$$, 'Only the owner');
reset role;
-- her US-dollar rate
update public.payment_methods set enabled = false, jmd_per_usd = null where method in ('paypal', 'zelle');
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.err('a rate that is not a real number of JMD is refused', $$select public.admin_set_usd_rate(0)$$, 'how many JMD make 1 US dollar');
select glow_test.put('rate', public.admin_set_usd_rate(150));
reset role;
select glow_test.ok('setting her rate (1 USD = 150 JMD) puts it on PayPal and Zelle and switches them on',
  (select bool_and(jmd_per_usd = 150 and enabled) from public.payment_methods where method in ('paypal', 'zelle')), glow_test.get('rate')::text);
select glow_test.ok('…so JMD 9,500 is charged as exactly USD 63.34 (rounded up to the cent)',
  (select amount = 63.34 and currency = 'USD' from public.glow_charge_amount(9500, 'paypal')) and (select amount = 63.34 from public.glow_charge_amount(9500, 'zelle')));
-- ---- 18. On-site bank transfer checkout: a reference from the start, the transaction reference, a receipt ----------
set local role service_role;
select glow_test.server();
select glow_test.put('k3', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('14:00', glow_test.day() + 3), 'Nia Ross', 'nia@example.com', '876-555-0132', true));
reset role;
select glow_test.ok('a booking gets its own reference the moment it is made (saved, shown to the client)',
  (glow_test.get('k3') ->> 'reference') ~ '^GBL-[A-Z2-9]{6}$'
  and (select reference = glow_test.get('k3') ->> 'reference' and status = 'Held' from public.bookings where id = glow_test.id('k3'))
  and public.get_booking_status(glow_test.id('k3')) ->> 'reference' = glow_test.get('k3') ->> 'reference', glow_test.get('k3')::text);
select glow_test.ok('no two bookings ever share a reference', (select count(*) = count(distinct reference) from public.bookings where reference is not null));
set local role service_role;
select glow_test.err('a bank transfer needs its transaction reference', format($$select public.submit_manual_payment(%L, 'bank', '', 'Nia Ross', '1')$$, glow_test.id('k3')), 'transaction reference from your bank');
select glow_test.put('sk3', public.submit_manual_payment(glow_test.id('k3'), 'bank', 'NCB-TX-5521', 'Nia Ross', '1'));
reset role;
select glow_test.ok('with it: Awaiting verification (Pending payment), the same booking reference, Launthia emailed',
  glow_test.get('sk3') ->> 'status' = 'Pending payment' and glow_test.get('sk3') ->> 'reference' = glow_test.get('k3') ->> 'reference'
  and (select status = 'Pending payment' and payment_status = 'pending' from public.bookings where id = glow_test.id('k3'))
  and (select status = 'awaiting review' and provider_ref = 'NCB-TX-5521' and id::text = glow_test.get('sk3') ->> 'payment_id' from public.payments where booking_id = glow_test.id('k3'))
  and glow_test.kinds(glow_test.id('k3')) = 'owner_bank_check>owner>queued', glow_test.get('sk3')::text);
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot attach a receipt', format($$select public.attach_payment_receipt(%L, %L, 'x')$$, glow_test.id('k3'), glow_test.get('sk3') ->> 'payment_id'), 'permission denied');
reset role;
set local role service_role;
select glow_test.server();
select glow_test.err('a receipt path that is not this booking''s and payment''s own is refused', format($$select public.attach_payment_receipt(%L, %L, '../x.jpg')$$, glow_test.id('k3'), glow_test.get('sk3') ->> 'payment_id'), 'bad receipt path');
select glow_test.put('rc1', to_jsonb(public.attach_payment_receipt(glow_test.id('k3'), (glow_test.get('sk3') ->> 'payment_id')::uuid, glow_test.id('k3')::text || '/' || (glow_test.get('sk3') ->> 'payment_id') || '.jpg')));
select glow_test.put('rc2', to_jsonb(public.attach_payment_receipt(glow_test.id('k3'), (glow_test.get('sk3') ->> 'payment_id')::uuid, glow_test.id('k3')::text || '/' || (glow_test.get('sk3') ->> 'payment_id') || '.png')));
reset role;
select glow_test.ok('the receipt is recorded on the waiting payment, once (it can''t be swapped afterwards)',
  glow_test.get('rc1')::text = 'true' and glow_test.get('rc2')::text = 'false'
  and (select receipt_path like '%.jpg' from public.payments where booking_id = glow_test.id('k3')));
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot read payments or receipts', $$select receipt_path from public.payments limit 1$$, 'permission denied');
reset role;

-- ---- 17. Full Glam: two looks, each with one fixed price, bookable and payable online ----------------------------
set local role anon;
select glow_test.anon();
select glow_test.put('opts', public.get_booking_options());
reset role;
select glow_test.ok('the public sees Full Glam''s two looks (Natural and Statement), each bookable online at one price, under Full Glam',
  (select string_agg(e ->> 'name' || '=' || coalesce(e ->> 'price_jmd', '-') || '=' || (e ->> 'bookable_online') || '=' || coalesce(e ->> 'parent_slug', ''), ',' order by e ->> 'slug')
     from jsonb_array_elements(glow_test.get('opts') -> 'services') e where e ->> 'slug' like 'full-glam%')
  = 'Full Glam=-=false=,Natural Full Glam=10500=true=full-glam,Statement Full Glam=12000=true=full-glam',
  (glow_test.get('opts') -> 'services')::text);
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
update public.site_prices set price_text = '11,000' where service = 'Statement Full Glam';
reset role;
select glow_test.ok('a new price for a look in her dashboard is the price charged', (select price_jmd = 11000 and bookable_online from public.services where slug = 'full-glam-statement'));
set local role service_role;
select glow_test.server();
select glow_test.put('fg', public.create_booking_hold(glow_test.svc('full-glam-statement'), glow_test.at('15:00', glow_test.day() + 4), 'Fay Glam', 'fay@example.com', '876-555-0141', true));
reset role;
select glow_test.ok('a Statement Full Glam time is held at exactly its price, under its look''s name',
  (select status = 'Held' and service = 'Statement Full Glam' and amount_jmd = 11000 from public.bookings where id = glow_test.id('fg')), glow_test.get('fg')::text);
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot change the look prices', $$update public.site_prices set price_text = '1' where service = 'Natural Full Glam'$$, 'permission denied');
reset role;

-- ---- 19. Her schedule from the dashboard: week, breaks, special dates, blocked time, rules, services ------------
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot change her hours', $$select public.admin_save_week('[]'::jsonb, '[]'::jsonb)$$, 'permission denied');
select glow_test.err('…or her booking rules', $$select public.admin_save_rules(60, 0, 60, 90, null, false, null)$$, 'permission denied');
select glow_test.err('…or block time', $$select public.admin_block_time(now(), now() + interval '1 hour', null)$$, 'permission denied');
reset role;
set local role authenticated;
select glow_test.claims('someone.else@example.com');
select glow_test.err('another signed-in account cannot change her hours', $$select public.admin_save_week('[]'::jsonb, '[]'::jsonb)$$, 'Only the owner');
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.err('times that overlap are refused', $$select public.admin_save_week('[{"weekday":1,"start":"09:00","end":"13:00"},{"weekday":1,"start":"12:00","end":"17:00"}]'::jsonb, '[]'::jsonb)$$, 'overlap');
select glow_test.err('a time that ends before it starts is refused', $$select public.admin_save_week('[{"weekday":1,"start":"17:00","end":"09:00"}]'::jsonb, '[]'::jsonb)$$, 'end after it starts');
-- Monday: two working periods (9–12, 2–5) and a break 10–11; Tuesday to Saturday 9–5; Sunday off
select glow_test.put('wk', public.admin_save_week(
  '[{"weekday":1,"start":"09:00","end":"12:00"},{"weekday":1,"start":"14:00","end":"17:00"},{"weekday":2,"start":"09:00","end":"17:00"},{"weekday":3,"start":"09:00","end":"17:00"},
    {"weekday":4,"start":"09:00","end":"17:00"},{"weekday":5,"start":"09:00","end":"17:00"},{"weekday":6,"start":"09:00","end":"17:00"}]'::jsonb,
  '[{"weekday":1,"start":"10:00","end":"11:00","label":"Lunch"}]'::jsonb));
reset role;
select glow_test.ok('her week: two working periods and a break on Mondays – the website offers exactly those times',
  glow_test.slots('soft-glam', glow_test.day() + 14) = '09:00 11:00 14:00 15:00 16:00', glow_test.slots('soft-glam', glow_test.day() + 14));
select glow_test.ok('…and Sunday, with no working times, is a day off', glow_test.slots('soft-glam', glow_test.day() + 13) = '');
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('sd', public.admin_save_day(glow_test.day() + 13, 'special', '[{"start":"10:00","end":"12:00"}]'::jsonb));
reset role;
select glow_test.ok('special hours on one Sunday open just that date (10–12)', glow_test.slots('soft-glam', glow_test.day() + 13) = '10:00 11:00'
  and glow_test.slots('soft-glam', glow_test.day() + 20) = '', glow_test.slots('soft-glam', glow_test.day() + 13));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('sd2', public.admin_save_day(glow_test.day() + 15, 'special', '[{"start":"13:00","end":"15:00"}]'::jsonb));
reset role;
select glow_test.ok('special hours replace the usual hours for that date only (a Tuesday becomes 1–3)', glow_test.slots('soft-glam', glow_test.day() + 15) = '13:00 14:00'
  and glow_test.slots('soft-glam', glow_test.day() + 22) like '09:00 10:00%');
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('sd3', public.admin_save_day(glow_test.day() + 15, 'closed'));
reset role;
select glow_test.ok('…closed all day: no times at all', glow_test.slots('soft-glam', glow_test.day() + 15) = '');
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('sd4', public.admin_save_day(glow_test.day() + 15, 'usual'));
select glow_test.err('a date in the past is refused', $$select public.admin_save_day(current_date - 3, 'closed')$$, 'today or a later date');
reset role;
select glow_test.ok('…and back to her usual hours', glow_test.slots('soft-glam', glow_test.day() + 15) like '09:00 10:00 11:00%');
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('bt', public.admin_block_time(glow_test.at('14:00', glow_test.day() + 14), glow_test.at('16:00', glow_test.day() + 14), 'Dentist'));
reset role;
select glow_test.ok('blocking 2–4 on a Monday takes those times away', glow_test.slots('soft-glam', glow_test.day() + 14) = '09:00 11:00 16:00', glow_test.slots('soft-glam', glow_test.day() + 14));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('ub', public.admin_unblock_time((glow_test.get('bt') ->> 'id')::bigint));
select glow_test.put('vac', public.admin_block_time(glow_test.at('00:00', glow_test.day() + 22), glow_test.at('00:00', glow_test.day() + 25), 'Holiday'));
reset role;
select glow_test.ok('unblocking gives them back; a holiday of several days closes each day', glow_test.slots('soft-glam', glow_test.day() + 14) = '09:00 11:00 14:00 15:00 16:00'
  and glow_test.slots('soft-glam', glow_test.day() + 22) = '' and glow_test.slots('soft-glam', glow_test.day() + 24) = '' and glow_test.slots('soft-glam', glow_test.day() + 25) <> '');
-- booking rules: at most 1 appointment a day
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.err('a rule out of range is refused kindly', $$select public.admin_save_rules(7, 0, 60, 365, null, true, null)$$, 'Please check the booking rules');
select glow_test.put('r1', public.admin_save_rules(60, 0, 60, 365, 1, true, 'Closed 24–26 December.'));
reset role;
set local role service_role;
select glow_test.server();
select glow_test.put('cap1', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('09:00', glow_test.day() + 16), 'Cap One', 'cap1@example.com', '876-555-0161', true));
select glow_test.err('her daily limit: a second booking that day is refused by the server', format($$select public.create_booking_hold(%L, %L, 'Cap Two', 'cap2@example.com', '876-555-0162', true)$$,
  glow_test.svc('soft-glam'), glow_test.at('11:00', glow_test.day() + 16)), 'no longer available');
reset role;
select glow_test.ok('…and the day shows no more times; the next day still does', glow_test.slots('soft-glam', glow_test.day() + 16) = '' and glow_test.slots('soft-glam', glow_test.day() + 17) <> '');
set local role anon;
select glow_test.anon();
select glow_test.put('o2', public.get_booking_options());
reset role;
select glow_test.ok('the website gets her message for clients', glow_test.get('o2') ->> 'message' = 'Closed 24–26 December.' and (glow_test.get('o2') ->> 'accepting')::boolean);
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('r2', public.admin_save_rules(60, 0, 60, 365, null, false, null));
reset role;
set local role anon;
select glow_test.anon();
select glow_test.put('o3', public.get_booking_options());
reset role;
select glow_test.ok('bookings paused: the website is told, and no day has any time', not (glow_test.get('o3') ->> 'accepting')::boolean
  and glow_test.slots('soft-glam', glow_test.day() + 17) = '' and glow_test.slots('soft-glam', glow_test.day() + 14) = '');
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('r3', public.admin_save_rules(30, 15, 60, 365, null, true, null));
select glow_test.put('sv', public.admin_save_service(glow_test.svc('soft-glam'), 90, 'Soft, skin-first glam.', true));
select glow_test.err('a service length must be in steps of 15 minutes', format($$select public.admin_save_service(%L, 50, null, true)$$, glow_test.svc('soft-glam')), '15 minutes');
reset role;
select glow_test.ok('times every 30 minutes, a 90-minute service and a 15-minute gap: the last start is 3:30 on a 9–5 day',
  glow_test.slots('soft-glam', glow_test.day() + 17) like '09:00 09:30 10:00 %' and glow_test.slots('soft-glam', glow_test.day() + 17) like '% 15:30'
  and (select duration_minutes = 90 and description = 'Soft, skin-first glam.' from public.services where slug = 'soft-glam'), glow_test.slots('soft-glam', glow_test.day() + 17));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('r4', public.admin_save_rules(60, 0, 60, 365, null, true, null));
select glow_test.put('sv2', public.admin_save_service(glow_test.svc('soft-glam'), 60, null, true));
select glow_test.err('a service with no fixed price cannot be switched to book online', format($$select public.admin_save_service(%L, 60, null, true)$$, glow_test.svc('bridal-glam')), 'fixed price');
-- what the dashboard reads (as the signed-in owner, through the same row rules as the website's API)
select glow_test.put('rd', (select jsonb_build_object('dates', (select count(*) from public.availability_dates), 'blocks', (select count(*) from public.blocked_periods),
  'rules', (select count(*) from public.booking_settings), 'breaks', (select count(*) from public.availability_breaks))));
select glow_test.claims('someone.else@example.com');
select glow_test.put('rd2', (select jsonb_build_object('dates', (select count(*) from public.availability_dates), 'blocks', (select count(*) from public.blocked_periods),
  'rules', (select count(*) from public.booking_settings), 'breaks', (select count(*) from public.availability_breaks))));
reset role;
select glow_test.ok('the dashboard can read her special dates, blocked times, rules and breaks', (glow_test.get('rd') ->> 'dates')::int >= 1 and (glow_test.get('rd') ->> 'blocks')::int >= 1
  and (glow_test.get('rd') ->> 'rules')::int = 1 and (glow_test.get('rd') ->> 'breaks')::int >= 1, glow_test.get('rd')::text);
select glow_test.ok('…another signed-in account sees none of them', glow_test.get('rd2') = '{"dates": 0, "blocks": 0, "rules": 0, "breaks": 0}'::jsonb, glow_test.get('rd2')::text);
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot read her special dates', $$select count(*) from public.availability_dates$$, 'permission denied');
select glow_test.err('…or her blocked times', $$select count(*) from public.blocked_periods$$, 'permission denied');
reset role;

-- ---- 20. Deposit (JMD 3,000 online, the rest in person) and the professional-photos add-on (JMD 3,000) --------
update public.booking_settings set deposit_jmd = 3000, photos_addon_jmd = 3000;
update public.services set price_jmd = 9500, price_note = null, bookable_online = true, active = true where slug = 'soft-glam';
update public.services set price_jmd = 12000, price_note = null, bookable_online = true, active = true where slug = 'full-glam-statement';
update public.payment_methods set enabled = false where method = 'cash';
update public.payment_methods set enabled = true, jmd_per_usd = 154, instructions = null, paypalme = 'GlowTest154' where method = 'paypal';
set local role anon;
select glow_test.anon();
select glow_test.put('o20', public.get_booking_options());
select glow_test.err('the public cannot hold a time (or pick its price) directly', $$select public.create_booking_hold(gen_random_uuid(), now(), 'A B', 'a@b.co', '8765550000', true, true)$$, 'permission denied');
select glow_test.err('the public form cannot write a deposit or balance', format($$insert into public.bookings (client_name, phone, service, appt_date, appt_time, terms_agreed_at, deposit_jmd) values ('X', '876-555-0209', 'Soft Glam', %L, '15:00', now(), 1)$$, glow_test.day() + 40), 'permission denied');
select glow_test.err('the public cannot write a booking with photos directly either', format($$insert into public.bookings (client_name, phone, email, service, appt_date, appt_time, price_jmd, terms_agreed_at, photos_addon) values ('Form Photos', '876-555-0210', 'fp@example.com', 'Soft Glam', %L, '13:00', 9500, now(), true)$$, glow_test.day() + 41), 'permission denied');
reset role;
select glow_test.ok('the website is told the deposit (3,000) and the photos price (3,000); pay in person is not offered',
  (glow_test.get('o20') ->> 'deposit_jmd')::int = 3000 and (glow_test.get('o20') ->> 'photos_addon_jmd')::int = 3000
  and not exists (select 1 from jsonb_array_elements(glow_test.get('o20') -> 'payment_methods') e where e ->> 'method' = 'cash'), glow_test.get('o20')::text);
select glow_test.ok('PayPal is offered as PayPal.Me: her PayPal.Me name and rate, never an email or bank details',
  exists (select 1 from jsonb_array_elements(glow_test.get('o20') -> 'payment_methods') e where e ->> 'method' = 'paypal' and e ->> 'paypalme' = 'GlowTest154' and (e ->> 'jmd_per_usd')::numeric = 154)
  and glow_test.get('o20')::text !~ '@' and not (glow_test.get('o20')::text like '%account_number%'), glow_test.get('o20')::text);
set local role service_role;
select glow_test.server();
select glow_test.put('d1', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('10:00', glow_test.day() + 30), 'Dee Posit', 'dee@example.com', '876-555-0201', true));
select glow_test.put('d2', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('12:00', glow_test.day() + 30), 'Pho Tos', 'pho@example.com', '876-555-0202', true, true));
select glow_test.put('d3', public.create_booking_hold(glow_test.svc('full-glam-statement'), glow_test.at('14:00', glow_test.day() + 30), 'Stat Ement', 'st@example.com', '876-555-0203', true, true));
reset role;
select glow_test.ok('no photos: Soft Glam 9,500 – deposit 3,000 now, balance 6,500 at the appointment',
  (select price_jmd = 9500 and not photos_addon and photos_jmd = 0 and total_jmd = 9500 and deposit_jmd = 3000 and balance_jmd = 6500 and amount_jmd = 3000 from public.bookings where id = glow_test.id('d1'))
  and (glow_test.get('d1') ->> 'deposit_jmd')::int = 3000 and (glow_test.get('d1') ->> 'balance_jmd')::int = 6500 and (glow_test.get('d1') ->> 'amount_jmd')::int = 3000, glow_test.get('d1')::text);
select glow_test.ok('with photos: 9,500 + 3,000 = 12,500 – deposit 3,000, balance 9,500 (saved on the booking)',
  (select photos_addon and photos_jmd = 3000 and total_jmd = 12500 and deposit_jmd = 3000 and balance_jmd = 9500 and amount_jmd = 3000 from public.bookings where id = glow_test.id('d2')), glow_test.get('d2')::text);
select glow_test.ok('Statement Full Glam with photos: 12,000 + 3,000 = 15,000 – deposit 3,000, balance 12,000',
  (select total_jmd = 15000 and deposit_jmd = 3000 and balance_jmd = 12000 from public.bookings where id = glow_test.id('d3')));
set local role service_role;
select glow_test.server();
select glow_test.put('dp1', public.prepare_payment(glow_test.id('d2'), 'bank'));
select glow_test.put('dp2', public.prepare_payment(glow_test.id('d2'), 'paypal'));
select glow_test.err('booking with "pay in person" does not exist on the server', format($$select public.book_pay_in_person(%L)$$, glow_test.id('d1')), 'does not exist');
select glow_test.put('ds', public.submit_manual_payment(glow_test.id('d2'), 'bank', 'FT-DEPOSIT-01', 'Pho Tos', '1', null));
select glow_test.put('st20', public.get_booking_status(glow_test.id('d2')));
reset role;
select glow_test.ok('the client is asked for the deposit only: JMD 3,000 by bank transfer, USD 19.49 by PayPal (at 154)',
  (glow_test.get('dp1') ->> 'amount')::numeric = 3000 and glow_test.get('dp1') ->> 'currency' = 'JMD' and (glow_test.get('dp2') ->> 'amount')::numeric = 19.49 and glow_test.get('dp2') ->> 'currency' = 'USD',
  glow_test.get('dp1')::text || ' / ' || glow_test.get('dp2')::text);
select glow_test.ok('PayPal gives her PayPal.Me name and rate for the link (no email, no instructions)',
  glow_test.get('dp2') ->> 'paypalme' = 'GlowTest154' and (glow_test.get('dp2') ->> 'jmd_per_usd')::numeric = 154 and glow_test.get('dp2') -> 'instructions' = 'null'::jsonb, glow_test.get('dp2')::text);
select glow_test.ok('Launthia checks her bank for JMD 3,000 (the deposit), never the full price',
  (select amount = 3000 and amount_jmd = 3000 and status = 'awaiting review' from public.payments where booking_id = glow_test.id('d2') and method = 'bank'));
select glow_test.ok('the booking page shows the split: total, deposit, balance, photos',
  (glow_test.get('st20') ->> 'total_jmd')::int = 12500 and (glow_test.get('st20') ->> 'deposit_jmd')::int = 3000 and (glow_test.get('st20') ->> 'balance_jmd')::int = 9500
  and (glow_test.get('st20') ->> 'photos_addon')::boolean, glow_test.get('st20')::text);
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('dv', public.admin_verify_manual_payment(glow_test.id('d2'), true, null));
reset role;
select glow_test.ok('deposit received: Confirmed; the client''s confirmation and receipt are queued; the balance stays to pay in person',
  (select status = 'Confirmed' and balance_jmd = 9500 from public.bookings where id = glow_test.id('d2'))
  and glow_test.kinds(glow_test.id('d2')) like '%booking_confirmation>client>queued%' and glow_test.kinds(glow_test.id('d2')) like '%payment_receipt>client>queued%', glow_test.kinds(glow_test.id('d2')));
update public.booking_settings set photos_addon_jmd = 3500;
set local role service_role;
select glow_test.server();
select glow_test.put('d4', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('16:00', glow_test.day() + 30), 'New Price', 'np@example.com', '876-555-0204', true, true));
reset role;
select glow_test.ok('the photos price comes from the database only (changed to 3,500: total 13,000, balance 10,000)',
  (select photos_jmd = 3500 and total_jmd = 13000 and deposit_jmd = 3000 and balance_jmd = 10000 from public.bookings where id = glow_test.id('d4')));
select glow_test.err('a deposit of 0 is refused', 'update public.booking_settings set deposit_jmd = 0', 'booking_settings_deposit_ok');
update public.booking_settings set photos_addon_jmd = 3000;

-- ---- 21. How clients pay (dashboard): PayPal.Me name, US-dollar rate, bank accounts; the PayPal.Me deposit ----------
set local role anon;
select glow_test.anon();
select glow_test.err('the public cannot change how clients pay', $$select public.admin_save_payment_setup('X1', 154, null)$$, 'permission denied');
select glow_test.err('the public cannot read her PayPal.Me name or bank accounts from the table', 'select paypalme, accounts from public.payment_methods', 'permission denied');
reset role;
set local role authenticated;
select glow_test.claims('someone.else@example.com');
select glow_test.err('another account cannot change how clients pay', $$select public.admin_save_payment_setup('X1', 154, null)$$, 'Only the owner');
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.err('a PayPal.Me name with a space or symbol is refused', $$select public.admin_save_payment_setup('Launthia W', 154, null)$$, 'only letters and numbers');
select glow_test.err('a PayPal.Me name longer than 20 is refused', $$select public.admin_save_payment_setup('A123456789012345678901', 154, null)$$, 'only letters and numbers');
select glow_test.err('a PayPal.Me name without a rate is refused (PayPal charges in US dollars)', $$select public.admin_save_payment_setup('LaunthiaW', null, null)$$, 'US dollar rate');
select glow_test.err('a rate that is not a real number of JMD is refused', $$select public.admin_save_payment_setup('LaunthiaW', 0, null)$$, 'how many JMD make 1 US dollar');
select glow_test.err('a bank account without an account number is refused', $$select public.admin_save_payment_setup(null, null, '[{"bank":"NCB","account_name":"Test Name"}]'::jsonb)$$, 'check each bank account');
select glow_test.err('five bank accounts are refused (up to 4)', $$select public.admin_save_payment_setup(null, null, (select jsonb_agg(jsonb_build_object('bank', 'NCB', 'account_name', 'Test Name', 'account_number', '1234 ' || g)) from generate_series(1, 5) g))$$, 'check each bank account');
select glow_test.put('ps0', public.admin_save_payment_setup(null, null, null));
reset role;
set local role anon;
select glow_test.anon();
select glow_test.put('o21a', public.get_booking_options());
reset role;
select glow_test.ok('nothing saved: no way to pay is offered (the website then shows its calm WhatsApp / text message)',
  jsonb_array_length(glow_test.get('o21a') -> 'payment_methods') = 0 and not (glow_test.get('ps0') ->> 'paypal_on')::boolean and not (glow_test.get('ps0') ->> 'bank_on')::boolean,
  (glow_test.get('o21a') -> 'payment_methods')::text || ' / ' || glow_test.get('ps0')::text);
set local role service_role;
select glow_test.server();
select glow_test.put('p21', public.create_booking_hold(glow_test.svc('soft-glam'), glow_test.at('10:00', glow_test.day() + 33), 'Pay Pal', 'pp21@example.com', '876-555-0221', true));
select glow_test.ok('…and nothing can be paid: PayPal and bank transfer are not available',
  not (public.prepare_payment(glow_test.id('p21'), 'paypal') ->> 'ok')::boolean and not (public.prepare_payment(glow_test.id('p21'), 'bank') ->> 'ok')::boolean);
select glow_test.err('…and "I''ve paid on PayPal" is refused', format($$select public.submit_manual_payment(%L, 'paypal', '', 'Pay Pal')$$, glow_test.id('p21')), 'not available');
reset role;
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('ps1', public.admin_save_payment_setup('LaunthiaW', 154, '[{"bank":"NCB","account_name":"Test Name A","account_number":"1234 5678","branch":"Test Branch","account_type":"Savings"},{"bank":"Scotiabank","account_name":"Test Name B","account_number":"987654"}]'::jsonb));
reset role;
select glow_test.ok('saved: PayPal.Me on (LaunthiaW, 154) and bank transfer on (2 accounts)',
  glow_test.get('ps1') ->> 'paypalme' = 'LaunthiaW' and (glow_test.get('ps1') ->> 'rate')::numeric = 154 and (glow_test.get('ps1') ->> 'paypal_on')::boolean
  and (glow_test.get('ps1') ->> 'bank_on')::boolean and (glow_test.get('ps1') ->> 'bank_accounts')::int = 2, glow_test.get('ps1')::text);
set local role anon;
select glow_test.anon();
select glow_test.put('o21b', public.get_booking_options());
reset role;
select glow_test.ok('the website now offers bank transfer and PayPal (PayPal.Me name and rate only; no account details)',
  (select string_agg(e ->> 'method', ',' order by e ->> 'method') from jsonb_array_elements(glow_test.get('o21b') -> 'payment_methods') e) = 'bank,paypal'
  and exists (select 1 from jsonb_array_elements(glow_test.get('o21b') -> 'payment_methods') e where e ->> 'paypalme' = 'LaunthiaW')
  and glow_test.get('o21b')::text not like '%1234 5678%' and glow_test.get('o21b')::text not like '%Test Name%', (glow_test.get('o21b') -> 'payment_methods')::text);
set local role service_role;
select glow_test.server();
select glow_test.put('pp21', public.prepare_payment(glow_test.id('p21'), 'paypal'));
select glow_test.put('sp21', public.submit_manual_payment(glow_test.id('p21'), 'paypal', '', 'Pay Pal'));
reset role;
select glow_test.ok('PayPal.Me: the exact deposit in US dollars (3,000 at 154 = USD 19.49) and her PayPal.Me name',
  (glow_test.get('pp21') ->> 'amount')::numeric = 19.49 and glow_test.get('pp21') ->> 'currency' = 'USD' and glow_test.get('pp21') ->> 'paypalme' = 'LaunthiaW', glow_test.get('pp21')::text);
select glow_test.ok('"I''ve paid on PayPal" only waits for Launthia: Pending payment, nothing paid, no confirmation yet; she is asked to check her PayPal',
  glow_test.get('sp21') ->> 'status' = 'Pending payment'
  and (select status = 'Pending payment' and payment_status = 'pending' and paid_at is null and payment_method = 'paypal' from public.bookings where id = glow_test.id('p21'))
  and (select status = 'awaiting review' and amount = 19.49 and currency = 'USD' from public.payments where booking_id = glow_test.id('p21'))
  and glow_test.kinds(glow_test.id('p21')) = 'owner_paypal_check>owner>queued', glow_test.kinds(glow_test.id('p21')));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('pv21', public.admin_verify_manual_payment(glow_test.id('p21'), true, null));
reset role;
select glow_test.ok('"Mark deposit paid" (after she checked PayPal): Confirmed and paid; only now the client''s confirmation and receipt are queued',
  (select status = 'Confirmed' and payment_status = 'paid' and paid_at is not null from public.bookings where id = glow_test.id('p21'))
  and glow_test.kinds(glow_test.id('p21')) like '%booking_confirmation>client>queued%' and glow_test.kinds(glow_test.id('p21')) like '%payment_receipt>client>queued%', glow_test.kinds(glow_test.id('p21')));
set local role authenticated;
select glow_test.claims('launthiawatson@yahoo.com');
select glow_test.put('ps2', public.admin_save_payment_setup('', 154, '[{"bank":"NCB","account_name":"Test Name A","account_number":"1234 5678"}]'::jsonb));
reset role;
select glow_test.ok('clearing her PayPal.Me name switches PayPal off again (bank transfer stays, now 1 account)',
  not (glow_test.get('ps2') ->> 'paypal_on')::boolean and (glow_test.get('ps2') ->> 'bank_on')::boolean and (glow_test.get('ps2') ->> 'bank_accounts')::int = 1
  and (select string_agg(e ->> 'method', ',') from jsonb_array_elements(public.get_booking_options() -> 'payment_methods') e) = 'bank', glow_test.get('ps2')::text);

-- ---- report -----------------------------------------------------------------------------------------------------
select lpad(n::text, 3) || '  ' || case when ok then 'PASS' else 'FAIL' end || '  ' || name || case when not ok then '   [' || coalesce(detail, '') || ']' else '' end as result
from glow_test.results order by n;
select format('%s of %s passed', count(*) filter (where ok), count(*)) as summary from glow_test.results;

rollback;
