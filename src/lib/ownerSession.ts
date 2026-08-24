/**
 * PHASE 1-B — Authenticated owner session.
 *
 * Identity is ONLY `supabase.auth.getUser()`. Never localStorage, never a
 * hardcoded user/salon id, never a decorative "logged in" flag.
 *
 * Chain:
 *   auth.users.id
 *     → profiles (signup_role / provision promotes business_user)
 *     → provision_owner_salon (SECURITY DEFINER, auth.uid())
 *     → organization_members.role = owner
 *     → salons
 */

import { isSupabaseConfigured, requireSupabase } from './supabaseClient';
import { getAuthenticatedUserId, resolveOwnerSalonId } from './ownerSalon';
import {
  resolveOrProvisionOwnerSalon,
  type OwnerTemplateKey,
} from './ownerProvisioning';
import { suggestedWebsiteSlug } from './publicWebsiteUrl';

export const OWNER_DASHBOARD_PATH = '/dashboard';

export interface OwnerAuthSession {
  userId: string;
  email: string | null;
  salonId: string;
  slug?: string;
  provisioned: boolean;
}

export function isOwnerWorkspacePath(pathname?: string): boolean {
  const path = (pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')).replace(/\/+$/, '') || '/';
  return path === OWNER_DASHBOARD_PATH || path === '/builder';
}

/** Navigate to the real owner workspace after a live Supabase session exists. */
export function enterOwnerDashboard(): void {
  if (typeof window === 'undefined') return;
  if (isOwnerWorkspacePath()) return;
  window.location.assign(OWNER_DASHBOARD_PATH);
}

export async function requireAuthenticatedUser(): Promise<{
  userId: string;
  email: string | null;
} | { error: string }> {
  if (!isSupabaseConfigured) {
    return { error: 'Authentication is not configured.' };
  }
  try {
    const { data, error } = await requireSupabase().auth.getUser();
    if (error || !data.user?.id) {
      return { error: 'Please log in to continue.' };
    }
    return { userId: data.user.id, email: data.user.email ?? null };
  } catch {
    return { error: 'Please log in to continue.' };
  }
}

/**
 * After signup or login: session user → owner membership → salon.
 * Provisioning is idempotent and authorized only by auth.uid().
 */
export async function completeOwnerAuthSession(input?: {
  salonName?: string;
  slug?: string;
  templateKey?: OwnerTemplateKey | string;
}): Promise<OwnerAuthSession | { error: string }> {
  const auth = await requireAuthenticatedUser();
  if ('error' in auth) return auth;

  const salonName = input?.salonName?.trim() || undefined;
  const slug = input?.slug?.trim()
    || (salonName ? suggestedWebsiteSlug({ salonName }) : undefined);

  const provisioned = await resolveOrProvisionOwnerSalon({
    salonName,
    slug,
    templateKey: input?.templateKey,
  });
  if ('error' in provisioned) return provisioned;

  const confirmed = await resolveOwnerSalonId();
  if (confirmed.status === 'not-authenticated') {
    return { error: 'Please log in to continue.' };
  }
  if (confirmed.status !== 'resolved') {
    return { error: 'Unable to link your salon to this account. Please try again.' };
  }
  if (confirmed.salonId !== provisioned.salonId) {
    return { error: 'Unable to determine your salon. Please try again.' };
  }

  return {
    userId: auth.userId,
    email: auth.email,
    salonId: provisioned.salonId,
    slug: provisioned.slug,
    provisioned: provisioned.provisioned,
  };
}

export async function hasAuthenticatedOwnerSession(): Promise<boolean> {
  const userId = await getAuthenticatedUserId();
  return Boolean(userId);
}
