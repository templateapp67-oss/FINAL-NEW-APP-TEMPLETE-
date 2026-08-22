-- ============================================================================
-- M40 — Supabase SQL Editor में यही पूरा paste करो (service catalog + commerce RPCs)
-- ============================================================================
-- 1. नया query tab खोलो (पुराना SQL मत चलाओ)
-- 2. इस फाइल का ALL text copy (Ctrl+A) — बीच का टुकड़ा नहीं
-- 3. Paste करो। पहली लाइन begin; आखिरी commit;
-- 4. Selection हटाओ, Run
-- 5. Success के बाद नीचे 17 verification rows, सब ok = true
--
-- यह माइग्रेशन Step 5 के दोनों errors ठीक करता है:
--   "Unable to load pricing and promotions."  (get_theme_commerce RPC missing)
--   "Unable to add this service."             (create_saved_service RPC missing)
-- ============================================================================

-- M40 (Design B) / Phase 7.4–9.3 reconciliation: service catalog + saved-service
-- management + pricing/promotions RPC surface, ported onto the canonical
-- (salon-keyed) schema.
--
-- WHY THIS EXISTS
-- --------------
-- The live project runs the canonical Design-B schema (M28–M39). The Step 5
-- "Services & Packages" builder calls Supabase RPCs that were drafted in the
-- Design-A chain (M16–M26: get_theme_service_catalog, get_theme_commerce,
-- create_saved_service, save_predefined_services, …) but those migrations were
-- NEVER applied to the live database. Every call therefore fails with a
-- PostgREST "function not found" error, which the client surfaces as:
--   • "Unable to load pricing and promotions."   (get_theme_commerce)
--   • "Unable to add this service."              (create_saved_service)
-- M40 re-creates that surface against the LIVE schema so the deployed app can
-- load catalogs, save services and manage pricing/promotions again.
--
-- PORTING RULES (Design A → Design B)
-- -----------------------------------
--   * Tenant key: `business_id` → `salons.id` (`salon_id`). The JSON payloads
--     keep the key name `business_id` (now holding the canonical salon UUID)
--     so the existing client mappers keep working unchanged.
--   * Tenant resolution: `nexora_current_manageable_business_id()`
--     (business_members) → `private.nexora_manageable_salon_id()`
--     (owner_salon_ids() ← organization_members). A client-supplied salon id
--     is never accepted.
--   * `services.status` (draft) → canonical `is_active` + `deleted_at`:
--         active    → is_active = true,  deleted_at = null
--         inactive  → is_active = false, deleted_at = null
--         archived  → is_active = false, deleted_at = now()
--     Read payloads re-derive the draft `status` string so the client contract
--     ('active' | 'inactive' | 'archived') is unchanged.
--   * Audit trail: `business_activity` (Design A) → `salon_service_activity`
--     (created here).
--   * Booking safety lock: draft `bookings.service_id`/`business_id` →
--     canonical `booking_services` line items + `bookings.salon_id`.
--
-- SAFETY
-- ------
-- Idempotent (CREATE … IF NOT EXISTS / add column if not exists / guarded
-- constraints). No DROP TABLE, no DELETE, no UPDATE of existing owner rows.
-- Fails closed with readable messages when canonical roots are missing.
-- NOT applied to any database by this repo — apply via the SQL editor using
-- docs/m40-run-in-supabase.sql, then run verify_m40_service_catalog().

begin;

-- ===========================================================================
-- 0. Preflight — the canonical Design-B roots this surface builds on.
-- ===========================================================================
do $m40_preflight$
declare
  required_table text;
begin
  foreach required_table in array array[
    'salons', 'services', 'themes', 'service_categories',
    'organization_members', 'profiles'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception using
        errcode = '55000',
        message = format(
          'M40 preflight: canonical table public.%s is missing. Apply the M28–M39 Design-B chain before M40.',
          required_table
        );
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'services' and column_name = 'salon_id'
  ) then
    raise exception using
      errcode = '55000',
      message = 'M40 preflight: public.services has no salon_id column. The live schema is not the canonical Design-B shape.';
  end if;

  if to_regprocedure('public.owner_salon_ids()') is null then
    raise exception using
      errcode = '55000',
      message = 'M40 preflight: owner_salon_ids() is missing. Apply M38 (reconciliation) before M40.';
  end if;
end
$m40_preflight$;

-- ===========================================================================
-- 1. Shared enums (idempotent).
-- ===========================================================================
do $$ begin
  create type public.nexora_catalog_status as enum ('active', 'inactive', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_discount_type as enum ('percentage', 'fixed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_offer_target as enum (
    'theme', 'category', 'predefined_service', 'saved_service', 'bundle'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_content_locale as enum ('en', 'hi');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_catalog_entity as enum ('category', 'predefined_service');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_service_media_kind as enum ('image', 'banner', 'icon');
exception when duplicate_object then null;
end $$;

-- Shared updated_at helper (Design A defined it in M11; the live schema may or
-- may not have it, so create it idempotently).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ===========================================================================
-- 2. Align the canonical `services` table with the RPC surface.
--    Only additive, idempotent changes. Existing rows are never rewritten.
-- ===========================================================================
alter table public.services
  add column if not exists category text,
  add column if not exists short_description text,
  add column if not exists promotional_badge text,
  add column if not exists created_at timestamptz not null default now();

-- Composite uniqueness used by the canonical composite foreign keys below.
-- `id` is already the primary key, so these indexes are always satisfiable.
create unique index if not exists services_id_salon_key
  on public.services (id, salon_id);
create unique index if not exists services_id_salon_theme_key
  on public.services (id, salon_id, theme_id);

-- One salon cannot save the same predefined service twice.
do $m40_predefined_dup_guard$
begin
  if exists (
    select 1
    from public.services
    where predefined_service_id is not null
    group by salon_id, predefined_service_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce saved-service uniqueness: duplicate predefined links already exist. Inspect them before applying M40.';
  end if;
end
$m40_predefined_dup_guard$;

create unique index if not exists services_salon_predefined_unique
  on public.services (salon_id, predefined_service_id)
  where predefined_service_id is not null and deleted_at is null;

-- One salon cannot save the same custom (predefined_service_id NULL) name
-- twice inside one theme. Archived rows are excluded so an owner can recreate
-- a retired service.
do $m40_custom_name_dup_guard$
begin
  if exists (
    select 1
    from public.services
    where predefined_service_id is null
      and theme_id is not null
      and deleted_at is null
    group by salon_id, theme_id, lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce custom saved-service uniqueness: duplicate theme-scoped custom service names already exist. Inspect and rename them without deleting owner data before applying M40.';
  end if;
end
$m40_custom_name_dup_guard$;

create unique index if not exists services_salon_theme_custom_name_unique
  on public.services (salon_id, theme_id, lower(btrim(name)))
  where predefined_service_id is null
    and theme_id is not null
    and deleted_at is null;

create index if not exists services_salon_theme_active_idx
  on public.services (salon_id, theme_id, is_active, display_order)
  where deleted_at is null;

-- ===========================================================================
-- 3. Global five-theme catalog table.
-- ===========================================================================
create table if not exists public.predefined_services (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null,
  category_id uuid not null,
  name text not null,
  description text,
  is_suggested boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  suggested_label text,
  suggested_sort_order integer,
  default_price_paise bigint,
  default_duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predefined_services_theme_fk
    foreign key (theme_id) references public.themes(id) on delete restrict,
  constraint predefined_services_category_theme_fk
    foreign key (category_id, theme_id)
    references public.service_categories(id, theme_id) on delete restrict,
  constraint predefined_services_theme_name_key unique (theme_id, name),
  constraint predefined_services_name_not_blank check (btrim(name) <> ''),
  constraint predefined_services_sort_order_nonnegative check (sort_order >= 0)
);

-- M18-era columns / constraints (idempotent re-align).
alter table public.predefined_services
  add column if not exists suggested_label text,
  add column if not exists suggested_sort_order integer,
  add column if not exists default_price_paise bigint,
  add column if not exists default_duration_minutes integer;

do $m40_predefined_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_id_theme_key'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_id_theme_key unique (id, theme_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_label_not_blank'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_label_not_blank
      check (suggested_label is null or btrim(suggested_label) <> '') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_order_nonnegative'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_order_nonnegative
      check (suggested_sort_order is null or suggested_sort_order >= 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_metadata_pair'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_metadata_pair
      check ((suggested_label is null) = (suggested_sort_order is null)) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_metadata_flag'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_metadata_flag
      check (is_suggested or (suggested_label is null and suggested_sort_order is null)) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_default_price_nonnegative'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_default_price_nonnegative
      check (default_price_paise is null or default_price_paise >= 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_default_duration_positive'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_default_duration_positive
      check (default_duration_minutes is null or default_duration_minutes > 0) not valid;
  end if;
end
$m40_predefined_constraints$;

create index if not exists idx_predefined_services_suggested_order
  on public.predefined_services (theme_id, suggested_sort_order, id)
  where is_active and is_suggested;

-- ===========================================================================
-- 4. Commerce tables (canonical, salon-keyed).
-- ===========================================================================
-- 4.1 Packages / bundles.
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid,
  theme_id uuid,
  category_id uuid,
  name text not null,
  description text,
  original_price_paise bigint,
  price_paise bigint not null,
  duration_minutes integer,
  discount_type public.nexora_discount_type,
  discount_percentage numeric(5,2),
  fixed_discount_paise bigint,
  promotional_badge text,
  status public.nexora_catalog_status not null default 'active',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_name_not_blank check (btrim(name) <> ''),
  constraint packages_price_nonnegative check (price_paise >= 0),
  constraint packages_order_nonnegative check (display_order >= 0)
);

alter table public.packages
  add column if not exists salon_id uuid,
  add column if not exists theme_id uuid,
  add column if not exists category_id uuid,
  add column if not exists original_price_paise bigint,
  add column if not exists discount_type public.nexora_discount_type,
  add column if not exists discount_percentage numeric(5,2),
  add column if not exists fixed_discount_paise bigint,
  add column if not exists promotional_badge text,
  add column if not exists status public.nexora_catalog_status not null default 'active',
  add column if not exists display_order integer not null default 0;

create unique index if not exists packages_id_salon_theme_key
  on public.packages (id, salon_id, theme_id)
  where salon_id is not null and theme_id is not null;

do $m40_package_constraints$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'packages' and column_name = 'salon_id')
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.packages'::regclass and conname = 'packages_salon_fk'
     ) then
    alter table public.packages add constraint packages_salon_fk
      foreign key (salon_id) references public.salons(id) on delete restrict not valid;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'packages' and column_name = 'theme_id')
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.packages'::regclass and conname = 'packages_theme_fk'
     ) then
    alter table public.packages add constraint packages_theme_fk
      foreign key (theme_id) references public.themes(id) on delete restrict not valid;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'packages' and column_name = 'category_id')
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.packages'::regclass and conname = 'packages_category_theme_fk'
     ) then
    alter table public.packages add constraint packages_category_theme_fk
      foreign key (category_id, theme_id)
      references public.service_categories(id, theme_id) on delete restrict not valid;
  end if;
end
$m40_package_constraints$;

create table if not exists public.package_services (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  service_id uuid not null,
  salon_id uuid,
  display_order integer not null default 0,
  service_name_snapshot text,
  individual_price_paise bigint,
  duration_minutes_snapshot integer,
  created_at timestamptz not null default now(),
  constraint package_services_package_fk
    foreign key (package_id) references public.packages(id) on delete cascade,
  constraint package_services_order_nonnegative check (display_order >= 0)
);

alter table public.package_services
  add column if not exists service_id uuid,
  add column if not exists salon_id uuid,
  add column if not exists service_name_snapshot text,
  add column if not exists individual_price_paise bigint,
  add column if not exists duration_minutes_snapshot integer;

create unique index if not exists package_services_package_service_unique
  on public.package_services (package_id, service_id);

-- 4.2 Variable prices.
create table if not exists public.service_price_variants (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  service_id uuid not null,
  name text not null,
  price_paise bigint not null,
  duration_minutes integer,
  status public.nexora_catalog_status not null default 'active',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_price_variants_name_not_blank check (btrim(name) <> ''),
  constraint service_price_variants_price_nonnegative check (price_paise >= 0),
  constraint service_price_variants_duration_positive
    check (duration_minutes is null or duration_minutes > 0),
  constraint service_price_variants_order_nonnegative check (display_order >= 0)
);

alter table public.service_price_variants
  add column if not exists salon_id uuid,
  add column if not exists theme_id uuid,
  add column if not exists service_id uuid,
  add column if not exists name text,
  add column if not exists price_paise bigint,
  add column if not exists duration_minutes integer,
  add column if not exists status public.nexora_catalog_status not null default 'active',
  add column if not exists display_order integer not null default 0;

do $m40_variant_constraints$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'service_price_variants'
               and column_name in ('service_id', 'salon_id', 'theme_id'))
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.service_price_variants'::regclass
         and conname = 'service_price_variants_service_salon_theme_fk'
     ) then
    alter table public.service_price_variants
      add constraint service_price_variants_service_salon_theme_fk
      foreign key (service_id, salon_id, theme_id)
      references public.services(id, salon_id, theme_id) on delete cascade not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_price_variants'::regclass
      and conname = 'service_price_variants_salon_service_name_key'
  ) then
    alter table public.service_price_variants
      add constraint service_price_variants_salon_service_name_key
      unique (salon_id, service_id, name);
  end if;
