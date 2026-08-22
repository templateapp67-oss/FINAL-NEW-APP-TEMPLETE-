-- ===========================================================================
-- M39 / Owner self-publish — white-label public website (no hardcoded salon)
-- ===========================================================================
-- Each authenticated salon *owner* publishes their own row on
-- public.salon_public_websites. The client never supplies another tenant's
-- salon_id as authority: ownership is resolved by public.owner_salon_ids().
--
-- SQL Editor: paste this entire file (or docs/m39-run-in-supabase.sql).
-- First executable line BEGIN; last COMMIT;
-- ===========================================================================

begin;

create or replace function private.normalize_website_slug(p_slug text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_slug = '' then
    raise exception 'Choose a website address before publishing'
      using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) < 3 or char_length(v_slug) > 60 then
    raise exception 'Website address must be 3–60 characters: lowercase letters, numbers, and hyphens'
      using errcode = '22023';
  end if;
  if v_slug in (
    'dashboard', 'builder', 'nearby', 'auth', 'login', 'signup', 'register',
    'reset-password', 'api', 'admin', 'www', 'app', 'static', 'assets'
  ) then
    raise exception 'That website address is reserved. Choose another.'
      using errcode = '22023';
  end if;
  return v_slug;
end
$$;

revoke all on function private.normalize_website_slug(text) from public, anon, authenticated;

create or replace function private.owned_publish_salon_id(p_salon_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_salon uuid;
begin
  if auth.uid() is null then
    raise exception 'Please log in to publish your website'
      using errcode = '28000';
  end if;

  select coalesce(array_agg(s.id), array[]::uuid[])
    into v_ids
  from public.owner_salon_ids() as s(id);

  if p_salon_id is not null then
    if not (p_salon_id = any (v_ids)) then
      raise exception 'You can only publish a website for a salon you own'
        using errcode = '42501';
    end if;
    v_salon := p_salon_id;
  else
    if cardinality(v_ids) = 0 then
      raise exception 'No salon is linked to your account yet'
        using errcode = 'P0002';
    end if;
    if cardinality(v_ids) > 1 then
      raise exception 'Multiple salons are linked to your account. Select one shop first.'
        using errcode = 'P0003';
    end if;
    v_salon := v_ids[1];
  end if;

  if not exists (
    select 1 from public.salons s
    where s.id = v_salon
      and s.is_active = true
      and s.deleted_at is null
  ) then
    raise exception 'Your salon is not active'
      using errcode = 'P0002';
  end if;

  return v_salon;
end
$$;

revoke all on function private.owned_publish_salon_id(uuid) from public, anon, authenticated;

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
  v_slug text;
  v_template text;
  v_config jsonb;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);
  v_slug := private.normalize_website_slug(p_slug);
  v_template := coalesce(nullif(btrim(coalesce(p_template_key, '')), ''), 'hair');
  v_config := case
    when p_config is null or jsonb_typeof(p_config) <> 'object' then '{}'::jsonb
    else p_config
  end;

  if exists (
    select 1
    from public.salon_public_websites w
    where lower(btrim(w.slug)) = v_slug
      and w.salon_id is distinct from v_salon
  ) then
    raise exception 'That website address is already in use'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.salon_public_websites w where w.salon_id = v_salon
  ) then
    update public.salon_public_websites w
       set slug = v_slug,
           template_key = v_template,
           config = v_config,
           is_published = true,
           published_at = coalesce(w.published_at, now())
     where w.salon_id = v_salon;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'salon_public_websites'
        and column_name = 'updated_at'
    ) then
      update public.salon_public_websites w
         set updated_at = now()
       where w.salon_id = v_salon;
    end if;
  else
    insert into public.salon_public_websites (
      salon_id, slug, template_key, config, is_published, published_at
    ) values (
      v_salon, v_slug, v_template, v_config, true, now()
    );
  end if;

  return query
    select w.salon_id, w.slug, w.is_published, w.published_at
    from public.salon_public_websites w
    where w.salon_id = v_salon;
end
$$;

create or replace function public.unpublish_owner_salon_website(
  p_salon_id uuid default null
)
returns table (
  salon_id uuid,
  slug text,
  is_published boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);

  update public.salon_public_websites w
     set is_published = false
   where w.salon_id = v_salon;

  if not found then
    raise exception 'No website exists for your salon yet'
      using errcode = 'P0002';
  end if;

  return query
    select w.salon_id, w.slug, w.is_published
    from public.salon_public_websites w
    where w.salon_id = v_salon;
end
$$;

-- Avoid referencing public.salons inside the policy (anon has no GRANT there).
create or replace function private.is_active_public_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.salons s
    where s.id = p_salon_id
      and s.is_active = true
      and s.deleted_at is null
  )
$$;

revoke all on function private.is_active_public_salon(uuid) from public;
grant execute on function private.is_active_public_salon(uuid) to anon, authenticated, service_role;

do $do_spw_public_read$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'salon_public_websites'
      and policyname = 'phase1a_public_websites_published_read'
  ) then
    create policy phase1a_public_websites_published_read
    on public.salon_public_websites
    for select to anon, authenticated
    using (
      is_published = true
      and private.is_active_public_salon(salon_id)
    );
  end if;
end
$do_spw_public_read$;

grant select on table public.salon_public_websites to anon, authenticated;

revoke all on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.unpublish_owner_salon_website(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  to authenticated;
grant execute on function public.unpublish_owner_salon_website(uuid)
  to authenticated;

create or replace function public.verify_m39_owner_publish()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'publish_rpc';
  ok := to_regprocedure('public.publish_owner_salon_website(text, text, jsonb, uuid)') is not null;
  detail := 'owner publish RPC';
  return next;

  check_name := 'unpublish_rpc';
  ok := to_regprocedure('public.unpublish_owner_salon_website(uuid)') is not null;
  detail := 'owner unpublish RPC';
  return next;

  check_name := 'authenticated_can_execute';
  ok := pg_catalog.has_function_privilege(
    'authenticated',
    'public.publish_owner_salon_website(text, text, jsonb, uuid)',
    'EXECUTE'
  );
  detail := 'owners call this from the app; salon_id is not client authority';
  return next;

  check_name := 'anon_cannot_execute';
  ok := not pg_catalog.has_function_privilege(
    'anon',
    'public.publish_owner_salon_website(text, text, jsonb, uuid)',
    'EXECUTE'
  );
  detail := 'public visitors cannot publish';
  return next;
end
$$;

revoke all on function public.verify_m39_owner_publish() from public, anon, authenticated;
grant execute on function public.verify_m39_owner_publish() to authenticated, service_role;

commit;
