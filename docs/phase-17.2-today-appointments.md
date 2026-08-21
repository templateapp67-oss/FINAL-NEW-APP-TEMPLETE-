# Phase 17.2 — Today's Appointments

> Status: **COMPLETE** (2026-08-17, session `arena/01a00df7-new-tamplete-app`).
> Scope: the **Today's Appointments** section of the Owner Dashboard, over the
> EXISTING booking/payment and salon-ownership architecture. Phase 17.1 and
> Phases 10–16 preserved. Upcoming appointments, customer management, revenue,
> calendar and notifications are **deliberately not implemented**.

## 1. Schema / architecture audit performed first

| Question | Finding |
|----------|---------|
| Where do bookings actually live? | The Phase 10.7 / 16.5 payment-record store (`src/lib/siteBookingPayment.ts`, `nexora_site_payment_records`, store version 1). Every website booking already persists there with tenant keys (`businessId` + `themeId`), the 16.5 service lines, the slot snapshot (`dateKey`, `startMinutes`, `endMinutes`), the money snapshot and the customer snapshot. **That store IS the booking list.** |
| Is there a `bookings` table to read? | Only as **unapplied drafts** (M08 `public.bookings`, `booking_status_history`, `balance_collections`; RLS in M12). Nothing is applied, so reading it would have been reading a table that does not exist. 17.2 therefore reads the same source 16.7 does. |
| How is a salon's booking row keyed? | By the existing engine rule `bookingBusinessId()` — service provenance → explicit `businessId` → the shared `public-site` fallback. |
| How is ownership resolved? | The existing chain via 17.1's `loadOwnerDashboardContext()` → `resolveOwnerSalonId()`: `auth.users → organization_members (role='owner', active) → organization_id → salons.organization_id → salons.id`. |
| `job_salon_members`? | Staff relationship. **Not used** — asserted by a test that strips comments before scanning. |
| Existing owner booking surface? | 16.7's `BookingManagementPanel` (all bookings + status machine) in the 18–25 dashboard. Left untouched; 17.2 is a **read-only today-scoped view** reusing the same data layer, not a second booking system. |

**No schema change was made**: no migration, table, column, RPC or RLS edit.
The only DB-facing change is that the owner-salon projection now also selects
`organization_id` — an **existing** `salons` column the ownership chain already
relies on.

## 2. What landed

| File | Role |
|------|------|
| `src/lib/ownerTodayAppointments.ts` | The data layer: status grouping over the EXISTING status values, the `TodayAppointment` projection (every field read from a persisted record), the salon-local "today" filter, chronological sort, `readTodayAppointments()` (permission re-checked + tenant-keyed per key, de-duplicated), status tally and display helpers. |
| `src/components/OwnerTodayAppointments.tsx` | The section UI: header with date + status counts, chronological list, per-row fields, distinct status chips, cancelled treatment, and the loading / empty / error / unauthorized states. |
| `src/lib/ownerDashboard.ts` | Additive: `organizationId` on the salon summary (existing column) and `ownerBookingTenant()` — the session-derived tenant candidates. |
| `src/lib/ownerDashboardI18n.ts` | Additive `today.*` EN/हिन्दी copy (≈47 keys). |
| `src/components/OwnerDashboard.tsx` | Mounts the section for the `today` nav item with the session-resolved actor + tenant keys. |
| `scripts/test-phase-17.2.mjs` | 49-test acceptance (`npm run test:phase-17.2`). |
| `scripts/test-phase-17.1.mjs` | Two assertions updated for the new reality (column list gained `organization_id`; `today` is no longer a placeholder). Still 56/56. |

## 3. Ownership & isolation

- The actor and the tenant keys are **both** derived from the session-resolved
  salon; the component takes no salon id a user could supply.
- `ownerBookingTenant()` returns candidates most-specific-first —
  `organization_id` → `salons.id` → the engine's own `public-site` fallback —
  because rows were stamped by the existing engine rule, not by this phase.
- Every candidate read goes through 16.7's `readSalonBookings()`, which
  **re-checks the permission** and does a tenant-keyed read. A refusal on any
  key refuses the whole read — never a partial or silent empty list.
- Rows are de-duplicated by record id, so overlapping candidates cannot
  double-list a booking.
- Verified: another salon's bookings never appear; unauthorized actors get a
  refusal card and no row data; the dashboard's denied state never reaches the
  section at all.

## 4. What the owner sees

Per row, all **read** from the record: customer name (the booking's own
snapshot, same permission model as the 16.7 owner panel) + mobile, service(s)
including 16.5 multi-service lines, start–end time, duration (derived only from
the slot span), booking status, payment status, total, advance paid, remaining,
optional staff, booking id.

- **Chronological** by start time; ties break on end time then booking id, so
  the order is stable across re-renders.
- **Status distinction** using the EXISTING values only:

| Group | Existing statuses | Treatment |
|-------|-------------------|-----------|
| Pending | `pending_payment` | amber chip |
| Confirmed | `confirmed`, `pay_at_salon` | green chip (`pay_at_salon` keeps its own "Pay at salon" label) |
| Completed | `completed` | blue chip |
| Cancelled | `cancelled`, `failed` | muted chip, row dimmed, time struck through, "slot is free" note |

- Advance/remaining render **only when non-zero** — no `₹0` noise, nothing
  invented. Missing customer name falls back to neutral copy, never a fake name.
- Counts are a tally of the rows actually loaded, hidden when the list is empty.

## 5. States

Loading (skeletons + `aria-busy`), empty ("No appointments today" — an empty
store never fabricates a row), error (+ working Retry), and an unauthorized
refusal card (`role="alert"`) reusing the existing 16.7 denial copy. The list
re-reads on the existing `PAYMENT_EVENT` and `SALON_CLOCK_EVENT` — no polling,
no second store.

## 6. Responsive · i18n · theming

Field grid reflows 1 → 2 → 4 columns (mobile → tablet → desktop); header and
money row wrap. EN/हिन्दी through the existing locale bus; light/dark through
the palette the dashboard shell passes down.

## 7. Verification

```bash
npm run lint                 # 0 errors
node verify-22-screens.js    # 25/25
npm run test:phase-17.2      # 49/49 passed
npm run test:phase-17.1      # 56/56 passed (still green)
npm run build                # green
```

Regressions: `10.6` 107/107 · `14.6` 26/26 · `15.6` 34/34 · `16.7` 39/39 ·
`16.9` 47/47 · `16.10` 68/68.

## 8. Explicitly out of scope (17.3+)

Upcoming appointments, customer management, revenue/payment calculations,
calendar logic, notifications, and any status mutation from this section
(16.7's panel remains the place where statuses change).
