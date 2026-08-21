# Phase 11.5 — Hero Final Polish (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: final polish + sign-off QA of the Phase 11.1–11.4 hero. No hero layout
> was redesigned. Database, services, booking, header and Phase 10 untouched.
> **Phase 11 is closed: 1265 tests green.**

## Defects found and fixed

### 1. Fabricated business metrics presented as fact (most serious)

**Symptom.** Every hero printed a hardcoded marketing number — barber
`12k+ Cuts delivered`, hair `9 Colour formulas on the bar`, spa
`75 min Average ritual`, family `3 Chairs bookable together`, nail
`3 wks+ Average gel set wear`.

**Why it matters.** No salon supplied these. A brand-new studio publishing its
site would have claimed 12,000 completed haircuts on day one — a false
advertising claim rendered as fact, and a direct violation of the phase rule
"remove any placeholder, fake or copied content".

**Fix.** Removed `statValue`/`statLabel` from the copy table. Added
`heroStat(data, copy)` in `src/lib/siteHero.ts`, which derives the value from
**real** salon data: active service count → else team-member count → else
renders **nothing**. Archived/inactive services never inflate it. The copy
table now holds only per-theme wording (`statServicesLabel`, `statTeamLabel`).

### 2. No keyboard focus state on any hero CTA

All 30 hero CTAs (6 per theme) had hover styling but **zero** `:focus-visible`,
making the hero unusable for keyboard and switch-device users.

**Fix.** Added a scoped `.site-hero-cta` class in `src/index.css` with
`hover` / `focus-visible` (2px `currentColor` outline, 3px offset) / `active`
states, plus a `prefers-reduced-motion` guard. Scoped to the hero so Phase 10
controls are untouched; uses `currentColor` so each theme keeps its own accent.

### 3. Accessibility gaps

- 45 decorative lucide icons were announced to screen readers → now `aria-hidden`.
- The ambience `<video>` was focusable and exposed as a media element → now
  `role="img"` + `tabIndex={-1}` with its text alternative retained.

### 4. Mobile hero excessively tall

Barber stacked **two** media cells on a 390px phone (~459px of media before the
CTAs); the spa arch was 392px.

**Fix.** Barber renders only the motion cell on mobile at `16/10` (459 → 219px);
the spa arch narrows to 74% at `4/4.2` (392 → 265px). All five themes now sit
under a 300px mobile media budget, enforced by a test.

## Verified (294 assertions)

| Requirement | Result |
|---|---|
| Salon name/logo from actual data | ✅ owner logo used; initials derived from the real name when absent |
| Headline/description/CTA match active theme | ✅ all 5 × 3 frames |
| No placeholder/fake/copied content | ✅ source scan + no `\d+k+` volume claims + stat is data-derived |
| Hero media belongs to the theme | ✅ no theme renders another theme's media |
| Text readable over media | ✅ scrim or backed captions on every overlay |
| Spacing/typography/alignment | ✅ zero viewport breakpoints; type sized per frame; measure limits |
| CTA hover/focus/active | ✅ all 30 CTAs carry `site-hero-cta` + `site-touch` |
| Accessibility labels | ✅ every image has alt, every control has a name, icons hidden |
| Hindi does not break layout | ✅ 5 themes × 3 frames, containment held |
| Dark mode contrast | ✅ never drops a WCAG tier or >10% vs light; headlines clear AA |
| Mobile not excessively tall | ✅ ≤300px media budget on all five |
| **Theme isolation** | ✅ Barber → Hair → Spa → Family → Nail on 3 frames: correct content/media/styling/CTA, **zero** previous-theme text, badges, layout or media; booking still opens after each switch |

## Validation

```bash
npm run test:phase-11.5   # 294/294  ← this phase
npm run test:phase-11.4   # 369/369
npm run test:phase-11.3   # 249/249
npm run test:phase-11.2   # 138/138
npm run test:phase-11.1   # 215/215
npm run test:phase-11     # 1265 total, all green
npm run test:phase-10     # 1259/1259
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

## Files changed

| File | Change |
|---|---|
| `src/lib/siteHero.ts` | New `heroStat()` — data-derived hero metric |
| `src/lib/siteHeroI18n.ts` | Removed fabricated stats; added `statServicesLabel` / `statTeamLabel` (EN + HI) |
| `src/index.css` | New scoped `.site-hero-cta` hover/focus-visible/active states |
| `src/components/heroes/*.tsx` | Wire `heroStat`; `site-hero-cta` on all 30 CTAs; 45 icons `aria-hidden`; barber + spa mobile height fixes |
| `src/components/heroes/HeroMediaFrame.tsx` | Video `role="img"` + `tabIndex={-1}` |
| `scripts/test-phase-11.2.mjs` | Updated to the new stat-label contract |
| `scripts/test-phase-11.5.mjs` | **New** — 294-assertion final polish suite |
