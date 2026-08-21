# Phase 17.3 — Upcoming Appointments

> Status: **COMPLETE** (2026-08-17, session `arena/01a00df7-new-tamplete-app`).
> Scope: the **Upcoming Appointments** section of the Owner Dashboard, over the
> EXISTING booking/payment and salon-ownership architecture. Phases 17.1–17.2
> and 10–16 preserved. Booking status management, customer management, revenue,
> calendar and notifications are **deliberately not implemented**.

## 1. Audit performed first

| Question | Finding |
|----------|---------|
| Where do future bookings live? | The same place today's do — the Phase 10.7/16.5 payment-record store, tenant-stamped with `businessId` + `themeId`, carrying `dateKey`, the slot span, the 16.5 service lines, the money snapshot and the customer snapshot. The draft `public.bookings` table (M08) is still **unapplied**. |
| Can 17.2's work be reused? | Yes — the `TodayAppointment` projection, `toTodayAppointment()`, the money/service helpers, the status grouping and `ownerBookingTenant()` all apply unchanged. 17.3 reuses them rather than forking a parallel model. |
| What defines an "inactive" booking? | The existing `isCancelledAppointment()` predicate (`cancelled`, `failed`) — the same rule 17.2 uses to mark a slot released. |
| Ownership | Unchanged: `auth.users → organization_members (role='owner') → salons.organization_id → salons.id`. `job_salon_members` is **not** used (test-enforced after stripping comments). |
| Row rendering | 17.2 had the row markup inline. Rather than copy it, it was **extracted** into a shared component so both sections render appointments identically. |

**No schema change**: no migration, table, column, RPC or RLS edit.

## 2. What landed

| File | Role |
|------|------|
| `src/lib/ownerUpcomingAppointments.ts` | The data layer: the future-window predicates, nearest-first sort, date grouping (`groupByDate`, `daysAhead`, `upcomingDayKind`), `readUpcomingAppointments()` (permission re-checked per key, tenant-keyed, de-duplicated), the tally and the group date formatter. Reuses 17.2's projection — no second row model. |
| `src/components/OwnerAppointmentRow.tsx` | **NEW shared row**, extracted verbatim from 17.2: status chip, field grid, money line, cancelled treatment. Parameterised only by `testIdPrefix` and an optional date line. |
| `src/components/OwnerUpcomingAppointments.tsx` | The section UI: header with total/day/status counts, day groups (real date + relative badge + per-day count), the shared rows, and the loading / empty / error / unauthorized states. |
| `src/components/OwnerTodayAppointments.tsx` | Refactored to render through the shared row. **Behaviour and test ids unchanged** (17.2 still 49/49). |
| `src/lib/ownerDashboardI18n.ts` | Additive `upcoming.*` EN/हिन्दी copy + `ownerDashboardCount()` for `{n}` interpolation. |
| `src/components/OwnerDashboard.tsx` | Mounts the section for the `upcoming` nav item with the session-resolved actor + tenant keys. |
| `scripts/test-phase-17.3.mjs` | 50-test acceptance (`npm run test:phase-17.3`). |

## 3. Window definition — and why

"Upcoming" is **strictly after** the salon's local calendar day. That matches
the section's own shipped description from 17.1 ("Appointments scheduled after
today") and guarantees a booking is never listed twice across the Today and
Upcoming sections. Past dates are excluded by the same comparison.

`dateKey` is a zero-padded `YYYY-MM-DD` produced by `localDateKey()`, so lexical
comparison **is** chronological comparison — and no timezone conversion can
shift the day (`toISOString()` is never used; it would shift in IST).

Cancelled and failed bookings are **excluded**: per the existing rules those
slots are released, and Upcoming is a forward-looking work list.

## 4. Ordering & grouping

- **Nearest first**: date ascending → start time → end time → booking id (the
  last two keep the order stable across re-renders).
- **Grouped by the row's own date**, nearest day first. Each group heading shows
  the real localized date, a relative badge (**Tomorrow** / **In N days** /
  **Later**) and the day's appointment count.
- Days with no bookings are **never emitted** — the dashboard doesn't render a
  day it invented.

## 5. What the owner sees

Per row (all read from the record): customer name + mobile, service(s) incl.
multi-service lines, appointment **date** (group heading + `data-date`), time,
duration (slot span only), booking status, payment status, total, advance paid,
remaining, optional staff, booking id. Advance/remaining render only when
non-zero; a missing name falls back to neutral copy. Statuses use the existing
values only — `pay_at_salon` keeps its own "Pay at salon" label and groups under
Confirmed.

## 6. States · responsive · i18n · theming

Loading (skeletons + `aria-busy`), empty, error (+ Retry), and an unauthorized
refusal card (`role="alert"`) reusing 16.7's denial copy. Re-reads on the
existing `PAYMENT_EVENT` / `SALON_CLOCK_EVENT`. Field grid reflows 1 → 2 → 4
columns; headers and group bars wrap. EN/हिन्दी and light/dark throughout.

## 7. Verification

```bash
npm run lint                 # 0 errors
node verify-22-screens.js    # 25/25
npm run test:phase-17.3      # 50/50 passed
npm run test:phase-17.2      # 49/49 (still green after the row extraction)
npm run test:phase-17.1      # 56/56
npm run build                # green
```

Regressions: `10.6` 107/107 · `14.6` 26/26 · `15.6` 34/34 · `16.7` 39/39 ·
`16.9` 47/47 · `16.10` 68/68.

Three earlier assertions were updated (not the product code) because
`upcoming` is legitimately no longer a placeholder and the row grid now lives
in the shared component. Their intent — navigation works, remaining sections
stay placeholders, the grid is responsive — is preserved.

## 8. Explicitly out of scope (17.4+)

Booking status management (16.7's panel remains the only place statuses
change), customer management, revenue calculations, calendar logic and
notifications.
