/**
 * PHASE 12.1 — TRUST & SALON STATS (five-theme acceptance)
 *
 * Verifies the Trust/Stats section directly below the hero for all five themes:
 *
 *   1. Real data only — rating / review count from approved reviews, owner-
 *      configured years & happy customers, active-service count and live salon
 *      status. No fabricated numbers; unavailable stats are hidden.
 *   2. Placement — the trust section sits immediately after the hero and keeps
 *      its `section-trust` id / `data-site-section="trust"` in the canonical flow.
 *   3. Theme-specific card design — five distinct card looks, colours and
 *      typography, none shared across themes.
 *   4. Responsive desktop / tablet / mobile grids (mode-based, not breakpoints).
 *   5. English + हिन्दी labels.
 *   6. Light / dark surface compatibility.
 *   7. Loading / empty / error states.
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
const { render, cleanup, act } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests, collectSiteSectionOrder } = await import('../src/lib/siteStructure.ts');
const {
  trustStats, statusShortLabel, hasConfiguredOpening, salonStatusDetail, TRUST_STAT_KINDS,
} = await import('../src/lib/siteTrust.ts');
const { trustText } = await import('../src/lib/siteTrustI18n.ts');
const { resolveSalonStatus, setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setReviewStoreForTests } = await import('../src/lib/siteReviews.ts');

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

function salonData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: `${templateId} Test Salon`,
    services: [
      { id: 's1', name: 'Signature Cut', category: 'Haircut', description: 'Cut.', price: 499, duration: 45, status: 'active' },
      { id: 's2', name: 'Deluxe Treatment', category: 'Treatment', description: 'Luxury.', price: 999, duration: 60, status: 'active' },
      { id: 's3', name: 'Archived Service', category: 'Color', description: 'Gone.', price: 1500, duration: 90, status: 'archived' },
    ],
    packages: [],
    team: [],
    gallery: [],
    socialVideos: [],
    openingHours: {
      monday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      tuesday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      wednesday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      thursday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      friday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      saturday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      sunday: { open: false, startTime: '10:00 AM', endTime: '04:00 PM' },
    },
    holidays: [],
    ...extras,
  };
}

const NO_STATS = {
  services: [],
  packages: [],
  team: [],
  gallery: [],
  socialVideos: [],
  openingHours: undefined,
  holidays: [],
};

function reset({ locale = 'en', appearance = undefined } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setWebsiteSectionFlagsForTests({});
  setReviewStoreForTests(null);
  setSalonClockForTests('2026-08-14T11:30:00');
}

const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function trustOf(container) {
  const el = container.querySelector('[data-testid="site-trust"]');
  assert.ok(el, 'trust section missing');
  return el;
}

function kindsOf(container) {
  return Array.from(container.querySelectorAll('[data-testid="site-trust-stat"]')).map((el) => el.getAttribute('data-kind'));
}

/* ------------------------------------------------------------------ */
/* 1. Data engine — only real / configured data                        */
/* ------------------------------------------------------------------ */

section('Data engine — no fabricated numbers');

await test('no data → no stats', () => {
  const stats = trustStats('barber_mens_grooming', salonData('barber_mens_grooming', NO_STATS), new Date('2026-08-14T11:30:00'), 'en');
  assert.deepEqual(stats, [], `expected empty stats, got ${JSON.stringify(stats)}`);
});

await test('services stat counts only active catalog entries', () => {
  const stats = trustStats('barber_mens_grooming', salonData('barber_mens_grooming', { openingHours: undefined, holidays: [] }), new Date('2026-08-14T11:30:00'), 'en');
  assert.deepEqual(stats.map((s) => s.kind), ['services']);
  assert.equal(stats[0].value, '2', 'archived service was counted');
});

await test('owner-configured years & happy customers appear only when set', () => {
  const base = salonData('hair_studio_color_bar', { openingHours: undefined, holidays: [] });
  const none = trustStats('hair_studio_color_bar', base, new Date('2026-08-14T11:30:00'), 'en');
  assert.ok(!none.some((s) => s.kind === 'yearsExperience' || s.kind === 'happyCustomers'), 'unset stats leaked');

  const set = trustStats('hair_studio_color_bar', { ...base, yearsOfExperience: 12, happyCustomers: 5000 }, new Date('2026-08-14T11:30:00'), 'en');
  assert.deepEqual(set.map((s) => s.kind), ['yearsExperience', 'happyCustomers', 'services']);
  assert.equal(set[0].value, '12');
  assert.equal(set[1].value, '5,000');
});

