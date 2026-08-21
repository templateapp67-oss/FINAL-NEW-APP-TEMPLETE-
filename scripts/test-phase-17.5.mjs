/** PHASE 17.5 — Customer Management acceptance. */
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
  customersFromBookingRecords,
  filterOwnerCustomers,
  readOwnerCustomers,
  sortCustomerBookingHistory,
} = await import('../src/lib/ownerCustomers.ts');
const { resolveBookingActor } = await import('../src/lib/bookingManagement.ts');
const { PAYMENT_STORE_KEY, PAYMENT_EVENT } = await import('../src/lib/siteBookingPayment.ts');
const { default: OwnerCustomers } = await import('../src/components/OwnerCustomers.tsx');
const { default: OwnerDashboard } = await import('../src/components/OwnerDashboard.tsx');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function section(name) { console.log(`\n■ ${name}`); }

const BUSINESS = 'org-owner-customer';
const SALON = 'salon-owner-customer';
const OTHER = 'org-foreign-customer';
const THEME = 'beauty_skin_spa';
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
  const created = 1_700_000_000_000 + sequence * 1000;
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
    customer: { name: `Customer ${sequence}`, mobile: `90000000${String(sequence).padStart(2, '0')}`, email: '' },
    createdAt: created,
    updatedAt: created,
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
  setSiteLocale('en');
  setSiteAppearance('light');
}
const palette = {
  panel: '#fff', panelSoft: '#f8f7f5', line: '#ddd', text: '#111', muted: '#666',
  accent: '#ac0053', accentSoft: '#fce7f3', accentText: '#fff',
};
async function renderCustomers(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerCustomers, {
      actor: AUTHORIZED,
      businessIds: [BUSINESS, SALON],
      themeIds: [THEME],
      palette,
      ...props,
    }));
  });
  return utils;
}

