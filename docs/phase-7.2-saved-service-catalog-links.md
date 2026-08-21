# Phase 7.2 — Saved Service Catalog Links

> **Status (2026-08-13): draft migration M17 implemented and verified locally;
> no remote/local Supabase database was modified.**

## Pre-change migration check

The required baseline check was run before changing the schema:

```text
Migration pass 1: 16/16 applied cleanly
Migration pass 2: 16/16 applied cleanly
Functional tests: 14/14 passed
```

## Existing saved-service inspection

The tracked saved salon/user service table is `public.services`, created by M04.
It is already the business-owned service source of truth and contains:

- `business_id → public.businesses(id)` with `ON DELETE RESTRICT`;
- `name` and legacy/display `category` text;
- `price_paise` and `duration_minutes`;
- `short_description`;
- `is_featured`, catalog `status`, and `display_order`;
- creation/update timestamps.

Existing services are referenced by package composition, staff assignments,
bookings, booking holds, availability functions, public website rendering, and
RLS policies. M17 therefore extends this table in place rather than creating a
second saved-service table or changing ownership.

This checkout still has no linked Supabase project or live credentials. The
inspection above covers the tracked schema only; remote execution remains
blocked behind M02 and read-only live introspection.

## Safe extension

M17 adds three nullable UUID columns to `public.services`:

- `theme_id`
- `category_id`
- `predefined_service_id`

They are nullable by design. Existing custom/manual rows receive no inferred
catalog relationship and preserve every existing value. The migration does not
match rows by service/category names because those names are editable and an
automatic match could create incorrect provenance.

The normalized relationship is:

```text
themes
  └─ service_categories
       └─ predefined_services
            └─ services (saved salon/user service)
```

`services.category` remains intact as owner-facing legacy/display text;
`services.category_id` is optional normalized provenance. Likewise, saved name,
description, price, duration, feature/status fields, and `business_id` remain
owned by the saved service and are not overwritten from the predefined row.

## Cross-theme/category enforcement

M17 adds these database guards:

1. `services.theme_id → themes.id`
2. `services.(category_id, theme_id) → service_categories.(id, theme_id)`
3. `services.(predefined_service_id, theme_id, category_id) →
   predefined_services.(id, theme_id, category_id)`

The third composite FK proves both required invariants on insert and update:

- `saved_service.theme_id = predefined_service.theme_id`
- `saved_service.category_id = predefined_service.category_id`

Check constraints require theme/category whenever `predefined_service_id` is
present. A manual service may keep all provenance columns `NULL`, and may also
store only a valid theme or valid theme/category when it is not based on a
predefined service.

All catalog parent deletes use `RESTRICT`, so a source theme/category/predefined
row cannot disappear while a saved service references it. Catalog deactivation
remains allowed, preserving historical provenance.

## Migration safety

- Columns are added with `ADD COLUMN IF NOT EXISTS` and no `NOT NULL` backfill.
- Constraints are created idempotently.
- New checks/FKs are added `NOT VALID`, then explicitly validated inside the
  same transaction.
- If pre-existing provenance data is incompatible, validation fails closed and
  the transaction rolls back—no data is deleted or silently repaired.
- No unique `(business_id, predefined_service_id)` rule is imposed, avoiding a
  new behavior restriction on existing owners/workflows.
- Focused indexes support business/theme listings and FK parent checks.
- Existing RLS policies and `business_id` ownership isolation remain unchanged.

Supabase has no automatic down migrations. A destructive drop-based rollback is
not included because removing provenance columns after use could lose data. The
migration is transactional and must be preceded by a recoverable backup during
the eventual approved deployment.

## Verification

`npm run validate:migrations` now applies M01–M17 twice. New Test O verifies:

- existing saved rows remain present with nullable provenance;
- valid predefined saves preserve theme/category/predefined IDs plus owner,
  name, display category, description, price, duration, feature, status, order;
- custom/manual services remain valid and unlinked;
- wrong-theme, wrong-category, incomplete, and invalid update relationships are
  rejected;
- referenced predefined rows cannot be deleted;
- existing cross-business RLS ownership remains intact.

Verified result:

```text
Migration pass 1: 17/17 applied cleanly
Migration pass 2: 17/17 applied cleanly
Functional tests: 15/15 passed
```

This remains local draft verification. No M01–M17 migration has been applied to
live Supabase.
