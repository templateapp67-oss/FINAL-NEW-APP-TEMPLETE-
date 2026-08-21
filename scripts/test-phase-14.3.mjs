/**
 * PHASE 14.3 — GALLERY VIEWER (advanced lightbox acceptance test, all 5 themes)
 *
 * Verifies the advanced viewer layered on top of the Phase 14.1 lightbox
 * (no duplicate viewer system):
 *   1. Lightbox — full-screen viewer, large image, next/previous, close,
 *      counter, service/category label.
 *   2. Mobile — swipe left/right, touch-friendly controls, safe-area spacing,
 *      no horizontal page scrolling (touch-action pan-y).
 *   3. Before/After — comparison slider inside the viewer with labels, and the
 *      drag interaction preserved (swipe does not hijack the slider).
 *   4. Media safety — existing gallery data only, broken image → fallback,
 *      loading → skeleton, only the active full-size image is mounted
 *      (adjacent preload only, lazy srcSet kept from Phase 10.12).
 *   5. Theme isolation — viewer loads only the active theme's media; a theme
 *      or data switch closes/resets the viewer and drops previous media.
 *   6. Accessibility — keyboard navigation, ESC, accessible labels, focus
 *      trap + focus restore, alt text.
 *   7. Coverage — desktop/tablet/mobile, EN/HI, light/dark.
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
const {
  galleryItemsForTheme,
  galleryFilterOptions,
  filterGalleryItems,
  galleryCategoryLabel,
} = await import('../src/lib/siteGallery.ts');

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

function reset({ locale = 'en', appearance = undefined } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
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

/** Viewer fixture: salon + work + work + before/after (4 items). */
const VIEWER_GALLERY = [
  { id: 'v1', url: 'https://images.unsplash.com/viewer-a1?w=1200', alt: 'Salon interior wide', category: 'Interior', caption: 'Inside the space' },
  { id: 'v2', url: 'https://images.unsplash.com/viewer-a2?w=1200', alt: 'Fade result', category: 'Barber', featured: true, caption: 'Fresh fade' },
  { id: 'v3', url: 'https://images.unsplash.com/viewer-a3?w=1200', alt: 'Beard line-up', category: 'Barber' },
  { id: 'v4', url: 'https://images.unsplash.com/viewer-a4?w=1200', alt: 'Colour result', category: 'Hair', beforeUrl: 'https://images.unsplash.com/viewer-a4-before?w=1200' },
];

const lightbox = (utils) => utils.container.querySelector('[data-testid="site-gallery-lightbox"]');
const counter = (utils) => flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]'));
const stage = (utils) => utils.container.querySelector('[data-testid="site-gallery-lightbox-stage"]');

async function openTile(utils, id) {
  const tile = utils.container.querySelector(`[data-testid="site-gallery-tile-owner:${id}"]`);
  assert.ok(tile, `tile owner:${id} missing`);
  await act(async () => { fireEvent.click(tile); });
}

async function openFirstTile(utils) {
  const tile = utils.container.querySelector('[data-testid^="site-gallery-tile-"]');
  assert.ok(tile, 'no gallery tile to open');
  await act(async () => { fireEvent.click(tile); });
}

/** Dispatch a horizontal touch drag (swipe) on a node. */
function swipe(el, fromX, toX, fromY = 0, toY = 0) {
  const start = new dom.window.Event('touchstart', { bubbles: true, cancelable: true });
  start.touches = [{ clientX: fromX, clientY: fromY }];
  el.dispatchEvent(start);
  const end = new dom.window.Event('touchend', { bubbles: true, cancelable: true });
  end.changedTouches = [{ clientX: toX, clientY: toY }];
  el.dispatchEvent(end);
}

/* ------------------------------------------------------------------ */
/* 1. Lightbox                                                         */
/* ------------------------------------------------------------------ */

section('Viewer — opening, content, navigation');

