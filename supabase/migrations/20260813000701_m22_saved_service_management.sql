-- M22 (DRAFT) / Phase 8.1: complete saved-service management for the five
-- database themes (add, edit, delete, activate/deactivate, price, duration,
-- description, status).
--
-- Rules enforced here:
--   * Every operation derives one manageable tenant from auth.uid(); no client
--     business/salon ID is ever trusted.
--   * theme_id / category_id / predefined_service_id are NEVER writable by an
--     edit or status RPC. Provenance survives every price/duration/description/
--     status change.
--   * Custom ("Other") services keep predefined_service_id NULL and are never
--     converted into a predefined service.
--   * Delete removes only the tenant's own row in public.services. Global
--     themes / service_categories / predefined_services are never touched.
--   * Duplicate saved services are rejected (predefined links and custom names).
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- ---------------------------------------------------------------------------
-- Fail closed if an independently modified/live schema already stores duplicate
-- theme-scoped custom service names. Never delete or merge owner service rows.
-- Legacy/manual rows (theme_id NULL) are intentionally out of scope and remain
-- valid and unique-index free, exactly as M17 documented.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from public.services
    where predefined_service_id is null
      and theme_id is not null
      and status <> 'archived'
    group by business_id, theme_id, lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce custom saved-service uniqueness: duplicate theme-scoped custom service names already exist. Inspect and rename them without deleting owner data before applying M22.';
  end if;
end
$$;

-- One salon cannot save the same custom service name twice inside one theme.
-- Archived rows are excluded so an owner can re-create a service they retired.
create unique index if not exists idx_services_business_theme_custom_name_unique
  on public.services (business_id, theme_id, lower(btrim(name)))
  where predefined_service_id is null
    and theme_id is not null
    and status <> 'archived';

comment on index public.idx_services_business_theme_custom_name_unique is
  'Prevents duplicate custom (predefined_service_id NULL) saved services per salon and theme.';

-- ---------------------------------------------------------------------------
-- Shared read-back payload. Internal only: callers must already have verified
-- ownership. Kept in one place so every management RPC returns the identical
-- shape, including the immutable relationship columns.
-- ---------------------------------------------------------------------------
create or replace function public.nexora_saved_service_payload(p_service_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id,
    'business_id', s.business_id,
    'theme_id', s.theme_id,
    'theme_key', t.theme_id,
    'category_id', s.category_id,
    'predefined_service_id', s.predefined_service_id,
    'name', s.name,
    'category', s.category,
    'description', s.short_description,
    'price_paise', s.price_paise,
    'duration_minutes', s.duration_minutes,
    'status', s.status,
    'is_featured', s.is_featured,
    'display_order', s.display_order
  )
  from public.services s
  left join public.themes t on t.id = s.theme_id
  where s.id = p_service_id;
$$;

-- ---------------------------------------------------------------------------
-- Normalizes and validates a requested saved-service status.
-- ---------------------------------------------------------------------------
create or replace function public.nexora_saved_service_status(p_status text)
returns public.nexora_catalog_status
language plpgsql
immutable
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

-- ---------------------------------------------------------------------------
-- LOAD SAVED SERVICES (unchanged boundary, one extra ordering field)
--
-- Still tenant-derived and theme-scoped. Predefined-linked rows must still
-- resolve to the exact same theme+category predefined row; custom rows
-- (predefined_service_id NULL) are returned as-is and never re-matched.
-- ---------------------------------------------------------------------------
create or replace function public.get_saved_services_for_theme(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
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
    jsonb_build_object(
      'id', s.id,
      'business_id', s.business_id,
      'theme_id', s.theme_id,
      'theme_key', t.theme_id,
      'category_id', s.category_id,
      'predefined_service_id', s.predefined_service_id,
      'name', s.name,
      'category', s.category,
      'description', s.short_description,
      'price_paise', s.price_paise,
      'duration_minutes', s.duration_minutes,
      'status', s.status,
      'is_featured', s.is_featured,
      'display_order', s.display_order
    ) order by s.display_order, s.created_at, s.id
  ), '[]'::jsonb)
  into saved_rows
  from public.services s
  join public.themes t on t.id = s.theme_id
  join public.service_categories c
    on c.id = s.category_id
   and c.theme_id = t.id
  where s.business_id = target_business_id
    and s.theme_id = target_theme_id
    and (s.predefined_service_id is null or exists (
      select 1 from public.predefined_services ps
      where ps.id = s.predefined_service_id
        and ps.theme_id = s.theme_id
        and ps.category_id = s.category_id
    ));

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'services', saved_rows
  );
