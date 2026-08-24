-- M48 — Critical template-switch isolation and visual-config authority
--
-- A template switch is an in-place presentation change on the authenticated
-- owner's existing salon. This migration intentionally writes only:
--   * salons.theme_id
--   * salon_public_websites.template_key
--   * salon_public_websites.config (strict visual top-level keys, separate RPC)
-- No business, owner, location, service/pricing, product, customer, booking,
-- or payment table is read for mutation or written by these functions.

create or replace function public.set_owner_salon_template(p_template_id text)
returns table (
  out_salon_id uuid,
  out_template_id text
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_salon_id uuid;
  v_theme_id uuid;
  v_owner_salon_count integer;
begin
  if v_user_id is null then
    raise exception 'You must be logged in to change templates.' using errcode = '28000';
  end if;

  if p_template_id is null or p_template_id not in (
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio'
  ) then
    raise exception 'Unknown template id: %', coalesce(p_template_id, '<null>') using errcode = '22023';
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

  select themes.id
    into v_theme_id
  from public.themes as themes
  where themes.theme_id = p_template_id
    and themes.is_active = true;

  if v_theme_id is null then
    raise exception 'Template is not available: %', p_template_id using errcode = '22023';
  end if;

  -- Lock both presentation rows before either update. The function call is one
  -- transaction, so a missing website row cannot leave a half-applied switch.
  perform 1 from public.salons where id = v_salon_id for update;
  if not found then
    raise exception 'Owner salon no longer exists.' using errcode = 'P0002';
  end if;

  perform 1 from public.salon_public_websites where salon_id = v_salon_id for update;
  if not found then
    raise exception 'Owner salon website is not provisioned.' using errcode = 'P0002';
  end if;

  update public.salons
  set theme_id = v_theme_id
  where id = v_salon_id
    and theme_id is distinct from v_theme_id;

  update public.salon_public_websites
  set template_key = p_template_id
  where salon_id = v_salon_id
    and template_key is distinct from p_template_id;

  return query select v_salon_id, p_template_id;
end;
$fn$;

revoke all on function public.set_owner_salon_template(text) from public;
revoke all on function public.set_owner_salon_template(text) from anon;
grant execute on function public.set_owner_salon_template(text) to authenticated;

comment on function public.set_owner_salon_template(text) is
  'Atomically switches only the authenticated owner salon presentation references; protected tenant data is never mutated.';

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
    if exists (
      select 1
      from jsonb_each(p_visual_config -> 'templateConfigs') as templates(template_id, template_config)
      cross join lateral jsonb_object_keys(templates.template_config) as supplied(key)
      where (supplied.key = 'heroPosition' and templates.template_id <> 'barber_mens_grooming')
         or (supplied.key = 'showOwnerPhoto' and templates.template_id not in (
           'hair_studio_color_bar',
           'beauty_skin_spa',
           'family_full_service'
         ))
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

  if (p_visual_config -> 'templateConfig') ? 'heroPosition'
     and v_template_key <> 'barber_mens_grooming' then
    raise exception 'heroPosition is unsupported by the active template.' using errcode = '22023';
  end if;
  if (p_visual_config -> 'templateConfig') ? 'showOwnerPhoto'
     and v_template_key not in (
       'hair_studio_color_bar',
       'beauty_skin_spa',
       'family_full_service'
     ) then
    raise exception 'showOwnerPhoto is unsupported by the active template.' using errcode = '22023';
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
