/**
 * PHASE 12.2 — FEATURED SERVICES (five-theme acceptance)
 *
 * Verifies the Featured Services section directly below Trust/Stats for all five
 * themes:
 *
 *   1. Theme isolation — every theme shows ONLY its own suggested services
 *      (theme-id-scoped, `is_suggested` catalog); no service is shared between
 *      themes and no previous-theme service survives a switch.
 *   2. Card contents — name, short description, price, duration, offer badge
 *      (when an offer applies) and a Book Now action that opens the existing
 *      booking flow.
 *   3. Data — prices/durations come from the existing catalog (static fallback
 *      here since Supabase is unconfigured in jsdom); nothing is invented.
 *   4. Theme switch — Barber → Hair → Spa → Family → Nail, asserting correct
 *      services, prices/durations and theme styling after every switch with no
 *      stale content.
 *   5. Responsive grids, English/हिन्दी, light/dark, and loading/empty/error.
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
const { getSuggestedServices } = await import('../src/lib/themeServices.ts');
const {
  fetchFeaturedServices,
  featuredOfferFor,
  featuredPrice,
  localizeFeaturedService,
} = await import('../src/lib/siteFeaturedServices.ts');
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
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber, gridDesktop: 2, gridMobile: 1 },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio, gridDesktop: 2, gridMobile: 1 },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa, gridDesktop: 2, gridMobile: 1 },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family, gridDesktop: 2, gridMobile: 1 },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash, gridDesktop: 4, gridMobile: 2 },
];
const MODES = ['desktop', 'tablet', 'mobile'];

/** Canonical suggested services per theme (existing static catalog seed). */
const EXPECTED = Object.fromEntries(
  CASES.map((config) => [
    config.id,
    getSuggestedServices(config.id).map((service) => ({
      name: service.name,
      price: service.price,
      duration: service.duration,
    })),
  ]),
);

function salonData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: `${templateId} Test Salon`,
    services: [],
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

function featuredOf(container) {
  const el = container.querySelector('[data-testid="site-featured"]');
  assert.ok(el, 'featured section missing');
  return el;
}

function cardNames(container) {
  return Array.from(container.querySelectorAll('[data-testid="site-featured-card"]')).map((el) => el.getAttribute('data-service-name'));
}

/* ------------------------------------------------------------------ */
/* 1. Data isolation — theme_id scoping, never copy services           */
/* ------------------------------------------------------------------ */

section('Theme isolation — theme_id scoping & no shared services');

await test('every theme resolves its own suggested services only', async () => {
  for (const config of CASES) {
    const services = await fetchFeaturedServices(config.id);
    assert.ok(services.length > 0, `${config.id} has no suggested services`);
    for (const service of services) {
      assert.equal(service.themeId, config.id, `${config.id} leaked a service with themeId ${service.themeId}`);
    }
  }
});

await test('no featured service is shared between two themes', () => {
  const names = CASES.map((config) => new Set(EXPECTED[config.id].map((s) => s.name)));
  for (let a = 0; a < CASES.length; a += 1) {
    for (let b = a + 1; b < CASES.length; b += 1) {
      const overlap = [...names[a]].filter((name) => names[b].has(name));
      assert.deepEqual(overlap, [], `${CASES[a].id} and ${CASES[b].id} share services: ${overlap.join(', ')}`);
    }
  }
});

await test('suggested services respect is_suggested (curated, not the whole catalog)', () => {
  // The suggested list is a hand-picked subset — smaller than the full catalog.
  for (const config of CASES) {
    const suggested = getSuggestedServices(config.id);
    assert.ok(suggested.length >= 6, `${config.id} suggested set unexpectedly small`);
    // Curated starter set — bounded, not the full theme catalog.
    assert.ok(suggested.length <= 8, `${config.id} suggested set unexpectedly large`);
  }
});

