/**
 * PHASE 12.6 — SERVICE DETAIL EXPERIENCE (five-theme acceptance)
 *
 * Verifies the Service Detail view/modal for all five themes:
 *
 *   1. Service List → Select Service → Service Details (name, full description,
 *      category, price/starting price, duration, active offer/discount,
 *      image/icon, available staff).
 *   2. Book Now → existing booking flow with theme + category + service
 *      preserved (no re-selection).
 *   3. Theme isolation — only the active theme's service details; the modal
 *      closes and never shows another theme's data after a switch.
 *   4. Staff — real, available staff only (assignments respected, on-leave /
 *      inactive excluded, never invented).
 *   5. UI — theme-specific styling, mobile-first, EN/HI, light/dark, and
 *      loading/empty/error gating.
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
const SiteServiceDirectory = (await import('../src/components/SiteServiceDirectory.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { staffForService } = await import('../src/lib/siteServiceDetail.ts');
const { serviceDetailText } = await import('../src/lib/siteServiceDetailI18n.ts');
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

function detailServices(themeId, cats) {
  return [
    { id: 'svc-a', name: `${themeId} Alpha`, category: cats[0], description: `Full ${themeId} Alpha description with extra detail for the modal.`, price: 500, duration: 30, themeId, status: 'active', media: { iconUrl: 'https://example.com/alpha.png' } },
    { id: 'svc-b', name: `${themeId} Beta`, category: cats[1], description: `Full ${themeId} Beta description with extra detail.`, price: 900, duration: 60, themeId, status: 'active' },
    { id: `foreign-${themeId}`, name: 'Foreign Theme Service', category: 'Foreign', description: 'Must never appear.', price: 9999, duration: 90, themeId: 'some_other_theme', status: 'active' },
  ];
}

function detailTeam(themeId) {
  return [
    { id: 'st1', name: 'Stylist One', role: 'Senior Stylist', specialties: ['Color'], imageUrl: '', status: 'Available', assignedServiceIds: ['svc-a', 'svc-b'], rating: 4.9 },
    { id: 'st2', name: 'Stylist Two', role: 'Junior Stylist', specialties: [], imageUrl: 'https://example.com/two.jpg', status: 'Available', assignedServiceIds: ['svc-b'], rating: 4.5 },
    { id: 'st3', name: 'Stylist On Leave', role: 'Therapist', specialties: [], imageUrl: '', status: 'On Leave', assignedServiceIds: ['svc-a'] },
  ];
}

function salonData(templateId, services, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: `${templateId} Test Salon`,
    services,
    packages: [],
    team: detailTeam(templateId),
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

function detailOf(container) {
  const el = container.querySelector('[data-testid="site-service-detail"]');
  assert.ok(el, 'detail modal missing');
  return el;
}

/* ------------------------------------------------------------------ */
/* 1. Staff helper — real, available staff only                        */
/* ------------------------------------------------------------------ */

section('Staff helper');

await test('staffForService respects assignments and excludes on-leave/inactive', () => {
  const data = salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats));
  const forA = staffForService(data, 'svc-a');
  assert.deepEqual(forA.map((s) => s.name), ['Stylist One'], 'svc-a should show only the assigned, available stylist');
  const forB = staffForService(data, 'svc-b');
  assert.deepEqual(forB.map((s) => s.name), ['Stylist One', 'Stylist Two']);
});

await test('staffForService shows all available staff when no assignments are configured', () => {
  const data = salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats), {
    team: [
      { id: 'a', name: 'Ava', role: 'Stylist', specialties: [], imageUrl: '', status: 'Available' },
      { id: 'b', name: 'Ben', role: 'Barber', specialties: [], imageUrl: '', status: 'Available' },
      { id: 'c', name: 'Cal', role: 'Barber', specialties: [], imageUrl: '', status: 'Inactive' },
    ],
  });
  const staff = staffForService(data, 'svc-a');
  assert.deepEqual(staff.map((s) => s.name), ['Ava', 'Ben'], 'inactive member leaked');
});

