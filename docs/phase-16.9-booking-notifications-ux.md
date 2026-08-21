# Phase 16.9 — Booking Notifications & UX

> Status: **COMPLETE (47 tests)** · `npm run test:phase-16.9`
> Scope: Phase 16.9 only. No final acceptance testing (16.10), no DB
> execution, no invented tables/columns/ids, no fake success states.

## What the phase does

UX hardening over the **existing** booking journey
(Salon → Service → Date → Time → Customer → Payment → Confirmation) on
the existing 10.6/16.x entry flow + 10.7/16.5 payment engine + 16.6/16.7
status layers. The notice presenter wires the **existing `onShowToast`
seam** that every booking surface already called — before 16.9 the
public-site host dropped those messages on the floor.

## Audit first — what already existed and was reused

| Concern | Existing thing reused |
| --- | --- |
| Notification architecture | the `onShowToast` prop seam (10.6/10.7/16.6/16.7 already emit through it) |
| Feedback wording | existing i18n tables (`siteBookingI18n`, `siteBookingPaymentI18n`, `bookingConfirmationI18n`, `bookingManagementI18n`) |
| State truth | persisted records + `bookingConfirmationState` (16.6) — never UI state |
| Duplicate guards | 16.5 `submitLockRef` / idempotency keys / 16.6 duplicate detection |
| Data preservation | 16.1 salon+theme-scoped draft + 16.5 retry-reuses-same-row |
| Cancellation rules | 16.7 `customerCancelBooking` / `ownerUpdateBookingStatus` machine |
| Theming | existing `bookingSurfaces` / `paymentSurfaces` (light/dark, five themes) |
| Test seams | `setPaymentScenarioForTests`, `setPaymentStoreForTests`, section flags |

Nothing new was invented: no table, column, id, store key, event bus or
fake payment record.

## The notice system

- `src/lib/siteBookingNotices.ts` — types only: `BookingNotice` =
  `{ kind: 'success' | 'warning' | 'error' | 'info', message }`,
  `normalizeNotice()` (legacy strings → `info`), auto-dismiss duration
  with a test override. No listeners, no store, no bus.
- `src/components/SiteBookingNotices.tsx` — presenter mounted once in
  `SiteBookingFullFlow` (the host that was previously dropping the seam):
  - `aria-live="polite"` stack + `role="status"` per notice;
  - kind → colour via the EXISTING payment surface tokens
    (success/warning/danger/accent soft washes), so Light/Dark and all
    five themes work with no new palette;
  - auto-dismiss (paused on hover/focus), labelled dismiss button
    (`notice.dismiss`, EN/HI), capped stack (4, oldest dropped first);
  - soft entrance animation, disabled under `prefers-reduced-motion`;
    visible keyboard focus on the dismiss control (index.css);
  - mobile-first: full-width strip above the action bar on phones,
    right-aligned column from `sm:` up.
- `src/lib/siteBookingNoticesI18n.ts` — EN/HI copy for the presenter
  chrome + every feedback message (all placeholders substituted from
  real data).

Every booking surface passes the typed payload through the SAME
`onShowToast` prop; pre-16.9 string callers (and test harnesses) keep
working — strings normalize to `info`.

## Feedback coverage (all derived from persisted records)

| Event | Notice | Where |
| --- | --- | --- |
| Booking success (pay-at-salon) | success, with the real `NX-#####` reference | option step → confirmation |
| Payment success | success — only when the record is `paid` + `confirmed` | gateway attempt resolves |
| Payment pending | info — attempt start, retry, resumed pending row | gateway |
| Payment failed | error — with the human-readable decline reason | gateway failure |
| Payment timed out | error — record lands in `failed` (distinct from cancel) | inactivity window |
| Booking cancelled (customer / owner) | warning / info | my-bookings / owner panel |
| Payment cancelled | warning — "no money was charged" | gateway cancel |
| Booking error (slot lost, limits, duplicates…) | error / info | entry flow + payment flow |

"Confirmed" claims are made from the persisted row the engine patched;
a gateway success without a `paid` row fails closed (error notice, no
confirmation screen). No customer name, mobile, salon contact or payment
identifier ever appears in a notice (test-enforced).

## Duplicate-submission protection

- Entry flow: a synchronous navigation lock stops double-click/tap from
  skipping steps (Continue / Back / stepper jumps).
- Orchestrator: the summary hand-off is ref-guarded.
- Option step: new ref guard so a double-clicked Pay-at-Salon Continue
  creates exactly one booking row.
- Gateway + retry: the existing 16.5 `submitLockRef` unchanged; pending
  notice emitted once per attempt (guarded by the same lock).

## Data preservation

- The 16.1 draft still clears ONLY on confirmation, so a failed payment
  keeps the full selection; back-from-payment and re-open both restore
  it (16.1 resume notice + restored summary).
- Retry after failure re-uses the same row/idempotency key (existing
  16.5/16.6 behaviour re-verified).
