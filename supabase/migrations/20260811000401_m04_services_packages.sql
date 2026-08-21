-- M04 (DRAFT): services and packages (single catalog source)
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  category text,
  price_paise bigint not null,
  duration_minutes integer not null,
  short_description text,
  is_featured boolean not null default false,
  status public.nexora_catalog_status not null default 'active',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_price_nonnegative check (price_paise >= 0),
  constraint services_duration_positive check (duration_minutes > 0),
  constraint services_display_order_nonnegative check (display_order >= 0),
  constraint services_id_business_key unique (id, business_id)
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  price_paise bigint not null,
  duration_minutes integer,
  description text,
  is_featured boolean not null default false,
  status public.nexora_catalog_status not null default 'active',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_price_nonnegative check (price_paise >= 0),
  constraint packages_duration_positive check (duration_minutes is null or duration_minutes > 0),
  constraint packages_display_order_nonnegative check (display_order >= 0),
  constraint packages_id_business_key unique (id, business_id)
);

create table if not exists public.package_services (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint package_services_pair_key unique (package_id, service_id),
  constraint package_services_display_order_nonnegative check (display_order >= 0)
);

comment on column public.services.short_description is 'Final AI-reviewed public copy; no duplicate service-content table.';

commit;
