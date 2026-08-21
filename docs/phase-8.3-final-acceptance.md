# Phase 8.3 — Final 5-Theme Acceptance Test

> Status: **PASSED — Phase 8 complete.**
> 94 acceptance tests across all five themes, plus 67 retained regression tests.
> No cross-theme, cross-salon, or data-persistence issues remain.

## How this was tested

The acceptance suite runs against the **real stack**, not mocks:

| Layer | What actually runs |
|---|---|
| Database | Real PostgreSQL (PGlite) with the complete **M01–M23** migration set and the exact Phase 7.3 seed |
| Client | The real **`@supabase/supabase-js`** browser client — its HTTP layer is redirected into PGlite, so `supabaseClient.ts`, `themeCatalogService.ts` and `savedServiceService.ts` run **unmodified** |
| UI | The real **`StepServices`** React component mounted in jsdom, driven by genuine DOM clicks, focus and typing |
| Auth | Real `auth.uid()` + RLS, with each request executed as the signed-in `authenticated` role |

Two suites:

* `scripts/test-phase-8.3-acceptance.mjs` — **66 tests**, data & integration
* `scripts/test-phase-8.3-ui.mjs` — **28 tests**, rendered UI & interaction

```bash
npm run test:phase-8.3   # both acceptance suites
npm run test:phase-8     # every Phase 7–8 suite (161 tests)
```

## 1. Tests passed

### Per-theme matrix — 12 data tests × 5 themes = 60, all passed

| Checkpoint | Barber | Hair Studio | Beauty/Spa | Family | Nail/Lash |
|---|:--:|:--:|:--:|:--:|:--:|
| Correct UI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Correct `theme_id` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Correct categories | ✅ 3 | ✅ 3 | ✅ 4 | ✅ 4 | ✅ 3 |
| Correct predefined services | ✅ 15 | ✅ 17 | ✅ 18 | ✅ 15 | ✅ 13 |
| Correct Suggested Services | ✅ 6 | ✅ 6 | ✅ 6 | ✅ 6 | ✅ 6 |
| Zero-typing selection | ✅ | ✅ | ✅ | ✅ | ✅ |
| Name auto-fill | ✅ | ✅ | ✅ | ✅ | ✅ |
| Description auto-fill | ✅ | ✅ | ✅ | ✅ | ✅ |
| Select All | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add Selected | ✅ | ✅ | ✅ | ✅ | ✅ |
| Price | ✅ | ✅ | ✅ | ✅ | ✅ |
| Duration | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit | ✅ | ✅ | ✅ | ✅ | ✅ |
| Activate/Deactivate | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete | ✅ | ✅ | ✅ | ✅ | ✅ |
| Duplicate prevention | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom Service / Other | ✅ | ✅ | ✅ | ✅ | ✅ |

Category and service names were asserted **field-by-field** against
`src/lib/themeServices.ts`, so the database and the application source are
proven identical rather than merely counted.

### Per-theme UI matrix — 5 tests × 5 themes = 25, all passed

For each theme, in the actual rendered DOM:

* the header reads **"Suggested for {theme label}"**;
* category filter chips are exactly `All` + that theme's categories;
* exactly the six correct suggested chips render, in order;
* **Select All → Add Selected (6)** saves and the list becomes `MY SERVICES (6)`, verified against the database;
* **zero-typing**: focus the combobox → click a predefined row → name, description, price and duration all auto-fill;
* **Other / Custom Service** saves with `predefined_service_id = NULL`;
* saved rows show price, duration, the 25% advance line, and Edit / Activate / Delete actions.

### Theme switching — the full 12-step sequence

`Existing → Barber → Hair Studio → Beauty → Family → Nail/Lash → Barber → Hair Studio → Beauty → Family → Nail/Lash → Existing`

Verified at **every** step, in both the data layer and the rendered DOM:

| Requirement | Result |
|---|---|
| No previous selections remain | ✅ `Add Selected (0)` and disabled after every switch |
| No wrong Suggested Services appear | ✅ chips deep-equal the new theme's six |
| No wrong categories appear | ✅ filters deep-equal `All` + new theme's categories |
| No wrong services appear | ✅ list count matches the database for that theme |
| No stale cache/state appears | ✅ repeat visits are byte-identical; filter resets to `All`; add-service form closes |

The second pass through all five themes proves there is **no accumulation or
cache drift** on revisit. The Existing (`hair`) theme still renders its local
in-memory services and writes nothing to the database.

### Refresh, relationships, isolation, preservation

| Test | Result |
|---|---|
| Refresh after saving | ✅ 3 consecutive reloads are byte-identical; row counts unchanged (reads never insert) |
| Database relationships | ✅ 0 broken chains, 0 mismatched categories, 0 orphans |
| Tenant isolation | ✅ Owner B sees only their own rows; cannot edit/delete/re-status Owner A's; both tenants can independently save the same predefined service |
| Existing data intact | ✅ the pre-existing NULL-provenance row is byte-identical; catalog still 5/17/78/30 with nothing deactivated |
| Stale-row protection | ✅ mounting with a stale local row never renders it — the DB hydrate wins |

