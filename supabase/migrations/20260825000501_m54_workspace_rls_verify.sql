-- ===========================================================================
-- M54 — Salon workspace load: RLS + provisioning verification (defense in depth)
-- ===========================================================================
-- Root cause being defended: a new owner's first login fails with
--
--     We couldn't load your salon workspace
--     Could not set up your salon. Please try again.
--
-- Because workspace load depends on three backend contracts that must ALL hold
-- together:
--
--   1. The authenticated owner can SELECT their salon row (so hydration can
--      fetch the existing tenant) — `public.salons` needs a SELECT policy that
--      is visible to authenticated/anonymous PostgREST roles.
--   2. The authenticated owner can read their location — `public.business_locations`
--      needs a SELECT policy, and submitting/creating a location needs an
--      INSERT policy for authenticated.
--   3. The owner can read their `public.profiles` row (identity + role), and a
--      sanctioned onboarding INSERT path exists for a brand-new owner: the
--      SECURITY DEFINER RPC `provision_owner_salon` (executable by the
--      `authenticated` role). Client INSERT into salons / organization_members
--      is intentionally forbidden.
--
-- The RLS check below is deliberately SHAPE-TOLERANT: the codebase has both a
-- canonical tenant model (salons + organization_members + can_manage_salon_settings,
-- M28/M37) and a legacy member model (business_id + has_business_role /
-- is_business_member) that different deployments reconcile to. Instead of
-- asserting one specific policy expression, each check asserts the essential
-- contract (a SELECT policy visible to a client role, an INSERT path, the RPC
-- grant) so it passes on whichever shape the live database resolved to.
--
-- This migration is ADDITIVE and IDEMPOTENT. It never weakens or replaces any
-- existing policy (M28/M37/M43). It only:
--
--   * Re-asserts RLS is enabled on the tables involved in workspace load.
--   * Re-asserts client roles are not granted write on tenant roots.
--   * Installs `verify_m54_workspace_rls()` — a self-test returning one row
--     per check so the test suite can assert every property at once.

begin;

-- 1. RLS must be enabled on every table the owner workspace touches.
do $m54_assert_rls$
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
      ('business_locations')
    ) as t(tablename)
    where to_regclass('public.' || t.tablename) is not null
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('alter table public.%I force row level security', r.tablename);
  end loop;
end
$m54_assert_rls$;

-- 2. Tenant roots stay client-write-locked (the provisioning RPC is the only
--    sanctioned creator). Re-asserted here for defense in depth.
revoke insert, delete on public.organizations from anon, authenticated;
revoke insert, delete on public.salons        from anon, authenticated;
revoke insert, update, delete on public.organization_members from anon, authenticated;

-- 3. Verification function. Returns one row per check so the test suite can
--    assert every workspace-load property at once.
create or replace function public.verify_m54_workspace_rls()
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

  check_name := 'rls enabled on business_locations';
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'business_locations' and c.relrowsecurity;
  ok := v_count = 1; detail := case when ok then 'enabled' else 'DISABLED' end; return next;

  check_name := 'rls enabled on profiles';
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity;
  ok := v_count = 1; detail := case when ok then 'enabled' else 'DISABLED' end; return next;

  -- salons: a SELECT policy visible to a client role (authenticated, anon, or
  -- public — a `public` policy applies to every role), so the owner workspace
  -- can resolve/fetch the tenant row.
  check_name := 'salons has a client SELECT policy (authenticated, anon or public)';
  select count(*) into v_count
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'salons'
    and p.cmd = 'SELECT'
    and (
      p.roles @> array['authenticated']::name[]
      or p.roles @> array['anon']::name[]
      or p.roles @> array['public']::name[]
    );
  ok := v_count >= 1;
  detail := case when ok then 'SELECT policy present' else 'MISSING client SELECT' end;
  return next;

  -- business_locations: a client SELECT policy (owner/member read), plus an
  -- authenticated INSERT policy so an owner can submit/save a location.
  check_name := 'business_locations has a client SELECT policy';
  select count(*) into v_count
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'business_locations'
    and p.cmd = 'SELECT'
    and (
      p.roles @> array['authenticated']::name[]
      or p.roles @> array['anon']::name[]
      or p.roles @> array['public']::name[]
    );
  ok := v_count >= 1; detail := case when ok then 'SELECT policy present' else 'MISSING client SELECT' end;
  return next;

  check_name := 'business_locations has an authenticated INSERT policy';
  select count(*) into v_count
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'business_locations'
    and p.cmd = 'INSERT' and p.roles @> array['authenticated']::name[];
  ok := v_count >= 1; detail := case when ok then 'INSERT policy present' else 'MISSING authenticated INSERT' end;
  return next;

  -- profiles: a SELECT policy for authenticated (self-read identity/role).
  check_name := 'profiles has an authenticated SELECT policy';
  select count(*) into v_count
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'profiles'
    and p.cmd = 'SELECT' and p.roles @> array['authenticated']::name[];
  ok := v_count >= 1; detail := case when ok then 'self SELECT present' else 'MISSING self SELECT' end;
  return next;

  -- Provisioning RPC is the sanctioned onboarding INSERT path for new owners:
  -- executable by authenticated, never by anon/public. This is the row-creation
  -- path the client relies on, so it is the authoritative "INSERT for new users"
  -- contract.
  check_name := 'provision_owner_salon is executable by authenticated only';
  select count(*) into v_count
  from information_schema.routine_privileges rp
  where rp.routine_schema = 'public'
    and rp.routine_name = 'provision_owner_salon'
    and rp.grantee = 'authenticated' and rp.privilege_type = 'EXECUTE';
  if v_count = 0 then
    ok := false; detail := 'authenticated EXECUTE missing'; return next;
  else
    select count(*) into v_count
    from information_schema.routine_privileges rp
    where rp.routine_schema = 'public'
      and rp.routine_name = 'provision_owner_salon'
      and rp.grantee in ('anon', 'PUBLIC') and rp.privilege_type = 'EXECUTE';
    ok := v_count = 0; detail := case when ok then 'authenticated only' else 'anon/public can execute' end;
    return next;
  end if;
end;
$$;

revoke all on function public.verify_m54_workspace_rls()
  from public, anon, authenticated;
grant execute on function public.verify_m54_workspace_rls() to service_role;

commit;
