import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const walk = async (dir) => {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(relative));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(relative);
  }
  return files;
};

const [m44, m46, publicView, browserClient, legacyClient, envExample] = await Promise.all([
  read('supabase/migrations/20260824000101_m44_business_publishing.sql'),
  read('supabase/migrations/20260824000301_m46_public_access_security.sql'),
  read('src/components/PublicSalonView.tsx'),
  read('src/lib/supabase.ts'),            // canonical shared client
  read('src/lib/supabaseClient.ts'),      // legacy compatibility re-export
  read('.env.example'),
]);

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const publicProjection = m44.match(/create or replace function public\.get_public_salon_website[\s\S]*?\n\$\$;/)?.[0] || '';
assert.ok(publicProjection);
for (const privateKey of ['ownerName', 'ownerRole', 'ownerPhotoUrl', "w.config->'email'", "w.config->'team'"]) {
  assert.doesNotMatch(publicProjection, new RegExp(privateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(publicProjection, /jsonb_strip_nulls\(jsonb_build_object/);
ok('public website RPC excludes private owner and staff configuration');

assert.match(m46, /create or replace function public\.get_public_salon_services\(p_slug text\)/);
assert.match(m46, /svc\.price_paise/);
assert.doesNotMatch(m46.match(/create or replace function public\.get_public_salon_services[\s\S]*?\n\$\$;/)?.[0] || '', /customer|payment|created_by|updated_by/i);
assert.match(publicView, /\.rpc\('get_public_salon_services', \{ p_slug: slug \}\)/);
assert.doesNotMatch(publicView, /\.from\('services'\)/);
ok('anonymous catalog access is a published-slug field projection');

for (const table of ['profiles', 'customers', 'bookings', 'website_bookings', 'payments', 'payment_orders', 'payment_webhook_events']) {
  assert.match(m46, new RegExp(`'${table}'`));
}
assert.match(m46, /revoke all privileges on table public\.%I from anon/);
assert.match(m46, /anon has no direct sensitive table privileges/);
ok('anonymous grants are revoked from owner, customer, booking and payment tables');

assert.match(m44, /revoke select on table public\.salon_public_websites from anon/);
assert.match(m44, /revoke select on table public\.salons from anon/);
assert.match(m46, /revoke all on function public\.verify_m46_public_access_security\(\)[\s\S]*from public, anon, authenticated/);
ok('private drafts, root business rows and security verifier remain non-public');

assert.match(browserClient, /env\.VITE_SUPABASE_ANON_KEY/);
assert.doesNotMatch(browserClient, /env\.VITE_SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(legacyClient, /env\.VITE_SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(envExample, /^VITE_.*(?:SERVICE_ROLE|RAZORPAY.*SECRET|WEBHOOK_SECRET)/m);
ok('browser configuration accepts only the public Supabase key');

const browserFiles = await walk('src');
for (const file of browserFiles) {
  const source = await read(file);
  assert.doesNotMatch(source, /import\.meta\.env\.VITE_(?:SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET)/, file);
}
ok('no browser module imports service-role or payment secrets');

assert.match(envExample, /^SUPABASE_SERVICE_ROLE_KEY=/m);
assert.match(envExample, /^RAZORPAY_KEY_SECRET=/m);
assert.match(envExample, /^RAZORPAY_WEBHOOK_SECRET=/m);
assert.doesNotMatch(envExample, /^VITE_SUPABASE_SERVICE_ROLE_KEY=/m);
ok('sensitive credentials are documented as server-only environment values');

console.log(`\nPublic access security: ${passed}/${passed} checks PASS`);
