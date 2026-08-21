# Phase 7.3 — Five-Theme Catalog Seed

> **Status (2026-08-13): M18 generated from the existing Phase 2–6 application
> datasets and verified locally; no remote/local Supabase database was modified.**

## Pre-seed check

Before implementing the seed, the Phase 7.2 migration suite was run unchanged:

```text
Migration pass 1: 17/17 applied cleanly
Migration pass 2: 17/17 applied cleanly
Functional tests: 15/15 passed
```

## Exact source

The seed is generated from the existing catalog constants in
`src/lib/themeServices.ts`:

- `THEME_LABELS`
- `THEME_CATEGORIES`
- `SERVICES_BY_THEME`
- `SUGGESTED_SERVICE_NAMES`
- `SUGGESTED_SERVICE_ALIASES`
- each theme's existing UI token object

`scripts/generate-theme-seed.mts` produces M18 deterministically. The migration
validator first runs the generator in `--check` mode, so validation fails if the
SQL ever drifts from the application datasets. Dataset rows in M18 should not be
hand-edited.

## Seeded themes

M18 seeds only these five stable IDs, in this order:

1. `barber_mens_grooming`
2. `hair_studio_color_bar`
3. `beauty_skin_spa`
4. `family_full_service`
5. `nail_lash_studio`

The older `hair` catalog is intentionally not seeded by Phase 7.3.

Each theme receives its application label, template-card description, target
audience, active state, display order, and exact existing visual tokens in
`ui_config`.

## Seed totals

| Theme | Categories | Predefined services | Suggested |
|---|---:|---:|---:|
| Barber & Men's Grooming | 3 | 15 | 6 |
| Hair Studio & Color Bar | 3 | 17 | 6 |
| Beauty, Skin & Spa | 4 | 18 | 6 |
| Full-Service Family Salon | 4 | 15 | 6 |
| Nail & Lash Studio | 3 | 13 | 6 |
| **Total** | **17** | **78** | **30** |

Category and predefined-service `sort_order` values follow their exact array
positions in the Phase 2–6 source datasets. The generated rows also preserve
existing curated price/duration defaults as integer `default_price_paise` and
`default_duration_minutes` values for the unchanged onboarding UI; saved salon
services remain independently editable.

## Suggested-service relationship and aliases

Suggested services are not inserted as separate global service text. Each is
the canonical `predefined_services` row with:

- `is_suggested = true`
- `suggested_label` containing the exact customer-facing chip text
- `suggested_sort_order` containing the exact suggested-list position

This preserves aliases without duplicating predefined services. Examples:

- `Beard Sculpting` → `Beard Sculpting & Lineup`
- `Hot Towel Shave` → `Hot Towel Classic Shave`
- `Hair & Beard Combo` → `Executive Beard & Hair Combo`
- `Charcoal Face Mask` → `Charcoal Face Detox`
- `Signature Haircut` → `Signature Cut & Blowdry`
- `Balayage` → `Balayage / Ombre`
- `De-Tan Pack` → `De-Tan Brightening`
- `Deep Cleansing Facial` → `Facial`
- `Acrylic Extensions` → `Acrylic Nail Extensions`
- `Classic Lash Extensions` → `Eyelash Extensions (Classic/Volume)`
- `Nail Art Per Nail` → `Chrome Nail Art`

Labels that already equal their canonical name are stored through the same
predefined row and relationship.

## Idempotency and safety

- Themes upsert on unique `themes.theme_id`.
- Categories upsert on unique `(theme_id, name)`.
- Predefined services upsert on unique `(theme_id, name)`.
- Existing IDs are retained on conflict; category/service relationships and
  mutable seed metadata are refreshed to the exact source values.
- Replaying M18 creates no duplicate theme, category, or predefined-service
  rows.
- No saved salon/user `public.services` row is inserted, updated, matched, or
  deleted.
- The migration does not delete unrelated pre-existing catalog rows; clean
  schema validation proves that this seed itself creates exactly the requested
  five themes.

M18 also adds validated, replay-safe metadata support for theme order and
suggested label/order, plus indexes for ordered active-theme and suggested-list
queries.

## Verification

`npm run validate:migrations` now:

1. confirms M18 exactly matches `src/lib/themeServices.ts`;
2. applies all M01–M18 migrations twice;
3. runs tests A–P in PGlite.

Test P compares every seeded category and all 78 predefined service names,
descriptions, category links, sort orders, active flags, suggested flags,
suggested labels, and suggested orders directly against the TypeScript source.
It also verifies the exact five theme IDs and duplicate-free totals.

Verified result:

```text
Theme seed source check: M18 matches src/lib/themeServices.ts
Migration pass 1: 18/18 applied cleanly
Migration pass 2: 18/18 applied cleanly
Functional tests: 16/16 passed
```

This is local draft verification only. M01–M18 have not been applied to live
Supabase; M02 live introspection and separate execution approval remain required.
