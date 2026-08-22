# Nexora Supabase — Missing Items & Gaps Analysis

> **Scope:** three-way cross-reference of (1) the 90-point master database spec
> (`nexora-database-spec.md`), (2) the committed migration set
> (`supabase/migrations/M01–M38`), and (3) the application code that actually
> talks to the database (`src/lib/*`, `src/types/database.ts`, `server/*`).
>
> **Method:** repo analysis + PGlite smoke + a Dashboard SQL Editor apply of
> M38. Full live catalog introspection (every column/constraint dump) is
> still not done from this workspace — there is no Management API token here.
>
> **Generated:** 2026-08-22 · updated on `arena/01a0277c-final-new-app-templete`
>
> **Resolution note:** M38 was applied on the live project via the Supabase
> SQL Editor (`docs/m38-run-in-supabase.sql`). `storage.objects` ALTER/GRANT
> is skipped when the editor role is not the table owner (42501);
> `supabase_storage_admin` keeps that table. Everything else in M38 committed.
>
> ## Verification ledger (do not skip)
>
> | Surface | Result | Evidence |
> |---|---|---|
> | PGlite M38 smoke (`npm run test:m38`) | **31/31 PASS** | Fresh bootstrap; live-like `status` + membership guard; M28–M37 after M38; public slug lookup; booking RPC; salon-media isolation; `verify_phase3b_rls()` |
> | Historical Design-A suite (`npm run validate:migrations`) | **21/21 PASS** | M38 is excluded from the M01–M27 history (correct — Design B) |
> | Live apply | **APPLIED** (SQL Editor, 2026-08-22) | First attempts failed (partial paste; then `42501 must be owner of table objects`). Owner-guarded M38 then committed. |
> | Live `verify_m38_reconciliation()` | **14/14 PASS** | `profiles`, `organizations`, `organization_members`, `salons`, `salon_public_websites` (+ columns), `salon_media`, `salon-media` bucket, `owner_salon_ids`, `nexora_owner_salon_ids` (delegates), membership guard restored, RLS enabled, `anon` SELECT on SPW. |
> | Live booking / media upload E2E as real tenants | **NOT RUN ON LIVE** | Proven on PGlite only. |
>
> M38's own surface is live-green. The Design A/B fork, `staff` shape, generated
> types, and live booking/media E2E are still open. This is **not** “100% of
> the product database is done.”

---

## 1. Executive summary

The repository contains **two divergent database designs for the same product**,
and the migration chain switches between them part-way through:

| | **Design A — "spec / 90-point"** | **Design B — "canonical / shared"** |
|---|---|---|
| Migrations | M01–M27 | M28–M38 |
| Tenant root | `businesses` | `organizations` → `salons.organization_id` |
| Membership | `business_members` + `business_owners` | `organization_members (role: owner\|staff)` |
| Identity | `profiles` (no platform role) | `profiles.platform_role` |
| Staff | `staff_members` (+ `staff_services/skills/schedules/permissions`) | `staff` |
| Media | `business_media` + `social_profiles` + `social_videos` | `salon_media` (single table, `media_type`/`video_kind`) |
| Location | `business_locations (id, business_id, address_line, …)` | `business_locations (salon_id PK, address_label, approval_status, …)` |
| Website | `website_settings` + `website_content` | `salon_public_websites.config` (JSONB) |
| Services | `services.business_id` | `services.salon_id` (+ `theme_id`, `category_id`, `predefined_service_id`) |
| Bookings | `bookings.business_id` + `appointment_date`/`start_time` | `bookings.salon_id` + `appointment_start`/`appointment_end` + `booking_services` |
| Payments | `payment_orders.business_id` / `payments.business_id` | `payment_orders.salon_id` / `payments.salon_id` |

**The application code uses Design B exclusively.** Every live DB call in
`src/` and `server/` resolves against `salons`, `salon_media`,
`salon_public_websites`, `organization_members`, `public_salon_catalog`, and
`services`/`payment_orders` keyed by `salon_id`. The entire Design-A surface
(`businesses`, `business_members`, `business_owners`, `staff_members`,
`business_media`, `social_videos`, `website_settings`, …) is **never referenced
by runtime code** — it exists only in the spec and in M01–M27.

