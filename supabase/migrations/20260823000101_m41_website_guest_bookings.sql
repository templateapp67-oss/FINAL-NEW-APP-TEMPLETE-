-- M41 / Website guest bookings
-- ============================================================================
-- Public-salon website booking pipeline for GUEST customers (no Supabase
-- account required). The legacy public templates (e.g. /royal-hair-studio,
-- templateId 'hair') expose Book Slot / Book Bundle / Book with Stylist /
-- Book Appointment buttons that collect Name + Phone + Date + Time Slot and
-- POST to the server API, which persists the request through the
-- service-role RPC `create_website_booking` below.
--
-- Design decisions (per the M38 "never invent business facts" guardrails):
--   * A NEW, fully specified table `public.website_bookings` is introduced.
--     Its shape is owned entirely by this file. The canonical
--     `public.bookings` table (whose customer identity is auth-linked) is
--     only READ for cross-system slot conflict detection, never written.
--   * The optional `staff` table shape is under-specified in-repo (only
--     id / salon_id / is_active are known from M28/M37 preflights), so the
--     RPC validates a stylist through those known columns ONLY and never
--     references unknown staff columns.
--   * All writes go through ONE security-definer RPC that only service_role
--     can invoke. RLS on the table is enabled with NO client policies
--     (deny-by-default for anon/authenticated), matching M31 convention.
--   * Prices/durations are snapshotted server-side from the live `services`
--     row — a guest can never supply its own financial state.
--   * booking_reference format is 'NX-' + 6 digits, matching the platform
--     bookingIdPrefix ('NX', see brandConfig.ts).
--
-- Idempotent, single transaction, safe to re-run.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Table: public.website_bookings
-- ---------------------------------------------------------------------------
create table if not exists public.website_bookings (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid not null references public.salons(id) on delete restrict,
  customer_name         text not null,
  customer_phone        text not null,
  customer_email        text,
  service_id            uuid references public.services(id) on delete set null,
  service_name_snapshot text not null,
  price_paise           bigint not null default 0,
  duration_minutes      integer,
  staff_id              uuid,
  appointment_date      date not null,
  start_time            time not null,
  end_time              time,
  note                  text,
  booking_reference     text not null,
  status                text not null default 'pending',
  source                text not null default 'website',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint website_bookings_name_not_blank check (btrim(customer_name) <> ''),
  constraint website_bookings_phone_format check (
    regexp_replace(customer_phone, '[^0-9]', '', 'g') ~ '^[0-9]{10,15}$'
  ),
  constraint website_bookings_service_name_not_blank check (btrim(service_name_snapshot) <> ''),
  constraint website_bookings_reference_format check (booking_reference ~ '^NX-[0-9]{6}$'),
  constraint website_bookings_reference_unique unique (booking_reference),
  constraint website_bookings_status_check check (
    status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')
  ),
  constraint website_bookings_source_check check (
    source in ('website', 'phone', 'whatsapp', 'walk_in')
  ),
  constraint website_bookings_price_nonnegative check (price_paise >= 0),
  constraint website_bookings_duration_positive check (duration_minutes is null or duration_minutes > 0),
  constraint website_bookings_time_order check (end_time is null or end_time > start_time),
  constraint website_bookings_date_not_past check (appointment_date >= current_date)
);

create index if not exists website_bookings_salon_date_idx
  on public.website_bookings (salon_id, appointment_date, status);
create index if not exists website_bookings_salon_phone_idx
  on public.website_bookings (salon_id, customer_phone);

comment on table public.website_bookings is
  'Guest website bookings for the public salon sites (no auth account required). Owner-managed via the dashboard API.';

-- ---------------------------------------------------------------------------
-- 2. RLS: deny-by-default. Only service_role (the server API) may write.
-- ---------------------------------------------------------------------------
alter table public.website_bookings enable row level security;
alter table public.website_bookings force row level security;

