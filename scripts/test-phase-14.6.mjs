/**
 * PHASE 14.6 — GALLERY MANAGEMENT (owner/admin) acceptance test, all 5 themes.
 *
 * Verifies the owner-facing management layer (built on the existing 14.1
 * gallery, no duplicate system):
 *   1. Media validation — image type + reasonable size; upload progress +
 *      error with retry; a broken upload never creates an incomplete record.
 *   2. Theme isolation — an item is assigned to exactly one of the five themes;
 *      cross-theme assignment is prevented; a foreign theme's service can never
 *      be linked.
 *   3. Service link — resolved only through the active theme's services;
 *      invalid references fail gracefully.
 *   4. Before/After — both images share the item's single theme scope.
 *   5. Display order + activate/deactivate + the customer projection (active +
 *      theme-scoped + ordered).
 *   6. Authorization — reuses the existing auth + ownership resolution; no
 *      credentials/salon-ids invented.
 *   7. Owner save → customer gallery for the correct theme, without showing
 *      another theme's content.
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

const StepPhotos = (await import('../src/screens/StepPhotos.tsx')).default;

const { initialData } = await import('../src/types.ts');
const {
  GALLERY_MANAGEMENT_THEMES,
  GALLERY_OWNER_CATEGORIES,
  GALLERY_MAX_FILE_BYTES,
  galleryManagementThemeLabel,
  validateGalleryImageType,
  validateGalleryImageSize,
  validateGalleryImageFile,
  galleryItemTheme,
  galleryItemAppearsOnTheme,
  galleryWorkCategoryForTheme,
  normalizeGalleryCategory,
  galleryServicesForTheme,
  resolveLinkedGalleryService,
  linkGalleryService,
  isBeforeAfterItem,
  beforeAfterThemesMatch,
  sortGalleryByDisplayOrder,
  applyGalleryDisplayOrder,
  activeGalleryItems,
  setGalleryItemStatus,
  nextGalleryDisplayOrder,
  customerGalleryForTheme,
  validateGalleryItemForTheme,
  galleryEditPermission,
  galleryEditDeniedMessage,
  createManagedGalleryItem,
  readGalleryFileAsDataUrl,
} = await import('../src/lib/galleryManagement.ts');

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
  { id: 'b2', name: 'Beard Sculpt', category: 'Beard & Shave', description: '', price: 300, duration: 20, themeId: 'barber_mens_grooming', status: 'active' },
];
const nailServices = [
  { id: 'n1', name: 'Nail Chrome Set', category: 'Nail Art & Gel', description: '', price: 900, duration: 60, themeId: 'nail_lash_studio', status: 'active', media: { imageUrl: 'https://images.unsplash.com/nail-chrome.jpg' } },
];

/* ------------------------------------------------------------------ */
/* 1. Media validation                                                 */
/* ------------------------------------------------------------------ */

section('Media validation');

await test('image type validation accepts images and rejects non-images', () => {
  assert.equal(validateGalleryImageType(null), 'Please choose an image.');
  assert.equal(validateGalleryImageType(undefined), 'Please choose an image.');
  assert.equal(validateGalleryImageType({ type: 'application/pdf' }), 'Please upload an image file (JPG, PNG, WEBP, or GIF).');
  assert.equal(validateGalleryImageType({ type: 'image/jpeg' }), null);
  assert.equal(validateGalleryImageType({ type: 'image/png' }), null);
  assert.equal(validateGalleryImageType({ type: 'image/webp' }), null);
});

await test('image size validation caps at the reasonable limit', () => {
  assert.equal(validateGalleryImageSize({ size: GALLERY_MAX_FILE_BYTES + 1 }), `Image must be 5 MB or smaller.`);
  assert.equal(validateGalleryImageSize({ size: GALLERY_MAX_FILE_BYTES }), null);
  assert.equal(validateGalleryImageSize({ size: 100_000 }), null);
});