section('Schema reuse and ownership');
await test('customer directory reads the existing booking layer and defines no persistence', () => {
  const source = fs.readFileSync('src/lib/ownerCustomers.ts', 'utf8');
  assert.match(source, /readSalonBookings/);
  assert.ok(!/localStorage|\.from\(|create table|insert into/i.test(source));
});
await test('existing schema relationships are customers.business_id and bookings.customer_id', () => {
  const migration = fs.readFileSync('supabase/migrations/20260811000801_m08_customers_bookings.sql', 'utf8');
  assert.match(migration, /create table if not exists public\.customers/);
  assert.match(migration, /customer_id uuid not null references public\.customers/);
  assert.match(migration, /business_id uuid not null/);
});
await test('database draft already scopes customer and booking SELECT through tenant roles', () => {
  const policies = fs.readFileSync('supabase/migrations/20260811001201_m12_rls_policies.sql', 'utf8');
  assert.match(policies, /frontdesk_select on public\.customers/);
  assert.match(policies, /has_business_role\(business_id/);
});
await test('dashboard ownership remains organization_members to salons.organization_id', () => {
  const owner = fs.readFileSync('src/lib/ownerSalon.ts', 'utf8');
  const dashboard = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
  assert.match(owner, /organization_members/);
  assert.match(owner, /organization_id/);
  assert.match(dashboard, /ownerBookingTenant\(context\.salon\)/);
  assert.match(dashboard, /allowedBusinessIds:\s*tenant\?\.businessIds/);
});
await test('staff membership is never used by the 17.5 implementation', () => {
  for (const file of ['src/lib/ownerCustomers.ts', 'src/components/OwnerCustomers.tsx']) {
    const executable = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(executable.includes('job_salon_members'), false);
  }
});
await test("another salon's customer and private contact data never appear", () => {
  reset();
  seed([
    record({ customerId: 'mine', customer: { name: 'Own customer', mobile: '9000011111', email: 'own@example.test' } }),
    record({ businessId: OTHER, customerId: 'foreign', customer: { name: 'Private foreign', mobile: '9888888888', email: 'private@example.test' } }),
  ]);
  const result = readOwnerCustomers(AUTHORIZED, [BUSINESS, SALON], [THEME]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.customers.map((item) => item.customerId), ['mine']);
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
});
await test('a crafted foreign tenant read is permission-denied', () => {
  const result = readOwnerCustomers(AUTHORIZED, [OTHER], [THEME]);
  assert.deepEqual(result, { ok: false, reason: 'permission-denied' });
});
await test('unauthorized actors get a refusal and no customers field', () => {
  reset(); seed([record()]);
  const result = readOwnerCustomers(DENIED, [BUSINESS], [THEME]);
  assert.equal(result.ok, false);
  assert.equal('customers' in result, false);
});

section('Real customer projection and history');
await test('an empty booking store yields no customers, never fake records', () => {
  reset(); seed([]);
  const result = readOwnerCustomers(AUTHORIZED, [BUSINESS], [THEME]);
  assert.deepEqual(result, { ok: true, customers: [] });
});
await test('one customer is grouped by the existing customerId across real bookings', () => {
  const rows = [
    record({ customerId: 'repeat', bookingId: 'older' }),
    record({ customerId: 'repeat', bookingId: 'newer' }),
  ];
  const customers = customersFromBookingRecords(rows);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].totalBookings, 2);
  assert.deepEqual(customers[0].bookingHistory.map((item) => item.bookingId), ['newer', 'older']);
});
await test('different existing customerIds remain distinct even when names match', () => {
  const rows = [
    record({ customerId: 'a', customer: { name: 'Same Name', mobile: '9000010001' } }),
    record({ customerId: 'b', customer: { name: 'Same Name', mobile: '9000010002' } }),
  ];
  assert.equal(customersFromBookingRecords(rows).length, 2);
});
await test('contact fields come from newest non-empty real snapshots', () => {
  const older = record({
    customerId: 'contact', updatedAt: 100,
    customer: { name: 'Old Name', mobile: '9000000001', email: 'available@example.test' },
  });
  const newer = record({
    customerId: 'contact', updatedAt: 200,
    customer: { name: 'New Name', mobile: '9000000002', email: '' },
  });
  const customer = customersFromBookingRecords([older, newer])[0];
  assert.equal(customer.name, 'New Name');
  assert.equal(customer.phone, '9000000002');
  assert.equal(customer.email, 'available@example.test');
});
await test('recent activity and directory ordering use existing timestamps', () => {
  const old = record({ customerId: 'old', updatedAt: 100, createdAt: 100 });
  const recent = record({ customerId: 'recent', updatedAt: 300, createdAt: 200 });
  const customers = customersFromBookingRecords([old, recent]);
  assert.deepEqual(customers.map((item) => item.customerId), ['recent', 'old']);
  assert.equal(customers[0].recentActivityAt, 300);
});
await test('history sorting is deterministic from create/update/reference fields', () => {
  const sorted = sortCustomerBookingHistory([
    { id: '1', bookingId: 'B', dateKey: '2026-01-01', startMinutes: 1, endMinutes: 2, serviceNames: ['A'], bookingStatus: 'confirmed', createdAt: 10, updatedAt: 20 },
    { id: '2', bookingId: 'A', dateKey: '2026-01-02', startMinutes: 1, endMinutes: 2, serviceNames: ['B'], bookingStatus: 'completed', createdAt: 10, updatedAt: 20 },
    { id: '3', bookingId: 'C', dateKey: '2026-01-03', startMinutes: 1, endMinutes: 2, serviceNames: ['C'], bookingStatus: 'cancelled', createdAt: 30, updatedAt: 30 },
  ]);
  assert.deepEqual(sorted.map((item) => item.bookingId), ['C', 'A', 'B']);
});
await test('history preserves existing booking fields and every service line', () => {
  const customer = customersFromBookingRecords([record({
    customerId: 'lines', bookingId: 'line-booking', bookingStatus: 'completed',
    services: [
      { serviceId: 's1', serviceName: 'Cut', price: 500, durationMinutes: 30 },
      { serviceId: 's2', serviceName: 'Style', price: 700, durationMinutes: 40 },
    ],
  })])[0];
  assert.deepEqual(customer.recentBooking.serviceNames, ['Cut', 'Style']);
  assert.equal(customer.recentBooking.bookingStatus, 'completed');
  assert.equal(customer.recentBooking.bookingId, 'line-booking');
});
await test('malformed rows without an existing customer id are ignored, not assigned a fake id', () => {
  assert.deepEqual(customersFromBookingRecords([record({ customerId: '' })]), []);
});

