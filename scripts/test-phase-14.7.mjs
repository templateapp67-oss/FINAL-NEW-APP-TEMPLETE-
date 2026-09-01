/**
 * PHASE 14.7 — OWNER/ADMIN GALLERY APPROVAL (moderation) acceptance test.
 *
 * Verifies the moderation layer on top of 14.1/14.6 (no duplicate gallery):
 *   1. Status flow — Upload → Pending → Approve/Reject → Published/Rejected.
 *   2. Owner/admin controls — view pending, approve, reject (with reason),
 *      unpublish, reactivate approved content.
 *   3. Publish validation — correct theme/category/service/media/before-after;
 *      invalid mapping must NOT be published.
 *   4. Theme isolation — cross-theme publishing is blocked.
 *   5. Customer visibility — only approved + active content is public.
 *   6. Security — only authorized owner/admin can moderate (existing
 *      ownership logic; no invented ids, no credentials).
 *   7. UI — thumbnail, theme, category, linked service, status, approve,
 *      reject, unpublish, responsive.
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
globalThis.File = dom.window.File;
globalThis.FileReader = dom.window.FileReader;
globalThis.Blob = dom.window.Blob;
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
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const React = (await import('react')).default;
const { render, cleanup, fireEvent, act } = await import('@testing-library/react');

const GalleryModerationPanel = (await import('../src/components/GalleryModerationPanel.tsx')).default;
const StepPhotos = (await import('../src/screens/StepPhotos.tsx')).default;

const { initialData } = await import('../src/types.ts');
const {
  effectiveModeration,
  isCustomerVisibleGalleryItem,
  isPublishedGalleryItem,
  approveGalleryItem,
  rejectGalleryItem,
  unpublishGalleryItem,
  reactivateGalleryItem,
  setGalleryModerationStatus,
  validateGalleryItemForPublish,
  canPublishGalleryItem,
  canModerateGallery,
} = await import('../src/lib/galleryModeration.ts');
const { customerGalleryForTheme } = await import('../src/lib/galleryManagement.ts');
const { galleryItemsForTheme } = await import('../src/lib/siteGallery.ts');

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

const barberServices = [
  { id: 'b1', name: 'Barber Skin Fade', category: 'Haircuts', description: '', price: 400, duration: 30, themeId: 'barber_mens_grooming', status: 'active', media: { imageUrl: 'https://images.unsplash.com/barber-fade.jpg' } },
];
const nailServices = [
  { id: 'n1', name: 'Nail Chrome Set', category: 'Nail Art & Gel', description: '', price: 900, duration: 60, themeId: 'nail_lash_studio', status: 'active', media: { imageUrl: 'https://images.unsplash.com/nail-chrome.jpg' } },
];

const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* 1. Status flow                                                      */
/* ------------------------------------------------------------------ */

section('Status flow');

await test('effective moderation: absent = grandfathered approved (existing data stays public)', () => {
  assert.equal(effectiveModeration({ id: 'x', url: 'u' }), 'approved');
  assert.equal(effectiveModeration(null), 'approved');
  assert.equal(effectiveModeration({ id: 'x', url: 'u', moderation: 'pending' }), 'pending');
  assert.equal(effectiveModeration({ id: 'x', url: 'u', moderation: 'rejected' }), 'rejected');
  assert.equal(effectiveModeration({ id: 'x', url: 'u', moderation: 'approved' }), 'approved');
});

await test('customer visibility: only approved + active is public', () => {
  assert.equal(isCustomerVisibleGalleryItem({ id: 'a', url: 'u' }), true, 'grandfathered active item must be visible');
  assert.equal(isCustomerVisibleGalleryItem({ id: 'a', url: 'u', status: 'active', moderation: 'approved' }), true);
  assert.equal(isCustomerVisibleGalleryItem({ id: 'a', url: 'u', moderation: 'pending' }), false);
  assert.equal(isCustomerVisibleGalleryItem({ id: 'a', url: 'u', moderation: 'rejected' }), false);
  assert.equal(isCustomerVisibleGalleryItem({ id: 'a', url: 'u', status: 'inactive', moderation: 'approved' }), false);
  assert.equal(isCustomerVisibleGalleryItem(null), false);
  assert.equal(isPublishedGalleryItem({ id: 'a', url: 'u' }), true);
});

await test('approve / reject / unpublish / reactivate transitions', () => {
  const pending = { id: 'a', url: 'u', moderation: 'pending', status: 'active' };
  const approved = approveGalleryItem(pending);
  assert.equal(approved.moderation, 'approved');
  assert.equal(approved.rejectionReason, undefined);
  assert.ok(approved.reviewedAt, 'reviewedAt missing');

  const rejected = rejectGalleryItem(pending, 'Low quality');
  assert.equal(rejected.moderation, 'rejected');
  assert.equal(rejected.rejectionReason, 'Low quality');
  assert.equal(rejected.status, 'inactive');

  const unpublished = unpublishGalleryItem(approved);
  assert.equal(unpublished.status, 'inactive');

  const reactivated = reactivateGalleryItem(unpublished);
  assert.equal(reactivated.status, 'active');
});

