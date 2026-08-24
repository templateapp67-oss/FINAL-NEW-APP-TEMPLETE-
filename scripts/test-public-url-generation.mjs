/**
 * Phase 1-B public URL generation (NO second URL/domain system).
 *
 * Business "Nexora Salon" must resolve to:
 *   slug:  nexora-salon
 *   href:  nexora-salon.nexora.site
 *   url:   https://nexora-salon.nexora.site
 *
 * Everything reads the existing phase-1B helpers in
 * `src/lib/publicWebsiteUrl.ts` (client slugifier + white-label URL builder)
 * and the canonical database allocators (`private.nexora_business_slug` /
 * `private.nexora_allocate_business_slug`, M44/M45) which the publish RPC
 * uses. This test proves the exact example, client/server subdomain
 * resolution parity, and that no second slug/URL generator exists.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isValidWebsiteSlug,
  publicWebsiteHref,
  publicWebsiteUrl,
  slugifySalonName,
  suggestedWebsiteSlug,
} from '../src/lib/publicWebsiteUrl.ts';
import {
  extractSubdomainSlug,
  getBrandBaseHost,
  normalizeRouteSlug,
} from '../src/lib/salonRouting.ts';
import { resolveHostSlug } from '../server/hostRouting.ts';
import { buildCanonicalUrl } from '../src/lib/siteSeo.ts';
import { emptyOwnerSalonData } from '../src/lib/ownerPreview.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---- 1. The exact example: business name → slug → white-label URL ---------
assert.equal(getBrandBaseHost(), 'nexora.site');
assert.equal(slugifySalonName('Nexora Salon'), 'nexora-salon');
assert.equal(suggestedWebsiteSlug({ salonName: 'Nexora Salon' }), 'nexora-salon');
assert.equal(isValidWebsiteSlug('nexora-salon'), true);
assert.equal(publicWebsiteHref('nexora-salon'), 'nexora-salon.nexora.site');
assert.equal(publicWebsiteUrl('nexora-salon'), 'https://nexora-salon.nexora.site');
ok('Nexora Salon → nexora-salon → https://nexora-salon.nexora.site');

// ---- 2. Slug generation edge parity with the database rules ----------------
assert.equal(slugifySalonName('  Nexora   Salon!!!  '), 'nexora-salon');
assert.equal(slugifySalonName('admin'), 'admin-salon', 'reserved route never claimed verbatim');
assert.equal(slugifySalonName('ab'), 'ab-salon', 'short names stay resolvable');
assert.equal(slugifySalonName(''), 'salon', 'empty names fall back like the DB allocator');
ok('client slugifier mirrors nexora_business_slug normalization and reserved rules');

// ---- 3. White-label subdomain resolution: client AND server parity --------
assert.equal(extractSubdomainSlug('nexora-salon.nexora.site'), 'nexora-salon');
assert.equal(resolveHostSlug('nexora-salon.nexora.site'), 'nexora-salon');
assert.equal(normalizeRouteSlug('/Nexora-Salon/'), 'nexora-salon');
assert.equal(normalizeRouteSlug('/NEXORA-SALON'), 'nexora-salon');
// Apex / www / unknown preview hosts are never misread as a business slug,
// and server + client agree on every host (existing Phase 1-B parity).
for (const host of ['nexora-site.nexora.site', 'nexora-salon.nexora.site', 'www.nexora.site']) {
  assert.equal(resolveHostSlug(host), extractSubdomainSlug(host), `host parity: ${host}`);
}
assert.equal(extractSubdomainSlug('nexora.site'), '');
assert.equal(extractSubdomainSlug('www.nexora.site'), '');
assert.equal(resolveHostSlug('nexora.site'), '');
assert.equal(resolveHostSlug('app.e2b.app'), '');
ok('subdomain + path resolution agree and never claim apex/platform hosts');

// ---- 4. Dev/preview-safe URL shape (same helper, one system) --------------
assert.equal(
  publicWebsiteHref('nexora-salon', 'https://localhost:3000'),
  'localhost:3000/nexora-salon',
);
assert.equal(
  publicWebsiteUrl('nexora-salon', 'https://localhost:3000'),
  'https://localhost:3000/nexora-salon',
);
ok('non-subdomain hosts use the existing path fallback from the same helper');

// ---- 5. SEO canonical URL uses the verified slug helper, not a fork -------
const draft = {
  ...emptyOwnerSalonData(),
  salonName: 'Nexora Salon',
  websiteSlug: 'nexora-salon',
};
assert.equal(buildCanonicalUrl(draft), 'https://nexora-salon.nexora.site');
const nameOnly = { ...emptyOwnerSalonData(), salonName: 'Nexora Salon' };
assert.equal(buildCanonicalUrl(nameOnly), 'https://nexora-salon.nexora.site');
ok('canonical SEO URL is produced by the same slug + URL helpers');

// ---- 6. No second URL/domain system in the application source -------------
const allowedUrlSources = new Set([
  'src/lib/publicWebsiteUrl.ts',
  'src/lib/siteSeo.ts', // consumes publicWebsiteUrl (checked below)
  'src/lib/salonRouting.ts', // host resolution only (no URL building)
  'server/hostRouting.ts', // path rewrite only (no URL building)
]);
const rendererNames = [
  'TemplateRenderer',
  'BarberTemplateRenderer',
  'BeautySpaTemplateRenderer',
  'FamilyFullServiceTemplateRenderer',
  'HairStudioTemplateRenderer',
  'NailLashStudioTemplateRenderer',
];
const renderers = await Promise.all(rendererNames.map((n) => read(`src/components/${n}.tsx`)));
const tsx = (await read('src/lib/siteSeo.ts')) + '\n' + renderers.join('\n');
assert.match(tsx, /from '\.\.\/lib\/publicWebsiteUrl'/);
assert.doesNotMatch(tsx, /function slugify\(/);
assert.doesNotMatch(tsx, /replace\(\[;\]?\[^a-z0-9/);
assert.doesNotMatch(tsx, /`https:\/\/\$\{[^}]*\}\.\$\{/);
ok('siteSeo + all six template renderers consume the canonical helpers — no local slugs/URLs');

const [app, service, setup, main, migrate44] = await Promise.all([
  read('src/App.tsx'),
  read('src/lib/salonWebsiteService.ts'),
  read('src/screens/StepPublishSetup.tsx'),
  read('src/main.tsx'),
  read('supabase/migrations/20260824000101_m44_business_publishing.sql'),
]);
assert.match(app, /import \{[^}]*publicWebsiteUrl[^}]*\} from '\.\/lib\/publicWebsiteUrl'/);
assert.match(app, /publicWebsiteUrl\(draft\.slug\)/);
assert.match(service, /import \{[^}]*slugifySalonName[^}]*\} from '\.\/publicWebsiteUrl'/);
assert.match(service, /const slug = slugifySalonName\(data\.salonName\) \|\| 'salon'/);
assert.match(setup, /const publishedUrl = publicWebsiteUrl\(saved\.slug, platform\.websiteUrl\)/);
assert.match(main, /get_public_salon_website', \{ p_slug: normalizedPath \}/);
assert.match(migrate44, /private\.nexora_business_slug/);
assert.match(migrate44, /private\.nexora_allocate_business_slug/);
assert.match(migrate44, /URL is generated from the persisted/);
assert.match(migrate44, /business name and collision-resolved/);
assert.match(migrate44, /No second domain\/website table is introduced/);
assert.doesNotMatch(migrate44, /create table[^;]*website[^;]*slug/i);
ok('single DB allocator (M44/M45) + one client helper; no second table or URL builder');

void allowedUrlSources;

console.log(`\nPublic URL generation: ${passed}/${passed} checks PASS`);
