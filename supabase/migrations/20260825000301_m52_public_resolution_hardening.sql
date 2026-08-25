-- ===========================================================================
-- M52 — public website resolution hardening: Business → Active Template
-- ===========================================================================
-- Requirement 8: `final-new-app-templete.vercel.app/<business-name>` (or
-- `business-name.<custom-domain>` on a wildcard domain) must resolve
--   Hostname/Slug → Published Business → Active Template → Template Config
--   → Public Business Data, for the CORRECT business only.
--
-- Resolved strictly by slug (the browser never supplies a business id).
-- Publish state, salon active/deleted state AND an ACTIVE template row are
-- all enforced inside the database:
--
--   * `get_public_salon_website` now joins `public.themes` on
--     `t.theme_id = w.template_key AND t.is_active = true`. A published site
--     whose template was deactivated (or whose template_key is unknown or
--     blank) resolves to ZERO rows — the client shows "Salon not found".
--     There is never a default/fallback business and never a default
--     template: an inactive template step fails the whole chain closed.
--   * Nothing else changed: resolution is slug-only, the projection stays
--     field-limited, anon access remains through the RPC only.
--
-- Migration is idempotent and additive (redefines the same function shape).

begin;

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
      'metaKeywords', w.config->'metaKeywords'
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

-- Self-verification RPC (read-only, service_role like the other verifiers).
create or replace function public.verify_m52_public_resolution_hardening()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_website text := pg_catalog.pg_get_functiondef(
    'public.get_public_salon_website(text)'::regprocedure
  );
begin
  check_name := 'resolution is slug-only (no business/salon id parameter)';
  ok := pg_catalog.pg_get_function_identity_arguments(
    'public.get_public_salon_website(text)'::regprocedure
  ) = 'p_slug text';
  detail := 'signature: get_public_salon_website(p_slug text)'; return next;

  check_name := 'published business must be active and not deleted';
  ok := position('w.is_published = true' in v_website) > 0
    and position('s.is_active = true' in v_website) > 0
    and position('s.deleted_at is null' in v_website) > 0;
  detail := 'published + active + not deleted in the WHERE clause'; return next;

  check_name := 'active template is required (themes join is_active)';
  ok := position('join public.themes t on t.theme_id = w.template_key' in v_website) > 0
    and position('t.is_active = true' in v_website) > 0;
  detail := 'no theme = zero rows, never a default template/business'; return next;

  check_name := 'slug is normalized and path-safe (no id, no free-form text)';
  ok := position('lower(w.slug) = lower(btrim(p_slug))' in v_website) > 0
    and position('p_slug ~' in v_website) > 0;
  detail := 'case/whitespace-normalized + URL-safe slug regex'; return next;

  check_name := 'anon resolves through the RPC only (no anon table grants)';
  ok := pg_catalog.has_function_privilege('anon',
    'public.get_public_salon_website(text)', 'EXECUTE')
    and not pg_catalog.has_table_privilege('anon', 'public.salon_public_websites', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.salons', 'SELECT');
  detail := 'field-limited projection; owner tables stay anonymous-denied'; return next;
end;
$$;

revoke all on function public.verify_m52_public_resolution_hardening()
  from public, anon, authenticated;
grant execute on function public.verify_m52_public_resolution_hardening() to service_role;

commit;
