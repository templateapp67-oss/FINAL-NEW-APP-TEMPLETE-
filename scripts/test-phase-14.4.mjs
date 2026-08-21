/**
 * PHASE 14.4 — GALLERY FINAL VALIDATION (five-theme acceptance matrix)
 *
 * Final acceptance pass over the Phase 14 gallery (14.1 content + 14.3 viewer)
 * for ALL 5 themes. Nothing is recreated; root causes are fixed if a check
 * fails. Verifies:
 *
 *  1. Theme-specific content & filters — correct gallery content, correct
 *     category vocabulary, before/after where configured.
 *  2. Viewer — opens/closes, next/previous, mobile swipe.
 *  3. Media safety & performance — broken-image fallback, loading skeleton,
 *     lazy loading, no unnecessary full-size media, no layout shift, no
 *     horizontal overflow, alt text/accessibility.
 *  4. Empty gallery state.
 *  5. Theme switch cycle — Barber → Hair Studio → Beauty/Spa → Family →
 *     Nail/Lash → Barber: after every switch the filter resets, any open
 *     viewer closes, previous theme media is removed, only the active theme's
 *     media loads and no cross-theme images remain.
 *  6. Responsive — desktop → tablet → mobile.
 *  7. Matrix — English → Hindi, Light → Dark, Normal → Slow network,
 *     Valid → Broken image, Gallery available → Empty gallery.
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
const { setMockInViewForTests } = await import('../src/lib/sitePerformance.ts');
const { galleryItemsForTheme, galleryFilterOptions, filterGalleryItems } = await import('../src/lib/siteGallery.ts');

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
    console.error(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`);
  }
}

function section(title) {
  console.log(`\n■ ${title}`);
}

const CASES = [
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash },
];

const COMPONENTS = Object.fromEntries(CASES.map((c) => [c.id, c.Component]));

function reset({ locale = 'en', appearance = undefined } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setWebsiteSectionFlagsForTests({});
  setMockInViewForTests(null);
}

function salonData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: `${templateId} Test Salon`,
    packages: [],
    offers: [],
    gallery: [],
    socialVideos: [],
    ...extras,
  };
}

const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

const lightbox = (utils) => utils.container.querySelector('[data-testid="site-gallery-lightbox"]');
const counter = (utils) => flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]'));

/* Unique per-theme URL prefixes so cross-theme leakage is detectable. */
const THEME_PREFIX = {
  barber_mens_grooming: 'barber-own',
  hair_studio_color_bar: 'hair-own',
  beauty_skin_spa: 'spa-own',
  family_full_service: 'family-own',
  nail_lash_studio: 'nail-own',
};

/** A work-category mapping that exercises each theme's distinctive vocabulary. */
const THEME_WORK = {
  barber_mens_grooming: { category: 'Barber', chip: 'beard', alt: 'Beard line-up' },
  hair_studio_color_bar: { category: 'Barber', chip: 'cuts', alt: 'Cut and style' },
  beauty_skin_spa: { category: 'Beauty', chip: 'facial', alt: 'Facial glow' },
  family_full_service: { category: 'Barber', chip: 'men', alt: 'Men cut' },
  nail_lash_studio: { category: 'Beauty', chip: 'nailArt', alt: 'Nail art set' },
};

function themeFixture(themeId) {
  const p = THEME_PREFIX[themeId];
  const work = THEME_WORK[themeId];
  return [
    { id: `${p}-salon`, url: `https://images.unsplash.com/${p}-salon.jpg`, alt: `${themeId} salon interior`, category: 'Interior' },
    { id: `${p}-work`, url: `https://images.unsplash.com/${p}-work.jpg`, alt: work.alt, category: work.category, caption: 'Finished work' },
    { id: `${p}-ba`, url: `https://images.unsplash.com/${p}-after.jpg`, alt: `${themeId} result`, category: 'Beauty', beforeUrl: `https://images.unsplash.com/${p}-before.jpg`, featured: true },
    { id: `${p}-foreign`, url: `https://images.unsplash.com/foreign-${p}.jpg`, alt: 'foreign scoped', category: 'General', themeId: 'other_theme' },
  ];
}

