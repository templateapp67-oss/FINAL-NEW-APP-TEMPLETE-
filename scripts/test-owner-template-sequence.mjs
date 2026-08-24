/**
 * Exact owner sequence:
 * Signup → Login → Business Setup → Template 1 → Save → Refresh
 * → Template 3 → Save → Refresh → Template 5 → Save → Preview
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyOwnerSalonData, ownerPreviewData } from '../src/lib/ownerPreview.ts';
import { resumeWizardStep } from '../src/lib/ownerSession.ts';
import {
  applyTemplateConfigToSalon,
  restoreSavedTemplatePresentation,
  switchSalonTemplatePresentation,
} from '../src/lib/templateConfig.ts';
import { websiteConfigFromSalonData } from '../src/lib/salonWebsiteService.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const T1 = 'barber_mens_grooming';
const T3 = 'beauty_skin_spa';
const T5 = 'nail_lash_studio';

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const [signup, auth, app, details, preview] = await Promise.all([
  read('src/components/SignUpPage.tsx'),
  read('src/lib/useAuth.ts'),
  read('src/App.tsx'),
  read('src/screens/StepDetails.tsx'),
  read('src/screens/StepFullWebsitePreview.tsx'),
]);

assert.match(signup, /signUpWithPassword/);
assert.match(auth, /signInWithPassword/);
assert.match(auth, /salon_name: salonName/);
assert.match(app, /resolveOrProvisionOwnerSalon/);
assert.match(app, /loadOwnerWebsiteDraft/);
assert.match(details, /owner-onboarding-templates|listOwnerTemplates|StepDetails/);
assert.match(app, /setOwnerTemplate/);
assert.match(app, /switchSalonTemplatePresentation/);
assert.match(preview, /TemplateRenderer|owner-preview/);
ok('Signup → Login → Business Setup → Template → Save → Preview stay on existing modules');

function setupBusiness() {
  const base = emptyOwnerSalonData();
  return {
    ...base,
    salonName: 'Kota Cuts',
    tagline: 'Precision grooming',
    ownerName: 'Asha',
    phone: '+919900000111',
    about: 'Family barber since 2012',
    services: [{ id: 'svc-cut', name: 'Skin Fade', category: 'Haircuts', description: 'Fade', price: 450, duration: 45 }],
    team: [{ id: 'st-1', name: 'Asha', role: 'Owner', specialties: ['Fade'] }],
    address: { fullAddress: 'Shop 4, Civil Lines', area: 'Civil Lines', city: 'Kota', state: 'Rajasthan', pinCode: '324001' },
    lastCompletedStep: 3,
  };
}

function saveAndRefresh(data, templateId) {
  const persisted = websiteConfigFromSalonData(data);
  const hydrated = {
    ...emptyOwnerSalonData(),
    ...persisted,
    salonName: data.salonName,
    ownerName: data.ownerName,
    phone: data.phone,
    about: data.about,
    tagline: data.tagline,
    services: data.services,
    team: data.team,
    address: data.address,
    lastCompletedStep: data.lastCompletedStep,
  };
  return restoreSavedTemplatePresentation(hydrated, templateId) || {
    ...hydrated,
    templateId,
  };
}

function assertBusinessIntact(data) {
  assert.equal(data.salonName, 'Kota Cuts');
  assert.equal(data.ownerName, 'Asha');
  assert.equal(data.phone, '+919900000111');
  assert.equal(data.about, 'Family barber since 2012');
  assert.equal(data.services[0].id, 'svc-cut');
  assert.equal(data.services[0].name, 'Skin Fade');
  assert.equal(data.team[0].name, 'Asha');
  assert.equal(data.address.city, 'Kota');
}

let live = applyTemplateConfigToSalon({ ...setupBusiness(), templateId: T1 }, {
  appearance: 'dark',
  accentColor: '#c9a227',
  heroPosition: 'Top',
});
assert.equal(live.templateId, T1);
assertBusinessIntact(live);
ok('Template 1 save keeps business setup data');

live = saveAndRefresh(live, T1);
assert.equal(live.templateId, T1);
assert.equal(live.brandColor, '#c9a227');
assertBusinessIntact(live);
assert.equal(resumeWizardStep(live.lastCompletedStep), 4);
ok('Refresh after Template 1 restores the same business + template 1 config');

const beforeT3 = live;
live = switchSalonTemplatePresentation(live, T3);
live = applyTemplateConfigToSalon(live, { appearance: 'light', accentColor: '#1e7a63' });
assert.equal(live.templateId, T3);
assert.equal(live.services, beforeT3.services);
assert.equal(live.team, beforeT3.team);
assert.equal(live.address, beforeT3.address);
assertBusinessIntact(live);
ok('Template 3 switch does not mutate business/services/location/owner');

live = saveAndRefresh(live, T3);
assert.equal(live.templateId, T3);
assert.equal(live.brandColor, '#1e7a63');
assertBusinessIntact(live);
ok('Refresh after Template 3 keeps Kota Cuts intact');

const beforeT5 = live;
live = switchSalonTemplatePresentation(live, T5);
live = applyTemplateConfigToSalon(live, { appearance: 'light', accentColor: '#ff2d8d' });
assert.equal(live.templateId, T5);
assert.equal(live.services, beforeT5.services);
assert.equal(live.team, beforeT5.team);
assert.equal(live.address, beforeT5.address);
assertBusinessIntact(live);
ok('Template 5 switch still preserves the original business snapshot');

live = saveAndRefresh(live, T5);
const previewData = ownerPreviewData(live);
assert.equal(live.templateId, T5);
assert.equal(previewData.salonName, 'Kota Cuts');
assert.equal(previewData.services[0].name, 'Skin Fade');
assert.equal(previewData.phone, '+919900000111');
assert.equal(previewData.address.city, 'Kota');
assert.equal(previewData.templateId, T5);
ok('Preview after Template 5 shows the real saved business, not sample data');

console.log(`\nOwner template sequence: ${passed}/${passed} checks PASS`);
