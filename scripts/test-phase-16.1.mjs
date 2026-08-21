/**
 * PHASE 16.1 — BOOKING FOUNDATION (five-theme acceptance)
 *
 * The public-site booking flow gains its foundation shape:
 *
 *   Salon → Service → Date → Time → Customer Details → Booking Summary
 *
 * Covered here:
 *   - salon context: ALWAYS the active salon (existing data only, no
 *     invented salon/user ids, no picker over foreign salons);
 *   - the salon confirmation step per theme (EN/HI, light/dark, themed);
 *   - salon + theme scoped booking drafts (create/update idempotency,
 *     tenant + theme isolation, browser identity, resume, clear);
 *   - service prefill (Phase 12.3) skips the salon step but keeps the
 *     same architecture — one flow, no second system;
 *   - loading/empty/error basics: no services, no slots, storage-less;
 *   - Phase 10.6/10.7 architecture is extended, not rebuilt: the same
 *     stepper, holds, validation and payment hand-off still run.
 *
 * NOT covered (later phases): server time slots, 25% advance payment,
 * confirmation/notifications, booking management, WhatsApp/Call rules.
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
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const SiteBookingFlow = (await import('../src/components/SiteBookingFlow.tsx')).default;
const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { SITE_BOOKING_EVENT, openSiteBookingForService } = await import('../src/lib/siteBooking.ts');
const { bookingFlowText } = await import('../src/lib/siteBookingI18n.ts');
const {
  BOOKING_STEP_IDS,
  bookingBusinessId,
  bookingSalonContext,
  bookingBrowserId,
  setBookingHoldsForTests,
} = await import('../src/lib/siteBookingFlow.ts');
const {
  BOOKING_DRAFT_STORE_KEY,
  BOOKING_DRAFT_EVENT,
  readBookingDraft,
  readBookingDrafts,
  saveBookingDraft,
  clearBookingDraft,
  setBookingDraftStoreForTests,
} = await import('../src/lib/siteBookingDraft.ts');
const { setPaymentStoreForTests, setPaymentScenarioForTests } = await import('../src/lib/siteBookingPayment.ts');

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

function at(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
/** Thursday 2026-08-13 11:00 IST — an open, non-holiday day. */
const THU_OPEN = at(2026, 8, 13, 11, 0);

function weekHours() {
  return {
    monday: { open: true, startTime: '10:00', endTime: '20:00' },
    tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
    wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
    thursday: { open: true, startTime: '10:00', endTime: '20:00' },
    friday: { open: true, startTime: '10:00', endTime: '20:00' },
    saturday: { open: true, startTime: '10:00', endTime: '20:00' },
    sunday: { open: false, startTime: '10:00', endTime: '20:00' },
  };
}

const THEMES = [
  { id: 'barber_mens_grooming', Component: Barber },
  { id: 'hair_studio_color_bar', Component: HairStudio },
  { id: 'beauty_skin_spa', Component: BeautySpa },
  { id: 'family_full_service', Component: Family },
  { id: 'nail_lash_studio', Component: NailLash },
];

function themeServices(themeId, businessId) {
  return [
    {
      id: `${themeId}-svc-1`, name: 'Signature Treatment', category: 'Haircuts',
      description: 'Signature service description.', price: 800, duration: 60,
      themeId, status: 'active', ...(businessId ? { businessId } : {}),
    },
    {
      id: `${themeId}-svc-2`, name: 'Deep Ritual', category: 'Grooming & Treatments',
      description: 'Ritual service description.', price: 1500, duration: 90,
      themeId, status: 'active', ...(businessId ? { businessId } : {}),
    },
    {
      id: `foreign-${themeId}`, name: 'Foreign Theme Service', category: 'Foreign',
      description: 'Must never appear.', price: 9999, duration: 60,
      themeId: 'some_other_theme', status: 'active',
    },
  ];
}

function richData(themeId, extras = {}) {
  return {
    ...initialData,
    templateId: themeId,
    salonName: `${themeId} Test Salon`,
    ownerName: 'Test Owner',
    email: 'hello@booking.test',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    address: { fullAddress: '12 MG Road, Kota, Rajasthan', latitude: null, longitude: null },
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    openingHours: weekHours(),
    holidays: [],
    bookingRules: {
      minNotice: '1 hour', maxAdvance: '30 days', bufferTime: 'No buffer',
      allowStaffSelection: true, advanceDepositPercentage: 25,
    },
    services: themeServices(themeId, extras.businessId),
    offers: [],
    ...extras,
  };
}

