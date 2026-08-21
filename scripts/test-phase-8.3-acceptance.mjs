/**
 * PHASE 8.3 — FINAL 5-THEME ACCEPTANCE TEST (data + integration layer)
 *
 * Runs the complete service workflow for every theme against REAL PostgreSQL
 * (M01–M24) through the REAL `@supabase/supabase-js` client and the app's own
 * service layer. The UI layer is covered by test-phase-8.3-ui.mjs.
 *
 * Per theme: UI contract, theme_id, categories, predefined services, suggested
 * services, zero-typing selection, name/description auto-fill, Select All,
 * Add Selected, price, duration, edit, activate/deactivate, delete, duplicate
 * prevention, and Custom Service / Other.
 *
 * Then: the full 12-step theme-switching sequence, refresh-after-save,
 * relationship integrity, tenant isolation, and existing-data preservation.
 */
import assert from 'node:assert/strict';
import { createHarness, createRunner, IDS, THEMES } from './lib/acceptance-harness.mjs';

const harness = await createHarness();
const runner = createRunner('Phase 8.3 acceptance');

// The app's own modules, imported AFTER the bridge is installed.
const { loadThemeServiceCatalog } = await import('../src/lib/themeCatalogService.ts');
const {
  createSavedService,
  deleteSavedService,
  loadSavedServicesForTheme,
  savePredefinedServices,
  setSavedServiceActive,
  setSavedServiceStatus,
  updateSavedService,
} = await import('../src/lib/savedServiceService.ts');
const {
  THEME_CATEGORIES,
  SERVICES_BY_THEME,
  SUGGESTED_SERVICE_NAMES,
  SUGGESTED_SERVICE_ALIASES,
  THEME_LABELS,
  normalizeThemeId,
} = await import('../src/lib/themeServices.ts');

harness.signIn(IDS.ownerA);

/** Mirrors StepServices' behaviour: pick a suggested chip, get a filled form. */
const zeroTypingSelect = (catalog, chipLabel) => {
  const query = chipLabel.trim().toLowerCase();
  return catalog.predefinedServices.find((service) =>
    service.name.toLowerCase() === query
    || service.suggestedLabel?.toLowerCase() === query);
};

const savedByTheme = {};

