-- M67 / BUG FIX: "This service is already saved for your salon" on re-add.
--
-- Symptom: adding / re-adding / updating a saved service for the salon
-- workspace threw "This service is already saved for your salon." even though
-- the row was soft-deleted (archived, `deleted_at IS NOT NULL`) or the
-- duplicate was only in stale frontend state.
--
-- Root causes fixed here (Design-B / canonical `services` table):
--   1. `create_saved_service` checked the predefined-service duplicate guard
--      against EVERY row, including archived ones. The partial unique indexes
--      (`services_salon_predefined_unique`,
--      `services_salon_theme_custom_name_unique`) deliberately EXCLUDE
--      soft-deleted rows so a retired service can be saved again — but the RPC
--      guard still raised before the insert, dead-ending the owner.
--   2. The add path was INSERT-only. Re-adding a retired service now UPSERTS:
--      the existing archived row is revived in place (`deleted_at = null`,
--      `is_active = true`, submitted values applied) instead of erroring or
--      inserting a duplicate visible copy.
--   3. `save_predefined_services` (Add Selected) revived nothing: a retired
--      suggested service got a fresh active row while the archived row stayed
--      in the list. It now revives the archived row (values preserved, exactly
--      like its DO-NOTHING idempotency for live rows) before the insert.
--
-- Genuine duplicates are still rejected: a LIVE row for the same
-- (salon_id, predefined_service_id) or the same normalized custom name keeps
-- the readable "already saved" errors, and a custom name can never hijack a
-- predefined-linked row (provenance stays immutable).
--
-- Additive and idempotent. Only the two write RPCs are redefined; schema,
-- unique indexes, read RPCs and grants are untouched.
begin;

-- ---------------------------------------------------------------------------
-- create_saved_service — add / re-add / update with revive-on-soft-delete.
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

    -- A LIVE row for this predefined link is a genuine duplicate (the partial
    -- unique index `services_salon_predefined_unique` excludes soft-deleted
    -- rows, so it cannot be inserted twice either). Archived rows are retired
    -- services the owner is re-adding — they are revived below, not rejected.
    if exists (
      select 1 from public.services s
      where s.salon_id = target_salon_id
        and s.predefined_service_id = p_predefined_service_id
        and s.deleted_at is null
    ) then
      raise exception using
        errcode = '23505',
        message = 'This service is already saved for your salon.';
    end if;

    -- Re-add after archive: revive the most recent soft-deleted row in place
    -- (upsert semantics — clear the soft-delete flag, apply the submitted
    -- values) instead of inserting a duplicate visible copy.
    update public.services s
    set name = clean_name,
        category = category_name,
        price_paise = p_price_paise,
        duration_minutes = p_duration_minutes,
        short_description = coalesce(p_description, ''),
        is_active = true,
        deleted_at = null
    where s.id = (
      select s2.id
      from public.services s2
      where s2.salon_id = target_salon_id
        and s2.predefined_service_id = p_predefined_service_id
        and s2.deleted_at is not null
      order by s2.created_at desc, s2.id
      limit 1
    )
    returning s.id into new_service_id;
  else
    -- Duplicate guard for custom services (and custom names colliding with an
    -- already saved predefined service of the same name in this theme).
    -- Archived rows are excluded exactly like the partial unique index
    -- `services_salon_theme_custom_name_unique`, so retired names are
    -- re-addable and are revived below.
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

    -- Re-add after archive for a Custom / "Other" service: revive the most
    -- recent soft-deleted CUSTOM row (predefined_service_id IS NULL) with the
    -- same normalized name. A custom name can never revive a predefined-linked
    -- row — that would rewrite provenance.
    update public.services s
    set name = clean_name,
        category = category_name,
        price_paise = p_price_paise,
        duration_minutes = p_duration_minutes,
        short_description = coalesce(p_description, ''),
        is_active = true,
        deleted_at = null
    where s.id = (
      select s2.id
      from public.services s2
      where s2.salon_id = target_salon_id
        and s2.theme_id = target_theme_id
        and s2.predefined_service_id is null
        and s2.deleted_at is not null
        and lower(btrim(s2.name)) = lower(clean_name)
      order by s2.created_at desc, s2.id
      limit 1
    )
    returning s.id into new_service_id;
  end if;

  -- No existing row was revived — insert a brand-new saved service.
  if new_service_id is null then
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
  end if;

  return public.nexora_saved_service_payload(new_service_id);
