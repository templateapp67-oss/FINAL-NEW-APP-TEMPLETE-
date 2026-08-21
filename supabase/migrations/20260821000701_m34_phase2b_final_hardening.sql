-- M34 / Phase 2B: final database schema hardening & verification
--
-- Closes the last verified gaps in the canonical unified foundation. All
-- changes are additive, idempotent, fail-closed, and reproduce on a fresh
-- database (M01 -> M34). No table is dropped, no data is deleted, no fake
-- records are created, no production ids are hardcoded.
--
-- 1. FK delete rules     — replace every CASCADE from business-owned tables
--                          to salons with RESTRICT; replace salon_media
--                          service/product composite CASCADEs with RESTRICT.
--                          Bookings/payments/orders already RESTRICT (M28/M29).
-- 2. Canonical roles     — ensure the TEXT+CHECK role constraints exist
--                          (profiles.platform_role 5-value, organization_members.role
--                          owner/staff). The shared schema has NO role enum;
--                          TEXT + CHECK is the canonical architecture used by
--                          both repositories (repo2 packages/auth/src/roles.ts
--                          mirrors the same five platform values).
-- 3. Soft delete         — re-assert deleted_at on every canonical mutable
--                          entity (salons, services, products, staff,
--                          salon_media, service_categories,
--                          product_categories). Payments, orders, webhooks,
--                          bookings and auth.users stay physically immutable
--                          for auditability. staff.deleted_at is required by
--                          the Main Website marketplace query (nexora-app.tsx
--                          fetchSalonMarketplace) but was missing from the
--                          canonical history — this migration closes that.
-- 4. updated_at          — add updated_at to organization_members; attach the
--                          safe phase2 trigger to it and to profiles when no
--                          existing BEFORE ROW trigger is present. Database-
--                          side timestamps only; INSERTs use DEFAULT now().
-- 5. Theme slug          — keep the established canonical slug
--                          'family_full_service' for the Full-Service Family
--                          Salon theme (seeded by M28/M32 and used by both
--                          repositories; the Phase 2B brief's
--                          'full_service_family_salon' wording is an
--                          example name, not a required value). Enforce
--                          uniqueness on themes.slug so any duplicate or
--                          inconsistent slug is rejected going forward.
-- 6. Active-record views — safe security-barrier projections
--                          active_services / active_products /
--                          active_service_categories with explicit active
--                          filters baked in; public-safe columns only.
-- 7. Indexes             — verified (see comments); partial indexes already
--                          cover the required shapes; EXPLAIN-verified in the
--                          Phase 2A/2B test suites.
--
-- Canonical entity decision (re-verified in Phase 2B): `salons` / `salon_id`.
-- A global search of nexora-main-website found NO businesses/business_id code
-- references (one prose comment was the only occurrence); every query, type
-- and route in both repositories already uses salons/salon_id. No
-- compatibility view is therefore needed — creating one would be a duplicate
-- API.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight.
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles', 'organizations', 'organization_members', 'salons',
    'themes', 'service_categories', 'services', 'products',
    'product_categories', 'salon_media', 'business_locations', 'bookings'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception
        'Phase 2B preflight: required canonical table public.% is missing.',
        required_table;
    end if;
  end loop;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. FOREIGN KEY DELETE RULES (§2): no accidental cascade of business data.
--    First drop every single-column CASCADE FK pointing at salons on the
--    business-owned tables (discovered by catalog, so it works whether the
--    live 2026-08-04 migrations or the M28 definitions are present).
-- ---------------------------------------------------------------------------
do $fk_cascade_drop$
declare
  r record;
begin
  for r in
    select
      c.conrelid::regclass::text as tbl,
      c.conname as fkname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.confdeltype = 'c'
      and c.confrelid = 'public.salons'::regclass
      and array_length(c.conkey, 1) = 1
      and a.attname = 'salon_id'
      and c.conrelid::regclass::text in (
        'public.services', 'public.staff', 'public.offers',
        'public.salon_hours', 'public.salon_public_websites',
        'public.business_locations', 'public.salon_media'
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.fkname);
  end loop;
end
$fk_cascade_drop$;

-- Add the named RESTRICT FK when no RESTRICT/NO ACTION FK already exists on
-- the same column. (M28 environments already have one; live environments
-- that only had CASCADE get the hardened one here.)
do $fk_restrict_add$
declare
  target record;
