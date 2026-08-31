/**
 * PHASE 15.2 — Platform URL auto-fetch (YouTube first, extensible).
 *
 * When the owner pastes a video URL, we:
 *   1. Detect the platform and extract the external video id (client-side).
 *   2. Ask the EXISTING Express server (`/api/video-metadata`) to resolve
 *      platform metadata (thumbnail, title, description, channel/source).
 *   3. Auto-fill the owner form so they do not re-type available fields.
 *
 * Security:
 *   - No API keys or service-role credentials in the browser.
 *   - Server uses public YouTube oEmbed + Open Graph (no YouTube Data API key).
 *   - Optional Authorization header is forwarded when a Supabase session exists
 *     (same pattern as the rest of the app); the endpoint does not require it
 *     because oEmbed is public and the onboarding wizard may run pre-login.
 *
 * Schema: maps onto existing `social_videos` concepts only —
 *   video_url, external_video_id, caption (title). Additive client fields
 *   (description, channelName) mirror what oEmbed returns; no new tables.
 *
 * Out of scope for 15.2: Shorts/long quotas, likes, weekly videos, admin,
 * dashboard, mock/fake metadata.
 */
import type { SocialVideo } from '../types';
import {
  parseInstagramShortcode,
  parseYoutubeVideoId,
  youtubeEmbedUrl,
  youtubeThumbUrl,
  type SocialPlatform,
} from './siteSocialFeed';
import { isSafeMediaUrl, safeMediaUrl } from './siteHero';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type VideoMetadataPlatform = SocialPlatform;

export interface VideoUrlParseResult {
  ok: true;
  platform: VideoMetadataPlatform;
  externalVideoId: string;
  /** Canonical watch URL derived from the id when possible. */
  canonicalUrl: string;
  originalUrl: string;
}

export interface VideoUrlParseError {
  ok: false;
  code:
    | 'empty'
    | 'invalid_url'
    | 'unsupported_platform'
    | 'invalid_youtube'
    | 'invalid_instagram'
    | 'not_a_video';
  message: string;
}

export type VideoUrlParseOutcome = VideoUrlParseResult | VideoUrlParseError;

/** Metadata the owner form can auto-fill. */
export interface VideoPlatformMetadata {
  platform: VideoMetadataPlatform;
  externalVideoId: string;
  /** Canonical storage URL retained for Phase 15.2–15.6 compatibility. */
  url: string;
  /** PHASE 15.7 exact URL supplied by the owner; never rewritten. */
  originalPlatformUrl: string;
  title: string;
  description: string;
  /** Channel / page / author name. */
  channelName: string;
  thumbnailUrl: string;
  embedUrl: string | null;
  /** How the metadata was obtained (for UI / tests). */
  source: 'oembed' | 'derived' | 'partial';
}

export interface VideoMetadataFetchSuccess {
  ok: true;
  metadata: VideoPlatformMetadata;
}

export interface VideoMetadataFetchFailure {
  ok: false;
  code:
    | 'empty'
    | 'invalid_url'
    | 'unsupported_platform'
    | 'invalid_youtube'
    | 'invalid_instagram'
    | 'not_a_video'
    | 'fetch_failed'
    | 'not_found'
    | 'rate_limited'
    | 'network';
  message: string;
}

export type VideoMetadataFetchResult = VideoMetadataFetchSuccess | VideoMetadataFetchFailure;

/* ------------------------------------------------------------------ */
/* Human-readable errors (EN)                                          */
/* ------------------------------------------------------------------ */

const ERROR_MESSAGES: Record<VideoUrlParseError['code'] | VideoMetadataFetchFailure['code'], string> = {
  empty: 'Paste a video URL to continue.',
  invalid_url: 'That does not look like a valid web link. Use a full https:// URL.',
  unsupported_platform:
    'This platform is not supported for auto-fetch yet. YouTube links work today — Instagram, Facebook and TikTok are coming next.',
  invalid_youtube:
    'That is not a valid YouTube video link. Paste a watch, youtu.be, Shorts or embed URL.',
  invalid_instagram: 'That Instagram link could not be recognised as a reel or post.',
  not_a_video: 'This link is a channel or profile, not a single video. Paste a video URL instead.',
  fetch_failed: 'Could not load video details right now. Check the link and try again.',
  not_found: 'No video was found at that URL. It may be private or deleted.',
  rate_limited: 'Too many lookups — wait a moment and try again.',
  network: 'Network error while fetching video details. Try again.',
};

