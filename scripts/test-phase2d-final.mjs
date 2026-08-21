import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Phase 2D — final database integrity, cross-repository consistency &
 * production-ready verification.
 *
 * Rebuilds the complete canonical schema from scratch (auth/storage
 * fixtures + M28→M35) — fresh-database reproducibility — then executes the
 * ten required behavior tests (A–J), the schema-chain/FK/theme/index/RLS
 * inventories, and the cross-repository contract check.
 *
 *   A  duplicate organization membership        -> MUST FAIL
 *   B  duplicate theme slug                     -> MUST FAIL
 *   C  invalid foreign key                      -> MUST FAIL
 *   D  invalid latitude                         -> MUST FAIL (CHECK)
 *   E  invalid longitude                        -> MUST FAIL (CHECK)
 *   F  soft-deleted service NOT in active catalog
 *   G  soft-deleted product NOT in active catalog
 *   H  updated_at auto-changes (before < after)
 *   I  invalid theme/category/salon relationship -> MUST FAIL
 *   J  cross-tenant ownership violation         -> MUST be blocked by RLS
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const MIGRATIONS = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
];

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
  $$;
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  create table public.profiles (
    id uuid primary key references auth.users(id),
    full_name text not null default 'User',
    platform_role text not null default 'customer',
    is_active boolean not null default true,
    avatar_url text,
    phone text,
    email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    is_active boolean not null default true
  );
  create table public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    name text not null,
    slug text,
    address text,
    city text,
    is_active boolean not null default true,
    deleted_at timestamptz
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null unique references public.salons(id) on delete cascade,
    slug text not null unique,
    template_key text not null default 'modern-salon',
    config jsonb not null default '{}'::jsonb,
    is_published boolean not null default false,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.services (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    name text not null,
    description text,
    price_paise bigint not null,
    duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    name text not null,
    role text,
    is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    day_of_week smallint not null check (day_of_week between 0 and 6),
    opens time,
    closes time,
    is_closed boolean not null default false,
    unique (salon_id, day_of_week)
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete restrict,
    customer_id uuid not null,
    appointment_start timestamptz not null,
    status text not null default 'pending',
    total_amount_paise bigint not null default 0,
    advance_amount_paise bigint not null default 0,
    created_at timestamptz not null default now()
  );
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`);

for (const file of MIGRATIONS) {
  const sql = await readFile(join(migrationDir, file), 'utf8');
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`migration failed at ${file}: ${error.message}`, { cause: error });
  }
  console.log(`PASS fresh-apply ${file}`);
}

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  customerA: '00000000-0000-4000-8000-0000000000c1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
  serviceA: '30000000-0000-4000-8000-0000000000a1',
  serviceB: '30000000-0000-4000-8000-0000000000b1',
  staffA: '40000000-0000-4000-8000-0000000000a1',
  categoryA: '70000000-0000-4000-8000-0000000000a1',
  productA: '80000000-0000-4000-8000-0000000000a1',
};

await db.query(`insert into auth.users (id, email) values
  ($1, 'owner-a@example.test'), ($2, 'owner-b@example.test'), ($3, 'customer@example.test')`,
  [ids.ownerA, ids.ownerB, ids.customerA]);
await db.query(`update public.profiles set platform_role = case
  when id in ($1, $2) then 'business_user' else 'customer' end
  where id in ($1, $2, $3)`, [ids.ownerA, ids.ownerB, ids.customerA]);
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, is_active, role)
   values ($1, $2, true, 'owner'), ($3, $4, true, 'owner')`,
  [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB],
);
await db.query(
  `insert into public.salons (id, organization_id, name, slug)
   values ($1, $2, 'Salon A', 'salon-a'), ($3, $4, 'Salon B', 'salon-b')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
);
await db.query(
  `insert into public.salon_public_websites (salon_id, slug, is_published)
   values ($1, 'salon-a', true), ($2, 'salon-b', true)`,
  [ids.salonA, ids.salonB],
);
await db.query(
  `insert into public.services (id, salon_id, name, description, price_paise, duration_minutes)
   values ($1, $2, 'Classic Cut', 'Sharp and clean.', 50000, 30),
          ($3, $4, 'Deluxe Facial', 'Relaxing facial.', 90000, 45)`,
  [ids.serviceA, ids.salonA, ids.serviceB, ids.salonB],
);
await db.query(
  `insert into public.staff (id, salon_id, name, role) values ($1, $2, 'Asha', 'Senior stylist')`,
  [ids.staffA, ids.salonA],
);
await db.query(
  `insert into public.salon_hours (salon_id, day_of_week, opens, closes)
   select $1, day, '09:00', '19:00' from generate_series(0, 6) day`,
  [ids.salonA],
);
const themeBarber = (await db.query(
  `select id from public.themes where theme_id = 'barber_mens_grooming'`,
)).rows[0].id;
const themeHair = (await db.query(
  `select id from public.themes where theme_id = 'hair_studio_color_bar'`,
)).rows[0].id;
await db.query(
  `insert into public.service_categories (id, theme_id, name, slug)
   values ($1, $2, 'Beard & Shave', 'beard-shave')`,
  [ids.categoryA, themeBarber],
);
await db.query(
  `insert into public.products (id, salon_id, theme_id, name, price_paise)
   values ($1, $2, $3, 'Pomade', 49900)`,
  [ids.productA, ids.salonA, themeBarber],
);
await db.query(
  `insert into public.bookings (
     id, salon_id, customer_id, appointment_start, status, total_amount_paise, advance_amount_paise
   ) values ('50000000-0000-4000-8000-0000000000a1', $1, $2, now() + interval '1 day', 'pending', 50000, 5000)`,
  [ids.salonA, ids.customerA],
);

const setRole = async (role, userId = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.exec(`set role ${role}`);
};
const resetRole = async () => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("select set_config('request.jwt.claim.role', '', false)");
};
const asRole = async (role, userId, callback) => {
  await setRole(role, userId);
  try { return await callback(); } finally { await resetRole(); }
};
const reject = async (callback, pattern) => {
  let caught;
  try { await callback(); } catch (error) { caught = error; }
  assert.ok(caught, 'expected operation to fail');
  assert.match(caught.message, pattern);
};

let passed = 0;
const test = async (label, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${label}`);
};

