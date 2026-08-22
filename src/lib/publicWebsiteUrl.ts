import { getBrandConfig } from '../config/brandConfig';

/** Kebab slug from a salon name. Empty when the name has no latin letters/digits. */
export function slugifySalonName(name: string | undefined | null): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function isValidWebsiteSlug(slug: string | undefined | null): boolean {
  return !!slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 60;
}

/** Owner-chosen slug, else a suggestion from the salon name. Never a hardcoded salon. */
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
  return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** Public path `host/slug`. Empty slug → host only. */
export function publicWebsiteHref(slug: string | undefined | null, baseUrl?: string): string {
  const host = websiteHost(baseUrl);
  const clean = (slug || '').trim().toLowerCase();
  return clean ? `${host}/${clean}` : host;
}

export function publicWebsiteUrl(slug: string | undefined | null, baseUrl?: string): string {
  const href = publicWebsiteHref(slug, baseUrl);
  return href ? `https://${href}` : '';
}
