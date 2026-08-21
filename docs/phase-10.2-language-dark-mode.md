# Phase 10.2 — Global Language & Dark Mode (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffa2e-new-tamplete-app`).
> Scope: global English ↔ हिन्दी + Light ↔ Dark for the five website themes.
> No database or data-model changes; no theme/service data modified.

## Architecture — two global systems, zero per-theme forks

| Layer | File | Role |
|-------|------|------|
| Language store/events | `src/lib/siteNavigation.ts` (10.1) | `nexora_locale` + `nexora:site-locale` event |
| Appearance store/events | `src/lib/siteNavigation.ts` (10.1) | `nexora_site_appearance` + `nexora:site-appearance` event, **persisted across refresh** |
| React subscriptions | `src/components/SiteHeader.tsx` | `useSiteLocale()` and `useThemeAppearance(themeId)` — renderers re-render on header control changes |
| Dark palettes | `src/lib/themeSurfaces.ts` | `BARBER/HAIR_STUDIO/BEAUTY_SPA/FAMILY/NAIL_LASH` × `{light, dark}` token maps; `surfacesOf(pair, appearance)` resolver. Light palettes preserve the exact pre-10.2 values |
| Copy | `src/lib/siteI18n.ts` | `siteText(themeId, locale)` — namespaced per-theme copy tables, common label map, `DAY_LABELS`, and a global `translateCategory()` dictionary covering all five themes' Phase 7.3 categories |

## Language (English default / हिन्दी)

Switching from the header (desktop control or mobile drawer) instantly flips:
navigation, hero CTAs, section eyebrows/titles/subtitles, service card CTAs,
package rows, day names + Closed, address/hours labels, deposit card, founder
block fallbacks, reviews, and footer — for every theme.

- **Service names/descriptions** localize through the existing Phase 9.2
  `displayService(s, locale)` translations pipeline; records without a Hindi
  translation keep English (never fabricated).
- **Service categories** translate via the single global `translateCategory`
  dictionary — the same English label always yields the same Hindi label, so
  translations can never mix between themes.
- Theme copy is namespaced (`barber.*`, `hair.*`, `spa.*`, `family.*`,
  `nail.*`) — Hindi services titles verified pairwise-distinct across themes.
- Offer/badge/pricing rows keep rendering real data (₹ amounts, bundle names,
  Phase 9.1 discounts) in both locales; no data is translated destructively.
- English output is byte-identical to the pre-10.2 copy (verified string by
  string against `git show HEAD:` originals).

## Dark mode

The header toggle (desktop + mobile drawer) re-skins the whole website:
page, Hero, Services, Offers/packages, Gallery, Videos, About/Owner,
Team/Staff chip rows, Reviews cards, Location, Contact band and Footer.

Distinct identities (all five verified pairwise-distinct in tests):
- **Barber** — native charcoal/gold is the dark design; Light = warm "day shift" cream.
- **Hair Studio** — Light warm paper ↔ Dark espresso ink with lifted rose-gold.
- **Beauty Spa** — Light cream/emerald ↔ Dark deep-forest night spa.
- **Family** — Light sky/white ↔ Dark night-sky navy, sun-yellow accents.
- **Nail & Lash** — Light sand/cream ↔ Dark plum with neon-pink glow.

Selection persists in `localStorage.nexora_site_appearance`; a fresh mount
(= refresh) rehydrates the stored mode (asserted by remount test).
Barber stays dark by default (its brand), toggle reveals the cream variant.

## Validation

```bash
npm run test:phase-10.2   # 49/49 — EN↔HI + Light↔Dark + persistence + mobile, all five themes
npm run test:phase-10.1   # 80/80 — header regression intact
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
npm run test:acceptance   # 66/66 — Phase 8.3 services/data layer untouched
```
