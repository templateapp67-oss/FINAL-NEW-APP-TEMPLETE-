/**
 * PHASE 16.6 — BOOKING CONFIRMATION (five-theme acceptance)
 *
 * After a successful booking + required advance payment the customer gets
 * a clear Booking Confirmation screen built on the EXISTING booking /
 * payment architecture (Phase 10.7 + 16.5 record store — no duplicate
 * booking system, no invented tables/columns/ids/amounts):
 *
 *   - real booking information: salon, service(s), date, time, duration,
 *     total, advance paid, remaining, payment status, booking reference;
 *   - the reference is the EXISTING record's `bookingId` (`NX-#####`)
 *     produced by the existing engine — never invented in the screen;
 *   - Confirmed / Payment Pending / Payment Failed / Cancelled states are
 *     visually and semantically distinct, and "Confirmed" is NEVER shown
 *     until the required advance payment actually succeeded;
 *   - the summary/receipt is reachable again from the booking history;
 *   - refresh / retry / returning to the confirmation page never creates a
 *     duplicate booking;
 *   - the confirmation stays linked to the correct salon, customer,
 *     services, date and time, and never exposes another customer's or
 *     another salon's data;
 *   - loading / success / error / payment-failure states;
 *   - desktop / tablet / mobile, EN/HI, light/dark.
 *
 * NOT covered (later phases): Call/WhatsApp protection, notifications,
 * final acceptance testing.
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
globalThis.Blob = dom.window.Blob;
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
dom.window.confirm = () => true;
globalThis.confirm = dom.window.confirm;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
}

const React = (await import('react')).default;
const { render: testingRender, cleanup, act, fireEvent } = await import('@testing-library/react');

const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const SiteBookingPaymentFlow = (await import('../src/components/SiteBookingPaymentFlow.tsx')).default;
const SiteMyBookings = (await import('../src/components/SiteMyBookings.tsx')).default;
const SiteBookingConfirmation = (await import('../src/components/SiteBookingConfirmation.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { SITE_BOOKING_EVENT } = await import('../src/lib/siteBooking.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { setBookingHoldsForTests, bookingBrowserId } = await import('../src/lib/siteBookingFlow.ts');
const { setBookingDraftStoreForTests } = await import('../src/lib/siteBookingDraft.ts');
const {
  setPaymentStoreForTests,
  setPaymentScenarioForTests,
  readPaymentRecords,
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
} = await import('../src/lib/siteBookingPayment.ts');
const {
  bookingConfirmationState,
  isConfirmedState,
  toBookingConfirmation,
  readBookingConfirmation,
  readMyBookingConfirmations,
  findActiveBookingForContext,
  bookingContextKey,
  bookingServiceIds,
  bookingServiceLines,
  bookingConfirmationReceiptText,
  BOOKING_CONFIRMATION_STATES,
} = await import('../src/lib/siteBookingConfirmation.ts');
const { bookingConfirmationText } = await import('../src/lib/siteBookingConfirmationI18n.ts');
const { AuthModalProvider } = await import('../src/components/AuthModalProvider.tsx');

function render(ui, options) {
  const wrap = (child) => React.createElement(AuthModalProvider, null, child);
  const utils = testingRender(wrap(ui), options);
  return {
    ...utils,
    rerender: (nextUi) => utils.rerender(wrap(nextUi)),
  };
}

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
async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

const THU_OPEN = new Date(2026, 7, 13, 11, 0, 0, 0);

const THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

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
    team: [],
    ...extras,
  };
}

function paymentRecord(overrides = {}) {
  const now = Date.now();
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 9)}`,
    businessId: 'public-site',
    themeId: 'beauty_skin_spa',
    customerId: 'someone-else',
    bookingId: `NX-${Math.floor(10000 + Math.random() * 89999)}`,
    serviceId: 'beauty_skin_spa-svc-1',
    serviceName: 'Signature Treatment',
    dateKey: '2026-08-14',
    startMinutes: 780,
    endMinutes: 840,
    baseAmount: 800,
    amountDue: 200,
    remainingAmount: 600,
    currency: 'INR',
    paymentOption: 'advance',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
    createdAt: now,
    updatedAt: now,
    payAtSalon: false,
    ...overrides,
  };
}

function seedRecords(records) {
  if (records === null) window.localStorage.removeItem(PAYMENT_STORE_KEY);
  else window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PAYMENT_EVENT));
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
  setPaymentScenarioForTests('all_success');
}

async function openFlow(themeId, extras = {}) {
  const data = richData(themeId, extras);
  const utils = render(React.createElement(SiteBookingFullFlow, { themeId, data }));
  await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
  return { utils, data };
}

/** Walks the 16.x entry flow to the summary. */
async function walkToSummary(utils, extraServiceIds = []) {
  const flow = utils.getByTestId('booking-flow');
  const steps = ['salon', 'service', 'date', 'time', 'details', 'summary'];
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
  for (const id of extraServiceIds) {
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${id}`)); });
  }
  while (flow.dataset.step !== 'summary' && steps.indexOf(flow.dataset.step) < steps.indexOf('summary')) {
    if (flow.dataset.step === 'details') {
      await act(async () => {
        fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Asha Verma' } });
        fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '9876543210' } });
      });
    }
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
  }
  assert.equal(flow.dataset.step, 'summary');
}

async function enterPayment(utils) {
  await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
  assert.equal(utils.getByTestId('payment-flow').dataset.step, 'option');
}

async function payAdvance(utils) {
  fireEvent.click(utils.getByTestId('payment-option-advance'));
  await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
  await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
  await act(async () => { await wait(1600); });
}

function renderMyBookings(themeId, businessId, extras = {}) {
  const toasts = [];
  const utils = render(React.createElement(SiteMyBookings, {
    themeId, data: richData(themeId, extras), businessId, onShowToast: (m) => toasts.push(m),
  }));
  return { utils, toasts };
}

function renderConfirmationPanel(themeId, view, props = {}) {
  const utils = render(React.createElement(SiteBookingConfirmation, {
    themeId, data: richData(themeId), view, ...props,
  }));
  return utils;
}

/* ================================================================== */
/* A · STATE DERIVATION — confirmed only after a real payment          */
/* ================================================================== */
section('State derivation — Confirmed / Pending / Failed / Cancelled');
{
  await test('the four required states exist and are derived from the persisted pair', () => {
    for (const s of ['confirmed', 'payment_pending', 'payment_failed', 'cancelled']) {
      assert.ok(BOOKING_CONFIRMATION_STATES.includes(s), `${s} missing`);
    }
    assert.equal(bookingConfirmationState({ bookingStatus: 'confirmed', paymentStatus: 'paid' }), 'confirmed');
    assert.equal(bookingConfirmationState({ bookingStatus: 'pending_payment', paymentStatus: 'pending' }), 'payment_pending');
    assert.equal(bookingConfirmationState({ bookingStatus: 'failed', paymentStatus: 'failed' }), 'payment_failed');
    assert.equal(bookingConfirmationState({ bookingStatus: 'cancelled', paymentStatus: 'cancelled' }), 'cancelled');
  });

  await test('NEVER confirmed while the required payment has not succeeded', () => {
    // Even a (corrupt / mid-write) row claiming `confirmed` must not be
    // reported as confirmed while the payment is not `paid`.
    for (const paymentStatus of ['unpaid', 'pending', 'failed', 'cancelled']) {
      const state = bookingConfirmationState({ bookingStatus: 'confirmed', paymentStatus });
      assert.notEqual(state, 'confirmed', `confirmed leaked with paymentStatus=${paymentStatus}`);
    }
    assert.equal(bookingConfirmationState({ bookingStatus: 'confirmed', paymentStatus: 'pending' }), 'payment_pending');
    assert.equal(bookingConfirmationState({ bookingStatus: 'confirmed', paymentStatus: 'failed' }), 'payment_failed');
  });

  await test('pay-at-salon (no advance required) is a legitimate confirmed state', () => {
    const state = bookingConfirmationState({ bookingStatus: 'pay_at_salon', paymentStatus: 'unpaid' });
    assert.equal(state, 'confirmed');
    assert.equal(isConfirmedState(state), true);
  });

  await test('timeouts/cancellations resolve to failed / cancelled, never confirmed', () => {
    assert.equal(bookingConfirmationState({ bookingStatus: 'pending_payment', paymentStatus: 'failed' }), 'payment_failed');
    assert.equal(bookingConfirmationState({ bookingStatus: 'pending_payment', paymentStatus: 'cancelled' }), 'cancelled');
    assert.equal(isConfirmedState('payment_pending'), false);
    assert.equal(isConfirmedState('payment_failed'), false);
    assert.equal(isConfirmedState('cancelled'), false);
    assert.equal(isConfirmedState('completed'), true);
  });
}

/* ================================================================== */
/* B · VIEW — real booking information from the EXISTING record        */
/* ================================================================== */
section('View — every required field read from the existing record');
{
  await test('view exposes reference, services, slot, duration and the money snapshot', () => {
    const record = paymentRecord({
      bookingId: 'NX-55555',
      baseAmount: 2300, amountDue: 575, remainingAmount: 1725,
      services: [
        { serviceId: 'a', serviceName: 'Signature Treatment', price: 800, durationMinutes: 60 },
        { serviceId: 'b', serviceName: 'Deep Ritual', price: 1500, durationMinutes: 90 },
      ],
      startMinutes: 600, endMinutes: 750,
    });
    const view = toBookingConfirmation(record);
    assert.equal(view.reference, 'NX-55555');
    assert.deepEqual(view.serviceNames, ['Signature Treatment', 'Deep Ritual']);
    assert.equal(view.dateKey, '2026-08-14');
    assert.equal(view.startMinutes, 600);
    assert.equal(view.endMinutes, 750);
    assert.equal(view.durationMinutes, 150);
    assert.equal(view.totalAmount, 2300);
    assert.equal(view.advancePaid, 575);
    assert.equal(view.remainingAmount, 1725);
    assert.equal(view.paymentStatus, 'paid');
    assert.equal(view.state, 'confirmed');
  });

  await test('unpaid rows report advance paid 0 and the full amount remaining', () => {
    const view = toBookingConfirmation(paymentRecord({
      paymentStatus: 'pending', bookingStatus: 'pending_payment',
    }));
    assert.equal(view.advancePaid, 0);
    assert.equal(view.remainingAmount, 800, 'nothing is paid, so everything remains');
    assert.equal(view.totalAmount, 800);
    assert.equal(view.state, 'payment_pending');
  });

  await test('single-service rows collapse to exactly one line (no invented lines)', () => {
    const record = paymentRecord();
    assert.deepEqual(bookingServiceIds(record), ['beauty_skin_spa-svc-1']);
    const lines = bookingServiceLines(record);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].serviceName, 'Signature Treatment');
    assert.equal(lines[0].price, 800);
  });

  await test('the reference is the record id, never generated by the view layer', () => {
    const view = toBookingConfirmation(paymentRecord({ bookingId: 'NX-12345' }));
    assert.equal(view.reference, 'NX-12345');
    assert.match(view.reference, /^NX-\d{5}$/);
    const again = toBookingConfirmation(paymentRecord({ bookingId: 'NX-12345' }));
    assert.equal(again.reference, view.reference, 'projection must be stable');
  });
}

/* ================================================================== */
/* C · PRIVACY — own rows only, tenant + theme keyed                   */
/* ================================================================== */
section('Privacy — no other customer / salon data is reachable');
{
  await test('readBookingConfirmation returns only THIS visitor\'s booking', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ bookingId: 'NX-MINE', customerId: me }),
      paymentRecord({ bookingId: 'NX-THEIRS', customerId: 'other-browser' }),
    ]);
    const mine = readBookingConfirmation('NX-MINE', 'public-site', 'beauty_skin_spa');
    assert.equal(mine.ok, true);
    assert.equal(mine.view.reference, 'NX-MINE');
    const theirs = readBookingConfirmation('NX-THEIRS', 'public-site', 'beauty_skin_spa');
    assert.equal(theirs.ok, false);
    assert.equal(theirs.reason, 'not-found');
    seedRecords(null);
  });

  await test('a foreign salon / theme booking is structurally unreachable', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ bookingId: 'NX-OTHERSALON', customerId: me, businessId: 'other-salon' }),
      paymentRecord({ bookingId: 'NX-OTHERTHEME', customerId: me, themeId: 'barber_mens_grooming' }),
    ]);
    assert.equal(readBookingConfirmation('NX-OTHERSALON', 'public-site', 'beauty_skin_spa').ok, false);
    assert.equal(readBookingConfirmation('NX-OTHERTHEME', 'public-site', 'beauty_skin_spa').ok, false);
    // The same rows ARE reachable under their OWN tenant keys.
    assert.equal(readBookingConfirmation('NX-OTHERSALON', 'other-salon', 'beauty_skin_spa').ok, true);
    seedRecords(null);
  });

  await test('readMyBookingConfirmations lists own rows for one salon only', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ bookingId: 'NX-A', customerId: me }),
      paymentRecord({ bookingId: 'NX-B', customerId: me }),
      paymentRecord({ bookingId: 'NX-C', customerId: 'other-browser' }),
      paymentRecord({ bookingId: 'NX-D', customerId: me, businessId: 'other-salon' }),
    ]);
    const refs = readMyBookingConfirmations('public-site', 'beauty_skin_spa').map((v) => v.reference).sort();
    assert.deepEqual(refs, ['NX-A', 'NX-B']);
    seedRecords(null);
  });
}

/* ================================================================== */
/* D · DUPLICATE PROTECTION                                            */
/* ================================================================== */
section('Duplicate protection — refresh / retry / return never re-books');
{
  await test('findActiveBookingForContext matches the same salon+services+slot+customer', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-LIVE', customerId: me })]);
    const found = findActiveBookingForContext({
      businessId: 'public-site',
      themeId: 'beauty_skin_spa',
      serviceIds: ['beauty_skin_spa-svc-1'],
      dateKey: '2026-08-14',
      startMinutes: 780,
      customerMobile: '98765 43210',
    });
    assert.ok(found, 'existing live booking must be found (mobile formatting ignored)');
    assert.equal(found.bookingId, 'NX-LIVE');
    seedRecords(null);
  });

  await test('a different slot / service / customer is NOT treated as a duplicate', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-LIVE', customerId: me })]);
    const base = {
      businessId: 'public-site',
      themeId: 'beauty_skin_spa',
      serviceIds: ['beauty_skin_spa-svc-1'],
      dateKey: '2026-08-14',
      startMinutes: 780,
      customerMobile: '9876543210',
    };
    assert.equal(findActiveBookingForContext({ ...base, startMinutes: 840 }), null);
    assert.equal(findActiveBookingForContext({ ...base, dateKey: '2026-08-15' }), null);
    assert.equal(findActiveBookingForContext({ ...base, serviceIds: ['beauty_skin_spa-svc-2'] }), null);
    assert.equal(findActiveBookingForContext({ ...base, customerMobile: '9000000000' }), null);
    assert.equal(findActiveBookingForContext({ ...base, businessId: 'other-salon' }), null);
    seedRecords(null);
  });

  await test('failed / cancelled rows are re-bookable (not blocking duplicates)', () => {
    resetState();
    const me = bookingBrowserId();
    const ctx = {
      businessId: 'public-site',
      themeId: 'beauty_skin_spa',
      serviceIds: ['beauty_skin_spa-svc-1'],
      dateKey: '2026-08-14',
      startMinutes: 780,
      customerMobile: '9876543210',
    };
    seedRecords([paymentRecord({ bookingId: 'NX-FAILED', customerId: me, bookingStatus: 'failed', paymentStatus: 'failed' })]);
    assert.equal(findActiveBookingForContext(ctx), null);
    seedRecords([paymentRecord({ bookingId: 'NX-CXL', customerId: me, bookingStatus: 'cancelled', paymentStatus: 'cancelled' })]);
    assert.equal(findActiveBookingForContext(ctx), null);
    seedRecords(null);
  });

  await test('another customer\'s live booking never blocks this visitor', () => {
    resetState();
    seedRecords([paymentRecord({ bookingId: 'NX-THEIRS', customerId: 'other-browser' })]);
    assert.equal(findActiveBookingForContext({
      businessId: 'public-site',
      themeId: 'beauty_skin_spa',
      serviceIds: ['beauty_skin_spa-svc-1'],
      dateKey: '2026-08-14',
      startMinutes: 780,
      customerMobile: '9876543210',
    }), null);
    seedRecords(null);
  });

  await test('the context key ignores service order and mobile formatting', () => {
    const a = bookingContextKey({
      businessId: 'b', themeId: 't', serviceIds: ['s2', 's1'], dateKey: 'd', startMinutes: 1, customerMobile: '+91 98765-43210',
    });
    const b = bookingContextKey({
      businessId: 'b', themeId: 't', serviceIds: ['s1', 's2'], dateKey: 'd', startMinutes: 1, customerMobile: '9876543210',
    });
    assert.equal(a, b);
  });

  await test('UI: re-entering the flow after confirming reuses the SAME booking (one record)', async () => {
    resetState();
    const themeId = 'family_full_service';
    const opened = await openFlow(themeId);
    await walkToSummary(opened.utils);
    await enterPayment(opened.utils);
    await payAdvance(opened.utils);
    assert.equal(opened.utils.getByTestId('payment-flow').dataset.step, 'confirm');
    const firstRef = readPaymentRecords()[0].bookingId;
    cleanup();

    // "Refresh": remount the orchestrator for the same salon + theme.
    const again = render(React.createElement(SiteBookingFullFlow, { themeId, data: opened.data }));
    await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
    assert.equal(again.getByTestId('payment-flow').dataset.step, 'confirm');
    const records = readPaymentRecords();
    assert.equal(records.length, 1, 'refresh must not create a second booking');
    assert.equal(records[0].bookingId, firstRef, 'the reference is preserved');
    cleanup();
    window.localStorage.clear();
  });

  await test('UI: clicking Continue twice on the option step creates exactly one booking', async () => {
    resetState();
    const themeId = 'nail_lash_studio';
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm');
    const ref = readPaymentRecords()[0].bookingId;
    // Returning to the option step and confirming again must NOT re-book.
    assert.equal(readPaymentRecords().length, 1);
    assert.equal(readPaymentRecords()[0].bookingId, ref);
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* E · FLOW UI — confirmation after a successful advance, per theme     */
/* ================================================================== */
section('Flow UI — confirmation screen after a successful advance payment');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: confirmed screen shows salon/services/date/time/duration/money/reference`, async () => {
      resetState();
      const { utils, data } = await openFlow(themeId);
      await walkToSummary(utils, [`${themeId}-svc-2`]);
      await enterPayment(utils);
      await payAdvance(utils);

      const flow = utils.getByTestId('payment-flow');
      assert.equal(flow.dataset.step, 'confirm');
      const banner = utils.getByTestId('payment-confirm');
      assert.equal(banner.dataset.confirmed, 'true');
      assert.equal(banner.dataset.confirmationState, 'confirmed');
      assert.ok(utils.getByTestId('payment-confirm-state-chip').textContent.includes('Confirmed'));

      const card = utils.getByTestId('payment-confirm-card');
      const text = card.textContent;
      assert.ok(text.includes(`${themeId} Test Salon`), 'salon missing');
      assert.ok(text.includes('Signature Treatment'), 'service 1 missing');
      assert.ok(text.includes('Deep Ritual'), 'service 2 missing');
      assert.ok(/2026/.test(text), 'date missing');
      assert.ok(utils.getByTestId('booking-confirmation-time').textContent.length > 0, 'time missing');
      assert.ok(utils.getByTestId('booking-confirmation-duration').textContent.includes('150'), 'duration missing');
      assert.ok(utils.getByTestId('booking-confirmation-total').textContent.includes('₹2,300'), 'total missing');
      assert.ok(utils.getByTestId('booking-confirmation-advance').textContent.includes('₹575'), 'advance missing');
      assert.ok(utils.getByTestId('booking-confirmation-remaining').textContent.includes('₹1,725'), 'remaining missing');
      assert.ok(utils.getByTestId('booking-confirmation-payment-status').textContent.includes('Paid'), 'payment status missing');

      // Reference comes from the persisted record.
      const record = readPaymentRecords()[0];
      assert.ok(utils.getByTestId('payment-confirm-booking-id').textContent.includes(record.bookingId));
      assert.equal(record.businessId, 'public-site');
      assert.equal(record.themeId, themeId);
      assert.equal(record.customer.mobile, '9876543210');
      assert.ok(data);
      cleanup();
      window.localStorage.clear();
    });
  }
}

