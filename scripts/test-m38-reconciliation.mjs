/**
 * M38 reconciliation + backend smoke tests.
 *
 * Replays the live Design B shape (status-based membership + the live
 * `private.protect_organization_membership_fields()` guard) against PGlite
 * and verifies:
 *   1. Fresh bootstrap creates the missing Design B roots + salon-media bucket.
 *   2. The live membership guard is bypassed only around the trusted owner
 *      backfill and is restored exactly — a later owner INSERT still fails.
 *   3. M38 never steals `is_active` from a live `status` column (M28 owns
 *      the generated flag).
 *   4. Missing `salon_public_websites` and the `salon-media` bucket are created.
 *   5. M38 is idempotent on top of M28–M37 (generated is_active is not written).
 *   6. After the full chain: multi-tenant RLS, public website lookup, the
 *      authoritative booking RPC, and tenant-scoped salon-media upload.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const M38 = '20260822000101_m38_reconciliation_fix.sql';
const CHAIN = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
  '20260821000901_m36_phase3a_auth_profiles_roles.sql',
  '20260821001001_m37_phase3b_multitenant_rls.sql',
  M38,
];

const sqlOf = async (file) => readFile(join(migrationDir, file), 'utf8');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  staffA: '00000000-0000-4000-8000-0000000000a2',
  customerA: '00000000-0000-4000-8000-0000000000c1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
  serviceA: '30000000-0000-4000-8000-0000000000a1',
  serviceB: '30000000-0000-4000-8000-0000000000b1',
  staffRowA: '40000000-0000-4000-8000-0000000000a1',
};

const ROLES_AUTH_STORAGE = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`;

const LIVE_GUARD = `
  create schema if not exists private;
  create or replace function private.protect_organization_membership_fields()
  returns trigger
  language plpgsql
  as $$
  begin
    if new.role = 'owner' and (tg_op = 'INSERT' or old.role is distinct from new.role) then
      if auth.uid() is null or not exists (
        select 1 from public.organization_members om
        where om.organization_id = new.organization_id
          and om.user_id = auth.uid()
          and om.role = 'owner'
      ) then
        raise exception 'only an organization owner or admin may assign owner role'
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end;
  $$;
  drop trigger if exists trg_protect_organization_membership_fields on public.organization_members;
  create trigger trg_protect_organization_membership_fields
    before insert or update on public.organization_members
    for each row execute function private.protect_organization_membership_fields();
`;

const LIVE_LIKE_TABLES = `
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
  -- LIVE-LIKE: activity is status, role is nullable, NO is_active.
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
  grant select on public.profiles, public.salons, public.services, public.staff,
    public.salon_hours, public.bookings
    to authenticated, service_role;
`;

const PHASE3B_STYLE_MEMBERS = `
  create table public.profiles (
    id uuid primary key references auth.users(id),
    full_name text not null default 'User',
    platform_role text not null default 'customer',
    is_active boolean not null default true,
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
`;

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const newDb = async () => {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(ROLES_AUTH_STORAGE);
  return db;
};

const apply = async (db, file) => {
  try {
    await db.exec(await sqlOf(file));
  } catch (error) {
    throw new Error(`${file} failed: ${error.message}`, { cause: error });
  }
};

const applyChain = async (db, files) => {
  for (const file of files) await apply(db, file);
};

const columnsOf = async (db, table) => {
  const { rows } = await db.query(
    `select column_name, is_generated
     from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [table],
  );
  return rows;
};

const verifyRows = async (db) => {
  const { rows } = await db.query('select check_name, ok, detail from public.verify_m38_reconciliation()');
  return rows;
};

const setRole = async (db, role, userId = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.exec(`set role ${role}`);
};

const resetRole = async (db) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("select set_config('request.jwt.claim.role', '', false)");
};

const asRole = async (db, role, userId, callback) => {
  await setRole(db, role, userId);
  try {
    return await callback();
  } finally {
    await resetRole(db);
  }
};

const expectReject = async (callback, pattern) => {
  let error;
  try {
    await callback();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'expected operation to be rejected');
  assert.match(String(error.message), pattern);
};

const seedLiveTenants = async (db) => {
  await db.query(
    `insert into auth.users (id, email) values
      ($1, 'owner-a@example.test'),
      ($2, 'owner-b@example.test'),
      ($3, 'staff-a@example.test'),
      ($4, 'customer-a@example.test')`,
    [ids.ownerA, ids.ownerB, ids.staffA, ids.customerA],
  );
  await db.query(
    `insert into public.profiles (id, platform_role) values
      ($1, 'business_user'),
      ($2, 'business_user'),
      ($3, 'customer'),
      ($4, 'customer')`,
    [ids.ownerA, ids.ownerB, ids.staffA, ids.customerA],
  );
  await db.query(
    `insert into public.organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')`,
    [ids.orgA, ids.orgB],
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, status) values
      ($1, $2, null, 'active'),
      ($1, $3, null, 'active'),
      ($4, $5, null, 'active')`,
    [ids.orgA, ids.ownerA, ids.staffA, ids.orgB, ids.ownerB],
  );
  await db.query(
    `insert into public.salons (id, organization_id, name, slug, address, city)
     values ($1, $2, 'Salon A', 'salon-a', 'MI Road', 'Jaipur'),
            ($3, $4, 'Salon B', 'salon-b', 'CP', 'Delhi')`,
    [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
  );
};

// =============================================================================
// 1. Fresh bootstrap — no Design B tables yet.
// =============================================================================
{
  const db = await newDb();
  await apply(db, M38);

  for (const table of ['profiles', 'organizations', 'organization_members', 'salons', 'salon_public_websites']) {
    const { rows } = await db.query(`select to_regclass($1) is not null as ok`, [`public.${table}`]);
    assert.equal(rows[0].ok, true, `${table} must exist after fresh M38`);
  }
  ok('fresh bootstrap creates Design B identity/tenant/website tables');

  const bucket = (await db.query(`select id, public, file_size_limit from storage.buckets where id = 'salon-media'`)).rows[0];
  assert.ok(bucket, 'salon-media bucket created');
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 52428800);
  ok('fresh bootstrap creates private salon-media bucket (50 MB)');

  assert.ok((await db.query(`select to_regprocedure('public.owner_salon_ids()') is not null as ok`)).rows[0].ok);
  assert.ok((await db.query(`select to_regprocedure('public.nexora_owner_salon_ids()') is not null as ok`)).rows[0].ok);
  ok('fresh bootstrap ships owner_salon_ids + nexora_owner_salon_ids');

  const checks = await verifyRows(db);
  const byName = Object.fromEntries(checks.map((r) => [r.check_name, r]));
  for (const name of [
    'profiles', 'organizations', 'organization_members', 'salons',
    'salon_public_websites', 'salon_public_websites_columns',
    'salon-media bucket', 'owner_salon_ids', 'nexora_owner_salon_ids',
    'nexora_alias_delegates', 'membership_guard_restored', 'rls_base_tables',
    'spw_anon_select',
  ]) {
    assert.equal(byName[name]?.ok, true, `verify ${name}`);
  }
  assert.equal(byName['salon_media']?.ok, false, 'salon_media is owned by M28, absent on fresh M38');
  ok('verify_m38_reconciliation() reports expected fresh-bootstrap surface');

  await apply(db, M38);
  const again = await verifyRows(db);
  assert.deepEqual(
    again.map((r) => [r.check_name, r.ok]),
    checks.map((r) => [r.check_name, r.ok]),
  );
  ok('fresh M38 second apply is idempotent');
  await db.close();
}

// =============================================================================
// 2. Live-like status schema + membership guard + missing SPW/bucket.
// =============================================================================
{
  const db = await newDb();
  await db.exec(LIVE_LIKE_TABLES);
  await db.exec(LIVE_GUARD);
  await seedLiveTenants(db);

  // The live guard blocks owner assignment when auth.uid() is NULL (SQL editor).
  await expectReject(
    () => db.query(`update public.organization_members set role = 'owner' where role is null`),
    /only an organization owner or admin may assign owner role/,
  );
  ok('live guard blocks owner backfill when auth.uid() is NULL');

  const beforeRoles = (await db.query(
    `select user_id, role from public.organization_members order by user_id`,
  )).rows;
  assert.ok(beforeRoles.every((r) => r.role === null), 'fixture roles start NULL');

  await apply(db, M38);
  ok('M38 applies on live-like status schema + membership guard');

  const memberCols = await columnsOf(db, 'organization_members');
  assert.ok(memberCols.some((c) => c.column_name === 'status'), 'status preserved');
  assert.equal(
    memberCols.some((c) => c.column_name === 'is_active'),
    false,
    'M38 must NOT add writable is_active beside live status',
  );
  ok('M38 does not steal is_active from the live status column');

  const afterRoles = Object.fromEntries(
    (await db.query(`select user_id, role, status from public.organization_members`)).rows
      .map((r) => [r.user_id, r]),
  );
  assert.equal(afterRoles[ids.ownerA].role, 'owner', 'business_user → owner');
  assert.equal(afterRoles[ids.ownerB].role, 'owner', 'business_user → owner');
  assert.equal(afterRoles[ids.staffA].role, 'staff', 'remaining membership → staff');
  assert.equal(afterRoles[ids.ownerA].status, 'active', 'status untouched');
  ok('guard-safe backfill assigns owner then staff without touching status');

  const guard = (await db.query(
    `select t.tgname, t.tgenabled
     from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.organization_members'::regclass
       and not t.tgisinternal
       and p.proname = 'protect_organization_membership_fields'`,
  )).rows;
  assert.equal(guard.length, 1);
  assert.notEqual(guard[0].tgenabled, 'D', 'guard must be re-enabled');
  ok('membership guard restored after trusted backfill');

  await expectReject(
    () => db.query(
      `insert into public.organization_members (organization_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')`,
      [ids.orgA, ids.customerA],
    ),
    /only an organization owner or admin may assign owner role/,
  );
  ok('restored guard still blocks unauthenticated owner INSERT');

  const spw = (await db.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'salon_public_websites'`,
  )).rows.map((r) => r.column_name);
  for (const col of ['salon_id', 'slug', 'template_key', 'config', 'is_published']) {
    assert.ok(spw.includes(col), `salon_public_websites.${col}`);
  }
  ok('missing salon_public_websites is created with required columns');

  const bucket = (await db.query(`select id, public from storage.buckets where id = 'salon-media'`)).rows[0];
  assert.ok(bucket && bucket.public === false);
  ok('missing salon-media bucket is created (private)');

  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids.ownerA]);
  await db.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  const owned = (await db.query('select public.owner_salon_ids() as id')).rows.map((r) => r.id);
  const aliased = (await db.query('select public.nexora_owner_salon_ids() as id')).rows.map((r) => r.id);
  assert.deepEqual(owned, [ids.salonA]);
  assert.deepEqual(aliased, [ids.salonA]);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("select set_config('request.jwt.claim.role', '', false)");
  ok('owner_salon_ids / nexora_owner_salon_ids resolve the owner salon on status vocabulary');

  // M28–M37 on the reconciled live-like base, then M38 again.
  await applyChain(db, CHAIN);
  ok('M28–M37 + M38 apply on the reconciled live-like base');

  const gen = (await db.query(
    `select is_generated from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_members' and column_name = 'is_active'`,
  )).rows[0];
  assert.equal(gen?.is_generated, 'ALWAYS', 'M28 still owns generated is_active');
  ok('M28 generated is_active is intact after M38-first apply');

  const checks = await verifyRows(db);
  const failed = checks.filter((r) => r.ok !== true);
  assert.deepEqual(failed, [], `verify failed: ${JSON.stringify(failed)}`);
  ok('verify_m38_reconciliation() is fully green after the chain');

  // ----- E2E: public website, RLS, booking, media -----
  await db.query(
    `insert into public.salon_public_websites (salon_id, slug, template_key, config, is_published, published_at)
     values
       ($1, 'salon-a', 'barber_mens_grooming', '{"tagline":"Sharp cuts"}'::jsonb, true, now()),
       ($2, 'salon-b-draft', 'hair_studio_color_bar', '{}'::jsonb, false, null)`,
    [ids.salonA, ids.salonB],
  );
  await db.query(
    `insert into public.services (id, salon_id, name, price_paise, duration_minutes, is_active)
     values ($1, $2, 'Skin Fade', 80000, 45, true),
            ($3, $4, 'Balayage', 250000, 90, true)`,
    [ids.serviceA, ids.salonA, ids.serviceB, ids.salonB],
  );
  await db.query(`insert into public.staff (id, salon_id, is_active) values ($1, $2, true)`, [ids.staffRowA, ids.salonA]);

  const published = await asRole(db, 'anon', '', async () => (
    await db.query(
      `select slug, salon_id, is_published from public.salon_public_websites
       where slug = 'salon-a' and is_published = true`,
    )
  ).rows);
  assert.equal(published.length, 1);
  assert.equal(published[0].salon_id, ids.salonA);
  ok('public website lookup: published slug is readable by anon (main.tsx / PublicSalonView)');

  const draft = await asRole(db, 'anon', '', async () => (
    await db.query(`select slug from public.salon_public_websites where slug = 'salon-b-draft'`)
  ).rows);
  assert.equal(draft.length, 0, 'unpublished website is not public');
  ok('public website lookup: unpublished slug is hidden from anon');

  const catalog = await asRole(db, 'anon', '', async () => (
    await db.query(`select id, slug from public.public_salon_catalog order by id`)
  ).rows);
  assert.deepEqual(catalog.map((r) => r.id), [ids.salonA]);
  ok('public_salon_catalog exposes only the published active salon');

  const crossSalon = await asRole(db, 'authenticated', ids.ownerA, async () => (
    await db.query(`select id from public.salons where id = $1`, [ids.salonB])
  ).rows);
  assert.equal(crossSalon.length, 0, 'owner A must not see salon B');
  const ownSalon = await asRole(db, 'authenticated', ids.ownerA, async () => (
    await db.query(`select id from public.salons where id = $1`, [ids.salonA])
  ).rows);
  assert.equal(ownSalon.length, 1);
  ok('RLS: salon_id / organization_id isolate tenants (owner A ↛ salon B)');

  const crossServiceWrite = await asRole(db, 'authenticated', ids.ownerA, async () => (
    await db.query(
      `update public.services set name = 'Hacked' where id = $1 returning id`,
      [ids.serviceB],
    )
  ).rows);
  assert.equal(crossServiceWrite.length, 0);
  ok('RLS: owner A cannot mutate tenant B services');

  // Authoritative booking RPC (server/bookingRoutes.ts).
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const fingerprint = createHash('sha256').update(JSON.stringify({
    salonId: ids.salonA, serviceIds: [ids.serviceA], staffId: null, appointmentStart: start,
  })).digest('hex');
  const booking = await asRole(db, 'service_role', ids.customerA, async () => (
    await db.query(
      `select * from public.create_authoritative_customer_booking(
         $1, $2, $3, null, $4::timestamptz, $5, $6
       )`,
      [ids.customerA, ids.salonA, [ids.serviceA], start, 'idempotency-key-m38-01', fingerprint],
    )
  ).rows);
  assert.equal(booking.length, 1);
  assert.ok(booking[0].booking_id);
  assert.equal(Number(booking[0].amount_paise), 80000);
  ok('booking flow: create_authoritative_customer_booking persists a priced booking');

  await asRole(db, 'authenticated', ids.customerA, async () => {
    await expectReject(
      () => db.query(
        `insert into public.bookings (salon_id, customer_id, appointment_start, status, total_amount_paise)
         values ($1, $2, now() + interval '3 hours', 'pending', 1)`,
        [ids.salonA, ids.customerA],
      ),
      /authoritative booking API|permission denied|row-level security|42501/i,
    );
  });
  ok('booking flow: customers cannot insert bookings directly');

  // Tenant-scoped media upload path: salon/{salon_id}/hero/...
  const mediaPath = `salon/${ids.salonA}/hero/object-m38.webp`;
  await asRole(db, 'authenticated', ids.ownerA, async () => {
    await db.query(
      `insert into storage.objects (bucket_id, name) values ('salon-media', $1)`,
      [mediaPath],
    );
  });
  ok('media upload: owner can insert salon-media object under own salon UUID prefix');

  await asRole(db, 'authenticated', ids.ownerB, async () => {
    await expectReject(
      () => db.query(
        `insert into storage.objects (bucket_id, name)
         values ('salon-media', $1)`,
        [`salon/${ids.salonA}/hero/stolen.webp`],
      ),
      /row-level security|violates|permission denied/i,
    );
  });
  ok('media upload: other tenant cannot write into salon A prefix');

  await db.query(
    `insert into public.salon_media (
       salon_id, media_type, storage_bucket, storage_path, status, display_order, created_by
     ) values ($1, 'hero', 'salon-media', $2, 'active', 0, $3)`,
    [ids.salonA, mediaPath, ids.ownerA],
  );
  const publicObject = await asRole(db, 'anon', '', async () => (
    await db.query(`select name from storage.objects where name = $1`, [mediaPath])
  ).rows);
  assert.equal(publicObject.length, 1, 'active metadata-backed object is publicly readable');
  ok('media upload: public read requires an active salon_media row (M30 contract)');

  const phase3b = (await db.query('select check_name, passed from public.verify_phase3b_rls()')).rows;
  assert.ok(phase3b.every((r) => r.passed === true), `phase3b failed: ${JSON.stringify(phase3b.filter((r) => !r.passed))}`);
  ok('verify_phase3b_rls() still passes after M38');

  await apply(db, M38);
  const checks2 = await verifyRows(db);
  assert.ok(checks2.every((r) => r.ok === true));
  ok('M38 replay on the full chain is idempotent');

  await db.close();
}

// =============================================================================
// 3. M28–M37 first (generated is_active) then M38 — must not write the flag.
// =============================================================================
{
  const db = await newDb();
  await db.exec(PHASE3B_STYLE_MEMBERS);
  await applyChain(db, CHAIN.slice(0, -1)); // M28–M37
  await apply(db, M38);
  ok('M38 applies cleanly on a post-M28 generated-is_active schema');

  const gen = (await db.query(
    `select is_generated from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_members' and column_name = 'is_active'`,
  )).rows[0];
  assert.ok(gen, 'is_active still present after M38');
  const checks = await verifyRows(db);
  assert.ok(checks.every((r) => r.ok === true), `verify failed: ${JSON.stringify(checks.filter((r) => !r.ok))}`);
  ok('post-M28 M38 does not rewrite is_active and verify is green');
  await db.close();
}

console.log(`\nM38 reconciliation + backend smoke: ${passed}/${passed} checks PASS`);
