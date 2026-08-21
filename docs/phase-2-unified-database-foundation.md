# Phase 2 — Unified Supabase Database Foundation (Canonical Schema)

> **Status: COMPLETE** (2026-08-21). Session `arena/01a02438-final-new-app-templete`.
> Implementation: `supabase/migrations/20260821000501_m32_phase2_canonical_foundation.sql`
> Verification: `npm run test:phase2`, `npm run test:phase1a`, `npm run validate:migrations`,
> `npm run validate:main-website`, `npm run lint`, `npm run build`.

## 1. Objective

Continue from Phase 1 (M01–M27 drafts) and Phase 1A (M28–M31 shared-backend
migrations): implement the **canonical unified Supabase database foundation**
for BOTH repositories on ONE Supabase database:

1. `templateapp67-oss/FINAL-NEW-APP-TEMPLETE-` (Template / Salon Website Builder)
2. `janhvitiwari627-hue/nexora-main-website` (Main Website)

No second backend, no repository-specific duplicates, no new database.

## 2. What was inspected (both repositories)

| Repository | State inspected |
|---|---|
| Template app | M01–M27 draft migrations (businesses-model, never applied), M28–M31 Phase 1A shared-schema migrations, `src/types/database.ts` (Phase 1A subset), `scripts/validate-migrations.mjs`, `scripts/test-phase1a-foundation.mjs`, `scripts/validate-main-website-compat.mjs`, frontend consumers (`ownerSalon.ts`, `salonLocationService.ts`, `themeCatalogService.ts`, `salonWebsiteService.ts`, `useAuth.ts`, `supabaseClient.ts`) |
| Main Website | 19 live-applied migrations for shared project `qwaehqsmodekbgvnaavz` (`profiles`, `salons`, `services`, `staff`, `bookings`, `salon_public_websites`, `business_locations`, customer/growth-partner tables), `packages/auth/src/session.ts` (profile read contract), `packages/auth/src/roles.ts` (role vocabulary) |

### Findings that drove the design

- **One canonical tenant chain already exists**: `auth.users → profiles →
  organization_members → organizations → salons`. Both repositories already
  write to the same shared project; `salons` is the canonical business entity
  (no separate `businesses` table exists in the shared schema).
- **One role system already exists** (two scopes): `profiles.platform_role`
  (`customer`, `business_user`, `growth_partner`, `delivery_partner`, `admin`)
  is the global role; `organization_members.role` (`owner`, `staff`) is the
  tenant-scoped role. The required Phase 2 roles map 1:1: owner/staff →
  `organization_members.role`, customer/admin → `profiles.platform_role`.
- **Five canonical themes already exist** (seeded by M28) with `theme_id`
  keys; no `slug` column existed yet.
- **Salons had no database-authoritative theme binding** — the selected theme
  lived only in frontend state / `salon_public_websites.template_key`.
- **Organizations had no status/timestamps**; `organization_members` had no
  `created_at`; `business_locations` had no `created_at`; `services` had no
  timestamps in the pre-Phase-2 fixture shape.
- **No duplicate entities were found** — nothing to merge; M32 only closes the
  remaining canonical gaps additively.

## 3. Implementation — M32 (additive, idempotent, fail-closed)

`supabase/migrations/20260821000501_m32_phase2_canonical_foundation.sql`

