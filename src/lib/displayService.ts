import type { Service } from '../types';
import type { AppLocale } from './locale';
import { localizedDescription, localizedName } from './locale';

export function displayService(service: Service, locale: AppLocale) {
  return {
    name: localizedName(service.name, service.translations, locale),
    description: localizedDescription(service.description, service.translations, locale),
    category: service.category,
    imageUrl: service.media?.imageUrl,
    bannerUrl: service.media?.bannerUrl,
    iconUrl: service.media?.iconUrl,
  };
}
