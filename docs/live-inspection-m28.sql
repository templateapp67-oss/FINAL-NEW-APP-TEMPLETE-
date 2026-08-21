-- ============================================================================
-- M28 LIVE RECONCILIATION — READ-ONLY INSPECTION (project qwaehqsmodekbgvnaavz)
-- Run as-is in the Supabase SQL editor (or via psql/management API).
-- It modifies NOTHING: every statement is a catalog/count SELECT.
-- ============================================================================

-- 1. Columns, types, nullability, defaults, identity/generated status for
--    organization_members and every related root the reconciliation cares
--    about. (Tables that do not exist simply produce no rows.)
select c.table_name, c.ordinal_position, c.column_name, c.data_type,
       c.udt_name, c.is_nullable, c.column_default, c.is_generated,
       c.generation_expression
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'organization_members', 'profiles', 'organizations', 'salons',
    'businesses', 'locations', 'business_locations',
    'salon_public_websites', 'services', 'staff', 'salon_hours', 'bookings'
  )
order by c.table_name, c.ordinal_position;

-- 2. Primary key, unique constraints, foreign keys, checks.
select rel.relname as table_name,
       con.conname as constraint_name,
       con.contype as constraint_type, -- p = PK, u = UNIQUE, f = FK, c = CHECK
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname in (
    'organization_members', 'profiles', 'organizations', 'salons',
    'businesses', 'locations', 'business_locations',
    'salon_public_websites', 'services', 'staff', 'salon_hours', 'bookings'
  )
order by rel.relname, con.contype, con.conname;

-- 3. Indexes.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'organization_members', 'profiles', 'organizations', 'salons',
    'businesses', 'locations', 'business_locations',
    'salon_public_websites', 'services', 'staff', 'salon_hours', 'bookings'
  )
order by tablename, indexname;

-- 4. RLS status.
select relname as table_name, relrowsecurity as rls_enabled,
       relforcerowsecurity as rls_forced
from pg_class rel
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname in (
    'organization_members', 'profiles', 'organizations', 'salons',
    'businesses', 'locations', 'business_locations',
    'salon_public_websites', 'services', 'staff', 'salon_hours', 'bookings'
  )
order by relname;

-- 5. Existing policies.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organization_members', 'profiles', 'organizations', 'salons',
    'businesses', 'locations', 'business_locations',
    'salon_public_websites', 'services', 'staff', 'salon_hours', 'bookings'
  )
order by tablename, policyname;

-- 6. Row counts (exact) + membership activity vocabulary. These are the two
--    facts the reconciliation branches on: the status column's distinct
--    values decide whether the generated is_active mapping is provably safe.
select 'organization_members' as table_name, count(*) as rows from public.organization_members;
select 'profiles', count(*) from public.profiles;
select 'organizations', count(*) from public.organizations;
select 'salons', count(*) from public.salons;

-- 6b. Membership activity vocabulary + per-value counts (drives the
--     fail-closed vocabulary check in reconciled M28). If the table has no
--     status column this errors — that fact itself is a required finding.
select status, count(*) as n
from public.organization_members
group by status
order by n desc;

-- 6c. Role vocabulary.
select role, count(*) as n
from public.organization_members
group by role
order by n desc;

-- 7. Does an auth.users profile trigger already exist? (M28 §1 keeps it.)
select t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;
