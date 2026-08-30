/**
 * HOME SERVICE — single shared engine for radius-checked doorstep bookings.
 *
 * All five public templates consume this module through the ONE shared
 * booking flow (SiteBookingFlow / SiteBookingFullFlow); no template renderer
 * carries its own copy of this logic. Owner settings live inside the
 * EXISTING canonical website config (`bookingRules.homeService` on
 * salon_public_websites.config) — no parallel settings store, no separate
 * tenancy.
 *
 * TRUST MODEL
 * -----------
 * Everything in this file is presentation + early validation only. The
 * authoritative distance, charge and radius decisions are recomputed by
 * `public.create_authoritative_customer_booking_v2` (M65) from the salon's
 * canonical `business_locations` coordinates, the server-geocoded customer
 * address and the published settings — a tampered client can never change
 * what is charged or where service is allowed.
 */
import type { BookingRules, HomeServiceSettings, SalonData } from '../types';
import {
  geocodeAddress,
  haversineDistanceKm,
  normalizeCoordinates,
  type Coordinates,
  type GeocodeResult,
} from './location';

export type FulfillmentMode = 'at_salon' | 'home_service';

export const HOME_SERVICE_MIN_ADDRESS_LENGTH = 10;
export const HOME_SERVICE_MAX_ADDRESS_LENGTH = 400;
export const HOME_SERVICE_MAX_RADIUS_KM = 500;
export const HOME_SERVICE_MAX_CHARGE_INR = 100000;

/** The customer-side fulfillment snapshot carried through the booking flow. */
export interface BookingFulfillment {
  mode: FulfillmentMode;
  /** Complete customer address (home_service only). */
  address?: string;
  /** Client-side geocoded coordinates — advisory; the server re-verifies. */
  latitude?: number;
  longitude?: number;
  /** Client-side straight-line distance preview in km. */
  distanceKm?: number;
  /** Charge preview in INR from the published settings. */
  homeServiceCharge?: number;
}

export const AT_SALON_FULFILLMENT: BookingFulfillment = { mode: 'at_salon' };

/**
 * Sanitize whatever is stored under `bookingRules.homeService`. Returns null
 * when the config is absent or unusable — the feature then stays off, which
 * mirrors the fail-closed server reader.
 */
export function normalizeHomeServiceSettings(
  rules: Pick<BookingRules, 'homeService'> | undefined,
): HomeServiceSettings | null {
  const raw = rules?.homeService;
  if (!raw || typeof raw !== 'object') return null;
  const enabled = raw.enabled === true;
  const extraCharge = Number(raw.extraCharge);
  const radiusKm = Number(raw.radiusKm);
  if (!Number.isFinite(extraCharge) || extraCharge < 0 || extraCharge > HOME_SERVICE_MAX_CHARGE_INR) return null;
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > HOME_SERVICE_MAX_RADIUS_KM) return null;
  return { enabled, extraCharge: Math.round(extraCharge), radiusKm };
}

/** Canonical salon coordinates from the owner-confirmed address record. */
export function salonHomeServiceOrigin(
  data: Pick<SalonData, 'address'>,
): Coordinates | null {
  return normalizeCoordinates(data.address?.latitude, data.address?.longitude);
}

export type HomeServiceAvailability =
  | { status: 'available'; settings: HomeServiceSettings; origin: Coordinates }
  | { status: 'disabled' }
  | { status: 'no-salon-location'; settings: HomeServiceSettings };

/**
 * Whether the Home Service option may be OFFERED on this salon's website.
 * Disabled settings hide the option entirely; enabled settings without a
 * confirmed salon location surface an explanatory block instead of a form.
 */
export function homeServiceAvailability(
  data: Pick<SalonData, 'address' | 'bookingRules'>,
): HomeServiceAvailability {
  const settings = normalizeHomeServiceSettings(data.bookingRules);
  if (!settings || !settings.enabled) return { status: 'disabled' };
  const origin = salonHomeServiceOrigin(data);
  if (!origin) return { status: 'no-salon-location', settings };
  return { status: 'available', settings, origin };
}

