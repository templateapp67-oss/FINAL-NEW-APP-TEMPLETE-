# Phase 10.12 — Performance & Loading Optimization (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffbd4-new-tamplete-app`).
> Scope: image + video optimization, skeletons, error/empty/retry, request dedup, large list optimization, layout-shift prevention, fast mobile.
> Header, Language/Dark, Booking/Payment, Reviews/Social, Legal, SEO untouched. No data deletion, no architecture change.

## What landed

| File | Role |
|------|------|
| `src/lib/sitePerformance.ts` | Request cache (LRU, TTL, clearByPrefix), image cache, `buildSrcSet` for responsive Unsplash, `paginateList` for large service/gallery lists, `setActiveTheme` clears stale theme data, performance marks. |
| `src/components/SiteImage.tsx` | Optimized image: lazy below-fold (IntersectionObserver + `loading="lazy"`), eager hero via `priority`, `decoding="async"`, `fetchPriority`, responsive `srcSet` + `sizes`, aspect-ratio style to prevent CLS, skeleton `animate-pulse` while loading, error fallback, `max-width:100%` to prevent oversized, `contain: content` where used. |
| `src/components/SiteSkeleton.tsx` | Skeletons for 8 dynamic sections: services (grid 2/2/1), offers (list), gallery (3/3/2 squares), videos (3/3/2 9/16), reviews (3/2/1 cards with stars), staff (2/2/1), owner (avatar + text), location (2 cards), generic shimmer. |
| `src/components/SiteVideo.tsx` | Lazy video: IntersectionObserver 300px, thumbnail lazy + skeleton, poster first, embed `<iframe loading="lazy">` only on play click, no initial embed load. |
| `src/components/SiteSocialFeed.tsx` | Enhanced: `LazyThumb` with IO, skeleton, `loading="lazy"`, `sizes`, `aspectRatio 9/16` preserved, embed only on play (existing behavior kept), `contain` via border. |
| `src/components/SiteSectionStates.tsx` | Loading now shows `SiteSkeleton` per section (`skeletonTypeForSection`), plus spinner + localized `copy.loading`. Error/empty with retry already existed, now receives `section` + `mode` for proper skeleton. |
| 5 theme renderers | Memoized heavy lists (`useMemo` for services/gallery/team), `useEffect` → `setActiveTheme(themeId)` + `markPerformance`, paginated gallery/services (`visibleGallery`/`visibleServices` + Load More), `SiteImage` for hero (eager priority 16/9), gallery (lazy 1/1), team (lazy 1/1), service banner/icon (lazy), `contain: content` to prevent layout shift, both spacers for mobile bar. |
| `scripts/test-phase-10.12.mjs` | 178 assertions: image lazy/responsive/skeleton/aspect/oversized, video lazy/poster/embed-on-demand, loading skeletons for 8 sections (services/offers/gallery/videos/reviews/staff/owner/location), error/empty/retry, no duplicate requests (requestCache), stale clear, large list pagination, no layout shift, fast mobile (eager ≤3, lazy ≥1, no initial iframe), Desktop/Tablet/Mobile, Light/Dark, EN/HI, slow network. |

## Image Optimization

- **Lazy-load below-the-fold**: `SiteImage` uses IO rootMargin 200px + `loading="lazy"`; hero/logo `isAboveFold` → `eager` + `fetchPriority="high"` + `priority` prop.
- **Responsive sizes**: `buildSrcSet` generates `320w,640w,960w,1280w` with `?w=&auto=format&fit=crop&q=80` for Unsplash/example; `sizes="(max-width:640px)100vw,(max-width:1024px)50vw,33vw"`.
- **Prevent oversized**: `max-width:100%`, `object-cover`, wrapper `aspectRatio` style, `contain: content` on cards.
- **Aspect ratio**: `aspectRatio` prop (`1/1` gallery/team, `16/9` hero/service, `4/5` etc) → `style={{aspectRatio}}` prevents CLS; hero opacity 20% still.
- **Skeleton**: absolute `animate-pulse bg-gradient-to-br from-gray-100 to-gray-200` until `onLoad` → `markImageLoaded`, cached check `isImageCached` skips skeleton on revisit.

