# Phase 10.5 — Announcement Bar & Live Salon Status (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffaae-new-tamplete-app`).
> Scope: dated announcement bar + live open/closed status on every theme.
> Header, Language, Dark Mode, Footer and existing CTA / floating actions
> are untouched. No database or service/theme-data changes.

## What landed

| File | Role |
|------|------|
| `src/types.ts` | Optional `announcements[]` / `holidays[]` on `SalonData` (client-side only). Sample Rakhi festival, expired winter offer, inactive notice, Independence Day. |
| `src/lib/salonStatus.ts` | Weekly hours + holidays + local clock. `setSalonClockForTests` / `nexora:salon-clock` so the UI can tick in tests. |
| `src/lib/salonAnnouncements.ts` | Active + date window + theme filter. Priority `important > festival > seasonal > custom`. Fallback: live offer / first package / theme default. |
| `src/lib/siteStatusI18n.ts` | EN/HI status + kind labels. Phase 10.2 `siteI18n.ts` is not rewritten. |
| `src/components/SiteAnnouncementBar.tsx` | One structure, five visuals. Always keeps `data-site-section="announcement"`. |
| `src/components/SiteSalonStatus.tsx` | Compact chip for announcement / contact / booking. |
| Five theme renderers | Replace the inline strip; add a contact-hours chip. |
| `CustomerBookingPreview` | Compact chip next to the salon name. Footer and floating actions are unchanged. |

## Announcement bar

Supports festival offers, seasonal promotions, important notices and a short
custom message, with optional CTA (`booking` / `offers` / `contact`).

- `status: active \| inactive`
- Inclusive `startDate` / `endDate` (`YYYY-MM-DD`, local calendar — not UTC)
- Optional `themeId` plus per-theme `variants` for EN/HI copy
- Expired and inactive rows automatically stop displaying

When nothing dated is live the bar falls back to the existing first live offer
/ first package, then the theme `announceDefault` so Phase 10.3 still has a
section.

## Live salon status

| Kind | English | हिन्दी |
|------|---------|--------|
| `open` | Open Now | अभी खुला है |
| `closing_soon` | Closing Soon | जल्द बंद होगा |
| `opens_at` | Opens at [time] | [time] बजे खुलेगा |
| `closed` | Closed | बंद |
| `closed_today` | Closed Today | आज बंद है |
| `holiday` | Holiday · name | अवकाश · नाम |

Uses `openingHours` (24h `10:00` and 12h `09:00 AM` both parse), Sunday-closed
defaults when a day is missing, and `holidays[]`. Closing-soon window is
**30 minutes**. Status re-renders every 30s, on tab focus, and when tests
dispatch `nexora:salon-clock`.

Shown once in the announcement strip, once on the contact hours card, and once
in the existing booking-flow header. Not duplicated in the footer or FABs.

## Theme visuals

| Theme | Announcement bar |
|-------|------------------|
| Barber | Gold slab, black uppercase badge |
| Hair Studio | Paper/rose hairline |
| Beauty Spa | Emerald band, pill badge |
| Family | Teal band, sun badge |
| Nail & Lash | Pink band, uppercase edit type |

## Validation

```bash
npm run test:phase-10.5
npm run test:phase-10.1
npm run test:phase-10.2
npm run test:phase-10.3
npm run test:phase-10.4
npm run lint
```
