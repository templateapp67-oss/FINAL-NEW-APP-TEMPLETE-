-- ============================================================================
-- M63 — Owner provisioning through the live membership-invitation guard,
--       and closure of the M58 membership-activation authorization bypass.
-- ============================================================================
--
-- NUMBERING NOTE: this was authored as "M59" on branch
-- arena/01a04378-final-new-app-templete. `main` independently shipped a
-- different M59 (20260827000201_m59_owner_provision_invitation_fix.sql, a
-- stale-overload/schema-cache fix) plus M60-M62. To avoid two distinct
-- migrations claiming M59 and sharing the 20260827000201 timestamp prefix,
-- this file is renumbered to M63 with a later timestamp so it applies after
-- the M58-M62 track. It is additive and does not depend on M59-M62.
--
-- PROBLEM 1 — owners can never provision (the reported P0001).
--   `public.provision_owner_salon` is the only sanctioned way to create a
--   tenant. It is SECURITY DEFINER and reaches `organization_members` through
--   `private.nexora_upsert_owner_membership`. On the live project a BEFORE
--   INSERT guard raises
--       'new memberships require server-activated invitations'  (SQLSTATE P0001)
--   for EVERY inserter, including that trusted definer. The owner bootstrap
--   therefore aborts before any membership row exists, and because
--   `profiles.platform_role` / `profiles.is_active` are NOT client-writable
--   (M36 §8 grants UPDATE only on full_name, avatar_url, phone, last_seen_at,
--   updated_at) there is no client-side recovery. The owner is locked out.
--
--   The invitation guard is correct and must stay: it exists to stop CLIENT
--   inserts. A SECURITY DEFINER owner bootstrap IS the server-activated path
--   the guard demands. So the guard is suspended only for the duration of that
--   one trusted upsert and restored to its exact prior state — the pattern
--   already reviewed for the live membership guard in M38 §2b.
--
-- PROBLEM 2 — M58 `activate_workspace_membership` was an authorization bypass.
--   As written, when no invite token was supplied the function set
--   `v_role := 'member'` and inserted the membership ANYWAY. Any authenticated
--   caller could add themselves as an active member of ANY workspace just by
--   supplying its UUID. It also treated `current_user` as a trust signal, which
--   is meaningless inside a SECURITY DEFINER body (current_user is always the
--   function owner). Both are fixed: activation now requires an authorization
--   basis — a valid unaccepted invitation, workspace ownership, or an existing
--   membership — and identity comes only from `auth.uid()`.
--
-- Nothing in this migration weakens a client-facing control: client writes to
-- `organization_members` remain revoked (M36 §7) and still hit the guard.

begin;

-- M28/M38 create this schema; restated so M63 is self-contained when it is
-- applied to a project where the helper schema has not been created yet.
create schema if not exists private;

