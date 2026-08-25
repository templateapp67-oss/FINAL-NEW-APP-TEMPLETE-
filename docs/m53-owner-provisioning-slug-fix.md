# M53 — "We couldn't load your salon workspace" / "Could not set up your salon"

> **Follow-up:** M54 (`docs/m54-workspace-bootstrap-compatibility.md`) supersedes
> the provisioning function from M53 for live databases whose
> `organization_members.is_active` is a generated column backed by `status`.
> Apply M54 after M53; M53 fixes the `salons.slug` NOT NULL defect, while M54
> fixes the separate SQLSTATE `428C9` membership-write defect.

## Symptom

Every **brand-new owner**, on first login, hit the workspace hydration boundary:

> **We couldn't load your salon workspace**
> Could not set up your salon. Please try again.
> [Try again]

"Try again" never worked — the failure was deterministic, not transient.

## Root cause

`public.provision_owner_salon(...)` is the only sanctioned tenant creator
(SECURITY DEFINER, identity from `auth.uid()` only). Every generation of it —
M42 → M44 → M51 — created the tenant row with:

```sql
insert into public.salons (organization_id, theme_id, name, is_active)
values (v_org_id, v_theme_id, v_name, true) returning id into v_salon_id;
```

But in the **live** schema, `public.salons` is created by
`20260821203500_setup_public_salon_v2.sql` as:

```sql
create table if not exists public.salons (
  ...
  slug TEXT UNIQUE NOT NULL,
  ...
);
```

`slug` is `NOT NULL` and was never supplied, so the very first statement of
tenant creation raised:

```
23502  null value in column "slug" of relation "salons" violates not-null constraint
```

The client's `sanitizeProvisionError()` (`src/lib/ownerProvisioning.ts`) had no
branch for `23502`, so it collapsed to the generic
`'Could not set up your salon. Please try again.'`;
`resolveOrProvisionOwnerSalon()` returned `{ error }`, and `src/App.tsx`
rendered the error card at the `owner-workspace-hydration-boundary`.

### Why the existing test suites stayed green

`scripts/test-slug-collision-handling.mjs` (and the other Phase harnesses)
bootstrap only **M38 → M51**. M38's `create table if not exists public.salons`
has **no slug column at all**, and M44 later adds it as **nullable**. So the
suites ran against a schema shape where the omission was harmless, while the
live database has the `NOT NULL UNIQUE` column. The bug lived exactly in that
gap.

## Fix

`supabase/migrations/20260825000401_m53_provision_salon_slug_fix.sql` (additive,
idempotent) redefines `provision_owner_salon` so it:

1. Allocates the canonical slug **before** inserting the salon and writes it
   into `public.salons.slug`, inside the same `unique_violation` savepoint retry
   that already protected the website insert — the salon row and its
   `salon_public_websites` row are created with **one identical**,
   collision-resolved slug.
2. Backfills a missing/blank `salons.slug` for tenants created by the broken
   builds, so they are repaired on next login (idempotent, never overwrites a
   populated slug, never steals another tenant's slug).
3. Changes **nothing** else: RPC shape, `auth.uid()`-only identity, grants
   (`authenticated` only), template validation, deterministic
   `base / base-1 / base-2` numbering, advisory-lock serialization,
   both-namespace scanning and `published_at` URL immutability are preserved.

`public.verify_m53_provision_salon_slug()` ships with it (service_role only),
matching the M38/M45/M46/M51 verifier convention.

### Client hardening

`sanitizeProvisionError()` now recognises deterministic backend faults
(`23502`, `42703`, `42883`, `428C9`, `42501`, generated-column,
not-null/undefined-column/undefined-function violations) and tells the owner
to contact support instead of inviting an unwinnable retry. No SQL, table names or database internals are leaked.

## Verification

New suite `npm run test:m53` (`scripts/test-m53-provision-salon-slug.mjs`)
applies the **full ordered migration chain**, so `public.salons.slug` has the
real live `NOT NULL UNIQUE` shape. It asserts:

- the live precondition is actually reproduced (`slug` is `NOT NULL`);
- a brand-new owner provisions successfully (**this is the assertion that fails
  with the exact `23502` error when M53 is removed**);
- `salons.slug` and `salon_public_websites.slug` hold the same canonical value;
- re-login is idempotent — same salon, same slug, no duplicate tenant;
- duplicate names still produce `glow-studio` / `-1` / `-2` across both tables;
- cross-tenant isolation is unchanged;
- a slug-less legacy tenant is repaired on next login;
- `anon` still cannot provision;
- `verify_m53_provision_salon_slug()` and `verify_m51_slug_collision_hardening()`
  are both green.

Result: **11/11 PASS** with the M53 slug fix. The later M54 compatibility
suite (`npm run test:m54`) separately reproduces the live `428C9` failure and
verifies the replacement provisioner.

Regression run: `lint`, `build`, `validate:migrations` (21/21),
`test:slug-collision` (12/12), `test:public-resolution-chain` (9/9),
`test:multi-tenant` (11/11), `test:public-website` (10/10),
`test:publish-readiness` (5/5), `test:business-name-change` (8/8),
`test:owner-publish-flow` (16/16), `test:owner-publish-real` (14/14),
`test:owner-session-persistence` (4/4), `test:template-switching` (16/16),
`test:public-security` (7/7), `test:m38` (31/31), `test:m39` (8/8),
`test:m40` (22), `test:phase3` (18/18), `test:phase-4` — all green.

## Deploying to the live project

The migration must be applied to the live Supabase project for the slug fix to
take effect for real owners. For the complete workspace fix, apply M54 after
M53:

```bash
SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live:m54
```

This applies M54 and then prints `verify_m54_workspace_bootstrap()`. The token
is a live secret supplied by the deployment environment and is never stored in
this repository. See `docs/m54-workspace-bootstrap-compatibility.md` for the
status/generated-column audit and live browser verification checklist.
