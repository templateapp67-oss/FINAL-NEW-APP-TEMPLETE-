/**
 * Structured diagnostics for the authenticated workspace bootstrap.
 *
 * Workspace failures used to be reduced to a generic "try again" string before
 * the original Supabase error could be inspected. Keep the browser-facing copy
 * friendly, but retain the operation, stage and safe Supabase fields in the
 * console so an auth/RLS/schema problem is diagnosable from one login attempt.
 *
 * This module deliberately never logs credentials, cookies, access tokens,
 * refresh tokens or arbitrary Supabase error objects.
 */

export type WorkspaceStage =
  | 'auth-session'
  | 'profile'
  | 'ownership'
  | 'provision'
  | 'salon-read'
  | 'website-read'
  | 'workspace-hydration';

export interface WorkspaceDiagnostic {
  operation: string;
  stage: WorkspaceStage;
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
  authenticatedUserExists: boolean;
  userId: string | null;
}

/** A typed error that preserves diagnostics without exposing them in the UI. */
export class WorkspaceInitializationError extends Error {
  readonly diagnostic: WorkspaceDiagnostic;

  constructor(diagnostic: WorkspaceDiagnostic, userMessage?: string) {
    super(userMessage || diagnostic.message);
    this.name = 'WorkspaceInitializationError';
    this.diagnostic = diagnostic;
  }
}

function stringField(error: unknown, field: 'code' | 'message' | 'details' | 'hint'): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Remove credential-looking values before anything reaches console output. */
function redact(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(
      /((?:access|refresh)[_-]?token|password|service[_-]?role|(?:anon|publishable)[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

export function diagnosticFromError(input: {
  operation: string;
  stage: WorkspaceStage;
  error: unknown;
  userId?: string | null;
  authenticatedUserExists?: boolean;
  fallbackMessage?: string;
}): WorkspaceDiagnostic {
  const message = redact(stringField(input.error, 'message'))
    || (input.error instanceof Error ? redact(input.error.message) : null)
    || input.fallbackMessage
    || 'Workspace initialization failed.';
  return {
    operation: input.operation,
    stage: input.stage,
    code: stringField(input.error, 'code'),
    message: message || 'Workspace initialization failed.',
    details: redact(stringField(input.error, 'details')),
    hint: redact(stringField(input.error, 'hint')),
    authenticatedUserExists: input.authenticatedUserExists ?? Boolean(input.userId),
    userId: input.userId || null,
  };
}

/**
 * Log a safe, structured diagnostic. The original Supabase code/message is
 * preserved; tokens and password-like fields are removed first.
 */
export function logWorkspaceFailure(diagnostic: WorkspaceDiagnostic): void {
  console.error('Workspace initialization failed', {
    operation: diagnostic.operation,
    stage: diagnostic.stage,
    supabaseErrorCode: diagnostic.code,
    message: diagnostic.message,
    details: diagnostic.details,
    hint: diagnostic.hint,
    authenticatedUserExists: diagnostic.authenticatedUserExists,
    userId: diagnostic.userId,
  });
}

export function diagnosticError(
  input: Parameters<typeof diagnosticFromError>[0],
  userMessage?: string,
): WorkspaceInitializationError {
  const diagnostic = diagnosticFromError(input);
  logWorkspaceFailure(diagnostic);
  return new WorkspaceInitializationError(diagnostic, userMessage);
}

/** Stable friendly copy for known deterministic workspace failures. */
export function workspaceUserMessage(diagnostic: WorkspaceDiagnostic): string {
  const code = (diagnostic.code || '').toUpperCase();
  const raw = diagnostic.message.toLowerCase();

  if (code === '28000' || /not authenticated|please log in|session.*invalid|session.*expired/.test(raw)) {
    return 'Please log in again to open your salon workspace.';
  }
  if (code === 'P0003' || /multiple (salons|businesses)/.test(raw)) {
    return 'Multiple salons are linked to this account. Please contact support so we can select the canonical workspace.';
  }
  if (code === '42501' || code === 'PGRST301' || /permission denied|not have permission|forbidden/.test(raw)) {
    return 'Your account is authenticated, but it is not authorized to read this salon workspace. Please contact support.';
  }
  if (
    code === '428C9'
    || code === '23502'
    || /generated column|cannot insert.*column|not-null|null value in column/.test(raw)
  ) {
    return 'Your salon workspace needs a database compatibility update on our side. Please contact support — retrying will not help.';
  }
  if (code === 'PGRST202' || code === '42883' || /schema cache|function .* does not exist|could not find the function/.test(raw)) {
    return 'The salon workspace service is not available in this environment. Please contact support — retrying will not help.';
  }
  if (code === 'PGRST116' || /multiple or no rows/.test(raw)) {
    return 'Your salon workspace has an inconsistent database record. Please contact support.';
  }
  if (/network|fetch|timeout|temporarily unavailable/.test(raw)) {
    return 'We could not reach your salon workspace. Check your connection and try again.';
  }
  return 'We could not load your salon workspace. Please try again.';
}

/**
 * True when workspace initialization failed because the browser no longer has
 * a usable auth session (for example after site data/localStorage is cleared).
 * This deliberately excludes generic network failures, which remain retryable.
 */
export function isMissingAuthSessionDiagnostic(
  diagnostic: WorkspaceDiagnostic | null | undefined,
): boolean {
  if (!diagnostic || diagnostic.stage !== 'auth-session') return false;
  const code = (diagnostic.code || '').toUpperCase();
  const raw = diagnostic.message.toLowerCase();
  return (
    code === '28000'
    || code === 'AUTH_SESSION_INVALID'
    || code === 'AUTH_USER_MISSING'
    || code === 'AUTH_SESSION_USER_MISMATCH'
    || /auth session missing|no authenticated|not authenticated|please log in/.test(raw)
    || /session.*(?:missing|invalid|expired)/.test(raw)
    || /refresh token.*(?:missing|not found|invalid)/.test(raw)
    || /(?:invalid|expired) jwt/.test(raw)
  );
}
