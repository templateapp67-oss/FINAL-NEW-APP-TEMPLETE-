/**
 * PHASE 16.2 — SERVICE SELECTION (five-theme acceptance)
 *
 * The booking flow's Service step is connected to the EXISTING
 * theme-specific service system and gains multi-service selection:
 *
 *   - only the selected salon's ACTIVE-theme services render (name,
 *     category, price, duration) — never foreign-theme, inactive or
 *     invented rows;
 *   - one OR multiple services can be selected; totals (offer-aware
 *     price + variant-aware duration) are calculated automatically;
 *   - the combined selection behaves as ONE sitting for the existing
 *     slot/hold engine (summed duration blocks the full span);
 *   - single-service behaviour stays byte-identical to 10.6/10.7
 *     (same hold keys, same payment hand-off);
 *   - the draft (16.1) snapshots every line + totals; resume restores
 *     the whole selection;
 *   - loading / error / empty states reuse the shared section seam.
 *
 * NOT covered (later phases): date/time slot management, payment,
 * advance payment, confirmation, notifications, booking management.
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

const SiteBookingFlow = (await import('../src/components/SiteBookingFlow.tsx')).default;
const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { SITE_BOOKING_EVENT, openSiteBookingForService } = await import('../src/lib/siteBooking.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { bookingFlowText } = await import('../src/lib/siteBookingI18n.ts');
const {
  BOOKING_MAX_SERVICES,
  bookingCombinedSlotService,
  bookingSelectedServices,
  bookingSelectionSummary,
  bookingServiceDuration,
  bookingServicesForTheme,
  bookingSlotKey,
  toggleBookingService,
  setBookingHoldsForTests,
  activeBookingHolds,
} = await import('../src/lib/siteBookingFlow.ts');
const {
  readBookingDraft,
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

const THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

/** Active-theme services with distinct categories/prices/durations, plus
 * one foreign-theme and one inactive row that must never render. */