await test('viewer is a modal dialog announcing the section and showing the active item alt text', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  const lb = lightbox(utils);
  assert.ok(lb, 'lightbox missing');
  assert.equal(lb.getAttribute('role'), 'dialog');
  assert.equal(lb.getAttribute('aria-modal'), 'true');
  assert.ok((lb.getAttribute('aria-label') || '').length > 0, 'dialog aria-label missing');
  const img = lb.querySelector('[data-testid="site-image"]');
  assert.equal(img?.getAttribute('alt'), 'Salon interior wide');
  assert.equal(counter(utils), '1 / 4');
  assert.ok(flat(lb).includes('Inside the space'), 'caption missing');
  reset();
});

for (const config of CASES) {
  await test(`${config.id}: viewer shows the active theme's category label`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
    await openTile(utils, 'v1');
    const expected = galleryCategoryLabel(config.id, 'salon', 'en');
    assert.ok(flat(lightbox(utils)).includes(expected), `${config.id}: expected category label "${expected}"`);
    reset();
  });
}

await test('next/previous buttons navigate with wrap-around and close button closes', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  assert.equal(counter(utils), '1 / 4');
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-next')); });
  }
  assert.equal(counter(utils), '1 / 4', 'next must wrap around');
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-prev')); });
  assert.equal(counter(utils), '4 / 4', 'prev navigates back');
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-close')); });
  assert.equal(Boolean(lightbox(utils)), false, 'viewer did not close');
  reset();
});

await test('keyboard: ArrowRight/ArrowLeft navigate and Escape closes', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  await act(async () => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
  assert.equal(counter(utils), '2 / 4');
  await act(async () => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); });
  assert.equal(counter(utils), '1 / 4');
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  assert.equal(Boolean(lightbox(utils)), false);
  reset();
});

await test('focus moves to the close button on open and returns to the trigger on close', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  const tile = utils.container.querySelector('[data-testid="site-gallery-tile-owner:v1"]');
  tile.focus();
  assert.equal(document.activeElement, tile);
  await act(async () => { fireEvent.click(tile); });
  assert.equal(document.activeElement, utils.getByTestId('site-gallery-lightbox-close'), 'close control not focused on open');
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-close')); });
  assert.equal(document.activeElement, tile, 'focus not restored to trigger');
  reset();
});

await test('focus is trapped within the viewer (Tab from last wraps to first)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  const lb = lightbox(utils);
  const focusables = Array.from(lb.querySelectorAll('button:not([disabled]), input:not([disabled])'));
  assert.ok(focusables.length >= 2, 'viewer must have multiple focusable controls');
  const last = focusables[focusables.length - 1];
  last.focus();
  assert.equal(document.activeElement, last);
  await act(async () => { fireEvent.keyDown(document, { key: 'Tab' }); });
  assert.equal(document.activeElement, utils.getByTestId('site-gallery-lightbox-close'), 'Tab from last did not wrap to first');
  reset();
});

/* ------------------------------------------------------------------ */
/* 2. Mobile — swipe + touch + safe-area                               */
/* ------------------------------------------------------------------ */

section('Viewer — mobile swipe, touch targets, safe-area');

for (const config of CASES) {
  await test(`${config.id}: swipe left/right navigates the viewer (mobile)`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
    await openTile(utils, 'v1');
    const st = stage(utils);
    assert.ok(st, 'stage missing');
    await act(async () => { swipe(st, 200, 80); });
    assert.equal(counter(utils), '2 / 4', `${config.id}: swipe left should go next`);
    await act(async () => { swipe(st, 80, 200); });
    assert.equal(counter(utils), '1 / 4', `${config.id}: swipe right should go back`);
    reset();
  });
}

await test('swipe wraps around (four left-swipes return to the first image)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  const st = stage(utils);
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { swipe(st, 200, 80); });
  }
  assert.equal(counter(utils), '1 / 4', 'swipe must wrap around');
  reset();
});

await test('vertical swipe is ignored (no navigation)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  const st = stage(utils);
  await act(async () => { swipe(st, 200, 200, 100, 220); });
  assert.equal(counter(utils), '1 / 4', 'vertical drag must not navigate');
  reset();
});

