/**
 * PHASE 10.9 — mobile quick-action bar copy
 * Call Now | WhatsApp | Directions | Book
 * Supports English/Hindi, keeps labels short for touch targets.
 */
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';

type MobileBarCopy = {
  callNow: string;
  callNowShort: string;
  whatsapp: string;
  directions: string;
  directionsShort: string;
  book: string;
  bookNow: string;
};

const BASE: Record<AppLocale, MobileBarCopy> = {
  en: {
    callNow: 'Call Now',
    callNowShort: 'Call',
    whatsapp: 'WhatsApp',
    directions: 'Directions',
    directionsShort: 'Directions',
    book: 'Book',
    bookNow: 'Book Now',
  },
  hi: {
    callNow: 'कॉल करें',
    callNowShort: 'कॉल',
    whatsapp: 'व्हाट्सऐप',
    directions: 'रास्ता',
    directionsShort: 'रास्ता',
    book: 'बुक',
    bookNow: 'बुक करें',
  },
};

// Theme-specific overrides can stay subtle; labels remain short for mobile.
const THEME_OVERRIDES: Partial<Record<SiteHeaderThemeId, Partial<Record<AppLocale, Partial<MobileBarCopy>>>>> = {
  barber_mens_grooming: {
    en: { callNow: 'Call Now', directions: 'Directions', book: 'Book' },
    hi: { callNow: 'कॉल करें', directions: 'रास्ता देखें', book: 'बुक' },
  },
  hair_studio_color_bar: {
    en: { callNow: 'Call Now', directions: 'Directions', book: 'Book' },
    hi: { callNow: 'कॉल करें', directions: 'रास्ता देखें', book: 'बुक' },
  },
  beauty_skin_spa: {
    en: { callNow: 'Call Now', directions: 'Directions', book: 'Book' },
    hi: { callNow: 'कॉल करें', directions: 'रास्ता देखें', book: 'बुक' },
  },
  family_full_service: {
    en: { callNow: 'Call Now', directions: 'Directions', book: 'Book' },
    hi: { callNow: 'कॉल करें', directions: 'रास्ता देखें', book: 'बुक' },
  },
  nail_lash_studio: {
    en: { callNow: 'Call Now', directions: 'Directions', book: 'Book' },
    hi: { callNow: 'कॉल करें', directions: 'रास्ता देखें', book: 'बुक' },
  },
};

export function mobileBarText(themeId: SiteHeaderThemeId, locale: AppLocale): MobileBarCopy {
  const base = BASE[locale] || BASE.en;
  const over = THEME_OVERRIDES[themeId]?.[locale];
  if (!over) return base;
  return { ...base, ...over };
}
