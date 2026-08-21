-- M32 / Phase 2: canonical unified database foundation — reconciliation layer
--
-- Phase 2 completes the canonical foundation shared by BOTH repositories
-- (this Template application and the Main Website) on ONE Supabase database:
--
--   profiles -> organization_members -> organizations -> salons
--                                                         |-> business_locations
--                                                         |-> services  (-> service_categories -> themes)
--                                                         |-> products  (-> product_categories)
--                                                         `-> themes    (salons.theme_id, authoritative selection)
--
-- Phase 1A (M28–M31) already created/reconciled the roots (identity, roles,
-- membership, salons, services, products, locations, themes, categories and
-- their ownership FKs). This migration ONLY closes the remaining canonical
-- gaps, all additively:
--
--   1. themes.slug            (stable public slug, unique)      — Phase 2 §9
--   2. service_categories.slug (stable slug, unique per theme)  — Phase 2 §11
--   3. salons.theme_id FK      (authoritative salon theme)      — Phase 2 §10
--   4. organizations.status/created_at/updated_at               — Phase 2 §5
--   5. organization_members.created_at                          — Phase 2 §6
--   6. business_locations.created_at (backfilled from submitted_at) — §8
--   7. services.created_at/updated_at where absent              — Phase 2 §12
--   8. safe database-side updated_at triggers                   — Phase 2 §18
--   9. targeted indexes for the new relationships               — Phase 2 §17
--
-- Rules honoured: no duplicate entities, no parallel tenant hierarchy, no
-- destructive DDL, no fake data, no hardcoded production ids, migrations only.
-- RLS stays as Phase 1A left it (deep policy work is Phase 3).

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed instead of creating a parallel foundation.
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_table text;
  required_column record;
begin
  foreach required_table in array array[
    'profiles', 'organizations', 'organization_members', 'salons',
    'themes', 'service_categories', 'services', 'products', 'business_locations'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception
        'Phase 2 preflight: required canonical table public.% is missing. Reconcile the existing object instead of creating a competing model.',
        required_table;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('profiles', 'id'),
      ('profiles', 'full_name'),
      ('profiles', 'platform_role'),
      ('profiles', 'is_active'),
      ('organizations', 'id'),
      ('organizations', 'name'),
      ('organization_members', 'organization_id'),
      ('organization_members', 'user_id'),
      ('organization_members', 'role'),
      ('salons', 'id'),
      ('salons', 'organization_id'),
      ('salons', 'name'),
      ('salons', 'is_active'),
      ('salons', 'deleted_at'),
      ('themes', 'id'),
      ('themes', 'theme_id'),
      ('themes', 'name'),
      ('themes', 'is_active'),
      ('service_categories', 'id'),
      ('service_categories', 'theme_id'),
      ('service_categories', 'name'),
      ('services', 'id'),
      ('services', 'salon_id'),
      ('services', 'name'),
      ('services', 'price_paise'),
      ('services', 'duration_minutes'),
      ('products', 'id'),
      ('products', 'salon_id'),
      ('products', 'name'),
      ('products', 'price_paise'),
      ('business_locations', 'salon_id'),
      ('business_locations', 'latitude'),
      ('business_locations', 'longitude'),
      ('business_locations', 'approval_status')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required_column.table_name
        and c.column_name = required_column.column_name
    ) then
      raise exception
        'Phase 2 preflight: required canonical column public.%.% is missing. Reconcile the existing object instead of creating a competing model.',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;
end
$preflight$;

-- The five canonical application themes must already exist (seeded by M28).
-- This migration NEVER inserts theme rows — it only adds the stable slug to
-- the existing single theme table, so duplicate theme records are impossible.
do $theme_preflight$
declare
  missing_theme_id text;
begin
  select t.theme_id into missing_theme_id
  from unnest(array[
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio'
  ]::text[]) as wanted(theme_id)
  left join public.themes t on t.theme_id = wanted.theme_id
  where t.id is null
  limit 1;

  if missing_theme_id is not null then
    raise exception
      'Phase 2 preflight: canonical theme % is missing from public.themes. Reconcile the theme catalog instead of seeding a duplicate.',
      missing_theme_id;
  end if;
end
$theme_preflight$;

-- ---------------------------------------------------------------------------
-- 1. THEMES (§9): stable slug on the existing single theme table.
--    theme_id is the stable identifier; slug is the stable public key.
--    Backfill keeps slug identical to theme_id so existing references stay
--    unambiguous, then a unique constraint locks it forever.
-- ---------------------------------------------------------------------------
alter table public.themes
  add column if not exists slug text;

update public.themes
set slug = theme_id
where slug is null or btrim(slug) = '';

alter table public.themes
  alter column slug set not null;

do $theme_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.themes'::regclass
      and conname = 'themes_slug_unique'
  ) then
    -- Backfill above guarantees uniqueness; PostgreSQL forbids NOT VALID on
    -- unique constraints, so this is added validated directly.
    alter table public.themes
      add constraint themes_slug_unique unique (slug);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.themes'::regclass
      and conname = 'themes_slug_check'
  ) then
    alter table public.themes
      add constraint themes_slug_check
      check (
        btrim(slug) <> ''
        and slug = lower(slug)
        and slug ~ '^[a-z0-9][a-z0-9_-]*$'
      ) not valid;
  end if;
end
$theme_constraints$;

alter table public.themes validate constraint themes_slug_check;

-- ---------------------------------------------------------------------------
-- 2. SERVICE CATEGORIES (§11): stable slug unique WITHIN a theme, plus the
--    active/display-order surface already shipped by M28/M16 (is_active,
--    sort_order). Slug is derived from the category name; name collisions
--    that slugify identically get a deterministic numeric suffix so the
--    unique (theme_id, slug) constraint can never be blocked by legacy rows.
-- ---------------------------------------------------------------------------
alter table public.service_categories
  add column if not exists slug text;

do $category_slug_backfill$
declare
  category_row record;
  base_slug text;
  candidate text;
  suffix integer;
begin
  for category_row in
    select sc.id, sc.theme_id, sc.name
    from public.service_categories sc
    where sc.slug is null or btrim(sc.slug) = ''
    order by sc.theme_id, sc.sort_order, sc.id
  loop
    base_slug := regexp_replace(
      lower(btrim(category_row.name)),
      '[^a-z0-9]+', '-', 'g'
    );
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    if base_slug = '' then base_slug := 'category'; end if;

    candidate := base_slug;
    suffix := 2;
    while exists (
      select 1
      from public.service_categories sc
      where sc.theme_id = category_row.theme_id
        and sc.slug = candidate
        and sc.id <> category_row.id
    ) loop
      candidate := base_slug || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.service_categories
    set slug = candidate
    where id = category_row.id;
  end loop;
end
$category_slug_backfill$;

alter table public.service_categories
  alter column slug set not null;

do $category_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_categories'::regclass
      and conname = 'service_categories_theme_slug_unique'
  ) then
    -- Backfill above guarantees per-theme uniqueness (duplicate slugs got a
    -- deterministic numeric suffix); added validated directly for the same
    -- reason PostgreSQL forbids NOT VALID unique constraints.
    alter table public.service_categories
      add constraint service_categories_theme_slug_unique
      unique (theme_id, slug);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_categories'::regclass
      and conname = 'service_categories_slug_check'
  ) then
    alter table public.service_categories
      add constraint service_categories_slug_check
      check (
        btrim(slug) <> ''
        and slug = lower(slug)
        and slug ~ '^[a-z0-9][a-z0-9_-]*$'
      ) not valid;
  end if;
end
$category_constraints$;

alter table public.service_categories
  validate constraint service_categories_slug_check;

-- ---------------------------------------------------------------------------
-- 3. SALONS (§7, §10): database-authoritative selected theme.
--    The salon's selected theme lives on the canonical salons row (not only
--    in frontend state or website config). NULL means "not selected yet" —
--    existing rows are never force-assigned a theme. The RPC below is the
--    only sanctioned way to set it and it re-uses the Phase 1A ownership
--    helper, so a client can never bind a salon to an arbitrary theme.
-- ---------------------------------------------------------------------------
alter table public.salons
  add column if not exists theme_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $salon_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salons'::regclass
      and conname = 'salons_theme_phase2_fk'
  ) then
    alter table public.salons
      add constraint salons_theme_phase2_fk
      foreign key (theme_id) references public.themes(id)
      on delete restrict not valid;
  end if;
end
$salon_constraints$;

alter table public.salons validate constraint salons_theme_phase2_fk;

create index if not exists salons_theme_phase2_idx
  on public.salons (theme_id)
  where theme_id is not null and deleted_at is null;

create or replace function public.phase2_set_salon_theme(
  p_salon_id uuid,
  p_theme_id uuid
)
returns table (salon_id uuid, theme_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  theme_exists boolean;
begin
  if p_salon_id is null or p_theme_id is null then
    raise exception 'Salon id and theme id are required';
  end if;

  -- Authorization: salon owners (or service_role). Reuses the Phase 1A
  -- helper; a plain browser user cannot rebind a salon's theme.
  if coalesce(auth.role(), '') <> 'service_role'
     and not private.can_manage_salon_settings(p_salon_id) then
    raise exception 'Salon owner permission required to set the salon theme';
  end if;

  select exists (
    select 1 from public.themes t
    where t.id = p_theme_id and t.is_active = true
  ) into theme_exists;
  if not theme_exists then
    raise exception 'Theme not found or inactive';
  end if;

  update public.salons s
  set theme_id = p_theme_id,
      updated_at = now()
  where s.id = p_salon_id
    and s.deleted_at is null;

  if not found then
    raise exception 'Salon not found';
  end if;

  return query
    select s.id, s.theme_id
    from public.salons s
    where s.id = p_salon_id;
end
$$;

revoke all on function public.phase2_set_salon_theme(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.phase2_set_salon_theme(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. ORGANIZATIONS (§5): status + database timestamps.
--    status is additive (default 'active'); no existing row is rewritten.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $organization_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organizations'::regclass
      and conname = 'organizations_status_check'
  ) then
    alter table public.organizations
      add constraint organizations_status_check
      check (status in ('active', 'inactive', 'archived')) not valid;
  end if;
end
$organization_constraints$;

alter table public.organizations validate constraint organizations_status_check;

-- ---------------------------------------------------------------------------
-- 5. ORGANIZATION MEMBERS (§6): created_at for the canonical membership row.
--    Duplicate membership is already impossible: M28 shipped the unique
--    (organization_id, user_id) index.
-- ---------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 6. BUSINESS LOCATIONS (§8): created_at, backfilled from the existing
--    owner submission timestamp so history is preserved on live data.
-- ---------------------------------------------------------------------------
alter table public.business_locations
  add column if not exists created_at timestamptz;

update public.business_locations
set created_at = submitted_at
where created_at is null and submitted_at is not null;

update public.business_locations
set created_at = now()
where created_at is null;

alter table public.business_locations
  alter column created_at set not null,
  alter column created_at set default now();

-- ---------------------------------------------------------------------------
-- 7. SERVICES (§12): database timestamps where the live table lacks them.
--    All Phase 2 §12 fields (theme/category provenance, price, duration,
--    active, display_order, deleted_at) already exist after M28.
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 8. DATABASE-SIDE TIMESTAMPS (§18): one safe trigger function, attached
--    only to canonical mutable tables that carry updated_at and do not
--    already have a row-level BEFORE trigger of their own (e.g. the Main
--    Website already ships trg_services_updated_at / trg_bookings_updated_at
--    on live data — those tables are left untouched).
-- ---------------------------------------------------------------------------
create or replace function private.phase2_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

revoke all on function private.phase2_set_updated_at()
  from public, anon, authenticated;

do $updated_at_triggers$
declare
  target record;
begin
  for target in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'organizations', 'salons', 'themes', 'service_categories',
        'services', 'products', 'product_categories', 'business_locations'
      )
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = t.table_name
          and c.column_name = 'updated_at'
      )
      and not exists (
        select 1 from pg_trigger tr
        where tr.tgrelid = to_regclass('public.' || t.table_name)
          and not tr.tgisinternal
          and (tr.tgtype & 1) = 1 -- ROW
          and (tr.tgtype & 2) = 2 -- BEFORE
      )
    order by t.table_name
  loop
    execute format(
      'create trigger trg_phase2_set_updated_at
       before update on public.%I
       for each row execute function private.phase2_set_updated_at()',
      target.table_name
    );
  end loop;
end
$updated_at_triggers$;

-- ---------------------------------------------------------------------------
-- 9. INDEXES (§17): new relationships only. Tenant/active/geo indexes were
--    shipped by M28 (salons.organization_id, services.salon_id+theme_id,
--    products.salon_id, categories.theme_id, membership user_id,
--    approved lat/lng). Products additionally get a theme index because its
--    composite category FK does not auto-create one.
-- ---------------------------------------------------------------------------
create index if not exists products_theme_phase2_idx
  on public.products (theme_id)
  where theme_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 10. PUBLIC-SAFE COLUMN GRANTS (§22): expose only the new public-safe
--     columns to anon/authenticated, mirroring the Phase 1A grant style.
--     Themes/categories stay readable through their existing RLS policies.
-- ---------------------------------------------------------------------------
grant select (id, theme_id, slug, name, description, target_audience,
  ui_config, sort_order, is_active, created_at, updated_at)
  on public.themes to anon, authenticated;
grant select (slug) on public.service_categories to anon, authenticated;
grant select (created_at) on public.business_locations to anon, authenticated;

commit;
