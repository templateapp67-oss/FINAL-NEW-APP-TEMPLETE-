# Phase 12.2 — Featured Services (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: the Featured Services section directly below Trust/Stats. No hero /
> trust / header / language / dark-mode change; no booking-architecture or
> database-structure change; Phase 10, 11 and 12.1 are untouched.

## What was built

A single Featured Services section (`src/components/SiteFeaturedServices.tsx`)
rendered immediately below Trust/Stats in all five themes, driven by one data
engine (`src/lib/siteFeaturedServices.ts`). It replaces the old per-theme
"featured" blocks that showed the owner's generic saved services (and the nail
theme's hardcoded showcase cards).

The section shows ONLY the active theme's own suggested services:

| Theme       | Suggested services source (theme-scoped, `is_suggested`)          |
|-------------|---------------------------------------------------------------------|
| Barber      | Skin Fade, Beard Sculpting & Lineup, Hot Towel Classic Shave, …     |
| Hair Studio | Signature Cut & Blowdry, Luxury Blowout, Balayage / Ombre, …        |
| Beauty/Spa  | HydraFacial, Deep Cleansing Cleanup, Full Body Waxing, …            |
| Family      | Classic Haircut, Haircut & Blowdry, Beard Trim, Hair Spa, …         |
| Nail/Lash   | Acrylic Nail Extensions, Gel Polish Overlay, Luxury Spa Pedicure, … |

## Data source — existing theme-scoped system, `theme_id` filtered

- **Database themes (Supabase configured):** `loadThemeServiceCatalog(themeId)`
  calls the existing M19 RPC `get_theme_service_catalog(p_theme_id)`, which
  applies the `theme_id` filter in SQL and returns only that theme's
  `is_suggested = true` services. The response's `theme.theme_id` is verified to
  equal the requested theme, so a cross-theme response is rejected.
- **Offline / unconfigured:** the same curated seed data from the existing
  static catalog (`themeServices.getSuggestedServices(themeId)`), keyed by
  theme id.

No new service architecture, no new tables, and no invented services/prices —
every value comes from the existing M18/M19 catalog (or its identical static
seed).

## Card contents

Each card shows: service name, short description, price (offer-aware —
strikethrough + discounted when an offer applies), duration, an **offer badge**
when an active theme/category/predefined offer applies, and a **Book Now**
action that opens the existing booking flow (`openSiteBooking`).

## Theme identity, i18n, appearance, states, responsiveness

- **Five distinct card designs** (surfaces + typography + shape): barber
  charcoal/gold sharp uppercase, hair paper/rose editorial serif, spa
  emerald/beige rounded-3xl, family bright sky/teal rounded-2xl, nail sand/pink
  rounded-2xl with neon-pink accents.
- **English + हिन्दी** names/descriptions/categories (DB translations, falling
  back to the existing `catalogLocaleSeed.ts` Hindi seed).
- **Light / dark** surfaces from the existing Phase 10.2 `themeSurfaces`.
- **Loading / empty / error** honour the shared
  `setWebsiteSectionFlagsForTests({ featured: … })` seam plus a natural async
  loading/error lifecycle for the database path (retry on error).
- **Responsive grids** are mode-based (`siteGrid`): barber/hair/spa/family
  2/2/1, nail 4/2/2.

## Files

- `src/lib/siteFeaturedServices.ts` — resolver + hook + offer/price/localization.
- `src/components/SiteFeaturedServices.tsx` — themed section component.
- `src/lib/siteStructure.ts` — added `injectedSectionStatus()` (test-seam read).
- `src/components/{Barber,HairStudio,BeautySpa,FamilyFullService,NailLashStudio}TemplateRenderer.tsx` — replaced the old featured blocks with `<SiteFeaturedServices />` (removed the nail hardcoded showcase).
- `scripts/test-phase-12.2.mjs` — 117-assertion five-theme acceptance suite.

## Validation

- `npm run test:phase-12.2` → **117/117 passed**
- `test:phase-12.1` 84/84 · `test:phase-11.8` 450/450
- `test:phase-10.1` 80/80 · `test:phase-10.2` 49/49 · `test:phase-10.3` 86/86 ·
  `test:phase-10.4` 118/118 · `test:phase-10.8` 36/36 · `test:phase-10.9` 77/77 ·
  `test:phase-10.12` 178/178 · `test:phase-10.13` 339/339
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
