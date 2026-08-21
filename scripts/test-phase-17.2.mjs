/**
 * PHASE 17.2 — TODAY'S APPOINTMENTS acceptance.
 *
 * Verifies ONLY what 17.2 promises:
 *   - Today's Appointments section on the Owner Dashboard.
 *   - Real bookings for the AUTHENTICATED owner's OWN salon only, via the
 *     existing organization_members → salons ownership logic (never
 *     job_salon_members) and the existing tenant-keyed booking reads.
 *   - Fields: customer name (existing permissions), service(s), time,
 *     duration, booking status, payment status, advance/remaining.
 *   - Chronological ordering by appointment time.
 *   - Pending / Confirmed / Completed / Cancelled clearly distinguished using
 *     the EXISTING status values.
 *   - No cross-salon leakage, no fake/hardcoded appointments.
 *   - Loading, empty and error states; cancelled rows handled correctly.
 *   - Responsive, EN/HI, light/dark.
 *   - Phase 17.1 and 10–16 preserved.
 *
 * NOT covered (later phases): upcoming appointments, customer management,
 * revenue, calendar, notifications.
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

const OwnerTodayAppointments = (await import('../src/components/OwnerTodayAppointments.tsx')).default;
const OwnerDashboard = (await import('../src/components/OwnerDashboard.tsx')).default;
const {
  TODAY_STATUS_GROUPS,
  todayStatusGroup,
  isCancelledAppointment,
  isActiveAppointment,
  appointmentDuration,
  toTodayAppointment,
  todayDateKey,
  isTodayRecord,
  sortByAppointmentTime,
  readTodayAppointments,
  countByStatusGroup,
  formatDurationLabel,
  hasRemainingBalance,
  hasAdvancePaid,
} = await import('../src/lib/ownerTodayAppointments.ts');
const { ownerBookingTenant, BOOKING_FALLBACK_BUSINESS_ID, mapOwnerSalonRow, OWNER_SALON_SUMMARY_COLUMNS } =
  await import('../src/lib/ownerDashboard.ts');
const { ownerDashboardText } = await import('../src/lib/ownerDashboardI18n.ts');
const { resolveBookingActor } = await import('../src/lib/bookingManagement.ts');
const { setSiteAppearance, setSiteLocale, SITE_HEADER_THEME_IDS } = await import('../src/lib/siteNavigation.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const {
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
  setPaymentStoreForTests,
} = await import('../src/lib/siteBookingPayment.ts');

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

const TODAY_SRC = fs.readFileSync('src/lib/ownerTodayAppointments.ts', 'utf8');
const TODAY_UI = fs.readFileSync('src/components/OwnerTodayAppointments.tsx', 'utf8');
const DASH_SRC = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
const DASH_LIB = fs.readFileSync('src/lib/ownerDashboard.ts', 'utf8');

/* Fixed "today" so the suite is deterministic. */
const NOW = new Date(2026, 7, 17, 11, 0, 0, 0);
const TODAY = '2026-08-17';
const TOMORROW = '2026-08-18';

const OWNER_BUSINESS = 'org-owner-1';
const OTHER_BUSINESS = 'org-other-2';
const THEME = 'beauty_skin_spa';

const AUTHORIZED = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'resolved' } });
const DENIED = resolveBookingActor({ supabaseConfigured: true, userPresent: false, resolution: null });
const NO_SALON = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'no-membership' } });

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
    dateKey: TODAY,
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

async function renderToday(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerTodayAppointments, {
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
  setSiteLocale('en');
  setSiteAppearance('light');
}

resetState();

/* ================================================================== */
section('1 · Ownership & isolation (existing organization model)');

await test('the section reads through the existing tenant-keyed booking layer', () => {
  assert.match(TODAY_SRC, /readSalonBookings/);
  assert.match(TODAY_SRC, /bookingMoney/);
  assert.match(TODAY_SRC, /bookingServiceNames/);
  assert.ok(!/\.from\(/.test(TODAY_SRC), 'no direct table access — reuse the existing layer');
});

await test('job_salon_members is never used for ownership', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [label, src] of [['data layer', TODAY_SRC], ['UI', TODAY_UI], ['dashboard', DASH_SRC]]) {
    assert.ok(!strip(src).includes('job_salon_members'), `${label} must not use job_salon_members`);
  }
});

