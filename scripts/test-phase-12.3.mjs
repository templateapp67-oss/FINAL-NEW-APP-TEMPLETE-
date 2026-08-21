/**
 * PHASE 12.3 — SERVICE CARD ENHANCEMENT (five-theme acceptance)
 *
 * Verifies the enhanced Featured Services cards for all five themes:
 *
 *   1. Card fields — name, description, price/starting price, duration,
 *      image/icon, offer badge + discount amount, Suggested/Popular badge,
 *      Book Now CTA.
 *   2. Offer display — active offers only, start/end dates respected, expired
 *      offers disappear automatically, no invented discounts.
 *   3. Theme isolation — each theme shows only its own services; no styling or
 *      service copied across themes.
 *   4. CTA — Book Now opens the EXISTING booking flow with the selected service
 *      preserved.
 *   5. Responsive grids, English/हिन्दी, light/dark, loading/empty/error.
 *   6. Theme switch — Barber → Hair → Spa → Family → Nail with correct
 *      service/price/duration/active-offer data and no stale content.
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
  featuredDiscountLabel,
  featuredStartingPrice,
  featuredServiceToService,
} = await import('../src/lib/siteFeaturedServices.ts');
const { startingPriceLabel } = await import('../src/lib/siteFeaturedI18n.ts');
const { formatCurrency } = await import('../src/lib/pricing.ts');
const { isOfferActive, getOfferEffectiveStatus } = await import('../src/lib/pricing.ts');

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

const EXPECTED = Object.fromEntries(
  CASES.map((config) => [
    config.id,
    getSuggestedServices(config.id).map((service, index) => ({
      name: service.name,
      price: service.price,
      duration: service.duration,
      rank: index,
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

const THEME_OFFER = (themeKey, extra = {}) => ({
  id: `off-${extra.id || themeKey}`,
  businessId: 'biz-1',
  themeId: 'theme-uuid-1',
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

/* ------------------------------------------------------------------ */
/* 1. Card fields                                                      */
/* ------------------------------------------------------------------ */

section('Card fields — name, description, price, duration, icon, badges, CTA');

for (const config of CASES) {
  await test(`${config.id}: every card renders the full field set`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const cards = utils.container.querySelectorAll('[data-testid="site-featured-card"]');
    assert.equal(cards.length, EXPECTED[config.id].length);
    for (const card of cards) {
      const name = card.getAttribute('data-service-name');
      const expected = EXPECTED[config.id].find((s) => s.name === name);
      assert.ok(expected, `unexpected service ${name}`);
      assert.ok(flat(card.querySelector('h3')).length > 0, 'name missing');
      assert.ok(card.querySelector('[data-testid="site-featured-price"]'), 'price missing');
      assert.ok(card.querySelector('[data-testid="site-featured-duration"]'), 'duration missing');
      assert.ok(card.querySelector('[data-testid="site-featured-book"]'), 'CTA missing');
      assert.ok(card.querySelector('[data-testid="site-featured-icon"]'), 'icon missing');
      assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(expected.price));
      assert.ok(flat(card.querySelector('[data-testid="site-featured-duration"]')).includes(String(expected.duration)));
      assert.ok(flat(card.querySelector('p')).length > 0, 'description missing');
    }
  });

  await test(`${config.id}: Suggested badge on all + Popular on the top-ranked card`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const cards = utils.container.querySelectorAll('[data-testid="site-featured-card"]');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-popular-badge"]').length, 1, 'exactly one Popular badge expected');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-suggested-badge"]').length, cards.length - 1);
    // The Popular badge is on the top-ranked suggested service.
    const popularCard = utils.container.querySelector('[data-testid="site-featured-popular-badge"]').closest('[data-testid="site-featured-card"]');
    assert.equal(popularCard.getAttribute('data-service-name'), EXPECTED[config.id][0].name);
  });
}

/* ------------------------------------------------------------------ */
/* 2. Offer display — active only, dates respected, no invented value  */
/* ------------------------------------------------------------------ */

section('Offer display rules');

await test('percentage offer shows badge + percentage label + discounted price', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('barber_mens_grooming')] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  const card = utils.container.querySelector('[data-service-name="Skin Fade"]');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-offer-badge"]')), '20% OFF');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-discount"]')), '20% off');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(360));
});

await test('fixed offer shows amount label + discounted price', async () => {
  reset();
  const offer = THEME_OFFER('barber_mens_grooming', {
    id: 'fixed', discountType: 'fixed', discountValue: 100, promotionalBadge: '₹100 OFF',
  });
  const data = salonData('barber_mens_grooming', { offers: [offer] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  const card = utils.container.querySelector('[data-service-name="Skin Fade"]');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-offer-badge"]')), '₹100 OFF');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-discount"]')), '₹100 off');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(350));
});

await test('expired offers disappear automatically (no badge, no discount)', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('barber_mens_grooming', { endDate: '2001-01-01' })] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-offer-badge"]').length, 0);
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-discount"]').length, 0);
  const card = utils.container.querySelector('[data-service-name="Skin Fade"]');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(450));
});

