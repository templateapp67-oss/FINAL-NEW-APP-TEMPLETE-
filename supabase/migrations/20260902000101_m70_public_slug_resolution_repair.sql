-- ============================================================================
-- M70 — public slug resolution repair (canonical anonymous resolver + slug sync)
-- ============================================================================
-- LIVE AUDIT (project qwaehqsmodekbgvnaavz, 2026-09-01, anonymous REST):
--
--   * `get_public_salon_website(p_slug)`  -> PGRST202 (function does not exist)
--   * `get_public_salon_services(p_slug)` -> PGRST202 (function does not exist)
--   * `resolve_public_salon_by_domain`    -> PGRST202 (function does not exist)
--   * `salon_public_websites.custom_domain` -> 42703 (column does not exist)
--   => M44 / M46 / M49 / M52 / M66 / M68 / M69 are NOT applied on the live
--      project. The browser therefore silently runs the compatibility path in
--      `src/lib/publicSalonResolver.ts`, which reads `salon_public_websites`
--      directly. That path only works because `anon` still holds a raw
--      `select` grant on the table — so an anonymous visitor can read EVERY
--      tenant's full `config` jsonb (verified: owner `email` is readable).
--   * `select slug,is_published from salon_public_websites` (as anon) returns
--     8 rows: `salon-0df31e6c…`, `salon-576adf84…`, `my-salon`,
--     `my-salon-ww8h`, `my-salon-1`, `my-salon-2`, `my-salon-3`,
--     `nexora-test-salon-20260831`. There is NO `arts-by-uma` row, and the
--     five `my-salon*` rows are `is_published = false`, `published_at = null`
--     with an EMPTY `config` jsonb.
--   => `/arts-by-uma` is "Salon Not Found" because no published website row
--      with that slug exists. The five placeholder rows kept the provisioning
--      slug (`my-salon-N`) instead of the canonical business slug.
--
-- What this migration does (additive + idempotent, no destructive statement):
--   1. Re-creates the canonical, field-limited anonymous resolver
--      `public.get_public_salon_website(text)` (published + active salon +
--      active theme gates) and its owner-identity helper, so anonymous
--      resolution stops depending on raw table access. Only runs the parts
--      whose dependencies exist, so it is safe on a project where M44+ IS
--      already applied (there it is a no-op redefinition of the same shape).
--   2. Removes the anonymous `select` grant on `public.salon_public_websites`
--      in the SAME transaction, closing the owner-config/email exposure.
--      RLS is NOT disabled and no policy is dropped.
--   3. Canonicalises slugs WITHOUT changing publication state:
--        * trims/lowercases `salon_public_websites.slug`;
--        * replaces a provisioning placeholder slug (`my-salon`, `my-salon-N`,
--          `salon-<uuid>`) with the slug derived from the salon's real name
--          when that slug is free — so a business called "Arts By Uma" ends up
--          on `arts-by-uma`;
--        * keeps `salons.slug` and `salon_public_websites.slug` in agreement.
--      `is_published` / `published_at` are NEVER set by this migration: a site
--      is published only when its owner published it.
--   4. Adds `public.verify_m70_public_slug_resolution(text)` — a service_role
--      only diagnostic returning one row per resolution gate for a slug, so
--      the exact failing condition is observable instead of guessed.
--
-- NOT APPLIED: like M01-M69, this file is drafted for review and must be
-- applied through the reviewed live-migration runbook, never bulk-applied.

begin;

-- ---------------------------------------------------------------------------
-- 1. Owner-identity gate helper (idempotent; identical shape to M66).
-- ---------------------------------------------------------------------------
create or replace function public.nexora_owner_identity_publicly_enabled(
  p_template_key text,
  p_config jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when p_config #> array['templateConfigs', coalesce(p_template_key, ''), 'showOwnerPhoto'] is not null
        then (p_config #>> array['templateConfigs', coalesce(p_template_key, ''), 'showOwnerPhoto'])::boolean
      when p_config #> array['templateConfig', 'showOwnerPhoto'] is not null
        then (p_config #>> array['templateConfig', 'showOwnerPhoto'])::boolean
      else true
    end,
    true
  )
$$;

revoke all on function public.nexora_owner_identity_publicly_enabled(text, jsonb) from public;
grant execute on function public.nexora_owner_identity_publicly_enabled(text, jsonb)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Public gallery projection helper (idempotent; identical shape to M68).
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
      select jsonb_agg(item order by ord, tie)
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
          and coalesce(elem ->> 'status', 'active') <> 'inactive'
          and coalesce(elem ->> 'moderation', 'approved') <> 'rejected'
          and nullif(btrim(coalesce(elem ->> 'url', '')), '') is not null
      ) s
    ),
    '[]'::jsonb
  )
$$;

