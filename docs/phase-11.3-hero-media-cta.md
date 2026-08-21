# Phase 11.3 — Hero Media & Call-to-Action (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: hero **media + CTA** only. Phase 11.1 layouts, Phase 11.2 content,
> the Header, Language / Dark Mode and the database / service architecture
> were not recreated or modified.

## 1. Hero media

Each theme owns its own media, resolved by `src/lib/siteHeroMedia.ts` and
rendered through the new `HeroMediaFrame` primitive:

| Theme | Media placement in its own 11.1 layout | Imagery |
|---|---|---|
| Barber | Motion cell inside the gold film-strip (backdrop keeps its own still) | Men's grooming / barber chair |
| Hair Studio | Editorial plate `01` of the contact-sheet wall | Hair styling / colour |
| Beauty/Spa | The rounded arch itself | Facial / spa ritual |
| Family | The big rotated collage tile | Family / unisex salon |
| Nail & Lash | The "look of the week" glam card | Nail art / lash |

No media source is shared between themes — asserted pairwise on the rendered
DOM and at the source level.

### Image-first by default (deliberate)

`THEME_VIDEOS` ships **empty**. The sandbox has no outbound network, so I could
not verify any third-party clip URL; hardcoding guessed CDN links would have
made every hero silently degrade to its poster in production. Motion is
therefore opt-in through two verified paths:

1. **Owner media** — a `socialVideos` entry whose URL is a playable file
   (`.mp4`, `.webm`, …) is used inline automatically. Non-playable reels
   (Instagram/YouTube links) become a click-to-open link and never autoplay.
2. **Deployment registry** — `setThemeHeroVideo(themeId, src)` registers a
   verified, self-hosted clip in that theme's **own** slot.

Both paths were verified end-to-end: with a clip registered, all five heroes
render `kind=video`, `muted`, `playsinline`, `loop`, `controls=false`, with a
poster.

## 2. Media behaviour

- **Optimized loading** — images go through the existing `SiteImage`
  (srcset, eager+priority above the fold, skeleton, error state).
- **Mobile-optimized** — `heroImageSrc()` rewrites width per viewport
  (desktop 1400 / tablet 1000 / mobile 640, `q=70` on mobile) for hosts that
  support transforms; data URLs and owner uploads pass through untouched.
- **No layout shift** — every frame reserves a fixed `aspect-ratio`.
- **Never autoplays with sound** — `muted` + `playsInline` + `loop`, no
  `controls`; the element is forced muted on mount and a blocked
  `play()` promise falls back to the poster.
- **Reduced motion** — `useReducedMotion()` reads
  `prefers-reduced-motion: reduce`; those visitors get the still poster.
- **Fallbacks** — video error → poster image; image error → the existing
  `SiteImage` error state.

## 3. Hero CTAs

Primary **Book Appointment** (existing Phase 10.6 booking flow) and secondary
**Explore Services** were already present; 11.3 adds the optional trio wired to
the existing contact system (`canCall`/`canWhatsApp`/`salonTelHref`/
`salonWhatsAppHref`) via `heroCtaOptions()`:

| Theme | Call | WhatsApp | Gallery | Styling |
|---|---|---|---|---|
| Barber | Call the Shop | WhatsApp the Barber | See Cut Gallery | Hard-edged bordered slabs |
| Hair Studio | Call the Studio | WhatsApp the Colourist | View Colour Portfolio | Rose-gold hairline underlines |
| Beauty/Spa | Call the Spa | WhatsApp for Availability | Tour the Spa | Soft shadowed pills |
| Family | Call the Salon | WhatsApp the Front Desk | See Family Photos | Rounded tiles inside the action card |
| Nail & Lash | Call the Studio Desk | WhatsApp Your Inspo | Open the Art Wall | Glossy neon tags |

Optional CTAs hide automatically when the owner disables Call/WhatsApp or has
no gallery photos. All labels are translated in the existing language system.

## 4. Files

| File | Role |
|---|---|
| `src/lib/siteHeroMedia.ts` | **New** — reduced motion, per-viewport sources, video resolution, media plan, theme clip registry |
| `src/components/heroes/HeroMediaFrame.tsx` | **New** — shared media behaviour; themes pass their own ratio/rounding/overlay |
| `src/lib/siteHero.ts` | `heroCtaOptions()`; poster now always prefers the owner's hero image |
| `src/lib/siteHeroI18n.ts` | `callCta` / `whatsAppCta` / `galleryCta` / `videoCta` per theme, EN + HI |
| `src/components/heroes/*.tsx` | Media frame + optional CTA row in each theme's existing layout |
| `scripts/test-phase-11.3.mjs` | **New** — 249 tests |

## 5. Validation

```bash
npm run test:phase-11.3   # 249/249
npm run test:phase-11.1   # 215/215 — layouts unchanged
npm run test:phase-11.2   # 138/138 — content unchanged
npm run test:phase-10     # 1259/1259 — Phase 10 unchanged
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

Covered per theme: desktop / tablet / mobile × EN / HI × light / dark, muted
video attributes, reduced motion, video fallback, image fallback, the Book
Appointment flow opening and closing, contact-option hiding, and pairwise
isolation of media, CTA text and CTA styling.

### Regression fixed during this phase

Routing the poster through the reel thumbnail briefly let a video thumbnail
override the owner's `heroImageUrl` (caught by the 11.1 suite). The poster now
always resolves from the theme's primary visual, which prefers owner media.
