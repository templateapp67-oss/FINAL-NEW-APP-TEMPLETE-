# M57 — Vercel “Multiple salons are linked” recovery

## Reported production symptom

After login on the Vercel deployment, workspace hydration stopped at:

> We couldn’t load your salon workspace  
> Multiple salons are linked to your account. Please contact support.  
> Try again

This is not a Vercel build failure. Supabase Auth succeeded and the canonical
`provision_owner_salon()` RPC failed closed with SQLSTATE `P0003` because the
account resolved more than one active salon.

A separate Vercel routing defect was also reproduced on the deployed origin:
`GET /api/health` returned the SPA HTML (“Loading Nexora”) instead of JSON. The
plain Vercel Functions runtime supports the required catch-all form
`api/[...path].ts`; the repository used the Next.js-style optional catch-all
`api/[[...path]].ts`, so the function was not present in the filesystem routing
phase and the SPA fallback swallowed `/api/*`.

## Root cause of the extra salon

The historical, non-canonical helper
`20260821203500_setup_public_salon_v2.sql` created the fixed public showcase:

- salon UUID: `efdcb051-db98-40dc-b220-bfb873298de8`
- slug: `royal-hair-studio`

It attached that showcase to `organizations order by created_at asc limit 1`.
If the oldest organization belonged to a real owner, the account inherited the
global showcase in addition to its own salon. `owner_salon_ids()` therefore
returned two rows and every single-workspace RPC correctly refused to pick one
arbitrarily.

## Fix

### Database repair (M57)

`supabase/migrations/20260826000101_m57_detach_legacy_showcase_tenant.sql`:

1. Matches only the unmistakable fixed showcase UUID/slug and refuses if those
   identifiers point at different rows.
2. If its organization has a membership or another live salon, moves the
   showcase to a new unowned, dedicated organization.
3. Preserves the salon UUID. Website, services, bookings, media, location and
   other salon-keyed rows therefore stay attached without copying or deletion.
4. Is idempotent. An already isolated showcase or an environment without the
   showcase is a no-op.
5. Ships `verify_m57_showcase_tenant_detachment()` (service-role only).

No user-created salon is selected, deleted, disabled, unpublished or renamed.

### Runtime hardening

- Vercel catch-all renamed to `api/[...path].ts`; `api/index.ts` points to it.
  Existing filesystem-first SPA routing remains, so `/api/health` resolves to
  the function and real client routes still fall back to `index.html`.
- The service-role `/api/owner/provision-salon` writer was removed. It selected
  `existingMemberships[0]`, ignored a multi-row `maybeSingle()` error and could
  create another salon on every retry. Provisioning again has one authority:
  the transaction-safe, authenticated `provision_owner_salon()` RPC.
- The browser no longer calls that HTTP writer after a P0003. It preserves the
  diagnostic and waits for a reviewed data repair instead of making ambiguity
  worse.

## Live apply

Database execution is an operator action and was **not** performed from this
checkout. M54 must be present first.

### Supabase SQL Editor

Open the canonical project `qwaehqsmodekbgvnaavz`, paste all of
`docs/m57-run-in-supabase.sql`, and run it. Then run:

```sql
select check_name, ok, detail
from public.verify_m57_showcase_tenant_detachment()
order by check_name;
```

All four rows must have `ok = true`.

### Guarded runner

After read-only introspection and review:

```bash
SUPABASE_ACCESS_TOKEN=... npm run db:apply:live:m57 -- \
  --confirm-project=qwaehqsmodekbgvnaavz
```

## Post-deploy validation

1. Deploy/merge the runtime change.
2. `GET https://final-new-app-templete.vercel.app/api/health` must return JSON
   with `status: "ok"`, never `text/html`.
3. Without clearing browser storage: log out, log in, open `/dashboard`, and
   refresh.
4. The owner should resolve exactly one real salon; `/royal-hair-studio` must
   remain publicly available with the same content and publication state.
5. If P0003 remains, do not auto-pick or delete a salon. It is a different,
   genuine duplicate/multi-business case and needs read-only candidate review.

## Verification

```bash
npm run test:m57
npm run test:runtime-boundaries
npm run validate:migration-manifests
npm run lint
npm run build
```