export function videoMetadataErrorMessage(code: VideoMetadataFetchFailure['code']): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.fetch_failed;
}

/* ------------------------------------------------------------------ */
/* Platform detection & id extraction (extensible)                     */
/* ------------------------------------------------------------------ */

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./i, '').toLowerCase();
}

/** True when the host is a known YouTube property. */
export function isYoutubeHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  return (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com'
  );
}

/**
 * Detect which platform a URL belongs to. Returns null when the host is
 * unknown — callers surface `unsupported_platform`.
 */
export function detectVideoPlatform(url: string): VideoMetadataPlatform | null {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;
  const host = hostOf(parsed);
  if (isYoutubeHost(host)) return 'youtube';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('facebook.com') || host === 'fb.watch' || host === 'fb.com') return 'facebook';
  if (host.includes('tiktok.com')) return 'tiktok';
  return null;
}

/** Canonical YouTube watch URL for a validated 11-char id. */
export function youtubeCanonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Pure URL parse — no network. YouTube is fully supported; other known
 * platforms return a structured "unsupported for auto-fetch" error so the UI
 * can show a clear message (and later phases can flip them on).
 */
export function parseVideoUrl(raw: string): VideoUrlParseOutcome {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { ok: false, code: 'empty', message: videoMetadataErrorMessage('empty') };
  }

  // Allow protocol-relative and bare hosts by normalising to https.
  let candidate = trimmed;
  if (/^\/\//.test(candidate)) candidate = `https:${candidate}`;
  if (!/^https?:\/\//i.test(candidate) && /^[\w.-]+\.[a-z]{2,}/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  const parsed = safeParseUrl(candidate);
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, code: 'invalid_url', message: videoMetadataErrorMessage('invalid_url') };
  }

  const platform = detectVideoPlatform(candidate);
  if (!platform) {
    return {
      ok: false,
      code: 'unsupported_platform',
      message: videoMetadataErrorMessage('unsupported_platform'),
    };
  }

  if (platform === 'youtube') {
    const host = hostOf(parsed);
    const path = parsed.pathname || '';
    const id = parseYoutubeVideoId(candidate);
    if (!id) {
      // Distinguish channel / home pages from a bad video id.
      if (
        host === 'youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'youtu.be' ||
        host === 'music.youtube.com'
      ) {
        if (
          /\/(@|channel\/|c\/|user\/)/i.test(path) ||
          path === '/' ||
          path === '' ||
          path === '/feed' ||
          path === '/feed/'
        ) {
          return {
            ok: false,
            code: 'not_a_video',
            message: videoMetadataErrorMessage('not_a_video'),
          };
        }
      }
      return {
        ok: false,
        code: 'invalid_youtube',
        message: videoMetadataErrorMessage('invalid_youtube'),
      };
    }
    return {
      ok: true,
      platform: 'youtube',
      externalVideoId: id,
      canonicalUrl: youtubeCanonicalUrl(id),
      originalUrl: candidate,
    };
  }

  if (platform === 'instagram') {
    const code = parseInstagramShortcode(candidate);
    if (!code) {
      return {
        ok: false,
        code: 'unsupported_platform',
        message: videoMetadataErrorMessage('unsupported_platform'),
      };
    }
    // Instagram auto-fetch is not implemented in 15.2 — surface a clear message.
    return {
      ok: false,
      code: 'unsupported_platform',
      message: videoMetadataErrorMessage('unsupported_platform'),
    };
  }

  // facebook / tiktok — reserved for later phases.
  return {
    ok: false,
    code: 'unsupported_platform',
    message: videoMetadataErrorMessage('unsupported_platform'),
  };
}

/* ------------------------------------------------------------------ */
/* Derived (no-network) YouTube baseline                               */
/* ------------------------------------------------------------------ */

/**
 * Instant local baseline for a valid YouTube id — thumbnail from the public
 * img.youtube.com CDN, empty title/description until oEmbed returns. Used as
 * a progressive enhancement and as a fallback when the network call fails
 * after a successful parse.
 */
