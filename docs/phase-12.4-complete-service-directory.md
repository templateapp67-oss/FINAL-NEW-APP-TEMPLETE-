# Phase 12.4 — Complete Service Directory (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: the Complete Services section (Active Theme → Category → Services).
> No hero / trust / featured-services / header / language / dark-mode change; no
> booking-architecture or database-structure change; Phase 10, 11, 12.1, 12.2
> and 12.3 are untouched.

## What was built

A single Complete Services directory (`src/components/SiteServiceDirectory.tsx`)
rendered in the canonical `services` slot, directly after Featured Services, in
all five themes. It replaces the old per-theme "price board / menu" blocks while
keeping the same section id (`section-services`) and `data-site-section`.

The directory provides, per theme:

- **Category tabs** (All + the active theme's categories) — data-driven from the
  theme's own services.
- **Search** — matches name/description (EN + हिन्दी) of the active theme only.
- **Category filter** + **price/duration sorting** — reusing the existing
  `serviceSearch` engine.
- **Cards** with name, description, offer-aware price (incl. "From ₹X" starting
  price when price options exist), duration, an offer badge + discount label
  (active offers only, start/end dates respected), and a **Book Now** CTA that
  opens the existing booking flow **with the selected service preserved**.

## Theme isolation

- `directoryServicesForTheme(data, themeId)` keeps only the active theme's
  services via the existing theme relationship: `themeKey` wins when present
  (saved DB rows), otherwise `themeId`, and rows with no provenance are the
  active theme's own plain catalog. Foreign-theme rows never render.
- Categories are derived from those same theme-filtered services, so a category
  can never belong to another theme.
- No theme hardcodes another theme's services; prices/durations are read from
  the existing service data, never invented; `predefinedServiceId` /
  `categoryId` provenance is preserved untouched.

## CTA

`Book Now` reuses `openSiteBookingForService(service, themeId)` from Phase 12.3:
the same single booking event carries a one-shot prefill that `SiteBookingFlow`
consumes, pre-selects and preserves. No booking architecture is modified.

## UI

Each theme keeps its own styling (surfaces + typography + card shape) — barber
charcoal/gold sharp, hair paper/rose editorial, spa emerald rounded-3xl, family
bright sky/teal rounded-2xl, nail sand/pink rounded-[1.5rem]. The section
backgrounds match the Phase 10.2 surface tokens (barber `charcoalSoft`, hair
`paper`, spa `cream`, family `white`, nail `cream`) so the light/dark toggle
test stays green. Responsive grids are mode-based (desktop/tablet 2, mobile 1),
EN/HI via `displayService` + `translateCategory`, and loading/empty/error states
honour `setWebsiteSectionFlagsForTests({ services: … })`.

## Files

- `src/lib/siteServiceDirectory.ts` — theme-scoped service/category helpers.
- `src/lib/siteServiceDirectoryI18n.ts` — EN/हिन्दी control labels.
- `src/components/SiteServiceDirectory.tsx` — the directory component.
- `src/components/{Barber,HairStudio,BeautySpa,FamilyFullService,NailLashStudio}TemplateRenderer.tsx` — replaced the old services blocks with `<SiteServiceDirectory />` (hair's nested Packages block moved out to its own `offers` section).
- `scripts/test-phase-12.4.mjs` — 105-assertion five-theme acceptance suite.

## Validation

- `npm run test:phase-12.4` → **105/105 passed**
- `test:phase-12.3` 74/74 · `test:phase-12.2` 117/117 · `test:phase-12.1` 84/84
- `test:phase-11.8` 450/450
- Phase 10 all green: 10.1 80 · 10.2 49 · 10.3 86 · 10.4 118 · 10.5 56 ·
  10.6 102 · 10.7 66 · 10.8 36 · 10.9 77 · 10.12 178 · 10.13 339
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
