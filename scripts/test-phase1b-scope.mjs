/**
 * Phase 1-B must not grow customer auth, booking, slot locks, or payments.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const phase1bSources = [
  'src/lib/publicSalonPresentation.ts',
  'src/lib/ownerWorkspacePersistence.ts',
  'src/lib/ownerProvisioning.ts',
  'src/lib/templateArchitecture.ts',
  'src/lib/templateConfig.ts',
  'supabase/migrations/20260824000501_m48_template_switch_isolation.sql',
  'supabase/migrations/20260824000601_m49_public_template_config.sql',
  'scripts/test-multi-tenant-owners.mjs',
  'scripts/test-owner-session-persistence.mjs',
  'scripts/test-public-template-rendering.mjs',
  'docs/PHASE1B_OUT_OF_SCOPE.md',
];

const forbidden = [
  { re: /customer signup|signup_role:\s*['"]customer['"]/i, label: 'customer signup/login flow' },
  { re: /create_website_booking|create_authoritative_customer_booking|SiteBookingFullFlow/i, label: 'customer booking flow' },
  { re: /slot.?lock|create_booking_slot_hold|reserveBookingSlot/i, label: 'slot locking' },
  { re: /razorpay|Razorpay\.Checkout|orders\.create/i, label: 'Razorpay checkout' },
  { re: /advanceDepositPercentage|25%\s*(advance|payment|deposit)/i, label: '25% payment' },
  { re: /payment.?webhook|razorpay_signature|x-razorpay-signature/i, label: 'payment webhook' },
  { re: /payment confirmation|verify_payment\(/i, label: 'payment confirmation' },
  { re: /refund|payment_refunds/i, label: 'refund behavior' },
];

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const scopeDoc = await read('docs/PHASE1B_OUT_OF_SCOPE.md');
for (const item of [
  'Customer signup / login flow',
  'Customer booking flow',
  'Slot locking',
  'Razorpay checkout',
  '25% payment',
  'Payment webhook',
  'Payment confirmation',
  'Refund behavior',
]) {
  assert.match(scopeDoc, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
ok('Phase 1-B out-of-scope list is documented');

for (const path of phase1bSources.filter((p) => p !== 'docs/PHASE1B_OUT_OF_SCOPE.md')) {
  const source = await read(path);
  for (const rule of forbidden) {
    assert.doesNotMatch(source, rule.re, `${path} must not implement ${rule.label}`);
  }
}
ok('Phase 1-B files do not implement deferred customer/payment work');

console.log(`\nPhase 1-B scope: ${passed}/${passed} checks PASS`);