## 2. Tests failed / fixed

Two failures occurred **in the test harness**, not the application. Both were
fixed at the root cause and the affected tests re-run and passed.

**(a) BigInt vs Number assertion.** `price_paise` is a PostgreSQL `bigint`, so
the driver returns `88000n`; my expected literal was `88000`. Fixed by coercing
with `Number(...)` before comparing. *This confirmed correct behaviour — the
stored value was right all along.*

**(b) UI suite never exited.** The process hung after printing `28/28 passed`.
Rather than paper over it with a timeout, I traced it:

* instrumented `requestAnimationFrame` → **83 calls during a 400 ms idle**, i.e. `motion` runs a continuous animation loop under jsdom (0 after `cleanup()`);
* dumped `process.getActiveResourcesInfo()` at each stage → PGlite leaves a `MessagePort` (worker) handle referenced after `close()`.

Both keep Node's event loop alive after the suite finishes. Fixed with an
explicit `dom.window.close()` and `process.exit(results.failed > 0 ? 1 : 0)`
once every assertion has completed. Runtime went from a 200 s timeout to **16 s
with a correct exit code** — so CI reports real pass/fail instead of hanging.

**No application defect was found in Phase 8.3.** All five themes passed on the
first execution of every product assertion.

## 3. Remaining issues

None blocking. Three standing notes, unchanged from earlier phases:

1. **Migrations remain drafts.** M01–M23 have never been applied to a live
   database. M02 is still a fail-closed preflight and must be regenerated after
   read-only introspection before any apply.
2. **M23's provenance trigger assumes clean existing data.** It makes
   provenance immutable; if live data already contains a cross-theme tuple, that
   row would need reconciling (never deleting) before the migration is applied.
   Worth checking during introspection.
3. **Browser-level E2E is not automated.** Playwright's Chromium download is
   blocked in this sandbox, so UI verification uses jsdom with the real
   component. This covers logic, data binding and interaction, but not visual
   rendering or CSS.

## 4. Database relationship status

**Healthy — zero integrity violations.**

```
themes 5 · service_categories 17 · predefined_services 78 · suggested 30
broken provenance chains ......... 0
category/theme mismatches ........ 0
orphaned references .............. 0
duplicate predefined links ....... 0
inactive themes / services ....... 0 / 0
```

* Every saved row with a `predefined_service_id` resolves to a predefined
  service whose `theme_id` **and** `category_id` match the saved row exactly,
  under an active theme.
* Custom / "Other" services keep `predefined_service_id = NULL` and are never
  converted.
* Provenance survived every edit, status change and refresh, and is immutable
  after creation (M23).
* Deleting a saved service never touched a global catalog row.

## 5. Five-theme integration status

**COMPLETE — all five themes pass end-to-end.**

| Theme | `theme_id` | Cats | Services | Suggested | Workflow | Isolation |
|---|---|:--:|:--:|:--:|:--:|:--:|
| Barber & Men's Grooming | `barber_mens_grooming` | 3 | 15 | 6 | ✅ | ✅ |
| Hair Studio & Color Bar | `hair_studio_color_bar` | 3 | 17 | 6 | ✅ | ✅ |
| Beauty, Skin & Spa | `beauty_skin_spa` | 4 | 18 | 6 | ✅ | ✅ |
| Full-Service Family Salon | `family_full_service` | 4 | 15 | 6 | ✅ | ✅ |
| Nail & Lash Studio | `nail_lash_studio` | 3 | 13 | 6 | ✅ | ✅ |

The preserved **Existing** (`hair`) theme is unchanged and still operates purely
in memory, exactly as before Phase 7.

## Full suite results

```
validate:migrations ........ 23/23 ×2 · A–T 20/20
test:theme-catalog .........  4/4
test:service-saving ........ 14/14
test:service-management ....  9/9
test:service-security ...... 20/20
test:acceptance ............ 66/66   ← Phase 8.3
test:acceptance-ui ......... 28/28   ← Phase 8.3
────────────────────────────────────
Phase 8 total .............. 161/161
lint 0 · auth 14/14 · screens 25/25 · build clean
```

## Constraints honoured

* **No existing data was deleted** to make a test pass; the legacy
  NULL-provenance row is asserted byte-identical at the end of the run.
* **The service architecture was not replaced** — no production source file was
  modified in this phase; only test files, `package.json` scripts and docs.
* **No completed theme was redesigned.**
* New tooling (`jsdom`, `@testing-library/react`) is in **devDependencies** only
  and does not ship in the app bundle.
