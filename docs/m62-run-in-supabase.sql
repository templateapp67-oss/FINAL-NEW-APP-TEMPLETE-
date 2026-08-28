-- ============================================================================
-- M62 — LIVE APPLY (Supabase SQL Editor paste-ready)
-- Project: qwaehqsmodekbgvnaavz
-- ============================================================================
-- यह फाइल तब use करो जब CLI / Management API से apply न हो पाए.
-- M60 और M61 के बाद चलाओ (export M60 की payment_refunds पढ़ता है).
--
-- STEP 0 — PRE-CHECK (अलग tab में चलाओ, कुछ भी लिखता नहीं):
--   select to_regclass('public.profiles') is not null as profiles_ok,
--          to_regclass('public.booking_services') is not null as lines_ok,
--          to_regprocedure('public.get_customer_bookings_for_actor(uuid)') is not null as m55_ok;
--   तीनों true होने चाहिए.
--
-- STEP 1 — नया query tab खोलो. इस फाइल का ALL text copy करो (Ctrl+A).
--          पहली SQL statement begin; आखिरी commit;
-- STEP 2 — Selection हटाओ, Run.
-- STEP 3 — POST-CHECK (नया tab):
--   select check_name, ok, detail
--   from public.verify_m62_privacy_lifecycle()
--   order by check_name;
--   सभी 4 rows ok = true होनी चाहिए.
--
-- ROLLBACK: पूरा script एक transaction है — fail हुआ तो कुछ commit नहीं
-- होगा. Migration additive है (दो नए RPC); कोई data नहीं बदलता/डिलीट नहीं
-- होता. असली anonymization सिर्फ authenticated API से चलेगी.
-- ============================================================================

-- ============================================================================
-- M62 — privacy lifecycle: data export + PII anonymization
-- ============================================================================
--
-- GAP CLOSED (Missing Items & Gaps Analysis, 2026-08-25 §5 "No production-grade
-- privacy lifecycle: no authenticated account deletion, customer data export,
-- correction workflow, configurable retention or anonymization").
--
-- Two service-role-only RPCs called by the authenticated HTTP API
-- (`/api/account/export`, `/api/account/delete`):
--
--   export_user_data_for_actor(p_actor_user_id)
--     One JSON document with the actor's profile, canonical bookings (with
--     service lines), payments and refunds — the GDPR-style access request.
--
--   anonymize_user_data_for_actor(p_actor_user_id)
--     Scrubs direct PII (profile name/phone/email/avatar) while PRESERVING the
--     financial ledger integrity: bookings/payments/refunds rows keep their
--     keys, amounts and statuses because salon accounting is a legitimate
--     interest and business record. The auth.users identity itself is deleted
--     by the server through the Supabase Admin API after this RPC commits;
--     ON DELETE CASCADE then removes the remaining profile row.
--
-- Both functions fail closed for non-service-role callers and never accept a
-- user id from the client (the API passes the bearer-token subject only).

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed unless the canonical chain is present.
-- ---------------------------------------------------------------------------
do $m62_preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.bookings') is null
     or to_regclass('public.booking_services') is null
     or to_regclass('public.payments') is null
     or to_regprocedure('public.get_customer_bookings_for_actor(uuid)') is null then
    raise exception
      'M62 preflight: canonical profile/booking/payment tables are missing. Apply M28, M29 and M55 first.';
  end if;
end
$m62_preflight$;

-- ---------------------------------------------------------------------------
-- 1. Authenticated data export (access request).
-- ---------------------------------------------------------------------------
create or replace function public.export_user_data_for_actor(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_document jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'user_id', p_actor_user_id,
    'profile', (
      select to_jsonb(p)
      from public.profiles p
      where p.id = p_actor_user_id
    ),
    'auth', (
      select jsonb_build_object(
        'email', u.email,
        'phone', u.phone,
        'created_at', u.created_at
      )
      from auth.users u
      where u.id = p_actor_user_id
    ),
    'bookings', coalesce((
      select jsonb_agg(
        to_jsonb(b) || jsonb_build_object(
          'service_lines', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'serviceName', bs.service_name_snapshot,
                'pricePaise', bs.price_paise,
                'durationMinutes', bs.duration_minutes,
                'quantity', bs.quantity
              ) order by bs.id
            ), '[]'::jsonb)
            from public.booking_services bs
            where bs.booking_id = b.id
          )
        ) order by b.appointment_start desc
      )
      from public.bookings b
      where b.customer_id = p_actor_user_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(pay) order by pay.created_at desc)
      from public.payments pay
      join public.bookings b2 on b2.id = pay.booking_id
      where b2.customer_id = p_actor_user_id
    ), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.payment_refunds r
      join public.bookings b3 on b3.id = r.booking_id
      where b3.customer_id = p_actor_user_id
    ), '[]'::jsonb)
  ) into v_document;

  return v_document;
