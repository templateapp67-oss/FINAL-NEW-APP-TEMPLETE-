/**
 * PHASE 16.10 — FINAL BOOKING ACCEPTANCE TESTING (68 tests)
 *
 * Final acceptance gate for the ENTIRE Phase 16 booking & appointment
 * system, over the existing architecture only (10.6 entry flow, 10.7
 * payment engine, 16.1–16.9 layers). Acceptance-only: no product source
 * is changed by this phase. Verifies:
 *
 *   A. End-to-end journey on ALL FIVE themes
 *      (Salon → Service → Date → Time → Details → Summary → Payment →
 *      Confirmation) — pay-at-salon on every theme + a full advance-
 *      payment gateway journey.
 *   B. Theme + salon isolation (services, records, holds, drafts,
 *      confirmations — nothing crosses tenants or themes).
 *   C. Real price / duration / advance-deposit math (offer-aware Phase 13
 *      pricing, multi-service totals, combined sitting, slot interval).
 *   D. Availability engine (windows, closed days, holidays, min notice,
 *      opening hours, booked spans, holds, staff windows).
 *   E. Validation (customer details model + UI, dead-slot re-validation).
 *   F. Payment states with the NO-CONFIRM-BEFORE-PAYMENT invariant
 *      (pending / paid / failed / cancelled; fail-closed state mapping).
 *   G. Duplicate protection (double-submit locks, idempotency keys,
 *      retry-reuses-the-same-row).
 *   H. Customer / owner access boundaries (actor matrix, tenant-keyed
 *      reads, status machine, denied UI).
 *   I. Call / WhatsApp protection (16.8 advance-payment gate).
 *   J. Static hygiene scans (no secrets, placeholder env, no invented
 *      stores, schema-only record fields).
 *   K. EN / HI and light / dark on the booking + payment surfaces.
 *   L. Responsive structure + Phase 10–15 integration spot checks.
 *
 * Run: npm run test:phase-16.10
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
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
const SiteBookingFlow = (await import('../src/components/SiteBookingFlow.tsx')).default;
const SiteMyBookings = (await import('../src/components/SiteMyBookings.tsx')).default;
const BookingManagementPanel = (await import('../src/components/BookingManagementPanel.tsx')).default;

const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { canCall, canWhatsApp, salonTelHref } = await import('../src/lib/siteBooking.ts');
const {
  BOOKING_THEME_IDS,
  bookingBusinessId,
  bookingServicesForTheme,
  bookingSelectionSummary,
  bookingSelectedServices,
  bookingCombinedSlotService,
  bookingSlotIntervalMinutes,
  parseDurationToMinutes,
  parsedBookingRules,
  bookingDayList,
  bookingSlotsForDay,
  bookingSlotIsStillAvailable,
  bookingSlotKey,
  reserveBookingSlot,
  validateBookingCustomer,
  setBookingHoldsForTests,
  setBookingDatesStateForTests,
  bookingBrowserId,
} = await import('../src/lib/siteBookingFlow.ts');
const {
  setBookingDraftStoreForTests,
  saveBookingDraft,
  readBookingDraft,
} = await import('../src/lib/siteBookingDraft.ts');
const {
  calculatePaymentAmounts,
  createPayAtSalonRecord,
  createPendingBookingRecord,
  buildIdempotencyKey,
  readPaymentRecords,
  readPaymentRecordsForBusiness,
  setPaymentStoreForTests,
  setPaymentScenarioForTests,
  setPaymentGatewayTimeoutForTests,
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
  PAYMENT_STORE_VERSION,
} = await import('../src/lib/siteBookingPayment.ts');
const {
  bookingConfirmationState,
  isConfirmedState,
  readBookingConfirmation,
} = await import('../src/lib/siteBookingConfirmation.ts');
const {
  bookedSpansForSalon,
  staffWindowsForSelection,
} = await import('../src/lib/siteBookingAvailability.ts');
const {
  resolveBookingActor,
  bookingActorCanManage,
  readMyBookings,
  readSalonBookings,
  ownerAllowedTransitions,
  ownerUpdateBookingStatus,
  customerCancelBooking,
  customerCanCancel,
} = await import('../src/lib/bookingManagement.ts');
const {
  resolveContactAccess,
  resolveSiteContactAccess,
  findUnlockingBooking,
} = await import('../src/lib/siteContactAccess.ts');
const { bookingFlowText } = await import('../src/lib/siteBookingI18n.ts');
const { paymentFlowText } = await import('../src/lib/siteBookingPaymentI18n.ts');
const { bookingManagementText } = await import('../src/lib/bookingManagementI18n.ts');
const { setBookingNoticeDurationForTests } = await import('../src/lib/siteBookingNotices.ts');
const { themeVideoCatalog } = await import('../src/lib/siteVideoCatalog.ts');

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

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
// Thursday 2026-08-13, 11:00 — salon open (10:00–20:00).
const THU_OPEN = at(2026, 8, 13, 11, 0);

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

async function openFlow(themeId, extras = {}) {
  const data = richData(themeId, extras);
  const utils = render(React.createElement(SiteBookingFullFlow, { themeId, data }));
  return { utils, data };
}

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

/** Seed records where production reads them (localStorage v1) + notify. */
function seedRecords(records) {
  if (records === null) window.localStorage.removeItem(PAYMENT_STORE_KEY);
  else window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PAYMENT_EVENT));
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

async function walkToSummary(utils) {
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

async function payAtSalon(utils) {
  fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
  await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
}

async function payAdvance(utils) {
  fireEvent.click(utils.getByTestId('payment-option-advance'));
  await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
  assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway');
  fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
  await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
  await act(async () => { await wait(1700); });
}

const AUTHORIZED = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'resolved' } });

