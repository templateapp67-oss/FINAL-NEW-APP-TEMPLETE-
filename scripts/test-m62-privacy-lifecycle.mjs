/**
 * M62 — privacy lifecycle regression (export + anonymization).
 *
 * Closes the audit FAIL: "no account deletion, customer data export, retention
 * or anonymization workflow".
 */
import assert from 'node:assert/strict';
import { createRemediationDb } from './lib/remediationHarness.mjs';

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const { db, ids, asServiceRole, asRole, expectSqlState } = await createRemediationDb();

// 1. Verifier is green.
const verifier = await asServiceRole(() => db.query('select * from public.verify_m62_privacy_lifecycle()'));
assert.ok(verifier.rows.every((row) => row.ok === true));
ok(`verify_m62_privacy_lifecycle() — ${verifier.rows.length}/${verifier.rows.length} checks true`);

// 2. Export returns a complete, self-describing document for the customer.
const exported = await asServiceRole(() =>
  db.query('select public.export_user_data_for_actor($1) as document', [ids.customerA]),
);
const document = exported.rows[0].document;
assert.equal(document.user_id, ids.customerA);
assert.ok(document.profile && document.profile.email === 'customer-a@test.test');
assert.ok(document.auth && document.auth.email === 'refund-customer-a@test.test');
assert.equal(document.bookings.length, 1);
assert.equal(document.bookings[0].service_lines.length, 1);
assert.equal(document.bookings[0].service_lines[0].serviceName, 'Haircut + Beard');
assert.equal(document.payments.length, 1);
assert.equal(document.payments[0].amount_paise, 100000);
ok('export returns profile + auth contact + bookings with service lines + payments');

// 3. Anonymization scrubs PII but preserves the ledger.
const anonymized = await asServiceRole(() =>
  db.query('select * from public.anonymize_user_data_for_actor($1)', [ids.customerA]),
);
assert.equal(anonymized.rows[0].user_id, ids.customerA);
assert.equal(anonymized.rows[0].profile_scrubbed, true);
assert.equal(anonymized.rows[0].bookings_touched, 1, 'the confirmed upcoming booking is released');

const profile = (await db.query(
  'select full_name, phone, email, avatar_url from public.profiles where id = $1', [ids.customerA],
)).rows[0];
assert.equal(profile.full_name, 'Deleted user');
assert.equal(profile.phone, null);
assert.equal(profile.email, null);
assert.equal(profile.avatar_url, null);
ok('anonymization scrubs profile name/phone/email/avatar');

const bookingRow = (await db.query(
  'select status, total_amount_paise, advance_amount_paise, customer_id from public.bookings where id = $1',
  [ids.bookingA],
)).rows[0];
assert.equal(bookingRow.status, 'cancelled');
assert.equal(bookingRow.total_amount_paise, 100000);
assert.equal(bookingRow.customer_id, ids.customerA, 'ledger keeps its pseudonymous key');
const paymentRow = (await db.query(
  'select status, amount_paise from public.payments where booking_id = $1', [ids.bookingA],
)).rows[0];
assert.equal(paymentRow.amount_paise, 100000);
ok('anonymization preserves the financial ledger rows and amounts');

// 4. Already-completed history is not rewritten.
await db.query(`update public.bookings set status='completed' where id = $1`, [ids.bookingA]);
const second = await asServiceRole(() =>
  db.query('select * from public.anonymize_user_data_for_actor($1)', [ids.customerA]),
);
assert.equal(second.rows[0].bookings_touched, 0);
const stillCompleted = (await db.query('select status from public.bookings where id = $1', [ids.bookingA])).rows[0];
assert.equal(stillCompleted.status, 'completed');
ok('completed history rows keep their final status (retention semantics)');

// 5. Export for a user with no activity is well-formed, not an error.
const emptyExport = await asServiceRole(() =>
  db.query('select public.export_user_data_for_actor($1) as document', [ids.ownerB]),
);
assert.deepEqual(emptyExport.rows[0].document.bookings, []);
assert.deepEqual(emptyExport.rows[0].document.payments, []);
ok('export for an inactive user returns empty collections');

// 6. anon / authenticated cannot execute either RPC.
await expectSqlState(
  () => asRole('anon', '', () => db.query('select public.export_user_data_for_actor($1)', [ids.customerA])),
  '42501',
);
await expectSqlState(
  () => asRole('authenticated', ids.customerA, () =>
    db.query('select * from public.anonymize_user_data_for_actor($1)', [ids.customerA])),
  '42501',
);
ok('anon and authenticated roles cannot execute privacy RPCs');

// 7. The API never lets user A export user B (source contract).
const sourceText = await (await import('node:fs/promises')).readFile(
  new URL('../server/privacyRoutes.ts', import.meta.url), 'utf8',
);
assert.match(sourceText, /user\.id/, 'privacy routes must derive the subject from the session only');
assert.doesNotMatch(sourceText, /body\??\.\s*(userId|user_id|targetUserId)/);
ok('privacy route source derives the data-subject from the bearer session only');

// Drift test: the paste-ready live bundle must keep the operator header and a
// transaction body byte-identical to the canonical migration (M54 pattern).
const { readFile: readTextFile } = await import('node:fs/promises');
const pasteReady = await readTextFile(new URL('../docs/m62-run-in-supabase.sql', import.meta.url), 'utf8');
const canonical = await readTextFile(
  new URL('../supabase/migrations/20260828000301_m62_privacy_lifecycle.sql', import.meta.url), 'utf8',
);
const marker = '-- ============================================================================\n-- M62 — privacy lifecycle: data export + PII anonymization';
const markerIdx = pasteReady.indexOf(marker);
assert.ok(markerIdx > 0, 'docs/m62-run-in-supabase.sql must include the operator header before the migration marker');
assert.equal(
  pasteReady.slice(markerIdx),
  canonical,
  'docs/m62-run-in-supabase.sql transaction body must be byte-identical to the canonical M62 migration',
);
ok('paste-ready M62 bundle preserves operator header and is byte-identical to canonical migration');

console.log(`\nM62 privacy lifecycle: ${passed}/${passed} checks PASS`);
