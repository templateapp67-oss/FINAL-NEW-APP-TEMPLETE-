/**
 * PHASE 12.7 — SERVICE IMAGES & VISUALS (five-theme acceptance)
 *
 * Verifies visual support on service cards + details for all five themes:
 *
 *   1. Visuals come ONLY from configured service media (image / icon / banner);
 *      no media → the theme's own category glyph (never invented, never another
 *      theme's artwork).
 *   2. Correct image for the correct service/theme (theme isolation).
 *   3. Existing performance system reused: `SiteImage` lazy loading, responsive
 *      srcSet, fixed aspect ratio, error fallback, alt text.
 *   4. Broken media → themed fallback (no broken image).
 *   5. No duplicate image loading (single element per URL + IMAGE_CACHE dedup).
 *   6. Theme switch Barber → Hair → Spa → Family → Nail: correct images load,
 *      previous theme images disappear.
 *   7. EN/HI alt text, light/dark, responsive modes.
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
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
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
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const SiteServiceDirectory = (await import('../src/components/SiteServiceDirectory.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { serviceVisuals, categoryIcon } = await import('../src/lib/siteServiceVisuals.ts');
const { IMAGE_CACHE, markImageLoaded, markImageError, setMockInViewForTests } = await import('../src/lib/sitePerformance.ts');

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
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber, cats: ['Haircuts', 'Beard & Shave'] },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio, cats: ['Styling & Cuts', 'Hair Color'] },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa, cats: ['Facial & Skincare', 'Spa & Body'] },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family, cats: ["Men's Services", "Women's Services"] },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash, cats: ['Nail Art & Gel', 'Lash & Brow'] },
];

/** One service per visual configuration (image / banner / icon / none). */
function visualServices(themeId, cats) {
  return [
    { id: 'svc-img', name: `${themeId} Image`, category: cats[0], description: 'Has a service image.', price: 500, duration: 30, themeId, status: 'active', media: { imageUrl: `https://example.com/${themeId}-image.jpg` } },
    { id: 'svc-banner', name: `${themeId} Gallery`, category: cats[1], description: 'Has image + banner gallery.', price: 700, duration: 45, themeId, status: 'active', media: { imageUrl: `https://example.com/${themeId}-banner-main.jpg`, bannerUrl: `https://example.com/${themeId}-gallery.jpg` } },
    { id: 'svc-icon', name: `${themeId} Icon`, category: cats[0], description: 'Has only an icon.', price: 300, duration: 20, themeId, status: 'active', media: { iconUrl: `https://example.com/${themeId}-icon.png` } },
    { id: 'svc-none', name: `${themeId} Plain`, category: cats[1], description: 'No configured media.', price: 200, duration: 15, themeId, status: 'active' },
    { id: `foreign-${themeId}`, name: 'Foreign Theme Service', category: 'Foreign', description: 'Must never appear.', price: 9999, duration: 90, themeId: 'some_other_theme', status: 'active', media: { imageUrl: 'https://example.com/foreign.jpg' } },
  ];
}

function salonData(templateId, services, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: `${templateId} Test Salon`,
    services,
    packages: [],
    team: [],
    gallery: [],
    socialVideos: [],
    ...extras,
  };
}

