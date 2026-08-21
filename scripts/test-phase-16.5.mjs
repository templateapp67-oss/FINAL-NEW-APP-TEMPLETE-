/**
 * PHASE 16.5 — ADVANCE PAYMENT / DEPOSIT (five-theme acceptance)
 *
 * The 16.x booking flow is connected to the EXISTING payment architecture
 * (the Phase 10.7 engine — sandbox gateway, clearly labelled, no real
 * money, no invented tables/credentials):
 *
 *   - complete booking summary (all selected services) shown BEFORE payment;
 *   - the 25% advance derives from the REAL booking total (sum of the
 *     offer-aware line prices) via the existing `calculatePaymentAmounts`
 *     + `bookingRules.advanceDepositPercentage` — never hardcoded;
 *   - total / advance / remaining all displayed explicitly;
 *   - payment states: pending → success / failed / cancelled (+ timeout);
 *   - a booking is NOT confirmed until the required advance succeeds;
 *   - duplicate submission prevented (double-click, double-tap, retry);
 *   - salon / services / date / time / customer preserved through payment;
 *   - multi-service selections now enter the SAME payment flow (the 16.2
 *     placeholder note is replaced by the real hand-off);
 *   - loading / failure / cancellation / retry handled; EN/HI; dark mode.
 *
 * NOT covered (later phases): booking confirmation extras, notifications,
 * booking management, Call/WhatsApp protection.
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

const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { SITE_BOOKING_EVENT } = await import('../src/lib/siteBooking.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { setBookingHoldsForTests } = await import('../src/lib/siteBookingFlow.ts');
const { setBookingDraftStoreForTests, readBookingDraft } = await import('../src/lib/siteBookingDraft.ts');
const {
  setPaymentStoreForTests,
  setPaymentScenarioForTests,
  readPaymentRecords,
  calculatePaymentAmounts,
  paymentFlowText: _unused,
} = await import('../src/lib/siteBookingPayment.ts').then(async (m) => ({
  ...m,
  paymentFlowText: (await import('../src/lib/siteBookingPaymentI18n.ts')).paymentFlowText,
}));
const { paymentFlowText } = await import('../src/lib/siteBookingPaymentI18n.ts');

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

const THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

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
  setSalonClockForTests(THU_OPEN);
  setSiteLocale('en');
  setSiteAppearance('light');
  setPaymentScenarioForTests('all_success');
}

/** Renders the full orchestrator and opens the booking widget. */
async function openFlow(themeId, extras = {}) {
  const data = richData(themeId, extras);
  const utils = render(React.createElement(SiteBookingFullFlow, { themeId, data }));
  await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
  return { utils, data };
}

/** Walks the 16.x entry flow to the summary. `extraServiceIds` are toggled on. */
async function walkToSummary(utils, themeId, extraServiceIds = []) {
  const flow = utils.getByTestId('booking-flow');
  const steps = ['salon', 'service', 'date', 'time', 'details', 'summary'];
  // salon → service
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
    const btn = utils.getByTestId('booking-continue');
    assert.equal(btn.disabled, false, `Continue disabled on ${flow.dataset.step}`);
    await act(async () => { fireEvent.click(btn); });
  }
  assert.equal(flow.dataset.step, 'summary');
}

/** From the summary, enter the payment flow (option step). */
async function enterPayment(utils) {
  await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
  const paymentFlow = utils.getByTestId('payment-flow');
  assert.equal(paymentFlow.dataset.step, 'option');
  return paymentFlow;
}

/** Picks Advance, continues to the gateway, pays, waits for resolution. */
async function payAdvance(utils) {
  fireEvent.click(utils.getByTestId('payment-option-advance'));
  await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
  assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway');
  await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
  // 250ms processing delay + 1100ms simulated latency.
  await act(async () => { await wait(1600); });
}

/* ================================================================== */
/* A · ENGINE — advance derives from the real total                    */
/* ================================================================== */
section('Engine — 25% advance from the real booking total (never hardcoded)');
{
  await test('advance = 25% of the total for arbitrary totals (existing engine)', () => {
    for (const total of [400, 800, 2300, 2700, 999]) {
      const a = calculatePaymentAmounts('advance', { price: total, finalPrice: total }, { advanceDepositPercentage: 25 });
      assert.equal(a.baseAmount, total);
      assert.equal(a.amountDue, Math.round(total * 0.25));
      assert.equal(a.remainingAmount, total - Math.round(total * 0.25));
      assert.equal(a.advancePercent, 25);
      assert.equal(a.requiresGateway, true);
    }
  });

  await test('configured percentage is honoured (existing bookingRules field)', () => {
    const a = calculatePaymentAmounts('advance', { price: 1000, finalPrice: 1000 }, { advanceDepositPercentage: 40 });
    assert.equal(a.amountDue, 400);
    assert.equal(a.remainingAmount, 600);
    const b = calculatePaymentAmounts('advance', { price: 1000, finalPrice: 1000 }, undefined);
    assert.equal(b.amountDue, 250, 'default stays 25%');
  });
}

