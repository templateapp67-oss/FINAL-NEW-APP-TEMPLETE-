# Phase 2C — Actual Implementation & Final Verification

> Session `arena/01a02438-final-new-app-templete`, 2026-08-21.
> Implementation only. Actual migration file + actual test suite + actual
> type synchronization + actual verification — no gap report.
>
> New migration: `supabase/migrations/20260821000801_m35_phase2c_canonical_theme_slugs.sql`
> (post-M34, additive, idempotent, single transaction).
> New test suite: `scripts/test-phase2c-final.mjs` (20/20 with
> `NEXORA_MAIN_WEBSITE_PATH=/home/user/nexora-main-website`).
> Commit: pushed to `arena/01a02438-final-new-app-templete`.

---

## 1. Inspection (actual current state — no guessing)

Verified in BOTH repositories before any change:

- **Canonical entity**: `salons` / `salon_id` everywhere. Repo 2 has zero
  `businesses` tables/columns/queries (only a proposal-payload input alias
  at `20260801_growth_partner_commission_and_hold.sql:293` and one prose
  mention). Repo 1's live code never queries `businesses`; `business_id`
  exists only in the never-applied M01–M27 draft layer and in
  third-party-payload parsing (`pricingPromotionService.ts`,
  `savedServiceService.ts` — deliberate external compatibility).
- **Migrations**: M01–M27 draft history, M28–M31 Phase 1A, M32 Phase 2,
  M33 Phase 2A, M34 Phase 2B — all present, all previously verified.
- **Roles**: one two-scope TEXT+CHECK system (profiles.platform_role 5-value
  + organization_members.role owner/staff); repo 2 `packages/auth/src/roles.ts`
  normalizes aliases; no enum, no unsafe casts.
- **Themes**: five rows seeded by M28 with slug = theme_id, so the family
  theme's slug was `family_full_service`; `themes.slug` UNIQUE exists.
  **Neither repository references `themes.slug` anywhere** (grep-verified) —
  `family_full_service` is used as the internal `theme_id` in both repos.
- **organization_members**: named UNIQUE (organization_id, user_id) since M33.
- **Theme persistence**: catalog theme is DB-represented on
  `salons.theme_id` via the `phase2_set_salon_theme` RPC (M32, tested); the
  site template axis persists in `salon_public_websites.template_key`/`config`
  (also DB). Neither lives only in React state/localStorage.
- **Type tooling**: repo 1 has no `supabase/config.toml` and no gen-types
  script (`src/types/database.ts` is hand-maintained); repo 2's
  `createClient` is called **without a `Database` generic** and has no
  `database.types.ts` — its row shapes are hand-written local types
  (`ServiceRow`, `StaffRow`, …). There is no generation pipeline to run in
  either repo; regeneration additionally requires live-DB credentials.

## 2. Canonical salon/business

`salons` + `salon_id` confirmed as the single canonical entity/FK (matches
the actual DB architecture in both repos). No second table created, no
data deleted, no compatibility view added (a view would duplicate
ownership; nothing needs bridging because nothing queries `businesses`).
M33's canonical-naming guard already fails closed on future `business_id`
drift.

## 3. Migration files (actually written)

| File | What it implements |
|---|---|
| `supabase/migrations/20260821000801_m35_phase2c_canonical_theme_slugs.sql` **(new this phase)** | Canonical theme slugs per Phase 2C: reconciles the family theme's slug to `full_service_family_salon` (deterministic, legacy-state-only), re-asserts `themes.slug` UNIQUE, verifies all five canonical slugs exist exactly once (raise = rollback) |

M01–M34 untouched. M35 is a NEW additive migration, ordered after M34,
idempotent (replay-verified), no drops, no fake rows, no hardcoded ids
beyond the canonical theme keys (system configuration data, explicitly
allowed).

## 4. Organization membership — UNIQUE (organization_id, user_id)

Implemented in M33 (`organization_members_organization_user_key`, named
UNIQUE) with deterministic duplicate repair RPC
(`phase2a_repair_membership_duplicates`, ctid-keyed, preserves valid role
info, never deletes unrelated users). Re-verified in the Phase 2C suite:

