/**
 * CUSTOM DOMAIN (CNAME) HELPERS.
 *
 * Lets a tenant point their own hostname — e.g. `www.artsbyuma.com` — at their
 * published salon site instead of the platform subdomain or the
 * `base/<slug>` path form.
 *
 * IMPORTANT: this module is presentation-only validation. The DATABASE is the
 * authority: `private.nexora_is_valid_domain` (M69) re-checks every value, a
 * case-insensitive unique index prevents two tenants claiming one host, and
 * `public.resolve_public_salon_by_domain` only ever resolves a domain whose
 * status is `verified` AND whose site is published.
 *
 * Verification is deliberately a two-step flow:
 *   1. the owner saves the domain            → status becomes 'pending'
 *   2. the platform edge probes the DNS and
 *      calls `mark_custom_domain_status`     → status becomes 'verified'
 * An unverified domain resolves to nothing, so a tenant can never serve their
 * site from a hostname they have not proven they control.
 */
import { getBrandBaseHost } from './salonRouting';

/** Longest hostname we accept (RFC 1035 FQDN limit). */
export const CUSTOM_DOMAIN_MAX_LENGTH = 253;

/** Hostnames that must never be claimed as a tenant's custom domain. */
const RESERVED_HOST_SUFFIXES = [
  'vercel.app',
  'vercel.dev',
  'e2b.app',
  'e2b.dev',
  'netlify.app',
  'herokuapp.com',
  'localhost',
];

/** Rejects protocols, paths, ports, credentials, IP literals and single labels. */
const DOMAIN_PATTERN =
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type CustomDomainStatus = 'not_configured' | 'pending' | 'verified' | 'failed';

/**
 * Normalises user input into a bare hostname:
 *
 *   '  HTTPS://WWW.Example.com/about?x=1 ' → 'www.example.com'
 *   'example.com:8443'                     → 'example.com'
 *   'user@example.com'                     → 'example.com'
 *   '' / null / undefined                  → null
 *
 * Mirrors `private.nexora_normalize_domain` exactly, so the browser and the
 * database can never disagree about what was submitted.
 */
export function normalizeCustomDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let host = value.trim().toLowerCase();
  if (!host) return null;

  // Strip scheme, path, query, fragment, port and credentials.
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split('/')[0];
  host = host.split('?')[0];
  host = host.split('#')[0];
  host = host.split(':')[0];
  if (host.includes('@')) host = host.split('@').slice(-1)[0];

  // Trim surrounding dots/whitespace (FQDN form `example.com.`).
  host = host.replace(/^[\s.]+|[\s.]+$/g, '');
  return host || null;
}

/** Structural validity check (shape only — not ownership). */
export function isValidCustomDomain(value: unknown): boolean {
  const host = normalizeCustomDomain(value);
  return host !== null && DOMAIN_PATTERN.test(host);
}

/**
 * True when the hostname belongs to the platform itself (or to a hosting
 * provider) and therefore cannot be a tenant's own domain.
 */
export function isReservedHost(value: unknown): boolean {
  const host = normalizeCustomDomain(value);
  if (!host) return true;
  if (RESERVED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }
  const base = normalizeCustomDomain(getBrandBaseHost());
  return !!base && (host === base || host.endsWith(`.${base}`));
}

export interface CustomDomainProblem {
  code: 'empty' | 'too-long' | 'invalid' | 'reserved' | 'platform';
  message: string;
}

/** Validates a domain for the owner UI. Empty array = acceptable. */
export function validateCustomDomain(value: unknown): CustomDomainProblem[] {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];

  if (raw.length > CUSTOM_DOMAIN_MAX_LENGTH) {
    return [{ code: 'too-long', message: `Domain names are limited to ${CUSTOM_DOMAIN_MAX_LENGTH} characters.` }];
  }

  const host = normalizeCustomDomain(raw);
  if (!host || !DOMAIN_PATTERN.test(host)) {
    return [{ code: 'invalid', message: 'Enter a full domain name, like www.yoursalon.com.' }];
  }
  if (isReservedHost(host)) {
    return [{ code: 'reserved', message: 'That address is managed by the platform. Use a domain you own.' }];
  }
  return [];
}

/**
 * True when the browser is currently being served from a host that is NOT the
 * platform base host — i.e. a candidate custom domain. Preview/sandbox hosts
 * and bare IP addresses are excluded so local development is unaffected.
 */
export function looksLikeCustomDomainHost(hostname?: string): boolean {
  const host = normalizeCustomDomain(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''));
  if (!host) return false;
  if (isReservedHost(host)) return false;
  // A bare IP or a single-label host (e.g. 'localhost') is not a custom domain.
  if (!host.includes('.') || /^\d+(\.\d+){3}$/.test(host)) return false;
  return true;
}

/** The DNS record the tenant must create, for display in the owner UI. */
export interface DnsInstructions {
  type: 'CNAME' | 'A';
  host: string;
  value: string;
}

export function dnsInstructions(domain: unknown, target?: string): DnsInstructions | null {
  const host = normalizeCustomDomain(domain);
  if (!host) return null;
  // Apex domains cannot use CNAME at the zone root under many registrars, so
  // the platform target is offered as an A record for bare (non-www) hosts.
  const isApex = host.split('.').length === 2;
  return {
    type: isApex ? 'A' : 'CNAME',
    host: isApex ? '@' : host.replace(/\.$/, ''),
    value: target || normalizeCustomDomain(getBrandBaseHost()) || 'your-platform-domain.com',
  };
}

/** Human-readable status copy for the owner UI. */
export function customDomainStatusLabel(status: CustomDomainStatus | undefined | null): string {
  switch (status) {
    case 'verified':
      return 'Connected';
    case 'pending':
      return 'Waiting for DNS';
    case 'failed':
      return 'DNS check failed';
    default:
      return 'Not connected';
  }
}
