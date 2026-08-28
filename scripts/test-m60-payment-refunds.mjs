/**
 * M60 — provider-backed payment refunds regression.
 *
 * Closes the audit FAIL: "no Razorpay refund API workflow, no provider refund
 * IDs, no reconciliation". Proves the ledger, authorization, idempotency,
 * partial/full refund semantics, and webhook-style settlement marking.
 */
import assert from 'node:assert/strict';
import { createRemediationDb } from './lib/remediationHarness.mjs';

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const { db, ids, asServiceRole, asRole, expectSqlState } = await createRemediationDb();

// 1. Post-deployment verifier is green.
const verifier = await asServiceRole(() => db.query('select * from public.verify_m60_payment_refunds()'));
assert.ok(verifier.rows.length >= 7, 'verifier rows');
assert.ok(verifier.rows.every((row) => row.ok === true), 'every M60 verifier check passes');
ok(`verify_m60_payment_refunds() — ${verifier.rows.length}/${verifier.rows.length} checks true`);

// 2. Owner A creates a partial refund (the API's actor-bound path).
const partial = await asServiceRole(() =>
  db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4,$5)', [
    ids.ownerA, ids.paymentA, 50000, 'refund-key-60-partial-0001', 'Customer moved cities',
  ]),
);
assert.equal(partial.rows[0].amount_paise, 50000);
assert.equal(partial.rows[0].status, 'initiated');
assert.equal(partial.rows[0].already_existed, false);
ok('owner creates a partial refund through the actor-bound RPC');

// 3. Idempotent retry returns the SAME refund row.
const retry = await asServiceRole(() =>
  db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4,$5)', [
    ids.ownerA, ids.paymentA, 50000, 'refund-key-60-partial-0001', 'retry',
  ]),
);
assert.equal(retry.rows[0].refund_id, partial.rows[0].refund_id);
assert.equal(retry.rows[0].already_existed, true);
ok('idempotency key replay returns the original refund without double-refunding');

// 4. Settlement marking flips the payment to partially_refunded.
const settled = await asServiceRole(() =>
  db.query('select * from public.mark_payment_refund_result($1,$2,$3,$4)', [
    'processed', partial.rows[0].refund_id, 'rfnd_test60A_1', '{"id":"rfnd_test60A_1"}',
  ]),
);
assert.equal(settled.rows[0].status, 'processed');
assert.equal(settled.rows[0].payment_status, 'partially_refunded');
ok('processed partial refund marks the payment partially_refunded');

// 5. Over-refunding the remaining balance is rejected.
await expectSqlState(
  () => asServiceRole(() => db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4)', [
    ids.ownerA, ids.paymentA, 50001, 'refund-key-60-over-000000002',
  ])),
  '22023',
);
ok('refund above the remaining refundable amount is rejected (22023)');

// 6. A full refund of the remainder flips the payment to refunded.
const rest = await asServiceRole(() =>
  db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4)', [
    ids.ownerA, ids.paymentA, 50000, 'refund-key-60-rest-00000003',
  ]),
);
await asServiceRole(() =>
  db.query('select * from public.mark_payment_refund_result($1,$2,$3,$4)', [
    'processed', rest.rows[0].refund_id, 'rfnd_test60A_2', '{"id":"rfnd_test60A_2"}',
  ]),
);
const payment = (await db.query('select status from public.payments where id = $1', [ids.paymentA])).rows[0];
assert.equal(payment.status, 'refunded');
ok('fully refunded payment is marked refunded');

// 7. Webhook replay is idempotent (provider refund id path).
const replay = await asServiceRole(() =>
  db.query('select * from public.mark_payment_refund_result($1,$2,$3)', [
    'processed', null, 'rfnd_test60A_2',
  ]),
);
assert.equal(replay.rows[0].status, 'processed');
const refundCount = (await db.query('select count(*)::int as n from public.payment_refunds')).rows[0].n;
assert.equal(refundCount, 2);
ok('duplicate webhook marking by provider refund id cannot create or duplicate refunds');

// 8. A foreign owner cannot refund another salon's payment.
await expectSqlState(
  () => asServiceRole(() => db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4)', [
    ids.ownerB, ids.paymentA, 1000, 'refund-key-60-foreign-000004',
  ])),
  '42501',
);
ok('a foreign salon owner is denied (42501) — cross-tenant refund isolation');

// 9. anon / authenticated callers cannot execute the RPCs.
await expectSqlState(
  () => asRole('anon', '', () => db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4)', [
    ids.ownerA, ids.paymentA, 1000, 'refund-key-60-anon-0000005',
  ])),
  '42501',
);
await expectSqlState(
  () => asRole('authenticated', ids.ownerA, () => db.query('select * from public.mark_payment_refund_result($1)', [
    'processed',
  ])),
  '42501',
);
ok('anon and authenticated roles cannot execute refund RPCs');

// 10. RLS: the ledger is unreadable without the service role.
await expectSqlState(
  () => asRole('anon', '', () => db.query('select count(*) from public.payment_refunds')),
  '42501',
);
ok('payment_refunds is not readable by anon (deny-by-default RLS)');

// 11. Owner read surface lists the refunds for the right tenant only.
const ledger = await asServiceRole(() =>
  db.query('select * from public.get_payment_refunds_for_actor($1)', [ids.ownerA]),
);
assert.equal(ledger.rows.length, 2);
assert.ok(ledger.rows.every((row) => row.status === 'processed'));
const foreignLedger = await asServiceRole(() =>
  db.query('select * from public.get_payment_refunds_for_actor($1)', [ids.ownerB]),
);
assert.equal(foreignLedger.rows.length, 0);
ok('actor-bound refund ledger read lists only the owning tenant');

// 12. Only captured/authorized payments are refundable.
await db.query(
  `update public.payments set status='failed' where id = $1`, [ids.paymentA],
);
await expectSqlState(
  () => asServiceRole(() => db.query('select * from public.create_payment_refund_for_actor($1,$2,$3,$4)', [
    ids.ownerA, ids.paymentA, 1000, 'refund-key-60-failed-000006',
  ])),
  '22023',
);
ok('a failed payment cannot be refunded');

// Drift test: the paste-ready live bundle must keep the operator header and a
// transaction body byte-identical to the canonical migration (M54 pattern).
const { readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const rootDir = new URL('..', import.meta.url).pathname;
const pasteReady = await readFile(join(rootDir, 'docs', 'm60-run-in-supabase.sql'), 'utf8');
const canonical = await readFile(
  join(rootDir, 'supabase', 'migrations', '20260828000101_m60_payment_refunds.sql'), 'utf8',
);
const marker = '-- ============================================================================\n-- M60 — provider-backed payment refunds with idempotency + reconciliation';
const markerIdx = pasteReady.indexOf(marker);
assert.ok(markerIdx > 0, 'docs/m60-run-in-supabase.sql must include the operator header before the migration marker');
assert.equal(
  pasteReady.slice(markerIdx),
  canonical,
  'docs/m60-run-in-supabase.sql transaction body must be byte-identical to the canonical M60 migration',
);
ok('paste-ready M60 bundle preserves operator header and is byte-identical to canonical migration');

console.log(`\nM60 payment refunds: ${passed}/${passed} checks PASS`);