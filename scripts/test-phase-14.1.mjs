/**
 * PHASE 14.1 — GALLERY & VISUAL PORTFOLIO (five-theme acceptance test)
 *
 * Verifies the Gallery section for ALL 5 themes:
 *   1. Content — salon photos, service photos, hair/beauty/nail work,
 *      before & after pairs, portfolio items (owner-configured + active-theme
 *      service media + registered theme media only).
 *   2. Theme isolation — Barber → grooming/haircut/beard; Hair Studio →
 *      cuts/color/treatments; Beauty/Spa → facial/spa/makeup; Family → men/
 *      women/kids; Nail/Lash → nail art/manicure/lash. Foreign gallery
 *      content never leaks (themeId-scoped items and foreign service media
 *      are excluded; registered theme media is theme-owned).
 *   3. Gallery UI — featured image, responsive grid, category filter,
 *      lightbox with next/previous navigation and counter, before/after
 *      slider where configured.
 *   4. Media safety — unsafe URLs rejected, broken images fall back,
 *      lazy loading + srcSet via SiteImage, accessible alt text (EN + HI).
 *   5. Responsive — desktop / tablet / mobile render with fixed ratios,
 *      no horizontal overflow, no cross-theme grid contamination.
 *   6. Theme design — each theme keeps its own gallery styling (surfaces,
 *      shapes, chips, lightbox chrome); theme switch drops stale images,
 *      filters and lightbox state.
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
  galleryItemsForTheme,
  galleryThemeMedia,
  galleryFilterOptions,
  filterGalleryItems,
  galleryFeaturedItem,
  mapOwnerGalleryCategory,
  ownerGalleryItemForTheme,
  GALLERY_THEME_CONFIG,
} = await import('../src/lib/siteGallery.ts');
const { galleryChrome } = await import('../src/lib/siteGalleryI18n.ts');
const surfaces = await import('../src/lib/themeSurfaces.ts');

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
  setWebsiteSectionFlagsForTests({});
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

/** Owner gallery fixture: salon photos + work photos + before/after. */
const OWNER_GALLERY = [
  { id: 'og-1', url: `https://owner.example/salon-interior.jpg`, alt: 'Salon interior', category: 'Interior' },
  { id: 'og-2', url: `https://owner.example/work-shot.jpg`, alt: 'Work shot', category: 'General', caption: 'Caption here' },
  { id: 'og-3', url: `https://owner.example/ba-after.jpg`, alt: 'Colour result', category: 'Hair', beforeUrl: `https://owner.example/ba-before.jpg`, featured: true },
  { id: 'og-4', url: `https://owner.example/foreign.jpg`, alt: 'Foreign scoped item', category: 'General', themeId: 'other_theme' },
  { id: 'og-5', url: `javascript:alert(1)`, alt: 'Unsafe', category: 'General' },
];

/* ------------------------------------------------------------------ */
/* 1. Content architecture                                             */
/* ------------------------------------------------------------------ */

section('Gallery content & data architecture');

await test('every theme has its own category vocabulary (no shared category ids across unrelated themes)', () => {
  for (const config of CASES) {
    const cats = GALLERY_THEME_CONFIG[config.id].categories.map((c) => c.id);
    assert.ok(cats.includes('salon'), `${config.id} missing salon category`);
    assert.ok(cats.length >= 3, `${config.id} should have salon + work categories`);
  }
  // The five vocabularies describe five different businesses.
  const barber = GALLERY_THEME_CONFIG.barber_mens_grooming.categories.map((c) => c.id);
  const nail = GALLERY_THEME_CONFIG.nail_lash_studio.categories.map((c) => c.id);
  assert.ok(barber.includes('beard') && !nail.includes('beard'), 'beard belongs to barber only');
  assert.ok(nail.includes('nailArt') && !barber.includes('nailArt'), 'nailArt belongs to nail only');
  assert.ok(GALLERY_THEME_CONFIG.beauty_skin_spa.categories.some((c) => c.id === 'makeup'), 'spa needs makeup');
  assert.ok(GALLERY_THEME_CONFIG.family_full_service.categories.some((c) => c.id === 'kids'), 'family needs kids');
});