end
$m40_variant_constraints$;

create index if not exists idx_service_variants_salon_theme_service
  on public.service_price_variants (salon_id, theme_id, service_id, status, display_order);

-- 4.3 Offers.
create table if not exists public.service_offers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  target_type public.nexora_offer_target not null,
  category_id uuid,
  predefined_service_id uuid,
  saved_service_id uuid,
  package_id uuid,
  title text not null,
  promotional_badge text not null,
  discount_type public.nexora_discount_type not null,
  discount_percentage numeric(5,2),
  fixed_discount_paise bigint,
  start_date date not null,
  end_date date not null,
  status public.nexora_catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_offers_title_not_blank check (btrim(title) <> ''),
  constraint service_offers_badge_not_blank check (btrim(promotional_badge) <> ''),
  constraint service_offers_dates_valid check (end_date >= start_date),
  constraint service_offers_discount_valid check (
    (discount_type = 'percentage'
      and discount_percentage > 0 and discount_percentage <= 100
      and fixed_discount_paise is null)
    or
    (discount_type = 'fixed'
      and fixed_discount_paise > 0
      and discount_percentage is null)
  )
);

alter table public.service_offers
  add column if not exists salon_id uuid,
  add column if not exists theme_id uuid,
  add column if not exists target_type public.nexora_offer_target,
  add column if not exists category_id uuid,
  add column if not exists predefined_service_id uuid,
  add column if not exists saved_service_id uuid,
  add column if not exists package_id uuid,
  add column if not exists title text,
  add column if not exists promotional_badge text,
  add column if not exists discount_type public.nexora_discount_type,
  add column if not exists discount_percentage numeric(5,2),
  add column if not exists fixed_discount_paise bigint,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists status public.nexora_catalog_status not null default 'active';

create index if not exists idx_service_offers_salon_theme_dates
  on public.service_offers (salon_id, theme_id, status, start_date, end_date);
create index if not exists idx_service_offers_saved_service
  on public.service_offers (saved_service_id) where saved_service_id is not null;
create index if not exists idx_service_offers_package
  on public.service_offers (package_id) where package_id is not null;

-- ===========================================================================
-- 5. Content tables: catalog translations, saved-service translations/media.
-- ===========================================================================
create table if not exists public.catalog_translations (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete restrict,
  entity_type public.nexora_catalog_entity not null,
  category_id uuid,
  predefined_service_id uuid,
  locale public.nexora_content_locale not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_translations_name_not_blank check (btrim(name) <> ''),
  constraint catalog_translations_shape check (
    (entity_type = 'category' and category_id is not null and predefined_service_id is null)
    or
    (entity_type = 'predefined_service' and predefined_service_id is not null and category_id is null)
  ),
  constraint catalog_translations_category_theme_fk
    foreign key (category_id, theme_id)
    references public.service_categories(id, theme_id) on delete restrict,
  constraint catalog_translations_predefined_theme_fk
    foreign key (predefined_service_id, theme_id)
    references public.predefined_services(id, theme_id) on delete restrict
);

create unique index if not exists idx_catalog_translations_category_locale
  on public.catalog_translations (category_id, locale)
  where entity_type = 'category';
create unique index if not exists idx_catalog_translations_predefined_locale
  on public.catalog_translations (predefined_service_id, locale)
  where entity_type = 'predefined_service';

create table if not exists public.saved_service_translations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  service_id uuid not null,
  locale public.nexora_content_locale not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_service_translations_name_not_blank check (btrim(name) <> ''),
  constraint saved_service_translations_unique unique (service_id, locale)
);

alter table public.saved_service_translations
  add column if not exists salon_id uuid,
  add column if not exists theme_id uuid,
  add column if not exists service_id uuid,
  add column if not exists locale public.nexora_content_locale,
  add column if not exists name text,
  add column if not exists description text not null default '';

do $m40_translation_constraints$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'saved_service_translations'
               and column_name = 'service_id')
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.saved_service_translations'::regclass
         and conname = 'saved_service_translations_service_salon_theme_fk'
     ) then
    alter table public.saved_service_translations
      add constraint saved_service_translations_service_salon_theme_fk
      foreign key (service_id, salon_id, theme_id)
      references public.services(id, salon_id, theme_id) on delete cascade not valid;
  end if;
end
$m40_translation_constraints$;

create index if not exists idx_saved_service_translations_theme
  on public.saved_service_translations (salon_id, theme_id, locale);

create table if not exists public.saved_service_media (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  service_id uuid not null,
  image_url text,
  banner_url text,
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_service_media_one_row unique (service_id)
);

alter table public.saved_service_media
  add column if not exists salon_id uuid,
  add column if not exists theme_id uuid,
  add column if not exists service_id uuid,
  add column if not exists image_url text,
  add column if not exists banner_url text,
  add column if not exists icon_url text;

do $m40_media_constraints$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'saved_service_media'
               and column_name = 'service_id')
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.saved_service_media'::regclass
         and conname = 'saved_service_media_service_salon_theme_fk'
     ) then
    alter table public.saved_service_media
      add constraint saved_service_media_service_salon_theme_fk
      foreign key (service_id, salon_id, theme_id)
      references public.services(id, salon_id, theme_id) on delete cascade not valid;
  end if;
end
$m40_media_constraints$;

create index if not exists idx_saved_service_media_theme
  on public.saved_service_media (salon_id, theme_id, service_id);

