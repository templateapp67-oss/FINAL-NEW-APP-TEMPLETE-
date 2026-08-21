-- M14 (DRAFT): query indexes and final concurrency constraints
-- Existing data must be checked for conflicts by finalized M02 before execution.
-- NOT applied to any database.

begin;

create index if not exists idx_business_members_user_active
  on public.business_members (user_id, business_id) where status = 'active';
create index if not exists idx_services_business_status_order
  on public.services (business_id, status, display_order);
create index if not exists idx_packages_business_status_order
  on public.packages (business_id, status, display_order);
create index if not exists idx_package_services_service
  on public.package_services (service_id, package_id);
create index if not exists idx_staff_members_business_status
  on public.staff_members (business_id, status, display_order);
create index if not exists idx_staff_members_auth_user
  on public.staff_members (auth_user_id) where auth_user_id is not null;
create index if not exists idx_staff_services_staff_service
  on public.staff_services (staff_id, service_id);
create index if not exists idx_staff_services_service_staff
  on public.staff_services (service_id, staff_id);
create index if not exists idx_staff_schedules_staff_day
  on public.staff_schedules (staff_id, day_of_week);
create index if not exists idx_business_media_business_type_order
  on public.business_media (business_id, media_type, display_order);
create index if not exists idx_social_videos_business_status_order
  on public.social_videos (business_id, status, display_order);
create index if not exists idx_business_hours_business_day
  on public.business_hours (business_id, day_of_week);
create unique index if not exists idx_website_settings_slug_unique
  on public.website_settings (slug) where slug is not null;
create index if not exists idx_customers_business_name
  on public.customers (business_id, full_name);
create index if not exists idx_bookings_business_date
  on public.bookings (business_id, appointment_date);
create index if not exists idx_bookings_business_status_date
  on public.bookings (business_id, booking_status, appointment_date);
create index if not exists idx_bookings_staff_date
  on public.bookings (staff_id, appointment_date) where staff_id is not null;
create index if not exists idx_bookings_customer
  on public.bookings (customer_id, created_at desc);
create index if not exists idx_booking_history_booking_created
  on public.booking_status_history (booking_id, created_at);
create index if not exists idx_slot_holds_lookup
  on public.booking_slot_holds (business_id, appointment_date, staff_id, start_time, end_time, expires_at);
create index if not exists idx_slot_holds_expiry
  on public.booking_slot_holds (expires_at);
create index if not exists idx_payment_orders_business_booking
  on public.payment_orders (business_id, booking_id);
create index if not exists idx_payments_business_created
  on public.payments (business_id, created_at desc);
create index if not exists idx_payments_booking
  on public.payments (booking_id, created_at desc);
create index if not exists idx_payments_verified
  on public.payments (business_id, verified_at) where verification_status = 'verified';
create index if not exists idx_balance_collections_booking
  on public.balance_collections (booking_id, collected_at);
create index if not exists idx_referral_events_code_created
  on public.referral_events (referral_code_id, created_at);
create index if not exists idx_referral_events_source_type
  on public.referral_events (source_business_id, event_type);
create index if not exists idx_business_activity_business_created
  on public.business_activity (business_id, created_at desc);
create index if not exists idx_business_activity_entity
  on public.business_activity (business_id, entity_type, entity_id);
create index if not exists idx_website_events_business_created
  on public.website_events (business_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, business_id, created_at desc) where not is_read;

-- The generated range plus btree_gist exclusion rejects concurrent overlapping
-- active bookings for the same assigned staff member. Null/unassigned staff is
-- protected by controlled RPC advisory locking and in-transaction rechecks.
alter table public.bookings
  add column if not exists booking_slot tsrange generated always as (
    tsrange(
      appointment_date + start_time,
      appointment_date + coalesce(
        end_time,
        start_time + make_interval(mins => coalesce(duration_minutes, 0))
      ),
      '[)'
    )
  ) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_prevent_staff_overlap'
  ) then
    alter table public.bookings
      add constraint bookings_prevent_staff_overlap
      exclude using gist (
        business_id with =,
        staff_id with =,
        booking_slot with &&
      )
      where (staff_id is not null and booking_status in ('pending_payment', 'confirmed', 'upcoming', 'in_progress'));
  end if;
end
$$;

commit;