/* ================================================================== */
/* A · END-TO-END JOURNEY ON ALL FIVE THEMES                           */
/* ================================================================== */
section('A. End-to-end booking journey — all five themes');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: full journey salon → confirmation (pay at salon)`, async () => {
      resetState();
      const { utils } = await openFlow(themeId);
      const flow = utils.getByTestId('booking-flow');
      assert.equal(flow.dataset.theme, themeId, 'flow stamped with the active theme');
      await walkToSummary(utils);
      assert.ok(utils.getByTestId('booking-summary-total').textContent.includes('800'), 'summary shows the real total');
      await enterPayment(utils);
      await payAtSalon(utils);
      assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm', 'journey ends on the confirmation step');
      const records = readPaymentRecords();
      assert.equal(records.length, 1, 'exactly one persisted booking');
      const record = records[0];
      assert.equal(record.themeId, themeId);
      assert.equal(record.businessId, 'public-site');
      assert.equal(record.bookingStatus, 'pay_at_salon');
      assert.equal(record.paymentStatus, 'unpaid');
      assert.equal(record.baseAmount, 800);
      assert.equal(record.amountDue, 0);
      assert.equal(record.remainingAmount, 800);
      assert.match(record.bookingId, /^NX-\d{5}$/);
      assert.ok(
        utils.getByTestId('payment-confirm-booking-id').textContent.includes(record.bookingId),
        'confirmation shows the persisted booking reference',
      );
      cleanup();
      window.localStorage.clear();
    });
  }

  await test('advance-payment journey: 25% due now, gateway success, confirmed with real record', async () => {
    resetState();
    const { utils } = await openFlow('barber_mens_grooming');
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    assert.ok(utils.getByTestId('payment-due-now').textContent.includes('200'), '25% of ₹800 due now');
    assert.ok(utils.getByTestId('payment-total-amount').textContent.includes('800'), 'real total shown');
    assert.ok(utils.getByTestId('payment-due-at-salon').textContent.includes('600'), 'remaining shown');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway');
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(1700); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm');
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'paid');
    assert.equal(record.bookingStatus, 'confirmed');
    assert.equal(record.amountDue, 200);
    assert.equal(record.remainingAmount, 600);
    assert.equal(bookingConfirmationState(record), 'confirmed');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* B · THEME + SALON ISOLATION                                         */
/* ================================================================== */
section('B. Theme and salon isolation');
{
  await test('services: a foreign theme\u2019s stamped services never enter another theme\u2019s flow', () => {
    resetState();
    const data = richData('beauty_skin_spa', {
      services: [
        ...themeServices('beauty_skin_spa'),
        ...themeServices('barber_mens_grooming'),
      ],
    });
    const services = bookingServicesForTheme(data, 'beauty_skin_spa');
    assert.equal(services.length, 2);
    assert.ok(services.every((s) => s.themeId === 'beauty_skin_spa'));
  });

  await test('payment records are tenant-keyed: business AND theme must both match', () => {
    resetState();
    seedRecords([
      paymentRecord({ businessId: 'public-site', themeId: 'beauty_skin_spa', bookingId: 'NX-11111' }),
      paymentRecord({ businessId: 'other-salon', themeId: 'beauty_skin_spa', bookingId: 'NX-22222' }),
      paymentRecord({ businessId: 'public-site', themeId: 'barber_mens_grooming', bookingId: 'NX-33333' }),
    ]);

    const rows = readPaymentRecordsForBusiness('public-site', 'beauty_skin_spa');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].bookingId, 'NX-11111');
    seedRecords(null);
  });

  await test('a hold stamped with ANOTHER salon never blocks this salon\u2019s slots', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const svc = data.services[0];
    setBookingHoldsForTests([{
      key: bookingSlotKey('beauty_skin_spa', svc.id, '2026-08-14', 780),
      browserId: 'other-browser', themeId: 'beauty_skin_spa', serviceId: svc.id,
      dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      expiresAt: Date.now() + 10 * 60 * 1000, businessId: 'other-salon',
    }]);
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc, at(2026, 8, 14, 0, 0), THU_OPEN, { businessId: 'public-site' });
    assert.equal(slots.find((s) => s.minutes === 780).state, 'available');
    setBookingHoldsForTests(null);
  });

  await test('a hold on a DIFFERENT theme never blocks this theme\u2019s slots', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const svc = data.services[0];
    setBookingHoldsForTests([{
      key: bookingSlotKey('barber_mens_grooming', 'x', '2026-08-14', 780),
      browserId: 'other-browser', themeId: 'barber_mens_grooming', serviceId: 'x',
      dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      expiresAt: Date.now() + 10 * 60 * 1000, businessId: 'public-site',
    }]);
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc, at(2026, 8, 14, 0, 0), THU_OPEN, { businessId: 'public-site' });
    assert.equal(slots.find((s) => s.minutes === 780).state, 'available');
    setBookingHoldsForTests(null);
  });

  await test('drafts are salon+theme scoped: theme A\u2019s draft is invisible to theme B', () => {
    resetState();
    saveBookingDraft({
      businessId: 'public-site', themeId: 'beauty_skin_spa', status: 'in_progress', step: 'date',
      serviceId: 'beauty_skin_spa-svc-1', serviceName: 'Signature Treatment',
    });
    assert.ok(readBookingDraft('public-site', 'beauty_skin_spa'), 'own draft readable');
    assert.equal(readBookingDraft('public-site', 'barber_mens_grooming'), null, 'foreign theme sees nothing');
    assert.equal(readBookingDraft('other-salon', 'beauty_skin_spa'), null, 'foreign salon sees nothing');
  });

  await test('confirmation lookups are identity- and tenant-scoped', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ customerId: me, bookingId: 'NX-40001' }),
      paymentRecord({ customerId: 'someone-else', bookingId: 'NX-40002' }),
    ]);
    assert.equal(readBookingConfirmation('NX-40001', 'public-site', 'beauty_skin_spa').ok, true);
    assert.equal(readBookingConfirmation('NX-40002', 'public-site', 'beauty_skin_spa').ok, false, 'foreign customer\u2019s booking unreachable');
    assert.equal(readBookingConfirmation('NX-40001', 'public-site', 'barber_mens_grooming').ok, false, 'wrong theme unreachable');
    const mine = readMyBookings();
    assert.ok(mine.every((r) => r.customerId === me), 'my-bookings returns only my rows');
    seedRecords(null);
  });
}

/* ================================================================== */
/* C · REAL PRICE / DURATION / ADVANCE MATH                            */
/* ================================================================== */
section('C. Real price, duration and advance-deposit math');
{
  await test('advance = round(base × pct/100); remaining = base − advance (25% of ₹800)', () => {
    const a = calculatePaymentAmounts('advance', { price: 800, finalPrice: 800 }, { advanceDepositPercentage: 25 });
    assert.equal(a.baseAmount, 800);
    assert.equal(a.amountDue, 200);
    assert.equal(a.remainingAmount, 600);
    assert.equal(a.advancePercent, 25);
    assert.equal(a.requiresGateway, true);
  });

  await test('custom advance percentage is honoured and clamped to 0–100', () => {
    assert.equal(calculatePaymentAmounts('advance', { price: 1500, finalPrice: 1500 }, { advanceDepositPercentage: 40 }).amountDue, 600);
    assert.equal(calculatePaymentAmounts('advance', { price: 800, finalPrice: 800 }, { advanceDepositPercentage: 250 }).amountDue, 800);
    assert.equal(calculatePaymentAmounts('advance', { price: 800, finalPrice: 800 }, { advanceDepositPercentage: -10 }).amountDue, 0);
    assert.equal(calculatePaymentAmounts('advance', { price: 800, finalPrice: 800 }, undefined).amountDue, 200, 'default 25%');
  });

  await test('full payment: everything due now, nothing left at the salon', () => {
    const a = calculatePaymentAmounts('full', { price: 800, finalPrice: 800 }, { advanceDepositPercentage: 25 });
    assert.equal(a.amountDue, 800);
    assert.equal(a.remainingAmount, 0);
    assert.equal(a.advancePercent, 100);
    assert.equal(a.requiresGateway, true);
  });

  await test('pay at salon: zero due now, full base remains, no gateway', () => {
    const a = calculatePaymentAmounts('pay_at_salon', { price: 800, finalPrice: 800 }, { advanceDepositPercentage: 25 });
    assert.equal(a.amountDue, 0);
    assert.equal(a.remainingAmount, 800);
    assert.equal(a.requiresGateway, false);
  });

  await test('multi-service totals: prices and durations sum from the real rows', () => {
    const services = themeServices('beauty_skin_spa');
    const summary = bookingSelectionSummary(services, []);
    assert.equal(summary.count, 2);
    assert.equal(summary.totalPrice, 2300);
    assert.equal(summary.totalDurationMinutes, 150);
  });

  await test('offer-aware pricing (Phase 13): an active offer discounts the booking total', () => {
    const services = themeServices('beauty_skin_spa');
    const offer = {
      id: 'off-1', businessId: 'public-site', themeId: 'beauty_skin_spa', themeKey: 'beauty_skin_spa',
      targetType: 'saved_service', categoryId: null, predefinedServiceId: null,
      savedServiceId: 'beauty_skin_spa-svc-1', packageId: null, title: '25% off',
      discountType: 'percentage', discountValue: 25,
      startDate: '2026-08-01', endDate: '2026-08-31', status: 'active',
    };
    const summary = bookingSelectionSummary(services, [offer]);
    assert.equal(summary.lines[0].finalPrice, 600, '₹800 − 25% = ₹600');
    assert.equal(summary.lines[0].basePrice, 800);
    assert.equal(summary.totalPrice, 2100);
    const advance = calculatePaymentAmounts('advance', { price: 800, finalPrice: 600 }, { advanceDepositPercentage: 25 });
    assert.equal(advance.amountDue, 150, 'advance computed from the discounted price');
  });

  await test('combined sitting: sorted joined ids + summed duration; single selection collapses', () => {
    const services = themeServices('beauty_skin_spa');
    const combined = bookingCombinedSlotService(services);
    assert.equal(combined.id, [services[0].id, services[1].id].sort().join('+'));
    assert.equal(combined.duration, 150);
    const single = bookingCombinedSlotService([services[0]]);
    assert.equal(single.id, services[0].id);
    assert.equal(single.duration, 60);
    assert.equal(bookingCombinedSlotService([]), null);
  });

  await test('slot interval derives from duration + buffer (30-minute grid, capped at 120)', () => {
    const noBuffer = { bookingRules: { minNotice: '1 hour', maxAdvance: '30 days', bufferTime: 'No buffer' } };
    assert.equal(bookingSlotIntervalMinutes({ duration: 60 }, noBuffer), 60);
    assert.equal(bookingSlotIntervalMinutes({ duration: 90 }, noBuffer), 90);
    assert.equal(bookingSlotIntervalMinutes({ duration: 45 }, noBuffer), 60);
    const buffered = { bookingRules: { minNotice: '1 hour', maxAdvance: '30 days', bufferTime: '30 minutes' } };
    assert.equal(bookingSlotIntervalMinutes({ duration: 60 }, buffered), 90);
    assert.equal(parseDurationToMinutes('1 hour'), 60);
    assert.equal(parsedBookingRules({ bookingRules: { minNotice: '1 hour', maxAdvance: '30 days', bufferTime: 'No buffer' } }).maxAdvanceDays, 30);
  });
}

/* ================================================================== */
/* D · AVAILABILITY ENGINE                                             */
/* ================================================================== */
section('D. Availability — windows, hours, holidays, notice, spans, holds, staff');
{
  await test('booking window: days beyond maxAdvance are outside-window; Sunday is closed', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const days = bookingDayList(data, 40, THU_OPEN);
    assert.equal(days[0].dateKey, '2026-08-13', 'window starts today');
    const sunday = days.find((d) => d.dateKey === '2026-08-16');
    assert.equal(sunday.selectable, false);
    assert.equal(sunday.reason, 'closed');
    const beyond = days[35];
    assert.equal(beyond.selectable, false);
    assert.equal(beyond.reason, 'outside-window');
  });

  await test('holidays close the exact date', () => {
    resetState();
    const data = richData('beauty_skin_spa', { holidays: [{ date: '2026-08-15', name: 'Independence Day' }] });
    const days = bookingDayList(data, 7, THU_OPEN);
    const holiday = days.find((d) => d.dateKey === '2026-08-15');
    assert.equal(holiday.selectable, false);
    assert.equal(holiday.reason, 'holiday');
    assert.equal(days.find((d) => d.dateKey === '2026-08-14').selectable, true);
  });

  await test('slots respect opening hours: never before open, never past close', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', data.services[0], at(2026, 8, 14, 0, 0), THU_OPEN);
    assert.ok(slots.length > 0);
    assert.equal(slots[0].minutes, 600, 'first slot at opening (10:00)');
    assert.equal(slots[slots.length - 1].minutes, 1140, 'last 60-min slot starts 19:00');
    assert.ok(slots.every((s) => s.minutes >= 600 && s.minutes + 60 <= 1200));
  });

  await test('minimum notice: today\u2019s slots inside the notice window are past', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', data.services[0], at(2026, 8, 13, 0, 0), THU_OPEN);
    // Clock 11:00 + 1 hour notice → everything before 12:00 unavailable.
    assert.equal(slots.find((s) => s.minutes === 600).state, 'past');
    assert.equal(slots.find((s) => s.minutes === 660).state, 'past');
    assert.equal(slots.find((s) => s.minutes === 720).state, 'available');
  });

  await test('a real booking record blocks its exact span (booked spans → taken)', () => {
    resetState();
    seedRecords([paymentRecord({ bookingStatus: 'confirmed', paymentStatus: 'paid' })]);
    const data = richData('beauty_skin_spa');
    const extras = {
      blockedSpans: bookedSpansForSalon('public-site', 'beauty_skin_spa'),
      businessId: 'public-site',
    };
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', data.services[0], at(2026, 8, 14, 0, 0), THU_OPEN, extras);
    assert.equal(slots.find((s) => s.minutes === 780).state, 'taken', '13:00 span is booked');
    assert.equal(slots.find((s) => s.minutes === 840).state, 'available');
    seedRecords(null);
  });

  await test('foreign hold blocks the overlapping span; my own hold shows as held', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const svc = data.services[0];
    setBookingHoldsForTests([{
      key: bookingSlotKey('beauty_skin_spa', svc.id, '2026-08-14', 780),
      browserId: 'other-browser', themeId: 'beauty_skin_spa', serviceId: svc.id,
      dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      expiresAt: Date.now() + 10 * 60 * 1000, businessId: 'public-site',
    }]);
    let slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc, at(2026, 8, 14, 0, 0), THU_OPEN, { businessId: 'public-site' });
    assert.equal(slots.find((s) => s.minutes === 780).state, 'taken');
    setBookingHoldsForTests(null);
    const result = reserveBookingSlot('beauty_skin_spa', svc, '2026-08-14', 840, { businessId: 'public-site' });
    assert.equal(result.ok, true);
    slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc, at(2026, 8, 14, 0, 0), THU_OPEN, { businessId: 'public-site' });
    assert.equal(slots.find((s) => s.minutes === 840).state, 'held', 'my own hold');
  });

  await test('staff windows restrict slots only when the mapping covers the selection', () => {
    resetState();
    const svc = themeServices('beauty_skin_spa')[0];
    const schedule = {
      monday: { working: false, startTime: '', endTime: '' },
      tuesday: { working: false, startTime: '', endTime: '' },
      wednesday: { working: false, startTime: '', endTime: '' },
      thursday: { working: false, startTime: '', endTime: '' },
      friday: { working: true, startTime: '12:00 PM', endTime: '04:00 PM' },
      saturday: { working: false, startTime: '', endTime: '' },
      sunday: { working: false, startTime: '', endTime: '' },
    };
    const mapped = richData('beauty_skin_spa', {
      team: [{ id: 't1', name: 'Meera', role: 'Stylist', specialties: [], imageUrl: '',
        status: 'Active', assignedServiceIds: [svc.id], schedule }],
    });
    const windows = staffWindowsForSelection(mapped, [svc], 'friday');
    assert.deepEqual(windows, [{ startMinutes: 720, endMinutes: 960 }]);
    const slots = bookingSlotsForDay(mapped, 'beauty_skin_spa', svc, at(2026, 8, 14, 0, 0), THU_OPEN, {
      staffWindows: windows, businessId: 'public-site',
    });
    assert.equal(slots.find((s) => s.minutes === 600).state, 'taken', 'before the staff window');
    assert.equal(slots.find((s) => s.minutes === 780).state, 'available', 'inside the window');
    assert.equal(slots.find((s) => s.minutes === 960).state, 'taken', 'after the window');
    const unmapped = richData('beauty_skin_spa', {
      team: [{ id: 't1', name: 'Meera', role: 'Stylist', specialties: [], imageUrl: '', status: 'Active', schedule }],
    });
    assert.equal(staffWindowsForSelection(unmapped, [svc], 'friday'), null, 'no mapping → no invented constraint');
  });

  await test('bookingSlotIsStillAvailable fails for spans taken since selection', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    const svc = data.services[0];
    const date = at(2026, 8, 14, 0, 0);
    assert.equal(bookingSlotIsStillAvailable(data, 'beauty_skin_spa', svc, date, 780, THU_OPEN, { businessId: 'public-site' }), true);
    seedRecords([paymentRecord({})]);
    const extras = {
      blockedSpans: bookedSpansForSalon('public-site', 'beauty_skin_spa'),
      businessId: 'public-site',
    };
    assert.equal(bookingSlotIsStillAvailable(data, 'beauty_skin_spa', svc, date, 780, THU_OPEN, extras), false);
    seedRecords(null);
  });
}

/* ================================================================== */
/* E · VALIDATION                                                      */
/* ================================================================== */
section('E. Validation — customer details model + UI, dead-slot re-check');
{
  await test('name shorter than 2 characters is rejected; a real name passes', () => {
    assert.equal(validateBookingCustomer({ name: 'A', mobile: '9876543210', email: '' }).name, true);
    assert.equal(validateBookingCustomer({ name: '  ', mobile: '9876543210', email: '' }).name, true);
    assert.equal(validateBookingCustomer({ name: 'Asha Verma', mobile: '9876543210', email: '' }).name, undefined);
  });

  await test('mobile must be 10–13 digits (formatting stripped)', () => {
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '12345', email: '' }).mobile, true);
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '98765432109876', email: '' }).mobile, true);
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '98765 43210', email: '' }).mobile, undefined);
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '+91 98765 43210', email: '' }).mobile, undefined);
  });

  await test('email is optional but validated when present', () => {
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '9876543210', email: '' }).email, undefined);
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '9876543210', email: 'not-an-email' }).email, true);
    assert.equal(validateBookingCustomer({ name: 'Asha', mobile: '9876543210', email: 'a@b.co' }).email, undefined);
  });

  await test('UI: empty details keep Continue gated; blur surfaces the field errors', async () => {
    resetState();
    const { utils } = renderEntry('beauty_skin_spa');
    const flow = utils.getByTestId('booking-flow');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // salon → service
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // service → date
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // date → time
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // time → details
    assert.equal(flow.dataset.step, 'details');
    assert.equal(utils.getByTestId('booking-continue').disabled, true, 'Continue gated while empty (10.6 contract)');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(flow.dataset.step, 'details', 'must not advance');
    await act(async () => {
      fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'A' } });
      fireEvent.blur(utils.getByTestId('booking-input-name'));
      fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '123' } });
      fireEvent.blur(utils.getByTestId('booking-input-mobile'));
    });
    assert.ok(Boolean(utils.getByTestId('booking-err-name')), 'name error shown');
    assert.ok(Boolean(utils.getByTestId('booking-err-mobile')), 'mobile error shown');
    assert.equal(utils.getByTestId('booking-input-name').getAttribute('aria-invalid'), 'true');
    cleanup();
    window.localStorage.clear();
  });

  await test('UI: fixing an invalid mobile clears the error and advances to summary', async () => {
    resetState();
    const { utils } = renderEntry('beauty_skin_spa');
    const flow = utils.getByTestId('booking-flow');
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    }
    assert.equal(flow.dataset.step, 'details');
    await act(async () => {
      fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Asha Verma' } });
      fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '12345' } });
      fireEvent.blur(utils.getByTestId('booking-input-mobile'));
    });
    assert.ok(Boolean(utils.getByTestId('booking-err-mobile')), 'mobile error shown on blur');
    assert.equal(utils.getByTestId('booking-continue').disabled, true, 'Continue gated while invalid');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(flow.dataset.step, 'details', 'must not advance while invalid');
    await act(async () => {
      fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '9876543210' } });
    });
    assert.equal(utils.container.querySelector('[data-testid="booking-err-mobile"]'), null, 'error cleared');
    assert.equal(utils.getByTestId('booking-continue').disabled, false);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(flow.dataset.step, 'summary', 'valid details advance');
    cleanup();
    window.localStorage.clear();
  });

  await test('UI: a slot lost between selection and Continue is re-validated (never silently kept)', async () => {
    resetState();
    const { utils, toasts } = renderEntry('beauty_skin_spa');
    const flow = utils.getByTestId('booking-flow');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(flow.dataset.step, 'time');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-slot-780')); });
    await act(async () => {
      seedRecords([paymentRecord({ serviceId: 'beauty_skin_spa-svc-1', bookingId: 'NX-90001' })]);
    });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(flow.dataset.step, 'time', 'must NOT advance with a dead slot');
    assert.ok(
      toasts.some((m) => typeof m === 'object' && m.kind === 'error'),
      'slot-lost error announced',
    );
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* F · PAYMENT STATES — NO CONFIRM BEFORE PAYMENT                      */
/* ================================================================== */
section('F. Payment states — confirmed only when payment earned it');
{
  await test('pay_at_salon is the ONLY no-payment path that confirms (explicit rule)', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAtSalon(utils);
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'unpaid');
    assert.equal(record.bookingStatus, 'pay_at_salon');
    assert.equal(bookingConfirmationState(record), 'confirmed');
    cleanup();
    window.localStorage.clear();
  });

  await test('while the gateway processes, the record is pending — never confirmed', async () => {
    resetState();
    const { utils } = await openFlow('hair_studio_color_bar');
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(400); });
    assert.ok(Boolean(utils.getByTestId('payment-processing')), 'processing state visible');
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway', 'no confirm step yet');
    assert.equal(utils.container.querySelector('[data-testid="payment-confirm-booking-id"]'), null);
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'pending');
    assert.equal(bookingConfirmationState(record), 'payment_pending');
    await act(async () => { await wait(1400); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'confirm', 'confirm ONLY after paid');
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway failure → failed record, retry offered, never a confirmation', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('family_full_service');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'failed');
    assert.equal(record.bookingStatus, 'failed');
    assert.equal(bookingConfirmationState(record), 'payment_failed');
    assert.ok(Boolean(utils.getByTestId('payment-retry')), 'retry offered');
    assert.equal(utils.container.querySelector('[data-testid="payment-confirm-booking-id"]'), null, 'no confirmation surface');
    cleanup();
    window.localStorage.clear();
  });

  await test('confirmed gateway cancellation → cancelled record (no confirmation)', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    const { utils } = await openFlow('nail_lash_studio');
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(300); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel')); });
    assert.ok(Boolean(utils.getByTestId('payment-gateway-cancel-confirm')), 'destructive cancel needs confirmation');
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-cancel-yes')); });
    await act(async () => { await wait(200); });
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'cancelled');
    assert.equal(record.bookingStatus, 'cancelled');
    assert.equal(bookingConfirmationState(record), 'cancelled');
    cleanup();
    window.localStorage.clear();
  });

  await test('gateway timeout → failed (distinct from cancellation) with retry', async () => {
    resetState();
    setPaymentScenarioForTests('force_timeout');
    setPaymentGatewayTimeoutForTests(1200);
    const { utils } = await openFlow('barber_mens_grooming');
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    await act(async () => { await wait(2000); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'result');
    assert.equal(utils.getByTestId('payment-result').dataset.outcome, 'timeout');
    const record = readPaymentRecords()[0];
    assert.equal(record.paymentStatus, 'failed');
    assert.equal(record.bookingStatus, 'failed');
    assert.ok(Boolean(utils.getByTestId('payment-retry')));
    cleanup();
    window.localStorage.clear();
  });

  await test('state mapping fails closed: confirmed booking status without paid money is pending', () => {
    const cases = [
      [{ bookingStatus: 'confirmed', paymentStatus: 'paid' }, 'confirmed'],
      [{ bookingStatus: 'confirmed', paymentStatus: 'pending' }, 'payment_pending'],
      [{ bookingStatus: 'confirmed', paymentStatus: 'unpaid' }, 'payment_pending'],
      [{ bookingStatus: 'pending_payment', paymentStatus: 'pending' }, 'payment_pending'],
      [{ bookingStatus: 'pay_at_salon', paymentStatus: 'unpaid' }, 'confirmed'],
      [{ bookingStatus: 'failed', paymentStatus: 'failed' }, 'payment_failed'],
      [{ bookingStatus: 'confirmed', paymentStatus: 'failed' }, 'payment_failed'],
      [{ bookingStatus: 'cancelled', paymentStatus: 'paid' }, 'cancelled'],
      [{ bookingStatus: 'confirmed', paymentStatus: 'cancelled' }, 'cancelled'],
      [{ bookingStatus: 'completed', paymentStatus: 'paid' }, 'completed'],
    ];
    for (const [record, expected] of cases) {
      assert.equal(bookingConfirmationState(record), expected, JSON.stringify(record));
    }
    assert.equal(isConfirmedState('confirmed'), true);
    assert.equal(isConfirmedState('completed'), true);
    for (const s of ['payment_pending', 'payment_failed', 'cancelled']) {
      assert.equal(isConfirmedState(s), false, `${s} must never present as confirmed`);
    }
  });

  await test('the confirmation surface shows the persisted reference, not UI state', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAtSalon(utils);
    const record = readPaymentRecords()[0];
    assert.ok(utils.getByTestId('payment-confirm-booking-id').textContent.includes(record.bookingId));
    cleanup();
    window.localStorage.clear();
  });

  await test('a paid advance survives in the record even after owner cancellation (no invented refunds)', () => {
    resetState();
    seedRecords([paymentRecord({ bookingId: 'NX-50001' })]);
    const result = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-50001', 'cancelled');
    assert.equal(result.ok, true);
    assert.equal(result.record.bookingStatus, 'cancelled');
    assert.equal(result.record.paymentStatus, 'paid', 'paid money stays recorded');
    assert.equal(result.record.amountDue, 200);
    seedRecords(null);
  });
}

/* ================================================================== */
/* G · DUPLICATE PROTECTION                                            */
/* ================================================================== */
section('G. Duplicate protection — locks, idempotency, retry-same-row');
{
  await test('double-click on summary Confirm hands off to payment exactly once', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await act(async () => {
      fireEvent.click(utils.getByTestId('booking-confirm'));
      fireEvent.click(utils.getByTestId('booking-confirm'));
    });
    assert.equal(utils.container.querySelectorAll('[data-testid="payment-flow"]').length, 1);
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'option');
    cleanup();
    window.localStorage.clear();
  });

  await test('double-click on Pay creates exactly one record and one attempt', async () => {
    resetState();
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await enterPayment(utils);
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => {
      fireEvent.click(utils.getByTestId('payment-gateway-pay'));
      fireEvent.click(utils.getByTestId('payment-gateway-pay'));
    });
    await act(async () => { await wait(1700); });
    assert.equal(readPaymentRecords().length, 1, 'exactly one persisted record');
    assert.equal(readPaymentRecords()[0].paymentStatus, 'paid');
    cleanup();
    window.localStorage.clear();
  });

  await test('idempotency: duplicate pay-at-salon creation returns the existing row', () => {
    resetState();
    const svc = themeServices('beauty_skin_spa')[0];
    const input = {
      businessId: 'public-site', themeId: 'beauty_skin_spa', service: svc,
      bookingId: 'NX-60001', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      amounts: calculatePaymentAmounts('pay_at_salon', { price: 800, finalPrice: 800 }, undefined),
      paymentOption: 'pay_at_salon', paymentMethod: null,
      customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
    };
    const first = createPayAtSalonRecord(input);
    const second = createPayAtSalonRecord(input);
    assert.equal(first.id, second.id, 'same row returned');
    assert.equal(readPaymentRecords().length, 1);
  });

  await test('idempotency: duplicate pending-record creation returns the existing row', () => {
    resetState();
    const svc = themeServices('beauty_skin_spa')[0];
    const input = {
      businessId: 'public-site', themeId: 'beauty_skin_spa', service: svc,
      bookingId: 'NX-60002', dateKey: '2026-08-14', startMinutes: 840, endMinutes: 900,
      amounts: calculatePaymentAmounts('advance', { price: 800, finalPrice: 800 }, { advanceDepositPercentage: 25 }),
      paymentOption: 'advance', paymentMethod: 'card',
      customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
    };
    const first = createPendingBookingRecord(input);
    const second = createPendingBookingRecord(input);
    assert.equal(first.id, second.id);
    assert.equal(readPaymentRecords().length, 1);
    const key = buildIdempotencyKey({
      businessId: 'public-site', themeId: 'beauty_skin_spa', bookingId: 'NX-60002',
      paymentOption: 'advance', amountDue: 200, serviceId: svc.id,
      dateKey: '2026-08-14', startMinutes: 840,
    });
    assert.equal(first.idempotencyKey, key, 'key derives from the booking facts');
  });

  await test('retry after failure reuses the SAME record row (no duplicate booking)', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const { utils } = await openFlow('beauty_skin_spa');
    await walkToSummary(utils);
    await enterPayment(utils);
    await payAdvance(utils);
    assert.equal(readPaymentRecords().length, 1);
    const failedId = readPaymentRecords()[0].id;
    setPaymentScenarioForTests('all_success');
    // Retry re-runs the SAME record through the gateway from the result card
    // (busy state on the card itself, no second form, no second row).
    await act(async () => { fireEvent.click(utils.getByTestId('payment-retry')); });
    await act(async () => { await wait(1700); });
    const records = readPaymentRecords();
    assert.equal(records.length, 1, 'still exactly one row');
    assert.equal(records[0].id, failedId, 'the same row was reused');
    assert.equal(records[0].paymentStatus, 'paid');
    cleanup();
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* H · CUSTOMER / OWNER ACCESS BOUNDARIES                              */
/* ================================================================== */
section('H. Access boundaries — actor matrix, tenant reads, status machine');
{
  await test('actor resolution matrix maps sessions to permissions exactly', () => {
    const cases = [
      [{ supabaseConfigured: false, userPresent: false, resolution: null }, 'not-configured', true],
      [{ supabaseConfigured: true, userPresent: false, resolution: null }, 'not-authenticated', false],
      [{ supabaseConfigured: true, userPresent: true, resolution: { status: 'resolved' } }, 'authorized', true],
      [{ supabaseConfigured: true, userPresent: true, resolution: { status: 'no-membership' } }, 'no-ownership', false],
      [{ supabaseConfigured: true, userPresent: true, resolution: { status: 'ambiguous' } }, 'ambiguous', false],
      [{ supabaseConfigured: true, userPresent: true, resolution: { status: 'permission-denied' } }, 'permission-denied', false],
      [{ supabaseConfigured: true, userPresent: true, resolution: { status: 'error' } }, 'error', false],
    ];
    for (const [input, permission, canManage] of cases) {
      const actor = resolveBookingActor(input);
      assert.equal(actor.permission, permission);
      assert.equal(bookingActorCanManage(actor), canManage, `${permission} canManage`);
    }
  });

  await test('salon bookings are refused for every denied actor', () => {
    resetState();
    seedRecords([paymentRecord({})]);
    for (const status of ['no-membership', 'ambiguous', 'permission-denied', 'error']) {
      const actor = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status } });
      const result = readSalonBookings(actor, 'public-site', 'beauty_skin_spa');
      assert.equal(result.ok, false, `${status} must be refused`);
    }
    const ok = readSalonBookings(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    assert.equal(ok.ok, true);
    assert.equal(ok.records.length, 1);
    seedRecords(null);
  });

  await test('customers read ONLY their own rows — identity comes from the browser, not the caller', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ customerId: me, bookingId: 'NX-70001' }),
      paymentRecord({ customerId: 'someone-else', bookingId: 'NX-70002' }),
    ]);
    const mine = readMyBookings();
    assert.equal(mine.length, 1);
    assert.equal(mine[0].bookingId, 'NX-70001');
    seedRecords(null);
  });

  await test('a customer cannot cancel a foreign booking (structurally not-found)', () => {
    resetState();
    seedRecords([paymentRecord({ customerId: 'someone-else', bookingId: 'NX-70003' })]);
    const result = customerCancelBooking('public-site', 'beauty_skin_spa', 'NX-70003');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not-found');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'row untouched');
    seedRecords(null);
  });

  await test('owner status machine: terminal states have no exits; foreign tenants are invisible', () => {
    resetState();
    assert.deepEqual(ownerAllowedTransitions('completed'), []);
    assert.deepEqual(ownerAllowedTransitions('cancelled'), []);
    assert.deepEqual(ownerAllowedTransitions('failed'), []);
    assert.deepEqual(ownerAllowedTransitions('confirmed'), ['completed', 'cancelled']);
    assert.equal(customerCanCancel({ bookingStatus: 'completed' }), false);
    assert.equal(customerCanCancel({ bookingStatus: 'confirmed' }), true);
    seedRecords([paymentRecord({ bookingId: 'NX-70004', bookingStatus: 'completed', remainingAmount: 0 })]);
    const illegal = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-70004', 'cancelled');
    assert.equal(illegal.ok, false);
    assert.equal(illegal.reason, 'invalid-transition');
    const foreign = ownerUpdateBookingStatus(AUTHORIZED, 'other-salon', 'beauty_skin_spa', 'NX-70004', 'completed');
    assert.equal(foreign.ok, false);
    assert.equal(foreign.reason, 'not-found', 'wrong tenant cannot even see the row');
    seedRecords(null);
  });

  await test('owner completion settles the remaining balance on the record', () => {
    resetState();
    seedRecords([paymentRecord({ bookingId: 'NX-70005' })]);
    const result = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-70005', 'completed');
    assert.equal(result.ok, true);
    assert.equal(result.record.bookingStatus, 'completed');
    assert.equal(result.record.paymentStatus, 'paid');
    assert.equal(result.record.remainingAmount, 0);
    assert.equal(result.record.amountDue, 800, 'advance + balance = full amount');
    seedRecords(null);
  });

  await test('UI: denied actor sees the denial panel; customers never see foreign bookings', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ customerId: me, bookingId: 'NX-70006' }),
      paymentRecord({ customerId: 'someone-else', bookingId: 'NX-70007' }),
    ]);
    const denied = resolveBookingActor({ supabaseConfigured: true, userPresent: false, resolution: null });
    const panel = render(React.createElement(BookingManagementPanel, {
      actor: denied, businessId: 'public-site', themeId: 'beauty_skin_spa', onShowToast: () => {},
    }));
    assert.ok(Boolean(panel.getByTestId('booking-management-denied')));
    assert.equal(panel.container.querySelector('[data-testid="owner-booking-NX-70006"]'), null, 'no rows leak to a denied actor');
    cleanup();
    const my = render(React.createElement(SiteMyBookings, {
      themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'), businessId: 'public-site', onShowToast: () => {},
    }));
    await act(async () => { await wait(50); });
    assert.ok(Boolean(my.getByTestId('my-booking-NX-70006')), 'own booking rendered');
    assert.equal(my.container.querySelector('[data-testid="my-booking-NX-70007"]'), null, 'foreign booking never rendered');
    cleanup();
    seedRecords(null);
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* I · CALL / WHATSAPP PROTECTION (16.8 GATE)                          */
/* ================================================================== */
section('I. Call / WhatsApp protection — only a real paid advance unlocks');
{
  await test('no booking → both channels locked, no href, payment-required', () => {
    resetState();
    const data = richData('beauty_skin_spa');
    assert.equal(canCall(data), true);
    assert.equal(canWhatsApp(data), true);
    const access = resolveSiteContactAccess(data, 'beauty_skin_spa', THU_OPEN);
    assert.equal(access.call.unlocked, false);
    assert.equal(access.whatsapp.unlocked, false);
    assert.equal(access.call.href, null);
    assert.equal(access.call.reason, 'payment-required');
    assert.equal(access.anyLocked, true);
    assert.equal(access.advancePercentage, 25);
  });

  await test('pay_at_salon deliberately does NOT unlock (no advance was taken)', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({
      customerId: me, bookingId: 'NX-80001', paymentOption: 'pay_at_salon',
      paymentMethod: null, paymentStatus: 'unpaid', bookingStatus: 'pay_at_salon',
      amountDue: 0, remainingAmount: 800, payAtSalon: true,
    })]);
    assert.equal(findUnlockingBooking('public-site', 'beauty_skin_spa', THU_OPEN), null);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa', THU_OPEN);
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'payment-required');
    assert.equal(access.reference, 'NX-80001', 'the visitor\u2019s own attempt explains the lock');
    seedRecords(null);
  });

  await test('a real paid advance on a future appointment unlocks with the salon\u2019s true target', () => {
    resetState();
    const me = bookingBrowserId();
    const data = richData('beauty_skin_spa');
    seedRecords([paymentRecord({ customerId: me, bookingId: 'NX-80002' })]);
    const unlocking = findUnlockingBooking('public-site', 'beauty_skin_spa', THU_OPEN);
    assert.ok(unlocking);
    assert.equal(unlocking.bookingId, 'NX-80002');
    const access = resolveContactAccess('call', data, 'beauty_skin_spa', THU_OPEN);
    assert.equal(access.unlocked, true);
    assert.equal(access.href, salonTelHref(data), 'href is the viewed salon\u2019s own number');
    assert.equal(access.reference, 'NX-80002');
    seedRecords(null);
  });

  await test('expired and cancelled bookings re-lock with their own explanations', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ customerId: me, bookingId: 'NX-80003', dateKey: '2026-08-12' })]);
    let access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa', THU_OPEN);
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'expired');
    seedRecords([paymentRecord({
      customerId: me, bookingId: 'NX-80004', paymentStatus: 'cancelled', bookingStatus: 'cancelled',
    })]);
    access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa', THU_OPEN);
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'cancelled');
    seedRecords(null);
  });

  await test('the unlock is salon+theme scoped: paying one salon never unlocks another', () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ customerId: me, bookingId: 'NX-80005', themeId: 'beauty_skin_spa' })]);
    assert.ok(findUnlockingBooking('public-site', 'beauty_skin_spa', THU_OPEN));
    assert.equal(findUnlockingBooking('public-site', 'family_full_service', THU_OPEN), null, 'other theme stays locked');
    assert.equal(findUnlockingBooking('other-salon', 'beauty_skin_spa', THU_OPEN), null, 'other salon stays locked');
    seedRecords(null);
  });
}

/* ================================================================== */
/* J · STATIC HYGIENE                                                  */
/* ================================================================== */
section('J. Static hygiene — no secrets, placeholder env, no invented stores');
{
  await test('no private API keys or service-role credentials anywhere in client source', async () => {
    const files = (await readdir('src', { recursive: true })).filter((f) => /\.(ts|tsx)$/.test(f));
    const needles = [
      /service_role/i,
      /SUPABASE_SERVICE_ROLE/i,
      /AIza[0-9A-Za-z_-]{20,}/,
      /sk-[A-Za-z0-9]{20,}/,
      /pk_live_/,
      /rzp_live_/,
      /ghp_[A-Za-z0-9]{20,}/,
    ];
    for (const file of files) {
      const source = await readFile(join('src', file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const needle of needles) {
        for (const line of code.split('\n')) {
          assert.ok(!needle.test(line), `${file} matches ${needle} in: ${line.trim().slice(0, 80)}`);
        }
      }
    }
  });

  await test('.env.example carries placeholders only — never real secret formats', async () => {
    const envExample = await readFile('.env.example', 'utf8');
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(envExample), 'no JWT');
    assert.ok(!/\b(sk|pk|rzp|ghp)_[A-Za-z0-9]{10,}/.test(envExample), 'no private key');
    assert.ok(!/AIza[A-Za-z0-9_-]{10,}/.test(envExample), 'no Google API key');
    assert.ok(envExample.includes('your-project.supabase.co'), 'placeholder URL only');
  });

  await test('no invented client stores: every nexora_ key is on the known allowlist', async () => {
    const allowed = new Set([
      'nexora_brand_config',
      'nexora_dashboard_tab',
      'nexora_locale',
      'nexora_onboarding_state',
      'nexora_owner_dashboard_section', // 17.1 — owner dashboard UI preference (never identity)
      'nexora_owner_salon_ids',
      'nexora_service_form_draft',
      'nexora_site_appearance',
      'nexora_site_booking_browser',
      'nexora_site_booking_drafts',
      'nexora_site_booking_holds',
      'nexora_site_payment_records',
      'nexora_site_reviews',
      'nexora_usage_analytics', // useUsageTracking — wizard/dashboard analytics (never identity)
      'nexora_video_likes',
    ]);
    const files = (await readdir('src', { recursive: true })).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const file of files) {
      const source = await readFile(join('src', file), 'utf8');
      for (const match of source.matchAll(/nexora_[a-z0-9_]+/g)) {
        assert.ok(allowed.has(match[0]), `${file} uses unknown store key ${match[0]}`);
      }
    }
  });

  await test('one booking store, schema-only record fields (store version 1)', () => {
    resetState();
    assert.equal(PAYMENT_STORE_KEY, 'nexora_site_payment_records');
    assert.equal(PAYMENT_STORE_VERSION, 1);
    const src = readFileSync('src/lib/siteBookingPayment.ts', 'utf8');
    assert.ok(src.includes("'nexora_site_payment_records'"), 'the store key is defined once in the payment lib');
    const svc = themeServices('beauty_skin_spa')[0];
    const record = createPayAtSalonRecord({
      businessId: 'public-site', themeId: 'beauty_skin_spa', service: svc,
      bookingId: 'NX-99001', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      amounts: calculatePaymentAmounts('pay_at_salon', { price: 800, finalPrice: 800 }, undefined),
      paymentOption: 'pay_at_salon', paymentMethod: null,
      customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
    });
    const allowedFields = new Set([
      'id', 'idempotencyKey', 'businessId', 'themeId', 'customerId', 'bookingId',
      'serviceId', 'serviceName', 'services', 'dateKey', 'startMinutes', 'endMinutes',
      'baseAmount', 'amountDue', 'remainingAmount', 'currency', 'paymentOption',
      'paymentMethod', 'paymentStatus', 'bookingStatus', 'customer', 'staffId',
      'staffName', 'paymentMask', 'gatewayRef', 'failureReason', 'createdAt',
      'updatedAt', 'payAtSalon',
    ]);
    for (const key of Object.keys(record)) {
      assert.ok(allowedFields.has(key), `record field ${key} is not in the draft schema mapping`);
    }
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* K · EN / HI AND LIGHT / DARK                                        */
/* ================================================================== */
section('K. English / Hindi and light / dark modes');
{
  await test('Hindi: the booking + payment flows render with hi locale and Hindi copy', async () => {
    resetState();
    setSiteLocale('hi');
    const { utils } = await openFlow('beauty_skin_spa');
    assert.equal(utils.getByTestId('booking-flow').dataset.locale, 'hi');
    await walkToSummary(utils);
    await enterPayment(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.locale, 'hi');
    setSiteLocale('en');
    cleanup();
    window.localStorage.clear();
  });

  await test('dark mode: booking + payment surfaces restyle through the existing tokens', async () => {
    resetState();
    setSiteAppearance('dark');
    const { utils } = await openFlow('nail_lash_studio');
    assert.equal(utils.getByTestId('booking-flow').dataset.appearance, 'dark');
    await walkToSummary(utils);
    await enterPayment(utils);
    assert.equal(utils.getByTestId('payment-flow').dataset.appearance, 'dark');
    setSiteAppearance('light');
    cleanup();
    window.localStorage.clear();
  });

  await test('i18n tables complete: every booking key exists, non-empty, in EN and HI', () => {
    for (const textOf of [bookingFlowText, paymentFlowText, bookingManagementText]) {
      const en = textOf('en');
      const hi = textOf('hi');
      assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort(), 'same key set');
      let differing = 0;
      for (const key of Object.keys(en)) {
        assert.ok(String(en[key]).length > 0, `EN ${key} empty`);
        assert.ok(String(hi[key]).length > 0, `HI ${key} empty`);
        if (en[key] !== hi[key]) differing += 1;
      }
      assert.ok(differing > Object.keys(en).length * 0.5, 'HI is a real translation, not a copy');
    }
  });
}

/* ================================================================== */
/* L · RESPONSIVE STRUCTURE + PHASE 10–15 INTEGRATION                  */
/* ================================================================== */
section('L. Responsive structure + Phase 10\u201315 integration spot checks');
{
  await test('responsive structure: steppers + breakpoint-tiered markup on every theme', async () => {
    resetState();
    for (const themeId of THEME_IDS) {
      const { utils } = await openFlow(themeId);
      assert.equal(utils.getByTestId('booking-flow').dataset.theme, themeId);
      assert.ok(Boolean(utils.getByTestId('booking-stepper')), `${themeId} stepper`);
      const html = utils.container.innerHTML;
      assert.ok(/\bsm:/.test(html) && /\bmd:/.test(html), `${themeId} uses responsive utility tiers`);
      cleanup();
      window.localStorage.clear();
    }
  });

  await test('Phase 10\u201315 integration: locale/appearance stores, catalog filtering, video catalog intact', () => {
    resetState();
    // 10.2 — locale + appearance persist in their existing stores.
    setSiteLocale('hi');
    setSiteAppearance('dark');
    assert.equal(window.localStorage.getItem('nexora_locale'), 'hi');
    assert.equal(window.localStorage.getItem('nexora_site_appearance'), 'dark');
    setSiteLocale('en');
    setSiteAppearance('light');
    // 12/9 — archived + inactive services never reach the booking flow.
    const data = richData('beauty_skin_spa', {
      services: [
        ...themeServices('beauty_skin_spa'),
        { id: 'dead-1', name: 'Archived', category: 'Haircuts', description: '', price: 100, duration: 30, themeId: 'beauty_skin_spa', status: 'archived' },
        { id: 'dead-2', name: 'Inactive', category: 'Haircuts', description: '', price: 100, duration: 30, themeId: 'beauty_skin_spa', status: 'inactive' },
      ],
    });
    const services = bookingServicesForTheme(data, 'beauty_skin_spa');
    assert.equal(services.length, 2, 'only active services bookable');
    assert.equal(bookingSelectedServices(services, ['dead-1', services[0].id]).length, 1, 'dead ids resolve to nothing');
    // 16.x — business id resolution unchanged.
    assert.equal(bookingBusinessId(data), 'public-site');
    assert.deepEqual(BOOKING_THEME_IDS, THEME_IDS, 'the five themes are the five themes');
    // 15 — the video catalog is untouched by Phase 16 (50 records, 10 per theme).
    let total = 0;
    for (const themeId of THEME_IDS) {
      const catalog = themeVideoCatalog(themeId);
      assert.equal(catalog.length, 10, `${themeId} still has 10 videos`);
      total += catalog.length;
    }
    assert.equal(total, 50);
  });
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.10 final booking acceptance: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`  ✗ ${f.name}`);
  process.exitCode = 1;
} else {
  console.log('Phase 16 booking system accepted: end-to-end journeys on all five themes, theme/salon isolation, real price/duration/advance math, availability (hours, holidays, notice, spans, holds, staff), validation, payment states with no-confirm-before-payment, duplicate protection, customer/owner access boundaries, Call/WhatsApp protection, hygiene scans, EN/HI, light/dark, responsive structure and Phase 10\u201315 integration.');
}
