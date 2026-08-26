import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SalonData, SalonAddress, SalonOpeningHours, DaySchedule } from '../types';
import PreviewPane from '../components/PreviewPane';
import LocationPickerModal, { ConfirmedLocation } from '../components/LocationPickerModal';
import LocationMapPreview from '../components/LocationMapPreview';
import { normalizeCoordinates, geocodeAddress } from '../lib/location';
import { fetchSalonLocation, saveSalonLocation } from '../lib/salonLocationService';
import { resolveOwnerSalonId, ownerSalonMessage } from '../lib/ownerSalon';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useAuth } from '../lib/useAuth';
import { useAuthModal } from '../components/AuthModalProvider';
import { 
  MapPin, 
  Clock, 
  ArrowRight, 
  ArrowLeft, 
  Eye, 
  Navigation, 
  Copy, 
  Building2, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: (msg?: string) => void;
}

const DEFAULT_ADDRESS: SalonAddress = {
  fullAddress: 'Shop 14, Linking Road, Bandra West, Mumbai, Maharashtra 400050',
  city: 'Mumbai',
  area: 'Bandra West',
  state: 'Maharashtra',
  pinCode: '400050'
};

const DEFAULT_HOURS: SalonOpeningHours = {
  monday: { open: true, startTime: '10:00', endTime: '20:00' },
  tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
  wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
  thursday: { open: true, startTime: '10:00', endTime: '20:00' },
  friday: { open: true, startTime: '10:00', endTime: '20:00' },
  saturday: { open: true, startTime: '10:00', endTime: '20:00' },
  sunday: { open: false, startTime: '10:00', endTime: '20:00' }
};

