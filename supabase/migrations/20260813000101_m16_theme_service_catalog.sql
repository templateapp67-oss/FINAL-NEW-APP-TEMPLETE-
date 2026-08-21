-- M16 (DRAFT) / Phase 7.1: global theme service-catalog architecture
--
-- Repository schema inspection found no existing themes, service_categories, or
-- predefined_services tables. public.services is intentionally NOT reused: it
-- is the business-owned/user-edited service catalog and must remain untouched.
--
-- This migration creates structure only. It does not seed any theme, category,
-- predefined service, business service, or salon data.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  theme_id text not null,
  name text not null,
  description text,
  target_audience text,
  ui_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint themes_theme_id_key unique (theme_id),
  constraint themes_theme_id_not_blank check (btrim(theme_id) <> ''),
  constraint themes_name_not_blank check (btrim(name) <> ''),
  constraint themes_ui_config_object check (jsonb_typeof(ui_config) = 'object')
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_theme_fk
    foreign key (theme_id) references public.themes(id) on delete restrict,
  constraint service_categories_id_theme_key unique (id, theme_id),
  constraint service_categories_theme_name_key unique (theme_id, name),
  constraint service_categories_name_not_blank check (btrim(name) <> ''),
  constraint service_categories_sort_order_nonnegative check (sort_order >= 0)
);

create table if not exists public.predefined_services (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null,
  category_id uuid not null,
  name text not null,
  description text,
  is_suggested boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predefined_services_theme_fk
    foreign key (theme_id) references public.themes(id) on delete restrict,
  -- The composite FK is the database-level cross-theme guard. A service can
  -- reference a category only when both rows carry the same theme_id.
  constraint predefined_services_category_theme_fk
    foreign key (category_id, theme_id)
    references public.service_categories(id, theme_id)
    on delete restrict,
  constraint predefined_services_theme_name_key unique (theme_id, name),
  constraint predefined_services_name_not_blank check (btrim(name) <> ''),
  constraint predefined_services_sort_order_nonnegative check (sort_order >= 0)
);

create index if not exists idx_themes_active_order
  on public.themes (is_active, theme_id);
create index if not exists idx_service_categories_theme_order
  on public.service_categories (theme_id, sort_order, id);
create index if not exists idx_predefined_services_category_order
  on public.predefined_services (theme_id, category_id, is_active, sort_order, id);
create index if not exists idx_predefined_services_suggested
  on public.predefined_services (theme_id, sort_order, id)
  where is_active and is_suggested;

comment on table public.themes is
  'Global website-theme metadata. Separate from tenant-owned businesses and services.';
comment on table public.service_categories is
  'Ordered global service categories; every row belongs to one valid theme.';
comment on table public.predefined_services is
  'Global onboarding suggestions only; public.services remains the tenant-owned service source of truth.';
comment on constraint predefined_services_category_theme_fk on public.predefined_services is
  'Prevents a predefined service from referencing a category owned by another theme.';

-- A dedicated function avoids replacing or depending on any legacy generic
-- updated_at function when this phase is reviewed against the live project.
create or replace function public.set_theme_catalog_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

revoke all on function public.set_theme_catalog_updated_at() from public;
grant execute on function public.set_theme_catalog_updated_at() to service_role;

drop trigger if exists set_themes_updated_at on public.themes;
create trigger set_themes_updated_at
before update on public.themes
for each row execute function public.set_theme_catalog_updated_at();

drop trigger if exists set_service_categories_updated_at on public.service_categories;
create trigger set_service_categories_updated_at
before update on public.service_categories
for each row execute function public.set_theme_catalog_updated_at();

drop trigger if exists set_predefined_services_updated_at on public.predefined_services;
create trigger set_predefined_services_updated_at
before update on public.predefined_services
for each row execute function public.set_theme_catalog_updated_at();

-- Theme catalog rows are global, platform-managed reference data. App clients
-- may read only the active catalog; only service_role can mutate it.
alter table public.themes enable row level security;
alter table public.service_categories enable row level security;
alter table public.predefined_services enable row level security;

revoke all on public.themes, public.service_categories, public.predefined_services
  from anon, authenticated;
grant select on public.themes, public.service_categories, public.predefined_services
  to anon, authenticated;
grant all on public.themes, public.service_categories, public.predefined_services
  to service_role;

drop policy if exists themes_active_catalog_read on public.themes;
create policy themes_active_catalog_read
on public.themes for select to anon, authenticated
using (is_active);

drop policy if exists service_categories_active_theme_read on public.service_categories;
create policy service_categories_active_theme_read
on public.service_categories for select to anon, authenticated
using (
  exists (
    select 1
    from public.themes t
    where t.id = service_categories.theme_id
      and t.is_active
  )
);

drop policy if exists predefined_services_active_catalog_read on public.predefined_services;
create policy predefined_services_active_catalog_read
on public.predefined_services for select to anon, authenticated
using (
  is_active
  and exists (
    select 1
    from public.service_categories c
    join public.themes t on t.id = c.theme_id
    where c.id = predefined_services.category_id
      and c.theme_id = predefined_services.theme_id
      and t.is_active
  )
);

commit;
