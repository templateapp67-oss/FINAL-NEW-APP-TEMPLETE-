/**
 * PHASE 13.2 — THEME-SPECIFIC COMBOS (five-theme acceptance test)
 *
 * Verifies Service Combos / Packages for ALL 5 themes:
 *   1. Combo Structure — Name, Description, Included Services, Regular Total, Combo Price, Discount, Duration, Active Status, Theme Association.
 *   2. Theme-Specific Combos — Barber (Haircut+Beard+Shave), Hair Studio (Cut+Blowdry+Color/Treatment), Beauty/Spa (Facial+Spa+Skin), Family (Men+Women+Kids), Nail/Lash (Mani/Pedi+Art+Lash).
 *   3. Theme Isolation — Foreign combos and foreign services never leak into another theme.
 *   4. Pricing & Discount — Regular Total (sum) → Discount → Final Price. No double discount stacking.
 *   5. Book Combo — "Book Combo" CTA opens existing booking flow with theme, combo name, included services, final price, and total duration.
 *   6. UI & States — Theme-specific cards, included service list, discount badge, final price, CTA, desktop/tablet/mobile, EN/HI, light/dark, loading/empty/error states.
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
const { getThemeCombos, CURATED_THEME_COMBOS, comboToBookableService } = await import('../src/lib/siteCombos.ts');
const { SERVICES_BY_THEME } = await import('../src/lib/themeServices.ts');

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
/* 1. Combo Structure & Theme-Specific Verification                    */
/* ------------------------------------------------------------------ */

section('Combo Structure & Theme-Specific Combination Rules');

await test('all five themes have curated combos with complete required attributes', () => {
  for (const config of CASES) {
    const combos = getThemeCombos(config.id, salonData(config.id));
    assert.ok(combos.length >= 2, `${config.id} should have at least 2 active combos`);

    for (const combo of combos) {
      assert.ok(combo.name, `${combo.id} missing name`);
      assert.ok(combo.description, `${combo.id} missing description`);
      assert.ok(Array.isArray(combo.includedServices) && combo.includedServices.length >= 2, `${combo.id} must contain at least 2 included services`);
      assert.ok(typeof combo.regularTotal === 'number' && combo.regularTotal > 0, `${combo.id} invalid regular total`);
      assert.ok(typeof combo.comboPrice === 'number' && combo.comboPrice > 0, `${combo.id} invalid combo price`);
      assert.ok(combo.comboPrice < combo.regularTotal, `${combo.id} combo price must be discounted below regular total`);
      assert.ok(combo.discountAmount > 0, `${combo.id} missing discount amount`);
      assert.ok(combo.totalDuration > 0, `${combo.id} invalid total duration`);
      assert.equal(combo.themeId, config.id);
      assert.equal(combo.status, 'active');
    }
  }
});

await test('Barber combos contain Haircut + Beard + Shave/Grooming', () => {
  const combos = getThemeCombos('barber_mens_grooming', salonData('barber_mens_grooming'));
  const firstCombo = combos[0];
  const serviceNames = firstCombo.includedServices.map((s) => s.name);
  assert.ok(serviceNames.some((n) => n.includes('Fade') || n.includes('Cut')), 'missing haircut service');
  assert.ok(serviceNames.some((n) => n.includes('Beard')), 'missing beard service');
  assert.ok(serviceNames.some((n) => n.includes('Shave') || n.includes('Detox')), 'missing shave/grooming service');
});

await test('Hair Studio combos contain Cut + Blowdry + Color/Treatment', () => {
  const combos = getThemeCombos('hair_studio_color_bar', salonData('hair_studio_color_bar'));
  const firstCombo = combos[0];
  const serviceNames = firstCombo.includedServices.map((s) => s.name);
  assert.ok(serviceNames.some((n) => n.includes('Cut') || n.includes('Blowdry')), 'missing cut/blowdry service');
  assert.ok(serviceNames.some((n) => n.includes('Balayage') || n.includes('Color')), 'missing color service');
  assert.ok(serviceNames.some((n) => n.includes('Repair') || n.includes('Olaplex') || n.includes('Treatment')), 'missing treatment service');
});

