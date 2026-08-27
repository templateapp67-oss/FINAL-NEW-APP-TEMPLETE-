import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, supabaseConfigError } from './supabaseClient';
import { getAuthoritativeAuthIdentity } from './authIdentity';
import { clearOwnerBrowserWorkspaceCache } from './ownerWorkspacePersistence';
import {
  oauthRedirect,
  passwordResetRedirect,
  signupConfirmationRedirect,
  type AuthAccountIntent,
} from './authRedirect';

/**
 * Thin wrapper over the existing Supabase Auth (email/password, which the
 * live project has enabled). No second auth system, no manual token or
 * password handling, no service_role.
 *
 * Exactly ONE `onAuthStateChange` listener is registered (the requirement —
 * never add a second one). It handles the four universal Nexora events:
 *   INITIAL_SESSION   — hydrate the persisted session (storageKey
 *                       nexora.auth.qwaehqsmodekbgvnaavz, persistSession true)
 *   SIGNED_IN         — a new session began (PKCE callback or login form)
 *   SIGNED_OUT        — session cleared; guarded redirect to /auth/login
 *   TOKEN_REFRESHED   — auto-refresh kept the session alive (autoRefreshToken)
 * Sessions stay persisted by the client itself (persistSession/autoRefreshToken
 * on the shared client); this hook only mirrors the latest session into React
 * state and owns the invalid-session redirect.
 */

/** The single login destination for invalid/expired sessions. */
export const AUTH_LOGIN_PATH = '/auth/login';

/**
 * True only for routes that require an authenticated owner workspace.
 * The public site, signup, password reset and the login page itself are
 * never redirected — this is the redirect-loop guard.
 */
function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname === '/builder' ||
    pathname.startsWith('/dashboard/') ||
    pathname.startsWith('/builder/')
  );
}

/** Navigate away from a protected route to /auth/login exactly once. */
function redirectToLoginIfProtected(): void {
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname;
  if (!isProtectedRoute(pathname)) return;
  redirectToOwnerLoginForSessionLoss(pathname);
}

/**
 * Leave an owner workspace after its authoritative session disappears.
 * Workspace hydration uses this when React still has a stale user for one
 * render after browser cookies/site storage have been cleared.
 */
