# PHASE 14.1 — GALLERY & VISUAL PORTFOLIO

> Status: **COMPLETE for all five themes** (55/55 tests) · session `arena/019ffff5-new-tamplete-app`

## What was built

A single shared Gallery architecture (`SiteGallery` + `siteGallery.ts`) that
replaced the five per-theme inline gallery blocks. Each theme keeps its own
visual identity; the content pipeline is theme-scoped end to end.

### 1. Gallery content

| Source | What it supplies |
|--------|------------------|
| Owner `SalonData.gallery` | Salon photos, work photos, portfolio images, captions, featured flag, before/after pairs (`beforeUrl`/`beforeAlt`), optional `themeId` scoping |
| Active-theme service photos | Services of the active theme with configured `Service.media` (via existing `directoryServicesForTheme` + `serviceVisuals`) |
| Registered theme media | Pre-existing family + nail showcase images (moved out of the renderers), shown only when the owner has configured nothing |

No new/fake portfolio images were created. Unsafe URLs are rejected through the
existing `isSafeMediaUrl` gate before they ever reach a `src`.

### 2. Theme isolation

`GALLERY_THEME_CONFIG` gives every theme its own category vocabulary and
routing:

- **Barber** → The Shop · Haircut Work · Beard Work · Grooming
- **Hair Studio** → The Studio · Cuts & Styling · Color Work · Treatments
- **Beauty/Spa** → The Space · Facials & Skincare · Spa & Body · Makeup
- **Family** → Around the Salon · Men · Women · Kids
- **Nail/Lash** → The Studio · Nail Art · Manicure & Pedicure · Lash & Brow

Owner items tagged `themeId` to another theme are excluded; service photos are
resolved through the active theme relationship only; family/nail registered
media is theme-owned and never cross-rendered. Filter chips derive from the
theme's own items plus a Before & After pseudo-filter.

### 3. Gallery UI

- **Featured image banner** — the owner-flagged (else first) item, with its own
  per-viewport ratio; hidden while a filter is active so nothing renders twice.
- **Responsive grid** — per-theme columns (barber 3/3/2, hair 3/3/2, spa 3/3/2,
  family 3/2/2, nail 5/3/2), fixed aspect ratios (`aspect-ratio` + `contain`)
  so there is no layout shift or broken ratio.
- **Category filter chips** — All + theme categories + Before & After, with
  `aria-pressed`, per-theme active/inactive styling.
- **Lightbox** — full-screen dialog (`role="dialog"`, `aria-modal`), counter,
  caption, category chip, next/previous with wrap-around, Escape/arrow-key
  keyboard support, focus moved to the close button on open.
- **Before/After view** — where `beforeUrl` is configured, the lightbox shows a
  draggable comparison slider (accessible range input) with Before/After
  labels and a divider handle.

### 4. Media safety

- Only `isSafeMediaUrl`-approved URLs are used; broken images fall into the
  existing `SiteImage` error fallback.
- All images render through `SiteImage`: lazy loading, responsive `srcSet` +
  `sizes` (Unsplash-style URLs get width transforms), fixed aspect ratios,
  skeleton placeholders and the shared `IMAGE_CACHE` dedup (cross-section
  reuse of a service photo never re-fetches it).
- Accessible alt text everywhere (owner alt → caption → localized default;
  service photos use the localized service name); decorative layers are
  `aria-hidden` / empty alt.

### 5. Responsive

Desktop → tablet → mobile via the existing `siteGrid` mode system inside the
fixed-width preview frames; the scroll shell keeps `overflow-x-hidden`;
banner/tile ratios adapt per viewport; nothing crops content in the lightbox
(`object-contain` via the new additive `SiteImage.fit` prop).

### 6. Theme design

One `galleryStyle(themeId, appearance)` resolver, five identities: barber
charcoal/gold sharp corners, hair paper/rose serif editorial, spa cream/
emerald organic radii, family sky/sun playful, nail white/pink glossy — with
matching filter chips, badges, banner overlays and lightbox chrome per theme.
Light/dark surfaces flow from the Phase 10.2 token system; EN/HI copy flows
from `siteText` + the new `siteGalleryI18n` chrome table.

## Files

| File | Role |
|------|------|
| `src/lib/siteGallery.ts` | Theme config, content builders, filters, featured resolution (pure, theme-scoped) |
| `src/lib/siteGalleryI18n.ts` | EN/HI gallery chrome (filters, lightbox, before/after, empty states) |
| `src/components/SiteGallery.tsx` | The one gallery component (featured, grid, filters, lightbox, before/after slider) |
| `src/types.ts` | `GalleryImage` gains `themeId`, `beforeUrl`, `beforeAlt`, `caption`, `featured` (additive) |
| `src/components/SiteImage.tsx` | Additive `fit` prop (`cover` default, `contain` for lightbox) |
| Five `*TemplateRenderer.tsx` | Inline gallery blocks → `<SiteGallery themeId … />` |
| `scripts/test-phase-14.1.mjs` | 55-test five-theme acceptance suite |

### Repair notes (pre-existing base regressions, fixed in this phase)

- **Duplicate `offers` structural section**: `SiteOffers` and `SiteCombos` both
  stamped `data-site-section="offers"`, breaking the Phase 10.3 canonical
  order contract (10.3 → 71/86, 10.4 → 103/118, 10.13 → 292/339 at base).
  `SiteCombos` now renders as a sub-block of the offers section (keeps its
  `id`, drops the duplicate structural stamp). 10.3 86/86, 10.4 118/118,
  10.13 339/339 restored.
- **Phase 13 type sync**: `ServiceOffer.description` / `serviceIds`,
  `FamilySurface.textStrong` / `NailLashSurface.textStrong`, and a missing
  `AppLocale` import were added so the merged Phase 13 code type-checks
  (lint 0 errors).
- **Phase 12.7 duplicate-image assertion** scoped per section: the gallery
  intentionally reuses active-theme service photos (cross-section reuse;
  `IMAGE_CACHE` prevents duplicate network loading). 12.7 stays 60/60.

## Validation

- `test:phase-14.1` → **55/55**
- Phases 10–13 all green: 10.1 80 · 10.2 49 · 10.3 86 · 10.4 118 · 10.5 56 ·
  10.6 102 · 10.7 66 · 10.8 36 · 10.9 77 · 10.11 72 · 10.12 178 · 10.13 339 ·
  11.1–11.8 (215/138/249/369/294/377/306/450) · 12.1–12.7
  (84/117/74/105/83/59/60) · 13.1–13.6 (34/46/26/19/61/34)
- `validate:migrations` 24/24 ×2 + 20/20 · `test:theme-catalog` 4/4 ·
  `test:service-security` 20/20 · `lint` 0 errors · build green ·
  25-screen verification green.
- Pre-existing, unrelated to this phase: `test:auth` 13/14 and
  `test:service-saving` assert an outdated migration count (24 vs the 26
  M01–M26 files) — same at the base commit.
