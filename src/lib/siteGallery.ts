/**
 * PHASE 14.1 — GALLERY & VISUAL PORTFOLIO data layer (all five themes).
 *
 * ONE shared, theme-scoped gallery architecture. Every theme renders the same
 * `SiteGallery` component, but each theme supplies its OWN content vocabulary
 * and its OWN registered presentation media, so a barber's beard work can
 * never appear on the nail & lash site (and vice versa).
 *
 * Content sources — existing/configured media ONLY, never invented:
 *   1. Owner-configured `SalonData.gallery` (salon photos, work photos,
 *      before & after pairs, portfolio images). Items scoped to another
 *      theme (`themeId`) are excluded.
 *   2. Photos of the ACTIVE theme's own services (`Service.media`) via the
 *      existing Phase 12.4 theme relationship (`directoryServicesForTheme`)
 *      and Phase 12.7 visual resolver (`serviceVisuals`).
 *   3. Per-theme presentation media already shipped with the app (family +
 *      nail themes) — shown only when the owner has not configured any
 *      gallery photo, exactly like the pre-14.1 renderers behaved.
 *
 * No database / service / booking architecture is touched. Unsafe media URLs
 * are rejected through the existing `isSafeMediaUrl` gate.
 */
import type { GalleryImage, SalonData, Service } from '../types';
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';
import { directoryServicesForTheme } from './siteServiceDirectory';
import { serviceVisuals } from './siteServiceVisuals';
import { isSafeMediaUrl, safeMediaUrl } from './siteHero';
import { isCustomerVisibleGalleryItem } from './galleryModeration';

/* ------------------------------------------------------------------ */
/* Normalised gallery item                                             */
/* ------------------------------------------------------------------ */

export type GalleryItemKind = 'photo' | 'beforeAfter';

export interface GalleryItem {
  id: string;
  kind: GalleryItemKind;
  /** Primary image. For a before/after pair this is the AFTER image. */
  src: string;
  alt: string;
  /** Theme-scoped category id (see `GalleryThemeConfig.categories`). */
  category: string;
  /** Before image — only for `kind === 'beforeAfter'`. */
  beforeSrc: string | null;
  beforeAlt: string;
  caption?: string;
  featured: boolean;
  origin: 'owner' | 'service' | 'theme';
  /**
   * PHASE 14.5 — id of the configured service this image belongs to
   * (origin === 'service' only). Resolved back through
   * `galleryServiceForItem` so the gallery can open the EXISTING service
   * detail / booking flow for the correct theme + service.
   */
  serviceId?: string;
}

export interface GalleryThemeMediaItem {
  src: string;
  alt: string;
  /** Existing per-theme i18n key (e.g. `gallery1`) resolved via `siteText`. */
  captionKey?: string;
  category: string;
}

export interface GalleryCategoryConfig {
  id: string;
  label: { en: string; hi: string };
}

export interface GalleryThemeConfig {
  /** Canonical filter categories, in display order. */
  categories: GalleryCategoryConfig[];
  /** Generic owner category tags → theme category id. */
  ownerCategoryMap: Record<string, string>;
  /** Theme service categories → theme category id (service-photo routing). */
  serviceCategoryMap: Record<string, string>;
  /** Existing presentation media — fallback when nothing is configured. */
  themeMedia: GalleryThemeMediaItem[];
  /** Resilient themes keep showing their registered media instead of an
   *  empty/error panel (matching their pre-14.1 behaviour). */
  resilient: boolean;
  /** Responsive grid columns (desktop / tablet / mobile). */
  grid: { desktop: 1 | 2 | 3 | 4 | 5; tablet: 1 | 2 | 3 | 4; mobile: 1 | 2 };
  /** Fixed tile aspect ratio (prevents layout shift). */
  tileRatio: string;
  /** Featured banner aspect ratio per viewport. */
  bannerRatio: { desktop: string; tablet: string; mobile: string };
}

const CATEGORY_SALON = 'salon';

