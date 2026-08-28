# Missing Items & Gaps Analysis

**Audit date:** 25 August 2026 · **Remediation delta:** 28 August 2026
**Scope:** product completeness, customer/owner frontend, API/backend, Supabase, security/privacy, publishing/deployment, payments/bookings, testing, CI/CD, monitoring, and production readiness.  
**Method:** repository/source/configuration review plus the most recent local validation results. No claim in this document implies that DNS, Vercel, Supabase, Razorpay, SMTP, or other external production services were inspected.

## 2026-08-28 remediation delta (M60–M63)

The repository-side FAIL items below are now implemented and locally verified.
Items marked EXTERNAL still require operator action on live services.

| Original gap (status on 08-25) | Remediation (status on 08-28) |
|---|---|
| **Refunds — FAIL** (no provider refund workflow) | **PASS (repository)** — M60 `payment_refunds` ledger + actor-bound `create_payment_refund_for_actor` / idempotent `mark_payment_refund_result` / `get_payment_refunds_for_actor`; Razorpay `POST /v1/payments/:id/refund` client with amount re-verification; `POST /api/payments/refund`, `GET /api/payments/refunds`; webhook `refund.processed`/`refund.failed` reconciliation; partial→full refund chain with `partially_refunded`/`refunded` payment states; mock mode requires explicit `NEXORA_ALLOW_LOCAL_REFUNDS=1`. Evidence: `npm run test:m60` 12/12. |
| **Rescheduling — FAIL** (no atomic slot swap) | **PASS (repository)** — M61 `reschedule_customer_booking_for_actor`: row lock, customer-or-owner authorization via the canonical membership chain, duration from the immutable service snapshot, canonical + guest slot conflict checks, payment linkage untouched, idempotent same-window retry; `POST /api/customer/bookings/:id/reschedule` maps `23P01`→409. Evidence: `npm run test:m61` 12/12. |
| **Privacy lifecycle — FAIL** (no export/deletion/anonymization) | **PASS (repository)** — M62 `export_user_data_for_actor` (profile + auth contact + bookings with service lines + payments + refunds) and ledger-preserving `anonymize_user_data_for_actor`; `GET /api/account/export`, `POST /api/account/delete` (explicit confirmation, anonymize → Admin-API identity deletion, honest partial-failure reporting). Evidence: `npm run test:m62` 8/8. |
| **CI/CD — FAIL** (no workflow, no root gate) | **PASS (repository)** — `.github/workflows/ci.yml` (typecheck, migration validation, generated-types drift, regression suites, build, `git diff --check`, manifests job, secrets-gated live verify) + `npm run ci` mirroring it locally. |
| **Generated DB types — FAIL** (not checked in) | **PASS (repository)** — `scripts/generate-db-types.mjs` introspects the replayed Design-B chain offline (PGlite) and emits `src/types/database.generated.ts` (35 tables); `npm run db:types:check` fails CI on drift. |
| **Rollback — FAIL** (no strategy) | **PASS (repository)** — `docs/release-rollback-runbook.md`: pre-release checklist, per-scenario procedures (app rollback, defective migration quarantine + forward-fix, catastrophic restore), quarterly restore drill. |
| **Security headers — PARTIAL** | **PASS (repository)** — `server/observability.ts` baseline headers + `vercel.json` edge headers; strict framing/HSTS gated to production so dev/preview embeds keep working; report-only CSP opt-in (`NEXORA_CSP`, `NEXORA_FRAME_ANCESTORS`). |
| **Structured logs / request IDs — PARTIAL** | **PASS (repository)** — `x-request-id` correlation + tenant-safe JSON request lines on every API response (no headers/bodies/user ids logged). |
| **Deep health — PARTIAL** | **PASS (repository)** — `/api/health/deep` probes Supabase connectivity + M54 migration surface, Razorpay configuration, geocoding and AI modes; returns 200/207/503 per dependency state. Shallow `/api/health` unchanged for uptime probes. |
| **SEO sitemap/robots — PARTIAL** | **PASS (repository)** — `/robots.txt` and `/sitemap.xml` generated from published `salon_public_websites` (private surfaces disallowed; base-only fallback when the database is unreachable). |
| **Owner dashboard mock data plane — FAIL** | **PASS (repository, earlier sessions)** — the dashboard hydrates from `/api/owner/bookings` (M55 actor-bound RPC) through `ownerBookingItemsToDashboardRecords`; localStorage is used only when Supabase is unconfigured. The revenue panel's "Test/Mock" banner is stale-but-conservative labeling; tracked below as a polish item. |
| Migrations applied to the live project | **EXTERNAL** — apply with `SUPABASE_ACCESS_TOKEN=… npm run db:apply:live:m60|m61|m62` (each runs its verifier), then re-run `db:verify:live:m54` and confirm `/api/health/deep` on the deployment. |
| Razorpay live keys/webhook registration, wildcard DNS/TLS, Supabase auth hardening, distributed rate limiting, error monitoring sink | **EXTERNAL / PARTIAL** — unchanged from the 08-25 findings; repository hooks exist (headers, deep health, structured logs) for the operator to attach these services. |

