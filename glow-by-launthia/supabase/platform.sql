-- =====================================================================================================
-- Glow by Launthia – booking & payment platform, STAGE 1: the database foundation.
--
-- Run it AFTER setup.sql: Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again. It never deletes data, and everything the current website and dashboard use keeps
-- working. See PLATFORM-PLAN.md for how the pieces fit together.
--
-- What it adds
--   • admin_users + is_admin()            who may use the dashboard (no more hard-coded email in new rules)
--   • services                             name, description, price (JMD), duration, photo, active, …
--   • availability_hours / _breaks         working hours and breaks per weekday
--   • blocked_periods                      blocked dates or times
--   • booking_settings                     slot step, buffer, minimum notice, how far ahead, hold length
--   • payment_methods                      card (NCB/FAC), bank transfer, PayPal, Zelle, Cash App: on/off,
--                                          instructions, bank accounts, currency. The instructions and bank
--                                          accounts are PRIVATE: never readable from the website, only given to a
--                                          client who is holding a time and has chosen that way to pay.
--   • customers                            one record per email
--   • bookings (extended)                  start/end, hold expiry, payment status, amount, reference
--   • payments / payment_events            every payment attempt and gateway notification (once only)
--   • email_log                            every confirmation / receipt / alert (one "sent" per kind)
--   • functions                            free slots, hold a slot, Zelle submit, payment confirm/fail
--                                          (server only), admin verify/reschedule/cancel/refund
--   • (stage 2) payment_refunds            every refund (PayPal reports them; Launthia records others)
--   • (stage 2) request_limits             how often each visitor may try (a one-way code, no addresses)
--   • (stage 2) capture check, pending payments, gateway refunds, notification log (server only).
--   • (stage 3) email_log is the email queue: confirmation + receipt to the client and an alert to Launthia are
--     queued in the same step that confirms a payment (never before); the "booking-emails" function sends them.
--     Holding a time, paying and Zelle now go only through the "checkout" Edge Function.
--   • bank transfer (JMD): the client sends the exact amount to one of Launthia's accounts from their own banking
--     app and types the transfer reference; Launthia is emailed to check, and confirms once the money is there.
--   • pay in person (cash): the client books now and pays Launthia in cash at the appointment; she marks it paid
--     ("Cash received") in her dashboard. Her US-dollar rate (PayPal, Zelle) is set in her dashboard.
-- No two active bookings can overlap: the database itself refuses it (exclusion constraint), so two people
-- paying at the same moment can never both get the same time.
-- =====================================================================================================

-- 0. Small helpers ----------------------------------------------------------------------------------

-- keeps updated_at current on the tables that have it
create or replace function public.glow_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- 1. Who may use the dashboard -------------------------------------------------------------------------

create table if not exists public.admin_users (
  email text primary key,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  constraint admin_users_email_ok check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint admin_users_role_ok check (role in ('owner', 'staff'))
);
insert into public.admin_users (email, role) values ('launthiawatson@yahoo.com', 'owner') on conflict (email) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and exists (select 1 from public.admin_users a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- 2. Services (managed in the dashboard; nothing here is a permanent price) ----------------------------

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  price_jmd integer,                       -- the full price paid online; empty = priced on request
  price_note text,                         -- what the site shows when there is no online price (e.g. a range)
  duration_minutes integer not null default 60,
  image_path text,                         -- 'site:<photo name>' (a photo already on the site) or a path in
                                           -- the "service-images" storage bucket
  extra_info text,
  bookable_online boolean not null default true,   -- false: clients ask for a quote (e.g. Bridal)
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_slug_ok check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  constraint services_name_ok check (char_length(btrim(name)) between 2 and 60),
  constraint services_description_ok check (description is null or char_length(description) <= 800),
  constraint services_price_ok check (price_jmd is null or price_jmd between 0 and 10000000),
  constraint services_price_note_ok check (price_note is null or char_length(price_note) <= 80),
  constraint services_duration_ok check (duration_minutes between 15 and 600 and duration_minutes % 15 = 0),
  constraint services_image_ok check (image_path is null or char_length(image_path) <= 300),
  constraint services_info_ok check (extra_info is null or char_length(extra_info) <= 600),
  constraint services_online_needs_price check (not (bookable_online and price_jmd is null))
);
drop trigger if exists services_touch on public.services;
create trigger services_touch before update on public.services for each row execute function public.glow_touch();

-- The three services on the site today, as starting rows (Launthia edits them in the dashboard).
-- Full Glam has no online price yet: today it is a range, and paying in full online needs one amount.
-- Durations start at 60 minutes, the slot length the site uses today: she sets the real ones.
insert into public.services (slug, name, description, price_jmd, price_note, duration_minutes, image_path, extra_info, bookable_online, sort_order) values
  ('soft-glam', 'Soft Glam', 'A soft, skin-first look: glowing, even skin, gently defined eyes and a nude lip.', 9500, null, 60, 'site:soft-glam', null, true, 1),
  ('full-glam', 'Full Glam', 'A fuller, camera-ready look: sculpted skin, defined brows, lashes and a more dramatic eye.', null, 'JMD $10,500 – $12,000', 60, 'site:full-glam', 'Final price in that range confirmed before the appointment.', false, 2),
  ('bridal-glam', 'Bridal Glam', 'Wedding-day makeup for the bride, planned around you, your look and your venue.', null, 'Pricing on request', 60, 'site:bridal-pearl', 'Every bride is unique.', false, 3)
on conflict (slug) do nothing;

-- Full Glam comes in two looks, each with one fixed price, so it can be booked and paid online: the Full Glam card on
-- the website opens a "choose your look" step. Her range is JMD 10,500 – 12,000: the natural look starts at the low
-- end and the statement look at the high end (she changes either price in her dashboard; the card shows the range).
alter table public.services add column if not exists parent_slug text;    -- a look of another service (e.g. 'full-glam')
alter table public.services drop constraint if exists services_parent_ok;
alter table public.services add constraint services_parent_ok check (parent_slug is null or parent_slug ~ '^[a-z0-9][a-z0-9-]{1,39}$');
insert into public.services (slug, name, description, price_jmd, price_note, duration_minutes, image_path, extra_info, bookable_online, sort_order, parent_slug) values
  ('full-glam-natural', 'Natural Full Glam', 'Polished full glam that still looks like you: luminous skin, a soft sculpt, defined brows, a refined eye and light, wispy lashes.', 10500, null, 60, 'site:full-glam', null, true, 21, 'full-glam'),
  ('full-glam-statement', 'Statement Full Glam', 'Every feature defined for big moments and the camera: fuller coverage, a sculpted contour, a bolder or smoky eye and fuller lashes.', 12000, null, 60, 'site:full-glam', null, true, 22, 'full-glam')
on conflict (slug) do nothing;

-- The prices Launthia types in her dashboard (site_prices, from setup.sql) are the prices the booking form charges:
-- one price ("9,500") makes that service bookable online at exactly that price; a range ("10,500 – $12,000") is
-- shown as it is and clients ask for a quote – the same as the website shows. Kept in step on every change.
create or replace function public.glow_price_from_site() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text := replace(replace(btrim(new.price_text), ',', ''), ' ', ''); n numeric;
begin
  if v ~ '^\$?[0-9]{1,8}(\.[0-9]{1,2})?$' then n := round(ltrim(v, '$')::numeric); end if;
  if n is not null and n between 1 and 10000000 then
    update public.services set price_jmd = n::int, price_note = null, bookable_online = true
     where name = new.service and (price_jmd is distinct from n::int or price_note is not null or not bookable_online);
  else
    update public.services set bookable_online = false, price_jmd = null, price_note = left('JMD $' || btrim(new.price_text), 80)
     where name = new.service and (price_jmd is not null or bookable_online or price_note is distinct from left('JMD $' || btrim(new.price_text), 80));
  end if;
  return new;
end $$;
revoke all on function public.glow_price_from_site() from public, anon, authenticated;
do $$ begin
  if to_regclass('public.site_prices') is not null then
    -- the two Full Glam looks have prices of their own in her dashboard
    alter table public.site_prices drop constraint if exists site_prices_service_ok;
    alter table public.site_prices add constraint site_prices_service_ok check (service in ('Soft Glam', 'Full Glam', 'Natural Full Glam', 'Statement Full Glam'));
    insert into public.site_prices (service, price_text) values ('Natural Full Glam', '10,500'), ('Statement Full Glam', '12,000') on conflict (service) do nothing;
    drop trigger if exists site_prices_to_services on public.site_prices;
    create trigger site_prices_to_services after insert or update of price_text on public.site_prices
      for each row execute function public.glow_price_from_site();
    update public.site_prices set price_text = price_text;   -- once now, so both start the same
  end if;
end $$;

-- 3. Availability --------------------------------------------------------------------------------------

create table if not exists public.availability_hours (
  id bigint generated always as identity primary key,
  weekday smallint not null,               -- 0 Sunday, 1 Monday … 6 Saturday
  start_time time not null,
  end_time time not null,
  constraint availability_hours_weekday_ok check (weekday between 0 and 6),
  constraint availability_hours_order_ok check (end_time > start_time)
);
-- starting hours = the site today: Monday to Saturday, 9am to 5pm (only added when the table is empty)
insert into public.availability_hours (weekday, start_time, end_time)
  select d, time '09:00', time '17:00' from generate_series(1, 6) d
  where not exists (select 1 from public.availability_hours);

create table if not exists public.availability_breaks (
  id bigint generated always as identity primary key,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  label text,
  constraint availability_breaks_weekday_ok check (weekday between 0 and 6),
  constraint availability_breaks_order_ok check (end_time > start_time),
  constraint availability_breaks_label_ok check (label is null or char_length(label) <= 60)
);

create table if not exists public.blocked_periods (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,                              -- private to Launthia
  created_at timestamptz not null default now(),
  constraint blocked_periods_order_ok check (ends_at > starts_at),
  constraint blocked_periods_reason_ok check (reason is null or char_length(reason) <= 200)
);

create table if not exists public.booking_settings (
  id smallint primary key default 1,
  slot_step_minutes integer not null default 60,     -- start times every …
  buffer_minutes integer not null default 0,         -- gap kept free after each appointment
  min_notice_minutes integer not null default 60,    -- how soon from now a slot can start
  max_days_ahead integer not null default 90,        -- how far ahead clients can book (the site: 3 months)
  hold_minutes integer not null default 15,          -- how long a slot is kept while the client pays
  max_active_holds integer not null default 30,      -- safety cap on slots held at once, across everyone
  updated_at timestamptz not null default now(),
  constraint booking_settings_one_row check (id = 1),
  constraint booking_settings_step_ok check (slot_step_minutes in (15, 30, 45, 60, 90, 120)),
  constraint booking_settings_buffer_ok check (buffer_minutes between 0 and 240),
  constraint booking_settings_notice_ok check (min_notice_minutes between 0 and 20160),
  constraint booking_settings_ahead_ok check (max_days_ahead between 1 and 365),
  constraint booking_settings_hold_ok check (hold_minutes between 5 and 60),
  constraint booking_settings_holds_ok check (max_active_holds between 1 and 500)
);
insert into public.booking_settings (id) values (1) on conflict (id) do nothing;
drop trigger if exists booking_settings_touch on public.booking_settings;
create trigger booking_settings_touch before update on public.booking_settings for each row execute function public.glow_touch();

