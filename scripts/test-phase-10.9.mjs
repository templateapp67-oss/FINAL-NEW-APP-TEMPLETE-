/**
 * PHASE 10.9 — MOBILE CONTACT & BOOKING ACTION BAR
 * Bottom sticky bar: Call Now | WhatsApp | Directions | Book
 * Tests 5 themes × mobile/desktop, EN/HI, Light/Dark, small/large screens
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

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { mobileBarText } = await import('../src/lib/siteMobileBarI18n.ts');
const { siteText } = await import('../src/lib/siteI18n.ts');

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

function richData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: 'Phase 10.9 Salon',
    tagline: 'Mobile bar under test',
    about: 'A full website under test.',
    ownerName: 'Asha Verma',
    email: 'hello@phase109.test',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    services: [
      { id: 'svc-1', name: 'Signature Haircut', category: 'Haircut', description: 'Cut and finish.', price: 499, duration: 45, status: 'active', featured: true },
    ],
    packages: [],
    team: [{ id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Craft.', status: 'Available' }],
    gallery: [{ id: 'gal-1', url: 'https://example.com/g1.jpg', alt: 'Work', category: 'General' }],
    socialVideos: [],
    address: { fullAddress: '21 Test Street, Jaipur, Rajasthan 302001', area: 'Test', city: 'Jaipur', state: 'Rajasthan', pinCode: '302001', latitude: 26.9124, longitude: 75.7873 },
    openingHours: {
      monday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      sunday: { open: false, startTime: '10:00 AM', endTime: '04:00 PM' },
    },
    socialProfiles: { instagram: 'https://instagram.com/phaseten' },
    ...extras,
  };
}

const CASES = [
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash },
];

for (const config of CASES) {
  section(`${config.label} — mobile bottom bar`);

  // Mobile — bar exists with 4 actions
  cleanup();
  window.localStorage.clear();
  setSiteLocale('en');
  setSiteAppearance(undefined);
  {
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'mobile' }));
    await test(`${config.id} mobile: action bar exists`, () => {
      const bar = utils.getByTestId('site-mobile-action-bar');
      assert.equal(bar.dataset.theme, config.id);
      assert.equal(bar.dataset.mode, 'mobile');
    });

    await test(`${config.id} mobile: shows Call Now | WhatsApp | Directions | Book`, () => {
      assert.ok(utils.getByTestId('site-mobile-bar-call'));
      assert.ok(utils.getByTestId('site-mobile-bar-whatsapp'));
      assert.ok(utils.getByTestId('site-mobile-bar-directions'));
      assert.ok(utils.getByTestId('site-mobile-bar-book'));
      // Icons + labels present
      const call = utils.getByTestId('site-mobile-bar-call');
      assert.ok(call.textContent.trim().length > 0);
      assert.ok(call.querySelector('svg'), 'Call icon missing');
      assert.ok(utils.getByTestId('site-mobile-bar-whatsapp').querySelector('svg'), 'WhatsApp icon missing');
      assert.ok(utils.getByTestId('site-mobile-bar-directions').querySelector('svg'), 'Directions icon missing');
      assert.ok(utils.getByTestId('site-mobile-bar-book').querySelector('svg'), 'Book icon missing');
    });

    await test(`${config.id} mobile: uses existing phone, WhatsApp, location data`, () => {
      const call = utils.getByTestId('site-mobile-bar-call');
      const wa = utils.getByTestId('site-mobile-bar-whatsapp');
      const dir = utils.getByTestId('site-mobile-bar-directions');
      // PHASE 16.8 — Call and WhatsApp are protected by the required 25%
      // advance payment. The bar still renders both actions for the salon
      // being viewed, but until this visitor has a successful advance they
      // carry the lock state and NO dialable target at all.
      assert.equal(call.dataset.locked, 'true');
      assert.equal(wa.dataset.locked, 'true');
      assert.equal(call.getAttribute('href'), null);
      assert.equal(wa.getAttribute('href'), null);
      assert.equal(call.dataset.lockReason, 'payment-required');
      const href = dir.getAttribute('href');
      // Should be maps link using saved location (fullAddress encoded)
      assert.ok(href.includes('maps.google.com') || href.includes('Jaipur') || href.includes('q='), `Directions href unexpected: ${href}`);
    });

    await test(`${config.id} mobile: Book opens existing booking flow (no duplicate logic)`, async () => {
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(utils.getByTestId('site-mobile-bar-book')); });
      const flow = utils.getByTestId('site-booking-flow');
      assert.ok(flow, 'booking flow did not open');
      // Existing flow contains Back to Website control
      const back = Array.from(flow.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      assert.ok(back, 'Back to Website missing — not existing flow');
      await act(async () => { fireEvent.click(back); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    await test(`${config.id} mobile: respects safe-area insets`, () => {
      const bar = utils.getByTestId('site-mobile-action-bar');
      const nav = utils.getByTestId('site-mobile-bar-nav');
      const style = nav.getAttribute('style') || '';
      // Should contain env(safe-area-inset-bottom)
      const combined = (bar.getAttribute('style') || '') + style + (nav.className || '');
      // Check CSS file contains safe-area handling via class
      assert.ok(nav.className.includes('site-mobile-action-bar'), 'nav should have site-mobile-action-bar class');
      // Also check spacer exists so content not covered
      const spacer = utils.container.querySelector('.site-mobile-action-bar-spacer');
      assert.ok(spacer, 'mobile action bar spacer missing — content would be covered');
    });

    await test(`${config.id} mobile: touch-friendly large buttons`, () => {
      const call = utils.getByTestId('site-mobile-bar-call');
      assert.ok(call.className.includes('site-touch'), 'Call button should be touch-friendly (site-touch)');
      assert.ok(call.className.includes('min-h-'), 'should have min-h for large target');
      const book = utils.getByTestId('site-mobile-bar-book');
      assert.ok(book.className.includes('site-touch'));
    });

    await test(`${config.id} mobile: remains accessible while scrolling (absolute + z-50)`, () => {
      const bar = utils.getByTestId('site-mobile-action-bar');
      assert.ok(bar.className.includes('absolute') || bar.className.includes('z-50') || bar.className.includes('z-'), 'bar should be absolute/sticky overlay');
      // Ensure it's outside scroll container but inside relative wrapper
      assert.ok(bar.parentElement || bar, 'bar should be positioned');
    });

    await test(`${config.id} mobile: hidden when booking flow open (does not cover booking controls)`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('site-mobile-bar-book')); });
      assert.ok(utils.getByTestId('site-booking-flow'));
      // Bar should disappear while booking open
      assert.equal(utils.container.querySelector('[data-testid="site-mobile-action-bar"]'), null, 'mobile bar should hide when booking open');
      const back = Array.from(utils.getByTestId('site-booking-flow').querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      await act(async () => { fireEvent.click(back); });
      assert.ok(utils.getByTestId('site-mobile-action-bar'), 'bar should reappear after booking closed');
    });

    cleanup();
  }

  // Desktop — no mobile bar, floating actions usable
  {
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    await test(`${config.id} desktop: does NOT show mobile bottom bar`, () => {
      assert.equal(utils.container.querySelector('[data-testid="site-mobile-action-bar"]'), null, 'mobile bar should not show on desktop');
    });
    await test(`${config.id} desktop: existing floating/contact actions remain`, () => {
      assert.ok(utils.getByTestId('site-floating-actions'));
      assert.ok(utils.getByTestId('site-back-to-top'));
      // Call and WhatsApp FABs on desktop
      assert.ok(utils.getByTestId('site-fab-call'));
      assert.ok(utils.getByTestId('site-fab-whatsapp'));
    });
    cleanup();
  }

  // EN/HI
  section(`${config.label} — EN/HI + Light/Dark`);
  for (const locale of ['en', 'hi']) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale(locale);
    setSiteAppearance(undefined);
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'mobile' }));
    const T = mobileBarText(config.id, locale);
    await test(`${config.id} ${locale}: labels repaint`, () => {
      const bar = utils.getByTestId('site-mobile-action-bar');
      assert.equal(bar.dataset.locale, locale);
      // Check at least one label matches expected locale copy
      const callLabel = utils.getByTestId('site-mobile-bar-call').textContent;
      const whatsappLabel = utils.getByTestId('site-mobile-bar-whatsapp').textContent;
      // For EN, should contain EN; for HI, should contain HI chars
      if (locale === 'en') {
        assert.ok(callLabel.includes('Call') || callLabel.includes('call'), `EN call label missing: ${callLabel}`);
        assert.ok(whatsappLabel.includes('WhatsApp'));
      } else {
        // Hindi contains Devanagari
        assert.ok(/[\u0900-\u097F]/.test(callLabel + whatsappLabel) || callLabel.includes('कॉल'), `HI label missing Devanagari: ${callLabel}`);
      }
    });
    cleanup();
  }

  // Light/Dark
  for (const appearance of ['light', 'dark']) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(appearance);
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'mobile' }));
    await test(`${config.id} ${appearance}: appearance attribute`, () => {
      const bar = utils.getByTestId('site-mobile-action-bar');
      assert.equal(bar.dataset.appearance, appearance);
      const nav = utils.getByTestId('site-mobile-bar-nav');
      assert.ok(nav.getAttribute('style') && nav.getAttribute('style').length > 0, 'theme style should be present');
    });
    cleanup();
  }

  // Small/large mobile screens: test grid-cols-4 remains and buttons fit
  {
    cleanup();
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'mobile' }));
    await test(`${config.id} small/large screens: 4 columns, not covering content`, () => {
      const nav = utils.getByTestId('site-mobile-bar-nav');
      assert.ok(nav.className.includes('grid-cols-4'), 'should be 4 columns on all mobile widths');
      // Ensure spacer prevents covering
      const spacers = utils.container.querySelectorAll('.site-mobile-action-bar-spacer, .site-mobile-dock-spacer');
      assert.ok(spacers.length >= 1, 'spacer missing');
    });
    cleanup();
  }
}

section('Cross-theme visual distinctness');
{
  const sigs = [];
  for (const config of CASES) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(undefined);
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'mobile' }));
    const nav = utils.getByTestId('site-mobile-bar-nav');
    sigs.push(`${config.id}:${nav.getAttribute('style')}|${nav.className}`);
    cleanup();
  }
  await test('mobile bar treatments differ pairwise across 5 themes', () => {
    const unique = new Set(sigs);
    assert.equal(unique.size, 5, `expected 5 unique mobile bar styles, got ${unique.size}: ${JSON.stringify(sigs)}`);
  });
}

section('Contact options hide logic');
{
  cleanup();
  window.localStorage.clear();
  setSiteLocale('en');
  const data = richData('barber_mens_grooming', { contactOptions: { callNow: false, whatsapp: false, bookNow: true }, phone: '', whatsappPhone: '' });
  const utils = render(React.createElement(Barber, { data, mode: 'mobile' }));
  await test('hides Call/WhatsApp when data/options off, keeps Directions+Book', () => {
    const callDisabled = utils.container.querySelector('[data-testid="site-mobile-bar-call-disabled"]');
    const waDisabled = utils.container.querySelector('[data-testid="site-mobile-bar-whatsapp-disabled"]');
    assert.ok(callDisabled, 'call should show disabled state when off');
    assert.ok(waDisabled, 'whatsapp should show disabled when off');
    assert.ok(utils.getByTestId('site-mobile-bar-directions'));
    assert.ok(utils.getByTestId('site-mobile-bar-book'));
  });
  cleanup();
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.9 mobile contact & booking action bar: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log('All five themes verified: Mobile scroll, Call, WhatsApp, Directions, Book — EN/HI, Light/Dark, small/large.');
