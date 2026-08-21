# Phase 11.2 — Hero Headline & Content (all 5 themes)

> Status: **COMPLETE** (2026-08-14, session `arena/019ffe18-new-tamplete-app`).
> Scope: hero **content** only. The Phase 11.1 hero layouts were not
> recreated; Header, Language, Dark Mode and the database/service
> architecture are untouched.

## Mandated headlines (rendered exactly)

| Theme | Headline | Focus advertised |
|---|---|---|
| Barber & Men's Grooming | **Sharp Cuts. Classic Grooming. Modern Confidence.** | Men's Haircuts · Beard Trim · Shave · Grooming Rituals |
| Hair Studio & Color Bar | **Luxury Hair. Signature Style. Beautifully You.** | Cut & Styling · Colour · Balayage · Hair Treatments |
| Beauty, Skin & Spa | **Relax. Refresh. Reveal Your Natural Glow.** | Facial · Skin Care · Spa · Wellness · Makeup |
| Full-Service Family Salon | **Beauty & Grooming for the Whole Family.** | Men · Women · Kids · Haircare · Combos |
| Nail & Lash Studio | **Nails, Lashes & Beauty Made to Stand Out.** | Nail Art · Gel · Lash · Brow · Mani/Pedi |

Headline line 1 and the theme accent line 2 are split across a `<br>` for each
theme's typography, but a real space is preserved in the text content so the
single `<h1>` reads as one sentence for SEO and screen readers.

> Barber and Hair Studio both list haircuts in the brief; the labels are
> phrased for their own audience ("Men's Haircuts" vs "Cut & Styling") so no
> badge string is literally shared between two themes.

## Per-theme content added

Each theme received its own **unique short description**, **theme-specific CTA
text**, **focus badges** and a **target-audience line**:

| Theme | Primary CTA | Secondary CTA | Audience line |
|---|---|---|---|
| Barber | Book Your Cut | See Grooming Menu | For men who want it done properly |
| Hair Studio | Book a Colour Consultation | View Colour Menu | For clients who want colour done with intent |
| Beauty/Spa | Book a Spa Ritual | Explore Treatments | For anyone who needs an unhurried hour |
| Family | Book a Family Slot | See Family Combos | For families booking together, every weekend |
| Nail & Lash | Book Your Nail & Lash Set | Browse the Art Wall | For anyone whose hands and eyes get photographed |

Badges render in each theme's **own** visual language — barber stencil
outlines, hair-studio numbered contents index, spa rounded petals, family
self-select pills, nail neon tags — reusing the Phase 11.1 layouts rather than
adding a new one.

## Hindi

All new content lives in the existing language system (`src/lib/siteHeroI18n.ts`,
read through `heroText(themeId, locale)`), so the Phase 10.2 header Language
control repaints headline, description, both CTAs, focus badges and the
audience line. Every Hindi string is a real translation (Devanagari), verified
per key by the test suite — no English fallbacks.

## Still editable from the existing data system

No new storage or schema. Owner content keeps priority:

- `data.tagline` → hero `<h1>` (theme accent line is appended).
- `data.about` → hero description.
- `data.services` → `heroFocusBadges()` narrows the badges to what the salon
  actually offers when the active catalog clearly covers part of the theme
  focus; archived/inactive services are ignored, and the full theme focus is
  shown when the owner has no services yet.

## Files changed

| File | Change |
|---|---|
| `src/lib/siteHeroI18n.ts` | Rewritten copy table: mandated headlines, unique descriptions, theme CTAs, new `focus` / `focusLabel` / `audience` keys, EN + HI |
| `src/lib/siteHero.ts` | New `heroFocusBadges()` helper |
| `src/components/heroes/*.tsx` | Render the focus badge row + audience line in each theme's existing layout; preserve the space across the headline break |
| `scripts/test-phase-11.2.mjs` | New content validation suite (138 tests) |

## Validation

```bash
npm run test:phase-11.2   # 138/138 — content, EN + HI, uniqueness, editability
npm run test:phase-11.1   # 215/215 — Phase 11.1 layouts unchanged
npm run test:phase-10     # 1259/1259 — Phase 10 chrome unchanged
npm run lint              # 0 errors
node verify-22-screens.js # 25/25
npm run build             # green
```

The 11.2 suite asserts: exact mandated headline per theme; unique description;
distinct CTA pair; focus badges matching that theme's brief and containing no
other theme's speciality; audience line; pairwise uniqueness of every content
field in **both** locales; no focus badge shared between themes; complete and
genuinely translated HI table; owner tagline/about/services still driving the
hero; and Phase 11.1 layout signatures plus the Phase 10.1 header intact.