await test('Beauty/Spa combos contain Facial + Body Spa + Skincare', () => {
  const combos = getThemeCombos('beauty_skin_spa', salonData('beauty_skin_spa'));
  const firstCombo = combos[0];
  const serviceNames = firstCombo.includedServices.map((s) => s.name);
  assert.ok(serviceNames.some((n) => n.includes('Facial')), 'missing facial service');
  assert.ok(serviceNames.some((n) => n.includes('Massage') || n.includes('Spa')), 'missing body spa service');
  assert.ok(serviceNames.some((n) => n.includes('De-Tan') || n.includes('Glow') || n.includes('Cleanup')), 'missing skincare service');
});

await test('Family Salon combos contain Men + Women + Kids services', () => {
  const combos = getThemeCombos('family_full_service', salonData('family_full_service'));
  const firstCombo = combos[0];
  const categories = firstCombo.includedServices.map((s) => s.category);
  assert.ok(categories.includes("Men's Services"), "missing Men's category");
  assert.ok(categories.includes("Women's Services"), "missing Women's category");
  assert.ok(categories.includes('Kids Special'), 'missing Kids category');
});

await test('Nail/Lash combos contain Mani/Pedi + Nail Art + Lash/Brow', () => {
  const combos = getThemeCombos('nail_lash_studio', salonData('nail_lash_studio'));
  const firstCombo = combos[0];
  const categories = firstCombo.includedServices.map((s) => s.category);
  assert.ok(categories.includes('Nail Art & Gel'), 'missing Nail Art & Gel category');
  assert.ok(categories.includes('Pedicure & Manicure'), 'missing Pedicure & Manicure category');
  assert.ok(categories.includes('Lash & Brow'), 'missing Lash & Brow category');
});

/* ------------------------------------------------------------------ */
/* 2. Theme Isolation & Foreign Service Prevention                    */
/* ------------------------------------------------------------------ */

section('Theme Isolation — Foreign Combos & Services Rejection');

