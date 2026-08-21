/**
 * PHASE 15.3 — 5 Shorts + 5 Long Videos per Theme
 *
 * Verifies for ALL 5 themes:
 *   1. Exactly 5 shorts + 5 longs after catalog fill (10 per theme).
 *   2. Total ≥ 50 unique theme-specific catalog records across themes.
 *   3. Strict theme isolation — no shared ids/urls/titles across themes.
 *   4. short/long kind identification (explicit videoKind + URL inference).
 *   5. Working YouTube URLs + img.youtube.com thumbnails (no broken/random).
 *   6. Owner videos stay associated with the correct theme and kind.
 *   7. UI kind tabs + badges; section contract preserved.
 *   8. No new DB tables/migrations; Phase 15.1/15.2 fields still work.
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

const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const {
  videoItemsForTheme,
  videoKindCountsForTheme,
  resolveVideoKind,
  ownerVideoForTheme,
} = await import('../src/lib/siteVideoGallery.ts');
const {
  themeVideoCatalog,
  themeVideoSeeds,
  themeVideosOfKind,
  totalThemeVideoCatalogCount,
  allThemeVideoExternalIds,
  allThemeVideoRecordIds,
  VIDEO_KIND_QUOTA,
} = await import('../src/lib/siteVideoCatalog.ts');
const { parseYoutubeVideoId } = await import('../src/lib/siteSocialFeed.ts');
const { videoGalleryChrome } = await import('../src/lib/siteVideoGalleryI18n.ts');

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
  return { ...base, ...extras, templateId: themeId, socialVideos: extras.socialVideos !== undefined ? extras.socialVideos : base.socialVideos };
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
/* 1. Catalog integrity — 50 unique theme records                      */
/* ------------------------------------------------------------------ */

section('Catalog — 5 shorts + 5 longs × 5 themes = 50 unique records');

await test('total catalog count is exactly 50', () => {
  assert.equal(totalThemeVideoCatalogCount(), 50);
  assert.equal(allThemeVideoRecordIds().length, 50);
  assert.equal(allThemeVideoExternalIds().length, 50);
});

await test('every theme has exactly 5 short + 5 long seeds', () => {
  for (const config of CASES) {
    const seeds = themeVideoSeeds(config.id);
    assert.equal(seeds.length, 10, `${config.id}: seed count`);
    assert.equal(seeds.filter((s) => s.kind === 'short').length, VIDEO_KIND_QUOTA, `${config.id}: shorts`);
    assert.equal(seeds.filter((s) => s.kind === 'long').length, VIDEO_KIND_QUOTA, `${config.id}: longs`);
    const catalog = themeVideoCatalog(config.id);
    assert.equal(catalog.length, 10);
    assert.ok(catalog.every((v) => v.themeId === config.id), `${config.id}: themeId stamp`);
    assert.ok(catalog.every((v) => v.platform === 'youtube'));
    assert.ok(catalog.every((v) => v.videoKind === 'short' || v.videoKind === 'long'));
  }
});

await test('no shared record ids, external ids, urls, or titles across themes', () => {
  const ids = allThemeVideoRecordIds();
  const ext = allThemeVideoExternalIds();
  assert.equal(new Set(ids).size, ids.length, 'duplicate record ids');
  assert.equal(new Set(ext).size, ext.length, 'duplicate external ids');

  const urls = [];
  const titles = [];
  for (const config of CASES) {
    for (const v of themeVideoCatalog(config.id)) {
      urls.push(v.url);
      titles.push(`${config.id}::${v.title}`);
    }
  }
  assert.equal(new Set(urls).size, urls.length, 'duplicate urls across catalog');
  // Titles must not be copied verbatim between themes.
  const plainTitles = [];
  for (const config of CASES) {
    for (const v of themeVideoCatalog(config.id)) plainTitles.push(v.title);
  }
  // Allowing same title wording only if we never intended it — require uniqueness.
  assert.equal(new Set(plainTitles).size, plainTitles.length, 'duplicate titles across themes');
});

