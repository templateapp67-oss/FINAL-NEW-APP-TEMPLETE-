/**
 * PHASE 16.7 — BOOKING MANAGEMENT (five-theme acceptance)
 *
 * Booking management over the EXISTING booking/payment/auth architecture:
 *
 *   - CUSTOMER: sees ONLY their own bookings (browser identity read inside
 *     the helper — another customer's rows structurally unreachable);
 *     status + full details; cancel own not-yet-completed booking.
 *   - OWNER: session-resolved actor (useAuth + resolveOwnerSalonId chain,
 *     same as 14.6/15.6); reads/mutations re-check permission + row
 *     ownership INSIDE the data layer; foreign salons' rows unreachable.
 *   - Status machine: pending → confirmed/cancelled; confirmed/pay-at-salon
 *     → completed/cancelled; terminal states immutable. `completed` settles
 *     the remaining balance as collected at the salon.
 *   - Details: salon, service(s), date, time, customer (per existing
 *     permissions), total, advance paid, remaining, payment status.
 *   - Loading / empty / error / cancelled states; EN/HI; light/dark.
 *
 * NOT covered (later phases): Call/WhatsApp protection, notifications,
 * final acceptance.
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
// Customer cancel uses window.confirm — accept by default in tests.
dom.window.confirm = () => true;
globalThis.confirm = dom.window.confirm;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const SiteBookingFlow = (await import('../src/components/SiteBookingFlow.tsx')).default;
const BookingManagementPanel = (await import('../src/components/BookingManagementPanel.tsx')).default;
const SiteMyBookings = (await import('../src/components/SiteMyBookings.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { setBookingHoldsForTests, bookingBrowserId } = await import('../src/lib/siteBookingFlow.ts');
const { setBookingDraftStoreForTests } = await import('../src/lib/siteBookingDraft.ts');
const {
  setPaymentStoreForTests,
  readPaymentRecords,
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
} = await import('../src/lib/siteBookingPayment.ts');
const {
  resolveBookingActor,
  bookingActorCanManage,
  bookingManageDeniedKey,
  readMyBookings,
  readSalonBookings,
  setSupabaseConfiguredForTests,
  ownerAllowedTransitions,
  ownerUpdateBookingStatus,
  customerCancelBooking,
  customerCanCancel,
  bookingServiceNames,
  bookingMoney,
  sortBookingsForList,
} = await import('../src/lib/bookingManagement.ts');
const { bookingManagementText } = await import('../src/lib/bookingManagementI18n.ts');

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

const THU_OPEN = new Date(2026, 7, 13, 11, 0, 0, 0);

const THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

const AUTHORIZED = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'resolved' } });
const OFFLINE = resolveBookingActor({ supabaseConfigured: false, userPresent: false, resolution: null });

function paymentRecord(overrides = {}) {
  const now = Date.now();
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 9)}`,
    businessId: 'public-site',
    themeId: 'beauty_skin_spa',
    customerId: 'someone-else',
    bookingId: `NX-${Math.floor(10000 + Math.random() * 89999)}`,
    serviceId: 'svc-1',
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

/** Seed records where production reads them (localStorage v1) + notify. */
function seedRecords(records) {
  if (records === null) window.localStorage.removeItem(PAYMENT_STORE_KEY);
  else window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PAYMENT_EVENT));
}

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