| § | Change |
|---|---|
| 0 | Fail-closed preflight: required canonical tables/columns must exist; the five canonical themes must exist (never re-seeded, so no duplicate theme records are possible). |
| §9 | `themes.slug` — backfilled from `theme_id`, `NOT NULL`, unique constraint `themes_slug_unique`, format check `themes_slug_check` (`^[a-z0-9][a-z0-9_-]*$`). |
| §11 | `service_categories.slug` — deterministic slugify of the name with per-theme collision suffixing, `NOT NULL`, unique `(theme_id, slug)` + format check. |
| §10 | `salons.theme_id uuid REFERENCES themes(id) ON DELETE RESTRICT` (nullable — existing salons are never force-assigned), partial index `salons_theme_phase2_idx`, and RPC `public.phase2_set_salon_theme(salon_id, theme_id)` — SECURITY DEFINER, reuses the Phase 1A `private.can_manage_salon_settings` guard (or service_role), validates the theme is active, bumps `updated_at`. |
| §5 | `organizations.status` default `'active'` + check (`active`,`inactive`,`archived`), `created_at`, `updated_at`. |
| §6 | `organization_members.created_at` (duplicate membership already blocked by M28's unique `(organization_id, user_id)` index). |
| §8 | `business_locations.created_at` — nullable add, backfilled from `submitted_at` (history preserved), then `NOT NULL DEFAULT now()`. |
| §12 | `services.created_at` / `updated_at` where absent. |
| §18 | `private.phase2_set_updated_at()` trigger function; `trg_phase2_set_updated_at` attached to every canonical mutable table that has `updated_at` and no existing row-level BEFORE trigger (live tables that already ship the Main Website's `touch_updated_at` trigger are left untouched). |
| §17 | `products_theme_phase2_idx` (the composite product-category FK does not auto-create an index). Tenant/active/geo indexes already existed from M28. |
| §22 | Column-limited grants: the new public-safe columns (`themes.slug`, `service_categories.slug`, `business_locations.created_at`) are granted to `anon`/`authenticated`; RLS policy surface is unchanged (deep RLS is Phase 3). |

## 4. Tables created

**None.** Every required canonical entity already existed (or was created by
M28 in Phase 1A). M32 only alters existing tables — this is the reconciliation
result, not an omission.

## 5. Tables modified

| Table | What changed |
|---|---|
| `themes` | + `slug` (NOT NULL, unique, format check) |
| `service_categories` | + `slug` (NOT NULL, unique per `theme_id`, format check) |
| `salons` | + `theme_id` FK → `themes(id)`, + `created_at`, + `updated_at` |
| `organizations` | + `status`, + `created_at`, + `updated_at` |
| `organization_members` | + `created_at` |
| `business_locations` | + `created_at` (backfilled from `submitted_at`) |
| `services` | + `created_at`, + `updated_at` (where absent) |

## 6. Columns created

- `themes.slug` (text, NOT NULL)
- `service_categories.slug` (text, NOT NULL)
- `salons.theme_id` (uuid, nullable FK), `salons.created_at`, `salons.updated_at`
- `organizations.status` (text, NOT NULL DEFAULT 'active'), `organizations.created_at`, `organizations.updated_at`
- `organization_members.created_at` (timestamptz, NOT NULL DEFAULT now())
- `business_locations.created_at` (timestamptz, NOT NULL DEFAULT now())
- `services.created_at`, `services.updated_at` (timestamptz, NOT NULL DEFAULT now())

## 7. Foreign keys

| Constraint | Relationship |
|---|---|
| `salons_theme_phase2_fk` | `salons.theme_id → themes(id)` ON DELETE RESTRICT |

(Preexisting Phase 1A FKs — `profiles→auth.users`, `organization_members→profiles`,
`salons→organizations`, `services→salons`, `services→themes`,
`services→service_categories(id, theme_id)`, `business_locations→salons`,
`products→product_categories(id, salon_id, theme_id)`,
`booking_services→services(id, salon_id)`, payments/bookings chain — remain untouched.)

## 8. Constraints added

- `themes_slug_unique` (unique slug), `themes_slug_check`
- `service_categories_theme_slug_unique` (unique (theme_id, slug)), `service_categories_slug_check`
- `salons_theme_phase2_fk`
- `organizations_status_check`

## 9. Indexes added

- `salons_theme_phase2_idx` (salons.theme_id, partial: theme_id NOT NULL AND deleted_at IS NULL)
- `products_theme_phase2_idx` (products.theme_id, partial: deleted_at IS NULL)

## 10. Functions / triggers

- `public.phase2_set_salon_theme(uuid, uuid)` — authoritative salon-theme binding RPC (owner/service_role only).
- `private.phase2_set_updated_at()` + `trg_phase2_set_updated_at` on `organizations`, `salons`, `themes`, `service_categories`, `services`, `products`, `product_categories`, `business_locations`.

## 11. Migrations

`supabase/migrations/20260821000501_m32_phase2_canonical_foundation.sql` (the
only new file; M28–M31 and M01–M27 are unchanged and re-verified).

## 12. Types

`src/types/database.ts` regenerated/updated (canonical subset): added
`OrganizationRow`, `ThemeRow`, `ThemeId`, `ServiceCategoryRow`,
`ProductCategoryRow`, `SetSalonThemeResult`, `OrganizationStatus`; extended
`SalonRow` (`theme_id`, `created_at`, `updated_at`), `OrganizationMemberRow`
(`created_at`), `ServiceRow` (`created_at`, `updated_at`), `ProductRow`
(`created_at`, `updated_at`), `BusinessLocationRow` (`created_at`), and
`PlatformRole` (`delivery_partner`). No application code imports this file
(verified), so there is no downstream type breakage.

## 13. Test results

```
Migration:    PASS   (validate:migrations: 27/27 ×2 + 21/21 functional tests;
                     test:phase1a 11/11 + 3/3; test:phase2 17/17;
                     M32 replay/idempotency verified)
Lint:         PASS   (tsc --noEmit, 0 errors)
Typecheck:    PASS   (lint is the repo's typecheck; tsc --noEmit)
Build:        PASS   (vite build + esbuild server bundle)
Cross-repo:   PASS   (validate:main-website 10/10 across 19 Main Website
                     migrations; cross-repo block of test:phase2: Main Website
                     PROFILE_COLUMNS contract exists in the unified schema;
                     93 Main Website DDL statements apply cleanly on the
                     unified schema, 24 skipped only on out-of-repo
                     prerequisites such as growth_partners/support_tickets —
                     zero canonical conflicts)
```

`npm run test:phase2` runs `validate:migrations && test:phase1a && test:phase2`.
Cross-repository checks run automatically when `NEXORA_MAIN_WEBSITE_PATH` is
set (19/19 tests).

## 14. Deferred to later phases

- **Deep RLS / authz redesign** → Phase 3 (existing Phase 1A policies and
  grants remain exactly as they were; M32 only adds column grants for the new
  public-safe columns).
- **Bookings/availability/slots** → Phase 4 (M31's authoritative booking
  creation is untouched).
- **Razorpay payment flows** → Phase 5 (M29 foundations untouched).
- **Media/gallery/storage system** → later phase (M30 foundations untouched;
  `salon_media.product_id/service_id` FKs already exist for future wiring).
- **`profiles.display_name` / `avatar` columns** — intentionally NOT added:
  neither application reads/writes them; both use `full_name` + `avatar_url`.
  Adding unused columns would violate the "only add fields required by the
  existing application" rule.
- **`salons.status` text column** — intentionally NOT added: the shared schema
  already models status with `is_active` + `deleted_at` (+ `verified`), and a
  parallel status column would create a second, drift-prone status system.

## 15. Manual actions

1. Apply `20260821000501_m32_phase2_canonical_foundation.sql` to the shared
   Supabase project (`qwaehqsmodekbgvnaavz`) via Supabase CLI
   (`supabase db push`) or the SQL editor — after review of the diff.
2. Regenerate the complete TypeScript types with the Supabase CLI
   (`supabase gen types typescript`) once the migrations are applied; the
   checked-in `src/types/database.ts` remains the canonical subset until then.
3. No storage buckets, cron jobs, env vars, or secrets are required by M32.
