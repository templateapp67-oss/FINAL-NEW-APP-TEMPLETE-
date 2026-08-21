# Phase 12.6 — Service Detail Experience (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: the Service Detail view/modal opened from the Complete Services
> directory. No hero / trust / featured-services / header / language / dark-mode
> change; no booking-architecture or database-structure change; Phase 10, 11,
> and 12.1–12.5 are untouched.

## What was built

Selecting a service in the Complete Services directory opens a clean,
theme-specific Service Detail modal (`src/components/SiteServiceDetail.tsx`).

The modal shows real, configured data only:

| Field          | Source                                                              |
|----------------|---------------------------------------------------------------------|
| Name           | catalog (EN + हिन्दी via `displayService`)                          |
| Full description | catalog, not line-clamped                                        |
| Category       | catalog, translated                                                |
| Price / Starting| offer-aware price; "From ₹X" when multiple active price options    |
| Duration       | catalog minutes                                                    |
| Active Offer   | badge + discount amount (`featuredDiscountLabel`), dates respected |
| Image/Icon     | real media when available, else a themed category glyph            |
| Available staff| real team members (see `staffForService`)                          |
| Book Now CTA   | opens the existing booking flow with theme + category + service preserved |

## Booking — no re-selection

`Book Now` calls `openSiteBookingForService(service, themeId)` (Phase 12.3),
which hands the SAME `nexora:open-booking` event a one-shot prefill; the flow
pre-selects the service, so the customer never picks it again. The modal closes
on book, close, or backdrop.

## Staff — never invented

`staffForService(data, serviceId)` in `src/lib/siteServiceDetail.ts`:
- excludes members **on leave / inactive**;
- when the salon assigns services (`assignedServiceIds`), shows only members
  assigned to the selected service;
- when no member has assignments, shows all available members (salon has not
  configured per-service staffing);
- renders nothing when there is no team.

## Theme isolation

Each theme opens only its own service details (the directory already resolves
services from the active theme), the modal carries `data-theme`, and a theme
switch closes any open modal via the `useEffect([themeId])` reset.

## UI

Five distinct modal treatments (surfaces + typography + shape): barber
charcoal/gold sharp, hair paper/rose, spa cream/emerald rounded, family
white/teal, nail cream/pink. Mobile-first bottom sheet → centered dialog on
desktop; EN/HI; light/dark; and the directory's existing loading/empty/error
states still gate the modal (no detail triggers render while loading).

## Files

- `src/lib/siteServiceDetail.ts` — `staffForService` helper.
- `src/lib/siteServiceDetailI18n.ts` — EN/हिन्दी modal labels.
- `src/components/SiteServiceDetail.tsx` — the modal.
- `src/components/SiteServiceDirectory.tsx` — card name opens the detail;
  modal rendered over the frame; closed on theme switch.
- `scripts/test-phase-12.6.mjs` — 59-assertion five-theme acceptance suite.

## Validation

- `npm run test:phase-12.6` → **59/59 passed**
- `test:phase-12.5` 83/83 · `test:phase-12.4` 105/105 · `test:phase-12.3` 74/74 ·
  `test:phase-12.2` 117/117 · `test:phase-12.1` 84/84 · `test:phase-11.8` 450/450
- Phase 10 all green: 10.1 80 · 10.2 49 · 10.3 86 · 10.4 118 · 10.5 56 ·
  10.6 102 · 10.7 66 · 10.8 36 · 10.9 77 · 10.12 178 · 10.13 339
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
