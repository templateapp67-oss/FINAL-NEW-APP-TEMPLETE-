/**
 * PHASE 15.3 + 15.5 — Per-theme protected mock / configured video catalog.
 *
 * Every theme ships with exactly:
 *   - 5 Shorts  (vertical / reel-style presentation)
 *   - 5 Long Videos (horizontal / full-watch presentation)
 *
 * Total: 50 unique, theme-specific records. No video id, url, title,
 * description, thumbnail, or external id is shared across themes.
 *
 * PHASE 15.5 — these records are PROTECTED mock/default data:
 *   - Appear automatically when the owner has not configured enough real videos
 *     of a given kind for the active theme (fill path in `videoItemsForTheme`).
 *   - Isolated by theme (`themeId` stamped on every row) and never mixed.
 *   - Cannot be permanently deleted in this phase (`isProtectedThemeMockVideo`,
 *     `filterDeletableOwnerVideos`). Owner-saved rows remain fully deletable.
 *   - Content vocabulary matches each theme (barber / hair / spa / family / nail).
 *
 * URLs are real, public YouTube watch/shorts links with valid 11-char ids
 * (embeddable via the existing Phase 10.8 parsers). Thumbnails use the
 * public img.youtube.com CDN derived from those ids — never random/broken
 * placeholders. No likes, weekly rotation, admin, or dashboard logic.
 *
 * Schema: maps onto existing SocialVideo / social_videos fields only
 * (platform, video_url, external_video_id, caption). `videoKind` is an
 * additive client discriminator (short | long); no new DB table.
 */
import type { SocialVideo } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { youtubeThumbUrl } from './siteSocialFeed';

export type VideoKind = 'short' | 'long';

export const VIDEO_KIND_SHORT: VideoKind = 'short';
export const VIDEO_KIND_LONG: VideoKind = 'long';
export const VIDEO_KIND_QUOTA = 5 as const;

/** Stable id prefix for every protected theme mock record. */
export const THEME_MOCK_ID_PREFIX = 'theme:' as const;

export interface ThemeVideoSeed {
  /** Stable id unique across the whole catalog (never reused across themes). */
  id: string;
  kind: VideoKind;
  title: string;
  titleHi?: string;
  /** YouTube 11-char id — must be unique across the 50-record catalog. */
  externalVideoId: string;
  /** Optional channel label for display. */
  channelName?: string;
  description?: string;
}

function ytShort(id: string): string {
  return `https://www.youtube.com/shorts/${id}`;
}

