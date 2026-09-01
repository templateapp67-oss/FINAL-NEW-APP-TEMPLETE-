import type { SupabaseClient } from '@supabase/supabase-js';
import type { GalleryImage } from '../types';
import { slugifySalonName } from './publicWebsiteUrl';

export interface PublicSalonProjection {
  salon_id: string;
  slug: string;
  template_key: string;
  business_name: string;
  public_config: Record<string, unknown>;
  address: string;
  city: string;
  fallback_services?: unknown[];
}

/**
 * Compatibility fallback projection for live projects that predate the
 * `get_public_salon_website` RPC. Mirrors the RPC's field-limited JSONB
 * whitelist (M44/M49/M52/M66) exactly: the owner identity fields are only
 * surfaced behind the owner's own `showOwnerPhoto` toggle for the active
 * template, phone/WhatsApp only behind their contactOptions switches, and
 * private fields (email, team, full config) are never selected.
 */
const PUBLIC_WEBSITE_FIELDS = [
  'salon_id',
  'slug',
  'template_key',
  'is_published',
  'salon_name:config->>salonName',
  'owner_name:config->>ownerName',
  'owner_role:config->>ownerRole',
  'owner_photo_url:config->>ownerPhotoUrl',
  'tagline:config->>tagline',
  'about:config->>about',
  'phone:config->>phone',
  'whatsapp_phone:config->>whatsappPhone',
  'contact_options:config->contactOptions',
  'booking_rules:config->bookingRules',
  'opening_hours:config->openingHours',
  'announcements:config->announcements',
  'holidays:config->holidays',
  'social_profiles:config->socialProfiles',
  'social_videos:config->socialVideos',
  'disabled_theme_video_ids:config->disabledThemeVideoIds',
  'packages:config->packages',
  'offers:config->offers',
  'website_appearance:config->>websiteAppearance',
  'brand_color:config->>brandColor',
  'salon_name_font:config->>salonNameFont',
  'salon_name_color:config->>salonNameColor',
  'hero_position:config->>heroPosition',
  'template_config:config->templateConfig',
  'template_configs:config->templateConfigs',
  'reviewed_content:config->reviewedContent',
  'website_copy:config->websiteCopy',
  'meta_description:config->>metaDescription',
  'social_share_image_url:config->>socialShareImageUrl',
  'meta_title:config->>metaTitle',
  'meta_keywords:config->>metaKeywords',
  'services:config->services',
  'address_json:config->address',
  // M68 — the owner's published brand visuals (safe URL schemes only, active
  // + non-rejected gallery items only; projected by get_public_salon_website).
  'logo_url:config->>logoUrl',
  'hero_image_url:config->>heroImageUrl',
  'gallery:config->gallery',
].join(',');

function firstRow<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * THE canonical public-slug normaliser. Every public entry point — the router
 * (`RootRouter`), the public view (`PublicSalonView`) and the resolver itself
 * — must run a requested address through this one function, so
 * `/Arts-By-Uma`, `/arts-by-uma/`, `/ARTS%20BY%20UMA` and the subdomain
 * `arts-by-uma.<base-host>` all resolve to exactly the same tenant and there
 * is never a second, subtly different slug lookup.
 *
 * It accepts a raw path (`/Arts-By-Uma/`), a bare segment or an already
 * canonical slug and mirrors `private.normalize_website_slug` in the database
 * (via {@link slugifySalonName}). An address that cannot produce a slug
 * returns `''` — never a default tenant.
 */
export function canonicalPublicSlug(value: string | null | undefined): string {
  let raw = (value || '').trim();
  if (!raw) return '';
  // Tolerate a full path or a URL-encoded segment.
  raw = raw.split('?')[0].split('#')[0];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep the raw value when it is not valid percent-encoding */
  }
  const segment = raw.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  if (!segment || !/[a-z0-9]/i.test(segment)) return '';
  return slugifySalonName(segment);
}

/**
 * Outcome of a public resolution attempt.
 *
 * `not-found` means the database answered and no published tenant owns the
 * slug. `unavailable` means the request itself failed (offline, RPC/permission
 * error, 5xx) — the visitor must NOT be told the salon does not exist, and a
 * default tenant must never be substituted.
 */
export type PublicSalonResolution =
  | { status: 'found'; slug: string; website: PublicSalonProjection }
  | { status: 'not-found'; slug: string; website: null }
  | { status: 'unavailable'; slug: string; website: null; error: unknown };