/* ================================================================== */
/* B · UI — summary before payment + total/advance/remaining per theme */
/* ================================================================== */
section('UI — booking summary before payment; explicit money breakdown');
{
  for (const themeId of THEME_IDS) {
    resetState();

    await test(`${themeId}: option step shows the full summary + total/advance/remaining`, async () => {
      const { utils } = await openFlow(themeId);
      await walkToSummary(utils, themeId);
      await enterPayment(utils);
      // Complete booking summary BEFORE any payment.
      const summary = utils.getByTestId('payment-booking-summary');
      assert.ok(summary.textContent.includes('Signature Treatment'), 'service missing');
      assert.ok(summary.textContent.includes(`${themeId} Test Salon`), 'salon missing');
      assert.ok(summary.textContent.includes('Asha') === false, 'PII name is not required on the money card');
      // Explicit breakdown (default option = advance).
      const breakdown = utils.getByTestId('payment-amount-breakdown');
      assert.ok(Boolean(breakdown));
      assert.ok(utils.getByTestId('payment-total-amount').textContent.includes('₹800'), 'total missing');
      assert.ok(utils.getByTestId('payment-due-now').textContent.includes('₹200'), '25% of 800 = 200');
      assert.ok(utils.getByTestId('payment-due-at-salon').textContent.includes('₹600'), 'remaining 600');
      assert.ok(breakdown.textContent.includes('25%'), 'advance percentage label missing');
      cleanup();
      window.localStorage.clear();
    });
  }
}

/* ================================================================== */
/* C · UI — multi-service total drives the advance                     */
/* ================================================================== */
section('UI — multi-service booking pays 25% of the summed line total');
{
  resetState();
  const themeId = 'beauty_skin_spa';

  await test('2 services (800 + 1500): total 2300, advance 575, remaining 1725', async () => {
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId, [`${themeId}-svc-2`]);
    await enterPayment(utils);
    // Line items visible before paying.
    const lines = utils.getByTestId('payment-summary-services');
    assert.ok(utils.getByTestId(`payment-summary-service-${themeId}-svc-1`).textContent.includes('₹800'));
    assert.ok(utils.getByTestId(`payment-summary-service-${themeId}-svc-2`).textContent.includes('₹1,500'));
    assert.ok(Boolean(lines));
    // Money math from the REAL total.
    assert.ok(utils.getByTestId('payment-total-amount').textContent.includes('₹2,300'));
    assert.ok(utils.getByTestId('payment-due-now').textContent.includes('₹575'), '25% of 2300');
    assert.ok(utils.getByTestId('payment-due-at-salon').textContent.includes('₹1,725'));
  });

  await test('successful advance persists ONE record with services[], correct amounts, confirmed', async () => {
    const { } = {};
    const utils = { getByTestId: null };
    // continue in the SAME mounted flow from the previous test is not
    // possible after cleanup, so re-run the journey end-to-end.
    resetState();
    const opened = await openFlow(themeId);
    await walkToSummary(opened.utils, themeId, [`${themeId}-svc-2`]);
    await enterPayment(opened.utils);
    await payAdvance(opened.utils);
    assert.equal(opened.utils.getByTestId('payment-flow').dataset.step, 'confirm');
    const records = readPaymentRecords();
    assert.equal(records.length, 1, 'exactly one record');
    const rec = records[0];
    assert.equal(rec.baseAmount, 2300);
    assert.equal(rec.amountDue, 575);
    assert.equal(rec.remainingAmount, 1725);
    assert.equal(rec.paymentStatus, 'paid');
    assert.equal(rec.bookingStatus, 'confirmed');
    assert.equal(rec.services.length, 2);
    assert.deepEqual(rec.services.map((l) => l.serviceId), [`${themeId}-svc-1`, `${themeId}-svc-2`]);
    // Confirmation lists the combined service names.
    const confirmCard = opened.utils.getByTestId('payment-confirm-card');
    assert.ok(confirmCard.textContent.includes('Signature Treatment'), 'first line missing on confirm');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* D · STATES — not confirmed until the advance succeeds               */
/* ================================================================== */
section('States — pending / success / failed / cancelled; no confirm before pay');
{
  const themeId = 'family_full_service';

  await test('pending: record exists as pending_payment while processing (NOT confirmed)', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout'); // never resolves on its own
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(400); });
    const rec = readPaymentRecords()[0];
    assert.equal(rec.bookingStatus, 'pending_payment', 'must not be confirmed while pending');
    assert.equal(rec.paymentStatus, 'pending');
    assert.ok(Boolean(utils.getByTestId('payment-processing')), 'processing state visible');
    // Cancel to exit the never-resolving attempt (16.9: cancel asks for
    // an inline confirmation first).
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    cleanup();
    window.localStorage.clear();
  });

  await test('failed: gateway decline → failed status, result screen, still NOT confirmed', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId);
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    const rec = readPaymentRecords()[0];
    assert.equal(rec.paymentStatus, 'failed');
    assert.equal(rec.bookingStatus, 'failed');
    assert.notEqual(rec.bookingStatus, 'confirmed');
    assert.ok(Boolean(utils.getByTestId('payment-result-reason')));
    cleanup();
    window.localStorage.clear();
  });

  await test('cancelled: visitor cancels → cancelled status, NOT confirmed', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(400); });
    // PHASE 16.9 — cancelling an in-flight payment confirms first.
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    assert.ok(Boolean(utils.getByTestId('payment-gateway-cancel-confirm')), 'cancel must ask for confirmation');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    await act(async () => { await wait(200); });
    const rec = readPaymentRecords()[0];
    assert.equal(rec.paymentStatus, 'cancelled');
    assert.equal(rec.bookingStatus, 'cancelled');
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    cleanup();
    window.localStorage.clear();
  });

  await test('retry after failure succeeds WITHOUT creating a second record', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId);
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(readPaymentRecords().length, 1);
    const failedId = readPaymentRecords()[0].id;
    // Gateway recovers; visitor retries from the result screen.
    setPaymentScenarioForTests('all_success');
    const retryBtn = utils.container.querySelector('[data-testid="payment-retry"]');
    assert.ok(Boolean(retryBtn), 'retry control missing on the result screen');
    await act(async () => { fireEvent.click(retryBtn); });
    await act(async () => { await wait(1600); });
    const records = readPaymentRecords();
    assert.equal(records.length, 1, 'retry must reuse the same row');
    assert.equal(records[0].id, failedId);
    assert.equal(records[0].paymentStatus, 'paid');
    assert.equal(records[0].bookingStatus, 'confirmed');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* E · DUPLICATE SUBMISSION                                            */