- A payment timeout now lands the record in `failed` (engine `cancel`
  gained an optional `outcome`), so "payment failed" and "booking
  cancelled" are distinct, retryable states.

## Loading states — only the processing action is disabled

- Gateway processing: method buttons + back disabled, Pay replaced by
  Cancel (existing), inline busy box kept.
- Retry from the result screen: the result card now **stays visible**
  (previously `retryGateway` cleared `gatewayResult` and blanked the
  screen); the retry button shows a spinner + `aria-busy`, and only the
  other actions disable.

## Empty / error states

- Services (16.2) and slots (16.3) unchanged and re-verified.
- **Dates are new**: `booking-loading-dates` / `booking-error-dates`
  (+Retry) / `booking-empty-dates` ("No open dates…") on the date
  step's OWN seam (`setBookingDatesStateForTests` /
  `bookingDatesStatus` in `siteBookingFlow.ts`) — deliberately separate
  from the 16.3 `booking` section flag so forcing slot availability
  never hides the date grid.
- Bookings: customer loading/error (16.7) + owner empty/loading/error
  re-verified.
- Booking error: the localized `payment-service-missing` card replaces
  the hardcoded English "Service not found" fallback in the orchestrator
  (EN/HI, themed, back-to-summary recovery).

## Confirmation before destructive cancellation

- Gateway cancel: two-step — Cancel payment → inline "Cancel this
  payment? …" with Keep waiting / Yes-cancel (localized, themed).
- Customer booking cancel: inline themed confirmation replaces the
  blocking native `window.confirm`; the row is untouched until the
  explicit confirm button runs; Keep returns to the list.
- Owner booking cancel: same inline confirmation in the dashboard panel.
- Non-destructive owner actions (Confirm / Complete) stay one click.

## Validation + accessibility

- Details step: errors now appear **on blur** per field (name/mobile/
  email) with `aria-invalid`, `aria-describedby` wiring and the existing
  localized messages — the Continue button stays gated exactly as in
  10.6 (a disabled action never hides the reason it is disabled).
- Steppers mark the current step with `aria-current="step"`.
- Notice dismiss buttons carry localized `aria-label`s and 44px touch
  targets (`site-touch`).

## Privacy

No notice contains customer, salon or payment identifiers (asserted
against real journey data). The existing record store key is untouched;
no new storage key or event was introduced. Static scans keep the
no-secrets hygiene (no service-role / gateway keys in the new code).

## Effect on earlier phases

Four existing test walks were updated for the new confirm-before-cancel
interaction (10.7, 16.5, 16.6, 16.7) and the engine timeout assertion
(10.7) now expects the explicit `timeout` outcome → `failed`. 16.7
gained a keep-booking test (38 → 39). Harnesses in 10.6/16.1/16.2/16.3
normalize typed notices to their message text; no test was deleted.

## Files

| File | Role |
| --- | --- |
| `src/lib/siteBookingNotices.ts` | **New.** Typed notice model + normalization + test hooks. |
| `src/lib/siteBookingNoticesI18n.ts` | **New.** EN/HI notice copy. |
| `src/components/SiteBookingNotices.tsx` | **New.** The one notice presenter (wires the existing seam). |
| `src/components/SiteBookingFullFlow.tsx` | Hosts the presenter, passes the sink, confirm hand-off lock, localized service-missing card. |
| `src/components/SiteBookingFlow.tsx` | Typed notices (slot-lost error, limit info), navigation lock, date loading/error/empty states, blur validation + aria wiring. |
| `src/components/SiteBookingPaymentFlow.tsx` | Outcome notices, pending notices, option-step lock, cancel confirmation, retry-in-place (no blank screen), disable-only-processing states. |
| `src/components/SiteMyBookings.tsx` | Inline cancel confirmation + typed notices. |
| `src/components/BookingManagementPanel.tsx` | Owner cancel confirmation + cancelled toast. |
| `src/lib/siteBookingPayment.ts` | `GatewayAttempt.cancel(reason, outcome)` (timeout vs cancellation) + testable inactivity window. |
| `src/lib/siteBookingFlow.ts` | Date-state test seam (`bookingDatesStatus`). |
| `src/lib/siteBookingI18n.ts` / `siteBookingPaymentI18n.ts` / `bookingManagementI18n.ts` | New EN/HI keys (date states, cancel confirms, keep/confirm copy). |
| `src/index.css` | Notice animation + focus + reduced-motion. |
| `scripts/test-phase-16.9.mjs` | **New.** 47 acceptance tests. |
| `scripts/test-phase-10.7/16.5/16.6/16.7.mjs` | Walk updates for confirm-before-cancel + timeout semantics. |

## Validation

```text
test:phase-16.9   47/47
16.1 55 · 16.2 55 · 16.3 36 · 16.5 24 · 16.6 54 · 16.7 39 · 16.8 74
10.6 107 · 10.7 67 · 10.4 118 · 10.9 77 · 12.3 74 · 11.3 249 · 11.6 377 · 11.8 450
lint 0 · build ok · verify-22-screens 25/25
```
