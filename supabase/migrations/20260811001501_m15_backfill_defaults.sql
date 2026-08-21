-- M15 (DRAFT): non-destructive backfill of identities, memberships and defaults
-- No demo businesses/services/staff/analytics are inserted.
-- Browser localStorage cannot be read by SQL: the app migration flow must upsert
-- each signed-in owner's existing nexora_* payload into business_draft_state.
-- NOT applied to any database. M02 must be finalized first.

begin;

insert into public.profiles (id, full_name, mobile, email, avatar_url, created_at, updated_at)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.phone, u.raw_user_meta_data ->> 'mobile'),
  u.email,
  u.raw_user_meta_data ->> 'avatar_url',
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (id) do update
set email = coalesce(profiles.email, excluded.email),
    mobile = coalesce(profiles.mobile, excluded.mobile),
    full_name = coalesce(profiles.full_name, excluded.full_name),
    avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);

insert into public.business_members (business_id, user_id, access_role, status)
select b.id, b.created_by, 'owner_admin', 'active'
from public.businesses b
where b.created_by is not null
on conflict (business_id, user_id) do update
set access_role = 'owner_admin', status = 'active';

insert into public.business_members (business_id, user_id, access_role, status)
select sm.business_id, sm.auth_user_id, sm.app_access_role, 'active'
from public.staff_members sm
where sm.auth_user_id is not null and sm.app_access_role is not null
on conflict (business_id, user_id) do update
set access_role = excluded.access_role,
    status = 'active'
where business_members.access_role <> 'owner_admin';

insert into public.business_plans (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

insert into public.booking_settings (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

insert into public.contact_settings (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

insert into public.website_settings (business_id, template_id)
select id, public.default_website_template(business_type)
from public.businesses
on conflict (business_id) do nothing;

insert into public.website_content (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

insert into public.onboarding_progress (business_id, user_id)
select id, created_by from public.businesses
where created_by is not null
on conflict (business_id) do nothing;

insert into public.business_draft_state (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

insert into public.notification_settings (business_id, user_id)
select id, created_by from public.businesses
where created_by is not null
on conflict (business_id, user_id) do nothing;

insert into public.booking_day_settings (business_id, day_of_week)
select b.id, day_of_week
from public.businesses b
cross join generate_series(0, 6) as day_of_week
on conflict (business_id, day_of_week) do nothing;

-- Defensive normalization of the immutable India/payment defaults. These
-- updates do not overwrite business content or user-selected templates.
update public.businesses
set timezone = coalesce(nullif(timezone, ''), 'Asia/Kolkata'),
    currency = 'INR',
    country_code = 'IN'
where timezone is null or timezone = '' or currency <> 'INR' or country_code <> 'IN';

update public.booking_settings
set advance_percent = 25.00
where advance_percent is distinct from 25.00;

commit;
