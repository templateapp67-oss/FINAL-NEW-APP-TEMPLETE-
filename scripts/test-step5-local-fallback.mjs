import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Step 5 "Services & Packages" local-fallback suite.
 *
 * Covers the audit fix for the live errors "Unable to load saved services."
 * and "Unable to add this service." (docs/step5-services-audit.md):
 *
 *   1. rpcSurface detection — engages ONLY on PostgREST PGRST202 /
 *      "Could not find the function … in the schema cache"; never on auth,
 *      validation or transient network failures.
 *   2. The localStorage-backed saved-service store (memory mirror in node).
 *   3. The *Local executors that back the public wrappers when the live
 *      project predates the M40 migration: full CRUD + predefined-save
 *      semantics mirroring the RPC contracts (validation, duplicate guards,
 *      mutable-fields-only updates, status rules).
 *   4. Source-contract assertions: every public wrapper consults the probe
 *      and falls back locally; every *WithClient error branch records the
 *      probe so boundary behavior (masked errors) is unchanged.
 */

const themeId = 'barber_mens_grooming';

let passed = 0;
const test = async (name, run) => {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
};

const { isMissingRpcSurfaceError } = await import('../src/lib/rpcSurface.ts');
const {
  SavedServiceError,
  loadSavedServicesLocal,
  savePredefinedServicesLocal,
  createSavedServiceLocal,
  updateSavedServiceLocal,
  setSavedServiceStatusLocal,
  setSavedServiceActiveLocal,
  deleteSavedServiceLocal,
  archiveSavedServiceLocal,
  createSavedServiceWithClient,
  resetSavedServiceRpcProbeForTests,
} = await import('../src/lib/savedServiceService.ts');
const {
  clearLocalSavedServicesForTests,
  listLocalSavedServices,
} = await import('../src/lib/localSavedServices.ts');
const { getFallbackThemeCatalog } = await import('../src/lib/themeCatalogService.ts');

const expectSavedServiceError = async (promiseFactory, messagePattern) => {
  try {
    await promiseFactory();
  } catch (error) {
    assert.ok(error instanceof SavedServiceError, `expected SavedServiceError, got ${error}`);
    assert.match(error.message, messagePattern);
    return;
  }
  assert.fail(`expected SavedServiceError matching ${messagePattern}`);
};

clearLocalSavedServicesForTests();
resetSavedServiceRpcProbeForTests();

await test('rpc probe matches only the PostgREST missing-function signature', async () => {
  assert.equal(isMissingRpcSurfaceError({
    code: 'PGRST202',
    message: 'Could not find the function public.create_saved_service(p_category_id, p_description, p_duration_minutes, p_name, p_predefined_service_id, p_price_paise, p_status, p_theme_id) in the schema cache',
  }), true);
  assert.equal(isMissingRpcSurfaceError({
    message: 'Could not find the function public.get_theme_commerce(text) in the schema cache',
  }), true);
  // Auth, validation, transient network and unrelated codes must NOT engage it.
  assert.equal(isMissingRpcSurfaceError({ code: '28000', message: 'Please log in to manage services.' }), false);
  assert.equal(isMissingRpcSurfaceError({ code: '23505', message: 'This service is already saved for your salon.' }), false);
  assert.equal(isMissingRpcSurfaceError({ message: 'Failed to fetch' }), false);
  assert.equal(isMissingRpcSurfaceError({ code: 'PGRST301', message: 'Not found' }), false);
  assert.equal(isMissingRpcSurfaceError(null), false);
  assert.equal(isMissingRpcSurfaceError('PGRST202'), false);
  assert.equal(isMissingRpcSurfaceError({}), false);
});

await test('local list starts empty per theme', async () => {
  assert.deepEqual(loadSavedServicesLocal(themeId), []);
});

const fallbackCatalog = getFallbackThemeCatalog(themeId);
const [suggestedA, suggestedB] = fallbackCatalog.suggestedServices;

