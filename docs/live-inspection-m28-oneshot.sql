-- ============================================================================
-- M28 LIVE RECONCILIATION — ONE-SHOT READ-ONLY INSPECTION
-- Project: qwaehqsmodekbgvnaavz  ·  Supabase Dashboard → SQL Editor
--
-- Run QUERY 1, copy the single JSON result cell, paste it back in chat.
-- Then run QUERY 2 and paste its result (or its error text — that too is a
-- finding). Both are pure SELECTs: nothing is created, changed, or deleted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- QUERY 1 — full catalog snapshot as a single JSON value.
-- ---------------------------------------------------------------------------
with scope(t) as (
  values ('organization_members'), ('profiles'), ('organizations'),
         ('salons'), ('businesses'), ('locations'), ('business_locations'),
         ('salon_public_websites'), ('services'), ('staff'),
         ('salon_hours'), ('bookings')
)
select jsonb_pretty(jsonb_build_object(
  'columns', (
    select jsonb_agg(jsonb_build_object(
      'table', c.table_name, 'pos', c.ordinal_position, 'name', c.column_name,
      'type', c.data_type, 'udt', c.udt_name, 'nullable', c.is_nullable,
      'default', c.column_default, 'generated', c.is_generated,
      'gen_expr', c.generation_expression) order by c.table_name, c.ordinal_position)
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in (select t from scope)
  ),
  'constraints', (
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'name', con.conname, 'type', con.contype,
      'def', pg_get_constraintdef(con.oid)) order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname in (select t from scope)
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', indexname, 'def', indexdef)
      order by tablename, indexname)
    from pg_indexes
    where schemaname = 'public' and tablename in (select t from scope)
  ),
  'rls', (
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'enabled', rel.relrowsecurity,
      'forced', rel.relforcerowsecurity) order by rel.relname)
    from pg_class rel
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relkind = 'r'
      and rel.relname in (select t from scope)
  ),
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'qual', qual, 'check', with_check)
      order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public' and tablename in (select t from scope)
  ),
  'counts', jsonb_build_object(
    'organization_members', (select count(*) from public.organization_members),
    'profiles',             (select count(*) from public.profiles),
    'organizations',        (select count(*) from public.organizations),
    'salons',               (select count(*) from public.salons),
    'salon_public_websites',(select count(*) from public.salon_public_websites),
    'services',             (select count(*) from public.services),
    'staff',                (select count(*) from public.staff),
    'salon_hours',          (select count(*) from public.salon_hours),
    'bookings',             (select count(*) from public.bookings)
  ),
  'auth_user_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', t.tgname, 'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
  )
)) as m28_live_inspection;

-- ---------------------------------------------------------------------------
-- QUERY 2 — membership activity + role vocabulary (drives the fail-closed
-- vocabulary check in reconciled M28). If this errors with "column status
-- does not exist", paste that error — it is itself a decisive finding.
-- ---------------------------------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'status_vocabulary', (
    select coalesce(jsonb_agg(jsonb_build_object('status', s, 'rows', n) order by n desc), '[]'::jsonb)
    from (select status as s, count(*) as n
          from public.organization_members group by status) v
  ),
  'role_vocabulary', (
    select coalesce(jsonb_agg(jsonb_build_object('role', r, 'rows', n) order by n desc), '[]'::jsonb)
    from (select role as r, count(*) as n
          from public.organization_members group by role) v
  )
)) as m28_membership_vocabulary;