await test('combined file gate surfaces the first problem only', () => {
  assert.equal(validateGalleryImageFile(null), 'Please choose an image.');
  assert.equal(validateGalleryImageFile({ type: 'image/jpeg', size: GALLERY_MAX_FILE_BYTES }), null);
  assert.match(validateGalleryImageFile({ type: 'application/pdf', size: 999 }), /image file/i);
  assert.match(validateGalleryImageFile({ type: 'image/png', size: GALLERY_MAX_FILE_BYTES + 5 }), /MB or smaller/);
});

await test('readGalleryFileAsDataUrl resolves a data URL and reports progress', async () => {
  const file = new File(['abc'], 'a.png', { type: 'image/png' });
  const seen = [];
  const url = await readGalleryFileAsDataUrl(file, (p) => seen.push(p));
  assert.match(url, /^data:image\/png;base64,/);
  assert.ok(seen.includes(100), 'progress should reach 100');
});

/* ------------------------------------------------------------------ */
/* 2. Theme isolation                                                  */
/* ------------------------------------------------------------------ */

section('Theme isolation');

await test('management offers exactly the five gallery themes with labels', () => {
  assert.deepEqual(GALLERY_MANAGEMENT_THEMES, [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ]);
  assert.equal(galleryManagementThemeLabel('barber_mens_grooming'), "Barber & Men's Grooming");
  assert.equal(galleryManagementThemeLabel('nail_lash_studio'), 'Nail & Lash Studio');
});

await test('item theme resolves, and appearance is theme-scoped (no cross-theme)', () => {
  const scoped = { id: 'x', url: 'https://a.example/x.jpg', themeId: 'barber_mens_grooming' };
  const unscoped = { id: 'y', url: 'https://a.example/y.jpg' };
  assert.equal(galleryItemTheme(scoped), 'barber_mens_grooming');
  assert.equal(galleryItemTheme({ ...scoped, themeId: 'not-a-theme' }), null);
  assert.equal(galleryItemTheme(unscoped), null);
  assert.equal(galleryItemAppearsOnTheme(scoped, 'barber_mens_grooming'), true);
  assert.equal(galleryItemAppearsOnTheme(scoped, 'nail_lash_studio'), false);
  assert.equal(galleryItemAppearsOnTheme(unscoped, 'nail_lash_studio'), true);
});

await test('generic category tags normalise and map per theme', () => {
  assert.equal(normalizeGalleryCategory('Barber'), 'Barber');
  assert.equal(normalizeGalleryCategory('junk!'), 'General');
  assert.equal(normalizeGalleryCategory(undefined), 'General');
  // Barber tag → beard work on barber; Beauty tag → nailArt on nail/lash.
  assert.equal(galleryWorkCategoryForTheme({ category: 'Barber' }, 'barber_mens_grooming'), 'beard');
  assert.equal(galleryWorkCategoryForTheme({ category: 'Beauty' }, 'nail_lash_studio'), 'nailArt');
});

/* ------------------------------------------------------------------ */
/* 3. Service link (theme-scoped)                                      */
/* ------------------------------------------------------------------ */

section('Service link');

await test('service list is the active theme only; cross-theme services never resolve', () => {
  const data = salonData('barber_mens_grooming', { services: [...barberServices, ...nailServices] });
  const services = galleryServicesForTheme(data, 'barber_mens_grooming');
  assert.ok(services.some((s) => s.id === 'b1'), 'own service missing');
  assert.ok(!services.some((s) => s.id === 'n1'), 'foreign service leaked into service list');
});

await test('linkGalleryService accepts own-theme services and rejects foreign/missing', () => {
  const data = salonData('barber_mens_grooming', { services: [...barberServices, ...nailServices] });
  const ok = linkGalleryService(data, 'b1', 'barber_mens_grooming');
  assert.equal(ok.ok, true);
  assert.equal(ok.service.id, 'b1');
  const foreign = linkGalleryService(data, 'n1', 'barber_mens_grooming');
  assert.equal(foreign.ok, false);
  assert.match(foreign.error, /not available for this theme/i);
  const missing = linkGalleryService(data, 'nope', 'barber_mens_grooming');
  assert.equal(missing.ok, false);
  assert.equal(linkGalleryService(data, '', 'barber_mens_grooming').ok, false);
});

