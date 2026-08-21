# Phase 16.1 — Booking Foundation (all 5 themes)

> Status: **COMPLETE** (2026-08-16, session `arena/01a006f4-new-tamplete-app`).
> Scope: **Salon → Service → Date → Time → Customer Details → Booking Summary**
> — the foundation shape the later 16.x phases (server time slots, 25% advance
> payment, confirmation, booking management, WhatsApp/Call protection) build
> on WITHOUT rebuilding. Phases 10–15 are untouched in behaviour; still
> exactly ONE booking architecture.

## Audit performed before any change

- **Booking**: Phase 10.6 entry flow (`siteBookingFlow.ts` +
  `SiteBookingFlow.tsx`), Phase 10.7 payment engine + orchestrator
  (`siteBookingPayment.ts`, `SiteBookingPaymentFlow.tsx`,
  `SiteBookingFullFlow.tsx`, `SiteBookingHost.tsx`), legacy wizard demo
  (`CustomerBookingPreview` — dashboard preview only, untouched).
- **Service/theme**: `bookingServicesForTheme` active-catalog isolation,
  `serviceDisplayPrice` offer-aware pricing, `THEME_LABELS`.
- **Salon/auth**: `ownerSalon.ts` (auth.users → organization_members →
  salons), `nearbySalons.ts` (public catalogue read), `useAuth`.
- **Database**: live schema notes in `docs/HANDOFF.md` (`salons` +
  `organization_members`), draft M01–M27 (NOT applied — `customers`,
  `bookings`, `booking_slot_holds`, `booking_status_history` are drafts).
  Consequently Phase 16.1 makes **no database writes and no schema
  changes**: the current app persistence is localStorage/in-memory, and the
  draft booking tables stay drafts.

## What landed

| File | Role |
|------|------|
| `src/lib/siteBookingFlow.ts` | Additive: `salon` becomes the first `BookingStepId`; `bookingBusinessId(data)` (single tenant-resolution rule, shared with the 10.7 orchestrator); `bookingSalonContext(data, themeId)` — the ACTIVE salon's name/address/phone/service-availability from existing data only. |
| `src/lib/siteBookingDraft.ts` | **New** foundation store: ONE draft per (business, theme, browser) tracking Salon → … → Summary progress. Versioned localStorage payload, idempotent upsert, 24h staleness, tenant+theme keyed reads, `nexora:booking-draft` event, test injection — mirrors the 10.7 payment-store conventions. |
| `src/lib/siteBookingI18n.ts` | Additive EN/HI copy for the salon step (`step.salon`, `salon.*`). |
| `src/components/SiteBookingFlow.tsx` | New leading **Salon confirmation step** (themed card: salon name + live status chip, address, phone, website theme, bookable-service count, empty-state notice, resume notice); draft persistence effect; draft resume on mount; salon-aware navigation/gating. |
| `src/components/SiteBookingFullFlow.tsx` | Uses `bookingBusinessId` (removes the inline duplicate rule) and clears the draft when the existing 10.7 confirmation succeeds. |
| `scripts/test-phase-16.1.mjs` | 55-test five-theme acceptance (engine + real React UI in jsdom). |
| `scripts/test-phase-10.6.mjs`, `scripts/test-phase-10.7.mjs` | Updated for the 6-step structure (salon first); every original behaviour still asserted. 10.6 grows to 107 tests. |

## The six steps

1. **Salon** — confirms the salon whose website is open. **Never a picker**:
   the context comes from `bookingSalonContext` (existing `salonName`,
   `address.fullAddress`, `phone`, active-theme service count) — no salon
   ids, user ids or salon lists are invented or fetched. Reuses the live
   `SiteSalonStatus` chip and the existing brand-name styling. If the active
   theme has no bookable services, the step shows the empty-state notice and
   Continue stays disabled.
2. **Service** — unchanged Phase 10.6 behaviour (theme-isolated list,
   category chips, offer-aware prices, durations).
3. **Date** — unchanged (opening hours, holidays, booking window).
4. **Time** — unchanged (30-min grid, min-notice, holds, double-booking).
5. **Details** — unchanged validation (name, 10–13-digit mobile, optional
   email/notes).
