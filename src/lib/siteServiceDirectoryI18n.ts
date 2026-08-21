/**
 * PHASE 12.4 — Complete Services directory copy (English / हिन्दी).
 *
 * Only the NEW control labels (search, category, sort). Section eyebrow/title
 * still come from the existing siteText table (servicesTitle / menuTitle), so
 * the theme voice is preserved.
 */
import type { AppLocale } from './locale';

export interface ServiceDirectoryCopy {
  searchPlaceholder: string;
  allCategories: string;
  sortLabel: string;
  sortDefault: string;
  sortNameAsc: string;
  sortPriceAsc: string;
  sortPriceDesc: string;
  sortDurationAsc: string;
  sortDurationDesc: string;
  clearFilters: string;
  noResults: string;
}

const EN: ServiceDirectoryCopy = {
  searchPlaceholder: 'Search services…',
  allCategories: 'All',
  sortLabel: 'Sort',
  sortDefault: 'Recommended',
  sortNameAsc: 'Name: A to Z',
  sortPriceAsc: 'Price: Low to High',
  sortPriceDesc: 'Price: High to Low',
  sortDurationAsc: 'Duration: Short to Long',
  sortDurationDesc: 'Duration: Long to Short',
  clearFilters: 'Clear Filters',
  noResults: 'No services found',
};

const HI: ServiceDirectoryCopy = {
  searchPlaceholder: 'सेवाएँ खोजें…',
  allCategories: 'सभी',
  sortLabel: 'क्रमबद्ध करें',
  sortDefault: 'अनुशंसित',
  sortNameAsc: 'नाम: A से Z',
  sortPriceAsc: 'कीमत: कम से ज़्यादा',
  sortPriceDesc: 'कीमत: ज़्यादा से कम',
  sortDurationAsc: 'समय: कम से ज़्यादा',
  sortDurationDesc: 'समय: ज़्यादा से कम',
  clearFilters: 'फ़िल्टर साफ़ करें',
  noResults: 'कोई सेवा नहीं मिली',
};

export function serviceDirectoryText(locale: AppLocale): ServiceDirectoryCopy {
  return locale === 'hi' ? HI : EN;
}