await test('every catalog URL is a real https YouTube link with a valid 11-char id', () => {
  for (const config of CASES) {
    for (const v of themeVideoCatalog(config.id)) {
      assert.ok(/^https:\/\/www\.youtube\.com\//.test(v.url), `${v.id}: bad url ${v.url}`);
      const id = parseYoutubeVideoId(v.url);
      assert.ok(id && id.length === 11, `${v.id}: bad yt id from ${v.url}`);
      assert.equal(v.externalVideoId, id);
      assert.ok(v.thumbnailUrl.includes(`img.youtube.com/vi/${id}/`), `${v.id}: bad thumb`);
      if (v.videoKind === 'short') {
        assert.ok(v.url.includes('/shorts/'), `${v.id}: short must use /shorts/`);
      } else {
        assert.ok(v.url.includes('watch?v='), `${v.id}: long must use watch?v=`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. Fill contract — empty owner → 5+5 per theme                      */
/* ------------------------------------------------------------------ */

section('Fill contract — empty owner data yields 5 shorts + 5 longs');

await test('videoKindCountsForTheme is 5/5/10 for every theme with empty owner data', () => {
  for (const config of CASES) {
    const counts = videoKindCountsForTheme(config.id, { socialVideos: [] });
    assert.deepEqual(counts, { short: 5, long: 5, total: 10 }, `${config.id}: ${JSON.stringify(counts)}`);
  }
});

await test('filled items are theme-origin only and never leak foreign titles', () => {
  for (const config of CASES) {
    const items = videoItemsForTheme(config.id, { socialVideos: [] });
    assert.ok(items.every((i) => i.origin === 'theme'));
    assert.ok(items.every((i) => i.themeId === config.id));
    const titles = new Set(items.map((i) => i.title));
    for (const other of CASES) {
      if (other.id === config.id) continue;
      for (const seed of themeVideoSeeds(other.id)) {
        assert.equal(titles.has(seed.title), false, `${config.id} leaked ${seed.title}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 3. Kind identification                                              */
/* ------------------------------------------------------------------ */

section('Kind identification — explicit + URL inference');

await test('resolveVideoKind honours explicit videoKind and infers from URL', () => {
  assert.equal(resolveVideoKind({ videoKind: 'short', url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', platform: 'youtube' }), 'short');
  assert.equal(resolveVideoKind({ videoKind: 'long', url: 'https://youtube.com/shorts/dQw4w9WgXcQ', platform: 'youtube' }), 'long');
  assert.equal(resolveVideoKind({ url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', platform: 'youtube' }), 'short');
  assert.equal(resolveVideoKind({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', platform: 'youtube' }), 'long');
  assert.equal(resolveVideoKind({ url: 'https://www.instagram.com/reel/AbCdef12345/', platform: 'instagram' }), 'short');
  assert.equal(resolveVideoKind({ url: 'https://www.tiktok.com/@x/video/1', platform: 'tiktok' }), 'short');
});

await test('owner shorts count toward the short quota; longs toward long', () => {
  const ownerShort = {
    id: 'owner-short-1',
    title: 'OWNER_SHORT_ONLY',
    platform: 'youtube',
    url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    externalVideoId: 'dQw4w9WgXcQ',
    themeId: 'barber_mens_grooming',
    videoKind: 'short',
  };
  const ownerLong = {
    id: 'owner-long-1',
    title: 'OWNER_LONG_ONLY',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=OPf0YbXqDm0',
    thumbnailUrl: 'https://img.youtube.com/vi/OPf0YbXqDm0/hqdefault.jpg',
    externalVideoId: 'OPf0YbXqDm0',
    themeId: 'barber_mens_grooming',
    videoKind: 'long',
  };
  const items = videoItemsForTheme('barber_mens_grooming', {
    socialVideos: [ownerShort, ownerLong],
  });
  const shorts = items.filter((i) => i.kind === 'short');
  const longs = items.filter((i) => i.kind === 'long');
  assert.equal(shorts.length, 5);
  assert.equal(longs.length, 5);
  assert.ok(shorts.some((i) => i.id === 'owner-short-1' && i.origin === 'owner'));
  assert.ok(longs.some((i) => i.id === 'owner-long-1' && i.origin === 'owner'));
  // Owner takes a slot — catalog fills the remaining 4 of each kind.
  assert.equal(shorts.filter((i) => i.origin === 'theme').length, 4);
  assert.equal(longs.filter((i) => i.origin === 'theme').length, 4);
});

await test('owner video scoped to another theme never appears', () => {
  const foreign = {
    id: 'spa-only',
    title: 'SPA_FOREIGN_CLIP',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=1G4isv_Fylg',
    thumbnailUrl: 'https://img.youtube.com/vi/1G4isv_Fylg/hqdefault.jpg',
    themeId: 'beauty_skin_spa',
    videoKind: 'long',
  };
  const onBarber = videoItemsForTheme('barber_mens_grooming', { socialVideos: [foreign] });
  assert.equal(onBarber.some((i) => i.title === 'SPA_FOREIGN_CLIP'), false);
  assert.equal(ownerVideoForTheme(foreign, 'barber_mens_grooming'), null);
  const onSpa = videoItemsForTheme('beauty_skin_spa', { socialVideos: [foreign] });
  assert.ok(onSpa.some((i) => i.title === 'SPA_FOREIGN_CLIP' && i.origin === 'owner'));
});

/* ------------------------------------------------------------------ */
/* 4. UI — five themes render 5+5 with kind tabs                       */
/* ------------------------------------------------------------------ */

section('UI — five themes render 5 shorts + 5 longs with kind tabs');

for (const config of CASES) {
  await test(`${config.label}: 5+5 cards, kind badges, filter tabs`, () => {
    reset();
    const data = salonData(config.id, { socialVideos: [], socialProfiles: {} });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const feed = utils.getByTestId('site-social-feed');
    assert.equal(feed.getAttribute('data-theme'), config.id);
    assert.equal(feed.getAttribute('data-short-count'), '5');
    assert.equal(feed.getAttribute('data-long-count'), '5');
    assert.equal(feed.getAttribute('data-section-state'), 'ready');
    assert.equal(feed.getAttribute('id'), 'section-social');

    const cards = utils.container.querySelectorAll('[data-testid="site-social-item"]');
    assert.equal(cards.length, 10);
    const shortCards = utils.container.querySelectorAll('[data-video-kind="short"]');
    const longCards = utils.container.querySelectorAll('[data-video-kind="long"]');
    assert.equal(shortCards.length, 5);
    assert.equal(longCards.length, 5);
    assert.ok(utils.getByTestId('site-video-kind-filter'));
    assert.ok(utils.getByTestId('site-video-filter-short'));
    assert.ok(utils.getByTestId('site-video-filter-long'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-video-kind-badge"]').length, 10);

    // Filter to shorts only
    fireEvent.click(utils.getByTestId('site-video-filter-short'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 5);
    assert.ok(
      Array.from(utils.container.querySelectorAll('[data-testid="site-social-item"]')).every(
        (el) => el.getAttribute('data-video-kind') === 'short',
      ),
    );

    fireEvent.click(utils.getByTestId('site-video-filter-long'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 5);
    assert.ok(
      Array.from(utils.container.querySelectorAll('[data-testid="site-social-item"]')).every(
        (el) => el.getAttribute('data-video-kind') === 'long',
      ),
    );

    fireEvent.click(utils.getByTestId('site-video-filter-all'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 10);
    reset();
  });
}

await test('theme switch resets filter and shows only the new theme collection', () => {
  reset();
  let utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { socialVideos: [] }),
    mode: 'desktop',
  }));
  fireEvent.click(utils.getByTestId('site-video-filter-short'));
  const barberTitle = themeVideoSeeds('barber_mens_grooming')[0].title;
  assert.ok(flat(utils.getByTestId('site-social-feed')).includes(barberTitle));
  cleanup();

  utils = render(React.createElement(NailLash, {
    data: salonData('nail_lash_studio', { socialVideos: [] }),
    mode: 'desktop',
  }));
  const feed = utils.getByTestId('site-social-feed');
  assert.equal(feed.getAttribute('data-theme'), 'nail_lash_studio');
  assert.equal(feed.getAttribute('data-kind-filter') || utils.getByTestId('site-video-gallery-grid').getAttribute('data-kind-filter'), 'all');
  assert.equal(flat(feed).includes(barberTitle), false);
  const nailTitle = themeVideoSeeds('nail_lash_studio')[0].title;
  assert.ok(flat(feed).includes(nailTitle));
  reset();
});

await test('EN/HI kind tab labels flip with locale', () => {
  reset({ locale: 'en' });
  let utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { socialVideos: [] }),
    mode: 'desktop',
  }));
  const en = videoGalleryChrome('barber_mens_grooming', 'en');
  assert.ok(flat(utils.getByTestId('site-video-filter-short')).includes(en.shortsTab));
  cleanup();

  reset({ locale: 'hi' });
  utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { socialVideos: [] }),
    mode: 'desktop',
  }));
  const hi = videoGalleryChrome('barber_mens_grooming', 'hi');
  assert.ok(flat(utils.getByTestId('site-video-filter-short')).includes(hi.shortsTab));
  assert.notEqual(hi.shortsTab, en.shortsTab);
  reset();
});

await test('desktop / tablet / mobile all render 10 cards', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    reset();
    const utils = render(React.createElement(Barber, {
      data: salonData('barber_mens_grooming', { socialVideos: [] }),
      mode,
    }));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 10, mode);
    reset();
  }
});

/* ------------------------------------------------------------------ */
/* 5. Schema / security / regression                                   */
/* ------------------------------------------------------------------ */

section('Schema safety & regression');

await test('no new migration invented for 15.3; social_videos still the only video table', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  const phase = migrations.filter((f) => /15\.3|video_kind|shorts_long/i.test(f));
  assert.equal(phase.length, 0, `unexpected migrations: ${phase.join(',')}`);
  const m06 = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260811000601_m06_media_social_location_settings.sql'),
    'utf8',
  );
  assert.ok(m06.includes('social_videos'));
  assert.ok(m06.includes('external_video_id'));
});

await test('catalog module has no API keys / service_role / random fake hosts', () => {
  const src = fs.readFileSync(path.join(root, 'src/lib/siteVideoCatalog.ts'), 'utf8');
  assert.equal(/service_role/.test(src), false);
  assert.equal(/YOUTUBE_API_KEY/.test(src), false);
  assert.equal(/AIza[0-9A-Za-z_-]{20,}/.test(src), false);
  assert.equal(/example\.com/.test(src), false);
  assert.equal(/lorempixel|via\.placeholder/.test(src), false);
  assert.ok(src.includes('youtube.com'));
  assert.ok(src.includes('youtubeThumbUrl'));
});

await test('chrome copy includes kind labels for every theme + locale', () => {
  for (const config of CASES) {
    for (const locale of ['en', 'hi']) {
      const chrome = videoGalleryChrome(config.id, locale);
      for (const key of ['shortsTab', 'longTab', 'allTab', 'shortBadge', 'longBadge']) {
        assert.ok(chrome[key], `${config.id} ${locale}: missing ${key}`);
      }
    }
  }
});

await test('owner with 5 shorts + 5 longs of their own — no catalog fill needed', () => {
  // Distinct owner external ids (not catalog ids) so PHASE 15.5 protection
  // does not treat them as mock rows. 11-char [A-Za-z0-9_-] pattern.
  const own = [];
  for (let i = 0; i < 5; i++) {
    const sid = `OwNshort0${i}x`; // 11 chars
    const lid = `OwNlong00${i}x`; // 11 chars
    own.push({
      id: `owner-full-s-${i}`,
      title: `OWNER_FULL_short_${i}`,
      platform: 'youtube',
      url: `https://www.youtube.com/shorts/${sid}`,
      thumbnailUrl: `https://img.youtube.com/vi/${sid}/hqdefault.jpg`,
      externalVideoId: sid,
      themeId: 'barber_mens_grooming',
      videoKind: 'short',
    });
    own.push({
      id: `owner-full-l-${i}`,
      title: `OWNER_FULL_long_${i}`,
      platform: 'youtube',
      url: `https://www.youtube.com/watch?v=${lid}`,
      thumbnailUrl: `https://img.youtube.com/vi/${lid}/hqdefault.jpg`,
      externalVideoId: lid,
      themeId: 'barber_mens_grooming',
      videoKind: 'long',
    });
  }
  const items = videoItemsForTheme('barber_mens_grooming', { socialVideos: own });
  assert.equal(items.length, 10);
  assert.ok(items.every((i) => i.origin === 'owner'), 'should not need theme fill');
  assert.ok(items.every((i) => i.title.startsWith('OWNER_FULL_')));
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
