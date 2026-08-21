# Phase 17.9 — Dashboard Filters & Responsive UX

> Status: **COMPLETE** (2026-08-17). Scope stops at Phase 17.9. Phase 17.10
> final acceptance was not started.

## Architecture

Phase 17.9 adds one transient shared filter state to the existing Owner
Dashboard. It introduces no table, column, identifier, relationship, storage
key or alternate data reader.

All filter options are derived after authorization from the existing booking
and payment records returned by `readSalonBookings()`:

- booking statuses that actually occur in the owner's rows;
- payment statuses that actually occur in the owner's rows;
- service ids/names from existing single-service or multi-service booking
  snapshots;
- fixed date-range operations over existing dates/timestamps.

Ownership remains:

```text
auth.users.id
  → organization_members.user_id (active owner)
  → organization_members.organization_id
  → salons.organization_id
  → salons.id
```

The session-resolved organization/salon candidates remain bound to the actor.
Filter option reads and every filtered section read continue through the same
tenant authorization boundary. `job_salon_members` is not used for ownership.

## Shared filters

The shared filter surface provides:

- Date / range: All dates, Today, 7 days, 30 days;
- Booking status;
- Payment status;
- Service;
- active-filter count;
- one Clear Filters action restoring the canonical defaults.

Status and service option values are never hardcoded business records. They
come from the authenticated salon's current records only.

Date semantics preserve each section's existing purpose:

- appointments, customers and calendar use appointment `dateKey`; 7/30-day
  ranges are forward windows from the salon-local today;
- revenue uses existing booking/payment `createdAt`; 7/30-day ranges are
  trailing financial-record windows;
- notifications use each real event's persisted created/updated timestamp;
- Today's Appointments remains intersected with today;
- Upcoming remains intersected with strictly future active appointments.

All local-date calculations avoid UTC conversion.

## Section integration

- **Today's Appointments** — booking status, payment status and service filter
  real rows; date filters intersect today's fixed scope.
- **Upcoming Appointments** — filters apply before future grouping and counts.
- **Customers** — the directory and each customer's booking count/history are
  rebuilt only from matching authorized bookings; existing text search remains.
- **Revenue & Payments** — filtering happens before totals. The direct
  standalone component retains its Phase 17.6 date controls; inside the Owner
  Dashboard the shared date filter replaces duplicate date controls.
- **Calendar / Schedule** — filters appointment rows without changing Phase 16
  availability/status rules or enabling booking creation.
- **Notifications** — source-record status/payment/service filters apply before
  event projection; date range applies to the real event timestamp. Existing
  event-type filters remain available.

An active filter with no matches renders a localized no-results state, not an
incorrect "no data ever" empty state. Synchronous local-record filtering keeps
existing content mounted without flashing loading skeletons.

## Responsive and accessible UX

- Mobile filter controls collapse behind a labelled touch-sized toggle.
- Tablet uses a two-column control grid; desktop uses four columns.
- Native labelled selects provide keyboard operation.
- Focus-visible rings, `aria-expanded`, `aria-pressed`, `aria-live`, disabled
  reset state and minimum 44px touch targets are provided.
- Main dashboard content now has `min-w-0` and horizontal overflow containment.
- Spacing scales mobile → tablet → desktop.
- Calendar retains 1/2/7-column reflow and no unusable table layout.
- Existing English/Hindi and light/dark palette systems cover every filter and
  no-results string/surface.

## Files

- `src/lib/ownerDashboardFilters.ts` — authorized options and shared predicates.
- `src/components/OwnerDashboardFilters.tsx` — responsive accessible controls.
- `src/components/OwnerDashboard.tsx` — shared filter state and section wiring.
- Existing Today, Upcoming, Customers, Revenue, Calendar and Notifications
  data/UI modules — additive optional filter support.
- `src/lib/ownerDashboardI18n.ts` — English/Hindi copy.
- `scripts/test-phase-17.9.mjs` — Phase 17.9 acceptance coverage only.

## Verification

```bash
npm run lint
npm run build
npm run test:phase-17.9
npm run test:phase-17.8
npm run test:phase-16.10
```

Phase 17.9 acceptance: **33 passed, 0 failed**.
