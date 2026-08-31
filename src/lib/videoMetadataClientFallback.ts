/**
 * Browser-side oEmbed fallback for YouTube metadata.
 *
 * The primary pipeline is unchanged: `fetchVideoMetadata` always asks the
 * EXISTING Express endpoint (`/api/video-metadata`) first. But server-side
 * oEmbed can fail even for perfectly valid videos — datacenter IPs are often
 * blocked/rate-limited by YouTube, or the server has no outbound network.
 * In those cases the OWNER'S BROWSER usually can still reach public oEmbed,
 * so we retry from the client before degrading to a manual-title form:
 *
 *   1. YouTube's public oEmbed endpoint directly (succeeds when the response
 *      is CORS-readable in the current browser).
 *   2. noembed.com — a public, keyless, CORS-friendly oEmbed proxy.
 *
 * Security: no API keys, no service-role, no YouTube Data API. Only public
 * oEmbed fields (title, author_name, thumbnail_url) are read. Nothing is
 * invented — when neither source yields a usable title/channel, `null` is
 * returned and the caller keeps its derived (thumbnail-only) metadata.
 */

export interface BrowserOembedResult {
  title: string;
  channelName: string;
  thumbnailUrl: string;
}

const FALLBACK_TIMEOUT_MS = 5000;

interface OembedJson {
  title?: unknown;
  author_name?: unknown;
  thumbnail_url?: unknown;
  error?: unknown;
}

/** Fetch JSON with a hard timeout; never throws — returns null on any failure. */
async function tryJson(url: string, outerSignal?: AbortSignal): Promise<OembedJson | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      clearTimeout(timer);
      return null;
    }
    outerSignal.addEventListener('abort', onOuterAbort);
  }
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as OembedJson;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Try to resolve title/channel/thumbnail for a YouTube video id straight
 * from the browser. Returns null when nothing usable could be fetched.
 */
export async function fetchYoutubeOembedFromBrowser(
  videoId: string,
  options: { signal?: AbortSignal } = {},
): Promise<BrowserOembedResult | null> {
  const id = (videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const candidates = [
    // Direct public oEmbed (no key). May be blocked by CORS in some
    // browsers — that simply falls through to the proxy below.
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    // Public CORS-friendly oEmbed proxy (keyless).
    `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`,
  ];

  for (const candidate of candidates) {
    if (options.signal?.aborted) return null;
    const data = await tryJson(candidate, options.signal);
    if (!data || data.error) continue;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const channelName = typeof data.author_name === 'string' ? data.author_name.trim() : '';
    const thumbnailUrl =
      typeof data.thumbnail_url === 'string' && /^https?:\/\//i.test(data.thumbnail_url)
        ? data.thumbnail_url.trim()
        : '';
    // Only accept responses that actually help (a real title or channel);
    // empty payloads fall through so the caller keeps derived metadata.
    if (title || channelName) {
      return { title, channelName, thumbnailUrl };
    }
  }
  return null;
}
