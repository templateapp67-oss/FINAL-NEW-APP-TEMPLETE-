# Phase 8.1 — Saved Service Management

> Status: **complete** (draft SQL; M22 is **not applied** to any database).
> Scope: the saved-service management workflow for the five database themes.
> No theme was redesigned and no unrelated functionality was modified.

## What this phase delivers

| Operation | Where | Backed by |
|-----------|-------|-----------|
| Add Service | Step 05 → "Add Service" form | `create_saved_service` |
| Edit Service | Service card → pencil → edit panel | `update_saved_service` |
| Delete Service | Service card → trash → confirm | `delete_saved_service` |
| Activate / Deactivate | Service card → power toggle | `set_saved_service_active` |
| Update Price | Edit panel → Price "Update" | `update_saved_service` (price only) |
| Update Duration | Edit panel → Duration "Update" | `update_saved_service` (duration only) |
| Update Description | Edit panel → "Update description" | `update_saved_service` (description only) |
| Change service status | Edit panel → Status select (active / inactive / archived) | `set_saved_service_status` |

All eight work on all five themes: **Barber**, **Hair Studio**, **Beauty/Spa**,
**Family**, **Nail/Lash**.

## Relationship preservation (the core guarantee)

`public.services` stores three provenance columns from Phase 7.2 (M17):
`theme_id`, `category_id`, `predefined_service_id`.

**They are unreachable from any edit path.** This is enforced at three layers:

1. **SQL** — `update_saved_service`, `set_saved_service_status` and
   `set_saved_service_active` have no relationship column in their `SET` list
   and no relationship parameter in their signature. There is literally no
   argument through which a client could request a provenance change.
2. **Client** — `SavedServiceChanges` only exposes
   `name | description | price | duration | status`. `SavedService.themeId`,
   `categoryId` and `predefinedServiceId` are read-only outputs.
3. **UI** — the edit panel renders only the mutable fields, and shows the linked
   catalog/category as static text.

Direct `UPDATE`s remain blocked for other tenants by the existing M12 RLS
policies, and the M17 composite foreign keys still reject any cross-theme
provenance tuple even for `service_role`.

`update_saved_service` uses **patch semantics**: a `NULL` argument keeps the
stored value. That is what makes "update price only" possible without the client
having to resend (and risk clobbering) the other fields.

## Custom Service / Other

* `create_saved_service` takes `p_predefined_service_id` explicitly. The UI
  passes `null` whenever the owner is in Custom mode, and clears any previously
  matched predefined ID when the category changes or the name is retyped.
* Provenance is **never inferred from the service name**. A predefined link is
  kept only when the picked row's `id` still belongs to the currently selected
  category of the current theme; otherwise the service is saved as custom.
* Editing a custom service can never give it a predefined link — the edit RPC
  cannot write that column at all.
* Duplicating a service always produces a **new custom** row
  (`predefined_service_id NULL`), so the original predefined link stays unique
  to the original saved service.
* Legacy/manual rows with `theme_id NULL` are untouched and out of scope of the
  new uniqueness index.

## Delete safety

`delete_saved_service`:

* resolves the tenant from `auth.uid()` and deletes only
  `public.services WHERE id = $1 AND business_id = <tenant>`;
* **never** targets `themes`, `service_categories` or `predefined_services` —
  those names do not appear in any delete statement in the codebase;
* refuses to delete a service that is still part of one of the salon's packages
  (readable error instead of an FK crash);
* cleans up only the salon's own `staff_services` assignment links so the
  `RESTRICT` FK cannot block a legitimate owner delete;
* leaves the global predefined row active and immediately re-addable.

The UI adds an inline confirmation step for saved services that states the
theme's predefined service stays available.

## Duplicate prevention

| Case | Guard |
|------|-------|
| Same predefined service saved twice | M20 partial unique index `(business_id, predefined_service_id)` + explicit pre-check with a readable message |
| Same custom name twice in one theme | M22 partial unique index on `(business_id, theme_id, lower(btrim(name)))` where `predefined_service_id IS NULL AND theme_id IS NOT NULL AND status <> 'archived'` |
| Custom name colliding with a saved predefined service name | Case-insensitive name check inside `create_saved_service` |
| Rename collision | Same check inside `update_saved_service` |
| Repeated "Add Selected" | Unchanged M20 `ON CONFLICT DO NOTHING` |
| Optimistic client duplicates | Pre-flight check in `StepServices` before the request |

Archived rows are excluded from the custom-name index so an owner can re-create
a service they previously retired. M22 opens with a fail-closed preflight that
raises rather than deleting or merging pre-existing duplicates.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260813000701_m22_saved_service_management.sql` | **new** — M22: add/edit/status/delete RPCs, patch semantics, custom-name uniqueness |
| `src/lib/savedServiceService.ts` | `createSavedService`, `setSavedServiceStatus`, price/duration/description helpers, nullable `predefinedServiceId`, readable RPC errors |
| `src/screens/StepServices.tsx` | Add Service persists to the DB with explicit provenance; edit panel gains status + per-field updates; delete confirmation; Custom/Archived badges |
| `scripts/validate-migrations.mjs` | Test **T** — full management across all five themes |
| `scripts/test-service-saving.mjs` | 5 new Phase 8.1 request-boundary tests (6 → 11) |
| `scripts/test-service-management-e2e.mjs` | **new** — real client library against real PostgreSQL |
| `scripts/test-auth-modal.mjs` | migration count 21 → 22 |
| `package.json` | `test:service-management`, `test:phase-8.1` |

## Validation

```bash
npm run lint                     # 0 errors
npm run test:phase-8.1           # full Phase 8.1 suite
node verify-22-screens.js        # 25/25
npm run test:auth                # 14/14
npm run build                    # clean
```

Results:

* `validate:migrations` — M18 source check, **22/22 applied cleanly ×2**, **20/20** functional tests (A–T)
* `test:theme-catalog` — 4/4
* `test:service-saving` — 11/11
* `test:service-management` — 9/9 (5 themes + 4 safety tests)
* `test:auth` — 14/14
* `verify-22-screens` — 25/25

### What the E2E test actually exercises

`scripts/test-service-management-e2e.mjs` is not a mock test. It applies all 22
migrations to a real PostgreSQL (PGlite), seeds two tenants, and drives the real
`src/lib/savedServiceService.ts` + `src/lib/themeCatalogService.ts` through a
supabase-js-shaped adapter that executes each RPC as the signed-in
`authenticated` role with RLS on. For every theme it asserts add (predefined and
custom), duplicate rejection, price/duration/description/status edits,
activate/deactivate, refresh idempotency, delete, and re-add — then verifies a
hash of the entire global catalog is byte-identical before and after.

## Not changed

* No theme was redesigned; no renderer, layout, or styling was modified.
* The preserved `hair` / Existing Theme keeps its original in-memory behavior —
  Add Service there still creates a local row exactly as before.
* Packages, staff, bookings, payments, AI copy and the dashboard service drawer
  are untouched.
* No migration has been applied to any database. M02 must still be regenerated
  after read-only live introspection before any execution.
