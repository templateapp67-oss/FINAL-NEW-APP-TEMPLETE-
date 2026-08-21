# Phase 10.3 — Responsive Website Structure (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffa99-new-tamplete-app`).
> Scope: one canonical public-website section order + responsive layout
> fixes. Header, Language and Dark Mode from 10.1 / 10.2 are untouched
> (except a structural `data-site-section="header"` mark on the existing
> header element). No database or service/theme-data changes.

## Canonical section order (all themes)

```
Announcement / Offer Bar
→ Header
→ Hero
→ Trust / Stats
→ Featured Services
→ All Services
→ Offers & Combos
→ Gallery / Before-After
→ Videos / Reels
→ About Salon
→ Owner / Founder
→ Meet the Staff
→ Testimonials / Reviews
→ Location + Contact
→ Final Booking CTA
→ Footer
```

Marked on the DOM as `data-site-section` so tests (and future work) can
assert order without depending on theme-specific copy. Existing nav
targets from Phase 10.1 (`section-hero`, `section-services`,
`section-offers` / `section-combos` / `section-service-menu`,
`section-gallery`, `section-social`, `section-owner` / `section-about`,
`section-team`, `section-contact`) are preserved.

## What changed

| File | Role |
|------|------|
| `src/lib/siteStructure.ts` | Canonical order, ids, viewport helpers, featured/offer pickers, loading/empty/error resolver |
| `src/lib/siteStructureI18n.ts` | New 10.3 copy only (announcement, trust, featured, booking, empty/error). Phase 10.2 `siteI18n.ts` is not rewritten |
| `src/components/SiteSectionStates.tsx` | Shared loading / empty / error panels + final booking CTA |
| Five theme renderers | Reordered to the canonical list; missing Videos (Family, Nail) and Owner (Family, Nail) added in each theme's own visual language |
| `src/index.css` | `overflow-x` containment, section scroll-margin, 44px touch targets |
| `src/screens/StepFullWebsitePreview.tsx` | Desktop / Tablet / Mobile preview toggle |

## Rules honoured

- Same section order on all five themes.
- Each theme keeps its visual identity (barber gold slab, hair editorial,
  spa pills, family navy/sky, nail pink/plum). Theme-specific extras
  (color showcase, spa rituals, men/women/kids menus, nail-art wall)
  stay as identity, not as extra canonical sections.
- Owner + Staff stay near the end (after About, before Reviews).
- Gallery always appears before Videos.
- Videos exist in all five themes, including an empty state when the
  salon has no reels.
- No duplicated canonical sections.
- Dynamic sections expose `data-section-state="loading|empty|error|ready"`.
- No horizontal overflow on the site scroller; grids adapt
  desktop / tablet / mobile; images use `object-cover` + `max-width: 100%`.
- Sticky header does not cover in-page targets (`scroll-margin-top`).
- Booking CTA remains last-before-footer and scrolls to `section-contact`.

## Validation

```bash
npm run test:phase-10.3   # 86/86 — order + states + 3 viewports × 5 themes
npm run test:phase-10.1   # 80/80 — header regression intact
npm run test:phase-10.2   # 49/49 — EN/HI + dark mode intact
npm run lint              # 0 errors
```
