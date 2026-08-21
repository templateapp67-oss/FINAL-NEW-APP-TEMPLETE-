# Phase 12.1 — Trust & Salon Stats (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: a new Trust/Stats section directly below the hero. No hero redesign; no
> change to the database, service or booking architecture; Phase 10 and Phase 11
> are untouched.

## What was built

A single Trust/Stats section (`src/components/SiteTrust.tsx`) rendered
immediately below each theme's hero, driven by one data engine
(`src/lib/siteTrust.ts`) and one copy table (`src/lib/siteTrustI18n.ts`).
The previous trust strips in the five renderers hardcoded marketing numbers
("15+", "10k", "4.9", "∞" …) — those are gone.

Six stats are supported, in canonical order:

| Stat            | Real data source                                                    |
|-----------------|---------------------------------------------------------------------|
| Customer Rating | Average of **approved** reviews (Phase 10.8 `siteReviews` engine)   |
| Review Count    | Number of approved reviews (Phase 10.8)                             |
| Years of Exp.   | `SalonData.yearsOfExperience`, only when the owner set an integer   |
| Happy Customers | `SalonData.happyCustomers`, only when the owner set an integer      |
| Services Avail. | Count of active (non-inactive/archived) services                    |
| Salon Status    | Live open/closed status (Phase 10.5 `salonStatus` engine)           |

## Honesty rules

- **No invented numbers.** A stat only renders when the underlying data exists.
- **Unavailable stats are hidden**, never replaced with a placeholder:
  - no approved reviews → rating and review-count cards disappear;
  - no owner-configured figure (absent, `NaN`, `≤ 0`, non-integer) → years /
    happy-customers cards disappear;
  - no active services → services card disappears;
  - no configured `openingHours`/`holidays` → status card disappears.
- **Nothing real → the section falls back to its empty state** (still keeps its
  `section-trust` slot in the canonical flow).

## Theme identity

Each theme keeps its own card design, colours and typography (no two themes
share the same look): barber charcoal/gold sharp uppercase, hair paper/rose
serif hairlines, spa emerald/beige rounded-3xl serif, family sky/teal
rounded-2xl extrabold, nail sand/pink rounded-2xl neon.

## Responsiveness, i18n, appearance, states

- Grid is **mode-based** (`siteGrid`) — desktop 3 / tablet 3 / mobile 1 — never
  viewport breakpoints, matching the Phase 10.3 / 11.4 frame rule.
- **English + हिन्दी** labels flip with the header Language control (digit
  grouping via `Intl.NumberFormat('hi-IN' | 'en-IN')`).
- **Light / dark** surfaces come from the existing Phase 10.2 `themeSurfaces`.
- **Loading / empty / error** honour the shared
  `setWebsiteSectionFlagsForTests({ trust: … })` seam used by every other
  section; loading shows a themed skeleton, error shows the shared retry panel,
  empty shows the shared empty panel.

## Files

- `src/lib/siteTrust.ts` — trust-stats engine (real data only).
- `src/lib/siteTrustI18n.ts` — EN / हिन्दी stat labels + empty copy.
- `src/components/SiteTrust.tsx` — themed section component.
- `src/types.ts` — added optional `yearsOfExperience` / `happyCustomers`.
- `src/components/{Barber,HairStudio,BeautySpa,FamilyFullService,NailLashStudio}TemplateRenderer.tsx` — replaced the hardcoded trust block with `<SiteTrust />`.
- `scripts/test-phase-12.1.mjs` — 84-assertion five-theme acceptance suite.

## Validation

- `npm run test:phase-12.1` → **84/84 passed**
- `npm run test:phase-10.13` → 339/339 (canonical flow incl. trust unchanged)
- `npm run test:phase-11.8` → 450/450 (hero acceptance still green)
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
