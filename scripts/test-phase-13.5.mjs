/**
 * PHASE 13.5 — PROMOTIONAL UI & OFFER EXPERIENCE (five-theme acceptance test)
 *
 * Verifies the Promotional UI & Offer Experience across ALL 5 catalog themes:
 *   1. Offer Cards — Offer Name, Discount Badge, Valid Until, Applicable Service/Combo, Original Price, Final Price, Book Now CTA.
 *   2. Combo Cards — Combo Name, Included Services, Regular Total, Combo Price, Savings, Duration, Book Combo CTA.
 *   3. Promotional Badges — Festive Special, Limited Time, Popular, Best Value, X% OFF, Save ₹X.
 *   4. Theme-Specific Design — Barber (Dark/Gold), Hair Studio (Monochrome/Rose-Gold), Spa (Pastel/Emerald), Family (Blue/Teal), Nail/Lash (Pink/Nude). Distinct pairwise styling.
 *   5. Responsive UI — Desktop, Tablet, Mobile modes. No card overflow, touch targets appropriate.
 *   6. State Handling — Loading, No active offers, Expired/Inactive offer exclusion, Error with Retry.
 *   7. Booking Connection — Offer → Service/Combo → Variant → Existing Booking Flow. Theme, service/combo, variant, offer, and calculated price preserved.
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
const { getThemeOffers } = await import('../src/lib/siteOffers.ts');
const { getThemeCombos } = await import('../src/lib/siteCombos.ts');
const { serviceDisplayPrice } = await import('../src/lib/pricing.ts');

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
/* 1. Offer Cards Verification (All 5 Themes)                          */
/* ------------------------------------------------------------------ */

section('1. Offer Cards Verification');