export interface HomeServiceEvaluation {
  /** Straight-line distance in km, rounded to 2 decimals. */
  distanceKm: number;
  /** True when the address sits inside (or exactly on) the radius. */
  withinRadius: boolean;
  /** The flat surcharge in INR that will apply. */
  charge: number;
  radiusKm: number;
}

/**
 * Distance + radius decision for a geocoded customer point. The EXACT radius
 * boundary is bookable (<=), matching the server's `distance > radius` gate.
 */
export function evaluateHomeServicePoint(
  origin: Coordinates,
  point: { latitude: unknown; longitude: unknown },
  settings: HomeServiceSettings,
): HomeServiceEvaluation | null {
  const distance = haversineDistanceKm(origin, point);
  if (distance === null) return null;
  const distanceKm = Math.round(distance * 100) / 100;
  return {
    distanceKm,
    withinRadius: distanceKm <= settings.radiusKm,
    charge: settings.extraCharge,
    radiusKm: settings.radiusKm,
  };
}

/** Address completeness gate shared by the form and the payload builder. */
export function isCompleteServiceAddress(address: string): boolean {
  const trimmed = (address || '').trim();
  return trimmed.length >= HOME_SERVICE_MIN_ADDRESS_LENGTH
    && trimmed.length <= HOME_SERVICE_MAX_ADDRESS_LENGTH;
}

/**
 * Geocode the customer's address through the EXISTING Nominatim proxy
 * (`/api/geocode/search`) and evaluate it against the salon radius.
 */
export async function checkHomeServiceAddress(
  data: Pick<SalonData, 'address' | 'bookingRules'>,
  address: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; geo: GeocodeResult; evaluation: HomeServiceEvaluation }
  | { ok: false; reason: 'unavailable' | 'incomplete-address' | 'not-found' | 'outside-radius'; evaluation?: HomeServiceEvaluation }
> {
  const availability = homeServiceAvailability(data);
  if (availability.status !== 'available') return { ok: false, reason: 'unavailable' };
  if (!isCompleteServiceAddress(address)) return { ok: false, reason: 'incomplete-address' };

  const geo = await geocodeAddress(address, signal);
  if (!geo) return { ok: false, reason: 'not-found' };

  const evaluation = evaluateHomeServicePoint(availability.origin, geo, availability.settings);
  if (!evaluation) return { ok: false, reason: 'not-found' };
  if (!evaluation.withinRadius) return { ok: false, reason: 'outside-radius', evaluation };
  return { ok: true, geo, evaluation };
}

/**
 * The fulfillment snapshot handed to payment/summary surfaces once the
 * details step validates. `at_salon` carries no address by design (the
 * server rejects an at-salon payload that smuggles one in).
 */
export function buildBookingFulfillment(input: {
  mode: FulfillmentMode;
  address?: string;
  geo?: { latitude: number; longitude: number } | null;
  evaluation?: HomeServiceEvaluation | null;
}): BookingFulfillment {
  if (input.mode !== 'home_service') return AT_SALON_FULFILLMENT;
  return {
    mode: 'home_service',
    address: (input.address || '').trim(),
    latitude: input.geo?.latitude,
    longitude: input.geo?.longitude,
    distanceKm: input.evaluation?.distanceKm,
    homeServiceCharge: input.evaluation?.charge ?? 0,
  };
}

/** Charge (INR) a fulfillment adds to the booking total. */
export function fulfillmentCharge(fulfillment: BookingFulfillment | null | undefined): number {
  if (!fulfillment || fulfillment.mode !== 'home_service') return 0;
  const charge = Number(fulfillment.homeServiceCharge);
  return Number.isFinite(charge) && charge > 0 ? Math.round(charge) : 0;
}

/** True when the record/fulfillment describes a doorstep appointment. */
export function isHomeServiceFulfillment(
  fulfillment: { mode?: string | null } | null | undefined,
): boolean {
  return fulfillment?.mode === 'home_service';
}

/** Human label used across summaries, receipts and dashboards. */
export function fulfillmentModeLabel(mode: FulfillmentMode | string | null | undefined): string {
  return mode === 'home_service' ? 'Home Service' : 'At Salon';
}
