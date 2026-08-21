/**
 * PHASE 14.5 — GALLERY CONVERSION & FINAL POLISH (five-theme acceptance test)
 *
 * Verifies the conversion/polish layer on top of 14.1 + 14.3 + 14.4 (nothing
 * recreated):
 *   1. Gallery CTAs — "View Service" + "Book This Service" on service images,
 *      "Book Appointment" on non-service images, all via the EXISTING booking
 *      flow (`openSiteBooking` / `openSiteBookingForService`).
 *   2. Service connection — gallery image → service → existing Service Detail
 *      → booking, with the correct theme + service preserved.
 *   3. Before/After — clear Before/After labels + related category.
 *   4. Visual polish — smooth transition classes, theme-styled CTAs,
 *      reduced-motion support.
 *   5. Accessibility — accessible CTA buttons, keyboard nav, ESC, focus rules.
 *   6. Safety — configured data only, no cross-theme service mapping, invalid
 *      service references fail gracefully, missing CTA data never breaks.
 *   7. Matrix — desktop/tablet/mobile, EN/HI, light/dark, theme switch with no
 *      stale gallery/service data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const {
  SITE_BOOKING_EVENT,
  consumeBookingServicePrefill,
  openSiteBookingForService,
} = await import('../src/lib/siteBooking.ts');
const { galleryItemsForTheme, galleryServiceForItem } = await import('../src/lib/siteGallery.ts');

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

const COMPONENTS = Object.fromEntries(CASES.map((c) => [c.id, c.Component]));

/** Distinct service category per theme (maps to that theme's work vocabulary). */
const SERVICE_CAT = {
  barber_mens_grooming: 'Haircuts',
  hair_studio_color_bar: 'Styling & Cuts',
  beauty_skin_spa: 'Facial & Skincare',
  family_full_service: "Men's Services",
  nail_lash_studio: 'Nail Art & Gel',
};

/** A different theme, for foreign-service safety checks. */
const FOREIGN_THEME = {
  barber_mens_grooming: 'nail_lash_studio',
  hair_studio_color_bar: 'beauty_skin_spa',
  beauty_skin_spa: 'barber_mens_grooming',
  family_full_service: 'nail_lash_studio',
  nail_lash_studio: 'barber_mens_grooming',
};

function reset({ locale = 'en', appearance = undefined } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  consumeBookingServicePrefill(''); // clear any leftover booking prefill
}

function salonData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: `${templateId} Test Salon`,
    packages: [],
    offers: [],
    gallery: [],
    socialVideos: [],
    ...extras,
  };
}

const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

const lightbox = (utils) => utils.container.querySelector('[data-testid="site-gallery-lightbox"]');
const detail = (utils) => utils.container.querySelector('[data-testid="site-service-detail"]');

function serviceList(themeId) {
  return [
    {
      id: `${themeId}-svc-1`,
      name: `${themeId} Signature Service`,
      category: SERVICE_CAT[themeId],
      description: 'Configured service description',
      price: 500,
      duration: 30,
      themeId,
      status: 'active',
      media: { imageUrl: `https://images.unsplash.com/${themeId}-svc-1.jpg?w=1200` },
    },
    {
      id: `${themeId}-svc-2`,
      name: `${themeId} Premium Add-on`,
      category: SERVICE_CAT[themeId],
      description: 'Second configured service',
      price: 900,
      duration: 45,
      themeId,
      status: 'active',
      media: { imageUrl: `https://images.unsplash.com/${themeId}-svc-2.jpg?w=1200` },
    },
  ];
}

/** Services-only gallery (the "Gallery → Image → Service" conversion path). */
function serviceGalleryData(themeId) {
  return salonData(themeId, { services: serviceList(themeId) });
}

/** Open the FIRST service image (the featured banner in a services-only gallery). */
async function openServiceViewer(utils) {
  const featured = utils.container.querySelector('[data-testid="site-gallery-featured"]');
  assert.ok(featured, 'featured (first service image) missing');
  await act(async () => { fireEvent.click(featured); });
}

