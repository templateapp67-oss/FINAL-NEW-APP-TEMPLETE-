import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DATABASE_CATALOG_THEME_IDS,
  fetchThemeServiceCatalog,
  isDatabaseCatalogTheme,
} from '../src/lib/themeCatalogService.ts';

const expectedThemeIds = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

const makePayload = (themeId) => ({
  theme: {
    id: `db-${themeId}`,
    theme_id: themeId,
    name: `Theme ${themeId}`,
    description: 'Theme description',
    target_audience: 'Theme audience',
    ui_config: { tokens: { id: themeId } },
    sort_order: 0,
  },
  categories: [
    { id: `cat-${themeId}`, theme_id: `db-${themeId}`, name: 'Category A', sort_order: 0 },
  ],
  predefined_services: [
    {
      id: `service-${themeId}`,
      theme_id: `db-${themeId}`,
      category_id: `cat-${themeId}`,
      name: 'Canonical Service',
      description: 'Database description',
      sort_order: 0,
      is_suggested: true,
      suggested_label: 'Suggested Label',
      suggested_sort_order: 0,
      default_price_paise: 125000,
      default_duration_minutes: 60,
    },
  ],
  suggested_services: [
    {
      id: `service-${themeId}`,
      theme_id: `db-${themeId}`,
      category_id: `cat-${themeId}`,
      name: 'Canonical Service',
      description: 'Database description',
      sort_order: 0,
      is_suggested: true,
      suggested_label: 'Suggested Label',
      suggested_sort_order: 0,
      default_price_paise: 125000,
      default_duration_minutes: 60,
    },
  ],
});

let passed = 0;
const test = async (name, run) => {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
};

await test('exactly the five seeded themes use the database catalog', async () => {
  assert.deepEqual([...DATABASE_CATALOG_THEME_IDS], expectedThemeIds);
  expectedThemeIds.forEach((themeId) => assert.equal(isDatabaseCatalogTheme(themeId), true));
  assert.equal(isDatabaseCatalogTheme('hair'), false);
});

await test('every request uses the one theme-filtered RPC argument', async () => {
  for (const themeId of expectedThemeIds) {
    const calls = [];
    const client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: makePayload(themeId), error: null };
      },
    };
    const catalog = await fetchThemeServiceCatalog(client, themeId);
    assert.deepEqual(calls, [{
      name: 'get_theme_service_catalog',
      args: { p_theme_id: themeId },
    }]);
    assert.equal(catalog.theme.themeId, themeId);
    assert.deepEqual(catalog.categories.map((category) => category.name), ['Category A']);
    assert.deepEqual(catalog.predefinedServices.map((service) => service.name), ['Canonical Service']);
    assert.deepEqual(catalog.suggestedServices.map((service) => service.suggestedLabel), ['Suggested Label']);
    assert.equal(catalog.predefinedServices[0].description, 'Database description');
    assert.equal(catalog.predefinedServices[0].price, 1250);
    assert.equal(catalog.predefinedServices[0].duration, 60);
  }
});

await test('mismatched theme/category payloads are rejected instead of hidden in the UI', async () => {
  const wrongTheme = makePayload('barber_mens_grooming');
  wrongTheme.theme.theme_id = 'hair_studio_color_bar';
  await assert.rejects(
    () => fetchThemeServiceCatalog({
      rpc: async () => ({ data: wrongTheme, error: null }),
    }, 'barber_mens_grooming'),
    /different theme catalog/i,
  );

  const wrongCategory = makePayload('barber_mens_grooming');
  wrongCategory.predefined_services[0].category_id = 'cross-theme-category';
  await assert.rejects(
    () => fetchThemeServiceCatalog({
      rpc: async () => ({ data: wrongCategory, error: null }),
    }, 'barber_mens_grooming'),
    /cross-theme service data/i,
  );
});

await test('Step Services clears and identity-guards catalog responses on theme changes', async () => {
  const source = await readFile('src/screens/StepServices.tsx', 'utf8');
  const dataService = await readFile('src/lib/themeCatalogService.ts', 'utf8');
  assert.ok(source.includes('setLoadedCatalog(null)'));
  assert.ok(source.includes('loadedCatalog?.theme.themeId === theme'));
  assert.ok(source.includes('catalogRequestRef.current !== requestId'));
  assert.ok(source.includes('activeCatalog?.categories'));
  assert.ok(source.includes('activeCatalog?.suggestedServices'));
  assert.ok(source.includes('activeCatalog?.predefinedServices'));
  assert.ok(dataService.includes("client.rpc('get_theme_service_catalog'"));
  assert.ok(dataService.includes('p_theme_id: themeId'));
  assert.equal(dataService.includes(".from('themes')"), false);
  assert.equal(dataService.includes(".from('service_categories')"), false);
  assert.equal(dataService.includes(".from('predefined_services')"), false);
});

console.log(`Theme catalog UI tests: ${passed}/4 passed`);
