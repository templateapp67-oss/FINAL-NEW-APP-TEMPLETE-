-- M71 (Phase 2) — Database & Content Auto-Initialization.
--
-- Automatically seeds a salon's sample content ONLY when that salon has none:
--   * active services,
--   * combo packages (+ package_services links),
--   * salon/business hours,
--   * video feeds (social_videos),
--   * gallery media (business_media).
--
-- It is fully idempotent: every content type is guarded by a per-tenant
-- "has rows?" check, so re-running never duplicates and an owner's existing
-- content is never overwritten or edited.
--
-- The tenant key is resolved ADAPTIVELY per table — the canonical app path
-- keys content by `salon_id`, while the reconciled legacy shape keys it by
-- `business_id`. The helper functions detect the live column and seed the
-- matching row set, so the same migration is safe on both shapes.
--
-- It also closes any RLS gap on the seeded content tables with idempotent
-- policies for GUESTS (anon: read active/public content) and REGISTERED
-- USERS (authenticated: read public content; manage their own salon's
-- content) — additive drop-if-exists + create, never destructive.
--
-- Payment gateway note (verified, not re-created): the Razorpay 25% advance
-- is already enforced by `booking_settings.advance_percent = 25.00` (CHECK
-- constraint, M06) and the authoritative server calc `(total*25)/100` in
-- `create_authoritative_customer_booking` (M47). `verify_phase2_auto_init()`
-- reports those plus RLS status so deployments can confirm readiness.

begin;

-- The `private` schema (hosting the app's SECURITY DEFINER helpers) is created
-- by M28, which is preflight-gated and may not be present on every shape.
-- Create it here too so M71 is self-contained on any reconciled schema.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Adaptive tenant helpers
-- ---------------------------------------------------------------------------

-- Which tenant key column a content table actually uses (salon_id | business_id | NULL).
create or replace function private.phase2_tenant_column(p_table text)
returns text
language sql
stable
as $$
  select case
    when to_regclass('public.' || p_table) is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = p_table and column_name = 'salon_id'
      ) then 'salon_id'
    when to_regclass('public.' || p_table) is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = p_table and column_name = 'business_id'
      ) then 'business_id'
    else null
  end
$$;

