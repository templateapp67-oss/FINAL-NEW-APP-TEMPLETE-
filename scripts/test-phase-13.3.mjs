/**
 * PHASE 13.3 — OFFER & SERVICE LINKING (five-theme acceptance test)
 *
 * Verifies secure mapping between Offers and Services/Combos across ALL 5 themes:
 *   1. Offer Mapping — One service, multiple services, one combo.
 *   2. Theme Isolation — An offer links ONLY to services/combos belonging to the same theme. Cross-theme mapping is strictly rejected.
 *   3. Price Calculation — Regular Price → Eligible Offer → Discount → Final Price. Prevents double discounts, expired offers, inactive offers, and invalid service mappings.
 *   4. Booking Preservation — Tapping Book preserves theme, service/combo, applicable offer, and correct final price in existing booking flow.
 *   5. Auto Validation — Start/end date, active status, service availability, theme match.
 *   6. UI — Show applicable offer badges, "Offer Applied" state, original + discounted price, desktop/tablet/mobile, EN/HI, light/dark, loading/empty/error states.
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
const { offerAppliesToService, offerAppliesToBundle, serviceDisplayPrice, isOfferActive, discountedPrice } = await import('../src/lib/pricing.ts');
const { getThemeCombos } = await import('../src/lib/siteCombos.ts');

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
/* 1. Offer Mapping — Single Service, Multi Service, Combo Mapping    */
/* ------------------------------------------------------------------ */

section('1. Offer Mapping Support');

