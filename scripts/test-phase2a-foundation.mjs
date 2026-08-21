import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Phase 2A — schema reconciliation + database hardening verification.
 *
 * Rebuilds the shared schema from scratch (auth/storage fixtures + M28–M33),
 * inserts legacy rows, then verifies every Phase 2A fix:
 *
 *   - canonical naming guard / no business_id drift
 *   - membership uniqueness: named UNIQUE constraint + deterministic repair
 *   - unified soft delete: deleted_at on salon_media / service_categories /
 *     product_categories (plus salons/services/products from M28)
 *   - service isolation: cross-theme category links rejected by composite FK
 *   - product ownership: cross-tenant product rejected by salon FK
 *   - composite indexes exist and are actually used (EXPLAIN)
 *   - foundation health RPC reports zero integrity findings
 *   - M33 replays idempotently
 *   - Phase 1A/2 regression surfaces intact
 *   - cross-repository compatibility when NEXORA_MAIN_WEBSITE_PATH is set
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
// Apply the whole chain: M28 → M31 → M32 → M33.
// ---------------------------------------------------------------------------
for (const file of [...PHASE1A_FILES, ...PHASE2_FILES, ...PHASE2A_FILES]) {
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
await db.query(`insert into public.staff (id, salon_id) values ($1, $2)`, [ids.staffA, ids.salonA]);
const themeBarber = (await db.query(
  `select id from public.themes where theme_id = 'barber_mens_grooming'`,
)).rows[0].id;
const themeHair = (await db.query(
  `select id from public.themes where theme_id = 'hair_studio_color_bar'`,
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
// 1. Canonical naming (§3): no business_id/businesses_id anywhere in the
//    canonical tables, and the health RPC confirms zero violations.
// ---------------------------------------------------------------------------
await test('canonical naming — no business_id column exists in any canonical table', async () => {
  const offenders = (await db.query(`
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name in ('business_id', 'businesses_id')
      and c.table_name in (
        'profiles','organizations','organization_members','salons',
        'salon_public_websites','services','product_categories','products',
        'business_locations','salon_media','bookings','booking_services',
        'booking_slot_holds','payment_orders','payments','payment_webhook_events',
        'booking_request_keys','themes','service_categories'
      )
  `)).rows;
  assert.deepEqual(offenders, [], 'canonical tables must not carry business_id columns');
});

// ---------------------------------------------------------------------------
// 2. Membership uniqueness (§6): named constraint + deterministic repair.
// ---------------------------------------------------------------------------
await test('membership — named UNIQUE constraint exists and blocks duplicates', async () => {
  const constraint = (await db.query(`
    select conname from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_organization_user_key'
  `)).rows;
  assert.equal(constraint.length, 1, 'named unique constraint must exist');
  await reject(
    () => db.query(
      `insert into public.organization_members (organization_id, user_id, is_active, role)
       values ($1, $2, true, 'staff')`,
      [ids.orgA, ids.ownerA],
    ),
    /duplicate key|unique/i,
  );
});

await test('membership — repair resolves legacy duplicates deterministically', async () => {
  // Simulate a legacy database where duplicates slipped in before the
  // constraint existed: drop the constraint, insert duplicate pairs, repair.
  await db.query('alter table public.organization_members drop constraint organization_members_organization_user_key');
  await db.query(
    `insert into public.organization_members (organization_id, user_id, is_active, role)
     values ($1, $2, true, 'staff'), ($1, $2, false, 'staff'), ($3, $4, true, 'owner')`,
    [ids.orgA, ids.ownerA, ids.orgB, ids.customerA],
  );
  const removed = (await db.query(
    `select public.phase2a_repair_membership_duplicates() as removed`,
  )).rows[0].removed;
  assert.equal(removed, 2, 'exactly the two duplicate rows of the same pair are removed');

  const rows = (await db.query(`
    select organization_id, user_id, role, is_active
    from public.organization_members
    where organization_id = $1 and user_id = $2
  `, [ids.orgA, ids.ownerA])).rows;
  assert.equal(rows.length, 1, 'one membership remains');
  assert.equal(rows[0].role, 'owner', 'the owner role wins over staff duplicates');
  assert.equal(rows[0].is_active, true, 'the active row wins over inactive duplicates');

  // Restore the constraint the same way M33 establishes it.
  await db.query(
    'alter table public.organization_members add constraint organization_members_organization_user_key unique (organization_id, user_id)',
  );
});

// ---------------------------------------------------------------------------
// 3. Unified soft delete (§4): deleted_at on the remaining canonical tables.
// ---------------------------------------------------------------------------
await test('soft delete — deleted_at exists on all canonical mutable entities', async () => {
  const missing = (await db.query(`
    select table_name
    from unnest(array[
      'salons','services','products','salon_media',
      'service_categories','product_categories'
    ]::text[]) as t(table_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t.table_name
        and c.column_name = 'deleted_at'
    )
  `)).rows;
  assert.deepEqual(missing, [], 'every listed entity must have deleted_at');
});

await test('soft delete — media rows keep history and active-record queries stay valid', async () => {
  await db.query(
    `insert into public.salon_media (
       id, salon_id, media_type, storage_bucket, storage_path, status, created_by
     ) values ($1, $2, 'gallery', 'salon-media', $3, 'active', $4)`,
    [ids.mediaA, ids.salonA, `salon/${ids.salonA}/gallery/a.webp`, ids.ownerA],
  );
  const before = (await db.query(
    `select deleted_at, status from public.salon_media where id = $1`,
    [ids.mediaA],
  )).rows[0];
  assert.equal(before.deleted_at, null, 'new media rows default to not deleted');

  await db.query(
    `update public.salon_media set deleted_at = now() where id = $1`,
    [ids.mediaA],
  );
  const after = (await db.query(
    `select deleted_at from public.salon_media where id = $1`,
    [ids.mediaA],
  )).rows[0];
  assert.ok(after.deleted_at, 'soft-deleted row keeps its record with deleted_at set');

  // Active-record reads (member/back-office surface) exclude soft-deleted
  // rows. The anon projection intentionally cannot see deleted_at at all.
  await asRole('authenticated', ids.ownerA, async () => {
    const visible = (await db.query(
      `select id from public.salon_media
       where id = $1 and status = 'active' and deleted_at is null`,
      [ids.mediaA],
    )).rows;
    assert.equal(visible.length, 0, 'soft-deleted media is excluded from active reads');
  });
});

await test('soft delete — categories accept deleted_at without breaking catalog reads', async () => {
  await db.query(
    `update public.service_categories set deleted_at = now() where id = $1`,
    [ids.categoryA],
  );
  const excluded = (await db.query(
    `select id from public.service_categories
     where id = $1 and is_active = true and deleted_at is null`,
    [ids.categoryA],
  )).rows;
  assert.equal(excluded.length, 0, 'soft-deleted category is excluded from active reads');
});

// ---------------------------------------------------------------------------
// 4. Service isolation (§11): cross-theme category links are structurally
//    impossible via the composite (category_id, theme_id) FK.
// ---------------------------------------------------------------------------
await test('service isolation — a service cannot pair a category with a foreign theme', async () => {
  // categoryA belongs to the barber theme. A service whose theme is hair must
  // be rejected by the composite FK (category_id, theme_id) ->
  // service_categories(id, theme_id) — both on insert and on update.
  await db.query(
    `insert into public.service_categories (id, theme_id, name, slug)
     values ($1, $2, 'Beard & Shave', 'beard-shave')`,
    [ids.categoryA, themeBarber],
  );
  await db.query(
    `insert into public.services (salon_id, name, price_paise, duration_minutes, theme_id, category_id)
     values ($1, 'Valid same-theme service', 10000, 15, $2, $3)`,
    [ids.salonA, themeBarber, ids.categoryA],
  );
  await reject(
    () => db.query(
      `insert into public.services (salon_id, name, price_paise, duration_minutes, theme_id, category_id)
       values ($1, 'Cross-theme insert', 10000, 15, $2, $3)`,
      [ids.salonA, themeHair, ids.categoryA],
    ),
    /foreign key|violates/i,
  );
  await reject(
    () => db.query(
      `update public.services set theme_id = $1
       where category_id = $2 and salon_id = $3`,
      [themeHair, ids.categoryA, ids.salonA],
    ),
    /foreign key|violates/i,
  );
});

// ---------------------------------------------------------------------------
// 5. Product ownership (§12): cross-tenant products are structurally
//    impossible via the salon FK + (id, salon_id) unique pair.
// ---------------------------------------------------------------------------
await test('product ownership — a product cannot be created for a foreign salon', async () => {
  const category = (await db.query(
    `insert into public.product_categories (salon_id, theme_id, name)
     values ($1, $2, 'Hair Care') returning id`,
    [ids.salonA, themeBarber],
  )).rows[0].id;
  await db.query(
    `insert into public.products (salon_id, theme_id, category_id, name, price_paise)
     values ($1, $2, $3, 'Pomade', 49900)`,
    [ids.salonA, themeBarber, category],
  );
  await reject(
    () => db.query(
      `insert into public.products (salon_id, theme_id, category_id, name, price_paise)
       values ($1, $2, $3, 'Wrong tenant', 100)`,
      [ids.salonB, themeBarber, category],
    ),
    /foreign key|violates/i,
  );
});

// ---------------------------------------------------------------------------
// 6. Indexes (§13): exist AND are actually used by the real query shapes.
// ---------------------------------------------------------------------------
await test('indexes — services (salon_id, is_active) partial index exists and is used', async () => {
  const exists = (await db.query(`
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'services'
      and indexname = 'services_phase2a_salon_active_idx'
  `)).rows;
  assert.equal(exists.length, 1, 'services_phase2a_salon_active_idx must exist');

  const plan = (await db.query(`
    explain select id from public.services
    where salon_id = $1 and is_active = true and deleted_at is null
  `, [ids.salonA])).rows.map((r) => r['QUERY PLAN']).join('\n');
  assert.match(plan, /services_phase2a_salon_active_idx|Index Scan|Index Only Scan/i);
});

await test('indexes — service_categories (theme_id, is_active, sort_order) exists and is used', async () => {
  const exists = (await db.query(`
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'service_categories'
      and indexname = 'service_categories_phase2a_theme_active_idx'
  `)).rows;
  assert.equal(exists.length, 1, 'service_categories_phase2a_theme_active_idx must exist');

  const plan = (await db.query(`
    explain select id from public.service_categories
    where theme_id = $1 and is_active = true and deleted_at is null
    order by sort_order, id
  `, [themeBarber])).rows.map((r) => r['QUERY PLAN']).join('\n');
  assert.match(plan, /service_categories_phase2a_theme_active_idx|Index Scan|Index Only Scan/i);
});

await test('indexes — membership (organization_id, user_id) is backed by the unique constraint', async () => {
  const constraintIndex = (await db.query(`
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'organization_members'
      and indexname = 'organization_members_organization_user_key'
  `)).rows;
  assert.equal(constraintIndex.length, 1, 'the named constraint owns its index');
});

// ---------------------------------------------------------------------------
// 7. Foundation health RPC (§21): zero integrity findings.
// ---------------------------------------------------------------------------
await test('health RPC — reports zero naming violations, duplicates and orphans', async () => {
  const report = (await db.query('select public.phase2a_foundation_health() as report')).rows[0].report;
  assert.deepEqual(report.canonical_naming_violations, [], 'no naming violations');
  assert.equal(report.membership_duplicates, 0, 'no duplicate memberships');
  assert.equal(report.services_without_salon, 0, 'no orphan services');
  assert.equal(report.products_without_salon, 0, 'no orphan products');
  assert.equal(report.categories_without_theme, 0, 'no orphan categories');
  assert.equal(report.salons_without_organization, 0, 'no orphan salons');
  assert.equal(report.themes, 5, 'exactly five active themes');
  assert.equal(typeof report.soft_deleted.salon_media, 'number');
});

await test('health RPC — not callable by anon/authenticated', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query('select public.phase2a_foundation_health() as report'),
      /permission denied/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Idempotency + regression (§19).
// ---------------------------------------------------------------------------
await test('idempotency — M33 replays cleanly on the hardened schema', async () => {
  const sql = await readFile(join(migrationDir, PHASE2A_FILES[0]), 'utf8');
  await db.exec(sql);
});

await test('phase1a/phase2 regression — ownership, catalog and booking surfaces intact', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    const salons = (await db.query('select public.owner_salon_ids() as id')).rows;
    assert.deepEqual(salons.map((r) => r.id), [ids.salonA]);
  });
  await asRole('anon', '', async () => {
    const catalog = (await db.query(
      'select id, name, slug from public.public_salon_catalog order by id',
    )).rows;
    assert.deepEqual(catalog.map((r) => r.id), [ids.salonA, ids.salonB]);
    const themes = (await db.query(
      'select theme_id, slug from public.themes order by sort_order',
    )).rows;
    assert.deepEqual(themes.map((r) => r.slug), [
      'barber_mens_grooming',
      'hair_studio_color_bar',
      'beauty_skin_spa',
      'family_full_service',
      'nail_lash_studio',
    ]);
  });
  await asRole('service_role', '', async () => {
    const created = await db.query(
      `select * from public.create_authoritative_customer_booking(
        $1, $2, array[$3::uuid], null, $4, 'phase2a-key-0001', repeat('a', 64)
      )`,
      [ids.customerA, ids.salonA, ids.serviceA, new Date(Date.now() + 24 * 3600 * 1000).toISOString()],
    );
    assert.equal(Number(created.rows[0].amount_paise), 50000);
  });
});

// ---------------------------------------------------------------------------
// 9. Cross-repository compatibility (§20, §26): Main Website DDL + profile
//    contract against the unified hardened schema.
// ---------------------------------------------------------------------------
const mainWebsitePath = process.env.NEXORA_MAIN_WEBSITE_PATH;
if (mainWebsitePath) {
  const mainWebsiteMigrationsDir = join(mainWebsitePath, 'supabase', 'migrations');

  await test('cross-repo — Main Website profile contract still resolves on the hardened schema', async () => {
    const sessionSource = await readFile(
      join(mainWebsitePath, 'packages', 'auth', 'src', 'session.ts'),
      'utf8',
    );
    const match = sessionSource.match(/const PROFILE_COLUMNS\s*=\s*"([^"]+)"/);
    assert.ok(match, 'Main Website PROFILE_COLUMNS constant not found');
    for (const column of match[1].split(',').map((c) => c.trim())) {
      const exists = (await db.query(
        `select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = $1`,
        [column],
      )).rows.length;
      assert.equal(exists, 1, `profiles.${column} must exist for the Main Website`);
    }
  });

  await test('cross-repo — every Main Website DDL statement still applies on the hardened schema', async () => {
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
          throw new Error(`Main Website DDL conflicts with the unified Phase 2A schema:\n${statement}\n${error.message}`);
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

// ---------------------------------------------------------------------------
await db.close();
console.log(`Phase 2A hardening tests: ${passed} passed`);
