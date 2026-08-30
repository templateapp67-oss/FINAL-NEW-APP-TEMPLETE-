/**
 * HOME SERVICE — customer fulfillment selector, ONE shared implementation.
 *
 * Rendered inside the shared booking flow's Details step for every theme;
 * visuals inherit each theme's booking surfaces + flow design classes, so
 * the five templates stay visually distinct without duplicating any logic.
 *
 * Behaviour:
 *   - hidden entirely when the owner has not enabled Home Service;
 *   - "At Salon" stays the default and never asks for anything extra;
 *   - "Home Service" requires a complete address, geocodes it through the
 *     existing OpenStreetMap/Nominatim proxy, shows the computed distance
 *     and the extra charge, and BLOCKS continuation outside the radius;
 *   - if the salon has no confirmed coordinates the option is not offered.
 *
 * Everything here is a preview — the server re-geocodes and re-prices.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Home, Store, MapPin, LocateFixed, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import type { BookingFlowSurface } from '../lib/siteBookingTheme';
import { formatCurrency } from '../lib/pricing';
import { formatDistanceKm } from '../lib/location';
import {
  buildBookingFulfillment,
  checkHomeServiceAddress,
  homeServiceAvailability,
  isCompleteServiceAddress,
  type BookingFulfillment,
  type FulfillmentMode,
  type HomeServiceEvaluation,
} from '../lib/homeService';

export type FulfillmentCheckStatus =
  | 'idle'
  | 'checking'
  | 'inside'
  | 'outside'
  | 'not-found'
  | 'error';

export interface FulfillmentSelection {
  mode: FulfillmentMode;
  address: string;
  status: FulfillmentCheckStatus;
  evaluation: HomeServiceEvaluation | null;
  geo: { latitude: number; longitude: number } | null;
}

export const INITIAL_FULFILLMENT_SELECTION: FulfillmentSelection = {
  mode: 'at_salon',
  address: '',
  status: 'idle',
  evaluation: null,
  geo: null,
};

/** Whether the Details step may continue with this selection. */
export function fulfillmentSelectionValid(
  data: Pick<SalonData, 'address' | 'bookingRules'>,
  selection: FulfillmentSelection,
): boolean {
  if (selection.mode !== 'home_service') return true;
  if (homeServiceAvailability(data).status !== 'available') return false;
  return selection.status === 'inside'
    && !!selection.geo
    && !!selection.evaluation
    && isCompleteServiceAddress(selection.address);
}

/** Snapshot for the summary/payment hand-off. */
export function fulfillmentFromSelection(selection: FulfillmentSelection): BookingFulfillment {
  return buildBookingFulfillment({
    mode: selection.mode,
    address: selection.address,
    geo: selection.geo,
    evaluation: selection.evaluation,
  });
}

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  s: BookingFlowSurface;
  /** Hosting flow's per-theme design classes (keeps visuals theme-true). */
  design: { card: string; input: string; label: string; sectionTitle: string };
  selection: FulfillmentSelection;
  onChange: (next: FulfillmentSelection) => void;
}

