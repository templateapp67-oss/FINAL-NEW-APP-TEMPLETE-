/**
 * PHASE 15.1 — VIDEO GALLERY FOUNDATION (five-theme acceptance test)
 *
 * Verifies the Video Gallery section for ALL 5 themes:
 *   1. Foundation — one shared architecture (SiteVideoGallery + siteVideoGallery)
 *      used by every theme; no duplicate per-theme video systems.
 *   2. Theme isolation — each theme renders its own independent collection
 *      (themeId-scoped items never leak; unscoped items stay grandfathered).
 *   3. Data safety — existing socialVideos only; unsafe URLs rejected; no
 *      invented posts, no YouTube auto-fetch, no likes, no admin/dashboard.
 *   4. UI states — loading / empty / error / broken-thumbnail fallback.
 *   5. Lazy loading — thumbnails load via SiteImage (IO + lazy); embed iframe
 *      only after Play.
 *   6. Responsive — desktop / tablet / mobile grids; Light/Dark; EN/HI.
 *   7. Regression — Phase 10.8 section contract preserved
 *      (data-site-section="videos", #section-social, site-social-* test ids).
 */
import assert from 'node:assert/strict';
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
dom.window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function pause() {};
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
  videoIdsForTheme,
  ownerVideoBelongsToTheme,
  ownerVideoForTheme,
  videoGalleryIsEmpty,
  videoGalleryThemeConfig,
  VIDEO_GALLERY_THEME_CONFIG,
  resolveVideoThumbnail,
  safeExternalVideoUrl,
} = await import('../src/lib/siteVideoGallery.ts');
const { videoGalleryChrome } = await import('../src/lib/siteVideoGalleryI18n.ts');
const { siteText } = await import('../src/lib/siteI18n.ts');

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

const THUMB_A = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=600&auto=format&fit=crop';
const THUMB_B = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop';
const THUMB_C = 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop';
const THUMB_D = 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?q=80&w=600&auto=format&fit=crop';
const THUMB_E = 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=600&auto=format&fit=crop';

function ytUrl(id = 'dQw4w9WgXcQ') {
  return `https://www.youtube.com/watch?v=${id}`;
}

function makeVideo(partial) {
  return {
    id: partial.id || `v-${Math.random().toString(36).slice(2, 8)}`,
    title: partial.title || 'Sample reel',
    platform: partial.platform || 'instagram',
    url: partial.url || 'https://www.instagram.com/reel/AbCdef12345/',
    thumbnailUrl: partial.thumbnailUrl !== undefined ? partial.thumbnailUrl : THUMB_A,
    dateAdded: partial.dateAdded,
    likesCount: partial.likesCount,
    themeId: partial.themeId,
  };
}

/** Five fully independent, theme-scoped collections (no shared ids/urls). */
const THEME_VIDEOS = {
  barber_mens_grooming: [
    makeVideo({
      id: 'barber-v1',
      title: 'BARBER_ONLY_FADE',
      platform: 'youtube',
      url: ytUrl('aaaaaaaaaaa'),
      thumbnailUrl: THUMB_A,
      themeId: 'barber_mens_grooming',
    }),
    makeVideo({
      id: 'barber-v2',
      title: 'BARBER_BEARD_WORK',
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/BarberOnly01/',
      thumbnailUrl: THUMB_B,
      themeId: 'barber_mens_grooming',
    }),
  ],
  hair_studio_color_bar: [
    makeVideo({
      id: 'hair-v1',
      title: 'HAIR_ONLY_BALAYAGE',
      platform: 'youtube',
      url: ytUrl('bbbbbbbbbbb'),
      thumbnailUrl: THUMB_C,
      themeId: 'hair_studio_color_bar',
    }),
  ],
  beauty_skin_spa: [
    makeVideo({
      id: 'spa-v1',
      title: 'SPA_ONLY_FACIAL',
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/SpaOnlyClip1/',
      thumbnailUrl: THUMB_D,
      themeId: 'beauty_skin_spa',
    }),
  ],
  family_full_service: [
    makeVideo({
      id: 'family-v1',
      title: 'FAMILY_ONLY_KIDS',
      platform: 'youtube',
      url: ytUrl('ccccccccccc'),
      thumbnailUrl: THUMB_E,
      themeId: 'family_full_service',
    }),
  ],
  nail_lash_studio: [
    makeVideo({
      id: 'nail-v1',
      title: 'NAIL_ONLY_CHROME',
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/NailOnlyClip1/',
      thumbnailUrl: THUMB_A,
      themeId: 'nail_lash_studio',
    }),
    makeVideo({
      id: 'nail-v2',
      title: 'NAIL_LASH_LIFT',
      platform: 'youtube',
      url: ytUrl('ddddddddddd'),
      thumbnailUrl: THUMB_B,
      themeId: 'nail_lash_studio',
    }),
  ],
};

