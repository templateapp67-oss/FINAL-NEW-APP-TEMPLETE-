/**
 * Shared API routes for Express app.
 *
 * Used by:
 *   - server.ts  (local dev / standalone production server)
 *   - api/[...path].ts (Vercel serverless function)
 *
 * This module only registers API routes and middleware — it does NOT set up
 * static file serving, SPA fallback, or call app.listen(). Those concerns
 * belong to the respective entry points.
 */
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { setupPaymentRoutes } from './server/paymentRoutes';
import { registerBookingRoutes } from './server/bookingRoutes';
import { registerWebsiteBookingRoutes } from './server/websiteBookingRoutes';
import { setupPrivacyRoutes } from './server/privacyRoutes';
import { setupSeoRoutes } from './server/seoRoutes';
import { observabilityMiddleware } from './server/observability';
import { requireAuthenticatedUser, getSupabaseAdmin } from './server/supabaseAdmin';
import {
  isValidCustomDomain,
  isReservedHost,
  normalizeCustomDomain,
  validateCustomDomain,
} from './src/lib/customDomain';
import { probeCustomDomainDns } from './server/dnsVerification';
import { callNominatim } from './server/geocoding';

/* ------------------------------------------------------------------ *
 * Helper utilities (rate limiting, caching, delays)
 * ------------------------------------------------------------------ */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Video metadata helpers (YouTube oEmbed + Open Graph)
 * ------------------------------------------------------------------ */

const YT_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const VIDEO_META_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Degraded (empty-title) results expire fast so a later retry can succeed. */
const VIDEO_META_DEGRADED_TTL_MS = 60 * 1000; // 1 minute
const VIDEO_META_MIN_INTERVAL_MS = 350;
const videoMetaCache = new Map<string, { at: number; body: unknown }>();
let videoMetaLastAt = 0;
let videoMetaQueue: Promise<unknown> = Promise.resolve();

function videoMetaRateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = videoMetaQueue.then(async () => {
    const waitFor = videoMetaLastAt + VIDEO_META_MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await delay(waitFor);
    videoMetaLastAt = Date.now();
    return task();
  });
  videoMetaQueue = run.then(() => undefined, () => undefined);
  return run;
}

function parseYoutubeIdServer(raw: string): string | null {
  let value = (raw || '').trim();
  if (!value) return null;
  if (/^\/\//.test(value)) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value) && /^[\w.-]+\.[a-z]{2,}/i.test(value)) {
    value = `https://${value}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return null;
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  // Handle youtu.be short links (with or without www)
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return YT_VIDEO_ID_RE.test(id) ? id : null;
  }
  // Handle all YouTube domains including nocookie and standard
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'www.youtube-nocookie.com'
  ) {
    const v = parsed.searchParams.get('v') || '';
    if (YT_VIDEO_ID_RE.test(v)) return v;
    // Handle /shorts/, /embed/, /live/, /v/ formats cleanly
    const match = parsed.pathname.match(/\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (match && YT_VIDEO_ID_RE.test(match[1])) return match[1];
    // Fallback: check pathname segments for 11-char ID (handles extra params)
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      if (YT_VIDEO_ID_RE.test(seg)) return seg;
    }
  }
  return null;
}

function detectPlatformServer(raw: string): 'youtube' | 'instagram' | 'facebook' | 'tiktok' | null {
  let value = (raw || '').trim();
  if (/^\/\//.test(value)) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value) && /^[\w.-]+\.[a-z]{2,}/i.test(value)) {
    value = `https://${value}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com'
  ) {
    return 'youtube';
  }
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('facebook.com') || host === 'fb.watch' || host === 'fb.com') return 'facebook';
  if (host.includes('tiktok.com')) return 'tiktok';
  return null;
}

function extractMetaContent(html: string, property: string): string {
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    'i',
  );
  const m = html.match(re1) || html.match(re2);
  if (!m) return '';
  return m[1]
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function fetchYoutubeOembed(videoId: string): Promise<{
  title: string;
  channelName: string;
  thumbnailUrl: string;
  html: string;
} | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl =
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  try {
    const response = await fetch(oembedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NexoraSalonWebsiteBuilder/1.0 (+https://nexorabeauty.com)',
      },
    });
    // Gracefully handle 401/403/404 — return null so caller can fallback to thumbnail
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      // For other errors (500, 429, etc), also return null to allow graceful degradation
      // instead of throwing UI error
      console.warn(`YouTube oEmbed non-ok ${response.status} for ${videoId}, falling back to thumbnail`);
      return null;
    }
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      html?: string;
    };
    return {
      title: typeof data.title === 'string' ? data.title.trim() : '',
      channelName: typeof data.author_name === 'string' ? data.author_name.trim() : '',
      thumbnailUrl:
        typeof data.thumbnail_url === 'string' && /^https?:\/\//i.test(data.thumbnail_url)
          ? data.thumbnail_url.trim()
          : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      html: typeof data.html === 'string' ? data.html : '',
    };
  } catch (err) {
    console.warn(`YouTube oEmbed fetch exception for ${videoId}:`, err);
    return null;
  }
}

