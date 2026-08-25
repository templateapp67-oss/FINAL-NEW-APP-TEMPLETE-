/**
 * Authoritative browser auth identity.
 *
 * `getSession()` tells us whether the persisted client session is present;
 * `getUser()` validates the access token with Supabase Auth. Workspace code
 * must use both and must never fall back to local storage or a cached id.
 */
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';
import { diagnosticError, WorkspaceInitializationError } from './workspaceDiagnostics';

export interface AuthoritativeAuthIdentity {
  user: User;
  session: Session;
}

/**
 * Resolve a validated Supabase identity. `sessionHint` is used by the auth
 * listener after it receives a state-change event, avoiding a second session
 * read while still validating the token with `auth.getUser()`.
 */
export async function getAuthoritativeAuthIdentity(
  operation: string,
  sessionHint?: Session | null,
): Promise<AuthoritativeAuthIdentity | null> {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();

  let session = sessionHint;
  if (sessionHint === undefined) {
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw diagnosticError({
        operation,
        stage: 'auth-session',
        error,
        fallbackMessage: 'Supabase could not restore the authentication session.',
      }, 'Unable to verify your authentication session. Please try again.');
    }
    session = data.session ?? null;
  }

  if (!session) return null;
  if (!session.access_token || !session.user?.id) {
    throw diagnosticError({
      operation,
      stage: 'auth-session',
      error: {
        code: 'AUTH_SESSION_INVALID',
        message: 'Supabase returned a session without a valid access token or user id.',
      },
      authenticatedUserExists: Boolean(session.user?.id),
      userId: session.user?.id ?? null,
    }, 'Unable to verify your authentication session. Please log in again.');
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user?.id) {
    throw diagnosticError({
      operation,
      stage: 'auth-session',
      error: userError || {
        code: 'AUTH_USER_MISSING',
        message: 'Supabase Auth returned no user for the active session.',
      },
      authenticatedUserExists: Boolean(userData.user?.id),
      userId: session.user.id,
      fallbackMessage: 'Supabase could not validate the authenticated user.',
    }, 'Unable to verify your authentication session. Please log in again.');
  }

  if (userData.user.id !== session.user.id) {
    throw diagnosticError({
      operation,
      stage: 'auth-session',
      error: {
        code: 'AUTH_SESSION_USER_MISMATCH',
        message: 'Supabase session user and validated auth user do not match.',
      },
      authenticatedUserExists: true,
      userId: userData.user.id,
    }, 'Unable to verify your authentication session. Please log in again.');
  }

  return { user: userData.user, session };
}

/** Type guard for callers that need to preserve the original diagnostic. */
export function isWorkspaceInitializationError(
  error: unknown,
): error is WorkspaceInitializationError {
  return error instanceof WorkspaceInitializationError;
}