await test('small horizontal drag below the threshold is ignored', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  const st = stage(utils);
  await act(async () => { swipe(st, 200, 178); });
  assert.equal(counter(utils), '1 / 4', 'sub-threshold drag must not navigate');
  reset();
});

await test('swipe respects the active category filter', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY });
  const items = galleryItemsForTheme('barber_mens_grooming', data, 'en');
  const options = galleryFilterOptions('barber_mens_grooming', items);
  const categoryOptions = options.filter((o) => o.kind === 'category');
  const workOption = categoryOptions.reduce((best, o) => {
    const c = filterGalleryItems(items, o.id, options).length;
    const bestCount = best ? filterGalleryItems(items, best.id, options).length : 0;
    return c > bestCount ? o : best;
  }, null);
  assert.ok(workOption, 'no category option to filter');
  const workCount = filterGalleryItems(items, workOption.id, options).length;
  assert.ok(workCount >= 2, `swipe-filter test needs a category with >=2 items, got ${workCount}`);
  const utils = render(React.createElement(Barber, { data, mode: 'mobile' }));
  await act(async () => { fireEvent.click(utils.getByTestId(`site-gallery-filter-${workOption.id}`)); });
  await openFirstTile(utils);
  assert.ok(counter(utils).startsWith(`1 / ${workCount}`), `filtered viewer should see ${workCount} item(s), got ${counter(utils)}`);
  await act(async () => { swipe(stage(utils), 200, 80); });
  assert.equal(counter(utils), `2 / ${workCount}`, 'swipe must stay within the filtered set');
  reset();
});

await test('swipe starting on the before/after slider is ignored (slider keeps its drag)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v4');
  assert.equal(counter(utils), '4 / 4');
  const slider = utils.container.querySelector('[data-testid="site-gallery-before-after"]');
  assert.ok(slider, 'before/after slider missing in viewer');
  await act(async () => { swipe(slider, 200, 60); });
  assert.equal(counter(utils), '4 / 4', 'swipe on the slider must not navigate');
  reset();
});

await test('viewer controls are touch-friendly (44px site-touch targets)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  for (const id of ['site-gallery-lightbox-close', 'site-gallery-lightbox-prev', 'site-gallery-lightbox-next']) {
    assert.ok(utils.getByTestId(id).className.includes('site-touch'), `${id} missing touch target class`);
  }
  reset();
});

await test('stage uses touch-action pan-y (no horizontal page scrolling)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  assert.ok((stage(utils)?.getAttribute('style') || '').includes('pan-y'), 'touch-action pan-y missing');
  reset();
});

await test('viewer applies safe-area insets (notch / home indicator)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  const lb = lightbox(utils);
  assert.ok(lb.className.includes('site-gallery-lightbox-safe'), 'safe-area class missing on viewer');
  reset();
});

await test('page scroll is locked while the viewer is open and restored on close', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  assert.equal(document.body.style.overflow, 'hidden', 'scroll not locked');
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-close')); });
  assert.equal(document.body.style.overflow, '', 'scroll not restored');
  reset();
});

/* ------------------------------------------------------------------ */
/* 3. Before/After inside the viewer                                   */
/* ------------------------------------------------------------------ */

section('Viewer — before/after comparison');

await test('before/after pair opens the comparison slider with Before/After labels', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v4');
  assert.ok(utils.container.querySelector('[data-testid="site-gallery-before-after"]'), 'slider missing in viewer');
  assert.equal(flat(utils.getByTestId('site-gallery-before-label')), 'Before');
  assert.equal(flat(utils.getByTestId('site-gallery-after-label')), 'After');
  reset();
});

await test('slider drag interaction is preserved inside the viewer (clip-path follows)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v4');
  const range = utils.getByTestId('site-gallery-before-after-range');
  await act(async () => { fireEvent.change(range, { target: { value: '30' } }); });
  const clip = utils.container.querySelector('[data-testid="site-gallery-before-after"] [style*="clip-path"]');
  assert.ok(clip && clip.getAttribute('style').includes('inset(0 70% 0 0)'), `clip-path should follow the slider, got ${clip?.getAttribute('style')}`);
  reset();
});

