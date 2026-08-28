/**
 * OWNER SELF-PROVISIONING + WHITE-LABEL WEBSITE BINDING
 *
 * A brand-new authenticated owner has an auth.users + public.profiles row but
 * no organization / owner membership / salon yet. The ONLY sanctioned way to
 * create that tenant — and bind it to a LIVE public website slug — is the
 * SECURITY DEFINER RPC `public.provision_owner_salon(name, slug, template_id)`
 * (M54 compatibility replacement, following migration 20260823000401).
 *
 * The browser never inserts into organizations / organization_members /
 * salons / salon_public_websites directly (RLS + the M36 membership guard
 * forbid it). This module is the single place that calls the provisioning
 * RPC. It is idempotent: if the owner already has a salon it is returned
 * unchanged, so it is safe to call on every login/refresh.
 *
 * Identity comes solely from the Supabase session (auth.uid() inside the
 * function). No user id, organization id, or salon id is supplied by the
 * client for authorization.
 */

import { requireSupabase, isSupabaseConfigured } from './supabaseClient';
import { getAuthoritativeAuthIdentity } from './authIdentity';
import { suggestedWebsiteSlug, slugifySalonName } from './publicWebsiteUrl';
import {
  diagnosticError,
  diagnosticFromError,
  logWorkspaceFailure,
  workspaceUserMessage,
  type WorkspaceDiagnostic,
  WorkspaceInitializationError,
} from './workspaceDiagnostics';

export const PROVISION_OWNER_SALON_FN = 'provision_owner_salon';
export const SET_OWNER_TEMPLATE_FN = 'set_owner_salon_template';

export type OwnerTemplateKey =
  | 'barber_mens_grooming'
  | 'hair_studio_color_bar'
  | 'beauty_skin_spa'
  | 'family_full_service'
  | 'nail_lash_studio';

/** The five selectable templates, in display order. */
export const OWNER_TEMPLATE_KEYS: OwnerTemplateKey[] = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

/** Canonical default for a freshly provisioned salon (template #1). */
export const DEFAULT_OWNER_TEMPLATE: OwnerTemplateKey = 'barber_mens_grooming';

export function isOwnerTemplateKey(value: unknown): value is OwnerTemplateKey {
  return (
    typeof value === 'string' &&
    (OWNER_TEMPLATE_KEYS as readonly string[]).includes(value)
  );
}

export class AmbiguousWorkspaceError extends Error {
  readonly salonIds: string[];
  constructor(salonIds: string[]) {
    super('Multiple salons are linked to your account. Please select a salon workspace.');
    this.name = 'AmbiguousWorkspaceError';
    this.salonIds = salonIds;
  }
}

export function isAmbiguousWorkspaceError(error: unknown): error is AmbiguousWorkspaceError {
  return error instanceof AmbiguousWorkspaceError;
}

export interface ProvisionedOwnerSalon {
  salonId: string;
  organizationId: string;
  slug: string;
  templateId: OwnerTemplateKey;
  isPublished: boolean;
  /** True when the owner already had a salon and nothing was created. */
  alreadyExisted: boolean;
}

interface ProvisionRpcRow {
  out_salon_id?: string;
  salon_id?: string;
  id?: string;
  out_organization_id?: string;
  organization_id?: string;
  out_slug?: string;
  slug?: string;
  out_template_id?: string;
  template_id?: string;
  template_key?: string;
  out_is_published?: boolean;
  is_published?: boolean;
  out_already_existed?: boolean;
  already_existed?: boolean;
}

function firstRow<T>(data: T | T[] | null): T | null {
  if (data == null) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function isMissingFunctionError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('no matches were found')
  );
}

/**
 * Derive a usable website slug from the salon name / an explicit choice,
 * falling back to a safe placeholder. Server-side uniqueness is still
 * enforced authoritatively by the RPC.
 */
function deriveSlug(input?: { slug?: string; salonName?: string }): string {
  const explicit = (input?.slug || '').trim().toLowerCase();
  if (explicit) return slugifySalonName(explicit) || explicit;
  return suggestedWebsiteSlug({ salonName: input?.salonName }) || 'my-salon';
}

