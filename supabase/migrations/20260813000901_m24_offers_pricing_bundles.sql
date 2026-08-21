-- M24 (DRAFT) / Phase 9.1: offers, promotional badges, variable pricing,
-- and theme-safe service bundles for all five database-backed themes.
--
-- This migration extends the existing services/packages source of truth. It
-- does not delete, rename, re-link, or infer provenance for any existing row.
-- Existing packages remain valid with NULL theme metadata; only new Phase 9.1
-- bundle RPCs require a complete theme relationship.
--
-- Offer expiration is evaluated from the database date on every management and
-- public read. An offer whose end_date is in the past therefore becomes
-- effective_status='expired' without a browser timer or scheduled job.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Extend the existing canonical service/package records without rewriting any
-- existing service, custom service, or package.
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists promotional_badge text;

alter table public.packages
  add column if not exists theme_id uuid,
  add column if not exists category_id uuid,
  add column if not exists original_price_paise bigint,
  add column if not exists discount_type public.nexora_discount_type,
  add column if not exists discount_percentage numeric(5,2),
  add column if not exists fixed_discount_paise bigint,
  add column if not exists promotional_badge text;

alter table public.package_services
  add column if not exists service_name_snapshot text,
  add column if not exists individual_price_paise bigint,
  add column if not exists duration_minutes_snapshot integer;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_id_business_theme_key'
  ) then
    alter table public.services
      add constraint services_id_business_theme_key unique (id, business_id, theme_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_id_business_theme_key'
  ) then
    alter table public.packages
      add constraint packages_id_business_theme_key unique (id, business_id, theme_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_theme_fk'
  ) then
    alter table public.packages add constraint packages_theme_fk
      foreign key (theme_id) references public.themes(id) on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_category_theme_fk'
  ) then
    alter table public.packages add constraint packages_category_theme_fk
      foreign key (category_id, theme_id)
      references public.service_categories(id, theme_id) on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_category_requires_theme'
  ) then
    alter table public.packages add constraint packages_category_requires_theme
      check (category_id is null or theme_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_phase91_discount_valid'
  ) then
    alter table public.packages add constraint packages_phase91_discount_valid check (
      (original_price_paise is null
        and discount_type is null
        and discount_percentage is null
        and fixed_discount_paise is null)
      or
      (original_price_paise is not null
        and original_price_paise >= price_paise
        and (
          (discount_type = 'percentage'
            and discount_percentage > 0 and discount_percentage <= 100
            and fixed_discount_paise is null)
          or
          (discount_type = 'fixed'
            and fixed_discount_paise > 0
            and fixed_discount_paise <= original_price_paise
            and discount_percentage is null)
        ))
    ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.package_services'::regclass
      and conname = 'package_services_snapshot_price_nonnegative'
  ) then
    alter table public.package_services add constraint package_services_snapshot_price_nonnegative
      check (individual_price_paise is null or individual_price_paise >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.package_services'::regclass
      and conname = 'package_services_snapshot_duration_positive'
  ) then
    alter table public.package_services add constraint package_services_snapshot_duration_positive
      check (duration_minutes_snapshot is null or duration_minutes_snapshot > 0) not valid;
  end if;
end $$;

alter table public.packages validate constraint packages_theme_fk;
alter table public.packages validate constraint packages_category_theme_fk;
alter table public.packages validate constraint packages_category_requires_theme;
alter table public.packages validate constraint packages_phase91_discount_valid;
alter table public.package_services validate constraint package_services_snapshot_price_nonnegative;
alter table public.package_services validate constraint package_services_snapshot_duration_positive;

