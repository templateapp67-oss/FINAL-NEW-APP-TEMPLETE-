-- ===========================================================================
-- M50 — Publish-readiness validation (existing business rules only)
-- ===========================================================================
-- Adds `verify_owner_publish_readiness`, a read-only SECURITY DEFINER RPC that
-- re-checks the SAME required-information rules the wizard already enforces
-- (src/lib/publishReadiness.ts) inside the database, against the persisted
-- business row and the config being published. It is a gate, not a write:
-- publishing still goes only through `publish_owner_salon_website`.
--
-- Required (existing rules — nothing optional is invented):
--   * business identity  → salons.name (Business name)
--   * business identity  → tagline or about in config (tagline / about)
--   * required services  → named service in the draft config or an active
--                           canonical catalog service for this salon
--   * business config    → phone / email / whatsappPhone in config
--   * active template    → template_key is one of the five themes AND that
--                           theme row exists and is active
--   * website config     → appearance light/dark in config
--   * website config     → content review step reached or reviewed copy exists
--
-- Deliberately optional (existing rules): team, gallery, location/hours,
-- offers, videos, bookings/payments/Razorpay.

begin;

create or replace function private.nexora_publish_missing_items(
  p_config jsonb,
  p_template_key text
)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_template text := lower(btrim(coalesce(p_template_key, '')));
  v_salon_name text;
  v_salon_id uuid;
  v_draft_name text;
  v_draft_tagline text;
  v_draft_about text;
  v_draft_phone text;
  v_draft_email text;
  v_draft_whatsapp text;
  v_draft_appearance text;
  v_draft_reviewed jsonb;
  v_draft_step integer;
  v_canon_services boolean := false;
  v_missing text[] := '{}'::text[];
begin
  v_salon_id := private.owned_publish_salon_id(null);
  if v_salon_id is null then
    return array['Business name', 'Required service setup',
      'Required business configuration (contact details)',
      'Active template selection',
      'Required website configuration (appearance)',
      'Required website configuration (content review)'];
  end if;

  select s.name into v_salon_name from public.salons s where s.id = v_salon_id;

  v_draft_name := nullif(btrim(coalesce(p_config->>'salonName', '')), '');
  v_draft_tagline := nullif(btrim(coalesce(p_config->>'tagline', '')), '');
  v_draft_about := nullif(btrim(coalesce(p_config->>'about', '')), '');
  v_draft_phone := nullif(btrim(coalesce(p_config->>'phone', '')), '');
  v_draft_email := nullif(btrim(coalesce(p_config->>'email', '')), '');
  v_draft_whatsapp := nullif(btrim(coalesce(p_config->>'whatsappPhone', '')), '');
  v_draft_appearance := lower(btrim(coalesce(p_config->>'websiteAppearance', '')));
  v_draft_reviewed := p_config->'reviewedContent';
  v_draft_step := case
    when p_config->>'lastCompletedStep' ~ '^[0-9]+$'
      then (p_config->>'lastCompletedStep')::integer
    else 0
  end;

  -- Canonical service catalog check is only used when the Design B shape
  -- (salon_id + is_active) exists; otherwise the draft config list is the
  -- single service authority (never a guessed table shape).
  if to_regclass('public.services') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'services'
         and column_name = 'salon_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'services'
         and column_name = 'is_active'
     )
  then
    select exists (
      select 1 from public.services svc
      where svc.salon_id = v_salon_id
        and svc.is_active = true
        and nullif(btrim(svc.name), '') is not null
    ) into v_canon_services;
  end if;

  -- 1. Business identity / name
  if coalesce(nullif(btrim(v_draft_name), ''), nullif(btrim(v_salon_name), '')) is null then
    v_missing := array_append(v_missing, 'Business name');
  end if;
  -- 2. Business identity / marketing copy
  if v_draft_tagline is null and v_draft_about is null then
    v_missing := array_append(v_missing, 'Business tagline or About section');
  end if;
  -- 3. Required service setup (draft service list or canonical catalog)
  if (
    not exists (
      select 1 from jsonb_array_elements(coalesce(p_config->'services', '[]'::jsonb)) s
      where nullif(btrim(coalesce(s->>'name', '')), '') is not null
    )
    and not v_canon_services
  ) then
    v_missing := array_append(v_missing, 'Required service setup');
  end if;
  -- 4. Required business configuration (contact)
  if v_draft_phone is null and v_draft_email is null and v_draft_whatsapp is null then
    v_missing := array_append(v_missing,
      'Required business configuration (contact details)');
  end if;
  -- 5. Active template selection (allowed key AND active theme row)
  if v_template not in (
    'barber_mens_grooming','hair_studio_color_bar','beauty_skin_spa',
    'family_full_service','nail_lash_studio'
  ) or not exists (
    select 1 from public.themes t
    where t.theme_id = v_template and t.is_active = true
  ) then
    v_missing := array_append(v_missing, 'Active template selection');
  end if;
  -- 6. Required website configuration (appearance)
  if v_draft_appearance not in ('light', 'dark') then
    v_missing := array_append(v_missing,
      'Required website configuration (appearance)');
  end if;
  -- 7. Required website configuration (content review)
  if (
    v_draft_reviewed is null
    or not (
      nullif(btrim(coalesce(v_draft_reviewed->>'heroHeadline', '')), '') is not null
      or nullif(btrim(coalesce(v_draft_reviewed->>'tagline', '')), '') is not null
      or nullif(btrim(coalesce(v_draft_reviewed->>'about', '')), '') is not null
      or nullif(btrim(coalesce(v_draft_reviewed->>'bookingCTA', '')), '') is not null
    )
  ) and (v_draft_step < 10) then
    v_missing := array_append(v_missing,
      'Required website configuration (content review)');
  end if;

  return v_missing;
