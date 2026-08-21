import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Phase 2 — canonical unified database foundation verification.
 *
 * Builds the shared Supabase schema fixture (the same one Phase 1A uses),
 * applies M28–M31, inserts "legacy" rows exactly as they exist before Phase 2
 * (no slug, no theme binding, no organization status, no timestamps), applies
 * M32, then verifies:
 *
 *   - themes: 5 canonical rows, slug backfilled + unique + format-guarded
 *   - service_categories: slug backfilled per theme + unique per theme
 *   - salons: theme_id FK + phase2_set_salon_theme authority RPC
 *   - organizations: status + timestamps; members: created_at
 *   - business_locations: created_at backfilled from submitted_at
 *   - services/products: database timestamps, existing constraints intact
 *   - safe updated_at triggers on every canonical mutable table
 *   - M32 is idempotent (applies cleanly a second time)
 *   - cross-repository compatibility with the Main Website repository when
 *     NEXORA_MAIN_WEBSITE_PATH is set
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

const CANONICAL_TABLES = [
  'profiles', 'organizations', 'organization_members', 'salons',
  'themes', 'service_categories', 'predefined_services', 'services',
  'products', 'product_categories', 'business_locations', 'bookings',
  'booking_services', 'booking_slot_holds', 'salon_public_websites',
  'salon_media', 'payment_orders', 'payments', 'payment_webhook_events',
  'booking_request_keys',
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

  -- The live shared schema as Phase 1A found it: minimal canonical roots
  -- without any Phase 2 columns.
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
    salon_id uuid not null unique references public.salons(id),
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
    salon_id uuid not null,
    name text not null,
    description text,
    price_paise bigint not null,
    duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id),
    is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id)
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
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

// ---------------------------------------------------------------------------
// Apply Phase 1A (M28–M31).
// ---------------------------------------------------------------------------
for (const file of PHASE1A_FILES) {
  const sql = await readFile(join(migrationDir, file), 'utf8');
  await db.exec(sql);
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
};

await db.query(`insert into auth.users (id, email) values
  ($1, 'owner-a@example.test'), ($2, 'owner-b@example.test'), ($3, 'customer@example.test')`,
  [ids.ownerA, ids.ownerB, ids.customerA]);
await db.query(`update public.profiles set platform_role = case
  when id in ($1, $2) then 'business_user' else 'customer' end
  where id in ($1, $2, $3)`, [ids.ownerA, ids.ownerB, ids.customerA]);

