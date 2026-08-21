# HANDOFF — Nexora Salon Website Builder

> Last updated: **2026-08-21** (session `arena/01a02438-final-new-app-templete`, Phase 2D — Final Database Integrity, Cross-Repository Consistency & Production-Ready Verification).
> Read `AGENTS.md` first; read `docs/database-migrations-plan.md` before touching
> any database work.

## Current repository state

- **PHASE 2D — FINAL VERIFICATION & FIX: COMPLETE (no corrective migration
  required).**
  - `scripts/test-phase2d-final.mjs` — **21/21 PASS** with
    `NEXORA_MAIN_WEBSITE_PATH` (10 required behavior tests A–J: duplicate
    membership/slug/invalid FK/invalid latitude/invalid longitude MUST
    FAIL; soft-deleted service+product absent from active catalog;
    updated_at auto-change; invalid theme/category/salon MUST FAIL;
    cross-tenant blocked by RLS; plus schema-chain FKs, theme authority,
    salon→theme RESTRICT FK, zero orphans, RLS/grant inventory, index
    inventory, trigger inventory, idempotent M34+M35 replay, regression,
    cross-repo Main Website DDL).
  - Re-verified Phase 2C actual work (M35 + slug reconciliation + theme
    FKs + coordinate CHECKs + narrow grants). Every §1–§25 item verified;
    NO new migration needed (M28–M35 chain is complete).
  - RLS on profiles/organizations/salons is provided by the Main Website's
    live migrations in production; the canonical chain grants no base-table
    access on them. Complete fresh-chain policy design is Phase 3's
    mandate (documented, not a Phase 2D defect).
  - Repo 1: `test:phase-2d` chain exit 0, lint PASS, build PASS,
    typecheck NOT AVAILABLE (no script). Repo 2: typecheck PASS, lint FAIL
    (3 pre-existing errors, unchanged, no repo-2 file modified), build
    BLOCKED by fail-closed credential guard. Type generation BLOCKED (no
    pipeline in either repo; requires live credentials).
  - Full report: `docs/phase-2d-final-verification.md`.
  - NEXT: apply M28–M35 to `qwaehqsmodekbgvnaavz` (exact manual steps in
    the report), then Phase 3 (complete RLS/auth policy work incl.
    profiles/organizations/salons RLS on fresh chains). Do not touch
    M01–M35; new schema work must be additive migrations after M35.

- **PHASE 2C — ACTUAL IMPLEMENTATION & FINAL VERIFICATION: COMPLETE.**
  - M35 `20260821000801_m35_phase2c_canonical_theme_slugs.sql` (additive,
    idempotent, single transaction): reconciles the Full-Service Family Salon
    theme's public slug to **`full_service_family_salon`** (the Phase 2C
    brief's explicit canonical slug, superseding Phase 2B's keep-as-is
    decision). `theme_id` stays `family_full_service` — the stable internal
    key used by both repos' type layers and seeds; no application references
    change because nothing in either repo references `themes.slug`.
    Reconciliation is deterministic (only from `slug IS NULL` or
    `slug = theme_id` legacy states); `themes.slug` UNIQUE re-asserted; a
    verification block raises unless all five canonical slugs exist exactly
    once. Four-role mapping verified readable
    (owner/staff = `organization_members.role`, customer/admin =
    `profiles.platform_role`).
  - **Verification**: `test-phase2c-final.mjs` 20/20 with
    `NEXORA_MAIN_WEBSITE_PATH` (all seven required DB tests: duplicate
    membership FAILS, duplicate slug FAILS, invalid FK FAILS, soft-deleted
    service/product absent, `updated_at` auto-refresh, invalid
    category/theme/salon FAILS, cross-tenant RLS denies); `test:phase-2c`
    chain green; repo 1 lint + build green; repo 2 typecheck green; repo 2
    lint/build fail/block exactly as before (pre-existing, no repo-2 file
    modified). Type generation is BLOCKED for both repos (no supabase
    CLI/config and no live credentials; repo 2 has no `Database` generic) —
    hand-synced types verified by lint/typecheck.
  - Full report: `docs/phase-2c-final-implementation.md`.
  - NEXT: apply M28–M35 to the shared project `qwaehqsmodekbgvnaavz` via
    Supabase CLI/SQL editor (exact manual steps in the report), then Phase 3
    (auth/RBAC/RLS policy work). Do not touch M01–M34; new schema work must
    be additive migrations after M35.

- **PHASE 2B — FINAL DATABASE SCHEMA HARDENING & VERIFICATION: COMPLETE.**
  - M34 `20260821000701_m34_phase2b_final_hardening.sql` (additive,
    idempotent, post-M33): replaced every CASCADE FK from business-owned
    tables to `salons` with RESTRICT (services, staff, offers, salon_hours,
    salon_public_websites, business_locations, salon_media — discovered via
    catalog so it works on both the live repo-2 schema and the M28 replay);
    salon_media service/product composite FKs CASCADE → RESTRICT; canonical
    TEXT+CHECK role constraints re-asserted; `deleted_at` asserted on
    `staff` (Main Website marketplace query contract) plus the M33 set;
    `organization_members.updated_at` added + `trg_phase2_set_updated_at`
    attached where no existing BEFORE ROW trigger exists; canonical family
    slug `family_full_service` kept (brief's `full_service_family_salon` is
    an example name) with `themes.slug` uniqueness re-asserted; safe
    security-barrier views `active_services`, `active_products`,
    `active_service_categories` (public-safe columns only); index set
    verified (services/products/categories/org_members/bookings/locations).
  - **App-side fix**: `src/lib/salonMediaService.ts` `listPublicSalonMedia`
    now filters `.is('deleted_at', null)` (public media catalog).
  - **Validation**: `test:phase-2b` = validate:migrations + phase-2a suite +
    `test-phase2b-hardening.mjs` (19/19 with `NEXORA_MAIN_WEBSITE_PATH`,
    including the 8 mandatory final DB tests: duplicate membership FAILS,
    duplicate theme slug FAILS, invalid FK FAILS, soft-deleted service and
    product absent from active catalog, `updated_at` auto-refresh, cross-theme
    category/service pair FAILS, cross-tenant RLS denies); repo 1 lint
    (tsc --noEmit) green, build green; repo 2 typecheck green, repo 2 build
    blocked by design (build scripts fail closed without real
    `qwaehqsmodekbgvnaavz` Supabase credentials), repo 2 lint fails on 3
    pre-existing errors (SplashOverlay.tsx:63 setState-in-effect;
    nexora-app.tsx:6162 unescaped entities ×2).
  - Full report: `docs/phase-2b-final-hardening.md`.
  - NEXT: apply M34 to the shared project `qwaehqsmodekbgvnaavz` via Supabase
    CLI/SQL editor (exact manual steps in the report), then Phase 3
    (auth/RBAC/RLS policy work). Do not touch M01–M33; new schema work must
    be additive migrations after M34.

