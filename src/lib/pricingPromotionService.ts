import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CatalogStatus,
  DiscountType,
  OfferEffectiveStatus,
  OfferTargetType,
  Package,
  Service,
  ServiceOffer,
  ServicePriceVariant,
} from '../types';
import type { DatabaseCatalogThemeId } from './themeCatalogService';
import { requireSupabase } from './supabaseClient';

type UnknownRecord = Record<string, unknown>;

export interface ThemeCommerce {
  businessId: string;
  themeId: DatabaseCatalogThemeId;
  themeUuid: string;
  serviceBadges: Map<string, string>;
  variants: ServicePriceVariant[];
  bundles: Package[];
  offers: ServiceOffer[];
}

export interface PricingVariantInput {
  id?: string | null;
  serviceId: string;
  name: string;
  price: number;
  duration?: number | null;
  status: CatalogStatus;
}

export interface BundleInput {
  categoryId?: string | null;
  name: string;
  description: string;
  serviceIds: string[];
  discountType: DiscountType;
  discountValue: number;
  promotionalBadge?: string;
  status: CatalogStatus;
}

export interface OfferInput {
  targetType: OfferTargetType;
  categoryId?: string | null;
  predefinedServiceId?: string | null;
  savedServiceId?: string | null;
  packageId?: string | null;
  title: string;
  promotionalBadge: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive';
}

export class PricingPromotionError extends Error {
  constructor(message = 'Unable to update pricing and promotions. Please try again.') {
    super(message);
    this.name = 'PricingPromotionError';
  }
}

const asRecord = (value: unknown, label: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PricingPromotionError(`Invalid ${label} returned by the database.`);
  }
  return value as UnknownRecord;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value) {
    throw new PricingPromotionError(`Invalid ${label} returned by the database.`);
  }
  return value;
};

const asNullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : asString(value, 'identifier');

const asNumber = (value: unknown, label: string): number => {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new PricingPromotionError(`Invalid ${label} returned by the database.`);
  return number;
};

const asStatus = (value: unknown): CatalogStatus => {
  const status = asString(value, 'status');
  if (status !== 'active' && status !== 'inactive' && status !== 'archived') {
    throw new PricingPromotionError('Invalid status returned by the database.');
  }
  return status;
};

const asDiscountType = (value: unknown): DiscountType => {
  const type = asString(value, 'discount type');
  if (type !== 'percentage' && type !== 'fixed') {
    throw new PricingPromotionError('Invalid discount type returned by the database.');
  }
  return type;
};

const safeDatabaseMessage = (error: unknown, fallback: string): PricingPromotionError => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  if (raw) console.error('Pricing/promotion RPC failed:', error);
  const safe = /log in|salon|not found|does not belong|must|required|discount|date|target|cannot|active theme/i.test(raw);
  return new PricingPromotionError(safe ? raw : fallback);
};

async function rpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  fallback: string,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw safeDatabaseMessage(error, fallback);
  return data;
}

function mapVariant(rawValue: unknown, businessId: string, themeUuid: string): ServicePriceVariant {
  const raw = asRecord(rawValue, 'pricing variant');
  if (asString(raw.business_id, 'variant business') !== businessId
      || asString(raw.theme_id, 'variant theme') !== themeUuid) {
    throw new PricingPromotionError('Cross-theme pricing data was rejected.');
  }
  return {
    id: asString(raw.id, 'variant id'),
    serviceId: asString(raw.service_id, 'variant service'),
    name: asString(raw.name, 'variant name'),
    price: asNumber(raw.price_paise, 'variant price') / 100,
    duration: raw.duration_minutes == null ? undefined : asNumber(raw.duration_minutes, 'variant duration'),
    status: asStatus(raw.status),
    displayOrder: asNumber(raw.display_order, 'variant order'),
  };
}

function mapBundle(rawValue: unknown, businessId: string, themeId: DatabaseCatalogThemeId, themeUuid: string): Package {
  const raw = asRecord(rawValue, 'bundle');
  if (asString(raw.business_id, 'bundle business') !== businessId
      || asString(raw.theme_id, 'bundle theme') !== themeUuid
      || asString(raw.theme_key, 'bundle theme key') !== themeId) {
    throw new PricingPromotionError('Cross-theme bundle data was rejected.');
  }
  const items = Array.isArray(raw.included_services) ? raw.included_services : [];
  const discountType = asDiscountType(raw.discount_type);
  return {
    id: asString(raw.id, 'bundle id'),
    businessId,
    themeId: themeUuid,
    themeKey: themeId,
    categoryId: asNullableString(raw.category_id),
    name: asString(raw.name, 'bundle name'),
    description: typeof raw.description === 'string' ? raw.description : '',
    originalPrice: asNumber(raw.original_price_paise, 'bundle original price') / 100,
    price: asNumber(raw.price_paise, 'bundle final price') / 100,
    duration: asNumber(raw.duration_minutes, 'bundle duration'),
    discountType,
    discountValue: discountType === 'percentage'
      ? asNumber(raw.discount_percentage, 'bundle percentage')
      : asNumber(raw.fixed_discount_paise, 'bundle fixed discount') / 100,
    promotionalBadge: typeof raw.promotional_badge === 'string' ? raw.promotional_badge : undefined,
    status: asStatus(raw.status),
    includedServices: items.map((itemValue) => {
      const item = asRecord(itemValue, 'bundle service');
      return {
        serviceId: asString(item.service_id, 'bundle service id'),
        name: asString(item.name, 'bundle service name'),
        category: typeof item.category === 'string' ? item.category : '',
        individualPrice: asNumber(item.individual_price_paise, 'individual price') / 100,
        duration: asNumber(item.duration_minutes, 'individual duration'),
        displayOrder: asNumber(item.display_order, 'bundle service order'),
      };
    }),
  };
}

