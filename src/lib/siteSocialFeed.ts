/**
 * PHASE 10.8 — SOCIAL / LATEST WORK feed.
 *
 * Reuses the existing Videos / Reels architecture (`SalonData.socialVideos`
 * + `socialProfiles`). No second video catalog is created and no posts are
 * invented: if the salon has not configured a reel or a profile, the feed
 * is empty.
 *
 * Live embeds are used only when a URL can be parsed into a real provider
 * embed (YouTube 11-char ids, Instagram shortcodes). There is no Instagram
 * Graph / YouTube Data API key in this app, so we never fabricate captions,
 * likes or thumbnails.
 */
import type { SalonData, SocialProfiles, SocialVideo } from '../types';

export type SocialPlatform = 'instagram' | 'youtube' | 'facebook' | 'tiktok';

export interface SocialSource {
  platform: SocialPlatform;
  url: string;
  handle: string;
}

export interface SocialFeedItem {
  id: string;
  platform: SocialPlatform;
  title: string;
  caption: string;
  url: string;
  thumbnailUrl: string;
  embedUrl: string | null;
  embedKind: 'youtube' | 'instagram' | null;
  dateAdded?: string;
  likesCount?: string;
}

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{6,}$/;

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function parseYoutubeVideoId(url: string): string | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return YT_ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = parsed.searchParams.get('v') || '';
    if (YT_ID.test(v)) return v;
    const match = parsed.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]+)/);
    if (match && YT_ID.test(match[1])) return match[1];
  }
  return null;
}

export function parseInstagramShortcode(url: string): string | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  if (!parsed.hostname.includes('instagram.com')) return null;
  const match = parsed.pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!match || !IG_CODE.test(match[2])) return null;
  return match[2];
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function youtubeThumbUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function instagramEmbedUrl(shortcode: string, kind: 'p' | 'reel' = 'p'): string {
  const path = kind === 'reel' ? 'reel' : 'p';
  return `https://www.instagram.com/${path}/${shortcode}/embed`;
}

export function handleFromSocialUrl(url: string): string {
  const parsed = safeUrl(url);
  if (!parsed) return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const parts = parsed.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || parsed.hostname.replace(/^www\./, '');
  return last.replace(/^@/, '');
}

export function configuredSocialSources(profiles: SocialProfiles | undefined): SocialSource[] {
  if (!profiles) return [];
  const out: SocialSource[] = [];
  const push = (platform: SocialPlatform, raw?: string) => {
    const url = (raw || '').trim();
    if (!url) return;
    out.push({ platform, url, handle: handleFromSocialUrl(url) });
  };
  push('instagram', profiles.instagram);
  push('youtube', profiles.youtube);
  push('facebook', profiles.facebook);
  push('tiktok', profiles.tiktok);
  return out;
}

export function toSocialFeedItem(video: SocialVideo): SocialFeedItem {
  const yt = video.platform === 'youtube' ? parseYoutubeVideoId(video.url) : parseYoutubeVideoId(video.url);
  const ig = parseInstagramShortcode(video.url);
  let embedUrl: string | null = null;
  let embedKind: SocialFeedItem['embedKind'] = null;
  if (yt) {
    embedUrl = youtubeEmbedUrl(yt);
    embedKind = 'youtube';
  } else if (ig) {
    const reel = /\/reel\//.test(video.url);
    embedUrl = instagramEmbedUrl(ig, reel ? 'reel' : 'p');
    embedKind = 'instagram';
  }
  const thumbnailUrl = video.thumbnailUrl
    || (yt ? youtubeThumbUrl(yt) : '');
  return {
    id: video.id,
    platform: video.platform,
    title: video.title,
    caption: video.title,
    url: video.url,
    thumbnailUrl,
    embedUrl,
    embedKind,
    dateAdded: video.dateAdded,
    likesCount: video.likesCount,
  };
}

/** The only social posts the website may show — owner-configured videos. */
export function resolveSocialFeed(data: Pick<SalonData, 'socialVideos'>): SocialFeedItem[] {
  return (data.socialVideos || []).map(toSocialFeedItem);
}

export function socialFeedIsEmpty(data: Pick<SalonData, 'socialVideos' | 'socialProfiles'>): boolean {
  return resolveSocialFeed(data).length === 0 && configuredSocialSources(data.socialProfiles).length === 0;
}
