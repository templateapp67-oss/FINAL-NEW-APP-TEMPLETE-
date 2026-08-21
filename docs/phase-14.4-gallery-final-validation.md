# PHASE 14.4 — GALLERY FINAL VALIDATION

> Continues from Phase 14.3. This is the final acceptance pass over the Phase 14
> gallery (14.1 content + 14.3 viewer) for all five themes. Nothing is recreated;
> any failure was fixed at its root cause.

## What changed

- `scripts/test-phase-14.4.mjs` — **22-test** final acceptance matrix (five themes).
- `package.json` — `test:phase-14.4` + combined `test:phase-14`
  (14.1 → 14.3 → 14.4 in order).

## Coverage map (spec → checks)

| Spec area | Verified |
|---|---|
| Theme-specific content | owner/service/theme media scoped per theme; foreign `themeId` items and other themes' media never render |
| Category filters | chips = theme vocabulary + only categories with items; distinctive chip per theme (barber→beard, hair→cuts, spa→facial, family→men/women, nail→nailArt); filter narrows and All restores |
| Before/After | comparison slider + Before/After labels in the viewer where configured |
| Lightbox open/close + next/prev + counter | all five themes |
| Mobile swipe | swipe advances/returns; wraps around; vertical/sub-threshold ignored |
| Broken image | `SiteImage` error fallback |
| Loading/skeleton | skeleton while loading, cleared on load |
| Empty gallery | empty panel (barber/hair/spa) or registered media (family/nail) |
| Lazy loading | `loading="lazy"` + responsive srcSet on gallery images |
| No unnecessary full-size media | only the active image mounted in the viewer |
| No layout shift | tiles + banner keep fixed aspect ratios at every viewport |
| No horizontal overflow | `.site-scroll` overflow-x-hidden + viewer `touch-action: pan-y` |
| Alt/accessibility | non-empty alt text, dialog role, aria-modal, control aria-labels |
| **Theme switch cycle** | Barber → Hair Studio → Beauty/Spa → Family → Nail/Lash → Barber; after every switch: filter reset to All, viewer closed, previous media removed, only active theme media, no cross-theme images |
| Responsive | desktop/tablet/mobile mode-based grid (3/3/2 · 3/3/2 · 3/3/2 · 3/2/2 · 5/3/2) |
| English → Hindi | titles, chips, viewer swipe hint localised |
| Light → Dark | distinct surfaces in both appearances per theme |
| Normal → Slow network | offscreen images stay unmounted (skeleton only) until in view; mount on normal network |
| Valid → Broken image | fallback appears |
| Available → Empty gallery | empty state appears |

## Root-cause fixes applied

- The test harness previously asserted `assert.equal(<rendered DOM node>, null)`;
  on failure Node's deep diff walks the node's React fiber tree (the whole
  template), which OOM-killed the process. Assertions now compare a boolean
  (`Boolean(node)`) so failures report cheaply and never crash the runner.
- Skeleton/network checks now target the gallery's own `SiteImage` wrappers
  (context `gallery`) instead of the first image on the page (hero/logo).

## Validation

- `test:phase-14` → **114/114** (14.1 55 + 14.3 37 + 14.4 22)
- `npm run lint` → 0 errors
- `npm run build` → green
- `node verify-22-screens.js` → all 25 screens verified

## Scope guards

- No invented images; no database/service/booking/payment changes; Phases
  10–13 and 14.1–14.3 untouched.
