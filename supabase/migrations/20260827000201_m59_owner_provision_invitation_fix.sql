-- ============================================================================
-- M59 — Owner provisioning robustness: drop stale overload + reload schema
-- ============================================================================
--
-- ROOT CAUSE THIS GUARDS AGAINST
-- ------------------------------
-- `public.provision_owner_salon` is the single sanctioned owner-tenant
-- creator used by sign-up / login (src/lib/ownerProvisioning.ts ->
-- ensureOwnerSalon). Earlier migrations (M42) shipped a 2-argument overload
-- `(text, text)`; later migrations (M53+) replaced it with the canonical
-- 3-argument `(text, text, text)`. PostgREST exposes only ONE function per
-- name and can lock onto the stale 2-argument overload, so the browser's
-- 3-argument call returns a "function not found" / schema-cache error. On some
-- deployments that transient failure was surfaced to the owner as a misleading
-- "The workspace invitation is invalid or expired." message (owner salon
-- provisioning has no invite-token concept at all).
--
-- FIX
-- ---
--   1. Drop any leftover 2-argument overload so PostgREST exposes only the
--      canonical 3-argument function.
--   2. Re-assert the authenticated-only grant.
--   3. Reload the PostgREST schema cache so the browser sees the function
--      immediately instead of waiting out a stale cache.
--
-- This migration is additive and idempotent: it is a safe no-op when the
-- schema is already correct, and it never touches salon/organization/membership
-- data. auth.uid() remains the only authorization source.

begin;

-- 1. Remove the stale 2-argument overload that may shadow the canonical
--    (text, text, text) function in PostgREST's schema cache.
drop function if exists public.provision_owner_salon(text, text);

-- 2. Re-assert the authenticated-only grant on the canonical function.
revoke all on function public.provision_owner_salon(text, text, text)
  from public, anon;
grant execute on function public.provision_owner_salon(text, text, text)
  to authenticated;

-- 3. Ask PostgREST to reload its schema cache right away.
notify pgrst, 'reload schema';

commit;