-- 4. Payment methods (switched on and off in the dashboard; credentials are NOT stored here: they are
--    Supabase Edge Function secrets) -------------------------------------------------------------------

create table if not exists public.payment_methods (
  method text primary key,
  enabled boolean not null default false,
  label text not null,
  instructions text,                        -- shown to clients (Zelle: her approved payment instructions)
  charge_currency text not null default 'JMD',
  jmd_per_usd numeric(10, 4),               -- when charging in USD: how many JMD to one USD (her rate)
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint payment_methods_method_ok check (method in ('card', 'paypal', 'zelle')),
  constraint payment_methods_label_ok check (char_length(label) between 2 and 60),
  constraint payment_methods_instructions_ok check (instructions is null or char_length(instructions) <= 1200),
  constraint payment_methods_currency_ok check (charge_currency in ('JMD', 'USD')),
  constraint payment_methods_rate_ok check (jmd_per_usd is null or jmd_per_usd > 0),
  constraint payment_methods_usd_needs_rate check (not (enabled and charge_currency = 'USD' and jmd_per_usd is null)),
  constraint payment_methods_zelle_needs_instructions check (not (enabled and method = 'zelle' and instructions is null))
);
-- (Cash App and bank transfer added later: the rules are widened here so an existing table takes them too)
-- Bank transfer: her bank accounts, as a list of { bank, account_name, account_number, branch, account_type }.
-- PRIVATE, like the instructions: only given to a client who is holding a time and has chosen bank transfer.
alter table public.payment_methods add column if not exists accounts jsonb;
create or replace function public.glow_bank_accounts_ok(a jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(a) = 'array' and jsonb_array_length(a) between 1 and 4
     and not exists (select 1 from jsonb_array_elements(a) e
                     where jsonb_typeof(e) <> 'object'
                        or char_length(btrim(coalesce(e ->> 'bank', ''))) not between 2 and 60
                        or char_length(btrim(coalesce(e ->> 'account_name', ''))) not between 2 and 80
                        or btrim(coalesce(e ->> 'account_number', '')) !~ '^[0-9][0-9 -]{2,28}[0-9]$'
                        or char_length(coalesce(e ->> 'branch', '')) > 60
                        or char_length(coalesce(e ->> 'account_type', '')) > 60);
$$;
alter table public.payment_methods drop constraint if exists payment_methods_method_ok;
alter table public.payment_methods drop constraint if exists payment_methods_zelle_needs_instructions;
alter table public.payment_methods drop constraint if exists payment_methods_manual_needs_instructions;
alter table public.payment_methods drop constraint if exists payment_methods_accounts_ok;
alter table public.payment_methods drop constraint if exists payment_methods_bank_needs_accounts;
alter table public.payment_methods
  add constraint payment_methods_method_ok check (method in ('card', 'bank', 'paypal', 'zelle', 'cashapp', 'cash')),
  add constraint payment_methods_manual_needs_instructions check (not (enabled and method in ('zelle', 'cashapp') and instructions is null)),
  add constraint payment_methods_accounts_ok check (accounts is null or (method = 'bank' and public.glow_bank_accounts_ok(accounts))),
  add constraint payment_methods_bank_needs_accounts check (not (enabled and method = 'bank' and accounts is null));
insert into public.payment_methods (method, enabled, label, charge_currency, sort_order) values
  ('card', false, 'Debit or credit card (Visa, Mastercard)', 'JMD', 1),
  ('paypal', false, 'PayPal', 'USD', 2),
  ('zelle', false, 'Zelle', 'USD', 3),
  ('cashapp', false, 'Cash App', 'USD', 4)
on conflict (method) do nothing;
-- bank transfer (in JMD) comes second, after card (added once; switched on by her private details script)
do $$ begin
  if not exists (select 1 from public.payment_methods where method = 'bank') then
    update public.payment_methods set sort_order = sort_order + 1 where sort_order >= 2;
    insert into public.payment_methods (method, enabled, label, charge_currency, sort_order) values ('bank', false, 'Bank transfer', 'JMD', 2);
  end if;
  -- pay in person (cash at the appointment): on from the start, as the owner asked (added once)
  if not exists (select 1 from public.payment_methods where method = 'cash') then
    insert into public.payment_methods (method, enabled, label, charge_currency, sort_order) values ('cash', true, 'Pay in person (cash)', 'JMD', 90);
  end if;
end $$;
drop trigger if exists payment_methods_touch on public.payment_methods;
create trigger payment_methods_touch before update on public.payment_methods for each row execute function public.glow_touch();

-- 5. Customers -------------------------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_email_ok check (email = lower(email) and char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint customers_name_ok check (char_length(full_name) between 2 and 80),
  constraint customers_phone_ok check (phone ~ '^[0-9+() .-]+$' and char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15)
);
drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers for each row execute function public.glow_touch();

-- 6. Bookings: the existing table, extended (old booking requests keep working) -------------------------

alter table public.bookings
  add column if not exists service_id uuid references public.services(id),
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists block_until timestamptz,          -- end + buffer: nobody else may start before this
  add column if not exists hold_expires_at timestamptz,
  add column if not exists amount_jmd integer,
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists reference text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists rescheduled_at timestamptz;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings drop constraint if exists bookings_status_ok;
alter table public.bookings drop constraint if exists bookings_payment_status_ok;
alter table public.bookings drop constraint if exists bookings_payment_method_ok;
alter table public.bookings drop constraint if exists bookings_times_ok;
alter table public.bookings drop constraint if exists bookings_reference_ok;
alter table public.bookings drop constraint if exists bookings_cancel_reason_ok;
alter table public.bookings
  add constraint bookings_status_ok check (status in ('Requested', 'Held', 'Pending payment', 'Confirmed', 'Paid', 'Done', 'Cancelled', 'Expired', 'Needs attention')),
  add constraint bookings_payment_status_ok check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'partly refunded')),
  add constraint bookings_payment_method_ok check (payment_method is null or payment_method in ('card', 'bank', 'paypal', 'zelle', 'cashapp', 'cash')),
  add constraint bookings_times_ok check (start_at is null or (end_at > start_at and block_until >= end_at)),
  add constraint bookings_reference_ok check (reference is null or reference ~ '^GBL-[A-Z0-9]{6}$'),
  add constraint bookings_cancel_reason_ok check (cancel_reason is null or char_length(cancel_reason) <= 300);
create unique index if not exists bookings_reference_once on public.bookings (reference) where reference is not null;
create index if not exists bookings_start_at on public.bookings (start_at) where start_at is not null;
create index if not exists bookings_held on public.bookings (hold_expires_at) where status = 'Held';

-- NO DOUBLE BOOKINGS: two active bookings can never overlap (checked by the database on every write)
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (tstzrange(start_at, block_until, '[)') with &&)
  where (start_at is not null and status in ('Held', 'Pending payment', 'Confirmed', 'Paid', 'Requested'));

-- the public key may still send an old-style booking request, but only the columns the site sends today
-- (it can never set times, holds, payment fields or references)
revoke insert on public.bookings from anon;
grant insert (client_name, phone, email, service, appt_date, appt_time, price_jmd, client_note, terms_agreed_at, status) on public.bookings to anon;

-- and a second lock that works even if setup.sql is run again later (which re-grants the whole table):
-- a row written directly with the public or signed-in key never keeps any of the platform's fields.
-- Rows made by the booking functions below (they run as the database owner) are not touched.
create or replace function public.glow_bookings_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.service_id := null; new.customer_id := null; new.start_at := null; new.end_at := null; new.block_until := null;
    new.hold_expires_at := null; new.amount_jmd := null; new.payment_method := null; new.payment_status := 'unpaid';
    new.reference := null; new.confirmed_at := null; new.cancelled_at := null; new.cancel_reason := null; new.rescheduled_at := null;
  end if;
  return new;
end $$;
revoke all on function public.glow_bookings_guard() from public, anon, authenticated;
drop trigger if exists bookings_platform_guard on public.bookings;
create trigger bookings_platform_guard before insert on public.bookings for each row execute function public.glow_bookings_guard();

-- staff added to admin_users can see and manage bookings too (Launthia's own access is unchanged)
drop policy if exists "glow: admins read bookings" on public.bookings;
drop policy if exists "glow: admins change bookings" on public.bookings;

-- 7. Payments, gateway notifications and emails --------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  method text not null,
  status text not null,
  amount numeric(12, 2) not null,           -- what was charged, in the currency below
  currency text not null,
  amount_jmd integer not null,              -- the booking price it covers, in JMD
  provider_ref text,                        -- gateway order / transaction id, or the Zelle confirmation typed by the client
  provider_status text,                     -- the gateway's own word for the result, for the records
  failure_reason text,
  refunded_jmd integer not null default 0,
  notes text,                               -- Launthia's private notes (refunds, checks)
  verified_at timestamptz,
  verified_by text,                         -- 'gateway' or the email of the admin who checked it (Zelle)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_method_ok check (method in ('card', 'paypal', 'zelle')),
  constraint payments_status_ok check (status in ('started', 'awaiting review', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded', 'partly refunded')),
  constraint payments_amount_ok check (amount >= 0 and amount_jmd >= 0),
  constraint payments_currency_ok check (currency in ('JMD', 'USD')),
  constraint payments_refund_ok check (refunded_jmd between 0 and amount_jmd),
  constraint payments_ref_ok check (provider_ref is null or char_length(provider_ref) between 3 and 120),
  constraint payments_text_ok check (char_length(coalesce(failure_reason, '')) <= 500 and char_length(coalesce(notes, '')) <= 1000 and char_length(coalesce(provider_status, '')) <= 60),
  constraint payments_provider_ref_once unique (method, provider_ref)     -- a gateway reference is processed once
);
create index if not exists payments_booking on public.payments (booking_id);
alter table public.payments drop constraint if exists payments_method_ok;
alter table public.payments add constraint payments_method_ok check (method in ('card', 'bank', 'paypal', 'zelle', 'cashapp', 'cash'));
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments for each row execute function public.glow_touch();

-- (stage 2) the gateway's own transaction id (PayPal: the capture id, needed to match refunds) and a flag for
-- payments made in a TEST environment (PayPal sandbox: no real money moved)
alter table public.payments
  add column if not exists gateway_txn_id text,
  add column if not exists is_test boolean not null default false,
  add column if not exists capture_claimed_at timestamptz;   -- a capture is being asked for right now (one at a time)
alter table public.payments drop constraint if exists payments_txn_ok;
alter table public.payments add constraint payments_txn_ok check (gateway_txn_id is null or char_length(gateway_txn_id) between 3 and 120);
create unique index if not exists payments_txn_once on public.payments (method, gateway_txn_id) where gateway_txn_id is not null;

-- every refund, one row each: reported by the gateway (counted once per gateway refund id) or recorded by Launthia
create table if not exists public.payment_refunds (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  source text not null,                     -- 'gateway' (PayPal / the bank told us) or 'manual' (Launthia recorded it)
  provider_refund_id text,
  amount numeric(12, 2) not null,           -- in the payment's currency
  currency text not null,
  amount_jmd integer not null,              -- the part of the JMD price it gives back
  note text,
  recorded_by text,
  created_at timestamptz not null default now(),
  constraint payment_refunds_source_ok check (source in ('gateway', 'manual')),
  constraint payment_refunds_amount_ok check (amount > 0 and amount_jmd >= 0),
  constraint payment_refunds_currency_ok check (currency in ('JMD', 'USD')),
  constraint payment_refunds_text_ok check (char_length(coalesce(provider_refund_id, '')) <= 120 and char_length(coalesce(note, '')) <= 300 and char_length(coalesce(recorded_by, '')) <= 120)
);
create unique index if not exists payment_refunds_once on public.payment_refunds (provider_refund_id) where provider_refund_id is not null;
create index if not exists payment_refunds_payment on public.payment_refunds (payment_id);

-- request counters for the booking server (per visitor, per few minutes); holds no personal data: visitors are
-- counted under a one-way code, never their address
create table if not exists public.request_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start),
  constraint request_limits_bucket_ok check (char_length(bucket) <= 100)
);