await test('tenant keys derive only from the session-resolved salon', () => {
  const salon = mapOwnerSalonRow({
    id: 'salon-1', organization_id: 'org-1', name: 'X', slug: 'x', address: null, city: null, is_active: true,
  });
  const tenant = ownerBookingTenant(salon);
  assert.deepEqual(tenant.businessIds, ['org-1', 'salon-1', BOOKING_FALLBACK_BUSINESS_ID]);
  assert.equal(tenant.salonId, 'salon-1');
  assert.equal(ownerBookingTenant(null), null);
});

await test('organization_id is read from the existing salons column', () => {
  assert.ok(OWNER_SALON_SUMMARY_COLUMNS.includes('organization_id'));
  assert.match(DASH_LIB, /organization_id/);
  assert.ok(!/create\s+table|alter\s+table/i.test(DASH_LIB + TODAY_SRC), 'no DDL');
});

await test('another salon\'s bookings are never returned', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-MINE', businessId: OWNER_BUSINESS }),
    record({ bookingId: 'NX-THEIRS', businessId: OTHER_BUSINESS }),
  ]);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-MINE']);
});

await test('another theme\'s bookings for a foreign tenant stay invisible', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-A', businessId: OWNER_BUSINESS, themeId: 'barber_mens_grooming' }),
    record({ bookingId: 'NX-B', businessId: OTHER_BUSINESS, themeId: 'barber_mens_grooming' }),
  ]);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS], SITE_HEADER_THEME_IDS, NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-A']);
});

await test('an unauthorized actor gets a refusal, never rows and never a silent empty list', () => {
  resetState();
  seed([record({ bookingId: 'NX-SECRET' })]);
  for (const actor of [DENIED, NO_SALON]) {
    const result = readTodayAppointments(actor, [OWNER_BUSINESS], [THEME], NOW);
    assert.equal(result.ok, false);
    assert.ok(result.reason, 'a reason must be returned');
    assert.equal(result.appointments, undefined);
  }
});

await test('a refusal on any tenant key refuses the whole read', () => {
  resetState();
  seed([record()]);
  const result = readTodayAppointments(NO_SALON, [OWNER_BUSINESS, 'public-site'], [THEME], NOW);
  assert.equal(result.ok, false);
});

await test('duplicate tenant candidates never duplicate rows', () => {
  resetState();
  seed([record({ bookingId: 'NX-ONE' })]);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS, OWNER_BUSINESS], [THEME, THEME], NOW);
  assert.equal(result.appointments.length, 1);
});

/* ================================================================== */
section('2 · Today only, real records only');

await test('"today" uses the salon local calendar day, never UTC', () => {
  assert.match(TODAY_SRC, /localDateKey/);
  assert.match(TODAY_SRC, /salonNow/);
  const executable = TODAY_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!executable.includes('toISOString'), 'toISOString would shift the day in IST');
  assert.equal(todayDateKey(NOW), TODAY);
});

await test('only rows whose dateKey is today are listed', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-TODAY', dateKey: TODAY }),
    record({ bookingId: 'NX-TOMORROW', dateKey: TOMORROW }),
    record({ bookingId: 'NX-YESTERDAY', dateKey: '2026-08-16' }),
  ]);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-TODAY']);
  assert.equal(isTodayRecord({ dateKey: TODAY }, TODAY), true);
  assert.equal(isTodayRecord({ dateKey: TOMORROW }, TODAY), false);
});

await test('an empty store yields zero appointments — never a fabricated row', () => {
  resetState();
  seed(null);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.appointments, []);
});

await test('no hardcoded appointment / customer / booking id exists in the source', () => {
  for (const [label, src] of [['data layer', TODAY_SRC], ['UI', TODAY_UI]]) {
    assert.ok(!/NX-\d{4,}/.test(src), `${label} must not hardcode a booking id`);
    for (const name of ['Neha', 'Priya Sharma', 'Asha Verma', 'Hair Spa']) {
      assert.ok(!src.includes(name), `${label} must not hardcode "${name}"`);
    }
  }
});

