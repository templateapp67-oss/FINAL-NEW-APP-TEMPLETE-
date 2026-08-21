# Phase 2A — Schema Reconciliation + Database Hardening

> **Status: COMPLETE** (2026-08-21). Session `arena/01a02438-final-new-app-templete`.
> Implementation: `supabase/migrations/20260821000601_m33_phase2a_hardening.sql`
> Verification: `npm run test:phase-2a`, `npm run validate:migrations`, `npm run lint`, `npm run build`,
> `NEXORA_MAIN_WEBSITE_PATH=… npm run test:phase2a` (cross-repo).

## 1. Re-inspection performed (Phase 2A §1)

Every claimed gap was re-verified against the actual migrations and application
code of BOTH repositories before any change. Findings:

| Claimed gap | Confirmed status |
|---|---|
| `salons` vs `businesses` | `salons` is the only canonical tenant entity in the shared schema. `businesses` appears only in the DRAFT M01–M27 migrations and the draft-RPC consumers (`savedServiceService.ts`, `pricingPromotionService.ts`) which call never-applied draft RPCs (`save_predefined_services`, `get_theme_commerce`, …). No live shared-schema code touches `businesses`. |
| `salon_id` vs `business_id` | Every canonical shared-schema table uses `salon_id`. `business_id` exists only as (a) a JSON-key fallback in one Main Website migration (`array['salon_id','shop_id','business_id']`) and (b) draft-RPC payload parsing. **No live code uses `business_id` against `salons`** — but there was no drift guard. |
| missing unified `deleted_at` | `salons`, `services`, `products` had it (M28). **`salon_media`, `service_categories`, `product_categories` did not.** |
| missing FK delete rules | Audited: bookings/payments/orders RESTRICT (M28/M29); derived assets (`salon_media` via salon/service/product) CASCADE; membership→profile CASCADE. Correct per relationship. |
| duplicate organization memberships | Unique **index** existed (M28), but not a named constraint, and no deterministic duplicate-repair path for legacy databases (§16). |
| fragmented role storage | One two-scope authority confirmed: `profiles.platform_role` (global: customer/business_user/growth_partner/delivery_partner/admin) + `organization_members.role` (tenant: owner/staff). No other column authorizes salon access. |
| themes hardcoded in UI | Five DB-seeded themes (M28) + slugs (M32). UI constants are the offline fallback catalog + design tokens, not an authority. |
| categories not strictly bound to salon + theme | `service_categories` are global per-theme; services enforce `(category_id, theme_id)` composite FK; `product_categories` are salon+theme scoped with `(category_id, salon_id, theme_id)` composite FK. Cross-theme/cross-tenant combos are structurally rejected. |
| missing composite indexes | Missing: `services (salon_id, is_active)` (the M28 `(salon_id, theme_id, is_active, display_order)` index cannot serve a salon_id+is_active-only scan) and `service_categories (theme_id, is_active, sort_order)`. |
| stale TypeScript database types | `src/types/database.ts` lacked `deleted_at` on media/category rows. |
| geographic strategy | The actual nearby search is a client-side Haversine over approved rows (`nearbySalons.ts`); the M28 partial B-tree on (latitude, longitude) is the correct supporting index. No PostGIS dependency exists or is claimed. |

## 2. Implementation — M33 (additive, idempotent, fail-closed)

`supabase/migrations/20260821000601_m33_phase2a_hardening.sql`

1. **Canonical-naming guard (§3)** — fail-closed `DO` block: raises if any of the
   20 canonical shared-schema tables ever carries a `business_id`/`businesses_id`
   column (checked only for existing tables, so pre-M28 environments are safe).
2. **Membership uniqueness (§6, §16)** — `public.phase2a_repair_membership_duplicates()`
   deterministically resolves legacy duplicate `(organization_id, user_id)` rows
   (owner > staff, active > inactive, earliest `created_at`, `ctid` tie-break;
   the join table has no `id` column), then a real named constraint
   `organization_members_organization_user_key UNIQUE (organization_id, user_id)`
   is added; the redundant M28-era index is dropped once the constraint owns the
   index.
3. **Unified soft delete (§4)** — `deleted_at timestamptz` added to
   `salon_media`, `service_categories`, `product_categories` (NULL = not
   deleted; no backfill needed; historical rows stay auditable). `salons`,
   `services`, `products` already had it. Excluded from anon grants (internal
   column). `auth.users`, payments and booking records are untouched.
