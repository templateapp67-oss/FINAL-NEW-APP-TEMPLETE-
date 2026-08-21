-- M28 / Phase 1A: unified identity, salon, catalog, booking, location and media foundation
--
-- This is an additive compatibility migration for the existing Nexora shared
-- schema used by the Main Website and by this Template application at runtime.
-- It deliberately DOES NOT create a second profiles/organizations/salons/
-- services/bookings hierarchy. The preflight fails before any DDL when those
-- canonical roots are absent or have an incompatible ownership key.
--
-- Canonical authorization model:
--   auth.users -> profiles
--   profiles.platform_role: customer | business_user | growth_partner | admin
--   organization_members.role: owner | staff
--   organizations -> salons.organization_id
--
-- `platform_role` is the global application role. `organization_members.role`
-- is the tenant-scoped owner/staff assignment. Neither URL/localStorage nor a
-- client-supplied salon id grants access.

begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Fail closed instead of creating a parallel tenant hierarchy.
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_table text;
  required_column record;
begin
  foreach required_table in array array[
    'profiles', 'organizations', 'organization_members', 'salons',
    'salon_public_websites', 'services', 'staff', 'salon_hours', 'bookings'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception
        'Phase 1A preflight: required canonical table public.% is missing. Do not create a duplicate backend; export and reconcile the live schema first.',
        required_table;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('profiles', 'id'),
      ('profiles', 'platform_role'),
      ('profiles', 'is_active'),
      ('organizations', 'id'),
      ('organization_members', 'organization_id'),
      ('organization_members', 'user_id'),
      ('organization_members', 'is_active'),
      ('salons', 'id'),
      ('salons', 'organization_id'),
      ('salons', 'name'),
      ('salons', 'is_active'),
      ('salons', 'deleted_at'),
      ('salon_public_websites', 'salon_id'),
      ('salon_public_websites', 'slug'),
      ('salon_public_websites', 'template_key'),
      ('salon_public_websites', 'config'),
      ('salon_public_websites', 'is_published'),
      ('services', 'id'),
      ('services', 'salon_id'),
      ('services', 'name'),
      ('services', 'price_paise'),
      ('services', 'duration_minutes'),
      ('staff', 'id'),
      ('staff', 'salon_id'),
      ('staff', 'is_active'),
      ('bookings', 'id'),
      ('bookings', 'salon_id'),
      ('bookings', 'customer_id'),
      ('bookings', 'appointment_start'),
      ('bookings', 'status'),
      ('bookings', 'total_amount_paise')
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
        'Phase 1A preflight: required canonical column public.%.% is missing. Reconcile the existing object instead of creating a competing model.',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;
end
$preflight$;

-- Keep an existing auth.users profile trigger when one is already installed.
-- Otherwise add the minimal idempotent profile bootstrap required by all apps.
create or replace function public.phase1a_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, platform_role, is_active)
  values (new.id, 'customer', true)
  on conflict (id) do nothing;
  return new;
end
$$;
revoke all on function public.phase1a_handle_new_auth_user() from public, anon, authenticated;

do $profile_trigger$
begin
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and (t.tgtype & 1) = 1 -- ROW
      and (t.tgtype & 2) = 0 -- AFTER
      and (t.tgtype & 4) = 4 -- INSERT
  ) then
    create trigger on_auth_user_created_phase1a
      after insert on auth.users
      for each row execute function public.phase1a_handle_new_auth_user();
  end if;
end
$profile_trigger$;

-- ---------------------------------------------------------------------------
-- 2. Identity and tenant-scoped owner/staff roles.
-- ---------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists role text;
alter table public.salons
  add column if not exists address text,
  add column if not exists city text;

-- Existing business_user memberships are the previously established owner
-- authority. Backfill only NULL role values; never overwrite an explicit role.
update public.organization_members om
set role = 'owner'
from public.profiles p
where p.id = om.user_id
  and p.platform_role = 'business_user'
  and om.role is null;

-- Remaining active organization memberships are staff assignments.
update public.organization_members
set role = 'staff'
where role is null;