-- ---------------------------------------------------------------------------
-- Variable prices. A variant references a saved service but never replaces or
-- mutates the saved service's base row/provenance relationship.
-- ---------------------------------------------------------------------------
create table if not exists public.service_price_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  service_id uuid not null,
  name text not null,
  price_paise bigint not null,
  duration_minutes integer,
  status public.nexora_catalog_status not null default 'active',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_price_variants_service_fk
    foreign key (service_id, business_id, theme_id)
    references public.services(id, business_id, theme_id) on delete cascade,
  constraint service_price_variants_name_not_blank check (btrim(name) <> ''),
  constraint service_price_variants_price_nonnegative check (price_paise >= 0),
  constraint service_price_variants_duration_positive
    check (duration_minutes is null or duration_minutes > 0),
  constraint service_price_variants_order_nonnegative check (display_order >= 0),
  constraint service_price_variants_business_service_name_key
    unique (business_id, service_id, name)
);

-- ---------------------------------------------------------------------------
-- Offers. theme_id is mandatory for every target and every target FK includes
-- theme (and tenant where relevant), preventing accidental cross-theme links.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_id_theme_key'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_id_theme_key unique (id, theme_id);
  end if;
end $$;

create table if not exists public.service_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
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
  constraint service_offers_category_theme_fk
    foreign key (category_id, theme_id)
    references public.service_categories(id, theme_id) on delete restrict,
  constraint service_offers_predefined_theme_fk
    foreign key (predefined_service_id, theme_id)
    references public.predefined_services(id, theme_id) on delete restrict,
  constraint service_offers_saved_service_fk
    foreign key (saved_service_id, business_id, theme_id)
    references public.services(id, business_id, theme_id) on delete restrict,
  constraint service_offers_package_fk
    foreign key (package_id, business_id, theme_id)
    references public.packages(id, business_id, theme_id) on delete restrict,
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
  ),
  constraint service_offers_target_shape check (
    (target_type = 'theme'
      and category_id is null and predefined_service_id is null
      and saved_service_id is null and package_id is null)
    or
    (target_type = 'category'
      and category_id is not null and predefined_service_id is null
      and saved_service_id is null and package_id is null)
    or
    (target_type = 'predefined_service'
      and category_id is null and predefined_service_id is not null
      and saved_service_id is null and package_id is null)
    or
    (target_type = 'saved_service'
      and category_id is null and predefined_service_id is null
      and saved_service_id is not null and package_id is null)
    or
    (target_type = 'bundle'
      and category_id is null and predefined_service_id is null
      and saved_service_id is null and package_id is not null)
  )
);

create index if not exists idx_service_variants_business_theme_service
  on public.service_price_variants (business_id, theme_id, service_id, status, display_order);
create index if not exists idx_phase91_packages_business_theme
  on public.packages (business_id, theme_id, status, display_order)
  where theme_id is not null;
create index if not exists idx_service_offers_business_theme_dates
  on public.service_offers (business_id, theme_id, status, start_date, end_date);
create index if not exists idx_service_offers_saved_service
  on public.service_offers (saved_service_id) where saved_service_id is not null;
create index if not exists idx_service_offers_package
  on public.service_offers (package_id) where package_id is not null;

comment on table public.service_price_variants is
  'Variable prices for a saved service. The base service row and provenance remain unchanged.';
comment on table public.service_offers is
  'Tenant and theme-scoped dated offers for theme/category/predefined/custom-saved-service/bundle targets.';
comment on column public.package_services.individual_price_paise is
  'Snapshot of the included service price when the bundle was created.';

-- Updated-at triggers are safe to recreate and use the existing shared helper.
drop trigger if exists set_service_price_variants_updated_at on public.service_price_variants;
create trigger set_service_price_variants_updated_at
before update on public.service_price_variants
for each row execute function public.set_updated_at();

drop trigger if exists set_service_offers_updated_at on public.service_offers;
create trigger set_service_offers_updated_at
before update on public.service_offers
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Public reads happen only through the safe published-site RPC below.
-- ---------------------------------------------------------------------------
alter table public.service_price_variants enable row level security;
alter table public.service_offers enable row level security;

revoke all on table public.service_price_variants from public, anon;
revoke all on table public.service_offers from public, anon;
grant select, insert, update, delete on table public.service_price_variants to authenticated, service_role;
grant select, insert, update, delete on table public.service_offers to authenticated, service_role;