// ===========================================================================
// PART 1 — PER-THEME COMPLETE WORKFLOW
// ===========================================================================
for (const theme of THEMES) {
  runner.section(`THEME: ${theme.label}`);

  const catalog = await loadThemeServiceCatalog(theme.id);

  await runner.test(`${theme.label} — correct theme_id and UI identity`, async () => {
    assert.equal(catalog.theme.themeId, theme.id);
    assert.equal(THEME_LABELS[theme.id], theme.label);
    // The DB theme name is what the UI header renders.
    assert.ok(catalog.theme.name.length > 0);
    // A saved draft using this theme must normalise back to itself.
    assert.equal(normalizeThemeId(theme.id), theme.id);
    // Every returned row carries this theme's database UUID.
    const themeUuid = catalog.theme.id;
    catalog.categories.forEach((c) => assert.equal(c.themeId, themeUuid));
    catalog.predefinedServices.forEach((s) => assert.equal(s.themeId, themeUuid));
  });

  await runner.test(`${theme.label} — correct categories (DB matches app source)`, async () => {
    const dbCategories = catalog.categories.map((c) => c.name);
    assert.deepEqual(dbCategories, theme.categories,
      `expected ${JSON.stringify(theme.categories)}, got ${JSON.stringify(dbCategories)}`);
    assert.deepEqual(dbCategories, THEME_CATEGORIES[theme.id]);
    // No category from any other theme leaked in.
    for (const other of THEMES.filter((t) => t.id !== theme.id)) {
      const foreignOnly = other.categories.filter((c) => !theme.categories.includes(c));
      foreignOnly.forEach((name) =>
        assert.equal(dbCategories.includes(name), false, `leaked category ${name}`));
    }
  });

  await runner.test(`${theme.label} — correct predefined services`, async () => {
    const expected = SERVICES_BY_THEME[theme.id];
    assert.equal(catalog.predefinedServices.length, expected.length);
    const dbNames = new Set(catalog.predefinedServices.map((s) => s.name));
    expected.forEach((service) =>
      assert.ok(dbNames.has(service.name), `missing predefined service: ${service.name}`));
    // Every service sits in a category that belongs to this theme.
    const categoryIds = new Set(catalog.categories.map((c) => c.id));
    catalog.predefinedServices.forEach((service) => {
      assert.ok(categoryIds.has(service.categoryId));
      assert.ok(theme.categories.includes(service.category));
    });
    // Price/duration are real values the form can consume.
    catalog.predefinedServices.forEach((service) => {
      assert.ok(service.price > 0, `${service.name} has no price`);
      assert.ok(service.duration > 0, `${service.name} has no duration`);
      assert.ok(service.description.length > 0, `${service.name} has no description`);
    });
  });

  await runner.test(`${theme.label} — correct Suggested Services (labels + order)`, async () => {
    const expectedLabels = SUGGESTED_SERVICE_NAMES[theme.id];
    const chips = catalog.suggestedServices.map((s) => s.suggestedLabel || s.name);
    assert.equal(chips.length, 6);
    assert.deepEqual(chips, expectedLabels,
      `suggested chips差 expected ${JSON.stringify(expectedLabels)}, got ${JSON.stringify(chips)}`);
    // Aliased chips must resolve to their canonical catalogue row.
    const aliases = SUGGESTED_SERVICE_ALIASES[theme.id] ?? {};
    for (const [label, canonical] of Object.entries(aliases)) {
      const row = catalog.suggestedServices.find((s) => (s.suggestedLabel || s.name) === label);
      if (row) assert.equal(row.name, canonical, `${label} must map to ${canonical}`);
    }
    catalog.suggestedServices.forEach((s) => assert.equal(s.isSuggested, true));
  });

  await runner.test(`${theme.label} — zero-typing selection + name/description auto-fill`, async () => {
    for (const chipLabel of SUGGESTED_SERVICE_NAMES[theme.id]) {
      const resolved = zeroTypingSelect(catalog, chipLabel);
      assert.ok(resolved, `chip "${chipLabel}" did not resolve without typing`);
      // Name auto-fill canonicalises the alias to the catalogue name.
      assert.ok(resolved.name.length > 0);
      // Description auto-fill comes from the catalogue, not a generic string.
      assert.ok(resolved.description.length > 0);
      assert.equal(/^professional salon service/i.test(resolved.description), false,
        `${chipLabel} fell back to a generic description`);
      // Price + duration auto-fill.
      assert.ok(resolved.price > 0 && resolved.duration > 0);
      assert.ok(theme.categories.includes(resolved.category));
    }
  });

  await runner.test(`${theme.label} — Select All + Add Selected persists all six`, async () => {
    // Select All (all visible suggested chips) → Add Selected.
    const allSuggestedIds = catalog.suggestedServices.map((s) => s.id);
    assert.equal(allSuggestedIds.length, 6);
    const result = await savePredefinedServices(theme.id, allSuggestedIds);
    assert.equal(result.themeId, theme.id);
    assert.equal(result.requestedCount, 6);
    assert.equal(result.insertedCount, 6);
    assert.equal(result.services.length, 6);
    result.services.forEach((service) => {
      assert.equal(service.businessId, IDS.businessA);
      assert.equal(service.themeKey, theme.id);
      assert.ok(service.predefinedServiceId);
      assert.equal(service.status, 'active');
    });
    savedByTheme[theme.id] = result.services;
  });

  await runner.test(`${theme.label} — price and duration are stored exactly`, async () => {
    for (const saved of savedByTheme[theme.id]) {
      const source = catalog.predefinedServices.find((s) => s.id === saved.predefinedServiceId);
      assert.equal(saved.price, source.price, `${saved.name}: price mismatch`);
      assert.equal(saved.duration, source.duration, `${saved.name}: duration mismatch`);
    }
    // Paise are stored as integers — no floating-point drift.
    const rows = await harness.admin(
      `select price_paise from public.services
       where business_id=$1 and predefined_service_id is not null`, [IDS.businessA]);
    rows.rows.forEach((row) => assert.equal(Number.isInteger(Number(row.price_paise)), true));
  });

  await runner.test(`${theme.label} — Custom Service / Other keeps NULL provenance`, async () => {
    const categoryId = catalog.categories[0].id;
    const custom = await createSavedService(theme.id, {
      categoryId,
      name: `${theme.label} House Custom`,
      description: 'Owner-authored description.',
      price: 1499.5,
      duration: 75,
    });
    assert.equal(custom.predefinedServiceId, null, 'custom service must not be linked');
    assert.equal(custom.themeKey, theme.id);
    assert.equal(custom.categoryId, categoryId);
    assert.equal(custom.price, 1499.5);
    assert.equal(custom.duration, 75);
    savedByTheme[theme.id].push(custom);
  });

  await runner.test(`${theme.label} — Edit (name/description/price/duration)`, async () => {
    const target = savedByTheme[theme.id][0];
    const before = await harness.admin(
      `select theme_id,category_id,predefined_service_id from public.services where id=$1`,
      [target.id]);

    const edited = await updateSavedService(theme.id, target.id, {
      name: `${target.name} Deluxe`,
      description: 'Edited in Phase 8.3 acceptance.',
      price: 2750,
      duration: 95,
    });
    assert.equal(edited.name, `${target.name} Deluxe`);
    assert.equal(edited.description, 'Edited in Phase 8.3 acceptance.');
    assert.equal(edited.price, 2750);
    assert.equal(edited.duration, 95);

    // Individual field updates.
    assert.equal((await updateSavedService(theme.id, target.id, { price: 3300 })).price, 3300);
    assert.equal((await updateSavedService(theme.id, target.id, { duration: 45 })).duration, 45);
    assert.equal(
      (await updateSavedService(theme.id, target.id, { description: 'Only the description.' })).description,
      'Only the description.');

    const after = await harness.admin(
      `select theme_id,category_id,predefined_service_id from public.services where id=$1`,
      [target.id]);
    assert.deepEqual(after.rows, before.rows, 'editing must not alter provenance');
    savedByTheme[theme.id][0] = edited;
  });

  await runner.test(`${theme.label} — Activate / Deactivate / status change`, async () => {
    const target = savedByTheme[theme.id][1];
    assert.equal((await setSavedServiceActive(theme.id, target.id, false)).status, 'inactive');
    assert.equal((await setSavedServiceActive(theme.id, target.id, true)).status, 'active');
    for (const status of ['inactive', 'archived', 'active']) {
      assert.equal((await setSavedServiceStatus(theme.id, target.id, status)).status, status);
    }
    // Status changes never touch the global catalog row.
    const global = await harness.admin(
      'select is_active from public.predefined_services where id=$1', [target.predefinedServiceId]);
    assert.equal(global.rows[0].is_active, true);
  });

  await runner.test(`${theme.label} — duplicate prevention (predefined + custom name)`, async () => {
    const target = savedByTheme[theme.id][2];
    const source = catalog.predefinedServices.find((s) => s.id === target.predefinedServiceId);

    await assert.rejects(
      () => createSavedService(theme.id, {
        categoryId: source.categoryId, name: 'Totally different name',
        description: '', price: 100, duration: 10,
        predefinedServiceId: source.id,
      }), /already saved/i, 'duplicate predefined link must be rejected');

    await assert.rejects(
      () => createSavedService(theme.id, {
        categoryId: catalog.categories[0].id,
        name: `${theme.label} HOUSE CUSTOM`, // case-insensitive collision
        description: '', price: 100, duration: 10,
      }), /already saved/i, 'duplicate custom name must be rejected');

    // Re-running Add Selected inserts nothing.
    const repeat = await savePredefinedServices(
      theme.id, catalog.suggestedServices.map((s) => s.id));
    assert.equal(repeat.insertedCount, 0);
    assert.equal(repeat.existingCount, 6);
  });

  await runner.test(`${theme.label} — Delete removes only the salon's row`, async () => {
    const victim = savedByTheme[theme.id].pop();
    const predefinedId = victim.predefinedServiceId;
    assert.equal(await deleteSavedService(victim.id), victim.id);

    const gone = await harness.admin(
      'select count(*)::int c from public.services where id=$1', [victim.id]);
    assert.equal(gone.rows[0].c, 0);

    if (predefinedId) {
      const stillGlobal = await harness.admin(
        'select is_active from public.predefined_services where id=$1', [predefinedId]);
      assert.equal(stillGlobal.rows[0].is_active, true, 'global catalog row must survive');
    }
    // Deleting again is a clean failure, not a crash.
    await assert.rejects(() => deleteSavedService(victim.id), /not found for your salon/i);
  });
}

