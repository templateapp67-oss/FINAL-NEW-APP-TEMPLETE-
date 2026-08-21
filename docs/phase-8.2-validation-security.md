# Phase 8.2 — Validation, Security & Error Handling

> Status: **complete** (draft SQL; M23 is **not applied** to any database).
> Scope: hardening the five-theme saved-service system. No UI redesign, no
> weakening of any existing policy, grant, or authentication rule.

## Headline: a real vulnerability was found and closed

Phase 8.1 made every **RPC** tenant-safe and provenance-safe. Phase 8.2 attacked
the system through the *other* door — direct table access via PostgREST, which a
logged-in user can reach with their normal session.

**The finding.** The M17 foreign keys only require the
`(predefined_service_id, theme_id, category_id)` tuple to be *self-consistent*.
They do not pin it to the tuple the row was created with. So a tenant could run:

```sql
update public.services
set theme_id = <nail theme>, category_id = <nail category>, predefined_service_id = <nail service>
where id = <my own barber service>;
```

Every FK passed, RLS passed (the row is theirs), and the saved service silently
migrated to a different theme — exactly the "manipulate theme_id/category_id to
create cross-theme relationships" attack this phase was asked to prevent.

A second, related gap: the FKs do not check `is_active`, so a direct `INSERT`
could link a saved service to a **deactivated** predefined service. Both RPCs
validated this; the table did not.

Reproduced before the fix:

```
=== PROBE 2: direct provenance manipulation on OWN row ===
  *** ALLOWED  UPDATE own row -> nail_lash predefined (valid tuple, different theme)
  -> row now on nail theme? true
=== PROBE C) direct INSERT bypassing RPC validation ===
  *** ALLOWED  INSERT linking an INACTIVE predefined service
```

After M23:

```
  blocked  UPDATE own row -> nail_lash predefined -> Saved service provenance is immutable…
  blocked  UPDATE own row -> business_id = B      -> Saved service ownership is immutable…
  blocked  INSERT with an inactive predefined     -> …is inactive, or belongs to another theme…
```

### The fix — M23 `enforce_saved_service_provenance()`

A `BEFORE INSERT OR UPDATE` trigger on `public.services`:

* **UPDATE** — `business_id`, `theme_id`, `category_id` and
  `predefined_service_id` are **immutable**. Price, duration, description, name,
  status, ordering and feature flags stay freely editable.
* **INSERT** — the theme must exist *and be active*; the category must belong to
  that theme; the predefined service must belong to that exact theme + category
  *and be active*. Fully-NULL provenance (Custom / "Other") is still allowed.

This closes the hole for the RPCs, PostgREST, and any future code path, because
it lives in the database rather than in a caller.

## Authorization — verified, not assumed

Every check below is an actual executed attack in
`scripts/test-service-security.mjs`; the test passes only when the attack is
**rejected**. Both the RPC surface and direct table access are attacked.

