# Nexora Database Migrations Plan — M01–M21 (DRAFT)

> **Status (2026-08-13): DRAFT SQL committed and extended through Phase 7.4 Session 3; NOT applied to any database.**
>
> The migrations implement the ordering proposed by the 90-point master
> specification §5.25. They have been validated on an embedded real PostgreSQL
> engine, but **M02 is intentionally not final**: live Supabase introspection must
> happen first. Applying these files to any remote/local Supabase project needs a
> separate explicit go-ahead.

## Safety gate

`M02` is a fail-closed preflight, not a claim that the live schema is empty. It
performs no DDL and raises an exception if it finds known legacy Nexora objects
such as `salons`, `organizations`, `organization_members`, `job_salon_members`,
`staff`, `appointments`, or `referrals`. This prevents the later migrations from
silently creating a parallel `businesses` model.

The known live project already uses `salons`, `organization_members`, and
related ownership helpers. Therefore the checked-in M02 **must not be run there
as-is**. First inspect the live schema read-only, map every equivalent table,
column, constraint, policy, trigger, function, bucket, and relationship, and
then regenerate M02 with explicit data-preserving `ALTER`/rename/backfill steps.
No `DROP TABLE` or destructive replacement is allowed.

## Ordered migration set

| Migration | File | Scope |
|---|---|---|
| M01 | `20260811000101_m01_extensions_enums.sql` | `pgcrypto`, `btree_gist`, canonical role/status/type enums |
| M02 | `20260811000201_m02_live_schema_preflight.sql` | Fail-closed legacy collision detection; regenerate after live inspection |
| M03 | `20260811000301_m03_membership_access.sql` | `profiles`, canonical `businesses`, memberships, public owner profile |
| M04 | `20260811000401_m04_services_packages.sql` | Single service/package catalog and package composition |
| M05 | `20260811000501_m05_staff.sql` | Staff root, assignments, skills, weekly schedule, internal permissions |
| M06 | `20260811000601_m06_media_social_location_settings.sql` | Media, social URLs, location/hours, contact and booking configuration |
| M07 | `20260811000701_m07_website_onboarding.sql` | Website settings/copy, onboarding progress, JSONB wizard draft |
| M08 | `20260811000801_m08_customers_bookings.sql` | Guest customers, immutable booking snapshots/history, temporary holds |
| M09 | `20260811000901_m09_payments.sql` | Razorpay order/payment records and offline balance collections |
| M10 | `20260811001001_m10_referrals_notifications_activity.sql` | Referrals, notifications, audit/analytics, plan entitlements |
| M11 | `20260811001101_m11_functions_triggers.sql` | Membership helpers, bootstrap, tenant guards, booking/payment/publish/public/dashboard RPCs, audit and timestamp triggers |
| M12 | `20260811001201_m12_rls_policies.sql` | RLS on all Nexora tables, role matrix, no anonymous booking/payment access |
| M13 | `20260811001301_m13_storage.sql` | Private buckets and business/user path-scoped Storage policies |
| M14 | `20260811001401_m14_indexes_constraints.sql` | Query indexes and GiST overlap protection for assigned staff bookings |
| M15 | `20260811001501_m15_backfill_defaults.sql` | Non-destructive identities/memberships/defaults backfill; no demo data |
| M16 | `20260813000101_m16_theme_service_catalog.sql` | Phase 7.1 global themes/categories/predefined-services architecture; no seed data |
| M17 | `20260813000201_m17_saved_service_catalog_links.sql` | Phase 7.2 nullable provenance links from business-owned saved services to the global catalog |
| M18 | `20260813000301_m18_seed_five_theme_catalog.sql` | Phase 7.3 idempotent seed generated from the exact five application theme catalogs |
| M19 | `20260813000401_m19_theme_catalog_read_rpc.sql` | Phase 7.4 Session 1 mandatory theme-filtered catalog read RPC for the five-theme UI |
| M20 | `20260813000501_m20_save_predefined_services.sql` | Phase 7.4 Session 2 authenticated, tenant-derived, idempotent Add Selected saving |
| M21 | `20260813000601_m21_saved_service_management.sql` | Phase 7.4 Session 3 tenant-scoped refresh, edit, activate/deactivate, and saved-row delete RPCs |
| M22 | `20260813000701_m22_saved_service_management.sql` | Phase 8.1 saved-service management hardening |
| M23 | `20260813000801_m23_service_security_hardening.sql` | Phase 8.2 validation + security hardening |
| M24 | `20260813000901_m24_offers_pricing_bundles.sql` | Phase 9.1 offers, promotional pricing and theme-safe bundles |
| M25 | `20260813001001_m25_localization_search_media.sql` | Phase 9.2 localization, theme-scoped search and service media |
| M26 | `20260813001101_m26_service_safety_audit.sql` | Phase 9.3 booking safety lock, salon audit trail and integrity helpers |
| M27 | `20260815000101_m27_social_video_likes_weekly.sql` | Phase 15.8 video likes on the existing `social_videos` + weekly most-liked ranking RPCs |

