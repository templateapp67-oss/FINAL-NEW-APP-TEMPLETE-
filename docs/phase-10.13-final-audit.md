# Phase 10.13 — Global Website Final Audit (all 5 themes)

> Status: **COMPLETE — RE-AUDITED** (2026-08-14, session `arena/019ffdeb-new-tamplete-app`).
> Scope: Final audit of complete Phase 10 foundation — exact section flow, no missing/duplicate, Owner/Staff near end, Gallery before Videos, Videos exist, Booking/Call/WhatsApp/Directions, Open/Closed, HI/EN, Light/Dark, Legal, SEO, Loading/Skeleton, Error/Empty, Mobile/Tablet/Desktop, no overflow, no stale, no cross-theme, no broken links. No redesign, no DB change, no data deletion, no duplicate components.

## Exact Flow Verified (16 sections)

```
Announcement (announcement) → Header (header) → Hero (hero) → Trust/Stats (trust) → Featured Services (featured) → All Services (services) → Offers/Combos (offers) → Gallery (gallery) → Videos/Reels (videos) → About (about) → Owner (owner) → Meet Staff (team) → Reviews (reviews) → Location/Contact (location) → Final CTA (booking) → Footer (footer)
```

`collectSiteSectionOrder` must equal `SITE_SECTION_ORDER` exactly for every theme/mode/locale/appearance.

## Audit Checklist

| Check | How Verified | Result |
|-------|--------------|--------|
| No missing sections | `SITE_SECTION_ORDER` ⊆ realized | ✅ 16/16 per theme |
| No duplicate sections | `new Set(realized).size === realized.length` | ✅ |
| Correct order | `deepEqual(realized, SITE_SECTION_ORDER)` | ✅ |
| Owner + Staff near end | `about < owner < team < reviews < location < booking < footer` + `owner > gallery` | ✅ |
| Gallery before Videos | `galleryIdx < videosIdx` | ✅ |
| Videos exist all 5 | `[data-site-section="videos"]` + `site-social-feed` exists | ✅ |
| Booking CTA works | `final-booking-cta` → opens `site-booking-flow` → Back to Website closes | ✅ |
| Call/WhatsApp/Directions | FAB `site-fab-call`/`whatsapp` + mobile bar `site-mobile-bar-call/whatsapp/directions` hrefs `tel:`/`wa.me`/`maps.google.com` or `#section-location` | ✅ |
| Open/Closed status | `site-salon-status` or text Open/Closed/खुला | ✅ |
| Hindi/English | `siteText(theme,en) !== hi`, header exists, SEO locale flips | ✅ |
| Light/Dark | `data-appearance` light/dark, `site-header` persists | ✅ |
| Legal links | `site-legal-privacy/terms/cancel` → `site-legal-sheet` + Close | ✅ |
| SEO metadata | `site-seo` div + `data-title/canonical/og-title/og-image`, `link[rel=canonical]` in head, `meta[description]` + `og:title` | ✅ |
| Loading/Skeleton | Force `setWebsiteSectionFlagsForTests({sec:'loading'})` → `section-state-loading` + `site-skeleton-*` + spinner + localized copy | ✅ |
| Error/Empty | Force `error` → `section-state-error` + retry, `empty` → `section-state-empty` | ✅ |
| Mobile/Tablet/Desktop | `site-floating-actions[data-mode=mode]`, mobile bar only on mobile, FAB only on desktop/tablet, `site-mobile-action-bar-spacer` prevents cover | ✅ |
| No horizontal overflow | `.site-scroll` + `site-section min-w-0` + `max-width:100%` on images | ✅ |
| No stale theme data | `setActiveTheme(new)` clears `requestCache.clearByPrefix('theme:old:')`, `clearByPrefix` test | ✅ |
| No cross-theme content | Barber title not contain nail, Nail title contains nail/lash/brow, SEO distinct pairwise, `findDuplicateSeo` unique | ✅ |
| No broken links/buttons | `a[href]` length>0, no `undefined`/`null`, buttons exist | ✅ |

## Existing → Barber → Hair Studio → Beauty/Spa → Family → Nail/Lash

Legacy `hair` template via `TemplateRenderer` renders without crash.

For every theme tested: Desktop → Tablet → Mobile, English → Hindi, Light → Dark.

## Performance Audit Pass-Through

- Image optimization from 10.12 still present: `SiteImage` wrapper with `aspectRatio`, `loading="lazy"` / `eager` for hero, `srcSet` via `buildSrcSet`, skeleton while loading, `max-width:100%`, `contain: content`
- Video lazy: `site-social-thumb-skeleton` + thumbnail lazy, embed only on play (`site-social-embed` not present initially)
- Large lists: `paginateList` 12 initial + Load More prevents slow mobile
- Skeletons theme-aware, no CLS

## Validation

```bash
npx tsx scripts/test-phase-10.13.mjs
# 339 passed, 0 failed
# Exact flow 16 sections, no missing/duplicate, correct order, Owner/Staff near end, Gallery before Videos, Videos exist all 5, Booking CTA, Call/WhatsApp/Directions, Open/Closed, HI/EN, Light/Dark, Legal, SEO, Loading/Skeleton, Error/Empty, Mobile/Tablet/Desktop, No overflow, No stale, No cross-theme, No broken links

npm run test:phase-10
# 10.1 80 + 10.2 49 + 10.3 86 + 10.4 118 + 10.5 56 + 10.6 102 + 10.7 66 + 10.8 36 + 10.9 77 + 10.11 72 + 10.12 178 + 10.13 339 = 1259, all green
npx tsc --noEmit # 0 errors
```

## Root Fixes Applied During Final Re-Audit

- **Directions controls fixed in all five themes**: the Barber, Hair Studio and Beauty/Spa contact controls were inert buttons, while Family and Nail/Lash linked back to the same contact section. They now reuse the existing `salonMapsHref(data)` helper and open the configured salon address in Google Maps.
- **Nail/Lash contact booking fixed**: the contact-level “Book Online” control previously linked to its own section. It now dispatches the existing global booking event and opens the one shared booking flow.
- **Audit coverage hardened**: loading, skeleton, error, retry and empty states are now forced and asserted at runtime for every theme and viewport instead of passing placeholder assertions. Every rendered link is checked (not only the first five), all internal hash targets must exist, and contact/mobile Directions URLs must resolve to Maps.
- **No redesign / architecture change**: visual designs, database architecture and saved data remain untouched. The fixes only connect existing controls to existing global helpers and strengthen regression coverage.

STOP — complete Phase 10 foundation passes.
