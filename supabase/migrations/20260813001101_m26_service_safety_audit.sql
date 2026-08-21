-- M26 (DRAFT) / Phase 9.3: booking safety lock, salon audit trail, and
-- theme/tenant integrity helpers. Existing rows are never deleted or re-linked.
-- NOT applied to any database.

begin;

-- ---------------------------------------------------------------------------
-- Safety snapshot. Appointments stay intact; this only reports blockers.
-- ---------------------------------------------------------------------------
create or replace function public.nexora_service_safety_lock(p_service_id uuid, p_business_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'service_id', p_service_id,
    'upcoming_appointments', (
      select count(*)::int from public.bookings b
      where b.service_id = p_service_id
        and b.business_id = p_business_id
        and b.appointment_date >= current_date
        and b.booking_status in ('pending_payment', 'confirmed', 'upcoming', 'in_progress')
    ),
    'active_bookings', (
      select count(*)::int from public.bookings b
      where b.service_id = p_service_id
        and b.business_id = p_business_id
        and b.booking_status in ('pending_payment', 'confirmed', 'upcoming', 'in_progress')
    ),
    'pending_transactions', (
      select count(*)::int from public.payments p
      join public.bookings b on b.id = p.booking_id and b.business_id = p.business_id
      where b.service_id = p_service_id
        and p.business_id = p_business_id
        and (
          p.payment_status = 'pending'
          or p.verification_status = 'pending'
          or b.payment_status = 'pending'
        )
    ),
    'package_links', (
      select count(*)::int from public.package_services ps
      join public.packages pkg on pkg.id = ps.package_id
      where ps.service_id = p_service_id
        and pkg.business_id = p_business_id
    )
  )
$$;