- **PHASE 2A — SCHEMA RECONCILIATION + DATABASE HARDENING: COMPLETE.**
  - Re-inspected every claimed gap against both repositories and fixed the
    confirmed ones in `supabase/migrations/20260821000601_m33_phase2a_hardening.sql`
    (additive, idempotent, fail-closed). Details:
    `docs/phase-2a-schema-reconciliation-hardening.md`.
  - **Canonical decisions (verified, not assumed)**: `salons`/`salon_id` is the
    one canonical entity/FK (the `businesses`/`business_id` surface lives only
    in the never-applied M01–M27 draft layer); roles are ONE two-scope system
    (`profiles.platform_role` global + `organization_members.role` tenant);
    five themes stay canonical with `family_full_service` as the stable slug
    (existing key, not the prompt's example variant).
  - **M33 fixes**: canonical-naming guard (fails closed on any
    `business_id` column in the 20 canonical tables); named UNIQUE constraint
    `organization_members_organization_user_key` + deterministic duplicate
    repair RPC (`phase2a_repair_membership_duplicates`, ctid-keyed — the join
    table has no id column); `deleted_at` on `salon_media`,
    `service_categories`, `product_categories` (salons/services/products
    already had it); indexes `services_phase2a_salon_active_idx` +
    `service_categories_phase2a_theme_active_idx` (EXPLAIN-verified);
    `phase2a_foundation_health()` service_role RPC; RLS surface untouched.
  - **Types**: `src/types/database.ts` gained `deleted_at` on
    `SalonMediaRow`, `ServiceCategoryRow`, `ProductCategoryRow`.
  - **Validation**: `test:phase-2a` = validate:migrations (27/27 ×2 + 21/21) +
    phase1a (11/11 + 3/3) + phase2 (17/17) + phase2a (15/15, 17/17 with
    `NEXORA_MAIN_WEBSITE_PATH` — Main Website contract + 93 DDL statements
    apply on the hardened schema); `validate:main-website` 10/10; lint 0;
    build green.
  - NEXT: Phase 3 (auth/RBAC/RLS policy work). Do not touch M01–M33; new
    schema work must be additive migrations after M33.

- **PHASE 17.3 — UPCOMING APPOINTMENTS: COMPLETE (50 tests).**
  - The Upcoming Appointments section of the Owner Dashboard, over the
    EXISTING booking/payment + ownership architecture. Booking status
    management, customer management, revenue, calendar and
    notifications remain unimplemented (17.4+).
  - **Reuses 17.2 rather than forking it**: same payment-record source,
    same `TodayAppointment` projection, same money/service helpers,
    same `ownerBookingTenant()` session-derived tenant candidates, same
    `readSalonBookings()` (permission re-checked per key, tenant-keyed,
    refusal on ANY key refuses the whole read, rows de-duplicated).
    `job_salon_members` is not used. **No schema change.**
  - **Shared row extracted**: the 17.2 row markup moved to
    `OwnerAppointmentRow.tsx` and BOTH sections now render through it —
    one renderer, not two drifting copies. 17.2 stayed 49/49.
  - **Window**: strictly AFTER the salon-local calendar day, matching the
    section's own 17.1 description and guaranteeing no booking appears in
    both Today and Upcoming. `dateKey` is `YYYY-MM-DD` so lexical order
    IS chronological order; `toISOString()` is never used. Cancelled and
    failed rows are EXCLUDED per the existing inactive-slot rule.
  - **Ordering**: nearest first — date → start → end → booking id.
  - **Grouping**: by the row's own date, nearest day first, with the real
    localized date, a relative badge (Tomorrow / In N days / Later) and a
    per-day count. Days with no bookings are never emitted.
  - **Fields**: customer name + mobile, service(s) incl. multi-service
    lines, date, time, duration, booking status, payment status, total,
    advance, remaining, staff, booking id — all read from the record;
    advance/remaining only when non-zero.
  - States: loading skeletons (`aria-busy`), empty, error + Retry,
    unauthorized refusal card. Responsive 1/2/4-column grid; EN/HI;
    light/dark. Re-reads on `PAYMENT_EVENT` / `SALON_CLOCK_EVENT`.
  - New: `src/lib/ownerUpcomingAppointments.ts`,
    `src/components/OwnerUpcomingAppointments.tsx`,
    `src/components/OwnerAppointmentRow.tsx`,
    `scripts/test-phase-17.3.mjs`. Additive: `ownerDashboardI18n.ts`
    (`upcoming.*` + `ownerDashboardCount`), `OwnerDashboard.tsx`,
    `OwnerTodayAppointments.tsx` (refactor only). Three earlier
    assertions updated for the new reality.
  - Validation: `test:phase-17.3` **50/50**; 17.2 49/49; 17.1 56/56;
    lint 0; verify-22-screens 25/25; build green; regressions 10.6
    107/107, 14.6 26/26, 15.6 34/34, 16.7 39/39, 16.9 47/47, 16.10
    68/68. Details: `docs/phase-17.3-upcoming-appointments.md`.
  - NEXT: Phase 17.4. Status mutations stay in 16.7's panel.

- **PHASE 17.2 — TODAY'S APPOINTMENTS: COMPLETE (49 tests).**
  - The Today's Appointments section of the Owner Dashboard, over the
    EXISTING booking/payment + ownership architecture. Upcoming
    appointments, customer management, revenue, calendar and
    notifications remain unimplemented (17.3+).
  - **Source audited first**: bookings live in the Phase 10.7/16.5
    payment-record store (`nexora_site_payment_records`) with tenant
    keys, 16.5 service lines, slot snapshot, money snapshot and customer
    snapshot. The draft `public.bookings` table (M08) is still
    UNAPPLIED, so 17.2 reads the same source 16.7 does — no duplicate
    store, table, column or id, and **no schema change**. The only
    DB-facing delta is selecting the EXISTING `salons.organization_id`.
  - **Own salon only**: actor + tenant keys are both session-derived
    (`ownerBookingTenant()` → organization_id → salon id → the engine's
    own `public-site` fallback); every read goes through 16.7's
    `readSalonBookings()` which re-checks the permission and is
    tenant-keyed. A refusal on any key refuses the whole read (never a
    partial/silent empty list); rows de-duplicate by record id.
    `job_salon_members` is not used.
  - **Displayed** (all read from the record): customer name + mobile,
    service(s) incl. multi-service lines, start–end time, duration
    (slot span only), booking status, payment status, total, advance
    paid, remaining, optional staff, booking id. Advance/remaining show
    only when non-zero; a missing name falls back to neutral copy.
  - **Chronological** by start time (ties: end time, then booking id).
  - **Status groups from EXISTING values only**: pending
    (`pending_payment`), confirmed (`confirmed`, `pay_at_salon`),
    completed, cancelled (`cancelled`, `failed`) — four visually
    distinct chips; cancelled rows dim, strike the time and carry a
    "slot is free" note while keeping their chronological position.
  - "Today" is the salon-local calendar day (`salonNow()` +
    `localDateKey()`), never UTC. The list re-reads on the existing
    `PAYMENT_EVENT` / `SALON_CLOCK_EVENT`.
  - States: loading skeletons (`aria-busy`), empty, error + Retry, and
    an unauthorized refusal card reusing 16.7's denial copy. Responsive
    1/2/4-column field grid; EN/HI; light/dark.
  - New: `src/lib/ownerTodayAppointments.ts`,
    `src/components/OwnerTodayAppointments.tsx`,
    `scripts/test-phase-17.2.mjs`. Additive: `ownerDashboard.ts`
    (`organizationId`, `ownerBookingTenant`), `ownerDashboardI18n.ts`
    (`today.*`), `OwnerDashboard.tsx`. Two 17.1 assertions updated for
    the new reality (still 56/56).
  - Validation: `test:phase-17.2` **49/49**; `test:phase-17.1` 56/56;
    lint 0; verify-22-screens 25/25; build green; regressions 10.6
    107/107, 14.6 26/26, 15.6 34/34, 16.7 39/39, 16.9 47/47, 16.10
    68/68. Details: `docs/phase-17.2-today-appointments.md`.
  - NEXT: Phase 17.3. Status mutations stay in 16.7's panel.

- **PHASE 17.1 — SALON OWNER DASHBOARD FOUNDATION: COMPLETE (56 tests).**
  - The foundation + navigation of the Salon Owner Dashboard, built on
    the EXISTING auth and salon-ownership architecture. Appointment
    lists, customer management, revenue calculations, calendar logic
    and notifications are deliberately NOT implemented (17.2+).
  - **Ownership reuses the existing chain verbatim**: `auth.users.id →
    organization_members (role='owner', active) → organization_id →
    salons.organization_id → salons.id`, through the existing
    `resolveOwnerSalonId()` (helper `nexora_owner_salon_ids()` with the
    equivalent join as fallback) — the same pattern 14.6/15.6/16.7 use.
    `job_salon_members` is NOT consulted (asserted in tests after
    stripping comments). No salon id is hardcoded, invented, or accepted
    as a prop/URL param/storage key: `<OwnerDashboard />` takes no props.
  - **Own salon only**: one read of the session-resolved row over
    existing columns (`id, name, slug, address, city, is_active`,
    `deleted_at is null`). Every non-authorized access returns
    `{ salon: null }`, so an unauthorized viewer gets no salon data at
    all — not even a name. Multiple owned salons → `ambiguous` refusal
    (never an arbitrary pick).
  - **Structure created** for Overview, Today's Appointments, Upcoming
    Appointments, Customers, Revenue/Payments, Calendar, Notifications.
    Overview shows the real salon identity card; the other six are
    navigable placeholders. No counts, amounts, customers or bookings
    are invented anywhere; missing fields render "Not added yet".
  - **No duplicate dashboard system**: the existing post-launch
    dashboard (screens 18–25 in `Landing.tsx`) is untouched; the owner
    dashboard is a sibling module (`activeModule='owner-dashboard'`,
    screen 26) inside the same `App.tsx`/`TopBar` chrome.
  - **No database changes**: read-only, existing columns only; M01–M27
    remain unapplied drafts and no new migration was added.
  - States: loading skeletons, empty block, error + Retry, and a
    per-reason unauthorized card (`role="alert"`; retry offered only for
    transient failures). Refusal copy never leaks SQL/tables/codes.
  - Responsive: desktop labelled sidebar, tablet icon rail (title +
    sr-only), mobile pills + slide-over drawer. EN/HI and Light/Dark run
    on the EXISTING `siteNavigation` locale/appearance buses.
  - New: `src/lib/ownerDashboard.ts`, `src/lib/ownerDashboardI18n.ts`,
    `src/components/OwnerDashboard.tsx`, `scripts/test-phase-17.1.mjs`.
    Additive: `App.tsx`, `TopBar.tsx`, one allowlist line in
    `scripts/test-phase-16.10.mjs` for the new UI-preference store key
    `nexora_owner_dashboard_section`.
  - Validation: `test:phase-17.1` **56/56**; lint 0; verify-22-screens
    25/25; regressions green (10.1 80/80, 10.6 107/107, 11.8 450/450,
    12.1 84/84, 14.6 26/26, 15.6 34/34, 16.7 39/39, 16.9 47/47,
    16.10 68/68). Details:
    `docs/phase-17.1-owner-dashboard-foundation.md`.
  - NEXT: Phase 17.2. Do not fill a section without re-running
    `test:phase-17.1`.

- **PHASE 16.10 — FINAL BOOKING ACCEPTANCE TESTING: COMPLETE (68 tests).**
  - Final acceptance gate for the ENTIRE Phase 16 booking & appointment
    system. **Acceptance-only: no product source changed** — one suite
    (`scripts/test-phase-16.10.mjs`, `npm run test:phase-16.10`) plus
    docs. Phase 16 is accepted and closed.
  - Coverage: end-to-end journey on all five themes (pay-at-salon ×5 +
    a full advance gateway journey, each ending on a persisted record);
    theme/salon isolation (services, records, holds, drafts,
    confirmations); real price/duration/advance math (offer-aware
    Phase 13 pricing, multi-service totals, combined sitting, slot
    interval, pct clamping); availability (window, closed days,
    holidays, min notice, hours bounds, booked spans, holds, staff
    windows, dead-slot re-validation); validation (model + blur-driven
    UI errors, Continue gating); payment states with the
    no-confirm-before-payment invariant (pending/paid/failed/
    cancelled/timeout; `bookingConfirmationState` fails closed; no
    invented refunds); duplicate protection (double-click locks,
    idempotency keys, retry-reuses-the-same-row); customer/owner access
    boundaries (actor matrix, tenant-keyed reads, status machine,
    denied UI, no row leakage); Call/WhatsApp protection (16.8 gate:
    only a real paid advance unlocks, pay_at_salon does not, expired/
    cancelled re-lock, salon+theme scoped); hygiene scans (no secrets,
    placeholder env, `nexora_*` store-key allowlist, schema-only record
    fields); EN/HI + light/dark; responsive structure; Phase 10–15
    integration spot checks (locale/appearance stores, catalog
    filtering, 50-video catalog intact).
  - Validation: `test:phase-16.10` **68/68**; regressions spot-checked
    16.1 55/55 + 16.9 47/47 (no product source changed, the full 16.x
    battery from the 16.9 session stands); lint 0; build green;
    verify-22-screens 25/25. Details:
    `docs/phase-16.10-final-acceptance.md`.
  - NEXT: Phase 17. Do not modify the booking layers without re-running
    `test:phase-16.10` plus the 16.1–16.9 suites.

- **PHASE 16.9 — BOOKING NOTIFICATIONS & UX: COMPLETE (47 tests).**
  - UX hardening over the EXISTING booking journey (Salon → Service →
    Date → Time → Customer → Payment → Confirmation) on the existing
    10.6/16.x entry flow + 10.7/16.5 payment engine + 16.6/16.7 status
    layers. No invented tables/columns/ids, no fake success states, no
    DB execution.
  - **Notices wire the EXISTING `onShowToast` seam** (10.6/10.7/16.6/16.7
    already emitted through it; the public-site host dropped those
    messages). One presenter (`SiteBookingNotices`, mounted by
    `SiteBookingFullFlow`) renders typed notices — success / warning /
    error / info — colour-coded from the existing payment surfaces
    (Light/Dark + five themes), `aria-live="polite"` + `role="status"`,
    labelled dismiss, auto-dismiss (paused on hover/focus), capped
    stack, reduced-motion respected. Legacy string callers normalize to
    `info` — no new notification bus/store/event invented.
  - **Feedback for every outcome, derived from persisted records**:
    booking success (real reference), payment success (only when the
    row is `paid`+`confirmed` — a success without a paid row fails
    closed), payment pending (attempt start / retry / resumed pending
    row), payment failed (human-readable reason), payment timed out
    (record → `failed`, now distinct from cancellation via the engine's
    `cancel(reason, outcome)`), payment cancelled, booking cancelled
    (customer + owner), booking errors (slot lost, service limits,
    duplicates, service-missing). No notice ever contains customer,
    salon or payment identifiers (test-enforced).
  - **Duplicate submissions**: entry-flow navigation lock (no step
    skipping on double-click), guarded summary hand-off, option-step
    ref guard (one pay-at-salon row), the existing 16.5 gateway lock
    unchanged (one pending notice per attempt).
  - **Data preservation**: draft still clears ONLY on confirmation;
    failure keeps record + draft; back-to-summary and re-open restore
    everything; retry reuses the same row. The result screen **stays
    visible during a retry** (fixed: `retryGateway` used to blank it by
    clearing `gatewayResult`).
  - **Loading states disable only the processing action**: gateway
    processing disables methods + back, keeps cancel; retry-in-flight
    disables only the sibling actions (spinner + `aria-busy` on retry).
  - **Empty/error states**: services + slots re-verified; NEW date-step
    loading/error(+Retry)/empty states on their own test seam (separate
    from the 16.3 `booking` flag); bookings loading/error/empty
    re-verified; the orchestrator's hardcoded "Service not found"
    fallback is now a localized, themed recovery card.
  - **Confirm before destructive cancellation**: gateway cancel (two
    step), customer booking cancel (inline themed panel replaces
    `window.confirm`), owner booking cancel (inline panel). Confirm /
    Complete stay one click.
  - **Validation + a11y**: details errors now surface on blur per field
    with `aria-invalid`/`aria-describedby` (the 10.6 gating contract is
    unchanged — Continue only enables when valid); steppers carry
    `aria-current="step"`; dismiss buttons have localized aria-labels
    and 44px targets.
  - NOT in 16.9: final acceptance testing (16.10), DB execution.
  - Earlier walk updates (no tests deleted): 10.7/16.5/16.6/16.7 now
    confirm gateway cancellations; 10.7's engine timeout assertion
    expects the explicit `timeout` → `failed` outcome; 16.7 gained a
    keep-booking test (38 → 39); 10.6/16.1/16.2/16.3 harnesses
    normalize typed notices to message text.
  - Validation: `test:phase-16.9` **47/47**; 16.1 55, 16.2 55, 16.3 36,
    16.5 24, 16.6 54, 16.7 39, 16.8 74; 10.4 118, 10.6 107, 10.7 67,
    10.9 77; 11.3 249, 11.6 377, 11.8 450; 12.3 74; lint 0; build
    green; verify-22-screens 25/25. Details:
    `docs/phase-16.9-booking-notifications-ux.md`.

- **PHASE 16.8 — CALL / WHATSAPP / BOOK ACTION PROTECTION: COMPLETE (74 tests).**
  - Call, WhatsApp and Book Online are protected by the EXISTING
    booking/payment/auth architecture (the 10.7/16.5 record store +
    the 16.6 state rule). No duplicate booking system, no invented
    tables/columns/ids and no fake payment records; M08/M09 stay
    unapplied drafts and no DB was executed.
  - **Single authorization point** `src/lib/siteContactAccess.ts`
    (read-only): `resolveContactAccess` / `resolveSiteContactAccess`,
    `findUnlockingBooking`, `authorizeContactOpen`,
    `contactAccessAudit`, `isBookingExpired`, `displayContactNumber`.
    Unlock requires ALL of: this browser's identity, this salon +
    theme, `paymentStatus==='paid'`, a 16.6 confirmed state,
    `amountDue > 0`, and a slot that has not finished. `pay_at_salon`
    does NOT unlock (no advance was taken).
  - **One shared control** `SiteProtectedContactAction` is now the ONLY
    thing that may emit a salon contact target; the 5 heroes, floating
    actions, mobile action bar, footer, final-CTA/section states and
    the Family + NailLash contact rows all render it. A test asserts no
    other public-site file builds a `tel:`/`wa.me` link.
  - **Bypass resistance**: while locked the markup contains no href, no
    `tel:`, no `wa.me` and no digits (printed numbers are masked), and
    the click handler re-verifies against the store — so tampering with
    `data-locked`/`href` in devtools opens nothing. Mirrors the draft
    server rule: M08 pins 25% (`(service_price_paise + 3) / 4`), M09
    `verification_status`, M11 `verify_payment()` is SECURITY DEFINER +
    service_role-only, M12 has no anonymous booking/payment write policy.
  - States: unlocked / payment-required / payment-pending /
    payment-failed / cancelled / expired / unavailable, each with its
    own EN+HI message quoting the salon's OWN advance percentage, plus
    a lock notice that routes into the single existing booking flow.
  - Privacy: another customer's, salon's or theme's paid booking can
    never unlock this page; the href always comes from the viewed
    salon's own data.
  - NOT in 16.8: notifications, final acceptance testing.
  - Earlier suites that asserted always-exposed contacts (10.4, 10.7,
    10.9, 11.3, 11.6, 11.8) now assert the protected semantics; none
    were deleted and 10.7 gained a test. Details:
    `docs/phase-16.8-contact-action-protection.md`.
  - Validation: `test:phase-16.8` **74/74**; 10.4 118, 10.7 67, 10.9 77,
    11.3 249, 11.6 377, 11.8 450; Phases 10–15 fully green; 16.1 55,
    16.2 55, 16.3 36, 16.5 24, 16.6 54, 16.7 38; validate:migrations
    21/21; lint 0; build green; verify-22-screens 25/25.

- **PHASE 16.6 — BOOKING CONFIRMATION: COMPLETE (54 tests).**
  - A clear Booking Confirmation screen over the EXISTING booking /
    payment / auth architecture (the 10.7/16.5 record store) — no
    duplicate booking system, no invented tables/columns/ids/amounts;
    M08/M09 stay unapplied drafts.
  - **Real data, existing reference**: salon, service(s), date, time,
    duration, total, advance paid, remaining, payment status, booking
    status and the reference produced by the EXISTING
    `generateBookingId()` (`PaymentRecord.bookingId`, `NX-#####`). Money
    comes through the shared 16.7 `bookingMoney` rule, so the
    confirmation and the booking list can never disagree.
  - **New read-only layer** `src/lib/siteBookingConfirmation.ts`:
    `bookingConfirmationState`, `toBookingConfirmation`,
    `readBookingConfirmation` / `readMyBookingConfirmations` (own rows
    only — identity read INSIDE the helper, tenant+theme keyed),
    `findActiveBookingForContext` / `bookingContextKey`,
    `bookingConfirmationReceiptText`. It never writes to the store.
  - **States**: Confirmed / Payment Pending / Payment Failed / Cancelled
    (+ the 16.7 `completed`), each with its own colour, headline and
    chip. **"Confirmed" is never shown until the required advance
    actually succeeded** — a row claiming `confirmed` while unpaid
    fail-closes to Payment pending/failed. `pay_at_salon` (no advance
    required) is a legitimate confirmed path.
  - **Shared panel** `SiteBookingConfirmation.tsx` renders BOTH the
    payment flow's confirmation step (as `payment-confirm-card`, 10.7
    test ids preserved) and the re-openable **summary/receipt in the
    booking history** (a View-summary toggle per row in
    `SiteMyBookings`), plus a downloadable text summary.
  - **Duplicate protection**: before ANY record creation the flow looks
    for a live booking with the same salon+theme+services+date+slot+
    mobile (digits, country code stripped) owned by THIS browser; an
    already-confirmed match re-opens its confirmation, a pending match
    donates its reference. Failed/cancelled rows stay re-bookable.
    Refresh / re-entry / retry / double Continue all yield ONE record.
  - Privacy: foreign customers, salons and themes are structurally
    unreachable (`not-found`, never data).
  - Loading / error(+Retry) via the shared 'booking' seam, not-found
    card, payment-failure reason, retry-payment action for recoverable
    states; EN/HI complete; light/dark + five distinct theme surfaces;
    mobile-first fluid layout (desktop/tablet/mobile).
  - NOT in 16.6: Call/WhatsApp protection, notifications, final
    acceptance, DB execution; 16.7 was reused, not re-implemented.
  - Validation: `test:phase-16.6` **54/54**; 16.1 55, 16.2 55, 16.3 36,
    16.5 24, 16.7 38; 10.6 107; 10.7 66; Phases 10–15 fully green;
    `validate:migrations` 27/27 ×2 + 21/21; lint 0; build green;
    verify-22-screens 25/25. Details:
    `docs/phase-16.6-booking-confirmation.md`.

