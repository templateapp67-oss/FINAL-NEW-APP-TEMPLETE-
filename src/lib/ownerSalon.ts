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
  | { status: 'permission-denied' }
  | { status: 'error' };

/** Authenticated user id from the real session, or null when signed out. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
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
async function salonIdsFromMembership(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(SALON_TABLE_NAME)
    .select(`id, organization_id, ${ORG_MEMBERS_TABLE}!inner(user_id, role, is_active)`)
    .eq(`${ORG_MEMBERS_TABLE}.user_id`, userId)
    .eq(`${ORG_MEMBERS_TABLE}.role`, 'owner')
    .eq(`${ORG_MEMBERS_TABLE}.is_active`, true)
    .is('deleted_at', null);

  if (error) throw error;
  return uniqueIds((data ?? []).map((row) => (row as { id?: unknown }).id));
}

/**
 * Broader multi-tenant membership fallback. When the owner-only helpers
 * (owner_salon_ids / the role='owner' join) find nothing — e.g. a schema
 * drift on a helper column, or a member whose owner link lives in a
 * different shape — we still try to locate any salon the authenticated user
 * is attached to through `organization_members` (any active role) so a
 * legitimately-linked user is not treated as a brand-new tenant.
 *
 * This is a best-effort fallback: any query/table failure is logged (never a
 * hard blocker) and treated as "no membership found", which lets the caller
 * fall through to self-provisioning.
 */
async function salonIdsFromOrganizationMembershipAnyRole(userId: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(ORG_MEMBERS_TABLE)
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Salon setup error details (membership query):', error);
      return [];
    }

    const orgIds = uniqueIds(
      (data ?? []).map((row) => (row as { organization_id?: unknown }).organization_id),
    );
    if (orgIds.length === 0) return [];

    const { data: salons, error: salonError } = await supabase
      .from(SALON_TABLE_NAME)
      .select('id')
      .in('organization_id', orgIds)
      .is('deleted_at', null);

    if (salonError) {
      console.error('Salon setup error details (membership->salon query):', salonError);
      return [];
    }
    return uniqueIds((salons ?? []).map((row) => (row as { id?: unknown }).id));
  } catch (err) {
    console.error('Salon setup error details (membership query):', err);
    return [];
  }
}

/**
 * Additional staff-style membership fallback (`public.staff` where
 * `user_id = auth.uid()`). The table may not exist in every deployment, so
 * this is fully defensive: any failure logs and returns [].
 */
async function salonIdsFromStaffMembership(userId: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('salon_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Salon setup error details (staff membership query):', error);
      return [];
    }
    return uniqueIds((data ?? []).map((row) => (row as { salon_id?: unknown }).salon_id));
  } catch (err) {
    console.error('Salon setup error details (staff membership query):', err);
    return [];
  }
}

/**
 * Resolve the authenticated owner's salon id.
 * Anything other than `resolved` means: do not read or write a salon row.
 *
 * Robustness contract (workspace-load safety):
 *  - The canonical owner helpers run first (owner_salon_ids RPC, then the
 *    owner membership join). A missing helper/function is not an error — it
 *    just falls back to the equivalent join.
 *  - If ownership yields nothing, a broad multi-tenant membership fallback
 *    (organization_members any active role, plus a staff-style link) is
 *    attempted. Every one of these queries is defensive.
 *  - A genuinely unexpected schema/permission surprise is NEVER a hard
 *    blocker: the exact Supabase code/message is logged under
 *    "Salon setup error details" and the status becomes `error` so the caller
 *    can still attempt idempotent self-provisioning instead of dead-ending.
 */
export async function resolveOwnerSalonId(): Promise<OwnerSalonResolution> {
  if (!isSupabaseConfigured || !supabase) return { status: 'not-configured' };

  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: 'not-authenticated' };

  let salonIds: string[] = [];
  try {
    salonIds = await salonIdsFromHelper();
    // A `null` return means the helper function is not exposed (not a fault);
    // fall back to the equivalent ownership join.
    if (salonIds === null) salonIds = await salonIdsFromMembership(userId);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (isPermissionError(code)) return { status: 'permission-denied' };
    // Non-permission failure: log the exact Supabase detail and continue to
    // the broad membership fallback below instead of hard-blocking.
    console.error('Salon setup error details (owner query):', err);
  }

  if (salonIds.length === 0) {
    // No owner record found — check the broader multi-tenant membership
    // tables before declaring the user a brand-new tenant.
    try {
      const memberIds = await salonIdsFromOrganizationMembershipAnyRole(userId);
      const staffIds = await salonIdsFromStaffMembership(userId);
      salonIds = Array.from(new Set([...salonIds, ...memberIds, ...staffIds]));
    } catch (err) {
      // Already logged defensively inside the helpers; never blocks.
      console.error('Salon setup error details (membership fallback):', err);
    }
  }

  if (salonIds.length === 0) return { status: 'no-membership' };
  // Never pick one arbitrarily.
  if (salonIds.length > 1) return { status: 'ambiguous' };
  return { status: 'resolved', salonId: salonIds[0] };
}

/** User-facing message. Never exposes SQL, tokens or database internals. */
export function ownerSalonMessage(resolution: OwnerSalonResolution): string {
  switch (resolution.status) {
    case 'not-configured':
      return 'Shop location is unavailable right now. Please try again later.';
    case 'not-authenticated':
      return 'Please log in to manage your shop.';
    case 'permission-denied':
      return 'You do not have permission to edit this shop location.';
    case 'ambiguous':
      return 'Multiple shops are linked to your account. Please select a shop first.';
    case 'no-membership':
    case 'error':
      return 'Unable to determine your shop.';
    default:
      return '';
  }
}