```
TEST 1 — duplicate organization membership -> MUST FAIL ..... PASS
```

## 5. Soft delete — deleted_at

`deleted_at timestamptz` on all mutable business entities:
`salons`, `services`, `products`, `staff` (M34 — repo 2's marketplace
query contract), `salon_media`, `service_categories`,
`product_categories`. Payments/orders/webhooks/bookings/auth.users stay
physically immutable (no destructive deletion of financial/history data).
Active queries in both repos exclude deleted rows (repo 1:
`PublicSalonView.tsx`, `ownerDashboard.ts`, `ownerSalon.ts`,
`salonMediaService.ts` fixed in Phase 2B; repo 2: `fetchSalonMarketplace`,
catalog fetch). Verified:

```
TEST 4 — soft-deleted service NOT in active catalog .......... PASS
TEST 5 — soft-deleted product NOT in active catalog .......... PASS
```

## 6. Foreign key hardening

All core FKs audited and explicit:

- `salon_id → salons(id)` on services, staff, offers, salon_hours,
  salon_public_websites, business_locations, salon_media: **RESTRICT**
  (M34 replaced every CASCADE — previously 6 in repo 2 live + 3 in M28).
- `salon_media (service_id, salon_id) / (product_id, salon_id)`:
  **RESTRICT** (M34).
- `bookings.salon_id`, `growth_partner_commissions.salon_id`: RESTRICT
  (unchanged — financial/history data never cascades).
- `services (category_id, theme_id)` and `products (category_id, salon_id,
  theme_id)`: RESTRICT (M28) — category isolation.
- `salons.organization_id`, `organization_members.user_id → profiles`,
  `salon_media.created_by → profiles`, `salon_media.theme_id → themes`:
  RESTRICT; `profiles.id → auth.users` CASCADE (identity row, standard);
  `booking_services.booking_id` CASCADE (line items belong to the booking —
  booking deletion is itself RESTRICTed by payment_orders).
- `booking_slot_holds.customer_id` CASCADE (ephemeral holds only).

Verified: zero CASCADE FKs from the business-owned set to `salons` remain;
deleting a salon with children is refused; deleting a service that still
has media is refused.

## 7. updated_at automation

Reusable `private.phase2_set_updated_at()` + `trg_phase2_set_updated_at`
BEFORE UPDATE triggers on all ten canonical mutable tables: profiles,
organizations, organization_members (M34), salons, themes,
service_categories, services, products, product_categories,
business_locations (M32) — exactly 10 × 1 trigger (verified). No client
timestamps; INSERTs use `DEFAULT now()`.

```
TEST 6 — updating a mutable record -> updated_at MUST change ... PASS
```

## 8. Canonical roles

One authoritative representation (TEXT + CHECK, no enum):
`profiles.platform_role` (customer / business_user / growth_partner /
delivery_partner / admin) + `organization_members.role` (owner / staff).
The four required app roles map onto it and are all DB-readable:

| Required role | Canonical storage | Verified |
|---|---|---|
| owner | `organization_members.role = 'owner'` | PASS |
| staff | `organization_members.role = 'staff'` | PASS |
| customer | `profiles.platform_role = 'customer'` | PASS |
| admin | `profiles.platform_role = 'admin'` | PASS |

Repo 2 `packages/auth/src/roles.ts` is the edge authority (aliases
normalize to the same values; `private.normalize_platform_role()` enforces
server-side); repo 1's `PlatformRole` type matches. No competing authority,
no unsafe frontend-only checks as DB authority.

## 9. Canonical themes (database-authoritative)

Five themes with canonical slugs, enforced and verified in the DB:

| Theme | theme_id (internal key) | slug (public, canonical) |
|---|---|---|
| Barber & Men's Grooming | `barber_mens_grooming` | `barber_mens_grooming` |
| Hair Studio & Color Bar | `hair_studio_color_bar` | `hair_studio_color_bar` |
| Beauty, Skin & Spa | `beauty_skin_spa` | `beauty_skin_spa` |
| Full-Service Family Salon | `family_full_service` | **`full_service_family_salon`** (M35) |
| Nail & Lash Studio | `nail_lash_studio` | `nail_lash_studio` |

