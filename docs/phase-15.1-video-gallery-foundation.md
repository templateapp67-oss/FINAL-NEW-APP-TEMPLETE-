# PHASE 15.1 — VIDEO GALLERY FOUNDATION

> Status: **COMPLETE for all five themes** · session `arena/01a0039c-new-tamplete-app`

## What was built

A single shared **Video Gallery foundation** that works across all five themes.
Content is strictly separated by `theme_id` / the existing theme relationship;
no YouTube auto-fetch, likes, weekly videos, admin management, or dashboard
logic is included in this phase.

### Audit (pre-implementation)

| Existing piece | Role in 15.1 |
|----------------|--------------|
| `SalonData.socialVideos` / `SocialVideo` | Owner-configured video URLs + thumbnails (client model of DB `social_videos`) |
| `public.social_videos` (M06) | business_id, platform, video_url, external_video_id, caption, display_order, status — **URLs only, no video file storage**. No `theme_id` column exists; theme scoping is additive on the client model (same pattern as gallery `themeId`). |
| `SiteSocialFeed` + `siteSocialFeed.ts` | Phase 10.8 social / latest-work feed — embed parsers, section contract (`videos` / `#section-social`) |
| `SiteVideo` | Phase 10.12 lazy video primitive (IO + poster + embed-on-play) |
| `SiteGallery` + `siteGallery.ts` | Phase 14 pattern for one shared architecture + per-theme isolation |

**No new tables, columns, IDs, or relationships were invented.** The foundation
reuses `socialVideos` and the existing embed parsers. Optional `SocialVideo.themeId`
mirrors the Phase 14.1 gallery grandfathering rule (absent = visible on every theme).

### Architecture

| File | Purpose |
|------|---------|
| `src/lib/siteVideoGallery.ts` | Theme-scoped data layer: `videoItemsForTheme`, `ownerVideoBelongsToTheme`, thumbnail / embed resolution, URL safety |
| `src/lib/siteVideoGalleryI18n.ts` | EN / HI chrome (play, view, empty, error, thumb fallback, platforms) |
| `src/components/SiteVideoGallery.tsx` | Shared UI section used by all five theme renderers |
| `src/components/SiteSocialFeed.tsx` | Thin re-export of `SiteVideoGallery` (no second video system) |
| `src/types.ts` | Additive `SocialVideo.themeId?: string \| null` |

All five theme renderers (`Barber`, `HairStudio`, `BeautySpa`, `Family`,
`NailLash`) now mount `<SiteVideoGallery themeId="…" />` in the videos slot.

### Theme isolation

- Items with `themeId` set to another theme are excluded.
- Unscoped items (legacy drafts) remain visible on every theme so existing
  saved data keeps working.
- Theme / data switch closes any open embed so previous-theme media is never
  left mounted.
- Each theme keeps its own grid config via `VIDEO_GALLERY_THEME_CONFIG`
  (content is never shared or copied across themes).

### UI states & media safety

- **Loading / empty / error** via `resolveSectionState('videos', …)` +
  `SectionStatePanel` / `SiteSkeleton type="videos"`.
- **Broken / missing thumbnail** → dedicated fallback panel; card stays
  usable (View opens the external URL).
- **Lazy thumbnails** through `SiteImage` (`context="video"`, IO + skeleton +
  error fallback). Embed `<iframe loading="lazy">` only after Play.
- **URL safety**: external watch links must be `http(s)`; thumbnails pass
  `isSafeMediaUrl`; unsafe / incomplete records never become cards.
- Embeds reuse Phase 10.8 parsers (`parseYoutubeVideoId`,
  `parseInstagramShortcode`) — no auto-fetch of captions, likes, or titles.

### Responsive / appearance / locale

- Desktop / tablet / mobile grids via existing `siteGrid` + mode prop.
- Light / Dark via `socialVisuals(themeId, appearance)` (Phase 10.8 surfaces).
- EN / HI via `siteText` section titles + `videoGalleryChrome` control copy.

### Out of scope (later phases)

- YouTube auto-fetch / channel sync
- Likes counts in the UI
- Weekly featured videos
- Owner/admin video management or moderation
- Dashboard logic
- New database tables or `social_videos.theme_id` migration

### Validation

```bash
npm run test:phase-15.1
npm run test:phase-10.8   # section contract preserved
npm run test:phase-14.1   # gallery regression
npm run lint
```

### Section contract (preserved from Phase 10.8)

- `data-site-section="videos"`
- `id="section-social"`
- `data-testid="site-social-feed"`
- Item / play / view / embed test ids unchanged so Phase 10.x suites stay green
