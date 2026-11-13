-- Glow by Launthia: bookings and Glow Club tables for the owner dashboard.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run again: it never deletes data.

-- 1. Tables ---------------------------------------------------------------

create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  phone       text not null,
  email       text,
  service     text not null,
  day         date not null,
  time        time not null,
  price_jmd   text,
  status      text not null default 'Requested',
  notes       text
);

create table if not exists public.glow_club (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  contact_method  text not null,
  contact         text not null,
  birthday_day    smallint,
  birthday_month  smallint,
  offers_consent  boolean not null default false
);

-- 2. Lengths and formats (the website checks these too, before saving) ------

alter table public.bookings
  drop constraint if exists bookings_name_ok,
  drop constraint if exists bookings_phone_ok,
  drop constraint if exists bookings_email_ok,
  drop constraint if exists bookings_service_ok,
  drop constraint if exists bookings_price_ok,
  drop constraint if exists bookings_status_ok,
  drop constraint if exists bookings_notes_ok,
  add constraint bookings_name_ok    check (char_length(btrim(name)) between 1 and 80),
  add constraint bookings_phone_ok   check (phone ~ '^[0-9+() .-]{7,20}$' and char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15),
  add constraint bookings_email_ok   check (email is null or (char_length(email) <= 120 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  add constraint bookings_service_ok check (service in ('Soft Glam', 'Full Glam', 'Bridal Glam')),
  add constraint bookings_price_ok   check (price_jmd is null or char_length(price_jmd) <= 40),
  add constraint bookings_status_ok  check (status in ('Requested', 'Paid', 'Confirmed', 'Done', 'Cancelled', 'Refunded')),
  add constraint bookings_notes_ok   check (notes is null or char_length(notes) <= 500);

alter table public.glow_club
  drop constraint if exists glow_club_name_ok,
  drop constraint if exists glow_club_method_ok,
  drop constraint if exists glow_club_contact_ok,
  drop constraint if exists glow_club_birthday_ok,
  add constraint glow_club_name_ok     check (char_length(btrim(name)) between 1 and 80),
  add constraint glow_club_method_ok   check (contact_method in ('Email', 'SMS', 'WhatsApp')),
  add constraint glow_club_contact_ok  check (case when contact_method = 'Email'
                                              then char_length(contact) <= 120 and contact ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
                                              else contact ~ '^[0-9+() .-]{7,20}$' and char_length(regexp_replace(contact, '\D', '', 'g')) between 7 and 15 end),
  add constraint glow_club_birthday_ok check ((birthday_day is null or birthday_day between 1 and 31) and (birthday_month is null or birthday_month between 1 and 12));

-- 3. Slow down repeats: one booking or Glow Club join per phone number (or email) every 2 minutes

create or replace function public.glow_one_per_two_minutes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'bookings' then
    if exists (select 1 from public.bookings b
               where regexp_replace(b.phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
                 and b.created_at > now() - interval '2 minutes') then
      raise exception 'Please wait 2 minutes before sending again.';
    end if;
  else
    if exists (select 1 from public.glow_club g
               where (case when g.contact_method = 'Email' then lower(g.contact) else regexp_replace(g.contact, '\D', '', 'g') end)
                   = (case when new.contact_method = 'Email' then lower(new.contact) else regexp_replace(new.contact, '\D', '', 'g') end)
                 and g.created_at > now() - interval '2 minutes') then
      raise exception 'Please wait 2 minutes before sending again.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.glow_one_per_two_minutes() from public, anon, authenticated;

drop trigger if exists bookings_one_per_two_minutes on public.bookings;
create trigger bookings_one_per_two_minutes before insert on public.bookings
  for each row execute function public.glow_one_per_two_minutes();

drop trigger if exists glow_club_one_per_two_minutes on public.glow_club;
create trigger glow_club_one_per_two_minutes before insert on public.glow_club
  for each row execute function public.glow_one_per_two_minutes();

-- 4. Row Level Security ON for both tables ----------------------------------

alter table public.bookings  enable row level security;
alter table public.glow_club enable row level security;

-- The public (anon) key may only add rows. It can never read, change or delete them.
revoke all on public.bookings, public.glow_club from anon, authenticated;
grant insert on public.bookings, public.glow_club to anon;
grant select, update, delete on public.bookings, public.glow_club to authenticated;

-- 5. Policies ---------------------------------------------------------------
-- Supabase stores emails in lower case, so both sides are compared in lower case.

drop policy if exists "Public can add bookings" on public.bookings;
create policy "Public can add bookings" on public.bookings
  for insert to anon
  with check (status = 'Requested' and notes is null);

drop policy if exists "Only Launthia can read bookings" on public.bookings;
create policy "Only Launthia can read bookings" on public.bookings
  for select to authenticated
  using (lower(auth.email()) = lower('Launthiawatson@yahoo.com'));

drop policy if exists "Only Launthia can change bookings" on public.bookings;
create policy "Only Launthia can change bookings" on public.bookings
  for update to authenticated
  using (lower(auth.email()) = lower('Launthiawatson@yahoo.com'))
  with check (lower(auth.email()) = lower('Launthiawatson@yahoo.com'));

drop policy if exists "Only Launthia can delete bookings" on public.bookings;
create policy "Only Launthia can delete bookings" on public.bookings
  for delete to authenticated
  using (lower(auth.email()) = lower('Launthiawatson@yahoo.com'));

drop policy if exists "Public can join the Glow Club" on public.glow_club;
create policy "Public can join the Glow Club" on public.glow_club
  for insert to anon
  with check (true);

drop policy if exists "Only Launthia can read the Glow Club" on public.glow_club;
create policy "Only Launthia can read the Glow Club" on public.glow_club
  for select to authenticated
  using (lower(auth.email()) = lower('Launthiawatson@yahoo.com'));

drop policy if exists "Only Launthia can change the Glow Club" on public.glow_club;
create policy "Only Launthia can change the Glow Club" on public.glow_club
  for update to authenticated
  using (lower(auth.email()) = lower('Launthiawatson@yahoo.com'))
  with check (lower(auth.email()) = lower('Launthiawatson@yahoo.com'));

drop policy if exists "Only Launthia can delete from the Glow Club" on public.glow_club;
create policy "Only Launthia can delete from the Glow Club" on public.glow_club
  for delete to authenticated
  using (lower(auth.email()) = lower('Launthiawatson@yahoo.com'));

-- 6. Check: both lines below must say "true" in the rowsecurity column.
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('bookings', 'glow_club');