/**
 * Canonical resolution used by BOTH the router and the public view. Never
 * throws: a transport/RPC failure is reported as `unavailable` so the caller
 * can distinguish it from a genuinely missing or unpublished salon.
 */
export async function resolvePublicSalonWebsiteResult(
  client: SupabaseClient,
  slug: string,
): Promise<PublicSalonResolution> {
  const normalizedSlug = canonicalPublicSlug(slug);
  if (!normalizedSlug) return { status: 'not-found', slug: '', website: null };
  try {
    const website = await resolvePublicSalonWebsite(client, normalizedSlug);
    return website
      ? { status: 'found', slug: normalizedSlug, website }
      : { status: 'not-found', slug: normalizedSlug, website: null };
  } catch (error) {
    return { status: 'unavailable', slug: normalizedSlug, website: null, error };
  }
}

function isMissingPublicRpc(error: { code?: string; message?: string } | null): boolean {
  const message = (error?.message || '').toLowerCase();
  return error?.code === 'PGRST202'
    || error?.code === '42883'
    || message.includes('could not find the function');
}

function addressParts(value: unknown): { address: string; city: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { address: '', city: '' };
  const row = value as Record<string, unknown>;
  return {
    address: typeof row.fullAddress === 'string' ? row.fullAddress : '',
    city: typeof row.city === 'string' ? row.city : '',
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Client mirror of the database gate `nexora_owner_identity_publicly_enabled`:
 * the owner name/role/photo are public presentation content, hidden only when
 * the ACTIVE template's saved `showOwnerPhoto` setting is explicitly false
 * (same default as `shouldShowOwnerPhoto()`).
 */
export function ownerIdentityPubliclyEnabled(
  templateKey: string,
  templateConfig: unknown,
  templateConfigs: unknown,
): boolean {
  const perTemplate = asObject(asObject(templateConfigs)?.[templateKey]);
  const alias = asObject(templateConfig);
  const flag = perTemplate && Object.prototype.hasOwnProperty.call(perTemplate, 'showOwnerPhoto')
    ? perTemplate.showOwnerPhoto
    : alias?.showOwnerPhoto;
  return flag !== false;
}

/** Mirrors the RPC guard: only http(s), root-relative and data:image URLs. */
const SAFE_PUBLIC_IMAGE_SCHEME = /^(https?:\/\/|\/|\.\/|\.\.\/|data:image\/)/i;

/** Accepts an owner media URL only when it uses a safe scheme. */
export function safePublicImageUrl(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const url = value.trim();
    if (!url || !SAFE_PUBLIC_IMAGE_SCHEME.test(url)) continue;
    if (/[\u0000-\u001F\u007F]/.test(url)) continue;
    return url;
  }
  return '';
}

/**
 * Projects the publishable subset of a saved gallery (active, non-rejected,
 * safe URL only). Internal fields — storagePath, serviceId, rejectionReason —
 * never reach an anonymous visitor.
 */
export function publicGalleryItems(...sources: unknown[]): GalleryImage[] {
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const items = source
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .filter((entry) => (entry.status === undefined ? 'active' : entry.status) !== 'inactive')
      .filter((entry) => (entry.moderation === undefined ? 'approved' : entry.moderation) !== 'rejected')
      .map((entry, index) => {
        const url = safePublicImageUrl(entry.url);
        if (!url) return null;
        const beforeUrl = safePublicImageUrl(entry.beforeUrl);
        const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id : `pub-${index}`;
        return {
          id,
          url,
          alt: typeof entry.alt === 'string' ? entry.alt : undefined,
          title: typeof entry.title === 'string' ? entry.title : undefined,
          description: typeof entry.description === 'string' ? entry.description : undefined,
          category: typeof entry.category === 'string' ? entry.category : 'General',
          caption: typeof entry.caption === 'string' ? entry.caption : undefined,
          beforeUrl: beforeUrl || undefined,
          beforeAlt: beforeUrl && typeof entry.beforeAlt === 'string' ? entry.beforeAlt : undefined,
          featured: entry.featured === true,
          displayOrder: typeof entry.displayOrder === 'number' ? entry.displayOrder : index,
          themeId: typeof entry.themeId === 'string' ? entry.themeId : null,
          status: 'active' as const,
          moderation: 'approved' as const,
        } as GalleryImage;
      })
      .filter((entry): entry is GalleryImage => entry !== null)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    if (items.length > 0) return items;
  }
  return [];
}

