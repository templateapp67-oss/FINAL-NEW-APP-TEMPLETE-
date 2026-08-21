# PHASE 14.5 — GALLERY CONVERSION & FINAL POLISH

> Continues from Phase 14.4. Conversion/polish layer on top of the 14.1 gallery +
> 14.3 viewer. Nothing from 14.1–14.4 is recreated.

## What changed

- `src/lib/siteGallery.ts` — `GalleryItem.serviceId` + `galleryServiceForItem`
  (resolves a service image back to the ACTIVE theme's configured service;
  invalid/foreign refs fail gracefully with `null`).
- `src/lib/siteGalleryI18n.ts` — additive `viewService` chrome copy (EN + HI, 5 themes).
- `src/components/SiteGallery.tsx` — contextual viewer CTAs + service-detail
  hand-off; smooth transition classes.
- `src/index.css` — `.site-gallery-lightbox-anim` / `.site-gallery-stage-anim`
  fade (180ms/220ms), `focus-visible` outline, `prefers-reduced-motion` guard.
- `scripts/test-phase-14.5.mjs` — **22-test** conversion/polish acceptance suite.

## Feature map (spec → implementation)

1. **Gallery CTA** — service image → "View Service" + "Book This Service";
   non-service image → "Book Appointment". All CTAs use the EXISTING booking
   flow: `openSiteBookingForService(service, themeId)` and `openSiteBooking()`.
   The viewer closes before the booking hand-off.
2. **Service connection** — gallery image → service (`galleryServiceForItem`) →
   existing `SiteServiceDetail` (View Service) → its Book CTA → existing booking
   flow, with the correct theme + service preserved (one-shot prefill channel).
3. **Before/After** — keeps the clear Before/After labels + related category chip
   in the viewer.
4. **Visual polish** — theme-specific surfaces/typography/ratios retained; smooth
   lightbox + stage fade transition; `focus-visible` outlines; touch targets
   (`site-touch`); CTAs styled with each theme's lightbox accent; subtle motion
   only (no excessive animation).
5. **Accessibility** — keyboard nav + ESC, named CTA buttons, focus rules, alt
   text, and reduced-motion support via `@media (prefers-reduced-motion: reduce)`.
6. **Safety** — configured data only, no fake images, no cross-theme service
   mapping (`directoryServicesForTheme` scoping), invalid service references fail
   gracefully (`null` → no CTA, gallery never breaks), missing CTA data falls back
   to the generic "Book Appointment".
7. **Final test** — Gallery → Image → Service → Service Detail → Book Appointment
   for every theme; desktop/tablet/mobile, EN/HI, light/dark, theme switch with no
   stale gallery/service data.

## Root-cause fixes applied

- The 14.3 focus-trap test assumed the lightbox's last focusable control was the
  "next" button; the new CTAs reordered the focusables. The test now resolves the
  actual last focusable dynamically.
- Booking-prefill assertions now follow the 12.3 pattern (assert the mounted
  `booking-flow` + `[data-selected="true"]`), because `SiteBookingHost` consumes
  the one-shot prefill the moment the existing flow mounts.

## Validation

- `test:phase-14` → **136/136** (14.1 55 + 14.3 37 + 14.4 22 + 14.5 22)
- `npm run lint` → 0 errors
- `npm run build` → green
- `node verify-22-screens.js` → all 25 screens verified

## Scope guards

- No invented images; no database/service/booking/payment changes; Phases 10–13
  and 14.1–14.4 untouched; no duplicate gallery/viewer system.