await test('owner gallery items are normalised: featured, before/after, theme scope, unsafe URLs', () => {
  const data = salonData('barber_mens_grooming', { gallery: OWNER_GALLERY });
  const items = galleryItemsForTheme('barber_mens_grooming', data, 'en');
  // unsafe item + foreign-scoped item excluded
  assert.ok(!items.some((i) => i.src.includes('javascript:')), 'unsafe URL must be rejected');
  assert.ok(!items.some((i) => i.src.includes('foreign')), 'foreign themeId item must be excluded');
  const ba = items.find((i) => i.src.includes('ba-after'));
  assert.ok(ba, 'before/after item missing');
  assert.equal(ba.kind, 'beforeAfter');
  assert.ok(ba.beforeSrc.includes('ba-before'), 'before image resolved');
  assert.equal(ba.featured, true, 'owner featured flag respected');
  const interior = items.find((i) => i.src.includes('salon-interior'));
  assert.equal(interior.category, 'salon', 'Interior maps to salon category');
});

await test('service photos come from the ACTIVE theme only (theme relationship respected)', () => {
  const data = salonData('barber_mens_grooming', {
    services: [
      { id: 'b1', name: 'Barber Skin Fade', category: 'Haircuts', price: 400, duration: 30, themeId: 'barber_mens_grooming', status: 'active', media: { imageUrl: 'https://svc.example/barber-fade.jpg' } },
      { id: 'n1', name: 'Nail Chrome Set', category: 'Nail Art & Gel', price: 900, duration: 60, themeId: 'nail_lash_studio', status: 'active', media: { imageUrl: 'https://svc.example/nail-chrome.jpg' } },
    ],
  });
  const items = galleryItemsForTheme('barber_mens_grooming', data, 'en');
  const srcs = items.map((i) => i.src);
  assert.ok(srcs.includes('https://svc.example/barber-fade.jpg'), 'own theme service photo included');
  assert.ok(!srcs.includes('https://svc.example/nail-chrome.jpg'), 'foreign theme service photo excluded');
  const barberItem = items.find((i) => i.src.includes('barber-fade'));
  assert.equal(barberItem.category, 'haircut', 'barber service category mapped');
  assert.equal(barberItem.origin, 'service');
});

await test('service photos in every theme map to that theme’s work categories', () => {
  const fixtures = {
    barber_mens_grooming: ['Haircuts', 'Beard & Shave', 'Grooming & Treatments'],
    hair_studio_color_bar: ['Styling & Cuts', 'Hair Color', 'Treatments'],
    beauty_skin_spa: ['Facial & Skincare', 'Spa & Body', 'Makeup'],
    family_full_service: ["Men's Services", "Women's Services", 'Kids Special'],
    nail_lash_studio: ['Nail Art & Gel', 'Pedicure & Manicure', 'Lash & Brow'],
  };
  for (const config of CASES) {
    const services = fixtures[config.id].map((category, idx) => ({
      id: `${config.id}-${idx}`,
      name: `${config.id} ${category}`,
      category,
      price: 500,
      duration: 30,
      themeId: config.id,
      status: 'active',
      media: { imageUrl: `https://svc.example/${config.id}-${idx}.jpg` },
    }));
    const data = salonData(config.id, { services });
    const items = galleryItemsForTheme(config.id, data, 'en');
    assert.equal(items.length, services.length, `${config.id} should include all own service photos`);
    const categories = new Set(items.map((i) => i.category));
    assert.ok(!categories.has('salon'), `${config.id}: work service photos must not collapse to salon`);
  }
});

await test('registered theme media: family + nail only, never shared, fallback-only', () => {
  const barber = galleryThemeMedia('barber_mens_grooming');
  const hair = galleryThemeMedia('hair_studio_color_bar');
  const spa = galleryThemeMedia('beauty_skin_spa');
  assert.equal(barber.length, 0, 'barber has no fake portfolio media');
  assert.equal(hair.length, 0, 'hair has no fake portfolio media');
  assert.equal(spa.length, 0, 'spa has no fake portfolio media');
  const family = galleryThemeMedia('family_full_service');
  const nail = galleryThemeMedia('nail_lash_studio');
  assert.ok(family.length >= 3 && nail.length >= 3, 'family/nail keep their existing showcase media');
  const familySrcs = new Set(family.map((m) => m.src));
  for (const media of nail) assert.ok(!familySrcs.has(media.src), 'no media shared between family and nail');
  // Theme media is a fallback: owner photos win.
  const withOwner = galleryItemsForTheme('family_full_service', salonData('family_full_service', { gallery: [OWNER_GALLERY[0]] }), 'en');
  assert.ok(withOwner.every((i) => i.origin !== 'theme'), 'theme media hidden when owner photos exist');
  const empty = galleryItemsForTheme('family_full_service', salonData('family_full_service'), 'en');
  assert.ok(empty.length >= 3 && empty.every((i) => i.origin === 'theme'), 'theme media shown only when nothing configured');
});

