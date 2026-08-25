import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { clearOwnerBrowserWorkspaceCache } from './ownerWorkspacePersistence';
import {
  oauthRedirect,
  passwordResetRedirect,
  signupConfirmationRedirect,
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
  window.location.replace(`${AUTH_LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

/*
 * Module-scoped shared auth store: exactly ONE onAuthStateChange subscription
 * exists for the whole app no matter how many components call useAuth().
 * React hook instances are just subscribers to this store (with the timeout
 * safety net and invalid-session redirect owned by the store).
 */

type AuthStateListener = (next: AuthState) => void;

const authListeners = new Set<AuthStateListener>();
let authState: AuthState | null = null;
let authSyncStarted = false;
let authSubscription: { subscription: { unsubscribe: () => void } } | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

function emitAuthState(next: AuthState): void {
  authState = next;
  for (const listener of Array.from(authListeners)) listener(next);
}

function applySession(session: Session | null, loading: boolean): void {
  emitAuthState({ user: session?.user ?? null, session, loading });
  // An absent/invalid session on a protected route (expired refresh token,
  // revoked user, SIGNED_OUT) lands on /auth/login — guarded so the login
  // page never bounces back to itself.
  if (!session && !loading) redirectToLoginIfProtected();
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

  // Safety fallback: ensure loading never hangs if getSession stalls.
  timeoutId = setTimeout(() => {
    if (authState?.loading) applySession(authState.session, false);
  }, 4000);

  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (error) {
        console.error('Supabase getSession error:', error);
        applySession(null, false);
        return;
      }
      applySession(data.session ?? null, false);
    })
    .catch((err) => {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('Supabase getSession exception:', err);
      applySession(null, false);
    });

  // Exactly one listener for the whole app (see startAuthSync guard).
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION: hydration completed (mirrors getSession result).
    // TOKEN_REFRESHED: autoRefreshToken kept the session valid — keep it.
    // SIGNED_IN: PKCE callback / login form produced a session.
    // SIGNED_OUT: session cleared — invalid-session redirect (guarded).
    switch (event) {
      case 'INITIAL_SESSION':
      case 'SIGNED_IN':
      case 'TOKEN_REFRESHED':
      case 'SIGNED_OUT':
        applySession(session ?? null, false);
        break;
      default:
        // PASSWORD_RECOVERY and any other event still reflect the latest
        // session; never manufacture one (no session beats a stale session).
        applySession(session ?? null, false);
    }
  });
  authSubscription = data;
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
      error: 'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      needsConfirmation: false,
    };
  }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Sign-in failed:', error);
      if (/email not confirmed|email.*confirm/i.test(error.message)) {
        return {
          error: "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.",
          needsConfirmation: true,
        };
      }
      return { error: error.message || 'Incorrect email or password.', needsConfirmation: false };
    }
    return { error: null, needsConfirmation: false };
  } catch (err: any) {
    console.error('Sign-in exception:', err);
    return {
      error: err?.message || 'Could not connect to authentication service. Please try again.',
      needsConfirmation: false,
    };
  }
}

/**
 * Email/password sign-up using the existing Supabase Auth.
 * `needsConfirmation` is true when the project requires email confirmation
 * before a session is issued.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  extras?: { salonName?: string },
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  if (!supabase) {
    return {
      error: 'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      needsConfirmation: false,
    };
  }
  try {
    const emailRedirectTo = signupConfirmationRedirect();
    const salonName = extras?.salonName?.trim().slice(0, 120);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        // handle_new_user() reads signup_role. Owner pages request business_user.
        // Admin/staff cannot be self-assigned (normalize_platform_role).
        data: {
          signup_role: 'business_user',
          ...(salonName ? { full_name: salonName, salon_name: salonName } : {}),
        },
      },
    });
    if (error) {
      console.error('Sign-up failed:', error);
      const message = /already registered|already exists/i.test(error.message)
        ? 'That email is already registered. Try logging in.'
        : error.message || 'Could not create the account. Please try again.';
      return { error: message, needsConfirmation: false };
    }
    return { error: null, needsConfirmation: !data.session };
  } catch (err: any) {
    console.error('Sign-up exception:', err);
    return {
      error: err?.message || 'Could not connect to authentication service. Please try again.',
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
): Promise<{ error: string | null }> {
  if (!supabase) {
    return {
      error: 'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }
  try {
    const emailRedirectTo = signupConfirmationRedirect();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo },
    });
    if (error) {
      console.error('Resend confirmation failed:', error);
      return {
        error: /rate limit|too many requests/i.test(error.message)
          ? 'Too many requests. Please wait a minute, then try again.'
          : error.message || 'Could not resend the confirmation email. Please try again.',
      };
    }
    return { error: null };
  } catch (err: any) {
    console.error('Resend confirmation exception:', err);
    return {
      error: err?.message || 'Could not resend the confirmation email. Please try again.',
    };
  }
}

export async function signInWithGoogle(next = '/builder'): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: 'Authentication is not configured.' };
  }
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/builder';
  const redirectTo = oauthRedirect(safeNext);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: false },
  });
  return { error: error?.message || null };
}

export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: 'Authentication is not configured.' };
  }
  const redirectTo = passwordResetRedirect();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return { error: error?.message || null };
}

export async function updatePassword(password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Authentication is not configured.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error?.message || null };
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