alter table public.organization_members
  alter column role set not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_role_check'
  ) then
    alter table public.organization_members
      add constraint organization_members_role_check
      check (role in ('owner', 'staff')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_user_profile_fk'
  ) then
    alter table public.organization_members
      add constraint organization_members_user_profile_fk
      foreign key (user_id) references public.profiles(id)
      on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salons'::regclass
      and conname = 'salons_organization_phase1a_fk'
  ) then
    alter table public.salons
      add constraint salons_organization_phase1a_fk
      foreign key (organization_id) references public.organizations(id)
      on delete restrict not valid;
  end if;
end
$constraints$;

alter table public.organization_members
  validate constraint organization_members_role_check;
alter table public.organization_members
  validate constraint organization_members_user_profile_fk;
alter table public.salons
  validate constraint salons_organization_phase1a_fk;

create unique index if not exists organization_members_org_user_unique
  on public.organization_members (organization_id, user_id);
create index if not exists organization_members_user_active_role_idx
  on public.organization_members (user_id, is_active, role, organization_id);
create index if not exists salons_organization_active_idx
  on public.salons (organization_id, is_active)
  where deleted_at is null;
-- A definer-owned, column-limited catalogue is the only anonymous salon-root
-- projection. Slug/publication authority remains salon_public_websites rather
-- than being duplicated on salons.
create or replace view public.public_salon_catalog
with (security_barrier = true)
as
select s.id, s.name, w.slug, s.address, s.city
from public.salons s
join public.salon_public_websites w on w.salon_id = s.id
where s.is_active = true and s.deleted_at is null and w.is_published = true;
revoke all on public.salons from anon;
revoke all on public.public_salon_catalog from public, anon, authenticated;
grant select on public.public_salon_catalog to anon, authenticated;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.platform_role = 'admin'
  )
$$;

create or replace function private.has_salon_role(
  p_salon_id uuid,
  p_roles text[] default array['owner', 'staff']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin() or exists (
    select 1
    from public.salons s
    join public.organization_members om
      on om.organization_id = s.organization_id
    join public.profiles p on p.id = om.user_id
    where s.id = p_salon_id
      and s.deleted_at is null
      and s.is_active = true
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.role = any(p_roles)
      and p.is_active = true
  )
$$;

-- Tighten the helper used by existing owner RLS. Staff can access assigned
-- operational data through has_salon_role(), but cannot manage salon settings.
create or replace function private.can_manage_salon_settings(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_salon_role(p_salon_id, array['owner']::text[])
$$;

create or replace function private.is_public_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.salons s
    where s.id = p_salon_id and s.is_active = true and s.deleted_at is null
  )
$$;

create or replace function public.owner_salon_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.salons s
  join public.organization_members om on om.organization_id = s.organization_id
  join public.profiles p on p.id = om.user_id
  where om.user_id = auth.uid()
    and om.is_active = true
    and om.role = 'owner'
    and p.is_active = true
    and s.is_active = true
    and s.deleted_at is null
  order by s.id
$$;

-- Compatibility alias for the Template application. It delegates to the same
-- canonical authority; it is not a second ownership model.
create or replace function public.nexora_owner_salon_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.owner_salon_ids()
$$;

revoke all on function private.is_active_admin() from public, anon, authenticated;
revoke all on function private.has_salon_role(uuid, text[]) from public, anon, authenticated;
revoke all on function private.can_manage_salon_settings(uuid) from public, anon, authenticated;
revoke all on function private.is_public_salon(uuid) from public, anon, authenticated;
revoke all on function public.owner_salon_ids() from public, anon, authenticated;
revoke all on function public.nexora_owner_salon_ids() from public, anon, authenticated;
grant execute on function private.is_active_admin() to authenticated, service_role;
grant execute on function private.has_salon_role(uuid, text[]) to authenticated, service_role;
grant execute on function private.can_manage_salon_settings(uuid) to authenticated, service_role;
grant execute on function private.is_public_salon(uuid) to anon, authenticated, service_role;
grant execute on function public.owner_salon_ids() to authenticated;
grant execute on function public.nexora_owner_salon_ids() to authenticated;

-- Membership changes remain an administrative/server operation.
alter table public.organization_members enable row level security;
revoke insert, update, delete on public.organization_members from anon, authenticated;
drop policy if exists phase1a_membership_self_read on public.organization_members;
create policy phase1a_membership_self_read
on public.organization_members for select to authenticated
using (user_id = auth.uid() or private.is_active_admin());

-- ---------------------------------------------------------------------------
-- 3. Five global themes and theme-isolated service categories.
-- ---------------------------------------------------------------------------
create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  theme_id text not null unique,
  name text not null,
  description text,
  target_audience text,
  ui_config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase1a_themes_key_not_blank check (btrim(theme_id) <> ''),
  constraint phase1a_themes_name_not_blank check (btrim(name) <> ''),
  constraint phase1a_themes_sort_nonnegative check (sort_order >= 0)
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete restrict,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase1a_service_categories_id_theme_unique unique (id, theme_id),
  constraint phase1a_service_categories_theme_name_unique unique (theme_id, name),
  constraint phase1a_service_categories_name_not_blank check (btrim(name) <> ''),
  constraint phase1a_service_categories_sort_nonnegative check (sort_order >= 0)
);

