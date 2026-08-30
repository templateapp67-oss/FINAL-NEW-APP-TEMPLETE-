-- ============================================================================
-- M65 — radius-checked Home Service bookings (all five templates)
-- ============================================================================
--
-- WHAT
-- ----
-- 1. Additive canonical booking columns capturing the fulfillment decision:
--      fulfillment_mode ('at_salon' | 'home_service'), service_address,
--      service_latitude/longitude, service_distance_km,
--      home_service_charge_paise.
-- 2. A pure-SQL Haversine helper (no PostGIS, no Google Maps).
-- 3. create_authoritative_customer_booking_v2 — the ONLY write path for
--    home-service bookings. It recomputes distance and charge on the server
--    from (a) the salon's canonical business_locations coordinates, (b) the
--    server-geocoded customer coordinates and (c) the owner's published
--    Home Service settings in salon_public_websites.config->bookingRules->
--    homeService. Browser-supplied distance/charge/radius are never accepted.
-- 4. Recreated customer/owner read RPCs (and their M55 actor-bound wrappers)
--    so booking lists expose the new columns.
--
-- SAFETY
-- ------
-- Additive only. The M47/M55 seven-argument creation function is left fully
-- intact (M61 preflights on its regprocedure), existing At-Salon bookings are
-- untouched (defaults: 'at_salon', zero charge), no historical migration is
-- modified and RLS/tenant isolation is unchanged. Idempotency keys keep their
-- existing semantics; the Home Service charge is applied exactly once because
-- an idempotent replay returns the persisted row instead of re-pricing.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 0. Fail closed when the canonical chain is absent.
-- ---------------------------------------------------------------------------
do $m65_preflight$
begin
  if to_regclass('public.bookings') is null
     or to_regclass('public.booking_services') is null
     or to_regclass('public.booking_request_keys') is null
     or to_regclass('public.business_locations') is null
     or to_regclass('public.salon_public_websites') is null
     or to_regprocedure('public.create_authoritative_customer_booking(uuid,uuid,uuid[],uuid,timestamptz,text,text)') is null then
    raise exception
      'M65 preflight: canonical booking foundation is missing. Apply M28..M55 first.';
  end if;
end
$m65_preflight$;

-- ---------------------------------------------------------------------------
-- 1. Additive canonical booking columns.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists fulfillment_mode text not null default 'at_salon',
  add column if not exists service_address text,
  add column if not exists service_latitude numeric(9,6),
  add column if not exists service_longitude numeric(9,6),
  add column if not exists service_distance_km numeric(7,2),
  add column if not exists home_service_charge_paise bigint not null default 0;

do $m65_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'm65_bookings_fulfillment_mode_check'
  ) then
    alter table public.bookings
      add constraint m65_bookings_fulfillment_mode_check
      check (fulfillment_mode in ('at_salon', 'home_service')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'm65_bookings_home_charge_nonnegative'
  ) then
    alter table public.bookings
      add constraint m65_bookings_home_charge_nonnegative
      check (home_service_charge_paise >= 0) not valid;
  end if;

  -- At-salon rows can never silently carry a home-service surcharge.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'm65_bookings_at_salon_zero_charge'
  ) then
    alter table public.bookings
      add constraint m65_bookings_at_salon_zero_charge
      check (fulfillment_mode = 'home_service' or home_service_charge_paise = 0) not valid;
  end if;

  -- A home-service row must carry the full verified fulfillment snapshot.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'm65_bookings_home_service_snapshot'
  ) then
    alter table public.bookings
      add constraint m65_bookings_home_service_snapshot
      check (
        fulfillment_mode <> 'home_service'
        or (
          service_address is not null and btrim(service_address) <> ''
          and service_latitude is not null and service_latitude between -90 and 90
          and service_longitude is not null and service_longitude between -180 and 180
          and service_distance_km is not null and service_distance_km >= 0
        )
      ) not valid;
  end if;
end
$m65_constraints$;

alter table public.bookings validate constraint m65_bookings_fulfillment_mode_check;
alter table public.bookings validate constraint m65_bookings_home_charge_nonnegative;
alter table public.bookings validate constraint m65_bookings_at_salon_zero_charge;
alter table public.bookings validate constraint m65_bookings_home_service_snapshot;

comment on column public.bookings.fulfillment_mode is
  'M65: where the appointment is served — at_salon (default) or home_service.';
