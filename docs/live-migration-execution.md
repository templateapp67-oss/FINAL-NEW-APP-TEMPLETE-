# Live Supabase Migration Execution — the ONLY remaining manual action

Everything in this repository that can be done without live Supabase access is
done. The single remaining external dependency is applying the canonical
migration chain to the shared live Supabase project.

## Target

- Project ID: **qwaehqsmodekbgvnaavz**
- Shared by Repository 1 (templateapp67-oss/FINAL-NEW-APP-TEMPLETE-) and
  Repository 2 (janhvitiwari627-hue/nexora-main-website).

## Migration order (apply EXACTLY in this order)

All files live in Repository 1: `supabase/migrations/`

1. `20260821000101_m28_phase1a_unified_salon_foundation.sql`
2. `20260821000201_m29_phase1a_razorpay_foundation.sql`
3. `20260821000301_m30_phase1a_storage_foundation.sql`
4. `20260821000401_m31_phase1a_authoritative_booking_creation.sql`
5. `20260821000501_m32_phase2_canonical_foundation.sql`
6. `20260821000601_m33_phase2a_hardening.sql`
7. `20260821000701_m34_phase2b_final_hardening.sql`
8. `20260821000801_m35_phase2c_canonical_theme_slugs.sql`
9. `20260821000901_m36_phase3a_auth_profiles_roles.sql`
10. `20260821001001_m37_phase3b_multitenant_rls.sql`

The chain is additive and idempotent (verified locally: full M28→M37
double-apply passes; every policy is drop-if-exists + create; every function
is create-or-replace; M34's FK swaps are existence-guarded). No destructive
SQL, no table drops, no `db reset`.

## Safe methods (choose ONE)

### A. Supabase Dashboard SQL Editor

1. Open https://supabase.com/dashboard/project/qwaehqsmodekbgvnaavz/sql/new
2. Paste the full contents of each migration file above, in order, and run.
3. Run the next file only after the previous one completes without error.

### B. Supabase CLI

```bash
supabase link --project-ref qwaehqsmodekbgvnaavz
supabase db push
```

(`supabase db push` applies new migrations in filename order; the linked
project must be qwaehqsmodekbgvnaavz.)

### C. psql with legitimate database credentials

```bash
psql "postgresql://postgres.qwaehqsmodekbgvnaavz:<DB-PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" -f supabase/migrations/<FILE>
# Repeat for each file in order
```

## Post-apply verification

Run in the SQL Editor after M36 and M37:

```sql
-- Phase 3A self-test: profiles/auth/roles/RLS invariants
select * from public.verify_phase3a_auth();

-- Phase 3B self-test: RLS enabled on 20 tables + policy/grant invariants
select * from public.verify_phase3b_rls();
```

## Notes

- No credentials belong in this file or any repository file. Use your own
  dashboard login / CLI token / DB password.
- If the live project already has a subset of these migrations applied, the
  remaining files apply additively; the migration content is repeat-safe.
- Do not run destructive commands (`db reset`, DROP TABLE) against the live
  project.
