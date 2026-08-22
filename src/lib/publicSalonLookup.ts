/**
 * Public salon slug resolution — the single lookup used by both the root
 * router (`main.tsx`) and `PublicSalonView`.
 *
 * Resolution order:
 *   1. Backend: exact (normalized) `salon_public_websites.slug` match.
 *   2. Backend: normalized-name fallback via `public_salon_catalog`
 *      (`royal-hair-studio` -> "Royal Hair Studio").
 *   3. Offline/static: a matching local onboarding draft or the static
 *      seed salon from the brand config (so `/royal-hair-studio` still
 *      renders when Supabase is not configured or the backend misses).
 */

import { getBrandConfig } from '../config/brandConfig';
import { slugifySalonName } from './publicWebsiteUrl';
import { PUBLIC_SALON_CATALOG_VIEW } from './nearbySalons';
import { requireSupabase } from './supabaseClient';
import { normalizeSalonSlug, salonNameMatchesCandidates } from './salonSlug';

export type SalonSlugSource = 'slug' | 'name';

export interface ResolvedSalonSlug {
  /** Canonical, normalized slug to load. */
  slug: string;
  source: SalonSlugSource;
}

/**
 * Resolve a raw URL path segment to a published salon website slug.
 * Returns null when no published backend record matches by slug or name.
 */
export async function resolvePublishedSalonSlug(
  rawSlug: string,
): Promise<ResolvedSalonSlug | null> {
  const slug = normalizeSalonSlug(rawSlug);
  if (!slug) return null;
  const client = requireSupabase();

  // 1. Exact slug match (normalized so casing/trailing-slash drift cannot 404).
  const { data: exact, error: exactError } = await client
    .from('salon_public_websites')
    .select('slug')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (exactError) throw exactError;
  const exactSlug = normalizeSalonSlug(exact?.slug);
  if (exactSlug) return { slug: exactSlug, source: 'slug' };

  // 2. Normalized-name fallback against the published catalog.
  const { data: catalog, error: catalogError } = await client
    .from(PUBLIC_SALON_CATALOG_VIEW)
    .select('name,slug');
  if (catalogError) throw catalogError;
  for (const row of catalog ?? []) {
    if (!row?.slug || !salonNameMatchesCandidates(row.name, slug)) continue;
    const canonical = normalizeSalonSlug(row.slug);
    if (canonical) return { slug: canonical, source: 'name' };
  }
  return null;
}

/** Static seed-salon slug (e.g. `royal-hair-studio`) from the brand config. */
export function resolveStaticSalonSlug(rawSlug: string | null | undefined): string | null {
  const slug = normalizeSalonSlug(rawSlug);
  if (!slug) return null;
  const { defaultSalon } = getBrandConfig();
  const candidates = new Set<string>();
  const configured = normalizeSalonSlug(defaultSalon.slug);
  if (configured) candidates.add(configured);
  const slugified = slugifySalonName(defaultSalon.name);
  if (slugified) candidates.add(slugified);
  return candidates.has(slug) ? slug : null;
}

/** Local onboarding-draft slug stored in `nexora_onboarding_state`. */
export function resolveLocalDraftSalonSlug(rawSlug: string | null | undefined): string | null {
  const slug = normalizeSalonSlug(rawSlug);
  if (!slug) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    const saved = localStorage.getItem('nexora_onboarding_state');
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { data?: { websiteSlug?: string } } | null;
    const localSlug =
      typeof parsed?.data?.websiteSlug === 'string'
        ? parsed.data.websiteSlug.trim().toLowerCase()
        : '';
    return localSlug && localSlug === slug ? slug : null;
  } catch {
    return null;
  }
}

/** Offline/local draft first, then the static seed salon. */
export function resolveLocalOrStaticSalonSlug(rawSlug: string | null | undefined): string | null {
  return resolveLocalDraftSalonSlug(rawSlug) ?? resolveStaticSalonSlug(rawSlug);
}
