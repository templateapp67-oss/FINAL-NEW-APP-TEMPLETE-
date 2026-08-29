# Runbook — Apply M63 & M64 to the live Supabase project

**Target project:** `qwaehqsmodekbgvnaavz`
**Migrations:** `20260829000101_m63_owner_provisioning_invitation_guard_fix.sql`, `20260829000201_m64_deprecate_m58_workspace_membership.sql`

> **This runbook exists because the migrations could not be applied from the
> sandbox.** That environment has no outbound network path to Supabase
> (`curl https://api.supabase.com` and the project REST endpoint both fail at
> the TLS handshake with `SSL_ERROR_SYSCALL` / HTTP 000) and holds no
> `SUPABASE_ACCESS_TOKEN` or service-role key. Everything that *can* be
> verified locally has been; what remains needs an operator with credentials.

## 0. Preflight (local, already green)

```
npm run test
```

Expected: `tsc --noEmit` clean, `27/27 ×2` + `21/21`, manifests `6/6`,
workspace-init `20/20`, M63 `11/11`, profiles-rls `15/15`, M54 `12/12`.

## 1. Introspect the live schema first (read-only)

```
export SUPABASE_ACCESS_TOKEN=<your token>
npm run db:introspect:live
```

Do not skip this. M63 discovers the live membership-invitation guard **by the
guard's own source text**, so confirm the guard actually exists and matches:

```sql
select t.tgname, p.proname, t.tgenabled
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.organization_members'::regclass
  and not t.tgisinternal
  and lower(pg_get_functiondef(p.oid)) like '%server-activated%';
```

If this returns **no rows**, M63's guard-suspension is a no-op on your project
and the original P0001 had a different source — stop and re-diagnose rather
than assuming the fix applies.

Also confirm the baseline you are changing:

```sql
select has_function_privilege('authenticated',
  'public.activate_workspace_membership(uuid,uuid,text)', 'EXECUTE') as before_m64;
-- expect: true  (M64 is what flips this to false)
```

## 2. Apply M63, then M64 — in that order

M64 revokes access to the function M63 rewrites, so apply M63 first.

```
node scripts/apply-live-migration.mjs --m63 --confirm-project=qwaehqsmodekbgvnaavz
node scripts/apply-live-migration.mjs --m64 --confirm-project=qwaehqsmodekbgvnaavz
```

Each command applies its SQL and then runs its verifier automatically. The
`--confirm-project` flag is mandatory; without it the runner refuses to write.

## 3. Verify

```
npm run db:verify:live:m63
npm run db:verify:live:m64
```

`verify_m64_m58_deprecation()` must return 4/4 green:

| check_name | expected |
|---|---|
| `activate_workspace_membership is not executable by authenticated` | true |
| `activate_workspace_membership remains available to service_role` | true |
| `workspaces is not client-writable` | true |
| `canonical provision_owner_salon is still executable by authenticated` | true |

`verify_m63_owner_provisioning()` must return 7/7 green:

| check_name | expected |
|---|---|
| invitation-guard discovery helper is installed | true |
| owner membership upsert suspends the live invitation guard | true |
| owner membership upsert restores the guard afterwards | true |
| M54 generated-column compatibility check is preserved | true |
| activation refuses callers with no authorization basis | true |
| activation does not treat current_user as a trust signal | true |
| canonical provision_owner_salon remains executable by authenticated | true |

## 4. Functional smoke test (browser, real owner account)

1. Sign in as an owner with **no** salon yet.
2. In DevTools → Network, confirm the provisioning request is
   `POST /rest/v1/rpc/provision_owner_salon` and returns **200** with an
   `out_salon_id`.
3. Confirm there is **no** `PATCH /rest/v1/profiles` request. The client has
   zero `from('profiles')` call sites, so any such request is a regression.
4. Confirm no response body or console line contains
   `server-activated invitations`, `new memberships`, or a bare `P0001`.
5. Re-load the page: the same `out_salon_id` must return and no duplicate
   `organization_members` row may appear.

```sql
-- idempotency + guard state after provisioning
select count(*) from organization_members where user_id = '<owner-uuid>';  -- expect 1
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.organization_members'::regclass
   and tgname like '%server_activated%';                                    -- expect 'O'
```

## 5. Rollback

Nothing is dropped by either migration, so rollback is a grant restore:

```sql
grant execute on function public.activate_workspace_membership(uuid,uuid,text) to authenticated;
grant select, insert, update, delete on table public.workspaces   to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.invitations to authenticated;
```

M63's function bodies are superseded by re-applying the M54/M58 versions if a
true revert is ever needed; the guard-suspension block is inert when no
matching trigger exists.

## Ordering note for merging to `main`

`main` carries its own M59–M62. This branch's migrations are timestamped
`20260829…`, so they apply **after** that track. The reconciliation manifest
currently lists `… m58, m63, m64`; when merging, insert M59–M62 in timestamp
order and update the track assertions in
`scripts/validate-migration-manifests.mjs` accordingly.