await test('savePredefinedServicesLocal copies catalog details verbatim', async () => {
  const result = savePredefinedServicesLocal(themeId, [suggestedA.id, suggestedB.id, suggestedA.id]);
  assert.equal(result.businessId, 'local-salon');
  assert.equal(result.themeId, themeId);
  assert.equal(result.requestedCount, 2);
  assert.equal(result.insertedCount, 2);
  assert.equal(result.existingCount, 0);
  assert.equal(result.services.length, 2);
  const first = result.services.find((row) => row.predefinedServiceId === suggestedA.id);
  assert.equal(first.name, suggestedA.name);
  assert.equal(first.category, suggestedA.category);
  assert.equal(first.categoryId, suggestedA.categoryId);
  assert.equal(first.price, suggestedA.price);
  assert.equal(first.duration, suggestedA.duration);
  assert.equal(first.description, suggestedA.description);
  assert.equal(first.status, 'active');
  assert.match(first.id, /^local-/);
  assert.equal(loadSavedServicesLocal(themeId).length, 2);
});

await test('savePredefinedServicesLocal is idempotent (Add Selected re-click)', async () => {
  const again = savePredefinedServicesLocal(themeId, [suggestedA.id, suggestedB.id]);
  assert.equal(again.insertedCount, 0);
  assert.equal(again.existingCount, 2);
  assert.equal(again.services.length, 2);
  assert.equal(loadSavedServicesLocal(themeId).length, 2);
});

await test('savePredefinedServicesLocal rejects unknown predefined ids', async () => {
  await expectSavedServiceError(
    async () => savePredefinedServicesLocal(themeId, ['not-a-real-predefined-id']),
    /does not belong to this theme and category/i,
  );
});

await test('createSavedServiceLocal stores a custom service with resolved category name', async () => {
  const category = fallbackCatalog.categories[0];
  const created = createSavedServiceLocal(themeId, {
    categoryId: category.id,
    name: 'Anti-Aging Gold Facial',
    description: 'Custom gold facial.',
    price: 2400,
    duration: 60,
    predefinedServiceId: null,
    status: 'active',
  });
  assert.equal(created.predefinedServiceId, null);
  assert.equal(created.category, category.name);
  assert.equal(created.categoryId, category.id);
  assert.equal(created.price, 2400);
  assert.equal(created.duration, 60);
  assert.equal(created.status, 'active');
  assert.equal(loadSavedServicesLocal(themeId).length, 3);
});

await test('createSavedServiceLocal mirrors the M40 validation rules', async () => {
  const category = fallbackCatalog.categories[0];
  await expectSavedServiceError(
    async () => createSavedServiceLocal(themeId, { categoryId: category.id, name: '  ', description: '', price: 10, duration: 10 }),
    /name is required/i,
  );
  await expectSavedServiceError(
    async () => createSavedServiceLocal(themeId, { categoryId: category.id, name: 'X', description: '', price: -1, duration: 10 }),
    /price cannot be negative/i,
  );
  await expectSavedServiceError(
    async () => createSavedServiceLocal(themeId, { categoryId: category.id, name: 'X', description: '', price: 10, duration: 0 }),
    /duration must be positive/i,
  );
  await expectSavedServiceError(
    async () => createSavedServiceLocal(themeId, { categoryId: 'nope', name: 'X', description: '', price: 10, duration: 10 }),
    /category does not belong to this theme/i,
  );
  // Duplicate predefined link → "already saved" (mirrors M40 23505).
  await expectSavedServiceError(
    async () => createSavedServiceLocal(themeId, {
      categoryId: suggestedA.categoryId,
      name: 'Anything',
      description: '',
      price: 10,
      duration: 10,
      predefinedServiceId: suggestedA.id,
    }),
    /already saved for your salon/i,
  );
  // Duplicate custom name among non-archived rows → "already saved".
  await expectSavedServiceError(
    async () => createSavedServiceLocal(themeId, {
      categoryId: category.id,
      name: 'anti-aging gold facial',
      description: '',
      price: 10,
      duration: 10,
    }),
    /already saved for this theme/i,
  );
});

await test('updateSavedServiceLocal applies mutable fields only', async () => {
  const before = loadSavedServicesLocal(themeId).find((row) => row.name === 'Anti-Aging Gold Facial');
  const updated = updateSavedServiceLocal(themeId, before.id, { price: 2600, duration: 75 });
  assert.equal(updated.price, 2600);
  assert.equal(updated.duration, 75);
  assert.equal(updated.name, 'Anti-Aging Gold Facial');
  // Immutables survive untouched (provenance/ownership contract).
  assert.equal(updated.predefinedServiceId, null);
  assert.equal(updated.businessId, 'local-salon');
  assert.equal(updated.categoryId, before.categoryId);
  await expectSavedServiceError(
    async () => updateSavedServiceLocal(themeId, before.id, { name: ' ' }),
    /name is required/i,
  );
  await expectSavedServiceError(
    async () => updateSavedServiceLocal(themeId, 'local-does-not-exist', { price: 1 }),
    /not found for your salon/i,
  );
});

