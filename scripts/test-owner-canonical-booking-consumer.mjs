import assert from 'node:assert/strict';
import {
  ownerBookingItemToDashboardRecord,
  ownerBookingItemsToDashboardRecords,
} from '../src/lib/ownerAuthoritativeBookings.ts';
import {
  clearAuthoritativeOwnerBookingRecords,
  ownerUpdateBookingStatusThroughAuthority,
  readAuthoritativeOwnerBookingRecords,
  readSalonBookings,
  setAuthoritativeOwnerBookingRecords,
  setSupabaseConfiguredForTests,
} from '../src/lib/bookingManagement.ts';

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };
const salonA = '10000000-0000-4000-8000-0000000000a1';
const salonB = '10000000-0000-4000-8000-0000000000b1';
const bookingA = '20000000-0000-4000-8000-0000000000a1';
const customerA = '30000000-0000-4000-8000-0000000000a1';
const serviceA = '40000000-0000-4000-8000-0000000000a1';

const canonical = {
  id: bookingA,
  bookingId: bookingA,
  salonId: salonA,
  businessName: 'Canonical Salon',
  themeId: 'beauty_skin_spa',
  customerId: customerA,
  customerName: null,
  customerEmail: 'customer@example.test',
  customerPhone: null,
  serviceNames: ['Facial'],
  serviceLines: [{
    serviceId: serviceA,
    serviceName: 'Facial',
    pricePaise: 200000,
    durationMinutes: 60,
    quantity: 1,
  }],
  staffId: null,
  staffName: null,
  appointmentStart: '2026-08-25T04:30:00.000Z',
  appointmentEnd: '2026-08-25T05:30:00.000Z',
  dateKey: '2026-08-25',
  startMinutes: 600,
  endMinutes: 660,
  totalAmount: 2000,
  advanceAmount: 500,
  remainingAmount: 1500,
  totalAmountPaise: 200000,
  advanceAmountPaise: 50000,
  remainingAmountPaise: 150000,
  status: 'pending',
  paymentStatus: 'partially_paid',
  currency: 'INR',
  createdAt: '2026-08-24T10:00:00.000Z',
};

const mapped = ownerBookingItemToDashboardRecord(canonical);
assert.equal(mapped.businessId, salonA);
assert.equal(mapped.themeId, 'beauty_skin_spa');
assert.equal(mapped.bookingStatus, 'pending_payment');
assert.equal(mapped.paymentStatus, 'paid');
assert.equal(mapped.paymentOption, 'advance');
assert.equal(mapped.baseAmount, 2000);
assert.equal(mapped.amountDue, 500);
assert.equal(mapped.remainingAmount, 1500);
assert.equal(mapped.customer.name, '');
assert.equal(mapped.customer.mobile, '');
assert.deepEqual(mapped.services, [{ serviceId: serviceA, serviceName: 'Facial', price: 2000, durationMinutes: 60 }]);
ok('canonical API row maps explicitly without invented customer/service/payment facts');

assert.throws(
  () => ownerBookingItemToDashboardRecord({ ...canonical, themeId: null }),
  /missing themeId/,
);
assert.throws(
  () => ownerBookingItemToDashboardRecord({ ...canonical, serviceLines: [] }),
  /no canonical service line/,
);
assert.throws(
  () => ownerBookingItemToDashboardRecord({ ...canonical, status: 'rescheduled' }),
  /unsupported booking status/,
);
ok('malformed/unsupported canonical responses fail visibly instead of becoming fallback rows');

setSupabaseConfiguredForTests(true);
setAuthoritativeOwnerBookingRecords(ownerBookingItemsToDashboardRecords([canonical]));
const actorA = { permission: 'authorized', allowedBusinessIds: [salonA] };
const own = readSalonBookings(actorA, salonA, 'beauty_skin_spa');
assert.equal(own.ok, true);
assert.equal(own.records.length, 1);
const denied = readSalonBookings(actorA, salonB, 'beauty_skin_spa');
assert.deepEqual(denied, { ok: false, reason: 'permission-denied' });
const wrongTheme = readSalonBookings(actorA, salonA, 'barber_mens_grooming');
assert.equal(wrongTheme.ok, true);
assert.deepEqual(wrongTheme.records, []);
ok('in-memory render cache re-checks actor salon and canonical theme scope');

const originalFetch = globalThis.fetch;
let request = null;
globalThis.fetch = async (input, init) => {
  request = { input: String(input), init };
  return new Response(JSON.stringify({ success: true, bookingId: bookingA, status: 'confirmed' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
try {
  const result = await ownerUpdateBookingStatusThroughAuthority(
    actorA,
    salonA,
    'beauty_skin_spa',
    bookingA,
    'confirmed',
  );
  assert.equal(result.ok, true);
  assert.equal(request.input, `/api/owner/bookings/${bookingA}/status`);
  assert.equal(request.init.method, 'POST');
  assert.deepEqual(JSON.parse(request.init.body), { status: 'confirmed' });
  assert.equal(readAuthoritativeOwnerBookingRecords()[0].bookingStatus, 'confirmed');
} finally {
  globalThis.fetch = originalFetch;
}
ok('configured owner status control mutates the canonical API and refreshes only memory state');

let called = false;
globalThis.fetch = async () => { called = true; throw new Error('must not call'); };
try {
  const foreign = await ownerUpdateBookingStatusThroughAuthority(
    actorA,
    salonB,
    'beauty_skin_spa',
    bookingA,
    'confirmed',
  );
  assert.deepEqual(foreign, { ok: false, reason: 'permission-denied' });
  assert.equal(called, false);
} finally {
  globalThis.fetch = originalFetch;
}
ok('crafted foreign-salon mutation is denied before any API request');

clearAuthoritativeOwnerBookingRecords();
assert.equal(readAuthoritativeOwnerBookingRecords(), null);
setSupabaseConfiguredForTests(null);
ok('canonical render cache is explicitly clearable on owner/session changes');

console.log(`\nOwner canonical booking consumer: ${passed}/${passed} checks PASS`);
