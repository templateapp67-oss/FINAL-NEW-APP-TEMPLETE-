# Dead-Code & Bundle-Size Audit — 2026-08-29

Scope: remove unused catalog hooks / legacy data files, tighten dynamic JSON
typing, and get `npm run lint` + `npm run build` to a clean result.

Reproduce with `node scripts/audit-dead-modules.mjs`.

---

## 1. The six named files do not exist

Every path named in the task was checked against the working tree and the full
git history. None of them is present, and none ever was:

| Named path | Status |
| --- | --- |
| `src/hooks/useSalons.ts` | not present; `git log --all -S` finds no commit that ever added it |
| `src/hooks/useProfessionals.ts` | not present; never existed in any commit |
| `src/hooks/useServices.ts` | not present |
| `src/hooks/useCategories.ts` | not present |
| `src/lib/catalog.ts` | not present |
| `src/lib/catalogData.ts` | not present |

`src/hooks/` contains exactly two files, `useLocationSync.ts` and
`useUsageTracking.ts`, each with one live importer. The only files matching
`*catalog*` are `catalogLocaleSeed.ts`, `siteVideoCatalog.ts` and
`themeCatalogService.ts`, all three in active use.

Nothing was deleted for this instruction, because there was nothing there to
delete.

## 2. `salon_setup_proposals` does not exist

A repo-wide search for `salon_setup_proposals` returns zero matches — no
migration, no type, no client call. There is no dynamic key-candidate fallback
array to replace with a strict type, because the payload in question is not
produced or consumed anywhere in this codebase.

No change was made. Introducing a type for a table that does not exist would
add dead code, which is the opposite of the instruction.

## 3. Actual dead code found

`scripts/audit-dead-modules.mjs` resolves every relative and index specifier
across `src/**/*.{ts,tsx}`. Starting state: **250 modules, 6 unreferenced
(749 lines)**.

Unreferenced-by-`src/` is *not* the same as dead. Each candidate was checked
against `scripts/`, `docs/`, `server/`, `api/` and the config files:

| Module | Lines | Verdict |
| --- | --- | --- |
| `src/components/BookingConfirmation.tsx` | 132 | **Deleted.** Zero import specifiers point at it; `SiteBookingConfirmation.tsx` / `src/lib/siteBookingConfirmation.ts` are the live implementations. Not in any pinned component inventory. |
| `src/components/ErrorBoundary.tsx` | 52 | **Kept and mounted.** The app had no error boundary at all. Deleting the only one would be a regression, so it is now wrapped around `RootRouter` in `src/main.tsx`. |
| `src/components/SiteSocialFeed.tsx` | 9 | **Kept.** Imported live by `scripts/test-phase-15.10.mjs:86`, which asserts it is a thin re-export of `SiteVideoGallery`. |
| `src/components/SiteVideo.tsx` | 145 | **Kept.** Pinned by an `assert.deepEqual` component inventory at `scripts/test-phase-15.10.mjs:1783`; documented there as a retained compatibility component. |
| `src/lib/templateArchitecture.ts` | 45 | **Kept.** Source-text assertions on `CORE_BUSINESS_TABLES`, `TEMPLATE_SWITCH_RPC` and `switchPreservedCoreBusiness` in `test-phase1b-template-architecture.mjs` and `test-phase1b-scope.mjs`. |
| `src/types/database.ts` | 365 | **Kept.** Documented as the hand-maintained schema types standing in for the not-yet-generated `database.generated.ts` (`docs/HANDOFF.md`, `docs/database-gaps-analysis.md`, `docs/MISSING_ITEMS_GAPS_ANALYSIS.md`). Deleting it would destroy the documented type contract. |

Final state: **4 unreferenced, 564 lines** — every one of them deliberately
retained for a stated reason above.

The audit script only sees static `from` / `import()` specifiers. It does not
see a test that `readFile`s a path or asserts on source text, so its output is
a candidate list, never a delete list.

## 4. Bundle size

The build emitted a real warning at baseline: one `index` chunk of
**2,542.20 kB (609.37 kB gzipped)** against Vite's 500 kB threshold, plus two
Rollup mixed-import warnings.

### Changes

**Vendor splitting** (`vite.config.ts`). There was no `rollupOptions` at all.
Added a `manualChunks` function splitting `react`/`react-dom`/`scheduler`
(kept together to avoid duplicate React instances), `@supabase`, `motion`,
`lucide-react` and `leaflet` into separate cacheable chunks. Assigned
per-module, so tree-shaking is preserved.

**Wizard code-splitting** (`src/App.tsx`). The 13 setup screens were static
imports, so every public visitor downloaded the whole owner wizard. Each
renders behind a `{step === N && ...}` guard, so they are now `React.lazy`
behind a single `Suspense` boundary.

