/** Phase 9.1 real-database acceptance: five-theme offers/prices/bundles. */
import assert from 'node:assert/strict';
import { createHarness, createRunner, IDS, THEMES } from './lib/acceptance-harness.mjs';

const harness = await createHarness({ seedLegacyCustom: true });
const runner = createRunner('Phase 9.1 acceptance');
harness.signIn(IDS.ownerA);

const { fetchThemeServiceCatalog } = await import('../src/lib/themeCatalogService.ts');
const { supabase } = await import('../src/lib/supabaseClient.ts');
const {
  createSavedService,
  savePredefinedServices,
} = await import('../src/lib/savedServiceService.ts');
const {
  createServiceBundle,
  createServiceOffer,
  loadThemeCommerce,
  savePricingVariant,
  setServiceOfferActive,
  setServicePromotionalBadge,
} = await import('../src/lib/pricingPromotionService.ts');
const { isOfferActive } = await import('../src/lib/pricing.ts');

assert.ok(supabase, 'real Supabase client was not configured');
const dateKey = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const records = new Map();
const targetTypes = ['theme', 'category', 'predefined_service', 'saved_service', 'bundle'];

for (let index = 0; index < THEMES.length; index += 1) {
  const theme = THEMES[index];
  runner.section(theme.label);

  await runner.test('variants, badge, bundle and offer persist under the exact theme', async () => {
    const catalog = await fetchThemeServiceCatalog(supabase, theme.id);
    const selected = catalog.predefinedServices.slice(0, 3);
    const savedResult = await savePredefinedServices(theme.id, selected.map((service) => service.id));
    const services = savedResult.services;
    assert.equal(services.length, 3);

    const before = await harness.admin(
      `select theme_id, category_id, predefined_service_id, price_paise
       from public.services where id=$1`, [services[0].id]);

    await savePricingVariant(theme.id, {
      serviceId: services[0].id,
      name: index % 2 === 0 ? 'Premium' : 'Senior Stylist',
      price: services[0].price + 250,
      duration: services[0].duration + 10,
      status: 'active',
    });
    await setServicePromotionalBadge(services[0].id, index === 4 ? 'New' : 'Best Seller');

    const bundleId = await createServiceBundle(theme.id, {
      categoryId: catalog.categories[0].id,
      name: `${theme.label} Signature Combo`,
      description: 'Three theme-safe services with preserved individual prices.',
      serviceIds: services.map((service) => service.id),
      discountType: 'percentage',
      discountValue: 20,
      promotionalBadge: '20% OFF',
      status: 'active',
    });

    let custom;
    if (targetTypes[index] === 'saved_service') {
      custom = await createSavedService(theme.id, {
        categoryId: catalog.categories[0].id,
        name: `${theme.label} Custom Seasonal Ritual`,
        description: 'A custom service used only by this theme.',
        price: 999,
        duration: 45,
        predefinedServiceId: null,
        status: 'active',
      });
    }

    const targetType = targetTypes[index];
    const offerId = await createServiceOffer(theme.id, {
      targetType,
      categoryId: targetType === 'category' ? catalog.categories[0].id : null,
      predefinedServiceId: targetType === 'predefined_service' ? selected[0].id : null,
      savedServiceId: targetType === 'saved_service' ? custom.id : null,
      packageId: targetType === 'bundle' ? bundleId : null,
      title: `${theme.label} Festive Special`,
      promotionalBadge: index % 2 === 0 ? 'Festive Special' : 'Limited Time',
      discountType: index % 2 === 0 ? 'percentage' : 'fixed',
      discountValue: index % 2 === 0 ? 15 : 100,
      startDate: dateKey(-1),
      endDate: dateKey(20),
      status: 'active',
    });

    const commerce = await loadThemeCommerce(theme.id);
    assert.equal(commerce.themeId, theme.id);
    assert.equal(commerce.variants.length, 1);
    assert.equal(commerce.variants[0].serviceId, services[0].id);
    assert.equal(commerce.serviceBadges.get(services[0].id), index === 4 ? 'New' : 'Best Seller');
    assert.equal(commerce.bundles.length, 1);
    assert.equal(commerce.bundles[0].id, bundleId);
    assert.equal(commerce.bundles[0].includedServices.length, 3);
    const subtotal = services.reduce((sum, service) => sum + service.price, 0);
    assert.equal(commerce.bundles[0].originalPrice, subtotal);
    assert.equal(commerce.bundles[0].price, Math.round(subtotal * 0.8 * 100) / 100);
    assert.equal(commerce.offers.length, 1);
    assert.equal(commerce.offers[0].id, offerId);
    assert.equal(commerce.offers[0].targetType, targetType);
    assert.equal(commerce.offers[0].effectiveStatus, 'active');
    assert.equal(isOfferActive(commerce.offers[0]), true);

    const after = await harness.admin(
      `select theme_id, category_id, predefined_service_id, price_paise
       from public.services where id=$1`, [services[0].id]);
    assert.deepEqual(after.rows, before.rows, 'variant must not overwrite base service/provenance');

    const integrity = await harness.admin(
      `select
         count(*)::int as item_count,
         bool_and(s.theme_id=p.theme_id) as same_theme,
         bool_and(s.business_id=p.business_id) as same_tenant,
         bool_and(ps.individual_price_paise=s.price_paise) as snapshots_match
       from public.packages p
       join public.package_services ps on ps.package_id=p.id
       join public.services s on s.id=ps.service_id
       where p.id=$1 group by p.id`, [bundleId]);
    assert.deepEqual(integrity.rows[0], {
      item_count: 3, same_theme: true, same_tenant: true, snapshots_match: true,
    });

    records.set(theme.id, { catalog, services, bundleId, offerId });
  });
}

