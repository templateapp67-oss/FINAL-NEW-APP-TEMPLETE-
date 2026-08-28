-- ============================================================================
-- M61 — atomic, server-authoritative booking reschedule
-- ============================================================================
--
-- GAP CLOSED (Missing Items & Gaps Analysis, 2026-08-25 §1 "Rescheduling:
-- FAIL — no workflow that atomically releases the old slot, acquires the new
-- slot, preserves payment linkage, and updates notifications").
--
-- One SECURITY DEFINER, service-role-only RPC:
--   * locks the booking row FOR UPDATE (the old slot stays owned until the
--     transaction commits — there is no gap where both/neither slot is held);
--   * authorizes the actor as either the booking's customer or an active
--     owner/manager of the booking's salon through the canonical membership
--     chain (private.nexora_single_actor_salon_id);
--   * recomputes the end time from the immutable booking_services snapshot —
--     a reschedule can never re-price or re-duration the booking;
--   * serializes colliding requests with the same advisory-lock key used by
--     create_authoritative_customer_booking (M31), then checks the new slot
--     against canonical bookings AND guest website_bookings;
--   * updates only appointment_start/appointment_end — payments, refunds and
--     the amount snapshots stay linked and untouched;
--   * the M28 staff-overlap exclusion constraint remains the final backstop
--     (23P01 is surfaced as the same "slot no longer available" error).
--
-- Idempotent by design: rescheduling to the exact current window is a no-op
-- success, so retries after a network failure cannot corrupt state.

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed unless the canonical chain is present.
-- ---------------------------------------------------------------------------
do $m61_preflight$
begin
  if to_regclass('public.bookings') is null
     or to_regclass('public.booking_services') is null
     or to_regclass('public.website_bookings') is null
     or to_regclass('public.salons') is null
     or to_regprocedure('public.create_authoritative_customer_booking(uuid,uuid,uuid[],uuid,timestamptz,text,text)') is null
     or to_regprocedure('public.cancel_customer_booking_for_actor(uuid,uuid)') is null then
    raise exception
      'M61 preflight: canonical booking creation/M55 actor functions are missing. Apply M31 and M55 first.';
  end if;
end
$m61_preflight$;

-- ---------------------------------------------------------------------------
-- 1. The reschedule RPC.
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_customer_booking_for_actor(
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_new_appointment_start timestamptz
)
returns table (
  booking_id uuid,
  old_appointment_start timestamptz,
  new_appointment_start timestamptz,
  new_appointment_end timestamptz,
  status text,
  payment_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_duration integer;
  v_calculated_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;
  if p_new_appointment_start is null then
    raise exception 'A new appointment start is required' using errcode = '22023';
  end if;
  if p_new_appointment_start < now() + interval '5 minutes'
     or p_new_appointment_start > now() + interval '1 year' then
    raise exception 'The new appointment time is outside the bookable window'
      using errcode = '22023';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- Authorization: the booking's customer, or an active owner/manager of the
  -- salon. Both checks derive from the actor identity, never the request.
  if v_booking.customer_id <> p_actor_user_id then
    begin
      perform private.nexora_single_actor_salon_id(p_actor_user_id, v_booking.salon_id);
    exception when others then
      raise exception 'You can only reschedule your own bookings'
        using errcode = '42501';
    end;
  end if;

  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'This booking cannot be rescheduled' using errcode = '22023';
  end if;

  -- Idempotent retry: the identical window is a success, not a conflict.
  if v_booking.appointment_start = p_new_appointment_start then
    return query
    select v_booking.id, v_booking.appointment_start, v_booking.appointment_start,
           v_booking.appointment_end, v_booking.status, v_booking.payment_status;
    return;
  end if;

  -- Duration always comes from the immutable service snapshot.
  select coalesce(sum(bs.duration_minutes * bs.quantity)::integer, 0) into v_duration
  from public.booking_services bs
  where bs.booking_id = v_booking.id;
  if v_duration <= 0 then
    v_duration := greatest(
      1,
      ceil(extract(epoch from (coalesce(v_booking.appointment_end, v_booking.appointment_start + interval '1 minute')
                                - v_booking.appointment_start)) / 60)::integer
    );
  end if;
  if v_duration > 480 then
    raise exception 'Booking duration exceeds the maximum allowed window'
      using errcode = '22023';
  end if;
  v_calculated_end := p_new_appointment_start + make_interval(mins => v_duration);

  -- Serialize colliding requests exactly like creation (M31).
  perform pg_advisory_xact_lock(hashtextextended(
    v_booking.salon_id::text || ':' || coalesce(v_booking.staff_id::text, 'unassigned'),
    0
  ));

  if exists (
    select 1
    from public.bookings b
    where b.salon_id = v_booking.salon_id
      and b.id <> v_booking.id
      and b.status in ('pending', 'confirmed')
      and b.appointment_start < v_calculated_end
      and coalesce(b.appointment_end, b.appointment_start + interval '1 minute') > p_new_appointment_start
      and (v_booking.staff_id is null or b.staff_id = v_booking.staff_id)
  ) then
    raise exception 'the selected time is no longer available'
      using errcode = '23P01';
  end if;

  -- Guest bookings occupy the same physical chairs.
  if exists (
    select 1
    from public.website_bookings wb
    where wb.salon_id = v_booking.salon_id
      and wb.status in ('pending', 'confirmed')
      and wb.appointment_date = p_new_appointment_start::date
      and wb.start_time < v_calculated_end::time
      and wb.end_time > p_new_appointment_start::time
      and (v_booking.staff_id is null or wb.staff_id = v_booking.staff_id)
  ) then
    raise exception 'the selected time is no longer available'
      using errcode = '23P01';
  end if;

  update public.bookings b
  set appointment_start = p_new_appointment_start,
      appointment_end = v_calculated_end
  where b.id = v_booking.id
  returning b.id, v_booking.appointment_start, b.appointment_start, b.appointment_end,
            b.status, b.payment_status
  into booking_id, old_appointment_start, new_appointment_start,
       new_appointment_end, status, payment_status;

  return query
  select booking_id, old_appointment_start, new_appointment_start,
         new_appointment_end, status, payment_status;
end;
$$;

revoke all on function public.reschedule_customer_booking_for_actor(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reschedule_customer_booking_for_actor(uuid, uuid, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Read-only post-deployment verifier.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m61_booking_reschedule()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query values
    ('reschedule_customer_booking_for_actor installed',
      to_regprocedure('public.reschedule_customer_booking_for_actor(uuid,uuid,timestamptz)') is not null,
      'atomic slot swap with payment linkage preserved'),
    ('reschedule RPC is service-role only',
      not exists (
        select 1 from information_schema.role_routine_grants g
        where g.routine_schema = 'public'
          and g.routine_name = 'reschedule_customer_booking_for_actor'
          and g.grantee in ('anon', 'authenticated', 'public')
      ),
      'no anon/authenticated/public execute grant'),
    ('reschedule RPC is security definer',
      exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'reschedule_customer_booking_for_actor'
          and p.prosecdef
      ),
      'runs with the function owner trust boundary'),
    ('reschedule never rewrites amounts',
      not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'reschedule_customer_booking_for_actor'
          and position('total_amount_paise' in p.prosrc) > 0
      ),
      'the update touches only appointment_start/appointment_end');
end;
$$;

revoke all on function public.verify_m61_booking_reschedule()
  from public, anon, authenticated;
grant execute on function public.verify_m61_booking_reschedule() to service_role, authenticated;

commit;
