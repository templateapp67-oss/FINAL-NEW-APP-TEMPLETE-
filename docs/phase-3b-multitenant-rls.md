# Phase 3B — Multi-Tenant Authorization & Complete RLS Implementation

**Date:** 2026-08-21
**Repos:** FINAL-NEW-APP-TEMPLETE- (canonical Supabase chain M28→M37) + nexora-main-website (live shared schema)
**Status:** Implemented + locally verified. Remote Supabase execution **BLOCKED** (no credentials in workspace).

---

## 1. What was implemented

New additive migration (this repo, head of the canonical chain):

- `supabase/migrations/20260821001001_m37_phase3b_multitenant_rls.sql`

### Gap analysis performed BEFORE writing (no guessing)

| Table | RLS before M37 (fresh M28→M36 chain) | Phase 3B action |
|---|---|---|
| `profiles` | ✅ M36 own-row RLS, role guard | re-assert no DELETE; guarded preference-column grant |
| `organizations` | ❌ **no RLS** | RLS + member-select / owner-update policies + column grants |
| `organization_members` | ✅ M28 self-read + M28 revokes + M36 role guard | re-assert no client INSERT/UPDATE/DELETE |
| `salons` | ❌ **no RLS** on fresh chain | RLS + member-select / owner-update + column-limited UPDATE grant |
| `staff` | ❌ **no RLS** on fresh chain | RLS + member-all / public-safe read |
| `salon_hours` | ❌ **no RLS** on fresh chain | RLS + member-all / public-safe read |
| `themes` / `service_categories` | ✅ M28 public read | re-assert never client-writable |
| `services` / `products` / `product_categories` | ✅ M28 policies | restore PostgREST-visible table SELECT for anon (RLS still decides rows), preserving M28's narrow public column scope |
| `business_locations` / `salon_public_websites` / `bookings` / `booking_services` / `booking_slot_holds` / `salon_media` | ✅ M28 policies | unchanged (verified) |
| `payment_orders` / `payments` / `payment_webhook_events` | ✅ M29 read-only RLS | re-assert never client-writable |
| `booking_request_keys` | ✅ M31 server-only | unchanged (verified) |
| `storage.objects` | ✅ M30 storage policies | unchanged (verified) |

### Helper functions (SECURITY DEFINER, empty `search_path`, no dynamic SQL, no unsafe params)

- `private.is_active_admin()` — platform admin check via `profiles` (idempotent re-creation, same canonical semantics as M28).
- `private.has_salon_role(salon_id, roles default ['owner','staff'])` — tenant scope via `salons.organization_id → organization_members` (idempotent re-creation; absent from the live DB, so this bootstraps the shared schema too).
- `private.is_public_salon(salon_id)` — active + non-deleted salon (idempotent re-creation).
- `private.is_org_member(org_id)` / `private.is_org_owner(org_id)` — NEW Phase 3B helpers; member = active org membership, owner = active `owner` membership; admins pass.
- `private.can_manage_salon_settings(uuid)` — existing live helper; M37 only re-asserts its grants (does not redefine, because the live definition differs).
- `public.verify_phase3b_rls()` — service_role-only self-test (14 checks).

Grants: helpers → `authenticated` + `service_role` only (`is_public_salon` also `anon`); `verify_phase3b_rls` → `service_role` only.

### Policies created (all `drop policy if exists` + `create` in the same safe migration)

