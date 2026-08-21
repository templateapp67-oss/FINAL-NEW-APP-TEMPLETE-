-- M21 (DRAFT) / Phase 7.4 Session 3: final saved-service read, edit,
-- activate/deactivate, and tenant-owned delete integration.
--
-- All operations derive one manageable tenant from auth.uid(). Relationship
-- columns are read-only in edit RPCs. Global themes/categories/predefined rows
-- are never updated or deleted by these functions.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

create or replace function public.nexora_current_manageable_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  target_business_id uuid;
  business_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Please log in to manage services.';
  end if;

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
    raise exception using errcode = 'P0001', message = 'Multiple salons are linked to this account. Select a salon before managing services.';
  end if;
  return target_business_id;
end
$$;

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
      'is_featured', s.is_featured
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

create or replace function public.update_saved_service(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_price_paise bigint,
  p_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  saved public.services%rowtype;
  theme_key text;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception using errcode = '22023', message = 'Service name is required.';
  end if;
  if p_price_paise is null or p_price_paise < 0 then
    raise exception using errcode = '22023', message = 'Service price cannot be negative.';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception using errcode = '22023', message = 'Service duration must be positive.';
  end if;

  -- Relationship and ownership columns are deliberately absent from SET.
  update public.services s
  set name = btrim(p_name),
      short_description = coalesce(p_description, ''),
      price_paise = p_price_paise,
      duration_minutes = p_duration_minutes
  where s.id = p_service_id
    and s.business_id = target_business_id
  returning s.* into saved;

  if not found then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  select t.theme_id into theme_key from public.themes t where t.id = saved.theme_id;

  return jsonb_build_object(
    'id', saved.id, 'business_id', saved.business_id,
    'theme_id', saved.theme_id, 'theme_key', theme_key,
    'category_id', saved.category_id,
    'predefined_service_id', saved.predefined_service_id,
    'name', saved.name, 'category', saved.category,
    'description', saved.short_description,
    'price_paise', saved.price_paise,
    'duration_minutes', saved.duration_minutes,
    'status', saved.status, 'is_featured', saved.is_featured
  );
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
  target_business_id uuid := public.nexora_current_manageable_business_id();
  saved public.services%rowtype;
  theme_key text;
begin
  update public.services s
  set status = case
    when coalesce(p_is_active, false) then 'active'::public.nexora_catalog_status
    else 'inactive'::public.nexora_catalog_status
  end
  where s.id = p_service_id
    and s.business_id = target_business_id
  returning s.* into saved;

  if not found then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  select t.theme_id into theme_key from public.themes t where t.id = saved.theme_id;

  return jsonb_build_object(
    'id', saved.id, 'business_id', saved.business_id,
    'theme_id', saved.theme_id, 'theme_key', theme_key,
    'category_id', saved.category_id,
    'predefined_service_id', saved.predefined_service_id,
    'name', saved.name, 'category', saved.category,
    'description', saved.short_description,
    'price_paise', saved.price_paise,
    'duration_minutes', saved.duration_minutes,
    'status', saved.status, 'is_featured', saved.is_featured
  );
end
$$;

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

comment on function public.get_saved_services_for_theme(text) is
  'Loads only the authenticated manageable business saved services for one exact active theme.';
comment on function public.update_saved_service(uuid, text, text, bigint, integer) is
  'Edits mutable saved-service fields only; theme/category/predefined provenance cannot change.';
comment on function public.set_saved_service_active(uuid, boolean) is
  'Activates/deactivates only the authenticated tenant saved row; global catalog rows are untouched.';
comment on function public.delete_saved_service(uuid) is
  'Deletes only the authenticated tenant saved service row; never global theme/category/predefined rows.';

revoke all on function public.nexora_current_manageable_business_id() from public;
revoke all on function public.get_saved_services_for_theme(text) from public;
revoke all on function public.update_saved_service(uuid, text, text, bigint, integer) from public;
revoke all on function public.set_saved_service_active(uuid, boolean) from public;
revoke all on function public.delete_saved_service(uuid) from public;

grant execute on function public.get_saved_services_for_theme(text) to authenticated, service_role;
grant execute on function public.update_saved_service(uuid, text, text, bigint, integer) to authenticated, service_role;
grant execute on function public.set_saved_service_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_saved_service(uuid) to authenticated, service_role;

commit;
