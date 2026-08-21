# Phase 10.6 — Book Appointment Entry Flow (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffae2-new-tamplete-app`).
> Scope: Service → Date → Time Slot → Customer Details → Booking Summary.
> Header, Language, Dark Mode, Footer, CTA, Salon Status and the completed
> 10.1–10.5 functionality are untouched. No payment, no final
> confirmation/receipt yet, and still exactly ONE booking architecture.

## What landed

| File | Role |
|------|------|
| `src/lib/siteBookingFlow.ts` | The single entry-flow engine: theme-isolated service list, booking-rules parsing, date window, slot generation, double-booking holds, customer validation. |
| `src/lib/siteBookingTheme.ts` | `bookingSurfaces(themeId, appearance)` — maps the existing Phase 10.2 light/dark surface palettes onto the small token set the wizard needs. |
| `src/lib/siteBookingI18n.ts` | EN/HI copy for the whole flow (Phase 10.3/10.5 convention: new copy in a new file, `siteI18n.ts` untouched). |
| `src/components/SiteBookingFlow.tsx` | The five-step wizard — one shared structure, five distinct themed visual designs. |
| `src/components/SiteBookingHost.tsx` | Host now passes the renderer's `themeId` so the flow inherits the exact theme it opened on. |
| Five theme renderers | One-line change: `<SiteBookingHost themeId="…" data={data} />`. |
| `scripts/test-phase-10.6.mjs` | 102-test five-theme acceptance (engine + real React UI in jsdom). |

`CustomerBookingPreview` (the old wizard demo flow with mock payment) is
retired from the public site path only; the wizard/dashboard preview still
uses it as before. The public site keeps the one existing architecture:
header / final / floating Book CTAs dispatch `nexora:open-booking` and the
host mounts the entry flow — no second booking system was created.

## The five steps

1. **Service** — list comes from the ACTIVE theme only: inactive/archived rows
   are dropped and any service carrying explicit theme provenance must match
   the active theme, so cross-theme services can never leak in. Category
   chips filter inside that same isolated list. Every row shows price
   (offer-aware via `serviceDisplayPrice`) and duration.
2. **Date** — 14-day strip from today. Selectable days respect the weekly
   `openingHours`, dated `holidays` (holiday name shown on the chip), the
   `maxAdvance` booking window, and today's closing time. Closed / holiday /
   outside-window days render disabled.
3. **Time** — slots generated on a ≥30-min grid from open to close, never
   starting before opening or running past closing. Today's slots inside the
   minimum-notice window are disabled (`past`); slots held/booked by someone
   else are disabled (`taken`). The first available slot is auto-selected and
   held for 15 minutes; only available/held slots are clickable.
4. **Details** — Name (required), Mobile (required, 10–13 digits),
   Email (optional, validated only when provided), Notes (optional).
5. **Summary** — full recap: service, category, duration, price, date, time,
   salon, customer details, with Change links back to each step. The Confirm
   button intentionally stops here with the note
   “Payment & final confirmation unlock in the next phase.” — no payment,
   no receipt, no fake success.

Selections (service / date / time / customer) live at the flow root, so they
survive moving back and forward between steps (verified per theme).

## Double-booking prevention

- Slot holds are stored in `localStorage` under `nexora_site_booking_holds`,
  keyed `themeId|serviceId|dateKey|startMinutes`, expiring after 15 minutes.
- Reserving rejects a foreign hold on the exact slot **or any overlapping
  slot** on the same theme/day; a visitor's own hold is refreshed idempotently
  and never blocks themselves. Expired holds are ignored.
- On leaving the time step the slot is re-verified; if it was lost the flow
  bounces back with a toast. `setBookingHoldsForTests()` lets suites inject
  foreign holds without a database.
- This is the entry-flow layer only. Server-authoritative booked slots and
  payments remain later-phase work (per the 90-point spec).

## Reuse of existing systems (nothing re-created)

- **Salon clock**: `salonStatus.salonNow` / `useTickingNow` — status chips and
  slot availability agree on “now” (same injected test clock).
- **Language**: the Phase 10.2 global `useSiteLocale()` store; EN/HI instantly.
- **Dark mode**: the Phase 10.2 global `useThemeAppearance()` store resolved
  through the existing five surface palettes.
- **Salon status chip**: `SiteSalonStatus placement="booking"` in the flow
  header, as in 10.5.
- **Pricing**: `serviceDisplayPrice` with theme offers from Phase 9.1.
- **Opening hours / holidays / booking rules**: existing `SalonData` fields
  (`openingHours`, `holidays`, `bookingRules`) — no schema changes, no DB work.

## Theme visuals inside the flow

| Theme | Personality |
|-------|-------------|
| Barber | Sharp corners, engraving uppercase, numbered service rows, gold-on-charcoal (dark native) / cream day shift |
| Hair Studio | Editorial hairlines, serif headings, rose-gold accents, rounded-md |
| Beauty Spa | Soft pills + rounded-3xl cards, emerald wash, serif headings |
| Family | Friendly rounded-xl cards, bold sky-blue energy |
| Nail & Lash | Rounded-full, neon-pink gradient primary, playful uppercase |

The five designs are asserted pairwise-distinct by the test suite.

## Validation

```bash
npm run test:phase-10.6   # 102/102 across all five themes
npm run test:phase-10     # 10.1 → 10.6: 491 tests, all green
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # clean
```

- 10.4 (118/118) and 10.5 (56/56) still pass — the host keeps the existing
  `nexora:open-booking` / `nexora:close-booking` events and the
  `site-booking-flow` frame with the “Back to Website” control.
- `test:acceptance` remains 66/66. `test:acceptance-ui` keeps its one
  documented pre-existing “zero-typing auto-fill” environment flake (re-verified
  at the base state with this phase’s changes stashed).
- Known stop: the summary’s Confirm button deliberately does not advance —
  confirmation + payment are the next phase.
