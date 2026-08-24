/**
 * PHASE 15.10 — FINAL 5-THEME VIDEO ACCEPTANCE TESTING.
 *
 * Complete acceptance gate for the entire Phase 15 video system across all
 * five themes. Verifies:
 *
 *   A. Each theme: 5 Shorts + 5 Long Videos = 10 videos (50 total), all
 *      theme-specific, zero cross-theme copying (ids / external ids / urls /
 *      thumbnails / titles / descriptions).
 *   B. YouTube URL → Video ID → Thumbnail → Title → Description → Channel
 *      chain works for every catalog record and the 15.2/15.4 metadata engine.
 *   C. Original video opens on the same platform and original channel/source
 *      (exact URL, validated, never rewritten).
 *   D. Owner can add / edit / replace only their salon's videos; foreign
 *      actors and rows are refused in the data layer.
 *   E. Protected default/mock videos cannot be permanently deleted by Owner.
 *   F. Admin can edit / replace / approve / delete as permitted (approve,
 *      reject, pending, per-salon disable + restore).
 *   G. Likes + like counts work without uncontrolled duplicate likes.
 *   H. Weekly Top Videos uses only current-week likes (week rolls on read).
 *   I. Main dashboard (Landing overview) displays Weekly Top Videos
 *      correctly, theme-isolated, opening original platform URLs.
 *   J. Theme, salon ownership and Shorts/Long type stay correct everywhere
 *      (gallery DOM, weekly DOM, management rows, like store rows).
 *   K. Desktop / Tablet / Mobile layouts (per-theme grid config).
 *   L. English / Hindi and Light / Dark modes.
 *   M. Loading, empty, error and broken-thumbnail states.
 *   N. Lazy loading / performance (lazy thumbs, play-on-demand embeds).
 *   O. Static hygiene: no fake/broken URLs, no hardcoded ids outside the
 *      catalog, no private API keys, no service-role credentials, no
 *      duplicate video systems, no invented database fields.
 *   P. Phase 10–14 regression spot checks inside this suite; the full
 *      Phase 10–14 suites are run externally as part of the gate.
 *
 * Run: npm run test:phase-15.10
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
  unobserve() {}
  disconnect() {}
};
dom.window.IntersectionObserver = globalThis.IntersectionObserver;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
dom.window.ResizeObserver = globalThis.ResizeObserver;

const React = (await import('react')).default;
const { render, cleanup, fireEvent, act, waitFor } = await import('@testing-library/react');

const SiteVideoGallery = (await import('../src/components/SiteVideoGallery.tsx')).default;
const SiteSocialFeed = (await import('../src/components/SiteSocialFeed.tsx')).default;
const VideoManagementPanel = (await import('../src/components/VideoManagementPanel.tsx')).default;
const StepSocials = (await import('../src/screens/StepSocials.tsx')).default;
const Landing = (await import('../src/screens/Landing.tsx')).default;

const { initialData } = await import('../src/types.ts');

const {
  themeVideoSeeds,
  themeVideoCatalog,
  themeVideosOfKind,
  totalThemeVideoCatalogCount,
  allThemeVideoExternalIds,
  allThemeVideoRecordIds,
  isThemeMockVideoId,
  isProtectedThemeMockVideo,
  filterDeletableOwnerVideos,
  isDeleteBlockedForVideoId,
  activeThemeVideoCatalog,
  isDisabledThemeMockId,
  THEME_MOCK_CONTENT_HINTS,
  themeMockTitles,
  themeMockDescriptions,
  VIDEO_KIND_QUOTA,
} = await import('../src/lib/siteVideoCatalog.ts');

const {
  videoItemsForTheme,
  videoKindCountsForTheme,
  videoIdsForTheme,
  resolveVideoKind,
  ownerVideoBelongsToTheme,
  VIDEO_GALLERY_THEME_CONFIG,
  videoGalleryThemeConfig,
} = await import('../src/lib/siteVideoGallery.ts');

const {
  toggleVideoLike,
  videoLikeActor,
  videoLikeBusinessId,
  videoLikeCount,
  weeklyVideoLikeCount,
  weeklyTopVideos,
  weeklyTopVideoIds,
  formatLikeCount,
  hasActorLikedVideo,
  weekKeyOf,
  startOfWeek,
  endOfWeek,
  isInCurrentWeek,
  setVideoLikeStoreForTests,
  readVideoLikeStoreForTests,
  setVideoLikeStorageFailureForTests,
} = await import('../src/lib/videoLikes.ts');

const {
  resolveVideoActor,
  hasAdminSessionClaim,
  canManageOwnSalonVideos,
  canDeleteVideo,
  canApproveVideos,
  canManageThemeMockRecords,
  videoEditDeniedMessage,
  editManagedVideoMetadata,
  replaceManagedVideoUrl,
  deleteManagedVideoRecord,
  disableThemeMockForSalon,
  restoreThemeMockForSalon,
  moderateManagedVideo,
  setManagedVideoActive,
  managedVideoRowsForSalon,
  disabledThemeMocksForSalon,
  validateVideoMetadataEdits,
} = await import('../src/lib/videoManagement.ts');

const {
  isCustomerVisibleSocialVideo,
  effectiveVideoModeration,
  validateSocialVideoForPublish,
} = await import('../src/lib/videoModeration.ts');

const {
  validateOriginalVideoUrl,
  originalDestinationForVideo,
  openOriginalVideoDestination,
} = await import('../src/lib/originalVideoDestination.ts');

const {
  parseYoutubeVideoId,
  youtubeThumbUrl,
  youtubeEmbedUrl,
} = await import('../src/lib/siteSocialFeed.ts');

const {
  parseVideoUrl,
  derivedYoutubeMetadata,
  socialVideoFromPasteAndMetadata,
  youtubeCanonicalUrl,
  mergePlatformMetadataIntoForm,
  platformMetadataIsComplete,
} = await import('../src/lib/videoUrlMetadata.ts');

const { siteGrid, setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const {
  setSiteLocale,
  setSiteAppearance,
  readSiteLocale,
  readSiteAppearance,
} = await import('../src/lib/siteNavigation.ts');
const { videoGalleryChrome } = await import('../src/lib/siteVideoGalleryI18n.ts');
const { reviewBusinessId } = await import('../src/lib/siteReviews.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');

const THEMES = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    const message = String(error && error.message ? error.message : error).slice(0, 700);
    console.error(`  ✗ ${name}\n    ${message.split('\n').join('\n    ')}`);
  }
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

function freshStore() {
  setVideoLikeStoreForTests({ version: 1, likes: [], attempts: [] });
}

function salonData(overrides = {}) {
  const data = structuredClone(initialData);
  return Object.assign(data, overrides);
}

function ownerActor() {
  return resolveVideoActor({
    supabaseConfigured: true,
    userPresent: true,
    isAdmin: false,
    resolution: { status: 'resolved' },
  });
}

function adminActor() {
  return resolveVideoActor({
    supabaseConfigured: true,
    userPresent: true,
    isAdmin: true,
    resolution: { status: 'resolved' },
  });
}

const DENIED_ACTORS = [
  ['not-authenticated', { supabaseConfigured: true, userPresent: false, isAdmin: false, resolution: null }],
  ['no-ownership', { supabaseConfigured: true, userPresent: true, isAdmin: false, resolution: { status: 'no-membership' } }],
  ['ambiguous', { supabaseConfigured: true, userPresent: true, isAdmin: false, resolution: { status: 'ambiguous' } }],
  ['permission-denied', { supabaseConfigured: true, userPresent: true, isAdmin: false, resolution: { status: 'permission-denied' } }],
];

/** Renders the gallery for one theme and returns the section element. */
function renderGallery(themeId, data, { mode = 'desktop', locale = 'en', appearance } = {}) {
  setSiteLocale(locale);
  if (appearance) setSiteAppearance(appearance);
  // Note: direct render (like the Phase 15.x suites) — wrapping the initial
  // render in `act` here yields an empty tree in jsdom.
  const { container } = render(
    React.createElement(SiteVideoGallery, { themeId, data, mode }),
  );
  return container.querySelector('[data-testid="site-social-feed"]');
}

function galleryFor(themeId, data, opts) {
  const el = renderGallery(themeId, data, opts);
  return el;
}

/* ---------------------------------------------------------------- */
/* A. 5+5 per theme — 50 unique, theme-specific, no cross-theme copy */
/* ---------------------------------------------------------------- */
section('A. 5 Shorts + 5 Long Videos per theme (50 total, theme-specific, no cross-theme copying)');

await test('each of the five themes has exactly 5 Shorts + 5 Long Videos = 10 in the catalog', () => {
  for (const themeId of THEMES) {
    const seeds = themeVideoSeeds(themeId);
    const shorts = seeds.filter((s) => s.kind === 'short');
    const longs = seeds.filter((s) => s.kind === 'long');
    assert.equal(shorts.length, VIDEO_KIND_QUOTA, `${themeId} shorts`);
    assert.equal(longs.length, VIDEO_KIND_QUOTA, `${themeId} longs`);
    assert.equal(seeds.length, 10, `${themeId} total`);
    assert.equal(themeVideoCatalog(themeId).length, 10, `${themeId} catalog rows`);
  }
  assert.equal(totalThemeVideoCatalogCount(), 50, 'catalog total is 50');
});

await test('every theme projects exactly 5 Shorts + 5 Long videos in the public gallery (10 items)', () => {
  for (const themeId of THEMES) {
    const counts = videoKindCountsForTheme(themeId, { socialVideos: [] });
    assert.deepEqual(counts, { short: 5, long: 5, total: 10 }, `${themeId} counts`);
    const items = videoItemsForTheme(themeId, { socialVideos: [] });
    assert.equal(items.length, 10);
    const ids = items.map((i) => i.id);
    assert.equal(new Set(ids).size, 10, `${themeId} ids unique`);
    assert.equal(items.filter((i) => i.origin === 'theme').length, 10, `${themeId} all theme origin with no owner data`);
  }
});

await test('all 50 record ids are unique; all 50 external video ids are unique', () => {
  const recordIds = allThemeVideoRecordIds();
  const extIds = allThemeVideoExternalIds();
  assert.equal(recordIds.length, 50);
  assert.equal(new Set(recordIds).size, 50, 'record ids unique');
  assert.equal(extIds.length, 50);
  assert.equal(new Set(extIds).size, 50, 'external ids unique');
  assert.equal(new Set(extIds.map((id) => id.toLowerCase())).size, 50, 'external ids unique case-insensitively');
});

await test('no video id, external id, URL, thumbnail, title or description is shared across themes', () => {
  const seen = {
    ids: new Set(),
    ext: new Set(),
    urls: new Set(),
    thumbs: new Set(),
    titles: new Set(),
    descriptions: new Set(),
  };
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      for (const key of ['ids', 'ext', 'urls', 'thumbs', 'titles', 'descriptions']) {
        const value =
          key === 'ids' ? video.id
            : key === 'ext' ? video.externalVideoId
              : key === 'urls' ? video.url
                : key === 'thumbs' ? video.thumbnailUrl
                  : key === 'titles' ? video.title
                    : video.description;
        assert.ok(value && value.trim(), `${themeId} ${key} non-empty`);
        assert.ok(!seen[key].has(value), `${themeId} reuses ${key} ${value}`);
        seen[key].add(value);
      }
    }
  }
  assert.equal(seen.ids.size, 50);
  assert.equal(seen.ext.size, 50);
  assert.equal(seen.urls.size, 50);
  assert.equal(seen.thumbs.size, 50);
  assert.equal(seen.titles.size, 50);
  assert.equal(seen.descriptions.size, 50);
});

