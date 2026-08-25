-- ===========================================================================
-- M53 — provisioning fix: always write the canonical slug onto public.salons
-- ===========================================================================
-- BUG (owner-facing): a brand-new owner's first login died on the workspace
-- boundary with "We couldn't load your salon workspace / Could not set up your
-- salon. Please try again."
--
-- Root cause: `public.salons` in the LIVE schema is created by
-- `20260821203500_setup_public_salon_v2.sql` as
--
--     create table if not exists public.salons (
--       ...
--       slug TEXT UNIQUE NOT NULL,
--       ...
--     );
--
-- but every generation of `provision_owner_salon` (M42 → M44 → M51) inserts
-- the tenant row WITHOUT that column:
--
--     insert into public.salons (organization_id, theme_id, name, is_active)
--
-- so the very first statement of tenant creation raised
-- `23502 null value in column "slug" of relation "salons" violates not-null
-- constraint`. `sanitizeProvisionError()` (src/lib/ownerProvisioning.ts) has no
-- branch for 23502, so it collapsed to the generic "Could not set up your
-- salon. Please try again.", `resolveOrProvisionOwnerSalon` returned `{error}`,
-- and `src/App.tsx` rendered the hydration-boundary error card. The failure was
-- 100% reproducible for every new owner and no retry could ever succeed,
-- because the NOT NULL constraint is deterministic.
--
-- Why the existing suites stayed green: `scripts/test-slug-collision-handling.mjs`
-- (and the other Phase harnesses) bootstrap only M38 → M51, and M38's
-- `create table if not exists public.salons (...)` has NO slug column — M44
-- later adds it as NULLABLE. So the tests exercised a schema shape where the
-- missing column was harmless, while the live database has the NOT NULL one.
--
-- FIX (this migration, additive + idempotent):
--   1. `provision_owner_salon` allocates the canonical slug BEFORE inserting
--      the salon and writes it into `public.salons.slug`, inside the same
--      savepoint retry that already protected the website insert. The salon
--      row and its `salon_public_websites` row are therefore created with ONE
--      identical, collision-resolved slug.
--   2. The already-has-a-salon branch backfills a missing/blank
--      `salons.slug` from the same allocator, so tenants created by the
--      broken versions are repaired on their next login (idempotent).
--   3. Nothing else changes: the RPC shape, SECURITY DEFINER identity model
--      (`auth.uid()` only), grants, template validation, deterministic
--      base / base-1 / base-2 numbering, advisory-lock serialization,
--      both-namespace scanning and `published_at` URL immutability are all
--      preserved exactly as M51 defined them.
--
-- The client still supplies no id and no authorization input; `p_slug` remains
-- accepted-but-ignored for backwards-compatible call shape.

begin;

