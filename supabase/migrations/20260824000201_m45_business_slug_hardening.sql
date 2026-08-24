-- ===========================================================================
-- M45 — business slug normalization, cross-table collision and URL immutability
-- ===========================================================================
-- Upgrade path for environments where M44 was already applied. Fresh databases
-- receive the same definitions from M44; this migration makes the hardening
-- explicit and safely repeatable for deployed databases.

begin;

alter table public.salons add column if not exists slug text;
create index if not exists salons_slug_lookup_idx
  on public.salons (lower(btrim(slug))) where slug is not null;

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

  if v_slug = '' then v_slug := 'salon'; end if;
  if char_length(v_slug) < 3 then v_slug := left(v_slug || '-salon', 50); end if;
  if v_slug in (
    'dashboard','builder','nearby','auth','login','signup','register',
    'reset-password','api','admin','www','app','static','assets'
  ) then
    v_slug := left(v_slug || '-salon', 50);
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
    ) and not exists (
      select 1 from public.salons s
      where lower(btrim(s.slug)) = v_candidate
        and (p_for_salon is null or s.id <> p_for_salon)
    );
    v_suffix := v_suffix + 1;
  end loop;
  return v_candidate;
end;
$$;
revoke all on function private.nexora_allocate_business_slug(text, uuid)
  from public, anon, authenticated;

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
  -- published_at is the permanent-allocation marker. Unpublishing only changes
  -- visibility, so republishing after a rename cannot change a public URL.
  if found and v_existing.published_at is not null then
    v_slug := v_existing.slug;
  else
    v_slug := private.nexora_allocate_business_slug(v_name, v_salon);
  end if;

  update public.salons set
    name = v_name,
    slug = v_slug,
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

create or replace function public.verify_m45_business_slug_hardening()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_allocator text := pg_catalog.pg_get_functiondef(
    'private.nexora_allocate_business_slug(text,uuid)'::regprocedure
  );
  v_publish text := pg_catalog.pg_get_functiondef(
    'public.publish_owner_salon_website(text,text,jsonb,uuid)'::regprocedure
  );
begin
  check_name := 'empty names fall back to salon';
  ok := private.nexora_business_slug('!!!') = 'salon';
  detail := private.nexora_business_slug('!!!'); return next;

  check_name := 'spaces underscores and symbols normalize to hyphens';
  ok := private.nexora_business_slug('  Foo___---@@ Bar  ') = 'foo-bar';
  detail := private.nexora_business_slug('  Foo___---@@ Bar  '); return next;

  check_name := 'reserved routes cannot be allocated verbatim';
  ok := private.nexora_business_slug('admin') <> 'admin'
    and private.nexora_business_slug('api') <> 'api'
    and private.nexora_business_slug('app') <> 'app'
    and private.nexora_business_slug('www') <> 'www';
  detail := 'admin/api/app/www are transformed'; return next;

  check_name := 'allocator checks website and salon slug namespaces';
  ok := position('public.salon_public_websites' in v_allocator) > 0
    and position('public.salons' in v_allocator) > 0;
  detail := 'one public namespace across both existing slug columns'; return next;

  check_name := 'published_at permanently locks the first public slug';
  ok := position('v_existing.published_at is not null' in lower(v_publish)) > 0;
  detail := 'unpublish and republish preserve the allocated URL'; return next;
end;
$$;

revoke all on function public.verify_m45_business_slug_hardening()
  from public, anon, authenticated;
grant execute on function public.verify_m45_business_slug_hardening() to service_role;

commit;
