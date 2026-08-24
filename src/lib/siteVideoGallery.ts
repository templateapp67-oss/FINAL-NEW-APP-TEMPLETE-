/**
 * PHASE 15.1 + 15.3 + 15.5 — VIDEO GALLERY data layer (all five themes).
 *
 * ONE shared, theme-scoped video architecture. Every theme renders the same
 * `SiteVideoGallery` component, but each theme resolves its OWN video
 * collection so a barber's cuts reel never appears on the nail & lash site.
 *
 * Content sources:
 *   1. Owner-configured `SalonData.socialVideos` (URLs + thumbnails only —
 *      matches the existing `social_videos` table: no video file storage).
 *      Items optionally scoped with `themeId` (Phase 15.1).
 *   2. PHASE 15.3 / 15.5 — per-theme PROTECTED mock catalog of exactly
 *      5 Shorts + 5 Long videos (`siteVideoCatalog.ts`). Fills any kind the
 *      owner has not fully configured. Mock rows are never permanently
 *      deleted (see `isProtectedThemeMockVideo` / `filterDeletableOwnerVideos`).
 *
 * No database tables, columns, or relationships are invented. Unsafe media
 * URLs are rejected through the existing `isSafeMediaUrl` gate. Embed URLs
 * reuse the existing Phase 10.8 parsers in `siteSocialFeed`.
 */
import type { SalonData, SocialVideo } from '../types';
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';
import { isSafeMediaUrl, safeMediaUrl } from './siteHero';
import {
  instagramEmbedUrl,
  parseInstagramShortcode,
  parseYoutubeVideoId,
  youtubeEmbedUrl,
  youtubeThumbUrl,
  type SocialPlatform,
} from './siteSocialFeed';
import {
  isDisabledThemeMockId,
  isProtectedThemeMockVideo,
  isThemeMockVideoId,
  themeVideosOfKind,
  VIDEO_KIND_LONG,
  VIDEO_KIND_QUOTA,
  VIDEO_KIND_SHORT,
  type VideoKind,
} from './siteVideoCatalog';
import { isCustomerVisibleSocialVideo } from './videoModeration';
import { validateOriginalVideoUrl } from './originalVideoDestination';

// Re-export delete guards so callers can import from the gallery layer.
export {
  filterDeletableOwnerVideos,
  isDeleteBlockedForVideoId,
  isProtectedThemeMockVideo,
  isThemeMockVideoId,
} from './siteVideoCatalog';

/* ------------------------------------------------------------------ */
/* Normalised video gallery item                                       */
/* ------------------------------------------------------------------ */

export type VideoGalleryPlatform = SocialPlatform;

export interface VideoGalleryItem {
  id: string;
  title: string;
  platform: VideoGalleryPlatform;
  /** Exact validated original watch URL (never a generated redirect). */
  url: string;
  /** Explicit alias used by the Phase 15.7 external-player interaction. */
  originalPlatformUrl: string;
  /** Safe thumbnail URL, or '' when none is usable. */
  thumbnailUrl: string;
  /** Provider embed URL when the link can be parsed; otherwise null. */
  embedUrl: string | null;
  embedKind: 'youtube' | 'instagram' | null;
  /** Origin of this card. */
  origin: 'owner' | 'theme';
  /** Theme the item is scoped to, when set. */
  themeId: SiteHeaderThemeId | null;
  /** PHASE 15.3 — short vs long. */
  kind: VideoKind;
  dateAdded?: string;
  channelName?: string;
  description?: string;
  externalVideoId?: string | null;
}

export interface VideoGalleryThemeConfig {
  /** Responsive grid columns (desktop / tablet / mobile). */
  grid: { desktop: 1 | 2 | 3 | 4 | 5; tablet: 1 | 2 | 3 | 4; mobile: 1 | 2 };
  /** Fixed tile aspect ratio for shorts (prevents layout shift). */
  shortTileRatio: string;
  /** Fixed tile aspect ratio for long videos. */
  longTileRatio: string;
  /** Quota of shorts + longs the section always aims to show. */
  shortQuota: number;
  longQuota: number;
}

/**
 * Per-theme presentation config. Grid / ratio only — content is never shared
 * or copied across themes.
 */
