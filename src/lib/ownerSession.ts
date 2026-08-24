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
import { loadOwnerWebsiteDraft } from './salonWebsiteService';

export const OWNER_DASHBOARD_PATH = '/dashboard';
export const OWNER_ONBOARDING_PATH = '/builder';

/** Wizard index after login: Business Setup is step 1 (Hero is only for signed-out). */
export function resumeWizardStep(lastCompletedStep?: number): number {
  const done = typeof lastCompletedStep === 'number' && Number.isFinite(lastCompletedStep)
    ? lastCompletedStep
    : 0;
  return Math.min(12, Math.max(1, Math.floor(done) + 1));
}

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
  void enterOwnerWorkspace();
}

/**
 * Sign Up → Login → Business Setup → Template → Customize → Preview → Publish.
 * Unpublished owners open /builder. Published owners open /dashboard.
 */
export async function enterOwnerWorkspace(): Promise<void> {
  if (typeof window === 'undefined') return;
  let published = false;
  try {
    const draft = await loadOwnerWebsiteDraft();
    published = draft?.isPublished === true;
  } catch {
    published = false;
  }
  const target = published ? OWNER_DASHBOARD_PATH : OWNER_ONBOARDING_PATH;
  const here = window.location.pathname.replace(/\/+$/, '') || '/';
  if (here === target) return;
  window.location.assign(target);
}

export function ownerSalonNameFromMetadata(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined,
): string | undefined {
  const value = user?.user_metadata?.salon_name;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, 120);
  return normalized || undefined;
}

export async function requireAuthenticatedUser(): Promise<{
  userId: string;
  email: string | null;
  salonName?: string;
} | { error: string }> {
  if (!isSupabaseConfigured) {
    return { error: 'Authentication is not configured.' };
  }
  try {
    const { data, error } = await requireSupabase().auth.getUser();
    if (error || !data.user?.id) {
      return { error: 'Please log in to continue.' };
    }
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      salonName: ownerSalonNameFromMetadata(data.user),
    };
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

  // A supplied value is from the current signup form; otherwise use only the
  // current authenticated user's metadata. “My Salon” is deliberately
  // generic and avoids leaking a previous owner's browser-local value.
  const salonName = input?.salonName?.trim().slice(0, 120)
    || auth.salonName
    || 'My Salon';
  const slug = input?.slug?.trim()
    || suggestedWebsiteSlug({ salonName });

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
