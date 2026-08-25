-- ============================================================================
-- M56 — existing-owner profile normalization + precise theme preflight
-- ============================================================================
-- Repairs two remaining M54 compatibility gaps without rewriting tenant data:
--   1. an already-existing profile returned before becoming business_user;
--   2. a missing/inactive theme produced a NULL salon.theme_id failure (or a
--      theme-less salon where the live column is nullable) instead of a clear
--      provisioning preflight error.

begin;

do $m56_preflight$
begin
  if to_regclass('auth.users') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.salons') is null
     or to_regclass('public.themes') is null
     or to_regprocedure('private.nexora_ensure_owner_profile(uuid)') is null
     or to_regprocedure('public.provision_owner_salon(text,text,text)') is null then
    raise exception 'M56 preflight: M54 owner workspace roots are missing.';
  end if;
end
$m56_preflight$;

-- This helper is private and is called only inside the authenticated owner
-- provisioner. Existing admin/business roles are retained; a customer that
-- explicitly enters owner provisioning is normalized before every return path.
create or replace function private.nexora_ensure_owner_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_active boolean;
  v_profile_found boolean;
  v_email text;
  v_name text;
begin
  if p_user_id is null then
    raise exception 'An authenticated user is required' using errcode = '28000';
  end if;

  select p.is_active
    into v_profile_active
  from public.profiles p
  where p.id = p_user_id;
  v_profile_found := found;

  if v_profile_found then
    if coalesce(v_profile_active, false) is not true then
      raise exception 'Your profile is inactive and cannot open an owner workspace'
        using errcode = '42501';
    end if;
    update public.profiles p
       set platform_role = case
             when p.platform_role = 'customer' then 'business_user'
             else p.platform_role
           end,
           updated_at = now()
     where p.id = p_user_id;
    return;
  end if;

  select u.email,
         coalesce(
           nullif(btrim(u.raw_user_meta_data->>'salon_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'fullName'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
           'User'
         )
    into v_email, v_name
  from auth.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'Authenticated user does not exist' using errcode = '28000';
  end if;

  insert into public.profiles
    (id, full_name, platform_role, is_active, email)
  values
    (p_user_id, left(v_name, 120), 'business_user', true, v_email)
  on conflict (id) do update
    set platform_role = case
          when public.profiles.platform_role = 'customer' then 'business_user'
          else public.profiles.platform_role
        end,
        updated_at = now();
end;
$$;

revoke all on function private.nexora_ensure_owner_profile(uuid)
  from public, anon, authenticated;

-- Fail before a new salon can be persisted with an unresolved or inactive
-- theme. Existing rows are not touched. The exception is deterministic and
-- names the failed dependency instead of leaking a generic FK/not-null error.
create or replace function private.nexora_require_active_salon_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.theme_id is null or not exists (
    select 1
    from public.themes t
    where t.id = new.theme_id
      and t.is_active = true
  ) then
    raise exception 'Owner workspace cannot be created because the selected active theme is unavailable'
      using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke all on function private.nexora_require_active_salon_theme()
  from public, anon, authenticated;

drop trigger if exists nexora_require_active_salon_theme on public.salons;
create trigger nexora_require_active_salon_theme
before insert or update of theme_id on public.salons
for each row execute function private.nexora_require_active_salon_theme();

create or replace function public.verify_m56_owner_profile_theme_preflight()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_profile text := lower(pg_catalog.pg_get_functiondef(
    'private.nexora_ensure_owner_profile(uuid)'::regprocedure
  ));
  v_trigger text := lower(pg_catalog.pg_get_functiondef(
    'private.nexora_require_active_salon_theme()'::regprocedure
  ));
begin
  check_name := 'existing owner profile is normalized';
  ok := position('platform_role' in v_profile) > 0
    and position('business_user' in v_profile) > 0
    and position('if v_profile_found' in v_profile) > 0;
  detail := 'existing customer profile is promoted only inside owner provisioning';
  return next;

  check_name := 'missing owner profile starts as business_user';
  ok := position('''business_user'', true' in v_profile) > 0;
  detail := 'legacy Auth account repair no longer leaves an owner as customer';
  return next;

  check_name := 'new salons require an active theme';
  ok := position('new.theme_id is null' in v_trigger) > 0
    and position('t.is_active = true' in v_trigger) > 0
    and exists (
      select 1 from pg_catalog.pg_trigger tg
      where tg.tgrelid = 'public.salons'::regclass
        and tg.tgname = 'nexora_require_active_salon_theme'
        and not tg.tgisinternal
    );
  detail := 'missing/inactive theme raises a precise P0002 dependency error';
  return next;

  check_name := 'workspace RLS remains enabled';
  select c.relrowsecurity into ok
  from pg_catalog.pg_class c where c.oid = 'public.salons'::regclass;
  detail := 'M56 does not bypass or disable salon RLS';
  return next;
end;
$$;

revoke all on function public.verify_m56_owner_profile_theme_preflight()
  from public, anon, authenticated;
grant execute on function public.verify_m56_owner_profile_theme_preflight()
  to service_role;

commit;