// ===========================================================================
// PART 2 — THEME SWITCHING SEQUENCE
// ===========================================================================
runner.section('THEME SWITCHING (Existing → 5 → 5 → Existing)');

const SWITCH_SEQUENCE = [
  'hair',
  'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
  'family_full_service', 'nail_lash_studio',
  'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
  'family_full_service', 'nail_lash_studio',
  'hair',
];

await runner.test('12-step switch sequence never leaks catalog data across themes', async () => {
  const catalogCache = new Map();
  let previous = null;

  for (const [index, themeId] of SWITCH_SEQUENCE.entries()) {
    const step = `step ${index + 1} (${themeId})`;

    if (themeId === 'hair') {
      // The preserved Existing theme is intentionally not in the database.
      const { isDatabaseCatalogTheme } = await import('../src/lib/themeCatalogService.ts');
      assert.equal(isDatabaseCatalogTheme('hair'), false, `${step}: hair must stay local`);
      previous = { themeId, categories: THEME_CATEGORIES.hair,
        suggested: SUGGESTED_SERVICE_NAMES.hair };
      continue;
    }

    const catalog = await loadThemeServiceCatalog(themeId);
    const expected = THEMES.find((t) => t.id === themeId);

    // Correct data for THIS theme.
    assert.equal(catalog.theme.themeId, themeId, `${step}: wrong theme returned`);
    assert.deepEqual(catalog.categories.map((c) => c.name), expected.categories,
      `${step}: wrong categories`);
    assert.deepEqual(catalog.suggestedServices.map((s) => s.suggestedLabel || s.name),
      SUGGESTED_SERVICE_NAMES[themeId], `${step}: wrong suggested services`);

    // Nothing from the PREVIOUS theme survived.
    if (previous && previous.themeId !== themeId) {
      const previousOnlyCats = previous.categories.filter(
        (c) => !expected.categories.includes(c));
      previousOnlyCats.forEach((name) => assert.equal(
        catalog.categories.some((c) => c.name === name), false,
        `${step}: stale category "${name}" from ${previous.themeId}`));

      const previousOnlySuggested = previous.suggested.filter(
        (s) => !SUGGESTED_SERVICE_NAMES[themeId].includes(s));
      previousOnlySuggested.forEach((name) => assert.equal(
        catalog.suggestedServices.some((s) => (s.suggestedLabel || s.name) === name), false,
        `${step}: stale suggested chip "${name}" from ${previous.themeId}`));

      const previousServiceNames = new Set(
        (SERVICES_BY_THEME[previous.themeId] ?? []).map((s) => s.name));
      const currentServiceNames = new Set(SERVICES_BY_THEME[themeId].map((s) => s.name));
      catalog.predefinedServices.forEach((service) => {
        if (previousServiceNames.has(service.name) && !currentServiceNames.has(service.name)) {
          throw new Error(`${step}: stale service "${service.name}" from ${previous.themeId}`);
        }
      });
    }

    // Repeat visits are identical — no cache drift or accumulation.
    if (catalogCache.has(themeId)) {
      const first = catalogCache.get(themeId);
      assert.equal(catalog.categories.length, first.categoryCount, `${step}: category count drifted`);
      assert.equal(catalog.predefinedServices.length, first.serviceCount, `${step}: service count drifted`);
      assert.deepEqual(catalog.suggestedServices.map((s) => s.id), first.suggestedIds,
        `${step}: suggested set drifted between visits`);
    } else {
      catalogCache.set(themeId, {
        categoryCount: catalog.categories.length,
        serviceCount: catalog.predefinedServices.length,
        suggestedIds: catalog.suggestedServices.map((s) => s.id),
      });
    }

    previous = { themeId, categories: expected.categories,
      suggested: SUGGESTED_SERVICE_NAMES[themeId] };
  }
});