export default function StepLocation({ data, setData, onNext, onPrev, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoGeocoding, setIsAutoGeocoding] = useState(false);
  const [autoGeocodeStatus, setAutoGeocodeStatus] = useState<'idle' | 'searching' | 'success' | 'not_found' | 'error'>('idle');
  const [autoGeocodeMessage, setAutoGeocodeMessage] = useState<string | null>(null);

  const geocodeAbortRef = useRef<AbortController | null>(null);
  const geocodeTimerRef = useRef<number | null>(null);
  const lastGeocodedAddressRef = useRef<string>('');

  const address = data.address || DEFAULT_ADDRESS;
  const hours = data.openingHours || DEFAULT_HOURS;

  // Saved coordinates, validated on read so bad values never reach the map.
  const savedCoords = normalizeCoordinates(address.latitude, address.longitude);
  const hasCoordinates = savedCoords !== null;

  /**
   * Automatic address-to-coordinates geocoding using Nominatim API proxy.
   * Runs when the salon owner finishes typing an address or blurs the input.
   */
  const performAutoGeocode = useCallback(async (queryAddress: string, force = false) => {
    const trimmed = queryAddress.trim();
    if (!trimmed || trimmed.length < 4) {
      setAutoGeocodeStatus('idle');
      setAutoGeocodeMessage(null);
      return;
    }

    if (!force && trimmed === lastGeocodedAddressRef.current) {
      return;
    }

    if (geocodeAbortRef.current) {
      geocodeAbortRef.current.abort();
    }
    const controller = new AbortController();
    geocodeAbortRef.current = controller;

    setIsAutoGeocoding(true);
    setAutoGeocodeStatus('searching');
    setAutoGeocodeMessage('Finding address coordinates via Nominatim...');

    try {
      const result = await geocodeAddress(trimmed, controller.signal);
      if (result) {
        lastGeocodedAddressRef.current = trimmed;
        setAutoGeocodeStatus('success');
        setAutoGeocodeMessage(`Location found: ${result.displayName || trimmed}`);

        setData(prev => ({
          ...prev,
          address: {
            ...(prev.address || DEFAULT_ADDRESS),
            latitude: result.latitude,
            longitude: result.longitude
          }
        }));

        if (onSave) onSave('Location pin updated automatically');
      } else {
        setAutoGeocodeStatus('not_found');
        setAutoGeocodeMessage('Could not locate exact address automatically. You can set the pin on the map.');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('Automatic geocoding error:', err);
      setAutoGeocodeStatus('error');
      setAutoGeocodeMessage('Geocoding service busy. You can adjust the pin on the map.');
    } finally {
      setIsAutoGeocoding(false);
    }
  }, [setData, onSave]);

  // Debounced auto-geocoding when address changes
  useEffect(() => {
    const trimmed = (address.fullAddress || '').trim();
    if (!trimmed || trimmed.length < 4) {
      setAutoGeocodeStatus('idle');
      setAutoGeocodeMessage(null);
      return;
    }

    if (trimmed === lastGeocodedAddressRef.current) {
      return;
    }

    if (geocodeTimerRef.current) {
      window.clearTimeout(geocodeTimerRef.current);
    }

    geocodeTimerRef.current = window.setTimeout(() => {
      performAutoGeocode(trimmed);
    }, 800);

    return () => {
      if (geocodeTimerRef.current) {
        window.clearTimeout(geocodeTimerRef.current);
      }
    };
  }, [address.fullAddress, performAutoGeocode]);

  /**
   * The salon id is resolved from the authenticated session only — never from
   * client input, localStorage or a hardcoded value. Until it resolves, the
   * editor is read-only and cannot write to any salon row.
   */
  const [salonId, setSalonId] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { openAuth } = useAuthModal();

  // The editor may only be opened once the authenticated owner's salon is known.
  const canEditLocation = salonId !== null && isSupabaseConfigured;

  useEffect(() => {
    let cancelled = false;

    // Wait for the session check to settle before deciding anything.
    if (authLoading) return;

    if (!user) {
      setSalonId(null);
      setLocationError('Please log in to manage your shop.');
      return;
    }

    resolveOwnerSalonId()
      .then(resolution => {
        if (cancelled) return;
        if (resolution.status === 'resolved') {
          setSalonId(resolution.salonId);
          setLocationError(null);
        } else {
          setSalonId(null);
          setLocationError(ownerSalonMessage(resolution));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSalonId(null);
        setLocationError('Unable to determine your shop.');
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  /**
   * Load the saved location from the existing Supabase salon record so the
   * editor always reopens with the persisted address + coordinates.
   * Supabase is the source of truth for the saved location.
   */
  useEffect(() => {
    if (!salonId || !isSupabaseConfigured) return;
    let cancelled = false;

    fetchSalonLocation(salonId)
      .then(record => {
        if (cancelled || !record) return;
        setData(prev => ({
          ...prev,
          address: {
            ...(prev.address || DEFAULT_ADDRESS),
            fullAddress: record.address ?? (prev.address?.fullAddress ?? ''),
            latitude: record.latitude ?? undefined,
            longitude: record.longitude ?? undefined,
            locationConfirmedAt: record.locationConfirmedAt ?? undefined
          }
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setLocationError('Unable to load your saved shop location.');
      });

    return () => {
      cancelled = true;
    };
  }, [salonId, setData]);

  /**
   * Persists the confirmed address + coordinates to the existing
   * `public.salons` record (address, latitude, longitude,
   * location_confirmed, location_confirmed_at). Coordinates are validated
   * before saving; local state mirrors the row after a successful write.
   */
  const handleConfirmLocation = async (location: ConfirmedLocation) => {
    const coords = normalizeCoordinates(location.latitude, location.longitude);
    if (!coords) {
      setLocationError('Invalid coordinates — location was not saved.');
      return;
    }

    setLocationError(null);

    // Re-verify session + salon ownership at save time; never trust stale state.
    const resolution = await resolveOwnerSalonId();
    if (resolution.status !== 'resolved') {
      const message = ownerSalonMessage(resolution);
      setLocationError(message);
      throw new Error(message);
    }

    setIsSaving(true);
    try {
      // Scoped to the freshly resolved, authenticated owner's salon row.
      const saved = await saveSalonLocation({
        salonId: resolution.salonId,
        address: location.address,
        latitude: coords.latitude,
        longitude: coords.longitude
      });

      setData(prev => ({
        ...prev,
        address: {
          ...(prev.address || DEFAULT_ADDRESS),
          fullAddress: saved.address ?? location.address,
          latitude: saved.latitude ?? coords.latitude,
          longitude: saved.longitude ?? coords.longitude,
          locationConfirmedAt: saved.locationConfirmedAt ?? undefined
        }
      }));

      setPickerOpen(false);
      setSaveMessage('Shop location saved successfully.');
      window.setTimeout(() => setSaveMessage(null), 4000);
      if (onSave) onSave('Shop location saved successfully.');
    } catch (err: unknown) {
      // Technical detail goes to the console; the UI stays user-friendly and
      // never exposes database internals.
      console.error('Failed to save shop location:', err);
      const message = 'Unable to save shop location. Please try again.';
      setLocationError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateAddress = (fields: Partial<SalonAddress>) => {
    const updated = { ...address, ...fields };
    setData(prev => ({ ...prev, address: updated }));
    if (onSave) onSave('Address updated');
  };

  const updateDayHours = (day: keyof SalonOpeningHours, fields: Partial<DaySchedule>) => {
    const updated = {
      ...hours,
      [day]: { ...hours[day], ...fields }
    };
    setData(prev => ({ ...prev, openingHours: updated }));
    if (onSave) onSave('Opening hours updated');
  };

  const copyMondayToAll = () => {
    const mon = hours.monday;
    const updated: SalonOpeningHours = {
      monday: { ...mon },
      tuesday: { ...mon },
      wednesday: { ...mon },
      thursday: { ...mon },
      friday: { ...mon },
      saturday: { ...mon },
      sunday: { ...hours.sunday } // keep sunday state or update
    };
    setData(prev => ({ ...prev, openingHours: updated }));
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
    if (onSave) onSave('Copied Monday schedule to all days');
  };

  const markSundayClosed = () => {
    updateDayHours('sunday', { open: false });
  };

  const daysList: { key: keyof SalonOpeningHours; label: string }[] = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#f9f9f9]">
      {/* Mobile view tab switcher */}
      <div className="md:hidden flex border-b border-gray-200 bg-white sticky top-0 z-20">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${
            activeTab === 'edit'
              ? 'border-[#ac0053] text-[#ac0053] bg-[#ffd9e1]/20'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          Edit Location & Hours
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'preview'
              ? 'border-[#ac0053] text-[#ac0053] bg-[#ffd9e1]/20'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Live Preview
        </button>
      </div>

      {/* LEFT COLUMN: Form Area (55%) */}
      <div className={`w-full md:w-[55%] h-full overflow-y-auto px-4 md:px-10 py-8 flex flex-col space-y-8 ${
        activeTab === 'preview' ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Header Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053]">
            <MapPin className="w-4 h-4" /> STEP 07 • LOCATION & OPENING HOURS
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c]">Where is your salon?</h1>
          <p className="text-sm text-[#5f5e5e]">Add your address and opening hours. Customers will see this on your website.</p>
        </div>

        {/* Address Section — single source of truth: fullAddress + latitude + longitude */}
        <div className="space-y-5 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#ac0053]" /> Business Address
            </h2>
            <span className="text-xs font-medium text-gray-400">Step 7 of 14</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#1a1c1c]">Full Address</label>
              <span className="text-[11px] text-[#5f5e5e] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#ac0053]" /> Auto-locates pin on map
              </span>
            </div>
            <textarea
              value={address.fullAddress}
              onChange={e => updateAddress({ fullAddress: e.target.value })}
              onBlur={() => performAutoGeocode(address.fullAddress)}
              placeholder="e.g. Shop 8, Vaishali Nagar, Jaipur, Rajasthan 302021"
              rows={2}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-[#1a1c1c] focus:border-[#ac0053] focus:ring-2 focus:ring-[#ffd9e1] focus:bg-white outline-none transition-all placeholder:text-gray-400"
            />

            {/* Auto-geocoding live feedback pill */}
            {autoGeocodeStatus === 'searching' && (
              <div className="flex items-center gap-2 text-xs text-purple-800 bg-purple-50/80 px-3.5 py-2 rounded-xl border border-purple-200 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 shrink-0" />
                <span>Locating address coordinates via Nominatim...</span>
              </div>
            )}

            {autoGeocodeStatus === 'success' && (
              <div className="flex items-center justify-between text-xs text-emerald-800 bg-emerald-50/90 px-3.5 py-2 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate font-medium">Pin placed at typed address</span>
                </div>
                <button
                  type="button"
                  onClick={() => performAutoGeocode(address.fullAddress, true)}
                  title="Re-run geocoding"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 shrink-0 ml-2"
                >
                  <RefreshCw className="w-3 h-3" /> Re-check
                </button>
              </div>
            )}

            {autoGeocodeStatus === 'not_found' && (
              <div className="flex items-center justify-between text-xs text-amber-800 bg-amber-50/90 px-3.5 py-2 rounded-xl border border-amber-200">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">Could not auto-locate exact address — drag pin below</span>
                </div>
                <button
                  type="button"
                  onClick={() => performAutoGeocode(address.fullAddress, true)}
                  className="text-[11px] font-semibold text-amber-900 hover:underline shrink-0 ml-2"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setPickerOpen(true)}
            disabled={!canEditLocation}
            title={canEditLocation ? undefined : 'Unable to determine your shop.'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ac0053] text-white font-semibold text-xs hover:bg-[#ba005b] transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{hasCoordinates ? 'Edit map location' : 'Set location on map'}</span>
          </button>

          {/* Interactive Lightweight Map Preview */}
          <LocationMapPreview
            address={address.fullAddress}
            latitude={savedCoords?.latitude}
            longitude={savedCoords?.longitude}
            salonName={data.salonName}
            isGeocoding={isAutoGeocoding}
            preferredZoom={address.preferredZoom}
            preferredCenterLat={address.preferredCenterLat}
            preferredCenterLng={address.preferredCenterLng}
            onSaveViewPreset={preset => {
              updateAddress({
                preferredZoom: preset.zoom,
                preferredCenterLat: preset.latitude,
                preferredCenterLng: preset.longitude,
              });
            }}
            onChangeCoordinates={(lat, lng) => {
              updateAddress({ latitude: lat, longitude: lng });
            }}
            onOpenFullPicker={() => {
              if (canEditLocation) {
                setPickerOpen(true);
              } else if (!user) {
                openAuth('login');
              }
            }}
          />

          {/* Saved location summary */}
          {hasCoordinates ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Location confirmed
              </div>
              <div className="text-sm text-[#1a1c1c]">{address.fullAddress}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-gray-600">
                <span>Lat: {Number(address.latitude).toFixed(6)}</span>
                <span>Lng: {Number(address.longitude).toFixed(6)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-4 text-xs text-gray-500 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
              <span>
                No map location set yet. Customers searching nearby will not find your
                salon until you confirm it on the map.
              </span>
            </div>
          )}

          {isSaving && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving location...
            </div>
          )}

          {saveMessage && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> {saveMessage}
            </div>
          )}

          {locationError && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="flex-1">{locationError}</span>
              {!user && !authLoading && (
                <button
                  type="button"
                  data-testid="location-login-btn"
                  onClick={() => openAuth('login')}
                  aria-haspopup="dialog"
                  className="shrink-0 rounded-lg bg-[#ac0053] px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#ba005b]"
                >
                  Log In
                </button>
              )}
            </div>
          )}

          {/* Granular Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Shop / Flat No.</label>
              <input
                type="text"
                value={address.shopNumber || ''}
                onChange={e => {
                  const shopNumber = e.target.value;
                  const fullAddress = `${shopNumber}, ${address.area}, ${address.city}, ${address.state} ${address.pinCode}`.replace(/^, /, '');
                  updateAddress({ shopNumber, fullAddress });
                }}
                placeholder="e.g. Shop 14, Ground Floor"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-[#1a1c1c] focus:border-[#ac0053] focus:bg-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Area / Locality</label>
              <input
                type="text"
                value={address.area}
                onChange={e => {
                  const area = e.target.value;
                  const shopStr = address.shopNumber ? `${address.shopNumber}, ` : '';
                  const fullAddress = `${shopStr}${area}, ${address.city}, ${address.state} ${address.pinCode}`.replace(/^, /, '');
                  updateAddress({ area, fullAddress });
                }}
                placeholder="e.g. Linking Road, Bandra West"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-[#1a1c1c] focus:border-[#ac0053] focus:bg-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">City</label>
              <input
                type="text"
                value={address.city}
                onChange={e => {
                  const city = e.target.value;
                  const shopStr = address.shopNumber ? `${address.shopNumber}, ` : '';
                  const fullAddress = `${shopStr}${address.area}, ${city}, ${address.state} ${address.pinCode}`.replace(/^, /, '');
                  updateAddress({ city, fullAddress });
                }}
                placeholder="e.g. Mumbai, Bengaluru, Delhi"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-[#1a1c1c] focus:border-[#ac0053] focus:bg-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">State</label>
              <select
                value={address.state}
                onChange={e => {
                  const state = e.target.value;
                  const shopStr = address.shopNumber ? `${address.shopNumber}, ` : '';
                  const fullAddress = `${shopStr}${address.area}, ${address.city}, ${state} ${address.pinCode}`.replace(/^, /, '');
                  updateAddress({ state, fullAddress });
                }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-[#1a1c1c] focus:border-[#ac0053] focus:bg-white outline-none"
              >
                <option value="Maharashtra">Maharashtra</option>
                <option value="Delhi">Delhi</option>
                <option value="Karnataka">Karnataka</option>
                <option value="Tamil Nadu">Tamil Nadu</option>
                <option value="Uttar Pradesh">Uttar Pradesh</option>
                <option value="Gujarat">Gujarat</option>
                <option value="West Bengal">West Bengal</option>
                <option value="Rajasthan">Rajasthan</option>
                <option value="Telangana">Telangana</option>
                <option value="Kerala">Kerala</option>
                <option value="Haryana">Haryana</option>
                <option value="Punjab">Punjab</option>
                <option value="Madhya Pradesh">Madhya Pradesh</option>
                <option value="Bihar">Bihar</option>
                <option value="Odisha">Odisha</option>
                <option value="Andhra Pradesh">Andhra Pradesh</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-[#1a1c1c]">PIN Code (6 digits)</label>
                {address.pinCode && (
                  <span className={`text-[10px] font-bold ${/^\d{6}$/.test(address.pinCode) ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {/^\d{6}$/.test(address.pinCode) ? '✓ Valid PIN' : 'Enter 6 digits'}
                  </span>
                )}
              </div>
              <input
                type="text"
                maxLength={6}
                value={address.pinCode}
                onChange={e => {
                  const pinCode = e.target.value.replace(/\D/g, '').slice(0, 6);
                  const shopStr = address.shopNumber ? `${address.shopNumber}, ` : '';
                  const fullAddress = `${shopStr}${address.area}, ${address.city}, ${address.state} ${pinCode}`.replace(/^, /, '');
                  updateAddress({ pinCode, fullAddress });
                }}
                placeholder="400050"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-[#1a1c1c] focus:border-[#ac0053] focus:bg-white outline-none tracking-widest font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1a1c1c] mb-1">Landmark (Optional)</label>
              <input
                type="text"
                value={address.landmark || ''}
                onChange={e => updateAddress({ landmark: e.target.value })}
                placeholder="e.g. Opposite Metro Station"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2 text-xs text-[#1a1c1c] focus:border-[#ac0053] focus:bg-white outline-none"
              />
            </div>
          </div>
        </div>

        {/* Opening Hours Section */}
        <div className="space-y-6 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs mb-24">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 gap-3">
            <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#ac0053]" /> Opening Hours
            </h2>

            <div className="flex items-center gap-3">
              <button
                onClick={copyMondayToAll}
                className="text-xs font-semibold text-[#ac0053] hover:underline flex items-center gap-1"
              >
                {copiedSuccess ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSuccess ? 'Schedule Copied!' : 'Copy Monday to all'}</span>
              </button>

              <button
                onClick={markSundayClosed}
                className="text-xs font-semibold text-[#ac0053] hover:underline"
              >
                Mark Sunday closed
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {daysList.map(({ key, label }) => {
              const dayObj = hours[key] || { open: true, startTime: '10:00', endTime: '20:00' };

              return (
                <div
                  key={key}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl transition-colors gap-3 ${
                    dayObj.open ? 'bg-gray-50/70 hover:bg-gray-100/70' : 'bg-gray-100/50 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-3 w-36">
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => updateDayHours(key, { open: !dayObj.open })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        dayObj.open ? 'bg-[#ac0053]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          dayObj.open ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-xs font-bold text-[#1a1c1c]">{label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold w-12 ${dayObj.open ? 'text-emerald-700' : 'text-gray-400'}`}>
                      {dayObj.open ? 'Open' : 'Closed'}
                    </span>

                    {dayObj.open ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={dayObj.startTime}
                          onChange={e => updateDayHours(key, { startTime: e.target.value })}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-[#1a1c1c] focus:border-[#ac0053] outline-none"
                        />
                        <span className="text-gray-400 text-xs">-</span>
                        <input
                          type="time"
                          value={dayObj.endTime}
                          onChange={e => updateDayHours(key, { endTime: e.target.value })}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-[#1a1c1c] focus:border-[#ac0053] outline-none"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Day off</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Live Preview Pane (45%) */}
      <div className={`w-full md:w-[45%] h-full bg-gray-100 border-l border-gray-200 ${
        activeTab === 'edit' ? 'hidden md:block' : 'block'
      }`}>
        <PreviewPane data={data} step={7} />
      </div>

      {/* Sticky Bottom Navigation Footer */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-between items-center px-6 py-4 bg-white z-50 border-t border-gray-200 shadow-md">
        <button
          onClick={onPrev}
          className="border border-gray-300 text-gray-700 rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="hidden sm:block text-xs font-medium text-gray-400">
          Step 7 of 14 • Location & Opening Hours
        </div>

        <button
          onClick={onNext}
          className="bg-[#ac0053] text-white rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-[#ba005b] transition-colors flex items-center gap-2 shadow-xs"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </footer>

      {/* Owner location editor — map + Nominatim. No browser geolocation here. */}
      <LocationPickerModal
        open={pickerOpen}
        initialAddress={address.fullAddress}
        initialLatitude={savedCoords?.latitude}
        initialLongitude={savedCoords?.longitude}
        onCancel={() => setPickerOpen(false)}
        onConfirm={handleConfirmLocation}
      />
    </div>
  );
}
