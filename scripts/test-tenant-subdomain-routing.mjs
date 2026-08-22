/**
 * Tenant subdomain & custom-domain routing tests (offline).
 *
 * Covers the host classifier (`tenantHost.ts`) and the offline/static route
 * resolution (`publicSalonLookup.ts`), plus a mocked PostgREST pass for the
 * subdomain/custom_domain database lookup tiers. No live Supabase needed.
 */
import assert from 'node:assert/strict';

// Configure a fake Supabase project BEFORE the Supabase-dependent modules are
// evaluated (supabaseClient.ts snapshots the env at module-evaluation time, so
// the import below must be dynamic — static imports are hoisted first).
process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'fake-anon-key';

const { resolveTenantHost, tenantKeyFromHost, normalizeHost, SYSTEM_SUBDOMAINS } = await import('../src/lib/tenantHost.ts');
const { resolveLocalOrStaticSalonRouteSlug } = await import('../src/lib/publicSalonLookup.ts');

const BASE = 'nexora.site';

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

// ---- Host classification ----------------------------------------------------
await test('apex domain has no tenant', () => {
  const info = resolveTenantHost('nexora.site', BASE);
  assert.equal(info.subdomain, null);
  assert.equal(info.customDomain, null);
});

await test('www is a system subdomain (apex)', () => {
  const info = resolveTenantHost('www.nexora.site', BASE);
  assert.equal(info.subdomain, null);
  assert.equal(info.customDomain, null);
});

await test('app/api/admin are system subdomains', () => {
  for (const label of ['app', 'api', 'admin']) {
    assert.equal(resolveTenantHost(`${label}.nexora.site`, BASE).subdomain, null, label);
  }
});

await test('tenant subdomain is extracted', () => {
  const info = resolveTenantHost('royal-hair-studio.nexora.site', BASE);
  assert.equal(info.subdomain, 'royal-hair-studio');
  assert.equal(info.customDomain, null);
});

await test('multi-label subdomain is preserved', () => {
  const info = resolveTenantHost('royal.hair.studio.nexora.site', BASE);
  assert.equal(info.subdomain, 'royal.hair.studio');
});

await test('custom domain is captured whole', () => {
  const info = resolveTenantHost('royalhairstudio.in', BASE);
  assert.equal(info.subdomain, null);
  assert.equal(info.customDomain, 'royalhairstudio.in');
});

await test('host is normalized (case, port, trailing dot)', () => {
  assert.equal(normalizeHost('Royal-Hair-Studio.Nexora.Site:3000'), 'royal-hair-studio.nexora.site');
  assert.equal(resolveTenantHost('ROYAL-HAIR-STUDIO.nexora.site.', BASE).subdomain, 'royal-hair-studio');
});

await test('localhost and IPs have no tenant', () => {
  assert.equal(resolveTenantHost('localhost', BASE).subdomain, null);
  assert.equal(resolveTenantHost('127.0.0.1', BASE).subdomain, null);
  assert.equal(resolveTenantHost('192.168.1.10', BASE).subdomain, null);
  assert.equal(resolveTenantHost('::1', BASE).subdomain, null);
});

await test('*.localhost behaves like a wildcard subdomain in dev', () => {
  assert.equal(resolveTenantHost('royal-hair-studio.localhost', BASE).subdomain, 'royal-hair-studio');
  assert.equal(resolveTenantHost('royal-hair-studio.local', BASE).subdomain, 'royal-hair-studio');
});

await test('system subdomain set contains the reserved labels', () => {
  for (const label of ['www', 'app', 'api', 'admin', 'dashboard', 'builder', 'docs', 'assets', 'static']) {
    assert.ok(SYSTEM_SUBDOMAINS.has(label), label);
  }
});

await test('tenantKeyFromHost convenience helper', () => {
  assert.equal(tenantKeyFromHost('royal-hair-studio.nexora.site', BASE), 'royal-hair-studio');
  assert.equal(tenantKeyFromHost('royalhairstudio.in', BASE), 'royalhairstudio.in');
  assert.equal(tenantKeyFromHost('nexora.site', BASE), null);
});

// ---- Offline/static resolution ---------------------------------------------
await test('subdomain resolves to static seed salon offline', () => {
  const slug = resolveLocalOrStaticSalonRouteSlug({
    hostname: 'royal-hair-studio.nexora.site',
    pathSlug: '',
    baseDomain: BASE,
  });
  assert.equal(slug, 'royal-hair-studio');
});

await test('unknown subdomain falls back to path slug offline', () => {
  assert.equal(resolveLocalOrStaticSalonRouteSlug({ hostname: 'unknown.nexora.site', pathSlug: 'royal-hair-studio', baseDomain: BASE }), 'royal-hair-studio');
  assert.equal(resolveLocalOrStaticSalonRouteSlug({ hostname: 'unknown.nexora.site', pathSlug: '', baseDomain: BASE }), null);
});

// ---- Backend lookup tiers (mocked PostgREST) -------------------------------
await test('database resolves tenant by subdomain, then custom domain', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers({ 'content-type': 'application/json' }) });
    const parsed = new URL(u);
    if (!parsed.pathname.includes('/salon_public_websites')) return json([]);
    const filter = parsed.search;
    if (filter.includes('subdomain')) {
      return json(filter.includes('royal-hair-studio') ? [{ slug: 'royal-hair-studio' }] : []);
    }
    if (filter.includes('custom_domain')) {
      return json(filter.includes('glowup.in') ? [{ slug: 'glow-up' }] : []);
    }
    return json([]);
  };

  const { resolvePublishedSalonByHost, resolveSalonRouteSlug } = await import('../src/lib/publicSalonLookup.ts');

  const bySubdomain = await resolvePublishedSalonByHost('royal-hair-studio.nexora.site', BASE);
  assert.ok(bySubdomain, 'subdomain resolves');
  assert.equal(bySubdomain.slug, 'royal-hair-studio');
  assert.equal(bySubdomain.source, 'subdomain');

  const byCustomDomain = await resolvePublishedSalonByHost('glowup.in', BASE);
  assert.ok(byCustomDomain, 'custom domain resolves');
  assert.equal(byCustomDomain.slug, 'glow-up');
  assert.equal(byCustomDomain.source, 'custom_domain');

  // Host (subdomain) takes priority over the path slug.
  const priority = await resolveSalonRouteSlug({ hostname: 'royal-hair-studio.nexora.site', pathSlug: 'some-other-slug', baseDomain: BASE });
  assert.equal(priority.slug, 'royal-hair-studio');
  assert.equal(priority.source, 'subdomain');

  // Apex host falls through to path slug lookup.
  assert.ok(calls.some((c) => c.includes('subdomain=eq.royal-hair-studio')), 'subdomain eq filter used');
  console.log(`    (PostgREST calls: ${calls.length})`);
});

await test('database lookup degrades when subdomain columns are missing (pre-M41)', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ message: 'Could not find the column subdomain', code: 'PGRST204' }),
    text: async () => 'error',
    headers: new Headers({ 'content-type': 'application/json' }),
  });

  const { resolvePublishedSalonByHost } = await import('../src/lib/publicSalonLookup.ts');
  const result = await resolvePublishedSalonByHost('royal-hair-studio.nexora.site', BASE);
  assert.equal(result, null, 'missing column falls back to null (no throw)');
});

console.log(`\nTenant subdomain routing: ${passed}/${passed} passed`);