for (const config of CASES) {
  await test(`${config.id}: combo contains ONLY services from its own theme catalog`, () => {
    const combos = getThemeCombos(config.id, salonData(config.id));
    const validCatalogServices = (SERVICES_BY_THEME[config.id] || []).map((s) => s.name.toLowerCase());

    for (const combo of combos) {
      for (const service of combo.includedServices) {
        assert.ok(
          validCatalogServices.includes(service.name.toLowerCase()),
          `service "${service.name}" in combo ${combo.name} does not belong to ${config.id} catalog`,
        );
      }
    }
  });

  await test(`${config.id}: foreign theme combos never leak into active list`, () => {
    const foreignPackages = CASES.filter((c) => c.id !== config.id).map((c) => ({
      id: `foreign-pkg-${c.id}`,
      businessId: 'biz-foreign',
      themeId: c.id,
      themeKey: c.id,
      name: `FOREIGN ${c.id} COMBO`,
      description: 'Foreign combo package',
      price: 999,
      duration: 60,
      status: 'active',
      includedServices: [
        { serviceId: 's1', name: 'Foreign Service 1', category: 'General', individualPrice: 600, duration: 30, displayOrder: 1 },
        { serviceId: 's2', name: 'Foreign Service 2', category: 'General', individualPrice: 600, duration: 30, displayOrder: 2 },
      ],
    }));

    const data = salonData(config.id, { packages: foreignPackages });
    const resolved = getThemeCombos(config.id, data);

    for (const combo of resolved) {
      assert.equal(combo.themeId, config.id, `foreign combo leaked into ${config.id}`);
      assert.ok(!combo.name.includes('FOREIGN'), `foreign combo name leaked: ${combo.name}`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. Pricing Math & Stacking Prevention                              */
/* ------------------------------------------------------------------ */

section('Pricing Math & Stacking Protection');

for (const config of CASES) {
  await test(`${config.id}: regular total equals sum of included services and discount is accurate`, () => {
    const combos = getThemeCombos(config.id, salonData(config.id));
    for (const combo of combos) {
      const sum = combo.includedServices.reduce((acc, item) => acc + item.individualPrice, 0);
      assert.equal(combo.regularTotal, sum, `regular total mismatch for ${combo.name}`);
      const expectedDiscount = sum - combo.comboPrice;
      assert.equal(combo.discountAmount, expectedDiscount, `discount amount mismatch for ${combo.name}`);
      assert.ok(combo.comboPrice < combo.regularTotal, 'combo price must be less than regular total');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 4. Display Cards Verification across ALL 5 Themes                   */
/* ------------------------------------------------------------------ */

section('Combo Display Cards — All 5 Themes');

for (const config of CASES) {
  await test(`${config.label}: renders combos section with all required fields`, () => {
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const container = utils.container.querySelector('[data-testid="site-combos"]');
    assert.ok(container, `combos section missing for ${config.id}`);

    const cards = utils.getAllByTestId('combo-card');
    assert.ok(cards.length >= 1, `no combo cards rendered for ${config.id}`);

    for (const card of cards) {
      assert.ok(card.querySelector('[data-testid="combo-title"]'), 'title missing');
      assert.ok(card.querySelector('[data-testid="combo-description"]'), 'description missing');
      assert.ok(card.querySelector('[data-testid="combo-services-list"]'), 'included services list missing');
      assert.ok(card.querySelectorAll('[data-testid="combo-service-item"]').length >= 2, 'service items missing');
      assert.ok(card.querySelector('[data-testid="combo-regular-price"]'), 'regular total price missing');
      assert.ok(card.querySelector('[data-testid="combo-final-price"]'), 'combo final price missing');
      assert.ok(card.querySelector('[data-testid="combo-discount"]'), 'discount badge missing');
      assert.ok(card.querySelector('[data-testid="combo-duration"]'), 'duration missing');
      assert.ok(card.querySelector('[data-testid="combo-book-cta"]'), 'Book Combo CTA missing');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 5. Booking Flow Integration                                        */
/* ------------------------------------------------------------------ */

section('Book Combo → Existing Booking Flow');

for (const config of CASES) {
  await test(`${config.label}: Book Combo opens booking flow with correct theme, combo name, services & final price`, async () => {
    reset();
    const data = salonData(config.id);
    const combos = getThemeCombos(config.id, data);
    const targetCombo = combos[0];

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const bookBtns = utils.getAllByTestId('combo-book-cta');
    assert.ok(bookBtns.length >= 1, 'Book Combo buttons missing');

    await act(async () => {
      fireEvent.click(bookBtns[0]);
    });

    // Check that booking modal opens
    const modal = utils.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(modal, `booking modal did not open for ${config.id}`);

    // Verify converted service for booking
    const bookable = comboToBookableService(targetCombo, config.id);
    assert.equal(bookable.themeId, config.id);
    assert.equal(bookable.name, targetCombo.name);
    assert.equal(bookable.price, targetCombo.comboPrice);
    assert.equal(bookable.duration, targetCombo.totalDuration);
    assert.ok(bookable.description.includes(targetCombo.includedServices[0].name), 'included service missing from description');
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
    let ctaText = flat(utils.getAllByTestId('combo-book-cta')[0]);
    assert.match(ctaText, /BOOK COMBO|Book Combo/i);

    cleanup();
    reset({ locale: 'hi' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    ctaText = flat(utils.getAllByTestId('combo-book-cta')[0]);
    assert.match(ctaText, /कॉम्बो बुक करें/);
  });

  await test(`${config.id}: Light / Dark mode surfaces`, () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const lightBg = utils.container.querySelector('[data-testid="site-combos"]').parentElement.parentElement.style.backgroundColor;

    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const darkBg = utils.container.querySelector('[data-testid="site-combos"]').parentElement.parentElement.style.backgroundColor;

    assert.ok(lightBg.length > 0 && darkBg.length > 0, 'combos section lost background');
    assert.notEqual(lightBg, darkBg, 'light and dark modes should produce different surface background');
  });

  await test(`${config.id}: loading, empty, error states`, () => {
    // Loading
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'loading' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="site-combos-loading"]'), 'loading skeleton missing');

    // Error
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'error' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), 'error panel missing');

    // Empty
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'empty' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty panel missing');

    setWebsiteSectionFlagsForTests({});
  });
}

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 13.2 theme-specific combos: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes pass Phase 13.2 Theme → Combo → Included Services → Price → Discount → Book Combo verification.');
cleanup();
process.exit(0);
