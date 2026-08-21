/**
 * Canonical salon-location access.
 *
 * Owner-submitted coordinates live in public.business_locations keyed by
 * salon_id. Public nearby search reads only approval_status='approved'. This
 * keeps private/pending submissions out of the public salon row and uses the
 * same location authority as the Main Website.
 */

import { requireSupabase } from './supabaseClient';
import { normalizeCoordinates, type Coordinates } from './location';

export const SALON_TABLE = 'salons';
export const SALON_LOCATION_TABLE = 'business_locations';

export interface SalonLocationRecord {
  id: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;
  locationConfirmedAt: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
}

interface SalonLocationRow {
  salon_id: string;
  address_label: string | null;
  latitude: unknown;
  longitude: unknown;
  approval_status: unknown;
  submitted_at: string | null;
}

const LOCATION_COLUMNS = 'salon_id,address_label,latitude,longitude,approval_status,submitted_at';

function approvalStatus(value: unknown): SalonLocationRecord['approvalStatus'] {
  return value === 'approved' || value === 'rejected' ? value : 'pending';
}

function mapRow(row: SalonLocationRow): SalonLocationRecord {
  const coords = normalizeCoordinates(row.latitude, row.longitude);
  const status = approvalStatus(row.approval_status);
  return {
    id: row.salon_id,
    address: row.address_label,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    // The owner explicitly confirmed this saved row. Marketplace publication
    // remains separately controlled by approvalStatus.
    locationConfirmed: status !== 'rejected',
    locationConfirmedAt: row.submitted_at,
    approvalStatus: status,
  };
}

export async function fetchSalonLocation(salonId: string): Promise<SalonLocationRecord | null> {
  const { data, error } = await requireSupabase()
    .from(SALON_LOCATION_TABLE)
    .select(LOCATION_COLUMNS)
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) {
    console.error('Failed to load saved shop location:', error);
    throw new Error('Unable to load your saved shop location.');
  }
  return data ? mapRow(data as unknown as SalonLocationRow) : null;
}

export interface SaveSalonLocationInput {
  salonId: string;
  address: string;
  latitude: number;
  longitude: number;
}

export async function saveSalonLocation(input: SaveSalonLocationInput): Promise<SalonLocationRecord> {
  const coords: Coordinates | null = normalizeCoordinates(input.latitude, input.longitude);
  if (!coords) throw new Error('Invalid coordinates — location was not saved.');
  const address = input.address.trim();
  if (!address) throw new Error('An address is required before saving.');

  const client = requireSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error('Please log in to save your shop location.');

  const { data, error } = await client
    .from(SALON_LOCATION_TABLE)
    .upsert({
      salon_id: input.salonId,
      address_label: address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      approval_status: 'pending',
      submitted_by: authData.user.id,
      submitted_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'salon_id' })
    .select(LOCATION_COLUMNS)
    .single();

  if (error) {
    console.error('Failed to save shop location:', error);
    throw new Error('Unable to save shop location. Please try again.');
  }
  return mapRow(data as unknown as SalonLocationRow);
}
