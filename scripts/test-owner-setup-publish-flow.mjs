import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const hero = await read('src/screens/HeroSplit.tsx');
const publish = await read('src/screens/StepPublishSetup.tsx');
const success = await read('src/screens/StepPublishSuccess.tsx');
const service = await read('src/lib/salonWebsiteService.ts');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

assert.match(hero, /if \(!user\)\s*\{\s*openAuth\('login'\)/s);
assert.match(hero, /user \? 'Complete Business Setup' : 'Log In to Continue'/);
ok('login is mandatory before owner setup continues');

const expectedOrder = [
  ['StepDetails', 1],
  ['StepServices', 2],
  ['StepTeam', 3],
  ['StepPhotos', 4],
  ['StepSocials', 5],
  ['StepLocation', 6],
  ['StepContactBooking', 7],
  ['StepPublish', 8],
  ['StepAIContentReview', 9],
  ['StepTemplate', 10],
  ['StepFullWebsitePreview', 11],
  ['StepPublishSetup', 12],
];
for (const [component, step] of expectedOrder) {
  assert.match(app, new RegExp(`step === ${step}[\\s\\S]{0,160}<${component}`));
}
ok('business setup precedes template selection and preview');

assert.match(app, /isSupabaseConfigured && \(authLoading \|\| !user\)/);
assert.match(app, /stale localStorage from bypassing the Login stage/);
ok('cached steps and navigator cannot bypass configured authentication');

assert.match(app, /hasAuthoritativePublishState/);
assert.match(app, /Publish your website successfully before opening the dashboard/);
assert.doesNotMatch(app, /data=\{\{[\s\S]{0,200}publishState: 'published'/);
ok('dashboard access is not manufactured from local draft state');

assert.match(publish, /await publishOwnerSalonWebsite/);
assert.match(publish, /if \(!saved\.isPublished \|\| !saved\.publishedAt\)/);
assert.match(publish, /publishState: 'published'/);
ok('publish UI waits for a database-confirmed published row');

assert.match(service, /\.rpc\(PUBLISH_OWNER_WEBSITE_FN/);
assert.match(service, /PUBLISH_OWNER_WEBSITE_FN = 'publish_owner_salon_website'/);
assert.match(service, /isPublished: saved\.is_published === true/);
ok('publishing is persisted through the authenticated Supabase RPC');

assert.match(app, /data\.publishState === 'published' && data\.publishedUrl/);
assert.match(app, /Direct navigation\/resumed local state can never manufacture a[\s\S]*success screen/);
ok('success screen is gated by confirmed persisted state');

assert.doesNotMatch(success, /suggestedWebsiteSlug|publicWebsiteUrl\(/);
assert.match(success, /Never synthesize a success URL from draft data/);
ok('success screen has no generated draft URL fallback');

assert.match(app, /publishedUrl: draft\.isPublished && draft\.slug/);
assert.match(app, /publishState: draft\.isPublished \? 'published' : 'draft'/);
ok('refresh hydrates publish status and URL from Supabase');

assert.match(publish, /setPublishError\(message\)/);
assert.match(publish, /publishState: previousState === 'published' \? 'published' : 'draft'/);
ok('failed publishing stays on the publish screen with a real error');

console.log(`\nOwner setup → publish flow: ${passed}/${passed} checks PASS`);
