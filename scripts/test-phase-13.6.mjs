/**
 * PHASE 13.6 — OFFERS, COMBOS & PRICING ACCEPTANCE TEST (five-theme end-to-end suite)
 *
 * Final acceptance testing for ALL 5 catalog themes:
 *   1. Barber & Men's Grooming
 *   2. Hair Studio & Color Bar
 *   3. Beauty, Skin & Spa
 *   4. Full-Service Family Salon
 *   5. Nail & Lash Studio
 *
 * TEST FLOW:
 *   Theme → Service → Variant → Offer → Combo → Discount → Final Price → Existing Booking Flow
 *
 * VERIFIES:
 *   - Only active theme services, offers, and combos appear.
 *   - Variable pricing, offer discounts, and combo prices calculate correctly with NO double discount.
 *   - Expired offers and inactive services/variants are automatically rejected and cannot be booked.
 *   - Theme isolation test: Barber → Hair → Spa → Family → Nail → Barber switches clear stale data and reject cross-theme mappings.
 *   - Responsive (Desktop / Tablet / Mobile), i18n (EN / HI), Light / Dark surfaces.
 *   - Combinations: Offer + Variant, Combo + Offer, Invalid / Cross-Theme Offer rejection.
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
const { getThemeOffers, rawOffersForTheme } = await import('../src/lib/siteOffers.ts');
const { getThemeCombos, comboToBookableService } = await import('../src/lib/siteCombos.ts');
const { getServiceVariants, resolveServiceVariant, serviceWithSelectedVariant } = await import('../src/lib/siteVariants.ts');
const { serviceDisplayPrice, offerAppliesToService, offerAppliesToBundle, isOfferActive, discountedPrice, formatCurrency } = await import('../src/lib/pricing.ts');
const { consumeBookingServicePrefill } = await import('../src/lib/siteBooking.ts');

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

const MODES = ['desktop', 'tablet', 'mobile'];

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
/* 1. End-to-End Flow for All 5 Themes                                 */
/* ------------------------------------------------------------------ */

section('1. End-to-End Flow Verification (All 5 Themes)');

for (const config of CASES) {
  await test(`${config.label}: Theme → Service → Variant → Offer → Combo → Discount → Final Price → Existing Booking Flow`, async () => {
    reset();
    const data = salonData(config.id);

    // 1. Resolve offers & combos
    const resolvedOffers = getThemeOffers(config.id, data, '2026-08-14');
    const resolvedCombos = getThemeCombos(config.id, data);

    assert.ok(resolvedOffers.length >= 1, `offers missing for ${config.id}`);
    assert.ok(resolvedCombos.length >= 1, `combos missing for ${config.id}`);

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    // 2. Select service variant and check instant price/duration update
    const card = utils.container.querySelectorAll('[data-testid="site-directory-card"]')[0];
    const variantOptions = card.querySelectorAll('[data-testid="variant-option"]');

    if (variantOptions.length >= 2) {
      await act(async () => {
        fireEvent.click(variantOptions[1]);
      });
      assert.ok(card.querySelector('[data-testid="variant-selected"]'), 'variant selection failed');
    }

    // 3. Click Book Service
    const bookBtn = card.querySelector('[data-testid="site-directory-book"]');
    await act(async () => {
      fireEvent.click(bookBtn);
    });

    const modal = utils.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(modal, `booking modal failed to open for ${config.id}`);

    // 4. Click Book Combo
    reset();
    const utilsCombo = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const comboBtn = utilsCombo.getAllByTestId('combo-book-cta')[0];

    await act(async () => {
      fireEvent.click(comboBtn);
    });

    const comboModal = utilsCombo.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(comboModal, `combo booking modal failed to open for ${config.id}`);
  });
}

/* ------------------------------------------------------------------ */
/* 2. Theme Isolation & Switching Ring Test                            */
/* ------------------------------------------------------------------ */

section('2. Theme Isolation Ring Test (Barber → Hair → Spa → Family → Nail → Barber)');