await test('every listed field is projected from the persisted record', () => {
  const row = toTodayAppointment(record({
    bookingId: 'NX-MAP',
    startMinutes: 615, endMinutes: 705,
    baseAmount: 1500, amountDue: 400, remainingAmount: 1100,
    paymentStatus: 'paid', bookingStatus: 'confirmed',
    staffName: ' Riya ',
    customer: { name: ' Meera ', mobile: '9000000000' },
  }));
  assert.equal(row.bookingId, 'NX-MAP');
  assert.equal(row.customerName, 'Meera');
  assert.equal(row.customerMobile, '9000000000');
  assert.deepEqual(row.serviceNames, ['Signature Facial']);
  assert.equal(row.startMinutes, 615);
  assert.equal(row.endMinutes, 705);
  assert.equal(row.durationMinutes, 90);
  assert.equal(row.total, 1500);
  assert.equal(row.advancePaid, 400);
  assert.equal(row.remaining, 1100);
  assert.equal(row.staffName, 'Riya');
  assert.equal(row.paymentStatus, 'paid');
});

await test('multi-service (16.5) bookings list every service line', () => {
  const row = toTodayAppointment(record({
    services: [
      { serviceId: 's1', serviceName: 'Haircut', price: 500, durationMinutes: 30 },
      { serviceId: 's2', serviceName: 'Beard Trim', price: 300, durationMinutes: 20 },
    ],
  }));
  assert.deepEqual(row.serviceNames, ['Haircut', 'Beard Trim']);
});

await test('duration is derived from the record slot span only', () => {
  assert.equal(appointmentDuration({ startMinutes: 600, endMinutes: 660 }), 60);
  assert.equal(appointmentDuration({ startMinutes: 600, endMinutes: 600 }), 0);
  assert.equal(appointmentDuration({ startMinutes: 600, endMinutes: 500 }), 0);
});

await test('unpaid bookings report no advance and the full remaining balance', () => {
  const row = toTodayAppointment(record({ paymentStatus: 'unpaid', baseAmount: 800, amountDue: 200, remainingAmount: 600 }));
  assert.equal(row.advancePaid, 0);
  assert.equal(row.remaining, 800);
  assert.equal(hasAdvancePaid(row), false);
  assert.equal(hasRemainingBalance(row), true);
});

/* ================================================================== */
section('3 · Chronological ordering');

await test('appointments sort by start time ascending', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-1500', startMinutes: 900, endMinutes: 960 }),
    record({ bookingId: 'NX-0900', startMinutes: 540, endMinutes: 600 }),
    record({ bookingId: 'NX-1200', startMinutes: 720, endMinutes: 780 }),
  ]);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-0900', 'NX-1200', 'NX-1500']);
});

await test('ordering is chronological regardless of creation order or status', () => {
  resetState();
  seed([
    record({ bookingId: 'NX-LATE', startMinutes: 1080, bookingStatus: 'pending_payment', createdAt: 1 }),
    record({ bookingId: 'NX-EARLY', startMinutes: 540, bookingStatus: 'cancelled', createdAt: 99999 }),
  ]);
  const result = readTodayAppointments(AUTHORIZED, [OWNER_BUSINESS], [THEME], NOW);
  assert.deepEqual(result.appointments.map((a) => a.bookingId), ['NX-EARLY', 'NX-LATE'],
    'cancelled rows keep their chronological position');
});

await test('ties break deterministically (end time, then booking id)', () => {
  const rows = sortByAppointmentTime([
    { bookingId: 'B', startMinutes: 600, endMinutes: 660 },
    { bookingId: 'A', startMinutes: 600, endMinutes: 660 },
    { bookingId: 'C', startMinutes: 600, endMinutes: 630 },
  ]);
  assert.deepEqual(rows.map((r) => r.bookingId), ['C', 'A', 'B']);
});

await test('the rendered DOM order matches the chronological order', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-Z', startMinutes: 960 }),
    record({ bookingId: 'NX-A', startMinutes: 600 }),
    record({ bookingId: 'NX-M', startMinutes: 780 }),
  ]);
  const utils = await renderToday();
  const rendered = [...utils.container.querySelectorAll('[data-testid^="today-appointment-"]')]
    .map((el) => el.getAttribute('data-testid'));
  assert.deepEqual(rendered, ['today-appointment-NX-A', 'today-appointment-NX-M', 'today-appointment-NX-Z']);
  cleanup();
});

/* ================================================================== */
section('4 · Status distinction using EXISTING values');

