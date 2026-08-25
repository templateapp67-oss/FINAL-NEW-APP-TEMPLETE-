import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * NEXORA SHARED SUPABASE CLIENT (single browser client — the only one).
 *
 * Authenticated location synchronization, Owner workspace, public website
 * resolution, guest bookings and every other data path read/write through
 * THIS client. There is no second client, no duplicate auth system.
 *
 * Credentials come from Vite env vars and are NEVER hard-coded:
 *   VITE_SUPABASE_URL       -> https://qwaehqsmodekbgvnaavz.supabase.co
 *   VITE_SUPABASE_ANON_KEY  -> existing secure project anon key (public only)
 *
 * The anon key is the public API key (safe for browsers). No service_role
 * key, no private secret, no token/password handling lives here.
 */

export const NEXORA_PROJECT_REF = 'qwaehqsmodekbgvnaavz';

/**
 * Universal Nexora auth storage key. PKCE verifier + session are persisted
 * under exactly this key so sign-ins survive reloads, and so every Nexora
 * app shares one session namespace per project.
 */
export const NEXORA_AUTH_STORAGE_KEY = 'nexora.auth.qwaehqsmodekbgvnaavz';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : typeof process !== 'undefined' && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};

const url = env.VITE_SUPABASE_URL?.trim();
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

function projectRef(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return 'unconfigured';
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'unknown';
  } catch {
    return 'invalid';
  }
}

export const isSupabaseConfigured = Boolean(
  url &&
  anonKey &&
  projectRef(url) !== 'invalid' &&
  !url.includes('your-project.supabase.co') &&
  !anonKey.includes('your-anon-public-key'),
);

/**
 * Shared Supabase client configured exactly for the universal Nexora PKCE
 * flow:
 *   storageKey: 'nexora.auth.qwaehqsmodekbgvnaavz'
 *   persistSession: true    — session survives reloads
 *   autoRefreshToken: true  — TOKEN_REFRESHED keeps sessions alive
 *   detectSessionInUrl: true — PKCE code exchange on /auth/callback
 *   flowType: 'pkce'        — authorization-code + PKCE, never implicit
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: NEXORA_AUTH_STORAGE_KEY,
      },
      global: { headers: { 'x-nexora-client': 'template-app/phase1a' } },
    })
  : null;

/** Throws a readable error rather than letting `null` propagate. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}
