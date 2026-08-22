/**
 * Safe localStorage wrapper with proactive quota management, automatic cache eviction,
 * and seamless in-memory fallback.
 */

const inMemoryFallback = new Map<string, string>();

/** Disposable / expendable keys that can be purged to free up quota */
const PURGEABLE_KEYS = [
  'nexora_usage_analytics',
  'nexora_booking_holds',
  'nexora_site_review_store',
];

/** Check if error is due to storage quota exhaustion */
function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    e.number === -2147024882 ||
    String(e.message || e).toLowerCase().includes('quota')
  );
}

/** Free up storage space by purging disposable keys and compacting heavy payloads */
function freeStorageSpace(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // 1. Purge disposable logging/cache keys
  for (const key of PURGEABLE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  // 2. Compact heavy onboarding payload if it contains large data URLs
  try {
    const raw = localStorage.getItem('nexora_onboarding_state');
    if (raw && raw.length > 500000) {
      // Larger than ~500KB
      const parsed = JSON.parse(raw);
      if (parsed?.data) {
        // Strip oversized data: URLs in photos for storage mirror
        if (Array.isArray(parsed.data.photos)) {
          parsed.data.photos = parsed.data.photos.map((p: any) => {
            if (typeof p === 'string' && p.startsWith('data:') && p.length > 20000) {
              return '';
            }
            if (p && typeof p === 'object' && p.url && p.url.startsWith('data:') && p.url.length > 20000) {
              return { ...p, url: '' };
            }
            return p;
          }).filter(Boolean);
        }
        localStorage.setItem('nexora_onboarding_state', JSON.stringify(parsed));
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Safely writes to localStorage with quota-exceeded mitigation and memory fallback.
 */
export function safeSetItem(key: string, value: string): boolean {
  inMemoryFallback.set(key, value);

  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }

  // 1. First attempt: normal setItem
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      return false;
    }
  }

  // 2. Second attempt: free disposable cache space and retry
  try {
    freeStorageSpace();
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      return false;
    }
  }

  // 3. Third attempt: if payload is JSON with huge data URLs, compact it
  try {
    if (value.includes('data:image')) {
      const parsed = JSON.parse(value);
      // Recursively or shallowly compact large data URLs > 10KB
      const cleanString = JSON.stringify(parsed, (k, v) => {
        if (typeof v === 'string' && v.startsWith('data:image') && v.length > 10000) {
          return '';
        }
        return v;
      });
      localStorage.setItem(key, cleanString);
      return true;
    }
  } catch {
    /* continue to memory fallback */
  }

  // Value remains in inMemoryFallback for the current session
  return true;
}

/**
 * Safely reads from localStorage with in-memory fallback.
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return inMemoryFallback.get(key) || null;
  }

  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
  } catch {
    /* fallback to memory */
  }

  return inMemoryFallback.get(key) || null;
}

/**
 * Safely removes a key from localStorage and memory.
 */
export function safeRemoveItem(key: string): void {
  inMemoryFallback.delete(key);
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