await test('resolveLinkedGalleryService fails gracefully for invalid ids', () => {
  const data = salonData('barber_mens_grooming', { services: barberServices });
  const item = { id: 'x', url: 'https://a.example/x.jpg', serviceId: 'b1' };
  assert.equal(resolveLinkedGalleryService(data, item, 'barber_mens_grooming')?.id, 'b1');
  assert.equal(resolveLinkedGalleryService(data, { ...item, serviceId: 'n1' }, 'barber_mens_grooming'), null);
  assert.equal(resolveLinkedGalleryService(data, { ...item, serviceId: null }, 'barber_mens_grooming'), null);
});

/* ------------------------------------------------------------------ */
/* 4. Before/After                                                     */
/* ------------------------------------------------------------------ */

section('Before/After');

await test('before/after needs both safe images; pair shares one theme scope', () => {
  const pair = { id: 'x', url: 'https://a.example/after.jpg', beforeUrl: 'https://a.example/before.jpg' };
  assert.equal(isBeforeAfterItem(pair), true);
  assert.equal(isBeforeAfterItem({ ...pair, beforeUrl: undefined }), false);
  assert.equal(isBeforeAfterItem({ ...pair, url: 'javascript:alert(1)' }), false);
  assert.equal(beforeAfterThemesMatch('barber_mens_grooming', 'barber_mens_grooming'), true);
  assert.equal(beforeAfterThemesMatch('barber_mens_grooming', 'nail_lash_studio'), false);
  assert.equal(beforeAfterThemesMatch(null, undefined), true);
});

/* ------------------------------------------------------------------ */
/* 5. Display order + status                                           */
/* ------------------------------------------------------------------ */

section('Display order + activate/deactivate');

await test('display order sorts stably and can be rewritten', () => {
  const a = { id: 'a', url: 'https://a.example/a.jpg', displayOrder: 2 };
  const b = { id: 'b', url: 'https://a.example/b.jpg', displayOrder: 0 };
  const c = { id: 'c', url: 'https://a.example/c.jpg' };
  const sorted = sortGalleryByDisplayOrder([a, b, c]).map((i) => i.id);
  assert.deepEqual(sorted, ['b', 'a', 'c']);
  const rewritten = applyGalleryDisplayOrder([a, b, c], ['c', 'a', 'b']);
  assert.equal(rewritten.find((i) => i.id === 'c').displayOrder, 0);
  assert.equal(rewritten.find((i) => i.id === 'a').displayOrder, 1);
  assert.equal(rewritten.find((i) => i.id === 'b').displayOrder, 2);
});

await test('next order value + status helpers', () => {
  assert.equal(nextGalleryDisplayOrder([]), 0);
  assert.equal(nextGalleryDisplayOrder([{ id: 'a', url: 'u', displayOrder: 4 }]), 5);
  const active = { id: 'a', url: 'u' };
  assert.equal(setGalleryItemStatus(active, 'inactive').status, 'inactive');
  assert.deepEqual(activeGalleryItems([active, { id: 'b', url: 'u', status: 'inactive' }]).map((i) => i.id), ['a']);
});

/* ------------------------------------------------------------------ */
/* 6. Customer projection                                              */
/* ------------------------------------------------------------------ */

section('Customer projection');

