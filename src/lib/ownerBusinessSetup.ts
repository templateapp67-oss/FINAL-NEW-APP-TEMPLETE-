/**
 * Persist owner business setup to the existing schema only.
 *
 * Canonical writes:
 *   salons.name / salons.address / salons.city
 *   organizations.name
 *   salon_public_websites.config (contact, logo, hours, booking rules, owner profile)
 *   business_locations (map pin when coordinates exist)
 *   salon_hours (weekday availability when that table accepts the live columns)
 *
 * Services/pricing stay on public.services via savedServiceService RPCs.
 * Identity is always owner_salon_ids() / auth.uid() — never a client salon id.
 */
import type { SalonData, SalonOpeningHours } from '../types';
import { resolveOwnerSalonId } from './ownerSalon';
import { requireSupabase, isSupabaseConfigured } from './supabaseClient';
import { saveOwnerWebsiteDraft } from './salonWebsiteService';
import { saveSalonLocation } from './salonLocationService';

export const SALONS_TABLE = 'salons';
export const ORGANIZATIONS_TABLE = 'organizations';
export const SALON_HOURS_TABLE = 'salon_hours';

const WEEKDAYS: Array<keyof SalonOpeningHours> = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export async function loadOwnerSalonRow(): Promise<{
  salonId: string;
  organizationId: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
} | null> {
  if (!isSupabaseConfigured) return null;
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') return null;
  const { data, error } = await requireSupabase()
    .from(SALONS_TABLE)
    .select('id, organization_id, name, address, city')
    .eq('id', resolution.salonId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    salonId: String(data.id),
    organizationId: data.organization_id ? String(data.organization_id) : null,
    name: typeof data.name === 'string' ? data.name : null,
    address: typeof data.address === 'string' ? data.address : null,
    city: typeof data.city === 'string' ? data.city : null,
  };
}

async function persistSalonHours(salonId: string, hours: SalonOpeningHours | undefined): Promise<void> {
  if (!hours) return;
  const client = requireSupabase();
  const rows = WEEKDAYS.map((key, dayOfWeek) => {
    const day = hours[key];
    return {
      salon_id: salonId,
      day_of_week: dayOfWeek,
      is_open: Boolean(day?.open),
      open_time: day?.open ? day.startTime : null,
      close_time: day?.open ? day.endTime : null,
    };
  });
  const { error } = await client
    .from(SALON_HOURS_TABLE)
    .upsert(rows, { onConflict: 'salon_id,day_of_week' });
  if (error) {
    // Live salon_hours column names are not invented here. Availability still
    // lives in salon_public_websites.config.openingHours.
    console.warn('salon_hours upsert skipped:', error.message);
  }
}

/** Write business fields to existing tables + website draft. */
export async function persistOwnerBusinessSetup(data: SalonData): Promise<{
  salonId: string;
  slug?: string;
} | { error: string }> {
  if (!isSupabaseConfigured) {
    return { error: 'Authentication is not configured.' };
  }
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') {
    return { error: 'Please log in to save your business details.' };
  }

  const client = requireSupabase();
  const name = (data.salonName || '').trim();
  const address = (data.address?.fullAddress || '').trim();
  const city = (data.address?.city || '').trim();

  const { error: salonError } = await client
    .from(SALONS_TABLE)
    .update({
      ...(name ? { name } : {}),
      address: address || null,
      city: city || null,
    })
    .eq('id', resolution.salonId);
  if (salonError) {
    console.error('Failed to update salon profile:', salonError);
    return { error: 'Unable to save your business name and address.' };
  }

  const { data: salonRow } = await client
    .from(SALONS_TABLE)
    .select('organization_id')
    .eq('id', resolution.salonId)
    .maybeSingle();
  if (salonRow?.organization_id && name) {
    const { error: orgError } = await client
      .from(ORGANIZATIONS_TABLE)
      .update({ name })
      .eq('id', salonRow.organization_id);
    if (orgError) console.warn('Organization name update skipped:', orgError.message);
  }

  const draft = await saveOwnerWebsiteDraft(data);
  await persistSalonHours(resolution.salonId, data.openingHours);

  const lat = data.address?.latitude;
  const lng = data.address?.longitude;
  if (address && typeof lat === 'number' && typeof lng === 'number') {
    try {
      await saveSalonLocation({
        salonId: resolution.salonId,
        address,
        latitude: lat,
        longitude: lng,
      });
    } catch (error) {
      console.warn('business_locations save skipped:', error);
    }
  }

  return { salonId: resolution.salonId, slug: draft?.slug };
}

/** Overlay DB salon name/address/city onto the in-memory draft. */
export function mergeSalonRowIntoDraft(
  data: SalonData,
  row: Awaited<ReturnType<typeof loadOwnerSalonRow>>,
): SalonData {
  if (!row) return data;
  return {
    ...data,
    salonId: row.salonId,
    salonName: row.name?.trim() || data.salonName,
    address: {
      ...(data.address || {
        fullAddress: '',
        area: '',
        city: '',
        state: '',
        pinCode: '',
      }),
      fullAddress: row.address?.trim() || data.address?.fullAddress || '',
      city: row.city?.trim() || data.address?.city || '',
    },
  };
}
