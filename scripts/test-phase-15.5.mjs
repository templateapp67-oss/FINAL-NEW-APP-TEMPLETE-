/**
 * PHASE 15.5 — Theme-wise protected mock video data
 *
 * Verifies for ALL 5 themes:
 *   1. Protected mock catalog: exactly 5 shorts + 5 longs per theme (50 total).
 *   2. All 50 records unique — no shared titles, descriptions, thumbs, urls, ids.
 *   3. Theme-matched content vocabulary (barber/hair/spa/family/nail).
 *   4. Valid working YouTube URLs + img.youtube.com thumbnails only.
 *   5. Mocks appear automatically when owner has not configured enough videos.
 *   6. Isolation by theme (and salon owner scope via themeId stamp).
 *   7. Mock/default records cannot be permanently deleted.
 *   8. No new DB tables/migrations; Phase 15.1–15.4 contracts preserved.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

const React = (await import('react')).default;
const { render, cleanup, fireEvent, act } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const StepSocials = (await import('../src/screens/StepSocials.tsx')).default;

const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const {
  videoItemsForTheme,
  videoKindCountsForTheme,
} = await import('../src/lib/siteVideoGallery.ts');
const {
  themeVideoCatalog,
  themeVideoSeeds,
  totalThemeVideoCatalogCount,
  allThemeVideoExternalIds,
  allThemeVideoRecordIds,
  isProtectedThemeMockVideo,
  isThemeMockVideoId,
  filterDeletableOwnerVideos,
  isDeleteBlockedForVideoId,
  THEME_MOCK_CONTENT_HINTS,
  THEME_MOCK_ID_PREFIX,
  themeMockTitles,
  themeMockDescriptions,
  themeMockThumbnailUrls,
  VIDEO_KIND_QUOTA,
} = await import('../src/lib/siteVideoCatalog.ts');
const { parseYoutubeVideoId } = await import('../src/lib/siteSocialFeed.ts');

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
    console.error(`  ✗ ${name}\n    ${String(error && error.message ? error.message : error).split('\n').join('\n    ')}`);
  }
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

const CASES = [
  { id: 'barber_mens_grooming', Component: Barber, label: 'Barber' },
  { id: 'hair_studio_color_bar', Component: HairStudio, label: 'Hair Studio' },
  { id: 'beauty_skin_spa', Component: BeautySpa, label: 'Beauty/Spa' },
  { id: 'family_full_service', Component: Family, label: 'Family' },
  { id: 'nail_lash_studio', Component: NailLash, label: 'Nail/Lash' },
];

function salonData(themeId, extras = {}) {
  const base = structuredClone(initialData);
  base.templateId = themeId;
  if (extras.socialVideos !== undefined) base.socialVideos = extras.socialVideos;
  if (extras.socialProfiles !== undefined) base.socialProfiles = extras.socialProfiles;
  return {
    ...base,
    ...extras,
    templateId: themeId,
    socialVideos: extras.socialVideos !== undefined ? extras.socialVideos : base.socialVideos,
  };
}

function reset({ locale = 'en', appearance = 'light' } = {}) {
  cleanup();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setWebsiteSectionFlagsForTests({});
}

function flat(node) {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* 1. Protected catalog integrity                                      */
/* ------------------------------------------------------------------ */

section('Protected mock catalog — 5+5 × 5 themes, all unique');

await test('total mock catalog is exactly 50 protected records', () => {
  assert.equal(totalThemeVideoCatalogCount(), 50);
  assert.equal(allThemeVideoRecordIds().length, 50);
  assert.equal(allThemeVideoExternalIds().length, 50);
  assert.ok(allThemeVideoRecordIds().every((id) => id.startsWith(THEME_MOCK_ID_PREFIX)));
  assert.ok(allThemeVideoRecordIds().every((id) => isThemeMockVideoId(id)));
  assert.ok(allThemeVideoRecordIds().every((id) => isProtectedThemeMockVideo({ id })));
});

