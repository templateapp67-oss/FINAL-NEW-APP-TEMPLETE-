/**
 * M54 regression: owner provisioning against the observed live membership
 * shape (`status` + STORED GENERATED `is_active`).
 *
 * This test intentionally changes the otherwise canonical PGlite schema to the
 * live shape that caused SQLSTATE 428C9, then calls the real SECURITY DEFINER
 * RPC as an authenticated role. It verifies profile repair, the full
 * Auth → profile → membership → organization → salon → website chain,
 * idempotent retry/duplicate prevention, RLS/grants and the deployment
 * verifier.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const read = (file) => readFile(join(migrationDir, file), 'utf8');

// Split only on semicolons outside quoted strings/comments/dollar bodies.
// Running statements separately makes failures in a DO block observable in
// PGlite and matches the way the live Management API executes a transaction.
function splitStatements(sql) {
  const statements = [];
  let buffer = '';
  let i = 0;
  const push = () => {
    const text = buffer.trim();
    if (text) statements.push(text);
    buffer = '';
  };
  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (sql[i] === '$') {
      let endTag = i + 1;
      while (endTag < sql.length && /[A-Za-z0-9_]/.test(sql[endTag])) endTag += 1;
      if (sql[endTag] === '$') {
        const tag = sql.slice(i, endTag + 1);
        const end = sql.indexOf(tag, endTag + 1);
        if (end < 0) throw new Error(`Unclosed dollar body ${tag}`);
        buffer += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      buffer += sql[i++];
      while (i < sql.length) {
        buffer += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) buffer += sql[i++];
          else { i += 1; break; }
        }
        i += 1;
      }
      continue;
    }
    if (sql[i] === ';') { push(); i += 1; continue; }
    buffer += sql[i++];
  }
  push();
  return statements;
}

const stripTxn = (sql) => sql
  .replace(/^\s*begin\s*;\s*/im, '')
  .replace(/\s*commit\s*;\s*$/im, '');

async function execMigration(db, file) {
  for (const statement of splitStatements(stripTxn(await read(file)))) {
    await db.exec(statement);
  }
}

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

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
    phone text,
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

// Apply the same ordered migration chain used for deployment. A few historical
// migrations are intentionally conditional on live-only tables; those failures
// are non-fatal here because M38/M54 are the asserted canonical surface.
for (const file of (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort()) {
  try { await execMigration(db, file); } catch { /* live-like harness */ }
}
assert.ok(
  (await db.query("select to_regprocedure('public.provision_owner_salon(text,text,text)') as fn")).rows[0].fn,
  'M54 provisioning RPC must be installed',
);
ok('M54 provisioning RPC is installed after the ordered migration chain');

// Reproduce M28's observed live shape exactly: status is writable and
// is_active is generated from it. CASCADE may remove an old activity index or
// policy; M54 must not depend on either for the provisioning write itself.
await db.exec(`
  alter table public.organization_members
    add column if not exists status text not null default 'active';
  alter table public.organization_members drop column if exists is_active cascade;
  alter table public.organization_members
    add column is_active boolean generated always as ((status = 'active') is true) stored;
`);
// M38's ownership helper is reasserted against the now-generated column if the
// dependency graph removed it while dropping the old column.
await execMigration(db, '20260822000101_m38_reconciliation_fix.sql');
await execMigration(db, '20260825000501_m54_workspace_bootstrap_compatibility.sql');

const columns = (await db.query(`
  select column_name, is_generated
  from information_schema.columns
  where table_schema = 'public' and table_name = 'organization_members'
    and column_name in ('status', 'is_active')
  order by column_name
`)).rows;
assert.deepEqual(columns, [
  { column_name: 'is_active', is_generated: 'ALWAYS' },
  { column_name: 'status', is_generated: 'NEVER' },
]);
ok('live membership shape reproduced: status writable + is_active GENERATED ALWAYS');

const uid = '00000000-0000-4000-8000-0000000054a1';
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data)
   values ($1, $2, $3)`,
  [uid, 'm54-owner@test.test', JSON.stringify({ salon_name: 'Compatibility Studio' })],
);
// Prove the original outage before exercising the replacement: an explicit
// value in the generated column is rejected with PostgreSQL 428C9.
await db.query(
  `insert into public.profiles (id, platform_role, is_active) values ($1, 'customer', true)
   on conflict (id) do update set is_active = true`,
  [uid],
);
const reproOrg = (await db.query(
  `insert into public.organizations (name, status) values ('428C9 repro', 'active') returning id`,
)).rows[0].id;
let originalFailureCode = '';
try {
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, status, is_active)
     values ($1, $2, 'owner', 'active', true)`,
    [reproOrg, uid],
  );
} catch (error) {
  originalFailureCode = error.code || '';
}
assert.equal(originalFailureCode, '428C9');
ok('original status/generated membership write reproduces PostgreSQL SQLSTATE 428C9');
await db.query('delete from public.organizations where id = $1', [reproOrg]);