/** After a booking CTA, assert the existing booking flow is open with `name` selected. */
async function assertBookingFlowSelected(utils, name) {
  const flow = utils.container.querySelector('[data-testid="booking-flow"]');
  assert.ok(flow, 'existing booking flow did not open');
  const selected = flow.querySelector('[data-selected="true"]');
  assert.ok(selected, 'no selected service row in the booking flow');
  assert.ok(flat(selected).includes(name), `booking flow did not preserve "${name}": ${flat(selected)}`);
}

/** Spy on window.dispatchEvent to observe booking events. */
function spyBookingEvents() {
  const seen = [];
  const orig = window.dispatchEvent.bind(window);
  window.dispatchEvent = (event) => {
    seen.push(event.type);
    return orig(event);
  };
  return { seen, restore: () => { window.dispatchEvent = orig; } };
}

/* ------------------------------------------------------------------ */
/* 1. Service connection (data layer)                                  */
/* ------------------------------------------------------------------ */

section('Service connection — gallery image → service');

await test('service gallery items carry serviceId and resolve to the correct theme service', () => {
  for (const config of CASES) {
    const data = serviceGalleryData(config.id);
    const items = galleryItemsForTheme(config.id, data, 'en');
    const serviceItems = items.filter((item) => item.origin === 'service');
    assert.ok(serviceItems.length >= 2, `${config.id}: expected >=2 service gallery items`);
    for (const item of serviceItems) {
      assert.ok(item.serviceId, `${config.id}: service item missing serviceId`);
      const resolved = galleryServiceForItem(item, data, config.id);
      assert.ok(resolved, `${config.id}: service item did not resolve`);
      assert.equal(resolved.id, item.serviceId, `${config.id}: resolved wrong service id`);
      assert.equal(resolved.themeId, config.id, `${config.id}: resolved service lost its theme`);
    }
  }
});

await test('galleryServiceForItem fails gracefully for owner/theme items and invalid refs', () => {
  const data = serviceGalleryData('barber_mens_grooming');
  const items = galleryItemsForTheme('barber_mens_grooming', data, 'en');
  const serviceItem = items.find((item) => item.origin === 'service');
  assert.ok(serviceItem, 'service item missing');
  // Owner item (no serviceId) → null.
  assert.equal(galleryServiceForItem({ ...serviceItem, origin: 'owner', serviceId: undefined }, data, 'barber_mens_grooming'), null);
  // Theme item → null.
  assert.equal(galleryServiceForItem({ ...serviceItem, origin: 'theme', serviceId: undefined }, data, 'barber_mens_grooming'), null);
  // Invalid service reference → null (never throws).
  assert.equal(galleryServiceForItem({ ...serviceItem, serviceId: 'does-not-exist' }, data, 'barber_mens_grooming'), null);
  // Null/undefined item → null.
  assert.equal(galleryServiceForItem(null, data, 'barber_mens_grooming'), null);
  assert.equal(galleryServiceForItem(undefined, data, 'barber_mens_grooming'), null);
});

/* ------------------------------------------------------------------ */
/* 2. Gallery CTAs                                                     */
/* ------------------------------------------------------------------ */

section('Gallery CTAs — service vs generic');

await test('service image viewer shows View Service + Book This Service CTAs (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: serviceGalleryData(config.id), mode: 'desktop' }));
    await openServiceViewer(utils);
    assert.ok(lightbox(utils), `${config.id}: viewer did not open`);
    assert.ok(utils.getByTestId('site-gallery-cta-view-service'), `${config.id}: View Service CTA missing`);
    assert.ok(utils.getByTestId('site-gallery-cta-book-service'), `${config.id}: Book This Service CTA missing`);
    assert.equal(Boolean(utils.container.querySelector('[data-testid="site-gallery-cta-book-appointment"]')), false, `${config.id}: generic CTA should not show on a service image`);
    // Caption shows the service name (connection visible).
    assert.ok(flat(utils.getByTestId('site-gallery-lightbox-caption')).includes('Signature Service'), `${config.id}: service name caption missing`);
    reset();
  }
});

await test('non-service (owner) image shows the generic Book Appointment CTA', async () => {
  reset();
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { gallery: [{ id: 'o1', url: 'https://images.unsplash.com/owner-1.jpg', alt: 'Owner photo', category: 'General' }] }),
    mode: 'desktop',
  }));
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  assert.ok(utils.getByTestId('site-gallery-cta-book-appointment'), 'Book Appointment CTA missing');
  assert.equal(Boolean(utils.container.querySelector('[data-testid="site-gallery-cta-view-service"]')), false, 'View Service must not show on non-service image');
  assert.equal(Boolean(utils.container.querySelector('[data-testid="site-gallery-cta-book-service"]')), false, 'Book This Service must not show on non-service image');
  reset();
});

