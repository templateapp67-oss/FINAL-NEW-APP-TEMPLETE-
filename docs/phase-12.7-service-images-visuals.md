# Phase 12.7 — Service Images & Visuals (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: visual support on service cards + the service detail modal. No hero /
> trust / featured-services / header / language / dark-mode change; no
> booking/payment or database-structure change; Phase 10, 11, and 12.1–12.6 are
> untouched.

## What was built

Service cards (Complete Services directory) and the Service Detail modal now
render a visual from the service's **existing configured media only**
(`Service.media.imageUrl` / `iconUrl` / `bannerUrl`):

- **Service Image** — hero visual, preference order image → banner → icon.
- **Icon** — the `iconUrl` chip (directory thumbnail + detail icon), when it is
  distinct from the hero.
- **Optional Gallery Image** — the `bannerUrl`, shown in the detail modal when
  it is distinct from the hero.

`src/lib/siteServiceVisuals.ts` resolves these (`serviceVisuals(service, locale)`)
plus a theme-scoped category → glyph map (`categoryIcon`). Because every category
label belongs to exactly one theme, the glyph is inherently theme-correct:
barber → scissors/sparkle/droplet, hair studio → scissors/palette, spa →
sparkle/droplet/flower/palette, family → scissors/baby/package, nail → palette/
hand/eye.

## Rendering guarantees

- **Reuses the existing performance system**: `ServiceVisual`
  (`src/components/ServiceVisual.tsx`) wraps `SiteImage` — lazy loading
  (`service` context, below-the-fold), responsive `srcSet`, fixed aspect ratio
  (no layout shift), skeleton, and the `IMAGE_CACHE` dedup.
- **Fallback**: missing or broken media falls back to the theme's own category
  glyph — never another theme's artwork, never an invented URL.
- **Alt text**: the localized service name (EN + हिन्दी via `displayService`);
  the decorative icon chip is `alt=""`.
- **No duplicate loading**: one `<img>` per distinct URL, plus `IMAGE_CACHE`
  keyed by URL.

## Files

- `src/lib/siteServiceVisuals.ts` — visual resolution + category glyph map.
- `src/components/ServiceVisual.tsx` — themed visual (SiteImage + glyph fallback).
- `src/components/SiteServiceDirectory.tsx` — card visual strip.
- `src/components/SiteServiceDetail.tsx` — hero visual + icon chip + gallery
  strip (all through `ServiceVisual`).
- `scripts/test-phase-12.7.mjs` — 60-assertion five-theme acceptance suite.

## Validation

- `npm run test:phase-12.7` → **60/60 passed**
- `test:phase-12.6` 59/59 · 12.5 83 · 12.4 105 · 12.3 74 · 12.2 117 · 12.1 84 ·
  `test:phase-11.8` 450/450
- Phase 10 all green: 10.1 80 · 10.2 49 · 10.3 86 · 10.4 118 · 10.5 56 ·
  10.6 102 · 10.7 66 · 10.8 36 · 10.9 77 · 10.12 178 · 10.13 339
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