/**
 * Keyless fallback when direct YouTube oEmbed fails server-side (datacenter
 * IPs are frequently 403'd / rate-limited by YouTube). noembed.com is a
 * public oEmbed proxy — same public fields (title, author_name,
 * thumbnail_url), no API key, no YouTube Data API.
 */
async function fetchYoutubeOembedViaProxy(videoId: string): Promise<{
  title: string;
  channelName: string;
  thumbnailUrl: string;
  html: string;
} | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const proxyUrl = `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`;
  try {
    const response = await fetch(proxyUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NexoraSalonWebsiteBuilder/1.0 (+https://nexorabeauty.com)',
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      html?: string;
      error?: string;
    };
    if (data.error) return null;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const channelName = typeof data.author_name === 'string' ? data.author_name.trim() : '';
    if (!title && !channelName) return null;
    return {
      title,
      channelName,
      thumbnailUrl:
        typeof data.thumbnail_url === 'string' && /^https?:\/\//i.test(data.thumbnail_url)
          ? data.thumbnail_url.trim()
          : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      html: typeof data.html === 'string' ? data.html : '',
    };
  } catch (err) {
    console.warn(`noembed oEmbed proxy exception for ${videoId}:`, err);
    return null;
  }
}

async function fetchYoutubeDescription(videoId: string): Promise<string> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(watchUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'NexoraSalonWebsiteBuilder/1.0 (+https://nexorabeauty.com)',
      },
      redirect: 'follow',
    });
    if (!response.ok) return '';
    const html = await response.text();
    const slice = html.slice(0, 200_000);
    return (
      extractMetaContent(slice, 'og:description') ||
      extractMetaContent(slice, 'description') ||
      ''
    );
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ *
 * setupApiRoutes — Register all API routes on an Express app
 * ------------------------------------------------------------------ */