function mapOffer(rawValue: unknown, businessId: string, themeId: DatabaseCatalogThemeId, themeUuid: string): ServiceOffer {
  const raw = asRecord(rawValue, 'offer');
  if (asString(raw.business_id, 'offer business') !== businessId
      || asString(raw.theme_id, 'offer theme') !== themeUuid
      || asString(raw.theme_key, 'offer theme key') !== themeId) {
    throw new PricingPromotionError('Cross-theme offer data was rejected.');
  }
  const targetType = asString(raw.target_type, 'offer target') as OfferTargetType;
  if (!['theme', 'category', 'predefined_service', 'saved_service', 'bundle'].includes(targetType)) {
    throw new PricingPromotionError('Invalid offer target returned by the database.');
  }
  const effectiveStatus = asString(raw.effective_status, 'offer effective status') as OfferEffectiveStatus;
  if (!['active', 'inactive', 'archived', 'scheduled', 'expired'].includes(effectiveStatus)) {
    throw new PricingPromotionError('Invalid offer effective status returned by the database.');
  }
  const discountType = asDiscountType(raw.discount_type);
  return {
    id: asString(raw.id, 'offer id'),
    businessId,
    themeId: themeUuid,
    themeKey: themeId,
    targetType,
    categoryId: asNullableString(raw.category_id),
    predefinedServiceId: asNullableString(raw.predefined_service_id),
    savedServiceId: asNullableString(raw.saved_service_id),
    packageId: asNullableString(raw.package_id),
    title: asString(raw.title, 'offer title'),
    promotionalBadge: asString(raw.promotional_badge, 'offer badge'),
    discountType,
    discountValue: discountType === 'percentage'
      ? asNumber(raw.discount_percentage, 'offer percentage')
      : asNumber(raw.fixed_discount_paise, 'offer fixed discount') / 100,
    startDate: asString(raw.start_date, 'offer start date'),
    endDate: asString(raw.end_date, 'offer end date'),
    status: asStatus(raw.status),
    effectiveStatus,
  };
}

export async function loadThemeCommerceWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
): Promise<ThemeCommerce> {
  const data = await rpc(client, 'get_theme_commerce', { p_theme_id: themeId }, 'Unable to load pricing and promotions.');
  const payload = asRecord(data, 'theme commerce');
  if (asString(payload.theme_id, 'commerce theme') !== themeId) {
    throw new PricingPromotionError('The database returned commerce data for a different theme.');
  }
  const businessId = asString(payload.business_id, 'commerce business');
  const themeUuid = asString(payload.theme_uuid, 'commerce theme id');
  const serviceBadges = new Map<string, string>();
  for (const value of Array.isArray(payload.service_badges) ? payload.service_badges : []) {
    const badge = asRecord(value, 'service badge');
    serviceBadges.set(
      asString(badge.service_id, 'badge service'),
      asString(badge.promotional_badge, 'promotional badge'),
    );
  }
  return {
    businessId,
    themeId,
    themeUuid,
    serviceBadges,
    variants: (Array.isArray(payload.variants) ? payload.variants : [])
      .map((value) => mapVariant(value, businessId, themeUuid)),
    bundles: (Array.isArray(payload.bundles) ? payload.bundles : [])
      .map((value) => mapBundle(value, businessId, themeId, themeUuid)),
    offers: (Array.isArray(payload.offers) ? payload.offers : [])
      .map((value) => mapOffer(value, businessId, themeId, themeUuid)),
  };
}

export function loadThemeCommerce(themeId: DatabaseCatalogThemeId): Promise<ThemeCommerce> {
  return loadThemeCommerceWithClient(requireSupabase(), themeId);
}

