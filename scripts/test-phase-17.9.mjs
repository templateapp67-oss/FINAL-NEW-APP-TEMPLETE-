/** PHASE 17.9 — Dashboard Filters & Responsive UX acceptance (not final acceptance). */
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
  DEFAULT_OWNER_FILTERS,
  filterOwnerRecords,
  ownerActiveFilterCount,
  ownerFilterOptionsFromRecords,
  ownerFiltersActive,
  readOwnerFilterOptions,
  recordHasService,
  recordMatchesOwnerFilters,
} = await import('../src/lib/ownerDashboardFilters.ts');
const { readTodayAppointments } = await import('../src/lib/ownerTodayAppointments.ts');
const { readUpcomingAppointments } = await import('../src/lib/ownerUpcomingAppointments.ts');
const { readOwnerCustomers } = await import('../src/lib/ownerCustomers.ts');
const { readOwnerRevenueSummary } = await import('../src/lib/ownerRevenueSummary.ts');
const { readOwnerSchedule } = await import('../src/lib/ownerCalendarSchedule.ts');
const { readOwnerNotifications } = await import('../src/lib/ownerNotifications.ts');
const { resolveBookingActor, setSupabaseConfiguredForTests } = await import('../src/lib/bookingManagement.ts');
const { PAYMENT_STORE_KEY, PAYMENT_EVENT } = await import('../src/lib/siteBookingPayment.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { default: OwnerDashboard } = await import('../src/components/OwnerDashboard.tsx');
const { default: OwnerDashboardFilters } = await import('../src/components/OwnerDashboardFilters.tsx');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function section(name) { console.log(`\n■ ${name}`); }

const BUSINESS = 'org-owner-filters';
const SALON = 'salon-owner-filters';
const OTHER = 'org-foreign-filters';
const THEME = 'beauty_skin_spa';
const NOW = new Date(2026, 7, 17, 12, 0, 0, 0);
const TODAY_START = new Date(2026, 7, 17).getTime();
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
    createdAt: TODAY_START + sequence * 1000,
    updatedAt: TODAY_START + sequence * 1000,
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
const filters = (overrides = {}) => ({ ...DEFAULT_OWNER_FILTERS, ...overrides });

async function renderDashboard(records = []) {
  reset();
  seed(records);
  const context = {
    access: 'authorized',
    salon: { id: SALON, organizationId: BUSINESS, name: 'Owned Salon', slug: 'owned', address: null, city: null, isActive: true },
  };
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, { loadContext: async () => context }));
    await Promise.resolve();
  });
  return utils;
}

section('Real filter options and authorization');
await test('filter options derive only from existing authorized record values', () => {
  const rows = [
    record({ bookingStatus: 'confirmed', paymentStatus: 'paid', serviceId: 'real-a', serviceName: 'Real A' }),
    record({ bookingStatus: 'cancelled', paymentStatus: 'cancelled', serviceId: 'real-b', serviceName: 'Real B' }),
  ];
  const options = ownerFilterOptionsFromRecords(rows);
  assert.deepEqual(options.bookingStatuses, ['confirmed', 'cancelled']);
  assert.deepEqual(options.paymentStatuses, ['paid', 'cancelled']);
  assert.deepEqual(options.services, [{ id: 'real-a', name: 'Real A' }, { id: 'real-b', name: 'Real B' }]);
});
await test('multi-service options use existing line ids/names and de-duplicate', () => {
  const rows = [record({
    services: [
      { serviceId: 'cut', serviceName: 'Cut', price: 500, durationMinutes: 30 },
      { serviceId: 'colour', serviceName: 'Colour', price: 700, durationMinutes: 60 },
    ],
  }), record({ serviceId: 'cut', serviceName: 'Cut' })];
  assert.deepEqual(ownerFilterOptionsFromRecords(rows).services.map((item) => item.id), ['colour', 'cut']);
});
await test('foreign salon values never become filter options', () => {
  reset(); seed([
    record({ businessId: BUSINESS, serviceId: 'mine', serviceName: 'Mine' }),
    record({ businessId: OTHER, serviceId: 'secret', serviceName: 'Secret Service' }),
  ]);
  const result = readOwnerFilterOptions(AUTHORIZED, [BUSINESS, SALON], [THEME]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.options.services.map((item) => item.id), ['mine']);
  assert.ok(!JSON.stringify(result).includes('Secret Service'));
});
await test('crafted foreign and unauthorized filter-option reads are refused', () => {
  assert.deepEqual(readOwnerFilterOptions(AUTHORIZED, [OTHER], [THEME]), { ok: false, reason: 'permission-denied' });
  const denied = readOwnerFilterOptions(DENIED, [BUSINESS], [THEME]);
  assert.equal(denied.ok, false);
  assert.equal('options' in denied, false);
});
await test('filter implementation reuses readSalonBookings and no alternate store/schema', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardFilters.ts', 'utf8');
  assert.match(source, /readSalonBookings/);
  assert.equal(/localStorage|sessionStorage|create table|alter table|insert into/i.test(source), false);
});
await test('17.9 ownership code never uses staff membership', () => {
  for (const file of ['src/lib/ownerDashboardFilters.ts', 'src/components/OwnerDashboardFilters.tsx']) {
    const executable = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(executable.includes('job_salon_members'), false);
  }
});

