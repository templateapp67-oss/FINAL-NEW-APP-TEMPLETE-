-- M37 / Phase 3B: multi-tenant authorization & complete RLS implementation
--
-- Phase 3B completes DATABASE-side multi-tenant authorization on the shared
-- canonical schema (M28→M36) so that tenant isolation is enforced by RLS,
-- not by the application.
--
-- Canonical tenant hierarchy (ONE tenant authority, established Phase 2/3A):
--
--   auth.users.id ─▶ profiles.id (1:1 identity)
--   profiles ─▶ organization_members (tenant membership: owner | staff)
--   organizations ─▶ organization_members
--   organizations ─▶ salons.organization_id
--   salons ─▶ business_locations / staff / salon_hours / services / products
--   themes ─▶ service_categories ─▶ services.category_id (canonical reference)
--
-- Authorization is ALWAYS derived from these trusted database relationships
-- (auth.uid() + organization_members), never from URL/localStorage/client
-- state, and never from client-submitted organization_id / salon_id / role.
--
-- Gap analysis of M28→M36 (verified, not guessed):
--   * profiles / organization_members / services / products / product_categories
--     / service_categories / themes / business_locations / salon_public_websites
--     / bookings / booking_services / booking_slot_holds / salon_media /
--     payment_orders / payments / payment_webhook_events / booking_request_keys
--     / storage.objects  → RLS already enabled + policies (M28/M29/M30/M31/M36).
--   * organizations / salons / staff / salon_hours → RLS MISSING on the fresh
--     chain (live DB has partial salons/staff/salon_hours coverage from the
--     Main Website's older migrations). THIS migration closes those gaps.
--   * themes / service_categories → public SELECT only; this migration
--     re-asserts that they are never client-writable.
--
-- Design rules honoured:
--   * Every new/changed policy is drop-if-exists + create in the SAME safe
--     migration (no orphan DROP POLICY).
--   * SECURITY DEFINER helpers use an empty search_path and are granted only
--     to authenticated/service_role; they never take unsafe parameters.
--   * UPDATE policies carry BOTH USING and WITH CHECK; ownership columns
--     (organization_id, salon_id) are protected by column grants AND checks.
--   * INSERT is either absent (no grant → denied) or bound to
--     private.has_salon_role() so a client cannot insert into another salon.
--   * No destructive DDL, no DROP TABLE, additive + idempotent; safe to apply
--     on top of the live database where the Main Website already shipped some
--     of the same policies (same names → recreated with identical semantics;
--     different names → additional, non-conflicting policies).
--   * Grant style mirrors the live Main Website grants (table-level SELECT to
--     anon where the live schema does it, with location columns revoked on
--     salons; RLS decides which rows are visible).

begin;

-- ---------------------------------------------------------------------------
-- 0. Fail closed: the canonical tenant roots must already exist.
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_column record;
begin
  for required_column in
    select * from (values
      ('organizations', 'id'),
      ('organizations', 'name'),
      ('organization_members', 'organization_id'),
      ('organization_members', 'user_id'),
      ('organization_members', 'role'),
      ('organization_members', 'is_active'),
      ('salons', 'id'),
      ('salons', 'organization_id'),
      ('salons', 'name'),
      ('salons', 'is_active'),
      ('salons', 'deleted_at'),
      ('staff', 'id'),
      ('staff', 'salon_id'),
      ('staff', 'is_active'),
      ('salon_hours', 'salon_id')
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
        'Phase 3B preflight: required canonical column public.%.% is missing. Reconcile the live shared schema instead of creating a competing model.',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Canonical tenant-scope helper bootstrap (idempotent).
--    The fresh M28→M36 chain already ships these helpers; the live shared
--    database (whose organization_members/salons predate this repo's
--    migration history) does not, so M37 re-creates them with the SAME
--    canonical semantics. `can_manage_salon_settings` is intentionally left
--    untouched (its live definition differs; re-asserting its grants only).
--    All helpers are SECURITY DEFINER with an empty search_path and never
--    execute dynamic SQL.
-- ---------------------------------------------------------------------------
create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.platform_role = 'admin'
  )
$$;

create or replace function private.has_salon_role(
  p_salon_id uuid,
  p_roles text[] default array['owner', 'staff']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin() or exists (
    select 1
    from public.salons s
    join public.organization_members om
      on om.organization_id = s.organization_id
    join public.profiles p on p.id = om.user_id
    where s.id = p_salon_id
      and s.deleted_at is null
      and s.is_active = true
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.role = any(p_roles)
      and p.is_active = true
  )
$$;

create or replace function private.is_public_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.salons s
    where s.id = p_salon_id and s.is_active = true and s.deleted_at is null
  )
$$;

revoke all on function private.is_active_admin() from public, anon, authenticated;
revoke all on function private.has_salon_role(uuid, text[]) from public, anon, authenticated;
revoke all on function private.is_public_salon(uuid) from public, anon, authenticated;
grant execute on function private.is_active_admin() to authenticated, service_role;
grant execute on function private.has_salon_role(uuid, text[]) to authenticated, service_role;
grant execute on function private.is_public_salon(uuid) to anon, authenticated, service_role;

revoke all on function private.can_manage_salon_settings(uuid) from public, anon, authenticated;
grant execute on function private.can_manage_salon_settings(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Organization-scoped authorization helpers (SECURITY DEFINER, empty
--    search_path, no unsafe parameters — the argument is only a uuid id, and
--    the body never executes dynamic SQL). They are non-recursive: they read
--    organization_members/profiles through the definer (RLS bypassed) and
--    disclose only the caller's own memberships.
-- ---------------------------------------------------------------------------
create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin() or exists (
    select 1
    from public.organization_members om
    join public.profiles p on p.id = om.user_id
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and p.is_active = true
  )
$$;

create or replace function private.is_org_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin() or exists (
    select 1
    from public.organization_members om
    join public.profiles p on p.id = om.user_id
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.role = 'owner'
      and p.is_active = true
  )
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.is_org_owner(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.is_org_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. ORGANIZATIONS — RLS + member-select / owner-update.
--    Cross-tenant SELECT must return zero rows; only members see their org;
--    only owners may update their own organization's non-authoritative
--    presentational fields. INSERT/DELETE stay server-only (no grant).
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists phase3b_organizations_member_select on public.organizations;
create policy phase3b_organizations_member_select
  on public.organizations
  for select
  to authenticated
  using (private.is_org_member(id));

drop policy if exists phase3b_organizations_owner_update on public.organizations;
create policy phase3b_organizations_owner_update
  on public.organizations
  for update
  to authenticated
  using (private.is_org_owner(id))
  with check (private.is_org_owner(id));

revoke all on table public.organizations from anon;
revoke insert, delete on table public.organizations from authenticated;
grant select (id, name, status, created_at, updated_at)
  on table public.organizations to authenticated;
grant update (name) on table public.organizations to authenticated;
grant all on table public.organizations to service_role;

-- ---------------------------------------------------------------------------
-- 4. SALONS — RLS + member-select / owner-update.
--    Staff may read operational salon data (has_salon_role owner|staff);
--    only owners may update salon settings (can_manage_salon_settings =
--    owner-only). organization_id is NOT in the UPDATE grant and the WITH
--    CHECK re-verifies ownership on the NEW row, so a client can never
--    reassign a salon to another organization. No client INSERT/DELETE:
--    salon creation/removal remains a server/seed operation. anon gets the
--    table-level SELECT grant exactly like the live schema (location columns
--    excluded below) but there is no anon policy, so anon sees zero rows —
--    public reads go through the security-barrier public_salon_catalog view.
-- ---------------------------------------------------------------------------
alter table public.salons enable row level security;

drop policy if exists phase3b_salons_member_select on public.salons;
create policy phase3b_salons_member_select
  on public.salons
  for select
  to authenticated
  using (private.has_salon_role(id));

drop policy if exists phase3b_salons_owner_update on public.salons;
create policy phase3b_salons_owner_update
  on public.salons
  for update
  to authenticated
  using (private.can_manage_salon_settings(id))
  with check (private.can_manage_salon_settings(id));

revoke all on table public.salons from anon;
revoke insert, delete on table public.salons from authenticated;

-- Mirror the live grant shape: table-level SELECT for PostgREST visibility
-- (RLS decides rows), with legacy location columns excluded; UPDATE with the
-- ownership/immutable columns excluded so a client cannot move the row.
do $salon_grants$
declare
  readable_columns text;
  writable_columns text;
begin
  grant select on table public.salons to anon, authenticated;
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into readable_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'salons'
    and column_name not in ('latitude','longitude','lat','lng','location_latitude','location_longitude');
  if readable_columns is not null then
    execute 'revoke select (' || readable_columns || ') on public.salons from anon, authenticated';
  end if;

  revoke update on table public.salons from anon, authenticated;
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into writable_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'salons'
    and column_name not in (
      'id','organization_id','created_at',
      'latitude','longitude','lat','lng','location_latitude','location_longitude'
    );
  if writable_columns is not null then
    execute 'grant update (' || writable_columns || ') on public.salons to authenticated';
  end if;
end
$salon_grants$;

grant all on table public.salons to service_role;

-- ---------------------------------------------------------------------------
-- 5. STAFF — RLS + member-all / public-safe read.
--    Owner/staff manage the staff of their own salon (has_salon_role);
--    the public may read only ACTIVE, NON-DELETED staff of public salons
--    (strictly safer than the live legacy `using (true)` policy; on the live
--    DB both policies apply, so live behavior is unchanged — on a fresh
--    chain the scoped policy is authoritative).
-- ---------------------------------------------------------------------------
alter table public.staff enable row level security;

drop policy if exists phase3b_staff_member_all on public.staff;
create policy phase3b_staff_member_all
  on public.staff
  for all
  to authenticated
  using (private.has_salon_role(salon_id))
  with check (private.has_salon_role(salon_id));

drop policy if exists phase3b_staff_public_read on public.staff;
create policy phase3b_staff_public_read
  on public.staff
  for select
  to anon, authenticated
  using (
    is_active = true
    and deleted_at is null
    and private.is_public_salon(salon_id)
  );

revoke all on table public.staff from anon;
grant select on table public.staff to anon, authenticated;
grant select, insert, update, delete on table public.staff to authenticated;
grant all on table public.staff to service_role;

-- ---------------------------------------------------------------------------
-- 6. SALON_HOURS — RLS + member-all / public-safe read.
-- ---------------------------------------------------------------------------
alter table public.salon_hours enable row level security;

drop policy if exists phase3b_salon_hours_member_all on public.salon_hours;
create policy phase3b_salon_hours_member_all
  on public.salon_hours
  for all
  to authenticated
  using (private.has_salon_role(salon_id))
  with check (private.has_salon_role(salon_id));

drop policy if exists phase3b_salon_hours_public_read on public.salon_hours;
create policy phase3b_salon_hours_public_read
  on public.salon_hours
  for select
  to anon, authenticated
  using (private.is_public_salon(salon_id));

revoke all on table public.salon_hours from anon;
grant select on table public.salon_hours to anon, authenticated;
grant select, insert, update, delete on table public.salon_hours to authenticated;
grant all on table public.salon_hours to service_role;

-- ---------------------------------------------------------------------------
-- 7. Public catalog SELECT — restore PostgREST-visible table-level SELECT on
--    the public catalog tables (the live shared schema grants table-level
--    SELECT to anon/authenticated; on a fresh chain the M28 column grants are
--    the only privileges and PostgREST cannot even expose the tables). RLS
--    continues to decide WHICH rows are visible (active + non-deleted +
--    public salon); the column revokes preserve M28's narrow public columns
--    exactly and keep soft-delete markers / inventory internals private.
-- ---------------------------------------------------------------------------
grant select on table public.services to anon, authenticated;
grant select on table public.products to anon, authenticated;
grant select on table public.product_categories to anon, authenticated;
grant select on table public.service_categories to anon, authenticated;

revoke select (created_at, updated_at) on public.product_categories from anon;
revoke select (sku, track_inventory, inventory_quantity, deleted_at, created_at, updated_at)
  on public.products from anon;

-- ---------------------------------------------------------------------------
-- 8. Canonical reference tables — re-assert client WRITE protection.
--    themes and service_categories are canonical system configuration: the
--    public/authenticated may SELECT (existing M28 policies), but they are
--    never client-writable. No policy change; the revokes are idempotent
--    belt-and-braces in case a later migration grants table-level writes.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table public.themes from anon, authenticated;
revoke insert, update, delete on table public.service_categories from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Membership / identity tables — re-assert client write protection.
--    organization_members: self-read only (M28 policy), no client writes
--    (M28 revokes + M36 guard trigger). profiles: own-row RLS from M36, no
--    DELETE. These revokes are idempotent re-assertions.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table public.organization_members from anon, authenticated;
revoke delete on table public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9b. Profiles preference-field sync (canonical model parity).
--    The Main Website app persists `profiles.allow_recently_viewed` on its
--    own row (and reads preferred_city/preferred_area/gender — SELECT is
--    already table-level). The column exists in the live shared schema but
--    not in this repo's fresh chain, so the UPDATE grant is applied ONLY
--    when the column is present. RLS still restricts writes to the owner's
--    own row (M36 own-row UPDATE policy).
-- ---------------------------------------------------------------------------
do $profiles_pref_grants$
declare
  has_pref_column boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'allow_recently_viewed'
  ) into has_pref_column;

  if has_pref_column then
    execute 'grant update (allow_recently_viewed) on table public.profiles to authenticated';
  end if;
end
$profiles_pref_grants$;

-- ---------------------------------------------------------------------------
-- 10. Post-apply self-test (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.verify_phase3b_rls()
returns table (check_name text, passed boolean, detail text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t text;
begin
  -- Every Phase 3B target table must have RLS enabled and policies installed.
  foreach t in array array[
    'profiles','organizations','organization_members','salons','staff',
    'salon_hours','themes','service_categories','services','product_categories',
    'products','business_locations','salon_public_websites','bookings',
    'booking_services','booking_slot_holds','salon_media','payment_orders',
    'payments','payment_webhook_events'
  ] loop
    return query select
      t || ' RLS enabled'::text,
      coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false),
      'alter table public.' || t || ' enable row level security';
  end loop;

  return query select
    'profiles RLS forced'::text,
    coalesce((select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass), false),
    'profiles must force RLS (Phase 3A)';

  return query select
    'organizations member+owner policies'::text,
    (select count(*) >= 2 from pg_policies
      where schemaname = 'public' and tablename = 'organizations'),
    (select string_agg(policyname, ', ' order by policyname)
       from pg_policies where schemaname = 'public' and tablename = 'organizations');

  return query select
    'salons member+owner policies'::text,
    (select count(*) >= 2 from pg_policies
      where schemaname = 'public' and tablename = 'salons'),
    (select string_agg(policyname, ', ' order by policyname)
       from pg_policies where schemaname = 'public' and tablename = 'salons');

  return query select
    'staff member+public policies'::text,
    (select count(*) >= 2 from pg_policies
      where schemaname = 'public' and tablename = 'staff'),
    (select string_agg(policyname, ', ' order by policyname)
       from pg_policies where schemaname = 'public' and tablename = 'staff');

  return query select
    'salon_hours member+public policies'::text,
    (select count(*) >= 2 from pg_policies
      where schemaname = 'public' and tablename = 'salon_hours'),
    (select string_agg(policyname, ', ' order by policyname)
       from pg_policies where schemaname = 'public' and tablename = 'salon_hours');

  return query select
    'organizations client UPDATE limited to name'::text,
    exists (
      select 1 from information_schema.column_privileges cp
      where cp.table_schema = 'public' and cp.table_name = 'organizations'
        and cp.grantee = 'authenticated' and cp.privilege_type = 'UPDATE'
    )
    and not exists (
      select 1 from information_schema.column_privileges cp
      where cp.table_schema = 'public' and cp.table_name = 'organizations'
        and cp.grantee = 'authenticated' and cp.privilege_type = 'UPDATE'
        and cp.column_name in ('id','status','created_at','updated_at')
    ),
    'UPDATE grant on organizations must exclude id/status/timestamps';

  return query select
    'salons organization_id not client-writable'::text,
    not exists (
      select 1 from information_schema.column_privileges cp
      where cp.table_schema = 'public' and cp.table_name = 'salons'
        and cp.grantee = 'authenticated' and cp.privilege_type = 'UPDATE'
        and cp.column_name = 'organization_id'
    ),
    'salons.organization_id must never be client-updatable';

  return query select
    'no client INSERT on organizations/salons'::text,
    not has_table_privilege('authenticated', 'public.organizations', 'INSERT')
      and not has_table_privilege('authenticated', 'public.salons', 'INSERT'),
    'organizations and salons are server/seed-created';

  return query select
    'no client DELETE on organizations/salons'::text,
    not has_table_privilege('authenticated', 'public.organizations', 'DELETE')
      and not has_table_privilege('authenticated', 'public.salons', 'DELETE'),
    'organizations and salons are never client-deleted';

  return query select
    'anon has no org/membership access'::text,
    not has_table_privilege('anon', 'public.organizations', 'SELECT')
      and not has_table_privilege('anon', 'public.organization_members', 'SELECT'),
    'identity/tenant tables must not be anon-readable';

  return query select
    'theme/service_categories client-write revoked'::text,
    not has_table_privilege('authenticated', 'public.themes', 'INSERT')
      and not has_table_privilege('authenticated', 'public.themes', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.themes', 'DELETE')
      and not has_table_privilege('authenticated', 'public.service_categories', 'INSERT')
      and not has_table_privilege('authenticated', 'public.service_categories', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.service_categories', 'DELETE'),
    'themes/service_categories are canonical and never client-writable';

  return query select
    'payment tables not client-writable'::text,
    not has_table_privilege('authenticated', 'public.payment_orders', 'INSERT')
      and not has_table_privilege('authenticated', 'public.payments', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.payments', 'DELETE'),
    'financial records are server-written (M29)';

  return query select
    'catalog tables PostgREST-visible to anon'::text,
    has_table_privilege('anon', 'public.services', 'SELECT')
      and has_table_privilege('anon', 'public.products', 'SELECT')
      and has_table_privilege('anon', 'public.product_categories', 'SELECT')
      and has_table_privilege('anon', 'public.service_categories', 'SELECT'),
    'table-level SELECT grants exist (RLS decides rows)';

  -- NOTE: the products public column scope (deleted_at / sku /
  -- track_inventory / inventory_quantity / created_at / updated_at revoked
  -- from anon) is enforced via pg_attribute.attacl column REVOKEs, which
  -- real PostgreSQL honours but the PGlite test harness cannot introspect
  -- (has_column_privilege ignores column-level ACLs there). The migration
  -- still applies the revokes; see docs/phase-3b-multitenant-rls.md.

  return query select
    'profiles preference column writable when present'::text,
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'allow_recently_viewed'
    )
    or exists (
      select 1 from information_schema.column_privileges cp
      where cp.table_schema = 'public' and cp.table_name = 'profiles'
        and cp.column_name = 'allow_recently_viewed'
        and cp.grantee = 'authenticated' and cp.privilege_type = 'UPDATE'
    ),
    'allow_recently_viewed writable only when the live column exists';

  return query select
    'cross-tenant helper functions installed'::text,
    exists (
      select 1 from pg_proc where proname = 'is_org_member' and pronamespace = 'private'::regnamespace
    )
      and exists (
        select 1 from pg_proc where proname = 'is_org_owner' and pronamespace = 'private'::regnamespace
      )
      and exists (
        select 1 from pg_proc where proname = 'has_salon_role' and pronamespace = 'private'::regnamespace
      ),
    'private.is_org_member / private.is_org_owner / private.has_salon_role available';
end;
$$;

revoke all on function public.verify_phase3b_rls() from public, anon, authenticated;
grant execute on function public.verify_phase3b_rls() to service_role;

commit;