await test('filter options derive from the active theme’s own items (+ Before & After)', () => {
  const data = salonData('nail_lash_studio', { gallery: [
    { id: 'x1', url: 'https://o.example/n1.jpg', alt: 'Nails', category: 'Beauty' },
    { id: 'x2', url: 'https://o.example/ba.jpg', alt: 'BA', category: 'General', beforeUrl: 'https://o.example/ba-b.jpg' },
  ] });
  const items = galleryItemsForTheme('nail_lash_studio', data, 'en');
  const options = galleryFilterOptions('nail_lash_studio', items);
  assert.ok(options.some((o) => o.id === 'nailArt'), 'nailArt category present (Beauty → nailArt)');
  assert.ok(options.some((o) => o.id === 'beforeAfter'), 'Before & After filter present');
  const filtered = filterGalleryItems(items, 'beforeAfter', options);
  assert.ok(filtered.every((i) => i.kind === 'beforeAfter'), 'beforeAfter filter returns pairs only');
  const featured = galleryFeaturedItem(items);
  assert.ok(featured, 'featured item resolved');
});

/* ------------------------------------------------------------------ */
/* 2. Theme isolation in the rendered UI                               */
/* ------------------------------------------------------------------ */

section('Theme isolation — never show another theme’s gallery content');

await test('foreign themeId-scoped owner items never render', () => {
  reset();
  const data = salonData('barber_mens_grooming', { gallery: OWNER_GALLERY });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const sectionEl = utils.container.querySelector('[data-site-section="gallery"]');
  const text = flat(sectionEl);
  assert.ok(!text.includes('Foreign scoped item'), 'foreign item text leaked');
  assert.equal(utils.container.querySelector('[data-testid="site-gallery-tile-owner:og-4"]'), null, 'foreign item tile rendered');
  reset();
});

await test('barber gallery never shows nail/lash or spa imagery', () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    gallery: [
      { id: 'bb1', url: 'https://owner.example/barber-cut.jpg', alt: 'Barber cut', category: 'Barber' },
      { id: 'nn1', url: 'https://owner.example/nail-art.jpg', alt: 'Nail art', category: 'General', themeId: 'nail_lash_studio' },
    ],
    services: [
      { id: 's1', name: 'Skin Fade', category: 'Haircuts', price: 400, duration: 30, themeId: 'nail_lash_studio', status: 'active', media: { imageUrl: 'https://svc.example/nail-gel.jpg' } },
    ],
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const imgs = Array.from(utils.container.querySelectorAll('[data-context="gallery"] img, [data-context="gallery"] [data-testid="site-image"]'))
    .map((el) => el.getAttribute('src') || el.getAttribute('srcset'));
  const joined = imgs.join(' ');
  assert.ok(!joined.includes('nail-art'), 'nail-scoped owner photo leaked into barber gallery');
  assert.ok(!joined.includes('nail-gel'), 'nail service photo leaked into barber gallery');
  assert.ok(joined.includes('barber-cut'), 'barber work present');
  reset();
});

