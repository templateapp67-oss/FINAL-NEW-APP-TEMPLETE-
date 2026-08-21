/** Phase 9.2: localization, search, filters, and theme-scoped media. */
import assert from 'node:assert/strict';
import { createHarness, createRunner, IDS, THEMES } from './lib/acceptance-harness.mjs';
import {
  HINDI_CATEGORY_NAMES,
  HINDI_SERVICE_COPY,
} from '../src/lib/catalogLocaleSeed.ts';
import { filterAndSortServices, serviceMatchesSearch } from '../src/lib/serviceSearch.ts';

const harness = await createHarness({ seedLegacyCustom: true });
const runner = createRunner('Phase 9.2 acceptance');
harness.signIn(IDS.ownerA);

const { fetchThemeServiceCatalog } = await import('../src/lib/themeCatalogService.ts');
const { supabase } = await import('../src/lib/supabaseClient.ts');
const { savePredefinedServices } = await import('../src/lib/savedServiceService.ts');
const {
  searchThemeServices,
  upsertSavedServiceMedia,
  upsertSavedServiceTranslation,
} = await import('../src/lib/serviceContentService.ts');

assert.ok(supabase);

runner.section('Client search/sort');
await runner.test('search matches translated names and sorts by price/duration', async () => {
  const services = [
    { id: '1', name: 'Skin Fade', description: 'Precision fade', price: 450, duration: 45, category: 'Haircuts', translations: [{ locale: 'hi', name: 'स्किन फ़ेड', description: 'फ़ेड' }] },
    { id: '2', name: 'Buzz Cut', description: 'Short clipper', price: 250, duration: 20, category: 'Haircuts', translations: [] },
    { id: '3', name: 'Head Shave', description: 'Smooth shave', price: 300, duration: 25, category: 'Haircuts', status: 'inactive', translations: [] },
  ];
  assert.equal(serviceMatchesSearch(services[0], 'स्किन', 'hi'), true);
  const priced = filterAndSortServices(services, {
    search: '', category: 'all', sort: 'price_asc', suggestedOnly: false, activeOnly: true,
  }, 'en');
  assert.deepEqual(priced.map((item) => item.id), ['2', '1']);
  const timed = filterAndSortServices(services, {
    search: '', category: 'all', sort: 'duration_desc', suggestedOnly: false, activeOnly: false,
  }, 'en');
  assert.equal(timed[0].id, '1');
});

for (const theme of THEMES) {
  runner.section(theme.label);
  await runner.test('Hindi catalog copy is stored separately and search stays in-theme', async () => {
    const catalog = await fetchThemeServiceCatalog(supabase, theme.id);
    assert.equal(catalog.theme.themeId, theme.id);
    const hindiCats = HINDI_CATEGORY_NAMES[theme.id];
    catalog.categories.forEach((category) => {
      const hi = category.translations?.find((item) => item.locale === 'hi');
      assert.ok(hi, `${category.name} missing Hindi`);
      assert.equal(hi.name, hindiCats[category.name]);
    });
    const sample = catalog.predefinedServices[0];
    const expected = HINDI_SERVICE_COPY[theme.id][sample.name];
    const hi = sample.translations?.find((item) => item.locale === 'hi');
    assert.ok(expected && hi);
    assert.equal(hi.name, expected.name);
    assert.equal(sample.name === hi.name, false);

    const saved = await savePredefinedServices(theme.id, [sample.id]);
    const service = saved.services[0];
    const before = await harness.admin(
      `select theme_id, category_id, predefined_service_id, name from public.services where id=$1`,
      [service.id],
    );

    await upsertSavedServiceTranslation(theme.id, service.id, 'hi', `${expected.name} सैलून`, 'मालिक अनुवाद');
    await upsertSavedServiceMedia(theme.id, service.id, 'image', `https://cdn.example/${theme.id}/${service.id}.jpg`);

    const after = await harness.admin(
      `select theme_id, category_id, predefined_service_id, name from public.services where id=$1`,
      [service.id],
    );
    assert.deepEqual(after.rows, before.rows, 'translation/media must not mutate the primary service');

    const hits = await searchThemeServices(theme.id, expected.name);
    assert.ok(hits.some((hit) => hit.translatedName === `${expected.name} सैलून` || hit.name === sample.name));
    hits.forEach((hit) => {
      assert.ok(hit.source === 'saved' || hit.source === 'predefined');
    });
  });
}

runner.section('Isolation');
await runner.test('media and translations cannot attach to another theme/tenant', async () => {
  const barber = THEMES[0];
  const nail = THEMES[4];
  const barberCatalog = await fetchThemeServiceCatalog(supabase, barber.id);
  const nailCatalog = await fetchThemeServiceCatalog(supabase, nail.id);
  const barberSaved = await savePredefinedServices(barber.id, [barberCatalog.predefinedServices[1].id]);
  const nailSaved = await savePredefinedServices(nail.id, [nailCatalog.predefinedServices[1].id]);

  await assert.rejects(
    () => upsertSavedServiceMedia(nail.id, barberSaved.services[0].id, 'banner', 'https://cdn.example/wrong.jpg'),
    /not found for your salon|does not belong|No active/i,
  );

  harness.signIn(IDS.ownerB);
  await assert.rejects(
    () => upsertSavedServiceTranslation(barber.id, barberSaved.services[0].id, 'hi', 'चोरी', ''),
    /not found for your salon/i,
  );
  harness.signIn(IDS.ownerA);

  const mediaCount = await harness.admin(
    `select count(*)::int c from public.saved_service_media m
     join public.services s on s.id=m.service_id
     where m.theme_id <> s.theme_id`,
  );
  assert.equal(mediaCount.rows[0].c, 0);
  assert.ok(nailSaved.services[0].id);
});

await runner.test('legacy custom service remains unlinked', async () => {
  const legacy = await harness.admin(
    `select theme_id, category_id, predefined_service_id from public.services where id=$1`,
    [IDS.legacyCustomA],
  );
  assert.deepEqual(legacy.rows[0], { theme_id: null, category_id: null, predefined_service_id: null });
});

const result = runner.summary();
await harness.close();
if (result.failed) process.exitCode = 1;
