# PHASE 3A — SUPABASE AUTHENTICATION, PROFILES & CANONICAL ROLES

> Session: `arena/01a0248b-final-new-app-templete` · Date: 2026-08-21
> Repositories: `templateapp67-oss/FINAL-NEW-APP-TEMPLETE-` (Repo 1) and
> `janhvitiwari627-hue/nexora-main-website` (Repo 2) — ONE shared Supabase
> backend (`qwaehqsmodekbgvnaavz`).
> Phase 3B/3C intentionally NOT started.

---

## 1. Inspection — what is real vs. mock

Both repositories use **real Supabase Auth end-to-end**. No mock auth, fake
JWT, hardcoded user id, or localStorage-as-authority was found in either
repository's `src/`, `app/`, `packages/`, `server/`, `api/` or `worker/` code.

| Area | Repo 1 (Template App) | Repo 2 (Main Website) |
|---|---|---|
| Client | `src/lib/supabaseClient.ts` — anon key only, PKCE, session persistence + refresh | `packages/auth/src/client.ts` — anon key only, PKCE, shared storage key `nexora.auth.<ref>` |
| Login/signup/logout | `LoginModal.tsx` + `src/lib/useAuth.ts` (email/password, Google, reset) | `packages/auth/src/session.ts` + `service.ts` (canonical 12-method Auth Service) |
| Session restore | `useAuth` → `getSession()` + `onAuthStateChange` | `AuthProvider` → `getSession()` + PKCE callback exchange |
| Server | `server/supabaseAdmin.ts` — service-role client **server-only**, `requireAuthenticatedUser()` verifies bearer via `auth.getUser()` | no server service-role code; `env.ts` actively rejects service-role-looking keys in browser bundles |
| Roles | `organization_members.role` (owner/staff) + `profiles.platform_role` (M28–M35) | `profiles.platform_role` global + `organization_members.role` tenant (live migrations) |
| localStorage | wizard/dashboard tab/session key only | `RECENT_SEARCHES_KEY` UI only; auth code explicitly never authorizes from localStorage |

`auth.users` is the authentication authority in both repos; `profiles.id` is
its 1:1 application identity (PK/FK `auth.users(id)`).

## 2. Canonical role architecture (one system, two scopes)

```
profiles.platform_role        GLOBAL scope: customer | business_user | growth_partner | delivery_partner | admin
organization_members.role     TENANT scope: owner | staff

Phase 3A required roles resolve onto that ONE system:
  owner    -> organization_members.role = 'owner'   (tenant)
  staff    -> organization_members.role = 'staff'   (tenant)
  customer -> profiles.platform_role = 'customer'   (global)
  admin    -> profiles.platform_role = 'admin'      (global)
```

- `profiles_platform_role_check` (5-value) and `organization_members_role_check`
  (`owner|staff`) are TEXT+CHECK constraints on the shared schema (M34 on the
  Repo-1 chain, live Main Website migrations in production).
- No second role table, no enum, no competing role system was introduced.
- Frontend/localStorage roles are never trusted (verified in both repos).

## 3. What Phase 3A actually implemented

### Repository 1 — `FINAL-NEW-APP-TEMPLETE-`

**Migration** `supabase/migrations/20260821000901_m36_phase3a_auth_profiles_roles.sql`
(additive, idempotent, single transaction, fail-closed preflight):

1. **auth.users → profiles** — profile columns that exist in the live shared
   schema are synchronized onto the fresh M28→M36 chain
   (`email`, `phone`, `avatar_url`, `last_seen_at`, `loyalty_points`,
   `wallet_balance_paise`, `role_assigned_at`, `role_assigned_by`). No
   invented columns; no passwords/tokens ever copied into `profiles`.
   Canonical signup trigger `handle_new_user()` (created only when absent)
   is the single profile writer: it reads `raw_user_meta_data.full_name /
   phone / signup_role` and degrades `admin`/`staff` requests to `customer`.
2. **Profile security** — `profiles` RLS enabled + forced; policies
   `profiles_select_own / profiles_insert_own / profiles_update_own /
   profiles_select_admin / profiles_update_admin`; DELETE revoked; narrow
   column grants (UPDATE only `full_name, avatar_url, phone, last_seen_at,
   updated_at`).
3. **Role security** — permanent `guard_profile_platform_role()` trigger
   (platform_role immutable for browser clients; `is_active` changes only by
   admins), `guard_profile_financial_fields()` (wallet/points server-ledger),
   `assign_platform_role(uuid,text)` (service-role/admin only) and
   `set_profile_active(uuid,bool)` (admin only).
4. **Membership defense-in-depth** — `trg_organization_members_role_guard`
   blocks any non-trusted INSERT/DELETE and any role/status change on UPDATE
   (client writes were already revoked from `anon`/`authenticated`).
5. **Session/email sync** — `handle_user_email_change()` keeps
   `profiles.email` in step with `auth.users.email`.
6. **Self-test** — `verify_phase3a_auth()` (service_role only).

**App changes** (profile/type/route synchronization):

- `src/lib/useAuth.ts` — after session restoration the hook now resolves the
  canonical own profile (`id, full_name, platform_role, is_active, avatar_url,
  phone, email`; RLS-restricted; retried briefly; never upserted). Exposes
  `profile: SessionProfile | null` in `AuthState`. `signUpWithPassword` now
  carries optional `fullName`/`phone` as signup metadata so the database
  trigger populates the existing `full_name`/`phone` columns.
