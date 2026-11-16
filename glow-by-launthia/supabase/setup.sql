-- Glow by Launthia: database for bookings, the Glow Club, the owner dashboard and email alerts.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run again: it never deletes data.

-- 1. Tables ------------------------------------------------------------------

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_name text not null check (char_length(client_name) between 1 and 80),
  phone text not null check (char_length(phone) between 7 and 25),
  email text check (char_length(email) <= 120),
  service text not null check (char_length(service) <= 60),
  appt_date date not null,
  appt_time text not null check (char_length(appt_time) <= 10),
  price_jmd integer check (price_jmd >= 0),
  client_note text check (char_length(client_note) <= 500),
  terms_agreed_at timestamptz not null,
  status text not null default 'Requested' check (status in ('Requested','Confirmed','Paid','Done','Cancelled')),
  paid_at timestamptz,
  owner_note text check (char_length(owner_note) <= 2000),
  confirmation_sent_at timestamptz          -- set once the client's confirmation email has gone (one per booking)
);
alter table public.bookings add column if not exists confirmation_sent_at timestamptz;

create table if not exists public.glow_club (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  phone text check (char_length(phone) <= 25),
  email text check (char_length(email) <= 120),
  birth_month smallint check (birth_month between 1 and 12),   -- the birthday is optional on the form
  birth_day smallint check (birth_day between 1 and 31),
  contact_pref text not null check (contact_pref in ('Email','SMS','WhatsApp')),
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  unsubscribed_at timestamptz               -- when someone replied STOP (a minimal note, so they aren't messaged again)
);
alter table public.glow_club add column if not exists unsubscribed_at timestamptz;
alter table public.glow_club alter column birth_month drop not null;
alter table public.glow_club alter column birth_day drop not null;

-- Owner settings: exactly one row.
create table if not exists public.owner_settings (
  id smallint primary key default 1 check (id = 1),
  email_alerts boolean not null default true,
  alert_email text not null default 'Launthiawatson@yahoo.com'
    check (char_length(alert_email) <= 120 and alert_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);
insert into public.owner_settings (id) values (1) on conflict (id) do nothing;

-- Alert log: one row per email attempt (booking alerts, test emails and client confirmations).
-- Written only by the Edge Functions (server side); Launthia can read it.
create table if not exists public.alert_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in ('booking','test','confirmation')),
  status text not null check (status in ('sent','failed','skipped')),
  detail text check (char_length(detail) <= 500)
);
alter table public.alert_log drop constraint if exists alert_log_kind_check;
alter table public.alert_log add constraint alert_log_kind_check check (kind in ('booking','test','confirmation'));
create unique index if not exists alert_log_one_per_booking
  on public.alert_log (booking_id) where kind = 'booking' and status = 'sent';

-- Prices and days off, set by Launthia in her dashboard (Settings) and shown on the website.
-- Anyone can read them (the website needs them; there is nothing personal in them); only Launthia can change them.
create table if not exists public.site_prices (
  service text primary key,
  price_text text not null,                -- shown after "JMD $", e.g. '9,500' or '10,500 – $12,000'
  updated_at timestamptz not null default now(),
  constraint site_prices_service_ok check (service in ('Soft Glam', 'Full Glam')),
  constraint site_prices_text_ok check (char_length(price_text) between 1 and 40 and price_text ~ '^[0-9][0-9 ,.$–-]*$')
);
insert into public.site_prices (service, price_text) values ('Soft Glam', '9,500'), ('Full Glam', '10,500 – $12,000')
  on conflict (service) do nothing;
create table if not exists public.blocked_days (
  day date primary key,                    -- a whole day she is not working: clients can't book it
  created_at timestamptz not null default now()
);

-- 2. Spam protection: formats and limits (the website checks these too) --------

alter table public.bookings
  drop constraint if exists bookings_service_ok,
  drop constraint if exists bookings_phone_ok,
  drop constraint if exists bookings_email_ok,
  drop constraint if exists bookings_time_ok,
  add constraint bookings_service_ok check (service in ('Soft Glam', 'Full Glam', 'Bridal Glam')),
  add constraint bookings_phone_ok   check (phone ~ '^[0-9+() .-]+$' and char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15),
  add constraint bookings_email_ok   check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint bookings_time_ok    check (appt_time ~ '^[0-2][0-9]:[0-5][0-9]$');

alter table public.glow_club
  drop constraint if exists glow_club_phone_ok,
  drop constraint if exists glow_club_email_ok,
  drop constraint if exists glow_club_contact_ok,
  drop constraint if exists glow_club_birthday_ok,
  drop constraint if exists glow_club_consent_ok,
  add constraint glow_club_phone_ok    check (phone is null or (phone ~ '^[0-9+() .-]+$' and char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15)),
  add constraint glow_club_email_ok    check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint glow_club_contact_ok  check ((contact_pref = 'Email' and email is not null) or (contact_pref in ('SMS', 'WhatsApp') and phone is not null)),
  add constraint glow_club_birthday_ok check ((birth_month is null) = (birth_day is null)),
  add constraint glow_club_consent_ok  check (not marketing_consent or consent_at is not null);

