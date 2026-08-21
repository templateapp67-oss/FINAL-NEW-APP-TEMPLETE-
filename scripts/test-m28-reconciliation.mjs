/**
 * M28 reconciliation acceptance — live-like `organization_members.status`
 * schema (the shape the shared live project actually has: activity tracked as
 * status text with 'active', NO is_active column).
 *
 * Verifies, against a PGlite migration test database:
 *   1. M28 first apply PASSES on the live-like schema (previously it failed
 *      its own preflight: "required canonical column
 *      public.organization_members.is_active is missing").
 *   2. `is_active` is added as a STORED GENERATED column derived from
 *      `status = 'active'` — status stays the only writable authority, so no
 *      duplicate/competing semantics are introduced.
 *   3. Existing production data is fully preserved (rows, status values,
 *      pre-existing roles; NULL roles backfilled per M28's documented rule).
 *   4. Second apply of M28 is idempotent.
 *   5. The full canonical chain M29→M35 still applies cleanly on top, twice.
 *   6. Duplicate-backend protection is preserved: unknown status vocabulary,
 *      missing activity column entirely, and a wrong-typed is_active all
 *      STOP with a precise diagnostic and leave the schema untouched.
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
const CHAIN_FILES = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
];
const M28 = CHAIN_FILES[0];
const sqlOf = async (file) => readFile(join(migrationDir, file), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const bootstrapCommon = `
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
  -- LIVE-LIKE membership shape: activity is a status column ('active'),
  -- there is NO is_active column. Mirrors docs/owner-location-setup.sql and
  -- the documented live ownership chain (role='owner', status='active').
  create table public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text,
    status text default 'active',
    created_at timestamptz not null default now()
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
`;

const ids = {
  ownerActive: '00000000-0000-4000-8000-0000000000a1',
  ownerInactive: '00000000-0000-4000-8000-0000000000b1',
  staffInvited: '00000000-0000-4000-8000-0000000000c1',
  ownerNullRole: '00000000-0000-4000-8000-0000000000d1',
  staffNullStatus: '00000000-0000-4000-8000-0000000000e1',
  customer: '00000000-0000-4000-8000-0000000000f1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
  serviceA: '30000000-0000-4000-8000-0000000000a1',
  staffA: '40000000-0000-4000-8000-0000000000a1',
  bookingA: '50000000-0000-4000-8000-0000000000a1',
};

// ---------------------------------------------------------------------------
// Main path: live-like schema + EXISTING PRODUCTION DATA seeded BEFORE M28.
// ---------------------------------------------------------------------------
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(bootstrapCommon);

await db.query(
  `insert into auth.users (id, email) values
    ($1, 'owner-active@example.test'),
    ($2, 'owner-inactive@example.test'),
    ($3, 'staff-invited@example.test'),
    ($4, 'owner-null-role@example.test'),
    ($5, 'staff-null-status@example.test'),
    ($6, 'customer@example.test')`,
  [ids.ownerActive, ids.ownerInactive, ids.staffInvited, ids.ownerNullRole, ids.staffNullStatus, ids.customer],
);
await db.query(
  `insert into public.profiles (id, platform_role) values
    ($1, 'business_user'), ($2, 'business_user'), ($3, 'customer'),
    ($4, 'business_user'), ($5, 'customer'), ($6, 'customer')`,
  [ids.ownerActive, ids.ownerInactive, ids.staffInvited, ids.ownerNullRole, ids.staffNullStatus, ids.customer],
);
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Live Org A'), ($2, 'Live Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, role, status) values
    ($1, $2, 'owner', 'active'),
    ($1, $3, 'staff', 'invited'),
    ($5, $6, 'owner', 'inactive'),
    ($5, $4, null,    'active'),
    ($5, $7, 'staff', null)`,
  [ids.orgA, ids.ownerActive, ids.staffInvited, ids.ownerNullRole, ids.orgB, ids.ownerInactive, ids.staffNullStatus],
);
await db.query(
  `insert into public.salons (id, organization_id, name, slug, address, city)
   values ($1, $2, 'Live Salon A', 'live-salon-a', 'MI Road', 'Jaipur'),
          ($3, $4, 'Live Salon B', 'live-salon-b', 'CP', 'Delhi')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
);
await db.query(
  `insert into public.salon_public_websites (salon_id, slug, is_published)
   values ($1, 'live-salon-a', true), ($2, 'live-salon-b', false)`,
  [ids.salonA, ids.salonB],
);
await db.query(
  `insert into public.services (id, salon_id, name, price_paise, duration_minutes)
   values ($1, $2, 'Signature Facial', 120000, 60)`,
  [ids.serviceA, ids.salonA],
);
await db.query(`insert into public.staff (id, salon_id) values ($1, $2)`, [ids.staffA, ids.salonA]);
await db.query(
  `insert into public.bookings (id, salon_id, customer_id, appointment_start, status, total_amount_paise)
   values ($1, $2, $3, now() + interval '1 day', 'confirmed', 120000)`,
  [ids.bookingA, ids.salonA, ids.customer],
);

const snapshotBefore = (await db.query(
  `select om.user_id, om.organization_id, om.role, om.status
   from public.organization_members om order by om.user_id`,
)).rows;
assert.equal(snapshotBefore.length, 5, 'fixture seeds 5 membership rows');

// 1. First apply.
await db.exec(await sqlOf(M28));
ok('M28 first apply on live-like status-based schema');

// 2. is_active is a stored GENERATED column derived from status.
const genRow = (await db.query(
  `select a.attgenerated
   from pg_attribute a
   where a.attrelid = 'public.organization_members'::regclass
     and a.attname = 'is_active' and not a.attisdropped`,
)).rows[0];
assert.ok(genRow, 'is_active column exists after M28');
assert.equal(genRow.attgenerated, 's', 'is_active is STORED GENERATED (single source of truth stays status)');
ok('is_active added as STORED GENERATED from status (no duplicate semantics)');

// 3. Derivation matches the documented live rule status = 'active'.
const flags = Object.fromEntries(
  (await db.query('select user_id, is_active, status, role from public.organization_members')).rows
    .map((r) => [r.user_id, r]),
);
assert.equal(flags[ids.ownerActive].is_active, true, "status 'active' -> is_active true");
assert.equal(flags[ids.staffInvited].is_active, false, "status 'invited' -> is_active false");
assert.equal(flags[ids.ownerInactive].is_active, false, "status 'inactive' -> is_active false");
assert.equal(flags[ids.ownerNullRole].is_active, true, "status 'active' (null role) -> is_active true");
assert.equal(flags[ids.staffNullStatus].is_active, false, 'NULL status -> is_active false (live chain already required active)');
ok('is_active derivation matches live status semantics exactly');

// 4. Existing data preserved: rows, statuses, pre-existing roles intact;
//    NULL role backfilled to owner for a business_user profile (M28 rule).
const after = (await db.query(
  `select om.user_id, om.organization_id, om.role, om.status
   from public.organization_members om order by om.user_id`,
)).rows;
assert.equal(after.length, 5, 'membership row count unchanged');
for (const before of snapshotBefore) {
  const now = after.find((r) => r.user_id === before.user_id && r.organization_id === before.organization_id);
  assert.ok(now, 'membership pair still present');
  assert.equal(now.status, before.status, 'status value untouched');
  if (before.role !== null) assert.equal(now.role, before.role, 'existing role never overwritten');
}
assert.equal(flags[ids.ownerNullRole].role, 'owner', 'NULL role + business_user profile backfilled to owner');
assert.equal((await db.query('select count(*)::int as n from public.salons')).rows[0].n, 2);
assert.equal((await db.query('select count(*)::int as n from public.services where salon_id = $1', [ids.salonA])).rows[0].n >= 1, true);
assert.equal((await db.query('select status from public.bookings where id = $1', [ids.bookingA])).rows[0].status, 'confirmed');
assert.equal(
  (await db.query('select name from public.services where id = $1', [ids.serviceA])).rows[0].name,
  'Signature Facial',
);
ok('existing production data preserved (memberships, salons, services, bookings)');

// 5. The canonical index over is_active exists.
const idx = (await db.query(
  `select 1 from pg_indexes where schemaname = 'public'
   and tablename = 'organization_members'
   and indexname = 'organization_members_user_active_role_idx'`,
)).rows;
assert.equal(idx.length, 1, 'organization_members_user_active_role_idx created over the generated column');
ok('canonical membership index exists over generated is_active');

// 6. Second apply is idempotent.
await db.exec(await sqlOf(M28));
const genCount = (await db.query(
  `select count(*)::int as n from pg_attribute
   where attrelid = 'public.organization_members'::regclass
     and attname = 'is_active' and not attisdropped`,
)).rows[0].n;
assert.equal(genCount, 1, 'second apply adds no duplicate column');
assert.equal(
  (await db.query('select count(*)::int as n from public.organization_members')).rows[0].n,
  5,
  'second apply preserves rows',
);
ok('M28 second apply idempotent on reconciled schema');

// 7. Whole canonical chain M29–M35 applies on top, plus the documented
//    idempotent replay set (M34+M35 — matching the Phase 2D verified
//    contract; M28 replay-after-M32 was never part of the chain contract
//    because M32 makes themes.slug NOT NULL after M28's seed).
for (const file of CHAIN_FILES.slice(1)) {
  await db.exec(await sqlOf(file));
}
ok('full M29–M35 chain applies on the reconciled live-like base');
for (const file of CHAIN_FILES.slice(-2)) {
  await db.exec(await sqlOf(file));
}
ok('M34+M35 idempotent replay on the reconciled base');
assert.equal(
  (await db.query('select count(*)::int as n from public.organization_members')).rows[0].n,
  5,
  'chain apply preserves membership rows',
);
assert.equal(
  (await db.query(`select status from public.organization_members where user_id = $1`, [ids.staffInvited])).rows[0].status,
  'invited',
  'chain apply preserves status values',
);
ok('data still intact after full-chain apply + M34/M35 replay');

// ---------------------------------------------------------------------------
// Observed LIVE vocabulary — `m28_membership_vocabulary` reported exactly
// `owner = 7 rows` and `active = 7 rows` from the shared live project. This
// scenario replays that precise production shape (7 memberships, every one
// role='owner' and status='active', NO is_active column) BEFORE M28 and proves
// the reconciled implementation yields exactly one active owner per row with
// no invented data, no row loss, and working owner-scoped RPC/RLS.
// ---------------------------------------------------------------------------
const liveDb = new PGlite({ extensions: { btree_gist, pgcrypto } });
await liveDb.exec(bootstrapCommon);

const liveUserIds = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000106',
  '00000000-0000-4000-8000-000000000107',
];
const liveOrg = '10000000-0000-4000-8000-000000000111';
const liveSalon = '20000000-0000-4000-8000-000000000111';

await liveDb.query(
  `insert into auth.users (id, email) values
    ($1,'o1@example.test'),($2,'o2@example.test'),($3,'o3@example.test'),
    ($4,'o4@example.test'),($5,'o5@example.test'),($6,'o6@example.test'),($7,'o7@example.test')`,
  liveUserIds,
);
await liveDb.query(
  `insert into public.profiles (id, platform_role) values
    ($1,'business_user'),($2,'business_user'),($3,'business_user'),
    ($4,'business_user'),($5,'business_user'),($6,'business_user'),($7,'business_user')`,
  liveUserIds,
);
await liveDb.query(`insert into public.organizations (id, name) values ($1, 'Live Org')`, [liveOrg]);
// Exactly the observed live vocabulary: owner = 7 rows, active = 7 rows.
await liveDb.query(
  `insert into public.organization_members (organization_id, user_id, role, status) values
    ($1,$2,'owner','active'),($1,$3,'owner','active'),($1,$4,'owner','active'),
    ($1,$5,'owner','active'),($1,$6,'owner','active'),($1,$7,'owner','active'),($1,$8,'owner','active')`,
  [liveOrg, ...liveUserIds],
);
await liveDb.query(
  `insert into public.salons (id, organization_id, name, slug, address, city)
   values ($1, $2, 'Live Salon', 'live-salon', 'MI Road', 'Jaipur')`,
  [liveSalon, liveOrg],
);
await liveDb.query(
  `insert into public.salon_public_websites (salon_id, slug, is_published)
   values ($1, 'live-salon', true)`,
  [liveSalon],
);

// 1. M28 applies cleanly on the observed live vocabulary.
await liveDb.exec(await sqlOf(M28));
ok('M28 applies on observed live vocabulary (owner=7, active=7)');

// 2. Exactly the observed count is preserved — no rows invented or lost.
const liveCount = (await liveDb.query(
  'select count(*)::int as n from public.organization_members',
)).rows[0].n;
assert.equal(liveCount, 7, 'exactly 7 membership rows preserved (no duplication/loss)');

// 3. Every one of the 7 becomes exactly one ACTIVE OWNER.
const liveRows = (await liveDb.query(
  `select user_id, role, status, is_active
   from public.organization_members order by user_id`,
)).rows;
assert.equal(liveRows.length, 7, 'all 7 memberships present after M28');
for (const r of liveRows) {
  assert.equal(r.role, 'owner', 'observed role preserved as owner');
  assert.equal(r.status, 'active', 'observed status preserved as active');
  assert.equal(r.is_active, true, "is_active derives true from status='active'");
}
ok('all 7 rows reconcile to role=owner, status=active, is_active=true');

// 4. Single canonical owner per row via the generated is_active + role check.
const ownerCount = (await liveDb.query(
  `select count(*)::int as n from public.organization_members
   where role = 'owner' and is_active = true`,
)).rows[0].n;
assert.equal(ownerCount, 7, 'canonical active-owner projection = 7 (matches vocabulary)');
ok('active-owner projection matches observed live vocabulary exactly');

// 5. The canonical membership index exists over the generated column.
const liveIdx = (await liveDb.query(
  `select 1 from pg_indexes where schemaname = 'public'
   and tablename = 'organization_members'
   and indexname = 'organization_members_user_active_role_idx'`,
)).rows;
assert.equal(liveIdx.length, 1, 'canonical membership index present');
ok('canonical membership index present on reconciled live base');

// 6. Owner-scoped RPC returns the owner's own salon (end-to-end ownership chain).
await liveDb.query("select set_config('request.jwt.claim.sub', $1, false)", [liveUserIds[0]]);
await liveDb.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
const ownerSalons = (await liveDb.query('select public.owner_salon_ids() as id')).rows.map((r) => r.id);
assert.deepEqual(ownerSalons, [liveSalon], 'owner_salon_ids() resolves the owner salon');
await liveDb.query("select set_config('request.jwt.claim.sub', '', false)");
await liveDb.query("select set_config('request.jwt.claim.role', '', false)");
ok('owner_salon_ids() RPC resolves owner salon end-to-end');

// 7. Second apply on the observed vocabulary is idempotent.
await liveDb.exec(await sqlOf(M28));
const liveGenCount = (await liveDb.query(
  `select count(*)::int as n from pg_attribute
   where attrelid = 'public.organization_members'::regclass
     and attname = 'is_active' and not attisdropped`,
)).rows[0].n;
assert.equal(liveGenCount, 1, 'idempotent: no duplicate is_active column');
assert.equal(
  (await liveDb.query('select count(*)::int as n from public.organization_members')).rows[0].n,
  7,
  'idempotent: membership rows preserved',
);
ok('M28 second apply idempotent on observed live vocabulary');

await liveDb.close();

// ---------------------------------------------------------------------------
// Fail-closed protection paths (each on a fresh database).
// ---------------------------------------------------------------------------
const expectM28Failure = async (label, fixtureSql, pattern) => {
  const neg = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await neg.exec(fixtureSql);
  let error = null;
  try {
    await neg.exec(await sqlOf(M28));
  } catch (e) {
    error = e;
  }
  assert.ok(error, `${label}: M28 must abort`);
  assert.match(String(error.message), pattern, `${label}: diagnostic must be precise`);
  await neg.exec('rollback').catch(() => {});
  const col = (await neg.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_members'
       and column_name = 'is_active' and data_type = 'boolean'
       and is_generated = 'ALWAYS'`,
  )).rows;
  assert.equal(col.length, 0, `${label}: aborted run leaves no reconciled column behind`);
  await neg.close();
  ok(label);
};

await expectM28Failure(
  'unknown status vocabulary STOPS with precise diagnostic',
  `create table public.organization_members (
     organization_id uuid, user_id uuid, role text, status text
   );
   insert into public.organization_members values (gen_random_uuid(), gen_random_uuid(), 'owner', 'weird_state');`,
  /unrecognized value\(s\) \[weird_state\]/,
);

await expectM28Failure(
  'no activity column at all STOPS with precise diagnostic',
  `create table public.organization_members (organization_id uuid, user_id uuid, role text);`,
  /neither is_active nor a status column/,
);

await expectM28Failure(
  'wrong-typed is_active STOPS with precise diagnostic',
  `create table public.organization_members (
     organization_id uuid, user_id uuid, role text, is_active integer
   );`,
  /is_active exists with type integer \(expected boolean\)/,
);

await db.close();
console.log(`\nM28 reconciliation acceptance: ${passed}/${passed + 0} checks PASS`);
