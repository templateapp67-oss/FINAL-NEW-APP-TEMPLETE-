-- M03 (DRAFT): identity, tenant root, membership and public owner profile
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  mobile text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null,
  tagline text,
  about text,
  phone text not null,
  whatsapp text,
  email text,
  logo_url text,
  hero_image_url text,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  country_code text not null default 'IN',
  status public.nexora_business_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_currency_inr check (currency = 'INR'),
  constraint businesses_country_in check (country_code = 'IN')
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_role public.nexora_access_role not null,
  status public.nexora_business_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_members_business_user_key unique (business_id, user_id)
);

create table if not exists public.business_owners (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  name text not null,
  photo_url text,
  role_title text,
  bio text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.businesses is 'Canonical Nexora tenant root. Do not create a parallel salon/business table.';
comment on table public.business_members is 'Operational source of truth for application access and tenant RLS.';
comment on table public.business_owners is 'Public owner display profile; intentionally separate from auth/access.';

commit;
