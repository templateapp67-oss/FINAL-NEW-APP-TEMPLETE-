# Phase 9.1 — Offers, Discounts, Pricing & Combos

> Status: **complete** (draft SQL; M24 has not been applied to any database).
> Scope: all five database-backed themes. Existing service rows and the original
> `hair` theme remain preserved.

## Delivered

### Offers and seasonal promotions

`public.service_offers` stores tenant- and theme-scoped offers with exactly one
of these targets:

- entire theme;
- category;
- predefined service;
- saved custom service;
- combo/bundle.

Every target relationship includes `theme_id`; saved-service and bundle targets
also include `business_id`. Composite foreign keys plus RPC validation reject
cross-theme and cross-salon links.

Offers support percentage or fixed discounts, title, promotional badge, start
and end dates, and active/inactive state. `nexora_offer_effective_status()` is
evaluated using the database `current_date` on every management/public read.
Ended offers are returned as `expired` and are never applied by the client,
without requiring a browser timer or scheduler.

### Promotional badges

Service cards support direct badges (`20% OFF`, `Festive Special`, `Best Seller`,
`New`, `Limited Time`, `Premium`) plus custom offer badges. The shared
`PromotionalPricing` renderer resolves applicable active offers and displays the
badge only on the matching service or bundle. It is used by every theme
renderer, the live preview, and booking selection.

### Variable pricing

`public.service_price_variants` stores named options such as Short / Medium /
Long Hair, Junior / Senior Stylist, Basic / Premium, or any custom variation.
A composite FK references the existing saved service. Variant writes do not
update `services.theme_id`, `category_id`, `predefined_service_id`, or base
`price_paise`; the base relationship and price remain intact.

The booking preview lets customers choose a variant and calculates the advance
from the selected, offer-adjusted price.

### Combo/bundle services

Phase 9.1 extends the existing canonical `packages` / `package_services` model
instead of introducing a duplicate bundle table. New theme bundles preserve:

- business and theme;
- optional validated category;
- included saved-service IDs;
- service name, individual price, and duration snapshots;
- original subtotal;
- percentage/fixed discount;
- calculated final price;
- badge and active/inactive status.

Bundle creation is atomic and requires at least two active services from the
same tenant and theme. It never deletes or rewrites included services.

## Application integration

- `src/lib/pricingPromotionService.ts` — strict M24 RPC mapping and write APIs.
- `src/lib/pricing.ts` — target matching, date status, best-offer and pricing
  calculations.
- `src/components/CommerceManager.tsx` — management UI embedded in Step 05 for
  all five themes.
- `src/components/PromotionalPricing.tsx` — shared dynamic public card display.
- `StepServices` hydrates saved services and commerce metadata as one
  theme-identity-checked boundary, preventing stale cross-theme promotions.
- Existing theme layout remains unchanged except where dynamic price/badge data
  must be shown. The Nail/Lash renderer gained a theme-matching owner service
  menu because its prior showcase contained no saved-service cards.

## Security and preservation

- All management RPCs derive the business from `auth.uid()`; no browser-provided
  business ID is accepted.
- New tables have RLS and owner/manager-only writes.
- Anonymous access is only through `get_public_commerce_by_slug`, which requires
  an already-published website and returns active rows/effective offers only.
- Existing services and packages are not backfilled or guessed. Legacy packages
  keep NULL theme/discount metadata. No service is deleted.
- M24 is idempotent and replay-safe in the repository test environment.

## Validation

```bash
npm run test:phase-9.1
```

Results:

- M01–M24: 24/24 clean replay twice;
- retained migration tests A–T: 20/20;
- Phase 9.1 acceptance: 9/9;
- all five themes persist variants, direct badges, validated bundles and a
  different supported offer target;
- automatic expiration, cross-theme rejection, tenant isolation and legacy row
  preservation pass;
- retained Phase 8.3 acceptance: 94/94;
- TypeScript lint, production build, auth 14/14 and 25-screen verification pass.

As with M01–M23, M24 is a draft. Live read-only schema introspection and explicit
approval are required before applying any migration.
