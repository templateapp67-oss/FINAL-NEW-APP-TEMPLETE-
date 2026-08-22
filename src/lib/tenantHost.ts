/**
 * Multi-tenant host / subdomain resolution for the white-label platform.
 *
 * Tenants can be addressed three ways:
 *   1. Subdomain  — `royal-hair-studio.<platform-domain>`
 *   2. Custom domain — `royalhairstudio.in` (DNS A/CNAME -> platform)
 *   3. Slug path  — `<platform-domain>/royal-hair-studio`
 *
 * This module extracts the tenant key from the request host so the client
 * router (`main.tsx`) and the slug lookup can resolve a tenant without any
 * per-tenant DNS configuration. Wildcard DNS (`*.<platform-domain>`) is added
 * at the host provider; here we only classify the incoming hostname.
 */

import { getBrandConfig } from '../config/brandConfig';
import { websiteHost } from './publicWebsiteUrl';

function envValue(name: string): string | undefined {
  const env: Record<string, string | undefined> =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : typeof process !== 'undefined' && process.env
        ? (process.env as Record<string, string | undefined>)
        : {};
  return env[name];
}

/**
 * The platform apex domain this deployment serves, used to split the request
 * host into "subdomain + platform" vs "custom domain". Prefer the
 * `VITE_PUBLIC_ROOT_DOMAIN` env var (multi-domain / preview-safe); fall back
 * to the configured platform website URL host.
 */
export function platformRootDomain(): string {
  return normalizeHost(envValue('VITE_PUBLIC_ROOT_DOMAIN') || websiteHost(getBrandConfig().platform.websiteUrl));
}

/** Subdomain labels that always route to the platform itself, never a tenant. */
export const SYSTEM_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'dashboard', 'builder', 'docs', 'mail',
  'blog', 'assets', 'static', 'cdn', 'status', 'support',
]);

export interface TenantHostInfo {
  /** Normalized host (lowercase, port + trailing dot stripped). */
  hostname: string;
  /** Platform apex domain this deployment serves (from config). */
  baseDomain: string;
  /** Tenant subdomain label(s), e.g. `royal-hair-studio`; null on apex/custom. */
  subdomain: string | null;
  /** Full host when it is not on the platform domain (a custom domain). */
  customDomain: string | null;
}

/** Lowercase + strip port and trailing dot from a hostname. */
export function normalizeHost(hostname: string | null | undefined): string {
  return (hostname || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

function isIpHost(host: string): boolean {
  return (
    host.startsWith('127.')
    || host.startsWith('0.')
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    || host.includes(':') // IPv6 (e.g. ::1)
  );
}

/**
 * Classify a request hostname against the platform's base domain.
 *
 * - `nexora.site`                    -> apex (no tenant)
 * - `www.nexora.site`                -> apex (system subdomain)
 * - `royal-hair-studio.nexora.site`  -> subdomain `royal-hair-studio`
 * - `royalhairstudio.in`             -> custom domain
 * - `localhost` / `127.0.0.1`        -> apex (local dev)
 * - `royal-hair-studio.localhost`    -> subdomain `royal-hair-studio` (local dev)
 */
export function resolveTenantHost(
  hostname: string | null | undefined,
  baseDomain?: string | null,
): TenantHostInfo {
  const host = normalizeHost(hostname);
  const base = normalizeHost(baseDomain || platformRootDomain());
  const empty: TenantHostInfo = { hostname: host, baseDomain: base, subdomain: null, customDomain: null };
  if (!host) return empty;

  // Local development: bare loopback has no tenant; `<name>.localhost` /
  // `<name>.local` behaves like a wildcard subdomain for local testing.
  if (host === 'localhost' || isIpHost(host)) return empty;
  if (host.endsWith('.localhost') || host.endsWith('.local')) {
    const first = host.split('.')[0];
    const subdomain = first && first !== 'localhost' && !SYSTEM_SUBDOMAINS.has(first) ? first : null;
    return { hostname: host, baseDomain: base, subdomain, customDomain: null };
  }

  if (host === base) return empty;
  if (host.endsWith(`.${base}`)) {
    const left = host.slice(0, -(base.length + 1));
    const subdomain = left && !SYSTEM_SUBDOMAINS.has(left) ? left : null;
    return { hostname: host, baseDomain: base, subdomain, customDomain: null };
  }

  // Not on the platform domain at all: treat the whole host as a custom domain.
  return { hostname: host, baseDomain: base, subdomain: null, customDomain: host };
}

/** Convenience: the tenant key a host implies, if any. */
export function tenantKeyFromHost(
  hostname: string | null | undefined,
  baseDomain?: string | null,
): string | null {
  const info = resolveTenantHost(hostname, baseDomain);
  return info.subdomain || info.customDomain;
}