- **PHASE 16.7 — BOOKING MANAGEMENT: COMPLETE (38 tests).**
  - Booking management over the EXISTING booking/payment/auth architecture
    (the 10.7/16.5 record store IS the booking list — no duplicate system,
    no new tables; `bookings`/M08 stays an unapplied draft that this layer
    mirrors).
  - **Customer "My Bookings"** (`SiteMyBookings`, mounted in the booking
    flow's salon step): own rows ONLY — `readMyBookings` reads the browser
    identity INSIDE the helper, so another customer's private rows are
    structurally unreachable. Status chip + salon/services/date/time/
    total/advance/remaining/payment-status + cancel (own, not-yet-completed
    rows). Renders nothing for first-time visitors.
  - **Owner panel** (`BookingManagementPanel` in the dashboard bookings
    tab): session-resolved actor via the EXISTING `useAuth` +
    `resolveOwnerSalonId` chain (14.6/15.6 pattern); tenant =
    `bookingBusinessId(data)` — never typed in. Full detail rows, status
    filters, actions per the machine, denial card for unauthorized actors.
    The old demo planner stays untouched below the real panel.
  - **Status machine** (draft-spec aligned; `completed` added additively to
    `BookingStatus`): pending→confirm/cancel; confirmed/pay-at-salon→
    complete/cancel; terminal immutable. Completing settles the remaining
    balance at the salon; owner-cancel keeps paid amounts (no invented
    refunds). All transitions validated in `bookingManagement.ts` —
    permission + row ownership + legality re-checked inside every
    read/mutation, not just hidden buttons.
  - Isolation verified: foreign-salon rows `not-found` even for authorized
    actors; unauthorized actors get refusals, never data; foreign-theme /
    foreign-customer rows never render.
  - Loading / error(+Retry) / empty / cancelled states via the shared
    'booking' seam; EN/HI full tables; light/dark via existing surfaces;
    responsive card layouts.
  - NOT in 16.7: Call/WhatsApp protection, notifications, final acceptance,
    DB execution, refunds.
  - Validation: `test:phase-16.7` **38/38**; 16.1 55, 16.2 55, 16.3 36,
    16.5 24; 10.6 107; 10.7 66; Phases 10–15 fully green;
    `validate:migrations` 27/27 ×2 + 21/21; lint 0; build green;
    verify-22-screens 25/25. Details:
    `docs/phase-16.7-booking-management.md`.

- **PHASE 16.5 — ADVANCE PAYMENT / DEPOSIT: COMPLETE (24 tests).**
  - The 16.x booking flow is connected to the EXISTING Phase 10.7 payment
    architecture — single AND multi-service selections now hand off to the
    same payment flow (the 16.2 "later phase" placeholder is closed).
  - **Real-total math**: booking total = Σ offer-aware line prices from the
    16.2 selection engine; the 25% advance derives from that total via the
    EXISTING `calculatePaymentAmounts` + `bookingRules.advanceDepositPercentage`
    (default 25, clamped; configured percentages honoured). Never hardcoded.
  - The option step shows the complete booking summary (every line for
    multi-service) plus an explicit **Total / Advance now (pct) / Remaining**
    breakdown (`payment-amount-breakdown`).
  - Additive store shape: `PaymentServiceLine` + optional
    `PaymentRecord.services` / `ReceiptView.services`; pre-16.5 rows parse
    unchanged; resumed records restore their lines. Still the browser-local
    SANDBOX store — no payment tables/columns/credentials invented (M09
    stays an unapplied draft; Razorpay is later server work). Static-scan
    test enforces no service-role/gateway-secret strings in frontend code.
  - **No-confirm-before-payment** invariant re-verified for advance:
    pending → `pending_payment`; success → `paid`+`confirmed` together;
    failure/cancel/timeout → never confirmed; retry reuses the SAME row.
  - **Duplicate-submission guard**: synchronous ref lock on
    `startGatewayAttempt` + `retryGateway` (two clicks in one tick → one
    record, one attempt), on top of the existing idempotency keys.
  - Context preserved end-to-end (salon/theme/lines/date/slot/customer into
    the record + confirm screen); back-from-payment lands on the Booking
    Summary with the 16.1-draft-restored selection (`resumeAtSummary`).
  - EN/HI additions (`summary.totalAmount/advanceAmount/remainingAmount/
    servicesCount`, `summary.paymentNext`); light/dark via existing
    surfaces; responsive unchanged. Sandbox labels kept (EN+HI).
  - NOT in 16.5: confirmation extras, notifications, booking management,
    Call/WhatsApp protection, real Razorpay/M09 execution.
  - Validation: `test:phase-16.5` **24/24**; 16.2 updated hand-off test
    55/55; 16.1 55/55; 16.3 36/36; 10.6 107/107; 10.7 66/66; Phases 10–15
    fully green; `validate:migrations` 27/27 ×2 + 21/21; lint 0; build
    green; verify-22-screens 25/25. Details:
    `docs/phase-16.5-advance-payment-deposit.md`.

- **PHASE 16.3 — DATE & TIME SLOT SELECTION: COMPLETE (36 tests).**
  - The Date + Time step shows only **genuinely available** slots, derived
    from EXISTING data sources only (schema audited first: booking/staff
    tables are unapplied drafts M05/M08, so no tables/columns invented).
  - **Booked spans** — real booking records from the EXISTING 10.7 payment
    store, tenant+theme keyed (`bookedSpansForSalon`): `confirmed` /
    `pay_at_salon` / `pending_payment` block their span; `failed` /
    `cancelled` never; `excludeBookingId` for resumed bookings. Exact
    boundary starts/ends stay available.
  - **Staff availability** — EXISTING `TeamMember.assignedServiceIds` +
    `TeamMember.schedule` (WeeklySchedule) + `status`: when the mapping
    covers the whole selection, the sitting must fit a qualified member's
    window; `On Leave`/`Inactive` never count; no mapping → salon hours
    alone (nothing invented). Duration-aware for the 16.2 combined sitting.
  - **Salon isolation** — holds now stamp `businessId`; another salon's
    holds/records can never block this salon (legacy un-stamped holds stay
    blocking — fail-closed).
  - **Double-booking**: grid disable + `reserveBookingSlot` refusal (no
    hold row written over a booked span) + leave-step re-check; a record
    landing while the grid is open (PAYMENT_EVENT) recalculates instantly
    and clears a dead selection with a toast — never a silent swap.
  - Engine changes are additive (`BookingSlotExtras` optional on
    `bookingSlotsForDay` / `bookingSlotIsStillAvailable` /
    `reserveBookingSlot`) — every pre-16.3 call site byte-identical.
  - Availability loading / error(+Retry) / empty states via the shared
    'booking' section seam; EN/HI (`time.loading/error/retry/bookedNote`);
    light/dark; the 10.6 responsive grid unchanged.
  - New file: `src/lib/siteBookingAvailability.ts` (derivation layer above
    siteBookingFlow + siteBookingPayment — no import cycle).
  - Explicitly NOT in 16.3: customer details (16.4+), payment/advance/
    confirmation/notifications/management, server-authoritative
    availability (drafts stay unapplied), explicit staff selection.
  - Validation: `test:phase-16.3` **36/36**; 16.1 55/55; 16.2 55/55;
    10.6 107/107; 10.7 66/66; Phases 10–15 fully green; 9.1 9/9;
    `validate:migrations` 27/27 ×2 + 21/21; lint 0; build green;
    verify-22-screens 25/25. Details:
    `docs/phase-16.3-date-time-slot-selection.md`.

- **PHASE 16.2 — SERVICE SELECTION: COMPLETE (55 tests).**
  - The booking Service step is wired to the EXISTING theme-specific service
    system and gains **multi-service selection with automatic totals** —
    same single booking architecture, nothing rebuilt.
  - Rows show name, category, offer-aware price (`serviceDisplayPrice`) and
    duration; the list is still `bookingServicesForTheme` (active rows,
    theme provenance enforced — foreign/inactive rows can never render,
    resolve or total). No new IDs/tables/columns/prices/fake services.
  - Engine additions (`siteBookingFlow.ts`, additive): `toggleBookingService`
    (ordered toggle, cap `BOOKING_MAX_SERVICES` = 6), `bookingSelectedServices`
    (resolve against the active theme list only), `bookingSelectionSummary`
    (auto price+duration totals; variant-aware durations),
    `bookingCombinedSlotService` — the selection acts as ONE sitting for the
    EXISTING slot/hold engine (stable sorted-id key + summed duration; a
    single selection collapses to the plain service, so 10.6 hold keys and
    the 10.7 payment hand-off stay byte-identical).
  - UI: multi-select service cards (Add/Added), live totals panel (per-line
    price/duration + Remove, total price/duration, Clear all, limit note),
    summary line items + totals; selection changes release the held slot and
    the time step re-holds the new span. Multi-service Confirm stays on the
    summary with a localized "payment in a later phase" note (the 10.7
    engine prices exactly one service; no fake hand-off).
  - Draft store v2 (additive): `services` line items + `totalPrice` +
    `totalDurationMinutes`; 16.1 fields mirror line 1 + totals; resume
    restores the whole selection; theme/tenant isolation unchanged.
  - Loading / error(+Retry) / empty states through the SAME shared section
    seam the website 'services' section uses. EN/HI + light/dark + the
    existing responsive structure.
  - Explicitly NOT in 16.2: time slots (16.3+), payment/advance/confirmation,
    notifications, management, multi-service payment, database execution.
  - Validation: `test:phase-16.2` **55/55**; 16.1 55/55; 10.6 107/107;
    10.7 66/66; Phases 10–15 fully green; 9.1 9/9; `validate:migrations`
    27/27 ×2 + 21/21; lint 0; build green; verify-22-screens 25/25.
    Details: `docs/phase-16.2-service-selection.md`.

- **PHASE 16.1 — BOOKING FOUNDATION: COMPLETE (55 tests).**
  - The public-site booking flow gains its foundation shape:
    **Salon → Service → Date → Time → Customer Details → Booking Summary**
    — still exactly ONE booking architecture (the Phase 10.6/10.7 flow was
    extended, not rebuilt).
  - New leading **Salon confirmation step** (all five themes, themed): the
    ACTIVE salon only — name + live status chip, address, phone, theme label,
    bookable-service count, no-services empty state. Never a salon picker;
    context comes from `bookingSalonContext(data, themeId)` over existing
    data (no invented salon/user ids, no DB reads).
  - `bookingBusinessId(data)` is now the single tenant-resolution rule
    (service-row provenance → explicit payload id → `public-site` fallback),
    shared by the entry flow and the 10.7 orchestrator (which previously
    inlined the same logic).
  - **`src/lib/siteBookingDraft.ts`** — salon+theme-scoped booking drafts:
    ONE row per (business, theme, `bookingBrowserId()`), idempotent upsert,
    versioned localStorage store (`nexora_site_booking_drafts`), 24h
    staleness, `nexora:booking-draft` event, test injection. Tracks
    `in_progress` → `summary_ready`; reopening the flow resumes the
    visitor's own draft (localized resume notice); the 10.7 confirmation
    clears it. Later phases attach here: 16.2+ slot verification, advance
    payment converting a `summary_ready` draft into the existing
    `PaymentRecord`, confirmation clearing it — no rebuild needed.
  - Phase 12.3 service prefill opens on the Service step (salon implicit)
    but Back reaches the salon step — one flow. Sitting on the salon step
    writes nothing, so plain open/close is side-effect free.
  - States: no-services / no-address / broken- or disabled-localStorage /
    corrupted store all degrade gracefully. Desktop/tablet/mobile (same
    mobile-first grid + sticky bar), EN/HI (`salon.*` keys), light/dark via
    existing `bookingSurfaces`.
  - Explicitly NOT in 16.1: server time slots, 25% advance logic, payment
    changes, notifications, booking management, WhatsApp/Call protection,
    any database execution (M01–M27 stay unapplied drafts; no new tables).
  - Test updates for the 6-step structure: `test:phase-10.6` → 107/107
    (salon-first assertions added; every original behaviour kept),
    `test:phase-10.7` walk updated (66/66).
  - Validation: `test:phase-16.1` **55/55**; Phase 10 all green (10.6 107,
    10.7 66, 10.13 339, 10.12 178, …); Phase 11 2398; Phase 12 582;
    Phase 13 220; Phase 14 180; Phase 15 244; 9.1 9/9;
    `validate:migrations` 27/27 ×2 + 21/21; lint 0; build green;
    verify-22-screens 25/25. Details:
    `docs/phase-16.1-booking-foundation.md`.

- **PHASE 15.10 — FINAL 5-THEME VIDEO ACCEPTANCE: COMPLETE (73 tests).**
  - Full acceptance gate over the entire Phase 15 video system across all
    five themes: 5 Shorts + 5 Long per theme (50 unique, zero cross-theme
    copying); YouTube URL → id → thumbnail → title → description → channel
    chain; exact original-platform/channel opening; owner salon-scoped
    add/edit/replace; protected mocks never permanently deletable by owners;
    admin edit/replace/approve/delete per the capability matrix; duplicate-free
    likes; current-week Weekly Top Videos; dashboard (Landing overview) weekly
    block with thumbnails/kind/counts/original-URL clicks + empty state;
    theme/ownership/kind correctness; desktop/tablet/mobile; EN/HI + Light/Dark;
    loading/empty/error/broken-thumbnail states; lazy loading/performance;
    static hygiene scans (no fake URLs, hardcoded ids, private keys,
    service-role creds, duplicate systems, invented DB fields); Phase 10–14
    regression matrix.
  - One real defect found + fixed: `src/screens/Landing.tsx` used the `Video`
    icon in the Phase 15.9 dashboard block without importing it (lint
    `TS2304`). One-line import fix; nothing else changed in production code.
  - Validation: `test:phase-15.10` **73/73**; `test:phase-15` **244/244**;
    `lint` 0 errors; `build` green; `verify-22-screens` 25/25; Phase 10
    1259/1259, Phase 11 2398/2398, Phase 12 582/582, Phase 13 220/220,
    Phase 14 180/180; 8.3 acceptance 66/66; 9.1 9/9; `validate:migrations`
    M18 source check + 21/21. Details:
    `docs/phase-15.10-final-acceptance.md`.

- **PHASE 15.8 — LIKES + WEEKLY MOST-LIKED: COMPLETE (24 tests).**
  - Every video card (Short + Long, owner + protected showcase, all five
    themes) gains a **Like** button and a real like count. Counts are derived
    from actual like rows — the legacy free-text `SocialVideo.likesCount` is
    still never rendered.
  - Identity reuses the EXISTING session: `useAuth().user.id` when signed in,
    else the existing per-browser id (`bookingBrowserId()`, the same anonymous
    identity booking/reviews already use). One like per
    (business, theme, video, actor); a repeat like from the same identity
    toggles off instead of creating a duplicate. Per-actor rate limit blocks
    flooding.
  - Current week = Monday 00:00 → Sunday 23:59 on the salon clock, keyed as an
    ISO week (`2026-W33`). Rolls over on read — no timer or scheduled job.
  - **Weekly Top Videos** ranks by weekly likes over exactly
    `videoItemsForTheme(themeId, data)`; Shorts and Long both rank (together or
    per kind); zero-like videos are never ranked. Theme isolation is absolute —
    a video or a like from one theme can never enter another theme's ranking,
    and another tenant's likes never leak in.
  - Counts, button state and the ranking all update immediately after a
    successful like; a `nexora:video-likes` event syncs other mounted surfaces.
    Loading / error / empty states are handled for both the like action and the
    weekly block (EN + HI).
  - Security is enforced in the data layer and the database, not the button:
    unknown / hidden (rejected, unpublished) / foreign-theme videos are refused
    by `toggleVideoLike`, and **draft migration M27**
    (`social_video_likes`) repeats the same rules with a composite
    `(video, business, theme)` FK, partial unique indexes, RLS, and a
    `security definer` toggle RPC on top of the existing `social_videos`,
    `businesses`, and `auth.users` relationships. **M27 is NOT applied.**
  - Out of scope (later phases): main website dashboard integration, 15.9, 15.10.
  - Validation: `test:phase-15.8` **24/24**; `test:phase-15` **171/171**;
    `validate:migrations` **27/27 ×2 + 21/21** (new database test **U**);
    `test:phase-14` 180/180; `test:phase-10.8` 36/36, `10.3` 86/86,
    `10.12` 178/178; lint 0 errors; build + 25-screen verification green.
    Details: `docs/phase-15.8-likes-weekly-most-liked.md`.

- **PHASE 15.7 — VIDEO PLAYER + ORIGINAL PLATFORM REDIRECT: COMPLETE (11 tests).**
  - Cards/Play open the exact validated original platform URL through
    `src/lib/originalVideoDestination.ts`; embeds keep 9:16 / 16:9 with
    loading + unavailable states. Details:
    `docs/phase-15.7-video-player-original-platform.md`.

- **PHASE 15.6 — OWNER/ADMIN VIDEO MANAGEMENT: COMPLETE (34 tests).**
  - One management surface (`VideoManagementPanel` in Step 07) over the
    existing 15.1–15.5 video architecture — no duplicate system, no new DB
    structures. Owner: add (existing flow), replace link (reuses 15.2
    `/api/video-metadata`), edit metadata, delete own rows, edit protected
    showcase records via materialised owner overrides (`replacesMockId`);
    **never** delete protected records. Admin (server-signed admin claim on
    the session): full add/edit/replace/delete + approve/reject (with reason)
    /mark pending + per-salon showcase tombstone (`disabledThemeVideoIds`)
    and restore. `owner_admin` claim does NOT elevate to platform admin.
  - Permissions re-checked inside every helper (not just hidden buttons);
    actor resolution reuses `useAuth` + `resolveOwnerSalonId` — no salon ids
    ever accepted or invented. Customer projection hides pending/rejected/
    unpublished owner rows and honours tombstones; 5+5 fill kept. Files:
    `src/lib/videoManagement.ts`, `src/lib/videoModeration.ts`,
    `src/components/VideoManagementPanel.tsx`, additive touches to
    `siteVideoGallery.ts` / `siteVideoCatalog.ts` / `types.ts` /
    `StepSocials.tsx`, `scripts/test-phase-15.6.mjs`.
  - Validation: `test:phase-15.6` **34/34**; `test:phase-15` **136/136**;
    10.8 36/36; 10.12 178/178; 14.6 26/26; 14.7 18/18; lint 0; build green;
    25-screen verification green. Details:
    `docs/phase-15.6-owner-admin-video-management.md`.

- **PHASE 15.5 — THEME-WISE PROTECTED MOCK VIDEO DATA: COMPLETE (19 tests).**
  - Hardened the 15.3 catalog into protected mock/default data: 5 shorts + 5
    longs per theme (50 unique). Theme-matched copy; real YouTube URLs + CDN
    thumbs; no cross-theme titles/descriptions/thumbs/ids.
  - Auto-appear when owner has not configured enough videos (`videoItemsForTheme`
    fill). Mocks cannot be permanently deleted (`isProtectedThemeMockVideo`,
    `filterDeletableOwnerVideos`; Step Socials delete blocked). No new DB
    tables. Files: `siteVideoCatalog.ts`, `siteVideoGallery.ts`,
    `StepSocials.tsx`, `scripts/test-phase-15.5.mjs`.
  - Validation: `test:phase-15.5` **19/19**; 15.1–15.4 green; lint 0.
    Details: `docs/phase-15.5-theme-wise-mock-video-data.md`.

- **PHASE 15.4 — AUTO THUMBNAIL + TITLE + DESCRIPTION: COMPLETE (18 tests).**
  - Paste-only YouTube add flow in Step 07: reuses Phase 15.2
    `fetchVideoMetadata` / `/api/video-metadata` (no second fetch system).
    Auto-fills thumbnail, title, description, channel, canonical URL.
  - Merge policy (`mergePlatformMetadataIntoForm`) never overwrites manual
    edits or valid platform metadata unnecessarily. Shorts/Long kind captured
    from the original paste; `themeId` bound to the active salon theme.
  - Partial metadata notice + broken-thumbnail fallback (owner list + form +
    gallery). No new DB fields/API keys. Files: `videoUrlMetadata.ts`,
    `StepSocials.tsx`, `SiteVideoGallery.tsx`, `scripts/test-phase-15.4.mjs`.
  - Validation: `test:phase-15.4` **18/18**; 15.1–15.3 green; lint 0.
    Details: `docs/phase-15.4-auto-thumbnail-title-description.md`.

- **PHASE 15.3 — 5 SHORTS + 5 LONG VIDEOS PER THEME: COMPLETE (21 tests).**
  - Every theme always shows **5 Shorts + 5 Long Videos** (owner first, then
    theme catalog fill). Total catalog: **50 unique** theme-specific records —
    no shared ids/urls/titles across themes.
  - `src/lib/siteVideoCatalog.ts` — per-theme seeds with real YouTube
    watch/shorts URLs + `img.youtube.com` thumbs. Additive `SocialVideo.videoKind`
    (`short` | `long`); inferred from URL when absent. No new DB tables.
  - Gallery fill in `videoItemsForTheme`: owner-scoped → fill each kind to
    quota 5 from that theme's catalog only. UI: kind tabs (All/Shorts/Long),
    kind badges, 9:16 vs 16:9 tiles. Owner save stamps `videoKind` + themeId.
  - Validation: `test:phase-15.3` **21/21**; 15.1 26/26; 15.2 18/18; 10.8 36/36;
    lint 0. Details: `docs/phase-15.3-shorts-long-videos-per-theme.md`.

- **PHASE 15.2 — YOUTUBE/PLATFORM URL AUTO-FETCH: COMPLETE (18 tests).**
  - Owner pastes a YouTube URL in Step 07 → Video ID extracted client-side
    (watch / youtu.be / shorts / embed / live / m. / music) → server
    `POST /api/video-metadata` resolves public oEmbed + OG metadata (title,
    thumbnail, description, channel, canonical URL) with **no API key and no
    service-role** in the browser.
  - Auto-fills the add-video form; invalid / channel / non-YouTube URLs show a
    clear error. Extensible platform detection reserves Instagram / Facebook /
    TikTok for later. Additive `SocialVideo.externalVideoId` / `description` /
    `channelName` map onto existing `social_videos.external_video_id` — no new
    tables. Files: `src/lib/videoUrlMetadata.ts`, `server.ts`,
    `src/screens/StepSocials.tsx`, `scripts/test-phase-15.2.mjs`.
  - Validation: `test:phase-15.2` **18/18**; `test:phase-15.1` 26/26; lint 0.
    Details: `docs/phase-15.2-youtube-url-auto-fetch.md`.

- **PHASE 15.1 — VIDEO GALLERY FOUNDATION: COMPLETE for all five themes (26 tests).**
  - ONE shared Video Gallery architecture (`src/components/SiteVideoGallery.tsx`
    + `src/lib/siteVideoGallery.ts` + `src/lib/siteVideoGalleryI18n.ts`) used by
    all five theme renderers. `SiteSocialFeed` is now a thin re-export so the
    Phase 10.8 section contract stays intact (no second video system).
  - Content = owner-configured `SalonData.socialVideos` only (URLs + thumbnails;
    matches existing `social_videos` table — no video file storage). Additive
    optional `SocialVideo.themeId` scopes items per theme (same grandfathering
    rule as gallery: absent = visible on every theme). No new tables/columns.
  - Theme isolation: foreign-`themeId` videos never leak; theme/data switch
    closes any open embed; each theme keeps its own grid config via
    `VIDEO_GALLERY_THEME_CONFIG`.
  - UI: responsive 9:16 card grid, lazy thumbnails via `SiteImage`
    (`context="video"`), broken-thumbnail fallback, loading/empty/error via the
    shared section system, play-on-demand embed (no iframe until click). EN/HI
    chrome + Light/Dark surfaces via existing `socialVisuals`.
  - Out of scope (later phases): YouTube auto-fetch, likes UI, weekly videos,
    admin management, dashboard logic.
  - Validation: `test:phase-15.1` **26/26**; `test:phase-10.8` 36/36;
    `test:phase-10.12` 178/178; `test:phase-14.1` 55/55; lint 0 errors.
    Details: `docs/phase-15.1-video-gallery-foundation.md`.

- **PHASE 14.1 — GALLERY & VISUAL PORTFOLIO: COMPLETE for all five themes (55 tests).**
  - ONE shared gallery architecture (`src/components/SiteGallery.tsx` +
    `src/lib/siteGallery.ts` + `src/lib/siteGalleryI18n.ts`) replaces the five
    per-theme inline gallery blocks — no duplicate architecture, no copied
    content between themes.
  - Content (configured media ONLY, never invented): owner `data.gallery`
    (salon photos, work, before/after via new `beforeUrl`/`beforeAlt`,
    captions, `featured`, optional `themeId` scoping) → active-theme service
    photos via the existing theme relationship → pre-existing family/nail
    registered showcase media (fallback only). Unsafe URLs rejected by the
    existing `isSafeMediaUrl` gate.
  - Theme isolation via `GALLERY_THEME_CONFIG`: barber → shop/haircut/beard/
    grooming; hair studio → cuts/color/treatments; spa → facial/spa/makeup;
    family → men/women/kids; nail/lash → nail art/manicure/lash. Foreign
    `themeId` items, foreign service media and other themes' registered media
    can never render.
  - UI: featured image banner (per-viewport ratios), responsive mode-based
    grid (3/3/2 · 3/3/2 · 3/3/2 · 3/2/2 · 5/3/2), category filter chips
    (+ Before & After), full-screen lightbox (counter, caption, prev/next
    wrap-around, Escape/arrows, focus management) and a draggable
    before/after comparison slider.
  - Media safety: everything renders through the existing `SiteImage` system
    (lazy, srcSet + sizes, fixed aspect ratios, skeleton, error fallback,
    IMAGE_CACHE dedup); `SiteImage` gains an additive `fit` prop
    (`contain` for lightbox, no cropping). Accessible alt text EN/HI.
  - Each theme keeps its own gallery design via `galleryStyle(themeId,
    appearance)` (surfaces, tile/chip shapes, badges, lightbox chrome).
  - Base-branch repairs carried out alongside (see the phase doc): duplicate
    `offers` structural stamp removed from `SiteCombos` (10.3/10.4/10.13
    restored to 86/118/339); Phase 13 type syncs (`ServiceOffer.description`
    + `serviceIds`, `FamilySurface`/`NailLashSurface.textStrong`,
    `AppLocale` import) so lint is 0 errors; 12.7 duplicate-image assertion
    scoped per section (gallery intentionally reuses active-theme service
    photos cross-section; IMAGE_CACHE still prevents duplicate loading).
  - Validation: `test:phase-14.1` **55/55**; Phases 10–13 all green
    (10.1–10.13, 11.1–11.8 2398, 12.1–12.7 582, 13.1–13.6 220);
    `validate:migrations` 24/24 ×2 + 20/20; lint 0 errors; build +
    25-screen verification green.
    Details: `docs/phase-14.1-gallery-visual-portfolio.md`.
  - Known pre-existing (unchanged, same at base): `test:auth` 13/14 and
    `test:service-saving` assert a stale migration count (24 vs the 26
    M01–M26 files).

- **PHASE 14.3 — GALLERY VIEWER: COMPLETE for all five themes (37 tests).**
  - The shared 14.1 lightbox is upgraded into an advanced full-screen viewer —
    no second viewer system.
  - Mobile: swipe left/right (40px threshold, horizontal dominance), touch
    targets (`site-touch` 44px), safe-area spacing via
    `.site-gallery-lightbox-safe` (`env(safe-area-inset-*)`), `touch-action:
    pan-y` and body scroll lock so the page never scrolls horizontally.
  - Before/After: slider stays interactive inside the viewer; swipes that start
    on the slider are ignored so the handle is never hijacked.
  - Media safety: existing gallery data only; broken image → `SiteImage`
    fallback; skeleton while the full-size loads; only the active full-size
    image is mounted (adjacent-only preload); lazy + srcSet kept from 10.12.
  - Theme isolation: viewer renders only the active theme's media; theme/data
    switch closes/resets the viewer and drops previous media.
  - Accessibility: Arrow/ESC keyboard nav, focus to close on open + restore to
    trigger on close, focus trap (Tab/Shift+Tab), aria-labels, localised
    `swipeHint` (EN/HI).
  - Validation: `test:phase-14.3` **37/37**; `test:phase-14.1` 55/55 (no
    regression); lint 0 errors; build + 25-screen verification green.
    Details: `docs/phase-14.3-gallery-viewer.md`.

- **PHASE 14.4 — GALLERY FINAL VALIDATION: COMPLETE for all five themes (22 tests).**
  - Final acceptance matrix over 14.1 + 14.3: theme-specific content, category
    filters, before/after, lightbox open/close, next/prev, mobile swipe,
    broken-image fallback, skeleton, empty state, lazy loading, single
    full-size mount, no layout shift / horizontal overflow, alt/accessibility.
  - Theme switch cycle (Barber → Hair Studio → Spa → Family → Nail/Lash →
    Barber): after every switch the filter resets, the viewer closes, previous
    media is removed and only the active theme's media loads.
  - Matrix: desktop/tablet/mobile, EN/HI, light/dark, normal/slow network,
    valid/broken image, available/empty gallery.
  - Root-cause fix: test assertions that compared a rendered DOM node against
    `null` now use `Boolean(node)` — the old pattern walked the React fiber
    tree on failure and OOM-killed the runner.
  - Validation: `test:phase-14` **136/136** (55 + 37 + 22 + 22); lint 0; build +
    25-screen verification green. Details:
    `docs/phase-14.4-gallery-final-validation.md`.

- **PHASE 14.5 — GALLERY CONVERSION & FINAL POLISH: COMPLETE for all five themes (22 tests).**
  - Contextual viewer CTAs via the EXISTING booking flow: service image →
    "View Service" + "Book This Service"; non-service image → "Book
    Appointment"; the viewer closes before the booking hand-off.
  - Service connection: `GalleryItem.serviceId` + `galleryServiceForItem`
    resolve a service image back to the active theme's service (invalid/foreign
    refs fail gracefully → null); "View Service" opens the existing
    `SiteServiceDetail`, whose Book CTA preserves theme + service into the
    booking prefill channel.
  - Visual polish: smooth lightbox/stage fade, `focus-visible` outlines,
    theme-accent CTAs, `prefers-reduced-motion` support.
  - Safety: configured data only; no cross-theme service mapping; missing CTA
    data falls back to the generic "Book Appointment".
  - Validation: `test:phase-14` **162/162** (14.1 55 + 14.3 37 + 14.4 22 +
    14.5 22 + 14.6 26); lint 0; build + 25-screen verification green.
    Details: `docs/phase-14.5-gallery-conversion-polish.md`.

