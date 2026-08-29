/**
 * M63 (infra) — real robots.txt and sitemap.xml generated from the PUBLISHED
 * white-label sites, plus the deployment-wide health contract.
 *
 * Closes the SEO PARTIAL gap "no generated sitemap.xml or robots.txt
 * deployment route": crawlers no longer depend on client-side JS to discover
 * every published salon slug. Private surfaces (dashboard, builder, API) are
 * explicitly disallowed. When Supabase is not configured the routes still
 * answer with a valid robots.txt and a base-only sitemap so the deployment
 * never 500s for crawlers.
 */
import type { Express, Request, Response } from 'express';
import { getSupabaseAdmin } from './supabaseAdmin';
import { isRazorpayProviderConfigured } from './razorpay';

function publicBaseUrl(req: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL || process.env.APP_ORIGIN || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers.host || req.hostname || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

const DISALLOWED_PATHS = ['/dashboard', '/builder', '/signup', '/auth/', '/reset-password', '/api/'];

export function setupSeoRoutes(app: Express): void {
  app.get('/robots.txt', (req: Request, res: Response) => {
    const base = publicBaseUrl(req);
    const lines = [
      'User-agent: *',
      'Allow: /',
      ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ];
    res.type('text/plain').send(lines.join('\n'));
  });

  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    const base = publicBaseUrl(req);
    const urls: { loc: string; lastmod?: string }[] = [{ loc: `${base}/` }];

    try {
      // Owner-app + published white-label sites (RLS-visible public projection).
      const { data, error } = await getSupabaseAdmin()
        .from('salon_public_websites')
        .select('slug,updated_at')
        .eq('is_published', true)
        .order('slug')
        .limit(5000);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row && typeof row.slug === 'string' && row.slug) {
            urls.push({
              loc: `${base}/${encodeURIComponent(row.slug)}`,
              ...(typeof row.updated_at === 'string' ? { lastmod: row.updated_at.slice(0, 10) } : {}),
            });
          }
        }
      }
    } catch {
      // Unconfigured/broken database: serve the base sitemap, never a 500.
    }

    const today = new Date().toISOString().slice(0, 10);
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((entry) => [
        '  <url>',
        `    <loc>${entry.loc.replace(/&/g, '&amp;')}</loc>`,
        `    <lastmod>${entry.lastmod || today}</lastmod>`,
        '  </url>',
      ].join('\n')),
      '</urlset>',
      '',
    ].join('\n');
    res.type('application/xml').send(xml);
  });

  /**
   * Deep dependency health for uptime probes and deploy smoke tests. Returns
   * 200 only when every REQUIRED dependency answers; degraded states are
   * reported per-component so operators can see exactly what is down.
   */
  app.get('/api/health/deep', async (_req: Request, res: Response) => {
    const checks: Record<string, { status: 'ok' | 'degraded' | 'down' | 'unknown'; detail?: string }> = {};

    // Supabase REST connectivity + migration surface probe.
    try {
      const startedAt = Date.now();
      const admin = getSupabaseAdmin();
      const { error } = await admin.rpc('verify_m54_workspace_bootstrap');
      checks.supabase = error
        ? { status: 'degraded', detail: `connected; M54 verifier unavailable: ${error.code || error.message}` }
        : { status: 'ok', detail: `reachable (${Date.now() - startedAt}ms); M54 verifier present` };
    } catch (error) {
      checks.supabase = {
        status: 'down',
        detail: error instanceof Error && /not configured/i.test(error.message)
          ? 'server credentials not configured'
          : 'unreachable',
      };
    }

    // Razorpay mode (configuration presence only; no provider call).
    checks.razorpay = isRazorpayProviderConfigured()
      ? { status: 'ok', detail: 'credentials configured' }
      : { status: 'unknown', detail: 'not configured (preview/local payment mode)' };

    // Geocoding upstream configuration.
    checks.geocoding = {
      status: process.env.NOMINATIM_BASE_URL || process.env.NOMINATIM_APP_IDENTIFIER ? 'ok' : 'unknown',
      detail: process.env.NOMINATIM_BASE_URL ? 'custom upstream' : 'default upstream (openstreetmap)',
    };

    // AI writing tools.
    checks.ai = process.env.GEMINI_API_KEY
      ? { status: 'ok', detail: 'paid key configured' }
      : { status: 'unknown', detail: 'rule-based offline mode' };

    const required = [checks.supabase];
    const healthy = required.every((check) => check && check.status === 'ok');
    const degraded = required.every((check) => check && check.status !== 'down');
    res.status(healthy ? 200 : degraded ? 207 : 503).json({
      status: healthy ? 'ok' : degraded ? 'degraded' : 'down',
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA || null,
      timestamp: new Date().toISOString(),
    });
  });
}
