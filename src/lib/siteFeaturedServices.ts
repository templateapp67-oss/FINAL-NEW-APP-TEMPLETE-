/**
 * PHASE 12.2 — FEATURED SERVICES (single engine for all five themes).
 *
 * Resolves the theme's OWN suggested services for the Featured Services section
 * directly below Trust/Stats. It reads the EXISTING theme-specific catalog:
 *
 *   - Database themes (Supabase configured): `loadThemeServiceCatalog(themeId)`
 *     calls the M19 RPC `get_theme_service_catalog(p_theme_id)`, which applies
 *     the `theme_id` filter in SQL and returns only that theme's
 *     `is_suggested = true` services. The response's `theme.theme_id` is
 *     verified to equal the requested theme, so a cross-theme response is
 *     rejected rather than rendered.
 *   - Offline / unconfigured: the SAME curated seed data from the existing
 *     static catalog (`themeServices.getSuggestedServices(themeId)`), keyed by
 *     theme id, so no theme ever shows another theme's services.
 *
 * No new service architecture, no new database structure, and no invented
 * services or prices are introduced — every value comes from the existing
 * M18/M19 catalog (or its identical static seed).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Service, ServiceMedia, ServiceOffer, ServicePriceVariant, ServiceTranslation } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import type { AppLocale } from './locale';
import { isSupabaseConfigured } from './supabaseClient';
import { isDatabaseCatalogTheme, loadThemeServiceCatalog } from './themeCatalogService';
import { getSuggestedServices } from './themeServices';
import { isOfferActive, discountedPrice } from './pricing';
import { HINDI_CATEGORY_NAMES, HINDI_SERVICE_COPY } from './catalogLocaleSeed';

export interface FeaturedService {
  /** Stable identity — the predefined-service UUID (DB) or a static key. */
  key: string;
  /** English primary name (canonical catalog name). */
  name: string;
  description: string;
  category: string;
  /** Base price in ₹. */
  price: number;
  /** Duration in minutes. */
  duration: number;
  /** Optional customer-facing chip label (family / nail suggested aliases). */
  suggestedLabel?: string;
  /** Whether this row is a suggested service (drives the Suggested badge). */
  isSuggested: boolean;
  /** Curation rank — the top-ranked suggested service is "Popular". */
  suggestedSortOrder: number;
  /** Real image/icon when a source provides one; absent for catalog rows. */
  media?: ServiceMedia;
  /** Extra price options — present, a "starting at" price is shown. */
  pricingVariants?: ServicePriceVariant[];
  /** Theme key (e.g. `barber_mens_grooming`) — always present. */
  themeId: SiteHeaderThemeId;
  /** themes-table UUID (database catalog only) for offer matching. */
  themeUuid?: string;
  /** service_categories UUID (database catalog only). */
  categoryId?: string;
  /** predefined_services UUID (database catalog only). */
  predefinedServiceId?: string;
  translations?: ServiceTranslation[];
}

export type FeaturedStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface FeaturedServicesState {
  status: FeaturedStatus;
  services: FeaturedService[];
  retry: () => void;
}

/** Static curated suggested services (same seed data M18 persists). */
function staticFeaturedServices(themeId: SiteHeaderThemeId): FeaturedService[] {
  const hindiServices = HINDI_SERVICE_COPY[themeId] || {};
  return getSuggestedServices(themeId).map((service, index) => {
    const hindi = hindiServices[service.name];
    const translations: ServiceTranslation[] | undefined = hindi
      ? [{ locale: 'hi', name: hindi.name, description: hindi.description }]
      : undefined;
    return {
      key: `static:${themeId}:${service.name}`,
      name: service.name,
      description: service.description,
      category: service.category,
      price: service.price,
      duration: service.duration,
      suggestedLabel: service.suggestedLabel,
      isSuggested: true,
      suggestedSortOrder: index,
      themeId,
      translations,
    };
  });
}

/**
 * Resolves the featured (suggested) services for one theme.
 * Database-first with the existing offline/static fallback; the database path
 * is theme-id-filtered and cross-theme data is rejected.
 */
export async function fetchFeaturedServices(themeId: SiteHeaderThemeId): Promise<FeaturedService[]> {
  if (isSupabaseConfigured && isDatabaseCatalogTheme(themeId)) {
    try {
      const catalog = await loadThemeServiceCatalog(themeId);
      return catalog.suggestedServices.map((service, index) => ({
        key: service.id,
        name: service.name,
        description: service.description,
        category: service.category,
        price: service.price,
        duration: service.duration,
        suggestedLabel: service.suggestedLabel,
        isSuggested: service.isSuggested,
        suggestedSortOrder: service.suggestedSortOrder ?? index,
        themeId,
        themeUuid: service.themeId,
        categoryId: service.categoryId,
        predefinedServiceId: service.id,
        translations: service.translations,
      }));
    } catch {
      return staticFeaturedServices(themeId);
    }
  }
  return staticFeaturedServices(themeId);
}

