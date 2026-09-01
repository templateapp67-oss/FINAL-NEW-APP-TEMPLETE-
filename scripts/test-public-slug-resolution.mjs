/**
 * PUBLIC SLUG RESOLUTION — regression coverage for the live
 * `https://final-new-app-templete.vercel.app/arts-by-uma` "Salon Not Found".
 *
 * Live audit (project qwaehqsmodekbgvnaavz, anonymous REST):
 *   * `get_public_salon_website(p_slug)` did not exist (PGRST202), so the SPA
 *     silently ran the compatibility path that reads `salon_public_websites`
 *     directly — which only worked because `anon` still had a raw select
 *     grant on the whole owner config (email included).
 *   * `salon_public_websites` contained NO `arts-by-uma` row: the tenant rows
 *     were still on their provisioning placeholder slugs (`my-salon-N`,
 *     `salon-<uuid>`), unpublished, with an empty config.
 *
 * This suite locks in both halves of the fix:
 *   A. M70 SQL — canonical resolver gates + placeholder→business slug repair,
 *      executed for real in PGlite.
 *   B. Client — ONE canonical slug normaliser + ONE resolver shared by
 *      RootRouter and PublicSalonView, and an RPC/network failure that can
 *      never be reported as "Salon Not Found".
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const {
  canonicalPublicSlug,
  resolvePublicSalonWebsiteResult,
} = await import('../src/lib/publicSalonResolver.ts');

/* ------------------------------------------------------------------ */
/* A. Database — M70 applied for real                                  */
/* ------------------------------------------------------------------ */

const migration = await read('supabase/migrations/20260902000101_m70_public_slug_resolution_repair.sql');
const db = new PGlite({ extensions: { pgcrypto } });

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.salons (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text unique,
    address text,
    city text,
    is_active boolean not null default true,
    deleted_at timestamptz
  );
  create table public.themes (
    theme_id text primary key,
    is_active boolean not null default true
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id),
    slug text not null unique,
    template_key text not null,
    is_published boolean not null default false,
    published_at timestamptz,
    config jsonb not null default '{}'::jsonb
  );
  grant select on table public.salon_public_websites to anon;

  insert into public.themes (theme_id, is_active) values
    ('hair_studio_color_bar', true),
    ('barber_mens_grooming', true),
    ('retired_theme', false);

  insert into public.salons (id, name, slug, address, city) values
    ('c3d45232-4519-4106-9d76-4814df9cc626', 'Arts By Uma', null, '12 MG Road', 'Bengaluru'),
    ('ab709ae2-f49c-47d5-a9af-c69db8c9b440', 'Other Tenant Salon', 'other-tenant-salon', '9 Park St', 'Kolkata'),
    ('11111111-1111-4111-8111-111111111111', 'Closed Salon', null, null, null),
    ('22222222-2222-4222-8222-222222222222', 'Deleted Salon', null, null, null),
    ('33333333-3333-4333-8333-333333333333', 'Retired Theme Salon', null, null, null),
    ('44444444-4444-4444-8444-444444444444', 'Draft Only Salon', null, null, null);

  update public.salons set is_active = false where name = 'Closed Salon';
  update public.salons set deleted_at = now() where name = 'Deleted Salon';

  -- The real live shape: a placeholder slug on an owner-published website.
  insert into public.salon_public_websites (salon_id, slug, template_key, is_published, published_at, config) values
    ('c3d45232-4519-4106-9d76-4814df9cc626', 'my-salon-3', 'hair_studio_color_bar', true, now(),
      '{"tagline":"Bridal & colour specialists","email":"uma@example.com","contactOptions":{"callNow":true},"phone":"+919876543210","logoUrl":"javascript:alert(1)","gallery":[{"id":"g1","url":"https://cdn.example.com/a.jpg"},{"id":"g2","url":"https://cdn.example.com/b.jpg","moderation":"rejected"}]}'::jsonb),
    ('ab709ae2-f49c-47d5-a9af-c69db8c9b440', 'other-tenant-salon', 'barber_mens_grooming', true, now(),
      '{"tagline":"Not Uma"}'::jsonb),
    ('11111111-1111-4111-8111-111111111111', 'closed-salon', 'barber_mens_grooming', true, now(), '{}'::jsonb),
    ('22222222-2222-4222-8222-222222222222', 'deleted-salon', 'barber_mens_grooming', true, now(), '{}'::jsonb),
    ('33333333-3333-4333-8333-333333333333', 'retired-theme-salon', 'retired_theme', true, now(), '{}'::jsonb),
    ('44444444-4444-4444-8444-444444444444', 'my-salon-9', 'barber_mens_grooming', false, null, '{}'::jsonb);