function richData(themeId, extras = {}) {
  return {
    ...initialData,
    templateId: themeId,
    salonName: `${themeId} Test Salon`,
    phone: '+91 99999 00000',
    address: { fullAddress: '12 MG Road, Kota, Rajasthan', latitude: null, longitude: null },
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    openingHours: weekHours(),
    holidays: [],
    bookingRules: {
      minNotice: '1 hour', maxAdvance: '30 days', bufferTime: 'No buffer',
      allowStaffSelection: true, advanceDepositPercentage: 25,
    },
    services: [{
      id: `${themeId}-svc-1`, name: 'Signature Treatment', category: 'Haircuts',
      description: '', price: 800, duration: 60, themeId, status: 'active',
    }],
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
}

// PHASE 16.9 — the toast seam now carries typed notices; harnesses keep
// asserting on the message text only.
const toastText = (m) => (typeof m === 'string' ? m : m.message);

function renderOwnerPanel(actor, businessId, themeId) {
  const toasts = [];
  const utils = render(React.createElement(BookingManagementPanel, {
    actor, businessId, themeId, onShowToast: (m) => toasts.push(toastText(m)),
  }));
  return { utils, toasts };
}

function renderMyBookings(themeId, businessId, extras = {}) {
  const toasts = [];
  const utils = render(React.createElement(SiteMyBookings, {
    themeId, data: richData(themeId, extras), businessId, onShowToast: (m) => toasts.push(toastText(m)),
  }));
  return { utils, toasts };
}

/* ================================================================== */
/* A · ACTOR — session → permission mapping (existing chain)           */
/* ================================================================== */
section('Actor — existing auth/ownership chain drives the permission');
{
  await test('resolution statuses map exactly like 14.6/15.6 management layers', () => {
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

  await test('denied permissions map to localized copy keys (EN + HI exist)', () => {
    const en = bookingManagementText('en');
    const hi = bookingManagementText('hi');
    for (const p of ['not-authenticated', 'no-ownership', 'ambiguous', 'permission-denied', 'error']) {
      const key = bookingManageDeniedKey(p);
      assert.ok(key, `${p} needs a denial key`);
      assert.ok(en[key], `EN missing ${key}`);
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key]);
    }
    assert.equal(bookingManageDeniedKey('authorized'), null);
    assert.equal(bookingManageDeniedKey('not-configured'), null);
  });
}

/* ================================================================== */
/* B · CUSTOMER SCOPE — own rows only                                  */
/* ================================================================== */
section('Customer — sees only their own bookings');
{
  resetState();

  await test('readMyBookings returns rows with THIS browser identity only', () => {
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ bookingId: 'NX-MINE-1', customerId: me }),
      paymentRecord({ bookingId: 'NX-MINE-2', customerId: me, themeId: 'barber_mens_grooming' }),
      paymentRecord({ bookingId: 'NX-THEIRS', customerId: 'other-browser' }),
    ]);
    const mine = readMyBookings();
    assert.deepEqual(mine.map((r) => r.bookingId).sort(), ['NX-MINE-1', 'NX-MINE-2']);
    seedRecords(null);
  });

  await test('customerCancelBooking refuses a foreign customer\'s booking', () => {
    seedRecords([paymentRecord({ bookingId: 'NX-THEIRS', customerId: 'other-browser' })]);
    const result = customerCancelBooking('public-site', 'beauty_skin_spa', 'NX-THEIRS');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not-found');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'row untouched');
    seedRecords(null);
  });

  await test('customer can cancel their own active booking; terminal rows refuse', () => {
    const me = bookingBrowserId();
    seedRecords([
      paymentRecord({ bookingId: 'NX-ACT', customerId: me, bookingStatus: 'confirmed' }),
      paymentRecord({ bookingId: 'NX-DONE', customerId: me, bookingStatus: 'completed' }),
    ]);
    const ok = customerCancelBooking('public-site', 'beauty_skin_spa', 'NX-ACT');
    assert.equal(ok.ok, true);
    assert.equal(ok.record.bookingStatus, 'cancelled');
    assert.equal(ok.record.failureReason, 'Cancelled by customer');
    const refused = customerCancelBooking('public-site', 'beauty_skin_spa', 'NX-DONE');
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'invalid-transition');
    seedRecords(null);
  });

  await test('customerCanCancel matrix matches the machine', () => {
    for (const [status, expected] of [
      ['pending_payment', true], ['confirmed', true], ['pay_at_salon', true],
      ['completed', false], ['cancelled', false], ['failed', false],
    ]) {
      assert.equal(customerCanCancel({ bookingStatus: status }), expected, status);
    }
  });
}

