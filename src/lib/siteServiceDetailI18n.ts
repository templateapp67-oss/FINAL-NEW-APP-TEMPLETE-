/**
 * PHASE 12.6 — Service Detail copy (English / हिन्दी).
 *
 * Only the NEW modal labels. The Book CTA reuses each theme's own
 * `common.bookSlot` / `common.bookThisService` / `common.bookNow` string.
 */
import type { AppLocale } from './locale';

export interface ServiceDetailCopy {
  availableStaff: string;
  close: string;
  dialogLabel: string;
}

const EN: ServiceDetailCopy = {
  availableStaff: 'Available Stylists',
  close: 'Close',
  dialogLabel: 'Service details',
};

const HI: ServiceDetailCopy = {
  availableStaff: 'उपलब्ध स्टाइलिस्ट',
  close: 'बंद करें',
  dialogLabel: 'सेवा विवरण',
};

export function serviceDetailText(locale: AppLocale): ServiceDetailCopy {
  return locale === 'hi' ? HI : EN;
}