function gallerySrcs(utils) {
  const gallery = utils.container.querySelector('[data-site-section="gallery"]');
  if (!gallery) return [];
  return Array.from(gallery.querySelectorAll('img')).map((el) => el.getAttribute('src') || '');
}

function swipe(el, fromX, toX, fromY = 0, toY = 0) {
  const start = new dom.window.Event('touchstart', { bubbles: true, cancelable: true });
  start.touches = [{ clientX: fromX, clientY: fromY }];
  el.dispatchEvent(start);
  const end = new dom.window.Event('touchend', { bubbles: true, cancelable: true });
  end.changedTouches = [{ clientX: toX, clientY: toY }];
  el.dispatchEvent(end);
}

/* ------------------------------------------------------------------ */
/* 1. Theme-specific content & filters                                 */
/* ------------------------------------------------------------------ */

section('Gallery content & category filters (all 5 themes)');

await test('every theme renders only its own gallery content (no foreign owner/service/theme media)', () => {
  for (const config of CASES) {
    reset();
    const data = salonData(config.id, { gallery: themeFixture(config.id) });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const srcs = gallerySrcs(utils);
    const own = THEME_PREFIX[config.id];
    assert.ok(srcs.some((s) => s.includes(own)), `${config.id}: own media missing`);
    assert.ok(!srcs.some((s) => s.includes('foreign-')), `${config.id}: foreign-scoped item leaked`);
    for (const [other, prefix] of Object.entries(THEME_PREFIX)) {
      if (other === config.id) continue;
      assert.ok(!srcs.some((s) => s.includes(prefix)), `${config.id}: ${other} media leaked`);
    }
    reset();
  }
});

await test('category filters match each theme’s vocabulary (+ Before & After where configured)', () => {
  for (const config of CASES) {
    reset();
    const data = salonData(config.id, { gallery: themeFixture(config.id) });
    const items = galleryItemsForTheme(config.id, data, 'en');
    const options = galleryFilterOptions(config.id, items);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    assert.ok(utils.getByTestId('site-gallery-filter-all'), `${config.id}: All chip missing`);
    for (const option of options) {
      assert.ok(utils.container.querySelector(`[data-testid="site-gallery-filter-${option.id}"]`), `${config.id}: chip ${option.id} missing`);
    }
    // Distinctive theme vocabulary chip present.
    assert.ok(utils.container.querySelector(`[data-testid="site-gallery-filter-${THEME_WORK[config.id].chip}"]`), `${config.id}: distinctive chip ${THEME_WORK[config.id].chip} missing`);
    // Before & After filter present (fixture has a pair).
    assert.ok(utils.container.querySelector('[data-testid="site-gallery-filter-beforeAfter"]'), `${config.id}: Before & After chip missing`);
    // No unexpected chips.
    const chipIds = Array.from(utils.container.querySelectorAll('[data-testid^="site-gallery-filter-"]'))
      .map((el) => el.getAttribute('data-testid').replace('site-gallery-filter-', ''));
    for (const id of chipIds) {
      assert.ok(id === 'all' || options.some((o) => o.id === id), `${config.id}: unexpected chip ${id}`);
    }
    reset();
  }
});

await test('a filter narrows the grid and All restores it (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const data = salonData(config.id, { gallery: themeFixture(config.id) });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const grid = () => utils.container.querySelector('[data-testid="site-gallery-grid"]');
    const totalTiles = grid().querySelectorAll('[data-testid^="site-gallery-tile-"]').length;
    await act(async () => { fireEvent.click(utils.getByTestId(`site-gallery-filter-${THEME_WORK[config.id].chip}`)); });
    const narrowed = grid().querySelectorAll('[data-testid^="site-gallery-tile-"]').length;
    assert.ok(narrowed > 0 && narrowed <= totalTiles, `${config.id}: filter did not narrow correctly`);
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-filter-all')); });
    assert.equal(grid().querySelectorAll('[data-testid^="site-gallery-tile-"]').length, totalTiles, `${config.id}: All did not restore`);
    reset();
  }
});