/* ================================================================== */
/* C · OWNER SCOPE — own salon only, checks inside the data layer      */
/* ================================================================== */
section('Owner — own salon only; data-layer enforcement');
{
  resetState();

  await test('readSalonBookings returns only the tenant\'s rows', () => {
    seedRecords([
      paymentRecord({ bookingId: 'NX-A', businessId: 'salon-a' }),
      paymentRecord({ bookingId: 'NX-B', businessId: 'salon-b' }),
      paymentRecord({ bookingId: 'NX-A2', businessId: 'salon-a', themeId: 'barber_mens_grooming' }),
    ]);
    const result = readSalonBookings(AUTHORIZED, 'salon-a', 'beauty_skin_spa');
    assert.equal(result.ok, true);
    assert.deepEqual(result.records.map((r) => r.bookingId), ['NX-A'], 'other salon + other theme filtered');
    seedRecords(null);
  });

  await test('an unauthorized actor gets a refusal, never data', () => {
    seedRecords([paymentRecord({ businessId: 'salon-a' })]);
    for (const status of ['not-authenticated', 'no-ownership', 'ambiguous', 'permission-denied', 'error']) {
      const actor = resolveBookingActor({
        supabaseConfigured: true,
        userPresent: status !== 'not-authenticated',
        resolution: status === 'not-authenticated' ? null : { status: status === 'no-ownership' ? 'no-membership' : status },
      });
      const result = readSalonBookings(actor, 'salon-a', 'beauty_skin_spa');
      assert.equal(result.ok, false, `${status} must refuse`);
      assert.equal('records' in result, false, 'no records field on refusal');
    }
    seedRecords(null);
  });

  await test('ownerUpdateBookingStatus refuses an unauthorized actor BEFORE touching data', () => {
    seedRecords([paymentRecord({ bookingId: 'NX-X', businessId: 'salon-a', bookingStatus: 'pending_payment', paymentStatus: 'pending' })]);
    const denied = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'no-membership' } });
    const result = ownerUpdateBookingStatus(denied, 'salon-a', 'beauty_skin_spa', 'NX-X', 'confirmed');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-ownership');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'pending_payment', 'row untouched');
    seedRecords(null);
  });

  await test('owner cannot reach another salon\'s booking even when authorized', () => {
    seedRecords([paymentRecord({ bookingId: 'NX-FOREIGN', businessId: 'salon-b' })]);
    const result = ownerUpdateBookingStatus(AUTHORIZED, 'salon-a', 'beauty_skin_spa', 'NX-FOREIGN', 'completed');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not-found', 'foreign row is structurally invisible');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'row untouched');
    seedRecords(null);
  });
}

/* ================================================================== */
/* D · STATUS MACHINE                                                  */
/* ================================================================== */
section('Status machine — existing statuses, legal transitions only');
{
  resetState();

  await test('transition matrix: pending→confirm/cancel; confirmed/pay-at-salon→complete/cancel; terminal→none', () => {
    assert.deepEqual(ownerAllowedTransitions('pending_payment'), ['confirmed', 'cancelled']);
    assert.deepEqual(ownerAllowedTransitions('confirmed'), ['completed', 'cancelled']);
    assert.deepEqual(ownerAllowedTransitions('pay_at_salon'), ['completed', 'cancelled']);
    assert.deepEqual(ownerAllowedTransitions('completed'), []);
    assert.deepEqual(ownerAllowedTransitions('cancelled'), []);
    assert.deepEqual(ownerAllowedTransitions('failed'), []);
  });

  await test('illegal transitions are refused (completed→confirmed, pending→completed, …)', () => {
    seedRecords([
      paymentRecord({ bookingId: 'NX-P', bookingStatus: 'pending_payment', paymentStatus: 'pending' }),
      paymentRecord({ bookingId: 'NX-D', bookingStatus: 'completed' }),
    ]);
    const jump = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-P', 'completed');
    assert.equal(jump.ok, false);
    assert.equal(jump.reason, 'invalid-transition', 'pending cannot jump to completed');
    const revive = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-D', 'confirmed');
    assert.equal(revive.ok, false);
    assert.equal(revive.reason, 'invalid-transition', 'completed is terminal');
    seedRecords(null);
  });

  await test('completing settles the remaining balance at the salon (16.5 money snapshot)', () => {
    seedRecords([paymentRecord({ bookingId: 'NX-C', bookingStatus: 'confirmed', paymentStatus: 'paid', baseAmount: 2300, amountDue: 575, remainingAmount: 1725 })]);
    const result = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-C', 'completed');
    assert.equal(result.ok, true);
    assert.equal(result.record.bookingStatus, 'completed');
    assert.equal(result.record.paymentStatus, 'paid');
    assert.equal(result.record.amountDue, 2300, 'full amount collected');
    assert.equal(result.record.remainingAmount, 0);
    seedRecords(null);
  });

  await test('owner cancel keeps paid amounts (no invented refunds)', () => {
    seedRecords([paymentRecord({ bookingId: 'NX-K', bookingStatus: 'confirmed', paymentStatus: 'paid' })]);
    const result = ownerUpdateBookingStatus(AUTHORIZED, 'public-site', 'beauty_skin_spa', 'NX-K', 'cancelled');
    assert.equal(result.ok, true);
    assert.equal(result.record.bookingStatus, 'cancelled');
    assert.equal(result.record.paymentStatus, 'paid', 'paid stays paid — refunds are a later, real-gateway concern');
    assert.equal(result.record.failureReason, 'Cancelled by salon');
    seedRecords(null);
  });
}

