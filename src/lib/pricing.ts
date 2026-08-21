import type { Package, Service, ServiceOffer } from '../types';

export const PROMOTIONAL_BADGES = [
  '20% OFF',
  'Festive Special',
  'Best Seller',
  'New',
  'Limited Time',
  'Premium',
] as const;

export type PromotionalBadgePreset = (typeof PROMOTIONAL_BADGES)[number];

/** Local YYYY-MM-DD value, matching PostgreSQL current_date semantics. */
export function todayDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatDiscountLabel(offer: ServiceOffer): string {
  if (offer.discountType === 'percentage') {
    return `${Math.round(offer.discountValue * 100) / 100}% off`;
  }
  return `₹${offer.discountValue.toLocaleString('en-IN')} off`;
}

export function featuredDiscountLabel(offer: ServiceOffer): string {
  return formatDiscountLabel(offer);
}

/**
 * Client-side mirror of M24's database effective-status function. The database
 * remains authoritative; this makes an already-open preview expire correctly
 * when the date changes without applying an expired offer for one extra render.
 */
export function getOfferEffectiveStatus(
  offer: ServiceOffer,
  today = todayDateKey(),
): ServiceOffer['effectiveStatus'] {
  if (offer.status === 'archived') return 'archived';
  if (offer.status !== 'active') return 'inactive';
  if (offer.endDate < today) return 'expired';
  if (offer.startDate > today) return 'scheduled';
  return 'active';
}

export function isOfferActive(offer: ServiceOffer, today = todayDateKey()): boolean {
  return getOfferEffectiveStatus(offer, today) === 'active';
}

export function offerAppliesToService(
  offer: ServiceOffer,
  service: Service,
  today = todayDateKey(),
): boolean {
  // 1. Theme Isolation Check (Strict)
  const offerTheme = offer.themeKey || offer.themeId;
  const serviceTheme = service.themeKey || service.themeId;
  if (offerTheme && serviceTheme && offerTheme !== serviceTheme) return false;
  if (!offerTheme && !serviceTheme && offer.themeId !== service.themeId) return false;

  // 2. Auto Validation: active offer status & validity dates
  if (!isOfferActive(offer, today)) return false;

  // 3. Auto Validation: service availability
  if (service.status === 'inactive' || service.status === 'archived') return false;

  // 4. Target Mapping Support (single service, multi service, category, theme)
  switch (offer.targetType) {
    case 'theme':
      return true;
    case 'category':
      return (Boolean(service.categoryId) && offer.categoryId === service.categoryId) ||
             (Boolean(service.category) && offer.categoryId === service.category);
    case 'predefined_service':
      return (Boolean(service.predefinedServiceId) && offer.predefinedServiceId === service.predefinedServiceId) ||
             (Boolean(service.name) && offer.predefinedServiceId === service.name) ||
             (Boolean(service.id) && offer.predefinedServiceId === service.id) ||
             (Array.isArray(offer.serviceIds) && offer.serviceIds.includes(service.id));
    case 'saved_service':
      return offer.savedServiceId === service.id ||
             (Array.isArray(offer.serviceIds) && offer.serviceIds.includes(service.id));
    case 'bundle':
      return offer.packageId === service.id ||
             (Array.isArray(offer.serviceIds) && offer.serviceIds.includes(service.id));
  }
}

export function offerAppliesToBundle(
  offer: ServiceOffer,
  bundle: Package,
  today = todayDateKey(),
): boolean {
  // 1. Theme Isolation Check (Strict)
  const offerTheme = offer.themeKey || offer.themeId;
  const bundleTheme = bundle.themeKey || bundle.themeId;
  if (offerTheme && bundleTheme && offerTheme !== bundleTheme) return false;
  if (!offerTheme && !bundleTheme && offer.themeId !== bundle.themeId) return false;

  // 2. Auto Validation: active offer status & validity dates
  if (!isOfferActive(offer, today)) return false;

  // 3. Auto Validation: bundle availability
  if (bundle.status === 'inactive' || bundle.status === 'archived') return false;

  // 4. Target Mapping Support (single combo, multi combo, theme)
  if (offer.targetType === 'theme') return true;
  if (offer.targetType === 'bundle') {
    return offer.packageId === bundle.id || (Array.isArray(offer.serviceIds) && offer.serviceIds.includes(bundle.id));
  }
  if (offer.targetType === 'saved_service' || offer.targetType === 'predefined_service') {
    return offer.savedServiceId === bundle.id ||
           offer.predefinedServiceId === bundle.id ||
           (Array.isArray(offer.serviceIds) && offer.serviceIds.includes(bundle.id));
  }
  return false;
}

export function discountedPrice(price: number, offer?: ServiceOffer): number {
  if (!offer) return price;
  const discounted = offer.discountType === 'percentage'
    ? price * (1 - offer.discountValue / 100)
    : price - offer.discountValue;
  return Math.max(0, Math.round(discounted * 100) / 100);
}

function offerSaving(price: number, offer: ServiceOffer): number {
  return price - discountedPrice(price, offer);
}

/** Picks the applicable active offer that gives the customer the largest saving. */
export function bestServiceOffer(
  service: Service,
  offers: ServiceOffer[] = [],
  price = service.price,
  today = todayDateKey(),
): ServiceOffer | undefined {
  return offers
    .filter((offer) => offerAppliesToService(offer, service, today))
    .sort((a, b) => offerSaving(price, b) - offerSaving(price, a))[0];
}

export function bestBundleOffer(
  bundle: Package,
  offers: ServiceOffer[] = [],
  today = todayDateKey(),
): ServiceOffer | undefined {
  return offers
    .filter((offer) => offerAppliesToBundle(offer, bundle, today))
    .sort((a, b) => offerSaving(bundle.price, b) - offerSaving(bundle.price, a))[0];
}

export function serviceDisplayPrice(
  service: Service,
  offers: ServiceOffer[] = [],
  variantId?: string | null,
  today = todayDateKey(),
): { basePrice: number; finalPrice: number; offer?: ServiceOffer; variantName?: string } {
  const targetVariantId = variantId ?? service.selectedVariantId;
  const variant = targetVariantId
    ? service.pricingVariants?.find((item) => item.id === targetVariantId && item.status === 'active')
    : undefined;
  const basePrice = variant?.price ?? service.price;
  const offer = bestServiceOffer(service, offers, basePrice, today);
  return {
    basePrice,
    finalPrice: discountedPrice(basePrice, offer),
    offer,
    variantName: variant?.name || service.selectedVariantName,
  };
}