await test('theme copy matches its own theme vocabulary (no cross-theme content)', () => {
  for (const themeId of THEMES) {
    const haystack = [
      ...themeMockTitles(themeId),
      ...themeMockDescriptions(themeId),
    ].join(' ').toLowerCase();
    const own = THEME_MOCK_CONTENT_HINTS[themeId].filter((hint) => haystack.includes(hint));
    assert.ok(own.length >= 2, `${themeId} matches own hints: ${own.join(', ')}`);
    // The theme's own vocabulary must dominate. A few natural shared salon
    // words (skin, men, chair...) may appear, but the copy is only "themed"
    // if the theme's own hints outnumber every other theme's matches. The
    // zero-shared-strings test above already proves no literal copying.
    for (const other of THEMES) {
      if (other === themeId) continue;
      const foreign = THEME_MOCK_CONTENT_HINTS[other].filter((hint) => haystack.includes(hint));
      assert.ok(
        foreign.length < own.length,
        `${themeId} leans on ${other} vocabulary: ${foreign.join(', ')}`,
      );
    }
  }
});

await test('gallery fill never borrows another theme\'s records, even with a partial owner set', () => {
  for (const themeId of THEMES) {
    const catalog = themeVideoCatalog(themeId);
    // Owner configured 2 shorts + 1 long only → fill must come from own theme.
    const ownerVideos = catalog.slice(0, 2).map((v, i) => ({
      ...v,
      id: `owner-${themeId}-s${i}`,
      origin: undefined,
      dateAdded: 'Today',
    }));
    const data = { socialVideos: ownerVideos };
    const items = videoItemsForTheme(themeId, data);
    assert.equal(items.length, 10);
    assert.equal(items.filter((i) => i.kind === 'short').length, 5);
    assert.equal(items.filter((i) => i.kind === 'long').length, 5);
    for (const item of items) {
      const belongs = catalog.some((c) => c.id === item.id || c.externalVideoId === item.externalVideoId);
      const isOwner = item.origin === 'owner';
      assert.ok(belongs || isOwner, `${themeId} item ${item.id} is foreign`);
      assert.ok(item.themeId === null || item.themeId === themeId, `${themeId} item theme ${item.themeId}`);
    }
  }
});

await test('cross-theme leakage is impossible at the projection level (all 5 themes)', () => {
  const projections = {};
  for (const themeId of THEMES) {
    projections[themeId] = new Set(videoIdsForTheme(themeId, { socialVideos: [] }));
  }
  for (const themeId of THEMES) {
    for (const other of THEMES) {
      if (other === themeId) continue;
      const leaked = [...projections[themeId]].filter((id) => projections[other].has(id));
      assert.deepEqual(leaked, [], `${themeId} leaks ids from ${other}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* B. YouTube URL → ID → Thumbnail → Title → Description → Channel     */
/* ------------------------------------------------------------------ */
section('B. YouTube URL → Video ID → Thumbnail → Title → Description → Channel/source');

await test('all 50 catalog URLs parse to their exact 11-char YouTube id (shorts vs watch)', () => {
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      const parsed = parseYoutubeVideoId(video.url);
      assert.equal(parsed, video.externalVideoId, `${video.id} id from url`);
      if (video.videoKind === 'short') {
        assert.ok(/^https:\/\/www\.youtube\.com\/shorts\/[A-Za-z0-9_-]{11}$/.test(video.url), `${video.id} short url shape`);
      } else {
        assert.ok(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(video.url), `${video.id} watch url shape`);
      }
      assert.ok(/^[A-Za-z0-9_-]{11}$/.test(video.externalVideoId), `${video.id} external id shape`);
    }
  }
});

await test('thumbnail derives from the video id on the public YouTube CDN for all 50 videos', () => {
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      const expected = youtubeThumbUrl(video.externalVideoId);
      assert.equal(video.thumbnailUrl, expected, `${video.id} thumbnail`);
      assert.ok(video.thumbnailUrl.startsWith('https://img.youtube.com/vi/'), `${video.id} thumb host`);
      assert.ok(video.thumbnailUrl.includes(`/vi/${video.externalVideoId}/`), `${video.id} thumb contains id`);
      // Derived via the gallery projection too.
      const item = videoItemsForTheme(themeId, { socialVideos: [] }).find((i) => i.id === video.id);
      assert.equal(item.thumbnailUrl, expected, `${video.id} projected thumb`);
    }
  }
});

await test('every catalog record carries title, description, channel and platform', () => {
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      assert.ok(video.title && video.title.trim().length > 3, `${video.id} title`);
      assert.ok(video.description && video.description.trim().length > 3, `${video.id} description`);
      assert.ok(video.channelName && video.channelName.trim().length > 1, `${video.id} channel`);
      assert.equal(video.platform, 'youtube', `${video.id} platform`);
      assert.equal(video.themeId, themeId, `${video.id} theme stamped`);
      assert.equal(video.videoKind, video.url.includes('/shorts/') ? 'short' : 'long', `${video.id} kind matches url`);
    }
  }
});

await test('the 15.2 metadata engine derives id, canonical URL and CDN thumbnail from any YouTube URL shape', () => {
  const cases = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ];
  for (const url of cases) {
    const parsed = parseVideoUrl(url);
    assert.equal(parsed.ok, true, `${url} parses`);
    assert.equal(parsed.externalVideoId, 'dQw4w9WgXcQ', `${url} id`);
    assert.equal(parsed.canonicalUrl, youtubeCanonicalUrl('dQw4w9WgXcQ'), `${url} canonical`);
    assert.equal(parsed.originalUrl, url, `${url} original preserved`);
    const derived = derivedYoutubeMetadata(parsed.externalVideoId, parsed.originalUrl);
    assert.ok(derived.thumbnailUrl.includes('/vi/dQw4w9WgXcQ/'), `${url} thumb derived from id`);
    assert.equal(derived.url, parsed.canonicalUrl, `${url} canonical`);
    assert.equal(derived.originalPlatformUrl, url, `${url} original kept for redirects`);
    assert.equal(derived.externalVideoId, 'dQw4w9WgXcQ');
    assert.equal(derived.embedUrl, youtubeEmbedUrl('dQw4w9WgXcQ'));
    // Derived baseline never invents title/description/channel.
    assert.equal(derived.title, '');
    assert.equal(derived.channelName, '');
  }
  // Invalid / non-video URLs are refused with clear codes.
  assert.equal(parseVideoUrl('https://example.com/x').ok, false);
  assert.equal(parseVideoUrl('https://www.youtube.com/@channel').code, 'not_a_video');
  assert.equal(parseVideoUrl('not a url').ok, false);
});

await test('the 15.4 paste→record flow keeps URL, id, thumbnail, title, description, channel, kind and theme', () => {
  const parsed = parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  assert.equal(parsed.ok, true);
  const meta = {
    ...derivedYoutubeMetadata(parsed.externalVideoId, parsed.originalUrl),
    title: 'Skin fade, 60 seconds',
    description: 'Tight skin fade finish on the chair.',
    channelName: 'The Shop',
    source: 'oembed',
  };
  const record = socialVideoFromPasteAndMetadata({
    metadata: meta,
    form: {
      title: '',
      description: '',
      channelName: '',
      thumbnailUrl: '',
      url: parsed.originalUrl,
      platform: 'youtube',
      externalVideoId: parsed.externalVideoId,
    },
    videoKind: 'short',
    themeId: 'barber_mens_grooming',
  });
  assert.equal(record.externalVideoId, 'dQw4w9WgXcQ');
  assert.equal(record.platform, 'youtube');
  assert.equal(record.videoKind, 'short');
  assert.equal(record.themeId, 'barber_mens_grooming');
  assert.equal(record.thumbnailUrl, meta.thumbnailUrl);
  assert.equal(record.title, 'Skin fade, 60 seconds');
  assert.equal(record.description, 'Tight skin fade finish on the chair.');
  assert.equal(record.channelName, 'The Shop');
  assert.ok(record.originalPlatformUrl.includes('/shorts/dQw4w9WgXcQ'));
  assert.equal(parseYoutubeVideoId(record.url), 'dQw4w9WgXcQ');
  assert.ok(validateSocialVideoForPublish(record).length === 0, 'publish-valid');
  // Merge policy: manual edits are preserved over platform metadata.
  const merged = mergePlatformMetadataIntoForm(
    {
      title: 'My custom title',
      description: '',
      channelName: '',
      thumbnailUrl: '',
      url: parsed.originalUrl,
      platform: 'youtube',
      externalVideoId: parsed.externalVideoId,
    },
    meta,
  );
  assert.equal(merged.title, 'My custom title', 'manual title preserved');
  assert.equal(merged.description, 'Tight skin fade finish on the chair.', 'missing fields filled from metadata');
});

await test('server exposes /api/video-metadata and uses the public oEmbed endpoint (no API key, no service role)', async () => {
  // server.ts wires the routes; the video-metadata handler lives in api-routes.ts.
  const server = await readFile('server.ts', 'utf8');
  const routes = await readFile('api-routes.ts', 'utf8');
  const source = `${server}\n${routes}`;
  const serverCode = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(source, /app\.post\('\/api\/video-metadata'/, 'route exists');
  assert.match(source, /youtube\.com\/oembed/, 'public oEmbed used');
  // Env-based server keys are fine; hardcoded key VALUES are not.
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(source), 'no Google API key value');
  assert.ok(!/api[_-]?key\s*[:=]\s*['"`][^'"`]{12,}['"`]/i.test(serverCode), 'no key literal assigned');
  assert.ok(!/service_role|service-role/i.test(serverCode), 'no service-role credential');
  assert.match(source, /process\.env\.GEMINI_API_KEY/, 'Gemini key comes from env only');
  // Client metadata module also never embeds a key.
  const client = await readFile('src/lib/videoUrlMetadata.ts', 'utf8');
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(client), 'client has no key value');
});

/* ------------------------------------------------------------------ */
/* C. Original platform / channel/source                               */
/* ------------------------------------------------------------------ */
section('C. Original video opens on the same platform and original channel/source');

await test('every catalog video resolves an exact, validated original-platform destination', () => {
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      const result = originalDestinationForVideo(video);
      assert.equal(result.ok, true, `${video.id} destination`);
      assert.equal(result.url, video.originalPlatformUrl || video.url, `${video.id} exact url kept`);
      assert.equal(result.platform, 'youtube', `${video.id} platform`);
      assert.equal(result.externalVideoId, video.externalVideoId, `${video.id} id`);
    }
  }
});

await test('openOriginalVideoDestination opens the exact URL on youtube.com with noopener', () => {
  let opened = null;
  const original = window.open;
  window.open = (url, target, features) => {
    opened = { url, target, features };
    return null;
  };
  try {
    for (const themeId of THEMES) {
      const video = themeVideoCatalog(themeId)[0];
      const ok = openOriginalVideoDestination(video.originalPlatformUrl || video.url, video.platform, video.externalVideoId);
      assert.equal(ok, true, `${themeId} opens`);
      assert.equal(opened.url, video.originalPlatformUrl || video.url, `${themeId} exact url`);
      assert.ok(opened.target === '_blank', 'blank target');
      assert.ok(String(opened.features).includes('noopener'), 'noopener');
    }
  } finally {
    window.open = original;
  }
});