await test('switching theme unmounts the old gallery — no stale previous-theme images', async () => {
  reset();
  const barberData = salonData('barber_mens_grooming', {
    gallery: [{ id: 'b1', url: 'https://owner.example/beard-work.jpg', alt: 'Beard work', category: 'Barber' }],
  });
  const first = render(React.createElement(Barber, { data: barberData, mode: 'desktop' }));
  assert.ok(first.container.querySelector('[data-testid="site-gallery-featured"]'), 'barber gallery rendered');
  cleanup();
  const nailData = salonData('nail_lash_studio', {
    gallery: [{ id: 'n1', url: 'https://owner.example/nail-set.jpg', alt: 'Nail set', category: 'Beauty' }],
  });
  const second = render(React.createElement(NailLash, { data: nailData, mode: 'desktop' }));
  const gallerySection = second.container.querySelector('[data-site-section="gallery"]');
  const srcs = Array.from(gallerySection.querySelectorAll('img')).map((el) => el.getAttribute('src') || '').join(' ');
  assert.ok(!srcs.includes('beard-work'), 'stale barber image leaked after switch');
  assert.ok(srcs.includes('nail-set'), 'nail gallery rendered after switch');
  // Filters + lightbox state are fresh on the new mount.
  assert.equal(second.container.querySelector('[data-testid="site-gallery-lightbox"]'), null, 'lightbox must not carry over');
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 3. Gallery UI — featured, filter, lightbox, before/after            */
/* ------------------------------------------------------------------ */

section('Gallery UI — featured image, grid, filters, lightbox');

const UI_GALLERY = [
  { id: 'u1', url: 'https://images.unsplash.com/photo-a1?w=800', alt: 'Salon photo', category: 'Interior', caption: 'Inside the shop' },
  { id: 'u2', url: 'https://images.unsplash.com/photo-a2?w=800', alt: 'Fade result', category: 'Barber', featured: true },
  { id: 'u3', url: 'https://images.unsplash.com/photo-a3?w=800', alt: 'Beard line-up', category: 'Barber' },
  { id: 'u4', url: 'https://images.unsplash.com/photo-a4?w=800', alt: 'Before the cut', category: 'Barber', beforeUrl: 'https://images.unsplash.com/photo-a4b?w=800' },
];

/** Theme-aware expectations derived from the SAME engine the UI uses. */
function uiExpectations(themeId) {
  const data = salonData(themeId, { gallery: UI_GALLERY });
  const items = galleryItemsForTheme(themeId, data, 'en');
  const options = galleryFilterOptions(themeId, items);
  const salonCount = filterGalleryItems(items, 'salon', options).length;
  const workOption = options.find((o) => o.id !== 'salon' && o.id !== 'beforeAfter') || options[0];
  const workCount = filterGalleryItems(items, workOption.id, options).length;
  return { items, options, salonCount, workOption, workCount };
}

for (const config of CASES) {
  section(`${config.label} — gallery interactions`);
  const E = uiExpectations(config.id);

  await test(`${config.id}: featured image + grid + filter render`, async () => {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const gallery = utils.container.querySelector('[data-site-section="gallery"]');
    assert.ok(gallery, 'gallery section missing');
    assert.equal(gallery.getAttribute('data-section-state'), 'ready');
    const featured = utils.container.querySelector('[data-testid="site-gallery-featured"]');
    assert.ok(featured, 'featured banner missing');
    const grid = utils.container.querySelector('[data-testid="site-gallery-grid"]');
    assert.ok(grid, 'grid missing');
    // grid excludes the featured tile (no duplicate rendering)
    assert.equal(utils.container.querySelector('[data-testid="site-gallery-tile-owner:u2"]'), null, 'featured item must not duplicate in grid');
    assert.ok(utils.container.querySelector('[data-testid="site-gallery-tile-owner:u1"]'), 'grid tile missing');
    // filter chips = All + theme categories with items + Before & After
    assert.ok(utils.container.querySelector('[data-testid="site-gallery-filter-all"]'), 'All chip missing');
    for (const option of E.options) {
      assert.ok(utils.container.querySelector(`[data-testid="site-gallery-filter-${option.id}"]`), `${config.id}: chip ${option.id} missing`);
    }
    // no foreign category chips
    const chipIds = Array.from(utils.container.querySelectorAll('[data-testid^="site-gallery-filter-"]'))
      .map((el) => el.getAttribute('data-testid').replace('site-gallery-filter-', ''));
    for (const id of chipIds) {
      assert.ok(id === 'all' || E.options.some((o) => o.id === id), `${config.id}: unexpected chip ${id}`);
    }
    reset();
  });

  await test(`${config.id}: category filter narrows the grid and restores on All`, async () => {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const grid = () => utils.container.querySelector('[data-testid="site-gallery-grid"]');
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-filter-salon')); });
    assert.ok(grid(), 'grid missing after filter');
    const tiles = Array.from(grid().querySelectorAll('[data-testid^="site-gallery-tile-"]'));
    assert.equal(tiles.length, E.salonCount, `${config.id}: expected ${E.salonCount} salon tile(s), got ${tiles.length}`);
    assert.equal(utils.container.querySelector('[data-testid="site-gallery-featured"]'), null, 'featured banner hides while filtering');
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-filter-all')); });
    assert.ok(utils.container.querySelector('[data-testid="site-gallery-featured"]'), 'featured banner returns on All');
    assert.equal(grid().querySelectorAll('[data-testid^="site-gallery-tile-"]').length, 3, 'all tiles return');
    reset();
  });

  await test(`${config.id}: lightbox opens, navigates next/prev (wrap-around), closes`, async () => {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-gallery-tile-owner:u1"]')); });
    let lightbox = utils.container.querySelector('[data-testid="site-gallery-lightbox"]');
    assert.ok(lightbox, 'lightbox did not open');
    assert.equal(flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]')), '1 / 4');
    assert.ok(flat(lightbox).includes('Inside the shop'), 'caption shown');
    // next x4 → wraps around to the first item
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-next')); });
    }
    assert.equal(flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]')), '1 / 4', 'next must wrap around');
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-prev')); });
    assert.equal(flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]')), '4 / 4', 'prev navigates back');
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-lightbox-close')); });
    assert.equal(utils.container.querySelector('[data-testid="site-gallery-lightbox"]'), null, 'lightbox did not close');
    reset();
  });

  await test(`${config.id}: keyboard navigation (Escape / arrows) works`, async () => {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-gallery-tile-owner:u1"]')); });
    assert.ok(utils.container.querySelector('[data-testid="site-gallery-lightbox"]'), 'open for keyboard test');
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    assert.equal(flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]')), '2 / 4');
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); });
    assert.equal(flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]')), '1 / 4');
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    assert.equal(utils.container.querySelector('[data-testid="site-gallery-lightbox"]'), null);
    reset();
  });

  await test(`${config.id}: lightbox navigation respects the active filter`, async () => {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.getByTestId(`site-gallery-filter-${E.workOption.id}`)); });
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid^="site-gallery-tile-"]')); });
    const counter = flat(utils.container.querySelector('[data-testid="site-gallery-lightbox-counter"]'));
    assert.ok(counter.startsWith(`1 / ${E.workCount}`), `filtered navigation should see ${E.workCount} item(s), got ${counter}`);
    reset();
  });

  await test(`${config.id}: before/after view renders a slider with Before/After labels`, async () => {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-gallery-tile-owner:u4"]')); });
    const ba = utils.container.querySelector('[data-testid="site-gallery-before-after"]');
    assert.ok(ba, 'before/after slider missing');
    assert.equal(flat(utils.getByTestId('site-gallery-before-label')), 'Before');
    assert.equal(flat(utils.getByTestId('site-gallery-after-label')), 'After');
    const range = utils.getByTestId('site-gallery-before-after-range');
    await act(async () => { fireEvent.change(range, { target: { value: '25' } }); });
    const clip = utils.container.querySelector('[data-testid="site-gallery-before-after"] [style*="clip-path"]');
    assert.ok(clip && clip.getAttribute('style').includes('inset(0 75% 0 0)'), `clip-path should follow the slider, got ${clip?.getAttribute('style')}`);
    reset();
  });
}

