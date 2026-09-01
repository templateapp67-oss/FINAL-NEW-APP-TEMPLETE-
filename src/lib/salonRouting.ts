/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared routing + slug helpers for the public salon website path.
 *
 * Responsibilities:
 *  - Normalise a browser pathname into a canonical, query-safe slug
 *    (lowercase, trimmed, slugified).
 *  - Decide whether an incoming slug should fall back to the configured
 *    default business (brand) profile when Supabase is unconfigured or the
 *    requested record is missing — this is what keeps `/nexora-demo-salon`
 *    (and any other brand-default slug) from ever rendering "Salon Not Found".
 *  - Build a fully-renderable {@link SalonData} from the brand configuration
 *    so the fallback salon loads successfully without a backend record.
 */

import { initialData, type SalonData } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import { slugifySalonName } from './publicWebsiteUrl';
import { canonicalPublicSlug } from './publicSalonResolver';

/** Normalised slug stored on the configured default business. */
export const BRAND_FALLBACK_SLUG =
  slugifySalonName(DEFAULT_BRAND_CONFIG.defaultSalon.slug) || 'nexora-demo-salon';


/**
 * Normalise a raw `window.location.pathname` into a single canonical slug.
 *
 * Steps: strip leading/trailing slashes, lowercase, take the first path
 * segment, then slugify (collapse whitespace, strip invalid characters). This
 * makes `/Nexora-Demo-Salon/`, `/Nexora Demo Salon`, and `/nexora-demo-salon`
 * all resolve to the same canonical `nexora-demo-salon` slug.
 */
export function normalizeRouteSlug(pathname: string): string {
  // ONE canonical implementation, shared with the public resolver and the
  // public view, so the router can never look up a subtly different slug from
  // the one the resolver queries.
  return canonicalPublicSlug(pathname);
}

/**
 * Whether `slug` should resolve to the configured brand-default salon when no
 * backend record exists. Used by both the router (routing decision) and the
 * public view (data fallback).
 */
export function matchesBrandFallbackSlug(slug: string): boolean {
  const normalized = slugifySalonName(slug);
  if (!normalized) return false;
  // Match the configured default slug exactly.
  if (normalized === BRAND_FALLBACK_SLUG) return true;
  // Also accept the slug derived from the default salon's own name so links
  // built from the business name keep resolving.
  const nameSlug = slugifySalonName(DEFAULT_BRAND_CONFIG.defaultSalon.name);
  return nameSlug.length > 0 && normalized === nameSlug;
}


/**
 * Build a complete, renderable {@link SalonData} from the brand configuration
 * for the given slug. Used as a graceful fallback when Supabase is
 * unconfigured or the requested published record is missing, so the default
 * business profile always loads instead of "Salon Not Found".
 */
export function buildBrandFallbackSalonData(slug: string): SalonData {
  const brand = DEFAULT_BRAND_CONFIG.defaultSalon;
  const base: SalonData = { ...initialData };

  return {
    ...base,
    templateId: 'hair',
    salonName: brand.name,
    tagline: brand.tagline,
    about: brand.about,
    ownerName: brand.ownerName,
    ownerRole: brand.ownerRole,
    ownerPhotoUrl: brand.ownerPhotoUrl,
    phone: brand.phone,
    whatsappPhone: brand.whatsappPhone,
    email: brand.email,
    websiteSlug: slug,
    socialProfiles: {
      instagram: brand.socialProfiles.instagram,
      facebook: brand.socialProfiles.facebook,
      youtube: brand.socialProfiles.youtube,
      tiktok: brand.socialProfiles.tiktok,
    },
    address: {
      ...(base.address as NonNullable<typeof base.address>),
      fullAddress: brand.address.fullAddress,
      shopNumber: brand.address.shopNumber,
      area: brand.address.area,
      city: brand.address.city,
      state: brand.address.state,
      pinCode: brand.address.pinCode,
      landmark: brand.address.landmark,
    },
  };
}


/**
 * Resolve the configured "base host" (registrable domain) from the brand
 * platform website URL. Subdomain-based salon routing is only activated when
 * the incoming request host ends with this base, so preview/dev hosts
 * (e.g. `*.e2b.app`), `localhost`, and raw IPs are never misinterpreted as a
 * salon slug.
 */
export function getBrandBaseHost(): string {
  try {
    const raw = DEFAULT_BRAND_CONFIG.platform.websiteUrl || '';
    return new URL(raw).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Extract a salon slug from the request **subdomain** (host-based routing).
 *
 * Returns `''` when there is no usable subdomain — the apex domain, localhost,
 * an IP address, an unknown/preview host, the `www` label, or any
 * `*.vercel.app` base (Vercel does not support wildcard business subdomains;
 * those deployments resolve published sites through `base/<slug>` paths).
 * When the brand base host is `yourdomain.com`, a visit to
 * `nexora-demo-salon.yourdomain.com` resolves to the slug
 * `nexora-demo-salon`.
 */
export function extractSubdomainSlug(hostname: string): string {
  const host = (hostname || '').split(':')[0].toLowerCase();
  const base = getBrandBaseHost();
  if (!host || !base) return '';
  if (base.endsWith('.vercel.app')) return '';
  if (host === base || !host.endsWith(`.${base}`)) return '';
  const prefix = host.slice(0, -(base.length + 1));
  if (!prefix || prefix === 'www') return '';
  return normalizeRouteSlug(prefix);
}
