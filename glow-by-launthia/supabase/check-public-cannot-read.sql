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

  -- prices and days off: the website may read them, but the public key can never change them
  begin set local role anon; update public.site_prices set price_text = '1';
    out := out || 'FAIL: the public key CAN change the prices'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot change the prices'::text; end;
  reset role;
  begin set local role anon; insert into public.blocked_days (day) values (current_date + 400);
    out := out || 'FAIL: the public key CAN block off days'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot block off days'::text; end;
  reset role;
  begin set local role anon; delete from public.blocked_days;
    out := out || 'FAIL: the public key CAN remove days off'::text;
  exception when insufficient_privilege then out := out || 'OK: the public key cannot remove days off'::text; end;
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
  -- ...and cannot change the prices or the days off either
  set local role authenticated;
  update public.site_prices set price_text = '1';
  get diagnostics c = row_count;
  out := out || (case when c = 0 then 'OK: another account cannot change the prices' else 'FAIL: another account changed the prices' end);
  begin insert into public.blocked_days (day) values (current_date + 400);
    out := out || 'FAIL: another account CAN block off days'::text;
  exception when insufficient_privilege then out := out || 'OK: another account cannot block off days'::text; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.email', '', true);

  -- Row Level Security must be ON for all six tables
  select count(*) into c from pg_tables where schemaname = 'public' and tablename in ('bookings', 'glow_club', 'owner_settings', 'alert_log', 'site_prices', 'blocked_days') and rowsecurity;
  out := out || (case when c = 6 then 'OK: Row Level Security is on for all six tables' else 'FAIL: Row Level Security is off on a table' end);

  -- the booking & payment platform (only checked once platform.sql has been run)
  if to_regclass('public.payments') is not null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    foreach t in array array['customers', 'payments', 'payment_events', 'email_log', 'admin_users', 'booking_settings', 'blocked_periods', 'availability_breaks', 'payment_refunds', 'request_limits'] loop
      begin set local role anon; execute format('select 1 from public.%I limit 1', t);
        out := out || ('FAIL: the public key CAN read ' || t);
      exception when insufficient_privilege then out := out || ('OK: the public key cannot read ' || t); end;
      reset role;
    end loop;
    foreach t in array array['services:name', 'payment_methods:label', 'availability_hours:start_time'] loop
      begin set local role anon; execute format('update public.%I set %I = %I', split_part(t, ':', 1), split_part(t, ':', 2), split_part(t, ':', 2));
        out := out || ('FAIL: the public key CAN change ' || split_part(t, ':', 1));
      exception when insufficient_privilege then out := out || ('OK: the public key cannot change ' || split_part(t, ':', 1)); end;
      reset role;
    end loop;
    set local role anon;
    execute 'select count(*) from public.services where not active' into c;
    out := out || (case when c = 0 then 'OK: the public sees only active services' else 'FAIL: the public sees switched-off services' end);
    execute 'select count(*) from public.payment_methods where not enabled' into c;
    out := out || (case when c = 0 then 'OK: the public sees only switched-on payment methods' else 'FAIL: the public sees switched-off payment methods' end);
    reset role;
    begin set local role anon; execute 'select public.confirm_booking_payment(gen_random_uuid(), ''card'', ''CHECK-1'', 1, ''JMD'')';
      out := out || 'FAIL: the public key CAN confirm a payment'::text;
    exception when insufficient_privilege then out := out || 'OK: the public key cannot confirm a payment'::text; end;
    reset role;
    begin set local role anon; execute 'select public.prepare_payment(gen_random_uuid(), ''card'')';
      out := out || 'FAIL: the public key CAN start a payment'::text;
    exception when insufficient_privilege then out := out || 'OK: the public key cannot start a payment'::text; end;
    reset role;
    begin set local role anon; execute 'select public.create_booking_hold(gen_random_uuid(), now(), ''X Y'', ''x@example.com'', ''8765550100'', true)';
      out := out || 'FAIL: the public key CAN hold a time without the checkout server'::text;
    exception when insufficient_privilege then out := out || 'OK: the public key can only hold a time through the checkout server'::text; end;
    reset role;
    begin set local role anon; execute 'select public.lock_for_capture(gen_random_uuid(), ''paypal'', ''CHECK-1'')';
      out := out || 'FAIL: the public key CAN reach the payment capture check'::text;
    exception when insufficient_privilege then out := out || 'OK: the public key cannot reach the payment capture check'::text; end;
    reset role;

    perform set_config('request.jwt.claims', '{"email":"someone.else@example.com","role":"authenticated"}', true);
    set local role authenticated;
    foreach t in array array['customers', 'payments', 'payment_events', 'email_log', 'admin_users', 'booking_settings', 'blocked_periods', 'availability_breaks', 'payment_refunds'] loop
      execute format('select count(*) from public.%I', t) into c;
      out := out || (case when c = 0 then 'OK: another account sees 0 rows in ' || t else 'FAIL: another account sees ' || c || ' rows in ' || t end);
    end loop;
    execute 'update public.payment_methods set enabled = enabled';
    get diagnostics c = row_count;
    out := out || (case when c = 0 then 'OK: another account cannot change payment methods' else 'FAIL: another account changed payment methods' end);
    begin execute 'select public.admin_cancel_booking(gen_random_uuid())';
      out := out || 'FAIL: another account CAN cancel bookings'::text;
    exception when others then out := out || (case when sqlerrm like 'Only the owner%' then 'OK: another account cannot cancel bookings' else 'FAIL: unexpected: ' || sqlerrm end); end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select count(*) into c from pg_tables where schemaname = 'public' and rowsecurity and tablename in ('admin_users', 'services', 'availability_hours',
      'availability_breaks', 'blocked_periods', 'booking_settings', 'payment_methods', 'customers', 'payments', 'payment_events', 'email_log',
      'payment_refunds', 'request_limits');
    out := out || (case when c = 13 then 'OK: Row Level Security is on for all thirteen platform tables' else 'FAIL: Row Level Security is off on a platform table' end);
  end if;

  insert into glow_check select ordinality, r from unnest(out) with ordinality as r;
end $$;

select result from glow_check order by n;
