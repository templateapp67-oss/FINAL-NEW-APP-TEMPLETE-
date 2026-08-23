import { normalizeRouteSlug, matchesBrandFallbackSlug, buildBrandFallbackSalonData, BRAND_FALLBACK_SLUG } from '../src/lib/salonRouting';

let failures = 0;
function assert(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok  - ${label}`);
  } else {
    failures++;
    console.error(`  FAIL- ${label}`, detail ?? '');
  }
}

console.log('BRAND_FALLBACK_SLUG =', BRAND_FALLBACK_SLUG);

console.log('\n# normalizeRouteSlug');
assert('lowercases + trims trailing slash', normalizeRouteSlug('/Royal-Hair-Studio/') === 'royal-hair-studio', normalizeRouteSlug('/Royal-Hair-Studio/'));
assert('handles spaces', normalizeRouteSlug('/Royal Hair Studio') === 'royal-hair-studio', normalizeRouteSlug('/Royal Hair Studio'));
assert('handles mixed case', normalizeRouteSlug('/ROYAL-HAIR-STUDIO') === 'royal-hair-studio', normalizeRouteSlug('/ROYAL-HAIR-STUDIO'));
assert('root -> empty', normalizeRouteSlug('/') === '', JSON.stringify(normalizeRouteSlug('/')));
assert('deep path -> first segment', normalizeRouteSlug('/royal-hair-studio/book') === 'royal-hair-studio', normalizeRouteSlug('/royal-hair-studio/book'));

console.log('\n# matchesBrandFallbackSlug');
assert('matches canonical slug (mixed case)', matchesBrandFallbackSlug('Royal-Hair-Studio') === true);
assert('matches name-derived slug', matchesBrandFallbackSlug('royal-hair-beauty-studio') === true, BRAND_FALLBACK_SLUG);
assert('rejects unrelated slug', matchesBrandFallbackSlug('some-other-salon') === false);
assert('rejects empty', matchesBrandFallbackSlug('') === false);

console.log('\n# buildBrandFallbackSalonData');
const data = buildBrandFallbackSalonData('ROYAL-HAIR-STUDIO');
assert('salonName from brand config', data.salonName === 'Royal Hair & Beauty Studio', data.salonName);
assert('websiteSlug set to requested (normalized via caller)', data.websiteSlug === 'ROYAL-HAIR-STUDIO', data.websiteSlug);
assert('tagline present', typeof data.tagline === 'string' && data.tagline.length > 0, data.tagline);
assert('address fullAddress present', !!data.address?.fullAddress, data.address?.fullAddress);
assert('socialProfiles present', !!data.socialProfiles?.instagram, data.socialProfiles);
assert('services array exists', Array.isArray(data.services), data.services);
assert('openingHours exist', !!data.openingHours, data.openingHours);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