section('Search over authorized real data');
await test('search matches real name, phone and available email', () => {
  const customers = customersFromBookingRecords([
    record({ customerId: 'one', customer: { name: 'Anita Rao', mobile: '9123456780', email: 'anita@example.test' } }),
    record({ customerId: 'two', customer: { name: 'Meera', mobile: '9988776655', email: '' } }),
  ]);
  assert.deepEqual(filterOwnerCustomers(customers, 'anita').map((item) => item.customerId), ['one']);
  assert.deepEqual(filterOwnerCustomers(customers, '9988').map((item) => item.customerId), ['two']);
  assert.deepEqual(filterOwnerCustomers(customers, '@example').map((item) => item.customerId), ['one']);
});
await test('search matches existing booking reference and service name', () => {
  const customers = customersFromBookingRecords([record({ customerId: 'one', bookingId: 'REF-REAL', serviceName: 'Hair Ritual' })]);
  assert.equal(filterOwnerCustomers(customers, 'ref-real').length, 1);
  assert.equal(filterOwnerCustomers(customers, 'ritual').length, 1);
});
await test('blank search preserves recent-activity ordering', () => {
  const customers = customersFromBookingRecords([
    record({ customerId: 'older', updatedAt: 10 }),
    record({ customerId: 'newer', updatedAt: 20 }),
  ]);
  assert.deepEqual(filterOwnerCustomers(customers, '  ').map((item) => item.customerId), ['newer', 'older']);
});

section('Customers UI');
await test('customer card shows permitted fields, total and recent booking', async () => {
  reset(); seed([
    record({ customerId: 'visible', bookingId: 'recent-ref', customer: { name: 'Visible Person', mobile: '9111111111', email: 'visible@example.test' } }),
    record({ customerId: 'visible', bookingId: 'older-ref', updatedAt: 100, createdAt: 100 }),
  ]);
  const ui = await renderCustomers();
  const card = ui.getByTestId('owner-customer-visible');
  for (const value of ['Visible Person', '9111111111', 'visible@example.test', 'Total bookings: 2', 'recent-ref']) {
    assert.ok(card.textContent.includes(value), `missing ${value}`);
  }
});
await test('optional email is not rendered when no booking contains one', async () => {
  reset(); seed([record({ customerId: 'no-email', customer: { name: 'No Email', mobile: '9222222222', email: '' } })]);
  const ui = await renderCustomers();
  assert.equal(ui.queryByTestId('owner-customer-email-no-email'), null);
});
await test('history opens on demand and lists only that customer bookings', async () => {
  reset(); seed([
    record({ customerId: 'target', bookingId: 'target-one' }),
    record({ customerId: 'target', bookingId: 'target-two' }),
    record({ customerId: 'other', bookingId: 'other-one' }),
  ]);
  const ui = await renderCustomers();
  assert.equal(ui.queryByTestId('owner-customer-history-target'), null);
  fireEvent.click(ui.getByTestId('owner-customer-history-toggle-target'));
  const history = ui.getByTestId('owner-customer-history-target');
  assert.ok(history.textContent.includes('target-one'));
  assert.ok(history.textContent.includes('target-two'));
  assert.ok(!history.textContent.includes('other-one'));
});
await test('UI search filters cards and clear restores them', async () => {
  reset(); seed([
    record({ customerId: 'alpha', customer: { name: 'Alpha Person', mobile: '9000000001' } }),
    record({ customerId: 'beta', customer: { name: 'Beta Person', mobile: '9000000002' } }),
  ]);
  const ui = await renderCustomers();
  fireEvent.change(ui.getByTestId('owner-customers-search'), { target: { value: 'Alpha' } });
  assert.ok(ui.getByTestId('owner-customer-alpha'));
  assert.equal(ui.queryByTestId('owner-customer-beta'), null);
  fireEvent.click(ui.getByTestId('owner-customers-search-clear'));
  assert.ok(ui.getByTestId('owner-customer-beta'));
});
await test('empty, loading, error and unauthorized states are explicit', async () => {
  reset(); seed([]);
  let ui = await renderCustomers();
  assert.ok(ui.getByTestId('owner-customers-empty'));
  cleanup();
  ui = await renderCustomers({ forcedState: 'loading' });
  assert.ok(ui.getByTestId('owner-customers-loading'));
  cleanup();
  ui = await renderCustomers({ forcedState: 'error' });
  assert.ok(ui.getByTestId('owner-customers-error'));
  assert.ok(ui.getByTestId('owner-customers-retry'));
  cleanup();
  ui = await renderCustomers({ actor: DENIED });
  assert.ok(ui.getByTestId('owner-customers-denied'));
});
await test('new real booking events refresh the directory immediately', async () => {
  reset(); seed([record({ customerId: 'first' })]);
  const ui = await renderCustomers();
  assert.equal(ui.getByTestId('owner-customers-count').textContent.includes('1'), true);
  await act(async () => { seed([record({ customerId: 'first' }), record({ customerId: 'second' })]); });
  assert.equal(ui.getByTestId('owner-customers-count').textContent.includes('2'), true);
});

