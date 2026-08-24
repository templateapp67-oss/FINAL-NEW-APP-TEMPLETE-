import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OWNER_FLOW_SEQUENCE,
  STEP_CUSTOMIZE,
  STEP_CONTENT_REVIEW,
  STEP_PREVIEW,
  STEP_PUBLISH,
  STEP_PUBLISH_SUCCESS,
  STEP_TEMPLATE,
  TOTAL_OWNER_STEPS,
} from '../src/lib/ownerFlow.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const hero = await read('src/screens/HeroSplit.tsx');
const template = await read('src/screens/StepTemplate.tsx');
const customize = await read('src/screens/StepPublish.tsx');
const review = await read('src/screens/StepAIContentReview.tsx');
const preview = await read('src/screens/StepFullWebsitePreview.tsx');
const publish = await read('src/screens/StepPublishSetup.tsx');
const success = await read('src/screens/StepPublishSuccess.tsx');
const service = await read('src/lib/salonWebsiteService.ts');
const readiness = await read('src/lib/publishReadiness.ts');
const session = await read('src/lib/ownerSession.ts');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

assert.match(hero, /if \(!user\)\s*\{\s*openAuth\('login'\)/s);
assert.match(hero, /user \? 'Complete Business Setup' : 'Log In to Continue'/);
ok('login is mandatory before owner setup continues');

// Canonical stage order: Login → Business Setup → Choose Template →
// Customize → Preview → Publish.
assert.deepEqual(OWNER_FLOW_SEQUENCE, [
  'login',
  'business-setup',
  'template',
  'customize',
  'preview',
  'publish',
  'success',
]);
assert.ok(
  STEP_TEMPLATE > 0 &&
  STEP_TEMPLATE < STEP_CUSTOMIZE &&
  STEP_CUSTOMIZE < STEP_CONTENT_REVIEW &&
  STEP_CONTENT_REVIEW < STEP_PREVIEW &&
  STEP_PREVIEW < STEP_PUBLISH &&
  STEP_PUBLISH < STEP_PUBLISH_SUCCESS &&
  STEP_PUBLISH_SUCCESS === TOTAL_OWNER_STEPS - 1,
  'template must come before customize/preview/publish',
);
ok('canonical owner-flow stages are ordered Login → Setup → Template → Customize → Preview → Publish');

const expectedOrder = [
  ['StepDetails', 1],
  ['StepServices', 2],
  ['StepTeam', 3],
  ['StepPhotos', 4],
  ['StepSocials', 5],
  ['StepLocation', 6],
  ['StepContactBooking', 7],
  // Choose Template is step 8 — BEFORE any customization/preview/publish screen.
  ['StepTemplate', 8],
  ['StepPublish', 9],
  ['StepAIContentReview', 10],
  ['StepFullWebsitePreview', 11],
  ['StepPublishSetup', 12],
];
for (const [component, step] of expectedOrder) {
  assert.match(app, new RegExp(`step === ${step}[\\s\\S]{0,200}<${component}`));
}
ok('wizard renders Business Setup → Choose Template → Customize → Preview → Publish in order');

assert.match(template, /STEP \{STEP_TEMPLATE \+ 1\} • WEBSITE TEMPLATE/);
assert.match(template, /Continue to Customize/);
assert.match(customize, /Step \{STEP_CUSTOMIZE \+ 1\} • Customize/);
assert.match(review, /STEP \{STEP_CONTENT_REVIEW \+ 1\} • AI CONTENT REVIEW/);
assert.match(preview, /Step \{STEP_PREVIEW \+ 1\} of \{TOTAL_OWNER_STEPS\}/);
assert.match(publish, /STEP \{STEP_PUBLISH \+ 1\} OF \{TOTAL_OWNER_STEPS\} • PUBLISH/);
assert.match(success, /Step \{STEP_PUBLISH_SUCCESS \+ 1\} of \{TOTAL_OWNER_STEPS\}/);
ok('every wizard screen advertises its canonical flow position');

assert.match(app, /isSupabaseConfigured && \(authLoading \|\| !user\)/);
assert.match(app, /stale localStorage from bypassing the Login stage/);
ok('cached steps and navigator cannot bypass configured authentication');

assert.match(app, /hasAuthoritativePublishState/);
assert.match(app, /Marketing dashboard \(screens 18–25\) still requires a published site/);
assert.match(app, /Publish later to unlock the public-site dashboard/);
assert.doesNotMatch(app, /data=\{\{[\s\S]{0,200}publishState: 'published'/);
ok('dashboard access is not manufactured from local draft state');

// The Publish action must await the persisted RPC result AND only then move on.
const rpcCall = publish.indexOf('await publishOwnerSalonWebsite');
const dbCheck = publish.indexOf("if (!saved.isPublished || !saved.publishedAt)");
const advance = publish.indexOf('onNext();');
assert.ok(rpcCall !== -1 && dbCheck !== -1 && advance !== -1, 'publish handler is wired');
assert.ok(rpcCall < dbCheck && dbCheck < advance, 'onNext must run only after DB-confirmed publish');
assert.match(publish, /publishState: 'publishing'/);
assert.match(publish, /publishState: 'published'/);
assert.match(publish, /publishedUrl,/);
ok('publish UI waits for a database-confirmed published row before advancing');

assert.match(service, /\.rpc\(PUBLISH_OWNER_WEBSITE_FN/);
assert.match(service, /PUBLISH_OWNER_WEBSITE_FN = 'publish_owner_salon_website'/);
assert.match(service, /isPublished: saved\.is_published === true/);
assert.match(service, /Fail closed before the existing Phase 1-A RPC/);
ok('publishing is persisted through the authenticated Supabase RPC');

assert.match(readiness, />= STEP_CONTENT_REVIEW/);
assert.match(readiness, /Complete these items before publishing:/);
assert.match(session, /STEP_PUBLISH/);
ok('publish readiness and session resume follow the canonical flow order');

assert.match(app, /data\.publishState === 'published' && data\.publishedUrl/);
assert.match(app, /Direct navigation\/resumed local state can never manufacture a[\s\S]*success screen/);
ok('success screen is gated by confirmed persisted state');

assert.doesNotMatch(success, /suggestedWebsiteSlug|publicWebsiteUrl\(/);
assert.match(success, /Never synthesize a success URL from draft data/);
ok('success screen has no generated draft URL fallback');

assert.match(app, /publishedUrl: draft\?\.isPublished && draft\.slug/);
assert.match(app, /publishState: draft\?\.isPublished \? 'published' : 'draft'/);
ok('refresh hydrates publish status and URL from Supabase');

assert.match(publish, /setPublishError\(message\)/);
assert.match(publish, /publishState: previousState === 'published' \? 'published' : 'draft'/);
ok('failed publishing stays on the publish screen with a real error');

console.log(`\nOwner setup → publish flow: ${passed}/${passed} checks PASS`);
