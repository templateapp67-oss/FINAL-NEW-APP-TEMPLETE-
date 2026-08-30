/**
 * Server-side Nominatim (OpenStreetMap) geocoding.
 *
 * Extracted from api-routes.ts so BOTH the public `/api/geocode/*` proxy and
 * the authoritative booking route share ONE rate-limited, cached caller —
 * the Home Service path re-geocodes the customer's address server-side and
 * never trusts browser-supplied coordinates.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';

const NOMINATIM_APP =
  process.env.NOMINATIM_APP_IDENTIFIER ||
  'NexoraSalonWebsiteBuilder/1.0 (+mailto:hello@nexorabeauty.com)';
const NOMINATIM_REFERER =
  process.env.NOMINATIM_REFERER || 'https://nexorabeauty.com';

const NOMINATIM_MIN_INTERVAL_MS = 1100;
const NOMINATIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const geocodeCache = new Map<string, { at: number; body: unknown }>();
let nominatimLastRequestAt = 0;
let nominatimQueue: Promise<unknown> = Promise.resolve();

// Server-side global rate guard: one in-flight request at a time, >= 1.1s apart.
function nominatimRateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const waitFor = nominatimLastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await delay(waitFor);
    nominatimLastRequestAt = Date.now();
    return task();
  });
  nominatimQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function callNominatim(pathAndQuery: string): Promise<unknown> {
  const cached = geocodeCache.get(pathAndQuery);
  if (cached && Date.now() - cached.at < NOMINATIM_CACHE_TTL_MS) {
    return cached.body;
  }

  const body = await nominatimRateLimited(async () => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_APP as string,
    };
    if (NOMINATIM_REFERER) headers.Referer = NOMINATIM_REFERER;

    const response = await fetch(`${NOMINATIM_BASE}${pathAndQuery}`, { headers });
    if (!response.ok) {
      throw new Error(`Nominatim responded ${response.status}`);
    }
    return response.json();
  });

  geocodeCache.set(pathAndQuery, { at: Date.now(), body });
  return body;
}

export interface ServerGeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

/**
 * Forward-geocode a free-form address into verified coordinates. Returns null
 * when the address cannot be located or the provider returns junk — the
 * booking route then rejects the Home Service request instead of guessing.
 */
export async function geocodeAddressServer(address: string): Promise<ServerGeocodeResult | null> {
  const q = (address || '').trim();
  if (q.length < 3) return null;
  let data: unknown;
  try {
    data = await callNominatim(
      `/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
    );
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const best = data[0] as { lat?: unknown; lon?: unknown; display_name?: unknown };
  const latitude = Number(best?.lat);
  const longitude = Number(best?.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return {
    latitude,
    longitude,
    displayName: typeof best.display_name === 'string' ? best.display_name : q,
  };
}
