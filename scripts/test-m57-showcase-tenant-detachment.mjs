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
    id uuid primary key default gen_random_uuid(), email text, phone text,
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
    bucket_id text not null references storage.buckets(id), name text not null,
    owner_id text, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(), unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);

const target = '20260826000101_m57_detach_legacy_showcase_tenant.sql';
for (const file of (await readdir(migrationDir))
  .filter((candidate) => candidate.endsWith('.sql') && candidate <= target)
  .sort()) {
  try { await execMigration(db, file); } catch { /* canonical live-like harness */ }
}
assert.ok((await db.query(
  "select to_regprocedure('public.verify_m57_showcase_tenant_detachment()') as fn",
)).rows[0].fn);
ok('M57 installs after the ordered canonical migration chain');

const ownerId = '00000000-0000-4000-8000-0000000057a1';
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)
   on conflict (id) do nothing`,
  [ownerId, 'm57-owner@test.test', JSON.stringify({ salon_name: 'Owner Studio' })],
);
await db.query(
  `insert into public.profiles (id, platform_role, is_active)
   values ($1, 'customer', true)
   on conflict (id) do update set is_active = true`,
  [ownerId],
);
const setUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
const asOwner = async (sql, params = []) => {
  await db.exec('reset role');
  await setUser(ownerId);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); await setUser(''); }
};
const provisioned = (await asOwner(
  `select * from public.provision_owner_salon('Owner Studio', 'owner-studio', 'barber_mens_grooming')`,
)).rows[0];
assert.ok(provisioned.out_salon_id);
ok('control owner provisions one canonical salon before the legacy collision');

const showcaseId = 'efdcb051-db98-40dc-b220-bfb873298de8';
const existingShowcase = (await db.query(
  `select id from public.salons
   where id = $1 or lower(btrim(coalesce(slug, ''))) = 'royal-hair-studio'
   limit 1`,
  [showcaseId],
)).rows[0];
if (!existingShowcase) {
  await db.query(
    `insert into public.salons (id, organization_id, slug, name, is_active)
     values ($1, $2, 'royal-hair-studio', 'Royal Hair & Beauty Studio', true)`,
    [showcaseId, provisioned.out_organization_id],
  );
  await db.query(
    `insert into public.salon_public_websites
       (salon_id, slug, template_key, config, is_published, published_at)
     values ($1, 'royal-hair-studio', 'hair_studio_color_bar', $2::jsonb, true, now())`,
    [showcaseId, JSON.stringify({ marker: 'preserve-me' })],
  );
} else {
  await db.query(
    `update public.salons set organization_id = $2 where id = $1`,
    [existingShowcase.id, provisioned.out_organization_id],
  );
  await db.query(
    `update public.salon_public_websites
        set config = $2::jsonb, is_published = true
      where salon_id = $1`,
    [existingShowcase.id, JSON.stringify({ marker: 'preserve-me' })],
  );
}
const actualShowcaseId = existingShowcase?.id || showcaseId;
const ambiguousIds = (await asOwner('select * from public.owner_salon_ids()')).rows;
assert.equal(ambiguousIds.length, 2);
let ambiguityCode = '';
try {
  await asOwner(
    `select * from public.provision_owner_salon('Owner Studio', 'owner-studio', 'barber_mens_grooming')`,
  );
} catch (error) {
  ambiguityCode = error.code || '';
}
assert.equal(ambiguityCode, 'P0003');
ok('historical first-organization seed reproduces the reported multiple-salons P0003');

const before = (await db.query(
  `select s.id, s.name, s.slug, w.config, w.is_published
   from public.salons s
   join public.salon_public_websites w on w.salon_id = s.id
   where s.id = $1`,
  [actualShowcaseId],
)).rows[0];
await execMigration(db, target);

const resolvedIds = (await asOwner('select * from public.owner_salon_ids()')).rows;
assert.deepEqual(resolvedIds.map((row) => Object.values(row)[0]), [provisioned.out_salon_id]);
const after = (await db.query(
  `select s.id, s.name, s.slug, s.organization_id, w.config, w.is_published
   from public.salons s
   join public.salon_public_websites w on w.salon_id = s.id
   where s.id = $1`,
  [actualShowcaseId],
)).rows[0];
assert.equal(after.id, before.id);
assert.equal(after.name, before.name);
assert.equal(after.slug, before.slug);
assert.deepEqual(after.config, before.config);
assert.equal(after.is_published, before.is_published);
assert.notEqual(after.organization_id, provisioned.out_organization_id);
ok('repair detaches only the showcase tenant while preserving salon UUID, website, config and publication');

const memberCount = Number((await db.query(
  `select count(*) as n from public.organization_members where organization_id = $1`,
  [after.organization_id],
)).rows[0].n);
assert.equal(memberCount, 0);
const provisionedAgain = (await asOwner(
  `select * from public.provision_owner_salon('Owner Studio', 'ignored', 'beauty_skin_spa')`,
)).rows[0];
assert.equal(provisionedAgain.out_salon_id, provisioned.out_salon_id);
assert.equal(provisionedAgain.out_already_existed, true);
ok('owner workspace resolves again and the showcase organization is unowned');

const orgCountBefore = Number((await db.query('select count(*) as n from public.organizations')).rows[0].n);
await execMigration(db, target);
const orgCountAfter = Number((await db.query('select count(*) as n from public.organizations')).rows[0].n);
assert.equal(orgCountAfter, orgCountBefore);
ok('M57 re-application is idempotent and creates no extra organization');

const verifier = (await db.query(
  'select check_name, ok, detail from public.verify_m57_showcase_tenant_detachment()',
)).rows;
assert.equal(verifier.length, 4);
assert.deepEqual(verifier.filter((row) => row.ok !== true), []);
ok('verify_m57_showcase_tenant_detachment(): all four checks green');

const [apiSource, clientSource, vercelSource, apiIndexSource] = await Promise.all([
  readFile(join(root, 'api-routes.ts'), 'utf8'),
  readFile(join(root, 'src/lib/ownerProvisioning.ts'), 'utf8'),
  readFile(join(root, 'vercel.json'), 'utf8'),
  readFile(join(root, 'api/index.ts'), 'utf8'),
]);
assert.doesNotMatch(apiSource, /app\.post\(['"]\/api\/owner\/provision-salon/);
assert.doesNotMatch(clientSource, /fetch\(['"]\/api\/owner\/provision-salon/);
assert.match(clientSource, /pick the first membership/i);
assert.match(apiIndexSource, /\.\/\[\.\.\.path\]/);
assert.doesNotMatch(apiIndexSource, /\[\[\.\.\.path\]\]/);
assert.deepEqual(JSON.parse(vercelSource).routes[0], { handle: 'filesystem' });
ok('duplicate-producing HTTP writer is absent and Vercel uses a supported catch-all function');

await db.close();
console.log(`\nM57 showcase tenant repair: ${passed}/${passed} checks PASS`);
