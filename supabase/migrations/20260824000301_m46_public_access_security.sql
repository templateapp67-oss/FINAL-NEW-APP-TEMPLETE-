-- ===========================================================================
-- M46 — anonymous public projection hardening
-- ===========================================================================
-- Anonymous visitors resolve a published business by slug and receive only
-- explicit website/catalog fields. They never select owner, customer, booking,
-- payment, webhook, membership or draft rows directly.

begin;

-- Field-limited service projection for one published slug. The salon id is
-- resolved inside the database; callers never supply or guess a tenant id.
create or replace function public.get_public_salon_services(p_slug text)
returns table (
  id uuid,
  theme_key text,
  category_id uuid,
  name text,
  description text,
  price_paise bigint,
  duration_minutes integer,
  is_featured boolean,
  display_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    svc.id,
    t.theme_id,
    svc.category_id,
    svc.name,
    svc.description,
    svc.price_paise,
    svc.duration_minutes,
    svc.is_featured,
    svc.display_order
  from public.salon_public_websites w
  join public.salons s on s.id = w.salon_id
  join public.services svc on svc.salon_id = s.id
  join public.themes t on t.id = svc.theme_id and t.is_active = true
  where lower(w.slug) = lower(btrim(p_slug))
    and p_slug ~ '^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$'
    and w.is_published = true
    and s.is_active = true
    and s.deleted_at is null
    and svc.is_active = true
    and svc.deleted_at is null
  order by svc.display_order, svc.id
$$;

revoke all on function public.get_public_salon_services(text) from public;
grant execute on function public.get_public_salon_services(text)
  to anon, authenticated, service_role;

-- The public site now uses field-limited RPCs. Remove anonymous table access
-- that could expose future columns merely because a table evolved. Existing
-- authenticated owner/customer grants and RLS remain unchanged.
do $revoke_anon_sensitive_tables$
declare
  v_table text;
begin
  foreach v_table in array array[
    'organizations', 'organization_members', 'profiles', 'salons',
    'salon_public_websites', 'staff', 'services', 'customers', 'bookings',
    'booking_services', 'booking_status_history', 'booking_slot_holds',
    'booking_request_keys', 'website_bookings', 'payment_orders', 'payments',
    'payment_webhook_events', 'payment_attempts', 'payment_refunds',
    'balance_collections', 'notifications', 'activity_log'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is not null then
      execute format('revoke all privileges on table public.%I from anon', v_table);
    end if;
  end loop;
end
$revoke_anon_sensitive_tables$;

-- Verification is service-role only because it inspects the complete grants
-- catalog. It returns no application data.
create or replace function public.verify_m46_public_access_security()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_sensitive text[] := array[
    'organizations', 'organization_members', 'profiles', 'salons',
    'salon_public_websites', 'staff', 'services', 'customers', 'bookings',
    'booking_services', 'booking_status_history', 'booking_slot_holds',
    'booking_request_keys', 'website_bookings', 'payment_orders', 'payments',
    'payment_webhook_events', 'payment_attempts', 'payment_refunds',
    'balance_collections', 'notifications', 'activity_log'
  ];
begin
  check_name := 'anon has no direct sensitive table privileges';
  select count(*) into v_count
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee = 'anon'
    and g.table_name = any(v_sensitive);
  ok := v_count = 0;
  detail := case when ok then 'field-limited RPCs only' else v_count || ' direct grant(s) remain' end;
  return next;

  check_name := 'public website projection executable by anon';
  ok := has_function_privilege('anon',
    'public.get_public_salon_website(text)', 'EXECUTE');
  detail := case when ok then 'granted' else 'missing' end;
  return next;

  check_name := 'public service projection executable by anon';
  ok := has_function_privilege('anon',
    'public.get_public_salon_services(text)', 'EXECUTE');
  detail := case when ok then 'granted' else 'missing' end;
  return next;

  check_name := 'owner publishing is not executable by anon';
  ok := not has_function_privilege('anon',
    'public.publish_owner_salon_website(text,text,jsonb,uuid)', 'EXECUTE');
  detail := case when ok then 'anon denied' else 'anon can publish' end;
  return next;
end;
$$;

revoke all on function public.verify_m46_public_access_security()
  from public, anon, authenticated;
grant execute on function public.verify_m46_public_access_security() to service_role;

commit;
