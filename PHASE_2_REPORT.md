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
npm run lint
npm run build
```