### Deliberate decisions

- `businesses` is the target canonical tenant root, but live `salons` must be
  mapped/reused by finalized M02; a parallel tenant table is forbidden.
- Money is integer paise. The fixed advance is `ceil(total_paise / 4)`, so
  ₹1,200 (`120000`) produces ₹300 (`30000`) advance and ₹900 (`90000`) due.
- Booking snapshots are immutable after insertion; catalog edits/archive do not
  rewrite history.
- Public rendering uses `get_public_website_by_slug()` rather than anonymous
  table reads. Private staff/access/payment fields are omitted from its payload.
- The database never stores Razorpay secrets. Signature verification occurs in
  trusted server/Edge code before the retry-safe `verify_payment()` transaction.
- `payment_refunds` remains deferred because the repository has no implemented
  refund backend. This follows P37 and avoids a fake/unusable refund surface.
- SQL cannot read browser `localStorage`. M15 creates DB draft/progress homes;
  the later app wiring step must upsert each signed-in owner's existing
  `nexora_onboarding_state` / `nexora_builder_state` payload once.
- Buckets are private. Public media reads require a published website and an
  allowed business-scoped display path; uploads/updates/deletes require tenant
  membership. No social-video bucket is created.
- M16 keeps global predefined suggestions separate from tenant-owned `services`;
  its composite `(category_id, theme_id)` FK blocks cross-theme category links.
  See [`phase-7.1-theme-service-database.md`](phase-7.1-theme-service-database.md).
- M17 extends the existing tenant-owned `services` table in place with nullable
  theme/category/predefined provenance. Composite FKs reject wrong-theme or
  wrong-category links without deleting or guessing links for custom services.
  See [`phase-7.2-saved-service-catalog-links.md`](phase-7.2-saved-service-catalog-links.md).
- M27 reuses the existing `social_videos`, `businesses`/`business_members` and
  `auth.users` relationships instead of a second video or identity model. It
  adds two nullable scoping columns (`theme_key`, `video_kind`) plus
  `social_video_likes`, where a composite `(video_id, business_id, theme_key)`
  FK makes cross-theme/cross-tenant likes structurally impossible and partial
  unique indexes make duplicate likes impossible. Anonymous likers reuse the
  existing `website_events.visitor_token` concept. The weekly ranking is
  derived from `businesses.timezone` on read — nothing is stored or scheduled.
  See [`phase-15.8-likes-weekly-most-liked.md`](phase-15.8-likes-weekly-most-liked.md).
- M18 is generated from `src/lib/themeServices.ts`; it upserts exactly five
  themes, 17 categories, 78 canonical predefined services, and 30 relational
  suggested mappings. See [`phase-7.3-five-theme-seed.md`](phase-7.3-five-theme-seed.md).
- M19 exposes one read-only RPC requiring `p_theme_id`; SQL returns only that
  active theme’s categories, predefined services, and `is_suggested=true` rows.
  See [`phase-7.4-session-1-database-ui-read.md`](phase-7.4-session-1-database-ui-read.md).
- M20 derives one manageable tenant from `auth.uid()` membership, validates the
  full theme/category/predefined chain, and enforces one saved row per
  `(business_id, predefined_service_id)`. See
  [`phase-7.4-session-2-service-saving.md`](phase-7.4-session-2-service-saving.md).
- M21 completes refresh persistence and mutable saved-service management while
  deriving tenant ownership server-side and never mutating the global catalog.
  See [`phase-7.4-session-3-final-integration.md`](phase-7.4-session-3-final-integration.md).

## Validation performed

Run:

```bash
npm run validate:migrations
```

