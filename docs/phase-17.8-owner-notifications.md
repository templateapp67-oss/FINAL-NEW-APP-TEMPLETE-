# Phase 17.8 — Owner Notifications

> Status: **COMPLETE** (2026-08-17). Scope stops at Phase 17.8. Phase 17.9,
> Phase 17.10 and final Phase 17 acceptance testing are not implemented.

## Existing notification architecture audit

The repository already defines one authoritative database notification system
in draft M10/M12:

- `notifications.business_id` and `notifications.user_id` tenant/user scope;
- `type`, `title`, `message`, `metadata`, `created_at`;
- persistent `is_read` state;
- `notification_settings` preferences;
- RLS requiring `user_id = auth.uid()` and membership in the same business;
- user-scoped notification update policy for read state.

Those database migrations remain unapplied drafts in the current runtime. The
active booking implementation is the existing browser-local mock payment
record adapter and `PAYMENT_EVENT` refresh bus. Phase 17.8 therefore does not
create another notification table, store, event bus, id or read-state system.

The Owner Notifications view projects only events that can be proven from the
current persisted booking/payment record source. When the existing database
notification tables become active, their rows can replace this adapter without
changing the UI contract.

## Ownership and privacy

Owner access remains:

```text
auth.users.id
  → organization_members.user_id (active owner)
  → organization_members.organization_id
  → salons.organization_id
  → salons.id
```

The session-resolved organization/salon keys are bound to the actor. Every
notification read passes through `readSalonBookings()`, which re-checks actor
permission and refuses any tenant outside that scope. A refusal on any tenant
candidate refuses the whole result.

`job_salon_members` is not used for ownership.

Notification list messages expose only event type, service names, payment
amount when applicable, booking reference and event timestamp. Customer name,
phone, email and notes do not appear in the list. Selecting a notification
opens the existing authorized booking details view, whose permissions are
unchanged.

## Real event projection

The current adapter derives these events from existing persisted fields:

- **New booking** — every real record, at `createdAt`;
- **Successful payment received** — `paymentStatus === 'paid'` and a positive
  persisted `amountDue`, at `updatedAt`;
- **Booking cancelled** — `bookingStatus === 'cancelled'`, at `updatedAt`;
- **Booking status changed** — a persisted confirmed/completed state whose
  `updatedAt` is later than `createdAt`;
- **Payment failed** — existing failed payment state, at `updatedAt`.

The adapter deliberately does not reconstruct intermediate transitions that
are absent from the current record. Events sort newest first with deterministic
real-field tie breaks. The render key is derived from the existing record id
and represented event type; it is not a persisted notification id.

Filtering or opening details never creates a notification. The list updates
only after the existing booking/payment event bus reports a real record change.

## Read/unread behavior

The authoritative draft database architecture supports `is_read`. The active
local booking record source does not. Phase 17.8 leaves `isRead` undefined and
does not fabricate read state or add a local read store. The UI renders
read/unread only when an existing source supplies it.

## UI and states

- Owner Notifications is the seventh existing Owner Dashboard section.
- Newest-first list with booking, payment and status filters.
- Localized event title, short real-data message, booking reference and time.
- Selecting an event opens the existing shared booking details/management row.
- Loading skeletons, empty, filtered-empty, error/retry and authorization
  refusal states.
- Mobile bottom sheet and larger-screen modal for related booking details.
- Responsive mobile/tablet/desktop controls.
- English/Hindi and light/dark through existing dashboard preferences.

## Files

- `src/lib/ownerNotifications.ts` — authorized event projection and ordering.
- `src/components/OwnerNotifications.tsx` — notification list, filters, states
  and related booking details.
- `src/components/OwnerDashboard.tsx` — session-scoped section mount.
- `src/lib/ownerDashboardI18n.ts` — English/Hindi copy.
- `scripts/test-phase-17.8.mjs` — Phase 17.8 acceptance coverage only.

## Verification

```bash
npm run lint
npm run build
npm run test:phase-17.8
npm run test:phase-17.7
npm run test:phase-16.10
```

Phase 17.8 acceptance: **33 passed, 0 failed**.
