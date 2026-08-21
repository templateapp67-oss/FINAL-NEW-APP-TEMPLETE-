/**
 * PHASE 12.4 — COMPLETE SERVICES directory data helpers (all five themes).
 *
 * Pure, theme-scoped helpers for the complete-services section:
 *
 *   - `directoryServicesForTheme` keeps ONLY the active theme's services using
 *     the existing theme relationship: `themeKey` wins when present (saved DB
 *     rows), otherwise `themeId` (plain rows / test data), and rows with NO
 *     theme provenance are the active theme's own plain catalog and stay.
 *     Inactive/archived rows are dropped via the existing `activeCatalogItems`.
 *   - `distinctServiceCategories` derives categories from those same services
 *     (so a category can never belong to another theme).
 *
 * No new service/database architecture — this reads the existing `SalonData`
 * shape and the existing `activeCatalogItems` filter.
 */
import type { SalonData, Service } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { activeCatalogItems } from './siteStructure';

/** Services of the ACTIVE theme only (theme_id / theme_key relationship). */
export function directoryServicesForTheme(data: SalonData, themeId: SiteHeaderThemeId): Service[] {
  return activeCatalogItems(data.services).filter((service) => {
    if (service.themeKey) return service.themeKey === themeId;
    if (service.themeId) return service.themeId === themeId;
    // No theme provenance → the active theme's own plain catalog rows.
    return true;
  });
}

/** Distinct categories, in first-appearance order, from the active theme's services. */
export function distinctServiceCategories(services: readonly Service[]): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const service of services) {
    const category = (service.category || '').trim() || 'Other';
    if (!seen.has(category)) {
      seen.add(category);
      categories.push(category);
    }
  }
  return categories;
}
