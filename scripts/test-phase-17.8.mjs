/** PHASE 17.8 — Owner Notifications acceptance (not final Phase 17 acceptance). */
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
  notificationsFromBookingRecord,
  readOwnerNotifications,
  sortOwnerNotifications,
} = await import('../src/lib/ownerNotifications.ts');
const { resolveBookingActor } = await import('../src/lib/bookingManagement.ts');
const { PAYMENT_STORE_KEY, PAYMENT_EVENT } = await import('../src/lib/siteBookingPayment.ts');
const { default: OwnerNotifications } = await import('../src/components/OwnerNotifications.tsx');
const { default: OwnerDashboard } = await import('../src/components/OwnerDashboard.tsx');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function section(name) { console.log(`\n■ ${name}`); }

const BUSINESS = 'org-owner-notifications';
const SALON = 'salon-owner-notifications';
const OTHER = 'org-foreign-notifications';
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
    dateKey: '2026-08-18',
    startMinutes: 600,
    endMinutes: 660,
    baseAmount: 1000,
    amountDue: 250,
    remainingAmount: 750,
    currency: 'INR',
    paymentOption: 'advance',
    paymentMethod: 'upi',
    paymentStatus: 'pending',
    bookingStatus: 'pending_payment',
    customer: { name: `Private Customer ${sequence}`, mobile: '9000000000', email: 'private@example.test' },
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
async function renderNotifications(props = {}) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerNotifications, {
      actor: AUTHORIZED,
      businessIds: [BUSINESS, SALON],
      themeIds: [THEME],
      palette,
      ...props,
    }));
  });
  return utils;
}

