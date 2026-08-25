import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { NEXORA_PROJECT_REF, supabaseProjectRefFromUrl } from '../shared/supabaseProject';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

interface LegacyJwtClaims {
  ref?: unknown;
  iss?: unknown;
  role?: unknown;
}

function legacyJwtClaims(value: string): LegacyJwtClaims | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as LegacyJwtClaims;
  } catch {
    throw new Error('The server Supabase service credential is an invalid JWT.');
  }
}

/** Validate project identity without ever returning/logging the credential. */
export function validateServerSupabaseProject(url: string, serviceRoleKey: string): void {
  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key') {
    throw new Error('The server Supabase service credential is not configured.');
  }
  const urlRef = supabaseProjectRefFromUrl(url);
  if (!urlRef) {
    throw new Error('The server Supabase URL must be a valid project.supabase.co URL.');
  }
  if (urlRef !== NEXORA_PROJECT_REF) {
    throw new Error(`The server Supabase URL targets project ${urlRef}, not the canonical Nexora project.`);
  }

  const claims = legacyJwtClaims(serviceRoleKey);
  if (!claims) return; // New sb_secret_* credentials are intentionally opaque.
  if (typeof claims.ref === 'string' && claims.ref !== urlRef) {
    throw new Error('The server Supabase URL and service credential target different projects.');
  }
  if (typeof claims.iss === 'string') {
    const issuerRef = supabaseProjectRefFromUrl(claims.iss);
    if (issuerRef && issuerRef !== urlRef) {
      throw new Error('The server Supabase credential issuer targets a different project.');
    }
  }
  if (claims.role !== 'service_role') {
    throw new Error('The server Supabase credential is not a service-role credential.');
  }
}

function serverSupabaseConfig(): { url: string; serviceRoleKey: string } {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) {
    throw new Error('The server Supabase connection is not configured.');
  }
  validateServerSupabaseProject(url, serviceRoleKey);
  return { url, serviceRoleKey };
}

/** Trusted server client. This module is imported only by server API code. */
export function getSupabaseAdmin(): SupabaseClient {
  const config = serverSupabaseConfig();
  const cacheKey = `${config.url}::${config.serviceRoleKey}`;
  if (cachedClient && cachedKey === cacheKey) return cachedClient;
  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-nexora-server': 'phase1a-payment/1' } },
  });
  cachedKey = cacheKey;
  return cachedClient;
}

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Validate a bearer token with Supabase Auth; never decode-and-trust locally. */
export async function requireAuthenticatedUser(req: Request): Promise<User> {
  const token = bearerToken(req);
  if (!token) throw new Error('Authentication is required.');
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new Error('The authentication session is invalid or expired.');
  return data.user;
}
