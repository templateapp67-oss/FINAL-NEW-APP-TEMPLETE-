-- M29 / Phase 1A: authoritative Razorpay order, payment and webhook foundation
--
-- HMAC verification is performed by trusted server code over the exact raw
-- request bytes. SQL never receives or stores a Razorpay secret. These RPCs are
-- service_role-only and atomically enforce booking amount, ownership and
-- idempotency. Frontend amounts/payment-success flags are never trusted.

begin;

-- The shared canonical booking schema must already be present.
do $preflight$
begin
  if to_regclass('public.bookings') is null
    or to_regclass('public.salons') is null
    or to_regclass('public.profiles') is null then
    raise exception 'Phase 1A payment preflight failed: canonical bookings/salons/profiles are required';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings'
      and column_name = 'advance_amount_paise'
  ) then
    alter table public.bookings
      add column advance_amount_paise bigint not null default 0;
  end if;
end
$preflight$;

-- Fail rather than silently accepting an incompatible pre-existing order table.
do $order_preflight$
declare
  required_column text;
begin
  if to_regclass('public.payment_orders') is not null then
    foreach required_column in array array[
      'id', 'salon_id', 'booking_id', 'provider', 'provider_order_id',
      'amount_paise', 'currency', 'status', 'expires_at', 'created_at', 'updated_at'
    ] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'payment_orders'
          and column_name = required_column
      ) then
        raise exception 'Phase 1A: existing public.payment_orders is missing required column %; reconcile it instead of creating a second payment-order authority', required_column;
      end if;
    end loop;
  end if;

  if to_regclass('public.payments') is not null then
    foreach required_column in array array['id', 'booking_id', 'amount_paise', 'created_at'] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'payments'
          and column_name = required_column
      ) then
        raise exception 'Phase 1A: existing public.payments is missing required column %; reconcile it instead of creating another payment table', required_column;
      end if;
    end loop;
  end if;
end
$order_preflight$;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  amount_paise bigint not null,
  currency text not null default 'INR',
  status text not null default 'created',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase1a_payment_orders_amount_positive check (amount_paise > 0),
  constraint phase1a_payment_orders_currency_inr check (currency = 'INR'),
  constraint phase1a_payment_orders_status_check check (status in ('created', 'paid', 'failed', 'cancelled', 'expired')),
  constraint phase1a_payment_orders_id_booking_unique unique (id, booking_id)
);

create unique index if not exists payment_orders_one_open_booking_unique
  on public.payment_orders (booking_id)
  where status = 'created';
create index if not exists payment_orders_salon_created_idx
  on public.payment_orders (salon_id, created_at desc);

-- Reuse an existing payments table when present; add only the canonical fields
-- needed by this verified provider flow. Existing rows are not rewritten.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_order_id uuid not null,
  provider text not null default 'razorpay',
  provider_payment_id text not null,
  amount_paise bigint not null,
  currency text not null default 'INR',
  method text,
  status text not null default 'captured',
  signature text,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase1a_payments_order_booking_fk
    foreign key (payment_order_id, booking_id)
    references public.payment_orders(id, booking_id)
    on delete restrict,
  constraint phase1a_payments_provider_payment_unique unique (provider, provider_payment_id),
  constraint phase1a_payments_amount_positive check (amount_paise > 0),
  constraint phase1a_payments_currency_inr check (currency = 'INR'),
  constraint phase1a_payments_status_check check (status in ('authorized', 'captured', 'failed', 'refunded', 'partially_refunded'))
);

alter table public.payments
  add column if not exists salon_id uuid,
  add column if not exists payment_order_id uuid,
  add column if not exists provider text,
  add column if not exists provider_payment_id text,
  add column if not exists currency text,
  add column if not exists method text,
  add column if not exists status text,
  add column if not exists signature text,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz;

do $payment_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'phase1a_payments_salon_fk'
  ) then
    alter table public.payments
      add constraint phase1a_payments_salon_fk
      foreign key (salon_id) references public.salons(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'phase1a_payments_order_booking_fk'
  ) then
    alter table public.payments
      add constraint phase1a_payments_order_booking_fk
      foreign key (payment_order_id, booking_id)
      references public.payment_orders(id, booking_id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'phase1a_payments_amount_positive_compat'
  ) then
    alter table public.payments
      add constraint phase1a_payments_amount_positive_compat
      check (amount_paise > 0) not valid;
  end if;
