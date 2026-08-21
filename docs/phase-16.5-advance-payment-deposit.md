# Phase 16.5 — Advance Payment / Deposit (all 5 themes)

> Status: **COMPLETE** (2026-08-16, session `arena/01a006f4-new-tamplete-app`).
> Scope: the 16.x booking flow is connected to the EXISTING payment
> architecture (the Phase 10.7 engine). The 25% advance derives from the
> REAL booking total — including multi-service selections — and a booking
> is never confirmed until the required payment succeeds. Phases 16.1–16.3
> and 10–15 preserved; still ONE booking + ONE payment architecture.
> Note: Phase 16.4 (customer details) was already covered by the existing
> 10.6 details step; no separate 16.4 work exists in this repo.

## Payment-architecture audit performed first

- **Engine** (`src/lib/siteBookingPayment.ts`, Phase 10.7): payment options
  (`pay_at_salon` / `advance` / `full`), `calculatePaymentAmounts` (advance =
  `bookingRules.advanceDepositPercentage` ?? 25, clamped 0–100), idempotency
  keys, masked PII, versioned localStorage store, deterministic **sandbox**
  gateway (`simulateGateway` — clearly labelled, no real money, no
  credentials), `retryPayment` (reuses the same row), no-confirm-before-pay
  invariant (`paid` + `confirmed` flip together).
- **Database reality**: `payment_orders` / `payments` tables exist only as
  UNAPPLIED draft M09; Razorpay integration is later-phase server work per
  the 90-point spec. So 16.5 extends the existing sandbox store — no
  payment tables, columns, gateway credentials or fake "real" transactions
  invented. A static scan test enforces no `service_role` / `rzp_*` /
  `key_secret` strings in the payment code.
- **Gap found**: the 10.7 flow priced exactly ONE service record, so 16.2
  had left multi-service Confirm as a "later phase" note — that gap is
  exactly what 16.5 closes.

## What landed

| File | Change |
|------|--------|
| `src/lib/siteBookingPayment.ts` | Additive `PaymentServiceLine` + optional `PaymentRecord.services` / `CreatePaymentRecordInput.services` (line items persist with the record); `ReceiptView.services` + joined multi-service `serviceName`. Absent = single-service, pre-16.5 rows parse unchanged. |
| `src/components/SiteBookingPaymentFlow.tsx` | Optional `serviceLines` prop: booking total = Σ offer-aware line prices (computed by the EXISTING 16.2 selection engine — never hardcoded); the existing `calculatePaymentAmounts` prices the advance from that total. Summary card lists every line + an explicit **Total / Advance (25%) / Remaining** breakdown (`payment-amount-breakdown`, `payment-total-amount`). **Duplicate-submission ref lock** on first attempt AND retry (synchronous — two clicks in one tick caught), released on resolution. |
| `src/components/SiteBookingFlow.tsx` | Summary Confirm now hands off single AND multi-service selections with the full `serviceLines` payload; `resumeAtSummary` prop — backing out of payment lands on the Booking Summary with the 16.1-draft-restored selection (date + slot + customer intact). |
| `src/components/SiteBookingFullFlow.tsx` | Carries `serviceLines` entry → payment; resumed confirmed records restore their persisted lines; back-from-payment remounts the entry flow at the summary. |
| `src/lib/siteBookingPaymentI18n.ts` | Additive EN/HI: `summary.totalAmount` / `summary.advanceAmount` / `summary.remainingAmount` / `summary.servicesCount`. |
| `src/lib/siteBookingI18n.ts` | `summary.paymentNext` (EN/HI) — the summary note now says payment comes next and confirmation requires it. |
| `scripts/test-phase-16.5.mjs` | 24-test five-theme acceptance. |
| `scripts/test-phase-16.2.mjs` | The intentional 16.2 placeholder test ("multi does NOT open payment") updated to assert the REAL 16.5 hand-off (total ₹2,300 reaches the option step). Still 55/55. |

## Money math (never hardcoded)

- Booking total = Σ offer-aware line prices from the 16.2 selection engine
  (single-service bookings keep the exact 10.7 offer/variant path).
- Advance = existing `calculatePaymentAmounts('advance', total, rules)` —
  `advanceDepositPercentage` (default 25, clamped 0–100) from the existing
  `bookingRules` field. Verified: 800→200/600, 1200→300/900, 2300→575/1725,
  and a configured 40% → 400/600.
- The option step shows **Total booking amount**, **Advance to pay now
  (25%)** and **Remaining at salon** explicitly, plus per-line prices for
  multi-service bookings.

## Confirmation invariant (unchanged, now covering multi)

- `pending` → record exists as `pending_payment` (never confirmed).
- Gateway success → `paid` + `confirmed` flip together (existing engine).
- failure / cancellation / timeout → `failed` / `cancelled` — the
  confirmation screen is unreachable from these states.
- Retry reuses the SAME row (same id, no duplicates); verified after a
  forced failure followed by a successful retry.

## Duplicate-submission guard

- New synchronous ref lock in the payment flow: `startGatewayAttempt` and
  `retryGateway` refuse re-entry while an attempt is live; released when
  the attempt resolves. UI already replaces Pay with Cancel while
  processing; the record layer's idempotency key remains the final guard.
  Verified with two clicks fired in the same React tick → one record, one
  attempt.

## Context preservation

- salon (businessId) + theme + all service lines + date + slot + combined
  duration + customer details persist into the record and the confirm
  screen (verified field-by-field).
- Back from payment → Booking Summary with the full selection (16.1 draft
  restore), not the start of the wizard.
- Confirmed bookings still clear the 16.1 draft; multi-service records
  restore their line items on refresh/resume.

## Sandbox separation (unchanged, verified)

- The gateway screen keeps the 10.7 label "Sandbox gateway · no real money
  is moved." (EN + HI) — asserted rendered on the live screen.
- Static scan: no `service_role`, `rzp_live`, `rzp_test`, `key_secret`,
  `RAZORPAY_KEY`, `sk_live`, `sk_test` anywhere in the booking/payment
  frontend code.

## Explicitly NOT in 16.5 (later phases)

- Booking confirmation extras, notifications, booking management,
  Call/WhatsApp protection (16.6+).
- Real Razorpay server integration / M09 application (per the 90-point
  spec this is server-side work with signature verification).

## Validation

```
test:phase-16.5   24/24
test:phase-16.2   55/55 (placeholder test upgraded to the real hand-off)
16.1 55/55 · 16.3 36/36 · 10.6 107/107 · 10.7 66/66
Phase 10 all green · Phase 11: 2398 · Phase 12: 582 · Phase 13: 220 ·
Phase 14: 180 · Phase 15: 244 · 9.1 9/9
validate:migrations 27/27 ×2 + 21/21 · lint 0 errors · build green ·
verify-22-screens 25/25
```
