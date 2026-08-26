const CANONICAL_APP_ORIGIN = 'https://final-new-app-templete.vercel.app';

function getEnv(): Record<string, string | undefined> {
  return typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined' && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};
}

export type AuthAccountIntent = 'owner' | 'customer';

export function normalizeAuthIntent(value: unknown): AuthAccountIntent {
  return value === 'customer' ? 'customer' : 'owner';
}

/**
 * Auth continuations are local paths only. Reject protocol-relative URLs,
 * backslashes/control characters and auth endpoints that could loop back into
 * a consumed callback. This value is navigation context, never authorization.
 */
export function safeAuthContinuation(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') return fallback;
  const path = value.trim();
  if (
    !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(path)
  ) return fallback;
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (pathname === '/auth/callback' || pathname === '/reset-password') return fallback;
  return path;
}

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
  const configured = validHttpOrigin(getEnv().VITE_AUTH_REDIRECT_ORIGIN);
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

export function signupConfirmationRedirect(
  next = '/builder',
  intent: AuthAccountIntent = 'owner',
): string {
  const fallback = intent === 'customer' ? '/' : '/builder';
  return authUrl('/auth/callback', {
    flow: 'signup',
    intent,
    next: safeAuthContinuation(next, fallback),
  });
}

export function oauthRedirect(
  next = '/builder',
  intent: AuthAccountIntent = 'owner',
): string {
  const fallback = intent === 'customer' ? '/' : '/builder';
  return authUrl('/auth/callback', {
    flow: 'oauth',
    intent,
    next: safeAuthContinuation(next, fallback),
  });
}

export function passwordResetRedirect(): string {
  return authUrl('/reset-password', { flow: 'recovery' });
}

/**
 * Stable path-form continuation for a public salon. This also preserves the
 * salon when Auth starts on a custom/subdomain host but the allow-listed
 * callback runs on the canonical app origin.
 */
export function publicSalonAuthContinuation(slug?: string): string {
  const normalizedSlug = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) return `/${normalizedSlug}`;
  if (typeof window !== 'undefined') {
    return safeAuthContinuation(window.location.pathname, '/');
  }
  return '/';
}