export const VIDEO_GALLERY_THEME_CONFIG: Record<SiteHeaderThemeId, VideoGalleryThemeConfig> = {
  barber_mens_grooming: {
    grid: { desktop: 5, tablet: 3, mobile: 2 },
    shortTileRatio: '9/16',
    longTileRatio: '16/9',
    shortQuota: VIDEO_KIND_QUOTA,
    longQuota: VIDEO_KIND_QUOTA,
  },
  hair_studio_color_bar: {
    grid: { desktop: 5, tablet: 3, mobile: 2 },
    shortTileRatio: '9/16',
    longTileRatio: '16/9',
    shortQuota: VIDEO_KIND_QUOTA,
    longQuota: VIDEO_KIND_QUOTA,
  },
  beauty_skin_spa: {
    grid: { desktop: 5, tablet: 3, mobile: 2 },
    shortTileRatio: '9/16',
    longTileRatio: '16/9',
    shortQuota: VIDEO_KIND_QUOTA,
    longQuota: VIDEO_KIND_QUOTA,
  },
  family_full_service: {
    grid: { desktop: 5, tablet: 3, mobile: 2 },
    shortTileRatio: '9/16',
    longTileRatio: '16/9',
    shortQuota: VIDEO_KIND_QUOTA,
    longQuota: VIDEO_KIND_QUOTA,
  },
  nail_lash_studio: {
    grid: { desktop: 5, tablet: 3, mobile: 2 },
    shortTileRatio: '9/16',
    longTileRatio: '16/9',
    shortQuota: VIDEO_KIND_QUOTA,
    longQuota: VIDEO_KIND_QUOTA,
  },
};

const THEME_IDS = new Set<string>(Object.keys(VIDEO_GALLERY_THEME_CONFIG));

export function isVideoGalleryThemeId(value: unknown): value is SiteHeaderThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

export function videoGalleryThemeConfig(themeId: SiteHeaderThemeId): VideoGalleryThemeConfig {
  return VIDEO_GALLERY_THEME_CONFIG[themeId] || VIDEO_GALLERY_THEME_CONFIG.barber_mens_grooming;
}

/* ------------------------------------------------------------------ */
/* Kind detection                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolves short vs long for a SocialVideo.
 * Explicit `videoKind` wins; otherwise infer from the URL
 * (YouTube Shorts / Instagram Reels / TikTok → short; else long).
 */
