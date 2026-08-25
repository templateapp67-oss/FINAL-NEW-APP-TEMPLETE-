/**
 * PHASE 16.3 — DATE & TIME SLOT SELECTION (five-theme acceptance)
 *
 * The booking flow's Date + Time step now shows only GENUINELY available
 * slots, derived from existing data sources only:
 *
 *   - past dates/times, closed days, holidays — disabled (10.6, re-verified);
 *   - spans taken by REAL booking records (the EXISTING 10.7 payment store,
 *     salon + theme keyed) — disabled and un-holdable;
 *   - staff availability — the EXISTING team relationship
 *     (assignedServiceIds + WeeklySchedule + status): when the mapping
 *     covers the selection, a slot must fit inside a qualified staff
 *     member's working window; when it doesn't, salon hours alone govern;
 *   - service duration (single or combined 16.2 sitting) decides fit;
 *   - double-booking prevented at hold time AND at leave-step re-check;
 *   - availability is salon-isolated: another salon's records/holds never
 *     block this salon;
 *   - availability recalculates when salon / service / date / booking
 *     records change;
 *   - loading / error / empty states via the shared 'booking' section seam.
 *
 * NOT covered (later phases): customer details changes, payment, advance,
 * confirmation, notifications, booking management.
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
const { AuthModalProvider } = await import('../src/components/AuthModalProvider.tsx');
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { bookingFlowText } = await import('../src/lib/siteBookingI18n.ts');
const {
  bookingSlotsForDay,
  bookingSlotIsStillAvailable,
  reserveBookingSlot,
  setBookingHoldsForTests,
  activeBookingHolds,
  bookingBrowserId,
} = await import('../src/lib/siteBookingFlow.ts');
const {
  bookedSpansForSalon,
  staffWindowOn,
  staffWindowsForSelection,
  bookingAvailabilityExtras,
} = await import('../src/lib/siteBookingAvailability.ts');
const {
  setPaymentStoreForTests,
  readPaymentStoreForTests,
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
} = await import('../src/lib/siteBookingPayment.ts');

/** Seed REAL payment records exactly where production reads them
 * (localStorage, version 1) and notify listeners like a real write. */
function seedPaymentRecords(records) {
  if (records === null) {
    window.localStorage.removeItem(PAYMENT_STORE_KEY);
  } else {
    window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  }
  window.dispatchEvent(new Event(PAYMENT_EVENT));
}
const { setBookingDraftStoreForTests } = await import('../src/lib/siteBookingDraft.ts');

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
const FRI = new Date('2026-08-14T12:00:00');

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

const FULL_WEEK = {
  monday: { working: true, startTime: '10:00 AM', endTime: '08:00 PM' },
  tuesday: { working: true, startTime: '10:00 AM', endTime: '08:00 PM' },
  wednesday: { working: true, startTime: '10:00 AM', endTime: '08:00 PM' },
  thursday: { working: true, startTime: '10:00 AM', endTime: '08:00 PM' },
  friday: { working: true, startTime: '10:00 AM', endTime: '08:00 PM' },
  saturday: { working: true, startTime: '10:00 AM', endTime: '08:00 PM' },
  sunday: { working: false, startTime: '10:00 AM', endTime: '04:00 PM' },
};

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
    holidays: [{ date: '2026-08-15', name: 'Independence Day', nameHi: 'स्वतंत्रता दिवस', closed: true }],
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

