# M54 — live apply runbook (approval + token + network status)

**Target project:** `qwaehqsmodekbgvnaavz`
**Migration:** `supabase/migrations/20260825000501_m54_workspace_bootstrap_compatibility.sql`
**Status from this sandbox:** ❌ cannot apply — see "Blocker 3" below.

---

## What was asked

> "Supabase CLI/token refresh karke confirm karein: **M54 live database par apply karo.**"

I did not apply M54, and I did not ask for a token. Two reasons, one of them new:

1. I cannot give the approval — approval for a live production write has to come
   from you, not from me.
2. Even with your approval **and** a freshly refreshed token, this sandbox
   physically cannot reach Supabase. That is a new blocker discovered while
   testing the CLI path, and it changes what the next step should be.

---

## Blocker 1 — approval (yours to give)

Unchanged. A live `provision_owner_salon` replacement on the production project
needs an explicit human go-ahead.

## Blocker 2 — expired `SUPABASE_ACCESS_TOKEN` (real, but not the top blocker)

There is no `SUPABASE_ACCESS_TOKEN` in this environment at all:

```
$ node -e "console.log(Boolean((process.env.SUPABASE_ACCESS_TOKEN||'').trim()))"
false
```

So the `401 Unauthorized` you saw is consistent. But refreshing it will not
unblock this sandbox, because of:

## Blocker 3 — network egress to Supabase is blocked from this sandbox ⚠️

This is the finding that matters. Egress is allowlisted, and Supabase is not on
the list:

| Host | Result |
|---|---|
| `registry.npmjs.org` | ✅ 200 |
| `github.com` / `api.github.com` | ✅ 200 |
| `api.supabase.com` | ❌ TLS handshake killed (`SSL_ERROR_SYSCALL`) |
| `db.qwaehqsmodekbgvnaavz.supabase.co:5432` | ❌ `Network is unreachable` |
| `aws-0-*.pooler.supabase.com` | ❌ unreachable |
| `google.com`, `example.com` | ❌ blocked (allowlist confirmed) |

Proof that this is transport and **not** auth — I installed the real Supabase
CLI (v2.115.0) and ran `link` with a correctly-formatted dummy token:

```
$ npx supabase link --project-ref qwaehqsmodekbgvnaavz
failed to retrieve remote project status:
  HttpClientError: Transport error (GET https://api.supabase.com/v1/projects/qwaehqsmodekbgvnaavz)
```

A bad/expired token returns `401 Unauthorized`. This returns **Transport error**
— the request never leaves the sandbox. `supabase db push` and
`npm run db:apply:live:m54` (Management API) both go through
`api.supabase.com`, so **both paths are dead from here regardless of the token.**

**Do not paste a refreshed token into this session.** It would be exposed for
zero benefit — it still could not reach Supabase.

---

## Recommended path: SQL Editor (works today, no token, no egress)

I prepared a paste-ready file following the repo's existing
`docs/m3*-run-in-supabase.sql` convention:

### 📄 `docs/m54-run-in-supabase.sql`

Its body is byte-identical to the tracked migration (verified with `diff`) —
only an operator header was prepended, so there is no drift risk.

**Steps:**

1. **Pre-check** (read-only, new SQL Editor tab) — confirm the schema shape that
   causes `428C9`:
   ```sql
   select column_name, is_generated, generation_expression
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'organization_members'
     and column_name in ('status', 'is_active')
   order by column_name;
   ```
   Expected: `status` writable, `is_active` = `ALWAYS` (generated). That is the
   M28 live shape M54 repairs.

2. **Apply** — open a new tab, `Ctrl+A` copy the *entire*
   `docs/m54-run-in-supabase.sql`, paste, clear the selection, Run.
   The script is one `begin; … commit;` transaction.

3. **Post-check** — new tab:
   ```sql
   select check_name, ok, detail
   from public.verify_m54_workspace_bootstrap()
   order by check_name;
   ```
   All **6** rows must be `ok = true`.

### Safety profile

- Fully transactional — any failure rolls the whole thing back, nothing commits.
- Additive only: `create or replace function`. No `drop table`, no `drop column`,
  no `alter … disable row level security`.
- RLS stays enabled on all five workspace tables (asserted by the verifier).
- `provision_owner_salon` stays `authenticated`-only; `anon`/`public` are revoked.
- `auth.uid()` remains the sole authorization input; no service-role key or
  client-supplied identity is introduced.
- Idempotent: re-running reuses the existing org/salon rather than duplicating.

### If the preflight raises

`M54 preflight: canonical workspace tables/helpers are missing` means the
allocator/roots are absent. Apply **M38**, then **M44/M45/M51**, then re-run M54.

### Ordering note

M55 and M56 both preflight on M54's objects
(`private.nexora_ensure_owner_profile`, `provision_owner_salon`). **M54 must land
first**, otherwise those two will raise and roll back.

---

## Alternative: apply from your own machine

If you'd rather use the toolchain, run this **locally** (network unrestricted),
never in this chat:

```bash
export SUPABASE_ACCESS_TOKEN=<fresh sbp_... token>
npm run db:apply:live:m54          # applies + prints verify_m54_workspace_bootstrap()
```

or the official ledger-updating route:

```bash
supabase link --project-ref qwaehqsmodekbgvnaavz
supabase db push
```

The runner already refuses any project other than `qwaehqsmodekbgvnaavz` and
requires `--confirm-project=qwaehqsmodekbgvnaavz` for a write.

---

## Post-apply validation (browser, existing account)

Without clearing cookies/cache/storage: login → direct `/dashboard` → refresh →
logout/login → hydration retry. In the Network panel expect a **single**
successful `provision_owner_salon` response followed by owner-scoped
salon/website reads — no `428C9`, no "We couldn't load your salon workspace".

---

## Offline verification re-run in this checkout

Re-ran against the ordered migration chain on a local Postgres harness, so the
SQL you are about to paste is the exact SQL that passed:

| Check | Result |
|---|---|
| `npm run test:m54` — reproduces `428C9`, then verifies status/generated bootstrap, profile repair, full chain, retry idempotency, partial-bootstrap repair, RLS grant | **11/11 PASS** |
| `npm run validate:migrations` | **21/21 PASS** |
| `npm run validate:migration-manifests` | **6/6 PASS** |
| `diff` paste-file body vs tracked migration | **identical** |
