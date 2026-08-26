import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Maximize2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  geocodeAddress,
  normalizeCoordinates,
  type Coordinates,
} from '../lib/location';

// Lazy-load Leaflet map component so it's loaded only in browser environment
const LocationMap = lazy(() => import('./LocationMap'));

// Default fallback coordinates (Jaipur, India / standard center)
const DEFAULT_COORDS: Coordinates = { latitude: 19.076, longitude: 72.8777 }; // Mumbai center

interface LocationMapPreviewProps {
  address: string;
  latitude?: number;
  longitude?: number;
  salonName?: string;
  isGeocoding?: boolean;
  onChangeCoordinates?: (latitude: number, longitude: number) => void;
  onOpenFullPicker?: () => void;
  className?: string;
}

export default function LocationMapPreview({
  address,
  latitude,
  longitude,
  salonName,
  isGeocoding: externalIsGeocoding,
  onChangeCoordinates,
  onOpenFullPicker,
  className = '',
}: LocationMapPreviewProps) {
  // Normalize given coordinates if valid
  const initialCoords = normalizeCoordinates(latitude, longitude);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(initialCoords);
  const [internalIsGeocoding, setInternalIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [lastGeocodedAddress, setLastGeocodedAddress] = useState<string>('');
  const [manualAdjusted, setManualAdjusted] = useState(false);

  const isGeocoding = externalIsGeocoding ?? internalIsGeocoding;

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Sync state when props change
  useEffect(() => {
    const next = normalizeCoordinates(latitude, longitude);
    if (next) {
      setCurrentCoords(next);
      setGeocodeError(null);
    }
  }, [latitude, longitude]);

  // Debounced auto-geocoding when the owner changes the address text
  useEffect(() => {
    const trimmed = (address || '').trim();
    if (!trimmed || trimmed.length < 4) {
      return;
    }

    // Skip if address matches the one we already geocoded or if user just manually dragged pin
    if (trimmed === lastGeocodedAddress) {
      return;
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    // Debounce for 900ms to avoid excessive requests while typing
    debounceTimerRef.current = window.setTimeout(async () => {
      // Only auto-geocode if no coordinates exist yet or if address distinctly changed
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsGeocoding(true);
      setGeocodeError(null);

      try {
        const result = await geocodeAddress(trimmed, controller.signal);
        if (result) {
          const newCoords: Coordinates = {
            latitude: result.latitude,
            longitude: result.longitude,
          };
          setCurrentCoords(newCoords);
          setLastGeocodedAddress(trimmed);
          setManualAdjusted(false);
          if (onChangeCoordinates) {
            onChangeCoordinates(result.latitude, result.longitude);
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('Map preview geocoding failed:', err);
      } finally {
        setIsGeocoding(false);
      }
    }, 900);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [address, lastGeocodedAddress, onChangeCoordinates]);

  // Manual trigger to re-center / geocode current address
  const handleRefreshLocation = async () => {
    const trimmed = (address || '').trim();
    if (!trimmed || trimmed.length < 3) {
      setGeocodeError('Please enter a business address above first.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGeocoding(true);
    setGeocodeError(null);

    try {
      const result = await geocodeAddress(trimmed, controller.signal);
      if (result) {
        const newCoords: Coordinates = {
          latitude: result.latitude,
          longitude: result.longitude,
        };
        setCurrentCoords(newCoords);
        setLastGeocodedAddress(trimmed);
        setManualAdjusted(false);
        if (onChangeCoordinates) {
          onChangeCoordinates(result.latitude, result.longitude);
        }
      } else {
        setGeocodeError('Could not pinpoint address on map. You can position the pin manually.');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setGeocodeError('Geocoding service unavailable. Try setting the pin manually.');
    } finally {
      setIsGeocoding(false);
    }
  };

  // Handle direct pin drag on the map preview
  const handlePinDragEnd = (newLat: number, newLng: number) => {
    const coords = normalizeCoordinates(newLat, newLng);
    if (!coords) return;
    setCurrentCoords(coords);
    setManualAdjusted(true);
    setGeocodeError(null);
    if (onChangeCoordinates) {
      onChangeCoordinates(coords.latitude, coords.longitude);
    }
  };

  const activeCoords = currentCoords || DEFAULT_COORDS;
  const hasActivePin = Boolean(currentCoords);

  return (
    <div
      className={`rounded-2xl border border-gray-200/90 bg-white shadow-xs overflow-hidden transition-all ${className}`}
      id="location-map-preview-card"
    >
      {/* Top Bar / Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5 bg-gray-50/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ffd9e1]/60 text-[#ac0053]">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-[#1a1c1c]">Live Map Preview</h3>
              {hasActivePin ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" />
                  {manualAdjusted ? 'Custom Pin' : 'Pin Placed'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  <AlertCircle className="h-3 w-3" />
                  Needs Location
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#5f5e5e]">
              {salonName ? `${salonName} pin on customer map` : 'Interactive location preview for customers'}
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshLocation}
            disabled={isGeocoding || !address}
            title="Locate pin from current address"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 shadow-2xs"
          >
            {isGeocoding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ac0053]" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-[#ac0053]" />
            )}
            <span className="hidden sm:inline">{isGeocoding ? 'Locating...' : 'Locate Address'}</span>
          </button>

          {onOpenFullPicker && (
            <button
              type="button"
              onClick={onOpenFullPicker}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#ac0053] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#ba005b] transition-colors shadow-2xs"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Full Screen Editor</span>
            </button>
          )}
        </div>
      </div>

      {/* Map Container Area */}
      <div className="relative h-64 md:h-72 w-full bg-gray-100 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin text-[#ac0053]" />
              <span className="text-xs font-medium">Loading interactive map...</span>
            </div>
          }
        >
          <LocationMap
            latitude={activeCoords.latitude}
            longitude={activeCoords.longitude}
            onDragEnd={handlePinDragEnd}
            draggable={true}
            zoom={hasActivePin ? 14 : 11}
            className="h-full w-full"
          />
        </Suspense>

        {/* Loading Overlay Badge */}
        {isGeocoding && (
          <div className="absolute top-3 left-3 z-[400] flex items-center gap-2 rounded-xl bg-white/95 backdrop-blur-xs px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] shadow-md border border-gray-100">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ac0053]" />
            <span>Finding exact address...</span>
          </div>
        )}

        {/* Quick Pin Info Tooltip Overlay */}
        <div className="absolute bottom-3 left-3 right-3 z-[400] pointer-events-none flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto rounded-xl bg-white/95 backdrop-blur-xs px-3 py-2 text-xs shadow-md border border-gray-100 max-w-[85%]">
            <div className="flex items-center gap-1.5 font-bold text-[#1a1c1c]">
              <MapPin className="h-3.5 w-3.5 text-[#ac0053]" />
              <span className="truncate">{address || 'No address specified'}</span>
            </div>
            {hasActivePin && (
              <div className="flex items-center gap-3 text-[11px] font-mono text-gray-500 mt-0.5">
                <span>Lat: {activeCoords.latitude.toFixed(5)}</span>
                <span>Lng: {activeCoords.longitude.toFixed(5)}</span>
              </div>
            )}
          </div>

          <div className="pointer-events-auto hidden sm:flex items-center gap-1 rounded-xl bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white shadow-md">
            <Navigation className="h-3 w-3 text-[#ffd9e1]" />
            <span>Drag pin to fine-tune</span>
          </div>
        </div>
      </div>

      {/* Geocode Error Alert if any */}
      {geocodeError && (
        <div className="flex items-start gap-2 border-t border-amber-100 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
          <span className="flex-1">{geocodeError}</span>
        </div>
      )}

      {/* Footer Info Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50/50 px-5 py-2.5 border-t border-gray-100 text-[11px] text-[#5f5e5e]">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#ac0053]" />
          <span>Pin updates automatically as you type your address or drag the marker</span>
        </div>
        {hasActivePin && (
          <span className="font-semibold text-emerald-700">✓ Ready for customer directions & nearby search</span>
        )}
      </div>
    </div>
  );
}
