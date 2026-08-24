-- ===========================================================================
-- Nexora Phase 3 — Customer Signup, Login, Booking & 25% Advance Calculation
-- ===========================================================================
-- Authoritative server-calculated 25% advance, customer bookings, owner
-- bookings, RLS isolation and status transition enforcement.

begin;

-- Re-assert canonical table structures
alter table public.bookings
  add column if not exists total_amount_paise bigint not null default 0,
  add column if not exists advance_amount_paise bigint not null default 0,
  add column if not exists currency text not null default 'INR',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Authoritative Booking Creation with exact 25% advance calculation
-- ---------------------------------------------------------------------------
drop function if exists public.create_authoritative_customer_booking(
  uuid, uuid, uuid[], uuid, timestamptz, text, text
);

create or replace function public.create_authoritative_customer_booking(
  p_customer_id uuid,
  p_salon_id uuid,
  p_service_ids uuid[],
  p_staff_id uuid,
  p_appointment_start timestamptz,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table (
  booking_id uuid,
  amount_paise bigint,
  currency text,
  appointment_end timestamptz,
  total_amount_paise bigint,
  advance_amount_paise bigint,
  remaining_amount_paise bigint
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
  if not exists (
    select 1 from public.salons s
    where s.id = p_salon_id and s.is_active = true and s.deleted_at is null
  ) then
    raise exception 'salon is not bookable' using errcode = 'P0002';
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
    return query
      select b.id, b.advance_amount_paise, b.currency, b.appointment_end,
             b.total_amount_paise, b.advance_amount_paise,
             greatest(0::bigint, b.total_amount_paise - b.advance_amount_paise)
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

  -- Authoritative 25% advance calculation: (total * 25) / 100
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
    currency, expires_at
  ) values (
    p_salon_id, p_customer_id, p_staff_id, p_appointment_start, calculated_end,
    'pending', 'pending', total_amount, calculated_advance,
    'INR', now() + interval '15 minutes'
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
    calculated_remaining;
end;
$$;

revoke all on function public.create_authoritative_customer_booking(
  uuid, uuid, uuid[], uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.create_authoritative_customer_booking(
  uuid, uuid, uuid[], uuid, timestamptz, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Customer My Bookings RPC
-- ---------------------------------------------------------------------------
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
  created_at timestamptz
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
    b.created_at
  from public.bookings b
  join public.salons s on s.id = b.salon_id
  left join public.salon_public_websites w on w.salon_id = s.id
  where b.customer_id = coalesce(p_user_id, auth.uid())
    and (auth.uid() = b.customer_id or auth.role() = 'service_role')
  order by b.appointment_start desc, b.created_at desc;
$$;

revoke all on function public.get_customer_bookings(uuid) from public, anon;
grant execute on function public.get_customer_bookings(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner Salon Bookings RPC
-- ---------------------------------------------------------------------------
create or replace function public.get_owner_salon_bookings(p_salon_id uuid default null)
returns table (
  booking_id uuid,
  salon_id uuid,
  business_name text,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
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
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id as booking_id,
    b.salon_id,
    s.name as business_name,
    b.customer_id,
    coalesce(p.full_name, 'Customer') as customer_name,
    p.email as customer_email,
    p.phone as customer_phone,
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
    b.created_at
  from public.bookings b
  join public.salons s on s.id = b.salon_id
  left join public.profiles p on p.id = b.customer_id
  where (p_salon_id is null or b.salon_id = p_salon_id)
    and (
      auth.role() = 'service_role'
      or b.salon_id in (select public.owner_salon_ids())
      or private.has_salon_role(b.salon_id, array['owner', 'staff'])
    )
  order by b.appointment_start asc, b.created_at desc;
$$;

revoke all on function public.get_owner_salon_bookings(uuid) from public, anon;
grant execute on function public.get_owner_salon_bookings(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Customer Booking Cancellation RPC
-- ---------------------------------------------------------------------------
create or replace function public.cancel_customer_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.customer_id <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'You can only cancel your own bookings' using errcode = '42501';
  end if;

  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'This booking cannot be cancelled' using errcode = '22023';
  end if;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      payment_status = case
        when payment_status = 'pending' then 'cancelled'
        else payment_status
      end,
      updated_at = now()
  where id = p_booking_id;

  return true;
end;
$$;

revoke all on function public.cancel_customer_booking(uuid) from public, anon;
grant execute on function public.cancel_customer_booking(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner Status Update RPC
-- ---------------------------------------------------------------------------
create or replace function public.update_owner_booking_status(p_booking_id uuid, p_next_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_status text := lower(btrim(p_next_status));
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not (
    auth.role() = 'service_role'
    or v_booking.salon_id in (select public.owner_salon_ids())
    or private.has_salon_role(v_booking.salon_id, array['owner'])
  ) then
    raise exception 'Permission denied for this salon booking' using errcode = '42501';
  end if;

  if v_status not in ('confirmed', 'completed', 'cancelled') then
    raise exception 'Invalid target status' using errcode = '22023';
  end if;

  if v_status = 'confirmed' and v_booking.payment_status = 'pending' then
    raise exception 'Payment has not been completed for this booking' using errcode = '22023';
  end if;

  update public.bookings
  set status = v_status,
      payment_status = case
        when v_status = 'completed' then 'paid'
        when v_status = 'cancelled' and payment_status = 'pending' then 'cancelled'
        else payment_status
      end,
      completed_at = case when v_status = 'completed' then now() else completed_at end,
      cancelled_at = case when v_status = 'cancelled' then now() else cancelled_at end,
      updated_at = now()
  where id = p_booking_id;

  return true;
end;
$$;

revoke all on function public.update_owner_booking_status(uuid, text) from public, anon;
grant execute on function public.update_owner_booking_status(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification Helper
-- ---------------------------------------------------------------------------
create or replace function public.verify_phase3_customer_booking()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  check_name := 'create_authoritative_customer_booking exists';
  ok := to_regprocedure('public.create_authoritative_customer_booking(uuid,uuid,uuid[],uuid,timestamptz,text,text)') is not null;
  detail := 'calculates 25% advance and creates server-authoritative booking'; return next;

  check_name := 'get_customer_bookings RPC exists and is protected';
  ok := to_regprocedure('public.get_customer_bookings(uuid)') is not null
    and pg_catalog.has_function_privilege('authenticated', 'public.get_customer_bookings(uuid)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon', 'public.get_customer_bookings(uuid)', 'EXECUTE');
  detail := 'authenticated customer only'; return next;

  check_name := 'get_owner_salon_bookings RPC exists and is protected';
  ok := to_regprocedure('public.get_owner_salon_bookings(uuid)') is not null
    and pg_catalog.has_function_privilege('authenticated', 'public.get_owner_salon_bookings(uuid)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon', 'public.get_owner_salon_bookings(uuid)', 'EXECUTE');
  detail := 'authenticated owner only'; return next;

  check_name := 'anon has no direct access to bookings table';
  ok := not pg_catalog.has_table_privilege('anon', 'public.bookings', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.bookings', 'INSERT');
  detail := 'anon denied'; return next;

  check_name := 'bookings RLS is enabled';
  ok := coalesce((select relrowsecurity from pg_class where oid = 'public.bookings'::regclass), false);
  detail := 'relrowsecurity is true'; return next;
end;
$$;

revoke all on function public.verify_phase3_customer_booking() from public, anon, authenticated;
grant execute on function public.verify_phase3_customer_booking() to service_role;

commit;