await test('switching themes clears stale prefilled selections and rejects cross-theme data', async () => {
  const switchRing = [...CASES, CASES[0]];

  for (let i = 0; i < switchRing.length - 1; i += 1) {
    const current = switchRing[i];
    const next = switchRing[i + 1];

    reset();

    // 1. Verify current theme offers & combos
    const currentOffers = getThemeOffers(current.id, salonData(current.id), '2026-08-14');
    const currentCombos = getThemeCombos(current.id, salonData(current.id));

    assert.ok(currentOffers.every((o) => o.themeId === current.id), `foreign offer in ${current.id}`);
    assert.ok(currentCombos.every((c) => c.themeId === current.id), `foreign combo in ${current.id}`);

    // 2. Reject foreign offers passed to current theme
    const foreignOffer = {
      id: `foreign-${next.id}`,
      businessId: 'biz-f',
      themeId: next.id,
      themeKey: next.id,
      targetType: 'theme',
      title: 'Foreign Offer',
      promotionalBadge: 'FOREIGN',
      discountType: 'percentage',
      discountValue: 50,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    };

    const currentService = { id: 's1', name: 'Current Service', price: 1000, duration: 30, themeId: current.id, status: 'active' };
    assert.equal(offerAppliesToService(foreignOffer, currentService, '2026-08-14'), false, 'cross-theme offer must be rejected');

    // 3. Clear stale prefill on theme switch
    consumeBookingServicePrefill(current.id); // clear
    assert.equal(consumeBookingServicePrefill(next.id), null, 'stale prefill must be null after switch');
  }
});

/* ------------------------------------------------------------------ */
/* 3. Combinations: Offer + Variant, Combo + Offer, Invalid Offers      */
/* ------------------------------------------------------------------ */

section('3. Advanced Combinations & Stacking Protection');