section('Existing notification architecture and ownership');
await test('existing schema already defines notifications and read state', () => {
  const schema = fs.readFileSync('supabase/migrations/20260811001001_m10_referrals_notifications_activity.sql', 'utf8');
  assert.match(schema, /create table if not exists public\.notifications/);
  assert.match(schema, /business_id uuid not null/);
  assert.match(schema, /user_id uuid not null/);
  assert.match(schema, /is_read boolean not null default false/);
  assert.match(schema, /metadata jsonb/);
});
await test('existing RLS makes notifications private to the user within the tenant', () => {
  const policies = fs.readFileSync('supabase/migrations/20260811001201_m12_rls_policies.sql', 'utf8');
  assert.match(policies, /notifications_own_select/);
  assert.match(policies, /notifications_own_update/);
  assert.match(policies, /user_id = auth\.uid\(\) and public\.is_business_member\(business_id\)/);
});
await test('current adapter creates no duplicate notification store, bus or table', () => {
  const source = fs.readFileSync('src/lib/ownerNotifications.ts', 'utf8');
  assert.match(source, /readSalonBookings/);
  assert.equal(/localStorage|sessionStorage|create table|insert into|new Event\(/i.test(source), false);
});
await test('dashboard ownership remains organization_members to salons.organization_id', () => {
  const owner = fs.readFileSync('src/lib/ownerSalon.ts', 'utf8');
  const dashboard = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
  assert.match(owner, /organization_members/);
  assert.match(owner, /organization_id/);
  assert.match(dashboard, /allowedBusinessIds:\s*tenant\?\.businessIds/);
  assert.match(dashboard, /OwnerNotifications/);
});
await test('17.8 never uses staff membership for ownership', () => {
  for (const file of ['src/lib/ownerNotifications.ts', 'src/components/OwnerNotifications.tsx']) {
    const executable = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(executable.includes('job_salon_members'), false);
  }
});
await test("another salon's notifications and customer data never appear", () => {
  reset(); seed([
    record({ bookingId: 'mine' }),
    record({ businessId: OTHER, bookingId: 'foreign', customer: { name: 'Foreign Private', mobile: '9888888888', email: 'foreign@example.test' } }),
  ]);
  const result = readOwnerNotifications(AUTHORIZED, [BUSINESS, SALON], [THEME]);
  assert.equal(result.ok, true);
  assert.ok(result.notifications.every((item) => item.bookingId === 'mine'));
  assert.ok(!JSON.stringify(result.notifications).includes('Foreign Private'));
  assert.ok(!JSON.stringify(result.notifications).includes('foreign@example.test'));
});
await test('crafted foreign tenant and unauthorized reads are refused', () => {
  assert.deepEqual(readOwnerNotifications(AUTHORIZED, [OTHER], [THEME]), { ok: false, reason: 'permission-denied' });
  const denied = readOwnerNotifications(DENIED, [BUSINESS], [THEME]);
  assert.equal(denied.ok, false);
  assert.equal('notifications' in denied, false);
});

section('Notifications from real persisted events only');
await test('every real booking record produces a new-booking event at createdAt', () => {
  const row = record({ bookingId: 'new-real', createdAt: 100, updatedAt: 100 });
  const events = notificationsFromBookingRecord(row);
  assert.deepEqual(events.map((item) => item.type), ['new_booking']);
  assert.equal(events[0].occurredAt, 100);
  assert.equal(events[0].bookingId, 'new-real');
});
await test('successful paid advance produces a payment-received event', () => {
  const row = record({ paymentStatus: 'paid', bookingStatus: 'confirmed', amountDue: 275, createdAt: 100, updatedAt: 200 });
  const events = notificationsFromBookingRecord(row);
  const payment = events.find((item) => item.type === 'payment_received');
  assert.ok(payment);
  assert.equal(payment.amount, 275);
  assert.equal(payment.occurredAt, 200);
});
await test('booking cancellation produces a cancellation event, not a generic status duplicate', () => {
  const row = record({ bookingStatus: 'cancelled', paymentStatus: 'cancelled', createdAt: 100, updatedAt: 200 });
  const events = notificationsFromBookingRecord(row);
  assert.ok(events.some((item) => item.type === 'booking_cancelled'));
  assert.equal(events.some((item) => item.type === 'status_changed'), false);
});
await test('confirmed/completed persisted changes produce status-change events', () => {
  for (const bookingStatus of ['confirmed', 'completed']) {
    const events = notificationsFromBookingRecord(record({ bookingStatus, paymentStatus: 'paid', createdAt: 100, updatedAt: 200 }));
    assert.ok(events.some((item) => item.type === 'status_changed'), `${bookingStatus} should have status change`);
  }
});
await test('existing failed payment state produces a payment-failed event', () => {
  const events = notificationsFromBookingRecord(record({ paymentStatus: 'failed', bookingStatus: 'failed', createdAt: 100, updatedAt: 200 }));
  assert.ok(events.some((item) => item.type === 'payment_failed'));
});
await test('no status history is invented when timestamps show no change', () => {
  const events = notificationsFromBookingRecord(record({ bookingStatus: 'confirmed', paymentStatus: 'unpaid', createdAt: 100, updatedAt: 100 }));
  assert.deepEqual(events.map((item) => item.type), ['new_booking']);
});
await test('multi-service names come from existing booking lines', () => {
  const events = notificationsFromBookingRecord(record({
    services: [
      { serviceId: 'one', serviceName: 'Cut', price: 500, durationMinutes: 30 },
      { serviceId: 'two', serviceName: 'Colour', price: 700, durationMinutes: 60 },
    ],
  }));
  assert.deepEqual(events[0].serviceNames, ['Cut', 'Colour']);
});
await test('event keys derive only from existing record id and represented type', () => {
  const row = record({ id: 'existing-row-id' });
  assert.equal(notificationsFromBookingRecord(row)[0].key, 'existing-row-id:new_booking');
});
await test('events sort newest first with deterministic event priority', () => {
  const row = record({ id: 'row', bookingId: 'B', paymentStatus: 'paid', bookingStatus: 'confirmed', createdAt: 100, updatedAt: 200 });
  const sorted = sortOwnerNotifications(notificationsFromBookingRecord(row));
  assert.deepEqual(sorted.map((item) => item.type), ['payment_received', 'status_changed', 'new_booking']);
});
await test('empty records produce no fake notifications', () => {
  reset(); seed([]);
  const result = readOwnerNotifications(AUTHORIZED, [BUSINESS], [THEME]);
  assert.deepEqual(result, { ok: true, records: [], notifications: [] });
});
await test('read/unread is not fabricated by the local record adapter', () => {
  const event = notificationsFromBookingRecord(record())[0];
  assert.equal(event.isRead, undefined);
  const source = fs.readFileSync('src/lib/ownerNotifications.ts', 'utf8');
  assert.equal(/mark.*read|readNotification|notification_read_state/i.test(source), false);
});

section('Owner Notifications UI');
await test('notification shows event type, real message, reference and timestamp', async () => {
  reset(); seed([record({ bookingId: 'real-reference', serviceName: 'Signature Facial', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 })]);
  const ui = await renderNotifications();
  const item = ui.getByTestId('owner-notification-record-1:new_booking');
  for (const value of ['New booking', 'Signature Facial', 'real-reference', '2023']) {
    assert.ok(item.textContent.includes(value), `missing ${value}`);
  }
});
await test('payment message uses the persisted amount and no customer contact', async () => {
  reset(); seed([record({
    id: 'paid-record', bookingId: 'paid-ref', paymentStatus: 'paid', bookingStatus: 'confirmed',
    amountDue: 375, createdAt: 100, updatedAt: 200,
    customer: { name: 'Private Name', mobile: '9888888888', email: 'private@example.test' },
  })]);
  const ui = await renderNotifications();
  const item = ui.getByTestId('owner-notification-paid-record:payment_received');
  assert.ok(item.textContent.includes('₹375'));
  assert.ok(!ui.getByTestId('owner-notifications-list').textContent.includes('Private Name'));
  assert.ok(!ui.getByTestId('owner-notifications-list').textContent.includes('9888888888'));
});
await test('booking/payment/status filters use only existing event types', async () => {
  reset(); seed([
    record({ id: 'paid', paymentStatus: 'paid', bookingStatus: 'confirmed', createdAt: 100, updatedAt: 200 }),
    record({ id: 'cancelled', paymentStatus: 'cancelled', bookingStatus: 'cancelled', createdAt: 300, updatedAt: 400 }),
  ]);
  const ui = await renderNotifications();
  fireEvent.click(ui.getByTestId('owner-notifications-filter-payments'));
  assert.ok(ui.getByTestId('owner-notification-paid:payment_received'));
  assert.equal(ui.queryByTestId('owner-notification-cancelled:booking_cancelled'), null);
  fireEvent.click(ui.getByTestId('owner-notifications-filter-bookings'));
  assert.ok(ui.getByTestId('owner-notification-cancelled:booking_cancelled'));
  assert.equal(ui.queryByTestId('owner-notification-paid:payment_received'), null);
});
await test('selecting a notification opens the existing related booking view', async () => {
  reset(); seed([record({ id: 'details-row', bookingId: 'details-ref', bookingStatus: 'confirmed', paymentStatus: 'paid' })]);
  const ui = await renderNotifications();
  fireEvent.click(ui.getByTestId('owner-notification-details-row:new_booking'));
  assert.ok(ui.getByTestId('owner-notification-details-overlay'));
  assert.ok(ui.getByTestId('notification-details-appointment-details-ref'));
  fireEvent.click(ui.getByTestId('owner-notification-details-close'));
  assert.equal(ui.queryByTestId('owner-notification-details-overlay'), null);
});
await test('filter and detail clicks never create notification records', async () => {
  reset(); seed([record({ id: 'stable' })]);
  const before = readOwnerNotifications(AUTHORIZED, [BUSINESS], [THEME]);
  const ui = await renderNotifications();
  fireEvent.click(ui.getByTestId('owner-notifications-filter-bookings'));
  fireEvent.click(ui.getByTestId('owner-notification-stable:new_booking'));
  fireEvent.click(ui.getByTestId('owner-notification-details-close'));
  const after = readOwnerNotifications(AUTHORIZED, [BUSINESS], [THEME]);
  assert.equal(after.notifications.length, before.notifications.length);
});
await test('real payment events refresh notifications immediately', async () => {
  reset(); seed([record({ id: 'changing', paymentStatus: 'pending', bookingStatus: 'pending_payment', createdAt: 100, updatedAt: 100 })]);
  const ui = await renderNotifications();
  assert.equal(ui.queryByTestId('owner-notification-changing:payment_received'), null);
  await act(async () => {
    seed([record({ id: 'changing', paymentStatus: 'paid', bookingStatus: 'confirmed', createdAt: 100, updatedAt: 200 })]);
  });
  assert.ok(ui.getByTestId('owner-notification-changing:payment_received'));
});
await test('empty, loading, error and unauthorized states are explicit', async () => {
  reset(); seed([]);
  let ui = await renderNotifications();
  assert.ok(ui.getByTestId('owner-notifications-empty'));
  cleanup();
  ui = await renderNotifications({ forcedState: 'loading' });
  assert.ok(ui.getByTestId('owner-notifications-loading'));
  cleanup();
  ui = await renderNotifications({ forcedState: 'error' });
  assert.ok(ui.getByTestId('owner-notifications-error'));
  assert.ok(ui.getByTestId('owner-notifications-retry'));
  cleanup();
  ui = await renderNotifications({ actor: DENIED });
  assert.ok(ui.getByTestId('owner-notifications-denied'));
});

section('Dashboard integration, responsive, locale and scope stop');
await test('Notifications mounts through the dashboard with session-derived tenants', async () => {
  reset(); seed([record({ id: 'dashboard-event', bookingId: 'dashboard-ref' })]);
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
  assert.ok(ui.getByTestId('owner-notifications'));
  assert.ok(ui.getByTestId('owner-notification-dashboard-event:new_booking'));
});
await test('unauthorized dashboard never exposes notification references', async () => {
  reset(); seed([record({ bookingId: 'secret-reference' })]);
  let ui;
  await act(async () => {
    ui = render(React.createElement(OwnerDashboard, { loadContext: async () => ({ access: 'no-ownership', salon: null }) }));
    await Promise.resolve();
  });
  assert.ok(ui.getByTestId('owner-dashboard-denied'));
  assert.ok(!ui.container.textContent.includes('secret-reference'));
});
await test('Hindi repaints headings, event type and message', async () => {
  reset(); setSiteLocale('hi'); seed([record({ id: 'hindi-event', serviceName: 'फेशियल' })]);
  const ui = await renderNotifications();
  const section = ui.getByTestId('owner-notifications');
  assert.match(section.textContent, /ओनर सूचनाएँ/);
  assert.match(section.textContent, /नई बुकिंग/);
  assert.match(section.textContent, /फेशियल/);
});
await test('responsive structure supports mobile, tablet and desktop', () => {
  const source = fs.readFileSync('src/components/OwnerNotifications.tsx', 'utf8');
  assert.match(source, /sm:p-5/);
  assert.match(source, /lg:flex-row/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /sm:items-center/);
});
await test('light/dark rendering uses the existing dashboard palette', () => {
  const source = fs.readFileSync('src/components/OwnerNotifications.tsx', 'utf8');
  for (const token of ['palette.panel', 'palette.panelSoft', 'palette.line', 'palette.text', 'palette.accent']) assert.ok(source.includes(token));
});
await test('every Phase 17.8 copy key exists in English and Hindi', () => {
  const source = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
  for (const key of ['notifications.heading', 'notifications.type.new_booking', 'notifications.type.payment_received', 'notifications.type.booking_cancelled', 'notifications.type.status_changed', 'notifications.details.title']) {
    assert.equal(source.split(`'${key}'`).length - 1, 2, `${key} must exist in both locales`);
  }
});
await test('no hardcoded booking IDs, fake notices or duplicate schema exist in production code', () => {
  const combined = fs.readFileSync('src/lib/ownerNotifications.ts', 'utf8') + fs.readFileSync('src/components/OwnerNotifications.tsx', 'utf8');
  assert.equal(/NX-\d{4,}/.test(combined), false);
  assert.equal(/create table|alter table|notification_records|owner_notification_store/i.test(combined), false);
});
await test('Phase 17.9 and the final 17.10 acceptance orchestrator now exist', () => {
  assert.equal(fs.existsSync('scripts/test-phase-17.9.mjs'), true);
  assert.equal(fs.existsSync('scripts/test-phase-17.10.mjs'), true);
  // 17.10 is acceptance-only: no Phase 18 feature source is introduced.
  assert.equal(fs.existsSync('src/components/Phase18.tsx'), false);
});

reset();
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.8 owner notifications: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
