/**
 * SERVER-SIDE CUSTOM DOMAIN (CNAME) VERIFICATION.
 *
 * PostgreSQL cannot perform DNS lookups, so the platform server is the only
 * place that can honestly confirm a tenant controls a hostname. This module is
 * that probe.
 *
 * Design rules:
 *   - Runs ONLY on the server, only for an authenticated owner, and only for a
 *     salon they own (the route in `api-routes.ts` enforces both).
 *   - Never trusts the browser's claim about DNS state.
 *   - A failure is a normal outcome ('failed'), not a crash — DNS is often
 *     temporarily unresolvable while a record propagates.
 *   - Two accepted proofs of control:
 *       1. CNAME (or A) pointing at the platform base host  — the normal case
 *       2. TXT record `nexora-verify=<salonId>`             — the fallback for
 *          registrars that flatten CNAMEs or for apex domains
 *
 * The result is written by `mark_custom_domain_status`, which is granted to
 * `service_role` only, so an owner can never self-verify.
 */
import { promises as dns } from 'node:dns';
import {
  isValidCustomDomain,
  isReservedHost,
  normalizeCustomDomain,
} from '../src/lib/customDomain';
import { getBrandBaseHost } from '../src/lib/salonRouting';

/** DNS lookups must not hang a request. */
const DNS_TIMEOUT_MS = 4000;

/** TXT record prefix a tenant may publish to prove ownership. */
export const VERIFY_TXT_PREFIX = 'nexora-verify=';

export interface DnsProbeResult {
  verified: boolean;
  /** Operator/user-facing explanation. Never contains raw resolver errors. */
  detail: string;
  method?: 'cname' | 'a' | 'txt';
}

interface Resolver {
  resolveCname(hostname: string): Promise<string[]>;
  resolve4(hostname: string): Promise<string[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
}

/** Wraps a lookup so a slow or broken resolver cannot stall the request. */
async function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), DNS_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Probes whether `domain` points at this platform and/or carries the
 * ownership TXT record for `salonId`.
 */
export async function probeCustomDomainDns(
  domain: string,
  salonId: string,
  resolver: Resolver = dns as unknown as Resolver,
): Promise<DnsProbeResult> {
  const host = normalizeCustomDomain(domain);

  if (!host || !isValidCustomDomain(host) || isReservedHost(host)) {
    return { verified: false, detail: 'That is not a domain you can connect to this website.' };
  }

  const target = normalizeCustomDomain(getBrandBaseHost()) || '';

  // ---- 1. CNAME proof: <host> CNAME <platform base host> -------------------
  let cnames: string[] = [];
  try {
    cnames = await withTimeout(resolver.resolveCname(host), [] as string[]);
  } catch {
    cnames = [];
  }

  const normalisedCnames = cnames
    .map((value) => normalizeCustomDomain(value))
    .filter((value): value is string => !!value);

  if (target && normalisedCnames.some((value) => value === target || value.endsWith(`.${target}`))) {
    return {
      verified: true,
      method: 'cname',
      detail: `CNAME points at ${target}.`,
    };
  }

  // ---- 2. A-record proof: <host> A <same address as the platform host> -----
  if (target) {
    let tenantAddresses: string[] = [];
    let platformAddresses: string[] = [];
    try {
      tenantAddresses = await withTimeout(resolver.resolve4(host), [] as string[]);
    } catch {
      tenantAddresses = [];
    }
    try {
      platformAddresses = await withTimeout(resolver.resolve4(target), [] as string[]);
    } catch {
      platformAddresses = [];
    }

    const shared = tenantAddresses.find((address) => platformAddresses.includes(address));
    if (shared) {
      return {
        verified: true,
        method: 'a',
        detail: `A record points at ${shared}, the same address as ${target}.`,
      };
    }
  }

  // ---- 3. TXT proof: <host> TXT "nexora-verify=<salonId>" ------------------
  let txtRecords: string[][] = [];
  try {
    txtRecords = await withTimeout(resolver.resolveTxt(host), [] as string[][]);
  } catch {
    txtRecords = [];
  }

  const expected = `${VERIFY_TXT_PREFIX}${salonId}`;
  const flattened = txtRecords
    .map((chunks) => chunks.join(''))
    .map((value) => value.trim().toLowerCase());

  if (flattened.includes(expected.toLowerCase())) {
    return {
      verified: true,
      method: 'txt',
      detail: 'Ownership TXT record found.',
    };
  }

  // ---- Nothing matched -----------------------------------------------------
  const hint = target
    ? `Point ${host} at ${target} (CNAME or A record), or add a TXT record "${expected}".`
    : `Add a TXT record "${expected}" to ${host}.`;

  return {
    verified: false,
    detail: `We could not confirm ${host} yet. ${hint} DNS changes can take up to 48 hours to spread.`,
  };
}
