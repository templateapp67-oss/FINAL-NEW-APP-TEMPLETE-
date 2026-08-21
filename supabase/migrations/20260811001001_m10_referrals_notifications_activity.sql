-- M10 (DRAFT): referrals, notifications, audit/analytics and plan entitlements
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete restrict,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_nonempty check (btrim(code) <> '')
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
  source_business_id uuid not null references public.businesses(id) on delete restrict,
  visitor_token text not null,
  event_type public.nexora_referral_event_type not null,
  referred_business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint referral_events_visitor_nonempty check (btrim(visitor_token) <> ''),
  constraint referral_events_dedupe_key unique (referral_code_id, visitor_token, event_type)
);

create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  new_booking boolean not null default true,
  booking_cancelled boolean not null default true,
  payment_verified boolean not null default true,
  upcoming_appointment boolean not null default true,
  website_updates boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_business_user_key unique (business_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint notifications_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.business_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint business_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.website_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type public.nexora_website_event_type not null,
  visitor_token text not null,
  page_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint website_events_visitor_nonempty check (btrim(visitor_token) <> ''),
  constraint website_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.business_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  plan_code text not null default 'starter',
  status public.nexora_plan_status not null default 'active',
  white_label_enabled boolean not null default false,
  hide_nexora_branding boolean not null default false,
  custom_domain_enabled boolean not null default false,
  referral_badge_can_hide boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_plans_code_nonempty check (btrim(plan_code) <> ''),
  constraint business_plans_white_label_gate check (not hide_nexora_branding or white_label_enabled)
);

comment on table public.business_plans is 'Authoritative entitlement gate; website settings cannot self-grant plan features.';

commit;
