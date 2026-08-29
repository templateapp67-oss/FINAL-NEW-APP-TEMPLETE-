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

/* ------------------------------------------------------------------ *
 * Helper utilities (rate limiting, caching, delays)
 * ------------------------------------------------------------------ */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Nominatim geocoding proxy
 * ------------------------------------------------------------------ */

const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';

const NOMINATIM_APP =
  process.env.NOMINATIM_APP_IDENTIFIER ||
  'NexoraSalonWebsiteBuilder/1.0 (+mailto:hello@nexorabeauty.com)';
const NOMINATIM_REFERER =
  process.env.NOMINATIM_REFERER || 'https://nexorabeauty.com';

const NOMINATIM_MIN_INTERVAL_MS = 1100;
const NOMINATIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const geocodeCache = new Map<string, { at: number; body: unknown }>();
let nominatimLastRequestAt = 0;
let nominatimQueue: Promise<unknown> = Promise.resolve();

// Server-side global rate guard: one in-flight request at a time, >= 1.1s apart.
function nominatimRateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const waitFor = nominatimLastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await delay(waitFor);
    nominatimLastRequestAt = Date.now();
    return task();
  });
  nominatimQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function callNominatim(pathAndQuery: string): Promise<unknown> {
  const cached = geocodeCache.get(pathAndQuery);
  if (cached && Date.now() - cached.at < NOMINATIM_CACHE_TTL_MS) {
    return cached.body;
  }

  const body = await nominatimRateLimited(async () => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_APP as string,
    };
    if (NOMINATIM_REFERER) headers.Referer = NOMINATIM_REFERER;

    const response = await fetch(`${NOMINATIM_BASE}${pathAndQuery}`, { headers });
    if (!response.ok) {
      throw new Error(`Nominatim responded ${response.status}`);
    }
    return response.json();
  });

  geocodeCache.set(pathAndQuery, { at: Date.now(), body });
  return body;
}

/* ------------------------------------------------------------------ *
 * Video metadata helpers (YouTube oEmbed + Open Graph)
 * ------------------------------------------------------------------ */

const YT_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const VIDEO_META_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
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
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return YT_VIDEO_ID_RE.test(id) ? id : null;
  }
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const v = parsed.searchParams.get('v') || '';
    if (YT_VIDEO_ID_RE.test(v)) return v;
    const match = parsed.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]+)/);
    if (match && YT_VIDEO_ID_RE.test(match[1])) return match[1];
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
  const response = await fetch(oembedUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'NexoraSalonWebsiteBuilder/1.0 (+https://nexorabeauty.com)',
    },
  });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`YouTube oEmbed responded ${response.status}`);
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

  // Preserve exact request bytes for provider webhook HMAC verification before
  // parsing JSON. All other routes continue to receive the parsed body.
  app.use(express.json({
    limit: '256kb',
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));

  // Same-origin by default, plus an explicit deployment allowlist. Never send
  // wildcard origin together with credentialed CORS.
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
      if (cached && Date.now() - cached.at < VIDEO_META_CACHE_TTL_MS) {
        return res.json(cached.body);
      }

      try {
        const oembed = await videoMetaRateLimited(() => fetchYoutubeOembed(videoId));
        if (!oembed) {
          return res.status(404).json({
            code: 'not_found',
            error: 'No video was found at that URL. It may be private or deleted.',
          });
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
  app.post('/api/owner/save-website-draft', async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const salonId = (req.body?.salonId || '').trim();
      const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};
      const templateKey = (req.body?.templateKey || 'hair').trim();
      const slug = (req.body?.slug || '').trim();

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

      const finalSlug = slug || salon.slug || `salon-${salonId.slice(0, 8)}`;

      // Upsert website draft
      const { data: website, error: upsertErr } = await admin
        .from('salon_public_websites')
        .upsert({
          salon_id: salonId,
          slug: finalSlug,
          template_key: templateKey,
          config,
          is_published: false,
        } as any, { onConflict: 'salon_id' })
        .select('slug, is_published')
        .maybeSingle();

      if (upsertErr) {
        // If upsert fails, try update
        const { data: updated } = await admin
          .from('salon_public_websites')
          .update({ config } as any)
          .eq('salon_id', salonId)
          .select('slug, is_published')
          .maybeSingle();

        return res.json({
          salonId,
          slug: updated?.slug || finalSlug,
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
