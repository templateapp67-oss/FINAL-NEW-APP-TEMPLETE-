/**
 * Phase 1 — Owner auth + onboarding + 5-template system tests.
 *
 * Runs entirely in PGlite (no live Supabase) and verifies:
 *   - M42 provision_owner_salon() creates org + owner membership + salon
 *     for a brand-new authenticated user, is idempotent, and is denied to
 *     anon / unauthenticated callers.
 *   - owner_salon_ids() only returns the caller's own salon (RLS isolation).
 *   - M43 RLS isolation checks are green; no client INSERT on orgs/salons.
 *   - The five canonical themes are the only selectable templates and the
 *     frontend normalises legacy 'hair'/'family-salon' ids forward.
 *   - Template switching never clears business data (services stay).
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

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

// --- Minimal canonical Design-B shape (mirrors M38 + the helpers the
// provisioning RPC and RLS depend on). We do NOT replay M28–M41 here (some
// depend on objects PGlite lacks); we build exactly the tables/functions the
// Phase 1 migrations M42/M43 touch. -------------------------------------
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
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema if not exists private;

  create table if not exists public.profiles (
    id uuid primary key,
    full_name text,
    platform_role text not null default 'customer',
    is_active boolean not null default true,
    email text,
    updated_at timestamptz not null default now()
  );

  create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists public.organization_members (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'staff',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (organization_id, user_id),
    constraint om_role_check check (role in ('owner','staff'))
  );

  create table if not exists public.themes (
    id uuid primary key default gen_random_uuid(),
    theme_id text not null unique,
    name text not null,
    slug text unique,
    is_active boolean not null default true
  );

  create table if not exists public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    theme_id uuid references public.themes(id),
    name text not null,
    address text, city text,
    is_active boolean not null default true,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    slug text not null,
    template_key text,
    config jsonb not null default '{}'::jsonb,
    is_published boolean not null default false,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (salon_id)
  );

  create table if not exists public.services (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid references public.salons(id),
    theme_id uuid references public.themes(id),
    name text not null,
    is_active boolean not null default true,
    deleted_at timestamptz
  );

  insert into public.themes (theme_id, name, slug) values
    ('barber_mens_grooming',   'Barber & Men''s Grooming',   'barber_mens_grooming'),
    ('hair_studio_color_bar',  'Hair Studio & Color Bar',    'hair_studio_color_bar'),
    ('beauty_skin_spa',        'Beauty, Skin & Spa',         'beauty_skin_spa'),
    ('family_full_service',    'Full-Service Family Salon',  'full_service_family_salon'),
    ('nail_lash_studio',       'Nail & Lash Studio',         'nail_lash_studio')
  on conflict do nothing;

  -- Ownership helpers (same shape as M28/M38).
  create or replace function private.is_active_admin() returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.platform_role = 'admin')
  $$;
  create or replace function private.has_salon_role(p_salon_id uuid, p_roles text[] default array['owner','staff']) returns boolean language sql stable security definer set search_path = '' as $$
    select private.is_active_admin() or exists (
      select 1 from public.salons s
      join public.organization_members om on om.organization_id = s.organization_id
      join public.profiles p on p.id = om.user_id
      where s.id = p_salon_id and s.deleted_at is null and s.is_active
        and om.user_id = auth.uid() and om.is_active and om.role = any(p_roles) and p.is_active
    )
  $$;
  create or replace function private.can_manage_salon_settings(p_salon_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
    select private.has_salon_role(p_salon_id, array['owner'])
  $$;
  create or replace function private.is_public_salon(p_salon_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.salons s where s.id = p_salon_id and s.is_active and s.deleted_at is null)
  $$;
  create or replace function public.owner_salon_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
    select sal.id from public.salons sal
    join public.organization_members om on om.organization_id = sal.organization_id
    join public.profiles p on p.id = om.user_id
    where om.user_id = auth.uid() and om.is_active and om.role = 'owner' and p.is_active
      and sal.is_active and sal.deleted_at is null
  $$;
  grant execute on function public.owner_salon_ids() to authenticated;

  -- RLS
  alter table public.profiles enable row level security;
  alter table public.organizations enable row level security;
  alter table public.organization_members enable row level security;
  alter table public.salons enable row level security;
  alter table public.salon_public_websites enable row level security;
  alter table public.services enable row level security;

  create policy om_self_read on public.organization_members for select to authenticated using (user_id = auth.uid());
  create policy salons_member_select on public.salons for select to authenticated using (private.has_salon_role(id));
  create policy spw_owner_all on public.salon_public_websites for all to authenticated
    using (private.can_manage_salon_settings(salon_id)) with check (private.can_manage_salon_settings(salon_id));
  create policy services_member_all on public.services for all to authenticated using (private.has_salon_role(salon_id)) with check (private.has_salon_role(salon_id));

  revoke all on public.organizations from anon;
  revoke all on public.salons from anon;
  revoke insert, update, delete on public.organization_members from anon, authenticated;
  revoke insert, delete on public.organizations from anon, authenticated;
  revoke insert, delete on public.salons from anon, authenticated;
  grant select on public.organizations, public.salons to authenticated;
  grant select, insert, update, delete on public.services to authenticated;
  grant select, insert, update, delete on public.salon_public_websites to authenticated;
  grant usage on schema public to anon, authenticated;
`);

// Apply the Phase 1 migrations under test.
await db.exec(await sqlOf('20260823000201_m42_owner_self_provisioning.sql'));
await db.exec(await sqlOf('20260823000301_m43_rls_isolation_verify.sql'));
ok('M42 + M43 apply cleanly on the canonical schema');

// verify_m43 is green.
const m43 = (await db.query('select check_name, ok from public.verify_m43_rls_isolation()')).rows;
assert.ok(m43.length > 0, 'M43 returned no rows');
assert.ok(m43.every((r) => r.ok === true), JSON.stringify(m43.filter((r) => !r.ok)));
ok('verify_m43_rls_isolation() is green (RLS + no client inserts)');

const ids = {
  newOwner: '00000000-0000-4000-8000-000000000001',
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
};
await db.query(`insert into auth.users (id, email) values ($1,'new@x'),($2,'a@x'),($3,'b@x')`,
  [ids.newOwner, ids.ownerA, ids.ownerB]);
await db.query(`insert into public.profiles (id, platform_role) values ($1,'customer'),($2,'business_user'),($3,'business_user')`,
  [ids.newOwner, ids.ownerA, ids.ownerB]);
await db.query(`insert into public.organizations (id, name) values ($1,'Org A'),($2,'Org B')`, [ids.orgA, ids.orgB]);
await db.query(`insert into public.organization_members (organization_id, user_id, role) values ($1,$2,'owner'),($3,$4,'owner')`,
  [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB]);
await db.query(`insert into public.salons (id, organization_id, name) values ($1,$2,'A'),($3,$4,'B')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB]);
await db.query(`insert into public.services (salon_id, name) values ($1,'A-cut'),($2,'B-cut')`,
  [ids.salonA, ids.salonB]);

const setUser = (userId) =>
  db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || '']);
const asRole = async (role, userId, fn) => {
  await db.exec('reset role');
  await setUser(userId);
  await db.exec(`set role ${role}`);
  try { return await fn(); }
  finally {
    await db.exec('reset role');
    await setUser('');
  }
};

// --- provisioning ---------------------------------------------------------
// Unauthenticated call is rejected — anon has no EXECUTE grant (42501) and an
// authenticated caller without a session is rejected by the auth.uid() guard.
await asRole('anon', '', async () => {
  await assert.rejects(
    () => db.query(`select * from public.provision_owner_salon('Nope')`),
    (err) => /permission denied|log in|28000/i.test(err.message),
  );
});
ok('provisioning rejected for unauthenticated callers');

// A brand-new customer with NO membership gets an org+membership+salon.
let provisioned;
await asRole('authenticated', ids.newOwner, async () => {
  const res = await db.query(
    `select * from public.provision_owner_salon($1, 'nail_lash_studio')`,
    ['Glow Studio'],
  );
  provisioned = res.rows[0];
});
assert.equal(provisioned.out_already_existed, false);
assert.ok(provisioned.out_salon_id && provisioned.out_organization_id);
ok('first signup provisions org + owner membership + salon');

const newSalonId = provisioned.out_salon_id;

// Profile promoted to business_user (owner).
const profile = (await db.query(
  `select platform_role from public.profiles where id = $1`, [ids.newOwner],
)).rows[0];
assert.equal(profile.platform_role, 'business_user');
ok('new owner profile promoted to business_user');

// Salon theme set to the requested canonical template.
const themed = (await db.query(
  `select t.theme_id from public.salons s join public.themes t on t.id = s.theme_id where s.id = $1`,
  [newSalonId],
)).rows[0];
assert.equal(themed.theme_id, 'nail_lash_studio');
ok('provisioned salon uses the selected canonical template (template #5)');

// Idempotent: calling again returns the SAME salon and creates nothing new.
let again;
await asRole('authenticated', ids.newOwner, async () => {
  const res = await db.query(`select * from public.provision_owner_salon('Different Name', 'barber_mens_grooming')`);
  again = res.rows[0];
});
assert.equal(again.out_salon_id, newSalonId);
assert.equal(again.out_already_existed, true);
const orgCount = (await db.query(
  `select count(*)::int n from public.organizations where name = 'Different Name'`,
)).rows[0].n;
assert.equal(orgCount, 0, 're-provision must not rename an existing salon');
ok('provisioning is idempotent (second call changes nothing)');

// owner_salon_ids() for the new owner returns exactly the provisioned salon.
let owned;
await asRole('authenticated', ids.newOwner, async () => {
  owned = (await db.query(`select owner_salon_ids as id from public.owner_salon_ids()`)).rows.map((r) => r.id);
});
assert.deepEqual(owned, [newSalonId]);
ok('owner_salon_ids() resolves the provisioned salon');

// --- RLS isolation --------------------------------------------------------
// Owner A sees only salon A (never B), and only A's services.
let aSalons, aServices;
await asRole('authenticated', ids.ownerA, async () => {
  aSalons = (await db.query(`select id from public.salons`)).rows.map((r) => r.id);
  aServices = (await db.query(`select name from public.services`)).rows.map((r) => r.name);
});
assert.deepEqual(aSalons.sort(), [ids.salonA]);
assert.deepEqual(aServices, ['A-cut']);
ok('Owner A cannot read Owner B salon or services (RLS isolation)');

// Owner B symmetrically cannot see A.
let bSalons;
await asRole('authenticated', ids.ownerB, async () => {
  bSalons = (await db.query(`select id from public.salons`)).rows.map((r) => r.id);
});
assert.deepEqual(bSalons.sort(), [ids.salonB]);
ok('Owner B cannot read Owner A salon (RLS isolation)');

// Browser client cannot directly INSERT an organization or salon.
await asRole('authenticated', ids.ownerA, async () => {
  await assert.rejects(() => db.query(`insert into public.organizations (name) values ('hack')`));
  await assert.rejects(() => db.query(`insert into public.salons (organization_id, name) values ($1,'hack')`, [ids.orgA]));
});
ok('client cannot directly create orgs/salons (provisioning RPC only)');

// --- Five canonical templates (frontend constants) ------------------------
const { THEME_IDS, DEFAULT_THEME_ID, normalizeThemeId } = await import(
  '../src/lib/themeServices.ts'
);
assert.equal(THEME_IDS.length, 5, 'expected exactly 5 selectable templates');
assert.deepEqual(THEME_IDS, [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
]);
assert.equal(DEFAULT_THEME_ID, 'barber_mens_grooming');
ok('exactly 5 templates, canonical order, default = #1 Barber');

// Legacy ids normalise forward; nothing maps to the retired 'hair' starter.
for (const [legacy, expected] of [
  ['hair', 'barber_mens_grooming'],
  ['barber', 'barber_mens_grooming'],
  ['family-salon', 'family_full_service'],
  ['wellness', 'beauty_skin_spa'],
  ['hair-studio', 'hair_studio_color_bar'],
  [undefined, 'barber_mens_grooming'],
  [null, 'barber_mens_grooming'],
]) {
  assert.equal(normalizeThemeId(legacy), expected, `normalize(${legacy})`);
}
ok('legacy template ids normalise to the 5 canonical templates');
assert.ok(!THEME_IDS.includes('hair'), 'retired hair theme not selectable');
ok('the retired unisex "hair" starter is not offered as a template');

// --- Template switching does NOT clear business data ----------------------
// App.handleThemeChange must only update templateId. We assert the source
// never wipes services/packages on a theme change (regression guard).
const appSource = await readFile(join(root, 'src', 'App.tsx'), 'utf8');
const themeHandlerMatch = appSource.match(/const handleThemeChange[\s\S]*?\n  \};/);
assert.ok(themeHandlerMatch, 'handleThemeChange not found');
assert.ok(!/services:\s*\[\]/.test(themeHandlerMatch[0]), 'handleThemeChange must not clear services');
assert.ok(!/packages:\s*\[\]/.test(themeHandlerMatch[0]), 'handleThemeChange must not clear packages');
assert.ok(
  /templateId:\s*nextTheme/.test(themeHandlerMatch[0])
    || /switchSalonTemplatePresentation\(/.test(themeHandlerMatch[0]),
  'handleThemeChange must apply the selected presentation template',
);
ok('template switching updates only presentation (services/packages preserved)');

console.log(`\nPhase 1 owner auth: ${passed}/${passed} checks PASS`);
await db.close();
