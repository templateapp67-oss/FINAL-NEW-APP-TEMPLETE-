/**
 * M61 — atomic server-authoritative booking reschedule regression.
 *
 * Closes the audit FAIL: "no end-to-end reschedule workflow that atomically
 * releases the old slot, acquires the new slot, and preserves payment
 * linkage".
 */
import assert from 'node:assert/strict';
import { createRemediationDb } from './lib/remediationHarness.mjs';

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const { db, ids, salonAId, at, asServiceRole, asRole, expectSqlState } = await createRemediationDb();

const before = (await db.query(
  'select appointment_start, appointment_end, status, payment_status, total_amount_paise, advance_amount_paise from public.bookings where id = $1',
  [ids.bookingA],
)).rows[0];

// 1. Verifier is green.
const verifier = await asServiceRole(() => db.query('select * from public.verify_m61_booking_reschedule()'));
assert.ok(verifier.rows.every((row) => row.ok === true));
ok(`verify_m61_booking_reschedule() — ${verifier.rows.length}/${verifier.rows.length} checks true`);

// 2. Customer reschedules their booking to a free slot.
const moved = await asServiceRole(() =>
  db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
    ids.customerA, ids.bookingA, at(3).toISOString(),
  ]),
);
assert.equal(moved.rows[0].booking_id, ids.bookingA);
assert.equal(new Date(moved.rows[0].old_appointment_start).toISOString(), new Date(before.appointment_start).toISOString());
assert.equal(new Date(moved.rows[0].new_appointment_start).toISOString(), at(3).toISOString());
// Duration recomputed from the service snapshot (60 minutes).
assert.equal(new Date(moved.rows[0].new_appointment_end).toISOString(), at(4).toISOString());
assert.equal(moved.rows[0].status, before.status);
assert.equal(moved.rows[0].payment_status, before.payment_status);
ok('customer moves their booking; old slot released, new slot acquired');

// 3. Amount snapshots and payment linkage are untouched.
const after = (await db.query(
  'select appointment_start, appointment_end, total_amount_paise, advance_amount_paise, payment_status from public.bookings where id = $1',
  [ids.bookingA],
)).rows[0];
assert.equal(after.total_amount_paise, before.total_amount_paise);
assert.equal(after.advance_amount_paise, before.advance_amount_paise);
const paymentStillLinked = (await db.query(
  'select count(*)::int as n from public.payments where booking_id = $1', [ids.bookingA],
)).rows[0].n;
assert.equal(paymentStillLinked, 1);
ok('reschedule preserves amounts, payment status and payment linkage');

// 4. Idempotent retry to the SAME window succeeds without state change.
const again = await asServiceRole(() =>
  db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
    ids.customerA, ids.bookingA, at(3).toISOString(),
  ]),
);
assert.equal(new Date(again.rows[0].new_appointment_start).toISOString(), at(3).toISOString());
ok('rescheduling to the same window is an idempotent success');

// 5. Canonical conflict: another booking now occupies 10:00 (same salon).
await db.query(
  `insert into public.bookings
     (id,salon_id,customer_id,appointment_start,appointment_end,status,payment_status,total_amount_paise)
   values ('50000000-0000-4000-8000-0000000060d1',$1,$2,$3,$4,'confirmed','unpaid',50000)`,
  [salonAId, ids.customerB, at(0).toISOString(), at(1).toISOString()],
);
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerA, ids.bookingA, at(0).toISOString(),
    ])),
  '23P01',
);
ok('a slot already taken by another canonical booking is rejected (23P01)');

// 6. Guest conflict: a website booking occupies 12:00–13:00 for the salon.
await db.query(
  `insert into public.website_bookings
     (salon_id,customer_name,customer_phone,service_id,service_name_snapshot,price_paise,
      duration_minutes,appointment_date,start_time,end_time,booking_reference,status,source)
   values ($1,'Guest X','9000000009',$2,'Haircut + Beard',100000,60,$3,'12:00','13:00','NX-610001','pending','website')`,
  [salonAId, ids.serviceA, at(3).toISOString().slice(0, 10)],
);
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerA, ids.bookingA, at(2).toISOString(), // 12:00 + 60min collides with the guest slot
    ])),
  '23P01',
);
ok('a slot already taken by a guest website booking is rejected (23P01)');

// 7. A foreign customer cannot move someone else's booking.
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerB, ids.bookingA, at(5).toISOString(),
    ])),
  '42501',
);
ok('a foreign customer is denied (42501)');

// 8. The salon OWNER may reschedule a customer booking (front-desk use case).
const ownerMoved = await asServiceRole(() =>
  db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
    ids.ownerA, ids.bookingA, at(5).toISOString(),
  ]),
);
assert.equal(new Date(ownerMoved.rows[0].new_appointment_start).toISOString(), at(5).toISOString());
ok('the salon owner can reschedule a booking on behalf of the customer');

// 9. A booking in another salon cannot be moved by this owner.
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.ownerA, ids.bookingB, at(5).toISOString(),
    ])),
  '42501',
);
ok('cross-tenant owner reschedule is denied (42501)');

// 10. Cancelled bookings are frozen.
await db.query(`update public.bookings set status='cancelled' where id = $1`, [ids.bookingA]);
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerA, ids.bookingA, at(6).toISOString(),
    ])),
  '22023',
);
ok('a cancelled booking cannot be rescheduled (22023)');

// 11. Past / far-future windows are rejected (same window as creation).
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerB, ids.bookingB, new Date(Date.now() + 60 * 1000).toISOString(),
    ])),
  '22023',
);
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerB, ids.bookingB, new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
    ])),
  '22023',
);
ok('reschedule enforces the same bookable window as creation');

// 12. anon / authenticated cannot execute.
await expectSqlState(
  () => asRole('anon', '', () =>
    db.query('select * from public.reschedule_customer_booking_for_actor($1,$2,$3)', [
      ids.customerA, ids.bookingA, at(7).toISOString(),
    ])),
  '42501',
);
ok('anon cannot execute the reschedule RPC');

// Drift test: the paste-ready live bundle must keep the operator header and a
// transaction body byte-identical to the canonical migration (M54 pattern).
const { readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const rootDir = new URL('..', import.meta.url).pathname;
const pasteReady = await readFile(join(rootDir, 'docs', 'm61-run-in-supabase.sql'), 'utf8');
const canonical = await readFile(
  join(rootDir, 'supabase', 'migrations', '20260828000201_m61_booking_reschedule.sql'), 'utf8',
);
const marker = '-- ============================================================================\n-- M61 — atomic, server-authoritative booking reschedule';
const markerIdx = pasteReady.indexOf(marker);
assert.ok(markerIdx > 0, 'docs/m61-run-in-supabase.sql must include the operator header before the migration marker');
assert.equal(
  pasteReady.slice(markerIdx),
  canonical,
  'docs/m61-run-in-supabase.sql transaction body must be byte-identical to the canonical M61 migration',
);
ok('paste-ready M61 bundle preserves operator header and is byte-identical to canonical migration');

console.log(`\nM61 booking reschedule: ${passed}/${passed} checks PASS`);