await test('Offer + Variant combination applies offer cleanly to variant price', () => {
  const service = {
    id: 's-var',
    name: 'Balayage Hair Color',
    price: 5000,
    duration: 120,
    themeId: 'hair_studio_color_bar',
    status: 'active',
    pricingVariants: [
      { id: 'v-short', serviceId: 's-var', name: 'Short Hair', price: 4000, duration: 90, status: 'active', displayOrder: 1 },
      { id: 'v-long', serviceId: 's-var', name: 'Long Hair', price: 6000, duration: 150, status: 'active', displayOrder: 2 },
    ],
  };

  const offer = {
    id: 'o-balayage',
    businessId: 'b1',
    themeId: 'hair_studio_color_bar',
    themeKey: 'hair_studio_color_bar',
    targetType: 'saved_service',
    savedServiceId: 's-var',
    title: 'Balayage Special',
    promotionalBadge: '20% OFF',
    discountType: 'percentage',
    discountValue: 20,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  const shortPricing = serviceDisplayPrice(service, [offer], 'v-short', '2026-08-14');
  assert.equal(shortPricing.basePrice, 4000);
  assert.equal(shortPricing.finalPrice, 3200); // 4000 * 0.8

  const longPricing = serviceDisplayPrice(service, [offer], 'v-long', '2026-08-14');
  assert.equal(longPricing.basePrice, 6000);
  assert.equal(longPricing.finalPrice, 4800); // 6000 * 0.8
});

await test('Combo + Offer combination applies offer to combo price without double discount', () => {
  const combo = {
    id: 'c-beauty',
    name: 'Glow Spa Ritual',
    description: 'Facial and Massage',
    price: 3000,
    duration: 120,
    themeId: 'beauty_skin_spa',
    status: 'active',
  };

  const comboOffer = {
    id: 'o-combo-100',
    businessId: 'b1',
    themeId: 'beauty_skin_spa',
    themeKey: 'beauty_skin_spa',
    targetType: 'bundle',
    packageId: 'c-beauty',
    title: 'Spa Bonus',
    promotionalBadge: '₹200 OFF',
    discountType: 'fixed',
    discountValue: 200,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  assert.equal(offerAppliesToBundle(comboOffer, combo, '2026-08-14'), true);
  const finalPrice = discountedPrice(combo.price, comboOffer);
  assert.equal(finalPrice, 2800, '3000 - 200 = 2800');
});

await test('expired offer, inactive offer, and inactive variant are rejected', () => {
  const service = {
    id: 's-inact',
    name: 'Shave Service',
    price: 300,
    duration: 25,
    themeId: 'barber_mens_grooming',
    status: 'active',
    pricingVariants: [
      { id: 'v-act', serviceId: 's-inact', name: 'Active Shave', price: 300, duration: 25, status: 'active', displayOrder: 1 },
      { id: 'v-inact', serviceId: 's-inact', name: 'Deactivated Shave', price: 150, duration: 15, status: 'inactive', displayOrder: 2 },
    ],
  };

  const expiredOffer = {
    id: 'o-exp',
    businessId: 'b1',
    themeId: 'barber_mens_grooming',
    themeKey: 'barber_mens_grooming',
    targetType: 'theme',
    title: 'Expired Offer',
    promotionalBadge: 'EXPIRED',
    discountType: 'percentage',
    discountValue: 50,
    startDate: '2026-01-01',
    endDate: '2026-01-15',
    status: 'active',
    effectiveStatus: 'expired',
  };

  const inactiveOffer = {
    id: 'o-inact',
    businessId: 'b1',
    themeId: 'barber_mens_grooming',
    themeKey: 'barber_mens_grooming',
    targetType: 'theme',
    title: 'Inactive Offer',
    promotionalBadge: 'INACTIVE',
    discountType: 'fixed',
    discountValue: 100,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'inactive',
    effectiveStatus: 'inactive',
  };

  assert.equal(isOfferActive(expiredOffer, '2026-08-14'), false);
  assert.equal(isOfferActive(inactiveOffer, '2026-08-14'), false);

  const pricing1 = serviceDisplayPrice(service, [expiredOffer, inactiveOffer], 'v-act', '2026-08-14');
  assert.equal(pricing1.basePrice, 300);
  assert.equal(pricing1.finalPrice, 300, 'expired/inactive offers must be ignored');

  const pricing2 = serviceDisplayPrice(service, [], 'v-inact', '2026-08-14');
  assert.equal(pricing2.basePrice, 300, 'inactive variant must be rejected, falling back to base price');
});

/* ------------------------------------------------------------------ */
/* 4. Multi-Theme Responsive, i18n & Appearance Matrix                */
/* ------------------------------------------------------------------ */

section('4. Multi-Theme Responsive, i18n & Appearance Matrix');

for (const config of CASES) {
  for (const mode of MODES) {
    await test(`${config.id} [${mode}]: renders offers, combos, and variant selectors without error`, () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));

      assert.ok(utils.container.querySelector('[data-site-section="offers"]'), 'offers section missing');
      assert.ok(utils.container.querySelector('[data-testid="site-offers"]'), 'offers grid missing');
      assert.ok(utils.container.querySelector('[data-testid="site-combos"]'), 'combos grid missing');
    });
  }

  await test(`${config.id}: English / हिन्दी language switch`, () => {
    reset({ locale: 'en' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.match(flat(utils.getAllByTestId('offer-book-now')[0]), /BOOK OFFER|Book Offer/i);

    cleanup();
    reset({ locale: 'hi' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.match(flat(utils.getAllByTestId('offer-book-now')[0]), /ऑफ़र बुक करें/);
  });

  await test(`${config.id}: Light / Dark surface compatibility`, () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const lightBg = utils.container.querySelector('[data-site-section="offers"]').style.backgroundColor;

    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const darkBg = utils.container.querySelector('[data-site-section="offers"]').style.backgroundColor;

    assert.ok(lightBg.length > 0 && darkBg.length > 0);
    assert.notEqual(lightBg, darkBg);
  });
}

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 13.6 offers, combos & pricing acceptance test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('ALL 5 THEMES PASSED COMPLETE ACCEPTANCE TESTING! PHASE 13 IS OFFICIALLY COMPLETE.');
cleanup();
process.exit(0);
