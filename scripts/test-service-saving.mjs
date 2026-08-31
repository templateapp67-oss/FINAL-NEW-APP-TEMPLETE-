import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createSavedServiceWithClient,
  deleteSavedServiceWithClient,
  loadSavedServicesForThemeWithClient,
  savePredefinedServicesWithClient,
  setSavedServiceActiveWithClient,
  setSavedServiceStatusWithClient,
  updateSavedServiceWithClient,
} from '../src/lib/savedServiceService.ts';

const themeId = 'barber_mens_grooming';
const serviceA = '10000000-0000-4000-8000-000000000001';
const serviceB = '10000000-0000-4000-8000-000000000002';

const makeSaved = (predefinedServiceId, suffix) => ({
  id: `20000000-0000-4000-8000-00000000000${suffix}`,
  business_id: '30000000-0000-4000-8000-000000000001',
  theme_id: '40000000-0000-4000-8000-000000000001',
  theme_key: themeId,
  category_id: '50000000-0000-4000-8000-000000000001',
  predefined_service_id: predefinedServiceId,
  name: `Service ${suffix}`,
  category: 'Haircuts',
  description: `Description ${suffix}`,
  price_paise: 125000,
  duration_minutes: 60,
  status: 'active',
  is_featured: false,
});

let passed = 0;
const test = async (name, run) => {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
};

await test('save request deduplicates IDs and never sends a client tenant ID', async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          business_id: '30000000-0000-4000-8000-000000000001',
          theme_id: themeId,
          requested_count: 2,
          inserted_count: 2,
          existing_count: 0,
          services: [makeSaved(serviceA, 1), makeSaved(serviceB, 2)],
        },
        error: null,
      };
    },
  };

  const result = await savePredefinedServicesWithClient(
    client,
    themeId,
    [serviceA, serviceA, serviceB],
  );
  assert.deepEqual(calls, [{
    name: 'save_predefined_services',
    args: {
      p_theme_id: themeId,
      p_predefined_service_ids: [serviceA, serviceB],
    },
  }]);
  assert.equal(Object.hasOwn(calls[0].args, 'business_id'), false);
  assert.equal(Object.hasOwn(calls[0].args, 'salon_id'), false);
  assert.equal(result.services.length, 2);
  assert.equal(result.services[0].predefinedServiceId, serviceA);
  assert.equal(result.services[0].price, 1250);
  assert.equal(result.services[0].status, 'active');
});

await test('cross-theme, cross-tenant, and unrequested save responses fail closed', async () => {
  const wrongTheme = makeSaved(serviceA, 1);
  wrongTheme.theme_key = 'hair_studio_color_bar';
  await assert.rejects(
    () => savePredefinedServicesWithClient({
      rpc: async () => ({
        data: {
          business_id: wrongTheme.business_id,
          theme_id: themeId,
          requested_count: 1,
          inserted_count: 1,
          existing_count: 0,
          services: [wrongTheme],
        },
        error: null,
      }),
    }, themeId, [serviceA]),
    /cross-theme/i,
  );

  const wrongTenant = makeSaved(serviceA, 1);
  wrongTenant.business_id = '30000000-0000-4000-8000-000000000099';
  await assert.rejects(
    () => savePredefinedServicesWithClient({
      rpc: async () => ({
        data: {
          business_id: '30000000-0000-4000-8000-000000000001',
          theme_id: themeId,
          requested_count: 1,
          inserted_count: 1,
          existing_count: 0,
          services: [wrongTenant],
        },
        error: null,
      }),
    }, themeId, [serviceA]),
    /different salon/i,
  );

  const unrequested = makeSaved(serviceB, 2);
  await assert.rejects(
    () => savePredefinedServicesWithClient({
      rpc: async () => ({
        data: {
          business_id: unrequested.business_id,
          theme_id: themeId,
          requested_count: 1,
          inserted_count: 1,
          existing_count: 0,
          services: [unrequested],
        },
        error: null,
      }),
    }, themeId, [serviceA]),
    /unrequested/i,
  );
});