/* ================================================================== */
section('Duplicate submission prevented');
{
  const themeId = 'barber_mens_grooming';

  await test('double-click on Pay creates exactly ONE record and ONE attempt', async () => {
    resetState();
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    const pay = utils.getByTestId('payment-gateway-pay');
    // Two synchronous clicks in the same tick — the ref lock must catch it.
    await act(async () => {
      fireEvent.click(pay);
      fireEvent.click(pay);
    });
    await act(async () => { await wait(1600); });
    const records = readPaymentRecords();
    assert.equal(records.length, 1, 'double-click must not duplicate the record');
    assert.equal(records[0].paymentStatus, 'paid');
    assert.equal(records[0].bookingStatus, 'confirmed');
    cleanup();
    window.localStorage.clear();
  });

  await test('pay button is replaced by Cancel while processing (no second submit path)', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(300); });
    assert.equal(utils.container.querySelector('[data-testid="payment-gateway-pay"]'), null, 'Pay hidden while processing');
    assert.ok(Boolean(utils.getByTestId('payment-gateway-cancel')));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* F · CONTEXT PRESERVED THROUGH PAYMENT                                */
/* ================================================================== */
section('Selected salon / services / slot / customer preserved');
{
  const themeId = 'nail_lash_studio';

  await test('every selection survives into the persisted record and confirm screen', async () => {
    resetState();
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId, [`${themeId}-svc-3`]);
    await enterPayment(utils);
    await payAdvance(utils);
    const rec = readPaymentRecords()[0];
    assert.equal(rec.businessId, 'public-site', 'salon tenant preserved');
    assert.equal(rec.themeId, themeId, 'theme preserved');
    assert.deepEqual(rec.services.map((l) => l.serviceId), [`${themeId}-svc-1`, `${themeId}-svc-3`]);
    assert.equal(rec.baseAmount, 1200, '800 + 400');
    assert.equal(rec.amountDue, 300, '25% of 1200');
    assert.equal(rec.customer.name, 'Asha Verma');
    assert.equal(rec.customer.mobile, '9876543210');
    assert.ok(rec.dateKey, 'date preserved');
    assert.ok(rec.startMinutes != null, 'slot preserved');
    assert.equal(rec.endMinutes - rec.startMinutes, 90, 'combined duration preserved');
    // Confirm screen shows the joined service names.
    assert.ok(utils.getByTestId('payment-confirm-card').textContent.includes('Signature Treatment + Express Refresh'));
    cleanup();
    window.localStorage.clear();
  });

  await test('confirmed booking clears the 16.1 draft (existing behaviour, multi included)', async () => {
    assert.equal(readBookingDraft('public-site', themeId), null, 'draft must be cleared after confirmation');
  });

  await test('back from payment to summary keeps the full selection editable', async () => {
    resetState();
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils, themeId, [`${themeId}-svc-2`]);
    await enterPayment(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('payment-back-to-summary')); });
    const flow = utils.getByTestId('booking-flow');
    assert.equal(flow.dataset.step, 'summary');
    assert.ok(flow.textContent.includes('Deep Ritual'), 'selection lost on back');
    assert.ok(flow.textContent.includes('₹2,300'), 'total lost on back');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* G · SANDBOX SEPARATION + NO SECRETS                                  */
