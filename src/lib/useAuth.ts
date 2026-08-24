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
 */

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: isSupabaseConfigured,
  });

  useEffect(() => {
    if (!supabase) {
      setState({ user: null, session: null, loading: false });
      return;
    }

    let active = true;

    // Safety fallback: ensure loading never hangs if getSession stalls
    const timeoutId = setTimeout(() => {
      if (active) {
        setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
      }
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        clearTimeout(timeoutId);
        if (error) {
          console.error('Supabase getSession error:', error);
          setState({ user: null, session: null, loading: false });
          return;
        }
        setState({
          user: data.session?.user ?? null,
          session: data.session ?? null,
          loading: false,
        });
      })
      .catch((err) => {
        if (!active) return;
        clearTimeout(timeoutId);
        console.error('Supabase getSession exception:', err);
        setState({ user: null, session: null, loading: false });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({ user: session?.user ?? null, session: session ?? null, loading: false });
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
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