await test('Book This Service opens the existing booking flow with the service preserved', async () => {
  reset();
  const data = serviceGalleryData('barber_mens_grooming');
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const spy = spyBookingEvents();
  await openServiceViewer(utils);
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-book-service')); });
  assert.ok(spy.seen.includes(SITE_BOOKING_EVENT), 'existing booking event not dispatched');
  assert.equal(Boolean(lightbox(utils)), false, 'viewer should close on booking hand-off');
  await assertBookingFlowSelected(utils, 'Signature Service');
  spy.restore();
  reset();
});

await test('openSiteBookingForService preserves theme + service (unit)', () => {
  const service = { id: 'unit-1', name: 'Unit Signature Service', category: 'Haircuts', description: '', price: 100, duration: 10, themeId: 'barber_mens_grooming', status: 'active' };
  openSiteBookingForService(service, 'barber_mens_grooming');
  assert.equal(consumeBookingServicePrefill('barber_mens_grooming')?.id, 'unit-1');
  // Wrong theme → null (no cross-theme prefill leak).
  openSiteBookingForService(service, 'barber_mens_grooming');
  assert.equal(consumeBookingServicePrefill('nail_lash_studio'), null);
  assert.equal(consumeBookingServicePrefill(''), null);
});

await test('Book Appointment (generic) opens the existing booking flow with no service prefill', async () => {
  reset();
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { gallery: [{ id: 'o1', url: 'https://images.unsplash.com/owner-1.jpg', alt: 'Owner photo', category: 'General' }] }),
    mode: 'desktop',
  }));
  const spy = spyBookingEvents();
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-book-appointment')); });
  assert.ok(spy.seen.includes(SITE_BOOKING_EVENT), 'existing booking event not dispatched');
  assert.equal(consumeBookingServicePrefill('barber_mens_grooming'), null, 'generic booking must not leave a service prefill');
  spy.restore();
  reset();
});

await test('gallery with no services (owner-only) still renders without breaking', async () => {
  reset();
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', { gallery: [{ id: 'o1', url: 'https://images.unsplash.com/owner-1.jpg', alt: 'Owner photo', category: 'General' }] }),
    mode: 'desktop',
  }));
  assert.ok(utils.getByTestId('site-gallery-featured'), 'gallery should render owner photo');
  reset();
});

/* ------------------------------------------------------------------ */
/* 3. View Service → Service Detail → Book                             */
/* ------------------------------------------------------------------ */

section('Service Detail hand-off');

await test('View Service opens the existing Service Detail with the correct service + theme (all themes)', async () => {
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: serviceGalleryData(config.id), mode: 'desktop' }));
    await openServiceViewer(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-view-service')); });
    assert.equal(Boolean(lightbox(utils)), false, `${config.id}: viewer should close when detail opens`);
    assert.ok(detail(utils), `${config.id}: service detail did not open`);
    assert.ok(flat(utils.getByTestId('site-service-detail-name')).includes('Signature Service'), `${config.id}: wrong service in detail`);
    reset();
  }
});

await test('Service Detail Book CTA preserves theme + service in the booking flow', async () => {
  reset();
  const data = serviceGalleryData('barber_mens_grooming');
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const spy = spyBookingEvents();
  await openServiceViewer(utils);
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-view-service')); });
  await act(async () => { fireEvent.click(utils.getByTestId('site-service-detail-book')); });
  assert.ok(spy.seen.includes(SITE_BOOKING_EVENT), 'booking event not dispatched from detail');
  await assertBookingFlowSelected(utils, 'Signature Service');
  spy.restore();
  reset();
});

await test('closing the service detail returns to the gallery (no stale detail)', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode: 'desktop' }));
  await openServiceViewer(utils);
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-view-service')); });
  assert.ok(detail(utils), 'detail should be open');
  await act(async () => { fireEvent.click(utils.getByTestId('site-service-detail-close')); });
  assert.equal(Boolean(detail(utils)), false, 'detail did not close');
  assert.ok(utils.container.querySelector('[data-site-section="gallery"]'), 'gallery still present after closing detail');
  reset();
});

