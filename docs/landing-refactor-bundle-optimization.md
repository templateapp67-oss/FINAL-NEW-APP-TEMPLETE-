# Landing.tsx Monolith Split & Bundle Optimisation — 2026-08-29

Follow-up to `docs/dead-code-and-bundle-audit.md`.

Three goals: break up the `Landing.tsx` monolith, get the build under Vite's
standard chunk threshold **without** raising `chunkSizeWarningLimit`, and
verify no regressions.

---

## 1. What `Landing.tsx` actually is

Despite the name it is not a public landing page — it is the **owner
workspace**: a 10-tab dashboard (overview, website, services, bookings, staff,
payments, share, settings, referral, branding) plus modals and drawers. It
renders from `App.tsx` only under
`activeModule === 'dashboard' && hasAuthoritativePublishState`, i.e. for an
authenticated owner with a published site.

The public site is a separate tree reached from `main.tsx` → `PublicSalonView`.

## 2. Monolith split

Four tab bodies were extracted into `src/components/dashboard/`, each a
dedicated lazy-loaded feature component behind the existing
`{activeTab === '…'}` guard:

| Screen | New module | Lines | Own chunk |
| --- | --- | --- | --- |
| 18 — Dashboard Overview | `OverviewPanel.tsx` | 480 | 16.12 kB (3.59 kB gz) |
| 21 — Payments & Revenue | `PaymentsPanel.tsx` | 370 | 17.28 kB (3.74 kB gz) |
| 22 — Share & Referral | `SharePanel.tsx` | 124 | 3.89 kB (1.34 kB gz) |
| 23 — Salon Settings | `SettingsPanel.tsx` | 107 | 2.85 kB (1.05 kB gz) |

`Landing.tsx`: **4,449 → 3,663 lines** (−786, −17.7%).

Three further tabs already delegated to dedicated lazy components from the
previous change and needed no work: bookings → `BookingManagementPanel`,
referral → `ShareReferralPremium`, branding → `BrandingWhiteLabel`.

### How state was divided

Tab-local state moved with its tab. `PaymentsPanel` now owns
`paymentsFilter` / `paymentsSearch` / `selectedPaymentId`; those three
declarations were deleted from `Landing`.

State shared across tabs stayed in `Landing` and is passed as props — e.g.
`copied` / `handleCopyLink` (used by both overview and share), and
`appointments` (overview, bookings and payments).

`totalBookingsValue` / `totalAdvanceCollected` / `totalRemainingAtSalon` were
duplicated logic in two tabs, so they were lifted into
`dashboard/appointmentTotals.ts` and both call sites now use it. The `Appointment`
interface moved to `PaymentsPanel.tsx` and `Landing` re-aliases it.

Two derivations that only the overview displays (`todayActiveBookings`,
`staffTeamCount`) are computed inside `OverviewPanel` rather than passed in.

**No behaviour was changed during extraction.** One deliberate exception is
recorded in the code: `SharePanel` gates its WhatsApp-copy notification on
`notificationsOpen`, preserving the original `showNotifications && setNotifications(…)`
expression verbatim rather than silently "fixing" what looks like a latent bug.

### Not extracted

- **website (screen 19, ~620 lines)** — the heaviest coupling in the file
  (~20 free identifiers, 18 child components including `TemplateRenderer`,
  `TemplateSelectionDashboard`, `ThemeSwitcher`, `TemplateConfigPanel`), and
  `scripts/test-owner-profile.mjs` asserts its owner photo/role editor lives in
  `Landing.tsx` by source text. Left intact deliberately.
- **services (~580 lines)** and **staff** — same heavy-coupling profile.

Extraction stopped where the remaining blocks are entangled enough that a
mechanical move would need a large speculative prop surface, and where no
browser is available to confirm the result renders.

## 3. Bundle size

`build.chunkSizeWarningLimit` has been **removed** — the build now runs against
Vite's default 500 kB.

| Metric | Original | Now | Change |
| --- | --- | --- | --- |
| Entry chunk (raw) | 2,542.20 kB | **284.17 kB** | **−88.8%** |
| Entry chunk (gzip) | 609.37 kB | **81.39 kB** | **−86.6%** |
| Initial JS payload (raw) | 2,542.20 kB | **877.97 kB** | −65.5% |
| **Initial JS payload (gzip)** | 609.37 kB | **250.18 kB** | **−58.9%** |
| Largest single chunk | 2,542.20 kB | **375.50 kB** | under 500 kB |
| JS chunks emitted | 2 | 49 | — |
| Build warnings | 3 | **0** | at the default limit |

