/** PHASE 17.6 — Revenue & Payment Summary acceptance. */
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
  OWNER_PAYMENT_DATA_MODE,
  bookingCountsTowardValue,
  filterRevenueRecordsByDate,
  paymentCountsAsReceived,
  readOwnerRevenueSummary,
  remainingForRecord,
  revenueRangeStart,
  summarizeOwnerRevenue,
} = await import('../src/lib/ownerRevenueSummary.ts');
const { resolveBookingActor, setSupabaseConfiguredForTests } = await import('../src/lib/bookingManagement.ts');
const { PAYMENT_STORE_KEY, PAYMENT_EVENT } = await import('../src/lib/siteBookingPayment.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { default: OwnerRevenueSummary } = await import('../src/components/OwnerRevenueSummary.tsx');
const { default: OwnerDashboard } = await import('../src/components/OwnerDashboard.tsx');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function section(name) { console.log(`\n■ ${name}`); }

const BUSINESS = 'org-owner-revenue';
const SALON = 'salon-owner-revenue';
const OTHER = 'org-foreign-revenue';
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
    dateKey: '2026-08-18',
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
    createdAt: TODAY_START + 60_000 * sequence,
    updatedAt: TODAY_START + 60_000 * sequence,
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
async function renderRevenue(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerRevenueSummary, {
      actor: AUTHORIZED,
      businessIds: [BUSINESS, SALON],
      themeIds: [THEME],
      palette,
      ...props,
    }));
  });
  return utils;
}

function mixedRecords() {
  return [
    record({ bookingId: 'paid-advance', baseAmount: 1000, amountDue: 250, remainingAmount: 750, paymentStatus: 'paid', bookingStatus: 'confirmed' }),
    record({ bookingId: 'pending', baseAmount: 2000, amountDue: 500, remainingAmount: 1500, paymentStatus: 'pending', bookingStatus: 'pending_payment' }),
    record({ bookingId: 'failed', baseAmount: 1200, amountDue: 300, remainingAmount: 900, paymentStatus: 'failed', bookingStatus: 'failed' }),
    record({ bookingId: 'cancelled-paid', baseAmount: 800, amountDue: 200, remainingAmount: 600, paymentStatus: 'paid', bookingStatus: 'cancelled' }),
    record({ bookingId: 'cancelled-attempt', baseAmount: 600, amountDue: 150, remainingAmount: 450, paymentStatus: 'cancelled', bookingStatus: 'cancelled' }),
    record({ bookingId: 'unpaid-salon', baseAmount: 500, amountDue: 0, remainingAmount: 500, paymentStatus: 'unpaid', bookingStatus: 'pay_at_salon', paymentOption: 'pay_at_salon', payAtSalon: true }),
    record({ bookingId: 'completed', baseAmount: 1000, amountDue: 1000, remainingAmount: 0, paymentStatus: 'paid', bookingStatus: 'completed' }),
    record({ bookingId: 'refunded', baseAmount: 400, amountDue: 100, remainingAmount: 300, paymentStatus: 'refunded', bookingStatus: 'cancelled' }),
  ];
}