await runner.test('saved services stay partitioned per theme across the sequence', async () => {
  for (const theme of THEMES) {
    const saved = await loadSavedServicesForTheme(theme.id);
    saved.forEach((service) => {
      assert.equal(service.themeKey, theme.id,
        `${theme.id} load returned a ${service.themeKey} row`);
      assert.equal(service.businessId, IDS.businessA);
    });
    // Every predefined row belongs to this theme's catalog.
    const catalog = await loadThemeServiceCatalog(theme.id);
    const validIds = new Set(catalog.predefinedServices.map((s) => s.id));
    saved.filter((s) => s.predefinedServiceId).forEach((service) =>
      assert.ok(validIds.has(service.predefinedServiceId),
        `${theme.id}: saved row points outside its catalog`));
  }
});

// ===========================================================================
// PART 3 — REFRESH, RELATIONSHIPS, ISOLATION, PRESERVATION
// ===========================================================================
runner.section('REFRESH · RELATIONSHIPS · ISOLATION · PRESERVATION');

await runner.test('refresh after saving returns identical data (idempotent, no duplicates)', async () => {
  for (const theme of THEMES) {
    const first = await loadSavedServicesForTheme(theme.id);
    const second = await loadSavedServicesForTheme(theme.id);
    const third = await loadSavedServicesForTheme(theme.id);
    assert.deepEqual(second, first, `${theme.id}: refresh changed the data`);
    assert.deepEqual(third, first, `${theme.id}: repeated refresh drifted`);

    const predefinedIds = first.filter((s) => s.predefinedServiceId)
      .map((s) => s.predefinedServiceId);
    assert.equal(new Set(predefinedIds).size, predefinedIds.length,
      `${theme.id}: duplicate predefined links after refresh`);
  }
  // Row counts are stable — reads never insert.
  const before = await harness.admin(
    'select count(*)::int c from public.services where business_id=$1', [IDS.businessA]);
  for (const theme of THEMES) await loadSavedServicesForTheme(theme.id);
  const after = await harness.admin(
    'select count(*)::int c from public.services where business_id=$1', [IDS.businessA]);
  assert.equal(after.rows[0].c, before.rows[0].c, 'reading services changed the row count');
});