-- M16 installations predate the category active flag; add it without
-- replacing or rebuilding that existing table.
alter table public.service_categories
  add column if not exists is_active boolean not null default true;

-- These are platform reference rows, not fake salon/business data.
insert into public.themes (theme_id, name, description, sort_order, is_active)
values
  ('barber_mens_grooming', 'Barber & Men''s Grooming', 'Barber and men''s grooming services.', 0, true),
  ('hair_studio_color_bar', 'Hair Studio & Color Bar', 'Hair studio and color services.', 1, true),
  ('beauty_skin_spa', 'Beauty, Skin & Spa', 'Beauty, skin, spa and wellness services.', 2, true),
  ('family_full_service', 'Full-Service Family Salon', 'Full-service family salon services.', 3, true),
  ('nail_lash_studio', 'Nail & Lash Studio', 'Nail, lash and brow studio services.', 4, true)
on conflict (theme_id) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

alter table public.services
  add column if not exists theme_id uuid,
  add column if not exists category_id uuid,
  add column if not exists predefined_service_id uuid,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz,
  add column if not exists display_order integer not null default 0,
  add column if not exists is_featured boolean not null default false;

do $service_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'phase1a_services_salon_fk'
  ) then
    alter table public.services
      add constraint phase1a_services_salon_fk
      foreign key (salon_id) references public.salons(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'phase1a_services_theme_fk'
  ) then
    alter table public.services
      add constraint phase1a_services_theme_fk
      foreign key (theme_id) references public.themes(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'phase1a_services_category_theme_fk'
  ) then
    alter table public.services
      add constraint phase1a_services_category_theme_fk
      foreign key (category_id, theme_id)
      references public.service_categories(id, theme_id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'phase1a_services_price_nonnegative'
  ) then
    alter table public.services
      add constraint phase1a_services_price_nonnegative
      check (price_paise >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'phase1a_services_duration_positive'
  ) then
    alter table public.services
      add constraint phase1a_services_duration_positive
      check (duration_minutes > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'phase1a_services_display_nonnegative'
  ) then
    alter table public.services
      add constraint phase1a_services_display_nonnegative
      check (display_order >= 0) not valid;
  end if;
end
$service_constraints$;

alter table public.services validate constraint phase1a_services_salon_fk;
alter table public.services validate constraint phase1a_services_theme_fk;
alter table public.services validate constraint phase1a_services_category_theme_fk;
alter table public.services validate constraint phase1a_services_price_nonnegative;
alter table public.services validate constraint phase1a_services_duration_positive;
alter table public.services validate constraint phase1a_services_display_nonnegative;

create unique index if not exists services_phase1a_id_salon_unique
  on public.services (id, salon_id);
