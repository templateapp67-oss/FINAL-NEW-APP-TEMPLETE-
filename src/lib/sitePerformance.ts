/**
 * PHASE 10.12 — PERFORMANCE & LOADING OPTIMIZATION
 *
 * - Image optimization helpers
 * - Video lazy-loading helpers
 * - Request deduplication & caching
 * - Large list optimization
 * - Prevent layout shift
 *
 * No DB changes, no theme/service architecture change.
 */

export const IMAGE_CACHE = new Map<string, { loaded: boolean; error: boolean }>();

export function isImageCached(src: string): boolean {
  return IMAGE_CACHE.has(src) && !!IMAGE_CACHE.get(src)?.loaded;
}

export function markImageLoaded(src: string) {
  IMAGE_CACHE.set(src, { loaded: true, error: false });
}
export function markImageError(src: string) {
  IMAGE_CACHE.set(src, { loaded: false, error: true });
}

/** Generate responsive srcSet for Unsplash-like images that support w param */
export function buildSrcSet(src: string, widths: number[] = [320, 640, 960, 1280]): string | undefined {
  if (!src) return undefined;
  // Only for URLs that look like unsplash or support query params
  // If already has w param, we respect but still generate srcSet
  try {
    const url = new URL(src);
    // Unsplash and similar support w parameter
    if (url.hostname.includes('unsplash.com') || url.hostname.includes('images.unsplash.com') || src.includes('example.com')) {
      return widths
        .map((w) => {
          const u = new URL(src);
          u.searchParams.set('w', String(w));
          u.searchParams.set('auto', 'format');
          u.searchParams.set('fit', 'crop');
          u.searchParams.set('q', '80');
          return `${u.toString()} ${w}w`;
        })
        .join(', ');
    }
  } catch {
    // Not a valid URL (maybe data url), no srcSet
  }
  return undefined;
}

/** Determine if image is above-the-fold (hero, logo) */
export function isAboveFold(context: 'hero' | 'logo' | 'service' | 'gallery' | 'team' | 'owner' | 'video' | 'other' = 'other'): boolean {
  return context === 'hero' || context === 'logo';
}

/** Intersection Observer hook helper — returns true when element is in viewport */
export let __mockInView: boolean | null = null;
export function setMockInViewForTests(v: boolean | null) {
  __mockInView = v;
}

/** Simple LRU cache for request deduplication */
class RequestCache {
  private cache = new Map<string, { ts: number; data: any }>();
  private max = 100;
  private ttl = 5 * 60 * 1000; // 5 min

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }
  set(key: string, data: any) {
    if (this.cache.size >= this.max) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    this.cache.set(key, { ts: Date.now(), data });
  }
  clear() {
    this.cache.clear();
  }
  clearByPrefix(prefix: string) {
    for (const k of Array.from(this.cache.keys())) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }
}

export const requestCache = new RequestCache();

/** Prevent duplicate fetches when switching themes */
let activeTheme: string | null = null;
export function setActiveTheme(themeId: string) {
  if (activeTheme && activeTheme !== themeId) {
    // Clear stale theme-specific image cache entries older than 1 min? For now clear request cache for previous theme
    requestCache.clearByPrefix(`theme:${activeTheme}:`);
  }
  activeTheme = themeId;
}

/** Optimize large lists: slice with pagination to avoid rendering 100+ items at once */
export function paginateList<T>(list: T[], pageSize = 20, page = 0): { items: T[]; hasMore: boolean; total: number } {
  const total = list.length;
  const start = page * pageSize;
  const end = start + pageSize;
  return {
    items: list.slice(start, end),
    hasMore: end < total,
    total,
  };
}

/** Layout shift prevention: calculate aspect ratio from image URL or provide default */
export function parseAspectRatio(ratio: string | undefined): string {
  if (!ratio) return '16/9';
  // Accept "square", "video", "4/5", "16/9" etc
  if (ratio === 'square') return '1/1';
  if (ratio === 'video') return '16/9';
  if (ratio.match(/^\d+\/\d+$/)) return ratio;
  return '16/9';
}

/** Performance marks for measuring */
export function markPerformance(name: string) {
  if (typeof performance !== 'undefined' && performance.mark) {
    try {
      performance.mark(name);
    } catch {}
  }
}
export function measurePerformance(name: string, start: string, end: string) {
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      performance.measure(name, start, end);
    } catch {}
  }
}
