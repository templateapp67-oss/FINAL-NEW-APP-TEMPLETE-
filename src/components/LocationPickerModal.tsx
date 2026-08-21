import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { MapPin, Search, X, Check, Loader2, AlertCircle, Move } from 'lucide-react';
import {
  geocodeAddress,
  reverseGeocode,
  normalizeCoordinates,
  type Coordinates,
} from '../lib/location';

/**
 * Leaflet is browser-only. This project is Vite + React (no SSR today), but the
 * map is still loaded lazily so no Leaflet code is imported or evaluated until
 * the modal is actually opened in the browser. This keeps it safe if the app is
 * ever rendered on a server, and is the Vite equivalent of
 * next/dynamic(..., { ssr: false }).
 */
const LocationMap = lazy(() => import('./LocationMap'));

export interface ConfirmedLocation {
  address: string;
  latitude: number;
  longitude: number;
}

interface Props {
  open: boolean;
  initialAddress: string;
  initialLatitude?: number;
  initialLongitude?: number;
  onCancel: () => void;
  /** May be async (e.g. a Supabase write); the modal awaits it. */
  onConfirm: (location: ConfirmedLocation) => void | Promise<void>;
}

// Used only as an initial map view when nothing has been saved yet.
const FALLBACK_VIEW: Coordinates = { latitude: 26.9124, longitude: 75.7873 };

export default function LocationPickerModal({
  open,
  initialAddress,
  initialLatitude,
  initialLongitude,
  onCancel,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState(initialAddress);
  const [resolvedAddress, setResolvedAddress] = useState(initialAddress);
  const [coords, setCoords] = useState<Coordinates | null>(
    normalizeCoordinates(initialLatitude, initialLongitude),
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Re-hydrate from the saved record every time the modal is reopened, so a
  // previously confirmed address + marker position always come back.
  useEffect(() => {
    if (!open) return;
    setQuery(initialAddress);
    setResolvedAddress(initialAddress);
    setCoords(normalizeCoordinates(initialLatitude, initialLongitude));
    setError(null);
    setShowSaveDialog(false);
  }, [open, initialAddress, initialLatitude, initialLongitude]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  /** Forward geocoding — only from this explicit click. Never while typing. */
  const handleFindLocation = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setError('Please enter your business address.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setError(null);
    try {
      const result = await geocodeAddress(q, controller.signal);
      if (!result) {
        setError('Location not found. Please enter a more complete address.');
        return;
      }
      setCoords({ latitude: result.latitude, longitude: result.longitude });
      setResolvedAddress(result.displayName);
      setQuery(result.displayName);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('Location not found. Please enter a more complete address.');
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Fired once per completed drag by Leaflet's `dragend`.
   * This is the ONLY place reverse geocoding is triggered.
   */
  const handleDragEnd = async (latitude: number, longitude: number) => {
    const next = normalizeCoordinates(latitude, longitude);
    if (!next) return;
    setCoords(next);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsReversing(true);
    setError(null);
    try {
      const result = await reverseGeocode(next.latitude, next.longitude, controller.signal);
      if (result) {
        setResolvedAddress(result.displayName);
        setQuery(result.displayName);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Coordinates are still valid; only the label lookup failed.
      // Reverse geocoding is optional: the dragged coordinates remain valid
      // and saveable, so the owner's manual choice is never discarded.
      setError('Pin position saved. The address label could not be refreshed.');
    } finally {
      setIsReversing(false);
    }
  };

  /** Step 1: open the "SAVE YOUR SHOP LOCATION?" confirmation dialog. */
  const handleConfirm = () => {
    if (!coords) {
      setError('Find your location on the map before confirming.');
      return;
    }
    setError(null);
    setShowSaveDialog(true);
  };

  /** Step 2: the owner pressed [ Save Shop Location ]. */
  const handleSaveShopLocation = async () => {
    if (!coords) return;
    setIsSaving(true);
    setError(null);
    try {
      // The parent verifies the session, resolves the owner's salon, persists
      // to Supabase and closes the modal on success.
      await onConfirm({
        address: (resolvedAddress || query).trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setShowSaveDialog(false);
    } catch (err) {
      setShowSaveDialog(false);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save shop location. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const view = coords ?? FALLBACK_VIEW;
  const busy = isSearching || isReversing;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#1a1c1c]">
            <MapPin className="h-5 w-5 text-[#ac0053]" /> Set your salon location
          </h2>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Address + Find Location */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#1a1c1c]">
              Business address
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleFindLocation();
                  }
                }}
                rows={2}
                placeholder="e.g. Shop 8, Vaishali Nagar, Jaipur, Rajasthan 302021"
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-[#1a1c1c] outline-none transition-all placeholder:text-gray-400 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1]"
              />
              <button
                onClick={() => void handleFindLocation()}
                disabled={busy}
                className="flex h-fit items-center justify-center gap-2 self-start rounded-xl bg-[#ac0053] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b] disabled:cursor-not-allowed disabled:opacity-60 sm:self-stretch"
              >
                {isSearching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                <span className="whitespace-nowrap">
                  {isSearching ? 'Finding...' : 'Find Location'}
                </span>
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Search runs only when you press Find Location.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Map */}
          <div className="relative h-72 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map...
                </div>
              }
            >
              <LocationMap
                latitude={view.latitude}
                longitude={view.longitude}
                onDragEnd={(lat, lng) => void handleDragEnd(lat, lng)}
              />
            </Suspense>

            {isReversing && (
              <div className="pointer-events-none absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 shadow-sm">
                <Loader2 className="h-3 w-3 animate-spin text-[#ac0053]" />
                Updating address...
              </div>
            )}
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Move className="h-3.5 w-3.5 text-[#ac0053]" />
            Drag the pin to your exact doorway. The address updates when you drop it.
          </p>

          {/* Confirmation summary */}
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Confirm these details
            </div>
            <div className="text-sm font-medium text-[#1a1c1c]">
              {resolvedAddress || <span className="text-gray-400">No address selected yet</span>}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-gray-600">
              <span>Lat: {coords ? coords.latitude.toFixed(6) : '—'}</span>
              <span>Lng: {coords ? coords.longitude.toFixed(6) : '—'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!coords || busy || isSaving}
            className="flex items-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Confirm Location
          </button>
        </div>
      </div>

      {/* Save confirmation dialog */}
      {showSaveDialog && coords && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#1a1c1c]">
              Save your shop location?
            </h3>

            <dl className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Address
                </dt>
                <dd className="mt-0.5 text-[#1a1c1c]">
                  {resolvedAddress || query}
                </dd>
              </div>
              <div className="flex gap-8">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    Latitude
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs text-[#1a1c1c]">
                    {coords.latitude.toFixed(6)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    Longitude
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs text-[#1a1c1c]">
                    {coords.longitude.toFixed(6)}
                  </dd>
                </div>
              </div>
            </dl>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                disabled={isSaving}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveShopLocation()}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isSaving ? 'Saving...' : 'Save Shop Location'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
