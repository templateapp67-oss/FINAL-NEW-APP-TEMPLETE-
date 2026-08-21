-- M05 (DRAFT): staff, assignments, skills, schedules and permissions
-- NOT applied to any database. M02 must be finalized first.

begin;

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  auth_user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  photo_url text,
  primary_role text not null,
  app_access_role public.nexora_access_role,
  mobile text,
  commission_percent numeric(5,2) not null default 0,
  status public.nexora_staff_status not null default 'available',
  hide_mobile_public boolean not null default true,
  is_public boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_commission_range check (commission_percent between 0 and 100),
  constraint staff_display_order_nonnegative check (display_order >= 0),
  constraint staff_id_business_key unique (id, business_id),
  constraint staff_business_auth_user_key unique (business_id, auth_user_id)
);

create table if not exists public.staff_services (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint staff_services_pair_key unique (staff_id, service_id)
);

create table if not exists public.staff_skills (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  skill_name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint staff_skills_name_nonempty check (btrim(skill_name) <> ''),
  constraint staff_skills_display_order_nonnegative check (display_order >= 0),
  constraint staff_skills_staff_name_key unique (staff_id, skill_name)
);

create table if not exists public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  day_of_week integer not null,
  is_working boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_schedules_weekday check (day_of_week between 0 and 6),
  constraint staff_schedules_time_order check (
    not is_working or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint staff_schedules_staff_day_key unique (staff_id, day_of_week)
);

create table if not exists public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  permission_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_permissions_key_nonempty check (btrim(permission_key) <> ''),
  constraint staff_permissions_staff_key unique (staff_id, permission_key)
);

comment on column public.staff_members.primary_role is 'Professional salon role, distinct from application access.';
comment on column public.staff_members.app_access_role is 'Convenience mirror; business_members remains the access/RLS source of truth.';

commit;
