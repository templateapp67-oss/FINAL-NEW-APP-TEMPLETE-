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
  if (pathname === AUTH_LOGIN_PATH) return; // already there — never loop
  if (window.location.search.includes('code=') || window.location.search.includes('error=')) return; // PKCE callback in flight
  window.location.replace(`${AUTH_LOGIN_PATH}?intent=owner&next=${encodeURIComponent(pathname)}`);
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
  if (!session && !loading) redirectToLoginIfProtected();
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

/** Result of an email/password sign-in attempt. */
export interface SignInResult {
  error: string | null;
  /** True when the account exists but its email has not been confirmed yet. */
  needsConfirmation: boolean;
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidAuthEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAuthEmail(email));
}

function configuredError(): string {
  return supabaseConfigError || 'Authentication is not configured. Please set VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.';
}

function mapAuthError(message: string | undefined, fallback: string): string {
  const raw = message || '';
  if (/invalid login credentials|invalid_grant|invalid credentials/i.test(raw)) {
    return 'Incorrect email or password.';
  }
  if (/email not confirmed|email.*confirm/i.test(raw)) {
    return "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.";
  }
  if (/rate limit|too many requests|over_email_send_rate_limit|email rate limit/i.test(raw)) {
    return 'Too many requests. Please wait a minute, then try again.';
  }
  if (/failed to fetch|network|fetch/i.test(raw)) {
    return 'Unable to connect. Please try again.';
  }
  if (/user already registered|already registered|already exists/i.test(raw)) {
    return 'That email is already registered. Try logging in.';
  }
  if (/password/i.test(raw) && /weak|short|characters|length/i.test(raw)) {
    return 'Password must be at least 6 characters.';
  }
  return fallback;
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
      needsConfirmation: false,
    };
  }
  try {
    const normalizedEmail = normalizeAuthEmail(email);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      console.error('Sign-in failed:', error);
      const needsConfirmation = /email not confirmed|email.*confirm/i.test(error.message);
      return {
        error: mapAuthError(error.message, 'Incorrect email or password.'),
        needsConfirmation,
      };
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error('Signed in but getUser failed:', userError);
      return { error: 'Unable to verify your session. Please try again.', needsConfirmation: false };
    }
    return { error: null, needsConfirmation: false };
  } catch (err: any) {
    console.error('Sign-in exception:', err);
    return {
      error: mapAuthError(err?.message, 'Unable to connect. Please try again.'),
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
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  if (!supabase) {
    return {
      error: configuredError(),
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
      return {
        error: mapAuthError(error.message, 'Could not create the account. Please try again.'),
        needsConfirmation: false,
      };
    }
    // Supabase intentionally obfuscates duplicate signups when confirmations
    // are enabled. For an already-registered email it may return a user with
    // no identities and no session; do not create app records or pretend this
    // is a new signup.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: 'That email is already registered. Try logging in.', needsConfirmation: false };
    }
    return { error: null, needsConfirmation: !data.session };
  } catch (err: any) {
    console.error('Sign-up exception:', err);
    return {
      error: mapAuthError(err?.message, 'Unable to connect. Please try again.'),
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
): Promise<{ error: string | null }> {
  if (!supabase) {
    return {
      error: configuredError(),
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
      return {
        error: mapAuthError(error.message, 'Could not resend the confirmation email. Please try again.'),
      };
    }
    return { error: null };
  } catch (err: any) {
    console.error('Resend confirmation exception:', err);
    return {
      error: mapAuthError(err?.message, 'Unable to connect. Please try again.'),
    };
  }
}

export async function signInWithGoogle(
  next = '/builder',
  accountIntent: AuthAccountIntent = 'owner',
): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: 'Authentication is not configured.' };
  }
  const redirectTo = oauthRedirect(next, accountIntent);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: false },
  });
  return { error: error?.message || null };
}

export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: configuredError() };
  }
  const redirectTo = passwordResetRedirect();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeAuthEmail(email), { redirectTo });
  return { error: error ? mapAuthError(error.message, 'Could not send the reset email. Please try again.') : null };
}

export async function updatePassword(password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: configuredError() };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? mapAuthError(error.message, 'Could not update the password. Please try again.') : null };
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
