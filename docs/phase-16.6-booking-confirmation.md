# Phase 16.6 — Booking Confirmation (all 5 themes)

> Status: **COMPLETE** (2026-08-16, session `arena/01a00b45-new-tamplete-app`).
> Scope: a clear Booking Confirmation screen built on the EXISTING booking /
> payment / auth architecture. Real booking data, the existing booking
> reference, four clearly distinguished states, a re-openable
> summary/receipt in the booking history, and duplicate-booking protection.
> Phases 16.1–16.5, 16.7 and 10–15 preserved; still ONE booking system.

## Architecture audit performed first

- **Booking + payment records** live in the Phase 10.7 / 16.5 engine
  (`src/lib/siteBookingPayment.ts`): browser-local, versioned, tenant
  (`businessId` + `themeId`) and customer (`customerId` =
  `bookingBrowserId()`) keyed, with the 16.5 money snapshot
  (`baseAmount` / `amountDue` / `remainingAmount`) and the status pair
  (`bookingStatus` × `paymentStatus`).
- **Booking reference** is already produced by the existing
  `generateBookingId()` → `PaymentRecord.bookingId` (`NX-#####`, the
  established `NX-10482` style). 16.6 **reads** it; it never mints ids.
- **Management rules** (16.7, `bookingManagement.ts`) already own the
  money rule (`bookingMoney`) and the service-name rule
  (`bookingServiceNames`) — 16.6 reuses both so the confirmation screen
  and the booking list can never disagree.
- **Database reality unchanged**: `bookings` / `payments` (M08 / M09)
  remain UNAPPLIED drafts. No tables, columns, ids, amounts or fake
  bookings were invented; nothing was executed against a database.

## What landed

| File | Change |
|------|--------|
| `src/lib/siteBookingConfirmation.ts` | **New** derivation layer (read-only): `bookingConfirmationState`, `toBookingConfirmation` → `BookingConfirmationView`, `readBookingConfirmation` / `readMyBookingConfirmations` (own rows only, tenant+theme keyed), `findActiveBookingForContext` + `bookingContextKey` (duplicate protection), `bookingServiceIds` / `bookingServiceLines`, `bookingConfirmationReceiptText`. |
| `src/lib/siteBookingConfirmationI18n.ts` | **New** EN/HI table for the confirmation screen (states, headlines, field labels, actions, history, receipt, duplicate notice). |
| `src/components/SiteBookingConfirmation.tsx` | **New** shared panel: status banner + reference + full details + failure reason + summary/receipt + download; `BookingConfirmationStateCard` for loading / error / not-found. Uses the existing per-theme payment surfaces (light/dark inherited); mobile-first fluid layout. |
| `src/components/SiteBookingPaymentFlow.tsx` | Confirmation step now renders the **derived** state (banner icon/colour/copy/chip from `bookingConfirmationState`, `data-confirmation-state`, `data-confirmed`) and the shared panel as `payment-confirm-card`. Duplicate-booking guard (`findLiveDuplicate` + `reuseConfirmedDuplicate`) runs before ANY record creation on both the pay-at-salon and gateway paths. |
| `src/components/SiteMyBookings.tsx` | Each history row gains a **View summary** toggle that opens the same confirmation panel for that booking (resolved through `readBookingConfirmation`). |
| `scripts/test-phase-16.6.mjs` + `package.json` | 54-test five-theme acceptance suite (`npm run test:phase-16.6`). |

## Confirmation state machine (derived, never asserted by the UI)

| Persisted pair | Confirmation state |
|----------------|--------------------|
| `confirmed` + `paid` | **Confirmed** |
| `pay_at_salon` (no advance required) | **Confirmed** |
| `pending_payment` + `pending`/`unpaid` | **Payment pending** |
| `confirmed` + not `paid` (inconsistent row) | **Payment pending** — fail-closed |
| any + `failed` / `failed` booking | **Payment failed** |
| any + `cancelled` / `cancelled` booking | **Cancelled** |
| `completed` (16.7 terminal) | **Completed** |

- **"Confirmed" is never shown until the required advance actually
  succeeded.** Verified for `unpaid`, `pending`, `failed` and `cancelled`
  payment statuses — even a row claiming `bookingStatus: 'confirmed'`
  degrades to Payment pending / failed.
- The four states render with four **distinct colours**, distinct
  headlines and a state chip; non-confirmed states also show an explicit
  "Not confirmed until payment succeeds" warning.

## Real booking information displayed

Salon · Service(s) · Date · Time · Duration · Total amount · Advance paid ·
Remaining amount · Payment status · Booking status · Booking reference
(+ staff, payment reference and failure reason when present) — each read
from the persisted record, each with its own test id
(`booking-confirmation-salon` … `booking-confirmation-payment-status`).
Amounts are echoed verbatim: the layer never recomputes money.

## Duplicate-booking protection

- `findActiveBookingForContext` matches an existing **live** booking
  (`pending_payment` / `confirmed` / `pay_at_salon` / `completed`) by
  salon + theme + sorted service ids + date + slot + this visitor's
  mobile (digits only, country code stripped) **and** browser identity.
- The payment flow consults it before creating any record; an already
  confirmed match re-opens its confirmation (with a localized notice)
  instead of booking again, and a live pending match donates its
  reference. This sits on top of the existing idempotency key and the
  16.5 synchronous submit lock.
- `failed` / `cancelled` rows are deliberately **not** duplicates — those
  slots may legitimately be re-attempted.
- Verified: refresh on the confirmation page, re-entering the flow, retry
  after a failure and a second Continue all leave exactly ONE record with
  the ORIGINAL reference. Another customer's live booking never blocks a
  visitor.

## Privacy

- `readBookingConfirmation` / `readMyBookingConfirmations` read the
  browser identity INSIDE the helper and are tenant + theme keyed, so a
  caller cannot request another customer's or another salon's booking —
  those return `not-found`, never data.
- The history summary can only open rows the visitor owns at the active
  salon; foreign customers/salons/themes never render.

## States, i18n, appearance, responsive

- Loading / error(+Retry) via the shared `'booking'` section seam (the
  same one 16.3/16.7 use); `not-found` card; payment-failure surfaces the
  recorded reason; retry-payment action offered only for recoverable
  non-confirmed states.
- EN/HI complete (every key present in both and different); light/dark
  through the existing `paymentSurfaces` / `bookingSurfaces`; all five
  themes give the panel their own surface; mobile-first fluid layout with
  no fixed pixel widths (desktop / tablet / mobile).

## Explicitly NOT in 16.6

- Call/WhatsApp protection, notifications, final acceptance testing
  (16.8+).
- Real Razorpay / M09 server integration or any database execution.
- Phase 16.7 booking management was NOT re-implemented — it is reused.

## Validation

```
test:phase-16.6   54/54
16.1 55 · 16.2 55 · 16.3 36 · 16.5 24 · 16.7 38 · 10.6 107 · 10.7 66
Phase 10 all green (10.1 80, 10.2 49, 10.3 86, 10.4 118, 10.5 56,
  10.8 36, 10.9 77, 10.11 72, 10.12 178, 10.13 339)
Phase 11 2398 · Phase 12 582 · Phase 13 220 · Phase 14 180 · Phase 15 244
validate:migrations 27/27 ×2 + 21/21 · lint 0 errors · build green ·
verify-22-screens 25/25
```
