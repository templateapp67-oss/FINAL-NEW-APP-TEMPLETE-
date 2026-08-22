const CANONICAL_APP_ORIGIN = 'https://final-new-app-templete.vercel.app';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined' && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};

function validHttpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isEphemeralOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.e2b.app') ||
      (hostname.endsWith('.vercel.app') && hostname !== new URL(CANONICAL_APP_ORIGIN).hostname)
    );
  } catch {
    return true;
  }
}

/**
 * Email links must never target localhost or a short-lived preview host.
 * Supabase opens them in the user's browser, where the sandbox's localhost is
 * unreachable. Use an explicit deployment override when present; otherwise
 * preview/dev builds fall back to the canonical public deployment.
 */
export function getAuthRedirectOrigin(runtimeOrigin?: string): string {
  const configured = validHttpOrigin(env.VITE_AUTH_REDIRECT_ORIGIN);
  if (configured) return configured;

  const current = validHttpOrigin(
    runtimeOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined),
  );
  if (current && !isEphemeralOrigin(current)) return current;

  return CANONICAL_APP_ORIGIN;
}

function authUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, `${getAuthRedirectOrigin()}/`);
  Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function signupConfirmationRedirect(next = '/dashboard'): string {
  return authUrl('/auth/callback', { flow: 'signup', next });
}

export function oauthRedirect(next = '/dashboard'): string {
  return authUrl('/auth/callback', { flow: 'oauth', next });
}

export function passwordResetRedirect(): string {
  return authUrl('/reset-password', { flow: 'recovery' });
}
