/**
 * AUTOSAVE + COMPLETE DRAFT PERSISTENCE — regression coverage.
 *
 * Fixes covered:
 *   - A debounced (1.5s–2s) autosave runs on EVERY step 1–14 change and writes
 *     BOTH the LocalStorage fallback and the backend — no manual click needed.
 *   - The header shows "Saving…" / "Saved ✓" / "Save failed".
 *   - One unified draft schema persists salon details, logo, hero, gallery,
 *     services, offers and team — nothing is dropped on refresh or navigation.
 *   - "Save & Publish" commits all of it before the site goes live.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

/* ------------------------------------------------------------------ */
/* 0. DOM shims (localStorage for the draft cache)                     */
/* ------------------------------------------------------------------ */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
}

const { initialData } = await import('../src/types.ts');
const {
  UNIFIED_DRAFT_FIELDS,
  unifiedDraftFromSalonData,
  mergeUnifiedDraft,
  hasDraftContent,
  draftFingerprint,
} = await import('../src/lib/unifiedSalonDraft.ts');
const {
  AUTOSAVE_DEBOUNCE_MS,
  LOCAL_CACHE_DEBOUNCE_MS,
} = await import('../src/hooks/useAutosave.ts');
const {
  draftCacheKey,
  readDraftCache,
  writeDraftCache,
  clearDraftCache,
  restoreDraftCache,
} = await import('../src/lib/salonDraftStorage.ts');

/* ------------------------------------------------------------------ */
/* 1. One unified draft schema                                         */
/* ------------------------------------------------------------------ */

for (const field of [
  'salonName', 'tagline', 'about', 'phone', 'email', 'whatsappPhone',
  'logoUrl', 'heroImageUrl', 'gallery',
  'services', 'packages', 'offers', 'team',
  'socialProfiles', 'socialVideos', 'address', 'openingHours',
  'announcements', 'holidays', 'contactOptions', 'bookingRules',
  'websiteAppearance', 'brandColor', 'salonNameFont', 'salonNameColor',
  'reviewedContent', 'websiteCopy', 'metaTitle', 'metaDescription',
]) {
  assert.ok(
    UNIFIED_DRAFT_FIELDS.includes(field),
    `${field} is missing from the unified draft — it would be dropped on save`,
  );
}
ok('salon details, logo, hero, gallery, services, offers and team are all persisted fields');

// Identity/publish state is database-owned and must never round-trip.
for (const field of ['salonId', 'publishState', 'publishedUrl', 'websiteSlug', 'lastCompletedStep']) {
  assert.ok(!UNIFIED_DRAFT_FIELDS.includes(field), `${field} must stay database-owned`);
}
ok('salonId / publishState / publishedUrl are never restored from a browser cache');

const full = {
  ...initialData,
  salonName: 'Arts By Uma',
  logoUrl: 'https://cdn.example.com/logo.png',
  heroImageUrl: 'https://cdn.example.com/hero.jpg',
  gallery: [{ id: 'g1', url: 'https://cdn.example.com/g1.jpg', category: 'Hair' }],
  services: [{ id: 's1', name: 'Fade', price: 400, duration: 30, category: 'Hair' }],
  offers: [{ id: 'o1', title: 'First visit 20% off' }],
  team: [{ id: 't1', name: 'Uma', role: 'Stylist' }],
  salonId: 'salon-uuid',
  publishState: 'published',
  publishedUrl: 'https://example.com/arts-by-uma',
  websiteSlug: 'arts-by-uma',
};
const draft = unifiedDraftFromSalonData(full);
assert.equal(draft.salonName, 'Arts By Uma');
assert.equal(draft.logoUrl, 'https://cdn.example.com/logo.png');
assert.equal(draft.heroImageUrl, 'https://cdn.example.com/hero.jpg');
assert.equal(draft.gallery.length, 1);
assert.equal(draft.services.length, 1);
assert.equal(draft.offers.length, 1);
assert.equal(draft.team.length, 1);
assert.equal(draft.salonId, undefined, 'salonId must not be serialized');
assert.equal(draft.publishState, undefined, 'publishState must not be serialized');
ok('the serializer emits every business field and no identity field');

/* ------------------------------------------------------------------ */
/* 2. Merge never drops data                                           */
/* ------------------------------------------------------------------ */

const base = { ...initialData, salonName: 'Base', gallery: [{ id: 'g1', url: 'a.jpg' }] };
assert.equal(mergeUnifiedDraft(base, { salonName: 'Next' }).gallery.length, 1,
  'an absent gallery key must not drop the existing gallery');
assert.equal(mergeUnifiedDraft(base, { gallery: [] }).gallery.length, 0,
  'an explicit empty array is honoured');