-- Before each new row from the website: one booking or sign-up per phone number (or email) every
-- 2 minutes, and the fields only the server may set are cleared.
create or replace function public.glow_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if tg_table_name = 'bookings' then
    new.confirmation_sent_at := null;
    if new.terms_agreed_at not between now() - interval '2 days' and now() + interval '2 days' then
      raise exception 'Please tick the box to agree to the Terms again.';
    end if;
    if exists (select 1 from public.bookings b
               where regexp_replace(b.phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
                 and b.created_at > now() - interval '2 minutes') then
      raise exception 'Please wait 2 minutes before sending again.';
    end if;
  else
    new.unsubscribed_at := null;
    if exists (select 1 from public.glow_club g
               where g.created_at > now() - interval '2 minutes'
                 and ((new.email is not null and lower(g.email) = lower(new.email))
                   or (new.phone is not null and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')))) then
      raise exception 'Please wait 2 minutes before sending again.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.glow_before_insert() from public, anon, authenticated;
drop trigger if exists bookings_before_insert on public.bookings;
create trigger bookings_before_insert before insert on public.bookings for each row execute function public.glow_before_insert();
drop trigger if exists glow_club_before_insert on public.glow_club;
create trigger glow_club_before_insert before insert on public.glow_club for each row execute function public.glow_before_insert();

-- 3. Row Level Security: the lock ----------------------------------------------

alter table public.bookings       enable row level security;
alter table public.glow_club      enable row level security;
alter table public.owner_settings enable row level security;
alter table public.alert_log      enable row level security;
alter table public.site_prices    enable row level security;
alter table public.blocked_days   enable row level security;

revoke all on public.bookings, public.glow_club, public.owner_settings, public.alert_log, public.site_prices, public.blocked_days from anon, authenticated;
grant insert on public.bookings, public.glow_club to anon;
grant select, update, delete on public.bookings, public.glow_club to authenticated;
grant select, update on public.owner_settings to authenticated;
grant select on public.alert_log to authenticated;
grant select on public.site_prices, public.blocked_days to anon, authenticated;
grant update on public.site_prices to authenticated;
grant insert, delete on public.blocked_days to authenticated;

-- (names used by an earlier version of this script, removed if present)
drop policy if exists "Public can add bookings" on public.bookings;
drop policy if exists "Only Launthia can read bookings" on public.bookings;
drop policy if exists "Only Launthia can change bookings" on public.bookings;
drop policy if exists "Only Launthia can delete bookings" on public.bookings;
drop policy if exists "Public can join the Glow Club" on public.glow_club;
drop policy if exists "Only Launthia can read the Glow Club" on public.glow_club;
drop policy if exists "Only Launthia can change the Glow Club" on public.glow_club;
drop policy if exists "Only Launthia can delete from the Glow Club" on public.glow_club;

-- Public visitors (anon) can ONLY add a new row, and only as a fresh request.
drop policy if exists "public can add booking" on public.bookings;
create policy "public can add booking" on public.bookings
  for insert to anon
  with check (status = 'Requested' and paid_at is null and owner_note is null);
drop policy if exists "public can join glow club" on public.glow_club;
create policy "public can join glow club" on public.glow_club
  for insert to anon
  with check (true);

-- Only Launthia can read, change or delete.
drop policy if exists "owner reads bookings" on public.bookings;
create policy "owner reads bookings" on public.bookings
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner updates bookings" on public.bookings;
create policy "owner updates bookings" on public.bookings
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com')
  with check (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner deletes bookings" on public.bookings;
create policy "owner deletes bookings" on public.bookings
  for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner reads glow club" on public.glow_club;
create policy "owner reads glow club" on public.glow_club
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner updates glow club" on public.glow_club;
create policy "owner updates glow club" on public.glow_club
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com')
  with check (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner deletes glow club" on public.glow_club;
create policy "owner deletes glow club" on public.glow_club
  for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');

-- Owner settings: only Launthia can read or change the single row (no insert or delete from the site).
drop policy if exists "owner reads settings" on public.owner_settings;
create policy "owner reads settings" on public.owner_settings
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner updates settings" on public.owner_settings;
create policy "owner updates settings" on public.owner_settings
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com')
  with check (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');

-- Alert log: Launthia can read it; only the Edge Functions (server side) write to it.
drop policy if exists "owner reads alert log" on public.alert_log;
create policy "owner reads alert log" on public.alert_log
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');

-- Prices and days off: everyone can read them (the website shows them); only Launthia can change them.
drop policy if exists "anyone reads prices" on public.site_prices;
create policy "anyone reads prices" on public.site_prices
  for select to anon, authenticated
  using (true);
drop policy if exists "owner updates prices" on public.site_prices;
create policy "owner updates prices" on public.site_prices
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com')
  with check (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "anyone reads days off" on public.blocked_days;
create policy "anyone reads days off" on public.blocked_days
  for select to anon, authenticated
  using (true);
drop policy if exists "owner adds days off" on public.blocked_days;
create policy "owner adds days off" on public.blocked_days
  for insert to authenticated
  with check (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');
drop policy if exists "owner removes days off" on public.blocked_days;
create policy "owner removes days off" on public.blocked_days
  for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'launthiawatson@yahoo.com');

-- 4. Check: all six lines must say "true" in the rowsecurity column.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('bookings', 'glow_club', 'owner_settings', 'alert_log', 'site_prices', 'blocked_days')
order by tablename;