- **PHASE 14.6 — GALLERY MANAGEMENT: COMPLETE for all five themes (26 tests).**
  - Owner/Admin management for gallery content, built on the existing 14.1
    gallery (no duplicate gallery system, no booking/payment/database changes).
  - `src/lib/galleryManagement.ts` — pure helpers: media validation (image type
    + 5 MB size), theme scoping (five themes, `ownerGalleryItemBelongsToTheme`),
    theme-scoped service linking (`directoryServicesForTheme`), before/after,
    display order + activate/deactivate, customer projection, and an
    authorization gate reusing `useAuth` + `resolveOwnerSalonId`.
  - `src/types.ts` — additive `GalleryImage` fields (`title`, `description`,
    `serviceId`, `displayOrder`, `status`); optional, so saved galleries load
    unchanged. `siteGallery.ts` now skips `status: 'inactive'` owner items.
  - `src/screens/StepPhotos.tsx` — management UI: theme select, theme-scoped
    category + service link, title/description, before-image upload
    (Before/After pair), activate/deactivate, persisted display order, upload
    progress + error with retry, authorization notice.
  - Safety: authorization via existing auth/ownership (no invented salon/theme
    ids, no service-role/private credentials in the frontend); broken uploads
    never create incomplete records; existing valid gallery data is preserved.
  - Validation: `test:phase-14` **180/180** (55 + 37 + 22 + 22 + 26 + 18);
    lint 0; build + 25-screen verification green. Details:
    `docs/phase-14.6-gallery-management.md`.

- **PHASE 14.7 — OWNER/ADMIN GALLERY APPROVAL: COMPLETE for all five themes (18 tests).**
  - Moderation state machine on the existing gallery: Upload → Pending →
    Approve/Reject → Published/Rejected.
  - `src/lib/galleryModeration.ts` — approve/reject/unpublish/reactivate
    transitions, `validateGalleryItemForPublish` (invalid mapping is refused),
    `isCustomerVisibleGalleryItem` (approved + active only), and a
    `canModerateGallery` gate reusing the existing ownership resolution.
  - `types.ts` — additive `moderation` / `rejectionReason` / `reviewedAt`;
    absent moderation = grandfathered approved, so existing galleries stay
    public. `siteGallery.ts` + `galleryManagement.ts` now hide pending/
    rejected/unpublished content from the customer projection.
  - `src/components/GalleryModerationPanel.tsx` — approval UI (thumbnail,
    theme, category, linked service, status, Approve/Reject/Unpublish/
    Reactivate, rejection reason, locked for unauthorized); `StepPhotos` starts
    new uploads as `pending` and renders the panel.
  - Validation: `test:phase-14` **180/180** (55 + 37 + 22 + 22 + 26 + 18);
    lint 0; build + 25-screen verification green. Details:
    `docs/phase-14.7-gallery-approval.md`.

- **PHASE 12.7 — SERVICE IMAGES & VISUALS: COMPLETE for all five themes (60 tests).**
  - Service cards (directory) + the Service Detail modal now render a visual
    from configured media only: Service Image (image → banner → icon),
    Icon (`iconUrl`), and an optional Gallery Image (`bannerUrl`, detail only).
  - `src/lib/siteServiceVisuals.ts` resolves visuals + a theme-scoped category →
    glyph map; `src/components/ServiceVisual.tsx` wraps the existing `SiteImage`
    performance system (lazy loading, responsive srcSet, fixed aspect ratio,
    IMAGE_CACHE dedup) with a themed glyph fallback for missing/broken media.
    Alt text = localized service name; decorative icon chip is alt="".
  - No fake images, no invented URLs, no cross-theme artwork, no duplicate image
    loading; theme switch drops previous-theme images. Files:
    `src/lib/siteServiceVisuals.ts`, `src/components/ServiceVisual.tsx`,
    `src/components/SiteServiceDirectory.tsx` (card visual),
    `src/components/SiteServiceDetail.tsx` (hero + icon + gallery),
    `scripts/test-phase-12.7.mjs`.
  - Validation: `test:phase-12.7` 60/60; 12.6 59, 12.5 83, 12.4 105, 12.3 74,
    12.2 117, 12.1 84, 11.8 450; Phase 10 all green (10.1–10.13); lint, build,
    25-screen verification green.
    Details: `docs/phase-12.7-service-images-visuals.md`.

- **PHASE 12.6 — SERVICE DETAIL EXPERIENCE: COMPLETE for all five themes (59 tests).**
  - Selecting a service in the Complete Services directory now opens a clean,
    theme-specific Service Detail modal (`src/components/SiteServiceDetail.tsx`):
    name, full description, category, price/starting price, duration, active
    offer + discount amount, image/icon (real media else themed glyph), and
    available staff (`staffForService` — real, available members only,
    assignments respected, on-leave/inactive excluded, never invented).
  - Book Now reuses `openSiteBookingForService` so the existing booking flow
    receives theme + category + service with no re-selection; the modal closes
    on book / close / backdrop. Theme switch closes any open modal (state reset
    in the directory).
  - Files: `src/lib/siteServiceDetail.ts`, `src/lib/siteServiceDetailI18n.ts`,
    `src/components/SiteServiceDetail.tsx`,
    `src/components/SiteServiceDirectory.tsx` (open-detail trigger + modal host),
    `scripts/test-phase-12.6.mjs`.
  - Validation: `test:phase-12.6` 59/59; 12.5 83, 12.4 105, 12.3 74, 12.2 117,
    12.1 84, 11.8 450; Phase 10 all green (10.1–10.13); lint, build, 25-screen
    verification green. Details: `docs/phase-12.6-service-detail-experience.md`.

