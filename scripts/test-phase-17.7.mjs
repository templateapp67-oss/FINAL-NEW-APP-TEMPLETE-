/** PHASE 17.7 — Calendar / Schedule acceptance. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { render, fireEvent, cleanup, act } = await import('@testing-library/react');
const {
  addLocalCalendarDays,
  groupScheduleByDates,
  initialScheduleDate,
  moveScheduleDate,
  parseScheduleDateKey,
  readOwnerSchedule,
  scheduleDatesForView,
  schedulePeriodState,
  scheduleWeekStart,
  sortScheduleAppointments,
  toScheduleAppointment,
} = await import('../src/lib/ownerCalendarSchedule.ts');
const { bookingStatusBlocksAvailability, bookedSpansForSalon } = await import('../src/lib/siteBookingAvailability.ts');
const { resolveBookingActor, setSupabaseConfiguredForTests } = await import('../src/lib/bookingManagement.ts');
const { PAYMENT_STORE_KEY, PAYMENT_EVENT } = await import('../src/lib/siteBookingPayment.ts');
const { setSalonClockForTests, localDateKey } = await import('../src/lib/salonStatus.ts');
const { default: OwnerCalendarSchedule } = await import('../src/components/OwnerCalendarSchedule.tsx');
const { default: OwnerDashboard } = await import('../src/components/OwnerDashboard.tsx');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function section(name) { console.log(`\n■ ${name}`); }

const BUSINESS = 'org-owner-calendar';
const SALON = 'salon-owner-calendar';
const OTHER = 'org-foreign-calendar';
const THEME = 'beauty_skin_spa';
const NOW = new Date(2026, 7, 17, 9, 0, 0, 0); // Monday
const AUTHORIZED = resolveBookingActor({
  supabaseConfigured: true,
  userPresent: true,
  resolution: { status: 'resolved' },
  allowedBusinessIds: [BUSINESS, SALON],
});
const DENIED = resolveBookingActor({
  supabaseConfigured: true,
  userPresent: true,
  resolution: { status: 'no-membership' },
});

let sequence = 0;
function record(overrides = {}) {
  sequence += 1;
  const timestamp = 1_700_000_000_000 + sequence * 1000;
  return {
    id: `record-${sequence}`,
    idempotencyKey: `key-${sequence}`,
    businessId: BUSINESS,
    themeId: THEME,
    customerId: `customer-${sequence}`,
    bookingId: `booking-${sequence}`,
    serviceId: `service-${sequence}`,
    serviceName: `Service ${sequence}`,
    dateKey: '2026-08-17',
    startMinutes: 600,
    endMinutes: 660,
    baseAmount: 1000,
    amountDue: 250,
    remainingAmount: 750,
    currency: 'INR',
    paymentOption: 'advance',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    customer: { name: `Customer ${sequence}`, mobile: '9000000000', email: '' },
    createdAt: timestamp,
    updatedAt: timestamp,
    payAtSalon: false,
    ...overrides,
  };
}
function seed(records) {
  localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PAYMENT_EVENT));
}
function reset() {
  cleanup();
  localStorage.clear();
  sequence = 0;
  setSalonClockForTests(NOW);
  setSupabaseConfiguredForTests(true);
  setSiteLocale('en');
  setSiteAppearance('light');
}
const palette = {
  panel: '#fff', panelSoft: '#f8f7f5', line: '#ddd', text: '#111', muted: '#666',
  accent: '#ac0053', accentSoft: '#fce7f3', accentText: '#fff',
};
async function renderCalendar(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerCalendarSchedule, {
      actor: AUTHORIZED,
      businessIds: [BUSINESS, SALON],
      themeIds: [THEME],
      palette,
      ...props,
    }));
  });
  return utils;
}

section('Existing schema, ownership and isolation');
await test('calendar reads the existing tenant-keyed booking layer and creates no store', () => {
  const source = fs.readFileSync('src/lib/ownerCalendarSchedule.ts', 'utf8');
  assert.match(source, /readSalonBookings/);
  assert.ok(!/window\.localStorage|\.from\(['"]|create table|insert into/i.test(source));
});
await test('existing bookings already carry date, start, end, service and statuses', () => {
  const schema = fs.readFileSync('supabase/migrations/20260811000801_m08_customers_bookings.sql', 'utf8');
  for (const field of ['appointment_date', 'start_time', 'end_time', 'service_name_snapshot', 'booking_status', 'payment_status']) {
    assert.ok(schema.includes(field), `missing existing ${field}`);
  }
});
await test('dashboard ownership remains organization_members to salons.organization_id', () => {
  const owner = fs.readFileSync('src/lib/ownerSalon.ts', 'utf8');
  const dashboard = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
  assert.match(owner, /organization_members/);
  assert.match(owner, /organization_id/);
  assert.match(dashboard, /allowedBusinessIds:\s*tenant\?\.businessIds/);
  assert.match(dashboard, /OwnerCalendarSchedule/);
});
await test('17.7 does not use staff membership for ownership', () => {
  for (const file of ['src/lib/ownerCalendarSchedule.ts', 'src/components/OwnerCalendarSchedule.tsx']) {
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(source.includes('job_salon_members'), false);
  }
});
await test("another salon's appointment is never returned", () => {
  reset(); seed([
    record({ bookingId: 'mine' }),
    record({ businessId: OTHER, bookingId: 'foreign', customer: { name: 'Private Person', mobile: '9888888888' } }),
  ]);
  const result = readOwnerSchedule(AUTHORIZED, [BUSINESS, SALON], [THEME]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.appointments.map((item) => item.bookingId), ['mine']);
  assert.ok(!JSON.stringify(result).includes('Private Person'));
});
await test('crafted foreign tenant and unauthorized reads are refused', () => {
  assert.deepEqual(readOwnerSchedule(AUTHORIZED, [OTHER], [THEME]), { ok: false, reason: 'permission-denied' });
  const denied = readOwnerSchedule(DENIED, [BUSINESS], [THEME]);
  assert.equal(denied.ok, false);
  assert.equal('appointments' in denied, false);
});
await test('an empty real store produces no appointments', () => {
  reset(); seed([]);
  const result = readOwnerSchedule(AUTHORIZED, [BUSINESS], [THEME]);
  assert.deepEqual(result, { ok: true, appointments: [] });
});

section('Day/week date logic');
await test('initial date and date parsing use salon-local calendar values', () => {
  assert.equal(localDateKey(initialScheduleDate(NOW)), '2026-08-17');
  assert.equal(localDateKey(parseScheduleDateKey('2026-08-20')), '2026-08-20');
  assert.equal(parseScheduleDateKey('bad'), null);
});
await test('week view is Monday-first and contains exactly seven local dates', () => {
  const thursday = new Date(2026, 7, 20);
  assert.equal(localDateKey(scheduleWeekStart(thursday)), '2026-08-17');
  assert.deepEqual(scheduleDatesForView(thursday, 'week').map(localDateKey), [
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23',
  ]);
});
await test('day view contains only the selected local day', () => {
  assert.deepEqual(scheduleDatesForView(new Date(2026, 7, 20), 'day').map(localDateKey), ['2026-08-20']);
});
await test('previous/next moves one day or one week without UTC conversion', () => {
  const date = new Date(2026, 7, 17);
  assert.equal(localDateKey(moveScheduleDate(date, 'day', 1)), '2026-08-18');
  assert.equal(localDateKey(moveScheduleDate(date, 'week', 1)), '2026-08-24');
  assert.equal(localDateKey(addLocalCalendarDays(date, -1)), '2026-08-16');
  assert.equal(fs.readFileSync('src/lib/ownerCalendarSchedule.ts', 'utf8').includes('toISOString'), false);
});
await test('grouping emits only requested dates and sorts appointments by real time', () => {
  const rows = [
    toScheduleAppointment(record({ bookingId: 'late', dateKey: '2026-08-17', startMinutes: 900, endMinutes: 960 })),
    toScheduleAppointment(record({ bookingId: 'tomorrow', dateKey: '2026-08-18', startMinutes: 600, endMinutes: 660 })),
    toScheduleAppointment(record({ bookingId: 'early', dateKey: '2026-08-17', startMinutes: 540, endMinutes: 600 })),
  ];
  const days = groupScheduleByDates(rows, [new Date(2026, 7, 17), new Date(2026, 7, 18)]);
  assert.deepEqual(days[0].appointments.map((item) => item.bookingId), ['early', 'late']);
  assert.deepEqual(days[1].appointments.map((item) => item.bookingId), ['tomorrow']);
});

section('Existing booking and availability semantics');
await test('status periods distinguish booked, cancelled and completed', () => {
  for (const status of ['pending_payment', 'confirmed', 'pay_at_salon']) assert.equal(schedulePeriodState(status), 'booked');
  for (const status of ['cancelled', 'failed']) assert.equal(schedulePeriodState(status), 'cancelled');
  assert.equal(schedulePeriodState('completed'), 'completed');
});
await test('calendar reuses the exact Phase 16 blocking predicate', () => {
  assert.equal(bookingStatusBlocksAvailability('confirmed'), true);
  assert.equal(bookingStatusBlocksAvailability('pending_payment'), true);
  assert.equal(bookingStatusBlocksAvailability('cancelled'), false);
  assert.equal(bookingStatusBlocksAvailability('failed'), false);
  const source = fs.readFileSync('src/lib/ownerCalendarSchedule.ts', 'utf8');
  assert.match(source, /bookingStatusBlocksAvailability/);
});
await test('cancelled/failed periods are marked released and available again', () => {
  const cancelled = toScheduleAppointment(record({ bookingStatus: 'cancelled', paymentStatus: 'cancelled' }));
  const failed = toScheduleAppointment(record({ bookingStatus: 'failed', paymentStatus: 'failed' }));
  const booked = toScheduleAppointment(record({ bookingStatus: 'confirmed' }));
  assert.equal(cancelled.releasedForAvailability, true);
  assert.equal(failed.releasedForAvailability, true);
  assert.equal(booked.releasedForAvailability, false);
});
await test('Phase 16 booked spans block only active booking records', () => {
  reset(); seed([
    record({ bookingId: 'blocking', bookingStatus: 'confirmed' }),
    record({ bookingId: 'released', bookingStatus: 'cancelled', startMinutes: 700, endMinutes: 760 }),
  ]);
  const spans = bookedSpansForSalon(BUSINESS, THEME);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].startMinutes, 600);
});
await test('duration comes from the existing booking slot span', () => {
  const appointment = toScheduleAppointment(record({ startMinutes: 600, endMinutes: 705 }));
  assert.equal(appointment.durationMinutes, 105);
  assert.equal(appointment.startMinutes, 600);
  assert.equal(appointment.endMinutes, 705);
});
await test('multi-service names and separate booking/payment statuses are preserved', () => {
  const appointment = toScheduleAppointment(record({
    bookingStatus: 'confirmed', paymentStatus: 'pending',
    services: [
      { serviceId: 'one', serviceName: 'Cut', price: 500, durationMinutes: 30 },
      { serviceId: 'two', serviceName: 'Colour', price: 700, durationMinutes: 60 },
    ],
  }));
  assert.deepEqual(appointment.serviceNames, ['Cut', 'Colour']);
  assert.equal(appointment.status, 'confirmed');
  assert.equal(appointment.paymentStatus, 'pending');
});
await test('schedule ordering is stable by date, start, end and reference', () => {
  const rows = [
    toScheduleAppointment(record({ bookingId: 'B', dateKey: '2026-08-18', startMinutes: 600 })),
    toScheduleAppointment(record({ bookingId: 'C', dateKey: '2026-08-17', startMinutes: 700 })),
    toScheduleAppointment(record({ bookingId: 'A', dateKey: '2026-08-17', startMinutes: 700 })),
  ];
  assert.deepEqual(sortScheduleAppointments(rows).map((item) => item.bookingId), ['A', 'C', 'B']);
});

section('Calendar UI, details and states');
await test('week view shows date, time, duration, services and both statuses', async () => {
  reset(); seed([record({
    bookingId: 'visible', serviceName: 'Signature Facial', startMinutes: 600, endMinutes: 690,
    bookingStatus: 'confirmed', paymentStatus: 'paid',
  })]);
  const ui = await renderCalendar();
  const card = ui.getByTestId('owner-calendar-appointment-visible');
  for (const value of ['10:00', '11:30', 'Signature Facial', '1 h 30 m', 'Confirmed', 'Paid']) {
    assert.ok(card.textContent.includes(value), `missing ${value}`);
  }
  assert.ok(ui.getByTestId('owner-calendar-day-2026-08-17'));
});
await test('day/week controls change the visible date set', async () => {
  reset(); seed([
    record({ bookingId: 'monday', dateKey: '2026-08-17' }),
    record({ bookingId: 'tuesday', dateKey: '2026-08-18' }),
  ]);
  const ui = await renderCalendar();
  assert.ok(ui.getByTestId('owner-calendar-appointment-tuesday'));
  fireEvent.click(ui.getByTestId('owner-calendar-view-day'));
  assert.ok(ui.getByTestId('owner-calendar-appointment-monday'));
  assert.equal(ui.queryByTestId('owner-calendar-appointment-tuesday'), null);
});
await test('previous/next navigation changes the period and Today restores it', async () => {
  reset(); seed([
    record({ bookingId: 'this-week', dateKey: '2026-08-17' }),
    record({ bookingId: 'next-week', dateKey: '2026-08-24' }),
  ]);
  const ui = await renderCalendar();
  assert.ok(ui.getByTestId('owner-calendar-appointment-this-week'));
  fireEvent.click(ui.getByTestId('owner-calendar-next'));
  assert.ok(ui.getByTestId('owner-calendar-appointment-next-week'));
  fireEvent.click(ui.getByTestId('owner-calendar-today'));
  assert.ok(ui.getByTestId('owner-calendar-appointment-this-week'));
});
await test('booked, cancelled, completed and released periods are visibly distinct', async () => {
  reset(); seed([
    record({ bookingId: 'booked', bookingStatus: 'confirmed', startMinutes: 600, endMinutes: 660 }),
    record({ bookingId: 'cancelled', bookingStatus: 'cancelled', paymentStatus: 'cancelled', startMinutes: 700, endMinutes: 760 }),
    record({ bookingId: 'completed', bookingStatus: 'completed', startMinutes: 800, endMinutes: 860 }),
  ]);
  const ui = await renderCalendar();
  assert.equal(ui.getByTestId('owner-calendar-appointment-booked').getAttribute('data-period-state'), 'booked');
  assert.equal(ui.getByTestId('owner-calendar-appointment-cancelled').getAttribute('data-period-state'), 'cancelled');
  assert.equal(ui.getByTestId('owner-calendar-appointment-completed').getAttribute('data-period-state'), 'completed');
  assert.ok(ui.getByTestId('owner-calendar-released-cancelled'));
  for (const label of ['Available / released', 'Booked', 'Cancelled', 'Completed']) {
    assert.ok(ui.getByTestId('owner-calendar-legend').textContent.includes(label));
  }
});
await test('selecting an appointment opens the existing booking details/management row', async () => {
  reset(); seed([record({ bookingId: 'details', bookingStatus: 'confirmed' })]);
  const ui = await renderCalendar();
  fireEvent.click(ui.getByTestId('owner-calendar-appointment-details'));
  assert.ok(ui.getByTestId('owner-calendar-details-overlay'));
  assert.ok(ui.getByTestId('calendar-details-appointment-details'));
  assert.ok(ui.getByTestId('calendar-details-status-controls-details'));
  fireEvent.click(ui.getByTestId('owner-calendar-details-close'));
  assert.equal(ui.queryByTestId('owner-calendar-details-overlay'), null);
});
await test('calendar has no create/reschedule path that bypasses Phase 16 rules', () => {
  const source = fs.readFileSync('src/components/OwnerCalendarSchedule.tsx', 'utf8');
  for (const forbidden of ['createPendingBookingRecord', 'createPayAtSalonRecord', 'reserveBookingSlot', 'saveBookingDraft']) {
    assert.equal(source.includes(forbidden), false);
  }
  assert.match(source, /OwnerAppointmentRow/);
});
await test('empty, loading, error and unauthorized states are explicit', async () => {
  reset(); seed([]);
  let ui = await renderCalendar();
  assert.ok(ui.getByTestId('owner-calendar-empty'));
  cleanup();
  ui = await renderCalendar({ forcedState: 'loading' });
  assert.ok(ui.getByTestId('owner-calendar-loading'));
  cleanup();
  ui = await renderCalendar({ forcedState: 'error' });
  assert.ok(ui.getByTestId('owner-calendar-error'));
  assert.ok(ui.getByTestId('owner-calendar-retry'));
  cleanup();
  ui = await renderCalendar({ actor: DENIED });
  assert.ok(ui.getByTestId('owner-calendar-denied'));
});
await test('booking events refresh the schedule immediately', async () => {
  reset(); seed([record({ bookingId: 'first' })]);
  const ui = await renderCalendar();
  assert.ok(ui.getByTestId('owner-calendar-appointment-first'));
  await act(async () => { seed([record({ bookingId: 'second' })]); });
  assert.equal(ui.queryByTestId('owner-calendar-appointment-first'), null);
  assert.ok(ui.getByTestId('owner-calendar-appointment-second'));
});

section('Dashboard integration, responsive, locale and theme');
await test('Calendar mounts through the existing dashboard with session tenant keys', async () => {
  reset(); seed([record({ bookingId: 'dashboard-calendar' })]);
  const context = {
    access: 'authorized',
    salon: { id: SALON, organizationId: BUSINESS, name: 'Owned Salon', slug: 'owned', address: null, city: null, isActive: true },
  };
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => context }));
    await Promise.resolve();
  });
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-calendar')); });
  assert.ok(ui.getByTestId('owner-calendar'));
  assert.ok(ui.getByTestId('owner-calendar-appointment-dashboard-calendar'));
});
await test('unauthorized dashboard never exposes appointment details', async () => {
  reset(); seed([record({ bookingId: 'secret-calendar', customer: { name: 'Hidden Person', mobile: '9555555555' } })]);
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => ({ access: 'no-ownership', salon: null }) }));
    await Promise.resolve();
  });
  assert.ok(ui.getByTestId('owner-dashboard-denied'));
  assert.ok(!ui.container.textContent.includes('secret-calendar'));
});
await test('Hindi repaints calendar views, legend and status copy', async () => {
  reset(); setSiteLocale('hi'); seed([record({ bookingId: 'hindi-calendar', bookingStatus: 'completed' })]);
  const ui = await renderCalendar();
  const calendar = ui.getByTestId('owner-calendar');
  assert.match(calendar.textContent, /कैलेंडर \/ शेड्यूल/);
  assert.match(calendar.textContent, /सप्ताह/);
  assert.match(calendar.textContent, /पूर्ण/);
});
await test('day/week schedule is responsive across mobile, tablet and desktop', () => {
  const source = fs.readFileSync('src/components/OwnerCalendarSchedule.tsx', 'utf8');
  assert.match(source, /grid-cols-1/);
  assert.match(source, /md:grid-cols-2/);
  assert.match(source, /xl:grid-cols-7/);
  assert.match(source, /lg:flex-row/);
  assert.match(source, /sm:items-center/);
});
await test('light/dark rendering uses the existing dashboard palette', () => {
  const source = fs.readFileSync('src/components/OwnerCalendarSchedule.tsx', 'utf8');
  for (const token of ['palette.panel', 'palette.panelSoft', 'palette.line', 'palette.text', 'palette.accent']) assert.ok(source.includes(token));
});
await test('every Phase 17.7 copy key exists in English and Hindi', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  for (const key of ['calendar.heading', 'calendar.view.day', 'calendar.view.week', 'calendar.legend.available', 'calendar.period.booked', 'calendar.details.title']) {
    assert.equal(source.split(`'${key}'`).length - 1, 2, `${key} must exist in both locales`);
  }
});
await test('Notifications now uses its completed section', async () => {
  reset();
  const context = {
    access: 'authorized',
    salon: { id: SALON, organizationId: BUSINESS, name: 'Owned Salon', slug: 'owned', address: null, city: null, isActive: true },
  };
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => context }));
    await Promise.resolve();
  });
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-notifications')); });
  assert.ok(ui.getByTestId('owner-notifications-empty'));
});
await test('production implementation contains no fake appointment or duplicate calendar schema', () => {
  const combined = fs.readFileSync('src/lib/ownerCalendarSchedule.ts', 'utf8') + fs.readFileSync('src/components/OwnerCalendarSchedule.tsx', 'utf8');
  assert.equal(/NX-\d{4,}/.test(combined), false);
  assert.equal(/create table|alter table|calendar_events|schedule_records/i.test(combined), false);
});

reset();
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.7 calendar / schedule: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
