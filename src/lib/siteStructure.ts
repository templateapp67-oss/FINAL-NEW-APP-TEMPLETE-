/**
 * PHASE 10.3 — GLOBAL WEBSITE STRUCTURE
 *
 * Canonical public-website section order for all five themes.
 * Visual identity stays in each renderer; this file only owns
 * order, ids, viewport helpers and dynamic-section state.
 *
 * Do not change database architecture or Phase 10.1 / 10.2
 * header / language / dark-mode behaviour from here.
 */
import type { Package, SalonData, Service, ServiceOffer, SocialVideo } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';

/** Fixed section order — identical across every theme. */
export const SITE_SECTION_ORDER = [
  'announcement',
  'header',
  'hero',
  'trust',
  'featured',
  'services',
  'offers',
  'gallery',
  'videos',
  'about',
  'owner',
  'team',
  'reviews',
  'location',
  'booking',
  'footer',
] as const;

export type SiteSectionKey = (typeof SITE_SECTION_ORDER)[number];

/**
 * Default DOM ids. Some themes keep a legacy nav target (family combos,
 * nail service-menu) via `SITE_SECTION_ID_ALIASES` so Phase 10.1
 * navigation does not need to be rewritten.
 */
export const SITE_SECTION_IDS: Record<SiteSectionKey, string> = {
  announcement: 'section-announcement',
  header: 'section-header',
  hero: 'section-hero',
  trust: 'section-trust',
  featured: 'section-featured-services',
  services: 'section-services',
  offers: 'section-offers',
  gallery: 'section-gallery',
  videos: 'section-social',
  about: 'section-about',
  owner: 'section-owner',
  team: 'section-team',
  reviews: 'section-reviews',
  location: 'section-location',
  booking: 'section-booking',
  footer: 'section-footer',
};

/** Extra ids that already exist and must keep working for nav / 10.1. */
export const SITE_SECTION_ID_ALIASES: Partial<Record<SiteHeaderThemeId, Partial<Record<SiteSectionKey, string>>>> = {
  family_full_service: {
    offers: 'section-combos',
    reviews: 'section-testimonials',
  },
  nail_lash_studio: {
    offers: 'section-service-menu',
    reviews: 'section-testimonials',
  },
};

export type ViewportMode = 'desktop' | 'tablet' | 'mobile';

export function headerModeOf(mode: ViewportMode): 'desktop' | 'mobile' {
  return mode === 'mobile' ? 'mobile' : 'desktop';
}

export function isCompactViewport(mode: ViewportMode): boolean {
  return mode === 'mobile';
}

const GRID: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

/** Complete class strings so Tailwind can see them at build time. */
export function siteGrid(
  mode: ViewportMode,
  cols: { desktop: 1 | 2 | 3 | 4 | 5; tablet?: 1 | 2 | 3 | 4; mobile: 1 | 2 },
): string {
  const tablet = cols.tablet ?? (cols.desktop > 2 ? 2 : cols.desktop);
  if (mode === 'desktop') return GRID[cols.desktop];
  if (mode === 'tablet') return GRID[tablet];
  return GRID[cols.mobile];
}

export function siteFrameClass(mode: ViewportMode, rounded = 'rounded-xl'): string {
  if (mode === 'desktop') return `w-full max-w-[950px] ${rounded}`;
  if (mode === 'tablet') return `w-full max-w-[768px] ${rounded}`;
  return `w-full max-w-[390px] max-h-[852px] ${rounded}`;
}

export type SectionStatus = 'loading' | 'empty' | 'error' | 'ready';

export type WebsiteSectionFlags = Partial<Record<SiteSectionKey, SectionStatus>>;

let injectedFlags: WebsiteSectionFlags = {};

/** Test-only hook so suites can force loading / error / empty without DB changes. */
export function setWebsiteSectionFlagsForTests(flags: WebsiteSectionFlags = {}): void {
  injectedFlags = flags;
}

export function activeCatalogItems<T extends { status?: string }>(items: readonly T[] | undefined): T[] {
  return (items || []).filter((item) => item.status !== 'inactive' && item.status !== 'archived');
}

export function resolveSectionState(
  key: SiteSectionKey,
  items: readonly unknown[] | undefined,
): SectionStatus {
  const forced = injectedFlags[key];
  if (forced === 'loading' || forced === 'error' || forced === 'empty') return forced;
  if (!items || items.length === 0) return 'empty';
  return 'ready';
}

/**
 * PHASE 12.2 — exposes a test-injected override for one section, or null.
 * Lets sections that have their OWN natural loading/error lifecycle (e.g. the
 * async Featured Services catalog load) still honour the shared
 * `setWebsiteSectionFlagsForTests` seam without collapsing natural states.
 */
export function injectedSectionStatus(key: SiteSectionKey): SectionStatus | null {
  const forced = injectedFlags[key];
  if (forced === 'loading' || forced === 'error' || forced === 'empty') return forced;
  return null;
}

export function liveOffers(offers: readonly ServiceOffer[] | undefined): ServiceOffer[] {
  return (offers || []).filter((offer) => offer.effectiveStatus === 'active' && offer.status === 'active');
}

export function featuredServices(services: readonly Service[] | undefined, limit = 4): Service[] {
  const active = activeCatalogItems(services);
  const flagged = active.filter((service) => service.featured);
  const source = flagged.length > 0 ? flagged : active;
  return source.slice(0, limit);
}

export function announcementOffer(data: SalonData): { title: string; badge?: string } | null {
  const offer = liveOffers(data.offers)[0];
  if (offer) return { title: offer.title, badge: offer.promotionalBadge };
  const bundle = activeCatalogItems(data.packages)[0];
  if (bundle) return { title: bundle.name, badge: bundle.promotionalBadge };
  return null;
}

export function siteSectionDomId(themeId: SiteHeaderThemeId, key: SiteSectionKey): string {
  return SITE_SECTION_ID_ALIASES[themeId]?.[key] || SITE_SECTION_IDS[key];
}

export function sectionProps(
  key: SiteSectionKey,
  status: SectionStatus,
  id = SITE_SECTION_IDS[key],
): {
  id: string;
  'data-site-section': SiteSectionKey;
  'data-section-state': SectionStatus;
} {
  return {
    id,
    'data-site-section': key,
    'data-section-state': status,
  };
}

export function collectSiteSectionOrder(root: ParentNode | null | undefined): SiteSectionKey[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll('[data-site-section]'))
    .map((el) => el.getAttribute('data-site-section') as SiteSectionKey)
    .filter(Boolean);
}

/** Presentation-only reel placeholders used when a theme has no owner videos. */
export function fallbackVideos(themeId: SiteHeaderThemeId): SocialVideo[] {
  const common = (id: string, title: string, thumb: string): SocialVideo => ({
    id,
    title,
    platform: 'instagram',
    url: '#section-social',
    thumbnailUrl: thumb,
    likesCount: '1.2k',
  });
  if (themeId === 'family_full_service') {
    return [
      common('fv1', 'Family Saturday at the salon', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop'),
      common('fv2', 'Kids first-cut smiles', 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=600&auto=format&fit=crop'),
    ];
  }
  if (themeId === 'nail_lash_studio') {
    return [
      common('nv1', 'Chrome aura set, close-up', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop'),
      common('nv2', 'Lash lift, soft volume', 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?q=80&w=600&auto=format&fit=crop'),
    ];
  }
  return [];
}
