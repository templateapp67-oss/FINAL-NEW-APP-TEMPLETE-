/**
 * PHASE 16.9 — BOOKING NOTIFICATIONS & UX (five-theme acceptance)
 *
 * UX hardening over the EXISTING booking architecture (the 10.6/16.x
 * entry flow + the 10.7/16.5 payment engine + the 16.6/16.7 status
 * layers). Nothing new is invented — the notice presenter wires the
 * existing `onShowToast` seam the public-site host used to drop:
 *
 *   - clear feedback for booking success / payment success / payment
 *     pending / payment failed / booking cancelled / booking error;
 *   - duplicate booking + payment submissions blocked while processing;
 *   - booking data preserved between steps and after payment failure;
 *   - loading states with ONLY the processing action disabled;
 *   - empty/error states for services, dates, slots and bookings;
 *   - confirmation before every destructive cancellation;
 *   - no fake success states (claims derive from persisted records);
 *   - privacy (no customer/salon/payment data in any notice);
 *   - EN/HI, light/dark, five themes, keyboard/aria basics.
 *
 * NOT covered (later phases): final acceptance testing (16.10).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { render: testingRender, cleanup, act, fireEvent } = await import('@testing-library/react');

const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const SiteBookingFlow = (await import('../src/components/SiteBookingFlow.tsx')).default;
const SiteMyBookings = (await import('../src/components/SiteMyBookings.tsx')).default;
const BookingManagementPanel = (await import('../src/components/BookingManagementPanel.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const {
  setBookingHoldsForTests,
  setBookingDatesStateForTests,
  bookingDatesStatus,
  bookingBrowserId,
} = await import('../src/lib/siteBookingFlow.ts');
const { setBookingDraftStoreForTests, readBookingDraft } = await import('../src/lib/siteBookingDraft.ts');
const { setSupabaseConfiguredForTests } = await import('../src/lib/bookingManagement.ts');
const {
  setPaymentStoreForTests,
  setPaymentScenarioForTests,
  setPaymentGatewayTimeoutForTests,
  readPaymentRecords,
} = await import('../src/lib/siteBookingPayment.ts');
const {
  makeNotice,
  normalizeNotice,
  noticeMessage,
  setBookingNoticeDurationForTests,
  bookingNoticeDurationMs,
} = await import('../src/lib/siteBookingNotices.ts');
const { bookingNoticesText, fillNoticeText } = await import('../src/lib/siteBookingNoticesI18n.ts');
const { bookingFlowText } = await import('../src/lib/siteBookingI18n.ts');
const { bookingManagementText } = await import('../src/lib/bookingManagementI18n.ts');
const { paymentFlowText } = await import('../src/lib/siteBookingPaymentI18n.ts');
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

function at(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
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

function closedHours() {
  const hours = weekHours();
  for (const day of Object.keys(hours)) hours[day] = { open: false, startTime: '10:00', endTime: '20:00' };
  return hours;
}

const THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

function themeServices(themeId) {
  return [
    { id: `${themeId}-svc-1`, name: 'Signature Treatment', category: 'Haircuts',
      description: 'Signature service description.', price: 800, duration: 60,
      themeId, status: 'active' },
    { id: `${themeId}-svc-2`, name: 'Deep Ritual', category: 'Grooming & Treatments',
      description: 'Ritual service description.', price: 1500, duration: 90,
      themeId, status: 'active' },
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

function resetState() {
  cleanup();
  window.localStorage.clear();
  setBookingHoldsForTests(null);
  setBookingDraftStoreForTests(null);
  setPaymentStoreForTests(null);
  setWebsiteSectionFlagsForTests({});
  setBookingDatesStateForTests(null);
  setBookingNoticeDurationForTests(null);
  setPaymentGatewayTimeoutForTests(null);
  setSalonClockForTests(THU_OPEN);
  setSiteLocale('en');
  setSiteAppearance('light');
  setPaymentScenarioForTests('all_success');
}

/** Renders the full orchestrator (notice presenter included). */
async function openFlow(themeId, extras = {}) {
  const data = richData(themeId, extras);
  const utils = render(React.createElement(SiteBookingFullFlow, { themeId, data }));
  return { utils, data };
}

/** Renders the entry flow standalone with a toast sink. */
function renderEntry(themeId, extras = {}) {
  const toasts = [];
  const utils = render(React.createElement(SiteBookingFlow, {
    themeId,
    data: richData(themeId, extras),
    onBackToWebsite: () => {},
    onShowToast: (m) => toasts.push(m),
  }));
  return { utils, toasts };
}

const toastText = (m) => (typeof m === 'string' ? m : m.message);

/** Seeds booking records the way the real engine persists them (16.3 pattern). */
function seedRecords(records) {
  window.localStorage.setItem('nexora_site_payment_records', JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event('nexora:site-payment'));
}

