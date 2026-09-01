-- ============================================================================
-- M69 — custom domain (CNAME) routing + white-label / testimonial projection
-- ============================================================================
-- Audit findings this migration closes:
--
--   1. `salon_public_websites` has no custom-domain columns, so a tenant could
--      never point their own domain (e.g. www.artsbyuma.com) at their published
--      site. The only routing modes were the platform subdomain and the
--      `base/<slug>` path form. `website_settings.custom_domain` exists in the
--      DRAFT M07 schema but was never applied and is a different table.
--
--   2. `get_public_salon_website` projects an explicit ALLOWLIST of config
--      keys. Two new business fields — `whiteLabel` (per-tenant platform badge
--      / theme overrides) and `testimonials` (owner-authored social proof) —
--      were therefore saved by the builder but silently dropped from the live
--      public website. This migration projects them, plus the owner identity
--      stat fields (`yearsOfExperience`, `happyCustomers`) that the public
--      templates already render.
--
-- Security model (unchanged from M39/M44/M51/M52/M68):
--   * Resolution is anonymous-safe and returns ONLY published, verified rows
--     whose salon is active and whose template is active.
--   * An UNVERIFIED domain resolves to nothing: a tenant cannot hijack a
--     hostname they have not proven control of, and a typo'd/pending domain can
--     never serve another tenant's site.
--   * Only the owning salon (via `private.owned_publish_salon_id`) may set or
--     clear a domain; only `service_role` may mark one verified.
--   * `set search_path = ''` on every SECURITY DEFINER function.
--   * Owner-scoped functions are revoked from anon; the anonymous resolver is
--     granted to anon + authenticated + service_role only.
--
-- Migration is additive and idempotent (new nullable columns + new/replaced
-- functions + NOT VALID check constraints + unique index). No table, column or
-- row is dropped, and no existing projection key is removed.
--
-- NOT APPLIED: like M01-M68, this file is drafted for review. It must be
-- applied through the reviewed live-migration runbook, never bulk-applied.

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns: custom domain + verification lifecycle.
--    Status mirrors the `public.nexora_domain_status` enum already created by
--    M01 ('not_configured' | 'pending' | 'verified' | 'failed').
-- ---------------------------------------------------------------------------
alter table public.salon_public_websites
  add column if not exists custom_domain text,
  add column if not exists custom_domain_status public.nexora_domain_status
    not null default 'not_configured',
  add column if not exists custom_domain_verified_at timestamptz;

-- Domain format guard (NOT VALID so pre-existing rows are never rewritten).
-- Allows `example.com`, `www.example.com`, `salon.example.co.uk`; rejects
-- protocols, paths, ports, credentials, IP literals and single-label hosts.
alter table public.salon_public_websites
  drop constraint if exists salon_public_websites_custom_domain_format;