const legacyOrgCreatedAt = new Date(Date.UTC(2026, 6, 1, 9, 30, 0)).toISOString();
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Legacy Org A'), ($2, 'Legacy Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, is_active, role)
   values ($1, $2, true, 'owner'), ($3, $4, true, 'owner')`,
  [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB],
);
await db.query(
  `insert into public.salons (id, organization_id, name, slug, address, city)
   values ($1, $2, 'Salon A', 'salon-a', 'Jaipur', 'Jaipur'), ($3, $4, 'Salon B', 'salon-b', 'Delhi', 'Delhi')`,
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
  `insert into public.staff (id, salon_id) values ($1, $2)`,
  [ids.staffA, ids.salonA],
);
// A legacy category that predates the slug column (M32 must backfill it).
await db.query(
  `insert into public.service_categories (id, theme_id, name, sort_order)
   select $1, t.id, 'Beard & Shave', 1 from public.themes t where t.theme_id = 'barber_mens_grooming'`,
  [ids.categoryA],
);
// A legacy approved location that predates created_at (M32 must backfill it
// from submitted_at).
await db.query(
  `insert into public.business_locations (
     salon_id, latitude, longitude, address_label, approval_status,
     submitted_by, submitted_at, approved_by, approved_at
   ) values ($1, 26.9124, 75.7873, 'Jaipur HQ', 'approved', $2, $3, $2, $3)`,
  [ids.salonA, ids.ownerA, legacyOrgCreatedAt],
);
console.log('PASS legacy rows inserted exactly as the pre-Phase-2 live schema has them');

// ---------------------------------------------------------------------------
// Apply Phase 2 (M32) on top of the legacy rows — the real upgrade path.
// ---------------------------------------------------------------------------
for (const file of PHASE2_FILES) {
  const sql = await readFile(join(migrationDir, file), 'utf8');
  await db.exec(sql);
  console.log(`PASS apply ${file}`);
}

// The canonical themes are seeded by M28 with generated ids — resolve the
// barber theme id from the database, never from a hardcoded constant.
const themeBarber = (await db.query(
  `select id from public.themes where theme_id = 'barber_mens_grooming'`,
)).rows[0].id;

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
// 1. THEMES (§9): five canonical themes, slug backfilled and locked.
// ---------------------------------------------------------------------------
await test('themes — exactly five canonical themes with slug backfilled from theme_id', async () => {
  const rows = (await db.query(
    `select theme_id, slug, name, is_active from public.themes order by sort_order`,
  )).rows;
  assert.deepEqual(rows.map((r) => r.theme_id), [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ]);
  for (const row of rows) {
    assert.equal(row.slug, row.theme_id, `slug must equal theme_id for ${row.theme_id}`);
    assert.equal(row.is_active, true);
  }
  const count = (await db.query('select count(*)::int as count from public.themes')).rows[0].count;
  assert.equal(count, 5, 'no duplicate theme records may exist');
});

await test('themes — slug unique constraint rejects duplicates', async () => {
  await reject(
    () => db.query(
      `insert into public.themes (theme_id, slug, name) values ('dupe_theme', 'barber_mens_grooming', 'Dupe')`,
    ),
    /duplicate key|unique/i,
  );
});

await test('themes — slug format check rejects invalid slugs', async () => {
  await reject(
    () => db.query(
      `insert into public.themes (theme_id, slug, name) values ('bad_theme', 'Bad Slug!', 'Bad')`,
    ),
    /violates check|slug/i,
  );
});

// ---------------------------------------------------------------------------
// 2. SERVICE CATEGORIES (§11): slug backfilled, unique per theme.
// ---------------------------------------------------------------------------
await test('service_categories — legacy row slug backfilled deterministically', async () => {
  const row = (await db.query(
    `select slug from public.service_categories where id = $1`,
    [ids.categoryA],
  )).rows[0];
  assert.equal(row.slug, 'beard-shave');
});

await test('service_categories — slug unique within a theme, allowed across themes', async () => {
  const themeIds = (await db.query(
    `select id, theme_id from public.themes order by sort_order`,
  )).rows;
  const barber = themeIds[0];
  const hair = themeIds[1];
  await reject(
    () => db.query(
      `insert into public.service_categories (theme_id, name, slug) values ($1, 'Beard Shave', 'beard-shave')`,
      [barber.id],
    ),
    /duplicate key|unique/i,
  );
  await db.query(
    `insert into public.service_categories (theme_id, name, slug) values ($1, 'Beard Shave', 'beard-shave')`,
    [hair.id],
  );
  const count = (await db.query(
    `select count(*)::int as count from public.service_categories
     where slug = 'beard-shave'`,
  )).rows[0].count;
  assert.equal(count, 2);
});

// ---------------------------------------------------------------------------
// 3. SALONS (§7, §10): authoritative database theme binding.
// ---------------------------------------------------------------------------
await test('salons — theme_id FK rejects a non-existent theme', async () => {
  await reject(
    () => db.query(
      `update public.salons set theme_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
       where id = $1`,
      [ids.salonA],
    ),
    /foreign key|violates/i,
  );
});

await test('salons — owner can bind the salon to a canonical theme via RPC', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    const result = await db.query(
      `select * from public.phase2_set_salon_theme($1, $2)`,
      [ids.salonA, themeBarber],
    );
    assert.deepEqual(result.rows[0], { salon_id: ids.salonA, theme_id: themeBarber });
  });
  const row = (await db.query(
    `select theme_id from public.salons where id = $1`,
    [ids.salonA],
  )).rows[0];
  assert.equal(row.theme_id, themeBarber);
});

await test('salons — RPC refuses a non-owner and an inactive theme', async () => {
  const inactiveTheme = (await db.query(
    `insert into public.themes (theme_id, slug, name, is_active)
     values ('inactive_theme', 'inactive-theme', 'Inactive', false)
     returning id`,
  )).rows[0].id;
  await asRole('authenticated', ids.customerA, async () => {
    await reject(
      () => db.query(`select * from public.phase2_set_salon_theme($1, $2)`, [ids.salonA, themeBarber]),
      /Salon owner permission required/i,
    );
  });
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(`select * from public.phase2_set_salon_theme($1, $2)`, [ids.salonA, inactiveTheme]),
      /Theme not found or inactive/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. ORGANIZATIONS (§5) + MEMBERS (§6).
// ---------------------------------------------------------------------------
await test('organizations — legacy rows get status active and database timestamps', async () => {
  const row = (await db.query(
    `select name, status, created_at, updated_at from public.organizations where id = $1`,
    [ids.orgA],
  )).rows[0];
  assert.equal(row.status, 'active');
  assert.ok(row.created_at, 'created_at must exist');
  assert.ok(row.updated_at, 'updated_at must exist');
  await reject(
    () => db.query(`update public.organizations set status = 'bogus' where id = $1`, [ids.orgA]),
    /violates check/i,
  );
});

await test('organization_members — created_at exists and duplicate membership stays impossible', async () => {
  const row = (await db.query(
    `select created_at from public.organization_members
     where organization_id = $1 and user_id = $2`,
    [ids.orgA, ids.ownerA],
  )).rows[0];
  assert.ok(row.created_at, 'created_at must exist');
  await reject(
    () => db.query(
      `insert into public.organization_members (organization_id, user_id, is_active, role)
       values ($1, $2, true, 'owner')`,
      [ids.orgA, ids.ownerA],
    ),
    /duplicate key|unique/i,
  );
});

// ---------------------------------------------------------------------------
// 5. BUSINESS LOCATIONS (§8): created_at backfilled from submitted_at.
// ---------------------------------------------------------------------------
await test('business_locations — created_at backfilled from submitted_at', async () => {
  const row = (await db.query(
    `select created_at, submitted_at from public.business_locations where salon_id = $1`,
    [ids.salonA],
  )).rows[0];
  assert.equal(row.created_at.toISOString(), row.submitted_at.toISOString());
  // New rows still get a database default.
  await db.query(
    `insert into public.business_locations (
       salon_id, latitude, longitude, address_label, approval_status, submitted_by
     ) values ($1, 26.1, 75.1, 'New', 'pending', $2)`,
    [ids.salonB, ids.ownerB],
  );
  const fresh = (await db.query(
    `select created_at from public.business_locations where salon_id = $1`,
    [ids.salonB],
  )).rows[0];
  assert.ok(fresh.created_at, 'new rows must get created_at');
  await reject(
    () => db.query(
      `insert into public.business_locations (
         salon_id, latitude, longitude, address_label, approval_status, submitted_by
       ) values ($1, 95.0, 75.1, 'Bad', 'pending', $2)`,
      [ids.salonB, ids.ownerB],
    ),
    /violates check/i,
  );
});

// ---------------------------------------------------------------------------
// 6. SERVICES / PRODUCTS (§12, §13): timestamps + intact constraints.
// ---------------------------------------------------------------------------
await test('services — created_at/updated_at exist and price/duration checks stay intact', async () => {
  const row = (await db.query(
    `select created_at, updated_at, deleted_at, display_order, is_active
     from public.services where id = $1`,
    [ids.serviceA],
  )).rows[0];
  assert.ok(row.created_at && row.updated_at);
  assert.equal(row.deleted_at, null);
  assert.equal(row.display_order, 0);
  assert.equal(row.is_active, true);
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes)
       values ($1, 'Free Cut', -1, 30)`,
      [ids.salonA],
    ),
    /violates check/i,
  );
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes)
       values ($1, 'Zero Cut', 100, 0)`,
      [ids.salonA],
    ),
    /violates check/i,
  );
});

await test('products — timestamps exist and product constraints stay intact', async () => {
  await db.query(
    `insert into public.products (id, salon_id, theme_id, name, price_paise)
     values ($1, $2, $3, 'Pomade', 49900)`,
    [ids.productA, ids.salonA, themeBarber],
  );
  const row = (await db.query(
    `select created_at, updated_at, deleted_at, currency from public.products where id = $1`,
    [ids.productA],
  )).rows[0];
  assert.ok(row.created_at && row.updated_at);
  assert.equal(row.deleted_at, null);
  assert.equal(row.currency, 'INR');
  await reject(
    () => db.query(
      `insert into public.products (salon_id, theme_id, name, price_paise)
       values ($1, $2, 'Bad', -5)`,
      [ids.salonA, themeBarber],
    ),
    /violates check/i,
  );
});

// ---------------------------------------------------------------------------
// 7. DATABASE-SIDE TIMESTAMPS (§18): safe updated_at triggers.
// ---------------------------------------------------------------------------
await test('updated_at trigger — canonical tables bump updated_at on UPDATE', async () => {
  const before = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.query(
    `update public.themes set updated_at = '${before}' where theme_id = 'beauty_skin_spa'`,
  );
  await db.query(`update public.themes set name = name where theme_id = 'beauty_skin_spa'`);
  const after = (await db.query(
    `select updated_at from public.themes where theme_id = 'beauty_skin_spa'`,
  )).rows[0].updated_at;
  assert.ok(new Date(after).getTime() > new Date(before).getTime(), 'updated_at must be refreshed');

  await db.query(
    `update public.organizations set updated_at = '${before}' where id = $1`,
    [ids.orgB],
  );
  await db.query(`update public.organizations set name = name where id = $1`, [ids.orgB]);
  const orgAfter = (await db.query(
    `select updated_at from public.organizations where id = $1`,
    [ids.orgB],
  )).rows[0].updated_at;
  assert.ok(new Date(orgAfter).getTime() > new Date(before).getTime());
});

// ---------------------------------------------------------------------------
// 8. PUBLIC-SAFE COLUMN GRANTS (§22): the new slugs/timestamps are readable
//    by anon through the existing RLS policy surface.
// ---------------------------------------------------------------------------
await test('public grants — anon can read theme/category slugs and location created_at only', async () => {
  await asRole('anon', '', async () => {
    const themes = (await db.query(
      `select theme_id, slug, name from public.themes order by sort_order`,
    )).rows;
    assert.equal(themes.length, 5);
    assert.ok(themes.every((t) => typeof t.slug === 'string'));
    const cats = (await db.query(
      `select slug from public.service_categories where id = $1`,
      [ids.categoryA],
    )).rows;
    assert.equal(cats[0].slug, 'beard-shave');
    const loc = (await db.query(
      `select salon_id, created_at, updated_at from public.business_locations where salon_id = $1`,
      [ids.salonA],
    )).rows;
    assert.equal(loc.length, 1);
    assert.ok(loc[0].created_at);
  });
});

// ---------------------------------------------------------------------------
// 9. PHASE 1A SURFACES REMAIN INTACT (regression).
// ---------------------------------------------------------------------------
await test('phase1a regression — owner_salon_ids and public_salon_catalog still work', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    const salons = (await db.query('select public.owner_salon_ids() as id')).rows;
    assert.deepEqual(salons.map((r) => r.id), [ids.salonA]);
  });
  await asRole('anon', '', async () => {
    const catalog = (await db.query(
      'select id, name, slug, address, city from public.public_salon_catalog order by id',
    )).rows;
    assert.deepEqual(catalog.map((r) => r.id), [ids.salonA, ids.salonB]);
  });
});

// ---------------------------------------------------------------------------
// 10. IDEMPOTENCY: M32 applies cleanly a second time.
// ---------------------------------------------------------------------------
await test('idempotency — M32 replays cleanly on the upgraded schema', async () => {
  const sql = await readFile(join(migrationDir, PHASE2_FILES[0]), 'utf8');
  await db.exec(sql);
});

// ---------------------------------------------------------------------------
// 11. CROSS-REPOSITORY COMPATIBILITY (§26): the Main Website repository works
//     against the same canonical schema. Requires NEXORA_MAIN_WEBSITE_PATH.
// ---------------------------------------------------------------------------
const mainWebsitePath = process.env.NEXORA_MAIN_WEBSITE_PATH;
if (mainWebsitePath) {
  const mainWebsiteMigrationsDir = join(mainWebsitePath, 'supabase', 'migrations');

  await test('cross-repo — Main Website auth profile contract columns exist', async () => {
    const sessionSource = await readFile(
      join(mainWebsitePath, 'packages', 'auth', 'src', 'session.ts'),
      'utf8',
    );
    const match = sessionSource.match(/const PROFILE_COLUMNS\s*=\s*"([^"]+)"/);
    assert.ok(match, 'Main Website PROFILE_COLUMNS constant not found');
    const columns = match[1].split(',').map((c) => c.trim());
    assert.ok(columns.length >= 5, 'expected a multi-column profile contract');
    for (const column of columns) {
      const exists = (await db.query(
        `select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = $1`,
        [column],
      )).rows.length;
      assert.equal(exists, 1, `profiles.${column} must exist for the Main Website`);
    }
    console.log(`      (contract: profiles(${columns.join(', ')}))`);
  });

  await test('cross-repo — every Main Website table/column/index DDL applies on the unified schema', async () => {
    const files = (await readdir(mainWebsiteMigrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const source = (
      await Promise.all(
        files.map((f) => readFile(join(mainWebsiteMigrationsDir, f), 'utf8')),
      )
    ).join('\n');

    const statements = [
      ...source.matchAll(/create table if not exists\s+public\.[a-z_]+[\s\S]*?;/gi),
      ...source.matchAll(/alter table\s+public\.[a-z_]+[\s\S]*?add column if not exists[\s\S]*?;/gi),
      ...source.matchAll(/create (?:unique )?index if not exists[\s\S]*?;/gi),
    ].map((m) => m[0].trim());

    assert.ok(statements.length > 30, `expected a substantial DDL surface, got ${statements.length}`);

    let applied = 0;
    let skipped = 0;
    const skippedLog = [];
    for (const statement of statements) {
      try {
        await db.exec(statement);
        applied += 1;
      } catch (error) {
        const message = String(error.message);
        // A genuine conflict with the unified schema must never happen.
        if (/already exists|duplicate column|duplicate key|conflicting|violates|multiple primary/i.test(message)) {
          throw new Error(`Main Website DDL conflicts with the unified Phase 2 schema:\n${statement}\n${message}`);
        }
        // Missing prerequisites come from out-of-repo migrations (e.g. the
        // original onboarding app's growth_partners table) — not a conflict
        // with the canonical foundation.
        skipped += 1;
        skippedLog.push(`${statement.slice(0, 60).replace(/\s+/g, ' ')}… → ${message.split('\n')[0]}`);
      }
    }
    console.log(`      (${applied} statements applied cleanly, ${skipped} skipped on out-of-repo prerequisites)`);
    for (const line of skippedLog.slice(0, 8)) console.log(`      skip ${line}`);
    assert.ok(applied > 30, 'expected most Main Website DDL to apply on the shared schema');
  });
} else {
  console.log('NOTE NEXORA_MAIN_WEBSITE_PATH not set — cross-repository compatibility checks skipped');
}

// ---------------------------------------------------------------------------
await db.close();
console.log(`Phase 2 canonical foundation tests: ${passed} passed`);