await test('customerGalleryForTheme keeps active + theme-scoped + ordered, drops unsafe', () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [
      { id: 'ok1', url: 'https://a.example/ok1.jpg', themeId: 'barber_mens_grooming', displayOrder: 1 },
      { id: 'ok2', url: 'https://a.example/ok2.jpg', themeId: 'barber_mens_grooming', displayOrder: 0 },
      { id: 'foreign', url: 'https://a.example/foreign.jpg', themeId: 'nail_lash_studio' },
      { id: 'inactive', url: 'https://a.example/inactive.jpg', themeId: 'barber_mens_grooming', status: 'inactive' },
      { id: 'unsafe', url: 'javascript:alert(1)', themeId: 'barber_mens_grooming' },
    ],
  });
  const ids = customerGalleryForTheme(data, 'barber_mens_grooming').map((i) => i.id);
  assert.deepEqual(ids, ['ok2', 'ok1'], `expected ordered active barber items, got ${ids.join(',')}`);
});

await test('validateGalleryItemForTheme catches unsafe/invalid service/bad status', () => {
  const data = salonData('barber_mens_grooming', { services: barberServices });
  assert.deepEqual(validateGalleryItemForTheme(data, { id: 'ok', url: 'https://a.example/a.jpg' }, 'barber_mens_grooming'), []);
  const problems = validateGalleryItemForTheme(data, {
    id: 'bad', url: 'javascript:alert(1)', themeId: 'nope', beforeUrl: 'ftp://x', serviceId: 'n1', status: 'weird',
  }, 'barber_mens_grooming');
  assert.ok(problems.length >= 4, `expected multiple problems, got ${problems.length}`);
});

/* ------------------------------------------------------------------ */
/* 7. Authorization                                                    */
/* ------------------------------------------------------------------ */

section('Authorization');

await test('edit permission maps the existing ownership resolution (no invented ids)', () => {
  assert.equal(galleryEditPermission(false, { status: 'not-configured' }), 'not-configured');
  assert.equal(galleryEditPermission(true, { status: 'resolved' }), 'authorized');
  assert.equal(galleryEditPermission(false, { status: 'resolved' }), 'not-authenticated');
  assert.equal(galleryEditPermission(true, { status: 'not-authenticated' }), 'not-authenticated');
  assert.equal(galleryEditPermission(true, { status: 'no-membership' }), 'no-ownership');
  assert.equal(galleryEditPermission(true, { status: 'ambiguous' }), 'ambiguous');
  assert.equal(galleryEditPermission(true, { status: 'permission-denied' }), 'permission-denied');
  assert.equal(galleryEditPermission(true, null), 'not-configured');
});

await test('denied message only for non-authorized/non-draft states', () => {
  assert.equal(galleryEditDeniedMessage('authorized'), null);
  assert.equal(galleryEditDeniedMessage('not-configured'), null);
  assert.equal(galleryEditDeniedMessage('not-authenticated'), 'Please log in to manage your gallery.');
  assert.equal(galleryEditDeniedMessage('permission-denied'), 'You do not have permission to manage this gallery.');
});

/* ------------------------------------------------------------------ */
/* 8. Managed item factory + additive data model                       */
/* ------------------------------------------------------------------ */

section('Managed item factory + additive data model');

await test('createManagedGalleryItem normalises and defaults safely', () => {
  const item = createManagedGalleryItem({ id: 'm1', url: 'https://a.example/m1.jpg', category: 'junk', themeId: 'nail_lash_studio' });
  assert.equal(item.category, 'General');
  assert.equal(item.themeId, 'nail_lash_studio');
  assert.equal(item.status, 'active');
  assert.equal(item.serviceId, null);
});

await test('GalleryImage keeps all prior fields (additive — no migration loss)', () => {
  const src = fs.readFileSync('src/types.ts', 'utf8');
  for (const field of ['url: string', 'alt?: string', 'category?', 'themeId?', 'beforeUrl?', 'beforeAlt?', 'caption?', 'featured?']) {
    assert.ok(src.includes(field), `GalleryImage lost prior field: ${field}`);
  }
  for (const field of ['title?: string', 'description?: string', 'serviceId?: string | null', 'displayOrder?: number', "status?: 'active' | 'inactive'"]) {
    assert.ok(src.includes(field), `GalleryImage missing 14.6 field: ${field}`);
  }
});