export default function SiteBookingFulfillment({ themeId, data, s, design, selection, onChange }: Props) {
  const availability = useMemo(() => homeServiceAvailability(data), [data]);
  const abortRef = useRef<AbortController | null>(null);
  const [localAddress, setLocalAddress] = useState(selection.address);

  useEffect(() => () => abortRef.current?.abort(), []);

  const setMode = useCallback((mode: FulfillmentMode) => {
    if (mode === selection.mode) return;
    abortRef.current?.abort();
    onChange(mode === 'at_salon'
      ? { ...INITIAL_FULFILLMENT_SELECTION }
      : { ...INITIAL_FULFILLMENT_SELECTION, mode: 'home_service', address: localAddress });
  }, [selection.mode, localAddress, onChange]);

  const updateAddress = useCallback((address: string) => {
    setLocalAddress(address);
    abortRef.current?.abort();
    onChange({ ...selection, address, status: 'idle', evaluation: null, geo: null });
  }, [selection, onChange]);

  const runCheck = useCallback(async () => {
    if (!isCompleteServiceAddress(localAddress)) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    onChange({ ...selection, address: localAddress, status: 'checking', evaluation: null, geo: null });
    try {
      const result = await checkHomeServiceAddress(data, localAddress, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok === true) {
        onChange({
          mode: 'home_service',
          address: localAddress,
          status: 'inside',
          evaluation: result.evaluation,
          geo: { latitude: result.geo.latitude, longitude: result.geo.longitude },
        });
        return;
      }
      const failure = result as { ok: false; reason: string; evaluation?: HomeServiceEvaluation };
      if (failure.reason === 'outside-radius') {
        onChange({
          mode: 'home_service',
          address: localAddress,
          status: 'outside',
          evaluation: failure.evaluation ?? null,
          geo: null,
        });
      } else {
        onChange({ mode: 'home_service', address: localAddress, status: 'not-found', evaluation: null, geo: null });
      }
    } catch {
      if (controller.signal.aborted) return;
      onChange({ mode: 'home_service', address: localAddress, status: 'error', evaluation: null, geo: null });
    }
  }, [data, localAddress, selection, onChange]);

  // Feature entirely off → the flow behaves exactly as before (At Salon only).
  if (availability.status === 'disabled') return null;

  const settings = availability.settings;
  const addressComplete = isCompleteServiceAddress(localAddress);
  const D = design;

  const modeButton = (mode: FulfillmentMode, icon: ReactNode, title: string, note: string, testId: string) => {
    const active = selection.mode === mode;
    return (
      <button
        type="button"
        data-testid={testId}
        data-active={active}
        onClick={() => setMode(mode)}
        className={`${D.card} flex-1 p-3.5 text-left transition-all cursor-pointer`}
        style={active
          ? { backgroundColor: s.accentSoft, borderColor: s.accentLine, color: s.textStrong }
          : { backgroundColor: s.card, borderColor: s.chipLine, color: s.text }}
      >
        <span className="flex items-center gap-2 text-xs font-extrabold" style={{ color: active ? s.accent : s.textStrong }}>
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-[10px] font-semibold" style={{ color: s.muted }}>
          {note}
        </span>
      </button>
    );
  };

  return (
    <div
      data-testid={`booking-fulfillment-${themeId}`}
      className={`${D.card} p-4 md:p-5 flex flex-col gap-3.5`}
      style={{ backgroundColor: s.card, borderColor: s.line }}
    >
      <h2 className={D.sectionTitle} style={{ color: s.accent }}>
        Where should we serve you?
      </h2>

      <div className="flex flex-col sm:flex-row gap-2.5">
        {modeButton(
          'at_salon',
          <Store className="w-4 h-4" />,
          'At Salon',
          'Visit us at the salon — no extra charge.',
          'booking-fulfillment-at-salon',
        )}
        {availability.status === 'available' && modeButton(
          'home_service',
          <Home className="w-4 h-4" />,
          'Home Service',
          `We come to you · +${formatCurrency(settings.extraCharge)} within ${settings.radiusKm} km`,
          'booking-fulfillment-home',
        )}
      </div>

      {availability.status === 'no-salon-location' && (
        <p
          data-testid="booking-fulfillment-no-location"
          className="flex items-start gap-1.5 text-[10px] font-semibold"
          style={{ color: s.muted }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: s.danger }} />
          Home Service is temporarily unavailable — this salon has not confirmed its location yet.
        </p>
      )}

      {selection.mode === 'home_service' && availability.status === 'available' && (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className={D.label} style={{ color: s.muted }}>
              Your complete address <span style={{ color: s.danger }}>*</span>
            </span>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 absolute left-3.5 top-3.5" style={{ color: s.accent }} />
              <textarea
                data-testid="booking-fulfillment-address"
                value={localAddress}
                onChange={(e) => updateAddress(e.target.value)}
                rows={2}
                placeholder="House / flat, street, area, city, PIN code"
                className={`${D.input} w-full pl-9 pr-3.5 py-2.5 text-xs font-semibold outline-none transition-colors resize-none`}
                style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
              />
            </div>
          </label>

          <button
            type="button"
            data-testid="booking-fulfillment-check"
            onClick={runCheck}
            disabled={!addressComplete || selection.status === 'checking'}
            className={`${D.card} px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 ${
              !addressComplete || selection.status === 'checking' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
            style={{ backgroundColor: s.accent, borderColor: s.accent, color: s.accentText }}
          >
            {selection.status === 'checking'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <LocateFixed className="w-3.5 h-3.5" />}
            {selection.status === 'checking' ? 'Checking distance…' : 'Check availability at my address'}
          </button>

          {!addressComplete && localAddress.trim().length > 0 && (
            <p data-testid="booking-fulfillment-incomplete" className="text-[10px] font-bold" style={{ color: s.danger }}>
              Please enter your complete address (at least 10 characters).
            </p>
          )}

          {selection.status === 'inside' && selection.evaluation && (
            <div
              data-testid="booking-fulfillment-inside"
              className="flex items-start gap-2 p-3 border"
              style={{ backgroundColor: s.successSoft, borderColor: s.success, borderRadius: 10 }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: s.success }} />
              <div className="text-[11px] font-semibold" style={{ color: s.textStrong }}>
                <p>
                  Great — you&apos;re{' '}
                  <b data-testid="booking-fulfillment-distance">{formatDistanceKm(selection.evaluation.distanceKm)}</b>{' '}
                  away (within the {selection.evaluation.radiusKm} km service area).
                </p>
                <p className="mt-0.5" style={{ color: s.muted }}>
                  Home Service charge:{' '}
                  <b data-testid="booking-fulfillment-charge" style={{ color: s.textStrong }}>
                    {formatCurrency(selection.evaluation.charge)}
                  </b>{' '}
                  will be added to your total.
                </p>
              </div>
            </div>
          )}

          {selection.status === 'outside' && (
            <div
              data-testid="booking-fulfillment-outside"
              className="flex items-start gap-2 p-3 border"
              style={{ backgroundColor: s.well, borderColor: s.danger, borderRadius: 10 }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: s.danger }} />
              <p className="text-[11px] font-semibold" style={{ color: s.textStrong }}>
                Sorry, your address is{' '}
                {selection.evaluation ? <b>{formatDistanceKm(selection.evaluation.distanceKm)}</b> : 'too far'}{' '}
                away — outside the {settings.radiusKm} km Home Service area. You can still book
                an At Salon appointment.
              </p>
            </div>
          )}

          {selection.status === 'not-found' && (
            <p data-testid="booking-fulfillment-not-found" className="text-[10px] font-bold" style={{ color: s.danger }}>
              We couldn&apos;t locate that address. Add your area, city and PIN code, then try again.
            </p>
          )}

          {selection.status === 'error' && (
            <p data-testid="booking-fulfillment-error" className="text-[10px] font-bold" style={{ color: s.danger }}>
              The distance check failed. Please try again in a moment.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
