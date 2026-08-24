# Nexora Phase 1-B: Owner Onboarding + Templates

**Date**: 2026-08-24  
**Depends on**: Phase 1-A audit (`PHASE_1A_AUDIT_REPORT.md`) — **no new tables**.

## Product flow (owner-side only)

1. Sign up / log in (`SignUpPage`, `HeroSplit`)
2. Provision tenant via existing `provision_owner_salon` (`resolveOrProvisionOwnerSalon`)
3. Business setup (`StepDetails`) — name + **5-template picker**
4. Template style + **template config** (`StepTemplate` + `TemplateConfigPanel`)
5. Switch templates anytime via `set_owner_salon_template` (presentation only)

Customer booking/payment UI was **not** changed in this phase.

## Canonical architecture reused

| Concern | Existing source |
|---|---|
| Auth / profiles | `profiles.platform_role`, M36 |
| Org / salon | `organizations` → `organization_members` (owner) → `salons` |
| Template key | `salon_public_websites.template_key` + `salons.theme_id` |
| Template config | `salon_public_websites.config` JSONB |
| Slug / publish | `allocate_public_slug`, `publish_owner_salon_website` |
| Switch RPC | `set_owner_salon_template` |
| RLS | `owner_salon_ids()`, `can_manage_salon_settings()` |

## Five templates

1. `barber_mens_grooming`
2. `hair_studio_color_bar`
3. `beauty_skin_spa`
4. `family_full_service`
5. `nail_lash_studio`

## Template config

Stored as `config.templateConfig` (appearance, accent, fonts, hero crop, owner photo).  
Switching templates does **not** clear services, packages, team, gallery, or bookings.

## Files

- `src/lib/templateConfig.ts`
- `src/components/TemplateConfigPanel.tsx`
- `src/screens/StepDetails.tsx`, `StepTemplate.tsx`, `Landing.tsx`
- `src/App.tsx`, `src/types.ts`, `src/lib/salonWebsiteService.ts`
- `src/components/SignUpPage.tsx`
- `scripts/test-phase1b-owner-flow.mjs`
