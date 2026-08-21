import { useCallback, useState } from 'react';
import { MapPin, Crosshair, Loader2, AlertCircle, Search } from 'lucide-react';
import {
  getBrowserLocation,
  geocodeAddress,
  formatDistanceKm,
  normalizeCoordinates,
  RADIUS_OPTIONS_KM,
  type Coordinates,
  type RadiusKm,
} from '../lib/location';
import {
  searchNearbySalons,
  NearbySalonsPermissionError,
  type NearbySalon,
} from '../lib/nearbySalons';

/**
 * Public customer nearby-salon search.
 *
 * Reads the same canonical salon columns the owner editor writes
 * (address + latitude + longitude, filtered on location_confirmed).
 * Distance is straight-line Haversine in kilometres — no routing API and
 * no per-salon geocoding.
 */
export default function NearbySalonSearch() {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(2);
  const [results, setResults] = useState<NearbySalon[] | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (origin: Coordinates, radius: RadiusKm) => {
      setIsSearching(true);
      setError(null);
      try {
        const found = await searchNearbySalons(origin, radius);
        setResults(found);
      } catch (err) {
        setResults(null);
        setError(
          err instanceof NearbySalonsPermissionError
            ? err.message
            : 'Unable to load nearby salons right now. Please try again.',
        );
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  /** Primary: browser geolocation. Customer side only. */
  const handleUseMyLocation = async () => {
    setIsLocating(true);
    setError(null);
    try {
      const origin = await getBrowserLocation();
      setCoords(origin);
      await runSearch(origin, radiusKm);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Location permission is required to find nearby salons.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  /** Optional fallback: explicit address search. Never autocomplete. */
  const handleAddressSearch = async () => {
    const q = addressQuery.trim();
    if (q.length < 3) {
      setError('Please enter your area or address.');
      return;
    }
    setIsLocating(true);
    setError(null);
    try {
      const result = await geocodeAddress(q);
      const origin = result && normalizeCoordinates(result.latitude, result.longitude);
      if (!origin) {
        setError('Location not found. Please enter a more complete address.');
        return;
      }
      setCoords(origin);
      await runSearch(origin, radiusKm);
    } catch {
      setError('Unable to determine your location.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleRadiusChange = async (next: RadiusKm) => {
    setRadiusKm(next);
    if (coords) await runSearch(coords, next);
  };

  const busy = isLocating || isSearching;

  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[#1a1c1c]">
          <MapPin className="h-5 w-5 text-[#ac0053]" /> Find salons near you
        </h2>
        <p className="text-sm text-[#5f5e5e]">
          Share your location or enter your area to see the closest salons.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => void handleUseMyLocation()}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#ac0053] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLocating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Crosshair className="h-3.5 w-3.5" />
          )}
          Use My Location
        </button>

        <div className="flex flex-1 gap-2">
          <input
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddressSearch();
              }
            }}
            placeholder="Or enter your area / address"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm outline-none transition-all focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1]"
          />
          <button
            onClick={() => void handleAddressSearch()}
            disabled={busy}
            aria-label="Search this address"
            className="rounded-xl border border-gray-300 px-4 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Radius filters */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">Within</span>
        {RADIUS_OPTIONS_KM.map((r) => (
          <button
            key={r}
            onClick={() => void handleRadiusChange(r)}
            disabled={busy}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
              radiusKm === r
                ? 'border-[#ac0053] bg-[#ffd9e1]/50 text-[#ac0053]'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {r} km
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isSearching && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding salons near you...
        </div>
      )}

      {/* Results — already sorted nearest first */}
      {!isSearching && results !== null && (
        results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-4 text-sm text-gray-500">
            No salons found within this distance.
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((salon) => (
              <li
                key={salon.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#1a1c1c]">
                    {salon.name ?? 'Salon'}
                  </p>
                  {salon.address && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {salon.address}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-lg bg-[#ffd9e1]/50 px-2.5 py-1 text-xs font-bold text-[#ac0053]">
                  {formatDistanceKm(salon.distanceKm)} away
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
