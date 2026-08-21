# PHASE 14.7 — OWNER/ADMIN GALLERY APPROVAL

> Continues from Phase 14.6. Moderation layer for uploaded gallery content,
> built on the existing 14.1/14.6 gallery (no duplicate gallery architecture,
> no booking/payment/service/database changes).

## What changed

- `src/lib/galleryModeration.ts` (new) — the moderation state machine +
  publish gate + authorization gate (pure, no credentials, no invented ids).
- `src/types.ts` — additive `GalleryImage` fields: `moderation`
  (`pending`/`approved`/`rejected`), `rejectionReason`, `reviewedAt`. Absent
  moderation means "grandfathered approved", so existing saved galleries stay
  public.
- `src/lib/siteGallery.ts` + `src/lib/galleryManagement.ts` — customer
  projection now uses `isCustomerVisibleGalleryItem` (approved + active only).
- `src/components/GalleryModerationPanel.tsx` (new) — approval UI.
- `src/screens/StepPhotos.tsx` — new uploads start `pending`; renders the
  approval panel; grid thumbnails show Pending/Rejected badges.
- `scripts/test-phase-14.7.mjs` — **18-test** moderation acceptance suite.

## Feature map (spec → implementation)

1. **Status flow** — Upload → Pending → Approve/Reject → Published/Rejected
   (`approveGalleryItem` / `rejectGalleryItem` / `setGalleryModerationStatus`).
2. **Owner/admin controls** — view pending, approve, reject (with reason),
   unpublish, reactivate approved content, view rejection reason.
3. **Validation before publish** — `validateGalleryItemForPublish` checks valid
   media, valid theme, safe before image, and a linked service that belongs to
   the item's own theme; invalid mapping is refused at approve time. The
   "correct salon" requirement is enforced by the existing ownership
   resolution (`resolveOwnerSalonId`) — the item never carries an invented id.
4. **Theme isolation** — a before/after pair is one theme-scoped record;
   cross-theme service links and cross-theme rendering are blocked.
5. **Customer visibility** — `isCustomerVisibleGalleryItem` = approved (or
   grandfathered) AND active; pending/rejected/unpublished are hidden.
6. **Security** — `canModerateGallery` allows only an authorized owner/admin
   session (or the local onboarding draft); no client-trusted salon/theme ids,
   no storage/service-role credentials.
7. **UI** — the approval panel shows thumbnail, theme, category, linked
   service, status, and Approve / Reject / Unpublish / Reactivate controls
   (locked read-only for unauthorized sessions).

## Validation

- `test:phase-14` → **180/180** (14.1 55 + 14.3 37 + 14.4 22 + 14.5 22 +
  14.6 26 + 14.7 18)
- `npm run lint` → 0 errors
- `npm run build` → green
- `node verify-22-screens.js` → all 25 screens verified

## Scope guards

- No duplicate gallery system; no deletion of existing valid content; no
  booking/payment/service/database changes; Phases 10–13 and 14.1–14.6
  untouched; no invented images/theme/salon ids or credentials.
