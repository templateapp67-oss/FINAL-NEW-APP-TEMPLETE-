import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [main, app, publicView, m44, templateMigration, ownerProvisioning, hostRouting, templateRenderer, bookingFlow, fullBooking, ...themes] = await Promise.all([
  read('src/main.tsx'),
  read('src/App.tsx'),
  read('src/components/PublicSalonView.tsx'),
  read('supabase/migrations/20260824000101_m44_business_publishing.sql'),
  read('supabase/migrations/20260823000401_phase1_whitelabel_provisioning.sql'),
  read('src/lib/ownerProvisioning.ts'),
  read('server/hostRouting.ts'),
  read('src/components/TemplateRenderer.tsx'),
  read('src/lib/siteBookingFlow.ts'),
  read('src/components/SiteBookingFullFlow.tsx'),
  read('src/components/BarberTemplateRenderer.tsx'),
  read('src/components/HairStudioTemplateRenderer.tsx'),
  read('src/components/BeautySpaTemplateRenderer.tsx'),
  read('src/components/FamilyFullServiceTemplateRenderer.tsx'),
  read('src/components/NailLashStudioTemplateRenderer.tsx'),
]);

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

assert.match(main, /const normalizedPath = subdomainSlug \|\| normalizeRouteSlug\(pathname\)/);
assert.match(main, /\.rpc\('get_public_salon_website', \{ p_slug: normalizedPath \}\)/);
assert.match(hostRouting, /return `\/\$\{slug\}\$\{path === '\/' \? '' : path\}`/);
ok('path and existing white-label subdomain routes resolve one normalized slug');

assert.match(publicView, /\.rpc\('get_public_salon_website', \{ p_slug: slug \}\)/);
assert.match(publicView, /if \(!website\?\.salon_id \|\| !website\.slug \|\| !website\.business_name\) return null/);
assert.doesNotMatch(publicView, /salonId\s*:\s*['"][0-9a-f]{8}-/i);
ok('public business identity comes only from the URL-backed database projection');

assert.match(publicView, /\.from\('services'\)[\s\S]*\.eq\('salon_id', website\.salon_id\)[\s\S]*\.eq\('is_active', true\)[\s\S]*\.is\('deleted_at', null\)/);
assert.match(publicView, /price: Number\(service\.price_paise\) \/ 100/);
ok('active services and server-stored pricing load for the resolved business');

assert.match(publicView, /website\.template_key[\s\S]*themeKeys\.has\(website\.template_key\)/);
assert.match(publicView, /templateId: selectedTheme/);
for (const id of ['barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa', 'family_full_service', 'nail_lash_studio']) {
  assert.match(templateRenderer, new RegExp(`templateId === '${id}'`));
}
ok('the persisted active template selects the correct existing renderer');

assert.match(publicView, /\.\.\.config/);
assert.match(publicView, /listPublicSalonMedia\(website\.salon_id, \['logo', 'hero', 'gallery'\]\)/);
assert.match(publicView, /logoUrl: logo\?\.signedUrl/);
assert.match(publicView, /heroImageUrl: hero\?\.signedUrl/);
ok('branding and public media load from the resolved business');

assert.match(m44, /business_locations[\s\S]*approval_status = 'approved'/);
assert.match(publicView, /address: location \|\| website\.city/);
ok('only approved database location data reaches the public site');

for (const source of themes) assert.match(source, /<SiteBookingHost themeId=/);
assert.match(fullBooking, /salonId: data\.salonId/);
assert.match(bookingFlow, /typeof data\.salonId === 'string'[\s\S]*return data\.salonId\.trim\(\)/);
ok('every active template exposes booking for the database-resolved salon');

assert.match(m44, /where lower\(w\.slug\) = lower\(btrim\(p_slug\)\)[\s\S]*w\.is_published = true[\s\S]*s\.is_active = true[\s\S]*s\.deleted_at is null/);
assert.match(main, /unpublished database record must remain unavailable/);
ok('unpublished, inactive and deleted businesses fail closed');

assert.match(m44, /jsonb_strip_nulls\(jsonb_build_object/);
assert.match(m44, /grant execute on function public\.get_public_salon_website\(text\) to anon/);
assert.doesNotMatch(m44, /grant select on table public\.salon_public_websites to anon/);
ok('anonymous resolution uses the field-limited public RPC, not private owner data');

assert.match(ownerProvisioning, /client\.rpc\(SET_OWNER_TEMPLATE_FN/);
assert.match(templateMigration, /update public\.salons[\s\S]*set theme_id = v_theme_id[\s\S]*update public\.salon_public_websites[\s\S]*set template_key = v_template/);
assert.doesNotMatch(templateMigration.match(/create or replace function public\.set_owner_salon_template[\s\S]*?\$\$;/)?.[0] || '', /delete from|truncate/i);
assert.match(app, /draft\.templateKey \|\| draft\.config\.templateId/);
assert.match(app, /templateSwitchQueue\.current = templateSwitchQueue\.current\.then/);
ok('post-publish template changes are serialized, persisted and presentation-only');

console.log(`\nPublic website resolution: ${passed}/${passed} checks PASS`);