await test('reactivate only works for approved content (pending/rejected stay hidden)', () => {
  assert.equal(reactivateGalleryItem({ id: 'a', url: 'u', moderation: 'pending', status: 'inactive' }).status, 'inactive');
  assert.equal(reactivateGalleryItem({ id: 'a', url: 'u', moderation: 'rejected', status: 'inactive' }).status, 'inactive');
  const reactivated = reactivateGalleryItem({ id: 'a', url: 'u', status: 'inactive' });
  assert.equal(reactivated.status, 'active');
});

await test('setGalleryModerationStatus routes to approve/reject/pending', () => {
  assert.equal(setGalleryModerationStatus({ id: 'a', url: 'u' }, 'approved').moderation, 'approved');
  assert.equal(setGalleryModerationStatus({ id: 'a', url: 'u' }, 'rejected', 'Bad').rejectionReason, 'Bad');
  assert.equal(setGalleryModerationStatus({ id: 'a', url: 'u' }, 'pending').moderation, 'pending');
});

/* ------------------------------------------------------------------ */
/* 2. Publish validation                                               */
/* ------------------------------------------------------------------ */

section('Publish validation');

await test('valid item publishes; invalid media/theme/service/before is blocked', () => {
  const data = salonData('barber_mens_grooming', { services: barberServices });
  const valid = { id: 'ok', url: 'https://images.unsplash.com/ok.jpg', themeId: 'barber_mens_grooming', category: 'Barber', serviceId: 'b1' };
  assert.deepEqual(validateGalleryItemForPublish(data, valid, 'barber_mens_grooming'), []);
  assert.equal(canPublishGalleryItem(data, valid, 'barber_mens_grooming'), true);

  const unsafeMedia = validateGalleryItemForPublish(data, { id: 'x', url: 'javascript:alert(1)' }, 'barber_mens_grooming');
  assert.ok(unsafeMedia.some((e) => /URL/.test(e)), 'unsafe URL not caught');

  const badTheme = validateGalleryItemForPublish(data, { id: 'x', url: 'https://images.unsplash.com/x.jpg', themeId: 'not-a-theme' }, 'barber_mens_grooming');
  assert.ok(badTheme.some((e) => /theme/i.test(e)), 'invalid theme not caught');

  const crossTheme = validateGalleryItemForPublish(
    data,
    { id: 'x', url: 'https://images.unsplash.com/x.jpg', themeId: 'barber_mens_grooming', serviceId: 'n1' },
    'barber_mens_grooming',
  );
  assert.ok(crossTheme.some((e) => /service/i.test(e)), 'cross-theme service not caught');

  const unsafeBefore = validateGalleryItemForPublish(data, { id: 'x', url: 'https://images.unsplash.com/x.jpg', beforeUrl: 'ftp://x' }, 'barber_mens_grooming');
  assert.ok(unsafeBefore.some((e) => /before/i.test(e)), 'unsafe before image not caught');
});

await test('a service linked to a foreign theme can never publish (cross-theme blocked)', () => {
  const data = salonData('barber_mens_grooming', { services: [...barberServices, ...nailServices] });
  const item = { id: 'x', url: 'https://images.unsplash.com/x.jpg', themeId: 'barber_mens_grooming', serviceId: 'n1' };
  assert.equal(canPublishGalleryItem(data, item, 'barber_mens_grooming'), false);
});

/* ------------------------------------------------------------------ */
/* 3. Security                                                         */
/* ------------------------------------------------------------------ */

section('Security — authorization gate');

await test('only authorized owner/admin (or local draft) can moderate', () => {
  assert.equal(canModerateGallery('authorized'), true);
  assert.equal(canModerateGallery('not-configured'), true);
  assert.equal(canModerateGallery('not-authenticated'), false);
  assert.equal(canModerateGallery('no-ownership'), false);
  assert.equal(canModerateGallery('ambiguous'), false);
  assert.equal(canModerateGallery('permission-denied'), false);
  assert.equal(canModerateGallery('error'), false);
});

/* ------------------------------------------------------------------ */
/* 4. Customer visibility integration                                  */
/* ------------------------------------------------------------------ */

section('Customer visibility integration');