Initial payload is measured from the six chunks `dist/index.html` actually
references — the honest number, since splitting moves bytes into vendor chunks
that still download on first paint.

### The two changes that mattered most

**Theme renderers (`TemplateRenderer.tsx`).** All five full theme renderers
were statically imported, but a salon uses exactly one. Making them
`React.lazy` cut the entry chunk from 1,077 kB to 284 kB on its own and pulled
the whole per-theme subtree (gallery, video, service directory) off the
critical path. Each is now its own 22–32 kB chunk.

**Booking flow (`SiteBookingHost.tsx`).** `SiteBookingFullFlow` →
`SiteBookingFlow` + `SiteBookingPaymentFlow` is ~190 kB of source. The host
already returned `null` until a Book CTA fired, so the lazy boundary means the
chunk is not even *requested* until a visitor starts a booking. This took the
shared site chunk from 547 kB (over the limit) to 375 kB.

Also lazy: the whole `Landing` owner workspace from `App.tsx`.

`scripts/audit-entry-graph.mjs` and `scripts/diff-static-graphs.mjs` were
written for this and show the entry static graph falling from **177 modules /
2,103.9 kB source to 68 modules / 615.1 kB**.

## 4. Suspense coverage

`scripts/verify-suspense-coverage.mjs` walks every `lazy()` declaration and
confirms each JSX render site sits inside an unclosed `<Suspense>` in the same
file:

```
checked 32 lazy-component render sites; 0 without a wrapping <Suspense>
```

Fallbacks are real UI, not empty fragments: a spinner for the workspace and
theme renderers, a spinner for the booking overlay, a "Loading" panel for the
dashboard tabs.

## 5. Verification

- `npx tsc --noEmit` — **exit 0**, no output.
- `npm run build` — **exit 0, 0 errors, 0 warnings**, `chunkSizeWarningLimit`
  unset (Vite default 500 kB), no chunk above 500 kB.
- `npm run test` — **exit 0** (lint, `validate:all`, workspace-init 20/20,
  M63 11/11, profiles-RLS 15/15, M54 12/12).
- Dev server boots; `/` returns 200 and all 12 changed or new modules — including
  every lazy target — transform with **zero** Vite errors.

### Integration suite

`npm run test` covers only 6 suites, so **all 141 `scripts/test-*.mjs`** were
run, then the identical sweep was run against a clean `git worktree` at the
pre-refactor commit:

| | Baseline (HEAD) | After refactor |
| --- | --- | --- |
| Pass | 87 | 89 |
| Fail | 52 | 52 |

The 2-script difference is fully accounted for: `test-m63-owner-provisioning-invitation-guard`
and `test-profiles-rls-column-isolation` are new files that do not exist at
HEAD, and both pass.

**The failing set is byte-identical between the two runs** (`comm` on the sorted
lists returns no difference in either direction). Nothing was newly broken.

The 52 failures are pre-existing and unrelated — a `nexora_*` store-key
allowlist, an `.env.example` placeholder check, `nexora_onboarding_state`
absent from `App.tsx` at HEAD too, a `useAuthModal` provider missing in the
10.x test harness, and the 16.8 contact-unlock flow (12 checks). Each was
spot-verified by reading the assertion and checking whether it touches a file
this change modified.

Notably, the tests that pin `Landing.tsx` by source text still pass, because
the extraction kept every `{activeTab === '…'}` conditional in `Landing` and
moved only the JSX bodies:

- `test-phase-17.1` — all 8 dashboard tab strings, `BookingManagementPanel`,
  `resolveOwnerSalonId` → **PASS**
- `test-phase-17.2`, `test-phase-17.3` — `BookingManagementPanel` → **PASS**
- `test-owner-profile` — website-tab photo/role assertions → the one failing
  check is the unrelated `nexora_onboarding_state` one
- `test-phase-17.4`–`17.9`, `test-phase1b-regression` → **PASS**
- `test-legacy-site-fixes`, `test-m41-website-booking` — both render
  `TemplateRenderer` through the new lazy path → **PASS**

## 6. Not verified

The new `Suspense` fallbacks have never rendered in a real browser — there is
none in this environment. Compilation, module resolution, dev-server
transforms and the static Suspense-coverage check are verified; the visible
fallback states and the visual result of the four extracted tabs are **not**.
