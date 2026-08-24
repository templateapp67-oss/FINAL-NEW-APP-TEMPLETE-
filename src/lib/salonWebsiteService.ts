import type { SalonData } from '../types';
import { resolveOwnerSalonId } from './ownerSalon';
import { isValidWebsiteSlug, suggestedWebsiteSlug, slugifySalonName } from './publicWebsiteUrl';
import { requireSupabase } from './supabaseClient';
import { DEFAULT_THEME_ID, normalizeThemeId } from './themeServices';

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
    contactOptions: data.contactOptions,
    bookingRules: data.bookingRules,
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
  return {
    salonId: data.salon_id,
    slug: optionalString(data.slug) || null,
    templateKey: optionalString(data.template_key) || null,
    config: data.config && typeof data.config === 'object' && !Array.isArray(data.config)
      ? data.config as Partial<SalonData>
      : {},
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
      .update({ config, template_key: templateKey })
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

/** Publish the authenticated owner's salon website. Salon id is resolved in the database. */
export async function publishOwnerSalonWebsite(data: SalonData): Promise<{
  salonId: string;
  slug: string;
  isPublished: boolean;
  publishedAt: string | null;
}> {
  const slug = data.websiteSlug?.trim().toLowerCase();
  if (!isValidWebsiteSlug(slug)) {
    throw new Error('Choose a valid website address before publishing.');
  }
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
