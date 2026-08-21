/**
 * PHASE 15.1 — `SiteSocialFeed` is now a thin alias of the Video Gallery
 * foundation. The previous Phase 10.8 social-feed presentation lives in
 * `SiteVideoGallery`. Kept as a named re-export so any remaining import of
 * `SiteSocialFeed` (and every Phase 10.x test that mounts a theme renderer)
 * keeps working without a second video system.
 */
export { default } from './SiteVideoGallery';
