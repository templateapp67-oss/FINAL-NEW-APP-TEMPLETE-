# Phase 10.4 — Final CTA, Footer & Floating Actions (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffaae-new-tamplete-app`).
> Scope: global Book Appointment CTA, themed final CTA, complete footer,
> and floating / mobile-dock actions. Header, Language, Dark Mode and the
> Phase 10.3 section order are untouched. No database or service/theme-data
> changes.

## What landed

| File | Role |
|------|------|
| `src/lib/siteBooking.ts` | Opens the **existing** `CustomerBookingPreview` via `nexora:open-booking`. Contact helpers (`tel:`, `wa.me`, maps) read salon phone / WhatsApp / address. |
| `src/lib/siteChromeI18n.ts` | New 10.4 copy only (footer, legal, dock). Phase 10.2 `siteI18n.ts` is not rewritten. |
| `src/components/SiteBookingHost.tsx` | Mounts `CustomerBookingPreview` inside the website frame. |
| `src/components/SiteFooter.tsx` | One structure, five visual designs. |
| `src/components/SiteFloatingActions.tsx` | Desktop/tablet FABs + mobile Call \| WhatsApp \| Book dock. |
| `src/components/SiteSectionStates.tsx` | `FinalBookingCta` now themed + optional Call / WhatsApp; Book opens the existing flow. |
| Five theme renderers | Swap the old slim footer for `SiteFooter`; wire in-page Book buttons; add host + floating actions. |

## Global Book Appointment CTA

- Header Book Appointment (Phase 10.1) still **scrolls to `section-contact`**.
- Hero / service / package / staff / contact / final / mobile-dock Book
  buttons dispatch `openSiteBooking()` and mount `CustomerBookingPreview`.
- No second booking form is introduced.

## Final CTA (immediately before Footer)

Theme-specific headline + supporting text (from Phase 10.3 `bookingTitle` /
`bookingBody`) + Book Appointment + optional Call / WhatsApp.

| Theme | Treatment |
|-------|-----------|
| Barber | Charcoal band, gold rules, sharp corners |
| Hair Studio | Ink editorial band, rose outline Book |
| Beauty Spa | Emerald gradient, pill buttons |
| Family | Navy band, teal Book, rounded-xl |
| Nail & Lash | Pink gradient, ink Book pill |

## Footer (all 5 themes)

Common structure, distinct visuals:

Salon logo / name · short description · Quick Links · Services · Contact ·
Address · Opening Hours · Social · Privacy Policy · Terms & Conditions ·
Cancellation / Refund Policy · Copyright (+ Powered by Nexora).

Legal links open an in-page sheet (no new router). Footer `background-color`
still comes from each theme's `footerBg` token so Phase 10.2 dark-mode
assertions stay green.

## Floating actions

- Desktop / tablet: Call, WhatsApp, Back to Top (side stack).
- Mobile: safe sticky bottom bar **Call | WhatsApp | Book**, plus a Back to
  Top chip above it.
- A `.site-mobile-dock-spacer` keeps the last footer content out from under
  the bar. Dock uses `env(safe-area-inset-bottom)` and 44px touch targets.
- Hidden when the matching `contactOptions` flag is off or the number is
  missing. Hidden while the booking flow is open.

## Validation

```bash
npm run test:phase-10.4   # all 5 themes × desktop / tablet / mobile
npm run test:phase-10.1   # header regression
npm run test:phase-10.2   # EN/HI + dark mode
npm run test:phase-10.3   # section order
npm run lint
```
