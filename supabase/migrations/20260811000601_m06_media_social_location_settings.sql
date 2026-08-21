-- M06 (DRAFT): media, social, location, hours, contact and booking settings
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.business_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  media_type public.nexora_media_type not null,
  storage_path text not null,
  public_url text,
  category text,
  display_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint business_media_storage_path_nonempty check (btrim(storage_path) <> ''),
  constraint business_media_display_order_nonnegative check (display_order >= 0),
  constraint business_media_path_key unique (business_id, storage_path)
);

create table if not exists public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  platform public.nexora_social_platform not null,
  profile_url text,
  username text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_business_platform_key unique (business_id, platform)
);

create table if not exists public.social_videos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  platform public.nexora_social_platform not null,
  video_url text not null,
  external_video_id text,
  caption text,
  display_order integer not null default 0,
  status public.nexora_catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_videos_url_nonempty check (btrim(video_url) <> ''),
  constraint social_videos_display_order_nonnegative check (display_order >= 0)
);

create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  address_line text,
  area text,
  city text,
  state text,
  postal_code text,
  country text not null default 'India',
  latitude double precision,
  longitude double precision,
  google_place_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_locations_latitude check (latitude is null or latitude between -90 and 90),
  constraint business_locations_longitude check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week integer not null,
  is_open boolean not null default true,
  open_time time,
  close_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_weekday check (day_of_week between 0 and 6),
  constraint business_hours_time_order check (
    not is_open or (open_time is not null and close_time is not null and close_time > open_time)
  ),
  constraint business_hours_business_day_key unique (business_id, day_of_week)
);

create table if not exists public.contact_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  show_call boolean not null default true,
  show_whatsapp boolean not null default true,
  show_book_now boolean not null default true,
  booking_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  minimum_notice_minutes integer not null default 60,
  maximum_advance_days integer not null default 30,
  buffer_minutes integer not null default 0,
  allow_customer_staff_selection boolean not null default true,
  advance_percent numeric(5,2) not null default 25.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_settings_notice_nonnegative check (minimum_notice_minutes >= 0),
  constraint booking_settings_advance_days_positive check (maximum_advance_days > 0),
  constraint booking_settings_buffer_nonnegative check (buffer_minutes >= 0),
  constraint booking_settings_fixed_advance check (advance_percent = 25.00)
);

create table if not exists public.booking_day_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week integer not null,
  booking_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_day_settings_weekday check (day_of_week between 0 and 6),
  constraint booking_day_settings_business_day_key unique (business_id, day_of_week)
);

comment on column public.social_videos.video_url is 'External video URL only; Nexora does not store social video files.';
comment on column public.booking_settings.advance_percent is 'Fixed system invariant; owner UI must not edit this value.';

commit;