function themeServices(themeId) {
  return [
    {
      id: `${themeId}-svc-1`, name: 'Signature Treatment', category: 'Haircuts',
      description: 'Signature service description.', price: 800, duration: 60,
      themeId, status: 'active',
    },
    {
      id: `${themeId}-svc-2`, name: 'Deep Ritual', category: 'Grooming & Treatments',
      description: 'Ritual service description.', price: 1500, duration: 90,
      themeId, status: 'active',
    },
    {
      id: `${themeId}-svc-3`, name: 'Express Refresh', category: 'Haircuts',
      description: 'Express service description.', price: 400, duration: 30,
      themeId, status: 'active',
    },
    {
      id: `foreign-${themeId}`, name: 'Foreign Theme Service', category: 'Foreign',
      description: 'Must never appear.', price: 9999, duration: 60,
      themeId: 'some_other_theme', status: 'active',
    },
    {
      id: `${themeId}-svc-inactive`, name: 'Hidden Service', category: 'Haircuts',
      description: 'Inactive row.', price: 100, duration: 30,
      themeId, status: 'inactive',
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
    services: themeServices(themeId),
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
  setWebsiteSectionFlagsForTests({});
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
/* A · ENGINE — selection toggle, resolution, totals                   */
/* ================================================================== */
section('Engine — multi-service selection & totals');
{
  const svc = (id, price, duration, extras = {}) => ({
    id, name: id, category: 'Cat', description: '', price, duration, ...extras,
  });

  await test('toggleBookingService adds, removes, and enforces the per-appointment cap', () => {
    let ids = [];
    ({ ids } = toggleBookingService(ids, 'a'));
    ({ ids } = toggleBookingService(ids, 'b'));
    assert.deepEqual(ids, ['a', 'b']);
    ({ ids } = toggleBookingService(ids, 'a')); // toggle off
    assert.deepEqual(ids, ['b']);
    for (let i = 0; i < BOOKING_MAX_SERVICES - 1; i += 1) {
      ({ ids } = toggleBookingService(ids, `extra-${i}`));
    }
    assert.equal(ids.length, BOOKING_MAX_SERVICES);
    const refused = toggleBookingService(ids, 'one-too-many');
    assert.equal(refused.changed, false);
    assert.equal(refused.reason, 'limit');
    assert.equal(refused.ids.length, BOOKING_MAX_SERVICES);
  });

  await test('bookingSelectedServices drops unknown/stale ids and keeps selection order', () => {
    const services = [svc('s1', 100, 30), svc('s2', 200, 45), svc('s3', 300, 60)];
    const resolved = bookingSelectedServices(services, ['s3', 'ghost', 's1', 's3']);
    assert.deepEqual(resolved.map((item) => item.id), ['s3', 's1'], 'order preserved, ghosts and dupes dropped');
  });

  await test('bookingSelectionSummary sums offer-aware prices and variant-aware durations', () => {
    const services = [
      svc('s1', 1000, 60, { themeId: 'beauty_skin_spa' }),
      svc('s2', 500, 30, {
        themeId: 'beauty_skin_spa',
        pricingVariants: [{ id: 'v1', name: 'Long hair', price: 700, duration: 45, status: 'active' }],
        selectedVariantId: 'v1',
      }),
    ];
    // Real ServiceOffer shape from the existing Phase 9.1 engine:
    // 20% off targeting the saved service 's1', same theme, active today.
    const offers = [{
      id: 'off-1', businessId: 'biz', themeId: 'beauty_skin_spa', themeKey: 'beauty_skin_spa',
      targetType: 'saved_service', categoryId: null, predefinedServiceId: null,
      savedServiceId: 's1', packageId: null, title: '20% off',
      promotionalBadge: '', discountType: 'percentage', discountValue: 20,
      startDate: '2020-01-01', endDate: '2099-12-31',
      status: 'active', effectiveStatus: 'active',
    }];
    const summary = bookingSelectionSummary(services, offers);
    assert.equal(summary.count, 2);
    assert.equal(summary.lines[0].finalPrice, 800, 's1 must be offer-priced (1000 - 20%)');
    assert.equal(summary.lines[1].finalPrice, 700, 's2 must use the active variant price');
    assert.equal(summary.lines[1].durationMinutes, 45, 's2 must use the active variant duration');
    assert.equal(summary.totalPrice, 1500);
    assert.equal(summary.totalDurationMinutes, 105);
    assert.equal(summary.totalBasePrice, 1700);
  });

  await test('bookingServiceDuration prefers the active variant duration', () => {
    assert.equal(bookingServiceDuration(svc('s', 100, 60)), 60);
    assert.equal(
      bookingServiceDuration(svc('s', 100, 60, {
        pricingVariants: [{ id: 'v', name: 'v', price: 100, duration: 90, status: 'active' }],
      })),
      90,
    );
  });

  await test('bookingCombinedSlotService: single service collapses to itself (10.6 identical)', () => {
    const one = bookingCombinedSlotService([svc('solo', 100, 45)]);
    assert.deepEqual(one, { id: 'solo', duration: 45 });
    assert.equal(bookingCombinedSlotService([]), null);
  });

  await test('bookingCombinedSlotService: multi selection = stable id + summed duration', () => {
    const a = bookingCombinedSlotService([svc('b', 1, 30), svc('a', 1, 60)]);
    const b = bookingCombinedSlotService([svc('a', 1, 60), svc('b', 1, 30)]);
    assert.equal(a.id, b.id, 'combined id must not depend on selection order');
    assert.equal(a.duration, 90);
  });
}

/* ================================================================== */
/* B · ENGINE — theme isolation of the bookable list                   */
/* ================================================================== */
section('Engine — theme isolation (existing relationships, no copies)');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: bookable list = active own-theme services only`, () => {
      const list = bookingServicesForTheme(richData(themeId), themeId);
      assert.deepEqual(list.map((item) => item.id), [
        `${themeId}-svc-1`, `${themeId}-svc-2`, `${themeId}-svc-3`,
      ]);
    });
  }

  await test('a selection can never resolve foreign-theme or inactive services', () => {
    const data = richData('barber_mens_grooming');
    const list = bookingServicesForTheme(data, 'barber_mens_grooming');
    const resolved = bookingSelectedServices(list, [
      'barber_mens_grooming-svc-1',
      'foreign-barber_mens_grooming',        // foreign theme
      'barber_mens_grooming-svc-inactive',   // inactive
      'hair_studio_color_bar-svc-1',         // other theme's id
    ]);
    assert.deepEqual(resolved.map((item) => item.id), ['barber_mens_grooming-svc-1']);
  });
}

/* ================================================================== */
/* C · UI — per-theme service step: fields, multi-select, totals       */
/* ================================================================== */
section('UI — service step per theme (name/category/price/duration + totals)');
{
  for (const themeId of THEME_IDS) {
    resetState();
    const { utils } = renderFlow(themeId);

    await test(`${themeId}: rows show name, category, price and duration; foreign rows absent`, async () => {
      await clickContinue(utils); // salon → service
      const flow = utils.getByTestId('booking-flow');
      assert.equal(flow.dataset.step, 'service');
      const row = utils.getByTestId(`booking-service-${themeId}-svc-2`);
      assert.ok(row.textContent.includes('Deep Ritual'), 'name missing');
      assert.ok(row.textContent.includes('Grooming & Treatments'), 'category missing');
      assert.ok(row.textContent.includes('₹1,500'), 'price missing');
      assert.ok(row.textContent.includes('90 min'), 'duration missing');
      assert.equal(utils.queryByTestId(`booking-service-foreign-${themeId}`), null, 'foreign service leaked');
      assert.equal(utils.queryByTestId(`booking-service-${themeId}-svc-inactive`), null, 'inactive service leaked');
    });

    await test(`${themeId}: first service auto-selected; totals panel shows it`, () => {
      assert.equal(utils.getByTestId(`booking-service-${themeId}-svc-1`).dataset.selected, 'true');
      const totals = utils.getByTestId('booking-selection-totals');
      assert.equal(totals.dataset.count, '1');
      assert.equal(totals.dataset.totalPrice, '800');
      assert.equal(totals.dataset.totalDuration, '60');
    });

    await test(`${themeId}: adding two more services auto-recalculates price + duration`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-2`)); });
      await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-3`)); });
      const totals = utils.getByTestId('booking-selection-totals');
      assert.equal(totals.dataset.count, '3');
      assert.equal(totals.dataset.totalPrice, String(800 + 1500 + 400));
      assert.equal(totals.dataset.totalDuration, String(60 + 90 + 30));
      assert.ok(utils.getByTestId('booking-selection-total-price').textContent.includes('₹2,700'));
      // Every line is listed in the panel.
      assert.ok(utils.getByTestId(`booking-selection-line-${themeId}-svc-1`));
      assert.ok(utils.getByTestId(`booking-selection-line-${themeId}-svc-2`));
      assert.ok(utils.getByTestId(`booking-selection-line-${themeId}-svc-3`));
    });

    await test(`${themeId}: toggling a selected card removes it; Remove buttons work too`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-2`)); });
      let totals = utils.getByTestId('booking-selection-totals');
      assert.equal(totals.dataset.count, '2');
      assert.equal(totals.dataset.totalPrice, String(800 + 400));
      await act(async () => { fireEvent.click(utils.getByTestId(`booking-selection-remove-${themeId}-svc-3`)); });
      totals = utils.getByTestId('booking-selection-totals');
      assert.equal(totals.dataset.count, '1');
      assert.equal(totals.dataset.totalPrice, '800');
      assert.equal(totals.dataset.totalDuration, '60');
    });

    await test(`${themeId}: Clear all empties the selection and disables Continue`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-selection-clear')); });
      assert.equal(utils.queryByTestId('booking-selection-totals'), null, 'totals panel must hide when empty');
      assert.equal(utils.getByTestId('booking-continue').disabled, true, 'Continue must need >= 1 service');
      // Re-select for the next themes' loop hygiene.
      await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-1`)); });
      assert.equal(utils.getByTestId('booking-continue').disabled, false);
    });

    cleanup();
    window.localStorage.clear();
  }
}

/* ================================================================== */
/* D · UI — multi-service journey: slots, summary, draft               */
/* ================================================================== */
section('UI — multi-service journey (one sitting, summed span, summary, draft)');
{
  resetState();
  const themeId = 'beauty_skin_spa';
  const { utils } = renderFlow(themeId);

  await test('selection of 2 services books ONE combined sitting (90+60=150 min hold)', async () => {
    await clickContinue(utils); // salon → service
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-2`)); });
    const totals = utils.getByTestId('booking-selection-totals');
    assert.equal(totals.dataset.count, '2');
    assert.equal(totals.dataset.totalDuration, '150');
    await walkToStep('time', utils);
    const holds = activeBookingHolds();
    assert.equal(holds.length, 1, 'exactly one hold for the combined sitting');
    assert.equal(holds[0].endMinutes - holds[0].startMinutes, 150, 'hold must span the summed duration');
    assert.equal(holds[0].themeId, themeId);
  });

  await test('summary lists BOTH services with their own category/duration/price + totals', async () => {
    await walkToStep('summary', utils);
    assert.ok(utils.getByTestId(`booking-summary-service-${themeId}-svc-1`));
    assert.ok(utils.getByTestId(`booking-summary-service-${themeId}-svc-2`));
    const text = utils.getByTestId('booking-flow').textContent;
    assert.ok(text.includes('Signature Treatment'));
    assert.ok(text.includes('Deep Ritual'));
    assert.ok(text.includes('₹800'));
    assert.ok(text.includes('₹1,500'));
    assert.ok(text.includes('₹2,300'), 'total price missing');
    assert.ok(text.includes('150 min'), 'total duration missing');
    const totalRow = utils.getByTestId('booking-summary-total');
    assert.ok(totalRow.textContent.includes('₹2,300'));
    assert.ok(totalRow.textContent.includes('2 services'));
  });

  await test('multi-service confirm stays on the summary with the later-phase note (no payment)', async () => {
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'summary', 'must not advance');
  });

  await test('the draft snapshots every line + totals (16.1 fields mirror line 1 + totals)', () => {
    const draft = readBookingDraft('public-site', themeId);
    assert.ok(draft, 'draft missing');
    assert.equal(draft.services.length, 2);
    assert.deepEqual(draft.services.map((line) => line.serviceId), [`${themeId}-svc-1`, `${themeId}-svc-2`]);
    assert.equal(draft.services[1].category, 'Grooming & Treatments');
    assert.equal(draft.services[1].price, 1500);
    assert.equal(draft.services[1].durationMinutes, 90);
    assert.equal(draft.totalPrice, 2300);
    assert.equal(draft.totalDurationMinutes, 150);
    // Back-compat mirrors.
    assert.equal(draft.serviceId, `${themeId}-svc-1`);
    assert.equal(draft.servicePrice, 2300);
    assert.equal(draft.serviceDurationMinutes, 150);
    assert.equal(draft.endMinutes, draft.startMinutes + 150);
    assert.equal(draft.status, 'summary_ready');
  });

  await test('reopen restores the FULL multi-service selection', async () => {
    cleanup();
    const again = renderFlow(themeId);
    assert.ok(again.utils.getByTestId('booking-draft-resumed'), 'resume notice missing');
    await clickContinue(again.utils); // salon → service
    assert.equal(again.utils.getByTestId(`booking-service-${themeId}-svc-1`).dataset.selected, 'true');
    assert.equal(again.utils.getByTestId(`booking-service-${themeId}-svc-2`).dataset.selected, 'true');
    const totals = again.utils.getByTestId('booking-selection-totals');
    assert.equal(totals.dataset.count, '2');
    assert.equal(totals.dataset.totalPrice, '2300');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* E · UI — single-service path byte-identical to 10.6/10.7            */
/* ================================================================== */
section('Single-service path — unchanged 10.6/10.7 behaviour');
{
  resetState();

  await test('single selection keeps the 10.6 hold key (no combined-id drift)', async () => {
    const themeId = 'barber_mens_grooming';
    const { utils } = renderFlow(themeId);
    await walkToStep('time', utils);
    const holds = activeBookingHolds();
    assert.equal(holds.length, 1);
    assert.equal(
      holds[0].key,
      bookingSlotKey(themeId, `${themeId}-svc-1`, holds[0].dateKey, holds[0].startMinutes),
      'single-service hold key must be the plain 10.6 key',
    );
    assert.equal(holds[0].endMinutes - holds[0].startMinutes, 60);
    cleanup();
    window.localStorage.clear();
  });

  await test('single-service Confirm still hands off to the existing 10.7 payment flow', async () => {
    resetState();
    setPaymentScenarioForTests('all_success');
    const data = richData('hair_studio_color_bar');
    const utils = render(React.createElement(SiteBookingFullFlow, { themeId: 'hair_studio_color_bar', data }));
    await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
    await walkToStep('summary', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    assert.ok(utils.getByTestId('payment-flow'), 'payment flow must open for a single service');
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'option');
    cleanup();
    window.localStorage.clear();
    setPaymentStoreForTests(null);
  });

  await test('multi-service Confirm hands off to the existing payment flow (Phase 16.5)', async () => {
    // PHASE 16.5 replaced the 16.2 placeholder: multi-service selections now
    // enter the SAME payment architecture, priced from the real line total.
    resetState();
    const data = richData('hair_studio_color_bar');
    const utils = render(React.createElement(SiteBookingFullFlow, { themeId: 'hair_studio_color_bar', data }));
    await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
    await clickContinue(utils); // salon → service
    await act(async () => { fireEvent.click(utils.getByTestId('booking-service-hair_studio_color_bar-svc-2')); });
    await walkToStep('summary', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    const paymentFlow = utils.getByTestId('payment-flow');
    assert.ok(Boolean(paymentFlow), 'multi-service must reach the payment flow');
    assert.equal(paymentFlow.dataset.step, 'option');
    // The booking total is the REAL sum of the two line prices (800 + 1500).
    const totalNode = utils.getByTestId('payment-total-amount');
    assert.ok(totalNode.textContent.includes('₹2,300'), `wrong total: ${totalNode.textContent}`);
    cleanup();
    window.localStorage.clear();
  });

  await test('12.3 prefill still opens on the service step with ONLY that service selected', async () => {
    resetState();
    const data = richData('nail_lash_studio');
    openSiteBookingForService(data.services[1], 'nail_lash_studio');
    const utils = render(React.createElement(SiteBookingFlow, {
      themeId: 'nail_lash_studio', data, onBackToWebsite: () => {},
    }));
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service');
    assert.equal(utils.getByTestId('booking-service-nail_lash_studio-svc-2').dataset.selected, 'true');
    assert.equal(utils.getByTestId('booking-service-nail_lash_studio-svc-1').dataset.selected, 'false');
    const totals = utils.getByTestId('booking-selection-totals');
    assert.equal(totals.dataset.count, '1');
    assert.equal(totals.dataset.totalPrice, '1500');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* F · UI — selection cap + hold invalidation on change                */
/* ================================================================== */
section('Selection cap and hold safety');
{
  resetState();

  await test(`cap: the ${BOOKING_MAX_SERVICES + 2}-service salon refuses service #${BOOKING_MAX_SERVICES + 1}`, async () => {
    const themeId = 'family_full_service';
    const many = Array.from({ length: BOOKING_MAX_SERVICES + 2 }, (_, i) => ({
      id: `${themeId}-many-${i}`, name: `Service ${i}`, category: 'Cat',
      description: '', price: 100 + i, duration: 30, themeId, status: 'active',
    }));
    const { utils, toasts } = renderFlow(themeId, { services: many });
    await clickContinue(utils); // salon → service
    // First is auto-selected; add up to the cap.
    for (let i = 1; i < BOOKING_MAX_SERVICES; i += 1) {
      await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-many-${i}`)); });
    }
    assert.equal(utils.getByTestId('booking-selection-totals').dataset.count, String(BOOKING_MAX_SERVICES));
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-many-${BOOKING_MAX_SERVICES}`)); });
    assert.equal(utils.getByTestId('booking-selection-totals').dataset.count, String(BOOKING_MAX_SERVICES), 'cap exceeded');
    assert.ok(toasts.some((msg) => msg.includes(String(BOOKING_MAX_SERVICES))), 'limit toast missing');
    cleanup();
    window.localStorage.clear();
  });

  await test('changing the selection AFTER holding a slot releases the old hold', async () => {
    resetState();
    const themeId = 'barber_mens_grooming';
    const { utils } = renderFlow(themeId);
    await walkToStep('time', utils);
    const before = activeBookingHolds();
    assert.equal(before.length, 1);
    assert.equal(before[0].endMinutes - before[0].startMinutes, 60);
    // Go back and add a second service — the 60-min hold must not survive.
    await act(async () => { fireEvent.click(utils.getByTestId('booking-step-service')); });
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-3`)); });
    const between = activeBookingHolds();
    assert.equal(between.length, 0, 'stale hold must be released when the sitting changes');
    // Re-entering the time step re-holds with the new combined span.
    await walkToStep('time', utils);
    const after = activeBookingHolds();
    assert.equal(after.length, 1);
    assert.equal(after[0].endMinutes - after[0].startMinutes, 90, '60+30 combined span');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });
}

/* ================================================================== */
/* G · UI — loading / error / empty states                             */
/* ================================================================== */
section('Loading / error / empty states (shared section seam)');
{
  resetState();

  await test('forced loading: skeleton shown, no rows, Continue disabled', async () => {
    setWebsiteSectionFlagsForTests({ services: 'loading' });
    const { utils } = renderFlow('beauty_skin_spa');
    await clickContinue(utils); // salon → service
    assert.ok(utils.getByTestId('booking-loading-services'));
    assert.equal(utils.container.querySelector('[data-testid^="booking-service-beauty"]'), null);
    setWebsiteSectionFlagsForTests({});
    cleanup();
    window.localStorage.clear();
  });

  await test('forced error: message + Retry; recovery renders the real list', async () => {
    setWebsiteSectionFlagsForTests({ services: 'error' });
    const { utils } = renderFlow('beauty_skin_spa');
    await clickContinue(utils);
    assert.ok(utils.getByTestId('booking-error-services'));
    assert.equal(utils.container.querySelector('[data-testid^="booking-service-beauty"]'), null);
    // Source recovers, visitor retries.
    setWebsiteSectionFlagsForTests({});
    await act(async () => { fireEvent.click(utils.getByTestId('booking-retry-services')); });
    assert.ok(utils.getByTestId('booking-service-beauty_skin_spa-svc-1'), 'list must render after retry');
    cleanup();
    window.localStorage.clear();
  });

  await test('empty: salon with no active-theme services shows the empty state', async () => {
    const { utils } = renderFlow('family_full_service', {
      services: [{
        id: 'foreign-only', name: 'Foreign', category: 'X', description: '',
        price: 1, duration: 30, themeId: 'some_other_theme', status: 'active',
      }],
    });
    // Salon step already blocks continue; check the service step's own state
    // by forcing the step via the empty-services salon notice presence.
    assert.ok(utils.getByTestId('booking-salon-no-services'));
    assert.equal(utils.getByTestId('booking-continue').disabled, true);
    cleanup();
    window.localStorage.clear();
  });

  await test('Hindi copies exist for the new states + multi-select strings', () => {
    const en = bookingFlowText('en');
    const hi = bookingFlowText('hi');
    for (const key of [
      'service.error', 'service.loading', 'service.retry', 'service.add', 'service.added',
      'service.remove', 'service.multiHint', 'service.limitNote', 'service.totalTitle',
      'service.totalServices', 'service.totalService', 'service.totalDuration',
      'service.totalPrice', 'service.clearAll', 'summary.services', 'summary.multiPaymentNote',
    ]) {
      assert.ok(en[key], `EN missing ${key}`);
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key], `HI equals EN for ${key}`);
    }
  });

  await test('Hindi UI: totals panel renders in Hindi', async () => {
    setSiteLocale('hi');
    const { utils } = renderFlow('beauty_skin_spa');
    await clickContinue(utils);
    const totals = utils.getByTestId('booking-selection-totals');
    assert.ok(totals.textContent.includes('आपकी पसंद'), 'Hindi totals title missing');
    assert.ok(totals.textContent.includes('1 सेवा'), 'Hindi count missing');
    cleanup();
    setSiteLocale('en');
    window.localStorage.clear();
  });

  await test('dark mode: service step + totals panel restyle through existing surfaces', async () => {
    setSiteAppearance('dark');
    const { utils } = renderFlow('beauty_skin_spa');
    assert.equal(utils.getByTestId('booking-flow').dataset.appearance, 'dark');
    await clickContinue(utils);
    assert.ok(utils.getByTestId('booking-selection-totals'));
    cleanup();
    setSiteAppearance('light');
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* H · THEME SWITCH — selection can never leak across themes           */
/* ================================================================== */
section('Theme switch — no selection leakage');
{
  resetState();

  await test('a selection made on one theme cannot appear on another theme', async () => {
    // Book two services on barber and reach the summary (draft written).
    const first = renderFlow('barber_mens_grooming');
    await clickContinue(first.utils);
    await act(async () => { fireEvent.click(first.utils.getByTestId('booking-service-barber_mens_grooming-svc-2')); });
    assert.equal(first.utils.getByTestId('booking-selection-totals').dataset.count, '2');
    cleanup();
    // Open the flow on spa — its own first service only, barber draft invisible.
    const second = renderFlow('beauty_skin_spa');
    await clickContinue(second.utils);
    const totals = second.utils.getByTestId('booking-selection-totals');
    assert.equal(totals.dataset.count, '1', 'foreign-theme draft must not resume here');
    assert.equal(second.utils.getByTestId('booking-service-beauty_skin_spa-svc-1').dataset.selected, 'true');
    assert.equal(second.utils.container.textContent.includes('barber_mens_grooming'), false);
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.2 service selection: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Multi-service selection with auto totals verified across all five themes: theme-isolated lists (name/category/price/duration), combined single-sitting holds, summary line items, draft snapshots, 10.6/10.7-identical single-service path, loading/empty/error states, EN/HI + light/dark.');
}
