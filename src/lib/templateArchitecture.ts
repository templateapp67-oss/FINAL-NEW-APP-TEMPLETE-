/**
 * Phase 1-A template architecture (no new tables).
 *
 * The selected template belongs to the EXISTING salon:
 *   salons.theme_id  +  salon_public_websites.template_key
 * resolved via owner_salon_ids() / auth.uid(). Switching never provisions
 * a second organization or salon.
 *
 * Presentation (template) is separate from core business data:
 *   set_owner_salon_template() updates ONLY theme_id + template_key.
 *   Visual overlays live in salon_public_websites.config.templateConfig.
 *
 * Core tables that a template switch must never write:
 *   organizations, organization_members, salons (except theme_id),
 *   services, products, business_locations, staff, bookings, payments.
 */
import type { SalonData } from '../types';
import { normalizeThemeId, type ThemeId } from './themeServices';
import { normalizeTemplateConfig, type TemplateConfig } from './templateConfig';

export const CORE_BUSINESS_TABLES = [
  'organizations',
  'organization_members',
  'salons',
  'services',
  'products',
  'business_locations',
  'staff',
  'bookings',
  'payments',
  'payment_orders',
] as const;

export const TEMPLATE_PRESENTATION_TARGETS = {
  salonThemeColumn: 'theme_id',
  websiteTemplateColumn: 'template_key',
  visualConfigPath: 'salon_public_websites.config.templateConfig',
} as const;

export const TEMPLATE_SWITCH_RPC = 'set_owner_salon_template';

/** Visual settings only — never identity, catalog, location, or commerce. */
export function presentationConfigOf(data: Pick<SalonData, 'templateConfig' | 'templateId'>): TemplateConfig {
  return normalizeTemplateConfig(data.templateConfig, data.templateId);
}

const CORE_SNAPSHOT_KEYS = [
  'salonId',
  'salonName',
  'ownerName',
  'phone',
  'email',
  'address',
  'openingHours',
  'bookingRules',
  'services',
  'packages',
  'team',
  'gallery',
] as const;

export function coreBusinessSnapshot(data: SalonData): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const key of CORE_SNAPSHOT_KEYS) {
    snap[key] = data[key];
  }
  return snap;
}

/** True when a presentation switch left core business fields untouched. */
export function switchPreservedCoreBusiness(before: SalonData, after: SalonData): boolean {
  const a = coreBusinessSnapshot(before);
  const b = coreBusinessSnapshot(after);
  return CORE_SNAPSHOT_KEYS.every((key) => a[key] === b[key]);
}

export function templateBelongsToSalon(
  salonId: string | undefined,
  templateId: ThemeId | string | undefined,
): boolean {
  return Boolean(salonId && normalizeThemeId(templateId));
}
