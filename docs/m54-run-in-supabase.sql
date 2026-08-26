-- ============================================================================
-- M54 — LIVE APPLY (Supabase SQL Editor paste-ready)
-- Project: qwaehqsmodekbgvnaavz
-- ============================================================================
-- यह फाइल तब use करो जब CLI / Management API से apply न हो पाए
-- (expired SUPABASE_ACCESS_TOKEN, या restricted network).
--
-- STEP 0 — PRE-CHECK (अलग tab में चलाओ, कुछ भी लिखता नहीं):
--   select column_name, is_generated, generation_expression
--   from information_schema.columns
--   where table_schema='public' and table_name='organization_members'
--     and column_name in ('status','is_active')
--   order by column_name;
--
--   अपेक्षित live shape: status = writable, is_active = ALWAYS (generated).
--   यही 428C9 का source है.
--
-- STEP 1 — नया query tab खोलो. इस फाइल का ALL text copy करो (Ctrl+A),
--          बीच का टुकड़ा नहीं. पहली statement begin; आखिरी commit;
-- STEP 2 — Selection हटाओ, Run.
-- STEP 3 — POST-CHECK (नया tab):
--   select check_name, ok, detail
--   from public.verify_m54_workspace_bootstrap()
--   order by check_name;
--   सभी 6 rows ok = true होनी चाहिए.
--
-- ROLLBACK: पूरा script एक transaction है — कोई भी statement fail हुआ तो
-- कुछ भी commit नहीं होगा. Migration additive है (create or replace);
-- कोई table drop / column drop / RLS disable नहीं होता.
--
-- अगर preflight exception आए ("canonical workspace tables/helpers are
-- missing") तो पहले M38 + M44/M45/M51 apply करो, फिर यह दोबारा चलाओ.
-- ============================================================================

-- ============================================================================
-- M54 — authenticated workspace bootstrap compatibility + idempotency repair
-- ============================================================================
--
-- ROOT CAUSE
-- ----------
-- The observed live membership vocabulary uses `status` as the writable
-- activity column. M28 reconciles that shape by adding:
--
--   is_active boolean generated always as ((status = 'active') is true) stored
--
-- M42/M44/M51/M53's provisioning RPCs nevertheless wrote
-- `organization_members.is_active` directly. PostgreSQL rejects that write
-- with SQLSTATE 428C9 (cannot insert a non-DEFAULT value into a generated
-- column), so Auth succeeded but organization/membership/salon initialization
-- stopped at the workspace boundary. M53's slug fix cannot be reached on that
-- schema shape.
--
-- FIX
-- ---
-- This migration replaces the canonical provisioning RPC and adds two private
-- helpers. The membership helper inspects the live column metadata and writes
-- `status = 'active'` when `is_active` is generated; it writes `is_active` only
-- when that column is actually writable. The profile helper repairs accounts
-- created before/without the signup trigger. The provisioner also reuses a
-- pre-existing active owner organization with no salon, preventing a failed
-- partial attempt from creating a second organization on retry.
--
-- No browser identity, organization id, salon id, service_role key or RLS
-- bypass is introduced. `auth.uid()` remains the only authorization input.
-- The RPC stays SECURITY DEFINER and authenticated-only, and all writes remain
-- in the caller's transaction. Existing populated salon/website/template data
-- is not overwritten by an idempotent call.

begin;

-- ============================================================================
-- 0. Fail closed on the canonical Design-B roots.
-- ============================================================================
do $m54_preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.organizations') is null
     or to_regclass('public.organization_members') is null
     or to_regclass('public.salons') is null
     or to_regclass('public.salon_public_websites') is null
     or to_regclass('public.themes') is null
     or to_regprocedure('public.owner_salon_ids()') is null
     or to_regprocedure('private.nexora_allocate_business_slug(text,uuid)') is null then
    raise exception
      'M54 preflight: canonical workspace tables/helpers are missing. Apply M38 and the owner provisioning migrations first.';
  end if;
end
$m54_preflight$;

-- ============================================================================
-- 1. Repair/complete the profile for an authenticated user.
-- ============================================================================
create or replace function private.nexora_ensure_owner_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_active boolean;
  v_profile_found boolean;
  v_email text;
  v_name text;
begin
  if p_user_id is null then
    raise exception 'An authenticated user is required' using errcode = '28000';
  end if;

  select p.is_active
    into v_profile_active
  from public.profiles p
  where p.id = p_user_id;
  v_profile_found := found;

  if v_profile_found then
    if coalesce(v_profile_active, false) is not true then
      raise exception 'Your profile is inactive and cannot open an owner workspace'
        using errcode = '42501';
    end if;
    return;
  end if;

  -- The normal signup trigger creates this row. This repair path is for an
  -- already registered Auth account whose profile trigger was absent or
  -- failed in an older deployment. Read only non-secret Auth fields.
  select u.email,
         coalesce(
           nullif(btrim(u.raw_user_meta_data->>'salon_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'fullName'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
           'User'
         )
    into v_email, v_name
  from auth.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'Authenticated user does not exist' using errcode = '28000';
  end if;

  insert into public.profiles
    (id, full_name, platform_role, is_active, email)
  values
    (p_user_id, left(v_name, 120), 'customer', true, v_email)
  on conflict (id) do nothing;
end;
$$;

revoke all on function private.nexora_ensure_owner_profile(uuid)
  from public, anon, authenticated;

-- ============================================================================
-- 2. Membership upsert that is safe for both live vocabulary shapes.
-- ============================================================================
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
  v_activity_predicate text;
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
    -- THIS is the observed M28 live shape. Never mention is_active in this
    -- statement: PostgreSQL 428C9 is raised for any explicit generated value.
    execute $sql$
      insert into public.organization_members
        (organization_id, user_id, role, status)
      values ($1, $2, 'owner', 'active')
      on conflict (organization_id, user_id)
      do update set role = 'owner', status = 'active'
    $sql$ using p_organization_id, p_user_id;
    return;
  end if;

  if v_has_status and v_has_is_active and not v_is_active_generated then
    -- A transitional schema may still have both writable columns. Keep both
    -- representations synchronized until M28 turns is_active into generated.
    execute $sql$
      insert into public.organization_members
        (organization_id, user_id, role, status, is_active)
      values ($1, $2, 'owner', 'active', true)
      on conflict (organization_id, user_id)
      do update set role = 'owner', status = 'active', is_active = true
    $sql$ using p_organization_id, p_user_id;
    return;
  end if;

  if v_has_status then
    -- Pre-M28 live vocabulary: status is the only activity authority.
    execute $sql$
      insert into public.organization_members
        (organization_id, user_id, role, status)
      values ($1, $2, 'owner', 'active')
      on conflict (organization_id, user_id)
      do update set role = 'owner', status = 'active'
    $sql$ using p_organization_id, p_user_id;
    return;
  end if;

  if v_has_is_active and not v_is_active_generated then
    -- Fresh/M38 vocabulary: is_active is a normal writable boolean.
    execute $sql$
      insert into public.organization_members
        (organization_id, user_id, role, is_active)
      values ($1, $2, 'owner', true)
      on conflict (organization_id, user_id)
      do update set role = 'owner', is_active = true
    $sql$ using p_organization_id, p_user_id;
    return;
  end if;

  -- A generated activity column without its source status column is not a
  -- supported canonical shape. Failing explicitly is safer than creating an
  -- owner membership that the resolver would never consider active.
  raise exception
    'organization membership activity columns are not writable in this schema'
    using errcode = '428C9';
end;
$$;

revoke all on function private.nexora_upsert_owner_membership(uuid, uuid)
  from public, anon, authenticated;

-- ============================================================================
-- 3. Canonical owner provisioning — Auth → profile → org membership → salon.
-- ============================================================================
create or replace function public.provision_owner_salon(
  p_salon_name   text,
  p_slug         text,
  p_template_id  text default 'barber_mens_grooming'
)
returns table (
  out_salon_id        uuid,
  out_organization_id uuid,
  out_slug            text,
  out_template_id     text,
  out_is_published    boolean,
  out_already_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_org_ids uuid[];
  v_owned_ids uuid[];
  v_org_id uuid;
  v_salon_id uuid;
  v_name text;
  v_slug text;
  v_template text;
  v_theme_id uuid;
  v_website public.salon_public_websites%rowtype;
  v_attempt integer := 0;
  v_existing_slug text;
  v_active_predicate text;
  v_has_any_membership boolean;
begin
  if v_user_id is null then
    raise exception 'Please log in to set up your business' using errcode = '28000';
  end if;

  -- Serialize retries for one Auth identity. This prevents two tabs or a
  -- refresh/login race from creating two organizations for the same user.
  perform pg_advisory_xact_lock(hashtext('nexora-owner-provision:' || v_user_id::text));

  perform private.nexora_ensure_owner_profile(v_user_id);

  v_name := left(coalesce(nullif(btrim(p_salon_name), ''), 'My Salon'), 120);
  v_template := lower(btrim(coalesce(p_template_id, '')));
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then v_template := 'barber_mens_grooming'; end if;

  select t.id into v_theme_id
  from public.themes t
  where t.theme_id = v_template and t.is_active = true;

  -- `organization_members` is intentionally inspected through dynamic SQL:
  -- status is absent on the fresh shape and is_active is generated on the
  -- observed live shape, so a static reference would fail one of them.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'status'
  ) then
    v_active_predicate := 'om.status = ''active''';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'is_active'
  ) then
    v_active_predicate := 'om.is_active = true';
  else
    v_active_predicate := 'false';
  end if;

  execute format(
    'select coalesce(array_agg(om.organization_id order by om.organization_id), array[]::uuid[]) '
    || 'from public.organization_members om '
    || 'where om.user_id = $1 and om.role = ''owner'' and %s',
    v_active_predicate
  ) into v_owner_org_ids using v_user_id;

  if cardinality(v_owner_org_ids) > 1 then
    raise exception 'Multiple businesses are linked to your account. Select one first.'
      using errcode = 'P0003';
  end if;

  -- An inactive/staff membership is not permission to self-create a second
  -- owner tenant. This keeps retries from bypassing the existing ownership
  -- architecture and makes authorization failures distinct from onboarding.
  select exists (
    select 1 from public.organization_members om where om.user_id = v_user_id
  ) into v_has_any_membership;

  if cardinality(v_owner_org_ids) = 0 and v_has_any_membership then
    raise exception 'Your account is not authorized to provision an owner workspace'
      using errcode = '42501';
  end if;

  if cardinality(v_owner_org_ids) = 1 then
    v_org_id := v_owner_org_ids[1];
    select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
      into v_owned_ids
    from public.salons s
    where s.organization_id = v_org_id
      and s.is_active = true
      and s.deleted_at is null;

    if cardinality(v_owned_ids) > 1 then
      raise exception 'Multiple salons are linked to your account. Select one first.'
        using errcode = 'P0003';
    end if;
    if cardinality(v_owned_ids) = 1 then
      v_salon_id := v_owned_ids[1];
      select nullif(btrim(coalesce(s.slug, '')),''), s.organization_id
        into v_existing_slug, v_org_id
      from public.salons s where s.id = v_salon_id;

      select * into v_website
      from public.salon_public_websites w where w.salon_id = v_salon_id;

      if not found or nullif(btrim(coalesce(v_website.slug, '')), '') is null then
        -- Repair an owner created by a pre-website migration, using the
        -- existing salon slug when safe and otherwise the canonical allocator.
        loop
          v_attempt := v_attempt + 1;
          v_slug := coalesce(v_existing_slug,
            private.nexora_allocate_business_slug(
              (select s.name from public.salons s where s.id = v_salon_id),
              v_salon_id
            ));
          begin
            if v_website.salon_id is null then
              insert into public.salon_public_websites
                (salon_id, slug, template_key, config, is_published, published_at)
              values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null)
              returning * into v_website;
            else
              update public.salon_public_websites w
                set slug = v_slug, updated_at = now()
              where w.salon_id = v_salon_id
              returning * into v_website;
            end if;
            exit;
          exception when unique_violation then
            v_existing_slug := null;
            if v_attempt >= 50 then raise; end if;
          end;
        end loop;
      end if;

      -- M53's legacy repair remains: a populated salon mirror is not silently
      -- changed, while a blank mirror is made consistent with the website URL.
      if v_existing_slug is null then
        update public.salons s
          set slug = v_website.slug, updated_at = now()
        where s.id = v_salon_id
          and nullif(btrim(coalesce(s.slug, '')), '') is null
          and not exists (
            select 1 from public.salons other
            where other.id <> s.id
              and lower(btrim(coalesce(other.slug, ''))) = lower(btrim(v_website.slug))
          );
      end if;

      return query values (
        v_salon_id, v_org_id, v_website.slug,
        coalesce(v_website.template_key, v_template), v_website.is_published, true
      );
      return;
    end if;
    -- Existing owner organization with no active salon: repair the partial
    -- bootstrap in place instead of creating another organization.
  else
    -- No membership at all is the only onboarding/provisioning case. The
    -- profile helper has already guaranteed the Auth → profile link.
    insert into public.organizations (name, status)
    values (v_name, 'active') returning id into v_org_id;
    perform private.nexora_upsert_owner_membership(v_org_id, v_user_id);
  end if;

  -- Fresh salon, or a partial owner organization whose salon insert previously
  -- failed. The allocator and both slug namespaces are transaction-safe.
  loop
    v_attempt := v_attempt + 1;
    v_slug := private.nexora_allocate_business_slug(v_name, v_salon_id);
    begin
      if v_salon_id is null then
        insert into public.salons (organization_id, theme_id, name, slug, is_active)
        values (v_org_id, v_theme_id, v_name, v_slug, true)
        returning id into v_salon_id;
      else
        update public.salons set slug = v_slug, updated_at = now()
        where id = v_salon_id;
      end if;

      insert into public.salon_public_websites
        (salon_id, slug, template_key, config, is_published, published_at)
      values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null);
      exit;
    exception when unique_violation then
      -- The block rolls back a just-inserted salon together with the
      -- colliding website write. Re-arm the fresh-salon path before choosing
      -- the next candidate; otherwise the next retry would update a row that
      -- no longer exists and then fail its website foreign key.
      v_salon_id := null;
      if v_attempt >= 50 then raise; end if;
    end;
  end loop;

  update public.profiles
     set platform_role = 'business_user', is_active = true, updated_at = now()
   where id = v_user_id;

  return query values (v_salon_id, v_org_id, v_slug, v_template, false, false);
