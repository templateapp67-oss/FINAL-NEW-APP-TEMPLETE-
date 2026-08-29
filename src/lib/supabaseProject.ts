/**
 * Canonical Supabase project identity for the Nexora app.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH. It lives inside `src/` on purpose:
 * the frontend bundle must never import from outside `src/`. Some deploy
 * and artifact pipelines copy only the app subtree (e.g. `src/`, `index.html`,
 * `vite.config.ts`) into a nested directory, so a `../../shared/...` import
 * from `src/lib/` escapes that copy and fails to resolve at build time.
 *
 * Node-side consumers (server + scripts) import the same values through the
 * `shared/supabaseProject.ts` compat re-export, which points back here, so
 * the browser and the server can never drift apart.
 */

/** Canonical Supabase project shared by browser and trusted server config. */
export const NEXORA_PROJECT_REF = 'qwaehqsmodekbgvnaavz';

export function supabaseProjectRefFromUrl(value: string): string | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const suffix = '.supabase.co';
    if (!hostname.endsWith(suffix)) return null;
    const ref = hostname.slice(0, -suffix.length);
    return /^[a-z0-9]{20}$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}
