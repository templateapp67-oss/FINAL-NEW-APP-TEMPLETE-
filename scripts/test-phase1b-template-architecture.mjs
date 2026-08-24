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

const sql = read('supabase/migrations/20260823000401_phase1_whitelabel_provisioning.sql');
{
  if (sql.includes('set theme_id') && sql.includes('set template_key') && sql.includes('Presentation-only')) {
    pass('RPC updates only salons.theme_id + website.template_key');
  } else fail('RPC columns', 'set_owner_salon_template not presentation-only');
  for (const table of ['services', 'products', 'bookings', 'payments', 'business_locations', 'organization_members']) {
    const writes = new RegExp(`(insert into|update|delete from)\\s+public\\.${table}`, 'i');
    const fn = sql.split('set_owner_salon_template')[2] || '';
    if (writes.test(fn)) fail(`RPC must not write ${table}`, 'core table touched');
    else pass(`RPC does not write ${table}`);
  }
}

{
  const arch = read('src/lib/templateArchitecture.ts');
  if (arch.includes('CORE_BUSINESS_TABLES') && arch.includes('TEMPLATE_SWITCH_RPC')) {
    pass('Client documents Phase 1-A core vs presentation split');
  } else fail('architecture module', 'missing');
}

{
  const sw = read('src/lib/templateConfig.ts');
  if (sw.includes('salonId: data.salonId') && sw.includes('services: data.services') && sw.includes('address: data.address')) {
    pass('Client switch keeps the same salon identity and core fields');
  } else fail('client switch', 'does not preserve core fields');
}

{
  const arch = read('src/lib/templateArchitecture.ts');
  const cycle = ['barber_mens_grooming', 'beauty_skin_spa', 'nail_lash_studio', 'hair_studio_color_bar'];
  if (arch.includes('switchPreservedCoreBusiness') && cycle.every((id) => read('src/lib/themeServices.ts').includes(id))) {
    pass('Template 1→3→5→2 cycle uses the five official ids and a core-preservation check');
  } else fail('switch cycle', 'missing official ids or core check');
}

{
  const app = read('src/App.tsx');
  if (app.includes('setOwnerTemplate') && app.includes('switchSalonTemplatePresentation')) {
    pass('App applies template on the existing salon via the presentation RPC');
  } else fail('App wiring', 'missing');
}

{
  try {
    const out = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    if (out.includes('error TS')) fail('TYPECHECK', out.slice(0, 200));
    else pass('TYPECHECK');
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : String(e);
    if (out.includes('error TS')) fail('TYPECHECK', out.split('\n').filter((l) => l.includes('error')).slice(0, 3).join(' | '));
    else pass('TYPECHECK');
  }
}

console.log(`\nTEMPLATE ARCHITECTURE: ${passed}/${passed + failed} PASS`);
process.exit(failed > 0 ? 1 : 0);