function resetState() {
  cleanup();
  window.localStorage.clear();
  setBookingHoldsForTests(null);
  setBookingDraftStoreForTests(null);
  setPaymentStoreForTests(null);
  setSalonClockForTests(THU_OPEN);
  setSiteLocale('en');
  setSiteAppearance('light');
}

function renderFlow(themeId, extras = {}) {
  const toasts = [];
  const utils = render(
    React.createElement(SiteBookingFlow, {
      themeId,
      data: richData(themeId, extras),
      onBackToWebsite: () => {},
      // PHASE 16.9 — typed notices; the harness keeps the message text.
      onShowToast: (msg) => toasts.push(typeof msg === 'string' ? msg : msg.message),
    }),
  );
  return { utils, toasts };
}

async function clickContinue(utils) {
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
}

/** Walks salon → … → target using Continue (filling details when needed). */
async function walkToStep(target, utils) {
  const flow = utils.getByTestId('booking-flow');
  const steps = ['salon', 'service', 'date', 'time', 'details', 'summary'];
  while (flow.dataset.step !== target && steps.indexOf(flow.dataset.step) < steps.indexOf(target)) {
    if (flow.dataset.step === 'details') {
      await act(async () => {
        fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Asha Verma' } });
        fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '9876543210' } });
      });
    }
    const btn = utils.getByTestId('booking-continue');
    assert.equal(btn.disabled, false, `Continue disabled on ${flow.dataset.step}`);
    await act(async () => { fireEvent.click(btn); });
  }
  assert.equal(flow.dataset.step, target, `expected step ${target}, got ${flow.dataset.step}`);
}

/* ================================================================== */
/* A · ENGINE — salon context from existing data only                  */
/* ================================================================== */
section('Engine — salon context (no invented ids, active salon only)');
{
  await test('step order is Salon → Service → Date → Time → Details → Summary', () => {
    assert.deepEqual(BOOKING_STEP_IDS, ['salon', 'service', 'date', 'time', 'details', 'summary']);
  });

  await test('businessId comes from service provenance when present', () => {
    const data = richData('beauty_skin_spa', { businessId: 'biz-real-1' });
    assert.equal(bookingBusinessId(data), 'biz-real-1');
  });

  await test('businessId falls back to the shared public-site tenant — never a random id', () => {
    const data = richData('beauty_skin_spa');
    assert.equal(bookingBusinessId(data), 'public-site');
    assert.equal(bookingBusinessId(richData('barber_mens_grooming')), 'public-site');
  });

  for (const theme of THEMES) {
    await test(`${theme.id}: salon context mirrors the active salon's own data`, () => {
      const data = richData(theme.id);
      const ctx = bookingSalonContext(data, theme.id);
      assert.equal(ctx.themeId, theme.id);
      assert.equal(ctx.salonName, `${theme.id} Test Salon`);
      assert.equal(ctx.address, '12 MG Road, Kota, Rajasthan');
      assert.equal(ctx.phone, '+91 99999 00000');
      assert.equal(ctx.hasServices, true, 'active theme services must count');
    });
  }

  await test('foreign-theme services never make a theme look bookable', () => {
    const data = richData('barber_mens_grooming');
    data.services = data.services.filter((s) => s.themeId !== 'barber_mens_grooming');
    const ctx = bookingSalonContext(data, 'barber_mens_grooming');
    assert.equal(ctx.hasServices, false, 'only foreign services remain — must not count');
  });
}

