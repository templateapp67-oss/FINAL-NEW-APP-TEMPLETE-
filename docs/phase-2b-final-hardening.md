# Phase 2B — Final Database Schema Hardening & Verification

> Session `arena/01a02438-final-new-app-templete`, 2026-08-21.
> Implementation only — every listed item below produced a real
> migration/code/type change and a test outcome. No gap analysis was
> returned.
>
> Migration: `supabase/migrations/20260821000701_m34_phase2b_final_hardening.sql`
> (NEW additive migration after M33; M01–M33 untouched).
> Test suite: `scripts/test-phase2b-hardening.mjs` (19/19 with
> `NEXORA_MAIN_WEBSITE_PATH=/home/user/nexora-main-website`).

---

## 1. Canonical entity — `salons` / `salon_id` (verified, one source of truth)

Global greps in BOTH repositories:

- `nexora-main-website` (repo 2): **zero** `create table ... businesses`;
  the only `business_id` token in the whole repository is an *input alias*
  at `supabase/migrations/20260801_growth_partner_commission_and_hold.sql:293`
  (growth-partner proposal payload — not a table, column or query). Every
  table, query, type and route uses `salons` / `salon_id`
  (e.g. `app/nexora-app.tsx` marketplace + catalog fetches, `/salons` route).
  The word "businesses" appears once, in prose
  (`packages/location/src/useLocation.ts:71`).
- Repo 1 live `src/`: no query ever touches a `businesses` table.
  `business_id` appears only in external-payload parsing
  (`src/lib/pricingPromotionService.ts`, `src/lib/savedServiceService.ts` —
  third-party payload compatibility, deliberately kept) and in the
  never-applied M01–M27 draft layer (documented legacy, preserved unchanged).

**Resolution**: `salons` + `salon_id` is THE single canonical entity/FK in
both repositories. No compatibility view or rename was created — a view
would be a duplicate API with duplicate ownership. M33's canonical-naming
guard (`phase2a_guard_canonical_naming`) already fails closed if any
canonical table ever gains a real `business_id` column.

## 2. Foreign keys — explicit ON DELETE, never accidental cascade (§2)

Repo 2 live migrations (`20260804_shop_owner_phase2_full.sql` +
`20260812_phase7_shared_location_security.sql`) defined **six CASCADE** FKs
from business-owned tables to `salons`; repo 1's M28 defined two more
(`salon_media.salon_id`, and the composite service/product tenant FKs).

**M34 replaces every accidental cascade with RESTRICT** (discovered via the
`pg_constraint` catalog, so it works whether the live schema or the M28
replay is present):

| Table | FK | Repo-2 live rule | M34 rule |
|---|---|---|---|
| `services` | salon_id → salons(id) | CASCADE | **RESTRICT** |
| `staff` | salon_id → salons(id) | CASCADE | **RESTRICT** |
| `offers` | salon_id → salons(id) | CASCADE | **RESTRICT** |
| `salon_hours` | salon_id → salons(id) | CASCADE | **RESTRICT** |
| `salon_public_websites` | salon_id → salons(id) | CASCADE | **RESTRICT** |
| `business_locations` | salon_id → salons(id) | CASCADE | **RESTRICT** |
| `salon_media` | salon_id → salons(id) | CASCADE (M28) | **RESTRICT** |
| `salon_media` | (service_id, salon_id) → services | CASCADE (M28) | **RESTRICT** |
| `salon_media` | (product_id, salon_id) → products | CASCADE (M28) | **RESTRICT** |
| `bookings` | salon_id → salons(id) | RESTRICT | RESTRICT (unchanged) |
| `growth_partner_commissions` | salon_id → salons(id) | RESTRICT | RESTRICT (unchanged) |

Rationale: bookings, payments, commissions and financial history must never
be destroyed by a parent delete. Business-owned operational rows
(services/staff/offers/hours/website/location/media) are refused deletion
via RESTRICT; the supported removal path is soft delete (`deleted_at`).
M34 also keeps the existing RESTRICT rules on `salons.organization_id`,
`salon_media.created_by → profiles`, `salon_media.theme_id → themes` and
the bookings/customer/payment FKs from M28/M29.

Verified by tests: zero CASCADE FK from the business-owned set to `salons`
remains; `delete from salons` with children is refused; `delete from
services` that still has media is refused.

## 3. Membership uniqueness (§3)

Already enforced by M33's named `organization_members_organization_user_key`
UNIQUE (organization_id, user_id) plus the deterministic repair RPC
`phase2a_repair_membership_duplicates` (ctid-keyed survivor logic for the
join table). M34 re-verifies it; the Phase 2B final test proves duplicate
insertion is rejected:

```
FINAL 1 — duplicate organization membership is rejected ......... PASS
```

