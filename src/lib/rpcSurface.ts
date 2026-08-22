/**
 * Detects a Supabase PostgREST "RPC surface not deployed" failure.
 *
 * When a migration that creates an RPC was never applied to the live project,
 * PostgREST answers the call with HTTP 404 and code `PGRST202`
 * ("Could not find the function … in the schema cache"). That is a
 * deterministic deployment state — not a transient network error — so it is
 * the ONE condition under which callers may switch to their local persistence
 * fallback without risking silent divergence from a healthy database.
 *
 * Deliberately NOT matched: `Failed to fetch`/network errors, 401/403 auth
 * failures, 400 validation errors and 500 database faults. Those keep their
 * existing (masked) error behavior so real backend problems are never hidden.
 */
export function isMissingRpcSurfaceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  if (code === 'PGRST202') return true;
  const message = 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  // Canonical PostgREST wording when a function is absent from the schema cache.
  return /could not find the function/i.test(message) && /schema cache/i.test(message);
}