begin
  for target in
    select * from (values
      ('services',              'services_salon_phase2b_fk'),
      ('staff',                 'staff_salon_phase2b_fk'),
      ('offers',                'offers_salon_phase2b_fk'),
      ('salon_hours',           'salon_hours_salon_phase2b_fk'),
      ('salon_public_websites', 'salon_public_websites_salon_phase2b_fk'),
      ('business_locations',    'business_locations_salon_phase2b_fk'),
      ('salon_media',           'salon_media_salon_phase2b_fk')
    ) as t(table_name, constraint_name)
  loop
    if to_regclass('public.' || target.table_name) is not null
       and not exists (
         select 1
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
         where c.conrelid = to_regclass('public.' || target.table_name)
           and c.contype = 'f'
           and c.confrelid = 'public.salons'::regclass
           and a.attname = 'salon_id'
           and c.confdeltype in ('r', 'n')
       ) then
      execute format(
        'alter table public.%I add constraint %I
         foreign key (salon_id) references public.salons(id) on delete restrict',
        target.table_name, target.constraint_name
      );
    end if;
  end loop;
end
$fk_restrict_add$;

-- salon_media attaches derived assets to services/products: replace the
-- M28 composite CASCADE FKs with RESTRICT so a hard delete of a service or
-- product that still has media is refused (the supported path is soft
-- delete via deleted_at).
do $media_composite_fk$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.salon_media'::regclass
      and conname = 'salon_media_service_tenant_fk'
      and confdeltype = 'c'
  ) then
    alter table public.salon_media drop constraint salon_media_service_tenant_fk;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.salon_media'::regclass
      and conname = 'salon_media_product_tenant_fk'
      and confdeltype = 'c'
  ) then
    alter table public.salon_media drop constraint salon_media_product_tenant_fk;
  end if;

  -- services(id, salon_id) and products(id, salon_id) unique pairs are
  -- guaranteed by M28 (unique index/constraint); the composite FKs are only
  -- re-added when the pair exists (pre-M28 environments skip them safely).
  if to_regclass('public.services') is not null
     and exists (
       select 1
       from pg_index i
       where i.indrelid = 'public.services'::regclass
         and i.indisunique
         and i.indnkeyatts = 2
         and i.indkey::smallint[] @> array[
           (select attnum::smallint from pg_attribute
             where attrelid = 'public.services'::regclass and attname = 'id'),
           (select attnum::smallint from pg_attribute
             where attrelid = 'public.services'::regclass and attname = 'salon_id')
         ]
     )
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.salon_media'::regclass
         and conname = 'salon_media_service_phase2b_fk'
     ) then
    alter table public.salon_media
      add constraint salon_media_service_phase2b_fk
      foreign key (service_id, salon_id) references public.services(id, salon_id)
      on delete restrict;
  end if;

  if to_regclass('public.products') is not null
     and exists (
       select 1
       from pg_index i
       where i.indrelid = 'public.products'::regclass
         and i.indisunique
         and i.indnkeyatts = 2
         and i.indkey::smallint[] @> array[
           (select attnum::smallint from pg_attribute
             where attrelid = 'public.products'::regclass and attname = 'id'),
           (select attnum::smallint from pg_attribute
             where attrelid = 'public.products'::regclass and attname = 'salon_id')
         ]
     )
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.salon_media'::regclass
         and conname = 'salon_media_product_phase2b_fk'
     ) then
    alter table public.salon_media
      add constraint salon_media_product_phase2b_fk
      foreign key (product_id, salon_id) references public.products(id, salon_id)
      on delete restrict;
  end if;
end
$media_composite_fk$;

-- ---------------------------------------------------------------------------
-- 2. CANONICAL ROLE SYSTEM (§4): TEXT + CHECK is the canonical role
--    representation in the shared schema (no enum exists). Ensure the two
--    authoritative checks exist. Both repositories read the same columns.
-- ---------------------------------------------------------------------------
do $role_checks$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_platform_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_platform_role_check
      check (platform_role in (
        'customer', 'business_user', 'growth_partner', 'delivery_partner', 'admin'
      )) not valid;
    alter table public.profiles validate constraint profiles_platform_role_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_role_check'
  ) then
    alter table public.organization_members
      add constraint organization_members_role_check
      check (role in ('owner', 'staff')) not valid;
    alter table public.organization_members validate constraint organization_members_role_check;
  end if;
end
$role_checks$;

-- ---------------------------------------------------------------------------
-- 3. SOFT DELETE (§5): re-assert the unified deleted_at column set.
-- ---------------------------------------------------------------------------
do $soft_delete_assert$
declare
  target text;
begin
  foreach target in array array[
    'salons', 'services', 'products', 'staff', 'salon_media',
    'service_categories', 'product_categories'
  ] loop
    if to_regclass('public.' || target) is not null then
      execute format(
        'alter table public.%I add column if not exists deleted_at timestamptz',
        target
      );
    end if;
  end loop;
end
$soft_delete_assert$;

-- ---------------------------------------------------------------------------
-- 4. UPDATED_AT AUTOMATION (§7): database-side timestamps.
--    organization_members gains updated_at; profiles and organization_members
--    get the safe trigger when no existing BEFORE ROW trigger is present
--    (the Main Website ships its own profiles trigger on live data).
-- ---------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists updated_at timestamptz not null default now();