/**
 * Ensure the authenticated owner has exactly one salon with a LIVE public
 * website at `slug`, creating it if needed.
 *
 * When a salon already exists the RPC returns it (slug/template unchanged) —
 * provisioning is idempotent. Pass `slug`/`templateKey` to bind the initial
 * white-label address and template on first creation.
 */
export async function ensureOwnerSalon(input?: {
  salonName?: string;
  slug?: string;
  templateKey?: OwnerTemplateKey | string;
}): Promise<ProvisionedOwnerSalon | null> {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();

  // Validate the current browser session immediately before the RPC. The RPC
  // still derives authorization from auth.uid(); this check prevents a
  // logout/login race from showing the previous user's provisioning result.
  const identity = await getAuthoritativeAuthIdentity('workspace.provision');
  if (!identity) {
    throw diagnosticError({
      operation: 'workspace.provision',
      stage: 'auth-session',
      error: { code: '28000', message: 'No authenticated Supabase session.' },
      authenticatedUserExists: false,
    }, 'Please log in to set up your salon.');
  }

  const name = input?.salonName?.trim().slice(0, 120) || 'My Salon';
  const slug = deriveSlug(input);
  const templateKey = isOwnerTemplateKey(input?.templateKey)
    ? input.templateKey
    : DEFAULT_OWNER_TEMPLATE;

  // Try the canonical 3-argument signature first. PostgREST's schema cache can
  // lag a freshly applied migration by a few seconds, so if the function reads
  // as "missing" we pause once and retry before falling back to older variants.
  // This keeps a brand-new owner from being blocked on their first sign-in.
  let { data, error } = await client.rpc(PROVISION_OWNER_SALON_FN, {
    p_salon_name: name,
    p_slug: slug,
    p_template_id: templateKey,
  });

  if (error && isMissingFunctionError(error)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const retry = await client.rpc(PROVISION_OWNER_SALON_FN, {
      p_salon_name: name,
      p_slug: slug,
      p_template_id: templateKey,
    });
    data = retry.data;
    error = retry.error;
  }

  // If the function signature still differs (e.g. an earlier deployment that
  // only exposes the 2-argument overload), fall back to the known
  // backwards-compatible variant. The function derives the owner from
  // auth.uid() internally, so no user id is passed here. (The legacy
  // (p_salon_name, p_user_id) variant is intentionally dropped: it mapped onto
  // the wrong parameter and could provision with a bad template.)
  if (error && isMissingFunctionError(error)) {
    const res = await client.rpc(PROVISION_OWNER_SALON_FN, {
      p_salon_name: name,
      p_template_key: templateKey,
    });
    if (!res.error) {
      data = res.data;
      error = null;
    }
  }

  // Fallback: If RPC still failed, check if this authenticated user ALREADY has
  // an active salon in the database (e.g. signed up previously).
  if (error) {
    try {
      const { resolveOwnerSalonId } = await import('./ownerSalon');
      const existing = await resolveOwnerSalonId();
      if (existing.status === 'resolved' && existing.salonId) {
        const { data: salonRow } = await client
          .from('salons')
          .select('id, organization_id, slug, theme_id')
          .eq('id', existing.salonId)
          .maybeSingle();

        const { data: siteRow } = await client
          .from('salon_public_websites')
          .select('slug, template_key, is_published')
          .eq('salon_id', existing.salonId)
          .maybeSingle();

        return {
          salonId: existing.salonId,
          organizationId: salonRow?.organization_id || '',
          slug: siteRow?.slug || salonRow?.slug || slug,
          templateId: isOwnerTemplateKey(siteRow?.template_key)
            ? siteRow.template_key
            : DEFAULT_OWNER_TEMPLATE,
          isPublished: siteRow?.is_published === true,
          alreadyExisted: true,
        };
      }
      if (existing.status === 'ambiguous') {
        throw new AmbiguousWorkspaceError(existing.salonIds || []);
      }
    } catch (err) {
      if (err instanceof AmbiguousWorkspaceError) throw err;
      // Preserve the original provisioning failure below.
    }

    // Do not bypass the canonical, transaction-safe provisioning RPC with a
    // service-role HTTP writer. In particular, an ambiguous P0003 response must
    // never be converted into "pick the first membership" or another salon
    // insert: that turns a recoverable data issue into additional duplicates.
    // Existing single-salon accounts were recovered above; every other error is
    // preserved for the diagnostic/support path and the reviewed DB repair.
    const diagnostic = diagnosticFromError({
      operation: 'workspace.provision',
      stage: 'provision',
      error,
      authenticatedUserExists: true,
      userId: identity.user.id,
    });
    logWorkspaceFailure(diagnostic);
    throw new WorkspaceInitializationError(diagnostic, sanitizeProvisionError(error.message, error.code));
  }

  const row = firstRow(data as ProvisionRpcRow | ProvisionRpcRow[] | null);
  const salonId = row?.out_salon_id || row?.salon_id || row?.id;
  const organizationId = row?.out_organization_id || row?.organization_id;

  if (!salonId || !organizationId) {
    throw diagnosticError({
      operation: 'workspace.provision',
      stage: 'provision',
      error: {
        code: 'WORKSPACE_RPC_INVALID_RESULT',
        message: 'Provisioning RPC returned no complete salon result.',
      },
      authenticatedUserExists: true,
      userId: identity.user.id,
    }, 'Could not set up your salon website. Please try again.');
  }

  let outSlug = row?.out_slug || row?.slug;
  let outTemplate = row?.out_template_id || row?.template_id || row?.template_key;
  let outPublished = row?.out_is_published ?? row?.is_published ?? false;

  // If the older RPC did not return website slug/template info, resolve it from salon_public_websites
  if (!outSlug && salonId) {
    try {
      const { data: siteRow } = await client
        .from('salon_public_websites')
        .select('slug, template_key, is_published')
        .eq('salon_id', salonId)
        .maybeSingle();
      if (siteRow?.slug) {
        outSlug = siteRow.slug;
        if (siteRow.template_key) outTemplate = siteRow.template_key;
        if (typeof siteRow.is_published === 'boolean') outPublished = siteRow.is_published;
      }
    } catch {
      // Ignore and use fallback
    }
  }

  return {
    salonId,
    organizationId,
    slug: outSlug || slug,
    templateId: isOwnerTemplateKey(outTemplate)
      ? outTemplate
      : DEFAULT_OWNER_TEMPLATE,
    isPublished: outPublished === true,
    alreadyExisted: (row?.out_already_existed ?? row?.already_existed) === true,
  };
}

