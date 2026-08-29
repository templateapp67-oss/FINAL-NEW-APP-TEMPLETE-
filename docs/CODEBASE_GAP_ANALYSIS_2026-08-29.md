# Codebase Gap Analysis Report — 29 August 2026

**Repository:** `templateapp67-oss/FINAL-NEW-APP-TEMPLETE-`
**Branch audited:** `arena/01a04378-final-new-app-templete` @ `09f24aa` (+ uncommitted work)
**Compared against:** `main` @ `2e21fb1`
**Method:** source review, `git` history inspection, and schema introspection by applying the migration chain to PGlite (`scripts/audit-schema-gaps.mjs`). No live Supabase project, Vercel deployment, DNS, or Razorpay account was inspected — items requiring those are marked **UNVERIFIABLE**.

> This report supersedes nothing: `docs/MISSING_ITEMS_GAPS_ANALYSIS.md` (25 Aug 2026) remains the in-repo audit. Where this report disagrees with the brief it was commissioned against, the disagreement is evidence-backed in §0.

---

## 0. Premise corrections (read first)

Six premises in the commissioning brief do not survive verification. They are listed first because three of them would have produced a report describing an empty repository.

| # | Brief's claim | Verified reality | Evidence |
|---|---|---|---|
| 1 | Repo is `FINAL-NEW-TEMPELET-APP-` | Repo is `FINAL-NEW-APP-TEMPLETE-` | `git remote -v` |
| 2 | Tables `missing_items`, `gap_remediation_steps`, `gap_categories`, `subscriptions`, `app_settings` need policies | **None of the five exist.** `missing_items` is a *function*, `private.nexora_publish_missing_items` (M50). The other four have **0 references** in any `.sql`/`.ts`/`.tsx`/`.mjs`/`.json` | grep across repo; 62-table inventory in §1 |
| 3 | Migration drift between branches `20240329` vs `20260101` | No such migrations or branches exist. Migration range is `20260811`→`20260829`. Branches are `main`, `arena/01a04378-…`, `origin/main`. **Real drift does exist — see §1.4, with different branch names and dates** | `ls supabase/migrations/`, `git branch -a` |
| 4 | "Complete absence of Application Code (Frontend UI components, package.json, state handlers)" | **False.** `package.json` exists with **177 scripts**. `src/` holds **85,049 lines** of TS/TSX: 95 components, 15 screens, 133 lib modules, 2 hooks | `wc -l`, `find src` |
| 5 | Missing "Edge Functions/API routes" | **Half true.** No Edge Functions (no `supabase/functions/`). API routes **do** exist: `api/index.ts`, `api/[...path].ts`, `api-routes.ts` (763 lines), `server.ts` (107 lines) | `ls supabase/`, `ls api/` |
| 6 | Missing Realtime Publication settings | **Not a gap.** 0 publications configured **and 0 Realtime client usage** (`.channel(`, `postgres_changes`, `realtime` return nothing in `src/`). Adding a publication would serve nothing | grep `src/` |

**Conclusion:** the brief appears to describe a different (likely empty or scaffold-stage) Supabase project, not this one. The sections below analyse the repository that actually exists.

---

## 1. Database & RLS

### 1.1 Schema inventory (verified by introspection)

Applying all 62 migrations to PGlite yields **56 `public` tables**, **334 functions** (75 `SECURITY DEFINER`), **3 storage buckets**.

**RLS is enabled on 100% of public tables — 0 disabled.** This is the single most important correction to the brief: there is no "missing RLS" problem at the table level.

### 1.2 Per-command policy coverage

| Coverage | Tables |
|---|---|
| Full SELECT/INSERT/UPDATE/DELETE | 17 |
| Partial | 36 |
| No policies at all | 3 — `booking_request_keys`, `organization_members`, `website_bookings` |

**These are not gaps.** Two independent facts establish that the write-policy "shortfalls" are deliberate:

