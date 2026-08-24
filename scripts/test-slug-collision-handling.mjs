/**
 * Requirement 6 — slug collision handling.
 *
 * Duplicate business names must NEVER produce duplicate public URLs, and the
 * allocation must be the canonical sequence:
 *
 *   Business A: Nexora Salon -> nexora-salon
 *   Business B: Nexora Salon -> nexora-salon-1
 *   Business C: Nexora Salon -> nexora-salon-2
 *
 * Runs against a real PostgreSQL (PGlite) with the canonical M38 → M39 →
 * M44 → M45 → M50 → M51 migrations. The uniqueness decision is made and
 * enforced BY THE DATABASE:
 *
 *   * `private.nexora_allocate_business_slug` — advisory-lock serialized,
 *     scans both slug namespaces (salon_public_websites + salons),
 *     deterministic base, base-1, base-2, ... numbering.
 *   * CI unique indexes on `lower(btrim(slug))` (both tables) — the final
 *     invariant, rejecting duplicates (and case/whitespace variants) from
 *     ANY writer, including direct inserts that bypass the allocator.
 *   * URL-safe character checks on both slug columns.
 *   * `provision_owner_salon` / `publish_owner_salon_website` persist under a
 *     savepoint retry on `unique_violation` (race-safe creation/update).
 *   * `published_at` locks the first public URL permanently (update safety).
 *
 * The client slugifier returns the SAME base for every duplicate — this test
 * proves that frontend-only uniqueness is insufficient and that the real
 * resolution happens in the database.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { publicWebsiteUrl, slugifySalonName } from '../src/lib/publicWebsiteUrl.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const read = async (f) => readFile(join(migrationDir, f), 'utf8');

// Split a SQL migration into individual statements, respecting dollar-quoted
// bodies, string literals, identifiers, and comments (same helper as the
// Phase 2 suites — PGlite can silently drop DDL inside DO blocks otherwise).
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  const push = () => {
    const t = buf.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (t) out.push(buf.trim());
    buf = '';
  };
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      buf += c + sql[i + 1]; i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { buf += sql[i]; i++; }
      if (i < n) { buf += sql[i] + sql[i + 1]; i += 2; }
      continue;
    }
    if (c === '$') {
      let j = i + 1; let tag = '$';
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) { tag += sql[j]; j++; }
      if (j < n && sql[j] === '$') {
        tag += '$';
        const end = sql.indexOf(tag, j + 1);
        if (end === -1) { buf += sql.slice(i); break; }
        buf += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }
    if (c === "'" || c === '"') {
      const q = c; buf += c; i++;
      while (i < n) {
        if (sql[i] === '\\') { buf += sql[i]; if (i + 1 < n) buf += sql[i + 1]; i += 2; continue; }
        if (sql[i] === q) {
          if (sql[i + 1] === q) { buf += q + q; i += 2; continue; }
          buf += q; i++; break;
        }
        buf += sql[i]; i++;
      }
      continue;
    }
    if (c === ';') { push(); i++; continue; }
    buf += c; i++;
  }
  push();
  return out;
}

const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');
const execMigration = async (db, file) => {
  const sql = stripTxn(await read(file));
  for (const stmt of splitStatements(sql)) {
    await db.exec(stmt);
  }
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

  -- Tables referenced by the M44 publish paths before M38 defines the rest.
  create table if not exists public.business_locations (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    address_label text,
    approval_status text not null default 'approved',
    created_at timestamptz not null default now()
  );
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

await execMigration(db, '20260822000101_m38_reconciliation_fix.sql');
await execMigration(db, '20260822000201_m39_owner_publish_website.sql');
await execMigration(db, '20260824000101_m44_business_publishing.sql');
await execMigration(db, '20260824000201_m45_business_slug_hardening.sql');
await execMigration(db, '20260825000101_m50_publish_readiness_validation.sql');
await execMigration(db, '20260825000201_m51_slug_collision_hardening.sql');

const selfChecks = [
  (await db.query('select check_name, ok from public.verify_m45_business_slug_hardening()')).rows,
  (await db.query('select check_name, ok from public.verify_m51_slug_collision_hardening()')).rows,
];
assert.ok(selfChecks.every((rows) => rows.every((r) => r.ok === true)), JSON.stringify(selfChecks));
ok('M38 → M51 apply cleanly; M45 + M51 verifiers are green');

// ---- Frontend slugifier is collision-blind (proves UI-only is insufficient) --
assert.equal(slugifySalonName('Nexora Salon'), 'nexora-salon');
ok('client slugifier returns the same base for every duplicate (frontend-only uniqueness cannot work)');

// ---- Three owners, identical business names -------------------------------
const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  ownerC: '00000000-0000-4000-8000-0000000000c1',
  ownerD: '00000000-0000-4000-8000-0000000000d1',
};
for (const key of ['ownerA', 'ownerB', 'ownerC', 'ownerD']) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[key], `${key}@test.test`]);
  await db.query(`insert into public.profiles (id, platform_role) values ($1, 'business_user')`, [ids[key]]);
}

const setUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
const asRole = async (role, uid, fn) => {
  await db.exec('reset role');
  await setUser(uid);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await setUser('');
  }
};

const provision = (uid, name, template) => asRole('authenticated', uid, () =>
  db.query(
    `select * from public.provision_owner_salon($1, 'client-ignored', $2)`,
    [name, template],
  ).then((r) => r.rows[0]));

const salonA = await provision(ids.ownerA, 'Nexora Salon', 'barber_mens_grooming');
const salonB = await provision(ids.ownerB, 'Nexora Salon', 'hair_studio_color_bar');
const salonC = await provision(ids.ownerC, 'Nexora Salon', 'beauty_skin_spa');

// The exact requirement example.
assert.equal(salonA.out_slug, 'nexora-salon');
ok('Business A → nexora-salon');
assert.equal(salonB.out_slug, 'nexora-salon-1');
ok('Business B → nexora-salon-1');
assert.equal(salonC.out_slug, 'nexora-salon-2');
ok('Business C → nexora-salon-2');

const slugs = [salonA.out_slug, salonB.out_slug, salonC.out_slug];
const urls = slugs.map((slug) => publicWebsiteUrl(slug));
assert.equal(new Set(slugs).size, 3, 'slugs must be unique');
assert.equal(new Set(urls).size, 3, 'public URLs must be unique');
for (const slug of slugs) {
  assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `URL-safe chars expected: ${slug}`);
  assert.equal(publicWebsiteUrl(slug), `https://${slug}.nexora.site`);
}
ok('all three slugs are URL-safe and produce three distinct public URLs');

// ---- Publish all three; public resolution must be per-business -------------
const publish = (uid, salonId, template, name) => asRole('authenticated', uid, () =>
  db.query(
    `select * from public.publish_owner_salon_website(
       'client-ignored', $1::text,
       jsonb_build_object('salonName', $2::text, 'tagline', 'Same name, different businesses')::jsonb,
       $3::uuid)`,
    [template, name, salonId],
  ).then((r) => r.rows[0]));

const pubA = await publish(ids.ownerA, salonA.out_salon_id, 'barber_mens_grooming', 'Nexora Salon');
const pubB = await publish(ids.ownerB, salonB.out_salon_id, 'hair_studio_color_bar', 'Nexora Salon');
const pubC = await publish(ids.ownerC, salonC.out_salon_id, 'beauty_skin_spa', 'Nexora Salon');
assert.deepEqual(
  [pubA.slug, pubB.slug, pubC.slug].sort(),
  ['nexora-salon', 'nexora-salon-1', 'nexora-salon-2'],
);

const publicRow = (slug) => asRole('anon', '', () =>
  db.query(`select * from public.get_public_salon_website($1)`, [slug]).then((r) => r.rows));
for (const { slug, salonId } of [
  { slug: 'nexora-salon', salonId: salonA.out_salon_id },
  { slug: 'nexora-salon-1', salonId: salonB.out_salon_id },
  { slug: 'nexora-salon-2', salonId: salonC.out_salon_id },
]) {
  const rows = await publicRow(slug);
  assert.equal(rows.length, 1, `${slug} must resolve to exactly one business`);
  assert.equal(rows[0].salon_id, salonId, `${slug} must resolve to its owner`);
  assert.equal(rows[0].business_name, 'Nexora Salon');
}
ok('each live URL resolves to exactly its own business (public RPC)');

// ---- Database is the final invariant, even against direct writers ----------
// Direct writer (bypasses every allocator and owner flow — the DB
// constraints alone must reject duplicates). Runs as the bootstrap superuser
// so only table constraints, not RLS, decide the outcome.
const directInsert = (slug) =>
  db.query(
    `insert into public.salon_public_websites (salon_id, slug, is_published)
     values ('31000000-0000-4000-8000-0000000000e1', $1, true)`,
    [slug],
  );
await assert.rejects(
  directInsert('nexora-salon'),
  (err) => err.code === '23505',
  'exact duplicate must be rejected by the DB unique index',
);
ok('DB unique index rejects an exact duplicate public slug (no frontend decision involved)');
await assert.rejects(
  directInsert('NEXORA-SALON'),
  (err) => ['23505', '23514'].includes(err.code),
  'case/whitespace variants must be rejected by the DB',
);
await assert.rejects(
  directInsert('Nexora Salon!'),
  (err) => err.code === '23514',
  'invalid URL characters must be rejected by the DB check',
);
ok('case/whitespace and invalid-character slugs are rejected by the database');

// ---- Deterministic continuation -------------------------------------------
const salonD = await provision(ids.ownerD, 'Nexora Salon', 'nail_lash_studio');
assert.equal(salonD.out_slug, 'nexora-salon-3');
const againForD = (await db.query(
  `select private.nexora_allocate_business_slug('Nexora Salon', $1) as slug`,
  [salonD.out_salon_id],
)).rows[0].slug;
assert.equal(againForD, 'nexora-salon-3', 're-allocation for the same salon must be stable');
const nextFree = (await db.query(
  `select private.nexora_allocate_business_slug('Nexora Salon') as slug`,
)).rows[0].slug;
assert.equal(nextFree, 'nexora-salon-4', 'the next free suffix must be deterministic');
ok('4th duplicate deterministically gets nexora-salon-3; next free suffix is nexora-salon-4');

// ---- Update safety: rename + republish keeps the first allocated URL -------
const renamed = await publish(ids.ownerA, salonA.out_salon_id, 'barber_mens_grooming', 'Renamed Salon');
assert.equal(renamed.slug, 'nexora-salon');
const renamedRow = await publicRow('nexora-salon');
assert.equal(renamedRow[0].business_name, 'Renamed Salon');
const salonMirror = (await db.query(
  `select slug from public.salons where id = $1`, [salonA.out_salon_id],
)).rows[0].slug;
assert.equal(salonMirror, 'nexora-salon');
ok('rename + republish keeps the first allocated public URL (update safety)');

// ---- Race-safety primitives are present in the applied functions -----------
const defOf = (fn) => db.query(`select pg_get_functiondef($1::regprocedure) as d`, [fn]).then((r) => r.rows[0].d);
const allocatorDef = await defOf('private.nexora_allocate_business_slug(text,uuid)');
const provisionDef = await defOf('public.provision_owner_salon(text,text,text)');
const publishDef = await defOf('public.publish_owner_salon_website(text,text,jsonb,uuid)');
assert.match(allocatorDef, /pg_advisory_xact_lock/);
assert.match(allocatorDef, /hashtext/);
assert.match(allocatorDef, /lower\(btrim\(w\.slug\)\)/);
assert.match(allocatorDef, /lower\(btrim\(s\.slug\)\)/);
assert.match(provisionDef, /unique_violation/);
assert.match(publishDef, /unique_violation/);
const indexes = await db.query(`
  select indexname from pg_indexes
  where schemaname = 'public'
    and indexname in ('salon_public_websites_slug_ci_unique', 'salons_slug_ci_unique')
`);
assert.equal(indexes.rows.length, 2);
ok('allocator is advisory-lock serialized + both namespaces scanned; provision/publish retry unique_violation; CI unique indexes exist');

console.log(`\nSlug collision handling: ${passed}/${passed} checks PASS`);
