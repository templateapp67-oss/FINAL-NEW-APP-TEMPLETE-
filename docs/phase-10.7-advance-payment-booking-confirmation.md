# Phase 10.7 — Advance Payment & Booking Confirmation (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffb70-new-tamplete-app`).
> Scope: Payment options (Pay at Salon / Advance / Full) → Payment gateway →
> Result → Booking confirmation → Receipt → WhatsApp.
> The 10.1–10.6 functionality is untouched; still exactly ONE booking
> architecture, ONE payment architecture, no duplicate tables.

## What landed

| File | Role |
|------|------|
| `src/lib/siteBookingPayment.ts` | The single payment engine: option math, masked PII, idempotency, gateway simulator, local persistence, tenant ownership, receipt view. |
| `src/lib/siteBookingPaymentI18n.ts` | EN/HI copy for payment / confirmation / receipt / WhatsApp — namespace follows the 10.2/10.3/10.5/10.6 convention. |
| `src/lib/siteBookingPaymentTheme.ts` | `paymentSurfaces(themeId, appearance)` — extends the 10.6 entry-flow surfaces with success / danger / warning / receipt-paper tokens, themed per theme + per light/dark. |
| `src/components/SiteBookingPaymentFlow.tsx` | The five-step payment wizard (Option → Gateway → Result → Confirm → Receipt) with five distinct themed visuals. |
| `src/components/SiteBookingFullFlow.tsx` | New public-site host orchestrator that swaps the 10.6 entry flow for the 10.7 payment flow on Summary → Confirm. |
| `src/components/SiteBookingHost.tsx` | Now mounts `SiteBookingFullFlow`; the existing `nexora:open-booking` / `nexora:close-booking` events still drive it. |
| `src/components/SiteBookingFlow.tsx` | Minimal extension: the Summary Confirm button now calls `onProceedToPayment` when the host provides it; otherwise keeps the 10.6 "next phase" toast. |
| `scripts/test-phase-10.7.mjs` | 66-test five-theme acceptance (engine + real React UI in jsdom). |

## The five payment steps

1. **Payment Option** — three cards: Pay at Salon (no gateway), Advance
   (default 25%, configurable via `bookingRules.advanceDepositPercentage`),
   and Full Payment. A booking summary card recap is shown above the
   three options; the due-now and due-at-salon numbers update live.
2. **Payment Gateway** — method picker (Card / UPI / Net Banking / Wallet)
   with the relevant fields per method. The visible fields are sandbox
   inputs; only the last 4 of a card, the local-part of a UPI id, and a
   masked bank label are ever persisted.
3. **Payment Result** — success / failure / cancellation / timeout with
   the human-readable reason, the booking id, and three next-step
   actions: Retry, Try a different method, Change payment option.
4. **Booking Confirmation** — success card with the booking id, the
   service / date / time / staff / amount / payment status, View receipt,
   Add to calendar, Send on WhatsApp, Book another appointment, and
   Back to website.
5. **Receipt** — themed "receipt paper" view with booking details,
   payment details, masked payment identifier + gateway reference, and
   Print / Download (text) / WhatsApp / Back actions.

## No-confirm-before-payment rule

- The gateway simulator runs in three modes (`all_success`, `mixed`,
  `force_failure`, `force_timeout`).
- A successful gateway attempt flips the record to `paymentStatus: 'paid'`
  AND `bookingStatus: 'confirmed'` together — never one without the
  other.
- Failed / cancelled / timed-out attempts flip the record to
  `paymentStatus: 'failed' | 'cancelled'` and `bookingStatus: 'failed' |
  'cancelled'`. The Booking Confirmation screen is never reached from
  these states.

## Idempotency + refresh / retry

- Every persisted record carries a stable `idempotencyKey` derived from
  `(businessId, themeId, bookingId, paymentOption, amountDue, serviceId,
  dateKey, startMinutes)`. Calling `createPayAtSalonRecord` /
  `createPendingBookingRecord` with the same key returns the existing
  record instead of creating a second one.
- The orchestrator auto-resumes a `confirmed` / `pay_at_salon` record
  for the same business + theme on mount, so a refresh of the page
  during confirmation does not lose the user's confirmed row.
- Retry uses `retryPayment(record, form)` which patches the same row
  instead of creating a second one. Verified by the test suite.

## Tenant ownership + data isolation

- Every record carries `businessId` and `themeId` (the five database-
  backed theme ids). `readPaymentRecordsForBusiness` returns only the
  rows for the active tenant; a different salon can never see or share
  another salon's bookings.
- The same booking id (e.g. `NX-10482`) can be reused across two
  different businesses without collision.
- No cross-theme leakage: the payment screens are themed by the
  renderer's `themeId`; no service/offer data bleeds across.

## Sensitive data handling

- **Card numbers** are persisted as `•••• <last4>` only.
- **UPI ids** are persisted as `<local-prefix>•••@<bank>` only.
- **Card CVV** is **never** stored anywhere.
- **Card expiry / card holder** are never persisted.
- The WhatsApp share message contains booking id, service, date, time,
  staff, amount, payment status — never the card / UPI / CVV.

## Reuse of existing systems (nothing re-created)

- **Salon clock**: `salonStatus.salonNow` + `useTickingNow` — status and
  the booking flow agree on "now".
- **Language**: the Phase 10.2 global `useSiteLocale()` store; the
  payment screens are fully EN ↔ हिन्दी without any new wiring.
- **Dark mode**: the Phase 10.2 global `useThemeAppearance(themeId)`
  store resolved through the existing five surface palettes; payment
  screens flip light ↔ dark instantly.
- **Salon status chip**: present in the entry flow only (10.5).
- **Pricing**: `serviceDisplayPrice` is mirrored inside the payment
  flow with the same offer-aware best-price logic, so an active offer
  lowers the "due now" / "due at salon" numbers.
- **Slot holds**: the entry flow's 15-minute holds are preserved across
  the swap into the payment flow; backing out of the gateway does not
  lose the slot.
- **Theme surfaces**: the Phase 10.6 `bookingSurfaces(themeId,
  appearance)` is the single source of truth; the new
  `paymentSurfaces(themeId, appearance)` only extends it with success /
  danger / warning / receipt-paper tokens.

## Theme visuals inside the payment flow

| Theme | Personality |
|-------|-------------|
| Barber | Sharp corners, engraving uppercase, flat gold primary, dark-native charcoal receipt paper. |
| Hair Studio | Editorial hairlines, serif headings, rose-gold primary, warm linen receipt. |
| Beauty/Spa | Soft pills + emerald sanctuary, herbal-mist receipt paper. |
| Family | Friendly rounded cards, sky-blue energy, bright-sky receipt. |
| Nail/Lash | Rounded-full, neon-pink gradient primary, blush receipt. |

The five designs are asserted pairwise-distinct by the test suite.

## Validation

```bash
npm run test:phase-10.7   # 66/66 across all five themes
npm run test:phase-10     # 10.1 → 10.7: 557 tests, all green
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # clean
```

- 10.1 (80/80), 10.2 (49/49), 10.3 (86/86), 10.4 (118/118),
  10.5 (56/56), 10.6 (102/102) still pass — the host keeps the existing
  `nexora:open-booking` / `nexora:close-booking` events and the
  `site-booking-flow` frame.
- `test:acceptance` remains 66/66. `test:acceptance-ui` keeps its one
  documented pre-existing "zero-typing auto-fill" environment flake
  (re-verified at the base state with this phase's changes stashed).
- Phase 9.1, 9.2, 9.3 still pass — no migration / RPC / theme-catalog
  changes.
