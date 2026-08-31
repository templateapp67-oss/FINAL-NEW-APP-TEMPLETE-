import type { SupabaseClient } from '@supabase/supabase-js';

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
].join(',');

function firstRow<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
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
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const rpcResult = await client.rpc('get_public_salon_website', { p_slug: normalizedSlug });
  if (!rpcResult.error) {
    return firstRow(rpcResult.data as PublicSalonProjection | PublicSalonProjection[] | null);
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
