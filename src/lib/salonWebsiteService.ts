import type { SalonData } from '../types';
import { resolveOwnerSalonId } from './ownerSalon';
import {
  generateSalonSlug,
  isValidWebsiteSlug,
  suggestedWebsiteSlug,
  slugifySalonName,
} from './publicWebsiteUrl';
import { requireSupabase, isSupabaseConfigured } from './supabaseClient';
import { DEFAULT_THEME_ID, normalizeThemeId } from './themeServices';
import {
  assertPublishReady,
  evaluatePublishReadiness,
  PUBLISH_INCOMPLETE_ERROR,
  PUBLISH_INCOMPLETE_LABEL,
  readinessFromMissingLabels,
  type PublishReadiness,
} from './publishReadiness';
import { isOwnerTemplateKey } from './ownerProvisioning';
import { unifiedDraftFromSalonData } from './unifiedSalonDraft';
import { normalizeCustomDomain } from './customDomain';
import {
  activeTemplateConfigFromSalon,
  normalizeTemplateConfigs,
  sanitizeTemplateConfigForTemplate,
  templateSupportsConfig,
} from './templateConfig';
import {
  diagnosticFromError,
  logWorkspaceFailure,
  workspaceUserMessage,
  WorkspaceInitializationError,
} from './workspaceDiagnostics';

export const SALON_PUBLIC_WEBSITES_TABLE = 'salon_public_websites';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/* ------------------------------------------------------------------ *
 * Draft-save failure diagnostics
 *
 * A failed draft save used to surface only as the generic
 * "Save failed — check connection", even when the real cause was an expired
 * session, an RLS/permission denial, an oversized payload (Base64 gallery
 * fallbacks from Step 5), or a CORS/origin rejection. The classifier below
 * turns each failure into an actionable message, and the module records the
 * most recent one so `persistOwnerBusinessSetup` can propagate it to the
 * autosave toast + TopBar indicator.
 * ------------------------------------------------------------------ */

let lastDraftSaveError: string | null = null;

/** Human-readable reason for the most recent failed draft save (or null). */
export function getLastDraftSaveErrorMessage(): string | null {
  return lastDraftSaveError;
}

/**
 * Turns a raw Supabase/HTTP/network failure into a specific, actionable
 * message. Never echoes SQL or internals to the owner.
 */
export function describeDraftSaveFailure(source: unknown, httpStatus?: number): string {
  const shaped = source as { message?: unknown; error?: unknown; code?: unknown } | null | undefined;
  const raw = (source instanceof Error
    ? source.message
    : typeof shaped?.message === 'string'
      ? shaped.message
      : typeof shaped?.error === 'string'
        ? shaped.error
        : typeof source === 'string'
          ? source
          : '').trim();
  const lower = raw.toLowerCase();
  const status = typeof httpStatus === 'number' ? httpStatus : undefined;

  if (status === 401 || /jwt (expired|invalid)|token (is )?expired|refresh token|session (is )?(expired|missing)|not authenticated|unauthorized/i.test(lower)) {
    return 'Your session has expired. Please log in again, then retry saving your website.';
  }
  if (status === 403 && /origin/.test(lower)) {
    return 'The server rejected this request\u2019s origin (CORS). Ask your administrator to add this domain to ALLOWED_API_ORIGINS.';
  }
  if (status === 403 || /row-level security|rls|permission denied|not authorized/i.test(lower)) {
    return 'Your account does not have permission to save this salon. Log in with the owner account and try again.';
  }
  if (status === 413 || /payload too large|entity too large|request entity|payload-too-large|too large to send/i.test(lower)) {
    return 'This save is too large to send — usually gallery photos kept inside the draft while your media storage was unreachable. Reconnect so images upload to your media library, or remove some gallery photos, then try again.';
  }
  if (source instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(lower)) {
    return 'The save request never reached the server. Check your internet connection — if you are online, a CORS or firewall rule may be blocking the request.';
  }
  if ((typeof status === 'number' && status >= 500) || /\b5\d\d\b|service unavailable|bad gateway|gateway timeout|internal server error/i.test(lower)) {
    return 'The save service is temporarily unavailable. Your changes are kept locally and will retry automatically.';
  }
  if (/violates|constraint|sql|relation|column|function|schema|pg_/i.test(lower)) {
    return 'Your website details could not be saved because of a setup problem on our side. Please contact support.';
  }
  if (raw && raw.length <= 160) return raw;
  return 'Unable to save your website details. Please check your connection and try again.';
}

