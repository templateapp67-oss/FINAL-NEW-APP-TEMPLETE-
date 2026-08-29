/**
 * Node-side entry point for the canonical Supabase project identity.
 *
 * The implementation lives in `src/lib/supabaseProject.ts` because the frontend
 * bundle may only import from inside `src/`: deploy and artifact pipelines copy
 * the app subtree into a nested directory, so a `../../shared/...` import from
 * `src/lib/` escapes that copy and fails to resolve.
 *
 * This module exists so trusted Node consumers (`server/`, `scripts/`) keep
 * importing from `shared/` exactly as before, while both runtimes read from a
 * single source of truth and can never drift apart.
 *
 * The `.ts` extension is required in the specifier: `scripts/` is run through
 * both `tsx` and Node's native TypeScript type-stripping, and plain Node ESM
 * does not resolve extensionless relative imports.
 */
export * from '../src/lib/supabaseProject.ts';