/* ------------------------------------------------------------------ */
/* 4. Media safety                                                     */
/* ------------------------------------------------------------------ */

section('Media safety — fallbacks, lazy loading, alt text');

await test('broken image shows the SiteImage error fallback inside the gallery', async () => {
  reset();
  const data = salonData('barber_mens_grooming', {
    gallery: [{ id: 'broken', url: 'https://owner.example/missing.jpg', alt: 'Missing photo', category: 'General' }],
  });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const featured = utils.container.querySelector('[data-testid="site-gallery-featured"]');
  assert.ok(featured, 'featured banner rendered');
  await act(async () => { fireEvent.error(featured.querySelector('img'), {}); });
  assert.ok(featured.querySelector('[data-testid="site-image-error"]'), 'error fallback missing after image failure');
  reset();
});

await test('empty gallery shows a proper empty state (barber/hair/spa); resilient themes show registered media (family/nail)', () => {
  for (const config of CASES) {
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const gallery = utils.container.querySelector('[data-site-section="gallery"]');
    assert.ok(gallery, `${config.id} gallery section missing`);
    if (config.id === 'family_full_service' || config.id === 'nail_lash_studio') {
      const tiles = gallery.querySelectorAll('[data-testid^="site-gallery-tile-theme:"]');
      assert.ok(tiles.length >= 3, `${config.id} should show registered theme media when empty`);
      // and it stays theme-owned: family never renders nail art
      if (config.id === 'family_full_service') {
        const srcs = Array.from(gallery.querySelectorAll('img')).map((el) => el.getAttribute('src') || '').join(' ');
        assert.ok(!srcs.includes('1604654894610'), 'nail showcase leaked into family gallery');
      }
    } else {
      assert.ok(gallery.querySelector('[data-testid="section-state-empty"]'), `${config.id} should show the empty panel`);
    }
    reset();
  }
});

