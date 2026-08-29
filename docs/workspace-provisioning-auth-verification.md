# Workspace Provisioning & Auth Navigation — Verification Report

Date: 2026-08-29

Scope: verify the end-to-end owner onboarding path (auth → provisioning →
navigation), audit error recovery, and confirm build/test stability.

**Two real defects were found and fixed.** Both were in the auth redirect
layer, not in provisioning.

---

## 1. Auth & provisioning integration

### 1a. No intermediate client-side profile mutations — VERIFIED

| Check | Command | Result |
| --- | --- | --- |
| Client reads/writes on the `profiles` table | `grep -rn "from('profiles')" src/` | **0 matches** |
| Any mutation call in the provisioning/session/auth libs | `grep -rnE "\.update\(\|\.upsert\(\|\.insert\("` on `ownerProvisioning.ts`, `ownerSession.ts`, `useAuth.ts` | **0 matches** |
| `platform_role` / `is_active` assigned by client code | `grep -rnE "platform_role\s*:\|is_active\s*:"` | only type declarations and RPC parameters (`p_is_active`) |

Every remaining occurrence of the word `profiles` in `src/` is UI placeholder
copy, i18n strings, a local variable holding *social* profiles, or the string
`'profiles'` in `templateArchitecture.ts`'s core-table list. None is a query.

**Provisioning sequence** (`src/lib/ownerSession.ts:135-160`) is:
`requireAuthenticatedUser()` → `resolveOrProvisionOwnerSalon()` →
`resolveOwnerSalonId()`. Nothing writes to `profiles` before or between.

`App.tsx:270` calls `resolveOrProvisionOwnerSalon()` as the first server
interaction after the auth snapshot resolves.

### 1b. RPC signature matches the deployed function — VERIFIED

The client's canonical call is
`{ p_salon_name, p_slug, p_template_id }`. The final migration definition
(`20260825000501_m54_workspace_bootstrap_compatibility.sql`) is
`provision_owner_salon(p_salon_name text, p_slug text, p_template_id text default 'barber_mens_grooming')`.
They match exactly, so the canonical path is taken.

`ownerProvisioning.ts:180-217` contains a 4-variant signature fallback that
only fires on `PGRST202` / `42883` / "schema cache". **None of those variants
can succeed against the current schema** (`p_slug` has no default), so the
cascade is inert defensive code, not a live alternate path.

### 1c. Navigation to `/dashboard` — PREMISE CORRECTION

The requirement states that a successful provision navigates the user to
`/dashboard`. **The application deliberately does not do this, and should
not.**

- There is **no** `window.location` redirect to `/dashboard` anywhere in
  `src/`.
- Owner auth defaults to **`/builder`**, not `/dashboard`
  (`useAuth.ts:467` — customers get `/`).
- `App.tsx:231-241` states the rule explicitly: *"Unpublished owners stay in
  the wizard even if they opened /dashboard."* Published owners arriving at
  `/dashboard` get `activeModule = 'owner-dashboard'`; unpublished owners get
  `'wizard'`.

This is correct behaviour: `provision_owner_salon` creates the workspace but
does **not** publish a site. Sending a freshly provisioned owner to the
dashboard would show them an empty shell with no published URL. Forcing the
redirect the requirement describes would be a regression, so it was not
implemented. The dashboard is reached after publish, or directly via
`/dashboard` once published, or through the TopBar (screen 26).

## 2. Edge cases & error recovery

### 2a. Sanitization — VERIFIED, and hardened

`scripts/test-workspace-error-sanitization.mjs` (new, 10/10) feeds 15
realistically shaped errors — browser `Failed to fetch`, supabase-js
`FetchError`, timeouts, `P0001`, `42501`, `PGRST202`, `428C9`, `28000`,
`P0003`, `PGRST116`, `23505`, plus empty/null/string errors — and asserts:

- no user-facing message contains a raw Postgres/PostgREST code;
- no message contains `new memberships must be server-activated invitations`,
  `permission denied for table`, `violates unique constraint`, `DETAIL:`,
  `HINT:` or `SQLSTATE`;
- every message is a non-empty sentence;
- **network/timeout failures are phrased as retryable** and never say
  "retrying will not help";
- **deterministic failures** (P0001 guard, RLS denial, missing RPC, generated
  column) *do* say retrying will not help and direct to support;
- a network drop is **not** misclassified as session loss (which would force a
  spurious logout redirect);
- tokens, passwords and service-role keys are redacted before logging.

### 2b. Session loss clears state and redirects — VERIFIED

`redirectToOwnerLoginForSessionLoss()` (`useAuth.ts:60-69`):

1. `clearOwnerBrowserWorkspaceCache()` — removes
   `OWNER_ONBOARDING_CACHE_KEY` and `OWNER_DASHBOARD_TAB_CACHE_KEY`;
2. returns early if already on `/auth/login` (no redirect loop);
3. returns early during an in-flight PKCE callback (`?code=` / `?error=`);
4. `window.location.replace('/auth/login?intent=owner&next=…')`.

