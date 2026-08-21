# Phase 10.1 — Global Header & Navigation (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffa2e-new-tamplete-app`).
> Scope: **header + navigation only**. No database changes. No changes to
> service/offer/bundle/locale-data behavior.

## Canonical header order (all themes)

```
Logo / Salon Name → Home → Services → Offers → Gallery → Videos → About
→ Team → Contact → Language → Dark Mode → Book Appointment
```

The structure is defined once in `src/lib/siteNavigation.ts`
(`SITE_NAV_KEYS`, `SITE_NAV_LABELS` in English + हिन्दी,
`buildSiteNavItems(themeId, data)`). Every theme renders the same ordered
structure; **only the visual design differs per theme**.

## Files

| File | What it is |
|------|-----------|
| `src/lib/siteNavigation.ts` | Theme-agnostic nav model: fixed order, EN/HI labels, per-theme section targets, data-driven visibility rules, smooth-scroll helper, locale/appearance preference stores + `window` events |
| `src/components/SiteHeader.tsx` | The interactive header: shared behavior (active link, smooth scroll, Escape/backdrop-free drawer, aria state) + **five separate design objects** (barber, hair studio, beauty spa, family, nail & lash), each with its own bar, brand lockup, link, language, dark-toggle, CTA and mobile-drawer styling |
| `scripts/test-phase-10.1.mjs` | 80 assertions mounting the REAL renderers in jsdom, desktop + mobile |
| Renderers (5) | One-line swap of each old inline nav block → `<SiteHeader themeId=… data={data} mode={mode} />`; locale reads upgraded to the live `useSiteLocale()` hook; `id="section-offers"` anchors added to the packages blocks of barber/hair/beauty |

## Per-theme designs (not one copied header)

| Theme | Header design |
|-------|---------------|
| `barber_mens_grooming` | Near-black slab, **2px gold bottom border**, square gold-outlined Scissors mark, font-black small-caps links with gold underline for the active item, solid-gold square CTA; mobile drawer = numbered "price-board" rows. **Dark by design** — the toggle reveals a cream day-shift variant. |
| `hair_studio_color_bar` | Warm-paper bar with a single hairline rule, serif salon name, hairline-underline links in muted ink (rose-gold active), *outline* rose CTA, text-segment language switch; drawer = hairline-separated editorial list with italic serif indices. |
| `beauty_skin_spa` | **Floating rounded-full pill** (`top-2`, soft shadow), emerald-soft Leaf circle brand, pill-wash link hover, segmented soft-pill language control, emerald pill CTA; drawer = rounded-3xl sheet with centered pill rows. |
| `family_full_service` | Navy **utility strip** ("Easy bookings for every generation") kept above a bright white wayfinding bar; extrabold links in rounded-lg sky-blue washes, blue rounded-xl CTA with arrow; drawer = card rows with chevrons. Dark variant = deep-navy bar with sun-yellow toggle. |
| `nail_lash_studio` | Pink flash strip kept above a cream bar; ink Sparkles tile brand with pink "Nail · Lash · Brow" eyebrow, rounded-full pink-soft hovers, **pink gradient pill CTA**; drawer = blush card rows with sparkle accents. |

Dark-mode variant of the bar, drawer, language control, toggle and CTA is
designed per theme (verified pairwise-distinct in tests).

## Behavior

- **Responsive**: desktop mode renders the full inline nav; mobile mode
  renders the brand + a dark-mode toggle + hamburger that opens a full-width
  drawer containing the same ordered nav, a Language row, a Dark Mode row and
  a full-width Book Appointment CTA (always last). Escape or choosing an item
  closes the drawer. Mode follows the renderers' existing `mode` prop (the
  codebase's preview-viewport mechanism), so it works inside the phone frame.
- **Navigation** smooth-scrolls to the real section ids each theme already
  renders; offers targets `section-offers` (packages blocks) / `section-combos`
  / `section-service-menu`; data-dependent links (Gallery/Videos/About/Team)
  appear only when the underlying section renders — same conditions the
  renderers already used. Family and Nail & Lash have no social-videos section
  in their designs, so `Videos` is omitted there (structure still canonical).
- **Language** uses the existing `nexora_locale` store (`en`/`hi`): instant
  header label switch (incl. Hindi Book CTA), persisted, and a
  `nexora:site-locale` event — renderers subscribe via `useSiteLocale()`, so
  localized service name/description content repaints live.
- **Dark Mode** is a real, persisted visitor preference
  (`nexora_site_appearance`) that switches the header chrome between each
  theme's designed light/dark variants and broadcasts
  `nexora:site-appearance` for later section-level phases. The five themes
  ignore the legacy `websiteAppearance` field (unchanged pre-existing
  behavior) — the barber theme remains dark by default.
- **Book Appointment** always scrolls to `section-contact`.

`TemplateRenderer` routing is unchanged; the wizard's step-aware inline
preview (`PreviewPane`), booking flow, staff module and all service/offer
logic are untouched.

## Validation

```bash
npm run test:phase-10.1      # 80/80 — all five themes, desktop + mobile
npm run lint                 # 0 errors
node verify-22-screens.js    # 25/25
npm run build                # vite + esbuild green
npm run test:acceptance      # 66/66 data-level Phase 8.3 (proves services untouched)
```

`npm run test:acceptance-ui` currently shows one failure
("zero-typing auto-fill") **that reproduces identically at the base commit
`1e8daaf` without any Phase 10.1 changes** — a pre-existing, environment/timing
sensitive flake in that suite, not a regression from this phase.