/**
 * The active offer that applies to a featured service, or undefined.
 * Matches theme-level offers by theme key/UUID, category offers by the
 * category UUID and predefined-service offers by the service UUID.
 */
export function featuredOfferFor(
  service: FeaturedService,
  offers: readonly ServiceOffer[] | undefined,
  themeId: SiteHeaderThemeId,
): ServiceOffer | undefined {
  if (!offers || offers.length === 0) return undefined;
  const candidates = offers.filter((offer) => {
    if (!isOfferActive(offer)) return false;
    if (offer.targetType === 'theme') {
      return offer.themeKey === themeId || (!!service.themeUuid && offer.themeId === service.themeUuid);
    }
    if (offer.targetType === 'category') {
      return Boolean(service.categoryId) && offer.categoryId === service.categoryId;
    }
    if (offer.targetType === 'predefined_service') {
      return Boolean(service.predefinedServiceId) && offer.predefinedServiceId === service.predefinedServiceId;
    }
    return false;
  });
  if (candidates.length === 0) return undefined;
  const saving = (offer: ServiceOffer) => service.price - discountedPrice(service.price, offer);
  return candidates.slice().sort((a, b) => saving(b) - saving(a))[0];
}

/** Offer-aware final price for a featured service. */
export function featuredPrice(service: FeaturedService, offer?: ServiceOffer): { base: number; final: number } {
  return { base: service.price, final: discountedPrice(service.price, offer) };
}

/**
 * PHASE 12.3 — the human-readable discount amount for an active offer.
 * A percentage offer → "20% off"; a fixed offer → "₹100 off". Never a made-up
 * value: both numbers come straight from the offer's `discountValue`.
 */


/**
 * PHASE 12.3 — starting-price support. When a service carries multiple active
 * price options we show the lowest one with a "From" prefix; otherwise the card
 * shows the single base price. Featured catalog rows have one price, so this
 * only kicks in when a source actually provides variants.
 */
export function featuredStartingPrice(service: FeaturedService): { hasVariants: boolean; min: number } {
  const variants = (service.pricingVariants ?? []).filter((variant) => variant.status === 'active');
  const prices = [service.price, ...variants.map((variant) => variant.price)];
  const min = Math.min(...prices);
  return { hasVariants: variants.length > 1, min };
}

/**
 * PHASE 12.3 — converts a featured (catalog) service into a bookable `Service`
 * so the existing booking flow can pre-select it. `themeId` is set to the theme
 * KEY so `bookingServicesForTheme` keeps the row; no booking architecture is
 * changed — the flow's own list is merely handed one extra, already-selected
 * row.
 */
export function featuredServiceToService(featured: FeaturedService, themeId: SiteHeaderThemeId): Service {
  return {
    id: `featured:${themeId}:${featured.key}`,
    themeId,
    themeKey: themeId,
    categoryId: featured.categoryId,
    predefinedServiceId: featured.predefinedServiceId,
    name: featured.name,
    category: featured.category,
    description: featured.description,
    price: featured.price,
    duration: featured.duration,
    translations: featured.translations,
    media: featured.media,
    status: 'active',
  };
}

/** EN / हिन्दी localization of one featured service (catalog seed + DB copy). */
export function localizeFeaturedService(
  service: FeaturedService,
  themeId: SiteHeaderThemeId,
  locale: AppLocale,
): { name: string; description: string; category: string } {
  if (locale === 'hi') {
    const hi = service.translations?.find((item) => item.locale === 'hi');
    const seed = HINDI_SERVICE_COPY[themeId]?.[service.name];
    return {
      name: hi?.name || seed?.name || service.name,
      description: hi?.description || seed?.description || service.description,
      category: HINDI_CATEGORY_NAMES[themeId]?.[service.category] || service.category,
    };
  }
  return { name: service.name, description: service.description, category: service.category };
}

/**
 * PHASE 12.3 — the human-readable discount amount for an active offer.
 * A percentage offer → "20% off"; a fixed offer → "₹100 off". Never a made-up
 * value: both numbers come straight from the offer's `discountValue`.
 */
export function featuredDiscountLabel(offer: ServiceOffer): string {
  if (offer.discountType === 'percentage') {
    return `${Math.round(offer.discountValue * 100) / 100}% off`;
  }
  return `₹${offer.discountValue.toLocaleString('en-IN')} off`;
}

/** Async loader hook with theme-isolation + retry (no stale-theme leakage). */
export function useFeaturedServices(themeId: SiteHeaderThemeId): FeaturedServicesState {
  const [status, setStatus] = useState<FeaturedStatus>('loading');
  const [services, setServices] = useState<FeaturedService[]>([]);
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    let cancelled = false;

    // Clear immediately so a theme switch can never paint a previous theme.
    setStatus('loading');
    setServices([]);

    fetchFeaturedServices(themeId)
      .then((items) => {
        if (cancelled || requestRef.current !== requestId) return;
        setServices(items);
        setStatus(items.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (cancelled || requestRef.current !== requestId) return;
        setServices([]);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [themeId, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);

  return { status, services, retry };
}
