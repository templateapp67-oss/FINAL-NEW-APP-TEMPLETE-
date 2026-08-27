/**
 * LOCAL DEMO / PREVIEW AUTH FALLBACK.
 *
 * Purpose: when the app runs with NO Supabase backend configured at all
 * (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` absent or invalid), the
 * login and sign-up surfaces must still let a reviewer explore the product
 * smoothly instead of dead-ending with an error on submit. This module is
 * that bypass.
 *
 * HARD SAFETY RULES — do not relax these:
 *   1. The bypass is ONLY available when `isSupabaseConfigured` is false.
 *      A configured-but-unreachable deployment NEVER bypasses auth: network
 *      failures surface as "Unable to connect" and are retryable. Bypassing
 *      there would be an authentication hole.
 *   2. The bypass fabricates NO identity. `useAuth().user` stays null, no
 *      fake user id is written anywhere, and workspace code keeps resolving
 *      identity exclusively from Supabase. ProtectedApp (src/main.tsx)
 *      already renders the owner app without an auth gate in this exact
 *      unconfigured case — this module only routes users to that existing
 *      demo surface without throwing.
 *   3. Every function is exception-safe: callers may invoke them from click
 *      handlers without try/catch and will never see an unhandled rejection.
 */
import { isSupabaseConfigured } from './supabaseClient';

/** Owner demo entry point — same route ProtectedApp bypasses auth on. */
export const DEMO_OWNER_ENTRY_PATH = '/builder';

/**
 * True ONLY in the no-backend (unconfigured) case. Never true when Supabase
 * is configured, even if it is currently unreachable.
 */
export function isDemoAuthBypassAvailable(): boolean {
  return !isSupabaseConfigured;
}

/** User-facing notice explaining the preview-mode continuation. */
export function demoAuthBypassNotice(accountIntent: 'owner' | 'customer' = 'owner'): string {
  return accountIntent === 'customer'
    ? 'Supabase is not connected — continuing in local preview mode.'
    : 'Supabase is not connected — opening the workspace in local preview mode.';
}

/**
 * Smoothly continue into the local owner demo (preview) workspace.
 * Returns false (and does nothing) whenever a real backend is configured or
 * there is no browser window — callers treat that as "bypass unavailable".
 * Never throws.
 */
export function enterDemoOwnerWorkspace(target?: '/builder' | '/dashboard'): boolean {
  try {
    if (!isDemoAuthBypassAvailable()) return false;
    if (typeof window === 'undefined') return false;
    const path = target === '/dashboard' ? '/dashboard' : DEMO_OWNER_ENTRY_PATH;
    window.location.assign(path);
    return true;
  } catch (err) {
    console.error('Demo workspace continuation failed:', err);
    return false;
  }
}
