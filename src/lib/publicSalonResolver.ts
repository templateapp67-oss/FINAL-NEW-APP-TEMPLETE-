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
  'email:config->>email',
  'website_appearance:config->>websiteAppearance',
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

/**
 * Resolve a published salon through the canonical field-limited RPC. Older
 * live projects that have not applied the public-read RPC migration fall back
 * to the existing RLS-protected website row, selecting only explicit public
 * JSON fields (never the complete owner config).
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

  const location = addressParts(row.address_json);
  const publicConfig: Record<string, unknown> = {
    salonName: businessName,
    ownerName: row.owner_name,
    ownerRole: row.owner_role,
    ownerPhotoUrl: row.owner_photo_url,
    tagline: row.tagline,
    about: row.about,
    phone: row.phone,
    whatsappPhone: row.whatsapp_phone,
    email: row.email,
    websiteAppearance: row.website_appearance,
    services: row.services,
    address: row.address_json,
  };

  return {
    salon_id: salonId,
    slug: websiteSlug,
    template_key: typeof row.template_key === 'string' ? row.template_key : 'barber_mens_grooming',
    business_name: businessName,
    public_config: publicConfig,
    address: location.address,
    city: location.city,
    fallback_services: Array.isArray(row.services) ? row.services : [],
  };
}