-- Resolve the tenant value for a content table given a salon id.
-- For `business_id`-keyed tables the salon's matching `businesses` row is
-- resolved by name. A provisioned salon always has a business, so we resolve
-- (never fabricate) it — a business_id shape with no matching business simply
-- reports "unavailable" and the content type is skipped, never mis-seeded.
create or replace function private.phase2_tenant_value(p_salon_id uuid, p_table text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := private.phase2_tenant_column(p_table);
  v_name text;
  v_business uuid;
begin
  if v_col = 'salon_id' then
    return p_salon_id;
  elsif v_col = 'business_id' then
    select s.name into v_name from public.salons s where s.id = p_salon_id;
    if v_name is null then
      return null;
    end if;
    select b.id into v_business
    from public.businesses b
    where btrim(lower(b.name)) = btrim(lower(v_name))
    order by b.created_at asc, b.id
    limit 1;
    return v_business;
  end if;
  return null;
end
$$;

-- Does this salon have any rows in a content table?
create or replace function private.phase2_has_content(p_salon_id uuid, p_table text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := private.phase2_tenant_column(p_table);
  v_tenant uuid := private.phase2_tenant_value(p_salon_id, p_table);
  v_cnt bigint;
begin
  if v_col is null or v_tenant is null then
    return true; -- table/tenant unavailable: treat as "already handled", never throw
  end if;
  execute format(
    'select count(*) from public.%I where %I = $1',
    p_table, v_col
  ) into v_cnt using v_tenant;
  return v_cnt > 0;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The idempotent seeder
-- ---------------------------------------------------------------------------
create or replace function public.auto_seed_salon_content(p_salon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon_name text;
  v_services uuid[];
  v_col text;
  v_tenant uuid;
  v_seeded jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_n bigint;
begin
  if p_salon_id is null then
    raise exception 'p_salon_id is required' using errcode = '22023';
  end if;
  select s.name into v_salon_name from public.salons s where s.id = p_salon_id;
  if v_salon_name is null then
    raise exception 'Salon not found' using errcode = 'P0002';
  end if;

  -- ---------- ACTIVE SERVICES ----------
  v_col := private.phase2_tenant_column('services');
  v_tenant := private.phase2_tenant_value(p_salon_id, 'services');
  if v_col is not null and v_tenant is not null and not private.phase2_has_content(p_salon_id, 'services') then
    execute format(
      'insert into public.services (%I, name, category, price_paise, duration_minutes, short_description, is_featured, status, display_order) '
      || 'select $1, v.name, v.category, v.price_paise, v.duration_minutes, v.short_description, v.is_featured, '
      || '''active''::public.nexora_catalog_status, v.display_order '
      || 'from (values '
      || '  (%L, %L, 49900::bigint, 45, %L, true, 1),'
      || '  (%L, %L, 29900::bigint, 30, %L, true, 2),'
      || '  (%L, %L, 149900::bigint, 90, %L, false, 3),'
      || '  (%L, %L, 89900::bigint, 45, %L, false, 4),'
      || '  (%L, %L, 24900::bigint, 30, %L, false, 5),'
      || '  (%L, %L, 179900::bigint, 60, %L, true, 6)'
      || ') as v(name, category, price_paise, duration_minutes, short_description, is_featured, display_order)',
      v_col,
      'Signature Haircut & Styling','Haircut','A tailored cut and finish shaped to your face, hair type and lifestyle.',
      'Beard Sculpting & Hot Towel','Grooming','Precision beard shaping with a relaxing hot-towel finish.',
      'Ammonia-Free Hair Colour','Colour','Full colour or root touch-up with ammonia-free, organic colour products.',
      'Hair Spa & Scalp Therapy','Treatment','Deep-conditioning scalp massage and spa treatment to restore shine and softness.',
      'Clean Shave & Face Polish','Grooming','A classic barbershop shave with a gentle face-polish finish.',
      'HydraFacial','Facial','A deep-cleansing, hydrating 4-step facial that brightens and de-stresses your skin.'
    ) using v_tenant;
    v_seeded := v_seeded || '{"services":6}'::jsonb;
  else
    v_skipped := v_skipped || '{"services":"exists"}'::jsonb;
  end if;

  -- Remember the seeded service ids for package links.
  v_col := private.phase2_tenant_column('services');
  v_tenant := private.phase2_tenant_value(p_salon_id, 'services');
  if v_col is not null and v_tenant is not null then
    execute format(
      'select array_agg(id order by display_order, created_at) from public.services where %I = $1',
      v_col
    ) into v_services using v_tenant;
  end if;

  -- ---------- COMBO PACKAGES ----------
  v_col := private.phase2_tenant_column('packages');
  v_tenant := private.phase2_tenant_value(p_salon_id, 'packages');
  if v_col is not null and v_tenant is not null and not private.phase2_has_content(p_salon_id, 'packages') then
    execute format(
      'insert into public.packages (%I, name, description, price_paise, duration_minutes, status, display_order) '
      || 'values ($1, %L, %L, 89900::bigint, 90, ''active''::public.nexora_catalog_status, 1),'
      || '       ($1, %L, %L, 199900::bigint, 150, ''active''::public.nexora_catalog_status, 2)',
      v_col,
      'Grooming Ritual Combo','Haircut + beard sculpting + hot-towel shave in one visit.',
      'Colour & Care Package','Colour + hair spa to keep your new shade vibrant and healthy.'
    ) using v_tenant;
    v_seeded := v_seeded || '{"packages":2}'::jsonb;
  else
    v_skipped := v_skipped || '{"packages":"exists"}'::jsonb;
  end if;

  -- Link packages to services where both were seeded together.
  if private.phase2_tenant_column('package_services') is not null and cardinality(v_services) >= 2 then
    execute format(
      'insert into public.package_services (package_id, service_id, display_order) '
      || 'select p.id, s.service_id, s.ord '
      || 'from public.packages p '
      || 'cross join lateral (select $1::uuid as service_id, 1 as ord union all select $2::uuid, 2) s '
      || 'where not exists (select 1 from public.package_services ps where ps.package_id = p.id) '
      || 'and p.%I = $3 and p.name = %L',
      private.phase2_tenant_column('packages')
    ) using v_services[1], v_services[2], v_tenant, 'Grooming Ritual Combo';
  end if;

  -- ---------- SALON / BUSINESS HOURS ----------
  -- Prefer `business_hours`; fall back to `salon_hours` when that is the live table.
  if private.phase2_tenant_column('business_hours') is not null then
    v_col := private.phase2_tenant_column('business_hours');
    v_tenant := private.phase2_tenant_value(p_salon_id, 'business_hours');
    if not private.phase2_has_content(p_salon_id, 'business_hours') then
      execute format(
        'insert into public.business_hours (%I, day_of_week, is_open, open_time, close_time) values '
        || '($1,0,true,''10:00''::time,''18:00''::time),'
        || '($1,1,true,''10:00''::time,''20:00''::time),'
        || '($1,2,true,''10:00''::time,''20:00''::time),'
        || '($1,3,true,''10:00''::time,''20:00''::time),'
        || '($1,4,true,''10:00''::time,''20:00''::time),'
        || '($1,5,true,''10:00''::time,''21:00''::time),'
        || '($1,6,true,''09:00''::time,''21:00''::time)',
        v_col
      ) using v_tenant;
      v_seeded := v_seeded || '{"business_hours":7}'::jsonb;
    else
      v_skipped := v_skipped || '{"business_hours":"exists"}'::jsonb;
    end if;
  elsif private.phase2_tenant_column('salon_hours') is not null then
    v_col := private.phase2_tenant_column('salon_hours');
    v_tenant := private.phase2_tenant_value(p_salon_id, 'salon_hours');
    if not private.phase2_has_content(p_salon_id, 'salon_hours') then
      execute format(
        'insert into public.salon_hours (%I, day_of_week, is_open, open_time, close_time) values '
        || '($1,0,true,''10:00''::time,''18:00''::time),'
        || '($1,1,true,''10:00''::time,''20:00''::time),'
        || '($1,2,true,''10:00''::time,''20:00''::time),'
        || '($1,3,true,''10:00''::time,''20:00''::time),'
        || '($1,4,true,''10:00''::time,''20:00''::time),'
        || '($1,5,true,''10:00''::time,''21:00''::time),'
        || '($1,6,true,''09:00''::time,''21:00''::time)',
        v_col
      ) using v_tenant;
      v_seeded := v_seeded || '{"salon_hours":7}'::jsonb;
    else
      v_skipped := v_skipped || '{"salon_hours":"exists"}'::jsonb;
    end if;
  end if;

  -- ---------- VIDEO FEEDS ----------
  v_col := private.phase2_tenant_column('social_videos');
  v_tenant := private.phase2_tenant_value(p_salon_id, 'social_videos');
  if v_col is not null and v_tenant is not null and not private.phase2_has_content(p_salon_id, 'social_videos') then
    execute format(
      'insert into public.social_videos (%I, platform, video_url, external_video_id, caption, display_order, status) values '
      || '($1, ''instagram''::public.nexora_social_platform, %L, %L, %L, 1, ''active''::public.nexora_catalog_status),'
      || '($1, ''instagram''::public.nexora_social_platform, %L, %L, %L, 2, ''active''::public.nexora_catalog_status),'
      || '($1, ''youtube''::public.nexora_social_platform, %L, %L, %L, 3, ''active''::public.nexora_catalog_status),'
      || '($1, ''facebook''::public.nexora_social_platform, %L, %L, %L, 4, ''active''::public.nexora_catalog_status)',
      v_col,
      'https://instagram.com/reel/nexora-demo-1','nexora-demo-1','Behind the chair with Uma ✂️',
      'https://instagram.com/reel/nexora-demo-2','nexora-demo-2','Colour transformation reel',
      'https://youtube.com/watch?v=nexora-demo-3','nexora-demo-3','Bridal styling masterclass',
      'https://facebook.com/watch/nexora-demo-4','nexora-demo-4','Grooming ritual walkthrough'
    ) using v_tenant;
    v_seeded := v_seeded || '{"social_videos":4}'::jsonb;
  else
    v_skipped := v_skipped || '{"social_videos":"exists"}'::jsonb;
  end if;

  -- ---------- GALLERY MEDIA ----------
  v_col := private.phase2_tenant_column('business_media');
  v_tenant := private.phase2_tenant_value(p_salon_id, 'business_media');
  if v_col is not null and v_tenant is not null and not private.phase2_has_content(p_salon_id, 'business_media') then
    execute format(
      'insert into public.business_media (%I, media_type, storage_path, public_url, category, display_order, is_demo) values '
      || '($1, ''gallery''::public.nexora_media_type, %L, %L, ''Interior'', 1, true),'
      || '($1, ''gallery''::public.nexora_media_type, %L, %L, ''Hair'', 2, true),'
      || '($1, ''gallery''::public.nexora_media_type, %L, %L, ''General'', 3, true),'
      || '($1, ''gallery''::public.nexora_media_type, %L, %L, ''Details'', 4, true),'
      || '($1, ''gallery''::public.nexora_media_type, %L, %L, ''Barber'', 5, true),'
      || '($1, ''gallery''::public.nexora_media_type, %L, %L, ''Beauty'', 6, true)',
      v_col,
      'demo/arts-by-uma/g1.jpg','https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800',
      'demo/arts-by-uma/g2.jpg','https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800',
      'demo/arts-by-uma/g3.jpg','https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
      'demo/arts-by-uma/g4.jpg','https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
      'demo/arts-by-uma/g5.jpg','https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800',
      'demo/arts-by-uma/g6.jpg','https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=800'
    ) using v_tenant;
    v_seeded := v_seeded || '{"business_media":6}'::jsonb;
  else
    v_skipped := v_skipped || '{"business_media":"exists"}'::jsonb;
  end if;

  return jsonb_build_object('salon_id', p_salon_id, 'name', v_salon_name,
                            'seeded', v_seeded, 'skipped', v_skipped);
end
$$;

-- Convenience entry point: seed the demo salon (or any salon) by slug.
create or replace function public.seed_demo_salon_content(p_slug text default 'nexora-demo-salon')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.salons s where s.slug = lower(btrim(p_slug)) limit 1;
  if v_id is null then
    return jsonb_build_object('error', 'Salon slug not found', 'slug', p_slug);
  end if;
  return public.auto_seed_salon_content(v_id);
end
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS — guests (anon) read public content; registered users manage their own.
-- ---------------------------------------------------------------------------
create or replace function private.phase2_can_manage_tenant(p_salon_id uuid, p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  -- business_members ownership (reconciled / legacy shape). Defensive: some
  -- reconciled shapes lack this table — a missing object must read "no" not throw.
  if p_business_id is not null then
    begin
      if exists (
        select 1 from public.business_members bm
        where bm.business_id = p_business_id and bm.user_id = v_uid
      ) then
        return true;
      end if;
    exception when others then
      null;
    end;
  end if;
  -- salon ownership via organization membership (canonical Design-B shape).
  -- The reconciled shape may not expose organization_members columns; guard it.
  if p_salon_id is not null then
    begin
      if exists (
        select 1
        from public.salons s
        join public.organization_members om on om.organization_id = s.organization_id
        where s.id = p_salon_id and om.user_id = v_uid and om.role = 'owner'
      ) then
        return true;
      end if;
    exception when others then
      null;
    end;
  end if;
  return false;
end
$$;

do $phase2_rls$
declare
  t text;
  col text;
  has_status boolean;
begin
  foreach t in array array['services','packages','business_hours','social_videos','business_media','salon_hours'] loop
    if to_regclass('public.' || t) is not null then
      col := private.phase2_tenant_column(t);
      -- Activate RLS on the content table (idempotent).
      execute format('alter table public.%I enable row level security', t);
      -- Table-level SELECT grant so guests/registered users can actually read
      -- the public content (RLS below decides which rows are visible).
      execute format('grant select on public.%I to anon, authenticated', t);
      -- Guests: read only public/active content. Tables carrying a `status`
      -- column (services, packages, social_videos) expose active rows only;
      -- hours/media are public by nature.
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'status'
      ) into has_status;
      execute format(
        'drop policy if exists phase2_anon_read on public.%I', t);
      if has_status then
        execute format(
          'create policy phase2_anon_read on public.%I for select to anon, authenticated '
          || 'using (status = ''active''::public.nexora_catalog_status)', t);
      else
        execute format(
          'create policy phase2_anon_read on public.%I for select to anon, authenticated using (true)', t);
      end if;
      -- Registered users: manage their own salon's content (only when we can
      -- resolve the tenant column on the live table).
      if col = 'business_id' then
        execute format('drop policy if exists phase2_owner_all on public.%I', t);
        execute format(
          'create policy phase2_owner_all on public.%I for all to authenticated '
          || 'using (private.phase2_can_manage_tenant(null, %I)) '
          || 'with check (private.phase2_can_manage_tenant(null, %I))',
          t, col, col);
      elsif col = 'salon_id' then
        execute format('drop policy if exists phase2_owner_all on public.%I', t);
        execute format(
          'create policy phase2_owner_all on public.%I for all to authenticated '
          || 'using (private.phase2_can_manage_tenant(%I, null)) '
          || 'with check (private.phase2_can_manage_tenant(%I, null))',
          t, col, col);
      end if;
    end if;
  end loop;
end
$phase2_rls$;

-- ---------------------------------------------------------------------------
-- 4. Readiness verification (payment gateway + RLS + seed availability)
-- ---------------------------------------------------------------------------
create or replace function public.verify_phase2_auto_init()
returns table (check_name text, ok boolean, detail text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Razorpay 25% advance (authoritative server calc).
  check_name := 'create_authoritative_customer_booking (25% advance)';
  ok := to_regprocedure(
    'public.create_authoritative_customer_booking(uuid,uuid,uuid[],uuid,timestamptz,text,text)'
  ) is not null;
  detail := 'server-authoritative booking RPC computes (total*25)/100';
  return next;

  -- booking_settings fixed 25% advance CHECK.
  check_name := 'booking_settings.advance_percent = 25 CHECK';
  ok := exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_settings'::regclass
      and conname = 'booking_settings_fixed_advance'
  );
  detail := 'immutable 25.00 advance enforced by DB check';
  return next;

  -- Razorpay payment foundation.
  check_name := 'razorpay payment functions';
  ok := exists (select 1 from pg_proc where proname like 'create_razorpay%')
     or exists (select 1 from pg_proc where proname like 'razorpay%');
  detail := 'payment gateway RPCs present (m29 foundation)';
  return next;

  -- RLS enabled on the seeded content tables.
  check_name := 'RLS enabled on services/packages/hours/videos/media';
  ok := (
    select bool_and(relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('services','packages','business_hours','social_videos','business_media')
      and c.relkind = 'r'
  );
  detail := 'guests (anon) read public content; owners manage their own';
  return next;

  -- Seeder availability.
  check_name := 'auto_seed_salon_content + seed_demo_salon_content';
  ok := to_regprocedure('public.auto_seed_salon_content(uuid)') is not null
     and to_regprocedure('public.seed_demo_salon_content(text)') is not null;
  detail := 'idempotent demo-content seeder ready';
  return next;
end
$$;

-- Make the demo-content read surface visible to guests/registered users
-- (referenced by the RLS policies above; additive only).
grant execute on function public.auto_seed_salon_content(uuid) to service_role;
grant execute on function public.seed_demo_salon_content(text) to service_role;
grant execute on function public.verify_phase2_auto_init() to anon, authenticated;
grant execute on function private.phase2_can_manage_tenant(uuid, uuid) to authenticated;

comment on function public.auto_seed_salon_content(uuid) is
  'Phase 2: idempotently seed a salon''s sample services, combo packages, hours, videos and gallery when absent.';
comment on function public.seed_demo_salon_content(text) is
  'Phase 2: seed the demo salon (or any salon by slug) with sample content if not present.';

-- ---------------------------------------------------------------------------
-- 5. Automatic backfill: seed any already-provisioned demo salon(s) on apply.
--    Idempotent + safe — a salon that already has content is left untouched,
--    and this is a no-op when no demo salon exists yet.
-- ---------------------------------------------------------------------------
do $phase2_autoseed$
declare
  v_slugs text[] := array['nexora-demo-salon', 'arts-by-uma', 'royal-hair-studio'];
  s text;
begin
  if to_regclass('public.salons') is not null then
    foreach s in array v_slugs loop
      if exists (select 1 from public.salons where slug = s) then
        perform public.seed_demo_salon_content(s);
      end if;
    end loop;
  end if;
end
$phase2_autoseed$;

commit;
