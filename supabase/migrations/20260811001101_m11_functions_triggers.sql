-- M11 (DRAFT): shared helpers, controlled RPCs and integrity triggers
-- Razorpay signature verification remains in trusted server/Edge code; only a
-- verified result may be passed to verify_payment(). No secret is stored in DB.
-- NOT applied to any database. M02 must be finalized first.

begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.calculate_advance_paise(total_paise bigint)
returns bigint
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select (total_paise + 3) / 4
$$;

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  )
$$;

create or replace function public.has_business_role(
  target_business_id uuid,
  allowed_roles public.nexora_access_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.access_role = any(allowed_roles)
  )
$$;

create or replace function public.is_published_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.website_settings ws
    join public.businesses b on b.id = ws.business_id
    where ws.business_id = target_business_id
      and ws.publish_status = 'published'
      and b.status = 'active'
  )
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, mobile, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.phone, new.raw_user_meta_data ->> 'mobile'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, profiles.email),
        mobile = coalesce(excluded.mobile, profiles.mobile),
        full_name = coalesce(excluded.full_name, profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end
$$;

create or replace function public.default_website_template(business_type text)
returns public.nexora_website_template
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(coalesce(business_type, '')) ~ '(barber|groom)' then 'barber'::public.nexora_website_template
    when lower(coalesce(business_type, '')) ~ '(hair|unisex)' then 'hair_unisex'::public.nexora_website_template
    else 'beauty_wellness'::public.nexora_website_template
  end
$$;

create or replace function public.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.business_members (business_id, user_id, access_role, status)
  values (new.id, new.created_by, 'owner_admin', 'active')
  on conflict (business_id, user_id) do update
    set access_role = 'owner_admin', status = 'active';

  insert into public.booking_settings (business_id)
  values (new.id) on conflict (business_id) do nothing;
  insert into public.contact_settings (business_id)
  values (new.id) on conflict (business_id) do nothing;
  insert into public.website_settings (business_id, template_id)
  values (new.id, public.default_website_template(new.business_type))
  on conflict (business_id) do nothing;
  insert into public.onboarding_progress (business_id, user_id)
  values (new.id, new.created_by) on conflict (business_id) do nothing;
  insert into public.business_draft_state (business_id)
  values (new.id) on conflict (business_id) do nothing;
  insert into public.business_plans (business_id)
  values (new.id) on conflict (business_id) do nothing;
  insert into public.notification_settings (business_id, user_id)
  values (new.id, new.created_by) on conflict (business_id, user_id) do nothing;

  for i in 0..6 loop
    insert into public.booking_day_settings (business_id, day_of_week)
    values (new.id, i) on conflict (business_id, day_of_week) do nothing;
  end loop;

  return new;
end
$$;

create or replace function public.protect_staff_access_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Trusted service-role operations have no end-user auth.uid(). An end user
  -- may alter identity/access/payroll fields only as an owner_admin; this
  -- prevents a provider editing their own row into an owner membership.
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.app_access_role in ('owner_admin', 'manager')
        and not public.has_business_role(new.business_id, array['owner_admin']::public.nexora_access_role[]) then
        raise exception 'Only an owner_admin may assign owner/admin staff access';
      end if;
    elsif old.business_id is distinct from new.business_id
      or old.auth_user_id is distinct from new.auth_user_id
      or old.app_access_role is distinct from new.app_access_role
      or old.commission_percent is distinct from new.commission_percent then
      if not public.has_business_role(old.business_id, array['owner_admin']::public.nexora_access_role[]) then
        raise exception 'Only an owner_admin may change staff tenant, identity, access role or commission';
      end if;
    end if;
  end if;
  return new;
end
$$;

create or replace function public.sync_staff_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.auth_user_id is not null and new.app_access_role is not null then
    insert into public.business_members (business_id, user_id, access_role, status)
    values (new.business_id, new.auth_user_id, new.app_access_role, 'active')
    on conflict (business_id, user_id) do update
      set access_role = excluded.access_role,
          status = 'active'
      where business_members.access_role <> 'owner_admin';
  end if;
  return new;
end
$$;

create or replace function public.enforce_same_business()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  left_business uuid;
  right_business uuid;
begin
  if tg_table_name = 'package_services' then
    select business_id into left_business from public.packages where id = new.package_id;
    select business_id into right_business from public.services where id = new.service_id;
  elsif tg_table_name = 'staff_services' then
    select business_id into left_business from public.staff_members where id = new.staff_id;
    select business_id into right_business from public.services where id = new.service_id;
  elsif tg_table_name = 'bookings' then
    select business_id into right_business from public.customers where id = new.customer_id;
    if right_business is distinct from new.business_id then
      raise exception 'Customer and booking must belong to the same business';
    end if;
    if new.service_id is not null and not exists (
      select 1 from public.services where id = new.service_id and business_id = new.business_id
    ) then raise exception 'Service and booking must belong to the same business'; end if;
    if new.package_id is not null and not exists (
      select 1 from public.packages where id = new.package_id and business_id = new.business_id
    ) then raise exception 'Package and booking must belong to the same business'; end if;
    if new.staff_id is not null and not exists (
      select 1 from public.staff_members where id = new.staff_id and business_id = new.business_id
    ) then raise exception 'Staff and booking must belong to the same business'; end if;
    return new;
  elsif tg_table_name = 'booking_slot_holds' then
    if not exists (select 1 from public.services where id = new.service_id and business_id = new.business_id) then
      raise exception 'Service and slot hold must belong to the same business';
    end if;
    if new.staff_id is not null and not exists (
      select 1 from public.staff_members where id = new.staff_id and business_id = new.business_id
    ) then raise exception 'Staff and slot hold must belong to the same business'; end if;
    return new;
  elsif tg_table_name = 'payment_orders' then
    select business_id into right_business from public.bookings where id = new.booking_id;
    left_business := new.business_id;
  elsif tg_table_name = 'payments' then
    if not exists (
      select 1 from public.bookings b
      join public.payment_orders po on po.id = new.payment_order_id
      where b.id = new.booking_id
        and b.business_id = new.business_id
        and po.booking_id = new.booking_id
        and po.business_id = new.business_id
    ) then raise exception 'Payment, order and booking must belong to the same business'; end if;
    return new;
  elsif tg_table_name = 'balance_collections' then
    select business_id into right_business from public.bookings where id = new.booking_id;
    left_business := new.business_id;
  elsif tg_table_name = 'referral_events' then
    select business_id into right_business from public.referral_codes where id = new.referral_code_id;
    left_business := new.source_business_id;
  elsif tg_table_name in ('notification_settings', 'notifications') then
    if not exists (
      select 1 from public.business_members
      where business_id = new.business_id and user_id = new.user_id and status = 'active'
    ) then raise exception 'Notification user must be an active member of the business'; end if;
    return new;
  elsif tg_table_name = 'onboarding_progress' then
    if not exists (
      select 1 from public.business_members
      where business_id = new.business_id and user_id = new.user_id and status = 'active'
    ) then raise exception 'Onboarding user must be an active member of the business'; end if;
    return new;
  end if;

  if left_business is null or right_business is null or left_business <> right_business then
    raise exception 'Cross-business relationship rejected on %', tg_table_name;
  end if;
  return new;
end
$$;

create or replace function public.record_booking_status_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.booking_status is distinct from new.booking_status then
    insert into public.booking_status_history (booking_id, old_status, new_status, changed_by)
    values (new.id, old.booking_status, new.booking_status, auth.uid());
  end if;
  return new;
end
$$;

create or replace function public.protect_booking_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.service_name_snapshot is distinct from new.service_name_snapshot
    or old.service_price_paise is distinct from new.service_price_paise
    or old.duration_minutes is distinct from new.duration_minutes
    or old.advance_paise is distinct from new.advance_paise
    or old.remaining_paise is distinct from new.remaining_paise then
    raise exception 'Booking snapshot and 25%% amount fields are immutable';
  end if;
  return new;
end
$$;

create or replace function public.enforce_plan_entitlements()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  plan public.business_plans%rowtype;
begin
  select * into plan from public.business_plans where business_id = new.business_id;
  if new.nexora_branding_visible = false
    and coalesce(plan.white_label_enabled and plan.hide_nexora_branding, false) = false then
    raise exception 'Current plan does not allow Nexora branding removal';
  end if;
  if new.referral_badge_visible = false
    and coalesce(plan.referral_badge_can_hide, false) = false then
    raise exception 'Current plan does not allow referral badge removal';
  end if;
  if new.custom_domain is not null
    and coalesce(plan.custom_domain_enabled, false) = false then
    raise exception 'Current plan does not allow a custom domain';
  end if;
  return new;
end
$$;

create or replace function public.is_slot_available(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  weekday integer := extract(dow from p_appointment_date)::integer;
  settings public.booking_settings%rowtype;
begin
  if p_end_time <= p_start_time then return false; end if;
  if not exists (
    select 1 from public.services
    where id = p_service_id and business_id = p_business_id and status = 'active'
  ) then return false; end if;

  select * into settings from public.booking_settings where business_id = p_business_id;
  if settings.business_id is not null then
    if p_appointment_date > current_date + settings.maximum_advance_days then return false; end if;
    if (p_appointment_date + p_start_time) < now() + make_interval(mins => settings.minimum_notice_minutes) then
      return false;
    end if;
  end if;

  if exists (
    select 1 from public.booking_day_settings
    where business_id = p_business_id and day_of_week = weekday and not booking_enabled
  ) then return false; end if;

  if not exists (
    select 1 from public.business_hours
    where business_id = p_business_id and day_of_week = weekday and is_open
      and open_time <= p_start_time and close_time >= p_end_time
  ) then return false; end if;

  if p_staff_id is not null then
    if not exists (
      select 1 from public.staff_members sm
      join public.staff_services ss on ss.staff_id = sm.id and ss.service_id = p_service_id
      join public.staff_schedules sch on sch.staff_id = sm.id and sch.day_of_week = weekday
      where sm.id = p_staff_id and sm.business_id = p_business_id
        and sm.status = 'available' and sch.is_working
        and sch.start_time <= p_start_time and sch.end_time >= p_end_time
    ) then return false; end if;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.business_id = p_business_id
      and b.appointment_date = p_appointment_date
      and (p_staff_id is null or b.staff_id = p_staff_id)
      and b.booking_status in ('pending_payment', 'confirmed', 'upcoming', 'in_progress')
      and b.id is distinct from p_exclude_booking_id
      and b.start_time < p_end_time
      and coalesce(b.end_time, b.start_time + make_interval(mins => coalesce(b.duration_minutes, 0))) > p_start_time
  ) then return false; end if;

  if exists (
    select 1 from public.booking_slot_holds h
    where h.business_id = p_business_id
      and h.appointment_date = p_appointment_date
      and (p_staff_id is null or h.staff_id = p_staff_id)
      and h.expires_at > now()
      and h.start_time < p_end_time and h.end_time > p_start_time
  ) then return false; end if;

  return true;
end
$$;

create or replace function public.get_available_slots(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_appointment_date date
)
returns table(start_time time, end_time time)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select candidate::time,
         (candidate + make_interval(mins => s.duration_minutes))::time
  from public.services s
  join public.business_hours bh
    on bh.business_id = s.business_id
   and bh.day_of_week = extract(dow from p_appointment_date)::integer
   and bh.is_open
  cross join lateral generate_series(
    p_appointment_date + bh.open_time,
    p_appointment_date + bh.close_time - make_interval(mins => s.duration_minutes),
    interval '30 minutes'
  ) candidate
  where s.id = p_service_id and s.business_id = p_business_id and s.status = 'active'
    and (public.is_published_business(p_business_id) or public.is_business_member(p_business_id))
    and public.is_slot_available(
      p_business_id, p_service_id, p_staff_id, p_appointment_date,
      candidate::time,
      (candidate + make_interval(mins => s.duration_minutes))::time,
      null
    )
  order by candidate
$$;

create or replace function public.create_payment_order(
  p_booking_id uuid,
  p_provider_order_id text
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking public.bookings%rowtype;
  result public.payment_orders%rowtype;
  expected_advance bigint;
begin
  if p_provider_order_id is null or btrim(p_provider_order_id) = '' then
    raise exception 'Provider order id is required';
  end if;

  select * into booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    booking.business_id::text || ':' || coalesce(booking.staff_id::text, '-') || ':' ||
    booking.appointment_date::text || ':' || booking.start_time::text, 0
  ));

  if not public.is_slot_available(
    booking.business_id, booking.service_id, booking.staff_id,
    booking.appointment_date, booking.start_time,
    coalesce(booking.end_time, booking.start_time + make_interval(mins => booking.duration_minutes)),
    booking.id
  ) then raise exception 'Booking slot is no longer available'; end if;

  expected_advance := public.calculate_advance_paise(booking.service_price_paise);
  if booking.advance_paise <> expected_advance then
    raise exception 'Booking advance does not equal the fixed 25%% amount';
  end if;

  insert into public.payment_orders (
    business_id, booking_id, provider_order_id, amount_paise
  ) values (
    booking.business_id, booking.id, p_provider_order_id, expected_advance
  )
  on conflict (provider_order_id) do update
    set provider_order_id = excluded.provider_order_id
  returning * into result;

  if result.booking_id <> booking.id or result.amount_paise <> expected_advance then
    raise exception 'Provider order id is already bound to different checkout data';
  end if;
  return result;