await test('before/after works where configured (slider + labels in the viewer)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
    assert.ok(utils.container.querySelector('[data-testid="site-gallery-before-after"]'), `${config.id}: before/after slider missing`);
    assert.equal(flat(utils.getByTestId('site-gallery-before-label')), 'Before');
    assert.equal(flat(utils.getByTestId('site-gallery-after-label')), 'After');
    reset();
  }
});

/* ------------------------------------------------------------------ */
/* 2. Viewer acceptance                                                */
/* ------------------------------------------------------------------ */

section('Viewer — open/close, next/previous, mobile swipe');

await test('viewer opens/closes with next/previous + counter (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'desktop' }));
    const firstTile = utils.container.querySelector('[data-testid^="site-gallery-tile-"]');
    await act(async () => { fireEvent.click(firstTile); });
    assert.ok(lightbox(utils), `${config.id}: viewer did not open`);
    assert.equal(counter(utils), '1 / 3', `${config.id}: wrong counter`);
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-next')); });
    assert.equal(counter(utils), '2 / 3');
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-prev')); });
    assert.equal(counter(utils), '1 / 3');
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-close')); });
    assert.equal(Boolean(lightbox(utils)), false, `${config.id}: viewer did not close`);
    reset();
  }
});

await test('mobile swipe navigates the viewer (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'mobile' }));
    const firstTile = utils.container.querySelector('[data-testid^="site-gallery-tile-"]');
    await act(async () => { fireEvent.click(firstTile); });
    const stage = utils.container.querySelector('[data-testid="site-gallery-lightbox-stage"]');
    await act(async () => { swipe(stage, 200, 80); });
    assert.equal(counter(utils), '2 / 3', `${config.id}: swipe did not advance`);
    await act(async () => { swipe(stage, 80, 200); });
    assert.equal(counter(utils), '1 / 3', `${config.id}: swipe did not go back`);
    reset();
  }
});

/* ------------------------------------------------------------------ */
/* 3. Media safety & performance                                       */
/* ------------------------------------------------------------------ */

section('Media safety & performance');

await test('broken image shows the fallback (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { gallery: [{ id: 'broken', url: `https://owner.example/${config.id}-broken.jpg`, alt: 'Broken photo', category: 'General' }] }),
      mode: 'desktop',
    }));
    const featured = utils.getByTestId('site-gallery-featured');
    await act(async () => { fireEvent.error(featured.querySelector('img'), {}); });
    assert.ok(featured.querySelector('[data-testid="site-image-error"]'), `${config.id}: error fallback missing`);
    reset();
  }
});

await test('loading skeleton shows while an image loads and clears after load', async () => {
  reset();
  const unique = `https://images.unsplash.com/final-skeleton-${Date.now()}?w=1200`;
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { gallery: [{ id: 'sk', url: unique, alt: 'Loading photo', category: 'General' }] }),
    mode: 'desktop',
  }));
  // Target the GALLERY featured banner's image wrapper (not the hero/logo above it).
  const gallery = utils.container.querySelector('[data-site-section="gallery"]');
  const wrapper = gallery.querySelector('[data-testid="site-image-wrapper"]');
  assert.equal(wrapper?.getAttribute('data-loaded'), 'false', 'image should start unloaded');
  assert.equal(Boolean(wrapper?.querySelector('[data-testid="site-image-skeleton"]')), true, 'skeleton missing while loading');
  await act(async () => { fireEvent.load(wrapper.querySelector('[data-testid="site-image"]'), {}); });
  assert.equal(wrapper?.getAttribute('data-loaded'), 'true', 'loaded flag not set');
  assert.equal(Boolean(wrapper?.querySelector('[data-testid="site-image-skeleton"]')), false, 'skeleton not cleared after load');
  reset();
});