## Current audit delta — authenticated workspace incident

The reported `We couldn't load your salon workspace` / `Could not set up your salon` incident is **root-caused and fixed in the repository**. The local PGlite regression reproduces PostgreSQL SQLSTATE `428C9`: the observed membership schema has writable `organization_members.status` and a `STORED GENERATED organization_members.is_active`, while the prior provisioning RPC explicitly wrote `is_active`. The transaction failed after Auth and before the organization/membership/salon/website workspace was complete.

M54 (`20260825000501_m54_workspace_bootstrap_compatibility.sql`) now uses the writable activity vocabulary, repairs missing profiles/partial tenants, serializes per-user bootstrap, preserves RLS, and keeps `auth.uid()` as the only authorization source. Browser code now validates `getSession()` plus `auth.getUser()`, suppresses stale auth results, reruns authoritative resolution on retry, and logs structured secret-safe diagnostics. Subsequent hardening: multi-salon accounts get an authenticated workspace selector instead of the P0003 lockout (see `docs/HANDOFF.md`), and M58/M59 repaired invitation activation and provisioning failure paths.

**Evidence available:** `npm run test:m54` — 12/12 (including direct `428C9` reproduction and the paste-ready-bundle drift check); `npm run test:workspace-init` — 9/9; live `verify_m54_workspace_bootstrap()` reported 6/6 true. **Evidence still missing:** a clean live-account browser Network trace after the latest deploy. No cookies, cache, or storage clearing is an acceptable remediation.

## Status definitions

- **PASS** — implemented in the repository and supported by relevant local evidence.
- **PARTIAL** — useful implementation exists, but an important production path or capability is incomplete.
- **FAIL** — a concrete blocker prevents the stated production outcome. Every FAIL below includes its exact blocker.
- **EXTERNAL** — repository implementation exists, but the deployed state cannot be established from this checkout.
- **MOCK/FALLBACK** — explicitly non-authoritative browser-local, deterministic, or offline behavior.

## Executive conclusion

The repository is a substantial, test-heavy white-label salon application, not an empty prototype. Owner onboarding, five themes, public site rendering, publishing primitives, tenant-aware Supabase migrations/RLS, guest and authenticated booking APIs, Razorpay server routes, and the authenticated workspace bootstrap repair all exist.

It is **not yet demonstrably production-ready end to end**. The reported workspace initialization defect is fixed in source and locally reproduced/verified, but M54 has not been applied to or confirmed on the live Supabase project. Separately, the application still has multiple booking/payment data planes: authoritative Supabase bookings/payments, a separate `website_bookings` guest path, and a browser-local `PaymentRecord` store. The owner dashboard reads the browser-local store and explicitly labels revenue as mock data, so it cannot be treated as the operational view of production Razorpay bookings. Migration delivery, publishing, and external service configuration also lack live evidence and checked-in CI enforcement.

### Release recommendation

**NO-GO for accepting real customer payments or operating bookings from the owner dashboard.**  
**Conditional GO for a controlled, no-payment pilot** only after M41–M54 are applied and verified in the target Supabase project, the public host/DNS path is smoke-tested, and operators understand that browser-local dashboard/review/analytics features are not cross-device production systems.

## Priority blockers

*Statuses updated 2026-08-28 — see the remediation delta at the top.*