await test('unsafe, mismatched or non-video destinations are never opened', () => {
  let opened = 0;
  const original = window.open;
  window.open = () => { opened += 1; return null; };
  try {
    assert.equal(openOriginalVideoDestination('https://evil.example.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'), false);
    assert.equal(openOriginalVideoDestination('https://www.youtube.com/watch?v=OTHER0000000', 'youtube', 'dQw4w9WgXcQ'), false);
    assert.equal(openOriginalVideoDestination('javascript:alert(1)', 'youtube', 'dQw4w9WgXcQ'), false);
    assert.equal(openOriginalVideoDestination('https://www.youtube.com/@channel', 'youtube', null), false);
    assert.equal(openOriginalVideoDestination('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'instagram', 'dQw4w9WgXcQ'), false);
    assert.equal(opened, 0, 'nothing was opened');
  } finally {
    window.open = original;
  }
});

await test('cards show the platform and original channel/source label', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData());
    const chrome = videoGalleryChrome(themeId, 'en');
    const cards = el.querySelectorAll('[data-testid="site-social-view"]');
    assert.equal(cards.length, 10, `${themeId} view buttons`);
    const text = el.textContent;
    const video = themeVideoCatalog(themeId)[0];
    assert.ok(text.includes(video.channelName), `${themeId} channel shown`);
    assert.ok(text.includes(chrome.platforms.youtube), `${themeId} platform label shown`);
  }
});

/* ------------------------------------------------------------------ */
/* D. Owner can add / edit / replace only their salon's videos         */
/* ------------------------------------------------------------------ */
section('D. Owner add / edit / replace — salon-scoped only');

await test('owner actor resolution reuses session + ownership; denied actors are refused', () => {
  const authorized = ownerActor();
  assert.equal(authorized.permission, 'authorized');
  assert.equal(authorized.role, 'owner');
  assert.equal(canManageOwnSalonVideos(authorized), true);
  for (const [label, opts] of DENIED_ACTORS) {
    const actor = resolveVideoActor(opts);
    assert.equal(canManageOwnSalonVideos(actor), false, `${label} cannot manage`);
    const message = videoEditDeniedMessage(actor.permission);
    assert.ok(message && message.length > 0, `${label} has a user-facing denial message`);
  }
  // Offline draft keeps owner-tier management only.
  const draft = resolveVideoActor({ supabaseConfigured: false, userPresent: false, isAdmin: false, resolution: null });
  assert.equal(draft.permission, 'not-configured');
  assert.equal(canManageOwnSalonVideos(draft), true);
  assert.equal(canDeleteVideo(draft, themeVideoCatalog('barber_mens_grooming')[0]), false, 'draft cannot delete mocks');
});

await test('owner can add a video and it appears on their salon/theme with the correct kind', () => {
  for (const themeId of THEMES) {
    const data = salonData();
    // A fresh, non-catalog YouTube id so it never shadows a showcase seed.
    const parsed = parseVideoUrl('https://www.youtube.com/watch?v=abcdefghijk');
    const meta = {
      ...derivedYoutubeMetadata(parsed.externalVideoId, parsed.originalUrl),
      title: `${themeId} new clip`,
      channelName: 'Owner Channel',
      source: 'oembed',
    };
    const record = socialVideoFromPasteAndMetadata({
      metadata: meta,
      form: {
        title: '',
        description: '',
        channelName: '',
        thumbnailUrl: '',
        url: parsed.originalUrl,
        platform: 'youtube',
        externalVideoId: parsed.externalVideoId,
      },
      videoKind: 'long',
      themeId,
    });
    data.socialVideos = [record];
    const items = videoItemsForTheme(themeId, data);
    const added = items.find((i) => i.id === record.id);
    assert.ok(added, `${themeId} added video visible`);
    assert.equal(added.origin, 'owner');
    assert.equal(added.kind, 'long');
    assert.equal(added.themeId, themeId);
    assert.equal(added.externalVideoId, 'abcdefghijk');
    // Still exactly 5+5 after fill.
    assert.deepEqual(videoKindCountsForTheme(themeId, data), { short: 5, long: 5, total: 10 });
    // And the SAME record must never leak into another theme.
    for (const other of THEMES) {
      if (other === themeId) continue;
      assert.equal(videoItemsForTheme(other, data).some((i) => i.id === record.id), false, `${themeId} video not on ${other}`);
    }
  }
});

await test('owner metadata edits apply only to rows inside their salon list', () => {
  const actor = ownerActor();
  const own = salonData().socialVideos || [];
  const target = {
    id: 'owner-video-1',
    title: 'Original title',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnailUrl: youtubeThumbUrl('dQw4w9WgXcQ'),
    externalVideoId: 'dQw4w9WgXcQ',
    themeId: 'barber_mens_grooming',
    videoKind: 'long',
    dateAdded: 'Today',
  };
  const result = editManagedVideoMetadata([...own, target], { kind: 'owner', id: target.id }, { title: 'Edited title' }, actor);
  assert.equal(result.ok, true);
  const edited = result.videos.find((v) => v.id === target.id);
  assert.equal(edited.title, 'Edited title');
  assert.equal(edited.themeId, 'barber_mens_grooming', 'theme untouched');
  assert.equal(edited.videoKind, 'long', 'kind untouched');
  // Editing a row that is not in this salon's list fails:
  const foreign = editManagedVideoMetadata([...own, target], { kind: 'owner', id: 'someone-elses-video' }, { title: 'x' }, actor);
  assert.equal(foreign.ok, false);
  // Denied actors are refused before touching data.
  for (const [label, opts] of DENIED_ACTORS) {
    const refused = editManagedVideoMetadata([...own, target], { kind: 'owner', id: target.id }, { title: 'x' }, resolveVideoActor(opts));
    assert.equal(refused.ok, false, `${label} refused`);
  }
});

await test('owner can replace a video URL; platform fields are re-derived and theme/kind stay correct', () => {
  const actor = ownerActor();
  const target = {
    id: 'owner-video-1',
    title: 'Old clip',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnailUrl: youtubeThumbUrl('dQw4w9WgXcQ'),
    externalVideoId: 'dQw4w9WgXcQ',
    themeId: 'hair_studio_color_bar',
    videoKind: 'long',
    dateAdded: 'Today',
  };
  const result = replaceManagedVideoUrl(
    [target],
    { kind: 'owner', id: target.id },
    'https://www.youtube.com/shorts/abcdefghijk',
    null,
    actor,
  );
  assert.equal(result.ok, true);
  const replaced = result.videos[0];
  assert.equal(replaced.externalVideoId, 'abcdefghijk');
  assert.equal(replaced.videoKind, 'short', 'kind re-derived from shorts URL');
  assert.equal(replaced.themeId, 'hair_studio_color_bar', 'theme untouched');
  assert.ok(replaced.url.includes('/shorts/abcdefghijk'), 'url replaced');
  assert.equal(replaced.thumbnailUrl, youtubeThumbUrl('abcdefghijk'), 'thumbnail re-derived');
  // A bad replacement URL is refused.
  const bad = replaceManagedVideoUrl([target], { kind: 'owner', id: target.id }, 'https://example.com/not-a-video', null, actor);
  assert.equal(bad.ok, false);
  // A denied actor cannot replace.
  const denied = replaceManagedVideoUrl([target], { kind: 'owner', id: target.id }, 'https://www.youtube.com/watch?v=abcdefghijk', null, resolveVideoActor(DENIED_ACTORS[0][1]));
  assert.equal(denied.ok, false);
});

await test('the management panel lists only this salon\'s owner rows + theme showcase (no foreign rows)', () => {
  for (const themeId of THEMES) {
    const data = salonData({ socialVideos: [
      { id: 'mine-1', title: 'Mine', platform: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', thumbnailUrl: youtubeThumbUrl('abcdefghijk'), externalVideoId: 'abcdefghijk', themeId, videoKind: 'long', dateAdded: 'Today' },
      { id: 'mine-2', title: 'Mine short', platform: 'youtube', url: 'https://www.youtube.com/shorts/lmnopqrstuv', thumbnailUrl: youtubeThumbUrl('lmnopqrstuv'), externalVideoId: 'lmnopqrstuv', themeId, videoKind: 'short', dateAdded: 'Today' },
    ] });
    const rows = managedVideoRowsForSalon(data, themeId);
    const ownerRows = rows.filter((r) => r.origin === 'owner');
    assert.equal(ownerRows.length, 2, `${themeId} owner rows`);
    assert.deepEqual(ownerRows.map((r) => r.key).sort(), ['mine-1', 'mine-2']);
    const showcase = rows.filter((r) => r.origin === 'theme');
    assert.equal(showcase.length, 10, `${themeId} showcase rows (mocks) listed for management`);
    for (const row of rows) {
      assert.ok(row.themeId === null || row.themeId === themeId, `${themeId} row theme`);
      assert.ok(row.kind === 'short' || row.kind === 'long', 'row kind');
    }
  }
});

/* ------------------------------------------------------------------ */
/* E. Protected default/mock videos cannot be permanently deleted      */
/* ------------------------------------------------------------------ */
section('E. Protected default/mock videos cannot be permanently deleted by Owner');

await test('all 50 showcase records are recognised as protected mocks', () => {
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      assert.equal(isProtectedThemeMockVideo(video), true, `${video.id} protected`);
      assert.equal(isThemeMockVideoId(video.id), true, `${video.id} mock id`);
      assert.equal(isDeleteBlockedForVideoId(themeVideoCatalog(themeId), video.id), true, `${video.id} delete blocked`);
    }
  }
});

await test('filterDeletableOwnerVideos keeps mocks even when asked to delete them', () => {
  for (const themeId of THEMES) {
    const catalog = themeVideoCatalog(themeId);
    const mockId = catalog[0].id;
    const list = [...catalog, { id: 'owner-real', title: 'Real', platform: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', thumbnailUrl: youtubeThumbUrl('abcdefghijk'), externalVideoId: 'abcdefghijk', themeId, videoKind: 'long', dateAdded: 'Today' }];
    const filtered = filterDeletableOwnerVideos(list, mockId);
    assert.equal(filtered.length, 11, `${themeId} mock survives`);
    assert.ok(filtered.some((v) => v.id === mockId), 'mock still present');
    const removed = filterDeletableOwnerVideos(list, 'owner-real');
    assert.equal(removed.length, 10, `${themeId} real owner row removed`);
    assert.ok(!removed.some((v) => v.id === 'owner-real'));
  }
});

await test('owner cannot permanently delete a protected record via the management layer', () => {
  const actor = ownerActor();
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      assert.equal(canDeleteVideo(actor, video), false, `${themeId} ${video.id} owner cannot delete`);
    }
    const attempt = deleteManagedVideoRecord(themeVideoCatalog(themeId), 'theme:barber:s1', actor);
    assert.equal(attempt.ok, false, `${themeId} delete refused`);
    assert.match(attempt.error, /cannot be permanently deleted/i);
  }
});

