-- Proof that the public (anon) key cannot read, change or delete any data,
-- and that a signed-in account other than Launthia's sees nothing.
-- Paste into Supabase > SQL Editor > New query, then press Run.
-- It changes nothing: every test is undone. Every line of the result should start with "OK".

create temp table if not exists glow_check (n int, result text);
truncate glow_check;

do $$
declare
  out text[] := '{}';
  c int;
begin
  -- the public key: reading, changing and deleting must all be refused
  begin set local role anon; perform 1 from public.bookings limit 1;
    out := out || 'FAIL: the public key CAN read bookings'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot read bookings'::text; end;
  reset role;

  begin set local role anon; perform 1 from public.glow_club limit 1;
    out := out || 'FAIL: the public key CAN read the Glow Club'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot read the Glow Club'::text; end;
  reset role;

  begin set local role anon; update public.bookings set status = 'Paid';
    out := out || 'FAIL: the public key CAN change bookings'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot change bookings'::text; end;
  reset role;

  begin set local role anon; delete from public.bookings;
    out := out || 'FAIL: the public key CAN delete bookings'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot delete bookings'::text; end;
  reset role;

  begin set local role anon; update public.glow_club set offers_consent = true;
    out := out || 'FAIL: the public key CAN change the Glow Club'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot change the Glow Club'::text; end;
  reset role;

  begin set local role anon; delete from public.glow_club;
    out := out || 'FAIL: the public key CAN delete from the Glow Club'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot delete from the Glow Club'::text; end;
  reset role;

  -- a signed-in account that is not Launthia's: sees no rows
  perform set_config('request.jwt.claims', '{"email":"someone.else@example.com","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.email', 'someone.else@example.com', true);
  set local role authenticated;
  select count(*) into c from public.bookings;
  out := out || (case when c = 0 then 'OK: another account sees 0 bookings' else 'FAIL: another account sees ' || c || ' bookings' end);
  select count(*) into c from public.glow_club;
  out := out || (case when c = 0 then 'OK: another account sees 0 Glow Club members' else 'FAIL: another account sees ' || c || ' Glow Club members' end);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.email', '', true);

  -- Row Level Security must be ON for both tables
  select count(*) into c from pg_tables where schemaname = 'public' and tablename in ('bookings', 'glow_club') and rowsecurity;
  out := out || (case when c = 2 then 'OK: Row Level Security is on for bookings and glow_club' else 'FAIL: Row Level Security is off on a table' end);

  insert into glow_check select ordinality, r from unnest(out) with ordinality as r;
end $$;

select result from glow_check order by n;