/**
 * Resolve a published salon through the canonical field-limited RPC. Older
 * live projects that have not applied the public-read RPC migration fall back
 * to the existing RLS-protected website row, selecting only the explicit
 * public JSON fields mirrored from that RPC (never the complete owner config).
 */
export async function resolvePublicSalonWebsite(
  client: SupabaseClient,
  slug: string,
): Promise<PublicSalonProjection | null> {
  const normalizedSlug = canonicalPublicSlug(slug);
  if (!normalizedSlug) return null;

  const rpcResult = await client.rpc('get_public_salon_website', { p_slug: normalizedSlug });
  if (!rpcResult.error) {
    const projection = firstRow(rpcResult.data as PublicSalonProjection | PublicSalonProjection[] | null);
    if (!projection) return null;
    // Projects on deployments where the companion `get_public_salon_services`
    // RPC is not (yet) applied: the published config already carries the
    // owner's service list, so the live site never renders an empty catalogue.
    const configuredServices = asObject(projection.public_config)?.services;
    return {
      ...projection,
      fallback_services: Array.isArray(projection.fallback_services)
        ? projection.fallback_services
        : (Array.isArray(configuredServices) ? configuredServices : []),
    };
  }
  if (!isMissingPublicRpc(rpcResult.error)) throw rpcResult.error;

  const { data, error } = await client
    .from('salon_public_websites')
    .select(PUBLIC_WEBSITE_FIELDS)
    .eq('slug', normalizedSlug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const salonId = typeof row.salon_id === 'string' ? row.salon_id : '';
  const websiteSlug = typeof row.slug === 'string' ? row.slug : '';
  const businessName = typeof row.salon_name === 'string' ? row.salon_name : '';
  if (!salonId || !websiteSlug || !businessName) return null;

  const templateKey = typeof row.template_key === 'string' ? row.template_key : 'barber_mens_grooming';
  const location = addressParts(row.address_json);
  const contactOptions = asObject(row.contact_options);
  const ownerIdentityEnabled = ownerIdentityPubliclyEnabled(
    templateKey,
    row.template_config,
    row.template_configs,
  );
  const publicConfig: Record<string, unknown> = {
    salonName: businessName,
    // M68 — owner media parity. Only safe schemes and visible gallery items
    // are accepted here, mirroring the RPC projection.
    logoUrl: safePublicImageUrl(row.logo_url),
    heroImageUrl: safePublicImageUrl(row.hero_image_url),
    gallery: publicGalleryItems(row.gallery),
    ...(ownerIdentityEnabled ? {
      ownerName: row.owner_name,
      ownerRole: row.owner_role,
      ownerPhotoUrl: row.owner_photo_url,
    } : {}),
    tagline: row.tagline,
    about: row.about,
    // Contact details stay behind the owner's own contact switches, exactly
    // like the database RPC projection.
    ...(contactOptions?.callNow === true ? { phone: row.phone } : {}),
    ...(contactOptions?.whatsapp === true ? { whatsappPhone: row.whatsapp_phone } : {}),
    contactOptions: row.contact_options,
    bookingRules: row.booking_rules,
    openingHours: row.opening_hours,
    announcements: row.announcements,
    holidays: row.holidays,
    socialProfiles: row.social_profiles,
    socialVideos: row.social_videos,
    disabledThemeVideoIds: row.disabled_theme_video_ids,
    packages: row.packages,
    offers: row.offers,
    websiteAppearance: row.website_appearance,
    brandColor: row.brand_color,
    salonNameFont: row.salon_name_font,
    salonNameColor: row.salon_name_color,
    heroPosition: row.hero_position,
    templateConfig: row.template_config,
    templateConfigs: row.template_configs,
    reviewedContent: row.reviewed_content,
    websiteCopy: row.website_copy,
    metaDescription: row.meta_description,
    socialShareImageUrl: row.social_share_image_url,
    metaTitle: row.meta_title,
    metaKeywords: row.meta_keywords,
    services: row.services,
    address: row.address_json,
  };

  return {
    salon_id: salonId,
    slug: websiteSlug,
    template_key: templateKey,
    business_name: businessName,
    public_config: publicConfig,
    address: location.address,
    city: location.city,
    fallback_services: Array.isArray(row.services) ? row.services : [],
  };
}