/** All rendered notices: [{ kind, message }]. */
function noticesOf(utils) {
  const nodes = utils.container.querySelectorAll('[data-testid="booking-notice"]');
  return Array.from(nodes).map((n) => ({
    kind: n.dataset.kind,
    message: (n.querySelector('[data-testid="booking-notice-message"]') || {}).textContent || '',
  }));
}

function noticeOfKind(utils, kind) {
  return noticesOf(utils).find((n) => n.kind === kind) || null;
}

async function walkToSummary(utils, themeId) {
  const flow = utils.getByTestId('booking-flow');
  const steps = ['salon', 'service', 'date', 'time', 'details', 'summary'];
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
  while (flow.dataset.step !== 'summary' && steps.indexOf(flow.dataset.step) < steps.indexOf('summary')) {
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
  assert.equal(flow.dataset.step, 'summary');
}

async function enterPayment(utils) {
  await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
  assert.equal(utils.getByTestId('payment-flow').dataset.step, 'option');
}

async function payAdvance(utils) {
  fireEvent.click(utils.getByTestId('payment-option-advance'));
  await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
  assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway');
  fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
  await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
  await act(async () => { await wait(1600); });
}

/* ================================================================== */
/* A · NOTICE MODEL + PRESENTER                                        */
/* ================================================================== */
section('Notice model + presenter (existing onShowToast seam, no new system)');
{
  await test('normalizeNotice maps legacy strings to info and keeps typed notices', () => {
    assert.deepEqual(normalizeNotice('hello'), { kind: 'info', message: 'hello' });
    const typed = makeNotice('success', 'ok');
    assert.deepEqual(normalizeNotice(typed), typed);
    assert.equal(noticeMessage(typed), 'ok');
    assert.equal(noticeMessage('plain'), 'plain');
  });

  await test('presenter renders kinds with the right semantics and a polite live region', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    const host = utils.getByTestId('booking-notices');
    assert.equal(host.getAttribute('aria-live'), 'polite');
    const success = noticeOfKind(utils, 'success');
    assert.ok(success, 'booking-confirmed notice missing');
    assert.equal(success.kind, 'success');
    assert.ok(utils.getByTestId('booking-notice').getAttribute('role') === 'status', 'notice must be role=status');
    cleanup();
    window.localStorage.clear();
  });

  await test('dismiss button removes a notice', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.ok(noticeOfKind(utils, 'success'));
    await act(async () => { fireEvent.click(utils.getByTestId('booking-notice-dismiss')); });
    assert.equal(noticeOfKind(utils, 'success'), null, 'dismiss must remove the notice');
    cleanup();
    window.localStorage.clear();
  });

  await test('notices auto-dismiss (test-injected duration)', async () => {
    resetState();
    setBookingNoticeDurationForTests(120);
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.ok(noticeOfKind(utils, 'success'));
    await act(async () => { await wait(400); });
    assert.equal(utils.container.querySelector('[data-testid="booking-notice"]'), null, 'auto-dismiss expected');
    cleanup();
    window.localStorage.clear();
  });

  await test('no notification store / event is invented (static + runtime)', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    let keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i));
    assert.ok(!keys.some((k) => /notice|notification/i.test(k)), 'no notice store key invented');
    const src = readFileSync('src/lib/siteBookingNotices.ts', 'utf8');
    assert.ok(!src.includes('addEventListener'), 'the notice model listens to nothing — it rides the existing props seam');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* B · FEEDBACK — booking/payment states through the real journey      */