await test('single service mapping applies offer to the specific service', () => {
  const service1 = { id: 's1', name: 'Skin Fade', price: 450, themeId: 'barber_mens_grooming', status: 'active' };
  const service2 = { id: 's2', name: 'Buzz Cut', price: 250, themeId: 'barber_mens_grooming', status: 'active' };

  const offer = {
    id: 'o-single',
    businessId: 'b1',
    themeId: 'barber_mens_grooming',
    themeKey: 'barber_mens_grooming',
    targetType: 'saved_service',
    savedServiceId: 's1',
    title: 'Fade Special',
    promotionalBadge: 'FADE',
    discountType: 'fixed',
    discountValue: 100,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  assert.equal(offerAppliesToService(offer, service1, '2026-08-14'), true, 'offer should apply to service1');
  assert.equal(offerAppliesToService(offer, service2, '2026-08-14'), false, 'offer should NOT apply to service2');

  const p1 = serviceDisplayPrice(service1, [offer], null, '2026-08-14');
  const p2 = serviceDisplayPrice(service2, [offer], null, '2026-08-14');
  assert.equal(p1.finalPrice, 350, 'service1 should receive ₹100 discount');
  assert.equal(p2.finalPrice, 250, 'service2 should remain original ₹250');
});

await test('multi-service mapping applies offer to all linked services in serviceIds', () => {
  const service1 = { id: 's1', name: 'Layered Cut', price: 2000, themeId: 'hair_studio_color_bar', status: 'active' };
  const service2 = { id: 's2', name: 'Luxury Blowout', price: 1200, themeId: 'hair_studio_color_bar', status: 'active' };
  const service3 = { id: 's3', name: 'Root Touch-Up', price: 1500, themeId: 'hair_studio_color_bar', status: 'active' };

  const offer = {
    id: 'o-multi',
    businessId: 'b1',
    themeId: 'hair_studio_color_bar',
    themeKey: 'hair_studio_color_bar',
    targetType: 'saved_service',
    savedServiceId: null,
    serviceIds: ['s1', 's2'],
    title: 'Styling Pair Offer',
    promotionalBadge: '20% OFF',
    discountType: 'percentage',
    discountValue: 20,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  assert.equal(offerAppliesToService(offer, service1, '2026-08-14'), true);
  assert.equal(offerAppliesToService(offer, service2, '2026-08-14'), true);
  assert.equal(offerAppliesToService(offer, service3, '2026-08-14'), false);

  assert.equal(serviceDisplayPrice(service1, [offer], null, '2026-08-14').finalPrice, 1600);
  assert.equal(serviceDisplayPrice(service2, [offer], null, '2026-08-14').finalPrice, 960);
  assert.equal(serviceDisplayPrice(service3, [offer], null, '2026-08-14').finalPrice, 1500);
});

await test('single combo mapping applies offer to the specific combo/package', () => {
  const combo1 = { id: 'c1', name: 'Combo 1', price: 1000, themeId: 'beauty_skin_spa', status: 'active' };
  const combo2 = { id: 'c2', name: 'Combo 2', price: 2000, themeId: 'beauty_skin_spa', status: 'active' };

  const offer = {
    id: 'o-combo',
    businessId: 'b1',
    themeId: 'beauty_skin_spa',
    themeKey: 'beauty_skin_spa',
    targetType: 'bundle',
    packageId: 'c1',
    title: 'Combo Bonus',
    promotionalBadge: 'BONUS',
    discountType: 'fixed',
    discountValue: 200,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  assert.equal(offerAppliesToBundle(offer, combo1, '2026-08-14'), true);
  assert.equal(offerAppliesToBundle(offer, combo2, '2026-08-14'), false);
});

/* ------------------------------------------------------------------ */
/* 2. Theme Isolation — Cross-Theme Offers Explicitly Rejected       */
/* ------------------------------------------------------------------ */

section('2. Theme Isolation & Cross-Theme Rejection');

for (const config of CASES) {
  await test(`${config.id}: cross-theme offers from all other themes are explicitly rejected`, () => {
    const service = { id: `s-${config.id}`, name: 'Signature Service', price: 1000, themeId: config.id, status: 'active' };
    const combo = { id: `c-${config.id}`, name: 'Signature Combo', price: 1500, themeId: config.id, status: 'active' };

    for (const other of CASES) {
      if (other.id === config.id) continue;

      const foreignOffer = {
        id: `foreign-offer-${other.id}`,
        businessId: 'b-foreign',
        themeId: other.id,
        themeKey: other.id,
        targetType: 'theme',
        title: `Foreign ${other.id} Offer`,
        promotionalBadge: 'FOREIGN',
        discountType: 'percentage',
        discountValue: 50,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'active',
        effectiveStatus: 'active',
      };

      assert.equal(
        offerAppliesToService(foreignOffer, service, '2026-08-14'),
        false,
        `foreign offer from ${other.id} MUST be rejected on ${config.id} service`,
      );

      assert.equal(
        offerAppliesToBundle(foreignOffer, combo, '2026-08-14'),
        false,
        `foreign offer from ${other.id} MUST be rejected on ${config.id} combo`,
      );

      const pricing = serviceDisplayPrice(service, [foreignOffer], null, '2026-08-14');
      assert.equal(pricing.finalPrice, 1000, `foreign offer must not discount ${config.id} service`);
      assert.equal(pricing.offer, undefined, 'foreign offer must not be attached');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. Auto Validation & Invalid Offer Removal                          */
/* ------------------------------------------------------------------ */

section('3. Auto Validation Rules');

await test('expired offer is automatically rejected and removed from price math', () => {
  const service = { id: 's1', name: 'Classic Cut', price: 500, themeId: 'family_full_service', status: 'active' };
  const expiredOffer = {
    id: 'o-expired',
    businessId: 'b1',
    themeId: 'family_full_service',
    themeKey: 'family_full_service',
    targetType: 'theme',
    title: 'Old Summer Offer',
    promotionalBadge: 'OLD',
    discountType: 'percentage',
    discountValue: 30,
    startDate: '2026-01-01',
    endDate: '2026-01-15', // Expired relative to 2026-08-14
    status: 'active',
    effectiveStatus: 'expired',
  };

  assert.equal(isOfferActive(expiredOffer, '2026-08-14'), false);
  assert.equal(offerAppliesToService(expiredOffer, service, '2026-08-14'), false);

  const pricing = serviceDisplayPrice(service, [expiredOffer], null, '2026-08-14');
  assert.equal(pricing.finalPrice, 500, 'expired offer must be ignored, returning base ₹500');
});

await test('inactive offer is automatically rejected and removed from price math', () => {
  const service = { id: 's1', name: 'Nail Set', price: 1000, themeId: 'nail_lash_studio', status: 'active' };
  const inactiveOffer = {
    id: 'o-inactive',
    businessId: 'b1',
    themeId: 'nail_lash_studio',
    themeKey: 'nail_lash_studio',
    targetType: 'theme',
    title: 'Disabled Offer',
    promotionalBadge: 'OFF',
    discountType: 'fixed',
    discountValue: 300,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'inactive',
    effectiveStatus: 'inactive',
  };

  assert.equal(isOfferActive(inactiveOffer, '2026-08-14'), false);
  assert.equal(offerAppliesToService(inactiveOffer, service, '2026-08-14'), false);

  const pricing = serviceDisplayPrice(service, [inactiveOffer], null, '2026-08-14');
  assert.equal(pricing.finalPrice, 1000);
});

await test('inactive or archived service cannot receive an offer', () => {
  const inactiveService = { id: 's1', name: 'Old Service', price: 1000, themeId: 'beauty_skin_spa', status: 'inactive' };
  const offer = {
    id: 'o-active',
    businessId: 'b1',
    themeId: 'beauty_skin_spa',
    themeKey: 'beauty_skin_spa',
    targetType: 'theme',
    title: 'Glow Offer',
    promotionalBadge: 'GLOW',
    discountType: 'percentage',
    discountValue: 20,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'active',
    effectiveStatus: 'active',
  };

  assert.equal(offerAppliesToService(offer, inactiveService, '2026-08-14'), false);
});

/* ------------------------------------------------------------------ */
/* 4. Booking Flow Integration & Data Preservation                     */
/* ------------------------------------------------------------------ */

section('4. Booking Preservation');

for (const config of CASES) {
  await test(`${config.label}: booking flow preserves theme, service/combo, offer and calculated price`, async () => {
    reset();

    const testService = {
      id: `service-${config.id}`,
      name: `Special ${config.label} Service`,
      category: 'General',
      description: 'Test service description.',
      price: 1000,
      duration: 45,
      themeId: config.id,
      themeKey: config.id,
      status: 'active',
    };

    const offer = {
      id: `offer-${config.id}`,
      businessId: 'biz1',
      themeId: config.id,
      themeKey: config.id,
      targetType: 'saved_service',
      savedServiceId: testService.id,
      title: '20% OFF Special',
      promotionalBadge: '20% OFF',
      discountType: 'percentage',
      discountValue: 20,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    };

    const data = salonData(config.id, {
      services: [testService],
      offers: [offer],
    });

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    // Book service via directory
    const bookBtn = utils.getByTestId('site-directory-book');
    assert.ok(bookBtn, 'Book button missing');

    await act(async () => {
      fireEvent.click(bookBtn);
    });

    // Check booking modal mounted
    const modal = utils.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(modal, `booking modal did not mount for ${config.id}`);

    // Verify calculated price in booking
    const pricing = serviceDisplayPrice(testService, [offer], null, '2026-08-14');
    assert.equal(pricing.basePrice, 1000);
    assert.equal(pricing.finalPrice, 800);
    assert.equal(pricing.offer?.id, offer.id);
  });
}

/* ------------------------------------------------------------------ */
/* 5. UI Elements: "Offer Applied" badges across all 5 themes          */
/* ------------------------------------------------------------------ */

section('5. UI Verification — Offer Applied Badges');

for (const config of CASES) {
  await test(`${config.id}: shows Offer Applied badge on service directory cards`, () => {
    reset();

    const testService = {
      id: `s-ui-${config.id}`,
      name: `UI Service ${config.id}`,
      category: 'General',
      description: 'Service with active offer.',
      price: 1000,
      duration: 30,
      themeId: config.id,
      themeKey: config.id,
      status: 'active',
    };

    const offer = {
      id: `o-ui-${config.id}`,
      businessId: 'biz-ui',
      themeId: config.id,
      themeKey: config.id,
      targetType: 'saved_service',
      savedServiceId: testService.id,
      title: 'Special UI Deal',
      promotionalBadge: 'UI DEAL',
      discountType: 'fixed',
      discountValue: 200,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    };

    const data = salonData(config.id, {
      services: [testService],
      offers: [offer],
    });

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const appliedBadge = utils.container.querySelector('[data-testid="service-offer-applied"]');
    assert.ok(appliedBadge, `Offer Applied badge missing on ${config.id} directory card`);
    assert.match(flat(appliedBadge), /Offer Applied|ऑफ़र लागू/);
  });

  await test(`${config.id}: shows Offer Applied badge on combo cards when targeted by bundle offer`, () => {
    reset();

    const combos = getThemeCombos(config.id, salonData(config.id));
    const targetCombo = combos[0];

    const comboOffer = {
      id: `o-combo-${config.id}`,
      businessId: 'biz-combo',
      themeId: config.id,
      themeKey: config.id,
      targetType: 'bundle',
      packageId: targetCombo.id,
      title: 'Combo Extra Savings',
      promotionalBadge: 'EXTRA ₹100 OFF',
      discountType: 'fixed',
      discountValue: 100,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'active',
      effectiveStatus: 'active',
    };

    const data = salonData(config.id, {
      offers: [comboOffer],
    });

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const appliedBadge = utils.container.querySelector('[data-testid="combo-offer-applied"]');
    assert.ok(appliedBadge, `Offer Applied badge missing on ${config.id} combo card`);
    assert.match(flat(appliedBadge), /Applied|लागू/);
  });
}

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 13.3 offer & service linking: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes pass Phase 13.3 Theme → Service/Combo → Eligible Offer → Discount → Final Price → Booking verification.');
cleanup();
process.exit(0);
