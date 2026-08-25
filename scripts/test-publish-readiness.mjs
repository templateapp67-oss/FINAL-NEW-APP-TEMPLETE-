import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const readiness = await read('src/lib/publishReadiness.ts');
const setup = await read('src/screens/StepPublishSetup.tsx');
const service = await read('src/lib/salonWebsiteService.ts');
const migration = await read('supabase/migrations/20260825000101_m50_publish_readiness_validation.sql');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// Owner-facing states — exactly the two the task asked for.
assert.match(readiness, /PUBLISH_READY_LABEL = 'Ready to Publish'/);
assert.match(readiness, /PUBLISH_INCOMPLETE_LABEL = 'Complete these items before publishing:'/);
assert.match(readiness, /PUBLISH_INCOMPLETE_ERROR =/);
assert.match(readiness, /evaluatePublishReadiness/);
assert.match(readiness, /assertPublishReady/);
ok('readiness helper exposes "Ready to Publish" and "Complete these items before publishing:"');

// Existing business rules — the required set, with no invented optionals.
assert.match(readiness, /id: 'business-name'/);
assert.match(readiness, /id: 'business-copy'/);
assert.match(readiness, /id: 'services'/);
assert.match(readiness, /id: 'contact'/);
assert.match(readiness, /id: 'template'/);
assert.match(readiness, /id: 'appearance'/);
assert.match(readiness, /id: 'reviewed'/);
assert.match(readiness, /Team \(Optional — can be added later\)/);
assert.match(readiness, /Gallery \(Optional — can be added later\)/);
assert.match(readiness, /Deliberately OPTIONAL/);
// Team/gallery exist only in the OPTIONAL list — never in the required set.
const requiredItemsBlock = readiness.slice(
  readiness.indexOf('export function publishReadinessItems'),
  readiness.indexOf('/** Exactly the items'),
);
assert.doesNotMatch(requiredItemsBlock, /id: '(?:team|gallery)'/);
assert.doesNotMatch(requiredItemsBlock, /razorpay|bookingRules|contactOptions/i);
assert.match(readiness, /const optional: PublishReadiness\['optional'\] = \[\s*\{\s*id: 'team'/s);
assert.match(readiness, /\{\s*id: 'gallery',\s*label: 'Gallery \(Optional/s);
ok('required items match existing business/template rules; team/gallery stay optional');

assert.match(readiness, /missingLabels/);
assert.match(readiness, /readinessFromMissingLabels/);
assert.match(setup, /data-testid="publish-readiness-status"/);
assert.match(setup, /data-testid="publish-readiness-missing"/);
assert.match(setup, /Complete these items before publishing:/);
assert.match(setup, /readiness\.missingLabels\.map/);
assert.match(setup, /disabled=\{!allRequiredDone \|\| publishing\}/);
ok('publish setup shows the exact incomplete item list and blocks the publish button');

assert.match(setup, /verifyOwnerPublishReadiness\(data\)/);
assert.match(setup, /verifyOwnerPublishReadiness\(data\)/);
assert.match(service, /VERIFY_PUBLISH_READINESS_FN = 'verify_owner_publish_readiness'/);
assert.match(service, /\.rpc\(\s*VERIFY_PUBLISH_READINESS_FN/);
assert.match(service, /readinessFromMissingLabels/);
assert.match(service, /assertPublishReady\(data\)/);
assert.match(service, /PUBLISH_OWNER_WEBSITE_FN = 'publish_owner_salon_website'/);
ok('existing publish RPC stays the write authority; readiness is a read gate');

assert.match(migration, /create or replace function public.verify_owner_publish_readiness/);
assert.match(migration, /Business name/);
assert.match(migration, /Required service setup/);
assert.match(migration, /Required business configuration \(contact details\)/);
assert.match(migration, /Active template selection/);
assert.match(migration, /Required website configuration \(appearance\)/);
assert.match(migration, /Required website configuration \(content review\)/);
assert.match(migration, /Deliberately optional \(existing rules\): team, gallery/);
ok('database validator mirrors the same required rule set (no invented optionals)');

console.log(`\nPublish preparation: ${passed}/${passed} checks PASS`);