await test('Select All and Add Selected use only current visible database suggestions', async () => {
  const source = await readFile('src/screens/StepServices.tsx', 'utf8');
  assert.ok(source.includes('visibleSuggested.map((s) => s.name)'));
  assert.ok(source.includes('activeCatalog.suggestedServices.filter'));
  assert.ok(source.includes('selectedSuggested.includes(service.name)'));
  assert.ok(source.includes('selectedRows.map((service) => service.id)'));
  assert.ok(source.includes('service.predefinedServiceId'));
  assert.ok(source.includes('localPredefinedIds.has(service.predefinedServiceId)'));
  assert.equal((source.match(/savePredefinedServices\(/g) ?? []).length, 1);
});

await test('custom service creation stays explicitly unlinked from predefined rows', async () => {
  const source = await readFile('src/screens/StepServices.tsx', 'utf8');
  const customStart = source.indexOf("id: 'custom-' + Date.now()");
  assert.ok(customStart > -1);
  const customBlock = source.slice(customStart, customStart + 350);
  assert.ok(customBlock.includes('themeId: null'));
  assert.ok(customBlock.includes('categoryId: null'));
  assert.ok(customBlock.includes('predefinedServiceId: null'));
});

await test('refresh load and management RPCs never accept relationship or tenant rewrites', async () => {
  const calls = [];
  const saved = makeSaved(serviceA, 1);
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'get_saved_services_for_theme') {
        return {
          data: {
            business_id: saved.business_id,
            theme_id: themeId,
            services: [saved],
          },
          error: null,
        };
      }
      if (name === 'update_saved_service') {
        return {
          data: {
            ...saved,
            name: args.p_name ?? saved.name,
            description: args.p_description ?? saved.description,
            price_paise: args.p_price_paise ?? saved.price_paise,
            duration_minutes: args.p_duration_minutes ?? saved.duration_minutes,
            status: args.p_status ?? saved.status,
          },
          error: null,
        };
      }
      if (name === 'set_saved_service_active') {
        return { data: { ...saved, status: args.p_is_active ? 'active' : 'inactive' }, error: null };
      }
      if (name === 'delete_saved_service') return { data: saved.id, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  const loaded = await loadSavedServicesForThemeWithClient(client, themeId);
  assert.equal(loaded.length, 1);
  const updated = await updateSavedServiceWithClient(client, themeId, saved.id, {
    name: 'Edited', description: 'Edited description', price: 999, duration: 45,
  });
  assert.equal(updated.name, 'Edited');
  assert.equal(updated.themeId, saved.theme_id);
  assert.equal(updated.categoryId, saved.category_id);
  assert.equal(updated.predefinedServiceId, saved.predefined_service_id);
  const inactive = await setSavedServiceActiveWithClient(client, themeId, saved.id, false);
  assert.equal(inactive.status, 'inactive');
  assert.equal(await deleteSavedServiceWithClient(client, saved.id), saved.id);

  const updateArgs = calls.find((call) => call.name === 'update_saved_service').args;
  for (const forbidden of ['business_id', 'theme_id', 'category_id', 'predefined_service_id']) {
    assert.equal(Object.hasOwn(updateArgs, forbidden), false);
  }
});

await test('theme switching preserves business data while resetting transient service UI', async () => {
  const app = await readFile('src/App.tsx', 'utf8');
  const services = await readFile('src/screens/StepServices.tsx', 'utf8');
  const templateLib = await readFile('src/lib/templateConfig.ts', 'utf8');
  assert.equal(app.includes('themeServiceSnapshots'), false);
  // Theme switching is persisted via the serialized owner RPC; only the
  // presentation changes after the RPC succeeds — business fields are spread
  // through and guarded by the runtime preservation assertion.
  assert.ok(app.includes('const applied = await setOwnerTemplate(normalizedNext);'));
  assert.ok(app.includes('applied?.templateId'));
  assert.ok(app.includes('switchSalonTemplatePresentation(current, applied.templateId)'));
  assert.ok(templateLib.includes('assertTemplateSwitchPreservesBusiness(data, switched)'));
  assert.ok(templateLib.includes('...data,'));
  assert.ok(services.includes('setLoadedCatalog(null)'));
  assert.ok(services.includes('setSelectedSuggested([])'));
  assert.ok(services.includes("setSuggestedFilter('All')"));
  assert.ok(services.includes("setNewServiceCategory(firstCategory)"));
  assert.ok(services.includes("setNewServiceName('')"));
  assert.ok(services.includes('services: []'));
  assert.ok(services.includes('loadSavedServicesForTheme(targetTheme)'));
  assert.ok(services.includes('savedLoadRequestRef.current !== requestId'));
  // Phase 8.2: the list is gated on the loaded theme identity, so a previous
  // theme's services can never render while a new theme loads or after an error.
  assert.ok(services.includes('const showSavedServices = savedStatusTheme === theme'));
  assert.ok(services.includes('setSavedStatusTheme(null)'));
  assert.ok(services.includes('{showSavedServices && data.services.map('));
});

await test('Phase 8.1 — Add Service sends explicit provenance and never guesses it', async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          ...makeSaved(args.p_predefined_service_id, 1),
          name: args.p_name,
          description: args.p_description,
          price_paise: args.p_price_paise,
          duration_minutes: args.p_duration_minutes,
          category_id: args.p_category_id,
          status: args.p_status,
        },
        error: null,
      };
    },
  };
  const categoryId = '50000000-0000-4000-8000-000000000001';

  // Predefined-linked add.
  const linked = await createSavedServiceWithClient(client, themeId, {
    categoryId,
    name: 'Skin Fade',
    description: 'Sharp taper',
    price: 450,
    duration: 45,
    predefinedServiceId: serviceA,
  });
  assert.equal(linked.predefinedServiceId, serviceA);
  assert.equal(linked.categoryId, categoryId);
  assert.equal(calls[0].args.p_theme_id, themeId);
  assert.equal(calls[0].args.p_predefined_service_id, serviceA);
  assert.equal(calls[0].args.p_price_paise, 45000);
  assert.equal(calls[0].args.p_duration_minutes, 45);
  assert.equal(calls[0].args.p_status, 'active');
  for (const forbidden of ['business_id', 'salon_id', 'p_business_id', 'p_theme_uuid']) {
    assert.equal(Object.hasOwn(calls[0].args, forbidden), false);
  }

  // Custom / Other add keeps predefined_service_id NULL.
  const custom = await createSavedServiceWithClient(client, themeId, {
    categoryId,
    name: 'My Signature Ritual',
    description: 'House special',
    price: 900,
    duration: 60,
  });
  assert.equal(custom.predefinedServiceId, null);
  assert.equal(calls[1].args.p_predefined_service_id, null);

  // Client-side validation refuses obviously invalid input before any RPC.
  const before = calls.length;
  await assert.rejects(
    () => createSavedServiceWithClient(client, themeId, {
      categoryId, name: '  ', description: '', price: 10, duration: 10,
    }),
    /name is required/i,
  );
  await assert.rejects(
    () => createSavedServiceWithClient(client, themeId, {
      categoryId, name: 'X', description: '', price: -1, duration: 10,
    }),
    /price cannot be negative/i,
  );
  await assert.rejects(
    () => createSavedServiceWithClient(client, themeId, {
      categoryId, name: 'X', description: '', price: 10, duration: 0,
    }),
    /duration must be positive/i,
  );
  await assert.rejects(
    () => createSavedServiceWithClient(client, themeId, {
      categoryId: '', name: 'X', description: '', price: 10, duration: 10,
    }),
    /category/i,
  );
  assert.equal(calls.length, before);
});