| Priority | Status | Gap | Exact blocker / business impact | Evidence |
|---|---|---|---|---|
| P0 | **EXTERNAL** | Authenticated workspace repair is not deployed or live-observed | **Exact blocker:** M54 is committed and locally verified; live verifiers reported 6/6 true. A clean post-deploy browser Network trace for the latest release is still not captured. | `supabase/migrations/20260825000501_m54_workspace_bootstrap_compatibility.sql`, `scripts/apply-live-migration.mjs`, `docs/m54-workspace-bootstrap-compatibility.md` |
| P0 | **PASS (repository, earlier sessions)** | Owner operations are not connected to the authoritative production booking/payment records | **Fixed:** the owner dashboard hydrates from `/api/owner/bookings` (M55 actor-bound RPC); localStorage/mock records are used only when Supabase is unconfigured. Residual polish: the revenue panel still renders a "Test/Mock" banner. | `src/lib/authoritativeBooking.ts`, `src/lib/ownerAuthoritativeBookings.ts`, `src/components/OwnerDashboard.tsx`, `npm run test:owner-canonical-bookings` |
| P0 | **PASS (repository)** | Database release is not automated in CI | **Fixed:** `.github/workflows/ci.yml` runs typecheck, migration validation, generated-types drift, regression suites and build on every PR/push, plus a secrets-gated live `db:verify` job. Bulk application stays intentionally manual/reviewed (AGENTS.md). | `.github/workflows/ci.yml`, `npm run ci`, `scripts/apply-live-migration.mjs` |
| P0 | **EXTERNAL** | Live M44/M54 publishing, workspace, and RLS state is unknown | Repository tests cannot prove M44/M54+ are applied to the configured Supabase project, that their verifiers pass there, or that deployed anon/authenticated grants match the migrations. `/api/health/deep` now surfaces the M54 migration-surface state for operators. | `supabase/migrations/*`, `.env.example`, `supabase/config.toml`, `server/seoRoutes.ts` |
| P0 | **EXTERNAL** | Razorpay production readiness is unknown | Repository code verifies signatures, uses raw webhook bytes, stores webhook ingress, and now also implements provider refunds with reconciliation (M60). No evidence yet of live keys, webhook URL registration, or settlement reconciliation. | `server/paymentRoutes.ts`, `server/razorpay.ts`, `.env.example`, M29/M31/M60 migrations |
| P0 | **EXTERNAL** | Public wildcard host is not proven | Wildcard DNS, TLS certificate coverage, Vercel domain attachment, host routing, environment variables, and a real published slug were not testable from the checkout. If any is absent, customer sites are unreachable even when publishing succeeds. | `src/lib/salonRouting.ts`, `src/main.tsx`, `vite.config.ts`, `vercel.json`, `.env.example` |

## 1. Product and workflow completeness

| Area | Status | Finding |
|---|---|---|
| Owner authentication and salon resolution | **PASS (repository) / EXTERNAL (live)** | Supabase session-derived ownership is used; `getSession()` plus `auth.getUser()` are validated, the dashboard does not accept a business ID from user input, and M54 repairs the generated-membership bootstrap path. Live Auth/session, deployed migration, and database-log evidence remain unavailable. See `src/lib/authIdentity.ts`, `src/lib/useAuth.ts`, `src/lib/ownerSalon.ts`, `src/lib/ownerDashboard.ts`, and M36/M37/M42/M43/M54. |
| Owner onboarding/customization | **PARTIAL** | A broad onboarding and customization workflow exists, with backend draft hydration/autosave in `src/App.tsx`. Some supporting capabilities remain browser-local or JSON-config based, so cross-device consistency depends on publishing/autosave completing successfully. |
| Five white-label themes | **PASS** | Five canonical templates route through shared public-site and booking architecture. The compact booking layout is shared rather than duplicated. See `src/components/TemplateRenderer.tsx`, `src/components/SiteBookingHost.tsx`, and `src/components/SiteBookingFullFlow.tsx`. |
| Owner dashboard navigation | **PASS for UI coverage** | Overview, today, upcoming, customers, revenue, calendar, and notifications have concrete modules. `SectionFoundation` remains as a defensive fallback but current navigation IDs are handled. See `src/components/OwnerDashboard.tsx`. |
| Owner dashboard production data | **FAIL** | **Exact blocker:** all operational modules project the local mock/test payment-record store rather than authoritative Supabase booking/payment rows. A real server booking is not guaranteed to appear on the owner's browser, another device, or after local data loss. |
| Customer booking selection and slot UI | **PASS for local UX** | Service/staff/date/time selection, collision logic, drafts, confirmations, retries, cancellation feedback, and five-theme responsive coverage exist. |
| Customer production booking | **PARTIAL** | There are two server-backed paths: authenticated authoritative booking/payment APIs and guest `website_bookings`. Their models and downstream owner consumption are not unified. |
| Customer account / “My bookings” | **PARTIAL** | The rich `SiteMyBookings` experience reads browser-local payment records. It is not a durable cross-device customer booking history backed by the authoritative server. |
| Rescheduling | **FAIL** | **Exact blocker:** cancellation and status transitions exist, but there is no end-to-end server-authoritative customer reschedule workflow that atomically releases the old slot, acquires the new slot, preserves payment linkage, and updates notifications. |
| Refunds | **FAIL** | **Exact blocker:** refunded statuses can be displayed, but the schema explicitly deferred a real refund backend and no Razorpay refund API workflow is implemented. Cancelling a paid booking does not execute or reconcile a refund. See `supabase/migrations/20260811000901_m09_payments.sql`, `src/lib/bookingManagement.ts`, and `server/paymentRoutes.ts`. |
| Notifications | **PARTIAL** | Owner notifications are derived from current local booking snapshots. No provider-backed email/SMS/WhatsApp delivery, durable read/unread workflow, retry queue, or delivery status is active. See `src/lib/ownerNotifications.ts` and M10 notification preferences. |
| Reviews and social likes | **MOCK/FALLBACK** | Reviews and video-like runtime state use localStorage, so counts and moderation are browser-specific rather than global production data. See `src/lib/siteReviews.ts` and `src/lib/videoLikes.ts`; M27 contains database foundations that are not wired into these modules. |
| Referral dashboard | **MOCK/FALLBACK** | Referral capture/registry uses localStorage and is not an authoritative attribution or payout ledger. See `src/lib/referral.ts` and `src/lib/referralDashboard.ts`. |
| Social video metadata | **PARTIAL** | YouTube metadata is implemented. Instagram, Facebook, and TikTok are explicitly rejected as “coming next.” See `api-routes.ts` and `src/lib/videoUrlMetadata.ts`. |
| Internationalization | **PARTIAL** | English/Hindi UI support exists. Server guest availability is hardcoded to `Asia/Kolkata` instead of each business's stored timezone, limiting the white-label model beyond India. See `server/websiteBookingRoutes.ts` versus `businesses.timezone` migrations. |