/**
 * The full onboarding/website draft persisted to
 * `salon_public_websites.config`. This is OWNER-PRIVATE until the site is
 * published (RLS on salon_public_websites keeps drafts visible only to the
 * owning salon; only is_published=true rows are publicly readable).
 *
 * It is the Supabase-side authority for "refresh must not lose progress":
 * every onboarding field (business details, template, team, gallery, socials,
 * location/hours, contact/booking rules and the theme-scoped service/package
 * UI cache) is included. It is JSON-serializable (it round-trips through the
 * database) and deliberately contains no auth tokens, user ids or salon ids
 * beyond the row's own salon_id.
 *
 * The field list itself lives in `unifiedSalonDraft` — the SINGLE source of
 * truth — so a newly added step field can never be silently dropped again.
 */
export function websiteConfigFromSalonData(data: SalonData): Partial<SalonData> {
  const unified = unifiedDraftFromSalonData(data);
  return {
    ...unified,
    // Keep an unconfigured owner unconfigured. In particular, never serialize
    // the demonstration salon's contact/deposit policy into a new tenant just
    // because runtime booking code has safe operational defaults.
    ...(data.contactOptions ? { contactOptions: data.contactOptions } : {}),
    ...(data.bookingRules ? { bookingRules: data.bookingRules } : {}),
    templateConfig: sanitizeTemplateConfigForTemplate(
      activeTemplateConfigFromSalon(data),
      data.templateId,
    ),
    templateConfigs: normalizeTemplateConfigs(data.templateConfigs),
    lastCompletedStep: data.lastCompletedStep,
  };
}

export const SET_OWNER_WEBSITE_VISUAL_CONFIG_FN = 'set_owner_salon_visual_config';

export function websiteVisualConfigFromSalonData(data: SalonData): Record<string, unknown> {
  const normalized = activeTemplateConfigFromSalon(data);
  const templateConfig = sanitizeTemplateConfigForTemplate(normalized, data.templateId);
  const visualConfig: Record<string, unknown> = {
    templateConfig,
    templateConfigs: {
      ...normalizeTemplateConfigs(data.templateConfigs),
      [normalizeThemeId(data.templateId)]: templateConfig,
    },
    websiteAppearance: normalized.appearance,
    brandColor: normalized.accentColor,
    salonNameFont: normalized.salonNameFont,
    salonNameColor: normalized.salonNameColor,
  };
  if (templateSupportsConfig(data.templateId, 'heroPosition')) {
    visualConfig.heroPosition = normalized.heroPosition;
  }
  return visualConfig;
}

function isMissingVisualConfigRpc(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes(SET_OWNER_WEBSITE_VISUAL_CONFIG_FN)
    && (normalized.includes('not find') || normalized.includes('does not exist') || normalized.includes('schema cache'));
}

/**
 * Persist only the visual website overlay. The RPC merges a strict JSON key
 * allowlist in the database, so appearance edits never invoke business setup
 * writes. The fallback supports environments where the additive migration has
 * not been deployed yet and still updates only salon_public_websites.config.
 */