end
$$;

-- ---------------------------------------------------------------------------
-- ADD SERVICE
--
-- Handles both saved-service kinds with one tenant-safe path:
--   * predefined-linked  → p_predefined_service_id must belong to the exact
--                          active theme + category chain.
--   * custom / "Other"   → p_predefined_service_id stays NULL and is never
--                          guessed from the editable name.
-- ---------------------------------------------------------------------------
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_id uuid;
  target_status public.nexora_catalog_status := public.nexora_saved_service_status(p_status);
  clean_name text := btrim(coalesce(p_name, ''));
  category_name text;
  next_display_order integer;
  new_service_id uuid;
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

  -- The category must belong to the requested theme; cross-theme categories are
  -- rejected before anything is written.
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
      where s.business_id = target_business_id
        and s.predefined_service_id = p_predefined_service_id
    ) then
      raise exception using
        errcode = '23505',
        message = 'This service is already saved for your salon.';
    end if;
  end if;

  -- Duplicate guard for custom services (and for a custom service colliding
  -- with an already saved predefined service of the same name in this theme).
  if exists (
    select 1 from public.services s
    where s.business_id = target_business_id
      and s.theme_id = target_theme_id
      and s.status <> 'archived'
      and lower(btrim(s.name)) = lower(clean_name)
  ) then
    raise exception using
      errcode = '23505',
      message = 'A service with this name is already saved for this theme.';
  end if;

  select coalesce(max(s.display_order), -1) + 1
  into next_display_order
  from public.services s
  where s.business_id = target_business_id;

  insert into public.services (
    business_id,
    theme_id,
    category_id,
    predefined_service_id,
    name,
    category,
    price_paise,
    duration_minutes,
    short_description,
    is_featured,
    status,
    display_order
  ) values (
    target_business_id,
    target_theme_id,
    p_category_id,
    p_predefined_service_id,
    clean_name,
    category_name,
    p_price_paise,
    p_duration_minutes,
    coalesce(p_description, ''),
    false,
    target_status,
    next_display_order
  )
  returning id into new_service_id;

  return public.nexora_saved_service_payload(new_service_id);
end
$$;

-- ---------------------------------------------------------------------------
-- EDIT SERVICE (name / description / price / duration / status)
--
-- Patch semantics: a NULL argument leaves the stored value untouched, so
-- "update price only", "update duration only" and "update description only"
-- are first-class operations. business_id, theme_id, category_id and
-- predefined_service_id are deliberately absent from the SET list, so no edit
-- can break the original theme/category/predefined relationship.
-- ---------------------------------------------------------------------------
drop function if exists public.update_saved_service(uuid, text, text, bigint, integer);

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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  existing public.services%rowtype;
  next_name text;
  next_status public.nexora_catalog_status;
begin
  select s.* into existing
  from public.services s
  where s.id = p_service_id
    and s.business_id = target_business_id;
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
    when p_status is null then existing.status
    else public.nexora_saved_service_status(p_status)
  end;

  if lower(next_name) <> lower(existing.name)
     and existing.theme_id is not null
     and next_status <> 'archived'
     and exists (
       select 1 from public.services s
       where s.business_id = target_business_id
         and s.theme_id = existing.theme_id
         and s.id <> existing.id
         and s.status <> 'archived'
         and lower(btrim(s.name)) = lower(btrim(next_name))
     ) then
    raise exception using
      errcode = '23505',
      message = 'A service with this name is already saved for this theme.';
  end if;

  -- Relationship and ownership columns are deliberately absent from SET.
  update public.services s
  set name = next_name,
      short_description = coalesce(p_description, s.short_description),
      price_paise = coalesce(p_price_paise, s.price_paise),
      duration_minutes = coalesce(p_duration_minutes, s.duration_minutes),
      status = next_status
  where s.id = existing.id
    and s.business_id = target_business_id;

  return public.nexora_saved_service_payload(existing.id);