await test('customerGalleryForTheme hides pending/rejected/unpublished, shows approved (all 5 themes)', () => {
  const themes = ['barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa', 'family_full_service', 'nail_lash_studio'];
  for (const themeId of themes) {
    const data = salonData(themeId, {
      gallery: [
        { id: 'approved', url: 'https://images.unsplash.com/ap.jpg', themeId, moderation: 'approved' },
        { id: 'grandfathered', url: 'https://images.unsplash.com/gf.jpg', themeId },
        { id: 'pending', url: 'https://images.unsplash.com/pd.jpg', themeId, moderation: 'pending' },
        { id: 'rejected', url: 'https://images.unsplash.com/rj.jpg', themeId, moderation: 'rejected' },
        { id: 'unpublished', url: 'https://images.unsplash.com/up.jpg', themeId, moderation: 'approved', status: 'inactive' },
      ],
    });
    const ids = customerGalleryForTheme(data, themeId).map((i) => i.id);
    assert.deepEqual(ids.sort(), ['approved', 'grandfathered'], `${themeId}: only approved + grandfathered should be public, got ${ids.join(',')}`);
  }
});

await test('cross-theme: a nail-scoped item never appears in the barber customer gallery', () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [
      { id: 'bb', url: 'https://images.unsplash.com/bb.jpg', themeId: 'barber_mens_grooming', moderation: 'approved' },
      { id: 'nn', url: 'https://images.unsplash.com/nn.jpg', themeId: 'nail_lash_studio', moderation: 'approved' },
    ],
  });
  assert.deepEqual(customerGalleryForTheme(data, 'barber_mens_grooming').map((i) => i.id), ['bb']);
  assert.deepEqual(customerGalleryForTheme(data, 'nail_lash_studio').map((i) => i.id), ['nn']);
});

await test('public SiteGallery projection hides pending owner items', () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [
      { id: 'ok', url: 'https://images.unsplash.com/ok.jpg', category: 'Barber' },
      { id: 'pd', url: 'https://images.unsplash.com/pd.jpg', category: 'Barber', moderation: 'pending' },
    ],
  });
  const items = galleryItemsForTheme('barber_mens_grooming', data, 'en');
  assert.ok(items.some((i) => i.src.includes('ok.jpg')), 'approved owner item missing');
  assert.ok(!items.some((i) => i.src.includes('pd.jpg')), 'pending owner item leaked into public gallery');
});

/* ------------------------------------------------------------------ */
/* 5. Moderation UI                                                    */
/* ------------------------------------------------------------------ */

section('Moderation UI');

function renderPanel(data, canModerate = true) {
  let saved = null;
  // Mirrors React's `Dispatch<SetStateAction<T>>`: the screens use functional
  // updates so an async upload can never write back a stale gallery array.
  let state = data;
  const setData = (d) => {
    state = typeof d === 'function' ? d(state) : d;
    saved = state;
  };
  const utils = render(React.createElement(GalleryModerationPanel, { data, setData, onSave: () => {}, canModerate }));
  return { utils, getSaved: () => saved };
}

const uiItem = (overrides = {}) => ({
  id: 'g1',
  url: 'https://images.unsplash.com/g1.jpg',
  alt: 'Barber cut',
  title: 'Signature Fade',
  category: 'Barber',
  themeId: 'barber_mens_grooming',
  serviceId: 'b1',
  status: 'active',
  moderation: 'pending',
  ...overrides,
});

await test('panel lists thumbnail, theme, category, linked service and status', () => {
  const data = salonData('barber_mens_grooming', { gallery: [uiItem()], services: barberServices });
  const { utils } = renderPanel(data);
  assert.ok(utils.getByTestId('gallery-moderation-panel'), 'panel missing');
  assert.ok(utils.container.querySelector('[data-testid="gallery-moderation-item"]'), 'item row missing');
  assert.equal(flat(utils.getByTestId('gallery-moderation-status')), 'Pending');
  assert.ok(flat(utils.getByTestId('gallery-moderation-theme')).includes('Barber'), 'theme label missing');
  assert.equal(flat(utils.getByTestId('gallery-moderation-category')), 'Barber');
  assert.equal(flat(utils.getByTestId('gallery-moderation-service')), 'Barber Skin Fade');
  cleanup();
});

await test('approve flow: pending → approved → published (appears in customer gallery)', () => {
  const data = salonData('barber_mens_grooming', { gallery: [uiItem()], services: barberServices });
  const { utils, getSaved } = renderPanel(data);
  assert.equal(customerGalleryForTheme(data, 'barber_mens_grooming').length, 0, 'pending must not be public yet');
  act(() => { fireEvent.click(utils.getByTestId('gallery-moderation-approve-g1')); });
  const saved = getSaved();
  assert.ok(saved, 'setData not called on approve');
  assert.equal(saved.gallery.find((g) => g.id === 'g1').moderation, 'approved');
  assert.equal(customerGalleryForTheme(saved, 'barber_mens_grooming').length, 1, 'approved item should be public');
  cleanup();
});

