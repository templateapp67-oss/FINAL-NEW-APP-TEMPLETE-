import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';

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

/** Email/password sign-in using the existing Supabase Auth. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  if (!supabase) {
    return {
      error: 'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Sign-in failed:', error);
      return { error: error.message || 'Incorrect email or password.' };
    }
    return { error: null };
  } catch (err: any) {
    console.error('Sign-in exception:', err);
    return {
      error: err?.message || 'Could not connect to authentication service. Please try again.',
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
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  if (!supabase) {
    return {
      error: 'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      needsConfirmation: false,
    };
  }
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
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

export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Sign-out exception:', err);
  }
}