export function redirectToOwnerLoginForSessionLoss(nextPath?: string): void {
  clearOwnerBrowserWorkspaceCache();
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname;
  if (pathname === AUTH_LOGIN_PATH) return; // already there — never loop
  if (window.location.search.includes('code=') || window.location.search.includes('error=')) return; // PKCE callback in flight
  const candidate = nextPath || pathname;
  const next = isProtectedRoute(candidate) ? candidate : '/dashboard';
  window.location.replace(`${AUTH_LOGIN_PATH}?intent=owner&next=${encodeURIComponent(next)}`);
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

/*
 * Module-scoped shared auth store: exactly ONE onAuthStateChange subscription
 * exists for the whole app no matter how many components call useAuth().
 * React hook instances are just subscribers to this store. Auth state is
 * published only after the current session has been validated with
 * `auth.getUser()`; there is no arbitrary timeout or stale-identity fallback.
 */

type AuthStateListener = (next: AuthState) => void;

const authListeners = new Set<AuthStateListener>();
let authState: AuthState | null = null;
let authSyncStarted = false;
let authSubscription: { subscription: { unsubscribe: () => void } } | null = null;
let authValidationVersion = 0;

function emitAuthState(next: AuthState): void {
  authState = next;
  for (const listener of Array.from(authListeners)) listener(next);
}

function applyIdentity(
  identity: { user: User; session: Session } | null,
  loading: boolean,
): void {
  const session = identity?.session ?? null;
  emitAuthState({
    user: identity?.user ?? null,
    session,
    loading,
  });
  // An absent/invalid session on a protected route (expired refresh token,
  // revoked user, SIGNED_OUT) lands on /auth/login — guarded so the login
  // page never bounces back to itself.
  if (!session && !loading) {
    clearOwnerBrowserWorkspaceCache();
    redirectToLoginIfProtected();
  }
}

/**
 * Validate a session after Supabase emits an auth event. The microtask is
 * intentional: Supabase warns against awaiting another auth call directly in
 * the auth callback because it can deadlock the auth lock. It is not a timing
 * workaround and has no arbitrary delay.
 */
function validateEmittedSession(session: Session | null, operation: string): void {
  const version = ++authValidationVersion;
  if (!session) {
    applyIdentity(null, false);
    return;
  }

  emitAuthState({ user: session.user, session, loading: true });
  void Promise.resolve().then(async () => {
    try {
      const identity = await getAuthoritativeAuthIdentity(operation, session);
      if (version !== authValidationVersion) return;
      applyIdentity(identity, false);
    } catch {
      if (version !== authValidationVersion) return;
      applyIdentity(null, false);
    }
  });
}

/** Lazily starts the ONE shared Supabase auth listener (idempotent). */
function startAuthSync(): void {
  if (authSyncStarted) return;
  authSyncStarted = true;

  if (!supabase) {
    emitAuthState({ user: null, session: null, loading: false });
    return;
  }

  authState = { user: null, session: null, loading: true };

  // Exactly one listener for the whole app (see startAuthSync guard).
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION: persisted session was found (or not found).
    // TOKEN_REFRESHED: autoRefreshToken supplied a new session.
    // SIGNED_IN: PKCE callback / login form produced a session.
    // SIGNED_OUT: session cleared — invalid-session redirect (guarded).
    // PASSWORD_RECOVERY and any future event use the same validation path.
    validateEmittedSession(session ?? null, `auth.${event.toLowerCase()}`);
  });
  authSubscription = data;

  // Subscribe first so an INITIAL_SESSION event cannot be missed. Then read
  // the current session and validate its user with Supabase Auth. Whichever
  // result is newest wins through authValidationVersion.
  void Promise.resolve().then(async () => {
    const version = ++authValidationVersion;
    try {
      const identity = await getAuthoritativeAuthIdentity('auth.initial_session');
      if (version !== authValidationVersion) return;
      applyIdentity(identity, false);
    } catch {
      if (version !== authValidationVersion) return;
      applyIdentity(null, false);
    }
  });
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(
    () => authState ?? { user: null, session: null, loading: isSupabaseConfigured },
  );

  useEffect(() => {
    // Subscribes to the shared store; the underlying Supabase listener is
    // started once, regardless of how many components use this hook.
    startAuthSync();
    if (authState) setState(authState);
    authListeners.add(setState);
    return () => {
      authListeners.delete(setState);
    };
  }, []);

  return state;
}

/**
 * Machine-readable classification of an auth failure. The UI uses this to
 * give distinct feedback for "wrong credentials" (user should retry with
 * other credentials) vs. "network" (transient, retry later) vs. "server"
 * (Supabase-side failure) — instead of one opaque message for everything.
 */
export type AuthErrorKind =
  | 'none'
  | 'unconfigured'
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'already-registered'
  | 'weak-password'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'other';

/** Result of an email/password sign-in attempt. */
export interface SignInResult {
  error: string | null;
  /** Classification of the failure; 'none' when the sign-in succeeded. */
  kind: AuthErrorKind;
  /** True when the account exists but its email has not been confirmed yet. */
  needsConfirmation: boolean;
}

/**
 * Normalize an email before ANY validation, submission or lookup:
 * lowercase + trim, so "  User@Example.COM " and "user@example.com" hit the
 * same Supabase identity and never fail validation on casing/whitespace.
 */
export function normalizeAuthEmail(email: string): string {
  return (email || '').toLowerCase().trim();
}

export function isValidAuthEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAuthEmail(email));
}

function configuredError(): string {
  return supabaseConfigError || 'Authentication is not configured. Please set VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.';
}

/**
 * Classify a raw Supabase/exception message into a stable kind + a
 * user-safe message. Exported for regression tests and for UI surfaces that
 * want to style/word feedback differently per failure class.
 *
 * `fallbackKind` decides how an unrecognized message is treated — sign-in
 * treats unknowns as invalid credentials ONLY when Supabase explicitly says
 * so; anything unrecognized is surfaced as a server-side problem, never
 * silently blamed on the user's credentials.
 */