end;
$$;

revoke all on function public.provision_owner_salon(text, text, text)
  from public, anon;
grant execute on function public.provision_owner_salon(text, text, text)
  to authenticated;

-- ============================================================================
-- 4. Read-only deployment verification.
-- ============================================================================
create or replace function public.verify_m54_workspace_bootstrap()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provision text := lower(pg_catalog.pg_get_functiondef(
    'public.provision_owner_salon(text,text,text)'::regprocedure
  ));
  v_membership text := lower(pg_catalog.pg_get_functiondef(
    'private.nexora_upsert_owner_membership(uuid,uuid)'::regprocedure
  ));
  v_profile text := lower(pg_catalog.pg_get_functiondef(
    'private.nexora_ensure_owner_profile(uuid)'::regprocedure
  ));
  v_generated boolean;
begin
  check_name := 'status/generated membership writes are compatibility-aware';
  ok := position('is_generated = ''always''' in v_membership) > 0
    and position('status' in v_membership) > 0
    and position('is_active' in v_membership) > 0;
  detail := 'generated is_active is never written in the status-backed branch';
  return next;

  check_name := 'provisioner delegates membership writes to the compatibility helper';
  ok := position('nexora_upsert_owner_membership' in v_provision) > 0
    and position('organization_members (organization_id, user_id, role, is_active)' in v_provision) = 0;
  detail := 'no direct generated-column write remains in the canonical RPC';
  return next;

  check_name := 'profile bootstrap reads Auth and never accepts a client user id';
  ok := position('auth.users' in v_profile) > 0
    and position('raw_user_meta_data' in v_profile) > 0;
  detail := 'missing legacy profiles are repaired from auth.users';
  return next;

  check_name := 'per-user provisioning is serialized and idempotent';
  ok := position('pg_advisory_xact_lock' in v_provision) > 0
    and position('already_existed' in v_provision) > 0
    and position('organization_members' in v_provision) > 0;
  detail := 'same Auth identity reuses its organization/salon';
  return next;

  check_name := 'RLS remains enabled on the workspace chain';
  select bool_and(c.relrowsecurity) into ok
  from pg_catalog.pg_class c
  where c.oid in (
    'public.profiles'::regclass,
    'public.organizations'::regclass,
    'public.organization_members'::regclass,
    'public.salons'::regclass,
    'public.salon_public_websites'::regclass
  );
  detail := 'profiles, organizations, memberships, salons and website drafts remain RLS protected';
  return next;

  check_name := 'authenticated-only RPC grant';
  ok := exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'provision_owner_salon'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ) and not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'provision_owner_salon'
      and grantee in ('anon', 'PUBLIC')
      and privilege_type = 'EXECUTE'
  );
  detail := 'authenticated may execute; anon/public may not';
  return next;
end;
$$;

revoke all on function public.verify_m54_workspace_bootstrap()
  from public, anon, authenticated;
grant execute on function public.verify_m54_workspace_bootstrap() to service_role;

commit;
