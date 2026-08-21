-- M09 (DRAFT): Razorpay orders/payments and in-salon balance collections
-- payment_refunds is intentionally deferred until a real refund backend exists.
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  amount_paise bigint not null,
  currency text not null default 'INR',
  status public.nexora_payment_order_status not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_orders_provider_razorpay check (provider = 'razorpay'),
  constraint payment_orders_amount_positive check (amount_paise > 0),
  constraint payment_orders_currency_inr check (currency = 'INR'),
  constraint payment_orders_provider_id_nonempty check (btrim(provider_order_id) <> ''),
  constraint payment_orders_id_business_key unique (id, business_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_order_id uuid not null references public.payment_orders(id) on delete restrict,
  provider text not null default 'razorpay',
  provider_payment_id text not null unique,
  amount_paise bigint not null,
  currency text not null default 'INR',
  payment_method text,
  payment_status public.nexora_payment_status not null default 'pending',
  verification_status public.nexora_verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_razorpay check (provider = 'razorpay'),
  constraint payments_amount_positive check (amount_paise > 0),
  constraint payments_currency_inr check (currency = 'INR'),
  constraint payments_provider_id_nonempty check (btrim(provider_payment_id) <> ''),
  constraint payments_verified_time check (verification_status <> 'verified' or verified_at is not null),
  constraint payments_id_business_key unique (id, business_id)
);

create table if not exists public.balance_collections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount_paise bigint not null,
  payment_method text,
  collected_by uuid references public.profiles(id) on delete set null,
  collected_at timestamptz not null default now(),
  notes text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint balance_collections_amount_positive check (amount_paise > 0),
  constraint balance_collections_idempotency_key unique (business_id, idempotency_key)
);

comment on table public.balance_collections is 'Offline/in-salon collections; never represented as Razorpay payments.';
comment on column public.balance_collections.idempotency_key is 'Required by controlled APIs for retry-safe collection writes; nullable for legacy backfill.';

commit;
