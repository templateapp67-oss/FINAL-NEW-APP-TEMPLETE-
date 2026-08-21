# PHASE 15.6 — OWNER/ADMIN VIDEO MANAGEMENT

> Status: **COMPLETE** · session `arena/01a003f2-new-tamplete-app`

Owner/admin management for the EXISTING Phase 15.1–15.5 video architecture
(`SalonData.socialVideos` + the protected per-theme showcase catalog). No
duplicate video system, no new tables/columns/relationships, no likes, no
weekly ranking, no dashboard integration (later phases).

## Audit (pre-implementation)

| Existing piece | Role in 15.6 |
|----------------|--------------|
| `SalonData.socialVideos` / `SocialVideo` | Owner video records (URLs only; maps to `social_videos`) |
| `siteVideoCatalog.ts` (15.3/15.5) | 50 protected showcase records (`theme:<theme>:<slot>` ids) |
| `videoItemsForTheme` fill (15.1/15.3) | Customer projection + 5 short / 5 long quota |
| `useAuth` + `resolveOwnerSalonId` (owner salon resolution) | Server-side session → `organization_members role='owner'` → salons — the ONLY salon source |
| Phase 14.6/14.7 gallery management + moderation | Pattern mirrored: pure helpers + capability gate + panel |
| `POST /api/video-metadata` (15.2) | Replace link auto-fetch (no second fetch system) |
| M12 draft RLS on `social_videos` | DB-side enforcement when migrations are applied (`has_business_role(['owner_admin','manager'])`) |

**No new DB structures.** Inspected the existing schema first: management maps
onto existing `social_videos` concepts and the wizard payload; the
protected catalog stays client-side (it never lived in the DB). Additive
optional fields only: `SocialVideo.status`, `moderation`, `rejectionReason`,
`reviewedAt`, `replacesMockId`, and `SalonData.disabledThemeVideoIds`.

## Capability matrix (`src/lib/videoManagement.ts`)

| Capability | Owner (own salon) | Admin |
|------------|-------------------|-------|
| Add new video (Step 07 paste flow) | ✅ | ✅ |
| Replace video link (auto re-fetch of metadata) | ✅ | ✅ |
| Edit metadata (title / description / channel / thumbnail / theme / Short-Long) | ✅ | ✅ |
| **Edit a protected showcase record** | ✅ as owner override | ✅ as override |
| Delete own video rows | ✅ | ✅ |
| Unpublish / republish own rows | ✅ (approved only) | ✅ |
| **Delete a protected showcase record** | ❌ never | ✅ per-salon tombstone + restore |
| **Approve / reject (with reason) / mark pending** | ❌ | ✅ |

- **Actor resolution** (`resolveVideoActor`) reuses the existing ownership
  logic verbatim (`useAuth` session + `resolveOwnerSalonId`). Owner tier
  requires the session-resolved salon; the offline onboarding draft
  (`not-configured`) is owner-tier — same rule as 14.6/14.7.
- **Admin tier** requires an authenticated session carrying a server-signed
  admin claim (`app_metadata.role` ∈ `admin | administrator | platform_admin |
  super_admin`, or equivalent claim arrays / `user_metadata.account_role`).
  `owner_admin` does **not** elevate (salon access role ≠ platform admin). No
  hardcoded salon/user ids, no env allowlists, no client-typed flags.
- **Data-layer enforcement**: every helper (`editManagedVideoMetadata`,
  `replaceManagedVideoUrl`, `deleteManagedVideoRecord`,
  `disableThemeMockForSalon` / `restoreThemeMockForSalon`,
  `moderateManagedVideo`, `setManagedVideoActive`) re-checks the capability
  and REFUSES the mutation for a denied actor — hiding buttons is cosmetic.

## Salon / theme / kind linkage

