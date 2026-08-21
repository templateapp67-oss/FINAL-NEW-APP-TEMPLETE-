# Phase 16.3 — Date & Time Slot Selection (all 5 themes)

> Status: **COMPLETE** (2026-08-16, session `arena/01a006f4-new-tamplete-app`).
> Scope: the Date + Time step now shows only **genuinely available** slots,
> derived exclusively from existing data sources — real booking records,
> staff schedules/assignments, salon hours, holidays and booking rules.
> Phases 16.1–16.2 and 10–15 are preserved; still exactly ONE booking
> architecture. No customer-details changes, no payment, no advance, no
> confirmation, no notifications, no management.

## Schema/data audit performed first

- **Live DB reality** (docs/HANDOFF.md): booking tables (`bookings`,
  `booking_slot_holds`, `staff_schedules`, `staff_services`) exist only as
  UNAPPLIED draft migrations M05/M08. The app's booking persistence today is
  the Phase 10.7 localStorage payment store. Therefore 16.3 derives booked
  spans from that EXISTING store — no tables invented, no fake availability.
- **Existing staff relationships in `SalonData`** (already in `types.ts`):
  `TeamMember.assignedServiceIds` (staff ↔ service), `TeamMember.schedule`
  (`WeeklySchedule`, the same 7-day windows Staff Management edits), and
  `TeamMember.status` (`Available`/`Busy`/`On Leave`/`Inactive`). These map
  1:1 onto the draft `staff_services` + `staff_schedules` tables, so the
  later DB wiring phase swaps the source without changing the engine.

## What landed

| File | Role |
|------|------|
| `src/lib/siteBookingAvailability.ts` | **New** derivation layer: `bookedSpansForSalon` (spans from EXISTING 10.7 records — `confirmed` / `pay_at_salon` / `pending_payment` block; `failed`/`cancelled` never; tenant+theme keyed; `excludeBookingId` for resumed bookings), `staffWindowOn` + `staffWindowsForSelection` (existing team relationship; **null = no constraint** when the staff↔service mapping doesn't cover the selection — nothing invented), `bookingAvailabilityExtras` (bundles everything). |
| `src/lib/siteBookingFlow.ts` | Additive engine extension: optional `BookingSlotExtras` (`blockedSpans`, `staffWindows`, `businessId`) threaded through `bookingSlotsForDay`, `bookingSlotIsStillAvailable`, `reserveBookingSlot`. Holds now stamp `businessId`; a hold stamped with ANOTHER salon never blocks this salon (legacy un-stamped holds stay blocking — fail-closed). `reserveBookingSlot` refuses spans taken by real records even without a live hold. All params optional → every pre-16.3 call site byte-identical. |
| `src/lib/siteBookingI18n.ts` | Additive EN/HI: `time.loading`, `time.error`, `time.retry`, `time.bookedNote`. |
| `src/components/SiteBookingFlow.tsx` | Availability context recomputed on salon/service/date/records change (`PAYMENT_EVENT` listener); availability loading/error/retry states through the shared `'booking'` section seam; lost-slot behaviour hardened (clear + toast, never silently swap); booked-note under the grid; Continue gated on ready+selected. |
| `scripts/test-phase-16.3.mjs` | 36-test five-theme acceptance (engine + real React UI in jsdom). |

## Availability rules (in evaluation order)

1. **Day gate** (existing 10.6, re-verified): outside booking window,
   holidays, closed weekdays, today-after-close → day not selectable.
2. **Past/notice** (existing): today's slots inside `minNotice` → `past`.
3. **Booked spans** (NEW): any overlap with a live booking record of the
   SAME salon + theme → `taken`, un-holdable. Exact-boundary starts/ends
   stay available (span math is `start < end && end > start`).
4. **Staff windows** (NEW): when every selected service has at least one
   bookable assigned staff member, the whole sitting must fit inside one
   qualified member's working window that weekday; otherwise `taken`.
   Qualified = assigned to ALL selected services (split sittings / explicit
   staff choice are later phases). `On Leave`/`Inactive` staff never count.
   No mapping → salon hours alone (pre-16.3 behaviour, nothing invented).
5. **Holds** (existing + salon stamp): foreign overlapping hold → `taken`;
   own hold → `held`. Holds stamped by another salon are ignored here.

**Duration-aware fit** — the checked span is the FULL sitting: the single
service's duration or the 16.2 combined selection's summed duration, on the
existing ≥30-min grid (`bookingSlotIntervalMinutes`).

## Double-booking prevention (three layers)

1. Grid: booked/held-by-others spans render disabled (`taken`).
2. Hold time: `reserveBookingSlot` re-checks records + holds; refuses with
   `taken` and writes NO hold row.
3. Leave-step: Continue re-verifies via `bookingSlotIsStillAvailable` with
   the fresh extras; a lost slot bounces back with the existing toast.
   Additionally, if a record lands WHILE the grid is open (PAYMENT_EVENT),
   the grid recalculates immediately and a dead selection is cleared with a
   toast — never silently swapped to another time.

## Salon isolation

- Booked spans are read tenant-keyed (`readPaymentRecordsForBusiness`) —
  another salon's or another theme's records can never block or leak.
- New holds stamp `businessId`; holds from a DIFFERENT salon are ignored.
  Legacy holds without the stamp keep blocking the same theme (fail-closed,
  no false availability).

## Recalculation triggers

`slotExtras` (and therefore the grid) recompute when: salon (businessId),
theme, selected services, selected date, holds event, or the payment store
event fires. Verified in tests: record landing while open → slot flips to
`taken`; selection 30 min → gap fits; selection 90 min → same gap refuses.

## States, responsive, i18n

- **Loading**: skeleton slot grid + "Checking availability…", no auto-hold,
  Continue disabled. **Error**: message + Retry (recovers into the real
  grid). **Empty**: existing "no slots" notice; a day where the only
  qualified stylist is off shows all slots disabled and blocks Continue.
- States forceable via the EXISTING `setWebsiteSectionFlagsForTests`
  ('booking' key) — same seam as every other section, no second system.
- EN/HI for all new copy; light/dark via existing `bookingSurfaces`; grid
  keeps the 10.6 responsive 3/4/5-column layout (mobile/tablet/desktop).

## Explicitly NOT in 16.3 (later phases)

- Customer-details step changes (16.4), payment / 25% advance /
  confirmation / notifications / booking management.
- Server-authoritative availability (DB `booking_slot_holds` RPCs) — the
  drafts stay unapplied; the extras interface is the seam the server data
  will plug into.
- Explicit staff selection by the customer / split multi-staff sittings.

## Validation

```
test:phase-16.3   36/36
test:phase-16.1   55/55 · test:phase-16.2 55/55
test:phase-10.6  107/107 · test:phase-10.7 66/66
Phase 10 all green (10.1 80, 10.2 49, 10.3 86, 10.4 118, 10.5 56, 10.8 36,
                    10.9 77, 10.11 72, 10.12 178, 10.13 339)
Phase 11: 2398 · Phase 12: 582 · Phase 13: 220 · Phase 14: 180 · Phase 15: 244
9.1 9/9 · validate:migrations 27/27 ×2 + 21/21 · lint 0 errors · build green ·
verify-22-screens 25/25
```