await test('approve is blocked for invalid mapping (cross-theme service)', () => {
  const data = salonData('barber_mens_grooming', { gallery: [uiItem({ serviceId: 'n1' })], services: [...barberServices, ...nailServices] });
  const { utils, getSaved } = renderPanel(data);
  act(() => { fireEvent.click(utils.getByTestId('gallery-moderation-approve-g1')); });
  assert.ok(utils.container.querySelector('[data-testid="gallery-moderation-error"]'), 'validation error missing');
  assert.ok(flat(utils.container.querySelector('[data-testid="gallery-moderation-error"]')).includes('service'), 'cross-theme service error not shown');
  assert.equal(getSaved(), null, 'invalid item must not be approved/published');
  cleanup();
});

await test('reject flow: reason stored, item hidden from customer gallery', () => {
  const data = salonData('barber_mens_grooming', { gallery: [uiItem({ moderation: 'approved' })], services: barberServices });
  const { utils, getSaved } = renderPanel(data);
  assert.equal(customerGalleryForTheme(data, 'barber_mens_grooming').length, 1, 'approved item should start public');
  act(() => { fireEvent.click(utils.getByTestId('gallery-moderation-reject-g1')); });
  act(() => {
    fireEvent.change(utils.getByTestId('gallery-moderation-reject-input'), { target: { value: 'Blurry photo' } });
  });
  act(() => { fireEvent.click(utils.getByTestId('gallery-moderation-reject-confirm')); });
  const saved = getSaved();
  const item = saved.gallery.find((g) => g.id === 'g1');
  assert.equal(item.moderation, 'rejected');
  assert.equal(item.rejectionReason, 'Blurry photo');
  assert.equal(item.status, 'inactive');
  assert.equal(customerGalleryForTheme(saved, 'barber_mens_grooming').length, 0, 'rejected item must be hidden');
  cleanup();
});

await test('unpublish hides; reactivate restores approved content', () => {
  const data = salonData('barber_mens_grooming', { gallery: [uiItem({ moderation: 'approved' })], services: barberServices });
  const { utils, getSaved } = renderPanel(data);
  act(() => { fireEvent.click(utils.getByTestId('gallery-moderation-unpublish-g1')); });
  let saved = getSaved();
  assert.equal(saved.gallery.find((g) => g.id === 'g1').status, 'inactive');
  assert.equal(customerGalleryForTheme(saved, 'barber_mens_grooming').length, 0, 'unpublished item must be hidden');
  // Re-render with the unpublished data to get the reactivate button.
  cleanup();
  const second = renderPanel(saved);
  act(() => { fireEvent.click(second.utils.getByTestId('gallery-moderation-reactivate-g1')); });
  saved = second.getSaved();
  assert.equal(saved.gallery.find((g) => g.id === 'g1').status, 'active');
  assert.equal(customerGalleryForTheme(saved, 'barber_mens_grooming').length, 1, 'reactivated item should be public again');
  cleanup();
});

await test('unauthorized user is blocked (locked notice, no moderation buttons)', () => {
  const data = salonData('barber_mens_grooming', { gallery: [uiItem()], services: barberServices });
  const { utils } = renderPanel(data, false);
  assert.ok(utils.getByTestId('gallery-moderation-locked'), 'locked notice missing');
  assert.equal(Boolean(utils.container.querySelector('[data-testid="gallery-moderation-approve-g1"]')), false, 'approve button leaked for unauthorized');
  assert.equal(Boolean(utils.container.querySelector('[data-testid="gallery-moderation-reject-g1"]')), false, 'reject button leaked for unauthorized');
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 6. Upload → Pending (StepPhotos)                                    */
/* ------------------------------------------------------------------ */

section('Upload → Pending');

await test('new uploads enter moderation as pending', async () => {
  const data = salonData('barber_mens_grooming', { gallery: [], services: barberServices });
  let saved = null;
  // Mirrors React's `Dispatch<SetStateAction<T>>`: the screens use functional
  // updates so an async upload can never write back a stale gallery array.
  let state = data;
  const setData = (d) => {
    state = typeof d === 'function' ? d(state) : d;
    saved = state;
  };
  const utils = render(React.createElement(StepPhotos, { data, setData, onNext: () => {}, onPrev: () => {}, onSave: () => {} }));
  const input = utils.getByTestId('gallery-file-input');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['img'], 'a.png', { type: 'image/png' })] } });
    await new Promise((r) => setTimeout(r, 20));
  });
  assert.ok(saved && saved.gallery.length === 1, 'upload should add one item');
  assert.equal(saved.gallery[0].moderation, 'pending', 'new upload must be pending');
  assert.equal(saved.gallery[0].status, 'active');
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
