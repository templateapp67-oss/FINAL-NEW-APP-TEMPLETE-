/**
 * LOCAL DRAFT CACHE (offline / failure fallback)
 *
 * Supabase is the authority for the owner's salon draft. This module is the
 * SECOND line of defence the autosave writes to on every change:
 *
 *   - It lets the builder survive a refresh, a dropped connection, or a failed
 *     backend write without losing salon details, logo, hero, gallery,
 *     services, offers or team info.
 *   - It is TENANT-SCOPED: the cache key is derived from the signed-in user id,
 *     so one browser can never restore another account's salon.
 *   - It is only ever read as a FALLBACK: when the backend draft is empty/failed
 *     and this cache holds newer content for the same user.
 */
import type { SalonData } from '../types';
import { safeGetItem, safeRemoveItem, safeSetItem } from './safeStorage';
import {
  draftFingerprint,
  hasDraftContent,
  mergeUnifiedDraft,
  unifiedDraftFromSalonData,
} from './unifiedSalonDraft';

export { hasDraftContent };

export const DRAFT_CACHE_VERSION = 1;
const DRAFT_CACHE_PREFIX = 'nexora_salon_draft_v1';

/** Cache key for one authenticated owner (never shared between accounts). */
export function draftCacheKey(userId?: string | null): string {
  const scope = (userId || '').trim() || 'anonymous';
  return `${DRAFT_CACHE_PREFIX}:${scope}`;
}

export interface SalonDraftCache {
  version: number;
  /** Owner user id this cache belongs to ('anonymous' when signed out). */
  userId: string;
  step: number;
  /** The unified persisted slice of `SalonData`. */
  draft: Partial<SalonData>;
  savedAt: string;
}

export function readDraftCache(userId?: string | null): SalonDraftCache | null {
  try {
    const raw = safeGetItem(draftCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SalonDraftCache;
    if (!parsed || parsed.version !== DRAFT_CACHE_VERSION) return null;
    if (typeof parsed.draft !== 'object' || parsed.draft === null) return null;
    // A cache written for another account must never be restored.
    const expected = (userId || '').trim() || 'anonymous';
    if ((parsed.userId || 'anonymous') !== expected) return null;
    return parsed;
  } catch (error) {
    console.warn('Salon draft cache could not be read:', error);
    return null;
  }
}

/**
 * Writes the unified draft to the tenant-scoped cache.
 * Returns false when the write failed (quota) — the caller keeps going, the
 * backend is still the authority.
 */
export function writeDraftCache(
  userId: string | null | undefined,
  data: SalonData,
  step: number,
): boolean {
  const payload: SalonDraftCache = {
    version: DRAFT_CACHE_VERSION,
    userId: (userId || '').trim() || 'anonymous',
    step,
    draft: unifiedDraftFromSalonData(data),
    savedAt: new Date().toISOString(),
  };
  try {
    return safeSetItem(draftCacheKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.warn('Salon draft cache write failed:', error);
    return false;
  }
}

export function clearDraftCache(userId?: string | null): void {
  safeRemoveItem(draftCacheKey(userId));
}

/** Drops every tenant draft cache (used when the owner signs out). */
export function clearAllDraftCaches(): void {
  try {
    const keys: string[] = [];
    const store = typeof window === 'undefined' ? null : window.localStorage;
    if (store) {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key && key.startsWith(DRAFT_CACHE_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => store.removeItem(key));
    }
    // safeStorage keeps an in-memory mirror; clear the current scope too.
    clearDraftCache(null);
    clearDraftCache('anonymous');
  } catch {
    /* storage unavailable — nothing cached to clear */
  }
}

/** Milliseconds since the cache was written (Infinity when unknown). */
export function draftCacheAgeMs(cache: SalonDraftCache | null): number {
  if (!cache?.savedAt) return Number.POSITIVE_INFINITY;
  const saved = Date.parse(cache.savedAt);
  if (Number.isNaN(saved)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - saved);
}

/** True when this cache has content newer than the supplied draft snapshot. */
export function isDraftCacheNewer(cache: SalonDraftCache | null, current: SalonData | null): boolean {
  if (!cache) return false;
  if (!current) return true;
  return draftFingerprint(cache.draft as SalonData) !== draftFingerprint(current);
}

/**
 * Restores the cached draft onto `base`, keeping identity/publish fields
 * (salonId, slug, publishState) owned by the database.
 */
export function restoreDraftCache(base: SalonData, cache: SalonDraftCache | null): SalonData {
  if (!cache?.draft) return base;
  return mergeUnifiedDraft(base, cache.draft);
}