/* ------------------------------------------------------------------ */
/* 4. Media safety & performance                                       */
/* ------------------------------------------------------------------ */

section('Viewer — media safety & performance');

await test('full-size image shows a skeleton while loading, then clears on load', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  const lb = lightbox(utils);
  const wrapper = lb.querySelector('[data-testid="site-image-wrapper"]');
  assert.equal(wrapper?.getAttribute('data-loaded'), 'false', 'full-size image should start unloaded');
  assert.ok(lb.querySelector('[data-testid="site-image-skeleton"]'), 'skeleton missing while loading');
  const img = lb.querySelector('[data-testid="site-image"]');
  await act(async () => { fireEvent.load(img); });
  assert.equal(wrapper?.getAttribute('data-loaded'), 'true', 'loaded flag not set');
  assert.equal(Boolean(lb.querySelector('[data-testid="site-image-skeleton"]')), false, 'skeleton not cleared after load');
  reset();
});

await test('only the active full-size image is mounted — never the whole gallery', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  const lb = lightbox(utils);
  const srcs = Array.from(lb.querySelectorAll('img')).map((img) => img.getAttribute('src') || '');
  assert.equal(srcs.length, 1, `viewer should mount exactly one image, got ${srcs.length}`);
  assert.ok(srcs[0].includes('viewer-a1'), 'wrong image mounted');
  assert.ok(!srcs.some((s) => s.includes('viewer-a2') || s.includes('viewer-a3') || s.includes('viewer-a4')), 'other full-size images must not be mounted');
  reset();
});

await test('broken full-size image shows the error fallback inside the viewer', async () => {
  reset();
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { gallery: [{ id: 'broken', url: 'https://owner.example/missing.jpg', alt: 'Missing photo', category: 'General' }] }),
    mode: 'desktop',
  }));
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  const lb = lightbox(utils);
  assert.ok(lb, 'viewer did not open');
  await act(async () => { fireEvent.error(lb.querySelector('img'), {}); });
  assert.ok(lb.querySelector('[data-testid="site-image-error"]'), 'error fallback missing in viewer');
  reset();
});

await test('viewer keeps lazy-loading and responsive srcSet (Phase 10.12)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  const img = lightbox(utils).querySelector('[data-testid="site-image"]');
  assert.equal(img?.getAttribute('loading'), 'lazy');
  assert.ok((img?.getAttribute('srcset') || '').includes('w='), 'responsive srcSet missing');
  reset();
});

/* ------------------------------------------------------------------ */
/* 5. Theme isolation & viewer reset                                   */
/* ------------------------------------------------------------------ */

section('Viewer — theme isolation & state reset');

await test('viewer loads only the active theme media (no foreign srcs)', async () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    gallery: [
      { id: 'bb1', url: 'https://owner.example/barber-cut.jpg', alt: 'Barber cut', category: 'Barber' },
      { id: 'nn1', url: 'https://owner.example/nail-art.jpg', alt: 'Nail art', category: 'General', themeId: 'nail_lash_studio' },
    ],
    services: [
      { id: 's1', name: 'Nail gel', category: 'Nail Art & Gel', price: 500, duration: 30, themeId: 'nail_lash_studio', status: 'active', media: { imageUrl: 'https://svc.example/nail-gel.jpg' } },
    ],
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  const srcs = Array.from(lightbox(utils).querySelectorAll('img')).map((img) => img.getAttribute('src') || '').join(' ');
  assert.ok(!srcs.includes('nail-art'), 'foreign owner photo leaked into viewer');
  assert.ok(!srcs.includes('nail-gel'), 'foreign service photo leaked into viewer');
  assert.ok(srcs.includes('barber-cut'), 'own theme photo missing from viewer');
  reset();
});