4. **Composite indexes (§13)** — `services_phase2a_salon_active_idx`
   `(salon_id, is_active) WHERE deleted_at IS NULL` and
   `service_categories_phase2a_theme_active_idx`
   `(theme_id, is_active, sort_order, id) WHERE deleted_at IS NULL`.
   Membership `(organization_id, user_id)` is now backed by the named
   constraint's index; bookings `(salon_id, appointment_start, status)` and
   products `(salon_id, is_active, display_order)` already existed (M28).
   Geographic: existing partial B-tree documented as correct for the actual
   client-side Haversine query — no fake PostGIS claim.
5. **Foundation health RPC (§21)** — `public.phase2a_foundation_health()`
   returns a JSONB report: canonical-naming violations, membership duplicates,
   orphan services/products/categories/salons, soft-deleted counts, active
   theme count, checked_at. service_role-only (never public).
6. **RLS compatibility (§18)** — no table renamed, so every existing policy
   keeps working; verified by the full test suite.

## 3. Canonical decisions (documented)

- **Entity**: `salons` (not `businesses`) — structurally superior existing
  canonical entity; `organizations → salons`; nothing dropped, no data moved.
- **FK naming**: `salon_id` everywhere; drift now fails closed (guard).
- **Roles**: one system, two scopes — `profiles.platform_role` (global) +
  `organization_members.role` (tenant). `owner`/`staff` live on membership;
  `customer`/`admin` live on `platform_role`. No `profile.role = owner`
  pattern exists anywhere.
- **Themes**: five canonical records, `theme_id` stable key + unique `slug`
  (M32). The Phase 2A prompt's example slug `full_service_family_salon`
  differs from the existing canonical `family_full_service`; the existing key
  is kept because it is already seeded, typed (`ThemeId`), tested and used by
  both repositories — renaming would churn data/UI/tests for zero benefit.
- **Categories**: service categories are theme-global by design (one catalog
  per theme, enforced per salon via `services.salon_id` + composite
  `(category_id, theme_id)` FK); product categories are salon+theme scoped
  (`product_categories.salon_id` + composite `(category_id, salon_id,
  theme_id)` FK). Both models were already structurally isolated.

## 4. Test results

```
Migration:            PASS  validate:migrations 27/27 ×2 + 21/21; M28–M33 apply
                              cleanly in order on a fresh database; M33 replays
                              idempotently
Database validation:  PASS  test:phase2a 15/15 (naming guard, membership
                              constraint + repair, soft delete, service/product
                              isolation, EXPLAIN-verified indexes, health RPC,
                              idempotency, Phase 1A/2 regression);
                              17/17 with cross-repo checks
Lint:                 PASS  tsc --noEmit, 0 errors
Typecheck:            PASS  (lint is the repo's typecheck)
Build:                PASS  vite build + esbuild server bundle
Cross-repository:     PASS  Main Website profile contract + 93 DDL statements
                              apply on the hardened schema (24 skipped only on
                              out-of-repo prerequisites); validate:main-website 10/10
```

Commands:
```bash
npm run test:phase-2a                       # validate:migrations + phase1a + phase2 + phase2a
NEXORA_MAIN_WEBSITE_PATH=/path/to/nexora-main-website npm run test:phase2a   # + cross-repo
npm run validate:main-website               # with NEXORA_MAIN_WEBSITE_PATH set
npm run lint
npm run build
```

## 5. Remaining issues

- The draft M16–M26 RPC layer (`savedServiceService.ts`, `pricingPromotionService.ts`)
  remains a separate legacy surface targeting never-applied draft migrations.
  It does not touch the shared schema and is preserved to keep the draft
  migration history + its test suites intact. A future phase may retire it.
- Repo 2 has no generated TypeScript database-types file; its DB contracts are
  column-string based (`PROFILE_COLUMNS`) and were verified against the schema.

## 6. Manual actions

1. Apply `20260821000601_m33_phase2a_hardening.sql` (after M28–M32) to the
   shared Supabase project `qwaehqsmodekbgvnaavz` via Supabase CLI/SQL editor
   after diff review.
2. Optional: `select public.phase2a_foundation_health();` as service_role to
   confirm zero integrity findings on the live database.
3. Regenerate complete TS types with `supabase gen types typescript` after
   applying M28–M33 to the live project.