export function derivedYoutubeMetadata(
  videoId: string,
  originalUrl?: string,
): VideoPlatformMetadata {
  const thumb = youtubeThumbUrl(videoId);
  return {
    platform: 'youtube',
    externalVideoId: videoId,
    url: youtubeCanonicalUrl(videoId),
    originalPlatformUrl: originalUrl && /^https?:\/\//i.test(originalUrl)
      ? originalUrl.trim()
      : youtubeCanonicalUrl(videoId),
    title: '',
    description: '',
    channelName: '',
    thumbnailUrl: isSafeMediaUrl(thumb) ? thumb : '',
    embedUrl: youtubeEmbedUrl(videoId),
    source: 'derived',
  };
}

/* ------------------------------------------------------------------ */
/* Server fetch                                                        */
/* ------------------------------------------------------------------ */

async function authHeader(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Session lookup is best-effort; public oEmbed still works without it.
  }
  return {};
}

/**
 * Resolve platform metadata for a pasted URL.
 * 1. Client-side parse/validate (instant error for bad URLs).
 * 2. Server `/api/video-metadata` for oEmbed + OG (no keys in the browser).
 * 3. On network failure after a valid YouTube parse, return derived thumbnail
 *    so the owner can still save the link (title stays empty for manual fill).
 */
export async function fetchVideoMetadata(
  rawUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<VideoMetadataFetchResult> {
  const parsed = parseVideoUrl(rawUrl);
  if (parsed.ok === false) {
    return { ok: false, code: parsed.code, message: parsed.message };
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeader()),
    };
    const response = await fetch('/api/video-metadata', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: parsed.originalUrl }),
      signal: options.signal,
    });

    if (response.status === 429) {
      return { ok: false, code: 'rate_limited', message: videoMetadataErrorMessage('rate_limited') };
    }
    // Gracefully handle 401/403/404 from oEmbed — return derived thumbnail instead of UI error
    // This allows manual title entry and ensures thumbnail is set via VIDEO_ID
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      if (parsed.platform === 'youtube') {
        return {
          ok: true,
          metadata: derivedYoutubeMetadata(parsed.externalVideoId, parsed.originalUrl),
        };
      }
      return { ok: false, code: 'not_found', message: videoMetadataErrorMessage('not_found') };
    }
    if (response.status === 400) {
      let body: { code?: string; error?: string } = {};
      try {
        body = await response.json();
      } catch {
        /* ignore */
      }
      const code = (body.code as VideoMetadataFetchFailure['code']) || 'invalid_url';
      return {
        ok: false,
        code: ERROR_MESSAGES[code] ? code : 'invalid_url',
        message: body.error || videoMetadataErrorMessage(code),
      };
    }
    if (!response.ok) {
      // Valid YouTube id still gets a derived thumbnail so the form is usable.
      if (parsed.platform === 'youtube') {
        return {
          ok: true,
          metadata: derivedYoutubeMetadata(parsed.externalVideoId, parsed.originalUrl),
        };
      }
      return { ok: false, code: 'fetch_failed', message: videoMetadataErrorMessage('fetch_failed') };
    }

    const body = (await response.json()) as {
      platform?: string;
      externalVideoId?: string;
      url?: string;
      title?: string;
      description?: string;
      channelName?: string;
      thumbnailUrl?: string;
      embedUrl?: string | null;
      source?: string;
    };

    const thumbnailUrl = safeMediaUrl(body.thumbnailUrl) ||
      (parsed.platform === 'youtube' ? youtubeThumbUrl(parsed.externalVideoId) : '');

    const metadata: VideoPlatformMetadata = {
      platform: parsed.platform,
      externalVideoId: (body.externalVideoId || parsed.externalVideoId).trim(),
      url: (body.url || parsed.canonicalUrl).trim(),
      // External navigation always uses this untouched destination, never url.
      originalPlatformUrl: parsed.originalUrl.trim(),
      title: typeof body.title === 'string' ? body.title.trim() : '',
      description: typeof body.description === 'string' ? body.description.trim() : '',
      channelName: typeof body.channelName === 'string' ? body.channelName.trim() : '',
      thumbnailUrl: isSafeMediaUrl(thumbnailUrl) ? thumbnailUrl : '',
      embedUrl:
        typeof body.embedUrl === 'string' && body.embedUrl
          ? body.embedUrl
          : parsed.platform === 'youtube'
            ? youtubeEmbedUrl(parsed.externalVideoId)
            : null,
      source:
        body.source === 'oembed' || body.source === 'partial' || body.source === 'derived'
          ? body.source
          : 'oembed',
    };

    return { ok: true, metadata };
  } catch (err) {
    if (options.signal?.aborted) {
      return { ok: false, code: 'network', message: videoMetadataErrorMessage('network') };
    }
    // Network down but YouTube id is valid → derived thumbnail still helps.
    if (parsed.platform === 'youtube') {
      return {
        ok: true,
        metadata: derivedYoutubeMetadata(parsed.externalVideoId, parsed.originalUrl),
      };
    }
    return { ok: false, code: 'network', message: videoMetadataErrorMessage('network') };
  }
}

