-- ============================================================================
-- M64 — Deprecate the M58 parallel workspace-membership surface
-- ============================================================================
--
-- WHY
-- ---
-- M58 introduced a SECOND, competing tenancy model — `workspaces` /
-- `memberships` / `invitations` plus `activate_workspace_membership()` — beside
-- the canonical one this application actually uses:
--
--   auth.users -> profiles -> organization_members -> organizations -> salons
--
-- M63 removed the authorization bypass in `activate_workspace_membership`
-- (any authenticated caller could previously insert themselves into an
-- arbitrary workspace with no invitation). That fixed the logic, but left a
-- membership-creation RPC callable by every authenticated user against a
-- schema that nothing in the product reads or writes.
--
-- Verified before writing this migration: after the dead client was removed,
-- `workspaces`, `memberships` and `invitations` have ZERO references in
-- src/, server/, api/, api-routes.ts or server.ts, and the only caller of
-- `activate_workspace_membership` was `src/lib/workspace.ts` (deleted).
--
-- WHAT THIS DOES
-- --------------
--   1. Revokes EXECUTE on `activate_workspace_membership` from
--      public/anon/authenticated. Retained for service_role so a server-side
--      or backfill caller can still use it; no browser path can.
--   2. Makes the three M58 tables server-only (no client DML).
--
-- This is defence in depth on top of M63's logic fix: even if the function
-- body were later reverted or replaced, no browser JWT could reach it.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- Nothing is dropped. The function and tables remain, so the change is
-- reversible and no data is lost. Owner provisioning is unaffected: it has
-- always gone through `public.provision_owner_salon` (M54), reached from
-- `resolveOrProvisionOwnerSalon` in src/lib/ownerProvisioning.ts, which
-- App.tsx and ownerSession.ts already call. `provision_owner_salon` sets
-- platform_role/is_active server-side inside its SECURITY DEFINER body
-- (M54 line 581), so no client-side profiles write is needed or possible
-- (M36 §8 grants authenticated UPDATE on presentational columns only).
--
-- Idempotent and safe on a project where M58 was never applied.

begin;

-- ---------------------------------------------------------------------------
-- 1. Retire the RPC for browser callers.
-- ---------------------------------------------------------------------------
do $deprecate_activation_rpc$
begin
  if to_regprocedure('public.activate_workspace_membership(uuid,uuid,text)') is null then
    raise notice 'M64: activate_workspace_membership not present; nothing to revoke';
    return;
  end if;

  revoke all on function public.activate_workspace_membership(uuid, uuid, text)
    from public, anon, authenticated;
  grant execute on function public.activate_workspace_membership(uuid, uuid, text)
    to service_role;
end
$deprecate_activation_rpc$;

-- ---------------------------------------------------------------------------
-- 2. Make the M58 tables server-only.
-- ---------------------------------------------------------------------------
-- The policies M58 created are left in place; removing the table-level grants
-- is what actually stops client DML, and it is the narrower, reversible
-- change. `memberships` and `invitations` already had SELECT-only policies, so
-- this closes the remaining `workspaces` write path.
do $lock_m58_tables$
declare
  v_table text;
begin
  foreach v_table in array array['workspaces', 'memberships', 'invitations'] loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      v_table
    );
  end loop;
end
$lock_m58_tables$;

-- ---------------------------------------------------------------------------
-- 3. Deployment verification.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m64_m58_deprecation()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query select
    'activate_workspace_membership is not executable by authenticated'::text,
    not has_function_privilege(
      'authenticated',
      'public.activate_workspace_membership(uuid,uuid,text)',
      'EXECUTE'
    ),
    'browser callers must not reach the deprecated M58 RPC'::text;

  return query select
    'activate_workspace_membership remains available to service_role'::text,
    has_function_privilege(
      'service_role',
      'public.activate_workspace_membership(uuid,uuid,text)',
      'EXECUTE'
    ),
    'server-side callers must keep working'::text;

  return query select
    'workspaces is not client-writable'::text,
    not has_table_privilege('authenticated', 'public.workspaces', 'INSERT'),
    'M58 parallel schema must be server-only'::text;

  return query select
    'canonical provision_owner_salon is still executable by authenticated'::text,
    -- to_regprocedure guard: has_function_privilege() raises rather than
    -- returning NULL when the function is absent, and this verifier must stay
    -- callable on a project where M54 has not been applied.
    case
      when to_regprocedure('public.provision_owner_salon(text,text,text)') is null then true
      else has_function_privilege(
        'authenticated',
        'public.provision_owner_salon(text,text,text)',
        'EXECUTE'
      )
    end,
    'the single sanctioned provisioning path must stay open'::text;
end;
$$;

revoke all on function public.verify_m64_m58_deprecation() from public, anon;
grant execute on function public.verify_m64_m58_deprecation() to authenticated, service_role;

commit;