| Table | Policy | Command | USING | WITH CHECK |
|---|---|---|---|---|
| `organizations` | `phase3b_organizations_member_select` | SELECT | `is_org_member(id)` | — |
| `organizations` | `phase3b_organizations_owner_update` | UPDATE | `is_org_owner(id)` | `is_org_owner(id)` |
| `salons` | `phase3b_salons_member_select` | SELECT | `has_salon_role(id)` | — |
| `salons` | `phase3b_salons_owner_update` | UPDATE | `can_manage_salon_settings(id)` | `can_manage_salon_settings(id)` |
| `staff` | `phase3b_staff_member_all` | ALL | `has_salon_role(salon_id)` | `has_salon_role(salon_id)` |
| `staff` | `phase3b_staff_public_read` | SELECT | active + non-deleted + `is_public_salon` | — |
| `salon_hours` | `phase3b_salon_hours_member_all` | ALL | `has_salon_role(salon_id)` | `has_salon_role(salon_id)` |
| `salon_hours` | `phase3b_salon_hours_public_read` | SELECT | `is_public_salon(salon_id)` | — |

INSERT is deliberately absent on `organizations`/`salons` (no grant → denied); ownership columns `organization_id`/`salon_id` are excluded from the UPDATE grants and re-verified by WITH CHECK, so clients can never reassign tenant ownership.

### Grant discipline

- No anon grants on identity/tenant-private tables (`organizations`, `organization_members`, `profiles`, `bookings`, `payments`, `payment_orders`).
- `salons`/`services`/`products`/`product_categories`/`service_categories`/`staff`/`salon_hours`: table-level SELECT to anon (PostgREST visibility, mirroring the live schema) — RLS decides which rows are visible; legacy salon coordinates stay revoked; M28's narrow public product columns preserved via column revokes.
- Profiles: guarded `allow_recently_viewed` UPDATE grant **only when the column exists** (live shared schema parity; absent on the fresh chain).

---

## 2. Verification (local, PGlite replay of M28→M37)

`node scripts/test-phase3b.mjs` → **32/32 PASS** (also with `NEXORA_MAIN_WEBSITE_PATH` pointing at repo 2 for the cross-repo static scans).

`npm run test:phase-3b` (full chain entry point) → all prior suites + **Phase 3B: 32 passed**.

Coverage:

- **Cross-tenant (User A Org A Salon A vs User B Org B Salon B):** B's organization / salon / services / products / staff / bookings — SELECT, UPDATE, DELETE **all fail** (0 rows or permission denied).
- **Role escalation:** customer→owner, customer→admin, staff→owner, staff→admin, staff→business_user — all fail; changing own role/salon/organization — all fail; `salons.organization_id` and `services.salon_id` reassignment — fail.
- **INSERT protection:** service/product/staff/salon_hours insert with another tenant's `salon_id` fails; `organizations`/`salons` insert denied entirely.
- **Authorized access preserved:** owner reads/updates own org+salon; staff reads salon rows but cannot edit salon settings (owner-only); anon reads only active public catalog rows; inactive/private rows invisible.
- **Self-test** `verify_phase3b_rls()` — 14/14 checks.
- **Idempotency:** M37 replays cleanly on the hardened schema.
- **Static scans (both repos):** no localStorage auth authority; no hardcoded salon/organization ids in client code; no service-role secret in browser code; no anon grants on private tables in M37.

### Repository validation

| Check | Repo 1 (FINAL-NEW-APP-TEMPLETE-) | Repo 2 (nexora-main-website) |
|---|---|---|
| `npm run lint` | ✅ PASS | ⚠️ 3 errors — **PRE-EXISTING** (SplashOverlay.tsx:63 setState-in-effect; nexora-app.tsx:6162 unescaped entities ×2; stash-verified identical on base) |
| `npm run typecheck` | ✅ (lint = tsc --noEmit) | ✅ PASS |
| `npm run build` | ✅ PASS | ⛔ **BLOCKED** — `VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required` (fail-closed credential guard; no credentials exist in workspace) |
| `npm run validate:migrations` | ✅ PASS (21/21 + M37 inventory) | — |

---

## 3. App-side authorization updates

**Neither repo required code changes for Phase 3B.** Verified:

