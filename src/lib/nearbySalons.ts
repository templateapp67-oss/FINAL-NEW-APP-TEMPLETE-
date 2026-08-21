/**
 * Customer nearby-salon search, against the LIVE existing schema.
 *
 * Reads approved coordinates from public.business_locations and joins only the
 * safe public card fields from public.salons. Pending/rejected coordinates are
 * never exposed. Distance is a
 * JavaScript Haversine calculation — no routing API, no PostGIS, no RPC, and
 * no per-salon geocoding request.
 */

import { requireSupabase } from './supabaseClient';
import { SALON_LOCATION_TABLE } from './salonLocationService';

export const PUBLIC_SALON_CATALOG_VIEW = 'public_salon_catalog';
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

/**
 * Fetch only salons that can actually take part in a distance search:
 * coordinates present, and location confirmed (the live schema has a
 * `location_confirmed` column, so it is used here).
 */
export async function fetchLocatableSalons(): Promise<NearbySalonRecord[]> {
  const client = requireSupabase();

  // Coordinates come only from the approved public-location table. Pending or
  // rejected owner submissions never enter the distance calculation.
  const { data: locations, error: locationError } = await client
    .from(SALON_LOCATION_TABLE)
    .select('salon_id,address_label,latitude,longitude,approval_status')
    .eq('approval_status', 'approved');
  if (locationError) {
    console.error('Failed to load approved salon locations:', locationError);
    const code = (locationError as { code?: string }).code;
    if (code === '42501' || code === 'PGRST301') throw new NearbySalonsPermissionError();
    throw new Error('Unable to load nearby salons right now. Please try again.');
  }

  const locationRows = (locations ?? []) as Array<{
    salon_id: string;
    address_label: string | null;
    latitude: unknown;
    longitude: unknown;
    approval_status: string;
  }>;
  const salonIds = Array.from(new Set(locationRows.map((row) => row.salon_id).filter(Boolean)));
  if (salonIds.length === 0) return [];

  const { data: salons, error: salonError } = await client
    .from(PUBLIC_SALON_CATALOG_VIEW)
    .select('id,name,address,city,slug')
    .in('id', salonIds);
  if (salonError) {
    console.error('Failed to load public salon cards:', salonError);
    const code = (salonError as { code?: string }).code;
    if (code === '42501' || code === 'PGRST301') throw new NearbySalonsPermissionError();
    throw new Error('Unable to load nearby salons right now. Please try again.');
  }

  const locationBySalon = new Map(locationRows.map((row) => [row.salon_id, row]));
  return ((salons ?? []) as Array<{
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    slug: string | null;
  }>).flatMap((salon) => {
    const location = locationBySalon.get(salon.id);
    if (!location || location.approval_status !== 'approved') return [];
    return [{
      ...salon,
      address: location.address_label || salon.address,
      latitude: location.latitude,
      longitude: location.longitude,
    } satisfies NearbySalonRecord];
  });
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