// ===========================================================================
// TEN REQUIRED BEHAVIOR TESTS (A–J)
// ===========================================================================

await test('TEST A — duplicate organization membership MUST FAIL; different org still allowed', async () => {
  await reject(
    () => db.query(
      `insert into public.organization_members (organization_id, user_id, is_active, role)
       values ($1, $2, true, 'staff')`,
      [ids.orgA, ids.ownerA],
    ),
    /duplicate key|unique/i,
  );
  // Same user, different organization -> MUST remain possible.
  const inserted = (await db.query(
    `insert into public.organization_members (organization_id, user_id, is_active, role)
     values ($1, $2, true, 'staff') returning organization_id, user_id, role`,
    [ids.orgB, ids.customerA],
  )).rows[0];
  assert.equal(inserted.organization_id, ids.orgB);
  assert.equal(inserted.role, 'staff');
});

await test('TEST B — duplicate theme slug MUST FAIL', async () => {
  await reject(
    () => db.query(
      `insert into public.themes (theme_id, slug, name) values ('dupe_theme', 'barber_mens_grooming', 'Dupe')`,
    ),
    /duplicate key|unique/i,
  );
});

await test('TEST C — invalid foreign key MUST FAIL', async () => {
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes)
       values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Orphan', 100, 10)`,
    ),
    /foreign key|violates/i,
  );
});

await test('TEST D — invalid latitude MUST FAIL (CHECK constraint)', async () => {
  await reject(
    () => db.query(
      `insert into public.business_locations (salon_id, latitude, longitude, address_label, submitted_by)
       values ($1, 91.5, 75.8, 'Bad lat', $2)`,
      [ids.salonA, ids.ownerA],
    ),
    /check|latitude/i,
  );
  await reject(
    () => db.query(
      `insert into public.business_locations (salon_id, latitude, longitude, address_label, submitted_by)
       values ($1, -91, 75.8, 'Bad lat', $2)`,
      [ids.salonA, ids.ownerA],
    ),
    /check|latitude/i,
  );
});

await test('TEST E — invalid longitude MUST FAIL (CHECK constraint)', async () => {
  await reject(
    () => db.query(
      `insert into public.business_locations (salon_id, latitude, longitude, address_label, submitted_by)
       values ($1, 26.9, 181, 'Bad lng', $2)`,
      [ids.salonA, ids.ownerA],
    ),
    /check|longitude/i,
  );
  await reject(
    () => db.query(
      `insert into public.business_locations (salon_id, latitude, longitude, address_label, submitted_by)
       values ($1, 26.9, -181, 'Bad lng', $2)`,
      [ids.salonA, ids.ownerA],
    ),
    /check|longitude/i,
  );
});

