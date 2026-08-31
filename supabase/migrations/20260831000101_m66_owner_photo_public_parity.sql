-- ===========================================================================
-- M66 — owner photo public parity across all five templates
-- ===========================================================================
-- Audit findings this migration closes:
--
--   1. `set_owner_salon_visual_config` (M48) mirrored the ORIGINAL client
--      capability matrix: `showOwnerPhoto` was only accepted for
--      hair_studio_color_bar / beauty_skin_spa / family_full_service. The
--      client matrix now supports the owner-photo toggle for ALL five owner
--      templates (the renderers all display `ownerPhotoUrl`), so an owner on
--      the Barber or Nail & Lash template could not persist the toggle — the
--      RPC raised `showOwnerPhoto is unsupported by the active template`.
--      `heroPosition` stays barber-only: only the barber (and legacy hair)
--      renderers actually crop a hero image, so the fail-closed matrix keeps
--      reflecting real renderer support.
--
--   2. `get_public_salon_website` (M44/M49/M52) never projected the owner
--      identity fields, and `PublicSalonView` blanked them, so the published
--      site could never show the owner name/role/photo — not even for the
--      templates whose toggle was already supported.
--
-- Owner identity (`ownerName`, `ownerRole`, `ownerPhotoUrl`) is owner-authored
-- presentation content the owner deliberately publishes, exactly like the
-- tagline. It is projected ONLY when the active template's saved
-- `showOwnerPhoto` setting is not `false` (the same fail-open-unless-opt-out
-- rule the client's `shouldShowOwnerPhoto()` applies). Private fields stay
-- private: `email` and `team` are never projected by the public RPC.
--
-- Migration is idempotent and additive (redefines existing function shapes;
-- no table is created, altered or dropped).

begin;

-- ---------------------------------------------------------------------------
-- Single source of truth for "is the owner identity public for this website?"
-- Mirrors src/lib/templateConfig.ts shouldShowOwnerPhoto(): hidden only when
-- the active template's entry explicitly says showOwnerPhoto = false.
-- Reads only its arguments — no table access.
-- ---------------------------------------------------------------------------
create or replace function public.nexora_owner_identity_publicly_enabled(
  p_template_key text,
  p_config jsonb
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_config -> 'templateConfigs' -> p_template_key ->> 'showOwnerPhoto',
    p_config -> 'templateConfig' ->> 'showOwnerPhoto',
    'true'
  ) <> 'false'
$$;

revoke all on function public.nexora_owner_identity_publicly_enabled(text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_public_salon_website: M52 hardening + gated owner identity projection.
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
-- set_owner_salon_visual_config: same strict M48 allowlist, with the
-- showOwnerPhoto capability extended to all five owner templates.
-- ---------------------------------------------------------------------------
create or replace function public.set_owner_salon_visual_config(p_visual_config jsonb)
returns table (
  out_salon_id uuid,
  out_config jsonb
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_salon_id uuid;
  v_owner_salon_count integer;
  v_config jsonb;
  v_template_key text;
begin
  if v_user_id is null then
    raise exception 'You must be logged in to change website appearance.' using errcode = '28000';
  end if;

  if p_visual_config is null or jsonb_typeof(p_visual_config) <> 'object' then
    raise exception 'Visual config must be a JSON object.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_visual_config) as supplied(key)
    where supplied.key not in (
      'templateConfig',
      'templateConfigs',
      'websiteAppearance',
      'brandColor',
      'salonNameFont',
      'salonNameColor',
      'heroPosition'
    )
  ) then
    raise exception 'Visual config contains a non-presentation field.' using errcode = '22023';
  end if;

  if p_visual_config ? 'templateConfig' then
    if coalesce(jsonb_typeof(p_visual_config -> 'templateConfig'), 'null') <> 'object' then
      raise exception 'templateConfig must be a JSON object.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(p_visual_config -> 'templateConfig') as supplied(key)
      where supplied.key not in (
        'appearance',
        'accentColor',
        'salonNameFont',
        'salonNameColor',
        'heroPosition',
        'showOwnerPhoto'
      )
    ) then
      raise exception 'templateConfig contains a non-visual field.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_each(p_visual_config -> 'templateConfig') as settings(setting_key, setting_value)
      where case settings.setting_key
        when 'appearance' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' not in ('light', 'dark')
        when 'accentColor' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        when 'salonNameFont' then jsonb_typeof(settings.setting_value) <> 'string'
          or length(btrim(settings.setting_value #>> '{}')) not between 1 and 40
        when 'salonNameColor' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        when 'heroPosition' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' not in ('Top', 'Center', 'Bottom')
        when 'showOwnerPhoto' then jsonb_typeof(settings.setting_value) <> 'boolean'
        else true
      end
    ) then
      raise exception 'templateConfig contains an invalid visual value.' using errcode = '22023';
    end if;
  end if;

  if p_visual_config ? 'templateConfigs' then
    if coalesce(jsonb_typeof(p_visual_config -> 'templateConfigs'), 'null') <> 'object' then
      raise exception 'templateConfigs must be a JSON object.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_each(p_visual_config -> 'templateConfigs') as templates(template_id, template_config)
      where templates.template_id not in (
        'barber_mens_grooming',
        'hair_studio_color_bar',
        'beauty_skin_spa',
        'family_full_service',
        'nail_lash_studio'
      )
        or jsonb_typeof(templates.template_config) <> 'object'
    ) then
      raise exception 'templateConfigs contains an unknown template or invalid config.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_each(p_visual_config -> 'templateConfigs') as templates(template_id, template_config)
      cross join lateral jsonb_object_keys(templates.template_config) as supplied(key)
      where supplied.key not in (
        'appearance',
        'accentColor',
        'salonNameFont',
        'salonNameColor',
        'heroPosition',
        'showOwnerPhoto'
      )
    ) then
      raise exception 'templateConfigs contains a non-visual field.' using errcode = '22023';
    end if;
    -- Capability matrix (server mirror of TEMPLATE_CONFIG_CAPABILITIES):
    -- heroPosition is barber-only (only that renderer crops a hero image);
    -- showOwnerPhoto is supported by ALL five owner templates.
    if exists (
      select 1
      from jsonb_each(p_visual_config -> 'templateConfigs') as templates(template_id, template_config)
      cross join lateral jsonb_object_keys(templates.template_config) as supplied(key)
      where supplied.key = 'heroPosition'
        and templates.template_id <> 'barber_mens_grooming'
    ) then
      raise exception 'templateConfigs contains a setting unsupported by its template.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_each(p_visual_config -> 'templateConfigs') as templates(template_id, template_config)
      cross join lateral jsonb_each(templates.template_config) as settings(setting_key, setting_value)
      where case settings.setting_key
        when 'appearance' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' not in ('light', 'dark')
        when 'accentColor' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        when 'salonNameFont' then jsonb_typeof(settings.setting_value) <> 'string'
          or length(btrim(settings.setting_value #>> '{}')) not between 1 and 40
        when 'salonNameColor' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        when 'heroPosition' then jsonb_typeof(settings.setting_value) <> 'string'
          or settings.setting_value #>> '{}' not in ('Top', 'Center', 'Bottom')
        when 'showOwnerPhoto' then jsonb_typeof(settings.setting_value) <> 'boolean'
        else true
      end
    ) then
      raise exception 'templateConfigs contains an invalid visual value.' using errcode = '22023';
    end if;
  end if;

  if p_visual_config ? 'websiteAppearance'
     and (jsonb_typeof(p_visual_config -> 'websiteAppearance') <> 'string'
       or p_visual_config ->> 'websiteAppearance' not in ('light', 'dark')) then
    raise exception 'websiteAppearance contains an invalid visual value.' using errcode = '22023';
  end if;
  if p_visual_config ? 'brandColor'
     and (jsonb_typeof(p_visual_config -> 'brandColor') <> 'string'
       or p_visual_config ->> 'brandColor' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$') then
    raise exception 'brandColor contains an invalid visual value.' using errcode = '22023';
  end if;
  if p_visual_config ? 'salonNameFont'
     and (jsonb_typeof(p_visual_config -> 'salonNameFont') <> 'string'
       or length(btrim(p_visual_config ->> 'salonNameFont')) not between 1 and 40) then
    raise exception 'salonNameFont contains an invalid visual value.' using errcode = '22023';
  end if;
  if p_visual_config ? 'salonNameColor'
     and (jsonb_typeof(p_visual_config -> 'salonNameColor') <> 'string'
       or p_visual_config ->> 'salonNameColor' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$') then
    raise exception 'salonNameColor contains an invalid visual value.' using errcode = '22023';
  end if;
  if p_visual_config ? 'heroPosition'
     and (jsonb_typeof(p_visual_config -> 'heroPosition') <> 'string'
       or p_visual_config ->> 'heroPosition' not in ('Top', 'Center', 'Bottom')) then
    raise exception 'heroPosition contains an invalid visual value.' using errcode = '22023';
  end if;

  select count(*)::integer, (array_agg(owner_salons.salon_id))[1]
    into v_owner_salon_count, v_salon_id
  from public.owner_salon_ids() as owner_salons(salon_id);

  if v_owner_salon_count = 0 or v_salon_id is null then
    raise exception 'No active owner salon found.' using errcode = 'P0002';
  end if;
  if v_owner_salon_count > 1 then
    raise exception 'More than one active owner salon found; choose a salon explicitly.' using errcode = '21000';
  end if;

  select websites.template_key
    into v_template_key
  from public.salon_public_websites as websites
  where websites.salon_id = v_salon_id
  for update;
  if not found then
    raise exception 'Owner salon website is not provisioned.' using errcode = 'P0002';
  end if;

  -- heroPosition remains barber-only; showOwnerPhoto is valid on every
  -- template, so no active-template restriction is needed for it any more.
  if (p_visual_config -> 'templateConfig') ? 'heroPosition'
     and v_template_key <> 'barber_mens_grooming' then
    raise exception 'heroPosition is unsupported by the active template.' using errcode = '22023';
  end if;
  if p_visual_config ? 'heroPosition'
     and v_template_key <> 'barber_mens_grooming' then
    raise exception 'heroPosition is unsupported by the active template.' using errcode = '22023';
  end if;

  update public.salon_public_websites
  set config = coalesce(config, '{}'::jsonb) || p_visual_config
  where salon_id = v_salon_id
  returning config into v_config;

  return query select v_salon_id, v_config;
end;
$fn$;

revoke all on function public.set_owner_salon_visual_config(jsonb) from public;
revoke all on function public.set_owner_salon_visual_config(jsonb) from anon;
grant execute on function public.set_owner_salon_visual_config(jsonb) to authenticated;

comment on function public.set_owner_salon_visual_config(jsonb) is
  'Merges only allowlisted visual fields into the authenticated owner website config; template id and business data are rejected.';

-- ---------------------------------------------------------------------------
-- Self-verification (read-only, service_role like the other verifiers).
-- ---------------------------------------------------------------------------
create or replace function public.verify_m66_owner_photo_parity()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_public_website text := pg_catalog.pg_get_functiondef(
    'public.get_public_salon_website(text)'::regprocedure
  );
  v_visual_config text := pg_catalog.pg_get_functiondef(
    'public.set_owner_salon_visual_config(jsonb)'::regprocedure
  );
begin
  check_name := 'owner identity is projected only behind the owner toggle';
  ok := position('ownerName' in v_public_website) > 0
    and position('ownerRole' in v_public_website) > 0
    and position('ownerPhotoUrl' in v_public_website) > 0
    and (select count(*)::integer from regexp_matches(
      v_public_website, 'nexora_owner_identity_publicly_enabled\(w\.template_key, w\.config\)', 'g')) = 3;
  detail := 'ownerName/ownerRole/ownerPhotoUrl each gated by nexora_owner_identity_publicly_enabled'; return next;

  check_name := 'private owner fields (email, team) are never projected publicly';
  ok := position('ownerName' in v_public_website) > 0
    and (select count(*)::integer from regexp_matches(v_public_website, '''email''', 'g')) = 0
    and position('w.config->''team''' in v_public_website) = 0;
  detail := 'no email key and no team projection in get_public_salon_website'; return next;

  check_name := 'showOwnerPhoto is accepted for all five owner templates';
  ok := position('showOwnerPhoto' in v_visual_config) > 0
    and position('showOwnerPhoto is unsupported by the active template' in v_visual_config) = 0
    and (select count(*)::integer from regexp_matches(v_visual_config, 'supplied.key = ''heroPosition''', 'g')) = 1;
  detail := 'visual-config RPC restricts only heroPosition (barber-only), not showOwnerPhoto'; return next;

  check_name := 'anon resolves through the public RPC only';
  ok := pg_catalog.has_function_privilege('anon',
    'public.get_public_salon_website(text)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',
      'public.set_owner_salon_visual_config(jsonb)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',
      'public.nexora_owner_identity_publicly_enabled(text, jsonb)', 'EXECUTE');
  detail := 'anon: public RPC yes, owner visual-config and gate helper no'; return next;
end;
$$;

revoke all on function public.verify_m66_owner_photo_parity()
  from public, anon, authenticated;
grant execute on function public.verify_m66_owner_photo_parity() to service_role;

commit;
