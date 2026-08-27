# Auth Flow Fixes — Login & Sign Up Hardening

Date: 2026-08-27 · Suite: `npm run test:auth-flow` (13 source/runtime checks +
8 jsdom UI behavior checks against the real `LoginModal`).

This change makes the authentication flow (Login & Sign Up) resilient
**permanently** across three axes: credential validation, Supabase session
handling, and the demo/preview fallback state.

## 1. Credential normalization & error feedback

- `normalizeAuthEmail()` is now documented as lowercase + trim and is applied
  before ANY validation or submission in `LoginModal`, `SignUpPage` and every
  `useAuth` helper (`src/lib/useAuth.ts`). Submissions to Supabase use the
  normalized value only.
- New exported classifier `classifyAuthError(message, fallbackKind)` in
  `src/lib/useAuth.ts` produces a stable `{ kind, message }` pair:
  `invalid-credentials`, `email-not-confirmed`, `already-registered`,
  `weak-password`, `rate-limited`, `network`, `server`, `unconfigured`.
  Unknown failures are reported as **server** problems — they are never
  silently blamed on the user's credentials.
- Error banners (`auth-error-banner`, `signup-error-banner`) now carry
  `role="alert"`, `aria-live="assertive"` and `data-error-kind`, so the UI and
  tests can distinguish "Incorrect email or password." from "Unable to
  connect. Please check your connection and try again."

## 2. Supabase session handling

- `supabase.auth.signInWithPassword`, `signUp`, `resend`, `signInWithOAuth`,
  `resetPasswordForEmail`, `updateUser` and `signOut` are ALL wrapped in
  try/catch in `src/lib/useAuth.ts`; every helper returns a result object and
  never throws into a click handler.
- After a successful `signInWithPassword`, the fresh session is validated via
  the same authoritative path as the rest of the app
  (`getAuthoritativeAuthIdentity('auth.sign_in', session)` →
  `auth.getUser()` with network retry/fallback in `src/lib/authIdentity.ts`),
  so a transient blip right after login no longer leaves a half-verified
  session.
- Exactly ONE `onAuthStateChange` listener exists (guarded by
  `authSyncStarted` in `useAuth.ts`); it validates every emitted session and
  publishes through the shared store to all `useAuth()` subscribers.
- Session restoration on reload runs through
  `getAuthoritativeAuthIdentity('auth.initial_session')` →
  `supabase.auth.getSession()` + `auth.getUser()`, versioned by
  `authValidationVersion` so stale results are discarded.

## 3. Demo/preview fallback (unconfigured only)

`src/lib/demoAuth.ts` owns the local fallback:

- `isDemoAuthBypassAvailable()` is true **only** when Supabase is entirely
  unconfigured (`isSupabaseConfigured === false`). A configured-but-
  unreachable backend NEVER bypasses auth — it surfaces retryable network
  errors instead.
- When unconfigured, `LoginModal` (owner + customer intents), `SignUpPage`
  and `AuthLoginPage` continue smoothly into the existing demo surfaces
  (`ProtectedApp` in `src/main.tsx` already renders the owner app without an
  auth gate in that exact case). No fake identity is ever fabricated:
  `useAuth().user` stays `null`, nothing is written to storage.
- Every demo helper is exception-safe; the forms never throw unhandled
  exceptions on submit in any state.

## 4. Form UI/UX contract

Both `LoginModal` and `SignUpPage`:

- Rename the request state to `isSubmitting` and keep it true for the WHOLE
  lifecycle (validation → Supabase call → session verification → owner
  provisioning → navigation). All inputs, tabs, mode-switch links and the
  submit button are `disabled={isSubmitting}`; form/button expose `aria-busy`.
- Editing email, password (or confirm / salon name) clears any existing error
  alert immediately (`clearFieldError` handlers).
- The Log In ⇄ Sign Up toggle (`switchMode`) drops every alert, notice and
  confirmation-panel state, is locked while submitting, and reopening the
  modal resets all transient state — no residual errors survive a toggle.
- The unconfigured warning banner keeps its exact required wording and adds a
  preview-mode hint.

## 5. Incidental crash fix

`LoginModal` previously read `import.meta.env.VITE_GOOGLE_OAUTH_ENABLED`
unguarded; in any context where `import.meta.env` is undefined (tsx/node
tooling, non-Vite rendering) the entire modal crashed on render. It now uses
the same safe-env accessor pattern as `src/lib/supabase.ts`.

## Verification

```bash
npm run lint           # tsc --noEmit — clean
npm run build          # vite + esbuild — clean
npm run test:auth-flow # 21 regression checks for THIS change
npm run test:auth      # pre-existing modal/login reliability suite (18/18)
```

Also passing after the change: `test-auth-intent-routing` (7/7),
`test-cache-clear-auth-recovery` (4/4), `test-owner-session-persistence`
(4/4), `test-multi-tenant-owners` (17/17).
