-- M31 / Phase 1A: server-authoritative customer booking creation.
-- Customers cannot write their own amount/duration/service snapshots. The
-- service-role RPC locks active service rows, computes the quote, prevents an
-- obvious overlap, and persists booking + line snapshots atomically.

begin;

create table if not exists public.booking_request_keys (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint booking_request_keys_key_format check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  unique (customer_id, idempotency_key)
);

alter table public.booking_request_keys enable row level security;
revoke all on public.booking_request_keys from public, anon, authenticated;
grant all on public.booking_request_keys to service_role;

create index if not exists idx_phase1a_booking_request_keys_created
  on public.booking_request_keys (created_at desc);

-- Fail closed when a customer tries to bypass the server and supply their own
-- booking financial state. Salon managers retain their existing RLS-governed
-- back-office insert capability; service_role is not subject to this guard.
create or replace function public.phase1a_guard_customer_booking_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or auth.role() = 'service_role' then return new; end if;
  if private.can_manage_salon_settings(new.salon_id) then return new; end if;

  if tg_op = 'INSERT' and new.customer_id = actor then
    raise exception 'Customer bookings must be created by the authoritative booking API'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.customer_id = actor then
    if not (
      old.status in ('pending', 'confirmed')
      and new.status = 'cancelled'
      and (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
          = (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at'])
    ) then
      raise exception 'Customers may only cancel their own pending or confirmed booking'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.phase1a_guard_customer_booking_authority()
  from public, anon, authenticated;

-- Replace any earlier same-named trigger deterministically.
drop trigger if exists trg_phase1a_guard_customer_booking_authority on public.bookings;
create trigger trg_phase1a_guard_customer_booking_authority
before insert or update on public.bookings
for each row execute function public.phase1a_guard_customer_booking_authority();

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
  appointment_end timestamptz
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
      select b.id, b.total_amount_paise, b.currency, b.appointment_end
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
    'pending', 'pending', total_amount, total_amount,
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

  return query select new_booking_id, total_amount, 'INR'::text, calculated_end;
end
$$;

revoke all on function public.create_authoritative_customer_booking(
  uuid, uuid, uuid[], uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.create_authoritative_customer_booking(
  uuid, uuid, uuid[], uuid, timestamptz, text, text
) to service_role;

commit;