end
$payment_constraints$;

-- Existing shared deployments may already have an audit/webhook table.
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  signature text not null,
  signature_verified boolean not null default false,
  payload jsonb not null,
  idempotency_key text not null unique,
  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists payments_provider_payment_unique_phase1a
  on public.payments (provider, provider_payment_id);
create index if not exists payments_booking_verified_idx
  on public.payments (booking_id, verified_at desc);
create index if not exists payments_salon_created_idx
  on public.payments (salon_id, created_at desc);
create index if not exists payment_webhook_unprocessed_idx
  on public.payment_webhook_events (created_at)
  where processed = false;

-- Replace the historical fully-immutable trigger, which also blocked its own
-- processing RPC. Ingress evidence stays immutable; only the service role may
-- transition an unprocessed event to processed.
create or replace function private.phase1a_guard_payment_webhook_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'payment webhook ingress is immutable'; end if;
  if coalesce(auth.role(), '') <> 'service_role'
     or old.processed = true
     or new.processed <> true
     or new.processed_at is null
     or (to_jsonb(new) - array['processed', 'processed_at', 'error_message'])
        <> (to_jsonb(old) - array['processed', 'processed_at', 'error_message']) then
    raise exception 'payment webhook ingress is immutable';
  end if;
  return new;
end
$$;
revoke all on function private.phase1a_guard_payment_webhook_mutation()
  from public, anon, authenticated;
drop trigger if exists trg_payment_webhook_immutable on public.payment_webhook_events;
drop trigger if exists trg_phase1a_payment_webhook_guard on public.payment_webhook_events;
create trigger trg_phase1a_payment_webhook_guard
before update or delete on public.payment_webhook_events
for each row execute function private.phase1a_guard_payment_webhook_mutation();