## 2. Frontend quality

### Implemented

- Responsive public sites, owner shell, booking flow, loading/error/empty states, and shared light/dark theming.
- An application error boundary exists at `src/components/ErrorBoundary.tsx`.
- Dynamic SEO metadata, canonical URL, Open Graph, Twitter cards, robots values, and structured data builders exist in `src/components/SiteSeo.tsx` and `src/lib/siteSeo.ts`.
- Many accessible labels, roles, keyboard handlers, and semantic controls are present.
- Image handling and theme-specific visual fallbacks exist.

### Gaps

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **PARTIAL** | SEO is client-rendered. Metadata and structured data are written after JavaScript loads; there is no SSR/prerendering evidence, generated `sitemap.xml`, or `robots.txt` deployment route. Crawlers with weak JS execution may see generic metadata. |
| **PARTIAL** | Accessibility has substantial component-level effort but no automated axe/Pa11y/Lighthouse gate or documented screen-reader/manual WCAG audit. Repository grep coverage is not conformance evidence. |
| **PARTIAL** | The latest production build succeeds but reports a large main bundle (approximately 2.4 MB minified / 578 KB gzip) and mixed static/dynamic imports of the Supabase client. This raises mobile startup and cache-invalidation risk. |
| **PARTIAL** | Offline fallbacks can hide backend outages and create divergent state. Pricing, saved services, service safety, and theme catalog modules contain local fallback behavior; production UX must distinguish an offline draft from a server-confirmed save. See `src/lib/pricingPromotionService.ts`, `savedServiceService.ts`, `serviceSafetyService.ts`, and `themeCatalogService.ts`. |
| **FAIL** | Durable customer history is absent. **Exact blocker:** “My bookings,” slot holds, draft state, reviews, likes, and mock payment records rely on localStorage/browser identity and are lost or isolated across browsers/devices. |
| **PARTIAL** | No PWA manifest/service worker/offline cache strategy was found. This is not required for a web launch, but it is a missing capability if installable/mobile-offline behavior is expected. |

## 3. Backend and API

### Implemented

- Shared Express route registration for standalone and serverless entry points (`server.ts`, `api/index.ts`, `api/[...path].ts`, `api-routes.ts`).
- Request body limit, origin allowlist behavior, raw-body retention for payment HMAC verification, and server-only secrets.
- Authenticated booking creation and Razorpay order/verification/webhook routes.
- Guest booking context, availability, and creation routes.
- Input validation for geocoding/video endpoints and URL safety controls around metadata fetching.
- AI endpoints require a real session when a paid Gemini key is configured and provide rule-based offline behavior.