- **PHASE 12.5 — SERVICE DISCOVERY: COMPLETE for all five themes (83 tests).**
  - Enhanced the Complete Services directory with discovery controls: search by
    name (instant, EN/HI, active theme only), category tabs from the theme's own
    services, sort (Recommended · Name A–Z · Price ↑/↓ · Duration short→long),
    a **Clear Filters** button (inline + inside the empty state), a "No services
    found" empty state, and automatic search/filter/sort reset on theme switch.
  - Name sort added to the shared `serviceSearch` engine (`name_asc`); no
    duplicate service/sort logic. `src/lib/siteServiceDirectoryI18n.ts` gained
    `sortNameAsc` + `clearFilters`; `SiteServiceDirectory.tsx` gained the clear
    button, empty-state clear, `useEffect([themeId])` reset, and mobile control
    reflow. Theme-specific ghost/solid clear styling (five distinct shapes).
  - Validation: `test:phase-12.5` 83/83; 12.4 105, 12.3 74, 12.2 117, 12.1 84,
    11.8 450; Phase 10 all green (10.1–10.13); lint, build, 25-screen
    verification green. Details: `docs/phase-12.5-service-discovery.md`.

- **PHASE 12.4 — COMPLETE SERVICE DIRECTORY: COMPLETE for all five themes (105 tests).**
  - New Complete Services directory (`src/components/SiteServiceDirectory.tsx`)
    replaces the old per-theme services blocks in the canonical `services` slot
    (directly after Featured Services). Active Theme → Category → Services:
    category tabs, search, category filter, and price/duration sorting (existing
    `serviceSearch` engine), plus cards with name, description, offer-aware
    price, duration, offer badge + discount, and Book Now → existing booking flow
    with the service preserved.
  - Theme isolation via the existing theme relationship
    (`directoryServicesForTheme`: `themeKey` wins over `themeId`; no-provenance
    rows stay; foreign rows excluded). Categories derive from those same
    theme-filtered services. No hardcoded cross-theme services, no invented
    prices/durations, `predefinedServiceId`/`categoryId` provenance untouched.
  - Section backgrounds match the Phase 10.2 surface tokens (barber
    charcoalSoft, hair paper, spa cream, family white, nail cream) so the
    light/dark toggle test stays green; hair's nested Packages block was moved
    out to its own `offers` section (canonical flow unchanged).
  - Files: `src/lib/siteServiceDirectory.ts`,
    `src/lib/siteServiceDirectoryI18n.ts`,
    `src/components/SiteServiceDirectory.tsx`, the five theme renderers
    (services block → `<SiteServiceDirectory />`), `scripts/test-phase-12.4.mjs`.
  - Validation: `test:phase-12.4` 105/105; 12.3 74, 12.2 117, 12.1 84,
    11.8 450; Phase 10 all green (10.1–10.13, incl. 10.2 49, 10.6 102, 10.7 66,
    10.13 339); lint, build and 25-screen verification green.
    Details: `docs/phase-12.4-complete-service-directory.md`.

- **PHASE 12.3 — SERVICE CARD ENHANCEMENT: COMPLETE for all five themes (74 tests).**
  - Enhanced the Phase 12.2 Featured Service cards: image/icon (real media when
    provided, else a themed category icon), Suggested badge (`isSuggested`) and
    Popular badge (top-ranked `suggestedSortOrder`), offer badge PLUS the
    computed discount amount ("20% off" / "₹100 off"), "From ₹X" starting price
    when multiple active price options exist, and a Book Now CTA that opens the
    existing booking flow **with the selected service preserved**.
  - Offer rules hardened and verified: active offers only, start/end dates
    respected, expired offers disappear automatically, no invented discounts.
  - CTA mechanism: `openSiteBookingForService(service, themeId)` +
    `consumeBookingServicePrefill(themeId)` in `src/lib/siteBooking.ts` hand the
    SAME `nexora:open-booking` event a one-shot prefill; `SiteBookingFlow`
    consumes it on mount, prepends the service to the theme's own list and
    pre-selects it. Additive only — the single flow/host and its step order are
    unchanged, and a plain Book Appointment never inherits a stale prefill.
  - Files: `src/lib/siteFeaturedServices.ts` (+model fields + 3 helpers),
    `src/lib/siteFeaturedI18n.ts`, `src/lib/siteBooking.ts` (+prefill channel),
    `src/components/SiteBookingFlow.tsx` (+consume),
    `src/components/SiteFeaturedServices.tsx` (card redesign),
    `scripts/test-phase-12.3.mjs`.
  - Validation: `test:phase-12.3` 74/74; 12.2 117/117; 12.1 84/84; 11.8 450/450;
    booking regression 10.6 102/102 + 10.7 66/66; 10.2 49, 10.12 178, 10.13 339;
    lint, build and 25-screen verification green.
    Details: `docs/phase-12.3-service-card-enhancement.md`.

- **PHASE 12.2 — FEATURED SERVICES: COMPLETE for all five themes (117 tests).**
  - New Featured Services section sits directly below Trust/Stats and shows ONLY
    the active theme's own suggested services, loaded from the EXISTING
    theme-scoped catalog: the M19 RPC `get_theme_service_catalog(p_theme_id)`
    (SQL `theme_id` filter, `is_suggested = true`) when Supabase is configured,
    with the identical static `getSuggestedServices(themeId)` seed as the
    offline fallback. Cross-theme responses are rejected; no theme ever copies
    another theme's services.
  - Each card shows name, short description, price (offer-aware: strikethrough +
    discounted), duration, an offer badge when a theme/category/predefined offer
    applies, and a Book Now action that opens the existing booking flow.
  - Replaced the old per-theme "featured" blocks (which showed the owner's
    generic saved services) and removed the nail theme's hardcoded showcase
    cards. No new service architecture, no DB structure change, no invented
    services/prices.
  - Theme-specific card design (five distinct looks), responsive mode-based
    grids (barber/hair/spa/family 2/2/1, nail 4/2/2), EN/HI via the catalog
    locale seed, light/dark surfaces, and loading/empty/error states.
  - Files: `src/lib/siteFeaturedServices.ts`,
    `src/components/SiteFeaturedServices.tsx`, `src/lib/siteStructure.ts`
    (+`injectedSectionStatus`), the five theme renderers (featured block →
    `<SiteFeaturedServices />`), and `scripts/test-phase-12.2.mjs`.
  - Validation: `test:phase-12.2` 117/117; 12.1 84/84; 11.8 450/450; Phase 10
    suites all green (10.1 80, 10.2 49, 10.3 86, 10.4 118, 10.8 36, 10.9 77,
    10.12 178, 10.13 339); lint, build and 25-screen verification green.
    Details: `docs/phase-12.2-featured-services.md`.

- **PHASE 12.1 — TRUST & SALON STATS: COMPLETE for all five themes (84 tests).**
  - New Trust/Stats section sits directly below each theme's hero and shows
    ONLY real, configured data: Customer Rating + Review Count (approved
    reviews, Phase 10.8 engine), Years of Experience + Happy Customers
    (new optional `SalonData.yearsOfExperience` / `happyCustomers`),
    Services Available (active catalog count) and Salon Status / Opening Info
    (Phase 10.5 live status engine).
  - The hardcoded marketing numbers the Phase 10.3 trust strips shipped
    ("15+", "10k", "4.9", "∞" …) are removed. A stat with no data is hidden —
    never replaced with a fabricated value — and when nothing is configured the
    section shows its empty state.
  - Theme-specific card design (five distinct looks/colours/typography),
    responsive desktop 3 / tablet 3 / mobile 1 grids (mode-based), English +
    हिन्दी labels, light/dark surfaces, and loading/empty/error states via the
    shared `setWebsiteSectionFlagsForTests({ trust: … })` seam.
  - Files: `src/lib/siteTrust.ts`, `src/lib/siteTrustI18n.ts`,
    `src/components/SiteTrust.tsx`, `src/types.ts` (+2 optional fields), the
    five theme renderers (trust block → `<SiteTrust />`), and
    `scripts/test-phase-12.1.mjs`.
  - Validation: `test:phase-12.1` 84/84; `test:phase-10.13` 339/339;
    `test:phase-11.8` 450/450; lint, build and 25-screen verification green.
    Details: `docs/phase-12.1-trust-salon-stats.md`.

- **PHASE 11 ACCEPTED — Phase 11.8 final hero acceptance passed for all five
  themes (2398 Phase 11 tests green).**
  - Acceptance-only phase: **no product source was changed**. The hero passed
    the full gate exactly as built in 11.1-11.7; the only addition is the
    450-assertion suite `scripts/test-phase-11.8.mjs`.
  - Accepted per theme x desktop/tablet/mobile: unique layout, headline,
    description, media and styling (all pairwise distinct, no shared image);
    Book Appointment + Explore Services CTAs; mobile-optimized and fallback
    media; loading/error states with no layout shift; full a11y contract.
  - Complete flows verified on every theme and frame: Hero -> Book Appointment
    opens exactly ONE existing booking flow; Explore Services -> services
    section; Gallery -> gallery section; Call -> tel:; WhatsApp -> wa.me. No
    duplicate sections, no route change, canonical order intact.
  - **Full-cycle switch** Barber -> Hair -> Spa -> Family -> Nail -> **back to
    Barber** in en/light and hi/dark on all three frames, asserting zero stale
    copy, badges, motion classes, media or `theme:<prior>:` cache keys at every
    step, and an exact restore of the Barber hero at the end.
  - Confirmed a single hero implementation: routed through the real shared
    `TemplateRenderer`, each theme renders exactly one `#section-hero`, one
    `<h1>` and one media frame (the legacy hero markup in `TemplateRenderer`
    is unreachable for all five themes).
  - Validation: `npm run test:phase-11.8` = 450/450; 11.1 215, 11.2 138,
    11.3 249, 11.4 369, 11.5 294, 11.6 377, 11.7 306; `test:phase-10`
    1259/1259; lint, build and 25-screen verification green.
    Details: `docs/phase-11.8-final-hero-acceptance.md`.

- **Phase 11.7 — HERO DATA VALIDATION: COMPLETE for all five themes
  (1948 Phase 11 tests green).**
  - Data/fallback fixes only; no hero redesign, no DB/service/booking or
    Phase 10 change. Two real defects fixed:
    1. **Unvalidated owner media reached the DOM.** `heroImageUrl`, gallery
       entries and reel URLs were used after only a `.trim()`, so
       `javascript:alert(1)` became a literal `<img src>` and free text became
       a broken image instead of falling back. (React blocked the `href` case
       at render, so it was not exploitable today — but the hero was leaning on
       a framework guardrail instead of validating its own data.) New
       `isSafeMediaUrl()` / `safeMediaUrl()` in `src/lib/siteHero.ts` allow
       only http(s), protocol-relative, root/relative, `data:image`/`data:video`
       and `blob:` sources; everything else falls back to the theme's own safe
       media. Applied to `heroMedia()`, `heroVideoSource()` and
       `setThemeHeroVideo()`.
    2. **Fake initials from placeholder copy.** An unnamed salon produced a
       "Y"/"N" monogram out of the generic "Your Salon" fallback. Initials now
       come from the real `salonName` only; new `heroLogoMark()` renders a
       neutral per-theme glyph when the salon is unnamed.
  - Verified: per-theme headline/description/CTA/media uniqueness in EN+HI,
    owner data winning over theme copy, 8 sparse-data profiles rendering
    without crashing, hostile URLs rejected pre-render, broken URLs hitting the
    existing error state with no layout shift, clean theme switching (no stale
    copy/media/cache, language + light/dark preserved), no duplicate media
    requests and lazy-loading untouched.
  - Validation: `npm run test:phase-11.7` = 306/306; 11.1 215, 11.2 138,
    11.3 249, 11.4 369, 11.5 294, 11.6 377; `test:phase-10` 1259/1259; lint,
    build and 25-screen verification green.
    Details: `docs/phase-11.7-hero-data-validation.md`.

- **Phase 11.6 — HERO INTERACTION & CONVERSION: COMPLETE for all five themes
  (1642 Phase 11 tests green).**
  - New `src/lib/siteHeroNav.ts` wraps the EXISTING Phase 10 navigation — no
    new route, section or second booking flow. Four issues fixed:
    1. Explore Services / View Gallery were `<button onClick>`; they are now
       real `<a href="#section-...">` anchors (focusable, visible destination,
       open-in-new-tab) with a smooth-scroll enhancement. Book Appointment
       stays a `<button type="button">` because it is an action.
    2. Destinations were hardcoded strings; they now resolve through the
       Phase 10.3 alias registry via `heroTargetId()`.
    3. Smooth scrolling ignored `prefers-reduced-motion`; `heroScrollTo()`
       now jumps instantly for those visitors (same destination).
    4. CTA motion was inconsistent; each theme now has its own signature
       (barber mechanical press, hair editorial hairline, spa calm lift,
       family springy bounce, nail neon glow), all <=180ms, no loops, and all
       disabled together under one reduced-motion block.
  - Verified: booking opens exactly one existing flow; services/gallery land
    on the right `data-site-section`; Call is `tel:` and WhatsApp `wa.me`;
    canonical 16-section order intact with unique ids and no route change;
    a11y semantics/keyboard/labels/contrast; and full theme isolation across
    desktop/tablet/mobile x EN/HI x light/dark.
  - Validation: `npm run test:phase-11.6` = 377/377; 11.1 215, 11.2 138,
    11.3 249, 11.4 369, 11.5 294; `test:phase-10` 1259/1259; lint, build and
    25-screen verification green.
    Details: `docs/phase-11.6-hero-interaction-conversion.md`.

- **PHASE 11 CLOSED — Phase 11.5 hero final polish passed for all five themes
  (1265 Phase 11 tests green).**
  - Polish/QA only; no hero layout redesigned. Four real defects fixed:
    1. **Fabricated business metrics removed.** Heroes hardcoded claims like
       "12k+ cuts delivered" and "9 colour formulas" that no salon supplied.
       New `heroStat()` in `src/lib/siteHero.ts` derives the value from real
       data (active services → team → nothing); the copy table keeps only
       per-theme wording (`statServicesLabel` / `statTeamLabel`, EN + HI).
    2. **No keyboard focus on any CTA.** New scoped `.site-hero-cta` class in
       `src/index.css` adds hover / focus-visible / active states (with a
       reduced-motion guard) to all 30 hero CTAs. Phase 10 controls untouched.
    3. **Accessibility gaps.** 45 decorative icons now `aria-hidden`; the
       ambience video is `role="img"` + `tabIndex={-1}`.
    4. **Mobile hero too tall.** Barber dropped its second stacked media cell
       on phones (459px → 219px) and the spa arch narrowed (392px → 265px);
       all themes now under a 300px mobile media budget, test-enforced.
  - Verified per theme: real salon name/logo, theme-correct headline/
    description/CTA/media, readable text over media, frame-accurate spacing and
    typography, a11y labels, Hindi-safe layout, dark mode never dropping a WCAG
    tier, and full theme isolation across Barber → Hair → Spa → Family → Nail
    on desktop/tablet/mobile with no previous-theme content surviving.
  - Validation: `npm run test:phase-11.5` = 294/294; 11.1 215, 11.2 138,
    11.3 249, 11.4 369; `test:phase-10` 1259/1259; lint, build and 25-screen
    verification green. Details: `docs/phase-11.5-hero-final-polish.md`.

- **PHASE 11 COMPLETE — Phase 11.4 hero Desktop + Tablet + Mobile QA passed
  for all five themes (971 Phase 11 tests green).**
  - QA-only phase; the hero was not redesigned. Two REAL defects were found
    and fixed at the root cause:
    1. **Tablet rendered at desktop scale, and `hidden md:inline-flex`
       inverted on mobile.** The heroes mixed frame-based `mode` (fixed
       preview widths 950/768/390) with Tailwind `md:` classes that key off
       the BROWSER viewport, so `md:` matched even inside the 390px phone
       frame. Fixed with `heroModeValue(mode, {desktop,tablet,mobile})` in
       `src/lib/siteHero.ts`; all 28 `md:` classes across the five heroes are
       now frame-accurate, and the nail studio badge is desktop-only by mode.
       Guarded by a test asserting zero viewport-breakpoint classes in any
       hero on any frame.
    2. **Owner catalog silently deleted focus badges.** `heroFocusBadges()`
       matched substrings, so one `Haircut` service matched the hair studio's
       "Cut & Styling" + "Hair Treatments" and hid Colour/Balayage. Now
       matches whole words against a tokenised catalog set.
  - Verified per theme × desktop/tablet/mobile: media fit, no cropping, no
    horizontal overflow, readable headline/description, visible 44px CTAs,
    Book Appointment opening the existing flow, Explore Services targeting
    `#section-services`, mobile-optimized sources (w=640/q=70), video and
    image fallbacks preserving the aspect ratio, no layout shift, light/dark,
    EN/HI, and per-frame theme isolation.
  - Validation: `npm run test:phase-11.4` = 369/369; 11.1 215/215,
    11.2 138/138, 11.3 249/249, `test:phase-10` 1259/1259; lint, build and
    25-screen verification green.
    Details: `docs/phase-11.4-hero-responsive-qa.md`.