- Repo 1 `src/`: no direct tenant-table writes; `useAuth.ts` reads the session profile via own-row RLS SELECT (never upserts), signup metadata only.
- Repo 2 `app/nexora-app.tsx`: only `favorite_salons` insert (own `user_id`); `platform_role`/`organization_members` are read-only from the client; authorization derives from DB reads (`current_user_role` RPC + profiles session read). The only profiles write is `allow_recently_viewed` on the caller's own row → covered by the new guarded grant in M37 (section 9b).

The one canonical-model sync added in M37: `profiles.allow_recently_viewed` UPDATE grant (guarded by column existence — the column lives in the shared schema but not in this repo's fresh chain).

---

## 4. Final security sweep

| Check | Result |
|---|---|
| Hardcoded salon/org IDs in client code | ✅ none (static scan, both repos) |
| Client-submitted role authorization | ✅ none — DB trigger/RLS only (M36 role guard, M28/M37 membership revokes) |
| localStorage as auth authority | ✅ none (static scan, both repos) |
| service-role key in browser code | ✅ none (static scan + no browser import of server-only modules) |
| Unrestricted INSERT/UPDATE/DELETE | ✅ RLS + narrow grants (M28–M37); organizations/salons server-created only |
| Broad anon SELECT | ✅ anon sees only public catalog rows via RLS; no anon grants on identity/payment tables |
| Missing WITH CHECK | ✅ every UPDATE policy has USING **and** WITH CHECK (M37 + verified M28/M29/M36) |
| Cross-tenant queries | ✅ 0-row results enforced by RLS (harness-verified) |

---

## 5. Status per acceptance criteria

- Tenant authorization database-enforced: **PASS** (org/salon scope derived from `auth.uid() + organization_members` only)
- RLS enabled: **PASS** (all target tables incl. previously-missing `organizations`, `salons`, `staff`, `salon_hours`)
- Correct policies with USING/WITH CHECK: **PASS**
- Cross-tenant access fails: **PASS** (harness)
- Role escalation fails: **PASS** (harness)
- Tenant ownership cannot be reassigned by clients: **PASS** (column grants + WITH CHECK + harness)
- No service-role credential exposed: **PASS**
- Actual migration file exists: **PASS** (`20260821001001_m37_phase3b_multitenant_rls.sql`)
- Both repos app changes synchronized: **PASS** — no changes needed; canonical role model unchanged; M37 bootstraps the same helpers the live DB lacks
- Tests executed: **PASS** (PGlite replay M28→M37, 32/32; full chain green)
- Remote Supabase execution: **BLOCKED** — no Supabase credentials exist in this workspace; the live database has NOT been altered by this phase and must NOT be claimed secured. Apply M37 to the live shared project with the Supabase CLI/dashboard (no credential needed from me, but out of reach here). The migration is written to be additive/idempotent on top of the live schema (same-named live policies are recreated with identical semantics; helper definitions are re-asserted or guarded).

## 6. Known limitations / notes

- PGlite cannot introspect column-level ACL revokes (`has_column_privilege` ignores `attacl`), so the "products soft-delete marker hidden from anon" check is enforced by real PostgreSQL (column REVOKEs in M37) but not provable inside PGlite — noted in the migration self-test comment.
- `salons` table-level SELECT for anon is intentionally granted (PostgREST visibility, identical to live Phase 8) with **no anon policy**, so anon reads return zero rows; public salon discovery continues through the `public_salon_catalog` security-barrier view.
- Pre-existing failures carried into Phase 3B (unchanged, stash-verified in Phase 3A): repo 1 `test-auth-modal.mjs` 13/14 and `test-owner-profile.mjs` FAIL; repo 2 lint 3 errors; repo 2 build BLOCKED.
- Phase 3A-recorded discrepancy re-confirmed: `profiles.preferred_city/preferred_area/gender` are read by repo 2 app but not created by any committed migration — live-schema-only columns; reads are covered by the table-level SELECT grant. No credentials to verify against the live DB → left as a documented note, not fabricated.
