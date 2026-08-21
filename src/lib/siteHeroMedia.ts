/**
 * PHASE 11.3 — HERO MEDIA RESOLUTION (all five themes).
 *
 * Builds on the Phase 11.1 hero visuals and the EXISTING performance system
 * (`sitePerformance.ts` srcset/lazy rules, `SiteImage`). Nothing here changes
 * the hero layout (11.1), the hero copy (11.2), the header, the language /
 * dark-mode systems or any database / service architecture.
 *
 * Responsibilities:
 *   - Decide whether a theme's hero shows a VIDEO or an IMAGE.
 *   - Resolve a theme-specific video source + poster, never shared across
 *     themes, with an image fallback when the video fails or is unsupported.
 *   - Serve mobile-optimized media (narrower transforms on small viewports).
 *   - Expose the reduced-motion preference so heroes never autoplay motion
 *     for visitors who asked for less of it.
 */
import { useEffect, useState } from 'react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import type { ViewportMode } from './siteStructure';
import { heroMedia, isSafeMediaUrl, safeMediaUrl } from './siteHero';

/* ------------------------------------------------------------------ */
/* Reduced motion                                                      */
/* ------------------------------------------------------------------ */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Test seam so suites can assert both motion preferences. */
let forcedReducedMotion: boolean | null = null;
export function setReducedMotionForTests(value: boolean | null): void {
  forcedReducedMotion = value;
}

export function prefersReducedMotion(): boolean {
  if (forcedReducedMotion !== null) return forcedReducedMotion;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}

/** Subscribes a hero to the OS reduced-motion preference. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());
  useEffect(() => {
    if (forcedReducedMotion !== null) {
      setReduced(forcedReducedMotion);
      return;
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return;
    }
    const sync = () => setReduced(mql.matches === true);
    sync();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync);
      return () => mql.removeEventListener('change', sync);
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(sync);
      return () => mql.removeListener(sync);
    }
    return;
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Mobile-optimized sources                                            */
/* ------------------------------------------------------------------ */

/** Target pixel width per viewport — keeps mobile payloads small. */
export const HERO_WIDTHS: Record<ViewportMode, number> = {
  desktop: 1400,
  tablet: 1000,
  mobile: 640,
};

/**
 * Rewrites a hero image URL for the active viewport when the host supports
 * width transforms (Unsplash-style `w=` / `q=` params). Unknown hosts, data
 * URLs and blobs are returned untouched — we never break an owner upload.
 */
export function heroImageSrc(url: string, mode: ViewportMode): string {
  const raw = (url || '').trim();
  if (!raw) return raw;
  if (/^(data:|blob:)/i.test(raw)) return raw;
  const width = HERO_WIDTHS[mode] ?? HERO_WIDTHS.desktop;
  try {
    const parsed = new URL(raw, 'https://placeholder.local');
    if (!parsed.searchParams.has('w')) return raw;
    parsed.searchParams.set('w', String(width));
    if (parsed.searchParams.has('q') && mode === 'mobile') parsed.searchParams.set('q', '70');
    return /^https?:/i.test(raw) ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return raw;
  }
}

/** `sizes` attribute matching the hero's real rendered width per viewport. */
export function heroImageSizes(mode: ViewportMode): string {
  if (mode === 'mobile') return '100vw';
  if (mode === 'tablet') return '(max-width: 768px) 100vw, 768px';
  return '(max-width: 1024px) 100vw, 950px';
}

/* ------------------------------------------------------------------ */
/* Hero video                                                          */
/* ------------------------------------------------------------------ */

export type HeroVideoKind = 'file' | 'embed';

export interface HeroVideoSource {
  kind: HeroVideoKind;
  /** Playable `<video>` source, or the external watch/embed URL. */
  src: string;
  /** Poster frame — also the image shown if the video cannot play. */
  poster: string;
  /** Human label (owner reel title, or the theme's own caption key). */
  title: string;
  /** Where the video came from, for tests and debugging. */
  origin: 'owner' | 'theme';
}

/**
 * Per-theme hero background clip registry.
 *
 * IMPORTANT: these are EMPTY by default and the app ships with an image-first
 * hero. We deliberately do not hardcode guessed third-party CDN URLs — an
 * unreachable clip would make every hero silently degrade to its poster.
 *
 * Two supported ways to get a moving hero:
 *   1. The owner publishes a playable video file (`.mp4`/`.webm`/…) through
 *      the EXISTING `socialVideos` data — used inline automatically.
 *   2. A deployment registers a verified, self-hosted clip per theme via
 *      `setThemeHeroVideo()`. Each theme has its own slot, so a barber clip
 *      can never be reused by the spa.
 */
const THEME_VIDEOS: Record<SiteHeaderThemeId, string> = {
  barber_mens_grooming: '',
  hair_studio_color_bar: '',
  beauty_skin_spa: '',
  family_full_service: '',
  nail_lash_studio: '',
};

