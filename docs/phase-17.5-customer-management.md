# Phase 17.5 — Customer Management

> Status: **COMPLETE** (2026-08-17). Scope stops at Phase 17.5. Revenue/payment
> analytics, calendar and notifications remain unimplemented.

## Schema and architecture audit

Phase 17.5 reuses the existing relationships and persisted booking snapshots:

- `customers.business_id` identifies the tenant in the draft database schema;
- `bookings.customer_id → customers.id` is the existing customer/booking link;
- the currently active browser booking adapter already persists the matching
  `PaymentRecord.customerId` plus the booking-time customer name, mobile and
  optional email snapshot;
- `readSalonBookings()` is the existing authorized, tenant-keyed read boundary.

No table, column, identifier, profile, customer record or storage key was
added. The customer directory is a read-only projection of real booking rows.
A person cannot appear without at least one existing booking.

## Ownership and privacy

Owner access remains:

```text
auth.users.id
  → organization_members.user_id (role = owner, status = active)
  → organization_members.organization_id
  → salons.organization_id
  → salons.id
```

`OwnerDashboard` passes the tenant candidates derived from that resolved salon
into both the actor scope and the Customers reader. Every read passes through
`readSalonBookings()`, which refuses unauthorized or out-of-scope tenant keys.
A refusal on any tenant candidate refuses the whole directory rather than
returning a misleading partial list.

`job_salon_members` is not used for ownership.

The draft M12 database policies already scope `customers` and `bookings`
SELECT access by tenant membership/role. Because the M01–M27 database schema is
still an unapplied draft, Phase 17.5 does not invent a live RPC or parallel
schema. The existing RLS boundary remains the database-side design when those
migrations are finalized.

The UI exposes only fields already available in authorized booking snapshots:
name, mobile, optional email, booking count, recent booking, and that
customer's own-salon booking history. Notes, payment details and records from
other salons are not exposed.

## Customer projection

- Rows are grouped by the existing `customerId`; names or phone numbers are
  never used to invent/merge identities.
- Contact fields use the newest non-empty real snapshot. This preserves an
  older available email when a newer booking omitted the optional field.
- Total bookings is the number of real authorized booking rows.
- Recent booking and booking history use existing booking `createdAt` values,
  with deterministic update/reference tie breaks.
- Directory order uses the customer's latest existing `updatedAt` activity.
- History includes real appointment date/time, services, booking status and
  booking reference, newest booking first.
- Missing customer ids are ignored rather than assigned an "unknown" id.

## UI

The Customers dashboard section provides:

- responsive customer cards for mobile, tablet and desktop;
- contact information, total bookings and a recent-booking summary;
- expandable per-customer booking history;
- search over already-authorized real name, phone, optional email, booking
  reference and service values;
- immediate refresh through the existing `PAYMENT_EVENT` bus;
- loading skeletons, empty state, error/retry, no-results and authorization
  refusal states;
- English/Hindi and light/dark rendering through the existing dashboard
  preference and palette systems.

Revenue/payment analytics, calendar and notifications remain foundation
placeholders.

## Files

- `src/lib/ownerCustomers.ts` — authorized customer/history projection,
  grouping, recent-activity ordering and search.
- `src/components/OwnerCustomers.tsx` — Customers section UI and states.
- `src/components/OwnerDashboard.tsx` — mounts Customers with the same
  session-derived actor and tenant scope used by appointments.
- `src/lib/ownerDashboardI18n.ts` — complete English/Hindi copy.
- `scripts/test-phase-17.5.mjs` — Phase 17.5 acceptance coverage.

## Verification

```bash
npm run lint
npm run build
npm run test:phase-17.5
npm run test:phase-17.4
npm run test:phase-17.3
npm run test:phase-16.10
```

Phase 17.5 acceptance: **33 passed, 0 failed**.