-- ===========================================================================
-- 6. Salon service audit trail (canonical replacement for business_activity).
-- ===========================================================================
create table if not exists public.salon_service_activity (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  actor_user_id uuid,
  event_type text not null,
  entity_type text not null default 'service',
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_salon_service_activity_salon_created
  on public.salon_service_activity (salon_id, created_at desc);

-- ===========================================================================
-- 7. RLS + grants.
--    All tenant writes flow through security-definer RPCs; RLS here is
--    defense-in-depth so direct table access stays salon-scoped.
-- ===========================================================================
alter table public.predefined_services enable row level security;
alter table public.packages enable row level security;
alter table public.package_services enable row level security;
alter table public.service_price_variants enable row level security;
alter table public.service_offers enable row level security;
alter table public.catalog_translations enable row level security;
alter table public.saved_service_translations enable row level security;
alter table public.saved_service_media enable row level security;
alter table public.salon_service_activity enable row level security;

revoke all on table public.predefined_services from public;
revoke all on table public.packages from public, anon;
revoke all on table public.package_services from public, anon;
revoke all on table public.service_price_variants from public, anon;
revoke all on table public.service_offers from public, anon;
revoke all on table public.catalog_translations from public, anon;
revoke all on table public.saved_service_translations from public, anon;
revoke all on table public.saved_service_media from public, anon;
revoke all on table public.salon_service_activity from public, anon;

grant select on table public.predefined_services to anon, authenticated;
grant select on table public.catalog_translations to anon, authenticated;
grant select, insert, update, delete on table public.packages to authenticated, service_role;
grant select, insert, update, delete on table public.package_services to authenticated, service_role;
grant select, insert, update, delete on table public.service_price_variants to authenticated, service_role;
grant select, insert, update, delete on table public.service_offers to authenticated, service_role;
grant select, insert, update, delete on table public.saved_service_translations to authenticated, service_role;
grant select, insert, update, delete on table public.saved_service_media to authenticated, service_role;
grant select, insert on table public.salon_service_activity to authenticated, service_role;

drop policy if exists predefined_services_public_read on public.predefined_services;
create policy predefined_services_public_read on public.predefined_services
for select to anon, authenticated
using (is_active);

drop policy if exists packages_owner_manage on public.packages;
create policy packages_owner_manage on public.packages
for all to authenticated
using (salon_id in (select public.owner_salon_ids()))
with check (salon_id in (select public.owner_salon_ids()));

drop policy if exists package_services_owner_manage on public.package_services;
create policy package_services_owner_manage on public.package_services
for all to authenticated
using (salon_id in (select public.owner_salon_ids()))
with check (salon_id in (select public.owner_salon_ids()));

drop policy if exists service_price_variants_owner_manage on public.service_price_variants;
create policy service_price_variants_owner_manage on public.service_price_variants
for all to authenticated
using (salon_id in (select public.owner_salon_ids()))
with check (salon_id in (select public.owner_salon_ids()));

drop policy if exists service_offers_owner_manage on public.service_offers;
create policy service_offers_owner_manage on public.service_offers
for all to authenticated
using (salon_id in (select public.owner_salon_ids()))
with check (salon_id in (select public.owner_salon_ids()));

drop policy if exists saved_service_translations_owner_manage on public.saved_service_translations;
create policy saved_service_translations_owner_manage on public.saved_service_translations
for all to authenticated
using (salon_id in (select public.owner_salon_ids()))
with check (salon_id in (select public.owner_salon_ids()));

drop policy if exists saved_service_media_owner_manage on public.saved_service_media;
create policy saved_service_media_owner_manage on public.saved_service_media
for all to authenticated
using (salon_id in (select public.owner_salon_ids()))
with check (salon_id in (select public.owner_salon_ids()));

drop policy if exists salon_service_activity_owner_read on public.salon_service_activity;
create policy salon_service_activity_owner_read on public.salon_service_activity
for select to authenticated
using (salon_id in (select public.owner_salon_ids()));

-- ===========================================================================
-- 8. Seed the five-theme catalog (data ported verbatim from M18).
-- ===========================================================================
with seed(theme_key, name, description, target_audience, ui_config, sort_order, slug) as (
  values
    ('barber_mens_grooming', 'Barber & Men''s Grooming', 'Classic vintage barbershop with a sharp, masculine layout — fades, hot towel shaves and premium grooming.', 'Men seeking fades, classic cuts, beard care, hot towel shaves and premium grooming.', '{"styleLabel":"Dark Charcoal • Gold Accents","tokens":{"id":"barber_mens_grooming","charcoal":"#141414","charcoalSoft":"#1d1d1d","charcoalCard":"#1a1a1a","gold":"#c9a227","goldBright":"#e8c95c","goldSoft":"#3a3016","cream":"#f5efe0","muted":"#a6a49b"}}'::jsonb, 0, 'barber_mens_grooming'),
    ('hair_studio_color_bar', 'Hair Studio & Color Bar', 'A minimalist, gallery-style studio with rose-gold accents, a color showcase and premium editorial feel.', 'Style-conscious hair and color clients seeking precision cuts, editorial styling and restorative treatments.', '{"styleLabel":"Monochrome • Rose-Gold • Editorial","tokens":{"id":"hair_studio_color_bar","ink":"#191817","inkSoft":"#2a2826","paper":"#faf8f5","paperDeep":"#f1ede7","rose":"#b76e79","roseBright":"#d8a0a8","roseSoft":"#f4e5e7","roseDeep":"#9d5a63","line":"#e7e0d8","muted":"#8c8782"}}'::jsonb, 1, 'hair_studio_color_bar'),
    ('beauty_skin_spa', 'Beauty, Skin & Spa', 'A calm, serene wellness sanctuary — soft pastels, emerald and beige accents with a premium spa feel.', 'Beauty and wellness clients seeking skincare, spa, body, waxing, threading and makeup services.', '{"styleLabel":"Soft Pastel • Emerald & Beige","tokens":{"id":"beauty_skin_spa","emerald":"#1e7a63","emeraldDeep":"#15594a","emeraldMid":"#4aa88f","emeraldSoft":"#e2f0ea","beige":"#ece4d6","beigeSoft":"#f7f1e8","cream":"#fbf9f5","blush":"#f6ece9","sage":"#eef2e9","text":"#27403a","muted":"#72837c","line":"#ece6dc"}}'::jsonb, 2, 'beauty_skin_spa'),
    ('family_full_service', 'Full-Service Family Salon', 'Bright teal-and-sky energy with a friendly multi-category layout for the whole family — kids to grandparents.', 'The whole family — children, adults and grandparents seeking hair, beauty and grooming services.', '{"styleLabel":"Bright • Blue/Teal • Family","tokens":{"id":"family_full_service","navy":"#12385b","blue":"#1769d2","blueBright":"#2f8cff","sky":"#eaf6ff","skyDeep":"#cdeaff","teal":"#079f9a","tealDeep":"#087a78","tealSoft":"#d9f5f1","sun":"#ffd166","sunSoft":"#fff4cf","coral":"#ff7b67","ink":"#15324b","muted":"#5d7387","line":"#dcebf4","white":"#ffffff"}}'::jsonb, 3, 'full_service_family_salon'),
    ('nail_lash_studio', 'Nail & Lash Studio', 'A glamorous, visual-first studio for polished nails, expressive art, lashes and brows.', 'Clients seeking polished nails, expressive nail art, manicures, pedicures, lashes and brows.', '{"styleLabel":"Neon Pink • Nude Sand • Glam","tokens":{"id":"nail_lash_studio","ink":"#211b24","inkSoft":"#3a2a37","pink":"#ff2d8d","pinkDeep":"#d70f68","pinkGlow":"#ff79b7","pinkSoft":"#ffe5f1","sand":"#f7eee8","sandDeep":"#e5cfc4","nude":"#c89f91","nudeSoft":"#f1dfd7","cream":"#fffaf7","muted":"#806c74","line":"#eadbd5","white":"#ffffff"}}'::jsonb, 4, 'nail_lash_studio')
)
insert into public.themes (
  theme_id, name, description, target_audience, ui_config, sort_order, slug, is_active
)
select theme_key, name, description, target_audience, ui_config, sort_order, slug, true
from seed
on conflict (theme_id) do update
set name = excluded.name,
    description = excluded.description,
    target_audience = excluded.target_audience,
    ui_config = excluded.ui_config,
    sort_order = excluded.sort_order,
    slug = excluded.slug,
    is_active = true;

with seed(theme_key, category_name, sort_order, slug) as (
  values
    ('barber_mens_grooming', 'Haircuts', 0, 'haircuts'),
    ('barber_mens_grooming', 'Beard & Shave', 1, 'beard-shave'),
    ('barber_mens_grooming', 'Grooming & Treatments', 2, 'grooming-treatments'),
    ('hair_studio_color_bar', 'Styling & Cuts', 0, 'styling-cuts'),
    ('hair_studio_color_bar', 'Hair Color', 1, 'hair-color'),
    ('hair_studio_color_bar', 'Treatments', 2, 'treatments'),
    ('beauty_skin_spa', 'Facial & Skincare', 0, 'facial-skincare'),
    ('beauty_skin_spa', 'Spa & Body', 1, 'spa-body'),
    ('beauty_skin_spa', 'Waxing & Threading', 2, 'waxing-threading'),
    ('beauty_skin_spa', 'Makeup', 3, 'makeup'),
    ('family_full_service', 'Men''s Services', 0, 'mens-services'),
    ('family_full_service', 'Women''s Services', 1, 'womens-services'),
    ('family_full_service', 'Kids Special', 2, 'kids-special'),
    ('family_full_service', 'Combos', 3, 'combos'),
    ('nail_lash_studio', 'Nail Art & Gel', 0, 'nail-art-gel'),
    ('nail_lash_studio', 'Pedicure & Manicure', 1, 'pedicure-manicure'),
    ('nail_lash_studio', 'Lash & Brow', 2, 'lash-brow')
)
insert into public.service_categories (theme_id, name, sort_order, slug)
select t.id, seed.category_name, seed.sort_order, seed.slug
from seed
join public.themes t on t.theme_id = seed.theme_key
on conflict (theme_id, name) do update
set sort_order = excluded.sort_order,
    slug = excluded.slug;

with seed(
  theme_key, category_name, service_name, description, sort_order,
  is_suggested, suggested_label, suggested_sort_order,
  default_price_paise, default_duration_minutes
) as (
  values
    ('barber_mens_grooming', 'Haircuts', 'Skin Fade', 'Precision skin fade blended seamlessly from skin to your preferred length on top.', 0, true, 'Skin Fade', 0, 45000, 45),
    ('barber_mens_grooming', 'Haircuts', 'Scissors Cut', 'Classic scissor-over-comb cut tailored to your hair type and face shape.', 1, false, null, null, 40000, 40),
    ('barber_mens_grooming', 'Haircuts', 'Buzz Cut', 'Clean, uniform clipper cut for a low-maintenance, sharp look.', 2, false, null, null, 25000, 20),
    ('barber_mens_grooming', 'Haircuts', 'Taper Fade', 'Gradual taper fade with a crisp neckline and clean, sharp finish.', 3, false, null, null, 40000, 40),
    ('barber_mens_grooming', 'Haircuts', 'Kids Barbering', 'Patient, friendly haircut for boys with a fun, fuss-free finish.', 4, false, null, null, 25000, 25),
    ('barber_mens_grooming', 'Haircuts', 'Head Shave', 'Smooth head shave with hot-towel prep and soothing aftercare.', 5, true, 'Head Shave', 4, 30000, 25),
    ('barber_mens_grooming', 'Beard & Shave', 'Beard Sculpting & Lineup', 'Detailed beard sculpting with a sharp line-up, hot towel and beard oil finish.', 6, true, 'Beard Sculpting', 1, 35000, 30),
    ('barber_mens_grooming', 'Beard & Shave', 'Hot Towel Classic Shave', 'Traditional straight-razor shave with hot towels and a cooling balm.', 7, true, 'Hot Towel Shave', 2, 40000, 35),
    ('barber_mens_grooming', 'Beard & Shave', 'Beard Trim & Lineup', 'Precision beard trim with crisp cheek and neck line-up.', 8, false, null, null, 25000, 20),
    ('barber_mens_grooming', 'Beard & Shave', 'Moustache Styling', 'Moustache trim, shape and styling with premium wax.', 9, false, null, null, 15000, 15),
    ('barber_mens_grooming', 'Beard & Shave', 'Beard Color/Coverup', 'Natural-looking beard colour to cover greys and deepen tone.', 10, false, null, null, 45000, 30),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Charcoal Face Detox', 'Deep-cleansing charcoal facial to unclog pores and refresh tired skin.', 11, true, 'Charcoal Face Mask', 5, 80000, 40),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Scalp & Head Massage', 'Therapeutic scalp massage to relieve tension and boost circulation.', 12, false, null, null, 60000, 30),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Executive Beard & Hair Combo', 'Signature haircut plus sculpted beard and styling finish in one sitting.', 13, true, 'Hair & Beard Combo', 3, 70000, 60),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Hair Loss Scalp Therapy', 'Targeted scalp therapy to strengthen roots and reduce hair fall.', 14, false, null, null, 120000, 45),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Signature Cut & Blowdry', 'A precision signature cut shaped to your face and finished with a glossy editorial blowdry.', 0, true, 'Signature Haircut', 0, 180000, 60),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Layered Cut', 'Face-framing layers cut dry for movement, volume and a soft, lived-in finish.', 1, false, null, null, 200000, 60),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Bob/Pixie Precision Cut', 'Architectural bob or pixie with razor-sharp lines and weight distribution tailored to you.', 2, false, null, null, 220000, 65),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Luxury Blowout', 'Round-brush blowout with salon-grade finishing for bounce, shine and lasting hold.', 3, true, 'Luxury Blowout', 1, 120000, 40),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Hollywood Waves', 'Old-Hollywood sculpted waves with glossy, red-carpet finish.', 4, false, null, null, 160000, 45),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Hair Setting', 'Classic roller or pin-curl setting for soft, structured volume and defined texture.', 5, false, null, null, 90000, 40),
    ('hair_studio_color_bar', 'Hair Color', 'Balayage / Ombre', 'Hand-painted, sun-kissed balayage or a soft shadow-root ombre — both low-maintenance and dimensional.', 6, true, 'Balayage', 2, 550000, 180),
    ('hair_studio_color_bar', 'Hair Color', 'Global Hair Color', 'Rich, all-over colour transformation in an even, glossy, long-lasting tone.', 7, true, 'Global Hair Color', 3, 350000, 120),
    ('hair_studio_color_bar', 'Hair Color', 'Root Touch-Up', 'Seamless root refresh and grey coverage blended into your existing shade.', 8, false, null, null, 150000, 60),
    ('hair_studio_color_bar', 'Hair Color', 'Highlights & Lowlights', 'Multi-tonal foiling that adds depth, dimension and brightness through the lengths.', 9, false, null, null, 420000, 150),
    ('hair_studio_color_bar', 'Hair Color', 'Gloss & Tone Treatment', 'Demi-permanent gloss to neutralise brass, refine tone and add glass-like shine.', 10, false, null, null, 180000, 45),
    ('hair_studio_color_bar', 'Hair Color', 'Fashion Color', 'Bold pastels, vivids and creative colour placements — a true statement look.', 11, false, null, null, 600000, 200),
    ('hair_studio_color_bar', 'Treatments', 'Keratin Restoration', 'Intensive keratin infusion that rebuilds strength, smooths frizz and restores elasticity.', 12, false, null, null, 450000, 120),
    ('hair_studio_color_bar', 'Treatments', 'Hair Botox Treatment', 'Deep-filler treatment that plumps each strand for silky, youthful, glass-finish hair.', 13, true, 'Hair Botox Treatment', 4, 400000, 90),
    ('hair_studio_color_bar', 'Treatments', 'Smoothening / Rebonding', 'Permanent straightening with thermal reconditioning for sleek, frizz-free lengths.', 14, false, null, null, 500000, 180),
    ('hair_studio_color_bar', 'Treatments', 'Scalp Detox Spa', 'Exfoliating scalp ritual with steam, massage and a balancing botanical mask.', 15, false, null, null, 220000, 60),
    ('hair_studio_color_bar', 'Treatments', 'Olaplex Bond Repair', 'Patented bond-building therapy that relinks broken bonds for stronger, healthier hair.', 16, true, 'Olaplex Bond Repair', 5, 350000, 60),
    ('beauty_skin_spa', 'Facial & Skincare', 'HydraFacial', 'Multi-step hydradermabrasion facial that deeply cleanses, hydrates and plumps for instant glow.', 0, true, 'HydraFacial', 0, 280000, 60),
    ('beauty_skin_spa', 'Facial & Skincare', 'Anti-Aging Gold Facial', 'Luxurious 24K gold facial that firms, brightens and reduces the appearance of fine lines.', 1, false, null, null, 240000, 60),
    ('beauty_skin_spa', 'Facial & Skincare', 'Deep Cleansing Cleanup', 'Thorough cleanse with steam, gentle extraction and a soothing mask for clear, fresh skin.', 2, true, 'Deep Cleansing Cleanup', 1, 120000, 45),
    ('beauty_skin_spa', 'Facial & Skincare', 'De-Tan Brightening', 'Brightening de-tan treatment to reverse sun damage and restore an even, radiant complexion.', 3, true, 'De-Tan Pack', 4, 160000, 45),
    ('beauty_skin_spa', 'Facial & Skincare', 'Organic Glow Treatment', 'Plant-based glow facial with botanical actives for a natural, healthy luminosity.', 4, false, null, null, 180000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Swedish Body Massage', 'Gentle, flowing full-body massage that eases tension and promotes deep relaxation.', 5, true, 'Swedish Body Massage', 3, 220000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Deep Tissue Massage', 'Firm, targeted pressure to release knots and chronic muscle tightness.', 6, false, null, null, 280000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Aromatherapy', 'Soothing essential-oil massage chosen to balance mood, body and skin.', 7, false, null, null, 240000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Foot Reflexology', 'Pressure-point therapy on the feet to relieve stress and restore overall wellbeing.', 8, false, null, null, 120000, 45),
    ('beauty_skin_spa', 'Spa & Body', 'Back Spa', 'Deep-cleansing back treatment with exfoliation, extraction and a relaxing massage.', 9, false, null, null, 180000, 45),
    ('beauty_skin_spa', 'Waxing & Threading', 'Eyebrow & Upper Lip Threading', 'Precise threading to shape your brows and smooth the upper lip with clean definition.', 10, false, null, null, 15000, 15),
    ('beauty_skin_spa', 'Waxing & Threading', 'Full Body Waxing', 'Complete body waxing — arms, legs, underarms and bikini line with soothing aftercare.', 11, true, 'Full Body Waxing', 2, 220000, 90),
    ('beauty_skin_spa', 'Waxing & Threading', 'Rica Waxing', 'Premium Rica wax treatment, gentle on sensitive skin with long-lasting smoothness.', 12, false, null, null, 180000, 60),
    ('beauty_skin_spa', 'Waxing & Threading', 'Bikini Wax', 'Hygienic, comfortable bikini-line waxing in a private, relaxing setting.', 13, false, null, null, 90000, 30),
    ('beauty_skin_spa', 'Makeup', 'Bridal Makeup', 'Flawless, long-lasting bridal look with skin prep, lashes and finishing touches for your big day.', 14, true, 'Bridal Makeup', 5, 900000, 150),
    ('beauty_skin_spa', 'Makeup', 'Party Makeup', 'Camera-ready makeup for parties, dinners and celebrations with a polished finish.', 15, false, null, null, 300000, 75),
    ('beauty_skin_spa', 'Makeup', 'Airbrush Makeup', 'Featherlight, high-definition airbrush makeup for a flawless, weightless finish.', 16, false, null, null, 450000, 90),
    ('beauty_skin_spa', 'Makeup', 'Pre-Bridal Skin Care', 'A pre-wedding skincare ritual of facials and treatments for radiant, camera-ready skin.', 17, false, null, null, 600000, 120),
    ('family_full_service', 'Men''s Services', 'Classic Haircut', 'A polished classic cut with scissor and clipper detailing, wash and finish.', 0, true, 'Classic Haircut', 0, 35000, 35),
    ('family_full_service', 'Men''s Services', 'Beard Trim', 'Precision beard shaping with a clean line-up, warm towel and conditioning finish.', 1, true, 'Beard Trim', 2, 25000, 25),
    ('family_full_service', 'Men''s Services', 'Hair Color', 'A rich, even colour refresh with consultation and scalp-safe application.', 2, false, null, null, 120000, 75),
    ('family_full_service', 'Men''s Services', 'Head Massage', 'A relaxing scalp and head massage to release tension and leave you refreshed.', 3, false, null, null, 50000, 30),
    ('family_full_service', 'Women''s Services', 'Haircut & Blowdry', 'A tailored haircut finished with a smooth, bouncy salon blowdry.', 4, true, 'Haircut & Blowdry', 1, 65000, 55),
    ('family_full_service', 'Women''s Services', 'Hair Spa', 'Deep conditioning, warm steam and a restorative scalp massage for softer, shinier hair.', 5, true, 'Hair Spa', 3, 100000, 60),
    ('family_full_service', 'Women''s Services', 'Threading', 'Gentle, precise facial threading for clean brows and a polished finish.', 6, false, null, null, 15000, 20),
    ('family_full_service', 'Women''s Services', 'Root Touch-Up', 'Seamless grey coverage and root refresh blended into your existing colour.', 7, false, null, null, 90000, 60),
    ('family_full_service', 'Women''s Services', 'Facial', 'A deep-cleansing facial with steam, gentle extraction and a soothing mask for fresh, glowing skin.', 8, true, 'Deep Cleansing Facial', 4, 85000, 50),
    ('family_full_service', 'Kids Special', 'Kids Haircut', 'A gentle, friendly haircut designed for a comfortable and fuss-free kids visit.', 9, true, 'Kids Haircut', 5, 25000, 25),
    ('family_full_service', 'Kids Special', 'Creative Styling', 'Fun braids, clips and creative styling for parties, photos and special days.', 10, false, null, null, 45000, 35),
    ('family_full_service', 'Kids Special', 'Baby Hair Cut (Mundan/Trim)', 'A patient, hygienic first haircut or trim with extra care for little guests.', 11, false, null, null, 30000, 30),
    ('family_full_service', 'Combos', 'Family Haircare Package', 'A convenient family visit combining haircare moments for everyone under one roof.', 12, false, null, null, 180000, 120),
    ('family_full_service', 'Combos', 'Couple Pamper Combo', 'A shared salon break with coordinated grooming and relaxation for two.', 13, false, null, null, 150000, 90),
    ('family_full_service', 'Combos', 'Express Grooming', 'A quick, polished grooming refresh for busy days and last-minute plans.', 14, false, null, null, 70000, 45),
    ('nail_lash_studio', 'Nail Art & Gel', 'Gel Polish Overlay', 'A sheer or statement gel colour layered over your natural nails for a smooth, chip-resistant glass finish.', 0, true, 'Gel Polish Overlay', 1, 90000, 60),
    ('nail_lash_studio', 'Nail Art & Gel', 'Acrylic Nail Extensions', 'Custom sculpted acrylic extensions shaped to your preferred length, profile and finish.', 1, true, 'Acrylic Extensions', 0, 180000, 120),
    ('nail_lash_studio', 'Nail Art & Gel', 'Chrome Nail Art', 'Reflective chrome pigment and precision detailing for a high-shine, camera-ready nail look.', 2, true, 'Nail Art Per Nail', 4, 140000, 90),
    ('nail_lash_studio', 'Nail Art & Gel', 'French Manicure', 'A timeless sheer base and clean French tip, finished with a glossy salon seal.', 3, false, null, null, 75000, 60),
    ('nail_lash_studio', 'Nail Art & Gel', 'Nail Removal & Repair', 'Safe product removal, gentle repair and restorative prep before your next set.', 4, false, null, null, 50000, 45),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Luxury Spa Pedicure', 'Soak, exfoliation, cuticle care, massage and polish for completely refreshed feet.', 5, true, 'Luxury Spa Pedicure', 2, 120000, 75),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Ice Cream Manicure', 'A playful, creamy manicure ritual with softening care, massage and a sweet glossy finish.', 6, false, null, null, 85000, 60),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Cuticle Care & Polish', 'Neat cuticle care, natural nail shaping and your choice of polished colour.', 7, false, null, null, 55000, 40),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Paraffin Wax Care', 'Warm paraffin treatment to deeply soften dry hands or feet after your care ritual.', 8, false, null, null, 65000, 35),
    ('nail_lash_studio', 'Lash & Brow', 'Eyelash Extensions (Classic/Volume)', 'Lightweight, customised lash extensions ranging from clean classic definition to soft volume.', 9, true, 'Classic Lash Extensions', 3, 220000, 120),
    ('nail_lash_studio', 'Lash & Brow', 'Lash Lift & Tint', 'A lifted, curled and tinted lash look that opens the eyes without extensions.', 10, false, null, null, 150000, 75),
    ('nail_lash_studio', 'Lash & Brow', 'Microblading', 'Fine, hair-like brow strokes mapped to your features for a naturally fuller arch.', 11, false, null, null, 450000, 150),
    ('nail_lash_studio', 'Lash & Brow', 'Brow Lamination', 'Smooth, set and softly lifted brows with a clean brushed-up finish.', 12, true, 'Brow Lamination', 5, 100000, 60)
)
insert into public.predefined_services (
  theme_id, category_id, name, description, sort_order, is_suggested,
  suggested_label, suggested_sort_order, default_price_paise,
  default_duration_minutes, is_active
)
select
  t.id, c.id, seed.service_name, seed.description, seed.sort_order,
  seed.is_suggested, seed.suggested_label, seed.suggested_sort_order,
  seed.default_price_paise, seed.default_duration_minutes, true
