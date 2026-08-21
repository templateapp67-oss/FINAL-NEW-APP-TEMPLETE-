/**
 * Single source of truth for salon location logic.
 *
 * Coordinates live on the existing `SalonAddress` record (see src/types.ts):
 *   fullAddress + latitude + longitude
 * The owner editor writes them; the customer nearby search reads them.
 * No parallel location data structure exists.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** A geocoding result as returned by our Nominatim proxy. */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

/* ------------------------------------------------------------------ *
 * Coordinate validation
 * ------------------------------------------------------------------ */

/**
 * Coerce an unknown value (string from a form, numeric/text DB column,
 * JSON payload) into a finite number, or null when it cannot be trusted.
 * Empty strings, null, undefined, booleans and NaN all yield null.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isValidLatitude(value: unknown): boolean {
  const n = toFiniteNumber(value);
  return n !== null && n >= -90 && n <= 90;
}

export function isValidLongitude(value: unknown): boolean {
  const n = toFiniteNumber(value);
  return n !== null && n >= -180 && n <= 180;
}

/**
 * Validate and normalise a coordinate pair before it is saved or used in a
 * distance calculation. Returns null if either value is missing, non-finite
 * or out of range — this is the only gate NaN needs to pass through.
 */
export function normalizeCoordinates(
  latitude: unknown,
  longitude: unknown,
): Coordinates | null {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

/* ------------------------------------------------------------------ *
 * Haversine distance
 * ------------------------------------------------------------------ */

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Straight-line (great-circle) distance in kilometres between two points.
 * No routing/driving distance and no network calls.
 * Returns null when either point is invalid, so NaN can never propagate.
 */
export function haversineDistanceKm(
  from: { latitude: unknown; longitude: unknown },
  to: { latitude: unknown; longitude: unknown },
): number | null {
  const a = normalizeCoordinates(from.latitude, from.longitude);
  const b = normalizeCoordinates(to.latitude, to.longitude);
  if (!a || !b) return null;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const distance = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  return Number.isFinite(distance) ? distance : null;
}

/** Format a km distance for display. */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/* ------------------------------------------------------------------ *
 * Nearby search (radius filter + nearest-first sort)
 * ------------------------------------------------------------------ */

export const RADIUS_OPTIONS_KM = [1.5, 2, 5] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number];

/** Minimum shape a record needs to take part in the nearby search. */
export interface LocatableSalon {
  latitude: unknown;
  longitude: unknown;
}

export type WithDistance<T> = T & { distanceKm: number };

/**
 * Filter a salon list to those within `radiusKm` of the customer and sort
 * nearest -> farthest. Records with missing/invalid coordinates are skipped
 * rather than sorted to the end, so no NaN enters the comparator.
 */
export function findNearbySalons<T extends LocatableSalon>(
  customer: { latitude: unknown; longitude: unknown },
  salons: readonly T[],
  radiusKm: number,
): WithDistance<T>[] {
  const origin = normalizeCoordinates(customer.latitude, customer.longitude);
  if (!origin) return [];

  const withDistance: WithDistance<T>[] = [];

  for (const salon of salons) {
    const distanceKm = haversineDistanceKm(origin, salon);
    if (distanceKm === null) continue; // invalid coordinates -> ignored
    if (distanceKm > radiusKm) continue;
    withDistance.push({ ...salon, distanceKm });
  }

  return withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
}

/* ------------------------------------------------------------------ *
 * Nominatim client (via our own server proxy)
 * ------------------------------------------------------------------ */

/**
 * Nominatim usage policy: absolute maximum of 1 request per second, and the
 * application must be identifiable. Browsers do not permit setting
 * User-Agent, so requests go through this app's Express proxy, which sets a
 * real identifying User-Agent + Referer server-side and caches results.
 * See: https://operations.osmfoundation.org/policies/nominatim/
 */
const MIN_REQUEST_INTERVAL_MS = 1100;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serialise all Nominatim calls and space them at least 1.1s apart,
 * app-wide, regardless of how many components call in.
 */
function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const waitFor = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (waitFor > 0) await sleep(waitFor);
    lastRequestAt = Date.now();
    return task();
  });
  // Keep the chain alive even if a call rejects.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding request failed (${res.status})`);
  return (await res.json()) as T;
}

/**
 * Forward geocoding — address -> coordinates.
 * Only ever called from an explicit "Find Location" click. Never on keystroke,
 * never as autocomplete.
 */
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (q.length < 3) return null;

  return rateLimited(async () => {
    const data = await requestJson<
      { lat: string; lon: string; display_name: string }[]
    >(`/api/geocode/search?q=${encodeURIComponent(q)}`, signal);

    if (!Array.isArray(data) || data.length === 0) return null;
    const best = data[0];
    const coords = normalizeCoordinates(best.lat, best.lon);
    if (!coords) return null;

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      displayName: best.display_name ?? q,
    };
  });
}

/**
 * Reverse geocoding — coordinates -> address.
 * Only ever called once, after a completed marker `dragend`. Never during
 * the drag itself.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const coords = normalizeCoordinates(latitude, longitude);
  if (!coords) return null;

  return rateLimited(async () => {
    const data = await requestJson<{
      lat?: string;
      lon?: string;
      display_name?: string;
      error?: string;
    }>(
      `/api/geocode/reverse?lat=${coords.latitude}&lon=${coords.longitude}`,
      signal,
    );

    if (!data || data.error || !data.display_name) return null;

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      displayName: data.display_name,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Browser geolocation (customer side only)
 * ------------------------------------------------------------------ */

/**
 * Customer "Use My Location". The owner location flow must never call this.
 */
export function getBrowserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = normalizeCoordinates(
          pos.coords.latitude,
          pos.coords.longitude,
        );
        if (!coords) {
          reject(new Error('Received invalid coordinates from your device.'));
          return;
        }
        resolve(coords);
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enter your address instead.'
            : 'Could not get your location. Enter your address instead.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