/** Registers a verified hero clip for ONE theme (deployment/config seam). */
export function setThemeHeroVideo(themeId: SiteHeaderThemeId, src: string | null): void {
  THEME_VIDEOS[themeId] = safeMediaUrl(src);
}

/** Clears every registered theme clip — used by tests. */
export function resetThemeHeroVideos(): void {
  for (const key of Object.keys(THEME_VIDEOS) as SiteHeaderThemeId[]) THEME_VIDEOS[key] = '';
}

/** Direct-playable file extensions we can put in a `<video>` element. */
const VIDEO_FILE_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

export function isPlayableVideoFile(url: string): boolean {
  return VIDEO_FILE_RE.test((url || '').trim());
}

/**
 * Resolves the hero video for a theme.
 *
 * Priority:
 *   1. An owner-published reel whose URL is a directly playable file.
 *   2. Any other owner reel → treated as an external embed (click to open),
 *      never autoplayed inline.
 *   3. The theme's own ambience clip.
 *
 * Returns `null` when `allowVideo` is false (reduced motion, or the theme is
 * configured for a still hero), so the caller renders the image hero instead.
 */
export function heroVideoSource(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  options: { allowThemeVideo?: boolean } = {},
): HeroVideoSource | null {
  const visuals = heroMedia(themeId, data);
  // PHASE 11.7 — an owner reel must have a usable link. Inline clips are held
  // to the media-URL rules; external reels must at least be a real http(s)
  // page (never javascript:/data:), since they open in a new tab.
  const ownerReels = (data.socialVideos || []).filter(
    (video) => video && typeof video.url === 'string' && /^https?:\/\//i.test(video.url.trim()),
  );

  // The poster is ALWAYS the theme's resolved primary visual, which already
  // prefers the owner's `heroImageUrl` then their gallery. A reel thumbnail
  // must never displace the hero image the owner explicitly chose.
  const poster = visuals.primary.url;

  const playable = ownerReels.find((video) => isSafeMediaUrl(video.url) && isPlayableVideoFile(video.url));
  if (playable) {
    return { kind: 'file', src: safeMediaUrl(playable.url), poster, title: playable.title || '', origin: 'owner' };
  }

  const embed = ownerReels[0];
  if (embed) {
    return { kind: 'embed', src: embed.url.trim(), poster, title: embed.title || '', origin: 'owner' };
  }

  if (options.allowThemeVideo === false) return null;
  const themeClip = THEME_VIDEOS[themeId];
  if (!themeClip) return null; // image-first hero — the default.
  return { kind: 'file', src: themeClip, poster, title: '', origin: 'theme' };
}

/** The registered clip for a theme ('' when the hero is image-first). */
export function themeHeroVideoSrc(themeId: SiteHeaderThemeId): string {
  return THEME_VIDEOS[themeId] || '';
}

/**
 * The single decision a hero makes about its own above-the-fold media.
 * `video` is only non-null when motion is actually allowed AND playable
 * inline; everything else falls back to the theme's image hero.
 */
export interface HeroMediaPlan {
  /** Inline, muted, looping background video — or null. */
  video: HeroVideoSource | null;
  /** External reel to link out to (never autoplayed) — or null. */
  externalVideo: HeroVideoSource | null;
  /** The still image used as the hero visual and as the video fallback. */
  posterUrl: string;
  /** True when motion was suppressed by the visitor's OS preference. */
  motionSuppressed: boolean;
}

export function heroMediaPlan(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  reducedMotion: boolean,
): HeroMediaPlan {
  const visuals = heroMedia(themeId, data);
  const resolved = heroVideoSource(themeId, data);
  const posterUrl = resolved?.poster || visuals.primary.url;

  if (!resolved) {
    return { video: null, externalVideo: null, posterUrl, motionSuppressed: reducedMotion };
  }
  if (resolved.kind === 'embed') {
    return { video: null, externalVideo: resolved, posterUrl, motionSuppressed: reducedMotion };
  }
  if (reducedMotion) {
    // Motion suppressed: keep the poster still, and never autoplay.
    return { video: null, externalVideo: null, posterUrl, motionSuppressed: true };
  }
  return { video: resolved, externalVideo: null, posterUrl, motionSuppressed: false };
}

/**
 * Returns the same plan with a different still/poster frame. Used by themes
 * whose layout already shows the primary visual elsewhere (e.g. the barber
 * full-bleed backdrop), so the hero never displays one image twice.
 */
export function withHeroPoster(plan: HeroMediaPlan, posterUrl: string): HeroMediaPlan {
  const next = (posterUrl || '').trim();
  if (!next || next === plan.posterUrl) return plan;
  return {
    ...plan,
    posterUrl: next,
    video: plan.video ? { ...plan.video, poster: next } : null,
    externalVideo: plan.externalVideo ? { ...plan.externalVideo, poster: next } : null,
  };
}

export const HERO_MEDIA_TEST_IDS = {
  video: 'hero-media-video',
  poster: 'hero-media-poster',
  fallback: 'hero-media-fallback',
} as const;
