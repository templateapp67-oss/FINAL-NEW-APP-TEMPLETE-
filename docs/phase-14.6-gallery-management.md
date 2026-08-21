# PHASE 14.6 — GALLERY MANAGEMENT

> Continues from Phase 14.5. Owner/Admin management for gallery content,
> built on the EXISTING 14.1 gallery (no duplicate gallery system, no
> booking/payment/database changes).

## What changed

- `src/lib/galleryManagement.ts` (new) — pure management helpers: media
  validation, theme scoping, theme-scoped service linking, before/after,
  display order + activate/deactivate, the customer projection, and an
  authorization gate that reuses the existing `useAuth` + `resolveOwnerSalonId`.
- `src/types.ts` — additive `GalleryImage` fields: `title`, `description`,
  `serviceId`, `displayOrder`, `status`. All optional, so existing saved
  galleries load unchanged (no migration loss).
- `src/lib/siteGallery.ts` — `ownerGalleryItemForTheme` now skips
  `status: 'inactive'` items (deactivation actually hides them from the
  customer gallery).
- `src/screens/StepPhotos.tsx` — the owner gallery-management UI gains: theme
  select, theme-scoped category + service link, title/description, before-image
  upload (Before/After pair), activate/deactivate, persisted display order,
  upload progress + error with retry, and an authorization notice.
- `scripts/test-phase-14.6.mjs` — **26-test** management acceptance suite.

## Feature map (spec → implementation)

1. **Owner gallery management** — upload (validated), before+after image,
   theme select, category, optional service link, title/description, display
   order, activate/deactivate, delete (existing Trash action kept).
2. **Theme isolation** — an item is scoped to exactly one of the five themes;
   `customerGalleryForTheme` + `ownerGalleryItemBelongsToTheme` guarantee only
   that theme's content renders; service links resolve only through
   `directoryServicesForTheme` so a foreign theme's service can never be linked.
3. **Media validation** — image type + 5 MB size gate; upload progress
   (`FileReader.onprogress`); error + Retry; a broken upload returns before any
   record is created.
4. **Before/After** — a pair is one theme-scoped record, so both images always
   share the theme (invariant exposed by `beforeAfterThemesMatch`).
5. **Owner preview** — the existing live `PreviewPane` continues to show the
   saved gallery; the edit modal previews the before/after pair inline.
6. **Safety** — authorization reuses `useAuth` + `resolveOwnerSalonId` (no
   invented salon/theme ids); no private/service-role credentials in the
   frontend (anon client only, unchanged); additive data model never deletes
   existing valid gallery data.
7. **Customer result** — `customerGalleryForTheme` (active + theme-scoped +
   ordered, unsafe URLs dropped) and `SiteGallery` skip inactive items, so a
   saved item appears only on its assigned theme.

## Validation

- `test:phase-14` → **162/162** (14.1 55 + 14.3 37 + 14.4 22 + 14.5 22 + 14.6 26)
- `npm run lint` → 0 errors
- `npm run build` → green
- `node verify-22-screens.js` → all 25 screens verified

## Scope guards

- No duplicate gallery system; no booking/payment/database changes; Phases
  10–13 and 14.1–14.5 untouched; no invented images/theme/salon ids.