await test('gallery images lazy-load with srcSet + fixed aspect ratios (all themes)', () => {
  for (const config of CASES) {
    reset();
    const data = salonData(config.id, { gallery: UI_GALLERY });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const imgs = Array.from(utils.container.querySelectorAll('[data-context="gallery"] img'));
    assert.ok(imgs.length >= 3, `${config.id}: gallery images missing`);
    for (const img of imgs.slice(0, 4)) {
      assert.equal(img.getAttribute('loading'), 'lazy', `${config.id}: gallery images must lazy-load`);
    }
    const withSrcSet = imgs.find((img) => (img.getAttribute('srcset') || '').includes('w='));
    assert.ok(withSrcSet, `${config.id}: responsive srcSet missing for unsplash-style URLs`);
    const wrappers = utils.container.querySelectorAll('[data-context="gallery"][data-testid="site-image-wrapper"], [data-context="gallery"][style*="aspect-ratio"]');
    assert.ok(wrappers.length >= 1, `${config.id}: aspect-ratio wrappers missing (layout shift)`);
    reset();
  }
});

await test('alt text is descriptive and localised (EN + HI)', () => {
  reset({ locale: 'en' });
  const data = salonData('nail_lash_studio', {
    gallery: [{ id: 'a1', url: 'https://owner.example/n1.jpg', alt: 'Chrome nail set', category: 'Beauty' }],
  });
  const en = render(React.createElement(NailLash, { data, mode: 'desktop' }));
  const enImg = en.container.querySelector('[data-context="gallery"] img');
  assert.equal(enImg?.getAttribute('alt'), 'Chrome nail set');
  reset({ locale: 'hi' });
  const hi = render(React.createElement(NailLash, { data, mode: 'desktop' }));
  const hiChip = hi.container.querySelector('[data-testid="site-gallery-filter-all"]');
  assert.equal(flat(hiChip), 'पूरा एडिट', 'Hindi filter chip missing');
  reset();
});

await test('owner photos win over service photos and theme media (dedup, no fake fills)', () => {
  const data = salonData('nail_lash_studio', {
    gallery: [{ id: 'o1', url: 'https://owner.example/real.jpg', alt: 'Real photo', category: 'General' }],
    services: [
      { id: 's1', name: 'Gel Polish', category: 'Nail Art & Gel', price: 500, duration: 40, themeId: 'nail_lash_studio', status: 'active', media: { imageUrl: 'https://svc.example/gel.jpg' } },
    ],
  });
  const items = galleryItemsForTheme('nail_lash_studio', data, 'en');
  assert.equal(items.length, 2, 'owner + service photo');
  assert.ok(items.every((i) => i.origin !== 'theme'), 'theme media must not mix with owner photos');
  const dup = galleryItemsForTheme('nail_lash_studio', { ...data, gallery: [{ id: 'o1', url: 'https://svc.example/gel.jpg', alt: 'Dup', category: 'General' }] }, 'en');
  assert.equal(dup.length, 1, 'duplicate URL across sources must dedup');
});

/* ------------------------------------------------------------------ */
/* 5. Responsive (desktop → tablet → mobile)                           */
/* ------------------------------------------------------------------ */

section('Responsive — desktop / tablet / mobile');

await test('every theme renders its gallery at all three viewports without overflow-prone grids', () => {
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
      const data = salonData(config.id, { gallery: UI_GALLERY });
      const utils = render(React.createElement(config.Component, { data, mode }));
      const grid = utils.container.querySelector('[data-testid="site-gallery-grid"]');
      assert.ok(grid, `${config.id} ${mode}: grid missing`);
      const colClass = grid.className.match(/grid-cols-(\d+)/)?.[1];
      assert.equal(colClass, String(expected[config.id][mode]), `${config.id} ${mode}: wrong column count`);
      // tiles keep a fixed aspect ratio (no layout shift / broken ratios)
      const tile = grid.querySelector('[data-testid^="site-gallery-tile-"]');
      assert.ok((tile?.getAttribute('style') || '').includes('aspect-ratio'), `${config.id} ${mode}: tile missing aspect-ratio`);
      // featured banner adapts its ratio per viewport
      const featured = utils.container.querySelector('[data-testid="site-gallery-featured"]');
      assert.ok(featured, `${config.id} ${mode}: featured missing`);
      reset();
    }
  }
});

await test('gallery section keeps themed max-width frames at every viewport (no horizontal overflow)', () => {
  for (const config of CASES) {
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode }));
      const scroller = utils.container.querySelector('.site-scroll');
      assert.ok(scroller, `${config.id} ${mode}: scroll container missing`);
      assert.ok(scroller.className.includes('overflow-x-hidden'), `${config.id} ${mode}: missing overflow-x containment`);
      reset();
    }
  }
});