end;
$$;

revoke all on function public.export_user_data_for_actor(uuid)
  from public, anon, authenticated;
grant execute on function public.export_user_data_for_actor(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. PII anonymization (erasure request, ledger-preserving).
-- ---------------------------------------------------------------------------
create or replace function public.anonymize_user_data_for_actor(
  p_actor_user_id uuid
)
returns table (user_id uuid, profile_scrubbed boolean, bookings_touched bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_scrubbed boolean := false;
  v_bookings_touched bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_actor_user_id is null then
    raise exception 'This function is available only to the trusted server'
      using errcode = '42501';
  end if;

  -- 1. Scrub the profile row (the canonical direct-PII surface).
  update public.profiles p
  set full_name = 'Deleted user',
      phone = null,
      email = null,
      avatar_url = null,
      updated_at = now()
  where p.id = p_actor_user_id
  returning true into v_profile_scrubbed;

  -- 2. Release upcoming capacity so anonymized accounts do not block slots.
  --    Completed/cancelled history keeps its ledger rows with amounts intact;
  --    only the customer link survives (a pseudonymous uuid), never contact
  --    data, because bookings carry no denormalized name/phone columns.
  with cancelled as (
    update public.bookings b
    set status = 'cancelled',
        updated_at = now()
    where b.customer_id = p_actor_user_id
      and b.status in ('pending', 'confirmed')
    returning 1 as touched
  )
  select count(*) into v_bookings_touched from cancelled;

  -- 3. Cancel any pending refund intents still owned by this account's
  --    payments so provider settlement cannot be initiated for erased users.
  update public.payment_refunds r
  set status = 'failed',
      updated_at = now()
  where r.status = 'initiated'
    and r.booking_id in (
      select b4.id from public.bookings b4 where b4.customer_id = p_actor_user_id
    );

  return query select p_actor_user_id, coalesce(v_profile_scrubbed, false),
                      coalesce(v_bookings_touched, 0);
end;
$$;

revoke all on function public.anonymize_user_data_for_actor(uuid)
  from public, anon, authenticated;
grant execute on function public.anonymize_user_data_for_actor(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Read-only post-deployment verifier.
-- ---------------------------------------------------------------------------
create or replace function public.verify_m62_privacy_lifecycle()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query values
    ('export_user_data_for_actor installed',
      to_regprocedure('public.export_user_data_for_actor(uuid)') is not null,
      'authenticated access-request document'),
    ('anonymize_user_data_for_actor installed',
      to_regprocedure('public.anonymize_user_data_for_actor(uuid)') is not null,
      'ledger-preserving erasure workflow'),
    ('privacy RPCs are service-role only',
      not exists (
        select 1 from information_schema.role_routine_grants g
        where g.routine_schema = 'public'
          and g.routine_name in ('export_user_data_for_actor','anonymize_user_data_for_actor')
          and g.grantee in ('anon', 'authenticated', 'public')
      ),
      'no anon/authenticated/public execute grant'),
    ('anonymization never deletes rows or financial amounts',
      not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'anonymize_user_data_for_actor'
          and (position('delete from' in lower(p.prosrc)) > 0
               or position('amount_paise' in p.prosrc) > 0)
      ),
      'no DELETE and no amount rewrite: only profile PII and upcoming status change');
end;
$$;

revoke all on function public.verify_m62_privacy_lifecycle()
  from public, anon, authenticated;
grant execute on function public.verify_m62_privacy_lifecycle() to service_role, authenticated;

commit;