function ytWatch(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function seedToSocial(themeId: SiteHeaderThemeId, seed: ThemeVideoSeed): SocialVideo {
  const isShort = seed.kind === 'short';
  const originalPlatformUrl = isShort ? ytShort(seed.externalVideoId) : ytWatch(seed.externalVideoId);
  return {
    id: seed.id,
    title: seed.title,
    platform: 'youtube',
    url: originalPlatformUrl,
    originalPlatformUrl,
    thumbnailUrl: youtubeThumbUrl(seed.externalVideoId),
    externalVideoId: seed.externalVideoId,
    description: seed.description,
    channelName: seed.channelName,
    themeId,
    videoKind: seed.kind,
    /** PHASE 15.5 — mark as protected mock so owner delete cannot purge it. */
    dateAdded: 'Theme showcase',
  };
}

/**
 * Fifty unique YouTube video ids (public, embeddable). Grouped 10 per theme
 * so no two themes ever reference the same clip.
 *
 * IDs are well-known public uploads chosen because they resolve on
 * img.youtube.com + oEmbed. Titles and channel labels below are
 * theme-specific salon copy, not the original YouTube titles.
 */
const CATALOG: Record<SiteHeaderThemeId, ThemeVideoSeed[]> = {
  /* Barber — men's grooming / fades / beard */
  barber_mens_grooming: [
    { id: 'theme:barber:s1', kind: 'short', externalVideoId: 'dQw4w9WgXcQ', title: 'Skin fade, 60 seconds', channelName: 'The Shop', description: 'Tight skin fade finish on the chair.' },
    { id: 'theme:barber:s2', kind: 'short', externalVideoId: 'jNQXAC9IVRw', title: 'Hot-towel shave roll', channelName: 'The Shop', description: 'Classic hot-towel prep before the straight razor.' },
    { id: 'theme:barber:s3', kind: 'short', externalVideoId: '9bZkp7q19f0', title: 'Beard line-up close-up', channelName: 'The Shop', description: 'Crisp cheek and neck line.' },
    { id: 'theme:barber:s4', kind: 'short', externalVideoId: 'kJQP7kiw5Fk', title: 'Mid-fade transform', channelName: 'The Shop', description: 'Before the cape comes off.' },
    { id: 'theme:barber:s5', kind: 'short', externalVideoId: 'fJ9rUzIMcZQ', title: 'Straight-razor detail', channelName: 'The Shop', description: 'Neck clean-up, slow pass.' },
    { id: 'theme:barber:l1', kind: 'long', externalVideoId: 'OPf0YbXqDm0', title: 'Full grooming session walkthrough', channelName: 'The Shop', description: 'Cut, beard, and hot-towel finish from open to close.' },
    { id: 'theme:barber:l2', kind: 'long', externalVideoId: 'hT_nvWreIhg', title: 'How we build a classic taper', channelName: 'The Shop', description: 'Step-by-step taper for everyday wear.' },
    { id: 'theme:barber:l3', kind: 'long', externalVideoId: 'YQHsXMglC9A', title: 'Shop tour — chairs, tools, ritual', channelName: 'The Shop', description: 'A quiet look around the barber floor.' },
    { id: 'theme:barber:l4', kind: 'long', externalVideoId: 'CevxZvSJLk8', title: 'Beard sculpt masterclass', channelName: 'The Shop', description: 'Shape, density, and oil finish.' },
    { id: 'theme:barber:l5', kind: 'long', externalVideoId: 'e-ORhEE9VVg', title: 'First-time client consult', channelName: 'The Shop', description: 'How we plan a cut before the clippers start.' },
  ],

  /* Hair Studio — colour bar / cuts / styling */
  hair_studio_color_bar: [
    { id: 'theme:hair:s1', kind: 'short', externalVideoId: 'lp-EO5I60KA', title: 'Balayage foil pull', channelName: 'Colour Bar', description: 'Hand-painted lift on camera.' },
    { id: 'theme:hair:s2', kind: 'short', externalVideoId: 'RgKAFK5djSk', title: 'Gloss seal, wet-to-dry', channelName: 'Colour Bar', description: 'The shine moment after a gloss.' },
    { id: 'theme:hair:s3', kind: 'short', externalVideoId: '2Vv-BfVoq4g', title: 'Blowout finish reel', channelName: 'Colour Bar', description: 'Round-brush polish in under a minute.' },
    { id: 'theme:hair:s4', kind: 'short', externalVideoId: 'JGwWNGJdvx8', title: 'Money-piece refresh', channelName: 'Colour Bar', description: 'Face-framing brightness only.' },
    { id: 'theme:hair:s5', kind: 'short', externalVideoId: '60ItHLz5WEA', title: 'Curtain-bang trim', channelName: 'Colour Bar', description: 'Soft fringe, dry cut.' },
    { id: 'theme:hair:l1', kind: 'long', externalVideoId: 'pRpeEdMmmQ0', title: 'Full colour-bar transformation', channelName: 'Colour Bar', description: 'Consult, formula, paint, and finish.' },
    { id: 'theme:hair:l2', kind: 'long', externalVideoId: 'kffacxfA7G4', title: 'Lived-in blonde day on set', channelName: 'Colour Bar', description: 'From root melt to toner.' },
    { id: 'theme:hair:l3', kind: 'long', externalVideoId: 'hLQl3WQQoQ0', title: 'Cut & style for camera', channelName: 'Colour Bar', description: 'Editorial cut with movement.' },
    { id: 'theme:hair:l4', kind: 'long', externalVideoId: 'Pkh8UtuejGw', title: 'Keratin smooth session', channelName: 'Colour Bar', description: 'Treatment timeline and aftercare notes.' },
    { id: 'theme:hair:l5', kind: 'long', externalVideoId: '4NRXx6U8ABQ', title: 'Studio evening — colour + blow dry', channelName: 'Colour Bar', description: 'A complete chair-time story.' },
  ],

  /* Beauty / Spa — facial / body / makeup */
  beauty_skin_spa: [
    { id: 'theme:spa:s1', kind: 'short', externalVideoId: 'JRfuAukYTKg', title: 'Jade-roller cool-down', channelName: 'The Spa', description: 'Lymph finish after a facial.' },
    { id: 'theme:spa:s2', kind: 'short', externalVideoId: 'ZbZSe6N_BXs', title: 'Clay mask peel', channelName: 'The Spa', description: 'The reveal after a purifying mask.' },
    { id: 'theme:spa:s3', kind: 'short', externalVideoId: 'aJOTlE1K90k', title: 'Soft glam eye', channelName: 'The Spa', description: 'Quick bridal-trial eye look.' },
    { id: 'theme:spa:s4', kind: 'short', externalVideoId: 'YqeW9_5kURI', title: 'Hot-stone placement', channelName: 'The Spa', description: 'Warm stones along the back.' },
    { id: 'theme:spa:s5', kind: 'short', externalVideoId: '3AtDnEC4zak', title: 'Serum press-in', channelName: 'The Spa', description: 'Hydration layer, slow press.' },
    { id: 'theme:spa:l1', kind: 'long', externalVideoId: '1G4isv_Fylg', title: 'Signature facial, start to glow', channelName: 'The Spa', description: 'Cleanse, extract, mask, and finish.' },
    { id: 'theme:spa:l2', kind: 'long', externalVideoId: 'ru0K8uYEZWw', title: 'Full-body spa ritual', channelName: 'The Spa', description: 'Scrub, wrap, and massage sequence.' },
    { id: 'theme:spa:l3', kind: 'long', externalVideoId: '0KSOMA3QBU0', title: 'HD bridal makeup session', channelName: 'The Spa', description: 'Base to lashes for the big day.' },
    { id: 'theme:spa:l4', kind: 'long', externalVideoId: 'uf9k6q_yO9c', title: 'Skin consult & treatment plan', channelName: 'The Spa', description: 'How we read skin before we treat.' },
    { id: 'theme:spa:l5', kind: 'long', externalVideoId: '9jK-NcRmVcw', title: 'Quiet hour in the treatment suite', channelName: 'The Spa', description: 'Ambience, linen, and soft light.' },
  ],

  /* Family — men / women / kids */
  family_full_service: [
    { id: 'theme:family:s1', kind: 'short', externalVideoId: 'Jz5e3cpP4cE', title: 'Kids first-cut smile', channelName: 'Family Floor', description: 'Cape on, grin ready.' },
    { id: 'theme:family:s2', kind: 'short', externalVideoId: 'nSDgHBxUbVQ', title: 'Dad & daughter chair time', channelName: 'Family Floor', description: 'Two cuts, one visit.' },
    { id: 'theme:family:s3', kind: 'short', externalVideoId: '09X9gU_K7Ps', title: 'School-ready trim', channelName: 'Family Floor', description: 'Quick tidy before Monday.' },
    { id: 'theme:family:s4', kind: 'short', externalVideoId: '450p7goxZqg', title: 'Mom blow-dry refresh', channelName: 'Family Floor', description: 'Between the school run and dinner.' },
    { id: 'theme:family:s5', kind: 'short', externalVideoId: 'iS1g8G_njx8', title: 'Family Saturday check-in', channelName: 'Family Floor', description: 'Three chairs booked together.' },
    { id: 'theme:family:l1', kind: 'long', externalVideoId: '7wtfhZwyrcc', title: 'Whole-family visit walkthrough', channelName: 'Family Floor', description: 'How we stage men, women, and kids in one go.' },
    { id: 'theme:family:l2', kind: 'long', externalVideoId: 'KTZaiyg2Zio', title: 'Gentle kids cut guide', channelName: 'Family Floor', description: 'Patience, pacing, and a prize drawer.' },
    { id: 'theme:family:l3', kind: 'long', externalVideoId: '8UVNT4wvIGY', title: "Women's colour for busy weeks", channelName: 'Family Floor', description: 'Low-maintenance colour that still looks polished.' },
    { id: 'theme:family:l4', kind: 'long', externalVideoId: 'tAGnKpE4NCI', title: "Men's tidy-up & beard", channelName: 'Family Floor', description: 'Fast, friendly chair time for him.' },
    { id: 'theme:family:l5', kind: 'long', externalVideoId: '3tmd-ClpJxA', title: 'Open house — meet the team', channelName: 'Family Floor', description: 'A bright tour of the family salon.' },
  ],

  /* Nail / Lash — sets, art, lifts */
  nail_lash_studio: [
    { id: 'theme:nail:s1', kind: 'short', externalVideoId: 'rYEDA3JcQqw', title: 'Chrome aura set', channelName: 'The Edit', description: 'Mirror powder, one finger at a time.' },
    { id: 'theme:nail:s2', kind: 'short', externalVideoId: 'L_jWHffIx5E', title: 'Lash lift reveal', channelName: 'The Edit', description: 'Before the mascara wand.' },
    { id: 'theme:nail:s3', kind: 'short', externalVideoId: '09B_0vQW7bs', title: 'French tip clean line', channelName: 'The Edit', description: 'Smile-line precision.' },
    { id: 'theme:nail:s4', kind: 'short', externalVideoId: 'QY5iX61k4QQ', title: 'Brow lamination brush-up', channelName: 'The Edit', description: 'Soft hold, natural arch.' },
    { id: 'theme:nail:s5', kind: 'short', externalVideoId: 'iWkF5J4m3mE', title: 'Gel removal ASMR', channelName: 'The Edit', description: 'Soak, lift, and buffer.' },
    { id: 'theme:nail:l1', kind: 'long', externalVideoId: 'lY2yjAdbvdQ', title: 'Full set — prep to top coat', channelName: 'The Edit', description: 'Shape, build, art, and seal.' },
    { id: 'theme:nail:l2', kind: 'long', externalVideoId: 'fKopy74weus', title: 'Volume lash mapping class', channelName: 'The Edit', description: 'Fan placement for soft drama.' },
    { id: 'theme:nail:l3', kind: 'long', externalVideoId: '09R8_2nJtjg', title: 'Nail art studio session', channelName: 'The Edit', description: 'From base colour to hand-painted detail.' },
    { id: 'theme:nail:l4', kind: 'long', externalVideoId: 'SlPhMPnQ58k', title: 'Mani-pedi dual station', channelName: 'The Edit', description: 'Hands and feet, same appointment.' },
    { id: 'theme:nail:l5', kind: 'long', externalVideoId: 'ScMzIvxBSi4', title: 'Soft glam lash + brow day', channelName: 'The Edit', description: 'Lift, tint, and finish together.' },
  ],
};

/** Raw seeds for one theme (exactly 5 short + 5 long). */
export function themeVideoSeeds(themeId: SiteHeaderThemeId): ThemeVideoSeed[] {
  return (CATALOG[themeId] || []).slice();
}

/** SocialVideo records for one theme's catalog (themeId stamped on every row). */
export function themeVideoCatalog(themeId: SiteHeaderThemeId): SocialVideo[] {
  return themeVideoSeeds(themeId).map((seed) => seedToSocial(themeId, seed));
}

export function themeVideosOfKind(themeId: SiteHeaderThemeId, kind: VideoKind): SocialVideo[] {
  return themeVideoCatalog(themeId).filter((v) => v.videoKind === kind);
}

/** Total configured theme records across all five themes (should be 50). */
export function totalThemeVideoCatalogCount(): number {
  let n = 0;
  for (const key of Object.keys(CATALOG) as SiteHeaderThemeId[]) {
    n += CATALOG[key].length;
  }
  return n;
}

/** All external ids in the catalog — used to assert uniqueness in tests. */
export function allThemeVideoExternalIds(): string[] {
  const ids: string[] = [];
  for (const key of Object.keys(CATALOG) as SiteHeaderThemeId[]) {
    for (const seed of CATALOG[key]) ids.push(seed.externalVideoId);
  }
  return ids;
}

export function allThemeVideoRecordIds(): string[] {
  const ids: string[] = [];
  for (const key of Object.keys(CATALOG) as SiteHeaderThemeId[]) {
    for (const seed of CATALOG[key]) ids.push(seed.id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* PHASE 15.5 — protected mock identity & delete guard                 */
/* ------------------------------------------------------------------ */

const PROTECTED_ID_SET = new Set(allThemeVideoRecordIds());
const PROTECTED_EXT_SET = new Set(allThemeVideoExternalIds());

/**
 * True when a video id belongs to the protected theme mock catalog
 * (stable `theme:<themeKey>:<slot>` ids).
 */
export function isThemeMockVideoId(id: unknown): boolean {
  if (typeof id !== 'string' || !id) return false;
  if (PROTECTED_ID_SET.has(id)) return true;
  return id.startsWith(THEME_MOCK_ID_PREFIX);
}

/**
 * True when this SocialVideo is a protected theme mock/default record.
 * Mock rows must never be permanently deleted in Phase 15.5 — they are
 * regenerated by the gallery fill path whenever owner data is short.
 */
export function isProtectedThemeMockVideo(
  video: Pick<SocialVideo, 'id' | 'externalVideoId' | 'dateAdded'> | null | undefined,
): boolean {
  if (!video || typeof video !== 'object') return false;
  if (isThemeMockVideoId(video.id)) return true;
  // Secondary signal: catalog external ids that were stamped as showcase.
  if (
    typeof video.externalVideoId === 'string' &&
    PROTECTED_EXT_SET.has(video.externalVideoId) &&
    video.dateAdded === 'Theme showcase'
  ) {
    return true;
  }
  return false;
}

/**
 * Filters an owner `socialVideos` list for a delete operation.
 * Protected mock/default records are retained; only real owner rows matching
 * `id` are removed. Safe to call even when `id` points at a mock — the mock
 * stays in the list (and the public gallery would re-fill it anyway).
 */
export function filterDeletableOwnerVideos(
  list: readonly SocialVideo[] | null | undefined,
  idToRemove: string,
): SocialVideo[] {
  const source = Array.isArray(list) ? list : [];
  // Never drop protected mocks, even if the caller asked to delete that id.
  return source.filter((video) => {
    if (isProtectedThemeMockVideo(video)) return true;
    return video.id !== idToRemove;
  });
}

/** True when removing `id` would be a no-op because the target is protected. */
export function isDeleteBlockedForVideoId(
  list: readonly SocialVideo[] | null | undefined,
  idToRemove: string,
): boolean {
  const target = (list || []).find((v) => v.id === idToRemove);
  if (!target) return isThemeMockVideoId(idToRemove);
  return isProtectedThemeMockVideo(target);
}

/* ------------------------------------------------------------------ */
/* PHASE 15.6 — per-salon admin disable (tombstone) of showcase mocks  */
/* ------------------------------------------------------------------ */

/**
 * True when a protected theme mock id has been disabled FOR ONE SALON by an
 * admin (`SalonData.disabledThemeVideoIds`). The shared catalog is never
 * mutated — other salons and themes keep their showcase videos.
 */
export function isDisabledThemeMockId(
  disabledIds: readonly string[] | null | undefined,
  id: unknown,
): boolean {
  if (typeof id !== 'string' || !id) return false;
  if (!Array.isArray(disabledIds)) return false;
  return disabledIds.includes(id);
}

/**
 * The effective showcase catalog for one salon + theme: protected mock rows
 * with the salon's disabled ids removed. Used by the 15.6-aware gallery fill
 * and the management panel.
 */
export function activeThemeVideoCatalog(
  themeId: SiteHeaderThemeId,
  disabledIds?: readonly string[] | null,
): SocialVideo[] {
  return themeVideoCatalog(themeId).filter((video) => !isDisabledThemeMockId(disabledIds, video.id));
}

/**
 * Theme-specific content vocabulary keywords used by acceptance tests to
 * confirm mock copy matches the theme (not copied across themes).
 */
export const THEME_MOCK_CONTENT_HINTS: Record<SiteHeaderThemeId, readonly string[]> = {
  barber_mens_grooming: ['fade', 'beard', 'shave', 'taper', 'razor', 'grooming', 'shop'],
  hair_studio_color_bar: ['balayage', 'colour', 'color', 'blowout', 'gloss', 'keratin', 'blonde', 'fringe'],
  beauty_skin_spa: ['facial', 'spa', 'mask', 'serum', 'bridal', 'skin', 'stone', 'glow'],
  family_full_service: ['kids', 'family', 'dad', 'mom', 'school', 'women', 'men', 'chair'],
  nail_lash_studio: ['nail', 'lash', 'brow', 'chrome', 'gel', 'mani', 'pedi', 'french'],
};

/** All titles in the mock catalog for one theme (EN). */
export function themeMockTitles(themeId: SiteHeaderThemeId): string[] {
  return themeVideoSeeds(themeId).map((s) => s.title);
}

/** All descriptions in the mock catalog for one theme. */
export function themeMockDescriptions(themeId: SiteHeaderThemeId): string[] {
  return themeVideoSeeds(themeId).map((s) => s.description || '');
}

/** All thumbnail URLs in the mock catalog for one theme. */
export function themeMockThumbnailUrls(themeId: SiteHeaderThemeId): string[] {
  return themeVideoCatalog(themeId).map((v) => v.thumbnailUrl);
}