/* ------------------------------------------------------------------ */
/* 6. Theme design                                                     */
/* ------------------------------------------------------------------ */

section('Theme design — five distinct gallery identities');

await test('gallery section surfaces match each theme (light + dark)', () => {
  const bgOf = (el) => (el?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim() || null;
  const canon = (color) => {
    if (!color) return color;
    const probe = dom.window.document.createElement('div');
    probe.style.backgroundColor = color;
    return probe.style.backgroundColor || color;
  };
  const expect = {
    barber_mens_grooming: ['charcoal', 'BARBER_SURFACES'],
    hair_studio_color_bar: ['paper', 'HAIR_STUDIO_SURFACES'],
    beauty_skin_spa: ['cream', 'BEAUTY_SPA_SURFACES'],
    family_full_service: ['sky', 'FAMILY_SURFACES'],
    nail_lash_studio: ['white', 'NAIL_LASH_SURFACES'],
  };
  for (const config of CASES) {
    for (const appearance of ['light', 'dark']) {
      reset({ appearance });
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
      const gallery = utils.container.querySelector('[data-site-section="gallery"]');
      const tokens = surfaces.surfacesOf(surfaces[expect[config.id][1]], appearance);
      assert.equal(bgOf(gallery), canon(tokens[expect[config.id][0]]), `${config.id} ${appearance}: gallery surface mismatch`);
      reset();
    }
  }
});

await test('tiles, chips and lightbox carry per-theme shapes (no shared styling)', () => {
  const radiusOf = {
    barber_mens_grooming: 'rounded-none',
    hair_studio_color_bar: 'rounded-md',
    beauty_skin_spa: 'rounded-[1.75rem]',
    family_full_service: 'rounded-[1.5rem]',
    nail_lash_studio: 'rounded-[1.25rem]',
  };
  const seen = new Set();
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    const tile = utils.container.querySelector('[data-testid^="site-gallery-tile-"]');
    assert.ok(tile.className.includes(radiusOf[config.id]), `${config.id}: tile radius identity missing`);
    seen.add(radiusOf[config.id]);
    reset();
  }
  assert.ok(seen.size >= 4, 'themes must not share one gallery shape');
});

await test('filter chips use each theme’s own accent colour (chipActive token)', () => {
  const tokenKey = {
    barber_mens_grooming: 'gold',
    hair_studio_color_bar: 'roseSoft',
    beauty_skin_spa: 'emeraldSoft',
    family_full_service: 'sun',
    nail_lash_studio: 'pinkSoft',
  };
  const surfaceConst = {
    barber_mens_grooming: 'BARBER_SURFACES',
    hair_studio_color_bar: 'HAIR_STUDIO_SURFACES',
    beauty_skin_spa: 'BEAUTY_SPA_SURFACES',
    family_full_service: 'FAMILY_SURFACES',
    nail_lash_studio: 'NAIL_LASH_SURFACES',
  };
  const bgOf = (el) => (el?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim() || null;
  const canon = (color) => {
    const probe = dom.window.document.createElement('div');
    probe.style.backgroundColor = color;
    return probe.style.backgroundColor || color;
  };
  const seen = new Set();
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    const gallery = utils.container.querySelector('[data-site-section="gallery"]');
    const activeChip = gallery.querySelector('[data-testid="site-gallery-filter"] [aria-pressed="true"]');
    const color = bgOf(activeChip);
    assert.ok(color, `${config.id}: active chip colour missing`);
    seen.add(color);
    // the active chip uses the theme's own surface token (light mode)
    const expected = canon(surfaces.surfacesOf(surfaces[surfaceConst[config.id]], 'light')[tokenKey[config.id]]);
    assert.equal(color, expected, `${config.id}: chip accent mismatch — got ${color}, want ${expected}`);
    reset();
  }
  assert.ok(seen.size >= 3, 'chips should differ across themes');
});

await test('lightbox chrome is themed per theme', async () => {
  const bgs = {};
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid^="site-gallery-tile-"]')); });
    const lightbox = utils.container.querySelector('[data-testid="site-gallery-lightbox"]');
    const bg = (lightbox?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim();
    assert.ok(bg, `${config.id}: lightbox background missing`);
    bgs[config.id] = bg;
    reset();
  }
  const unique = new Set(Object.values(bgs));
  assert.equal(unique.size, 5, `lightbox chrome must be distinct per theme, got ${unique.size}`);
});

