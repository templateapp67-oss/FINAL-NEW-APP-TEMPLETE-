# Release & Database Rollback Runbook

**Created:** 2026-08-28 · closes the audit FAIL "no documented/automated
application-plus-database rollback strategy for a failed M41–M5x release".

## Principles

1. **Forward-only schema, rollback-capable app.** Database migrations in this
   repository are additive and reviewed individually (AGENTS.md). We do NOT
   auto-generate destructive down-migrations; instead every release has an
   explicit *app-level rollback* (redeploy previous build) plus the
   database-level procedures below.
2. **The migration ledger is the source of truth.** Supabase's own
   `supabase_migrations.schema_migrations` (CLI path) and the verifier
   functions (`verify_mXX_*`) establish what is actually applied. Never guess.
3. **A failed migration must never be re-pasted blind.** Re-applying a
   partially failed transactional migration is safe ONLY because every
   migration is wrapped in `begin; … commit;` — verify that assumption with
   the verifier before retrying.

## Before every release

- [ ] `npm run ci` green locally (typecheck, migration validation, generated
      types drift check, regression suites, production build).
- [ ] CI green on the release commit (GitHub Actions mirrors `npm run ci`).
- [ ] Backup: confirm the Supabase project has PITR / daily backups enabled
      (dashboard → Database → Backups). Record the latest restore point.
- [ ] Snapshot the migration ledger state:
      `npm run db:verify:live:m54` (and the newest applied `db:verify:live:mXX`).

## Applying database migrations (ordered)

```bash
# One reviewed migration at a time, each with its verifier:
SUPABASE_ACCESS_TOKEN=… npm run db:apply:live:m60   # refunds
SUPABASE_ACCESS_TOKEN=… npm run db:apply:live:m61   # reschedule
SUPABASE_ACCESS_TOKEN=… npm run db:apply:live:m62   # privacy lifecycle
```

After each apply, run the matching `npm run db:verify:live:mXX` and check the
Supabase database logs for errors before proceeding to the next migration.

## Rollback scenario A — bad application deploy (schema is fine)

1. Vercel → Deployments → the last known-good deployment → **Promote to
   Production** (or roll back in-place; Vercel keeps immutable builds).
2. Verify: `/api/health` returns JSON, `/api/health/deep` reports
   `status: "ok"`, one published slug renders, owner login → dashboard loads.
3. No database action required. Additions applied by the bad build are
   harmless by design (additive RPCs/tables are not read by the old build).

## Rollback scenario B — migration applied, then found defective

Migrations M28+ are additive (tables/RLS/RPCs), so the default rollback is:

1. **Quarantine the surface, do not drop it.** Revoke execute on the affected
   RPC from `service_role` (or disable the feature flag in the app) so the
   application stops calling it. Example:
   ```sql
   revoke execute on function public.create_payment_refund_for_actor(uuid,uuid,bigint,text,text) from service_role;
   ```
2. **Redeploy the last known-good app build** (scenario A).
3. Write a **forward-fix migration** (M+n) that repairs the defect — never
   edit an applied migration file; the committed SQL must stay byte-identical
   to what the ledger recorded (enforced for M54 by `test:m54` drift check).
4. If the defective migration **wrote bad data** (not merely added structure):
   1. Stop writes (quarantine as above).
   2. Export affected rows to a dated audit table or CSV before touching them.
   3. Repair with an explicit, reviewed `update`/`delete` inside one
      transaction, scoped by primary keys, with a count assertion.
   4. Re-run the relevant `verify_mXX_*` verifiers.

## Rollback scenario C — catastrophic data loss

1. Supabase dashboard → Database → Backups → restore the PITR point taken
   before the release window (documented above).
2. Immediately redeploy the matching application build (schema and app must
   come from the same release).
3. Re-verify: all `verify_mXX_*` for migrations the restore point predates,
   `/api/health/deep`, one published slug, one owner login.
4. File the incident: what failed, ledger diff (`db:introspect:live`), rows
   recovered, follow-ups.

## Restore drill (quarterly)

- Restore the newest backup into a staging project, run the full
  `verify_m43_*`/`verify_m44_*`/`verify_m53_*`/`verify_m54_*`/`verify_m60+`
  chain, load one published salon and one owner dashboard. Record the drill
  (date, duration, gaps) in this file's changelog.

## Changelog

- 2026-08-28 — Runbook created (audit §6 "Rollback: FAIL" closed). M60/M61/M62
  apply/verify commands added.
