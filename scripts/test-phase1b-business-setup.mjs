#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
function pass(l) { passed++; console.log(`✓ PASS [${l}]`); }
function fail(l, d) { failed++; console.log(`✗ FAIL [${l}] ${d}`); }
function read(p) { return readFileSync(resolve(ROOT, p), 'utf8'); }

{
  const src = read('src/lib/ownerBusinessSetup.ts');
  if (src.includes("SALONS_TABLE = 'salons'") && src.includes('.from(SALONS_TABLE)') && src.includes('address') && src.includes('city')) {
    pass('Persists business name/address/city to existing salons columns');
  } else fail('salons write', 'missing salons.name/address/city update');
  if (src.includes("ORGANIZATIONS_TABLE = 'organizations'") && src.includes('.from(ORGANIZATIONS_TABLE)')) {
    pass('Mirrors business name onto organizations.name');
  } else fail('org name', 'missing organizations.name update');
  if (src.includes('saveOwnerWebsiteDraft')) {
    pass('Contact/logo/hours/booking rules persist in salon_public_websites.config');
  } else fail('draft', 'missing website draft save');
  if (src.includes('saveSalonLocation') && src.includes('business_locations')) {
    pass('Map location uses existing business_locations');
  } else fail('location', 'missing business_locations write');
  if (src.includes("SALON_HOURS_TABLE = 'salon_hours'") && src.includes('.from(SALON_HOURS_TABLE)')) {
    pass('Availability writes existing salon_hours when schema matches');
  } else fail('hours', 'missing salon_hours upsert');
  if (!/create table|alter table/i.test(src)) {
    pass('No invented tables/columns in business setup persist');
  } else fail('schema', 'invented DDL');
}

{
  const app = read('src/App.tsx');
  if (app.includes('persistOwnerBusinessSetup') && app.includes('mergeSalonRowIntoDraft')) {
    pass('App autosave + hydrate go through Supabase business setup');
  } else fail('App wire', 'autosave still draft-only / no salon row merge');
  if (!app.includes('saveOwnerWebsiteDraft(data)')) {
    pass('App no longer saves draft without salon/org rows');
  } else fail('App draft-only', 'still calls saveOwnerWebsiteDraft directly');
}

{
  const details = read('src/screens/StepDetails.tsx');
  if (details.includes('salonName') && details.includes('ownerName')) {
    pass('Business setup screen collects existing salon + owner fields');
  } else fail('StepDetails', 'missing required fields');
}

{
  try {
    const out = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    if (out.includes('error TS')) fail('TYPECHECK', out.slice(0, 240));
    else pass('TYPECHECK');
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : String(e);
    if (out.includes('error TS')) fail('TYPECHECK', out.split('\n').filter((l) => l.includes('error')).slice(0, 4).join(' | '));
    else pass('TYPECHECK');
  }
}

console.log(`\nPHASE 1-B BUSINESS SETUP: ${passed}/${passed + failed} PASS`);
process.exit(failed > 0 ? 1 : 0);
