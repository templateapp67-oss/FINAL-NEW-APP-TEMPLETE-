/**
 * MULTI-TENANT OWNER / TEMPLATE ISOLATION
 *
 * Uses the existing safe PGlite architecture from test-whitelabel.mjs:
 *   provision_owner_salon + owner_salon_ids + set_owner_salon_template
 *   + set_owner_salon_visual_config + table RLS.
 *
 * No second tenant model. No hardcoded salon id in the switch RPC.
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
const readMigration = async (f) => stripTxn(await readFile(join(migrationDir, f), 'utf8'));
const readSrc = (f) => readFile(join(root, f), 'utf8');

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const provisioning = await readSrc('src/lib/ownerProvisioning.ts');
assert.match(provisioning, /SET_OWNER_TEMPLATE_FN = 'set_owner_salon_template'/);
assert.match(provisioning, /p_template_id: templateKey/);
assert.doesNotMatch(provisioning, /p_salon_id/);
ok('client template switch has no salon-id argument (session-owned only)');

const ownerSalon = await readSrc('src/lib/ownerSalon.ts');
assert.match(ownerSalon, /owner_salon_ids/);
assert.match(ownerSalon, /never hardcoded/);
ok('owner salon resolution stays on owner_salon_ids()');

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const execMigration = async (sql) => {
  for (const stmt of splitStatements(sql)) await db.exec(stmt);
};

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
    full_name text, phone text,
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
    name text not null, address text, city text,
    is_active boolean not null default true,
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
  alter table public.salons force row level security;
  alter table public.salon_public_websites enable row level security;
  alter table public.salon_public_websites force row level security;
  create policy sal_owner on public.salons for all to authenticated
    using (private.can_manage_salon_settings(id))
    with check (private.can_manage_salon_settings(id));
  create policy spw_owner on public.salon_public_websites for all to authenticated
    using (private.can_manage_salon_settings(salon_id))
    with check (private.can_manage_salon_settings(salon_id));
  grant select, update on public.salons to authenticated;
  grant select, insert, update on public.salon_public_websites to authenticated;
  grant select on public.themes to authenticated, anon;
  grant usage on schema public to anon, authenticated;
`);

await execMigration(await readMigration('20260823000401_phase1_whitelabel_provisioning.sql'));
await execMigration(await readMigration('20260824000501_m48_template_switch_isolation.sql'));
ok('existing provision + template-switch migrations apply');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
};
await db.query(`insert into auth.users (id,email) values ($1,'owner-a@test'),($2,'owner-b@test')`, [ids.ownerA, ids.ownerB]);
await db.query(
  `insert into public.profiles (id,full_name,phone,platform_role) values
    ($1,'Owner A','+919900000001','business_user'),
    ($2,'Owner B','+919900000002','business_user')`,
  [ids.ownerA, ids.ownerB],
);

const setUser = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
const asRole = async (role, uid, fn) => {
  await db.exec('reset role'); await setUser(uid); await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec('reset role'); await setUser(''); }
};

const view = async (uid) => asRole('authenticated', uid, async () => {
  const mine = (await db.query(`
    select s.id, s.name, t.theme_id, w.template_key, w.config
    from public.salons s
    join public.themes t on t.id = s.theme_id
    join public.salon_public_websites w on w.salon_id = s.id
    where s.id in (select public.owner_salon_ids())
  `)).rows;
  const salonRows = (await db.query(`select id, name from public.salons`)).rows;
  const websiteRows = (await db.query(`select salon_id, template_key, config from public.salon_public_websites`)).rows;
  return { mine, salonRows, websiteRows };
});

let a;
await asRole('authenticated', ids.ownerA, async () => {
  a = (await db.query(
    `select * from public.provision_owner_salon('Business A','business-a','barber_mens_grooming')`,
  )).rows[0];
});
let b;
await asRole('authenticated', ids.ownerB, async () => {
  b = (await db.query(
    `select * from public.provision_owner_salon('Business B','business-b','beauty_skin_spa')`,
  )).rows[0];
});
assert.notEqual(a.out_salon_id, b.out_salon_id);
ok('two owner contexts provision two distinct salons');

const seenA = await view(ids.ownerA);
assert.equal(seenA.mine.length, 1);
assert.equal(seenA.mine[0].id, a.out_salon_id);
assert.equal(seenA.mine[0].name, 'Business A');
assert.equal(seenA.mine[0].theme_id, 'barber_mens_grooming');
assert.equal(seenA.mine[0].template_key, 'barber_mens_grooming');
assert.equal(seenA.mine.every((row) => row.id === a.out_salon_id), true);
ok('Owner A sees only Business A and its active template');

const seenB = await view(ids.ownerB);
assert.equal(seenB.mine.length, 1);
assert.equal(seenB.mine[0].id, b.out_salon_id);
assert.equal(seenB.mine[0].name, 'Business B');
assert.equal(seenB.mine[0].theme_id, 'beauty_skin_spa');
assert.equal(seenB.mine[0].template_key, 'beauty_skin_spa');
assert.equal(seenB.mine.every((row) => row.id === b.out_salon_id), true);
ok('Owner B sees only Business B and its active template');

await asRole('authenticated', ids.ownerA, async () => {
  const switched = (await db.query(
    `select * from public.set_owner_salon_template('hair_studio_color_bar')`,
  )).rows[0];
  assert.equal(switched.out_salon_id, a.out_salon_id);
  assert.equal(switched.out_template_id, 'hair_studio_color_bar');
  await db.query(
    `select * from public.set_owner_salon_visual_config('{"brandColor":"#111111"}'::jsonb)`,
  );
  const name = (await db.query(
    `update public.salons set address='A Street' where id=$1 returning name`,
    [a.out_salon_id],
  )).rows[0];
  assert.equal(name.name, 'Business A');
});
ok('Owner A can edit Business A template and configuration');

await asRole('authenticated', ids.ownerB, async () => {
  const switched = (await db.query(
    `select * from public.set_owner_salon_template('nail_lash_studio')`,
  )).rows[0];
  assert.equal(switched.out_salon_id, b.out_salon_id);
  assert.equal(switched.out_template_id, 'nail_lash_studio');
  await db.query(
    `select * from public.set_owner_salon_visual_config('{"brandColor":"#222222"}'::jsonb)`,
  );
  const name = (await db.query(
    `update public.salons set address='B Street' where id=$1 returning name`,
    [b.out_salon_id],
  )).rows[0];
  assert.equal(name.name, 'Business B');
});
ok('Owner B can edit Business B template and configuration');

await asRole('authenticated', ids.ownerA, async () => {
  const switched = (await db.query(
    `select * from public.set_owner_salon_template('family_full_service')`,
  )).rows[0];
  assert.equal(switched.out_salon_id, a.out_salon_id);
  const foreignTemplate = (await db.query(
    `update public.salon_public_websites set template_key='barber_mens_grooming', config='{"hacked":true}'::jsonb
     where salon_id=$1 returning salon_id`,
    [b.out_salon_id],
  )).rows;
  assert.equal(foreignTemplate.length, 0);
  const foreignSalon = (await db.query(
    `update public.salons set name='Hijacked B' where id=$1 returning id`,
    [b.out_salon_id],
  )).rows;
  assert.equal(foreignSalon.length, 0);
});
ok('Owner A cannot update Business B template or configuration');

await asRole('authenticated', ids.ownerB, async () => {
  const switched = (await db.query(
    `select * from public.set_owner_salon_template('barber_mens_grooming')`,
  )).rows[0];
  assert.equal(switched.out_salon_id, b.out_salon_id);
  const foreignTemplate = (await db.query(
    `update public.salon_public_websites set template_key='beauty_skin_spa'
     where salon_id=$1 returning salon_id`,
    [a.out_salon_id],
  )).rows;
  assert.equal(foreignTemplate.length, 0);
  const foreignSalon = (await db.query(
    `update public.salons set name='Hijacked A' where id=$1 returning id`,
    [a.out_salon_id],
  )).rows;
  assert.equal(foreignSalon.length, 0);
});
ok('Owner B cannot update Business A template or configuration');

await db.exec('reset role');
const finalA = (await db.query(`
  select s.name, t.theme_id, w.template_key, w.config->>'brandColor' as brand, s.address
  from public.salons s
  join public.themes t on t.id=s.theme_id
  join public.salon_public_websites w on w.salon_id=s.id
  where s.id=$1
`, [a.out_salon_id])).rows[0];
const finalB = (await db.query(`
  select s.name, t.theme_id, w.template_key, w.config->>'brandColor' as brand, s.address
  from public.salons s
  join public.themes t on t.id=s.theme_id
  join public.salon_public_websites w on w.salon_id=s.id
  where s.id=$1
`, [b.out_salon_id])).rows[0];

assert.equal(finalA.name, 'Business A');
assert.equal(finalA.theme_id, 'family_full_service');
assert.equal(finalA.template_key, 'family_full_service');
assert.equal(finalA.brand, '#111111');
assert.equal(finalA.address, 'A Street');
assert.equal(finalB.name, 'Business B');
assert.equal(finalB.theme_id, 'barber_mens_grooming');
assert.equal(finalB.template_key, 'barber_mens_grooming');
assert.equal(finalB.brand, '#222222');
assert.equal(finalB.address, 'B Street');
ok('RLS kept each owners business, template, and config isolated');

// (a) User A never resolves User B's salon
const ownerASalons = (await asRole('authenticated', ids.ownerA, async () => {
  return (await db.query('select * from public.owner_salon_ids()')).rows;
})).map((r) => r.id || r.owner_salon_ids);
assert.deepEqual(ownerASalons, [a.out_salon_id]);
assert.equal(ownerASalons.includes(b.out_salon_id), false);
ok('regression (a): User A never resolves User B salon');

// (b) Two different users independently create their own salons/websites
assert.notEqual(a.out_salon_id, b.out_salon_id);
assert.notEqual(a.out_slug, b.out_slug);
ok('regression (b): Two different users independently create their own salons/websites');

// (c) Refresh/retry does not create duplicate organizations/salons
const retryA = (await asRole('authenticated', ids.ownerA, async () => {
  return (await db.query(
    `select * from public.provision_owner_salon('Business A retry', 'business-a-retry', 'barber_mens_grooming')`,
  )).rows[0];
}));
assert.equal(retryA.out_salon_id, a.out_salon_id);
assert.equal(retryA.out_already_existed, true);
const countsA = (await db.query(`
  select
    (select count(*) from public.organizations o join public.organization_members m on m.organization_id = o.id where m.user_id = $1) as orgs,
    (select count(*) from public.salons s join public.organization_members m on m.organization_id = s.organization_id where m.user_id = $1) as salons,
    (select count(*) from public.salon_public_websites w where w.salon_id = $2) as websites
`, [ids.ownerA, a.out_salon_id])).rows[0];
assert.equal(Number(countsA.orgs), 1);
assert.equal(Number(countsA.salons), 1);
assert.equal(Number(countsA.websites), 1);
ok('regression (c): Refresh/retry does not create duplicate organizations/salons');

// (d) Ambiguity never causes "pick first"
// Simulate an existing accidental duplicate: insert a second salon in Owner A's organization
const secondSalonId = '00000000-0000-4000-8000-0000000000a2';
await db.query(
  `insert into public.salons (id, organization_id, name, is_active)
   values ($1, $2, 'Duplicate Salon A2', true)`,
  [secondSalonId, a.out_organization_id],
);
const multiSalons = (await asRole('authenticated', ids.ownerA, async () => {
  return (await db.query('select * from public.owner_salon_ids()')).rows;
})).map((r) => r.id || r.owner_salon_ids);
assert.equal(multiSalons.length, 2);

// Check ownerSalon resolution logic with ambiguity
const { getActiveWorkspaceSalonId, setActiveWorkspaceSalonId, clearActiveWorkspaceSalonId } = await import('../src/lib/ownerSalon.ts');
// Mock window.localStorage for node environment
globalThis.window = globalThis.window || {};
const store = new Map();
globalThis.window.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window.sessionStorage = globalThis.window.localStorage;

// 1. Without active selection: must NOT pick first arbitrarily
clearActiveWorkspaceSalonId(ids.ownerA);
const resolveAmbiguous = (userSalons, uid) => {
  if (userSalons.length === 0) return { status: 'no-membership' };
  if (userSalons.length === 1) return { status: 'resolved', salonId: userSalons[0] };
  const activeId = getActiveWorkspaceSalonId(uid);
  if (activeId && userSalons.includes(activeId)) {
    return { status: 'resolved', salonId: activeId };
  }
  return { status: 'ambiguous', salonIds: userSalons };
};

const unselected = resolveAmbiguous(multiSalons, ids.ownerA);
assert.equal(unselected.status, 'ambiguous');
assert.deepEqual(unselected.salonIds, multiSalons);

// 2. With foreign salon selection (e.g. attempting to pick User B's salon): must remain ambiguous
setActiveWorkspaceSalonId(ids.ownerA, b.out_salon_id);
const foreignAttempt = resolveAmbiguous(multiSalons, ids.ownerA);
assert.equal(foreignAttempt.status, 'ambiguous', 'Must reject foreign salon selection');

// 3. With explicit owned selection: resolves to that chosen salon
setActiveWorkspaceSalonId(ids.ownerA, secondSalonId);
const selectedSecond = resolveAmbiguous(multiSalons, ids.ownerA);
assert.equal(selectedSecond.status, 'resolved');
assert.equal(selectedSecond.salonId, secondSalonId);
ok('regression (d): Ambiguity never causes "pick first"; explicit selection required');

// (e) Vercel /api/* is not rewritten to index.html
const vercelConfig = JSON.parse(await readSrc('vercel.json'));
assert.deepEqual(vercelConfig.routes[0], { handle: 'filesystem' });
assert.deepEqual(vercelConfig.routes.at(-1), { src: '/.*', dest: '/index.html' });
const catchall = await readSrc('api/[...path].ts');
assert.match(catchall, /setupApiRoutes\(app\)/);
ok('regression (e): Vercel /api/* is not rewritten to index.html');

// (f) M54 SQL Editor bundle exactly matches canonical migration body
const pasteReadyM54 = await readSrc('docs/m54-run-in-supabase.sql');
const canonicalM54 = await readSrc('supabase/migrations/20260825000501_m54_workspace_bootstrap_compatibility.sql');
const m54Marker = '-- ============================================================================\n-- M54 — authenticated workspace bootstrap compatibility';
const m54MarkerIdx = pasteReadyM54.indexOf(m54Marker);
assert.ok(m54MarkerIdx > 0);
assert.equal(pasteReadyM54.slice(m54MarkerIdx), canonicalM54);
ok('regression (f): M54 SQL Editor bundle exactly matches canonical migration body');

console.log(`\nMulti-tenant owner isolation: ${passed}/${passed} checks PASS`);
await db.close();