Invoked from `App.tsx:345-348` when `isMissingAuthSessionDiagnostic(diagnostic)`
is true. Covered behaviourally by `scripts/test-cache-clear-auth-recovery.mjs`
(4/4) and by the new sanitization suite.

### 2c. DEFECT FOUND AND FIXED — placeholder redirect origin

`.env.example` ships `VITE_AUTH_REDIRECT_ORIGIN=https://your-app.example.com`.
`getAuthRedirectOrigin()` accepted it because `validHttpOrigin()` only checked
scheme/credentials — and `https://your-app.example.com` parses fine.

**Impact:** copying `.env.example` to `.env` (the documented first step) made
every signup-confirmation, OAuth and password-recovery link point at a domain
nobody owns. The account was created, the email arrived, and the link went
nowhere — the onboarding flow broke *after* auth succeeded.

Proven before fixing (`scripts/test-auth-redirect-origin.mjs`):

```
✗ the .env.example placeholder never becomes a redirect target
    placeholder origin leaked into auth email links
✗ any example.com / example.org / example.net host is rejected
    https://your-app.example.com was accepted as a redirect origin
```

**Fix:** `isPlaceholderOrigin()` now rejects the RFC 2606 reserved domains
(`example.com/.net/.org/.edu` and all subdomains) plus obvious placeholder
markers (`your-app`, `yourdomain`, `changeme`, `placeholder`, `replace-me`,
`todo`). Such values fall through to the runtime origin, then to the canonical
deployment origin. A genuine deployment origin is still honoured.

### 2d. DEFECT FOUND AND FIXED — customer signup continuation

`signupConfirmationRedirect(next = '/builder', intent)` had a hardcoded
default that won over the intent-derived fallback, so any caller omitting
`next` sent a **customer** to `/builder` (the owner wizard) instead of `/`.

The live caller (`useAuth.ts:396,466`) always passes `next` explicitly, so this
was latent rather than active. The signature is now `next?: string` so the
intent-derived fallback applies — a caller that only supplies the intent can
no longer misroute.

## 3. QA & suite verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **exit 0**, no output |
| `npm run test` | **exit 0** — 12 suites (see below) |
| `npm run build` | **exit 0**, **0 warnings**, entry chunk 284.46 kB (81.51 kB gz) |
| `npm run test:auth-flow` (new) | 8/8, 10/10, 4/4, 7/7 + auth-modal |
| `npm run verify:bundle-integrity` (new) | 32/32 Suspense sites, 31/31 dynamic imports |
| Dev server | `/` 200, `/api/health` 200, **35 modules transformed with 0 errors** |

`npm run test` now runs: lint, `validate:all`, workspace-init 20/20,
M63 11/11, profiles-RLS 15/15, **auth-flow** (redirect origin 8/8, error
sanitization 10/10, cache-clear recovery 4/4, intent routing 7/7, auth modal),
M54 12/12.

### Full-suite regression sweep

All **143** `scripts/test-*.mjs` were executed:

| | Result |
| --- | --- |
| Pass | 91 |
| Fail | 52 |

The 52 failures are the **same pre-existing set** recorded before this task
(same names, same count). The +2 passes versus the previous run are exactly the
two suites added here. Nothing regressed.

The pre-existing failures are unrelated: a `nexora_*` store-key allowlist, an
`.env.example` placeholder check, `nexora_onboarding_state` absent from
`App.tsx` at HEAD, a missing `AuthModalProvider` in the phase-10 test harness,
and the 16.8 contact-unlock flow.

### Broken links / dynamic imports / fallbacks

`scripts/verify-dynamic-imports.mjs` (new) resolves all 31 dynamic import
specifiers in `src/` against disk and checks every asset referenced by
`dist/index.html`: **0 broken, 0 missing**. No template-literal imports exist,
so nothing is silently unresolvable.

`scripts/verify-suspense-coverage.mjs`: **32 lazy render sites, 0 without a
wrapping `<Suspense>`**.

Both are wired to `npm run verify:bundle-integrity`.

## 4. Measurement caveat

`npm run lint` initially appeared to pass while printing `sh: 1: tsc: not
found` — the shell pipeline had captured the exit status of `tail`, not of
npm. `node_modules/` had been pruned. Everything above was re-measured after
`npm install` with exit codes captured directly, never through a pipe.

## 5. Not verified

- **No browser exists in this environment.** The redirect behaviour in 2c/2d
  is verified at the function level (`getAuthRedirectOrigin`,
  `signupConfirmationRedirect`) and by reading the call sites; no real email
  link was clicked and no real `/auth/login` navigation was observed.
- **No network egress to Supabase**, so provisioning was not exercised against
  a live project. The RPC signature was verified against the migration source,
  and the error paths against realistic error objects — not against a real
  server response.
- The M63/M64 migrations remain **branch-only**, not applied live.