### Gaps

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **FAIL** | Booking APIs are not represented by one authoritative customer/owner lifecycle. **Exact blocker:** `server/bookingRoutes.ts` uses canonical `bookings`/payments, `server/websiteBookingRoutes.ts` uses `website_bookings`, and dashboard/customer management uses browser-local `PaymentRecord`. Status, history, availability, payment, and owner views can diverge. |
| **PARTIAL** | Rate limiting and metadata caches are process-memory maps. In serverless/multi-instance deployment they are ephemeral and instance-local, so limits are bypassable and cache behavior is inconsistent. See `api-routes.ts` (`aiUsage`, Nominatim/video cache/queue code). |
| **PARTIAL** | Public geocoding and video-metadata endpoints lack a durable/distributed abuse-control layer. Nominatim queuing helps one process but does not coordinate across instances. |
| **PARTIAL** | `/api/health` proves only that Express responds. It does not test Supabase connectivity, migration version, Razorpay configuration, storage, or dependency health. |
| **PARTIAL** | The Vercel config has a broad SPA catch-all while two API function entry points exist. Filesystem route precedence should preserve functions, but deployed route behavior needs a preview/production smoke test and preferably one documented serverless entry strategy. |
| **PARTIAL** | API logs are unstructured `console` calls with no request correlation ID, tenant-safe audit trail, centralized sink, or error-reporting integration. |

## 4. Supabase schema, RLS, and operations

### Implemented

- A large migration chain covers organizations, businesses/salons, roles, catalog, storage, bookings, payments, referrals/notifications, themes, publishing, guest bookings, and verification functions.
- RLS and grants receive extensive attention, with explicit isolation verification in M43, public projection/publishing verification in M44, and generated-membership/bootstrap verification in M54.
- M44's public RPC returns a deliberate public projection and gates phone exposure behind `contactOptions.callNow`; it does not expose owner/customer/payment-secret records.
- M54 preserves RLS, uses `auth.uid()` authorization, and is compatible with the observed writable `status` plus generated `is_active` membership shape.
- Service-role usage is server-side; browser configuration uses the publishable/anon key.

### Gaps

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **FAIL** | Latest migration deployment is not automated. **Exact blocker:** `db:apply:live:all` now includes M28–M54, but no CI invokes it or the Supabase CLI. The frontend can still be released against an older live schema. |
| **FAIL** | Generated database types are not checked in. **Exact blocker:** `package.json` writes `src/types/database.generated.ts`, but that file is absent; `src/types/database.ts` is manually maintained. Schema drift therefore cannot be caught comprehensively at compile time. |
| **PARTIAL** | Parallel/reconciliation migrations and post-M40 additions increase drift risk. There is no checked-in production migration ledger report proving the target's exact applied order/checksums, including M53/M54. |
| **EXTERNAL** | M43/M44/M54 verification functions have not been run against the live target in this audit. Repository/PGlite tests do not prove live grants, policy state, or that the deployed RPC is the M54 version. |
| **EXTERNAL** | Backups, point-in-time recovery, restore drills, connection pooling, database alerting, log drains, storage lifecycle, and capacity limits are provider settings not evidenced in the repository. |
| **PARTIAL** | `supabase/config.toml` is local-development configuration: localhost auth URL, no extra redirects, email confirmations disabled, six-character password minimum, analytics disabled. Production Auth URL/redirect/confirmation/password/MFA settings must be separately hardened and verified. |

## 5. Security and privacy

### Positive controls

- No business ID is hardcoded into booking/owner authorization paths; ownership is session-derived.
- M43/M44 contain explicit tests for anon isolation and public projection behavior.
- Payment secrets, webhook secrets, Supabase service role, and management tokens are server environment values.
- Razorpay signatures use timing-safe comparison and webhooks preserve raw bytes.
- CORS does not combine a wildcard origin with credentials.
- Server request size is bounded.

### Gaps

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **FAIL** | No production-grade privacy lifecycle. **Exact blocker:** the UI presents static privacy text, but no authenticated account deletion, customer data export/access request, correction workflow, configurable retention policy, scheduled purge/anonymization, or consent/version ledger was found. The product collects names, phone numbers, booking details, and possibly notes/media. |
| **PARTIAL** | Legal content is template copy embedded in `src/lib/siteChromeI18n.ts`; it is not a versioned business-specific legal agreement with acceptance timestamps. |
| **PARTIAL** | CSP, HSTS, frame-ancestors, referrer policy, permissions policy, and other security headers are not configured in `vercel.json` or Express. Hosting defaults alone should not be assumed. |
| **PARTIAL** | Distributed rate limiting/bot protection is absent from the repository for guest booking, metadata, geocoding, auth abuse, and AI use. Database constraints help integrity but do not replace edge abuse protection. |
| **PARTIAL** | Dependency/security scanning, secret scanning, SAST, and migration-policy checks are not automated in CI. |
| **EXTERNAL** | Production Supabase Auth email confirmation, redirect allowlist, MFA options, breached-password protection, SMTP, CAPTCHA, and session settings require dashboard verification. |
| **EXTERNAL** | Production environment-variable scope, rotation, audit logs, staff access, Razorpay dashboard permissions, and incident-response procedures are not evidenced. |

