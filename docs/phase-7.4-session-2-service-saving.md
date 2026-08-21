# Phase 7.4 Session 2 — Save Services from Database

> **Status (2026-08-13): Add Selected saving implemented and verified locally;
> no remote/local Supabase database was modified. Session 2 stops here.**

## Scope

This session changes only the five-theme Suggested Services save integration.
It does not redesign themes or service UI, implement advanced edit/delete,
change package behavior, or convert/delete existing saved/custom services.

The preserved original `hair` / Existing Theme keeps its existing behavior.
Database saving applies to the five M18 catalogs only.

## Database idempotency

M20 adds a partial unique index:

```sql
unique (business_id, predefined_service_id)
where predefined_service_id is not null
```

This guarantees one saved row per salon/business and predefined service,
including concurrent/repeated Add Selected requests. The partial condition is
important: custom/manual services with `predefined_service_id NULL` remain
unrestricted and unchanged.

Before creating the index, M20 checks for pre-existing duplicate provenance. If
found, it fails closed with no deletion or automatic merge.

## Authenticated tenant ownership

M20 adds:

```sql
save_predefined_services(
  p_theme_id text,
  p_predefined_service_ids uuid[]
) -> jsonb
```

The RPC does not accept a browser-provided salon/business ID. It derives the
single manageable tenant from:

```text
auth.uid()
  → business_members (active owner_admin/manager)
  → active businesses
```

This reuses the same canonical authentication/membership relationship used by
service RLS. Missing authentication/membership and ambiguous multi-salon
ownership fail closed.

## Relationship validation

Before inserting anything, the transaction validates the complete selected ID
set against:

```text
requested theme_id
  → active theme
  → category under that theme
  → active predefined service under that exact theme/category
```

A cross-theme, inactive, missing, or incomplete predefined row rejects the
whole request. Saved rows preserve:

- derived `business_id` ownership;
- database `theme_id`;
- database `category_id`;
- `predefined_service_id`;
- canonical service name and category text;
- description;
- integer-paise default price;
- duration;
- `status = active` and feature state.

On duplicate conflict, M20 uses `DO NOTHING` and returns the existing row. It
does not overwrite owner-edited name, description, price, duration, category
text, or status.

## Frontend Add Selected

`src/lib/savedServiceService.ts` calls only the M20 RPC. It deduplicates the
selected ID array and validates returned tenant, theme, requested IDs, status,
price, and provenance before the UI accepts the result.

For the five database themes, `StepServices` now:

1. resolves checked chips only from the current
   `activeCatalog.suggestedServices` response;
2. sends canonical predefined UUIDs, not service names;
3. disables repeated clicks while a save is running;
4. maps returned saved rows into local preview state with
   `themeId/categoryId/predefinedServiceId/businessId/status` preserved;
5. prevents local duplicate rows by `predefinedServiceId`;
6. ignores an old save response after a theme switch.

Database uniqueness remains the final duplicate/concurrency boundary.

## Select All and custom services

`Select All` continues to operate on `visibleSuggested`, which is already the
current active database theme's `is_suggested=true` list and current category
filter. It never selects hidden rows from another theme.

Custom/Other creation does not call the predefined save RPC and explicitly
keeps:

```text
themeId = NULL
categoryId = NULL
predefinedServiceId = NULL
```

No existing custom row is deleted, linked, converted, or blocked by the partial
unique index.

## Explicitly deferred

- database-backed custom-service saving;
- advanced service edit/update;
- database delete/archive integration;
- package changes;
- theme/UI redesign.

## Verification

Migration Test R saves all six Suggested Services for each of the five themes
for Owner A (30 relationships), repeats every request including duplicate input
IDs, and confirms the row count remains 30. It also verifies:

- exact theme/category/predefined relationships;
- canonical values for newly inserted rows;
- preservation of a pre-existing owner-edited predefined row;
- custom row byte-for-byte preservation;
- cross-theme request rejection;
- direct duplicate rejection;
- the same predefined row can belong once to a different tenant;
- unauthenticated saving is rejected.

`npm run test:service-saving` adds four frontend/request-boundary checks for RPC
arguments, client tenant-ID exclusion, response validation, current visible
Select All behavior, local duplicate guards, and explicit custom NULL
provenance.

Verified result:

```text
Theme seed source check: M18 matches src/lib/themeServices.ts
Migration pass 1: 20/20 applied cleanly
Migration pass 2: 20/20 applied cleanly
Functional tests: 18/18 passed
Service saving tests: 4/4 passed
```

M01–M20 remain draft migrations and have not been applied to live Supabase.