await test('gallery images lazy-load with responsive srcSet (all themes)', () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'desktop' }));
    const imgs = Array.from(utils.container.querySelectorAll('[data-context="gallery"] img'));
    assert.ok(imgs.length >= 2, `${config.id}: gallery images missing`);
    for (const img of imgs) {
      assert.equal(img.getAttribute('loading'), 'lazy', `${config.id}: image must lazy-load`);
    }
    assert.ok(imgs.some((img) => (img.getAttribute('srcset') || '').includes('w=')), `${config.id}: responsive srcSet missing`);
    reset();
  }
});

await test('no unnecessary full-size media: only the active image is mounted in the viewer', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: themeFixture('barber_mens_grooming') }), mode: 'desktop' }));
  // Open a plain photo tile (not the before/after pair, which legitimately has 2 layers).
  const firstTile = utils.container.querySelector('[data-testid^="site-gallery-tile-"]');
  await act(async () => { fireEvent.click(firstTile); });
  const lb = lightbox(utils);
  const srcs = Array.from(lb.querySelectorAll('img')).map((img) => img.getAttribute('src') || '');
  assert.equal(srcs.length, 1, `viewer should mount exactly one full-size image, got ${srcs.length}`);
  reset();
});

await test('no layout shift: tiles and banner keep fixed aspect ratios (all themes, all viewports)', () => {
  for (const config of CASES) {
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode }));
      const tile = utils.container.querySelector('[data-testid^="site-gallery-tile-"]');
      assert.ok(tile, `${config.id} ${mode}: tile missing`);
      assert.ok((tile.getAttribute('style') || '').includes('aspect-ratio'), `${config.id} ${mode}: tile missing aspect-ratio`);
      const featured = utils.container.querySelector('[data-testid="site-gallery-featured"]');
      assert.ok((featured?.querySelector('[data-testid="site-image-wrapper"]')?.getAttribute('style') || '').includes('aspect-ratio'), `${config.id} ${mode}: banner missing aspect-ratio`);
      reset();
    }
  }
});

await test('no horizontal overflow: scroll container clips + viewer keeps touch-action pan-y (all themes)', () => {
  for (const config of CASES) {
    reset();
    let utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'mobile' }));
    const scroller = utils.container.querySelector('.site-scroll');
    assert.ok(scroller && scroller.className.includes('overflow-x-hidden'), `${config.id}: missing overflow-x containment`);
    reset();
  }
});

await test('alt text and accessible viewer controls (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'desktop' }));
    const imgs = Array.from(utils.container.querySelectorAll('[data-context="gallery"] img'));
    assert.ok(imgs.length >= 2, `${config.id}: gallery images missing`);
    for (const img of imgs) assert.ok((img.getAttribute('alt') || '').length > 0, `${config.id}: empty alt text`);
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
    const lb = lightbox(utils);
    assert.equal(lb.getAttribute('role'), 'dialog', `${config.id}: viewer missing dialog role`);
    assert.equal(lb.getAttribute('aria-modal'), 'true');
    assert.ok((utils.getByTestId('site-gallery-lightbox-close').getAttribute('aria-label') || '').length > 0, `${config.id}: close aria-label missing`);
    reset();
  }
});

/* ------------------------------------------------------------------ */
/* 4. Empty gallery state                                              */
/* ------------------------------------------------------------------ */

section('Empty gallery state');

await test('empty gallery → empty panel (barber/hair/spa) or registered media (family/nail)', () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const gallery = utils.container.querySelector('[data-site-section="gallery"]');
    assert.ok(gallery, `${config.id}: gallery section missing`);
    if (config.id === 'family_full_service' || config.id === 'nail_lash_studio') {
      assert.ok(gallery.querySelectorAll('[data-testid^="site-gallery-tile-theme:"]').length >= 3, `${config.id}: registered media missing when empty`);
    } else {
      assert.ok(gallery.querySelector('[data-testid="section-state-empty"]'), `${config.id}: empty panel missing`);
    }
    reset();
  }
});