`);

await db.exec(migration);
// Idempotency: a second application must not fail or change anything again.
await db.exec(migration);

const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

const uma = await rows('select slug from public.salon_public_websites where salon_id = $1', ['c3d45232-4519-4106-9d76-4814df9cc626']);
assert.equal(uma[0].slug, 'arts-by-uma');
const umaSalon = await rows('select slug from public.salons where id = $1', ['c3d45232-4519-4106-9d76-4814df9cc626']);
assert.equal(umaSalon[0].slug, 'arts-by-uma');
ok('"Arts By Uma" placeholder slug is repaired to arts-by-uma on BOTH salons and salon_public_websites');

const draft = await rows("select slug, is_published, published_at from public.salon_public_websites where salon_id = '44444444-4444-4444-8444-444444444444'");
assert.equal(draft[0].is_published, false);
assert.equal(draft[0].published_at, null);
assert.equal(draft[0].slug, 'draft-only-salon');
ok('slug repair never publishes a site the owner has not published');

const found = await rows("select * from public.get_public_salon_website('arts-by-uma')");
assert.equal(found.length, 1, 'exactly one tenant');
assert.equal(found[0].business_name, 'Arts By Uma');
assert.equal(found[0].salon_id, 'c3d45232-4519-4106-9d76-4814df9cc626');
assert.equal(found[0].template_key, 'hair_studio_color_bar');
ok('/arts-by-uma resolves to exactly one correct published tenant');

const mixed = await rows("select slug from public.get_public_salon_website('  Arts-By-Uma  ')");
assert.equal(mixed.length, 1);
assert.equal(mixed[0].slug, 'arts-by-uma');
ok('mixed-case / whitespace-padded slug resolves to the same tenant');

assert.equal(found[0].public_config.email, undefined, 'email must never be projected');
assert.equal(found[0].public_config.logoUrl, undefined, 'unsafe javascript: URL must never be projected');
assert.equal(found[0].public_config.gallery.length, 1, 'rejected gallery items must never be projected');
assert.equal(found[0].public_config.phone, '+919876543210');
ok('the projection is field-limited: no email, no unsafe media, no rejected gallery items');

for (const [slug, why] of [
  ['my-salon-9', 'unpublished'],
  ['draft-only-salon', 'unpublished'],
  ['closed-salon', 'inactive salon'],
  ['deleted-salon', 'soft-deleted salon'],
  ['retired-theme-salon', 'inactive template'],
  ['no-such-salon', 'unknown slug'],
]) {
  const result = await rows('select * from public.get_public_salon_website($1)', [slug]);
  assert.equal(result.length, 0, `${slug} (${why}) must not resolve`);
}
ok('unpublished, inactive, deleted, inactive-template and unknown slugs all fail closed');

const other = await rows("select salon_id, business_name from public.get_public_salon_website('other-tenant-salon')");
assert.equal(other.length, 1);
assert.notEqual(other[0].salon_id, 'c3d45232-4519-4106-9d76-4814df9cc626');
assert.equal(other[0].business_name, 'Other Tenant Salon');
ok('tenant isolation: each slug returns only its own business');

const anonGrant = await rows(`
  select count(*)::int as n from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'salon_public_websites'
    and grantee = 'anon' and privilege_type = 'SELECT'
`);
assert.equal(anonGrant[0].n, 0);
const rpcGrant = await rows(`
  select count(*)::int as n from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'get_public_salon_website' and grantee = 'anon'
