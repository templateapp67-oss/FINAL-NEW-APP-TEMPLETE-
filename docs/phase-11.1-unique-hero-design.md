# Phase 11.1 — Unique Hero Design for all 5 themes

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: the Hero section only. Header, Language and Dark Mode from Phase 10
> are reused unchanged; no database, service or theme-data architecture was
> touched.

## What was built

Five **completely separate** hero components — not one layout re-skinned five
times. Each lives in its own file and shares nothing but the data helpers.

| Theme | Component | `data-hero-layout` | Visual idea |
|-------|-----------|--------------------|-------------|
| Barber & Men's Grooming | `heroes/BarberHero.tsx` | `cinematic-slab` | Full-bleed darkened barbershop plate, hard gold rule down the left edge, barber-pole stripe texture, left-aligned uppercase slab type, vertical film-strip of grooming shots, "brass rail" meta bar |
| Hair Studio & Color Bar | `heroes/HairStudioHero.tsx` | `editorial-gallery` | Magazine cover: double hairline frame, masthead rule, serif display type, rose-gold hairline underline CTA, three-frame numbered contact-sheet gallery wall, typeset colophon meta line |
| Beauty, Skin & Spa | `heroes/BeautySpaHero.tsx` | `soft-arch` | Pastel gradient with floating blobs, primary visual inside a tall rounded **arch**, round "pebble" support visuals, overlapping rounded ritual card, pill CTAs, soft capsule meta |
| Full-Service Family Salon | `heroes/FamilyHero.tsx` | `action-card-collage` | Bright sky panel, Men/Women/Kids self-select pills, a rounded **quick-access action card** holding both CTAs plus a meta ribbon, and a friendly three-tile rotated photo collage with sunshine badge |
| Nail & Lash Studio | `heroes/NailLashHero.tsx` | `glam-card-shelf` | Lookbook shelf of glam cards (one large "look of the week" + two glow-ringed side cards), oversized tight-tracking display type, neon-glow pill CTA, glossy bottom receipt strip |

### Every hero contains

- Salon **logo** (owner upload, else an initials mark) + **salon name**
  (respects the Brand Identity font/colour presets).
- A **theme-specific headline**. Line 1 is the owner's real tagline when set
  (keeps the page's single `<h1>` describing the actual salon for SEO —
  Phase 10.11); line 2 is always the theme's own accent line.
- A **short description** (owner About copy when set, else theme copy).
- **Primary CTA — Book Appointment**, which opens the existing Phase 10.6
  booking flow via `data-open-booking` / `openSiteBooking()`.
- **Secondary CTA — Explore Services**, which scrolls to `#section-services`.
- **Hero media**: images through the optimized `SiteImage` (eager + priority
  above the fold), plus an optional hero **video** chip when the owner has
  published a reel.
- **Optional info**: review rating (only when approved reviews exist),
  short location label (only when an address exists) and the live
  open/closed chip from the Phase 10.5 status engine.

## New files

| File | Role |
|------|------|
| `src/lib/siteHeroI18n.ts` | Hero copy table, EN + हिन्दी, namespaced per theme (headline, accent, description, CTA labels, chips, media captions, stat) |
| `src/lib/siteHero.ts` | `heroMedia`, `heroVideo`, `heroMeta`, `heroHeadline`, `heroDescription`, `heroSalonName`, `heroLogoInitials`, `heroLocationLabel` |
| `src/components/heroes/*.tsx` | The five hero components |
| `scripts/test-phase-11.1.mjs` | Acceptance suite (215 tests) |

Each renderer's old inline hero markup was replaced by a single
`<ThemeHero data={data} mode={mode} />` call; nothing else in the renderers
changed.

## Separation guarantees (enforced by tests)

- Distinct `data-hero-layout` token per theme.
- Hero background surfaces differ pairwise across all five.
- Headlines, descriptions and CTA label pairs differ pairwise.
- **No hero image is shared between any two themes** — the fallback image sets
  in `siteHero.ts` are disjoint, and a hero never repeats a visual within
  itself.
- Hero copy tables are namespaced and pairwise distinct in **both** locales.

## Responsive behaviour

Every hero renders the full contract on `desktop`, `tablet` and `mobile`, with
its own compact treatment (barber stacks the film strip, hair drops to a 2-col
contact sheet, spa centres its copy, family switches the action card to a
single column, nail collapses the shelf to 2 columns). Heroes stay
`overflow-hidden` so decorations never create horizontal scroll.

## Validation

```bash
npm run test:phase-11.1   # 215/215 — hero contract, uniqueness, EN/HI, light/dark, 3 viewports
npm run test:phase-10     # 1259/1259 — all Phase 10 suites still green
npm run lint              # 0 errors
node verify-22-screens.js # 25/25 verified
npm run build             # Vite + esbuild build succeeds
```

Phase 10 regression detail: 10.1 80/80 · 10.2 49/49 · 10.3 86/86 ·
10.4 118/118 · 10.5 56/56 · 10.6 102/102 · 10.7 66/66 · 10.8 36/36 ·
10.9 77/77 · 10.11 72/72 · 10.12 178/178 · 10.13 339/339.

## Guardrails honoured

- No hero layout copied between themes; no shared imagery or copy.
- Phase 10.1 header, Phase 10.2 Language + per-theme Dark Mode, and the
  Phase 10.3 canonical section order are all untouched and still verified.
- No database, migration, service or theme-data changes.
- Only Hero layouts were implemented in this phase.
