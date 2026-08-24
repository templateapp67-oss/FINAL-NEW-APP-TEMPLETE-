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

Login → business setup → template + config → preview → **explicit publish** (`StepPublishSetup` → `publishOwnerSalonWebsite` → readiness gate) → success URL from **RPC slug** only.

Drafts are never public. Duplicate names get `name-2`. First `published_at` permanently allocates the URL.

## Public journey

`/<slug>` or `<slug>.<base-host>` → same slug → field-limited RPC → template + config → renderer. Unpublished / inactive / deleted → 404. Anon cannot SELECT draft tables.

## Verification

```
npm run test:phase2-publishing
npm run test:public-website
npm run test:public-security
npm run test:public-template-rendering
npm run test:publish-readiness
npm run test:owner-publish-flow
npm run lint
npm run build
```