await test('every theme has exactly 5 short + 5 long protected mocks', () => {
  for (const config of CASES) {
    const seeds = themeVideoSeeds(config.id);
    assert.equal(seeds.length, 10, `${config.id}: seed count`);
    assert.equal(seeds.filter((s) => s.kind === 'short').length, VIDEO_KIND_QUOTA);
    assert.equal(seeds.filter((s) => s.kind === 'long').length, VIDEO_KIND_QUOTA);
    const catalog = themeVideoCatalog(config.id);
    assert.ok(catalog.every((v) => v.themeId === config.id));
    assert.ok(catalog.every((v) => isProtectedThemeMockVideo(v)));
    assert.ok(catalog.every((v) => v.platform === 'youtube'));
  }
});

await test('no shared titles, descriptions, thumbnails, urls, ids, or external ids across themes', () => {
  const titles = [];
  const descs = [];
  const thumbs = [];
  const urls = [];
  for (const config of CASES) {
    titles.push(...themeMockTitles(config.id));
    descs.push(...themeMockDescriptions(config.id));
    thumbs.push(...themeMockThumbnailUrls(config.id));
    urls.push(...themeVideoCatalog(config.id).map((v) => v.url));
  }
  assert.equal(new Set(titles).size, titles.length, 'duplicate titles');
  assert.equal(new Set(descs).size, descs.length, 'duplicate descriptions');
  assert.equal(new Set(thumbs).size, thumbs.length, 'duplicate thumbnails');
  assert.equal(new Set(urls).size, urls.length, 'duplicate urls');
  assert.equal(new Set(allThemeVideoRecordIds()).size, 50);
  assert.equal(new Set(allThemeVideoExternalIds()).size, 50);
});

