/**
 * HOME SERVICE — the ONE owner-facing settings card.
 *
 * Used by BOTH the onboarding booking-settings step (StepContactBooking) and
 * the owner dashboard settings panel (SettingsPanel), so the toggle, the
 * flat extra charge (INR) and the service radius (km) are edited through a
 * single implementation. Values persist inside the EXISTING canonical
 * website config via `data.bookingRules.homeService` — no new store.
 */
import type { Dispatch, SetStateAction } from 'react';
import { Home, MapPin, IndianRupee, AlertTriangle } from 'lucide-react';
import type { BookingRules, HomeServiceSettings, SalonData } from '../types';
import {
  HOME_SERVICE_MAX_CHARGE_INR,
  HOME_SERVICE_MAX_RADIUS_KM,
  salonHomeServiceOrigin,
} from '../lib/homeService';

export const DEFAULT_HOME_SERVICE_SETTINGS: HomeServiceSettings = {
  enabled: false,
  extraCharge: 200,
  radiusKm: 5,
};

function clampCharge(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value), HOME_SERVICE_MAX_CHARGE_INR);
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_HOME_SERVICE_SETTINGS.radiusKm;
  return Math.min(value, HOME_SERVICE_MAX_RADIUS_KM);
}

export default function HomeServiceSettingsCard({ data, setData, onSaved }: {
  data: SalonData;
  setData: Dispatch<SetStateAction<SalonData>>;
  /** Existing notify/save seam of the hosting screen. */
  onSaved?: (message: string) => void;
}) {
  const settings: HomeServiceSettings = {
    ...DEFAULT_HOME_SERVICE_SETTINGS,
    ...(data.bookingRules?.homeService || {}),
  };
  const hasSalonLocation = salonHomeServiceOrigin(data) !== null;

  const update = (patch: Partial<HomeServiceSettings>, message: string) => {
    setData((prev) => {
      const prevRules = (prev.bookingRules || {}) as BookingRules;
      const prevHome = { ...DEFAULT_HOME_SERVICE_SETTINGS, ...(prevRules.homeService || {}) };
      return {
        ...prev,
        bookingRules: {
          ...prevRules,
          homeService: { ...prevHome, ...patch },
        } as BookingRules,
      };
    });
    onSaved?.(message);
  };

  return (
    <div
      data-testid="home-service-settings"
      className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1a1c1c] flex items-center gap-2">
            <Home className="w-5 h-5 text-[#ac0053]" /> Home Service
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Serve customers at their doorstep. The extra charge is added to the booking
            total and the 25% advance is calculated on the final amount.
          </p>
        </div>
        <button
          type="button"
          data-testid="home-service-toggle"
          aria-pressed={settings.enabled}
          onClick={() => update(
            { enabled: !settings.enabled },
            settings.enabled ? 'Home Service disabled' : 'Home Service enabled',
          )}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            settings.enabled ? 'bg-[#ac0053]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {settings.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Extra charge (₹, flat per booking)
              </label>
              <div className="relative">
                <IndianRupee className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min={0}
                  max={HOME_SERVICE_MAX_CHARGE_INR}
                  step={10}
                  data-testid="home-service-charge"
                  value={settings.extraCharge}
                  onChange={(e) => update(
                    { extraCharge: clampCharge(Number(e.target.value)) },
                    'Home Service charge updated',
                  )}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-8 pr-3.5 py-2 text-xs text-gray-800 outline-none focus:border-[#ac0053]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Service radius (km from your salon)
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min={0.5}
                  max={HOME_SERVICE_MAX_RADIUS_KM}
                  step={0.5}
                  data-testid="home-service-radius"
                  value={settings.radiusKm}
                  onChange={(e) => update(
                    { radiusKm: clampRadius(Number(e.target.value)) },
                    'Home Service radius updated',
                  )}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-8 pr-3.5 py-2 text-xs text-gray-800 outline-none focus:border-[#ac0053]"
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Customers within <b>{settings.radiusKm} km</b> can request Home Service for an
            extra <b>₹{settings.extraCharge.toLocaleString('en-IN')}</b>. The distance is
            checked automatically from the customer&apos;s address; addresses outside the
            radius cannot book Home Service.
          </p>

          {!hasSalonLocation && (
            <div
              data-testid="home-service-location-warning"
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
              <p className="text-[11px] font-semibold text-amber-700">
                Confirm your salon location on the map (Location step) first — Home Service
                stays hidden on your website until your salon has verified coordinates.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
