/**
 * HOST-BASED (SUBDOMAIN) SALON ROUTING — server side.
 *
 * The Express server is the Vite/Express equivalent of the Next.js
 * `middleware.ts` rewrite:
 *
 *     // middleware.ts (Next.js reference implementation)
 *     const currentHost = hostname.replace(`.yourdomain.com`, '');
 *     if (currentHost && currentHost !== 'www' && currentHost !== hostname) {
 *       return NextResponse.rewrite(new URL(`/${currentHost}${url.pathname}`, req.url));
 *     }
 *
 * Here the "yourdomain.com" base is resolved dynamically from the white-label
 * brand configuration (`DEFAULT_BRAND_CONFIG.platform.websiteUrl`), so a
 * rebranded deployment routes by its own domain without code changes. An
 * explicit `NEXORA_BASE_HOST` environment variable always wins.
 *
 * The client-side router (`src/main.tsx` RootRouter +
 * `src/lib/salonRouting.ts#extractSubdomainSlug`) resolves the same slugs
 * from `window.location.hostname`; this server rewrite keeps self-hosted
 * deployments consistent (server logs, SPA fallback, and any server-rendered
 * path all see the canonical `/<slug>` path) and lets a future SSR layer rely
 * on `req.path` directly.
 *
 * API and static paths are NEVER rewritten — `/api/...` and `/assets/...`
 * must keep their exact shape. Client-app routes (`/signup`, `/nearby`, …)
 * are skipped too, mirroring the exact-route checks in the client RootRouter.
 */
import { getBrandBaseHost, normalizeRouteSlug } from '../src/lib/salonRouting';

/**
 * Exact client routes that must keep their path even under a salon
 * subdomain (mirrors the RootRouter order in `src/main.tsx`). Note that
 * `/` itself is NOT protected: under a salon subdomain the apex path IS the
 * salon home and must rewrite to `/<slug>` (the Next.js middleware
 * reference rewrites `/${slug}${url.pathname}` for every path). On the apex
 * domain (no subdomain slug) no rewrite happens at all, so `/` still serves
 * the builder app.
 */
// Core system routes that must NEVER be rewritten to a salon slug when served
// from a salon subdomain. Static assets and /api are excluded separately below.
const PROTECTED_PATHS = new Set([
  '/signup',
  '/auth/callback',
  '/auth',
  '/login',
  '/reset-password',
  '/dashboard',
  '/builder',
  '/nearby',
  '/www',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
]);

/** Path prefixes reserved for the platform/app, not salon sites. */
const PROTECTED_PREFIXES = ['/api/', '/assets/', '/auth/', '/www/'];

/**
 * Extracts the salon slug from a request host (subdomain routing).
 *
 * `royal-hair-studio.yourdomain.com` → `royal-hair-studio`
 * `yourdomain.com`, `www.yourdomain.com`, localhost, IPs, unknown/preview
 * hosts (e.g. `*.e2b.app`) → `''` (never misinterpreted as a slug).
 */
export function resolveHostSlug(
  hostname: string | undefined | null,
  baseHostOverride?: string,
): string {
  const host = (hostname || '').split(':')[0].toLowerCase();
  const base = (baseHostOverride || process.env.NEXORA_BASE_HOST || getBrandBaseHost()).toLowerCase();
  if (!host || !base || !base.includes('.')) return '';
  // Vercel `*.vercel.app` deployments cannot host wildcard business
  // subdomains; published sites there resolve through `base/<slug>` paths.
  if (base.endsWith('.vercel.app')) return '';
  if (host === base || !host.endsWith(`.${base}`)) return '';
  const prefix = host.slice(0, -(base.length + 1));
  if (!prefix || prefix === 'www') return '';
  return normalizeRouteSlug(prefix);
}

/**
 * Returns the canonical request path for a host+pathname pair.
 *
 *   rewriteHostPath('royal-hair-studio.domain.com', '/')            → '/royal-hair-studio'
 *   rewriteHostPath('royal-hair-studio.domain.com', '/team')        → '/royal-hair-studio/team'
 *   rewriteHostPath('royal-hair-studio.domain.com', '/api/health')  → '/api/health' (untouched)
 *   rewriteHostPath('domain.com', '/royal-hair-studio')             → '/royal-hair-studio' (untouched)
 */
export function rewriteHostPath(
  hostname: string | undefined | null,
  pathname: string,
  baseHostOverride?: string,
): string {
  const path = pathname || '/';
  const slug = resolveHostSlug(hostname, baseHostOverride);
  if (!slug) return path;
  // Never rewrite API/static/protected client routes.
  if (
    PROTECTED_PATHS.has(path) ||
    PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    return path;
  }
  if (path === `/${slug}` || path.startsWith(`/${slug}/`)) return path;
  return `/${slug}${path === '/' ? '' : path}`;
}