end;
$$;
revoke all on function private.nexora_publish_missing_items(jsonb, text)
  from public, anon, authenticated;

-- Read-only readiness validator. Returns the exact incomplete items (empty
-- array = ready to publish). Never writes; the publish RPC stays the single
-- authority that flips is_published.
create or replace function public.verify_owner_publish_readiness(
  p_config jsonb default '{}'::jsonb,
  p_template_key text default null
)
returns table (missing_item text)
language sql
stable
security definer
set search_path = ''
as $$
  select item
  from unnest(private.nexora_publish_missing_items(
    case when p_config is not null and jsonb_typeof(p_config) = 'object'
      then p_config else '{}'::jsonb end,
    p_template_key
  )) as item
$$;
revoke all on function public.verify_owner_publish_readiness(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.verify_owner_publish_readiness(jsonb, text)
  to authenticated;

create or replace function public.verify_m50_publish_readiness()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'readiness RPC exists';
  ok := to_regprocedure('public.verify_owner_publish_readiness(jsonb,text)') is not null;
  detail := 'owner-only read gate'; return next;

  check_name := 'readiness is authenticated only';
  ok := pg_catalog.has_function_privilege('authenticated',
    'public.verify_owner_publish_readiness(jsonb,text)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',
    'public.verify_owner_publish_readiness(jsonb,text)', 'EXECUTE');
  detail := 'anon and public cannot run the validator'; return next;

  check_name := 'readiness items builder is owner-private';
  ok := not pg_catalog.has_function_privilege('anon',
    'private.nexora_publish_missing_items(jsonb,text)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated',
    'private.nexora_publish_missing_items(jsonb,text)', 'EXECUTE');
  detail := 'only the validator RPC may evaluate the rules'; return next;

  check_name := 'readiness returns a row set';
  ok := exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'verify_owner_publish_readiness'
      and p.proretset = true
  );
  detail := 'table-returning validator deployed'; return next;
end;
$$;
revoke all on function public.verify_m50_publish_readiness() from public, anon, authenticated;
grant execute on function public.verify_m50_publish_readiness() to service_role;

commit;