create or replace function public.get_service_safety_lock(p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  lock jsonb;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.business_id = target_business_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  lock := public.nexora_service_safety_lock(p_service_id, target_business_id);
  return lock || jsonb_build_object(
    'locked', (
      (lock ->> 'upcoming_appointments')::int > 0
      or (lock ->> 'active_bookings')::int > 0
      or (lock ->> 'pending_transactions')::int > 0
    ),
    'can_delete', (
      (lock ->> 'upcoming_appointments')::int = 0
      and (lock ->> 'active_bookings')::int = 0
      and (lock ->> 'pending_transactions')::int = 0
      and (lock ->> 'package_links')::int = 0
    )
  );
end
$$;

create or replace function public.nexora_assert_service_unlocked(
  p_service_id uuid,
  p_business_id uuid,
  p_action text
)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  lock jsonb := public.nexora_service_safety_lock(p_service_id, p_business_id);
begin
  if (lock ->> 'upcoming_appointments')::int > 0
     or (lock ->> 'active_bookings')::int > 0
     or (lock ->> 'pending_transactions')::int > 0 then
    raise exception using
      errcode = '23503',
      message = format(
        'This service has %s upcoming appointment(s), %s active booking(s), and %s pending transaction(s). Archive it instead of a silent %s. Existing appointments are unchanged.',
        lock ->> 'upcoming_appointments',
        lock ->> 'active_bookings',
        lock ->> 'pending_transactions',
        p_action
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Replace delete / status paths with booking-safe behaviour.
-- ---------------------------------------------------------------------------
create or replace function public.delete_saved_service(p_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  deleted_id uuid;
  lock jsonb;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.business_id = target_business_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  lock := public.nexora_service_safety_lock(p_service_id, target_business_id);
  if (lock ->> 'package_links')::int > 0 then
    raise exception using errcode = '23503',
      message = 'Remove this service from its package before deleting it.';
  end if;
  perform public.nexora_assert_service_unlocked(p_service_id, target_business_id, 'delete');

  delete from public.staff_services ss
  using public.staff_members sm
  where ss.service_id = p_service_id
    and ss.staff_id = sm.id
    and sm.business_id = target_business_id;

  delete from public.services s
  where s.id = p_service_id
    and s.business_id = target_business_id
  returning s.id into deleted_id;

  if deleted_id is null then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;
  return deleted_id;
end
$$;

create or replace function public.set_saved_service_status(
  p_service_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_status public.nexora_catalog_status := public.nexora_saved_service_status(p_status);
  updated_id uuid;
begin
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.business_id = target_business_id
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  if target_status = 'inactive' then
    perform public.nexora_assert_service_unlocked(p_service_id, target_business_id, 'deactivate');
  end if;

  update public.services s
  set status = target_status
  where s.id = p_service_id
    and s.business_id = target_business_id
  returning s.id into updated_id;

  return public.nexora_saved_service_payload(updated_id);
end
$$;

create or replace function public.update_saved_service(
  p_service_id uuid,
  p_name text default null,
  p_description text default null,
  p_price_paise bigint default null,
  p_duration_minutes integer default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  existing public.services%rowtype;
  next_name text;
  next_status public.nexora_catalog_status;
begin
  select s.* into existing
  from public.services s
  where s.id = p_service_id
    and s.business_id = target_business_id;
  if not found then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  next_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), existing.name);
  if p_name is not null and btrim(p_name) = '' then
    raise exception using errcode = '22023', message = 'Service name is required.';
  end if;
  if p_price_paise is not null and p_price_paise < 0 then
    raise exception using errcode = '22023', message = 'Service price cannot be negative.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception using errcode = '22023', message = 'Service duration must be positive.';
  end if;

  next_status := case
    when p_status is null then existing.status
    else public.nexora_saved_service_status(p_status)
  end;

  if next_status = 'inactive' and existing.status is distinct from 'inactive' then
    perform public.nexora_assert_service_unlocked(p_service_id, target_business_id, 'deactivate');
  end if;

  if lower(next_name) <> lower(existing.name)
     and existing.theme_id is not null
     and next_status <> 'archived'
     and exists (
       select 1 from public.services s
       where s.business_id = target_business_id
         and s.theme_id = existing.theme_id
         and s.id <> existing.id
         and s.status <> 'archived'
         and lower(btrim(s.name)) = lower(btrim(next_name))
     ) then
    raise exception using
      errcode = '23505',
      message = 'A service with this name is already saved for this theme.';
  end if;

  update public.services s
  set name = next_name,
      short_description = coalesce(p_description, s.short_description),
      price_paise = coalesce(p_price_paise, s.price_paise),
      duration_minutes = coalesce(p_duration_minutes, s.duration_minutes),
      status = next_status
  where s.id = existing.id
    and s.business_id = target_business_id;

  return public.nexora_saved_service_payload(existing.id);
end
$$;

create or replace function public.archive_saved_service(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Archive is the safe path when bookings exist. Appointments are untouched.
  return public.set_saved_service_status(p_service_id, 'archived');
end
$$;

-- ---------------------------------------------------------------------------
-- Audit trail. Reuses business_activity (no parallel audit table).
-- ---------------------------------------------------------------------------
create or replace function public.nexora_record_service_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  action text;
  previous jsonb := '{}'::jsonb;
  next_value jsonb := '{}'::jsonb;
  actor uuid := (select p.id from public.profiles p where p.id = auth.uid());
begin
  if actor is not null and not exists (select 1 from public.profiles p where p.id = actor) then
    actor := null;
  end if;
  if tg_op = 'INSERT' then
    action := 'service_created';
    next_value := jsonb_build_object(
      'name', new.name, 'price_paise', new.price_paise,
      'duration_minutes', new.duration_minutes, 'description', new.short_description,
      'status', new.status, 'theme_id', new.theme_id
    );
    insert into public.business_activity (
      business_id, actor_user_id, event_type, entity_type, entity_id, metadata
    ) values (
      new.business_id, actor, action, 'service', new.id,
      jsonb_build_object('action', action, 'service_name', new.name, 'previous', previous, 'next', next_value)
    );
    return new;
  elsif tg_op = 'DELETE' then
    action := 'service_deleted';
    previous := jsonb_build_object(
      'name', old.name, 'price_paise', old.price_paise,
      'duration_minutes', old.duration_minutes, 'description', old.short_description,
      'status', old.status
    );
    insert into public.business_activity (
      business_id, actor_user_id, event_type, entity_type, entity_id, metadata
    ) values (
      old.business_id, actor, action, 'service', old.id,
      jsonb_build_object('action', action, 'service_name', old.name, 'previous', previous, 'next', next_value)
    );
    return old;
  end if;

  if old.price_paise is distinct from new.price_paise then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, actor, 'service_price_changed', 'service', new.id,
      jsonb_build_object('action', 'service_price_changed', 'service_name', new.name,
        'previous', jsonb_build_object('price_paise', old.price_paise),
        'next', jsonb_build_object('price_paise', new.price_paise)));
  end if;
  if old.duration_minutes is distinct from new.duration_minutes then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, actor, 'service_duration_changed', 'service', new.id,
      jsonb_build_object('action', 'service_duration_changed', 'service_name', new.name,
        'previous', jsonb_build_object('duration_minutes', old.duration_minutes),
        'next', jsonb_build_object('duration_minutes', new.duration_minutes)));
  end if;
  if old.short_description is distinct from new.short_description then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, actor, 'service_description_changed', 'service', new.id,
      jsonb_build_object('action', 'service_description_changed', 'service_name', new.name,
        'previous', jsonb_build_object('description', old.short_description),
        'next', jsonb_build_object('description', new.short_description)));
  end if;
  if old.status is distinct from new.status then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, (select p.id from public.profiles p where p.id = auth.uid()),
      case when new.status = 'archived' then 'service_archived' else 'service_status_changed' end,
      'service', new.id,
      jsonb_build_object('action', 'service_status_changed', 'service_name', new.name,
        'previous', jsonb_build_object('status', old.status),
        'next', jsonb_build_object('status', new.status)));
  end if;
  if old.name is distinct from new.name then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, actor, 'service_edited', 'service', new.id,
      jsonb_build_object('action', 'service_edited', 'service_name', new.name,
        'previous', jsonb_build_object('name', old.name),
        'next', jsonb_build_object('name', new.name)));
  end if;
  return new;
