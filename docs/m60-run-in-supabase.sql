-- ============================================================================
-- M60 — LIVE APPLY (Supabase SQL Editor paste-ready)
-- Project: qwaehqsmodekbgvnaavz
-- ============================================================================
-- यह फाइल तब use करो जब CLI / Management API से apply न हो पाए
-- (expired SUPABASE_ACCESS_TOKEN, या restricted network).
--
-- STEP 0 — PRE-CHECK (अलग tab में चलाओ, कुछ भी लिखता नहीं):
--   select to_regclass('public.payments') is not null as payments_ok,
--          to_regclass('public.payment_orders') is not null as orders_ok,
--          to_regprocedure('public.get_owner_salon_bookings_for_actor(uuid,uuid)') is not null as m55_ok;
--   तीनों true होने चाहिए. false आया तो पहले M29/M31 और M55 apply करो.
--
-- STEP 1 — नया query tab खोलो. इस फाइल का ALL text copy करो (Ctrl+A),
--          बीच का टुकड़ा नहीं. पहली SQL statement begin; आखिरी commit;
-- STEP 2 — Selection हटाओ, Run.
-- STEP 3 — POST-CHECK (नया tab):
--   select check_name, ok, detail
--   from public.verify_m60_payment_refunds()
--   order by check_name;
--   सभी 7 rows ok = true होनी चाहिए.
--
-- ORDER: M60 पहले, फिर M61, फिर M62 (M62 का export M60 की
--        payment_refunds table को पढ़ता है).
--
-- ROLLBACK: पूरा script एक transaction है — कोई statement fail हुआ तो
-- कुछ भी commit नहीं होगा. Migration additive है (नई table + create or
-- replace functions); कोई table drop / column drop / RLS disable नहीं.
-- ============================================================================

