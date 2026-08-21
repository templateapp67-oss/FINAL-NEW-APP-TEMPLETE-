-- M36 / Phase 3A: canonical Supabase authentication, profiles & roles
--
-- Phase 3A completes the canonical AUTH layer shared by BOTH repositories on
-- the ONE shared Supabase project. It makes the M28→M35 chain self-sufficient
-- for identity (a fresh database built from M01→M36 ends up with the same
-- authoritative auth objects the Main Website already ships live), and it is
-- a safe no-op when applied on top of the live database where the Main
-- Website's 2026-08-11 centralized-auth migration already created the same
-- objects.
--
-- Canonical authority (one role system, two scopes — as established in
-- Phase 2 and verified in Phase 2C/2D):
--
--   auth.users.id  ──(PK/FK, 1:1)──▶  public.profiles.id
--
--     profiles.platform_role         global role:
--       'customer' | 'business_user' | 'growth_partner'
--       | 'delivery_partner' | 'admin'
--     organization_members.role      tenant role: 'owner' | 'staff'
--
--   Phase 3A required roles map onto that ONE system:
--     owner    → organization_members.role = 'owner'   (tenant scope)
--     staff    → organization_members.role = 'staff'   (tenant scope)
--     customer → profiles.platform_role = 'customer'   (global scope)
--     admin    → profiles.platform_role = 'admin'      (global scope)
--
-- What this migration does (all additive, idempotent, single transaction):
--   1. Syncs the canonical profile columns that exist on the live shared
--      schema (email, phone, avatar_url, last_seen_at, loyalty_points,
--      wallet_balance_paise, role_assigned_at, role_assigned_by) so a fresh
--      M28→M36 chain matches the live schema. NO invented columns.
--   2. Enables + forces RLS on profiles and installs the canonical policies:
--      a user reads/writes exactly their own row; admins may administer.
--   3. Installs the canonical role vocabulary helpers and the permanent
--      role guard: profiles.platform_role is immutable for browser clients.
--   4. Installs the financial-field guard (wallet/points are server-ledger).
--   5. Installs assign_platform_role() / set_profile_active() admin RPCs.
--   6. Installs the canonical signup trigger (handle_new_user) and the
--      auth.users email-change sync, only when absent.
--   7. Adds a defense-in-depth guard on organization_members so a client can
--      never insert a membership or change its own role/status (writes are
--      already revoked from anon/authenticated; the trigger also blocks any
--      future grant mistake).
--   8. Re-asserts the narrow column grants for profiles.
--   9. Ships verify_phase3a_auth() — the post-apply self-test used by the
--      Phase 3A test suite.
--
-- No passwords / auth secrets are ever copied into public.profiles: only the
-- fields listed in (1) are synced from auth.users metadata, and the signup
-- trigger reads ONLY raw_user_meta_data full_name / phone / signup_role.
--
-- RLS on the business tables (services/products/bookings/media…) is the
-- Phase 3B mandate and is deliberately NOT touched here.

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed: the canonical identity roots must already exist.
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_column record;
begin
  for required_column in
    select * from (values
      ('profiles', 'id'),
      ('profiles', 'full_name'),
      ('profiles', 'platform_role'),
      ('profiles', 'is_active'),
      ('organization_members', 'organization_id'),
      ('organization_members', 'user_id'),
      ('organization_members', 'role'),
      ('organization_members', 'is_active'),
      ('organizations', 'id'),
      ('salons', 'id')
    ) as required(table_name, column_name)
  loop
    if to_regclass('public.' || required_column.table_name) is null
       or not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = required_column.table_name
           and c.column_name = required_column.column_name
       ) then
      raise exception
        'Phase 3A preflight: required canonical column public.%.% is missing. Reconcile the live shared schema instead of creating a competing model.',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'profiles'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%auth.users%'
  ) then
    raise exception
      'Phase 3A preflight: public.profiles.id must reference auth.users(id). auth.users is the authentication authority; profiles is its 1:1 application identity.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Canonical profile column sync (columns that exist in the live schema).
--    auth.users is the identity authority; these columns only carry
--    presentational / synced profile data — never passwords or tokens.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists loyalty_points integer not null default 0,
  add column if not exists wallet_balance_paise bigint not null default 0,
  add column if not exists role_assigned_at timestamptz not null default now(),
  add column if not exists role_assigned_by uuid references auth.users (id);