alter table public.salon_public_websites
  add constraint salon_public_websites_custom_domain_format
  check (
    custom_domain is null
    or custom_domain ~ '^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ) not valid;

-- A verified timestamp is only meaningful once the domain is verified.
alter table public.salon_public_websites
  drop constraint if exists salon_public_websites_domain_verified_time;

alter table public.salon_public_websites
  add constraint salon_public_websites_domain_verified_time
  check (
    (custom_domain_status = 'verified') = (custom_domain_verified_at is not null)
  ) not valid;

-- One domain belongs to one tenant, case-insensitively, and only when set.
create unique index if not exists salon_public_websites_custom_domain_uidx
  on public.salon_public_websites (lower(btrim(custom_domain)))
  where custom_domain is not null;

-- ---------------------------------------------------------------------------
-- 2. Domain normalisation + validation helpers.
--    Mirrors the client helper `src/lib/customDomain.ts` so the browser and the
--    database agree on what a valid custom domain is. The database is the
--    authority; the client check is presentation-only.
-- ---------------------------------------------------------------------------
create or replace function private.nexora_normalize_domain(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  -- Strip an accidental scheme, path, query, port and credentials: owners
  -- routinely paste "https://www.Example.com/about?x=1".
  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
  v := split_part(v, '/', 1);
  v := split_part(v, '?', 1);
  v := split_part(v, '#', 1);
  v := split_part(v, ':', 1);
  if position('@' in v) > 0 then
    v := split_part(v, '@', 2);
  end if;
  -- Collapse a trailing dot (FQDN form) and any whitespace.
  v := btrim(both ' .' from v);
  return nullif(v, '');
end;
$$;

revoke all on function private.nexora_normalize_domain(text) from public, anon, authenticated;

create or replace function private.nexora_is_valid_domain(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.nexora_normalize_domain(p_value) is not null
     and private.nexora_normalize_domain(p_value)
         ~ '^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
$$;

revoke all on function private.nexora_is_valid_domain(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. ANONYMOUS RESOLVER — host -> published salon.
--    Returns at most one row, only for a VERIFIED domain on a PUBLISHED site.
--    This is the function the edge/server calls for CNAME-mapped hosts; it is
--    deliberately read-only and leaks nothing beyond routing data.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_public_salon_by_domain(p_host text)
returns table (
  salon_id uuid,
  slug text,
  template_key text,
  custom_domain text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.salon_id, w.slug, w.template_key, w.custom_domain
  from public.salon_public_websites w
  join public.salons s on s.id = w.salon_id
  join public.themes t on t.theme_id = w.template_key and t.is_active = true
  where w.custom_domain is not null
    and lower(btrim(w.custom_domain)) = lower(btrim(private.nexora_normalize_domain(p_host)))
    and w.custom_domain_status = 'verified'
    and w.is_published = true
    and s.is_active = true
    and s.deleted_at is null
  limit 1
$$;

revoke all on function public.resolve_public_salon_by_domain(text) from public;
grant execute on function public.resolve_public_salon_by_domain(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. OWNER MUTATIONS — setting / clearing a domain.
--    Scoped through `private.owned_publish_salon_id`, so an owner can only ever
--    touch the domain of a salon they actually own. Setting a domain (or
--    changing it) always resets the status to 'pending': a new hostname must be
--    re-verified before it can serve traffic.
-- ---------------------------------------------------------------------------
create or replace function public.set_owner_custom_domain(
  p_domain text,
  p_salon_id uuid default null
)
returns table (
  salon_id uuid,
  custom_domain text,
  custom_domain_status public.nexora_domain_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid;
  v_domain text;
  v_taken uuid;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);
  v_domain := private.nexora_normalize_domain(p_domain);

  if v_domain is null then
    raise exception 'Enter a domain name like www.yoursalon.com'
      using errcode = '22023';
  end if;

  if not private.nexora_is_valid_domain(v_domain) then
    raise exception '"%" is not a valid domain name. Use a name like www.yoursalon.com', v_domain
      using errcode = '22023';
  end if;

  -- Case-insensitive collision guard (the unique index is the final invariant;
  -- this produces a friendly message instead of a constraint violation).
  select w.salon_id into v_taken
  from public.salon_public_websites w
  where lower(btrim(w.custom_domain)) = v_domain
    and w.salon_id <> v_salon
  limit 1;

  if v_taken is not null then
    raise exception 'That domain is already connected to another website'
      using errcode = '23505';
  end if;

  update public.salon_public_websites w
     set custom_domain = v_domain,
         custom_domain_status = case
           -- Re-setting the already-verified domain keeps it verified.
           when w.custom_domain = v_domain and w.custom_domain_status = 'verified'
             then 'verified'::public.nexora_domain_status
           else 'pending'::public.nexora_domain_status
         end,
         custom_domain_verified_at = case
           when w.custom_domain = v_domain and w.custom_domain_status = 'verified'
             then w.custom_domain_verified_at
           else null
         end,
         updated_at = now()
   where w.salon_id = v_salon
  returning w.salon_id, w.custom_domain, w.custom_domain_status
     into salon_id, custom_domain, custom_domain_status;

  if salon_id is null then
    raise exception 'Publish your website before connecting a custom domain'
      using errcode = 'P0001';
  end if;

  return next;
end;
$$;

revoke all on function public.set_owner_custom_domain(text, uuid) from public, anon;
grant execute on function public.set_owner_custom_domain(text, uuid) to authenticated;

create or replace function public.clear_owner_custom_domain(p_salon_id uuid default null)
returns table (
  salon_id uuid,
  custom_domain text,
  custom_domain_status public.nexora_domain_status
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
     set custom_domain = null,
         custom_domain_status = 'not_configured'::public.nexora_domain_status,
         custom_domain_verified_at = null,
         updated_at = now()
   where w.salon_id = v_salon
  returning w.salon_id, w.custom_domain, w.custom_domain_status
     into salon_id, custom_domain, custom_domain_status;

  if salon_id is null then
    raise exception 'No published website found for this account'
      using errcode = 'P0001';
  end if;

  return next;
end;
$$;

revoke all on function public.clear_owner_custom_domain(uuid) from public, anon;
grant execute on function public.clear_owner_custom_domain(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. VERIFICATION — service_role only.
--    PostgreSQL cannot perform DNS lookups, so the platform edge performs the
--    CNAME/TXT probe and calls this to flip the status. Keeping the write here
--    (rather than letting a client UPDATE the row) means an owner can never
--    self-verify a domain they do not control.
-- ---------------------------------------------------------------------------
create or replace function public.mark_custom_domain_status(
  p_salon_id uuid,
  p_status text
)
returns table (
  salon_id uuid,
  custom_domain text,
  custom_domain_status public.nexora_domain_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.nexora_domain_status;
begin
  if p_status not in ('not_configured', 'pending', 'verified', 'failed') then
    raise exception 'Unsupported domain status "%"', p_status
      using errcode = '22023';
  end if;
  v_status := p_status::public.nexora_domain_status;

  update public.salon_public_websites w
     set custom_domain_status = v_status,
         custom_domain_verified_at = case
           when v_status = 'verified' then now() else null
         end,
         updated_at = now()
   where w.salon_id = p_salon_id
     and w.custom_domain is not null
  returning w.salon_id, w.custom_domain, w.custom_domain_status
     into salon_id, custom_domain, custom_domain_status;

  if salon_id is null then
    raise exception 'No custom domain is configured for that salon'
      using errcode = 'P0001';
  end if;

  return next;
end;
$$;

revoke all on function public.mark_custom_domain_status(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_custom_domain_status(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. PUBLIC PROJECTION — add the two new business fields (and the owner stat
--    fields the templates already render) to `get_public_salon_website`.
--
--    `whiteLabel` carries the tenant's platform-badge + theme overrides; it is
--    sanitised on the client (`src/lib/whiteLabel.ts`) and only ever read here
--    as opaque JSON, so no SQL text is echoed to the browser.
--
--    `testimonials` is owner-authored public content. It is projected through
--    `private.nexora_public_testimonials`, which strips any row that is not a
--    well-formed object with a name and a body, clamps the rating to 1..5, and
--    caps the list — so a malformed or hostile config can never render.
-- ---------------------------------------------------------------------------
create or replace function private.nexora_public_testimonials(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row jsonb;
  v_name text;
  v_body text;
  v_role text;
  v_rating int;
  v_date text;
  v_id text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then
    return v_out;
  end if;

  for v_row in select value from jsonb_array_elements(p_value) limit 24
  loop
    if jsonb_typeof(v_row) <> 'object' then
      continue;
    end if;

    v_name := btrim(coalesce(v_row ->> 'name', ''));
    v_body := btrim(coalesce(v_row ->> 'body', ''));
    if v_name = '' or v_body = '' then
      continue;
    end if;

    v_rating := greatest(1, least(5, coalesce(nullif(v_row ->> 'rating', '')::int, 5)));
    v_role := nullif(btrim(coalesce(v_row ->> 'role', '')), '');
    v_date := nullif(btrim(coalesce(v_row ->> 'date', '')), '');
    v_id := coalesce(nullif(btrim(coalesce(v_row ->> 'id', '')), ''), 'testimonial');

    v_out := v_out || jsonb_build_object(
      'id', v_id,
      'name', left(v_name, 60),
      'body', left(v_body, 400),
      'rating', v_rating
    )
      || case when v_role is not null then jsonb_build_object('role', left(v_role, 60)) else '{}'::jsonb end
      || case when v_date ~ '^\d{4}-\d{2}-\d{2}$' then jsonb_build_object('date', v_date) else '{}'::jsonb end;
  end loop;

  return v_out;
end;
$$;

revoke all on function private.nexora_public_testimonials(jsonb) from public, anon, authenticated;

-- Redefine the projection with the new keys added. Every previously projected
-- key is preserved verbatim; only additions are made.
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
      'heroPosition', w.config->'heroPosition',
      'templateConfig', w.config->'templateConfig',
      'templateConfigs', w.config->'templateConfigs',
      'reviewedContent', w.config->'reviewedContent',
      'websiteCopy', w.config->'websiteCopy',
      'metaDescription', w.config->'metaDescription',
      'socialShareImageUrl', w.config->'socialShareImageUrl',
      'metaTitle', w.config->'metaTitle',
      'metaKeywords', w.config->'metaKeywords',
      -- M68: the owner's own brand visuals. Safe URL schemes only — a stored
      -- `javascript:` value can never be published through this projection.
      'logoUrl', case
        when nullif(btrim(coalesce(w.config->>'logoUrl', '')), '') is not null
         and (w.config->>'logoUrl') ~ '^(https?://|/|\.\./|\./|data:image/)'
        then w.config->'logoUrl' end,
      'heroImageUrl', case
        when nullif(btrim(coalesce(w.config->>'heroImageUrl', '')), '') is not null
         and (w.config->>'heroImageUrl') ~ '^(https?://|/|\.\./|\./|data:image/)'
        then w.config->'heroImageUrl' end,
      -- M68: the saved gallery, active + non-rejected entries only.
      'gallery', nullif(public.nexora_public_gallery(w.config->'gallery'), '[]'::jsonb),
      -- Owner identity is deliberately public presentation content, exposed
      -- only behind the owner's own showOwnerPhoto toggle for the ACTIVE
      -- template. email / team remain excluded everywhere.
      'ownerName', case when public.nexora_owner_identity_publicly_enabled(w.template_key, w.config)
                        then w.config->'ownerName' end,
      'ownerRole', case when public.nexora_owner_identity_publicly_enabled(w.template_key, w.config)
                        then w.config->'ownerRole' end,
      'ownerPhotoUrl', case when public.nexora_owner_identity_publicly_enabled(w.template_key, w.config)
                            then w.config->'ownerPhotoUrl' end,
      'yearsOfExperience', case when public.nexora_owner_identity_publicly_enabled(w.template_key, w.config)
                                then w.config->'yearsOfExperience' end,
      'happyCustomers', case when public.nexora_owner_identity_publicly_enabled(w.template_key, w.config)
                             then w.config->'happyCustomers' end,
      -- M69: per-tenant white-label isolation. Read opaquely; the client
      -- sanitises the badge text and validates the accent colour before use.
      'whiteLabel', case
        when jsonb_typeof(w.config->'whiteLabel') = 'object'
          then w.config->'whiteLabel' end,
      -- M69: owner-authored testimonials, normalised and capped server-side.
      'testimonials', nullif(private.nexora_public_testimonials(w.config->'testimonials'), '[]'::jsonb)
    )),
    w.published_at
  from public.salon_public_websites w
  join public.salons s on s.id = w.salon_id
  -- Active template step: the published template_key must point at an
  -- existing, ACTIVE theme. No theme = no resolution; anything else would
  -- silently render a default template/business.
  join public.themes t on t.theme_id = w.template_key and t.is_active = true
  where lower(w.slug) = lower(btrim(p_slug))
    and p_slug ~ '^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$'
    and w.is_published = true
    and s.is_active = true
    and s.deleted_at is null
$$;

revoke all on function public.get_public_salon_website(text) from public;
grant execute on function public.get_public_salon_website(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Self-verification RPC (read-only, service_role like the other verifiers).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m69_custom_domain_white_label()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_publish text := lower(pg_catalog.pg_get_functiondef(
    'public.get_public_salon_website(text)'::regprocedure
  ));
  v_resolve text := lower(pg_catalog.pg_get_functiondef(
    'public.resolve_public_salon_by_domain(text)'::regprocedure
  ));
  v_owner_domain text := lower(pg_catalog.pg_get_functiondef(
    'public.set_owner_custom_domain(text, uuid)'::regprocedure
  ));
  v_count int;
begin
  check_name := 'salon_public_websites carries custom domain columns';
  select count(*) into v_count
    from pg_catalog.information_schema.columns
   where table_schema = 'public'
     and table_name = 'salon_public_websites'
     and column_name in ('custom_domain', 'custom_domain_status', 'custom_domain_verified_at');
  ok := v_count = 3;
  detail := case when ok then '3 domain columns present'
                 else format('expected 3 domain columns, found %s', v_count) end;
  return next;

  check_name := 'custom domain resolution requires verification';
  ok := v_resolve like '%custom_domain_status = ''verified''%'
    and v_resolve like '%w.is_published = true%';
  detail := case when ok then 'only verified + published domains resolve'
                 else 'an unverified or unpublished domain could resolve' end;
  return next;

  check_name := 'custom domain resolver is anonymous-safe';
  ok := v_resolve like '%security definer%' and v_resolve like '%limit 1%';
  detail := case when ok then 'definer-scoped, single-row resolver'
                 else 'resolver is not definer-scoped or unbounded' end;
  return next;

  check_name := 'owner domain mutation is owner-scoped';
  ok := v_owner_domain like '%private.owned_publish_salon_id%';
  detail := case when ok then 'scoped through owned_publish_salon_id'
                 else 'an owner could set a domain on a salon they do not own' end;
  return next;

  check_name := 'changing a domain resets verification to pending';
  ok := v_owner_domain like '%''pending''%';
  detail := case when ok then 'new hostnames must be re-verified'
                 else 'a new domain could inherit verified status' end;
  return next;

  check_name := 'public projection exposes whiteLabel';
  ok := v_publish like '%''whitelabel''%';
  detail := case when ok then 'whiteLabel projected'
                 else 'whiteLabel missing from the public projection' end;
  return next;

  check_name := 'public projection exposes testimonials';
  ok := v_publish like '%nexora_public_testimonials%';
  detail := case when ok then 'testimonials projected and normalised'
                 else 'testimonials missing from the public projection' end;
  return next;

  check_name := 'M68 media keys survived the redefinition';
  ok := v_publish like '%logourl%' and v_publish like '%heroimageurl%'
    and v_publish like '%nexora_public_gallery%';
  detail := case when ok then 'logoUrl / heroImageUrl / gallery still projected'
                 else 'the M68 projection regressed' end;
  return next;
end;
$$;

revoke all on function public.verify_m69_custom_domain_white_label() from public, anon, authenticated;
grant execute on function public.verify_m69_custom_domain_white_label() to service_role;

commit;