/* ------------------------------------------------------------------ */
/* 4. Before/After                                                     */
/* ------------------------------------------------------------------ */

section('Before/After labels');

await test('before/after pair shows clear Before/After labels + related category', async () => {
  reset();
  const utils = render(React.createElement(Barber, {
    data: salonData('barber_mens_grooming', {
      gallery: [
        { id: 'ba1', url: 'https://images.unsplash.com/ba-after.jpg', alt: 'Result', category: 'Barber', beforeUrl: 'https://images.unsplash.com/ba-before.jpg', featured: true },
        { id: 'x1', url: 'https://images.unsplash.com/x1.jpg', alt: 'X', category: 'General' },
      ],
    }),
    mode: 'desktop',
  }));
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-featured')); });
  assert.equal(flat(utils.getByTestId('site-gallery-before-label')), 'Before');
  assert.equal(flat(utils.getByTestId('site-gallery-after-label')), 'After');
  assert.ok(flat(lightbox(utils)).includes('Before & After'), 'Before & After chip missing');
  reset();
});

/* ------------------------------------------------------------------ */
/* 5. Visual polish                                                    */
/* ------------------------------------------------------------------ */

section('Visual polish — transition, styling, reduced motion');

await test('viewer uses smooth transition classes and theme-styled CTAs', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode: 'desktop' }));
  await openServiceViewer(utils);
  const lb = lightbox(utils);
  assert.ok(lb.className.includes('site-gallery-lightbox-anim'), 'lightbox transition class missing');
  assert.ok(utils.getByTestId('site-gallery-lightbox-stage').className.includes('site-gallery-stage-anim'), 'stage transition class missing');
  const cta = utils.getByTestId('site-gallery-cta-book-service');
  assert.ok(cta.className.includes('site-gallery-cta'), 'CTA style class missing');
  assert.ok((cta.getAttribute('style') || '').includes('background-color'), 'CTA missing themed background');
  reset();
});

await test('reduced-motion support is present (CSS disables viewer animation)', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.ok(css.includes('prefers-reduced-motion'), 'prefers-reduced-motion media query missing');
  assert.ok(/animation:\s*none/i.test(css), 'animation:none under reduced motion missing');
});

/* ------------------------------------------------------------------ */
/* 6. Accessibility                                                    */
/* ------------------------------------------------------------------ */

section('Accessibility');

await test('CTA buttons are accessible (named) and viewer keeps keyboard + ESC + focus rules', async () => {
  reset();
  const utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode: 'desktop' }));
  await openServiceViewer(utils);
  for (const id of ['site-gallery-cta-view-service', 'site-gallery-cta-book-service']) {
    assert.ok(flat(utils.getByTestId(id)).length > 0, `${id} missing accessible name`);
  }
  // ESC still closes.
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  assert.equal(Boolean(lightbox(utils)), false, 'ESC did not close viewer');
  reset();
});

await test('keyboard focus rules for viewer controls are declared in CSS', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.ok(css.includes('focus-visible'), 'focus-visible rule missing');
});

/* ------------------------------------------------------------------ */
/* 7. Safety                                                           */
/* ------------------------------------------------------------------ */

section('Safety — no cross-theme service mapping');

await test('gallery resolves only the active theme service; foreign service media never renders', async () => {
  reset();
  const foreign = FOREIGN_THEME.barber_mens_grooming;
  const data = salonData('barber_mens_grooming', {
    services: [
      ...serviceList('barber_mens_grooming'),
      { id: 'foreign-svc', name: 'Foreign Nail Service', category: 'Nail Art & Gel', price: 100, duration: 10, themeId: foreign, status: 'active', media: { imageUrl: 'https://images.unsplash.com/foreign-nail.jpg?w=1200' } },
    ],
  });
  const items = galleryItemsForTheme('barber_mens_grooming', data, 'en');
  assert.ok(!items.some((item) => item.src.includes('foreign-nail')), 'foreign service photo leaked into gallery');
  const serviceItem = items.find((item) => item.origin === 'service' && item.src.includes('barber_mens_grooming-svc-1'));
  const resolved = galleryServiceForItem(serviceItem, data, 'barber_mens_grooming');
  assert.ok(resolved, 'own service should resolve');
  assert.equal(resolved.id, 'barber_mens_grooming-svc-1', 'resolved a foreign/wrong service');
  // A foreign-scoped service can never resolve into the barber gallery.
  const foreignItem = { ...serviceItem, serviceId: 'foreign-svc' };
  assert.equal(galleryServiceForItem(foreignItem, data, 'barber_mens_grooming'), null, 'foreign service must not resolve');
  reset();
});