from seed
join public.themes t on t.theme_id = seed.theme_key
join public.service_categories c
  on c.theme_id = t.id and c.name = seed.category_name
on conflict (theme_id, name) do update
set category_id = excluded.category_id,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_suggested = excluded.is_suggested,
    suggested_label = excluded.suggested_label,
    suggested_sort_order = excluded.suggested_sort_order,
    default_price_paise = excluded.default_price_paise,
    default_duration_minutes = excluded.default_duration_minutes,
    is_active = true;

-- ===========================================================================
-- 9. Canonical tenant resolver + status helpers.
-- ===========================================================================
create or replace function private.nexora_manageable_salon_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'Please log in to manage services.';
  end if;
  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_ids
  from public.owner_salon_ids() as owner_salon(id);
  if cardinality(v_ids) = 0 then
    raise exception using
      errcode = '42501',
      message = 'No manageable salon is linked to this account.';
  end if;
  if cardinality(v_ids) > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Multiple salons are linked to this account. Select a salon before saving services.';
  end if;
  return v_ids[1];
end
$$;

revoke all on function private.nexora_manageable_salon_id() from public;
grant execute on function private.nexora_manageable_salon_id() to authenticated, service_role;

-- Validates + normalizes the draft 'active' | 'inactive' | 'archived' status.
create or replace function public.nexora_saved_service_status(p_status text)
returns public.nexora_catalog_status
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  normalized text := lower(btrim(coalesce(p_status, '')));
begin
  if normalized not in ('active', 'inactive', 'archived') then
    raise exception using
      errcode = '22023',
      message = 'Service status must be active, inactive, or archived.';
  end if;
  return normalized::public.nexora_catalog_status;
end
$$;

-- Maps a draft status onto the canonical is_active / deleted_at pair.
create or replace function private.nexora_apply_service_status(
  p_status public.nexora_catalog_status,
  out is_active boolean,
  out deleted_at timestamptz
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  is_active := (p_status <> 'inactive' and p_status <> 'archived');
  deleted_at := case when p_status = 'archived' then now() else null end;
end
$$;

-- Re-derives the draft status string from canonical columns.
create or replace function public.nexora_derived_service_status(
  p_is_active boolean,
  p_deleted_at timestamptz
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_deleted_at is not null then 'archived'
    when p_is_active then 'active'
    else 'inactive'
  end
$$;

revoke all on function public.nexora_saved_service_status(text) from public;
revoke all on function public.nexora_derived_service_status(boolean, timestamptz) from public;
grant execute on function public.nexora_saved_service_status(text) to authenticated, service_role;
grant execute on function public.nexora_derived_service_status(boolean, timestamptz) to authenticated, service_role;

-- ===========================================================================
-- 10. Shared read-back payloads (JSON contract identical to the drafts; the
--     `business_id` key now carries the canonical salon UUID).
-- ===========================================================================
create or replace function public.nexora_translation_array(
  p_theme_id uuid,
  p_entity public.nexora_catalog_entity,
  p_category_id uuid,
  p_predefined_id uuid
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'locale', t.locale,
    'name', t.name,
    'description', t.description
  ) order by t.locale), '[]'::jsonb)
  from public.catalog_translations t
  where t.theme_id = p_theme_id
    and t.entity_type = p_entity
    and (
      (p_entity = 'category' and t.category_id = p_category_id)
      or
      (p_entity = 'predefined_service' and t.predefined_service_id = p_predefined_id)
    )
$$;

create or replace function public.nexora_saved_service_media_payload(p_service_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select case when m.service_id is null then '{}'::jsonb else jsonb_build_object(
    'image_url', m.image_url,
    'banner_url', m.banner_url,
    'icon_url', m.icon_url
  ) end
  from (select p_service_id as service_id) s
  left join public.saved_service_media m on m.service_id = s.service_id
$$;

create or replace function public.nexora_saved_service_translation_array(p_service_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'locale', t.locale,
    'name', t.name,
    'description', t.description
  ) order by t.locale), '[]'::jsonb)
  from public.saved_service_translations t
  where t.service_id = p_service_id
$$;

create or replace function public.nexora_saved_service_payload(p_service_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id,
    'business_id', s.salon_id,
    'theme_id', s.theme_id,
    'theme_key', t.theme_id,
    'category_id', s.category_id,
    'predefined_service_id', s.predefined_service_id,
    'name', s.name,
    'category', s.category,
    'description', s.short_description,
    'price_paise', s.price_paise,
    'duration_minutes', s.duration_minutes,
    'status', public.nexora_derived_service_status(s.is_active, s.deleted_at),
    'is_featured', s.is_featured,
    'display_order', s.display_order,
    'translations', public.nexora_saved_service_translation_array(s.id),
    'media', public.nexora_saved_service_media_payload(s.id)
  )
  from public.services s
  left join public.themes t on t.id = s.theme_id
  where s.id = p_service_id
$$;

-- ===========================================================================
-- 11. Read RPCs.
-- ===========================================================================
create or replace function public.get_theme_service_catalog(p_theme_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'theme', jsonb_build_object(
      'id', t.id,
      'theme_id', t.theme_id,
      'name', t.name,
      'description', t.description,
      'target_audience', t.target_audience,
      'ui_config', t.ui_config,
      'sort_order', t.sort_order
    ),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'theme_id', c.theme_id,
          'name', c.name,
          'sort_order', c.sort_order,
          'translations', public.nexora_translation_array(t.id, 'category', c.id, null)
        ) order by c.sort_order, c.name
      )
      from public.service_categories c
      where c.theme_id = t.id
    ), '[]'::jsonb),
    'predefined_services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'theme_id', ps.theme_id,
          'category_id', ps.category_id,
          'name', ps.name,
          'description', ps.description,
          'sort_order', ps.sort_order,
          'is_suggested', ps.is_suggested,
          'suggested_label', ps.suggested_label,
          'suggested_sort_order', ps.suggested_sort_order,
          'default_price_paise', ps.default_price_paise,
          'default_duration_minutes', ps.default_duration_minutes,
          'translations', public.nexora_translation_array(t.id, 'predefined_service', null, ps.id)
        ) order by ps.sort_order, ps.name
      )
      from public.predefined_services ps
      join public.service_categories c
        on c.id = ps.category_id
       and c.theme_id = t.id
      where ps.theme_id = t.id
        and ps.is_active
    ), '[]'::jsonb),
    'suggested_services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'theme_id', ps.theme_id,
          'category_id', ps.category_id,
          'name', ps.name,
          'description', ps.description,
          'sort_order', ps.sort_order,
          'is_suggested', ps.is_suggested,
          'suggested_label', ps.suggested_label,
          'suggested_sort_order', ps.suggested_sort_order,
          'default_price_paise', ps.default_price_paise,
          'default_duration_minutes', ps.default_duration_minutes,
          'translations', public.nexora_translation_array(t.id, 'predefined_service', null, ps.id)
        ) order by ps.suggested_sort_order, ps.sort_order, ps.name
      )
      from public.predefined_services ps
      join public.service_categories c
        on c.id = ps.category_id
       and c.theme_id = t.id
      where ps.theme_id = t.id
        and ps.is_active
        and ps.is_suggested = true
    ), '[]'::jsonb)
  )
  from public.themes t
  where t.theme_id = p_theme_id
    and t.is_active
  limit 1
$$;

create or replace function public.get_saved_services_for_theme(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_id uuid;
  saved_rows jsonb;
begin
  select t.id into target_theme_id
  from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_id is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(
    public.nexora_saved_service_payload(s.id)
    order by s.display_order, s.created_at, s.id
  ), '[]'::jsonb)
  into saved_rows
  from public.services s
  join public.themes t on t.id = s.theme_id
  join public.service_categories c
    on c.id = s.category_id
   and c.theme_id = t.id
  where s.salon_id = target_salon_id
    and s.theme_id = target_theme_id
    and (s.predefined_service_id is null or exists (
      select 1 from public.predefined_services ps
      where ps.id = s.predefined_service_id
        and ps.theme_id = s.theme_id
        and ps.category_id = s.category_id
    ));

  return jsonb_build_object(
    'business_id', target_salon_id,
    'theme_id', p_theme_id,
    'services', saved_rows
  );
end
$$;

