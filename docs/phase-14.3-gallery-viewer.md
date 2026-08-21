# PHASE 14.3 — GALLERY VIEWER

> Continues from Phase 14.1 (the gallery section + lightbox). This phase upgrades
> the **shared** lightbox into an advanced full-screen Gallery Viewer for all five
> themes — it does NOT introduce a second viewer system.

## What changed

- `src/components/SiteGallery.tsx` — `GalleryLightbox` gains the viewer behaviour
  (swipe, safe-area, scroll lock, focus trap/restore, skeleton, lazy full-size).
- `src/lib/siteGalleryI18n.ts` — additive `swipeHint` chrome copy (EN + HI, all 5).
- `src/index.css` — `.site-gallery-lightbox-safe` safe-area padding.
- `scripts/test-phase-14.3.mjs` — **37-test** five-theme viewer acceptance suite.

## Feature map (spec → implementation)

1. **Lightbox** — full-screen viewer (role=dialog, aria-modal), large image via
   `SiteImage fit="contain"`, next/previous buttons, close button, image counter,
   service/category label chip. (Already present in 14.1; kept and verified.)
2. **Mobile** — swipe left/right on the stage (touchstart/touchend with a 40px
   threshold and horizontal dominance check), touch-friendly controls
   (`site-touch` 44px targets), safe-area spacing via
   `.site-gallery-lightbox-safe` (`env(safe-area-inset-*)`), no horizontal page
   scroll (`touch-action: pan-y` + body scroll lock while open).
3. **Before/After** — the comparison slider keeps working inside the viewer with
   Before/After labels; swipes that start on the slider are ignored so the drag
   handle is never hijacked.
4. **Media safety** — existing gallery data only (never invented); broken image →
   `SiteImage` error fallback; loading → skeleton; only the **active** full-size
   image is mounted (adjacent-only preload via `new Image()`); lazy loading +
   responsive srcSet kept from Phase 10.12.
5. **Theme isolation** — viewer renders only the active theme's items; a theme or
   data change closes/resets viewer state (`lightboxIndex` reset on
   `[themeId, data]`) and the unmount path drops previous theme media.
6. **Accessibility** — keyboard navigation (Arrow/ESC), focus moves to the close
   control on open and returns to the trigger on close, focus is trapped within
   the dialog (Tab/Shift+Tab wrap), aria-labels on close/prev/next, stage
   announced with the localised swipe hint, descriptive alt text.

## Validation

- `test:phase-14.3` → **37/37**
- `test:phase-14.1` → **55/55** (no regression)
- `npm run lint` → 0 errors
- `npm run build` → green
- `node verify-22-screens.js` → all 25 screens verified

## Scope guards

- No duplicate gallery/viewer architecture; no invented images; no
  database/service/booking changes; Phases 10–13 and 14.1 untouched.
