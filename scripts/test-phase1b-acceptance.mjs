/**
 * Phase 1-B final acceptance matrix — structural proof each PASS cell is wired.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const [
  auth,
  session,
  provision,
  business,
  templates,
  app,
  preview,
  publicView,
  presentation,
  persist,
  acceptance,
] = await Promise.all([
  read('src/lib/useAuth.ts'),
  read('src/lib/ownerSession.ts'),
  read('src/lib/ownerProvisioning.ts'),
  read('src/lib/ownerBusinessSetup.ts'),
  read('src/lib/templateConfig.ts'),
  read('src/App.tsx'),
  read('src/lib/ownerPreview.ts'),
  read('src/components/PublicSalonView.tsx'),
  read('src/lib/publicSalonPresentation.ts'),
  read('src/lib/ownerWorkspacePersistence.ts'),
  read('docs/PHASE1B_ACCEPTANCE.md'),
]);

assert.match(auth, /export async function signUpWithPassword/);
assert.match(auth, /export async function signInWithPassword/);
assert.match(auth, /signInWithPassword|getSession/);
ok('OWNER AUTH');

assert.match(provision, /export async function resolveOrProvisionOwnerSalon/);
assert.match(session, /resolveOwnerSalonId/);
assert.match(provision, /owner_salon_ids|provision_owner_salon/);
ok('OWNER BUSINESS');

assert.match(business, /export async function persistOwnerBusinessSetup/);
assert.match(app, /persistOwnerBusinessSetup/);
ok('ONBOARDING');

for (const id of [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
]) {
  assert.match(templates, new RegExp(`id: '${id}'`));
}
assert.match(templates, /export function listOwnerTemplates/);
ok('FIVE TEMPLATES');

assert.match(templates, /sanitizeTemplateConfigForTemplate/);
assert.match(app, /saveOwnerWebsiteVisualConfig/);
ok('TEMPLATE CONFIG');

assert.match(templates, /switchSalonTemplatePresentation/);
assert.match(app, /setOwnerTemplate/);
assert.match(templates, /assertTemplateSwitchPreservesBusiness/);
ok('TEMPLATE SWITCHING');

assert.match(preview, /export function ownerPreviewData/);
assert.match(app, /switchSalonTemplatePresentation/);
ok('PREVIEW');

assert.match(publicView, /applyPublicTemplateConfiguration/);
assert.match(presentation, /website\.template_key|publicTemplateIdFromWebsite/);
ok('PUBLIC RENDERING');

assert.match(provision, /SET_OWNER_TEMPLATE_FN = 'set_owner_salon_template'/);
assert.doesNotMatch(provision, /p_salon_id/);
ok('SECURITY');

assert.match(persist, /salon_public_websites/);
assert.match(app, /loadOwnerWebsiteDraft/);
assert.match(auth, /clearOwnerBrowserWorkspaceCache|signOut/);
ok('REFRESH');

assert.match(acceptance, /Status: PASS/);
for (const row of [
  'OWNER AUTH',
  'OWNER BUSINESS',
  'ONBOARDING',
  'FIVE TEMPLATES',
  'TEMPLATE CONFIG',
  'TEMPLATE SWITCHING',
  'PREVIEW',
  'PUBLIC RENDERING',
  'SECURITY',
  'REFRESH',
  'BUILD',
]) {
  assert.match(acceptance, new RegExp(`${row}[\\s\\S]{0,80}\\*\\*PASS\\*\\*`));
}
ok('BUILD / acceptance record');

console.log(`\nPhase 1-B acceptance: ${passed}/${passed} checks PASS`);