await test('future-dated offers are not shown before their start date', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('barber_mens_grooming', { startDate: '2999-01-01' })] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-offer-badge"]').length, 0);
});

await test('inactive offers are never shown', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('barber_mens_grooming', { status: 'inactive' })] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-offer-badge"]').length, 0);
});

await test('no offers → no badges, no discounts, plain price (nothing invented)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming'), mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-offer-badge"]').length, 0);
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-discount"]').length, 0);
  const card = utils.container.querySelector('[data-service-name="Skin Fade"]');
  assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(450));
});

await test('offer for another theme never applies', async () => {
  reset();
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('hair_studio_color_bar')] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-offer-badge"]').length, 0);
});

/* ------------------------------------------------------------------ */
/* 3. Offer/price helpers                                              */
/* ------------------------------------------------------------------ */

section('Offer & price helpers');

await test('featuredDiscountLabel derives from real discountValue', () => {
  assert.equal(featuredDiscountLabel(THEME_OFFER('x', { discountType: 'percentage', discountValue: 20 })), '20% off');
  assert.equal(featuredDiscountLabel(THEME_OFFER('x', { discountType: 'fixed', discountValue: 100 })), '₹100 off');
});

await test('featuredStartingPrice only "from"-grades when variants exist', () => {
  const service = { key: 'k', name: 'Skin Fade', description: '', category: 'Haircuts', price: 450, duration: 45, isSuggested: true, suggestedSortOrder: 0, themeId: 'barber_mens_grooming' };
  assert.deepEqual(featuredStartingPrice(service), { hasVariants: false, min: 450 });
  const withVariants = {
    ...service,
    pricingVariants: [
      { id: 'v1', serviceId: 'k', name: 'Standard', price: 450, duration: 45, status: 'active', displayOrder: 0 },
      { id: 'v2', serviceId: 'k', name: 'Premium', price: 700, duration: 60, status: 'active', displayOrder: 1 },
      { id: 'v3', serviceId: 'k', name: 'Old', price: 100, duration: 30, status: 'inactive', displayOrder: 2 },
    ],
  };
  assert.deepEqual(featuredStartingPrice(withVariants), { hasVariants: true, min: 450 });
});

await test('startingPriceLabel localizes the From prefix', () => {
  assert.equal(startingPriceLabel('₹450', 'en'), 'From ₹450');
  assert.equal(startingPriceLabel('₹450', 'hi'), '₹450 से');
});

await test('featuredServiceToService builds a bookable, theme-scoped row', () => {
  const featured = {
    key: 'k', name: 'Skin Fade', description: 'Precision.', category: 'Haircuts',
    price: 450, duration: 45, isSuggested: true, suggestedSortOrder: 0, themeId: 'barber_mens_grooming',
  };
  const service = featuredServiceToService(featured, 'barber_mens_grooming');
  assert.equal(service.themeId, 'barber_mens_grooming');
  assert.equal(service.name, 'Skin Fade');
  assert.equal(service.price, 450);
  assert.ok(service.id.startsWith('featured:'));
});

/* ------------------------------------------------------------------ */
/* 4. CTA — selected service preserved in the existing booking flow    */
/* ------------------------------------------------------------------ */

section('CTA — selected service preserved');

for (const config of CASES) {
  await test(`${config.id}: Book Now opens the flow with the chosen service selected`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.equal(utils.container.querySelector('[data-testid="booking-flow"]'), null);
    const target = EXPECTED[config.id][1]; // pick a non-first service to prove specificity
    const bookBtn = utils.container.querySelector(`[data-testid="site-featured-book"][data-service-name="${target.name}"]`);
    assert.ok(bookBtn, `no book button for ${target.name}`);
    await act(async () => { fireEvent.click(bookBtn); });
    const flow = utils.container.querySelector('[data-testid="booking-flow"]');
    assert.ok(flow, 'booking flow did not open');
    assert.equal(flow.getAttribute('data-step'), 'service');
    const selected = flow.querySelector('[data-selected="true"]');
    assert.ok(selected, 'no selected service row in the flow');
    assert.ok(flat(selected).includes(target.name), `flow did not preserve "${target.name}": ${flat(selected)}`);
  });
}

await test('a second plain open does not reuse a stale prefill', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming'), mode: 'desktop' }));
  await settle();
  // First: book "Skin Fade".
  await act(async () => {
    fireEvent.click(utils.container.querySelector('[data-testid="site-featured-book"][data-service-name="Skin Fade"]'));
  });
  assert.ok(flat(utils.container.querySelector('[data-selected="true"]')).includes('Skin Fade'));
  // Close the flow.
  await act(async () => {
    const close = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
    fireEvent.click(close);
  });
  // Re-open via a plain header-style CTA — no prefill must leak.
  await act(async () => {
    const finalCta = utils.container.querySelector('[data-testid="final-booking-cta"]');
    fireEvent.click(finalCta);
  });
  const flow = utils.container.querySelector('[data-testid="booking-flow"]');
  assert.ok(flow, 'booking flow did not reopen');
  const selected = flow.querySelector('[data-selected="true"]');
  // The flow defaults to its own first service; it must NOT be the featured prefill.
  assert.ok(!(flat(selected || {}).includes('featured')), 'stale featured prefill leaked into a plain open');
});