-- ============================================================================
-- M60 — provider-backed payment refunds with idempotency + reconciliation
-- ============================================================================
--
-- GAP CLOSED (Missing Items & Gaps Analysis, 2026-08-25 §7 "Refunds: FAIL —
-- no Razorpay refund API workflow, no provider refund IDs, no reconciliation").
--
-- Design follows the house rules:
--   * additive only; no existing row is rewritten by the migration itself;
--   * every RPC is SECURITY DEFINER + service_role-only (the HTTP API carries
--     the authenticated actor UUID in, exactly like the M55 `_for_actor`
--     surface) or trusted-webhook-only;
--   * authorization derives from the canonical organization_members → salons
--     chain through private.nexora_single_actor_salon_id; no client-supplied
--     salon id is trusted;
--   * RLS deny-by-default; anon/authenticated receive no grants;
--   * idempotency is database-enforced so retries and duplicate webhooks can
--     never double-refund.
--
-- The deterministic local gateway (no Razorpay keys) marks refunds through the
-- same mark_payment_refund_result path, so preview/test mode never invents a
-- second refund authority.

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed unless the canonical payment/booking/actor chain is present.
-- ---------------------------------------------------------------------------
do $m60_preflight$
begin
  if to_regclass('public.payments') is null
     or to_regclass('public.payment_orders') is null
     or to_regclass('public.bookings') is null
     or to_regclass('public.salons') is null
     or to_regclass('public.organization_members') is null
     or to_regprocedure('public.get_owner_salon_bookings_for_actor(uuid,uuid)') is null then
    raise exception
      'M60 preflight: canonical payments/bookings/M55 actor functions are missing. Apply M29, M31 and M55 first.';
  end if;
end
$m60_preflight$;

-- FK target for the composite (payment_id, booking_id) reference below.
create unique index if not exists payments_id_booking_unique
  on public.payments (id, booking_id);

-- ---------------------------------------------------------------------------
-- 1. Refund ledger.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider text not null default 'razorpay',
  provider_refund_id text,
  amount_paise bigint not null,
  currency text not null default 'INR',
  status text not null default 'initiated',
  reason text,
  created_by uuid not null,
  provider_response jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_refunds_provider_razorpay check (provider = 'razorpay'),
  constraint payment_refunds_amount_positive check (amount_paise > 0),
  constraint payment_refunds_currency_inr check (currency = 'INR'),
  constraint payment_refunds_status_check
    check (status in ('initiated', 'processed', 'failed')),
  constraint payment_refunds_idempotency_format
    check (char_length(idempotency_key) between 16 and 128
           and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  constraint payment_refunds_idempotency_unique unique (idempotency_key),
  constraint payment_refunds_provider_refund_unique unique (provider_refund_id),
  constraint payment_refunds_booking_payment_fk
    foreign key (payment_id, booking_id)
    references public.payments(id, booking_id)
    on delete restrict
);

create index if not exists payment_refunds_booking_idx
  on public.payment_refunds (booking_id, created_at desc);
create index if not exists payment_refunds_salon_created_idx
  on public.payment_refunds (salon_id, created_at desc);

alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from public, anon, authenticated;
grant all on public.payment_refunds to service_role;

-- Keep payments.status truthful as refunds settle. Partial refunds keep the
-- captured/payment semantics distinct from a full refund.
create or replace function public.payment_refunds_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.payment_refunds_touch_updated_at() from public, anon, authenticated;

drop trigger if exists trg_payment_refunds_touch_updated_at on public.payment_refunds;
create trigger trg_payment_refunds_touch_updated_at
before update on public.payment_refunds
for each row execute function public.payment_refunds_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Owner-initiated refund creation (actor-bound, service-role only).
-- ---------------------------------------------------------------------------
create or replace function public.create_payment_refund_for_actor(
  p_actor_user_id uuid,
  p_payment_id uuid,
  p_amount_paise bigint,
  p_idempotency_key text,
  p_reason text default null
)
returns table (
  refund_id uuid,
  booking_id uuid,
  provider_refund_id text,
  amount_paise bigint,
  status text,
  payment_status text,
  already_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_refunded bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;

  -- Idempotent retry: the same actor + key always returns the original row.
  return query
  select r.id, r.booking_id, r.provider_refund_id, r.amount_paise, r.status,
         (select p2.status from public.payments p2 where p2.id = r.payment_id),
         true
  from public.payment_refunds r
  where r.idempotency_key = p_idempotency_key
    and r.created_by = p_actor_user_id
    and r.payment_id = p_payment_id;
  if found then return; end if;

  select * into v_payment
  from public.payments pay
  where pay.id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  -- Authorization: the actor must own/manage the payment's salon through the
  -- canonical membership chain. Never trusts a request-supplied salon id.
  perform private.nexora_single_actor_salon_id(p_actor_user_id, v_payment.salon_id);

  if v_payment.status not in ('captured', 'authorized', 'partially_refunded') then
    raise exception 'Only captured payments can be refunded'
      using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0
     or p_amount_paise > v_payment.amount_paise then
    raise exception 'Refund amount must be positive and cannot exceed the payment amount'
      using errcode = '22023';
  end if;

  select coalesce(sum(r.amount_paise), 0) into v_refunded
  from public.payment_refunds r
  where r.payment_id = p_payment_id
    and r.status in ('initiated', 'processed');
  if p_amount_paise > v_payment.amount_paise - v_refunded then
    raise exception 'Refund exceeds the remaining refundable amount'
      using errcode = '22023';
  end if;

  insert into public.payment_refunds (
    salon_id, booking_id, payment_id, amount_paise, currency,
    reason, created_by, idempotency_key
  ) values (
    v_payment.salon_id, v_payment.booking_id, v_payment.id, p_amount_paise,
    v_payment.currency, nullif(btrim(coalesce(p_reason, '')), ''), p_actor_user_id,
    p_idempotency_key
  )
  returning public.payment_refunds.id, public.payment_refunds.booking_id,
            public.payment_refunds.provider_refund_id,
            public.payment_refunds.amount_paise, public.payment_refunds.status,
            v_payment.status, false
  into refund_id, booking_id, provider_refund_id, amount_paise, status,
       payment_status, already_existed;

  return query
  select refund_id, booking_id, provider_refund_id, amount_paise, status,
         payment_status, already_existed;
end;
$$;

revoke all on function public.create_payment_refund_for_actor(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.create_payment_refund_for_actor(uuid, uuid, bigint, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Settlement marker used by BOTH the server response path and the webhook
--    path (trusted server only; idempotent by provider refund id).
-- ---------------------------------------------------------------------------
create or replace function public.mark_payment_refund_result(
  p_status text,
  p_refund_id uuid default null,
  p_provider_refund_id text default null,
  p_provider_response jsonb default null
)
returns table (refund_id uuid, status text, payment_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.payment_refunds%rowtype;
  v_total_refunded bigint;
  v_payment public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;
  if p_status not in ('initiated', 'processed', 'failed') then
    raise exception 'invalid refund status' using errcode = '22023';
  end if;

  select * into v_refund
  from public.payment_refunds r
  where (p_refund_id is not null and r.id = p_refund_id)
     or (p_refund_id is null and p_provider_refund_id is not null
         and r.provider_refund_id = p_provider_refund_id)
  for update;

  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;

  -- Webhook replay / duplicate server callback: return the settled state.
  if v_refund.status = 'processed' and p_status = 'processed' then
    return query select v_refund.id, v_refund.status,
      (select pay.status from public.payments pay where pay.id = v_refund.payment_id);
    return;
  end if;

  update public.payment_refunds r
  set status = p_status,
      provider_refund_id = coalesce(nullif(btrim(p_provider_refund_id), ''), r.provider_refund_id),
      provider_response = coalesce(p_provider_response, r.provider_response)
  where r.id = v_refund.id
  returning * into v_refund;

  if v_refund.status = 'processed' then
    select * into v_payment from public.payments pay
    where pay.id = v_refund.payment_id for update;
    select coalesce(sum(r.amount_paise), 0) into v_total_refunded
    from public.payment_refunds r
    where r.payment_id = v_refund.payment_id and r.status = 'processed';
    update public.payments pay
    set status = case
          when v_total_refunded >= v_payment.amount_paise then 'refunded'
          else 'partially_refunded'
        end,
        updated_at = now()
    where pay.id = v_refund.payment_id;
  end if;

  return query
  select v_refund.id, v_refund.status,
         (select pay.status from public.payments pay where pay.id = v_refund.payment_id);
end;
$$;

revoke all on function public.mark_payment_refund_result(text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.mark_payment_refund_result(text, uuid, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Owner refund read surface (actor-bound).
-- ---------------------------------------------------------------------------
create or replace function public.get_payment_refunds_for_actor(
  p_actor_user_id uuid,
  p_booking_id uuid default null
)
returns table (
  refund_id uuid,
  booking_id uuid,
  payment_id uuid,
  provider_refund_id text,
  amount_paise bigint,
  currency text,
  status text,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;

  return query
  select r.id, r.booking_id, r.payment_id, r.provider_refund_id, r.amount_paise,
         r.currency, r.status, r.reason, r.created_at
  from public.payment_refunds r
  where r.salon_id in (
    select s.id
    from public.salons s
    join public.organizations o on o.id = s.organization_id
    join public.organization_members m
      on m.organization_id = o.id and m.user_id = p_actor_user_id
    where s.is_active = true and s.deleted_at is null
      and m.is_active = true and m.role in ('owner', 'manager')
  )
  and (p_booking_id is null or r.booking_id = p_booking_id)
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_payment_refunds_for_actor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_payment_refunds_for_actor(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Read-only post-deployment verifier.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m60_payment_refunds()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query values
    ('payment_refunds table exists',
      to_regclass('public.payment_refunds') is not null,
      coalesce(to_regclass('public.payment_refunds')::text, 'missing')),
    ('payment_refunds RLS enabled',
      exists (
        select 1 from pg_tables t
        where t.schemaname = 'public' and t.tablename = 'payment_refunds' and t.rowsecurity
      ),
      'rowsecurity must be true'),
    ('anon cannot read payment_refunds',
      not exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.table_name = 'payment_refunds'
          and g.grantee in ('anon', 'authenticated', 'public') and g.privilege_type = 'SELECT'
      ),
      'no anon/authenticated select grant'),
    ('create_payment_refund_for_actor installed',
      to_regprocedure('public.create_payment_refund_for_actor(uuid,uuid,bigint,text,text)') is not null,
      'service-role-only owner refund creation'),
    ('mark_payment_refund_result installed',
      to_regprocedure('public.mark_payment_refund_result(text,uuid,text,jsonb)') is not null,
      'idempotent settlement marker for server + webhook paths'),
    ('get_payment_refunds_for_actor installed',
      to_regprocedure('public.get_payment_refunds_for_actor(uuid,uuid)') is not null,
      'actor-bound owner refund ledger read'),
    ('webhook functions cannot be executed by anon',
      not exists (
        select 1 from information_schema.role_routine_grants g
        where g.routine_schema = 'public'
          and g.routine_name in ('create_payment_refund_for_actor','mark_payment_refund_result')
          and g.grantee in ('anon', 'authenticated', 'public')
      ),
      'no anon/authenticated execute grant on refund RPCs');
end;
$$;

revoke all on function public.verify_m60_payment_refunds()
  from public, anon, authenticated;
grant execute on function public.verify_m60_payment_refunds() to service_role, authenticated;

commit;
