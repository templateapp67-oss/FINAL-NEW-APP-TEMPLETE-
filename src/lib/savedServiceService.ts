import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getFallbackThemeCatalog,
  peekThemeCatalog,
  type DatabaseCatalogThemeId,
  type ThemeServiceCatalog,
} from './themeCatalogService';
import { requireSupabase, isSupabaseConfigured } from './supabaseClient';
import { isMissingRpcSurfaceError } from './rpcSurface';
import {
  insertLocalSavedService,
  listLocalSavedServices,
  removeLocalSavedServiceEverywhere,
  updateLocalSavedServiceEverywhere,
  updateLocalSavedServiceRow,
} from './localSavedServices';
import { mapContentTranslations as mapTranslations, mapServiceMedia as mapMedia } from './locale';
import type { Service, ServiceMedia, ServiceTranslation } from '../types';

export type SavedServiceStatus = 'active' | 'inactive' | 'archived';

/**
 * One saved salon service row.
 *
 * `predefinedServiceId` is `null` for Custom / "Other" services — that NULL is
 * the provenance contract and must never be replaced with a guessed predefined
 * row. `themeId` / `categoryId` / `predefinedServiceId` are read-only here: no
 * client call can ever send them to an edit/status RPC.
 */
export interface SavedService {
  id: string;
  businessId: string;
  themeId: string;
  themeKey: DatabaseCatalogThemeId;
  categoryId: string;
  predefinedServiceId: string | null;
  name: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  status: SavedServiceStatus;
  featured: boolean;
  translations: ServiceTranslation[];
  media?: ServiceMedia;
}

/** Canonical saved-service row → website builder/UI service shape. */
export function savedServiceToSalonService(service: SavedService): Service {
  return {
    id: service.id,
    businessId: service.businessId,
    themeId: service.themeId,
    themeKey: service.themeKey,
    categoryId: service.categoryId,
    predefinedServiceId: service.predefinedServiceId,
    name: service.name,
    category: service.category,
    description: service.description,
    price: service.price,
    duration: service.duration,
    featured: service.featured,
    status: service.status,
    translations: service.translations,
    media: service.media,
  };
}

/** Retained name for existing Phase 7.4 callers/tests. */
export type SavedPredefinedService = SavedService;

export interface SavePredefinedServicesResult {
  businessId: string;
  themeId: DatabaseCatalogThemeId;
  requestedCount: number;
  insertedCount: number;
  existingCount: number;
  services: SavedService[];
}

export class SavedServiceError extends Error {
  constructor(message = 'Unable to save the selected services. Please try again.') {
    super(message);
    this.name = 'SavedServiceError';
  }
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SavedServiceError(`Invalid ${label} returned by the database.`);
  }
  return value as UnknownRecord;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SavedServiceError(`Invalid ${label} returned by the database.`);
  }
  return value;
};

const asNumber = (value: unknown, label: string): number => {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new SavedServiceError(`Invalid ${label} returned by the database.`);
  }
  return number;
};

/** Custom / "Other" services legitimately carry a NULL predefined link. */
const asNullableString = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined) return null;
  return asString(value, label);
};

/** Surfaces the readable database message when the RPC raised one. */
/**
 * Deliberate, user-facing messages raised by our own RPCs with `raise
 * exception`. Anything not matching these patterns is treated as an internal
 * database fault and replaced with a generic message, so raw PostgreSQL text
 * (table names, constraint names, SQL fragments) is never rendered in the UI.
 */
const SAFE_MESSAGE_PATTERNS: RegExp[] = [
  /please log in/i,
  /no manageable salon/i,
  /multiple salons are linked/i,
  /not found for your salon/i,
  /already saved/i,
  /does not belong to this theme/i,
  /does not belong to this theme and category/i,
  /category does not belong to this theme/i,
  /do not belong to the active theme/i,
  /no active service catalog exists/i,
  /name is required/i,
  /price cannot be negative/i,
  /duration must be positive/i,
  /status must be active, inactive, or archived/i,
  /remove this service from its package/i,
  /provenance is immutable/i,
  /ownership is immutable/i,
  /is inactive, or belongs to another theme/i,
  /must reference a theme/i,
  /must reference its category/i,
  /upcoming appointment/i,
  /active booking/i,
  /pending transaction/i,
  /archive it instead/i,
];

