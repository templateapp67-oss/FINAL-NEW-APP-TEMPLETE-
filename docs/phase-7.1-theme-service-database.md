# Phase 7.1 — Theme Service Database Architecture

> **Status (2026-08-13): architecture implemented as draft migration M16 and
> verified locally; no remote/local Supabase database was modified.**

## Inspection result

Before adding schema objects, the tracked SQL, application data layer, and
frontend catalog were inspected.

- `public.services` already exists in the draft architecture. It is the
  business-owned catalog containing each salon's user-edited services, prices,
  durations, status, and booking relationships.
- `public.services` is **not equivalent** to a global predefined-service
  catalog. Reusing it would mix platform suggestions with salon data and could
  affect bookings, staff assignments, and published websites.
- No tracked migration defines `public.themes`, `public.service_categories`, or
  `public.predefined_services`.
- The existing theme/service suggestions are TypeScript constants in
  `src/lib/themeServices.ts`, not database records.
- This checkout has no configured Supabase URL/key or linked Supabase CLI
  project, so live-project introspection could not be performed. M02's existing
  fail-closed live-schema gate remains in place and must not be bypassed.

Therefore M16 adds the three missing global catalog tables while leaving
`public.services` and all existing salon/user data untouched.

## Implemented relationship

```text
public.themes
  id (uuid PK)
  theme_id (stable text ID, UNIQUE)
       |
       | service_categories.theme_id -> themes.id (RESTRICT)
       v
public.service_categories
  id (uuid PK)
  UNIQUE (id, theme_id)
       |
       | predefined_services.(category_id, theme_id)
       |   -> service_categories.(id, theme_id) (RESTRICT)
       v
public.predefined_services
```

`predefined_services.theme_id` also has a direct FK to `themes.id`. The
composite category FK is the database-level cross-theme guard: even when both a
theme and category exist, a service cannot pair Theme B with Theme A's category.
Changing/deleting referenced parents is restricted so catalog relationships
cannot silently move or disappear.

## Integrity and query design

- UUID primary keys use `gen_random_uuid()`.
- `themes.theme_id` is unique and non-blank.
- Category names are unique within a theme.
- Predefined-service names are unique within a theme.
- Names must be non-blank and sort orders must be non-negative.
- `ui_config` defaults to an empty JSON object and rejects arrays/scalars.
- `created_at`/`updated_at` are timezone-aware; dedicated triggers refresh
  `updated_at` on all three tables.
- Ordered lookup indexes cover active themes, category lists, category service
  lists, and suggested-service lists.
- All parent deletes use `RESTRICT`; there is no cascade into catalog data.

## Access model

The catalog is global platform-managed reference data, not tenant-owned data.
RLS is enabled on all three tables:

- `anon` and `authenticated` may select only active catalog content.
- Categories under inactive themes are hidden.
- Inactive predefined services and services under inactive themes are hidden.
- Client roles receive no insert/update/delete grants.
- `service_role` is the only role granted catalog mutation access.

This keeps browser clients read-only while allowing a trusted future seed/admin
flow.

## Data safety and seeding

M16 contains **no `INSERT`, `UPDATE`, `DELETE`, table rename, or table drop**.
It does not seed the complete five-theme dataset. In particular, it does not
read, copy, modify, or delete rows from `public.services`, bookings, staff,
salons, or businesses.

The migration is wrapped in one PostgreSQL transaction and is replay-safe for
the clean target schema. Supabase migrations do not provide automatic down
migrations; a destructive drop-based rollback is intentionally not shipped,
because it would become unsafe once catalog data exists. Pre-apply backup and
transaction rollback remain required in the eventual deployment runbook.

## Verification

`npm run validate:migrations` now applies M01–M16 twice in PGlite and runs 14
functional tests. Phase 7.1 adds:

- **Test M:** confirms the migration seeds zero rows; valid relationships work;
  orphan categories, cross-theme services, and duplicate stable theme IDs are
  rejected; timestamps refresh; existing business-service row count is
  unchanged.
- **Test N:** confirms anonymous clients see only active themes/categories/
  predefined services and cannot mutate catalog tables.

Verified result on 2026-08-13:

```text
Migration pass 1: 16/16 applied cleanly
Migration pass 2: 16/16 applied cleanly
Functional tests: 14/14 passed
```

This is local architecture verification, not proof of live-schema compatibility.
Before remote application, perform read-only live introspection, compare any
existing equivalent objects and data, regenerate M02 as required, take a
recoverable backup, and obtain explicit migration-execution approval.