/**
 * Resolve the owner's salon, auto-provisioning one (with a live slug) on first
 * login when the owner has none. Safe to call on every authenticated boot.
 */
export async function resolveOrProvisionOwnerSalon(input?: {
  salonName?: string;
  slug?: string;
  templateKey?: OwnerTemplateKey | string;
}): Promise<
  | { salonId: string; slug?: string; provisioned: boolean }
  | { status: 'ambiguous'; salonIds: string[] }
  | { error: string; diagnostic?: WorkspaceDiagnostic }
> {
  if (!isSupabaseConfigured) {
    return { error: 'Authentication is not configured.' };
  }

  // Bootstrap through the canonical idempotent RPC first. Do not perform an
  // ownership read and then decide whether to create a workspace: a brand-new
  // account legitimately has no membership yet, and an older account may be
  // missing its profile/membership because signup was interrupted. The
  // preflight ownership query made those two cases indistinguishable from an
  // RLS/schema failure and could stop bootstrap before the repair-capable RPC
  // ran. `provision_owner_salon` derives auth.uid(), reuses an existing tenant,
  // repairs the supported partial state, and serializes concurrent retries.
  // This is also a single authoritative path for existing and new owners;
  // calling it again after refresh is safe and cannot create duplicates.
  try {
    const provisioned = await ensureOwnerSalon(input);
    if (!provisioned) return { error: 'Authentication is not configured.' };
    return {
      salonId: provisioned.salonId,
      slug: provisioned.slug,
      provisioned: !provisioned.alreadyExisted,
    };
  } catch (err) {
    if (err instanceof AmbiguousWorkspaceError) {
      return {
        status: 'ambiguous',
        salonIds: err.salonIds,
      };
    }
    const diagnostic = err instanceof WorkspaceInitializationError
      ? err.diagnostic
      : diagnosticFromError({
        operation: 'workspace.provision',
        stage: 'provision',
        error: err,
        authenticatedUserExists: true,
      });
    if (!(err instanceof WorkspaceInitializationError)) logWorkspaceFailure(diagnostic);
    return {
      error: err instanceof WorkspaceInitializationError
        ? err.message
        : workspaceUserMessage(diagnostic),
      diagnostic,
    };
  }
}