export async function saveOwnerWebsiteVisualConfig(data: SalonData): Promise<void> {
  const client = requireSupabase();
  const visualConfig = websiteVisualConfigFromSalonData(data);

  // 1. Attempt database RPC
  try {
    const { error: rpcError } = await client.rpc(SET_OWNER_WEBSITE_VISUAL_CONFIG_FN, {
      p_visual_config: visualConfig,
    });
    if (!rpcError) return;
  } catch (rpcErr) {
    console.warn('RPC set_owner_salon_visual_config warning:', rpcErr);
  }

  // 2. Attempt client-side table update fallback
  let salonId: string | null = null;
  try {
    const resolution = await resolveOwnerSalonId();
    if (resolution.status === 'resolved') {
      salonId = resolution.salonId;
      const { data: row, error: loadError } = await client
        .from(SALON_PUBLIC_WEBSITES_TABLE)
        .select('config')
        .eq('salon_id', resolution.salonId)
        .maybeSingle();

      if (!loadError) {
        const currentConfig = row?.config && typeof row.config === 'object' && !Array.isArray(row.config)
          ? row.config as Record<string, unknown>
          : {};
        const { error: updateError } = await client
          .from(SALON_PUBLIC_WEBSITES_TABLE)
          .update({ config: { ...currentConfig, ...visualConfig } })
          .eq('salon_id', resolution.salonId);

        if (!updateError) return;
      }
    }
  } catch (clientErr) {
    console.warn('Client-side saveOwnerWebsiteVisualConfig warning:', clientErr);
  }

  // 3. Attempt server-side fallback
  try {
    const targetSalonId = salonId || data.salonId;
    if (targetSalonId) {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const resp = await fetch('/api/owner/save-website-visual-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            salonId: targetSalonId,
            visualConfig,
          }),
        });

        if (resp.ok) return;
      }
    }
  } catch (serverErr) {
    console.warn('Server fallback saveOwnerWebsiteVisualConfig warning:', serverErr);
  }
}

export async function loadOwnerWebsiteDraft(): Promise<{
  salonId: string;
  slug: string | null;
  templateKey: string | null;
  config: Partial<SalonData>;
  isPublished: boolean;
  /** M69 — the connected custom domain, or null. Database-owned. */
  customDomain: string | null;
  /** M69 — verification status of `customDomain`. */
  customDomainStatus: 'not_configured' | 'pending' | 'verified' | 'failed';
} | null> {
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') {
    if (resolution.status === 'error' || resolution.status === 'permission-denied') {
      const diagnostic = resolution.diagnostic || diagnosticFromError({
        operation: 'workspace.website_read',
        stage: 'ownership',
        error: { code: 'WORKSPACE_OWNERSHIP_UNAVAILABLE', message: 'Owner salon resolution failed.' },
      });
      logWorkspaceFailure(diagnostic);
      throw new WorkspaceInitializationError(diagnostic, workspaceUserMessage(diagnostic));
    }
    return null;
  }
  // M69: `custom_domain` / `custom_domain_status` are database-owned routing
  // state, never part of the owner-editable draft. The select tolerates a
  // deployment where M69 has not been applied yet by retrying without them.
  const WEBSITE_FIELDS = 'salon_id,slug,template_key,config,is_published';
  const WEBSITE_FIELDS_WITH_DOMAIN =
    'salon_id,slug,template_key,config,is_published,custom_domain,custom_domain_status';

  let { data, error } = await requireSupabase()
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .select(WEBSITE_FIELDS_WITH_DOMAIN)
    .eq('salon_id', resolution.salonId)
    .maybeSingle();

  if (error && /custom_domain.*(does not exist|column)/i.test(error.message || '')) {
    ({ data, error } = await requireSupabase()
      .from(SALON_PUBLIC_WEBSITES_TABLE)
      .select(WEBSITE_FIELDS)
      .eq('salon_id', resolution.salonId)
      .maybeSingle());
  }

  if (error) {
    const diagnostic = diagnosticFromError({
      operation: 'workspace.website_read',
      stage: 'website-read',
      error,
      authenticatedUserExists: true,
    });
    logWorkspaceFailure(diagnostic);
    throw new WorkspaceInitializationError(diagnostic, workspaceUserMessage(diagnostic));
  }
  if (!data) return {
    salonId: resolution.salonId,
    slug: null,
    templateKey: null,
    config: {},
    isPublished: false,
    customDomain: null,
    customDomainStatus: 'not_configured' as const,
  };
  const rawConfig = data.config && typeof data.config === 'object' && !Array.isArray(data.config)
    ? data.config as Partial<SalonData>
    : {};
  return {
    salonId: data.salon_id,
    slug: optionalString(data.slug) || null,
    templateKey: optionalString(data.template_key) || null,
    config: {
      ...rawConfig,
      templateConfig: sanitizeTemplateConfigForTemplate(
        rawConfig.templateConfig,
        optionalString(data.template_key) || rawConfig.templateId,
      ),
      templateConfigs: normalizeTemplateConfigs(rawConfig.templateConfigs),
    },
    isPublished: data.is_published === true,
    customDomain: normalizeCustomDomain((data as Record<string, unknown> | null)?.custom_domain),
    customDomainStatus: normalizeDomainStatus(
      (data as Record<string, unknown> | null)?.custom_domain_status,
    ),
  };
}