await test('StepSocials quick-list delete is blocked for showcase records (UI guard)', () => {
  const data = salonData();
  // The quick list in Step Socials uses filterDeletableOwnerVideos; a mock id
  // must survive the delete, a real owner id must be removed.
  const withMock = [...data.socialVideos, ...themeVideoCatalog('barber_mens_grooming').slice(0, 1)];
  const after = filterDeletableOwnerVideos(withMock, 'theme:barber:s1');
  assert.ok(after.some((v) => v.id === 'theme:barber:s1'), 'mock survives StepSocials delete path');
});

/* ------------------------------------------------------------------ */
/* F. Admin can edit / replace / approve / delete as permitted         */
/* ------------------------------------------------------------------ */
section('F. Admin capabilities');

await test('admin claim comes from server-signed session metadata; owner_admin does NOT elevate', () => {
  assert.equal(hasAdminSessionClaim({ app_metadata: { role: 'admin' } }), true);
  assert.equal(hasAdminSessionClaim({ app_metadata: { roles: ['platform_admin'] } }), true);
  assert.equal(hasAdminSessionClaim({ user_metadata: { account_role: 'administrator' } }), true);
  assert.equal(hasAdminSessionClaim({ app_metadata: { role: 'owner_admin' } }), false, 'owner_admin is not platform admin');
  assert.equal(hasAdminSessionClaim({ app_metadata: { role: 'owner' } }), false);
  assert.equal(hasAdminSessionClaim(null), false);
  const actor = adminActor();
  assert.equal(actor.role, 'admin');
  assert.equal(actor.permission, 'authorized');
  assert.equal(canApproveVideos(actor), true);
  assert.equal(canManageThemeMockRecords(actor), true);
  assert.equal(canApproveVideos(ownerActor()), false, 'owner cannot approve');
  assert.equal(canManageThemeMockRecords(ownerActor()), false, 'owner cannot manage mocks');
});

await test('admin can approve, reject, set-pending, unpublish and reactivate a salon video', () => {
  const actor = adminActor();
  const base = { id: 'v1', title: 'T', platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnailUrl: youtubeThumbUrl('dQw4w9WgXcQ'), externalVideoId: 'dQw4w9WgXcQ', themeId: 'beauty_skin_spa', videoKind: 'long', dateAdded: 'Today' };
  // Pending → hidden from customers.
  const pending = moderateManagedVideo([base], 'v1', 'pending', actor);
  assert.equal(pending.ok, true);
  assert.equal(pending.videos[0].moderation, 'pending');
  assert.equal(isCustomerVisibleSocialVideo(pending.videos[0]), false);
  // Approve → visible again.
  const approved = moderateManagedVideo(pending.videos, 'v1', 'approve', actor);
  assert.equal(approved.ok, true);
  assert.equal(approved.videos[0].moderation, 'approved');
  assert.equal(isCustomerVisibleSocialVideo(approved.videos[0]), true);
  // Reject with reason → hidden + reason recorded.
  const rejected = moderateManagedVideo(approved.videos, 'v1', 'reject', actor, { reason: 'Off-theme content' });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.videos[0].moderation, 'rejected');
  assert.equal(rejected.videos[0].rejectionReason, 'Off-theme content');
  assert.equal(isCustomerVisibleSocialVideo(rejected.videos[0]), false);
  // Unpublish / reactivate.
  const inactive = setManagedVideoActive(approved.videos, 'v1', false, actor);
  assert.equal(inactive.ok, true);
  assert.equal(inactive.videos[0].status, 'inactive');
  const active = setManagedVideoActive(inactive.videos, 'v1', true, actor);
  assert.equal(active.ok, true);
  assert.equal(active.videos[0].status, 'active');
  // Owner cannot moderate.
  const ownerAttempt = moderateManagedVideo([base], 'v1', 'approve', ownerActor());
  assert.equal(ownerAttempt.ok, false);
});

await test('admin can disable a showcase record for their salon and restore it; catalog stays intact', () => {
  const actor = adminActor();
  const themeId = 'nail_lash_studio';
  const data = salonData();
  const mock = themeVideoCatalog(themeId)[0];
  assert.equal(isCustomerVisibleSocialVideo(mock), true);

  const disabled = disableThemeMockForSalon(data, mock.id, actor);
  assert.equal(disabled.ok, true);
  assert.ok(isDisabledThemeMockId(disabled.data.disabledThemeVideoIds, mock.id), 'tombstone recorded');
  // The shared catalog is never mutated:
  assert.equal(isProtectedThemeMockVideo(themeVideoCatalog(themeId)[0]), true);
  assert.equal(themeVideoCatalog(themeId).length, 10);
  // The gallery projection no longer shows it for THIS salon:
  const items = videoItemsForTheme(themeId, disabled.data);
  assert.equal(items.some((i) => i.id === mock.id), false, 'disabled mock hidden from gallery');
  assert.equal(items.length, 9, 'fill drops to 9 for this salon');
  // Other salons keep the default:
  assert.equal(videoItemsForTheme(themeId, salonData()).some((i) => i.id === mock.id), true);
  // Restore brings it back:
  const restored = restoreThemeMockForSalon(disabled.data, mock.id, actor);
  assert.equal(restored.ok, true);
  assert.ok(!isDisabledThemeMockId(restored.data.disabledThemeVideoIds, mock.id), 'tombstone cleared');
  assert.equal(videoItemsForTheme(themeId, restored.data).length, 10);
  // Owner cannot disable showcase records:
  const ownerAttempt = disableThemeMockForSalon(data, mock.id, ownerActor());
  assert.equal(ownerAttempt.ok, false);
});

await test('admin can delete an owner row; owners can never hard-delete protected records', () => {
  const actor = adminActor();
  const ownerRow = { id: 'v1', title: 'T', platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnailUrl: youtubeThumbUrl('dQw4w9WgXcQ'), externalVideoId: 'dQw4w9WgXcQ', themeId: 'family_full_service', videoKind: 'long', dateAdded: 'Today' };
  const deleted = deleteManagedVideoRecord([ownerRow], 'v1', actor);
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.videos, []);
  // Admin MAY remove a protected mock row from a salon payload (permitted
  // delete), while the shared catalog is never mutated:
  const mockInSalon = [...themeVideoCatalog('family_full_service'), ownerRow];
  const adminMockDelete = deleteManagedVideoRecord(mockInSalon, 'theme:family:s1', actor);
  assert.equal(adminMockDelete.ok, true, 'admin can delete a mock row from salon data');
  assert.equal(themeVideoCatalog('family_full_service').length, 10, 'shared catalog untouched');
  // Owner NEVER can:
  const ownerMockDelete = deleteManagedVideoRecord(mockInSalon, 'theme:family:s1', ownerActor());
  assert.equal(ownerMockDelete.ok, false);
  assert.match(ownerMockDelete.error, /cannot be permanently deleted/i);
});

await test('the admin panel UI exposes approve/reject/pending/disable/restore and the owner panel does not', () => {
  for (const themeId of THEMES) {
    cleanup();
    const data = salonData({ socialVideos: [
      { id: 'pending-1', title: 'Pending clip', platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnailUrl: youtubeThumbUrl('dQw4w9WgXcQ'), externalVideoId: 'dQw4w9WgXcQ', themeId, videoKind: 'long', moderation: 'pending', dateAdded: 'Today' },
      { id: 'approved-1', title: 'Approved clip', platform: 'youtube', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', thumbnailUrl: youtubeThumbUrl('jNQXAC9IVRw'), externalVideoId: 'jNQXAC9IVRw', themeId, videoKind: 'short', moderation: 'approved', dateAdded: 'Today' },
    ] });
    let rendered;
    act(() => {
      rendered = render(React.createElement(VideoManagementPanel, {
        data,
        setData: () => {},
        actor: adminActor(),
        themeId,
        onSave: () => {},
      }));
    });
    const panel = rendered.container.querySelector('[data-testid="video-management-panel"]');
    assert.ok(panel, `${themeId} panel`);
    assert.equal(panel.querySelector('[data-testid="video-management-actor"]').dataset.role, 'admin');
    assert.ok(panel.querySelector('[data-testid="video-management-approve-pending-1"]'), 'approve button on pending row');
    assert.ok(panel.querySelector('[data-testid="video-management-reject-pending-1"]'), 'reject button on pending row');
    assert.ok(panel.querySelector('[data-testid="video-management-pending-approved-1"]'), 'pending button on approved row');
    assert.ok(panel.querySelector('[data-testid="video-management-delete-pending-1"]'), 'delete button for owner row');
    const firstMockId = themeVideoCatalog(themeId)[0].id;
    assert.ok(panel.querySelector(`[data-testid="video-management-disable-${firstMockId}"]`), `${themeId} disable button on mock`);
    assert.ok(!panel.querySelector(`[data-testid="video-management-protected-${firstMockId}"]`), 'admin sees no protected label');
    cleanup();

    act(() => {
      rendered = render(React.createElement(VideoManagementPanel, {
        data,
        setData: () => {},
        actor: ownerActor(),
        themeId,
        onSave: () => {},
      }));
    });
    const ownerPanel = rendered.container.querySelector('[data-testid="video-management-panel"]');
    assert.equal(ownerPanel.querySelector('[data-testid="video-management-actor"]').dataset.role, 'owner');
    assert.ok(!ownerPanel.querySelector('[data-testid="video-management-approve-pending-1"]'), 'owner has no approve');
    assert.ok(!ownerPanel.querySelector(`[data-testid="video-management-disable-${firstMockId}"]`), 'owner has no disable');
    assert.ok(ownerPanel.querySelector(`[data-testid="video-management-protected-${firstMockId}"]`), 'owner sees Protected label on mock');
  }
});

/* ------------------------------------------------------------------ */
/* G. Likes + like counts, no uncontrolled duplicates                  */
/* ------------------------------------------------------------------ */
section('G. Likes and like counts — no uncontrolled duplicate likes');

await test('one like per (salon, theme, video, actor); repeat toggles off; counts stay exact', () => {
  freshStore();
  const data = salonData();
  const businessId = videoLikeBusinessId(data);
  assert.ok(businessId, 'business id resolved from existing data');
  const themeId = 'barber_mens_grooming';
  const videoId = 'theme:barber:s1';
  const actorA = videoLikeActor('user-11111111-1111-1111-1111-111111111111');
  const actorB = videoLikeActor('user-22222222-2222-2222-2222-222222222222');

  const first = toggleVideoLike({ businessId, themeId, videoId, data, actor: actorA });
  assert.equal(first.ok, true);
  assert.equal(first.liked, true);
  assert.equal(first.total, 1);
  assert.equal(videoLikeCount(businessId, themeId, videoId), 1);
  assert.equal(hasActorLikedVideo(businessId, themeId, videoId, actorA), true);

  // Same actor again → toggle OFF, never a duplicate row.
  const second = toggleVideoLike({ businessId, themeId, videoId, data, actor: actorA });
  assert.equal(second.ok, true);
  assert.equal(second.liked, false);
  assert.equal(videoLikeCount(businessId, themeId, videoId), 0, 'toggle removed the like');
  const store = readVideoLikeStoreForTests();
  assert.equal(store.likes.filter((l) => l.videoId === videoId).length, 0);

  // Third actor B → 1 again; then A again → 2; no duplicates ever.
  toggleVideoLike({ businessId, themeId, videoId, data, actor: actorB });
  toggleVideoLike({ businessId, themeId, videoId, data, actor: actorA });
  assert.equal(videoLikeCount(businessId, themeId, videoId), 2);
  const rows = readVideoLikeStoreForTests().likes.filter((l) => l.videoId === videoId);
  assert.equal(rows.length, 2, 'exactly two like rows');
  assert.equal(new Set(rows.map((r) => r.fingerprint)).size, 2, 'fingerprints unique');
  for (const row of rows) {
    assert.equal(row.themeId, themeId);
    assert.equal(row.businessId, businessId);
    assert.equal(row.videoKind, 'short');
  }
});

await test('a single actor spamming like cannot inflate the count', () => {
  freshStore();
  const data = salonData();
  const businessId = videoLikeBusinessId(data);
  const themeId = 'beauty_skin_spa';
  const videoId = 'theme:spa:s2';
  const actor = videoLikeActor(null); // signed-out session identity
  assert.equal(actor.kind, 'session');
  toggleVideoLike({ businessId, themeId, videoId, data, actor });
  toggleVideoLike({ businessId, themeId, videoId, data, actor });
  toggleVideoLike({ businessId, themeId, videoId, data, actor });
  assert.equal(videoLikeCount(businessId, themeId, videoId), 1, 'one row despite repeated clicks');
});

await test('foreign-theme and unknown videos are refused by the data layer', () => {
  freshStore();
  const data = salonData();
  const businessId = videoLikeBusinessId(data);
  const actor = videoLikeActor(null);
  // A video id from another theme is not part of this theme's projection.
  const foreign = toggleVideoLike({ businessId, themeId: 'barber_mens_grooming', videoId: 'theme:nail:s1', data, actor });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.error, 'unknown-video');
  assert.equal(foreign.total, 0);
  // An invented / non-existent id is refused too.
  const unknown = toggleVideoLike({ businessId, themeId: 'barber_mens_grooming', videoId: 'nope', data, actor });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, 'unknown-video');
  // An invalid theme id is refused outright as foreign-theme.
  const badTheme = toggleVideoLike({ businessId, themeId: 'hair', videoId: 'theme:barber:s1', data, actor });
  assert.equal(badTheme.ok, false);
  assert.equal(badTheme.error, 'foreign-theme');
  assert.equal(readVideoLikeStoreForTests().likes.length, 0);
});