end
$$;

-- ---------------------------------------------------------------------------
-- CHANGE SERVICE STATUS (active / inactive / archived)
-- Only public.services.status changes; the global catalog row keeps its own
-- is_active flag untouched.
-- ---------------------------------------------------------------------------
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_status public.nexora_catalog_status := public.nexora_saved_service_status(p_status);
  updated_id uuid;
begin
  update public.services s
  set status = target_status
  where s.id = p_service_id
    and s.business_id = target_business_id
  returning s.id into updated_id;

  if updated_id is null then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  return public.nexora_saved_service_payload(updated_id);
end
$$;

-- Activate / deactivate keeps its existing signature and now delegates to the
-- shared status path so both routes behave identically.
create or replace function public.set_saved_service_active(
  p_service_id uuid,
  p_is_active boolean
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.set_saved_service_status(
    p_service_id,
    case when coalesce(p_is_active, false) then 'active' else 'inactive' end
  );
$$;

-- ---------------------------------------------------------------------------
-- DELETE SERVICE
-- Removes only the authenticated tenant's saved row. Global catalog rows are
-- never deleted; the tenant's own staff assignments are detached first so a
-- restrict FK cannot block the owner's delete, and package composition is left
-- to the owner to change explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.delete_saved_service(p_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  deleted_id uuid;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id
      and s.business_id = target_business_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  if exists (
    select 1
    from public.package_services ps
    join public.packages p on p.id = ps.package_id
    where ps.service_id = p_service_id
      and p.business_id = target_business_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Remove this service from its package before deleting it.';
  end if;

  -- Only this salon's own staff assignment links are cleaned up.
  delete from public.staff_services ss
  using public.staff_members sm
  where ss.service_id = p_service_id
    and ss.staff_id = sm.id
    and sm.business_id = target_business_id;

  delete from public.services s
  where s.id = p_service_id
    and s.business_id = target_business_id
  returning s.id into deleted_id;

  if deleted_id is null then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  return deleted_id;
end
$$;

comment on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) is
  'Adds one saved service for the authenticated tenant. Predefined links are validated against the exact theme/category chain; custom services keep predefined_service_id NULL. Duplicates are rejected.';
comment on function public.update_saved_service(uuid, text, text, bigint, integer, text) is
  'Patches name/description/price/duration/status of one tenant saved service. NULL arguments keep the stored value and provenance columns can never change.';
comment on function public.set_saved_service_status(uuid, text) is
  'Changes only the tenant saved-service status (active/inactive/archived); global catalog rows are untouched.';
comment on function public.set_saved_service_active(uuid, boolean) is
  'Activate/deactivate shortcut delegating to public.set_saved_service_status.';
comment on function public.delete_saved_service(uuid) is
  'Deletes only the authenticated tenant saved service row; never global theme/category/predefined rows.';

revoke all on function public.nexora_saved_service_payload(uuid) from public;
revoke all on function public.get_saved_services_for_theme(text) from public;
grant execute on function public.get_saved_services_for_theme(text) to authenticated, service_role;
revoke all on function public.nexora_saved_service_status(text) from public;
revoke all on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) from public;
revoke all on function public.update_saved_service(uuid, text, text, bigint, integer, text) from public;
revoke all on function public.set_saved_service_status(uuid, text) from public;
revoke all on function public.set_saved_service_active(uuid, boolean) from public;
revoke all on function public.delete_saved_service(uuid) from public;

grant execute on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)
  to authenticated, service_role;
grant execute on function public.update_saved_service(uuid, text, text, bigint, integer, text)
  to authenticated, service_role;
grant execute on function public.set_saved_service_status(uuid, text) to authenticated, service_role;
grant execute on function public.set_saved_service_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_saved_service(uuid) to authenticated, service_role;

commit;