/** Flatten every theme-scoped video into one salon payload. */
function allScopedVideos() {
  return Object.values(THEME_VIDEOS).flat();
}

function salonData(themeId, extras = {}) {
  const base = structuredClone(initialData);
  base.templateId = themeId;
  base.socialVideos = extras.socialVideos !== undefined
    ? extras.socialVideos
    : (THEME_VIDEOS[themeId] || []);
  if (extras.socialProfiles !== undefined) base.socialProfiles = extras.socialProfiles;
  if (extras.gallery !== undefined) base.gallery = extras.gallery;
  return { ...base, ...extras, socialVideos: base.socialVideos, templateId: themeId };
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
/* 1. Data layer — pure helpers                                        */
/* ------------------------------------------------------------------ */

section('Data layer — theme isolation & safety');

await test('VIDEO_GALLERY_THEME_CONFIG covers all five themes with independent grids', () => {
  const ids = Object.keys(VIDEO_GALLERY_THEME_CONFIG);
  assert.equal(ids.length, 5);
  for (const config of CASES) {
    const cfg = videoGalleryThemeConfig(config.id);
    assert.ok(cfg.grid.desktop >= 1 && cfg.grid.mobile >= 1, `${config.id}: grid missing`);
    // PHASE 15.3 — separate short/long ratios replace the single tileRatio.
    assert.ok(cfg.shortTileRatio || cfg.tileRatio, `${config.id}: shortTileRatio missing`);
    assert.ok(cfg.longTileRatio || cfg.tileRatio, `${config.id}: longTileRatio missing`);
  }
});

await test('ownerVideoBelongsToTheme grandfathering + strict scoping', () => {
  assert.equal(ownerVideoBelongsToTheme(makeVideo({ themeId: null }), 'barber_mens_grooming'), true);
  assert.equal(ownerVideoBelongsToTheme(makeVideo({ themeId: undefined }), 'hair_studio_color_bar'), true);
  assert.equal(ownerVideoBelongsToTheme(makeVideo({ themeId: 'barber_mens_grooming' }), 'barber_mens_grooming'), true);
  assert.equal(ownerVideoBelongsToTheme(makeVideo({ themeId: 'barber_mens_grooming' }), 'beauty_skin_spa'), false);
  assert.equal(ownerVideoBelongsToTheme(makeVideo({ themeId: 'not_a_theme' }), 'barber_mens_grooming'), false);
  assert.equal(ownerVideoBelongsToTheme(null, 'barber_mens_grooming'), false);
});

await test('each theme resolves ONLY its own scoped videos (no sharing / copying)', () => {
  const data = { socialVideos: allScopedVideos() };
  for (const config of CASES) {
    const ids = videoIdsForTheme(config.id, data);
    const expectedOwner = THEME_VIDEOS[config.id].map((v) => v.id);
    // Owner-scoped ids must all be present; theme catalog may fill the 5+5 quota.
    for (const id of expectedOwner) {
      assert.ok(ids.includes(id), `${config.id}: missing owner id ${id}`);
    }
    // Foreign owner titles must never appear.
    const items = videoItemsForTheme(config.id, data);
    const titles = items.map((i) => i.title).join(' ');
    for (const other of CASES) {
      if (other.id === config.id) continue;
      for (const v of THEME_VIDEOS[other.id]) {
        assert.equal(titles.includes(v.title), false, `${config.id} leaked ${v.title}`);
      }
    }
    // Catalog fill ids are always theme-prefixed for this theme.
    for (const item of items) {
      if (item.origin === 'theme') {
        assert.ok(item.id.startsWith('theme:'), `${config.id}: bad theme id ${item.id}`);
        assert.equal(item.themeId, config.id);
      }
    }
  }
});

await test('unscoped (grandfathered) videos remain visible on every theme', () => {
  const shared = makeVideo({
    id: 'shared-v1',
    title: 'SHARED_GRANDFATHERED',
    themeId: null,
    url: ytUrl('eeeeeeeeeee'),
  });
  const data = { socialVideos: [shared, ...allScopedVideos()] };
  for (const config of CASES) {
    const ids = videoIdsForTheme(config.id, data);
    assert.ok(ids.includes('shared-v1'), `${config.id}: grandfathered video missing`);
  }
});

// (15.3 catalog fill is covered by test:phase-15.3 — 15.1 keeps isolation focus.)

await test('unsafe / incomplete videos are rejected (no invented posts)', () => {
  assert.equal(safeExternalVideoUrl('javascript:alert(1)'), '');
  assert.equal(safeExternalVideoUrl('data:text/html,hi'), '');
  assert.equal(safeExternalVideoUrl('#section-social'), '');
  assert.equal(safeExternalVideoUrl(''), '');
  assert.equal(
    ownerVideoForTheme(makeVideo({ url: 'javascript:alert(1)' }), 'barber_mens_grooming'),
    null,
  );
  assert.equal(
    ownerVideoForTheme({
      id: '',
      title: 'No id',
      platform: 'youtube',
      url: ytUrl(),
      thumbnailUrl: THUMB_A,
    }, 'barber_mens_grooming'),
    null,
  );
  // PHASE 15.3 — empty owner data is filled by the per-theme 5+5 catalog,
  // so the gallery is never empty for a known theme. Unsafe items still never invent posts.
  const filled = videoItemsForTheme('barber_mens_grooming', { socialVideos: [] });
  assert.equal(filled.length, 10, 'theme catalog supplies 5 shorts + 5 longs');
  assert.equal(videoGalleryIsEmpty('barber_mens_grooming', { socialVideos: [] }), false);
  assert.ok(filled.every((item) => item.origin === 'theme'));
});

await test('thumbnail resolves owner URL first, then YouTube default, else empty', () => {
  const withOwner = resolveVideoThumbnail(makeVideo({ thumbnailUrl: THUMB_A, url: ytUrl() }));
  assert.equal(withOwner, THUMB_A);
  const ytOnly = resolveVideoThumbnail(makeVideo({ thumbnailUrl: '', url: ytUrl('fffffffffff') }));
  assert.ok(ytOnly.includes('img.youtube.com/vi/fffffffffff'), `yt thumb missing: ${ytOnly}`);
  const none = resolveVideoThumbnail(makeVideo({
    thumbnailUrl: '',
    url: 'https://www.instagram.com/reel/NoThumbHere1/',
    platform: 'instagram',
  }));
  assert.equal(none, '');
});

await test('YouTube embed is derived; Instagram shortcode embeds; others open-only', () => {
  const yt = ownerVideoForTheme(
    makeVideo({ platform: 'youtube', url: ytUrl('ggggggggggg'), thumbnailUrl: THUMB_A }),
    'barber_mens_grooming',
  );
  assert.equal(yt?.embedKind, 'youtube');
  assert.ok(yt?.embedUrl?.includes('/embed/ggggggggggg'));

  const ig = ownerVideoForTheme(
    makeVideo({
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/IgShortCode1/',
      thumbnailUrl: THUMB_A,
    }),
    'barber_mens_grooming',
  );
  assert.equal(ig?.embedKind, 'instagram');
  assert.ok(ig?.embedUrl?.includes('/reel/IgShortCode1/embed'));

  const fb = ownerVideoForTheme(
    makeVideo({
      platform: 'facebook',
      url: 'https://www.facebook.com/watch/?v=123',
      thumbnailUrl: THUMB_A,
    }),
    'barber_mens_grooming',
  );
  assert.equal(fb?.embedUrl, null);
  assert.equal(fb?.url, 'https://www.facebook.com/watch/?v=123');
});

await test('dedup keeps a single card when the same id or url appears twice', () => {
  const a = makeVideo({ id: 'dup-1', url: ytUrl('hhhhhhhhhhh'), themeId: 'barber_mens_grooming' });
  const b = makeVideo({ id: 'dup-1', url: ytUrl('iiiiiiiiiii'), themeId: 'barber_mens_grooming' });
  const c = makeVideo({ id: 'dup-2', url: ytUrl('hhhhhhhhhhh'), themeId: 'barber_mens_grooming' });
  const items = videoItemsForTheme('barber_mens_grooming', { socialVideos: [a, b, c] });
  // Owner dups collapse to one; catalog may still fill remaining short/long slots.
  const owner = items.filter((i) => i.origin === 'owner');
  assert.equal(owner.length, 1, `expected 1 owner after dedup, got ${owner.length}`);
  assert.equal(owner[0].id, 'dup-1');
});

/* ------------------------------------------------------------------ */
/* 2. UI — five themes render independent galleries                    */
/* ------------------------------------------------------------------ */

section('UI — five themes render independent video galleries');

for (const config of CASES) {
  await test(`${config.label}: section contract + own videos only`, () => {
    reset();
    // Feed EVERY theme's videos into one payload — isolation must still hold.
    const data = salonData(config.id, { socialVideos: allScopedVideos() });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const feed = utils.getByTestId('site-social-feed');
    assert.equal(feed.getAttribute('data-theme'), config.id);
    assert.equal(feed.getAttribute('data-video-gallery'), 'true');
    assert.equal(feed.getAttribute('data-site-section'), 'videos');
    assert.equal(feed.getAttribute('id'), 'section-social');
    assert.equal(feed.getAttribute('data-section-state'), 'ready');

    const items = utils.container.querySelectorAll('[data-testid="site-social-item"]');
    const expected = THEME_VIDEOS[config.id];
    // PHASE 15.3 — owner videos + catalog fill → always 10 (5 short + 5 long).
    assert.equal(items.length, 10, `${config.id}: expected 5+5 cards, got ${items.length}`);

    const text = flat(feed);
    for (const v of expected) {
      assert.ok(text.includes(v.title), `${config.id}: missing own title ${v.title}`);
    }
    for (const other of CASES) {
      if (other.id === config.id) continue;
      for (const v of THEME_VIDEOS[other.id]) {
        assert.equal(text.includes(v.title), false, `${config.id} leaked ${v.title}`);
      }
    }
    reset();
  });
}

await test('theme switch drops previous media and shows the new theme collection', () => {
  reset();
  const data = salonData('barber_mens_grooming', { socialVideos: allScopedVideos() });
  let utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  assert.ok(flat(utils.getByTestId('site-social-feed')).includes('BARBER_ONLY_FADE'));
  assert.equal(flat(utils.getByTestId('site-social-feed')).includes('SPA_ONLY_FACIAL'), false);
  cleanup();

  utils = render(React.createElement(BeautySpa, {
    data: salonData('beauty_skin_spa', { socialVideos: allScopedVideos() }),
    mode: 'desktop',
  }));
  const feed = utils.getByTestId('site-social-feed');
  assert.equal(feed.getAttribute('data-theme'), 'beauty_skin_spa');
  assert.ok(flat(feed).includes('SPA_ONLY_FACIAL'));
  assert.equal(flat(feed).includes('BARBER_ONLY_FADE'), false);
  // No leftover embed from previous mount.
  assert.equal(utils.container.querySelectorAll('[data-testid="site-social-embed"]').length, 0);
  reset();
});

/* ------------------------------------------------------------------ */
/* 3. Loading / empty / error / broken thumbnail                       */
/* ------------------------------------------------------------------ */

section('UI states — loading, empty, error, broken thumbnail');

await test('empty owner socialVideos → theme catalog fills 5 shorts + 5 longs (no foreign leak)', () => {
  for (const config of CASES) {
    reset();
    const data = salonData(config.id, { socialVideos: [], socialProfiles: {} });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const feed = utils.container.querySelector('[data-site-section="videos"]');
    // PHASE 15.3 — catalog fill keeps the section ready with exactly 10 theme cards.
    assert.equal(feed?.getAttribute('data-section-state'), 'ready', `${config.id}: ready after catalog fill`);
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 10);
    assert.equal(feed?.getAttribute('data-short-count'), '5', `${config.id}: 5 shorts`);
    assert.equal(feed?.getAttribute('data-long-count'), '5', `${config.id}: 5 longs`);
    reset();
  }
});