await runner.test('database relationships are exactly correct for every saved row', async () => {
  const broken = await harness.admin(`
    select s.id, s.name
    from public.services s
    where s.predefined_service_id is not null
      and not exists (
        select 1 from public.predefined_services ps
        join public.service_categories c
          on c.id = ps.category_id and c.theme_id = ps.theme_id
        join public.themes t on t.id = ps.theme_id
        where ps.id = s.predefined_service_id
          and ps.theme_id = s.theme_id
          and ps.category_id = s.category_id
          and t.is_active)`);
  assert.equal(broken.rows.length, 0,
    `broken provenance chains: ${JSON.stringify(broken.rows)}`);

  // Category always belongs to the row's theme.
  const badCategory = await harness.admin(`
    select s.id from public.services s
    where s.category_id is not null
      and not exists (select 1 from public.service_categories c
                      where c.id = s.category_id and c.theme_id = s.theme_id)`);
  assert.equal(badCategory.rows.length, 0);

  // Custom rows keep NULL provenance.
  const customRows = await harness.admin(`
    select count(*)::int c from public.services
    where predefined_service_id is null and business_id = $1`, [IDS.businessA]);
  assert.ok(customRows.rows[0].c >= 1, 'expected custom rows to exist');

  // Orphan guard: no saved row references a missing catalog row.
  const orphans = await harness.admin(`
    select count(*)::int c from public.services s
    where (s.theme_id is not null and not exists (select 1 from public.themes t where t.id=s.theme_id))
       or (s.category_id is not null and not exists (select 1 from public.service_categories c where c.id=s.category_id))
       or (s.predefined_service_id is not null and not exists (select 1 from public.predefined_services p where p.id=s.predefined_service_id))`);
  assert.equal(orphans.rows[0].c, 0);
});