section('Dashboard integration, responsive, locale and theme');
await test('Customers mounts in the existing dashboard using session-derived tenant keys', async () => {
  reset(); seed([record({ customerId: 'dashboard-customer' })]);
  const context = {
    access: 'authorized',
    salon: { id: SALON, organizationId: BUSINESS, name: 'Owned Salon', slug: 'owned', address: null, city: null, isActive: true },
  };
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => context }));
    await Promise.resolve();
  });
  await act(async () => { fireEvent.click(ui.getByTestId('owner-nav-customers')); });
  assert.ok(ui.getByTestId('owner-customers'));
  assert.ok(ui.getByTestId('owner-customer-dashboard-customer'));
});
await test('unauthorized dashboard access never exposes customer contacts', async () => {
  reset(); seed([record({ customer: { name: 'Hidden Contact', mobile: '9555555555', email: 'hidden@example.test' } })]);
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => ({ access: 'no-ownership', salon: null }) }));
    await Promise.resolve();
  });
  assert.ok(ui.getByTestId('owner-dashboard-denied'));
  assert.ok(!ui.container.textContent.includes('hidden@example.test'));
});
await test('Hindi repaints customer headings, totals and history action', async () => {
  reset(); setSiteLocale('hi'); seed([record({ customerId: 'hindi' })]);
  const ui = await renderCustomers();
  const section = ui.getByTestId('owner-customers');
  assert.match(section.textContent, /ग्राहक/);
  assert.match(section.textContent, /कुल बुकिंग/);
  assert.match(section.textContent, /इतिहास देखें/);
});
await test('cards and controls reflow across mobile, tablet and desktop', () => {
  const source = fs.readFileSync('src/components/OwnerCustomers.tsx', 'utf8');
  assert.match(source, /sm:flex-row/);
  assert.match(source, /md:grid-cols/);
  assert.match(source, /sm:grid-cols/);
  assert.match(source, /min-h-10/);
});
await test('light/dark styling comes from the existing dashboard palette', () => {
  const source = fs.readFileSync('src/components/OwnerCustomers.tsx', 'utf8');
  for (const token of ['palette.panel', 'palette.panelSoft', 'palette.line', 'palette.text', 'palette.accent']) {
    assert.ok(source.includes(token));
  }
});
await test('every Phase 17.5 copy key exists in English and Hindi', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  for (const key of ['customers.heading', 'customers.loading', 'customers.empty.title', 'customers.totalBookings', 'customers.viewHistory', 'customers.search.placeholder']) {
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
await test('no hardcoded customer records or invented schema appear in production implementation', () => {
  const combined = fs.readFileSync('src/lib/ownerCustomers.ts', 'utf8') + fs.readFileSync('src/components/OwnerCustomers.tsx', 'utf8');
  assert.equal(/Customer\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(combined), false);
  assert.equal(/NX-\d{4,}/.test(combined), false);
  assert.equal(/create table|alter table|customer_directory|customer_records/i.test(combined), false);
});

reset();
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.5 customer management: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