create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  method text not null,
  event_id text not null,                   -- the gateway's notification id
  kind text,
  booking_id uuid references public.bookings(id) on delete set null,
  handled boolean not null default false,
  note text,
  received_at timestamptz not null default now(),
  constraint payment_events_method_ok check (method in ('card', 'paypal', 'zelle')),
  constraint payment_events_once unique (method, event_id),
  constraint payment_events_text_ok check (char_length(event_id) <= 200 and char_length(coalesce(kind, '')) <= 100 and char_length(coalesce(note, '')) <= 500)
);
alter table public.payment_events add column if not exists handled_at timestamptz;
alter table public.payment_events drop constraint if exists payment_events_method_ok;
alter table public.payment_events add constraint payment_events_method_ok check (method in ('card', 'paypal', 'zelle', 'cashapp'));

create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null,
  to_email text not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint email_log_kind_ok check (kind in ('booking_confirmation', 'payment_receipt', 'owner_new_booking', 'payment_pending', 'booking_cancelled', 'booking_rescheduled')),
  constraint email_log_status_ok check (status in ('sent', 'failed', 'skipped')),
  constraint email_log_detail_ok check (detail is null or char_length(detail) <= 500)
);
-- (stage 3) the email queue: every email is a row here BEFORE it is sent (queued in the same transaction as the
-- payment confirmation, so no confirmation can ever go out for a payment that was not confirmed). Each email has
-- a dedupe key, so it is queued once; the sender claims it, sends it once (with the same key as Resend's
-- Idempotency-Key) and records the result.
alter table public.email_log
  add column if not exists payment_id uuid references public.payments(id) on delete set null,
  add column if not exists audience text,                    -- 'client' or 'owner'
  add column if not exists dedupe_key text,
  add column if not exists attempts integer not null default 0,
  add column if not exists provider_id text,                 -- Resend's id for the sent email
  add column if not exists sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table public.email_log drop constraint if exists email_log_kind_ok;
alter table public.email_log drop constraint if exists email_log_status_ok;
alter table public.email_log drop constraint if exists email_log_audience_ok;
alter table public.email_log drop constraint if exists email_log_extra_ok;
alter table public.email_log
  add constraint email_log_kind_ok check (kind in ('booking_confirmation', 'payment_receipt', 'booking_cancelled', 'booking_rescheduled',
                                                   'owner_new_booking', 'owner_bank_check', 'owner_zelle_check', 'owner_cashapp_check', 'owner_attention', 'payment_pending')),
  add constraint email_log_status_ok check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  add constraint email_log_audience_ok check (audience is null or audience in ('client', 'owner')),
  add constraint email_log_extra_ok check (attempts between 0 and 10 and char_length(coalesce(dedupe_key, '')) <= 200 and char_length(coalesce(provider_id, '')) <= 120);
drop index if exists public.email_log_once;
create unique index if not exists email_log_dedupe on public.email_log (dedupe_key) where dedupe_key is not null;
create index if not exists email_log_queue on public.email_log (status, id) where status in ('queued', 'sending');

-- 8. Functions ---------------------------------------------------------------------------------------------

-- internal: put one email in the queue, once per dedupe key. Owner emails go to the alert email in Settings and
-- follow her "email alerts" switch; client emails go to the email given with the booking.
create or replace function public.glow_queue_email(p_booking uuid, p_payment uuid, p_kind text, p_dedupe text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_aud text := case when p_kind like 'owner_%' then 'owner' else 'client' end;
        v_to text; v_on boolean := true; v_status text := 'queued'; v_detail text := null;
begin
  if v_aud = 'owner' then
    select alert_email, email_alerts into v_to, v_on from public.owner_settings where id = 1;
    if not found or v_to is null then v_status := 'skipped'; v_detail := 'no alert email set';
    elsif not v_on then v_status := 'skipped'; v_detail := 'email alerts are off'; end if;
  else
    select email into v_to from public.bookings where id = p_booking;
    if v_to is null or v_to = '' then v_status := 'skipped'; v_detail := 'no client email'; end if;
  end if;
  insert into public.email_log (booking_id, payment_id, kind, audience, to_email, status, detail, dedupe_key)
  values (p_booking, p_payment, p_kind, v_aud, coalesce(lower(v_to), ''), v_status, v_detail, left(p_dedupe, 200))
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return found;
end $$;

-- a booking reference like GBL-7K3QX9 (no 0/O/1/I to avoid mix-ups), unique
create or replace function public.new_booking_reference() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ref text;
begin
  loop
    ref := 'GBL-';
    for i in 1..6 loop ref := ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.bookings where reference = ref);
  end loop;
  return ref;
end $$;

-- holds whose time ran out free their slot (called by every function that books, and on a schedule)
create or replace function public.release_expired_holds(p_except uuid default null) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  with gone as (
    update public.bookings set status = 'Expired'
    where status = 'Held' and hold_expires_at <= now() and (p_except is null or id <> p_except)
    returning id)
  update public.payments p set status = 'expired', failure_reason = coalesce(p.failure_reason, 'the slot hold ran out')
  from gone where p.booking_id = gone.id and p.status = 'started';
  get diagnostics n = row_count;
  return n;
end $$;

-- the free start times for one service on one day (Jamaica time). Applies working hours, breaks, blocked
-- days and times, every active booking (+ buffer), minimum notice and how far ahead. Never offers the past.
create or replace function public.glow_free_slots(p_service uuid, p_day date, p_ignore uuid default null)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.services%rowtype;
  cfg public.booking_settings%rowtype;
  tz constant text := 'America/Jamaica';
  local_today date := (now() at time zone tz)::date;
  dur interval; step interval; buf interval; earliest timestamptz;
begin
  select * into s from public.services where id = p_service and active and bookable_online and price_jmd is not null;
  if not found then return; end if;
  select * into cfg from public.booking_settings where id = 1;
  if not found or p_day is null or p_day < local_today or p_day > local_today + cfg.max_days_ahead then return; end if;
  if exists (select 1 from public.blocked_days bd where bd.day = p_day) then return; end if;
  dur := make_interval(mins => s.duration_minutes);
  step := make_interval(mins => cfg.slot_step_minutes);
  buf := make_interval(mins => cfg.buffer_minutes);
  earliest := now() + make_interval(mins => cfg.min_notice_minutes);
  return query
    select g, g + dur
    from public.availability_hours h,
         generate_series((p_day + h.start_time) at time zone tz, (p_day + h.end_time) at time zone tz - dur, step) g
    where h.weekday = extract(dow from p_day)::int
      and g >= earliest
      and not exists (select 1 from public.availability_breaks br
                      where br.weekday = h.weekday
                        and tstzrange((p_day + br.start_time) at time zone tz, (p_day + br.end_time) at time zone tz) && tstzrange(g, g + dur))
      and not exists (select 1 from public.blocked_periods bp
                      where tstzrange(bp.starts_at, bp.ends_at) && tstzrange(g, g + dur + buf))
      and not exists (select 1 from public.bookings b
                      where b.start_at is not null and b.id is distinct from p_ignore
                        and b.status in ('Held', 'Pending payment', 'Confirmed', 'Paid', 'Requested')
                        and not (b.status = 'Held' and b.hold_expires_at <= now())
                        and tstzrange(b.start_at, b.block_until) && tstzrange(g, g + dur + buf))
      -- booking requests sent with the old form (a day and an hour, one hour long)
      and not exists (select 1 from public.bookings b
                      where b.start_at is null and b.id is distinct from p_ignore
                        and b.status in ('Requested', 'Confirmed', 'Paid') and b.appt_date = p_day
                        and case when b.appt_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
                              tstzrange((b.appt_date + b.appt_time::time) at time zone tz,
                                        (b.appt_date + b.appt_time::time) at time zone tz + interval '1 hour') && tstzrange(g, g + dur + buf)
                            else false end)
    order by g;
end $$;

-- PUBLIC: free start times for a service on a day
create or replace function public.get_available_slots(p_service uuid, p_day date)
returns table (slot_start timestamptz, slot_end timestamptz)
language sql stable security definer set search_path = public as $$
  select f.slot_start, f.slot_end from public.glow_free_slots(p_service, p_day, null) f;
$$;

-- PUBLIC: the days (in a range of up to 62 days) that still have at least one free time
create or replace function public.get_available_days(p_service uuid, p_from date, p_to date)
returns setof date
language sql stable security definer set search_path = public as $$
  select d::date from generate_series(p_from::timestamp, least(p_to, p_from + 62)::timestamp, interval '1 day') d
  where exists (select 1 from public.glow_free_slots(p_service, d::date, null));
$$;

-- PUBLIC: what the booking form needs (rules, opening hours, the payment methods that are switched on). Never
-- the payment instructions or bank accounts: only whether each way to pay is ready.
create or replace function public.get_booking_options() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'timezone', 'America/Jamaica',
    'max_days_ahead', c.max_days_ahead,
    'min_notice_minutes', c.min_notice_minutes,
    'hold_minutes', c.hold_minutes,
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', to_char(h.start_time, 'HH24:MI'), 'end', to_char(h.end_time, 'HH24:MI')) order by h.weekday, h.start_time) from public.availability_hours h), '[]'::jsonb),
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('method', m.method, 'label', m.label,
        'ready', case when m.method = 'bank' then m.accounts is not null when m.method in ('zelle', 'cashapp') then m.instructions is not null else true end,
        'currency', m.charge_currency, 'jmd_per_usd', m.jmd_per_usd) order by m.sort_order, m.method) from public.payment_methods m where m.enabled), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description,
        'price_jmd', s.price_jmd, 'price_note', s.price_note, 'duration_minutes', s.duration_minutes, 'image_path', s.image_path,
        'extra_info', s.extra_info, 'bookable_online', s.bookable_online, 'parent_slug', s.parent_slug) order by s.sort_order, s.name) from public.services s where s.active), '[]'::jsonb))
  from public.booking_settings c where c.id = 1;
$$;

-- the amount to charge for a booking with a method (JMD, or USD at her rate, rounded UP to the cent)
create or replace function public.glow_charge_amount(p_amount_jmd integer, p_method text)
returns table (amount numeric, currency text)
language sql stable security definer set search_path = public as $$
  select case when m.charge_currency = 'USD' then ceil(p_amount_jmd / m.jmd_per_usd * 100) / 100 else p_amount_jmd::numeric end,
         m.charge_currency
  from public.payment_methods m where m.method = p_method;
$$;

