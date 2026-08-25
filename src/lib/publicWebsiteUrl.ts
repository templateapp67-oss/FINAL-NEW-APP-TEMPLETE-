import { getBrandConfig } from '../config/brandConfig';

/** Slugs owned by platform routes/hosts and unavailable to businesses. */
export const RESERVED_WEBSITE_SLUGS = new Set([
  'dashboard', 'builder', 'nearby', 'auth', 'login', 'signup', 'register',
  'reset-password', 'api', 'admin', 'www', 'app', 'static', 'assets',
]);

/**
 * Kebab slug suggestion from a business name.
 *
 * Supabase remains authoritative for collision allocation. This browser helper
 * mirrors its normalization only so Preview never advertises an invalid or
 * reserved address before the publish RPC returns the final persisted slug.
 */
export function slugifySalonName(name: string | undefined | null): string {
  let slug = (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');

  if (!slug) slug = 'salon';
  if (slug.length < 3) slug = `${slug}-salon`.slice(0, 50).replace(/-+$/g, '');
  if (RESERVED_WEBSITE_SLUGS.has(slug)) {
    slug = `${slug}-salon`.slice(0, 50).replace(/-+$/g, '');
  }
  return slug;
}

export function isValidWebsiteSlug(slug: string | undefined | null): boolean {
  return !!slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 60;
}

/** Existing allocated slug, else the initial suggestion from the business name. */
export function suggestedWebsiteSlug(input: {
  websiteSlug?: string | null;
  salonName?: string | null;
}): string {
  const existing = (input.websiteSlug || '').trim().toLowerCase();
  if (isValidWebsiteSlug(existing) && !RESERVED_WEBSITE_SLUGS.has(existing)) return existing;
  return slugifySalonName(input.salonName);
}

export function websiteHost(baseUrl?: string): string {
  const raw = (baseUrl || getBrandConfig().platform.websiteUrl || '').trim();
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  }
}

function canUseSubdomain(host: string): boolean {
  const hostname = host.split(':')[0];
  // Vercel's `*.vercel.app` hosts do NOT support arbitrary wildcard
  // subdomains (only fixed Vercel-managed subdomains exist), so business
  // sites there must use the path form `base/<slug>` — never
  // `<slug>.project.vercel.app`.
  if (hostname.endsWith('.vercel.app')) return false;
  return hostname.includes('.') && hostname !== 'localhost' && !/^\d+(?:\.\d+){3}$/.test(hostname);
}

/**
 * Existing white-label URL shape. Hosts that support wildcard subdomains
 * use `<slug>.<base-host>`; localhost/IP and `*.vercel.app` deployment
 * hosts keep the `base/<slug>` fallback.
 */
export function publicWebsiteHref(slug: string | undefined | null, baseUrl?: string): string {
  const host = websiteHost(baseUrl);
  const clean = (slug || '').trim().toLowerCase();
  if (!clean) return host;
  return canUseSubdomain(host) ? `${clean}.${host}` : `${host}/${clean}`;
}

export function publicWebsiteUrl(slug: string | undefined | null, baseUrl?: string): string {
  const href = publicWebsiteHref(slug, baseUrl);
  return href ? `https://${href}` : '';
}
