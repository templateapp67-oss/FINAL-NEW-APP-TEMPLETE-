import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NEXORA_PROJECT_REF } from '../../shared/supabaseProject';
export { NEXORA_PROJECT_REF } from '../../shared/supabaseProject';

/**
 * NEXORA SHARED SUPABASE CLIENT (single browser client — the only one).
 *
 * Authenticated location synchronization, Owner workspace, public website
 * resolution, guest bookings and every other data path read/write through
 * THIS client. There is no second client, no duplicate auth system.
 *
 * Browser credentials come from deployment env vars and are NEVER hard-coded:
 *   VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Vite exposes only VITE_* variables to the browser, but several existing
 * Nexora deploys/documentation paths still provide NEXT_PUBLIC_* names. We
 * accept both aliases and validate that any real *.supabase.co URL points to
 * the canonical Nexora project. The anon key is the public API key (safe for
 * browsers). No service_role key, no private secret, no token/password handling
 * lives here.
 */

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

const url = (env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const anonKey = (env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

function projectRef(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return 'unconfigured';
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'unknown';
  } catch {
    return 'invalid';
  }
}

function isSupabaseCloudUrl(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    return new URL(supabaseUrl).hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

/** Best-effort mismatch check for legacy JWT anon keys. Publishable keys are opaque. */
function anonKeyProjectRef(publicKey: string | undefined): string | null {
  if (!publicKey || publicKey.split('.').length < 3) return null;
  try {
    const payload = JSON.parse(atob(publicKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

const urlProjectRef = projectRef(url);
const anonProjectRef = anonKeyProjectRef(anonKey);
const pointsToWrongSupabaseProject =
  isSupabaseCloudUrl(url) && urlProjectRef !== NEXORA_PROJECT_REF;
const anonKeyUrlMismatch =
  isSupabaseCloudUrl(url) && anonProjectRef !== null && anonProjectRef !== urlProjectRef;

export const supabaseConfigError: string | null = (() => {
  if (!url || !anonKey) {
    return 'Authentication is not configured. Set VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.';
  }
  if (urlProjectRef === 'invalid') return 'Supabase URL is invalid.';
  if (url.includes('your-project.supabase.co') || anonKey.includes('your-anon-public-key')) {
    return 'Authentication is using placeholder Supabase configuration.';
  }
  if (pointsToWrongSupabaseProject) {
    return 'Authentication is connected to the wrong Supabase project.';
  }
  if (anonKeyUrlMismatch) {
    return 'Supabase URL and anon key belong to different projects.';
  }
  return null;
})();

export const isSupabaseConfigured = supabaseConfigError === null;

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
  ? createClient(url, anonKey, {
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
      supabaseConfigError ||
        'Supabase is not configured. Set VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}
