/** Owner self-publish RPC — no hardcoded salon. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const sqlOf = (file) => readFile(join(root, 'supabase/migrations', file), 'utf8');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
};

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

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
`);

await db.exec(await sqlOf('20260822000101_m38_reconciliation_fix.sql'));
await db.exec(await sqlOf('20260822000201_m39_owner_publish_website.sql'));

const verify = (await db.query('select check_name, ok from public.verify_m39_owner_publish()')).rows;
assert.ok(verify.every((r) => r.ok === true), JSON.stringify(verify));
ok('verify_m39_owner_publish() is green');

await db.query(
  `insert into auth.users (id, email) values ($1, 'a@test'), ($2, 'b@test')`,
  [ids.ownerA, ids.ownerB],
);
await db.query(
  `insert into public.profiles (id, platform_role) values ($1, 'business_user'), ($2, 'business_user')`,
  [ids.ownerA, ids.ownerB],
);
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, role) values
    ($1, $2, 'owner'), ($3, $4, 'owner')`,
  [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB],
);
await db.query(
  `insert into public.salons (id, organization_id, name) values ($1, $2, 'Khushi'), ($3, $4, 'Shyam')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
);

const setUser = async (userId) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
};
const asRole = async (role, userId, fn) => {
  await db.exec('reset role');
  await setUser(userId);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
};

await asRole('authenticated', '', async () => {
  await assert.rejects(
    () => db.query(`select * from public.publish_owner_salon_website('khushi-salon')`),
    /log in/i,
  );
});
ok('unauthenticated cannot publish');

const published = await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select * from public.publish_owner_salon_website($1, 'hair', '{"tagline":"Hi"}'::jsonb)`,
    ['khushi-salon'],
  )
).rows);
assert.equal(published[0].salon_id, ids.salonA);
assert.equal(published[0].slug, 'khushi-salon');
assert.equal(published[0].is_published, true);
ok('owner A publishes their own slug (salon resolved in DB)');

await asRole('authenticated', ids.ownerB, async () => {
  await assert.rejects(
    () => db.query(`select * from public.publish_owner_salon_website('khushi-salon')`),
    /already in use/i,
  );
});
ok('owner B cannot steal owner A slug');

const other = await asRole('authenticated', ids.ownerB, async () => (
  await db.query(`select * from public.publish_owner_salon_website($1)`, ['shyam-salon'])
).rows);
assert.equal(other[0].salon_id, ids.salonB);
ok('owner B publishes a different slug');

const publicRow = await asRole('anon', '', async () => (
  await db.query(
    `select slug from public.salon_public_websites where slug = 'khushi-salon' and is_published = true`,
  )
).rows);
assert.equal(publicRow.length, 1);
ok('anon can read the published website row');

await asRole('authenticated', ids.ownerA, async () => {
  await assert.rejects(
    () => db.query(`select * from public.publish_owner_salon_website('dashboard')`),
    /reserved/i,
  );
});
ok('reserved paths cannot be published');

await asRole('authenticated', ids.ownerA, async () => {
  const again = (await db.query(`select * from public.publish_owner_salon_website('khushi-studio')`)).rows;
  assert.equal(again[0].slug, 'khushi-studio');
  assert.equal(again[0].is_published, true);
});
ok('owner can change their own slug on republish');

console.log(`\nM39 owner publish: ${passed}/${passed} checks PASS`);
await db.close();