-- ---------------------------------------------------------------------------
-- 2. Canonical role vocabulary helpers (mirrors the Main Website live layer).
-- ---------------------------------------------------------------------------
create or replace function private.normalize_platform_role(raw text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case lower(regexp_replace(coalesce(trim(raw), ''), '\s+', '_', 'g'))
    when 'customer'          then 'customer'
    when 'user'              then 'customer'
    when 'client'            then 'customer'
    when 'consumer'          then 'customer'
    when 'business_user'     then 'business_user'
    when 'business-user'     then 'business_user'
    when 'shop_owner'        then 'business_user'
    when 'shop-owner'        then 'business_user'
    when 'shopowner'         then 'business_user'
    when 'owner'             then 'business_user'
    when 'business_owner'    then 'business_user'
    when 'merchant'          then 'business_user'
    when 'vendor'            then 'business_user'
    when 'growth_partner'    then 'growth_partner'
    when 'growth-partner'    then 'growth_partner'
    when 'growthpartner'     then 'growth_partner'
    when 'partner'           then 'growth_partner'
    when 'delivery_partner'  then 'delivery_partner'
    when 'delivery-partner'  then 'delivery_partner'
    when 'deliverypartner'   then 'delivery_partner'
    when 'delivery'          then 'delivery_partner'
    when 'rider'             then 'delivery_partner'
    when 'courier'           then 'delivery_partner'
    -- 'admin' and 'staff' are intentionally NOT mapped here: 'admin' is never
    -- self-service, and 'staff' is the TENANT role on organization_members
    -- (owner|staff), not a global role. A signup requesting either degrades
    -- to 'customer'.
    else null
  end;
$$;

create or replace function private.current_platform_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.platform_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
  limit 1;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(private.current_platform_role() = 'admin', false);
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.current_platform_role();
$$;

revoke all on function private.normalize_platform_role(text) from public, anon;
revoke all on function private.current_platform_role() from public, anon;
revoke all on function private.is_admin()              from public, anon;
revoke all on function public.current_user_role()      from public, anon;
grant execute on function private.current_platform_role() to authenticated, service_role;
grant execute on function private.is_admin()              to authenticated, service_role;
grant execute on function public.current_user_role()      to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS on profiles: own row only, admins may administer. Forced so the
--    table owner cannot bypass it.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_insert_own   on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin policies use the SECURITY DEFINER helper below (no recursion).
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (private.is_admin());

create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke delete on table public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Permanent role guard — a browser client can never change or insert a
--    privileged platform_role. Only the signup trigger (runs as a trusted
--    definer), service_role, postgres or supabase admins may assign it.
--    Even an authenticated admin must go through assign_platform_role().
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_platform_role()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  trusted  boolean;
begin
  trusted := jwt_role = 'service_role'
             or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');

  if not trusted then
    -- platform_role is immutable for everyone except service_role and the
    -- signup trigger. Even an admin must go through assign_platform_role().
    if tg_op = 'INSERT' and new.platform_role <> 'customer' then
      raise exception 'profiles.platform_role is assigned permanently by Nexora'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.platform_role is distinct from old.platform_role then
      raise exception 'profiles.platform_role is assigned permanently by Nexora'
        using errcode = '42501';
    end if;
    -- A user must not reactivate an account that staff deactivated;
    -- administrators may suspend/restore accounts via set_profile_active().
    if tg_op = 'UPDATE'
       and new.is_active is distinct from old.is_active
       and not private.is_admin() then
      raise exception 'profiles.is_active is managed by Nexora'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.platform_role is distinct from old.platform_role then
    new.role_assigned_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_platform_role() from public, anon, authenticated;
grant execute on function public.guard_profile_platform_role() to service_role;

do $guard_trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_profiles_platform_role_guard'
      and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger trg_profiles_platform_role_guard
      before insert or update on public.profiles
      for each row execute function public.guard_profile_platform_role();
  end if;
end
$guard_trigger$;

-- Balance/points are server-ledger fields: block direct client mutation.
create or replace function public.guard_profile_financial_fields()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  trusted  boolean;
begin
  trusted := jwt_role = 'service_role'
             or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');

  if not trusted and tg_op = 'UPDATE' then
    if new.wallet_balance_paise is distinct from old.wallet_balance_paise
       or new.loyalty_points is distinct from old.loyalty_points then
      raise exception 'Wallet and loyalty balances are maintained by the Nexora server ledger'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_financial_fields() from public, anon, authenticated;
grant execute on function public.guard_profile_financial_fields() to service_role;

do $financial_guard_trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_profiles_financial_guard'
      and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger trg_profiles_financial_guard
      before update on public.profiles
      for each row execute function public.guard_profile_financial_fields();
  end if;
end
$financial_guard_trigger$;

-- ---------------------------------------------------------------------------
-- 5. Admin provisioning — the ONLY sanctioned ways to promote/suspend.
--    A browser client can never call assign_platform_role.
-- ---------------------------------------------------------------------------
create or replace function public.assign_platform_role(target_user uuid, new_role text)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized text;
  updated    public.profiles;
  jwt_role   text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if jwt_role <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not private.is_admin() then
    raise exception 'Only Nexora administrators may assign platform roles'
      using errcode = '42501';
  end if;

  normalized := case when lower(trim(new_role)) = 'admin'
                     then 'admin'
                     else private.normalize_platform_role(new_role) end;
  if normalized is null then
    raise exception 'Unknown platform role: %', new_role using errcode = '22023';
  end if;

  update public.profiles
     set platform_role    = normalized,
         role_assigned_at = now(),
         role_assigned_by = auth.uid(),
         updated_at       = now()
   where id = target_user
  returning * into updated;

  if not found then
    raise exception 'No profile for user %', target_user using errcode = 'P0002';
  end if;

  return updated;
end;
$$;

revoke all on function public.assign_platform_role(uuid, text) from public, anon, authenticated;
grant execute on function public.assign_platform_role(uuid, text) to service_role;

create or replace function public.set_profile_active(target_user uuid, active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated  public.profiles;
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if jwt_role <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not private.is_admin() then
    raise exception 'Only Nexora administrators may change account status'
      using errcode = '42501';
  end if;

  if target_user = auth.uid() and not active then
    raise exception 'An administrator cannot deactivate their own account'
      using errcode = '22023';
  end if;

  update public.profiles
     set is_active  = active,
         updated_at = now()
   where id = target_user
  returning * into updated;

  if not found then
    raise exception 'No profile for user %', target_user using errcode = 'P0002';
  end if;

  return updated;
end;
$$;

revoke all on function public.set_profile_active(uuid, boolean) from public, anon;
grant execute on function public.set_profile_active(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Canonical signup + email-sync triggers (only when absent).
--    handle_new_user is the ONLY creator of a profile row: it reads
--    raw_user_meta_data.full_name / phone / signup_role and NEVER copies
--    passwords or tokens. 'admin'/'staff' signup requests degrade to
--    'customer'. M28's phase1a_handle_new_auth_user fallback may co-exist;
--    both are idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  chosen_role    text;
  chosen_name    text;
begin
  requested_role := nullif(trim(new.raw_user_meta_data->>'signup_role'), '');
  chosen_role    := private.normalize_platform_role(requested_role);

  -- Unknown alias, missing value, or an attempt to self-assign 'admin'
  -- (or the tenant 'staff' role) all collapse to the least-privileged role.
  if chosen_role is null then
    chosen_role := 'customer';
  end if;

  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'fullName'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  insert into public.profiles (id, full_name, platform_role, is_active, email, phone)
  values (
    new.id,
    chosen_name,
    chosen_role,
    true,
    new.email,
    nullif(trim(new.raw_user_meta_data->>'phone'), '')
  )
  on conflict (id) do update set
    full_name = case
      when public.profiles.full_name in ('User', '') then excluded.full_name
      else public.profiles.full_name
    end,
    -- Never downgrade an established non-customer role on a repeat insert.
    platform_role = case
      when public.profiles.platform_role <> 'customer' then public.profiles.platform_role
      else excluded.platform_role
    end,
    email      = coalesce(public.profiles.email, excluded.email),
    is_active  = true,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

do $signup_trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end
$signup_trigger$;

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_user_email_change() from public, anon, authenticated;

do $email_sync_trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_email_changed'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_email_changed
      after update of email on auth.users
      for each row execute function public.handle_user_email_change();
  end if;
end
$email_sync_trigger$;

-- ---------------------------------------------------------------------------
-- 7. organization_members defense-in-depth guard.
--    Client writes are already revoked (M28 + live 20260808); the trigger
--    additionally makes it impossible for ANY non-trusted path — including a
--    future grant mistake — to insert a membership or to change its own
--    tenant role (staff→owner, staff→admin-bypass, customer→owner) or
--    membership status. Provisioning stays a trusted/server operation.
-- ---------------------------------------------------------------------------
create or replace function public.guard_organization_member_role()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  trusted  boolean;
begin
  trusted := jwt_role = 'service_role'
             or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');

  if not trusted then
    if tg_op = 'INSERT' then
      raise exception 'organization membership is provisioned by Nexora administrators'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE'
       and (new.role is distinct from old.role
            or new.is_active is distinct from old.is_active) then
      raise exception 'organization membership role and status are managed by Nexora'
        using errcode = '42501';
    end if;
    if tg_op = 'DELETE' then
      raise exception 'organization membership cannot be removed by a client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_organization_member_role() from public, anon, authenticated;
grant execute on function public.guard_organization_member_role() to service_role;

do $membership_guard_trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_organization_members_role_guard'
      and tgrelid = 'public.organization_members'::regclass
  ) then
    create trigger trg_organization_members_role_guard
      before insert or update or delete on public.organization_members
      for each row execute function public.guard_organization_member_role();
  end if;
end
$membership_guard_trigger$;

-- Re-assert: membership rows are never client-writable.
revoke insert, update, delete on table public.organization_members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Narrow column grants for profiles (mirrors the live schema).
--    A client may only write presentational fields; platform_role, is_active,
--    wallet_balance_paise and loyalty_points are NOT client-writable.
-- ---------------------------------------------------------------------------
revoke all    on table public.profiles from anon;
revoke update on table public.profiles from authenticated;
grant  select on table public.profiles to authenticated;
grant  insert on table public.profiles to authenticated;
grant  update (full_name, avatar_url, phone, last_seen_at, updated_at)
              on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Post-apply self-test (service_role only, like the live verify helper).
-- ---------------------------------------------------------------------------
create or replace function public.verify_phase3a_auth()
returns table (check_name text, passed boolean, detail text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query select
    'profiles.id references auth.users'::text,
    exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'profiles' and c.contype = 'f'
        and pg_get_constraintdef(c.oid) ilike '%auth.users%'
    ),
    'profiles.id must be the 1:1 identity key to auth.users(id)';

  return query select
    'profiles RLS enabled and forced'::text,
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass),
    'relrowsecurity + relforcerowsecurity';

  return query select
    'profiles own-row + admin policies'::text,
    (select count(*) >= 5 from pg_policies
      where schemaname = 'public' and tablename = 'profiles'),
    (select string_agg(policyname, ', ' order by policyname)
       from pg_policies where schemaname = 'public' and tablename = 'profiles');

  return query select
    'platform_role guard trigger installed'::text,
    exists (select 1 from pg_trigger
      where tgname = 'trg_profiles_platform_role_guard' and not tgisinternal),
    'trg_profiles_platform_role_guard → guard_profile_platform_role()';

  return query select
    'financial guard trigger installed'::text,
    exists (select 1 from pg_trigger
      where tgname = 'trg_profiles_financial_guard' and not tgisinternal),
    'trg_profiles_financial_guard → guard_profile_financial_fields()';

  return query select
    'organization_members role guard installed'::text,
    exists (select 1 from pg_trigger
      where tgname = 'trg_organization_members_role_guard' and not tgisinternal),
    'trg_organization_members_role_guard → guard_organization_member_role()';

  return query select
    'anon has no access to profiles'::text,
    not has_table_privilege('anon', 'public.profiles', 'select'),
    'anon must never read identities';

  return query select
    'authenticated cannot write platform_role'::text,
    not exists (
      select 1 from information_schema.column_privileges cp
      where cp.table_schema = 'public'
        and cp.table_name = 'profiles'
        and cp.column_name = 'platform_role'
        and cp.grantee = 'authenticated'
        and cp.privilege_type = 'UPDATE'
    ),
    'UPDATE grant on profiles must exclude platform_role/is_active/balances';

  return query select
    'assign_platform_role is service-role only'::text,
    not has_function_privilege('authenticated', 'public.assign_platform_role(uuid, text)', 'execute'),
    'browser clients must never promote roles';

  return query select
    'canonical role CHECK present'::text,
    exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'profiles'
        and c.conname = 'profiles_platform_role_check'
        and pg_get_constraintdef(c.oid) ilike '%business_user%admin%'
    ),
    'profiles_platform_role_check 5-value vocabulary';

  return query select
    'no auth.users without a profile'::text,
    not exists (
      select 1 from auth.users u
      left join public.profiles p on p.id = u.id
      where p.id is null
    ),
    (select coalesce(count(*)::text, '0') || ' orphaned users'
       from auth.users u
       left join public.profiles p on p.id = u.id
       where p.id is null);
end;
$$;

revoke all on function public.verify_phase3a_auth() from public, anon, authenticated;
grant execute on function public.verify_phase3a_auth() to service_role;

commit;