assert.equal(mergeUnifiedDraft(base, { gallery: [{ id: 'g2', url: 'b.jpg' }] }).gallery[0].id, 'g2',
  'arrays are replaced wholesale, never half-merged');
const hostile = mergeUnifiedDraft(base, { salonId: 'attacker-uuid', publishState: 'published', websiteSlug: 'evil' });
assert.equal(hostile.salonId, base.salonId, 'a stored draft cannot inject a salon id');
assert.equal(hostile.publishState, base.publishState, 'a stored draft cannot fake publication');
ok('merge keeps absent fields, honours null/empty, and rejects identity injection');

assert.equal(hasDraftContent({}), false);
assert.equal(hasDraftContent({ salonName: '   ' }), false);
assert.equal(hasDraftContent({ salonName: 'Arts By Uma' }), true);
assert.equal(hasDraftContent({ gallery: [] }), false);
assert.equal(hasDraftContent({ gallery: [{ id: 'g1', url: 'a.jpg' }] }), true);
ok('hasDraftContent distinguishes a real draft from an empty shell');

const fingerprintA = draftFingerprint({ ...base, salonName: 'A' });
const fingerprintB = draftFingerprint({ ...base, salonName: 'B' });
assert.notEqual(fingerprintA, fingerprintB, 'a business edit must change the fingerprint');
assert.equal(fingerprintA, draftFingerprint({ ...base, salonName: 'A' }), 'the fingerprint is stable');
assert.equal(
  draftFingerprint({ ...base, salonName: 'A', templateConfig: { heroPosition: 'Top' } }),
  fingerprintA,
  'a presentation-only toggle must not trigger a business write',
);
ok('the autosave fingerprint is content-based and presentation-independent');

/* ------------------------------------------------------------------ */
/* 3. Tenant-scoped LocalStorage fallback                              */
/* ------------------------------------------------------------------ */

assert.match(draftCacheKey('user-a'), /^nexora_salon_draft_v1:user-a$/);
assert.notEqual(draftCacheKey('user-a'), draftCacheKey('user-b'));
assert.equal(draftCacheKey(null), 'nexora_salon_draft_v1:anonymous');
ok('the draft cache key is scoped to the signed-in owner');

assert.equal(writeDraftCache('user-a', full, 4), true);
const cachedA = readDraftCache('user-a');
assert.ok(cachedA, 'the draft cache was not written');
assert.equal(cachedA.step, 4);
assert.equal(cachedA.draft.salonName, 'Arts By Uma');
assert.equal(cachedA.draft.gallery.length, 1);
assert.equal(cachedA.draft.logoUrl, 'https://cdn.example.com/logo.png');
ok('the cache stores the whole unified draft (details, logo, hero, gallery, services)');

assert.equal(readDraftCache('user-b'), null, 'another account must never read this cache');
ok('a second account cannot read the first account\'s cached draft');

assert.equal(cachedA.draft.salonId, undefined, 'the cache must never store the salon id');
assert.equal(cachedA.draft.publishState, undefined, 'the cache must never store publishState');
ok('the cache excludes database-owned identity fields');

const restored = restoreDraftCache(
  { ...initialData, salonId: 'server-uuid', publishState: 'draft', salonName: '', gallery: [] },
  cachedA,
);
assert.equal(restored.salonName, 'Arts By Uma', 'the cached business content was not restored');
assert.equal(restored.salonId, 'server-uuid', 'the server salon id must survive a restore');
assert.equal(restored.publishState, 'draft', 'publication state stays server-owned after a restore');
ok('restoring the cache never overwrites server-owned identity or publish state');

clearDraftCache('user-a');
assert.equal(readDraftCache('user-a'), null);
ok('the cache is cleared on demand (sign-out / confirmed save)');

/* ------------------------------------------------------------------ */
/* 4. Autosave hook contract                                           */
/* ------------------------------------------------------------------ */

assert.ok(AUTOSAVE_DEBOUNCE_MS >= 1500 && AUTOSAVE_DEBOUNCE_MS <= 2000,
  `the autosave debounce must be 1.5s–2s, got ${AUTOSAVE_DEBOUNCE_MS}`);
ok(`the autosave debounce is ${AUTOSAVE_DEBOUNCE_MS}ms (inside the required 1.5s–2s window)`);

assert.ok(LOCAL_CACHE_DEBOUNCE_MS < AUTOSAVE_DEBOUNCE_MS,
  'the LocalStorage mirror must land before the API call');
ok('the LocalStorage fallback is written faster than the backend call');

const [app, hook, topBar, debounce, website, saveAndPublish] = await Promise.all([
  read('src/App.tsx'),
  read('src/hooks/useAutosave.ts'),
  read('src/components/TopBar.tsx'),
  read('src/hooks/useDebounce.ts'),
  read('src/lib/salonWebsiteService.ts'),
  read('src/lib/saveAndPublish.ts'),
]);