comment on column public.bookings.service_address is
  'M65: customer-entered service address (home_service only).';
comment on column public.bookings.service_distance_km is
  'M65: server-verified straight-line distance from the salon (home_service only).';
comment on column public.bookings.home_service_charge_paise is
  'M65: authoritative flat home-service surcharge included in total_amount_paise.';

-- ---------------------------------------------------------------------------
-- 2. Pure-SQL Haversine (km). No PostGIS, deterministic, NaN-safe.
-- ---------------------------------------------------------------------------
create or replace function private.nexora_haversine_km(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select (
    2 * 6371.0 * asin(
      least(1.0, sqrt(
        power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
        + cos(radians(p_lat1::double precision))
          * cos(radians(p_lat2::double precision))
          * power(sin(radians((p_lon2 - p_lon1)::double precision) / 2), 2)
      ))
    )
  )::numeric;
$$;

revoke all on function private.nexora_haversine_km(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function private.nexora_haversine_km(numeric, numeric, numeric, numeric)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Owner-published Home Service settings, read server-side only from the
--    canonical website config (no separate settings table, no new tenancy).
--    Returns (enabled, radius_km, charge_paise); fails closed on bad data.
-- ---------------------------------------------------------------------------
create or replace function private.nexora_home_service_settings(p_salon_id uuid)
returns table (enabled boolean, radius_km numeric, charge_paise bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
  v_enabled boolean := false;
  v_radius numeric := null;
  v_charge_inr numeric := null;
begin
  select w.config #> '{bookingRules,homeService}'
    into v_raw
  from public.salon_public_websites w
  where w.salon_id = p_salon_id;

  if v_raw is null or jsonb_typeof(v_raw) <> 'object' then
    return query select false, null::numeric, 0::bigint;
    return;
  end if;

  begin
    v_enabled := coalesce((v_raw ->> 'enabled')::boolean, false);
    v_radius := nullif(v_raw ->> 'radiusKm', '')::numeric;
    v_charge_inr := nullif(v_raw ->> 'extraCharge', '')::numeric;
  exception when others then
    -- Corrupt owner config can never enable the feature.
    return query select false, null::numeric, 0::bigint;
    return;
  end;

  if v_radius is null or v_radius <= 0 or v_radius > 500
     or v_charge_inr is null or v_charge_inr < 0 or v_charge_inr > 100000 then
    return query select false, null::numeric, 0::bigint;
    return;
  end if;

  return query select v_enabled, v_radius, round(v_charge_inr * 100)::bigint;
end;
$$;

revoke all on function private.nexora_home_service_settings(uuid)
  from public, anon, authenticated;
grant execute on function private.nexora_home_service_settings(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Authoritative creation with fulfillment. The v1 seven-argument function
--    is intentionally untouched (M61 preflight + At-Salon regression path).
-- ---------------------------------------------------------------------------
create or replace function public.create_authoritative_customer_booking_v2(
  p_customer_id uuid,
  p_salon_id uuid,
  p_service_ids uuid[],
  p_staff_id uuid,
  p_appointment_start timestamptz,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_fulfillment_mode text default 'at_salon',
  p_service_address text default null,
  p_service_latitude numeric default null,
  p_service_longitude numeric default null
)
returns table (
  booking_id uuid,
  amount_paise bigint,
  currency text,
  appointment_end timestamptz,
  total_amount_paise bigint,
  advance_amount_paise bigint,
  remaining_amount_paise bigint,
  fulfillment_mode text,
  service_address text,
  service_distance_km numeric,
  home_service_charge_paise bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_key public.booking_request_keys%rowtype;
  new_booking_id uuid;
  service_count integer;
  total_duration integer;
  total_amount bigint;
  calculated_advance bigint;
  calculated_remaining bigint;
  calculated_end timestamptz;
  v_mode text := coalesce(nullif(btrim(p_fulfillment_mode), ''), 'at_salon');
  v_address text := nullif(btrim(coalesce(p_service_address, '')), '');
  v_salon_lat numeric;
  v_salon_lon numeric;
  v_hs_enabled boolean;
  v_hs_radius numeric;
  v_hs_charge bigint := 0;
  v_distance numeric := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_customer_id is null or p_salon_id is null then
    raise exception 'customer and salon are required' using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_request_fingerprint is null
     or char_length(p_request_fingerprint) <> 64 then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  if p_service_ids is null or cardinality(p_service_ids) = 0
     or cardinality(p_service_ids) > 20 then
    raise exception 'one to twenty services are required' using errcode = '22023';
  end if;
  if (select count(distinct item) from unnest(p_service_ids) item) <> cardinality(p_service_ids) then
    raise exception 'duplicate services are not allowed' using errcode = '22023';
  end if;
  if p_appointment_start < now() + interval '5 minutes'
     or p_appointment_start > now() + interval '1 year' then
    raise exception 'appointment time is outside the allowed range' using errcode = '22023';
  end if;
  if v_mode not in ('at_salon', 'home_service') then
    raise exception 'invalid fulfillment mode' using errcode = '22023';
  end if;
  if v_mode = 'at_salon'
     and (v_address is not null or p_service_latitude is not null or p_service_longitude is not null) then
    raise exception 'at-salon bookings must not carry a service address' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.salons s
    where s.id = p_salon_id and s.is_active = true and s.deleted_at is null
  ) then
    raise exception 'salon is not bookable' using errcode = 'P0002';
  end if;

  -- -------------------------------------------------------------------------
  -- Authoritative Home Service validation. Every fact is re-derived here:
  -- owner settings from the canonical website config, salon coordinates from
  -- business_locations, distance from the server-verified customer point.
  -- -------------------------------------------------------------------------
  if v_mode = 'home_service' then
    if v_address is null or char_length(v_address) < 10 or char_length(v_address) > 400 then
      raise exception 'a complete service address is required for home service' using errcode = '22023';
    end if;
    if p_service_latitude is null or p_service_longitude is null
       or p_service_latitude not between -90 and 90
       or p_service_longitude not between -180 and 180 then
      raise exception 'the service address could not be verified' using errcode = '22023';
    end if;

    select hs.enabled, hs.radius_km, hs.charge_paise
      into v_hs_enabled, v_hs_radius, v_hs_charge
    from private.nexora_home_service_settings(p_salon_id) hs;
    if not coalesce(v_hs_enabled, false) then
      raise exception 'home service is not enabled for this salon' using errcode = '22023';
    end if;

    select bl.latitude, bl.longitude
      into v_salon_lat, v_salon_lon
    from public.business_locations bl
    where bl.salon_id = p_salon_id
      and bl.approval_status <> 'rejected';
    if v_salon_lat is null or v_salon_lon is null then
      raise exception 'this salon has no confirmed location for home service' using errcode = '22023';
    end if;

    v_distance := round(
      private.nexora_haversine_km(v_salon_lat, v_salon_lon, p_service_latitude, p_service_longitude),
      2
    );
    if v_distance is null or v_distance < 0 then
      raise exception 'the service distance could not be verified' using errcode = '22023';
    end if;
    if v_distance > v_hs_radius then
      raise exception 'the address is outside the home service radius (% km of % km allowed)',
        v_distance, v_hs_radius using errcode = '22023';
    end if;
  else
    v_hs_charge := 0;
  end if;

  insert into public.booking_request_keys (
    customer_id, idempotency_key, request_fingerprint
  ) values (
    p_customer_id, p_idempotency_key, p_request_fingerprint
  ) on conflict (customer_id, idempotency_key) do nothing;

  select * into existing_key
  from public.booking_request_keys brk
  where brk.customer_id = p_customer_id and brk.idempotency_key = p_idempotency_key
  for update;
  if existing_key.request_fingerprint <> p_request_fingerprint then
    raise exception 'idempotency key was reused for a different request' using errcode = '23505';
  end if;
  if existing_key.booking_id is not null then
    -- Idempotent replay: the persisted row already contains the charge, so it
    -- can never be applied twice.
    return query
      select b.id, b.advance_amount_paise, b.currency, b.appointment_end,
             b.total_amount_paise, b.advance_amount_paise,
             greatest(0::bigint, b.total_amount_paise - b.advance_amount_paise),
             b.fulfillment_mode, b.service_address, b.service_distance_km,
             b.home_service_charge_paise
      from public.bookings b where b.id = existing_key.booking_id;
    return;
  end if;

  -- The row locks stabilize service pricing until snapshots are inserted.
  perform 1
  from public.services s
  where s.id = any(p_service_ids)
    and s.salon_id = p_salon_id
    and s.is_active = true
    and s.deleted_at is null
  for share;

  select count(*), sum(s.duration_minutes)::integer, sum(s.price_paise)::bigint
    into service_count, total_duration, total_amount
  from public.services s
  where s.id = any(p_service_ids)
    and s.salon_id = p_salon_id
    and s.is_active = true
    and s.deleted_at is null;
  if service_count <> cardinality(p_service_ids) then
    raise exception 'one or more services are unavailable' using errcode = 'P0002';
  end if;
  if total_duration <= 0 or total_duration > 480 or total_amount < 0 then
    raise exception 'service quote is invalid' using errcode = '23514';
  end if;
  calculated_end := p_appointment_start + make_interval(mins => total_duration);

  -- Booking total = service total + authoritative home-service charge.
  total_amount := total_amount + v_hs_charge;

  -- Authoritative fixed 25% advance on the FINAL total (charge included).
  calculated_advance := (total_amount * 25) / 100;
  calculated_remaining := total_amount - calculated_advance;

  if p_staff_id is not null and not exists (
    select 1 from public.staff st
    where st.salon_id = p_salon_id and st.id = p_staff_id and st.is_active = true
  ) then
    raise exception 'staff member is not available for this salon' using errcode = 'P0002';
  end if;

  -- Serialize potentially colliding requests, then check active bookings.
  perform pg_advisory_xact_lock(hashtextextended(
    p_salon_id::text || ':' || coalesce(p_staff_id::text, 'unassigned'),
    0
  ));
  if exists (
    select 1 from public.bookings b
    where b.salon_id = p_salon_id
      and b.status in ('pending', 'confirmed')
      and b.appointment_start < calculated_end
      and coalesce(b.appointment_end, b.appointment_start + interval '1 minute') > p_appointment_start
      and (p_staff_id is null or b.staff_id = p_staff_id)
  ) then
    raise exception 'the selected time is no longer available' using errcode = '23P01';
  end if;

  insert into public.bookings (
    salon_id, customer_id, staff_id, appointment_start, appointment_end,
    status, payment_status, total_amount_paise, advance_amount_paise,
    currency, expires_at,
    fulfillment_mode, service_address, service_latitude, service_longitude,
    service_distance_km, home_service_charge_paise
  ) values (
    p_salon_id, p_customer_id, p_staff_id, p_appointment_start, calculated_end,
    'pending', 'pending', total_amount, calculated_advance,
    'INR', now() + interval '15 minutes',
    v_mode,
    case when v_mode = 'home_service' then v_address else null end,
    case when v_mode = 'home_service' then round(p_service_latitude, 6) else null end,
    case when v_mode = 'home_service' then round(p_service_longitude, 6) else null end,
    v_distance,
    v_hs_charge
  ) returning id into new_booking_id;

  insert into public.booking_services (
    booking_id, salon_id, service_id, service_name_snapshot,
    price_paise, duration_minutes, quantity
  )
  select new_booking_id, p_salon_id, s.id, s.name,
         s.price_paise, s.duration_minutes, 1
  from public.services s
  where s.id = any(p_service_ids);

  update public.booking_request_keys
  set booking_id = new_booking_id
  where id = existing_key.id;

  return query select
    new_booking_id,
    calculated_advance,
    'INR'::text,
    calculated_end,
    total_amount,
    calculated_advance,
    calculated_remaining,
    v_mode,
    case when v_mode = 'home_service' then v_address else null end,
    v_distance,
    v_hs_charge;
end;
$$;

revoke all on function public.create_authoritative_customer_booking_v2(
  uuid, uuid, uuid[], uuid, timestamptz, text, text, text, text, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.create_authoritative_customer_booking_v2(
  uuid, uuid, uuid[], uuid, timestamptz, text, text, text, text, numeric, numeric
) to service_role;

comment on function public.create_authoritative_customer_booking_v2(
  uuid, uuid, uuid[], uuid, timestamptz, text, text, text, text, numeric, numeric
) is
  'M65: authoritative booking creation with radius-checked Home Service. Distance and charge are recomputed server-side; client-supplied pricing is never trusted.';

-- ---------------------------------------------------------------------------
-- 5. Read RPCs — recreated with the fulfillment columns appended. Return-type
--    changes require drop+recreate; grants are re-asserted verbatim.
-- ---------------------------------------------------------------------------
drop function if exists public.get_customer_bookings_for_actor(uuid);
drop function if exists public.get_customer_bookings(uuid);

create or replace function public.get_customer_bookings(p_user_id uuid default null)
returns table (
  booking_id uuid,
  salon_id uuid,
  business_name text,
  business_slug text,
  service_names text[],
  appointment_start timestamptz,
  appointment_end timestamptz,
  total_amount_paise bigint,
  advance_amount_paise bigint,
  remaining_amount_paise bigint,
  status text,
  payment_status text,
  currency text,
  created_at timestamptz,
  fulfillment_mode text,
  service_address text,
  service_distance_km numeric,
  home_service_charge_paise bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id as booking_id,
    b.salon_id,
    s.name as business_name,
    coalesce(w.slug, s.slug, '') as business_slug,
    coalesce(
      (select array_agg(bs.service_name_snapshot order by bs.id)
       from public.booking_services bs where bs.booking_id = b.id),
      array[]::text[]
    ) as service_names,
    b.appointment_start,
    b.appointment_end,
    b.total_amount_paise,
    b.advance_amount_paise,
    greatest(0::bigint, b.total_amount_paise - b.advance_amount_paise) as remaining_amount_paise,
    b.status,
    b.payment_status,
    b.currency,
    b.created_at,
    b.fulfillment_mode,
    b.service_address,
    b.service_distance_km,
    b.home_service_charge_paise
  from public.bookings b
  join public.salons s on s.id = b.salon_id
  left join public.salon_public_websites w on w.salon_id = s.id
  where b.customer_id = coalesce(p_user_id, auth.uid())
    and (auth.uid() = b.customer_id or auth.role() = 'service_role')
  order by b.appointment_start desc, b.created_at desc;
$$;

revoke all on function public.get_customer_bookings(uuid) from public, anon;
grant execute on function public.get_customer_bookings(uuid) to authenticated, service_role;

create or replace function public.get_customer_bookings_for_actor(
  p_actor_user_id uuid
)
returns table (
  booking_id uuid,
  salon_id uuid,
  business_name text,
  business_slug text,
  service_names text[],
  appointment_start timestamptz,
  appointment_end timestamptz,
  total_amount_paise bigint,
  advance_amount_paise bigint,
  remaining_amount_paise bigint,
  status text,
  payment_status text,
  currency text,
  created_at timestamptz,
  fulfillment_mode text,
  service_address text,
  service_distance_km numeric,
  home_service_charge_paise bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'An authenticated customer actor is required' using errcode = '42501';
  end if;
  return query select * from public.get_customer_bookings(p_actor_user_id);
end;
$$;

revoke all on function public.get_customer_bookings_for_actor(uuid)
  from public, anon, authenticated;
grant execute on function public.get_customer_bookings_for_actor(uuid)
  to service_role;

drop function if exists public.get_owner_salon_bookings_for_actor(uuid, uuid);

create or replace function public.get_owner_salon_bookings_for_actor(
  p_actor_user_id uuid,
  p_salon_id uuid default null
)
returns table (
  booking_id uuid,
  salon_id uuid,
  business_name text,
  theme_key text,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  service_names text[],
  service_lines jsonb,
  staff_id uuid,
  staff_name text,
  appointment_start timestamptz,
  appointment_end timestamptz,
  total_amount_paise bigint,
  advance_amount_paise bigint,
  remaining_amount_paise bigint,
  status text,
  payment_status text,
  currency text,
  created_at timestamptz,
  fulfillment_mode text,
  service_address text,
  service_distance_km numeric,
  home_service_charge_paise bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_salon_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;

  v_salon_id := private.nexora_single_actor_salon_id(p_actor_user_id, p_salon_id);

  return query
  select
    b.id,
    b.salon_id,
    s.name,
    t.theme_id,
    b.customer_id,
    p.full_name,
    p.email,
    p.phone,
    coalesce(lines.service_names, array[]::text[]),
    coalesce(lines.service_lines, '[]'::jsonb),
    b.staff_id,
    st.name,
    b.appointment_start,
    b.appointment_end,
    b.total_amount_paise,
    b.advance_amount_paise,
    greatest(0::bigint, b.total_amount_paise - b.advance_amount_paise),
    b.status,
    b.payment_status,
    b.currency,
    b.created_at,
    b.fulfillment_mode,
    b.service_address,
    b.service_distance_km,
    b.home_service_charge_paise
  from public.bookings b
  join public.salons s on s.id = b.salon_id
  left join public.themes t on t.id = s.theme_id
  left join public.profiles p on p.id = b.customer_id
  left join public.staff st on st.id = b.staff_id and st.salon_id = b.salon_id
  left join lateral (
    select
      array_agg(bs.service_name_snapshot order by bs.id) as service_names,
      jsonb_agg(
        jsonb_build_object(
          'serviceId', bs.service_id,
          'serviceName', bs.service_name_snapshot,
          'pricePaise', bs.price_paise,
          'durationMinutes', bs.duration_minutes,
          'quantity', bs.quantity
        ) order by bs.id
      ) as service_lines
    from public.booking_services bs
    where bs.booking_id = b.id
  ) lines on true
  where b.salon_id = v_salon_id
  order by b.appointment_start asc, b.created_at desc;
end;
$$;

revoke all on function public.get_owner_salon_bookings_for_actor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_owner_salon_bookings_for_actor(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Read-only verifier.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m65_home_service_bookings()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select 'bookings.fulfillment_mode column'::text,
         exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'bookings'
             and column_name = 'fulfillment_mode'
         ),
         'additive fulfillment column present'::text
  union all
  select 'bookings home-service snapshot columns',
         (
           select count(*) = 5 from information_schema.columns
           where table_schema = 'public' and table_name = 'bookings'
             and column_name in (
               'service_address', 'service_latitude', 'service_longitude',
               'service_distance_km', 'home_service_charge_paise'
             )
         ),
         'address/coordinates/distance/charge columns present'
  union all
  select 'home-service consistency constraints',
         (
           select count(*) = 4 from pg_constraint
           where conrelid = 'public.bookings'::regclass
             and conname in (
               'm65_bookings_fulfillment_mode_check',
               'm65_bookings_home_charge_nonnegative',
               'm65_bookings_at_salon_zero_charge',
               'm65_bookings_home_service_snapshot'
             )
         ),
         'all four M65 check constraints validated'
  union all
  select 'haversine helper',
         to_regprocedure('private.nexora_haversine_km(numeric,numeric,numeric,numeric)') is not null,
         'pure-SQL distance helper installed (no PostGIS)'
  union all
  select 'settings reader',
         to_regprocedure('private.nexora_home_service_settings(uuid)') is not null,
         'published Home Service settings resolved server-side'
  union all
  select 'v2 creation function',
         to_regprocedure('public.create_authoritative_customer_booking_v2(uuid,uuid,uuid[],uuid,timestamptz,text,text,text,text,numeric,numeric)') is not null,
         'authoritative fulfillment-aware creation path installed'
  union all
  select 'v1 creation function untouched',
         to_regprocedure('public.create_authoritative_customer_booking(uuid,uuid,uuid[],uuid,timestamptz,text,text)') is not null,
         'M47/M55 seven-argument function preserved for At-Salon regression'
  union all
  select 'v2 is service-role only',
         not exists (
           select 1
           from information_schema.routine_privileges rp
           where rp.routine_schema = 'public'
             and rp.routine_name = 'create_authoritative_customer_booking_v2'
             and rp.grantee in ('anon', 'authenticated', 'PUBLIC')
             and rp.privilege_type = 'EXECUTE'
         ),
         'no anon/authenticated execute grant on the v2 write path'
  union all
  select 'customer read RPC exposes fulfillment',
         exists (
           select 1 from information_schema.columns c
           where true
         ) and (
           select count(*) > 0 from pg_proc pr
           join pg_namespace ns on ns.oid = pr.pronamespace
           where ns.nspname = 'public' and pr.proname = 'get_customer_bookings_for_actor'
             and pg_get_function_result(pr.oid) like '%home_service_charge_paise%'
         ),
         'get_customer_bookings_for_actor returns the M65 columns'
  union all
  select 'owner read RPC exposes fulfillment',
         (
           select count(*) > 0 from pg_proc pr
           join pg_namespace ns on ns.oid = pr.pronamespace
           where ns.nspname = 'public' and pr.proname = 'get_owner_salon_bookings_for_actor'
             and pg_get_function_result(pr.oid) like '%home_service_charge_paise%'
         ),
         'get_owner_salon_bookings_for_actor returns the M65 columns';
end;
$$;

revoke all on function public.verify_m65_home_service_bookings() from public, anon, authenticated;
grant execute on function public.verify_m65_home_service_bookings() to service_role;

commit;