drop policy if exists service_price_variants_manage on public.service_price_variants;
create policy service_price_variants_manage on public.service_price_variants
for all to authenticated
using (public.has_business_role(
  business_id, array['owner_admin', 'manager']::public.nexora_access_role[]
))
with check (public.has_business_role(
  business_id, array['owner_admin', 'manager']::public.nexora_access_role[]
));

drop policy if exists service_offers_manage on public.service_offers;
create policy service_offers_manage on public.service_offers
for all to authenticated
using (public.has_business_role(
  business_id, array['owner_admin', 'manager']::public.nexora_access_role[]
))
with check (public.has_business_role(
  business_id, array['owner_admin', 'manager']::public.nexora_access_role[]
));

-- ---------------------------------------------------------------------------
-- Effective offer state. This is the automatic-expiration source of truth.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- One strict management read for a tenant + theme.
-- ---------------------------------------------------------------------------
create or replace function public.get_theme_commerce(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
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
    'business_id', v.business_id,
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
   and s.business_id = v.business_id
   and s.theme_id = v.theme_id
  where v.business_id = target_business_id
    and v.theme_id = target_theme_uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'business_id', p.business_id,
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
      join public.services s on s.id = ps.service_id and s.business_id = p.business_id
      where ps.package_id = p.id
    ), '[]'::jsonb)
  ) order by p.display_order, p.created_at, p.id), '[]'::jsonb)
  into bundles
  from public.packages p
  where p.business_id = target_business_id
    and p.theme_id = target_theme_uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'business_id', o.business_id,
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
  where o.business_id = target_business_id
    and o.theme_id = target_theme_uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id', s.id,
    'promotional_badge', s.promotional_badge
  ) order by s.display_order, s.id), '[]'::jsonb)
  into service_badges
  from public.services s
  where s.business_id = target_business_id
    and s.theme_id = target_theme_uuid
    and nullif(btrim(s.promotional_badge), '') is not null;

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'theme_uuid', target_theme_uuid,
    'service_badges', service_badges,
    'variants', variants,
    'bundles', bundles,
    'offers', offers
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Direct promotional badge on one saved service.
-- ---------------------------------------------------------------------------
create or replace function public.set_saved_service_badge(
  p_service_id uuid,
  p_promotional_badge text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  result jsonb;
begin
  update public.services s
  set promotional_badge = nullif(btrim(coalesce(p_promotional_badge, '')), '')
  where s.id = p_service_id
    and s.business_id = target_business_id
    and s.theme_id is not null
  returning jsonb_build_object(
    'id', s.id,
    'business_id', s.business_id,
    'theme_id', s.theme_id,
    'promotional_badge', s.promotional_badge
  ) into result;
  if result is null then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  return result;
end
$$;

-- ---------------------------------------------------------------------------
-- Variable pricing management.
-- ---------------------------------------------------------------------------
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
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
      and s.business_id = target_business_id
      and s.theme_id = target_theme_uuid
      and s.status <> 'archived'
  ) then
    raise exception using errcode = '23503', message = 'Service does not belong to the active theme.';
  end if;

  if p_variant_id is null then
    select coalesce(max(v.display_order), -1) + 1 into next_order
    from public.service_price_variants v
    where v.business_id = target_business_id and v.service_id = p_service_id;

    insert into public.service_price_variants (
      business_id, theme_id, service_id, name, price_paise,
      duration_minutes, status, display_order
    ) values (
      target_business_id, target_theme_uuid, p_service_id, clean_name,
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
      and v.business_id = target_business_id
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  result_id uuid;
begin
  delete from public.service_price_variants v
  where v.id = p_variant_id and v.business_id = target_business_id
  returning v.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Pricing variant was not found for your salon.';
  end if;
  return result_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Bundle creation. Included rows must all be saved services from exactly one
-- authenticated tenant and the requested theme. Prices are snapshotted.
-- ---------------------------------------------------------------------------
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
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
      and s.business_id = target_business_id
      and s.theme_id = target_theme_uuid
      and s.status = 'active'
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
  from public.packages p where p.business_id = target_business_id;

  insert into public.packages (
    business_id, theme_id, category_id, name, description,
    original_price_paise, price_paise, duration_minutes,
    discount_type, discount_percentage, fixed_discount_paise,
    promotional_badge, status, display_order
  ) values (
    target_business_id, target_theme_uuid, p_category_id, btrim(p_name),
    coalesce(p_description, ''), subtotal, final_price, total_duration,
    p_discount_type::public.nexora_discount_type,
    case when p_discount_type = 'percentage' then p_discount_percentage end,
    case when p_discount_type = 'fixed' then p_fixed_discount_paise end,
    nullif(btrim(coalesce(p_promotional_badge, '')), ''),
    public.nexora_saved_service_status(p_status), next_order
  ) returning id into result_id;

  insert into public.package_services (
    package_id, service_id, display_order, service_name_snapshot,
    individual_price_paise, duration_minutes_snapshot
  )
  select result_id, s.id, u.ordinality - 1, s.name, s.price_paise, s.duration_minutes
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  result_id uuid;
begin
  update public.packages p
  set status = public.nexora_saved_service_status(p_status)
  where p.id = p_package_id
    and p.business_id = target_business_id
    and p.theme_id is not null
  returning p.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Bundle was not found for your salon.';
  end if;
  return result_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Offer creation/status/delete. Target checks are explicit in addition to the
-- composite FKs so failures remain readable and inactive catalog rows fail.
-- ---------------------------------------------------------------------------
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
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
           and s.business_id = target_business_id
           and s.theme_id = target_theme_uuid
           and s.predefined_service_id is null
           and s.status <> 'archived'
       ) then
      raise exception using errcode = '23503', message = 'Saved custom service does not belong to this theme.';
    end if;
  else
    if p_package_id is null or p_category_id is not null
       or p_predefined_service_id is not null or p_saved_service_id is not null
       or not exists (
         select 1 from public.packages p
         where p.id = p_package_id
           and p.business_id = target_business_id
           and p.theme_id = target_theme_uuid
           and p.status <> 'archived'
       ) then
      raise exception using errcode = '23503', message = 'Offer bundle does not belong to this theme.';
    end if;
  end if;

  insert into public.service_offers (
    business_id, theme_id, target_type, category_id,
    predefined_service_id, saved_service_id, package_id,
    title, promotional_badge, discount_type, discount_percentage,
    fixed_discount_paise, start_date, end_date, status
  ) values (
    target_business_id, target_theme_uuid, p_target_type::public.nexora_offer_target,
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  result_id uuid;
begin
  update public.service_offers o
  set status = case when coalesce(p_is_active, false) then 'active' else 'inactive' end::public.nexora_catalog_status
  where o.id = p_offer_id and o.business_id = target_business_id
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  result_id uuid;
begin
  delete from public.service_offers o
  where o.id = p_offer_id and o.business_id = target_business_id
  returning o.id into result_id;
  if result_id is null then
    raise exception using errcode = '42501', message = 'Offer was not found for your salon.';
  end if;
  return result_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Safe public commerce read. It exposes only active services/variants/bundles
-- and currently effective offers for an already published website.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_commerce_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'service_badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_id', s.id, 'promotional_badge', s.promotional_badge
      ) order by s.display_order, s.id)
      from public.services s
      where s.business_id = b.id and s.status = 'active'
        and nullif(btrim(s.promotional_badge), '') is not null
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'service_id', v.service_id, 'name', v.name,
        'price_paise', v.price_paise, 'duration_minutes', v.duration_minutes
      ) order by v.display_order, v.name)
      from public.service_price_variants v
      join public.services s on s.id = v.service_id and s.business_id = b.id
      where v.business_id = b.id and v.status = 'active' and s.status = 'active'
    ), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'theme_id', p.theme_id, 'category_id', p.category_id,
        'name', p.name, 'description', p.description,
        'original_price_paise', p.original_price_paise,
        'price_paise', p.price_paise, 'duration_minutes', p.duration_minutes,
        'discount_type', p.discount_type,
        'discount_percentage', p.discount_percentage,
        'fixed_discount_paise', p.fixed_discount_paise,
        'promotional_badge', p.promotional_badge,
        'included_services', coalesce((
          select jsonb_agg(jsonb_build_object(
            'service_id', ps.service_id,
            'name', coalesce(ps.service_name_snapshot, s.name),
            'individual_price_paise', coalesce(ps.individual_price_paise, s.price_paise),
            'duration_minutes', coalesce(ps.duration_minutes_snapshot, s.duration_minutes)
          ) order by ps.display_order)
          from public.package_services ps
          join public.services s on s.id = ps.service_id and s.business_id = b.id
          where ps.package_id = p.id
        ), '[]'::jsonb)
      ) order by p.display_order, p.name)
      from public.packages p
      where p.business_id = b.id and p.status = 'active' and p.theme_id is not null
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'theme_id', o.theme_id, 'target_type', o.target_type,
        'category_id', o.category_id, 'predefined_service_id', o.predefined_service_id,
        'saved_service_id', o.saved_service_id, 'package_id', o.package_id,
        'title', o.title, 'promotional_badge', o.promotional_badge,
        'discount_type', o.discount_type,
        'discount_percentage', o.discount_percentage,
        'fixed_discount_paise', o.fixed_discount_paise,
        'start_date', o.start_date, 'end_date', o.end_date,
        'effective_status', 'active'
      ) order by o.end_date, o.created_at)
      from public.service_offers o
      where o.business_id = b.id
        and public.nexora_offer_effective_status(o.status, o.start_date, o.end_date) = 'active'
    ), '[]'::jsonb)
  )
  from public.website_settings ws
  join public.businesses b on b.id = ws.business_id
  where ws.slug = p_slug and ws.publish_status = 'published'
  limit 1