create or replace function public.get_theme_commerce(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  variants jsonb;
  bundles jsonb;
  offers jsonb;
  service_badges jsonb;
begin
  select t.id into target_theme_uuid
  from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'business_id', v.salon_id,
    'theme_id', v.theme_id,
    'service_id', v.service_id,
    'name', v.name,
    'price_paise', v.price_paise,
    'duration_minutes', v.duration_minutes,
    'status', v.status,
    'display_order', v.display_order
  ) order by v.service_id, v.display_order, v.name), '[]'::jsonb)
  into variants
  from public.service_price_variants v
  join public.services s
    on s.id = v.service_id
   and s.salon_id = v.salon_id
   and s.theme_id = v.theme_id
  where v.salon_id = target_salon_id
    and v.theme_id = target_theme_uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'business_id', p.salon_id,
    'theme_id', p.theme_id,
    'theme_key', p_theme_id,
    'category_id', p.category_id,
    'name', p.name,
    'description', p.description,
    'original_price_paise', p.original_price_paise,
    'price_paise', p.price_paise,
    'duration_minutes', p.duration_minutes,
    'discount_type', p.discount_type,
    'discount_percentage', p.discount_percentage,
    'fixed_discount_paise', p.fixed_discount_paise,
    'promotional_badge', p.promotional_badge,
    'status', p.status,
    'included_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_id', ps.service_id,
        'name', coalesce(ps.service_name_snapshot, s.name),
        'category', s.category,
        'individual_price_paise', coalesce(ps.individual_price_paise, s.price_paise),
        'duration_minutes', coalesce(ps.duration_minutes_snapshot, s.duration_minutes),
        'display_order', ps.display_order
      ) order by ps.display_order, ps.created_at)
      from public.package_services ps
      join public.services s on s.id = ps.service_id and s.salon_id = p.salon_id
      where ps.package_id = p.id
    ), '[]'::jsonb)
  ) order by p.display_order, p.created_at, p.id), '[]'::jsonb)
  into bundles
  from public.packages p
  where p.salon_id = target_salon_id
    and p.theme_id = target_theme_uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'business_id', o.salon_id,
    'theme_id', o.theme_id,
    'theme_key', p_theme_id,
    'target_type', o.target_type,
    'category_id', o.category_id,
    'predefined_service_id', o.predefined_service_id,
    'saved_service_id', o.saved_service_id,
    'package_id', o.package_id,
    'title', o.title,
    'promotional_badge', o.promotional_badge,
    'discount_type', o.discount_type,
    'discount_percentage', o.discount_percentage,
    'fixed_discount_paise', o.fixed_discount_paise,
    'start_date', o.start_date,
    'end_date', o.end_date,
    'status', o.status,
    'effective_status', public.nexora_offer_effective_status(o.status, o.start_date, o.end_date)
  ) order by o.start_date desc, o.created_at desc, o.id), '[]'::jsonb)
  into offers
  from public.service_offers o
  where o.salon_id = target_salon_id
    and o.theme_id = target_theme_uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id', s.id,
    'promotional_badge', s.promotional_badge
  ) order by s.display_order, s.id), '[]'::jsonb)
  into service_badges
  from public.services s
  where s.salon_id = target_salon_id
    and s.theme_id = target_theme_uuid
    and nullif(btrim(s.promotional_badge), '') is not null;

  return jsonb_build_object(
    'business_id', target_salon_id,
    'theme_id', p_theme_id,
    'theme_uuid', target_theme_uuid,
    'service_badges', service_badges,
    'variants', variants,
    'bundles', bundles,
    'offers', offers
  );
end
$$;

create or replace function public.nexora_offer_effective_status(
  p_status public.nexora_catalog_status,
  p_start_date date,
  p_end_date date
)
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when p_status = 'archived' then 'archived'
    when p_status <> 'active' then 'inactive'
    when p_end_date < current_date then 'expired'
    when p_start_date > current_date then 'scheduled'
    else 'active'
  end
$$;

create or replace function public.search_theme_services(p_theme_id text, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_id uuid;
  needle text := lower(btrim(coalesce(p_query, '')));
  hits jsonb;
begin
  select t.id into target_theme_id from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_id is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb)
  into hits
  from (
    select jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.short_description,
      'translated_name', tr.name,
      'source', 'saved'
    ) as item
    from public.services s
    left join public.saved_service_translations tr
      on tr.service_id = s.id
     and (
       needle = ''
       or lower(tr.name) like '%' || needle || '%'
       or lower(tr.description) like '%' || needle || '%'
     )
    where s.salon_id = target_salon_id
      and s.theme_id = target_theme_id
      and (
        needle = ''
        or lower(s.name) like '%' || needle || '%'
        or lower(coalesce(s.short_description, '')) like '%' || needle || '%'
        or tr.id is not null
      )
    union all
    select jsonb_build_object(
      'id', ps.id,
      'name', ps.name,
      'description', ps.description,
      'translated_name', ct.name,
      'source', 'predefined'
    )
    from public.predefined_services ps
    left join public.catalog_translations ct
      on ct.predefined_service_id = ps.id
     and ct.locale <> 'en'
     and (
       needle = ''
       or lower(ct.name) like '%' || needle || '%'
       or lower(ct.description) like '%' || needle || '%'
     )
    where ps.theme_id = target_theme_id
      and ps.is_active
      and (
        needle = ''
        or lower(ps.name) like '%' || needle || '%'
        or lower(coalesce(ps.description, '')) like '%' || needle || '%'
        or ct.id is not null
      )
  ) ranked;

  return jsonb_build_object(
    'business_id', target_salon_id,
    'theme_id', p_theme_id,
    'results', hits
  );
end
$$;

-- Booking safety snapshot (canonical: booking_services line items).
create or replace function public.nexora_service_safety_lock(p_service_id uuid, p_salon_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'service_id', p_service_id,
    'upcoming_appointments', (
      select count(*)::int
      from public.booking_services bs
      join public.bookings b on b.id = bs.booking_id
      where bs.service_id = p_service_id
        and b.salon_id = p_salon_id
        and b.status in ('pending', 'confirmed')
        and b.appointment_start >= now()
    ),
    'active_bookings', (
      select count(*)::int
      from public.booking_services bs
      join public.bookings b on b.id = bs.booking_id
      where bs.service_id = p_service_id
        and b.salon_id = p_salon_id
        and b.status in ('pending', 'confirmed')
    ),
    'pending_transactions', (
      select count(*)::int
      from public.booking_services bs
      join public.bookings b on b.id = bs.booking_id
      left join public.payment_orders po
        on po.booking_id = b.id and po.status = 'created'
      left join public.payments pay
        on pay.booking_id = b.id and pay.status = 'authorized'
      where bs.service_id = p_service_id
        and b.salon_id = p_salon_id
        and (
          b.payment_status in ('unpaid', 'pending', 'partially_paid')
          or po.id is not null
          or pay.id is not null
        )
    ),
    'package_links', (
      select count(*)::int
      from public.package_services ps
      join public.packages pkg on pkg.id = ps.package_id
      where ps.service_id = p_service_id
        and pkg.salon_id = p_salon_id
    )
  )
$$;