/** Coerces an untrusted `custom_domain_status` column into the known enum. */
function normalizeDomainStatus(
  value: unknown,
): 'not_configured' | 'pending' | 'verified' | 'failed' {
  return value === 'pending' || value === 'verified' || value === 'failed'
    ? value
    : 'not_configured';
}

/**
 * The address this salon should advertise right now.
 *
 * A published address is permanently allocated (`published_at` is the
 * allocation marker) — renaming the business must never break links the owner
 * has already shared, so it is returned unchanged. An UNPUBLISHED salon tracks
 * its business name instead: provisioning runs before the owner ever types the
 * real name, which is how drafts ended up advertising the placeholder
 * `/my-salon-3` instead of `/arts-by-uma`.
 */
export function draftSlugForSalonName(data: SalonData, currentSlug?: string | null, isPublished?: boolean): string | null {
  if (isPublished === true && isValidWebsiteSlug(currentSlug || '')) {
    return (currentSlug || '').trim().toLowerCase();
  }
  const desired = generateSalonSlug(data.salonName);
  if (!isValidWebsiteSlug(desired)) return null;
  const existing = (currentSlug || '').trim().toLowerCase();
  if (existing === desired) return null; // nothing to sync
  return desired;
}

export async function saveOwnerWebsiteDraft(data: SalonData): Promise<{
  salonId: string;
  slug: string;
  isPublished: boolean;
} | null> {
  lastDraftSaveError = null;
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') {
    lastDraftSaveError = resolution.status === 'not-authenticated'
      ? 'Your session has expired. Please log in again, then retry saving your website.'
      : 'We could not resolve your salon workspace. Please refresh and log in again.';
    return null;
  }
  const client = requireSupabase();
  const config = websiteConfigFromSalonData(data);
  const templateKey = normalizeThemeId(data.templateId) || DEFAULT_THEME_ID;

  // 1. Attempt client-side write
  try {
    const { data: existing, error: readError } = await client
      .from(SALON_PUBLIC_WEBSITES_TABLE)
      .select('slug,is_published')
      .eq('salon_id', resolution.salonId)
      .maybeSingle();
    if (readError) lastDraftSaveError = describeDraftSaveFailure(readError);

    if (!readError && existing) {
      const isPublished = existing.is_published === true;
      // Keep the draft address in step with the business name while the site is
      // still unpublished. A unique-violation simply keeps the allocated slug —
      // the database allocator remains the collision authority.
      const slugSync = draftSlugForSalonName(data, existing.slug, isPublished);
      const payload: Record<string, unknown> = { config };
      if (slugSync) payload.slug = slugSync;

      const { data: saved, error } = await client
        .from(SALON_PUBLIC_WEBSITES_TABLE)
        // Template selection has one write authority: set_owner_salon_template.
        // A delayed business autosave must never overwrite a newer selection.
        .update(payload)
        .eq('salon_id', resolution.salonId)
        .select('slug,is_published')
        .maybeSingle();

      if (!error) {
        if (slugSync && saved?.slug === slugSync) {
          // Mirror the address onto the canonical salon row so public routing
          // and the owner dashboard agree on one slug.
          void client.from('salons').update({ slug: slugSync }).eq('id', resolution.salonId).then(
            () => undefined,
            () => undefined,
          );
        }
        lastDraftSaveError = null;
        return {
          salonId: resolution.salonId,
          slug: saved?.slug || existing.slug || data.websiteSlug || `salon-${resolution.salonId.slice(0, 8)}`,
          isPublished: saved?.is_published ?? existing.is_published ?? false,
        };
      }
      lastDraftSaveError = describeDraftSaveFailure(error);
    } else if (!readError && !existing) {
      const slug =
        data.websiteSlug?.trim().toLowerCase() ||
        suggestedWebsiteSlug(data) ||
        generateSalonSlug(data.salonName) ||
        `salon-${resolution.salonId.slice(0, 8)}`;
      if (isValidWebsiteSlug(slug)) {
        const { data: saved, error } = await client
          .from(SALON_PUBLIC_WEBSITES_TABLE)
          .insert({
            salon_id: resolution.salonId,
            slug,
            template_key: templateKey,
            config,
            is_published: false,
            published_at: null,
          })
          .select('slug,is_published')
          .maybeSingle();

        if (!error && saved) {
          lastDraftSaveError = null;
          return { salonId: resolution.salonId, slug: saved.slug, isPublished: saved.is_published };
        }
        if (error) lastDraftSaveError = describeDraftSaveFailure(error);
      }
    }
  } catch (clientErr) {
    console.warn('Client-side saveOwnerWebsiteDraft warning:', clientErr);
    lastDraftSaveError = describeDraftSaveFailure(clientErr);
  }

  // 2. Attempt server-side fallback
  try {
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      lastDraftSaveError = 'Your session has expired. Please log in again, then retry saving your website.';
    } else {
      const resp = await fetch('/api/owner/save-website-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          salonId: resolution.salonId,
          config,
          slug: data.websiteSlug?.trim().toLowerCase() || generateSalonSlug(data.salonName),
          salonName: data.salonName,
          templateKey,
        }),
      });

      if (resp.ok) {
        const result = await resp.json();
        lastDraftSaveError = null;
        return {
          salonId: result.salonId || resolution.salonId,
          slug: result.slug || data.websiteSlug || `salon-${resolution.salonId.slice(0, 8)}`,
          isPublished: result.isPublished === true,
        };
      }

      // The fallback answered with an error status — read the server's own
      // reason when it sent JSON, then classify it (401 session, 403
      // permission/origin, 413 payload too large, 5xx outage).
      let serverReason: unknown = null;
      try {
        serverReason = await resp.json();
      } catch {
        /* non-JSON error page (proxy/HTML) — classify by status alone */
      }
      lastDraftSaveError = describeDraftSaveFailure(serverReason, resp.status);
      console.error(
        `Server fallback saveOwnerWebsiteDraft failed with HTTP ${resp.status}:`,
        serverReason ?? '(no JSON body)',
      );
    }
  } catch (serverErr) {
    console.warn('Server fallback saveOwnerWebsiteDraft warning:', serverErr);
    lastDraftSaveError = describeDraftSaveFailure(serverErr);
  }

  // 3. Nothing was persisted. Return null (NOT a success-shaped fallback): a
  // draft that did not reach the database must surface as a failed save so the
  // UI can tell the owner to retry — a fake slug here would silently swallow
  // the failure and show "Saved ✓" for data that will be gone on refresh.
  // The specific reason is retained in `getLastDraftSaveErrorMessage()`.
  console.error('saveOwnerWebsiteDraft: website draft was not persisted (client write and server fallback both failed).');
  return null;
}