/* ------------------------------------------------------------------ */
/* 9. Owner management UI (StepPhotos)                                 */
/* ------------------------------------------------------------------ */

section('Owner management UI');

async function renderStepPhotos(data, onSave = () => {}) {
  let saved = null;
  const setData = (d) => { saved = d; };
  const utils = render(React.createElement(StepPhotos, { data, setData, onNext: () => {}, onPrev: () => {}, onSave }));
  return { utils, getSaved: () => saved };
}

await test('edit modal exposes theme/category/title/description/service/status + before/after', async () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [{ id: 'g1', url: 'https://images.unsplash.com/g1.jpg', alt: 'Cut', category: 'Barber', title: 'Fade' }],
    services: barberServices,
  });
  const { utils } = await renderStepPhotos(data);
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-edit-item')); });
  assert.ok(utils.container.querySelector('[data-testid="gallery-edit-modal"]'), 'edit modal missing');
  assert.equal(utils.getByTestId('gallery-theme-select').tagName, 'SELECT');
  assert.equal(utils.getByTestId('gallery-category-select').tagName, 'SELECT');
  assert.equal(utils.getByTestId('gallery-title-input').value, 'Fade');
  assert.equal(utils.getByTestId('gallery-description-input').tagName, 'INPUT');
  assert.ok(utils.getByTestId('gallery-service-select'), 'service select missing');
  assert.ok(utils.getByTestId('gallery-before-upload'), 'before upload missing');
  assert.ok(utils.getByTestId('gallery-status-toggle'), 'status toggle missing');
  cleanup();
});

await test('saving assigns theme + title + service + status to the managed item', async () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [{ id: 'g1', url: 'https://images.unsplash.com/g1.jpg', alt: 'Cut', category: 'General' }],
    services: barberServices,
  });
  const { utils, getSaved } = await renderStepPhotos(data);
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-edit-item')); });
  await act(async () => { fireEvent.change(utils.getByTestId('gallery-theme-select'), { target: { value: 'barber_mens_grooming' } }); });
  await act(async () => { fireEvent.change(utils.getByTestId('gallery-category-select'), { target: { value: 'Barber' } }); });
  await act(async () => { fireEvent.change(utils.getByTestId('gallery-title-input'), { target: { value: 'Signature Fade' } }); });
  await act(async () => { fireEvent.change(utils.getByTestId('gallery-description-input'), { target: { value: 'Fresh fade result' } }); });
  await act(async () => { fireEvent.change(utils.getByTestId('gallery-service-select'), { target: { value: 'b1' } }); });
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-status-toggle')); });
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-save-details')); });
  const saved = getSaved();
  assert.ok(saved, 'setData was not called on save');
  const item = saved.gallery.find((g) => g.id === 'g1');
  assert.ok(item, 'managed item missing from saved data');
  assert.equal(item.themeId, 'barber_mens_grooming');
  assert.equal(item.category, 'Barber');
  assert.equal(item.title, 'Signature Fade');
  assert.equal(item.description, 'Fresh fade result');
  assert.equal(item.serviceId, 'b1');
  assert.equal(item.status, 'inactive');
  cleanup();
});

await test('invalid upload shows an error (no incomplete record) and valid upload adds an item', async () => {
  const data = salonData('barber_mens_grooming', { gallery: [], services: barberServices });
  const { utils, getSaved } = await renderStepPhotos(data);
  const input = utils.getByTestId('gallery-file-input');
  // Invalid type → error, nothing added.
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } });
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(utils.container.querySelector('[data-testid="gallery-upload-error"]'), 'upload error missing');
  assert.ok(utils.getByTestId('gallery-upload-retry'), 'retry missing');
  assert.equal(getSaved(), null, 'invalid upload must not create a record');
  // Valid image → one item added with active status + displayOrder.
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['img'], 'a.png', { type: 'image/png' })] } });
    await new Promise((r) => setTimeout(r, 20));
  });
  const saved = getSaved();
  assert.ok(saved && saved.gallery.length === 1, 'valid upload should add one item');
  assert.equal(saved.gallery[0].status, 'active');
  assert.equal(saved.gallery[0].displayOrder, 0);
  cleanup();
});