The validator uses `@electric-sql/pglite` **0.3.16**, a real PostgreSQL engine
compiled to WebAssembly, including its `pgcrypto` and `btree_gist` extensions.
It creates only minimal Supabase-compatible `auth`/`storage` test fixtures.

Result on 2026-08-13:

- **21/21 migrations applied cleanly on an empty schema**
- **21/21 migrations applied cleanly a second time** (replay/idempotency)
- **19/19 functional tests passed**

| Test | Assertion |
|---|---|
| A | Owner A cannot read Business B through RLS |
| B | One service row feeds the published website and reflects edits |
| C | One staff row feeds assignments and public-safe output |
| D | Published output reflects normalized updates without republishing/copying |
| E | ₹1,200 → ₹300 fixed advance + ₹900 remaining |
| F | An unverified signature cannot confirm a booking |
| G | Repeated verified callbacks create one payment/activity and confirm once |
| H | Overview and revenue RPCs reflect the same booking/payment records |
| I | Archiving/editing a service preserves the booking snapshot |
| J | Progress + JSON draft preserve onboarding resume state |
| K | A published slug loads; a missing/draft slug does not |
| L | Anonymous payload excludes commission, access roles, permissions and payment internals |
| M | Theme/category/service FKs reject orphans and cross-theme links without changing business services |
| N | Client roles see only active catalog rows and cannot mutate the global catalog |
| O | Saved services preserve manual rows and require exact theme/category/predefined provenance |
| P | Five-theme seed exactly matches Phase 2–6 source data and remains duplicate-free |
| Q | Theme-scoped RPC returns only the requested theme’s categories/services/suggestions |
| R | Add Selected saves all five themes once with exact tenant/provenance and preserves duplicates/custom rows |
| S | Refresh, edit/deactivate/delete, switching, global safety, and cross-tenant isolation remain correct |

This validation proves draft consistency on a clean PostgreSQL schema. It does
**not** replace live-project introspection, Supabase-specific review, staging
application, or the complete post-apply acceptance run.

## Required live introspection (read-only)

Before changing M02, capture at minimum:

1. Server/PostgreSQL/Supabase migration versions and installed extensions.
2. `information_schema.columns` for every `public` table, including defaults and
   nullability.
3. Primary/foreign/unique/check/exclusion constraints and delete behaviors.
4. Existing indexes, triggers, functions (definitions, owner, volatility,
   `SECURITY DEFINER`, `search_path`) and grants.
5. RLS enabled/forced flags and every `pg_policies` definition.
6. `auth.users` relationships and current ownership chain.
7. Storage buckets, object naming conventions and `storage.objects` policies.
8. Row counts, duplicate/nil values and orphan checks needed before adding
   uniqueness, `NOT NULL`, enum/check, FK, or overlap constraints.
9. Exact mapping from existing `salons`, `organization_members`, `services`,
   staff/appointment/referral concepts to the §5.1 canonical model.
10. Current app-facing RPC/view names that must remain compatible.

Store the sanitized introspection output outside Git if it contains customer or
security-sensitive data. Commit only the resulting schema decisions and safe
M02 SQL.

## Execution runbook (requires separate approval)

1. Complete and review live Supabase introspection.
2. Regenerate M02 and adapt later migrations wherever live object shapes differ.
3. Re-run `npm run validate:migrations`; add representative legacy-schema
   upgrade fixtures and verify data-preserving behavior.
4. Review the full diff, take a recoverable backup, and obtain explicit
   migration-execution approval.
5. Apply M01–M21 in order with Supabase CLI migrations (preferred) or carefully
   through the SQL editor; stop on the first error and do not skip migrations.
6. Run acceptance tests A–L from spec P88 plus Phase tests M–S against
   staging/live as approved, including multi-user RLS and browser/server flows.
7. Generate Supabase TypeScript types (`supabase gen types typescript`) per P72,
   commit them, and wire the service layer/screens to the single source of truth.

**Next step:** live Supabase introspection → regenerate M02 → approved M01–M21
application → P88 tests A–L + Phase tests M–S → P72 TypeScript types.

---

## Phase 1A + Phase 2 addendum (2026-08-21)

The M01–M27 set above remains the immutable historical draft set and is still
validated twice by `validate:migrations` (27/27, tests A–U). Since Phase 1A,
the repository additionally ships the **shared-schema migration set** that
targets the live canonical schema used by BOTH this app and the Main Website
(ONE Supabase project):

