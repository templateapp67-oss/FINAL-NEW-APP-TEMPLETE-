/** Phase 9.3: booking safety, audit, integrity, and five-theme final validation. */
import assert from 'node:assert/strict';
import { createHarness, createRunner, IDS, THEMES } from './lib/acceptance-harness.mjs';
import { filterAndSortServices, serviceMatchesSearch } from '../src/lib/serviceSearch.ts';
import {
  isBrowserOffline,
  isStaleConnectivityState,
  networkErrorMessage,
  resetOnlineEventObservationForTests,
} from '../src/lib/offlineSync.ts';

const harness = await createHarness({ seedLegacyCustom: true });
const runner = createRunner('Phase 9.3 acceptance');
harness.signIn(IDS.ownerA);

const { fetchThemeServiceCatalog } = await import('../src/lib/themeCatalogService.ts');
const { supabase } = await import('../src/lib/supabaseClient.ts');
const {
  savePredefinedServices,
  createSavedService,
  deleteSavedService,
  setSavedServiceStatus,
  updateSavedService,
} = await import('../src/lib/savedServiceService.ts');
const {
  createServiceBundle,
  createServiceOffer,
  loadThemeCommerce,
  savePricingVariant,
} = await import('../src/lib/pricingPromotionService.ts');
const {
  archiveSavedService,
  checkThemeIntegrity,
  loadServiceSafetyLock,
  loadThemeServiceAudit,
} = await import('../src/lib/serviceSafetyService.ts');
const {
  searchThemeServices,
  upsertSavedServiceMedia,
  upsertSavedServiceTranslation,
} = await import('../src/lib/serviceContentService.ts');

assert.ok(supabase);
const records = new Map();

const insertUpcomingBooking = async (service) => {
  const customer = await harness.admin(
    `insert into public.customers (business_id, full_name, mobile)
     values ($1, 'Safety Guest', $2) returning id`,
    [IDS.businessA, `+9198${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`],
  );
  return harness.admin(
    `insert into public.bookings (
       business_id, customer_id, service_id, booking_reference,
       appointment_date, start_time, end_time, service_name_snapshot,
       service_price_paise, duration_minutes, advance_paise, remaining_paise,
       booking_status
     ) values (
       $1, $2, $3, $4, current_date + 2, '11:00', '12:00', $5,
       40000, 60, 10000, 30000, 'confirmed'
     ) returning id`,
    [IDS.businessA, customer.rows[0].id, service.id, `NXR-${service.id.slice(0, 8)}`, service.name],
  );
};

runner.section('Offline helpers');
await runner.test('offline detector and retry copy never invent a second save', async () => {
  assert.equal(isBrowserOffline(), false);
  assert.match(networkErrorMessage(new Error('Failed to fetch'), true), /offline/i);
  assert.match(networkErrorMessage(new Error('network timeout'), false), /Network error/i);
  // The stale-connectivity guard mirrors navigator.onLine: false offline,
  // false online, and only reports a stale window BEFORE the first observed
  // online event (test seam reset makes that deterministic).
  resetOnlineEventObservationForTests();
  assert.equal(isStaleConnectivityState(), false);
});

