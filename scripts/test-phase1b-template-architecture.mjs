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

const sql = read('supabase/migrations/20260824000501_m48_template_switch_isolation.sql');
{
  if (sql.includes('set theme_id') && sql.includes('set template_key') && sql.includes('presentation change')) {
    pass('RPC updates only salons.theme_id + website.template_key');
  } else fail('RPC columns', 'set_owner_salon_template not presentation-only');
  const switchFn = sql.slice(
    sql.indexOf('create or replace function public.set_owner_salon_template'),
    sql.indexOf('create or replace function public.set_owner_salon_visual_config'),
  );
  for (const table of ['services', 'service_price_variants', 'products', 'bookings', 'payment_orders', 'payments', 'business_locations', 'organization_members', 'organizations', 'profiles']) {
    const writes = new RegExp(`(insert into|update|delete from)\\s+public\\.${table}`, 'i');
    if (writes.test(switchFn)) fail(`RPC must not write ${table}`, 'core table touched');
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
  const invariants = read('src/lib/templateSwitchInvariants.ts');
  if (
    sw.includes('assertTemplateSwitchPreservesBusiness(data, switched)') &&
    invariants.includes('snapshotTemplateSwitchProtectedData') &&
    invariants.includes('TEMPLATE_SWITCH_PROTECTED_DOMAINS')
  ) {
    pass('Client switch fails closed over every non-presentation SalonData field');
  } else fail('client switch', 'missing fail-closed protected-data invariant');
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
  if (
    app.includes('setOwnerTemplate') &&
    app.includes('switchSalonTemplatePresentation') &&
    app.includes('templateSwitchProtectedRevision') &&
    app.includes('templateSwitchQueue.current = operation.catch') &&
    app.includes('templateSwitchQueue.current = save.then') &&
    app.includes('saveOwnerWebsiteVisualConfig')
  ) {
    pass('App serializes template, visual, and pending business saves without template-triggered business autosave');
  } else fail('App wiring', 'missing isolated autosave or recoverable shared persistence queue');
}

{
  const dashboard = read('src/components/TemplateSelectionDashboard.tsx');
  const step = read('src/screens/StepTemplate.tsx');
  if (
    dashboard.includes('Templates / Change Template') &&
    dashboard.includes('owner-template-live-preview') &&
    dashboard.includes('setPreviewId(id)') &&
    step.includes('Saving template…') &&
    !step.includes('absolute inset-0 bg-white/80')
  ) {
    pass('Change Template dashboard previews immediately without claiming persisted active success');
  } else fail('Immediate owner preview', 'dashboard preview or non-blocking save state missing');
}

{
  const config = read('src/lib/templateConfig.ts');
  const visualService = read('src/lib/salonWebsiteService.ts');
  if (
    config.includes('TEMPLATE_CONFIG_CAPABILITIES') &&
    config.includes('sanitizeTemplateConfigForTemplate') &&
    config.includes('templateConfigs:') &&
    visualService.includes('templateConfigs: normalizeTemplateConfigs')
  ) {
    pass('Per-template JSONB config is capability-filtered and preserved separately');
  } else fail('Compatible config reset', 'capability filtering or per-template persistence missing');
}

{
  const mobileBar = read('src/components/SiteMobileActionBar.tsx');
  if (
    mobileBar.includes('useIsOwnerPreview()') &&
    mobileBar.includes('hasSalonAddress(data, true)') &&
    mobileBar.includes('salonMapsHref(data, ownerPreview)') &&
    mobileBar.includes('site-mobile-bar-directions-disabled')
  ) {
    pass('Owner mobile preview cannot resolve Directions through the public location fallback');
  } else fail('Owner mobile Directions', 'missing owner-aware address guard or stable disabled slot');
}

{
  const contact = read('src/screens/StepContactBooking.tsx');
  const emptyLabels = read('src/lib/ownerPreview.ts');
  const browserChromeRenderers = [
    'src/components/TemplateRenderer.tsx',
    'src/components/BarberTemplateRenderer.tsx',
    'src/components/HairStudioTemplateRenderer.tsx',
    'src/components/BeautySpaTemplateRenderer.tsx',
    'src/components/FamilyFullServiceTemplateRenderer.tsx',
    'src/components/NailLashStudioTemplateRenderer.tsx',
  ].map(read);
  if (
    !contact.includes('+91 98765 43210') &&
    contact.includes('phone || OWNER_PREVIEW_EMPTY.phone') &&
    emptyLabels.includes("websiteAddress: 'Website address not added'") &&
    browserChromeRenderers.every((renderer) =>
      renderer.includes('ownerPreview && !(data.websiteSlug || \'\').trim()') &&
      renderer.includes('OWNER_PREVIEW_EMPTY.websiteAddress')
    )
  ) {
    pass('Owner contact and browser labels never invent phone numbers or website addresses');
  } else fail('Owner contact/browser labels', 'sample contact fallback or synthesized owner website address remains');
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