1. **The client writes directly to exactly 2 tables.** Across all 85k lines of `src/`, there are **18 mutation calls total** (3 `.insert(`, 4 `.update(`, 9 `.delete(`, 2 `.upsert(`), touching only `salon_media` and `workspaces`. Everything else is written through RPCs.
2. **M37's header states the rule explicitly:** *"INSERT is either absent (no grant → denied) or bound to `private.has_salon_role()` so a client cannot insert into another salon."*

So `organization_members` having no policies is the correct design for a server-only table whose writes go through `SECURITY DEFINER` functions with grants revoked from `anon`/`authenticated` (M36 §7). **Adding INSERT/UPDATE/DELETE policies to these tables would weaken the security model, not fix it.**

### 1.3 Verification caveat (important)

**17 of 62 migrations refuse to apply outside the live database** — they are preflight guards that fail closed without the live shared schema (e.g. M28 `required canonical table public.organizations is missing`, M36 `required canonical column public.profiles.platform_role is missing`). Therefore the policy counts above are a **lower bound**, reconstructed from 45 applied migrations.

A concrete example of the trap: naive grep reported **0** policies on `organizations`; the correct multi-line-aware count is **4** (M37 lines 224, 231, …). The live policy state is **UNVERIFIABLE** from this checkout and requires:

```sql
select tablename, policyname, cmd, roles from pg_policies
 where schemaname = 'public' order by tablename, cmd;
select c.relname, c.relrowsecurity from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

### 1.4 Migration drift — **real, and different from the brief**

`main` has advanced past this branch's fork point. `git rev-list --left-right --count main...HEAD` → `1  1` (diverged).

**Four migrations exist on `main` and are absent here:**

| File | Lines | Purpose |
|---|---|---|
| `20260827000201_m59_owner_provision_invitation_fix.sql` | 45 | Drop stale 2-arg `provision_owner_salon` overload + PostgREST schema-cache reload |
| `20260828000101_m60_payment_refunds.sql` | 399 | Razorpay refunds, idempotency, reconciliation |
| `20260828000201_m61_booking_reschedule.sql` | 237 | Atomic server-authoritative reschedule |
| `20260828000301_m62_privacy_lifecycle.sql` | 233 | Data export + PII anonymization |

**Collision found and fixed this session:** the owner-provisioning guard fix on this branch was originally `20260827000201_m59_owner_provisioning_invitation_guard_fix.sql` — the **same `20260827000201` timestamp prefix and the same "M59" number** as `main`'s unrelated M59. It has been renumbered to `20260829000101_m63_owner_provisioning_invitation_guard_fix.sql` so it sorts after the M58–M62 track. Manifest and validator updated.

**Corroboration:** `main`'s M59 independently documents the same user-visible symptom this branch fixed — owners shown *"The workspace invitation is invalid or expired"* for a provisioning failure that has no invite concept. Two branches root-caused adjacent halves of one bug.

**Not duplicated:** `main` does **not** fix the M58 `activate_workspace_membership` authorization bypass — 0 mentions across M59–M62 (`git grep -l activate_workspace_membership main -- supabase/migrations/` returns only M58). M63 remains necessary.

### 1.5 Storage buckets

Three buckets are created by migration, all **private**: `avatars`, `business-media`, `salon-media`.

Client code uses **only `salon-media`** (`SALON_MEDIA_BUCKET`, `src/lib/salonMediaService.ts:3`; one `.upload()`, two `.remove()`, one `.createSignedUrl()`). `avatars` and `business-media` are provisioned but unused by the current client — dormant, not missing. **No missing bucket.**

### 1.6 Realtime

0 publications, 0 client subscribers. See §0 row 6. **No action.**

---

## 2. Infrastructure & codebase layers

### 2.1 Application code — present, not absent

`package.json` (177 scripts), `src/components` (95), `src/screens` (15), `src/lib` (133), `src/hooks` (2), `src/types` (1). 85,049 LOC TS/TSX. Vite + React, deployed via `vercel.json` (`framework: vite`, SPA fallback to `/index.html`).

### 2.2 API surface — present

- `api/index.ts` + `api/[...path].ts` — Vercel serverless catch-all
- `api-routes.ts` (763 lines), `server.ts` (107 lines) — Express-style route layer
- `server/` — booking/payment route modules

### 2.3 Edge Functions — genuinely absent

No `supabase/functions/`. `[edge_runtime] enabled = true` is set in `config.toml` but nothing deploys to it. All privileged logic instead lives in 75 `SECURITY DEFINER` Postgres functions. This is a coherent architecture, not an omission — but it means **no Deno-tier place to hold provider secrets or run non-SQL work**, which matters for §3's Razorpay items.

### 2.4 Authentication flow — present; configuration is the gap

Client auth flow exists (`src/lib/authIdentity.ts`, `getAuthoritativeAuthIdentity`, session validation). The gaps are **configuration**, not code — see §3.

### 2.5 Connection / sandbox egress

`config.toml` is **local-development configuration only**: `[db] port = 54322`, `[api] port = 54321`, `[db.pooler] enabled = false`. Nothing in `src/` connects to `localhost:54322`; the browser uses `VITE_SUPABASE_URL=https://qwaehqsmodekbgvnaavz.supabase.co`. So there is **no sandbox egress defect in application code** — the 54322 concern applies only if someone runs `supabase start` locally, which this sandbox cannot (no Docker).

