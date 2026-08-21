# Phase 7.4 Session 3 — Final Integration and Validation

> **Status (2026-08-13): final five-theme read/save/manage/refresh integration
> implemented and locally verified; no remote/local Supabase database was
> modified. Phase 7.4 implementation stops here.**

## Theme-switch reset

The old in-memory `themeServiceSnapshots` architecture was removed. Every theme
switch now immediately clears active `services` and `packages`; no previous
snapshot can be restored.

`StepServices` also resets:

- Suggested selections and filter;
- selected category;
- selected predefined name;
- custom/predefined mode;
- name, description, price, and duration buffers;
- package buffers;
- open forms/dropdowns;
- loading/error/edit state;
- catalog and saved-service request identities.

For database themes, localStorage service rows are cleared before hydration.
Catalog and saved-service requests use independent monotonically increasing
request IDs and current-theme identity checks, so late old-theme responses
cannot render.

## Refresh persistence

M21 adds `get_saved_services_for_theme(p_theme_id)`. It derives the authenticated
single manageable tenant and returns only that tenant's saved rows for the exact
active database theme.

On Step Services mount or browser refresh:

1. stale local service rows are cleared;
2. the current theme catalog is fetched through M19;
3. current tenant saved services are fetched through M21;
4. returned tenant/theme/category/predefined IDs are validated;
5. local preview state is rebuilt from database rows.

Repeated reads do not insert anything, so refresh cannot create duplicates. The
M20 partial unique index remains the final Add Selected concurrency boundary.

The original `hair` / Existing Theme remains the preserved local/static theme
because it was intentionally outside the five-theme database seed.

## Tenant isolation

All management RPCs call the same M21 helper that derives:

```text
auth.uid()
  → active business_members owner_admin/manager
  → one active business
```

No read/edit/deactivate/delete request accepts a browser tenant ID. Every
operation also scopes by the derived `business_id`; another salon's service ID
returns a generic not-found-for-your-salon error. Existing RLS independently
blocks direct cross-salon update/delete attempts.

## Service management

M21 adds:

- `update_saved_service(...)`
- `set_saved_service_active(service_id, is_active)`
- `delete_saved_service(service_id)`

### Edit

Only mutable owner fields are accepted: name, description, price, and duration.
`business_id`, `theme_id`, `category_id`, and `predefined_service_id` are absent
from the SQL `SET` clause and cannot change.

### Deactivate

Only the salon's saved `services.status` changes between active/inactive. The
global `predefined_services.is_active` row is never touched or deleted.

### Delete

Only the authenticated tenant's `public.services` row is deleted. No M21
function issues an update/delete against `themes`, `service_categories`, or
`predefined_services`. Existing FK behavior still protects referenced service
rows where operational history requires it.

The existing service card design is retained; small edit/status actions reuse
the card action area. No theme/template renderer was redesigned.

## Final sequence validation

The final validation covers:

```text
Existing
→ Barber
→ Hair Studio
→ Beauty/Spa
→ Family
→ Nail/Lash
→ Existing
```

For the five database themes, Tests P–S and the frontend suites verify:

- exact categories, predefined services, and Suggested Services;
- zero-typing selection and Name/Description auto-fill source;
- current-visible Select All;
- idempotent Add Selected;
- exact saved theme/category/predefined relationships;
- no cross-theme or cross-salon data;
- duplicate-free refresh reads;
- edit relationship preservation;
- deactivate without global catalog deletion;
- tenant-only saved-service deletion;
- stale-response rejection across switches.

For Existing Theme, the sequence verifies it stays outside database RPC calls,
uses its preserved static catalog, and is cleared rather than receiving a stale
five-theme snapshot when selected again.

## Automated final command

```bash
npm run test:phase-7.4-final
```

This runs the complete migration suite plus theme-catalog and service-management
frontend boundaries.

Verified result:

```text
Theme seed source check: M18 matches src/lib/themeServices.ts
Migration pass 1: 21/21 applied cleanly
Migration pass 2: 21/21 applied cleanly
Functional tests: 19/19 passed
Theme catalog UI tests: 4/4 passed
Service saving tests: 6/6 passed
```

Additional verification: TypeScript lint, 25/25 screen checks, auth 14/14, and
production build pass. M01–M21 remain draft migrations pending live
introspection and separate execution approval.
