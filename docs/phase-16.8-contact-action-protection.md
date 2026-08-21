# Phase 16.8 — Call / WhatsApp / Book Action Protection

> Status: **COMPLETE (74 tests)** · `npm run test:phase-16.8`
> Scope: Phase 16.8 only. No notifications, no final acceptance testing,
> nothing from 16.9/16.10.

## What the phase does

The salon's **Call**, **WhatsApp** and **Book Online** actions are protected
by the **existing** booking/payment architecture. A visitor can always book,
but the salon's direct contact channels open only after that visitor's
required **25% advance payment has actually succeeded**.

## Audit first — what already existed

| Concern | Existing thing that was reused |
| --- | --- |
| Booking + payment records | `src/lib/siteBookingPayment.ts` (Phase 10.7/16.5) |
| "Did payment really succeed?" | `bookingConfirmationState` (Phase 16.6) |
| Advance percentage | `paymentAdvancePercentage` (default 25, owner-configurable) |
| Customer identity | `bookingBrowserId()` (holds / 16.6 / 16.7 use the same one) |
| Tenant scoping | `bookingBusinessId(data)` + `readPaymentRecordsForBusiness` |
| Contact availability + hrefs | `canCall` / `canWhatsApp` / `salonTelHref` / `salonWhatsAppHref` |
| Booking entry point | the single `nexora:open-booking` event |
| Server rule | M08 `bookings_fixed_advance`, M09 `payments.verification_status`, M11 `verify_payment()` |

Nothing new was invented: no table, no column, no id, no amount, no fake
payment record, and no database was executed. M08/M09 remain unapplied drafts.

## Files

| File | Role |
| --- | --- |
| `src/lib/siteContactAccess.ts` | **New.** The single authorization point. Read-only over the existing record store. |
| `src/lib/siteContactAccessI18n.ts` | **New.** EN/HI copy for every lock/unlock message. |
| `src/components/SiteProtectedContactAction.tsx` | **New.** The one control every Call/WhatsApp surface renders. |
| `src/components/SiteContactLockNotice.tsx` | **New.** The pre-payment explanation + route into booking. |
| `scripts/test-phase-16.8.mjs` | **New.** 74 acceptance tests. |
| 5 heroes, `SiteFloatingActions`, `SiteMobileActionBar`, `SiteFooter`, `SiteSectionStates`, Family + NailLash renderers | Now render the protected control instead of their own anchors. |
| `SiteBookingPaymentFlow.tsx` | The receipt's WhatsApp share is authorized through the same gate. |

## The gate

`findUnlockingBooking(businessId, themeId)` returns a record only when **all**
of the following hold, every one read from the persisted row:

1. `customerId` equals this browser's identity (read **inside** the helper),
2. `businessId` **and** `themeId` match the salon page being viewed,
3. `paymentStatus === 'paid'` — a real gateway success, not a click,
4. the derived 16.6 state is `confirmed`/`completed` (fails closed),
5. `amountDue > 0` — money actually moved,
6. the appointment slot has not already finished.

`pay_at_salon` deliberately does **not** qualify: no advance was taken.

### States

| Reason | When | Contact target |
| --- | --- | --- |
| `unlocked` | verified advance payment | the salon's real `tel:` / `wa.me` |
| `payment-required` | no booking yet (or only pay-at-salon) | none |
| `payment-pending` | booking exists, advance not yet succeeded | none |
| `payment-failed` | last attempt failed | none |
| `cancelled` | booking cancelled | none |
| `expired` | the appointment already finished | none |
| `unavailable` | salon disabled the channel / no number | none |

Each reason has its own EN/HI message naming the salon's own percentage.

## Why this is not a frontend-only guard

The verdict is **data-derived, not UI state**. While locked, the contact
target does not exist anywhere in the rendered markup — the control is a
`<button>` with no `href`, no `tel:`, no `wa.me` and no digits, and the
footer/theme rows print a masked number (`displayContactNumber`). Flipping a
`data-locked` attribute, deleting `disabled` or injecting an `href` in
devtools yields a button with nothing to open, because the click handler
re-runs `authorizeContactOpen` against the store.

Forging the unlock therefore means forging a **paid booking record**, which
is precisely what the draft server set prevents once applied:

- `verify_payment()` is `SECURITY DEFINER`, rejects unverified signatures,
  and is granted to `service_role` only (revoked from `public`) — an
  anonymous visitor cannot call it;
- only a verified payment flips `bookings.booking_status` to `confirmed`;
- M08 pins the advance at 25% in the schema itself
  (`advance_paise = (service_price_paise + 3) / 4`);
- M12 keeps **no anonymous booking/payment write policy**.

`contactAccessAudit()` returns the verdict in the shape that server check
will return, so swapping the source changes where the answer comes from,
not the architecture or any caller.

## Privacy

Another customer's paid booking, another salon's booking and another theme's
booking are all structurally unable to unlock this page — identity and tenant
keys are applied inside the helper, and a denied audit contains no contact
data at all. The unlocked href is always built from the **viewed salon's own**
`phone` / `whatsappPhone`.

## i18n / appearance / responsiveness

EN + HI complete and in lockstep (asserted), `{percent}`/`{reference}`
substituted from real data, light/dark, five distinct theme surfaces for the
lock notice, and desktop/tablet/mobile verified on all five themes.

## Effect on earlier phases

Phases 10.4, 10.7, 10.9, 11.3, 11.6 and 11.8 asserted that Call/WhatsApp are
always exposed as `tel:`/`wa.me` for an unpaid visitor. Those assertions now
verify the protected semantics (locked pre-payment, real target post-payment);
no test was deleted and 10.7 gained a test for the authorized share path.

## Validation

```
test:phase-16.8   74/74
10.4 118 · 10.7 67 · 10.9 77 · 11.3 249 · 11.6 377 · 11.8 450
Phase 10 (all) · 11 (all) · 12 (all) · 13 (all) · 14 (all) · 15 (all)
16.1 55 · 16.2 55 · 16.3 36 · 16.5 24 · 16.6 54 · 16.7 38
validate:migrations 21/21 · lint 0 · build ok · verify-22-screens 25/25
```
