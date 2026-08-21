-- M07 (DRAFT): website publishing, copy and DB-backed onboarding state
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.website_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  template_id public.nexora_website_template not null,
  appearance public.nexora_appearance not null default 'light',
  slug text unique,
  publish_status public.nexora_publish_status not null default 'draft',
  published_at timestamptz,
  referral_badge_visible boolean not null default true,
  nexora_branding_visible boolean not null default true,
  custom_domain text,
  custom_domain_status public.nexora_domain_status not null default 'not_configured',
  favicon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_settings_slug_format check (
    slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint website_settings_publish_time check (
    publish_status <> 'published' or published_at is not null
  )
);

create table if not exists public.website_content (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  hero_heading text,
  tagline text,
  about_text text,
  owner_intro text,
  booking_cta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  current_step integer not null default 1,
  last_completed_step integer not null default 0,
  status public.nexora_onboarding_status not null default 'in_progress',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_current_step_range check (current_step between 1 and 25),
  constraint onboarding_last_step_range check (last_completed_step between 0 and 25),
  constraint onboarding_step_order check (last_completed_step <= current_step),
  constraint onboarding_completion_time check (status <> 'completed' or completed_at is not null)
);

create table if not exists public.business_draft_state (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_draft_state_object check (jsonb_typeof(draft) = 'object')
);

comment on table public.business_draft_state is 'Flexible wizard draft only; canonical business facts remain in normalized tables.';
comment on column public.website_content.tagline is 'Website-display override; businesses.tagline remains the identity fallback.';

commit;
