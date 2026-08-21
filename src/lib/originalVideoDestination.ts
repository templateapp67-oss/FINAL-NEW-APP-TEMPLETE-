/**
 * PHASE 15.7 — safe, exact original-platform destinations.
 *
 * This module deliberately does not canonicalise, append parameters, shorten,
 * or otherwise modify a video URL. A successful result returns the exact
 * trimmed input. Validation is host- and platform-aware so a record labelled
 * YouTube can never send a visitor to another host.
 */
import type { SocialVideo } from '../types';
import { parseInstagramShortcode, parseYoutubeVideoId, type SocialPlatform } from './siteSocialFeed';

export type OriginalVideoUrlError =
  | 'missing'
  | 'invalid'
  | 'unsafe'
  | 'platform_mismatch'
  | 'not_video'
  | 'id_mismatch';

export type OriginalVideoUrlResult =
  | { ok: true; url: string; platform: SocialPlatform; externalVideoId: string | null }
  | { ok: false; code: OriginalVideoUrlError };

const EXACT_HOSTS: Record<SocialPlatform, ReadonlySet<string>> = {
  youtube: new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com']),
  instagram: new Set(['instagram.com']),
  facebook: new Set(['facebook.com', 'm.facebook.com', 'fb.watch', 'fb.com']),
  tiktok: new Set(['tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']),
};

function normalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function platformForHost(hostname: string): SocialPlatform | null {
  const host = normalHost(hostname);
  for (const [platform, hosts] of Object.entries(EXACT_HOSTS) as [SocialPlatform, ReadonlySet<string>][]) {
    if (hosts.has(host)) return platform;
  }
  return null;
}

/** Validate a single-video destination and preserve its exact URL. */
export function validateOriginalVideoUrl(
  value: unknown,
  expectedPlatform?: SocialPlatform | null,
  expectedExternalVideoId?: string | null,
): OriginalVideoUrlResult {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, code: 'missing' };
  const exact = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(exact)) return { ok: false, code: 'unsafe' };

  let parsed: URL;
  try {
    parsed = new URL(exact);
  } catch {
    return { ok: false, code: 'invalid' };
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) {
    return { ok: false, code: 'unsafe' };
  }

  const detected = platformForHost(parsed.hostname);
  if (!detected || (expectedPlatform && detected !== expectedPlatform)) {
    return { ok: false, code: 'platform_mismatch' };
  }

  let externalVideoId: string | null = null;
  if (detected === 'youtube') {
    externalVideoId = parseYoutubeVideoId(exact);
    if (!externalVideoId) return { ok: false, code: 'not_video' };
  } else if (detected === 'instagram') {
    externalVideoId = parseInstagramShortcode(exact);
    if (!externalVideoId) return { ok: false, code: 'not_video' };
  } else if (detected === 'facebook') {
    const isVideo = normalHost(parsed.hostname) === 'fb.watch'
      || /\/(?:watch|reel|reels|videos)\b/i.test(parsed.pathname)
      || parsed.searchParams.has('v');
    if (!isVideo) return { ok: false, code: 'not_video' };
  } else if (detected === 'tiktok') {
    const isVideo = /\/video\/\d+/i.test(parsed.pathname)
      || ['vm.tiktok.com', 'vt.tiktok.com'].includes(normalHost(parsed.hostname));
    if (!isVideo) return { ok: false, code: 'not_video' };
  }

  if (expectedExternalVideoId && externalVideoId && expectedExternalVideoId !== externalVideoId) {
    return { ok: false, code: 'id_mismatch' };
  }
  return { ok: true, url: exact, platform: detected, externalVideoId };
}

/** Resolve a record's immutable destination, with backward compatibility. */
export function originalDestinationForVideo(
  video: Pick<SocialVideo, 'url' | 'originalPlatformUrl' | 'platform' | 'externalVideoId'>,
): OriginalVideoUrlResult {
  const candidate = video.originalPlatformUrl || video.url;
  return validateOriginalVideoUrl(candidate, video.platform, video.externalVideoId);
}

/** Open only a validated original destination. Returns false when blocked. */
export function openOriginalVideoDestination(
  value: unknown,
  platform: SocialPlatform,
  externalVideoId?: string | null,
): boolean {
  const result = validateOriginalVideoUrl(value, platform, externalVideoId);
  if (!result.ok || typeof window === 'undefined') return false;
  window.open(result.url, '_blank', 'noopener,noreferrer');
  return true;
}