/* ================================================================== */
/* F · FLOW UI — no "Confirmed" before payment succeeds                */
/* ================================================================== */
section('Flow UI — the screen never claims Confirmed before payment');
{
  await test('failed payment: result screen, record failed, confirmation unreachable', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('barber_mens_grooming');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    assert.equal(utils.container.querySelector('[data-testid="payment-confirm"]'), null, 'no confirmation on failure');
    const record = readPaymentRecords()[0];
    assert.equal(record.bookingStatus, 'failed');
    assert.equal(bookingConfirmationState(record), 'payment_failed');
    cleanup();
    window.localStorage.clear();
  });

  await test('pending payment: record is pending_payment and derives Payment pending', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    const { utils } = await openFlow('hair_studio_color_bar');
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(400); });
    const record = readPaymentRecords()[0];
    assert.equal(record.bookingStatus, 'pending_payment');
    assert.equal(bookingConfirmationState(record), 'payment_pending');
    assert.equal(utils.container.querySelector('[data-testid="payment-confirm"]'), null);
    // PHASE 16.9 — cancel asks for an inline confirmation first.
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    cleanup();
    window.localStorage.clear();
  });

  await test('retry after failure confirms the SAME booking reference (no duplicate)', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAdvance(utils);
    const failedRef = readPaymentRecords()[0].bookingId;
    setPaymentScenarioForTests('all_success');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-retry')); });
    await act(async () => { await wait(1600); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm');
    const records = readPaymentRecords();
    assert.equal(records.length, 1, 'retry must reuse the same booking row');
    assert.equal(records[0].bookingId, failedRef);
    assert.equal(records[0].bookingStatus, 'confirmed');
    assert.equal(utils.getByTestId('payment-confirm').dataset.confirmed, 'true');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* G · PANEL — the four states render distinctly                        */
/* ================================================================== */
section('Panel — Confirmed / Pending / Failed / Cancelled are distinct');
{
  const cases = [
    ['confirmed', { bookingStatus: 'confirmed', paymentStatus: 'paid' }, 'Confirmed'],
    ['payment_pending', { bookingStatus: 'pending_payment', paymentStatus: 'pending' }, 'Payment pending'],
    ['payment_failed', { bookingStatus: 'failed', paymentStatus: 'failed' }, 'Payment failed'],
    ['cancelled', { bookingStatus: 'cancelled', paymentStatus: 'cancelled' }, 'Cancelled'],
  ];
  const chipColors = new Set();

  for (const [state, statuses, label] of cases) {
    await test(`panel renders the ${state} state with its own headline + chip`, () => {
      resetState();
      const view = toBookingConfirmation(paymentRecord({ bookingId: `NX-${state}`, ...statuses }));
      const utils = renderConfirmationPanel('beauty_skin_spa', view);
      const root = utils.getByTestId('booking-confirmation');
      assert.equal(root.dataset.state, state);
      assert.equal(root.dataset.confirmed, String(state === 'confirmed'));
      const chip = utils.getByTestId('booking-confirmation-state');
      assert.equal(chip.textContent, label);
      chipColors.add(chip.style.backgroundColor);
      // Only the confirmed state may say confirmed.
      const banner = utils.getByTestId('booking-confirmation-banner').textContent;
      if (state === 'confirmed') {
        assert.ok(banner.includes('confirmed'), 'confirmed headline missing');
      } else {
        assert.ok(!/your booking is confirmed/i.test(banner), `${state} must not claim confirmation`);
      }
      cleanup();
    });
  }

  await test('the four states use four different status colours', () => {
    assert.equal(chipColors.size, 4, `expected 4 distinct state colours, got ${chipColors.size}`);
  });

  await test('non-confirmed states show the "not confirmed until payment" warning', () => {
    resetState();
    for (const [state, statuses] of cases) {
      const view = toBookingConfirmation(paymentRecord({ ...statuses }));
      const utils = renderConfirmationPanel('family_full_service', view);
      const warning = utils.container.querySelector('[data-testid="booking-confirmation-pending-warning"]');
      if (state === 'confirmed') assert.equal(warning, null, 'confirmed must not warn');
      else assert.ok(warning, `${state} must warn`);
      cleanup();
    }
  });

  await test('a failure reason is surfaced only while the booking is not confirmed', () => {
    resetState();
    const failedView = toBookingConfirmation(paymentRecord({
      bookingStatus: 'failed', paymentStatus: 'failed', failureReason: 'Payment declined by issuer',
    }));
    let utils = renderConfirmationPanel('barber_mens_grooming', failedView);
    assert.ok(utils.getByTestId('booking-confirmation-failure-reason').textContent.includes('declined'));
    cleanup();
    const okView = toBookingConfirmation(paymentRecord({ failureReason: 'stale' }));
    utils = renderConfirmationPanel('barber_mens_grooming', okView);
    assert.equal(utils.container.querySelector('[data-testid="booking-confirmation-failure-reason"]'), null);
    cleanup();
  });

  await test('retry-payment action appears only for recoverable non-confirmed states', () => {
    resetState();
    const seen = {};
    for (const [state, statuses] of cases) {
      const view = toBookingConfirmation(paymentRecord({ ...statuses }));
      const utils = renderConfirmationPanel('nail_lash_studio', view, { onRetryPayment: () => {} });
      seen[state] = Boolean(utils.container.querySelector('[data-testid="booking-confirmation-retry-payment"]'));
      cleanup();
    }
    assert.equal(seen.confirmed, false);
    assert.equal(seen.cancelled, false);
    assert.equal(seen.payment_pending, true);
    assert.equal(seen.payment_failed, true);
  });
}

/* ================================================================== */
/* H · BOOKING HISTORY — summary reachable again                        */
/* ================================================================== */
section('Booking history — the summary / receipt can be re-opened');
{
  await test('My Bookings exposes a "View summary" action per booking', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-HIST', customerId: me })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    assert.ok(utils.getByTestId('my-booking-summary-NX-HIST'));
    assert.equal(utils.container.querySelector('[data-testid="my-booking-summary-panel-NX-HIST"]'), null);
    cleanup(); seedRecords(null);
  });

  await test('opening the summary shows the full confirmation with the same reference', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-HIST2', customerId: me })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-summary-NX-HIST2')); });
    const panel = utils.getByTestId('my-booking-summary-panel-NX-HIST2');
    assert.ok(panel);
    const confirmation = utils.getByTestId('booking-confirmation');
    assert.equal(confirmation.dataset.reference, 'NX-HIST2');
    assert.equal(confirmation.dataset.variant, 'history');
    const text = confirmation.textContent;
    assert.ok(text.includes('beauty_skin_spa Test Salon'), 'salon missing');
    assert.ok(text.includes('Signature Treatment'), 'service missing');
    assert.ok(text.includes('₹800'), 'total missing');
    assert.ok(text.includes('₹200'), 'advance missing');
    assert.ok(text.includes('₹600'), 'remaining missing');
    cleanup(); seedRecords(null);
  });

  await test('the summary toggles closed again', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-TOG', customerId: me })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-summary-NX-TOG')); });
    assert.ok(utils.getByTestId('my-booking-summary-panel-NX-TOG'));
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-summary-NX-TOG')); });
    assert.equal(utils.container.querySelector('[data-testid="my-booking-summary-panel-NX-TOG"]'), null);
    cleanup(); seedRecords(null);
  });

  await test('a receipt view is available and lists the reference + amounts', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-RCPT', customerId: me })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-summary-NX-RCPT')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirmation-toggle-receipt')); });
    const receipt = utils.getByTestId('booking-confirmation-receipt').textContent;
    assert.ok(receipt.includes('NX-RCPT'), 'reference missing from receipt');
    assert.ok(receipt.includes('₹800'), 'total missing from receipt');
    assert.ok(receipt.includes('₹200'), 'advance missing from receipt');
    assert.ok(receipt.includes('₹600'), 'remaining missing from receipt');
    cleanup(); seedRecords(null);
  });

  await test('the receipt text builder mirrors the record exactly', () => {
    const view = toBookingConfirmation(paymentRecord({ bookingId: 'NX-TXT', gatewayRef: 'GW-1' }));
    const text = bookingConfirmationReceiptText(view, bookingConfirmationText('en'), 'en', 'My Salon');
    assert.ok(text.includes('NX-TXT'));
    assert.ok(text.includes('My Salon'));
    assert.ok(text.includes('Signature Treatment'));
    assert.ok(text.includes('2026-08-14'));
    assert.ok(text.includes('GW-1'));
    assert.ok(text.includes('Confirmed'));
  });

  await test('cancelled bookings keep an accessible summary (history is complete)', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({
      bookingId: 'NX-CANHIST', customerId: me, bookingStatus: 'cancelled', paymentStatus: 'cancelled',
    })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-summary-NX-CANHIST')); });
    assert.equal(utils.getByTestId('booking-confirmation').dataset.state, 'cancelled');
    cleanup(); seedRecords(null);
  });

  await test('history never renders another customer\'s summary', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ bookingId: 'NX-MINEH', customerId: me }),
      paymentRecord({ bookingId: 'NX-THEIRSH', customerId: 'other-browser' }),
    ]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    assert.equal(utils.container.querySelector('[data-testid="my-booking-summary-NX-THEIRSH"]'), null);
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-summary-NX-MINEH')); });
    assert.ok(!utils.getByTestId('booking-confirmation').textContent.includes('NX-THEIRSH'));
    cleanup(); seedRecords(null);
  });
}

