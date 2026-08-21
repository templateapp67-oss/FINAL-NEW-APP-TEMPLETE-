-- M20 (DRAFT) / Phase 7.4 Session 2: authenticated, tenant-safe saving of
-- predefined services selected from the five database catalogs.
--
-- Existing public.services rows are never deleted, converted, or rewritten.
-- Custom/manual rows remain valid with predefined_service_id NULL.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- Fail closed if an independently modified/live schema already contains
-- duplicate predefined links. Never delete or merge owner service rows.
do $$
begin
  if exists (
    select 1
    from public.services
    where predefined_service_id is not null
    group by business_id, predefined_service_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce saved-service idempotency: duplicate business/predefined service links already exist. Inspect and resolve them without deleting owner data before applying M20.';
  end if;
end
$$;

-- NULL custom/manual provenance is intentionally excluded. Multiple custom
-- services remain allowed; one business can save each predefined service once.
create unique index if not exists idx_services_business_predefined_unique
  on public.services (business_id, predefined_service_id)
  where predefined_service_id is not null;

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
  current_user_id uuid := auth.uid();
  target_business_id uuid;
  business_count integer;
  requested_count integer;
  valid_count integer;
  first_display_order integer;
  inserted_count integer := 0;
  saved_rows jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Please log in to save services.';
  end if;
  if p_theme_id is null or btrim(p_theme_id) = '' then
    raise exception using errcode = '22023', message = 'A theme is required.';
  end if;
  if p_predefined_service_ids is null or cardinality(p_predefined_service_ids) = 0 then
    raise exception using errcode = '22023', message = 'Select at least one predefined service.';
  end if;

  -- Reuse the canonical authenticated tenant membership used by service RLS.
  -- Never accept a client-provided business/salon owner ID.
  select
    count(distinct bm.business_id)::integer,
    (array_agg(distinct bm.business_id))[1]
  into business_count, target_business_id
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  where bm.user_id = current_user_id
    and bm.status = 'active'
    and bm.access_role in ('owner_admin', 'manager')
    and b.status = 'active';

  if business_count = 0 then
    raise exception using errcode = '42501', message = 'No manageable salon is linked to this account.';
  end if;
  if business_count > 1 then
    raise exception using errcode = 'P0001', message = 'Multiple salons are linked to this account. Select a salon before saving services.';
  end if;

  select count(distinct requested_id)::integer
  into requested_count
  from unnest(p_predefined_service_ids) as requested(requested_id)
  where requested_id is not null;

  if requested_count = 0 then
    raise exception using errcode = '22023', message = 'Select at least one predefined service.';
  end if;

  -- Validate the complete input set before inserting anything. Every requested
  -- row must be active and belong to the exact stable theme and category chain.
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
  where s.business_id = target_business_id;

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
  )
  select
    target_business_id,
    numbered.theme_id,
    numbered.category_id,
    numbered.predefined_service_id,
    numbered.name,
    numbered.category_name,
    numbered.default_price_paise,
    numbered.default_duration_minutes,
    numbered.description,
    false,
    'active',
    first_display_order + numbered.order_offset
  from numbered
  on conflict (business_id, predefined_service_id)
    where predefined_service_id is not null
  do nothing;

  get diagnostics inserted_count = row_count;

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
      'is_featured', s.is_featured
    ) order by array_position(p_predefined_service_ids, s.predefined_service_id), s.id
  ), '[]'::jsonb)
  into saved_rows
  from public.services s
  join public.themes t on t.id = s.theme_id
  where s.business_id = target_business_id
    and s.predefined_service_id = any(p_predefined_service_ids)
    and t.theme_id = p_theme_id;

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'requested_count', requested_count,
    'inserted_count', inserted_count,
    'existing_count', requested_count - inserted_count,
    'services', saved_rows
  );
end
$$;

comment on function public.save_predefined_services(text, uuid[]) is
  'Saves active predefined services once for the authenticated user single manageable business. Validates exact theme/category provenance and preserves conflicts unchanged.';

revoke all on function public.save_predefined_services(text, uuid[]) from public;
grant execute on function public.save_predefined_services(text, uuid[])
  to authenticated, service_role;

commit;
