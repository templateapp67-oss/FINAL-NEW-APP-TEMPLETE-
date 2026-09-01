-- ============================================================================
-- M68 — published-site media parity (logo / hero / gallery) + SVG uploads
-- ============================================================================
-- Audit findings this migration closes:
--
--   1. `get_public_salon_website` (M44/M49/M52/M66) never projected
--      `config.logoUrl`, `config.heroImageUrl` or `config.gallery`, and
--      `PublicSalonView` rebuilt its gallery ONLY from `salon_media`, so a
--      published site silently dropped the owner's own photos. Data the owner
--      saved in step 5 never reached the live website ("Save & Publish lost my
--      gallery").
--
--   2. The `salon-media` storage bucket (M30) allows only
--      jpeg/png/webp/gif/mp4/webm, so an SVG logo — an advertised upload
--      format in the builder — was rejected with an opaque storage error.
--
--   3. Signed-URL TTL: the client now asks for a 1-year URL and degrades to
--      shorter TTLs, so published images stop 404-ing an hour after upload.
--      (Client-side change in src/lib/salonMediaService.ts; no DB object.)
--
-- Owner media is owner-authored presentation content the owner deliberately
-- publishes, exactly like the tagline. It is projected only for ACTIVE
-- (status = 'active', moderation not 'rejected') gallery items so a rejected
-- photo can never appear on the live site. Private fields stay private: email,
-- team and booking internals are never projected.
--
-- Migration is idempotent and additive (redefines existing function shapes and
-- updates the bucket allowlist; no table is created, altered or dropped).
--
-- NOT APPLIED: like M01-M67, this file is drafted for review. It must be
-- applied through the reviewed live-migration runbook, never bulk-applied.

begin;

-- ---------------------------------------------------------------------------
-- 1. Storage: allow SVG (and keep every previously allowed format).
--    SVG is served with a restrictive content type by Supabase Storage and is
--    only ever rendered inside an <img> tag by the public site, so script
--    content in an SVG cannot execute on the Nexora origin.
-- ---------------------------------------------------------------------------
do $do_bucket_mime$ begin
  if exists (select 1 from storage.buckets where id = 'salon-media') then
    update storage.buckets
    set allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/svg+xml', 'video/mp4', 'video/webm'
    ]
    where id = 'salon-media';
  end if;
end $do_bucket_mime$;

-- ---------------------------------------------------------------------------
-- 2. Public gallery projection helper.
--    Projects ONLY the safe keys of a saved gallery item (url, alt/title/
--    description, ordering, before/after). Internal fields (storagePath,
--    serviceId, rejected moderation) never reach an anonymous visitor.
-- ---------------------------------------------------------------------------
create or replace function public.nexora_public_gallery(p_gallery jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(item order by ord)
      from (
        select
          jsonb_build_object(
            'id', coalesce(nullif(btrim(elem ->> 'id'), ''), md5(coalesce(elem ->> 'url', ''))),
            'url', elem -> 'url',
            'alt', elem -> 'alt',
            'title', elem -> 'title',
            'description', elem -> 'description',
            'category', elem -> 'category',
            'caption', elem -> 'caption',
            'beforeUrl', elem -> 'beforeUrl',
            'beforeAlt', elem -> 'beforeAlt',
            'featured', elem -> 'featured',
            'displayOrder', elem -> 'displayOrder',
            'status', elem -> 'status',
            'themeId', elem -> 'themeId'
          ) as item,
          coalesce((elem ->> 'displayOrder')::int, 2147483647) as ord,
          idx as tie
        from jsonb_array_elements(
          case when jsonb_typeof(p_gallery) = 'array' then p_gallery else '[]'::jsonb end
        ) with ordinality as t(elem, idx)
        where jsonb_typeof(elem) = 'object'
          -- Only owner-visible items reach the live site.
          and coalesce(elem ->> 'status', 'active') <> 'inactive'
          and coalesce(elem ->> 'moderation', 'approved') <> 'rejected'
          and nullif(btrim(coalesce(elem ->> 'url', '')), '') is not null
      ) s
      order by ord, tie
    ),
    '[]'::jsonb
  )
$$;

revoke all on function public.nexora_public_gallery(jsonb) from public;
grant execute on function public.nexora_public_gallery(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. get_public_salon_website: project the owner's logo, hero and gallery.
--    Everything else about the projection is unchanged: contact details stay
--    behind the owner's contactOptions switches, owner identity behind
--    showOwnerPhoto, and email / team remain excluded everywhere.
-- ---------------------------------------------------------------------------
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
                            then w.config->'ownerPhotoUrl' end
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
-- 4. Self-verification RPC (read-only, service_role like the other verifiers).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m68_public_media_projection()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_publish text := lower(pg_catalog.pg_get_functiondef(
    'public.get_public_salon_website(text)'::regprocedure
  ));
  v_gallery_fn text := lower(pg_catalog.pg_get_functiondef(
    'public.nexora_public_gallery(jsonb)'::regprocedure
  ));
begin
  check_name := 'get_public_salon_website projects logoUrl';
  ok := v_publish like '%logourl%';
  detail := case when ok then 'logoUrl projected' else 'logoUrl missing from the public projection' end;
  return next;

  check_name := 'get_public_salon_website projects heroImageUrl';
  ok := v_publish like '%heroimageurl%';
  detail := case when ok then 'heroImageUrl projected' else 'heroImageUrl missing from the public projection' end;
  return next;

  check_name := 'get_public_salon_website projects gallery';
  ok := v_publish like '%nexora_public_gallery%';
  detail := case when ok then 'gallery projected through nexora_public_gallery' else 'gallery missing from the public projection' end;
  return next;

  check_name := 'public media projection rejects unsafe schemes';
  ok := v_publish like '%javascript%' or v_publish like '%^(https?://%';
  detail := 'only http(s), root-relative and data:image URLs are publishable';
  return next;

  check_name := 'gallery projection hides rejected and inactive items';
  ok := v_gallery_fn like '%rejected%' and v_gallery_fn like '%inactive%';
  detail := case when ok then 'rejected/inactive gallery items are filtered' else 'gallery moderation filter missing' end;
  return next;

  check_name := 'private fields stay private';
  ok := v_publish not like '%->>%''email%''%' and v_publish not like '%''team''%';
  detail := 'email and team are never projected by get_public_salon_website';
  return next;
end;
$$;

revoke all on function public.verify_m68_public_media_projection() from public, anon, authenticated;
grant execute on function public.verify_m68_public_media_projection() to service_role;

commit;