section('Existing schema, payment architecture and ownership');
await test('summary reads the existing tenant-keyed booking/payment layer only', () => {
  const source = fs.readFileSync('src/lib/ownerRevenueSummary.ts', 'utf8');
  assert.match(source, /readSalonBookings/);
  assert.ok(!/localStorage|\.from\(|create table|insert into/i.test(source));
});
await test('existing schema has separate booking and payment fields/tables', () => {
  const bookings = fs.readFileSync('supabase/migrations/20260811000801_m08_customers_bookings.sql', 'utf8');
  const payments = fs.readFileSync('supabase/migrations/20260811000901_m09_payments.sql', 'utf8');
  assert.match(bookings, /booking_status public\.nexora_booking_status/);
  assert.match(bookings, /payment_status public\.nexora_booking_payment_status/);
  assert.match(payments, /create table if not exists public\.payments/);
  assert.match(payments, /create table if not exists public\.balance_collections/);
});
await test('database draft already scopes financial reads to owner/admin tenants', () => {
  const policies = fs.readFileSync('supabase/migrations/20260811001201_m12_rls_policies.sql', 'utf8');
  assert.match(policies, /finance_owner_select/);
  assert.match(policies, /owner_admin/);
});
await test('dashboard uses organization_members to salons.organization_id ownership', () => {
  const owner = fs.readFileSync('src/lib/ownerSalon.ts', 'utf8');
  const dashboard = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
  assert.match(owner, /organization_members/);
  assert.match(owner, /organization_id/);
  assert.match(dashboard, /allowedBusinessIds:\s*tenant\?\.businessIds/);
});
await test('17.6 never uses the staff relationship as ownership', () => {
  for (const file of ['src/lib/ownerRevenueSummary.ts', 'src/components/OwnerRevenueSummary.tsx']) {
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(source.includes('job_salon_members'), false);
  }
});
await test("another salon's financial rows are never returned", () => {
  reset();
  seed([
    record({ bookingId: 'mine', baseAmount: 1000 }),
    record({ businessId: OTHER, bookingId: 'foreign', baseAmount: 999999 }),
  ]);
  const result = readOwnerRevenueSummary(AUTHORIZED, [BUSINESS, SALON], [THEME], 'all', NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.records.map((item) => item.bookingId), ['mine']);
  assert.equal(result.summary.totalBookingValue, 1000);
});
await test('crafted foreign tenant requests and unauthorized actors are refused', () => {
  assert.deepEqual(readOwnerRevenueSummary(AUTHORIZED, [OTHER], [THEME], 'all', NOW), { ok: false, reason: 'permission-denied' });
  const denied = readOwnerRevenueSummary(DENIED, [BUSINESS], [THEME], 'all', NOW);
  assert.equal(denied.ok, false);
  assert.equal('summary' in denied, false);
});

section('Financial calculations from real record fields');
await test('total booking value excludes failed and cancelled bookings', () => {
  const summary = summarizeOwnerRevenue(mixedRecords());
  assert.equal(summary.totalBookingValue, 4500);
});
await test('received includes only successful paid amounts on active/completed bookings', () => {
  const summary = summarizeOwnerRevenue(mixedRecords());
  assert.equal(summary.receivedAmount, 1250);
  assert.deepEqual(summary.paid, { count: 2, amount: 1250 });
});
await test('failed, cancelled and unpaid amounts are never received revenue', () => {
  const rows = mixedRecords();
  for (const bookingId of ['failed', 'cancelled-paid', 'cancelled-attempt', 'unpaid-salon', 'refunded']) {
    assert.equal(paymentCountsAsReceived(rows.find((item) => item.bookingId === bookingId)), false);
  }
});
await test('remaining uses persisted remainder after paid and full value before payment', () => {
  const summary = summarizeOwnerRevenue(mixedRecords());
  assert.equal(summary.remainingAmount, 3250);
  assert.equal(remainingForRecord({ bookingStatus: 'confirmed', paymentStatus: 'paid', baseAmount: 1000, remainingAmount: 750 }), 750);
  assert.equal(remainingForRecord({ bookingStatus: 'pending_payment', paymentStatus: 'pending', baseAmount: 2000, remainingAmount: 1500 }), 2000);
});
await test('booking and payment status predicates remain separate', () => {
  assert.equal(bookingCountsTowardValue({ bookingStatus: 'confirmed' }), true);
  assert.equal(bookingCountsTowardValue({ bookingStatus: 'cancelled' }), false);
  assert.equal(paymentCountsAsReceived({ bookingStatus: 'confirmed', paymentStatus: 'paid' }), true);
  assert.equal(paymentCountsAsReceived({ bookingStatus: 'cancelled', paymentStatus: 'paid' }), false);
});
await test('pending, failed, unpaid, cancelled and refunded buckets use payment status only', () => {
  const summary = summarizeOwnerRevenue(mixedRecords());
  assert.deepEqual(summary.pending, { count: 1, amount: 500 });
  assert.deepEqual(summary.failed, { count: 1, amount: 300 });
  assert.deepEqual(summary.unpaid, { count: 1, amount: 0 });
  assert.deepEqual(summary.cancelled, { count: 1, amount: 150 });
  assert.deepEqual(summary.refunded, { count: 1, amount: 100 });
});
await test('paid value on cancelled bookings is disclosed separately and excluded', () => {
  const summary = summarizeOwnerRevenue(mixedRecords());
  assert.deepEqual(summary.cancelledPaidExcluded, { count: 1, amount: 200 });
  assert.equal(summary.receivedAmount, 1250);
});
await test('all values come from persisted amount fields with no hardcoded revenue constants', () => {
  const summary = summarizeOwnerRevenue([
    record({ baseAmount: 1379, amountDue: 417, remainingAmount: 962, paymentStatus: 'paid', bookingStatus: 'confirmed' }),
  ]);
  assert.equal(summary.totalBookingValue, 1379);
  assert.equal(summary.receivedAmount, 417);
  assert.equal(summary.remainingAmount, 962);
});
await test('empty real records produce an all-zero summary', () => {
  assert.deepEqual(summarizeOwnerRevenue([]), {
    recordsCount: 0,
    totalBookingValue: 0,
    receivedAmount: 0,
    remainingAmount: 0,
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 },
    unpaid: { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0 },
    refunded: { count: 0, amount: 0 },
    cancelledPaidExcluded: { count: 0, amount: 0 },
  });
});