- **Phase 11.3 — HERO MEDIA & CALL-TO-ACTION: COMPLETE for all five themes.**
  - New `src/lib/siteHeroMedia.ts` + `src/components/heroes/HeroMediaFrame.tsx`
    give every theme its own hero media slot inside its EXISTING 11.1 layout
    (barber film-strip motion cell, hair editorial plate 01, spa arch, family
    collage tile, nail look-of-the-week card). No media shared across themes.
  - Media behaviour: existing `SiteImage` pipeline (srcset/eager/skeleton/
    error), per-viewport width rewrite (1400/1000/640, q=70 mobile), reserved
    aspect-ratio (no layout shift), video always muted + playsInline + loop
    with no controls, `prefers-reduced-motion` honoured, video error → poster,
    image error → existing SiteImage error state.
  - **Hero video is image-first by default**: `THEME_VIDEOS` ships empty
    because the sandbox has no network to verify third-party clip URLs.
    Motion comes from owner `socialVideos` playable files, or from
    `setThemeHeroVideo(themeId, src)` per-theme deployment registration.
    Non-playable reels become click-to-open links, never autoplay.
  - CTAs: existing Book Appointment (10.6 flow) + Explore Services, plus new
    optional Call / WhatsApp / View Gallery via `heroCtaOptions()` on the
    existing contact system; each theme has its own CTA text and styling and
    they hide when the owner disables them.
  - Validation: `npm run test:phase-11.3` = 249/249; 11.1 215/215, 11.2
    138/138, `test:phase-10` 1259/1259, lint/build/25-screens green.
    Details: `docs/phase-11.3-hero-media-cta.md`.

- **Phase 11.2 — HERO HEADLINE & CONTENT: COMPLETE for all five themes.**
  - Mandated headlines render exactly: barber "Sharp Cuts. Classic Grooming.
    Modern Confidence.", hair "Luxury Hair. Signature Style. Beautifully You.",
    spa "Relax. Refresh. Reveal Your Natural Glow.", family "Beauty & Grooming
    for the Whole Family.", nail "Nails, Lashes & Beauty Made to Stand Out."
  - Each theme also gained a unique short description, theme-specific primary +
    secondary CTA text, service-focus badges (barber haircuts/beard/shave/
    grooming · hair cut/colour/balayage/treatments · spa facial/skin/spa/
    wellness/makeup · family men/women/kids/haircare/combos · nail
    art/gel/lash/brow/mani-pedi) and a target-audience line — rendered in each
    theme's EXISTING 11.1 layout, no layout recreated.
  - All copy lives in `src/lib/siteHeroI18n.ts` and flows through the existing
    Phase 10.2 language system; every Hindi string is a real Devanagari
    translation. New `heroFocusBadges()` in `src/lib/siteHero.ts` narrows the
    badges to the owner's active catalog (archived/inactive ignored).
  - Owner content still wins: `tagline` → `<h1>`, `about` → description,
    `services` → badges. No database, migration or service change.
  - Validation: `npm run test:phase-11.2` = 138/138, `test:phase-11.1`
    215/215, `test:phase-10` 1259/1259, lint/build/25-screens green.
    Details: `docs/phase-11.2-hero-headline-content.md`.

- **Phase 11.1 — UNIQUE HERO DESIGN: COMPLETE for all five themes.**
  - Five genuinely separate hero components in `src/components/heroes/`
    (`BarberHero`, `HairStudioHero`, `BeautySpaHero`, `FamilyHero`,
    `NailLashHero`) — one file per theme, no shared layout:
    barber `cinematic-slab`, hair `editorial-gallery`, spa `soft-arch`,
    family `action-card-collage`, nail `glam-card-shelf`.
  - Every hero carries: salon logo/name, theme headline, short description,
    primary Book Appointment CTA (opens the existing 10.6 flow), secondary
    Explore Services CTA (scrolls to `#section-services`), hero image and/or
    owner reel, plus optional rating / location / live open-status.
  - Owner data wins: tagline drives the single `<h1>`, About drives the
    description, `logoUrl` / `heroImageUrl` / gallery drive the visuals; each
    theme falls back to its own disjoint imagery set.
  - New: `src/lib/siteHeroI18n.ts` (per-theme EN/HI hero copy) and
    `src/lib/siteHero.ts` (media / meta / headline helpers). Renderers only
    swapped their inline hero markup for one hero component call.
  - Phase 10.1 header, 10.2 Language + Dark Mode and 10.3 canonical section
    order are untouched; no database, migration, service or theme-data change.
  - Validation: `npm run test:phase-11.1` = 215/215; `npm run test:phase-10`
    = 1259/1259; lint, build and 25-screen verification green. Details:
    `docs/phase-11.1-unique-hero-design.md`.

- **Phase 10.13 — GLOBAL WEBSITE FINAL AUDIT: COMPLETE for all five themes.**
  - Exact 16-section flow passes in Desktop, Tablet and Mobile for Barber,
    Hair Studio, Beauty/Spa, Family and Nail/Lash; Existing legacy rendering
    also remains intact.
  - EN/HI, Light/Dark, booking, Call/WhatsApp/Directions, live status, legal,
    SEO, responsive containment, stale/cross-theme isolation and every rendered
    link pass the final audit.
  - Root fixes from the 2026-08-14 re-audit: all five in-section Directions
    controls now open the configured address through the existing
    `salonMapsHref`; Nail/Lash contact “Book Online” now opens the existing
    shared booking flow instead of linking back to itself.
  - Runtime tests now force and assert loading/skeleton/error/retry/empty states
    for every theme and viewport. No redesign, DB change, data deletion or
    duplicate system was introduced.
  - Validation: `npm run test:phase-10.13` = 339/339; complete
    `npm run test:phase-10`, lint, build and 25-screen verification are green.
    Details: `docs/phase-10.13-final-audit.md`.

- **Phase 10.8 — REVIEWS, RATINGS & SOCIAL CONTENT: COMPLETE for all five themes.**
  - Real customer reviews (no invented quotes). Write a Review form is
    Rating + Review + Customer Name. Submission is allowed only after a
    valid Phase 10.7 booking (`confirmed` / `pay_at_salon`, appointment
    today or earlier) on the same business + theme.
  - New reviews start as pending/moderation; the public list and average
    rating use approved rows only. Duplicate (one per booking) and spam
    (length, repeated characters, identical body, rate limit) are blocked.
  - Social / Latest Work reuses the existing Videos / Reels architecture
    (`data-site-section="videos"` / `#section-social`). Posts come only
    from configured `socialVideos`; profile chips from `socialProfiles`.
    YouTube / Instagram embeds are offered only when the URL actually
    parses. No fake posts, no second video system.
  - Five themed visuals; EN/HI and Light/Dark reuse 10.2. Header, booking,
    payment, footer and 10.4 CTAs/FABs are untouched. No DB schema change.
  - Details: `docs/phase-10.8-reviews-ratings-social.md`.
    Run `npm run test:phase-10.8` or `npm run test:phase-10`.

- **Phase 10.7 — ADVANCE PAYMENT & BOOKING CONFIRMATION: COMPLETE for all five themes.**
  - One five-step payment flow — Payment Option → Payment Gateway → Payment
    Result → Booking Confirmation → Receipt — rendered inside the existing
    `SiteBookingHost` (header / final / floating CTAs keep working; still ONE
    booking architecture, ONE payment architecture, no duplicate tables).
  - Three payment options on every theme: Pay at Salon (no gateway, instant
    confirmation), Advance / Token (configurable %, default 25% from
    `bookingRules.advanceDepositPercentage`), Full Payment. Amount math comes
    from the offer-aware service final price so an active Phase 9.1 offer
    lowers both the due-now and the due-at-salon numbers.
  - Mock payment gateway simulator with four scenarios (`all_success`,
    `mixed`, `force_failure`, `force_timeout`) covering success, failure,
    cancellation and timeout outcomes; the booking is NEVER confirmed before
    the gateway returns `success`. Reason text is human-readable; raw SQL is
    never exposed.
  - Idempotency: every persisted record carries a stable per-(business, theme,
    booking, option, amount, slot) key. A refresh of the page during
    confirmation re-renders the same booking id (verified by the host-level
    orchestrator test); a retry never creates a second payment row.
  - Sensitive data is masked: only `•••• <last4>` for cards, `<local>•••@<bank>`
    for UPI, masked bank labels; CVV / card holder are NEVER stored anywhere.
  - Booking confirmation card lists salon, service, date, time, staff, amount
    and payment status; booking id is human-readable (`NX-#####`) and
    copyable. Receipt view renders booking + payment details with the
    masked payment identifier, gateway reference, and themed "receipt
    paper" styling per theme. Print / Download (text) / WhatsApp all work.
  - WhatsApp share message includes only the essentials (booking id, salon,
    service, date, time, staff, amount, payment status) — no full card,
    UPI, CVV.
  - EN ↔ हिन्दी copy follows the 10.2 global language system; the payment
    screens repaint instantly when the header Language control switches.
  - Light ↔ Dark follows the 10.2 global Dark Mode system; payment surfaces
    resolve through the existing five theme palettes.
  - Five distinct themed visuals (barber / hair / spa / family / nail) —
    pairwise-distinct, asserted by the test suite.
  - New files: `src/lib/siteBookingPayment.ts`,
    `src/lib/siteBookingPaymentI18n.ts`,
    `src/lib/siteBookingPaymentTheme.ts`,
    `src/components/SiteBookingPaymentFlow.tsx`,
    `src/components/SiteBookingFullFlow.tsx`. `SiteBookingHost` now mounts
    `SiteBookingFullFlow`; the existing `nexora:open-booking` /
    `nexora:close-booking` events still drive it. 10.1–10.6 suites stay
    green. Details: `docs/phase-10.7-advance-payment-booking-confirmation.md`;
    run `npm run test:phase-10.7` (66/66) or `npm run test:phase-10`
    (557 tests across 10.1–10.7).

- **Phase 10.6 — BOOK APPOINTMENT ENTRY FLOW: COMPLETE for all five themes.**
  - One five-step flow — Select Service → Select Date → Available Time Slots →
    Customer Details → Booking Summary — rendered inside the existing
    `SiteBookingHost` (header / final / floating CTAs keep working; still ONE
    booking architecture, no payment / no confirmation-receipt yet).
  - Service list comes from the ACTIVE theme only (inactive rows dropped,
    cross-theme rows can never leak); category → service stays theme-isolated;
    every card shows price + duration.
  - Date picker respects weekly opening hours, dated holidays (name shown) and
    the `maxAdvance` window; slots respect open/close times, today's minimum
    notice and the service duration; past/taken slots render disabled.
  - Double-booking prevented with 15-minute slot holds in localStorage
    (`nexora_site_booking_holds`), keyed theme|service|date|start, with
    overlap detection; a visitor's own hold never blocks themselves.
  - Details form: Name, Mobile (validated), Email + Notes (optional).
    Summary recaps everything with Change links; Confirm intentionally stops
    at the summary with a “next phase” note.
  - Selections survive moving back/forward between steps. EN/HI and
    Light/Dark reuse the 10.2 global systems; five distinct themed visuals;
    flow inherits the renderer's `themeId`.
  - New files: `src/lib/siteBookingFlow.ts`, `src/lib/siteBookingTheme.ts`,
    `src/lib/siteBookingI18n.ts`, `src/components/SiteBookingFlow.tsx`.
    10.1–10.5 suites stay green. Details:
    `docs/phase-10.6-book-appointment-entry-flow.md`; run
    `npm run test:phase-10.6` (102/102) or `npm run test:phase-10`
    (491 tests across 10.1–10.6).

- **Phase 10.5 — ANNOUNCEMENT BAR & LIVE SALON STATUS: COMPLETE for all five themes.**
  - Dated festival / seasonal / important / custom announcements with
    active/inactive, start/end dates, optional theme scope, EN/HI and CTA.
    Expired and inactive rows auto-hide.
  - Live salon status (Open Now, Closed, Closing Soon, Opens at [time],
    Closed Today, Holiday) from weekly hours + holiday dates + local clock.
  - Shown in the announcement strip, contact hours card and existing booking
    flow — not in the footer or floating actions.
  - Header, Language, Dark Mode, Footer and 10.4 CTAs/FABs are untouched.
    Details: `docs/phase-10.5-announcement-live-status.md`.
    Run `npm run test:phase-10` (10.1 + 10.2 + 10.3 + 10.4 + 10.5).

- **Phase 10.4 — FINAL CTA, FOOTER & FLOATING ACTIONS: COMPLETE for all five themes.**
  - Global Book Appointment CTAs open the existing `CustomerBookingPreview`
    flow (header Book still scrolls to `section-contact` as in 10.1).
  - Themed final CTA sits immediately before a complete footer (logo, links,
    services, contact, address, hours, social, privacy, terms, cancellation,
    copyright) on every theme.
  - Desktop/tablet floating Call + WhatsApp + Back to Top; mobile sticky
    Call | WhatsApp | Book dock with safe-area insets.
  - Header, Language, Dark Mode and 10.3 section order are untouched.
    Details: `docs/phase-10.4-final-cta-footer-floating.md`.
    Run `npm run test:phase-10` (10.1 + 10.2 + 10.3 + 10.4).

- **Phase 10.3 — RESPONSIVE WEBSITE STRUCTURE: COMPLETE for all five themes.**
  - One canonical public-website order on every theme: Announcement → Header →
    Hero → Trust → Featured → All Services → Offers & Combos → Gallery →
    Videos → About → Owner → Staff → Reviews → Location + Contact → Final
    Booking CTA → Footer.
  - Videos now exist in Family and Nail as well; Owner sits with Staff near
    the end; Gallery always precedes Videos. Theme visuals are unchanged.
  - Dynamic sections expose loading / empty / error states. Desktop, tablet
    and mobile grids plus overflow containment are shared via
    `src/lib/siteStructure.ts`.
  - Header, Language and Dark Mode from 10.1 / 10.2 are untouched.
    Details: `docs/phase-10.3-responsive-website-structure.md`.
    Run `npm run test:phase-10` (10.1 + 10.2 + 10.3 + 10.4 + 10.5).

- **Phase 10.2 — GLOBAL LANGUAGE & DARK MODE: COMPLETE for all five themes.**
  - New `src/lib/siteI18n.ts`: one namespaced EN/HI copy table per theme +
    common labels + day names + a global category dictionary
    (`translateCategory`); service names/descriptions continue through the
    Phase 9.2 `displayService` translations pipeline.
  - New `src/lib/themeSurfaces.ts`: per-theme `{light, dark}` surface palettes
    resolved by the single global `surfacesOf()` — barber dark-native (cream
    day-shift light), hair espresso/rose-gold dark, spa deep-forest dark,
    family night-sky navy dark, nail deep-plum/neon-pink dark.
  - All five renderers consume both via the header's `useSiteLocale()` /
    `useThemeAppearance()` hooks — Language and Dark Mode remain GLOBAL
    controls (no per-theme implementations), persisted across refresh.
  - English output is byte-identical to the pre-10.2 copy; Hindi titles are
    pairwise-distinct across themes (no cross-theme mixing, tested).
  - Details: `docs/phase-10.2-language-dark-mode.md`; run
    `npm run test:phase-10` (10.1 80/80 + 10.2 49/49).

- **Phase 10.1 — GLOBAL HEADER & NAVIGATION: COMPLETE for all five themes.**
  - New `src/lib/siteNavigation.ts` holds the ONE canonical structure:
    Logo/Salon Name → Home → Services → Offers → Gallery → Videos → About →
    Team → Contact → Language → Dark Mode → Book Appointment, with EN/HI
    labels, per-theme section targets and data-driven visibility rules.
  - New `src/components/SiteHeader.tsx` renders it with **five distinct themed
    designs** (barber gold-slab/dark, hair-studio editorial hairline, spa
    floating pill, family navy strip + white wayfinding bar, nail pink-flash +
    gradient CTA) — structure is common, visuals are not copied.
  - Desktop inline nav + mobile hamburger drawer (nav, Language, Dark Mode,
    Book CTA last) both work; nav smooth-scrolls to real sections; Language
    reuses the `nexora_locale` store and switches instantly (services repaint
    via a new `useSiteLocale()` hook); Dark Mode is a persisted visitor
    preference swapping each theme's designed header variants.
  - Existing renderers only swapped their old nav block for the themed header +
    gained `id="section-offers"` package anchors. PreviewPane, booking flow,
    service/offer logic and all migrations are untouched.
  - Details: `docs/phase-10.1-global-header-navigation.md`; run
    `npm run test:phase-10.1` (80/80 across all five themes, desktop+mobile).
    Note: `test:acceptance-ui` shows one "zero-typing auto-fill" failure that
    reproduces at base commit `1e8daaf` — pre-existing environment flake, not
    a Phase 10.1 regression (`test:acceptance` 66/66 still green).

