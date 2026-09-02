-- ============================================================================
-- M75 — canonical owner provisioning through the existing trusted membership gate
-- ============================================================================
--
-- Live introspection (2026-08-29) confirmed that
-- private.protect_organization_membership_fields() intentionally rejects a
-- new active membership unless either:
--   * private.is_trusted_server_or_admin() is true, or
--   * app.membership_rpc_trusted is transaction-locally set to "true".
--
-- M54's authenticated SECURITY DEFINER provisioner correctly derives
-- auth.uid(), serializes retries and calls a private membership helper, but the
-- helper did not enter that already-existing trusted RPC context. The live
-- trigger therefore raised P0001 before the salon could be created.
--
-- This migration keeps the trigger, RLS and invitation rules intact. It opens
-- the trusted context only around the private owner-membership upsert, restores
-- the previous value even on error, and removes browser access to the unsafe
-- legacy overload that accepted a caller-supplied user id.

begin;

do $m75_preflight$
declare
  v_guard_definition text;
begin
  if to_regclass('public.organization_members') is null
     or to_regprocedure('private.nexora_upsert_owner_membership(uuid,uuid)') is null
     or to_regprocedure('public.provision_owner_salon(text,text,text)') is null then
    raise exception
      'M75 preflight: canonical owner provisioning is missing. Apply M54 first.';
  end if;

  select pg_get_functiondef(p.oid)
    into v_guard_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'protect_organization_membership_fields'
    and pg_get_function_identity_arguments(p.oid) = '';

  -- If the live-only guard exists, fail closed unless it exposes the exact
  -- trusted RPC contract this migration was reviewed against.
  if v_guard_definition is not null
     and position('app.membership_rpc_trusted' in v_guard_definition) = 0 then
    raise exception
      'M75 preflight: the membership guard does not expose the reviewed trusted RPC contract.';
  end if;
end
$m75_preflight$;

create or replace function private.nexora_upsert_owner_membership(
  p_organization_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_status boolean;
  v_has_is_active boolean;
  v_is_active_generated boolean;
  v_previous_trusted text := current_setting('app.membership_rpc_trusted', true);
begin
  if p_organization_id is null or p_user_id is null then
    raise exception 'Owner membership requires an organization and authenticated user'
      using errcode = '22023';
  end if;

  -- The helper is private and not executable by browser roles. The outer
  -- canonical RPC passes auth.uid() as p_user_id. This setting is the exact
  -- trusted path recognized by the existing live membership trigger and is
  -- deliberately scoped to this transaction.
  perform set_config('app.membership_rpc_trusted', 'true', true);

  begin
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organization_members'
        and column_name = 'status'
    ) into v_has_status;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organization_members'
        and column_name = 'is_active'
    ) into v_has_is_active;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organization_members'
        and column_name = 'is_active'
        and is_generated = 'ALWAYS'
    ) into v_is_active_generated;

    if v_has_status and v_has_is_active and v_is_active_generated then
      execute $sql$
        insert into public.organization_members
          (organization_id, user_id, role, status)
        values ($1, $2, 'owner', 'active')
        on conflict (organization_id, user_id)
        do update set role = 'owner', status = 'active'
      $sql$ using p_organization_id, p_user_id;
    elsif v_has_status and v_has_is_active and not v_is_active_generated then
      execute $sql$
        insert into public.organization_members
          (organization_id, user_id, role, status, is_active)
        values ($1, $2, 'owner', 'active', true)
        on conflict (organization_id, user_id)
        do update set role = 'owner', status = 'active', is_active = true
      $sql$ using p_organization_id, p_user_id;
    elsif v_has_status then
      execute $sql$
        insert into public.organization_members
          (organization_id, user_id, role, status)
        values ($1, $2, 'owner', 'active')
        on conflict (organization_id, user_id)
        do update set role = 'owner', status = 'active'
      $sql$ using p_organization_id, p_user_id;
    elsif v_has_is_active and not v_is_active_generated then
      execute $sql$
        insert into public.organization_members
          (organization_id, user_id, role, is_active)
        values ($1, $2, 'owner', true)
        on conflict (organization_id, user_id)
        do update set role = 'owner', is_active = true
      $sql$ using p_organization_id, p_user_id;
    else
      raise exception
        'organization membership activity columns are not writable in this schema'
        using errcode = '428C9';
    end if;
  exception when others then
    perform set_config(
      'app.membership_rpc_trusted',
      coalesce(v_previous_trusted, ''),
      true
    );
    raise;
  end;

  -- Minimize the trusted window even though the GUC is transaction-local.
  perform set_config(
    'app.membership_rpc_trusted',
    coalesce(v_previous_trusted, ''),
    true
  );
