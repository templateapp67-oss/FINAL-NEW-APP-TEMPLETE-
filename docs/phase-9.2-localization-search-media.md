# Phase 9.2 — Localization, Responsive UI, Search & Media

> Status: **complete** (draft SQL; M25 has not been applied to any database).
> Scope: all five database-backed themes.

## Multi-language

- Primary service/category names remain the source-of-truth English (or owner) record.
- `catalog_translations` stores English + Hindi copies for categories and predefined services.
- `saved_service_translations` stores salon-owned translations. Locale is an enum (`en`, `hi`) so regional languages can be added later without changing relationships.
- Theme / category / predefined / saved-service FKs are never rewritten by a translation.

## Search, filter, sort

- Search matches English name, description, and translated name (client list + `search_theme_services` RPC).
- Search and list operations are always scoped to the active theme.
- Filters/sorts: category, price low/high, duration short/long, suggested only, active only.

## Service media

- `saved_service_media` stores image, banner, and icon URLs for one saved service.
- Composite FK `(service_id, business_id, theme_id)` prevents one theme’s media from attaching to another theme or salon.
- UI supports upload (data URL preview), replace, and remove.

## Responsive audit

- Step 05 search/filter/Add Selected/service cards use wrapping layouts, 44px touch targets, always-visible mobile actions, and `overflow-x-hidden` / `break-words`.
- All five theme renderers show localized names and optional media without horizontal overflow.

## Validation

```bash
npm run test:phase-9.2
```