export function classifyAuthError(
  message: string | undefined,
  fallbackKind: AuthErrorKind = 'server',
  fallbackMessage = 'Something went wrong. Please try again.',
): { kind: AuthErrorKind; message: string } {
  const raw = message || '';
  if (/invalid login credentials|invalid_grant|invalid credentials/i.test(raw)) {
    return { kind: 'invalid-credentials', message: 'Incorrect email or password.' };
  }
  if (/email not confirmed|email.*confirm/i.test(raw)) {
    return {
      kind: 'email-not-confirmed',
      message:
        "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.",
    };
  }
  if (/rate limit|too many requests|over_email_send_rate_limit|email rate limit/i.test(raw)) {
    return { kind: 'rate-limited', message: 'Too many requests. Please wait a minute, then try again.' };
  }
  if (/failed to fetch|network|fetch|econn|timed? ?out|unreachable|abort/i.test(raw)) {
    return { kind: 'network', message: 'Unable to connect. Please check your connection and try again.' };
  }
  if (/user already registered|already registered|already exists/i.test(raw)) {
    return { kind: 'already-registered', message: 'That email is already registered. Try logging in.' };
  }
  if (/password/i.test(raw) && /weak|short|characters|length/i.test(raw)) {
    return { kind: 'weak-password', message: 'Password must be at least 6 characters.' };
  }
  if (fallbackKind === 'network') {
    return { kind: 'network', message: 'Unable to connect. Please check your connection and try again.' };
  }
  return { kind: fallbackKind, message: fallbackMessage };
}

/** Backwards-compatible wrapper returning only the user-safe message. */
function mapAuthError(message: string | undefined, fallback: string): string {
  // Sign-in historically reported unknowns as credential errors; keep that
  // exact wording for the credential-class fallback only.
  const fallbackKind: AuthErrorKind = /incorrect email or password/i.test(fallback)
    ? 'invalid-credentials'
    : 'server';
  return classifyAuthError(message, fallbackKind, fallback).message;
}

/**
 * Email/password sign-in using the existing Supabase Auth.
 *
 * When the project requires email confirmation and the user has not clicked
 * the confirmation link yet, Supabase rejects the sign-in with an opaque
 * "Email not confirmed" message. We detect that case and surface it as
 * `needsConfirmation` so the UI can offer a resend/verify flow instead of a
 * dead-end error.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  if (!supabase) {
    return {
      error: configuredError(),
      kind: 'unconfigured',
      needsConfirmation: false,
    };
  }
  try {
    const normalizedEmail = normalizeAuthEmail(email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      console.error('Sign-in failed:', error);
      const needsConfirmation = /email not confirmed|email.*confirm/i.test(error.message);
      const classified = classifyAuthError(error.message, 'invalid-credentials', 'Incorrect email or password.');
      return {
        error: classified.message,
        kind: needsConfirmation ? 'email-not-confirmed' : classified.kind,
        needsConfirmation,
      };
    }
    // Supabase accepted the credentials. Validate the fresh session through
    // the SAME authoritative path the rest of the app uses (auth.getUser()
    // with network retry/fallback) so a transient blip right after login
    // never leaves the UI with an unverified or half-established session.
    try {
      const identity = await getAuthoritativeAuthIdentity('auth.sign_in', data.session ?? undefined);
      if (!identity) {
        return {
          error: 'Unable to verify your session. Please try again.',
          kind: 'server',
          needsConfirmation: false,
        };
      }
    } catch (verifyErr: any) {
      console.error('Signed in but session verification failed:', verifyErr);
      const classified = classifyAuthError(verifyErr?.message, 'server', 'Unable to verify your session. Please try again.');
      return {
        error: classified.message,
        kind: classified.kind,
        needsConfirmation: false,
      };
    }
    return { error: null, kind: 'none', needsConfirmation: false };
  } catch (err: any) {
    console.error('Sign-in exception:', err);
    const classified = classifyAuthError(err?.message, 'network');
    return {
      error: classified.message,
      kind: classified.kind,
      needsConfirmation: false,
    };
  }
}

/**
 * Email/password sign-up using the existing Supabase Auth.
 * `needsConfirmation` is true when the project requires email confirmation
 * before a session is issued.
 */