M35 reconciles the family slug deterministically (only from `slug IS NULL`
or `slug = theme_id`), never inserting duplicates, never overwriting an
unrelated explicit value; `themes.slug` UNIQUE re-asserted; verification
block raises unless all five slugs exist exactly once.

```
TEST 2 — duplicate theme slug -> MUST FAIL .................... PASS
```

## 10. Salon → theme (DB-authoritative)

`salons.theme_id` (M32) + `phase2_set_salon_theme(salon_id, theme_id)` RPC
with membership/ownership checks. Verified in the Phase 2C suite
(owner-scoped RPC updates `salons.theme_id`; row confirmed). The app's
site-template axis is separately DB-persisted
(`salon_public_websites.template_key`/`config`) — theme selection is not
left in React state or localStorage.

## 11. Category → salon + theme

Actual application model: `service_categories` are **theme-global**
(M28: `(id, theme_id)` and `(theme_id, name)` UNIQUE; no salon_id column —
categories are shared across salons within a theme; repo 2's live schema
matches). Product categories ARE salon+theme scoped
(`product_categories` with `(id, salon_id, theme_id)` UNIQUE). Isolation
is enforced where the model requires it, via composite FKs:

- `services (category_id, theme_id) → service_categories(id, theme_id)`
- `products (category_id, salon_id, theme_id) → product_categories(id, salon_id, theme_id)`

A fake `(salon_id, theme_id)` constraint on global categories was NOT
invented (it would block legitimate shared categories — the brief
explicitly forbids contradicting the actual application).

```
TEST 7 — invalid category/theme/salon relationship -> MUST FAIL . PASS
         (barber-theme category on a hair-theme service is rejected)
```

## 12. Indexes (for actual query patterns)

- `services (salon_id, is_active) WHERE deleted_at IS NULL` — M33 (EXPLAIN-verified)
- `products (salon_id, is_active, display_order) WHERE deleted_at IS NULL` — M28
- `service_categories (theme_id, is_active, sort_order, id) WHERE deleted_at IS NULL` — M33 (categories are theme-global; no salon_id by design)
- `organization_members (organization_id, user_id)` named UNIQUE — M33
- `bookings (salon_id, appointment_start, status)` — M28
- `business_locations (latitude, longitude) WHERE approval_status='approved'` — M28 partial B-tree supporting the actual bounding-box/Haversine nearby search; **not claimed as a radius-search index**; PostGIS is not present in the project and was not enabled blindly.

## 13. Type generation (both repositories)

- **Repository 1**: no `supabase/config.toml`, no gen-types script — there
  is no generation pipeline to run. `src/types/database.ts` is
  hand-maintained; this phase updated its `ThemeRow` doc to the canonical
  slug set. Types verified consistent with the schema by
  `npm run lint` (`tsc --noEmit`) and the PGlite suites.
  **Generation BLOCKED** (requires supabase CLI + live project link +
  credentials). Reported exactly; not claimed as PASS.
- **Repository 2**: `createClient` is called without a `Database` generic;
  no `database.types.ts` exists; row shapes are hand-written local types
  that already match the canonical schema (`salon_id`, `deleted_at`,
  `is_active`). **No generated-type pipeline exists**; verified by
  `npm run typecheck` (PASS). Reported exactly.

## 14. Both applications

- Repo 1: no code change required for the slug (nothing references
  `themes.slug`); theme_id-based references (`family_full_service`) remain
  valid and unchanged; type doc comment updated.
- Repo 2: zero references to `family_full_service`/
  `full_service_family_salon` — no change required. No unrelated features
  modified.
- Global greps after the change: no accidental mixed `businesses`/
  `business_id` references outside the documented legacy surfaces.

## 15. Migration application (remote)