end
$$;

drop trigger if exists services_phase93_audit on public.services;
create trigger services_phase93_audit
after insert or update or delete on public.services
for each row execute function public.nexora_record_service_activity();

create or replace function public.nexora_record_offer_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, (select p.id from public.profiles p where p.id = auth.uid()), 'offer_created', 'offer', new.id,
      jsonb_build_object('action', 'offer_created', 'title', new.title,
        'previous', '{}'::jsonb,
        'next', jsonb_build_object('status', new.status, 'end_date', new.end_date)));
    return new;
  end if;
  if old.status is distinct from new.status or old.end_date is distinct from new.end_date then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, (select p.id from public.profiles p where p.id = auth.uid()),
      case when public.nexora_offer_effective_status(new.status, new.start_date, new.end_date) = 'expired'
        then 'offer_expired' else 'offer_changed' end,
      'offer', new.id,
      jsonb_build_object('action', 'offer_changed', 'title', new.title,
        'previous', jsonb_build_object('status', old.status, 'end_date', old.end_date),
        'next', jsonb_build_object('status', new.status, 'end_date', new.end_date)));
  end if;
  return new;
end
$$;

drop trigger if exists service_offers_phase93_audit on public.service_offers;
create trigger service_offers_phase93_audit
after insert or update on public.service_offers
for each row execute function public.nexora_record_offer_activity();

