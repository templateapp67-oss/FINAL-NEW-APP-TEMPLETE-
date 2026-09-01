import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Full-stack save-failure visibility — regression coverage for:
 *
 *   - The save indicator + toast now follow the REAL backend result: a failed
 *     write shows "Save failed" instead of the green "Saved ✓".
 *   - `saveOwnerWebsiteDraft` returns null (not a success-shaped fallback)
 *     when the draft did not reach the database, and
 *     `persistOwnerBusinessSetup` propagates that as `{ error }`.
 *   - The debounced autosave surfaces one failure toast per failure streak
 *     and retries automatically on the next edit.
 */
let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const app = await read('src/App.tsx');
const topBar = await read('src/components/TopBar.tsx');
const website = await read('src/lib/salonWebsiteService.ts');
const setup = await read('src/lib/ownerBusinessSetup.ts');

// --- 1. App.tsx: the save indicator has a real error state. ----------------
assert.match(app, /useState<'saved' \| 'saving' \| 'error'>\('saved'\)/);
ok('App saveStatus supports the error state');

// A failed backend write (returned { error }) must never flip to "saved".
assert.match(app, /if \('error' in saved\)/);
assert.ok(app.includes("setSaveStatus('error');"), 'autosave sets error state on { error } result');
assert.ok(app.includes("showToast('Could not save your changes. Check your connection and try again.', 'error');"));
ok('autosave failure surfaces a user-visible error toast, not "Saved"');

// One toast per failure streak (the debounced autosave keeps retrying).
assert.ok(app.includes('const saveFailureToastShown = useRef(false)'));
assert.ok(app.includes('saveFailureToastShown.current = true;'));
assert.ok(app.includes('saveFailureToastShown.current = false;'));
ok('autosave toasts once per failure streak and resets on success');

// handleSave drives the status from the actual persist promise.
assert.match(app, /const persistPromise = \(isSupabaseConfigured && user\)/);
assert.ok(app.includes('persistOwnerBusinessSetup(dataToSave)'));
assert.ok(app.includes("setSaveStatus('error');"), 'handleSave sets error state on failure');
assert.ok(app.includes('setSaveStatus(\'saved\');'), 'handleSave sets saved on success');
assert.ok(!app.includes("setTimeout(() => {\n      setSaveStatus('saved');"),
  'handleSave no longer fakes "saved" on a fixed timer');
ok('handleSave reports the real backend result');

// The unload flush logs failures instead of swallowing them.
assert.match(app, /void persistOwnerBusinessSetup\(latestData\.current\)\.catch/);
ok('pagehide/beforeunload flush logs failures');

// The toast icon reflects the failure kind.
assert.ok(app.includes("toastKind === 'error'"), 'toast render switches on error kind');
assert.ok(app.includes("const [toastKind, setToastKind] = useState<'success' | 'error'>('success')"));
ok('toast icon reflects success vs error');

// --- 1b. Storage authority (AC2): the tenant-scoped draft cache is a
// FALLBACK only. It is written on every change (so a failed/offline save,
// a refresh or a navigation cannot lose work) but it is never the refresh
// authority: it is read back only when the server draft is empty, and a
// confirmed backend save purges the legacy unscoped cache. --------------------
const storage = await read('src/lib/salonDraftStorage.ts');
const unified = await read('src/lib/unifiedSalonDraft.ts');
assert.ok(app.includes('writeDraftCache(user?.id ?? null'),
  'the autosave mirrors the draft to a TENANT-SCOPED localStorage cache');
assert.match(storage, /const DRAFT_CACHE_PREFIX = 'nexora_salon_draft_v1'/);
assert.ok(storage.includes("return `${DRAFT_CACHE_PREFIX}:${scope}`;"),
  'the cache key is scoped per signed-in owner (never shared between accounts)');
assert.match(storage, /if \(\(parsed\.userId \|\| 'anonymous'\) !== expected\) return null;/,
  'a cache written for another account can never be restored');
assert.ok(app.includes('if (isSupabaseConfigured) safeRemoveItem(STORAGE_KEY);'),
  'a confirmed backend save purges the stale unscoped draft cache');
// The fallback is only consumed when the server draft has no content.
assert.ok(app.includes('if (cache && !hasDraftContent(draftConfig) && hasDraftContent(cache.draft))'),
  'the local cache is restored ONLY when the backend draft is empty');
assert.ok(unified.includes('export const UNIFIED_DRAFT_FIELDS'),
  'one canonical field list owns what is persisted');
ok('local draft cache is a tenant-scoped fallback and never the refresh authority');

// --- 2. TopBar.tsx: visible failure indicator. -----------------------------
assert.match(topBar, /saveStatus\?: 'saved' \| 'saving' \| 'error'/);
assert.ok(topBar.includes("Save failed — check connection"));
assert.ok(topBar.includes('TriangleAlert'));
ok('TopBar renders a distinct "Save failed" state');

// --- 3. salonWebsiteService.ts: no success-shaped fallback on failure. -----
assert.match(website, /saveOwnerWebsiteDraft\(data: SalonData\): Promise<{/);
assert.ok(website.includes('} | null>'), 'saveOwnerWebsiteDraft contract is nullable');
assert.ok(!website.includes('// 3. Graceful fallback'),
  'the success-shaped "Graceful fallback" must be gone');
assert.match(website, /return null;[\s\S]*website draft was not persisted/);
ok('saveOwnerWebsiteDraft returns null when nothing was persisted');

// --- 4. ownerBusinessSetup.ts: failure propagates to the caller. -----------
assert.ok(setup.includes('if (!draft) {'), 'persistOwnerBusinessSetup checks for a null draft');
assert.ok(setup.includes("return { error: 'Unable to save your website details. Please try again.' };"));
ok('persistOwnerBusinessSetup returns { error } when the draft write failed');

console.log(`\nSave-feedback wiring: ${passed}/${passed} checks PASS`);