**BLOCKED** — remote Supabase is not accessible from this environment
(no credentials/dashboard for shared project `qwaehqsmodekbgvnaavz`).
The migration files are complete and SQL-validated by clean replay on
PGlite (M28→M35) plus the full test suite. Exact manual action:

1. Supabase dashboard → SQL Editor for `qwaehqsmodekbgvnaavz`.
2. Apply in order: M28, M29, M30, M31, M32, M33, M34, M35 (files in
   `supabase/migrations/`). Each is a single transaction with preflight
   guards; M35 raises and rolls back if the five canonical slugs are not
   exactly present afterward.
3. Under service_role run `select public.phase2a_foundation_health();`
   and re-run `npm run test:phase-2c` against the live project.

## 16. Test/build verification (exact results)

| Command | Repo 1 | Repo 2 |
|---|---|---|
| `npm run lint` | **PASS** (tsc --noEmit, 0 errors) | **FAIL** — 3 pre-existing errors (SplashOverlay.tsx:63:5; nexora-app.tsx:6162:72, :6162:88) + 18 warnings; no repo-2 file modified this phase |
| `npm run typecheck` | **NOT AVAILABLE — script does not exist** (lint is `tsc --noEmit`) | **PASS** |
| `npm run build` | **PASS** | **BLOCKED BY DESIGN** — build scripts fail closed without real `qwaehqsmodekbgvnaavz` URL + anon key ("No placeholder backend/key is ever injected") |

`npm run test:phase-2c` (repo 1): exit 0 — validate:migrations +
functional 21/21 + phase1a 11/11 + 3/3 + phase2 17 + phase2a 15 +
phase2b 18 + **phase2c 20/20 (with NEXORA_MAIN_WEBSITE_PATH; 19 in-chain)**.

## 17. Database verification (the seven required behaviors)

```
TEST 1 — duplicate organization membership        -> MUST FAIL ..... PASS
TEST 2 — duplicate theme slug                     -> MUST FAIL ..... PASS
TEST 3 — invalid foreign key                      -> MUST FAIL ..... PASS
TEST 4 — soft-deleted service NOT in active catalog ............ PASS
TEST 5 — soft-deleted product NOT in active catalog ............ PASS
TEST 6 — updated_at auto-changes on UPDATE ..................... PASS
TEST 7 — invalid category/theme/salon relationship -> MUST FAIL .. PASS
```
Plus: cross-tenant RLS denial, FK delete-rule assertions, role
constraints + four-role readability, five canonical slugs
(`full_service_family_salon` included), salon→theme RPC, safe views,
staff soft delete, M34+M35 idempotent replay, Phase 1A/2A regression,
Main Website DDL compatibility (93 statements apply on the M35 schema).

## 18. No fake data

No fake salons/customers/bookings/payments were created — in the
migrations or in the tests (test rows live only inside the ephemeral
PGlite instance). The five canonical theme rows are system configuration
data, explicitly allowed.

## Files changed this phase

- `supabase/migrations/20260821000801_m35_phase2c_canonical_theme_slugs.sql` (new)
- `scripts/test-phase2c-final.mjs` (new)
- `scripts/validate-migrations.mjs` (M35 contract)
- `src/types/database.ts` (ThemeRow canonical-slug doc)
- `package.json` (`test:phase2c`, `test:phase-2c`)
- `docs/phase-2c-final-implementation.md` (new)
- `docs/HANDOFF.md`, `docs/database-migrations-plan.md` (Phase 2C addenda)

## Remaining blockers (genuine only)

1. **Remote migration apply** — blocked by missing Supabase credentials for
   `qwaehqsmodekbgvnaavz`; exact manual steps above.
2. **Repo 2 lint** — 3 pre-existing errors (listed above), out of this
   phase's scope, no repo-2 file modified.
3. **Repo 2 build** — fails closed by design without the real project
   URL/anon key.
4. **Type generation** — no pipeline exists in either repo and
   regeneration requires live-DB access; hand-synced types verified by
   lint/typecheck instead.

Phase 2C complete. Per the final rule, no Phase 3 work was started.
