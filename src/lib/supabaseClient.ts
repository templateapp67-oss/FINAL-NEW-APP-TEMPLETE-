/**
 * DEPRECATED IMPORT PATH — see src/lib/supabase.ts.
 *
 * This module is kept as the single compatibility re-export of the one shared
 * Nexora Supabase client so existing screens/services keep working unchanged.
 * The client, its PKCE auth configuration and its env-driven credentials
 * (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are defined exactly ONCE in
 * src/lib/supabase.ts; no second client exists. New code should import from
 * src/lib/supabase.ts (or '@lib' alias) directly.
 *
 * Credentials are supplied by Vite env vars only — never hard-coded:
 *   VITE_SUPABASE_URL      => https://qwaehqsmodekbgvnaavz.supabase.co
 *   VITE_SUPABASE_ANON_KEY => existing secure project anon key (public only)
 */

export {
  supabase,
  isSupabaseConfigured,
  requireSupabase,
  NEXORA_AUTH_STORAGE_KEY,
  NEXORA_PROJECT_REF,
  supabaseConfigIssue,
} from './supabase';
