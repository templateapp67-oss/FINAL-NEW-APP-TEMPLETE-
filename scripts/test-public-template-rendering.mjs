/**
 * Public renderer: Business → Active Template → Template Configuration.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyPublicTemplateConfiguration } from '../src/lib/publicSalonPresentation.ts';
import { initialData } from '../src/types.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [publicView, renderer, m44, m49] = await Promise.all([
  read('src/components/PublicSalonView.tsx'),
  read('src/components/TemplateRenderer.tsx'),
  read('supabase/migrations/20260824000101_m44_business_publishing.sql'),
  read('supabase/migrations/20260824000601_m49_public_template_config.sql'),
]);

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

assert.match(publicView, /resolvePublicSalonWebsite\(client, slug\)/);
assert.match(publicView, /applyPublicTemplateConfiguration\(/);
assert.match(publicView, /website\.template_key/);
assert.match(publicView, /<TemplateRenderer data=\{state\.data\} mode=\{mode\} \/>/);
ok('public view resolves website then applies active template + config');

for (const id of [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
]) {
  assert.match(renderer, new RegExp(`templateId === '${id}'`));
}
ok('existing renderer still switches on the resolved templateId');

assert.match(m44, /w\.template_key/);
assert.match(m49, /'templateConfig', w\.config->'templateConfig'/);
assert.match(m49, /'templateConfigs', w\.config->'templateConfigs'/);
assert.match(m49, /'heroPosition', w\.config->'heroPosition'/);
assert.doesNotMatch(m49, /ownerName|ownerPhotoUrl|email/);
ok('public projection includes template configuration, not owner-private fields');

const spa = applyPublicTemplateConfiguration(
  { ...initialData, salonName: 'Business A', services: [{ id: 's1', name: 'Cut', category: 'Hair', description: '', price: 1, duration: 10 }] },
  {
    templateId: 'barber_mens_grooming',
    brandColor: '#111111',
    templateConfig: { appearance: 'dark', accentColor: '#1e7a63', salonNameFont: 'modern-sans' },
    templateConfigs: {
      beauty_skin_spa: { appearance: 'dark', accentColor: '#1e7a63', salonNameFont: 'modern-sans' },
    },
  },
  'beauty_skin_spa',
);
assert.equal(spa.templateId, 'beauty_skin_spa');
assert.equal(spa.brandColor, '#1e7a63');
assert.equal(spa.websiteAppearance, 'dark');
assert.equal(spa.salonName, 'Business A');
assert.equal(spa.services?.[0]?.name, 'Cut');
ok('stale templateId in config cannot override the active template_key');

const nail = applyPublicTemplateConfiguration(
  { ...initialData, salonName: 'Business B' },
  { brandColor: '#ff2d8d', templateConfig: { accentColor: '#ff2d8d', appearance: 'light' } },
  'nail_lash_studio',
);
assert.equal(nail.templateId, 'nail_lash_studio');
assert.equal(nail.brandColor, '#ff2d8d');
ok('nail studio public site uses its own template configuration');

console.log(`\nPublic template rendering: ${passed}/${passed} checks PASS`);
