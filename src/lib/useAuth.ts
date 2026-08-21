import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { PlatformRole } from '../types/database';

/**
 * Thin wrapper over the existing Supabase Auth (email/password, which the
 * live project has enabled). No second auth system, no manual token or
 * password handling, no service_role.
 *
 * PHASE 3A — canonical profile resolution:
 *   auth.users is the authentication authority and profiles.id is its 1:1
 *   application identity. After a session resolves, this hook reads the
 *   caller's OWN canonical profile row (RLS restricts the read to the
 *   authenticated user) and exposes it as `profile`. A session without an
 *   active profile never authorizes anything here: `profile` stays null and
 *   the data layers fail closed. The profile is never created, upserted or
 *   role-edited by this code — the database trigger owns that.
 */

export interface AuthState {
  user: User | null;
  session: Session | null;
  /** Canonical profile row for the signed-in user (or null). */
  profile: SessionProfile | null;
  loading: boolean;
}

/**
 * The client-safe projection of the canonical `public.profiles` row.
 * Field names mirror the Main Website's `NexoraProfile` (camelCase) so both
 * repositories agree on the same profile surface. Only columns that exist in
 * the shared schema are read (id, full_name, platform_role, is_active,
 * avatar_url, phone, email).
 */
export interface SessionProfile {
  id: string;
  fullName: string;
  role: PlatformRole;
  isActive: boolean;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
}

/** Columns the client is allowed to read (row restricted to the owner by RLS). */
const PROFILE_COLUMNS = 'id,full_name,platform_role,is_active,avatar_url,phone,email';

interface ProfileRow {
  id: string;
  full_name: string | null;
  platform_role: string | null;
  is_active: boolean | null;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
}

const PLATFORM_ROLES: readonly string[] = [
  'customer',
  'business_user',
  'growth_partner',
  'delivery_partner',
  'admin',
];

function mapProfile(row: ProfileRow | null | undefined): SessionProfile | null {
  if (!row || !row.platform_role || !PLATFORM_ROLES.includes(row.platform_role)) return null;
  return {
    id: row.id,
    fullName: row.full_name?.trim() || 'User',
    role: row.platform_role as PlatformRole,
    isActive: row.is_active === true,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    email: row.email,
  };
}

/**
 * Fetch the caller's own canonical profile. The signup trigger may not have
 * committed yet immediately after signup, so this retries briefly — it NEVER
 * creates or upserts a profile (the trigger is the only writer of
 * platform_role). RLS restricts the read to the authenticated user.
 */
async function resolveOwnProfile(userId: string): Promise<SessionProfile | null> {
  if (!supabase) return null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) {
      return mapProfile(data as ProfileRow);
    }
    lastError = error;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  if (lastError) {
    // Surface RLS/network problems instead of pretending the user has no
    // profile; keep the raw session so the UI can still offer retry/sign-out.
    console.error('Failed to resolve the canonical profile:', lastError);
  }
  return null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: isSupabaseConfigured,
  });

  useEffect(() => {
    if (!supabase) {
      setState({ user: null, session: null, profile: null, loading: false });
      return;
    }

    let active = true;

    // Safety fallback: ensure loading never hangs if getSession stalls
    const timeoutId = setTimeout(() => {
      if (active) {
        setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
      }
    }, 4000);

    const applySession = async (session: Session | null) => {
      const user = session?.user ?? null;
      if (!user) {
        setState({ user: null, session: null, profile: null, loading: false });
        return;
      }
      const profile = await resolveOwnProfile(user.id);
      if (!active) return;
      setState({ user, session, profile, loading: false });
    };

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        clearTimeout(timeoutId);
        if (error) {
          console.error('Supabase getSession error:', error);
          setState({ user: null, session: null, profile: null, loading: false });
          return;
        }
        void applySession(data.session ?? null);
      })
      .catch((err) => {
        if (!active) return;
        clearTimeout(timeoutId);
        console.error('Supabase getSession exception:', err);
        setState({ user: null, session: null, profile: null, loading: false });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void applySession(session ?? null);
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

export interface SignUpProfileFields {
  /** Stored into profiles.full_name via the canonical signup trigger. */
  fullName?: string;
  /** Stored into profiles.phone via the canonical signup trigger. */
  phone?: string;
}

/**
 * Email/password sign-up using the existing Supabase Auth.
 * `fullName`/`phone` travel as signup metadata; the database trigger writes
 * them into the existing profile columns (full_name, phone) — the client
 * never writes profiles directly and no password/auth secret is stored there.
 * `needsConfirmation` is true when the project requires email confirmation
 * before a session is issued.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  profileFields: SignUpProfileFields = {},
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  if (!supabase) {
    return {
      error: 'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      needsConfirmation: false,
    };
  }
  try {
    const emailRedirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}`
      : undefined;
    const metadata: Record<string, string> = {};
    const fullName = profileFields.fullName?.trim();
    const phone = profileFields.phone?.trim();
    if (fullName) metadata.full_name = fullName;
    if (phone) metadata.phone = phone;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: metadata,
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

export async function signInWithGoogle(next = '/dashboard'): Promise<{ error: string | null }> {
  if (!supabase || typeof window === 'undefined') {
    return { error: 'Authentication is not configured.' };
  }
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
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
  const redirectTo = `${window.location.origin}/reset-password`;
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
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Sign-out exception:', err);
  }
}