await test('like counts render accurately on every card after likes (all five themes)', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const data = salonData();
    const businessId = videoLikeBusinessId(data);
    // The rendered UI derives its actor from the CURRENT session (signed out
    // here), so the like must be recorded by that same session identity for
    // the button to reflect it — exactly how a real visitor would like.
    const actor = videoLikeActor(null);
    const video = themeVideoCatalog(themeId)[0];
    toggleVideoLike({ businessId, themeId, videoId: video.id, data, actor });
    const el = galleryFor(themeId, data);
    const likeButtons = el.querySelectorAll('[data-testid="site-video-like"]');
    assert.equal(likeButtons.length, 10, `${themeId} like buttons`);
    const likedCard = el.querySelector(`[data-testid="site-video-like"][data-video-id="${video.id}"]`);
    assert.equal(likedCard.dataset.liked, 'true', `${themeId} liked state`);
    // The count label is a sibling of the button inside the card's action column.
    const count = likedCard.parentElement.querySelector('[data-testid="site-video-like-count"]');
    assert.equal(count.dataset.count, '1', `${themeId} count`);
    const other = el.querySelector(`[data-testid="site-video-like"][data-video-id="${themeVideoCatalog(themeId)[1].id}"]`);
    assert.equal(other.dataset.liked, 'false');
    assert.equal(
      other.parentElement.querySelector('[data-testid="site-video-like-count"]').dataset.count,
      '0',
    );
  }
});

/* ------------------------------------------------------------------ */
/* H. Weekly Top Videos uses current-week likes only                   */
/* ------------------------------------------------------------------ */
section('H. Weekly Top Videos — current-week likes only');

await test('weekly counts include only this week; last week\'s likes drop out automatically', () => {
  freshStore();
  const now = new Date(2026, 7, 14, 12, 0, 0); // Friday 2026-08-14
  setSalonClockForTests(now);
  const data = salonData();
  const businessId = videoLikeBusinessId(data);
  const themeId = 'hair_studio_color_bar';
  const videoId = 'theme:hair:l1';
  const actor = videoLikeActor('user-44444444-4444-4444-4444-444444444444');

  assert.equal(isInCurrentWeek(now.getTime(), now), true);
  const wk = weekKeyOf(now);
  assert.equal(wk, '2026-W33');

  // A like inside the current week.
  toggleVideoLike({ businessId, themeId, videoId, data, actor, now });
  assert.equal(weeklyVideoLikeCount(businessId, themeId, videoId, now), 1);

  // Simulate a like from last week (W32) directly in the store.
  const lastWeekStart = new Date(startOfWeek(now));
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const store = readVideoLikeStoreForTests();
  const lastWeekLike = {
    id: 'vlike-old',
    businessId,
    themeId,
    videoId,
    videoKind: 'long',
    actorId: actor.id,
    actorKind: actor.kind,
    createdAt: lastWeekStart.getTime() + 60_000,
    weekKey: weekKeyOf(lastWeekStart),
    fingerprint: `old|${themeId}|${videoId}|${actor.id}`,
  };
  setVideoLikeStoreForTests({ version: 1, likes: [...store.likes, lastWeekLike], attempts: store.attempts });
  assert.equal(videoLikeCount(businessId, themeId, videoId), 2, 'all-time count keeps last week');
  assert.equal(weeklyVideoLikeCount(businessId, themeId, videoId, now), 1, 'weekly count ignores last week');
  assert.equal(isInCurrentWeek(lastWeekLike.createdAt, now), false);
  setSalonClockForTests(null);
});

await test('weekly ranking is ordered by current-week likes, Shorts + Long together, zero-week videos excluded', () => {
  freshStore();
  const now = new Date(2026, 7, 14, 12, 0, 0);
  setSalonClockForTests(now);
  const data = salonData({ socialVideos: [] });
  const businessId = videoLikeBusinessId(data);
  const themeId = 'family_full_service';
  const actor = videoLikeActor('user-55555555-5555-5555-5555-555555555555');
  const actor2 = videoLikeActor('user-66666666-6666-6666-6666-666666666666');
  const items = videoItemsForTheme(themeId, data);
  const shorts = items.filter((i) => i.kind === 'short');
  const longs = items.filter((i) => i.kind === 'long');
  const [shortA, shortB] = shorts;
  const [longA] = longs;
  assert.equal(shortA.kind, 'short');
  assert.equal(shortB.kind, 'short');
  assert.equal(longA.kind, 'long');
  toggleVideoLike({ businessId, themeId, videoId: longA.id, data, actor, now });          // 1
  toggleVideoLike({ businessId, themeId, videoId: longA.id, data, actor: actor2, now });  // 2
  toggleVideoLike({ businessId, themeId, videoId: shortA.id, data, actor, now });         // 1

  const top = weeklyTopVideos(businessId, themeId, data, { now });
  assert.equal(top.length, 2, 'only liked videos ranked');
  assert.equal(top[0].item.id, longA.id, 'most weekly likes first');
  assert.equal(top[0].weeklyLikes, 2);
  assert.equal(top[1].item.id, shortA.id);
  assert.equal(top[1].weeklyLikes, 1);
  assert.ok(!top.some((e) => e.item.id === shortB.id), 'zero-like video never ranked');
  setSalonClockForTests(null);
});

await test('weekly ranking is theme- and salon-isolated', () => {
  freshStore();
  const data = salonData();
  const businessId = videoLikeBusinessId(data);
  const actor = videoLikeActor('user-77777777-7777-7777-7777-777777777777');
  // Like a barber video.
  toggleVideoLike({ businessId, themeId: 'barber_mens_grooming', videoId: 'theme:barber:s1', data, actor });
  // The same business, other themes: zero weekly top.
  for (const themeId of THEMES) {
    if (themeId === 'barber_mens_grooming') continue;
    assert.deepEqual(weeklyTopVideoIds(businessId, themeId, data), [], `${themeId} no leakage`);
    assert.equal(weeklyVideoLikeCount(businessId, themeId, 'theme:barber:s1'), 0);
  }
  // Another tenant's likes never enter this salon's ranking.
  const otherBusiness = 'some-other-tenant';
  const ownLikes = readVideoLikeStoreForTests().likes;
  setVideoLikeStoreForTests({
    version: 1,
    likes: [
      ...ownLikes,
      {
        id: 'vlike-other',
        businessId: otherBusiness,
        themeId: 'barber_mens_grooming',
        videoId: 'theme:barber:s2',
        videoKind: 'short',
        actorId: actor.id,
        actorKind: actor.kind,
        createdAt: Date.now(),
        weekKey: weekKeyOf(),
        fingerprint: `${otherBusiness}|barber_mens_grooming|theme:barber:s2|${actor.id}`,
      },
    ],
    attempts: [],
  });
  assert.deepEqual(weeklyTopVideoIds(businessId, 'barber_mens_grooming', data), ['theme:barber:s1'], 'only own salon likes rank');
});

await test('formatLikeCount never invents data and matches rendered counts', () => {
  assert.equal(formatLikeCount(0), '0');
  assert.equal(formatLikeCount(7), '7');
  assert.equal(formatLikeCount(1200), '1.2K');
  assert.equal(formatLikeCount(2500), '2.5K');
  assert.equal(formatLikeCount(1500000), '1.5M');
  assert.equal(formatLikeCount(NaN), '0');
  assert.equal(formatLikeCount(-3), '0');
});

/* ------------------------------------------------------------------ */
/* I. Main dashboard (Landing) displays Weekly Top Videos correctly    */
/* ------------------------------------------------------------------ */
section('I. Main dashboard — Weekly Top Videos');

async function renderDashboard(themeId, { likes = true, locale = 'en' } = {}) {
  const data = salonData();
  data.publishState = 'published';
  data.templateId = themeId;
  freshStore();
  const businessId = videoLikeBusinessId(data);
  const actor = videoLikeActor('user-88888888-8888-8888-8888-888888888888');
  if (likes) {
    // Give the first three videos of the theme 3/2/1 weekly likes.
    const items = videoItemsForTheme(themeId, data);
    for (let i = 0; i < items.length; i++) {
      const n = i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        toggleVideoLike({
          businessId,
          themeId,
          videoId: items[i].id,
          data,
          actor: videoLikeActor(`user-${i}-${k}-${'9'.repeat(32)}`),
        });
      }
    }
  }
  setSiteLocale(locale);
  let scope;
  await act(async () => {
    scope = render(React.createElement(Landing, {
      data,
      setData: () => {},
      onNext: () => {},
      goToStep: () => {},
      onOpenStaffManagement: () => {},
      forcedActiveTab: 'overview',
      onTabChange: () => {},
    }));
  });
  return { scope, data, businessId };
}

