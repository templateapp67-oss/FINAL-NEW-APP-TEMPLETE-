/**
 * CLIENT-SIDE CUSTOM DOMAIN (CNAME) ROUTING.
 *
 * The Vite/React equivalent of a Next.js `middleware.ts` host rewrite. When a
 * browser arrives on a hostname that is not the platform base host (for
 * example `www.artsbyuma.com`), this module asks the database which published
 * salon owns that host and maps it to the tenant's canonical slug.
 *
 * Trust model — the important part:
 *   * The lookup goes through `public.resolve_public_salon_by_domain` (M69),
 *     which is `security definer`, granted to `anon`, and returns a row ONLY
 *     when the domain status is `verified` AND the site is published AND the
 *     salon is active AND its template is active.
 *   * An unverified domain resolves to nothing. A tenant therefore cannot
 *     serve their site from a hostname they have not proven they control, and
 *     a pending/typo'd domain can never hijack another tenant's site.
 *   * The mapping is cached in memory for the page load only and is never
 *     read back from any client-writable store.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidCustomDomain,
  isReservedHost,
  looksLikeCustomDomainHost,
  normalizeCustomDomain,
} from './customDomain';

/** Re-exported so the router imports everything from one module. */
export { looksLikeCustomDomainHost };

export interface CustomDomainMapping {
  slug: string;
  templateKey: string | null;
  customDomain: string;
}

/**
 * In-memory host → slug map for the current page load. Deliberately NOT
 * persisted: routing/identity data must never survive a reload in any
 * client-writable store, or a hand-edited entry could point a hostname at
 * another tenant's site.
 */
const sessionMappings = new Map<string, CustomDomainMapping>();

/** Top-level guard so a hostile hostname can never be used as a lookup key. */
function safeHost(value: unknown): string | null {
  const host = normalizeCustomDomain(value);
  if (!host) return null;
  if (!isValidCustomDomain(host) || isReservedHost(host)) return null;
  return host;
}

/**
 * Resolves a hostname to its published salon via the database.
 * Returns `null` for any host that is not a verified, published custom domain.
 */
export async function resolveCustomDomainSalon(
  supabase: SupabaseClient,
  hostname: string,
): Promise<CustomDomainMapping | null> {
  const host = safeHost(hostname);
  if (!host) return null;

  // Reuse the mapping already resolved during this page load.
  const cached = sessionMappings.get(host);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.rpc('resolve_public_salon_by_domain', {
      p_host: host,
    });

    if (error) {
      // Missing function = M69 not applied yet. Not an error worth surfacing;
      // the caller simply falls through to path/slug routing.
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const slug = typeof row?.slug === 'string' ? row.slug.trim() : '';
    if (!slug) return null;

    const mapping: CustomDomainMapping = {
      slug,
      templateKey: typeof row?.template_key === 'string' ? row.template_key : null,
      customDomain: typeof row?.custom_domain === 'string' ? row.custom_domain : host,
    };
    sessionMappings.set(host, mapping);
    return mapping;
  } catch {
    return null;
  }
}

/** Records an already-resolved mapping (used by the router after a lookup). */
export function rememberCustomDomainMapping(
  hostname: string,
  slug: string,
  templateKey: string | null = null,
): void {
  const host = safeHost(hostname);
  if (!host || !slug) return;
  sessionMappings.set(host, { slug, templateKey, customDomain: host });
}

/** Reads a mapping resolved earlier in this page load. */
export function getCustomDomainMapping(hostname?: string): CustomDomainMapping | null {
  const host = safeHost(
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''),
  );
  if (!host) return null;
  return sessionMappings.get(host) ?? null;
}

/** Clears cached mappings (used when the owner signs out or changes domain). */
export function clearCustomDomainMappings(): void {
  sessionMappings.clear();
}