runner.section('Expiration and isolation');
await runner.test('past end date is automatically returned as expired and never active', async () => {
  const theme = THEMES[0];
  await createServiceOffer(theme.id, {
    targetType: 'theme',
    title: 'Ended Wedding Season Offer',
    promotionalBadge: 'Limited Time',
    discountType: 'percentage',
    discountValue: 10,
    startDate: dateKey(-10),
    endDate: dateKey(-1),
    status: 'active',
  });
  const commerce = await loadThemeCommerce(theme.id);
  const expired = commerce.offers.find((offer) => offer.title === 'Ended Wedding Season Offer');
  assert.ok(expired);
  assert.equal(expired.effectiveStatus, 'expired');
  assert.equal(isOfferActive(expired), false);
});

await runner.test('cross-theme bundle composition is rejected atomically', async () => {
  const barber = records.get(THEMES[0].id);
  const nail = records.get(THEMES[4].id);
  await assert.rejects(
    () => createServiceBundle(THEMES[0].id, {
      categoryId: barber.catalog.categories[0].id,
      name: 'Invalid Mixed Theme Bundle',
      description: 'Must never persist.',
      serviceIds: [barber.services[0].id, nail.services[0].id],
      discountType: 'percentage', discountValue: 10, status: 'active',
    }),
    /do not belong to the active theme/i,
  );
  const count = await harness.admin("select count(*)::int c from public.packages where name='Invalid Mixed Theme Bundle'");
  assert.equal(count.rows[0].c, 0);
});

await runner.test('another tenant cannot read or change owner A commerce', async () => {
  const barber = records.get(THEMES[0].id);
  harness.signIn(IDS.ownerB);
  const empty = await loadThemeCommerce(THEMES[0].id);
  assert.equal(empty.variants.length, 0);
  assert.equal(empty.bundles.length, 0);
  assert.equal(empty.offers.length, 0);
  await assert.rejects(() => setServiceOfferActive(barber.offerId, false), /not found for your salon/i);
  harness.signIn(IDS.ownerA);
  const ownerView = await loadThemeCommerce(THEMES[0].id);
  assert.equal(ownerView.offers.find((offer) => offer.id === barber.offerId)?.status, 'active');
});

await runner.test('pre-existing services were not deleted or re-linked', async () => {
  const legacy = await harness.admin(
    `select id, name, theme_id, category_id, predefined_service_id, price_paise
     from public.services where id=$1`, [IDS.legacyCustomA]);
  assert.deepEqual(legacy.rows[0], {
    id: IDS.legacyCustomA,
    name: 'Legacy Manual Service',
    theme_id: null,
    category_id: null,
    predefined_service_id: null,
    price_paise: 88000,
  });
});

const result = runner.summary();
await harness.close();
if (result.failed) process.exitCode = 1;