/* ================================================================== */
/* E · DISPLAY HELPERS                                                 */
/* ================================================================== */
section('Display — details fields derive from the persisted record');
{
  await test('bookingServiceNames: 16.5 lines or the single service', () => {
    assert.deepEqual(bookingServiceNames({ serviceName: 'Solo', services: undefined }), ['Solo']);
    assert.deepEqual(
      bookingServiceNames({ serviceName: 'A', services: [{ serviceId: '1', serviceName: 'A', price: 1, durationMinutes: 1 }, { serviceId: '2', serviceName: 'B', price: 2, durationMinutes: 2 }] }),
      ['A', 'B'],
    );
  });

  await test('bookingMoney: paid advance vs unpaid rows', () => {
    const paid = bookingMoney(paymentRecord({ paymentStatus: 'paid', baseAmount: 800, amountDue: 200, remainingAmount: 600 }));
    assert.deepEqual(paid, { total: 800, advancePaid: 200, remaining: 600, paymentStatus: 'paid' });
    const unpaid = bookingMoney(paymentRecord({ paymentStatus: 'unpaid', paymentOption: 'pay_at_salon', baseAmount: 800, amountDue: 0, remainingAmount: 800 }));
    assert.equal(unpaid.advancePaid, 0);
    assert.equal(unpaid.remaining, 800, 'nothing paid yet → whole amount remains');
  });

  await test('sortBookingsForList groups pending → active → completed → terminal', () => {
    const list = sortBookingsForList([
      paymentRecord({ bookingId: 'C', bookingStatus: 'cancelled', createdAt: 4 }),
      paymentRecord({ bookingId: 'A', bookingStatus: 'confirmed', createdAt: 3 }),
      paymentRecord({ bookingId: 'P', bookingStatus: 'pending_payment', createdAt: 1 }),
      paymentRecord({ bookingId: 'D', bookingStatus: 'completed', createdAt: 2 }),
    ]);
    assert.deepEqual(list.map((r) => r.bookingId), ['P', 'A', 'D', 'C']);
  });
}