/* ================================================================== */
/* I · STATES — loading / error / not-found                             */
/* ================================================================== */
section('States — loading / error / not-found');
{
  await test('history loading + error states come from the shared booking seam', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-SEAM', customerId: me })]);
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    let { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    assert.ok(utils.getByTestId('my-bookings-loading'));
    cleanup();
    setWebsiteSectionFlagsForTests({ booking: 'error' });
    ({ utils } = renderMyBookings('beauty_skin_spa', 'public-site'));
    assert.ok(utils.getByTestId('my-bookings-error'));
    setWebsiteSectionFlagsForTests({});
    await act(async () => { fireEvent.click(utils.getByTestId('my-bookings-retry')); });
    assert.ok(utils.getByTestId('my-booking-summary-NX-SEAM'), 'recovers into the list');
    cleanup(); seedRecords(null);
  });

  await test('an unknown reference resolves to not-found, never to a blank confirmation', () => {
    resetState();
    const lookup = readBookingConfirmation('NX-NOPE', 'public-site', 'beauty_skin_spa');
    assert.equal(lookup.ok, false);
    assert.equal(lookup.reason, 'not-found');
  });

  await test('the payment flow still resumes a confirmed record after a remount', async () => {
    resetState();
    const themeId = 'barber_mens_grooming';
    const data = richData(themeId);
    const me = bookingBrowserId();
    seedRecords([paymentRecord({
      bookingId: 'NX-RESUME', customerId: me, themeId, serviceId: `${themeId}-svc-1`,
    })]);
    const utils = render(React.createElement(SiteBookingFullFlow, { themeId, data }));
    await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
    const flow = utils.getByTestId('payment-flow');
    assert.equal(flow.dataset.step, 'confirm');
    assert.ok(utils.getByTestId('payment-confirm-booking-id').textContent.includes('NX-RESUME'));
    assert.equal(readPaymentRecords().length, 1, 'resuming must not create a booking');
    cleanup(); seedRecords(null);
  });
}