`);
assert.equal(rpcGrant[0].n >= 1, true);
ok('anonymous access goes through the field-limited RPC only — the raw owner table grant is revoked');

const diag = await rows("select * from public.verify_m70_public_slug_resolution('draft-only-salon')");
assert.equal(diag.find((row) => row.check_name === 'website row exists').ok, true);
assert.equal(diag.find((row) => row.check_name === 'website is published').ok, false);
const diagOk = await rows("select * from public.verify_m70_public_slug_resolution('arts-by-uma')");
assert.equal(diagOk.every((row) => row.ok), true);
ok('the M70 diagnostic reports the exact failing gate instead of a guess');

await db.close();

/* ------------------------------------------------------------------ */
/* B. Client — one normaliser, one resolver, honest failure modes      */
/* ------------------------------------------------------------------ */

assert.equal(canonicalPublicSlug('Arts By Uma'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/arts-by-uma'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/Arts-By-Uma/'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/ARTS-BY-UMA//'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/arts-by-uma?ref=NX-NEXORA-2026'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/Arts%20By%20Uma'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/arts-by-uma/team'), 'arts-by-uma');
assert.equal(canonicalPublicSlug('/'), '');
assert.equal(canonicalPublicSlug(''), '');
ok('one canonical normaliser: name, path, mixed case, trailing slash, query and encoding all map to arts-by-uma');

const projection = {
  salon_id: 'c3d45232-4519-4106-9d76-4814df9cc626',
  slug: 'arts-by-uma',
  template_key: 'hair_studio_color_bar',
  business_name: 'Arts By Uma',
  public_config: {},
  address: '',
  city: '',
};
const stubClient = (impl) => ({ rpc: async (...args) => impl(...args) });

const foundResult = await resolvePublicSalonWebsiteResult(
  stubClient(async (fn, params) => {
    assert.equal(fn, 'get_public_salon_website');
    assert.equal(params.p_slug, 'arts-by-uma');
    return { data: [projection], error: null };
  }),
  '/Arts-By-Uma/',
);
assert.equal(foundResult.status, 'found');
assert.equal(foundResult.website.business_name, 'Arts By Uma');
ok('the shared resolver normalises before querying and returns the published tenant');

const missing = await resolvePublicSalonWebsiteResult(
  stubClient(async () => ({ data: [], error: null })),
  'arts-by-uma',
);
assert.equal(missing.status, 'not-found');
assert.equal(missing.website, null);
ok('a database answer with no row is a genuine not-found (no default tenant)');

const failure = await resolvePublicSalonWebsiteResult(
  stubClient(async () => ({ data: null, error: { code: '42501', message: 'permission denied for table salon_public_websites' } })),
  'arts-by-uma',
);
assert.equal(failure.status, 'unavailable');
assert.equal(failure.website, null);
const offline = await resolvePublicSalonWebsiteResult(
  stubClient(async () => { throw new TypeError('Failed to fetch'); }),
  'arts-by-uma',
);
assert.equal(offline.status, 'unavailable');
ok('an RPC/permission/network failure is "unavailable" — never a false "Salon Not Found"');

/* ------------------------------------------------------------------ */
/* C. Routing wiring                                                   */
/* ------------------------------------------------------------------ */

const [main, publicView, routing, unavailable, vercel, resolverSource] = await Promise.all([
  read('src/main.tsx'),
  read('src/components/PublicSalonView.tsx'),
  read('src/lib/salonRouting.ts'),
  read('src/components/PublicSalonUnavailable.tsx'),
  read('vercel.json'),
  read('src/lib/publicSalonResolver.ts'),
]);

assert.match(routing, /return canonicalPublicSlug\(pathname\)/);
assert.match(main, /const normalizedPath = subdomainSlug \|\| normalizeRouteSlug\(pathname\)/);
assert.match(publicView, /const normalizedSlug = canonicalPublicSlug\(slug\)/);
assert.doesNotMatch(publicView, /slug\.trim\(\)\.toLowerCase\(\)/);
ok('RootRouter, PublicSalonView and the resolver share ONE slug normaliser');

assert.match(main, /resolvePublicSalonWebsiteResult\(supabase, normalizedPath\)/);
assert.match(main, /setResolvedSalon\(resolution\.website\)/);
assert.match(main, /<PublicSalonView slug=\{customDomainSlug \|\| normalizedPath\} resolved=\{resolvedSalon\} \/>/);
assert.match(publicView, /const website = preresolved \?\? await resolvePublicSalonWebsite\(client, slug\)/);
ok('the router hands its resolved tenant to the view — no duplicate slug lookup');

assert.match(main, /resolution\.status === 'unavailable'/);
assert.match(main, /setRoute\('salon_unavailable'\)/);
assert.match(main, /case 'salon_unavailable':/);
assert.match(unavailable, /Salon Temporarily Unavailable/);
assert.doesNotMatch(unavailable, /Salon Not Found/);
ok('a failed lookup renders "temporarily unavailable", not the 404 salon page');

assert.match(main, /extractSubdomainSlug\(window\.location\.hostname\)/);
assert.match(main, /resolveCustomDomainSalon\(supabase, host\)/);
ok('existing subdomain and verified custom-domain routing still resolve first');

const vercelConfig = JSON.parse(vercel);
assert.deepEqual(vercelConfig.rewrites, [{ source: '/((?!api/).*)', destination: '/index.html' }]);
assert.equal(vercelConfig.routes, undefined, 'Vercel rejects `routes` when `headers` are configured');
assert.ok(Array.isArray(vercelConfig.headers) && vercelConfig.headers.length > 0);
ok('Vercel serves index.html for every dynamic public path (SPA fallback) with headers still applied');

assert.match(resolverSource, /rpc\('get_public_salon_website', \{ p_slug: normalizedSlug \}\)/);
assert.doesNotMatch(resolverSource, /email:config->>email/);
assert.doesNotMatch(main, /matchesBrandFallbackSlug\(normalizedPath\)\) \{\n\s+setRoute\('public_salon'\);\n\s+\}/);
ok('anonymous resolution stays on the field-limited RPC and never falls back to a default tenant online');

console.log(`\nPublic slug resolution: ${passed}/${passed} checks PASS`);