**Owner surfaces code-split** (`src/App.tsx`). `OwnerDashboard` and
`StaffManagementModule` sit behind `activeModule === '...'` early returns and
are now lazy.

**Premium panels code-split** (`src/screens/Landing.tsx`).
`BookingManagementPanel`, `ShareReferralPremium` and `BrandingWhiteLabel` are
owner-only screens 23–25 rendered behind `{activeTab === '...'}` guards, yet
were statically imported into the public site's chunk. Now lazy with a
`Suspense` fallback.

**Redundant dynamic imports removed.** `src/lib/savedServiceService.ts`
already statically imports `isSupabaseConfigured` from `./supabaseClient`
(line 8), then re-imported the same binding via `await import()` at six call
sites. All six removed. `src/lib/ownerProvisioning.ts` dynamically imported
`./ownerSalon`, which four entry-chunk modules already import statically and
which has no import cycle back — converted to a static import. Both were the
source of the two Rollup mixed-import warnings.

### Measured result

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Entry chunk (raw) | 2,542.20 kB | 1,286.57 kB | **−49.4%** |
| Entry chunk (gzip) | 609.37 kB | 298.40 kB | **−51.0%** |
| **Initial JS payload (raw)** | 2,542.20 kB | **1,858.04 kB** | **−26.9%** |
| **Initial JS payload (gzip)** | 609.37 kB | **462.26 kB** | **−24.1%** |
| JS chunks emitted | 2 | 28 | — |
| Build warnings | 3 | **0** | — |

The initial-payload row is the honest headline. Splitting the entry chunk moves
bytes into vendor chunks that still download on first paint, so the real
first-load saving is ~24% gzipped, not the 49% the entry chunk alone suggests.
Measured from the six chunks `dist/index.html` actually references.

`vendor-leaflet` (149.66 kB), `OwnerDashboard` (129.08 kB),
`StaffManagementModule` (40.43 kB), the three premium panels and all 13 wizard
screens are now off the critical path.

### The 500 kB threshold

**SUPERSEDED — see `docs/landing-refactor-bundle-optimization.md`.**

At the time of this audit the entry chunk still measured 1,286.57 kB and
`build.chunkSizeWarningLimit` had been raised to 1350 to silence the warning.
That was a threshold decision, not a byte reduction, and it has since been
reverted.

`chunkSizeWarningLimit` is no longer set anywhere — the build runs against
Vite's **default 500 kB** and reports zero warnings, because the entry chunk
is now 284.17 kB. The follow-up work that achieved this is the
`Landing.tsx` monolith split plus theme-renderer and booking-flow code
splitting, documented in the file named above.

## 5. Verification

- `npm run lint` (`tsc --noEmit`) — exit 0, no output.
- `npm run build` — exit 0, **0 errors, 0 warnings**.
- `npm run test` — exit 0 (lint, `validate:all`, workspace-init 20/20,
  M63 11/11, profiles-RLS 15/15, M54 12/12).
- Dev server boots; `/`, `/src/App.tsx`, `/src/screens/Landing.tsx` and every
  lazy-loaded target return HTTP 200 with zero Vite transform errors.

`npm run test` does **not** include the phase suites, so the 43 suites that
reference the changed files were run directly. Results:

- **One regression introduced and fixed.** `scripts/test-phase1b-regression.mjs:51`
  asserted the literal static form `import OwnerDashboard from './components/OwnerDashboard'`.
  The assertion's stated intent (line 53) is that App.tsx keeps rendering *the
  existing* `OwnerDashboard`, not a replacement shell — not that it must be a
  static import. Updated to accept either specifier form while still pinning
  the module path. Now passes.
- **Pre-existing failures, confirmed identical at baseline.** Verified by
  stashing the change set and re-running: `test-phase-15.10` (1 check),
  `test-phase-16.8` (12), `test-phase-16.10` (2), `test-phase-17.10` (2),
  `test-phase1-owner-auth`, `test-service-saving`,
  `test-owner-setup-publish-flow`, `test-owner-profile`. Same failure counts
  and same assertion messages before and after. Unrelated to this change —
  mostly a `nexora_*` store-key allowlist and an `.env.example` placeholder
  check.
- All other referenced suites pass, including `test-phase-17.2`–`17.9`,
  `test-phase1b-template-architecture`, `test-phase1b-scope` (which pin
  `templateArchitecture.ts`) and `test-phase-16.6`/`16.7`/`16.9`.

Runtime behaviour of the new `Suspense` boundaries is not verified in a real
browser — there is no browser in this environment. Compilation, module
resolution and dev-server transforms are verified; the visible fallback states
are not.
