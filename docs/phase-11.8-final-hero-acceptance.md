# Phase 11.8 — Final Hero Acceptance (all 5 themes)

> Status: **COMPLETE — PHASE 11 ACCEPTED** (2026-08-14, session
> `arena/019ffe18-new-tamplete-app`).
> Scope: acceptance testing only. **No source changes were required** — the
> hero passed the full gate as built in 11.1–11.7. The only code added is the
> acceptance suite itself.

## Result

**450/450 acceptance assertions pass.** Phase 11 totals **2398 tests**, all
green, with Phase 10 unchanged at **1259/1259**.

| Suite | 11.1 | 11.2 | 11.3 | 11.4 | 11.5 | 11.6 | 11.7 | 11.8 | Total |
|---|---|---|---|---|---|---|---|---|---|
| Tests | 215 | 138 | 249 | 369 | 294 | 377 | 306 | **450** | **2398** |

## What was accepted

### A. Per-theme uniqueness (5 themes × 3 frames)

| Theme | Layout | Verified unique |
|---|---|---|
| Barber & Men's Grooming | `cinematic-slab` | layout · headline · description · surface · media |
| Hair Studio & Color Bar | `editorial-gallery` | ✅ |
| Beauty, Skin & Spa | `soft-arch` | ✅ |
| Full-Service Family Salon | `action-card-collage` | ✅ |
| Nail & Lash Studio | `glam-card-shelf` | ✅ |

Every field is asserted **pairwise distinct**, and no hero image is shared
between any two themes.

### B. Required elements

Book Appointment + Explore Services CTAs, theme-specific styling and CTA
motion, mobile-optimized media (`w=1400/1000/640` per frame), theme fallback
media when the owner supplied none, loading states that reserve space, error
states that degrade without layout shift, and the full accessibility contract
(alt text, accessible names, `type="button"`, keyboard reachability, 44px
targets, `aria-hidden` icons).

### C. Complete flows — verified on all 5 themes × 3 frames

```
Hero → Book Appointment → exactly ONE existing booking flow → back
Hero → Explore Services → data-site-section="services"
Hero → Gallery         → data-site-section="gallery"
Hero → Call            → tel:+91 99999 00000
Hero → WhatsApp        → https://wa.me/919999900000 (_blank + noreferrer)
```

No duplicate sections, no route change, canonical 16-section order intact.

### D. Full-cycle theme switch

`Barber → Hair → Spa → Family → Nail → **back to Barber**`, run in
`desktop/tablet/mobile` × `en+light` / `hi+dark`. At every step: correct
content, media, styling and CTA destinations; and after each switch **zero**
stale copy, focus badges, motion classes, media or `theme:<prior>:` cache keys.
The final return to Barber is asserted to restore its hero exactly, with no
other theme's copy leaking back in.

### E. Motion & media at acceptance level

Reduced-motion visitors get a still hero and an instant (`auto`) scroll to the
same destination; a registered clip plays `muted` + `playsinline` + `loop`
without `controls`, is labelled and `tabIndex={-1}`, and falls back to its
poster on error with no layout shift.

### F. Single implementation

Routed through the real shared `TemplateRenderer` entry point, each theme
renders exactly **one** `#section-hero`, one `[data-testid="site-hero"]`, one
`<h1>` and one media frame. The legacy hero markup inside `TemplateRenderer`
is unreachable for all five themes (each returns early to its own renderer).

## Test-quality note

The first run passed 449/449, but one assertion compared the hero's style
attribute to itself (a tautology). It was replaced with an **independent
baseline** — each theme is rendered standalone in both appearances first, and
the cycle asserts against those recorded surfaces — bringing the suite to 450
genuine assertions.

## Validation

```bash
npm run test:phase-11.8   # 450/450  ← acceptance gate
npm run test:phase-11     # 2398 total, all green
npm run test:phase-10     # 1259/1259
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

## Files changed

| File | Change |
|---|---|
| `scripts/test-phase-11.8.mjs` | **New** — 450-assertion acceptance gate |
| `package.json` | `test:phase-11.8` + wired into `test:phase-11` |

No product source was modified in this phase.