export function setupApiRoutes(app: express.Express): void {
  // M63 (infra): request correlation id, structured tenant-safe request logs
  // and baseline security headers run before everything else.
  for (const middleware of observabilityMiddleware()) {
    app.use(middleware);
  }

  /**
   * Routes whose JSON bodies may legitimately be large. Today that is only the
   * owner website-draft save: its `config` payload embeds Base64 image
   * fallbacks when Supabase Storage is unreachable (Step 5 Photo Gallery).
   */
  const LARGE_JSON_BODY_PATHS = new Set(['/api/owner/save-website-draft']);
  const LARGE_JSON_BODY_LIMIT = '10mb';

  // Same-origin by default, plus an explicit deployment allowlist. Never send
  // wildcard origin together with credentialed CORS. Registered BEFORE body
  // parsing so even a parser rejection (e.g. 413 payload-too-large) carries
  // the CORS headers a cross-origin caller needs to read the error.
  const configuredOrigins = new Set(
    (process.env.ALLOWED_API_ORIGINS || process.env.APP_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.header('origin');
    let allowed = !origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        allowed = parsed.host === req.header('host') || configuredOrigins.has(parsed.origin);
      } catch {
        allowed = false;
      }
    }
    if (origin && allowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Razorpay-Signature, X-Razorpay-Event-Id',
    );
    if (req.method === 'OPTIONS') {
      return allowed
        ? res.sendStatus(204)
        : res.status(403).json({ error: 'Origin is not allowed.' });
    }
    next();
  });

  // Preserve exact request bytes for provider webhook HMAC verification before
  // parsing JSON. All other routes continue to receive the parsed body.
  //
  // BODY-SIZE BUDGETS — two tiers on purpose:
  //   * Default routes stay on a tight 256kb budget (webhooks, bookings,
  //     geocoding — none of them legitimately carry big bodies).
  //   * The owner draft save carries the FULL website config JSON. When
  //     Supabase Storage is unreachable, Step 5 (Photo Gallery) keeps each
  //     photo in the draft as a Base64 data URL (≤ ~1 MB apiece after
  //     downscaling), so a real gallery draft can easily exceed 256kb. That
  //     used to make express reject the fallback save with an HTML 413 the
  //     client could not interpret — surfacing in the builder as the generic
  //     "Save failed — check connection". A 5 MB image is ~6.8 MB once
  //     Base64-encoded, so the draft route gets a 10 MB budget.
  //     (Note: some serverless platforms, e.g. Vercel, cap request bodies at
  //     ~4.5 MB before Express ever runs — the client still receives a 413
  //     and now shows a descriptive message for it.)
  const preserveRawBody = (req: express.Request, _res: express.Response, buffer: Buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  };
  const standardJsonParser = express.json({ limit: '256kb', verify: preserveRawBody });
  const largeDraftJsonParser = express.json({ limit: LARGE_JSON_BODY_LIMIT, verify: preserveRawBody });
  app.use((req, res, next) => {
    const parser = LARGE_JSON_BODY_PATHS.has(req.path) ? largeDraftJsonParser : standardJsonParser;
    parser(req, res, next);
  });

  // Translate body-parser failures into actionable JSON. Without this, an
  // oversized or malformed body produced Express's default HTML error page,
  // which the client-side fetch fallback could not diagnose.
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const parseError = err as { type?: string; status?: number; message?: string } | null;
    if (!parseError) return next();
    if (parseError.type === 'entity.too.large' || parseError.status === 413) {
      const limit = LARGE_JSON_BODY_PATHS.has(req.path) ? LARGE_JSON_BODY_LIMIT : '256kb';
      return res.status(413).json({
        error:
          `This save is too large to send (the server accepts up to ${limit} for this request). ` +
          'This usually means gallery photos were stored inside the draft as offline copies. ' +
          'Reconnect so images upload to your media library, or remove some gallery photos, then try again.',
        code: 'payload-too-large',
        limit,
      });
    }
    if (parseError.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.', code: 'invalid-json' });
    }
    return next(err);
  });

  registerBookingRoutes(app);
  setupPaymentRoutes(app);
  registerWebsiteBookingRoutes(app);
  setupPrivacyRoutes(app);
  setupSeoRoutes(app);

  // Paid AI calls are owner tools. When a paid key is configured, require a
  // real Supabase session and enforce a small per-user in-memory burst limit.
  const aiUsage = new Map<string, number[]>();
  const requireAiAccess: express.RequestHandler = async (req, res, next) => {
    if (!process.env.GEMINI_API_KEY) return next();
    try {
      const user = await requireAuthenticatedUser(req);
      const now = Date.now();
      const recent = (aiUsage.get(user.id) || []).filter((at) => now - at < 60_000);
      if (recent.length >= 10) {
        return res.status(429).json({ error: 'AI request limit reached. Please wait a minute and try again.' });
      }
      recent.push(now);
      aiUsage.set(user.id, recent);
      return next();
    } catch {
      return res.status(401).json({ error: 'Please log in to use AI writing tools.' });
    }
  };

  // ------------------------------------------------------------------ *
  // Published-link slug resolution (server half of the dynamic salon URL)
  // ------------------------------------------------------------------ *

  /** Slugs owned by platform routes — never usable as a business address. */
  const RESERVED_SLUGS = new Set([
    'dashboard', 'builder', 'nearby', 'auth', 'login', 'signup', 'register',
    'reset-password', 'api', 'admin', 'www', 'app', 'static', 'assets',
  ]);

  /**
   * Mirrors `private.normalize_website_slug` / `private.nexora_business_slug`:
   * lowercase, strip accents, collapse every run of non-alphanumeric
   * characters into one hyphen, clamp to 50 chars.
   */
  function normalizeSlug(value: string): string {
    return (value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/g, '');
  }

  function isValidSlug(value: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length >= 3 && value.length <= 60;
  }

  function draftSlugFromName(name: string): string {
    let slug = normalizeSlug(name);
    if (!slug) slug = 'salon';
    if (slug.length < 3) slug = `${slug}-salon`.slice(0, 50).replace(/-+$/g, '');
    if (RESERVED_SLUGS.has(slug)) slug = `${slug}-salon`.slice(0, 50).replace(/-+$/g, '');
    return slug;
  }

  /**
   * The address a salon advertises after a draft save:
   *   - PUBLISHED  → the allocated slug is permanent (shared links survive a
   *                  business rename), so it is returned unchanged.
   *   - UNPUBLISHED → derived from the business name so the placeholder
   *                   `my-salon-3` allocated at provisioning is replaced by
   *                   `arts-by-uma` as soon as the real name is entered.
   * The database unique index stays the collision authority: a rejected slug
   * simply keeps the previously allocated one.
   */
  function resolveDraftSlug(input: {
    requestedSlug: string;
    salonName: string;
    existingSlug: string;
    isPublished: boolean;
    fallback: string;
  }): string {
    if (input.isPublished && isValidSlug(input.existingSlug)) return input.existingSlug;
    const fromName = draftSlugFromName(input.salonName);
    if (isValidSlug(fromName) && !RESERVED_SLUGS.has(fromName)) return fromName;
    if (isValidSlug(input.requestedSlug) && !RESERVED_SLUGS.has(input.requestedSlug)) return input.requestedSlug;
    if (isValidSlug(input.existingSlug)) return input.existingSlug;
    return input.fallback;
  }

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', screens: 25, timestamp: new Date().toISOString() });
  });

  // Forward geocoding: address -> coordinates
  app.get('/api/geocode/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 3) {
      return res.status(400).json({ error: 'A longer address is required.' });
    }
    try {
      const data = await callNominatim(
        `/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`,
      );
      res.json(data);
    } catch (error) {
      console.error('Nominatim search failed:', error);
      res.status(502).json({ error: 'Could not look up that address right now.' });
    }
  });

  // Reverse geocoding: coordinates -> address
  app.get('/api/geocode/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const validLon = Number.isFinite(lon) && lon >= -180 && lon <= 180;
    if (!validLat || !validLon) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }
    try {
      const data = await callNominatim(
        `/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`,
      );
      res.json(data);
    } catch (error) {
      console.error('Nominatim reverse failed:', error);
      res.status(502).json({ error: 'Could not look up that pin right now.' });
    }
  });

  // Video metadata endpoint
  app.post('/api/video-metadata', async (req, res) => {
    try {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl) {
        return res.status(400).json({
          code: 'empty',
          error: 'Paste a video URL to continue.',
        });
      }

      const platform = detectPlatformServer(rawUrl);
      if (!platform) {
        return res.status(400).json({
          code: 'unsupported_platform',
          error:
            'This platform is not supported for auto-fetch yet. YouTube links work today.',
        });
      }

      if (platform !== 'youtube') {
        return res.status(400).json({
          code: 'unsupported_platform',
          error:
            'This platform is not supported for auto-fetch yet. YouTube links work today — Instagram, Facebook and TikTok are coming next.',
        });
      }

      const videoId = parseYoutubeIdServer(rawUrl);
      if (!videoId) {
        let hostPath = '';
        try {
          const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
          hostPath = `${u.hostname}${u.pathname}`;
        } catch {
          /* ignore */
        }
        if (/youtube\.com\/(@|channel\/|c\/|user\/)|youtube\.com\/?$/i.test(hostPath)) {
          return res.status(400).json({
            code: 'not_a_video',
            error: 'This link is a channel or profile, not a single video. Paste a video URL instead.',
          });
        }
        return res.status(400).json({
          code: 'invalid_youtube',
          error:
            'That is not a valid YouTube video link. Paste a watch, youtu.be, Shorts or embed URL.',
        });
      }

      const cacheKey = `yt:${videoId}`;
      const cached = videoMetaCache.get(cacheKey);
      if (cached) {
        const cachedBody = cached.body as { source?: string; title?: string } | undefined;
        const isDegraded = !cachedBody?.title || cachedBody?.source === 'derived';
        const ttl = isDegraded ? VIDEO_META_DEGRADED_TTL_MS : VIDEO_META_CACHE_TTL_MS;
        if (Date.now() - cached.at < ttl) {
          return res.json(cached.body);
        }
      }

      try {
        const oembed =
          (await videoMetaRateLimited(() => fetchYoutubeOembed(videoId))) ||
          // Direct oEmbed failed (403/429/network) — try the keyless public
          // proxy before degrading to a thumbnail-only response.
          (await videoMetaRateLimited(() => fetchYoutubeOembedViaProxy(videoId)));

        // Graceful fallback: if oEmbed fails (401/403/404 or any error returns null),
        // still return thumbnail based on VIDEO_ID so UI can show preview and allow manual title
        if (!oembed) {
          const degradedFallback = {
            platform: 'youtube' as const,
            externalVideoId: videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: '',
            description: '',
            channelName: '',
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            embedUrl: `https://www.youtube.com/embed/${videoId}`,
            source: 'derived' as const,
          };
          // Cache the degraded result briefly to avoid repeated oEmbed calls
          videoMetaCache.set(cacheKey, { at: Date.now(), body: degradedFallback });
          return res.json(degradedFallback);
        }

        const description = await fetchYoutubeDescription(videoId);
        const body = {
          platform: 'youtube' as const,
          externalVideoId: videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: oembed.title,
          description,
          channelName: oembed.channelName,
          thumbnailUrl:
            oembed.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          source: oembed.title || oembed.channelName ? 'oembed' : 'partial',
        };

        videoMetaCache.set(cacheKey, { at: Date.now(), body });
        return res.json(body);
      } catch (err: any) {
        console.error('YouTube metadata fetch failed:', err?.message || err);
        const degraded = {
          platform: 'youtube' as const,
          externalVideoId: videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: '',
          description: '',
          channelName: '',
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          source: 'derived' as const,
        };
        return res.json(degraded);
      }
    } catch (error: any) {
      console.error('Error in video-metadata route:', error);
      res.status(500).json({
        code: 'fetch_failed',
        error: 'Could not load video details right now. Check the link and try again.',
      });
    }
  });

  // Generate team member bio using Gemini API with offline fallback
  app.post('/api/generate-bio', requireAiAccess, async (req, res) => {
    try {
      const { name, role, specialties, salonName } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      let bio = '';
      const apiKey = process.env.GEMINI_API_KEY;

      if (apiKey) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const prompt = `Write a compelling, professional, and warm 2-3 sentence biography for a salon professional.
Name: ${name}
Role: ${role || 'Beauty Specialist'}
Specialties: ${Array.isArray(specialties) ? specialties.join(', ') : specialties || 'Hair styling & care'}
Salon Name: ${salonName || 'our salon'}

Focus on their passion for craftsmanship, dedication to client satisfaction, and expertise. Do not include surrounding quotation marks or conversational meta-text. Keep it under 60 words.`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
          });

          bio = response.text?.trim() || '';
        } catch (error: any) {
          console.warn('Gemini API call encountered quota or rate limit error, using intelligent fallback bio:', error?.message);
        }
      } else {
        console.log('GEMINI_API_KEY not configured, using offline fallback bio generator');
      }

      if (!bio) {
        const specText = Array.isArray(specialties) && specialties.length > 0 ? ` specializing in ${specialties.join(', ')}` : '';
        bio = `${name} is a talented ${role || 'stylist'}${specText} at ${salonName || 'our salon'}, dedicated to delivering exceptional craftsmanship and personalized client care.`;
      }

      res.json({ bio });
    } catch (error: any) {
      console.error('Error in generate-bio route:', error);
      const specText = req.body?.specialties?.length ? ` specializing in ${req.body.specialties.join(', ')}` : '';
      const fallbackBio = `${req.body?.name || 'Professional'} is a valued member of ${req.body?.salonName || 'our salon'}${specText}, bringing passion and expertise to every client.`;
      res.json({ bio: fallbackBio });
    }
  });

  // Rewrite and improve salon copy using Gemini API with custom settings and offline fallback
  app.post('/api/improve-text', requireAiAccess, async (req, res) => {
    try {
      const { text, field, tone, keywords, instructions } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required to perform rewrite' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      let rewritten = '';

      if (apiKey) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          let contextPrompt = '';
          if (field === 'heroHeadline') {
            contextPrompt = 'Create an attention-grabbing, welcoming, elegant hero headline for a beauty salon. Keep it under 10 words.';
          } else if (field === 'tagline') {
            contextPrompt = 'Create a highly professional, catchy salon tagline or subtitle under 8 words.';
          } else if (field === 'about') {
            contextPrompt = 'Create an engaging "About Us" statement for the salon describing luxury, hospitality, and custom styling. Under 55 words.';
          } else if (field === 'ownerIntro') {
            contextPrompt = 'Create an elegant introduction for the master stylist or salon founder under 45 words.';
          } else if (field === 'bookingCTA') {
            contextPrompt = 'Create a compelling booking call-to-action phrase under 12 words.';
          } else {
            contextPrompt = 'Rewrite this text to be professional, welcoming, and high-end. Keep it under 20 words.';
          }

          const systemInstructions = `You are a luxury copywriter for elite hair salons, spas, and wellness centers.
Rewrite the following text based on this context: "${contextPrompt}".
${tone ? `Apply a "${tone}" tone of voice.` : ''}
${keywords ? `Weave in these keywords naturally if possible: "${keywords}".` : ''}
${instructions ? `Follow these custom instructions: "${instructions}".` : ''}

Original text: "${text}"

Do not include conversational filler, meta-comments, introductory greetings, or surrounding quotes. Return ONLY the rewritten text.`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: systemInstructions,
          });

          rewritten = response.text?.trim() || '';
        } catch (apiErr: any) {
          console.warn('Gemini API failed in improve-text, applying rule-based transformation:', apiErr.message);
        }
      } else {
        console.log('GEMINI_API_KEY not configured, using offline fallback text improver');
      }

      // High quality offline fallback rewriting engine
      if (!rewritten) {
        let suffix = '';
        if (tone === 'luxurious') {
          suffix = ' with absolute luxury, customized treatments, and bespoke artistry.';
        } else if (tone === 'modern') {
          suffix = ' featuring state-of-the-art styling, trendsetting aesthetics, and vibrant energy.';
        } else if (tone === 'warm') {
          suffix = ' where customized hospitality meets incredible talent and warm smiles.';
        } else if (tone === 'minimalist') {
          suffix = ' focusing on organic simplicity, clean styling, and natural, authentic beauty.';
        } else {
          suffix = ' designed to make you look and feel your absolute best.';
        }

        if (keywords) {
          suffix += ` Crafted using premium ${keywords}.`;
        }

        if (instructions && instructions.toLowerCase().includes('spanish')) {
          rewritten = `¡Bienvenido! Descubra lo mejor en estilo y cuidado premium para el cabello.`;
        } else if (field === 'heroHeadline') {
          rewritten = text.length < 15 ? `${text} — Premium Salon Styling` : text;
        } else {
          const cleanText = text.replace(/[.!?]+$/, '');
          rewritten = `${cleanText}${suffix}`;
        }
      }

      res.json({ rewritten });
    } catch (error: any) {
      console.error('Error in improve-text route:', error);
      res.json({ rewritten: req.body?.text || 'Premium beauty services.' });
    }
  });

  // Owner website draft persistence fallback
  //
  // Also the server-side half of the dynamic published link: an UNPUBLISHED
  // salon re-derives its slug from the business name on every draft save, so
  // the placeholder address allocated at provisioning (`my-salon-3`) becomes
  // the real one (`arts-by-uma`) as soon as the owner types the salon name.
  // A published address is permanently allocated and never rewritten.
  app.post('/api/owner/save-website-draft', async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const salonId = (req.body?.salonId || '').trim();
      const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
      const templateKey = (req.body?.templateKey || 'hair').trim();
      const requestedSlug = (req.body?.slug || '').trim().toLowerCase();
      const salonName = typeof req.body?.salonName === 'string' ? req.body.salonName : '';

      if (!salonId) {
        return res.status(400).json({ error: 'Missing salonId' });
      }

      const admin = getSupabaseAdmin();

      // Verify user has ownership of this salon
      const { data: salon } = await admin
        .from('salons')
        .select('id, organization_id, slug')
        .eq('id', salonId)
        .maybeSingle();

      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const { data: isMember } = await admin
        .from('organization_members')
        .select('role')
        .eq('organization_id', salon.organization_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isMember) {
        return res.status(403).json({ error: 'Not authorized for this salon' });
      }

      const { data: existingSite } = await admin
        .from('salon_public_websites')
        .select('slug, is_published, published_at')
        .eq('salon_id', salonId)
        .maybeSingle();

      const isPublished = existingSite?.is_published === true;
      const finalSlug = resolveDraftSlug({
        requestedSlug,
        salonName,
        existingSlug: existingSite?.slug || salon.slug || '',
        isPublished,
        fallback: `salon-${salonId.slice(0, 8)}`,
      });

      // Upsert website draft
      const { data: website, error: upsertErr } = await admin
        .from('salon_public_websites')
        .upsert({
          salon_id: salonId,
          slug: finalSlug,
          template_key: templateKey,
          config,
          is_published: isPublished,
        } as any, { onConflict: 'salon_id' })
        .select('slug, is_published')
        .maybeSingle();

      // Keep the canonical salon row on the same address so public routing and
      // the owner workspace agree on one slug.
      if (finalSlug && finalSlug !== (salon.slug || '')) {
        await admin.from('salons').update({ slug: finalSlug } as any).eq('id', salonId);
      }

      if (upsertErr) {
        // If upsert fails, try update (config only — never overwrite a slug we
        // could not verify as free).
        const { data: updated } = await admin
          .from('salon_public_websites')
          .update({ config } as any)
          .eq('salon_id', salonId)
          .select('slug, is_published')
          .maybeSingle();

        return res.json({
          salonId,
          slug: updated?.slug || existingSite?.slug || finalSlug,
          isPublished: updated?.is_published === true,
        });
      }

      res.json({
        salonId,
        slug: website?.slug || finalSlug,
        isPublished: website?.is_published === true,
      });
    } catch (err: any) {
      console.error('Error in /api/owner/save-website-draft:', err);
      res.status(500).json({ error: err.message || 'Draft save failed' });
    }
  });

  // ==========================================================================
  // CUSTOM DOMAIN (CNAME) ROUTING — see supabase migration M69.
  //
  // Two endpoints, deliberately split by trust level:
  //   * /api/owner/custom-domain       — authenticated owner writes (RPC-scoped)
  //   * /api/public/resolve-domain     — anonymous read used by the edge/router
  //
  // Verification is performed here, on the server, with Node's DNS resolver:
  // PostgreSQL cannot do DNS lookups, and a browser must never be able to mark
  // its own domain verified. Only after the probe passes does the server call
  // `mark_custom_domain_status` with the service-role key.
  // ==========================================================================

  /**
   * GET /api/public/resolve-domain?host=www.artsbyuma.com
   * Anonymous, read-only host -> published-site resolution.
   *
   * Returns `{ slug, templateKey }` on a verified+published match, or
   * `{ slug: null }` otherwise. Never leaks why resolution failed.
   */
  app.get('/api/public/resolve-domain', async (req, res) => {
    try {
      const rawHost = typeof req.query?.host === 'string' ? req.query.host : '';
      const host = normalizeCustomDomain(rawHost);

      if (!host || !isValidCustomDomain(host) || isReservedHost(host)) {
        return res.json({ slug: null, templateKey: null, reason: 'invalid-host' });
      }

      const admin = getSupabaseAdmin();
      const { data, error } = await admin.rpc('resolve_public_salon_by_domain', {
        p_host: host,
      });

      if (error) {
        console.error('resolve_public_salon_by_domain failed:', error.message);
        return res.json({ slug: null, templateKey: null, reason: 'lookup-failed' });
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.slug) {
        return res.json({ slug: null, templateKey: null, reason: 'not-verified' });
      }

      res.json({
        slug: row.slug,
        templateKey: row.template_key ?? null,
        customDomain: row.custom_domain ?? host,
        salonId: row.salon_id ?? null,
      });
    } catch (err: any) {
      console.error('Error in GET /api/public/resolve-domain:', err);
      res.status(500).json({ slug: null, templateKey: null, error: 'Domain resolution failed' });
    }
  });

  /** Ownership guard shared by the owner custom-domain endpoints. */
  async function authorizeOwnerSalon(userId: string, salonId: string) {
    const admin = getSupabaseAdmin();
    const { data: salon } = await admin
      .from('salons')
      .select('id, organization_id')
      .eq('id', salonId)
      .maybeSingle();

    if (!salon) return { ok: false as const, status: 404, error: 'Salon not found' };

    const { data: member } = await admin
      .from('organization_members')
      .select('role')
      .eq('organization_id', salon.organization_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) return { ok: false as const, status: 403, error: 'Not authorized for this salon' };
    return { ok: true as const, salonId };
  }

  /**
   * POST /api/owner/custom-domain
   * Body: { salonId, domain } — `domain: '' | null` clears the mapping.
   *
   * Always routes through the owner-scoped `set_owner_custom_domain` /
   * `clear_owner_custom_domain` RPCs, so an owner can only ever touch a salon
   * they actually own. Setting or changing a domain resets it to 'pending'.
   */
  app.post('/api/owner/custom-domain', async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const salonId = (req.body?.salonId || '').trim();
      const rawDomain = req.body?.domain;

      if (!salonId) {
        return res.status(400).json({ error: 'Missing salonId' });
      }

      const auth = await authorizeOwnerSalon(user.id, salonId);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
      }

      // Empty / null clears the mapping.
      const normalized = normalizeCustomDomain(rawDomain);
      const admin = getSupabaseAdmin();

      if (!normalized) {
        const { data, error } = await admin.rpc('clear_owner_custom_domain', {
          p_salon_id: salonId,
        });
        if (error) {
          return res.status(400).json({ error: error.message || 'Could not remove the domain' });
        }
        const row = Array.isArray(data) ? data[0] : data;
        return res.json({
          salonId,
          domain: null,
          status: row?.custom_domain_status || 'not_configured',
        });
      }

      // Presentation-only pre-check so the owner gets a friendly message; the
      // RPC re-validates and the unique index remains the final invariant.
      const problems = validateCustomDomain(normalized);
      if (problems.length > 0) {
        return res.status(400).json({ error: problems[0].message });
      }

      const { data, error } = await admin.rpc('set_owner_custom_domain', {
        p_domain: normalized,
        p_salon_id: salonId,
      });

      if (error) {
        // Surface the RPC's own, already user-safe message.
        return res.status(400).json({ error: error.message || 'Could not save that domain' });
      }

      const row = Array.isArray(data) ? data[0] : data;
      res.json({
        salonId,
        domain: row?.custom_domain ?? normalized,
        status: row?.custom_domain_status || 'pending',
      });
    } catch (err: any) {
      console.error('Error in POST /api/owner/custom-domain:', err);
      res.status(500).json({ error: err.message || 'Could not save that domain' });
    }
  });

  /**
   * POST /api/owner/custom-domain/verify
   * Body: { salonId }
   *
   * Probes DNS from the server and flips the status via the service-role-only
   * `mark_custom_domain_status` RPC. A tenant must prove control of the host
   * with either:
   *   - a CNAME/A record pointing at the platform base host, or
   *   - a TXT record `nexora-verify=<salonId>`.
   */
  app.post('/api/owner/custom-domain/verify', async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const salonId = (req.body?.salonId || '').trim();

      if (!salonId) {
        return res.status(400).json({ error: 'Missing salonId' });
      }

      const auth = await authorizeOwnerSalon(user.id, salonId);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const admin = getSupabaseAdmin();
      const { data: site, error: readErr } = await admin
        .from('salon_public_websites')
        .select('custom_domain, custom_domain_status')
        .eq('salon_id', salonId)
        .maybeSingle();

      if (readErr) {
        return res.status(500).json({ error: 'Could not read your website settings' });
      }

      const domain = normalizeCustomDomain(site?.custom_domain);
      if (!domain) {
        return res.status(400).json({ error: 'No custom domain is configured yet' });
      }

      const probe = await probeCustomDomainDns(domain, salonId);

      const { data, error } = await admin.rpc('mark_custom_domain_status', {
        p_salon_id: salonId,
        p_status: probe.verified ? 'verified' : 'failed',
      });

      if (error) {
        return res.status(500).json({ error: 'Could not update the domain status' });
      }

      const row = Array.isArray(data) ? data[0] : data;
      res.json({
        salonId,
        domain,
        status: row?.custom_domain_status || (probe.verified ? 'verified' : 'failed'),
        detail: probe.detail,
      });
    } catch (err: any) {
      console.error('Error in POST /api/owner/custom-domain/verify:', err);
      res.status(500).json({ error: err.message || 'Domain verification failed' });
    }
  });

  // Owner visual config persistence fallback
  app.post('/api/owner/save-website-visual-config', async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const salonId = (req.body?.salonId || '').trim();
      const visualConfig = req.body?.visualConfig && typeof req.body.visualConfig === 'object' ? req.body.visualConfig : {};

      if (!salonId) {
        return res.status(400).json({ error: 'Missing salonId' });
      }

      const admin = getSupabaseAdmin();

      // Verify user has ownership of this salon
      const { data: salon } = await admin
        .from('salons')
        .select('id, organization_id')
        .eq('id', salonId)
        .maybeSingle();

      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const { data: isMember } = await admin
        .from('organization_members')
        .select('role')
        .eq('organization_id', salon.organization_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isMember) {
        return res.status(403).json({ error: 'Not authorized for this salon' });
      }

      // Load existing config to merge
      const { data: existing } = await admin
        .from('salon_public_websites')
        .select('config')
        .eq('salon_id', salonId)
        .maybeSingle();

      const existingConfig = existing?.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
        ? (existing.config as Record<string, unknown>)
        : {};

      const mergedConfig = { ...existingConfig, ...visualConfig };

      await admin
        .from('salon_public_websites')
        .update({ config: mergedConfig } as any)
        .eq('salon_id', salonId);

      res.json({ status: 'ok', salonId });
    } catch (err: any) {
      console.error('Error in /api/owner/save-website-visual-config:', err);
      res.status(500).json({ error: err.message || 'Visual config save failed' });
    }
  });

  // API 404 fallback — unknown /api/* paths return JSON, never the SPA shell
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}