// Simulate the reported existing Auth account: remove its profile after Auth
// signup so the RPC must repair the missing profile rather than assuming the
// signup trigger already ran.
await db.query('delete from public.profiles where id = $1', [uid]);

const setUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
const asRole = async (role, sql, params = [], actor = uid) => {
  await db.exec('reset role');
  await setUser(role === 'anon' ? '' : actor);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); await setUser(''); }
};

let first;
try {
  first = (await asRole(
    'authenticated',
    `select * from public.provision_owner_salon($1, 'ignored-by-server', 'barber_mens_grooming')`,
    ['Compatibility Studio'],
  )).rows[0];
} catch (error) {
  assert.fail(`status/generated provisioning must not raise 428C9: ${error.code || ''} ${error.message}`);
}
assert.ok(first?.out_salon_id, 'new owner must receive a salon');
assert.equal(first.out_already_existed, false);
assert.equal(first.out_slug, 'compatibility-studio');
ok('existing Auth account reaches organization/membership/salon/website without SQLSTATE 428C9');

const chain = (await db.query(`
  select p.id as profile_id, m.organization_id, m.role, m.status,
         m.is_active, o.id as organization_id_again, s.id as salon_id,
         s.slug as salon_slug, w.slug as website_slug, w.is_published
  from public.profiles p
  join public.organization_members m on m.user_id = p.id
  join public.organizations o on o.id = m.organization_id
  join public.salons s on s.organization_id = o.id
  join public.salon_public_websites w on w.salon_id = s.id
  where p.id = $1
`, [uid])).rows[0];
assert.equal(chain.profile_id, uid);
assert.equal(chain.role, 'owner');
assert.equal(chain.status, 'active');
assert.equal(chain.is_active, true, 'generated activity must evaluate true');
assert.equal(chain.salon_id, first.out_salon_id);
assert.equal(chain.salon_slug, first.out_slug);
assert.equal(chain.website_slug, first.out_slug);
assert.equal(chain.is_published, false);
ok('canonical Auth → profile → membership → organization → salon → workspace chain is complete');

const second = (await asRole(
  'authenticated',
  `select * from public.provision_owner_salon($1, 'different-client-slug', 'beauty_skin_spa')`,
  ['A different name must not duplicate the tenant'],
)).rows[0];
assert.equal(second.out_salon_id, first.out_salon_id);
assert.equal(second.out_organization_id, first.out_organization_id);
assert.equal(second.out_slug, first.out_slug);
assert.equal(second.out_already_existed, true);
const counts = (await db.query(`
  select
    (select count(*) from public.organizations o join public.organization_members m on m.organization_id = o.id where m.user_id = $1) as organizations,
    (select count(*) from public.salons s join public.organization_members m on m.organization_id = s.organization_id where m.user_id = $1) as salons,
    (select count(*) from public.salon_public_websites w where w.salon_id = $2) as websites
`, [uid, first.out_salon_id])).rows[0];
assert.equal(Number(counts.organizations), 1);
assert.equal(Number(counts.salons), 1);
assert.equal(Number(counts.websites), 1);
ok('retry/re-login is idempotent: no duplicate organization, membership, salon or website');