drop policy if exists "m41_no_client_policies" on public.website_bookings;
-- No policies are created on purpose: with RLS enabled and zero policies,
-- anon/authenticated have no access at all (deny-by-default).
revoke all on public.website_bookings from public, anon, authenticated;
grant all on public.website_bookings to service_role;

-- updated_at trigger (guarded: M40 owns set_updated_at on the live schema).
do $m41_updated_at$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    drop trigger if exists trg_website_bookings_updated_at on public.website_bookings;
    create trigger trg_website_bookings_updated_at
      before update on public.website_bookings
      for each row execute function public.set_updated_at();
  end if;
end
$m41_updated_at$;

-- ---------------------------------------------------------------------------
-- 3. create_website_booking — the ONLY guest write path (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.create_website_booking(
  p_salon_slug        text,
  p_service_id        uuid,
  p_staff_id          uuid,
  p_appointment_date  date,
  p_start_time        time,
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_email    text default null,
  p_note              text default null
) returns table (
  booking_id          uuid,
  booking_reference   text,
  service_name        text,
  price_paise         bigint,
  duration_minutes    integer,
  appointment_date    date,
  start_time          time,
  end_time            time,
  status              text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone_digits      text;
  salon_row         public.salons%rowtype;
  service_row       public.services%rowtype;
  staff_count       integer;
  service_end       time;
  slot_start_ts     timestamp;
  now_ist           timestamp;
  new_ref           text;
  attempts          integer;
  existing          record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  -- ---- input validation -------------------------------------------------
  if p_salon_slug is null or btrim(p_salon_slug) = ''
     or p_service_id is null
     or p_appointment_date is null
     or p_start_time is null
     or p_customer_name is null or btrim(p_customer_name) = ''
     or p_customer_phone is null
  then
    raise exception 'salon slug, service, appointment, name and phone are required'
      using errcode = '22023';
  end if;
  if char_length(btrim(p_customer_name)) > 120 then
    raise exception 'customer name is too long (max 120 characters)' using errcode = '22023';
  end if;
  phone_digits := regexp_replace(p_customer_phone, '[^0-9]', '', 'g');
  if phone_digits !~ '^[0-9]{10,15}$' then
    raise exception 'a valid 10 to 15 digit mobile number is required' using errcode = '22023';
  end if;
  if p_appointment_date < current_date then
    raise exception 'past appointments are not allowed' using errcode = '22023';
  end if;

  -- ---- resolve the PUBLISHED salon by slug ------------------------------
  select s.* into salon_row
    from public.salon_public_websites w
    join public.salons s on s.id = w.salon_id
   where w.slug = p_salon_slug
     and w.is_published = true
     and s.is_active = true
     and s.deleted_at is null
   limit 1;
  if not found then
    raise exception 'the salon is not published' using errcode = 'P0002';
  end if;

  -- ---- load the active service (server-priced snapshot) ------------------
  select * into service_row
    from public.services
   where id = p_service_id
     and salon_id = salon_row.id
     and coalesce(is_active, true) = true
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'the selected service is unavailable for this salon' using errcode = 'P0002';
  end if;

  -- ---- optional stylist (known staff columns only — see header) ---------
  if p_staff_id is not null then
    staff_count := 0;
    if to_regclass('public.staff') is not null then
      execute 'select count(*) from public.staff where id = $1 and salon_id = $2 and (is_active is distinct from false)'
        into staff_count
        using p_staff_id, salon_row.id;
    end if;
    if coalesce(staff_count, 0) = 0 then
      raise exception 'the selected stylist is unavailable for this salon' using errcode = 'P0002';
    end if;
  end if;

  -- ---- slot geometry & freshness ----------------------------------------
  service_end := p_start_time + make_interval(mins => coalesce(service_row.duration_minutes, 30));
  if service_end <= p_start_time then
    raise exception 'the selected slot is too late in the day for this service' using errcode = '22023';
  end if;
  slot_start_ts := p_appointment_date::timestamp + p_start_time::interval;
  now_ist := now() at time zone 'Asia/Kolkata';
  if slot_start_ts < now_ist + interval '5 minutes' then
    raise exception 'the selected slot has already passed' using errcode = '22023';
  end if;

  -- ---- conflict detection: website guest bookings (salon-level) ---------
  if exists (
    select 1
      from public.website_bookings wb
     where wb.salon_id = salon_row.id
       and wb.status <> 'cancelled'
       and wb.appointment_date = p_appointment_date
       and wb.start_time < service_end
       and (wb.end_time is null or wb.end_time > p_start_time)
  ) then
    raise exception 'the selected time is no longer available' using errcode = '23P01';
  end if;

  -- ---- conflict detection: canonical bookings (live-schema guard) -------
  if to_regclass('public.bookings') is not null then
    if exists (
      select 1
        from public.bookings b
       where b.salon_id = salon_row.id
         and coalesce(b.status, 'pending') <> 'cancelled'
         and (b.appointment_start at time zone 'Asia/Kolkata')::date = p_appointment_date
         and (b.appointment_start at time zone 'Asia/Kolkata')::time < service_end
         and coalesce(
                (b.appointment_end at time zone 'Asia/Kolkata')::time,
                (b.appointment_start at time zone 'Asia/Kolkata')::time + make_interval(mins => 60)
              ) > p_start_time
    ) then
      raise exception 'the selected time is no longer available' using errcode = '23P01';
    end if;
  end if;

  -- ---- unique booking reference (NX- + 6 digits) ------------------------
  for attempts in 1..5 loop
    new_ref := 'NX-' || lpad((floor(random() * 900000) + 100000)::bigint::text, 6, '0');
    -- Qualified: the unqualified name would also match the RETURNS TABLE output.
    if not exists (select 1 from public.website_bookings wbf where wbf.booking_reference = new_ref) then
      exit;
    end if;
  end loop;

  insert into public.website_bookings as wb (
    salon_id, customer_name, customer_phone, customer_email,
    service_id, service_name_snapshot, price_paise, duration_minutes,
    staff_id, appointment_date, start_time, end_time, note,
    booking_reference, status, source
  ) values (
    salon_row.id, btrim(p_customer_name), phone_digits,
    case when p_customer_email is null or btrim(p_customer_email) = ''
         then null else btrim(p_customer_email) end,
    service_row.id, service_row.name,
    coalesce(service_row.price_paise, 0), service_row.duration_minutes,
    p_staff_id, p_appointment_date, p_start_time, service_end,
    case when p_note is null or btrim(p_note) = ''
         then null else left(btrim(p_note), 500) end,
    new_ref, 'pending', 'website'
  )
  -- Fully qualified on purpose: unqualified names would collide with the
  -- function's own RETURNS TABLE output variables.
  returning
    wb.id as booking_id,
    wb.booking_reference,
    wb.service_name_snapshot as service_name,
    wb.price_paise,
    wb.duration_minutes,
    wb.appointment_date,
    wb.start_time,
    wb.end_time,
    wb.status
  into existing;

  return query
    select existing.booking_id,
           existing.booking_reference,
           existing.service_name,
           existing.price_paise,
           existing.duration_minutes,
           existing.appointment_date,
           existing.start_time,
           existing.end_time,
           existing.status;
end;
$$;

revoke all on function public.create_website_booking(text, uuid, uuid, date, time, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_website_booking(text, uuid, uuid, date, time, text, text, text, text)
  to service_role;

comment on function public.create_website_booking(text, uuid, uuid, date, time, text, text, text, text) is
  'Guest website booking entry point. Only the service-role server API may call it.';

-- ---------------------------------------------------------------------------
-- 4. get_website_bookings — owner read surface (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.get_website_bookings(p_salon_id uuid)
returns table (
  booking_id         uuid,
  booking_reference  text,
  customer_name      text,
  customer_phone     text,
  customer_email     text,
  service_name       text,
  price_paise        bigint,
  duration_minutes   integer,
  staff_id           uuid,
  appointment_date   date,
  start_time         time,
  end_time           time,
  note               text,
  status             text,
  source             text,
  created_at         timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select wb.id, wb.booking_reference, wb.customer_name, wb.customer_phone,
         wb.customer_email, wb.service_name_snapshot, wb.price_paise,
         wb.duration_minutes, wb.staff_id, wb.appointment_date, wb.start_time,
         wb.end_time, wb.note, wb.status, wb.source, wb.created_at
    from public.website_bookings wb
   where wb.salon_id = p_salon_id
   order by wb.appointment_date desc, wb.start_time desc, wb.created_at desc
   limit 500;
$$;

revoke all on function public.get_website_bookings(uuid) from public, anon, authenticated;
grant execute on function public.get_website_bookings(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. verify_m41_website_bookings — post-apply self-test.
--    Runs a full end-to-end (create → conflict → cancel) when a published
--    salon with an active service exists; otherwise reports 'skipped'.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m41_website_bookings()
returns table (check_name text, passed boolean, detail text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  salon_row   public.salons%rowtype;
  service_row public.services%rowtype;
  created     record;
  conflict_ok boolean;
  test_date   date;
begin
  -- 5.1 object existence
  return query
    select 'table website_bookings exists',
           to_regclass('public.website_bookings') is not null,
           ''::text
    union all
    select 'website_bookings RLS enabled',
           (select relrowsecurity from pg_class where oid = 'public.website_bookings'::regclass),
           ''::text
    union all
    select 'create_website_booking exists',
           exists (
             select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'create_website_booking'
           ),
           ''::text
    union all
    select 'get_website_bookings exists',
           exists (
             select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'get_website_bookings'
           ),
           ''::text;

  if coalesce(auth.role(), '') <> 'service_role' then
    return query
      select 'end-to-end guest booking', false,
             'requires service_role to run the write test';
    return;
  end if;

  -- 5.2 find a published salon with an active service for the write test
  select s.* into salon_row
    from public.salon_public_websites w
    join public.salons s on s.id = w.salon_id
   where w.is_published = true
     and s.is_active = true
     and s.deleted_at is null
   limit 1;
  if not found then
    return query select 'end-to-end guest booking', true, 'skipped: no published salon';
    return;
  end if;

  select * into service_row
    from public.services
   where salon_id = salon_row.id
     and coalesce(is_active, true) = true
     and deleted_at is null
   limit 1;
  if not found then
    return query select 'end-to-end guest booking', true, 'skipped: no active service';
    return;
  end if;

  test_date := current_date + 60;

  begin
    select * into created from public.create_website_booking(
      (select slug from public.salon_public_websites
        where salon_id = salon_row.id and is_published = true limit 1),
      service_row.id,
      null,
      test_date,
      '10:00'::time,
      'M41 Verify Customer',
      '9999999999',
      'verify@m41.local',
      'm41 self-test — safe to cancel'
    );
  exception when others then
    return query
      select 'end-to-end guest booking', false, 'create failed: ' || sqlerrm;
    return;
  end;

  return query
    select 'end-to-end guest booking',
           created.booking_id is not null and created.booking_reference ~ '^NX-[0-9]{6}$',
           created.booking_reference;

  -- 5.3 the same slot must now conflict
  begin
    perform public.create_website_booking(
      (select slug from public.salon_public_websites
        where salon_id = salon_row.id and is_published = true limit 1),
      service_row.id,
      null,
      test_date,
      '10:00'::time,
      'M41 Verify Customer',
      '9999999999'
    );
    conflict_ok := false;
  exception when others then
    conflict_ok := sqlerrm = 'the selected time is no longer available';
  end;

  return query
    select 'slot conflict detection', conflict_ok, ''::text;

  -- 5.4 clean up: cancel the self-test row
  update public.website_bookings set status = 'cancelled' where id = created.booking_id;

  return query
    select 'self-test cleanup', true, created.booking_reference || ' cancelled';
end;
$$;

revoke all on function public.verify_m41_website_bookings() from public, anon, authenticated;
grant execute on function public.verify_m41_website_bookings() to service_role;

commit;
