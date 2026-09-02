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
 * Additional demo slugs that auto-resolve to a fully seeded salon when the
 * backend is unreachable/unconfigured, so a shared `/arts-by-uma` link (the
 * featured tenant in this template) never renders "Salon Not Found". Additive
 * — the configured brand-default slug above keeps working unchanged.
 */
export const DEMO_SEED_SLUGS: ReadonlyArray<string> = ['arts-by-uma'];

/**
 * Full public-data seed for a demo salon. Mirrors the shape a published
 * `get_public_salon_website` projection + services would return, so the site
 * renders a rich, real-feeling public page in offline/preview mode.
 */
export function buildDemoSeedSalonData(slug: string): SalonData | null {
  if (!DEMO_SEED_SLUGS.includes(slugifySalonName(slug))) return null;
  const base: SalonData = { ...initialData };
  return {
    ...base,
    templateId: 'barber_mens_grooming',
    salonName: 'Arts By Uma',
    tagline: 'Precision hair, grooming & colour by Uma',
    about: 'Arts By Uma is a boutique salon & grooming studio offering precision haircuts, beard styling, hair colour and relaxing spa treatments — crafted by Uma and her team for a look that is unmistakably yours.',
    ownerName: 'Uma Sharma',
    ownerRole: 'Founder & Master Stylist',
    ownerPhotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop',
    phone: '+91 98765 01234',
    whatsappPhone: '+91 98765 01234',
    email: 'hello@artsbyuma.example',
    websiteSlug: slugifySalonName(slug),
    heroPosition: 'Center',
    websiteAppearance: 'light',
    services: [
      { id: 'au-1', name: 'Signature Haircut & Styling', category: 'Haircut', description: 'A tailored cut and finish shaped to your face, hair type and lifestyle.', price: 499, duration: 45, status: 'active', featured: true },
      { id: 'au-2', name: 'Beard Sculpting & Hot Towel', category: 'Grooming', description: 'Precision beard shaping with a relaxing hot-towel finish.', price: 299, duration: 30, status: 'active', featured: true },
      { id: 'au-3', name: 'Ammonia-Free Hair Colour', category: 'Colour', description: 'Full colour or root touch-up with ammonia-free, organic colour products.', price: 1499, duration: 90, status: 'active' },
      { id: 'au-4', name: 'Hair Spa & Scalp Therapy', category: 'Treatment', description: 'Deep-conditioning scalp massage and spa treatment to restore shine and softness.', price: 899, duration: 45, status: 'active' },
      { id: 'au-5', name: 'Clean Shave & Face Polish', category: 'Grooming', description: 'A classic barbershop shave with a gentle face-polish finish.', price: 249, duration: 30, status: 'active' },
    ],
    packages: [
      { id: 'au-p1', name: 'Grooming Ritual Combo', description: 'Haircut + beard sculpting + hot-towel shave in one visit.', price: 899, duration: 90, status: 'active' },
      { id: 'au-p2', name: 'Colour & Care Package', description: 'Colour + hair spa to keep your new shade vibrant and healthy.', price: 1999, duration: 150, status: 'active' },
    ],
    team: [
      { id: 'au-t1', name: 'Uma Sharma', role: 'Founder & Master Stylist', specialties: ['Precision Haircut', 'Colour', 'Bridal Styling'], imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop', bio: '12+ years perfecting tailored cuts and colour for every face shape.', status: 'Available', rating: 5.0 },
      { id: 'au-t2', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Colour', 'Hair Spa'], imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop', bio: 'Organic colour specialist with an eye for dimensional shine.', status: 'Available', rating: 4.9 },
      { id: 'au-t3', name: 'Arjun Mehta', role: 'Barber & Grooming Expert', specialties: ['Beard Sculpting', 'Skin Fade', 'Hot Towel Shave'], imageUrl: 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=400&auto=format&fit=crop', bio: 'Classic barbershop craft with a modern edge.', status: 'Available', rating: 4.8 },
    ],
    gallery: [
      { id: 'au-g1', url: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=800&auto=format&fit=crop', alt: 'Salon interior', category: 'Interior' },
      { id: 'au-g2', url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=800&auto=format&fit=crop', alt: 'Colour & styling result', category: 'Hair' },
      { id: 'au-g3', url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=800&auto=format&fit=crop', alt: 'Relaxing salon moment', category: 'General' },
      { id: 'au-g4', url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop', alt: 'Barber tools & grooming', category: 'Details' },
      { id: 'au-g5', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=800&auto=format&fit=crop', alt: 'Grooming finish', category: 'Barber' },
      { id: 'au-g6', url: 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?q=80&w=800&auto=format&fit=crop', alt: 'Bridal styling', category: 'Beauty' },
    ],
    socialProfiles: {
      instagram: 'https://instagram.com/artsbyuma',
      facebook: 'https://facebook.com/artsbyuma',
      youtube: 'https://youtube.com/@artsbyuma',
      tiktok: 'https://instagram.com/artsbyuma',
    },
    socialVideos: [
      { id: 'au-v1', title: 'Behind the chair with Uma ✂️', platform: 'instagram', url: '#section-social', thumbnailUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=600&auto=format&fit=crop', likesCount: '2.4k' },
      { id: 'au-v2', title: 'Colour transformation reel', platform: 'instagram', url: '#section-social', thumbnailUrl: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=600&auto=format&fit=crop', likesCount: '1.8k' },
    ],
    address: {
      ...(base.address as NonNullable<typeof base.address>),
      fullAddress: 'Shop 5, First Floor, Palm Court Mall, Malviya Nagar',
      shopNumber: 'Shop 5',
      area: 'Malviya Nagar',
      city: 'Jaipur',
      state: 'Rajasthan',
      pinCode: '302017',
      landmark: 'Opposite Central Park',
    },
    openingHours: {
      monday: { open: true, startTime: '10:00', endTime: '20:00' },
      tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
      wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
      thursday: { open: true, startTime: '10:00', endTime: '20:00' },
      friday: { open: true, startTime: '10:00', endTime: '21:00' },
      saturday: { open: true, startTime: '09:00', endTime: '21:00' },
      sunday: { open: true, startTime: '10:00', endTime: '18:00' },
    },
  };
}


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
  if (nameSlug.length > 0 && normalized === nameSlug) return true;
  // Additive demo seeds (e.g. `/arts-by-uma`) resolve offline too.
  return DEMO_SEED_SLUGS.includes(normalized);
}


/**
 * Build a complete, renderable {@link SalonData} from the brand configuration
 * for the given slug. Used as a graceful fallback when Supabase is
 * unconfigured or the requested published record is missing, so the default
 * business profile always loads instead of "Salon Not Found".
 */
export function buildBrandFallbackSalonData(slug: string): SalonData {
  // Demo-seed slugs (e.g. `/arts-by-uma`) return the rich seeded profile
  // instead of the generic brand fallback when no backend record exists.
  const demo = buildDemoSeedSalonData(slug);
  if (demo) return demo;

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
