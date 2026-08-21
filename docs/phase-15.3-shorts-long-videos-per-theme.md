# PHASE 15.3 — 5 Shorts + 5 Long Videos per Theme

> Status: **COMPLETE for all five themes** · session `arena/01a0039c-new-tamplete-app`

## What was built

Every theme always presents **exactly 5 Shorts + 5 Long Videos** (10 cards).
Owner-configured videos come first; a per-theme catalog fills any missing
slots. Content is strictly isolated by theme — no shared ids, urls, or titles.

Total catalog: **50 unique theme-specific records** (10 × 5 themes).

### Audit (pre-implementation)

| Existing piece | Role in 15.3 |
|----------------|--------------|
| `SalonData.socialVideos` / `SocialVideo` | Owner videos (URLs only) |
| `public.social_videos` (M06) | platform, video_url, external_video_id, caption — **no** short/long column |
| Phase 15.1 `videoItemsForTheme` | Theme isolation + gallery resolve |
| Phase 14.1 gallery `themeMedia` | Fallback pattern when owner has nothing |
| Phase 15.2 auto-fetch | Owner paste still sets `externalVideoId` + kind inference |

**No new tables or migrations.** Additive client field `SocialVideo.videoKind?: 'short' | 'long'` discriminates kinds; when absent, kind is inferred from the URL (`/shorts/`, Instagram reels, TikTok → short; else long).

### Architecture

| File | Purpose |
|------|---------|
| `src/lib/siteVideoCatalog.ts` | 50 unique theme seeds (5 short + 5 long each); real YouTube URLs + CDN thumbs |
| `src/lib/siteVideoGallery.ts` | Kind resolve + owner-first fill to quota 5/5; `videoKindCountsForTheme` |
| `src/lib/siteVideoGalleryI18n.ts` | Shorts / Long Videos / All tab + badge labels (EN/HI) |
| `src/components/SiteVideoGallery.tsx` | Kind filter tabs, kind badges, 9:16 / 16:9 tile ratios |
| `src/types.ts` | Additive `videoKind` |
| `src/screens/StepSocials.tsx` | Owner save stamps `videoKind` (+ themeId when known) |

### Fill rules

1. Collect owner videos that belong to the active theme.
2. Split by kind (`short` / `long`), keep up to 5 each.
3. If a kind has fewer than 5, append that theme's catalog seeds until the quota is met.
4. Never borrow another theme's catalog. Dedup by id, url, and externalVideoId.

### Theme isolation

- Every catalog row is stamped `themeId = <active theme>`.
- Foreign-scoped owner videos never render.
- Theme switch resets the kind filter and drops open embeds.
- Record ids, external ids, urls, and titles are unique across all 50 seeds.

### UI

- Kind tabs: All · Shorts (n) · Long Videos (n)
- Kind badge on every card
- Shorts use 9:16 tiles; longs use 16:9
- Section stays `data-site-section="videos"` / `#section-social` / `site-social-*` test ids

### Out of scope (later phases)

- Likes / weekly top videos
- Dashboard integration / admin permissions
- New DB columns for kind

### Validation

```bash
npm run test:phase-15.3   # 21/21
npm run test:phase-15.1   # 26/26
npm run test:phase-15.2   # 18/18
npm run test:phase-10.8   # 36/36
npm run lint              # 0 errors
```
