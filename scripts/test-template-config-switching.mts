import assert from 'node:assert/strict';
import { initialData, type SalonData } from '../src/types.ts';
import { emptyOwnerSalonData } from '../src/lib/ownerPreview.ts';
import { websiteConfigFromSalonData } from '../src/lib/salonWebsiteService.ts';
import {
  applyTemplateConfigToSalon,
  normalizeTemplateConfigs,
  restoreSavedTemplatePresentation,
  switchSalonTemplatePresentation,
  templateSupportsConfig,
} from '../src/lib/templateConfig.ts';

let passed = 0;
function test(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`✓ PASS [${name}]`);
}

const source: SalonData = {
  ...initialData,
  templateId: 'barber_mens_grooming',
  services: [...initialData.services],
  packages: [...initialData.packages],
  team: [...initialData.team],
  gallery: [...(initialData.gallery || [])],
  address: initialData.address ? { ...initialData.address } : undefined,
};
const protectedReferences = {
  services: source.services,
  packages: source.packages,
  team: source.team,
  gallery: source.gallery,
  address: source.address,
};

const barberConfigured = applyTemplateConfigToSalon(source, {
  appearance: 'dark',
  accentColor: '#123456',
  heroPosition: 'Top',
  showOwnerPhoto: false,
});

test('capability matrix rejects settings unsupported by the active template', () => {
  assert.equal(templateSupportsConfig('barber_mens_grooming', 'heroPosition'), true);
  // Owner-photo parity: every one of the five templates renders the owner
  // photo, so every template carries the toggle.
  assert.equal(templateSupportsConfig('barber_mens_grooming', 'showOwnerPhoto'), true);
  assert.equal(barberConfigured.templateConfigs?.barber_mens_grooming?.heroPosition, 'Top');
  assert.equal(barberConfigured.templateConfigs?.barber_mens_grooming?.showOwnerPhoto, false);
});

const beauty = switchSalonTemplatePresentation(barberConfigured, 'beauty_skin_spa');
const beautyConfigured = applyTemplateConfigToSalon(beauty, { showOwnerPhoto: false });

test('a first visit copies only settings supported by both source and target', () => {
  assert.equal(beauty.templateId, 'beauty_skin_spa');
  assert.equal(beauty.websiteAppearance, 'dark');
  assert.equal(beauty.brandColor, '#123456');
  assert.equal(beauty.heroPosition, undefined);
  assert.equal('heroPosition' in (beauty.templateConfigs?.beauty_skin_spa || {}), false);
  // showOwnerPhoto is now supported by both templates, so the owner's
  // explicit opt-out travels with the presentation copy.
  assert.equal(beauty.templateConfig?.showOwnerPhoto, false);
});

const withUnsafeStoredConfig: SalonData = {
  ...beautyConfigured,
  templateConfigs: {
    ...beautyConfigured.templateConfigs,
    nail_lash_studio: {
      appearance: 'dark',
      heroPosition: 'Bottom',
      showOwnerPhoto: false,
      galleryLayout: 'masonry',
    } as never,
  },
};
const nail = switchSalonTemplatePresentation(withUnsafeStoredConfig, 'nail_lash_studio');
const nailAfterUnsupportedEdit = applyTemplateConfigToSalon(nail, {
  heroPosition: 'Top',
  showOwnerPhoto: false,
});

test('unsafe saved keys and target-incompatible settings are stripped fail-closed', () => {
  const nailConfig = nailAfterUnsupportedEdit.templateConfigs?.nail_lash_studio || {};
  assert.equal(nail.websiteAppearance, 'dark');
  assert.equal('galleryLayout' in nailConfig, false);
  assert.equal('heroPosition' in nailConfig, false);
  assert.equal(nailConfig.showOwnerPhoto, false);
  assert.equal(nailAfterUnsupportedEdit.heroPosition, undefined);
});

const barberRestored = switchSalonTemplatePresentation(nailAfterUnsupportedEdit, 'barber_mens_grooming');
const beautyRestored = switchSalonTemplatePresentation(barberRestored, 'beauty_skin_spa');

test('each previously visited template restores its separate sanitized config', () => {
  assert.equal(barberRestored.templateConfig?.heroPosition, 'Top');
  assert.equal(barberRestored.heroPosition, 'Top');
  assert.equal(beautyRestored.templateConfig?.showOwnerPhoto, false);
  assert.equal(beautyRestored.heroPosition, undefined);
});

test('switching preserves protected business/content references through the full sequence', () => {
  for (const switched of [barberConfigured, beauty, beautyConfigured, nail, nailAfterUnsupportedEdit, barberRestored, beautyRestored]) {
    assert.equal(switched.services, protectedReferences.services);
    assert.equal(switched.packages, protectedReferences.packages);
    assert.equal(switched.team, protectedReferences.team);
    assert.equal(switched.gallery, protectedReferences.gallery);
    assert.equal(switched.address, protectedReferences.address);
  }
});

test('hydration restores the authoritative template map instead of stale top-level aliases', () => {
  const staleTopLevel: SalonData = {
    ...beautyRestored,
    templateId: 'nail_lash_studio',
    templateConfig: { appearance: 'light', accentColor: '#abcdef' },
    websiteAppearance: 'light',
    brandColor: '#abcdef',
  };
  const restored = restoreSavedTemplatePresentation(staleTopLevel, 'beauty_skin_spa');
  assert.ok(restored);
  assert.equal(restored.templateId, 'beauty_skin_spa');
  assert.equal(restored.templateConfig?.showOwnerPhoto, false);
  assert.equal(restored.websiteAppearance, 'dark');
  assert.equal(restored.brandColor, '#123456');
});

test('normalizing the JSONB map permits only five known templates and known supported keys', () => {
  const normalized = normalizeTemplateConfigs({
    unknown_template: { appearance: 'dark' },
    barber_mens_grooming: { appearance: 'dark', heroPosition: 'Top', gallery: { columns: 4 } },
    nail_lash_studio: { appearance: 'light', heroPosition: 'Bottom', showOwnerPhoto: false },
  });
  assert.deepEqual(Object.keys(normalized).sort(), ['barber_mens_grooming', 'nail_lash_studio']);
  assert.deepEqual(normalized.barber_mens_grooming, { appearance: 'dark', heroPosition: 'Top' });
  assert.deepEqual(normalized.nail_lash_studio, { appearance: 'light', showOwnerPhoto: false });
});

test('a new owner cannot inherit or persist demonstration contact and deposit policy', () => {
  const owner = emptyOwnerSalonData();
  assert.equal(owner.contactOptions, undefined);
  assert.equal(owner.bookingRules, undefined);

  const persisted = websiteConfigFromSalonData(owner);
  assert.equal(Object.hasOwn(persisted, 'contactOptions'), false);
  assert.equal(Object.hasOwn(persisted, 'bookingRules'), false);
  const serialized = JSON.stringify(persisted);
  assert.equal(serialized.includes('advanceDepositPercentage'), false);
  assert.equal(serialized.includes('"advanceDepositPercentage":25'), false);
});

console.log(`Template config switching tests: ${passed}/8 passed`);
