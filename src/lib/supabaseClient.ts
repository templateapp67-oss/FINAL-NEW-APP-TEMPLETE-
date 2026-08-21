import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client (anon/public key only — never a service_role key).
 *
 * Credentials come from Vite env vars so they are never hard-coded:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * If they are absent the client is null and callers surface a clear message
 * instead of crashing the app.
 */

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

export const NEXORA_AUTH_STORAGE_KEY = `nexora.auth.${projectRef(url)}`;
export const isSupabaseConfigured = Boolean(url && anonKey && projectRef(url) !== 'invalid');

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