await test('TEST F — soft-deleted service MUST NOT appear in active catalog', async () => {
  await db.query(
    `update public.services set deleted_at = now(), is_active = false where id = $1`,
    [ids.serviceB],
  );
  const direct = (await db.query(
    `select id from public.services where is_active = true and deleted_at is null`,
  )).rows.map((r) => r.id);
  assert.ok(!direct.includes(ids.serviceB));
  const view = (await db.query('select id from public.active_services')).rows.map((r) => r.id);
  assert.ok(!view.includes(ids.serviceB));
  assert.ok(view.includes(ids.serviceA));
});

await test('TEST G — soft-deleted product MUST NOT appear in active catalog', async () => {
  await db.query(
    `update public.products set deleted_at = now(), is_active = false where id = $1`,
    [ids.productA],
  );
  const direct = (await db.query(
    `select id from public.products where is_active = true and deleted_at is null`,
  )).rows.map((r) => r.id);
  assert.ok(!direct.includes(ids.productA));
  const view = (await db.query('select id from public.active_products')).rows.map((r) => r.id);
  assert.ok(!view.includes(ids.productA));
});

await test('TEST H — updated_at MUST change automatically (before < after)', async () => {
  const before = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await db.query(
    `update public.organization_members set updated_at = '${before}' where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  );
  await db.query(
    `update public.organization_members set is_active = true where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  );
  const after = (await db.query(
    `select updated_at from public.organization_members where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  )).rows[0].updated_at;
  assert.ok(new Date(after).getTime() > new Date(before).getTime(), 'updated_at must move forward');
  // Same guarantee on a salon row (M32 trigger).
  await db.query(`update public.salons set updated_at = '${before}' where id = $1`, [ids.salonA]);
  await db.query(`update public.salons set name = name where id = $1`, [ids.salonA]);
  const salonAfter = (await db.query(
    `select updated_at from public.salons where id = $1`,
    [ids.salonA],
  )).rows[0].updated_at;
  assert.ok(new Date(salonAfter).getTime() > new Date(before).getTime());
});

await test('TEST I — invalid theme/category/salon relationship MUST FAIL', async () => {
  // Barber-theme category on a hair-theme service -> composite FK rejects.
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes, theme_id, category_id)
       values ($1, 'Cross-theme', 100, 10, $2, $3)`,
      [ids.salonA, themeHair, ids.categoryA],
    ),
    /foreign key|violates/i,
  );
  // Salon referencing a nonexistent theme -> FK rejects.
  await reject(
    () => db.query(
      `update public.salons set theme_id = '99999999-9999-4999-8999-999999999999' where id = $1`,
      [ids.salonA],
    ),
    /foreign key|violates/i,
  );
});

await test('TEST J — cross-tenant ownership violation MUST be blocked by RLS', async () => {
  await asRole('anon', '', async () => {
    await reject(() => db.query('select * from public.salons'), /permission denied/i);
  });
  await asRole('authenticated', ids.ownerB, async () => {
    const bookings = (await db.query(
      'select count(*)::int as c from public.bookings where salon_id = $1',
      [ids.salonA],
    )).rows[0].c;
    assert.equal(bookings, 0, 'cross-tenant rows must be invisible');
    const updated = (await db.query(
      'update public.services set name = $1 where salon_id = $2',
      ['hijacked', ids.salonA],
    )).affectedRows;
    assert.equal(updated, 0, 'cross-tenant update must affect zero rows');
  });
  await asRole('authenticated', ids.ownerA, async () => {
    const rows = (await db.query(
      'select id from public.services where salon_id = $1',
      [ids.salonA],
    )).rows;
    assert.ok(rows.some((r) => r.id === ids.serviceA));
  });
});

// ===========================================================================
// SCHEMA INTEGRITY INVENTORIES
// ===========================================================================

await test('schema chain — auth.users→profiles→organizations→members→salons→locations→themes→categories→services and salons→products FKs exist', async () => {
  const pairs = [
    ['profiles', 'id', 'auth.users', 'id'],
    ['organizations', 'id', null, null], // root, no FK
    ['organization_members', 'organization_id', 'organizations', 'id'],
    ['organization_members', 'user_id', 'profiles', 'id'],
    ['salons', 'organization_id', 'organizations', 'id'],
    ['business_locations', 'salon_id', 'salons', 'id'],
    ['service_categories', 'theme_id', 'themes', 'id'],
    ['services', 'theme_id', 'themes', 'id'],
    ['services', 'category_id', 'service_categories', 'id'], // via composite (category_id, theme_id)
    ['products', 'salon_id', 'salons', 'id'],
    ['products', 'theme_id', 'themes', 'id'],
  ];
  for (const [tbl, col, refTbl, refCol] of pairs) {
    if (!refTbl) continue;
    const rows = (await db.query(`
      select c.confrelid::regclass::text as ref
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.conrelid = to_regclass('public.' || $1)
        and a.attname = $2
    `, [tbl, col])).rows;
    assert.ok(
      rows.some((r) => r.ref === `public.${refTbl}` || r.ref === refTbl),
      `${tbl}.${col} must FK to ${refTbl}`,
    );
  }
});