await test('Phase 8.1 — price/duration/description/status edits keep relationships intact', async () => {
  const calls = [];
  const saved = makeSaved(serviceA, 1);
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'update_saved_service') {
        return {
          data: {
            ...saved,
            name: args.p_name ?? saved.name,
            description: args.p_description ?? saved.description,
            price_paise: args.p_price_paise ?? saved.price_paise,
            duration_minutes: args.p_duration_minutes ?? saved.duration_minutes,
            status: args.p_status ?? saved.status,
          },
          error: null,
        };
      }
      if (name === 'set_saved_service_status') {
        return { data: { ...saved, status: args.p_status }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  // Price only — every other field is sent as null so the DB keeps it.
  const priced = await updateSavedServiceWithClient(client, themeId, saved.id, { price: 1999 });
  assert.equal(priced.price, 1999);
  assert.deepEqual(calls[0].args, {
    p_service_id: saved.id,
    p_name: null,
    p_description: null,
    p_price_paise: 199900,
    p_duration_minutes: null,
    p_status: null,
  });

  // Duration only.
  await updateSavedServiceWithClient(client, themeId, saved.id, { duration: 75 });
  assert.equal(calls[1].args.p_duration_minutes, 75);
  assert.equal(calls[1].args.p_price_paise, null);

  // Description only.
  await updateSavedServiceWithClient(client, themeId, saved.id, { description: 'New copy' });
  assert.equal(calls[2].args.p_description, 'New copy');
  assert.equal(calls[2].args.p_name, null);

  // Status change.
  const archived = await setSavedServiceStatusWithClient(client, themeId, saved.id, 'archived');
  assert.equal(archived.status, 'archived');
  assert.equal(archived.predefinedServiceId, saved.predefined_service_id);
  assert.equal(archived.themeId, saved.theme_id);
  assert.equal(archived.categoryId, saved.category_id);

  // No management call may ever carry a relationship or tenant column.
  for (const call of calls) {
    for (const forbidden of [
      'business_id', 'theme_id', 'category_id', 'predefined_service_id',
      'p_business_id', 'p_theme_id', 'p_category_id', 'p_predefined_service_id',
    ]) {
      assert.equal(Object.hasOwn(call.args, forbidden), false,
        `${call.name} must not send ${forbidden}`);
    }
  }

  // Invalid edits never reach the database.
  const before = calls.length;
  await assert.rejects(
    () => updateSavedServiceWithClient(client, themeId, saved.id, { price: -5 }),
    /price cannot be negative/i,
  );
  await assert.rejects(
    () => updateSavedServiceWithClient(client, themeId, saved.id, { duration: -1 }),
    /duration must be positive/i,
  );
  await assert.rejects(
    () => updateSavedServiceWithClient(client, themeId, saved.id, { name: '   ' }),
    /name is required/i,
  );
  assert.equal(calls.length, before);
});

await test('Phase 8.1 — custom services survive load/edit with NULL provenance', async () => {
  const custom = { ...makeSaved(serviceA, 3), predefined_service_id: null, name: 'House Ritual' };
  const client = {
    rpc: async (name, args) => {
      if (name === 'get_saved_services_for_theme') {
        return {
          data: { business_id: custom.business_id, theme_id: themeId, services: [custom] },
          error: null,
        };
      }
      if (name === 'update_saved_service') {
        return {
          data: { ...custom, price_paise: args.p_price_paise ?? custom.price_paise },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  const [loaded] = await loadSavedServicesForThemeWithClient(client, themeId);
  assert.equal(loaded.predefinedServiceId, null);
  assert.equal(loaded.themeKey, themeId);
  assert.equal(loaded.categoryId, custom.category_id);

  const repriced = await updateSavedServiceWithClient(client, themeId, custom.id, { price: 500 });
  assert.equal(repriced.predefinedServiceId, null, 'a custom service must never gain a predefined link');
  assert.equal(repriced.price, 500);
});

await test('Phase 8.1 — delete targets only the salon saved row across all five themes', async () => {
  const themes = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ];

  for (const theme of themes) {
    const calls = [];
    const saved = { ...makeSaved(serviceA, 1), theme_key: theme };
    const client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'get_saved_services_for_theme') {
          return {
            data: { business_id: saved.business_id, theme_id: theme, services: [saved] },
            error: null,
          };
        }
        if (name === 'delete_saved_service') return { data: args.p_service_id, error: null };
        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const [loaded] = await loadSavedServicesForThemeWithClient(client, theme);
    assert.equal(loaded.themeKey, theme);
    assert.equal(await deleteSavedServiceWithClient(client, saved.id), saved.id);

    const deleteCall = calls.find((call) => call.name === 'delete_saved_service');
    assert.deepEqual(Object.keys(deleteCall.args), ['p_service_id']);
    // No client path can ever address a global catalog table.
    for (const call of calls) {
      assert.equal(/theme|categor|predefined/i.test(call.name) && call.name.startsWith('delete'), false);
    }
  }

  // A mismatched delete acknowledgement fails closed.
  await assert.rejects(
    () => deleteSavedServiceWithClient(
      { rpc: async () => ({ data: 'another-id', error: null }) },
      '20000000-0000-4000-8000-000000000001',
    ),
    /deleted a different service/i,
  );
});

await test('Phase 8.1 — StepServices wires the full management workflow', async () => {
  const source = await readFile('src/screens/StepServices.tsx', 'utf8');

  // Add / edit / delete / activate / status entry points exist.
  assert.ok(source.includes('createSavedService('));
  assert.ok(source.includes('updateSavedService('));
  assert.ok(source.includes('setSavedServiceStatus('));
  assert.ok(source.includes('deleteSavedService('));
  assert.ok(source.includes('handleUpdateServicePrice'));
  assert.ok(source.includes('handleUpdateServiceDuration'));
  assert.ok(source.includes('handleUpdateServiceDescription'));
  assert.ok(source.includes('handleChangeServiceStatus'));
  assert.ok(source.includes('handleToggleSavedService'));

  // Add Service resolves a real category UUID for the current theme and only
  // keeps a predefined link when the picked row matches that category.
  assert.ok(source.includes('const categoryId = categoryIdOf(newServiceCategory)'));
  assert.ok(source.includes('service.categoryId === categoryId'));
  assert.ok(source.includes('const predefinedServiceId = customService ? null : (predefinedMatch?.id ?? null)'));

  // Custom / Other keeps NULL provenance everywhere.
  assert.ok(source.includes('setNewServicePredefinedId(null)'));
  assert.ok(source.includes('predefinedServiceId: null'));

  // Duplicate prevention exists before the request is issued.
  assert.ok(source.includes('already saved for your salon'));

  // No UI path can send relationship columns through an edit.
  const editBlock = source.slice(
    source.indexOf('const applySavedServiceChanges'),
    source.indexOf('const handleDeleteService'),
  );
  for (const forbidden of ['themeId:', 'categoryId:', 'predefinedServiceId:', 'businessId:']) {
    assert.equal(editBlock.includes(forbidden), false, `edit path must not send ${forbidden}`);
  }

  // Delete asks for confirmation and never references global catalog tables.
  assert.ok(source.includes('pendingDeleteServiceId'));
  assert.ok(/predefined service stays available/i.test(source));
  for (const globalTable of ['delete_theme', 'delete_service_category', 'delete_predefined_service']) {
    assert.equal(source.includes(globalTable), false);
  }
});

await test('Phase 8.2 — database errors are surfaced without leaking internals', async () => {
  // A raw PostgreSQL fault must NOT reach the UI verbatim.
  const leaky = {
    rpc: async () => ({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "idx_services_business_predefined_unique" DETAIL: Key (business_id, predefined_service_id)=(...) already exists.',
      },
    }),
  };
  await assert.rejects(
    () => loadSavedServicesForThemeWithClient(leaky, themeId),
    (error) => {
      assert.equal(/unique constraint|idx_services|DETAIL|Key \(/.test(error.message), false,
        'raw database internals must not be shown to the user');
      assert.match(error.message, /unable to load saved services/i);
      return true;
    },
  );

  // Messages we deliberately authored ARE preserved, so the user gets guidance.
  const intentional = [
    ['Please log in to manage services.', /log in/i],
    ['Service was not found for your salon.', /not found for your salon/i],
    ['This service is already saved for your salon.', /already saved/i],
    ['The selected category does not belong to this theme.', /category does not belong/i],
    ['No active service catalog exists for this theme.', /no active service catalog/i],
    ['Remove this service from its package before deleting it.', /remove this service from its package/i],
  ];
  for (const [message, pattern] of intentional) {
    await assert.rejects(
      () => loadSavedServicesForThemeWithClient(
        { rpc: async () => ({ data: null, error: { message } }) }, themeId),
      pattern,
    );
  }
});

await test('Phase 8.2 — cross-tenant/cross-theme responses are rejected client-side too', async () => {
  const foreign = { ...makeSaved(serviceA, 1), business_id: '30000000-0000-4000-8000-000000000099' };
  await assert.rejects(
    () => loadSavedServicesForThemeWithClient({
      rpc: async () => ({
        data: { business_id: '30000000-0000-4000-8000-000000000001', theme_id: themeId, services: [foreign] },
        error: null,
      }),
    }, themeId),
    /different salon/i,
  );

  const crossTheme = { ...makeSaved(serviceA, 1), theme_key: 'nail_lash_studio' };
  await assert.rejects(
    () => loadSavedServicesForThemeWithClient({
      rpc: async () => ({
        data: { business_id: crossTheme.business_id, theme_id: themeId, services: [crossTheme] },
        error: null,
      }),
    }, themeId),
    /cross-theme/i,
  );

  // A response for a different theme entirely is refused.
  await assert.rejects(
    () => loadSavedServicesForThemeWithClient({
      rpc: async () => ({
        data: { business_id: crossTheme.business_id, theme_id: 'beauty_skin_spa', services: [] },
        error: null,
      }),
    }, themeId),
    /different theme/i,
  );
});

await test('Phase 8.2 — StepServices renders every required state', async () => {
  const source = await readFile('src/screens/StepServices.tsx', 'utf8');

  // Loading states.
  assert.ok(source.includes('Loading services…'));
  assert.ok(source.includes('Loading saved services…'));
  assert.ok(source.includes('savedServicesLoading'));
  assert.ok(source.includes('currentCatalogLoading'));

  // Empty state, gated on the loaded theme so it cannot flash mid-load.
  assert.ok(source.includes('No services yet'));
  assert.ok(source.includes('showSavedServices && !savedServicesError && data.services.length === 0'));
  assert.ok(source.includes('No suggested services in this category.'));

  // Error states + retry affordance.
  assert.ok(source.includes('reloadSavedServices'));
  assert.ok(source.includes('Try again'));
  assert.ok(source.includes('role="alert"'));
  assert.ok(source.includes('addServiceError'));
  assert.ok(source.includes('saveSelectedError'));
  assert.ok(source.includes('savedServicesError'));

  // Inactive/archived service states.
  assert.ok(source.includes('Inactive'));
  assert.ok(source.includes('Archived'));

  // Stale-theme protection: the list is identity-gated, and a failed load
  // deliberately leaves the gate closed.
  assert.ok(source.includes('const showSavedServices = savedStatusTheme === theme'));
  assert.ok(source.includes('setSavedStatusTheme(null)'));
  const loadBlock = source.slice(
    source.indexOf('const runSavedServicesLoad'),
    source.indexOf('const reloadSavedServices'),
  );
  assert.ok(
    loadBlock.includes('services: [], packages: [], offers: [] }'),
    'must clear service and commerce rows before loading a new theme',
  );
  assert.ok(loadBlock.includes('savedLoadRequestRef.current !== requestId'),
    'must ignore late responses from a previous theme');
});

console.log(`Service saving tests: ${passed}/14 passed`);