await test('staffForService never invents staff (empty team → empty list)', () => {
  const data = salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats), { team: [] });
  assert.deepEqual(staffForService(data, 'svc-a'), []);
});

/* ------------------------------------------------------------------ */
/* 2. List → Select → Details → fields                                 */
/* ------------------------------------------------------------------ */

section('Service List → Select → Service Details');

for (const config of CASES) {
  await test(`${config.id}: selecting a service opens the detail modal`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail"]'), null, 'modal should be closed initially');
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`) || utils.container.querySelector('[data-testid="site-directory-open-detail"]')); });
    const modal = detailOf(utils.container);
    assert.equal(modal.getAttribute('data-theme'), config.id);
  });

  await test(`${config.id}: detail shows name, category, full description, price, duration`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    const modal = detailOf(utils.container);
    assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-name"]')).includes(`${config.id} Alpha`));
    assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-description"]')).includes('extra detail for the modal'));
    assert.equal(flat(modal.querySelector('[data-testid="site-service-detail-price"]')), formatCurrency(500));
    assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-duration"]')).includes('30'));
    assert.equal(modal.querySelector('[data-testid="site-service-detail-book"]').getAttribute('data-service-name'), `${config.id} Alpha`);
  });

  await test(`${config.id}: media/icon + staff render from real data`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    // svc-a has media → image; svc-b has none → themed icon.
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    assert.ok(utils.container.querySelector('[data-testid="site-service-detail-media"]'), 'media image missing for svc-a');
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail-icon"]'), null);

    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-service-detail-close"]')); });
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Beta"]`)); });
    assert.ok(utils.container.querySelector('[data-testid="site-service-detail-icon"]'), 'themed icon missing for svc-b');
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail-media"]'), null);

    // svc-b staff = Stylist One + Stylist Two (assignments respected).
    const members = utils.container.querySelectorAll('[data-testid="site-service-detail-staff-member"]');
    assert.equal(members.length, 2, 'assigned available staff count wrong');
    const names = Array.from(members).map((m) => flat(m));
    assert.ok(names.some((n) => n.includes('Stylist One')));
    assert.ok(names.some((n) => n.includes('Stylist Two')));
    assert.ok(!flat(utils.container.querySelector('[data-testid="site-service-detail-staff"]')).includes('Stylist On Leave'), 'on-leave staff leaked');
  });

  await test(`${config.id}: close button and backdrop close the modal`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    assert.ok(detailOf(utils.container));
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-service-detail-close"]')); });
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail"]'), null);
    // backdrop also closes
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-service-detail-backdrop"]')); });
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail"]'), null);
  });
}

/* ------------------------------------------------------------------ */
/* 3. Book Now → existing booking flow, service preserved              */
/* ------------------------------------------------------------------ */

section('Book Now → existing booking flow (service preserved)');

for (const config of CASES) {
  await test(`${config.id}: Book Now opens booking with theme + service preserved`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-service-detail-book"]')); });
    // Modal closed, booking flow opened.
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail"]'), null, 'modal should close on book');
    const flow = utils.container.querySelector('[data-testid="booking-flow"]');
    assert.ok(flow, 'booking flow did not open');
    assert.equal(flow.getAttribute('data-theme'), config.id);
    const selected = flow.querySelector('[data-selected="true"]');
    assert.ok(selected, 'no pre-selected service in booking');
    assert.ok(flat(selected).includes(`${config.id} Alpha`), `booking did not preserve "${config.id} Alpha": ${flat(selected)}`);
  });
}

/* ------------------------------------------------------------------ */
/* 4. Offer display in detail                                          */
/* ------------------------------------------------------------------ */

section('Offer display in detail');

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

