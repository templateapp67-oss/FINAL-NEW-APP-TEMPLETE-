import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const readiness = await read('src/lib/publishReadiness.ts');
const setup = await read('src/screens/StepPublishSetup.tsx');
const service = await read('src/lib/salonWebsiteService.ts');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

assert.match(readiness, /export const PUBLISH_READY_LABEL = 'Ready to Publish'/);
assert.match(readiness, /export const PUBLISH_INCOMPLETE_LABEL = 'Complete Required Information'/);
assert.match(readiness, /evaluatePublishReadiness/);
assert.match(readiness, /assertPublishReady/);
ok('readiness helper exposes the two owner-facing states');

assert.match(readiness, /id: 'salon-details'/);
assert.match(readiness, /id: 'services'/);
assert.match(readiness, /id: 'contact'/);
assert.match(readiness, /id: 'template'/);
assert.match(readiness, /id: 'appearance'/);
assert.match(readiness, /id: 'reviewed'/);
assert.doesNotMatch(readiness, /razorpay|advance payment|booking payment/i);
ok('required items match existing business/template rules, not booking/payment');

assert.match(setup, /evaluatePublishReadiness/);
assert.match(setup, /readiness\.statusLabel/);
assert.match(setup, /data-testid="publish-readiness-status"/);
assert.match(setup, /if \(!evaluatePublishReadiness\(data\)\.ready\)/);
assert.match(setup, /disabled=\{!allRequiredDone \|\| publishing\}/);
ok('publish setup shows readiness and blocks the publish button');

assert.match(service, /assertPublishReady\(data\)/);
assert.match(service, /PUBLISH_OWNER_WEBSITE_FN = 'publish_owner_salon_website'/);
assert.match(service, /\.rpc\(PUBLISH_OWNER_WEBSITE_FN/);
ok('existing Phase 1-A publish RPC is gated, not replaced');

assert.match(readiness, /throw new Error\(PUBLISH_INCOMPLETE_ERROR\)/);
assert.match(service, /Fail closed before the existing Phase 1-A RPC/);
ok('incomplete businesses cannot be marked published');

console.log(`\nPublish preparation: ${passed}/${passed} checks PASS`);