export function resolveVideoKind(video: Pick<SocialVideo, 'videoKind' | 'url' | 'platform'>): VideoKind {
  if (video.videoKind === 'short' || video.videoKind === 'long') return video.videoKind;
  const url = (video.url || '').toLowerCase();
  if (/\/shorts\//.test(url)) return VIDEO_KIND_SHORT;
  if (/instagram\.com\/(reel|reels)\//.test(url)) return VIDEO_KIND_SHORT;
  if (/tiktok\.com\//.test(url)) return VIDEO_KIND_SHORT;
  if (video.platform === 'tiktok') return VIDEO_KIND_SHORT;
  return VIDEO_KIND_LONG;
}

/* ------------------------------------------------------------------ */
/* Theme isolation                                                     */
/* ------------------------------------------------------------------ */

/**
 * An owner video belongs to the active theme unless explicitly scoped to
 * another theme (same grandfathering rule as gallery photos).
 */
export function ownerVideoBelongsToTheme(
  video: SocialVideo | null | undefined,
  themeId: SiteHeaderThemeId,
): boolean {
  if (!video || typeof video !== 'object') return false;
  if (!video.themeId) return true;
  if (!isVideoGalleryThemeId(video.themeId)) return false;
  return video.themeId === themeId;
}

/** Safe external page URL (http/https only) for open-in-new-tab actions. */
export function safeExternalVideoUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  if (/[\u0000-\u001F\u007F]/.test(url)) return '';
  return url;
}

/**
 * Resolves a usable thumbnail:
 *   1. Owner-configured thumbnail (must pass isSafeMediaUrl)
 *   2. YouTube hqdefault derived from a parseable YouTube id
 *   3. Empty string → UI shows the broken-thumbnail fallback
 */
export function resolveVideoThumbnail(video: SocialVideo): string {
  const ownerThumb = safeMediaUrl(video.thumbnailUrl);
  if (ownerThumb) return ownerThumb;
  const yt = parseYoutubeVideoId(video.url || '') || (video.externalVideoId && /^[a-zA-Z0-9_-]{11}$/.test(video.externalVideoId) ? video.externalVideoId : null);
  if (yt) {
    const derived = youtubeThumbUrl(yt);
    return isSafeMediaUrl(derived) ? derived : '';
  }
  return '';
}

function resolveEmbed(video: SocialVideo): {
  embedUrl: string | null;
  embedKind: VideoGalleryItem['embedKind'];
} {
  const yt =
    parseYoutubeVideoId(video.url || '') ||
    (typeof video.externalVideoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(video.externalVideoId)
      ? video.externalVideoId
      : null);
  if (yt) {
    return { embedUrl: youtubeEmbedUrl(yt), embedKind: 'youtube' };
  }
  const ig = parseInstagramShortcode(video.url || '');
  if (ig) {
    const reel = /\/reel\//i.test(video.url || '');
    return { embedUrl: instagramEmbedUrl(ig, reel ? 'reel' : 'p'), embedKind: 'instagram' };
  }
  return { embedUrl: null, embedKind: null };
}

const PLATFORMS: ReadonlySet<string> = new Set(['instagram', 'youtube', 'facebook', 'tiktok']);

function normalisePlatform(value: unknown): VideoGalleryPlatform {
  if (typeof value === 'string' && PLATFORMS.has(value)) return value as VideoGalleryPlatform;
  return 'instagram';
}

/**
 * Normalises ONE owner social video for the active theme.
 * Returns `null` for foreign-theme, unsafe, or incomplete records.
 */
export function ownerVideoForTheme(
  video: SocialVideo | null | undefined,
  themeId: SiteHeaderThemeId,
  locale: AppLocale = 'en',
): VideoGalleryItem | null {
  if (!video || typeof video !== 'object') return null;
  if (!ownerVideoBelongsToTheme(video, themeId)) return null;

  // PHASE 15.7 — open only the exact, platform-matched original destination.
  // `url` remains the fallback for records saved before originalPlatformUrl.
  const destination = validateOriginalVideoUrl(
    video.originalPlatformUrl || video.url,
    null,
    video.externalVideoId,
  );
  if (!destination.ok) return null;
  const url = destination.url;

  const id = typeof video.id === 'string' && video.id.trim() ? video.id.trim() : '';
  if (!id) return null;

  const titleRaw = typeof video.title === 'string' ? video.title.trim() : '';
  // Legacy records occasionally carried a stale platform label. The validated
  // host is authoritative, so the card accurately identifies its source.
  const platform = destination.platform || normalisePlatform(video.platform);
  const kind = resolveVideoKind({ ...video, platform });
  const title =
    titleRaw ||
    (locale === 'hi'
      ? kind === 'short'
        ? 'शॉर्ट'
        : 'वीडियो'
      : kind === 'short'
        ? 'Short'
        : 'Video');

  const { embedUrl, embedKind } = resolveEmbed({ ...video, url, platform });
  // Prefer an explicit owner thumbnail only when it is a safe URL; otherwise
  // fall through to YouTube-derived. Empty/unsafe owner thumbs → '' so the UI
  // can show the broken-thumbnail fallback (never a broken <img>).
  const thumbnailUrl = resolveVideoThumbnail({ ...video, url, platform });

  return {
    id,
    title,
    platform,
    url,
    originalPlatformUrl: url,
    thumbnailUrl,
    embedUrl,
    embedKind,
    origin: 'owner',
    themeId: isVideoGalleryThemeId(video.themeId) ? video.themeId : null,
    kind,
    dateAdded: typeof video.dateAdded === 'string' ? video.dateAdded : undefined,
    channelName: typeof video.channelName === 'string' ? video.channelName : undefined,
    description: typeof video.description === 'string' ? video.description : undefined,
    externalVideoId: video.externalVideoId ?? null,
  };
}

function themeSeedToItem(video: SocialVideo, themeId: SiteHeaderThemeId): VideoGalleryItem | null {
  // Theme seeds are already stamped with themeId + videoKind + safe URLs.
  const item = ownerVideoForTheme(video, themeId, 'en');
  if (!item) return null;
  return { ...item, origin: 'theme' };
}

/**
 * Builds the complete, deduplicated video gallery for the active theme.
 *
 * Owner videos first (theme-scoped). Then, for each kind (short / long), if
 * the owner has fewer than the quota (5), theme catalog seeds fill the gap
 * — never borrowing another theme's content. Result is always up to 5 shorts
 * + 5 longs when the catalog is present.
 */
export function videoItemsForTheme(
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
  locale: AppLocale = 'en',
  ownerDataOnly = false,
): VideoGalleryItem[] {
  const config = videoGalleryThemeConfig(themeId);
  const ownerItems: VideoGalleryItem[] = [];
  const seen = new Set<string>();

  for (const raw of data.socialVideos || []) {
    // PHASE 15.5 — protected mock rows that somehow landed in owner storage
    // are never treated as owner content. The catalog fill path re-injects
    // them under origin:'theme' so they cannot be permanently deleted.
    if (isProtectedThemeMockVideo(raw) || isThemeMockVideoId(raw?.id)) continue;
    // PHASE 15.6 — only approved + active owner videos are customer-visible;
    // pending / rejected / unpublished rows stay in the salon record but the
    // catalog fill tops the theme up so the 5+5 contract still holds.
    if (!isCustomerVisibleSocialVideo(raw)) continue;
    const item = ownerVideoForTheme(raw, themeId, locale);
    if (!item) continue;
    if (seen.has(item.id) || seen.has(item.url)) continue;
    seen.add(item.id);
    seen.add(item.url);
    if (item.externalVideoId) seen.add(`ext:${item.externalVideoId}`);
    ownerItems.push(item);
  }

  const shorts = ownerItems.filter((i) => i.kind === 'short').slice(0, config.shortQuota);
  const longs = ownerItems.filter((i) => i.kind === 'long').slice(0, config.longQuota);

  const fillKind = (kind: VideoKind, current: VideoGalleryItem[], quota: number): VideoGalleryItem[] => {
    if (current.length >= quota) return current.slice(0, quota);
    const needed = quota - current.length;
    const seeds = themeVideosOfKind(themeId, kind);
    const extras: VideoGalleryItem[] = [];
    for (const seed of seeds) {
      if (extras.length >= needed) break;
      // PHASE 15.6 — admin-disabled showcase records are skipped for this
      // salon (per-salon tombstone; the shared catalog is never mutated).
      if (isDisabledThemeMockId(data.disabledThemeVideoIds, seed.id)) continue;
      if (seen.has(seed.id) || seen.has(seed.url)) continue;
      if (seed.externalVideoId && seen.has(`ext:${seed.externalVideoId}`)) continue;
      const item = themeSeedToItem(seed, themeId);
      if (!item) continue;
      seen.add(item.id);
      seen.add(item.url);
      if (item.externalVideoId) seen.add(`ext:${item.externalVideoId}`);
      extras.push(item);
    }
    return current.concat(extras).slice(0, quota);
  };

  // Authenticated owner previews are a real-data boundary: never fill missing
  // rows with the protected showcase catalog. Published sites retain the
  // existing curated presentation behaviour.
  const finalShorts = ownerDataOnly
    ? shorts
    : fillKind(VIDEO_KIND_SHORT, shorts, config.shortQuota);
  const finalLongs = ownerDataOnly
    ? longs
    : fillKind(VIDEO_KIND_LONG, longs, config.longQuota);

  // Shorts first, then longs — stable, predictable order for the UI tabs.
  return [...finalShorts, ...finalLongs];
}

/** Items of one kind for the active theme (after fill). */
export function videoItemsOfKindForTheme(
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
  kind: VideoKind,
  locale: AppLocale = 'en',
): VideoGalleryItem[] {
  return videoItemsForTheme(themeId, data, locale).filter((item) => item.kind === kind);
}

/** True when the active theme has zero customer-visible videos (after fill). */
export function videoGalleryIsEmpty(
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
): boolean {
  return videoItemsForTheme(themeId, data).length === 0;
}

/**
 * Convenience: project the active theme's video ids (for tests / isolation
 * checks). Order matches `videoItemsForTheme`.
 */
export function videoIdsForTheme(
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
): string[] {
  return videoItemsForTheme(themeId, data).map((item) => item.id);
}

/** Counts after fill — used by tests to assert the 5 + 5 contract. */
export function videoKindCountsForTheme(
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'> = { socialVideos: [] },
): { short: number; long: number; total: number } {
  const items = videoItemsForTheme(themeId, data);
  const short = items.filter((i) => i.kind === 'short').length;
  const long = items.filter((i) => i.kind === 'long').length;
  return { short, long, total: items.length };
}
