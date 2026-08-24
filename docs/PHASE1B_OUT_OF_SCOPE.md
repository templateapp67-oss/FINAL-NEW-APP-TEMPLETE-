# Phase 1-B — do not implement

Phase 1-B is owner setup, template selection, public template rendering,
multi-tenant isolation, and session persistence.

**Do not implement in this phase:**

| Deferred item | Why it waits |
|---|---|
| Customer signup / login flow | Customer PWA / later auth phase |
| Customer booking flow | Later booking phase |
| Slot locking | Later availability phase |
| Razorpay checkout | Later payments phase |
| 25% payment | Later payments phase |
| Payment webhook | Later payments phase |
| Payment confirmation | Later payments phase |
| Refund behavior | Later payments phase |

Existing booking/payment code from earlier numbered phases is **not**
extended, wired as the Phase 1-B product, or treated as complete customer
commerce. New Phase 1-B files must stay presentation + owner-tenant only.

Verify: `npm run test:phase1b-scope`
