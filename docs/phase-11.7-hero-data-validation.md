# Phase 11.7 — Hero Data Validation (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: hero DATA and fallbacks only. No hero redesign; no change to the
> database, service, booking architecture or Phase 10.

## Defects found and fixed

### 1. Unvalidated owner media reached the DOM (security + reliability)

**Symptom.** `heroImageUrl` / gallery / reel URLs were used after only a
`.trim()`. Feeding the hero `javascript:alert(1)` produced a literal
`<img src="javascript:alert(1)">`, and free text like `not a url at all`
became a broken `src` instead of falling back.

React blocked the `javascript:` **href** at render time, so this was not an
exploitable XSS today — but the hero was relying on a framework guardrail
rather than validating its own data, and every invalid URL silently produced a
broken image where a safe theme fallback was available.

**Fix.** Added `isSafeMediaUrl()` / `safeMediaUrl()` in `src/lib/siteHero.ts`.
Only schemes a browser can actually render are accepted — `http(s)`,
protocol-relative, root/relative paths, `data:image` / `data:video` uploads and
`blob:` previews. Everything else (`javascript:`, `vbscript:`, `file:`,
`about:`, free text, non-strings, control characters) is rejected, so the hero
falls back to the theme's own safe media. Applied to:

- `heroMedia()` — hero image + every gallery entry
- `heroVideoSource()` — inline clips must pass the media rules; external reels
  must be real `http(s)` pages (they open in a new tab)
- `setThemeHeroVideo()` — a deployment cannot register an unsafe clip

### 2. Fake initials invented from placeholder copy

**Symptom.** With no salon name, `heroSalonName()` returned the generic
`"Your Salon"` and `heroLogoInitials()` turned that into a **"Y"/"N" monogram**
— a fabricated brand identity, the same class of issue Phase 11.5 removed.

**Fix.** Initials now derive from the real `salonName` only and return `''`
when it is unset. New `heroLogoMark(data, themeId)` renders a neutral,
per-theme glyph instead (`✂ ◈ ❋ ☺ ✦` — one per theme, no letters).

## Verified (306 assertions)

| Requirement | Result |
|---|---|
| Per-theme headline / description / CTA labels | ✅ all 8 text fields unique pairwise, EN **and** HI |
| Per-theme hero image/video + mobile media | ✅ disjoint fallback sets; mobile source narrower than desktop |
| Real configured salon data | ✅ owner tagline/about/logo/name win; theme copy is only a fallback |
| No fake salon name/content | ✅ no invented initials; neutral mark when unnamed |
| No hardcoded content copied across themes | ✅ pairwise uniqueness enforced |
| Missing media → safe fallback | ✅ every sparse case still renders safe media |
| Missing optional content doesn't break | ✅ 8 sparse profiles × 5 themes × 2 frames, no crash; optional CTAs/stat disappear cleanly |
| Invalid media fails gracefully | ✅ hostile URLs rejected pre-render; broken URLs hit the existing error state with **no layout shift** |
| Theme switch loads correct data | ✅ Barber → Hair → Spa → Family → Nail |
| Previous media/content disappears | ✅ no stale copy, badges, media or layout |
| No stale cache/state | ✅ `requestCache` holds no `theme:<prior>:` keys (asserted against the real Map) |
| Language + Light/Dark survive switching | ✅ verified in `en/light` and `hi/dark` |
| No duplicate media requests | ✅ unique `src` per hero, all 5 × 3 frames |
| Lazy-loading preserved | ✅ hero stays `eager`; below-fold lazy untouched |
| No unnecessary reloads | ✅ media resolution is deterministic and pure across theme switches |

## Validation

```bash
npm run test:phase-11.7   # 306/306  ← this phase
npm run test:phase-11     # 1948 total, all green
npm run test:phase-10     # 1259/1259
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

## Files changed

| File | Change |
|---|---|
| `src/lib/siteHero.ts` | `isSafeMediaUrl()` / `safeMediaUrl()`; sanitised `heroMedia()`; real-name-only `heroLogoInitials()`; new `heroLogoMark()` |
| `src/lib/siteHeroMedia.ts` | Reel + theme-clip URL validation |
| `src/components/heroes/*Hero.tsx` | Use `heroLogoMark()` for the logo slot |
| `scripts/test-phase-11.7.mjs` | **New** — 306-assertion data-validation suite |