- No helper accepts a salon id, so an owner can never address another salon's
  videos; the screen only ever hands the panel the session-resolved salon
  payload. Cross-salon reads/writes are impossible by construction (and the
  M12 draft policies add `member_select` / `owner_admin` write RLS
  database-side when applied).
- Overrides and edits keep `themeId` pinned (showcase records are locked to
  their own theme; owner rows may be re-linked across the five themes, or kept
  unscoped = every theme). Kind stays `short | long`; replace re-derives kind
  from the pasted URL (`/shorts/` → short) unless explicitly chosen.
- The customer projection (`videoItemsForTheme`) now:
  1. skips owner rows that are not customer-visible (`moderation` pending /
     rejected, or `status: 'inactive'`; absent = grandfathered approved), and
  2. skips showcase records tombstoned for **this salon**
     (`disabledThemeVideoIds`) — other salons and themes are untouched.
  The 15.3 fill still tops each kind up to 5, so hiding a video never breaks
  the section.

## Protected showcase records

- **Edit** (owner or admin) materialises an owner-owned override row:
  fresh id, `replacesMockId` → the protected record, same theme + kind,
  `moderation: 'approved'`, `status: 'active'`. The fill dedups by external
  id, so the override shadows the original in place (no duplicates). The
  protected catalog constant is never mutated.
- **Owner delete of a showcase record**: always refused (15.5 rule kept, now
  also enforced by `canDeleteVideo` in the management helpers).
- **Admin delete** = per-salon tombstone (`disabledThemeVideoIds`) + removal of
  that record's overrides. Restore removes the tombstone; the pristine default
  returns. Deleting a salon's override row likewise restores the default via
  the fill — a mock can never be permanently lost.
- **Approve/manage** (admin): `videoModeration.ts` state machine
  (pending ↔ approved / rejected-with-reason), publish gate
  (`validateSocialVideoForPublish` — safe URL, title, valid theme/kind, safe
  thumbnail) runs before any approval; reject also unpublishes. Owner adds
  stay published immediately (Phase 15.2/15.4 behaviour preserved).

## Files

| File | Change |
|------|--------|
| `src/lib/videoManagement.ts` | NEW — actor/permissions, capability matrix, edit/replace/delete/tombstone/moderate operations, management projection |
| `src/lib/videoModeration.ts` | NEW — moderation state machine + customer-visibility + publish gate (cycle-free module) |
| `src/components/VideoManagementPanel.tsx` | NEW — owner/admin panel (list, manage modal with optional link replacement, admin approve/reject, showcase remove/restore) |
| `src/lib/siteVideoCatalog.ts` | `isDisabledThemeMockId`, `activeThemeVideoCatalog` (additive) |
| `src/lib/siteVideoGallery.ts` | customer projection honours moderation/inactive + per-salon tombstones; additive data pick |
| `src/types.ts` | additive optional fields (`SocialVideo.status/moderation/rejectionReason/reviewedAt/replacesMockId`, `SalonData.disabledThemeVideoIds`) |
| `src/screens/StepSocials.tsx` | actor resolution via existing auth + ownership; panel mounted; add/delete handlers gated (draft mode unchanged) |
| `scripts/test-phase-15.6.mjs` | NEW — 34-test acceptance suite |

## Out of scope (later phases)

- Likes, weekly most-liked videos, dashboard integration (15.7+)
- Instagram/Facebook/TikTok auto-fetch (15.2 hooks reserved)
- Executing draft migrations (M01–M26 need the standard go-ahead)

## Validation

```bash
npm run test:phase-15.6   # 34/34
npm run test:phase-15     # 34 + 19 + 18 + 21 + 18 + 26 = 136/136
npm run test:phase-10.8   # 36/36 (section contract)
npm run test:phase-10.12  # 178/178
npm run test:phase-14.6   # 26/26
npm run test:phase-14.7   # 18/18
npm run lint              # 0 errors
npm run build             # green
node verify-22-screens.js # all 25 screens verified
```