end
$$;

-- ---------------------------------------------------------------------------
-- save_predefined_services — Add Selected now revives retired services too.
--
-- Live rows stay untouched (the ON CONFLICT DO NOTHING contract is preserved,
-- so re-running Add Selected never overwrites owner edits). Archived rows for
-- the requested predefined ids are revived BEFORE the insert: their
-- soft-delete flag is cleared so the insert for that id conflicts with the
-- partial unique index and is skipped — no duplicate rows, owner values kept.
-- ---------------------------------------------------------------------------
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

  -- Validate the complete input set before touching anything.
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

  -- Revive archived (soft-deleted) rows for the requested predefined services
  -- that have NO live counterpart. The insert below then conflicts with
  -- `services_salon_predefined_unique` (which now matches the revived row) and
  -- is skipped, so re-adding a retired suggested service restores the existing
  -- row instead of inserting a duplicate visible copy.
  update public.services s
  set deleted_at = null,
      is_active = true
  where s.id in (
    select distinct on (s2.predefined_service_id) s2.id
    from public.services s2
    where s2.salon_id = target_salon_id
      and s2.predefined_service_id = any(p_predefined_service_ids)
      and s2.predefined_service_id is not null
      and s2.deleted_at is not null
      and not exists (
        select 1 from public.services s3
        where s3.salon_id = s2.salon_id
          and s3.predefined_service_id = s2.predefined_service_id
          and s3.deleted_at is null
      )
    order by s2.predefined_service_id, s2.created_at desc, s2.id
  );

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

comment on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) is
  'Adds one saved service for the authenticated tenant (upsert semantics). Predefined links are validated against the exact theme/category chain; custom services keep predefined_service_id NULL. Live duplicates are rejected; archived (soft-deleted) rows are revived in place instead of erroring.';
comment on function public.save_predefined_services(text, uuid[]) is
  'Saves active predefined services once for the authenticated user single manageable business. Validates exact theme/category provenance, preserves live conflicts unchanged, and revives archived (soft-deleted) rows for the requested ids.';

-- Re-assert the tenant-scoped grants (CREATE OR REPLACE preserves them, but the
-- explicit surface below keeps the boundary auditable).
revoke all on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) from public;
revoke all on function public.save_predefined_services(text, uuid[]) from public;
grant execute on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)
  to authenticated, service_role;
grant execute on function public.save_predefined_services(text, uuid[])
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-verification (read-only, service_role like the other verifiers).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m67_saved_service_upsert()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_create text := pg_catalog.pg_get_functiondef(
    'public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)'::regprocedure
  );
  v_save text := pg_catalog.pg_get_functiondef(
    'public.save_predefined_services(text, uuid[])'::regprocedure
  );
begin
  check_name := 'create_saved_service duplicate guard excludes soft-deleted rows';
  ok := position('and s.deleted_at is null' in v_create) > 0
    and position('This service is already saved for your salon.' in v_create) > 0;
  detail := 'predefined guard filters deleted_at is null; archived rows are no longer rejected';
  return next;

  check_name := 'create_saved_service revives archived rows (deleted_at = null)';
  ok := (select count(*)::integer from regexp_matches(v_create, 'deleted_at = null', 'g')) >= 2;
  detail := 'predefined + custom re-add paths both clear the soft-delete flag';
  return next;

  check_name := 'create_saved_service never rewrites provenance on revive';
  ok := position('and s2.predefined_service_id is null' in v_create) > 0;
  detail := 'custom re-add can only revive custom (predefined_service_id NULL) rows';
  return next;

  check_name := 'save_predefined_services revives archived rows before the insert';
  ok := position('deleted_at = null' in v_save) > 0
    and position('do nothing' in v_save) > 0;
  detail := 'revive update + idempotent ON CONFLICT DO NOTHING insert both present';
  return next;

  check_name := 'tenant-scoped write grants preserved; anon cannot write';
  ok := pg_catalog.has_function_privilege('authenticated',
        'public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated',
        'public.save_predefined_services(text, uuid[])', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',
        'public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',
        'public.save_predefined_services(text, uuid[])', 'EXECUTE');
  detail := 'authenticated/service_role execute; anon denied on both write RPCs';
  return next;
end;
$$;

revoke all on function public.verify_m67_saved_service_upsert()
  from public, anon, authenticated;
grant execute on function public.verify_m67_saved_service_upsert() to service_role;

commit;
