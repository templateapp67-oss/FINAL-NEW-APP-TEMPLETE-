/**
 * PHASE 10.4 — booking + contact helpers for the public website.
 *
 * Opens the EXISTING `CustomerBookingPreview` flow (no second booking system).
 * Header Book Appointment from Phase 10.1 still scrolls to `section-contact`;
 * in-page / final / floating Book CTAs dispatch this event instead.
 *
 * No database or service/theme-data changes.
 */
import type { SalonData, Service } from '../types';
import { OWNER_PREVIEW_EMPTY } from './ownerPreview';

export const SITE_BOOKING_EVENT = 'nexora:open-booking';
export const SITE_BOOKING_CLOSE_EVENT = 'nexora:close-booking';
export const BOOKING_TRIGGER_ATTR = 'data-open-booking';

/* ------------------------------------------------------------------ */
/* PHASE 12.3 — service prefill channel.                               */
/*                                                                     */
/* A Featured-service "Book Now" hands the EXISTING booking flow one   */
/* pre-selected service. This is still the SAME single booking event / */
/* flow — no second booking system. The prefill is stored in-memory,   */
/* consumed once by `SiteBookingFlow` on mount, and cleared so a plain  */
/* header/final Book Appointment never inherits a stale selection.     */
/* ------------------------------------------------------------------ */

let bookingServicePrefill: { service: Service; themeId: string } | null = null;

/** Opens the existing booking flow with `service` pre-selected. */
export function openSiteBookingForService(service: Service, themeId: string): void {
  bookingServicePrefill = { service, themeId };
  openSiteBooking();
}

/** One-shot read of the prefill for `themeId`; clears it afterwards. */
export function consumeBookingServicePrefill(themeId: string): Service | null {
  if (bookingServicePrefill && bookingServicePrefill.themeId === themeId) {
    const service = bookingServicePrefill.service;
    bookingServicePrefill = null;
    return service;
  }
  bookingServicePrefill = null;
  return null;
}

export function digitsOnly(value: string | undefined | null): string {
  return (value || '').replace(/\D/g, '');
}

export function canCall(data: SalonData): boolean {
  return (!data.contactOptions || data.contactOptions.callNow !== false) && digitsOnly(data.phone).length > 0;
}

export function canWhatsApp(data: SalonData): boolean {
  return (!data.contactOptions || data.contactOptions.whatsapp !== false)
    && digitsOnly(data.whatsappPhone || data.phone).length > 0;
}

export function canBookOnline(data: SalonData): boolean {
  return !data.contactOptions || data.contactOptions.bookNow !== false;
}

export function salonTelHref(data: SalonData): string {
  const raw = (data.phone || '').trim();
  return raw ? `tel:${raw}` : 'tel:';
}

export function salonWhatsAppHref(data: SalonData): string {
  const phone = digitsOnly(data.whatsappPhone || data.phone);
  return phone ? `https://wa.me/${phone}` : 'https://wa.me/';
}

export function hasSalonAddress(data: SalonData, ownerDataOnly = false): boolean {
  const q = (data.address?.fullAddress || '').trim();
  return Boolean(q && (!ownerDataOnly || q !== OWNER_PREVIEW_EMPTY.address));
}

export function salonMapsHref(data: SalonData, ownerDataOnly = false): string {
  const q = (data.address?.fullAddress || '').trim();
  if (hasSalonAddress(data, ownerDataOnly)) {
    return `https://maps.google.com/?q=${encodeURIComponent(q)}`;
  }
  return ownerDataOnly ? '' : '#section-location';
}

export function openSiteBooking(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SITE_BOOKING_EVENT));
}

export function closeSiteBooking(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SITE_BOOKING_CLOSE_EVENT));
}

/** Props for any in-page control that should open the existing booking flow. */
export function bookingTriggerProps(): { 'data-open-booking': 'true'; type: 'button' } {
  return { 'data-open-booking': 'true', type: 'button' };
}

export function scrollSiteToTop(): void {
  if (typeof document === 'undefined') return;
  const scroller = document.querySelector('.site-scroll') as HTMLElement | null;
  if (scroller && typeof scroller.scrollTo === 'function') {
    try {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    } catch {
      scroller.scrollTop = 0;
      return;
    }
  }
  const fallback = document.getElementById('section-hero') || document.getElementById('section-header');
  if (fallback && typeof fallback.scrollIntoView === 'function') {
    try {
      fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      fallback.scrollIntoView();
    }
  }
}

export const THEME_FALLBACK_NAME: Record<string, string> = {
  barber_mens_grooming: 'The Grooming Co.',
  hair_studio_color_bar: 'Atelier Hair Studio',
  beauty_skin_spa: 'Serenity Beauty & Spa',
  family_full_service: 'The Family Salon',
  nail_lash_studio: 'The Glow Edit',
};

export function salonDisplayName(
  data: SalonData,
  themeId: string,
  ownerDataOnly = false,
): string {
  const savedName = (data.salonName || '').trim();
  if (savedName) return savedName;
  if (ownerDataOnly) return OWNER_PREVIEW_EMPTY.salonName;
  return THEME_FALLBACK_NAME[themeId] || 'Salon';
}