// A failed historical attempt may have committed an owner organization and
// membership before the salon insert failed. M54 must repair that exact shape
// in place rather than creating a second organization.
const partialUid = '00000000-0000-4000-8000-0000000054a2';
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`,
  [partialUid, 'm54-partial@test.test'],
);
await db.query(
  `insert into public.profiles (id, platform_role, is_active) values ($1, 'customer', true)
   on conflict (id) do update set is_active = true`,
  [partialUid],
);
const partialOrg = (await db.query(
  `insert into public.organizations (name, status) values ('Partial Studio', 'active') returning id`,
)).rows[0].id;
await db.query(
  `insert into public.organization_members (organization_id, user_id, role, status)
   values ($1, $2, 'owner', 'active')`,
  [partialOrg, partialUid],
);
const repaired = (await asRole(
  'authenticated',
  `select * from public.provision_owner_salon('Partial Studio', 'ignored', 'barber_mens_grooming')`,
  [],
  partialUid,
)).rows[0];
assert.equal(repaired.out_organization_id, partialOrg);
assert.equal(repaired.out_already_existed, false);
const partialCount = (await db.query(
  `select count(*) as n from public.organizations o
   join public.organization_members m on m.organization_id = o.id
   where m.user_id = $1`,
  [partialUid],
)).rows[0].n;
assert.equal(Number(partialCount), 1);
ok('a partial owner bootstrap is repaired in place without a second organization');

// Existing inactive/staff membership is an authorization state, not an
// invitation to create another owner tenant.
const blockedUid = '00000000-0000-4000-8000-0000000054a3';
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`,
  [blockedUid, 'm54-blocked@test.test'],
);
await db.query(
  `insert into public.profiles (id, platform_role, is_active) values ($1, 'customer', true)
   on conflict (id) do update set is_active = true`,
  [blockedUid],
);
const blockedOrg = (await db.query(
  `insert into public.organizations (name, status) values ('Blocked Studio', 'active') returning id`,
)).rows[0].id;
await db.query(
  `insert into public.organization_members (organization_id, user_id, role, status)
   values ($1, $2, 'owner', 'inactive')`,
  [blockedOrg, blockedUid],
);
let blockedCode = '';
try {
  await asRole(
    'authenticated',
    `select * from public.provision_owner_salon('Blocked Studio', 'ignored', 'barber_mens_grooming')`,
    [],
    blockedUid,
  );
} catch (error) {
  blockedCode = error.code || '';
}
assert.equal(blockedCode, '42501');
ok('inactive existing membership is denied instead of creating a duplicate owner tenant');

const source = (await db.query(
  `select lower(pg_get_functiondef('public.provision_owner_salon(text,text,text)'::regprocedure)) as src`,
)).rows[0].src;
assert.ok(source.includes('nexora_upsert_owner_membership'));
assert.equal(source.includes('organization_members (organization_id, user_id, role, is_active)'), false);
ok('canonical provisioner contains no direct write to generated organization_members.is_active');

const verifier = (await db.query(
  'select check_name, ok from public.verify_m54_workspace_bootstrap()',
)).rows;
assert.ok(verifier.length >= 5);
assert.deepEqual(verifier.filter((row) => row.ok !== true), []);
ok(`verify_m54_workspace_bootstrap(): all ${verifier.length} checks green`);

let anonBlocked = false;
try {
  await asRole('anon', `select * from public.provision_owner_salon('Nope', 'nope', 'barber_mens_grooming')`);
} catch { anonBlocked = true; }
assert.equal(anonBlocked, true);
ok('anonymous callers remain unable to provision');

await db.close();
console.log(`\nM54 workspace bootstrap compatibility: ${passed}/${passed} checks PASS`);