/* ------------------------------------------------------------------ */
/* Apply metadata → SocialVideo draft                                  */
/* ------------------------------------------------------------------ */

/**
 * Builds a partial SocialVideo from fetched metadata for form auto-fill.
 * Does not invent likes, dates, or mock content.
 */
export function socialVideoDraftFromMetadata(
  metadata: VideoPlatformMetadata,
  extras: { id?: string; themeId?: string | null; videoKind?: 'short' | 'long' | null } = {},
): Pick<
  SocialVideo,
  | 'id'
  | 'title'
  | 'platform'
  | 'url'
  | 'originalPlatformUrl'
  | 'thumbnailUrl'
  | 'externalVideoId'
  | 'description'
  | 'channelName'
  | 'themeId'
  | 'videoKind'
> {
  return {
    id: extras.id || `v-${metadata.platform}-${metadata.externalVideoId}`,
    title: metadata.title,
    platform: metadata.platform,
    url: metadata.url,
    originalPlatformUrl: metadata.originalPlatformUrl || metadata.url,
    thumbnailUrl: metadata.thumbnailUrl,
    externalVideoId: metadata.externalVideoId,
    description: metadata.description || undefined,
    channelName: metadata.channelName || undefined,
    themeId: extras.themeId ?? null,
    videoKind: extras.videoKind ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* PHASE 15.4 — field merge policy (no second fetch system)            */
/* ------------------------------------------------------------------ */

export type VideoMetadataField = 'title' | 'description' | 'channelName' | 'thumbnailUrl' | 'url';

export interface VideoMetadataMergeFlags {
  /** Owner typed into the title field after auto-fill. */
  titleManual?: boolean;
  /** Owner typed into the description field after auto-fill. */
  descriptionManual?: boolean;
  /** Owner typed into the channel field after auto-fill. */
  channelManual?: boolean;
  /** Owner picked a custom/stock thumbnail after auto-fill. */
  thumbnailManual?: boolean;
  /** Owner edited the URL after auto-fill (rare). */
  urlManual?: boolean;
}

export interface VideoMetadataFormState {
  title: string;
  description: string;
  channelName: string;
  thumbnailUrl: string;
  url: string;
  platform: VideoMetadataPlatform;
  externalVideoId: string | null;
}

/**
 * PHASE 15.4 — merge platform metadata into the owner form without
 * unnecessarily overwriting valid platform data or manual edits.
 *
 * Rules:
 *   - Never invent values (empty platform fields stay empty).
 *   - Manual fields are left untouched.
 *   - Empty form fields always accept platform values.
 *   - Non-empty form fields that still match the previous platform snapshot
 *     are refreshed when oEmbed returns a richer value (e.g. derived → oembed).
 *   - Non-empty form fields that differ from the previous snapshot are treated
 *     as owner-owned and kept.
 */
export function mergePlatformMetadataIntoForm(
  current: VideoMetadataFormState,
  incoming: VideoPlatformMetadata,
  flags: VideoMetadataMergeFlags = {},
  previous: Partial<VideoPlatformMetadata> | null = null,
): VideoMetadataFormState {
  const take = (
    field: VideoMetadataField,
    manual: boolean | undefined,
    formValue: string,
    platformValue: string,
    prevPlatformValue: string | undefined,
  ): string => {
    const next = (platformValue || '').trim();
    const cur = (formValue || '').trim();
    if (manual) return formValue;
    if (!cur) return next || formValue;
    if (!next) return formValue;
    // Still holding the previous auto-filled value → safe to refresh.
    if (prevPlatformValue !== undefined && cur === (prevPlatformValue || '').trim()) {
      return next;
    }
    // Form already has this exact platform value.
    if (cur === next) return formValue;
    // Divergent non-empty value without a manual flag → keep owner text.
    return formValue;
  };

  return {
    title: take('title', flags.titleManual, current.title, incoming.title, previous?.title),
    description: take(
      'description',
      flags.descriptionManual,
      current.description,
      incoming.description,
      previous?.description,
    ),
    channelName: take(
      'channelName',
      flags.channelManual,
      current.channelName,
      incoming.channelName,
      previous?.channelName,
    ),
    thumbnailUrl: take(
      'thumbnailUrl',
      flags.thumbnailManual,
      current.thumbnailUrl,
      incoming.thumbnailUrl,
      previous?.thumbnailUrl,
    ),
    url: take('url', flags.urlManual, current.url, incoming.url, previous?.url),
    platform: incoming.platform || current.platform,
    externalVideoId: incoming.externalVideoId || current.externalVideoId,
  };
}

/**
 * True when platform metadata is rich enough that the owner only needs to
 * paste the URL (title present). Derived-only snapshots (thumb only) still
 * need a manual title.
 */
export function platformMetadataIsComplete(metadata: VideoPlatformMetadata | null | undefined): boolean {
  if (!metadata) return false;
  return !!(metadata.title && metadata.title.trim() && metadata.url && metadata.url.trim());
}

/**
 * PHASE 15.4 — build the SocialVideo saved from a paste + metadata snapshot.
 * Binds salon theme + short/long kind. Never invents likes. Uses platform
 * metadata for empty fields; respects manual form values.
 */
export function socialVideoFromPasteAndMetadata(options: {
  metadata: VideoPlatformMetadata | null;
  form: {
    title: string;
    description: string;
    channelName: string;
    thumbnailUrl: string;
    url: string;
    platform: VideoMetadataPlatform;
    externalVideoId: string | null;
  };
  /** Kind detected from the ORIGINAL paste (shorts URL) before canonical rewrite. */
  videoKind: 'short' | 'long' | null;
  themeId?: string | null;
  id?: string;
}): SocialVideo {
  const { metadata, form, videoKind, themeId, id } = options;
  const title = (form.title || metadata?.title || '').trim();
  const description = (form.description || metadata?.description || '').trim();
  const channelName = (form.channelName || metadata?.channelName || '').trim();
  const thumbnailUrl = safeMediaUrl(form.thumbnailUrl)
    || safeMediaUrl(metadata?.thumbnailUrl)
    || '';
  const url = (form.url || metadata?.url || '').trim();
  const platform = form.platform || metadata?.platform || 'youtube';
  const externalVideoId =
    form.externalVideoId || metadata?.externalVideoId || null;

  // Keep the Phase 15.4 canonical storage shape while retaining the untouched
  // paste separately. Only originalPlatformUrl is ever used as a redirect.
  const originalPlatformUrl = (form.url || metadata?.originalPlatformUrl || url).trim();
  let finalUrl = url;
  if (videoKind === 'short' && externalVideoId && platform === 'youtube' && !/\/shorts\//i.test(finalUrl)) {
    finalUrl = `https://www.youtube.com/shorts/${externalVideoId}`;
  } else if (videoKind === 'long' && externalVideoId && platform === 'youtube') {
    if (!/watch\?v=/i.test(finalUrl) && !/\/shorts\//i.test(finalUrl)) finalUrl = youtubeCanonicalUrl(externalVideoId);
  }

  return {
    id: id || `v-${platform}-${externalVideoId || Date.now()}`,
    title,
    platform,
    url: finalUrl,
    originalPlatformUrl,
    thumbnailUrl,
    externalVideoId,
    description: description || undefined,
    channelName: channelName || undefined,
    themeId: themeId ?? null,
    videoKind: videoKind ?? null,
    dateAdded: 'Today',
  };
}

/** Human label when oEmbed only returned a derived thumbnail (no title yet). */
export function partialMetadataNotice(metadata: VideoPlatformMetadata | null | undefined): string | null {
  if (!metadata) return null;
  if (metadata.source === 'derived' || metadata.source === 'partial') {
    if (!metadata.title?.trim()) {
      return 'Thumbnail loaded. Title and channel were not available — add a title to save, or try again.';
    }
  }
  if (metadata.title?.trim() && !metadata.thumbnailUrl) {
    return 'Title loaded but the thumbnail was unavailable. A placeholder will be used until it loads.';
  }
  return null;
}

/** Debounce helper for paste/type auto-fetch (ms). */
export const VIDEO_METADATA_DEBOUNCE_MS = 450;
