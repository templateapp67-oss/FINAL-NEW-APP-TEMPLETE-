/**
 * Public salon slug resolution — the single lookup used by both the root
 * router (`main.tsx`) and `PublicSalonView`.
 *
 * Resolution order:
 *   1. Backend: tenant subdomain (`royal-hair-studio.<platform>`) and
 *      custom domain (`royalhairstudio.in`) on `salon_public_websites`.
 *   2. Backend: exact (normalized) `salon_public_websites.slug` match.
 *   3. Backend: normalized-name fallback via `public_salon_catalog`
 *      (`royal-hair-studio` -> "Royal Hair Studio").
 *   4. Offline/static: a matching local onboarding draft or the static
 *      seed salon from the brand config (so `/royal-hair-studio` still
 *      renders when Supabase is not configured or the backend misses).
 */

import { getBrandConfig } from '../config/brandConfig';
import { slugifySalonName } from './publicWebsiteUrl';
import { PUBLIC_SALON_CATALOG_VIEW } from './nearbySalons';
import { requireSupabase } from './supabaseClient';
import { normalizeSlug, slugToNameCandidates, salonNameMatchesCandidates } from './salonSlug';
import { resolveTenantHost } from './tenantHost';

export type SalonSlugSource = 'slug' | 'name' | 'subdomain' | 'custom_domain';

export interface ResolvedSalonSlug {
  /** Canonical, normalized slug to load. */
  slug: string;
  source: SalonSlugSource;
}

interface CatalogRow {
  name: string | null;
  slug: string | null;
}

/** Seed salon slug that always resolves to the static fallback data. */
const SEED_SALON_SLUGS = new Set(['royal-hair-studio']);

/**
 * Resolve a tenant from the request host (subdomain or custom domain).
 * Returns null when the host has no tenant part or the project hasn't
 * applied the M41 subdomain columns yet (the query degrades gracefully).
 */
export async function resolvePublishedSalonByHost(
  hostname: string | null | undefined,
  baseDomain?: string | null,
): Promise<ResolvedSalonSlug | null> {
  const info = resolveTenantHost(hostname, baseDomain);
  if (!info.subdomain && !info.customDomain) return null;
  const client = requireSupabase();
  try {
    if (info.subdomain) {
      const { data, error } = await client
        .from('salon_public_websites')
        .select('slug')
        .eq('subdomain', info.subdomain)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      const slug = normalizeSlug(data?.slug);
      if (slug) return { slug, source: 'subdomain' };
    }
    if (info.customDomain) {
      const { data, error } = await client
        .from('salon_public_websites')
        .select('slug')
        .eq('custom_domain', info.customDomain)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      const slug = normalizeSlug(data?.slug);
      if (slug) return { slug, source: 'custom_domain' };
    }
  } catch (error) {
    // Columns may not exist yet on a project without the M41 migration —
    // fall through to slug-path resolution instead of hard-failing.
    console.warn('Subdomain/custom-domain lookup unavailable, falling back to slug:', error);
  }
  return null;
}

export interface SalonRouteInput {
  hostname: string;
  /** First path segment, raw (before slug normalization). */
  pathSlug: string;
  /** Platform apex domain override (defaults to VITE_PUBLIC_ROOT_DOMAIN/config). */
  baseDomain?: string | null;
}

/**
 * Resolve the tenant for a request using the full priority order:
 * host subdomain → custom domain → path slug → name fallback.
 */
export async function resolveSalonRouteSlug(
  input: SalonRouteInput,
): Promise<ResolvedSalonSlug | null> {
  const hostResolved = await resolvePublishedSalonByHost(input.hostname, input.baseDomain);
  if (hostResolved) return hostResolved;
  const pathSlug = normalizeSlug(input.pathSlug);
  if (!pathSlug) return null;
  return resolvePublishedSalonSlug(pathSlug);
}

/**
 * Resolve a raw URL path segment to a published salon website slug.
 * Returns null when no published backend record matches by slug or name.
 */
export async function resolvePublishedSalonSlug(
  rawSlug: string,
): Promise<ResolvedSalonSlug | null> {
  const slug = normalizeSlug(rawSlug);
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
  const exactSlug = normalizeSlug(exact?.slug);
  if (exactSlug) return { slug: exactSlug, source: 'slug' };

  // 2. Name fallback: shortlist published salons whose name contains any
  //    slug-derived candidate, then pick the precise word-boundary match.
  let match: CatalogRow | undefined;
  try {
    const candidates = slugToNameCandidates(slug);
    const orFilter = candidates.map((c) => `name.ilike.%${c}%`).join(',');
    const { data: catalog, error: catalogError } = await client
      .from(PUBLIC_SALON_CATALOG_VIEW)
      .select('name,slug')
      .or(orFilter);
    if (catalogError) throw catalogError;
    match = (catalog ?? []).find(
      (row) => row?.slug && salonNameMatchesCandidates(row.name, slug),
    );
  } catch (error) {
    console.error('Salon name ilike fallback failed, retrying full catalog:', error);
  }

  // 3. Safety net: the substring scan can miss names that diverge mid-name
  //    ("Royal Hair & Beauty Studio" vs the "Royal Hair Studio" candidate).
  if (!match) {
    const { data: all, error: allError } = await client
      .from(PUBLIC_SALON_CATALOG_VIEW)
      .select('name,slug');
    if (allError) throw allError;
    match = (all ?? []).find(
      (row) => row?.slug && salonNameMatchesCandidates(row.name, slug),
    );
  }

  if (match?.slug) {
    const canonical = normalizeSlug(match.slug);
    if (canonical) return { slug: canonical, source: 'name' };
  }
  return null;
}

/** Static seed-salon slug (e.g. `royal-hair-studio`) from the brand config. */
export function resolveStaticSalonSlug(rawSlug: string | null | undefined): string | null {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;
  const { defaultSalon } = getBrandConfig();
  const candidates = new Set<string>(SEED_SALON_SLUGS);
  const configured = normalizeSlug(defaultSalon.slug);
  if (configured) candidates.add(configured);
  const slugified = slugifySalonName(defaultSalon.name);
  if (slugified) candidates.add(slugified);
  return candidates.has(slug) ? slug : null;
}

/** Local onboarding-draft slug stored in `nexora_onboarding_state`. */
export function resolveLocalDraftSalonSlug(rawSlug: string | null | undefined): string | null {
  const slug = normalizeSlug(rawSlug);
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

/**
 * Offline/static resolution for a full request: the tenant subdomain can map
 * straight onto a static seed slug (`royal-hair-studio.<platform>`), else the
 * path slug is tried. Custom domains cannot resolve offline (no DB → no map).
 */
export function resolveLocalOrStaticSalonRouteSlug(input: SalonRouteInput): string | null {
  const info = resolveTenantHost(input.hostname, input.baseDomain);
  if (info.subdomain) {
    const fromSubdomain = resolveStaticSalonSlug(info.subdomain);
    if (fromSubdomain) return fromSubdomain;
  }
  return resolveLocalOrStaticSalonSlug(input.pathSlug);
}