end
$$;

create or replace function public.verify_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise bigint,
  p_payment_method text,
  p_signature_verified boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_order public.payment_orders%rowtype;
  booking public.bookings%rowtype;
  existing_payment public.payments%rowtype;
  payment_id uuid;
  was_verified boolean := false;
begin
  if not coalesce(p_signature_verified, false) then
    raise exception 'Payment signature was not verified by trusted server code';
  end if;
  select * into payment_order
  from public.payment_orders where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'Payment order not found'; end if;
  if payment_order.amount_paise <> p_amount_paise then raise exception 'Payment amount mismatch'; end if;

  select * into booking from public.bookings where id = payment_order.booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    booking.business_id::text || ':' || coalesce(booking.staff_id::text, '-') || ':' ||
    booking.appointment_date::text || ':' || booking.start_time::text, 0
  ));

  select * into existing_payment
  from public.payments where provider_payment_id = p_provider_payment_id for update;
  if found then
    if existing_payment.payment_order_id <> payment_order.id
      or existing_payment.amount_paise <> p_amount_paise then
      raise exception 'Provider payment id is already bound to different checkout data';
    end if;
    was_verified := existing_payment.verification_status = 'verified';
    payment_id := existing_payment.id;
  else
    insert into public.payments (
      business_id, booking_id, payment_order_id, provider_payment_id,
      amount_paise, payment_method, payment_status, verification_status
    ) values (
      booking.business_id, booking.id, payment_order.id, p_provider_payment_id,
      p_amount_paise, p_payment_method, 'pending', 'pending'
    ) returning id into payment_id;
  end if;

  if not was_verified then
    update public.payments
      set payment_status = 'verified', verification_status = 'verified', verified_at = now()
      where id = payment_id;
    update public.payment_orders set status = 'paid' where id = payment_order.id;
    update public.bookings
      set booking_status = 'confirmed', payment_status = 'partially_paid'
      where id = booking.id and booking_status = 'pending_payment';
    delete from public.booking_slot_holds h
      where h.business_id = booking.business_id
        and h.appointment_date = booking.appointment_date
        and (booking.staff_id is null or h.staff_id = booking.staff_id)
        and h.start_time < coalesce(booking.end_time, booking.start_time + make_interval(mins => booking.duration_minutes))
        and h.end_time > booking.start_time;
    insert into public.business_activity (
      business_id, event_type, entity_type, entity_id, metadata
    ) values (
      booking.business_id, 'payment_verified', 'payment', payment_id,
      jsonb_build_object('booking_id', booking.id, 'amount_paise', p_amount_paise)
    );
  end if;

  return booking.id;
