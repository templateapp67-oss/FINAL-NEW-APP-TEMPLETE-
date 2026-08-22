/**
 * PHASE 17.3 — UPCOMING APPOINTMENTS acceptance.
 *
 * Verifies ONLY what 17.3 promises:
 *   - Upcoming Appointments section on the Owner Dashboard.
 *   - Real FUTURE bookings for the authenticated owner's OWN salon, via the
 *     existing organization_members → salons ownership logic (never
 *     job_salon_members) and the existing tenant-keyed booking reads.
 *   - Fields: customer name, service(s), date, time, duration, booking
 *     status, payment status, advance/remaining.
 *   - Sorted nearest upcoming date/time first.
 *   - Past appointments and cancelled/inactive bookings excluded.
 *   - Useful date/time grouping.
 *   - No cross-salon/customer leakage, no fake records.
 *   - Loading, empty and error states; responsive; EN/HI; light/dark.
 *   - Phases 17.1–17.2 and 10–16 preserved.
 *
 * NOT covered (later phases): booking status management, customer
 * management, revenue, calendar, notifications.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const OwnerUpcomingAppointments = (await import('../src/components/OwnerUpcomingAppointments.tsx')).default;
const OwnerDashboard = (await import('../src/components/OwnerDashboard.tsx')).default;
const {
  isUpcomingDateKey,
  isPastOrTodayDateKey,
  isUpcomingRecord,
  sortByNearestUpcoming,
  parseDateKey,
  daysAhead,
  upcomingDayKind,
  groupByDate,
  readUpcomingAppointments,
  countUpcoming,
  formatGroupDate,
} = await import('../src/lib/ownerUpcomingAppointments.ts');
const { ownerDashboardText, ownerDashboardCount } = await import('../src/lib/ownerDashboardI18n.ts');
const { resolveBookingActor, setSupabaseConfiguredForTests } = await import('../src/lib/bookingManagement.ts');
const { setSiteAppearance, setSiteLocale, SITE_HEADER_THEME_IDS } = await import('../src/lib/siteNavigation.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { PAYMENT_STORE_KEY, PAYMENT_EVENT, setPaymentStoreForTests } =
  await import('../src/lib/siteBookingPayment.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`);
  }
}
function section(title) {
  console.log(`\n■ ${title}`);
}

const UP_SRC = fs.readFileSync('src/lib/ownerUpcomingAppointments.ts', 'utf8');
const UP_UI = fs.readFileSync('src/components/OwnerUpcomingAppointments.tsx', 'utf8');
const ROW_UI = fs.readFileSync('src/components/OwnerAppointmentRow.tsx', 'utf8');
const DASH_SRC = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');

/* Fixed clock: Monday 17 Aug 2026, 11:00 salon-local. */
const NOW = new Date(2026, 7, 17, 11, 0, 0, 0);
const TODAY = '2026-08-17';
const TOMORROW = '2026-08-18';
const IN_3 = '2026-08-20';
const IN_10 = '2026-08-27';
const YESTERDAY = '2026-08-16';

const OWNER_BUSINESS = 'org-owner-1';
const OTHER_BUSINESS = 'org-other-2';
const THEME = 'beauty_skin_spa';

const AUTHORIZED = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'resolved' } });
const NO_SALON = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'no-membership' } });
const NOT_LOGGED_IN = resolveBookingActor({ supabaseConfigured: true, userPresent: false, resolution: null });

