# Phase 12.3 — Service Card Enhancement (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: enhance the Phase 12.2 Featured Service cards. No hero / trust /
> featured-services-logic / header / language / dark-mode change; no booking
> architecture or database-structure change; Phase 10, 11, 12.1 and 12.2 are
> untouched.

## What changed on each card

Each Featured Service card now shows the full field set:

| Field               | Source                                                            |
|---------------------|-------------------------------------------------------------------|
| Service Name        | catalog (EN primary; Hindi via `catalogLocaleSeed` / DB copy)     |
| Description         | catalog (short description)                                       |
| Price / Starting    | offer-aware price; "From ₹X" when multiple active price options   |
| Duration            | catalog `default_duration_minutes`                                |
| Image/Icon          | real media when a source provides it, else a themed category icon |
| Offer/Discount badge| active offer's `promotionalBadge` + computed "%/₹ off" label      |
| Suggested/Popular   | `isSuggested` → "Suggested"; top-ranked (`suggestedSortOrder` 0) → "Popular" |
| Book Now CTA        | opens the existing booking flow **with the service preserved**    |

## Offer display rules

- Only **active** offers are shown (`isOfferActive` — status + start/end date).
- **Start/end dates are respected**: future-dated offers wait, expired offers
  disappear automatically (`endDate < today` → `expired`).
- The **discount amount is shown** — percentage offers render "20% off", fixed
  offers render "₹100 off" (`featuredDiscountLabel`, straight from
  `discountValue`).
- **No invented discounts**: with no offer there is no badge, no strikethrough
  and the plain base price.

## Theme isolation

Unchanged from Phase 12.2 and re-verified: each theme shows only its own
suggested services (theme-scoped catalog, cross-theme responses rejected), and
each theme keeps its own card design — no card styling is copied across themes.

## CTA — selected service preserved

`Book Now` now calls `openSiteBookingForService(service, themeId)` (new helper
in `src/lib/siteBooking.ts`) which stores a one-shot in-memory prefill and
dispatches the SAME `nexora:open-booking` event. `SiteBookingFlow` reads and
consumes the prefill on mount, prepends the featured service to the theme's own
list, and pre-selects it. This is additive only — the flow's steps
(Service → Date → Time → Details → Summary) and the single booking host are
unchanged, and a plain header/final Book Appointment never inherits a stale
prefill (consumed once + cleared).

## Files

- `src/lib/siteFeaturedServices.ts` — added `isSuggested`, `suggestedSortOrder`,
  `media`, `pricingVariants` to the model; `featuredDiscountLabel`,
  `featuredStartingPrice`, `featuredServiceToService`.
- `src/lib/siteFeaturedI18n.ts` — EN/हिन्दी "Suggested"/"Popular"/"From" labels.
- `src/lib/siteBooking.ts` — `openSiteBookingForService` +
  `consumeBookingServicePrefill` (existing booking event, no new flow).
- `src/components/SiteBookingFlow.tsx` — consumes the prefill (additive).
- `src/components/SiteFeaturedServices.tsx` — icon/media, badges, discount
  label, starting price, service-preserving CTA.
- `scripts/test-phase-12.3.mjs` — 74-assertion five-theme acceptance suite.

## Validation

- `npm run test:phase-12.3` → **74/74 passed**
- `test:phase-12.2` 117/117 · `test:phase-12.1` 84/84 · `test:phase-11.8` 450/450
- Booking regression: `test:phase-10.6` 102/102 · `test:phase-10.7` 66/66
- `test:phase-10.2` 49/49 · `test:phase-10.12` 178/178 · `test:phase-10.13` 339/339
- `npm run lint`, `npm run build`, `node verify-22-screens.js` → clean
