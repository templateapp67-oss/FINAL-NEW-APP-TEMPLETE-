/**
 * DYNAMIC PUBLISHED LINK (slug) — regression coverage.
 *
 * Requirement: replace generic published links (e.g. `/my-salon-3`, allocated
 * from the placeholder name before the owner ever typed one) with a sanitized
 * slug generated from the ACTUAL salon name ("Arts By Uma" -> `/arts-by-uma`),
 * on both the client and the server, and keep a PUBLISHED address immutable.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const {
  generateSalonSlug,
  slugifySalonName,
  uniqueSalonSlug,
  currentSalonSlug,
  isValidWebsiteSlug,
  MAX_SLUG_LENGTH,
} = await import('../src/lib/publicWebsiteUrl.ts');

/* ------------------------------------------------------------------ */
/* 1. Slug generator utility                                           */
/* ------------------------------------------------------------------ */

assert.equal(generateSalonSlug('Arts By Uma'), 'arts-by-uma');
assert.equal(generateSalonSlug('  Arts   By   Uma  '), 'arts-by-uma');
assert.equal(generateSalonSlug('ARTS BY UMA'), 'arts-by-uma');
ok('salon name -> lowercase, hyphen-separated slug ("Arts By Uma" -> arts-by-uma)');

assert.equal(generateSalonSlug("Uma's Studio!!!"), 'uma-s-studio');
assert.equal(generateSalonSlug('Nexora Salon (Koramangala) #1'), 'nexora-salon-koramangala-1');
assert.equal(generateSalonSlug('Salon__--__X'), 'salon-x');
ok('special characters are removed and runs collapse to a single hyphen');

assert.equal(generateSalonSlug('Üma Studio & Spa'), 'uma-studio-and-spa');
assert.equal(generateSalonSlug('Café Crème'), 'cafe-creme');
ok('accents are transliterated, never deleted');

assert.equal(generateSalonSlug(''), 'salon');
assert.equal(generateSalonSlug(null), 'salon');
assert.equal(generateSalonSlug('!!!'), 'salon');
ok('an empty/unusable name falls back to a safe slug');

assert.equal(generateSalonSlug('Um'), 'um-salon');
ok('slugs shorter than the 3-character DB minimum are extended');

for (const reserved of ['dashboard', 'api', 'admin', 'www', 'login']) {
  const slug = generateSalonSlug(reserved);
  assert.ok(!['dashboard', 'api', 'admin', 'www', 'login'].includes(slug), `${reserved} stayed reserved`);
  assert.ok(isValidWebsiteSlug(slug), `${reserved} produced an invalid slug: ${slug}`);
}
ok('platform-reserved routes can never become a business address');

const long = generateSalonSlug('a'.repeat(200));
assert.ok(long.length <= MAX_SLUG_LENGTH, `slug exceeded ${MAX_SLUG_LENGTH} chars: ${long.length}`);
assert.ok(isValidWebsiteSlug(long));
ok(`generated slugs are clamped to ${MAX_SLUG_LENGTH} characters`);

// Backwards compatibility: the historical name still resolves identically.
assert.equal(slugifySalonName('Arts By Uma'), generateSalonSlug('Arts By Uma'));
ok('slugifySalonName remains an alias of the canonical generator');

/* ------------------------------------------------------------------ */
/* 2. Collision sequence mirrors the DB allocator                      */
/* ------------------------------------------------------------------ */

assert.equal(uniqueSalonSlug('Nexora Salon', []), 'nexora-salon');
assert.equal(uniqueSalonSlug('Nexora Salon', ['nexora-salon']), 'nexora-salon-1');
assert.equal(uniqueSalonSlug('Nexora Salon', ['nexora-salon', 'nexora-salon-1']), 'nexora-salon-2');
assert.equal(uniqueSalonSlug('Nexora Salon', ['nexora-salon', 'nexora-salon-1', 'nexora-salon-2']), 'nexora-salon-3');
ok('collision suffixes follow the canonical base / base-1 / base-2 sequence');

const clashed = uniqueSalonSlug('a'.repeat(60), [`${'a'.repeat(50)}`]);
assert.ok(clashed.length <= MAX_SLUG_LENGTH, 'suffixed slug exceeded the length cap');
assert.ok(isValidWebsiteSlug(clashed));
ok('a suffixed slug stays URL-safe and inside the length cap');

/* ------------------------------------------------------------------ */
/* 3. Draft vs published slug behaviour                                */
/* ------------------------------------------------------------------ */

assert.equal(
  currentSalonSlug({ salonName: 'Arts By Uma', websiteSlug: 'my-salon-3', published: false }),
  'arts-by-uma',
);
ok('an unpublished salon replaces the placeholder slug with the real name');

assert.equal(
  currentSalonSlug({ salonName: 'Arts By Uma', websiteSlug: 'my-salon-3', published: true, publishedUrl: 'https://x/my-salon-3' }),
  'my-salon-3',
);
ok('a PUBLISHED slug is immutable — renaming the salon never breaks a shared link');

assert.equal(
  currentSalonSlug({ salonName: '', websiteSlug: 'my-salon-3', published: false }),
  'my-salon-3',
);
ok('an empty salon name never wipes an already allocated slug');

/* ------------------------------------------------------------------ */
/* 4. Wiring: client + server both derive the slug from the name       */
/* ------------------------------------------------------------------ */

const [setup, service, apiRoutes, app, details] = await Promise.all([
  read('src/screens/StepPublishSetup.tsx'),
  read('src/lib/salonWebsiteService.ts'),
  read('api-routes.ts'),
  read('src/App.tsx'),
  read('src/screens/StepDetails.tsx'),
]);

assert.match(setup, /generateSalonSlug\(data\.salonName\)/);
assert.match(setup, /publishState === 'published' && data\.websiteSlug\) return data\.websiteSlug/);
ok('the publish screen generates the slug from the salon name (published one kept)');

assert.match(service, /export function draftSlugForSalonName\(/);
assert.match(service, /if \(isPublished === true && isValidWebsiteSlug\(currentSlug \|\| ''\)\)/);
assert.match(service, /const desired = generateSalonSlug\(data\.salonName\);/);
ok('the draft save syncs the unpublished slug from the business name');

assert.match(apiRoutes, /function resolveDraftSlug\(/);
assert.match(apiRoutes, /function draftSlugFromName\(name: string\)/);
assert.match(apiRoutes, /if \(input\.isPublished && isValidSlug\(input\.existingSlug\)\)/);
assert.match(apiRoutes, /const salonName = typeof req\.body\?\.salonName === 'string'/);
assert.match(apiRoutes, /salonName,\s*\n\s*existingSlug: existingSite\?\.slug \|\| salon\.slug \|\| '',/);
ok('the server draft route applies the same published/draft slug rule');

assert.match(app, /const dynamicSlug = currentSalonSlug\(\{/);
assert.match(app, /generated === data\.websiteSlug\) return;/);
ok('the wizard keeps websiteSlug in step with the salon name while unpublished');

assert.match(details, /generateSalonSlug\(data\.salonName\)/);
assert.match(details, /data-testid="salon-slug-preview"/);
ok('step 2 previews the address the salon will publish at');

console.log(`\nDynamic published link (slug): ${passed}/${passed} checks PASS`);