create or replace function public.nexora_record_combo_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, (select p.id from public.profiles p where p.id = auth.uid()), 'combo_changed', 'bundle', new.id,
      jsonb_build_object('action', 'combo_created', 'name', new.name,
        'previous', '{}'::jsonb, 'next', jsonb_build_object('price_paise', new.price_paise, 'status', new.status)));
    return new;
  end if;
  if old.price_paise is distinct from new.price_paise
     or old.status is distinct from new.status
     or old.name is distinct from new.name then
    insert into public.business_activity (business_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    values (new.business_id, (select p.id from public.profiles p where p.id = auth.uid()), 'combo_changed', 'bundle', new.id,
      jsonb_build_object('action', 'combo_changed', 'name', new.name,
        'previous', jsonb_build_object('price_paise', old.price_paise, 'status', old.status, 'name', old.name),
        'next', jsonb_build_object('price_paise', new.price_paise, 'status', new.status, 'name', new.name)));
  end if;
  return new;
end
$$;

drop trigger if exists packages_phase93_audit on public.packages;
create trigger packages_phase93_audit
after insert or update on public.packages
for each row execute function public.nexora_record_combo_activity();

create or replace function public.get_theme_service_audit(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_uuid uuid;
  rows jsonb;
begin
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'actor_user_id', a.actor_user_id,
    'action', coalesce(a.metadata ->> 'action', a.event_type),
    'entity_type', a.entity_type,
    'entity_id', a.entity_id,
    'service_name', a.metadata ->> 'service_name',
    'previous', a.metadata -> 'previous',
    'next', a.metadata -> 'next',
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into rows
  from public.business_activity a
  where a.business_id = target_business_id
    and a.event_type in (
      'service_created', 'service_edited', 'service_price_changed',
      'service_duration_changed', 'service_description_changed',
      'service_status_changed', 'service_archived', 'service_deleted',
      'offer_created', 'offer_changed', 'offer_expired', 'combo_changed'
    )
    and (
      a.entity_type <> 'service'
      or exists (
        select 1 from public.services s
        where s.id = a.entity_id and s.theme_id = target_theme_uuid
      )
      or (a.metadata -> 'next' ->> 'theme_id')::uuid = target_theme_uuid
    );

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'entries', rows
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Integrity: no cross-theme / cross-salon / orphan catalog links.
-- ---------------------------------------------------------------------------
create or replace function public.check_theme_service_integrity(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_uuid uuid;
  issues int := 0;
begin
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select count(*)::int into issues
  from public.services s
  where s.business_id = target_business_id
    and s.theme_id = target_theme_uuid
    and (
      s.category_id is null
      or not exists (
        select 1 from public.service_categories c
        where c.id = s.category_id and c.theme_id = s.theme_id
      )
      or (
        s.predefined_service_id is not null
        and not exists (
          select 1 from public.predefined_services ps
          where ps.id = s.predefined_service_id
            and ps.theme_id = s.theme_id
            and ps.category_id = s.category_id
        )
      )
    );

  issues := issues + (
    select count(*)::int from public.service_offers o
    where o.business_id = target_business_id
      and o.theme_id <> target_theme_uuid
      and (
        o.saved_service_id in (select id from public.services where business_id = target_business_id and theme_id = target_theme_uuid)
        or o.package_id in (select id from public.packages where business_id = target_business_id and theme_id = target_theme_uuid)
      )
  );

  issues := issues + (
    select count(*)::int from public.saved_service_media m
    join public.services s on s.id = m.service_id
    where m.business_id = target_business_id
      and (m.theme_id is distinct from s.theme_id or m.business_id is distinct from s.business_id)
  );

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'ok', issues = 0,
    'issue_count', issues
  );
end
$$;

revoke all on function public.nexora_service_safety_lock(uuid, uuid) from public;
revoke all on function public.get_service_safety_lock(uuid) from public;
revoke all on function public.nexora_assert_service_unlocked(uuid, uuid, text) from public;
revoke all on function public.archive_saved_service(uuid) from public;
revoke all on function public.get_theme_service_audit(text) from public;
revoke all on function public.check_theme_service_integrity(text) from public;

grant execute on function public.get_service_safety_lock(uuid) to authenticated, service_role;
grant execute on function public.archive_saved_service(uuid) to authenticated, service_role;
grant execute on function public.get_theme_service_audit(text) to authenticated, service_role;
grant execute on function public.check_theme_service_integrity(text) to authenticated, service_role;
grant execute on function public.delete_saved_service(uuid) to authenticated, service_role;
grant execute on function public.set_saved_service_status(uuid, text) to authenticated, service_role;

commit;
