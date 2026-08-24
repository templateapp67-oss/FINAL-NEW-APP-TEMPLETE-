import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const app = await read('src/App.tsx');
const persist = await read('src/lib/ownerWorkspacePersistence.ts');
const auth = await read('src/lib/useAuth.ts');
const session = await read('src/lib/ownerSession.ts');
const website = await read('src/lib/salonWebsiteService.ts');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

assert.match(persist, /Authoritative business\/template state lives in Supabase/);
assert.match(persist, /clearOwnerBrowserWorkspaceCache/);
assert.match(persist, /never be read back/);
ok('workspace persistence module documents backend authority');

assert.match(app, /if \(isSupabaseConfigured\) return 0/);
assert.match(app, /if \(isSupabaseConfigured\) return emptyOwnerSalonData/);
assert.match(app, /if \(isSupabaseConfigured\) return 'wizard'/);
assert.match(app, /didResumeFromBackend/);
assert.match(app, /setStep\(resumeWizardStep\(hydrated\.lastCompletedStep\)\)/);
ok('configured refresh does not restore step/data from localStorage');

assert.match(app, /loadOwnerWebsiteDraft/);
assert.match(app, /mergeSalonRowIntoDraft/);
assert.match(app, /persistOwnerBusinessSetup\(latestData\.current\)/);
assert.match(app, /addEventListener\('pagehide'/);
assert.match(app, /addEventListener\('beforeunload'/);
assert.match(website, /lastCompletedStep: data\.lastCompletedStep/);
ok('partial setup is written to and rehydrated from salon_public_websites');

assert.match(auth, /await supabase\.auth\.signOut/);
assert.match(auth, /clearOwnerBrowserWorkspaceCache/);
assert.match(app, /clearOwnerBrowserWorkspaceCache\(\)/);
assert.match(app, /setData\(emptyOwnerSalonData\(\)\)/);
assert.match(session, /resumeWizardStep/);
ok('logout clears the browser cache; login resumes from the saved backend step');

console.log(`\nOwner refresh/login persistence: ${passed}/${passed} checks PASS`);