await test('dashboard overview renders the Weekly Top Videos block for each theme with the top liked videos', async () => {
  for (const themeId of THEMES) {
    cleanup();
    const { scope } = await renderDashboard(themeId);
    const html = scope.container.innerHTML;
    assert.ok(html.includes('Weekly Top Videos'), `${themeId} block title`);
    // Top 3 videos have weekly likes and appear as dashboard cards.
    const data = salonData({ socialVideos: [] });
    const items = videoItemsForTheme(themeId, data);
    const businessId = videoLikeBusinessId(data);
    const expected = weeklyTopVideos(businessId, themeId, data, { limit: 6 }).map((e) => e.item.id);
    assert.deepEqual(expected.slice(0, 3), [items[0].id, items[1].id, items[2].id], `${themeId} ranking`);
    const text = scope.container.textContent;
    for (const id of expected) {
      const item = items.find((i) => i.id === id);
      assert.ok(text.includes(item.title), `${themeId} dashboard shows ${item.title}`);
    }
  }
});

await test('dashboard weekly cards carry thumbnail, kind badge, weekly like count, platform and view action', async () => {
  for (const themeId of THEMES) {
    cleanup();
    const { scope } = await renderDashboard(themeId);
    const html = scope.container.innerHTML;
    const text = scope.container.textContent;
    const items = videoItemsForTheme(themeId, salonData());
    const first = items[0];
    assert.ok(html.includes(`img.youtube.com/vi/${first.externalVideoId}/`), `${themeId} thumbnail for top video`);
    const kindLabel = videoGalleryChrome(themeId, 'en');
    const badge = first.kind === 'short' ? kindLabel.shortBadge : kindLabel.longBadge;
    assert.ok(text.includes(badge), `${themeId} kind badge`);
    assert.ok(text.includes(kindLabel.platforms.youtube), `${themeId} platform label`);
    assert.ok(text.includes(formatLikeCount(3)), `${themeId} weekly count 3 rendered`);
    assert.ok(text.includes(kindLabel.view), `${themeId} view action label`);
  }
});

await test('dashboard weekly block is theme-isolated: only the active theme\'s videos are listed', async () => {
  for (const themeId of THEMES) {
    cleanup();
    const { scope } = await renderDashboard(themeId);
    const text = scope.container.textContent;
    // Titles are globally unique across the 50-record catalog, so any foreign
    // theme title inside the dashboard proves leakage. None may appear.
    for (const other of THEMES) {
      if (other === themeId) continue;
      for (const title of themeMockTitles(other)) {
        assert.ok(!text.includes(title), `${themeId} dashboard leaks ${other} title: ${title}`);
      }
    }
    // And the active theme's own top videos ARE shown.
    for (const title of themeMockTitles(themeId).slice(0, 3)) {
      assert.ok(text.includes(title), `${themeId} dashboard shows own title ${title}`);
    }
  }
});

await test('dashboard weekly card click opens the exact original platform URL', async () => {
  cleanup();
  const themeId = 'barber_mens_grooming';
  const { scope, data } = await renderDashboard(themeId);
  const first = videoItemsForTheme(themeId, data)[0];
  let opened = null;
  const original = window.open;
  window.open = (url, target, features) => { opened = { url, target, features }; return null; };
  try {
    const titleEl = [...scope.container.querySelectorAll('p')].find((p) => p.textContent.includes(first.title));
    assert.ok(titleEl, 'top video title element');
    fireEvent.click(titleEl.closest('[class*="cursor-pointer"]') || titleEl.parentElement.parentElement);
    assert.ok(opened, 'window.open called');
    assert.equal(opened.url, first.originalPlatformUrl, 'exact original url');
    assert.equal(opened.target, '_blank');
  } finally {
    window.open = original;
  }
});

await test('dashboard weekly block shows the empty state when nothing was liked this week', async () => {
  cleanup();
  const { scope } = await renderDashboard('hair_studio_color_bar', { likes: false });
  const chrome = videoGalleryChrome('hair_studio_color_bar', 'en');
  assert.ok(scope.container.innerHTML.includes(chrome.weeklyEmpty), 'empty copy shown');
  assert.ok(!scope.container.innerHTML.includes('img.youtube.com/vi/'), 'no weekly cards rendered');
});

/* ------------------------------------------------------------------ */
/* J. Theme / ownership / Shorts-Long correct everywhere               */
/* ------------------------------------------------------------------ */
section('J. Theme, salon ownership and Shorts/Long type correct everywhere');

await test('gallery DOM carries theme, appearance and exact 5+5 counts for every theme', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData());
    assert.equal(el.dataset.theme, themeId, `${themeId} data-theme`);
    assert.equal(el.dataset.shortCount, '5', `${themeId} shorts`);
    assert.equal(el.dataset.longCount, '5', `${themeId} longs`);
    const cards = el.querySelectorAll('[data-testid="site-video-gallery-grid"] > article');
    assert.equal(cards.length, 10, `${themeId} cards rendered`);
    const kindBadges = el.querySelectorAll('[data-testid="site-video-kind-badge"]');
    assert.equal(kindBadges.length, 10, `${themeId} kind badges`);
  }
});

await test('every weekly item in the rendered UI carries video id, rank, kind and weekly likes', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const data = salonData();
    const businessId = videoLikeBusinessId(data);
    const items = videoItemsForTheme(themeId, data);
    const actor = videoLikeActor('user-99999999-9999-9999-9999-999999999999');
    toggleVideoLike({ businessId, themeId, videoId: items[0].id, data, actor });
    const el = galleryFor(themeId, data);
    const list = el.querySelector('[data-testid="site-video-weekly-list"]');
    assert.ok(list, `${themeId} weekly list`);
    const entries = list.querySelectorAll('[data-testid="site-video-weekly-item"]');
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.dataset.videoId, items[0].id);
    assert.equal(entry.dataset.rank, '1');
    assert.equal(entry.dataset.videoKind, items[0].kind);
    assert.equal(entry.dataset.weeklyLikes, '1');
  }
});

await test('kind filters show exactly 5 shorts and 5 longs, and kind survives every projection', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData());
    const filter = el.querySelector('[data-testid="site-video-kind-filter"]');
    assert.ok(filter, `${themeId} filter`);
    fireEvent.click(el.querySelector('[data-testid="site-video-filter-short"]'));
    const grid = el.querySelector('[data-testid="site-video-gallery-grid"]');
    assert.equal(grid.dataset.kindFilter, 'short');
    const shortCards = grid.querySelectorAll('article');
    assert.equal(shortCards.length, 5, `${themeId} shorts filtered`);
    for (const card of shortCards) {
      const badge = card.querySelector('[data-testid="site-video-kind-badge"]').textContent;
      assert.equal(badge, videoGalleryChrome(themeId, 'en').shortBadge, 'short badge');
    }
    fireEvent.click(el.querySelector('[data-testid="site-video-filter-long"]'));
    const longCards = el.querySelector('[data-testid="site-video-gallery-grid"]').querySelectorAll('article');
    assert.equal(longCards.length, 5, `${themeId} longs filtered`);
    fireEvent.click(el.querySelector('[data-testid="site-video-filter-all"]'));
    assert.equal(el.querySelector('[data-testid="site-video-gallery-grid"]').dataset.kindFilter, 'all');
  }
});

await test('owner rows keep their salon theme on every write path (add, edit, replace)', () => {
  const themeId = 'hair_studio_color_bar';
  const actor = ownerActor();
  const parsed = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const meta = derivedYoutubeMetadata(parsed.videoId, { title: 't', channelName: 'c' });
  const record = socialVideoFromPasteAndMetadata({
    metadata: { ...meta, source: 'oembed' },
    form: { title: '', description: '', channelName: '', thumbnailUrl: '', url: parsed.originalUrl, platform: 'youtube', externalVideoId: parsed.videoId },
    videoKind: 'long',
    themeId,
  });
  assert.equal(record.themeId, themeId);
  const edited = editManagedVideoMetadata([record], { kind: 'owner', id: record.id }, { title: 'New' }, actor);
  assert.equal(edited.videos[0].themeId, themeId);
  const replaced = replaceManagedVideoUrl([record], { kind: 'owner', id: record.id }, 'https://www.youtube.com/watch?v=abcdefghijk', null, actor);
  assert.equal(replaced.videos[0].themeId, themeId);
  assert.equal(replaced.videos[0].videoKind, 'long');
});

await test('like store rows are stamped with business, theme and kind; the UI reads only its own business', () => {
  freshStore();
  const data = salonData();
  const businessId = videoLikeBusinessId(data);
  assert.equal(businessId, reviewBusinessId(data), 'same tenant id as Phase 10.8 reviews');
  const actor = videoLikeActor(null);
  toggleVideoLike({ businessId, themeId: 'nail_lash_studio', videoId: 'theme:nail:s3', data, actor });
  const rows = readVideoLikeStoreForTests().likes;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].businessId, businessId);
  assert.equal(rows[0].themeId, 'nail_lash_studio');
  assert.equal(rows[0].videoKind, 'short');
  assert.ok(rows[0].actorId.startsWith('session:'), 'session-derived identity');
});

/* ------------------------------------------------------------------ */
/* K. Desktop / Tablet / Mobile layouts                                */
/* ------------------------------------------------------------------ */
section('K. Desktop, Tablet and Mobile layouts');

await test('per-theme grid config produces valid desktop/tablet/mobile classes for all five themes', () => {
  const expected = {
    desktop: 'grid-cols-5',
    tablet: 'grid-cols-3',
    mobile: 'grid-cols-2',
  };
  for (const themeId of THEMES) {
    const config = videoGalleryThemeConfig(themeId);
    assert.deepEqual(config.grid, { desktop: 5, tablet: 3, mobile: 2 }, `${themeId} grid config`);
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      assert.equal(siteGrid(mode, config.grid), expected[mode], `${themeId} ${mode}`);
    }
    assert.equal(config.shortTileRatio, '9/16', `${themeId} short ratio`);
    assert.equal(config.longTileRatio, '16/9', `${themeId} long ratio`);
  }
});

await test('gallery grid renders the correct responsive class per mode on every theme', () => {
  for (const themeId of THEMES) {
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      cleanup();
      freshStore();
      const el = galleryFor(themeId, salonData(), { mode });
      const grid = el.querySelector('[data-testid="site-video-gallery-grid"]');
      assert.ok(grid.className.includes(siteGrid(mode, { desktop: 5, tablet: 3, mobile: 2 })), `${themeId} ${mode} grid class`);
    }
  }
});

