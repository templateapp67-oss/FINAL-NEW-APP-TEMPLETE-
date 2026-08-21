import type { BundleService, CatalogStatus, Package, SalonData, Service } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { getSuggestedServices } from './themeServices';
import type { AppLocale } from './locale';

export interface ResolvedCombo {
  id: string;
  name: string;
  description: string;
  includedServices: BundleService[];
  regularTotal: number;
  comboPrice: number;
  discountAmount: number;
  discountPercentage: number;
  totalDuration: number;
  status: CatalogStatus;
  themeId: SiteHeaderThemeId;
  promotionalBadge?: string;
}

/**
 * Curated theme-specific service combos/packages for each of the 5 catalog themes.
 * Built strictly from existing catalog services of that specific theme.
 */
export const CURATED_THEME_COMBOS: Record<SiteHeaderThemeId, Package[]> = {
  barber_mens_grooming: [
    {
      id: 'combo-barber-executive',
      businessId: 'seed-barber',
      themeId: 'barber_mens_grooming',
      themeKey: 'barber_mens_grooming',
      name: 'The Executive Grooming Trio',
      description: 'Complete head-to-toe grooming: precision skin fade, beard lineup and a relaxing hot towel shave.',
      price: 850,
      duration: 100,
      promotionalBadge: 'Save ₹250',
      status: 'active',
      includedServices: [
        { serviceId: 's-fade', name: 'Skin Fade', category: 'Haircuts', individualPrice: 450, duration: 45, displayOrder: 1 },
        { serviceId: 's-beard', name: 'Beard Sculpting & Lineup', category: 'Beard & Shave', individualPrice: 350, duration: 30, displayOrder: 2 },
        { serviceId: 's-shave', name: 'Hot Towel Classic Shave', category: 'Beard & Shave', individualPrice: 300, duration: 25, displayOrder: 3 },
      ],
    },
    {
      id: 'combo-barber-detox',
      businessId: 'seed-barber',
      themeId: 'barber_mens_grooming',
      themeKey: 'barber_mens_grooming',
      name: 'Master Cut & Beard Detox Combo',
      description: 'Precision scissor cut, beard styling and a deep-cleansing charcoal face detox treatment.',
      price: 999,
      duration: 100,
      promotionalBadge: 'Save ₹251',
      status: 'active',
      includedServices: [
        { serviceId: 's-scut', name: 'Scissors Cut', category: 'Haircuts', individualPrice: 400, duration: 40, displayOrder: 1 },
        { serviceId: 's-beard2', name: 'Beard Sculpting & Lineup', category: 'Beard & Shave', individualPrice: 350, duration: 30, displayOrder: 2 },
        { serviceId: 's-detox', name: 'Charcoal Face Detox', category: 'Grooming & Treatments', individualPrice: 500, duration: 30, displayOrder: 3 },
      ],
    },
  ],

  hair_studio_color_bar: [
    {
      id: 'combo-hair-color-transform',
      businessId: 'seed-hair',
      themeId: 'hair_studio_color_bar',
      themeKey: 'hair_studio_color_bar',
      name: 'Color & Styling Transformation',
      description: 'Signature cut and blowdry paired with dimensional balayage and Olaplex bond repair treatment.',
      price: 8500,
      duration: 300,
      promotionalBadge: 'Save ₹2,300',
      status: 'active',
      includedServices: [
        { serviceId: 's-cut', name: 'Signature Cut & Blowdry', category: 'Styling & Cuts', individualPrice: 1800, duration: 60, displayOrder: 1 },
        { serviceId: 's-balayage', name: 'Balayage / Ombre', category: 'Hair Color', individualPrice: 5500, duration: 180, displayOrder: 2 },
        { serviceId: 's-olaplex', name: 'Olaplex Bond Repair', category: 'Treatments', individualPrice: 3500, duration: 60, displayOrder: 3 },
      ],
    },
    {
      id: 'combo-hair-keratin-glam',
      businessId: 'seed-hair',
      themeId: 'hair_studio_color_bar',
      themeKey: 'hair_studio_color_bar',
      name: 'Cut, Blowout & Keratin Ritual',
      description: 'Face-framing layered cut, luxury blowout and keratin restoration treatment for frizz-free hair.',
      price: 6200,
      duration: 220,
      promotionalBadge: 'Save ₹1,500',
      status: 'active',
      includedServices: [
        { serviceId: 's-layered', name: 'Layered Cut', category: 'Styling & Cuts', individualPrice: 2000, duration: 60, displayOrder: 1 },
        { serviceId: 's-blowout', name: 'Luxury Blowout', category: 'Styling & Cuts', individualPrice: 1200, duration: 40, displayOrder: 2 },
        { serviceId: 's-keratin', name: 'Keratin Restoration', category: 'Treatments', individualPrice: 4500, duration: 120, displayOrder: 3 },
      ],
    },
  ],

  beauty_skin_spa: [
    {
      id: 'combo-spa-glow-sanctuary',
      businessId: 'seed-spa',
      themeId: 'beauty_skin_spa',
      themeKey: 'beauty_skin_spa',
      name: 'Ultimate Glow & Spa Sanctuary',
      description: 'Deep cleansing HydraFacial, Swedish body massage and de-tan brightening treatment.',
      price: 5200,
      duration: 165,
      promotionalBadge: 'Save ₹1,400',
      status: 'active',
      includedServices: [
        { serviceId: 's-hydra', name: 'HydraFacial', category: 'Facial & Skincare', individualPrice: 2800, duration: 60, displayOrder: 1 },
        { serviceId: 's-swedish', name: 'Swedish Body Massage', category: 'Spa & Body', individualPrice: 2200, duration: 60, displayOrder: 2 },
        { serviceId: 's-detan', name: 'De-Tan Brightening', category: 'Facial & Skincare', individualPrice: 1600, duration: 45, displayOrder: 3 },
      ],
    },
    {
      id: 'combo-spa-gold-massage',
      businessId: 'seed-spa',
      themeId: 'beauty_skin_spa',
      themeKey: 'beauty_skin_spa',
      name: 'Gold Facial & Deep Muscle Relief',
      description: '24K Anti-Aging Gold Facial combined with deep tissue muscle tension massage.',
      price: 4200,
      duration: 120,
      promotionalBadge: 'Save ₹1,000',
      status: 'active',
      includedServices: [
        { serviceId: 's-gold', name: 'Anti-Aging Gold Facial', category: 'Facial & Skincare', individualPrice: 2400, duration: 60, displayOrder: 1 },
        { serviceId: 's-deep', name: 'Deep Tissue Massage', category: 'Spa & Body', individualPrice: 2800, duration: 60, displayOrder: 2 },
      ],
    },
  ],

  family_full_service: [
    {
      id: 'combo-family-trio',
      businessId: 'seed-family',
      themeId: 'family_full_service',
      themeKey: 'family_full_service',
      name: 'Family Pamper & Haircare Combo',
      description: 'Single-slot family visit: classic men’s cut, women’s haircut & blowdry, and kids haircut.',
      price: 999,
      duration: 115,
      promotionalBadge: 'Save ₹251',
      status: 'active',
      includedServices: [
        { serviceId: 's-mcut', name: 'Classic Haircut', category: "Men's Services", individualPrice: 350, duration: 35, displayOrder: 1 },
        { serviceId: 's-wcut', name: 'Haircut & Blowdry', category: "Women's Services", individualPrice: 650, duration: 55, displayOrder: 2 },
        { serviceId: 's-kcut', name: 'Kids Haircut', category: 'Kids Special', individualPrice: 250, duration: 25, displayOrder: 3 },
      ],
    },
    {
      id: 'combo-family-pamper',
      businessId: 'seed-family',
      themeId: 'family_full_service',
      themeKey: 'family_full_service',
      name: 'Full Family Refresh Package',
      description: 'A complete family package: beard trim, restorative hair spa and refreshing facial.',
      price: 1650,
      duration: 130,
      promotionalBadge: 'Save ₹400',
      status: 'active',
      includedServices: [
        { serviceId: 's-btrim', name: 'Beard Trim', category: "Men's Services", individualPrice: 250, duration: 25, displayOrder: 1 },
        { serviceId: 's-hspa', name: 'Hair Spa', category: "Women's Services", individualPrice: 1000, duration: 60, displayOrder: 2 },
        { serviceId: 's-facial', name: 'Facial', category: "Women's Services", individualPrice: 800, duration: 45, displayOrder: 3 },
      ],
    },
  ],

  nail_lash_studio: [
    {
      id: 'combo-nail-lash-glam',
      businessId: 'seed-nail',
      themeId: 'nail_lash_studio',
      themeKey: 'nail_lash_studio',
      name: 'Glam Art, Spa & Lash Set',
      description: 'Custom sculpted acrylic extensions, luxury spa pedicure and full eyelash extensions set.',
      price: 4100,
      duration: 285,
      promotionalBadge: 'Save ₹1,100',
      status: 'active',
      includedServices: [
        { serviceId: 's-acrylic', name: 'Acrylic Nail Extensions', category: 'Nail Art & Gel', individualPrice: 1800, duration: 120, displayOrder: 1 },
        { serviceId: 's-pedi', name: 'Luxury Spa Pedicure', category: 'Pedicure & Manicure', individualPrice: 1200, duration: 75, displayOrder: 2 },
        { serviceId: 's-lash', name: 'Eyelash Extensions (Classic/Volume)', category: 'Lash & Brow', individualPrice: 2200, duration: 90, displayOrder: 3 },
      ],
    },
    {
      id: 'combo-nail-mani-brow',
      businessId: 'seed-nail',
      themeId: 'nail_lash_studio',
      themeKey: 'nail_lash_studio',
      name: 'Gel Polish, Manicure & Lash Lift Combo',
      description: 'Smooth gel polish overlay, softening ice cream manicure and lash lift with tint.',
      price: 2550,
      duration: 165,
      promotionalBadge: 'Save ₹700',
      status: 'active',
      includedServices: [
        { serviceId: 's-gel', name: 'Gel Polish Overlay', category: 'Nail Art & Gel', individualPrice: 900, duration: 60, displayOrder: 1 },
        { serviceId: 's-mani', name: 'Ice Cream Manicure', category: 'Pedicure & Manicure', individualPrice: 850, duration: 60, displayOrder: 2 },
        { serviceId: 's-lift', name: 'Lash Lift & Tint', category: 'Lash & Brow', individualPrice: 1500, duration: 45, displayOrder: 3 },
      ],
    },
  ],
};