assert.match(app, /useAutosave<SalonData>\(\{/);
assert.match(app, /delay: AUTOSAVE_DEBOUNCE_MS,/);
assert.match(app, /fingerprint: autosaveFingerprint,/);
assert.match(app, /persistLocally: \(snapshot\) => writeLocalDraftMirror\(snapshot, step\),/);
ok('App drives every step through one debounced autosave hook');

// Both destinations, always.
assert.match(app, /writeDraftCache\(user\?\.id \?\? null, \{ \.\.\.snapshot, lastCompletedStep \}, currentStep\)/);
assert.match(app, /const saved = await persistOwnerBusinessSetup\(snapshot\);/);
assert.ok(!/if \(isSupabaseConfigured\) return;[\s\S]{0,80}setSaveStatus\('saving'\)/.test(app),
  'the autosave must not bail out before writing in configured mode');
ok('each autosave writes the LocalStorage fallback AND calls the backend');

// Every step change is captured, not just content edits.
assert.match(app, /const autosaveFingerprint = useCallback\(/);
assert.match(app, /lastCompletedStep: snapshot\.lastCompletedStep \?\? 0,/);
ok('step navigation (lastCompletedStep) participates in the autosave signature');

// Honest status indicator.
assert.match(app, /if \(autosave\.status === 'idle'\) return;/);
assert.match(app, /setSaveStatus\(autosave\.status === 'saved' \? 'saved' : autosave\.status === 'saving' \? 'saving' : 'error'\)/);
assert.match(topBar, /Saving\.\.\./);
assert.match(topBar, /Saved ✓/);
assert.match(topBar, /Save failed/);
ok('the header renders "Saving…", "Saved ✓" and a real failure state');

// Failure handling: retry + one toast per streak.
assert.match(hook, /withRetry\(/);
assert.match(hook, /retryAttempts/);
assert.match(hook, /if \(!failureStreak\.current\) \{/);
assert.match(app, /Check your connection — retrying automatically/);
ok('failed saves retry automatically and toast once per failure streak');

// Debounce primitives.
assert.match(debounce, /export function useDebounce<T>\(/);
assert.match(debounce, /export function useDebouncedCallback<Args extends unknown\[\]>\(/);
assert.match(debounce, /flush: \(\) => void;/);
assert.match(debounce, /cancel: \(\) => void;/);
ok('the debounce hook exposes flush/cancel so a pending save is never stranded');

// Refresh / navigation safety net.
assert.match(app, /window\.addEventListener\('pagehide', flush\)/);
assert.match(app, /autosave\.flushLocal\(\)/);
assert.match(app, /readDraftCache\(user\.id\)/);
assert.match(app, /if \(cache && !hasDraftContent\(draftConfig\) && hasDraftContent\(cache\.draft\)\)/);
ok('a refresh flushes the pending save and can restore an empty server draft');

/* ------------------------------------------------------------------ */
/* 5. Unified serialization is the single source of truth              */
/* ------------------------------------------------------------------ */

assert.match(website, /import \{ unifiedDraftFromSalonData \} from '\.\/unifiedSalonDraft';/);
assert.match(website, /const unified = unifiedDraftFromSalonData\(data\);/);
assert.match(website, /return \{\s*\n\s*\.\.\.unified,/);
ok('websiteConfigFromSalonData is built on the unified draft (no second field list)');

/* ------------------------------------------------------------------ */
/* 6. Complete "Save & Publish"                                        */
/* ------------------------------------------------------------------ */

assert.match(saveAndPublish, /export async function saveAndPublishOwnerWebsite\(/);
assert.match(saveAndPublish, /const committed = await persistOwnerBusinessSetup\(data\);/);
assert.match(saveAndPublish, /if \('error' in committed\) \{\s*\n\s*throw new Error\(committed\.error\);/);
assert.match(saveAndPublish, /const published = await publishOwnerSalonWebsite\(data\);/);
assert.match(saveAndPublish, /draftCommitted,/);
ok('Save & Publish commits the full draft first and aborts if it fails');

assert.match(saveAndPublish, /export function assertPublishPayloadComplete\(/);
assert.match(saveAndPublish, /if \(!draftFingerprint\(data\)\)/);
ok('publishing an empty shell (hydration race) is blocked');

const setup = await read('src/screens/StepPublishSetup.tsx');
assert.match(setup, /saveAndPublishOwnerWebsite\(\{ \.\.\.data, websiteSlug: slug \}\)/);
assert.match(setup, /assertPublishPayloadComplete\(\{ \.\.\.data, websiteSlug: slug \}\);/);
ok('the publish screen uses the complete Save & Publish path');

console.log(`\nAutosave + draft persistence: ${passed}/${passed} checks PASS`);