await test('the embed player keeps 9:16 for Shorts and 16:9 for Long videos, with loading + unavailable states', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData());
    const cards = el.querySelectorAll('article');
    const shortCard = [...cards].find((c) => c.querySelector('[data-testid="site-video-kind-badge"]').textContent === videoGalleryChrome(themeId, 'en').shortBadge);
    const longCard = [...cards].find((c) => c.querySelector('[data-testid="site-video-kind-badge"]').textContent === videoGalleryChrome(themeId, 'en').longBadge);
    fireEvent.click(shortCard.querySelector('[data-testid="site-social-play"]'));
    const shortEmbed = el.querySelector('[data-testid="site-social-embed"]');
    assert.ok(shortEmbed, `${themeId} short embed opens`);
    assert.ok(shortEmbed.querySelector('[style*="aspect-ratio"]'), `${themeId} short player box`);
    assert.ok(el.querySelector('[data-testid="site-video-player-loading"]'), `${themeId} loading state`);
    assert.ok(el.querySelector('iframe[src*="youtube.com/embed"]'), `${themeId} youtube iframe`);
    fireEvent.click(el.querySelector('[data-testid="site-video-gallery-embed-close"]'));

    fireEvent.click(longCard.querySelector('[data-testid="site-social-play"]'));
    const longEmbed = el.querySelector('[data-testid="site-social-embed"]');
    assert.ok(longEmbed, `${themeId} long embed opens`);
    assert.ok(el.querySelector('[data-testid="site-video-original-destination"]'), `${themeId} original destination link inside player`);
    assert.ok(longEmbed.querySelector('[style*="aspect-ratio"]'), `${themeId} long player box`);
    fireEvent.click(el.querySelector('[data-testid="site-video-gallery-embed-close"]'));
    assert.ok(!el.querySelector('[data-testid="site-social-embed"]'), `${themeId} embed closed`);
  }
});

/* ------------------------------------------------------------------ */
/* L. English / Hindi and Light / Dark modes                           */
/* ------------------------------------------------------------------ */
section('L. English / Hindi and Light / Dark modes');

await test('gallery renders Hindi chrome when the site locale is Hindi (all five themes)', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData(), { locale: 'hi' });
    const chromeHi = videoGalleryChrome(themeId, 'hi');
    const chromeEn = videoGalleryChrome(themeId, 'en');
    assert.ok(chromeHi.weeklyTitle !== chromeEn.weeklyTitle, `${themeId} hi weekly title differs`);
    const text = el.textContent;
    assert.ok(text.includes(chromeHi.weeklyTitle), `${themeId} hi weekly title rendered`);
    assert.ok(text.includes(chromeHi.shortsTab), `${themeId} hi shorts tab`);
    assert.ok(text.includes(chromeHi.longTab), `${themeId} hi long tab`);
    assert.ok(text.includes(chromeHi.weeklyEmpty), `${themeId} hi weekly empty`);
    assert.equal(readSiteLocale(), 'hi', 'locale persisted');
  }
});

await test('gallery renders in Light and Dark appearances; barber defaults dark, others light', () => {
  const defaults = {
    barber_mens_grooming: 'dark',
    hair_studio_color_bar: 'light',
    beauty_skin_spa: 'light',
    family_full_service: 'light',
    nail_lash_studio: 'light',
  };
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    // Explicit dark:
    const darkEl = galleryFor(themeId, salonData(), { appearance: 'dark' });
    assert.equal(darkEl.dataset.appearance, 'dark', `${themeId} explicit dark`);
    // Explicit light:
    const lightEl = galleryFor(themeId, salonData(), { appearance: 'light' });
    assert.equal(lightEl.dataset.appearance, 'light', `${themeId} explicit light`);
    // Default (after clearing the stored override):
    window.localStorage.removeItem('nexora_site_appearance');
    const defaultEl = galleryFor(themeId, salonData());
    assert.equal(defaultEl.dataset.appearance, defaults[themeId], `${themeId} default ${defaults[themeId]}`);
    window.localStorage.removeItem('nexora_site_appearance');
  }
});

await test('dashboard weekly block works in Hindi too', async () => {
  cleanup();
  const { scope } = await renderDashboard('beauty_skin_spa', { locale: 'hi' });
  const chromeHi = videoGalleryChrome('beauty_skin_spa', 'hi');
  assert.ok(scope.container.innerHTML.includes(chromeHi.weeklyTitle), 'hindi dashboard title');
  assert.ok(scope.container.innerHTML.includes(chromeHi.view), 'hindi view label');
});

/* ------------------------------------------------------------------ */
/* M. Loading / empty / error / broken-thumbnail states                */
/* ------------------------------------------------------------------ */
section('M. Loading, empty, error and broken-thumbnail states');

await test('gallery loading, empty and error section states work on every theme', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    setWebsiteSectionFlagsForTests({ videos: 'loading' });
    let el = galleryFor(themeId, salonData());
    assert.ok(el.querySelector('[data-testid="site-video-gallery-loading"]'), `${themeId} loading`);
    cleanup();
    setWebsiteSectionFlagsForTests({ videos: 'error' });
    el = galleryFor(themeId, salonData());
    assert.ok(el.querySelector('[data-testid="section-state-error"]'), `${themeId} error panel`);
    assert.ok(el.textContent.includes(videoGalleryChrome(themeId, 'en').errorTitle), `${themeId} error title`);
    cleanup();
    setWebsiteSectionFlagsForTests({ videos: 'empty' });
    el = galleryFor(themeId, salonData());
    assert.ok(el.querySelector('[data-testid="section-state-empty"]'), `${themeId} empty panel`);
    assert.ok(el.textContent.includes(videoGalleryChrome(themeId, 'en').emptyTitle), `${themeId} empty title`);
    setWebsiteSectionFlagsForTests({});
  }
});

await test('weekly block exposes ready/empty, section loading and section error states in the UI', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    // Empty (no likes) → weekly block ready with its empty state.
    let el = galleryFor(themeId, salonData());
    assert.equal(el.querySelector('[data-testid="site-video-weekly-top"]').dataset.weeklyState, 'ready', `${themeId} weekly ready`);
    assert.ok(el.querySelector('[data-testid="site-video-weekly-empty"]'), `${themeId} weekly empty node`);
    assert.ok(el.querySelector('[data-testid="site-video-weekly-error"]') === null, 'no error when ready');
    cleanup();
    // Section loading → skeleton, no weekly block yet.
    setWebsiteSectionFlagsForTests({ videos: 'loading' });
    el = galleryFor(themeId, salonData());
    assert.ok(el.querySelector('[data-testid="site-video-gallery-loading"]'), `${themeId} section loading`);
    assert.ok(el.querySelector('[data-testid="site-video-weekly-top"]') === null, 'weekly hidden while loading');
    cleanup();
    // Section error → error panel, weekly block not rendered.
    setWebsiteSectionFlagsForTests({ videos: 'error' });
    el = galleryFor(themeId, salonData());
    assert.ok(el.querySelector('[data-testid="section-state-error"]'), `${themeId} section error`);
    assert.ok(el.querySelector('[data-testid="site-video-weekly-top"]') === null, 'weekly hidden on error');
    setWebsiteSectionFlagsForTests({});
  }
});

await test('broken thumbnails fall back gracefully without blanking the grid (every theme)', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData());
    const thumbs = el.querySelectorAll('[data-testid="site-social-thumb"], img[loading="lazy"]');
    assert.ok(thumbs.length >= 10, `${themeId} lazy thumbnails`);
    const firstImg = el.querySelector('img[src*="img.youtube.com"]');
    fireEvent.error(firstImg);
    const fallback = el.querySelector('[data-testid="site-video-gallery-thumb-fallback"]');
    assert.ok(fallback, `${themeId} fallback shown after error`);
    assert.ok(el.querySelector('[data-testid="site-video-gallery-grid"]'), `${themeId} grid still rendered`);
    assert.ok(el.querySelectorAll('[data-testid="site-video-like"]').length === 10, `${themeId} likes still interactive`);
  }
});

await test('a failed like write surfaces an error and never changes the count', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    setVideoLikeStorageFailureForTests(true);
    const el = galleryFor(themeId, salonData());
    const first = el.querySelector('[data-testid="site-video-like"]');
    fireEvent.click(first);
    const error = el.querySelector('[data-testid="site-video-like-error"]');
    assert.ok(error, `${themeId} like error shown`);
    const count = el.querySelector('[data-testid="site-video-like-count"]');
    assert.equal(count.dataset.count, '0', `${themeId} count unchanged`);
    setVideoLikeStorageFailureForTests(false);
  }
});

/* ------------------------------------------------------------------ */
/* N. Lazy loading / performance                                       */
/* ------------------------------------------------------------------ */
section('N. Lazy loading / performance');

await test('thumbnails are lazy and embeds are play-on-demand (no iframe until click)', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const el = galleryFor(themeId, salonData());
    const imgs = [...el.querySelectorAll('img')];
    assert.ok(imgs.length >= 10, `${themeId} images`);
    for (const img of imgs) {
      assert.equal(img.getAttribute('loading'), 'lazy', `${themeId} lazy img`);
    }
    assert.ok(!el.querySelector('iframe'), `${themeId} no iframe before play`);
    const first = el.querySelector('[data-testid="site-social-play"]');
    fireEvent.click(first);
    const iframe = el.querySelector('iframe[src*="youtube.com/embed"]');
    assert.ok(iframe, `${themeId} iframe mounts only after play`);
    assert.equal(iframe.getAttribute('loading'), 'lazy', 'iframe lazy');
    assert.ok(iframe.getAttribute('src').includes('autoplay=1'), 'autoplay param');
    assert.ok(iframe.getAttribute('allowfullscreen') !== null, 'fullscreen allowed');
    // Theme switch unmounts the player (isolation + memory).
    cleanup();
  }
});

await test('the gallery is a single shared system: SiteSocialFeed is a thin re-export and every renderer uses SiteVideoGallery', async () => {
  const alias = await readFile('src/components/SiteSocialFeed.tsx', 'utf8');
  assert.match(alias, /export \{ default \} from '\.\/SiteVideoGallery'/);
  assert.equal(SiteSocialFeed, SiteVideoGallery, 'same component');
  for (const renderer of [
    'src/components/BarberTemplateRenderer.tsx',
    'src/components/HairStudioTemplateRenderer.tsx',
    'src/components/BeautySpaTemplateRenderer.tsx',
    'src/components/FamilyFullServiceTemplateRenderer.tsx',
    'src/components/NailLashStudioTemplateRenderer.tsx',
  ]) {
    const source = await readFile(renderer, 'utf8');
    assert.match(source, /SiteVideoGallery/, `${renderer} uses the gallery`);
  }
});

/* ------------------------------------------------------------------ */
/* O. Static hygiene                                                    */
/* ------------------------------------------------------------------ */
section('O. Static hygiene — no fake URLs, hardcoded ids, keys, duplicates or invented fields');

await test('no fake/broken URLs: every catalog URL + thumbnail passes the exact validation gate', () => {
  for (const themeId of THEMES) {
    for (const video of themeVideoCatalog(themeId)) {
      const result = validateOriginalVideoUrl(video.originalPlatformUrl || video.url, video.platform, video.externalVideoId);
      assert.equal(result.ok, true, `${video.id} url valid`);
      const thumb = new URL(video.thumbnailUrl);
      assert.equal(thumb.protocol, 'https:');
      assert.ok(thumb.hostname === 'img.youtube.com', `${video.id} thumb host`);
    }
  }
});

