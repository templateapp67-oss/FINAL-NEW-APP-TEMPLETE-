# Phase 1-B — Final acceptance

**Status: PASS** (verified 2026-08-24)

| Criterion | Result | Evidence |
|---|---|---|
| OWNER AUTH — real signup/login | **PASS** | `useAuth.signUpWithPassword` / `signInWithPassword`; `test:phase-1b` owner-auth 14/14 |
| OWNER BUSINESS — session resolves the correct salon | **PASS** | `resolveOrProvisionOwnerSalon` + `owner_salon_ids()`; multi-tenant 11/11 |
| ONBOARDING — business setup persists in Supabase | **PASS** | `persistOwnerBusinessSetup` → `salons` + `salon_public_websites.config`; business-setup 10/10 |
| FIVE TEMPLATES — all selectable | **PASS** | `listOwnerTemplates()` five ids; owner-flow 21/21 |
| TEMPLATE CONFIG — supported visual overlay persists | **PASS** | `set_owner_salon_visual_config` + `templateConfigs`; switching 8/8 |
| TEMPLATE SWITCHING — no business-data loss | **PASS** | T1→T3→T5 sequence 7/7; white-label 16/16 |
| PREVIEW — real owner business + selected template | **PASS** | `ownerPreviewData` + owner-preview renderers; sequence preview check |
| PUBLIC RENDERING — active template + config | **PASS** | `applyPublicTemplateConfiguration`; public-website 10/10 + public-template-rendering 5/5 |
| SECURITY — tenant isolation | **PASS** | Owner A cannot mutate B; RLS multi-tenant 11/11 |
| REFRESH — survives refresh / logout / login | **PASS** | `salon_public_websites` authority; session-persistence 4/4 |
| BUILD — lint / typecheck / tests | **PASS** | `tsc --noEmit` 0; `npm run build` 0; suites above |

Deferred (not required for Phase 1-B): customer signup/login, customer booking, slot locking, Razorpay, 25% payment, webhooks, payment confirmation, refunds. See `docs/PHASE1B_OUT_OF_SCOPE.md`.

Re-run: `npm run test:phase-1b && npm run test:template-switching && npm run test:multi-tenant && npm run lint && npm run build`
