import type { CatalogStatus, OfferEffectiveStatus, OfferTargetType, SalonData, Service, ServiceOffer } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { getSuggestedServices } from './themeServices';
import { isOfferActive, discountedPrice, todayDateKey } from './pricing';
import type { AppLocale } from './locale';

export interface ResolvedOffer extends ServiceOffer {
  /** Primary applicable service for this offer */
  service: Service;
  /** Base original price of the applicable service in ₹ */
  originalPrice: number;
  /** Calculated discounted price in ₹ */
  discountedPrice: number;
}

/**
 * Curated theme-specific seed offers for each of the five catalog themes.
 * Each theme gets percentage, fixed, festive, and limited-time offers.
 * Used when a salon has not configured custom offers in `data.offers`.
 */
export const CURATED_THEME_OFFERS: Record<SiteHeaderThemeId, ServiceOffer[]> = {
  barber_mens_grooming: [
    {
      id: 'offer-barber-fade',
      businessId: 'seed-barber',
      themeId: 'barber_mens_grooming',
      themeKey: 'barber_mens_grooming',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Skin Fade',
      savedServiceId: null,
      packageId: null,
      title: "Gentleman's Fade Special",
      description: '20% off precision skin fade and haircut with hot-towel finish.',
      promotionalBadge: 'Festive Special',
      discountType: 'percentage',
      discountValue: 20,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
    {
      id: 'offer-barber-beard',
      businessId: 'seed-barber',
      themeId: 'barber_mens_grooming',
      themeKey: 'barber_mens_grooming',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Beard Sculpting & Lineup',
      savedServiceId: null,
      packageId: null,
      title: 'Executive Beard & Lineup',
      description: 'Flat ₹100 off hot towel beard sculpting and razor lineup.',
      promotionalBadge: 'Limited Time',
      discountType: 'fixed',
      discountValue: 100,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
    {
      id: 'offer-barber-expired',
      businessId: 'seed-barber',
      themeId: 'barber_mens_grooming',
      themeKey: 'barber_mens_grooming',
      targetType: 'theme',
      categoryId: null,
      predefinedServiceId: null,
      savedServiceId: null,
      packageId: null,
      title: 'Winter Shave Special',
      description: 'Expired offer - must never be displayed.',
      promotionalBadge: 'Seasonal',
      discountType: 'percentage',
      discountValue: 15,
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      status: 'active',
      effectiveStatus: 'expired',
    },
  ],

  hair_studio_color_bar: [
    {
      id: 'offer-hair-balayage',
      businessId: 'seed-hair',
      themeId: 'hair_studio_color_bar',
      themeKey: 'hair_studio_color_bar',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Balayage / Ombre',
      savedServiceId: null,
      packageId: null,
      title: 'Balayage & Gloss Festival',
      description: '20% off hand-painted balayage or soft ombre transformation.',
      promotionalBadge: 'Festive Special',
      discountType: 'percentage',
      discountValue: 20,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
    {
      id: 'offer-hair-cut',
      businessId: 'seed-hair',
      themeId: 'hair_studio_color_bar',
      themeKey: 'hair_studio_color_bar',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Signature Cut & Blowdry',
      savedServiceId: null,
      packageId: null,
      title: 'Signature Cut & Blowdry',
      description: 'Flat ₹300 off precision signature cut and glossy blowout.',
      promotionalBadge: 'Limited Time',
      discountType: 'fixed',
      discountValue: 300,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
  ],

  beauty_skin_spa: [
    {
      id: 'offer-spa-hydra',
      businessId: 'seed-spa',
      themeId: 'beauty_skin_spa',
      themeKey: 'beauty_skin_spa',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'HydraFacial',
      savedServiceId: null,
      packageId: null,
      title: 'HydraFacial Glow Ritual',
      description: '25% off multi-step hydradermabrasion facial for instant radiance.',
      promotionalBadge: 'Festive Special',
      discountType: 'percentage',
      discountValue: 25,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
    {
      id: 'offer-spa-massage',
      businessId: 'seed-spa',
      themeId: 'beauty_skin_spa',
      themeKey: 'beauty_skin_spa',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Swedish Body Massage',
      savedServiceId: null,
      packageId: null,
      title: 'Swedish Body Massage',
      description: 'Flat ₹400 off relaxing full-body tension release massage.',
      promotionalBadge: 'Limited Time',
      discountType: 'fixed',
      discountValue: 400,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
  ],

  family_full_service: [
    {
      id: 'offer-family-women',
      businessId: 'seed-family',
      themeId: 'family_full_service',
      themeKey: 'family_full_service',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Haircut & Blowdry',
      savedServiceId: null,
      packageId: null,
      title: 'Family Haircut & Blowdry',
      description: '20% off women’s haircut and bouncy salon blowdry styling.',
      promotionalBadge: 'Festive Special',
      discountType: 'percentage',
      discountValue: 20,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
    {
      id: 'offer-family-men',
      businessId: 'seed-family',
      themeId: 'family_full_service',
      themeKey: 'family_full_service',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Classic Haircut',
      savedServiceId: null,
      packageId: null,
      title: "Men's Classic Haircut",
      description: 'Flat ₹100 off polished men’s haircut with wash and finish.',
      promotionalBadge: 'Limited Time',
      discountType: 'fixed',
      discountValue: 100,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
  ],

  nail_lash_studio: [
    {
      id: 'offer-nail-acrylic',
      businessId: 'seed-nail',
      themeId: 'nail_lash_studio',
      themeKey: 'nail_lash_studio',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Acrylic Nail Extensions',
      savedServiceId: null,
      packageId: null,
      title: 'Acrylic Extension Glam',
      description: '20% off custom sculpted acrylic nail extensions.',
      promotionalBadge: 'Festive Offer',
      discountType: 'percentage',
      discountValue: 20,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
    {
      id: 'offer-nail-pedicure',
      businessId: 'seed-nail',
      themeId: 'nail_lash_studio',
      themeKey: 'nail_lash_studio',
      targetType: 'predefined_service',
      categoryId: null,
      predefinedServiceId: 'Luxury Spa Pedicure',
      savedServiceId: null,
      packageId: null,
      title: 'Luxury Spa Pedicure',
      description: 'Flat ₹200 off softening soak, exfoliation and foot care ritual.',
      promotionalBadge: 'Limited Time',
      discountType: 'fixed',
      discountValue: 200,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    },
  ],
};

/**
 * Returns all active raw offers for a given theme, merging custom `data.offers`
 * with curated theme defaults if custom offers are empty for that theme.
 */
export function rawOffersForTheme(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  today = todayDateKey(),
): ServiceOffer[] {
  const custom = (data.offers || []).filter((offer) => {
    const offerTheme = offer.themeKey || offer.themeId;
    return offerTheme === themeId;
  });

  const source = custom.length > 0 ? custom : CURATED_THEME_OFFERS[themeId] || [];

  return source.filter((offer) => {
    const offerTheme = offer.themeKey || offer.themeId;
    if (offerTheme !== themeId) return false;
    return isOfferActive(offer, today);
  });
}

/**
 * Helper to resolve the primary `Service` object that an offer targets.
 */
export function resolveServiceForOffer(
  offer: ServiceOffer,
  themeId: SiteHeaderThemeId,
  data: SalonData,
): Service {
  const services = (data.services || []).filter((s) => s.status !== 'inactive' && s.status !== 'archived');

  // 1. Try matching in `data.services`
  if (offer.savedServiceId) {
    const found = services.find((s) => s.id === offer.savedServiceId);
    if (found) return found;
  }
  if (offer.predefinedServiceId) {
    const found = services.find(
      (s) => s.predefinedServiceId === offer.predefinedServiceId || s.name === offer.predefinedServiceId || s.id === offer.predefinedServiceId,
    );
    if (found) return { ...found, themeId: found.themeId || themeId, themeKey: found.themeKey || themeId, predefinedServiceId: found.predefinedServiceId || offer.predefinedServiceId };
  }
  if (offer.categoryId) {
    const found = services.find((s) => s.categoryId === offer.categoryId || s.category === offer.categoryId);
    if (found) return { ...found, themeId: found.themeId || themeId, themeKey: found.themeKey || themeId };
  }

  // 2. Fallback to predefined suggested services for the active theme
  const suggested = getSuggestedServices(themeId);
  if (offer.predefinedServiceId) {
    const found = suggested.find(
      (s) => s.name === offer.predefinedServiceId || s.suggestedLabel === offer.predefinedServiceId,
    );
    if (found) {
      return {
        id: `offer-target:${themeId}:${found.name}`,
        themeId,
        themeKey: themeId,
        predefinedServiceId: offer.predefinedServiceId || found.name,
        name: found.name,
        category: found.category,
        description: found.description,
        price: found.price,
        duration: found.duration,
        status: 'active',
      };
    }
  }

  // 3. Fallback to first available active service for the theme
  if (services.length > 0) {
    const first = services[0];
    return { ...first, themeId: first.themeId || themeId, themeKey: first.themeKey || themeId };
  }

  const defaultService = suggested[0];
  return {
    id: `offer-target:${themeId}:${defaultService?.name || 'Service'}`,
    themeId,
    themeKey: themeId,
    predefinedServiceId: offer.predefinedServiceId || defaultService?.name,
    name: defaultService?.name || 'Signature Service',
    category: defaultService?.category || 'General',
    description: defaultService?.description || 'Premium salon care.',
    price: defaultService?.price || 500,
    duration: defaultService?.duration || 30,
    status: 'active',
  };
}

/**
 * Resolves active offers for `themeId`, including target service and calculated prices.
 * Strictly isolates offers by theme and excludes expired or inactive offers.
 */
export function getThemeOffers(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  today = todayDateKey(),
): ResolvedOffer[] {
  const activeOffers = rawOffersForTheme(themeId, data, today);

  return activeOffers.map((offer) => {
    const service = resolveServiceForOffer(offer, themeId, data);
    const originalPrice = service.price;
    const calcPrice = discountedPrice(originalPrice, offer);

    return {
      ...offer,
      description: offer.description || service.description,
      promotionalBadge: offer.promotionalBadge || (offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `₹${offer.discountValue} OFF`),
      themeId,
      service,
      originalPrice,
      discountedPrice: calcPrice,
    };
  });
}

/** Formats dates cleanly for validity display (e.g. "01 Aug 2026 – 31 Aug 2026"). */
export function formatValidityRange(startDate: string, endDate: string, locale: AppLocale = 'en'): string {
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsHi = ['जन', 'फर', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अग', 'सितं', 'अक्टूबर', 'नवंबर', 'दिसं'];

  const parse = (dStr: string) => {
    const parts = dStr.split('-');
    if (parts.length !== 3) return dStr;
    const year = parts[0];
    const mIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
    const day = parts[2];
    const mName = locale === 'hi' ? monthsHi[mIdx] : monthsEn[mIdx];
    return `${day} ${mName} ${year}`;
  };

  return `${parse(startDate)} – ${parse(endDate)}`;
}