---

## 3. Actionable priority breakdown

### CRITICAL

**C1 — `supabase/config.toml` was invalid TOML.** *(**FIXED this session**)*

Duplicate `[analytics]` table at lines **39** and **61**. Verified with a real parser (`smol-toml`):

```
TOML PARSE ERROR: Invalid TOML document: trying to redefine an already defined table or value
61:  [analytics]
```

Impact: every `supabase` CLI command that parses this file would have failed — `supabase link`, `supabase db push`, `supabase gen types`. The repo's own `scripts/apply-live-migration.mjs` survived only because it reads `project_id` with a **regex** (line 65) instead of a TOML parser — which is why this went unnoticed.

Fix applied: removed the duplicate block. Re-verified after the edit:

```
config.toml: PARSES OK
  project_id      : qwaehqsmodekbgvnaavz
  db.port         : 54322
  auth.site_url   : http://localhost:3000
  auth.redirects  : []
  top-level keys  : project_id, api, db, studio, inbucket, storage, analytics, auth, edge_runtime
```

All nine sections survive; only the redundant duplicate was removed.

**C2 — M58 membership-activation authorization bypass.** *(FIXED this session, not yet on `main`)*

`public.activate_workspace_membership` inserted an active `member` row for any authenticated caller supplying only a workspace UUID — no invitation, no ownership. Proven: intruder received `role=member, status=active, already_existed=false`. Fixed by M63; 4 regression tests added.

**C3 — Owner provisioning blocked by the live invitation guard (P0001).** *(FIXED this session, not yet on `main`)*

`provision_owner_salon` aborted with `new memberships require server-activated invitations`, creating 0 membership rows, because the guard fired even for the trusted `SECURITY DEFINER` bootstrap. No client-side recovery exists (M36 revokes client UPDATE on `platform_role`/`is_active`). Fixed by M63; guard is suspended for the single trusted upsert and restored.

**C4 — Merge blocker: branch divergence.** Rebase this branch onto `main` (M59–M62) before merging. The M59/M63 collision is resolved on this branch; the manifest must then gain M59–M62 in timestamp order.

### HIGH

**H1 — `additional_redirect_urls` is empty.** `[auth] additional_redirect_urls = []` while the deployment origin is `https://final-new-app-templete.vercel.app` (per `.env.example`). OAuth and confirmation redirects to production will be rejected.

```toml
[auth]
site_url = "https://final-new-app-templete.vercel.app"
additional_redirect_urls = [
  "https://final-new-app-templete.vercel.app/**",
  "http://localhost:3000/**"
]
```
Applied live via Dashboard → Auth → URL Configuration (`config.toml` alone does not change a linked project).

**H2 — `VITE_AUTH_REDIRECT_ORIGIN` is a placeholder.** `.env.example` ships `https://your-app.example.com` and warns "Never use localhost or a temporary preview URL in deployed environments." Confirm the deployed value is the real origin. **UNVERIFIABLE** from the checkout.

