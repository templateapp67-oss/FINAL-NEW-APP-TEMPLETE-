/**
 * Data access for salon location, against the LIVE existing schema.
 *
 * AUTHORITATIVE LOCATION COLUMNS (public.salons):
 *   address                 text          <- legacy group
 *   latitude                numeric       <- ONLY coordinate columns that exist
 *   longitude               numeric
 *   location_confirmed      boolean       <- newer group (confirmation only)
 *   location_confirmed_at   timestamptz
 *
 * Why this set:
 *   - `location_latitude` / `location_longitude` DO NOT EXIST in the live
 *     schema (verified: 42703). `latitude`/`longitude` are the only
 *     coordinate columns, and they belong to the legacy group.
 *   - The application's own salon address model (src/types.ts SalonAddress:
 *     fullAddress/area/city/state/pinCode) maps to the legacy group, and the
 *     public catalogue reads `address`/`city`.
 *   - `location_confirmed` / `location_confirmed_at` have no legacy
 *     equivalent, so they are used for confirmation state only.
 *
 * The newer descriptive columns (location_address, location_city,
 * location_area, location_zone, location_landmark, location_pincode,
 * location_accuracy_m, location_source) are intentionally NOT written, so
 * two parallel location systems are never maintained.
 *
 * No migrations, no new tables or columns, no RLS changes.
 */

import { requireSupabase } from './supabaseClient';
import { normalizeCoordinates, type Coordinates } from './location';

export const SALON_TABLE = 'salons';

/** Location shape as stored on the salon row. */
export interface SalonLocationRecord {
  id: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;
  locationConfirmedAt: string | null;
}

/** Raw row as PostgREST returns it (numeric columns may arrive as strings). */
interface SalonLocationRow {
  id: string;
  address: string | null;
  latitude: unknown;
  longitude: unknown;
  location_confirmed: unknown;
  location_confirmed_at: string | null;
}

const LOCATION_COLUMNS = 'id, address, latitude, longitude, location_confirmed, location_confirmed_at';

function mapRow(row: SalonLocationRow): SalonLocationRecord {
  const coords = normalizeCoordinates(row.latitude, row.longitude);
  return {
    id: row.id,
    address: row.address,
    latitude: coords ? coords.latitude : null,
    longitude: coords ? coords.longitude : null,
    locationConfirmed: row.location_confirmed === true,
    locationConfirmedAt: row.location_confirmed_at,
  };
}

/** Load one salon's saved location so the editor can reopen it. */
export async function fetchSalonLocation(
  salonId: string,
): Promise<SalonLocationRecord | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from(SALON_TABLE)
    .select(LOCATION_COLUMNS)
    .eq('id', salonId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('Failed to load saved shop location:', error);
    throw new Error('Unable to load your saved shop location.');
  }
  if (!data) return null;
  return mapRow(data as unknown as SalonLocationRow);
}

export interface SaveSalonLocationInput {
  salonId: string;
  address: string;
  latitude: number;
  longitude: number;
}

/**
 * Persist the confirmed address + coordinates onto the existing salon row.
 * Coordinates are validated and sent as real numbers, matching the numeric
 * column type (never stringified).
 */
export async function saveSalonLocation(
  input: SaveSalonLocationInput,
): Promise<SalonLocationRecord> {
  const coords: Coordinates | null = normalizeCoordinates(
    input.latitude,
    input.longitude,
  );
  if (!coords) {
    throw new Error('Invalid coordinates — location was not saved.');
  }

  const address = input.address.trim();
  if (!address) {
    throw new Error('An address is required before saving.');
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from(SALON_TABLE)
    .update({
      address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      location_confirmed: true,
      location_confirmed_at: new Date().toISOString(),
    })
    .eq('id', input.salonId)
    .is('deleted_at', null)
    .select(LOCATION_COLUMNS)
    .maybeSingle();

  if (error) {
    // Technical detail to the console only; RLS/permission errors must not
    // leak database internals into the UI.
    console.error('Failed to save shop location:', error);
    throw new Error('Unable to save shop location. Please try again.');
  }
  if (!data) {
    throw new Error('Unable to save shop location. Please try again.');
  }
  return mapRow(data as unknown as SalonLocationRow);
}
