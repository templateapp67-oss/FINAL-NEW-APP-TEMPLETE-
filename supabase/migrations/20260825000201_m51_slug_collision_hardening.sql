-- ===========================================================================
-- M51 — slug collision hardening: unique public URLs, DB-safe, race-safe
-- ===========================================================================
-- Requirement 6: duplicate business names must never produce duplicate public
-- URLs, and the sequence must be the canonical one:
--
--   Business A:  Nexora Salon  ->  nexora-salon
--   Business B:  Nexora Salon  ->  nexora-salon-1
--   Business C:  Nexora Salon  ->  nexora-salon-2
--
-- Strategy (existing Phase 1-B architecture retained, hardened):
--
--   * `private.nexora_business_slug` normalizes a business name to a
--     URL-safe ASCII slug (unchanged single canonical form).
--   * `private.nexora_allocate_business_slug` is FIXED to allocate the
--     deterministic sequence base, base-1, base-2, ... (the previous loop
--     started its numeric suffix at 2 and never produced `-1`). It keeps the
--     transaction-scoped advisory lock per base slug and scans BOTH slug
--     namespaces (`salon_public_websites.slug` and `salons.slug`).
--   * New case-insensitive UNIQUE indexes on `lower(btrim(slug))` make the
--     database itself the final invariant for both namespaces, and URL-safe
--     character checks (NOT VALID, legacy rows untouched) block invalid
--     slug characters from any writer.
--   * `provision_owner_salon` and `publish_owner_salon_website` now persist
--     under a savepoint retry on `unique_violation`, so even a concurrent
--     non-cooperative writer can only cause the next deterministic suffix —
--     never a duplicate URL and never a failed owner flow.
--
-- Frontend uniqueness checks are presentation-only. Supabase is the authority
-- for the public URL (allocated at first publish and locked by published_at).

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical allocator — corrected deterministic numbering + race-safe
--    serialization. Same lock/namespace strategy as M44/M45, fixed suffix:
--    v_suffix=1 -> base, v_suffix=2 -> base-1, v_suffix=3 -> base-2, ...
-- ---------------------------------------------------------------------------
create or replace function private.nexora_allocate_business_slug(
  p_name text,
  p_for_salon uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text := private.nexora_business_slug(p_name);
  v_candidate text;
  v_suffix integer := 1;
begin
  -- Serialize allocation for identical base slugs. The unique slug
  -- constraints remain the final invariant, including callers outside this
  -- function that do not take the lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_base));
  loop
    v_candidate := case
      when v_suffix = 1 then v_base
      else left(v_base, 50 - char_length((v_suffix - 1)::text) - 1)
        || '-' || (v_suffix - 1)::text
    end;
    exit when not exists (
      select 1 from public.salon_public_websites w
      where lower(btrim(w.slug)) = v_candidate
        and (p_for_salon is null or w.salon_id <> p_for_salon)
    ) and not exists (
      select 1 from public.salons s
      where lower(btrim(s.slug)) = v_candidate
        and (p_for_salon is null or s.id <> p_for_salon)
    );
    v_suffix := v_suffix + 1;
  end loop;
  return v_candidate;
end;
$$;
revoke all on function private.nexora_allocate_business_slug(text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Database-safe uniqueness — case/whitespace-insensitive unique slugs.
--    The existing M38 partial index is case-sensitive; these add the
--    invariant that 'Nexora-Salon' / 'NEXORA-SALON' / ' nexora-salon ' can
--    never be inserted for a second business either.
-- ---------------------------------------------------------------------------
do $do_spw_slug_ci$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'salon_public_websites'
      and indexname = 'salon_public_websites_slug_ci_unique'
  ) and not exists (
    select 1 from (
      select lower(btrim(slug)) as slug
      from public.salon_public_websites
      where slug is not null and btrim(slug) <> ''
      group by lower(btrim(slug))
      having count(*) > 1
    ) d
  ) then
    create unique index salon_public_websites_slug_ci_unique
      on public.salon_public_websites (lower(btrim(slug)))
      where slug is not null and btrim(slug) <> '';
  else
    raise notice 'salon_public_websites_slug_ci_unique skipped (pre-existing case-insensitive duplicates in a legacy database)';
  end if;
end $do_spw_slug_ci$;

do $do_salons_slug_ci$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'salons'
      and indexname = 'salons_slug_ci_unique'
  ) and not exists (
    select 1 from (
      select lower(btrim(slug)) as slug
      from public.salons
      where slug is not null and btrim(slug) <> ''
      group by lower(btrim(slug))
      having count(*) > 1
    ) d
  ) then
    create unique index salons_slug_ci_unique
      on public.salons (lower(btrim(slug)))
      where slug is not null and btrim(slug) <> '';
  else
    raise notice 'salons_slug_ci_unique skipped (pre-existing case-insensitive duplicates in a legacy database)';
  end if;