6. **Summary** — unchanged recap + the existing 10.7 payment hand-off.

A Phase 12.3 service prefill ("Book Now" on a service card inside the same
salon website) opens directly on the Service step — the salon confirmation is
implicit — but Back still reaches the salon step: one flow, one architecture.

## The booking draft (the "foundation" for 16.2+)

- `saveBookingDraft` upserts ONE row per `(businessId, themeId,
  bookingBrowserId())` — a refresh or re-render can never create a second
  draft. Sitting on the salon step writes nothing (open/close is
  side-effect free).
- The row snapshots the selection (`serviceId/name/price/duration`,
  `dateKey`, `startMinutes/endMinutes`, customer details) and a status:
  `in_progress` → `summary_ready`.
- Reopening the flow resumes the visitor's own draft (service pre-selected,
  details pre-filled, localized resume notice). A different browser identity
  or another salon/theme can never read it — all reads are keyed.
- When the EXISTING Phase 10.7 confirmation succeeds (paid or pay-at-salon),
  the orchestrator clears the draft, so completed bookings never resume.
- Later phases plug in here without rebuilding: 16.2+ re-verifies
  `dateKey`/`startMinutes` against authoritative slots, the advance-payment
  phase converts a `summary_ready` draft into the existing `PaymentRecord`
  (same tenant + theme keys), the confirmation phase clears it.

## Isolation & no-fake-data rules

- `businessId` resolution: service-row provenance → explicit payload id →
  the shared `public-site` fallback — the SAME rule the 10.7 payment records
  already used, now in one exported function used by both layers.
- Draft reads/writes are always `(businessId, themeId)` keyed; foreign
  tenants, foreign themes and foreign browser identities can never leak in
  (asserted per theme in the suite).
- No salon IDs, user IDs, tables, columns or fake booking rows. No DB
  migrations. The `NX-…` booking id remains generated by the existing 10.7
  engine only at confirmation time.

## States, responsive, i18n

- Loading: flow inherits the existing skeleton/lazy systems; drafts load
  synchronously (localStorage) with a broken-storage fallback (flow still
  works, drafts become best-effort).
- Empty: no bookable services (salon step notice + disabled Continue), no
  slots on a day (existing 10.6 notice), missing address (localized
  "Address not published yet" — never invented).
- Error: corrupted/foreign-version draft store degrades to empty; disabled
  localStorage never crashes the flow.
- Desktop/tablet/mobile: same single-column mobile-first grid + sticky
  action bar as 10.6; stepper scrolls horizontally on narrow screens with
  the 6th chip.
- EN/HI: new `salon.*` keys in both languages; Hindi asserted per theme.
  Light/dark: salon step styled entirely from the existing
  `bookingSurfaces` tokens; barber still defaults dark.

## Explicitly NOT in 16.1 (later phases)

- Real/server time-slot management (holds stay the 10.6 local system).
- 25% advance logic, payment or gateway changes (10.7 continues as-is).
- Notifications, booking management surfaces, WhatsApp/Call protection.
- Any database execution (M01–M27 remain unapplied drafts).

## Validation

```
test:phase-16.1   55/55
test:phase-10.6  107/107   (updated for 6 steps; all original behaviour kept)
test:phase-10.7   66/66    (walk updated for the salon step)
Phase 10: 10.1 80, 10.2 49, 10.3 86, 10.4 118, 10.5 56, 10.8 36, 10.9 77,
          10.11 72, 10.12 178, 10.13 339
Phase 11: 11.1–11.8 all green (2398)
Phase 12: 12.1 84, 12.2 117, 12.3 74, 12.4 105, 12.5 83, 12.6 59, 12.7 60
Phase 13: 13.1–13.6 all green (220)
Phase 14: 14.1 55, 14.3 37, 14.4 22, 14.5 22, 14.6 26, 14.7 18
Phase 15: 15.1–15.8 + 15.10 all green (244)
9.1 9/9 · validate:migrations 27/27 ×2 + 21/21 · lint 0 errors ·
build green · verify-22-screens 25/25
```
