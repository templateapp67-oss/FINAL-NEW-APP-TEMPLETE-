import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migration = await readFile(
  new URL('../supabase/migrations/20260825000701_m56_owner_profile_theme_preflight.sql', import.meta.url),
  'utf8',
);
const db = new PGlite({ extensions: { pgcrypto } });
let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth;
  create schema private;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create table public.profiles (
    id uuid primary key,
    full_name text,
    platform_role text not null default 'customer',
    is_active boolean not null default true,
    email text,
    updated_at timestamptz not null default now()
  );
  create table public.themes (
    id uuid primary key default gen_random_uuid(),
    theme_id text not null unique,
    is_active boolean not null default true
  );
  create table public.salons (
    id uuid primary key default gen_random_uuid(),
    theme_id uuid references public.themes(id),
    name text not null
  );
  alter table public.salons enable row level security;

  create function private.nexora_ensure_owner_profile(uuid)
  returns void language sql as $$ select $$;
  create function public.provision_owner_salon(text,text,text)
  returns table (
    out_salon_id uuid, out_organization_id uuid, out_slug text,
    out_template_id text, out_is_published boolean, out_already_existed boolean
  ) language sql as $$ select null::uuid,null::uuid,null::text,null::text,false,false $$;
`);

await db.exec(migration);
ok('M56 applies to the M54 workspace function shape');

const existing = '00000000-0000-4000-8000-000000005601';
const missing = '00000000-0000-4000-8000-000000005602';
const inactive = '00000000-0000-4000-8000-000000005603';
await db.query(
  `insert into auth.users (id,email,raw_user_meta_data) values
   ($1,'existing@test.test','{}'),
   ($2,'missing@test.test','{"full_name":"Missing Profile"}'),
   ($3,'inactive@test.test','{}')`,
  [existing, missing, inactive],
);
await db.query(
  `insert into public.profiles (id,platform_role,is_active) values
   ($1,'customer',true),($2,'customer',false)`,
  [existing, inactive],
);

await db.query('select private.nexora_ensure_owner_profile($1)', [existing]);
const existingRole = (await db.query('select platform_role from public.profiles where id=$1', [existing])).rows[0].platform_role;
assert.equal(existingRole, 'business_user');
ok('existing active customer profile is normalized for owner provisioning');

await db.query('select private.nexora_ensure_owner_profile($1)', [missing]);
const repaired = (await db.query('select platform_role,full_name from public.profiles where id=$1', [missing])).rows[0];
assert.equal(repaired.platform_role, 'business_user');
assert.equal(repaired.full_name, 'Missing Profile');
ok('missing legacy profile is repaired directly as business_user from Auth metadata');

await assert.rejects(
  () => db.query('select private.nexora_ensure_owner_profile($1)', [inactive]),
  (error) => error.code === '42501' && /inactive/i.test(error.message),
);
ok('inactive profile remains denied');

const activeTheme = (await db.query(
  `insert into public.themes (theme_id,is_active) values ('active-theme',true) returning id`,
)).rows[0].id;
const inactiveTheme = (await db.query(
  `insert into public.themes (theme_id,is_active) values ('inactive-theme',false) returning id`,
)).rows[0].id;

await assert.rejects(
  () => db.query(`insert into public.salons (theme_id,name) values (null,'No Theme')`),
  (error) => error.code === 'P0002' && /active theme is unavailable/i.test(error.message),
);
await assert.rejects(
  () => db.query(`insert into public.salons (theme_id,name) values ($1,'Inactive Theme')`, [inactiveTheme]),
  (error) => error.code === 'P0002' && /active theme is unavailable/i.test(error.message),
);
ok('missing and inactive themes fail with the precise dependency error');

await db.query(`insert into public.salons (theme_id,name) values ($1,'Valid Theme')`, [activeTheme]);
assert.equal(Number((await db.query('select count(*) as n from public.salons')).rows[0].n), 1);
ok('active canonical theme permits salon creation');

const verification = (await db.query(
  'select check_name,ok from public.verify_m56_owner_profile_theme_preflight()',
)).rows;
assert.equal(verification.length, 4);
assert.deepEqual(verification.filter((row) => row.ok !== true), []);
ok('M56 verifier is fully green and salon RLS remains enabled');

await db.close();
console.log(`\nM56 owner profile/theme preflight: ${passed}/${passed} checks PASS`);