| Migration | File | Scope |
|---|---|---|
| M28 | `20260821000101_m28_phase1a_unified_salon_foundation.sql` | Identity/roles/membership reconciliation, themes + five-theme seed, categories, services provenance, products, locations, bookings, media, RLS surface |
| M29 | `20260821000201_m29_phase1a_razorpay_foundation.sql` | Payment orders/payments/webhook RPC foundations |
| M30 | `20260821000301_m30_phase1a_storage_foundation.sql` | Private `salon-media` bucket + tenant-scoped object policies |
| M31 | `20260821000401_m31_phase1a_authoritative_booking_creation.sql` | Server-authoritative booking creation + idempotency keys |
| M32 | `20260821000501_m32_phase2_canonical_foundation.sql` | Phase 2 canonical foundation: theme/category slugs, `salons.theme_id` + `phase2_set_salon_theme`, organization status/timestamps, membership `created_at`, location `created_at` backfill, service timestamps, safe `updated_at` triggers, product theme index, public-safe column grants |

**Phase 2 rules honoured:** additive only, no edits to applied/older
migrations, reproducible on a fresh database, unique constraints for stable
slugs, no duplicate entities (`salons` is canonical; the five themes are
seeded exactly once by M28), database-side timestamps, soft delete via
`deleted_at` where history matters, RLS policy surface unchanged (deep RLS is
Phase 3), bookings/payments/media systems deferred to Phases 4/5/later.

Validation: `npm run test:phase2` (validate:migrations + test:phase1a +
test:phase2), `npm run validate:main-website` (with
`NEXORA_MAIN_WEBSITE_PATH` set), `npm run lint`, `npm run build`. Full Phase 2
report: `docs/phase-2-unified-database-foundation.md`.

---

## Phase 2A addendum (2026-08-21)

| Migration | File | Scope |
|---|---|---|
| M33 | `20260821000601_m33_phase2a_hardening.sql` | Phase 2A hardening: canonical-naming guard (fail closed on `business_id` drift), named `organization_members_organization_user_key` UNIQUE constraint + deterministic duplicate-repair RPC (`phase2a_repair_membership_duplicates`), `deleted_at` on `salon_media`/`service_categories`/`product_categories`, composite indexes `services_phase2a_salon_active_idx` + `service_categories_phase2a_theme_active_idx`, service_role-only `phase2a_foundation_health()` verification RPC |

Canonical decisions recorded in `docs/phase-2a-schema-reconciliation-hardening.md`:
`salons`/`salon_id` is the single canonical entity/FK (the draft M01–M27
`businesses` model is a separate, never-applied legacy layer, preserved
unchanged); roles are ONE two-scope system (`profiles.platform_role` global +
`organization_members.role` tenant); the five themes are authoritative with
`family_full_service` as the stable slug. M33 is additive and idempotent;
RLS policy surface unchanged (Phase 3).

Validation: `npm run test:phase-2a`, `npm run validate:main-website` (with
`NEXORA_MAIN_WEBSITE_PATH` set), `npm run lint`, `npm run build`.

---

## Phase 2B addendum (2026-08-21)

| Migration | File | Scope |
|---|---|---|
| M34 | `20260821000701_m34_phase2b_final_hardening.sql` | Phase 2B final hardening: FK delete rules (every CASCADE from business-owned tables to `salons` → RESTRICT, discovered via `pg_constraint` catalog; `salon_media` service/product composite CASCADE → RESTRICT; bookings/growth-partner commissions already RESTRICT); canonical TEXT+CHECK role constraints re-asserted (`profiles_platform_role_check` 5-value, `organization_members_role_check` owner/staff — no enum); `deleted_at` asserted on `staff` (Main Website marketplace query contract) plus the M33 set; `organization_members.updated_at` + `trg_phase2_set_updated_at` (attached where no existing BEFORE ROW trigger exists; profiles/organizations/salons/themes/categories/services/products/locations already covered by M28/M32); theme slug uniqueness re-asserted with canonical `family_full_service` kept; security-barrier views `active_services` / `active_products` / `active_service_categories` (public-safe columns, explicit active filters); index set verified — services `(salon_id, is_active)` WHERE deleted_at IS NULL (M33), products `(salon_id, is_active, display_order)` WHERE deleted_at IS NULL (M28), service_categories `(theme_id, is_active, sort_order, id)` WHERE deleted_at IS NULL (M33), organization_members named UNIQUE (M33), bookings `(salon_id, appointment_start, status)` (M28), business_locations partial `(latitude, longitude)` WHERE approved (M28; client-side Haversine is the real nearby search — a B-tree is not claimed as radius search and PostGIS is not enabled blindly) |