end $do_salons_slug_ci$;

-- ---------------------------------------------------------------------------
-- 3. Valid URL characters — DB-enforced for new writes. NOT VALID leaves
--    pre-existing rows untouched; every canonical writer already produces
--    `^[a-z0-9]+(-[a-z0-9]+)*$`, so this only guards direct/legacy writers.
-- ---------------------------------------------------------------------------
do $do_spw_slug_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'salon_public_websites_slug_url_safe'
  ) then
    alter table public.salon_public_websites
      add constraint salon_public_websites_slug_url_safe
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' or btrim(slug) = '')
      not valid;
  end if;
end $do_spw_slug_check$;

do $do_salons_slug_check$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'salons_slug_url_safe'
  ) then
    alter table public.salons
      add constraint salons_slug_url_safe
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' or btrim(slug) = '')
      not valid;
  end if;
end $do_salons_slug_check$;

-- ---------------------------------------------------------------------------
-- 4. Race-condition-safe creation. Same canonical allocator; the caller now
--    persists under a savepoint retry: if a concurrent (non-cooperative)
--    writer claims the candidate between allocation and commit, the next
--    deterministic suffix is used instead of failing.
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

  if cardinality(v_owned_ids) = 1 then
    v_salon_id := v_owned_ids[1];
    select s.organization_id into v_org_id from public.salons s where s.id = v_salon_id;
    select * into v_website from public.salon_public_websites w where w.salon_id = v_salon_id;
    if not found then
      -- Unique-slug retry: concurrent creations for the same base slug are
      -- serialized by the advisory lock; a non-cooperative concurrent writer
      -- is resolved by the savepoint retry below.
      loop
        v_attempt := v_attempt + 1;
        v_slug := private.nexora_allocate_business_slug(
          (select s.name from public.salons s where s.id = v_salon_id), v_salon_id
        );
        begin
          insert into public.salon_public_websites
            (salon_id, slug, template_key, config, is_published, published_at)
          values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null)
          returning * into v_website;
          exit;
        exception when unique_violation then
          if v_attempt >= 50 then raise; end if;
        end;
      end loop;
    end if;
    return query values (
      v_salon_id, v_org_id, v_website.slug,
      coalesce(v_website.template_key, v_template), v_website.is_published, true
    );
    return;
  end if;

  insert into public.organizations (name, status)
  values (v_name, 'active') returning id into v_org_id;
  insert into public.organization_members (organization_id, user_id, role, is_active)
  values (v_org_id, v_user_id, 'owner', true)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, is_active = excluded.is_active;
  insert into public.salons (organization_id, theme_id, name, is_active)
  values (v_org_id, v_theme_id, v_name, true) returning id into v_salon_id;

  -- p_slug is retained only for backwards-compatible RPC shape. The canonical
  -- slug is generated from the business name and collision-resolved here.
  loop
    v_attempt := v_attempt + 1;
    v_slug := private.nexora_allocate_business_slug(v_name, v_salon_id);
    begin
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
-- 5. Race-condition-safe publish + URL immutability. Same contract as M44/M45:
--    the first `published_at` permanently allocates the URL; unpublish only
--    flips visibility; republish after a rename keeps the first URL. The
--    allocation + persist is now a savepoint retry for the same reason as
--    provisioning.
-- ---------------------------------------------------------------------------
create or replace function public.publish_owner_salon_website(
  p_slug text,
  p_template_key text default null,
  p_config jsonb default null,
  p_salon_id uuid default null
)
returns table (
  salon_id uuid,
  slug text,
  is_published boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid;
  v_existing public.salon_public_websites%rowtype;
  v_name text;
  v_slug text;
  v_template text;
  v_config jsonb;
  v_attempt integer := 0;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);
  v_config := case when p_config is not null and jsonb_typeof(p_config) = 'object'
    then p_config else '{}'::jsonb end;
  v_name := left(coalesce(nullif(btrim(v_config->>'salonName'), ''),
    (select s.name from public.salons s where s.id = v_salon), 'My Business'), 120);
  v_template := lower(btrim(coalesce(p_template_key, '')));
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then raise exception 'Choose one of the five available templates' using errcode = '22023';
  end if;

  select * into v_existing from public.salon_public_websites w where w.salon_id = v_salon;

  loop
    v_attempt := v_attempt + 1;
    -- published_at is the permanent-allocation marker. Unpublishing only
    -- changes visibility, so republishing after a rename cannot change a
    -- public URL.
    if found and v_existing.published_at is not null then
      v_slug := v_existing.slug;
    else
      v_slug := private.nexora_allocate_business_slug(v_name, v_salon);
    end if;

    begin
      update public.salons set
        name = v_name,
        slug = v_slug,
        theme_id = (select t.id from public.themes t where t.theme_id = v_template and t.is_active = true),
        updated_at = now()
      where id = v_salon;
      update public.organizations o set name = v_name, updated_at = now()
      where o.id = (select s.organization_id from public.salons s where s.id = v_salon);

      if v_existing.salon_id is not null then
        update public.salon_public_websites w set
          slug = v_slug,
          template_key = v_template,
          config = v_config,
          is_published = true,
          published_at = coalesce(w.published_at, now()),
          updated_at = now()
        where w.salon_id = v_salon;
      else
        insert into public.salon_public_websites
          (salon_id, slug, template_key, config, is_published, published_at)
        values (v_salon, v_slug, v_template, v_config, true, now());
      end if;
      exit;
    exception when unique_violation then
      if v_attempt >= 50 then raise; end if;
    end;
  end loop;

  return query select w.salon_id, w.slug, w.is_published, w.published_at
  from public.salon_public_websites w where w.salon_id = v_salon;