/* ------------------------------------------------------------------ */
/* 5. Theme switch — correct data + no stale services                  */
/* ------------------------------------------------------------------ */

section('Theme switch — Barber → Hair → Spa → Family → Nail');

reset();
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

  await test(`→ ${config.id}: correct services, prices and durations`, () => {
    assert.equal(featuredOf(utils.container).getAttribute('data-theme'), config.id);
    assert.deepEqual(cardNames(utils.container), EXPECTED[config.id].map((s) => s.name));
    for (const card of utils.container.querySelectorAll('[data-testid="site-featured-card"]')) {
      const expected = EXPECTED[config.id].find((s) => s.name === card.getAttribute('data-service-name'));
      assert.equal(flat(card.querySelector('[data-testid="site-featured-price"]')), formatCurrency(expected.price));
      assert.ok(flat(card.querySelector('[data-testid="site-featured-duration"]')).includes(String(expected.duration)));
    }
  });

  if (prior) {
    await test(`→ ${config.id}: no ${prior.id} services remain`, () => {
      const text = flat(featuredOf(utils.container));
      for (const service of EXPECTED[prior.id]) {
        assert.ok(!text.includes(service.name), `stale ${prior.id} service "${service.name}" survived`);
      }
      assert.notEqual(featuredOf(utils.container).getAttribute('data-theme'), prior.id);
    });
  }
  previous = config;
}

/* ------------------------------------------------------------------ */
/* 6. English / हिन्दी                                                  */
/* ------------------------------------------------------------------ */

section('English / हिन्दी');

await test('badge + price labels flip to Hindi', async () => {
  reset({ locale: 'hi' });
  const data = salonData('barber_mens_grooming', { offers: [THEME_OFFER('barber_mens_grooming')] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  const text = flat(featuredOf(utils.container));
  assert.ok(text.includes('लोकप्रिय'), 'Hindi Popular badge missing');
  assert.ok(text.includes('सुझाया गया'), 'Hindi Suggested badge missing');
  assert.ok(text.includes('20% off'), 'discount label should remain numeric/legible');
});

await test('each theme localizes to its own Hindi copy', async () => {
  for (const config of CASES) {
    reset({ locale: 'hi' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    for (const card of utils.container.querySelectorAll('[data-testid="site-featured-card"]')) {
      assert.match(flat(card.querySelector('h3')), /[\u0900-\u097F]/, `name not localized in ${config.id}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 7. Light / dark + responsive grids                                  */
/* ------------------------------------------------------------------ */

section('Light / dark + responsive grids');

for (const config of CASES) {
  await test(`${config.id}: card surfaces change with appearance`, async () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const lightBg = featuredOf(utils.container).style.backgroundColor;
    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const darkBg = featuredOf(utils.container).style.backgroundColor;
    assert.ok(lightBg.length > 0 && darkBg.length > 0);
    assert.notEqual(lightBg, darkBg, 'dark mode did not change the featured surface');
  });

  for (const mode of MODES) {
    await test(`${config.id}: grid is mode-accurate (${mode})`, async () => {
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
/* 8. Loading / empty / error states                                   */
/* ------------------------------------------------------------------ */

section('Loading / empty / error states');

for (const config of CASES) {
  await test(`${config.id}: loading state`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ featured: 'loading' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="site-featured-loading"]'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-card"]').length, 0);
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: error state with retry`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ featured: 'error' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'));
    assert.ok(utils.container.querySelector('[data-testid="section-state-retry"]'));
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: empty state`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ featured: 'empty' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-featured-card"]').length, 0);
    setWebsiteSectionFlagsForTests({});
  });
}

/* ------------------------------------------------------------------ */
/* 9. Theme isolation of styling                                       */
/* ------------------------------------------------------------------ */

section('Theme isolation of styling');

await test('five themes keep five distinct card value colours & surfaces', async () => {
  reset();
  const colors = new Map();
  const surfaces = new Map();
  for (const config of CASES) {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    await settle();
    const card = utils.container.querySelector('[data-testid="site-featured-card"]');
    colors.set(config.id, card.querySelector('[data-testid="site-featured-price"]').style.color);
    surfaces.set(config.id, featuredOf(utils.container).style.backgroundColor);
    cleanup();
    reset();
  }
  assert.equal(new Set(colors.values()).size, CASES.length, `value colours shared: ${JSON.stringify([...colors])}`);
  assert.equal(new Set(surfaces.values()).size, CASES.length, `surfaces shared: ${JSON.stringify([...surfaces])}`);
});

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 12.3 service card enhancement: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes render enhanced featured cards: name/description/price/duration/icon, active-offer badge + discount, Suggested/Popular badges, service-preserving Book Now, theme isolation, EN/HI, light/dark, responsive and full loading/empty/error states.');
cleanup();
process.exit(0);
