# PHASE 15.7 — Video Player + Original Platform Redirect

> Status: **COMPLETE** · branch `arena/01a00652-new-tamplete-app`

Implemented only Phase 15.7 on the existing Phase 15.1–15.6 video gallery and
owner-management architecture. No likes, weekly ranking, or dashboard work was
added.

## Final interaction

- Every responsive Short / Long card shows thumbnail (or a non-broken
  fallback), video type, title, platform, and channel/source.
- Clicking the card or **View** opens the exact original platform URL in a new
  tab with `noopener,noreferrer`.
- **Play** lazily opens the existing responsive embed player. The modal shows a
  loading state, an unavailable state, and a permanently visible **Watch on
  original platform** destination.
- Player aspect ratio stays `9:16` for Shorts and `16:9` for Long Videos.
- Broken thumbnails retain a usable card and destination.
- Theme/data changes close the player and clear transient state so media from a
  previous theme never remains mounted.

## Exact URL preservation

`SocialVideo.originalPlatformUrl` is an additive Phase 15.7 field. It stores the
exact trimmed URL supplied by the owner. The pre-existing `url` field retains
its canonical storage shape for Phase 15.2–15.6 compatibility, but external
navigation **only** uses `originalPlatformUrl` (falling back to `url` for old
records).

This applies to:

- newly pasted owner videos;
- link replacement through owner/admin management;
- protected theme showcase records; and
- the normalized `VideoGalleryItem` projection.

Watch, Shorts, `youtu.be`, live, and query-string forms are not transformed in
the original destination. Server metadata URLs never overwrite the owner's
original URL.

## Safe external destination gate

`src/lib/originalVideoDestination.ts` is the single Phase 15.7 destination
gate. It:

- permits only HTTP(S), without URL credentials or control characters;
- uses exact host allowlists (no suffix/substring host spoofing);
- detects YouTube, Instagram, Facebook, and TikTok;
- requires a single-video path rather than a home/channel/profile URL;
- validates YouTube IDs and rejects a stored ID/URL mismatch;
- verifies the expected platform before `window.open`; and
- returns the exact input URL rather than a generated redirect.

The public gallery can safely repair a stale platform label on an old record by
using the validated host as the displayed source. The moderation publish gate
is stricter: a new/approved record must match its stated platform.

## Graceful states

| State | Behavior |
|---|---|
| Section loading/error/empty | Existing `SiteSkeleton` / `SectionStatePanel` behavior preserved |
| Player loading | Spinner and localized loading copy |
| Embed unavailable | Localized message plus validated original-platform action |
| Thumbnail missing/broken | Existing icon/text fallback; card remains clickable |
| Invalid/unsafe/mismatched URL | Record is excluded from public projection; blocked opens show a localized safety alert |
| No supported embed | Opens the validated original platform directly |

Chrome copy is available in English and Hindi for all five themes.

## Theme isolation

`videoItemsForTheme` remains the sole projection. Foreign-theme owner records
are filtered before rendering, theme showcase fill never borrows from another
theme, and the player resets whenever `themeId` or salon data changes. The exact
URL on one theme therefore cannot be substituted with another theme's content.

## Files

- `src/lib/originalVideoDestination.ts` — exact URL validation/open helper
- `src/types.ts` — additive `SocialVideo.originalPlatformUrl`
- `src/lib/siteVideoGallery.ts` — validated original URL projection
- `src/components/SiteVideoGallery.tsx` — responsive card click/player states
- `src/lib/siteVideoGalleryI18n.ts` — EN/HI Phase 15.7 state copy
- `src/lib/videoUrlMetadata.ts` — preserve original paste across metadata fetch/save
- `src/lib/videoManagement.ts` — preserve original URL during replacement
- `src/lib/videoModeration.ts` — platform-aware publish validation
- `src/lib/siteVideoCatalog.ts` — original destination on protected records
- `scripts/test-phase-15.7.mjs` — 11-test acceptance suite

## Validation

```bash
npm run test:phase-15.7  # 11/11
npm run test:phase-15.1  # 26/26 regression
npm run test:phase-15.4  # 18/18 regression
npm run test:phase-15.6  # 34/34 regression
npm run lint             # 0 errors
npm run build            # green
```

## Explicitly out of scope

- Likes
- Weekly most-liked videos
- Dashboard integration
- Any Phase 15.8 or later functionality
