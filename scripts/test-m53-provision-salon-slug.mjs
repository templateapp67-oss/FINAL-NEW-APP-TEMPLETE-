/**
 * M53 — owner provisioning must succeed on the LIVE schema shape.
 *
 * REGRESSION UNDER TEST
 * ---------------------
 * A brand-new owner's first login failed with:
 *
 *     We couldn't load your salon workspace
 *     Could not set up your salon. Please try again.
 *
 * because `public.provision_owner_salon` inserted the tenant row as
 *
 *     insert into public.salons (organization_id, theme_id, name, is_active)
 *
 * while the live `public.salons` (created by
 * `20260821203500_setup_public_salon_v2.sql`) declares `slug TEXT UNIQUE NOT
 * NULL`. Postgres raised 23502 and provisioning could never succeed —
 * "Try again" was unwinnable.
 *
 * WHY THE OLD SUITES MISSED IT
 * ----------------------------
 * `test-slug-collision-handling.mjs` bootstraps M38 → M51 only, and M38's
 * `salons` table has no slug column at all (M44 later adds a NULLABLE one).
 * This suite instead applies the FULL ordered migration chain, so
 * `public.salons` has exactly the live NOT NULL + UNIQUE slug column.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { publicWebsiteUrl } from '../src/lib/publicWebsiteUrl.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const stripTxn = (sql) =>
  sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---- Real PostgreSQL (PGlite) + canonical Supabase bootstrap --------------
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
    email text, phone text,
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
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);

// Apply the complete ordered chain, exactly as the live project received it.
const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  try {
    await db.exec(stripTxn(await readFile(join(migrationDir, file), 'utf8')));
  } catch {
    // Preflight-gated migrations that do not apply to this reconciled shape are
    // skipped by design; the tables/functions under test are asserted below.
  }
}

// ---- The exact live-schema precondition that caused the outage -------------
const slugCol = await db.query(`
  select a.attnotnull as not_null
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.salons'::regclass
    and a.attname = 'slug' and a.attnum > 0 and not a.attisdropped
`);
assert.equal(slugCol.rows.length, 1, 'public.salons.slug must exist in the live shape');
assert.equal(slugCol.rows[0].not_null, true, 'public.salons.slug is NOT NULL in the live shape');
ok('live schema precondition reproduced: public.salons.slug is NOT NULL UNIQUE');

// ---- Helpers ---------------------------------------------------------------
const setUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
const asOwner = async (uid, sql, params) => {
  await db.exec('reset role');
  await setUser(uid);
  await db.exec('set role authenticated');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await setUser('');
  }
};
const provision = (uid, name, template) =>
  asOwner(uid, `select * from public.provision_owner_salon($1, 'client-ignored', $2)`, [
    name,
    template,
  ]).then((r) => r.rows[0]);

const ids = {
  a: '00000000-0000-4000-8000-0000000053a1',
  b: '00000000-0000-4000-8000-0000000053b1',
  c: '00000000-0000-4000-8000-0000000053c1',
  legacy: '00000000-0000-4000-8000-0000000053d1',
};
for (const [key, id] of Object.entries(ids)) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `m53-${key}@test.test`]);
  // `owner_salon_ids()` requires an active profile, exactly as the signup
  // trigger produces in the live project.
  await db.query(
    `insert into public.profiles (id, platform_role, is_active) values ($1, 'customer', true)
     on conflict (id) do update set is_active = true`,
    [id],
  );
}

// ---- 1. The failing flow now succeeds --------------------------------------
// This is the behavioural heart of the regression: before M53 this call raised
// `23502 null value in column "slug" of relation "salons"`, which the client
// turned into "Could not set up your salon. Please try again."
let ownerA;
try {
  ownerA = await provision(ids.a, 'Glow Studio', 'barber_mens_grooming');
} catch (error) {
  assert.fail(
    `provision_owner_salon still fails for a brand-new owner: ${error.code ?? ''} ${error.message}`,
  );
}
assert.ok(ownerA?.out_salon_id, 'a brand-new owner must be provisioned');
assert.equal(ownerA.out_already_existed, false);
assert.equal(ownerA.out_slug, 'glow-studio');
assert.equal(ownerA.out_is_published, false, 'provisioning creates a PRIVATE draft');
ok('brand-new owner is provisioned (no 23502) and gets a private draft website');

// ---- 2. Both slug namespaces agree ----------------------------------------
const salonRowA = (await db.query('select slug, name, organization_id from public.salons where id = $1', [
  ownerA.out_salon_id,
])).rows[0];
assert.equal(salonRowA.slug, ownerA.out_slug, 'salons.slug mirrors the allocated public slug');
const siteRowA = (await db.query('select slug from public.salon_public_websites where salon_id = $1', [
  ownerA.out_salon_id,
])).rows[0];
assert.equal(siteRowA.slug, ownerA.out_slug);
ok('salons.slug and salon_public_websites.slug are the SAME canonical value');

const provisionSrc = (await db.query(
  `select lower(pg_get_functiondef('public.provision_owner_salon(text,text,text)'::regprocedure)) as src`,
)).rows[0].src;
assert.ok(
  provisionSrc.includes('insert into public.salons (organization_id, theme_id, name, slug, is_active)'),
  'provision_owner_salon must supply salons.slug',
);
ok('provision_owner_salon inserts the salon row WITH its slug (the M53 fix)');

// ---- 3. Idempotency: re-login must not create a second tenant --------------
const ownerAAgain = await provision(ids.a, 'Glow Studio', 'hair_studio_color_bar');
assert.equal(ownerAAgain.out_salon_id, ownerA.out_salon_id, 'provisioning is idempotent');
assert.equal(ownerAAgain.out_already_existed, true);
assert.equal(ownerAAgain.out_slug, ownerA.out_slug, 'the public URL never moves on re-login');
// Scoped to this owner: the chain also seeds the `royal-hair-studio` demo row.
const tenantCount = (await db.query(
  `select count(*)::int as n from public.salons s
   join public.organization_members m on m.organization_id = s.organization_id
   where m.user_id = $1 and m.role = 'owner' and m.is_active`,
  [ids.a],
)).rows[0].n;
assert.equal(tenantCount, 1, 'exactly one salon after two provisioning calls');
ok('re-login is idempotent: same salon, same slug, no duplicate tenant');

// ---- 4. Duplicate business names still get unique URLs ---------------------
const ownerB = await provision(ids.b, 'Glow Studio', 'beauty_skin_spa');
const ownerC = await provision(ids.c, 'Glow Studio', 'nail_lash_studio');
assert.equal(ownerB.out_slug, 'glow-studio-1');
assert.equal(ownerC.out_slug, 'glow-studio-2');
const allSlugs = (await db.query(
  `select slug from public.salons where slug like 'glow-studio%' order by slug`,
)).rows.map((r) => r.slug);
assert.deepEqual(allSlugs, ['glow-studio', 'glow-studio-1', 'glow-studio-2']);
assert.equal(new Set(allSlugs.map((s) => publicWebsiteUrl(s))).size, 3, 'three distinct public URLs');
ok('duplicate names still resolve to glow-studio / -1 / -2 across BOTH tables');

// ---- 5. Tenant isolation is unchanged --------------------------------------
const ownedByB = await asOwner(ids.b, 'select * from public.owner_salon_ids()');
assert.equal(ownedByB.rows.length, 1, 'owner B sees exactly one salon');
assert.notEqual(ownedByB.rows[0].id ?? ownedByB.rows[0].owner_salon_ids, ownerA.out_salon_id);
ok('each owner still resolves only their OWN salon (no cross-tenant leak)');

// ---- 6. Legacy repair: a tenant with a blank slug is backfilled ------------
await db.exec('reset role');
const legacyOrg = (await db.query(
  `insert into public.organizations (name, status) values ('Legacy Cuts','active') returning id`,
)).rows[0].id;
await db.query(
  `insert into public.organization_members (organization_id, user_id, role, is_active)
   values ($1, $2, 'owner', true)`,
  [legacyOrg, ids.legacy],
);
// Simulate a tenant created by the broken build: salon row present, slug blank,
// and no website row at all.
await db.query(
  `insert into public.salons (organization_id, name, slug, is_active)
   values ($1, 'Legacy Cuts', '', true)`,
  [legacyOrg],
);
const legacyResult = await provision(ids.legacy, 'Legacy Cuts', 'barber_mens_grooming');
assert.equal(legacyResult.out_already_existed, true);
assert.equal(legacyResult.out_slug, 'legacy-cuts');
const legacySalon = (await db.query('select slug from public.salons where organization_id = $1', [
  legacyOrg,
])).rows[0];
assert.equal(legacySalon.slug, 'legacy-cuts', 'blank legacy slug is repaired in place');
ok('a tenant left slug-less by the broken build is repaired on next login');

// ---- 7. Anonymous callers still cannot provision ---------------------------
await db.exec('reset role');
await setUser('');
await db.exec('set role anon');
let anonBlocked = false;
try {
  await db.query(`select * from public.provision_owner_salon('Hacker Salon', 'x', 'barber_mens_grooming')`);
} catch {
  anonBlocked = true;
}
await db.exec('reset role');
assert.ok(anonBlocked, 'anon must never be able to provision a tenant');
ok('anonymous callers are still refused (grants unchanged)');

// ---- 8. The migration's own verifier is green ------------------------------
const verify = (await db.query(
  'select check_name, ok, detail from public.verify_m53_provision_salon_slug()',
)).rows;
assert.ok(verify.length > 0, 'verifier must return checks');
const failedChecks = verify.filter((r) => r.ok !== true);
assert.deepEqual(failedChecks, [], `M53 verifier failures: ${JSON.stringify(failedChecks)}`);
ok(`verify_m53_provision_salon_slug(): all ${verify.length} checks green`);

// ---- 9. M51's guarantees are preserved -------------------------------------
const m51 = (await db.query(
  'select check_name, ok from public.verify_m51_slug_collision_hardening()',
)).rows;
assert.deepEqual(m51.filter((r) => r.ok !== true), [], 'M51 must remain green');
ok('M51 slug-collision guarantees still hold after the M53 redefinition');

await db.close();
console.log(`\nM53 provisioning slug fix: ${passed}/${passed} checks PASS`);