export const PUBLISH_OWNER_WEBSITE_FN = 'publish_owner_salon_website';
export const UNPUBLISH_OWNER_WEBSITE_FN = 'unpublish_owner_salon_website';

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (data == null) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

export const VERIFY_PUBLISH_READINESS_FN = 'verify_owner_publish_readiness';

function isMissingReadinessRpc(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes(VERIFY_PUBLISH_READINESS_FN)
    && (normalized.includes('not find') || normalized.includes('does not exist') || normalized.includes('schema cache'));
}

/**
 * Publish-readiness validation. The client evaluates the current draft with
 * the existing business rules; when migration M50 is deployed the same rules
 * are re-checked inside the database against the persisted business row +
 * draft config (so an active-theme or saved-website-state gap cannot slip
 * through a stale client). The database result is authoritative when
 * available; environments without M50 keep the exact client-side rules.
 */
export async function verifyOwnerPublishReadiness(
  data: SalonData,
): Promise<PublishReadiness> {
  const local = evaluatePublishReadiness(data);
  if (!isSupabaseConfigured) return local;
  try {
    const { data: rows, error } = await requireSupabase().rpc(
      VERIFY_PUBLISH_READINESS_FN,
      {
        p_config: websiteConfigFromSalonData(data),
        p_template_key: data.templateId || DEFAULT_THEME_ID,
      },
    );
    if (error) {
      if (isMissingReadinessRpc(error.message || '')) return local;
      return {
        ...local,
        ready: false,
        statusLabel: PUBLISH_INCOMPLETE_LABEL,
        missingLabels: [],
        missingGroupLabels: [],
        required: local.required.map((item) => ({ ...item, done: false })),
      };
    }
    const missing = Array.isArray(rows) ? rows : [];
    const labels = missing
      .map((row: { missing_item?: unknown }) =>
        typeof row?.missing_item === 'string' ? row.missing_item : undefined)
      .filter((label: string | undefined): label is string => Boolean(label));
    return readinessFromMissingLabels(local, labels);
  } catch {
    // Validation failures must never block publishing behind a network error;
    // the publish RPC remains the final invariant guard.
    return local;
  }
}

