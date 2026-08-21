# Phase 11.4 — Hero Desktop + Tablet + Mobile QA (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: QA of the Phase 11.1–11.3 hero across three frame sizes, two
> languages and two appearances. The hero was **not** redesigned; Phase 10 and
> 11.1–11.3 behaviour is unchanged apart from the two root-cause fixes below.
> **Phase 11 is complete** — all five heroes pass Desktop + Tablet + Mobile.

## Defects found and fixed

QA was not a rubber stamp — it surfaced two real bugs that would have shipped.

### 1. Tablet rendered at desktop scale · `hidden md:` inverted on mobile

**Symptom.** Tablet was visually identical to desktop, and the Nail & Lash
studio badge (`hidden md:inline-flex`) appeared on the **mobile** hero while
disappearing on desktop in a narrow window.

**Root cause.** The heroes mixed two different notions of "responsive":

- `mode` (`desktop` / `tablet` / `mobile`) selects a **fixed-width preview
  frame** — 950px / 768px / 390px.
- Tailwind's `md:` prefix keys off the **real browser viewport**.

Inside a wide browser, `md:` matched for *every* frame — including the 390px
phone. So `md:grid-cols-[…]`, `md:px-14` and `md:text-[4.2rem]` all applied in
the tablet frame (nail: a 67px headline in a two-column grid at 768px), and
`hidden md:inline-flex` resolved to *visible* on the mobile frame.

Phase 10.3 had already solved this class of problem with mode-based
`siteGrid(mode, …)`; the Phase 11 heroes deviated from that convention.

**Fix.** Added `heroModeValue(mode, { desktop, tablet, mobile })` in
`src/lib/siteHero.ts` and converted **every** `md:` class in all five heroes
(28 total) to frame-accurate values. Nail's badge is now
`showStudioBadge = mode === 'desktop'`. Each theme gained genuine tablet
values — e.g. hair studio headline `3.6rem → text-4xl → 2.45rem`.

Guarded by a test asserting **zero** `sm:|md:|lg:|xl:|2xl:` classes anywhere in
any hero, on any frame, plus a per-theme check that the three modes produce
three *different* headline sizes.

### 2. Owner catalog silently deleted hero focus badges

**Symptom.** With one `Haircut` service saved, the Hair Studio hero showed only
`Cut & Styling · Hair Treatments` — **Colour** and **Balayage** vanished.

**Root cause.** `heroFocusBadges()` narrowed badges with substring matching:
`"haircut".includes("cut")` and `"haircut".includes("hair")` both hit, so two
badges "matched" and the filter dropped the rest.

**Fix.** Match **whole words** against a tokenised catalog set instead of raw
substrings. A `Haircut` service no longer matches `Cut & Styling`.

## QA matrix — 369 assertions

Every theme × `desktop` / `tablet` / `mobile`:

| Check | How it is verified |
|---|---|
| Hero media fits | frame present, `aspect-ratio` reserved, `object-cover`, fills its box |
| No cropping | brand, name, headline, description and both CTAs present and not `hidden` |
| No overflow | hero root clips decorations; no fixed width exceeds the frame; images width-contained |
| Readable text | explicit type size per frame; single `<h1>`; description has `max-w-*` and stays 40–400 chars |
| CTA visible + touch | every rendered CTA carries `site-touch` (44px) and is not hidden |
| Book Appointment | opens the existing booking flow and closes again |
| Explore Services | targets the real `#section-services` (`data-site-section="services"`), never opens booking |
| Mobile optimized | single column, `w=640` + `q=70` sources, no desktop-only flourishes |
| Video fallback | `error` → poster image, **same aspect ratio** (no shift) |
| Image fallback | `error` → existing `SiteImage` error state, same aspect ratio |
| No layout shift | image wrapper reserves an aspect ratio while loading |
| Light/Dark | header appearance flips, hero keeps its themed surface, all CTAs survive |
| English/Hindi | Devanagari headline/description/CTAs; longer Hindi copy breaks no containment |
| Theme isolation | layout signature, headline, surface and focus badges are each theme's own; layouts/headlines/surfaces distinct pairwise; no image shared between themes — **on all three frames** |

## Validation

```bash
npm run test:phase-11.4   # 369/369  ← this phase
npm run test:phase-11.3   # 249/249
npm run test:phase-11.2   # 138/138
npm run test:phase-11.1   # 215/215
npm run test:phase-10     # 1259/1259
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

**Phase 11 total: 971 tests, all green.**

## Files changed

| File | Change |
|---|---|
| `src/lib/siteHero.ts` | New `heroModeValue()`; whole-word focus-badge matching |
| `src/components/heroes/*.tsx` | All 28 `md:` classes → frame-accurate mode values; nail badge is desktop-only by mode |
| `scripts/test-phase-11.4.mjs` | **New** — 369-assertion QA suite |

No database, migration, service or theme-data change. No hero layout, content
or media was redesigned.
