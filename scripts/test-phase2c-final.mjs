import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Phase 2C — actual implementation & final verification (M28–M35).
 *
 * Rebuilds the shared schema from scratch (auth/storage fixtures +
 * M28–M35), seeds legacy rows, then executes the seven required final
 * database tests plus FK-rule, role, soft-delete, updated_at, view and
 * RLS verification:
 *
 *   1. duplicate organization membership      -> MUST FAIL
 *   2. duplicate theme slug                   -> MUST FAIL
 *   3. invalid foreign key                    -> MUST FAIL
 *   4. soft-deleted service                   -> MUST NOT appear in active catalog
 *   5. soft-deleted product                   -> MUST NOT appear in active catalog
 *   6. updated_at on mutable records          -> MUST change automatically
 *   7. cross-theme category/service pair      -> MUST FAIL (composite FK)
 *   8. unauthorized cross-tenant access       -> MUST be denied by existing RLS
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const PHASE1A_FILES = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
];
const PHASE2_FILES = ['20260821000501_m32_phase2_canonical_foundation.sql'];
const PHASE2A_FILES = ['20260821000601_m33_phase2a_hardening.sql'];
const PHASE2B_FILES = ['20260821000701_m34_phase2b_final_hardening.sql'];
const PHASE2C_FILES = ['20260821000801_m35_phase2c_canonical_theme_slugs.sql'];

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

  -- Pre-M28 shared-schema shape, including the live CASCADE FKs that M34
  -- must replace with RESTRICT (services/staff/hours/website/location).
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
  create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null
  );
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
  grant select on public.profiles, public.organizations, public.organization_members,
    public.salons, public.salon_public_websites, public.services, public.staff,
    public.salon_hours, public.bookings to anon, authenticated, service_role;
  grant insert, update, delete on public.bookings to authenticated, service_role;
`);

for (const file of [...PHASE1A_FILES, ...PHASE2_FILES, ...PHASE2A_FILES, ...PHASE2B_FILES, ...PHASE2C_FILES]) {
  const sql = await readFile(join(migrationDir, file), 'utf8');
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`migration failed at ${file}: ${error.message}`, { cause: error });
  }
  console.log(`PASS apply ${file}`);
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
  mediaA: '90000000-0000-4000-8000-0000000000a1',
  mediaB: '90000000-0000-4000-8000-0000000000a2',
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
  `insert into public.salon_media (
     id, salon_id, service_id, media_type, storage_bucket, storage_path, status, created_by
   ) values ($1, $2, $3, 'service', 'salon-media', $4, 'active', $5)`,
  [ids.mediaA, ids.salonA, ids.serviceA, `salon/${ids.salonA}/service/a.webp`, ids.ownerA],
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

// ---------------------------------------------------------------------------
// A. FK DELETE RULES (§2): the live CASCADE FKs were replaced with RESTRICT.
// ---------------------------------------------------------------------------
await test('FK rules — no CASCADE FK from business-owned tables to salons remains', async () => {
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
  assert.deepEqual(cascades, [], 'all salon-owned CASCADE FKs must be RESTRICT');
});

await test('FK rules — deleting a salon with services/bookings is refused', async () => {
  await reject(
    () => db.query('delete from public.salons where id = $1', [ids.salonA]),
    /foreign key|violates/i,
  );
});

await test('FK rules — deleting a service that still has media is refused', async () => {
  await reject(
    () => db.query('delete from public.services where id = $1', [ids.serviceA]),
    /foreign key|violates/i,
  );
});

// ---------------------------------------------------------------------------
// B. FINAL DATABASE TESTS (§17).
// ---------------------------------------------------------------------------
await test('FINAL 1 — duplicate organization membership is rejected', async () => {
  await reject(
    () => db.query(
      `insert into public.organization_members (organization_id, user_id, is_active, role)
       values ($1, $2, true, 'staff')`,
      [ids.orgA, ids.ownerA],
    ),
    /duplicate key|unique/i,
  );
});

await test('FINAL 2 — duplicate theme slug is rejected', async () => {
  await reject(
    () => db.query(
      `insert into public.themes (theme_id, slug, name) values ('dupe_theme', 'barber_mens_grooming', 'Dupe')`,
    ),
    /duplicate key|unique/i,
  );
});

await test('FINAL 3 — invalid foreign key is rejected', async () => {
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes)
       values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Orphan', 100, 10)`,
    ),
    /foreign key|violates/i,
  );
});