- `src/components/LoginModal.tsx` — signup form collects optional Full Name
  and Phone (passed via metadata; never written to profiles directly).
- `src/App.tsx` — owner dashboard additionally requires a real authenticated
  session when Supabase is configured (supplementary; the data layer already
  fails closed via `loadOwnerDashboardContext`).
- `src/types/database.ts` — added `CanonicalRole = 'owner' | 'staff' |
  'customer' | 'admin'` (documented mapping onto the two-scope system) and
  the full canonical `CanonicalProfileRow` (existing live columns only).

**Verification** — `scripts/test-phase3a.mjs` (9 tests, PGlite replay of
M28→M36 + real `authenticated`/`service_role` roles + cross-repo static
scans), wired as `npm run test:phase-3a`.

### Repository 2 — `nexora-main-website`

- `packages/auth/src/roles.ts` — removed the conflicting `staff: "admin"`
  alias. `staff` is the TENANT role (`organization_members.role`) and is
  **not** a global role and not an admin alias; `normalizeRole("staff")` is
  now `null` (signup degrades to `customer`, matching the SQL normalize
  function and the existing test `normalizeSignupRole("staff") ===
  "customer"`). Added the canonical tenant vocabulary
  `TENANT_ROLES = ['owner','staff']`, `TenantRole`, `isTenantRole()` and the
  four-role mapping documentation.
- `packages/auth/src/index.ts` + `app/lib/auth/index.ts` — re-export the new
  tenant-role surface so both repos share one role vocabulary.

No other Repo-2 file was modified; its existing auth/session/guard layer was
already canonical.

## 4. Tests (PHASE 3A suite)

| # | Guarantee | Result |
|---|---|---|
| 1 | Authenticated user maps to correct profile | PASS |
| 2 | User cannot modify another user's profile | PASS |
| 3 | User cannot modify their own role via normal client access | PASS |
| 4 | Customer cannot become owner | PASS |
| 5 | Staff cannot become admin | PASS |
| 6 | Fake user ids are never the auth authority | PASS |
| 7 | localStorage is not the auth authority (both repos scanned) | PASS |
| 8 | Service-role secret not exposed to browser code (both repos scanned) | PASS |
| 9 | `verify_phase3a_auth()` self-test | PASS |

Full chain: `npm run test:phase-3a` → `validate:migrations` 21/21, Phase 2C
20/20, Phase 2D 21/21, Phase 3A 9/9 (with `NEXORA_MAIN_WEBSITE_PATH`).

## 5. Build / lint / typecheck status

| Check | Repo 1 | Repo 2 |
|---|---|---|
| Lint | PASS (`tsc --noEmit`) | FAIL — 3 PRE-EXISTING errors (SplashOverlay.tsx:63 setState-in-effect; nexora-app.tsx:6162 unescaped entities ×2). Identical on base commit; zero new errors from Phase 3A. |
| Typecheck | (lint is the typecheck) PASS | PASS |
| Build | PASS (vite + esbuild) | BLOCKED — fail-closed credential guard (`VITE_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` required; no live credentials in workspace). By design. |

Also verified: repo 2 `phase1-centralized-auth` + `production-auth-security`
(68/68) and auth-config/booking-role-guard/phase2-centralized/phase7
contracts (56/56) PASS. Repo 1 `test-auth-modal.mjs` (13/14) and
`test-owner-profile.mjs` failures are PRE-EXISTING (reproduced on the base
commit).

## 6. Remote migration execution

**BLOCKED.** No Supabase credentials exist in this workspace. Apply M28–M36
to project `qwaehqsmodekbgvnaavz` via the Supabase SQL editor (or CLI) in
order; M36 is safe to re-apply and safe on top of the already-applied Main
Website auth migrations (idempotent, `if not exists` / drop-recreate with
identical semantics). After applying: `select * from public.verify_phase3a_auth();`
(must return all `passed = true`).

## 7. Files changed

**Repository 1**
- `supabase/migrations/20260821000901_m36_phase3a_auth_profiles_roles.sql` (new)
- `scripts/test-phase3a.mjs` (new)
- `scripts/validate-migrations.mjs`
- `package.json`
- `src/lib/useAuth.ts`
- `src/components/LoginModal.tsx`
- `src/App.tsx`
- `src/types/database.ts`
- `docs/HANDOFF.md`
- `docs/phase-3a-auth-profiles-roles.md` (this file)

**Repository 2**
- `packages/auth/src/roles.ts`
- `packages/auth/src/index.ts`
- `app/lib/auth/index.ts`

## 8. Remaining genuine blockers

1. **Remote migration execution** — no live Supabase credentials in the
   workspace; M36 must be applied manually (SQL editor/CLI) and verified with
   `verify_phase3a_auth()`.
2. **Repo 2 build** — fail-closed credential guard requires real
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (by design).
3. **Repo 2 lint** — 3 pre-existing errors untouched by Phase 3A.
4. **Pre-existing app/data mismatches (not Phase 3A scope, recorded for
   3B)**: Repo 2's `nexora-app.tsx` reads/writes `profiles.allow_recently_viewed`
   and reads `preferred_city/preferred_area/gender`, but no migration in
   either repository creates those columns — those client calls silently fail
   against the canonical schema. Phase 3B should confirm against the live
   schema and reconcile or remove them.
