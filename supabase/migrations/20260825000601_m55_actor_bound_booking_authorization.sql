-- ============================================================================
-- M55 — actor-bound privileged booking authorization
-- ============================================================================
--
-- ROOT CAUSE
-- ----------
-- The HTTP API validates a Supabase Bearer token and then uses the service-role
-- client for canonical/legacy owner booking RPCs. The M41/M47 RPCs treated
-- auth.role() = 'service_role' as sufficient authorization, while accepting a
-- salon or booking id from the request. Consequently the authenticated user
-- identity established by the API was lost at the privileged DB boundary.
--
-- FIX
-- ---
-- Add service-role-only entry points which REQUIRE the API to carry the
-- authenticated actor UUID into the transaction and re-check the canonical
-- organization_members -> salons relationship before returning PII or changing
-- state. The historical RPC signatures remain for backwards-compatible direct
-- authenticated clients and migration verifiers; production HTTP handlers use
-- only the actor-bound functions below.
--
-- The service-role secret remains server-only. No user, salon, organization or
-- booking id is hardcoded, RLS is not disabled, and no existing row is changed.

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed if the canonical chain or preceding booking functions are
--    absent. This migration is an upgrade, never a parallel schema bootstrap.
-- ---------------------------------------------------------------------------
do $m55_preflight$
begin
  if to_regclass('public.organization_members') is null
     or to_regclass('public.salons') is null
     or to_regclass('public.bookings') is null
     or to_regclass('public.booking_services') is null
     or to_regclass('public.website_bookings') is null
     or to_regprocedure('public.get_owner_salon_bookings(uuid)') is null
     or to_regprocedure('public.update_owner_booking_status(uuid,text)') is null
     or to_regprocedure('public.get_customer_bookings(uuid)') is null
     or to_regprocedure('public.cancel_customer_booking(uuid)') is null
     or to_regprocedure('public.get_website_bookings(uuid)') is null then
    raise exception
      'M55 preflight: canonical booking/workspace functions are missing. Apply M41, M47 and M54 first.';
  end if;
end
$m55_preflight$;