export interface SignUpOptions {
  salonName?: string;
  accountIntent?: AuthAccountIntent;
  returnTo?: string;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  extras?: SignUpOptions,
): Promise<{ error: string | null; kind: AuthErrorKind; needsConfirmation: boolean }> {
  if (!supabase) {
    return {
      error: configuredError(),
      kind: 'unconfigured',
      needsConfirmation: false,
    };
  }
  try {
    const normalizedEmail = normalizeAuthEmail(email);
    const accountIntent: AuthAccountIntent = extras?.accountIntent === 'customer' ? 'customer' : 'owner';
    const defaultReturn = accountIntent === 'customer' ? '/' : '/builder';
    const emailRedirectTo = signupConfirmationRedirect(
      extras?.returnTo || defaultReturn,
      accountIntent,
    );
    const salonName = accountIntent === 'owner'
      ? extras?.salonName?.trim().slice(0, 120)
      : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo,
        // handle_new_user() reads signup_role. Public customers remain
        // customers; only an explicit owner entry point requests business_user.
        // Admin/staff can never be self-assigned (normalize_platform_role).
        data: {
          signup_role: accountIntent === 'owner' ? 'business_user' : 'customer',
          ...(salonName ? { full_name: salonName, salon_name: salonName } : {}),
        },
      },
    });
    if (error) {
      console.error('Sign-up failed:', error);
      const classified = classifyAuthError(error.message, 'server', 'Could not create the account. Please try again.');
      return {
        error: classified.message,
        kind: classified.kind,
        needsConfirmation: false,
      };
    }
    // Supabase intentionally obfuscates duplicate signups when confirmations
    // are enabled. For an already-registered email it may return a user with
    // no identities and no session; do not create app records or pretend this
    // is a new signup.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        error: 'That email is already registered. Try logging in.',
        kind: 'already-registered',
        needsConfirmation: false,
      };
    }
    return { error: null, kind: 'none', needsConfirmation: !data.session };
  } catch (err: any) {
    console.error('Sign-up exception:', err);
    const classified = classifyAuthError(err?.message, 'network');
    return {
      error: classified.message,
      kind: classified.kind,
      needsConfirmation: false,
    };
  }
}

/**
 * Resend the sign-up confirmation email for an unconfirmed account.
 * Safe to call repeatedly — it never signs anyone in and only sends an email
 * to the address the user supplied.
 */
export async function resendConfirmationEmail(
  email: string,
  options?: { accountIntent?: AuthAccountIntent; returnTo?: string },
): Promise<{ error: string | null; kind: AuthErrorKind }> {
  if (!supabase) {
    return {
      error: configuredError(),
      kind: 'unconfigured',
    };
  }
  try {
    const accountIntent: AuthAccountIntent = options?.accountIntent === 'customer' ? 'customer' : 'owner';
    const emailRedirectTo = signupConfirmationRedirect(
      options?.returnTo || (accountIntent === 'customer' ? '/' : '/builder'),
      accountIntent,
    );
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizeAuthEmail(email),
      options: { emailRedirectTo },
    });
    if (error) {
      console.error('Resend confirmation failed:', error);
      const classified = classifyAuthError(error.message, 'server', 'Could not resend the confirmation email. Please try again.');
      return { error: classified.message, kind: classified.kind };
    }
    return { error: null, kind: 'none' };
  } catch (err: any) {
    console.error('Resend confirmation exception:', err);
    const classified = classifyAuthError(err?.message, 'network');
    return { error: classified.message, kind: classified.kind };
  }
}

export async function signInWithGoogle(
  next = '/builder',
  accountIntent: AuthAccountIntent = 'owner',
): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: configuredError() };
  }
  // Network/DOM failures of the OAuth kickoff must surface as a friendly
  // result value — never as an unhandled rejection from a click handler.
  try {
    const redirectTo = oauthRedirect(next, accountIntent);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: false },
    });
    return { error: error ? classifyAuthError(error.message, 'server', error.message).message : null };
  } catch (err: any) {
    console.error('Google sign-in exception:', err);
    return { error: classifyAuthError(err?.message, 'network').message };
  }
}

export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: configuredError() };
  }
  try {
    const redirectTo = passwordResetRedirect();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeAuthEmail(email), { redirectTo });
    if (error) {
      const classified = classifyAuthError(error.message, 'server', 'Could not send the reset email. Please try again.');
      return { error: classified.message };
    }
    return { error: null };
  } catch (err: any) {
    console.error('Password reset exception:', err);
    return { error: classifyAuthError(err?.message, 'network').message };
  }
}

export async function updatePassword(password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: configuredError() };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const classified = classifyAuthError(error.message, 'server', 'Could not update the password. Please try again.');
      return { error: classified.message };
    }
    return { error: null };
  } catch (err: any) {
    console.error('Update password exception:', err);
    return { error: classifyAuthError(err?.message, 'network').message };
  }
}

export async function signOut(): Promise<void> {
  clearOwnerBrowserWorkspaceCache();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Sign-out exception:', err);
  }
}
