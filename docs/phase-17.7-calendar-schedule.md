# Phase 17.7 — Calendar / Schedule View

> Status: **COMPLETE** (2026-08-17). Scope stops at Phase 17.7.
> Notifications remain unimplemented.

## Architecture and schema audit

Phase 17.7 is a read-only schedule projection over existing booking records:

- existing `bookings.appointment_date`, `start_time`, `end_time`,
  `service_name_snapshot`, `booking_status` and `payment_status` fields;
- current Phase 10.7/16.5 `PaymentRecord.dateKey`, `startMinutes`, `endMinutes`,
  service lines and separate booking/payment status snapshots;
- existing Phase 16.7 `readSalonBookings()` authorization boundary;
- existing Phase 16.3 `bookingStatusBlocksAvailability()` semantics.

No calendar/event table, relationship, identifier, booking path, column or
storage key was added.

## Ownership and isolation

Owner access remains:

```text
auth.users.id
  → organization_members.user_id (active owner)
  → organization_members.organization_id
  → salons.organization_id
  → salons.id
```

The Calendar receives only the tenant candidates derived from this resolved
salon. Every schedule read goes through `readSalonBookings()`, which re-checks
the actor and refuses out-of-scope tenant keys. A refusal on any candidate
refuses the entire schedule, so another salon's appointment or customer data
cannot appear.

`job_salon_members` is not used for ownership.

## Views and date behavior

- **Day view** shows only the selected salon-local calendar date.
- **Week view** is Monday-first and contains seven salon-local dates.
- Previous/next moves one day or one week; Today returns to the salon's current
  local date.
- Date operations never use UTC conversion.
- Appointments sort by date, start time, end time and booking reference.

## Appointment periods and availability

Each real booking row supplies:

- appointment date;
- start and end time;
- duration derived from the persisted slot span established by Phase 16;
- single or multi-service names;
- booking status;
- payment status.

Period treatment reuses the existing availability rule:

- pending, confirmed and pay-at-salon appointments are **Booked** and block
  their real spans;
- cancelled/failed appointments are **Cancelled** and their spans are marked
  **Released · available again**, because the existing Phase 16 availability
  predicate no longer blocks those spans;
- completed appointments are visually distinct as **Completed**.

The schedule does not claim arbitrary empty business hours are available when
real opening-hour/service/staff availability inputs are unavailable. It marks
availability only where the existing booking rule can prove a persisted
cancelled/failed span was released. This avoids inventing hours or slots.

## Existing booking management

Selecting an appointment opens the existing shared `OwnerAppointmentRow`:

- full existing booking details;
- existing customer/contact permission behavior;
- existing Phase 17.4 guarded status controls;
- existing payment prerequisite and transition rules.

The Calendar contains no create, reserve, reschedule or payment action, so it
cannot bypass Phase 16 conflict, availability or payment protections.

## UI and states

- Responsive day/week grid: one column on mobile, two on tablet, seven on wide
  desktop.
- Bottom-sheet booking details on mobile and centered dialog on larger screens.
- Explicit loading skeletons, empty visible period, error/retry and permission
  refusal states.
- Immediate updates via the existing `PAYMENT_EVENT` and salon-clock event.
- English/Hindi and light/dark through existing dashboard preferences/tokens.
- Notifications remains the only foundation placeholder.

## Files

- `src/lib/ownerCalendarSchedule.ts` — authorization, status projection,
  local-date navigation and grouping.
- `src/components/OwnerCalendarSchedule.tsx` — day/week schedule and details.
- `src/lib/siteBookingAvailability.ts` — exports the existing Phase 16 status
  blocking predicate for reuse.
- `src/components/OwnerDashboard.tsx` — session-scoped Calendar mount.
- `src/lib/ownerDashboardI18n.ts` — English/Hindi copy.
- `scripts/test-phase-17.7.mjs` — acceptance suite.

## Verification

```bash
npm run lint
npm run build
npm run test:phase-17.7
npm run test:phase-17.6
npm run test:phase-17.5
npm run test:phase-16.10
```

Phase 17.7 acceptance: **35 passed, 0 failed**.
