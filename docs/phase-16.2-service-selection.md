# Phase 16.2 — Service Selection (all 5 themes)

> Status: **COMPLETE** (2026-08-16, session `arena/01a006f4-new-tamplete-app`).
> Scope: the booking flow's Service step is connected to the EXISTING
> theme-specific service system and gains **multi-service selection with
> automatic price + duration totals**. Phase 16.1 and Phases 10–15 are
> preserved; still exactly ONE booking architecture. No date/time slot work,
> no payment, no advance, no confirmation, no notifications, no management.

## What landed

| File | Role |
|------|------|
| `src/lib/siteBookingFlow.ts` | Additive multi-selection engine: `BOOKING_MAX_SERVICES` (6), `toggleBookingService` (ordered toggle + cap), `bookingSelectedServices` (resolve ids against the ACTIVE theme's list only — unknown/foreign/stale ids dropped), `bookingSelectionSummary` (auto totals via the EXISTING `serviceDisplayPrice` offer engine + variant-aware `bookingServiceDuration`), `bookingCombinedSlotService` (the selection as ONE sitting for the existing slot/hold engine; single selection collapses to the plain service so 10.6 hold keys stay identical). |
| `src/lib/siteBookingDraft.ts` | Additive: `BookingDraftServiceLine[]` (`services`), `totalPrice`, `totalDurationMinutes`; store version bumped to 2 (old v1 payloads fail closed as before); legacy/injected rows normalise to an empty line list on read. The 16.1 single-service fields now mirror line 1 + summed totals. |
| `src/lib/siteBookingI18n.ts` | Additive EN/HI copy: multi-select hint, Add/Added/Remove, selection totals panel, per-appointment limit note, service loading/error/retry, `summary.services`, `summary.multiPaymentNote`. |
| `src/components/SiteBookingFlow.tsx` | Service step multi-select UI (ordered `selectedServiceIds`), live totals panel (per-line name/duration/price + Remove, total duration + total price, Clear all, cap note), summary line items + totals, loading/error/retry states through the shared section seam, combined-sitting wiring into `pickSlot`/slots/gating. |
| `scripts/test-phase-16.2.mjs` | 55-test five-theme acceptance (engine + real React UI in jsdom). |

## Where the services come from (existing relationships only)

- The list is `bookingServicesForTheme(data, themeId)` — the SAME 10.6
  function: active catalog rows only, theme provenance must match the active
  theme, no foreign/inactive rows. Nothing new was queried, copied or seeded.
- Each row shows **name, category, price, duration** — price through the
  EXISTING Phase 9.1 `serviceDisplayPrice` (offer-aware), duration through
  the existing row (active pricing-variant override wins, as the 10.6
  summary already did).
- No new IDs, tables, columns, prices or fake services. The engine can only
  resolve ids that exist on the active theme's own list at resolve time.

## Multi-service selection

- Tap to **add**, tap again (or Remove in the totals panel) to take out;
  selection order is preserved. `Clear all` empties it; Continue requires
  ≥ 1 service. Cap: 6 services per appointment (engine-enforced, toast+note).
- **Auto totals**: offer-aware total price + summed duration, recalculated
  on every change (`booking-selection-totals` exposes `data-count`,
  `data-total-price`, `data-total-duration` for tests).
- **One sitting**: `bookingCombinedSlotService` feeds the EXISTING slot/hold
  engine one pseudo-service (stable sorted-id key + summed duration), so a
  multi-service appointment blocks its whole span for other visitors and
  ONE hold row exists. Any selection change releases the held slot (the
  sitting length changed) and the time step re-holds with the new span.
- **Single-service stays byte-identical to 10.6/10.7**: the combined
  service collapses to the plain service (same hold key), and the summary
  Confirm hands off to the existing payment flow exactly as before.
- **Multi-service Confirm** stays on the summary with a clear localized
  note ("online payment for multi-service bookings unlocks in a later
  phase") — the existing 10.7 payment engine prices exactly one service
  record, so wiring multi-service payment belongs to the payment phase.
  No fake payment, no partial hand-off.

## Draft (16.1 foundation) extension

- The draft now snapshots **every line** (`serviceId`, `serviceName`,
  `category`, offer-aware `price`, `durationMinutes`) plus `totalPrice` and
  `totalDurationMinutes`. The 16.1 fields (`serviceId`, `servicePrice`,
  `serviceDurationMinutes`) mirror line 1 + totals so earlier consumers
  keep working.
- Resume restores the FULL selection (lines that no longer exist on the
  active theme are dropped at resolve time). Store version bumped to 2.

## Theme isolation (verified per theme)

- Foreign-theme rows, inactive rows and other themes' ids can never render,
  never resolve into a selection, and never enter the totals.
- A selection/draft made on one theme never leaks into another theme's flow
  (16.1 keyed drafts + active-list resolution).
- Nothing was copied between themes — the five catalogs stay untouched.

## Loading / error / empty states

- The service step honours the SAME shared section seam the public website
  'services' section uses (`injectedSectionStatus('services')`): skeleton
  loading state, error state with a Retry button (re-reads the seam), and
  the existing empty state. No second state system.
- EN/HI for all new copy; light/dark via the existing `bookingSurfaces`;
  same mobile-first grid — desktop/tablet/mobile unchanged.

## Explicitly NOT in 16.2 (later phases)

- Real/server time-slot management (16.3+).
- Payment, 25% advance, confirmation, notifications, booking management.
- Multi-service payment hand-off (needs the payment-phase engine).
- Any database execution (M01–M27 stay unapplied drafts; no new fields).

## Validation

```
test:phase-16.2   55/55
test:phase-16.1   55/55   (unchanged, still green)
test:phase-10.6  107/107 · test:phase-10.7 66/66
Phase 10: 10.1 80, 10.2 49, 10.3 86, 10.4 118, 10.5 56, 10.8 36, 10.9 77,
          10.11 72, 10.12 178, 10.13 339
Phase 11: 2398 all green · Phase 12: 582 all green · Phase 13: 220 all green
Phase 14: 180 all green · Phase 15: 244 all green · 9.1 9/9
validate:migrations 27/27 ×2 + 21/21 · lint 0 errors · build green ·
verify-22-screens 25/25
```