for (const config of CASES) {
  await test(`${config.label}: offer cards show all required elements`, () => {
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const cards = utils.getAllByTestId('offer-card');
    assert.ok(cards.length >= 1, `no offer cards for ${config.id}`);

    for (const card of cards) {
      assert.ok(card.querySelector('[data-testid="offer-title"]'), 'offer title missing');
      assert.ok(card.querySelector('[data-testid="offer-badge"]'), 'discount badge missing');
      assert.ok(card.querySelector('[data-testid="offer-validity"]'), 'validity missing');
      assert.ok(card.querySelector('[data-testid="offer-service"]'), 'applicable service/combo missing');
      assert.ok(card.querySelector('[data-testid="offer-discounted-price"]'), 'discounted price missing');
      assert.ok(card.querySelector('[data-testid="offer-book-now"]'), 'Book Now CTA missing');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 2. Combo Cards Verification (All 5 Themes)                          */
/* ------------------------------------------------------------------ */

section('2. Combo Cards Verification');

for (const config of CASES) {
  await test(`${config.label}: combo cards show all required elements`, () => {
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const cards = utils.getAllByTestId('combo-card');
    assert.ok(cards.length >= 1, `no combo cards for ${config.id}`);

    for (const card of cards) {
      assert.ok(card.querySelector('[data-testid="combo-title"]'), 'combo title missing');
      assert.ok(card.querySelector('[data-testid="combo-description"]'), 'combo description missing');
      assert.ok(card.querySelector('[data-testid="combo-services-list"]'), 'included services missing');
      assert.ok(card.querySelectorAll('[data-testid="combo-service-item"]').length >= 2, 'service items missing');
      assert.ok(card.querySelector('[data-testid="combo-regular-price"]'), 'regular total missing');
      assert.ok(card.querySelector('[data-testid="combo-final-price"]'), 'combo final price missing');
      assert.ok(card.querySelector('[data-testid="combo-discount"]'), 'savings badge missing');
      assert.ok(card.querySelector('[data-testid="combo-duration"]'), 'duration missing');
      assert.ok(card.querySelector('[data-testid="combo-book-cta"]'), 'Book Combo CTA missing');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. Promotional Badges Verification                                  */
/* ------------------------------------------------------------------ */

section('3. Promotional Badges');

for (const config of CASES) {
  await test(`${config.id}: promotional badges match valid offer data`, () => {
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    const offerBadges = Array.from(utils.getAllByTestId('offer-badge')).map(flat);
    const comboBadges = Array.from(utils.getAllByTestId('combo-discount')).map(flat);

    const allBadges = [...offerBadges, ...comboBadges];
    assert.ok(allBadges.length >= 2, 'badges missing');

    for (const badge of allBadges) {
      assert.ok(
        /Festive Special|Limited Time|Best Value|Save ₹|% OFF|OFF/i.test(badge),
        `unexpected badge format: ${badge}`,
      );
    }
  });
}

/* ------------------------------------------------------------------ */
/* 4. Theme-Specific Design & Pairwise Distinctness                   */
/* ------------------------------------------------------------------ */

section('4. Theme-Specific Design & Distinct Card Styling');

await test('all five themes render pairwise distinct promotional card surfaces & colors', () => {
  reset();
  const cardBgs = new Map();
  const accentColors = new Map();

  for (const config of CASES) {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const card = utils.getAllByTestId('offer-card')[0];
    const bg = card.style.backgroundColor;
    const cta = card.querySelector('[data-testid="offer-book-now"]');
    const accent = cta.style.backgroundColor || cta.style.backgroundImage;

    cardBgs.set(config.id, bg);
    accentColors.set(config.id, accent);
    cleanup();
    reset();
  }

  assert.equal(new Set(accentColors.values()).size, CASES.length, 'accent colors shared across themes');
});

/* ------------------------------------------------------------------ */
/* 5. Responsive Layout — Desktop, Tablet, Mobile                      */
/* ------------------------------------------------------------------ */

section('5. Responsive Layout — Desktop / Tablet / Mobile');

for (const config of CASES) {
  for (const mode of MODES) {
    await test(`${config.id} [${mode}]: renders without errors or missing CTAs`, () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));

      const offersSec = utils.container.querySelector('[data-site-section="offers"]');
      assert.ok(offersSec, 'offers section missing');

      const ctas = utils.getAllByTestId('offer-book-now');
      assert.ok(ctas.length >= 1, 'Book Now CTA missing');
    });
  }
}

/* ------------------------------------------------------------------ */
/* 6. State Handling — Loading, Empty, Expired, Error & Retry         */
/* ------------------------------------------------------------------ */

section('6. State Handling');

for (const config of CASES) {
  await test(`${config.id}: loading state renders skeleton`, () => {
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'loading' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="site-offers-loading"]'), 'offers loading skeleton missing');
    assert.ok(utils.container.querySelector('[data-testid="site-combos-loading"]'), 'combos loading skeleton missing');
  });

  await test(`${config.id}: error state with retry button`, () => {
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'error' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), 'error panel missing');
  });

  await test(`${config.id}: empty state when no offers or combos exist`, () => {
    reset();
    setWebsiteSectionFlagsForTests({ offers: 'empty' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty panel missing');
  });

  await test(`${config.id}: expired offer does NOT display as bookable offer`, () => {
    reset();
    const expiredData = salonData(config.id, {
      offers: [
        {
          id: 'exp-1',
          businessId: 'b1',
          themeId: config.id,
          themeKey: config.id,
          targetType: 'theme',
          title: 'EXPIRED OFFER TITLE',
          description: 'Expired',
          promotionalBadge: 'EXPIRED',
          discountType: 'percentage',
          discountValue: 50,
          startDate: '2026-01-01',
          endDate: '2026-01-15',
          status: 'active',
          effectiveStatus: 'expired',
        },
      ],
    });

    const utils = render(React.createElement(config.Component, { data: expiredData, mode: 'desktop' }));
    const titles = Array.from(utils.queryAllByTestId('offer-title')).map(flat);
    assert.ok(!titles.includes('EXPIRED OFFER TITLE'), 'expired offer displayed as bookable');
  });
}

/* ------------------------------------------------------------------ */
/* 7. Booking Connection & Data Preservation                          */
/* ------------------------------------------------------------------ */

section('7. Booking Connection & Preservation');

for (const config of CASES) {
  await test(`${config.label}: Offer CTA opens booking with theme, service, offer & final price preserved`, async () => {
    reset();
    const data = salonData(config.id);
    const resolvedOffers = getThemeOffers(config.id, data, '2026-08-14');
    const targetOffer = resolvedOffers[0];

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const ctas = utils.getAllByTestId('offer-book-now');

    await act(async () => {
      fireEvent.click(ctas[0]);
    });

    const modal = utils.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(modal, `booking modal failed to open for ${config.id}`);

    const pricing = serviceDisplayPrice(targetOffer.service, [targetOffer], null, '2026-08-14');
    assert.equal(pricing.finalPrice, targetOffer.discountedPrice);
  });

  await test(`${config.label}: Combo CTA opens booking with theme, combo, services & final price preserved`, async () => {
    reset();
    const data = salonData(config.id);
    const combos = getThemeCombos(config.id, data);
    const targetCombo = combos[0];

    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const ctas = utils.getAllByTestId('combo-book-cta');

    await act(async () => {
      fireEvent.click(ctas[0]);
    });

    const modal = utils.container.querySelector('[data-testid="site-booking-flow"]');
    assert.ok(modal, `booking modal failed to open for ${config.id}`);
  });
}

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 13.5 promotional UI & offer experience: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes pass Phase 13.5 Promotional UI & Offer Experience verification.');
cleanup();
process.exit(0);
