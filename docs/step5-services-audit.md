# Step 5 — Services & Packages: Fetch/Mutation Failure Audit

> Date: 2026-08-22 · Screen: `05 — Services & Packages` (Step 5 of 15) ·
> Deployment: `final-new-app-templete.vercel.app` ·
> Reported errors: **"Unable to load saved services."** on mount and
> **"Unable to add this service."** on `Save Service`.

---

## 1. Root cause (one line)

**The Step-5 Supabase RPC surface does not exist on the live project.** The
frontend calls PostgREST RPCs (`get_saved_services_for_theme`,
`create_saved_service`, `get_theme_commerce`, …) that were authored only as
Design-A DRAFT migrations (M16–M26, `businesses`-keyed) and were never
applied to the live Design-B (`salons`-keyed) database. The corrected
salon-keyed recreation — **migration M40** — exists in this repo but has
**not been applied to the live project yet** (it awaits an explicit go-ahead
per `AGENTS.md`). PostgREST therefore answers every Step-5 call with
**HTTP 404 / `PGRST202` — "Could not find the function … in the schema
cache"**, and the client deliberately masks that raw text behind the two
generic messages the user sees.

## 2. Exact failure chain

| # | UI action | Code path | Live result | UI text |
|---|-----------|-----------|-------------|---------|
| 1 | Screen mount | `Promise.all([loadSavedServicesForTheme, loadThemeCommerce])` → `client.rpc('get_saved_services_for_theme')` / `client.rpc('get_theme_commerce')` (`src/screens/StepServices.tsx` → `src/lib/savedServiceService.ts`, `src/lib/pricingPromotionService.ts`) | 404 `PGRST202` | "Unable to load saved services." / "Unable to load pricing and promotions." (whichever rejects first fills the banner) |
| 2 | `Save Service` click | `handleCreateService` → `createSavedService` → `client.rpc('create_saved_service')` | 404 `PGRST202` | "Unable to add this service." |
| 3 | Catalog chips (works) | `loadThemeServiceCatalog` → `rpc('get_theme_service_catalog')` | 404 → **static fallback catalog** (already built into `themeCatalogService.ts`) | none — by design |

Why the raw PostgREST text never reaches the UI: `rpcError()` in
`src/lib/savedServiceService.ts` only passes through hand-authored messages
(`SAFE_MESSAGE_PATTERNS`: "please log in", "already saved", …) and swaps
everything else for the generic fallback — an intentional hardening against
leaking SQL internals. The full error is still in the browser console
(`Saved service RPC failed: …`).

Note on #2: even if the function existed, the current form would post the
*static-fallback* category id (`static-cat-<theme>-<n>`), which is not a UUID
— PostgREST would 400. That id shape change resolves itself once M40 makes
the catalog RPC return real UUID categories.

## 3. Task-by-task findings

### 3.1 Network & API handlers
- Services do **not** flow through the Vercel API routes. `/api/*`
  (`api/[[...path]].ts` → `api-routes.ts`) only covers booking/payment/
  geocoding/Gemini; services call Supabase PostgREST **directly from the
  browser** (`https://qwaehqsmodekbgvnaavz.supabase.co/rest/v1/rpc/...`).
