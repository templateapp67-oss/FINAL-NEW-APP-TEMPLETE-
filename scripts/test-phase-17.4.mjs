import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
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
  ownerAllowedTransitionsForRecord,
  ownerUpdateBookingStatus,
  readSalonBookings,
  resolveBookingActor,
} = await import('../src/lib/bookingManagement.ts');
const {
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
  readPaymentRecords,
} = await import('../src/lib/siteBookingPayment.ts');
const { default: OwnerTodayAppointments } = await import('../src/components/OwnerTodayAppointments.tsx');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function section(name) { console.log(`\n■ ${name}`); }

const BUSINESS = 'org-owner-17-4';
const OTHER = 'org-other-17-4';
const THEME = 'beauty_skin_spa';
const NOW = new Date(2026, 7, 17, 10, 0, 0, 0);
const AUTHORIZED = resolveBookingActor({
  supabaseConfigured: true,
  userPresent: true,
  resolution: { status: 'resolved' },
  allowedBusinessIds: [BUSINESS],
});

function record(overrides = {}) {
  return {
    id: `rec-${Math.random().toString(36).slice(2)}`,
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    businessId: BUSINESS,
    themeId: THEME,
    customerId: 'customer-browser',
    bookingId: `booking-${Math.random().toString(36).slice(2)}`,
    serviceId: 'service-real',
    serviceName: 'Existing service record',
    dateKey: '2026-08-17',
    startMinutes: 660,
    endMinutes: 720,
    baseAmount: 1200,
    amountDue: 300,
    remainingAmount: 900,
    currency: 'INR',
    paymentOption: 'advance',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    customer: { name: 'Record customer', mobile: '9000000000' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
  setSalonClockForTests(NOW);
  setSiteLocale('en');
  setSiteAppearance('light');
}
const palette = {
  panel: '#fff', panelSoft: '#f5f5f5', line: '#ddd', text: '#111', muted: '#666',
  accent: '#ac0053', accentSoft: '#fce7f3', accentText: '#fff',
};
async function renderToday(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerTodayAppointments, {
      actor: AUTHORIZED,
      businessIds: [BUSINESS],
      themeIds: [THEME],
      palette,
      ...props,
    }));
  });
  return utils;
}

section('Ownership and data-layer authorization');
await test('session-resolved tenant scope refuses a different salon even when its exact id is supplied', () => {
  reset(); seed([record({ businessId: OTHER, bookingId: 'foreign-row' })]);
  const result = ownerUpdateBookingStatus(AUTHORIZED, OTHER, THEME, 'foreign-row', 'completed');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
});
await test('scoped reads refuse a foreign tenant instead of returning a silent empty list', () => {
  const result = readSalonBookings(AUTHORIZED, OTHER, THEME);
  assert.deepEqual(result, { ok: false, reason: 'permission-denied' });
});
await test('dashboard actor scope is derived from ownerBookingTenant', () => {
  const source = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
  assert.match(source, /allowedBusinessIds:\s*tenant\?\.businessIds/);
  assert.match(source, /ownerBookingTenant\(context\.salon\)/);
});
await test('ownership code does not use the staff relationship', () => {
  for (const file of ['src/components/OwnerBookingStatusControls.tsx', 'src/lib/bookingManagement.ts']) {
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(source.includes('job_salon_members'), false);
  }
});

section('Valid transitions and payment prerequisite');
await test('unpaid advance Pending can only be Cancelled', () => {
  assert.deepEqual(ownerAllowedTransitionsForRecord({ bookingStatus: 'pending_payment', paymentStatus: 'pending', paymentOption: 'advance' }), ['cancelled']);
});
await test('paid advance Pending can be Confirmed or Cancelled', () => {
  assert.deepEqual(ownerAllowedTransitionsForRecord({ bookingStatus: 'pending_payment', paymentStatus: 'paid', paymentOption: 'advance' }), ['confirmed', 'cancelled']);
});
await test('Confirmed can be Completed or Cancelled and terminal statuses have no exits', () => {
  assert.deepEqual(ownerAllowedTransitionsForRecord({ bookingStatus: 'confirmed', paymentStatus: 'paid', paymentOption: 'advance' }), ['completed', 'cancelled']);
  for (const bookingStatus of ['completed', 'cancelled', 'failed']) {
    assert.deepEqual(ownerAllowedTransitionsForRecord({ bookingStatus, paymentStatus: 'paid', paymentOption: 'advance' }), []);
  }
});
await test('crafted confirmation is refused when required advance has not succeeded', () => {
  reset(); seed([record({ bookingId: 'unpaid', bookingStatus: 'pending_payment', paymentStatus: 'pending' })]);
  const result = ownerUpdateBookingStatus(AUTHORIZED, BUSINESS, THEME, 'unpaid', 'confirmed');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'advance-payment-required');
  assert.equal(readPaymentRecords()[0].bookingStatus, 'pending_payment');
});
await test('duplicate and invalid updates are refused without touching the record', () => {
  reset(); seed([record({ bookingId: 'same', bookingStatus: 'confirmed' })]);
  assert.equal(ownerUpdateBookingStatus(AUTHORIZED, BUSINESS, THEME, 'same', 'confirmed').reason, 'duplicate-update');
  assert.equal(ownerUpdateBookingStatus(AUTHORIZED, BUSINESS, THEME, 'same', 'pending_payment').reason, 'invalid-transition');
  assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
});
await test('booking status remains distinct from the existing payment status', () => {
  reset(); seed([record({ bookingId: 'cancel-paid', bookingStatus: 'confirmed', paymentStatus: 'paid' })]);
  const result = ownerUpdateBookingStatus(AUTHORIZED, BUSINESS, THEME, 'cancel-paid', 'cancelled');
  assert.equal(result.ok, true);
  assert.equal(result.record.bookingStatus, 'cancelled');
  assert.equal(result.record.paymentStatus, 'paid');
});