await test('FINAL 4 — soft-deleted service never appears in the active catalog', async () => {
  await db.query(
    `update public.services set deleted_at = now(), is_active = false where id = $1`,
    [ids.serviceB],
  );
  const direct = (await db.query(
    `select id from public.services where is_active = true and deleted_at is null`,
  )).rows.map((r) => r.id);
  assert.ok(!direct.includes(ids.serviceB), 'direct active query excludes soft-deleted service');
  const view = (await db.query('select id from public.active_services')).rows.map((r) => r.id);
  assert.ok(!view.includes(ids.serviceB), 'active_services view excludes soft-deleted service');
  assert.ok(view.includes(ids.serviceA), 'active_services view still lists the live service');
});

await test('FINAL 5 — soft-deleted product never appears in the active catalog', async () => {
  await db.query(
    `update public.products set deleted_at = now(), is_active = false where id = $1`,
    [ids.productA],
  );
  const direct = (await db.query(
    `select id from public.products where is_active = true and deleted_at is null`,
  )).rows.map((r) => r.id);
  assert.ok(!direct.includes(ids.productA), 'direct active query excludes soft-deleted product');
  const view = (await db.query('select id from public.active_products')).rows.map((r) => r.id);
  assert.ok(!view.includes(ids.productA), 'active_products view excludes soft-deleted product');
});

await test('soft delete — staff.deleted_at exists and excludes staff from the marketplace query', async () => {
  const col = (await db.query(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'deleted_at'
  `)).rows;
  assert.equal(col.length, 1, 'staff.deleted_at must exist (Main Website marketplace contract)');
  await db.query(
    `update public.staff set deleted_at = now() where id = $1`,
    [ids.staffA],
  );
  const active = (await db.query(
    `select id from public.staff where salon_id = $1 and is_active = true and deleted_at is null`,
    [ids.salonA],
  )).rows.map((r) => r.id);
  assert.ok(!active.includes(ids.staffA), 'soft-deleted staff is excluded from the marketplace query');
});

await test('FINAL 6 — updated_at changes automatically on UPDATE (no client timestamp)', async () => {
  // organization_members (new column + trigger from M34)
  const before = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await db.query(
    `update public.organization_members set updated_at = '${before}' where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  );
  await db.query(
    `update public.organization_members set is_active = true where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  );
  const memberAfter = (await db.query(
    `select updated_at from public.organization_members where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  )).rows[0].updated_at;
  assert.ok(new Date(memberAfter).getTime() > new Date(before).getTime(), 'member updated_at must refresh');

  // profiles
  await db.query(`update public.profiles set updated_at = '${before}' where id = $1`, [ids.ownerA]);
  await db.query(`update public.profiles set full_name = full_name where id = $1`, [ids.ownerA]);
  const profileAfter = (await db.query(
    `select updated_at from public.profiles where id = $1`,
    [ids.ownerA],
  )).rows[0].updated_at;
  assert.ok(new Date(profileAfter).getTime() > new Date(before).getTime(), 'profile updated_at must refresh');

  // INSERT-side database defaults
  const inserted = (await db.query(
    `insert into public.organizations (id, name) values ('eeeeeeee-0000-4000-8000-0000000000ff', 'Fresh')
     returning created_at, updated_at`,
  )).rows[0];
  assert.ok(inserted.created_at && inserted.updated_at, 'INSERT must use database timestamps');

  // Trigger inventory: M32 covered 8 tables; M34 adds the remaining two
  // (profiles, organization_members) without double-triggering anything.
  const triggers = (await db.query(`
    select t.relname, count(*)::int as n
    from pg_trigger tr
    join pg_class t on t.oid = tr.tgrelid
    join pg_namespace ns on ns.oid = t.relnamespace
    where ns.nspname = 'public'
      and tr.tgname = 'trg_phase2_set_updated_at'
    group by t.relname order by t.relname
  `)).rows;
  assert.equal(triggers.length, 10, 'exactly ten tables carry trg_phase2_set_updated_at');
  for (const row of triggers) assert.equal(row.n, 1, `${row.relname} must have exactly one trigger`);
});