const rpcError = (error: unknown, fallback: string): SavedServiceError => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '').trim()
    : '';

  // Always keep the full detail in the console for developers…
  if (raw) {
    if (isMissingRpcSurfaceError(error)) {
      console.warn('Saved service RPC missing from schema (local fallback active):', error);
    } else {
      console.error('Saved service RPC failed:', error);
    }
  }

  // …but only surface messages we deliberately authored.
  if (raw && SAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(raw))) {
    return new SavedServiceError(raw);
  }
  return new SavedServiceError(fallback);
};

// ----------------------------------------------------------------------------
// Local fallback (docs/step5-services-audit.md §6).
//
// Engaged ONLY when the live project provably lacks the Step-5 RPC surface —
// PostgREST PGRST202 / "Could not find the function … in the schema cache" —
// which is the exact state of a deployment where the M40 migration has not
// been applied yet (or a static prototype with no database at all). In that
// state every Step-5 call deterministically 404s, so persisting to
// localStorage keeps onboarding functional instead of dead-ending on
// "Unable to load saved services." / "Unable to add this service.".
//
// Every other failure (auth, validation, 500s, network blips) keeps the
// existing masked-error behavior — a healthy database is never silently
// bypassed. The `*WithClient` functions are unchanged except for flipping
// the session marker, so request-boundary tests keep their strict semantics.
// ----------------------------------------------------------------------------

let savedServiceRpcSurfaceMissing = false;

/** Records proof that the live project does not expose the Step-5 RPCs. */
const noteRpcSurfaceProbe = (error: unknown): void => {
  if (isMissingRpcSurfaceError(error)) savedServiceRpcSurfaceMissing = true;
};

/** Test seam — restores the initial "unknown" probe state. */
export function resetSavedServiceRpcProbeForTests(): void {
  savedServiceRpcSurfaceMissing = false;
}

/** Placeholder tenant for locally persisted rows; never a real salon UUID. */
const LOCAL_SAVED_BUSINESS_ID = 'local-salon';

const resolveLocalCatalog = (themeId: DatabaseCatalogThemeId): ThemeServiceCatalog =>
  peekThemeCatalog(themeId) ?? getFallbackThemeCatalog(themeId);