/* ================================================================== */
section('Sandbox clearly labelled; no gateway secrets in frontend code');
{
  await test('the gateway screen shows the sandbox note in both languages', () => {
    const en = paymentFlowText('en');
    const hi = paymentFlowText('hi');
    assert.ok(en['gateway.sandboxNote'].toLowerCase().includes('sandbox'));
    assert.ok(en['gateway.sandboxNote'].toLowerCase().includes('no real money'));
    assert.ok(hi['gateway.sandboxNote'].includes('सैंडबॉक्स'));
  });

  await test('sandbox note is rendered on the live gateway screen', async () => {
    resetState();
    const { utils } = await openFlow('hair_studio_color_bar');
    await walkToSummary(utils, 'hair_studio_color_bar');
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.ok(utils.getByTestId('payment-flow').textContent.includes('Sandbox gateway'), 'sandbox label missing');
    cleanup();
    window.localStorage.clear();
  });

  await test('static scan: no service-role keys, gateway secrets or key ids in the payment code', async () => {
    const fs = await import('node:fs');
    const files = [
      'src/lib/siteBookingPayment.ts',
      'src/lib/siteBookingPaymentI18n.ts',
      'src/components/SiteBookingPaymentFlow.tsx',
      'src/components/SiteBookingFullFlow.tsx',
      'src/components/SiteBookingFlow.tsx',
    ];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const needle of ['service_role', 'rzp_live', 'rzp_test', 'key_secret', 'RAZORPAY_KEY', 'sk_live', 'sk_test']) {
        assert.ok(!src.includes(needle), `${file} must not contain ${needle}`);
      }
    }
  });

  await test('new EN/HI money-breakdown strings exist and differ', () => {
    const en = paymentFlowText('en');
    const hi = paymentFlowText('hi');
    for (const key of ['summary.totalAmount', 'summary.advanceAmount', 'summary.remainingAmount', 'summary.servicesCount']) {
      assert.ok(en[key], `EN missing ${key}`);
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key], `HI equals EN for ${key}`);
    }
  });
}

/* ================================================================== */
/* H · EN/HI + DARK MODE ON THE MONEY BREAKDOWN                        */
/* ================================================================== */
section('EN/HI + dark mode');
{
  await test('Hindi UI: breakdown labels render in Hindi', async () => {
    resetState();
    setSiteLocale('hi');
    const { utils } = await openFlow('beauty_skin_spa');
    // Walk in Hindi (details labels differ but testids are stable).
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    const breakdown = utils.getByTestId('payment-amount-breakdown');
    assert.ok(breakdown.textContent.includes('कुल बुकिंग राशि'), 'Hindi total label missing');
    assert.ok(breakdown.textContent.includes('एडवांस'), 'Hindi advance label missing');
    assert.ok(breakdown.textContent.includes('शेष'), 'Hindi remaining label missing');
    setSiteLocale('en');
    cleanup();
    window.localStorage.clear();
  });

  await test('dark mode: the payment flow restyles through the existing surfaces', async () => {
    resetState();
    setSiteAppearance('dark');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils, 'beauty_skin_spa');
    await enterPayment(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.appearance, 'dark');
    assert.ok(Boolean(utils.getByTestId('payment-amount-breakdown')));
    setSiteAppearance('light');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.5 advance payment / deposit: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Advance/deposit verified across all five themes: real-total 25% math, explicit total/advance/remaining, pending/success/failed/cancelled states, no-confirm-before-payment, duplicate-submit guard, context preservation, sandbox separation, EN/HI + dark mode.');
}