| Attack | Result | Enforced by |
|---|---|---|
| View another salon's saved services | Blocked (RPC returns own tenant only; direct select returns 0 rows) | `auth.uid()` derivation + M12 RLS `services_role_select` |
| Add services to another salon | Blocked (RPC binds caller's own salon; direct insert violates RLS) | `nexora_current_manageable_business_id()` + RLS `WITH CHECK` |
| Edit another salon's services | Blocked (`not found for your salon`; direct update matches 0 rows) | RPC ownership filter + RLS |
| Delete another salon's services | Blocked (RPC refuses; direct delete matches 0 rows) | RPC ownership filter + **no DELETE policy exists** |
| Manipulate `theme_id`/`category_id`/`predefined_service_id` | **Blocked (new in M23)** | `enforce_saved_service_provenance()` |
| Move a row to another tenant (`business_id`) | Blocked | M23 trigger + RLS |
| User with no salon membership | Fully locked out; sees zero rows | `nexora_current_manageable_business_id()` |
| Anonymous visitor | No tenant read, no write, no helper functions | `revoke … from anon` + RLS |
| Tenant mutating the global catalog | `permission denied` on all 6 verbs | M16 grants (`service_role` only) |

Note: `get_theme_service_catalog` remains **intentionally** anon-executable — it
returns global catalog data only, contains no tenant rows, and anonymous
onboarding previews depend on it. M23 documents this explicitly so the intent is
reviewable rather than accidental.

## Relationship validation

| Rule | Enforced at |
|---|---|
| `theme_id` → a valid **active** theme | RPC + M23 trigger + FK |
| `category_id` → belongs to `theme_id` | RPC + M23 trigger + M17 composite FK |
| `predefined_service_id` → belongs to `category_id` **and** `theme_id`, and is active | RPC + M23 trigger + M17 composite FK |
| Provenance immutable after creation | M23 trigger |
| Custom / "Other" keeps `predefined_service_id` NULL | RPC contract + trigger allows the all-NULL case |

`REL-2` and `REL-3` run these permutations **for all five themes**, pairing each
theme against a foreign theme's category and predefined service.

## Error handling & UI states

| State | Handling |
|---|---|
| Loading (catalog) | "Loading services…" |
| Loading (saved) | "Loading saved services…" with `role="status"` |
| Empty service list | New "No services yet" panel, shown only once the current theme has loaded |
| Empty suggestions | "No suggested services in this category." |
| Invalid theme | RPC raises `No active service catalog exists for this theme.`; catalog RPC returns `NULL` so the UI can distinguish "invalid" from "empty" |
| Invalid category | `The selected category does not belong to this theme.` |
| Inactive service | Owner still sees and manages it (greyed, "Inactive" badge); excluded from the public website RPC |
| Database error | Generic message + **"Try again"** retry button |
| Duplicate service | `This service is already saved for your salon.` |
| Failed Add Selected | Batch is atomic — a rejected batch inserts **nothing** (verified by row count) |
| Failed Edit | Inline error; row keeps its previous values |
| Failed Delete | Inline error; row is preserved |

### Never showing stale services

The saved list is gated on `showSavedServices = savedStatusTheme === theme`:

* `savedStatusTheme` is set to `null` the moment a load starts, and only set to
  the theme once **that theme's** response arrives;
* rows are cleared before the request begins;
* a stale response is discarded via the `savedLoadRequestRef` request-ID guard;
* **a failed load deliberately leaves the gate closed**, so an error can never
  reveal a previous theme's services.

The preserved `hair` theme sets the gate synchronously, so its local in-memory
services keep rendering exactly as before.

### No internal leakage

`rpcError()` previously forwarded raw PostgreSQL text to the UI, which could
expose table names, constraint names and SQL fragments. It now matches against
an allow-list of messages we deliberately authored; anything else is logged to
the console for developers and replaced with a safe generic message.

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/20260813000801_m23_service_security_hardening.sql` | **new** — provenance/ownership immutability + active-row validation trigger; explicit anon revokes |
| `src/lib/savedServiceService.ts` | Error-message allow-list so DB internals never reach the UI |
| `src/screens/StepServices.tsx` | Theme-identity gate for the saved list, empty state, retry button; load refactored into a reusable callback |
| `scripts/test-service-security.mjs` | **new** — 20 adversarial security/validation/error tests |
| `scripts/test-service-saving.mjs` | +3 Phase 8.2 tests (11 → 14) |
| `scripts/validate-migrations.mjs` | 23 migrations; assertions widened where M23 now rejects earlier with a clearer message |
| `scripts/test-auth-modal.mjs` | migration count 22 → 23 |
| `package.json` | `test:service-security`, `test:phase-8.2` |

## Validation

```bash
npm run test:phase-8.2   # full Phase 8.2 suite
npm run lint             # 0 errors
node verify-22-screens.js
npm run test:auth
npm run build
```

Results:

* `validate:migrations` — **23/23 applied cleanly ×2**, **20/20** functional tests (A–T)
* `test:theme-catalog` — 4/4
* `test:service-saving` — 14/14
* `test:service-management` — 9/9
* `test:service-security` — **20/20**
* `test:auth` — 14/14 · `verify-22-screens` — 25/25 · `lint` — 0 · `build` — clean

## Not changed

* No UI redesign — only a new empty-state panel, a retry button, and an
  "Archived" badge were added; no layout, styling or theme was altered.
* No existing RLS policy, grant, or authentication rule was removed or loosened.
  M23 only **adds** restrictions.
* Migrations remain drafts. M02 must still be regenerated after read-only live
  introspection before any execution.