await test('existing statuses map onto the four required groups', () => {
  assert.equal(todayStatusGroup('pending_payment'), 'pending');
  assert.equal(todayStatusGroup('confirmed'), 'confirmed');
  assert.equal(todayStatusGroup('pay_at_salon'), 'confirmed');
  assert.equal(todayStatusGroup('completed'), 'completed');
  assert.equal(todayStatusGroup('cancelled'), 'cancelled');
  assert.equal(todayStatusGroup('failed'), 'cancelled');
  assert.deepEqual(TODAY_STATUS_GROUPS, ['pending', 'confirmed', 'completed', 'cancelled']);
});

await test('no new status value is invented', () => {
  const allowed = ['pending_payment', 'confirmed', 'pay_at_salon', 'completed', 'cancelled', 'failed'];
  const keys = [...TODAY_UI.matchAll(/today\.status\.([a-z_]+)/g)].map((m) => m[1]);
  for (const key of keys) {
    assert.ok(allowed.includes(key) || key === '${row.status}', `unexpected status key ${key}`);
  }
  for (const status of allowed) {
    assert.ok(ownerDashboardText('en', `today.status.${status}`) !== `today.status.${status}`, `EN label for ${status}`);
    assert.ok(ownerDashboardText('hi', `today.status.${status}`) !== `today.status.${status}`, `HI label for ${status}`);
  }
});

await test('each status renders a distinct, labelled chip', async () => {
  resetState();
  seed([
    record({ bookingId: 'NX-P', startMinutes: 540, bookingStatus: 'pending_payment' }),
    record({ bookingId: 'NX-C', startMinutes: 600, bookingStatus: 'confirmed' }),
    record({ bookingId: 'NX-D', startMinutes: 660, bookingStatus: 'completed' }),
    record({ bookingId: 'NX-X', startMinutes: 720, bookingStatus: 'cancelled' }),
  ]);
  const utils = await renderToday();
  const expect = {
    'NX-P': ['pending', 'Pending'],
    'NX-C': ['confirmed', 'Confirmed'],
    'NX-D': ['completed', 'Completed'],
    'NX-X': ['cancelled', 'Cancelled'],
  };
  const colours = new Set();
  for (const [id, [group, label]] of Object.entries(expect)) {
    const row = utils.getByTestId(`today-appointment-${id}`);
    assert.equal(row.getAttribute('data-status-group'), group);
    const chip = utils.getByTestId(`today-status-${id}`);
    assert.equal(chip.textContent.trim(), label);
    colours.add(chip.style.color);
  }
  assert.equal(colours.size, 4, 'each status group must be visually distinct');
  cleanup();
});

await test('pay_at_salon renders as its own confirmed variant label', async () => {
  resetState();
  seed([record({ bookingId: 'NX-PAS', bookingStatus: 'pay_at_salon', payAtSalon: true })]);
  const utils = await renderToday();
  assert.equal(utils.getByTestId('today-appointment-NX-PAS').getAttribute('data-status-group'), 'confirmed');
  assert.ok(utils.getByTestId('today-status-NX-PAS').textContent.includes('Pay at salon'));
  cleanup();
});

await test('status counts tally only the real rows loaded', () => {
  const rows = [
    { statusGroup: 'pending' }, { statusGroup: 'confirmed' },
    { statusGroup: 'confirmed' }, { statusGroup: 'cancelled' },
  ];
  const counts = countByStatusGroup(rows);
  assert.equal(counts.total, 4);
  assert.equal(counts.confirmed, 2);
  assert.equal(counts.pending, 1);
  assert.equal(counts.completed, 0);
  assert.equal(countByStatusGroup([]).total, 0);
});

/* ================================================================== */
section('5 · Cancelled / unavailable handling');

await test('cancelled and failed rows are flagged inactive but still shown', () => {
  assert.equal(isCancelledAppointment('cancelled'), true);
  assert.equal(isCancelledAppointment('failed'), true);
  assert.equal(isCancelledAppointment('confirmed'), false);
  assert.equal(isActiveAppointment('confirmed'), true);
  assert.equal(isActiveAppointment('completed'), false);
  assert.equal(isActiveAppointment('cancelled'), false);
});