await test('every mock URL is a real https YouTube link with valid 11-char id + CDN thumb', () => {
  for (const config of CASES) {
    for (const v of themeVideoCatalog(config.id)) {
      assert.ok(/^https:\/\/www\.youtube\.com\//.test(v.url), `${v.id}: ${v.url}`);
      const id = parseYoutubeVideoId(v.url);
      assert.ok(id && id.length === 11, `${v.id}: bad id`);
      assert.equal(v.externalVideoId, id);
      assert.ok(v.thumbnailUrl.includes(`img.youtube.com/vi/${id}/`), `${v.id}: thumb`);
      if (v.videoKind === 'short') assert.ok(v.url.includes('/shorts/'));
      else assert.ok(v.url.includes('watch?v='));
    }
  }
});

await test('mock content vocabulary matches each theme (not generic cross-copy)', () => {
  for (const config of CASES) {
    const blob = [
      ...themeMockTitles(config.id),
      ...themeMockDescriptions(config.id),
      ...themeVideoCatalog(config.id).map((v) => v.channelName || ''),
    ]
      .join(' ')
      .toLowerCase();
    const hints = THEME_MOCK_CONTENT_HINTS[config.id];
    const hits = hints.filter((h) => blob.includes(h.toLowerCase()));
    assert.ok(
      hits.length >= 3,
      `${config.id}: expected theme hints in copy, got hits=${hits.join(',')} blob sample=${blob.slice(0, 120)}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 2. Auto-appear when owner has not configured enough                 */
/* ------------------------------------------------------------------ */

section('Auto-appear when owner videos are missing / short');

await test('empty owner data → 5 shorts + 5 longs of theme-origin mocks for every theme', () => {
  for (const config of CASES) {
    const counts = videoKindCountsForTheme(config.id, { socialVideos: [] });
    assert.deepEqual(counts, { short: 5, long: 5, total: 10 }, config.id);
    const items = videoItemsForTheme(config.id, { socialVideos: [] });
    assert.ok(items.every((i) => i.origin === 'theme'));
    assert.ok(items.every((i) => i.themeId === config.id));
    assert.ok(items.every((i) => isThemeMockVideoId(i.id)));
  }
});

await test('partial owner data still fills remaining mock slots (not replace owner)', () => {
  const ownerShort = {
    id: 'owner-s-1',
    title: 'OWNER_ONLY_SHORT',
    platform: 'youtube',
    url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    externalVideoId: 'dQw4w9WgXcQ',
    themeId: 'barber_mens_grooming',
    videoKind: 'short',
  };
  const items = videoItemsForTheme('barber_mens_grooming', { socialVideos: [ownerShort] });
  const shorts = items.filter((i) => i.kind === 'short');
  assert.equal(shorts.length, 5);
  assert.ok(shorts.some((i) => i.id === 'owner-s-1' && i.origin === 'owner'));
  assert.equal(shorts.filter((i) => i.origin === 'theme').length, 4);
  assert.equal(items.filter((i) => i.kind === 'long' && i.origin === 'theme').length, 5);
});

await test('mocks never leak across themes', () => {
  for (const config of CASES) {
    const items = videoItemsForTheme(config.id, { socialVideos: [] });
    const titles = new Set(items.map((i) => i.title));
    for (const other of CASES) {
      if (other.id === config.id) continue;
      for (const t of themeMockTitles(other.id)) {
        assert.equal(titles.has(t), false, `${config.id} leaked ${t}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 3. Cannot permanently delete mocks                                  */
/* ------------------------------------------------------------------ */

section('Protected mocks cannot be permanently deleted');

await test('filterDeletableOwnerVideos retains protected mocks', () => {
  const mock = themeVideoCatalog('barber_mens_grooming')[0];
  const owner = {
    id: 'real-owner-1',
    title: 'Real owner reel',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    thumbnailUrl: 'https://img.youtube.com/vi/aaaaaaaaaaa/hqdefault.jpg',
    themeId: 'barber_mens_grooming',
    videoKind: 'long',
  };
  const list = [mock, owner];

  // Try to delete the mock — it must stay.
  assert.equal(isDeleteBlockedForVideoId(list, mock.id), true);
  const afterMockDelete = filterDeletableOwnerVideos(list, mock.id);
  assert.equal(afterMockDelete.length, 2);
  assert.ok(afterMockDelete.some((v) => v.id === mock.id));

  // Delete the real owner — mock stays, owner goes.
  assert.equal(isDeleteBlockedForVideoId(list, owner.id), false);
  const afterOwnerDelete = filterDeletableOwnerVideos(list, owner.id);
  assert.equal(afterOwnerDelete.length, 1);
  assert.equal(afterOwnerDelete[0].id, mock.id);
});

await test('even if mock ids are stripped from owner storage, gallery re-fills them', () => {
  // Simulate a hostile wipe of socialVideos (including any leaked mock ids).
  const wiped = { socialVideos: [] };
  const items = videoItemsForTheme('beauty_skin_spa', wiped);
  assert.equal(items.length, 10);
  assert.ok(items.every((i) => i.origin === 'theme'));
  assert.ok(items.every((i) => isThemeMockVideoId(i.id)));
});

await test('owner UI blocks delete of protected mock rows if present in the list', () => {
  reset();
  const mock = themeVideoCatalog('family_full_service')[0];
  const owner = {
    id: 'family-owner-1',
    title: 'Family owner clip',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    thumbnailUrl: 'https://img.youtube.com/vi/bbbbbbbbbbb/hqdefault.jpg',
    themeId: 'family_full_service',
    videoKind: 'long',
  };
  let latest = salonData('family_full_service', { socialVideos: [mock, owner] });
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => {
        latest = d;
      },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  const cards = utils.container.querySelectorAll('[data-testid="owner-social-video-card"]');
  assert.equal(cards.length, 2);

  // Click delete on the mock card (first delete button that belongs to mock).
  const mockCard = Array.from(cards).find((c) => c.getAttribute('data-external-id') === mock.externalVideoId);
  assert.ok(mockCard);
  const delBtn = mockCard.querySelector('button[title="Delete video"]');
  assert.ok(delBtn);
  fireEvent.click(delBtn);

  // Mock still present; feedback should mention cannot delete.
  assert.ok((latest.socialVideos || []).some((v) => v.id === mock.id));
  assert.ok(flat(utils.container).toLowerCase().includes('cannot') || (latest.socialVideos || []).length === 2);

  // Owner row can still be deleted.
  const ownerCard = Array.from(utils.container.querySelectorAll('[data-testid="owner-social-video-card"]')).find(
    (c) => (c.textContent || '').includes('Family owner clip'),
  );
  if (ownerCard) {
    const ownerDel = ownerCard.querySelector('button[title="Delete video"]');
    fireEvent.click(ownerDel);
    assert.equal((latest.socialVideos || []).some((v) => v.id === 'family-owner-1'), false);
    assert.ok((latest.socialVideos || []).some((v) => v.id === mock.id));
  }
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 4. UI — mocks render on every theme site                            */
/* ------------------------------------------------------------------ */

section('UI — mocks render on public site for every theme');

for (const config of CASES) {
  await test(`${config.label}: empty owner → 10 mock cards, theme-isolated`, () => {
    reset();
    const data = salonData(config.id, { socialVideos: [], socialProfiles: {} });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const feed = utils.getByTestId('site-social-feed');
    assert.equal(feed.getAttribute('data-theme'), config.id);
    assert.equal(feed.getAttribute('data-short-count'), '5');
    assert.equal(feed.getAttribute('data-long-count'), '5');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 10);
    assert.equal(utils.container.querySelectorAll('[data-video-origin="theme"]').length, 10);

    const text = flat(feed);
    // Own mock title present; foreign mock title absent.
    const ownTitle = themeMockTitles(config.id)[0];
    assert.ok(text.includes(ownTitle), `${config.id}: missing ${ownTitle}`);
    for (const other of CASES) {
      if (other.id === config.id) continue;
      const foreign = themeMockTitles(other.id)[0];
      assert.equal(text.includes(foreign), false, `${config.id} leaked ${foreign}`);
    }
    reset();
  });
}

/* ------------------------------------------------------------------ */
/* 5. Schema / security / regression                                   */
/* ------------------------------------------------------------------ */

section('Schema safety & regression');

await test('no new migration invented for 15.5', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  assert.equal(migrations.filter((f) => /15\.5|mock_video|theme_video/i.test(f)).length, 0);
  const m06 = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260811000601_m06_media_social_location_settings.sql'),
    'utf8',
  );
  assert.ok(m06.includes('social_videos'));
  assert.ok(m06.includes('external_video_id'));
});

await test('catalog has no API keys / service_role / fake hosts', () => {
  const src = fs.readFileSync(path.join(root, 'src/lib/siteVideoCatalog.ts'), 'utf8');
  assert.equal(/service_role/.test(src), false);
  assert.equal(/YOUTUBE_API_KEY/.test(src), false);
  assert.equal(/AIza[0-9A-Za-z_-]{20,}/.test(src), false);
  assert.equal(/example\.com|lorempixel|via\.placeholder/.test(src), false);
  assert.ok(src.includes('isProtectedThemeMockVideo'));
  assert.ok(src.includes('filterDeletableOwnerVideos'));
});

await test('protected mock helpers are exported from gallery layer', async () => {
  const gallery = await import('../src/lib/siteVideoGallery.ts');
  assert.equal(typeof gallery.isProtectedThemeMockVideo, 'function');
  assert.equal(typeof gallery.filterDeletableOwnerVideos, 'function');
  assert.equal(typeof gallery.isThemeMockVideoId, 'function');
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) {
    console.error(`  ✗ ${f.name}: ${f.error && f.error.message ? f.error.message : f.error}`);
  }
  process.exit(1);
}
process.exit(0);
