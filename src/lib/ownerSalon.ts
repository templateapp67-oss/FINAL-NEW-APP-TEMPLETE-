/**
 * Resolves the salon owned by the CURRENTLY AUTHENTICATED user.
 *
 * Ownership uses the project's EXISTING organization model:
 *
 *   auth.users.id
 *     -> public.organization_members.user_id
 *        (role = 'owner', is_active = true)
 *     -> organization_members.organization_id
 *     -> public.salons.organization_id
 *     -> public.salons.id            (deleted_at is null)
 *
 * `job_salon_members` is a staff/employee relationship and is deliberately
 * NOT used for ownership.
 *
 * The canonical shared backend ships `owner_salon_ids()` (and
 * `private.can_manage_salon_settings(id)` for authorization). We call the
 * existing function rather than duplicating the ownership rule, and only
 * fall back to the equivalent join if the function is not exposed.
 *
 * The salon id is never hardcoded, never read from the client (URL,
 * localStorage, props) and never "the first row".
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getAuthoritativeAuthIdentity } from './authIdentity';
import {
  diagnosticFromError,
  logWorkspaceFailure,
  workspaceUserMessage,
  type WorkspaceDiagnostic,
} from './workspaceDiagnostics';

/** Existing ownership helper function in the database. */
export const OWNER_SALON_IDS_FN = 'owner_salon_ids';
/** Existing organization membership table. */
export const ORG_MEMBERS_TABLE = 'organization_members';
export const SALON_TABLE_NAME = 'salons';

export type OwnerSalonResolution =
  | { status: 'resolved'; salonId: string }
  | { status: 'not-configured' }
  | { status: 'not-authenticated' }
  | { status: 'no-membership' }
  | { status: 'ambiguous' }
  | { status: 'permission-denied'; diagnostic?: WorkspaceDiagnostic }
  | { status: 'error'; diagnostic?: WorkspaceDiagnostic };

/** Authenticated user id from the real, validated session, or null signed out. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const identity = await getAuthoritativeAuthIdentity('owner.authenticated_user');
    return identity?.user.id ?? null;
  } catch {
    // This compatibility helper has a nullable contract. Workspace resolution
    // uses getAuthoritativeAuthIdentity directly so it can preserve the error.
    return null;
  }
}

function isPermissionError(code: string | undefined): boolean {
  return code === '42501' || code === 'PGRST301';
}

/** Function missing / not exposed through PostgREST. */
function isMissingFunction(code: string | undefined): boolean {
  return code === '42883' || code === 'PGRST202';
}

function uniqueIds(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => (typeof v === 'string' ? v : null))
        .filter((v): v is string => Boolean(v)),
    ),
  );
}

/**
 * Ask the existing database helper for the salons this user owns.
 * Returns null when the function is unavailable so the caller can fall back.
 */
async function salonIdsFromHelper(): Promise<string[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(OWNER_SALON_IDS_FN);

  if (error) {
    if (isMissingFunction((error as { code?: string }).code)) return null;
    throw error;
  }
  if (data === null || data === undefined) return [];

  // The function may return uuid[] or a set of rows.
  if (Array.isArray(data)) {
    return uniqueIds(
      data.map((row) =>
        typeof row === 'string'
          ? row
          : (row as Record<string, unknown>)?.salon_id ??
            (row as Record<string, unknown>)?.id ??
            null,
      ),
    );
  }
  return uniqueIds([data]);
}

/**
 * Equivalent ownership query, used only if the helper function is not
 * exposed. Mirrors the project's ownership rule exactly; RLS still applies.
 */
function isMissingActivityColumn(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return code === '42703' || (message.includes('column') && message.includes('is_active'));
}