section('Dashboard controls and immediate refresh');
await test('unpaid Pending row has Cancel but never Confirm', async () => {
  reset(); seed([record({ bookingId: 'pending-ui', bookingStatus: 'pending_payment', paymentStatus: 'pending' })]);
  const ui = await renderToday();
  assert.equal(ui.queryByTestId('today-confirm-pending-ui'), null);
  assert.ok(ui.getByTestId('today-cancel-pending-ui'));
});
await test('paid Pending row exposes Confirm and updates the visible status immediately', async () => {
  reset(); seed([record({ bookingId: 'confirm-ui', bookingStatus: 'pending_payment', paymentStatus: 'paid' })]);
  const ui = await renderToday();
  await act(async () => { fireEvent.click(ui.getByTestId('today-confirm-confirm-ui')); await Promise.resolve(); });
  assert.equal(ui.getByTestId('today-status-confirm-ui').textContent, 'Confirmed');
  assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
});
await test('Confirmed row exposes Complete and updates immediately', async () => {
  reset(); seed([record({ bookingId: 'complete-ui' })]);
  const ui = await renderToday();
  await act(async () => { fireEvent.click(ui.getByTestId('today-complete-complete-ui')); await Promise.resolve(); });
  assert.equal(ui.getByTestId('today-status-complete-ui').textContent, 'Completed');
});
await test('Cancel always requires a separate confirmation action', async () => {
  reset(); seed([record({ bookingId: 'cancel-ui' })]);
  const ui = await renderToday();
  fireEvent.click(ui.getByTestId('today-cancel-cancel-ui'));
  assert.equal(readPaymentRecords()[0].bookingStatus, 'confirmed');
  assert.ok(ui.getByTestId('today-cancel-confirmation-cancel-ui'));
  await act(async () => { fireEvent.click(ui.getByTestId('today-cancel-confirm-cancel-ui')); await Promise.resolve(); });
  assert.equal(readPaymentRecords()[0].bookingStatus, 'cancelled');
  assert.equal(ui.getByTestId('today-status-cancel-ui').textContent, 'Cancelled');
});
await test('terminal rows render no status controls', async () => {
  reset(); seed([record({ bookingId: 'terminal-ui', bookingStatus: 'completed' })]);
  const ui = await renderToday();
  assert.equal(ui.queryByTestId('today-status-controls-terminal-ui'), null);
});
await test('permission-denied is rendered as a refusal state', async () => {
  reset(); seed([record()]);
  const denied = resolveBookingActor({ supabaseConfigured: true, userPresent: true, resolution: { status: 'no-membership' } });
  const ui = await renderToday({ actor: denied });
  assert.ok(ui.getByTestId('today-appointments-denied'));
});

section('Responsive, localized, themed and scope-limited');
await test('controls use wrapping/touch-sized responsive layout', () => {
  const source = fs.readFileSync('src/components/OwnerBookingStatusControls.tsx', 'utf8');
  assert.match(source, /flex-wrap/);
  assert.match(source, /min-h-9/);
  assert.match(source, /sm:flex-row/);
});
await test('all Phase 17.4 English and Hindi keys are present', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  for (const key of ['status.manage', 'status.confirm', 'status.complete', 'status.cancelConfirm', 'status.error.paymentRequired']) {
    assert.equal(source.split(`'${key}'`).length - 1, 2, `${key} should exist in EN and HI`);
  }
});
await test('Hindi controls render through the existing locale preference', async () => {
  reset(); setSiteLocale('hi'); seed([record({ bookingId: 'hindi-ui' })]);
  const ui = await renderToday();
  assert.match(ui.getByTestId('today-status-controls-hindi-ui').textContent, /पूर्ण|रद्द/);
});
await test('controls use the supplied light/dark palette rather than fixed panel colours', () => {
  const source = fs.readFileSync('src/components/OwnerBookingStatusControls.tsx', 'utf8');
  assert.match(source, /palette\.panelSoft/);
  assert.match(source, /palette\.line/);
  assert.match(source, /palette\.accent/);
});
await test('no fake booking rows, hardcoded IDs, or new booking fields were introduced', () => {
  const source = fs.readFileSync('src/components/OwnerBookingStatusControls.tsx', 'utf8');
  assert.equal(/NX-\d+/.test(source), false);
  assert.equal(source.includes('localStorage'), false, 'UI must use the existing data layer');
});
await test('customer, revenue, calendar and notification features remain untouched', () => {
  const source = fs.readFileSync('src/components/OwnerBookingStatusControls.tsx', 'utf8');
  for (const forbidden of ['customer management', 'revenue', 'calendar', 'notification']) {
    assert.equal(source.toLowerCase().includes(forbidden), false);
  }
});

reset();
console.log(`\n────────────────────────────────────────`);
console.log(`Phase 17.4 booking status management: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