**H3 — No CI.** `.github/workflows/` does not exist. There is no root `test` or `ci` script (177 scripts, none canonical). Nothing automatically runs typecheck, the 60+ test scripts, or `validate:migrations`.

**H4 — Two migration validators are not chained.** `npm run validate:migrations` does **not** invoke `validate:migration-manifests`. This session's M63 passed the former and broke the latter — a real escape that a single CI entry point would have caught. Fix:

```json
"validate:all": "npm run validate:migrations && npm run validate:migration-manifests"
```

**H5 — Generated DB types absent.** `package.json` defines `db:types:gen` → `src/types/database.generated.ts`, but only hand-maintained `src/types/database.ts` is checked in. Schema drift cannot be caught at compile time. Requires live project access — **UNVERIFIABLE** here.

### MEDIUM

**M1 — Owner dashboard reads mock payment data.** `OWNER_PAYMENT_DATA_MODE = 'mock'` (`src/lib/ownerRevenueSummary.ts:21`). Server-side Razorpay records are not the dashboard's authoritative source. Corroborates the existing audit's P0.

**M2 — Weak local auth defaults.** `enable_confirmations = false`, `password_min_length = 6`. Local-only settings; production equivalents must be verified separately.

**M3 — Dormant storage buckets.** `avatars`, `business-media` provisioned but unused. Leave or remove deliberately; document either way.

**M4 — No Edge Function tier** for provider secrets / non-SQL work (§2.3). Relevant to Razorpay webhook handling.

**M5 — Realtime unconfigured.** No action (§0 row 6).

---

## 4. What changed this session

| File | Change |
|---|---|
| `supabase/config.toml` | Removed duplicate `[analytics]` table (C1) — file was unparseable by the Supabase CLI |
| `supabase/migrations/20260829000101_m63_…sql` | **New.** Fixes C2 + C3; renumbered from M59 to resolve the `main` collision |
| `supabase/manifests/existing-project-reconciliation.json` | Classified M63 (an unclassified migration fails `validate:migration-manifests`) |
| `scripts/validate-migration-manifests.mjs` | Track assertions updated M58→M63; merge note added |
| `scripts/test-m63-owner-provisioning-invitation-guard.mjs` | **New.** 10 checks: guard detection, provisioning succeeds, guard restored + still armed, client insert still blocked, idempotent retry, M54 verifier green |
| `scripts/test-workspace-initialization.mjs` | 9→17 checks: M59→M63 applied, 4 bypass-closure tests, 3 raw-error-leak tests |
| `src/lib/workspace.ts` | 3 raw-error leaks closed (lines 108/141/232 passed `memErr.message`/`wsErr.message` to a component that renders `<p>{error}</p>`) |
| `src/lib/workspaceDiagnostics.ts` | Guard P0001 no longer misreported as an invitation problem |
| `src/lib/ownerProvisioning.ts` | Same, for the owner path; `sanitizeProvisionError` exported for test coverage |
| `scripts/audit-schema-gaps.mjs` | **New.** Reproducible schema/RLS/bucket/publication introspection used for §1 |
| `package.json` | `test:m63-owner-provisioning` |

**Regression self-report:** the original M59 was added last session without being classified in the migration manifest, which broke `validate:migration-manifests`. It was missed because that validator is not chained into `validate:migrations` (H4). Found and fixed this session.

## 5. Verification

```
npm run validate:migrations           27/27 ×2 applied, 21/21 functional
npm run validate:migration-manifests  6/6
npm run test:m63-owner-provisioning   10/10
npm run test:workspace-init           17/17
M54 compatibility suite               12/12
npm run lint (tsc --noEmit)           0 errors
```

**Not verified, and not verifiable from this checkout:** live Supabase policy/grant state, whether M58–M63 are applied to `qwaehqsmodekbgvnaavz`, live verifier output, Vercel env vars, DNS/TLS, Razorpay keys and webhook registration. Each is marked **UNVERIFIABLE** above.
