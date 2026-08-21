# Phase 17.6 — Revenue & Payment Summary

> Status: **COMPLETE** (2026-08-17). Scope stops at Phase 17.6. Calendar and
> notifications remain unimplemented.

## Schema and payment audit

Phase 17.6 reuses the existing booking/payment architecture:

- Phase 10.7/16.5 `PaymentRecord` fields: `businessId`, `themeId`,
  `baseAmount`, `amountDue`, `remainingAmount`, `bookingStatus`,
  `paymentStatus`, `createdAt` and `updatedAt`;
- draft `bookings` fields keep `booking_status`, `payment_status`,
  `service_price_paise`, `advance_paise` and `remaining_paise` separate;
- draft `payments`, `payment_orders` and `balance_collections` remain the
  existing database financial relationships;
- `readSalonBookings()` remains the current tenant-keyed read boundary.

No table, column, transaction, identifier, analytics store or storage key was
added.

## Ownership and authorization

The Owner Dashboard still resolves exactly one salon through:

```text
auth.users.id
  → organization_members.user_id (active owner)
  → organization_members.organization_id
  → salons.organization_id
  → salons.id
```

The resulting organization/salon tenant keys are bound to the booking actor.
Every summary read passes through `readSalonBookings()`, which re-checks actor
permission and rejects business keys outside that session-resolved scope. A
refusal on any tenant candidate refuses the complete financial result.

`job_salon_members` is not used for ownership.

The draft M12 policies already restrict payment/order/balance reads to the
owning `owner_admin` tenant. Since M01–M27 are still unapplied drafts, this
phase does not invent a live RPC against an unavailable schema; it preserves
the existing database-side RLS design.

## Calculation rules

All values are sums of persisted record fields after optional date filtering:

- **Total booking value** — `baseAmount` for bookings whose booking status is
  not failed/cancelled.
- **Amount received** — `amountDue` only when payment status is `paid` and the
  booking is not failed/cancelled.
- **Remaining amount** — persisted `remainingAmount` after a successful
  payment; otherwise the full `baseAmount` remains due. Failed/cancelled
  bookings contribute zero.
- **Paid/successful** — paid payment records on non-failed/non-cancelled
  bookings.
- **Pending, failed, unpaid, cancelled and refunded** — independent payment
  status buckets, with counts and their existing requested/recorded amounts.
- **Paid on cancelled bookings** — shown separately when present and excluded
  from received revenue. It is not represented as a refund.

Booking and payment statuses remain separate in every predicate. Failed,
cancelled, refunded and unpaid values never enter received revenue.

## Mock/Test mode

The current payment engine is the existing deterministic mock gateway. The
summary is explicitly marked **Test / Mock payment data**, carries
`data-payment-mode="mock"`, and states that values are not production
settlements. No simulated record is presented as real payment processing.

## Date filtering

All time, Today, Last 7 days and Last 30 days use the existing record
`createdAt` timestamp. Boundaries use the salon-local calendar day and never a
UTC conversion.

## UI and states

- Responsive one/two/three-column summary cards for mobile/tablet/desktop.
- Existing light/dark palette and English/Hindi preference systems.
- Loading skeletons, empty period, error/retry and authorization refusal.
- Immediate recalculation through the existing `PAYMENT_EVENT` bus.
- Conditional cancelled/refunded cards only when matching supported statuses
  exist in the records.
- Calendar and Notifications remain foundation placeholders.

## Files

- `src/lib/ownerRevenueSummary.ts` — authorization, filters and calculations.
- `src/components/OwnerRevenueSummary.tsx` — dashboard summary and states.
- `src/components/OwnerDashboard.tsx` — session-scoped Revenue section mount.
- `src/lib/ownerDashboardI18n.ts` — English/Hindi copy.
- `scripts/test-phase-17.6.mjs` — Phase 17.6 acceptance suite.

## Verification

```bash
npm run lint
npm run build
npm run test:phase-17.6
npm run test:phase-17.5
npm run test:phase-17.4
npm run test:phase-16.10
```

Phase 17.6 acceptance: **33 passed, 0 failed**.
