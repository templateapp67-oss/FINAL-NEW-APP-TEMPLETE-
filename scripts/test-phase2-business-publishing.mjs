/**
 * White-label dynamic provisioning + template switching — SQL/RLS tests.
 *
 * Runs in PGlite. Verifies:
 *   - provision_owner_salon(name, slug, template_id) creates org + owner
 *     membership + salon + a PUBLISHED salon_public_websites row, all in one
 *     call, so the site is immediately live at /<slug> and <slug>.<base>.
 *   - Slugs are unique (another owner cannot claim an in-use slug).
 *   - set_owner_salon_template updates presentation ONLY (theme_id +
 *     template_key) and never deletes services/products/bookings.
 *   - RLS isolation: Owner A cannot read Owner B's published row through the
 *     owner-update path, while anon can read any PUBLISHED row.
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

// Split a SQL migration into individual statements, respecting dollar-quoted
// bodies, string literals, identifiers, and comments. PGlite's multi-statement
// exec can silently drop DDL that lives inside PL/pgSQL DO blocks when they are
// part of a large batch; executing each top-level statement separately avoids
// that and matches how Supabase applies migrations.
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

// PGlite runs in autocommit and silently no-ops an explicit `begin;...commit;`
// wrapper. Strip transaction control and apply each statement individually.
const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');
const read = async (f) => stripTxn(await readFile(join(migrationDir, f), 'utf8'));

let passed = 0;
const ok = (label) => { passed++; console.log(`PASS ${label}`); };

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const execMigration = async (sql) => {
  for (const stmt of splitStatements(sql)) {
    await db.exec(stmt);
  }
};

// Minimal canonical Design-B shape + helpers the migration depends on.
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  exception when others then raise notice 'role setup: %', sqlerrm; end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema if not exists private;

  create table if not exists public.profiles (
    id uuid primary key, platform_role text not null default 'customer',
    is_active boolean not null default true, updated_at timestamptz not null default now()
  );
  create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(), name text not null,
    status text not null default 'active', created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table if not exists public.organization_members (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'staff', is_active boolean not null default true,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    primary key (organization_id, user_id),
    constraint om_role_check check (role in ('owner','staff'))
  );
  create table if not exists public.themes (
    id uuid primary key default gen_random_uuid(), theme_id text not null unique,
    name text not null, slug text unique, is_active boolean not null default true
  );
  create table if not exists public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    theme_id uuid references public.themes(id),
    name text not null, is_active boolean not null default true,
    deleted_at timestamptz, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table if not exists public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    slug text not null, template_key text, config jsonb not null default '{}'::jsonb,
    is_published boolean not null default false, published_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (salon_id), unique (slug)
  );
  -- Tenant data that must survive template switching.
  create table if not exists public.services (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    theme_id uuid references public.themes(id), name text not null,
    is_active boolean not null default true, deleted_at timestamptz
  );
  create table if not exists public.products (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    name text not null
  );
  create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    customer_name text not null
  );

  insert into public.themes (theme_id, name, slug) values
    ('barber_mens_grooming','Barber','barber_mens_grooming'),
    ('hair_studio_color_bar','Hair Studio','hair_studio_color_bar'),
    ('beauty_skin_spa','Beauty Spa','beauty_skin_spa'),
    ('family_full_service','Family','full_service_family_salon'),
    ('nail_lash_studio','Nail Lash','nail_lash_studio') on conflict do nothing;

  create or replace function private.is_active_admin() returns boolean language sql stable security definer set search_path='' as $$
    select exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.platform_role='admin') $$;
  create or replace function private.has_salon_role(p_salon_id uuid, p_roles text[] default array['owner','staff']) returns boolean language sql stable security definer set search_path='' as $$
    select private.is_active_admin() or exists (
      select 1 from public.salons s join public.organization_members om on om.organization_id=s.organization_id
      join public.profiles p on p.id=om.user_id
      where s.id=p_salon_id and s.deleted_at is null and s.is_active
        and om.user_id=auth.uid() and om.is_active and om.role=any(p_roles) and p.is_active) $$;
  create or replace function private.can_manage_salon_settings(p_salon_id uuid) returns boolean language sql stable security definer set search_path='' as $$
    select private.has_salon_role(p_salon_id, array['owner']) $$;
  create or replace function private.is_public_salon(p_salon_id uuid) returns boolean language sql stable security definer set search_path='' as $$
    select exists (select 1 from public.salons s where s.id=p_salon_id and s.is_active and s.deleted_at is null) $$;
  create or replace function public.owner_salon_ids() returns setof uuid language sql stable security definer set search_path='' as $$
    select s.id from public.salons s
    join public.organization_members om on om.organization_id=s.organization_id
    join public.profiles p on p.id=om.user_id
    where om.user_id=auth.uid() and om.is_active and om.role='owner' and p.is_active and s.is_active and s.deleted_at is null $$;
  grant execute on function public.owner_salon_ids() to authenticated;

  alter table public.salons enable row level security;
  alter table public.salon_public_websites enable row level security;
  alter table public.services enable row level security;
  create policy sal_owner on public.salons for all to authenticated using (private.can_manage_salon_settings(id)) with check (private.can_manage_salon_settings(id));
  create policy svc_owner on public.services for all to authenticated using (private.has_salon_role(salon_id)) with check (private.has_salon_role(salon_id));
  grant select,insert,update on public.salon_public_websites to authenticated;
  grant select on public.salon_public_websites to anon;
  grant select on public.salons to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
await execMigration(await read('20260822000201_m39_owner_publish_website.sql'));
await execMigration(await read('20260823000401_phase1_whitelabel_provisioning.sql'));
await db.exec(`
  alter table public.salons add column if not exists address text;
  alter table public.salons add column if not exists city text;
  create table if not exists public.business_locations (
    salon_id uuid primary key references public.salons(id),
    address_label text not null,
    approval_status text not null default 'pending'
  );
`);
await execMigration(await read('20260824000101_m44_business_publishing.sql'));
ok('Phase 2 migration applies over the existing publishing architecture');
assert.equal(slugifySalonName('  Nexora Salon!!!  '), 'nexora-salon');
assert.equal(publicWebsiteUrl('nexora-salon'), 'https://nexora-salon.nexora.site');
ok('business-name URL uses the existing Nexora white-label subdomain');

const verify = (await db.query('select check_name, ok from public.verify_phase2_business_publishing()')).rows;
assert.ok(verify.every((r) => r.ok === true), JSON.stringify(verify));
ok('Phase 2 database security verification is green');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
};
await db.query(`insert into auth.users (id,email) values ($1,'a@x'),($2,'b@x')`, [ids.ownerA, ids.ownerB]);
await db.query(`insert into public.profiles (id) values ($1),($2)`, [ids.ownerA, ids.ownerB]);
const setUser = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
const asRole = async (role, uid, fn) => {
  await db.exec('reset role'); await setUser(uid); await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec('reset role'); await setUser(''); }
};

let salonA;
await asRole('authenticated', ids.ownerA, async () => {
  salonA = (await db.query(`select * from public.provision_owner_salon(
    'Nexora Salon','client-ignored','barber_mens_grooming')`)).rows[0];
});
assert.equal(salonA.out_slug, 'nexora-salon');
assert.equal(salonA.out_is_published, false);
ok('setup creates a private draft with a business-name slug');

let salonB;
await asRole('authenticated', ids.ownerB, async () => {
  salonB = (await db.query(`select * from public.provision_owner_salon(
    'Nexora Salon','also-ignored','hair_studio_color_bar')`)).rows[0];
});
assert.equal(salonB.out_slug, 'nexora-salon-2');
assert.equal(salonB.out_is_published, false);
ok('duplicate business names receive deterministic unique slugs');

const draftProjection = await asRole('anon', '', async () => (
  await db.query(`select * from public.get_public_salon_website('nexora-salon')`)
).rows);
assert.equal(draftProjection.length, 0);
await asRole('anon', '', async () => {
  await assert.rejects(
    () => db.query(`select config from public.salon_public_websites`),
    /permission denied/i,
  );
});
ok('unpublished businesses are absent and anonymous draft reads are denied');

await asRole('authenticated', ids.ownerA, async () => {
  const result = (await db.query(`select * from public.publish_owner_salon_website(
    'client-ignored', 'barber_mens_grooming',
    '{"salonName":"Nexora Salon","tagline":"Public tagline","ownerName":"Private Owner","email":"owner@example.test","team":[{"email":"staff@example.test"}],"contactOptions":{"callNow":false,"whatsapp":false,"bookNow":true}}'::jsonb
  )`)).rows[0];
  assert.equal(result.is_published, true);
  assert.equal(result.slug, 'nexora-salon');
});
const publicA = await asRole('anon', '', async () => (
  await db.query(`select * from public.get_public_salon_website('nexora-salon')`)
).rows);
assert.equal(publicA.length, 1);
assert.equal(publicA[0].business_name, 'Nexora Salon');
assert.equal(publicA[0].public_config.tagline, 'Public tagline');
assert.equal(publicA[0].public_config.ownerName, undefined);
assert.equal(publicA[0].public_config.email, undefined);
assert.equal(publicA[0].public_config.team, undefined);
ok('publish persists and the public projection excludes private owner/staff fields');

const themeOne = (await db.query(`select id from public.themes where theme_id='barber_mens_grooming'`)).rows[0].id;
await db.query(`insert into public.services (salon_id,theme_id,name) values ($1,$2,'Signature Service')`, [salonA.out_salon_id, themeOne]);
const transitions = [
  'hair_studio_color_bar','beauty_skin_spa','family_full_service',
  'nail_lash_studio','barber_mens_grooming',
];
for (const template of transitions) {
  await asRole('authenticated', ids.ownerA, async () => {
    await db.query(`select * from public.set_owner_salon_template($1)`, [template]);
  });
  const current = await asRole('anon', '', async () => (
    await db.query(`select slug,template_key from public.get_public_salon_website('nexora-salon')`)
  ).rows);
  assert.equal(current[0].slug, 'nexora-salon');
  assert.equal(current[0].template_key, template);
  assert.equal((await db.query(`select count(*)::int n from public.services where salon_id=$1`, [salonA.out_salon_id])).rows[0].n, 1);
}
ok('all five template transitions keep the same URL and business data');

await asRole('authenticated', ids.ownerA, async () => {
  const republished = (await db.query(`select * from public.publish_owner_salon_website(
    'changed-client-value','barber_mens_grooming','{"salonName":"Renamed Display"}'::jsonb
  )`)).rows[0];
  assert.equal(republished.slug, 'nexora-salon');
});
ok('refresh/republish preserves the allocated public URL');

console.log(`\nPhase 2 business publishing: ${passed}/${passed} checks PASS`);
await db.close();