revoke all on function public.nexora_public_gallery(jsonb) from public;
grant execute on function public.nexora_public_gallery(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The canonical anonymous resolver.
--    Gates (all must hold, otherwise ZERO rows are returned):
--      slug matches (case/whitespace-insensitive) and is slug-shaped
--      · website is_published
--      · salon is_active and not soft-deleted
--      · template_key points at an ACTIVE theme
--    Field-limited: an explicit allowlist of `config` keys. email / team /
--    booking internals / owner private data are never projected.
-- ---------------------------------------------------------------------------
do $m70_resolver$
declare
  v_has_deleted_at boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salons' and column_name = 'deleted_at'
  );
  v_has_is_active boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salons' and column_name = 'is_active'
  );
  v_has_locations boolean := to_regclass('public.business_locations') is not null;
  v_has_city boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salons' and column_name = 'city'
  );
  v_sql text;
begin
  v_sql := $body$
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
as $fn$
  select
    s.id,
    w.slug,
    w.template_key,
    s.name,
    __ADDRESS__,
    __CITY__,
    jsonb_strip_nulls(jsonb_build_object(
      'salonName', to_jsonb(s.name),
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
      'services', w.config->'services',
      'address', w.config->'address',
      'websiteAppearance', w.config->'websiteAppearance',
      'brandColor', w.config->'brandColor',
      'salonNameFont', w.config->'salonNameFont',
      'salonNameColor', w.config->'salonNameColor',
      'heroPosition', w.config->'heroPosition',
      'templateConfig', w.config->'templateConfig',
      'templateConfigs', w.config->'templateConfigs',
      'reviewedContent', w.config->'reviewedContent',
      'websiteCopy', w.config->'websiteCopy',
      'whiteLabel', w.config->'whiteLabel',
      'testimonials', w.config->'testimonials',
      'yearsOfExperience', w.config->'yearsOfExperience',
      'happyCustomers', w.config->'happyCustomers',
      'metaDescription', w.config->'metaDescription',
      'socialShareImageUrl', w.config->'socialShareImageUrl',
      'metaTitle', w.config->'metaTitle',
      'metaKeywords', w.config->'metaKeywords',
      'logoUrl', case
        when nullif(btrim(coalesce(w.config->>'logoUrl', '')), '') is not null
         and (w.config->>'logoUrl') ~ '^(https?://|/|\.\./|\./|data:image/)'
        then w.config->'logoUrl' end,
      'heroImageUrl', case
        when nullif(btrim(coalesce(w.config->>'heroImageUrl', '')), '') is not null
         and (w.config->>'heroImageUrl') ~ '^(https?://|/|\.\./|\./|data:image/)'
        then w.config->'heroImageUrl' end,
      'gallery', nullif(public.nexora_public_gallery(w.config->'gallery'), '[]'::jsonb),
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
  join public.themes t on t.theme_id = w.template_key and t.is_active = true
  where lower(btrim(w.slug)) = lower(btrim(p_slug))
    and btrim(coalesce(p_slug, '')) ~ '^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$'
    and w.is_published = true
    __ACTIVE__
    __DELETED__
$fn$;
$body$;

  v_sql := replace(v_sql, '__ACTIVE__', case when v_has_is_active then 'and s.is_active = true' else '' end);
  v_sql := replace(v_sql, '__DELETED__', case when v_has_deleted_at then 'and s.deleted_at is null' else '' end);
  v_sql := replace(v_sql, '__CITY__', case when v_has_city then 's.city' else '''''::text' end);
  v_sql := replace(
    v_sql,
    '__ADDRESS__',
    case
      when v_has_locations then $addr$coalesce(
      (select bl.address_label from public.business_locations bl
        where bl.salon_id = s.id and bl.approval_status = 'approved'
        limit 1),
      s.address
    )$addr$
      else 's.address'
    end
  );

  execute v_sql;
end
$m70_resolver$;

revoke all on function public.get_public_salon_website(text) from public;
grant execute on function public.get_public_salon_website(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Close the anonymous full-config exposure.
--    The anonymous site now resolves exclusively through the field-limited
--    RPC above, so `anon` no longer needs (and must not have) raw table
--    access to owner configuration. RLS stays enabled; no policy is dropped.
-- ---------------------------------------------------------------------------
revoke select on table public.salon_public_websites from anon;

-- ---------------------------------------------------------------------------
-- 5. Slug canonicalisation — never changes publication state or business data.
-- ---------------------------------------------------------------------------

-- 5a. Normalise stored slugs (trim + lowercase). No-op when already canonical.
update public.salon_public_websites w
set slug = lower(btrim(w.slug))
where w.slug is not null
  and w.slug <> lower(btrim(w.slug))
  and not exists (
    select 1 from public.salon_public_websites o
    where o.id <> w.id and lower(btrim(o.slug)) = lower(btrim(w.slug))
  );

-- 5b. Replace a provisioning PLACEHOLDER slug with the canonical business
--     slug derived from the salon's real name, when that slug is free.
--     "Arts By Uma" => `arts-by-uma`.
do $m70_slugs$
declare
  v_has_salon_slug boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'salons' and column_name = 'slug'
  );
  r record;
  v_candidate text;
begin
  for r in
    select w.id as website_id, w.salon_id, w.slug as current_slug, s.name as salon_name
    from public.salon_public_websites w
    join public.salons s on s.id = w.salon_id
    where nullif(btrim(coalesce(s.name, '')), '') is not null
      and (
        lower(btrim(w.slug)) = 'my-salon'
        or lower(btrim(w.slug)) ~ '^my-salon-[a-z0-9]+$'
        or lower(btrim(w.slug)) ~ '^salon-[0-9a-f]{32}$'
        or lower(btrim(w.slug)) ~ '^salon-[0-9a-f-]{36}$'
      )
  loop
    v_candidate := regexp_replace(lower(btrim(r.salon_name)), '[^a-z0-9]+', '-', 'g');
    v_candidate := regexp_replace(v_candidate, '(^-+)|(-+$)', '', 'g');
    v_candidate := left(v_candidate, 50);
    v_candidate := regexp_replace(v_candidate, '-+$', '');

    -- Never claim a reserved platform route and never collide with another
    -- tenant: an unusable candidate leaves the placeholder untouched.
    continue when v_candidate is null
      or char_length(v_candidate) < 3
      or v_candidate in (
        'dashboard', 'builder', 'nearby', 'auth', 'login', 'signup', 'register',
        'reset-password', 'api', 'admin', 'www', 'app', 'static', 'assets',
        'preview-frame', 'salon'
      )
      or exists (
        select 1 from public.salon_public_websites o
        where o.id <> r.website_id and lower(btrim(o.slug)) = v_candidate
      );

    update public.salon_public_websites
    set slug = v_candidate
    where id = r.website_id;

    if v_has_salon_slug then
      -- Keep `salons.slug` in agreement, but only when it is free.
      execute $sql$
        update public.salons s
        set slug = $1
        where s.id = $2
          and coalesce(s.slug, '') <> $1
          and not exists (select 1 from public.salons o where o.id <> $2 and o.slug = $1)
      $sql$ using v_candidate, r.salon_id;
    end if;
  end loop;

  -- 5c. Any remaining disagreement is resolved in favour of the PUBLISHED
  --     website slug (the address that is already live and linked).
  if v_has_salon_slug then
    execute $sql$
      update public.salons s
      set slug = w.slug
      from public.salon_public_websites w
      where w.salon_id = s.id
        and w.slug is not null
        and coalesce(s.slug, '') <> w.slug
        and not exists (select 1 from public.salons o where o.id <> s.id and o.slug = w.slug)
    $sql$;
  end if;
end
$m70_slugs$;

-- ---------------------------------------------------------------------------
-- 6. Diagnostic: why does a slug fail to resolve? (service_role only)
--    Returns one row per gate so the exact failing condition is observable.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m70_public_slug_resolution(p_slug text)
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_website record;
begin
  check_name := 'slug is well formed';
  ok := v_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  detail := coalesce(nullif(v_slug, ''), '(empty)');
  return next;

  select w.*, s.name as salon_name into v_website
  from public.salon_public_websites w
  left join public.salons s on s.id = w.salon_id
  where lower(btrim(w.slug)) = v_slug
  limit 1;

  check_name := 'website row exists';
  ok := v_website.id is not null;
  detail := case when ok then 'salon_id=' || coalesce(v_website.salon_id::text, 'null')
                 else 'no salon_public_websites row with this slug' end;
  return next;

  if v_website.id is null then
    return;
  end if;

  check_name := 'website is published';
  ok := coalesce(v_website.is_published, false);
  detail := 'is_published=' || coalesce(v_website.is_published::text, 'null')
    || ', published_at=' || coalesce(v_website.published_at::text, 'null');
  return next;

  check_name := 'salon is active and not deleted';
  ok := exists (
    select 1 from public.salons s
    where s.id = v_website.salon_id
      and coalesce(s.is_active, true) = true
      and s.deleted_at is null
  );
  detail := 'salon=' || coalesce(v_website.salon_name, '(missing)');
  return next;

  check_name := 'template_key references an active theme';
  ok := exists (
    select 1 from public.themes t
    where t.theme_id = v_website.template_key and t.is_active = true
  );
  detail := 'template_key=' || coalesce(v_website.template_key, 'null');
  return next;

  check_name := 'resolver returns exactly one tenant';
  ok := (select count(*) from public.get_public_salon_website(v_slug)) = 1;
  detail := 'get_public_salon_website(' || v_slug || ') row count = '
    || (select count(*)::text from public.get_public_salon_website(v_slug));
  return next;
end;
$$;

revoke all on function public.verify_m70_public_slug_resolution(text) from public, anon, authenticated;
grant execute on function public.verify_m70_public_slug_resolution(text) to service_role;

commit;
