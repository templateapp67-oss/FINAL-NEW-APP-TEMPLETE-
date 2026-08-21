# Phase 7.4 Session 1 — Five-Theme Database-to-UI Read Connection

> **Status (2026-08-13): read-only UI connection implemented and verified
> locally; no remote/local Supabase database was modified. Session 1 stops here.**

## Scope preserved

No theme renderer, theme card, layout, color system, service card, custom-service
flow, Add Selected handler, or saved-service write flow was redesigned or
removed.

The preserved original `hair` / “Existing Theme” is still available exactly as
before. Phase 7.3 intentionally seeded only the five Phase 2–6 catalogs, so this
Session 1 database read connection applies exactly to:

- `barber_mens_grooming`
- `hair_studio_color_bar`
- `beauty_skin_spa`
- `family_full_service`
- `nail_lash_studio`

## Database read boundary

M19 adds:

```sql
public.get_theme_service_catalog(p_theme_id text) -> jsonb
```

The required stable theme ID is applied in SQL:

```sql
where themes.theme_id = p_theme_id
```

Categories and services are then joined only through that theme's UUID. The RPC
returns one payload containing:

- the selected active theme;
- only its categories;
- only its active predefined services;
- a separately queried suggested list requiring `is_suggested = true`.

The browser does not fetch all global theme/category/service rows and hide other
themes with frontend filtering. Function execution is granted to `anon` and
`authenticated`, while the underlying catalog remains read-only under the
existing RLS/grant model.

An unsupported ID, including the unseeded original `hair` ID, returns `NULL`.
The UI service calls this RPC only for the exact five seeded IDs.

## Predefined defaults

To preserve the existing dropdown content and form behavior while removing
static predefined reads for the five themes, the generated M18 seed now also
stores the existing curated defaults as:

- `default_price_paise`
- `default_duration_minutes`

These values remain defaults only. Saved salon services retain their editable
price/duration and are not changed.

## Frontend data service

`src/lib/themeCatalogService.ts` is the single browser read service for the five
catalogs. It:

1. calls only `get_theme_service_catalog` with `p_theme_id`;
2. validates that the returned theme equals the requested theme;
3. validates every category's database `theme_id`;
4. validates every predefined service's theme and category relationship;
5. validates every suggested row is a relationship to a returned canonical
   predefined service and has `is_suggested = true`;
6. maps integer paise/default duration into the existing UI model.

Cross-theme or malformed payloads fail closed instead of being filtered out in
the component.

## Step Services behavior

For the five seeded themes, `StepServices` now derives:

- category chips/select options from `catalog.categories`;
- the service combobox from `catalog.predefinedServices`;
- Suggested Services from `catalog.suggestedServices`;
- theme display name from `catalog.theme` after load.

The flow remains:

```text
Theme → Category → Predefined Service → auto-fill Name + Description
```

Existing price/duration defaults also continue to display and auto-fill from the
same database row, preserving the current UI.

## Stale-response protection

There is no catalog cache. On every theme switch:

- the loaded catalog is cleared before the request;
- category/suggestion/form state is reset;
- current arrays remain empty until the new theme response resolves;
- each request gets a monotonically increasing request ID;
- late responses are ignored;
- render-time identity checking requires
  `loadedCatalog.theme.themeId === currentTheme`.

Therefore a previous theme cannot render for one frame or repopulate the UI
when an older request resolves late.

## Explicitly deferred

Per Session 1 instructions, this change does **not** add or change:

- Add Selected persistence;
- saved-service database writes;
- custom/manual service logic;
- package logic;
- theme/template design.

## Verification

The migration suite now includes Test Q, which calls the RPC independently for
all five theme IDs and verifies exact categories, services, descriptions,
defaults, suggested labels, suggested relationships, and absence of cross-theme
IDs. The original/unrecognized IDs return `NULL`.

`npm run test:theme-catalog` adds four frontend/data-boundary checks:

- exact five database theme IDs;
- mandatory RPC name and `p_theme_id` on every request;
- fail-closed cross-theme payload validation;
- stale-response clearing/identity guards and no direct global table reads.

Verified result:

```text
Theme seed source check: M18 matches src/lib/themeServices.ts
Migration pass 1: 19/19 applied cleanly
Migration pass 2: 19/19 applied cleanly
Functional tests: 17/17 passed
Theme catalog UI tests: 4/4 passed
```

This remains draft/local verification. M01–M19 have not been applied to live
Supabase, and a configured Supabase project is required for browser runtime
catalog reads.