await test('gallery copy keeps each theme’s voice (EN) and flips to हिन्दी', () => {
  const enTitles = {
    barber_mens_grooming: 'Gallery',
    hair_studio_color_bar: 'Recent Work',
    beauty_skin_spa: 'Gallery',
    family_full_service: 'A salon full of good energy',
    nail_lash_studio: 'Gallery',
  };
  const hiTitles = {
    barber_mens_grooming: 'गैलरी',
    hair_studio_color_bar: 'ताज़ा काम',
    beauty_skin_spa: 'गैलरी',
    family_full_service: 'अच्छी एनर्जी से भरा सैलून',
    nail_lash_studio: 'गैलरी',
  };
  for (const config of CASES) {
    reset({ locale: 'en' });
    const en = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    const enGallery = en.container.querySelector('[data-site-section="gallery"]');
    assert.ok(flat(enGallery).includes(enTitles[config.id]), `${config.id}: EN gallery title missing`);
    reset({ locale: 'hi' });
    const hi = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    const hiGallery = hi.container.querySelector('[data-site-section="gallery"]');
    assert.ok(flat(hiGallery).includes(hiTitles[config.id]), `${config.id}: HI gallery title missing`);
    reset();
  }
});

/* ------------------------------------------------------------------ */
/* 7. Structure & regression                                           */
/* ------------------------------------------------------------------ */

section('Structure & regression');

await test('gallery keeps its canonical position and section contract', () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', { gallery: UI_GALLERY }), mode: 'desktop' }));
  const gallery = utils.container.querySelector('[data-site-section="gallery"]');
  assert.equal(gallery?.getAttribute('id'), 'section-gallery', 'gallery id must stay section-gallery');
  const order = Array.from(utils.container.querySelectorAll('[data-site-section]')).map((el) => el.getAttribute('data-site-section'));
  assert.ok(order.indexOf('gallery') > order.indexOf('offers'), 'gallery after offers');
  assert.ok(order.indexOf('gallery') < order.indexOf('videos'), 'gallery before videos');
  reset();
});

await test('forced loading / error / empty states still work for the gallery', () => {
  for (const config of CASES) {
    reset();
    setWebsiteSectionFlagsForTests({ gallery: 'loading' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    assert.equal(utils.container.querySelector('[data-site-section="gallery"]')?.getAttribute('data-section-state'), 'loading', `${config.id}: loading state missing`);
    reset();
    setWebsiteSectionFlagsForTests({ gallery: 'error' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id, { gallery: UI_GALLERY }), mode: 'desktop' }));
    assert.equal(utils.container.querySelector('[data-site-section="gallery"]')?.getAttribute('data-section-state'), 'error', `${config.id}: error state missing`);
    reset();
    setWebsiteSectionFlagsForTests({ gallery: 'empty' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.equal(utils.container.querySelector('[data-site-section="gallery"]')?.getAttribute('data-section-state'), 'empty', `${config.id}: empty state missing`);
    reset();
  }
});

await test('gallery chrome copy is complete for every theme and locale', () => {
  for (const config of CASES) {
    for (const locale of ['en', 'hi']) {
      const chrome = galleryChrome(config.id, locale);
      for (const key of ['filterAll', 'beforeAfter', 'before', 'after', 'dragHint', 'close', 'previous', 'next', 'counterTemplate', 'emptyTitle', 'emptyBody']) {
        assert.ok(chrome[key], `${config.id} ${locale}: missing chrome key ${key}`);
      }
    }
  }
});

await test('owner gallery data model supports themeId, beforeUrl, caption, featured (additive fields)', () => {
  const item = ownerGalleryItemForTheme(
    { id: 'x', url: 'https://o.example/a.jpg', beforeUrl: 'https://o.example/b.jpg', themeId: 'barber_mens_grooming', caption: 'Hi', featured: true },
    'barber_mens_grooming',
    'Test Salon',
    'en',
  );
  assert.equal(item?.kind, 'beforeAfter');
  assert.equal(item?.featured, true);
  assert.equal(item?.caption, 'Hi');
  assert.equal(ownerGalleryItemForTheme({ id: 'x', url: 'https://o.example/a.jpg', themeId: 'beauty_skin_spa' }, 'barber_mens_grooming', 'S', 'en'), null, 'foreign scoped item rejected');
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error.message}`);
  process.exit(1);
}
process.exit(0);
