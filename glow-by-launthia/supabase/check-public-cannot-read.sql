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
  t text;
begin
  -- the public key: reading, changing and deleting must all be refused, on every table
  foreach t in array array['bookings', 'glow_club', 'owner_settings', 'alert_log'] loop
    begin set local role anon; execute format('select 1 from public.%I limit 1', t);
      out := out || ('FAIL: the public key CAN read ' || t);
    exception when insufficient_privilege then out := out || ('OK: the public key cannot read ' || t); end;
    reset role;
    begin set local role anon; execute format('delete from public.%I', t);
      out := out || ('FAIL: the public key CAN delete from ' || t);
    exception when insufficient_privilege then out := out || ('OK: the public key cannot delete from ' || t); end;
    reset role;
  end loop;

  begin set local role anon; update public.bookings set status = 'Paid';
    out := out || 'FAIL: the public key CAN change bookings'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot change bookings'::text; end;
  reset role;

  begin set local role anon; update public.glow_club set marketing_consent = true;
    out := out || 'FAIL: the public key CAN change the Glow Club'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot change the Glow Club'::text; end;
  reset role;

  begin set local role anon; update public.owner_settings set email_alerts = false;
    out := out || 'FAIL: the public key CAN change the owner settings'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot change the owner settings'::text; end;
  reset role;

  -- a signed-in account that is not Launthia's: sees no rows anywhere
  perform set_config('request.jwt.claims', '{"email":"someone.else@example.com","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.email', 'someone.else@example.com', true);
  set local role authenticated;
  foreach t in array array['bookings', 'glow_club', 'owner_settings', 'alert_log'] loop
    execute format('select count(*) from public.%I', t) into c;
    out := out || (case when c = 0 then 'OK: another account sees 0 rows in ' || t else 'FAIL: another account sees ' || c || ' rows in ' || t end);
  end loop;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.email', '', true);

  -- Row Level Security must be ON for all four tables
  select count(*) into c from pg_tables where schemaname = 'public' and tablename in ('bookings', 'glow_club', 'owner_settings', 'alert_log') and rowsecurity;
  out := out || (case when c = 4 then 'OK: Row Level Security is on for all four tables' else 'FAIL: Row Level Security is off on a table' end);

  insert into glow_check select ordinality, r from unnest(out) with ordinality as r;
end $$;

select result from glow_check order by n;