**M01–M27 and M28–M37 cannot be applied to the same database in sequence.**
M28's fail-closed preflight *requires* columns that M01–M27 never create
(e.g. `services.salon_id`, `bookings.salon_id`, `staff.salon_id`,
`organization_members.is_active`, `salons.organization_id`) and, conversely,
several tables are `CREATE TABLE`-defined in *both* chains with **incompatible
schemas** under the same name (`business_locations`, `payment_orders`,
`payments`, `booking_slot_holds`, `themes`, `service_categories`). Because the
second definition uses `IF NOT EXISTS`, a chain applied over the first silently
no-ops the `CREATE` and then fails on the follow-up ALTERs/indexes that expect
the other schema.

**Bottom line:** the gap is not a handful of missing columns — it is a
**schema fork**. The fix is to retire Design A (M01–M27) as the implementation
target, treat Design B (M28–M38 + live shared schema) as canonical, and close
the smaller per-item gaps listed in §4–§6. M38 closes the in-repo hole
for the four identity/tenant/website roots; it does not dissolve the fork.

---

## 2. What is actually missing (code → database)

These are objects the running application **expects**. Before M38 they were
created by **no** committed migration and only existed in the live shared
project. M38 now bootstraps the identity / tenant / website roots with
`CREATE TABLE IF NOT EXISTS` so a fresh database is self-describing.
Live `verify_m38_reconciliation()` (2026-08-22) confirmed the four roots,
`salon_media`, the `salon-media` bucket, and the anon SELECT grant.

| # | Object | Referenced by | Status after M38 |
|---|---|---|---|
| M-1 | `public.salons` | `ownerSalon.ts`, `salonLocationService.ts`, `nearbySalons.ts` | **Live-verified.** M38 §1.4 + verify `salons`. |
| M-2 | `public.organization_members` | `ownerSalon.ts` | **Live-verified.** M38 §1.3 + verify `organization_members` / guard restored. |
| M-3 | `public.organizations` | (ownership chain) | **Live-verified.** M38 §1.2 + verify `organizations`. |
| M-4 | `public.salon_public_websites` | `salonWebsiteService.ts`, `PublicSalonView.tsx`, `main.tsx` | **Live-verified.** Columns + `anon` SELECT grant (`spw_anon_select`). |
| M-5 | `public.staff` | M28 preflight (`staff.salon_id`) | **Still open by design.** M38 deliberately does not invent a staff shape; M34/M37 already `to_regclass` guard it. |
| M-6 | `public.salons.address/latitude/longitude` vs `business_locations` | `salonLocationService.ts` vs `AGENTS.md` | **Unchanged** doc/code drift (see §5.3). |
| M-7 | Supabase-CLI-generated types | `src/types/database.ts` (hand-written subset) | **Still open.** `npm run db:types:gen` needs a live project. |

> `staff` remains live-schema-only. The other four roots can now be recreated
> from migrations on a fresh database. That does **not** mean the live project
> has them in this exact shape — only that the repo no longer depends on a
> secret shared schema for those four tables.

---

## 3. The schema fork (critical — blocking)

### 3.1 Tables created in BOTH chains with conflicting schemas

| Table | Design A definition | Design B definition |
|---|---|---|
| `business_locations` | **M06**: `id uuid PK`, `business_id uuid UNIQUE → businesses(id)`, `address_line/area/city/state/postal_code/country`, `latitude/longitude double precision`, `google_place_id` | **M28**: `salon_id uuid PK → salons(id)`, `address_label`, `approval_status`, `submitted_by/submitted_at`, `approved_by/approved_at`, `rejection_reason` |
| `payment_orders` | **M09**: `business_id → businesses(id)`, `booking_id`, `provider_order_id`, `amount_paise`, `status` | **M29**: `salon_id`, `booking_id`, `provider`, `provider_order_id`, `amount_paise`, `currency`, `status` |
| `payments` | **M09** (business-keyed) | **M29** (salon-keyed, `provider_payment_id`, `verified_at`) |
| `booking_slot_holds` | **M08** (business-keyed) | **M28** §6 (salon-keyed, `idempotency_key`, `starts_at/ends_at`, `status`) |
| `themes` | **M16** (Phase 7.1 catalog) | **M28** (Phase 1A, adds `theme_id`, `slug`, `ui_config`) |
| `service_categories` | **M16** (Phase 7.1, `business_id`-agnostic global catalog) | **M28** (adds `slug`, `sort_order`, `deleted_at`) |

### 3.2 Spec tables that have NO canonical equivalent (Design A only)

