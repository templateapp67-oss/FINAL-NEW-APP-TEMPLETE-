# PHASE 16.10 — Final Booking Acceptance Testing

> Status: **COMPLETE (68 tests)** · `npm run test:phase-16.10`
> Scope: acceptance testing ONLY. No product source changed, no DB
> execution, no Phase 17 work.

Final acceptance gate for the ENTIRE Phase 16 booking & appointment
system — the 10.6 entry flow, the 10.7/16.5 payment engine and the
16.1–16.9 layers on top of them. The suite exercises the REAL production
modules and components (no mocks of product code): the same stores,
engines and DOM the customer and the owner use.

## What was added

**One acceptance suite** — `scripts/test-phase-16.10.mjs` (68 tests),
wired as `npm run test:phase-16.10`. Documentation updates in
`AGENTS.md` and `docs/HANDOFF.md`. Nothing else: no component, lib,
store, schema or behaviour change anywhere in `src/`.

## Acceptance criteria and results

| # | Criterion | Result |
|---|---|---|
| A | End-to-end journey on **all five themes** | ✅ Salon → Service → Date → Time → Details → Summary → Payment → Confirmation walked in the rendered DOM per theme (pay-at-salon ×5) + a full advance-payment gateway journey; every journey ends on a persisted record whose reference is shown on the confirmation surface |
| B | Theme + salon isolation | ✅ stamped services never cross themes; payment reads are business+theme keyed; foreign-salon and foreign-theme holds never block; drafts and confirmations scoped to (salon, theme, browser) |
| C | Real price / duration / advance math | ✅ `advance = round(base × pct/100)` with clamping + default 25%; full/pay-at-salon splits; multi-service totals sum real rows; Phase 13 offer-aware pricing discounts the booking; combined sitting = sorted ids + summed minutes; slot interval from duration+buffer on the 30-min grid |
| D | Availability | ✅ maxAdvance window, closed weekdays, exact-date holidays, min-notice on today, open/close bounds, booked spans → `taken`, foreign holds block / own hold `held`, staff windows only when the mapping covers the selection, dead-slot re-validation |
| E | Validation | ✅ name ≥ 2 chars, mobile 10–13 digits (formatting stripped), optional-but-valid email; UI gates Continue while invalid, surfaces `booking-err-*` with `aria-invalid` on blur, clears on fix, advances only when valid |
| F | Payment states + **no-confirm-before-payment** | ✅ pending during processing (no confirm surface), paid → confirmed, failure → failed + retry (never confirmation), confirmed cancellation → cancelled, timeout → failed (distinct outcome); `bookingConfirmationState` fails closed (`confirmed` booking status without paid money = pending); owner cancellation never invents a refund |
| G | Duplicate protection | ✅ double-click on Confirm hands off once; double-click on Pay = one record, one attempt; create calls are idempotent (key from the booking facts); retry reuses the SAME row — never a second booking |
| H | Customer / owner access boundaries | ✅ actor matrix (7 session shapes → exact permissions); salon reads refused for every denied actor; customer reads/cancels only own rows (identity from the browser, never the caller); owner transitions legal-only, tenant-keyed (foreign rows structurally `not-found`); completion settles the balance; denied UI panel, no row leakage |
| I | Call / WhatsApp protection (16.8) | ✅ locked with no href until a REAL paid advance on an unexpired booking; `pay_at_salon` deliberately does not unlock; expired/cancelled re-lock with their own reasons; unlock scoped to the exact salon+theme; href always the viewed salon's own target |
| J | Hygiene scans | ✅ no private keys / service-role credentials in `src/`; `.env.example` placeholders only; every `nexora_*` store key on the known allowlist (nothing invented); payment record fields = the draft schema mapping exactly, store version 1 |
| K | EN / HI, light / dark | ✅ both flows stamped and rendered in `hi` and `dark`; all three booking i18n tables have identical key sets, non-empty values, real translations |
| L | Responsive + Phase 10–15 integration | ✅ steppers + `sm:`/`md:` tiers on every theme; locale/appearance stores (10.2), archived/inactive services filtered (9/12), business-id resolution, five-theme constant, video catalog intact at 50 (15) |

## Validation

```bash
npm run test:phase-16.10   # 68/68 — final booking acceptance
npm run lint               # 0 errors
npm run build              # green
node verify-22-screens.js  # 25/25
```

Regression spot checks after adding the suite (no product source was
changed, so the full battery from 16.9 stands):

| Suite | Result |
|---|---|
| `test:phase-16.1` | 55/55 |
| `test:phase-16.9` | 47/47 |

## Notes for the next session

- Phase 16 (booking & appointments) is **accepted and closed**. The
  next planned work is Phase 17 — do not modify the booking layers
  without re-running `test:phase-16.10` plus the 16.1–16.9 suites.
- The suite is intentionally read-only over `src/`: if it ever fails
  after a future change, the change broke a Phase 16 invariant.