/* ================================================================== */
/* B · ENGINE — salon+theme-scoped drafts                              */
/* ================================================================== */
section('Engine — booking drafts (tenant + theme isolation, idempotent)');
{
  resetState();

  await test('saveBookingDraft creates ONE row per business/theme/browser (idempotent)', () => {
    setBookingDraftStoreForTests({ records: [] });
    const a = saveBookingDraft({
      businessId: 'biz-1', themeId: 'beauty_skin_spa', status: 'in_progress', step: 'service',
      serviceId: 'svc-1', serviceName: 'Facial', servicePrice: 900, serviceDurationMinutes: 45,
    });
    const b = saveBookingDraft({
      businessId: 'biz-1', themeId: 'beauty_skin_spa', status: 'in_progress', step: 'date',
      serviceId: 'svc-1', serviceName: 'Facial', servicePrice: 900, serviceDurationMinutes: 45,
      dateKey: '2026-08-14',
    });
    assert.equal(a.id, b.id, 'update must reuse the same row');
    const rows = readBookingDrafts('biz-1', 'beauty_skin_spa');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].step, 'date');
    assert.equal(rows[0].dateKey, '2026-08-14');
    assert.equal(rows[0].browserId, bookingBrowserId());
    assert.equal(rows[0].createdAt, a.createdAt, 'createdAt must survive updates');
  });

  await test('drafts are isolated per tenant AND per theme', () => {
    setBookingDraftStoreForTests({ records: [] });
    saveBookingDraft({ businessId: 'biz-1', themeId: 'beauty_skin_spa', status: 'in_progress', step: 'service', serviceId: 's1' });
    saveBookingDraft({ businessId: 'biz-1', themeId: 'barber_mens_grooming', status: 'in_progress', step: 'service', serviceId: 's2' });
    saveBookingDraft({ businessId: 'biz-2', themeId: 'beauty_skin_spa', status: 'in_progress', step: 'service', serviceId: 's3' });
    assert.equal(readBookingDrafts('biz-1', 'beauty_skin_spa').length, 1);
    assert.equal(readBookingDrafts('biz-1', 'beauty_skin_spa')[0].serviceId, 's1');
    assert.equal(readBookingDrafts('biz-1', 'barber_mens_grooming')[0].serviceId, 's2');
    assert.equal(readBookingDrafts('biz-2', 'beauty_skin_spa')[0].serviceId, 's3');
    assert.equal(readBookingDrafts('biz-3', 'beauty_skin_spa').length, 0, 'unknown tenant must read nothing');
  });

  await test('clearBookingDraft removes only the matching tenant+theme row', () => {
    clearBookingDraft('biz-1', 'beauty_skin_spa');
    assert.equal(readBookingDraft('biz-1', 'beauty_skin_spa'), null);
    assert.equal(readBookingDrafts('biz-1', 'barber_mens_grooming').length, 1, 'other theme must survive');
    assert.equal(readBookingDrafts('biz-2', 'beauty_skin_spa').length, 1, 'other tenant must survive');
  });

  await test('stale drafts (>24h) are dropped on read', () => {
    setBookingDraftStoreForTests({
      records: [{
        id: 'old', businessId: 'biz-1', themeId: 'beauty_skin_spa', browserId: bookingBrowserId(),
        status: 'in_progress', step: 'service', serviceId: 's1', serviceName: null,
        servicePrice: null, serviceDurationMinutes: null, dateKey: null, startMinutes: null,
        endMinutes: null, customer: null, createdAt: Date.now() - 60 * 60 * 60 * 1000,
        updatedAt: Date.now() - 30 * 60 * 60 * 1000,
      }],
    });
    assert.equal(readBookingDraft('biz-1', 'beauty_skin_spa'), null);
  });

  await test('corrupted localStorage payload degrades to an empty store (no crash)', () => {
    setBookingDraftStoreForTests(null);
    window.localStorage.setItem(BOOKING_DRAFT_STORE_KEY, '{"not":"valid-store"');
    assert.equal(readBookingDraft('biz-1', 'beauty_skin_spa'), null);
    window.localStorage.setItem(BOOKING_DRAFT_STORE_KEY, JSON.stringify({ version: 999, records: [] }));
    assert.equal(readBookingDraft('biz-1', 'beauty_skin_spa'), null);
    window.localStorage.clear();
  });

  await test('saving emits the draft event for other mounted surfaces', () => {
    setBookingDraftStoreForTests({ records: [] });
    let events = 0;
    const onEvent = () => { events += 1; };
    window.addEventListener(BOOKING_DRAFT_EVENT, onEvent);
    saveBookingDraft({ businessId: 'biz-1', themeId: 'beauty_skin_spa', status: 'in_progress', step: 'service' });
    window.removeEventListener(BOOKING_DRAFT_EVENT, onEvent);
    assert.equal(events, 1);
    setBookingDraftStoreForTests(null);
  });
}

