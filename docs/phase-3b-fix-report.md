# PHASE 3B-FIX FINAL REPORT

## Migration Files

All files inspected in full (order, dependencies, tables/functions/policies
referenced, grants, RLS enablement, USING/WITH CHECK, idempotency, destructive
operations). Sequential fresh-apply of M28→M37 verified in PGlite (dependency
order proven). Zero destructive DDL (no DROP TABLE/SCHEMA, no reset; M34's FK
constraint swaps are guarded by existence checks). Every UPDATE policy carries
USING **and** WITH CHECK; INSERT policies use WITH CHECK (USING is not
applicable to INSERT by PostgreSQL semantics).

M28:
PASS — 8 tables, 8 functions, 25 policies, RLS on 12 tables, 27 drop-if-exists; preflight requires the canonical live tenant tables
M29:
PASS — payment_orders/payments/payment_webhook_events + 4 read-only policies, RLS, revokes client writes
M30:
PASS — storage.objects policies (public read / member insert/select/update/delete), RLS, helpers
M31:
PASS — booking_request_keys (server-only), guard trigger + authoritative booking RPC, RLS, service-role grants
M32:
PASS — canonical theme/service-category slugs + unique constraints, FKs, guards
M33:
PASS — repair RPC, deleted_at on salon_media/service_categories/product_categories, indexes
M34:
PASS — guarded FK hardening (RESTRICT replaces CASCADE; all constraint drops existence-guarded), platform-role CHECK validation
M35:
PASS — canonical theme slug backfill + unique
M36:
PASS — profiles RLS own-row/admin + guard triggers + signup trigger + RPCs + narrow grants + org_members guard + self-test
M37:
PASS — RLS on organizations/salons/staff/salon_hours + 8 policies (all UPDATE with USING+WITH CHECK) + SECURITY DEFINER helpers + catalog grants + self-test

## Live Supabase

Target project:
qwaehqsmodekbgvnaavz

Connection:
BLOCKED

Migration execution:
BLOCKED

## Live RLS

BLOCKED for every row below — a live connection is required to query the live
schema; no PASS is claimed on unverifiable live state.

profiles:
BLOCKED

organizations:
BLOCKED

organization_members:
BLOCKED

salons:
BLOCKED

locations:
BLOCKED

themes:
BLOCKED

service_categories:
BLOCKED

services:
BLOCKED

products:
BLOCKED

(Also applicable: bookings, payments, media/gallery/videos — BLOCKED; local
PGlite verification of the full M28→M37 RLS state passed 32/32 in Phase 3B.)

## Live Security

Cross-tenant SELECT:
BLOCKED

Cross-tenant INSERT:
BLOCKED

Cross-tenant UPDATE:
BLOCKED

Cross-tenant DELETE:
BLOCKED

Role escalation:
BLOCKED

Ownership reassignment:
BLOCKED

Public access:
BLOCKED

(Local PGlite coverage of all of the above passed 32/32 in Phase 3B; live
verification requires the connection.)

## Profile Schema

preferred_city:
NOT FOUND

preferred_area:
NOT FOUND

gender:
NOT FOUND

(Interpretation: not present in any committed migration in either repository
or any workspace artifact. Live-schema inspection is BLOCKED (no connection),
so live existence cannot be confirmed — reported as live-only in Phase 3A.
NOTHING was dropped, overwritten, or invented.)

Application type synchronization:
BLOCKED

(live type regeneration impossible without access; repo 1 canonical
`CanonicalProfileRow` was nevertheless updated with OPTIONAL
allow_recently_viewed/preferred_city/preferred_area/gender fields so typed
reads compile against both schemas — repo 1 lint/build PASS; repo 2 has no
generated types and reads those fields via inline optional casts; no manual
faking of generated types.)

## PGlite Limitation

Column-level ACL verification:
BLOCKED

Reason:
PGlite does not implement column-level ACL revoke introspection
(has_column_privilege ignores pg_attribute.attacl), so the M37 column REVOKEs
(products sku/track_inventory/inventory_quantity/deleted_at/created_at/
updated_at from anon) cannot be proven inside PGlite. Verification requires
real PostgreSQL/Supabase, which is unreachable (blocker below). This does NOT
block the rest of RLS verification: row-level RLS, policies, USING/WITH CHECK,
and grants were verified locally 32/32.

## Repository Validation

Repository 1:
Lint: PASS (tsc --noEmit)
Typecheck: PASS (lint is typecheck)
Build: PASS

Repository 2:
Lint: FAIL — 3 errors, all PRE-EXISTING (SplashOverlay.tsx:63:5
setState-in-effect; nexora-app.tsx:6162:72 + 6162:88 unescaped entities).
Present on commit 4582933, which predates Phase 3B; Phase 3B and this fix
changed zero repo 2 files, so none are INTRODUCED BY PHASE 3B.
Typecheck: PASS
Build: BLOCKED — `VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required`
(fail-closed credential guard; unchanged, PRE-EXISTING mechanism)

## Exact Changes

Repository 1 (commit `25e1c45`, pushed to `arena/01a0248b-final-new-app-templete`):
- `src/types/database.ts` — optional live-only profile preference columns
  (allow_recently_viewed, preferred_city, preferred_area, gender) added to
  `CanonicalProfileRow`.

Repository 2:
- No changes (no Phase 3B code impact; 3 lint errors retained as PRE-EXISTING).

Migrations:
- M28–M37 were NOT modified during this fix (inspection only).
- No new migration was created: the profile drift columns cannot be confirmed
  to exist live, so creating a reconciliation migration would be fabrication.

## Remaining Genuine Blockers

1. No Supabase credentials/connection exist anywhere in this workspace:
   - no SUPABASE_URL / SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN /
     SUPABASE_DB_URL environment variables;
   - no .env / .env.local / .env.production with real values (only
     placeholder `.env.example` files);
   - no Supabase CLI installed (`supabase` not on PATH);
   - no linked-project config (no `supabase/config.toml`, no `.temp` /
     `project-ref` artifacts, no `~/.supabase`);
   - no committed tokens/connection strings (the only connection-string
     references are `[PASSWORD]` placeholders in documentation and a
     runtime-argument script);
   - the only credential in the environment is a GitHub GH_TOKEN, which is
     GitHub-scoped and cannot authenticate to Supabase.
   Consequence: M28→M37 cannot be applied to `qwaehqsmodekbgvnaavz` and live
   RLS/policy/cross-tenant/role-escalation/public-access verification cannot
   run from this environment. The live database remains unmodified by this
   phase and is NOT claimed secured.
   Unblock path (no secret needs to be shared with me): run the migration
   files in order in the Supabase Dashboard SQL Editor for project
   qwaehqsmodekbgvnaavz (or `supabase link --project-ref qwaehqsmodekbgvnaavz`
   + `supabase db push`, or psql with the project DB password) — exact manual
   steps are documented in repo 1 `docs/phase-3b-multitenant-rls.md` and repo
   2 `supabase/APPLY_LIVE_DB_GUIDE.md`.

2. PGlite column-level ACL introspection limitation (see above) — resolvable
   only once the live environment is reachable.

Completion rule: M28→M37 are NOT applied to the live project (a genuine
external access blocker is proven); live RLS/policies/cross-tenant/role
escalation are NOT live-verified; profile drift reconciled at the type level
only with nothing dropped; no production data deleted (no live access at all);
no service-role secret exposed; no fake PASS reported. Phase 3C not started.