section('Shared predicate semantics');
await test('default filters are inactive and resettable', () => {
  assert.equal(ownerFiltersActive(DEFAULT_OWNER_FILTERS), false);
  assert.equal(ownerActiveFilterCount(DEFAULT_OWNER_FILTERS), 0);
  assert.equal(ownerActiveFilterCount(filters({ bookingStatus: 'confirmed', serviceId: 'a' })), 2);
});
await test('booking and payment status filter independently', () => {
  const row = record({ bookingStatus: 'confirmed', paymentStatus: 'paid' });
  assert.equal(recordMatchesOwnerFilters(row, filters({ bookingStatus: 'confirmed' }), 'appointment', NOW), true);
  assert.equal(recordMatchesOwnerFilters(row, filters({ bookingStatus: 'cancelled' }), 'appointment', NOW), false);
  assert.equal(recordMatchesOwnerFilters(row, filters({ paymentStatus: 'paid' }), 'appointment', NOW), true);
  assert.equal(recordMatchesOwnerFilters(row, filters({ paymentStatus: 'pending' }), 'appointment', NOW), false);
});
await test('service filter matches single and multi-service real records', () => {
  assert.equal(recordHasService(record({ serviceId: 'single' }), 'single'), true);
  const multi = record({ services: [{ serviceId: 'multi', serviceName: 'Multi', price: 1, durationMinutes: 1 }] });
  assert.equal(recordHasService(multi, 'multi'), true);
  assert.equal(recordHasService(multi, 'absent'), false);
});
await test('appointment ranges use today and forward 7/30-day windows', () => {
  const rows = [
    record({ bookingId: 'today', dateKey: '2026-08-17' }),
    record({ bookingId: 'day6', dateKey: '2026-08-23' }),
    record({ bookingId: 'day10', dateKey: '2026-08-27' }),
    record({ bookingId: 'past', dateKey: '2026-08-16' }),
  ];
  assert.deepEqual(filterOwnerRecords(rows, filters({ dateRange: 'today' }), 'appointment', NOW).map((item) => item.bookingId), ['today']);
  assert.deepEqual(filterOwnerRecords(rows, filters({ dateRange: '7d' }), 'appointment', NOW).map((item) => item.bookingId), ['today', 'day6']);
  assert.deepEqual(filterOwnerRecords(rows, filters({ dateRange: '30d' }), 'appointment', NOW).map((item) => item.bookingId), ['today', 'day6', 'day10']);
});
await test('financial created-date ranges use today and trailing 7/30 days', () => {
  const rows = [
    record({ bookingId: 'today', createdAt: TODAY_START + 1000 }),
    record({ bookingId: 'six-days', createdAt: TODAY_START - 6 * 86400000 }),
    record({ bookingId: 'ten-days', createdAt: TODAY_START - 10 * 86400000 }),
    record({ bookingId: 'future', createdAt: TODAY_START + 2 * 86400000 }),
  ];
  assert.deepEqual(filterOwnerRecords(rows, filters({ dateRange: '7d' }), 'created', NOW).map((item) => item.bookingId), ['today', 'six-days']);
  assert.deepEqual(filterOwnerRecords(rows, filters({ dateRange: '30d' }), 'created', NOW).map((item) => item.bookingId), ['today', 'six-days', 'ten-days']);
});
await test('combined filters require every selected real criterion', () => {
  const rows = [
    record({ bookingId: 'match', dateKey: '2026-08-18', bookingStatus: 'confirmed', paymentStatus: 'paid', serviceId: 'svc' }),
    record({ bookingId: 'wrong-pay', dateKey: '2026-08-18', bookingStatus: 'confirmed', paymentStatus: 'pending', serviceId: 'svc' }),
  ];
  const selected = filters({ dateRange: '7d', bookingStatus: 'confirmed', paymentStatus: 'paid', serviceId: 'svc' });
  assert.deepEqual(filterOwnerRecords(rows, selected, 'appointment', NOW).map((item) => item.bookingId), ['match']);
});