await test('a cancelled row is dimmed, struck through and annotated', async () => {
  resetState();
  seed([record({ bookingId: 'NX-CAN', bookingStatus: 'cancelled', paymentStatus: 'cancelled' })]);
  const utils = await renderToday();
  const row = utils.getByTestId('today-appointment-NX-CAN');
  assert.equal(row.getAttribute('data-status-group'), 'cancelled');
  assert.ok(Number(row.style.opacity) < 1, 'cancelled rows are visually de-emphasised');
  const time = utils.getByTestId('today-time-NX-CAN');
  assert.match(time.innerHTML, /line-through/);
  assert.ok(utils.getByTestId('today-cancelled-note-NX-CAN'));
  cleanup();
});

await test('active rows are not dimmed or annotated as cancelled', async () => {
  resetState();
  seed([record({ bookingId: 'NX-OK', bookingStatus: 'confirmed' })]);
  const utils = await renderToday();
  assert.equal(utils.getByTestId('today-appointment-NX-OK').style.opacity, '1');
  assert.equal(utils.queryByTestId('today-cancelled-note-NX-OK'), null);
  cleanup();
});

await test('a failed payment row is grouped with cancelled and keeps its label', async () => {
  resetState();
  seed([record({ bookingId: 'NX-F', bookingStatus: 'failed', paymentStatus: 'failed' })]);
  const utils = await renderToday();
  assert.equal(utils.getByTestId('today-appointment-NX-F').getAttribute('data-status-group'), 'cancelled');
  assert.equal(utils.getByTestId('today-status-NX-F').textContent.trim(), 'Payment failed');
  cleanup();
});

/* ================================================================== */
section('6 · Required fields on screen');

await test('every required field renders for a real booking', async () => {
  resetState();
  seed([record({
    bookingId: 'NX-FULL',
    startMinutes: 630, endMinutes: 720,
    baseAmount: 1200, amountDue: 300, remainingAmount: 900,
    paymentStatus: 'paid', bookingStatus: 'confirmed',
    staffName: 'Riya',
    customer: { name: 'Asha Verma', mobile: '9876543210' },
  })]);
  const utils = await renderToday();
  assert.equal(utils.getByTestId('today-customer-NX-FULL').textContent.includes('Asha Verma'), true);
  assert.ok(utils.getByTestId('today-services-NX-FULL').textContent.includes('Signature Facial'));
  assert.ok(utils.getByTestId('today-time-NX-FULL').textContent.length > 0);
  assert.ok(utils.getByTestId('today-duration-NX-FULL').textContent.includes('1 h 30 m'));
  assert.ok(utils.getByTestId('today-status-NX-FULL'));
  assert.ok(utils.getByTestId('today-payment-NX-FULL').textContent.includes('Paid'));
  assert.ok(utils.getByTestId('today-total-NX-FULL').textContent.includes('1,200'));
  assert.ok(utils.getByTestId('today-advance-NX-FULL').textContent.includes('300'));
  assert.ok(utils.getByTestId('today-remaining-NX-FULL').textContent.includes('900'));
  assert.ok(utils.getByTestId('today-staff-NX-FULL').textContent.includes('Riya'));
  cleanup();
});

await test('advance / remaining are hidden when there is genuinely nothing to show', async () => {
  resetState();
  seed([record({
    bookingId: 'NX-NONE',
    baseAmount: 0, amountDue: 0, remainingAmount: 0, paymentStatus: 'paid',
  })]);
  const utils = await renderToday();
  assert.equal(utils.queryByTestId('today-advance-NX-NONE'), null);
  assert.equal(utils.queryByTestId('today-remaining-NX-NONE'), null);
  assert.ok(utils.getByTestId('today-total-NX-NONE'), 'total is always shown');
  cleanup();
});

await test('a missing customer name falls back to neutral copy, never a fake name', async () => {
  resetState();
  seed([record({ bookingId: 'NX-ANON', customer: { name: '', mobile: '' } })]);
  const utils = await renderToday();
  assert.equal(
    utils.getByTestId('today-customer-NX-ANON').textContent.includes(ownerDashboardText('en', 'today.noCustomerName')),
    true,
  );
  cleanup();
});

await test('duration formatting handles hours, minutes and unknown spans', () => {
  assert.equal(formatDurationLabel(90, 'h', 'm'), '1 h 30 m');
  assert.equal(formatDurationLabel(60, 'h', 'm'), '1 h');
  assert.equal(formatDurationLabel(45, 'h', 'm'), '45 m');
  assert.equal(formatDurationLabel(0, 'h', 'm'), '—');
});

