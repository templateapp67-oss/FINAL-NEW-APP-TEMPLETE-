-- ============================================================================
-- M28 POST-APPLY VERIFICATION — READ-ONLY
-- Project: qwaehqsmodekbgvnaavz  ·  Supabase Dashboard → SQL Editor
--
-- Run ONLY after the M28 migration
-- (supabase/migrations/20260821000101_m28_phase1a_unified_salon_foundation.sql)
-- has completed successfully in the SQL Editor.
--
-- Pure SELECTs: nothing is created, changed, or deleted.
-- Copy the single JSON result cell and paste it back in chat.
-- Compare 'row_count_after' and 'status_vocabulary_after' against the
-- pre-migration counts from live-inspection-m28-oneshot.sql QUERY 1/2.
-- ============================================================================
select jsonb_pretty(jsonb_build_object(

  -- 1. is_active exists, is boolean, NOT NULL, STORED GENERATED from status
  'is_active_column', (
    select jsonb_build_object(
      'name', c.column_name, 'type', c.data_type, 'nullable', c.is_nullable,
      'generated', c.is_generated, 'gen_expr', c.generation_expression)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'organization_members'
      and c.column_name = 'is_active'
  ),

  -- 2. Generated-column behavior: must be 0 — every row's is_active equals
  --    (status = 'active') IS TRUE. NULL/empty = perfect reconciliation.
  'generated_matches_status_mismatch_count', (
    select count(*)
    from public.organization_members
    where is_active is distinct from ((status = 'active') is true)
  ),

  -- 3. Data preservation evidence (compare with BEFORE values).
  'row_count_after', (select count(*) from public.organization_members),
  'status_vocabulary_after', (
    select coalesce(jsonb_agg(jsonb_build_object('status', s, 'rows', n) order by n desc), '[]'::jsonb)
    from (select status as s, count(*) as n
          from public.organization_members group by status) v
  ),
  'role_vocabulary_after', (
    select coalesce(jsonb_agg(jsonb_build_object('role', r, 'rows', n) order by n desc), '[]'::jsonb)
    from (select role as r, count(*) as n
          from public.organization_members group by role) v
  ),

  -- 4. No duplicate organization_members relation anywhere in the database.
  --    Expected: exactly one row — public.organization_members, relkind r.
  'organization_members_relations_dbwide', (
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', c.relname, 'kind', c.relkind))
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'organization_members' and c.relkind in ('r', 'p')
  ),

  -- 5. membership RLS enabled per M28 §2
  'membership_rls', (
    select jsonb_build_object('enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'organization_members'
  ),

  -- 6. M28 footprint spot-check:
  --    themes = 5 · new_tables = 8 (themes, service_categories,
  --    product_categories, products, business_locations, booking_services,
  --    booking_slot_holds, salon_media) · private security fns = 4 ·
  --    phase1a policies > 0 · public_salon_catalog view present.
  'footprint', jsonb_build_object(
    'themes_count', (select count(*) from public.themes),
    'new_tables_present', (
      select count(*) from pg_tables
      where schemaname = 'public' and tablename in (
        'themes', 'service_categories', 'product_categories', 'products',
        'business_locations', 'booking_services', 'booking_slot_holds', 'salon_media')
    ),
    'private_security_functions', (
      select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname in (
        'is_active_admin', 'has_salon_role', 'can_manage_salon_settings', 'is_public_salon')
    ),
    'phase1a_policies', (
      select count(*) from pg_policies
      where schemaname = 'public' and policyname like 'phase1a_%'
    ),
    'public_salon_catalog_view', (
      select count(*) from pg_views
      where schemaname = 'public' and viewname = 'public_salon_catalog'
    ),
    'm28_membership_indexes', (
      select coalesce(jsonb_agg(indexname order by indexname), '[]'::jsonb)
      from pg_indexes
      where schemaname = 'public' and indexname in (
        'organization_members_org_user_unique',
        'organization_members_user_active_role_idx',
        'salons_organization_active_idx')
    )
  )
)) as m28_post_verify;
