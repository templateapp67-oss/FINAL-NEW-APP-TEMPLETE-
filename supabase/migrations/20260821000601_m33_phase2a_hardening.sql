-- M33 / Phase 2A: schema reconciliation + database hardening
--
-- Closes the remaining confirmed gaps in the canonical unified foundation
-- (Phase 2 / M32). Everything here is additive, idempotent and fail-closed.
--
-- Confirmed-gap fixes in this migration:
--
--   1. Canonical-naming guard      — fail closed if a canonical shared-schema
--                                    table ever carries a `business_id`
--                                    column (Phase 2A §3).
--   2. Membership uniqueness       — deterministic duplicate repair, then a
--                                    REAL named UNIQUE constraint
--                                    (organization_id, user_id) instead of a
--                                    bare index (Phase 2A §6, §16).
--   3. Unified soft delete         — deleted_at on salon_media,
--                                    service_categories and product_categories
--                                    (Phase 2A §4). salons/services/products
--                                    already had it (M28).
--   4. Composite indexes           — services (salon_id, is_active) partial,
--                                    service_categories (theme_id, is_active,
--                                    sort_order) (Phase 2A §13). The existing
--                                    products (salon_id, is_active,
--                                    display_order) index already covers the
--                                    products pattern; the M28 approved
--                                    locations partial B-tree is the correct
--                                    strategy for the actual client-side
--                                    Haversine query (no PostGIS needed).
--   5. Foundation health RPC       — read-only verification surface used by
--                                    the Phase 2A test suite and by operators
--                                    to prove data integrity (§21).
--
-- Canonical naming decision (verified against both repositories):
--   * ONE canonical tenant chain: auth.users -> profiles ->
--     organization_members -> organizations -> salons.
--   * `salons` / `salon_id` is the canonical entity/FK everywhere in the
--     shared schema. The draft M01–M27 `businesses` model was never applied
--     to the shared database; its migrations and the draft-RPC consumers
--     (savedServiceService/pricingPromotionService) are preserved unchanged
--     as a deliberately separate legacy layer and are NOT part of the shared
--     schema. The guard below makes future drift impossible.
--
-- Role authority (documented, unchanged):
--   * profiles.platform_role           -> global role (customer, business_user,
--                                          growth_partner, delivery_partner,
--                                          admin)
--   * organization_members.role        -> tenant role (owner, staff)
--   No other column authorizes salon access. `staff.role` and job-portal
--   tables are display/domain data, not authorization.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight: canonical tables must exist.
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles', 'organizations', 'organization_members', 'salons',
    'themes', 'service_categories', 'services', 'products',
    'product_categories', 'salon_media', 'business_locations'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception
        'Phase 2A preflight: required canonical table public.% is missing. Reconcile the existing object instead of creating a competing model.',
        required_table;
    end if;
  end loop;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Canonical-naming guard (§3): fail closed on `business_id` drift.
--    Only the canonical shared-schema tables are checked, and only when they
--    exist, so environments where M28+ has not been applied yet are safe.
-- ---------------------------------------------------------------------------
do $canonical_naming_guard$
declare
  target_table text;
  offender record;
begin
  foreach target_table in array array[
    'profiles', 'organizations', 'organization_members', 'salons',
    'salon_public_websites', 'services', 'product_categories', 'products',
    'business_locations', 'salon_media', 'bookings', 'booking_services',
    'booking_slot_holds', 'payment_orders', 'payments', 'payment_webhook_events',
    'booking_request_keys', 'themes', 'service_categories', 'predefined_services'
  ] loop
    if to_regclass('public.' || target_table) is not null then
      for offender in
        select c.column_name
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = target_table
          and c.column_name in ('business_id', 'businesses_id')
      loop
        raise exception
          'Phase 2A naming guard: canonical table public.% carries legacy column %.%. The canonical foreign key is salon_id; reconcile the column instead of letting naming diverge.',
          target_table, target_table, offender.column_name;
      end loop;
    end if;
  end loop;
end
$canonical_naming_guard$;

-- ---------------------------------------------------------------------------
-- 2. Membership uniqueness (§6, §16): repair duplicates deterministically,
--    then enforce a real named UNIQUE constraint.
-- ---------------------------------------------------------------------------
-- The repair keeps, for every (organization_id, user_id) pair, the row that
-- best represents the active membership: role 'owner' beats 'staff', active
-- beats inactive, earliest created_at wins on ties, and the physical row id
-- breaks remaining ties. It never silently deletes a whole membership — only
-- exact duplicate rows of the same pair. (organization_members is a pure
-- join table without its own id column, so ctid is the tie-breaker.)
create or replace function public.phase2a_repair_membership_duplicates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer := 0;
  duplicate record;
begin
  for duplicate in
    select
      organization_id,
      user_id,
      array_agg(ctid order by
        case when role = 'owner' then 0 else 1 end,
        case when is_active then 0 else 1 end,
        created_at nulls last,
        ctid
      ) as keep_order
    from public.organization_members
    group by organization_id, user_id
    having count(*) > 1
  loop
    -- Keep the best row; remove the rest of the exact same pair.
    delete from public.organization_members om
    where om.organization_id = duplicate.organization_id
      and om.user_id = duplicate.user_id
      and om.ctid <> duplicate.keep_order[1];
    removed := removed + array_length(duplicate.keep_order, 1) - 1;
  end loop;
  return removed;
end
$$;

