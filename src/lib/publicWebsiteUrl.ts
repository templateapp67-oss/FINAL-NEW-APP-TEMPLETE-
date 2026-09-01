import { getBrandConfig } from '../config/brandConfig';

/** Slugs owned by platform routes/hosts and unavailable to businesses. */
export const RESERVED_WEBSITE_SLUGS = new Set([
  'dashboard', 'builder', 'nearby', 'auth', 'login', 'signup', 'register',
  'reset-password', 'api', 'admin', 'www', 'app', 'static', 'assets',
]);

/** Maximum length of a generated slug (mirrors the DB `char_length` guard). */
export const MAX_SLUG_LENGTH = 50;
/** Minimum length accepted by `private.normalize_website_slug`. */
export const MIN_SLUG_LENGTH = 3;

/**
 * Canonical slug generator — mirrors `private.normalize_website_slug` /
 * `private.nexora_business_slug` so the address the owner sees is exactly the
 * address the database will allocate:
 *
 *   "Arts By Uma"      -> "arts-by-uma"
 *   "Nexora  Salon!!"  -> "nexora-salon"
 *   "Üma Studio & Spa" -> "uma-studio-spa"
 *
 * Steps: lowercase → strip accents → replace every run of non-alphanumeric
 * characters with a single hyphen → trim leading/trailing hyphens → clamp to
 * 50 chars → avoid reserved platform routes.
 */
export function generateSalonSlug(name: string | undefined | null): string {
  let slug = (name || '')
    .normalize('NFKD')
    // Drop combining accents so "Üma" becomes "Uma" rather than being deleted.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  if (!slug) slug = 'salon';
  if (slug.length < MIN_SLUG_LENGTH) {
    slug = `${slug}-salon`.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  }
  if (RESERVED_WEBSITE_SLUGS.has(slug)) {
    slug = `${slug}-salon`.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  }
  return slug;
}

/**
 * Kebab slug suggestion from a business name.
 *
 * Supabase remains authoritative for collision allocation. This browser helper
 * mirrors its normalization only so Preview never advertises an invalid or
 * reserved address before the publish RPC returns the final persisted slug.
 */
export function slugifySalonName(name: string | undefined | null): string {
  return generateSalonSlug(name);
}

/**
 * Client-side collision suffixing (`base`, `base-1`, `base-2`, …) matching the
 * deterministic sequence of `private.nexora_allocate_business_slug`. The
 * database stays the final authority — this only keeps the live preview honest
 * before publish.
 */
export function uniqueSalonSlug(base: string, taken: Iterable<string> = []): string {
  const takenSet = new Set<string>();
  for (const value of taken) {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized) takenSet.add(normalized);
  }
  const root = generateSalonSlug(base);
  if (!takenSet.has(root)) return root;
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const trimmed = root.slice(0, Math.max(1, MAX_SLUG_LENGTH - String(suffix).length - 1)).replace(/-+$/g, '');
    const candidate = `${trimmed}-${suffix}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  return root;
}

/**
 * The slug a salon should advertise right now: once published the address is
 * permanently allocated (changing it would break every shared link), while an
 * unpublished salon tracks its business name so `/my-salon-3` becomes
 * `/arts-by-uma` as soon as the owner types the real name.
 */
export function currentSalonSlug(input: {
  salonName?: string | null;
  websiteSlug?: string | null;
  published?: boolean;
  publishedUrl?: string | null;
}): string {
  const existing = (input.websiteSlug || '').trim().toLowerCase();
  const existingUsable = isValidWebsiteSlug(existing) && !RESERVED_WEBSITE_SLUGS.has(existing);
  // A published address is permanently allocated (published_at is the
  // allocation marker) — renaming the business must never break a shared link.
  if (input.published && existingUsable) return existing;

  // No usable name yet (first render, or the owner cleared the field): never
  // downgrade an already allocated slug to the generic `salon` placeholder.
  const hasName = (input.salonName || '').trim().length > 0;
  if (!hasName) return existingUsable ? existing : generateSalonSlug(input.salonName);

  const generated = generateSalonSlug(input.salonName);
  if (!isValidWebsiteSlug(generated)) return existingUsable ? existing : generated;
  // A slug auto-allocated from the placeholder name ("my-salon-3") is replaced
  // by the real business name while the site is still a draft.
  return generated;
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