/**
 * Data-safe template switch. Calls the SECURITY DEFINER RPC
 * `set_owner_salon_template`, which updates ONLY salons.theme_id and
 * salon_public_websites.template_key. It never deletes or modifies services,
 * products, bookings, payments, location or ownership — those rows are keyed
 * by salon_id (and services by salon_id+theme_id) and survive any switch.
 */
export async function setOwnerTemplate(
  templateKey: OwnerTemplateKey | string,
): Promise<{ salonId: string; templateId: OwnerTemplateKey }> {
  if (!isSupabaseConfigured) {
    throw new Error('Authentication is not configured.');
  }
  if (!isOwnerTemplateKey(templateKey)) {
    throw new Error('Choose one of the five available templates.');
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc(SET_OWNER_TEMPLATE_FN, {
    p_template_id: templateKey,
  });
  if (error) {
    console.error('Template switch failed:', error);
    throw new Error(sanitizeTemplateError(error.message));
  }
  const row = firstRow(data as { out_salon_id?: string; out_template_id?: string }[] | null);
  if (!row?.out_salon_id) throw new Error('Could not switch template. Please try again.');
  return {
    salonId: row.out_salon_id,
    templateId: isOwnerTemplateKey(row.out_template_id)
      ? row.out_template_id
      : DEFAULT_OWNER_TEMPLATE,
  };
}

function sanitizeProvisionError(message: string | undefined, code?: string): string {
  const msg = `${code || ''} ${message || ''}`.toLowerCase();
  if (/please log in|not authenticated|28000/.test(msg)) {
    return 'Please log in to set up your salon.';
  }
  if (/multiple salons|p0003/.test(msg)) {
    return 'Multiple salons are linked to your account. Please contact support.';
  }
  if (/not authorized|42501/.test(msg)) {
    return 'Your account is not authorized to set up a salon workspace. Please contact support.';
  }
  if (/already in use|23505|duplicate/.test(msg)) {
    return 'That website address is already in use. Try another.';
  }
  if (/reserved/.test(msg)) {
    return 'That website address is reserved. Choose another.';
  }
  if (/3.{0,3}60|lowercase|hyphen|characters/.test(msg)) {
    return 'Website address must be 3–60 lowercase letters, numbers or hyphens.';
  }
  // NOTE: this owner-salon provisioning path has NO invite-token concept, so a
  // generic backend error must never be reported as a "workspace invitation
  // is invalid or expired" failure. Invitation handling lives in
  // `activate_workspace_membership` (src/lib/workspace.ts) and is surfaced by
  // workspaceUserMessage(), not here. Drop the bare /invitation/ matcher so a
  // transient or schema-cache error during sign-up / login no longer shows a
  // misleading invitation message.
  // Deterministic backend faults (missing column/constraint, undefined
  // function, permission) can NEVER be fixed by the owner pressing "Try
  // again", so we must not tell them to. Surfaced as a support-path message
  // without leaking SQL, table names or any database internals.
  if (
    /23502|not-null|null value in column|42703|42883|428c9|pgrst202|generated column|undefined column|undefined function|does not exist|violates/.test(
      msg,
    )
  ) {
    return 'Your salon workspace could not be created because of a setup problem on our side. Please contact support — retrying will not help.';
  }
  return 'Could not set up your salon. Please try again.';
}

function sanitizeTemplateError(message: string | undefined): string {
  const msg = (message || '').toLowerCase();
  if (/please log in|28000/.test(msg)) return 'Please log in to change your template.';
  if (/no salon|p0002/.test(msg)) return 'No salon is linked to your account yet.';
  if (/multiple salons|p0003/.test(msg)) {
    return 'Multiple salons are linked to your account. Please contact support.';
  }
  return 'Could not switch template. Please try again.';
}