- **Phase 9.1 — OFFERS, DISCOUNTS, PRICING & COMBOS: COMPLETE for all five themes.**
  - M24 adds theme/tenant-safe dated offers targeting an entire theme, category,
    predefined service, saved custom service, or bundle. Percentage/fixed
    discounts, title, badge, date range and active/inactive state are persisted.
  - Database-date effective status makes ended offers automatically `expired`;
    expired/scheduled/inactive offers are never applied to service cards.
  - Named service price variants preserve the base saved-service row and its
    immutable theme/category/predefined provenance.
  - Existing `packages` / `package_services` now support validated theme bundles,
    included-service price/duration snapshots, original subtotal, discount,
    calculated final price, badge and status. Existing packages remain untouched.
  - Step 05 includes one matching Pricing & Promotions manager in each database
    theme. Shared dynamic pricing renders badges, offers and variants in every
    theme, the live preview and customer booking flow.
  - Security: tenant-derived RPCs, composite theme/business FKs, RLS, atomic
    cross-theme rejection, and published-only anonymous commerce reads.
  - Validation: M01–M24 replay 24/24 x2, retained A–T 20/20, Phase 9.1 9/9,
    retained Phase 8.3 94/94, lint/build/auth/screens all green.
  - Details: `docs/phase-9.1-offers-pricing-combos.md`; run
    `npm run test:phase-9.1`.