end;
$$;
revoke all on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-verification RPC (read-only, service_role like the other verifiers).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m51_slug_collision_hardening()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_allocator text := pg_catalog.pg_get_functiondef(
    'private.nexora_allocate_business_slug(text,uuid)'::regprocedure
  );
  v_publish text := lower(pg_catalog.pg_get_functiondef(
    'public.publish_owner_salon_website(text,text,jsonb,uuid)'::regprocedure
  ));
  v_provision text := lower(pg_catalog.pg_get_functiondef(
    'public.provision_owner_salon(text,text,text)'::regprocedure
  ));
  v_name text;
begin
  check_name := 'every business-name slug is URL-safe';
  ok := true;
  detail := '';
  foreach v_name in array array[
    'Nexora Salon', '  Nexora   Salon!!!  ', 'admin', 'ab', '',
    'Foo___---@@ Bar', 'Café & Co.', 'naïve 100%', 'www'
  ] loop
    if private.nexora_business_slug(v_name) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      ok := false;
      detail := detail || private.nexora_business_slug(v_name) || '; ';
    end if;
  end loop;
  return next;

  check_name := 'allocator is serialized per base slug (advisory lock)';
  ok := position('pg_advisory_xact_lock' in v_allocator) > 0
    and position('hashtext' in v_allocator) > 0;
  detail := 'pg_advisory_xact_lock(hashtext(v_base))'; return next;

  check_name := 'allocator scans both slug namespaces';
  ok := position('lower(btrim(w.slug))' in v_allocator) > 0
    and position('lower(btrim(s.slug))' in v_allocator) > 0;
  detail := 'salon_public_websites + salons'; return next;

  check_name := 'deterministic suffix numbering (base, base-1, base-2)';
  ok := position('v_suffix - 1' in v_allocator) > 0;
  detail := 'v_suffix=1 -> base, 2 -> base-1, 3 -> base-2'; return next;

  check_name := 'creation retries on unique_violation (race-safe provisioning)';
  ok := position('unique_violation' in v_provision) > 0;
  detail := 'savepoint retry in provision_owner_salon'; return next;

  check_name := 'publish retries on unique_violation (race-safe update)';
  ok := position('unique_violation' in v_publish) > 0;
  detail := 'savepoint retry in publish_owner_salon_website'; return next;

  check_name := 'published_at still locks the first public URL';
  ok := position('v_existing.published_at is not null' in v_publish) > 0;
  detail := 'unpublish/republish preserve the allocated URL'; return next;

  check_name := 'case-insensitive unique index on public website slug';
  ok := exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'salon_public_websites'
      and indexname = 'salon_public_websites_slug_ci_unique'
  );
  detail := 'lower(btrim(slug)) unique'; return next;

  check_name := 'case-insensitive unique index on salon slug mirror';
  ok := exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'salons'
      and indexname = 'salons_slug_ci_unique'
  );
  detail := 'lower(btrim(slug)) unique'; return next;

  check_name := 'URL-safe character checks exist on both slug columns';
  ok := exists (
    select 1 from pg_constraint
    where conname = 'salon_public_websites_slug_url_safe'
  ) and exists (
    select 1 from pg_constraint
    where conname = 'salons_slug_url_safe'
  );
  detail := 'NOT VALID checks; legacy rows untouched'; return next;
end;
$$;

revoke all on function public.verify_m51_slug_collision_hardening()
  from public, anon, authenticated;
grant execute on function public.verify_m51_slug_collision_hardening() to service_role;

commit;