/* ================================================================== */
/* F · OWNER PANEL UI                                                  */
/* ================================================================== */
section('Owner panel UI — details, actions, isolation, states');
{
  await test('authorized owner sees rows with every required field', async () => {
    resetState();
    seedRecords([paymentRecord({
      bookingId: 'NX-11111',
      services: [
        { serviceId: 's1', serviceName: 'Signature Treatment', price: 800, durationMinutes: 60 },
        { serviceId: 's2', serviceName: 'Deep Ritual', price: 1500, durationMinutes: 90 },
      ],
      baseAmount: 2300, amountDue: 575, remainingAmount: 1725,
    })]);
    const { utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    const row = utils.getByTestId('owner-booking-NX-11111');
    for (const needle of [
      'Signature Treatment + Deep Ritual', 'Asha Verma', '9876543210',
      '₹2,300', '₹575', '₹1,725', 'Paid', 'NX-11111',
    ]) {
      assert.ok(row.textContent.includes(needle), `missing ${needle}`);
    }
    assert.equal(utils.getByTestId('owner-booking-status-NX-11111').textContent, 'Confirmed');
    cleanup(); seedRecords(null);
  });

  await test('actions follow the machine and never confirm before required payment succeeds', async () => {
    resetState();
    seedRecords([
      paymentRecord({ bookingId: 'NX-PEND', bookingStatus: 'pending_payment', paymentStatus: 'pending' }),
      paymentRecord({ bookingId: 'NX-PAID', bookingStatus: 'pending_payment', paymentStatus: 'paid' }),
      paymentRecord({ bookingId: 'NX-CONF', bookingStatus: 'confirmed' }),
      paymentRecord({ bookingId: 'NX-GONE', bookingStatus: 'cancelled' }),
    ]);
    const { utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    assert.equal(utils.container.querySelector('[data-testid="owner-booking-confirm-NX-PEND"]'), null);
    assert.ok(utils.getByTestId('owner-booking-confirm-NX-PAID'));
    assert.ok(utils.getByTestId('owner-booking-cancel-NX-PEND'));
    assert.equal(utils.container.querySelector('[data-testid="owner-booking-complete-NX-PEND"]'), null);
    assert.ok(utils.getByTestId('owner-booking-complete-NX-CONF'));
    assert.equal(utils.container.querySelector('[data-testid="owner-booking-confirm-NX-CONF"]'), null);
    assert.equal(utils.container.querySelector('[data-testid^="owner-booking-confirm-NX-GONE"]'), null);
    assert.equal(utils.container.querySelector('[data-testid^="owner-booking-complete-NX-GONE"]'), null);
    assert.equal(utils.container.querySelector('[data-testid^="owner-booking-cancel-NX-GONE"]'), null);
    cleanup(); seedRecords(null);
  });

  await test('clicking Complete updates the row + money live', async () => {
    resetState();
    seedRecords([paymentRecord({ bookingId: 'NX-CC', bookingStatus: 'confirmed' })]);
    const { utils, toasts } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    await act(async () => { fireEvent.click(utils.getByTestId('owner-booking-complete-NX-CC')); });
    assert.equal(utils.getByTestId('owner-booking-status-NX-CC').textContent, 'Completed');
    assert.ok(utils.getByTestId('owner-booking-NX-CC').textContent.includes('₹0'), 'remaining collapses to 0');
    assert.ok(toasts.some((m) => m.includes('updated')), 'success toast');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'completed');
    cleanup(); seedRecords(null);
  });

  await test('foreign salon rows never render in the panel', async () => {
    resetState();
    seedRecords([
      paymentRecord({ bookingId: 'NX-MINE', businessId: 'public-site' }),
      paymentRecord({ bookingId: 'NX-OTHER', businessId: 'another-salon' }),
    ]);
    const { utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    assert.ok(utils.getByTestId('owner-booking-NX-MINE'));
    assert.equal(utils.container.querySelector('[data-testid="owner-booking-NX-OTHER"]'), null);
    cleanup(); seedRecords(null);
  });

  await test('denied actor renders the denial — never an empty list that looks fine', async () => {
    resetState();
    seedRecords([paymentRecord({})]);
    const denied = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'no-membership' } });
    const { utils } = renderOwnerPanel(denied, 'public-site', 'beauty_skin_spa');
    assert.ok(utils.getByTestId('booking-management-denied'));
    assert.ok(utils.getByTestId('booking-management-denied').textContent.includes('not linked to a salon'));
    assert.equal(utils.container.querySelector('[data-testid^="owner-booking-"]'), null);
    cleanup(); seedRecords(null);
  });

  await test('status filter narrows the list; cancelled filter shows cancelled rows', async () => {
    resetState();
    seedRecords([
      paymentRecord({ bookingId: 'NX-1', bookingStatus: 'pending_payment', paymentStatus: 'pending' }),
      paymentRecord({ bookingId: 'NX-2', bookingStatus: 'confirmed' }),
      paymentRecord({ bookingId: 'NX-3', bookingStatus: 'cancelled' }),
    ]);
    const { utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    assert.equal(utils.container.querySelectorAll('[data-testid^="owner-booking-NX-"]').length, 3);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-filter-cancelled')); });
    const rows = utils.container.querySelectorAll('[data-testid^="owner-booking-NX-"]');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dataset.status, 'cancelled');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-filter-all')); });
    assert.equal(utils.container.querySelectorAll('[data-testid^="owner-booking-NX-"]').length, 3);
    cleanup(); seedRecords(null);
  });

  await test('loading / error / empty states via the shared seam', async () => {
    resetState();
    // Online mode: without it, the Phase 17.1 mock-bookings preview fills the
    // empty store, so the true empty state would never render.
    setSupabaseConfiguredForTests(true);
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    let { utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    assert.ok(utils.getByTestId('booking-management-loading'));
    cleanup();
    setWebsiteSectionFlagsForTests({ booking: 'error' });
    ({ utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa'));
    assert.ok(utils.getByTestId('booking-management-error'));
    setWebsiteSectionFlagsForTests({});
    await act(async () => { fireEvent.click(utils.getByTestId('booking-management-retry')); });
    assert.ok(utils.getByTestId('booking-management-empty'), 'recovers into the (empty) list');
    setSupabaseConfiguredForTests(null);
    cleanup();
  });

  await test('offline draft (not-configured) keeps owner-tier management (14.6/15.6 rule)', async () => {
    resetState();
    seedRecords([paymentRecord({ bookingId: 'NX-OFF', bookingStatus: 'confirmed' })]);
    const { utils } = renderOwnerPanel(OFFLINE, 'public-site', 'beauty_skin_spa');
    assert.ok(utils.getByTestId('owner-booking-NX-OFF'));
    await act(async () => { fireEvent.click(utils.getByTestId('owner-booking-complete-NX-OFF')); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'completed');
    cleanup(); seedRecords(null);
  });
}

/* ================================================================== */
/* G · CUSTOMER UI (My Bookings inside the flow, all five themes)      */
/* ================================================================== */
section('Customer UI — My Bookings per theme');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: own booking renders with status + details; foreign rows absent`, async () => {
      resetState();
      const me = bookingBrowserId();
      seedRecords([
        paymentRecord({ bookingId: 'NX-ME', customerId: me, themeId, serviceName: 'Signature Treatment' }),
        paymentRecord({ bookingId: 'NX-YOU', customerId: 'other-browser', themeId }),
        paymentRecord({ bookingId: 'NX-ELSE', customerId: me, themeId: themeId === 'barber_mens_grooming' ? 'beauty_skin_spa' : 'barber_mens_grooming' }),
      ]);
      const { utils } = renderMyBookings(themeId, 'public-site');
      const card = utils.getByTestId('my-booking-NX-ME');
      assert.ok(card.textContent.includes('Signature Treatment'));
      assert.ok(card.textContent.includes(`${themeId} Test Salon`), 'salon name missing');
      assert.ok(card.textContent.includes('₹800'), 'total missing');
      assert.ok(card.textContent.includes('₹200'), 'advance missing');
      assert.ok(card.textContent.includes('₹600'), 'remaining missing');
      assert.equal(utils.getByTestId('my-booking-status-NX-ME').textContent, 'Confirmed');
      assert.equal(utils.container.querySelector('[data-testid="my-booking-NX-YOU"]'), null, 'foreign customer leaked');
      assert.equal(utils.container.querySelector('[data-testid="my-booking-NX-ELSE"]'), null, 'foreign theme leaked');
      cleanup(); seedRecords(null);
    });
  }

  await test('customer cancel asks for confirmation, then flips the row (and persists)', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-CXL', customerId: me })]);
    const { utils, toasts } = renderMyBookings('beauty_skin_spa', 'public-site');
    // PHASE 16.9 — the first click opens the inline confirmation; the
    // booking is untouched until the explicit confirm button runs.
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-NX-CXL')); });
    assert.ok(Boolean(utils.getByTestId('my-booking-cancel-confirm-NX-CXL')), 'confirmation must appear');
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'nothing cancelled yet');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-yes-NX-CXL')); });
    assert.equal(utils.getByTestId('my-booking-status-NX-CXL').textContent, 'Cancelled');
    assert.equal(utils.container.querySelector('[data-testid="my-booking-cancel-NX-CXL"]'), null, 'no second cancel');
    assert.ok(toasts.some((m) => m.includes('cancelled')));
    assert.equal(readPaymentRecords()[0].bookingStatus, 'cancelled');
    cleanup(); seedRecords(null);
  });

  await test('customer cancel confirmation can be dismissed without cancelling', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-KEEP', customerId: me })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-NX-KEEP')); });
    await act(async () => { fireEvent.click(utils.getByTestId('my-booking-cancel-keep-NX-KEEP')); });
    assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed', 'keep leaves the booking active');
    assert.equal(utils.container.querySelector('[data-testid="my-booking-cancel-confirm-NX-KEEP"]'), null);
    assert.ok(Boolean(utils.getByTestId('my-booking-cancel-NX-KEEP')), 'cancel still offered');
    cleanup(); seedRecords(null);
  });

  await test('no bookings → the block renders nothing (salon step unchanged)', async () => {
    resetState();
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    assert.equal(utils.container.querySelector('[data-testid="my-bookings"]'), null);
    cleanup();
  });

  await test('the salon step of the booking flow hosts My Bookings for returning customers', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-STEP', customerId: me, themeId: 'family_full_service' })]);
    const utils = render(React.createElement(SiteBookingFlow, {
      themeId: 'family_full_service',
      data: richData('family_full_service'),
      onBackToWebsite: () => {},
    }));
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'salon');
    assert.ok(utils.getByTestId('my-bookings'));
    assert.ok(utils.getByTestId('my-booking-NX-STEP'));
    cleanup(); seedRecords(null);
    window.localStorage.clear();
    setBookingDraftStoreForTests(null);
  });

  await test('customer loading / error states via the shared seam', async () => {
    resetState();
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-ST', customerId: me })]);
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    let { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    assert.ok(utils.getByTestId('my-bookings-loading'));
    cleanup();
    setWebsiteSectionFlagsForTests({ booking: 'error' });
    ({ utils } = renderMyBookings('beauty_skin_spa', 'public-site'));
    assert.ok(utils.getByTestId('my-bookings-error'));
    setWebsiteSectionFlagsForTests({});
    await act(async () => { fireEvent.click(utils.getByTestId('my-bookings-retry')); });
    assert.ok(utils.getByTestId('my-booking-NX-ST'), 'recovers into the list');
    cleanup(); seedRecords(null);
  });
}

/* ================================================================== */
/* H · EN/HI + DARK MODE                                               */
/* ================================================================== */
section('EN/HI + dark mode');
{
  await test('every status/payment/field label exists in EN and HI and differs', () => {
    const en = bookingManagementText('en');
    const hi = bookingManagementText('hi');
    const keys = Object.keys(en);
    assert.ok(keys.length >= 40, 'expected full key set');
    for (const key of keys) {
      assert.ok(hi[key], `HI missing ${key}`);
      if (key !== 'details.emailPlaceholder') assert.notEqual(en[key], hi[key], `HI equals EN for ${key}`);
    }
  });

  await test('Hindi UI: customer card renders Hindi labels', async () => {
    resetState();
    setSiteLocale('hi');
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-HI', customerId: me })]);
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    const block = utils.getByTestId('my-bookings');
    assert.ok(block.textContent.includes('मेरी बुकिंग'), 'Hindi title missing');
    assert.ok(block.textContent.includes('पक्की'), 'Hindi status missing');
    assert.ok(block.textContent.includes('कुल राशि'), 'Hindi total label missing');
    setSiteLocale('en');
    cleanup(); seedRecords(null);
  });

  await test('Hindi UI: owner panel renders Hindi labels + actions', async () => {
    resetState();
    setSiteLocale('hi');
    seedRecords([paymentRecord({ bookingId: 'NX-HIO', bookingStatus: 'confirmed' })]);
    const { utils } = renderOwnerPanel(AUTHORIZED, 'public-site', 'beauty_skin_spa');
    assert.ok(utils.getByTestId('booking-management').textContent.includes('सैलून बुकिंग'));
    assert.ok(utils.getByTestId('owner-booking-complete-NX-HIO').textContent.includes('पूर्ण करें'));
    setSiteLocale('en');
    cleanup(); seedRecords(null);
  });

  await test('dark mode: My Bookings restyles through the existing booking surfaces', async () => {
    resetState();
    setSiteAppearance('dark');
    const me = bookingBrowserId();
    seedRecords([paymentRecord({ bookingId: 'NX-DK', customerId: me })]);
    const light = (() => {
      setSiteAppearance('light');
      const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
      const bg = utils.getByTestId('my-bookings').style.backgroundColor;
      cleanup();
      return bg;
    })();
    setSiteAppearance('dark');
    const { utils } = renderMyBookings('beauty_skin_spa', 'public-site');
    assert.notEqual(utils.getByTestId('my-bookings').style.backgroundColor, light, 'dark surface must differ');
    setSiteAppearance('light');
    cleanup(); seedRecords(null);
  });
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.7 booking management: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Booking management verified: customer own-rows-only view + cancel, owner own-salon-only panel with the existing status machine (pending/confirmed/completed/cancelled), data-layer enforcement, full detail fields, loading/empty/error/cancelled states, EN/HI + dark mode across all five themes.');
}