async function salonIdsFromMembership(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const withGeneratedActivity = await supabase
    .from(SALON_TABLE_NAME)
    .select(`id, organization_id, ${ORG_MEMBERS_TABLE}!inner(user_id, role, is_active)`)
    .eq(`${ORG_MEMBERS_TABLE}.user_id`, userId)
    .eq(`${ORG_MEMBERS_TABLE}.role`, 'owner')
    .eq(`${ORG_MEMBERS_TABLE}.is_active`, true)
    .is('deleted_at', null);

  if (!withGeneratedActivity.error) {
    return uniqueIds((withGeneratedActivity.data ?? []).map((row) => (row as { id?: unknown }).id));
  }
  if (!isMissingActivityColumn(withGeneratedActivity.error)) throw withGeneratedActivity.error;

  // Compatibility fallback for a pre-M28 live schema where `status` is the
  // activity authority and no generated is_active column exists. M28's live
  // shape normally takes the first branch above.
  const withStatus = await supabase
    .from(SALON_TABLE_NAME)
    .select(`id, organization_id, ${ORG_MEMBERS_TABLE}!inner(user_id, role, status)`)
    .eq(`${ORG_MEMBERS_TABLE}.user_id`, userId)
    .eq(`${ORG_MEMBERS_TABLE}.role`, 'owner')
    .eq(`${ORG_MEMBERS_TABLE}.status`, 'active')
    .is('deleted_at', null);
  if (withStatus.error) throw withStatus.error;
  return uniqueIds((withStatus.data ?? []).map((row) => (row as { id?: unknown }).id));
}

/**
 * Resolve the authenticated owner's salon id.
 * Anything other than `resolved` means: do not read or write a salon row.
 */
export async function resolveOwnerSalonId(): Promise<OwnerSalonResolution> {
  if (!isSupabaseConfigured || !supabase) return { status: 'not-configured' };

  let identity: Awaited<ReturnType<typeof getAuthoritativeAuthIdentity>>;
  try {
    identity = await getAuthoritativeAuthIdentity('workspace.ownership');
  } catch (err) {
    const diagnostic = (err as { diagnostic?: WorkspaceDiagnostic }).diagnostic
      || diagnosticFromError({
        operation: 'workspace.ownership',
        stage: 'auth-session',
        error: err,
        authenticatedUserExists: false,
      });
    // authIdentity already logs its structured diagnostic. Log a fallback only
    // for an unexpected error that did not carry one.
    if (!(err as { diagnostic?: WorkspaceDiagnostic }).diagnostic) logWorkspaceFailure(diagnostic);
    return { status: 'error', diagnostic };
  }

  if (!identity) return { status: 'not-authenticated' };
  const userId = identity.user.id;

  try {
    let salonIds = await salonIdsFromHelper();
    if (salonIds === null) salonIds = await salonIdsFromMembership(userId);

    if (salonIds.length === 0) return { status: 'no-membership' };
    return { status: 'resolved', salonId: salonIds[0] };
  } catch (err) {
    const code = (err as { code?: string }).code;
    const diagnostic = diagnosticFromError({
      operation: 'workspace.ownership',
      stage: 'ownership',
      error: err,
      authenticatedUserExists: true,
      userId,
    });
    logWorkspaceFailure(diagnostic);
    if (isPermissionError(code)) return { status: 'permission-denied', diagnostic };
    return { status: 'error', diagnostic };
  }
}

/** User-facing message. Never exposes SQL, tokens or database internals. */
export function ownerSalonMessage(resolution: OwnerSalonResolution): string {
  switch (resolution.status) {
    case 'not-configured':
      return 'Shop location is unavailable right now. Please try again later.';
    case 'not-authenticated':
      return 'Please log in to manage your shop.';
    case 'permission-denied':
      return resolution.diagnostic
        ? workspaceUserMessage(resolution.diagnostic)
        : 'You do not have permission to edit this shop location.';
    case 'ambiguous':
      return 'Multiple shops are linked to your account. Please select a shop first.';
    case 'no-membership':
      return 'No salon is linked to this account yet.';
    case 'error':
      return resolution.diagnostic
        ? workspaceUserMessage(resolution.diagnostic)
        : 'Unable to determine your shop.';
    default:
      return '';
  }
}