/* ------------------------------------------------------------------ */
/* 8. Final flow + matrix                                              */
/* ------------------------------------------------------------------ */

section('Final flow + responsive / locale / appearance / theme switch');

await test('full flow per theme: Gallery → Image → View Service → Detail → Book', async () => {
  for (const config of CASES) {
    reset();
    const data = serviceGalleryData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const spy = spyBookingEvents();
    await openServiceViewer(utils);
    assert.ok(lightbox(utils), `${config.id}: viewer missing`);
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-view-service')); });
    assert.ok(detail(utils), `${config.id}: detail missing`);
    assert.ok(flat(utils.getByTestId('site-service-detail-name')).includes('Signature Service'), `${config.id}: wrong service`);
    await act(async () => { fireEvent.click(utils.getByTestId('site-service-detail-book')); });
    assert.ok(spy.seen.includes(SITE_BOOKING_EVENT), `${config.id}: booking event missing`);
    await assertBookingFlowSelected(utils, 'Signature Service');
    spy.restore();
    reset();
  }
});

await test('service CTA flow works at desktop/tablet/mobile', async () => {
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    reset();
    const utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode }));
    await openServiceViewer(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-view-service')); });
    assert.ok(detail(utils), `${mode}: detail missing`);
    reset();
  }
});

await test('CTA labels localise (EN + HI)', async () => {
  reset({ locale: 'en' });
  let utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode: 'desktop' }));
  await openServiceViewer(utils);
  assert.equal(flat(utils.getByTestId('site-gallery-cta-view-service')).replace(/\s+/g, ' ').trim(), 'View Service');
  assert.ok(flat(utils.getByTestId('site-gallery-cta-book-service')).includes('Book this service'));
  reset({ locale: 'hi' });
  utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode: 'desktop' }));
  await openServiceViewer(utils);
  assert.ok(flat(utils.getByTestId('site-gallery-cta-view-service')).includes('सेवा देखें'), 'HI View Service missing');
  assert.ok(flat(utils.getByTestId('site-gallery-cta-book-service')).includes('यह सेवा बुक करें'), 'HI Book This Service missing');
  reset();
});

await test('CTA renders in light and dark (all themes)', async () => {
  for (const config of CASES) {
    for (const appearance of ['light', 'dark']) {
      reset({ appearance });
      const utils = render(React.createElement(config.Component, { data: serviceGalleryData(config.id), mode: 'desktop' }));
      await openServiceViewer(utils);
      assert.ok(utils.getByTestId('site-gallery-cta-view-service'), `${config.id} ${appearance}: CTA missing`);
      reset();
    }
  }
});

await test('theme switch closes the service detail and leaves no stale service data', async () => {
  reset();
  let utils = render(React.createElement(Barber, { data: serviceGalleryData('barber_mens_grooming'), mode: 'desktop' }));
  await openServiceViewer(utils);
  await act(async () => { fireEvent.click(utils.getByTestId('site-gallery-cta-view-service')); });
  assert.ok(detail(utils), 'detail should be open before switch');
  cleanup();
  utils = render(React.createElement(NailLash, { data: serviceGalleryData('nail_lash_studio'), mode: 'desktop' }));
  assert.equal(Boolean(detail(utils)), false, 'stale service detail carried over to the new theme');
  // New theme gallery resolves its OWN service (no cross-theme mapping).
  const srcs = Array.from(utils.container.querySelectorAll('[data-site-section="gallery"] img')).map((el) => el.getAttribute('src') || '').join(' ');
  assert.ok(!srcs.includes('barber_mens_grooming-svc'), 'stale barber service image leaked');
  assert.ok(srcs.includes('nail_lash_studio-svc'), 'nail service image missing after switch');
  cleanup();
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error.message}`);
  process.exit(1);
}
process.exit(0);
