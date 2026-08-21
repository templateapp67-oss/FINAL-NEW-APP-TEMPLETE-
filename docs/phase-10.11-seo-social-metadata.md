# Phase 10.11 — Dynamic SEO & Social Metadata (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffbd4-new-tamplete-app`).
> Scope: per-theme, per-locale, per-salon SEO using REAL salon data only. Header, Language/Dark, Booking/Payment, Reviews/Social, Footer, Legal untouched. No DB changes.

## What landed

| File | Role |
|------|------|
| `src/lib/siteSeo.ts` | Single SEO engine: `generateSeoMeta`, `buildCanonicalUrl`, `buildOgImage`, `buildSitemapEntry`, `verifyHeadingHierarchy`, `findDuplicateSeo`. No fake data. |
| `src/components/SiteSeo.tsx` | Mounts in all 5 renderers, writes title/meta/OG/canonical/robots to `document.head`, renders hidden `[data-testid="site-seo"]` for test validation. |
| 5 theme renderers | Import + mount `<SiteSeo>` right after announcement bar, so SEO repaints on locale/appearance/mode changes. |
| `scripts/test-phase-10.11.mjs` | 72 assertions across Barber → Hair Studio → Beauty/Spa → Family → Nail/Lash, EN/HI, Light/Dark, Desktop/Mobile, metadata + social preview. |

## Dynamic SEO — per theme

Each theme has its own vertical:

- **Barber** → Men's Haircut / Beard / Grooming
- **Hair Studio** → Hair Color / Balayage / Styling
- **Beauty/Spa** → Facial / Spa / Skincare
- **Family** → Unisex / Kids / Family Salon
- **Nail/Lash** → Nails / Lash / Brow

`THEME_SEO` holds EN + HI base keywords, title suffix, description focus per theme (never shared).

**Title** (EN): `{salonName} | {vertical} in {city} | Book Online`  
**Title** (HI): `{salonName} | {city} में {verticalHI} | ऑनलाइन बुक करें`  
Uses real `salonName` via `salonDisplayName(data, themeId)` + real `city` from `address.city`. Trims to ~75 chars, never uses fake "Your Salon".

**Description** (EN/HI): merges real `about`/`tagline` snippet (80 chars) + theme focus + city. 40–160 chars, distinct per theme. Example barber includes "fade|beard|groom" check in tests.

**Keywords**: `base theme keywords` + real service names (`data.services[0..5].name`) + real `salonName` + `city`, deduplicated, joined comma. No fake inventory. Theme-specific, pairwise distinct.

## Language SEO

- `useSiteLocale()` → `generateSeoMeta(data, themeId, locale)` → `ogLocale` = `en_US` / `hi_IN`
- EN vs HI titles/descriptions differ, HI contains Devanagari (`[\u0900-\u097F]`)
- Repaints via `SITE_LOCALE_EVENT`, document.title updates, meta content updates

## Open Graph

- OG Title = Page Title
- OG Description = Meta Description
- OG Image = `heroImageUrl || gallery[0].url || logoUrl || social thumbnail` — real media only, no placeholder invention (test checks `includes(themeId)` and `startsWith(https)`)
- Site Name = real `salonName`
- URL = Canonical
- Type = `website`, Locale = `hi_IN`/`en_US`
- Also `twitter:title`, `twitter:description`, `twitter:image`, `twitter:card=summary_large_image`

Social sharing shows active salon/theme content because SEO is generated from live `data`.

## Technical SEO

- **Canonical**: `buildCanonicalUrl(data)` → prefers `publishedUrl` (validated absolute), else `https://{websiteSlug}.nexora.site`, else slugified `salonName`. Absolute `https://`, uses real slug.
- **Robots**: `index, follow` (constant `SEO_ROBOTS`)
- **Sitemap**: `buildSitemapEntry()` → `{loc, lastmod: YYYY-MM-DD, changefreq: weekly, priority: 1.0 for barber else 0.8}` — absolute https, compatible with XML sitemap
- **Heading hierarchy**: `verifyHeadingHierarchy()` counts H1/H2/H3, asserts exactly 1 H1 (hero title from real `tagline`), reports issues
- **No duplicate theme metadata**: `findDuplicateSeo()` checks titles/descriptions across 5 themes → `isUnique=true` enforced in tests
- Never hardcodes one theme's metadata into all; `THEME_SEO` is keyed by themeId, locale

## Validation

```bash
npx tsx scripts/test-phase-10.11.mjs
# 72/72: Barber → Hair Studio → Beauty/Spa → Family → Nail/Lash
# EN → HI, Light → Dark, Desktop → Mobile, Page metadata → Social preview
# Canonical absolute https + real slug, robots index,follow, sitemap YYYY-MM-DD, H1 single + real data, OG image real media, no duplicates

npm run test:phase-10
# 10.1 (80) + 10.2 (49) + 10.3 (86) + 10.4 (118) + 10.5 (56) + 10.6 (102) + 10.7 (66) + 10.8 (36) + 10.9 (77) + 10.11 (72) = 742, all green
npx tsc --noEmit # 0 errors
```

Tested: English → हिंदी flips title/description + og:locale; Light → Dark keeps SEO valid; Desktop → Mobile both have SEO div; Page metadata → Social preview (OG title/description/image/site_name/url match).

STOP after successful SEO validation — per task.