-- ============================================================================
-- 1. Locate the live membership-invitation guard triggers.
-- ============================================================================
-- Selected by the guard's own source text, not by a guessed trigger name: the
-- live trigger name is not known to this repository. Only BEFORE triggers
-- whose function body carries the documented 'server-activated invitation'
-- rejection are returned, so unrelated membership triggers are never touched.
create or replace function private.nexora_membership_invitation_guards()
returns table (trigger_name text, trigger_state text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.tgname::text, t.tgenabled::text
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = pg_catalog.to_regclass('public.organization_members')
    and pg_catalog.to_regclass('public.organization_members') is not null
    and not t.tgisinternal
    and t.tgenabled <> 'D'                       -- already disabled: leave alone
    and (t.tgtype & 2) = 2                       -- BEFORE triggers only
    and (
          lower(pg_catalog.pg_get_functiondef(p.oid)) like '%server-activated%'
       or lower(pg_catalog.pg_get_functiondef(p.oid)) like '%server activated%'
    )
$$;

revoke all on function private.nexora_membership_invitation_guards()
  from public, anon, authenticated;

-- ============================================================================
-- 2. Restore helper — returns each suspended trigger to its exact prior state.
-- ============================================================================
-- Accepts the flat [name, state, name, state, ...] array built by the caller so
-- the O/R/A (origin / replica / always) variant is preserved.
create or replace function private.nexora_restore_membership_invitation_guards(
  p_pairs text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i integer;
begin
  if p_pairs is null or array_length(p_pairs, 1) is null then
    return;
  end if;
  v_i := 1;
  while v_i + 1 <= array_length(p_pairs, 1) loop
    execute format(
      'alter table public.organization_members %s %I',
      case p_pairs[v_i + 1]
        when 'O' then 'enable trigger'
        when 'R' then 'enable replica trigger'
        when 'A' then 'enable always trigger'
        else 'enable trigger'
      end,
      p_pairs[v_i]
    );
    v_i := v_i + 2;
  end loop;
end;
$$;

revoke all on function private.nexora_restore_membership_invitation_guards(text[])
  from public, anon, authenticated;

-- ============================================================================
-- 3. Owner membership upsert that survives the live invitation guard.
-- ============================================================================
-- Same signature, same four schema-shape branches and same 428C9 fail-closed
-- rule as M54 §2 — M54's `verify_m54_workspace_bootstrap()` asserts both this
-- function's name and its `is_generated = 'ALWAYS'` compatibility check, so
-- both are deliberately preserved verbatim.
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
  v_guard record;
  v_pairs text[] := array[]::text[];
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

  -- Suspend only the invitation guard, and only for the statements below.
  for v_guard in select * from private.nexora_membership_invitation_guards() loop
    execute format('alter table public.organization_members disable trigger %I',
                   v_guard.trigger_name);
    v_pairs := v_pairs || v_guard.trigger_name || v_guard.trigger_state;
  end loop;

  begin
    if v_has_status and v_has_is_active and v_is_active_generated then
      -- THIS is the observed M28 live shape. Never mention is_active in this
      -- statement: PostgreSQL 428C9 is raised for any explicit generated value.
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
      -- A generated activity column without its source status column is not a
      -- supported canonical shape. Failing explicitly is safer than creating an
      -- owner membership that the resolver would never consider active.
      raise exception
        'organization membership activity columns are not writable in this schema'
        using errcode = '428C9';
    end if;
  exception when others then
    -- Never leave the table unguarded, even on the way out.
    perform private.nexora_restore_membership_invitation_guards(v_pairs);
    raise;
  end;

  perform private.nexora_restore_membership_invitation_guards(v_pairs);
end;
$$;

revoke all on function private.nexora_upsert_owner_membership(uuid, uuid)
  from public, anon, authenticated;

-- ============================================================================
-- 4. activate_workspace_membership — require an authorization basis.
-- ============================================================================
-- Identity comes ONLY from auth.uid(). `p_user_id` is retained for signature
-- compatibility but is honoured solely for a genuine service-role caller; a
-- browser JWT is 'authenticated', so it can never impersonate another user.
create or replace function public.activate_workspace_membership(
  p_workspace_id uuid,
  p_user_id      uuid default null,
  p_invite_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id       uuid;
  v_caller_role   text;
  v_is_service    boolean;
  v_invitation    public.invitations%rowtype;
  v_membership_id uuid;
  v_role          text;
  v_authorized    boolean := false;
  v_is_existing   boolean := false;
begin
  -- current_user is always the function owner inside SECURITY DEFINER, so it
  -- must never be read as a trust signal. The JWT role claim is the caller.
  v_caller_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
  v_is_service  := v_caller_role = 'service_role';

  v_user_id := auth.uid();
  if v_user_id is null and v_is_service then
    v_user_id := p_user_id;
  end if;

  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- An existing membership is returned unchanged (idempotent read-through).
  select m.id, m.role into v_membership_id, v_role
  from public.memberships m
  where m.workspace_id = p_workspace_id and m.user_id = v_user_id
  limit 1;

  if found then
    return jsonb_build_object(
      'M_ID', v_membership_id::text,
      'id', v_membership_id::text,
      'membership_id', v_membership_id::text,
      'workspace_id', p_workspace_id::text,
      'user_id', v_user_id::text,
      'role', v_role,
      'already_existed', true
    );
  end if;

  -- Basis 1: a valid, unaccepted invitation for this workspace.
  if p_invite_token is not null and btrim(p_invite_token) <> '' then
    select * into v_invitation
    from public.invitations
    where token = btrim(p_invite_token)
      and workspace_id = p_workspace_id
      and (expires_at is null or expires_at > now())
      and accepted_at is null
    limit 1;

    if not found then
      raise exception 'Invalid or expired invitation' using errcode = 'P0001';
    end if;

    v_role := coalesce(v_invitation.role, 'member');
    v_authorized := true;

    update public.invitations
       set accepted_at = now(),
           accepted_by = v_user_id
     where id = v_invitation.id;

  -- Basis 2: the caller created the workspace.
  elsif exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = v_user_id
  ) then
    v_role := 'owner';
    v_authorized := true;

  -- Basis 3: a trusted server-side caller acting on a known user.
  elsif v_is_service then
    v_role := 'member';
    v_authorized := true;
  end if;

  -- No basis: this is the M58 bypass. Refuse instead of inserting.
  if not v_authorized then
    raise exception
      'You are not authorized to join this workspace'
      using errcode = '42501';
  end if;

  insert into public.memberships (id, workspace_id, user_id, role, status, created_at)
  values (gen_random_uuid(), p_workspace_id, v_user_id, v_role, 'active', now())
  on conflict (workspace_id, user_id) do update
    set status = 'active', updated_at = now()
  returning id into v_membership_id;

  return jsonb_build_object(
    'M_ID', v_membership_id::text,
    'id', v_membership_id::text,
    'membership_id', v_membership_id::text,
    'workspace_id', p_workspace_id::text,
    'user_id', v_user_id::text,
    'role', v_role,
    'already_existed', v_is_existing
  );
end;
$$;

revoke all on function public.activate_workspace_membership(uuid, uuid, text) from public;
grant execute on function public.activate_workspace_membership(uuid, uuid, text) to authenticated, service_role;

-- ============================================================================
-- 5. Deployment verification.
-- ============================================================================
-- Required by scripts/apply-live-migration.mjs, which runs
-- `select * from public.<verifier>()` after applying a reviewed migration.
create or replace function public.verify_m63_owner_provisioning()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_upsert text;
  v_activate text;
begin
  return query select
    'invitation-guard discovery helper is installed'::text,
    to_regprocedure('private.nexora_membership_invitation_guards()') is not null,
    'private.nexora_membership_invitation_guards() must exist'::text;

  v_upsert := lower(coalesce(pg_catalog.pg_get_functiondef(
    'private.nexora_upsert_owner_membership(uuid,uuid)'::regprocedure), ''));

  return query select
    'owner membership upsert suspends the live invitation guard'::text,
    position('disable trigger' in v_upsert) > 0,
    'the trusted bootstrap must get through the live P0001 guard'::text;

  return query select
    'owner membership upsert restores the guard afterwards'::text,
    position('nexora_restore_membership_invitation_guards' in v_upsert) > 0,
    'organization_members must never be left unguarded'::text;

  return query select
    'M54 generated-column compatibility check is preserved'::text,
    position('is_generated = ''always''' in v_upsert) > 0,
    'M54 verifier asserts this; a rewrite must not drop it'::text;

  v_activate := lower(coalesce(pg_catalog.pg_get_functiondef(
    'public.activate_workspace_membership(uuid,uuid,text)'::regprocedure), ''));

  return query select
    'activation refuses callers with no authorization basis'::text,
    position('42501' in v_activate) > 0
      and position('not authorized to join this workspace' in v_activate) > 0,
    'the M58 bypass must stay closed'::text;

  return query select
    'activation does not treat current_user as a trust signal'::text,
    position('current_user in' in v_activate) = 0,
    'current_user is always the function owner inside SECURITY DEFINER'::text;

  return query select
    'canonical provision_owner_salon remains executable by authenticated'::text,
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

revoke all on function public.verify_m63_owner_provisioning() from public, anon;
grant execute on function public.verify_m63_owner_provisioning() to authenticated, service_role;

commit;