await test('forced loading / error states still work for videos', () => {
  for (const config of CASES) {
    reset();
    setWebsiteSectionFlagsForTests({ videos: 'loading' });
    let utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { socialVideos: THEME_VIDEOS[config.id] }),
      mode: 'desktop',
    }));
    assert.equal(
      utils.container.querySelector('[data-site-section="videos"]')?.getAttribute('data-section-state'),
      'loading',
      `${config.id}: loading`,
    );
    assert.ok(
      utils.container.querySelector('[data-testid="site-skeleton-videos"], [data-testid="site-video-gallery-loading"]'),
      `${config.id}: skeleton`,
    );
    reset();

    setWebsiteSectionFlagsForTests({ videos: 'error' });
    utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { socialVideos: THEME_VIDEOS[config.id] }),
      mode: 'desktop',
    }));
    assert.equal(
      utils.container.querySelector('[data-site-section="videos"]')?.getAttribute('data-section-state'),
      'error',
      `${config.id}: error`,
    );
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), `${config.id}: error panel`);
    reset();
  }
});

await test('broken / missing thumbnail shows fallback, card still usable', async () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    socialVideos: [
      makeVideo({
        id: 'no-thumb',
        title: 'NO_THUMB_REEL',
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/NoThumbReel01/',
        thumbnailUrl: '',
        themeId: 'barber_mens_grooming',
      }),
    ],
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const item = utils.container.querySelector('[data-social-id="no-thumb"]');
  assert.ok(item, 'owner card missing');
  assert.equal(item.getAttribute('data-has-thumb'), 'false');
  assert.ok(item.querySelector('[data-testid="site-video-gallery-thumb-fallback"]'));
  // View action still present so the card is not dead.
  assert.ok(item.querySelector('[data-testid="site-social-view"]'));
  reset();
});