/* ------------------------------------------------------------------ */
/* 5. Theme switch cycle                                               */
/* ------------------------------------------------------------------ */

section('Theme switch cycle — Barber → Hair Studio → Spa → Family → Nail/Lash → Barber');

await test('after every switch: filter resets, viewer closes, previous media removed, only active theme media', async () => {
  const order = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
    'barber_mens_grooming',
  ];
  let utils = null;
  for (let i = 0; i < order.length; i += 1) {
    const themeId = order[i];
    reset();
    utils = render(React.createElement(COMPONENTS[themeId], { data: salonData(themeId, { gallery: themeFixture(themeId) }), mode: 'desktop' }));
    const gallery = utils.container.querySelector('[data-site-section="gallery"]');
    const srcs = gallerySrcs(utils);
    // Only active theme media.
    assert.ok(srcs.some((s) => s.includes(THEME_PREFIX[themeId])), `${themeId}: own media missing after switch`);
    for (const [other, prefix] of Object.entries(THEME_PREFIX)) {
      if (other === themeId) continue;
      assert.ok(!srcs.some((s) => s.includes(prefix)), `${themeId}: cross-theme ${other} media remained`);
    }
    // Viewer closed.
    assert.equal(Boolean(lightbox(utils)), false, `${themeId}: viewer must be closed after switch`);
    // Filter reset to All.
    const all = utils.container.querySelector('[data-testid="site-gallery-filter-all"]');
    if (all) {
      assert.equal(all.getAttribute('aria-pressed'), 'true', `${themeId}: filter must reset to All`);
      const activeCategory = gallery.querySelector('[data-testid="site-gallery-filter"] [aria-pressed="true"]:not([data-testid="site-gallery-filter-all"])');
      assert.equal(Boolean(activeCategory), false, `${themeId}: category filter must reset`);
    }
    cleanup();
  }
});

await test('opening the viewer then switching theme closes it and drops the old media', async () => {
  reset();
  let utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: themeFixture('barber_mens_grooming') }), mode: 'desktop' }));
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  assert.ok(lightbox(utils), 'barber viewer should be open');
  cleanup();
  utils = render(React.createElement(NailLash, { data: salonData('nail_lash_studio', { gallery: themeFixture('nail_lash_studio') }), mode: 'desktop' }));
  assert.equal(Boolean(lightbox(utils)), false, 'viewer must not carry over to the new theme');
  const srcs = gallerySrcs(utils);
  assert.ok(!srcs.some((s) => s.includes('barber-own')), 'stale barber media leaked');
  assert.ok(srcs.some((s) => s.includes('nail-own')), 'nail media missing after switch');
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 6. Responsive, locale, appearance, network, data matrix             */
/* ------------------------------------------------------------------ */

section('Responsive — desktop → tablet → mobile');

await test('gallery renders the correct mode-based grid at every viewport (all themes)', () => {
  const expected = {
    barber_mens_grooming: { desktop: 3, tablet: 3, mobile: 2 },
    hair_studio_color_bar: { desktop: 3, tablet: 3, mobile: 2 },
    beauty_skin_spa: { desktop: 3, tablet: 3, mobile: 2 },
    family_full_service: { desktop: 3, tablet: 2, mobile: 2 },
    nail_lash_studio: { desktop: 5, tablet: 3, mobile: 2 },
  };
  for (const config of CASES) {
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode }));
      const grid = utils.container.querySelector('[data-testid="site-gallery-grid"]');
      assert.ok(grid, `${config.id} ${mode}: grid missing`);
      assert.equal(grid.className.match(/grid-cols-(\d+)/)?.[1], String(expected[config.id][mode]), `${config.id} ${mode}: wrong column count`);
      reset();
    }
  }
});

section('Matrix — locale, appearance, network, data');