do $updated_at_triggers_2b$
declare
  target record;
begin
  for target in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in (
        'profiles', 'organizations', 'organization_members', 'salons',
        'themes', 'service_categories', 'services', 'products',
        'product_categories', 'business_locations'
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
      and not exists (
        select 1 from pg_trigger tr
        where tr.tgrelid = to_regclass('public.' || t.table_name)
          and tr.tgname = 'trg_phase2_set_updated_at'
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
$updated_at_triggers_2b$;

-- ---------------------------------------------------------------------------
-- 5. THEME SLUG (§8): the canonical slug for the Full-Service Family Salon
--    theme stays 'family_full_service' (M28/M32 seed, both repositories'
--    type layers). No rename is performed — changing it would churn data and
--    application references for zero benefit. Uniqueness on themes.slug is
--    enforced by the M32 constraint, re-asserted below.
-- ---------------------------------------------------------------------------
do $theme_slug_assert$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.themes'::regclass
      and conname = 'themes_slug_unique'
  ) then
    alter table public.themes add constraint themes_slug_unique unique (slug);
  end if;
end
$theme_slug_assert$;

-- ---------------------------------------------------------------------------
-- 6. ACTIVE-RECORD VIEWS (§6): safe, self-contained public projections.
--    Security-barrier + owner-rights like M28's public_salon_catalog; every
--    safety filter is baked into the view body, and only public-safe columns
--    are granted. These are read-only conveniences over the canonical tables
--    — not duplicate data or a second API.
-- ---------------------------------------------------------------------------
create or replace view public.active_services
with (security_barrier = true)
as
select
  s.id, s.salon_id, s.theme_id, s.category_id, s.name, s.description,
  s.price_paise, s.duration_minutes, s.is_active, s.is_featured,
  s.display_order, s.created_at, s.updated_at
from public.services s
where s.is_active = true
  and s.deleted_at is null
  and exists (
    select 1 from public.salons salon
    where salon.id = s.salon_id
      and salon.is_active = true
      and salon.deleted_at is null
  );

create or replace view public.active_products
with (security_barrier = true)
as
select
  p.id, p.salon_id, p.category_id, p.theme_id, p.name, p.description,
  p.price_paise, p.currency, p.is_active, p.is_featured, p.display_order,
  p.created_at, p.updated_at
from public.products p
where p.is_active = true
  and p.deleted_at is null
  and exists (
    select 1 from public.salons salon
    where salon.id = p.salon_id
      and salon.is_active = true
      and salon.deleted_at is null
  );

create or replace view public.active_service_categories
with (security_barrier = true)
as
select
  c.id, c.theme_id, c.slug, c.name, c.sort_order, c.is_active,
  c.created_at, c.updated_at
from public.service_categories c
where c.is_active = true
  and c.deleted_at is null
  and exists (
    select 1 from public.themes t
    where t.id = c.theme_id and t.is_active = true
  );

revoke all on public.active_services, public.active_products,
  public.active_service_categories from public, anon, authenticated;
grant select (id, salon_id, theme_id, category_id, name, description,
  price_paise, duration_minutes, is_active, is_featured, display_order,
  created_at, updated_at)
  on public.active_services to anon, authenticated;
grant select (id, salon_id, category_id, theme_id, name, description,
  price_paise, currency, is_active, is_featured, display_order,
  created_at, updated_at)
  on public.active_products to anon, authenticated;
grant select (id, theme_id, slug, name, sort_order, is_active,
  created_at, updated_at)
  on public.active_service_categories to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. INDEXES (§11): verified rather than duplicated.
--    - services:             services_phase2a_salon_active_idx
--                            (salon_id, is_active) WHERE deleted_at IS NULL
--    - products:             products_salon_active_order_idx
--                            (salon_id, is_active, display_order) WHERE deleted_at IS NULL
--    - service_categories:   service_categories_phase2a_theme_active_idx
--                            (theme_id, is_active, sort_order, id) WHERE deleted_at IS NULL
--                            (categories are theme-global by design — the
--                            salon+theme isolation lives on services/products
--                            via composite FKs, so no salon_id here)
--    - organization_members: named unique constraint index
--    - bookings:             bookings_salon_start_status_idx
--                            (salon_id, appointment_start, status) [M28]
--    - locations:            business_locations_approved_coordinates_idx
--                            partial B-tree on (latitude, longitude) where
--                            approval_status='approved' [M28] — the actual
--                            nearby search is a client-side Haversine over
--                            approved rows; a B-tree is NOT claimed as a
--                            radius-search solution and PostGIS is not
--                            enabled blindly (not present in the project).
-- ---------------------------------------------------------------------------

commit;
