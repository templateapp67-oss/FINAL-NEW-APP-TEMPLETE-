import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseCatalogThemeId } from './themeCatalogService';
import { requireSupabase } from './supabaseClient';

export interface ServiceSafetyLock {
  serviceId: string;
  upcomingAppointments: number;
  activeBookings: number;
  pendingTransactions: number;
  packageLinks: number;
  locked: boolean;
  canDelete: boolean;
}

export interface ServiceAuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  serviceName?: string;
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  createdAt: string;
}

export class ServiceSafetyError extends Error {
  constructor(message = 'Unable to complete this service change.') {
    super(message);
    this.name = 'ServiceSafetyError';
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceSafetyError('Invalid safety response.');
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value) throw new ServiceSafetyError(`Invalid ${label}.`);
  return value;
};

const asNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const safe = (error: unknown, fallback: string): ServiceSafetyError => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  if (raw) console.error('Service safety RPC failed:', error);
  if (/log in|salon|not found|upcoming|active booking|pending|archive|package|catalog/i.test(raw)) {
    return new ServiceSafetyError(raw);
  }
  return new ServiceSafetyError(fallback);
};

export function mapSafetyLock(rawValue: unknown): ServiceSafetyLock {
  const raw = asRecord(rawValue);
  return {
    serviceId: asString(raw.service_id, 'service id'),
    upcomingAppointments: asNumber(raw.upcoming_appointments),
    activeBookings: asNumber(raw.active_bookings),
    pendingTransactions: asNumber(raw.pending_transactions),
    packageLinks: asNumber(raw.package_links),
    locked: raw.locked === true,
    canDelete: raw.can_delete === true,
  };
}

export async function loadServiceSafetyLockWithClient(
  client: SupabaseClient,
  serviceId: string,
): Promise<ServiceSafetyLock> {
  const { data, error } = await client.rpc('get_service_safety_lock', { p_service_id: serviceId });
  if (error) throw safe(error, 'Unable to check booking safety.');
  return mapSafetyLock(data);
}

export function loadServiceSafetyLock(serviceId: string): Promise<ServiceSafetyLock> {
  return loadServiceSafetyLockWithClient(requireSupabase(), serviceId);
}

export async function archiveSavedServiceWithClient(
  client: SupabaseClient,
  serviceId: string,
): Promise<string> {
  const { data, error } = await client.rpc('archive_saved_service', { p_service_id: serviceId });
  if (error) throw safe(error, 'Unable to archive this service.');
  const raw = asRecord(data);
  return asString(raw.id, 'archived service id');
}

export function archiveSavedService(serviceId: string): Promise<string> {
  return archiveSavedServiceWithClient(requireSupabase(), serviceId);
}

export async function loadThemeServiceAuditWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
): Promise<ServiceAuditEntry[]> {
  const { data, error } = await client.rpc('get_theme_service_audit', { p_theme_id: themeId });
  if (error) throw safe(error, 'Unable to load the audit trail.');
  const payload = asRecord(data);
  if (asString(payload.theme_id, 'audit theme') !== themeId) {
    throw new ServiceSafetyError('Audit returned a different theme.');
  }
  const rows = Array.isArray(payload.entries) ? payload.entries : [];
  return rows.map((value) => {
    const row = asRecord(value);
    return {
      id: asString(row.id, 'audit id'),
      actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
      action: asString(row.action, 'audit action'),
      entityType: asString(row.entity_type, 'entity type'),
      entityId: typeof row.entity_id === 'string' ? row.entity_id : null,
      serviceName: typeof row.service_name === 'string' ? row.service_name : undefined,
      previous: row.previous && typeof row.previous === 'object' && !Array.isArray(row.previous)
        ? row.previous as Record<string, unknown>
        : {},
      next: row.next && typeof row.next === 'object' && !Array.isArray(row.next)
        ? row.next as Record<string, unknown>
        : {},
      createdAt: String(row.created_at ?? ''),
    };
  });
}

export function loadThemeServiceAudit(themeId: DatabaseCatalogThemeId): Promise<ServiceAuditEntry[]> {
  return loadThemeServiceAuditWithClient(requireSupabase(), themeId);
}

export async function checkThemeIntegrityWithClient(
  client: SupabaseClient,
  themeId: DatabaseCatalogThemeId,
): Promise<{ ok: boolean; issueCount: number }> {
  const { data, error } = await client.rpc('check_theme_service_integrity', { p_theme_id: themeId });
  if (error) throw safe(error, 'Unable to validate service integrity.');
  const payload = asRecord(data);
  if (asString(payload.theme_id, 'integrity theme') !== themeId) {
    throw new ServiceSafetyError('Integrity check returned a different theme.');
  }
  return { ok: payload.ok === true, issueCount: asNumber(payload.issue_count) };
}

export function checkThemeIntegrity(themeId: DatabaseCatalogThemeId) {
  return checkThemeIntegrityWithClient(requireSupabase(), themeId);
}