await test('data change closes and resets the viewer (no stale viewer state)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  assert.ok(lightbox(utils), 'viewer should be open');
  const newData = salonData('barber_mens_grooming', { gallery: [{ id: 'n1', url: 'https://owner.example/new.jpg', alt: 'New', category: 'General' }] });
  await act(async () => { utils.rerender(React.createElement(Barber, { data: newData, mode: 'desktop' })); });
  assert.equal(Boolean(lightbox(utils)), false, 'viewer must reset on data change');
  reset();
});

await test('switching theme unmounts the viewer and removes previous theme media', async () => {
  reset();
  const first = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: [{ id: 'b1', url: 'https://owner.example/beard-work.jpg', alt: 'Beard work', category: 'Barber' }] }), mode: 'desktop' }));
  await act(async () => { fireEvent.click(first.getByTestId('site-gallery-featured')); });
  assert.ok(lightbox(first), 'barber viewer should be open');
  cleanup();
  const second = render(React.createElement(NailLash, { data: salonData('nail_lash_studio', { gallery: [{ id: 'n1', url: 'https://owner.example/nail-set.jpg', alt: 'Nail set', category: 'Beauty' }] }), mode: 'desktop' }));
  assert.equal(Boolean(lightbox(second)), false, 'viewer must not carry over to the new theme');
  const gallerySection = second.container.querySelector('[data-site-section="gallery"]');
  const srcs = Array.from(gallerySection.querySelectorAll('img')).map((el) => el.getAttribute('src') || '').join(' ');
  assert.ok(!srcs.includes('beard-work'), 'stale barber image leaked after theme switch');
  assert.ok(srcs.includes('nail-set'), 'nail gallery rendered after switch');
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 6. Responsive / locale / appearance / accessibility                 */
/* ------------------------------------------------------------------ */

section('Viewer — responsive, locale, appearance, accessibility');

await test('viewer opens, navigates and closes at desktop/tablet/mobile for every theme', async () => {
  for (const config of CASES) {
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: VIEWER_GALLERY }), mode }));
      await openTile(utils, 'v1');
      assert.ok(lightbox(utils), `${config.id} ${mode}: viewer missing`);
      assert.equal(counter(utils), '1 / 4', `${config.id} ${mode}: wrong counter`);
      await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-next')); });
      assert.equal(counter(utils), '2 / 4');
      await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-close')); });
      assert.equal(Boolean(lightbox(utils)), false);
      reset();
    }
  }
});

await test('swipe hint is localised (EN + HI)', async () => {
  reset({ locale: 'en' });
  let utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  assert.equal(flat(utils.getByTestId('site-gallery-swipe-hint')), 'Swipe left or right to browse');
  reset({ locale: 'hi' });
  utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'mobile' }));
  await openTile(utils, 'v1');
  assert.ok(flat(utils.getByTestId('site-gallery-swipe-hint')).includes('स्वाइप'), 'Hindi swipe hint missing');
  reset();
});

await test('viewer chrome stays theme-coloured in dark mode (five distinct identities)', async () => {
  const bgs = {};
  for (const config of CASES) {
    reset({ appearance: 'dark' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
    await openTile(utils, 'v1');
    const bg = (lightbox(utils)?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim();
    assert.ok(bg, `${config.id}: dark viewer background missing`);
    bgs[config.id] = bg;
    reset();
  }
  assert.equal(new Set(Object.values(bgs)).size, 5, 'viewer chrome must differ per theme');
});

await test('viewer controls expose accessible labels and the stage is announced', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: VIEWER_GALLERY }), mode: 'desktop' }));
  await openTile(utils, 'v1');
  assert.ok((utils.getByTestId('site-gallery-lightbox-close').getAttribute('aria-label') || '').length > 0, 'close aria-label missing');
  assert.ok((utils.getByTestId('site-gallery-lightbox-prev').getAttribute('aria-label') || '').length > 0, 'prev aria-label missing');
  assert.ok((utils.getByTestId('site-gallery-lightbox-next').getAttribute('aria-label') || '').length > 0, 'next aria-label missing');
  assert.equal(stage(utils)?.getAttribute('aria-label'), 'Swipe left or right to browse');
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