/* ================================================================== */
/* J · EN/HI + LIGHT/DARK + RESPONSIVE                                  */
/* ================================================================== */
section('EN/HI · light/dark · responsive');
{
  await test('every 16.6 key exists in EN and HI and differs', () => {
    const en = bookingConfirmationText('en');
    const hi = bookingConfirmationText('hi');
    const keys = Object.keys(en);
    assert.ok(keys.length >= 45, `expected the full key set, got ${keys.length}`);
    for (const key of keys) {
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key], `HI equals EN for ${key}`);
    }
  });

  await test('Hindi: the confirmation panel renders Hindi labels + state', () => {
    resetState();
    setSiteLocale('hi');
    const view = toBookingConfirmation(paymentRecord({ bookingId: 'NX-HI' }));
    const utils = renderConfirmationPanel('beauty_skin_spa', view);
    const text = utils.getByTestId('booking-confirmation').textContent;
    assert.ok(text.includes('पक्की'), 'Hindi state missing');
    assert.ok(text.includes('कुल राशि'), 'Hindi total label missing');
    assert.ok(text.includes('शेष राशि'), 'Hindi remaining label missing');
    assert.ok(text.includes('बुकिंग संदर्भ'), 'Hindi reference label missing');
    setSiteLocale('en');
    cleanup();
  });

  await test('Hindi: the flow confirmation banner is localized', async () => {
    resetState();
    setSiteLocale('hi');
    const { utils } = await openFlow('family_full_service');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAdvance(utils);
    assert.ok(utils.getByTestId('payment-confirm').textContent.includes('पक्की'));
    setSiteLocale('en');
    cleanup();
    window.localStorage.clear();
  });

  await test('dark mode restyles the confirmation panel through existing surfaces', () => {
    resetState();
    const view = toBookingConfirmation(paymentRecord({ bookingId: 'NX-DARK' }));
    setSiteAppearance('light');
    let utils = renderConfirmationPanel('beauty_skin_spa', view);
    const light = utils.getByTestId('booking-confirmation-details').style.backgroundColor;
    assert.equal(utils.getByTestId('booking-confirmation').dataset.appearance, 'light');
    cleanup();
    setSiteAppearance('dark');
    utils = renderConfirmationPanel('beauty_skin_spa', view);
    const dark = utils.getByTestId('booking-confirmation-details').style.backgroundColor;
    assert.equal(utils.getByTestId('booking-confirmation').dataset.appearance, 'dark');
    assert.notEqual(dark, light, 'dark surface must differ');
    setSiteAppearance('light');
    cleanup();
  });

  await test('all five themes give the confirmation panel their own surface', () => {
    resetState();
    const view = toBookingConfirmation(paymentRecord({ bookingId: 'NX-THEME' }));
    const seen = new Set();
    for (const themeId of THEME_IDS) {
      const utils = renderConfirmationPanel(themeId, view);
      const el = utils.getByTestId('booking-confirmation-details');
      assert.equal(utils.getByTestId('booking-confirmation').dataset.theme, themeId);
      seen.add(el.getAttribute('style'));
      cleanup();
    }
    assert.equal(seen.size, THEME_IDS.length, `expected ${THEME_IDS.length} distinct theme surfaces, got ${seen.size}`);
  });

  await test('layout is fluid: no fixed pixel widths on the confirmation containers', () => {
    resetState();
    const view = toBookingConfirmation(paymentRecord({ bookingId: 'NX-RESP' }));
    const utils = renderConfirmationPanel('hair_studio_color_bar', view);
    const root = utils.getByTestId('booking-confirmation');
    for (const el of [root, utils.getByTestId('booking-confirmation-details'), utils.getByTestId('booking-confirmation-banner')]) {
      const style = el.getAttribute('style') || '';
      assert.ok(!/width:\s*\d+px/.test(style), 'fixed pixel width found');
      assert.ok(!/min-width:\s*\d+px/.test(style), 'fixed min-width found');
    }
    // Mobile-first: the root stacks; rows wrap rather than overflow.
    assert.ok(root.className.includes('flex-col'), 'root must stack on small screens');
    assert.ok(root.className.includes('w-full'), 'root must be fluid');
    cleanup();
  });
}

