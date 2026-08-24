-- ===========================================================================
-- Nexora Phase 2 — explicit publishing, business-name slugs, public projection
-- ===========================================================================
-- Extends the existing salon_public_websites + white-label host architecture.
-- No second domain/website table is introduced.

begin;

-- Business-name -> safe ASCII slug. Allocation is database-authoritative so
-- duplicate names and concurrent owner setup cannot produce duplicate URLs.
create or replace function private.nexora_business_slug(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_slug text;
begin
  v_slug := lower(btrim(coalesce(p_name, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  v_slug := left(v_slug, 50);
  v_slug := btrim(v_slug, '-');

  if v_slug = '' then v_slug := 'business'; end if;
  if char_length(v_slug) < 3 then v_slug := left(v_slug || '-business', 50); end if;
  if v_slug in (
    'dashboard','builder','nearby','auth','login','signup','register',
    'reset-password','api','admin','www','app','static','assets'
  ) then
    v_slug := left(v_slug || '-business', 50);
  end if;
  return v_slug;
end;
$$;
revoke all on function private.nexora_business_slug(text) from public, anon, authenticated;

create or replace function private.nexora_allocate_business_slug(
  p_name text,
  p_for_salon uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text := private.nexora_business_slug(p_name);
  v_candidate text;
  v_suffix integer := 1;
begin
  -- Serialize allocation for identical base slugs. The unique slug constraint
  -- remains the final invariant, including callers outside this function.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_base));
  loop
    v_candidate := case
      when v_suffix = 1 then v_base
      else left(v_base, 50 - char_length(v_suffix::text) - 1) || '-' || v_suffix::text
    end;
    exit when not exists (
      select 1 from public.salon_public_websites w
      where lower(btrim(w.slug)) = v_candidate
        and (p_for_salon is null or w.salon_id <> p_for_salon)
    );
    v_suffix := v_suffix + 1;
  end loop;
  return v_candidate;
end;
$$;
revoke all on function private.nexora_allocate_business_slug(text, uuid)
  from public, anon, authenticated;

-- Provisioning creates the tenant and a PRIVATE DRAFT website row. It does not
-- make setup data public. The existing RPC signature is intentionally retained.
create or replace function public.provision_owner_salon(
  p_salon_name   text,
  p_slug         text,
  p_template_id  text default 'barber_mens_grooming'
)
returns table (
  out_salon_id        uuid,
  out_organization_id uuid,
  out_slug            text,
  out_template_id     text,
  out_is_published    boolean,
  out_already_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owned_ids uuid[];
  v_org_id uuid;
  v_salon_id uuid;
  v_name text;
  v_slug text;
  v_template text;
  v_theme_id uuid;
  v_website public.salon_public_websites%rowtype;
begin
  if v_user_id is null then
    raise exception 'Please log in to set up your business' using errcode = '28000';
  end if;

  v_name := left(coalesce(nullif(btrim(p_salon_name), ''), 'My Business'), 120);
  v_template := lower(btrim(coalesce(p_template_id, '')));
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then v_template := 'barber_mens_grooming'; end if;

  select t.id into v_theme_id from public.themes t
  where t.theme_id = v_template and t.is_active = true;

  select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_owned_ids from public.owner_salon_ids() as s(id);
  if cardinality(v_owned_ids) > 1 then
    raise exception 'Multiple businesses are linked to your account. Select one first.'
      using errcode = 'P0003';
  end if;

  if cardinality(v_owned_ids) = 1 then
    v_salon_id := v_owned_ids[1];
    select s.organization_id into v_org_id from public.salons s where s.id = v_salon_id;
    select * into v_website from public.salon_public_websites w where w.salon_id = v_salon_id;
    if not found then
      select private.nexora_allocate_business_slug(
        (select s.name from public.salons s where s.id = v_salon_id), v_salon_id
      ) into v_slug;
      insert into public.salon_public_websites
        (salon_id, slug, template_key, config, is_published, published_at)
      values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null)
      returning * into v_website;
    end if;
    return query values (
      v_salon_id, v_org_id, v_website.slug,
      coalesce(v_website.template_key, v_template), v_website.is_published, true
    );
    return;
  end if;

  insert into public.organizations (name, status)
  values (v_name, 'active') returning id into v_org_id;
  insert into public.organization_members (organization_id, user_id, role, is_active)
  values (v_org_id, v_user_id, 'owner', true)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, is_active = excluded.is_active;
  insert into public.salons (organization_id, theme_id, name, is_active)
  values (v_org_id, v_theme_id, v_name, true) returning id into v_salon_id;

  -- p_slug is retained only for backwards-compatible RPC shape. The canonical
  -- slug is generated from the business name and collision-resolved here.
  v_slug := private.nexora_allocate_business_slug(v_name, v_salon_id);
  insert into public.salon_public_websites
    (salon_id, slug, template_key, config, is_published, published_at)
  values (v_salon_id, v_slug, v_template, '{}'::jsonb, false, null);

  update public.profiles set platform_role = 'business_user', is_active = true, updated_at = now()
  where id = v_user_id;

  return query values (v_salon_id, v_org_id, v_slug, v_template, false, false);
end;
$$;
revoke all on function public.provision_owner_salon(text, text, text) from public, anon;
grant execute on function public.provision_owner_salon(text, text, text) to authenticated;

-- Explicit publish. On first publish the URL is generated from the persisted
-- business name and collision-resolved. Once live, republishing preserves the
-- same URL. Template updates therefore never alter business identity/URL.
create or replace function public.publish_owner_salon_website(
  p_slug text,
  p_template_key text default null,
  p_config jsonb default null,
  p_salon_id uuid default null
)
returns table (
  salon_id uuid,
  slug text,
  is_published boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid;
  v_existing public.salon_public_websites%rowtype;
  v_name text;
  v_slug text;
  v_template text;
  v_config jsonb;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);
  v_config := case when p_config is not null and jsonb_typeof(p_config) = 'object'
    then p_config else '{}'::jsonb end;
  v_name := left(coalesce(nullif(btrim(v_config->>'salonName'), ''),
    (select s.name from public.salons s where s.id = v_salon), 'My Business'), 120);
  v_template := lower(btrim(coalesce(p_template_key, '')));
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then raise exception 'Choose one of the five available templates' using errcode = '22023';
  end if;

  select * into v_existing from public.salon_public_websites w where w.salon_id = v_salon;
  if found and v_existing.is_published then
    v_slug := v_existing.slug;
  else
    v_slug := private.nexora_allocate_business_slug(v_name, v_salon);
  end if;

  update public.salons set
    name = v_name,
    theme_id = (select t.id from public.themes t where t.theme_id = v_template and t.is_active = true),
    updated_at = now()
  where id = v_salon;
  update public.organizations o set name = v_name, updated_at = now()
  where o.id = (select s.organization_id from public.salons s where s.id = v_salon);

  if v_existing.salon_id is not null then
    update public.salon_public_websites w set
      slug = v_slug,
      template_key = v_template,
      config = v_config,
      is_published = true,
      published_at = coalesce(w.published_at, now()),
      updated_at = now()
    where w.salon_id = v_salon;
  else
    insert into public.salon_public_websites
      (salon_id, slug, template_key, config, is_published, published_at)
    values (v_salon, v_slug, v_template, v_config, true, now());
  end if;

  return query select w.salon_id, w.slug, w.is_published, w.published_at
  from public.salon_public_websites w where w.salon_id = v_salon;
end;
$$;
revoke all on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  to authenticated;

-- Anonymous-safe public projection. Drafts return zero rows. The complete
-- owner draft/config is never table-readable by anonymous visitors.
create or replace function public.get_public_salon_website(p_slug text)
returns table (
  salon_id uuid,
  slug text,
  template_key text,
  business_name text,
  address text,
  city text,
  public_config jsonb,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    w.slug,
    w.template_key,
    s.name,
    coalesce(
      (select bl.address_label from public.business_locations bl
       where bl.salon_id = s.id and bl.approval_status = 'approved'),
      s.address
    ),
    s.city,
    jsonb_strip_nulls(jsonb_build_object(
      'tagline', w.config->'tagline',
      'about', w.config->'about',
      'phone', case when coalesce((w.config#>>'{contactOptions,callNow}')::boolean, false)
                    then w.config->'phone' end,
      'whatsappPhone', case when coalesce((w.config#>>'{contactOptions,whatsapp}')::boolean, false)
                            then w.config->'whatsappPhone' end,
      'contactOptions', w.config->'contactOptions',
      'bookingRules', w.config->'bookingRules',
      'openingHours', w.config->'openingHours',
      'announcements', w.config->'announcements',
      'holidays', w.config->'holidays',
      'socialProfiles', w.config->'socialProfiles',
      'socialVideos', w.config->'socialVideos',
      'disabledThemeVideoIds', w.config->'disabledThemeVideoIds',
      'packages', w.config->'packages',
      'offers', w.config->'offers',
      'websiteAppearance', w.config->'websiteAppearance',
      'brandColor', w.config->'brandColor',
      'salonNameFont', w.config->'salonNameFont',
      'salonNameColor', w.config->'salonNameColor',
      'reviewedContent', w.config->'reviewedContent',
      'websiteCopy', w.config->'websiteCopy',
      'metaDescription', w.config->'metaDescription',
      'socialShareImageUrl', w.config->'socialShareImageUrl',
      'metaTitle', w.config->'metaTitle',
      'metaKeywords', w.config->'metaKeywords'
    )),
    w.published_at
  from public.salon_public_websites w
  join public.salons s on s.id = w.salon_id
  where lower(w.slug) = lower(btrim(p_slug))
    and p_slug ~ '^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$'
    and w.is_published = true
    and s.is_active = true
    and s.deleted_at is null
$$;
revoke all on function public.get_public_salon_website(text) from public;
grant execute on function public.get_public_salon_website(text) to anon, authenticated, service_role;

-- Public discovery stays on public_salon_catalog. Website resolution stays on
-- the projection RPC. Never grant anonymous users the owner draft table/root.
revoke select on table public.salon_public_websites from anon;
revoke select on table public.salons from anon;
drop policy if exists phase1a_public_salons_read on public.salons;

create or replace function public.verify_phase2_business_publishing()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'public projection exists';
  ok := to_regprocedure('public.get_public_salon_website(text)') is not null;
  detail := 'published-only, field-limited RPC'; return next;
  check_name := 'anon cannot read website drafts';
  ok := not pg_catalog.has_table_privilege('anon', 'public.salon_public_websites', 'SELECT');
  detail := 'full config denied'; return next;
  check_name := 'anon can resolve published sites';
  ok := pg_catalog.has_function_privilege('anon', 'public.get_public_salon_website(text)', 'EXECUTE');
  detail := 'public projection executable'; return next;
  check_name := 'publish remains authenticated only';
  ok := pg_catalog.has_function_privilege('authenticated',
    'public.publish_owner_salon_website(text,text,jsonb,uuid)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',
    'public.publish_owner_salon_website(text,text,jsonb,uuid)', 'EXECUTE');
  detail := 'owner-only state transition'; return next;
end;
$$;
revoke all on function public.verify_phase2_business_publishing() from public, anon, authenticated;
grant execute on function public.verify_phase2_business_publishing() to service_role;

commit;
