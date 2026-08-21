-- =====================================================================
-- Nexora — owner location: real owner membership + required permissions
-- =====================================================================
--
-- Run MANUALLY in the Supabase SQL editor. The application never executes
-- any statement in this file.
--
-- No table, column, view or migration is created here. Everything below
-- either INSERTs into an existing table or adjusts existing grants/policies.
--
-- OWNERSHIP MODEL (existing, verified live):
--     auth.users.id
--       -> public.organization_members.user_id   (role='owner', status='active')
--       -> organization_members.organization_id
--       -> public.salons.organization_id
--       -> public.salons.id                      (deleted_at is null)
--
--   Existing helpers already in the database:
--     nexora_owner_salon_ids()
--     private.can_manage_salon_settings(id)
--
--   NOTE: public.job_salon_members is a STAFF/EMPLOYEE relationship and is
--   NOT used for ownership anywhere in the application.
--
-- AUTHORITATIVE LOCATION COLUMNS on public.salons:
--     address, latitude, longitude, location_confirmed, location_confirmed_at
--   (`location_latitude` / `location_longitude` do not exist — verified.)
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1 — Does the signed-in user already own a salon?
--          Run while authenticated as that user. One row = ready to go.
-- ---------------------------------------------------------------------
select s.id as salon_id, s.name, s.organization_id
from public.salons s
join public.organization_members m
  on m.organization_id = s.organization_id
where m.user_id = auth.uid()
  and m.role    = 'owner'
  and m.status  = 'active'
  and s.deleted_at is null;

-- Equivalent using the existing helper:
--   select nexora_owner_salon_ids();


-- ---------------------------------------------------------------------
-- STEP 2 — If STEP 1 returned nothing, find the real ids.
--          Confirm the owner account and the target salon's organization.
-- ---------------------------------------------------------------------
select id as user_id, email
from auth.users
where email = 'REPLACE_WITH_REAL_OWNER_EMAIL';

select id as salon_id, name, organization_id, is_active, deleted_at
from public.salons
where deleted_at is null
order by created_at desc
limit 50;


-- ---------------------------------------------------------------------
-- STEP 3 — Create the REAL owner membership.
--
-- Both ids are resolved by lookup, so nothing is invented: if the email or
-- salon does not exist, zero rows are inserted.
--
-- Replace ONLY the two REPLACE_WITH_* literals with values confirmed above.
-- ---------------------------------------------------------------------
insert into public.organization_members (organization_id, user_id, role, status)
select s.organization_id,
       u.id,
       'owner',
       'active'
from auth.users        as u
cross join public.salons as s
where u.email = 'REPLACE_WITH_REAL_OWNER_EMAIL'
  and s.id    = 'REPLACE_WITH_REAL_SALON_UUID'::uuid
  and s.deleted_at is null
on conflict do nothing;

-- If organization_members has extra NOT NULL columns in your project, add
-- them to the column list above; do not drop or alter any existing column.


-- ---------------------------------------------------------------------
-- STEP 4 — Verify. Re-run STEP 1: it must return exactly ONE salon.
--          More than one makes resolution ambiguous and the application
--          refuses to save rather than guessing.
-- ---------------------------------------------------------------------


-- =====================================================================
-- STEP 5 — Owner UPDATE authorization (only if not already granted)
-- =====================================================================
-- Uses the EXISTING authorization helper. Do not replace it with an
-- owner_id check and do not disable RLS.
--
--   create policy "owners update their salon location"
--     on public.salons
--     for update
--     to authenticated
--     using      (private.can_manage_salon_settings(id))
--     with check (private.can_manage_salon_settings(id));
--
--   grant update (address, latitude, longitude,
--                 location_confirmed, location_confirmed_at)
--     on public.salons to authenticated;


-- =====================================================================
-- STEP 6 — Public read for the customer nearby search
-- =====================================================================
-- The policy `salons_anon_catalogue_select` already exists and already
-- restricts anonymous access (verified / is_active / deleted_at). Do NOT
-- weaken or replace it.
--
-- The block today is at the GRANT layer, before RLS is evaluated:
--   "permission denied for table salons" (42501) for role anon.
--
-- COLUMN-GRANT SEMANTICS (verified empirically on PostgreSQL 18):
--   * RLS predicate columns (verified, is_active, deleted_at) do NOT need
--     to be granted for the POLICY itself to evaluate — the policy reads
--     them internally regardless of column privileges.
--   * BUT any column the CLIENT names in its own SELECT list or WHERE
--     clause DOES need a column grant. The application filters on
--     is_active, deleted_at and location_confirmed, so those three must be
--     granted or the query fails with 42501.
--
-- Minimum working grant — display columns + the columns the app filters on.
-- Private columns (e.g. phone) remain blocked, and `select *` still fails:
--
--   grant select (
--     id, name, address, city, slug, latitude, longitude,
--     is_active, deleted_at, location_confirmed
--   ) on public.salons to anon;
--
-- Review against your privacy requirements before applying.
-- This is a permission change only — no schema change.