await test('before image upload stores a Before/After pair on save', async () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [{ id: 'g1', url: 'https://images.unsplash.com/g1.jpg', alt: 'Cut', category: 'Barber' }],
    services: barberServices,
  });
  const { utils, getSaved } = await renderStepPhotos(data);
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-edit-item')); });
  await act(async () => {
    fireEvent.change(utils.getByTestId('gallery-before-input'), { target: { files: [new File(['before'], 'b.png', { type: 'image/png' })] } });
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-save-details')); });
  const saved = getSaved();
  assert.match(saved.gallery.find((g) => g.id === 'g1').beforeUrl, /^data:image\/png;base64,/);
  cleanup();
});

await test('cross-theme service is dropped when the theme changes', async () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [{ id: 'g1', url: 'https://images.unsplash.com/g1.jpg', category: 'General', serviceId: 'b1' }],
    services: [...barberServices, ...nailServices],
  });
  const { utils, getSaved } = await renderStepPhotos(data);
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-edit-item')); });
  // Service dropdown only lists the active theme's services.
  const options = Array.from(utils.getByTestId('gallery-service-select').querySelectorAll('option')).map((o) => o.value);
  assert.ok(options.includes('b1'), 'own service option missing');
  assert.ok(!options.includes('n1'), 'foreign service leaked into dropdown');
  await act(async () => { fireEvent.change(utils.getByTestId('gallery-theme-select'), { target: { value: 'nail_lash_studio' } }); });
  await act(async () => { fireEvent.click(utils.getByTestId('gallery-save-details')); });
  const saved = getSaved();
  assert.equal(saved.gallery.find((g) => g.id === 'g1').serviceId, null, 'cross-theme service must be dropped');
  assert.equal(saved.gallery.find((g) => g.id === 'g1').themeId, 'nail_lash_studio');
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 10. Owner save → customer gallery (theme isolation)                 */
/* ------------------------------------------------------------------ */

section('Owner save → customer gallery');

await test('saved gallery renders only on the assigned theme (no cross-theme content)', () => {
  const data = salonData('barber_mens_grooming', {
    gallery: [
      { id: 'bb', url: 'https://images.unsplash.com/bb.jpg', themeId: 'barber_mens_grooming', category: 'Barber' },
      { id: 'nn', url: 'https://images.unsplash.com/nn.jpg', themeId: 'nail_lash_studio', category: 'Beauty' },
      { id: 'off', url: 'https://images.unsplash.com/off.jpg', themeId: 'barber_mens_grooming', status: 'inactive', category: 'General' },
    ],
  });
  const barber = customerGalleryForTheme(data, 'barber_mens_grooming').map((i) => i.id);
  const nail = customerGalleryForTheme(data, 'nail_lash_studio').map((i) => i.id);
  assert.deepEqual(barber, ['bb'], `barber should see only its active item, got ${barber.join(',')}`);
  assert.deepEqual(nail, ['nn'], `nail should see only its item, got ${nail.join(',')}`);
});

await test('all five themes accept their own gallery assignments', () => {
  const data = salonData('barber_mens_grooming', {
    gallery: GALLERY_MANAGEMENT_THEMES.map((themeId, i) => ({ id: `t${i}`, url: `https://images.unsplash.com/t${i}.jpg`, themeId })),
  });
  for (const themeId of GALLERY_MANAGEMENT_THEMES) {
    const ids = customerGalleryForTheme(data, themeId).map((i) => i.id);
    assert.equal(ids.length, 1, `${themeId}: expected exactly its own item`);
    assert.equal(ids[0], `t${GALLERY_MANAGEMENT_THEMES.indexOf(themeId)}`);
  }
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error.message}`);
  process.exit(1);
}
process.exit(0);