## 6. Publishing and deployment

| Area | Status | Finding |
|---|---|---|
| Publishing model | **PASS (repository)** | M44 adds slug allocation and a public projection within the existing white-label architecture; no second domain model is introduced. Frontend publishing waits for backend success rather than showing a fake success state. |
| Public path routing | **PASS (repository)** | Slug path parsing and public salon loading are implemented, while the legacy `hair` renderer is preserved. |
| Wildcard/custom host deployment | **EXTERNAL** | DNS, TLS, domain ownership, and Vercel mapping are not code-only facts. |
| API deployment routing | **PARTIAL** | Express has Vercel handlers, but the broad SPA rewrite and duplicate catch-all/index functions need a deployed smoke test for every endpoint and slug host/path combination. |
| Environment validation | **PARTIAL** | `.env.example` documents required values, but no startup schema validates all production environment combinations or fails deployment before serving degraded flows. |
| Rollback | **FAIL** | **Exact blocker:** no documented/automated application-plus-database rollback strategy exists for a failed M41–M54 release. Forward-only SQL may be appropriate, but there is no restore/roll-forward runbook or release checkpoint. |
| Preview/production smoke evidence | **FAIL** | **Exact blocker:** no CI/CD job launches the deployed build and verifies auth callback, owner publish, public slug, API health/dependencies, guest/auth booking, and Razorpay test webhook. A green local build cannot establish production viability. |

## 7. Payments and booking architecture

### Repository implementation

- Razorpay order creation occurs server-side.
- Client payment verification and provider webhook verification exist.
- Webhook ingress is designed for idempotency/processing through database RPCs.
- Booking creation and payment intent creation have authoritative server routes.
- A no-provider local deterministic gateway remains available for previews/tests.

### Production gaps

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **FAIL** | Mock and real payment experiences are not cleanly separated across all owner/customer surfaces. **Exact blocker:** production server payment routes exist, but the rich shared booking flow and owner dashboard retain local deterministic `PaymentRecord` behavior; revenue explicitly says records are not production settlements. |
| **FAIL** | No real refund workflow. **Exact blocker:** no API calls Razorpay refunds, records provider refund IDs, handles partial refunds, or reconciles asynchronous refund status. |
| **PARTIAL** | Payment reconciliation is database/webhook-oriented but has no operator queue/UI for stuck orders, duplicate/missing webhooks, amount mismatches, or manual replay. |
| **PARTIAL** | Cancellation can leave captured funds recorded without refund; the code correctly avoids inventing a refund, but customer and owner operations need a defined policy and escalation path. |
| **EXTERNAL** | Live key mode, webhook registration, allowed origins, checkout behavior, currency/account configuration, settlement, and failure callbacks require Razorpay sandbox/live evidence. |

## 8. Testing, CI/CD, and quality gates

### Current evidence

The test inventory is unusually broad: custom TSX/JSDOM/PGlite suites cover phase features, migrations, RLS boundaries, public sites, owner screens, booking flows, and all five themes.

Most recent relevant local results:

- `npm run test:m54` — **11/11 PASS**, including direct `428C9` reproduction and compatibility verification.
- `npm run test:auth` — **18/18 PASS**.
- `npm run test:phase1` — **15/15 PASS**.
- `npm run test:phase-17.10` — **PASS**; static checks **13/13** and command suites **15/15**.
- `npm run test:phase-16.3` / `16.6` / `16.7` / `16.9` / `16.10` — **36/36**, **54/54**, **39/39**, **47/47**, and **68/68**.
- `npx tsc --noEmit` — **PASS**.
- `npm run lint` — **PASS** (`tsc --noEmit`; this is type-checking, not ESLint).
- `npm run build` — **PASS**, with existing dynamic-import and large-chunk warnings.
- `git diff --check` — **PASS**.

These are local/JSDOM/PGlite and source-level checks. They do not replace live Supabase, browser Network, deployed-host, or Razorpay sandbox evidence. Test output still includes non-fatal React `act(...)` warnings.