await runner.test('tenant isolation holds after the full workflow', async () => {
  // Owner B builds their own catalog on the same themes.
  harness.signIn(IDS.ownerB);
  const bCatalog = await loadThemeServiceCatalog('nail_lash_studio');
  const bSaved = await savePredefinedServices(
    'nail_lash_studio', bCatalog.suggestedServices.slice(0, 2).map((s) => s.id));
  assert.equal(bSaved.businessId, IDS.businessB);

  // Owner B sees only their own rows.
  for (const theme of THEMES) {
    const rows = await loadSavedServicesForTheme(theme.id);
    rows.forEach((row) => assert.equal(row.businessId, IDS.businessB,
      `${theme.id}: Owner B saw a foreign row`));
  }

  // Owner B cannot touch Owner A's services.
  const victim = savedByTheme.barber_mens_grooming[0];
  await assert.rejects(() => updateSavedService('barber_mens_grooming', victim.id, { price: 1 }),
    /not found for your salon/i);
  await assert.rejects(() => deleteSavedService(victim.id), /not found for your salon/i);
  await assert.rejects(() => setSavedServiceStatus('barber_mens_grooming', victim.id, 'archived'),
    /not found for your salon/i);

  harness.signIn(IDS.ownerA);
  // Owner A's data is untouched and still visible.
  const aRows = await loadSavedServicesForTheme('barber_mens_grooming');
  assert.ok(aRows.some((row) => row.id === victim.id));
  aRows.forEach((row) => assert.equal(row.businessId, IDS.businessA));

  // The same predefined service can be saved independently by both tenants.
  const shared = await harness.admin(`
    select predefined_service_id, count(distinct business_id)::int tenants
    from public.services
    where predefined_service_id is not null
    group by predefined_service_id having count(distinct business_id) > 1`);
  shared.rows.forEach((row) => assert.equal(row.tenants, 2));
});

await runner.test('existing services and global catalog data remain intact', async () => {
  // The pre-existing legacy custom row is byte-identical.
  const legacy = await harness.admin(
    `select name, category, price_paise, duration_minutes, short_description,
            status::text, theme_id, category_id, predefined_service_id
     from public.services where id=$1`, [IDS.legacyCustomA]);
  assert.deepEqual({
    ...legacy.rows[0],
    price_paise: Number(legacy.rows[0].price_paise),
  }, {
    name: 'Legacy Manual Service',
    category: 'Owner category',
    price_paise: 88000,
    duration_minutes: 40,
    short_description: 'Pre-existing custom row',
    status: 'active',
    theme_id: null,
    category_id: null,
    predefined_service_id: null,
  });

  // The seeded global catalog is exactly the Phase 7.3 dataset.
  const totals = await harness.admin(`
    select (select count(*)::int from public.themes) themes,
           (select count(*)::int from public.service_categories) categories,
           (select count(*)::int from public.predefined_services) predefined,
           (select count(*)::int from public.predefined_services where is_suggested) suggested`);
  assert.deepEqual(totals.rows[0], {
    themes: 5, categories: 17, predefined: 78, suggested: 30,
  });

  // Nothing was deactivated or renamed by the workflow.
  const inactive = await harness.admin(`
    select (select count(*)::int from public.themes where not is_active) t,
           (select count(*)::int from public.predefined_services where not is_active) p`);
  assert.deepEqual(inactive.rows[0], { t: 0, p: 0 });
});

const results = runner.summary();
await harness.close();
// PGlite's worker MessagePort keeps a handle referenced after close, so exit
// explicitly rather than waiting for an event loop that never drains.
process.exit(results.failed > 0 ? 1 : 0);