/* ------------------------------------------------------------------ */
/* 4. Lazy loading + play-on-demand embed                              */
/* ------------------------------------------------------------------ */

section('Lazy loading & play-on-demand');

await test('thumbnails render via SiteImage (lazy context=video); no iframe initially', () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    socialVideos: THEME_VIDEOS.barber_mens_grooming,
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const thumbs = utils.container.querySelectorAll('[data-testid="site-image"][data-context="video"], [data-testid="site-social-thumb"]');
  assert.ok(thumbs.length >= 1, 'lazy thumbs missing');
  assert.equal(utils.container.querySelectorAll('[data-testid="site-social-embed"]').length, 0);
  // No iframe in the gallery until play.
  assert.equal(utils.container.querySelectorAll('iframe').length, 0);
  reset();
});

await test('Play mounts embed on demand; close removes it', async () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    socialVideos: [
      makeVideo({
        id: 'play-yt',
        title: 'PLAY_ME',
        platform: 'youtube',
        url: ytUrl('jjjjjjjjjjj'),
        thumbnailUrl: THUMB_A,
        themeId: 'barber_mens_grooming',
      }),
    ],
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  assert.equal(utils.container.querySelectorAll('[data-testid="site-social-embed"]').length, 0);
  const playTarget = utils.container.querySelector('[data-social-id="play-yt"] [data-testid="site-social-play"]');
  assert.ok(playTarget, 'play button for owner video missing');
  await act(async () => {
    fireEvent.click(playTarget);
  });
  const embed = utils.getByTestId('site-social-embed');
  assert.ok(embed);
  const iframe = embed.querySelector('iframe');
  assert.ok(iframe, 'iframe missing after play');
  assert.ok(iframe.getAttribute('src')?.includes('/embed/jjjjjjjjjjj'));
  await act(async () => {
    fireEvent.click(utils.getByTestId('site-video-gallery-embed-close'));
  });
  assert.equal(utils.container.querySelectorAll('[data-testid="site-social-embed"]').length, 0);
  reset();
});