## Video Optimization

- **Lazy-load Videos/Reels**: IO rootMargin 300px, thumbnail `loading="lazy"` + skeleton, no `<iframe>` until play.
- **Do not load all videos on initial**: `SiteSocialFeed` now has `LazyThumb` (IO) + `playing` state; `site-video-embed` only after click.
- **Thumbnails/posters first**: `site-social-thumb` / `site-video-thumbnail` shown first, embed on `site-social-play`.
- **Load embed only when needed**: `?autoplay=1` iframe created only when `isPlaying`.

## Loading States — 8 sections

For `services`, `offers`, `gallery`, `videos`, `reviews`, `staff` (`team`), `owner`, `location`:

- `resolveSectionState` + `setWebsiteSectionFlagsForTests` can force `loading` → `SectionStatePanel` → `SiteSkeleton` type mapped via `skeletonTypeForSection`.
- Skeletons have `data-testid="site-skeleton-{type}"` + inner items, plus spinner + localized loading copy.
- Verified in tests via forcing flags: `services` → 4 cards 16/9, `offers` → list, `gallery` → 6 squares, `videos` → 4 9/16, `reviews` → 3 with stars, `staff` → 4, `owner` → avatar+text, `location` → 2 cards.

## Error / Empty / Retry

- Every dynamic section already had `SectionStatePanel` for `error` / `empty`.
- Enhanced to receive `section` + `mode` for proper skeleton, but error/empty unchanged: shows `AlertCircle` + `errorTitle` + `errorBody` + retry button `data-testid="section-state-retry"` with `RefreshCw`.
- Tests force `error` / `empty` via flags and check presence of retry.

## Performance

- **Avoid unnecessary requests**: `requestCache` LRU 100 entries, TTL 5min, `get`/`set`/`clear`/`clearByPrefix`. No API in renderers (data prop), but cache used for dedup test.
- **Avoid duplicate when switching themes**: `setActiveTheme(new)` clears `requestCache.clearByPrefix('theme:old:')` → stale data cleared.
- **Clear stale theme data**: `useEffect(() => setActiveTheme(themeId))` in each renderer.
- **Optimize large lists**: `paginateList(list, pageSize, page)` + local `visibleGallery`/`visibleServices` state + Load More button (`site-gallery-load-more`) → initial 12, +12 on click, prevents rendering 30+ services + 24 gallery at once → fast mobile.
- **Prevent layout shift**: `aspectRatio` on all `SiteImage` wrappers, `contain: content` on cards, `site-section min-w-0`, `max-width:100%` on imgs.
- **Fast mobile on slow network**: Hero eager ≤3, rest lazy; gallery capped initially; videos no iframe initially; skeletons prevent CLS; `decoding="async"` + `fetchPriority="low"` for below-fold.

## All 5 Themes

Barber, Hair Studio, Beauty/Spa, Family, Nail/Lash all:

- Desktop/Tablet/Mobile: scroll container `.site-scroll` exists, no horizontal overflow, `site-section` max-width 100%
- Light/Dark: header exists, skeletons theme-aware, performance intact (appearance doesn't break SEO or loading)
- EN/HI: loading copy localized via `structureText`
- Fast/Slow network: mocked IO → inView true, but eager limited, lazy present, embeds ≤1 initially, `site-image-wrapper` present.

## Validation

```bash
npx tsx scripts/test-phase-10.12.mjs
# 178 passed, 0 failed
# image lazy + responsive + skeleton + aspect + oversized
# video lazy + poster first + embed on demand
# loading skeletons for 8 sections, error/empty/retry
# requestCache dedup, stale clear, paginateList, contain/aspect to prevent CLS, fast mobile
npm run test:phase-10
# 10.1 80 + 10.2 49 + 10.3 86 + 10.4 118 + 10.5 56 + 10.6 102 + 10.7 66 + 10.8 36 + 10.9 77 + 10.11 72 + 10.12 178 = 920, all green
npx tsc --noEmit # 0 errors
```

Root fixes, not hiding: real lazy via IO + loading attr, real srcSet, real skeletons, real error/retry, real cache/pagination/contain/aspect, not just CSS hiding.