end;
$$;

revoke all on function private.nexora_upsert_owner_membership(uuid, uuid)
  from public, anon, authenticated;

-- The legacy overload trusts p_user_id and predates the canonical auth.uid()
-- architecture. Keep it only for explicitly trusted server compatibility;
-- browser roles must never be able to invoke it.
do $m75_lock_legacy_overload$
begin
  if to_regprocedure('public.provision_owner_salon(uuid,text)') is not null then
    revoke all on function public.provision_owner_salon(uuid, text)
      from public, anon, authenticated;
    grant execute on function public.provision_owner_salon(uuid, text)
      to service_role;
  end if;
end
$m75_lock_legacy_overload$;

-- Re-assert the canonical boundary explicitly.
revoke all on function public.provision_owner_salon(text, text, text)
  from public, anon;
grant execute on function public.provision_owner_salon(text, text, text)
  to authenticated;

create or replace function public.verify_m75_owner_provisioning_membership_gate()
returns table (check_name text, ok boolean, detail text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_helper text;
  v_legacy regprocedure := to_regprocedure('public.provision_owner_salon(uuid,text)');
begin
  select pg_get_functiondef('private.nexora_upsert_owner_membership(uuid,uuid)'::regprocedure)
    into v_helper;

  check_name := 'private membership helper uses the reviewed trusted RPC gate';
  ok := position('app.membership_rpc_trusted' in v_helper) > 0
        and position('set_config' in v_helper) > 0;
  detail := 'transaction-local trusted context is present';
  return next;

  check_name := 'private membership helper is not browser executable';
  ok := not has_function_privilege(
          'authenticated',
          'private.nexora_upsert_owner_membership(uuid,uuid)'::regprocedure,
          'EXECUTE'
        )
        and not has_function_privilege(
          'anon',
          'private.nexora_upsert_owner_membership(uuid,uuid)'::regprocedure,
          'EXECUTE'
        );
  detail := 'authenticated/anon have no helper execution privilege';
  return next;

  check_name := 'canonical provisioner is authenticated-only';
  ok := has_function_privilege(
          'authenticated',
          'public.provision_owner_salon(text,text,text)'::regprocedure,
          'EXECUTE'
        )
        and not has_function_privilege(
          'anon',
          'public.provision_owner_salon(text,text,text)'::regprocedure,
          'EXECUTE'
        );
  detail := 'canonical function derives auth.uid()';
  return next;

  check_name := 'legacy caller-supplied user-id overload is not browser executable';
  ok := v_legacy is null
        or (
          not has_function_privilege('authenticated', v_legacy, 'EXECUTE')
          and not has_function_privilege('anon', v_legacy, 'EXECUTE')
        );
  detail := case when v_legacy is null then 'legacy overload absent'
                 else 'legacy overload restricted to trusted server role' end;
  return next;

  check_name := 'membership uniqueness prevents retry duplicates';
  ok := exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.organization_members'::regclass
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) like '%(organization_id, user_id)%'
  );
  detail := 'unique organization_id/user_id index is present';
  return next;

  check_name := 'live invitation membership guard remains enabled';
  ok := not exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private'
            and p.proname = 'protect_organization_membership_fields'
        )
        or exists (
          select 1
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
          join pg_namespace n on n.oid = p.pronamespace
          where t.tgrelid = 'public.organization_members'::regclass
            and not t.tgisinternal
            and t.tgenabled <> 'D'
            and n.nspname = 'private'
            and p.proname = 'protect_organization_membership_fields'
        );
  detail := 'normal invitation/member security was not disabled or removed';
  return next;
end;
$$;

revoke all on function public.verify_m75_owner_provisioning_membership_gate()
  from public, anon, authenticated;
grant execute on function public.verify_m75_owner_provisioning_membership_gate()
  to service_role;

commit;