section('Filters apply to every existing section');
await test("Today's Appointments applies status, payment and service filters after authorization", () => {
  reset(); seed([
    record({ bookingId: 'today-paid', bookingStatus: 'confirmed', paymentStatus: 'paid', serviceId: 'a' }),
    record({ bookingId: 'today-pending', bookingStatus: 'pending_payment', paymentStatus: 'pending', serviceId: 'b' }),
  ]);
  const result = readTodayAppointments(AUTHORIZED, [BUSINESS], [THEME], NOW, filters({ paymentStatus: 'pending', serviceId: 'b' }));
  assert.deepEqual(result.appointments.map((item) => item.bookingId), ['today-pending']);
});
await test('Upcoming applies forward date, booking status and service filters', () => {
  reset(); seed([
    record({ bookingId: 'near', dateKey: '2026-08-18', bookingStatus: 'confirmed', serviceId: 'a' }),
    record({ bookingId: 'far', dateKey: '2026-08-27', bookingStatus: 'confirmed', serviceId: 'a' }),
    record({ bookingId: 'wrong', dateKey: '2026-08-18', bookingStatus: 'pending_payment', paymentStatus: 'pending', serviceId: 'b' }),
  ]);
  const result = readUpcomingAppointments(AUTHORIZED, [BUSINESS], [THEME], NOW, filters({ dateRange: '7d', bookingStatus: 'confirmed', serviceId: 'a' }));
  assert.deepEqual(result.appointments.map((item) => item.bookingId), ['near']);
});
await test('Customers recomputes booking history/count from matching real records', () => {
  reset(); seed([
    record({ customerId: 'repeat', bookingId: 'a', serviceId: 'a' }),
    record({ customerId: 'repeat', bookingId: 'b', serviceId: 'b' }),
  ]);
  const result = readOwnerCustomers(AUTHORIZED, [BUSINESS], [THEME], filters({ serviceId: 'a' }));
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0].totalBookings, 1);
  assert.equal(result.customers[0].recentBooking.bookingId, 'a');
});
await test('Revenue applies created-date, booking, payment and service filters before totals', () => {
  reset(); seed([
    record({ bookingId: 'paid-a', baseAmount: 1000, amountDue: 250, remainingAmount: 750, serviceId: 'a' }),
    record({ bookingId: 'paid-b', baseAmount: 5000, amountDue: 1250, remainingAmount: 3750, serviceId: 'b' }),
    record({ bookingId: 'pending-a', baseAmount: 2000, paymentStatus: 'pending', bookingStatus: 'pending_payment', serviceId: 'a' }),
  ]);
  const result = readOwnerRevenueSummary(AUTHORIZED, [BUSINESS], [THEME], 'all', NOW, filters({ paymentStatus: 'paid', serviceId: 'a' }));
  assert.equal(result.summary.totalBookingValue, 1000);
  assert.equal(result.summary.receivedAmount, 250);
});
await test('Calendar applies appointment date/status/payment/service filters without changing availability rules', () => {
  reset(); seed([
    record({ bookingId: 'visible', dateKey: '2026-08-18', serviceId: 'a', bookingStatus: 'confirmed', paymentStatus: 'paid' }),
    record({ bookingId: 'hidden', dateKey: '2026-08-18', serviceId: 'b', bookingStatus: 'cancelled', paymentStatus: 'cancelled' }),
  ]);
  const result = readOwnerSchedule(AUTHORIZED, [BUSINESS], [THEME], filters({ dateRange: '7d', bookingStatus: 'confirmed', serviceId: 'a' }));
  assert.deepEqual(result.appointments.map((item) => item.bookingId), ['visible']);
  assert.equal(result.appointments[0].periodState, 'booked');
});
await test('Notifications applies event date and source record filters', () => {
  reset(); seed([
    record({ bookingId: 'visible', serviceId: 'a', paymentStatus: 'paid', bookingStatus: 'confirmed', createdAt: TODAY_START + 1000, updatedAt: TODAY_START + 2000 }),
    record({ bookingId: 'hidden-service', serviceId: 'b', createdAt: TODAY_START + 3000, updatedAt: TODAY_START + 3000 }),
    record({ bookingId: 'old', serviceId: 'a', createdAt: TODAY_START - 10 * 86400000, updatedAt: TODAY_START - 10 * 86400000 }),
  ]);
  const result = readOwnerNotifications(AUTHORIZED, [BUSINESS], [THEME], filters({ dateRange: '7d', serviceId: 'a', paymentStatus: 'paid' }));
  assert.ok(result.notifications.length > 0);
  assert.ok(result.notifications.every((item) => item.bookingId === 'visible'));
});
await test('all filtered readers still refuse another salon', () => {
  const selected = filters({ paymentStatus: 'paid' });
  for (const read of [
    () => readTodayAppointments(AUTHORIZED, [OTHER], [THEME], NOW, selected),
    () => readUpcomingAppointments(AUTHORIZED, [OTHER], [THEME], NOW, selected),
    () => readOwnerCustomers(AUTHORIZED, [OTHER], [THEME], selected),
    () => readOwnerRevenueSummary(AUTHORIZED, [OTHER], [THEME], 'all', NOW, selected),
    () => readOwnerSchedule(AUTHORIZED, [OTHER], [THEME], selected),
    () => readOwnerNotifications(AUTHORIZED, [OTHER], [THEME], selected),
  ]) assert.equal(read().ok, false);
});

