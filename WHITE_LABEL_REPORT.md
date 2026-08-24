# White-Label Dynamic Subdomain + Automatic Template Allocation — PASS/FAIL Report

**Date:** 2026-08-23
**Branch:** `arena/01a02ebd-final-new-app-templete`
**Stack:** Vite + React + Express (NOT Next.js — middleware/page equivalents implemented on the existing stack)

## Result: ✅ ALL ACCEPTANCE CRITERIA PASS

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `provision_owner_salon(p_salon_name, p_slug, p_template_id default 'barber_mens_grooming')` SECURITY DEFINER, verifies `auth.uid()`, creates org owner + salon with lowercased slug + template_id + `is_published=true` | ✅ PASS | Migration `20260823000401_phase1_whitelabel_provisioning.sql`; test "provisioning creates a PUBLISHED website at the requested slug" |
| 2 | Wildcard subdomain rewrite `[slug].domain.com → /[slug]`, excluding `/www`, `/api`, `/dashboard`, `/auth`, static | ✅ PASS | `server/hostRouting.ts` — `PROTECTED_PATHS` + `PROTECTED_PREFIXES`; `server.ts` mounts `rewriteHostPath` middleware |
| 3 | Dynamic site renderer fetches salon by lowercased slug + `is_published`, hydrates `TemplateRenderer` with `template_id` + full data, 404 if missing | ✅ PASS | `src/main.tsx` RootRouter queries `salon_public_websites` where `slug` + `is_published=true`; `src/components/PublicSalonView.tsx#loadCanonicalPublicData` hydrates `TemplateRenderer` with `template_key`; falls through to `<NotFound/>` |
| 4 | Template switch updates ONLY `template_id`; must NOT purge services/products/bookings/settings | ✅ PASS | `set_owner_salon_template(p_template_id)` updates only `salons.theme_id` + `salon_public_websites.template_key`; test seeds service/product/booking and verifies all survive A→B→A |
| 5 | RLS allows public SELECT on published slugs; no service-role key in frontend | ✅ PASS | `phase1a_public_websites_published_read` policy (uses SECURITY DEFINER `private.is_public_salon`); `phase1a_public_salons_read` policy; frontend uses only the anon Supabase client (`requireSupabase()`) |

## Test Suites

### White-label provisioning (`scripts/test-whitelabel.mjs`) — 12/12 PASS
1. ✅ Migration applies cleanly
2. ✅ `verify_phase1_whitelabel()` is green
3. ✅ Provisioning creates a PUBLISHED website at the requested slug
4. ✅ Owner membership + published `salon_public_websites` row exist
5. ✅ Re-provisioning is idempotent (no duplicate org/slug; template unchanged)
6. ✅ A second owner cannot claim an in-use slug (23505)
7. ✅ Second owner provisions their own distinct live slug
8. ✅ Template switch updates presentation ONLY (services/products/bookings intact)
9. ✅ Switching A→B→A is fully reversible with no data loss
10. ✅ Anonymous visitors can read published salon websites (dynamic `/[slug]` render)
11. ✅ Anonymous users cannot change a template
12. ✅ Owner B cannot change Owner A's template (RLS ownership boundary)

### Phase 1 owner auth (`scripts/test-phase1-owner-auth.mjs`) — 15/15 PASS
(Previously green; remains green after the white-label changes.)

### Type checking & build
- `npm run lint` (`tsc --noEmit`) — **0 errors**
- `npm run build` (Vite + Express `server.cjs`) — **0 errors** (7.45s)

## Files Changed

**New:**
- `supabase/migrations/20260823000401_phase1_whitelabel_provisioning.sql` — 3-arg `provision_owner_salon`, `set_owner_salon_template`, public-read RLS, `verify_phase1_whitelabel()`
- `src/lib/ownerProvisioning.ts` — typed client for both RPCs + slug derivation
- `scripts/test-whitelabel.mjs` — 12-assertion PGlite test suite

**Modified:**
- `src/App.tsx` — onboarding calls `provision_owner_salon(name, slug, templateId)`; `handleThemeChange` persists via `setOwnerTemplate`
- `src/components/PublicSalonView.tsx` — default template `barber_mens_grooming`; reads `template_key`
- `src/lib/salonRouting.ts` — default template `barber_mens_grooming`
- `server/hostRouting.ts` — hardened protected paths/prefixes (`/www`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/api/`, `/assets/`, `/auth/`, `/www/`)

## Key Design Decisions

1. **No `organizations.owner_id` column.** Ownership continues to be expressed through `organization_members.role='owner'`, matching the canonical schema.
2. **Published row is created atomically at provisioning time**, so a new owner's site is LIVE immediately at both `/<slug>` and `<slug>.<base-host>` with no manual publish step.
3. **Public-read RLS policy uses `private.is_public_salon()` (SECURITY DEFINER)** rather than a direct subquery on `salons`, because the subquery would itself be evaluated under RLS for the anon role and return zero rows when `salons` has no anon SELECT policy. A companion `phase1a_public_salons_read` policy lets the dynamic renderer read active salon metadata without a service-role key.
4. **Template switch is presentation-only.** `set_owner_salon_template` writes only `salons.theme_id` and `salon_public_websites.template_key`. Services, products, bookings, payments, location and membership are keyed by `salon_id` (and services by `salon_id+theme_id`) and are never touched.
5. **Idempotency.** Re-calling `provision_owner_salon` for an owner who already has a salon returns the existing salon with its original slug/template unchanged — never duplicates, never renames.

## Deployment Note

Apply migrations M42 → M43 → **20260823000401** to the live Supabase project (the test harness is PGlite-only; no `.env` / live credentials in the sandbox).