await test('invalid owner figures are hidden, never fabricated', () => {
  const base = salonData('beauty_skin_spa', { openingHours: undefined, holidays: [] });
  for (const bad of [0, -5, 1.5, '12', null, undefined, NaN, Infinity]) {
    const stats = trustStats('beauty_skin_spa', { ...base, yearsOfExperience: bad, happyCustomers: bad }, new Date('2026-08-14T11:30:00'), 'en');
    assert.ok(!stats.some((s) => s.kind === 'yearsExperience'), `years leaked for ${String(bad)}`);
    assert.ok(!stats.some((s) => s.kind === 'happyCustomers'), `happy leaked for ${String(bad)}`);
  }
});

await test('rating + review count derive only from approved reviews', () => {
  setReviewStoreForTests({
    version: 1,
    reviews: [
      { id: 'r1', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b1', customerId: 'c1', customerName: 'A', rating: 5, body: 'Lovely visit', status: 'approved', createdAt: 1, updatedAt: 1, fingerprint: 'f1' },
      { id: 'r2', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b2', customerId: 'c2', customerName: 'B', rating: 4, body: 'Great haircut', status: 'approved', createdAt: 2, updatedAt: 2, fingerprint: 'f2' },
      { id: 'r3', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b3', customerId: 'c3', customerName: 'C', rating: 1, body: 'Pending one', status: 'pending', createdAt: 3, updatedAt: 3, fingerprint: 'f3' },
      { id: 'r4', businessId: 'public-site', themeId: 'hair_studio_color_bar', bookingId: 'b4', customerId: 'c4', customerName: 'D', rating: 5, body: 'Other theme', status: 'approved', createdAt: 4, updatedAt: 4, fingerprint: 'f4' },
    ],
    attempts: [],
  });
  const stats = trustStats('barber_mens_grooming', salonData('barber_mens_grooming', { openingHours: undefined, holidays: [] }), new Date('2026-08-14T11:30:00'), 'en');
  const rating = stats.find((s) => s.kind === 'rating');
  const count = stats.find((s) => s.kind === 'reviewCount');
  assert.equal(rating.value, '4.5', 'rating average wrong');
  assert.equal(count.value, '2', 'review count must ignore pending + other-theme reviews');
  setReviewStoreForTests(null);
});

await test('salon status appears only when opening info is configured', () => {
  const data = salonData('family_full_service');
  assert.equal(hasConfiguredOpening(data), true);
  const withHours = trustStats('family_full_service', data, new Date('2026-08-14T11:30:00'), 'en');
  assert.ok(withHours.some((s) => s.kind === 'salonStatus'));

  const noHours = trustStats('family_full_service', { ...data, openingHours: undefined, holidays: [] }, new Date('2026-08-14T11:30:00'), 'en');
  assert.ok(!noHours.some((s) => s.kind === 'salonStatus'), 'status leaked without configured hours');
});

await test('salon status value + detail come from the live status engine', () => {
  const now = new Date('2026-08-14T11:30:00');
  const data = salonData('nail_lash_studio');
  const status = resolveSalonStatus(data, now);
  const stats = trustStats('nail_lash_studio', data, now, 'en');
  const card = stats.find((s) => s.kind === 'salonStatus');
  assert.equal(card.value, statusShortLabel(status.kind, 'en'));
  assert.equal(card.statusKind, status.kind);
  assert.equal(card.detail, salonStatusDetail(data, status, now, 'en'));
  assert.ok(card.detail.length > 0, 'opening detail missing');
});

await test('stat order follows the canonical requirement order', () => {
  setReviewStoreForTests({
    version: 1,
    reviews: [
      { id: 'r1', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b1', customerId: 'c1', customerName: 'A', rating: 5, body: 'Lovely visit', status: 'approved', createdAt: 1, updatedAt: 1, fingerprint: 'f1' },
    ],
    attempts: [],
  });
  const data = { ...salonData('barber_mens_grooming'), yearsOfExperience: 12, happyCustomers: 5000 };
  const stats = trustStats('barber_mens_grooming', data, new Date('2026-08-14T11:30:00'), 'en');
  assert.deepEqual(stats.map((s) => s.kind), [...TRUST_STAT_KINDS], 'stat order drifted');
  setReviewStoreForTests(null);
});

/* ------------------------------------------------------------------ */
/* 2. Placement + no fabricated values (per theme × mode)              */
/* ------------------------------------------------------------------ */

const FABRICATED = ['15+', '10k', '12+', '8k', '6k', '5★', '100%', '∞', 'Precision cuts', 'Years behind the chair', 'Transformations', 'Client rating', 'Editorial finish', 'Guest rating', 'Treatments', 'Ages welcome', 'Easy booking', 'Good energy', 'Signature space', 'Ways to glow', 'Detail energy'];

for (const config of CASES) {
  section(`${config.label} — placement & honest rendering`);
  for (const mode of MODES) {
    await test(`${mode}: trust sits immediately below the hero`, () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      const flow = collectSiteSectionOrder(utils.container);
      const heroIdx = flow.indexOf('hero');
      const trustIdx = flow.indexOf('trust');
      assert.ok(heroIdx >= 0, 'hero missing from flow');
      assert.ok(trustIdx >= 0, 'trust missing from flow');
      assert.equal(trustIdx, heroIdx + 1, `trust not directly after hero: ${flow.join(' → ')}`);
    });

    await test(`${mode}: shows only real stats (services + status)`, () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      const trust = trustOf(utils.container);
      assert.equal(trust.getAttribute('data-section-state'), 'ready');
      assert.deepEqual(kindsOf(utils.container), ['services', 'salonStatus']);
      for (const fake of FABRICATED) {
        assert.ok(!flat(trust).includes(fake), `fabricated value "${fake}" rendered`);
      }
    });

    await test(`${mode}: grid is mode-accurate (${mode})`, () => {
      reset();
      const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      const grid = utils.container.querySelector('[data-testid="site-trust-grid"]');
      const cls = grid.getAttribute('class');
      if (mode === 'desktop' || mode === 'tablet') assert.match(cls, /grid-cols-3/);
      if (mode === 'mobile') assert.match(cls, /grid-cols-1/);
    });
  }
}

/* ------------------------------------------------------------------ */
/* 3. All six stats render when the salon supplies them                */
/* ------------------------------------------------------------------ */

section('All six stats — fully configured salon');

await test('rating, count, years, happy, services, status all appear in order', () => {
  reset();
  setReviewStoreForTests({
    version: 1,
    reviews: [
      { id: 'r1', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b1', customerId: 'c1', customerName: 'A', rating: 5, body: 'Lovely visit', status: 'approved', createdAt: 1, updatedAt: 1, fingerprint: 'f1' },
      { id: 'r2', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b2', customerId: 'c2', customerName: 'B', rating: 4, body: 'Great haircut', status: 'approved', createdAt: 2, updatedAt: 2, fingerprint: 'f2' },
      { id: 'r3', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b3', customerId: 'c3', customerName: 'C', rating: 5, body: 'Sharp fade', status: 'approved', createdAt: 3, updatedAt: 3, fingerprint: 'f3' },
      { id: 'r4', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b4', customerId: 'c4', customerName: 'D', rating: 5, body: 'Will be back', status: 'approved', createdAt: 4, updatedAt: 4, fingerprint: 'f4' },
      { id: 'r5', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b5', customerId: 'c5', customerName: 'E', rating: 5, body: 'Perfect cut', status: 'approved', createdAt: 5, updatedAt: 5, fingerprint: 'f5' },
      { id: 'r6', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b6', customerId: 'c6', customerName: 'F', rating: 5, body: 'Great service', status: 'approved', createdAt: 6, updatedAt: 6, fingerprint: 'f6' },
      { id: 'r7', businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'b7', customerId: 'c7', customerName: 'G', rating: 4, body: 'Nice visit', status: 'approved', createdAt: 7, updatedAt: 7, fingerprint: 'f7' },
    ],
    attempts: [],
  });
  const data = { ...salonData('barber_mens_grooming'), yearsOfExperience: 12, happyCustomers: 12000 };
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  assert.deepEqual(kindsOf(utils.container), [...TRUST_STAT_KINDS]);
  const values = Object.fromEntries(
    Array.from(utils.container.querySelectorAll('[data-testid="site-trust-stat"]')).map((el) => {
      const value = el.querySelector('p');
      return [el.getAttribute('data-kind'), flat(value)];
    }),
  );
  assert.equal(values.rating, '4.7');
  assert.equal(values.reviewCount, '7');
  assert.equal(values.yearsExperience, '12');
  assert.equal(values.happyCustomers, '12,000');
  assert.equal(values.services, '2');
  assert.match(values.salonStatus, /Open|खुला/);
  setReviewStoreForTests(null);
});

/* ------------------------------------------------------------------ */
/* 4. English + हिन्दी                                                  */
/* ------------------------------------------------------------------ */

section('English / हिन्दी labels');

for (const config of CASES) {
  await test(`${config.id}: labels flip with the language control`, () => {
    reset({ locale: 'en' });
    const enData = { ...salonData(config.id), yearsOfExperience: 12, happyCustomers: 5000 };
    let utils = render(React.createElement(config.Component, { data: enData, mode: 'desktop' }));
    const enLabels = Array.from(utils.container.querySelectorAll('[data-testid="site-trust-stat"]')).map((el) => {
      const paras = el.querySelectorAll('p');
      return flat(paras[1]);
    });
    assert.ok(enLabels.includes('Services Available'));
    assert.ok(enLabels.includes('Salon Status'));
    assert.ok(enLabels.includes('Years of Experience'));
    assert.ok(enLabels.includes('Happy Customers'));

    cleanup();
    reset({ locale: 'hi' });
    utils = render(React.createElement(config.Component, { data: enData, mode: 'desktop' }));
    const hiLabels = Array.from(utils.container.querySelectorAll('[data-testid="site-trust-stat"]')).map((el) => {
      const paras = el.querySelectorAll('p');
      return flat(paras[1]);
    });
    assert.ok(hiLabels.includes('उपलब्ध सेवाएँ'));
    assert.ok(hiLabels.includes('सैलून स्थिति'));
    assert.ok(hiLabels.includes('अनुभव के वर्ष'));
    assert.ok(hiLabels.includes('खुश ग्राहक'));
    assert.ok(!hiLabels.includes('Services Available'), 'English label leaked into Hindi');
  });
}

await test('Hindi rating + counts use Hindi grouping', () => {
  reset({ locale: 'hi' });
  setReviewStoreForTests({
    version: 1,
    reviews: [
      { id: 'r1', businessId: 'public-site', themeId: 'beauty_skin_spa', bookingId: 'b1', customerId: 'c1', customerName: 'A', rating: 4, body: 'Lovely visit', status: 'approved', createdAt: 1, updatedAt: 1, fingerprint: 'f1' },
      { id: 'r2', businessId: 'public-site', themeId: 'beauty_skin_spa', bookingId: 'b2', customerId: 'c2', customerName: 'B', rating: 5, body: 'Great ritual', status: 'approved', createdAt: 2, updatedAt: 2, fingerprint: 'f2' },
    ],
    attempts: [],
  });
  const data = { ...salonData('beauty_skin_spa'), happyCustomers: 12000 };
  const utils = render(React.createElement(BeautySpa, { data, mode: 'desktop' }));
  const card = utils.container.querySelector('[data-kind="happyCustomers"]');
  assert.ok(card, 'happyCustomers card missing');
  assert.equal(flat(card.querySelector('p')), '12,000');
  const rating = utils.container.querySelector('[data-kind="rating"]');
  assert.equal(flat(rating.querySelector('p')), '4.5');
  setReviewStoreForTests(null);
});

/* ------------------------------------------------------------------ */
/* 5. Light / dark compatibility                                       */
/* ------------------------------------------------------------------ */

section('Light / dark surfaces');

for (const config of CASES) {
  await test(`${config.id}: trust surfaces change with appearance`, () => {
    reset({ appearance: 'light' });
    let utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const lightBg = trustOf(utils.container).style.backgroundColor;
    cleanup();
    reset({ appearance: 'dark' });
    utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const darkBg = trustOf(utils.container).style.backgroundColor;
    assert.ok(lightBg.length > 0 && darkBg.length > 0, 'trust section lost its background');
    assert.notEqual(lightBg, darkBg, 'dark mode did not change the trust surface');
  });
}

/* ------------------------------------------------------------------ */
/* 6. Loading / empty / error states                                   */
/* ------------------------------------------------------------------ */

section('Loading / empty / error states');

for (const config of CASES) {
  await test(`${config.id}: loading state`, () => {
    reset();
    setWebsiteSectionFlagsForTests({ trust: 'loading' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="site-trust-loading"]'), 'loading skeleton missing');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-trust-stat"]').length, 0);
    assert.equal(trustOf(utils.container).getAttribute('data-section-state'), 'loading');
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: error state with retry`, () => {
    reset();
    setWebsiteSectionFlagsForTests({ trust: 'error' });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-error"]'), 'error panel missing');
    assert.ok(utils.container.querySelector('[data-testid="section-state-retry"]'), 'retry button missing');
    setWebsiteSectionFlagsForTests({});
  });

  await test(`${config.id}: empty state when no stats exist`, () => {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id, NO_STATS), mode: 'desktop' }));
    assert.ok(utils.container.querySelector('[data-testid="section-state-empty"]'), 'empty panel missing');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-trust-stat"]').length, 0);
    assert.equal(trustOf(utils.container).getAttribute('data-section-state'), 'empty');
  });
}

/* ------------------------------------------------------------------ */
/* 7. Theme-specific card design                                       */
/* ------------------------------------------------------------------ */

section('Theme-specific card design');

await test('five themes keep five distinct card designs (value colours + surfaces)', () => {
  reset();
  const colors = new Map();
  const surfaces = new Map();
  for (const config of CASES) {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const card = utils.container.querySelector('[data-testid="site-trust-stat"]');
    const valueColor = card.querySelector('p').style.color;
    const sectionBg = trustOf(utils.container).style.backgroundColor;
    colors.set(config.id, valueColor);
    surfaces.set(config.id, sectionBg);
    cleanup();
    reset();
  }
  assert.equal(new Set(colors.values()).size, CASES.length, `value colours shared: ${JSON.stringify([...colors])}`);
  assert.equal(new Set(surfaces.values()).size, CASES.length, `section surfaces shared: ${JSON.stringify([...surfaces])}`);
});

await test('each theme uses its own signature shape', () => {
  reset();
  const get = (id) => {
    const config = CASES.find((c) => c.id === id);
    const utils = render(React.createElement(config.Component, { data: salonData(id), mode: 'desktop' }));
    const cls = utils.container.querySelector('[data-testid="site-trust-stat"]').getAttribute('class');
    cleanup();
    reset();
    return cls;
  };
  assert.ok(!get('barber_mens_grooming').includes('rounded'), 'barber cards should stay sharp');
  assert.ok(get('hair_studio_color_bar').includes('border'), 'hair cards should keep hairline borders');
  assert.ok(get('beauty_skin_spa').includes('rounded-3xl'), 'spa cards should be rounded-3xl');
  assert.ok(get('family_full_service').includes('rounded-2xl'), 'family cards should be rounded-2xl');
  assert.ok(get('nail_lash_studio').includes('rounded-2xl'), 'nail cards should be rounded-2xl');
});

/* ------------------------------------------------------------------ */
/* 8. Salon status card correctness                                    */
/* ------------------------------------------------------------------ */

section('Salon status card');

await test('status card reflects the live open/closed engine', () => {
  reset();
  const now = new Date('2026-08-14T11:30:00');
  setSalonClockForTests(now);
  const data = salonData('barber_mens_grooming');
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const card = utils.container.querySelector('[data-kind="salonStatus"]');
  assert.ok(card, 'salonStatus card missing');
  const expected = resolveSalonStatus(data, now);
  assert.equal(flat(card.querySelector('p')), statusShortLabel(expected.kind, 'en'));
  const dot = card.querySelector('[data-testid="site-trust-status-dot"]');
  assert.ok(dot, 'status dot missing');
  assert.ok(dot.style.backgroundColor.length > 0, 'status dot has no colour');
});

await test('closed-today status is reported honestly', () => {
  reset();
  const now = new Date('2026-08-16T11:30:00'); // Sunday
  setSalonClockForTests(now);
  const data = salonData('beauty_skin_spa'); // sunday: open = false
  const utils = render(React.createElement(BeautySpa, { data, mode: 'desktop' }));
  const card = utils.container.querySelector('[data-kind="salonStatus"]');
  assert.ok(card, 'salonStatus card missing');
  assert.equal(flat(card.querySelector('p')), 'Closed Today');
});

setSiteLocale('en');
setSiteAppearance(undefined);
setWebsiteSectionFlagsForTests({});
setSalonClockForTests(null);

console.log('\n────────────────────────────────────────');
console.log(`Phase 12.1 trust & salon stats: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes show only real, configured trust stats — no fabricated numbers, honest hiding, theme-specific cards, EN/HI, light/dark, responsive and full loading/empty/error states.');
cleanup();
process.exit(0);