create index if not exists services_phase1a_salon_theme_active_idx
  on public.services (salon_id, theme_id, is_active, display_order)
  where deleted_at is null;
create index if not exists services_phase1a_category_idx
  on public.services (category_id, theme_id)
  where category_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4. Salon-owned product catalog. No product table existed in the audited
-- shared schema; if an incompatible one appears, fail instead of shadowing it.
-- ---------------------------------------------------------------------------
do $products_preflight$
begin
  if to_regclass('public.products') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'salon_id'
  ) then
    raise exception 'Phase 1A: public.products exists without salon_id; reconcile it instead of creating a duplicate product authority.';
  end if;
end
$products_preflight$;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_id_salon_theme_unique unique (id, salon_id, theme_id),
  constraint product_categories_salon_name_unique unique (salon_id, name),
  constraint product_categories_name_not_blank check (btrim(name) <> ''),
  constraint product_categories_display_nonnegative check (display_order >= 0)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  category_id uuid,
  theme_id uuid not null references public.themes(id) on delete restrict,
  name text not null,
  description text,
  sku text,
  price_paise bigint not null,
  currency text not null default 'INR',
  track_inventory boolean not null default false,
  inventory_quantity integer,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_id_salon_unique unique (id, salon_id),
  constraint products_category_tenant_fk
    foreign key (category_id, salon_id, theme_id)
    references public.product_categories(id, salon_id, theme_id)
    on delete restrict,
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_price_nonnegative check (price_paise >= 0),
  constraint products_currency_inr check (currency = 'INR'),
  constraint products_inventory_consistent check (
    (track_inventory and inventory_quantity is not null and inventory_quantity >= 0)
    or (not track_inventory and (inventory_quantity is null or inventory_quantity >= 0))
  ),
  constraint products_display_nonnegative check (display_order >= 0)
);

create unique index if not exists products_salon_sku_unique
  on public.products (salon_id, lower(sku))
  where sku is not null and deleted_at is null;
create index if not exists products_salon_active_order_idx
  on public.products (salon_id, is_active, display_order)
  where deleted_at is null;
create index if not exists product_categories_salon_active_idx
  on public.product_categories (salon_id, is_active, display_order);

-- ---------------------------------------------------------------------------
-- 5. Canonical owner-submitted/public-approved salon location.
-- ---------------------------------------------------------------------------
create table if not exists public.business_locations (
  salon_id uuid primary key references public.salons(id) on delete cascade,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  address_label text not null,
  approval_status text not null default 'pending',
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  rejection_reason text,
  updated_at timestamptz not null default now(),
  constraint business_locations_latitude_check check (latitude between -90 and 90),
  constraint business_locations_longitude_check check (longitude between -180 and 180),
  constraint business_locations_address_not_blank check (btrim(address_label) <> ''),
  constraint business_locations_approval_check check (approval_status in ('pending', 'approved', 'rejected')),
  constraint business_locations_approval_metadata_check check (
    (approval_status = 'approved' and approved_by is not null and approved_at is not null)
    or approval_status <> 'approved'
  )
);

create index if not exists business_locations_approved_coordinates_idx
  on public.business_locations (latitude, longitude)
  where approval_status = 'approved';

-- ---------------------------------------------------------------------------
-- 6. Booking line items, canonical states and server-side slot holds.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists appointment_end timestamptz,
  add column if not exists staff_id uuid,
  add column if not exists currency text not null default 'INR',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists expires_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $booking_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'phase1a_bookings_customer_fk'
  ) then
    alter table public.bookings
      add constraint phase1a_bookings_customer_fk
      foreign key (customer_id) references public.profiles(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'phase1a_bookings_salon_fk'
  ) then
    alter table public.bookings
      add constraint phase1a_bookings_salon_fk
      foreign key (salon_id) references public.salons(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'phase1a_bookings_staff_fk'
  ) then
    alter table public.bookings
      add constraint phase1a_bookings_staff_fk
      foreign key (staff_id) references public.staff(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'phase1a_bookings_status_check'
  ) then
    alter table public.bookings
      add constraint phase1a_bookings_status_check
      check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'phase1a_bookings_payment_status_check'
  ) then
    alter table public.bookings
      add constraint phase1a_bookings_payment_status_check
      check (payment_status in ('unpaid', 'pending', 'partially_paid', 'paid', 'failed', 'cancelled', 'refunded')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'phase1a_bookings_time_check'
  ) then
    alter table public.bookings
      add constraint phase1a_bookings_time_check
      check (appointment_end is null or appointment_end > appointment_start) not valid;
  end if;