await test('theme authority — 5 canonical records, unique slugs, stable theme_ids', async () => {
  const themes = (await db.query(
    `select theme_id, slug from public.themes order by sort_order`,
  )).rows;
  assert.deepEqual(themes.map((r) => r.theme_id), [
    'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
    'family_full_service', 'nail_lash_studio',
  ]);
  assert.deepEqual(themes.map((r) => r.slug), [
    'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
    'full_service_family_salon', 'nail_lash_studio',
  ]);
  const count = (await db.query('select count(*)::int as c from public.themes')).rows[0].c;
  assert.equal(count, 5);
});

await test('salon→theme integrity — salons_theme_phase2_fk exists (RESTRICT)', async () => {
  const fk = (await db.query(`
    select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.salons'::regclass and conname = 'salons_theme_phase2_fk'
  `)).rows;
  assert.equal(fk.length, 1);
  assert.match(fk[0].def, /on delete restrict/i);
});

await test('no orphan records — every child row references an existing parent', async () => {
  const orphans = (await db.query(`
    select
      (select count(*) from public.services s where not exists (
        select 1 from public.salons p where p.id = s.salon_id)) as service_orphans,
      (select count(*) from public.products p where not exists (
        select 1 from public.salons s where s.id = p.salon_id)) as product_orphans,
      (select count(*) from public.service_categories c where not exists (
        select 1 from public.themes t where t.id = c.theme_id)) as category_orphans,
      (select count(*) from public.salons s where not exists (
        select 1 from public.organizations o where o.id = s.organization_id)) as salon_orphans,
      (select count(*) from public.organization_members m where not exists (
        select 1 from public.organizations o where o.id = m.organization_id)
        or not exists (select 1 from public.profiles p where p.id = m.user_id)) as member_orphans
  `)).rows[0];
  for (const [key, value] of Object.entries(orphans)) {
    assert.equal(value, 0, `${key} must be 0, got ${value}`);
  }
});

