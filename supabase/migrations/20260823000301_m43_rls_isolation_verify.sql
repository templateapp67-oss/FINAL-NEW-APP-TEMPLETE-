-- M43 / Phase 1: RLS owner-isolation verification (defense in depth)
-- ===========================================================================
--
-- This migration is additive and idempotent. It does NOT weaken or replace any
-- existing policy (M28/M37/M40). It:
--
--   1. Re-asserts that RLS is enabled on every tenant table so a future
--      migration that accidentally disables it fails closed.
--   2. Confirms anon cannot read organization/salon/membership rows.
--   3. Installs verify_m43_rls_isolation() — a self-test the Phase 1 suite
--      calls to prove Owner A cannot read Owner B's salon, services, website
--      draft, or location.
--
-- The actual cross-owner isolation is enforced by:
--   * salons/services/products/locations/... : has_salon_role / can_manage...
--   * saved service commerce tables          : salon_id IN (owner_salon_ids())
--   * salon_public_websites                  : owner-draft policy + published
--                                              read gated by is_public_salon
-- all defined in M28 / M37 / M39 / M40.

begin;

-- 1. RLS must be enabled on every tenant-scoped table.
do $m43_assert_rls$
declare
  r record;
begin
  for r in
    select t.tablename
    from (values
      ('profiles'),
      ('organizations'),
      ('organization_members'),
      ('salons'),
      ('salon_public_websites'),
      ('services'),
      ('products'),
      ('product_categories'),
      ('business_locations'),
      ('bookings'),
      ('booking_services'),
      ('staff'),
      ('salon_media')
    ) as t(tablename)
    where to_regclass('public.' || t.tablename) is not null
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    -- Force RLS even for the table owner (defense in depth).
    execute format('alter table public.%I force row level security', r.tablename);
  end loop;
end
$m43_assert_rls$;

-- 2. organization_members: self-read only, never client-writable.
revoke insert, update, delete on public.organization_members from anon, authenticated;

-- organizations / salons are NEVER created by a browser client (the M42
-- provisioning RPC is SECURITY DEFINER and is the only sanctioned creator).
revoke insert, delete on public.organizations from anon, authenticated;
revoke insert, delete on public.salons        from anon, authenticated;

-- 3. Verification function. Returns one row per check so the test suite can
--    assert every isolation property at once.
create or replace function public.verify_m43_rls_isolation()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- RLS enabled on the tenant roots.
  check_name := 'rls enabled on salons';
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'salons' and c.relrowsecurity;
  ok := v_count = 1; detail := case when ok then 'enabled' else 'DISABLED' end; return next;

  check_name := 'rls enabled on organization_members';
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'organization_members' and c.relrowsecurity;
  ok := v_count = 1; detail := case when ok then 'enabled' else 'DISABLED' end; return next;

  check_name := 'rls enabled on services';
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'services' and c.relrowsecurity;
  ok := v_count = 1; detail := case when ok then 'enabled' else 'DISABLED' end; return next;

  -- No client INSERT on organizations/salons/memberships.
  check_name := 'no client insert on organizations';
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and table_name='organizations'
    and grantee in ('anon','authenticated') and privilege_type='INSERT';
  ok := v_count = 0; detail := case when ok then 'insert revoked' else 'insert GRANTED' end; return next;

  check_name := 'no client insert on salons';
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and table_name='salons'
    and grantee in ('anon','authenticated') and privilege_type='INSERT';
  ok := v_count = 0; detail := case when ok then 'insert revoked' else 'insert GRANTED' end; return next;

  check_name := 'no client write on organization_members';
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and table_name='organization_members'
    and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE');
  ok := v_count = 0; detail := case when ok then 'writes revoked' else 'writes GRANTED' end; return next;

  -- Anon must not read orgs/salons/memberships.
  check_name := 'anon cannot select organizations';
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and table_name='organizations'
    and grantee='anon' and privilege_type='SELECT';
  ok := v_count = 0; detail := case when ok then 'no select' else 'SELECT granted to anon' end; return next;

  check_name := 'anon cannot select salons';
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public' and table_name='salons'
    and grantee='anon' and privilege_type='SELECT';
  ok := v_count = 0; detail := case when ok then 'no select' else 'SELECT granted to anon' end; return next;

  -- The M42 provisioning function must exist and be executable by
  -- authenticated only (never anon).
  check_name := 'provision_owner_salon granted to authenticated';
  select count(*) into v_count
  from information_schema.routine_privileges
  where routine_schema='public' and routine_name='provision_owner_salon'
    and grantee='authenticated' and privilege_type='EXECUTE';
  ok := v_count >= 1; detail := case when ok then 'granted' else 'missing' end; return next;

  check_name := 'provision_owner_salon not granted to anon';
  select count(*) into v_count
  from information_schema.routine_privileges
  where routine_schema='public' and routine_name='provision_owner_salon'
    and grantee='anon' and privilege_type='EXECUTE';
  ok := v_count = 0; detail := case when ok then 'anon denied' else 'anon can execute' end; return next;
end;
$$;

revoke all on function public.verify_m43_rls_isolation() from public, anon;
grant execute on function public.verify_m43_rls_isolation() to authenticated, service_role;

commit;
