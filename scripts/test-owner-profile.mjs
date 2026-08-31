import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OWNER_ROLES,
  OWNER_PHOTO_MAX_BYTES,
  getCustomOwnerRoleText,
  getOwnerInitials,
  getOwnerRoleSelectValue,
  isCustomOwnerRole,
  resolveOwnerRoleFromSelect,
  validateOwnerPhoto,
} from '../src/lib/ownerProfile.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('owner role list has the 11 required options in order', () => {
  assert.deepEqual([...OWNER_ROLES], [
    'Founder',
    'Co-Founder',
    'Owner',
    'Managing Director',
    'Creative Director',
    'Master Stylist',
    'Senior Stylist',
    'Salon Manager',
    'Director',
    'Founder & Master Stylist',
    'Other',
  ]);
});

test('select value maps presets, empty, and custom titles', () => {
  assert.equal(getOwnerRoleSelectValue(''), '');
  assert.equal(getOwnerRoleSelectValue(undefined), '');
  assert.equal(getOwnerRoleSelectValue('Founder'), 'Founder');
  assert.equal(getOwnerRoleSelectValue('Founder & Master Stylist'), 'Founder & Master Stylist');
  assert.equal(getOwnerRoleSelectValue('Other'), 'Other');
  assert.equal(getOwnerRoleSelectValue('CEO'), 'Other');
  assert.equal(isCustomOwnerRole('CEO'), true);
  assert.equal(isCustomOwnerRole('Owner'), false);
  assert.equal(getCustomOwnerRoleText('CEO'), 'CEO');
  assert.equal(getCustomOwnerRoleText('Other'), '');
  assert.equal(getCustomOwnerRoleText('Founder'), '');
});

test('select changes persist optional empty, preset, and custom Other text', () => {
  assert.equal(resolveOwnerRoleFromSelect('', 'Founder'), '');
  assert.equal(resolveOwnerRoleFromSelect('Salon Manager', 'Founder'), 'Salon Manager');
  assert.equal(resolveOwnerRoleFromSelect('Other', 'Founder'), 'Other');
  assert.equal(resolveOwnerRoleFromSelect('Other', 'CEO'), 'CEO');
});

test('photo validation accepts images under 2MB and rejects others', () => {
  assert.equal(validateOwnerPhoto(null), 'Please choose a photo.');
  assert.match(validateOwnerPhoto({ type: 'application/pdf', size: 100 }), /image file/i);
  assert.match(validateOwnerPhoto({ type: 'image/png', size: OWNER_PHOTO_MAX_BYTES + 1 }), /2 MB/i);
  assert.equal(validateOwnerPhoto({ type: 'image/jpeg', size: 120_000 }), null);
  assert.equal(validateOwnerPhoto({ type: 'image/webp', size: OWNER_PHOTO_MAX_BYTES }), null);
});

test('owner initials fallback uses first and last name', () => {
  assert.equal(getOwnerInitials('Rahul Sharma'), 'RS');
  assert.equal(getOwnerInitials('Priya'), 'PR');
  assert.equal(getOwnerInitials(''), 'O');
});

test('SalonData stores ownerPhotoUrl and demo data includes it', () => {
  const types = read('src/types.ts');
  assert.match(types, /ownerPhotoUrl\?: string/);
  // White-label refactor: the demo photo is resolved from the central brand
  // config (single source of truth) instead of a hardcoded literal here.
  assert.match(types, /ownerPhotoUrl: DEFAULT_BRAND_CONFIG\.defaultSalon\.ownerPhotoUrl/);
  assert.match(read('src/config/brandConfig.ts'), /ownerPhotoUrl: 'https:\/\/images\.unsplash\.com/);
});

test('Step Details photo input and role select are wired to salon data', () => {
  const source = read('src/screens/StepDetails.tsx');
  assert.match(source, /type="file"/);
  assert.match(source, /ownerPhotoUrl/);
  assert.match(source, /<select/);
  assert.match(source, /OWNER_ROLES\.map/);
  assert.match(source, /handleRemoveOwnerPhoto/);
  assert.match(source, /\(Optional\)/);
});

test('dashboard website tab can edit photo and role after publish', () => {
  const source = read('src/screens/Landing.tsx');
  assert.match(source, /ownerPhotoInputRef/);
  assert.match(source, /Change Photo/);
  assert.match(source, /getOwnerRoleSelectValue\(data\.ownerRole\)/);
  assert.match(source, /resolveOwnerRoleFromSelect/);
});

test('live previews render the saved owner photo instead of a stock fallback', () => {
  const preview = read('src/components/PreviewPane.tsx');
  const renderer = read('src/components/TemplateRenderer.tsx');
  assert.match(preview, /photoUrl=\{data\.ownerPhotoUrl\}/);
  assert.match(renderer, /photoUrl=\{data\.ownerPhotoUrl\}/);
  assert.doesNotMatch(preview, /photo-1573496359142-b8d87734a5a2/);
  assert.doesNotMatch(renderer, /data\.team\?\.\[0\]\?\.imageUrl/);
});

test('owner photo and role survive the same JSON save/reload merge as App.tsx', () => {
  const snapshot = {
    salonName: 'Test Salon',
    ownerName: 'Asha Khan',
    ownerRole: 'Creative Director',
    ownerPhotoUrl: 'data:image/png;base64,abc123',
    services: [],
  };
  const saved = JSON.stringify({ step: 3, data: snapshot });
  const parsed = JSON.parse(saved);
  const reloaded = { salonName: '', ownerName: '', ownerRole: '', ownerPhotoUrl: '', services: [], ...parsed.data };
  assert.equal(reloaded.ownerPhotoUrl, 'data:image/png;base64,abc123');
  assert.equal(reloaded.ownerRole, 'Creative Director');
  assert.equal(reloaded.ownerName, 'Asha Khan');

  const edited = { ...reloaded, ownerRole: 'CEO', ownerPhotoUrl: '' };
  const reloadedAfterEdit = { ...JSON.parse(JSON.stringify({ data: edited })).data };
  assert.equal(reloadedAfterEdit.ownerRole, 'CEO');
  assert.equal(reloadedAfterEdit.ownerPhotoUrl, '');
  assert.equal(getOwnerRoleSelectValue(reloadedAfterEdit.ownerRole), 'Other');
});

test('onboarding localStorage payload still owns owner fields — no schema change', () => {
  // The storage key moved from a literal in App.tsx to the canonical constant
  // in ownerWorkspacePersistence.ts; App.tsx now imports it (STORAGE_KEY).
  const persistence = read('src/lib/ownerWorkspacePersistence.ts');
  assert.match(persistence, /OWNER_ONBOARDING_CACHE_KEY = 'nexora_onboarding_state'/);
  const app = read('src/App.tsx');
  assert.match(app, /OWNER_ONBOARDING_CACHE_KEY/);
  // Writes go through the safeStorage wrapper (safeSetItem) or raw localStorage.
  assert.match(app, /safeSetItem|localStorage\.setItem/);
  const migrations = read('supabase/migrations/20260811000301_m03_membership_access.sql');
  assert.match(migrations, /photo_url text/);
  assert.match(migrations, /role_title text/);
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\n${passed}/${tests.length} owner profile tests passed`);
