-- M42 / Phase 1: owner self-provisioning on signup
-- ===========================================================================
--
-- PROBLEM (audit)
-- ---------------
-- Signup only creates auth.users + public.profiles (M28/M36). Nothing creates
-- the owner's organization, owner membership, or salon. As a result every new
-- authenticated owner resolves to `no-membership` through owner_salon_ids(),
-- and can never:
--   * open the Salon Owner Dashboard (screen 26),
--   * persist saved services / location / website draft (all of which resolve
--     the salon via owner_salon_ids() / private.nexora_manageable_salon_id()),
--   * publish their website.
--
-- Direct client INSERTs into organizations / salons / organization_members are
-- correctly forbidden (M37 revokes INSERT; M36 installs a BEFORE trigger that
-- raises on any non-service_role membership write). The ONLY sanctioned way to
-- create a tenant is therefore a SECURITY DEFINER function owned by the
-- migration role (postgres), which bypasses those client-side guards but
-- enforces its own authorization (auth.uid() must be the caller) and is
-- idempotent (one owner ↔ one organization ↔ one salon).
--
-- CONTRACT
-- --------
--   public.provision_owner_salon(p_salon_name text, p_template_key text)
--     returns table (salon_id uuid, organization_id uuid, already_existed boolean)
--
--   * Caller must be authenticated (raises 28000 otherwise).
--   * If the caller already owns exactly one active salon, that salon is
--     returned unchanged (idempotent — safe to call on every login/refresh).
--   * If the caller owns more than one salon it raises P0003 (ambiguous) and
--     changes nothing — mirroring owner_salon_ids()'s one-salon contract.
--   * Otherwise it creates, in ONE transaction:
--       organizations (name = salon name)
--       organization_members (user_id = auth.uid(), role = 'owner', active)
--       salons (organization_id, name, is_active, theme_id resolved from key)
--     and sets profiles.platform_role = 'business_user' (owner).
--   * The function runs as SECURITY DEFINER with an empty search_path. It is
--     granted to authenticated ONLY. It never accepts a user id from the
--     client; auth.uid() is the sole identity source.
--
-- Additive, idempotent, no table drops, no hardcoded salon/user ids.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight — canonical Design-B roots must exist (M38).
-- ---------------------------------------------------------------------------
do $m42_preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.organizations') is null
     or to_regclass('public.organization_members') is null
     or to_regclass('public.salons') is null
     or to_regclass('public.themes') is null then
    raise exception
      'M42 preflight: canonical Design-B tables (profiles/organizations/organization_members/salons/themes) are missing. Apply M38 before M42.';
  end if;
end
$m42_preflight$;

-- ---------------------------------------------------------------------------
-- 1. provision_owner_salon — the one sanctioned self-service tenant creator.
-- ---------------------------------------------------------------------------
create or replace function public.provision_owner_salon(
  p_salon_name    text default null,
  p_template_key  text default null
)
returns table (
  out_salon_id        uuid,
  out_organization_id uuid,
  out_already_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id          uuid := auth.uid();
  v_owned_ids        uuid[];
  v_org_id           uuid;
  v_salon_id         uuid;
  v_existing_org_id  uuid;
  v_name             text;
  v_template_key     text;
  v_theme_id         uuid;
begin
  if v_user_id is null then
    raise exception 'Please log in to set up your salon'
      using errcode = '28000';
  end if;

  -- Resolve the owner's existing salons through the SAME canonical ownership
  -- chain used everywhere else (organization_members.role='owner' → salons).
  select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_owned_ids
  from public.owner_salon_ids() as s(id);

  if cardinality(v_owned_ids) > 1 then
    raise exception
      'Multiple salons are linked to your account. Select a salon first.'
      using errcode = 'P0003';
  end if;

  if cardinality(v_owned_ids) = 1 then
    -- Idempotent: the owner already has their salon. Return it as-is. We do
    -- NOT rename/retheme an existing salon from here — that is a separate
    -- owner action (and template switching is presentation-only).
    select s.organization_id into v_existing_org_id
    from public.salons s
    where s.id = v_owned_ids[1];
    return query select v_owned_ids[1], v_existing_org_id, true;
    return;
  end if;

  -- ---- No salon yet: provision one. --------------------------------------
  v_name := coalesce(nullif(btrim(p_salon_name), ''), 'My Salon');
  if char_length(v_name) > 120 then
    v_name := left(v_name, 120);
  end if;

  -- Canonical theme key (one of the five selectable templates). Default to
  -- the Barber theme (template #1 in the Phase 1 list); any unrecognised
  -- value also falls back to it. Never trust a client-supplied theme id that
  -- is not an active canonical row.
  v_template_key := lower(btrim(coalesce(p_template_key, '')));
  if v_template_key not in (
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio'
  ) then
    v_template_key := 'barber_mens_grooming';
  end if;

  select t.id into v_theme_id
  from public.themes t
  where t.theme_id = v_template_key
    and t.is_active = true;

  -- organization
  insert into public.organizations (name, status)
  values (v_name, 'active')
  returning id into v_org_id;

  -- owner membership. role/status are written directly by this definer
  -- function, so the M36 client guard (which only blocks non-trusted roles)
  -- does not apply — and that is intentional: provisioning is trusted.
  --
  -- The conflict target is unqualified by design: PL/pgSQL resolves the bare
  -- column names against the inserted row, so this does not trip the
  -- "organization_id is ambiguous" PL/pgSQL diagnostic (a table alias on the
  -- INSERT is not portable across Postgres parsers).
  insert into public.organization_members
    (organization_id, user_id, role, is_active)
  values (v_org_id, v_user_id, 'owner', true)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, is_active = excluded.is_active;

  -- salon
  insert into public.salons
    (organization_id, theme_id, name, is_active)
  values (v_org_id, v_theme_id, v_name, true)
  returning id into v_salon_id;

  -- Promote the profile to business_user (owner). platform_role is immutable
  -- to browser clients (M36) but writable from this definer context.
  update public.profiles
     set platform_role = 'business_user',
         is_active = true,
         updated_at = now()
   where id = v_user_id;

  return query select v_salon_id, v_org_id, false;
end;
$$;

revoke all on function public.provision_owner_salon(text, text)
  from public, anon;
grant execute on function public.provision_owner_salon(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Self-test (used by the Phase 1 test suite).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m42_owner_provisioning()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'provision function exists';
  ok := to_regprocedure('public.provision_owner_salon(text,text)') is not null;
  detail := case when ok then 'public.provision_owner_salon(text,text)' else 'missing' end;
  return next;

  check_name := 'provision function granted to authenticated only';
  select exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'provision_owner_salon'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ) into ok;
  detail := case when ok then 'granted to authenticated' else 'not granted to authenticated' end;
  return next;

  check_name := 'provision function not granted to anon';
  select not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'provision_owner_salon'
      and grantee = 'anon'
  ) into ok;
  detail := case when ok then 'anon has no execute' else 'anon can execute (insecure)' end;
  return next;
end;
$$;

revoke all on function public.verify_m42_owner_provisioning() from public, anon;
grant execute on function public.verify_m42_owner_provisioning() to authenticated, service_role;

commit;
