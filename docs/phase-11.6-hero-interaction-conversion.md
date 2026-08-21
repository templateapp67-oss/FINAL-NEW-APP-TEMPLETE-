# Phase 11.6 — Hero Interaction & Conversion (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: hero CTA behaviour, interaction states, scroll flow and accessibility.
> No hero layout, content or media was recreated. Database, services, booking
> architecture and Phase 10 are untouched.

## What changed

### New: `src/lib/siteHeroNav.ts`

A thin wrapper over the EXISTING Phase 10 navigation — it adds **no route, no
section and no second booking flow**:

- `heroTargetId(themeId, key)` resolves destinations through the Phase 10.3
  registry (`siteSectionDomId`) instead of hardcoded strings, so a theme that
  aliases a section still lands on the right element.
- `heroLinkProps()` turns in-page CTAs into **real anchors** (`href="#…"`) with
  a click handler that upgrades to a smooth scroll. Modified clicks
  (⌘/Ctrl/Shift/middle) fall through to native behaviour.
- `heroScrollTo()` honours `prefers-reduced-motion` — `smooth` normally,
  instant `auto` for reduced-motion visitors. The shared Phase 10.1
  `scrollToSiteSection()` is left exactly as-is.
- `heroCtaClass()` / `HERO_CTA_MOTION` give every theme its own motion class.

### Issues fixed

| # | Issue | Fix |
|---|---|---|
| 1 | **Explore Services / View Gallery were `<button onClick>`** — not focusable as links, no visible destination, no open-in-new-tab, announced as buttons | Now real `<a href="#section-…">` with smooth-scroll enhancement. Booking stays a `<button type="button">` because it is an action, not navigation |
| 2 | **Destinations were hardcoded** (`'section-services'`) bypassing the alias registry | All destinations resolve via `heroTargetId()` |
| 3 | **Smooth scroll ignored `prefers-reduced-motion`** — an unavoidable animation | `heroScrollTo()` jumps instantly under reduced motion |
| 4 | **Inconsistent, undifferentiated CTA motion** — some CTAs had none | Five distinct signatures, each ≤180ms, no loops |

### Per-theme motion signatures

| Theme | Interaction feel |
|---|---|
| Barber | Hard mechanical press — inset underline, 1px push, no float |
| Hair Studio | Editorial hairline that draws in under the label |
| Beauty/Spa | Slow calm lift with a soft halo |
| Family | Friendly springy bounce (`cubic-bezier(.34,1.56,.64,1)`) |
| Nail & Lash | Glossy neon glow (brightness + saturation + ring) |

All five are disabled together in one `prefers-reduced-motion: reduce` block.

## Verified (377 assertions)

- **CTA behaviour** — Book Appointment opens exactly **one** existing booking
  flow; Explore Services lands on `data-site-section="services"`; View Gallery
  on `"gallery"`; Call is `tel:`; WhatsApp is `wa.me` + `target=_blank` +
  `rel=noreferrer`.
- **Scroll flow** — canonical 16-section order intact, every target id unique,
  no route change, no duplicate sections.
- **Interactions** — hover/focus-visible/active in CSS; per-theme motion
  applied and never borrowed; no `animate-bounce/ping/spin/pulse` on hero
  content; reduced motion switches scroll to `auto` and suppresses video.
- **Accessibility** — button vs link semantics, `type="button"` everywhere,
  no negative tabindex, keyboard activation opens booking, every CTA has an
  accessible name, images have alt, video is labelled + `tabIndex={-1}`,
  decorative icons `aria-hidden`, hrefs resolve to exactly one element.
- **Matrix** — 5 themes × desktop/tablet/mobile × EN/HI × light/dark: every
  CTA renders, is labelled, points somewhere real, and works.
- **Theme isolation** — Barber → Hair → Spa → Family → Nail on three frames:
  unique CTA styling, correct destinations, correct content/media, and zero
  stale copy, motion classes or media from the previous theme.

## Validation

```bash
npm run test:phase-11.6   # 377/377  ← this phase
npm run test:phase-11     # 1642 total, all green
npm run test:phase-10     # 1259/1259
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

## Files changed

| File | Change |
|---|---|
| `src/lib/siteHeroNav.ts` | **New** — registry-backed destinations, motion-aware scroll, link props, per-theme CTA classes |
| `src/index.css` | Five per-theme CTA motion signatures + a combined reduced-motion block |
| `src/components/heroes/*Hero.tsx` | In-page CTAs → real anchors; all 30 CTAs carry their theme's motion class |
| `scripts/test-phase-11.6.mjs` | **New** — 377-assertion interaction suite |