section('Date filtering from existing timestamps');
await test('range starts use local calendar days, not UTC conversion', () => {
  assert.equal(revenueRangeStart('today', NOW), TODAY_START);
  assert.equal(revenueRangeStart('7d', NOW), TODAY_START - 6 * 86400000);
  assert.equal(revenueRangeStart('30d', NOW), TODAY_START - 29 * 86400000);
  assert.equal(revenueRangeStart('all', NOW), null);
  const source = fs.readFileSync('src/lib/ownerRevenueSummary.ts', 'utf8');
  assert.equal(source.includes('toISOString'), false);
});
await test('today, 7-day and 30-day ranges filter existing createdAt timestamps', () => {
  const rows = [
    record({ bookingId: 'today', createdAt: TODAY_START + 1000 }),
    record({ bookingId: 'six-days', createdAt: TODAY_START - 6 * 86400000 }),
    record({ bookingId: 'twenty-days', createdAt: TODAY_START - 20 * 86400000 }),
    record({ bookingId: 'old', createdAt: TODAY_START - 31 * 86400000 }),
  ];
  assert.deepEqual(filterRevenueRecordsByDate(rows, 'today', NOW).map((item) => item.bookingId), ['today']);
  assert.deepEqual(filterRevenueRecordsByDate(rows, '7d', NOW).map((item) => item.bookingId), ['today', 'six-days']);
  assert.deepEqual(filterRevenueRecordsByDate(rows, '30d', NOW).map((item) => item.bookingId), ['today', 'six-days', 'twenty-days']);
  assert.equal(filterRevenueRecordsByDate(rows, 'all', NOW).length, 4);
});
await test('read summary applies the selected date range before totals', () => {
  reset(); seed([
    record({ bookingId: 'today', baseAmount: 1000, createdAt: TODAY_START + 1000 }),
    record({ bookingId: 'old', baseAmount: 5000, createdAt: TODAY_START - 40 * 86400000 }),
  ]);
  const result = readOwnerRevenueSummary(AUTHORIZED, [BUSINESS], [THEME], 'today', NOW);
  assert.equal(result.ok, true);
  assert.equal(result.summary.totalBookingValue, 1000);
});

section('Revenue dashboard UI and states');
await test('summary renders required real totals and status cards', async () => {
  reset(); seed(mixedRecords());
  const ui = await renderRevenue();
  assert.ok(ui.getByTestId('owner-revenue-total-value').textContent.includes('₹4,500'));
  assert.ok(ui.getByTestId('owner-revenue-received').textContent.includes('₹1,250'));
  assert.ok(ui.getByTestId('owner-revenue-remaining').textContent.includes('₹3,250'));
  assert.ok(ui.getByTestId('owner-revenue-paid'));
  assert.ok(ui.getByTestId('owner-revenue-pending'));
  assert.ok(ui.getByTestId('owner-revenue-failed'));
});
await test('supported cancelled/refunded/excluded values render conditionally', async () => {
  reset(); seed(mixedRecords());
  const ui = await renderRevenue();
  assert.ok(ui.getByTestId('owner-revenue-cancelled'));
  assert.ok(ui.getByTestId('owner-revenue-refunded'));
  assert.ok(ui.getByTestId('owner-revenue-cancelled-paid-excluded'));
});
await test('mock mode is prominent and never presented as production payments', async () => {
  reset(); seed([record()]);
  const ui = await renderRevenue();
  assert.equal(OWNER_PAYMENT_DATA_MODE, 'mock');
  assert.equal(ui.getByTestId('owner-revenue').getAttribute('data-payment-mode'), 'mock');
  assert.match(ui.getByTestId('owner-revenue-mock-mode').textContent, /Test \/ Mock/);
  assert.match(ui.getByTestId('owner-revenue-mock-mode').textContent, /not production/i);
});
await test('date filter updates visible totals from existing records', async () => {
  reset(); seed([
    record({ bookingId: 'today', baseAmount: 1000, amountDue: 250, remainingAmount: 750, createdAt: TODAY_START + 1000 }),
    record({ bookingId: 'old', baseAmount: 5000, amountDue: 1250, remainingAmount: 3750, createdAt: TODAY_START - 40 * 86400000 }),
  ]);
  const ui = await renderRevenue();
  assert.ok(ui.getByTestId('owner-revenue-total-value').textContent.includes('₹6,000'));
  fireEvent.click(ui.getByTestId('owner-revenue-range-today'));
  assert.ok(ui.getByTestId('owner-revenue-total-value').textContent.includes('₹1,000'));
});
await test('empty, loading, error and unauthorized states are explicit', async () => {
  reset(); seed([]);
  let ui = await renderRevenue();
  assert.ok(ui.getByTestId('owner-revenue-empty'));
  cleanup();
  ui = await renderRevenue({ forcedState: 'loading' });
  assert.ok(ui.getByTestId('owner-revenue-loading'));
  cleanup();
  ui = await renderRevenue({ forcedState: 'error' });
  assert.ok(ui.getByTestId('owner-revenue-error'));
  assert.ok(ui.getByTestId('owner-revenue-retry'));
  cleanup();
  ui = await renderRevenue({ actor: DENIED });
  assert.ok(ui.getByTestId('owner-revenue-denied'));
});
await test('payment record events refresh totals immediately', async () => {
  reset(); seed([record({ baseAmount: 1000 })]);
  const ui = await renderRevenue();
  assert.ok(ui.getByTestId('owner-revenue-total-value').textContent.includes('₹1,000'));
  await act(async () => { seed([record({ baseAmount: 2500 })]); });
  assert.ok(ui.getByTestId('owner-revenue-total-value').textContent.includes('₹2,500'));
});