end
$$;

create or replace function public.collect_booking_balance(
  p_booking_id uuid,
  p_amount_paise bigint,
  p_payment_method text,
  p_idempotency_key text,
  p_collected_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking public.bookings%rowtype;
  collected bigint;
  result_id uuid;
begin
  if p_amount_paise <= 0 or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Positive amount and idempotency key are required';
  end if;
  select * into booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  select id into result_id from public.balance_collections
    where business_id = booking.business_id and idempotency_key = p_idempotency_key;
  if result_id is not null then return result_id; end if;

  select coalesce(sum(amount_paise), 0) into collected
    from public.balance_collections where booking_id = booking.id;
  if collected + p_amount_paise > booking.remaining_paise then
    raise exception 'Balance collection exceeds remaining amount';
  end if;

  insert into public.balance_collections (
    business_id, booking_id, amount_paise, payment_method, collected_by, idempotency_key
  ) values (
    booking.business_id, booking.id, p_amount_paise, p_payment_method, p_collected_by, p_idempotency_key
  ) returning id into result_id;

  update public.bookings set balance_status = case
    when collected + p_amount_paise = remaining_paise then 'paid'::public.nexora_balance_status
    else 'partially_paid'::public.nexora_balance_status end
  where id = booking.id;
  return result_id;
end
$$;

create or replace function public.record_referral_event(
  p_code text,
  p_visitor_token text,
  p_event_type public.nexora_referral_event_type,
  p_referred_business_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  referral public.referral_codes%rowtype;
  result_id uuid;
begin
  select * into referral from public.referral_codes
    where code = p_code and is_active;
  if not found then raise exception 'Active referral code not found'; end if;
  insert into public.referral_events (
    referral_code_id, source_business_id, visitor_token, event_type, referred_business_id
  ) values (
    referral.id, referral.business_id, p_visitor_token, p_event_type, p_referred_business_id
  )
  on conflict (referral_code_id, visitor_token, event_type) do update
    set referred_business_id = coalesce(referral_events.referred_business_id, excluded.referred_business_id)
  returning id into result_id;
  return result_id;
end
$$;

create or replace function public.publish_business_website(
  p_business_id uuid,
  p_slug text
)
returns public.website_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.website_settings%rowtype;
begin
  if not public.has_business_role(
    p_business_id, array['owner_admin', 'manager']::public.nexora_access_role[]
  ) then raise exception 'Not authorized to publish this business'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid website slug'; end if;

  update public.website_settings
    set slug = p_slug, publish_status = 'published',
        published_at = coalesce(published_at, now())
    where business_id = p_business_id
    returning * into result;
  if not found then raise exception 'Website settings not found'; end if;

  insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id)
  select p_business_id, auth.uid(), 'website_published', 'website_settings', result.id
  where not exists (
    select 1 from public.business_activity
    where business_id = p_business_id and event_type = 'website_published' and entity_id = result.id
  );
  return result;
end
$$;

create or replace function public.get_public_website_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'business_type', b.business_type,
      'tagline', b.tagline, 'about', b.about,
      'phone', case when cs.show_call then b.phone end,
      'whatsapp', case when cs.show_whatsapp then b.whatsapp end,
      'email', b.email, 'logo_url', b.logo_url, 'hero_image_url', b.hero_image_url,
      'timezone', b.timezone, 'currency', b.currency
    ),
    'owner', coalesce((
      select jsonb_build_object('name', bo.name, 'photo_url', bo.photo_url, 'role_title', bo.role_title, 'bio', bo.bio)
      from public.business_owners bo where bo.business_id = b.id
    ), '{}'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'category', s.category,
        'price_paise', s.price_paise, 'duration_minutes', s.duration_minutes,
        'short_description', s.short_description, 'is_featured', s.is_featured
      ) order by s.display_order, s.name)
      from public.services s where s.business_id = b.id and s.status = 'active'
    ), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'price_paise', p.price_paise,
        'duration_minutes', p.duration_minutes, 'description', p.description, 'is_featured', p.is_featured
      ) order by p.display_order, p.name)
      from public.packages p where p.business_id = b.id and p.status = 'active'
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', sm.id, 'full_name', sm.full_name, 'photo_url', sm.photo_url,
        'primary_role', sm.primary_role,
        'mobile', case when not sm.hide_mobile_public then sm.mobile end
      )) order by sm.display_order, sm.full_name)
      from public.staff_members sm
      where sm.business_id = b.id and sm.is_public and sm.status = 'available'
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'media_type', m.media_type, 'public_url', m.public_url,
        'category', m.category, 'display_order', m.display_order
      ) order by m.display_order)
      from public.business_media m where m.business_id = b.id
    ), '[]'::jsonb),
    'social_profiles', coalesce((
      select jsonb_agg(jsonb_build_object('platform', sp.platform, 'profile_url', sp.profile_url, 'username', sp.username))
      from public.social_profiles sp where sp.business_id = b.id and sp.is_active
    ), '[]'::jsonb),
    'social_videos', coalesce((
      select jsonb_agg(jsonb_build_object('platform', sv.platform, 'video_url', sv.video_url, 'caption', sv.caption) order by sv.display_order)
      from public.social_videos sv where sv.business_id = b.id and sv.status = 'active'
    ), '[]'::jsonb),
    'location', coalesce((
      select to_jsonb(bl) - 'id' - 'business_id' - 'google_place_id' - 'created_at' - 'updated_at'
      from public.business_locations bl where bl.business_id = b.id
    ), '{}'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week', bh.day_of_week, 'is_open', bh.is_open,
        'open_time', bh.open_time, 'close_time', bh.close_time
      ) order by bh.day_of_week)
      from public.business_hours bh where bh.business_id = b.id
    ), '[]'::jsonb),
    'contact', jsonb_build_object(
      'show_call', cs.show_call, 'show_whatsapp', cs.show_whatsapp,
      'show_book_now', cs.show_book_now, 'booking_note', cs.booking_note
    ),
    'website', jsonb_build_object(
      'template_id', ws.template_id, 'appearance', ws.appearance, 'slug', ws.slug,
      'referral_badge_visible', case when bp.referral_badge_can_hide then ws.referral_badge_visible else true end,
      'nexora_branding_visible', case when bp.white_label_enabled and bp.hide_nexora_branding then ws.nexora_branding_visible else true end,
      'custom_domain', case when bp.custom_domain_enabled then ws.custom_domain end,
      'favicon_url', ws.favicon_url
    ),
    'content', coalesce((
      select to_jsonb(wc) - 'id' - 'business_id' - 'created_at' - 'updated_at'
      from public.website_content wc where wc.business_id = b.id
    ), '{}'::jsonb)
  )
  from public.website_settings ws
  join public.businesses b on b.id = ws.business_id and b.status = 'active'
  left join public.contact_settings cs on cs.business_id = b.id
  left join public.business_plans bp on bp.business_id = b.id and bp.status = 'active'
  where ws.slug = p_slug and ws.publish_status = 'published'