/* ================================================================== */
/* C · UI — salon confirmation step per theme                          */
/* ================================================================== */
section('UI — salon confirmation step (all five themes)');
{
  for (const theme of THEMES) {
    resetState();
    const { utils } = renderFlow(theme.id);

    await test(`${theme.id}: plain open starts on the salon step with the ACTIVE salon`, () => {
      const flow = utils.getByTestId('booking-flow');
      assert.equal(flow.dataset.step, 'salon');
      assert.equal(flow.dataset.theme, theme.id);
      const card = utils.getByTestId('booking-salon-card');
      assert.equal(card.dataset.themeId, theme.id);
      assert.equal(card.dataset.businessId, 'public-site');
      assert.ok(card.textContent.includes(`${theme.id} Test Salon`), 'salon name missing');
      assert.ok(card.textContent.includes('12 MG Road, Kota, Rajasthan'), 'address missing');
      assert.ok(card.textContent.includes('+91 99999 00000'), 'phone missing');
      assert.ok(utils.getByTestId('booking-salon-ready').textContent.includes('2'), 'active service count missing');
    });

    await test(`${theme.id}: stepper shows six steps and salon → service works`, async () => {
      assert.equal(utils.getByTestId('booking-stepper').querySelectorAll('[data-testid^="booking-step-"]').length, 6);
      assert.ok(utils.getByTestId('booking-step-salon'));
      await clickContinue(utils);
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service');
      // Back returns to the salon step; back is disabled there.
      await act(async () => { fireEvent.click(utils.getByTestId('booking-back')); });
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'salon');
      assert.equal(utils.getByTestId('booking-back').disabled, true);
    });

    cleanup();
  }
}

/* ================================================================== */
/* D · UI — full foundation journey + draft persistence                */
/* ================================================================== */
section('UI — Salon → Service → Date → Time → Details → Summary + draft');
{
  for (const theme of THEMES) {
    resetState();
    const { utils } = renderFlow(theme.id);

    await test(`${theme.id}: full walk reaches the summary with everything intact`, async () => {
      await walkToStep('summary', utils);
      const text = utils.getByTestId('booking-flow').textContent;
      assert.ok(text.includes('Signature Treatment'), 'service missing in summary');
      assert.ok(text.includes('Asha Verma'), 'customer missing in summary');
      assert.ok(text.includes('₹800'), 'price missing in summary');
      assert.ok(text.includes(`${theme.id} Test Salon`), 'salon missing in summary');
    });

    await test(`${theme.id}: draft row tracks the journey (status summary_ready at the end)`, () => {
      const draft = readBookingDraft('public-site', theme.id);
      assert.ok(draft, 'draft missing after the walk');
      assert.equal(draft.themeId, theme.id);
      assert.equal(draft.status, 'summary_ready');
      assert.equal(draft.step, 'summary');
      assert.equal(draft.serviceId, `${theme.id}-svc-1`);
      assert.equal(draft.serviceName, 'Signature Treatment');
      assert.equal(draft.servicePrice, 800);
      assert.equal(draft.serviceDurationMinutes, 60);
      assert.ok(draft.dateKey, 'dateKey missing');
      assert.ok(draft.startMinutes != null, 'startMinutes missing');
      assert.equal(draft.endMinutes, draft.startMinutes + 60);
      assert.equal(draft.customer.name, 'Asha Verma');
      assert.equal(draft.customer.mobile, '9876543210');
    });

    await test(`${theme.id}: no foreign-theme draft was created`, () => {
      for (const other of THEMES) {
        if (other.id === theme.id) continue;
        assert.equal(readBookingDraft('public-site', other.id), null, `draft leaked into ${other.id}`);
      }
    });

    cleanup();
    window.localStorage.clear();
  }
}