$$;

-- RPC grants are explicit and anonymous access is limited to the safe public
-- published-site read.
revoke all on function public.nexora_offer_effective_status(public.nexora_catalog_status, date, date) from public;
revoke all on function public.get_theme_commerce(text) from public;
revoke all on function public.set_saved_service_badge(uuid, text) from public;
revoke all on function public.upsert_service_price_variant(text, uuid, uuid, text, bigint, integer, text) from public;
revoke all on function public.delete_service_price_variant(uuid) from public;
revoke all on function public.create_service_bundle(text, uuid, text, text, uuid[], text, numeric, bigint, text, text) from public;
revoke all on function public.set_service_bundle_status(uuid, text) from public;
revoke all on function public.create_service_offer(text, text, uuid, uuid, uuid, uuid, text, text, text, numeric, bigint, date, date, text) from public;
revoke all on function public.set_service_offer_status(uuid, boolean) from public;
revoke all on function public.delete_service_offer(uuid) from public;
revoke all on function public.get_public_commerce_by_slug(text) from public;

grant execute on function public.get_theme_commerce(text) to authenticated, service_role;
grant execute on function public.set_saved_service_badge(uuid, text) to authenticated, service_role;
grant execute on function public.upsert_service_price_variant(text, uuid, uuid, text, bigint, integer, text) to authenticated, service_role;
grant execute on function public.delete_service_price_variant(uuid) to authenticated, service_role;
grant execute on function public.create_service_bundle(text, uuid, text, text, uuid[], text, numeric, bigint, text, text) to authenticated, service_role;
grant execute on function public.set_service_bundle_status(uuid, text) to authenticated, service_role;
grant execute on function public.create_service_offer(text, text, uuid, uuid, uuid, uuid, text, text, text, numeric, bigint, date, date, text) to authenticated, service_role;
grant execute on function public.set_service_offer_status(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_service_offer(uuid) to authenticated, service_role;
grant execute on function public.get_public_commerce_by_slug(text) to anon, authenticated, service_role;

commit;
