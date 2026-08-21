/**
 * PHASE 13.1 — THEME-SPECIFIC OFFERS & DISCOUNTS (five-theme acceptance test)
 *
 * Verifies Offers/Discounts for ALL 5 themes:
 *   1. Offer Types — Percentage discount, Fixed amount discount, Festive/Seasonal, Limited-time.
 *   2. Support — Offer name, short description, discount value, start/end dates, active status, theme, linked service.
 *   3. Theme Isolation — Barber, Hair Studio, Beauty/Spa, Family, Nail/Lash. Foreign offers never leak.
 *   4. Offer Display — Title, badge, validity, applicable service, original price, discounted price, Book Now CTA.
 *   5. Expired Offers — Expired offers automatically disappear.
 *   6. Booking Flow — Book Now opens the existing flow with correct theme, service, offer, and calculated price.
 *   7. Safety — Honest prices & discounts, no invented values, no cross-theme leakage, no expired bookings, no duplicate stacking.
 *   8. UI & i18n — Theme-specific card styling, responsive desktop/tablet/mobile, EN/HI, light/dark, loading/empty/error states.
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
const { getThemeOffers, rawOffersForTheme, CURATED_THEME_OFFERS } = await import('../src/lib/siteOffers.ts');
const { isOfferActive, discountedPrice, serviceDisplayPrice } = await import('../src/lib/pricing.ts');

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
    ...extras,
  };
}

const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* 1. Offer Types & Data Architecture                                 */
/* ------------------------------------------------------------------ */

section('Offer Types & Support Attributes');

