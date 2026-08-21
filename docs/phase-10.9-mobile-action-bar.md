# Phase 10.9 — Mobile Contact & Booking Action Bar (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffbd4-new-tamplete-app`).
> Scope: mobile-only sticky bottom bar **Call Now | WhatsApp | Directions | Book**.
> Header, Language/Dark Mode, Booking Flow, Payment, Reviews/Social, Footer untouched.
> No DB changes, no invented phone/WhatsApp/location data.

## What landed

| File | Role |
|------|------|
| `src/lib/siteMobileBarI18n.ts` | EN/हिन्दी short labels for Call Now, WhatsApp, Directions, Book (theme overrides kept minimal). |
| `src/components/SiteMobileActionBar.tsx` | New mobile-first sticky bar. Hidden on desktop/tablet, hidden while booking open, respects safe-area, large touch targets, icons+labels, theme-specific skins. |
| `src/components/SiteFloatingActions.tsx` | Refactored: desktop FABs (Call, WhatsApp, Back to Top) remain; mobile now delegates to action bar + only Back-to-Top chip to avoid duplicate bars. |
| `src/index.css` | Added `.site-mobile-action-bar` + `.site-mobile-action-bar-spacer` with `env(safe-area-inset-*)` handling; legacy spacer height synced to new bar. |
| Five theme renderers | Mount `SiteMobileActionBar` + both spacers on mobile; existing `SiteFloatingActions` + `SiteBookingHost` remain. |
| `src/lib/siteChromeI18n.ts` | Added `chrome.callNow`, `chrome.directions`, `chrome.getDirections`, `chrome.bookNow` for forward compatibility. |
| `scripts/test-phase-10.9.mjs` | 77 assertions across all 5 themes: mobile bar exists, 4 actions, uses existing data, Book opens existing flow, safe-area, touch-friendly, scroll accessibility, EN/HI, Light/Dark, small/large screens, distinct visuals. |
| `scripts/test-phase-10.4.mjs` | Updated to accept both legacy `site-mobile-dock` and new `site-mobile-action-bar` (backward compat). |

## Bottom Sticky Bar

**Actions:**
- **Call Now** → `tel:` from `data.phone` via `salonTelHref` (existing helper), respects `contactOptions.callNow`
- **WhatsApp** → `https://wa.me/` from `whatsappPhone || phone` via `salonWhatsAppHref`, respects `whatsapp`
- **Directions** → `https://maps.google.com/?q=` from saved `address.fullAddress` via `salonMapsHref` (existing saved location); falls back to `#section-location`
- **Book** → `openSiteBooking()` dispatches `nexora:open-booking` mounting existing `CustomerBookingPreview` flow (no duplicate logic)

**Behavior:**
- `mode === 'mobile'` only; desktop/tablet returns null
- Listens to `SITE_BOOKING_EVENT`/`CLOSE` to hide while booking open (does not cover booking controls)
- Positioned `absolute inset-x-0 bottom-0 z-50` inside relative frame, so stays visible while `.site-scroll` scrolls
- `paddingBottom: max(0.65rem, env(safe-area-inset-bottom))` + left/right insets
- Spacer `.site-mobile-action-bar-spacer` (`calc(6.25rem + env(safe-area-inset-bottom))`) inside scroll content prevents footer/CTA being covered
- Buttons: `site-touch` (44px min), `min-h-[64px]`, icon (`18px`) stacked above label, `py-3`
- Back-to-top chip remains above bar via `SiteFloatingActions` (z-40)

## Theme-specific styling

| Theme | Bar | Ghost buttons | Book |
|-------|-----|---------------|------|
| Barber | `#0c0c0c` / cream in light, `2px solid gold` top border, sharp corners, `font-black uppercase` | `#141414` / `#f5efe0`, gold / ink text | Gold fill `#141414` text |
| Hair Studio | Paper `rgba(250,248,245,0.96)` / dark `rgba(25,24,23,0.96)`, hairline `line`, `rounded-full` buttons, `uppercase tracking-[0.16em]` | `roseSoft` / `rgba(216,160,168,0.14)` | Rose `t.rose` white text |
| Beauty Spa | Cream / dark forest `rgba(19,48,40,0.96)`, `rounded-2xl` buttons | `emeraldSoft` / `rgba(255,255,255,0.08)` | Emerald |
| Family | Navy `t.navy`, `rounded-xl`, sun accents, shadow | `rgba(255,255,255,0.10)` white text | Teal |
| Nail & Lash | Ink `rgba(33,27,36,0.96)`, `rounded-full`, neon border | `rgba(255,255,255,0.08)` `pinkGlow` | Pink gradient `linear-gradient(120deg, pink → pinkDeep)` |

Light/Dark via `useThemeAppearance(themeId)` → `surfacesOf(SURFACES, appearance)`.

## i18n

- Uses `useSiteLocale()` + `mobileBarText(themeId, locale)`
- EN: Call / WhatsApp / Directions / Book (Call Now short = Call for tight fit, full = Call Now for a11y label)
- HI: कॉल करें / व्हाट्सऐप / रास्ता (रास्ता देखें override) / बुक
- Repaints on `SITE_LOCALE_EVENT` without page reload

## Validation

```bash
npx tsx scripts/test-phase-10.9.mjs   # 77/77 across 5 themes
npx tsx scripts/test-phase-10.4.mjs   # 118/118 (backward compat)
npx tsx scripts/test-phase-10.1.mjs   # 80/80
npx tsx scripts/test-phase-10.2.mjs   # 49/49
npx tsx scripts/test-phase-10.3.mjs   # 86/86
npx tsx scripts/test-phase-10.5.mjs   # 56/56
npx tsx scripts/test-phase-10.6.mjs   # 102/102
npx tsx scripts/test-phase-10.7.mjs   # 66/66
npx tsx scripts/test-phase-10.8.mjs   # 36/36
npx tsc --noEmit                     # 0 errors
```

Mobile tested: scroll → Call (tel) → WhatsApp (wa.me) → Directions (maps.google.com?q=) → Book (opens existing flow → Back to Website closes).

Also verified: EN/HI toggle, Light/Dark toggle, small (375px) / large (390/428px) mobile frame class `site-mobile-action-bar grid-cols-4` remains, no horizontal overflow, spacer prevents covering.
