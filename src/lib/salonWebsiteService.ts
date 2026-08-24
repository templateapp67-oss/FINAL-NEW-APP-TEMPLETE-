import type { SalonData } from '../types';
import { resolveOwnerSalonId } from './ownerSalon';
import { isValidWebsiteSlug, suggestedWebsiteSlug, slugifySalonName } from './publicWebsiteUrl';
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
import {
  activeTemplateConfigFromSalon,
  normalizeTemplateConfigs,
  sanitizeTemplateConfigForTemplate,
  templateSupportsConfig,
} from './templateConfig';

export const SALON_PUBLIC_WEBSITES_TABLE = 'salon_public_websites';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
 */
export function websiteConfigFromSalonData(data: SalonData): Partial<SalonData> {
  return {
    templateId: data.templateId,
    salonName: data.salonName,
    tagline: data.tagline,
    ownerName: data.ownerName,
    ownerRole: data.ownerRole,
    ownerPhotoUrl: data.ownerPhotoUrl,
    yearsOfExperience: data.yearsOfExperience,
    happyCustomers: data.happyCustomers,
    about: data.about,
    phone: data.phone,
    email: data.email,
    whatsappPhone: data.whatsappPhone,
    // Keep an unconfigured owner unconfigured. In particular, never serialize
    // the demonstration salon's contact/deposit policy into a new tenant just
    // because runtime booking code has safe operational defaults.
    ...(data.contactOptions ? { contactOptions: data.contactOptions } : {}),
    ...(data.bookingRules ? { bookingRules: data.bookingRules } : {}),
    logoUrl: data.logoUrl,
    heroImageUrl: data.heroImageUrl,
    heroPosition: data.heroPosition,
    gallery: data.gallery,
    socialProfiles: data.socialProfiles,
    socialVideos: data.socialVideos,
    disabledThemeVideoIds: data.disabledThemeVideoIds,
    address: data.address,
    openingHours: data.openingHours,
    announcements: data.announcements,
    holidays: data.holidays,
    services: data.services,
    packages: data.packages,
    offers: data.offers,
    team: data.team,
    websiteAppearance: data.websiteAppearance,
    templateConfig: sanitizeTemplateConfigForTemplate(
      activeTemplateConfigFromSalon(data),
      data.templateId,
    ),
    templateConfigs: normalizeTemplateConfigs(data.templateConfigs),
    brandColor: data.brandColor,
    salonNameFont: data.salonNameFont,
    salonNameColor: data.salonNameColor,
    reviewedContent: data.reviewedContent,
    websiteCopy: data.websiteCopy,
    metaDescription: data.metaDescription,
    socialShareImageUrl: data.socialShareImageUrl,
    metaTitle: data.metaTitle,
    metaKeywords: data.metaKeywords,
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
  const { error: rpcError } = await client.rpc(SET_OWNER_WEBSITE_VISUAL_CONFIG_FN, {
    p_visual_config: visualConfig,
  });
  if (!rpcError) return;
  if (!isMissingVisualConfigRpc(rpcError.message || '')) {
    throw new Error(rpcError.message || 'Unable to save the website appearance.');
  }

  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') throw new Error('No owner salon is available.');
  const { data: row, error: loadError } = await client
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .select('config')
    .eq('salon_id', resolution.salonId)
    .single();
  if (loadError) throw new Error('Unable to load the website appearance.');
  const currentConfig = row?.config && typeof row.config === 'object' && !Array.isArray(row.config)
    ? row.config as Record<string, unknown>
    : {};
  const { error: updateError } = await client
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .update({ config: { ...currentConfig, ...visualConfig } })
    .eq('salon_id', resolution.salonId);
  if (updateError) throw new Error('Unable to save the website appearance.');
}

export async function loadOwnerWebsiteDraft(): Promise<{
  salonId: string;
  slug: string | null;
  templateKey: string | null;
  config: Partial<SalonData>;
  isPublished: boolean;
} | null> {
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') return null;
  const { data, error } = await requireSupabase()
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .select('salon_id,slug,template_key,config,is_published')
    .eq('salon_id', resolution.salonId)
    .maybeSingle();
  if (error) throw new Error('Unable to load the saved website draft.');
  if (!data) return {
    salonId: resolution.salonId,
    slug: null,
    templateKey: null,
    config: {},
    isPublished: false,
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
  };
}

export async function saveOwnerWebsiteDraft(data: SalonData): Promise<{
  salonId: string;
  slug: string;
  isPublished: boolean;
} | null> {
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') return null;
  const client = requireSupabase();
  const config = websiteConfigFromSalonData(data);
  const { data: existing, error: readError } = await client
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .select('slug,is_published')
    .eq('salon_id', resolution.salonId)
    .maybeSingle();
  if (readError) throw new Error('Unable to check the website draft.');

  const templateKey = normalizeThemeId(data.templateId) || DEFAULT_THEME_ID;

  if (existing) {
    const { data: saved, error } = await client
      .from(SALON_PUBLIC_WEBSITES_TABLE)
      // Template selection has one write authority: set_owner_salon_template.
      // A delayed business autosave must never overwrite a newer selection.
      .update({ config })
      .eq('salon_id', resolution.salonId)
      .select('slug,is_published')
      .single();
    if (error) throw new Error('Unable to save the website draft.');
    return { salonId: resolution.salonId, slug: saved.slug, isPublished: saved.is_published };
  }

  // The owner may not have chosen a public website address yet during early
  // onboarding. Derive a stable, unique-enough draft slug from the salon name
  // (the owner changes it before publishing); never hardcode one.
  const slug =
    data.websiteSlug?.trim().toLowerCase() ||
    suggestedWebsiteSlug(data) ||
    slugifySalonName(data.salonName) ||
    `salon-${resolution.salonId.slice(0, 8)}`;
  if (!isValidWebsiteSlug(slug)) {
    throw new Error('Choose a valid website slug before saving this draft.');
  }
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
    .single();
  if (error) throw new Error('Unable to create the website draft. The slug may already be in use.');
  return { salonId: resolution.salonId, slug: saved.slug, isPublished: saved.is_published };
}

export const PUBLISH_OWNER_WEBSITE_FN = 'publish_owner_salon_website';

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