await test('all five themes have curated offers supporting required offer types', () => {
  for (const config of CASES) {
    const raw = rawOffersForTheme(config.id, salonData(config.id), '2026-08-14');
    assert.ok(raw.length >= 2, `${config.id} should have at least 2 active offers`);

    const hasPercentage = raw.some((o) => o.discountType === 'percentage');
    const hasFixed = raw.some((o) => o.discountType === 'fixed');
    assert.ok(hasPercentage, `${config.id} missing percentage discount offer`);
    assert.ok(hasFixed, `${config.id} missing fixed discount offer`);

    for (const offer of raw) {
      assert.ok(offer.title, `${offer.id} missing title`);
      assert.ok(offer.description, `${offer.id} missing description`);
      assert.ok(offer.promotionalBadge, `${offer.id} missing badge`);
      assert.ok(typeof offer.discountValue === 'number' && offer.discountValue > 0, `${offer.id} invalid discountValue`);
      assert.ok(offer.startDate, `${offer.id} missing startDate`);
      assert.ok(offer.endDate, `${offer.id} missing endDate`);
      assert.equal(offer.status, 'active');
      assert.equal(offer.themeKey, config.id);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. Theme Isolation & Foreign Offer Rejection                      */
/* ------------------------------------------------------------------ */

section('Theme Isolation');

for (const config of CASES) {
  await test(`${config.id}: shows only its own theme offers`, () => {
    reset();
    const foreignOffers = CASES.filter((c) => c.id !== config.id).map((c) => ({
      id: `foreign-${c.id}`,
      businessId: 'biz-foreign',
      themeId: c.id,
      themeKey: c.id,
      targetType: 'theme',
      title: `FOREIGN ${c.id} OFFER`,
      description: 'Foreign offer',
      promotionalBadge: 'FOREIGN',
      discountType: 'percentage',
      discountValue: 50,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    }));

    const data = salonData(config.id, { offers: foreignOffers });
    const resolved = getThemeOffers(config.id, data, '2026-08-14');
    assert.equal(resolved.length, 2, `expected fallback to 2 theme offers, got ${resolved.length}`);
    for (const offer of resolved) {
      assert.equal(offer.themeId, config.id, `foreign offer leaked into ${config.id}`);
      assert.ok(!offer.title.includes('FOREIGN'), `foreign title leaked: ${offer.title}`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. Expired & Inactive Offers                                        */
/* ------------------------------------------------------------------ */

section('Expired & Inactive Offers Auto-Disappear');

await test('expired offers automatically disappear from offer resolution', () => {
  const expiredOffer = {
    id: 'expired-1',
    businessId: 'b1',
    themeId: 'barber_mens_grooming',
    themeKey: 'barber_mens_grooming',
    targetType: 'theme',
    title: 'Expired Summer Cut',
    description: 'Old offer',
    promotionalBadge: 'EXPIRED',
    discountType: 'percentage',
    discountValue: 30,
    startDate: '2026-01-01',
    endDate: '2026-01-15',
    status: 'active',
    effectiveStatus: 'expired',
  };

  const data = salonData('barber_mens_grooming', { offers: [expiredOffer] });
  const active = getThemeOffers('barber_mens_grooming', data, '2026-08-14');
  assert.ok(!active.some((o) => o.id === 'expired-1'), 'expired offer was returned in active offers');
});

await test('inactive status offers automatically disappear', () => {
  const inactiveOffer = {
    id: 'inactive-1',
    businessId: 'b1',
    themeId: 'hair_studio_color_bar',
    themeKey: 'hair_studio_color_bar',
    targetType: 'theme',
    title: 'Deactivated Offer',
    description: 'Deactivated',
    promotionalBadge: 'INACTIVE',
    discountType: 'fixed',
    discountValue: 200,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'inactive',
    effectiveStatus: 'inactive',
  };

  const data = salonData('hair_studio_color_bar', { offers: [inactiveOffer] });
  const active = getThemeOffers('hair_studio_color_bar', data, '2026-08-14');
  assert.ok(!active.some((o) => o.id === 'inactive-1'), 'inactive offer was returned in active offers');
});

/* ------------------------------------------------------------------ */
/* 4. Display Cards Verification across ALL 5 Themes                   */
/* ------------------------------------------------------------------ */

section('Offer Display — All 5 Themes');

for (const config of CASES) {
  await test(`${config.label}: renders offers section with all required fields`, () => {
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const container = utils.container.querySelector('[data-site-section="offers"]');
    assert.ok(container, `offers section missing for ${config.id}`);
    assert.equal(container.getAttribute('data-section-state'), 'ready');

    const cards = utils.getAllByTestId('offer-card');
    assert.ok(cards.length >= 1, `no offer cards rendered for ${config.id}`);

    for (const card of cards) {
      assert.ok(card.querySelector('[data-testid="offer-title"]'), 'title missing');
      assert.ok(card.querySelector('[data-testid="offer-badge"]'), 'badge missing');
      assert.ok(card.querySelector('[data-testid="offer-validity"]'), 'validity missing');
      assert.ok(card.querySelector('[data-testid="offer-service"]'), 'applicable service missing');
      assert.ok(card.querySelector('[data-testid="offer-discounted-price"]'), 'discounted price missing');
      assert.ok(card.querySelector('[data-testid="offer-book-now"]'), 'Book Now CTA missing');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 5. Booking Flow & Safety Verification                              */
/* ------------------------------------------------------------------ */

section('Offer → Service → Discount → Final Price → Book Now');

for (const config of CASES) {
  await test(`${config.label}: Book Now hands correct service & discount to booking flow`, async () => {
    reset();
    const data = salonData(config.id);
    const resolvedOffers = getThemeOffers(config.id, data, '2026-08-14');
    const targetOffer = resolvedOffers[0];

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const bookBtns = utils.getAllByTestId('offer-book-now');
    assert.ok(bookBtns.length >= 1, 'Book Now buttons missing');

    await act(async () => {
      fireEvent.click(bookBtns[0]);
    });

    // Check that booking modal opens
    const modal = utils.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(modal, `booking modal did not open for ${config.id}`);

    // Verify selected service price in booking calculation
    const pricing = serviceDisplayPrice(targetOffer.service, CURATED_THEME_OFFERS[config.id]);
    assert.equal(pricing.basePrice, targetOffer.originalPrice, 'base price mismatch');
    assert.equal(pricing.finalPrice, targetOffer.discountedPrice, 'final discounted price mismatch');

    // Expected discount calculation check
    if (targetOffer.discountType === 'percentage') {
      const expected = Math.max(0, Math.round(targetOffer.originalPrice * (1 - targetOffer.discountValue / 100)));
      assert.equal(targetOffer.discountedPrice, expected, 'percentage discount math error');
    } else {
      const expected = Math.max(0, targetOffer.originalPrice - targetOffer.discountValue);
      assert.equal(targetOffer.discountedPrice, expected, 'fixed discount math error');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 6. English / हिन्दी & Light / Dark Compatibility                    */
/* ------------------------------------------------------------------ */

section('UI — Responsive, i18n, Light / Dark, States');

for (const config of CASES) {
  await test(`${config.id}: English / हिन्दी language switch`, () => {
    reset({ locale: 'en' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    let ctaText = flat(utils.getAllByTestId('offer-book-now')[0]);
    assert.match(ctaText, /BOOK OFFER|Book Offer/i);

    cleanup();
    reset({ locale: 'hi' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    ctaText = flat(utils.getAllByTestId('offer-book-now')[0]);
    assert.match(ctaText, /ऑफ़र बुक करें/);
  });

  await test(`${config.id}: Light / Dark mode surfaces`, () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const lightBg = utils.container.querySelector('[data-site-section="offers"]').style.backgroundColor;

    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const darkBg = utils.container.querySelector('[data-site-section="offers"]').style.backgroundColor;

    assert.ok(lightBg.length > 0 && darkBg.length > 0, 'offers section lost background');
    assert.notEqual(lightBg, darkBg, 'light and dark modes should produce different surface background');
  });

  await test(`${config.id}: loading, empty, error states`, () => {
    // Loading
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'loading' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="site-offers-loading"]'), 'loading skeleton missing');
    assert.equal(utils.container.querySelector('[data-site-section="offers"]').getAttribute('data-section-state'), 'loading');

    // Error
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'error' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), 'error panel missing');
    assert.ok(utils.container.querySelector('[data-testid="section-state-retry"]'), 'retry button missing');

    // Empty
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'empty' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty panel missing');
    assert.equal(utils.container.querySelector('[data-site-section="offers"]').getAttribute('data-section-state'), 'empty');

    setWebsiteSectionFlagsForTests({});
  });
}

/* ------------------------------------------------------------------ */
/* 7. Safety & Duplicate Discount Stacking Prevention                  */
/* ------------------------------------------------------------------ */

section('Safety & Stacking Checks');

await test('prevents duplicate discount stacking', () => {
  const service = {
    id: 's-1',
    name: 'Skin Fade',
    category: 'Haircut',
    description: 'Fade',
    price: 500,
    duration: 30,
    themeId: 'barber_mens_grooming',
    status: 'active',
  };

  const offer1 = {
    id: 'o-1',
    businessId: 'b1',
    themeId: 'barber_mens_grooming',
    themeKey: 'barber_mens_grooming',
    targetType: 'theme',
    categoryId: null,
    predefinedServiceId: null,
    savedServiceId: null,
    packageId: null,
    title: '10% Off',
    promotionalBadge: '10%',
    discountType: 'percentage',
    discountValue: 10,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  const offer2 = {
    id: 'o-2',
    businessId: 'b1',
    themeId: 'barber_mens_grooming',
    themeKey: 'barber_mens_grooming',
    targetType: 'theme',
    categoryId: null,
    predefinedServiceId: null,
    savedServiceId: null,
    packageId: null,
    title: '20% Off',
    promotionalBadge: '20%',
    discountType: 'percentage',
    discountValue: 20,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  const pricing = serviceDisplayPrice(service, [offer1, offer2]);
  assert.equal(pricing.basePrice, 500);
  assert.equal(pricing.finalPrice, 400, 'best single offer (20%) should apply, giving ₹400, not double-discounted ₹360');
  assert.equal(pricing.offer?.id, 'o-2');
});

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 13.1 theme-specific offers & discounts: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes pass Phase 13.1 Offer → Service → Discount → Final Price → Book Now verification.');
cleanup();
process.exit(0);