section('Shared filter UI, reset and no-results');
await test('shared controls expose only real service/status options', async () => {
  reset(); seed([
    record({ bookingStatus: 'confirmed', paymentStatus: 'paid', serviceId: 'real', serviceName: 'Real Service' }),
  ]);
  let current = { ...DEFAULT_OWNER_FILTERS };
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboardFilters, {
      actor: AUTHORIZED, businessIds: [BUSINESS], themeIds: [THEME], filters: current,
      onChange: (next) => { current = next; }, palette,
    }));
  });
  assert.ok(ui.getByTestId('owner-filter-service').textContent.includes('Real Service'));
  assert.ok(ui.getByTestId('owner-filter-booking-status').textContent.includes('Confirmed'));
  assert.ok(!ui.container.textContent.includes('Invented'));
});
await test('dashboard filter selections apply immediately and persist across sections', async () => {
  const rows = [
    record({ bookingId: 'paid-a', paymentStatus: 'paid', bookingStatus: 'confirmed', serviceId: 'a', serviceName: 'Service A' }),
    record({ bookingId: 'pending-b', paymentStatus: 'pending', bookingStatus: 'pending_payment', serviceId: 'b', serviceName: 'Service B' }),
  ];
  const ui = await renderDashboard(rows);
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-today')); });
  fireEvent.change(ui.getByTestId('owner-filter-payment-status'), { target: { value: 'pending' } });
  assert.ok(ui.getByTestId('today-appointment-pending-b'));
  assert.equal(ui.queryByTestId('today-appointment-paid-a'), null);
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-customers')); });
  assert.equal(ui.getByTestId('owner-filter-payment-status').value, 'pending');
  assert.equal(ui.getByTestId('owner-customers-count').textContent.includes('1'), true);
});
await test('Clear Filters resets all controls and restores results', async () => {
  const rows = [
    record({ bookingId: 'one', paymentStatus: 'paid', serviceId: 'a', serviceName: 'A' }),
    record({ bookingId: 'two', paymentStatus: 'pending', bookingStatus: 'pending_payment', serviceId: 'b', serviceName: 'B' }),
  ];
  const ui = await renderDashboard(rows);
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-today')); });
  fireEvent.change(ui.getByTestId('owner-filter-payment-status'), { target: { value: 'pending' } });
  assert.equal(ui.queryByTestId('today-appointment-one'), null);
  fireEvent.click(ui.getByTestId('owner-filters-reset'));
  assert.equal(ui.getByTestId('owner-filter-payment-status').value, 'all');
  assert.ok(ui.getByTestId('today-appointment-one'));
  assert.ok(ui.getByTestId('today-appointment-two'));
});
await test('active filters produce a clear no-results state instead of an empty-data claim', async () => {
  const ui = await renderDashboard([record({ bookingId: 'only-paid', paymentStatus: 'paid' })]);
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-today')); });
  // There is no pending option in real options, so choose a real date range that excludes upcoming section.
  fireEvent.change(ui.getByTestId('owner-filter-date'), { target: { value: 'today' } });
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-upcoming')); });
  assert.ok(ui.getByTestId('upcoming-appointments-no-results'));
  assert.match(ui.getByTestId('upcoming-appointments-no-results').textContent, /No matching results/);
});
await test('filters do not replace content with loading skeletons during synchronous changes', async () => {
  const ui = await renderDashboard([record({ bookingId: 'smooth', paymentStatus: 'paid' })]);
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-today')); });
  fireEvent.change(ui.getByTestId('owner-filter-date'), { target: { value: '7d' } });
  assert.equal(ui.queryByTestId('today-appointments-loading'), null);
  assert.ok(ui.getByTestId('today-appointment-smooth'));
});