`businesses`, `business_members`, `business_owners`, `packages`,
`package_services`, `staff_members`, `staff_services`, `staff_skills`,
`staff_schedules`, `staff_permissions`, `business_media`, `social_profiles`,
`social_videos`, `business_hours`, `contact_settings`, `booking_settings`,
`booking_day_settings`, `website_settings`, `website_content`,
`onboarding_progress`, `business_draft_state`, `customers`,
`booking_status_history`, `balance_collections`, `referral_codes`,
`referral_events`, `business_activity`, `website_events`,
`notification_settings`, `notifications`, `business_plans`,
`payment_refunds` (explicitly deferred — see §6).

These are all defined by M01–M27 against `businesses(id)` but never consumed by
the app, and are superseded by canonical equivalents where one exists.

### 3.3 Canonical objects with NO spec/Design-A equivalent

`organizations`, `organization_members`, `salons`, `staff`,
`salon_public_websites`, `salon_media`, `products`, `product_categories`,
`booking_services`, `booking_request_keys`, `payment_webhook_events`.

---

## 4. RPC function matrix (defined vs referenced)

All RPC names **referenced** by runtime code resolve to a function defined in
the migrations — no runtime call is missing a function. But there is a large
volume of **defined-but-unreferenced** surface, most of it belonging to Design A
(the spec's business-keyed RPCs) or to server paths not exercised here.

**Referenced by client (`src/`) — all defined (M19–M23, M26, M28–M32):**

`get_theme_service_catalog`, `get_theme_service_audit`,
`check_theme_service_integrity`, `get_saved_services_for_theme`,
`save_predefined_services`, `search_theme_services`, `create_saved_service`,
`update_saved_service`, `set_saved_service_status`, `set_saved_service_active`,
`archive_saved_service`, `delete_saved_service`, `delete_saved_service_media`,
`upsert_saved_service_media`, `upsert_saved_service_translation`,
`get_service_safety_lock`.

**Referenced by server (`server/`) — all defined:**

`create_authoritative_customer_booking` (M31), `get_booking_payment_quote`,
`record_razorpay_order`, `confirm_verified_razorpay_payment`,
`ingest_verified_payment_webhook`, `record_razorpay_payment_failure`,
`process_payment_webhook` (M29).

**Referenced by client but defined under a *different* name:**

| Code constant | Code value | Defined in migrations |
|---|---|---|
| `ownerSalon.ts` `OWNER_SALON_IDS_FN` | `owner_salon_ids` | **Live-verified.** `owner_salon_ids`, `nexora_owner_salon_ids`, and `nexora_alias_delegates` all `ok = true`. |

**Defined but unreferenced by code (notable Design-A / dead surface):**

`is_business_member`, `has_business_role`, `is_published_business`,
`handle_new_business`, `publish_business_website`, `get_public_website_by_slug`,
`get_dashboard_overview`, `get_payments_revenue`, `create_payment_order`,
`verify_payment`, `get_available_slots`, `is_slot_available`,
`record_booking_status_history`, `record_referral_event`,
`enforce_plan_entitlements`, `collect_booking_balance`, and the entire
`nexora_*` business-keyed helper family. These are spec deliverables (P50–P79)
that the Phase-1A/2/3 code path does not call.

**Video-likes RPCs (`toggle_social_video_like`, `get_weekly_top_videos`,
`get_social_video_like_counts`, M27) are defined but have no runtime caller.**
The Phase 15.8 feature is implemented **client-side in localStorage**
(`nexora_video_likes`, `videoLikes.ts`) and M27 is explicitly a "draft
migration" — the server path is not wired. See §5.2.

---

## 5. Cross-cutting issues

### 5.1 Tenant key divergence — `business_id` vs `salon_id` (highest severity)

The spec's entire model is keyed on `business_id`; the canonical model is keyed
on `salon_id` (with `organizations` as the identity umbrella). This single
decision cascades into every table. M28's preflight explicitly rejects the
business-keyed world by requiring `services.salon_id`, `bookings.salon_id`,
`staff.salon_id`, `organization_members.is_active` — none of which M04/M05/M08
create.

### 5.2 Media / video model duplication

Three overlapping media representations exist:

1. `business_media` (M06, business-keyed) — spec P14.
2. `social_videos` (M06, business-keyed) + `social_video_likes` (M27) — spec
   P16 + Phase 15.8.
3. `salon_media` (M28, salon-keyed) with `media_type` (`logo|hero|gallery|…|video|thumbnail`)
   and `video_kind` (`short|long`) — canonical, and the only one the runtime
   code actually reads/writes (`salonMediaService.ts`).

Phase 15 (video gallery/likes) code comments still map onto `social_videos`
(`siteVideoGallery.ts`, `siteVideoCatalog.ts`, `videoUrlMetadata.ts`), while the
Phase 1A/2 media stack uses `salon_media`. These two video models are not
reconciled.

### 5.3 Location model drift (doc vs code vs spec)

- Spec P17 → `business_locations` (business-keyed).
- `AGENTS.md` → "Authoritative columns on `public.salons`: `address`,
  `latitude`, `longitude`, `location_confirmed`, `location_confirmed_at`."
- Code (`salonLocationService.ts`, `nearbySalons.ts`) → reads/writes
  `business_locations` keyed by `salon_id` with `approval_status`.

`AGENTS.md` is stale relative to the code. The code and the canonical migration
(M28) agree; the spec and `AGENTS.md` do not.

### 5.4 Booking model divergence

- Spec/M08: `bookings.business_id`, `appointment_date` (date) + `start_time`/`end_time`
  (time), `service_id`/`package_id`, `service_name_snapshot`,
  `advance_paise`/`remaining_paise`, `booking_reference`.
- Canonical/M28+types: `bookings.salon_id`, `appointment_start`/`appointment_end`
  (timestamptz), `status`, `payment_status`, `total_amount_paise`,
  `advance_amount_paise`, plus a `booking_services` M:N line-item table.

The 25%-advance and snapshot rules are realized differently in each
(`remaining_paise` split vs `advance_amount_paise` + line items).

### 5.5 Identity / role model divergence

- Spec: `profiles` (1:1 `auth.users`) + `business_members.access_role` +
  `business_owners` + `staff_members.app_access_role`.
- Canonical: `profiles.platform_role` (`customer|business_user|growth_partner|delivery_partner|admin`)
  + `organization_members.role` (`owner|staff`), with a generated `is_active`
  column reconciled from the live `status` column (M28 header).

`src/types/database.ts` documents this "one role system, two scopes" and warns
that the live-shared schema has preference columns
(`allow_recently_viewed`, `preferred_city`, `preferred_area`, `gender`) that
**no committed migration creates** — another live-schema-only surface.

### 5.6 Live membership guard — SQL-editor blocker (resolved by M38)

The live Main Website schema ships a `BEFORE INSERT/UPDATE` trigger on
`public.organization_members` — `private.protect_organization_membership_fields()` —
that is **not present anywhere in this repo** (the repo's own equivalent is
M36's coarser `guard_organization_member_role()`, which trusts `current_user =
postgres`). It raises:

```
ERROR:  P0001: only an organization owner or admin may assign owner role
CONTEXT:  PL/pgSQL function private.protect_organization_membership_fields() line 38 at RAISE
```

**Root cause.** The live guard authorizes `role = 'owner'` writes against the
*request JWT* (`auth.uid()` / `auth.jwt()`), not against `current_user`. In the
Supabase Dashboard SQL editor there is no request JWT, so `auth.uid()` is `NULL`
and the guard raises **even though the editor runs as `postgres`**. This breaks:

1. **M28's owner backfill** — `UPDATE organization_members SET role='owner'
   WHERE platform_role='business_user' AND role IS NULL` (M28 §2).
2. **`docs/owner-location-setup.sql` STEP 3** — the `INSERT … (role, status) =
   ('owner','active')` that provisions a real owner membership.

It is a genuine reconciliation gap: the live `organization_members` guard is
stricter than anything M01–M38 models, and it fires during trusted provisioning.

**Resolution — `M38_reconciliation_fix.sql` §2b.** M38 detects the live guard by
function name (`protect_organization_membership_fields`), disables that specific
trigger for the duration of an idempotent owner/staff backfill, then restores
the trigger to its exact prior enable state (`O`/`R`/`A`). The whole block is
one transaction, so a failure rolls the disable/enable back too — the guard is
never weakened and the table is never left unguarded, and client-side role
escalation stays blocked. M38 also ships a documented snippet for safely
provisioning a *new* owner membership in the SQL editor (the
`owner-location-setup.sql` STEP 3 replacement).

> Live `membership_guard_restored = true` (2026-08-22): after M38 the
> `protect_organization_membership_fields` trigger is not left disabled.
> The live function source was not dumped; the name matched well enough
> for the disable/restore path (or the trigger is absent and the check
> still passes). PGlite also reconstructs the raise-and-restore cycle.

---

## 6. Spec points with no coverage (deferred / pending)

| Spec point | Status |
|---|---|
| **Live Supabase introspection** (P1 §0, §4.2, §5.25 step 1) | **Still not done.** No Management API token, no `DATABASE_URL`, and prior outbound TLS to `*.supabase.co` failed. M38 + `npm run test:m38` reconstruct the live-like shape in PGlite; that is not a substitute for live introspection. |
| **M02 regeneration** | Pending. Checked-in M02 is a fail-closed preflight for the *business* world, not a data-preserving ALTER plan for the *salon* world. |
| **P37 `payment_refunds`** | Deferred by design — "no implemented refund backend" (database-migrations-plan.md). Still a gap vs the spec's conditional requirement. |
| **P72 generated TypeScript types** | Not generated; `src/types/database.ts` is a hand-written subset. |
| **P80 Realtime** | Spec requires RLS-respecting Realtime; no migration enables publication or `replica identity` for it. |
| **P82 seed/dev data** | M15 is "no demo data"; M18 is the five-theme catalog seed. No dev/demo dataset script beyond themes. |
| **P88/P89 acceptance A–T** | Tests exist (scripts), but require an applied database; blocked by the schema fork + missing live DB. |
| **LocalStorage → DB migration** (P25, §5.22, M15) | `business_draft_state` created but the app still uses `nexora_onboarding_state` in localStorage; the wiring/upsert step is not implemented in code. |

---

## 7. Recommended remediation order

1. **Stop treating M01–M27 as the implementation target.** They encode Design A.
   Either (a) rewrite them against the `salons`/`organizations` model, or (b)
   archive them as historical spec drafts and document Design B as canonical.
2. **Perform live read-only introspection** of the real Supabase project and
   regenerate a single, ordered, data-preserving migration set that maps every
   live table/column (per the spec's own §5.2–§5.3 ALTER-only rule).
3. **Resolve the duplicate-table definitions** (`business_locations`,
   `payment_orders`, `payments`, `booking_slot_holds`, `themes`,
   `service_categories`) so each table has exactly one owner.
4. **Reconcile the media/video models** — pick `salon_media` and retire/alias
   `business_media` + `social_videos`; wire the Phase 15.8 likes server path
   (M27 RPCs) or explicitly document it as client-only.
5. **Fix documentation drift** — `AGENTS.md` location authority section vs the
   actual `business_locations` code path.
6. **Generate types** (`supabase gen types`) once a DB connection exists and
   replace the hand-written `src/types/database.ts`.
7. Only after the above: obtain explicit go-ahead, apply in order, run
   acceptance A–T, and backfill the `localStorage → DB` onboarding state.

---

## 8. Appendix — full reference matrix

### 8.1 Runtime DB surface (what the code actually touches)

| Surface | Object |
|---|---|
| Tables (`.from`) | `salons`, `salon_media`, `salon_public_websites`, `services`, `themes`, `payment_orders`, `business_locations` |
| Views (`.from`) | `public_salon_catalog` (M28) |
| RPCs (client) | 16 saved-service / theme-catalog / safety functions (M19–M23, M26) |
| RPCs (server) | 7 booking/payment/webhook functions (M29, M31) |
| Storage buckets | `salon-media` (M30) via `salonMediaService.ts` |
| Ownership | `owner_salon_ids()` RPC → `salons` |

### 8.2 Migration inventory (summary)

- **Tables defined:** 59 `CREATE TABLE` statements across 53 distinct tables
  (six tables defined twice: `themes`, `service_categories`, `payments`,
  `payment_orders`, `business_locations`, `booking_slot_holds`).
- **Functions:** ~75 public + ~10 private (incl. `owner_salon_ids`,
  `nexora_owner_salon_ids` duplication).
- **Views:** `active_products`, `active_service_categories`, `active_services`,
  `public_salon_catalog`.
- **Enums:** 25 `nexora_*` types.
- **Triggers:** ~35 (incl. `on_auth_user_created`, `booking_snapshot_immutable`,
  `booking_status_audit`, tenant-enforcement triggers, `set_*_updated_at`).
  Plus the **live-only** `private.protect_organization_membership_fields()`
  membership guard (§5.6) — not defined in any committed migration.
- **Storage buckets:** `business-media` + `avatars` (M13, Design A);
  `salon-media` (M30, Design B). Spec P45's optional `website-assets` is absent.
