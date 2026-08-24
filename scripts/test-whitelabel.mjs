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

await execMigration(await read('20260823000401_phase1_whitelabel_provisioning.sql'));
ok('white-label provisioning migration applies cleanly');

const verify = (await db.query('select check_name, ok from public.verify_phase1_whitelabel()')).rows;
assert.ok(verify.every((r) => r.ok === true), JSON.stringify(verify));
ok('verify_phase1_whitelabel() is green');

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

// 1. Provision A — site must be LIVE immediately.
let row;
await asRole('authenticated', ids.ownerA, async () => {
  const res = await db.query(
    `select * from public.provision_owner_salon('Royal Hair Studio','royal-hair-studio','beauty_skin_spa')`,
  );
  row = res.rows[0];
});
assert.equal(row.out_slug, 'royal-hair-studio');
assert.equal(row.out_template_id, 'beauty_skin_spa');
assert.equal(row.out_is_published, true);
assert.equal(row.out_already_existed, false);
ok('provisioning creates a PUBLISHED website at the requested slug');

// salon + website + membership exist.
const counts = (await db.query(`
  select
    (select count(*)::int from public.organization_members where user_id=$1 and role='owner')::int as is_owner,
    (select count(*)::int from public.salon_public_websites where slug='royal-hair-studio' and is_published)::int as live
`, [ids.ownerA])).rows[0];
assert.equal(counts.is_owner, 1);
assert.equal(counts.live, 1);
ok('owner membership + published salon_public_websites row exist');

// 2. Idempotent — second call returns the same salon, no duplicate org/slug.
let again;
await asRole('authenticated', ids.ownerA, async () => {
  const res = await db.query(
    `select * from public.provision_owner_salon('Different Name','royal-hair-studio','nail_lash_studio')`,
  );
  again = res.rows[0];
});
assert.equal(again.out_salon_id, row.out_salon_id);
assert.equal(again.out_already_existed, true);
assert.equal(again.out_template_id, 'beauty_skin_spa'); // unchanged
const orgCount = (await db.query(`select count(*)::int n from public.organizations`)).rows[0].n;
assert.equal(orgCount, 1);
ok('re-provisioning is idempotent (no duplicate org/slug; template unchanged)');

// 3. Slug uniqueness — B cannot steal A's slug.
await asRole('authenticated', ids.ownerB, async () => {
  await assert.rejects(
    () => db.query(`select * from public.provision_owner_salon('Copy','royal-hair-studio','barber_mens_grooming')`),
    /already in use|23505/i,
  );
});
ok('a second owner cannot claim an in-use slug');

// B can provision their own distinct slug.
await asRole('authenticated', ids.ownerB, async () => {
  await db.query(`select * from public.provision_owner_salon('Blade Barber','blade-barber','barber_mens_grooming')`);
});
ok('second owner provisions their own distinct live slug');

// 4. Template switch is data-safe. Seed a service/product/booking under A's
//    salon with the CURRENT theme, then switch templates twice.
const themeBefore = (await db.query(
  `select theme_id from public.salons where id=$1`, [row.out_salon_id],
)).rows[0].theme_id;
const beautyTheme = (await db.query(`select id from public.themes where theme_id='beauty_skin_spa'`)).rows[0].id;
assert.equal(themeBefore, beautyTheme);

await db.query(`insert into public.services (salon_id,theme_id,name) values ($1,$2,'Signature Facial')`, [row.out_salon_id, beautyTheme]);
await db.query(`insert into public.products (salon_id,name) values ($1,'Vitamin C Serum')`, [row.out_salon_id]);
await db.query(`insert into public.bookings (salon_id,customer_name) values ($1,'Neha')`, [row.out_salon_id]);

let switched;
await asRole('authenticated', ids.ownerA, async () => {
  const res = await db.query(`select * from public.set_owner_salon_template('nail_lash_studio')`);
  switched = res.rows[0];
});
assert.equal(switched.out_template_id, 'nail_lash_studio');
const afterSwitch = (await db.query(`
  select
    (select count(*)::int from public.services where salon_id=$1)::int as services,
    (select count(*)::int from public.products where salon_id=$1)::int as products,
    (select count(*)::int from public.bookings where salon_id=$1)::int as bookings,
    (select theme_id from public.salons where id=$1) as theme_id,
    (select template_key from public.salon_public_websites where salon_id=$1) as template_key
`, [row.out_salon_id])).rows[0];
assert.equal(afterSwitch.services, 1, 'services must survive template switch');
assert.equal(afterSwitch.products, 1, 'products must survive template switch');
assert.equal(afterSwitch.bookings, 1, 'bookings must survive template switch');
const nailTheme = (await db.query(`select id from public.themes where theme_id='nail_lash_studio'`)).rows[0].id;
assert.equal(afterSwitch.theme_id, nailTheme);
assert.equal(afterSwitch.template_key, 'nail_lash_studio');
ok('template switch updates presentation ONLY (services/products/bookings intact)');

// Switch back to original — data still present and reversible.
await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select * from public.set_owner_salon_template('beauty_skin_spa')`);
});
const back = (await db.query(`select count(*)::int n from public.services where salon_id=$1`, [row.out_salon_id])).rows[0].n;
assert.equal(back, 1);
ok('switching A→B→A is fully reversible with no data loss');

// 5. RLS / public read: anon can read the PUBLISHED row (dynamic site render).
let anonRow;
await asRole('anon', '', async () => {
  const res = await db.query(
    `select slug, template_key from public.salon_public_websites where slug='royal-hair-studio' and is_published=true`,
  );
  anonRow = res.rows[0];
});
assert.ok(anonRow, 'anon must be able to read a published website');
assert.equal(anonRow.template_key, 'beauty_skin_spa');
ok('anonymous visitors can read published salon websites (dynamic /[slug] render)');

// Unauthenticated template switch is rejected. The function is granted to
// authenticated only, so anon is denied at the ACL check (42501) before the
// auth.uid() null-check (28000) is even reached; either is acceptable.
await asRole('anon', '', async () => {
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_template('hair_studio_color_bar')`),
    /log in|28000|permission denied|42501/i,
  );
});
ok('anonymous users cannot change a template');

// B cannot switch A's template (their session resolves only B's salon).
await asRole('authenticated', ids.ownerB, async () => {
  await db.query(`select * from public.set_owner_salon_template('family_full_service')`);
});
const aThemeAfterB = (await db.query(`select template_key from public.salon_public_websites where salon_id=$1`, [row.out_salon_id])).rows[0].template_key;
assert.equal(aThemeAfterB, 'beauty_skin_spa');
ok('owner B cannot change owner A template (RLS ownership boundary)');

console.log(`\nWhite-label provisioning: ${passed}/${passed} checks PASS`);
await db.close();
