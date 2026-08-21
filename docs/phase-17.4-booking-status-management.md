# Phase 17.4 — Booking Status Management

> Status: **COMPLETE** (2026-08-17). Scope stops at Phase 17.4. Customer
> management, revenue, calendar and notifications remain unimplemented.

## Architecture audit

Phase 17.4 reuses the existing Phase 10.7/16.5 booking/payment record and the
Phase 16.7 mutation layer. It does not add a booking store, table, identifier,
status or payment field.

Owner identity still follows the existing chain:

```text
auth.users.id
  → organization_members.user_id (owner, active)
  → organization_members.organization_id
  → salons.organization_id
  → salons.id
```

`job_salon_members` is a staff relationship and is not used for ownership.
The live app's database booking migrations remain unapplied drafts, so this
phase does not invent an RPC against an unavailable schema. The current local
booking adapter enforces permission, tenant scope, row ownership, payment
prerequisite and transition rules inside the data layer. The draft database
architecture continues to provide RLS/status-history boundaries when it is
finalized and applied.

## Status rules

The controls expose the existing customer-facing groups only: Pending,
Confirmed, Completed and Cancelled. Existing internal compatibility values
(`pay_at_salon` and `failed`) are preserved and are not replaced by invented
statuses.

| Persisted state | Owner actions |
|---|---|
| Pending + required payment not paid | Cancel |
| Pending + required payment paid | Confirm, Cancel |
| Confirmed / pay at salon | Complete, Cancel |
| Completed / Cancelled / Failed | None (terminal) |

The mutation layer repeats these checks even if a caller bypasses the UI:

- advance/full-payment bookings cannot be confirmed unless `paymentStatus` is
  `paid`;
- duplicate requests return `duplicate-update`;
- jumps and terminal-state changes return `invalid-transition`;
- an exact booking id from another tenant remains inaccessible;
- the Phase 17 dashboard actor carries the tenant keys derived from its
  session-resolved salon, and a different business key is refused;
- booking and payment statuses remain distinct persisted fields.

Phase 16.7's existing completion/balance-collection behavior is preserved.
Cancellation never invents a refund and paid payment records stay paid.

## UI

`OwnerBookingStatusControls` is shared by the Today and Upcoming appointment
rows. It provides:

- Confirm / Mark completed / Cancel actions only when valid;
- a separate confirmation step before cancellation;
- disabled loading controls while an update is in flight;
- localized success and actionable error/permission feedback;
- immediate dashboard refresh through the existing `PAYMENT_EVENT` bus;
- touch-sized, wrapping mobile controls and responsive tablet/desktop layout;
- English/Hindi and light/dark rendering through the existing dashboard
  locale and palette systems.

Loading, empty, source-error and permission-denied states from Phases 17.1–17.3
remain intact.

## Files

- `src/components/OwnerBookingStatusControls.tsx` — shared controls and feedback.
- `src/components/OwnerAppointmentRow.tsx` — mounts controls on real rows.
- `src/lib/bookingManagement.ts` — record-aware transitions, payment gate,
  duplicate guard and tenant-scoped authorization.
- `src/lib/ownerTodayAppointments.ts` — carries the existing record's immutable
  tenant/payment-option locator into the row view model.
- `src/components/OwnerDashboard.tsx` — binds actor scope to the
  session-resolved salon tenant.
- `src/lib/ownerDashboardI18n.ts` — EN/HI Phase 17.4 copy.
- `scripts/test-phase-17.4.mjs` — 22-test acceptance suite.

## Verification

```bash
npm run lint
npm run build
npm run test:phase-17.4
npm run test:phase-17.1
npm run test:phase-17.2
npm run test:phase-17.3
npm run test:phase-16.7
```

Phase 17.4 acceptance: **22 passed, 0 failed**.