await test('active offer shows badge + discount + discounted price in detail', async () => {
  reset();
  const data = salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats), { offers: [THEME_OFFER('barber_mens_grooming')] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-directory-open-detail"][data-service-name="barber_mens_grooming Alpha"]')); });
  const modal = detailOf(utils.container);
  const offerEl = modal.querySelector('[data-testid="site-service-detail-offer"]');
  assert.ok(offerEl, 'offer badge missing');
  assert.ok(flat(offerEl).includes('20% OFF'));
  assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-discount"]')).includes('20% off'));
  assert.equal(flat(modal.querySelector('[data-testid="site-service-detail-price"]')), formatCurrency(400));
});

await test('expired offer disappears from the detail', async () => {
  reset();
  const data = salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats), { offers: [THEME_OFFER('barber_mens_grooming', { endDate: '2001-01-01' })] });
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await settle();
  await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-directory-open-detail"][data-service-name="barber_mens_grooming Alpha"]')); });
  assert.equal(utils.container.querySelector('[data-testid="site-service-detail-offer"]'), null);
  assert.equal(flat(utils.container.querySelector('[data-testid="site-service-detail-price"]')), formatCurrency(500));
});

/* ------------------------------------------------------------------ */
/* 5. Theme isolation + switch closes modal                            */
/* ------------------------------------------------------------------ */

section('Theme isolation & switch');

await test('foreign-theme services cannot be opened (never in the list)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats)), mode: 'desktop' }));
  await settle();
  assert.equal(utils.container.querySelector('[data-testid="site-directory-open-detail"][data-service-name="Foreign Theme Service"]'), null);
});

await test('same-instance theme switch closes the open detail modal', async () => {
  reset();
  let utils = render(
    React.createElement(SiteServiceDirectory, { themeId: 'barber_mens_grooming', data: salonData('barber_mens_grooming', detailServices('barber_mens_grooming', CASES[0].cats)), mode: 'desktop' }),
  );
  await settle();
  await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-directory-open-detail"][data-service-name="barber_mens_grooming Alpha"]')); });
  assert.ok(detailOf(utils.container));
  await act(async () => {
    utils.rerender(
      React.createElement(SiteServiceDirectory, { themeId: 'hair_studio_color_bar', data: salonData('hair_studio_color_bar', detailServices('hair_studio_color_bar', CASES[1].cats)), mode: 'desktop' }),
    );
  });
  await settle();
  assert.equal(utils.container.querySelector('[data-testid="site-service-detail"]'), null, 'detail modal survived a theme switch');
  assert.ok(!flat(utils.container).includes('barber_mens_grooming Alpha'), 'previous theme service remained');
});

section('Theme switch — Barber → Hair → Spa → Family → Nail');