/* ================================================================== */
/* E · UI — draft resume on reopen                                     */
/* ================================================================== */
section('UI — closing and reopening resumes the visitor\'s draft');
{
  resetState();

  await test('reopen restores service + customer details and shows the resume notice', async () => {
    const first = renderFlow('hair_studio_color_bar');
    await walkToStep('details', first.utils);
    await act(async () => {
      fireEvent.change(first.utils.getByTestId('booking-input-name'), { target: { value: 'Meera Iyer' } });
      fireEvent.change(first.utils.getByTestId('booking-input-mobile'), { target: { value: '9812345678' } });
    });
    await act(async () => { fireEvent.click(first.utils.getByTestId('booking-continue')); });
    assert.equal(first.utils.getByTestId('booking-flow').dataset.step, 'summary');
    cleanup(); // visitor closes the widget

    const second = renderFlow('hair_studio_color_bar');
    const flow = second.utils.getByTestId('booking-flow');
    assert.equal(flow.dataset.step, 'salon', 'reopen still starts on the salon step');
    assert.ok(second.utils.getByTestId('booking-draft-resumed'), 'resume notice missing');
    await clickContinue(second.utils);
    // Restored selections: the drafted service is selected again…
    assert.equal(
      second.utils.getByTestId('booking-service-hair_studio_color_bar-svc-1').dataset.selected,
      'true',
    );
    // …and the details are pre-filled.
    await walkToStep('details', second.utils);
    assert.equal(second.utils.getByTestId('booking-input-name').value, 'Meera Iyer');
    assert.equal(second.utils.getByTestId('booking-input-mobile').value, '9812345678');
    cleanup();
    window.localStorage.clear();
  });

  await test('a foreign browser identity cannot resume this draft', () => {
    setBookingDraftStoreForTests({
      records: [{
        id: 'x', businessId: 'public-site', themeId: 'hair_studio_color_bar',
        browserId: 'someone-else', status: 'in_progress', step: 'details',
        serviceId: 'hair_studio_color_bar-svc-1', serviceName: 'Signature Treatment',
        servicePrice: 800, serviceDurationMinutes: 60, dateKey: null, startMinutes: null,
        endMinutes: null, customer: { name: 'Other', mobile: '9000000000', email: '', notes: '' },
        createdAt: Date.now(), updatedAt: Date.now(),
      }],
    });
    assert.equal(readBookingDraft('public-site', 'hair_studio_color_bar'), null);
    setBookingDraftStoreForTests(null);
  });
}