### Gaps

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **FAIL** | No CI workflow. **Exact blocker:** `.github/workflows/` is absent, so pull requests and releases do not automatically run typecheck, build, tests, migration validation, security scans, or deployment smoke tests. |
| **PARTIAL** | A broad local release command now exists (`npm run test:phase-17.10`) and passes its 15 command suites, but there is still no root `test`/`test:all`/`ci` script tied to CI, and migration/live/browser/payment checks remain deployment-side. |
| **PARTIAL** | Tests are largely custom scripts with source-text assertions and local DOM/database emulation. These are valuable regressions but not a substitute for browser E2E against real routing, Supabase Auth/RLS, storage, and Razorpay sandbox. No Playwright/Cypress suite was found. |
| **PARTIAL** | No coverage report or enforced branch/line thresholds were found, so untested production paths cannot be quantified. |
| **PARTIAL** | No visual-regression, automated accessibility, Lighthouse/performance-budget, cross-browser, or mobile-device CI gate was found. |
| **PARTIAL** | No dependency update/scanning automation or license policy was found. |

## 9. Observability and operations

| Status | Gap | Exact blocker where FAIL |
|---|---|---|
| **FAIL** | No production error monitoring. **Exact blocker:** errors are logged to browser/server console and caught by a UI boundary, but no Sentry/OpenTelemetry/provider integration captures exceptions, release versions, stack traces, user-safe context, or alerts. Production failures can be invisible after the request/browser session ends. |
| **FAIL** | Analytics are browser-local. **Exact blocker:** `src/hooks/useUsageTracking.ts` stores usage logs in localStorage; it cannot provide cross-device funnels, publish/booking conversion, retention, or reliable operational metrics. |
| **PARTIAL** | No request IDs, distributed tracing, structured JSON logs, centralized log retention, dashboards, or service-level objectives were found. |
| **PARTIAL** | No alert exists for webhook failures/backlog, booking creation errors, payment mismatch, migration drift, storage failures, elevated 4xx/5xx, or availability degradation. |
| **PARTIAL** | Health checks are shallow and no uptime probe configuration/runbook is checked in. |
| **EXTERNAL** | Vercel/Supabase/Razorpay native monitoring may be configured externally, but it was not available as audit evidence. |

## Recommended remediation order

### 1. Unify the operational data plane — before handling real bookings/payments

1. Select the canonical Supabase `bookings`/`payments` lifecycle as the single source of truth.
2. Adapt guest booking creation into that lifecycle or provide a clearly documented compatibility projection; do not add another domain architecture.
3. Replace owner dashboard reads/mutations with server/Supabase APIs over authorized canonical rows.
4. Replace customer “My bookings” with authenticated or secure booking-reference access backed by the server; keep localStorage only as a cache/draft.
5. Ensure availability queries include every canonical active booking and use business timezone.
6. Remove or strongly gate mock payment mode from production builds and label preview-only behavior.

**Exit criteria:** a Razorpay sandbox booking appears on another authenticated owner device, updates through webhook processing, blocks the slot, appears in customer history, and survives clearing browser storage.

### 2. Make schema delivery deterministic

1. Confirm the target project/ref and applied migration history, then apply M53 followed by M54 (or the complete ordered chain through M54) with linked-project safeguards.
2. Run M43, M44, M53, and M54 verification functions on a disposable environment and then the production target.
3. Generate and commit/check `database.generated.ts`, then fail CI on schema/type drift.
4. Record applied migration versions/checksums and create a forward-recovery/restore runbook.

**Exit criteria:** a clean database can be built from migrations; the live migration ledger matches Git through M54; all verifier rows pass; generated types are clean.

### 3. Establish CI/CD and deployment proof

1. Add one `npm run ci` command covering typecheck, migration validation, all mandatory tests, production build, and `git diff --check`.
2. Add GitHub Actions with dependency caching, security/dependency scanning, and required checks.
3. Add Playwright browser E2E for owner auth/provisioning/publish, public slug rendering, guest/auth booking, cancellation, and Razorpay sandbox success/failure/webhook paths.
4. Add preview-deployment smoke tests for `/api/health`, API routing, auth callback, real public host/path, and Supabase connectivity.

**Exit criteria:** every release is reproducible and blocked automatically on failures.

### 4. Harden payments and customer operations

1. Implement provider-backed full/partial refunds with idempotency and webhook reconciliation.
2. Implement atomic rescheduling with slot conflict protection and payment linkage.
3. Build an operator reconciliation view/queue and webhook replay procedure.
4. Verify Razorpay live/sandbox configuration, webhook registration, secrets, settlements, and failure handling.

### 5. Add production security/privacy controls

1. Configure CSP and other security headers at the deployment edge.
2. Add distributed rate limiting/bot controls for public and paid endpoints.
3. Harden production Supabase Auth URLs, email confirmation, password policy, CAPTCHA/MFA as appropriate, SMTP, and redirect allowlists.
4. Implement deletion/export/correction/retention workflows and versioned legal consent.
5. Enable secret, dependency, SAST, and RLS/migration checks in CI.

