import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceMedia, ServiceTranslation } from '../types';
import type { DatabaseCatalogThemeId } from './themeCatalogService';
import { requireSupabase } from './supabaseClient';
import type { AppLocale } from './locale';
import { mapContentTranslations, mapServiceMedia } from './locale';

export class ServiceContentError extends Error {
  constructor(message = 'Unable to update service content. Please try again.') {
    super(message);
    this.name = 'ServiceContentError';
  }
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceContentError(`Invalid ${label} returned by the database.`);
  }
  return value as UnknownRecord;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value) {
    throw new ServiceContentError(`Invalid ${label} returned by the database.`);
  }
  return value;
};

const safe = (error: unknown, fallback: string): ServiceContentError => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  if (raw) console.error('Service content RPC failed:', error);
  if (/log in|salon|not found|does not belong|required|locale|media|theme/i.test(raw)) {
    return new ServiceContentError(raw);
  }
  return new ServiceContentError(fallback);
};

export const mapTranslations = mapContentTranslations;
export const mapMedia = mapServiceMedia;

export async function upsertSavedServiceTranslationWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  locale: AppLocale,
  name: string,
  description: string,
): Promise<ServiceTranslation> {
  const cleanName = name.trim();
  if (!cleanName) throw new ServiceContentError('Translated name is required.');
  const { data, error } = await client.rpc('upsert_saved_service_translation', {
    p_theme_id: themeId,
    p_service_id: serviceId,
    p_locale: locale,
    p_name: cleanName,
    p_description: description,
  });
  if (error) throw safe(error, 'Unable to save this translation.');
  const row = asRecord(data, 'saved translation');
  return {
    locale: asString(row.locale, 'locale'),
    name: asString(row.name, 'name'),
    description: typeof row.description === 'string' ? row.description : '',
  };
}

export function upsertSavedServiceTranslation(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  locale: AppLocale,
  name: string,
  description: string,
): Promise<ServiceTranslation> {
  return upsertSavedServiceTranslationWithClient(
    requireSupabase(),
    themeId,
    serviceId,
    locale,
    name,
    description,
  );
}

export type ServiceMediaKind = 'image' | 'banner' | 'icon';

export async function upsertSavedServiceMediaWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  kind: ServiceMediaKind,
  url: string,
): Promise<ServiceMedia> {
  const clean = url.trim();
  if (!clean) throw new ServiceContentError('Media URL is required.');
  const { data, error } = await client.rpc('upsert_saved_service_media', {
    p_theme_id: themeId,
    p_service_id: serviceId,
    p_kind: kind,
    p_url: clean,
  });
  if (error) throw safe(error, 'Unable to save service media.');
  return mapMedia(data) ?? {};
}

export function upsertSavedServiceMedia(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  kind: ServiceMediaKind,
  url: string,
): Promise<ServiceMedia> {
  return upsertSavedServiceMediaWithClient(requireSupabase(), themeId, serviceId, kind, url);
}

export async function deleteSavedServiceMediaWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  kind: ServiceMediaKind,
): Promise<ServiceMedia> {
  const { data, error } = await client.rpc('delete_saved_service_media', {
    p_theme_id: themeId,
    p_service_id: serviceId,
    p_kind: kind,
  });
  if (error) throw safe(error, 'Unable to remove service media.');
  return mapMedia(data) ?? {};
}

export function deleteSavedServiceMedia(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  kind: ServiceMediaKind,
): Promise<ServiceMedia> {
  return deleteSavedServiceMediaWithClient(requireSupabase(), themeId, serviceId, kind);
}

export interface ThemeSearchHit {
  id: string;
  name: string;
  description: string;
  translatedName?: string;
  source: 'saved' | 'predefined';
}

export async function searchThemeServicesWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  query: string,
): Promise<ThemeSearchHit[]> {
  const { data, error } = await client.rpc('search_theme_services', {
    p_theme_id: themeId,
    p_query: query,
  });
  if (error) throw safe(error, 'Unable to search services.');
  const payload = asRecord(data, 'search results');
  if (asString(payload.theme_id, 'search theme') !== themeId) {
    throw new ServiceContentError('Search returned a different theme.');
  }
  const rows = Array.isArray(payload.results) ? payload.results : [];
  return rows.map((value) => {
    const row = asRecord(value, 'search hit');
    return {
      id: asString(row.id, 'search id'),
      name: asString(row.name, 'search name'),
      description: typeof row.description === 'string' ? row.description : '',
      translatedName: typeof row.translated_name === 'string' ? row.translated_name : undefined,
      source: row.source === 'saved' ? 'saved' : 'predefined',
    };
  });
}

export function searchThemeServices(
  themeId: DatabaseCatalogThemeId,
  query: string,
): Promise<ThemeSearchHit[]> {
  return searchThemeServicesWithClient(requireSupabase(), themeId, query);
}
