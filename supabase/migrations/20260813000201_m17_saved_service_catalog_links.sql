-- M17 (DRAFT) / Phase 7.2: safely link saved business services to the
-- global theme/category/predefined-service catalog created by M16.
--
-- public.services remains the existing business/salon-owned source of truth.
-- The three provenance columns are nullable so every existing custom/manual
-- service remains valid and unchanged. No row is deleted, rewritten, or
-- automatically matched by mutable names/category text.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- Nullable, metadata-only extension: existing rows receive NULL references and
-- retain business_id, name, category text, price, duration, description,
-- feature flag, status, ordering, and timestamps exactly as stored.
alter table public.services
  add column if not exists theme_id uuid,
  add column if not exists category_id uuid,
  add column if not exists predefined_service_id uuid;

-- PostgreSQL requires the referenced column tuple to be unique. id is already
-- the predefined_services primary key; this wider key additionally supports a
-- declarative FK that validates all three saved provenance values together.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_id_theme_category_key'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_id_theme_category_key
      unique (id, theme_id, category_id);
  end if;
end
$$;

-- A manual/custom service may leave every provenance field NULL. If it stores a
-- category, that category must include its theme. If it stores a predefined
-- service, all three references are mandatory and the composite FK below must
-- match the exact predefined-service tuple.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_category_requires_theme'
  ) then
    alter table public.services
      add constraint services_category_requires_theme
      check (category_id is null or theme_id is not null)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_predefined_reference_complete'
  ) then
    alter table public.services
      add constraint services_predefined_reference_complete
      check (
        predefined_service_id is null
        or (theme_id is not null and category_id is not null)
      )
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_theme_fk'
  ) then
    alter table public.services
      add constraint services_theme_fk
      foreign key (theme_id)
      references public.themes(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_category_theme_fk'
  ) then
    alter table public.services
      add constraint services_category_theme_fk
      foreign key (category_id, theme_id)
      references public.service_categories(id, theme_id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.services'::regclass
      and conname = 'services_predefined_theme_category_fk'
  ) then
    alter table public.services
      add constraint services_predefined_theme_category_fk
      foreign key (predefined_service_id, theme_id, category_id)
      references public.predefined_services(id, theme_id, category_id)
      on delete restrict
      not valid;
  end if;
end
$$;

-- Validation happens inside the same transaction. On a legacy schema with
-- incompatible pre-existing provenance values, the migration fails closed and
-- rolls back rather than deleting data or silently accepting cross-theme links.
alter table public.services validate constraint services_category_requires_theme;
alter table public.services validate constraint services_predefined_reference_complete;
alter table public.services validate constraint services_theme_fk;
alter table public.services validate constraint services_category_theme_fk;
alter table public.services validate constraint services_predefined_theme_category_fk;

create index if not exists idx_services_business_theme_status_order
  on public.services (business_id, theme_id, status, display_order)
  where theme_id is not null;
create index if not exists idx_services_category_theme_reference
  on public.services (category_id, theme_id)
  where category_id is not null;
create index if not exists idx_services_predefined_reference
  on public.services (predefined_service_id, theme_id, category_id)
  where predefined_service_id is not null;

comment on column public.services.theme_id is
  'Optional provenance FK for a saved predefined service; NULL for legacy/custom services.';
comment on column public.services.category_id is
  'Optional normalized category provenance; legacy category text remains preserved in services.category.';
comment on column public.services.predefined_service_id is
  'Optional source predefined service. Composite FK enforces the same theme and category.';
comment on constraint services_predefined_theme_category_fk on public.services is
  'Prevents saved salon services from linking to a predefined service under another theme or category.';

commit;