-- Quote is server-derived from a locked booking record. The API calls this
-- before creating the provider order and rechecks it while recording the order.
create or replace function public.get_booking_payment_quote(
  p_user_id uuid,
  p_booking_id uuid
)
returns table (
  booking_id uuid,
  salon_id uuid,
  amount_paise bigint,
  currency text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_record public.bookings%rowtype;
begin
  if p_user_id is null then raise exception 'Authenticated user is required'; end if;

  select * into booking_record
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if booking_record.customer_id <> p_user_id then raise exception 'Booking does not belong to this customer'; end if;
  if booking_record.status <> 'pending' then raise exception 'Booking is not awaiting payment'; end if;
  if booking_record.payment_status in ('paid', 'partially_paid') then raise exception 'Booking is already paid'; end if;

  booking_id := booking_record.id;
  salon_id := booking_record.salon_id;
  amount_paise := case
    when coalesce(booking_record.advance_amount_paise, 0) > 0
      then booking_record.advance_amount_paise
    else booking_record.total_amount_paise
  end;
  currency := booking_record.currency;

  if amount_paise is null or amount_paise <= 0 then
    raise exception 'Booking has no payable server amount';
  end if;
  if currency <> 'INR' then raise exception 'Unsupported booking currency'; end if;
  return next;
end
$$;

create or replace function public.record_razorpay_order(
  p_user_id uuid,
  p_booking_id uuid,
  p_provider_order_id text,
  p_provider_amount_paise bigint,
  p_provider_currency text,
  p_expires_at timestamptz default null
)
returns public.payment_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote record;
  existing public.payment_orders%rowtype;
  result public.payment_orders%rowtype;
begin
  if nullif(btrim(p_provider_order_id), '') is null then raise exception 'Provider order id is required'; end if;
  select * into quote from public.get_booking_payment_quote(p_user_id, p_booking_id);
  if quote.amount_paise <> p_provider_amount_paise then raise exception 'Provider amount does not match the authoritative booking amount'; end if;
  if quote.currency <> upper(p_provider_currency) then raise exception 'Provider currency does not match the booking currency'; end if;

  select * into existing
  from public.payment_orders
  where booking_id = p_booking_id and status = 'created'
  for update;
  if found then
    if existing.provider_order_id <> p_provider_order_id
      or existing.amount_paise <> quote.amount_paise then
      raise exception 'A different active payment order already exists for this booking';
    end if;
    return existing;
  end if;

  insert into public.payment_orders (
    salon_id, booking_id, provider, provider_order_id, amount_paise,
    currency, status, expires_at
  ) values (
    quote.salon_id, quote.booking_id, 'razorpay', p_provider_order_id,
    quote.amount_paise, quote.currency, 'created', p_expires_at
  ) returning * into result;

  update public.bookings
  set payment_status = 'pending', updated_at = now()
  where id = p_booking_id and status = 'pending';
  return result;
end
$$;

-- Called only after trusted server code verifies
-- HMAC_SHA256(provider_order_id || '|' || provider_payment_id, key_secret).
create or replace function public.confirm_verified_razorpay_payment(
  p_user_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_signature text,
  p_method text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.payment_orders%rowtype;
  booking_record public.bookings%rowtype;
  existing_payment public.payments%rowtype;
  result_id uuid;
begin
  if nullif(btrim(p_provider_payment_id), '') is null then raise exception 'Provider payment id is required'; end if;
  if nullif(btrim(p_signature), '') is null then raise exception 'Verified signature evidence is required'; end if;

  select * into payment_order
  from public.payment_orders
  where provider = 'razorpay' and provider_order_id = p_provider_order_id
  for update;
  if not found then raise exception 'Payment order not found'; end if;

  select * into booking_record
  from public.bookings where id = payment_order.booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if p_user_id is not null and booking_record.customer_id <> p_user_id then
    raise exception 'Booking does not belong to this customer';
  end if;

  select * into existing_payment
  from public.payments
  where provider = 'razorpay' and provider_payment_id = p_provider_payment_id
  for update;
  if found then
    if existing_payment.booking_id <> booking_record.id
      or existing_payment.payment_order_id <> payment_order.id
      or existing_payment.amount_paise <> payment_order.amount_paise then
      raise exception 'Provider payment id is already bound to different payment data';
    end if;
    return existing_payment.id;
  end if;

  if payment_order.status = 'paid' then raise exception 'Payment order is already paid with a different payment id'; end if;
  if payment_order.status <> 'created' then raise exception 'Payment order cannot be confirmed'; end if;

  insert into public.payments (
    salon_id, booking_id, payment_order_id, provider, provider_payment_id,
    amount_paise, currency, method, status, signature, verified_at
  ) values (
    payment_order.salon_id, booking_record.id, payment_order.id, 'razorpay',
    p_provider_payment_id, payment_order.amount_paise, payment_order.currency,
    nullif(btrim(p_method), ''), 'captured', p_signature, now()
  ) returning id into result_id;

  update public.payment_orders
  set status = 'paid', updated_at = now()
  where id = payment_order.id;

  update public.bookings
  set status = 'confirmed',
      payment_status = case
        when payment_order.amount_paise >= total_amount_paise then 'paid'
        else 'partially_paid'
      end,
      updated_at = now()
  where id = booking_record.id and status = 'pending';

  if not found then raise exception 'Booking was not in a confirmable state'; end if;
  return result_id;
end
$$;

create or replace function public.record_razorpay_payment_failure(
  p_provider_order_id text,
  p_provider_payment_id text default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.payment_orders%rowtype;
begin
  select * into payment_order
  from public.payment_orders
  where provider = 'razorpay' and provider_order_id = p_provider_order_id
  for update;
  if not found then return false; end if;
  if payment_order.status = 'paid' then return false; end if;

  update public.payment_orders set status = 'failed', updated_at = now()
  where id = payment_order.id and status = 'created';
  update public.bookings set payment_status = 'failed', updated_at = now()
  where id = payment_order.booking_id and status = 'pending';

  if p_provider_payment_id is not null then
    insert into public.payments (
      salon_id, booking_id, payment_order_id, provider, provider_payment_id,
      amount_paise, currency, status, verified_at
    ) values (
      payment_order.salon_id, payment_order.booking_id, payment_order.id,
      'razorpay', p_provider_payment_id, payment_order.amount_paise,
      payment_order.currency, 'failed', now()
    ) on conflict (provider, provider_payment_id) do nothing;
  end if;
  return true;
end
$$;

-- Disable the historical placeholder that considered any non-empty secret to
-- be verification. Existing callers now fail closed and must move to the HMAC
-- verified server route plus ingest_verified_payment_webhook().
create or replace function public.ingest_payment_webhook(
  p_provider text,
  p_event_type text,
  p_payload jsonb,
  p_signature text,
  p_idempotency_key text,
  p_webhook_secret text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Deprecated insecure webhook RPC: verify the raw-body HMAC in trusted server code and call ingest_verified_payment_webhook';
end
$$;

create or replace function public.ingest_verified_payment_webhook(
  p_provider text,
  p_event_type text,
  p_payload jsonb,
  p_signature text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  marked_payload jsonb;
begin
  if p_provider <> 'razorpay' then raise exception 'Unsupported webhook provider'; end if;
  if nullif(btrim(p_event_type), '') is null
    or nullif(btrim(p_signature), '') is null
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Verified webhook metadata is incomplete';
  end if;

  marked_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('_nexora_verified_by', 'server_hmac');

  insert into public.payment_webhook_events (
    provider, event_type, signature, signature_verified, payload,
    idempotency_key, processed
  ) values (
    p_provider, p_event_type, p_signature, true, marked_payload,
    p_idempotency_key, false
  )
  on conflict (idempotency_key) do nothing
  returning id into result_id;
  if result_id is null then
    select e.id into result_id
    from public.payment_webhook_events e
    where e.idempotency_key = p_idempotency_key;
  end if;
  return result_id;
end
$$;

create or replace function public.process_payment_webhook(
  p_webhook_event_id uuid,
  p_idempotency_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.payment_webhook_events%rowtype;
begin
  select * into event_record
  from public.payment_webhook_events
  where id = p_webhook_event_id
  for update;
  if not found then raise exception 'Webhook event not found'; end if;
  if event_record.processed then return true; end if;
  if not event_record.signature_verified
    or event_record.payload ->> '_nexora_verified_by' <> 'server_hmac' then
    raise exception 'Webhook raw-body HMAC was not verified by trusted server code';
  end if;

  update public.payment_webhook_events
  set processed = true, processed_at = now(), error_message = null
  where id = p_webhook_event_id;
  return true;
end
$$;

-- Financial tables are never directly mutable by browser roles.
do $rls$
declare
  table_name text;
begin
  foreach table_name in array array['payment_orders', 'payments', 'payment_webhook_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', table_name);
  end loop;
end
$rls$;

drop policy if exists phase1a_payment_orders_customer_read on public.payment_orders;
create policy phase1a_payment_orders_customer_read on public.payment_orders
for select to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.customer_id = auth.uid()
  )
);
drop policy if exists phase1a_payment_orders_member_read on public.payment_orders;
create policy phase1a_payment_orders_member_read on public.payment_orders
for select to authenticated using (private.has_salon_role(salon_id, array['owner']::text[]));

drop policy if exists phase1a_payments_customer_read on public.payments;
create policy phase1a_payments_customer_read on public.payments
for select to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.customer_id = auth.uid()
  )
);
drop policy if exists phase1a_payments_member_read on public.payments;
create policy phase1a_payments_member_read on public.payments
for select to authenticated using (private.has_salon_role(salon_id, array['owner']::text[]));

revoke all on table public.payment_webhook_events from anon, authenticated;
grant select on public.payment_orders, public.payments to authenticated;
grant all on public.payment_orders, public.payments, public.payment_webhook_events to service_role;

-- RPC privilege boundary.
revoke all on function public.get_booking_payment_quote(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_razorpay_order(uuid, uuid, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_verified_razorpay_payment(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_razorpay_payment_failure(text, text, text) from public, anon, authenticated;
revoke all on function public.ingest_payment_webhook(text, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.ingest_verified_payment_webhook(text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.process_payment_webhook(uuid, text) from public, anon, authenticated;

grant execute on function public.get_booking_payment_quote(uuid, uuid) to service_role;
grant execute on function public.record_razorpay_order(uuid, uuid, text, bigint, text, timestamptz) to service_role;
grant execute on function public.confirm_verified_razorpay_payment(uuid, text, text, text, text) to service_role;
grant execute on function public.record_razorpay_payment_failure(text, text, text) to service_role;
grant execute on function public.ingest_verified_payment_webhook(text, text, jsonb, text, text) to service_role;
grant execute on function public.process_payment_webhook(uuid, text) to service_role;

commit;