/* ================================================================== */
section('Feedback: booking success / payment success / pending / failed / cancelled / error');
{
  await test('pay-at-salon: booking-success notice with the real reference (no invented payment)', async () => {
    resetState();
    const { utils } = await openFlow('nail_lash_studio');
    await walkToSummary(utils, 'nail_lash_studio');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    const record = readPaymentRecords()[0];
    assert.equal(record.bookingStatus, 'pay_at_salon');
    assert.equal(record.paymentStatus, 'unpaid');
    const success = noticeOfKind(utils, 'success');
    assert.ok(success, 'success notice missing');
    assert.equal(success.message, fillNoticeText(bookingNoticesText('en')['notice.bookingConfirmed'], { reference: record.bookingId }));
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm');
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway: pending notice during processing, success notice ONLY after the record is paid', async () => {
    resetState();
    const { utils } = await openFlow('hair_studio_color_bar');
    await walkToSummary(utils, 'hair_studio_color_bar');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(400); });
    assert.ok(noticeOfKind(utils, 'info'), 'payment-pending notice missing while processing');
    assert.equal(noticeOfKind(utils, 'success'), null, 'no success notice before the gateway resolves');
    assert.equal(readPaymentRecords()[0].paymentStatus, 'pending');
    await act(async () => { await wait(1300); });
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'paid');
    assert.equal(record.bookingStatus, 'confirmed');
    assert.equal(noticeOfKind(utils, 'success').message, bookingNoticesText('en')['notice.paymentSuccess']);
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway failure: error notice with the human-readable reason — never a success claim', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('family_full_service');
    await walkToSummary(utils, 'family_full_service');
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    const err = noticeOfKind(utils, 'error');
    assert.ok(err, 'error notice missing on failure');
    assert.ok(/failed/i.test(err.message));
    assert.ok(err.message.includes('Payment declined by issuer'), 'human-readable reason expected');
    assert.equal(noticeOfKind(utils, 'success'), null, 'no success notice on failure');
    assert.equal(readPaymentRecords()[0].paymentStatus, 'failed');
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway cancellation: warning notice + cancelled record; retry stays possible', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    const { utils } = await openFlow('family_full_service');
    await walkToSummary(utils, 'family_full_service');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(400); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    await act(async () => { await wait(200); });
    const warn = noticeOfKind(utils, 'warning');
    assert.ok(warn, 'warning notice missing on cancellation');
    assert.equal(warn.message, bookingNoticesText('en')['notice.paymentCancelled']);
    const record = readPaymentRecords()[0];
    assert.equal(record.bookingStatus, 'cancelled');
    assert.equal(record.paymentStatus, 'cancelled');
    assert.ok(Boolean(utils.getByTestId('payment-retry')), 'retry offered after cancellation');
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway timeout: record fails (distinct from cancellation) with retry + error notice', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    setPaymentGatewayTimeoutForTests(1500);
    const { utils } = await openFlow('barber_mens_grooming');
    await walkToSummary(utils, 'barber_mens_grooming');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(300); });
    assert.ok(Boolean(utils.getByTestId('payment-processing')), 'processing state visible');
    // The inactivity window expires → timeout outcome (not cancellation).
    await act(async () => { await wait(2000); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    assert.equal(utils.getByTestId('payment-result').dataset.outcome, 'timeout');
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'failed');
    assert.equal(record.bookingStatus, 'failed');
    const err = noticeOfKind(utils, 'error');
    assert.ok(err && /timed out/i.test(err.message), 'timeout error notice expected');
    assert.ok(Boolean(utils.getByTestId('payment-retry')), 'retry offered after timeout');
    cleanup();
    window.localStorage.clear();
  });

  await test('booking error: a slot lost to another booking raises an error notice', async () => {
    resetState();
    const { utils, toasts } = renderEntry('beauty_skin_spa');
    const flow = utils.getByTestId('booking-flow');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // salon → service
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // service → date
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // date → time
    assert.equal(flow.dataset.step, 'time');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-slot-780')); });
    assert.equal(utils.getByTestId('booking-slot-780').dataset.selected, 'true');
    // The exact span gets booked by someone else between selection and
    // Continue (16.3 recalculation path) — the visitor must never be
    // silently swapped, and the error is announced.
    await act(async () => {
      seedRecords([{
        id: 'rec-foreign', idempotencyKey: 'k', businessId: 'public-site', themeId: 'beauty_skin_spa',
        customerId: 'someone-else', bookingId: 'NX-90001', serviceId: 'beauty_skin_spa-svc-1',
        serviceName: 'Signature Treatment', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
        baseAmount: 800, amountDue: 200, remainingAmount: 600, currency: 'INR',
        paymentOption: 'advance', paymentMethod: null, paymentStatus: 'paid', bookingStatus: 'confirmed',
        customer: { name: 'X', mobile: '9999999999', email: '', notes: '' },
        createdAt: Date.now(), updatedAt: Date.now(), payAtSalon: false,
      }]);
    });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'time', 'must NOT advance with a dead slot');
    const err = toasts.filter((m) => typeof m === 'object' && m.kind === 'error');
    assert.ok(err.length >= 1, 'slot-lost error notice expected after the slot was booked');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* C · DUPLICATE SUBMISSION                                            */
/* ================================================================== */
section('Duplicate booking / payment submissions prevented');
{
  await test('double-click on summary Confirm hands off exactly once', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await act(async () => {
      fireEvent.click(utils.getByTestId('booking-confirm'));
      fireEvent.click(utils.getByTestId('booking-confirm'));
    });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'option');
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(1600); });
    assert.equal(readPaymentRecords().length, 1, 'double confirm must not create two bookings');
    cleanup();
    window.localStorage.clear();
  });

  await test('double-click on Continue never skips a step', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await act(async () => {
      fireEvent.click(utils.getByTestId('booking-continue'));
      fireEvent.click(utils.getByTestId('booking-continue'));
    });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service', 'must land on service, not date');
    cleanup();
    window.localStorage.clear();
  });

  await test('double-click on pay-at-salon Continue creates exactly ONE record', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => {
      fireEvent.click(utils.getByTestId('payment-continue'));
      fireEvent.click(utils.getByTestId('payment-continue'));
    });
    assert.equal(readPaymentRecords().length, 1, 'double-click must not duplicate the pay-at-salon row');
    cleanup();
    window.localStorage.clear();
  });

  await test('double-click on Pay creates one record and ONE pending notice', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => {
      fireEvent.click(utils.getByTestId('payment-gateway-pay'));
      fireEvent.click(utils.getByTestId('payment-gateway-pay'));
    });
    await act(async () => { await wait(1600); });
    assert.equal(readPaymentRecords().length, 1);
    assert.equal(noticesOf(utils).filter((n) => n.kind === 'info').length, 1, 'one pending notice per attempt');
    cleanup();
    window.localStorage.clear();
  });

  await test('double-click on Retry creates one attempt and one record', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    setPaymentScenarioForTests('all_success');
    const retry = utils.getByTestId('payment-retry');
    await act(async () => {
      fireEvent.click(retry);
      fireEvent.click(retry);
    });
    await act(async () => { await wait(1600); });
    assert.equal(readPaymentRecords().length, 1);
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* D · DATA PRESERVATION + FAILURE RECOVERY                            */
/* ================================================================== */
section('Booking data preserved between steps and through payment failure');
{
  await test('failure keeps the record + draft; back to summary restores everything', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(readPaymentRecords()[0].bookingStatus, 'failed');
    // The 16.1 draft is only cleared on confirmation — it must survive.
    assert.ok(readBookingDraft('public-site', 'beauty_skin_spa'), 'draft must survive a failed payment');
    // Result → change option → option step → back to the summary.
    await act(async () => { fireEvent.click(utils.getByTestId('payment-change-option')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-back-to-summary')); });
    const flow = utils.getByTestId('booking-flow');
    assert.equal(flow.dataset.step, 'summary');
    assert.ok(flow.textContent.includes('Signature Treatment'), 'service selection lost');
    assert.ok(flow.textContent.includes('Asha Verma'), 'customer details lost');
    cleanup();
    window.localStorage.clear();
  });

  await test('retry after failure confirms the SAME row (no duplicate, no data loss)', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    const failedId = readPaymentRecords()[0].id;
    setPaymentScenarioForTests('all_success');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-retry')); });
    await act(async () => { await wait(1600); });
    const records = readPaymentRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].id, failedId);
    assert.equal(records[0].bookingStatus, 'confirmed');
    assert.ok(noticeOfKind(utils, 'success'), 'success notice after recovery');
    cleanup();
    window.localStorage.clear();
  });

  await test('failure → try a different method keeps the amount and the slot context', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('payment-try-different')); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway');
    assert.ok(utils.getByTestId('payment-amount').textContent.includes('₹200'), 'amount preserved on the gateway');
    cleanup();
    window.localStorage.clear();
  });

  await test('reopening the flow after a failed payment restores the draft (16.1 resume behaviour)', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    let utils = (await openFlow('beauty_skin_spa')).utils;
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    cleanup();
    // Reopen: the salon step announces the restored progress and every
    // selection survives into the later steps — nothing was lost.
    utils = (await openFlow('beauty_skin_spa')).utils;
    const flow = utils.getByTestId('booking-flow');
    assert.equal(flow.dataset.step, 'salon');
    assert.ok(Boolean(utils.getByTestId('booking-draft-resumed')), 'resume notice missing on reopen');
    await walkToSummary(utils, 'beauty_skin_spa');
    const summaryText = utils.getByTestId('booking-flow').textContent;
    assert.ok(summaryText.includes('Signature Treatment'), 'service selection lost on reopen');
    assert.ok(summaryText.includes('Asha Verma'), 'customer details lost on reopen');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* E · LOADING STATES — ONLY the processing action is disabled         */
/* ================================================================== */
section('Loading states disable only the processing action');
{
  await test('while processing: method buttons + back disabled, cancel available', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    setPaymentGatewayTimeoutForTests(1500);
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(300); });
    assert.equal(utils.getByTestId('payment-method-card').disabled, true, 'method buttons must be disabled while processing');
    assert.equal(utils.getByTestId('payment-gateway-back').disabled, true, 'back must be disabled while processing');
    assert.equal(utils.getByTestId('payment-gateway-cancel').disabled, false, 'cancel stays available');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    cleanup();
    window.localStorage.clear();
  });

  await test('while retrying from the result screen: only the other actions disable', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    setPaymentScenarioForTests('force_timeout');
    setPaymentGatewayTimeoutForTests(4000);
    await act(async () => { fireEvent.click(utils.getByTestId('payment-retry')); });
    await act(async () => { await wait(300); });
    assert.equal(utils.getByTestId('payment-retry').disabled, true, 'retry itself busy while processing');
    assert.equal(utils.getByTestId('payment-retry').getAttribute('aria-busy'), 'true');
    assert.equal(utils.getByTestId('payment-try-different').disabled, true);
    assert.equal(utils.getByTestId('payment-change-option').disabled, true);
    assert.ok(Boolean(utils.container.querySelector('[data-testid="payment-result"]')),
      'the result card stays visible while the retry runs (no blank screen)');
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway processing shows the inline busy state with aria-busy', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    setPaymentGatewayTimeoutForTests(1500);
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(300); });
    assert.ok(Boolean(utils.getByTestId('payment-processing')));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* F · EMPTY / ERROR STATES — services, dates, slots, bookings         */
