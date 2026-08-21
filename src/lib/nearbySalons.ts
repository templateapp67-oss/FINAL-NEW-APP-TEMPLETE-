/**
 * Customer nearby-salon search, against the LIVE existing schema.
 *
 * Reads the SAME canonical columns the owner editor writes on public.salons:
 *   address + latitude + longitude (+ location_confirmed)
 *
 * Only coordinate-bearing, confirmed salons are fetched, and only the columns
 * the salon cards plus the distance calculation actually need. Distance is a
 * JavaScript Haversine calculation — no routing API, no PostGIS, no RPC, and
 * no per-salon geocoding request.
 */

import { requireSupabase } from './supabaseClient';
import { SALON_TABLE } from './salonLocationService';
import {
  findNearbySalons,
  normalizeCoordinates,
  type RadiusKm,
  type WithDistance,
} from './location';

/**
 * Minimal shape the nearby list needs. Coordinates are `unknown` on input
 * because PostgREST may return numeric columns as numbers or strings; they
 * are normalised before any arithmetic.
 */
export interface NearbySalonRecord {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  slug: string | null;
  latitude: unknown;
  longitude: unknown;
}

export type NearbySalon = WithDistance<NearbySalonRecord>;

/**
 * Raised when the database refuses the public read (missing GRANT or an RLS
 * policy). Surfaced to the customer as a friendly message; the UI must not
 * crash and must not attempt to bypass security.
 */
export class NearbySalonsPermissionError extends Error {
  constructor() {
    super('Unable to load nearby salons right now. Please try again.');
    this.name = 'NearbySalonsPermissionError';
  }
}

/** Only the fields the cards/search UI and the distance maths require. */
const NEARBY_COLUMNS = 'id, name, address, city, slug, latitude, longitude';

/**
 * Fetch only salons that can actually take part in a distance search:
 * coordinates present, and location confirmed (the live schema has a
 * `location_confirmed` column, so it is used here).
 */
export async function fetchLocatableSalons(): Promise<NearbySalonRecord[]> {
  const client = requireSupabase();
  // Mirrors the existing `salons_anon_catalogue_select` policy conditions
  // (is_active = true AND deleted_at IS NULL) so the query matches what the
  // policy already permits. The policy remains the security boundary; this
  // filter is not a substitute for it.
  const { data, error } = await client
    .from(SALON_TABLE)
    .select(NEARBY_COLUMNS)
    .eq('is_active', true)
    .is('deleted_at', null)
    .eq('location_confirmed', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) {
    // Log technical detail; never surface SQL/keys/DB internals to customers.
    console.error('Failed to load nearby salons:', error);
    const code = (error as { code?: string }).code;
    if (code === '42501' || code === 'PGRST301') {
      throw new NearbySalonsPermissionError();
    }
    throw new Error('Unable to load nearby salons right now. Please try again.');
  }
  return (data ?? []) as unknown as NearbySalonRecord[];
}

/**
 * Drop records that can never take part in a distance calculation.
 * Runs before Haversine so NaN/null coordinates never reach the comparator.
 */
export function withValidCoordinates(
  salons: readonly NearbySalonRecord[],
): NearbySalonRecord[] {
  return salons.filter(
    (s) => normalizeCoordinates(s.latitude, s.longitude) !== null,
  );
}

/**
 * Full nearby search: load confirmed salons, discard invalid coordinates,
 * compute straight-line Haversine distance in km, apply the radius
 * (1.5 / 2 / 5 km) and sort nearest first.
 *
 * `loader` is injectable for testing; it defaults to the live query.
 */
export async function searchNearbySalons(
  customer: { latitude: unknown; longitude: unknown },
  radiusKm: RadiusKm | number,
  loader: () => Promise<NearbySalonRecord[]> = fetchLocatableSalons,
): Promise<NearbySalon[]> {
  const origin = normalizeCoordinates(customer.latitude, customer.longitude);
  if (!origin) return [];

  const salons = await loader();
  const usable = withValidCoordinates(salons);

  return findNearbySalons(origin, usable, radiusKm);
}
