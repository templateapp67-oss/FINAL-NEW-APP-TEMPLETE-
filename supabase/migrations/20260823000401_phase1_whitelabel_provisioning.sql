-- ===========================================================================
-- White-label automatic provisioning + dynamic subdomain/path website binding
-- ===========================================================================
-- Required signature:
--   public.provision_owner_salon(
--     p_salon_name   text,
--     p_slug         text,
--     p_template_id  text default 'barber_mens_grooming'
--   )
--
-- This is the Vite/Express white-label application (NOT Next.js). Dynamic
-- routing is already implemented on both layers:
--   * server/hostRouting.ts  — Express host-header rewrite
--                              royal-hair-studio.<base> → /royal-hair-studio
--   * src/main.tsx           — client RootRouter for /<slug> and subdomains
--   * src/components/PublicSalonView.tsx — dynamic site renderer that loads
--                              the published salon_public_websites row + its
--                              services/media and renders <TemplateRenderer/>.
--
-- What this migration adds is the missing backend link so a brand-new owner
-- website is LIVE immediately at its unique slug/subdomain:
--
--   1. provision_owner_salon(...) — SECURITY DEFINER, authenticated only.
--      Atomically creates the organization, owner membership, salon, AND the
--      PUBLISHED salon_public_websites row keyed by the unique slug. Idempotent
--      for an owner who already has a salon (returns it, never duplicates).
--   2. set_owner_salon_template(p_template_id) — data-safe template switch.
--      Updates ONLY salons.theme_id + salon_public_websites.template_key. It
--      never touches services, products, bookings, payments, location or
--      membership — those are keyed by salon_id and survive any switch.
--
-- Ownership note: the canonical model has NO organizations.owner_id column;
-- ownership is expressed through organization_members.role='owner' (the same
-- chain owner_salon_ids()/can_manage_salon_settings() enforce). This migration
-- uses that existing table rather than inventing a competing owner_id column.

begin;

-- The earlier M42 migration shipped a 2-arg provision_owner_salon(text,text)
-- that returned a 3-column shape. This migration supersedes it with a richer
-- 6-column shape (including the live slug/published flag). Drop the old
-- signature so there is no ambiguous overload between it and the new 2-arg
-- variant; the 3-arg canonical function below is the source of truth.
drop function if exists public.provision_owner_salon(text, text);

