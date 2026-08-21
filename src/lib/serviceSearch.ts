import type { Service } from '../types';
import type { AppLocale } from './locale';
import { localizedDescription, localizedName } from './locale';

export type ServiceSort =
  | 'default'
  | 'name_asc'
  | 'price_asc'
  | 'price_desc'
  | 'duration_asc'
  | 'duration_desc';

export interface ServiceDiscoveryQuery {
  search: string;
  category: string | 'all';
  sort: ServiceSort;
  suggestedOnly: boolean;
  activeOnly: boolean;
}

export const DEFAULT_DISCOVERY: ServiceDiscoveryQuery = {
  search: '',
  category: 'all',
  sort: 'default',
  suggestedOnly: false,
  activeOnly: false,
};

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

/** Matches English name/description and any translated name/description. */
export function serviceMatchesSearch(
  service: Service,
  query: string,
  locale: AppLocale = 'en',
): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  const haystacks = [
    service.name,
    service.description,
    localizedName(service.name, service.translations, locale),
    localizedDescription(service.description, service.translations, locale),
    ...(service.translations ?? []).flatMap((item) => [item.name, item.description]),
  ];
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

export function filterAndSortServices(
  services: Service[],
  query: ServiceDiscoveryQuery,
  locale: AppLocale,
  suggestedPredefinedIds?: Set<string> | ReadonlySet<string>,
): Service[] {
  let rows = services.filter((service) => {
    if (query.category !== 'all' && service.category !== query.category) return false;
    if (query.activeOnly && service.status && service.status !== 'active') return false;
    if (query.suggestedOnly) {
      if (!service.predefinedServiceId) return false;
      if (suggestedPredefinedIds && !suggestedPredefinedIds.has(service.predefinedServiceId)) {
        return false;
      }
    }
    return serviceMatchesSearch(service, query.search, locale);
  });

  const copy = [...rows];
  switch (query.sort) {
    case 'name_asc':
      copy.sort((a, b) =>
        localizedName(a.name, a.translations, locale).localeCompare(
          localizedName(b.name, b.translations, locale),
          locale,
        ),
      );
      break;
    case 'price_asc':
      copy.sort((a, b) => a.price - b.price);
      break;
    case 'price_desc':
      copy.sort((a, b) => b.price - a.price);
      break;
    case 'duration_asc':
      copy.sort((a, b) => a.duration - b.duration);
      break;
    case 'duration_desc':
      copy.sort((a, b) => b.duration - a.duration);
      break;
    default:
      break;
  }
  return copy;
}