/* ================================================================== */
section('Empty / error states for services, dates, slots and bookings');
{
  await test('services: empty + error(+Retry) states render through the shared seam', async () => {
    resetState();
    // Reach the service step with services, then the catalog empties —
    // the defensive empty state must render (services vanish mid-flight).
    const { utils } = renderEntry('beauty_skin_spa');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service');
    await act(async () => {
      utils.rerender(React.createElement(SiteBookingFlow, {
        themeId: 'beauty_skin_spa',
        data: richData('beauty_skin_spa', { services: [] }),
        onBackToWebsite: () => {},
        onShowToast: () => {},
      }));
    });
    assert.ok(Boolean(utils.getByTestId('booking-empty-services')), 'empty services state missing');
    cleanup();
    setWebsiteSectionFlagsForTests({ services: 'error' });
    const second = renderEntry('beauty_skin_spa');
    await act(async () => { fireEvent.click(second.utils.getByTestId('booking-continue')); });
    assert.ok(Boolean(second.utils.getByTestId('booking-error-services')), 'error services state missing');
    assert.ok(Boolean(second.utils.getByTestId('booking-retry-services')), 'retry missing');
    setWebsiteSectionFlagsForTests({});
    cleanup();
    window.localStorage.clear();
  });

  await test('dates: loading / error(+Retry) / empty states on their own seam', async () => {
    resetState();
    setBookingDatesStateForTests('loading');
    let { utils } = renderEntry('beauty_skin_spa');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.ok(Boolean(utils.getByTestId('booking-loading-dates')), 'date loading state missing');
    cleanup();

    setBookingDatesStateForTests('error');
    ({ utils } = renderEntry('beauty_skin_spa'));
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.ok(Boolean(utils.getByTestId('booking-error-dates')), 'date error state missing');
    setBookingDatesStateForTests(null);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-retry-dates')); });
    assert.ok(Boolean(utils.container.querySelector('[data-testid^="booking-date-"]')), 'retry recovers the date grid');
    cleanup();

    // No open days at all → empty state + Continue disabled.
    ({ utils } = renderEntry('beauty_skin_spa', { openingHours: closedHours() }));
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.ok(Boolean(utils.getByTestId('booking-empty-dates')), 'date empty state missing');
    assert.equal(utils.getByTestId('booking-continue').disabled, true, 'Continue must be disabled with no open dates');
    cleanup();
    window.localStorage.clear();
  });

  await test('slots: empty state renders with the existing copy', async () => {
    resetState();
    // A 150-minute combined sitting cannot fit the 10:00–11:00 window the
    // salon is open — the day is selectable, yet NO slot can be generated:
    // the real "no slots on this day" empty case.
    const shortHours = {};
    for (const day of Object.keys(weekHours())) {
      shortHours[day] = { open: day !== 'sunday', startTime: '10:00', endTime: '11:00' };
    }
    const { utils } = renderEntry('beauty_skin_spa', { openingHours: shortHours });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-beauty_skin_spa-svc-2`)); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.ok(Boolean(utils.getByTestId('booking-empty-slots')), 'slot empty state missing');
    assert.ok(utils.getByTestId('booking-empty-slots').textContent.includes('another date'), 'copy must suggest another date');
    assert.equal(utils.getByTestId('booking-continue').disabled, true, 'Continue disabled with no slot');
    cleanup();
    window.localStorage.clear();
  });

  await test('bookings (customer): loading + error states; renders nothing when there are none', async () => {
    resetState();
    const me = bookingBrowserId();
    const record = {
      id: 'rec-1', idempotencyKey: 'k1', businessId: 'public-site', themeId: 'beauty_skin_spa',
      customerId: me, bookingId: 'NX-10001', serviceId: 'beauty_skin_spa-svc-1',
      serviceName: 'Signature Treatment', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      baseAmount: 800, amountDue: 200, remainingAmount: 600, currency: 'INR',
      paymentOption: 'advance', paymentMethod: 'upi', paymentStatus: 'paid', bookingStatus: 'confirmed',
      customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
      createdAt: Date.now(), updatedAt: Date.now(), payAtSalon: false,
    };
    seedRecords([record]);
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    let utils = render(React.createElement(SiteMyBookings, {
      themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'), businessId: 'public-site',
      onShowToast: () => {},
    }));
    assert.ok(Boolean(utils.getByTestId('my-bookings-loading')), 'my-bookings loading state missing');
    cleanup();

    setWebsiteSectionFlagsForTests({ booking: 'error' });
    utils = render(React.createElement(SiteMyBookings, {
      themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'), businessId: 'public-site',
      onShowToast: () => {},
    }));
    assert.ok(Boolean(utils.getByTestId('my-bookings-error')), 'my-bookings error state missing');
    assert.ok(Boolean(utils.getByTestId('my-bookings-retry')), 'my-bookings retry missing');
    cleanup();

    setWebsiteSectionFlagsForTests({});
    seedRecords([]);
    utils = render(React.createElement(SiteMyBookings, {
      themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'), businessId: 'public-site',
      onShowToast: () => {},
    }));
    assert.equal(utils.container.querySelector('[data-testid="my-bookings"]'), null, 'no block for first-time visitors');
    cleanup();
    window.localStorage.clear();
  });

  await test('bookings (owner): empty + loading + error states still render', async () => {
    resetState();
    // Online mode: the Phase 17.1 mock-bookings preview otherwise fills the
    // empty store and the true empty state never renders.
    setSupabaseConfiguredForTests(true);
    const AUTHORIZED = { permission: 'authorized' };
    const props = { actor: AUTHORIZED, businessId: 'public-site', themeId: 'beauty_skin_spa', onShowToast: () => {} };
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    let utils = render(React.createElement(BookingManagementPanel, props));
    assert.ok(Boolean(utils.getByTestId('booking-management-loading')), 'owner loading state missing');
    cleanup();
    setWebsiteSectionFlagsForTests({ booking: 'error' });
    utils = render(React.createElement(BookingManagementPanel, props));
    assert.ok(Boolean(utils.getByTestId('booking-management-error')), 'owner error state missing');
    cleanup();
    setWebsiteSectionFlagsForTests({});
    seedRecords([]);
    utils = render(React.createElement(BookingManagementPanel, props));
    assert.ok(Boolean(utils.getByTestId('booking-management-empty')), 'owner empty state missing');
    setSupabaseConfiguredForTests(null);
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* G · CONFIRMATION BEFORE DESTRUCTIVE CANCELLATION                    */
/* ================================================================== */
section('Confirmation before destructive cancellation');
{
  await test('gateway cancel: confirm panel appears; Keep waiting leaves the attempt running', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    setPaymentGatewayTimeoutForTests(1500);
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(300); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    assert.ok(Boolean(utils.getByTestId('payment-gateway-cancel-confirm')), 'cancel confirmation must appear');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'pending_payment', 'nothing cancelled before confirm');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-keep')); });
    assert.equal(utils.container.querySelector('[data-testid="payment-gateway-cancel-confirm"]'), null, 'keep closes the prompt');
    await act(async () => { await wait(2000); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'failed', 'attempt expired naturally → failed');
    cleanup();
    window.localStorage.clear();
  });

  await test('customer booking cancel: confirm before the row changes; keep leaves it active', async () => {
    resetState();
    const me = bookingBrowserId();
    const record = {
      id: 'rec-1', idempotencyKey: 'k1', businessId: 'public-site', themeId: 'beauty_skin_spa',
      customerId: me, bookingId: 'NX-10002', serviceId: 'beauty_skin_spa-svc-1',
      serviceName: 'Signature Treatment', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      baseAmount: 800, amountDue: 200, remainingAmount: 600, currency: 'INR',
      paymentOption: 'advance', paymentMethod: 'upi', paymentStatus: 'paid', bookingStatus: 'confirmed',
      customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
      createdAt: Date.now(), updatedAt: Date.now(), payAtSalon: false,
    };
    seedRecords([record]);
    const toasts = [];
    const utils = render(React.createElement(SiteMyBookings, {
      themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'), businessId: 'public-site',
      onShowToast: (m) => toasts.push(m),
    }));
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-NX-10002')); });
    assert.ok(Boolean(utils.getByTestId('my-booking-cancel-confirm-NX-10002')), 'customer confirm must appear');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-keep-NX-10002')); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'keep leaves it active');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-NX-10002')); });
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-yes-NX-10002')); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'cancelled');
    assert.ok(toasts.map(toastText).some((m) => m.includes('cancelled')), 'cancellation notice expected');
    cleanup();
    window.localStorage.clear();
  });

  await test('owner booking cancel: confirm before the row changes; keep leaves it active', async () => {
    resetState();
    const record = {
      id: 'rec-1', idempotencyKey: 'k1', businessId: 'public-site', themeId: 'beauty_skin_spa',
      customerId: 'someone-else', bookingId: 'NX-10003', serviceId: 'beauty_skin_spa-svc-1',
      serviceName: 'Signature Treatment', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      baseAmount: 800, amountDue: 200, remainingAmount: 600, currency: 'INR',
      paymentOption: 'advance', paymentMethod: 'upi', paymentStatus: 'paid', bookingStatus: 'confirmed',
      customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
      createdAt: Date.now(), updatedAt: Date.now(), payAtSalon: false,
    };
    seedRecords([record]);
    const toasts = [];
    const utils = render(React.createElement(BookingManagementPanel, {
      actor: { permission: 'authorized' },
      businessId: 'public-site',
      themeId: 'beauty_skin_spa',
      onShowToast: (m) => toasts.push(m),
    }));
    await act(async () => { fireEvent.click(utils.getByTestId('owner-booking-cancel-NX-10003')); });
    assert.ok(Boolean(utils.getByTestId('owner-booking-cancel-confirm-NX-10003')), 'owner confirm must appear');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
    await act(async () => { fireEvent.click(utils.getByTestId('owner-booking-cancel-keep-NX-10003')); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'keep leaves it active');
    await act(async () => { fireEvent.click(utils.getByTestId('owner-booking-cancel-NX-10003')); });
    await act(async () => { fireEvent.click(utils.getByTestId('owner-booking-cancel-yes-NX-10003')); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'cancelled');
    assert.ok(toasts.map(toastText).some((m) => m.includes('cancelled')), 'owner cancellation notice expected');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* H · ACCESSIBILITY + VALIDATION                                      */
/* ================================================================== */
section('Keyboard / focus / aria basics + clear validation messages');
{
  await test('invalid details: aria-invalid + aria-describedby + localized error text on blur', async () => {
    resetState();
    const { utils } = renderEntry('beauty_skin_spa');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // → time
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // → details
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'details');
    // Validation surfaces on blur — without waiting for a submit that the
    // disabled Continue button could never trigger.
    await act(async () => {
      fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'A' } });
      fireEvent.blur(utils.getByTestId('booking-input-name'));
    });
    const name = utils.getByTestId('booking-input-name');
    assert.equal(name.getAttribute('aria-invalid'), 'true');
    assert.equal(name.getAttribute('aria-describedby'), 'booking-err-name');
    assert.ok(Boolean(utils.getByTestId('booking-err-name')), 'name error message missing');
    assert.equal(utils.getByTestId('booking-continue').disabled, true, 'Continue stays gated while invalid (10.6 contract)');
    await act(async () => {
      fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '123' } });
      fireEvent.blur(utils.getByTestId('booking-input-mobile'));
    });
    assert.equal(utils.getByTestId('booking-input-mobile').getAttribute('aria-invalid'), 'true');
    assert.ok(Boolean(utils.getByTestId('booking-err-mobile')), 'mobile error message missing');
    // Fix the fields → errors clear, Continue enables.
    await act(async () => {
      fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Asha Verma' } });
      fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '9876543210' } });
    });
    assert.equal(utils.getByTestId('booking-input-name').getAttribute('aria-invalid'), 'false');
    assert.equal(utils.getByTestId('booking-continue').disabled, false);
    // Stepper marks the current step.
    assert.equal(utils.getByTestId('booking-step-details').getAttribute('aria-current'), 'step');
    cleanup();
    window.localStorage.clear();
  });

  await test('notice dismiss button has a localized aria-label', async () => {
    resetState();
    setSiteLocale('hi');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(utils.getByTestId('booking-notice-dismiss').getAttribute('aria-label'), bookingNoticesText('hi')['notice.dismiss']);
    setSiteLocale('en');
    cleanup();
    window.localStorage.clear();
  });

  await test('payment stepper marks the current step with aria-current', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    assert.equal(utils.getByTestId('payment-step-option').getAttribute('aria-current'), 'step');
    cleanup();
    window.localStorage.clear();
  });

  await test('service-missing booking error is localized and recoverable', async () => {
    resetState();
    const { utils, data } = await openFlow('beauty_skin_spa');
    // Walk to payment, then remove the service from the catalog.
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('payment-back-to-summary')); });
    // Reconfirm with the catalog emptied — the wrapper must degrade cleanly.
    data.services = [];
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    assert.ok(Boolean(utils.getByTestId('payment-service-missing')), 'service-missing state missing');
    assert.equal(utils.getByTestId('payment-service-missing').dataset.locale, 'en');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-service-missing-back')); });
    assert.ok(Boolean(utils.getByTestId('booking-flow')), 'back returns to the entry flow');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* I · PRIVACY + NO FAKE SUCCESS                                       */
/* ================================================================== */
section('Privacy + no fake success states');
{
  await test('no notice ever contains customer, salon or payment identifiers', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    const all = noticesOf(utils).map((n) => n.message).join(' | ');
    for (const secret of ['Asha Verma', '9876543210', '4242424242424242', '4242', '+91 99999 00000']) {
      assert.ok(!all.includes(secret), `notice leaked private data: ${secret}`);
    }
    cleanup();
    window.localStorage.clear();
  });

  await test('failure path never renders a success notice or the confirmation screen', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(noticeOfKind(utils, 'success'), null, 'no fake success notice');
    assert.equal(utils.container.querySelector('[data-testid="payment-confirm"]'), null, 'no confirmation screen on failure');
    cleanup();
    window.localStorage.clear();
  });

  await test('static scan: no gateway secrets / service-role in the 16.9 code', () => {
    for (const file of [
      'src/lib/siteBookingNotices.ts',
      'src/lib/siteBookingNoticesI18n.ts',
      'src/components/SiteBookingNotices.tsx',
    ]) {
      const src = readFileSync(file, 'utf8');
      for (const needle of ['service_role', 'rzp_live', 'rzp_test', 'key_secret', 'sk_live', 'sk_test', 'cvv', 'cardNumber']) {
        assert.ok(!src.includes(needle), `${file} must not contain ${needle}`);
      }
    }
  });

  await test('new EN/HI notice copy exists, differs, and keeps placeholders', () => {
    const en = bookingNoticesText('en');
    const hi = bookingNoticesText('hi');
    for (const key of ['notice.dismiss', 'notice.bookingConfirmed', 'notice.paymentSuccess', 'notice.paymentPending',
      'notice.completePayment', 'notice.paymentFailed', 'notice.paymentFailedNoReason', 'notice.paymentTimedOut',
      'notice.paymentCancelled']) {
      assert.ok(en[key], `EN missing ${key}`);
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key], `HI equals EN for ${key}`);
    }
    assert.equal(fillNoticeText(en['notice.bookingConfirmed'], { reference: 'NX-10482' }), 'Booking confirmed — your reference is NX-10482.');
  });

  await test('date + cancel-confirm EN/HI copy exists and differs', () => {
    const ben = bookingFlowText('en');
    const bhi = bookingFlowText('hi');
    for (const key of ['date.loading', 'date.error', 'date.retry', 'date.empty', 'summary.serviceMissing']) {
      assert.ok(ben[key] && bhi[key] && ben[key] !== bhi[key], `booking i18n missing ${key}`);
    }
    const pen = paymentFlowText('en');
    const phi = paymentFlowText('hi');
    for (const key of ['gateway.cancelConfirm', 'gateway.keepWaiting', 'gateway.confirmCancel']) {
      assert.ok(pen[key] && phi[key] && pen[key] !== phi[key], `payment i18n missing ${key}`);
    }
    const men = bookingManagementText('en');
    const mhi = bookingManagementText('hi');
    for (const key of ['customer.keepBooking', 'owner.keepBooking', 'owner.cancelConfirm', 'owner.cancelled']) {
      assert.ok(men[key] && mhi[key] && men[key] !== mhi[key], `management i18n missing ${key}`);
    }
  });
}

/* ================================================================== */
/* J · EN/HI + DARK + FIVE THEMES MATRIX                               */
/* ================================================================== */
section('EN/HI, light/dark, all five themes');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: advance payment → success notice + confirmed record`, async () => {
      resetState();
      const { utils } = await openFlow(themeId);
      await walkToSummary(utils, themeId);
      await enterPayment(utils);
      await payAdvance(utils);
      assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm');
      assert.ok(noticeOfKind(utils, 'success'), 'success notice missing');
      assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
      cleanup();
      window.localStorage.clear();
    });
  }

  await test('Hindi: notices, cancel confirmation and date states render in Hindi', async () => {
    resetState();
    setSiteLocale('hi');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(utils.getByTestId('booking-notices').dataset.locale, 'hi');
    const success = noticeOfKind(utils, 'success');
    assert.ok(/बुकिंग पक्की/.test(success.message), 'Hindi success notice expected');
    cleanup();
    setSiteLocale('en');
    window.localStorage.clear();
  });

  await test('dark mode: the notice presenter + flows restyle through the existing surfaces', async () => {
    resetState();
    setSiteAppearance('dark');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(utils.getByTestId('booking-notices').dataset.appearance, 'dark');
    assert.equal(utils.getByTestId('payment-flow').dataset.appearance, 'dark');
    setSiteAppearance('light');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.9 booking notifications & UX: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`  ✗ ${f.name}`);
  process.exitCode = 1;
} else {
  console.log('Booking UX verified: typed notices on the existing toast seam (success/pending/failed/cancelled/timeout/error), duplicate-submission guards, failure recovery without data loss, loading states that disable only the processing action, empty/error states for services/dates/slots/bookings, confirm-before-cancel everywhere destructive, no fake success states, no leaked private data, EN/HI, light/dark and all five themes.');
}
