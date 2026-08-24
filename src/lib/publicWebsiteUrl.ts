import { getBrandConfig } from '../config/brandConfig';

/** Kebab slug from a business name. Empty when the name has no latin letters/digits. */
export function slugifySalonName(name: string | undefined | null): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
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
  if (isValidWebsiteSlug(existing)) return existing;
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
  return hostname.includes('.') && hostname !== 'localhost' && !/^\d+(?:\.\d+){3}$/.test(hostname);
}

/**
 * Existing white-label URL shape. Production hosts use `<slug>.<base-host>`;
 * localhost/IP development hosts keep the existing `base/<slug>` fallback.
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