function reset({ locale = 'en', appearance = undefined } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setWebsiteSectionFlagsForTests({});
  setMockInViewForTests(null);
  IMAGE_CACHE.clear();
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function directoryOf(container) {
  const el = container.querySelector('[data-testid="site-services-directory"]');
  assert.ok(el, 'directory missing');
  return el;
}

/* ------------------------------------------------------------------ */
/* 1. Visual resolution — only configured media                        */
/* ------------------------------------------------------------------ */

section('Visual resolution');

await test('serviceVisuals prefers image → banner → icon and never invents a URL', () => {
  const base = { id: 'x', name: 'Test', category: 'Haircuts', description: '', price: 1, duration: 1, themeId: 'barber_mens_grooming', status: 'active' };
  assert.deepEqual(
    { url: serviceVisuals(base, 'en').url, kind: serviceVisuals(base, 'en').kind, iconUrl: serviceVisuals(base, 'en').iconUrl, galleryUrl: serviceVisuals(base, 'en').galleryUrl },
    { url: '', kind: 'none', iconUrl: null, galleryUrl: null },
  );
  const img = { ...base, media: { imageUrl: 'https://e.com/a.jpg' } };
  assert.equal(serviceVisuals(img, 'en').kind, 'image');
  assert.equal(serviceVisuals(img, 'en').url, 'https://e.com/a.jpg');
  // banner only → banner is the hero
  const banner = { ...base, media: { bannerUrl: 'https://e.com/b.jpg' } };
  assert.equal(serviceVisuals(banner, 'en').kind, 'banner');
  // icon only → icon is the hero
  const icon = { ...base, media: { iconUrl: 'https://e.com/i.png' } };
  assert.equal(serviceVisuals(icon, 'en').kind, 'icon');
  // image + banner + icon → gallery = banner, icon chip = icon
  const all = { ...base, media: { imageUrl: 'https://e.com/a.jpg', bannerUrl: 'https://e.com/b.jpg', iconUrl: 'https://e.com/i.png' } };
  const v = serviceVisuals(all, 'en');
  assert.equal(v.url, 'https://e.com/a.jpg');
  assert.equal(v.galleryUrl, 'https://e.com/b.jpg');
  assert.equal(v.iconUrl, 'https://e.com/i.png');
});

await test('categoryIcon is theme-scoped (no cross-theme glyph)', () => {
  // Every category belongs to exactly one theme; glyph components are distinct
  // function identities, so a barber glyph can never be a nail glyph.
  for (const c of ['Haircuts', 'Beard & Shave', 'Grooming & Treatments', 'Styling & Cuts', 'Hair Color', 'Treatments', 'Facial & Skincare', 'Spa & Body', 'Waxing & Threading', 'Makeup', "Men's Services", "Women's Services", 'Kids Special', 'Combos', 'Nail Art & Gel', 'Pedicure & Manicure', 'Lash & Brow']) {
    assert.ok(categoryIcon(c), `${c} has no glyph`);
  }
  // Cross-theme categories never share a glyph.
  assert.notEqual(categoryIcon('Haircuts'), categoryIcon('Nail Art & Gel'));
  assert.notEqual(categoryIcon('Haircuts'), categoryIcon('Facial & Skincare'));
  assert.notEqual(categoryIcon('Hair Color'), categoryIcon('Lash & Brow'));
  assert.notEqual(categoryIcon('Pedicure & Manicure'), categoryIcon('Spa & Body'));
});

/* ------------------------------------------------------------------ */
/* 2. Card visuals — image via SiteImage, glyph fallback, alt, lazy    */
/* ------------------------------------------------------------------ */

section('Card visuals (directory)');

for (const config of CASES) {
  await test(`${config.id}: configured media renders via the performance system`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const directory = directoryOf(utils.container);
    const images = Array.from(directory.querySelectorAll('[data-testid="site-image"]'));
    assert.ok(images.length >= 3, `expected image/banner/icon images, got ${images.length}`);
    for (const img of images) {
      assert.ok(img.getAttribute('src'), 'img missing src');
      assert.equal(img.getAttribute('loading'), 'lazy', 'service images must lazy-load');
      assert.ok((img.getAttribute('alt') || '').length > 0, 'service image missing alt text');
    }
    // No foreign-theme image URL.
    assert.ok(!directory.textContent.includes('foreign.jpg') && !flat(directory).includes('Foreign Theme Service'));
  });

  await test(`${config.id}: no-media service shows the themed category glyph`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const plainCard = utils.container.querySelector(`[data-testid="site-directory-card"][data-service-name="${config.id} Plain"]`);
    assert.ok(plainCard, 'plain card missing');
    assert.ok(plainCard.querySelector('[data-testid="site-service-visual-fallback"]'), 'glyph fallback missing for no-media service');
    assert.equal(plainCard.querySelector('[data-testid="site-image"]'), null, 'no media must not render an img');
  });

  await test(`${config.id}: broken image falls back to the themed glyph (no broken media)`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const card = utils.container.querySelector(`[data-testid="site-directory-card"][data-service-name="${config.id} Image"]`);
    const img = card.querySelector('[data-testid="site-image"]');
    assert.ok(img, 'image not rendered');
    await act(async () => { fireEvent.error(img); });
    assert.ok(card.querySelector('[data-testid="site-service-visual-fallback"]'), 'broken image did not fall back to glyph');
    assert.equal(card.querySelector('[data-testid="site-image"]'), null, 'broken img remained');
    assert.equal(card.querySelector('[data-testid="site-image-error"]'), null, 'raw error box should not appear (glyph used instead)');
  });

  await test(`${config.id}: no duplicate image loading in one theme`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    // PHASE 14.1: the Gallery section intentionally reuses the ACTIVE theme's
    // service photos (cross-section reuse is by design; the shared IMAGE_CACHE
    // still prevents duplicate network loading). Duplicates are therefore
    // checked WITHIN a single section, never across sections.
    const sections = utils.container.querySelectorAll('[data-site-section]');
    for (const sectionEl of Array.from(sections)) {
      const srcs = Array.from(sectionEl.querySelectorAll('[data-testid="site-image"]')).map((el) => el.getAttribute('src'));
      assert.equal(new Set(srcs).size, srcs.length, `duplicate images rendered inside ${sectionEl.getAttribute('data-site-section')}: ${srcs.join(' | ')}`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. Detail visuals                                                   */
/* ------------------------------------------------------------------ */

section('Detail visuals');

await test('detail hero reuses SiteImage with alt + gallery + icon chip', async () => {
  reset();
  const config = CASES[0];
  const services = [
    { id: 'svc-banner', name: `${config.id} Gallery`, category: config.cats[1], description: 'Image + banner + icon.', price: 700, duration: 45, themeId: config.id, status: 'active', media: { imageUrl: 'https://example.com/barber-main.jpg', bannerUrl: 'https://example.com/barber-gallery.jpg', iconUrl: 'https://example.com/barber-icon.png' } },
  ];
  const utils = render(React.createElement(Barber, { data: salonData(config.id, services), mode: 'desktop' }));
  await settle();
  await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-directory-open-detail"]')); });
  const modal = utils.container.querySelector('[data-testid="site-service-detail"]');
  assert.ok(modal.querySelector('[data-testid="site-service-detail-media"] [data-testid="site-image"]'), 'hero image missing');
  const imgs = modal.querySelectorAll('[data-testid="site-image"]');
  const srcs = Array.from(imgs).map((el) => el.getAttribute('src'));
  assert.ok(srcs.includes('https://example.com/barber-main.jpg'), 'hero image src wrong');
  assert.ok(srcs.includes('https://example.com/barber-gallery.jpg'), 'gallery image missing');
  assert.ok(srcs.includes('https://example.com/barber-icon.png'), 'icon chip missing');
  // Hero + gallery carry descriptive alt; the decorative icon chip may be alt="".
  for (const src of ['https://example.com/barber-main.jpg', 'https://example.com/barber-gallery.jpg']) {
    const img = Array.from(imgs).find((el) => el.getAttribute('src') === src);
    assert.ok((img.getAttribute('alt') || '').length > 0, `image missing alt text: ${src}`);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Theme switch — images load, previous disappear, no broken media  */
/* ------------------------------------------------------------------ */

section('Theme switch — Barber → Hair → Spa → Family → Nail');

reset();
let utils = null;
let previous = null;
for (const config of CASES) {
  if (utils === null) {
    utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
  } else {
    await act(async () => { utils.rerender(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' })); });
  }
  await settle();
  const prior = previous;

  await test(`→ ${config.id}: correct theme images load`, () => {
    const srcs = Array.from(directoryOf(utils.container).querySelectorAll('[data-testid="site-image"]')).map((el) => el.getAttribute('src'));
    assert.ok(srcs.length > 0, 'no images rendered');
    for (const src of srcs) {
      assert.ok(src.includes(`${config.id}-`), `wrong-theme image loaded: ${src}`);
    }
    assert.ok(!srcs.some((s) => s.includes('foreign.jpg')), 'foreign image leaked');
  });

  await test(`→ ${config.id}: no broken media (glyph fallback for unconfigured)`, () => {
    const directory = directoryOf(utils.container);
    assert.equal(directory.querySelectorAll('[data-testid="site-image-error"]').length, 0, 'raw error box present');
    assert.ok(directory.querySelector('[data-testid="site-service-visual-fallback"]'), 'glyph fallback missing for plain service');
  });

  if (prior) {
    await test(`→ ${config.id}: no ${prior.id} images remain`, () => {
      const srcs = Array.from(directoryOf(utils.container).querySelectorAll('[data-testid="site-image"]')).map((el) => el.getAttribute('src'));
      assert.ok(!srcs.some((s) => s.includes(`${prior.id}-`)), `stale ${prior.id} image survived`);
    });
  }
  previous = config;
}

/* ------------------------------------------------------------------ */
/* 5. Performance system reuse + caching                               */
/* ------------------------------------------------------------------ */

section('Performance system reuse');

await test('IMAGE_CACHE dedupes by URL so a repeat visit reuses it', () => {
  IMAGE_CACHE.clear();
  markImageLoaded('https://example.com/x.jpg');
  assert.equal(IMAGE_CACHE.size, 1);
  markImageLoaded('https://example.com/x.jpg');
  assert.equal(IMAGE_CACHE.size, 1, 'cache not keyed by URL');
  markImageError('https://example.com/y.jpg');
  assert.equal(IMAGE_CACHE.size, 2);
  IMAGE_CACHE.clear();
});

await test('srcSet is generated for responsive sizing', async () => {
  reset();
  const config = CASES[0];
  const utils = render(React.createElement(Barber, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
  await settle();
  const img = utils.container.querySelector('[data-testid="site-image"]');
  assert.ok(img.getAttribute('srcSet'), 'responsive srcSet missing');
  assert.match(img.getAttribute('srcSet'), /w=320/);
});

/* ------------------------------------------------------------------ */
/* 6. i18n, light/dark, responsive                                     */
/* ------------------------------------------------------------------ */

section('i18n / light-dark / responsive');

await test('alt text localizes with the service name', async () => {
  reset({ locale: 'hi' });
  const services = [
    { id: 'svc-img', name: 'Skin Fade', category: 'Haircuts', description: 'Precision fade.', price: 450, duration: 45, themeId: 'barber_mens_grooming', status: 'active', media: { imageUrl: 'https://example.com/fade.jpg' }, translations: [{ locale: 'hi', name: 'स्किन फ़ेड', description: 'सटीक फ़ेड।' }] },
  ];
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', services), mode: 'desktop' }));
  await settle();
  const img = directoryOf(utils.container).querySelector('[data-testid="site-image"]');
  assert.equal(img.getAttribute('alt'), 'स्किन फ़ेड');
});

for (const config of CASES) {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    await test(`${config.id}: visual strip renders in ${mode}`, async () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode }));
      await settle();
      assert.ok(directoryOf(utils.container).querySelector('[data-testid="site-service-visual-media"], [data-testid="site-service-visual-fallback"]'), 'no visual rendered');
    });
  }

  await test(`${config.id}: glyph fallback follows dark mode`, async () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const lightBg = utils.container.querySelector('[data-testid="site-service-visual-fallback"]').style.backgroundColor;
    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id, visualServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const darkBg = utils.container.querySelector('[data-testid="site-service-visual-fallback"]').style.backgroundColor;
    assert.ok(lightBg.length > 0 && darkBg.length > 0);
    assert.notEqual(lightBg, darkBg, 'dark mode did not change the glyph fallback surface');
  });
}

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});
setMockInViewForTests(null);
IMAGE_CACHE.clear();

console.log('\n────────────────────────────────────────');
console.log(`Phase 12.7 service images & visuals: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes render configured service visuals through the existing performance system — theme-correct images, glyph fallbacks, lazy loading, alt text, no broken/duplicate media, and clean theme switching.');
cleanup();
process.exit(0);