Phase 2B decisions recorded in `docs/phase-2b-final-hardening.md`:
`salons`/`salon_id` remains the one canonical entity (verified globally in
both repositories — no `businesses` table or query exists outside the
never-applied M01–M27 draft layer and legacy external-compat payload
parsing); the canonical family-theme slug stays `family_full_service` (the
brief's `full_service_family_salon` is an example name; `themes.slug`
uniqueness is enforced); soft delete applies to mutable business entities
only — payments, orders, webhooks, bookings, auth.users stay physically
immutable; M34 is additive, idempotent, and replays cleanly on the M28–M33
schema.

Validation: `npm run test:phase-2b` (includes the 8 mandatory Phase 2B final
database tests), `npm run test:phase2b` with `NEXORA_MAIN_WEBSITE_PATH` set
(19/19), `npm run lint`, `npm run build`.

---

## Phase 2C addendum (2026-08-21)

| Migration | File | Scope |
|---|---|---|
| M35 | `20260821000801_m35_phase2c_canonical_theme_slugs.sql` | Phase 2C canonical theme slugs: reconciles the Full-Service Family Salon theme's public slug to `full_service_family_salon` (theme_id stays the stable internal key `family_full_service`; nothing in either application references `themes.slug`, so no app reference changes); deterministic reconciliation only from known legacy states (`slug` NULL or `slug = theme_id`); `themes.slug` UNIQUE re-asserted; final verification block raises unless all five canonical slugs exist exactly once (`barber_mens_grooming`, `hair_studio_color_bar`, `beauty_skin_spa`, `full_service_family_salon`, `nail_lash_studio`) |

Phase 2C supersedes the Phase 2B slug decision (M34 had kept
`family_full_service` as the slug; the Phase 2C brief explicitly requires
the public slug `full_service_family_salon`). M35 is additive, idempotent,
single-transaction, and replays cleanly on the M28–M34 schema. Canonical
entity, membership uniqueness, soft delete, FK RESTRICT rules, updated_at
automation, role system and indexes from M28–M34 are unchanged and
re-verified by the Phase 2C suite (`scripts/test-phase2c-final.mjs`,
20/20 with `NEXORA_MAIN_WEBSITE_PATH` set).

Validation: `npm run test:phase-2c`, `npm run test:phase2c` with
`NEXORA_MAIN_WEBSITE_PATH` set, `npm run lint`, `npm run build`.

---

## Phase 2D addendum (2026-08-21)

Phase 2D is the final validation + fix phase. No corrective migration was
required: the M28–M35 chain verified complete against actual files and the
PGlite-replayed schema. Verification artifact:
`scripts/test-phase2d-final.mjs` (21/21 with
`NEXORA_MAIN_WEBSITE_PATH`), covering the ten required behavior tests
(A duplicate membership, B duplicate theme slug, C invalid FK, D invalid
latitude, E invalid longitude, F/G soft-deleted service/product absent
from active catalog, H updated_at auto-change, I invalid
theme/category/salon, J cross-tenant RLS block), schema-chain FK
existence, five canonical themes + unique slugs, salon→theme RESTRICT FK,
zero orphan records, RLS enabled on all 12 chain-managed tables, zero
anon/authenticated base grants on profiles/organizations/salons/
organization_members, index inventory (9 required indexes), updated_at
trigger inventory (10 tables × 1), no CASCADE from business-owned tables
to salons, M34+M35 idempotent replay, Phase 1A/2A/2C regression, and the
cross-repository Main Website DDL contract (93 statements apply cleanly).

Notable decision: RLS on `profiles`/`organizations`/`salons` is provided
by the Main Website's live migrations in production; the canonical chain
grants no base-table access on those tables (verified), and complete
policy design for fresh chains is deferred to Phase 3 per the phase brief.

Validation: `npm run test:phase-2d`, `npm run test:phase2d` with
`NEXORA_MAIN_WEBSITE_PATH` set, `npm run lint`, `npm run build`.
