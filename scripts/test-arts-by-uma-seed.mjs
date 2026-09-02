/**
 * Arts By Uma — offline demo-seed verification.
 *
 * The featured tenant `/arts-by-uma` must resolve to a FULLY seeded, rich
 * public salon even when Supabase is unconfigured/unreachable (offline mode),
 * instead of rendering "Salon Not Found". This change is ADDITIVE: the
 * configured brand-default slug (`nexora-demo-salon`) and every other fallback
 * behaviour must be untouched.
 */
import assert from 'node:assert/strict';
import {
  matchesBrandFallbackSlug,
  buildBrandFallbackSalonData,
  buildDemoSeedSalonData,
  DEMO_SEED_SLUGS,
  BRAND_FALLBACK_SLUG,
} from '../src/lib/salonRouting.ts';

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---- 1. Demo seed slug recognition (additive) ----------------------------
assert.deepEqual(DEMO_SEED_SLUGS, ['arts-by-uma']);
ok('DEMO_SEED_SLUGS contains only arts-by-uma');

assert.equal(matchesBrandFallbackSlug('arts-by-uma'), true);
ok('matchesBrandFallbackSlug("arts-by-uma") === true');
assert.equal(matchesBrandFallbackSlug('/Arts-By-Uma/'), true);
ok('matchesBrandFallbackSlug normalizes "/Arts-By-Uma/"');
assert.equal(matchesBrandFallbackSlug('Arts By Uma'), true);
ok('matchesBrandFallbackSlug normalizes "Arts By Uma" name');

// ---- 2. Rich seeded data is returned for arts-by-uma ----------------------
const uma = buildBrandFallbackSalonData('arts-by-uma');
assert.equal(uma.salonName, 'Arts By Uma');
ok('seed salonName === "Arts By Uma"');
assert.ok(typeof uma.tagline === 'string' && uma.tagline.length > 0, 'tagline');
assert.ok(uma.about && uma.about.length > 20);
assert.equal(uma.websiteSlug, 'arts-by-uma');
ok('seed websiteSlug === "arts-by-uma"');

assert.ok(Array.isArray(uma.services) && uma.services.length >= 4, 'services');
assert.ok(uma.services.every((s) => s.name && s.price > 0 && s.duration > 0), 'each service priced + timed');
assert.equal(uma.services.some((s) => s.featured), true, 'has featured services');
ok('services seeded (>=4, priced, timed, featured)');

assert.ok(Array.isArray(uma.packages) && uma.packages.length >= 1, 'packages');
ok('packages seeded');

assert.ok(Array.isArray(uma.team) && uma.team.length >= 1, 'team');
assert.equal(uma.team[0].name, 'Uma Sharma');
ok('team seeded with Uma Sharma');

assert.ok(Array.isArray(uma.gallery) && uma.gallery.length >= 4, 'gallery');
ok('gallery seeded (>=4 images)');

assert.ok(uma.socialProfiles?.instagram, 'instagram');
assert.ok(uma.socialVideos && uma.socialVideos.length >= 1, 'socialVideos');
ok('socialProfiles + socialVideos seeded');

assert.ok(uma.address?.fullAddress && uma.address.city === 'Jaipur', 'address city Jaipur');
ok('address seeded with Jaipur location');

assert.ok(uma.openingHours?.monday?.open === true, 'monday open');
assert.ok(uma.openingHours?.sunday?.open === true, 'sunday open');
ok('openingHours seeded for all days');

assert.ok(uma.phone && uma.whatsappPhone && uma.email, 'contact seeded');
ok('contact channels seeded');

// ---- 3. Brand-default fallback is untouched ------------------------------
assert.equal(matchesBrandFallbackSlug(BRAND_FALLBACK_SLUG), true);
ok(`brand default ${BRAND_FALLBACK_SLUG} still matches`);

const brand = buildBrandFallbackSalonData(BRAND_FALLBACK_SLUG);
assert.equal(brand.salonName, 'Nexora Demo Salon');
ok('brand fallback still returns Nexora Demo Salon (not the seed)');

assert.equal(buildDemoSeedSalonData('nexora-demo-salon'), null);
ok('buildDemoSeedSalonData returns null for brand-default slug');

// ---- 4. Unrelated slugs stay non-fallback --------------------------------
assert.equal(matchesBrandFallbackSlug('some-other-salon'), false);
assert.equal(matchesBrandFallbackSlug(''), false);
ok('unrelated slugs still rejected');

console.log(`\n${passed} checks passed — Arts By Uma offline seed verified (additive).`);