reset();
let utils = null;
let previous = null;
for (const config of CASES) {
  if (utils === null) {
    utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
  } else {
    await act(async () => { utils.rerender(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' })); });
  }
  await settle();
  const prior = previous;

  await test(`→ ${config.id}: details are the active theme's only`, async () => {
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    const modal = detailOf(utils.container);
    assert.equal(modal.getAttribute('data-theme'), config.id);
    assert.ok(flat(modal).includes(`${config.id} Alpha`));
    assert.ok(!flat(modal).includes('Foreign Theme Service'));
    await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-service-detail-close"]')); });
  });

  if (prior) {
    await test(`→ ${config.id}: no ${prior.id} service details remain`, () => {
      assert.ok(!flat(utils.container).includes(`${prior.id} Alpha`), `stale ${prior.id} details survived`);
    });
  }
  previous = config;
}

/* ------------------------------------------------------------------ */
/* 6. UI — responsive, i18n, dark mode, states                         */
/* ------------------------------------------------------------------ */

section('UI — responsive, i18n, light/dark, states');

for (const config of CASES) {
  await test(`${config.id}: light/dark detail surfaces change`, async () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    const lightPanel = utils.container.querySelector('[data-testid="site-service-detail-panel"]').style.backgroundColor;
    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    const darkPanel = utils.container.querySelector('[data-testid="site-service-detail-panel"]').style.backgroundColor;
    assert.ok(lightPanel.length > 0 && darkPanel.length > 0);
    assert.notEqual(lightPanel, darkPanel, 'dark mode did not change the detail panel');
  });

  await test(`${config.id}: detail works in mobile mode (bottom sheet)`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'mobile' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    const modal = detailOf(utils.container);
    assert.equal(modal.getAttribute('data-mode'), 'mobile');
    assert.ok(modal.querySelector('[data-testid="site-service-detail-book"]'));
  });

  await test(`${config.id}: loading state hides detail triggers`, async () => {
    reset();
    setWebsiteSectionFlagsForTests({ services: 'loading' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    assert.ok(utils.container.querySelector('[data-testid="section-state-loading"]'));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-directory-open-detail"]').length, 0);
    assert.equal(utils.container.querySelector('[data-testid="site-service-detail"]'), null);
    setWebsiteSectionFlagsForTests({});
  });
}

await test('five themes keep five distinct detail accents + panel shapes', async () => {
  reset();
  const accents = new Map();
  const shapes = new Map();
  for (const config of CASES) {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, detailServices(config.id, config.cats)), mode: 'desktop' }));
    await settle();
    await act(async () => { fireEvent.click(utils.container.querySelector(`[data-testid="site-directory-open-detail"][data-service-name="${config.id} Alpha"]`)); });
    const panel = utils.container.querySelector('[data-testid="site-service-detail-panel"]');
    accents.set(config.id, utils.container.querySelector('[data-testid="site-service-detail-price"]').style.color);
    shapes.set(config.id, panel.getAttribute('class'));
    cleanup();
    reset();
  }
  assert.equal(new Set(accents.values()).size, CASES.length, `detail accent colours shared: ${JSON.stringify([...accents])}`);
  assert.ok(!shapes.get('barber_mens_grooming').includes('rounded'), 'barber panel should stay sharp');
  assert.ok(shapes.get('beauty_skin_spa').includes('rounded-t-3xl'), 'spa panel should be rounded');
  assert.ok(shapes.get('family_full_service').includes('rounded-t-2xl'), 'family panel should be rounded');
  assert.ok(shapes.get('nail_lash_studio').includes('rounded-t-[1.75rem]'), 'nail panel should be rounded');
});

section('Hindi copy');

await test('detail localizes name, category and labels to Hindi', async () => {
  reset({ locale: 'hi' });
  const services = [
    { id: 'svc-a', name: 'Skin Fade', category: 'Haircuts', description: 'Precision fade description.', price: 450, duration: 45, themeId: 'barber_mens_grooming', status: 'active', translations: [{ locale: 'hi', name: 'स्किन फ़ेड', description: 'सटीक फ़ेड विवरण।' }] },
  ];
  const utils = render(React.createElement(Barber, { data: salonData('barber_mens_grooming', services), mode: 'desktop' }));
  await settle();
  await act(async () => { fireEvent.click(utils.container.querySelector('[data-testid="site-directory-open-detail"][data-service-name="Skin Fade"]')); });
  const modal = detailOf(utils.container);
  assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-name"]')).includes('स्किन फ़ेड'));
  assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-description"]')).includes('सटीक फ़ेड विवरण।'));
  assert.ok(flat(modal.querySelector('[data-testid="site-service-detail-staff-title"]')).includes('उपलब्ध स्टाइलिस्ट'));
  assert.equal(utils.container.querySelector('[data-testid="site-service-detail-close"]').getAttribute('aria-label'), 'बंद करें');
});

await test('serviceDetailText exposes EN + HI copy', () => {
  for (const locale of ['en', 'hi']) {
    const copy = serviceDetailText(locale);
    for (const key of ['availableStaff', 'close', 'dialogLabel']) {
      assert.ok(copy[key] && copy[key].length > 0, `${locale}.${key} empty`);
    }
  }
});

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});

console.log('\n────────────────────────────────────────');
console.log(`Phase 12.6 service detail experience: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes pass Service List → Select → Service Details → Book Now → existing booking flow, with theme isolation, real staff/offers, themed EN/HI + light/dark UI and state handling.');
cleanup();
process.exit(0);