await test('status helpers mirror is_active/deleted_at semantics', async () => {
  const target = loadSavedServicesLocal(themeId).find((row) => row.name === 'Anti-Aging Gold Facial');
  const archived = setSavedServiceStatusLocal(themeId, target.id, 'archived');
  assert.equal(archived.status, 'archived');
  // "Deactivating" an archived row keeps it archived; activating revives it.
  assert.equal(setSavedServiceActiveLocal(themeId, target.id, false).status, 'archived');
  assert.equal(setSavedServiceActiveLocal(themeId, target.id, true).status, 'active');
  assert.equal(setSavedServiceActiveLocal(themeId, target.id, false).status, 'inactive');
});

await test('archived rows do not block re-creating the same custom name', async () => {
  const category = fallbackCatalog.categories[0];
  const row = loadSavedServicesLocal(themeId).find((item) => item.name === suggestedB.name);
  setSavedServiceStatusLocal(themeId, row.id, 'archived');
  const recreated = createSavedServiceLocal(themeId, {
    categoryId: category.id,
    name: suggestedB.name,
    description: 'fresh custom copy',
    price: 5,
    duration: 5,
  });
  assert.equal(recreated.name, suggestedB.name);
  deleteSavedServiceLocal(recreated.id);
  setSavedServiceStatusLocal(themeId, row.id, 'active');
});

await test('re-adding an archived service revives the same row (no duplicate, no error)', async () => {
  const rows = () => loadSavedServicesLocal(themeId);

  // Predefined-linked: archive, then re-add via createSavedServiceLocal.
  const predefinedRow = rows().find((row) => row.predefinedServiceId === suggestedB.id);
  assert.ok(predefinedRow, 'suggestedB row expected');
  setSavedServiceStatusLocal(themeId, predefinedRow.id, 'archived');
  const revivedPredefined = createSavedServiceLocal(themeId, {
    categoryId: suggestedB.categoryId,
    name: suggestedB.name,
    description: 'revived copy',
    price: 333,
    duration: 44,
    predefinedServiceId: suggestedB.id,
    status: 'active',
  });
  assert.equal(revivedPredefined.id, predefinedRow.id,
    're-add must revive the archived row, not insert a duplicate');
  assert.equal(revivedPredefined.status, 'active');
  assert.equal(revivedPredefined.price, 333);
  assert.equal(revivedPredefined.duration, 44);
  assert.equal(
    rows().filter((row) => row.predefinedServiceId === suggestedB.id).length,
    1,
  );

  // Custom / Other: archive, then re-add the same name — revived, same id.
  const customRow = rows().find(
    (row) => row.name === 'Anti-Aging Gold Facial' && row.predefinedServiceId === null,
  );
  assert.ok(customRow, 'custom row expected');
  setSavedServiceStatusLocal(themeId, customRow.id, 'archived');
  const revivedCustom = createSavedServiceLocal(themeId, {
    categoryId: fallbackCatalog.categories[0].id,
    name: 'anti-aging gold facial',
    description: '',
    price: 2600,
    duration: 75,
  });
  assert.equal(revivedCustom.id, customRow.id, 'custom re-add must revive the archived row');
  assert.equal(revivedCustom.status, 'active');
  assert.equal(revivedCustom.price, 2600);
  assert.equal(revivedCustom.predefinedServiceId, null);
  assert.equal(
    rows().filter((row) => row.name.toLowerCase() === 'anti-aging gold facial').length,
    1,
  );

  // Add Selected (savePredefinedServicesLocal) also revives an archived row
  // instead of leaving a stale retired copy next to a duplicate.
  setSavedServiceStatusLocal(themeId, revivedPredefined.id, 'archived');
  const batch = savePredefinedServicesLocal(themeId, [suggestedB.id]);
  assert.equal(batch.insertedCount, 0);
  assert.equal(batch.existingCount, 1);
  assert.equal(batch.services[0].id, revivedPredefined.id);
  assert.equal(batch.services[0].status, 'active');
  assert.equal(
    rows().filter((row) => row.predefinedServiceId === suggestedB.id).length,
    1,
  );
});