- Observed failure class on the live deployment: **404 `PGRST202`**
  (function absent from the schema cache). Not CORS (Supabase allows the
  app's origins for the anon key), not 401, not 500.

### 3.2 Authentication & session tokens
- Not the cause. `supabaseClient.ts` (PKCE flow, `persistSession`,
  `autoRefreshToken`) attaches `apikey` + `Authorization: Bearer` on every
  call. If a session is missing/expired, the M40 functions raise a *safe*
  message ("Please log in to manage services.") which the UI shows verbatim —
  a different message than the reported one. Session expiry therefore fails
  loudly, not silently.

### 3.3 Database connection & schema
- Connection is fine (every other Supabase flow — auth, owner dashboard,
  publish — works on the same project).
- The `Service` write contract (`name`, `category`, `price`, `duration`,
  `description`) has **no type mismatch**: the client converts ₹ → paise
  (`Math.round(price * 100)` → `p_price_paise bigint`, mirroring M40) and
  validates negative price / non-positive duration before and inside the RPC.
  The write fails before any validation is reached because the function is
  missing.

### 3.4 Vercel environment variables
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` **are set** on the live
  deployment — proven by behavior: with them absent, `isSupabaseConfigured`
  is `false` and the module takes its built-in mock paths (fetch → `[]`,
  save → mock row), so the reported banners could never appear.
- Checklist if this ever needs re-verification (Vercel → Project → Settings
  → Environment Variables, **Production** scope): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_REDIRECT_ORIGIN`
  (`https://final-new-app-templete.vercel.app`), plus server-only
  `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_*`, `APP_ORIGIN` /
  `ALLOWED_API_ORIGINS` for the `/api` payment/booking routes (see
  `.env.example`). Redeploy after any change (`VITE_*` is build-time).

### 3.5 Fallback / mock state logic
- Implemented in this changeset — see §5.

## 4. The root fix (database) — apply M40

M40 (`supabase/migrations/20260822000301_m40_service_catalog_commerce_rpc.sql`)
recreates the complete Step-5 RPC surface on the live Design-B schema and
ships its own `verify_m40_service_catalog()` (17 checks). Applying it makes
the app fully server-persistent (this is also what unblocks commerce:
pricing variants, bundles, offers, badges, audit log).

1. Dashboard route (no credentials in the repo): Supabase → project
   `qwaehqsmodekbgvnaavz` → SQL Editor → paste and run
   `docs/m40-run-in-supabase.sql`.
2. CLI route (needs a Management-API token in the shell):
   `SUPABASE_ACCESS_TOKEN=sbp_… npm run db:apply:live:m40`
   (applies **and** runs the verifier; `db:apply:live:all` covers M28–M40).
3. Sanity after either route: open Step 5 on the live site → the banner is
   gone, `Save Service` persists, and `verify_m40_service_catalog()` returns
   17/17. No Vercel redeploy is needed — the deployed bundle already targets
   these RPC names.

Per `AGENTS.md`, executing this against the live project requires the
project owner's explicit go-ahead — the sandbox holds no Supabase
credentials and this audit intentionally ran **zero** statements against
production.

## 5. The resilience fix (this changeset) — local persistence fallback

Until M40 is applied (and for any static/no-database deployment of this
template), Step 5 now degrades to a **localStorage-backed implementation of
the same RPC contracts** instead of dead-ending:

- `src/lib/rpcSurface.ts` (new) — `isMissingRpcSurfaceError()`: matches
  **only** the deterministic "function not deployed" signature (`PGRST202` /
  "Could not find the function … in the schema cache"). Auth, validation,
  500s and transient network failures deliberately do **not** match, so a
  healthy database is never silently bypassed and real errors keep their
  existing behavior (masked banner + retry).
- `src/lib/localSavedServices.ts` (new) — per-theme localStorage store
  (`nexora.localSavedServices.v1.<theme>`) with an in-memory mirror for
  non-browser contexts; theme-isolated like the server; quota-failure
  tolerant.
- `src/lib/savedServiceService.ts` — every `*WithClient` function records a
  session probe when it sees the missing-surface error; every public
  wrapper (`load…`, `create…`, `savePredefinedServices`, `update…`,
  `setStatus`, `setActive`, `delete`) then serves the operation from the
  local store (`*Local` executors), mirroring M40 semantics: same
  validation messages, predefined-duplicate guard, custom-name duplicate
  guard (non-archived rows), mutable-fields-only updates, archived-row
  status rules.
- `src/lib/themeCatalogService.ts` — caches the resolved catalog
  (`peekThemeCatalog`) so the fallback resolves the exact category/predefined
  ids the form submitted (works for both RPC-mapped and static-fallback
  catalogs).
- `src/lib/pricingPromotionService.ts` / `src/lib/serviceSafetyService.ts` —
  read-side fail-soft in the same condition: empty commerce object (no more
  "Unable to load pricing and promotions."), unlocked delete-guard for local
  rows, archived via the local store, empty audit log.

**Result on today's live site (pre-M40):** the mount banner disappears,
`Save Service` / `Add Selected` add rows that persist across refreshes on the
same browser, and edit/deactivate/delete all work. After M40 is applied the
probe never trips and the exact same code paths call the database — no
frontend change or flag is required to switch back. Locally persisted rows
stay on the device; they are not migrated to the server (documented product
trade-off — silently re-uploading owner data was rejected).

Intentionally out of scope for the fallback: commerce **writes**
(variants/bundles/offers) and service media/translation uploads — they keep
surfacing their existing masked errors until M40 lands, so nobody mistakes
device-local state for server-persisted data.

## 6. Changed files

| File | Change |
|------|--------|
| `src/lib/rpcSurface.ts` | **new** — missing-RPC-surface detection |
| `src/lib/localSavedServices.ts` | **new** — localStorage saved-service store |
| `src/lib/savedServiceService.ts` | probe hooks + public-wrapper fallback + `*Local` executors |
| `src/lib/themeCatalogService.ts` | resolved-catalog cache (`peekThemeCatalog`) |
| `src/lib/pricingPromotionService.ts` | `loadThemeCommerce` fail-soft |
| `src/lib/serviceSafetyService.ts` | lock/audit/archive/integrity fail-soft |
| `scripts/test-step5-local-fallback.mjs` | **new** — 14-check regression suite |
| `package.json` | `npm run test:step5-fallback` |
| `docs/step5-services-audit.md` | this report |

## 7. Verification (all run in the sandbox)

| Suite | Result |
|-------|--------|
| `npm run lint` (tsc --noEmit) | ✅ clean |
| `npm run build` (vite + server bundle) | ✅ exit 0 |
| `npm run test:step5-fallback` (new) | ✅ 14/14 |
| `npm run test:service-saving` | ✅ 14/14 |
| `npm run test:service-management` | ✅ 9/9 |
| `npm run test:service-security` | ✅ 20/20 |
| `npm run test:theme-catalog` | ✅ 4/4 |
| `npm run test:m40` (PGlite, full Step-5 RPC surface) | ✅ 22/22 |
| `npm run validate:migrations` | ✅ 27/27 ×2 + 21/21 |
| `node verify-22-screens.js` | ✅ all 25 screens |

## 8. Remaining recommendation

Ship the resilience fix (zero risk to a healthy backend), then apply M40 at
the next maintenance window using §4 — that is the permanent cure and also
unlocks the commerce manager, service audit log, translations and media
upload on the live site.
