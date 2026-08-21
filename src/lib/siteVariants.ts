import type { Service, ServicePriceVariant } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';

/**
 * Curated theme-specific service pricing variants for key services of all 5 themes.
 * Never shared across themes — every variant is theme-scoped.
 */
export const CURATED_THEME_VARIANTS: Record<SiteHeaderThemeId, Record<string, ServicePriceVariant[]>> = {
  barber_mens_grooming: {
    default: [
      { id: 'v-barber-jr', serviceId: 'barber', name: 'Junior Barber', price: 350, duration: 35, status: 'active', displayOrder: 1 },
      { id: 'v-barber-sr', serviceId: 'barber', name: 'Senior Barber', price: 450, duration: 45, status: 'active', displayOrder: 2 },
      { id: 'v-barber-master', serviceId: 'barber', name: 'Master Barber', price: 600, duration: 50, status: 'active', displayOrder: 3 },
      { id: 'v-barber-inactive', serviceId: 'barber', name: 'Archived Barber Level', price: 200, duration: 20, status: 'inactive', displayOrder: 4 },
    ],
    beard: [
      { id: 'v-beard-express', serviceId: 'beard', name: 'Express Lineup', price: 250, duration: 20, status: 'active', displayOrder: 1 },
      { id: 'v-beard-deluxe', serviceId: 'beard', name: 'Deluxe Hot Towel Care', price: 350, duration: 30, status: 'active', displayOrder: 2 },
      { id: 'v-beard-royal', serviceId: 'beard', name: 'Royal Beard Treatment', price: 500, duration: 45, status: 'active', displayOrder: 3 },
    ],
  },

  hair_studio_color_bar: {
    default: [
      { id: 'v-hair-short', serviceId: 'hair', name: 'Short Length (Above Shoulder)', price: 1500, duration: 45, status: 'active', displayOrder: 1 },
      { id: 'v-hair-medium', serviceId: 'hair', name: 'Medium Length (Shoulder)', price: 1800, duration: 60, status: 'active', displayOrder: 2 },
      { id: 'v-hair-long', serviceId: 'hair', name: 'Long Length (Below Waist)', price: 2200, duration: 75, status: 'active', displayOrder: 3 },
      { id: 'v-hair-inactive', serviceId: 'hair', name: 'Unavailable Length', price: 1000, duration: 30, status: 'inactive', displayOrder: 4 },
    ],
    color: [
      { id: 'v-color-short', serviceId: 'color', name: 'Short Hair Balayage', price: 4500, duration: 150, status: 'active', displayOrder: 1 },
      { id: 'v-color-medium', serviceId: 'color', name: 'Medium Length Balayage', price: 5500, duration: 180, status: 'active', displayOrder: 2 },
      { id: 'v-color-long', serviceId: 'color', name: 'Long Length Balayage', price: 6800, duration: 210, status: 'active', displayOrder: 3 },
    ],
  },

  beauty_skin_spa: {
    default: [
      { id: 'v-spa-45', serviceId: 'spa', name: '45 min Express Therapy', price: 1800, duration: 45, status: 'active', displayOrder: 1 },
      { id: 'v-spa-60', serviceId: 'spa', name: '60 min Signature Therapy', price: 2200, duration: 60, status: 'active', displayOrder: 2 },
      { id: 'v-spa-90', serviceId: 'spa', name: '90 min Royal Spa Ritual', price: 3200, duration: 90, status: 'active', displayOrder: 3 },
      { id: 'v-spa-inactive', serviceId: 'spa', name: '15 min Mini Massage', price: 800, duration: 15, status: 'inactive', displayOrder: 4 },
    ],
    facial: [
      { id: 'v-facial-basic', serviceId: 'facial', name: 'Basic Cleanse Ritual', price: 2000, duration: 45, status: 'active', displayOrder: 1 },
      { id: 'v-facial-deluxe', serviceId: 'facial', name: 'Deluxe HydraFacial', price: 2800, duration: 60, status: 'active', displayOrder: 2 },
      { id: 'v-facial-gold', serviceId: 'facial', name: 'Premium Gold & Collagen Ritual', price: 3600, duration: 75, status: 'active', displayOrder: 3 },
    ],
  },

  family_full_service: {
    default: [
      { id: 'v-fam-jr', serviceId: 'fam', name: 'Junior Stylist', price: 450, duration: 40, status: 'active', displayOrder: 1 },
      { id: 'v-fam-sr', serviceId: 'fam', name: 'Senior Stylist', price: 650, duration: 55, status: 'active', displayOrder: 2 },
      { id: 'v-fam-master', serviceId: 'fam', name: 'Master Specialist', price: 850, duration: 65, status: 'active', displayOrder: 3 },
      { id: 'v-fam-inactive', serviceId: 'fam', name: 'Trainee Rate', price: 200, duration: 30, status: 'inactive', displayOrder: 4 },
    ],
    spa: [
      { id: 'v-spa-express', serviceId: 'famspa', name: 'Express Hair Spa', price: 750, duration: 40, status: 'active', displayOrder: 1 },
      { id: 'v-spa-deep', serviceId: 'famspa', name: 'Deep Restorative Spa', price: 1000, duration: 60, status: 'active', displayOrder: 2 },
      { id: 'v-spa-keratin', serviceId: 'famspa', name: 'Intense Keratin Spa', price: 1400, duration: 75, status: 'active', displayOrder: 3 },
    ],
  },

  nail_lash_studio: {
    default: [
      { id: 'v-nail-short', serviceId: 'nail', name: 'Short Natural Length', price: 1400, duration: 90, status: 'active', displayOrder: 1 },
      { id: 'v-nail-medium', serviceId: 'nail', name: 'Medium Extensions', price: 1800, duration: 120, status: 'active', displayOrder: 2 },
      { id: 'v-nail-long', serviceId: 'nail', name: 'Extra Long Stiletto Set', price: 2400, duration: 150, status: 'active', displayOrder: 3 },
      { id: 'v-nail-inactive', serviceId: 'nail', name: 'Discontinued Length', price: 800, duration: 30, status: 'inactive', displayOrder: 4 },
    ],
    lash: [
      { id: 'v-lash-classic', serviceId: 'lash', name: 'Classic Natural Lash Set', price: 1800, duration: 75, status: 'active', displayOrder: 1 },
      { id: 'v-lash-3d', serviceId: 'lash', name: '3D Volume Lash Set', price: 2200, duration: 90, status: 'active', displayOrder: 2 },
      { id: 'v-lash-russian', serviceId: 'lash', name: 'Mega Volume Russian Set', price: 2800, duration: 120, status: 'active', displayOrder: 3 },
    ],
  },
};

