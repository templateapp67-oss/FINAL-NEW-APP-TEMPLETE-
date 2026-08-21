# Phase 16.7 — Booking Management (all 5 themes)

> Status: **COMPLETE** (2026-08-16, session `arena/01a006f4-new-tamplete-app`).
> Scope: booking management over the EXISTING booking/payment/authentication
> architecture — customer "My Bookings" (own rows only) and an owner panel
> (own salon only) with the existing status machine. Phases 16.1–16.5 and
> 10–15 preserved; still ONE booking architecture, no duplicate stores.
> Note: 16.4 was covered by the existing details step and 16.6 (booking
> confirmation) by the existing 10.7 confirmation/receipt — no separate
> 16.4/16.6 artifacts exist in this repo.

## Architecture audit performed first

- **Booking/payment source**: the Phase 10.7/16.5 record store
  (`siteBookingPayment.ts`) — every website booking already persists there
  with tenant keys (`businessId` + `themeId`), the customer identity
  (`customerId = bookingBrowserId()`), the 16.5 multi-service lines and the
  full money snapshot. That store IS the booking list; nothing new created.
- **Auth/ownership**: the EXISTING `useAuth` + `resolveOwnerSalonId` chain
  (auth.users → organization_members role='owner' → salons) — the exact
  pattern gallery management (14.6) and video management (15.6) use.
- **Database reality**: `bookings` / `booking_status_history` /
  `balance_collections` exist only as UNAPPLIED drafts (M08/M09); RLS
  (M12) is a draft. The management layer mirrors the draft spec's status
  set and transition discipline so the later server swap changes the data
  source, not the architecture.
- **Existing dashboard**: the Landing "bookings" tab showed an in-memory
  demo planner (screen-20 keyword). It is preserved untouched; the real
  management panel mounts above it.

## What landed

| File | Role |
|------|------|
| `src/lib/bookingManagement.ts` | The data layer: `resolveBookingActor` (session → permission, 14.6/15.6 semantics), `readMyBookings` (identity read INSIDE the helper — callers cannot request another customer's rows), `readSalonBookings` (permission re-checked + tenant-keyed read), `ownerUpdateBookingStatus` / `customerCancelBooking` (permission + row ownership + transition legality re-verified inside every mutation), display helpers (`bookingServiceNames`, `bookingMoney`, `sortBookingsForList`). |
| `src/lib/bookingManagementI18n.ts` | EN/HI copy: titles, states, denials, all status/payment/field labels. |
| `src/components/SiteMyBookings.tsx` | Customer surface inside the booking flow's salon step: own bookings at the active salon+theme, status chip, salon/services/date/time/money/payment-status, cancel (with confirm) for not-yet-completed rows. Renders NOTHING when the visitor never booked here. Themed via the existing `bookingSurfaces` (EN/HI + light/dark). |
| `src/components/BookingManagementPanel.tsx` | Owner surface in the dashboard bookings tab: full detail rows (services, date, time, customer name+mobile per the existing permission model, total/advance/remaining/payment status), status filter chips, actions per the machine, denial card for unauthorized actors, loading/error(+Retry)/empty states. |
| `src/screens/Landing.tsx` | Bookings tab mounts the panel (session-resolved actor via the existing chain; tenant = `bookingBusinessId(data)` — never typed in), plus a small inline toast. Demo planner untouched below. |
| `src/lib/siteBookingPayment.ts` | Additive: `'completed'` joins the `BookingStatus` union (matches the draft DB status set). |
| `scripts/test-phase-16.7.mjs` | 38-test acceptance (data layer + both UIs in jsdom). |

## Status machine (existing statuses, draft-spec aligned)

```
pending_payment  → confirmed | cancelled          (owner)
confirmed        → completed | cancelled          (owner)
pay_at_salon     → completed | cancelled          (owner)
completed / cancelled / failed → (terminal)
customer: may cancel own pending_payment / confirmed / pay_at_salon
```

- `completed` settles the remaining balance as collected at the salon
  (paymentStatus `paid`, remaining → 0) — mirroring the draft schema's
  `balance_collections` semantics; no amounts invented.
- Owner `cancelled` keeps paid amounts recorded (refunds are a real-gateway
  concern for a later phase); pending payments flip to `cancelled`.
- Illegal jumps (pending→completed, completed→confirmed, …) are refused by
  the data layer with `invalid-transition` — hiding buttons is cosmetic.

## Isolation guarantees (enforced in the data layer, verified in tests)

- **Customer**: `readMyBookings` reads `bookingBrowserId()` internally;
  `customerCancelBooking` refuses rows owned by another identity
  (`not-found` — existence is not even revealed). Foreign-theme rows never
  render in the block.
- **Owner**: every read/mutation re-checks `bookingActorCanManage` and does
  a tenant-keyed lookup, so another salon's rows are structurally
  unreachable (`not-found`), even for an authorized actor. Unauthorized
  actors get a refusal object — never data, never a silent empty list.
- The salon id is session-resolved (or the wizard draft's own tenant);
  there is no salon-id input anywhere in the panel.
- When M08/M12 are applied, the same rules run database-side (RLS +
  `booking_status_history`); this layer is the client mirror.

## States, responsive, i18n

- Loading (skeletons), error + Retry, empty, and cancelled/terminal rows
  (dimmed, action-free) on BOTH surfaces, driven by the shared 'booking'
  section seam — same one 16.3 uses, no second state system.
- Customer surface inherits the booking flow's theme surfaces (5 themes ×
  light/dark); owner panel uses the existing dashboard design language.
- Full EN/HI tables; every status/payment/field label localized.
- Responsive: cards collapse to one column on mobile (`sm:grid-cols-2`),
  filter chips scroll horizontally; inherits the flow's mobile-first frame.

## Explicitly NOT in 16.7 (later phases)

- Call/WhatsApp protection, notifications, final acceptance testing (16.8+).
- Real DB execution (M08/M09/M12 stay unapplied drafts).
- Refund logic (needs the real gateway phase).

## Validation

```
test:phase-16.7   38/38
16.1 55/55 · 16.2 55/55 · 16.3 36/36 · 16.5 24/24
10.6 107/107 · 10.7 66/66 · Phase 10 all green
Phase 11: 2398 · Phase 12: 582 · Phase 13: 220 · Phase 14: 180 ·
Phase 15: 244 · 9.1 9/9
validate:migrations 27/27 ×2 + 21/21 · lint 0 errors · build green ·
verify-22-screens 25/25
```