## 4. Canonical role system (§4) — TEXT + CHECK, one representation

The shared schema has NO role enum — and M34 deliberately does not create
one. The canonical representation is TEXT columns with CHECK constraints,
read by both repositories:

- `profiles.platform_role` — 5 values: `customer`, `business_user`,
  `growth_partner`, `delivery_partner`, `admin`
  (`profiles_platform_role_check`, re-asserted by M34).
- `organization_members.role` — tenant scope: `owner`, `staff`
  (`organization_members_role_check`, re-asserted by M34).
- Repo 2's `packages/auth/src/roles.ts` is the edge authority: input
  aliases (`owner`, `staff`, `shop_owner`, `user`, …) normalize to the same
  canonical values; the DB never stores aliases; `private.normalize_platform_role()`
  enforces server-side.
- Repo 1's `src/types/database.ts` `PlatformRole` matches the same five
  values. Repo 1's draft-RPC role surface is a separate legacy layer,
  documented as such (Phase 2A resolution) — no enum, no duplicate role
  system, no unsafe casts exist in either repo.

Verified by test: both CHECK constraints exist with the exact value sets.

## 5. Soft delete (§5) — standardized `deleted_at`

| Entity | `deleted_at` | Source |
|---|---|---|
| `salons` | ✔ | pre-M28 / M34 re-assert |
| `services` | ✔ | M28 / M34 re-assert |
| `products` | ✔ | M28 / M34 re-assert |
| `staff` | ✔ **new in M34** | repo 2's marketplace query already filters `.is('deleted_at', null)` but no migration provided the column — closed |
| `salon_media` | ✔ | M33 / M34 re-assert |
| `service_categories` | ✔ | M33 / M34 re-assert |
| `product_categories` | ✔ | M33 / M34 re-assert |
| payments, orders, webhooks, bookings, `auth.users` | deliberately **none** | audit/history must stay physically immutable |

Active-catalog queries in BOTH repositories exclude deleted rows:

- Repo 1: `PublicSalonView.tsx` (`.eq('is_active', true)` +
  `.is('deleted_at', null)`), `ownerDashboard.ts`, `ownerSalon.ts`
  (`salonIdsFromMembership` + `owner_salon_ids()` RPC) — all verified;
  **`src/lib/salonMediaService.ts` `listPublicSalonMedia` fixed in this
  phase** to add `.is('deleted_at', null)` to the public media listing.
- Repo 2: `fetchSalonMarketplace` (services: is_active +
  is_bookable_online + deleted_at null; staff: deleted_at null), catalog
  fetch (salons: verified + is_active + deleted_at null) — all verified.
- M34 also provides the read-only safety views `active_services`,
  `active_products`, `active_service_categories` (§6 below) as a guarded
  default for future consumers.

Legacy note: repo 1's M25-era RPC `search_theme_services` queries a
pre-canonical `services` shape (`business_id`, `short_description`,
`nexora_current_manageable_business_id()`). None of those exist on the
canonical tables, the function has zero live callers in repo 1's app, and
it is part of the documented legacy draft-RPC layer — not a Phase 2B gap
(the canonical catalog path is `PublicSalonView` + the views above).

## 6. Default active-record behavior (§6) — safe views

```sql
create or replace view public.active_services (security_barrier)
  — services where is_active and deleted_at is null
    and parent salon is_active and not deleted;
create or replace view public.active_products (security_barrier) — same;
create or replace view public.active_service_categories (security_barrier)
  — categories where is_active and deleted_at is null
    and parent theme is_active.
```

Security-barrier, owner-rights like M28's `public_salon_catalog`; every
safety filter is baked into the body; only public-safe columns are granted
to `anon`/`authenticated` (column-level `grant select`); base tables stay
under their existing RLS. These are projections, not duplicate data.

## 7. `updated_at` automation (§7) — database-side timestamps

- `organization_members` gains `updated_at timestamptz not null default now()`
  (was the only membership-table field without it).
- Reusable trigger `private.phase2_set_updated_at()` (M28) attached by M34 as
  `trg_phase2_set_updated_at` on **profiles** and **organization_members**
  (the two canonical mutable tables that had no trigger yet — every other
  entity already has it: organizations, salons, themes, service_categories,
  services, products, product_categories, business_locations).
- Safety: M34 only attaches the trigger when the table has `updated_at` AND
  no existing BEFORE ROW trigger (the Main Website ships its own profiles
  trigger on live data — never double-triggered).
- No frontend/client timestamps; INSERTs use `DEFAULT now()`.

Verified by test: an UPDATE on `organization_members` and on `profiles`
auto-refreshes `updated_at`; an INSERT returns database timestamps.

## 8. Theme slug uniqueness (§8)