/**
 * Resolves active combos/packages for a given theme, calculating regular total,
 * combo discount amount & percentage, and total duration.
 * Strictly isolates combos by theme key.
 */
export function getThemeCombos(themeId: SiteHeaderThemeId, data: SalonData): ResolvedCombo[] {
  const custom = (data.packages || []).filter((p) => {
    const pkgTheme = p.themeKey || p.themeId;
    return pkgTheme === themeId && p.status !== 'inactive' && p.status !== 'archived';
  });

  const source = custom.length > 0 ? custom : CURATED_THEME_COMBOS[themeId] || [];

  return source.map((pkg) => {
    const included = pkg.includedServices || [];

    // Calculate regular total price from included services or pkg.originalPrice
    let regularTotal = pkg.originalPrice || 0;
    if (!regularTotal && included.length > 0) {
      regularTotal = included.reduce((sum, item) => sum + (item.individualPrice || 0), 0);
    }
    if (!regularTotal || regularTotal <= pkg.price) {
      regularTotal = Math.round(pkg.price * 1.25);
    }

    // Total duration sum
    let totalDuration = pkg.duration;
    if (!totalDuration && included.length > 0) {
      totalDuration = included.reduce((sum, item) => sum + (item.duration || 0), 0);
    }

    const discountAmount = Math.max(0, regularTotal - pkg.price);
    const discountPercentage = regularTotal > 0 ? Math.round((discountAmount / regularTotal) * 100) : 0;

    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      includedServices: included,
      regularTotal,
      comboPrice: pkg.price,
      discountAmount,
      discountPercentage,
      totalDuration,
      status: pkg.status || 'active',
      themeId,
      promotionalBadge: pkg.promotionalBadge || (discountAmount > 0 ? `Save ₹${discountAmount.toLocaleString('en-IN')}` : 'Special Combo'),
    };
  });
}

/**
 * Converts a `ResolvedCombo` into a bookable `Service` representation
 * so the existing single booking orchestrator (`openSiteBookingForService`)
 * pre-selects it without creating duplicate booking code.
 */
export function comboToBookableService(combo: ResolvedCombo, themeId: SiteHeaderThemeId): Service {
  const serviceNames = combo.includedServices.map((s) => s.name).join(' + ');
  const description = combo.description || `Included: ${serviceNames}`;

  return {
    id: `combo:${themeId}:${combo.id}`,
    themeId,
    themeKey: themeId,
    name: combo.name,
    category: 'Combos & Packages',
    description: `[Combo: ${serviceNames}] ${description}`,
    price: combo.comboPrice,
    duration: combo.totalDuration,
    status: 'active',
  };
}