### 6. Add observability and performance gates

1. Integrate centralized frontend/backend error reporting with PII scrubbing and release IDs.
2. Add structured logs, request IDs, traces, webhook/payment metrics, dashboards, and actionable alerts.
3. Replace local usage tracking with consent-aware server analytics.
4. Split the large frontend bundle and enforce a performance budget.
5. Add uptime/deep-health checks and incident runbooks.

### 7. Complete lower-priority product capabilities

1. Wire reviews/video likes/referrals/notifications to durable authorized backend services where they are product requirements.
2. Add provider-backed email/SMS/WhatsApp notifications with retry/delivery state.
3. Add Instagram/Facebook/TikTok metadata providers if promised in launch scope.
4. Generate actual sitemap/robots outputs and consider SSR/prerendering for public salons.
5. Complete accessibility, cross-browser, and mobile-device audits.

## Production acceptance checklist

Do not mark production ready until all of the following are evidenced:

- [ ] M41–M62 are applied in order; M53 then M54 are confirmed in the live migration history; M60/M61/M62 verifiers pass (`db:verify:live:m60|m61|m62`).
- [ ] `verify_m43_*`, `verify_m44_*`, `verify_m53_*`, and `verify_m54_workspace_bootstrap()` pass on the target.
- [ ] A clean existing-account browser trace shows Auth → profile → membership → organization → salon → website → workspace without `428C9`.
- [ ] Refresh, logout/login, direct `/dashboard`, and retry all revalidate the current Auth identity and resolve the same canonical tenant.
- [ ] Anon users can read only the intended M44 public projection.
- [ ] Owner/customer/private/payment-secret rows cannot be read anonymously.
- [x] Owner dashboard uses authoritative server bookings/payments, not local mock records (repository; `test:owner-canonical-bookings`).
- [ ] One canonical lifecycle covers guest/auth booking, availability, dashboard, customer history, and payments.
- [ ] Razorpay sandbox E2E passes for success, failure, cancellation, duplicate webhook, delayed webhook, and signature rejection.
- [x] Refund and paid-cancellation policy is implemented and tested (repository; M60 + `test:m60` 12/12 — live Razorpay refund still needs a sandbox execution).
- [x] Atomic customer reschedule with payment linkage is implemented and tested (repository; M61 + `test:m61` 12/12).
- [x] Privacy export/erasure is implemented and tested (repository; M62 + `test:m62` 8/8).
- [ ] Wildcard DNS/TLS and real published slugs pass desktop/mobile smoke tests.
- [ ] Production auth URLs, confirmations, redirects, SMTP, CAPTCHA/MFA policy, and password settings are verified.
- [x] CI runs a documented mandatory suite and blocks release (`.github/workflows/ci.yml` + `npm run ci`).
- [x] Request correlation, structured logs, baseline security headers and deep health are wired (repository; `test:m63` 6/6) — centralized sink/alerting stays operator-side.
- [x] A forward-fix/restore runbook exists (`docs/release-rollback-runbook.md`) — quarterly restore drill remains operational.
- [ ] Error monitoring sink and alerts are attached to the structured logs/deep health.
- [ ] Performance, accessibility, and browser E2E gates meet agreed launch thresholds.

## Final classification

- **Product UI breadth:** strong, with several durable-backend gaps.
- **White-label publishing implementation:** strong in repository; live deployment unverified.
- **Supabase/RLS design:** substantial and security-conscious; the generated-membership workspace incident is fixed in source, but release automation/live state is incomplete.
- **Authenticated workspace bootstrap:** **PASS locally / EXTERNAL live**; M54 verified live 6/6 by the operator; a fresh post-deploy browser trace is still outstanding.
- **Booking/payment production operations:** the dashboard now reads canonical server bookings; refunds (M60), reschedule (M61) and privacy lifecycle (M62) are implemented with regressions — live Razorpay sandbox execution and settlement reconciliation remain external.
- **Automated local regression coverage:** strong and broad; the full Phase 17.10 acceptance command passes locally; M60–M63 remediation suites (38 checks) added.
- **CI/CD, observability, and operational readiness:** CI is implemented (`ci.yml` + `npm run ci`); request ids/structured logs/security headers/deep health/robots/sitemap are wired; centralized sinks, alerting and distributed rate limiting remain operator-side.
- **Overall:** **PARTIAL / not yet production-ready for real-money operation** — every repository-side FAIL from the 08-25 audit is now remediated or has an explicit runbook; the remaining blockers are live-service (EXTERNAL) actions.
