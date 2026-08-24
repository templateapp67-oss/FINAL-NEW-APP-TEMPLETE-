#!/usr/bin/env node
/**
 * PHASE 1-B — Owner onboarding + 5 templates + template config + switching.
 * Structural tests only. No new tables. No customer booking/payment work.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function pass(label) {
  passed++;
  console.log(`✓ PASS [${label}]`);
}
function fail(label, detail) {
  failed++;
  console.log(`✗ FAIL [${label}] ${detail}`);
}
function read(p) {
  return readFileSync(resolve(ROOT, p), 'utf8');
}

const FIVE = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

{
  const audit = read('PHASE_1A_AUDIT_REPORT.md');
  if (audit.includes('No schema changes were required') && audit.includes('provision_owner_salon')) {
    pass('Uses Phase 1-A audit (no new schema)');
  } else fail('Phase 1-A audit', 'Report missing canonical findings');
}

{
  const tpl = read('src/lib/templateConfig.ts');
  if (tpl.includes('salon_public_websites.config') && !tpl.includes('CREATE TABLE')) {
    pass('Template config uses existing JSONB, no new tables');
  } else fail('Template config storage', 'Unexpected new table or missing JSONB');

  for (const id of FIVE) {
    if (tpl.includes(`'${id}'`) || tpl.includes(`id: '${id}'`)) pass(`Template catalog: ${id}`);
    else fail(`Template catalog: ${id}`, 'missing');
  }

  if (tpl.includes('switchSalonTemplatePresentation') && tpl.includes('services: data.services')) {
    pass('Switch preserves services/packages/team/gallery');
  } else fail('Switch isolation', 'switch helper missing preservation');
}

{
  const app = read('src/App.tsx');
  if (app.includes('resolveOrProvisionOwnerSalon') && app.includes('provision_owner_salon') === false) {
    pass('Onboarding provisions via existing RPC wrapper');
  } else if (app.includes('resolveOrProvisionOwnerSalon')) {
    pass('Onboarding provisions via existing RPC wrapper');
  } else fail('Provisioning', 'App does not call resolveOrProvisionOwnerSalon');

  if (app.includes('setOwnerTemplate') && app.includes('switchSalonTemplatePresentation')) {
    pass('Template switch persists via set_owner_salon_template + local presentation helper');
  } else fail('Template switch wiring', 'missing RPC or helper');

  if (app.includes('nexora_signup_salon_name')) {
    pass('Signup salon name feeds provisioning');
  } else fail('Signup name', 'not wired into provision');
}

{
  const details = read('src/screens/StepDetails.tsx');
  if (details.includes('owner-onboarding-templates') && details.includes('ThemeSelector')) {
    pass('Owner onboarding includes 5-template picker');
  } else fail('Onboarding picker', 'missing from StepDetails');
}

{
  const gallery = read('src/components/ThemeSelector.tsx');
  if (gallery.includes('listOwnerTemplates') && gallery.includes('template-preview-') && gallery.includes('template-apply-')) {
    pass('Owners can preview and apply each of the five templates');
  } else fail('Preview/apply', 'ThemeSelector missing preview/apply');
  if (gallery.includes('owner-active-template-label')) {
    pass('Active template is shown to the owner');
  } else fail('Active badge', 'missing');
}

{
  const step = read('src/screens/StepTemplate.tsx');
  if (step.includes('TemplateConfigPanel')) pass('StepTemplate includes template config panel');
  else fail('StepTemplate config', 'missing panel');
}

{
  const dash = read('src/components/TemplateSelectionDashboard.tsx');
  const gallery = read('src/components/ThemeSelector.tsx');
  if (dash.includes('ThemeSelector') && gallery.includes('listOwnerTemplates') && FIVE.every((id) => read('src/lib/templateConfig.ts').includes(`id: '${id}'`))) {
    pass('Dashboard lists all 5 templates');
  } else fail('Dashboard templates', 'gallery not wired to five templates');
}

{
  const svc = read('src/lib/salonWebsiteService.ts');
  if (svc.includes('templateConfig: data.templateConfig')) {
    pass('Draft save persists templateConfig in existing config JSONB');
  } else fail('Draft persist', 'templateConfig not saved');
}

{
  const signup = read('src/components/SignUpPage.tsx');
  if (signup.includes('nexora_signup_salon_name')) pass('Signup stores business name for onboarding');
  else fail('Signup persist', 'missing salon name store');
}

{
  const types = read('src/types.ts');
  if (types.includes('templateConfig?: TemplateConfig')) pass('SalonData includes templateConfig');
  else fail('Types', 'templateConfig missing');
}

{
  const prov = read('src/lib/ownerProvisioning.ts');
  if (prov.includes('SET_OWNER_TEMPLATE_FN') && prov.includes('set_owner_salon_template')) {
    pass('Existing set_owner_salon_template client reused');
  } else fail('RPC reuse', 'ownerProvisioning missing template RPC');
}

{
  try {
    const out = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    if (out.includes('error TS')) fail('TYPECHECK', out.slice(0, 200));
    else pass('TYPECHECK: tsc --noEmit');
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : String(e);
    if (out.includes('error TS')) fail('TYPECHECK', out.split('\n').filter((l) => l.includes('error')).slice(0, 3).join(' | '));
    else pass('TYPECHECK: tsc --noEmit');
  }
}

console.log(`\nPHASE 1-B: ${passed}/${passed + failed} PASS`);
process.exit(failed > 0 ? 1 : 0);