export const GALLERY_CATEGORY_IDS = {
  salon: CATEGORY_SALON,
  haircut: 'haircut',
  beard: 'beard',
  grooming: 'grooming',
  cuts: 'cuts',
  color: 'color',
  treatments: 'treatments',
  facial: 'facial',
  spa: 'spa',
  makeup: 'makeup',
  men: 'men',
  women: 'women',
  kids: 'kids',
  nailArt: 'nailArt',
  maniPedi: 'maniPedi',
  lash: 'lash',
  beforeAfter: 'beforeAfter',
} as const;

export type GalleryCategoryId = (typeof GALLERY_CATEGORY_IDS)[keyof typeof GALLERY_CATEGORY_IDS];

/**
 * Per-theme gallery vocabulary. Each theme owns its categories and its media;
 * no image id, category label or registered media item is shared across
 * themes.
 */
export const GALLERY_THEME_CONFIG: Record<SiteHeaderThemeId, GalleryThemeConfig> = {
  /* Barber → men's grooming / haircut / beard work. */
  barber_mens_grooming: {
    categories: [
      { id: 'salon', label: { en: 'The Shop', hi: 'दुकान' } },
      { id: 'haircut', label: { en: 'Haircut Work', hi: 'हेयरकट वर्क' } },
      { id: 'beard', label: { en: 'Beard Work', hi: 'दाढ़ी वर्क' } },
      { id: 'grooming', label: { en: 'Grooming', hi: 'ग्रूमिंग' } },
    ],
    ownerCategoryMap: {
      Interior: 'salon',
      Details: 'salon',
      General: 'salon',
      Hair: 'haircut',
      Barber: 'beard',
      Beauty: 'salon',
    },
    serviceCategoryMap: {
      Haircuts: 'haircut',
      'Beard & Shave': 'beard',
      'Grooming & Treatments': 'grooming',
    },
    themeMedia: [],
    resilient: false,
    grid: { desktop: 3, tablet: 3, mobile: 2 },
    tileRatio: '1/1',
    bannerRatio: { desktop: '21/9', tablet: '16/9', mobile: '4/3' },
  },

  /* Hair Studio → haircuts / color / styling / treatments. */
  hair_studio_color_bar: {
    categories: [
      { id: 'salon', label: { en: 'The Studio', hi: 'स्टूडियो' } },
      { id: 'cuts', label: { en: 'Cuts & Styling', hi: 'कट और स्टाइलिंग' } },
      { id: 'color', label: { en: 'Color Work', hi: 'कलर वर्क' } },
      { id: 'treatments', label: { en: 'Treatments', hi: 'ट्रीटमेंट' } },
    ],
    ownerCategoryMap: {
      Interior: 'salon',
      Details: 'salon',
      General: 'salon',
      Hair: 'cuts',
      Barber: 'cuts',
      Beauty: 'salon',
    },
    serviceCategoryMap: {
      'Styling & Cuts': 'cuts',
      'Hair Color': 'color',
      Treatments: 'treatments',
    },
    themeMedia: [],
    resilient: false,
    grid: { desktop: 3, tablet: 3, mobile: 2 },
    tileRatio: '4/5',
    bannerRatio: { desktop: '21/9', tablet: '16/9', mobile: '4/3' },
  },

  /* Beauty/Spa → facial / skincare / spa / makeup. */
  beauty_skin_spa: {
    categories: [
      { id: 'salon', label: { en: 'The Space', hi: 'हमारी जगह' } },
      { id: 'facial', label: { en: 'Facials & Skincare', hi: 'फेशियल और स्किनकेयर' } },
      { id: 'spa', label: { en: 'Spa & Body', hi: 'स्पा और बॉडी' } },
      { id: 'makeup', label: { en: 'Makeup', hi: 'मेकअप' } },
    ],
    ownerCategoryMap: {
      Interior: 'salon',
      Details: 'salon',
      General: 'salon',
      Hair: 'salon',
      Barber: 'salon',
      Beauty: 'facial',
    },
    serviceCategoryMap: {
      'Facial & Skincare': 'facial',
      'Spa & Body': 'spa',
      'Waxing & Threading': 'spa',
      Makeup: 'makeup',
    },
    themeMedia: [],
    resilient: false,
    grid: { desktop: 3, tablet: 3, mobile: 2 },
    tileRatio: '1/1',
    bannerRatio: { desktop: '21/9', tablet: '16/9', mobile: '4/3' },
  },

  /* Family Salon → men / women / kids / salon work. */
  family_full_service: {
    categories: [
      { id: 'salon', label: { en: 'Around the Salon', hi: 'सैलून में' } },
      { id: 'men', label: { en: 'Men', hi: 'पुरुष' } },
      { id: 'women', label: { en: 'Women', hi: 'महिलाएँ' } },
      { id: 'kids', label: { en: 'Kids', hi: 'बच्चे' } },
    ],
    ownerCategoryMap: {
      Interior: 'salon',
      Details: 'salon',
      General: 'salon',
      Hair: 'women',
      Barber: 'men',
      Beauty: 'women',
    },
    serviceCategoryMap: {
      "Men's Services": 'men',
      "Women's Services": 'women',
      'Kids Special': 'kids',
      Combos: 'salon',
    },
    /** Pre-14.1 family gallery fallback media — registered for THIS theme only. */
    themeMedia: [
      {
        src: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1000&auto=format&fit=crop',
        alt: 'Bright family salon interior',
        captionKey: 'gallery1',
        category: 'salon',
      },
      {
        src: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=900&auto=format&fit=crop',
        alt: 'Salon tools ready for a family appointment',
        captionKey: 'gallery2',
        category: 'salon',
      },
      {
        src: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=900&auto=format&fit=crop',
        alt: 'Fresh salon hairstyle',
        captionKey: 'gallery3',
        category: 'women',
      },
      {
        src: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=900&auto=format&fit=crop',
        alt: 'Stylist working in a modern salon',
        captionKey: 'gallery4',
        category: 'salon',
      },
    ],
    resilient: true,
    grid: { desktop: 3, tablet: 2, mobile: 2 },
    tileRatio: '4/3',
    bannerRatio: { desktop: '21/9', tablet: '16/9', mobile: '4/3' },
  },

  /* Nail/Lash → nail art / manicure / pedicure / lash / brow work. */
  nail_lash_studio: {
    categories: [
      { id: 'salon', label: { en: 'The Studio', hi: 'स्टूडियो' } },
      { id: 'nailArt', label: { en: 'Nail Art', hi: 'नेल आर्ट' } },
      { id: 'maniPedi', label: { en: 'Manicure & Pedicure', hi: 'मैनीक्योर और पेडीक्योर' } },
      { id: 'lash', label: { en: 'Lash & Brow', hi: 'लैश और ब्रो' } },
    ],
    ownerCategoryMap: {
      Interior: 'salon',
      Details: 'salon',
      General: 'salon',
      Hair: 'salon',
      Barber: 'salon',
      Beauty: 'nailArt',
    },
    serviceCategoryMap: {
      'Nail Art & Gel': 'nailArt',
      'Pedicure & Manicure': 'maniPedi',
      'Lash & Brow': 'lash',
    },
    /** Pre-14.1 nail/lash gallery showcase — registered for THIS theme only. */
    themeMedia: [
      {
        src: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1000&auto=format&fit=crop',
        alt: 'Pink and chrome nail art',
        captionKey: 'gallery1',
        category: 'nailArt',
      },
      {
        src: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1000&auto=format&fit=crop',
        alt: 'Nude nail art detail',
        captionKey: 'gallery2',
        category: 'nailArt',
      },
      {
        src: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?q=80&w=1000&auto=format&fit=crop',
        alt: 'Lash beauty closeup',
        captionKey: 'gallery3',
        category: 'lash',
      },
      {
        src: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1000&auto=format&fit=crop',
        alt: 'Glossy custom nail design',
        captionKey: 'gallery4',
        category: 'nailArt',
      },
      {
        src: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1000&auto=format&fit=crop',
        alt: 'Dark glamorous nail set',
        captionKey: 'gallery5',
        category: 'nailArt',
      },
    ],
    resilient: true,
    grid: { desktop: 5, tablet: 3, mobile: 2 },
    tileRatio: '4/5',
    bannerRatio: { desktop: '21/9', tablet: '16/9', mobile: '4/3' },
  },
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export function galleryThemeConfig(themeId: SiteHeaderThemeId): GalleryThemeConfig {
  return GALLERY_THEME_CONFIG[themeId] || GALLERY_THEME_CONFIG.barber_mens_grooming;
}

/** The theme's registered presentation media (empty for barber/hair/spa). */
export function galleryThemeMedia(themeId: SiteHeaderThemeId): GalleryThemeMediaItem[] {
  return galleryThemeConfig(themeId).themeMedia;
}

/** Maps a generic owner category tag onto the active theme's vocabulary. */
export function mapOwnerGalleryCategory(themeId: SiteHeaderThemeId, category: string | undefined): string {
  const config = galleryThemeConfig(themeId);
  const key = (category || 'General').trim();
  return config.ownerCategoryMap[key] || 'salon';
}

/** Maps an active-theme service category onto the gallery vocabulary. */
export function mapServiceGalleryCategory(themeId: SiteHeaderThemeId, category: string): string {
  const config = galleryThemeConfig(themeId);
  return config.serviceCategoryMap[category] || 'salon';
}

export function galleryCategoryLabel(
  themeId: SiteHeaderThemeId,
  categoryId: string,
  locale: AppLocale,
): string {
  const config = galleryThemeConfig(themeId);
  const found = config.categories.find((cat) => cat.id === categoryId);
  if (!found) return categoryId;
  return found.label[locale] || found.label.en;
}

/** An owner gallery item belongs to the active theme unless explicitly scoped. */
export function ownerGalleryItemBelongsToTheme(item: GalleryImage, themeId: SiteHeaderThemeId): boolean {
  return !item.themeId || item.themeId === themeId;
}

/**
 * Normalises ONE owner gallery item for the active theme.
 * Returns `null` for unsafe/empty URLs or foreign-theme items.
 */
export function ownerGalleryItemForTheme(
  item: GalleryImage | null | undefined,
  themeId: SiteHeaderThemeId,
  salonName: string,
  locale: AppLocale,
): GalleryItem | null {
  if (!item || typeof item !== 'object') return null;
  if (!ownerGalleryItemBelongsToTheme(item, themeId)) return null;
  // PHASE 14.6 + 14.7 — deactivated / pending / rejected owner items are
  // hidden from the customer gallery (only approved + active is public).
  if (!isCustomerVisibleGalleryItem(item)) return null;
  const src = safeMediaUrl(item.url);
  if (!src) return null;

  const category = mapOwnerGalleryCategory(themeId, item.category);
  const beforeSrc = isSafeMediaUrl(item.beforeUrl) ? safeMediaUrl(item.beforeUrl) : null;
  const hasBeforeAfter = !!beforeSrc && beforeSrc !== src;
  const alt = (item.alt || '').trim() || `${salonName} — ${galleryCategoryLabel(themeId, category, locale)}`;
  return {
    id: `owner:${item.id}`,
    kind: hasBeforeAfter ? 'beforeAfter' : 'photo',
    src,
    alt,
    category,
    beforeSrc: hasBeforeAfter ? beforeSrc : null,
    beforeAlt: (item.beforeAlt || '').trim() || `${salonName} — before`,
    caption: (item.caption || '').trim() || undefined,
    featured: item.featured === true,
    origin: 'owner',
  };
}

/**
 * Photos of the ACTIVE theme's own services (existing configured
 * `Service.media` only). The theme relationship in `directoryServicesForTheme`
 * guarantees a foreign theme's service photo can never leak in.
 */
export function serviceGalleryItemsForTheme(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  locale: AppLocale,
): GalleryItem[] {
  const services: Service[] = directoryServicesForTheme(data, themeId);
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  for (const service of services) {
    const visuals = serviceVisuals(service, locale);
    const src = safeMediaUrl(visuals.url);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    items.push({
      id: `service:${service.id || src}`,
      kind: 'photo',
      src,
      alt: visuals.alt || service.name,
      category: mapServiceGalleryCategory(themeId, service.category),
      beforeSrc: null,
      beforeAlt: '',
      featured: false,
      origin: 'service',
      serviceId: service.id,
    });
  }
  return items;
}

/**
 * Builds the complete, deduplicated gallery for the active theme:
 * owner photos → active-theme service photos → theme media (fallback only).
 */
export function galleryItemsForTheme(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  locale: AppLocale = 'en',
  ownerDataOnly = false,
): GalleryItem[] {
  const config = galleryThemeConfig(themeId);
  const items: GalleryItem[] = [];
  const seen = new Set<string>();

  for (const raw of data.gallery || []) {
    const item = ownerGalleryItemForTheme(raw, themeId, data.salonName || '', locale);
    if (!item) continue;
    if (seen.has(item.src)) continue;
    seen.add(item.src);
    items.push(item);
  }

  for (const item of serviceGalleryItemsForTheme(themeId, data, locale)) {
    if (seen.has(item.src)) continue;
    seen.add(item.src);
    items.push(item);
  }

  // Registered presentation media — only when the owner has not configured
  // any gallery photo (the pre-14.1 fallback behaviour of family + nail).
  if (!ownerDataOnly && items.length === 0 && config.themeMedia.length > 0) {
    config.themeMedia.forEach((media, index) => {
      const src = safeMediaUrl(media.src);
      if (!src || seen.has(src)) return;
      seen.add(src);
      items.push({
        id: `theme:${index + 1}`,
        kind: 'photo',
        src,
        alt: media.alt,
        category: media.category,
        beforeSrc: null,
        beforeAlt: '',
        caption: media.captionKey,
        featured: false,
        origin: 'theme',
      });
    });
  }

  // Mark a featured item when the owner flagged one; otherwise feature the first.
  const flagged = items.find((item) => item.featured);
  if (!flagged && items.length > 0) items[0].featured = true;
  return items;
}

export interface GalleryFilterOption {
  id: string;
  /** `category` filters by item.category; `beforeAfter` filters by kind. */
  kind: 'category' | 'beforeAfter';
  label: { en: string; hi: string };
}

/** Filter chips for the active theme — only categories that have items. */
export function galleryFilterOptions(
  themeId: SiteHeaderThemeId,
  items: readonly GalleryItem[],
): GalleryFilterOption[] {
  const config = galleryThemeConfig(themeId);
  const options: GalleryFilterOption[] = [];
  for (const category of config.categories) {
    if (items.some((item) => item.category === category.id)) {
      options.push({ id: category.id, kind: 'category', label: category.label });
    }
  }
  if (items.some((item) => item.kind === 'beforeAfter')) {
    options.push({
      id: 'beforeAfter',
      kind: 'beforeAfter',
      label: { en: 'Before & After', hi: 'पहले और बाद' },
    });
  }
  return options;
}

/** Applies the selected filter ('' or 'all' = everything). */
export function filterGalleryItems(
  items: readonly GalleryItem[],
  filterId: string | null,
  options: readonly GalleryFilterOption[],
): GalleryItem[] {
  if (!filterId || filterId === 'all') return items.slice();
  const option = options.find((opt) => opt.id === filterId);
  if (!option) return items.slice();
  if (option.kind === 'beforeAfter') return items.filter((item) => item.kind === 'beforeAfter');
  return items.filter((item) => item.category === filterId);
}

/** The item the featured banner spotlights (first `featured` item). */
export function galleryFeaturedItem(items: readonly GalleryItem[]): GalleryItem | null {
  return items.find((item) => item.featured) || items[0] || null;
}

/**
 * PHASE 14.5 — resolves the configured service a gallery item belongs to.
 *
 * Only service-origin items with a `serviceId` resolve, and the lookup is
 * constrained to the ACTIVE theme's own services via
 * `directoryServicesForTheme`, so a foreign theme's service can never be
 * mapped. Invalid / missing references fail gracefully (`null`) — the gallery
 * simply shows no service CTA and never breaks.
 */
export function galleryServiceForItem(
  item: GalleryItem | null | undefined,
  data: SalonData,
  themeId: SiteHeaderThemeId,
): Service | null {
  if (!item || item.origin !== 'service' || !item.serviceId) return null;
  const service = directoryServicesForTheme(data, themeId).find((candidate) => candidate.id === item.serviceId);
  return service || null;
}
