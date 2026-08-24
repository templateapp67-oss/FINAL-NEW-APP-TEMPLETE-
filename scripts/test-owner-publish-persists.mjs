/**
 * Owner publish — REAL persistence proof.
 *
 * Runs the app's UNMODIFIED browser publish path (`publishOwnerSalonWebsite`
 * from `src/lib/salonWebsiteService.ts`) against a real PostgreSQL (PGlite)
 * with the canonical M38 → M39 → M44 migrations. The supabase-js HTTP layer
 * is bridged into SQL, so the same code the Publish button executes is what
 * is tested — nothing is stubbed in the application.
 *
 * Proves:
 *   1. Unpublishable drafts exist as is_published = false rows.
 *   2. The client Publish call returns is_published = true + published_at.
 *   3. The row is really persisted (is_published, published_at, template_key
 *      and the full owner config) in the database.
 *   4. The public projection (`get_public_salon_website`) is the only anon
 *      read surface; anon cannot SELECT the owner table.
 *   5. Republishing preserves the URL allocated by the first publish.
 *   6. `assertPublishReady` fails closed BEFORE any RPC for incomplete data.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const sqlOf = (file) => readFile(join(migrationDir, file), 'utf8');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
};

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---- Real PostgreSQL (PGlite) + canonical auth/storage bootstrap ----------
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null unique, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null, owner_id text,
    created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;

  -- Live-schema tables referenced by the M44 public projection / publish paths.
  create table if not exists public.business_locations (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    address_label text,
    approval_status text not null default 'approved',
    created_at timestamptz not null default now()
  );

  -- M44's publish function resolves the template through public.themes.
  create table if not exists public.themes (
    id uuid primary key default gen_random_uuid(),
    theme_id text not null unique,
    name text not null,
    slug text,
    is_active boolean not null default true
  );
  insert into public.themes (theme_id, name, slug) values
    ('barber_mens_grooming', 'Barber & Men''s Grooming', 'barber_mens_grooming'),
    ('hair_studio_color_bar', 'Hair Studio & Color Bar', 'hair_studio_color_bar'),
    ('beauty_skin_spa', 'Beauty, Skin & Spa', 'beauty_skin_spa'),
    ('family_full_service', 'Full-Service Family Salon', 'family_full_service'),
    ('nail_lash_studio', 'Nail & Lash Studio', 'nail_lash_studio')
  on conflict (theme_id) do nothing;
`);

await db.exec(await sqlOf('20260822000101_m38_reconciliation_fix.sql'));
await db.exec(await sqlOf('20260822000201_m39_owner_publish_website.sql'));
await db.exec(await sqlOf('20260824000101_m44_business_publishing.sql'));
await db.exec(await sqlOf('20260825000101_m50_publish_readiness_validation.sql'));

const selfTests = [
  (await db.query('select check_name, ok from public.verify_m39_owner_publish()')).rows,
  (await db.query('select check_name, ok from public.verify_phase2_business_publishing()')).rows,
  (await db.query('select check_name, ok from public.verify_m50_publish_readiness()')).rows,
];
assert.ok(selfTests.every((rows) => rows.every((r) => r.ok === true)), JSON.stringify(selfTests));
ok('M39 + M44 + M50 publish migrations apply and their self-tests are green');

// ---- Seed one authenticated owner tenant --------------------------------
await db.query(
  `insert into auth.users (id, email) values ($1, 'owner@test.test')`,
  [ids.ownerA],
);
await db.query(
  `insert into public.profiles (id, platform_role) values ($1, 'business_user')`,
  [ids.ownerA],
);
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A')`,
  [ids.orgA],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, role, is_active)
   values ($1, $2, 'owner', true)`,
  [ids.orgA, ids.ownerA],
);
await db.query(
  `insert into public.salons (id, organization_id, name, is_active) values ($1, $2, 'Sin City Salon', true)`,
  [ids.salonA, ids.orgA],
);
// The provisioning path creates an UNPUBLISHED draft row. Owners must never
// be served on the public website before the explicit publish action.
await db.query(
  `insert into public.salon_public_websites
     (salon_id, slug, template_key, config, is_published, published_at)
   values ($1, 'sin-city-salon', 'barber_mens_grooming',
           '{"salonName":"Sin City Salon"}'::jsonb, false, null)`,
  [ids.salonA],
);

const before = (await db.query(
  `select is_published, published_at from public.salon_public_websites where salon_id = $1`,
  [ids.salonA],
)).rows[0];
assert.equal(before.is_published, false);
assert.equal(before.published_at, null);
ok('provisioning leaves a private draft (is_published = false, no published_at)');

// ---- supabase-js → PGlite bridge (the app's real HTTP path) --------------
const session = { uid: '', role: 'anon' };
const originalFetch = globalThis.fetch;
const bridgeFetch = async (url, init = {}) => {
  const target = String(typeof url === 'string' ? url : url?.url ?? '');
  const match = target.match(/\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)/);
  if (!match) {
    return new Response(JSON.stringify({ message: `Unexpected request: ${target}` }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  const fnName = match[1];
  let args = {};
  try { args = init.body ? JSON.parse(init.body) : {}; } catch { args = {}; }
  const keys = Object.keys(args);
  const placeholders = keys.map((key, i) => `${key} => $${i + 1}`).join(', ');
  const values = keys.map((key) => args[key]);

  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [session.uid]);
  await db.exec(`set role ${session.role}`);
  try {
    const result = await db.query(`select * from public.${fnName}(${placeholders})`, values);
    return new Response(JSON.stringify(result.rows), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      message: error.message, code: error.code ?? 'P0001',
      details: error.detail ?? null, hint: error.hint ?? null,
    }), { status: 400, headers: { 'content-type': 'application/json' } });
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
};
globalThis.fetch = bridgeFetch;

// Env must be set BEFORE the app's Supabase client module is imported.
process.env.VITE_SUPABASE_URL = 'http://pglite.local';
process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';

const { publishOwnerSalonWebsite, unpublishOwnerSalonWebsite } =
  await import('../src/lib/salonWebsiteService.ts');
const { emptyOwnerSalonData } = await import('../src/lib/ownerPreview.ts');

const completeDraft = () => ({
  ...emptyOwnerSalonData(),
  salonId: ids.salonA,
  salonName: 'Sin City Salon',
  tagline: 'Precision cuts, honest prices',
  about: 'Family-run salon since 2012.',
  phone: '+919900000111',
  services: [{
    id: 'svc-1',
    name: 'Skin Fade',
    category: 'Haircuts',
    description: 'Clean fade',
    price: 450,
    duration: 45,
  }],
  templateId: 'barber_mens_grooming',
  websiteAppearance: 'light',
  reviewedContent: {
    heroHeadline: 'Sin City Salon',
    tagline: 'Precision cuts, honest prices',
    about: 'Family-run salon since 2012.',
    ownerIntro: 'Asha',
    serviceDescriptions: { 'svc-1': 'Clean fade' },
    bookingCTA: 'Book your appointment today.',
  },
  websiteSlug: 'sin-city-salon',
  lastCompletedStep: 10,
});

// 1. Publish-readiness validation shows exactly what is missing.
session.uid = ids.ownerA;
session.role = 'authenticated';
const { verifyOwnerPublishReadiness } = await import('../src/lib/salonWebsiteService.ts');
const { evaluatePublishReadiness } = await import('../src/lib/publishReadiness.ts');

// Client face of the existing business rules (what the wizard enforces).
const localEmpty = evaluatePublishReadiness(emptyOwnerSalonData());
assert.equal(localEmpty.ready, false);
assert.equal(localEmpty.statusLabel, 'Complete these items before publishing:');
// Provisioning already assigned the default active template and light
// appearance, so a fresh draft is missing only the owner-authored facts.
for (const label of [
  'Business name',
  'Business tagline or About section',
  'Required service setup',
  'Required business configuration (contact details)',
  'Required website configuration (content review)',
]) {
  assert.ok(localEmpty.missingLabels.includes(label), `missing: ${label}`);
}
assert.deepEqual(localEmpty.missingLabels, [
  'Business name',
  'Business tagline or About section',
  'Required service setup',
  'Required business configuration (contact details)',
  'Required website configuration (content review)',
]);
// Team/gallery are optional by existing rule — they must never appear.
assert.ok(!localEmpty.missingLabels.some((label) => /team|gallery/i.test(label)));
ok('readiness validation reports the exact incomplete items (no invented optional fields)');

// Database-backed validation of the persisted business row + draft config.
const dbEmpty = await verifyOwnerPublishReadiness(emptyOwnerSalonData());
assert.equal(dbEmpty.ready, false);
assert.equal(dbEmpty.statusLabel, 'Complete these items before publishing:');
for (const label of dbEmpty.missingLabels) {
  assert.ok(localEmpty.missingLabels.includes(label), `DB reported unknown item: ${label}`);
}
// The persisted salons.name satisfies business identity, so only the draft
// gaps remain — and they are exactly the 4 the DB returns.
assert.deepEqual(dbEmpty.missingLabels, [
  'Business tagline or About section',
  'Required service setup',
  'Required business configuration (contact details)',
  'Required website configuration (content review)',
]);
assert.ok(!dbEmpty.missingLabels.some((label) => /team|gallery/i.test(label)));
ok('database validator (M50) reports the same required items for the persisted draft');

// A complete draft is Ready to Publish on both client and database rules.
const completeReadiness = await verifyOwnerPublishReadiness(completeDraft());
assert.equal(completeReadiness.ready, true);
assert.equal(completeReadiness.statusLabel, 'Ready to Publish');
assert.deepEqual(completeReadiness.missingLabels, []);
assert.equal(evaluatePublishReadiness(completeDraft()).ready, true);
ok('complete business + website configuration is Ready to Publish');

// 2. Incomplete businesses fail closed BEFORE the RPC.
let rpcReached = false;
const bridgeReference = globalThis.fetch;
globalThis.fetch = async (...args) => { rpcReached = true; return bridgeReference(...args); };
await assert.rejects(
  () => publishOwnerSalonWebsite({ ...emptyOwnerSalonData(), salonName: 'Incomplete' }),
  /Complete these items before publishing:/i,
);
assert.equal(rpcReached, false, 'an incomplete draft must never reach the publish RPC');
globalThis.fetch = bridgeFetch;
ok('incomplete businesses fail closed — no publish RPC is ever called');

// 2. The real Publish action persists the publication state.
session.uid = ids.ownerA;
session.role = 'authenticated';
const published = await publishOwnerSalonWebsite(completeDraft());
assert.equal(published.isPublished, true);
assert.ok(published.publishedAt, 'published_at must be returned by the database');
assert.equal(published.slug, 'sin-city-salon');
assert.equal(published.salonId, ids.salonA);
ok('client publish returns the database-confirmed is_published = true row');

const after = (await db.query(
  `select is_published, published_at, template_key, config
   from public.salon_public_websites where salon_id = $1`,
  [ids.salonA],
)).rows[0];
assert.equal(after.is_published, true);
assert.ok(after.published_at, 'published_at is persisted');
assert.equal(after.template_key, 'barber_mens_grooming');
assert.equal(after.config.salonName, 'Sin City Salon');
assert.equal(after.config.websiteAppearance, 'light');
assert.equal(after.config.services[0].name, 'Skin Fade');
ok('publication state is really persisted in salon_public_websites');

// 3. Anonymous visitors can only read the documented public projection.
session.uid = '';
session.role = 'anon';
const { requireSupabase } = await import('../src/lib/supabaseClient.ts');
const { data: publicRow, error: publicError } = await requireSupabase()
  .rpc('get_public_salon_website', { p_slug: 'sin-city-salon' });
assert.ifError(publicError);
const publicSite = Array.isArray(publicRow) ? publicRow[0] : publicRow;
assert.equal(publicSite?.slug, 'sin-city-salon');
assert.equal(publicSite?.business_name, 'Sin City Salon');
assert.equal(publicSite?.template_key, 'barber_mens_grooming');
assert.ok(publicSite?.published_at);
ok('anon resolves the published site through get_public_salon_website only');

await db.exec('reset role');
await db.exec('set role anon');
try {
  await assert.rejects(
    () => db.query(`select config from public.salon_public_websites`),
    /permission denied|denied/,
  );
} finally {
  await db.exec('reset role');
}
ok('anon cannot SELECT the owner website table (drafts stay private)');

// 4. Republishing keeps the URL permanently allocated on first publish.
session.uid = ids.ownerA;
session.role = 'authenticated';
const renamed = { ...completeDraft(), salonName: 'Sin City Studio' };
const republished = await publishOwnerSalonWebsite(renamed);
assert.equal(republished.isPublished, true);
assert.equal(republished.slug, 'sin-city-salon', 'first published URL must never change');
const renamedRow = (await db.query(
  `select slug, config->>'salonName' as name from public.salon_public_websites where salon_id = $1`,
  [ids.salonA],
)).rows[0];
assert.equal(renamedRow.slug, 'sin-city-salon');
assert.equal(renamedRow.name, 'Sin City Studio');
ok('republish updates content but preserves the allocated public URL');

// 5. Unpublish flips the persisted state while keeping the reservation.
const publishedAtBefore = (await db.query(
  `select published_at from public.salon_public_websites where salon_id = $1`,
  [ids.salonA],
)).rows[0].published_at;
const unpublished = await unpublishOwnerSalonWebsite(completeDraft());
assert.equal(unpublished.isPublished, false, 'unpublish RPC must confirm is_published = false');
assert.equal(unpublished.slug, 'sin-city-salon');
const unpublishedRow = (await db.query(
  `select is_published, published_at, slug from public.salon_public_websites where salon_id = $1`,
  [ids.salonA],
)).rows[0];
assert.equal(unpublishedRow.is_published, false);
assert.equal(unpublishedRow.slug, 'sin-city-salon');
assert.equal(
  new Date(unpublishedRow.published_at).toISOString(),
  new Date(publishedAtBefore).toISOString(),
  'unpublish must preserve the first published_at/URL allocation',
);
ok('unpublish is persisted (is_published = false, URL allocation kept)');

// The public site disappears immediately — database is the authority.
session.uid = '';
session.role = 'anon';
const { data: goneRows, error: goneError } = await requireSupabase().rpc(
  'get_public_salon_website', { p_slug: 'sin-city-salon' },
);
assert.ifError(goneError);
assert.equal(Array.isArray(goneRows) ? goneRows.length : 0, 0);
ok('an unpublished site resolves to zero rows (public 404), no cached fallback');

// 6. Republishing after unpublish brings the same URL back live.
session.uid = ids.ownerA;
session.role = 'authenticated';
const liveAgain = await publishOwnerSalonWebsite(completeDraft());
assert.equal(liveAgain.isPublished, true);
assert.equal(liveAgain.slug, 'sin-city-salon');
const liveAgainRow = (await db.query(
  `select is_published from public.salon_public_websites where salon_id = $1`,
  [ids.salonA],
)).rows[0];
assert.equal(liveAgainRow.is_published, true);
session.uid = '';
session.role = 'anon';
const { data: backRows } = await requireSupabase().rpc(
  'get_public_salon_website', { p_slug: 'sin-city-salon' },
);
assert.equal(Array.isArray(backRows) ? backRows.length : 0, 1);
ok('republish after unpublish restores the same live URL');

globalThis.fetch = originalFetch;
await db.close();

console.log(`\nOwner publish persistence: ${passed}/${passed} checks PASS`);