const newLocalServiceId = (): string =>
  `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Local equivalent of `loadSavedServicesForTheme`. */
export function loadSavedServicesLocal(themeId: DatabaseCatalogThemeId): SavedService[] {
  return listLocalSavedServices(themeId);
}

/** Local equivalent of `savePredefinedServices`, mirroring M20/M40 semantics. */
export function savePredefinedServicesLocal(
  themeId: DatabaseCatalogThemeId,
  predefinedServiceIds: string[],
): SavePredefinedServicesResult {
  const uniqueIds = Array.from(new Set(predefinedServiceIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new SavedServiceError('Select at least one suggested service.');
  }
  const catalog = resolveLocalCatalog(themeId);

  const services: SavedService[] = [];
  let insertedCount = 0;
  let existingCount = 0;
  for (const id of uniqueIds) {
    const predefined = catalog.predefinedServices.find((service) => service.id === id);
    if (!predefined) {
      throw new SavedServiceError('The selected service does not belong to this theme and category.');
    }
    const existing = listLocalSavedServices(themeId)
      .find((row) => row.predefinedServiceId === predefined.id);
    if (existing) {
      existingCount += 1;
      // Archived rows are retired copies: re-adding a suggested service revives
      // the existing row (status back to active) instead of leaving a stale
      // archived copy next to a new duplicate — mirrors the M67 RPC.
      services.push(existing.status === 'archived'
        ? updateLocalSavedServiceRow(themeId, existing.id, (row) => ({ ...row, status: 'active' }))
          ?? existing
        : existing);
      continue;
    }
    insertedCount += 1;
    services.push(insertLocalSavedService(themeId, {
      id: newLocalServiceId(),
      businessId: LOCAL_SAVED_BUSINESS_ID,
      themeId: catalog.theme.id,
      themeKey: themeId,
      categoryId: predefined.categoryId,
      predefinedServiceId: predefined.id,
      name: predefined.name,
      category: predefined.category,
      description: predefined.description,
      price: predefined.price,
      duration: predefined.duration,
      status: 'active',
      featured: false,
      translations: [],
    }));
  }

  return {
    businessId: LOCAL_SAVED_BUSINESS_ID,
    themeId,
    requestedCount: uniqueIds.length,
    insertedCount,
    existingCount,
    services,
  };
}

/** Local equivalent of `create_saved_service`, mirroring the M40 validation. */
export function createSavedServiceLocal(
  themeId: DatabaseCatalogThemeId,
  input: NewSavedService,
): SavedService {
  const name = input.name.trim();
  if (!name) throw new SavedServiceError('Service name is required.');
  if (!input.categoryId) throw new SavedServiceError('Select a category for this service.');
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new SavedServiceError('Service price cannot be negative.');
  }
  if (!Number.isFinite(input.duration) || input.duration <= 0) {
    throw new SavedServiceError('Service duration must be positive.');
  }

  const catalog = resolveLocalCatalog(themeId);
  const category = catalog.categories.find((item) => item.id === input.categoryId)
    ?? catalog.categories.find((item) => item.name === input.categoryId);
  if (!category) {
    throw new SavedServiceError('The selected category does not belong to this theme.');
  }

  const rows = listLocalSavedServices(themeId);
  if (input.predefinedServiceId) {
    const predefined = catalog.predefinedServices.find(
      (service) => service.id === input.predefinedServiceId && service.categoryId === category.id,
    );
    if (!predefined) {
      throw new SavedServiceError('The selected service does not belong to this theme and category.');
    }
    // A LIVE row for the same predefined link is a genuine duplicate; archived
    // (soft-deleted) rows are retired services the owner is re-adding, so they
    // are revived below instead of erroring (mirrors the M67 RPC + the partial
    // unique index, which excludes soft-deleted rows).
    if (rows.some((row) => row.predefinedServiceId === predefined.id && row.status !== 'archived')) {
      throw new SavedServiceError('This service is already saved for your salon.');
    }
    const archived = rows.find((row) => row.predefinedServiceId === predefined.id && row.status === 'archived');
    if (archived) {
      return updateLocalSavedServiceRow(themeId, archived.id, (row) => ({
        ...row,
        name,
        category: category.name,
        description: input.description ?? '',
        price: input.price,
        duration: Math.round(input.duration),
        status: 'active',
      })) ?? { ...archived };
    }
  }
  if (rows.some(
    (row) => row.status !== 'archived'
      && row.name.trim().toLowerCase() === name.toLowerCase(),
  )) {
    throw new SavedServiceError('A service with this name is already saved for this theme.');
  }
  // Re-add after archive for a Custom / "Other" service: revive the most recent
  // archived CUSTOM row with the same normalized name. Custom provenance is
  // never rewritten onto a predefined-linked row.
  const archivedCustom = rows.find(
    (row) => row.status === 'archived'
      && row.predefinedServiceId === null
      && row.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (archivedCustom) {
    return updateLocalSavedServiceRow(themeId, archivedCustom.id, (row) => ({
      ...row,
      name,
      category: category.name,
      description: input.description ?? '',
      price: input.price,
      duration: Math.round(input.duration),
      status: 'active',
    })) ?? { ...archivedCustom };
  }

  return insertLocalSavedService(themeId, {
    id: newLocalServiceId(),
    businessId: LOCAL_SAVED_BUSINESS_ID,
    themeId: catalog.theme.id,
    themeKey: themeId,
    categoryId: category.id,
    predefinedServiceId: input.predefinedServiceId ?? null,
    name,
    category: category.name,
    description: input.description ?? '',
    price: input.price,
    duration: Math.round(input.duration),
    status: input.status ?? 'active',
    featured: false,
    translations: [],
  });
}

/**
 * Local equivalent of `update_saved_service`. Applies mutable fields only —
 * theme, category, predefined link and ownership are never touched, exactly
 * like the RPC contract.
 */
export function updateSavedServiceLocal(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  changes: SavedServiceChanges,
): SavedService {
  if (changes.name !== undefined && !changes.name.trim()) {
    throw new SavedServiceError('Service name is required.');
  }
  if (changes.price !== undefined && (!Number.isFinite(changes.price) || changes.price < 0)) {
    throw new SavedServiceError('Service price cannot be negative.');
  }
  if (changes.duration !== undefined && (!Number.isFinite(changes.duration) || changes.duration <= 0)) {
    throw new SavedServiceError('Service duration must be positive.');
  }
  const updated = updateLocalSavedServiceRow(themeId, serviceId, (row) => ({
    ...row,
    name: changes.name === undefined ? row.name : changes.name.trim(),
    description: changes.description === undefined ? row.description : changes.description,
    price: changes.price === undefined ? row.price : changes.price,
    duration: changes.duration === undefined ? row.duration : Math.round(changes.duration),
    status: changes.status === undefined ? row.status : changes.status,
  }));
  if (!updated) throw new SavedServiceError('The requested service was not found for your salon.');
  return updated;
}

/** Local equivalent of `set_saved_service_status`. */
export function setSavedServiceStatusLocal(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  status: SavedServiceStatus,
): SavedService {
  const updated = updateLocalSavedServiceRow(themeId, serviceId, (row) => ({ ...row, status }));
  if (!updated) throw new SavedServiceError('The requested service was not found for your salon.');
  return updated;
}

/** Local equivalent of `set_saved_service_active`. */
export function setSavedServiceActiveLocal(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  isActive: boolean,
): SavedService {
  const updated = updateLocalSavedServiceRow(themeId, serviceId, (row) => ({
    ...row,
    // Activating an archived row revives it to active; "deactivating" an
    // archived row keeps it archived (mirrors is_active/deleted_at semantics).
    status: isActive ? 'active' : (row.status === 'archived' ? 'archived' : 'inactive'),
  }));
  if (!updated) throw new SavedServiceError('The requested service was not found for your salon.');
  return updated;
}

/** Local equivalent of `delete_saved_service` (idempotent, like the UI flow). */
export function deleteSavedServiceLocal(serviceId: string): string {
  removeLocalSavedServiceEverywhere(serviceId);
  return serviceId;
}

/** Local equivalent of `archive_saved_service` (serviceSafetyService fallback). */
export function archiveSavedServiceLocal(serviceId: string): string {
  updateLocalSavedServiceEverywhere(serviceId, (row) => ({ ...row, status: 'archived' }));
  return serviceId;
}

const mapSavedService = (
  rawValue: unknown,
  expectedBusinessId: string,
  expectedThemeId: DatabaseCatalogThemeId,
  allowedPredefinedIds?: Set<string>,
): SavedService => {
  const raw = asRecord(rawValue, 'saved service');
  const predefinedServiceId = asNullableString(raw.predefined_service_id, 'predefined_service_id');
  if (allowedPredefinedIds
    && (predefinedServiceId === null || !allowedPredefinedIds.has(predefinedServiceId))) {
    throw new SavedServiceError('The database returned an unrequested predefined service.');
  }
  if (asString(raw.business_id, 'service business_id') !== expectedBusinessId) {
    throw new SavedServiceError('The database returned a service for a different salon.');
  }
  if (asString(raw.theme_key, 'service theme key') !== expectedThemeId) {
    throw new SavedServiceError('The database returned a cross-theme saved service.');
  }
  const status = asString(raw.status, 'saved service status');
  if (status !== 'active' && status !== 'inactive' && status !== 'archived') {
    throw new SavedServiceError('Invalid saved service status returned by the database.');
  }

  return {
    id: asString(raw.id, 'saved service id'),
    businessId: expectedBusinessId,
    themeId: asString(raw.theme_id, 'service theme_id'),
    themeKey: expectedThemeId,
    categoryId: asString(raw.category_id, 'service category_id'),
    predefinedServiceId,
    name: asString(raw.name, 'saved service name'),
    category: asString(raw.category, 'saved service category'),
    description: typeof raw.description === 'string' ? raw.description : '',
    price: asNumber(raw.price_paise, 'saved service price') / 100,
    duration: asNumber(raw.duration_minutes, 'saved service duration'),
    status,
    featured: raw.is_featured === true,
    translations: mapTranslations(raw.translations),
    media: mapMedia(raw.media),
  };
};

/**
 * Saves only predefined IDs from one database theme. M20 derives the tenant
 * from auth.uid() + business_members; no client-provided salon/business ID is
 * accepted or trusted. Exported with a client for request-boundary tests.
 */
export async function savePredefinedServicesWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  predefinedServiceIds: string[],
): Promise<SavePredefinedServicesResult> {
  const uniqueIds = Array.from(new Set(predefinedServiceIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new SavedServiceError('Select at least one suggested service.');
  }

  const { data, error } = await client.rpc('save_predefined_services', {
    p_theme_id: themeId,
    p_predefined_service_ids: uniqueIds,
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    console.error('Save predefined services RPC failed:', error);
    const message = typeof error.message === 'string' && /log in|salon|permission/i.test(error.message)
      ? error.message
      : undefined;
    throw new SavedServiceError(message);
  }

  const payload = asRecord(data, 'save response');
  const returnedThemeId = asString(payload.theme_id, 'saved theme_id');
  if (returnedThemeId !== themeId) {
    throw new SavedServiceError('The database returned services for a different theme.');
  }

  const businessId = asString(payload.business_id, 'saved business_id');
  const requestedIdSet = new Set(uniqueIds);
  const rawServices = Array.isArray(payload.services) ? payload.services : [];
  const services = rawServices.map((rawValue) =>
    mapSavedService(rawValue, businessId, themeId, requestedIdSet)
  );

  const requestedCount = asNumber(payload.requested_count, 'requested count');
  const insertedCount = asNumber(payload.inserted_count, 'inserted count');
  const existingCount = asNumber(payload.existing_count, 'existing count');
  if (requestedCount !== uniqueIds.length || services.length !== uniqueIds.length) {
    throw new SavedServiceError('The database did not return every selected service.');
  }
  if (insertedCount + existingCount !== requestedCount) {
    throw new SavedServiceError('Invalid save counts returned by the database.');
  }

  return {
    businessId,
    themeId,
    requestedCount,
    insertedCount,
    existingCount,
    services,
  };
}

export async function savePredefinedServices(
  themeId: DatabaseCatalogThemeId,
  predefinedServiceIds: string[],
): Promise<SavePredefinedServicesResult> {
  if (!isSupabaseConfigured) {
    return {
      businessId: 'mock-business',
      themeId,
      requestedCount: predefinedServiceIds.length,
      insertedCount: predefinedServiceIds.length,
      existingCount: 0,
      services: predefinedServiceIds.map((id, index) => ({
        id: `mock-saved-service-${id}`,
        businessId: 'mock-business',
        themeId,
        themeKey: themeId,
        categoryId: 'mock-category',
        predefinedServiceId: id,
        name: `Predefined ${index}`,
        category: 'Mock Category',
        description: 'Mock Description',
        price: 50,
        duration: 30,
        status: 'active',
        featured: false,
        translations: [],
      })),
    };
  }
  if (savedServiceRpcSurfaceMissing) {
    return savePredefinedServicesLocal(themeId, predefinedServiceIds);
  }
  try {
    return await savePredefinedServicesWithClient(requireSupabase(), themeId, predefinedServiceIds);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return savePredefinedServicesLocal(themeId, predefinedServiceIds);
    }
    throw error;
  }
}

export async function loadSavedServicesForThemeWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
): Promise<SavedService[]> {
  const { data, error } = await client.rpc('get_saved_services_for_theme', {
    p_theme_id: themeId,
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    throw rpcError(error, 'Unable to load saved services.');
  }
  const payload = asRecord(data, 'saved services response');
  if (asString(payload.theme_id, 'saved services theme_id') !== themeId) {
    throw new SavedServiceError('The database returned saved services for a different theme.');
  }
  const businessId = asString(payload.business_id, 'saved services business_id');
  const rows = Array.isArray(payload.services) ? payload.services : [];
  return rows.map((row) => mapSavedService(row, businessId, themeId));
}

export async function loadSavedServicesForTheme(
  themeId: DatabaseCatalogThemeId,
): Promise<SavedService[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  if (savedServiceRpcSurfaceMissing) {
    return loadSavedServicesLocal(themeId);
  }
  try {
    return await loadSavedServicesForThemeWithClient(requireSupabase(), themeId);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return loadSavedServicesLocal(themeId);
    }
    throw error;
  }
}

/**
 * Add Service input.
 *
 * `predefinedServiceId` is optional and stays NULL for Custom / "Other"
 * services. It is validated server-side against the exact theme+category chain,
 * so a name typed by the owner can never be converted into a predefined link.
 */
export interface NewSavedService {
  categoryId: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  predefinedServiceId?: string | null;
  status?: SavedServiceStatus;
}

export async function createSavedServiceWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  input: NewSavedService,
): Promise<SavedService> {
  const name = input.name.trim();
  if (!name) throw new SavedServiceError('Service name is required.');
  if (!input.categoryId) throw new SavedServiceError('Select a category for this service.');
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new SavedServiceError('Service price cannot be negative.');
  }
  if (!Number.isFinite(input.duration) || input.duration <= 0) {
    throw new SavedServiceError('Service duration must be positive.');
  }

  const { data, error } = await client.rpc('create_saved_service', {
    p_theme_id: themeId,
    p_category_id: input.categoryId,
    p_name: name,
    p_description: input.description ?? '',
    p_price_paise: Math.round(input.price * 100),
    p_duration_minutes: Math.round(input.duration),
    // Explicitly NULL for custom services; never inferred from the name.
    p_predefined_service_id: input.predefinedServiceId ?? null,
    p_status: input.status ?? 'active',
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    throw rpcError(error, 'Unable to add this service.');
  }
  const raw = asRecord(data, 'created saved service');
  return mapSavedService(raw, asString(raw.business_id, 'created business_id'), themeId);
}

export async function createSavedService(
  themeId: DatabaseCatalogThemeId,
  input: NewSavedService,
): Promise<SavedService> {
  if (!isSupabaseConfigured) {
    return {
      id: 'mock-saved-service-' + Date.now(),
      businessId: 'mock-business',
      themeId: themeId,
      themeKey: themeId,
      categoryId: input.categoryId || 'mock-category',
      predefinedServiceId: input.predefinedServiceId || null,
      name: input.name,
      category: 'Mock Category',
      description: input.description || '',
      price: input.price,
      duration: input.duration,
      status: input.status,
      featured: false,
      translations: [],
    };
  }
  if (savedServiceRpcSurfaceMissing) {
    return createSavedServiceLocal(themeId, input);
  }
  try {
    return await createSavedServiceWithClient(requireSupabase(), themeId, input);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return createSavedServiceLocal(themeId, input);
    }
    throw error;
  }
}

/**
 * Editable fields only. Every property is optional so "update price",
 * "update duration", "update description" and "change status" are independent
 * operations. There is intentionally no way to express a theme, category,
 * predefined-service or business change.
 */
export interface SavedServiceChanges {
  name?: string;
  description?: string;
  price?: number;
  duration?: number;
  status?: SavedServiceStatus;
}

export async function updateSavedServiceWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  changes: SavedServiceChanges,
): Promise<SavedService> {
  if (changes.name !== undefined && !changes.name.trim()) {
    throw new SavedServiceError('Service name is required.');
  }
  if (changes.price !== undefined && (!Number.isFinite(changes.price) || changes.price < 0)) {
    throw new SavedServiceError('Service price cannot be negative.');
  }
  if (changes.duration !== undefined && (!Number.isFinite(changes.duration) || changes.duration <= 0)) {
    throw new SavedServiceError('Service duration must be positive.');
  }

  const { data, error } = await client.rpc('update_saved_service', {
    p_service_id: serviceId,
    p_name: changes.name === undefined ? null : changes.name.trim(),
    p_description: changes.description === undefined ? null : changes.description,
    p_price_paise: changes.price === undefined ? null : Math.round(changes.price * 100),
    p_duration_minutes: changes.duration === undefined ? null : Math.round(changes.duration),
    p_status: changes.status ?? null,
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    throw rpcError(error, 'Unable to update this service.');
  }
  const raw = asRecord(data, 'updated saved service');
  return mapSavedService(raw, asString(raw.business_id, 'updated business_id'), themeId);
}

export async function updateSavedService(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  changes: SavedServiceChanges,
): Promise<SavedService> {
  if (!isSupabaseConfigured) {
    return {
      id: serviceId,
      businessId: 'mock-business',
      themeId,
      themeKey: themeId,
      categoryId: 'mock-category',
      predefinedServiceId: null,
      name: changes.name || 'Mock Updated Service',
      category: 'Mock Category',
      description: changes.description || '',
      price: changes.price ?? 50,
      duration: changes.duration ?? 30,
      status: changes.status || 'active',
      featured: false,
      translations: [],
    };
  }
  if (savedServiceRpcSurfaceMissing) {
    return updateSavedServiceLocal(themeId, serviceId, changes);
  }
  try {
    return await updateSavedServiceWithClient(requireSupabase(), themeId, serviceId, changes);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return updateSavedServiceLocal(themeId, serviceId, changes);
    }
    throw error;
  }
}

/** Update Price only. */
export function updateSavedServicePrice(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  price: number,
): Promise<SavedService> {
  return updateSavedService(themeId, serviceId, { price });
}

/** Update Duration only. */
export function updateSavedServiceDuration(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  duration: number,
): Promise<SavedService> {
  return updateSavedService(themeId, serviceId, { duration });
}

/** Update Description only. */
export function updateSavedServiceDescription(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  description: string,
): Promise<SavedService> {
  return updateSavedService(themeId, serviceId, { description });
}

/** Change service status (active / inactive / archived). */
export async function setSavedServiceStatusWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  status: SavedServiceStatus,
): Promise<SavedService> {
  const { data, error } = await client.rpc('set_saved_service_status', {
    p_service_id: serviceId,
    p_status: status,
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    throw rpcError(error, 'Unable to change service status.');
  }
  const raw = asRecord(data, 'saved service status');
  return mapSavedService(raw, asString(raw.business_id, 'status business_id'), themeId);
}

export async function setSavedServiceStatus(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  status: SavedServiceStatus,
): Promise<SavedService> {
  if (!isSupabaseConfigured) {
    return {
      id: serviceId,
      businessId: 'mock-business',
      themeId,
      themeKey: themeId,
      categoryId: 'mock-category',
      predefinedServiceId: null,
      name: 'Mock Status Service',
      category: 'Mock Category',
      description: 'Mock Description',
      price: 50,
      duration: 30,
      status: status,
      featured: false,
      translations: [],
    };
  }
  if (savedServiceRpcSurfaceMissing) {
    return setSavedServiceStatusLocal(themeId, serviceId, status);
  }
  try {
    return await setSavedServiceStatusWithClient(requireSupabase(), themeId, serviceId, status);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return setSavedServiceStatusLocal(themeId, serviceId, status);
    }
    throw error;
  }
}

/** Activate / Deactivate shortcut. */
export async function setSavedServiceActiveWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  isActive: boolean,
): Promise<SavedService> {
  const { data, error } = await client.rpc('set_saved_service_active', {
    p_service_id: serviceId,
    p_is_active: isActive,
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    throw rpcError(error, 'Unable to change service status.');
  }
  const raw = asRecord(data, 'saved service status');
  return mapSavedService(raw, asString(raw.business_id, 'status business_id'), themeId);
}

export async function setSavedServiceActive(
  themeId: DatabaseCatalogThemeId,
  serviceId: string,
  isActive: boolean,
): Promise<SavedService> {
  if (!isSupabaseConfigured) {
    return {
      id: serviceId,
      businessId: 'mock-business',
      themeId,
      themeKey: themeId,
      categoryId: 'mock-category',
      predefinedServiceId: null,
      name: 'Mock Active Service',
      category: 'Mock Category',
      description: 'Mock Description',
      price: 50,
      duration: 30,
      status: isActive ? 'active' : 'inactive',
      featured: false,
      translations: [],
    };
  }
  if (savedServiceRpcSurfaceMissing) {
    return setSavedServiceActiveLocal(themeId, serviceId, isActive);
  }
  try {
    return await setSavedServiceActiveWithClient(requireSupabase(), themeId, serviceId, isActive);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return setSavedServiceActiveLocal(themeId, serviceId, isActive);
    }
    throw error;
  }
}

/**
 * Deletes only this salon's saved service row. Global themes,
 * service_categories and predefined_services are never targeted.
 */
export async function deleteSavedServiceWithClient(
  client: SupabaseClient,
  serviceId: string,
): Promise<string> {
  const { data, error } = await client.rpc('delete_saved_service', {
    p_service_id: serviceId,
  });
  if (error) {
    noteRpcSurfaceProbe(error);
    throw rpcError(error, 'Unable to delete this saved service.');
  }
  if (data !== serviceId) throw new SavedServiceError('The database deleted a different service.');
  return serviceId;
}

export async function deleteSavedService(serviceId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    return serviceId;
  }
  if (savedServiceRpcSurfaceMissing) {
    return deleteSavedServiceLocal(serviceId);
  }
  try {
    return await deleteSavedServiceWithClient(requireSupabase(), serviceId);
  } catch (error) {
    if (savedServiceRpcSurfaceMissing) {
      return deleteSavedServiceLocal(serviceId);
    }
    throw error;
  }
}
