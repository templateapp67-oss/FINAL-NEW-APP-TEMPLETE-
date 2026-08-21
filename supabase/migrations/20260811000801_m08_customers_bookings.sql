-- M08 (DRAFT): customers, bookings, status history and temporary slot holds
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  full_name text not null,
  mobile text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_mobile_nonempty check (btrim(mobile) <> ''),
  constraint customers_business_mobile_key unique (business_id, mobile),
  constraint customers_id_business_key unique (id, business_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  staff_id uuid references public.staff_members(id) on delete set null,
  booking_reference text not null unique,
  appointment_date date not null,
  start_time time not null,
  end_time time,
  service_name_snapshot text not null,
  service_price_paise bigint not null,
  duration_minutes integer,
  advance_paise bigint not null,
  remaining_paise bigint not null,
  customer_note text,
  booking_source public.nexora_booking_source not null default 'website',
  booking_status public.nexora_booking_status not null default 'pending_payment',
  payment_status public.nexora_booking_payment_status not null default 'pending',
  balance_status public.nexora_balance_status not null default 'due',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_offer_required check (service_id is not null or package_id is not null),
  constraint bookings_price_nonnegative check (service_price_paise >= 0),
  constraint bookings_duration_positive check (duration_minutes is null or duration_minutes > 0),
  constraint bookings_advance_nonnegative check (advance_paise >= 0),
  constraint bookings_remaining_nonnegative check (remaining_paise >= 0),
  constraint bookings_advance_math check (advance_paise + remaining_paise = service_price_paise),
  constraint bookings_fixed_advance check (advance_paise = (service_price_paise + 3) / 4),
  constraint bookings_time_order check (end_time is null or end_time > start_time),
  constraint bookings_reference_nonempty check (btrim(booking_reference) <> ''),
  constraint bookings_id_business_key unique (id, business_id)
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  old_status public.nexora_booking_status,
  new_status public.nexora_booking_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_slot_holds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id uuid references public.staff_members(id) on delete cascade,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  session_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_slot_holds_time_order check (end_time > start_time),
  constraint booking_slot_holds_session_nonempty check (btrim(session_token) <> ''),
  constraint booking_slot_holds_session_key unique (business_id, session_token)
);

comment on table public.bookings is 'Single booking source. Snapshot and paise fields preserve historical truth.';
comment on table public.booking_slot_holds is 'Availability considers only rows where expires_at > now().';

commit;
