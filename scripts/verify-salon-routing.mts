import { normalizeRouteSlug, matchesBrandFallbackSlug, buildBrandFallbackSalonData, extractSubdomainSlug, getBrandBaseHost, BRAND_FALLBACK_SLUG } from '../src/lib/salonRouting';

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

console.log('\n# host-context / subdomain extraction');
const baseHost = getBrandBaseHost();
console.log('  base host =', baseHost);
assert('base host derived from brand websiteUrl', typeof baseHost === 'string' && baseHost.length > 0, baseHost);
assert('subdomain -> slug', extractSubdomainSlug(`royal-hair-studio.${baseHost}`) === 'royal-hair-studio', extractSubdomainSlug(`royal-hair-studio.${baseHost}`));
assert('subdomain with port -> slug', extractSubdomainSlug(`Royal-Hair-Studio.${baseHost}:3000`) === 'royal-hair-studio', extractSubdomainSlug(`Royal-Hair-Studio.${baseHost}:3000`));
assert('apex domain -> empty', extractSubdomainSlug(baseHost) === '', extractSubdomainSlug(baseHost));
assert('www label -> empty', extractSubdomainSlug(`www.${baseHost}`) === '', extractSubdomainSlug(`www.${baseHost}`));
assert('unknown/preview host (e2b.app) -> empty', extractSubdomainSlug('royal-hair-studio.e2b.app') === '', extractSubdomainSlug('royal-hair-studio.e2b.app'));
assert('localhost -> empty', extractSubdomainSlug('localhost') === '', extractSubdomainSlug('localhost'));
assert('IP address -> empty', extractSubdomainSlug('127.0.0.1') === '', extractSubdomainSlug('127.0.0.1'));

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