-- PUBLIC: hold a slot while the client pays. Checks everything again on the server; the database's
-- no-overlap rule settles any race. Returns the booking's private id (the client's key to pay for it).
create or replace function public.create_booking_hold(p_service uuid, p_start timestamptz, p_name text, p_email text, p_phone text, p_agree_terms boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.services%rowtype;
  cfg public.booking_settings%rowtype;
  tz constant text := 'America/Jamaica';
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_local timestamp;
  v_customer uuid; v_id uuid; v_until timestamptz;
begin
  if not coalesce(p_agree_terms, false) then raise exception using message = 'Please tick the box to agree to the Terms and Cancellation & Refund Policy.'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception using message = 'Please enter your full name.'; end if;
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception using message = 'Please enter a valid email so we can send your confirmation.'; end if;
  if v_phone !~ '^[0-9+() .-]+$' or char_length(v_digits) not between 7 and 15 then raise exception using message = 'Please enter a valid phone number.'; end if;
  if p_start is null then raise exception using message = 'Please pick a time.'; end if;

  perform public.release_expired_holds();
  select * into s from public.services where id = p_service and active;
  if not found or not s.bookable_online or s.price_jmd is null then raise exception using message = 'This service can’t be booked online yet. Please contact Launthia.'; end if;
  select * into cfg from public.booking_settings where id = 1;

  v_local := p_start at time zone tz;
  if not exists (select 1 from public.glow_free_slots(p_service, v_local::date, null) f where f.slot_start = p_start) then
    raise exception using message = 'That time is no longer available. Please pick another time.';
  end if;
  if (select count(*) from public.bookings b where b.status = 'Held' and b.hold_expires_at > now()
        and (lower(b.email) = v_email or regexp_replace(b.phone, '\D', '', 'g') = v_digits)) >= 2 then
    raise exception using message = 'You already have bookings waiting for payment. Please finish one, or try again in a few minutes.';
  end if;
  if (select count(*) from public.bookings b where b.status = 'Held' and b.hold_expires_at > now()) >= cfg.max_active_holds then
    raise exception using message = 'Booking is very busy right now. Please try again in a few minutes.';
  end if;

  -- the customer record is created once per email and never overwritten from the public form (anyone could type
  -- someone else's email); the booking itself keeps the name and phone given for it
  insert into public.customers as c (email, full_name, phone) values (v_email, v_name, v_phone)
    on conflict (email) do update set email = c.email
    returning c.id into v_customer;

  v_until := now() + make_interval(mins => cfg.hold_minutes);
  begin
    insert into public.bookings (client_name, phone, email, service, service_id, customer_id, appt_date, appt_time,
                                 price_jmd, amount_jmd, start_at, end_at, block_until, hold_expires_at, terms_agreed_at,
                                 status, payment_status)
    values (v_name, v_phone, v_email, s.name, s.id, v_customer, v_local::date, to_char(v_local, 'HH24:MI'),
            s.price_jmd, s.price_jmd, p_start, p_start + make_interval(mins => s.duration_minutes),
            p_start + make_interval(mins => s.duration_minutes + cfg.buffer_minutes), v_until, now(),
            'Held', 'unpaid')
    returning id into v_id;
  exception when exclusion_violation then
    raise exception using message = 'That time was just taken. Please pick another time.';
  end;

  return jsonb_build_object('booking_id', v_id, 'hold_expires_at', v_until, 'service', s.name,
                            'starts_at', p_start, 'ends_at', p_start + make_interval(mins => s.duration_minutes),
                            'amount_jmd', s.price_jmd);
end $$;

-- PUBLIC: the client changes their mind before paying: the slot is freed at once
create or replace function public.cancel_booking_hold(p_booking uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.bookings set status = 'Expired', hold_expires_at = now() where id = p_booking and status = 'Held';
  if not found then return jsonb_build_object('released', false); end if;
  update public.payments set status = 'cancelled', failure_reason = coalesce(failure_reason, 'the client went back') where booking_id = p_booking and status = 'started';
  return jsonb_build_object('released', true);
end $$;

-- PUBLIC: the status of one booking, for its return / confirmation page (by its private id only; no name,
-- email or phone is returned)
create or replace function public.get_booking_status(p_booking uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', case when b.status = 'Held' and b.hold_expires_at <= now() then 'Expired' else b.status end,
    'payment_status', b.payment_status,
    'payment_method', b.payment_method,
    'service', b.service,
    'starts_at', b.start_at,
    'ends_at', b.end_at,
    'amount_jmd', b.amount_jmd,
    'hold_expires_at', b.hold_expires_at,
    'reference', case when b.status in ('Confirmed', 'Paid', 'Done') then b.reference end,
    'payment', (select jsonb_build_object('method', p.method, 'amount', p.amount, 'currency', p.currency, 'status', p.status, 'is_test', p.is_test)
                from public.payments p where p.booking_id = b.id order by p.created_at desc limit 1))
  from public.bookings b where b.id = p_booking and b.start_at is not null;
$$;

-- SERVER ONLY (via the checkout function): bank transfer, Zelle or Cash App – the client has sent the money
-- themselves and types its reference (for a bank transfer, also which of her accounts they sent it to). The booking
-- waits as "Pending payment" (time kept) until Launthia confirms the money arrived in her account. Never marks
-- anything paid.
drop function if exists public.submit_manual_payment(uuid, text, text, text);
create or replace function public.submit_manual_payment(p_booking uuid, p_method text, p_reference text, p_sender_name text, p_sent_to text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  m public.payment_methods%rowtype;
  v_label text := case p_method when 'bank' then 'Bank transfer' when 'zelle' then 'Zelle' when 'cashapp' then 'Cash App' end;
  v_ref text := btrim(coalesce(p_reference, ''));
  v_sender text := btrim(coalesce(p_sender_name, ''));
  v_to jsonb; v_to_text text;
  v_amount numeric; v_currency text; v_pay_id uuid;
begin
  if v_label is null then raise exception using message = 'Please choose a way to pay.'; end if;
  select * into m from public.payment_methods where method = p_method;
  if not found or not m.enabled or (p_method = 'bank' and m.accounts is null) or (p_method <> 'bank' and m.instructions is null) then
    raise exception using message = v_label || ' is not available right now.';
  end if;
  -- (bank transfer: the reference is optional – Launthia can match the deposit by the sender's name and the amount)
  if (p_method <> 'bank' or v_ref <> '') and char_length(v_ref) not between 4 and 60 then
    raise exception using message = case p_method when 'bank' then 'Please check the transfer reference (or leave it empty).'
                                                  when 'zelle' then 'Please enter the Zelle confirmation number.'
                                                  else 'Please enter the Cash App payment reference.' end;
  end if;
  if char_length(v_sender) not between 2 and 80 then
    raise exception using message = case p_method when 'bank' then 'Please enter the name on the account the transfer was sent from.'
                                                  else 'Please enter the name the ' || v_label || ' payment was sent from.' end;
  end if;
  if p_method = 'bank' then
    -- which of her accounts: its number in the list (1, 2, …), as shown to the client
    if coalesce(p_sent_to, '') ~ '^[1-9]$' and p_sent_to::int <= jsonb_array_length(m.accounts) then
      v_to := m.accounts -> (p_sent_to::int - 1);
    end if;
    if v_to is null then raise exception using message = 'Please choose which account you sent the money to.'; end if;
    v_to_text := btrim(v_to ->> 'bank') || ' (account ending ' || right(regexp_replace(v_to ->> 'account_number', '[^0-9]', '', 'g'), 4) || ')';
  end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'Held' or b.hold_expires_at <= now() then
    raise exception using message = 'This booking is no longer held. Please pick your time again.';
  end if;
  select c.amount, c.currency into v_amount, v_currency from public.glow_charge_amount(b.amount_jmd, p_method) c;
  begin
    insert into public.payments (booking_id, method, status, amount, currency, amount_jmd, provider_ref, provider_status, notes)
    values (b.id, p_method, 'awaiting review', v_amount, v_currency, b.amount_jmd, nullif(v_ref, ''), 'submitted by client',
            'Sent from: ' || v_sender || coalesce(' · Sent to: ' || v_to_text, ''))
    returning id into v_pay_id;
  exception when unique_violation then
    raise exception using message = case p_method when 'bank' then 'That transfer reference has already been used.'
                                                  when 'zelle' then 'That Zelle confirmation number has already been used.'
                                                  else 'That Cash App reference has already been used.' end;
  end;
  update public.bookings set status = 'Pending payment', payment_status = 'pending', payment_method = p_method, hold_expires_at = null where id = b.id;
  -- Launthia is told to check her account (she confirms in the dashboard only when the money is there)
  perform public.glow_queue_email(b.id, v_pay_id, 'owner_' || p_method || '_check', 'owner_' || p_method || '_check:' || v_pay_id);
  return jsonb_build_object('status', 'Pending payment', 'method', p_method, 'amount', v_amount, 'currency', v_currency);
end $$;

-- SERVER ONLY (via the checkout function): pay in person – the client books the time now and pays Launthia in cash
-- at the appointment. The booking is Confirmed (with a reference) and shows in her dashboard as "cash – to pay in
-- person"; nothing is marked paid until she taps "Cash received". The client gets the booking confirmation (saying
-- what to pay at the appointment) and Launthia her new-booking alert.
create or replace function public.book_pay_in_person(p_booking uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; m public.payment_methods%rowtype; v_ref text;
begin
  select * into m from public.payment_methods where method = 'cash';
  if not found or not m.enabled then raise exception using message = 'Paying in person is not available right now. Please choose another way to pay.'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'Held' or b.hold_expires_at <= now() then
    raise exception using message = 'This booking is no longer held. Please pick your time again.';
  end if;
  v_ref := public.new_booking_reference();
  update public.bookings set status = 'Confirmed', payment_method = 'cash', payment_status = 'unpaid', reference = v_ref,
         confirmed_at = now(), hold_expires_at = null
   where id = b.id;
  perform public.glow_queue_email(b.id, null, 'booking_confirmation', 'booking_confirmation:' || b.id);
  perform public.glow_queue_email(b.id, null, 'owner_new_booking', 'owner_new_booking:' || b.id);
  return jsonb_build_object('status', 'confirmed', 'reference', v_ref, 'payment', 'in person', 'amount_jmd', b.amount_jmd);
end $$;

-- ADMIN: the client paid in cash at the appointment ("Cash received"). Recorded once as a cash payment; the booking
-- becomes Paid and the client gets a receipt.
create or replace function public.admin_mark_cash_paid(p_booking uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; who text := lower(coalesce(auth.jwt() ->> 'email', '')); v_pay uuid;
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception using message = 'Booking not found.'; end if;
  if b.payment_method is distinct from 'cash' or b.payment_status = 'paid' then
    raise exception using message = 'This booking is not waiting for a cash payment.';
  end if;
  if b.status not in ('Confirmed', 'Done') then raise exception using message = 'Only booked appointments can be marked paid.'; end if;
  insert into public.payments (booking_id, method, status, amount, currency, amount_jmd, provider_status, verified_at, verified_by, notes)
  values (b.id, 'cash', 'succeeded', coalesce(b.amount_jmd, b.price_jmd, 0), 'JMD', coalesce(b.amount_jmd, b.price_jmd, 0), 'paid in person', now(), who, 'Paid in person (cash)')
  returning id into v_pay;
  update public.bookings set status = case when status = 'Confirmed' then 'Paid' else status end, payment_status = 'paid', paid_at = now()
   where id = b.id;
  perform public.glow_queue_email(b.id, v_pay, 'payment_receipt', 'payment_receipt:' || v_pay);
  return jsonb_build_object('result', 'paid', 'paid_at', now());
end $$;

-- ADMIN: her US-dollar rate (how many JMD make 1 US dollar) for PayPal and Zelle. Setting it also switches them on
-- (Zelle only once her Zelle details are saved; PayPal shows on the website only once its keys are set on the server).
create or replace function public.admin_set_usd_rate(p_rate numeric) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  if p_rate is null or p_rate < 1 or p_rate > 100000 then
    raise exception using message = 'Please enter how many JMD make 1 US dollar, for example 157.50.';
  end if;
  update public.payment_methods set jmd_per_usd = round(p_rate, 4) where method in ('paypal', 'zelle', 'cashapp');
  update public.payment_methods set enabled = true where method = 'paypal';
  update public.payment_methods set enabled = true where method = 'zelle' and instructions is not null;
  return (select jsonb_build_object('rate', round(p_rate, 4), 'methods', jsonb_object_agg(method, enabled))
            from public.payment_methods where method in ('paypal', 'zelle'));
end $$;

-- the Zelle name used since stage 1 (same as submit_manual_payment with 'zelle')
create or replace function public.submit_zelle_payment(p_booking uuid, p_reference text, p_sender_name text)
returns jsonb
language sql volatile security definer set search_path = public as $$
  select public.submit_manual_payment(p_booking, 'zelle', p_reference, p_sender_name);
$$;

-- SERVER ONLY (Edge Functions): before the client pays – checks the hold, gives the exact amount and currency to
-- charge (always from the database, never from the browser) and refreshes the hold while they pay (never past
-- twice the hold length in total). For a bank transfer, Zelle and Cash App it also gives Launthia's payment
-- details (bank accounts / instructions): only here, to a client who is holding a time and chose that way to pay.
create or replace function public.prepare_payment(p_booking uuid, p_method text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  b public.bookings%rowtype; m public.payment_methods%rowtype; cfg public.booking_settings%rowtype;
  v_amount numeric; v_currency text;
begin
  select * into m from public.payment_methods where method = p_method;
  if not found or not m.enabled then return jsonb_build_object('ok', false, 'reason', 'payment method not available'); end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'Held' or b.hold_expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'hold expired'); end if;
  select * into cfg from public.booking_settings where id = 1;
  select c.amount, c.currency into v_amount, v_currency from public.glow_charge_amount(b.amount_jmd, p_method) c;
  if v_amount is null or v_amount <= 0 then return jsonb_build_object('ok', false, 'reason', 'no amount'); end if;
  update public.bookings set payment_method = p_method,
         hold_expires_at = least(greatest(hold_expires_at, now() + make_interval(mins => cfg.hold_minutes)),
                                 created_at + make_interval(mins => cfg.hold_minutes * 2))
  where id = b.id
  returning hold_expires_at into b.hold_expires_at;
  return jsonb_build_object('ok', true, 'amount', v_amount, 'currency', v_currency, 'amount_jmd', b.amount_jmd,
                            'service', b.service, 'starts_at', b.start_at, 'ends_at', b.end_at, 'booking_id', b.id,
                            'hold_expires_at', b.hold_expires_at,
                            'instructions', case when p_method in ('bank', 'zelle', 'cashapp') then m.instructions end,
                            'accounts', case when p_method = 'bank' then m.accounts end);
end $$;

-- SERVER ONLY: the gateway has created its payment / order for this booking. The amount must be exactly what
-- prepare_payment gave. A payment made in a test environment (PayPal sandbox) is flagged as a test.
drop function if exists public.record_payment_started(uuid, text, text, numeric, text);
create or replace function public.record_payment_started(p_booking uuid, p_method text, p_provider_ref text, p_amount numeric, p_currency text, p_is_test boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; v_amount numeric; v_currency text; v_owner uuid;
begin
  if p_method not in ('card', 'paypal') then return jsonb_build_object('ok', false, 'reason', 'method'); end if;
  if p_provider_ref is null or char_length(btrim(p_provider_ref)) not between 3 and 120 then return jsonb_build_object('ok', false, 'reason', 'reference'); end if;
  select * into b from public.bookings where id = p_booking;
  if not found then return jsonb_build_object('ok', false, 'reason', 'booking not found'); end if;
  select c.amount, c.currency into v_amount, v_currency from public.glow_charge_amount(b.amount_jmd, p_method) c;
  if v_amount is null or p_currency is distinct from v_currency or abs(coalesce(p_amount, -1) - v_amount) > 0.009 then
    return jsonb_build_object('ok', false, 'reason', 'amount differs');
  end if;
  insert into public.payments (booking_id, method, status, amount, currency, amount_jmd, provider_ref, is_test)
  values (p_booking, p_method, 'started', p_amount, p_currency, b.amount_jmd, p_provider_ref, coalesce(p_is_test, false))
  on conflict (method, provider_ref) do nothing;
  select booking_id into v_owner from public.payments where method = p_method and provider_ref = p_provider_ref;
  if v_owner is distinct from p_booking then return jsonb_build_object('ok', false, 'reason', 'reference belongs to another booking'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- SERVER ONLY: find a payment by the gateway's order reference, by its transaction id, or the latest one for a
-- booking (for the client's return page)
create or replace function public.find_payment(p_method text, p_provider_ref text default null, p_txn_id text default null, p_booking uuid default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('payment_id', p.id, 'booking_id', p.booking_id, 'status', p.status, 'provider_ref', p.provider_ref,
                            'gateway_txn_id', p.gateway_txn_id, 'amount', p.amount, 'currency', p.currency, 'is_test', p.is_test)
  from public.payments p
  where p.method = p_method
    and case when p_provider_ref is not null then p.provider_ref = p_provider_ref
             when p_txn_id is not null then p.gateway_txn_id = p_txn_id
             else p_booking is not null and p.booking_id = p_booking end
  order by p.created_at desc limit 1;
$$;

-- SERVER ONLY: just before the server asks the gateway to take the money for an approved payment. Checks the
-- client still holds the time (or, if their hold ran out while paying, that the time is still free) and keeps
-- it for 5 more minutes, and claims the capture so two requests (the return page and a notification) never ask
-- the gateway at the same moment. When ok is false, the money must NOT be taken.
-- result: ok | in_progress | already_succeeded | already_paid | slot_taken | not_found | unknown_payment | <status>
create or replace function public.lock_for_capture(p_booking uuid, p_method text, p_provider_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; pay public.payments%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('ok', false, 'result', 'not_found'); end if;
  select * into pay from public.payments where method = p_method and provider_ref = p_provider_ref and booking_id = p_booking for update;
  if not found then return jsonb_build_object('ok', false, 'result', 'unknown_payment'); end if;
  if pay.status in ('succeeded', 'refunded', 'partly refunded') then
    return jsonb_build_object('ok', false, 'result', 'already_succeeded', 'reference', b.reference);
  end if;
  if b.payment_status = 'paid' then
    return jsonb_build_object('ok', false, 'result', 'already_paid', 'reference', b.reference);
  end if;
  if pay.capture_claimed_at is not null and pay.capture_claimed_at > now() - interval '45 seconds' then
    return jsonb_build_object('ok', false, 'result', 'in_progress');
  end if;
  if b.status = 'Pending payment' and b.payment_method = p_method then
    update public.payments set capture_claimed_at = now() where id = pay.id;
    return jsonb_build_object('ok', true, 'result', 'ok');
  end if;
  if b.status = 'Held' and b.hold_expires_at > now() then
    update public.bookings set hold_expires_at = greatest(hold_expires_at, now() + interval '5 minutes') where id = b.id;
    update public.payments set capture_claimed_at = now() where id = pay.id;
    return jsonb_build_object('ok', true, 'result', 'ok');
  end if;
  if b.status in ('Held', 'Expired') then
    perform public.release_expired_holds(b.id);
    if b.service_id is null or not exists (select 1 from public.glow_free_slots(b.service_id, (b.start_at at time zone 'America/Jamaica')::date, b.id) f
                                           where f.slot_start = b.start_at) then
      return jsonb_build_object('ok', false, 'result', 'slot_taken');
    end if;
    begin
      update public.bookings set status = 'Held', hold_expires_at = now() + interval '5 minutes',
             payment_status = case when payment_status = 'failed' then 'unpaid' else payment_status end
       where id = b.id;
    exception when exclusion_violation then
      return jsonb_build_object('ok', false, 'result', 'slot_taken');
    end;
    update public.payments set capture_claimed_at = now() where id = pay.id;
    return jsonb_build_object('ok', true, 'result', 'ok');
  end if;
  return jsonb_build_object('ok', false, 'result', lower(b.status));
end $$;

-- SERVER ONLY: a capture attempt is over (whatever happened): the next request may go ahead
create or replace function public.release_capture_claim(p_method text, p_provider_ref text) returns void
language sql volatile security definer set search_path = public as $$
  update public.payments set capture_claimed_at = null where method = p_method and provider_ref = p_provider_ref and capture_claimed_at is not null;
$$;

-- SERVER ONLY: called after the server has itself verified a successful payment with the gateway (or after
-- Launthia confirmed a Zelle payment). Safe to call twice with the same reference: the second time it only
-- answers "already". result: confirmed | already | amount_mismatch | duplicate_payment | conflict | not_found
drop function if exists public.confirm_booking_payment(uuid, text, text, numeric, text, text, text);
create or replace function public.confirm_booking_payment(p_booking uuid, p_method text, p_provider_ref text, p_amount numeric, p_currency text, p_provider_status text default null, p_verified_by text default 'gateway', p_txn_id text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  pay public.payments%rowtype;
  have_pay boolean;
  v_expected numeric; v_currency text; v_ref text; v_pay_id uuid;
  v_note text := null;
begin
  if p_provider_ref is null or char_length(btrim(p_provider_ref)) < 3 then raise exception 'a gateway reference is required'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  select * into pay from public.payments where method = p_method and provider_ref = p_provider_ref for update;
  have_pay := found;
  if have_pay and pay.booking_id <> b.id then raise exception 'this payment belongs to another booking'; end if;
  if have_pay and pay.status in ('succeeded', 'refunded', 'partly refunded') then
    return jsonb_build_object('result', 'already', 'reference', b.reference, 'booking_status', b.status);
  end if;

  -- the amount the gateway says was paid must be exactly what was asked for
  if have_pay then v_expected := pay.amount; v_currency := pay.currency;
  else select c.amount, c.currency into v_expected, v_currency from public.glow_charge_amount(b.amount_jmd, p_method) c; end if;
  if v_expected is null or p_currency is distinct from v_currency or abs(coalesce(p_amount, -1) - v_expected) > 0.009 then
    insert into public.payments (booking_id, method, status, amount, currency, amount_jmd, provider_ref, provider_status, failure_reason, verified_at, verified_by, gateway_txn_id)
    values (b.id, p_method, 'failed', coalesce(p_amount, 0), coalesce(p_currency, 'JMD'), b.amount_jmd, p_provider_ref, left(p_provider_status, 60),
            format('amount mismatch: expected %s %s, gateway reported %s %s', v_expected, v_currency, p_amount, p_currency), now(), p_verified_by, p_txn_id)
    on conflict (method, provider_ref) do update set status = 'failed', failure_reason = excluded.failure_reason, provider_status = excluded.provider_status,
       verified_at = now(), gateway_txn_id = coalesce(excluded.gateway_txn_id, public.payments.gateway_txn_id)
    returning id into v_pay_id;
    update public.bookings set status = case when status in ('Held', 'Pending payment', 'Expired') then 'Needs attention' else status end where id = b.id;
    perform public.glow_queue_email(b.id, v_pay_id, 'owner_attention', 'owner_attention:' || v_pay_id);
    return jsonb_build_object('result', 'amount_mismatch');
  end if;

  if b.payment_status = 'paid' then
    v_note := 'a second payment for a booking that was already paid: refund it';
  elsif b.status in ('Held', 'Pending payment', 'Expired') then
    perform public.release_expired_holds(b.id);
    v_ref := coalesce(b.reference, public.new_booking_reference());
    begin
      update public.bookings
         set status = 'Confirmed', payment_status = 'paid', payment_method = p_method, reference = v_ref,
             confirmed_at = now(), paid_at = now(), hold_expires_at = null
       where id = b.id;
    exception when exclusion_violation then
      v_note := 'paid after the hold ran out, and the time is now taken: refund or rebook';
      v_ref := null;
    end;
  else
    v_note := format('paid, but the booking was %s: check it', b.status);
  end if;

  insert into public.payments (booking_id, method, status, amount, currency, amount_jmd, provider_ref, provider_status, failure_reason, verified_at, verified_by, gateway_txn_id)
  values (b.id, p_method, 'succeeded', p_amount, p_currency, b.amount_jmd, p_provider_ref, left(p_provider_status, 60), v_note, now(), p_verified_by, p_txn_id)
  on conflict (method, provider_ref) do update set status = 'succeeded', amount = excluded.amount, currency = excluded.currency,
     provider_status = excluded.provider_status, failure_reason = excluded.failure_reason, verified_at = now(), verified_by = excluded.verified_by,
     gateway_txn_id = coalesce(excluded.gateway_txn_id, public.payments.gateway_txn_id)
  returning id into v_pay_id;

  if v_note is null then
    -- confirmed: the client's confirmation and receipt, and Launthia's alert (not when she confirmed it herself)
    perform public.glow_queue_email(b.id, v_pay_id, 'booking_confirmation', 'booking_confirmation:' || b.id);
    perform public.glow_queue_email(b.id, v_pay_id, 'payment_receipt', 'payment_receipt:' || v_pay_id);
    if p_verified_by = 'gateway' then
      perform public.glow_queue_email(b.id, v_pay_id, 'owner_new_booking', 'owner_new_booking:' || b.id);
    end if;
    return jsonb_build_object('result', 'confirmed', 'reference', v_ref);
  end if;
  -- paid but something needs Launthia (the time was taken, or the booking was already paid): she is told; the
  -- client is told on screen that Launthia will contact them
  perform public.glow_queue_email(b.id, v_pay_id, 'owner_attention', 'owner_attention:' || v_pay_id);
  if b.payment_status <> 'paid' then
    update public.bookings set status = 'Needs attention', payment_status = 'paid', payment_method = p_method, paid_at = now(), hold_expires_at = null where id = b.id;
    return jsonb_build_object('result', 'conflict', 'note', v_note);
  end if;
  return jsonb_build_object('result', 'duplicate_payment', 'reference', b.reference, 'note', v_note);
end $$;

-- SERVER ONLY: the gateway took the payment but reports it as still PENDING (for example under review). The time
-- stays booked as "Pending payment" until the gateway reports it completed or declined. Nothing is confirmed.
-- result: pending | conflict | already | recorded | not_found | unknown_payment
create or replace function public.mark_payment_pending(p_booking uuid, p_method text, p_provider_ref text, p_provider_status text default null, p_txn_id text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; pay public.payments%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  select * into pay from public.payments where method = p_method and provider_ref = p_provider_ref and booking_id = b.id for update;
  if not found then return jsonb_build_object('result', 'unknown_payment'); end if;
  if pay.status in ('succeeded', 'refunded', 'partly refunded') then return jsonb_build_object('result', 'already'); end if;
  update public.payments set status = 'awaiting review', provider_status = left(coalesce(p_provider_status, provider_status), 60),
         gateway_txn_id = coalesce(p_txn_id, gateway_txn_id), failure_reason = null
   where id = pay.id;
  if b.payment_status = 'paid' then return jsonb_build_object('result', 'recorded', 'booking_status', b.status); end if;
  if b.status in ('Held', 'Expired', 'Pending payment') then
    perform public.release_expired_holds(b.id);
    begin
      update public.bookings set status = 'Pending payment', payment_status = 'pending', payment_method = p_method, hold_expires_at = null where id = b.id;
    exception when exclusion_violation then
      update public.bookings set status = 'Needs attention', payment_status = 'pending', payment_method = p_method, hold_expires_at = null where id = b.id;
      perform public.glow_queue_email(b.id, pay.id, 'owner_attention', 'owner_attention:' || pay.id);
      return jsonb_build_object('result', 'conflict');
    end;
    return jsonb_build_object('result', 'pending');
  end if;
  return jsonb_build_object('result', 'recorded', 'booking_status', b.status);
end $$;

-- SERVER ONLY: a payment was declined, cancelled or timed out. By default declined / timed out frees the time and
-- a cancel (the client pressed back) keeps the hold until it runs out, so another way to pay can be tried;
-- p_release overrides that. A failure report never undoes a success, and never frees a booking that has other
-- money waiting or received.
drop function if exists public.fail_booking_payment(uuid, text, text, text, text);
create or replace function public.fail_booking_payment(p_booking uuid, p_method text, p_provider_ref text, p_status text, p_reason text default null, p_release boolean default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; v_amount numeric; v_currency text;
        v_release boolean := coalesce(p_release, p_status in ('failed', 'expired'));
begin
  if p_status not in ('failed', 'cancelled', 'expired') then raise exception 'status must be failed, cancelled or expired'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if p_provider_ref is not null then
    select c.amount, c.currency into v_amount, v_currency from public.glow_charge_amount(coalesce(b.amount_jmd, 0), p_method) c;
    insert into public.payments (booking_id, method, status, amount, currency, amount_jmd, provider_ref, failure_reason)
    values (b.id, p_method, p_status, coalesce(v_amount, 0), coalesce(v_currency, 'JMD'), coalesce(b.amount_jmd, 0), p_provider_ref, left(p_reason, 500))
    on conflict (method, provider_ref) do update set status = excluded.status, failure_reason = excluded.failure_reason
      where public.payments.status in ('started', 'awaiting review') and public.payments.booking_id = excluded.booking_id;
  end if;
  if v_release and b.payment_status <> 'paid' and b.status in ('Held', 'Pending payment')
     and not exists (select 1 from public.payments p where p.booking_id = b.id and p.provider_ref is distinct from p_provider_ref
                     and p.status in ('awaiting review', 'succeeded', 'refunded', 'partly refunded')) then
    update public.bookings set status = 'Expired', payment_status = 'failed',
           hold_expires_at = case when hold_expires_at is not null then least(hold_expires_at, now()) end
     where id = b.id;
    return jsonb_build_object('result', 'released');
  end if;
  return jsonb_build_object('result', 'recorded', 'booking_status', b.status);
end $$;

-- SERVER ONLY: remember a gateway notification. Answers 'new' the first time, 'retry' when it was seen but not
-- finished (handle it again: every step is safe to repeat), 'done' when it was already handled (skip it).
drop function if exists public.record_payment_event(text, text, text, uuid);
create or replace function public.record_payment_event(p_method text, p_event_id text, p_kind text, p_booking uuid default null)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_handled boolean;
begin
  insert into public.payment_events (method, event_id, kind, booking_id) values (p_method, left(p_event_id, 200), left(p_kind, 100), p_booking)
  on conflict (method, event_id) do nothing;
  if found then return 'new'; end if;
  select handled into v_handled from public.payment_events where method = p_method and event_id = left(p_event_id, 200);
  return case when v_handled then 'done' else 'retry' end;
end $$;

-- SERVER ONLY: a notification has been handled (with a short note of what happened)
create or replace function public.finish_payment_event(p_method text, p_event_id text, p_note text default null, p_booking uuid default null)
returns void
language sql volatile security definer set search_path = public as $$
  update public.payment_events set handled = true, handled_at = now(), note = left(p_note, 500), booking_id = coalesce(p_booking, booking_id)
  where method = p_method and event_id = left(p_event_id, 200);
$$;

-- internal: add one refund and update the payment's and the booking's totals
create or replace function public.glow_add_refund(p_payment uuid, p_source text, p_provider_refund_id text, p_amount numeric, p_amount_jmd integer, p_note text, p_by text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare pay public.payments%rowtype; v_total integer;
begin
  select * into pay from public.payments where id = p_payment for update;
  insert into public.payment_refunds (payment_id, source, provider_refund_id, amount, currency, amount_jmd, note, recorded_by)
  values (pay.id, p_source, p_provider_refund_id, p_amount, pay.currency, p_amount_jmd, left(p_note, 300), left(p_by, 120));
  select least(coalesce(sum(r.amount_jmd), 0), pay.amount_jmd)::int into v_total from public.payment_refunds r where r.payment_id = pay.id;
  update public.payments set refunded_jmd = v_total,
         status = case when v_total >= amount_jmd then 'refunded' when v_total > 0 then 'partly refunded' else status end,
         notes = left(coalesce(notes || ' · ', '') || format('Refund of %s %s (JMD %s) on %s', p_amount, pay.currency, p_amount_jmd,
                      to_char(now() at time zone 'America/Jamaica', 'DD Mon YYYY')) || coalesce(': ' || p_note, ''), 1000)
   where id = pay.id;
  -- the booking counts as paid while any of its payments is still fully kept
  update public.bookings b set payment_status = case
      when exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'succeeded') then 'paid'
      when exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'partly refunded') then 'partly refunded'
      else 'refunded' end
   where b.id = pay.booking_id and b.payment_status in ('paid', 'partly refunded', 'refunded');
  return jsonb_build_object('result', 'recorded', 'refunded_jmd', v_total);
end $$;

-- SERVER ONLY: the gateway reports a refund (or a reversal) of a payment, matched by its transaction id. Each
-- gateway refund is counted once. result: recorded | already | unknown_payment | currency_mismatch | not_paid
create or replace function public.record_gateway_refund(p_method text, p_txn_id text, p_refund_id text, p_amount numeric, p_currency text, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare pay public.payments%rowtype; v_prev numeric; v_jmd integer;
begin
  if p_refund_id is null or p_amount is null or p_amount <= 0 then raise exception 'refund id and a positive amount are required'; end if;
  select * into pay from public.payments where method = p_method and gateway_txn_id = p_txn_id for update;
  if not found then return jsonb_build_object('result', 'unknown_payment'); end if;
  if exists (select 1 from public.payment_refunds where provider_refund_id = p_refund_id) then return jsonb_build_object('result', 'already'); end if;
  if p_currency is distinct from pay.currency then return jsonb_build_object('result', 'currency_mismatch'); end if;
  if pay.status not in ('succeeded', 'partly refunded', 'refunded') then return jsonb_build_object('result', 'not_paid'); end if;
  select coalesce(sum(amount), 0) into v_prev from public.payment_refunds where payment_id = pay.id;
  if v_prev + p_amount >= pay.amount - 0.009 then
    v_jmd := greatest(pay.amount_jmd - pay.refunded_jmd, 0);                       -- everything that is left
  else
    v_jmd := least(round(p_amount / pay.amount * pay.amount_jmd)::int, greatest(pay.amount_jmd - pay.refunded_jmd, 0));
  end if;
  begin
    return public.glow_add_refund(pay.id, 'gateway', p_refund_id, p_amount, v_jmd, coalesce(p_note, 'reported by ' || p_method), 'gateway');
  exception when unique_violation then
    return jsonb_build_object('result', 'already');
  end;
end $$;

-- SERVER ONLY: the email sender takes queued emails (for one booking, some ids, or any) and gets everything it
-- needs to write them. Each one is marked "sending" so no other sender takes it; one stuck in "sending" for 10
-- minutes is taken again (Resend's Idempotency-Key stops a second copy). Owner emails stop at 30 an hour.
create or replace function public.claim_emails(p_booking uuid default null, p_ids bigint[] default null, p_limit integer default 10)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare e public.email_log%rowtype; out jsonb := '[]'::jsonb; v_owner_hour integer;
begin
  for e in
    select * from public.email_log l
    where (l.status = 'queued' or (l.status = 'sending' and l.updated_at < now() - interval '10 minutes'))
      and l.attempts < 3
      and (p_booking is null or l.booking_id = p_booking)
      and (p_ids is null or l.id = any(p_ids))
    order by l.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  loop
    if e.audience = 'owner' then
      select count(*) into v_owner_hour from public.email_log
       where audience = 'owner' and status in ('sent', 'sending') and updated_at > now() - interval '1 hour';
      if v_owner_hour >= 30 then
        update public.email_log set status = 'skipped', detail = 'hourly limit reached', updated_at = now() where id = e.id;
        continue;
      end if;
    end if;
    update public.email_log set status = 'sending', attempts = attempts + 1, updated_at = now() where id = e.id;
    out := out || jsonb_build_array(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'audience', e.audience, 'to_email', e.to_email, 'dedupe_key', coalesce(e.dedupe_key, 'email-' || e.id),
      'booking', (select jsonb_build_object('id', b.id, 'reference', b.reference, 'service', b.service, 'client_name', b.client_name,
                    'phone', b.phone, 'status', b.status, 'payment_status', b.payment_status, 'payment_method', b.payment_method,
                    'starts_at', b.start_at, 'ends_at', b.end_at, 'amount_jmd', coalesce(b.amount_jmd, b.price_jmd))
                  from public.bookings b where b.id = e.booking_id),
      'payment', (select jsonb_build_object('id', p.id, 'method', p.method, 'status', p.status, 'amount', p.amount, 'currency', p.currency,
                    'amount_jmd', p.amount_jmd, 'provider_ref', p.provider_ref, 'gateway_txn_id', p.gateway_txn_id, 'is_test', p.is_test,
                    'paid_at', coalesce(p.verified_at, p.created_at), 'notes', p.notes, 'failure_reason', p.failure_reason)
                  from public.payments p
                  where (e.payment_id is not null and p.id = e.payment_id)
                     or (e.payment_id is null and p.booking_id = e.booking_id and p.status in ('succeeded', 'awaiting review', 'partly refunded', 'refunded'))
                  order by (p.id = e.payment_id) desc nulls last, p.created_at desc limit 1)));
  end loop;
  return out;
end $$;

-- SERVER ONLY: the result of sending one email. A failure is tried again (up to 3 tries in all) unless it is
-- final (for example the address was refused).
create or replace function public.finish_email(p_id bigint, p_ok boolean, p_provider_id text default null, p_detail text default null, p_final boolean default false)
returns void
language sql volatile security definer set search_path = public as $$
  update public.email_log
     set status = case when p_ok then 'sent' when p_final or attempts >= 3 then 'failed' else 'queued' end,
         sent_at = case when p_ok then now() else sent_at end,
         provider_id = coalesce(left(p_provider_id, 120), provider_id),
         detail = left(p_detail, 500), updated_at = now()
   where id = p_id and status = 'sending';
$$;

-- SERVER ONLY: is this email on the admin list (used by the email function to check who is asking)
create or replace function public.is_admin_email(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where email = lower(coalesce(p_email, '')));
$$;

-- ADMIN: Launthia chooses to email the client: about a cancellation, a new time, or to send the confirmation or
-- receipt again. Nothing is ever sent to a client about these by itself.
create or replace function public.admin_queue_client_email(p_booking uuid, p_kind text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.bookings%rowtype; v_pay uuid; v_key text;
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception using message = 'Booking not found.'; end if;
  if b.email is null or b.email = '' then raise exception using message = 'This booking has no client email.'; end if;
  select id into v_pay from public.payments where booking_id = b.id and status in ('succeeded', 'partly refunded', 'refunded') order by created_at desc limit 1;
  if p_kind = 'booking_cancelled' then
    if b.status <> 'Cancelled' then raise exception using message = 'Cancel the booking first.'; end if;
    v_key := 'booking_cancelled:' || b.id;
  elsif p_kind = 'booking_rescheduled' then
    if b.start_at is null or b.status not in ('Confirmed', 'Paid', 'Pending payment', 'Requested') then raise exception using message = 'Only an upcoming booking can be moved.'; end if;
    v_key := 'booking_rescheduled:' || b.id || ':' || extract(epoch from b.start_at)::bigint;
  elsif p_kind in ('booking_confirmation', 'payment_receipt') then
    if b.status not in ('Confirmed', 'Paid', 'Done') or b.reference is null or v_pay is null then raise exception using message = 'Only a paid, confirmed booking has a confirmation and receipt.'; end if;
    v_key := p_kind || ':' || b.id || ':again:' || extract(epoch from clock_timestamp())::bigint;   -- a deliberate resend
  else
    raise exception using message = 'Unknown email.';
  end if;
  return jsonb_build_object('queued', public.glow_queue_email(b.id, v_pay, p_kind, v_key));
end $$;

-- SERVER ONLY: counts requests per visitor (a one-way code, never their address) in short windows. True = allowed.
create or replace function public.glow_rate_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare w timestamptz; n integer;
begin
  if p_bucket is null or p_max is null or p_max < 1 or p_window_seconds is null or p_window_seconds < 10 then raise exception 'bad limit'; end if;
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.request_limits as r (bucket, window_start, hits) values (left(p_bucket, 100), w, 1)
    on conflict (bucket, window_start) do update set hits = r.hits + 1
    returning r.hits into n;
  if random() < 0.02 then delete from public.request_limits where window_start < now() - interval '1 day'; end if;
  return n <= p_max;
end $$;

-- ADMIN: bank transfer, Zelle or Cash App – Launthia has checked her account. Money there → the booking is confirmed (once), and the
-- client gets the confirmation and receipt. Not there → the payment is marked failed and the time is released.
create or replace function public.admin_verify_manual_payment(p_booking uuid, p_received boolean, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare pay public.payments%rowtype; who text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  select * into pay from public.payments where booking_id = p_booking and method in ('bank', 'zelle', 'cashapp') and status = 'awaiting review'
   order by created_at desc limit 1;
  if not found then raise exception using message = 'There is no payment waiting to be checked on this booking.'; end if;
  if p_received then
    if p_note is not null then update public.payments set notes = left(coalesce(notes || ' · ', '') || p_note, 1000) where id = pay.id; end if;
    return public.confirm_booking_payment(p_booking, pay.method, pay.provider_ref, pay.amount, pay.currency, 'checked by owner', who);
  end if;
  update public.payments set status = 'failed', verified_at = now(), verified_by = who,
         failure_reason = left(coalesce(p_note, 'not received'), 500) where id = pay.id;
  update public.bookings set status = 'Expired', payment_status = 'failed' where id = p_booking and status = 'Pending payment';
  return jsonb_build_object('result', 'rejected');
end $$;

-- the Zelle name used since stage 1
create or replace function public.admin_verify_zelle(p_booking uuid, p_received boolean, p_note text default null)
returns jsonb
language sql volatile security definer set search_path = public as $$
  select public.admin_verify_manual_payment(p_booking, p_received, p_note);
$$;

-- ADMIN: move a booking to another time (any future time that does not overlap another booking)
create or replace function public.admin_reschedule_booking(p_booking uuid, p_new_start timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  b public.bookings%rowtype; cfg public.booking_settings%rowtype; dur integer;
  tz constant text := 'America/Jamaica'; v_local timestamp;
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  if p_new_start is null or p_new_start <= now() then raise exception using message = 'Please pick a future time.'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception using message = 'Booking not found.'; end if;
  if b.status not in ('Held', 'Pending payment', 'Confirmed', 'Paid', 'Requested', 'Needs attention') then
    raise exception using message = 'Only upcoming bookings can be moved.';
  end if;
  select * into cfg from public.booking_settings where id = 1;
  select s.duration_minutes into dur from public.services s where s.id = b.service_id;
  dur := coalesce(dur, extract(epoch from (b.end_at - b.start_at))::int / 60, 60);
  v_local := p_new_start at time zone tz;
  perform public.release_expired_holds(b.id);
  begin
    update public.bookings
       set start_at = p_new_start, end_at = p_new_start + make_interval(mins => dur),
           block_until = p_new_start + make_interval(mins => dur + cfg.buffer_minutes),
           appt_date = v_local::date, appt_time = to_char(v_local, 'HH24:MI'), rescheduled_at = now(),
           status = case when status = 'Needs attention' and payment_status = 'paid' then 'Confirmed' else status end,
           reference = case when status = 'Needs attention' and payment_status = 'paid' then coalesce(reference, public.new_booking_reference()) else reference end
     where id = b.id;
  exception when exclusion_violation then
    raise exception using message = 'That time overlaps another booking.';
  end;
  return jsonb_build_object('result', 'moved', 'from', b.start_at, 'to', p_new_start);
end $$;

-- ADMIN: cancel a booking (refunds are tracked separately with admin_record_refund)
create or replace function public.admin_cancel_booking(p_booking uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  update public.bookings set status = 'Cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 300), hold_expires_at = null
   where id = p_booking and status not in ('Cancelled', 'Done');
  if not found then raise exception using message = 'This booking can’t be cancelled.'; end if;
  update public.payments set status = 'cancelled', failure_reason = coalesce(failure_reason, 'booking cancelled')
   where booking_id = p_booking and status in ('started', 'awaiting review');
  return jsonb_build_object('result', 'cancelled');
end $$;

-- ADMIN: record a refund made outside the gateway's notifications (a bank transfer, Zelle back, cash). PayPal
-- refunds are recorded automatically when PayPal reports them, so they are not entered here again.
create or replace function public.admin_record_refund(p_payment uuid, p_amount_jmd integer, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare pay public.payments%rowtype; v_amount numeric; who text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not public.is_admin() then raise exception using message = 'Only the owner can do this.'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.status not in ('succeeded', 'partly refunded') then raise exception using message = 'Only a successful payment can be refunded.'; end if;
  if p_amount_jmd is null or p_amount_jmd <= 0 or pay.refunded_jmd + p_amount_jmd > pay.amount_jmd then
    raise exception using message = 'The refund can’t be more than what was paid.';
  end if;
  v_amount := case when pay.refunded_jmd + p_amount_jmd = pay.amount_jmd
                   then greatest(pay.amount - coalesce((select sum(amount) from public.payment_refunds where payment_id = pay.id), 0), 0.01)
                   else greatest(round(p_amount_jmd::numeric * pay.amount / nullif(pay.amount_jmd, 0), 2), 0.01) end;
  return public.glow_add_refund(pay.id, 'manual', null, v_amount, p_amount_jmd, p_note, who);
end $$;

-- 9. Who may run which function ----------------------------------------------------------------------------
-- (Postgres and Supabase let everyone run new functions by default, so each one is set explicitly.)

-- server only: called by the Edge Functions with the service role key (never from the website)
revoke all on function public.glow_free_slots(uuid, date, uuid), public.glow_charge_amount(integer, text), public.new_booking_reference(),
  public.release_expired_holds(uuid), public.prepare_payment(uuid, text),
  public.record_payment_started(uuid, text, text, numeric, text, boolean), public.find_payment(text, text, text, uuid),
  public.lock_for_capture(uuid, text, text), public.release_capture_claim(text, text), public.confirm_booking_payment(uuid, text, text, numeric, text, text, text, text),
  public.mark_payment_pending(uuid, text, text, text, text), public.fail_booking_payment(uuid, text, text, text, text, boolean),
  public.record_payment_event(text, text, text, uuid), public.finish_payment_event(text, text, text, uuid),
  public.glow_add_refund(uuid, text, text, numeric, integer, text, text), public.record_gateway_refund(text, text, text, numeric, text, text),
  public.glow_rate_hit(text, integer, integer),
  public.create_booking_hold(uuid, timestamptz, text, text, text, boolean), public.cancel_booking_hold(uuid),
  public.submit_zelle_payment(uuid, text, text), public.submit_manual_payment(uuid, text, text, text, text),
  public.book_pay_in_person(uuid),
  public.glow_queue_email(uuid, uuid, text, text), public.claim_emails(uuid, bigint[], integer),
  public.finish_email(bigint, boolean, text, text, boolean), public.is_admin_email(text)
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.release_expired_holds(uuid), public.prepare_payment(uuid, text), public.glow_charge_amount(integer, text),
      public.record_payment_started(uuid, text, text, numeric, text, boolean), public.find_payment(text, text, text, uuid),
      public.lock_for_capture(uuid, text, text), public.release_capture_claim(text, text), public.confirm_booking_payment(uuid, text, text, numeric, text, text, text, text),
      public.mark_payment_pending(uuid, text, text, text, text), public.fail_booking_payment(uuid, text, text, text, text, boolean),
      public.record_payment_event(text, text, text, uuid), public.finish_payment_event(text, text, text, uuid),
      public.record_gateway_refund(text, text, text, numeric, text, text), public.glow_rate_hit(text, integer, integer),
      public.create_booking_hold(uuid, timestamptz, text, text, text, boolean), public.cancel_booking_hold(uuid),
      public.submit_zelle_payment(uuid, text, text), public.submit_manual_payment(uuid, text, text, text, text),
      public.book_pay_in_person(uuid),
      public.get_available_slots(uuid, date), public.get_available_days(uuid, date, date), public.get_booking_options(),
      public.get_booking_status(uuid),
      public.claim_emails(uuid, bigint[], integer), public.finish_email(bigint, boolean, text, text, boolean), public.is_admin_email(text)
      to service_role;
  end if;
end $$;

-- read-only answers anyone may ask for (no personal data in them). Holding a time, paying and Zelle go through
-- the "checkout" Edge Function, which limits how often each visitor can try.
revoke all on function public.get_available_slots(uuid, date), public.get_available_days(uuid, date, date), public.get_booking_options(),
  public.get_booking_status(uuid) from public;
grant execute on function public.get_available_slots(uuid, date), public.get_available_days(uuid, date, date), public.get_booking_options(),
  public.get_booking_status(uuid) to anon, authenticated;

-- is_admin() is used by the read rules on public tables (services, payment methods), so everyone may run
-- it; it only ever answers true for a signed-in email on the admin list
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- the dashboard (each one checks is_admin() itself)
revoke all on function public.admin_verify_zelle(uuid, boolean, text), public.admin_verify_manual_payment(uuid, boolean, text), public.admin_reschedule_booking(uuid, timestamptz),
  public.admin_cancel_booking(uuid, text), public.admin_record_refund(uuid, integer, text), public.admin_queue_client_email(uuid, text),
  public.admin_mark_cash_paid(uuid), public.admin_set_usd_rate(numeric) from public, anon;
grant execute on function public.admin_verify_zelle(uuid, boolean, text), public.admin_verify_manual_payment(uuid, boolean, text), public.admin_reschedule_booking(uuid, timestamptz),
  public.admin_cancel_booking(uuid, text), public.admin_record_refund(uuid, integer, text), public.admin_queue_client_email(uuid, text),
  public.admin_mark_cash_paid(uuid), public.admin_set_usd_rate(numeric) to authenticated;

-- 10. Row Level Security ---------------------------------------------------------------------------------

alter table public.admin_users         enable row level security;
alter table public.services            enable row level security;
alter table public.availability_hours  enable row level security;
alter table public.availability_breaks enable row level security;
alter table public.blocked_periods     enable row level security;
alter table public.booking_settings    enable row level security;
alter table public.payment_methods     enable row level security;
alter table public.customers           enable row level security;
alter table public.payments            enable row level security;
alter table public.payment_events      enable row level security;
alter table public.email_log           enable row level security;
alter table public.payment_refunds     enable row level security;
alter table public.request_limits      enable row level security;

revoke all on public.admin_users, public.services, public.availability_hours, public.availability_breaks, public.blocked_periods,
  public.booking_settings, public.payment_methods, public.customers, public.payments, public.payment_events, public.email_log,
  public.payment_refunds, public.request_limits
  from anon, authenticated;
grant select on public.services, public.availability_hours to anon, authenticated;
-- payment details are private: the website (anon) may read only which ways to pay are switched on; only admins
-- read the instructions and bank accounts
grant select (method, enabled, label, charge_currency, jmd_per_usd, sort_order, updated_at) on public.payment_methods to anon;
grant select on public.payment_methods to authenticated;
grant select on public.admin_users, public.availability_breaks, public.blocked_periods, public.booking_settings,
  public.customers, public.payments, public.payment_events, public.email_log, public.payment_refunds to authenticated;
grant insert, update, delete on public.services, public.availability_hours, public.availability_breaks, public.blocked_periods to authenticated;
grant update on public.booking_settings, public.payment_methods, public.customers to authenticated;
grant update (notes) on public.payments to authenticated;

do $$
declare t text;
begin
  -- drop this script's own policies so they can be created again cleanly
  for t in select format('drop policy if exists %I on public.%I', policyname, tablename) from pg_policies
           where schemaname = 'public' and policyname like 'glow: %' loop
    execute t;
  end loop;
end $$;

create policy "glow: admins read admins" on public.admin_users for select to authenticated using (public.is_admin());

create policy "glow: admins read bookings" on public.bookings for select to authenticated using (public.is_admin());
create policy "glow: admins change bookings" on public.bookings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "glow: anyone reads active services" on public.services for select to anon, authenticated using (active or public.is_admin());
create policy "glow: admins add services" on public.services for insert to authenticated with check (public.is_admin());
create policy "glow: admins change services" on public.services for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "glow: admins remove services" on public.services for delete to authenticated using (public.is_admin());

create policy "glow: anyone reads opening hours" on public.availability_hours for select to anon, authenticated using (true);
create policy "glow: admins add hours" on public.availability_hours for insert to authenticated with check (public.is_admin());
create policy "glow: admins change hours" on public.availability_hours for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "glow: admins remove hours" on public.availability_hours for delete to authenticated using (public.is_admin());

create policy "glow: admins read breaks" on public.availability_breaks for select to authenticated using (public.is_admin());
create policy "glow: admins add breaks" on public.availability_breaks for insert to authenticated with check (public.is_admin());
create policy "glow: admins change breaks" on public.availability_breaks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "glow: admins remove breaks" on public.availability_breaks for delete to authenticated using (public.is_admin());

create policy "glow: admins read blocked times" on public.blocked_periods for select to authenticated using (public.is_admin());
create policy "glow: admins add blocked times" on public.blocked_periods for insert to authenticated with check (public.is_admin());
create policy "glow: admins change blocked times" on public.blocked_periods for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "glow: admins remove blocked times" on public.blocked_periods for delete to authenticated using (public.is_admin());

create policy "glow: admins read booking settings" on public.booking_settings for select to authenticated using (public.is_admin());
create policy "glow: admins change booking settings" on public.booking_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "glow: anyone reads switched-on payment methods" on public.payment_methods for select to anon using (enabled);
create policy "glow: admins read payment methods" on public.payment_methods for select to authenticated using (public.is_admin());
create policy "glow: admins change payment methods" on public.payment_methods for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "glow: admins read customers" on public.customers for select to authenticated using (public.is_admin());
create policy "glow: admins change customers" on public.customers for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "glow: admins read payments" on public.payments for select to authenticated using (public.is_admin());
create policy "glow: admins note payments" on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "glow: admins read payment events" on public.payment_events for select to authenticated using (public.is_admin());
create policy "glow: admins read email log" on public.email_log for select to authenticated using (public.is_admin());
create policy "glow: admins read refunds" on public.payment_refunds for select to authenticated using (public.is_admin());
-- request_limits: no rules at all = nobody but the server can read or write it

-- 11. Service photos (Supabase Storage: anyone can view, only admins upload) and the hold clean-up job.
--     Both are skipped quietly where Storage / pg_cron are not switched on.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('service-images', 'service-images', true) on conflict (id) do nothing;
    begin
      update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'service-images';
    exception when undefined_column then null;
    end;
    execute 'drop policy if exists "glow: admins upload service photos" on storage.objects';
    execute 'drop policy if exists "glow: admins change service photos" on storage.objects';
    execute 'drop policy if exists "glow: admins remove service photos" on storage.objects';
    execute $p$create policy "glow: admins upload service photos" on storage.objects for insert to authenticated with check (bucket_id = 'service-images' and public.is_admin())$p$;
    execute $p$create policy "glow: admins change service photos" on storage.objects for update to authenticated using (bucket_id = 'service-images' and public.is_admin())$p$;
    execute $p$create policy "glow: admins remove service photos" on storage.objects for delete to authenticated using (bucket_id = 'service-images' and public.is_admin())$p$;
  end if;
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'glow-release-holds';
    perform cron.schedule('glow-release-holds', '*/5 * * * *', 'select public.release_expired_holds()');
  end if;
end $$;

-- Tell Supabase's API to pick up the new and changed functions straight away.
notify pgrst, 'reload schema';

-- 12. Check: every line must say "true" in the rowsecurity column.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('admin_users', 'services', 'availability_hours', 'availability_breaks', 'blocked_periods',
  'booking_settings', 'payment_methods', 'customers', 'bookings', 'payments', 'payment_events', 'email_log', 'payment_refunds', 'request_limits')
order by tablename;