- **Phase 8.3 — FINAL 5-THEME ACCEPTANCE TEST: PASSED. Phase 8 is complete.**
  - 94 acceptance tests (66 data + 28 UI) across all five themes, run against
    REAL PostgreSQL (M01–M24), the REAL `@supabase/supabase-js` client, and the
    REAL `StepServices` React component mounted in jsdom with genuine DOM
    interaction. Nothing in the app is stubbed.
  - Per theme, all verified: correct UI, theme_id, categories, predefined
    services, suggested services, zero-typing selection, name/description
    auto-fill, Select All, Add Selected, price, duration, edit,
    activate/deactivate, delete, duplicate prevention, Custom Service / Other.
  - The full 12-step switch sequence (Existing → 5 → 5 → Existing) leaves no
    stale selections, chips, categories, services or cache — asserted in both
    the data layer and the rendered DOM, including on revisit.
  - Refresh is idempotent; database relationships show 0 broken chains, 0
    mismatches, 0 orphans; tenant isolation holds; pre-existing NULL-provenance
    data is byte-identical after the run.
  - Two harness bugs were found and root-caused (bigint assertion; `motion`'s
    rAF loop + PGlite's worker MessagePort keeping the event loop alive). No
    application defect was found — every product assertion passed first time.
  - Details: `docs/phase-8.3-final-acceptance.md`. Run with
    `npm run test:phase-8.3`, or `npm run test:phase-8` for all 161 tests.

- **Phase 8.2 — validation, security and error handling completed:**
  - **Closed a real privilege-escalation hole.** The M17 FKs only require the
    provenance tuple to be self-consistent, so a tenant could directly
    `UPDATE` their own saved row onto a *different* theme's valid tuple
    (PostgREST path, RLS satisfied). M23 adds
    `enforce_saved_service_provenance()`, making `business_id`, `theme_id`,
    `category_id` and `predefined_service_id` immutable after insert.
  - The same trigger validates the full chain on insert and now rejects links to
    **inactive** themes/predefined services, which the FKs alone allowed.
  - Verified by attack, not assumption: a user cannot view, add, edit or delete
    another salon's services through either the RPCs or direct table access;
    non-members and anonymous visitors are fully locked out. Global catalog
    tables reject all six tenant verbs.
  - `theme_id` → active theme, `category_id` → belongs to theme,
    `predefined_service_id` → belongs to category + theme, tested as
    permutations across all five themes.
  - UI states completed: loading, empty list, invalid theme/category, inactive
    service, database error (with retry), duplicate, and failed
    Add Selected/Edit/Delete. Add Selected batches are atomic.
  - Stale-theme protection strengthened: the saved list is gated on
    `savedStatusTheme === theme`, and a **failed** load leaves the gate closed so
    a previous theme's services can never appear.
  - `rpcError()` now allow-lists our own messages; raw PostgreSQL text
    (tables/constraints/SQL) is logged for developers but never rendered.
  - Details: `docs/phase-8.2-validation-security.md`. Validation: M01–M23 replay
    x2, tests A–T 20/20, catalog 4/4, saving 14/14, management 9/9, and a new
    adversarial security suite **20/20** (`npm run test:service-security`).

- **Phase 8.1 — service management workflow completed (all five themes):**
  - Added M22 completing saved-service management: `create_saved_service`,
    patch-semantics `update_saved_service`, `set_saved_service_status`,
    `set_saved_service_active` and a package/staff-aware `delete_saved_service`.
  - Add Service now persists to the database for the five themes with explicit
    provenance. A predefined link is kept only when the picked row still belongs
    to the selected category of the current theme; Custom / "Other" always sends
    `predefined_service_id NULL` and is never inferred from the typed name.
  - Edit, Update Price, Update Duration, Update Description and Change Status
    are independent operations. Relationship columns are absent from every edit
    signature, `SET` list, client type and UI control, so `theme_id`,
    `category_id` and `predefined_service_id` survive every change.
  - Delete removes only the tenant's `public.services` row, refuses when the
    service is still in one of the salon's packages, and never targets global
    `themes` / `service_categories` / `predefined_services`.
  - Duplicate prevention: existing predefined uniqueness plus a new partial
    unique index on `(business_id, theme_id, lower(btrim(name)))` for custom
    rows, with readable pre-checks on add and rename. Archived rows are excluded
    so retired services can be re-created. M22 fails closed on pre-existing
    duplicates rather than deleting or merging owner data.
  - Duplicating a service now always creates a NEW custom row, so the original
    predefined link stays unique to the original saved service.
  - Details: `docs/phase-8.1-service-management.md`. Validation: M01–M22 replay
    x2, tests A–T 20/20, catalog 4/4, saving 11/11, and a new real-database E2E
    suite 9/9 (`npm run test:service-management`).
- **Phase 7.4 Session 3 — final integration completed:**
  - Removed cross-theme in-memory service snapshots. Theme changes clear
    services/packages; Step Services resets suggestion/category/predefined/form
    buffers plus catalog/saved request identities before new data can render.
  - Added M21 tenant-derived saved-service load/edit/status/delete RPCs. Refresh
    hydrates only the authenticated tenant + current theme saved rows; repeated
    reads never insert duplicates.
  - Edit RPCs cannot change business/theme/category/predefined relationships.
    Deactivate changes only saved status. Delete targets only the tenant saved
    row; global themes/categories/predefined rows remain untouched.
  - Existing RLS and server-derived membership block cross-salon direct/RPC
    access. Existing Theme remains preserved/static and receives no stale DB data.
  - Details: `docs/phase-7.4-session-3-final-integration.md`. Final validation:
    M01–M21 x2, tests A–S 19/19, catalog 4/4, management 6/6.
- **Phase 7.4 Session 2 — Add Selected database saving completed:**
  - Added M20 `save_predefined_services(theme_id, predefined_ids[])`; it derives
    the single manageable tenant from `auth.uid() → business_members`, never
    trusts a browser salon ID, and validates the full active theme/category/
    predefined chain before one atomic insert.
  - Partial uniqueness on `(business_id, predefined_service_id)` prevents
    repeated/concurrent duplicates while leaving custom NULL provenance alone.
    Conflicts preserve existing owner-edited saved rows with `DO NOTHING`.
  - Five-theme Add Selected sends current RPC predefined UUIDs and preserves
    tenant/theme/category/predefined IDs, name, description, price, duration and
    status in DB/local preview state. Select All remains current-visible only.
  - Custom creation explicitly keeps provenance NULL. Existing custom/saved data
    is not deleted, converted, or overwritten. Advanced edit/delete is deferred.
  - Details: `docs/phase-7.4-session-2-service-saving.md`. Validation: M01–M20
    replay x2, tests A–R 18/18, and service-saving tests 4/4.
- **Phase 7.4 Session 1 — five-theme database reads connected (no writes):**
  - Added M19 `get_theme_service_catalog(p_theme_id)`. The mandatory SQL filter
    returns only the requested active theme, its categories, its active
    predefined services, and its `is_suggested=true` relationships.
  - Added `src/lib/themeCatalogService.ts`; all five seeded themes use the RPC,
    validate returned theme/category/service IDs, and reject cross-theme data.
  - `StepServices` now reads five-theme categories, service options, suggested
    chips, names, descriptions, default prices and durations from the current
    database catalog. It never downloads the global catalog for client filtering.
  - Theme switches clear data immediately and use request IDs plus render-time
    identity guards, preventing stale/late previous-theme responses.
  - Existing `hair` / Existing Theme UI remains unchanged because Phase 7.3 did
    not seed it. No renderer/layout, custom service, Add Selected persistence,
    saved-service writes, or package logic changed. Session 1 stops at reads.
  - Details: `docs/phase-7.4-session-1-database-ui-read.md`. Validation: M01–M19
    replay x2, tests A–Q 17/17, and theme catalog UI tests 4/4.
- **Phase 7.3 exact five-theme seed completed (draft, not applied):**
  - Added generated M18 seeding only `barber_mens_grooming`,
    `hair_studio_color_bar`, `beauty_skin_spa`, `family_full_service`, and
    `nail_lash_studio`.
  - Exact Phase 2–6 source totals: 5 themes, 17 categories, 78 predefined
    services, and 30 suggested mappings. Names, descriptions, category links,
    sort order, active/suggested flags, and alias mappings are source-checked.
  - Suggested display labels/order live on their canonical predefined row
    (`suggested_label` / `suggested_sort_order`), so aliases do not create
    duplicate or unrelated service text.
  - `scripts/generate-theme-seed.mts` deterministically generates M18 from
    `src/lib/themeServices.ts`; `npm run validate:migrations` fails on drift.
  - Upserts make replay safe and preserve existing IDs. Saved salon/user
    `public.services` data is untouched.
  - Details: `docs/phase-7.3-five-theme-seed.md`. Final validation is M01–M18
    clean replay x2 and tests A–P passing (16/16).
- **Phase 7.2 saved-service catalog links completed (draft, not applied):**
  - Added M17, extending existing tenant-owned `public.services` in place with
    nullable `theme_id`, `category_id`, and `predefined_service_id`.
  - Existing manual/custom services remain valid with `NULL` provenance; no
    row is deleted, rewritten, or guessed from editable names/category text.
  - Direct and composite FKs enforce exact theme/category/predefined matching
    on insert and update, with `RESTRICT` parent deletes. Existing `business_id`,
    name, category text, description, price, duration, feature/status, ordering,
    booking/staff/package links, and RLS ownership remain unchanged.
  - Full rationale: `docs/phase-7.2-saved-service-catalog-links.md`.
  - Baseline migration checks passed before work; final validation is M01–M17
    clean replay x2 and tests A–O passing (15/15).
- **Phase 7.1 theme-service database architecture completed (draft, not applied):**
  - Added M16 with global `themes → service_categories → predefined_services`
    tables. No theme/service dataset is seeded.
  - Existing tenant-owned `public.services` remains unchanged; it is not
    equivalent to the global predefined catalog.
  - Category-to-theme and composite service/category/theme FKs reject orphan
    and cross-theme relationships. Parent deletes are restricted.
  - Added uniqueness/checks, ordered lookup indexes, timestamp triggers, and
    read-only active-catalog RLS for `anon`/`authenticated`; only `service_role`
    can mutate catalog rows.
  - Full rationale and ERD: `docs/phase-7.1-theme-service-database.md`.
  - Validation: M01–M16 replay cleanly twice; tests A–N pass (14/14).
- **Category-based auto-suggested service descriptions (Step 05 / Add Service)**:
  - When the user picks a **Category** in the "Add New Service" form, the
    Description field is auto-filled with a professional, customer-friendly,
    service-specific suggestion. Copy is category-aware (offline, rule-based —
    no API key needed): **Haircut** (precision cut), **Styling** (blow-dry/set),
    **Color** (color/highlights/balayage), **Treatment** (hair/scalp repair),
    **Barbering** (men's grooming/beard/shaving), plus a generic fallback.
  - Suggestions are prefixed with the service name (e.g. *"Balayage Color —
    Vibrant, long-lasting color…"*), so they stay service-specific and update as
    the name is typed (only while the description hasn't been hand-written).
  - Description is fully user-editable. If the user hand-writes it and then
    changes the category, the suggestion is **not** overwritten silently — an
    inline "Replace / Keep mine" confirmation appears. A **"Generate
    suggestion"** button is also provided to regenerate on demand.
  - All new logic lives in `src/screens/StepServices.tsx`
    (`suggestServiceDescription`, `handleOpenAddService`, `handleCategoryChange`,
    `handleServiceNameChange`, `handleServiceDescChange`, `applyDescSuggestion`).
    No schema/DB changes. Regression: `npm run lint`.
- **Owner Photo + Owner Role (Step 03 / dashboard edit)**:
  - `SalonData.ownerPhotoUrl` added and persisted through the existing
    `nexora_onboarding_state` localStorage flow (same pattern as `logoUrl`).
  - Step Details "Add Photo" is a real file picker: preview, change, remove,
    image-type + 2MB validation. Dashboard → Website → Owner Profile can edit
    the same fields after publish.
  - Owner Role is a select list (Founder, Co-Founder, Owner, Managing Director,
    Creative Director, Master Stylist, Senior Stylist, Salon Manager, Director,
    Founder & Master Stylist, Other). "Other" reveals a custom title field.
  - Both fields stay optional. Live preview / published site use the saved
    photo (initials fallback) instead of a hardcoded stock portrait.
  - No database/storage schema change. Maps conceptually to draft
    `business_owners.photo_url` / `role_title`.
  - Regression: `npm run test:owner`.
- **Brand Identity → Salon Name font & color**:
  - New shared presets in `src/lib/brandIdentity.ts`: **5 salon-name fonts**
    (Elegant Serif / Playfair, Modern Sans / Inter, Luxury Script / Great Vibes,
    Bold Display / Oswald, Editorial Slab / Arvo) and **5 theme-matching text
    colors** (Charcoal, Nexora Pink, Deep Gold, Emerald, Royal Blue).
  - New `SalonData` fields `salonNameFont` / `salonNameColor` (persisted in the
    existing localStorage flow — no schema/DB changes).
  - Pickers added in **Step 11 Template Appearance** (wizard, Brand Identity
    card) and the **Dashboard → Website tab** (Business & About Info → "Salon
    Name Style" box); both update the live preview instantly and auto-save.
  - The selected font/color is applied to the salon name in the published site
    renderers: `TemplateRenderer` (nav + footer, used by wizard previews, full
    website preview, publish setup, dashboard sandbox & live-site modal),
    `PreviewPane` (wizard live preview), `CustomerBookingPreview` (booking
    header + confirmation), and Step 11's inline preview.
- **Tagline category/sub-category picker** (Salon / Beauty / Spa with the exact
  sub-category lists, 5 professional options each + manual entry) already lived
  in Step 11 — verified working, saves to `data.tagline`, reflected in previews.
- **Core services** — "Add Another Service" in Step 11, "Add Service" in
  Step 05, and the Dashboard services drawer are all functional (name, price,
  duration, description; instant list + live preview updates).
- **Appointment payment rule** — advance deposit is fixed at **25%** everywhere
  (`StepContactBooking` forces `advanceDepositPercentage: 25`, dashboard shows
  the fixed policy, booking flow hardcodes 25%) with no 0/10/50/100 selector.
  Mock payment flow kept; no Razorpay/real gateway added. The testing-phase
  switch is documented at the top of `PreviewPane.tsx` (`advancePaymentSuccessful
  = true` keeps Call Now / WhatsApp / Book Online active; flip to `false` when
  the real integration lands).
- **Auth UI / Login Modal fixed**:
  - The login modal now renders through a React portal (`createPortal(..., document.body)`),
    preventing any clipping or hidden modal issues caused by parent `overflow-hidden`,
    CSS transforms, or stacking contexts (specifically on Screen 02 Hero Split, TopBar, and Location screens).
  - Accessible HTML `<form>` with explicit **Log In** and **Sign Up** mode switcher tabs,
    email and password inputs (with show/hide password toggle and ≥6 character validation for sign-up),
    Enter-to-submit, loading spinner, error/notice banners, Escape key listener, and backdrop click to close.
  - The form opens reliably even when Supabase environment variables are absent, displaying a clear notice:
    *"Authentication form is ready, but Supabase is not connected. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app."*
  - TopBar account action includes a graceful loading fallback so buttons never permanently disappear during session verification.
  - Automated regression suite added in `scripts/test-auth-modal.mjs` (`npm run test:auth`).
- `supabase/migrations/` now contains **24 ordered DRAFT migrations (M01–M24)**:
  M01–M15 follow the 90-point specification §5.25; M16–M21 complete the Phase 7
  catalog, provenance, seed, read, save, refresh, and management architecture;
  M22 completes Phase 8.1; M23 adds Phase 8.2 security hardening; M24 adds the
  Phase 9.1 offer, badge, variable-price and theme-bundle architecture.
- `scripts/validate-migrations.mjs` source-checks M18, applies all 24 files twice, and runs
  the expanded functional acceptance set A–T using `@electric-sql/pglite` (real PostgreSQL).
- Validation is green: **24/24 clean apply on pass 1, 24/24 on pass 2, 20/20
  functional tests, 9/9 Phase 9.1 tests, and 14/14 auth regression tests**.
- **No migration has been applied to local, staging, or live Supabase.** The SQL
  is a reviewed/testable draft only.

## PR history

| PR | What landed |
|----|-------------|
| #1 | Complete 16-screen navigation, standardized headers, server fallbacks |
| #2 | All 22 screens activated — universal navigator, backend & Vite fixes |
| #3 | Screens 23–25 — Booking Confirmation, Referral, Branding White-label |
| #4 | Nexora 90-point Supabase master database specification |
| #5 | Leaflet/Nominatim owner location, Supabase auth, public `/nearby` search |
| #6 | Repository agent guide (`AGENTS.md`) and this handoff document |
| #7 | 15 Safe migrations draft from 90-point spec (M01–M15) + PGlite acceptance suite |
| Current | Fix login and sign-up modal portal rendering, accessible form, and triggers |

## Existing application inventory

- **Wizard screens 01–16**: Landing, Hero Split, Template, Details, Services,
  Team, Photos, Socials, Location & Hours, Contact & Booking, Appearance, AI
  Content Review, Full Website Preview, Publish Setup, Publish Success + QR,
  Booking Confirmation.
- **Screen 17**: Staff Management Module (7-day shifts, payroll/commissions,
  role permissions, availability).
- **Dashboard 18–25**: Overview, Website & Design, Bookings & Calendar,
  Payments & Revenue, Share, Settings, Referral, Branding.
- **Screen 26 (Phase 17.1)**: Salon Owner Dashboard foundation — sections for
  Overview, Today's Appointments, Upcoming Appointments, Customers,
  Revenue/Payments, Calendar and Notifications, scoped to the signed-in
  owner's own salon via `organization_members → salons`. Today's Appointments
  is implemented (17.2) and Upcoming Appointments (17.3) over the existing
  booking records; the remaining four sections are still foundation
  placeholders.
- **Public customer discovery**: `/nearby` renders `NearbySalonSearch`.
- **Current app persistence**: wizard/dashboard data is still primarily
  localStorage/in-memory; the draft DB schema is not yet wired to screens.

## Environment & Supabase Auth configuration requirements

For real authentication and owner session management:

1. **Supabase Dashboard → Project Settings → API**:
   - `VITE_SUPABASE_URL`: Project URL (`https://<project-ref>.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY`: `anon` / `public` API key
   - **Never** expose `service_role` in browser client or repository code.
2. **Supabase Dashboard → Authentication → Providers**:
   - **Email** provider must be enabled.
3. **Supabase Dashboard → Authentication → URL Configuration**:
   - Add your app/preview URL (`https://{port}-{sandboxId}.e2b.app` or custom domain)
     to **Redirect URLs** and **Site URL**.
4. **Email Confirmation**:
   - If *Confirm email* is enabled in Supabase, users will receive a verification link upon
     signing up. The form displays a confirmation notice and instructs the user to check their email.

```bash
cp .env.example .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                 # http://0.0.0.0:3000
```

## Database status — keep these realities separate

### 1. Live Supabase schema used by the app today

Known from earlier live checks/documentation:

- `public.salons` owns authoritative location columns: `address`, `latitude`,
  `longitude`, `location_confirmed`, `location_confirmed_at`.
- Ownership is `auth.users.id → organization_members (role='owner') →
  salons.organization_id`.
- Helpers include `nexora_owner_salon_ids()` and
  `private.can_manage_salon_settings(id)`.
- `job_salon_members` is a staff relation and must never be treated as owner
  identity.

This live schema has **not** been introspected during the migration-draft work.
Do not infer its complete state from the repository.

### 2. Target architecture from the 90-point specification

- Canonical tenant model: `businesses` + `business_members`.
- One source each for services, staff, customers, bookings, payments, website,
  media, settings and referrals.
- Business-scoped RLS; narrow public website RPC; business-scoped Storage.
- Integer INR paise and a DB/server-enforced fixed 25% advance.
- Historical booking snapshots, payment verification/idempotency, audit events,
  auto-save/resume, plan/white-label gates.

### 3. Checked-in M01–M24 drafts

The draft creates a clean target schema only when no known legacy collision is
present. **M02 deliberately raises an exception** when it finds known live/legacy
names (`salons`, `organizations`, `organization_members`, `job_salon_members`,
`staff`, `appointments`, `referrals`). This fail-closed behavior prevents a
parallel business model.

Because the known live project has several of those objects, M02 must be
regenerated after read-only introspection with explicit preserving
rename/ALTER/backfill steps. M03–M23 may also need adjustments based on the
actual types, keys, policies and data.

The optional `payment_refunds` table is deferred until a real refund backend is
implemented. SQL also cannot read browser localStorage; the later application
wiring step must upsert each owner's existing draft/progress payload.

## Validation commands

```bash
npm run lint                # TypeScript type check (tsc --noEmit)
npm run test:auth           # Auth modal and login reliability regression tests
node verify-22-screens.js   # Static verification of all 25 screens & features
npm run generate:theme-seed # regenerate M18 from the TypeScript source
npm run validate:migrations # source-check M18 + apply M01–M24 twice + tests A–T
npm run test:theme-catalog # five-theme DB/RPC/UI read-boundary checks
npm run test:service-saving # refresh/CRUD/ownership/provenance checks
npm run test:service-management # Phase 8.1 real-database management E2E
npm run test:service-security # Phase 8.2 adversarial security/validation suite
npm run test:acceptance    # Phase 8.3 five-theme acceptance (data + integration)
npm run test:acceptance-ui # Phase 8.3 five-theme acceptance (real React UI)
npm run test:phase-7.4-final # complete Phase 7.4 validation
npm run test:phase-8.1     # complete Phase 8.1 validation
npm run test:phase-8.2     # complete Phase 8.2 validation
npm run test:phase-8.3     # complete Phase 8.3 final acceptance
npm run test:phase-8       # every Phase 7-8 suite (161 tests)
npm run test:phase-9.1     # M01–M24 replay + five-theme Phase 9.1 acceptance
npm run test:phase-10.1    # global header & navigation across all five themes
npm run test:phase-10.2    # global EN/HI language + per-theme dark mode
npm run test:phase-10.3    # canonical section order + responsive structure
npm run test:phase-10.4    # final CTA, footer & floating actions
npm run test:phase-10.5    # announcement bar & live salon status
npm run test:phase-10.6    # Book Appointment entry flow (102 tests)
npm run test:phase-10.7    # Advance payment & booking confirmation (66 tests)
npm run test:phase-10      # every Phase 10 suite (1259 tests)
npm run test:phase-11.1    # unique hero design across all five themes (215 tests)
npm run test:phase-11.2    # hero headline & content, EN + HI (138 tests)
npm run test:phase-11.3    # hero media & CTA across all five themes (249 tests)
npm run test:phase-11.4    # hero desktop+tablet+mobile QA (369 tests)
npm run test:phase-11.5    # hero final polish (294 tests)
npm run test:phase-11.6    # hero interaction & conversion (377 tests)
npm run test:phase-11.7    # hero data validation (306 tests)
npm run test:phase-11.8    # final hero acceptance gate (450 tests)
npm run test:phase-11      # every Phase 11 suite (2398 tests)
npm run test:phase-11      # both Phase 11 suites
npm run test:phase-12.1    # trust & salon stats across all five themes (84 tests)
npm run test:phase-12.2    # featured services across all five themes (117 tests)
npm run test:phase-12.3    # featured service card enhancement (74 tests)
npm run test:phase-12.4    # complete service directory across all five themes (105 tests)
npm run test:phase-12.5    # service discovery (search/filter/sort) across all five themes (83 tests)
npm run test:phase-12.6    # service detail experience across all five themes (59 tests)
npm run test:phase-12.7    # service images & visuals across all five themes (60 tests)
npm run test:phase-14.1    # gallery & visual portfolio across all five themes (55 tests)
npm run test:phase-14.3    # gallery viewer (advanced lightbox) across all five themes (37 tests)
npm run test:phase-14.4    # gallery final validation across all five themes (22 tests)
npm run test:phase-14.5    # gallery conversion & final polish (22 tests)
npm run test:phase-14.6    # owner/admin gallery management (26 tests)
npm run test:phase-14.7    # owner/admin gallery approval / moderation (18 tests)
npm run test:phase-14      # every Phase 14 suite (180 tests)
npm run test:phase-15.1    # video gallery foundation across all five themes (26 tests)
npm run test:phase-15.2    # YouTube/platform URL auto-fetch (18 tests)
npm run test:phase-15.3    # 5 shorts + 5 long videos per theme (21 tests)
npm run test:phase-15.4    # auto thumbnail + title + description (18 tests)
npm run test:phase-15.5    # theme-wise protected mock video data (19 tests)
npm run test:phase-15.6    # owner/admin video management (34 tests)
npm run test:phase-15.7    # exact original-platform video player/redirect (11 tests)
npm run test:phase-15.8    # likes + weekly most-liked videos (24 tests)
npm run test:phase-15.10   # final 5-theme video acceptance (73 tests)
npm run test:phase-15      # every Phase 15 suite (244 tests)
npm run test:phase-16.1    # booking foundation: Salon → Service → Date → Time → Details → Summary (55 tests)
npm run test:phase-16.2    # multi-service selection + auto totals (55 tests)
npm run test:phase-16.3    # date & time slot availability (36 tests)
npm run test:phase-16.5    # advance payment / deposit (24 tests)
npm run test:phase-16.7    # booking management (39 tests)
npm run test:phase-16.9    # booking notifications & UX (47 tests)
npm run test:phase-16.10   # final booking acceptance gate (68 tests)
npm run test:phase-17.1    # owner dashboard foundation (56 tests)
npm run test:phase-17.2    # today's appointments (49 tests)
npm run test:phase-17.3    # upcoming appointments (50 tests)
npm run build               # Vite build + esbuild server bundle
```

Expected output:
- `lint`: 0 errors
- `test:auth`: 14/14 passed
- `verify-22-screens`: 25/25 verified
- `validate:migrations`: M18 source check + 27/27 applied cleanly x2, 21/21 tests passed
- `test:phase-9.1`: 9/9 passed across all five themes
- `test:phase-10.1`: 80/80 passed · `test:phase-10.2`: 49/49
- `test:phase-10.3`: 86/86 passed · `test:phase-10.4`: 118/118
- `test:phase-10.5`: 56/56 passed · `test:phase-10.6`: 107/107 (6 steps since 16.1)
- `test:phase-11.1`: 215/215 passed (unique hero design, all five themes)
- `test:phase-11.2`: 138/138 passed (hero headline & content, EN + HI)
- `test:phase-11.3`: 249/249 passed (hero media & CTA, all five themes)
- `test:phase-11.4`: 369/369 passed (hero desktop + tablet + mobile QA)
- `test:phase-11.5`: 294/294 passed (hero final polish)
- `test:phase-11.6`: 377/377 passed (hero interaction & conversion)
- `test:phase-11.7`: 306/306 passed (hero data validation)
- `test:phase-11.8`: 450/450 passed (final hero acceptance)
- `test:phase-11`: 2398 tests, all green — PHASE 11 ACCEPTED
- `test:phase-12.1`: 84/84 passed (trust & salon stats, all five themes)
- `test:phase-12.2`: 117/117 passed (featured services, all five themes)
- `test:phase-12.3`: 74/74 passed (featured service card enhancement)
- `test:phase-12.4`: 105/105 passed (complete service directory)
- `test:phase-12.5`: 83/83 passed (service discovery — search/filter/sort)
- `test:phase-12.6`: 59/59 passed (service detail experience)
- `test:phase-12.7`: 60/60 passed (service images & visuals)
- `test:phase-14.1`: 55/55 passed (gallery & visual portfolio, all five themes)
- `test:phase-14.3`: 37/37 passed (gallery viewer, all five themes)
- `test:phase-14.4`: 22/22 passed (gallery final validation)
- `test:phase-14.5`: 22/22 passed (gallery conversion & final polish)
- `test:phase-14.6`: 26/26 passed (owner/admin gallery management)
- `test:phase-14.7`: 18/18 passed (owner/admin gallery approval / moderation)
- `test:phase-14`: 180/180 passed (Phase 14 complete)
- `test:phase-15.1`: 26/26 passed (video gallery foundation, all five themes)
- `test:phase-15.2`: 18/18 passed (YouTube/platform URL auto-fetch)
- `test:phase-15.3`: 21/21 passed (5 shorts + 5 long videos per theme)
- `test:phase-15.4`: 18/18 passed (auto thumbnail + title + description)
- `test:phase-15.5`: 19/19 passed (theme-wise protected mock video data)
- `test:phase-15.6`: 34/34 passed (owner/admin video management)
- `test:phase-15.7`: 11/11 passed (original-platform player/redirect)
- `test:phase-15.8`: 24/24 passed (likes + weekly most-liked videos)
- `test:phase-15.10`: 73/73 passed (final 5-theme video acceptance)
- `test:phase-15`: 244 tests, all green — PHASE 15 ACCEPTED
- `test:phase-16.1`: 55/55 passed (booking foundation, all five themes)
- `test:phase-16.2`: 55/55 passed (multi-service selection + auto totals)
- `test:phase-16.3`: 36/36 passed (date & time slot availability)
- `test:phase-16.5`: 24/24 passed (advance payment / deposit)
- `test:phase-16.7`: 39/39 passed (booking management)
- `test:phase-16.9`: 47/47 passed (booking notifications & UX)
- `test:phase-16.10`: 68/68 passed (final booking acceptance — PHASE 16 ACCEPTED)
- `test:phase-17.1`: 56/56 passed (salon owner dashboard foundation)
- `test:phase-17.2`: 49/49 passed (today's appointments)
- `test:phase-17.3`: 50/50 passed (upcoming appointments)
- `test:phase-10.6`: 107/107 passed (updated for the 6-step structure)
- `test:phase-10.7`: 66/66 passed
- `test:phase-10.8`: 36/36 passed
- `test:phase-10`: 593 tests, all green
- `test:theme-catalog`: 4/4 passed
- `test:service-saving`: 14/14 passed
- `test:service-management`: 9/9 passed
- `test:service-security`: 20/20 passed
- `test:acceptance`: 66/66 passed
- `test:acceptance-ui`: 28/28 passed

## Guardrails / gotchas

- **Do not apply M01–M24 yet.** Draft generation and PGlite validation are not
  execution approval.
- Read-only live introspection comes first; sanitize outputs before committing.
- Regenerate M02 rather than bypassing its collision exception.
- No destructive table replacement, duplicate `salons`/`businesses` model, ID
  rewrite, or unreviewed constraint on existing rows.
- Keep payments/bookings server-controlled. Anonymous users get no direct
  booking/payment table writes.
- Razorpay signatures are verified in trusted server/Edge code; DB functions
  receive only the verified result and never a secret.
- Existing `docs/owner-location-setup.sql` predates these migrations; reconcile
  it with finalized M02/M12 before running either path.
- The app has no router; `/nearby` remains special-cased in `src/main.tsx`.
- Preserve server binding/CORS/host compatibility and the intentional Vite
  HMR/watch configuration.

## Required next sequence

1. **Live Supabase introspection (read-only).**
2. **Regenerate M02** and adapt downstream drafts to preserve the actual schema/data.
3. Re-run clean replay, legacy-upgrade fixtures and security review.
4. Obtain a **separate explicit go-ahead** for database execution.
5. Apply M01–M24 in order via Supabase CLI (preferred) or SQL editor.
6. Run P88 acceptance tests **A–L** plus Phase tests **M–T** on the approved environment.
7. Generate/commit Supabase **TypeScript types** per P72 and wire the service layer.

In short: **live Supabase introspection → M02 regenerate → approved M01–M24
apply → acceptance A–T → TypeScript types**.