export function mergeCommerceIntoServices(services: Service[], commerce: ThemeCommerce): Service[] {
  const variantsByService = new Map<string, ServicePriceVariant[]>();
  commerce.variants.forEach((variant) => {
    const current = variantsByService.get(variant.serviceId) ?? [];
    current.push(variant);
    variantsByService.set(variant.serviceId, current);
  });
  return services.map((service) => ({
    ...service,
    promotionalBadge: commerce.serviceBadges.get(service.id),
    pricingVariants: variantsByService.get(service.id) ?? [],
  }));
}

export async function setServicePromotionalBadge(serviceId: string, badge: string): Promise<void> {
  await rpc(requireSupabase(), 'set_saved_service_badge', {
    p_service_id: serviceId,
    p_promotional_badge: badge || null,
  }, 'Unable to update the promotional badge.');
}

export async function savePricingVariant(
  themeId: DatabaseCatalogThemeId,
  input: PricingVariantInput,
): Promise<string> {
  if (!input.name.trim()) throw new PricingPromotionError('Variant name is required.');
  if (!Number.isFinite(input.price) || input.price < 0) throw new PricingPromotionError('Variant price cannot be negative.');
  const data = await rpc(requireSupabase(), 'upsert_service_price_variant', {
    p_theme_id: themeId,
    p_service_id: input.serviceId,
    p_variant_id: input.id || null,
    p_name: input.name.trim(),
    p_price_paise: Math.round(input.price * 100),
    p_duration_minutes: input.duration == null ? null : Math.round(input.duration),
    p_status: input.status,
  }, 'Unable to save this pricing option.');
  return asString(data, 'variant id');
}

export async function deletePricingVariant(variantId: string): Promise<void> {
  await rpc(requireSupabase(), 'delete_service_price_variant', { p_variant_id: variantId }, 'Unable to delete this pricing option.');
}

export async function createServiceBundle(
  themeId: DatabaseCatalogThemeId,
  input: BundleInput,
): Promise<string> {
  const uniqueIds = Array.from(new Set(input.serviceIds));
  if (uniqueIds.length < 2) throw new PricingPromotionError('A bundle must include at least two services.');
  if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
    throw new PricingPromotionError('Bundle discount must be positive.');
  }
  const data = await rpc(requireSupabase(), 'create_service_bundle', {
    p_theme_id: themeId,
    p_category_id: input.categoryId || null,
    p_name: input.name.trim(),
    p_description: input.description,
    p_service_ids: uniqueIds,
    p_discount_type: input.discountType,
    p_discount_percentage: input.discountType === 'percentage' ? input.discountValue : null,
    p_fixed_discount_paise: input.discountType === 'fixed' ? Math.round(input.discountValue * 100) : null,
    p_promotional_badge: input.promotionalBadge || null,
    p_status: input.status,
  }, 'Unable to create this bundle.');
  return asString(data, 'bundle id');
}

export async function setServiceBundleStatus(bundleId: string, status: CatalogStatus): Promise<void> {
  await rpc(requireSupabase(), 'set_service_bundle_status', {
    p_package_id: bundleId,
    p_status: status,
  }, 'Unable to update this bundle.');
}

export async function createServiceOffer(
  themeId: DatabaseCatalogThemeId,
  input: OfferInput,
): Promise<string> {
  if (!input.title.trim()) throw new PricingPromotionError('Offer title is required.');
  if (!input.promotionalBadge.trim()) throw new PricingPromotionError('Promotional badge is required.');
  if (input.endDate < input.startDate) throw new PricingPromotionError('Offer end date must be on or after its start date.');
  const data = await rpc(requireSupabase(), 'create_service_offer', {
    p_theme_id: themeId,
    p_target_type: input.targetType,
    p_category_id: input.targetType === 'category' ? input.categoryId : null,
    p_predefined_service_id: input.targetType === 'predefined_service' ? input.predefinedServiceId : null,
    p_saved_service_id: input.targetType === 'saved_service' ? input.savedServiceId : null,
    p_package_id: input.targetType === 'bundle' ? input.packageId : null,
    p_title: input.title.trim(),
    p_promotional_badge: input.promotionalBadge.trim(),
    p_discount_type: input.discountType,
    p_discount_percentage: input.discountType === 'percentage' ? input.discountValue : null,
    p_fixed_discount_paise: input.discountType === 'fixed' ? Math.round(input.discountValue * 100) : null,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_status: input.status,
  }, 'Unable to create this offer.');
  return asString(data, 'offer id');
}

export async function setServiceOfferActive(offerId: string, active: boolean): Promise<void> {
  await rpc(requireSupabase(), 'set_service_offer_status', {
    p_offer_id: offerId,
    p_is_active: active,
  }, 'Unable to update this offer.');
}

export async function deleteServiceOffer(offerId: string): Promise<void> {
  await rpc(requireSupabase(), 'delete_service_offer', { p_offer_id: offerId }, 'Unable to delete this offer.');
}