/* ------------------------------------------------------------------ */
/* 5. Responsive + Light/Dark + EN/HI                                  */
/* ------------------------------------------------------------------ */

section('Responsive, appearance, locale');

await test('desktop / tablet / mobile all render the gallery grid', () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    reset();
    const utils = render(React.createElement(Barber, {
      data: salonData('barber_mens_grooming', { socialVideos: THEME_VIDEOS.barber_mens_grooming }),
      mode,
    }));
    assert.ok(utils.getByTestId('site-video-gallery-grid'), `${mode}: grid missing`);
    // PHASE 15.3 — 2 owner + catalog fill → 10 cards (5 short + 5 long).
    assert.equal(utils.container.querySelectorAll('[data-testid="site-social-item"]').length, 10, `${mode}: cards`);
    reset();
  }
});

await test('light and dark appearance both paint the section', () => {
  for (const appearance of ['light', 'dark']) {
    reset({ appearance });
    const utils = render(React.createElement(Barber, {
      data: salonData('barber_mens_grooming', { socialVideos: THEME_VIDEOS.barber_mens_grooming }),
      mode: 'desktop',
    }));
    const feed = utils.getByTestId('site-social-feed');
    assert.equal(feed.getAttribute('data-appearance'), appearance);
    assert.ok(feed.getAttribute('style')?.includes('background'), `${appearance}: bg missing`);
    reset();
  }
});

