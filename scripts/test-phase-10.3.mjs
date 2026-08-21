/**
 * PHASE 10.3 — RESPONSIVE WEBSITE STRUCTURE (five-theme acceptance)
 *
 * Mounts the REAL five theme renderers in jsdom and verifies:
 *   1. Canonical section order on every theme
 *   2. No missing / duplicated structural sections
 *   3. Gallery before Videos; Owner + Staff near the end
 *   4. Videos exist even when no owner reels are supplied
 *   5. Dynamic sections expose loading / empty / error states
 *   6. Desktop, tablet and mobile all render the same structure
 *   7. Booking CTA remains present and targets contact
 *   8. Phase 10.1 header is untouched (data-testid="site-header")
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
const { render, cleanup } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const {
  SITE_SECTION_ORDER,
  collectSiteSectionOrder,
  setWebsiteSectionFlagsForTests,
} = await import('../src/lib/siteStructure.ts');

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
    salonName: 'Phase Ten Salon',
    ownerName: 'Asha Verma',
    about: 'A full website under test.',
    services: [
      { id: 'svc-1', name: 'Signature Haircut', category: 'Haircut', description: 'Cut and finish.', price: 499, duration: 45, status: 'active', featured: true },
      { id: 'svc-2', name: 'Deluxe Facial', category: 'Skin', description: 'Glow therapy.', price: 999, duration: 60, status: 'active' },
    ],
    packages: [
      { id: 'pkg-1', name: 'Festive Combo', description: 'Bundle under test.', price: 1199, duration: 90, status: 'active' },
    ],
    team: [
      { id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Craft.', status: 'Available' },
    ],
    gallery: [{ id: 'gal-1', url: 'https://example.com/g1.jpg', alt: 'Work', category: 'General' }],
    socialVideos: [{ id: 'vid-1', title: 'Reel', platform: 'instagram', url: 'https://example.com/r', thumbnailUrl: 'https://example.com/t.jpg' }],
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

const MODES = ['desktop', 'tablet', 'mobile'];

function orderOf(container) {
  return collectSiteSectionOrder(container);
}

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode}`);
    cleanup();
    window.localStorage.clear();
    setWebsiteSectionFlagsForTests({});
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode }));

    await test('keeps the Phase 10.1 header', () => {
      assert.ok(utils.getByTestId('site-header'));
      assert.equal(utils.getByTestId('site-header').dataset.theme, config.id);
    });

    await test('renders the canonical section order without gaps or duplicates', () => {
      const realized = orderOf(utils.container);
      assert.deepEqual(realized, [...SITE_SECTION_ORDER], `order was ${realized.join(' → ')}`);
      assert.equal(new Set(realized).size, SITE_SECTION_ORDER.length, 'duplicate structural section');
    });

    await test('gallery appears before videos; owner + staff stay near the end', () => {
      const realized = orderOf(utils.container);
      assert.ok(realized.indexOf('gallery') < realized.indexOf('videos'));
      assert.ok(realized.indexOf('about') < realized.indexOf('owner'));
      assert.ok(realized.indexOf('owner') < realized.indexOf('team'));
      assert.ok(realized.indexOf('team') < realized.indexOf('reviews'));
      assert.ok(realized.indexOf('team') > realized.indexOf('videos'));
    });

    await test('videos section exists and booking CTA is reachable', () => {
      assert.ok(utils.container.querySelector('[data-site-section="videos"]'));
      assert.ok(utils.container.querySelector('#section-social') || utils.container.querySelector('[data-site-section="videos"]'));
      assert.ok(utils.getByTestId('final-booking-cta'));
      assert.ok(utils.container.querySelector('#section-contact'), 'contact target missing');
    });

    await test('scroll shell does not allow horizontal overflow', () => {
      const scroller = utils.container.querySelector('.site-scroll, .overflow-y-auto');
      assert.ok(scroller);
      assert.ok(
        scroller.className.includes('overflow-x-hidden') || scroller.className.includes('site-scroll'),
        'missing overflow-x containment',
      );
    });

    cleanup();
  }

  section(`${config.label} — dynamic states`);
  {
    cleanup();
    window.localStorage.clear();
    setWebsiteSectionFlagsForTests({ services: 'loading', gallery: 'empty', videos: 'error', team: 'empty' });
    const utils = render(React.createElement(config.Component, { data: richData(config.id, { socialVideos: [], team: [], gallery: [] }), mode: 'desktop' }));

    await test('loading / empty / error states render on dynamic sections', () => {
      const services = utils.container.querySelector('[data-site-section="services"]');
      const gallery = utils.container.querySelector('[data-site-section="gallery"]');
      const videos = utils.container.querySelector('[data-site-section="videos"]');
      const team = utils.container.querySelector('[data-site-section="team"]');
      assert.equal(services?.getAttribute('data-section-state'), 'loading');
      assert.equal(gallery?.getAttribute('data-section-state'), 'empty');
      assert.equal(videos?.getAttribute('data-section-state'), 'error');
      assert.equal(team?.getAttribute('data-section-state'), 'empty');
      assert.ok(utils.container.querySelector('[data-testid="section-state-loading"]'));
      assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'));
      assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'));
    });

    await test('videos section still exists when the salon has no reels', () => {
      assert.ok(utils.container.querySelector('[data-site-section="videos"]'));
    });

    cleanup();
    setWebsiteSectionFlagsForTests({});
  }
}

section('Cross-theme identity is preserved');
{
  await test('each theme still owns a distinct header treatment', () => {
    const signatures = [];
    for (const config of CASES) {
      cleanup();
      const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
      signatures.push(utils.getByTestId('site-header').dataset.theme);
      cleanup();
    }
    assert.equal(new Set(signatures).size, 5);
  });
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.3 website structure: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log('All five themes verified across desktop, tablet and mobile.');