- Canonical five themes with unique slugs: `barber_mens_grooming`,
  `hair_studio_color_bar`, `beauty_skin_spa`, **`family_full_service`**,
  `nail_lash_studio`.
- The brief's `full_service_family_salon` is an **example name**, not a
  required value: `family_full_service` is the established canonical slug
  (M28/M32 seeds, both repos' type layers, PGlite suites). M34 does NOT
  rename it (renaming would churn data + app references for zero benefit)
  and documents this explicitly in the migration header.
- `themes.slug` UNIQUE re-asserted (`themes_slug_unique`, M32); no duplicate
  theme rows exist; M34's data path is unchanged (no UPDATE needed).

Verified by test: duplicate slug insertion is rejected
(`FINAL 2 — duplicate theme slug is rejected ......... PASS`) and the five
canonical slugs are unique and intact.

## 9. Theme isolation (§9) — categories are theme-global by design

`service_categories` is a theme-scoped catalog (M28: `(id, theme_id)` UNIQUE,
`(theme_id, name)` UNIQUE; M33 partial index on `(theme_id, is_active,
sort_order, id)`). Categories are NOT salon-scoped in the current schema
(they are shared across salons within a theme — M28 `service_categories`
has no salon_id column, and repo 2's live schema has no salon-level
categories either). Creating a fake `(salon_id, theme_id)` composite would
block legitimate shared categories, so M34 does NOT add one — the isolation
rule is enforced on the entities that ARE salon-scoped:

- `services`: `(category_id, theme_id)` FK → `service_categories(id, theme_id)`
  (M28) — a service can only reference a category of its own theme.
- `products`: `(category_id, salon_id, theme_id)` FK →
  `product_categories(id, salon_id, theme_id)` (M28) — same guarantee at
  salon+theme scope.

Verified by test:
`FINAL 7 — cross-theme category/service combination is rejected ......... PASS`
(a barber-theme category cannot be used by a hair-theme service).

## 10. Service isolation (§10) — enforced at DB level

`phase1a_services_category_theme_fk` + `phase1a_products_category_tenant_fk`
(M28 composite FKs) enforce the category/theme/salon combination in the
database; M34's `salon_media` composite RESTRICT FKs
(`(service_id, salon_id)`, `(product_id, salon_id)`) extend the same
tenant-integrity pattern to media. No reliance on frontend filtering.

## 11. Performance indexes (§11) — verified, not duplicated

| Requirement | Index | Where |
|---|---|---|
| `services (salon_id, is_active, deleted_at)` | `services_phase2a_salon_active_idx (salon_id, is_active) WHERE deleted_at IS NULL` | M33 (EXPLAIN-verified) |
| `products (salon_id, is_active, deleted_at)` | `products_salon_active_order_idx (salon_id, is_active, display_order) WHERE deleted_at IS NULL` | M28 |
| `service_categories (salon_id, theme_id, is_active, deleted_at)` | `service_categories_phase2a_theme_active_idx (theme_id, is_active, sort_order, id) WHERE deleted_at IS NULL` (categories are theme-global — no salon_id, see §9) | M33 (EXPLAIN-verified) |
| `organization_members (organization_id, user_id)` | named UNIQUE constraint index `organization_members_organization_user_key` | M33 |
| `bookings (salon_id, booking_date, status)` | `bookings_salon_start_status_idx (salon_id, appointment_start, status)` | M28 |
| Locations | `business_locations_approved_coordinates_idx` partial B-tree `(latitude, longitude) WHERE approval_status='approved'` | M28 |

Locations honesty: the real nearby search is a client-side Haversine over
approved `business_locations` rows (repo 1 `src/lib/locationService` /
repo 2 `packages/location`). A B-tree on `(latitude, longitude)` is NOT
claimed to be a radius search; PostGIS is not enabled blindly (not present
in the project, and enabling it would be a separate infra decision).

## 12. TypeScript database types (§12)

- `src/types/database.ts`: `OrganizationMemberRow` gains `updated_at: string`
  (M34 adds the column). `PlatformRole` already matches the canonical five
  values; `ThemeId` keeps `family_full_service`; `deleted_at` on media and
  category rows came in Phase 2A.
- Global sweeps: no stale `business_id`/`businesses` in either repo's types
  (only the documented external-payload parsing surfaces); no old role
  enums; no old schema fields. Repo 2's types are generated from its own
  toolchain and were not regenerated — no M34 type surface (columns/types
  added) is referenced by repo 2's type layer, so no repo-2 type change is
  required. `npm run typecheck` in repo 2 passes.

## 13. Both repositories (§13)

Repo 2 required no app change this phase: its live queries already use
`salon_id`, already filter `deleted_at`/`is_active`, and its role model is
the canonical one. M34's DDL-apply check confirms 93 Main Website DDL
statements still apply cleanly on the final hardened schema. Repo 1's one
required app change (public media listing filter) is in
`src/lib/salonMediaService.ts`. No repo-specific database abstraction
contradicting the canonical schema was created.

## 14. Migration safety (§14)

M34 is a NEW additive migration (post-M33). No history rewrite, no dropped
tables, no deleted data, no fake records, no hardcoded IDs, correct order
(after M28–M33). Idempotent: replaying M34 on the hardened schema is
verified clean. All constraint work is catalog-guarded so it behaves
correctly on both the live repo-2 schema and the M28 replay.

## 15. Database validation (§15)

Covered by `scripts/test-phase2b-hardening.mjs` (identity, canonical
entity + FK naming, five themes + unique slugs, catalog, integrity,
soft delete, updated_at triggers, indexes) and the regression suite
(`phase2a_foundation_health()` returns 0 duplicates / 5 themes / no
naming violations).

## 16. Application validation (§16) — exact results

| Command | Repo 1 (`FINAL-NEW-APP-TEMPLETE-`) | Repo 2 (`nexora-main-website`) |
|---|---|---|
| `npm run lint` | **PASS** (`tsc --noEmit`, 0 errors) | **FAIL** — 3 pre-existing errors, 18 warnings: `app/SplashOverlay.tsx:63:5` react-hooks setState-synchronously-in-effect; `app/nexora-app.tsx:6162:72` and `:6162:88` react/no-unescaped-entities (`Don't`). No repo-2 file was modified by this phase; these errors pre-date Phase 2B. |
| `npm run typecheck` | n/a (lint is `tsc --noEmit`) | **PASS** (`sites-env.sh -- tsc --noEmit`, exit 0) |
| `npm run build` | **PASS** (vite + esbuild server bundle) | **BLOCKED BY DESIGN** — `scripts/build-job-portal.sh`/`build-verified.sh` fail closed: `VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required` and `..._ANON_KEY is required` for shared project `qwaehqsmodekbgvnaavz`; scripts explicitly refuse placeholder backends ("No placeholder backend/key is ever injected"). Credentials are not available in this environment (constraint 12), so the build cannot run. |

## 17. Final database tests (§17) — all 8 mandatory + verification

```
FINAL 1 — duplicate organization membership is rejected ......... PASS
FINAL 2 — duplicate theme slug is rejected ...................... PASS
FINAL 3 — invalid foreign key is rejected ...................... PASS
FINAL 4 — soft-deleted service absent from active catalog ....... PASS
FINAL 5 — soft-deleted product absent from active catalog ....... PASS
FINAL 6 — updated_at changes automatically on UPDATE ........... PASS
FINAL 7 — cross-theme category/service pair is rejected ........ PASS
FINAL 8 — cross-tenant access denied by existing RLS ........... PASS
```
Plus: FK-rule assertions (no CASCADE to salons remains; salon delete
refused; service-with-media delete refused), role constraints, theme
set/slug uniqueness, staff soft delete (marketplace query contract),
safe views (anon-readable, column-limited), M34 idempotency, Phase 1A/2A
regression, and cross-repo Main Website DDL compatibility (93 statements
apply cleanly). Suite total: **19/19 PASS** (in-repo without the env var:
18/18).

Full suite: `npm run test:phase-2b` (validate:migrations + phase-2a + phase2b).

## 18. Manual steps to apply M34 to the shared project `qwaehqsmodekbgvnaavz`

Supabase/dashboard credentials are not available here; the migration was
implemented and verified locally against PGlite (M28→M34 clean replay).

1. Open the Supabase dashboard for `qwaehqsmodekbgvnaavz` → SQL Editor.
2. Apply in order (the M34 file assumes M28–M33 state):
   - `supabase/migrations/20260821000101_m28_phase1a_unified_salon_foundation.sql`
   - `supabase/migrations/20260821000201_m29_phase1a_razorpay_foundation.sql`
   - `supabase/migrations/20260821000301_m30_phase1a_storage_foundation.sql`
   - `supabase/migrations/20260821000401_m31_phase1a_authoritative_booking_creation.sql`
   - `supabase/migrations/20260821000501_m32_phase2_canonical_foundation.sql`
   - `supabase/migrations/20260821000601_m33_phase2a_hardening.sql`
   - `supabase/migrations/20260821000701_m34_phase2b_final_hardening.sql`
3. M34's preflight fails loudly if any canonical table is missing — nothing
   partial is applied (single transaction).
4. After applying, run `select public.phase2a_foundation_health();` (service
   role) and re-run `npm run test:phase-2b` pointed at the live project.

The only blocked operation is the live apply itself (credentials).