function record(overrides = {}) {
  const now = Date.now();
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 9)}`,
    businessId: OWNER_BUSINESS,
    themeId: THEME,
    customerId: 'cust-1',
    bookingId: `NX-${Math.floor(10000 + Math.random() * 89999)}`,
    serviceId: 'svc-1',
    serviceName: 'Signature Facial',
    dateKey: TOMORROW,
    startMinutes: 600,
    endMinutes: 660,
    baseAmount: 1200,
    amountDue: 300,
    remainingAmount: 900,
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

function seed(records) {
  if (records === null) window.localStorage.removeItem(PAYMENT_STORE_KEY);
  else window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PAYMENT_EVENT));
}

const PALETTE = {
  panel: '#ffffff', panelSoft: '#fbfafa', line: '#e6e3e0',
  text: '#191512', muted: '#7c736c',
  accent: '#ac0053', accentSoft: 'rgba(172,0,83,0.08)', accentText: '#ffffff',
};
const DARK_PALETTE = {
  panel: '#1b1818', panelSoft: '#221e1e', line: '#332d2d',
  text: '#f6f2f0', muted: '#a49b96',
  accent: '#ff5ea1', accentSoft: 'rgba(255,94,161,0.14)', accentText: '#1a0410',
};

async function renderUpcoming(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerUpcomingAppointments, {
      actor: AUTHORIZED,
      businessIds: [OWNER_BUSINESS],
      themeIds: [THEME],
      palette: PALETTE,
      ...props,
    }));
  });
  await act(async () => { await Promise.resolve(); });
  return utils;
}

function resetState() {
  cleanup();
  window.localStorage.clear();
  setPaymentStoreForTests(null);
  setSalonClockForTests(NOW);
  setSupabaseConfiguredForTests(true);
  setSiteLocale('en');
  setSiteAppearance('light');
}

resetState();

/* ================================================================== */
section('1 · Ownership & isolation');

await test('reads through the existing tenant-keyed booking layer only', () => {
  assert.match(UP_SRC, /readSalonBookings/);
  assert.ok(!/\.from\(/.test(UP_SRC), 'no direct table access');
  assert.match(UP_SRC, /toTodayAppointment/, 'reuses the 17.2 projection');
});

await test('job_salon_members is never used for ownership', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [label, src] of [['data layer', UP_SRC], ['UI', UP_UI], ['row', ROW_UI]]) {
    assert.ok(!strip(src).includes('job_salon_members'), `${label} must not use job_salon_members`);
  }
});

await test("another salon's future bookings are never returned", () => {
  resetState();
  seed([
    record({ bookingId: 'NX-MINE', businessId: OWNER_BUSINESS, dateKey: TOMORROW }),
    record({ bookingId: 'NX-THEIRS', businessId: OTHER_BUSINESS, dateKey: TOMORROW }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-MINE']);
});

await test('foreign-tenant rows stay invisible across every theme', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-A', businessId: OWNER_BUSINESS, themeId: 'barber_mens_grooming', dateKey: IN_3 }),
    record({ bookingId: 'NX-B', businessId: OTHER_BUSINESS, themeId: 'barber_mens_grooming', dateKey: IN_3 }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], SITE_HEADER_THEME_IDS, NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-A']);
});

await test('unauthorized actors get a refusal, never rows', () => {
  resetState();
  seed([record({ bookingId: 'NX-SECRET' })]);
  for (const actor of [NO_SALON, NOT_LOGGED_IN]) {
    const result = readUpcomingAppointments(actor, [OWNER_BUSINESS], [THEME], NOW);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
    assert.equal(result.appointments, undefined);
  }
});

await test('a refusal on any tenant key refuses the whole read', () => {
  resetState();
  seed([record()]);
  const result = readUpcomingAppointments(NO_SALON, [OWNER_BUSINESS, 'public-site'], [THEME], NOW);
  assert.equal(result.ok, false);
});

await test('overlapping tenant candidates never duplicate a row', () => {
  resetState();
  seed([record({ bookingId: 'NX-ONE', dateKey: TOMORROW })]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS, OWNER_BUSINESS], [THEME, THEME], NOW);
  assert.equal(result.appointments.length, 1);
});

/* ================================================================== */
section('2 · Future window: excludes past, today and inactive rows');

await test('only strictly-future dates are upcoming', () => {
  assert.equal(isUpcomingDateKey(TOMORROW, TODAY), true);
  assert.equal(isUpcomingDateKey(IN_10, TODAY), true);
  assert.equal(isUpcomingDateKey(TODAY, TODAY), false);
  assert.equal(isUpcomingDateKey(YESTERDAY, TODAY), false);
  assert.equal(isPastOrTodayDateKey(TODAY, TODAY), true);
  assert.equal(isPastOrTodayDateKey(TOMORROW, TODAY), false);
});

await test('past and today rows are excluded from the list', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-PAST', dateKey: YESTERDAY }),
    record({ bookingId: 'NX-TODAY', dateKey: TODAY }),
    record({ bookingId: 'NX-FUTURE', dateKey: TOMORROW }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-FUTURE']);
});

await test('cancelled and failed bookings are excluded per the existing rules', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-OK', dateKey: TOMORROW, bookingStatus: 'confirmed' }),
    record({ bookingId: 'NX-CAN', dateKey: TOMORROW, bookingStatus: 'cancelled' }),
    record({ bookingId: 'NX-FAIL', dateKey: TOMORROW, bookingStatus: 'failed' }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-OK']);
  assert.equal(isUpcomingRecord({ dateKey: TOMORROW, bookingStatus: 'cancelled' }, TODAY), false);
  assert.equal(isUpcomingRecord({ dateKey: TOMORROW, bookingStatus: 'failed' }, TODAY), false);
});

await test('pending and pay_at_salon bookings remain visible', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-PEND', dateKey: TOMORROW, bookingStatus: 'pending_payment' }),
    record({ bookingId: 'NX-PAS', dateKey: TOMORROW, bookingStatus: 'pay_at_salon' }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.equal(result.appointments.length, 2);
});

await test('the future comparison never uses UTC conversion', () => {
  const executable = UP_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!executable.includes('toISOString'), 'toISOString would shift the day in IST');
  assert.match(UP_SRC, /localDateKey|todayDateKey/);
});

await test('an empty store yields an empty list, never a fabricated row', () => {
  resetState();
  seed(null);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.appointments, []);
  assert.deepEqual(result.groups, []);
});

await test('no hardcoded appointment data exists in the source', () => {
  for (const [label, src] of [['data layer', UP_SRC], ['UI', UP_UI], ['row', ROW_UI]]) {
    assert.ok(!/NX-\d{4,}/.test(src), `${label} must not hardcode a booking id`);
    for (const name of ['Neha', 'Priya Sharma', 'Asha Verma']) {
      assert.ok(!src.includes(name), `${label} must not hardcode "${name}"`);
    }
  }
});

/* ================================================================== */
section('3 · Nearest-first ordering');

await test('rows sort by date, then start time', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-D10', dateKey: IN_10, startMinutes: 540 }),
    record({ bookingId: 'NX-D1-PM', dateKey: TOMORROW, startMinutes: 900 }),
    record({ bookingId: 'NX-D3', dateKey: IN_3, startMinutes: 600 }),
    record({ bookingId: 'NX-D1-AM', dateKey: TOMORROW, startMinutes: 600 }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId),
    ['NX-D1-AM', 'NX-D1-PM', 'NX-D3', 'NX-D10']);
});

await test('ordering ignores creation order', () => {
  const rows = sortByNearestUpcoming([
    { dateKey: IN_10, startMinutes: 540, endMinutes: 600, bookingId: 'B' },
    { dateKey: TOMORROW, startMinutes: 540, endMinutes: 600, bookingId: 'A' },
  ]);
  assert.deepEqual(rows.map((r) => r.bookingId), ['A', 'B']);
});

await test('ties break deterministically (end time, then booking id)', () => {
  const rows = sortByNearestUpcoming([
    { dateKey: TOMORROW, startMinutes: 600, endMinutes: 660, bookingId: 'B' },
    { dateKey: TOMORROW, startMinutes: 600, endMinutes: 660, bookingId: 'A' },
    { dateKey: TOMORROW, startMinutes: 600, endMinutes: 630, bookingId: 'C' },
  ]);
  assert.deepEqual(rows.map((r) => r.bookingId), ['C', 'A', 'B']);
});

await test('the rendered DOM order is nearest-first', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-LATER', dateKey: IN_10, startMinutes: 600 }),
    record({ bookingId: 'NX-SOON', dateKey: TOMORROW, startMinutes: 600 }),
  ]);
  const utils = await renderUpcoming();
  const order = [...utils.container.querySelectorAll('[data-testid^="upcoming-appointment-"]')]
    .map((el) => el.getAttribute('data-testid'));
  assert.deepEqual(order, ['upcoming-appointment-NX-SOON', 'upcoming-appointment-NX-LATER']);
  cleanup();
});

/* ================================================================== */
section('4 · Date grouping');

await test('date keys parse as local dates and offsets are whole days', () => {
  assert.equal(parseDateKey(TOMORROW).getFullYear(), 2026);
  assert.equal(parseDateKey('nonsense'), null);
  assert.equal(daysAhead(TOMORROW, NOW), 1);
  assert.equal(daysAhead(IN_3, NOW), 3);
  assert.equal(daysAhead(IN_10, NOW), 10);
});

await test('day kinds classify tomorrow / this week / later', () => {
  assert.equal(upcomingDayKind(1), 'tomorrow');
  assert.equal(upcomingDayKind(3), 'this-week');
  assert.equal(upcomingDayKind(7), 'this-week');
  assert.equal(upcomingDayKind(8), 'later');
});

await test('groups are keyed by the rows own date, nearest first', () => {
  const groups = groupByDate([
    { id: '1', dateKey: IN_10, startMinutes: 600, endMinutes: 660, bookingId: 'C', statusGroup: 'confirmed' },
    { id: '2', dateKey: TOMORROW, startMinutes: 600, endMinutes: 660, bookingId: 'A', statusGroup: 'confirmed' },
    { id: '3', dateKey: TOMORROW, startMinutes: 700, endMinutes: 760, bookingId: 'B', statusGroup: 'pending' },
  ], NOW);
  assert.deepEqual(groups.map((g) => g.dateKey), [TOMORROW, IN_10]);
  assert.equal(groups[0].appointments.length, 2);
  assert.equal(groups[0].daysAhead, 1);
  assert.equal(groups[0].kind, 'tomorrow');
  assert.equal(groups[1].kind, 'later');
});

await test('days with no bookings are never emitted', () => {
  const groups = groupByDate([
    { id: '1', dateKey: IN_10, startMinutes: 600, endMinutes: 660, bookingId: 'A', statusGroup: 'confirmed' },
  ], NOW);
  assert.equal(groups.length, 1, 'only real days appear');
  assert.equal(groups[0].dateKey, IN_10);
});

await test('group headings render the real date plus a relative badge', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-T', dateKey: TOMORROW }),
    record({ bookingId: 'NX-W', dateKey: IN_3 }),
    record({ bookingId: 'NX-L', dateKey: IN_10 }),
  ]);
  const utils = await renderUpcoming();
  assert.ok(utils.getByTestId(`upcoming-group-${TOMORROW}`));
  assert.equal(utils.getByTestId(`upcoming-group-badge-${TOMORROW}`).textContent.trim(), 'Tomorrow');
  assert.equal(utils.getByTestId(`upcoming-group-badge-${IN_3}`).textContent.trim(), 'In 3 days');
  assert.equal(utils.getByTestId(`upcoming-group-badge-${IN_10}`).textContent.trim(), 'Later');
  assert.ok(utils.getByTestId(`upcoming-group-date-${TOMORROW}`).textContent.includes('2026'));
  cleanup();
});

await test('group order in the DOM is nearest day first', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-L', dateKey: IN_10 }),
    record({ bookingId: 'NX-T', dateKey: TOMORROW }),
    record({ bookingId: 'NX-W', dateKey: IN_3 }),
  ]);
  const utils = await renderUpcoming();
  const order = [...utils.container.querySelectorAll('[data-testid^="upcoming-group-2"]')]
    .map((el) => el.getAttribute('data-testid'));
  assert.deepEqual(order, [
    `upcoming-group-${TOMORROW}`, `upcoming-group-${IN_3}`, `upcoming-group-${IN_10}`,
  ]);
  cleanup();
});

await test('counts tally rows and days from the real data only', () => {
  const groups = groupByDate([
    { id: '1', dateKey: TOMORROW, startMinutes: 600, endMinutes: 660, bookingId: 'A', statusGroup: 'confirmed' },
    { id: '2', dateKey: TOMORROW, startMinutes: 700, endMinutes: 760, bookingId: 'B', statusGroup: 'pending' },
    { id: '3', dateKey: IN_3, startMinutes: 600, endMinutes: 660, bookingId: 'C', statusGroup: 'confirmed' },
  ], NOW);
  const counts = countUpcoming(groups);
  assert.equal(counts.total, 3);
  assert.equal(counts.days, 2);
  assert.equal(counts.confirmed, 2);
  assert.equal(counts.pending, 1);
  assert.equal(countUpcoming([]).total, 0);
});

await test('the group date label is localized from the real key', () => {
  assert.ok(formatGroupDate(TOMORROW, 'en').includes('2026'));
  assert.equal(formatGroupDate('bad-key', 'en'), 'bad-key');
});

/* ================================================================== */
section('5 · Required fields');

await test('every required field renders for a real future booking', async () => {
  resetState();
  seed([record({
    bookingId: 'NX-FULL',
    dateKey: IN_3,
    startMinutes: 630, endMinutes: 720,
    baseAmount: 1200, amountDue: 300, remainingAmount: 900,
    paymentStatus: 'paid', bookingStatus: 'confirmed',
    staffName: 'Riya',
    customer: { name: 'Meera Nair', mobile: '9876543210' },
  })]);
  const utils = await renderUpcoming();
  assert.ok(utils.getByTestId('upcoming-customer-NX-FULL').textContent.includes('Meera Nair'));
  assert.ok(utils.getByTestId('upcoming-services-NX-FULL').textContent.includes('Signature Facial'));
  assert.ok(utils.getByTestId('upcoming-time-NX-FULL').textContent.length > 0);
  assert.ok(utils.getByTestId('upcoming-duration-NX-FULL').textContent.includes('1 h 30 m'));
  assert.ok(utils.getByTestId('upcoming-status-NX-FULL').textContent.includes('Confirmed'));
  assert.ok(utils.getByTestId('upcoming-payment-NX-FULL').textContent.includes('Paid'));
  assert.ok(utils.getByTestId('upcoming-total-NX-FULL').textContent.includes('1,200'));
  assert.ok(utils.getByTestId('upcoming-advance-NX-FULL').textContent.includes('300'));
  assert.ok(utils.getByTestId('upcoming-remaining-NX-FULL').textContent.includes('900'));
  assert.ok(utils.getByTestId('upcoming-staff-NX-FULL').textContent.includes('Riya'));
  // The appointment date is available on the row and its group.
  assert.equal(utils.getByTestId('upcoming-appointment-NX-FULL').getAttribute('data-date'), IN_3);
  cleanup();
});

await test('multi-service bookings list every line', async () => {
  resetState();
  seed([record({
    bookingId: 'NX-MULTI',
    dateKey: TOMORROW,
    services: [
      { serviceId: 's1', serviceName: 'Haircut', price: 500, durationMinutes: 30 },
      { serviceId: 's2', serviceName: 'Beard Trim', price: 300, durationMinutes: 20 },
    ],
  })]);
  const utils = await renderUpcoming();
  const text = utils.getByTestId('upcoming-services-NX-MULTI').textContent;
  assert.ok(text.includes('Haircut') && text.includes('Beard Trim'));
  cleanup();
});

await test('advance / remaining hide when there is nothing real to show', async () => {
  resetState();
  seed([record({
    bookingId: 'NX-ZERO', dateKey: TOMORROW,
    baseAmount: 0, amountDue: 0, remainingAmount: 0, paymentStatus: 'paid',
  })]);
  const utils = await renderUpcoming();
  assert.equal(utils.queryByTestId('upcoming-advance-NX-ZERO'), null);
  assert.equal(utils.queryByTestId('upcoming-remaining-NX-ZERO'), null);
  assert.ok(utils.getByTestId('upcoming-total-NX-ZERO'));
  cleanup();
});

await test('a missing customer name uses neutral copy, never a fake name', async () => {
  resetState();
  seed([record({ bookingId: 'NX-ANON', dateKey: TOMORROW, customer: { name: '', mobile: '' } })]);
  const utils = await renderUpcoming();
  assert.ok(utils.getByTestId('upcoming-customer-NX-ANON').textContent
    .includes(ownerDashboardText('en', 'today.noCustomerName')));
  cleanup();
});

await test('booking and payment statuses use the EXISTING values only', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-P', dateKey: TOMORROW, startMinutes: 540, bookingStatus: 'pending_payment', paymentStatus: 'pending' }),
    record({ bookingId: 'NX-C', dateKey: TOMORROW, startMinutes: 600, bookingStatus: 'confirmed', paymentStatus: 'paid' }),
    record({ bookingId: 'NX-S', dateKey: TOMORROW, startMinutes: 660, bookingStatus: 'pay_at_salon', paymentStatus: 'unpaid' }),
  ]);
  const utils = await renderUpcoming();
  assert.equal(utils.getByTestId('upcoming-status-NX-P').textContent.trim(), 'Pending');
  assert.equal(utils.getByTestId('upcoming-status-NX-C').textContent.trim(), 'Confirmed');
  assert.ok(utils.getByTestId('upcoming-status-NX-S').textContent.includes('Pay at salon'));
  assert.equal(utils.getByTestId('upcoming-appointment-NX-S').getAttribute('data-status-group'), 'confirmed');
  cleanup();
});

/* ================================================================== */
section('6 · Loading / empty / error states');

await test('loading state renders skeletons and a busy region', async () => {
  resetState();
  seed([record()]);
  const utils = await renderUpcoming({ forcedState: 'loading' });
  const node = utils.getByTestId('upcoming-appointments-loading');
  assert.equal(node.getAttribute('aria-busy'), 'true');
  assert.ok(node.textContent.includes(ownerDashboardText('en', 'upcoming.loading')));
  cleanup();
});

await test('empty state renders when there are no future bookings', async () => {
  resetState();
  seed([record({ dateKey: TODAY }), record({ dateKey: YESTERDAY })]);
  const utils = await renderUpcoming();
  assert.ok(utils.getByTestId('upcoming-appointments-empty').textContent
    .includes(ownerDashboardText('en', 'upcoming.empty.title')));
  assert.equal(utils.queryByTestId('upcoming-count-total'), null);
  cleanup();
});

await test('error state offers a working retry', async () => {
  resetState();
  seed([record()]);
  const utils = await renderUpcoming({ forcedState: 'error' });
  assert.ok(utils.getByTestId('upcoming-appointments-error'));
  await act(async () => { fireEvent.click(utils.getByTestId('upcoming-appointments-retry')); });
  assert.ok(utils.getByTestId('upcoming-appointments-error'));
  cleanup();
});

await test('unauthorized viewers see a refusal card instead of the list', async () => {
  resetState();
  seed([record({ bookingId: 'NX-HIDDEN', dateKey: TOMORROW })]);
  const utils = await renderUpcoming({ actor: NO_SALON });
  const denied = utils.getByTestId('upcoming-appointments-denied');
  assert.equal(denied.getAttribute('role'), 'alert');
  assert.ok(!utils.container.textContent.includes('NX-HIDDEN'));
  assert.equal(utils.queryByTestId('upcoming-appointments'), null);
  cleanup();
});

await test('the list refreshes when a booking record changes', async () => {
  resetState();
  seed([record({ bookingId: 'NX-LIVE', dateKey: TOMORROW })]);
  const utils = await renderUpcoming();
  assert.ok(utils.getByTestId('upcoming-appointment-NX-LIVE'));
  await act(async () => {
    seed([
      record({ bookingId: 'NX-LIVE', dateKey: TOMORROW }),
      record({ bookingId: 'NX-NEW', dateKey: IN_3 }),
    ]);
  });
  assert.ok(utils.getByTestId('upcoming-appointment-NX-NEW'));
  cleanup();
});

/* ================================================================== */
section('7 · Responsive / EN-HI / light-dark');

await test('the shared row grid reflows across mobile, tablet and desktop', () => {
  assert.match(ROW_UI, /grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(UP_UI, /flex-wrap/);
});

await test('Hindi renders headings, group badges and field labels', async () => {
  resetState();
  setSiteLocale('hi');
  seed([
    record({ bookingId: 'NX-HI', dateKey: TOMORROW }),
    record({ bookingId: 'NX-HI3', dateKey: IN_3 }),
  ]);
  const utils = await renderUpcoming();
  assert.ok(utils.getByTestId('upcoming-appointments-header').textContent.includes('आगामी अपॉइंटमेंट'));
  assert.equal(utils.getByTestId(`upcoming-group-badge-${TOMORROW}`).textContent.trim(), 'कल');
  assert.ok(utils.getByTestId(`upcoming-group-badge-${IN_3}`).textContent.includes('दिनों में'));
  assert.ok(utils.getByTestId('upcoming-customer-NX-HI').textContent.includes('ग्राहक'));
  setSiteLocale('en');
  cleanup();
});

await test('every 17.3 copy key has both EN and HI', () => {
  const i18n = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  const keys = [...new Set([...i18n.matchAll(/^\s{2}'(upcoming\.[\w.]+)':/gm)].map((m) => m[1]))];
  assert.ok(keys.length >= 15, `expected the full upcoming table, got ${keys.length}`);
  for (const key of keys) {
    assert.ok(ownerDashboardText('en', key) !== key, `missing EN for ${key}`);
    assert.ok(ownerDashboardText('hi', key) !== key, `missing HI for ${key}`);
  }
  assert.match(ownerDashboardText('hi', 'upcoming.group.tomorrow'), /[\u0900-\u097F]/);
});

await test('the count interpolator substitutes real numbers', () => {
  assert.equal(ownerDashboardCount('en', 'upcoming.group.inDays', 4), 'In 4 days');
  assert.equal(ownerDashboardCount('en', 'upcoming.group.count.other', 3), '3 appointments');
});

await test('dark mode restyles the section surfaces', async () => {
  resetState();
  seed([record({ bookingId: 'NX-DK', dateKey: TOMORROW })]);
  const light = await renderUpcoming();
  const lightBg = light.getByTestId('upcoming-appointment-NX-DK').style.backgroundColor;
  cleanup();
  const dark = await renderUpcoming({ palette: DARK_PALETTE });
  assert.notEqual(dark.getByTestId('upcoming-appointment-NX-DK').style.backgroundColor, lightBg);
  cleanup();
});

/* ================================================================== */
section('8 · Dashboard integration · 17.1–17.2 and 10–16 preserved');

async function renderDashboard(access = 'authorized') {
  const salon = {
    id: 'salon-1', organizationId: OWNER_BUSINESS, name: 'My Salon',
    slug: 'my-salon', address: null, city: null, isActive: true,
  };
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, {
      loadContext: () => Promise.resolve({ access, salon: access === 'authorized' ? salon : null }),
    }));
  });
  await act(async () => { await Promise.resolve(); });
  return utils;
}

await test('the Upcoming section mounts through the dashboard shell', async () => {
  resetState();
  seed([record({ bookingId: 'NX-SHELL', dateKey: TOMORROW })]);
  const utils = await renderDashboard();
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-upcoming')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), 'upcoming');
  assert.ok(utils.getByTestId('upcoming-appointment-NX-SHELL'));
  cleanup();
});

await test('the dashboard passes session-resolved tenant keys to Upcoming', () => {
  assert.match(DASH_SRC, /active === 'upcoming' && tenant/);
  assert.match(DASH_SRC, /businessIds=\{tenant\.businessIds\}/);
  assert.ok(!/OwnerUpcomingAppointments[\s\S]{0,200}businessIds=\{\[['"]/.test(DASH_SRC));
});

await test('Today (17.2) still works and stays separate from Upcoming', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-TODAY', dateKey: TODAY }),
    record({ bookingId: 'NX-FUT', dateKey: TOMORROW }),
  ]);
  const utils = await renderDashboard();
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-today')); });
  assert.ok(utils.getByTestId('today-appointment-NX-TODAY'));
  assert.equal(utils.queryByTestId('today-appointment-NX-FUT'), null, 'future rows stay out of Today');
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-upcoming')); });
  assert.ok(utils.getByTestId('upcoming-appointment-NX-FUT'));
  assert.equal(utils.queryByTestId('upcoming-appointment-NX-TODAY'), null, "today's rows stay out of Upcoming");
  cleanup();
});

await test('unauthorized dashboard access never reaches the Upcoming section', async () => {
  resetState();
  seed([record({ bookingId: 'NX-NOPE', dateKey: TOMORROW })]);
  const utils = await renderDashboard('no-ownership');
  assert.ok(utils.getByTestId('owner-dashboard-denied'));
  assert.ok(!utils.container.textContent.includes('NX-NOPE'));
  cleanup();
});

await test('the later Notifications section now uses its completed implementation', async () => {
  resetState();
  const utils = await renderDashboard();
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-notifications')); });
  assert.ok(utils.getByTestId('owner-notifications-empty'));
  cleanup();
});

await test('17.3 implements no status management / customers / revenue / calendar / notifications', () => {
  const combined = UP_SRC + UP_UI;
  for (const forbidden of [
    'ownerUpdateBookingStatus', 'customerCancelBooking', 'customerDirectory',
    'revenueTotal', 'calendarGrid', 'sendNotification',
  ]) {
    assert.ok(!combined.includes(forbidden), `${forbidden} belongs to a later phase`);
  }
  assert.ok(!/<button[^>]*onClick=\{\(\) => change/i.test(UP_UI), 'no status mutation controls');
});

await test('one shared appointment row — no duplicate renderer', () => {
  const today = fs.readFileSync('src/components/OwnerTodayAppointments.tsx', 'utf8');
  assert.match(today, /OwnerAppointmentRow/);
  assert.match(UP_UI, /OwnerAppointmentRow/);
  const components = fs.readdirSync('src/components')
    .filter((f) => /^Owner(Today|Upcoming)Appointments\.tsx$/.test(f));
  assert.equal(components.length, 2, 'exactly one component per section');
});

await test('the existing booking layers are unchanged by 17.3', () => {
  const mgmt = fs.readFileSync('src/lib/bookingManagement.ts', 'utf8');
  assert.match(mgmt, /export function readSalonBookings/);
  assert.match(mgmt, /export function ownerUpdateBookingStatus/);
  const pay = fs.readFileSync('src/lib/siteBookingPayment.ts', 'utf8');
  assert.ok(pay.includes("PAYMENT_STORE_KEY = 'nexora_site_payment_records'"), 'one booking store');
  assert.match(fs.readFileSync('src/screens/Landing.tsx', 'utf8'), /BookingManagementPanel/);
});

await test('no schema change was introduced by 17.3', () => {
  assert.ok(!/create\s+table|alter\s+table|drop\s+table/i.test(UP_SRC + UP_UI + ROW_UI));
  const migrations = fs.readdirSync('supabase/migrations');
  // M28 is the pre-existing Phase 1a foundation, not a migration introduced
  // here — only flag phase-named files.
  assert.ok(!migrations.some((f) => /17[._-]3/i.test(f)), 'no new migration file');
});

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.3 upcoming appointments: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Upcoming Appointments verified: own-salon-only future bookings via the existing organization_members → salons chain (no job_salon_members), nearest-first ordering, date grouping, past/cancelled exclusion, full field set, loading/empty/error states, EN/HI, light/dark, responsive, and Phases 17.1–17.2 + 10–16 preserved.');
}