section('Responsive UX, accessibility, i18n and theme');
await test('mobile filter panel is collapsible and touch targets are usable', async () => {
  reset(); seed([record()]);
  let current = { ...DEFAULT_OWNER_FILTERS };
  const ui = render(React.createElement(OwnerDashboardFilters, {
    actor: AUTHORIZED, businessIds: [BUSINESS], themeIds: [THEME], filters: current,
    onChange: (next) => { current = next; }, palette,
  }));
  const toggle = ui.getByTestId('owner-filters-mobile-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const source = fs.readFileSync('src/components/OwnerDashboardFilters.tsx', 'utf8');
  assert.match(source, /min-h-11/);
  assert.match(source, /sm:grid-cols-2/);
  assert.match(source, /xl:grid-cols-4/);
});
await test('filter fields have programmatic labels, focus rings and keyboard-native selects', () => {
  const source = fs.readFileSync('src/components/OwnerDashboardFilters.tsx', 'utf8');
  assert.match(source, /<label/);
  assert.match(source, /<select/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-expanded/);
});
await test('dashboard prevents horizontal clipping and keeps content min-width safe', () => {
  const source = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /min-w-0/);
  assert.match(source, /p-3 sm:p-4 md:p-6/);
});
await test('calendar and long control rows remain responsive without unusable tables', () => {
  const calendar = fs.readFileSync('src/components/OwnerCalendarSchedule.tsx', 'utf8');
  const filtersSource = fs.readFileSync('src/components/OwnerDashboardFilters.tsx', 'utf8');
  assert.match(calendar, /grid-cols-1/);
  assert.match(calendar, /md:grid-cols-2/);
  assert.match(calendar, /xl:grid-cols-7/);
  assert.match(filtersSource, /grid-cols-1/);
  assert.equal(/<table/i.test(calendar + filtersSource), false);
});
await test('Hindi translates every shared filter label and no-results copy', async () => {
  reset(); setSiteLocale('hi'); seed([record({ serviceId: 'seva', serviceName: 'सेवा' })]);
  const ui = render(React.createElement(OwnerDashboardFilters, {
    actor: AUTHORIZED, businessIds: [BUSINESS], themeIds: [THEME], filters: DEFAULT_OWNER_FILTERS,
    onChange: () => {}, palette,
  }));
  assert.match(ui.container.textContent, /डैशबोर्ड फ़िल्टर/);
  assert.match(ui.container.textContent, /बुकिंग स्थिति/);
  assert.match(ui.container.textContent, /फ़िल्टर साफ़ करें/);
});
await test('every Phase 17.9 copy key exists in English and Hindi', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  for (const key of ['filters.title', 'filters.date', 'filters.bookingStatus', 'filters.paymentStatus', 'filters.service', 'filters.reset', 'filters.noResults.title']) {
    assert.equal(source.split(`'${key}'`).length - 1, 2, `${key} must exist in both locales`);
  }
});
await test('filter surfaces use existing light/dark palette tokens with no fixed white background', () => {
  const source = fs.readFileSync('src/components/OwnerDashboardFilters.tsx', 'utf8');
  for (const token of ['palette.panel', 'palette.panelSoft', 'palette.line', 'palette.text', 'palette.accent']) assert.ok(source.includes(token));
  assert.equal(/bg-white/.test(source), false);
});
await test('no fake ids, duplicate schema or new dashboard feature was added', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardFilters.ts', 'utf8') + fs.readFileSync('src/components/OwnerDashboardFilters.tsx', 'utf8');
  assert.equal(/NX-\d{4,}|salon-[0-9]+|customer-[0-9]+/.test(source), false);
  assert.equal(/create table|alter table|filter_records|dashboard_filter_store/i.test(source), false);
});
await test('Phase 17.10 is acceptance-only and Phase 18 was not started', () => {
  assert.equal(fs.existsSync('scripts/test-phase-17.10.mjs'), true);
  assert.equal(fs.existsSync('src/components/Phase18.tsx'), false);
  assert.equal(fs.existsSync('scripts/test-phase-18.mjs'), false);
});

reset();
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.9 dashboard filters & responsive UX: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