/* ================================================================== */
section('7 · Loading / empty / error states');

await test('loading state renders skeletons and a busy region', async () => {
  resetState();
  seed([record()]);
  const utils = await renderToday({ forcedState: 'loading' });
  const node = utils.getByTestId('today-appointments-loading');
  assert.equal(node.getAttribute('aria-busy'), 'true');
  assert.ok(node.textContent.includes(ownerDashboardText('en', 'today.loading')));
  cleanup();
});

await test('empty state renders when the salon has no bookings today', async () => {
  resetState();
  seed([record({ dateKey: TOMORROW })]);
  const utils = await renderToday();
  const empty = utils.getByTestId('today-appointments-empty');
  assert.ok(empty.textContent.includes(ownerDashboardText('en', 'today.empty.title')));
  assert.equal(utils.queryByTestId('today-count-total'), null, 'no counts when the list is empty');
  cleanup();
});

await test('error state offers a working retry', async () => {
  resetState();
  seed([record()]);
  const utils = await renderToday({ forcedState: 'error' });
  assert.ok(utils.getByTestId('today-appointments-error'));
  await act(async () => { fireEvent.click(utils.getByTestId('today-appointments-retry')); });
  assert.ok(utils.getByTestId('today-appointments-error'), 'retry re-reads without crashing');
  cleanup();
});

await test('unauthorized actors see a refusal card instead of the list', async () => {
  resetState();
  seed([record({ bookingId: 'NX-HIDDEN' })]);
  const utils = await renderToday({ actor: NO_SALON });
  const denied = utils.getByTestId('today-appointments-denied');
  assert.equal(denied.getAttribute('role'), 'alert');
  assert.ok(!utils.container.textContent.includes('NX-HIDDEN'));
  assert.equal(utils.queryByTestId('today-appointments'), null);
  cleanup();
});

await test('the list refreshes when a booking record changes', async () => {
  resetState();
  seed([record({ bookingId: 'NX-LIVE', startMinutes: 600 })]);
  const utils = await renderToday();
  assert.ok(utils.getByTestId('today-appointment-NX-LIVE'));
  await act(async () => {
    seed([
      record({ bookingId: 'NX-LIVE', startMinutes: 600 }),
      record({ bookingId: 'NX-NEW', startMinutes: 700 }),
    ]);
  });
  assert.ok(utils.getByTestId('today-appointment-NX-NEW'));
  cleanup();
});

/* ================================================================== */
section('8 · Responsive / EN-HI / light-dark');

await test('the row grid reflows across mobile, tablet and desktop', () => {
  // 17.3 extracted the row into the SHARED OwnerAppointmentRow component;
  // the responsive grid lives there and is used by both sections.
  const rowSrc = fs.readFileSync('src/components/OwnerAppointmentRow.tsx', 'utf8');
  assert.match(rowSrc, /grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(rowSrc, /flex-wrap/);
  assert.match(TODAY_UI, /OwnerAppointmentRow/);
  assert.match(TODAY_UI, /flex-wrap/);
});

await test('Hindi renders section, status and field copy', async () => {
  resetState();
  setSiteLocale('hi');
  seed([record({ bookingId: 'NX-HI', bookingStatus: 'confirmed' })]);
  const utils = await renderToday();
  assert.ok(utils.getByTestId('today-appointments-header').textContent.includes('आज की अपॉइंटमेंट'));
  assert.equal(utils.getByTestId('today-status-NX-HI').textContent.trim(), 'पुष्ट');
  assert.ok(utils.getByTestId('today-customer-NX-HI').textContent.includes('ग्राहक'));
  setSiteLocale('en');
  cleanup();
});

await test('every 17.2 copy key has both EN and HI', () => {
  const i18n = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  const keys = [...new Set([...i18n.matchAll(/^\s{2}'(today\.[\w.]+)':/gm)].map((m) => m[1]))];
  assert.ok(keys.length >= 35, `expected the full today table, got ${keys.length}`);
  for (const key of keys) {
    assert.ok(ownerDashboardText('en', key) !== key, `missing EN for ${key}`);
    const hi = ownerDashboardText('hi', key);
    assert.ok(hi !== key, `missing HI for ${key}`);
  }
});

await test('dark mode restyles the section surfaces', async () => {
  resetState();
  seed([record({ bookingId: 'NX-DK' })]);
  const light = await renderToday();
  const lightBg = light.getByTestId('today-appointment-NX-DK').style.backgroundColor;
  cleanup();
  const dark = await renderToday({ palette: DARK_PALETTE });
  assert.notEqual(dark.getByTestId('today-appointment-NX-DK').style.backgroundColor, lightBg);
  cleanup();
});

/* ================================================================== */
section('9 · Dashboard integration · 17.1 and 10–16 preserved');

await test('the Today section mounts inside the owner dashboard shell', async () => {
  resetState();
  seed([record({ bookingId: 'NX-SHELL', startMinutes: 600 })]);
  const salon = {
    id: 'salon-1', organizationId: OWNER_BUSINESS, name: 'My Salon',
    slug: 'my-salon', address: null, city: null, isActive: true,
  };
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, {
      loadContext: () => Promise.resolve({ access: 'authorized', salon }),
    }));
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-today')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), 'today');
  assert.ok(utils.getByTestId('today-appointment-NX-SHELL'), 'real row renders through the shell');
  cleanup();
});