revoke all on function public.phase2a_repair_membership_duplicates()
  from public, anon, authenticated;
grant execute on function public.phase2a_repair_membership_duplicates()
  to service_role;

do $membership_unique$
begin
  -- Repair first: a duplicate pair would block the named constraint below.
  perform public.phase2a_repair_membership_duplicates();

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_organization_user_key'
  ) then
    alter table public.organization_members
      add constraint organization_members_organization_user_key
      unique (organization_id, user_id);
  end if;
end
$membership_unique$;

-- If the M28-era unique index exists under its old name it is now redundant
-- (the named constraint owns its own index). Dropping the duplicate index is
-- safe and keeps the catalog clean; the constraint remains authoritative.
do $membership_index_cleanup$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'organization_members'
      and indexname = 'organization_members_org_user_unique'
  ) and exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_organization_user_key'
  ) then
    drop index public.organization_members_org_user_unique;
  end if;
end
$membership_index_cleanup$;

-- ---------------------------------------------------------------------------
-- 3. Unified soft delete (§4): deleted_at on the remaining canonical mutable
--    entities. NULL means "not deleted"; no backfill needed. Existing
--    queries that filter status/is_active keep working; new soft-deleted
--    rows are excluded by the same filters plus deleted_at is null.
-- ---------------------------------------------------------------------------
alter table public.salon_media
  add column if not exists deleted_at timestamptz;

alter table public.service_categories
  add column if not exists deleted_at timestamptz;

alter table public.product_categories
  add column if not exists deleted_at timestamptz;

-- The updated_at trigger (M32) already covers these tables; deleting a row
-- sets only deleted_at so historical rows stay auditable.

-- ---------------------------------------------------------------------------
-- 4. Composite indexes (§13) based on the real query patterns:
--    - services: public + owner lists filter (salon_id, is_active) and
--      exclude deleted rows (the M28 (salon_id, theme_id, is_active,
--      display_order) index cannot serve a salon_id+is_active-only scan).
--    - service_categories: catalog reads filter (theme_id, is_active) and
--      order by sort_order.
-- ---------------------------------------------------------------------------
create index if not exists services_phase2a_salon_active_idx
  on public.services (salon_id, is_active)
  where deleted_at is null;

create index if not exists service_categories_phase2a_theme_active_idx
  on public.service_categories (theme_id, is_active, sort_order, id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 5. Foundation health RPC (§21): read-only verification surface.
--    Returns a JSONB report of data-integrity findings. Zero findings means
--    a healthy canonical foundation. service_role only — never public.
-- ---------------------------------------------------------------------------
create or replace function public.phase2a_foundation_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report jsonb;
begin
  select jsonb_build_object(
    'canonical_naming_violations', (
      select coalesce(jsonb_agg(t.table_name || '.' || c.column_name), '[]'::jsonb)
      from (
        values
          ('profiles'), ('organizations'), ('organization_members'), ('salons'),
          ('salon_public_websites'), ('services'), ('product_categories'),
          ('products'), ('business_locations'), ('salon_media'), ('bookings'),
          ('booking_services'), ('booking_slot_holds'), ('payment_orders'),
          ('payments'), ('payment_webhook_events'), ('booking_request_keys'),
          ('themes'), ('service_categories')
      ) as t(table_name)
      join information_schema.columns c
        on c.table_schema = 'public' and c.table_name = t.table_name
        and c.column_name in ('business_id', 'businesses_id')
    ),
    'membership_duplicates', (
      select count(*)::int
      from (
        select organization_id, user_id
        from public.organization_members
        group by organization_id, user_id
        having count(*) > 1
      ) d
    ),
    'services_without_salon', (
      select count(*)::int
      from public.services s
      where not exists (select 1 from public.salons x where x.id = s.salon_id)
    ),
    'products_without_salon', (
      select count(*)::int
      from public.products p
      where not exists (select 1 from public.salons x where x.id = p.salon_id)
    ),
    'categories_without_theme', (
      select count(*)::int
      from public.service_categories sc
      where not exists (select 1 from public.themes t where t.id = sc.theme_id)
    ),
    'salons_without_organization', (
      select count(*)::int
      from public.salons s
      where not exists (select 1 from public.organizations o where o.id = s.organization_id)
    ),
    'soft_deleted', jsonb_build_object(
      'salons', (select count(*)::int from public.salons where deleted_at is not null),
      'services', (select count(*)::int from public.services where deleted_at is not null),
      'products', (select count(*)::int from public.products where deleted_at is not null),
      'salon_media', (select count(*)::int from public.salon_media where deleted_at is not null),
      'service_categories', (select count(*)::int from public.service_categories where deleted_at is not null),
      'product_categories', (select count(*)::int from public.product_categories where deleted_at is not null)
    ),
    'themes', (
      select count(*)::int from public.themes where is_active = true
    ),
    'checked_at', now()
  ) into report;

  return report;
end
$$;

revoke all on function public.phase2a_foundation_health()
  from public, anon, authenticated;
grant execute on function public.phase2a_foundation_health()
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS compatibility (§18): no table rename happened, so every existing
--    policy (Phase 1A + Main Website) keeps working unchanged. The new
--    columns are internal: deleted_at is intentionally NOT granted to anon;
--    the existing table-level grants to authenticated/service_role cover the
--    member back-office, exactly like the M28 columns.
-- ---------------------------------------------------------------------------

commit;