await test('FINAL 7 — cross-theme category/service combination is rejected', async () => {
  // categoryA belongs to the barber theme; a hair-theme service cannot use it.
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes, theme_id, category_id)
       values ($1, 'Cross-theme', 100, 10, $2, $3)`,
      [ids.salonA, themeHair, ids.categoryA],
    ),
    /foreign key|violates/i,
  );
});

await test('FINAL 8 — unauthorized cross-tenant access is denied by existing RLS', async () => {
  // anon has no table-level grant on the salons base table: hard denial.
  await asRole('anon', '', async () => {
    await reject(() => db.query('select * from public.salons'), /permission denied/i);
  });
  // ownerB (salon B) is not a member of salon A's organization:
  //   - member-only rows (bookings) must be invisible to RLS,
  //   - member-only writes (services update) must affect zero rows.
  await asRole('authenticated', ids.ownerB, async () => {
    const bookings = (await db.query(
      'select count(*)::int as c from public.bookings where salon_id = $1',
      [ids.salonA],
    )).rows[0].c;
    assert.equal(bookings, 0, 'cross-tenant bookings must be invisible to RLS');
    const updated = (await db.query(
      'update public.services set name = $1 where salon_id = $2',
      ['hijacked', ids.salonA],
    )).affectedRows;
    assert.equal(updated, 0, 'cross-tenant update must affect zero rows');
  });
  // ownerA (member of salon A) can read its own tenant's services.
  await asRole('authenticated', ids.ownerA, async () => {
    const rows = (await db.query(
      'select id from public.services where salon_id = $1',
      [ids.salonA],
    )).rows;
    assert.ok(rows.some((r) => r.id === ids.serviceA));
  });
});

// ---------------------------------------------------------------------------
// C. ROLES, THEMES, VIEWS, REGRESSION.
// ---------------------------------------------------------------------------
await test('roles — canonical TEXT+CHECK constraints exist on both role columns', async () => {
  const profileCheck = (await db.query(`
    select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_platform_role_check'
  `)).rows;
  assert.equal(profileCheck.length, 1);
  assert.match(profileCheck[0].def, /delivery_partner/);

  const memberCheck = (await db.query(`
    select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.organization_members'::regclass and conname = 'organization_members_role_check'
  `)).rows;
  assert.equal(memberCheck.length, 1);
  assert.match(memberCheck[0].def, /owner.*staff/);
});

await test('roles — all four required app roles are readable (owner/staff/customer/admin)', async () => {
  // One authoritative two-scope system: profiles.platform_role (global) +
  // organization_members.role (tenant). Required app roles map onto it:
  //   owner    -> organization_members.role = 'owner'
  //   staff    -> organization_members.role = 'staff'
  //   customer -> profiles.platform_role = 'customer'
  //   admin    -> profiles.platform_role = 'admin'
  await db.query(
    `insert into auth.users (id, email) values
       ('11111111-0000-4000-8000-000000000001', 'staff@example.test'),
       ('11111111-0000-4000-8000-000000000002', 'admin@example.test')`,
  );
  await db.query(
    `update public.profiles set platform_role = 'admin'
     where id = '11111111-0000-4000-8000-000000000002'`,
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, is_active)
     values ($1, '11111111-0000-4000-8000-000000000001', 'staff', true)`,
    [ids.orgA],
  );
  const ownerRole = (await db.query(
    `select role from public.organization_members where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  )).rows[0].role;
  const staffRole = (await db.query(
    `select role from public.organization_members where organization_id = $1 and user_id = '11111111-0000-4000-8000-000000000001'`,
    [ids.orgA],
  )).rows[0].role;
  const customerRole = (await db.query(
    `select platform_role from public.profiles where id = $1`,
    [ids.customerA],
  )).rows[0].platform_role;
  const adminRole = (await db.query(
    `select platform_role from public.profiles where id = '11111111-0000-4000-8000-000000000002'`,
  )).rows[0].platform_role;
  assert.equal(ownerRole, 'owner');
  assert.equal(staffRole, 'staff');
  assert.equal(customerRole, 'customer');
  assert.equal(adminRole, 'admin');
});

await test('themes — five canonical themes, unique slugs, full_service_family_salon canonical', async () => {
  const themes = (await db.query(
    `select theme_id, slug, name, is_active from public.themes order by sort_order`,
  )).rows;
  assert.equal(themes.length, 5);
  assert.deepEqual(themes.map((r) => r.theme_id), [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ]);
  // Phase 2C requires the canonical public slug 'full_service_family_salon'
  // for the Full-Service Family Salon theme; theme_id stays the stable
  // internal key 'family_full_service'. M35 reconciles the slug; uniqueness
  // is enforced and duplicate insertion is rejected (FINAL 2).
  const family = themes.find((t) => t.theme_id === 'family_full_service');
  assert.equal(family.slug, 'full_service_family_salon');
  const uniqueCount = (await db.query('select count(distinct slug)::int as c from public.themes')).rows[0].c;
  assert.equal(uniqueCount, 5);
});

await test('themes — salon→theme binding RPC still works on the hardened schema', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    const result = (await db.query(
      `select * from public.phase2_set_salon_theme($1, $2)`,
      [ids.salonA, themeBarber],
    )).rows;
    assert.equal(result[0].theme_id, themeBarber);
  });
  const row = (await db.query(
    `select theme_id from public.salons where id = $1`,
    [ids.salonA],
  )).rows[0];
  assert.equal(row.theme_id, themeBarber);
});

await test('views — active_services/active_products/active_service_categories are safe and public', async () => {
  await asRole('anon', '', async () => {
    const services = (await db.query(
      'select id, name, price_paise from public.active_services order by id',
    )).rows;
    assert.deepEqual(services.map((r) => r.id), [ids.serviceA]);
    const products = (await db.query('select id from public.active_products')).rows;
    assert.deepEqual(products, [], 'soft-deleted product is absent');
    const categories = (await db.query(
      'select id, slug from public.active_service_categories order by id',
    )).rows;
    assert.deepEqual(categories.map((r) => r.id), [ids.categoryA]);
    await reject(
      () => db.query('select sku from public.active_products'),
      /permission denied|does not exist/i,
    );
  });
});

await test('idempotency — M34 and M35 replay cleanly on the hardened schema', async () => {
  const m34 = await readFile(join(migrationDir, PHASE2B_FILES[0]), 'utf8');
  await db.exec(m34);
  const m35 = await readFile(join(migrationDir, PHASE2C_FILES[0]), 'utf8');
  await db.exec(m35);
});

await test('regression — Phase 1A/2A surfaces (catalog view, health RPC, booking) stay intact', async () => {
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
});

// ---------------------------------------------------------------------------
// D. Cross-repository compatibility (§13, §16).
// ---------------------------------------------------------------------------
const mainWebsitePath = process.env.NEXORA_MAIN_WEBSITE_PATH;
if (mainWebsitePath) {
  const mainWebsiteMigrationsDir = join(mainWebsitePath, 'supabase', 'migrations');
  await test('cross-repo — Main Website DDL still applies on the final hardened schema', async () => {
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
          throw new Error(`Main Website DDL conflicts with the final Phase 2B schema:\n${statement}\n${error.message}`);
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
console.log(`Phase 2C final verification tests: ${passed} passed`);