await test('the dashboard passes session-resolved tenant keys, not user input', () => {
  assert.match(DASH_SRC, /ownerBookingTenant\(context\.salon\)/);
  assert.match(DASH_SRC, /businessIds=\{tenant\.businessIds\}/);
  assert.ok(!/businessIds=\{\[['"]/.test(DASH_SRC), 'no literal tenant id');
});

await test('unauthorized dashboard access never reaches the Today section', async () => {
  resetState();
  seed([record({ bookingId: 'NX-NOPE' })]);
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, {
      loadContext: () => Promise.resolve({ access: 'no-ownership', salon: null }),
    }));
  });
  await act(async () => { await Promise.resolve(); });
  assert.ok(utils.getByTestId('owner-dashboard-denied'));
  assert.ok(!utils.container.textContent.includes('NX-NOPE'));
  cleanup();
});

await test('17.1 foundation still works: all seven sections and their states', async () => {
  resetState();
  const salon = {
    id: 'salon-1', organizationId: OWNER_BUSINESS, name: 'My Salon',
    slug: 'my-salon', address: null, city: null, isActive: true,
  };
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, {
      loadContext: () => Promise.resolve({ access: 'authorized', salon }),
    }));
  });
  await act(async () => { await Promise.resolve(); });
  for (const id of ['overview', 'today', 'upcoming', 'customers', 'revenue', 'calendar', 'notifications']) {
    assert.ok(utils.getByTestId(`owner-nav-${id}`), `section ${id} missing`);
  }
  // Notifications gained its real implementation in 17.8.
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-notifications')); });
  assert.ok(utils.getByTestId('owner-notifications-empty'));
  cleanup();
});

await test('17.2 implements no upcoming / customer / revenue / calendar / notification logic', () => {
  const combined = TODAY_SRC + TODAY_UI;
  for (const forbidden of ['upcomingAppointments', 'customerDirectory', 'revenueTotal', 'calendarGrid', 'sendNotification']) {
    assert.ok(!combined.includes(forbidden), `${forbidden} belongs to a later phase`);
  }
  assert.ok(!/dateKey\s*>\s*today|isFuture/.test(TODAY_SRC), 'no upcoming logic in 17.2');
});

await test('the existing booking layers are unchanged by 17.2', () => {
  const mgmt = fs.readFileSync('src/lib/bookingManagement.ts', 'utf8');
  assert.match(mgmt, /export function readSalonBookings/);
  assert.match(mgmt, /export function ownerUpdateBookingStatus/);
  const pay = fs.readFileSync('src/lib/siteBookingPayment.ts', 'utf8');
  assert.ok(pay.includes("PAYMENT_STORE_KEY = 'nexora_site_payment_records'"), 'one booking store');
  assert.match(fs.readFileSync('src/screens/Landing.tsx', 'utf8'), /BookingManagementPanel/);
});

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.2 today's appointments: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Today's Appointments verified: own-salon-only real bookings via the existing organization_members → salons chain (no job_salon_members), chronological ordering, existing pending/confirmed/completed/cancelled statuses, full field set with advance/remaining, cancelled handling, loading/empty/error states, EN/HI, light/dark, responsive, and Phase 17.1 + 10–16 preserved.");
}