-- ---------------------------------------------------------------------------
-- 1. Private canonical authorization predicate.
-- ---------------------------------------------------------------------------
create or replace function private.nexora_actor_owns_salon(
  p_actor_user_id uuid,
  p_salon_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_user_id is not null
     and p_salon_id is not null
     and exists (
       select 1
       from public.salons s
       join public.organization_members om
         on om.organization_id = s.organization_id
       where s.id = p_salon_id
         and s.is_active = true
         and s.deleted_at is null
         and om.user_id = p_actor_user_id
         and om.role = 'owner'
         and om.is_active = true
     );
$$;

revoke all on function private.nexora_actor_owns_salon(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.nexora_single_actor_salon_id(
  p_actor_user_id uuid,
  p_requested_salon_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_actor_user_id is null then
    raise exception 'An authenticated actor is required' using errcode = '28000';
  end if;

  if p_requested_salon_id is not null then
    if not private.nexora_actor_owns_salon(p_actor_user_id, p_requested_salon_id) then
      raise exception 'Permission denied for this salon' using errcode = '42501';
    end if;
    return p_requested_salon_id;
  end if;

  select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_ids
  from public.salons s
  join public.organization_members om
    on om.organization_id = s.organization_id
  where om.user_id = p_actor_user_id
    and om.role = 'owner'
    and om.is_active = true
    and s.is_active = true
    and s.deleted_at is null;

  if cardinality(v_ids) = 0 then
    raise exception 'No owner salon is linked to this account' using errcode = '42501';
  end if;
  if cardinality(v_ids) > 1 then
    raise exception 'Multiple salons are linked to this account; a salon must be selected'
      using errcode = 'P0003';
  end if;
  return v_ids[1];
end;
$$;

revoke all on function private.nexora_single_actor_salon_id(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Canonical owner list, actor-bound at the privileged boundary.
--    Extra service/staff fields let the configured owner dashboard consume the
--    same canonical rows without inventing local PaymentRecord facts.
-- ---------------------------------------------------------------------------
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
  created_at timestamptz
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
    b.created_at
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
-- 3. Canonical owner mutation, actor-bound and transition-checked before the
--    historical service-role implementation performs its atomic update.
-- ---------------------------------------------------------------------------
create or replace function public.update_owner_booking_status_for_actor(
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_next_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_next text := lower(btrim(coalesce(p_next_status, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if not private.nexora_actor_owns_salon(p_actor_user_id, v_booking.salon_id) then
    raise exception 'Permission denied for this salon booking' using errcode = '42501';
  end if;
  if v_next = v_booking.status then
    raise exception 'Booking already has this status' using errcode = '22023';
  end if;
  if not (
    (v_booking.status = 'pending' and v_next in ('confirmed', 'cancelled'))
    or (v_booking.status = 'confirmed' and v_next in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid booking status transition' using errcode = '22023';
  end if;

  return public.update_owner_booking_status(p_booking_id, v_next);
end;
$$;

revoke all on function public.update_owner_booking_status_for_actor(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_owner_booking_status_for_actor(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Customer list/cancel wrappers. These remove the API's check-then-mutate
--    gap by carrying the authenticated customer into the DB transaction.
-- ---------------------------------------------------------------------------
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
  created_at timestamptz
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

create or replace function public.cancel_customer_booking_for_actor(
  p_actor_user_id uuid,
  p_booking_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'An authenticated customer actor is required' using errcode = '42501';
  end if;

  select b.customer_id, b.status into v_customer_id, v_status
  from public.bookings b where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if v_customer_id <> p_actor_user_id then
    raise exception 'You can only cancel your own bookings' using errcode = '42501';
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'This booking cannot be cancelled' using errcode = '22023';
  end if;

  return public.cancel_customer_booking(p_booking_id);
end;
$$;

revoke all on function public.cancel_customer_booking_for_actor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_customer_booking_for_actor(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Legacy M41 owner read. The guest creation surface stays public-by-design,
--    but its PII list is now bound to the authenticated owner.
-- ---------------------------------------------------------------------------
create or replace function public.get_website_bookings_for_actor(
  p_actor_user_id uuid,
  p_salon_id uuid
)
returns table (
  booking_id uuid,
  booking_reference text,
  customer_name text,
  customer_phone text,
  customer_email text,
  service_name text,
  price_paise bigint,
  duration_minutes integer,
  staff_id uuid,
  appointment_date date,
  start_time time,
  end_time time,
  note text,
  status text,
  source text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;
  perform private.nexora_single_actor_salon_id(p_actor_user_id, p_salon_id);
  return query select * from public.get_website_bookings(p_salon_id);
end;
$$;

revoke all on function public.get_website_bookings_for_actor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_website_bookings_for_actor(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Read-only post-deployment verifier.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m55_actor_bound_booking_authorization()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'canonical owner list is actor-bound';
  ok := to_regprocedure('public.get_owner_salon_bookings_for_actor(uuid,uuid)') is not null;
  detail := 'trusted server must provide authenticated actor and optional salon';
  return next;

  check_name := 'canonical owner mutation is actor-bound';
  ok := to_regprocedure('public.update_owner_booking_status_for_actor(uuid,uuid,text)') is not null;
  detail := 'booking salon ownership and transition are checked in one transaction';
  return next;

  check_name := 'customer cancellation is actor-bound';
  ok := to_regprocedure('public.cancel_customer_booking_for_actor(uuid,uuid)') is not null;
  detail := 'customer ownership is checked in the mutation transaction';
  return next;

  check_name := 'legacy website PII list is actor-bound';
  ok := to_regprocedure('public.get_website_bookings_for_actor(uuid,uuid)') is not null;
  detail := 'M41 owner list requires canonical salon ownership';
  return next;

  check_name := 'actor-bound functions are not client executable';
  ok := not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.routine_schema = 'public'
      and rp.routine_name in (
        'get_owner_salon_bookings_for_actor',
        'update_owner_booking_status_for_actor',
        'get_customer_bookings_for_actor',
        'cancel_customer_booking_for_actor',
        'get_website_bookings_for_actor'
      )
      and rp.grantee in ('PUBLIC', 'anon', 'authenticated')
      and rp.privilege_type = 'EXECUTE'
  );
  detail := 'only service_role may execute the actor-bound server functions';
  return next;

  check_name := 'RLS remains enabled on booking authorities';
  select bool_and(c.relrowsecurity) into ok
  from pg_catalog.pg_class c
  where c.oid in ('public.bookings'::regclass, 'public.website_bookings'::regclass);
  detail := 'no RLS bypass policy or disablement was introduced';
  return next;
end;
$$;

revoke all on function public.verify_m55_actor_bound_booking_authorization()
  from public, anon, authenticated;
grant execute on function public.verify_m55_actor_bound_booking_authorization()
  to service_role;

commit;