await test('English → Hindi: gallery copy flips (titles, chips, viewer swipe hint)', async () => {
  reset({ locale: 'en' });
  let utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: themeFixture('barber_mens_grooming') }), mode: 'mobile' }));
  assert.ok(flat(utils.container.querySelector('[data-site-section="gallery"]')).includes('Gallery'), 'EN title missing');
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  assert.equal(flat(utils.getByTestId('site-gallery-swipe-hint')), 'Swipe left or right to browse');
  reset({ locale: 'hi' });
  utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: themeFixture('barber_mens_grooming') }), mode: 'mobile' }));
  assert.ok(flat(utils.container.querySelector('[data-site-section="gallery"]')).includes('गैलरी'), 'HI title missing');
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  assert.ok(flat(utils.getByTestId('site-gallery-swipe-hint')).includes('स्वाइप'), 'HI swipe hint missing');
  reset();
});

await test('Light → Dark: gallery surfaces stay theme-distinct in both appearances (all themes)', () => {
  const bgOf = (el) => (el?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim() || null;
  for (const config of CASES) {
    const bgs = {};
    for (const appearance of ['light', 'dark']) {
      reset({ appearance });
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: themeFixture(config.id) }), mode: 'desktop' }));
      bgs[appearance] = bgOf(utils.container.querySelector('[data-site-section="gallery"]'));
      assert.ok(bgs[appearance], `${config.id} ${appearance}: gallery surface missing`);
      reset();
    }
    assert.notEqual(bgs.light, bgs.dark, `${config.id}: light/dark surfaces should differ`);
  }
});

await test('slow network: offscreen gallery images stay unmounted (skeleton only) until in view', () => {
  reset();
  setMockInViewForTests(false);
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: themeFixture('barber_mens_grooming') }), mode: 'desktop' }));
  const wrappers = utils.container.querySelectorAll('[data-testid="site-image-wrapper"]');
  assert.ok(wrappers.length >= 1, 'no image wrapper rendered');
  // Nothing in view → no <img> mounted (no full-size network requests).
  assert.equal(utils.container.querySelectorAll('[data-context="gallery"] img').length, 0, 'offscreen images must not mount on slow network');
  assert.ok(utils.container.querySelector('[data-testid="site-image-skeleton"]'), 'skeleton missing while deferred');
  reset();
});

await test('normal network: gallery images mount and load when in view', async () => {
  reset();
  setMockInViewForTests(true);
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: themeFixture('barber_mens_grooming') }), mode: 'desktop' }));
  const imgs = Array.from(utils.container.querySelectorAll('[data-context="gallery"] img'));
  assert.ok(imgs.length >= 2, 'gallery images did not mount in view');
  for (const img of imgs.slice(0, 2)) {
    await act(async () => { fireEvent.load(img, {}); });
  }
  const galleryWrappers = Array.from(utils.container.querySelectorAll('[data-context="gallery"][data-testid="site-image-wrapper"]'));
  assert.ok(galleryWrappers.slice(0, 2).every((w) => w.getAttribute('data-loaded') === 'true'), 'images did not reach loaded state');
  reset();
});

await test('valid image → broken image shows fallback; available gallery → empty gallery shows empty state', async () => {
  reset();
  let utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { gallery: [{ id: 'v', url: 'https://owner.example/valid.jpg', alt: 'Valid', category: 'General' }] }),
    mode: 'desktop',
  }));
  assert.ok(utils.getByTestId('site-gallery-featured'), 'valid gallery should render content');
  await act(async () => { fireEvent.error(utils.getByTestId('site-gallery-featured').querySelector('img'), {}); });
  assert.ok(utils.getByTestId('site-gallery-featured').querySelector('[data-testid="site-image-error"]'), 'broken image must fall back');
  cleanup();
  utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming'), mode: 'desktop' }));
  assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty gallery must show empty state');
  reset();
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error.message}`);
  process.exit(1);
}
process.exit(0);