section('Dashboard integration, responsive, locale and theme');
await test('Revenue mounts in the existing dashboard with session-derived tenant keys', async () => {
  reset(); seed([record({ bookingId: 'dashboard-payment' })]);
  const context = {
    access: 'authorized',
    salon: { id: SALON, organizationId: BUSINESS, name: 'Owned Salon', slug: 'owned', address: null, city: null, isActive: true },
  };
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => context }));
    await Promise.resolve();
  });
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-revenue')); });
  assert.ok(ui.getByTestId('owner-revenue'));
  assert.ok(ui.getByTestId('owner-revenue-total-value').textContent.includes('₹1,000'));
});
await test('unauthorized dashboard access never exposes financial totals', async () => {
  reset(); seed([record({ baseAmount: 987654 })]);
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => ({ access: 'no-ownership', salon: null }) }));
    await Promise.resolve();
  });
  assert.ok(ui.getByTestId('owner-dashboard-denied'));
  assert.ok(!ui.container.textContent.includes('987,654'));
});
await test('Hindi repaints summary, status and mock-mode copy', async () => {
  reset(); setSiteLocale('hi'); seed([record()]);
  const ui = await renderRevenue();
  const section = ui.getByTestId('owner-revenue');
  assert.match(section.textContent, /कुल बुकिंग मूल्य/);
  assert.match(section.textContent, /प्राप्त राशि/);
  assert.match(section.textContent, /टेस्ट \/ मॉक/);
});
await test('summary layout supports mobile, tablet and desktop', () => {
  const source = fs.readFileSync('src/components/OwnerRevenueSummary.tsx', 'utf8');
  assert.match(source, /grid-cols-1/);
  assert.match(source, /sm:grid-cols-2/);
  assert.match(source, /xl:grid-cols-3/);
  assert.match(source, /lg:flex-row/);
  assert.match(source, /overflow-x-auto/);
});
await test('light and dark modes use the existing dashboard palette', () => {
  const source = fs.readFileSync('src/components/OwnerRevenueSummary.tsx', 'utf8');
  for (const token of ['palette.panel', 'palette.panelSoft', 'palette.line', 'palette.text', 'palette.accent']) {
    assert.ok(source.includes(token));
  }
});
await test('every Phase 17.6 copy key exists in English and Hindi', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  for (const key of ['revenue.heading', 'revenue.totalValue', 'revenue.received', 'revenue.remaining', 'revenue.paid', 'revenue.pending', 'revenue.failed', 'revenue.mock.title']) {
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
await test('production implementation has no fake transactions, hardcoded totals or duplicate schema', () => {
  const combined = fs.readFileSync('src/lib/ownerRevenueSummary.ts', 'utf8') + fs.readFileSync('src/components/OwnerRevenueSummary.tsx', 'utf8');
  assert.equal(/NX-\d{4,}|₹\s*\d/.test(combined), false);
  assert.equal(/create table|alter table|revenue_records|payment_summary_table/i.test(combined), false);
});

reset();
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.6 revenue & payment summary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