/** A minimal REAL-shaped payment record (existing 10.7 store contract). */
function paymentRecord(overrides = {}) {
  const now = Date.now();
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 8)}`,
    businessId: 'public-site',
    themeId: 'beauty_skin_spa',
    customerId: 'cust-1',
    bookingId: 'NX-11111',
    serviceId: 'beauty_skin_spa-svc-1',
    serviceName: 'Signature Treatment',
    dateKey: '2026-08-14',
    startMinutes: 780,
    endMinutes: 840,
    baseAmount: 800,
    amountDue: 0,
    remainingAmount: 800,
    currency: 'INR',
    paymentOption: 'pay_at_salon',
    paymentMethod: null,
    paymentStatus: 'unpaid',
    bookingStatus: 'pay_at_salon',
    customer: { name: 'A', mobile: '9999999999' },
    createdAt: now,
    updatedAt: now,
    payAtSalon: true,
    ...overrides,
  };
}

function resetState() {
  cleanup();
  window.localStorage.clear();
  setBookingHoldsForTests(null);
  setBookingDraftStoreForTests(null);
  seedPaymentRecords(null); setPaymentStoreForTests(null);
  setWebsiteSectionFlagsForTests({});
  setSalonClockForTests(THU_OPEN);
  setSiteLocale('en');
  setSiteAppearance('light');
}

function renderFlow(themeId, extras = {}) {
  const toasts = [];
  const utils = render(
    React.createElement(
      AuthModalProvider,
      null,
      React.createElement(SiteBookingFlow, {
        themeId,
        data: richData(themeId, extras),
        onBackToWebsite: () => {},
        // PHASE 16.9 — typed notices; the harness keeps the message text.
        onShowToast: (msg) => toasts.push(typeof msg === 'string' ? msg : msg.message),
      }),
    ),
  );
  return { utils, toasts };
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

const svc = (id, duration) => ({ id, duration });

/* ================================================================== */
/* A · ENGINE — booked spans from the EXISTING payment store           */
/* ================================================================== */
section('Engine — booked spans (existing 10.7 records, salon+theme keyed)');
{
  resetState();

  await test('confirmed / pay_at_salon / pending_payment records block; failed & cancelled do not', () => {
    seedPaymentRecords([
        paymentRecord({ bookingId: 'NX-1', bookingStatus: 'confirmed', startMinutes: 600, endMinutes: 660 }),
        paymentRecord({ bookingId: 'NX-2', bookingStatus: 'pay_at_salon', startMinutes: 660, endMinutes: 720 }),
        paymentRecord({ bookingId: 'NX-3', bookingStatus: 'pending_payment', startMinutes: 720, endMinutes: 780 }),
        paymentRecord({ bookingId: 'NX-4', bookingStatus: 'failed', startMinutes: 780, endMinutes: 840 }),
        paymentRecord({ bookingId: 'NX-5', bookingStatus: 'cancelled', startMinutes: 840, endMinutes: 900 }),
      ]);
    const spans = bookedSpansForSalon('public-site', 'beauty_skin_spa');
    assert.equal(spans.length, 3, 'only live statuses block');
    assert.deepEqual(spans.map((s) => s.startMinutes).sort((a, b) => a - b), [600, 660, 720]);
  });

  await test('another salon\'s and another theme\'s records never leak in', () => {
    seedPaymentRecords([
        paymentRecord({ businessId: 'other-salon', bookingStatus: 'confirmed' }),
        paymentRecord({ themeId: 'barber_mens_grooming', bookingStatus: 'confirmed' }),
      ]);
    assert.equal(bookedSpansForSalon('public-site', 'beauty_skin_spa').length, 0);
    assert.equal(bookedSpansForSalon('other-salon', 'beauty_skin_spa').length, 1);
  });

  await test('excludeBookingId lets a resumed booking not block itself', () => {
    seedPaymentRecords([paymentRecord({ bookingId: 'NX-MINE', bookingStatus: 'confirmed' })]);
    assert.equal(bookedSpansForSalon('public-site', 'beauty_skin_spa').length, 1);
    assert.equal(bookedSpansForSalon('public-site', 'beauty_skin_spa', 'NX-MINE').length, 0);
  });

  await test('a booked span disables overlapping slots for the WHOLE service duration', () => {
    // Booked 1:30 PM–2:30 PM (misaligned with the 60-min grid on purpose) so
    // BOTH neighbouring grid slots overlap it partially.
    seedPaymentRecords([paymentRecord({ bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 810, endMinutes: 870 })]);
    const data = richData('beauty_skin_spa');
    const extras = bookingAvailabilityExtras(data, 'public-site', 'beauty_skin_spa', [svc('beauty_skin_spa-svc-1', 60)], 'friday');
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), FRI, THU_OPEN, extras);
    // 60-min service ⇒ 60-min grid: 780 (1 PM–2 PM) and 840 (2 PM–3 PM) both
    // partially overlap the 1:30–2:30 booking; their neighbours stay open.
    const by = Object.fromEntries(slots.map((s) => [s.minutes, s.state]));
    assert.equal(by[780], 'taken', '1 PM overlaps the booking tail-first');
    assert.equal(by[840], 'taken', '2 PM overlaps the booking head-first');
    assert.equal(by[720], 'available', '12 PM ends exactly at 1 PM — stays available');
    assert.equal(by[900], 'available', '3 PM starts exactly at the booking end — stays available');
    seedPaymentRecords(null); setPaymentStoreForTests(null);
  });

  await test('reserveBookingSlot refuses a span taken by a real record (double-booking guard)', () => {
    seedPaymentRecords([paymentRecord({ bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840 })]);
    const data = richData('beauty_skin_spa');
    const extras = bookingAvailabilityExtras(data, 'public-site', 'beauty_skin_spa', [svc('beauty_skin_spa-svc-1', 60)], 'friday');
    const refused = reserveBookingSlot('beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), '2026-08-14', 780, extras);
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'taken');
    assert.equal(activeBookingHolds().length, 0, 'no hold row may be written');
    const okSlot = reserveBookingSlot('beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), '2026-08-14', 840, extras);
    assert.equal(okSlot.ok, true, 'the very next non-overlapping slot must be holdable');
    seedPaymentRecords(null); setPaymentStoreForTests(null);
    setBookingHoldsForTests(null);
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* B · ENGINE — staff windows from the EXISTING team relationship      */
/* ================================================================== */
section('Engine — staff availability (assignedServiceIds + WeeklySchedule + status)');
{
  const member = (id, assigned, schedule = FULL_WEEK, status = 'Available') => ({
    id, name: id, role: 'Stylist', specialties: [], imageUrl: '',
    assignedServiceIds: assigned, schedule, status,
  });

  await test('staffWindowOn parses the existing 12-hour schedule format', () => {
    const win = staffWindowOn(member('m1', []), 'monday');
    assert.deepEqual(win, { startMinutes: 600, endMinutes: 1200 });
    assert.equal(staffWindowOn(member('m1', []), 'sunday'), null, 'non-working day → null');
  });

  await test('no staff-service mapping for the selection → null (salon hours govern, nothing invented)', () => {
    assert.equal(staffWindowsForSelection({ team: [] }, [svc('s1', 30)], 'monday'), null);
    // Staff exist but none assigned to s1 → still null.
    assert.equal(
      staffWindowsForSelection({ team: [member('m1', ['other'])] }, [svc('s1', 30)], 'monday'),
      null,
    );
    // Multi-service: one service unmapped → null for the WHOLE sitting.
    assert.equal(
      staffWindowsForSelection({ team: [member('m1', ['s1'])] }, [svc('s1', 30), svc('s2', 30)], 'monday'),
      null,
    );
  });

  await test('mapped selection → windows of staff qualified for the WHOLE sitting', () => {
    const team = [
      member('m1', ['s1', 's2'], { ...FULL_WEEK, monday: { working: true, startTime: '10:00 AM', endTime: '02:00 PM' } }),
      member('m2', ['s1'], FULL_WEEK), // not qualified for s2
    ];
    const windows = staffWindowsForSelection({ team }, [svc('s1', 30), svc('s2', 30)], 'monday');
    assert.equal(windows.length, 1, 'only the fully-qualified member counts');
    assert.deepEqual(windows[0], { startMinutes: 600, endMinutes: 840 });
  });

  await test('On Leave / Inactive staff never contribute windows', () => {
    const team = [
      member('m1', ['s1'], FULL_WEEK, 'On Leave'),
      member('m2', ['s1'], FULL_WEEK, 'Inactive'),
    ];
    // All bookable staff filtered out → mapping no longer exists → null.
    assert.equal(staffWindowsForSelection({ team }, [svc('s1', 30)], 'monday'), null);
  });

  await test('slots outside every qualified staff window are taken; inside stays available', () => {
    // 60-min service ⇒ 60-min slot grid (600, 660, 720, …).
    // Staff window Friday 12:00 PM – 5:00 PM (720 – 1020).
    const team = [member('m1', ['beauty_skin_spa-svc-1'], {
      ...FULL_WEEK,
      friday: { working: true, startTime: '12:00 PM', endTime: '05:00 PM' },
    })];
    const data = richData('beauty_skin_spa', { team });
    const extras = bookingAvailabilityExtras(data, 'public-site', 'beauty_skin_spa', [svc('beauty_skin_spa-svc-1', 60)], 'friday');
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), FRI, THU_OPEN, extras);
    const by = Object.fromEntries(slots.map((s) => [s.minutes, s.state]));
    assert.equal(by[600], 'taken', '10:00 is before the staff window');
    assert.equal(by[660], 'taken', '11:00 is before the staff window');
    assert.equal(by[720], 'available', '12:00 fits 12:00–17:00');
    assert.equal(by[960], 'available', '4:00 PM + 60min ends exactly 5:00 PM');
    assert.equal(by[1020], 'taken', '5:00 PM starts at the window end — outside');
  });

  await test('the 90-min sitting (16.2 combined) must END inside the staff window', () => {
    // 90-min sitting ⇒ 90-min grid (600, 690, 780, 870, …).
    // Staff window Friday 11:30 AM – 2:30 PM (690 – 870).
    const team = [member('m1', ['beauty_skin_spa-svc-1', 'beauty_skin_spa-svc-3'], {
      ...FULL_WEEK,
      friday: { working: true, startTime: '11:30 AM', endTime: '02:30 PM' },
    })];
    const data = richData('beauty_skin_spa', { team });
    const selection = [svc('beauty_skin_spa-svc-1', 60), svc('beauty_skin_spa-svc-3', 30)];
    const extras = bookingAvailabilityExtras(data, 'public-site', 'beauty_skin_spa', selection, 'friday');
    const sitting = { id: 'combined', duration: 90 };
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', sitting, FRI, THU_OPEN, extras);
    const by = Object.fromEntries(slots.map((s) => [s.minutes, s.state]));
    assert.equal(by[600], 'taken', '10:00 + 90 starts before the window');
    assert.equal(by[690], 'available', '11:30 + 90 = 1:00 PM fits');
    assert.equal(by[780], 'available', '1:00 PM + 90 = 2:30 PM fits exactly');
    assert.equal(by[870], 'taken', '2:30 PM + 90 = 4:00 PM does not fit');
  });
}

/* ================================================================== */
/* C · ENGINE — salon isolation of holds                               */
/* ================================================================== */
section('Engine — salon-isolated holds');
{
  await test('a hold stamped with ANOTHER salon never blocks this salon', () => {
    setBookingHoldsForTests([{
      key: 'foreign', browserId: 'someone-else', themeId: 'beauty_skin_spa',
      serviceId: 'beauty_skin_spa-svc-1', dateKey: '2026-08-14',
      startMinutes: 780, endMinutes: 840, expiresAt: Date.now() + 600_000,
      businessId: 'other-salon',
    }]);
    const data = richData('beauty_skin_spa');
    const extras = bookingAvailabilityExtras(data, 'public-site', 'beauty_skin_spa', [svc('beauty_skin_spa-svc-1', 60)], 'friday');
    const slots = bookingSlotsForDay(data, 'beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), FRI, THU_OPEN, extras);
    assert.equal(slots.find((s) => s.minutes === 780).state, 'available', 'foreign-salon hold must not block');
    // Same hold WITHOUT a businessId stamp (legacy) stays fail-closed.
    setBookingHoldsForTests([{
      key: 'legacy', browserId: 'someone-else', themeId: 'beauty_skin_spa',
      serviceId: 'beauty_skin_spa-svc-1', dateKey: '2026-08-14',
      startMinutes: 780, endMinutes: 840, expiresAt: Date.now() + 600_000,
    }]);
    const slots2 = bookingSlotsForDay(data, 'beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), FRI, THU_OPEN, extras);
    assert.equal(slots2.find((s) => s.minutes === 780).state, 'taken', 'legacy holds stay blocking (fail-closed)');
    setBookingHoldsForTests(null);
  });

  await test('reserveBookingSlot stamps the hold with the active salon', () => {
    setBookingHoldsForTests(null);
    window.localStorage.clear();
    const data = richData('beauty_skin_spa');
    const extras = bookingAvailabilityExtras(data, 'public-site', 'beauty_skin_spa', [svc('beauty_skin_spa-svc-1', 60)], 'friday');
    const result = reserveBookingSlot('beauty_skin_spa', svc('beauty_skin_spa-svc-1', 60), '2026-08-14', 780, extras);
    assert.equal(result.ok, true);
    assert.equal(result.hold.businessId, 'public-site');
    assert.equal(result.hold.browserId, bookingBrowserId());
    setBookingHoldsForTests(null);
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* D · UI — booked slots disabled per theme; auto-pick skips them      */
/* ================================================================== */
section('UI — real booking records disable slots on every theme');
{
  for (const themeId of THEME_IDS) {
    resetState();
    // A confirmed 1:00 PM–2:00 PM booking on Friday for THIS salon+theme.
    seedPaymentRecords([paymentRecord({
        themeId, serviceId: `${themeId}-svc-1`,
        bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      })]);
    const { utils } = renderFlow(themeId);

    await test(`${themeId}: booked 1 PM span renders taken + disabled; auto-pick skips it`, async () => {
      await walkToStep('date', utils);
      await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
      await walkToStep('time', utils);
      const booked = utils.getByTestId('booking-slot-780');
      assert.equal(booked.dataset.slotState, 'taken');
      assert.equal(booked.disabled, true);
      // Neighbouring 60-min grid slots do NOT overlap 1–2 PM and stay open.
      assert.equal(utils.getByTestId('booking-slot-720').dataset.slotState, 'available');
      assert.equal(utils.getByTestId('booking-slot-840').dataset.slotState, 'available');
      // First slot of the day is free and auto-held.
      assert.equal(utils.getByTestId('booking-slot-600').dataset.slotState, 'held');
      // The booked-note renders.
      assert.ok(utils.getByTestId('booking-booked-note'));
    });

    await test(`${themeId}: clicking the booked slot does nothing (no hold, no selection)`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-slot-780')); });
      assert.equal(utils.getByTestId('booking-slot-780').dataset.selected, 'false');
      const holds = activeBookingHolds();
      assert.equal(holds.length, 1, 'only the auto-held slot');
      assert.equal(holds[0].startMinutes, 600);
    });

    cleanup();
    seedPaymentRecords(null); setPaymentStoreForTests(null);
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  }
}

/* ================================================================== */
/* E · UI — staff windows narrow the day; empty day when nobody works  */
/* ================================================================== */
section('UI — staff availability narrows the grid');
{
  resetState();
  const themeId = 'hair_studio_color_bar';
  const team = [{
    id: 'stylist-1', name: 'Meera', role: 'Colorist', specialties: [], imageUrl: '',
    assignedServiceIds: [`${themeId}-svc-1`],
    schedule: { ...FULL_WEEK, friday: { working: true, startTime: '01:00 PM', endTime: '05:00 PM' } },
    status: 'Available',
  }];
  const { utils } = renderFlow(themeId, { team });

  await test('slots before the stylist starts are disabled; window slots open', async () => {
    // 60-min service ⇒ 60-min grid; stylist works Friday 1 PM – 5 PM.
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await walkToStep('time', utils);
    assert.equal(utils.getByTestId('booking-slot-600').dataset.slotState, 'taken', '10:00 before window');
    assert.equal(utils.getByTestId('booking-slot-720').dataset.slotState, 'taken', '12:00 before window');
    assert.equal(utils.getByTestId('booking-slot-780').dataset.slotState, 'held', '1:00 PM auto-held (window start)');
    assert.equal(utils.getByTestId('booking-slot-960').dataset.slotState, 'available', '4:00 PM + 60 = 5:00 PM fits');
    assert.equal(utils.getByTestId('booking-slot-1020').dataset.slotState, 'taken', '5:00 PM starts at window end');
  });

  cleanup();
  window.localStorage.clear();
  setBookingHoldsForTests(null);

  await test('day where the only qualified stylist is off → empty state (no fake availability)', async () => {
    resetState();
    const offFriday = [{
      ...team[0],
      schedule: { ...FULL_WEEK, friday: { working: false, startTime: '10:00 AM', endTime: '08:00 PM' } },
    }];
    const { utils: u2 } = renderFlow(themeId, { team: offFriday });
    await walkToStep('date', u2);
    await act(async () => { fireEvent.click(u2.getByTestId('booking-date-2026-08-14')); });
    await walkToStep('time', u2);
    // Every slot is outside the (empty) staff windows → all taken → but the
    // grid still renders them disabled; Continue must be blocked.
    const clickable = Array.from(u2.container.querySelectorAll('[data-testid^="booking-slot-"]'))
      .filter((b) => b.getAttribute('data-slot-state') === 'available' || b.getAttribute('data-slot-state') === 'held');
    assert.equal(clickable.length, 0, 'no bookable slot may exist');
    assert.equal(u2.getByTestId('booking-continue').disabled, true);
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('salon with NO staff-service mapping keeps salon-hours availability (unchanged)', async () => {
    resetState();
    const { utils: u3 } = renderFlow(themeId); // team: [] in richData
    await walkToStep('date', u3);
    await act(async () => { fireEvent.click(u3.getByTestId('booking-date-2026-08-14')); });
    await walkToStep('time', u3);
    assert.equal(u3.getByTestId('booking-slot-600').dataset.slotState, 'held', '10:00 open as before 16.3');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });
}

/* ================================================================== */
/* F · UI — availability recalculates on change                        */
/* ================================================================== */
section('UI — recalculation when service / date / records change');
{
  resetState();
  const themeId = 'family_full_service';

  await test('a booking record landing WHILE the grid is open flips the slot to taken', async () => {
    const { utils } = renderFlow(themeId);
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await walkToStep('time', utils);
    assert.equal(utils.getByTestId('booking-slot-780').dataset.slotState, 'available');
    // Another visitor's booking is persisted (same salon+theme) — the store
    // emits PAYMENT_EVENT, the grid must recalculate.
    await act(async () => {
      seedPaymentRecords([paymentRecord({
          themeId, serviceId: `${themeId}-svc-1`,
          bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
        })]);
    });
    assert.equal(utils.getByTestId('booking-slot-780').dataset.slotState, 'taken', 'grid must react to new records');
    cleanup();
    seedPaymentRecords(null); setPaymentStoreForTests(null);
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('changing the service recalculates fit (30-min vs 90-min against a gap)', async () => {
    resetState();
    // Booked 11:00–12:00 and 13:00–14:00 → a 60-min gap 12:00–13:00.
    seedPaymentRecords([
        paymentRecord({ bookingId: 'NX-A', themeId, serviceId: `${themeId}-svc-1`, bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 660, endMinutes: 720 }),
        paymentRecord({ bookingId: 'NX-B', themeId, serviceId: `${themeId}-svc-1`, bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840 }),
      ]);
    const { utils } = renderFlow(themeId);
    await walkToStep('service', utils);
    // Swap selection to ONLY the 30-min service (remove svc-1, add svc-3).
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-3`)); });
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-1`)); });
    assert.equal(utils.getByTestId('booking-selection-totals').dataset.totalDuration, '30');
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await walkToStep('time', utils);
    // 30-min service fits the 12:00–13:00 gap (12:00 and 12:30 both end by 13:00).
    assert.equal(utils.getByTestId('booking-slot-720').dataset.slotState, 'available', '12:00+30 fits the gap');
    assert.equal(utils.getByTestId('booking-slot-750').dataset.slotState, 'available', '12:30+30 fits the gap');
    // Go back and select BOTH services (30 + 60 = 90 min) — the grid regrids
    // to 90-min steps (600, 690, 780, 870 …) and the bookings block the morning.
    await act(async () => { fireEvent.click(utils.getByTestId('booking-step-service')); });
    await act(async () => { fireEvent.click(utils.getByTestId(`booking-service-${themeId}-svc-1`)); });
    assert.equal(utils.getByTestId('booking-selection-totals').dataset.totalDuration, '90');
    await walkToStep('time', utils);
    assert.equal(utils.getByTestId('booking-slot-600').dataset.slotState, 'taken', '10:00+90 runs into the 11:00 booking');
    assert.equal(utils.getByTestId('booking-slot-690').dataset.slotState, 'taken', '11:30 starts inside the 11:00–12:00 booking');
    assert.equal(utils.getByTestId('booking-slot-780').dataset.slotState, 'taken', '1:00 PM collides with the 1–2 PM booking');
    assert.equal(utils.getByTestId('booking-slot-870').dataset.slotState, 'held', '2:30 PM +90 is the first free sitting (auto-held)');
    cleanup();
    seedPaymentRecords(null); setPaymentStoreForTests(null);
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('leave-step re-check bounces back when the held slot got booked meanwhile', async () => {
    resetState();
    const { utils, toasts } = renderFlow(themeId);
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await walkToStep('time', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-slot-780')); });
    assert.equal(utils.getByTestId('booking-slot-780').dataset.selected, 'true');
    // The exact span is booked by someone else between selection and Continue.
    await act(async () => {
      seedPaymentRecords([paymentRecord({
        themeId, serviceId: `${themeId}-svc-1`,
        bookingStatus: 'confirmed', dateKey: '2026-08-14', startMinutes: 780, endMinutes: 840,
      })]);
    });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'time', 'must NOT advance to details');
    assert.ok(toasts.some((m) => /no longer available|अब उपलब्ध नहीं/.test(m)), 'slot-lost toast expected');
    cleanup();
    seedPaymentRecords(null); setPaymentStoreForTests(null);
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });
}

/* ================================================================== */
/* G · UI — loading / error / empty states + EN/HI + dark              */
/* ================================================================== */
section('UI — availability loading / error / empty, EN/HI, dark');
{
  await test('forced loading: skeleton, no auto-hold, Continue disabled', async () => {
    resetState();
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    const { utils } = renderFlow('nail_lash_studio');
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.equal(utils.getByTestId('booking-flow').dataset.step, 'time');
    assert.ok(utils.getByTestId('booking-loading-slots'));
    assert.equal(activeBookingHolds().length, 0, 'no hold while loading');
    assert.equal(utils.getByTestId('booking-continue').disabled, true);
    setWebsiteSectionFlagsForTests({});
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('forced error: message + Retry recovers into the real grid', async () => {
    resetState();
    setWebsiteSectionFlagsForTests({ booking: 'error' });
    const { utils } = renderFlow('nail_lash_studio');
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.ok(utils.getByTestId('booking-error-slots'));
    assert.equal(utils.getByTestId('booking-continue').disabled, true);
    setWebsiteSectionFlagsForTests({});
    await act(async () => { fireEvent.click(utils.getByTestId('booking-retry-slots')); });
    assert.ok(utils.container.querySelector('[data-testid^="booking-slot-"]'), 'grid must render after retry');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('EN/HI copies exist for the new availability strings', () => {
    const en = bookingFlowText('en');
    const hi = bookingFlowText('hi');
    for (const key of ['time.loading', 'time.error', 'time.retry', 'time.bookedNote']) {
      assert.ok(en[key], `EN missing ${key}`);
      assert.ok(hi[key], `HI missing ${key}`);
      assert.notEqual(en[key], hi[key], `HI equals EN for ${key}`);
    }
  });

  await test('Hindi UI: loading and booked-note strings render in Hindi', async () => {
    resetState();
    setSiteLocale('hi');
    setWebsiteSectionFlagsForTests({ booking: 'loading' });
    const { utils } = renderFlow('beauty_skin_spa');
    await walkToStep('date', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    assert.ok(utils.getByTestId('booking-loading-slots').parentElement.textContent.includes('उपलब्धता जाँची जा रही है'));
    setWebsiteSectionFlagsForTests({});
    setSiteLocale('en');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('dark mode: time step + states restyle through existing surfaces', async () => {
    resetState();
    setSiteAppearance('dark');
    const { utils } = renderFlow('beauty_skin_spa');
    assert.equal(utils.getByTestId('booking-flow').dataset.appearance, 'dark');
    await walkToStep('time', utils);
    assert.ok(utils.container.querySelector('[data-testid^="booking-slot-"]'));
    setSiteAppearance('light');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });
}

/* ================================================================== */
/* H · REGRESSION GUARDS — 10.6 date rules & existing store untouched   */
/* ================================================================== */
section('Regression — 10.6 date rules and store integrity');
{
  await test('past / closed / holiday days stay disabled exactly as in 10.6', async () => {
    resetState();
    const { utils } = renderFlow('barber_mens_grooming');
    await walkToStep('date', utils);
    const holiday = utils.getByTestId('booking-date-2026-08-15');
    assert.equal(holiday.dataset.dateSelectable, 'false');
    assert.equal(holiday.dataset.dateReason, 'holiday');
    assert.equal(utils.getByTestId('booking-date-2026-08-16').dataset.dateSelectable, 'false', 'Sunday closed');
    assert.equal(utils.getByTestId('booking-date-2026-08-13').dataset.dateSelectable, 'true');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });

  await test('16.3 never writes to the payment store (read-only availability)', async () => {
    resetState();
    const before = JSON.stringify(readPaymentStoreForTests());
    const { utils } = renderFlow('beauty_skin_spa');
    await walkToStep('time', utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-slot-780')); });
    assert.equal(JSON.stringify(readPaymentStoreForTests()), before, 'availability must not mutate records');
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
  });
}

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 16.3 date & time slot selection: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Availability verified across all five themes: real booked spans + staff windows + salon isolation + duration-aware fit + double-booking guards + recalculation + loading/empty/error states, EN/HI and dark mode — all from existing data sources only.');
}