-- ---------------------------------------------------------------------------
-- 1. Provisioning — slug-complete tenant creation.
-- ---------------------------------------------------------------------------
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
begin
  if v_user_id is null then
    raise exception 'Please log in to set up your business' using errcode = '28000';
  end if;

  v_name := left(coalesce(nullif(btrim(p_salon_name), ''), 'My Business'), 120);
  v_template := lower(btrim(coalesce(p_template_id, '')));
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then v_template := 'barber_mens_grooming'; end if;

  select t.id into v_theme_id from public.themes t
  where t.theme_id = v_template and t.is_active = true;

  select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_owned_ids from public.owner_salon_ids() as s(id);
  if cardinality(v_owned_ids) > 1 then
    raise exception 'Multiple businesses are linked to your account. Select one first.'
      using errcode = 'P0003';
  end if;

  -- ---- Idempotent path: the owner already has a tenant. -------------------
  if cardinality(v_owned_ids) = 1 then
    v_salon_id := v_owned_ids[1];
    select s.organization_id, nullif(btrim(coalesce(s.slug, '')), '')
      into v_org_id, v_existing_slug
    from public.salons s where s.id = v_salon_id;
    select * into v_website from public.salon_public_websites w where w.salon_id = v_salon_id;

    if not found then
      -- No website row yet. Allocate once and use the SAME slug for both the
      -- website row and (when missing) the salon mirror.
      loop
        v_attempt := v_attempt + 1;
        v_slug := coalesce(v_existing_slug, private.nexora_allocate_business_slug(
          (select s.name from public.salons s where s.id = v_salon_id), v_salon_id
        ));
        begin
          insert into public.salon_public_websites
            (salon_id, slug, template_key, config, is_published, published_at)
          values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null)
          returning * into v_website;
          exit;
        exception when unique_violation then
          -- Only a freshly allocated slug may be re-rolled; an existing salon
          -- slug that collides means the website row must not silently move.
          v_existing_slug := null;
          if v_attempt >= 50 then raise; end if;
        end;
      end loop;
    end if;

    -- Repair tenants created by the pre-M53 versions (blank/NULL salon slug),
    -- mirroring the live public URL. Never overwrite a populated slug.
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

  -- ---- Fresh tenant. ------------------------------------------------------
  insert into public.organizations (name, status)
  values (v_name, 'active') returning id into v_org_id;
  insert into public.organization_members (organization_id, user_id, role, is_active)
  values (v_org_id, v_user_id, 'owner', true)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, is_active = excluded.is_active;

  -- p_slug is retained only for backwards-compatible RPC shape. The canonical
  -- slug is generated from the business name and collision-resolved here, then
  -- written to BOTH namespaces. `public.salons.slug` is NOT NULL in the live
  -- schema, so it must be supplied by this insert (the M53 fix).
  loop
    v_attempt := v_attempt + 1;
    v_slug := private.nexora_allocate_business_slug(v_name, v_salon_id);
    begin
      if v_salon_id is null then
        insert into public.salons (organization_id, theme_id, name, slug, is_active)
        values (v_org_id, v_theme_id, v_name, v_slug, true)
        returning id into v_salon_id;
      else
        -- The salon row survived a previous attempt; only its slug needs to
        -- move to the next free candidate.
        update public.salons set slug = v_slug, updated_at = now()
        where id = v_salon_id;
      end if;

      insert into public.salon_public_websites
        (salon_id, slug, template_key, config, is_published, published_at)
      values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null);
      exit;
    exception when unique_violation then
      if v_attempt >= 50 then raise; end if;
    end;
  end loop;

  update public.profiles set platform_role = 'business_user', is_active = true, updated_at = now()
  where id = v_user_id;

  return query values (v_salon_id, v_org_id, v_slug, v_template, false, false);
end;
$$;
revoke all on function public.provision_owner_salon(text, text, text) from public, anon;
grant execute on function public.provision_owner_salon(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Self-verification RPC (read-only, service_role like the other verifiers).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m53_provision_salon_slug()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provision text := lower(pg_catalog.pg_get_functiondef(
    'public.provision_owner_salon(text,text,text)'::regprocedure
  ));
  v_slug_required boolean;
begin
  check_name := 'provision_owner_salon writes salons.slug';
  ok := position('insert into public.salons (organization_id, theme_id, name, slug, is_active)'
    in v_provision) > 0;
  detail := 'tenant insert supplies the allocated slug'; return next;

  check_name := 'slug allocated before the salon insert';
  ok := position('nexora_allocate_business_slug' in v_provision) > 0
    and position('nexora_allocate_business_slug' in v_provision)
        < position('insert into public.salons' in v_provision);
  detail := 'canonical allocator drives both namespaces'; return next;

  check_name := 'creation still retries on unique_violation (race-safe)';
  ok := position('unique_violation' in v_provision) > 0;
  detail := 'savepoint retry preserved from M51'; return next;

  check_name := 'legacy tenants with a blank salon slug are backfilled';
  ok := position('update public.salons s' in v_provision) > 0
    and position('set slug = v_website.slug' in v_provision) > 0;
  detail := 'idempotent repair on next login'; return next;

  check_name := 'no salon row can exist without a slug when the column is NOT NULL';
  select (a.attnotnull) into v_slug_required
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.salons'::regclass
    and a.attname = 'slug'
    and a.attnum > 0
    and not a.attisdropped;
  ok := not exists (
    select 1 from public.salons s where nullif(btrim(coalesce(s.slug, '')), '') is null
  ) or coalesce(v_slug_required, false) = false;
  detail := case when coalesce(v_slug_required, false)
    then 'salons.slug is NOT NULL and every row is populated'
    else 'salons.slug is nullable in this schema shape' end;
  return next;

  check_name := 'grants unchanged: authenticated only';
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
  detail := 'authenticated may execute; anon/public may not'; return next;
end;
$$;

revoke all on function public.verify_m53_provision_salon_slug()
  from public, anon, authenticated;
grant execute on function public.verify_m53_provision_salon_slug() to service_role;

commit;
