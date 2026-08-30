import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(`../supabase/manifests/${name}`, import.meta.url), 'utf8'));
const clean = await readJson('clean-bootstrap.json');
const existing = await readJson('existing-project-reconciliation.json');
const designA = await readJson('design-a-test-history.json');
const migrationFiles = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((name) => name.endsWith('.sql'))
  .sort();

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

assert.equal(clean.status, 'blocked');
assert.deepEqual(clean.files, []);
assert.match(clean.reason, /does not contain a verified empty-database baseline/i);
assert.match(clean.forbidden.join(' '), /Do not concatenate M01-M27 with M28\+/);
ok('clean-bootstrap track fails closed instead of replaying mixed authority histories');

assert.equal(existing.status, 'introspection-required');
assert.equal(existing.projectRef, 'qwaehqsmodekbgvnaavz');
assert.ok(existing.requiredRoots.length >= 9);
assert.ok(existing.requiredColumns.length >= 10);
assert.match(existing.applyPolicy, /Never bulk-apply/);
ok('existing-project track requires canonical project/schema/ledger introspection');

for (const file of [...designA.files, ...existing.files]) {
  assert.ok(migrationFiles.includes(file), `manifest references missing migration ${file}`);
}
assert.deepEqual([...designA.files].sort(), designA.files);
assert.deepEqual([...existing.files].sort(), existing.files);
ok('manifest files exist and are in immutable timestamp order');

const overlap = designA.files.filter((file) => existing.files.includes(file));
assert.deepEqual(overlap, []);
assert.ok(designA.files.every((file) => /_m(?:0[1-9]|1\d|2[0-7])_/.test(file)));
assert.ok(existing.files[0].includes('_m28_'));
// M55-M65 in timestamp order. M59-M62 came from main; M63/M64 from that
// branch; M65 adds home-service bookings. Asserted by position so a
// re-ordering or a dropped file fails loudly.
assert.ok(existing.files.at(-11).includes('_m55_'));
assert.ok(existing.files.at(-10).includes('_m56_'));
assert.ok(existing.files.at(-9).includes('_m57_'));
assert.ok(existing.files.at(-8).includes('_m58_'));
assert.ok(existing.files.at(-7).includes('_m59_'));
assert.ok(existing.files.at(-6).includes('_m60_'));
assert.ok(existing.files.at(-5).includes('_m61_'));
assert.ok(existing.files.at(-4).includes('_m62_'));
assert.ok(existing.files.at(-3).includes('_m63_'));
assert.ok(existing.files.at(-2).includes('_m64_'));
assert.ok(existing.files.at(-1).includes('_m65_'));
ok('Design-A M01-M27 and canonical M28-M65 tracks cannot be conflated');

const helpers = [
  '20260821203500_setup_public_salon_v2.sql',
  '20260821204000_dynamic_multitenant_salons.sql',
];
for (const helper of helpers) {
  assert.ok(migrationFiles.includes(helper));
  assert.ok(!designA.files.includes(helper));
  assert.ok(!existing.files.includes(helper));
}
const classified = new Set([...designA.files, ...existing.files, ...helpers]);
assert.deepEqual(migrationFiles.filter((file) => !classified.has(file)), []);
ok('every SQL file is classified and helper scripts are excluded from production tracks');

const runner = await readFile(new URL('../scripts/apply-live-migration.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(runner, /CHAIN_M28_TO_M/);
assert.match(runner, /Bulk migration application is disabled/);
assert.match(runner, /Plan only\. No database request was made and no SQL was applied/);
ok('live runner cannot blindly execute the reconciliation manifest');

console.log(`\nMigration manifests: ${passed}/${passed} checks PASS`);