await test('EN and HI chrome + section titles flip with locale', () => {
  for (const config of CASES) {
    reset({ locale: 'en' });
    const enChrome = videoGalleryChrome(config.id, 'en');
    assert.ok(enChrome.play && enChrome.emptyTitle && enChrome.thumbFallback);

    let utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { socialVideos: THEME_VIDEOS[config.id] }),
      mode: 'desktop',
    }));
    const S_en = siteText(config.id, 'en');
    if (S_en.videosTitle) {
      assert.ok(flat(utils.getByTestId('site-social-feed')).includes(S_en.videosTitle), `${config.id} EN title`);
    }
    cleanup();

    reset({ locale: 'hi' });
    const hiChrome = videoGalleryChrome(config.id, 'hi');
    assert.ok(hiChrome.play && hiChrome.emptyTitle);
    assert.notEqual(hiChrome.play, enChrome.play, `${config.id}: HI play should differ`);
    utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { socialVideos: THEME_VIDEOS[config.id] }),
      mode: 'desktop',
    }));
    const S_hi = siteText(config.id, 'hi');
    if (S_hi.videosTitle) {
      assert.ok(flat(utils.getByTestId('site-social-feed')).includes(S_hi.videosTitle), `${config.id} HI title`);
    }
    // Play button label is localised (icon-only button → localized aria-label).
    const play = utils.container.querySelector('[data-testid="site-social-play"]');
    if (play) {
      assert.ok(
        flat(play).includes(hiChrome.play)
        || play.getAttribute('aria-label') === hiChrome.play,
        `${config.id}: HI play label`,
      );
    }
    reset();
  }
});

await test('video gallery chrome is complete for every theme and locale', () => {
  for (const config of CASES) {
    for (const locale of ['en', 'hi']) {
      const chrome = videoGalleryChrome(config.id, locale);
      for (const key of ['play', 'view', 'openExternal', 'close', 'emptyTitle', 'emptyBody', 'errorTitle', 'errorBody', 'retry', 'thumbFallback']) {
        assert.ok(chrome[key], `${config.id} ${locale}: missing ${key}`);
      }
      for (const platform of ['instagram', 'youtube', 'facebook', 'tiktok']) {
        assert.ok(chrome.platforms[platform], `${config.id} ${locale}: platform ${platform}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 6. Structure & regression                                           */
/* ------------------------------------------------------------------ */

section('Structure & regression');

await test('videos keep canonical position (after gallery) and section contract', () => {
  reset();
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { socialVideos: THEME_VIDEOS.barber_mens_grooming }),
    mode: 'desktop',
  }));
  const videos = utils.container.querySelector('[data-site-section="videos"]');
  assert.equal(videos?.getAttribute('id'), 'section-social');
  const order = Array.from(utils.container.querySelectorAll('[data-site-section]')).map((el) => el.getAttribute('data-site-section'));
  assert.ok(order.indexOf('videos') > order.indexOf('gallery'), 'videos after gallery');
  assert.ok(order.indexOf('videos') < order.indexOf('about'), 'videos before about');
  reset();
});

await test('SocialVideo themeId field is additive — existing unscoped drafts still work', () => {
  const legacy = {
    id: 'legacy-1',
    title: 'Legacy reel',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/LegacyReel01/',
    thumbnailUrl: THUMB_A,
    // no themeId
  };
  for (const config of CASES) {
    const item = ownerVideoForTheme(legacy, config.id);
    assert.ok(item, `${config.id}: legacy video should render`);
    assert.equal(item.themeId, null);
  }
});

await test('no likes / weekly / admin / auto-fetch surfaces in the foundation UI', () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    socialVideos: [
      makeVideo({
        id: 'likes-check',
        title: 'PLAIN_REEL',
        likesCount: '9.9k',
        themeId: 'barber_mens_grooming',
        url: ytUrl('kkkkkkkkkkk'),
      }),
    ],
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const feed = flat(utils.getByTestId('site-social-feed'));
  // The legacy free-text `likesCount` field is never trusted or rendered —
  // Phase 15.8 counts are derived from real like rows, not this string.
  assert.equal(feed.includes('9.9k'), false, 'stale likesCount text must never render');
  const card = utils.container.querySelector('[data-social-id="likes-check"]');
  assert.equal(card.getAttribute('data-like-count'), '0', 'counts start from real data only');
  // Owner/admin management and the main dashboard remain out of this surface.
  assert.equal(feed.toLowerCase().includes('admin'), false);
  assert.equal(feed.toLowerCase().includes('dashboard'), false);
  reset();
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error && f.error.message ? f.error.message : f.error}`);
  process.exit(1);
}
process.exit(0);