$$;

create or replace function public.get_dashboard_overview(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_business_member(p_business_id) then jsonb_build_object(
    'active_services', (select count(*) from public.services where business_id = p_business_id and status = 'active'),
    'available_staff', (select count(*) from public.staff_members where business_id = p_business_id and status = 'available'),
    'upcoming_bookings', (select count(*) from public.bookings where business_id = p_business_id and booking_status in ('confirmed', 'upcoming')),
    'unread_notifications', (select count(*) from public.notifications where business_id = p_business_id and user_id = auth.uid() and not is_read)
  ) else null end
$$;

create or replace function public.get_payments_revenue(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.has_business_role(
    p_business_id, array['owner_admin', 'manager']::public.nexora_access_role[]
  ) then jsonb_build_object(
    'verified_advance_paise', coalesce((select sum(amount_paise) from public.payments where business_id = p_business_id and payment_status = 'verified' and verification_status = 'verified'), 0),
    'balance_collected_paise', coalesce((select sum(amount_paise) from public.balance_collections where business_id = p_business_id), 0),
    'booking_value_paise', coalesce((select sum(service_price_paise) from public.bookings where business_id = p_business_id and booking_status not in ('cancelled', 'expired')), 0),
    'remaining_due_paise', coalesce((select sum(remaining_paise) from public.bookings where business_id = p_business_id and balance_status <> 'paid' and booking_status not in ('cancelled', 'expired')), 0)
  ) else null end
$$;

-- Trigger installation is replay-safe: drop the named trigger, then recreate it.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, phone, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_business_created on public.businesses;
create trigger on_business_created
after insert on public.businesses
for each row execute function public.handle_new_business();

drop trigger if exists protect_staff_access_fields on public.staff_members;
create trigger protect_staff_access_fields
before insert or update on public.staff_members
for each row execute function public.protect_staff_access_fields();
drop trigger if exists sync_staff_access on public.staff_members;
create trigger sync_staff_access
after insert or update of auth_user_id, app_access_role on public.staff_members
for each row execute function public.sync_staff_membership();

drop trigger if exists enforce_package_service_business on public.package_services;
create trigger enforce_package_service_business before insert or update on public.package_services
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_staff_service_business on public.staff_services;
create trigger enforce_staff_service_business before insert or update on public.staff_services
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_booking_business on public.bookings;
create trigger enforce_booking_business before insert or update on public.bookings
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_hold_business on public.booking_slot_holds;
create trigger enforce_hold_business before insert or update on public.booking_slot_holds
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_payment_order_business on public.payment_orders;
create trigger enforce_payment_order_business before insert or update on public.payment_orders
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_payment_business on public.payments;
create trigger enforce_payment_business before insert or update on public.payments
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_balance_business on public.balance_collections;
create trigger enforce_balance_business before insert or update on public.balance_collections
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_referral_business on public.referral_events;
create trigger enforce_referral_business before insert or update on public.referral_events
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_notification_settings_business on public.notification_settings;
create trigger enforce_notification_settings_business before insert or update on public.notification_settings
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_notifications_business on public.notifications;
create trigger enforce_notifications_business before insert or update on public.notifications
for each row execute function public.enforce_same_business();
drop trigger if exists enforce_onboarding_business on public.onboarding_progress;
create trigger enforce_onboarding_business before insert or update on public.onboarding_progress
for each row execute function public.enforce_same_business();

drop trigger if exists booking_snapshot_immutable on public.bookings;
create trigger booking_snapshot_immutable before update on public.bookings
for each row execute function public.protect_booking_snapshot();
drop trigger if exists booking_status_audit on public.bookings;
create trigger booking_status_audit after update of booking_status on public.bookings
for each row execute function public.record_booking_status_history();
drop trigger if exists website_plan_entitlements on public.website_settings;
create trigger website_plan_entitlements before insert or update on public.website_settings
for each row execute function public.enforce_plan_entitlements();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'businesses', 'business_members', 'business_owners',
    'services', 'packages', 'staff_members', 'staff_schedules', 'staff_permissions',
    'social_profiles', 'social_videos', 'business_locations', 'business_hours',
    'contact_settings', 'booking_settings', 'booking_day_settings',
    'website_settings', 'website_content', 'onboarding_progress', 'business_draft_state',
    'customers', 'bookings', 'payment_orders', 'payments',
    'notification_settings', 'business_plans'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid, public.nexora_access_role[]) from public;
revoke all on function public.is_published_business(uuid) from public;
revoke all on function public.is_slot_available(uuid, uuid, uuid, date, time, time, uuid) from public;
revoke all on function public.get_available_slots(uuid, uuid, uuid, date) from public;
revoke all on function public.create_payment_order(uuid, text) from public;
revoke all on function public.verify_payment(text, text, bigint, text, boolean) from public;
revoke all on function public.collect_booking_balance(uuid, bigint, text, text, uuid) from public;
revoke all on function public.record_referral_event(text, text, public.nexora_referral_event_type, uuid) from public;
revoke all on function public.publish_business_website(uuid, text) from public;
revoke all on function public.get_public_website_by_slug(text) from public;
revoke all on function public.get_dashboard_overview(uuid) from public;
revoke all on function public.get_payments_revenue(uuid) from public;

grant execute on function public.is_business_member(uuid) to authenticated, service_role;
grant execute on function public.has_business_role(uuid, public.nexora_access_role[]) to authenticated, service_role;
grant execute on function public.is_published_business(uuid) to anon, authenticated, service_role;
grant execute on function public.is_slot_available(uuid, uuid, uuid, date, time, time, uuid) to authenticated, service_role;
grant execute on function public.get_available_slots(uuid, uuid, uuid, date) to anon, authenticated, service_role;
grant execute on function public.create_payment_order(uuid, text) to service_role;
grant execute on function public.verify_payment(text, text, bigint, text, boolean) to service_role;
grant execute on function public.collect_booking_balance(uuid, bigint, text, text, uuid) to service_role;
grant execute on function public.record_referral_event(text, text, public.nexora_referral_event_type, uuid) to service_role;
grant execute on function public.publish_business_website(uuid, text) to authenticated, service_role;
grant execute on function public.get_public_website_by_slug(text) to anon, authenticated, service_role;
grant execute on function public.get_dashboard_overview(uuid) to authenticated, service_role;
grant execute on function public.get_payments_revenue(uuid) to authenticated, service_role;

commit;