/**
 * Resolves all active variants for a service.
 * First checks `service.pricingVariants`. If empty, resolves theme curated variants for the service.
 */
export function getServiceVariants(
  service: Service,
  themeId: SiteHeaderThemeId,
): ServicePriceVariant[] {
  // If service has explicit active variants, filter active ones
  if (service.pricingVariants && service.pricingVariants.length > 0) {
    return service.pricingVariants.filter((v) => v.status === 'active');
  }

  // Fallback to curated variants by category or service name
  const themeDict = CURATED_THEME_VARIANTS[themeId];
  if (!themeDict) return [];

  const nameLower = (service.name || '').toLowerCase();
  const catLower = (service.category || '').toLowerCase();

  let key = 'default';
  if (nameLower.includes('beard') || nameLower.includes('shave')) key = 'beard';
  else if (nameLower.includes('balayage') || nameLower.includes('color')) key = 'color';
  else if (nameLower.includes('facial') || catLower.includes('facial')) key = 'facial';
  else if (nameLower.includes('spa') || catLower.includes('spa')) key = 'spa';
  else if (nameLower.includes('lash') || catLower.includes('lash')) key = 'lash';

  const raw = themeDict[key] || themeDict.default || [];
  return raw
    .filter((v) => v.status === 'active')
    .map((v) => ({ ...v, serviceId: service.id }));
}

/**
 * Finds a specific active variant by ID.
 */
export function resolveServiceVariant(
  service: Service,
  variantId: string | null | undefined,
  themeId: SiteHeaderThemeId,
): ServicePriceVariant | undefined {
  if (!variantId) return undefined;
  const variants = getServiceVariants(service, themeId);
  return variants.find((v) => v.id === variantId && v.status === 'active');
}

/**
 * Returns a new Service object where price, duration, and variant info are updated
 * to reflect the selected variant.
 */
export function serviceWithSelectedVariant(
  service: Service,
  variantId: string | null | undefined,
  themeId: SiteHeaderThemeId,
): Service {
  const variant = resolveServiceVariant(service, variantId, themeId);
  if (!variant) return service;

  return {
    ...service,
    selectedVariantId: variant.id,
    selectedVariantName: variant.name,
    price: variant.price,
    duration: variant.duration || service.duration,
    name: `${service.name} (${variant.name})`,
  };
}