end
$booking_constraints$;

alter table public.bookings validate constraint phase1a_bookings_customer_fk;
alter table public.bookings validate constraint phase1a_bookings_salon_fk;
alter table public.bookings validate constraint phase1a_bookings_staff_fk;
alter table public.bookings validate constraint phase1a_bookings_status_check;
alter table public.bookings validate constraint phase1a_bookings_payment_status_check;
alter table public.bookings validate constraint phase1a_bookings_time_check;

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete restrict,
  service_id uuid not null,
  service_name_snapshot text not null,
  price_paise bigint not null,
  duration_minutes integer not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  constraint booking_services_service_tenant_fk
    foreign key (service_id, salon_id)
    references public.services(id, salon_id)
    on delete restrict,
  constraint booking_services_booking_service_unique unique (booking_id, service_id),
  constraint booking_services_name_not_blank check (btrim(service_name_snapshot) <> ''),
  constraint booking_services_price_nonnegative check (price_paise >= 0),
  constraint booking_services_duration_positive check (duration_minutes > 0),
  constraint booking_services_quantity_positive check (quantity > 0)
);

create table if not exists public.booking_slot_holds (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null,
  staff_id uuid references public.staff(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  idempotency_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_slot_holds_service_tenant_fk
    foreign key (service_id, salon_id)
    references public.services(id, salon_id)
    on delete restrict,
  constraint booking_slot_holds_time_check check (ends_at > starts_at),
  constraint booking_slot_holds_status_check check (status in ('active', 'converted', 'released', 'expired')),
  constraint booking_slot_holds_expiry_check check (expires_at > created_at),
  constraint booking_slot_holds_customer_key_unique unique (customer_id, idempotency_key)
);

-- PostgreSQL cannot put now() in a partial-index predicate. The hold RPC below
-- first marks expired rows, after which this exclusion constraint protects
-- active holds for the same assigned staff member.
do $exclusion$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_slot_holds'::regclass
      and conname = 'booking_slot_holds_staff_overlap_excl'
  ) then
    alter table public.booking_slot_holds
      add constraint booking_slot_holds_staff_overlap_excl
      exclude using gist (
        salon_id with =,
        staff_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (status = 'active' and staff_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_staff_overlap_excl'
  ) then
    alter table public.bookings
      add constraint bookings_staff_overlap_excl
      exclude using gist (
        salon_id with =,
        staff_id with =,
        tstzrange(appointment_start, appointment_end, '[)') with &&
      ) where (
        status in ('pending', 'confirmed')
        and staff_id is not null
        and appointment_end is not null
      );
  end if;
end
$exclusion$;

create index if not exists bookings_customer_start_idx
  on public.bookings (customer_id, appointment_start desc);
create index if not exists bookings_salon_start_status_idx
  on public.bookings (salon_id, appointment_start, status);
create index if not exists booking_services_booking_idx
  on public.booking_services (booking_id);
create index if not exists booking_slot_holds_expiry_idx
  on public.booking_slot_holds (expires_at)
  where status = 'active';

create or replace function public.create_booking_slot_hold(
  p_salon_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_idempotency_key text,
  p_hold_minutes integer default 10
)
returns public.booking_slot_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_row public.services%rowtype;
  result public.booking_slot_holds%rowtype;
  end_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Please log in to reserve a booking slot'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  if p_hold_minutes < 1 or p_hold_minutes > 15 then raise exception 'Hold duration must be between 1 and 15 minutes'; end if;

  select * into service_row
  from public.services
  where id = p_service_id
    and salon_id = p_salon_id
    and is_active = true
    and deleted_at is null;
  if not found then raise exception 'Active service not found for this salon'; end if;

  end_at := p_starts_at + make_interval(mins => service_row.duration_minutes);
  if p_starts_at <= now() or end_at <= p_starts_at then raise exception 'Invalid booking time'; end if;

  update public.booking_slot_holds
  set status = 'expired'
  where status = 'active' and expires_at <= now();

  if exists (
    select 1 from public.bookings b
    where b.salon_id = p_salon_id
      and (p_staff_id is null or b.staff_id = p_staff_id)
      and b.status in ('pending', 'confirmed')
      and b.appointment_end is not null
      and tstzrange(b.appointment_start, b.appointment_end, '[)') && tstzrange(p_starts_at, end_at, '[)')
  ) then raise exception 'Booking slot is no longer available'; end if;

  insert into public.booking_slot_holds (
    salon_id, customer_id, service_id, staff_id, starts_at, ends_at,
    idempotency_key, expires_at
  ) values (
    p_salon_id, auth.uid(), p_service_id, p_staff_id, p_starts_at, end_at,
    p_idempotency_key, now() + make_interval(mins => p_hold_minutes)
  )
  on conflict (customer_id, idempotency_key) do update
    set expires_at = case
      when booking_slot_holds.status = 'active' then excluded.expires_at
      else booking_slot_holds.expires_at
    end
  returning * into result;

  return result;
exception when exclusion_violation then
  raise exception 'Booking slot is temporarily held by another customer';
end
$$;

revoke all on function public.create_booking_slot_hold(uuid, uuid, uuid, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_booking_slot_hold(uuid, uuid, uuid, timestamptz, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Unified salon media metadata (images + external/stored video).
-- ---------------------------------------------------------------------------
create table if not exists public.salon_media (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  theme_id uuid references public.themes(id) on delete restrict,
  service_id uuid,
  product_id uuid,
  media_type text not null,
  storage_bucket text,
  storage_path text,
  external_url text,
  thumbnail_path text,
  platform text,
  title text,
  description text,
  video_kind text,
  status text not null default 'active',
  display_order integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salon_media_service_tenant_fk
    foreign key (service_id, salon_id)
    references public.services(id, salon_id)
    on delete cascade,
  constraint salon_media_product_tenant_fk
    foreign key (product_id, salon_id)
    references public.products(id, salon_id)
    on delete cascade,
  constraint salon_media_type_check check (media_type in ('logo', 'hero', 'gallery', 'owner', 'staff', 'service', 'product', 'video', 'thumbnail')),
  constraint salon_media_source_check check (
    (storage_bucket is not null and storage_path is not null and external_url is null)
    or (storage_bucket is null and storage_path is null and external_url is not null)
  ),
  constraint salon_media_video_kind_check check (video_kind is null or video_kind in ('short', 'long')),
  constraint salon_media_status_check check (status in ('pending', 'active', 'inactive', 'rejected', 'archived')),
  constraint salon_media_display_nonnegative check (display_order >= 0)
);

create index if not exists salon_media_salon_type_status_idx
  on public.salon_media (salon_id, media_type, status, display_order);
create index if not exists salon_media_service_idx
  on public.salon_media (service_id) where service_id is not null;
create index if not exists salon_media_product_idx
  on public.salon_media (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- 8. RLS: tenant isolation and deliberately narrow public reads.
-- ---------------------------------------------------------------------------
do $rls$
declare
  table_name text;
begin
  foreach table_name in array array[
    'themes', 'service_categories', 'services', 'product_categories', 'products',
    'salon_public_websites', 'business_locations', 'bookings', 'booking_services', 'booking_slot_holds',
    'salon_media'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$rls$;

-- Reference catalog: active rows only.
drop policy if exists phase1a_themes_public_read on public.themes;
create policy phase1a_themes_public_read on public.themes
for select to anon, authenticated using (is_active = true);

drop policy if exists phase1a_service_categories_public_read on public.service_categories;
create policy phase1a_service_categories_public_read on public.service_categories
for select to anon, authenticated using (
  is_active = true and exists (
    select 1 from public.themes t
    where t.id = service_categories.theme_id and t.is_active = true
  )
);

-- Published website configuration is the existing canonical public-site root.
-- Owners may save drafts, but browser roles cannot self-publish; publication
-- remains in the established proposal/review RPC workflow.
drop policy if exists spw_public_read_published on public.salon_public_websites;
drop policy if exists phase1a_public_websites_published_read on public.salon_public_websites;
create policy phase1a_public_websites_published_read on public.salon_public_websites
for select to anon, authenticated using (
  is_published = true and private.is_public_salon(salon_id)
);
drop policy if exists phase1a_public_websites_owner_read on public.salon_public_websites;
create policy phase1a_public_websites_owner_read on public.salon_public_websites
for select to authenticated using (private.can_manage_salon_settings(salon_id));
drop policy if exists owner_gate_insert on public.salon_public_websites;
drop policy if exists phase1a_public_websites_owner_draft_insert on public.salon_public_websites;
create policy phase1a_public_websites_owner_draft_insert on public.salon_public_websites
for insert to authenticated with check (
  private.can_manage_salon_settings(salon_id)
  and is_published = false and published_at is null
);
drop policy if exists phase1a_public_websites_owner_draft_update on public.salon_public_websites;
create policy phase1a_public_websites_owner_draft_update on public.salon_public_websites
for update to authenticated
using (private.can_manage_salon_settings(salon_id))
with check (private.can_manage_salon_settings(salon_id));
revoke insert, update, delete on public.salon_public_websites from authenticated;
grant insert (salon_id, slug, template_key, config, is_published, published_at)
  on public.salon_public_websites to authenticated;
grant update (slug, template_key, config)
  on public.salon_public_websites to authenticated;

-- Services: public sees active, non-deleted services of active salons. Owners
-- and assigned staff see only their salon's rows.
drop policy if exists phase1a_services_public_read on public.services;
create policy phase1a_services_public_read on public.services
for select to anon, authenticated using (
  is_active = true and deleted_at is null and private.is_public_salon(salon_id)
);
drop policy if exists phase1a_services_member_all on public.services;
create policy phase1a_services_member_all on public.services
for all to authenticated
using (private.has_salon_role(salon_id))
with check (private.has_salon_role(salon_id));

-- Products and categories.
drop policy if exists phase1a_product_categories_public_read on public.product_categories;
create policy phase1a_product_categories_public_read on public.product_categories
for select to anon, authenticated using (
  is_active = true and private.is_public_salon(salon_id)
);
drop policy if exists phase1a_product_categories_member_all on public.product_categories;
create policy phase1a_product_categories_member_all on public.product_categories
for all to authenticated
using (private.has_salon_role(salon_id))
with check (private.has_salon_role(salon_id));

drop policy if exists phase1a_products_public_read on public.products;
create policy phase1a_products_public_read on public.products
for select to anon, authenticated using (
  is_active = true and deleted_at is null and private.is_public_salon(salon_id)
);
drop policy if exists phase1a_products_member_all on public.products;
create policy phase1a_products_member_all on public.products
for all to authenticated
using (private.has_salon_role(salon_id))
with check (private.has_salon_role(salon_id));

-- Location: public can read approved rows only; owners submit/update their own
-- salon. Approval fields remain an admin/server responsibility.
drop policy if exists phase1a_business_locations_public_read on public.business_locations;
create policy phase1a_business_locations_public_read on public.business_locations
for select to anon, authenticated using (
  approval_status = 'approved' and private.is_public_salon(salon_id)
);
drop policy if exists phase1a_business_locations_owner_read on public.business_locations;
create policy phase1a_business_locations_owner_read on public.business_locations
for select to authenticated using (private.can_manage_salon_settings(salon_id));
drop policy if exists phase1a_business_locations_owner_insert on public.business_locations;
create policy phase1a_business_locations_owner_insert on public.business_locations
for insert to authenticated with check (
  submitted_by = auth.uid() and private.can_manage_salon_settings(salon_id)
  and approval_status = 'pending' and approved_by is null and approved_at is null
);
drop policy if exists phase1a_business_locations_owner_update on public.business_locations;
create policy phase1a_business_locations_owner_update on public.business_locations
for update to authenticated
using (private.can_manage_salon_settings(salon_id))
with check (
  submitted_by = auth.uid() and private.can_manage_salon_settings(salon_id)
  and approval_status = 'pending' and approved_by is null and approved_at is null
);

-- Booking/customer privacy.
drop policy if exists phase1a_bookings_customer_read on public.bookings;
create policy phase1a_bookings_customer_read on public.bookings
for select to authenticated using (customer_id = auth.uid());
drop policy if exists phase1a_bookings_customer_cancel on public.bookings;
create policy phase1a_bookings_customer_cancel on public.bookings
for update to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());
drop policy if exists phase1a_bookings_member_read on public.bookings;
create policy phase1a_bookings_member_read on public.bookings
for select to authenticated using (private.has_salon_role(salon_id));
drop policy if exists phase1a_bookings_member_update on public.bookings;
create policy phase1a_bookings_member_update on public.bookings
for update to authenticated
using (private.has_salon_role(salon_id))
with check (private.has_salon_role(salon_id));

drop policy if exists phase1a_booking_services_related_read on public.booking_services;
create policy phase1a_booking_services_related_read on public.booking_services
for select to authenticated using (
  private.has_salon_role(salon_id) or exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.customer_id = auth.uid()
  )
);

drop policy if exists phase1a_slot_holds_own on public.booking_slot_holds;
create policy phase1a_slot_holds_own on public.booking_slot_holds
for select to authenticated using (
  customer_id = auth.uid() or private.has_salon_role(salon_id)
);

-- Media: only active public-safe media is readable publicly. Owner/staff writes
-- are tenant-scoped, with created_by bound to the current user.
drop policy if exists phase1a_salon_media_public_read on public.salon_media;
create policy phase1a_salon_media_public_read on public.salon_media
for select to anon, authenticated using (
  status = 'active'
  and media_type in ('logo', 'hero', 'gallery', 'owner', 'staff', 'service', 'product', 'video', 'thumbnail')
  and private.is_public_salon(salon_id)
);
drop policy if exists phase1a_salon_media_member_all on public.salon_media;
create policy phase1a_salon_media_member_all on public.salon_media
for all to authenticated
using (private.has_salon_role(salon_id))
with check (private.has_salon_role(salon_id) and created_by = auth.uid());

-- Remove broad public table access, then grant only safe public columns.
revoke all on public.product_categories, public.products, public.business_locations,
  public.booking_services, public.booking_slot_holds, public.salon_media
  from anon, authenticated;
revoke insert, update, delete on public.services from anon;
revoke all on public.bookings from anon;

grant select (id, theme_id, name, sort_order, is_active)
  on public.service_categories to anon, authenticated;
grant select (id, salon_id, theme_id, name, is_active, display_order)
  on public.product_categories to anon, authenticated;
grant select (id, salon_id, category_id, theme_id, name, description, price_paise,
  currency, is_active, is_featured, display_order)
  on public.products to anon, authenticated;
grant select (salon_id, latitude, longitude, address_label, approval_status, updated_at)
  on public.business_locations to anon, authenticated;
grant select (id, salon_id, theme_id, service_id, product_id, media_type,
  storage_bucket, storage_path, external_url, thumbnail_path, platform, title,
  description, video_kind, status, display_order, created_at)
  on public.salon_media to anon, authenticated;

grant select, insert, update, delete on public.product_categories, public.products,
  public.business_locations, public.booking_services, public.booking_slot_holds,
  public.salon_media to authenticated;
grant select, update on public.bookings to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant all on public.product_categories, public.products, public.business_locations,
  public.booking_services, public.booking_slot_holds, public.salon_media to service_role;

commit;
