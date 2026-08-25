# Nexora Phase 2 — Publishing + Public Website + White-Label Routing

**Date**: 2026-08-24  
**Depends on**: Phase 1-B (owner auth, templates, preview, public renderer).  
**Out of scope**: customer booking, payments, new domain tables.

## Audit (existing architecture reused)

No second website/domain table. Publication stays on:

| Concern | Source |
|---|---|
| Website row | `salon_public_websites` (`template_key`, `config`, `slug`, `is_published`, `published_at`) |
| Business | `salons` (+ `slug` mirror), `organizations` |
| Draft vs live | Provision creates **unpublished** draft; `publish_owner_salon_website` flips live |
| Slug | `private.nexora_business_slug` + `private.nexora_allocate_business_slug` (advisory lock, unique vs websites **and** salons) |
| Public read | `get_public_salon_website(p_slug)` + `get_public_salon_services(p_slug)` |
| Unpublish | `unpublish_owner_salon_website` (visibility only; `published_at` locks URL) |
| Inactive / deleted | Public RPCs require `is_published`, `salons.is_active`, `deleted_at is null` |
| White-label host | `server/hostRouting.ts` rewrite + `src/main.tsx` `extractSubdomainSlug` |
| Path public site | `/<slug>` → `PublicSalonView` → `TemplateRenderer` |
| Template after publish | `set_owner_salon_template` only; URL unchanged |

Migrations: M39 (publish/unpublish) → white-label provision → **M44–M46** (Phase 2 publish, slug, anon security) → **M49** (project `templateConfig` to public).

## Owner journey

**Login → Business Setup → Choose Template → Customize → Preview → Publish** (`src/lib/ownerFlow.ts` is the canonical step map: Login 1, Business Setup 2–8, Choose Template 9, Customize 10–11, Preview 12, Publish 13–14).

The Publish action is real: `StepPublishSetup` → `publishOwnerSalonWebsite` → `publish_owner_salon_website` RPC (readiness gate) → only a database-confirmed `is_published = true` row renders the success screen. The success URL comes from the **RPC-returned slug only**, never from a client-generated draft URL. The same screen shows the live/draft state from the database and exposes **Unpublish** through the canonical `unpublish_owner_salon_website` RPC (M39): visibility flips in Supabase, `published_at` (the URL allocation) is preserved, and local state is updated only from the RPC response. Publication is never decided from localStorage — `salon_public_websites.is_published` is the authority on load, publish, unpublish and public resolution.

Drafts are never public. Duplicate names get `name-2`. First `published_at` permanently allocates the URL.

## Public URL generation (single slug/URL system)

`Nexora Salon` → `nexora-salon` → `https://nexora-salon.nexora.site`.

One authority only:

| Concern | Source |
|---|---|
| Slug normalization (browser) | `slugifySalonName` + `suggestedWebsiteSlug` (`src/lib/publicWebsiteUrl.ts`) |
| Slug allocation (DB) | `private.nexora_business_slug` / `private.nexora_allocate_business_slug` (M44/M45) |
| White-label URL | `publicWebsiteHref` / `publicWebsiteUrl` — `<slug>.<base-host>`; `base/<slug>` fallback on localhost/IP |
| Subdomain → path | `extractSubdomainSlug` (client) / `resolveHostSlug` (server), identical results |

All six template renderers and the SEO canonical URL (`buildCanonicalUrl`) consume these helpers — no local `slugify` forks, no inline URL regexes, no second URL/domain system. `buildCanonicalUrl` prefers the RPC-allocated `publishedUrl`, then falls back to `publicWebsiteUrl(suggestedWebsiteSlug(data), brand.platform.websiteUrl)`.

## Slug collision handling (M51)

Duplicate business names never produce duplicate public URLs — uniqueness is decided and enforced **in the database**, for every writer:

| Concern | Mechanism |
|---|---|
| Deterministic sequence | `private.nexora_allocate_business_slug` → `base`, `base-1`, `base-2`, … (fixed in M51; the previous loop skipped `-1`) |
| Race safety | transaction-scoped `pg_advisory_xact_lock(hashtext(base))` serializes same-base allocations; provision/publish persist under a savepoint **retry on `unique_violation`** |
| Final DB invariant | CI unique indexes on `lower(btrim(slug))` on `salon_public_websites` **and** `salons` (M51) — reject exact, case and whitespace variants from any writer |
| Valid URL characters | URL-safe checks (`^[a-z0-9]+(-[a-z0-9]+)*$`, `NOT VALID` so legacy rows are untouched) on both slug columns |
| Update safety | first `published_at` permanently locks the URL; rename → unpublish → republish keeps it |
| Namespace | one shared slug namespace across `salon_public_websites.slug` and `salons.slug` |

Verified end-to-end: `A/B/C = nexora-salon / nexora-salon-1 / nexora-salon-2`, each resolving to exactly its own business; a direct duplicate insert is rejected by the DB (no frontend decision); `NEXORA-SALON` and `Nexora Salon!` are rejected; the 4th duplicate gets `nexora-salon-3`.

## Business name change after publishing

**Strategy implemented: immutable slug after publication** (the canonical M39/M44/M45/M51 architecture — no alias/redirect table, no second URL system).

| Moment | Behavior |
|---|---|
| First publish | Allocates the slug from the business name and sets `published_at` — the permanent URL allocation |
| Rename → republish | `published_at is not null` ⇒ `v_slug := v_existing.slug`; the URL never moves. `salons.name`/org name are updated from the draft config, and `get_public_salon_website` reads `business_name` from `salons.name` — so the **old/shared bookmark keeps resolving** at the same URL and now shows the new name |
| Unpublish → rename → republish | `published_at` and the slug survive unpublish; the same URL comes back live |
| Rename before the first publish | New slug is allowed — no public link existed yet, so nothing needs preserving |
| Template switch / visual config / draft autosave | Never write slug or name (M48 body guards + `saveOwnerWebsiteDraft` updates `config` only) |

Nothing silently changes a published public URL; there is no redirect because the slug never changes after publication.

## Public journey

`/<slug>` or `<slug>.<base-host>` → same slug → field-limited RPC → template + config → renderer. Unpublished / inactive / deleted → 404. Anon cannot SELECT draft tables.

## Verification

```sh
npm run test:phase2-publishing
npm run test:public-website
npm run test:public-security
npm run test:public-template-rendering
npm run test:publish-readiness
npm run test:owner-publish-flow
npm run test:owner-publish-real   # app publish path → real persisted row (PGlite)
npx tsx scripts/test-public-url-generation.mjs   # Nexora Salon → nexora-salon → https://nexora-salon.nexora.site
npm run test:slug-collision                       # A/B/C → nexora-salon / -1 / -2, DB-enforced uniqueness
npm run test:business-name-change                 # rename keeps the immutable public URL
npm run lint
npm run build
```