-- ---------------------------------------------------------------------------
-- 0. Slug normaliser (shared). Identical rules to private.normalize_website_slug
--    (M39) but kept local here so this migration is self-contained.
-- ---------------------------------------------------------------------------
create or replace function private.nexora_normalize_provision_slug(p_slug text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_slug = '' then
    raise exception 'Choose a website address' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(v_slug) < 3
     or char_length(v_slug) > 60 then
    raise exception
      'Website address must be 3–60 characters: lowercase letters, numbers, and hyphens'
      using errcode = '22023';
  end if;
  if v_slug in (
    'dashboard','builder','nearby','auth','login','signup','register',
    'reset-password','api','admin','www','app','static','assets'
  ) then
    raise exception 'That website address is reserved. Choose another.'
      using errcode = '22023';
  end if;
  return v_slug;
end;
$$;
revoke all on function private.nexora_normalize_provision_slug(text) from public, anon;

-- ---------------------------------------------------------------------------
-- 1. provision_owner_salon — atomic self-provisioning with a LIVE website slug.
-- ---------------------------------------------------------------------------
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
  v_user_id      uuid := auth.uid();
  v_owned_ids    uuid[];
  v_org_id       uuid;
  v_salon_id     uuid;
  v_existing_org uuid;
  v_name         text;
  v_slug         text;
  v_template_key text;
  v_theme_id     uuid;
  v_slug_owner   uuid;
begin
  if v_user_id is null then
    raise exception 'Please log in to create your salon website'
      using errcode = '28000';
  end if;

  v_name := coalesce(nullif(btrim(p_salon_name), ''), 'My Salon');
  if char_length(v_name) > 120 then
    v_name := left(v_name, 120);
  end if;

  v_slug := private.nexora_normalize_provision_slug(p_slug);

  v_template_key := lower(btrim(coalesce(p_template_id, '')));
  if v_template_key not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then
    v_template_key := 'barber_mens_grooming';
  end if;

  select t.id into v_theme_id
  from public.themes t
  where t.theme_id = v_template_key and t.is_active = true;

  -- Existing owner? Return their salon + current slug/template unchanged
  -- (idempotent; a re-call must never rename, re-slug or duplicate a salon).
  select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_owned_ids
  from public.owner_salon_ids() as s(id);

  if cardinality(v_owned_ids) > 1 then
    raise exception
      'Multiple salons are linked to your account. Select a salon first.'
      using errcode = 'P0003';
  end if;

  if cardinality(v_owned_ids) = 1 then
    select s.organization_id into v_existing_org
    from public.salons s where s.id = v_owned_ids[1];
    return query
      select s.id, s.organization_id, w.slug,
             coalesce(w.template_key, v_template_key),
             coalesce(w.is_published, false),
             true
      from public.salons s
      left join public.salon_public_websites w on w.salon_id = s.id
      where s.id = v_owned_ids[1];
    return;
  end if;

  -- New salon: the requested slug must not already belong to another salon.
  select w.salon_id into v_slug_owner
  from public.salon_public_websites w
  where lower(btrim(w.slug)) = v_slug
  limit 1;
  if v_slug_owner is not null then
    raise exception 'That website address is already in use. Try another.'
      using errcode = '23505';
  end if;

  insert into public.organizations (name, status)
  values (v_name, 'active')
  returning id into v_org_id;

  -- Ownership is expressed through the canonical membership table. The
  -- BEFORE INSERT client guard (M36) does not apply to SECURITY DEFINER
  -- execution, which is the trusted provisioning path.
  insert into public.organization_members
    (organization_id, user_id, role, is_active)
  values (v_org_id, v_user_id, 'owner', true)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, is_active = excluded.is_active;

  insert into public.salons
    (organization_id, theme_id, name, is_active)
  values (v_org_id, v_theme_id, v_name, true)
  returning id into v_salon_id;

  -- LIVE white-label website row: this is what makes
  --   https://<slug>.<base-host>/  and  https://<base-host>/<slug>
  -- resolve to the owner's template. is_published = true on creation.
  insert into public.salon_public_websites
    (salon_id, slug, template_key, config, is_published, published_at)
  values
    (v_salon_id, v_slug, v_template_key, '{}'::jsonb, true, now());

  update public.profiles
     set platform_role = 'business_user', is_active = true, updated_at = now()
   where id = v_user_id;

  return query values
    (v_salon_id, v_org_id, v_slug, v_template_key, true, false);
end;
$$;

revoke all on function public.provision_owner_salon(text, text, text) from public, anon;
grant execute on function public.provision_owner_salon(text, text, text) to authenticated;

-- Note: the earlier M42 2-arg provision_owner_salon(text,text) variant was
-- DROPPED at the top of this migration. The 3-arg form above is the single
-- canonical entry point (name, slug, template_id). Callers without an
-- explicit slug should derive one from the salon name client-side (the
-- frontend does this via deriveSlug() in ownerProvisioning.ts).

-- ---------------------------------------------------------------------------
-- 2. set_owner_salon_template — data-safe template switching.
--    Updates presentation references ONLY. Services/products/bookings/payments/
--    location are keyed by salon_id (and services by salon_id+theme_id) and
--    are never touched, so switching A→B→A is fully reversible with no data
--    loss. The salon is resolved from the session; no client-supplied salon id
--    is accepted.
-- ---------------------------------------------------------------------------
create or replace function public.set_owner_salon_template(
  p_template_id text
)
returns table (
  out_salon_id    uuid,
  out_template_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_owned_ids  uuid[];
  v_salon_id   uuid;
  v_template   text;
  v_theme_id   uuid;
begin
  if v_user_id is null then
    raise exception 'Please log in to change your template'
      using errcode = '28000';
  end if;

  v_template := lower(btrim(coalesce(p_template_id, '')));
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) then
    raise exception 'Choose one of the five available templates'
      using errcode = '22023';
  end if;

  select t.id into v_theme_id
  from public.themes t where t.theme_id = v_template and t.is_active = true;
  if v_theme_id is null then
    raise exception 'Template not found';
  end if;

  select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_owned_ids from public.owner_salon_ids() as s(id);
  if cardinality(v_owned_ids) = 0 then
    raise exception 'No salon is linked to your account yet' using errcode = 'P0002';
  end if;
  if cardinality(v_owned_ids) > 1 then
    raise exception 'Multiple salons are linked to your account. Select a salon first.'
      using errcode = 'P0003';
  end if;
  v_salon_id := v_owned_ids[1];

  -- Presentation-only columns. No service/product/booking/payment/location
  -- row is read or written here.
  update public.salons
     set theme_id = v_theme_id, updated_at = now()
   where id = v_salon_id and deleted_at is null;

  update public.salon_public_websites
     set template_key = v_template, updated_at = now()
   where salon_id = v_salon_id;

  return query values (v_salon_id, v_template);
end;
$$;
revoke all on function public.set_owner_salon_template(text) from public, anon;
grant execute on function public.set_owner_salon_template(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS — published website slugs are publicly readable (the existing
--    M28/M39 policy already does this for active public salons; re-assert it
--    defensively so a fresh provisioned row is reachable at /<slug>).
--
--    We use DROP POLICY IF EXISTS + CREATE POLICY (rather than a
--    pg_policies-guarded DO block) so the migration is idempotent across
--    re-runs without relying on conditional DDL inside PL/pgSQL.
-- ---------------------------------------------------------------------------
drop policy if exists phase1a_public_websites_published_read
  on public.salon_public_websites;
create policy phase1a_public_websites_published_read
on public.salon_public_websites
for select to anon, authenticated
using (
  is_published = true
  -- Use the SECURITY DEFINER helper so the public/active check bypasses RLS
  -- on salons. A direct exists(select ... from salons) would itself be
  -- evaluated under the anon role and return no rows when salons has no
  -- anon SELECT policy (the M28 owner-only policy is for authenticated only),
  -- making every published site invisible to anonymous visitors.
  and private.is_public_salon(salon_id)
);

-- Re-assert table-level SELECT grants so anonymous visitors can read the
-- published website row (row filtering is done by the policy above). M28
-- revoked these and M37 re-grants; this keeps a fresh provisioned site
-- reachable at /<slug> without depending on migration ordering.
grant select on table public.salons to anon, authenticated;
grant select on table public.salon_public_websites to anon, authenticated;

-- Allow anonymous visitors to read the salon a published website points to
-- (the published-read policy above already gates visibility through
-- is_public_salon; this lets the dynamic renderer fetch the salon name,
-- hours, and branding without a service-role key). Scoped to active,
-- non-deleted salons only.
drop policy if exists phase1a_public_salons_read
  on public.salons;
create policy phase1a_public_salons_read
on public.salons
for select to anon, authenticated
using (is_active = true and deleted_at is null);

-- Anonymous reads are row-filtered by the published-read policy above; this
-- re-asserts the owner-only draft policy so unpublished drafts stay private.
drop policy if exists phase1a_public_websites_owner_read
  on public.salon_public_websites;
create policy phase1a_public_websites_owner_read
on public.salon_public_websites
for select to authenticated
using (private.can_manage_salon_settings(salon_id));

-- ---------------------------------------------------------------------------
-- 4. Self-test.
-- ---------------------------------------------------------------------------
create or replace function public.verify_phase1_whitelabel()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'provision_owner_salon(text,text,text) exists';
  ok := to_regprocedure('public.provision_owner_salon(text,text,text)') is not null;
  detail := case when ok then 'present' else 'missing' end; return next;

  check_name := 'provision granted to authenticated only';
  select not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name='provision_owner_salon'
      and grantee='anon'
  ) into ok;
  detail := case when ok then 'anon denied' else 'anon CAN execute' end; return next;

  check_name := 'set_owner_salon_template exists';
  ok := to_regprocedure('public.set_owner_salon_template(text)') is not null;
  detail := case when ok then 'present' else 'missing' end; return next;

  check_name := 'published websites publicly readable';
  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='salon_public_websites'
      and policyname='phase1a_public_websites_published_read'
  ) into ok;
  detail := case when ok then 'policy present' else 'policy missing' end; return next;
end;
$$;
revoke all on function public.verify_phase1_whitelabel() from public, anon;
grant execute on function public.verify_phase1_whitelabel() to authenticated, service_role;

commit;