await test('archive + delete are idempotent and remove rows from the list', async () => {
  const before = loadSavedServicesLocal(themeId).length;
  const target = loadSavedServicesLocal(themeId).find((row) => row.predefinedServiceId === suggestedA.id);
  archiveSavedServiceLocal(target.id);
  assert.equal(loadSavedServicesLocal(themeId).find((row) => row.id === target.id).status, 'archived');
  deleteSavedServiceLocal(target.id);
  assert.equal(loadSavedServicesLocal(themeId).length, before - 1);
  deleteSavedServiceLocal(target.id); // second delete stays silent
  assert.equal(loadSavedServicesLocal(themeId).length, before - 1);
});

await test('theme isolation: rows never bleed across themes', async () => {
  const other = 'hair_studio_color_bar';
  assert.equal(listLocalSavedServices(other).length, 0);
  const otherCatalog = getFallbackThemeCatalog(other);
  createSavedServiceLocal(other, {
    categoryId: otherCatalog.categories[0].id,
    name: 'Other Theme Service',
    description: '',
    price: 1,
    duration: 1,
  });
  assert.equal(listLocalSavedServices(other).length, 1);
  assert.equal(
    listLocalSavedServices(themeId).every((row) => row.themeKey === themeId),
    true,
  );
});

await test('WithClient boundary behavior is unchanged: masked error on PGRST202', async () => {
  resetSavedServiceRpcProbeForTests();
  const stubClient = {
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.create_saved_service(p_category_id) in the schema cache' },
    }),
  };
  await expectSavedServiceError(
    async () => createSavedServiceWithClient(stubClient, themeId, {
      categoryId: '50000000-0000-4000-8000-000000000001',
      name: 'Probe',
      description: '',
      price: 1,
      duration: 1,
    }),
    /Unable to add this service\./,
  );
  resetSavedServiceRpcProbeForTests();
});

await test('source contract: public wrappers fall back; WithClient functions probe', async () => {
  const source = await readFile(new URL('../src/lib/savedServiceService.ts', import.meta.url), 'utf8');
  // Every WithClient error branch records the probe before masking.
  const probeCount = (source.match(/noteRpcSurfaceProbe\(error\)/g) || []).length;
  assert.ok(probeCount >= 7, `expected >=7 probe call sites, found ${probeCount}`);
  // wrapper → its local executor
  const executors = {
    savePredefinedServices: 'savePredefinedServicesLocal',
    loadSavedServicesForTheme: 'loadSavedServicesLocal',
    createSavedService: 'createSavedServiceLocal',
    updateSavedService: 'updateSavedServiceLocal',
    setSavedServiceStatus: 'setSavedServiceStatusLocal',
    setSavedServiceActive: 'setSavedServiceActiveLocal',
    deleteSavedService: 'deleteSavedServiceLocal',
  };
  for (const [wrapper, executor] of Object.entries(executors)) {
    assert.ok(source.includes(`${executor}(`), `${executor} must exist for ${wrapper}`);
    assert.ok(
      new RegExp(`if \\(savedServiceRpcSurfaceMissing\\) \\{\\s*return ${executor}\\(`).test(source),
      `public ${wrapper} must consult the probe and fall back to ${executor}`,
    );
    assert.ok(
      new RegExp(`catch \\(error\\) \\{\\s*if \\(savedServiceRpcSurfaceMissing\\) \\{\\s*return ${executor}\\(`).test(source),
      `public ${wrapper} must fall back to ${executor} when the RPC probe trips mid-call`,
    );
  }
  const pricing = await readFile(new URL('../src/lib/pricingPromotionService.ts', import.meta.url), 'utf8');
  assert.match(pricing, /isMissingRpcSurfaceError\(error\)/);
  assert.match(pricing, /if \(commerceRpcSurfaceMissing\)/);
  const safety = await readFile(new URL('../src/lib/serviceSafetyService.ts', import.meta.url), 'utf8');
  assert.match(safety, /isMissingRpcSurfaceError\(error\)/);
  assert.match(safety, /unlockedLocalLock/);
  assert.match(safety, /archiveSavedServiceLocal/);
});

clearLocalSavedServicesForTests();
resetSavedServiceRpcProbeForTests();
console.log(`\n${passed} Step-5 local fallback checks passed.`);