/* ================================================================== */
/* F · UI — prefill keeps one architecture (12.3 unchanged)            */
/* ================================================================== */
section('UI — service prefill opens on the service step (same flow)');
{
  resetState();

  await test('a featured Book Now skips the salon confirmation but keeps the salon context', async () => {
    const data = richData('barber_mens_grooming');
    openSiteBookingForService(data.services[1], 'barber_mens_grooming');
    const utils = render(React.createElement(SiteBookingFlow, {
      themeId: 'barber_mens_grooming', data, onBackToWebsite: () => {},
    }));
    const flow = utils.getByTestId('booking-flow');
    assert.equal(flow.dataset.step, 'service', 'prefill must land on the service step');
    assert.equal(utils.getByTestId('booking-service-barber_mens_grooming-svc-2').dataset.selected, 'true');
    // The salon step is still there behind Back — one architecture.
    await act(async () => { fireEvent.click(utils.getByTestId('booking-back')); });
    assert.equal(flow.dataset.step, 'salon');
    assert.ok(utils.getByTestId('booking-salon-card'));
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* G · UI — loading / empty / error states                             */
/* ================================================================== */
section('UI — empty & error states');
{
  resetState();

  await test('salon with no bookable services: notice shown, Continue disabled', () => {
    const { utils } = renderFlow('beauty_skin_spa', { services: [] });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'salon');
    assert.ok(utils.getByTestId('booking-salon-no-services'));
    assert.equal(utils.getByTestId('booking-continue').disabled, true, 'must not continue without services');
    cleanup();
  });

  await test('missing address renders the pending-address copy (no crash, no invented data)', () => {
    const { utils } = renderFlow('family_full_service', { address: { fullAddress: '' } });
    assert.ok(utils.getByTestId('booking-salon-card').textContent.includes('Address not published yet'));
    cleanup();
    window.localStorage.clear();
  });

  await test('the flow works with localStorage disabled (draft becomes best-effort)', async () => {
    const original = window.localStorage;
    const broken = {
      getItem() { throw new Error('storage disabled'); },
      setItem() { throw new Error('storage disabled'); },
      removeItem() { throw new Error('storage disabled'); },
      clear() {},
      key() { return null; },
      length: 0,
    };
    Object.defineProperty(window, 'localStorage', { value: broken, configurable: true });
    try {
      const { utils } = renderFlow('nail_lash_studio');
      await walkToStep('service', utils);
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service');
    } finally {
      Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
      cleanup();
      window.localStorage.clear();
    }
  });
}

/* ================================================================== */
/* H · I18N + APPEARANCE — EN/HI, light/dark on the salon step         */
/* ================================================================== */
section('EN/HI + light/dark on the new salon step');
{
  resetState();

  await test('salon step copy exists in both languages (no missing keys)', () => {
    const en = bookingFlowText('en');
    const hi = bookingFlowText('hi');
    for (const key of ['step.salon', 'salon.title', 'salon.subtitle', 'salon.address', 'salon.phone', 'salon.servicesReady', 'salon.noServices', 'salon.addressPending', 'salon.confirm', 'salon.resume']) {
      assert.ok(en[key], `EN missing ${key}`);
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key], `HI copy equals EN for ${key}`);
    }
  });

  await test('Hindi locale renders the salon step in Hindi', () => {
    setSiteLocale('hi');
    const { utils } = renderFlow('beauty_skin_spa');
    const text = utils.getByTestId('booking-flow').textContent;
    assert.ok(text.includes('अपना सैलून पक्का करें'), 'Hindi salon title missing');
    assert.ok(text.includes('सैलून'), 'Hindi step label missing');
    assert.ok(!text.includes('Confirm your salon'), 'English leaked into Hindi mode');
    cleanup();
    setSiteLocale('en');
    window.localStorage.clear();
  });

  await test('dark mode restyles the salon step through the existing surfaces', () => {
    setSiteAppearance('dark');
    const dark = renderFlow('beauty_skin_spa');
    assert.equal(dark.utils.getByTestId('booking-flow').dataset.appearance, 'dark');
    const darkBg = dark.utils.getByTestId('booking-flow').style.backgroundColor;
    cleanup();
    setSiteAppearance('light');
    const light = renderFlow('beauty_skin_spa');
    assert.equal(light.utils.getByTestId('booking-flow').dataset.appearance, 'light');
    assert.notEqual(light.utils.getByTestId('booking-flow').style.backgroundColor, darkBg);
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* I · ORCHESTRATOR — 10.7 hand-off still works; draft cleared on      */
/*     confirmation                                                    */
/* ================================================================== */
section('Orchestrator — payment hand-off preserved, draft cleared on confirm');
{
  resetState();
  setPaymentScenarioForTests('all_success');

  await test('summary → payment → Pay at Salon confirm clears the foundation draft', async () => {
    const data = richData('family_full_service');
    const utils = render(React.createElement(SiteBookingFullFlow, { themeId: 'family_full_service', data }));
    await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
    await walkToStep('summary', utils);
    assert.ok(readBookingDraft('public-site', 'family_full_service'), 'draft must exist at the summary');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    const paymentFlow = utils.getByTestId('payment-flow');
    assert.equal(paymentFlow.dataset.step, 'option');
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(paymentFlow.dataset.step, 'confirm');
    assert.equal(readBookingDraft('public-site', 'family_full_service'), null, 'confirmed booking must clear the draft');
    cleanup();
    window.localStorage.clear();
    setPaymentStoreForTests(null);
  });
}

/* ================================================================== */
/* J · HOST — the one booking architecture on every renderer           */
/* ================================================================== */
section('Host — every theme renderer opens the extended flow');
{
  for (const theme of THEMES) {
    resetState();
    const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));

    await test(`${theme.id}: final CTA opens the flow on the salon step`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('final-booking-cta')); });
      const flow = utils.getByTestId('booking-flow');
      assert.equal(flow.dataset.theme, theme.id);
      assert.equal(flow.dataset.step, 'salon');
      assert.ok(utils.getByTestId('booking-salon-card'));
      await act(async () => { fireEvent.click(utils.getByTestId('booking-close')); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    cleanup();
  }
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.1 booking foundation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Salon → Service → Date → Time → Details → Summary foundation verified across all five themes, with salon+theme-scoped drafts, EN/HI, light/dark, empty/error states and the existing 10.6/10.7 architecture intact.');
}