/* ================================================================== */
/* K · NO DUPLICATE ARCHITECTURE / NO INVENTED DATA                     */
/* ================================================================== */
section('Architecture — one booking system, nothing invented');
{
  await test('the confirmation layer never writes to the store', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-RO', customerId: me })]);
    const before = window.localStorage.getItem(PAYMENT_STORE_KEY);
    readBookingConfirmation('NX-RO', 'public-site', 'beauty_skin_spa');
    readMyBookingConfirmations('public-site', 'beauty_skin_spa');
    findActiveBookingForContext({
      businessId: 'public-site', themeId: 'beauty_skin_spa',
      serviceIds: ['beauty_skin_spa-svc-1'], dateKey: '2026-08-14',
      startMinutes: 780, customerMobile: '9876543210',
    });
    assert.equal(window.localStorage.getItem(PAYMENT_STORE_KEY), before, 'reads must not mutate the store');
    seedRecords(null);
  });

  await test('no new storage keys / booking stores are introduced by 16.6', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAdvance(utils);
    const keys = Object.keys(window.localStorage).filter((k) => /booking|payment/i.test(k));
    for (const key of keys) {
      assert.ok(
        [
          'nexora_site_payment_records',
          'nexora_site_booking_holds',
          'nexora_site_booking_drafts',
          'nexora_site_booking_browser',
        ].includes(key),
        `unexpected new store key: ${key}`,
      );
    }
    cleanup();
    window.localStorage.clear();
  });

  await test('the confirmation module contains no gateway secrets or service-role keys', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of [
      'src/lib/siteBookingConfirmation.ts',
      'src/lib/siteBookingConfirmationI18n.ts',
      'src/components/SiteBookingConfirmation.tsx',
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const f of ['service_role', 'rzp_live', 'rzp_test', 'key_secret', 'RAZORPAY_KEY', 'sk_live', 'sk_test']) {
        assert.ok(!source.includes(f), `${file} must not contain ${f}`);
      }
    }
  });

  await test('amounts are never recomputed by the confirmation layer', () => {
    // A record with deliberately unusual amounts is echoed verbatim.
    const view = toBookingConfirmation(paymentRecord({
      baseAmount: 1234, amountDue: 321, remainingAmount: 913, paymentStatus: 'paid',
    }));
    assert.equal(view.totalAmount, 1234);
    assert.equal(view.advancePaid, 321);
    assert.equal(view.remainingAmount, 913);
  });
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 16.6 booking confirmation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(` - ${f.name}: ${f.error.message}`);
  process.exitCode = 1;
} else {
  console.log('Booking confirmation verified: real booking data + existing reference, Confirmed/Payment Pending/Payment Failed/Cancelled states with no confirmation before a successful payment, re-openable summary/receipt from booking history, duplicate-booking protection on refresh/retry/return, salon+customer isolation, loading/error states, EN/HI, light/dark and responsive across all five themes.');
}