/** Publish the authenticated owner's salon website. Salon id is resolved in the database. */
export async function publishOwnerSalonWebsite(data: SalonData): Promise<{
  salonId: string;
  slug: string;
  isPublished: boolean;
  publishedAt: string | null;
}> {
  // Fail closed before the existing Phase 1-A RPC. Incomplete businesses
  // must never be marked published, even if a caller skips the UI gate.
  assertPublishReady(data);
  // The database allocates the authoritative unique slug from salonName.
  // p_slug remains populated only for backwards-compatible RPC shape.
  const slug = slugifySalonName(data.salonName) || 'salon';
  const salonId = typeof data.salonId === 'string' && data.salonId.trim()
    ? data.salonId.trim()
    : null;
  const { data: rows, error } = await requireSupabase().rpc(PUBLISH_OWNER_WEBSITE_FN, {
    p_slug: slug,
    p_template_key: data.templateId || 'hair',
    p_config: websiteConfigFromSalonData(data),
    p_salon_id: salonId,
  });
  if (error) {
    throw new Error(error.message || 'Unable to publish your website.');
  }
  const saved = firstRpcRow(rows as {
    salon_id?: string;
    slug?: string;
    is_published?: boolean;
    published_at?: string | null;
  } | null);
  if (!saved?.salon_id || !saved.slug) {
    throw new Error('Unable to publish your website.');
  }
  return {
    salonId: saved.salon_id,
    slug: saved.slug,
    isPublished: saved.is_published === true,
    publishedAt: saved.published_at ?? null,
  };
}

/**
 * Unpublish the authenticated owner's salon website through the existing
 * `unpublish_owner_salon_website` RPC (migration M39). Visibility flips in
 * the database; `published_at` (the permanent URL allocation) is preserved,
 * so republishing later keeps the same public address. Salon id is resolved
 * in the database — never trusted from the client.
 */
export async function unpublishOwnerSalonWebsite(data: SalonData): Promise<{
  salonId: string;
  slug: string;
  isPublished: boolean;
}> {
  const salonId = typeof data.salonId === 'string' && data.salonId.trim()
    ? data.salonId.trim()
    : null;
  const { data: rows, error } = await requireSupabase().rpc(UNPUBLISH_OWNER_WEBSITE_FN, {
    p_salon_id: salonId,
  });
  if (error) {
    throw new Error(error.message || 'Unable to unpublish your website.');
  }
  const saved = firstRpcRow(rows as {
    salon_id?: string;
    slug?: string;
    is_published?: boolean;
  } | null);
  if (!saved?.salon_id || !saved.slug) {
    throw new Error('Unable to unpublish your website.');
  }
  return {
    salonId: saved.salon_id,
    slug: saved.slug,
    isPublished: saved.is_published === true,
  };
}