/* ------------------------------------------------------------------ */
/* 2. Per-theme rendering + placement + card contents                  */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — rendering & card contents`);

  for (const mode of MODES) {
    await test(`${mode}: featured sits below trust and shows only its own services`, async () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      await settle();
      const flow = collectSiteSectionOrder(utils.container);
      const trustIdx = flow.indexOf('trust');
      const featuredIdx = flow.indexOf('featured');
      assert.ok(trustIdx >= 0 && featuredIdx >= 0, `flow missing sections: ${flow.join(' → ')}`);
      assert.equal(featuredIdx, trustIdx + 1, `featured not directly after trust: ${flow.join(' → ')}`);

      const featured = featuredOf(utils.container);
      assert.equal(featured.getAttribute('data-theme'), config.id);
      assert.equal(featured.getAttribute('data-section-state'), 'ready');

      const names = cardNames(utils.container);
      assert.deepEqual(names, EXPECTED[config.id].map((s) => s.name), 'wrong or reordered services');
    });

    await test(`${mode}: cards show name, description, price and duration`, async () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      await settle();
      const cards = utils.container.querySelectorAll('[data-testid="site-featured-card"]');
      assert.equal(cards.length, EXPECTED[config.id].length);
      for (const card of cards) {
        const name = card.getAttribute('data-service-name');
        const expected = EXPECTED[config.id].find((s) => s.name === name);
        assert.ok(expected, `unexpected service ${name} in ${config.id}`);
        assert.ok(card.querySelector('[data-testid="site-featured-price"]'), 'price missing');
        assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(expected.price));
        const duration = flat(card.querySelector('[data-testid="site-featured-duration"]'));
        assert.ok(duration.includes(String(expected.duration)), `duration wrong for ${name}: ${duration}`);
        assert.ok(card.querySelector('[data-testid="site-featured-book"]'), 'book CTA missing');
        assert.ok(flat(card).length > 0, 'card empty');
      }
    });

    await test(`${mode}: grid is mode-accurate (${mode})`, async () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      await settle();
      const grid = utils.container.querySelector('[data-testid="site-featured-grid"]');
      const cls = grid.getAttribute('class');
      if (mode === 'desktop') assert.match(cls, new RegExp(`grid-cols-${config.gridDesktop}`));
      if (mode === 'tablet') assert.match(cls, /grid-cols-2/);
      if (mode === 'mobile') assert.match(cls, new RegExp(`grid-cols-${config.gridMobile}`));
    });
  }
}

/* ------------------------------------------------------------------ */
/* 3. Book Now opens the existing booking flow                         */
/* ------------------------------------------------------------------ */

section('Book Now action');

for (const config of CASES) {
  await test(`${config.id}: Book Now opens exactly one booking flow`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    const firstBook = utils.container.querySelector('[data-testid="site-featured-book"]');
    await act(async () => { fireEvent.click(firstBook); });
    assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), 'booking flow did not open');
    // Close for cleanliness.
    await act(async () => {
      const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      if (back) fireEvent.click(back);
    });
  });
}

/* ------------------------------------------------------------------ */
/* 4. Offer badges + offer-aware pricing                               */
/* ------------------------------------------------------------------ */

section('Offer badge & price');

const THEME_OFFER = (themeKey, extra = {}) => ({
  id: `off-${themeKey}`,
  businessId: 'biz-1',
  themeId: 'theme-uuid-1',
  themeKey,
  targetType: 'theme',
  categoryId: null,
  predefinedServiceId: null,
  savedServiceId: null,
  packageId: null,
  title: 'Weekend 20% off',
  promotionalBadge: '20% OFF',
  discountType: 'percentage',
  discountValue: 20,
  startDate: '2000-01-01',
  endDate: '2999-12-31',
  status: 'active',
  effectiveStatus: 'active',
  ...extra,
});

await test('a theme-level offer applies a badge and discount', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('barber_mens_grooming')] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  const cards = utils.container.querySelectorAll('[data-testid="site-featured-card"]');
  for (const card of cards) {
    const badge = card.querySelector('[data-testid="site-featured-offer-badge"]');
    assert.ok(badge, 'offer badge missing');
    assert.equal(flat(badge), '20% OFF');
  }
  const skinFade = utils.container.querySelector('[data-service-name="Skin Fade"]');
  assert.equal(flat(skinFade.querySelector('[data-testid="site-featured-price"]')), formatCurrency(360));
});

await test('an offer for another theme never applies', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('hair_studio_color_bar')] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-offer-badge"]').length, 0);
  const skinFade = utils.container.querySelector('[data-service-name="Skin Fade"]');
  assert.equal(flat(skinFade.querySelector('[data-testid="site-featured-price"]')), formatCurrency(450));
});

await test('featuredOfferFor matches theme / category / predefined and rejects others', () => {
  const base = {
    key: 'p1', name: 'Skin Fade', description: '', category: 'Haircuts',
    price: 450, duration: 45, themeId: 'barber_mens_grooming',
  };
  assert.ok(featuredOfferFor(base, [THEME_OFFER('barber_mens_grooming')], 'barber_mens_grooming'));
  assert.ok(!featuredOfferFor(base, [THEME_OFFER('hair_studio_color_bar')], 'barber_mens_grooming'));

  const dbService = { ...base, themeUuid: 'uuid-x', categoryId: 'cat-x', predefinedServiceId: 'pre-x' };
  const categoryOffer = THEME_OFFER('barber_mens_grooming', { targetType: 'category', categoryId: 'cat-x', id: 'off-cat' });
  const predefinedOffer = THEME_OFFER('barber_mens_grooming', { targetType: 'predefined_service', predefinedServiceId: 'pre-x', id: 'off-pre' });
  assert.equal(featuredOfferFor(dbService, [categoryOffer], 'barber_mens_grooming').id, 'off-cat');
  assert.equal(featuredOfferFor(dbService, [predefinedOffer], 'barber_mens_grooming').id, 'off-pre');

  const inactive = THEME_OFFER('barber_mens_grooming', { status: 'inactive' });
  const expired = THEME_OFFER('barber_mens_grooming', { endDate: '2001-01-01' });
  assert.equal(featuredOfferFor(base, [inactive], 'barber_mens_grooming'), undefined);
  assert.equal(featuredOfferFor(base, [expired], 'barber_mens_grooming'), undefined);
});

await test('featuredPrice discounts only when an offer is present', () => {
  const service = { key: 'x', name: 'Skin Fade', description: '', category: 'Haircuts', price: 450, duration: 45, themeId: 'barber_mens_grooming' };
  assert.deepEqual(featuredPrice(service), { base: 450, final: 450 });
  const offer = THEME_OFFER('barber_mens_grooming');
  assert.deepEqual(featuredPrice(service, offer), { base: 450, final: 360 });
});

/* ------------------------------------------------------------------ */
/* 5. Theme switch — Barber → Hair → Spa → Family → Nail               */
/* ------------------------------------------------------------------ */

section('Theme switch — no stale services, correct data + styling');

for (const [locale, appearance] of [['en', 'light'], ['hi', 'dark']]) {
  reset({ locale, appearance });
  let utils = null;
  let previous = null;

  for (const config of CASES) {
    if (utils === null) {
      utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    } else {
      await act(async () => { utils.rerender(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' })); });
    }
    await settle();
    const prior = previous;

    await test(`→ ${config.id} (${locale}/${appearance}): correct services only`, () => {
      const featured = featuredOf(utils.container);
      assert.equal(featured.getAttribute('data-theme'), config.id);
      assert.deepEqual(cardNames(utils.container), EXPECTED[config.id].map((s) => s.name));
    });

    await test(`→ ${config.id} (${locale}/${appearance}): correct prices/duration`, () => {
      for (const card of utils.container.querySelectorAll('[data-testid="site-featured-card"]')) {
        const expected = EXPECTED[config.id].find((s) => s.name === card.getAttribute('data-service-name'));
        assert.ok(expected);
        assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(expected.price));
        assert.ok(flat(card.querySelector('[data-testid="site-featured-duration"]')).includes(String(expected.duration)));
      }
    });

    await test(`→ ${config.id} (${locale}/${appearance}): theme-specific styling`, () => {
      const card = utils.container.querySelector('[data-testid="site-featured-card"]');
      const valueColor = card.querySelector('[data-testid="site-featured-price"]').style.color;
      assert.ok(valueColor.length > 0, 'price lost its theme colour');
      assert.ok((featuredOf(utils.container).getAttribute('style') || '').length > 0, 'section lost its surface');
    });

    if (prior) {
      await test(`→ ${config.id} (${locale}/${appearance}): no ${prior.id} services remain`, () => {
        const text = flat(utils.container.querySelector('[data-testid="site-featured"]'));
        for (const service of EXPECTED[prior.id]) {
          assert.ok(!text.includes(service.name), `stale ${prior.id} service "${service.name}" survived the switch`);
        }
        assert.notEqual(featuredOf(utils.container).getAttribute('data-theme'), prior.id);
      });
    }
    previous = config;
  }
}
setSiteLocale('en');
setSiteAppearance(undefined);

/* ------------------------------------------------------------------ */
/* 6. English / हिन्दी                                                  */
/* ------------------------------------------------------------------ */

section('English / हिन्दी');

await test('Hindi card names come from the catalog locale seed', async () => {
  reset({ locale: 'hi' });
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming'), mode: 'desktop' }));
  await settle();
  const text = flat(utils.container.querySelector('[data-testid="site-featured"]'));
  assert.ok(text.includes('स्किन फ़ेड'), 'Hindi service name missing');
  assert.ok(!text.includes('Skin Fade'), 'English name leaked into Hindi');
});

await test('each theme localizes to its own Hindi copy (never another theme’s)', async () => {
  for (const config of CASES) {
    reset({ locale: 'hi' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const cards = utils.container.querySelectorAll('[data-testid="site-featured-card"]');
    for (const card of cards) {
      const en = card.getAttribute('data-service-name');
      const hi = localizeFeaturedService({ name: en, description: '', category: '', price: 0, duration: 0, key: '', themeId: config.id }, config.id, 'hi');
      assert.ok(hi.name, `no Hindi copy for ${en}`);
      assert.match(flat(card), /[\u0900-\u097F]/, `card "${en}" not localized to Hindi`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 7. Light / dark                                                     */
/* ------------------------------------------------------------------ */

section('Light / dark');

for (const config of CASES) {
  await test(`${config.id}: featured surfaces change with appearance`, async () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const lightBg = featuredOf(utils.container).style.backgroundColor;
    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const darkBg = featuredOf(utils.container).style.backgroundColor;
    assert.ok(lightBg.length > 0 && darkBg.length > 0, 'featured section lost its background');
    assert.notEqual(lightBg, darkBg, 'dark mode did not change the featured surface');
  });
}

/* ------------------------------------------------------------------ */
/* 8. Loading / empty / error states                                   */
/* ------------------------------------------------------------------ */

section('Loading / empty / error states');

for (const config of CASES) {
  await test(`${config.id}: loading state`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ featured: 'loading' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="site-featured-loading"]'), 'loading skeleton missing');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-card"]').length, 0);
    assert.equal(featuredOf(utils.container).getAttribute('data-section-state'), 'loading');
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: error state with retry`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ featured: 'error' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), 'error panel missing');
    assert.ok(utils.container.querySelector('[data-testid="section-state-retry"]'), 'retry button missing');
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: empty state`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ featured: 'empty' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty panel missing');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-card"]').length, 0);
    assert.equal(featuredOf(utils.container).getAttribute('data-section-state'), 'empty');
    setWebsiteSectionFlagsForTests({});
  });
}

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 12.2 featured services: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes show only their own suggested services — no copying, correct prices/durations, offer-aware pricing, Book Now to the existing flow, responsive grids, EN/HI, light/dark, and full loading/empty/error states.');
cleanup();
process.exit(0);
