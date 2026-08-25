# M54 — workspace bootstrap compatibility audit and fix

## Finding

The failure occurs after Supabase Auth has accepted the account and before the
workspace can be hydrated:

```text
auth.users/session → owner_salon_ids() → provision_owner_salon()
  → organization_members → organizations → salons → salon_public_websites
```

The observed live membership vocabulary has a writable `status` column. M28
reconciles that shape by creating:

```sql
organization_members.is_active boolean
  generated always as ((status = 'active') is true) stored
```

M42, M44, M51 and M53 still contained this provisioning write:

```sql
insert into organization_members (..., is_active) values (..., true);
```

PostgreSQL rejects an explicit value for a generated column with SQLSTATE
`428C9` (`cannot insert a non-DEFAULT value into column "is_active"`). The
organization/membership/salon transaction therefore aborts even though Auth
succeeded. The UI previously converted the error into either:

- `We couldn't load your salon workspace`, or
- `Could not set up your salon. Please try again.`

That retry could not succeed until the database function was replaced.

The shell has no live Supabase credentials, browser session, network trace, or
production database log, so the exact production request could not be observed
from this environment. The `428C9` path is reproduced against the status/generated
schema in `scripts/test-m54-workspace-bootstrap-compatibility.mjs`; live
verification remains an operator step after deployment.

## Fix

`supabase/migrations/20260825000501_m54_workspace_bootstrap_compatibility.sql`
replaces the canonical `public.provision_owner_salon(text,text,text)` function
and adds private, non-HTTP helpers:

1. `private.nexora_ensure_owner_profile(uuid)` repairs an account that exists in
   `auth.users` but missed the signup profile trigger. It reads only non-secret
   Auth metadata and refuses an inactive profile.
2. `private.nexora_upsert_owner_membership(uuid,uuid)` inspects the actual live
   columns. It writes `status = 'active'` when `is_active` is generated, writes
   both values only when both are writable, and writes `is_active` only on the
   normal writable-boolean shape. It never explicitly writes a generated
   `is_active` value on the observed live shape.
3. `provision_owner_salon` keeps `auth.uid()` as its only authorization source,
   serializes one user's bootstrap with a transaction advisory lock, reuses an
   existing active owner organization/salon, repairs partial legacy tenants,
   writes the canonical slug to both salon and website rows, and remains
   authenticated-only and RLS-compatible.
4. A pre-existing staff/inactive membership is treated as authorization failure,
   not permission to create a second owner organization. Multiple owner
   organizations/salons remain an explicit ambiguous state.
5. `verify_m54_workspace_bootstrap()` checks the compatibility helper, profile
   repair, idempotency lock, RLS, and authenticated-only grant.

No RLS policy is disabled. No service-role key is sent to the browser. No
second authentication, ownership, organization or salon model was introduced.

## Browser/client hardening

- `src/lib/authIdentity.ts` requires both the persisted Supabase session and a
  current `auth.getUser()` result, and rejects a session/user id mismatch.
- `src/lib/useAuth.ts` validates the session before publishing authenticated
  state. The old arbitrary four-second loading timeout was removed; auth events
  are synchronized with a version counter and a microtask to avoid Supabase
  auth-lock reentrancy.
- `src/lib/ownerSalon.ts` resolves ownership only from the validated Auth user
  and `owner_salon_ids()`. Its fallback membership query is user-scoped and
  supports the pre-M28 `status` vocabulary.
- `src/lib/workspaceDiagnostics.ts` records structured operation, stage,
  Supabase code/message/details/hint, and authenticated-user existence. It
  redacts credential-looking values before console output. Deterministic
  schema/RLS/function failures no longer get presented as a winnable retry.
- The App hydration boundary clears only UI cache state, revalidates Auth on
  every retry, and does not use localStorage as tenant identity or workspace
  authority. Draft/business reads now log and preserve Supabase failures
  instead of silently turning query errors into an empty workspace.

## Deployment

Apply the compatibility migration to the configured Supabase project after the
existing migrations (or apply the complete chain):

```bash
SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live:m54
# or
SUPABASE_ACCESS_TOKEN=<sbp_...> node scripts/apply-live-migration.mjs --all --verify
```

The runner prints the result of `verify_m54_workspace_bootstrap()`. It does not
store or print the management token.

Recommended read-only live checks after applying it:

```sql
select check_name, ok, detail
from public.verify_m54_workspace_bootstrap()
order by check_name;

select column_name, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name = 'organization_members'
  and column_name in ('status', 'is_active')
order by column_name;
```

The live request should then be exercised with the existing account without
clearing cookies, cache or storage: login, direct `/dashboard`, refresh,
logout/login, and the hydration retry. Inspect the browser Network panel and
Supabase logs for the RPC response; the expected successful path is a single
`provision_owner_salon` result followed by owner-scoped website/salon reads.

## Verification in this checkout

| Check | Result |
|---|---:|
| `npm run test:m54` — reproduces 428C9, then verifies status/generated bootstrap, profile repair, full chain, retry idempotency, partial-bootstrap repair, RLS grant | **11/11 PASS** |
| `npm run test:m53` — slug `NOT NULL` regression and prior collision/tenant tests | **11/11 PASS** |
| `npm run test:owner-session-persistence` | **4/4 PASS** |
| `npm run test:multi-tenant` | **11/11 PASS** |
| `npm run lint` / `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS**; existing chunk/dynamic-import warnings only |
| `git diff --check` | **PASS** |

A real browser/account and the live database still need the deployment-side
verification above because those credentials and runtime traces are not present
in this checkout.