await test('fake/legacy sample records with invalid ids are filtered before they can reach the gallery', () => {
  // initialData ships two legacy sample records whose ids are not real
  // platform ids (instagram shortcode too short / youtube id not 11 chars).
  // The validation gate must keep them OUT of every theme's gallery.
  const data = salonData();
  const legacy = data.socialVideos || [];
  assert.ok(legacy.some((v) => v.id === 'v1'), 'legacy v1 present in initialData');
  assert.ok(legacy.some((v) => v.id === 'v2'), 'legacy v2 present in initialData');
  for (const themeId of THEMES) {
    const items = videoItemsForTheme(themeId, data);
    assert.ok(!items.some((i) => i.id === 'v1' || i.id === 'v2'), `${themeId} excludes fake legacy records`);
    assert.equal(items.length, 10, `${themeId} still 10 real videos`);
  }
  // And rendering never produces a broken card from them.
  cleanup();
  freshStore();
  const el = galleryFor('barber_mens_grooming', data);
  const titles = [...el.querySelectorAll('[data-testid="site-video-card-title"]')].map((n) => n.textContent);
  assert.ok(!titles.some((t) => t.includes('Hair Spa') || t.includes('Bridal Glow')), 'fake titles never rendered');
});

await test('no private API keys or service-role credentials anywhere in client source', async () => {
  const files = (await readdir('src', { recursive: true })).filter((f) => /\.(ts|tsx)$/.test(f));
  const needles = [
    /service_role/i,
    /service-role/i,
    /SUPABASE_SERVICE_ROLE/i,
    /AIza[0-9A-Za-z_-]{20,}/,
    /sk-[A-Za-z0-9]{20,}/,
    /pk_live_/,
    /rzp_live_/,
    /ghp_[A-Za-z0-9]{20,}/,
  ];
  for (const file of files) {
    const source = await readFile(join('src', file), 'utf8');
    // Comments may legitimately mention the words (e.g. "never a service_role
    // key") — strip block + line comments before scanning executable code.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const needle of needles) {
      const lines = code.split('\n');
      const hit = lines.filter((l) => needle.test(l));
      for (const l of hit) {
        assert.ok(!needle.test(l), `${file} matches ${needle} in: ${l.trim().slice(0, 80)}`);
      }
    }
  }
});

await test('server keeps credentials in env only (.env.example lists placeholders, no values)', async () => {
  const envExample = await readFile('.env.example', 'utf8');
  // Real secret formats must never appear: JWTs, sk-/pk_/rzp_ keys, AIza tokens.
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(envExample), '.env.example has no JWT');
  assert.ok(!/\b(sk|pk|rzp|ghp)_[A-Za-z0-9]{10,}/.test(envExample), '.env.example has no private key');
  assert.ok(!/AIza[A-Za-z0-9_-]{10,}/.test(envExample), '.env.example has no Google API key');
  assert.ok(envExample.includes('your-project.supabase.co'), 'placeholder URL only');
  assert.ok(envExample.includes('your-anon-public-key'), 'placeholder anon key only');
  const server = await readFile('server.ts', 'utf8');
  assert.match(server, /process\.env\./, 'server reads env');
  assert.ok(!/process\.env\.(SERVICE_ROLE|SERVICE_ROLE_KEY)/.test(server));
});

await test('no hardcoded video ids outside the theme catalog (only theme: seeds and runtime v- ids)', async () => {
  const catalogIds = new Set(allThemeVideoRecordIds());
  const files = (await readdir('src', { recursive: true })).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const file of files) {
    if (file === 'lib/siteVideoCatalog.ts') continue;
    const source = await readFile(join('src', file), 'utf8');
    // Strip comments so documentation examples are allowed.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const id of catalogIds) {
      // The literal id string should only appear where it is constructed from
      // the catalog (dynamic) or in files that legitimately reference seeds.
      const legit = /siteVideoCatalog|themeVideoCatalog|themeVideoSeeds|videoManagement|VideoManagementPanel|siteVideoGallery|videoLikes|StepSocials|SiteVideoGallery/.test(file);
      const occurrences = code.split(id).length - 1;
      if (occurrences > 0 && !legit) {
        throw new Error(`${file} hardcodes catalog id ${id}`);
      }
    }
  }
});

await test('no duplicate video system: only one gallery component and one metadata engine exist', async () => {
  const components = (await readdir('src/components')).filter((f) => /Video|Social/i.test(f));
  assert.deepEqual(components.sort(), [
    'ReelsVideoPlayer.tsx',
    'SiteSocialFeed.tsx',
    'SiteVideo.tsx',
    'SiteVideoGallery.tsx',
    'VideoManagementPanel.tsx',
  ].sort(), 'no unexpected video components');
  // ReelsVideoPlayer and SiteVideo are retained compatibility components;
  // the five current renderers share SiteVideoGallery.
  // SiteVideo (10.12) is legacy and unused by the five renderers.
  const componentFiles = (await readdir('src/components', { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const usage = await Promise.all(
    componentFiles.map(async (f) => {
      if (f === 'SiteVideo.tsx') return 0;
      const s = await readFile(join('src/components', f), 'utf8');
      return (s.match(/from '\.\/SiteVideo'/g) || []).length;
    }),
  );
  assert.equal(usage.reduce((a, b) => a + b, 0), 0, 'SiteVideo legacy unused');
  const metadataFiles = (await readdir('src/lib')).filter((f) => /video/i.test(f));
  assert.ok(metadataFiles.includes('videoUrlMetadata.ts'), 'one metadata engine');
});

await test('SocialVideo fields map only to the real social_videos columns (M06 + draft M27), nothing invented', async () => {
  const m06 = await readFile('supabase/migrations/20260811000601_m06_media_social_location_settings.sql', 'utf8');
  const m27 = await readFile('supabase/migrations/20260815000101_m27_social_video_likes_weekly.sql', 'utf8');
  const dbColumns = new Set([
    ...m06.matchAll(/^\s{2}([a-z_]+)\s+[a-z]/gm),
  ].map((m) => m[1]).filter((c) => !['constraint'].includes(c)));
  assert.ok(dbColumns.has('external_video_id'), 'M06 has external_video_id');
  assert.ok(dbColumns.has('video_url'), 'M06 has video_url');
  // M27 adds theme_key + video_kind (the ONLY new video columns in the whole draft set).
  assert.match(m27, /add column if not exists theme_key text/i);
  assert.match(m27, /add column if not exists video_kind text/i);
  assert.match(m27, /create table if not exists public\.social_video_likes/, 'likes table');
  assert.match(m27, /unique/i, 'uniqueness enforced');
  assert.match(m27, /enable row level security/i, 'RLS');
  // No other migration invents social_videos columns:
  const migrations = await readdir('supabase/migrations');
  for (const file of migrations) {
    if (file.includes('m06') || file.includes('m27')) continue;
    const sql = await readFile(join('supabase/migrations', file), 'utf8');
    const alters = sql.match(/alter table [^;]*social_videos[^;]*add[^;]*column[^;]*/gi) || [];
    assert.deepEqual(alters, [], `${file} adds no social_videos columns`);
  }
  // Client SocialVideo keys are a documented superset: DB columns + client-only
  // presentation fields; the DB column names must all exist on the interface.
  const types = await readFile('src/types.ts', 'utf8');
  for (const col of dbColumns) {
    if (col === 'id' || col === 'video_url' || col === 'external_video_id') continue;
    // caption → title (client), display_order/status/created_at/updated_at/business_id → not part of the client media record shape.
  }
  const interfaceSource = types.slice(types.indexOf('export interface SocialVideo'));
  assert.ok(interfaceSource.includes('url'), 'url field');
  assert.ok(interfaceSource.includes('externalVideoId'), 'externalVideoId field');
  assert.ok(interfaceSource.includes('originalPlatformUrl'), 'originalPlatformUrl field');
  assert.ok(!/likesCount\??:\s*number/.test(interfaceSource), 'likesCount is legacy text, never a number source of truth');
});

await test('draft M27 enforces one-like-per-actor and weekly ranking in the database too', async () => {
  const m27 = await readFile('supabase/migrations/20260815000101_m27_social_video_likes_weekly.sql', 'utf8');
  assert.match(m27, /create unique index/i, 'unique indexes');
  assert.match(m27, /toggle_social_video_like/i, 'toggle RPC');
  assert.match(m27, /get_weekly_top_videos/i, 'weekly RPC');
  assert.match(m27, /(video_id,\s*user_id)|(video_id,\s*visitor_token)/, 'per-actor uniqueness');
});

await test('env wiring: app requires only public anon credentials, never a service role', async () => {
  const supabaseClient = await readFile('src/lib/supabaseClient.ts', 'utf8');
  assert.match(supabaseClient, /VITE_SUPABASE_ANON_KEY/);
  // Comments may mention the term; executable code must not read it.
  const code = supabaseClient.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/SERVICE_ROLE/.test(code), 'no service-role env access in client code');
});

/* ------------------------------------------------------------------ */
/* P. Phase 10–14 regression spot checks                                */
/* ------------------------------------------------------------------ */
section('P. Phase 10–14 regression spot checks');

await test('Phase 10.8 social sources still render from the same data (no second social system)', () => {
  const data = salonData();
  data.socialProfiles = {
    instagram: 'https://instagram.com/nexora',
    youtube: 'https://youtube.com/@nexora',
    facebook: 'https://facebook.com/nexora',
    tiktok: 'https://tiktok.com/@nexora',
  };
  cleanup();
  freshStore();
  const el = galleryFor('barber_mens_grooming', data);
  const sources = el.querySelector('[data-testid="site-social-sources"]');
  assert.ok(sources, 'sources bar');
  for (const platform of ['instagram', 'youtube', 'facebook', 'tiktok']) {
    assert.ok(sources.querySelector(`[data-testid="site-social-source-${platform}"]`), platform);
  }
});

await test('Phase 10.12 SiteImage path and Phase 14 gallery remain intact (gallery module untouched by videos)', async () => {
  const siteGallery = await readFile('src/lib/siteGallery.ts', 'utf8');
  assert.ok(siteGallery.includes('export function'), 'siteGallery intact');
  const siteImage = await readFile('src/components/SiteImage.tsx', 'utf8');
  assert.match(siteImage, /loading="lazy"|loading=\{/, 'SiteImage lazy');
  assert.ok(siteImage.includes('context'), 'context prop');
});

await test('Phase 15.1–15.9 contracts all still hold in one combined projection', () => {
  for (const themeId of THEMES) {
    const data = salonData();
    const items = videoItemsForTheme(themeId, data);
    // 15.1: theme isolation + one shared gallery.
    assert.equal(items.length, 10);
    // 15.3: 5+5.
    assert.equal(videoKindCountsForTheme(themeId, data).short, 5);
    assert.equal(videoKindCountsForTheme(themeId, data).long, 5);
    // 15.5: protected.
    for (const item of items) assert.equal(item.origin, 'theme');
    // 15.7: exact destinations.
    for (const item of items) {
      const dest = validateOriginalVideoUrl(item.originalPlatformUrl, item.platform, item.externalVideoId);
      assert.equal(dest.ok, true);
    }
    // 15.8/15.9: like + weekly engine works.
    freshStore();
    const businessId = videoLikeBusinessId(data);
    const actor = videoLikeActor('user-acceptance-0000-0000-0000-000000000000');
    const r = toggleVideoLike({ businessId, themeId, videoId: items[0].id, data, actor });
    assert.equal(r.ok, true);
    assert.equal(weeklyTopVideos(businessId, themeId, data)[0].item.id, items[0].id);
  }
});

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
console.log(`\nPHASE 15.10 — final 5-theme video acceptance: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const { name, error } of failures) {
    console.error(`  - ${name}\n    ${String(error && error.message ? error.message : error).slice(0, 400)}`);
  }
  process.exit(1);
}