for (const theme of THEMES) {
  runner.section(theme.label);
  await runner.test('full advanced catalog + safety + audit stay theme-scoped', async () => {
    const catalog = await fetchThemeServiceCatalog(supabase, theme.id);
    assert.equal(catalog.theme.themeId, theme.id);
    assert.ok(catalog.categories.length > 0);
    assert.ok(catalog.predefinedServices.length > 0);
    assert.ok(catalog.categories[0].translations?.some((item) => item.locale === 'hi'));

    const picked = catalog.predefinedServices.slice(0, 3);
    const saved = await savePredefinedServices(theme.id, picked.map((service) => service.id));
    assert.equal(saved.themeId, theme.id);
    const repeat = await savePredefinedServices(theme.id, picked.map((service) => service.id));
    assert.equal(repeat.insertedCount, 0, 'retry must not duplicate Add Selected');

    const priced = await updateSavedService(theme.id, saved.services[0].id, { price: saved.services[0].price + 50 });
    assert.equal(priced.themeId, saved.services[0].themeId);
    await updateSavedService(theme.id, saved.services[0].id, { duration: saved.services[0].duration + 5 });
    await updateSavedService(theme.id, saved.services[0].id, { description: `${saved.services[0].description} (edited)` });

    await savePricingVariant(theme.id, {
      serviceId: saved.services[0].id,
      name: 'Premium',
      price: saved.services[0].price + 100,
      status: 'active',
    });
    const hi = catalog.predefinedServices[0].translations?.find((item) => item.locale === 'hi');
    await upsertSavedServiceTranslation(theme.id, saved.services[0].id, 'hi', hi?.name || 'सेवा', 'अनुवाद');
    await upsertSavedServiceMedia(theme.id, saved.services[0].id, 'icon', `https://cdn.example/${theme.id}/icon.png`);

    const custom = await createSavedService(theme.id, {
      categoryId: catalog.categories[0].id,
      name: `${theme.label} Safety Custom`,
      description: 'Custom row for lock testing',
      price: 700,
      duration: 40,
      predefinedServiceId: null,
      status: 'active',
    });

    const bundleId = await createServiceBundle(theme.id, {
      categoryId: catalog.categories[0].id,
      name: `${theme.label} Safety Combo`,
      description: 'Theme-safe combo',
      serviceIds: saved.services.map((service) => service.id),
      discountType: 'percentage',
      discountValue: 10,
      status: 'active',
    });
    await createServiceOffer(theme.id, {
      targetType: 'theme',
      title: `${theme.label} Safety Offer`,
      promotionalBadge: 'Limited Time',
      discountType: 'percentage',
      discountValue: 12,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'active',
    });

    const commerce = await loadThemeCommerce(theme.id);
    assert.equal(commerce.themeId, theme.id);
    assert.ok(commerce.bundles.some((bundle) => bundle.id === bundleId));
    assert.ok(commerce.offers.length >= 1);

    const filtered = filterAndSortServices(saved.services.map((service) => ({
      ...service, translations: service.translations,
    })), { search: saved.services[0].name.slice(0, 4), category: 'all', sort: 'price_asc', suggestedOnly: false, activeOnly: true }, 'en');
    assert.ok(filtered.length >= 1);
    assert.equal(serviceMatchesSearch(saved.services[0], saved.services[0].name, 'en'), true);
    const hits = await searchThemeServices(theme.id, saved.services[0].name);
    assert.ok(hits.every((hit) => hit.source === 'saved' || hit.source === 'predefined'));

    await insertUpcomingBooking(custom);
    const lock = await loadServiceSafetyLock(custom.id);
    assert.equal(lock.locked, true);
    assert.ok(lock.upcomingAppointments >= 1);
    await assert.rejects(() => deleteSavedService(custom.id), /upcoming appointment|active booking|archive/i);
    await assert.rejects(() => setSavedServiceStatus(theme.id, custom.id, 'inactive'), /upcoming appointment|active booking|archive/i);
    await archiveSavedService(custom.id);
    const stillThere = await harness.admin(
      `select status::text, name from public.services where id=$1`, [custom.id],
    );
    assert.equal(stillThere.rows[0].status, 'archived');
    const booking = await harness.admin(
      `select booking_status::text, service_name_snapshot from public.bookings where service_id=$1`,
      [custom.id],
    );
    assert.equal(booking.rows[0].booking_status, 'confirmed');
    assert.equal(booking.rows[0].service_name_snapshot, custom.name);

    const audit = await loadThemeServiceAudit(theme.id);
    assert.ok(audit.some((entry) => entry.action === 'service_created' || entry.action === 'service_price_changed'));
    const integrity = await checkThemeIntegrity(theme.id);
    assert.equal(integrity.ok, true);
    records.set(theme.id, { catalog, saved: saved.services, customId: custom.id });
  });
}

runner.section('Switching and isolation');
await runner.test('theme switching keeps each catalog isolated', async () => {
  for (const theme of THEMES) {
    const catalog = await fetchThemeServiceCatalog(supabase, theme.id);
    assert.equal(catalog.theme.themeId, theme.id);
    const other = THEMES.find((item) => item.id !== theme.id);
    const otherNames = new Set((await fetchThemeServiceCatalog(supabase, other.id)).predefinedServices.map((s) => s.id));
    catalog.predefinedServices.forEach((service) => {
      assert.equal(otherNames.has(service.id), false);
    });
  }
});

await runner.test('another tenant cannot read owner A audit or unlock a locked service', async () => {
  const barber = records.get(THEMES[0].id);
  harness.signIn(IDS.ownerB);
  await assert.rejects(() => deleteSavedService(barber.customId), /not found for your salon/i);
  const emptyAudit = await loadThemeServiceAudit(THEMES[0].id);
  assert.equal(emptyAudit.filter((entry) => entry.entityId === barber.saved[0].id).length, 0);
  harness.signIn(IDS.ownerA);
});

await runner.test('legacy custom service and appointments remain', async () => {
  const legacy = await harness.admin(
    `select id, theme_id, predefined_service_id from public.services where id=$1`,
    [IDS.legacyCustomA],
  );
  assert.deepEqual(legacy.rows[0], {
    id: IDS.legacyCustomA,
    theme_id: null,
    predefined_service_id: null,
  });
  const bookings = await harness.admin('select count(*)::int c from public.bookings where business_id=$1', [IDS.businessA]);
  assert.ok(bookings.rows[0].c >= THEMES.length);
});

const result = runner.summary();
await harness.close();
if (result.failed) process.exitCode = 1;
