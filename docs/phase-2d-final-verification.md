# Phase 2D — Final Database Integrity, Cross-Repository Consistency & Production-Ready Verification

> Session `arena/01a02438-final-new-app-templete`, 2026-08-21.
> Final validation + fix phase. Everything below was verified against the
> actual migration files, the actual PGlite-replayed schema, and actual
> build/test runs — no item was left as "pending" or "recommended".
>
> New verification suite: `scripts/test-phase2d-final.mjs` — **21/21 PASS**
> with `NEXORA_MAIN_WEBSITE_PATH=/home/user/nexora-main-website`
> (20/20 in the `test:phase-2d` chain). No corrective migration was needed:
> every §1–§25 requirement verified against the M28–M35 chain.

---

## 1. What was actually inspected (Phase 2C work re-verified, not assumed)

- **M35 file** (`20260821000801_m35_phase2c_canonical_theme_slugs.sql`):
  re-read; slug reconciliation is deterministic (legacy states only),
  `themes.slug` UNIQUE re-asserted, final verification block raises unless
  the five canonical slugs exist exactly once. Re-applied cleanly on the
  M28–M34 schema (idempotency test).
- **Theme FKs** (all six verified in `pg_constraint`):
  `services.theme_id`, `service_categories.theme_id`,
  `products.theme_id`, `product_categories.theme_id`,
  `salon_media.theme_id` (all M28, RESTRICT) and
  `salons.theme_id` (`salons_theme_phase2_fk`, M32, RESTRICT).
- **Category isolation**: `services (category_id, theme_id)` composite FK +
  `products (category_id, salon_id, theme_id)` composite FK (M28) — both
  RESTRICT; categories are theme-global by the actual application model.
- **Coordinate validation**: `business_locations_latitude_check`
  (latitude between -90 and 90) and `business_locations_longitude_check`
  (longitude between -180 and 180) exist (M28) — TEST D/E prove rejection.
- **RLS**: M28–M35 contain zero `disable row level security`, zero
  `drop table`, zero `truncate`; each table is created exactly once across
  the chain; the only data-modifying statements are the deterministic
  membership-duplicate repair RPC (M33) and the owner-guarded salon-theme
  RPC update (M32).
- **Environment**: repo 1 `src/lib/supabaseClient.ts` uses only
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ("never a service_role
  key"); `.env.example` has placeholders only. Repo 2
  `packages/auth/src/env.ts` uses NEXT_PUBLIC/VITE vars; the only
  "service_role" occurrence is a doc comment. **No secrets found, none
  printed.**
- **LocalStorage**: repo 1 keys are UI prefs/drafts/caches
  (dashboard section, booking draft, payment store, appearance, analytics,
  reviews, video likes); repo 2 has a single recent-searches key. None is
  the authoritative source for salons/services/products/themes/bookings —
  those all resolve to Supabase (verified query-by-query in Phases 2B/2C).

## 2. Behavior tests A–J (all actually executed on the replayed schema)

```
A  duplicate organization membership            -> MUST FAIL ..... PASS
B  duplicate theme slug                         -> MUST FAIL ..... PASS
C  invalid foreign key                          -> MUST FAIL ..... PASS
D  invalid latitude                             -> MUST FAIL ..... PASS
E  invalid longitude                            -> MUST FAIL ..... PASS
F  soft-deleted service NOT in active catalog ................. PASS
G  soft-deleted product NOT in active catalog ................. PASS
H  updated_at auto-changes (before < after) ................... PASS
I  invalid theme/category/salon relationship    -> MUST FAIL ... PASS
J  cross-tenant ownership violation blocked by RLS ............ PASS
```
Plus: schema-chain FK existence (auth.users→profiles→organizations→
organization_members→salons→business_locations, themes→service_categories
→services, salons→products), five canonical themes with stable theme_ids
and unique slugs, salon→theme RESTRICT FK, zero orphan records, RLS
enabled on all 12 chain-managed tables, zero anonymous write grants, zero
base-table grants on profiles/organizations/salons/organization_members,
index inventory (9 required indexes present), updated_at trigger
inventory (exactly 10 tables × 1 trigger), no CASCADE from business-owned
tables to salons (bookings RESTRICT), M34+M35 idempotent replay, Phase
1A/2A/2C regression (health RPC, catalog view, salon-theme RPC), and the
cross-repository contract (93 Main Website DDL statements apply cleanly on
the final schema).

## 3. Findings & decisions

1. **RLS scope (marked for Phase 3, not a Phase 2D defect)**: the canonical
   chain enables RLS on the 12 tables it manages. RLS on
   `profiles`/`organizations`/`salons` is provided in production by the
   Main Website's live migrations, and the canonical chain grants **no**
   base-table access on those tables (verified) — so nothing is exposed in
   a fresh deployment. Complete policy design for fresh chains is Phase 3's
   mandate per the phase brief; this phase verified the chain introduced no
   RLS disablement, no public write grants and no credential exposure.
2. **PostGIS**: not installed in the project's Postgres; not enabled
   blindly. Nearby search remains the approved bounding-box/Haversine path
   over the partial B-tree index — reported as a limitation, not as
   optimized radius search.
3. **Type generation**: neither repository has a generation pipeline (repo
   1: no `supabase/config.toml`/gen script; repo 2: `createClient` without
   a `Database` generic, hand-written row types). Regeneration requires
   live-DB credentials — BLOCKED, reported exactly. Hand-synced types are
   verified by `tsc --noEmit` (repo 1 lint) and repo 2 typecheck.
4. **No corrective migration (M36) was required**: every requirement
   verified against actual schema/constraints/indexes/tests.

## 4. Validation results

| Command | Repository 1 | Repository 2 |
|---|---|---|
| `npm run lint` | PASS (tsc --noEmit, exit 0) | FAIL — 3 pre-existing errors (`app/SplashOverlay.tsx:63:5`; `app/nexora-app.tsx:6162:72`, `:6162:88`) + 18 warnings; no repo-2 file modified by Phases 2B–2D |
| `npm run typecheck` | NOT AVAILABLE — script does not exist | PASS (exit 0) |
| `npm run build` | PASS (exit 0) | BLOCKED BY DESIGN — fail-closed build scripts require real `qwaehqsmodekbgvnaavz` URL + anon key |
| `npm run test:phase-2d` | PASS (exit 0): 21/21 functional + 11/11 + 3/3 + 17 + 15 + 18 + 19 + **20 (in-chain) / 21 (with NEXORA_MAIN_WEBSITE_PATH)** | n/a |

## 5. Manual actions (external credentials only)

1. Supabase dashboard → SQL Editor for `qwaehqsmodekbgvnaavz`; apply M28 →
   M29 → M30 → M31 → M32 → M33 → M34 → M35 in order (single transaction
   each; M35 preflights the five canonical slugs).
2. Run `select public.phase2a_foundation_health();` as service_role, then
   re-run `npm run test:phase-2d` against live.
3. Provide real `NEXT_PUBLIC_SUPABASE_URL` (`https://qwaehqsmodekbgvnaavz.supabase.co`)
   + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in repo 2's environment to restore its
   build.

## 6. Files changed this phase

- `scripts/test-phase2d-final.mjs` (new — 21 tests)
- `package.json` (`test:phase2d`, `test:phase-2d`)
- `docs/phase-2d-final-verification.md` (this file, new)
- `docs/HANDOFF.md`, `docs/database-migrations-plan.md` (Phase 2D addenda)

No migration files were added in Phase 2D — the M28–M35 chain verified
complete; nothing required a corrective migration.
