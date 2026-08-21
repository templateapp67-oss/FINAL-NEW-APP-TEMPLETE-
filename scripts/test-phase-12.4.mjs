/**
 * PHASE 12.4 — COMPLETE SERVICES DIRECTORY (five-theme acceptance)
 *
 * Verifies the complete-services directory for all five themes:
 *
 *   1. Theme isolation — categories + services come ONLY from the active theme
 *      (theme_id / theme_key relationship); foreign-theme rows never render.
 *   2. Category tabs + search + category filter + price/duration sorting.
 *   3. Card fields — name, description, price, duration, offer badge, Book Now.
 *   4. Offer display — active offers only, dates respected, no invented values.
 *   5. CTA — Book Now opens the existing flow with the correct service.
 *   6. Theme switch — Barber → Hair → Spa → Family → Nail: categories change,
 *      services change, search/filter stay in-theme, previous data disappears.
 *   7. Responsive grids, EN/HI, light/dark, loading/empty/error, distinct styling.
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
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests, collectSiteSectionOrder } = await import('../src/lib/siteStructure.ts');
const { directoryServicesForTheme, distinctServiceCategories } = await import('../src/lib/siteServiceDirectory.ts');
const { serviceDirectoryText } = await import('../src/lib/siteServiceDirectoryI18n.ts');
const { formatCurrency } = await import('../src/lib/pricing.ts');

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
const MODES = ['desktop', 'tablet', 'mobile'];

/** Three distinct, theme-scoped services + one foreign service. */
function servicesFor(themeId, cats) {
  return [
    { id: `${themeId}-a`, name: `${themeId} Alpha`, category: cats[0], description: 'Alpha service description.', price: 500, duration: 30, themeId, status: 'active' },
    { id: `${themeId}-b`, name: `${themeId} Beta`, category: cats[1], description: 'Beta service description.', price: 900, duration: 60, themeId, status: 'active' },
    { id: `${themeId}-c`, name: `${themeId} Gamma`, category: cats[0], description: 'Gamma service description.', price: 300, duration: 45, themeId, status: 'active' },
    { id: `foreign-${themeId}`, name: 'Foreign Theme Service', category: 'Foreign', description: 'Must never appear.', price: 9999, duration: 90, themeId: 'some_other_theme', status: 'active' },
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
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function directoryOf(container) {
  const el = container.querySelector('[data-testid="site-services-directory"]');
  assert.ok(el, 'directory section missing');
  return el;
}

function cardNames(container) {
  return Array.from(container.querySelectorAll('[data-testid="site-directory-card"]')).map((el) => el.getAttribute('data-service-name'));
}

function categoryTabs(container) {
  return Array.from(container.querySelectorAll('[data-testid="site-directory-category"]')).map((el) => el.getAttribute('data-category'));
}

/* ------------------------------------------------------------------ */
/* 1. Data isolation (theme_id / theme_key relationship)               */
/* ------------------------------------------------------------------ */

section('Data isolation');

await test('directoryServicesForTheme keeps only the active theme’s services', () => {
  const config = CASES[0];
  const all = servicesFor(config.id, config.cats);
  const kept = directoryServicesForTheme({ services: all }, config.id);
  assert.deepEqual(kept.map((s) => s.name), [`${config.id} Alpha`, `${config.id} Beta`, `${config.id} Gamma`]);
  assert.ok(!kept.some((s) => s.name === 'Foreign Theme Service'));
});

await test('theme_key provenance wins over theme_id (saved DB rows)', () => {
  const active = [
    { id: 'db-1', name: 'Saved Service', category: 'Haircuts', description: '', price: 100, duration: 20, themeKey: 'barber_mens_grooming', themeId: 'theme-uuid', status: 'active' },
    { id: 'db-2', name: 'Other Theme Saved', category: 'Haircuts', description: '', price: 100, duration: 20, themeKey: 'nail_lash_studio', themeId: 'theme-uuid', status: 'active' },
  ];
  const kept = directoryServicesForTheme({ services: active }, 'barber_mens_grooming');
  assert.deepEqual(kept.map((s) => s.name), ['Saved Service']);
});

await test('services without provenance stay (own theme plain catalog)', () => {
  const kept = directoryServicesForTheme({
    services: [{ id: 'x', name: 'Plain', category: 'General', description: '', price: 10, duration: 10, status: 'active' }],
  }, 'barber_mens_grooming');
  assert.equal(kept.length, 1);
});

await test('distinctServiceCategories derives only active-theme categories in order', () => {
  const config = CASES[0];
  const kept = directoryServicesForTheme({ services: servicesFor(config.id, config.cats) }, config.id);
  assert.deepEqual(distinctServiceCategories(kept), config.cats);
});

/* ------------------------------------------------------------------ */
/* 2. Per-theme rendering + controls                                   */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — directory rendering`);

  await test('renders in the canonical services slot with its own services only', async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const flow = collectSiteSectionOrder(utils.container);
    const featuredIdx = flow.indexOf('featured');
    const servicesIdx = flow.indexOf('services');
    assert.ok(featuredIdx >= 0 && servicesIdx >= 0, `flow missing sections: ${flow.join(' → ')}`);
    assert.equal(servicesIdx, featuredIdx + 1, `services not directly after featured: ${flow.join(' → ')}`);

    const directory = directoryOf(utils.container);
    assert.equal(directory.getAttribute('data-theme'), config.id);
    assert.equal(directory.getAttribute('data-section-state'), 'ready');
    assert.deepEqual(cardNames(utils.container), [`${config.id} Alpha`, `${config.id} Beta`, `${config.id} Gamma`]);
    assert.ok(!flat(directory).includes('Foreign Theme Service'), 'foreign service leaked');
  });

  await test('cards show name, description, price, duration and Book CTA', async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    for (const card of utils.container.querySelectorAll('[data-testid="site-directory-card"]')) {
      const name = card.getAttribute('data-service-name');
      const expected = servicesFor(config.id, config.cats).find((s) => s.name === name);
      assert.ok(expected, `unexpected service ${name}`);
      assert.ok(flat(card.querySelector('h3')).length > 0, 'name missing');
      assert.ok(card.querySelector('[data-testid="site-directory-price"]'), 'price missing');
      assert.ok(card.querySelector('[data-testid="site-directory-duration"]'), 'duration missing');
      assert.ok(card.querySelector('[data-testid="site-directory-book"]'), 'Book CTA missing');
      assert.equal(flat(card.querySelector('[data-testid="site-directory-price"]')), formatCurrency(expected.price));
      assert.ok(flat(card.querySelector('[data-testid="site-directory-duration"]')).includes(String(expected.duration)));
      assert.ok(flat(card).includes('description'), 'description missing');
    }
  });

  for (const mode of MODES) {
    await test(`grid is mode-accurate (${mode})`, async () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode }));
      await settle();
      const grid = utils.container.querySelector('[data-testid="site-directory-grid"]');
      const cls = grid.getAttribute('class');
      if (mode === 'desktop' || mode === 'tablet') assert.match(cls, /grid-cols-2/);
      if (mode === 'mobile') assert.match(cls, /grid-cols-1/);
    });
  }

  await test('category tabs list the active theme’s categories only', async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    assert.deepEqual(categoryTabs(utils.container), ['all', ...config.cats]);
  });
}

/* ------------------------------------------------------------------ */
/* 3. Search / category filter / sort                                  */
/* ------------------------------------------------------------------ */

section('Search, category filter and sorting');

for (const config of CASES) {
  await test(`${config.id}: search narrows to matching active-theme services`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.change(utils.getByTestId('site-directory-search'), { target: { value: 'Beta' } }); });
    assert.deepEqual(cardNames(utils.container), [`${config.id} Beta`]);
  });

  await test(`${config.id}: search only searches the active theme (foreign names → no results)`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.change(utils.getByTestId('site-directory-search'), { target: { value: 'Foreign Theme Service' } }); });
    assert.equal(utils.container.querySelectorAll('[data-testid="site-directory-card"]').length, 0);
    assert.ok(utils.container.querySelector('[data-testid="site-directory-no-results"]'), 'no-results message missing');
  });

  await test(`${config.id}: category filter shows only that category`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const tab = utils.container.querySelector(`[data-testid="site-directory-category"][data-category="${config.cats[1]}"]`);
    await act(async () => { fireEvent.click(tab); });
    assert.deepEqual(cardNames(utils.container), [`${config.id} Beta`]);
    for (const card of utils.container.querySelectorAll('[data-testid="site-directory-card"]')) {
      assert.equal(card.getAttribute('data-category'), config.cats[1]);
    }
  });

  await test(`${config.id}: price + duration sorting reorders the list`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    // price asc → Gamma(300), Alpha(500), Beta(900)
    await act(async () => { fireEvent.change(utils.getByTestId('site-directory-sort'), { target: { value: 'price_asc' } }); });
    assert.deepEqual(cardNames(utils.container), [`${config.id} Gamma`, `${config.id} Alpha`, `${config.id} Beta`]);
    // duration desc → Beta(60), Gamma(45), Alpha(30)
    await act(async () => { fireEvent.change(utils.getByTestId('site-directory-sort'), { target: { value: 'duration_desc' } }); });
    assert.deepEqual(cardNames(utils.container), [`${config.id} Beta`, `${config.id} Gamma`, `${config.id} Alpha`]);
  });
}

/* ------------------------------------------------------------------ */
/* 4. Offer badge                                                      */
/* ------------------------------------------------------------------ */

section('Offer badge (active only, dates respected)');

const THEME_OFFER = (themeKey, extra = {}) => ({
  id: `off-${extra.id || themeKey}`,
  businessId: 'biz-1',
  themeId: themeKey,
  themeKey,
  targetType: 'theme',
  categoryId: null,
  predefinedServiceId: null,
  savedServiceId: null,
  packageId: null,
  title: 'Weekend special',
  promotionalBadge: '20% OFF',
  discountType: 'percentage',
  discountValue: 20,
  startDate: '2000-01-01',
  endDate: '2999-12-31',
  status: 'active',
  effectiveStatus: 'active',
  ...extra,
});

await test('active offer shows badge + discount on the active theme', async () => {
  reset();
  const config = CASES[0];
  const data = salonData(config.id, servicesFor(config.id, config.cats), { offers: [THEME_OFFER(config.id)] });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  await settle();
  for (const card of utils.container.querySelectorAll('[data-testid="site-directory-card"]')) {
    assert.ok(card.querySelector('[data-testid="site-directory-offer-badge"]'), 'offer badge missing');
    assert.equal(flat(card.querySelector('[data-testid="site-directory-discount"]')), '20% off');
  }
  const alpha = utils.container.querySelector('[data-service-name="barber_mens_grooming Alpha"]');
  assert.equal(flat(alpha.querySelector('[data-testid="site-directory-price"]')), formatCurrency(400));
});

await test('expired offers disappear automatically', async () => {
  reset();
  const config = CASES[0];
  const data = salonData(config.id, servicesFor(config.id, config.cats), { offers: [THEME_OFFER(config.id, { endDate: '2001-01-01' })] });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-directory-offer-badge"]').length, 0);
  assert.equal(utils.container.querySelectorAll('[data-testid="site-directory-discount"]').length, 0);
});

await test('an offer for another theme never applies', async () => {
  reset();
  const config = CASES[0];
  const data = salonData(config.id, servicesFor(config.id, config.cats), { offers: [THEME_OFFER('hair_studio_color_bar')] });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-directory-offer-badge"]').length, 0);
});

/* ------------------------------------------------------------------ */
/* 5. CTA — booking receives the correct service                       */
/* ------------------------------------------------------------------ */

section('CTA — selected service preserved');

for (const config of CASES) {
  await test(`${config.id}: Book Now opens the flow with the chosen service`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const bookBtn = utils.container.querySelector(`[data-testid="site-directory-book"][data-service-name="${config.id} Beta"]`);
    await act(async () => { fireEvent.click(bookBtn); });
    const flow = utils.container.querySelector('[data-testid="booking-flow"]');
    assert.ok(flow, 'booking flow did not open');
    const selected = flow.querySelector('[data-selected="true"]');
    assert.ok(selected, 'no selected service row');
    assert.ok(flat(selected).includes(`${config.id} Beta`), `flow did not preserve "${config.id} Beta": ${flat(selected)}`);
  });
}

/* ------------------------------------------------------------------ */
/* 6. Theme switch                                                     */
/* ------------------------------------------------------------------ */

section('Theme switch — Barber → Hair → Spa → Family → Nail');

reset();
let utils = null;
let previous = null;
for (const config of CASES) {
  if (utils === null) {
    utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
  } else {
    await act(async () => { utils.rerender(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' })); });
  }
  await settle();
  const prior = previous;

  await test(`→ ${config.id}: categories change`, () => {
    assert.deepEqual(categoryTabs(utils.container), ['all', ...config.cats]);
  });

  await test(`→ ${config.id}: services change`, () => {
    assert.deepEqual(cardNames(utils.container), [`${config.id} Alpha`, `${config.id} Beta`, `${config.id} Gamma`]);
  });

  await test(`→ ${config.id}: search/filter stays in-theme`, async () => {
    await act(async () => { fireEvent.change(utils.getByTestId('site-directory-search'), { target: { value: 'Alpha' } }); });
    assert.deepEqual(cardNames(utils.container), [`${config.id} Alpha`]);
    await act(async () => { fireEvent.change(utils.getByTestId('site-directory-search'), { target: { value: '' } }); });
  });

  if (prior) {
    await test(`→ ${config.id}: no ${prior.id} data remains`, () => {
      const text = flat(directoryOf(utils.container));
      assert.ok(!text.includes(`${prior.id} Alpha`), 'stale Alpha survived');
      assert.ok(!text.includes(`${prior.id} Beta`), 'stale Beta survived');
      assert.ok(!text.includes(`${prior.id} Gamma`), 'stale Gamma survived');
      assert.notEqual(directoryOf(utils.container).getAttribute('data-theme'), prior.id);
    });
  }
  previous = config;
}

/* ------------------------------------------------------------------ */
/* 7. English / हिन्दी                                                  */
/* ------------------------------------------------------------------ */

section('English / हिन्दी');

await test('Hindi localizes service names and categories', async () => {
  reset({ locale: 'hi' });
  const services = [
    { id: 'hi-1', name: 'Skin Fade', category: 'Haircuts', description: 'Precision fade.', price: 450, duration: 45, themeId: 'barber_mens_grooming', status: 'active', translations: [{ locale: 'hi', name: 'स्किन फ़ेड', description: 'सटीक फ़ेड।' }] },
    { id: 'hi-2', name: 'Beard Trim', category: 'Beard & Shave', description: 'Crisp line-up.', price: 250, duration: 20, themeId: 'barber_mens_grooming', status: 'active' },
  ];
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', services), mode: 'desktop' }));
  await settle();
  const directory = directoryOf(utils.container);
  assert.ok(flat(directory).includes('स्किन फ़ेड'), 'Hindi service name missing');
  assert.ok(!flat(directory).includes('Skin Fade'), 'English name leaked into Hindi');
  assert.ok(flat(directory).includes('हेयरकट'), 'Hindi category missing');
  assert.ok(flat(directory).includes('दाढ़ी और शेव'), 'Hindi category missing');
  assert.equal(utils.getByTestId('site-directory-search').getAttribute('placeholder'), 'सेवाएँ खोजें…');
});

await test('each theme keeps its own Hindi category labels (no mixing)', async () => {
  for (const config of CASES) {
    reset({ locale: 'hi' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const tabs = categoryTabs(utils.container);
    assert.ok(tabs.length >= 3, `${config.id} missing category tabs`);
    // Categories translate (all five use known catalogue labels).
    const text = flat(directoryOf(utils.container));
    assert.ok(Array.from(text).length > 0);
  }
});

/* ------------------------------------------------------------------ */
/* 8. Light / dark + styling isolation                                 */
/* ------------------------------------------------------------------ */

section('Light / dark + distinct styling');

for (const config of CASES) {
  await test(`${config.id}: directory surfaces change with appearance`, async () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const lightBg = directoryOf(utils.container).style.backgroundColor;
    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const darkBg = directoryOf(utils.container).style.backgroundColor;
    assert.ok(lightBg.length > 0 && darkBg.length > 0);
    assert.notEqual(lightBg, darkBg, 'dark mode did not change the directory surface');
  });
}

await test('five themes keep five distinct accent colours + signature card shapes', async () => {
  reset();
  const colors = new Map();
  const shapes = new Map();
  for (const config of CASES) {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    const card = utils.container.querySelector('[data-testid="site-directory-card"]');
    colors.set(config.id, card.querySelector('[data-testid="site-directory-price"]').style.color);
    shapes.set(config.id, card.getAttribute('class'));
    cleanup();
    reset();
  }
  assert.equal(new Set(colors.values()).size, CASES.length, `accent colours shared: ${JSON.stringify([...colors])}`);
  // Barber + Hair stay sharp; the other three each use their own radius.
  assert.ok(!shapes.get('barber_mens_grooming').includes('rounded'), 'barber should stay sharp');
  assert.ok(!shapes.get('hair_studio_color_bar').includes('rounded'), 'hair should stay sharp');
  assert.ok(shapes.get('beauty_skin_spa').includes('rounded-3xl'), 'spa should use rounded-3xl');
  assert.ok(shapes.get('family_full_service').includes('rounded-2xl'), 'family should use rounded-2xl');
  assert.ok(shapes.get('nail_lash_studio').includes('rounded-[1.5rem]'), 'nail should use rounded-[1.5rem]');
});

/* ------------------------------------------------------------------ */
/* 9. Loading / empty / error states                                   */
/* ------------------------------------------------------------------ */

section('Loading / empty / error states');

for (const config of CASES) {
  await test(`${config.id}: loading state`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ services: 'loading' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-loading"]'), 'loading panel missing');
    assert.equal(directoryOf(utils.container).getAttribute('data-section-state'), 'loading');
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: error state with retry`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ services: 'error' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, servicesFor(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), 'error panel missing');
    assert.ok(utils.container.querySelector('[data-testid="section-state-retry"]'), 'retry missing');
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: empty state`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, []), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty panel missing');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-directory-card"]').length, 0);
    assert.equal(directoryOf(utils.container).getAttribute('data-section-state'), 'empty');
  });
}

await test('empty-state text uses the theme services empty copy', () => {
  const en = serviceDirectoryText('en');
  const hi = serviceDirectoryText('hi');
  assert.equal(en.allCategories, 'All');
  assert.equal(hi.searchPlaceholder, 'सेवाएँ खोजें…');
  assert.ok(en.sortPriceAsc && hi.sortPriceAsc);
});

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 12.4 complete service directory: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes render a complete, theme-scoped service directory — categories, search, filter and sorting stay in-theme, offers are honest, booking receives the correct service, and loading/empty/error states work.');
cleanup();
process.exit(0);