create or replace function public.get_service_safety_lock(p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  lock jsonb;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.salon_id = target_salon_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  lock := public.nexora_service_safety_lock(p_service_id, target_salon_id);
  return lock || jsonb_build_object(
    'locked', (
      (lock ->> 'upcoming_appointments')::int > 0
      or (lock ->> 'active_bookings')::int > 0
      or (lock ->> 'pending_transactions')::int > 0
    ),
    'can_delete', (
      (lock ->> 'upcoming_appointments')::int = 0
      and (lock ->> 'active_bookings')::int = 0
      and (lock ->> 'pending_transactions')::int = 0
      and (lock ->> 'package_links')::int = 0
    )
  );
end
$$;

create or replace function public.nexora_assert_service_unlocked(
  p_service_id uuid,
  p_salon_id uuid,
  p_action text
)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  lock jsonb := public.nexora_service_safety_lock(p_service_id, p_salon_id);
begin
  if (lock ->> 'upcoming_appointments')::int > 0
     or (lock ->> 'active_bookings')::int > 0
     or (lock ->> 'pending_transactions')::int > 0 then
    raise exception using
      errcode = '23503',
      message = format(
        'This service has %s upcoming appointment(s), %s active booking(s), and %s pending transaction(s). Archive it instead of a silent %s. Existing appointments are unchanged.',
        lock ->> 'upcoming_appointments',
        lock ->> 'active_bookings',
        lock ->> 'pending_transactions',
        p_action
      );
  end if;
end
$$;

create or replace function public.get_theme_service_audit(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  rows jsonb;
begin
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'actor_user_id', a.actor_user_id,
    'action', coalesce(a.metadata ->> 'action', a.event_type),
    'entity_type', a.entity_type,
    'entity_id', a.entity_id,
    'service_name', a.metadata ->> 'service_name',
    'previous', a.metadata -> 'previous',
    'next', a.metadata -> 'next',
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into rows
  from public.salon_service_activity a
  where a.salon_id = target_salon_id
    and a.event_type in (
      'service_created', 'service_edited', 'service_price_changed',
      'service_duration_changed', 'service_description_changed',
      'service_status_changed', 'service_archived', 'service_deleted',
      'offer_created', 'offer_changed', 'offer_expired', 'combo_changed'
    )
    and (
      a.entity_type <> 'service'
      or exists (
        select 1 from public.services s
        where s.id = a.entity_id and s.theme_id = target_theme_uuid
      )
      or (a.metadata -> 'next' ->> 'theme_id')::uuid = target_theme_uuid
    );

  return jsonb_build_object(
    'business_id', target_salon_id,
    'theme_id', p_theme_id,
    'entries', rows
  );
end
$$;

create or replace function public.check_theme_service_integrity(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  issues int := 0;
begin
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select count(*)::int into issues
  from public.services s
  where s.salon_id = target_salon_id
    and s.theme_id = target_theme_uuid
    and (
      s.category_id is null
      or not exists (
        select 1 from public.service_categories c
        where c.id = s.category_id and c.theme_id = s.theme_id
      )
      or (
        s.predefined_service_id is not null
        and not exists (
          select 1 from public.predefined_services ps
          where ps.id = s.predefined_service_id
            and ps.theme_id = s.theme_id
            and ps.category_id = s.category_id
        )
      )
    );

  issues := issues + (
    select count(*)::int from public.service_offers o
    where o.salon_id = target_salon_id
      and o.theme_id <> target_theme_uuid
      and (
        o.saved_service_id in (select id from public.services where salon_id = target_salon_id and theme_id = target_theme_uuid)
        or o.package_id in (select id from public.packages where salon_id = target_salon_id and theme_id = target_theme_uuid)
      )
  );

  issues := issues + (
    select count(*)::int from public.saved_service_media m
    join public.services s on s.id = m.service_id
    where m.salon_id = target_salon_id
      and (m.theme_id is distinct from s.theme_id or m.salon_id is distinct from s.salon_id)
  );

  return jsonb_build_object(
    'business_id', target_salon_id,
    'theme_id', p_theme_id,
    'ok', issues = 0,
    'issue_count', issues
  );
end
$$;

-- ===========================================================================
-- 12. Write RPCs.
-- ===========================================================================
create or replace function public.save_predefined_services(
  p_theme_id text,
  p_predefined_service_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  requested_count integer;
  valid_count integer;
  first_display_order integer;
  inserted_count integer := 0;
  existing_count integer := 0;
  saved_rows jsonb;
begin
  if p_theme_id is null or btrim(p_theme_id) = '' then
    raise exception using errcode = '22023', message = 'A theme is required.';
  end if;
  if p_predefined_service_ids is null or cardinality(p_predefined_service_ids) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one predefined service.';
  end if;

  select count(distinct requested_id)::integer
  into requested_count
  from unnest(p_predefined_service_ids) as requested(requested_id)
  where requested_id is not null;

  if requested_count = 0 then
    raise exception using errcode = '22023', message = 'Select at least one predefined service.';
  end if;

  -- Validate the complete input set before inserting anything.
  select count(*)::integer
  into valid_count
  from public.predefined_services ps
  join public.themes t
    on t.id = ps.theme_id
   and t.theme_id = p_theme_id
   and t.is_active
  join public.service_categories c
    on c.id = ps.category_id
   and c.theme_id = t.id
  where ps.id = any(p_predefined_service_ids)
    and ps.is_active
    and ps.default_price_paise is not null
    and ps.default_duration_minutes is not null;

  if valid_count <> requested_count then
    raise exception using
      errcode = '23503',
      message = 'One or more selected services do not belong to the active theme.';
  end if;

  select coalesce(max(s.display_order), -1) + 1
  into first_display_order
  from public.services s
  where s.salon_id = target_salon_id;

  with requested as (
    select requested_id, min(ordinality)::integer as request_order
    from unnest(p_predefined_service_ids) with ordinality as input(requested_id, ordinality)
    where requested_id is not null
    group by requested_id
  ), source_rows as (
    select
      ps.id as predefined_service_id,
      ps.theme_id,
      ps.category_id,
      ps.name,
      c.name as category_name,
      ps.description,
      ps.default_price_paise,
      ps.default_duration_minutes,
      requested.request_order
    from requested
    join public.predefined_services ps on ps.id = requested.requested_id
    join public.themes t
      on t.id = ps.theme_id
     and t.theme_id = p_theme_id
     and t.is_active
    join public.service_categories c
      on c.id = ps.category_id
     and c.theme_id = t.id
    where ps.is_active
  ), numbered as (
    select source_rows.*,
           row_number() over (order by request_order, predefined_service_id)::integer - 1 as order_offset
    from source_rows
  )
  insert into public.services (
    salon_id,
    theme_id,
    category_id,
    predefined_service_id,
    name,
    category,
    price_paise,
    duration_minutes,
    short_description,
    is_featured,
    is_active,
    deleted_at,
    display_order
  )
  select
    target_salon_id,
    numbered.theme_id,
    numbered.category_id,
    numbered.predefined_service_id,
    numbered.name,
    numbered.category_name,
    numbered.default_price_paise,
    numbered.default_duration_minutes,
    numbered.description,
    false,
    true,
    null,
    first_display_order + numbered.order_offset
  from numbered
  on conflict (salon_id, predefined_service_id)
    where predefined_service_id is not null and deleted_at is null
  do nothing;

  get diagnostics inserted_count = row_count;
  existing_count := requested_count - inserted_count;

  select coalesce(jsonb_agg(
    public.nexora_saved_service_payload(s.id)
    order by array_position(p_predefined_service_ids, s.predefined_service_id), s.id
  ), '[]'::jsonb)
  into saved_rows
  from public.services s
  where s.salon_id = target_salon_id
    and s.predefined_service_id = any(p_predefined_service_ids);

  return jsonb_build_object(
    'business_id', target_salon_id,
    'theme_id', p_theme_id,
    'requested_count', requested_count,
    'inserted_count', inserted_count,
    'existing_count', existing_count,
    'services', saved_rows
  );
end
$$;

create or replace function public.create_saved_service(
  p_theme_id text,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_price_paise bigint,
  p_duration_minutes integer,
  p_predefined_service_id uuid default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_id uuid;
  target_status public.nexora_catalog_status := public.nexora_saved_service_status(p_status);
  clean_name text := btrim(coalesce(p_name, ''));
  category_name text;
  next_display_order integer;
  new_service_id uuid;
  v_is_active boolean;
  v_deleted_at timestamptz;
begin
  if clean_name = '' then
    raise exception using errcode = '22023', message = 'Service name is required.';
  end if;
  if p_price_paise is null or p_price_paise < 0 then
    raise exception using errcode = '22023', message = 'Service price cannot be negative.';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception using errcode = '22023', message = 'Service duration must be positive.';
  end if;

  select t.id into target_theme_id
  from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_id is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  -- The category must belong to the requested theme.
  select c.name into category_name
  from public.service_categories c
  where c.id = p_category_id and c.theme_id = target_theme_id;
  if category_name is null then
    raise exception using
      errcode = '23503',
      message = 'The selected category does not belong to this theme.';
  end if;

  if p_predefined_service_id is not null then
    -- Predefined provenance is validated against the live catalog, never
    -- inferred from the (editable) service name.
    if not exists (
      select 1
      from public.predefined_services ps
      where ps.id = p_predefined_service_id
        and ps.theme_id = target_theme_id
        and ps.category_id = p_category_id
        and ps.is_active
    ) then
      raise exception using
        errcode = '23503',
        message = 'The selected service does not belong to this theme and category.';
    end if;

    if exists (
      select 1 from public.services s
      where s.salon_id = target_salon_id
        and s.predefined_service_id = p_predefined_service_id
    ) then
      raise exception using
        errcode = '23505',
        message = 'This service is already saved for your salon.';
    end if;
  end if;

  -- Duplicate guard for custom services (and custom names colliding with an
  -- already saved predefined service of the same name in this theme).
  if exists (
    select 1 from public.services s
    where s.salon_id = target_salon_id
      and s.theme_id = target_theme_id
      and s.deleted_at is null
      and lower(btrim(s.name)) = lower(clean_name)
  ) then
    raise exception using
      errcode = '23505',
      message = 'A service with this name is already saved for this theme.';
  end if;

  select coalesce(max(s.display_order), -1) + 1
  into next_display_order
  from public.services s
  where s.salon_id = target_salon_id;

  select * into v_is_active, v_deleted_at
  from private.nexora_apply_service_status(target_status);

  insert into public.services (
    salon_id,
    theme_id,
    category_id,
    predefined_service_id,
    name,
    category,
    price_paise,
    duration_minutes,
    short_description,
    is_featured,
    is_active,
    deleted_at,
    display_order
  ) values (
    target_salon_id,
    target_theme_id,
    p_category_id,
    p_predefined_service_id,
    clean_name,
    category_name,
    p_price_paise,
    p_duration_minutes,
    coalesce(p_description, ''),
    false,
    v_is_active,
    v_deleted_at,
    next_display_order
  )
  returning id into new_service_id;

  return public.nexora_saved_service_payload(new_service_id);
end
$$;

create or replace function public.update_saved_service(
  p_service_id uuid,
  p_name text default null,
  p_description text default null,
  p_price_paise bigint default null,
  p_duration_minutes integer default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  existing public.services%rowtype;
  next_name text;
  next_status public.nexora_catalog_status;
  v_is_active boolean;
  v_deleted_at timestamptz;
begin
  select s.* into existing
  from public.services s
  where s.id = p_service_id
    and s.salon_id = target_salon_id;
  if not found then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  next_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), existing.name);
  if p_name is not null and btrim(p_name) = '' then
    raise exception using errcode = '22023', message = 'Service name is required.';
  end if;
  if p_price_paise is not null and p_price_paise < 0 then
    raise exception using errcode = '22023', message = 'Service price cannot be negative.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception using errcode = '22023', message = 'Service duration must be positive.';
  end if;

  next_status := case
    when p_status is null then public.nexora_saved_service_status(
      public.nexora_derived_service_status(existing.is_active, existing.deleted_at)
    )
    else public.nexora_saved_service_status(p_status)
  end;

  if next_status = 'inactive'
     and public.nexora_derived_service_status(existing.is_active, existing.deleted_at) is distinct from 'inactive' then
    perform public.nexora_assert_service_unlocked(p_service_id, target_salon_id, 'deactivate');
  end if;

  if lower(next_name) <> lower(existing.name)
     and existing.theme_id is not null
     and next_status <> 'archived'
     and exists (
       select 1 from public.services s
       where s.salon_id = target_salon_id
         and s.theme_id = existing.theme_id
         and s.id <> existing.id
         and s.deleted_at is null
         and lower(btrim(s.name)) = lower(btrim(next_name))
     ) then
    raise exception using
      errcode = '23505',
      message = 'A service with this name is already saved for this theme.';
  end if;

  select * into v_is_active, v_deleted_at
  from private.nexora_apply_service_status(next_status);

  update public.services s
  set name = next_name,
      short_description = coalesce(p_description, s.short_description),
      price_paise = coalesce(p_price_paise, s.price_paise),
      duration_minutes = coalesce(p_duration_minutes, s.duration_minutes),
      is_active = v_is_active,
      deleted_at = v_deleted_at
  where s.id = existing.id
    and s.salon_id = target_salon_id;

  return public.nexora_saved_service_payload(existing.id);
end
$$;

create or replace function public.set_saved_service_status(
  p_service_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_status public.nexora_catalog_status := public.nexora_saved_service_status(p_status);
  updated_id uuid;
  v_is_active boolean;
  v_deleted_at timestamptz;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.salon_id = target_salon_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  if target_status = 'inactive' then
    perform public.nexora_assert_service_unlocked(p_service_id, target_salon_id, 'deactivate');
  end if;

  select * into v_is_active, v_deleted_at
  from private.nexora_apply_service_status(target_status);

  update public.services s
  set is_active = v_is_active,
      deleted_at = v_deleted_at
  where s.id = p_service_id
    and s.salon_id = target_salon_id
  returning s.id into updated_id;

  return public.nexora_saved_service_payload(updated_id);
end
$$;

create or replace function public.set_saved_service_active(
  p_service_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  updated_id uuid;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.salon_id = target_salon_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  if not coalesce(p_is_active, false) then
    perform public.nexora_assert_service_unlocked(p_service_id, target_salon_id, 'deactivate');
  end if;

  update public.services s
  set is_active = coalesce(p_is_active, false),
      deleted_at = null
  where s.id = p_service_id
    and s.salon_id = target_salon_id
  returning s.id into updated_id;

  return public.nexora_saved_service_payload(updated_id);
end
$$;

create or replace function public.archive_saved_service(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Archive is the safe path when bookings exist. Appointments are untouched.
  return public.set_saved_service_status(p_service_id, 'archived');
end
$$;

create or replace function public.delete_saved_service(p_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  deleted_id uuid;
  lock jsonb;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.salon_id = target_salon_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  lock := public.nexora_service_safety_lock(p_service_id, target_salon_id);
  if (lock ->> 'package_links')::int > 0 then
    raise exception using errcode = '23503',
      message = 'Remove this service from its package before deleting it.';
  end if;
  perform public.nexora_assert_service_unlocked(p_service_id, target_salon_id, 'delete');

  delete from public.services s
  where s.id = p_service_id
    and s.salon_id = target_salon_id
  returning s.id into deleted_id;

  if deleted_id is null then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  return deleted_id;
end
$$;

create or replace function public.set_saved_service_badge(
  p_service_id uuid,
  p_promotional_badge text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  result_id uuid;
begin
  update public.services s
  set promotional_badge = nullif(btrim(coalesce(p_promotional_badge, '')), '')
  where s.id = p_service_id
    and s.salon_id = target_salon_id
  returning s.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  return result_id;
end
$$;

create or replace function public.upsert_service_price_variant(
  p_theme_id text,
  p_service_id uuid,
  p_variant_id uuid,
  p_name text,
  p_price_paise bigint,
  p_duration_minutes integer,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  clean_name text := btrim(coalesce(p_name, ''));
  result_id uuid;
  next_order integer;
begin
  select t.id into target_theme_uuid from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if clean_name = '' then
    raise exception using errcode = '22023', message = 'Variant name is required.';
  end if;
  if p_price_paise is null or p_price_paise < 0 then
    raise exception using errcode = '22023', message = 'Variant price cannot be negative.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception using errcode = '22023', message = 'Variant duration must be positive.';
  end if;
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id
      and s.salon_id = target_salon_id
      and s.theme_id = target_theme_uuid
      and s.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'Service does not belong to the active theme.';
  end if;

  if p_variant_id is null then
    select coalesce(max(v.display_order), -1) + 1 into next_order
    from public.service_price_variants v
    where v.salon_id = target_salon_id and v.service_id = p_service_id;

    insert into public.service_price_variants (
      salon_id, theme_id, service_id, name, price_paise,
      duration_minutes, status, display_order
    ) values (
      target_salon_id, target_theme_uuid, p_service_id, clean_name,
      p_price_paise, p_duration_minutes,
      public.nexora_saved_service_status(p_status), next_order
    ) returning id into result_id;
  else
    update public.service_price_variants v
    set name = clean_name,
        price_paise = p_price_paise,
        duration_minutes = p_duration_minutes,
        status = public.nexora_saved_service_status(p_status)
    where v.id = p_variant_id
      and v.salon_id = target_salon_id
      and v.theme_id = target_theme_uuid
      and v.service_id = p_service_id
    returning v.id into result_id;
    if result_id is null then
      raise exception using errcode = '42501', message = 'Pricing variant was not found for your salon.';
    end if;
  end if;
  return result_id;
end
$$;

create or replace function public.delete_service_price_variant(p_variant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  result_id uuid;
begin
  delete from public.service_price_variants v
  where v.id = p_variant_id and v.salon_id = target_salon_id
  returning v.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Pricing variant was not found for your salon.';
  end if;
  return result_id;
end
$$;

create or replace function public.create_service_bundle(
  p_theme_id text,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_service_ids uuid[],
  p_discount_type text,
  p_discount_percentage numeric,
  p_fixed_discount_paise bigint,
  p_promotional_badge text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  clean_ids uuid[];
  subtotal bigint;
  total_duration integer;
  final_price bigint;
  result_id uuid;
  next_order integer;
  requested_count integer;
begin
  select t.id into target_theme_uuid from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception using errcode = '22023', message = 'Bundle name is required.';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.service_categories c
    where c.id = p_category_id and c.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '23503', message = 'The selected category does not belong to this theme.';
  end if;

  select coalesce(array_agg(id order by first_seen), '{}'::uuid[])
  into clean_ids
  from (
    select id, min(ordinality) as first_seen
    from unnest(coalesce(p_service_ids, '{}'::uuid[])) with ordinality as u(id, ordinality)
    where id is not null
    group by id
  ) unique_ids;
  requested_count := cardinality(clean_ids);
  if requested_count < 2 then
    raise exception using errcode = '22023', message = 'A bundle must include at least two services.';
  end if;
  if (
    select count(*) from public.services s
    where s.id = any(clean_ids)
      and s.salon_id = target_salon_id
      and s.theme_id = target_theme_uuid
      and s.is_active
      and s.deleted_at is null
  ) <> requested_count then
    raise exception using errcode = '23503', message = 'Bundle services do not belong to the active theme.';
  end if;

  select sum(s.price_paise), sum(s.duration_minutes)::integer
  into subtotal, total_duration
  from public.services s where s.id = any(clean_ids);

  if p_discount_type = 'percentage' then
    if p_discount_percentage is null or p_discount_percentage <= 0 or p_discount_percentage > 100
       or p_fixed_discount_paise is not null then
      raise exception using errcode = '22023', message = 'Percentage discount must be greater than 0 and at most 100.';
    end if;
    final_price := greatest(0, round(subtotal * (100 - p_discount_percentage) / 100.0)::bigint);
  elsif p_discount_type = 'fixed' then
    if p_fixed_discount_paise is null or p_fixed_discount_paise <= 0
       or p_fixed_discount_paise > subtotal or p_discount_percentage is not null then
      raise exception using errcode = '22023', message = 'Fixed discount must be positive and cannot exceed the bundle total.';
    end if;
    final_price := subtotal - p_fixed_discount_paise;
  else
    raise exception using errcode = '22023', message = 'Discount type must be percentage or fixed.';
  end if;

  select coalesce(max(p.display_order), -1) + 1 into next_order
  from public.packages p where p.salon_id = target_salon_id;

  insert into public.packages (
    salon_id, theme_id, category_id, name, description,
    original_price_paise, price_paise, duration_minutes,
    discount_type, discount_percentage, fixed_discount_paise,
    promotional_badge, status, display_order
  ) values (
    target_salon_id, target_theme_uuid, p_category_id, btrim(p_name),
    coalesce(p_description, ''), subtotal, final_price, total_duration,
    p_discount_type::public.nexora_discount_type,
    case when p_discount_type = 'percentage' then p_discount_percentage end,
    case when p_discount_type = 'fixed' then p_fixed_discount_paise end,
    nullif(btrim(coalesce(p_promotional_badge, '')), ''),
    public.nexora_saved_service_status(p_status), next_order
  ) returning id into result_id;

  insert into public.package_services (
    package_id, service_id, salon_id, display_order, service_name_snapshot,
    individual_price_paise, duration_minutes_snapshot
  )
  select result_id, s.id, s.salon_id, u.ordinality - 1, s.name, s.price_paise, s.duration_minutes
  from unnest(clean_ids) with ordinality as u(id, ordinality)
  join public.services s on s.id = u.id
  order by u.ordinality;

  return result_id;
end
$$;

create or replace function public.set_service_bundle_status(
  p_package_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  result_id uuid;
begin
  update public.packages p
  set status = public.nexora_saved_service_status(p_status)
  where p.id = p_package_id
    and p.salon_id = target_salon_id
    and p.theme_id is not null
  returning p.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Bundle was not found for your salon.';
  end if;
  return result_id;
end
$$;

create or replace function public.create_service_offer(
  p_theme_id text,
  p_target_type text,
  p_category_id uuid,
  p_predefined_service_id uuid,
  p_saved_service_id uuid,
  p_package_id uuid,
  p_title text,
  p_promotional_badge text,
  p_discount_type text,
  p_discount_percentage numeric,
  p_fixed_discount_paise bigint,
  p_start_date date,
  p_end_date date,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  result_id uuid;
begin
  select t.id into target_theme_uuid from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if p_target_type not in ('theme', 'category', 'predefined_service', 'saved_service', 'bundle') then
    raise exception using errcode = '22023', message = 'Offer target is invalid.';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception using errcode = '22023', message = 'Offer title is required.';
  end if;
  if btrim(coalesce(p_promotional_badge, '')) = '' then
    raise exception using errcode = '22023', message = 'Promotional badge is required.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = '22023', message = 'Offer end date must be on or after its start date.';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'Offer status must be active or inactive.';
  end if;

  if p_discount_type = 'percentage' then
    if p_discount_percentage is null or p_discount_percentage <= 0 or p_discount_percentage > 100
       or p_fixed_discount_paise is not null then
      raise exception using errcode = '22023', message = 'Percentage discount must be greater than 0 and at most 100.';
    end if;
  elsif p_discount_type = 'fixed' then
    if p_fixed_discount_paise is null or p_fixed_discount_paise <= 0
       or p_discount_percentage is not null then
      raise exception using errcode = '22023', message = 'Fixed discount must be positive.';
    end if;
  else
    raise exception using errcode = '22023', message = 'Discount type must be percentage or fixed.';
  end if;

  if p_target_type = 'theme' then
    if p_category_id is not null or p_predefined_service_id is not null
       or p_saved_service_id is not null or p_package_id is not null then
      raise exception using errcode = '22023', message = 'Theme offers cannot carry another target.';
    end if;
  elsif p_target_type = 'category' then
    if p_category_id is null or p_predefined_service_id is not null
       or p_saved_service_id is not null or p_package_id is not null
       or not exists (select 1 from public.service_categories c where c.id = p_category_id and c.theme_id = target_theme_uuid) then
      raise exception using errcode = '23503', message = 'Offer category does not belong to this theme.';
    end if;
  elsif p_target_type = 'predefined_service' then
    if p_predefined_service_id is null or p_category_id is not null
       or p_saved_service_id is not null or p_package_id is not null
       or not exists (select 1 from public.predefined_services ps where ps.id = p_predefined_service_id and ps.theme_id = target_theme_uuid and ps.is_active) then
      raise exception using errcode = '23503', message = 'Offer service does not belong to this theme.';
    end if;
  elsif p_target_type = 'saved_service' then
    if p_saved_service_id is null or p_category_id is not null
       or p_predefined_service_id is not null or p_package_id is not null
       or not exists (
         select 1 from public.services s
         where s.id = p_saved_service_id
           and s.salon_id = target_salon_id
           and s.theme_id = target_theme_uuid
           and s.predefined_service_id is null
           and s.deleted_at is null
       ) then
      raise exception using errcode = '23503', message = 'Saved custom service does not belong to this theme.';
    end if;
  else
    if p_package_id is null or p_category_id is not null
       or p_predefined_service_id is not null or p_saved_service_id is not null
       or not exists (
         select 1 from public.packages p
         where p.id = p_package_id
           and p.salon_id = target_salon_id
           and p.theme_id = target_theme_uuid
           and p.status <> 'archived'
       ) then
      raise exception using errcode = '23503', message = 'Offer bundle does not belong to this theme.';
    end if;
  end if;

  insert into public.service_offers (
    salon_id, theme_id, target_type, category_id,
    predefined_service_id, saved_service_id, package_id,
    title, promotional_badge, discount_type, discount_percentage,
    fixed_discount_paise, start_date, end_date, status
  ) values (
    target_salon_id, target_theme_uuid, p_target_type::public.nexora_offer_target,
    p_category_id, p_predefined_service_id, p_saved_service_id, p_package_id,
    btrim(p_title), btrim(p_promotional_badge),
    p_discount_type::public.nexora_discount_type,
    case when p_discount_type = 'percentage' then p_discount_percentage end,
    case when p_discount_type = 'fixed' then p_fixed_discount_paise end,
    p_start_date, p_end_date, p_status::public.nexora_catalog_status
  ) returning id into result_id;
  return result_id;
end
$$;

create or replace function public.set_service_offer_status(
  p_offer_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  result_id uuid;
begin
  update public.service_offers o
  set status = case when coalesce(p_is_active, false) then 'active' else 'inactive' end::public.nexora_catalog_status
  where o.id = p_offer_id and o.salon_id = target_salon_id
  returning o.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Offer was not found for your salon.';
  end if;
  return result_id;
end
$$;

create or replace function public.delete_service_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  result_id uuid;
begin
  delete from public.service_offers o
  where o.id = p_offer_id and o.salon_id = target_salon_id
  returning o.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Offer was not found for your salon.';
  end if;
  return result_id;
end
$$;

create or replace function public.upsert_saved_service_translation(
  p_theme_id text,
  p_service_id uuid,
  p_locale text,
  p_name text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  clean_name text := btrim(coalesce(p_name, ''));
  result jsonb;
begin
  if p_locale not in ('en', 'hi') then
    raise exception using errcode = '22023', message = 'Locale is not supported.';
  end if;
  if clean_name = '' then
    raise exception using errcode = '22023', message = 'Translated name is required.';
  end if;
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id
      and s.salon_id = target_salon_id
      and s.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  insert into public.saved_service_translations (
    salon_id, theme_id, service_id, locale, name, description
  ) values (
    target_salon_id, target_theme_uuid, p_service_id,
    p_locale::public.nexora_content_locale, clean_name, coalesce(p_description, '')
  )
  on conflict (service_id, locale) do update
    set name = excluded.name,
        description = excluded.description
  returning jsonb_build_object(
    'locale', locale, 'name', name, 'description', description
  ) into result;
  return result;
end
$$;

create or replace function public.upsert_saved_service_media(
  p_theme_id text,
  p_service_id uuid,
  p_kind text,
  p_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
  clean_url text := btrim(coalesce(p_url, ''));
begin
  if p_kind not in ('image', 'banner', 'icon') then
    raise exception using errcode = '22023', message = 'Media kind must be image, banner, or icon.';
  end if;
  if clean_url = '' then
    raise exception using errcode = '22023', message = 'Media URL is required.';
  end if;
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id
      and s.salon_id = target_salon_id
      and s.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  insert into public.saved_service_media (salon_id, theme_id, service_id)
  values (target_salon_id, target_theme_uuid, p_service_id)
  on conflict (service_id) do nothing;

  if p_kind = 'image' then
    update public.saved_service_media set image_url = clean_url
    where service_id = p_service_id and salon_id = target_salon_id and theme_id = target_theme_uuid;
  elsif p_kind = 'banner' then
    update public.saved_service_media set banner_url = clean_url
    where service_id = p_service_id and salon_id = target_salon_id and theme_id = target_theme_uuid;
  else
    update public.saved_service_media set icon_url = clean_url
    where service_id = p_service_id and salon_id = target_salon_id and theme_id = target_theme_uuid;
  end if;

  return public.nexora_saved_service_media_payload(p_service_id);
end
$$;

create or replace function public.delete_saved_service_media(
  p_theme_id text,
  p_service_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_salon_id uuid := private.nexora_manageable_salon_id();
  target_theme_uuid uuid;
begin
  if p_kind not in ('image', 'banner', 'icon') then
    raise exception using errcode = '22023', message = 'Media kind must be image, banner, or icon.';
  end if;
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if not exists (
    select 1 from public.saved_service_media m
    where m.service_id = p_service_id
      and m.salon_id = target_salon_id
      and m.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '42501', message = 'Service media was not found for your salon.';
  end if;

  if p_kind = 'image' then
    update public.saved_service_media set image_url = null
    where service_id = p_service_id and salon_id = target_salon_id and theme_id = target_theme_uuid;
  elsif p_kind = 'banner' then
    update public.saved_service_media set banner_url = null
    where service_id = p_service_id and salon_id = target_salon_id and theme_id = target_theme_uuid;
  else
    update public.saved_service_media set icon_url = null
    where service_id = p_service_id and salon_id = target_salon_id and theme_id = target_theme_uuid;
  end if;

  return public.nexora_saved_service_media_payload(p_service_id);
end
$$;

-- ===========================================================================
-- 13. Audit trigger on services (canonical salon_service_activity).
-- ===========================================================================
create or replace function public.nexora_record_service_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event text;
  v_salon_id uuid;
  v_service_name text;
  v_previous jsonb := '{}'::jsonb;
  v_next jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_event := 'service_created';
    v_salon_id := new.salon_id;
    v_service_name := new.name;
    v_next := jsonb_build_object(
      'name', new.name,
      'price_paise', new.price_paise,
      'duration_minutes', new.duration_minutes,
      'status', public.nexora_derived_service_status(new.is_active, new.deleted_at),
      'theme_id', new.theme_id
    );
  elsif tg_op = 'DELETE' then
    v_event := 'service_deleted';
    v_salon_id := old.salon_id;
    v_service_name := old.name;
    v_previous := jsonb_build_object(
      'name', old.name,
      'price_paise', old.price_paise,
      'duration_minutes', old.duration_minutes,
      'status', public.nexora_derived_service_status(old.is_active, old.deleted_at)
    );
  else
    v_salon_id := new.salon_id;
    v_service_name := new.name;
    v_previous := jsonb_build_object(
      'name', old.name,
      'price_paise', old.price_paise,
      'duration_minutes', old.duration_minutes,
      'status', public.nexora_derived_service_status(old.is_active, old.deleted_at)
    );
    v_next := jsonb_build_object(
      'name', new.name,
      'price_paise', new.price_paise,
      'duration_minutes', new.duration_minutes,
      'status', public.nexora_derived_service_status(new.is_active, new.deleted_at),
      'theme_id', new.theme_id
    );
    if new.deleted_at is not null and old.deleted_at is null then
      v_event := 'service_archived';
    elsif new.price_paise is distinct from old.price_paise then
      v_event := 'service_price_changed';
    elsif new.duration_minutes is distinct from old.duration_minutes then
      v_event := 'service_duration_changed';
    elsif new.short_description is distinct from old.short_description then
      v_event := 'service_description_changed';
    elsif new.name is distinct from old.name
          or new.is_active is distinct from old.is_active
          or new.deleted_at is distinct from old.deleted_at then
      v_event := 'service_status_changed';
    else
      v_event := 'service_edited';
    end if;
  end if;

  insert into public.salon_service_activity (
    salon_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_salon_id,
    auth.uid(),
    v_event,
    'service',
    coalesce(new.id, old.id),
    jsonb_build_object(
      'action', v_event,
      'service_name', v_service_name,
      'previous', v_previous,
      'next', v_next
    )
  );
  return coalesce(new, old);
end
$$;

drop trigger if exists nexora_record_service_activity on public.services;
create trigger nexora_record_service_activity
after insert or update or delete on public.services
for each row execute function public.nexora_record_service_activity();

-- ===========================================================================
-- 14. Grants for the RPC surface.
-- ===========================================================================
revoke all on function public.get_theme_service_catalog(text) from public;
revoke all on function public.get_saved_services_for_theme(text) from public;
revoke all on function public.get_theme_commerce(text) from public;
revoke all on function public.search_theme_services(text, text) from public;
revoke all on function public.get_theme_service_audit(text) from public;
revoke all on function public.check_theme_service_integrity(text) from public;
revoke all on function public.get_service_safety_lock(uuid) from public;
revoke all on function public.nexora_service_safety_lock(uuid, uuid) from public;
revoke all on function public.nexora_assert_service_unlocked(uuid, uuid, text) from public;
revoke all on function public.save_predefined_services(text, uuid[]) from public;
revoke all on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) from public;
revoke all on function public.update_saved_service(uuid, text, text, bigint, integer, text) from public;
revoke all on function public.set_saved_service_status(uuid, text) from public;
revoke all on function public.set_saved_service_active(uuid, boolean) from public;
revoke all on function public.archive_saved_service(uuid) from public;
revoke all on function public.delete_saved_service(uuid) from public;
revoke all on function public.set_saved_service_badge(uuid, text) from public;
revoke all on function public.upsert_service_price_variant(text, uuid, uuid, text, bigint, integer, text) from public;
revoke all on function public.delete_service_price_variant(uuid) from public;
revoke all on function public.create_service_bundle(text, uuid, text, text, uuid[], text, numeric, bigint, text, text) from public;
revoke all on function public.set_service_bundle_status(uuid, text) from public;
revoke all on function public.create_service_offer(text, text, uuid, uuid, uuid, uuid, text, text, text, numeric, bigint, date, date, text) from public;
revoke all on function public.set_service_offer_status(uuid, boolean) from public;
revoke all on function public.delete_service_offer(uuid) from public;
revoke all on function public.upsert_saved_service_translation(text, uuid, text, text, text) from public;
revoke all on function public.upsert_saved_service_media(text, uuid, text, text) from public;
revoke all on function public.delete_saved_service_media(text, uuid, text) from public;
revoke all on function public.nexora_saved_service_payload(uuid) from public;
revoke all on function public.nexora_translation_array(uuid, public.nexora_catalog_entity, uuid, uuid) from public;
revoke all on function public.nexora_saved_service_translation_array(uuid) from public;
revoke all on function public.nexora_saved_service_media_payload(uuid) from public;
revoke all on function public.nexora_offer_effective_status(public.nexora_catalog_status, date, date) from public;
revoke all on function public.nexora_record_service_activity() from public;
revoke all on function public.set_updated_at() from public;

-- Public catalog reads stay available to unauthenticated clients (landing /
-- theme selection). Everything tenant-scoped is authenticated-only.
grant execute on function public.get_theme_service_catalog(text)
  to anon, authenticated, service_role;
grant execute on function public.nexora_translation_array(uuid, public.nexora_catalog_entity, uuid, uuid)
  to anon, authenticated, service_role;

grant execute on function public.get_saved_services_for_theme(text)
  to authenticated, service_role;
grant execute on function public.get_theme_commerce(text)
  to authenticated, service_role;
grant execute on function public.search_theme_services(text, text)
  to authenticated, service_role;
grant execute on function public.get_theme_service_audit(text)
  to authenticated, service_role;
grant execute on function public.check_theme_service_integrity(text)
  to authenticated, service_role;
grant execute on function public.get_service_safety_lock(uuid)
  to authenticated, service_role;
grant execute on function public.nexora_service_safety_lock(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.nexora_assert_service_unlocked(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.save_predefined_services(text, uuid[])
  to authenticated, service_role;
grant execute on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)
  to authenticated, service_role;
grant execute on function public.update_saved_service(uuid, text, text, bigint, integer, text)
  to authenticated, service_role;
grant execute on function public.set_saved_service_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.set_saved_service_active(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.archive_saved_service(uuid)
  to authenticated, service_role;
grant execute on function public.delete_saved_service(uuid)
  to authenticated, service_role;
grant execute on function public.set_saved_service_badge(uuid, text)
  to authenticated, service_role;
grant execute on function public.upsert_service_price_variant(text, uuid, uuid, text, bigint, integer, text)
  to authenticated, service_role;
grant execute on function public.delete_service_price_variant(uuid)
  to authenticated, service_role;
grant execute on function public.create_service_bundle(text, uuid, text, text, uuid[], text, numeric, bigint, text, text)
  to authenticated, service_role;
grant execute on function public.set_service_bundle_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.create_service_offer(text, text, uuid, uuid, uuid, uuid, text, text, text, numeric, bigint, date, date, text)
  to authenticated, service_role;
grant execute on function public.set_service_offer_status(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.delete_service_offer(uuid)
  to authenticated, service_role;
grant execute on function public.upsert_saved_service_translation(text, uuid, text, text, text)
  to authenticated, service_role;
grant execute on function public.upsert_saved_service_media(text, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.delete_saved_service_media(text, uuid, text)
  to authenticated, service_role;
grant execute on function public.nexora_saved_service_payload(uuid)
  to authenticated, service_role;
grant execute on function public.nexora_saved_service_translation_array(uuid)
  to authenticated, service_role;
grant execute on function public.nexora_saved_service_media_payload(uuid)
  to authenticated, service_role;
grant execute on function public.nexora_offer_effective_status(public.nexora_catalog_status, date, date)
  to authenticated, service_role;
grant execute on function public.nexora_record_service_activity()
  to authenticated, service_role;
grant execute on function public.set_updated_at()
  to authenticated, service_role;

-- ===========================================================================
-- 15. Read-only self-test.
-- ===========================================================================
create or replace function public.verify_m40_service_catalog()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count int;
  v_name text;
  v_detail text := '';
  v_ok boolean := true;
begin
  check_name := 'themes_seeded';
  select count(*) into v_count
  from public.themes t
  where t.is_active
    and t.theme_id in (
      'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
      'family_full_service', 'nail_lash_studio'
    );
  ok := v_count = 5;
  detail := format('%s of 5 canonical themes active', v_count);
  return next;

  check_name := 'categories_seeded';
  select count(*) into v_count
  from public.service_categories c
  join public.themes t on t.id = c.theme_id
  where c.is_active and t.is_active;
  ok := v_count = 17;
  detail := format('%s active categories (expected 17)', v_count);
  return next;

  check_name := 'predefined_services_seeded';
  select count(*) into v_count
  from public.predefined_services ps
  join public.themes t on t.id = ps.theme_id
  where ps.is_active and t.is_active;
  ok := v_count = 78;
  detail := format('%s active predefined services (expected 78)', v_count);
  return next;

  check_name := 'per_theme_catalog_counts';
  select
    count(*) filter (where t.theme_id = 'barber_mens_grooming') = 15
    and count(*) filter (where t.theme_id = 'hair_studio_color_bar') = 17
    and count(*) filter (where t.theme_id = 'beauty_skin_spa') = 18
    and count(*) filter (where t.theme_id = 'family_full_service') = 15
    and count(*) filter (where t.theme_id = 'nail_lash_studio') = 13
  into ok
  from public.predefined_services ps
  join public.themes t on t.id = ps.theme_id
  where ps.is_active;
  detail := 'barber 15 / hair_studio 17 / beauty 18 / family 15 / nail 13';
  return next;

  check_name := 'anti_aging_gold_facial_seed';
  select count(*) into v_count
  from public.predefined_services ps
  join public.themes t on t.id = ps.theme_id
  where t.theme_id = 'beauty_skin_spa'
    and ps.name = 'Anti-Aging Gold Facial'
    and ps.default_price_paise = 240000
    and ps.default_duration_minutes = 60
    and ps.is_active;
  ok := v_count = 1;
  detail := 'Anti-Aging Gold Facial (₹2400, 60 min) present in beauty_skin_spa';
  return next;

  check_name := 'catalog_rpc_exists';
  ok := to_regprocedure('public.get_theme_service_catalog(text)') is not null;
  detail := case when ok then 'get_theme_service_catalog(text)' else 'missing' end;
  return next;

  check_name := 'saved_services_rpc_exists';
  ok := to_regprocedure('public.get_saved_services_for_theme(text)') is not null;
  detail := case when ok then 'get_saved_services_for_theme(text)' else 'missing' end;
  return next;

  check_name := 'commerce_rpc_exists';
  ok := to_regprocedure('public.get_theme_commerce(text)') is not null;
  detail := case when ok then 'get_theme_commerce(text)' else 'missing' end;
  return next;

  check_name := 'create_service_rpc_exists';
  ok := to_regprocedure('public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)') is not null;
  detail := case when ok then 'create_saved_service(...)' else 'missing' end;
  return next;

  check_name := 'manage_service_rpcs_exist';
  ok := to_regprocedure('public.update_saved_service(uuid, text, text, bigint, integer, text)') is not null
    and to_regprocedure('public.set_saved_service_status(uuid, text)') is not null
    and to_regprocedure('public.set_saved_service_active(uuid, boolean)') is not null
    and to_regprocedure('public.archive_saved_service(uuid)') is not null
    and to_regprocedure('public.delete_saved_service(uuid)') is not null;
  detail := case when ok then 'update/status/active/archive/delete present' else 'one or more missing' end;
  return next;

  check_name := 'save_predefined_rpc_exists';
  ok := to_regprocedure('public.save_predefined_services(text, uuid[])') is not null;
  detail := case when ok then 'save_predefined_services(text, uuid[])' else 'missing' end;
  return next;

  check_name := 'commerce_write_rpcs_exist';
  ok := to_regprocedure('public.upsert_service_price_variant(text, uuid, uuid, text, bigint, integer, text)') is not null
    and to_regprocedure('public.delete_service_price_variant(uuid)') is not null
    and to_regprocedure('public.create_service_bundle(text, uuid, text, text, uuid[], text, numeric, bigint, text, text)') is not null
    and to_regprocedure('public.set_service_bundle_status(uuid, text)') is not null
    and to_regprocedure('public.create_service_offer(text, text, uuid, uuid, uuid, uuid, text, text, text, numeric, bigint, date, date, text)') is not null
    and to_regprocedure('public.set_service_offer_status(uuid, boolean)') is not null
    and to_regprocedure('public.delete_service_offer(uuid)') is not null
    and to_regprocedure('public.set_saved_service_badge(uuid, text)') is not null;
  detail := case when ok then 'variant/bundle/offer/badge RPCs present' else 'one or more missing' end;
  return next;

  check_name := 'content_rpcs_exist';
  ok := to_regprocedure('public.upsert_saved_service_translation(text, uuid, text, text, text)') is not null
    and to_regprocedure('public.upsert_saved_service_media(text, uuid, text, text)') is not null
    and to_regprocedure('public.delete_saved_service_media(text, uuid, text)') is not null
    and to_regprocedure('public.search_theme_services(text, text)') is not null;
  detail := case when ok then 'translation/media/search RPCs present' else 'one or more missing' end;
  return next;

  check_name := 'safety_audit_rpcs_exist';
  ok := to_regprocedure('public.get_service_safety_lock(uuid)') is not null
    and to_regprocedure('public.get_theme_service_audit(text)') is not null
    and to_regprocedure('public.check_theme_service_integrity(text)') is not null;
  detail := case when ok then 'safety-lock / audit / integrity RPCs present' else 'one or more missing' end;
  return next;

  check_name := 'tenant_resolver_exists';
  ok := to_regprocedure('private.nexora_manageable_salon_id()') is not null
    and to_regprocedure('public.owner_salon_ids()') is not null;
  detail := case when ok then 'private.nexora_manageable_salon_id() + owner_salon_ids()' else 'missing' end;
  return next;

  check_name := 'services_columns_ready';
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'services'
    and column_name in (
      'salon_id', 'theme_id', 'category_id', 'predefined_service_id',
      'is_active', 'deleted_at', 'promotional_badge', 'short_description',
      'category', 'display_order'
    );
  ok := v_count = 10;
  detail := format('%s of 10 required services columns present', v_count);
  return next;

  check_name := 'commerce_tables_exist';
  ok := to_regclass('public.packages') is not null
    and to_regclass('public.package_services') is not null
    and to_regclass('public.service_price_variants') is not null
    and to_regclass('public.service_offers') is not null
    and to_regclass('public.saved_service_translations') is not null
    and to_regclass('public.saved_service_media') is not null
    and to_regclass('public.salon_service_activity') is not null;
  detail := case when ok then 'packages/package_services/variants/offers/translations/media/activity' else 'one or more missing' end;
  return next;
end
$$;

revoke all on function public.verify_m40_service_catalog() from public;
grant execute on function public.verify_m40_service_catalog() to service_role;

commit;

select check_name, ok, detail
from public.verify_m40_service_catalog()
order by check_name;
