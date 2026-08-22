import type { SalonData } from '../types';
import { resolveOwnerSalonId } from './ownerSalon';
import { requireSupabase } from './supabaseClient';

export const SALON_PUBLIC_WEBSITES_TABLE = 'salon_public_websites';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Only website-copy/theme preferences belong in the public config JSON. */
export function websiteConfigFromSalonData(data: SalonData): Partial<SalonData> {
  return {
    templateId: data.templateId,
    tagline: data.tagline,
    ownerName: data.ownerName,
    ownerRole: data.ownerRole,
    about: data.about,
    phone: data.phone,
    email: data.email,
    whatsappPhone: data.whatsappPhone,
    contactOptions: data.contactOptions,
    bookingRules: data.bookingRules,
    socialProfiles: data.socialProfiles,
    socialVideos: data.socialVideos,
    announcements: data.announcements,
    holidays: data.holidays,
    websiteAppearance: data.websiteAppearance,
    brandColor: data.brandColor,
    salonNameFont: data.salonNameFont,
    salonNameColor: data.salonNameColor,
    reviewedContent: data.reviewedContent,
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
}> {
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') throw new Error('A single owned salon is required to save this website.');
  const client = requireSupabase();
  const config = websiteConfigFromSalonData(data);
  const { data: existing, error: readError } = await client
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .select('slug,is_published')
    .eq('salon_id', resolution.salonId)
    .maybeSingle();
  if (readError) throw new Error('Unable to check the website draft.');

  if (existing) {
    const { data: saved, error } = await client
      .from(SALON_PUBLIC_WEBSITES_TABLE)
      .update({ config, template_key: data.templateId || 'hair' })
      .eq('salon_id', resolution.salonId)
      .select('slug,is_published')
      .single();
    if (error) throw new Error('Unable to save the website draft.');
    return { salonId: resolution.salonId, slug: saved.slug, isPublished: saved.is_published };
  }

  const slug = data.websiteSlug?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Choose a valid website slug before saving this draft.');
  }
  const { data: saved, error } = await client
    .from(SALON_PUBLIC_WEBSITES_TABLE)
    .insert({
      salon_id: resolution.salonId,
      slug,
      template_key: data.templateId || 'hair',
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
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
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