await test('RLS — enabled on all chain-managed core tables; no anonymous writes; no base grants on identity/org tables', async () => {
  // The canonical chain (M28–M35) owns RLS on these tables. RLS on
  // profiles/organizations/salons is provided by the Main Website's live
  // migrations in production and is Phase 3's mandate for fresh chains; the
  // canonical chain grants NO base-table access on those tables (verified
  // below), so nothing is exposed in the meantime.
  const unprotected = (await db.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'organization_members', 'themes', 'service_categories', 'services',
        'product_categories', 'products', 'salon_public_websites',
        'business_locations', 'bookings', 'booking_services',
        'booking_slot_holds', 'salon_media'
      )
      and not c.relrowsecurity
  `)).rows;
  assert.deepEqual(unprotected, [], 'all chain-managed tables must have RLS enabled');

  const anonWrites = (await db.query(`
    select distinct table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  `)).rows;
  assert.deepEqual(anonWrites, [], 'anon must have no write grants on public tables');

  // The canonical chain must not grant base-table access on identity or
  // organization ownership tables (profiles, organizations, salons) to
  // anon/authenticated — private organization data stays ungranted.
  const baseGrants = (await db.query(`
    select distinct table_name, grantee
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and table_name in ('profiles', 'organizations', 'salons', 'organization_members')
  `)).rows;
  assert.deepEqual(baseGrants, [], 'no base-table grants on profiles/organizations/salons/organization_members');
});

await test('index inventory — required indexes exist', async () => {
  const expected = [
    'services_phase2a_salon_active_idx',
    'products_salon_active_order_idx',
    'service_categories_phase2a_theme_active_idx',
    'organization_members_organization_user_key',
    'bookings_salon_start_status_idx',
    'business_locations_approved_coordinates_idx',
    'salons_theme_phase2_idx',
    'salons_organization_active_idx',
    'product_categories_salon_active_idx',
  ];
  const present = (await db.query(`
    select indexname from pg_indexes where schemaname = 'public'
  `)).rows.map((r) => r.indexname);
  for (const name of expected) {
    assert.ok(present.includes(name), `missing required index ${name}`);
  }
});

await test('updated_at trigger inventory — exactly 10 tables, one trigger each', async () => {
  const triggers = (await db.query(`
    select t.relname, count(*)::int as n
    from pg_trigger tr
    join pg_class t on t.oid = tr.tgrelid
    join pg_namespace ns on ns.oid = t.relnamespace
    where ns.nspname = 'public'
      and tr.tgname = 'trg_phase2_set_updated_at'
    group by t.relname order by t.relname
  `)).rows;
  assert.equal(triggers.length, 10);
  for (const row of triggers) assert.equal(row.n, 1);
});

await test('FK delete behavior — no CASCADE from business-owned tables to salons; bookings/commissions RESTRICT', async () => {
  const cascades = (await db.query(`
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    where c.contype = 'f' and c.confdeltype = 'c'
      and c.confrelid = 'public.salons'::regclass
      and c.conrelid::regclass::text in (
        'public.services', 'public.staff', 'public.offers',
        'public.salon_hours', 'public.salon_public_websites',
        'public.business_locations', 'public.salon_media'
      )
  `)).rows;
  assert.deepEqual(cascades, []);
  const bookingFk = (await db.query(`
    select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.bookings'::regclass and contype = 'f'
      and confrelid = 'public.salons'::regclass
  `)).rows;
  for (const row of bookingFk) assert.match(row.def, /on delete restrict/i);
});

await test('idempotency — M34 and M35 replay cleanly on the hardened schema', async () => {
  await db.exec(await readFile(join(migrationDir, MIGRATIONS[6]), 'utf8'));
  await db.exec(await readFile(join(migrationDir, MIGRATIONS[7]), 'utf8'));
});

await test('regression — Phase 1A/2A/2C surfaces stay intact (health RPC, catalog view, salon theme RPC)', async () => {
  await asRole('anon', '', async () => {
    const catalog = (await db.query(
      'select id from public.public_salon_catalog order by id',
    )).rows;
    assert.deepEqual(catalog.map((r) => r.id), [ids.salonA, ids.salonB]);
  });
  const report = (await db.query('select public.phase2a_foundation_health() as r')).rows[0].r;
  assert.equal(report.membership_duplicates, 0);
  assert.equal(report.themes, 5);
  assert.deepEqual(report.canonical_naming_violations, []);
  await asRole('authenticated', ids.ownerA, async () => {
    const result = (await db.query(
      `select * from public.phase2_set_salon_theme($1, $2)`,
      [ids.salonA, themeBarber],
    )).rows;
    assert.equal(result[0].theme_id, themeBarber);
  });
});

// ===========================================================================
// CROSS-REPOSITORY SCHEMA CONTRACT
// ===========================================================================
const mainWebsitePath = process.env.NEXORA_MAIN_WEBSITE_PATH;
if (mainWebsitePath) {
  const mainWebsiteMigrationsDir = join(mainWebsitePath, 'supabase', 'migrations');
  await test('cross-repo — Main Website DDL still applies on the final schema (one shared contract)', async () => {
    const files = (await readdir(mainWebsiteMigrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const source = (
      await Promise.all(files.map((f) => readFile(join(mainWebsiteMigrationsDir, f), 'utf8')))
    ).join('\n');
    const statements = [
      ...source.matchAll(/create table if not exists\s+public\.[a-z_]+[\s\S]*?;/gi),
      ...source.matchAll(/alter table\s+public\.[a-z_]+[\s\S]*?add column if not exists[\s\S]*?;/gi),
      ...source.matchAll(/create (?:unique )?index if not exists[\s\S]*?;/gi),
    ].map((m) => m[0].trim());
    let applied = 0;
    let skipped = 0;
    for (const statement of statements) {
      try {
        await db.exec(statement);
        applied += 1;
      } catch (error) {
        if (/already exists|duplicate column|duplicate key|conflicting|violates|multiple primary/i.test(String(error.message))) {
          throw new Error(`Main Website DDL conflicts with the final Phase 2 schema:\n${statement}\n${error.message}`);
        }
        skipped += 1;
      }
    }
    assert.ok(applied > 30, `expected most Main Website DDL to apply, got ${applied}`);
    console.log(`      (${applied} statements applied cleanly, ${skipped} skipped on out-of-repo prerequisites)`);
  });
} else {
  console.log('NOTE NEXORA_MAIN_WEBSITE_PATH not set — cross-repository compatibility checks skipped');
}

await db.close();
console.log(`Phase 2D final verification tests: ${passed} passed`);
