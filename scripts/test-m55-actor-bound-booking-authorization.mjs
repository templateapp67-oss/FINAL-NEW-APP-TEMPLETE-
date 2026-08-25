import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const migrations = [
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
  '20260822000101_m38_reconciliation_fix.sql',
  '20260822000201_m39_owner_publish_website.sql',
  '20260822000301_m40_service_catalog_commerce_rpc.sql',
  '20260823000101_m41_website_guest_bookings.sql',
  '20260823000201_m42_owner_self_provisioning.sql',
  '20260823000301_m43_rls_isolation_verify.sql',
  '20260823000401_phase1_whitelabel_provisioning.sql',
  '20260824000101_m44_business_publishing.sql',
  '20260824000201_m45_business_slug_hardening.sql',
  '20260824000301_m46_public_access_security.sql',
  '20260824000401_m47_phase3_customer_booking_advance.sql',
  '20260824000501_m48_template_switch_isolation.sql',
  '20260824000601_m49_public_template_config.sql',
  '20260825000101_m50_publish_readiness_validation.sql',
  '20260825000201_m51_slug_collision_hardening.sql',
  '20260825000301_m52_public_resolution_hardening.sql',
  '20260825000401_m53_provision_salon_slug_fix.sql',
  '20260825000501_m54_workspace_bootstrap_compatibility.sql',
  '20260825000601_m55_actor_bound_booking_authorization.sql',
];

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    phone text,
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
  create table storage.buckets (
    id text primary key, name text not null unique, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id), name text not null, owner_id text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;

  create table public.profiles (
    id uuid primary key references auth.users(id), full_name text not null default 'User',
    platform_role text not null default 'customer', is_active boolean not null default true,
    avatar_url text, phone text, email text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.organizations (
    id uuid primary key default gen_random_uuid(), name text not null
  );
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'owner', is_active boolean not null default true,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.salons (
    id uuid primary key default gen_random_uuid(), organization_id uuid not null,
    name text not null, slug text, address text, city text,
    is_active boolean not null default true, deleted_at timestamptz
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null unique references public.salons(id) on delete cascade,
    slug text not null unique, template_key text not null default 'barber_mens_grooming',
    config jsonb not null default '{}'::jsonb, is_published boolean not null default false,
    published_at timestamptz, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.services (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    name text not null, description text, price_paise bigint not null, duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    name text not null, role text, is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    day_of_week smallint not null check (day_of_week between 0 and 6), opens time, closes time,
    is_closed boolean not null default false, unique (salon_id, day_of_week)
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    customer_id uuid not null, appointment_start timestamptz not null,
    status text not null default 'pending', total_amount_paise bigint not null default 0,
    advance_amount_paise bigint not null default 0, created_at timestamptz not null default now()
  );
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`);

for (const file of migrations) {
  try {
    await db.exec(await readFile(join(migrationDir, file), 'utf8'));
  } catch (error) {
    throw new Error(`M55 test migration failed at ${file}: ${error.message}`, { cause: error });
  }
}

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000055a1',
  ownerB: '00000000-0000-4000-8000-0000000055b1',
  customerA: '00000000-0000-4000-8000-0000000055c1',
  customerB: '00000000-0000-4000-8000-0000000055c2',
  serviceA: '10000000-0000-4000-8000-0000000055a1',
  serviceB: '10000000-0000-4000-8000-0000000055b1',
  bookingA: '20000000-0000-4000-8000-0000000055a1',
  bookingB: '20000000-0000-4000-8000-0000000055b1',
  websiteA: '30000000-0000-4000-8000-0000000055a1',
  websiteB: '30000000-0000-4000-8000-0000000055b1',
};

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
  try { return await callback(); }
  finally { await resetRole(); }
};
const expectCode = async (callback, expected) => {
  let caught;
  try { await callback(); } catch (error) { caught = error; }
  assert.ok(caught, `expected SQLSTATE ${expected}`);
  assert.equal(caught.code, expected, caught.message);
};

await db.query(
  `insert into auth.users (id,email,raw_user_meta_data) values
   ($1,'owner-a@test.test','{"full_name":"Owner A"}'),
   ($2,'owner-b@test.test','{"full_name":"Owner B"}'),
   ($3,'customer-a@test.test','{"full_name":"Customer A"}'),
   ($4,'customer-b@test.test','{"full_name":"Customer B"}')`,
  [ids.ownerA, ids.ownerB, ids.customerA, ids.customerB],
);

let salonA;
let salonB;
await asRole('authenticated', ids.ownerA, async () => {
  salonA = (await db.query(
    `select * from public.provision_owner_salon('Actor Studio A','actor-studio-a','barber_mens_grooming')`,
  )).rows[0];
});
await asRole('authenticated', ids.ownerB, async () => {
  salonB = (await db.query(
    `select * from public.provision_owner_salon('Actor Studio B','actor-studio-b','beauty_skin_spa')`,
  )).rows[0];
});

const themeA = (await db.query(
  `select id from public.themes where theme_id='barber_mens_grooming'`,
)).rows[0].id;
const themeB = (await db.query(
  `select id from public.themes where theme_id='beauty_skin_spa'`,
)).rows[0].id;
await db.query(
  `insert into public.services
     (id,salon_id,theme_id,name,price_paise,duration_minutes,is_active)
   values ($1,$2,$3,'Service A',100000,60,true),
          ($4,$5,$6,'Service B',200000,60,true)`,
  [ids.serviceA, salonA.out_salon_id, themeA, ids.serviceB, salonB.out_salon_id, themeB],
);

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
tomorrow.setUTCMinutes(0, 0, 0);
const later = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000);
await db.query(
  `insert into public.bookings
     (id,salon_id,customer_id,appointment_start,appointment_end,status,payment_status,
      total_amount_paise,advance_amount_paise,currency)
   values ($1,$2,$3,$4,$5,'pending','pending',100000,25000,'INR'),
          ($6,$7,$8,$9,$10,'pending','pending',200000,50000,'INR')`,
  [
    ids.bookingA, salonA.out_salon_id, ids.customerA, tomorrow.toISOString(),
    new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(),
    ids.bookingB, salonB.out_salon_id, ids.customerB, later.toISOString(),
    new Date(later.getTime() + 60 * 60 * 1000).toISOString(),
  ],
);
await db.query(
  `insert into public.booking_services
     (booking_id,salon_id,service_id,service_name_snapshot,price_paise,duration_minutes)
   values ($1,$2,$3,'Service A',100000,60),
          ($4,$5,$6,'Service B',200000,60)`,
  [ids.bookingA, salonA.out_salon_id, ids.serviceA, ids.bookingB, salonB.out_salon_id, ids.serviceB],
);

const dateKey = tomorrow.toISOString().slice(0, 10);
await db.query(
  `insert into public.website_bookings
     (id,salon_id,customer_name,customer_phone,service_id,service_name_snapshot,
      price_paise,duration_minutes,appointment_date,start_time,end_time,booking_reference,status,source)
   values ($1,$2,'Guest A','9000000001',$3,'Service A',100000,60,$4,'10:00','11:00','NX-550001','pending','website'),
          ($5,$6,'Guest B','9000000002',$7,'Service B',200000,60,$4,'12:00','13:00','NX-550002','pending','website')`,
  [ids.websiteA, salonA.out_salon_id, ids.serviceA, dateKey, ids.websiteB, salonB.out_salon_id, ids.serviceB],
);

let passed = 0;
const test = async (label, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${label}`);
};

await test('owner A actor-bound list returns only salon A, including canonical service lines', async () => {
  const rows = await asRole('service_role', '', async () => (
    await db.query(
      `select * from public.get_owner_salon_bookings_for_actor($1,$2)`,
      [ids.ownerA, salonA.out_salon_id],
    )
  ).rows);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].booking_id, ids.bookingA);
  assert.equal(rows[0].customer_name, 'Customer A');
  assert.equal(rows[0].service_lines[0].serviceName, 'Service A');
});

await test('owner A cannot read owner B canonical booking PII through service role', async () => {
  await expectCode(
    () => asRole('service_role', '', () => db.query(
      `select * from public.get_owner_salon_bookings_for_actor($1,$2)`,
      [ids.ownerA, salonB.out_salon_id],
    )),
    '42501',
  );
});

await test('actor-bound owner list rejects a missing actor', async () => {
  await expectCode(
    () => asRole('service_role', '', () => db.query(
      `select * from public.get_owner_salon_bookings_for_actor(null,$1)`,
      [salonA.out_salon_id],
    )),
    '28000',
  );
});

await test('authenticated browser roles cannot execute service actor wrappers', async () => {
  await expectCode(
    () => asRole('authenticated', ids.ownerA, () => db.query(
      `select * from public.get_owner_salon_bookings_for_actor($1,$2)`,
      [ids.ownerA, salonA.out_salon_id],
    )),
    '42501',
  );
});

await test('owner A cannot mutate owner B booking through the actor-bound service RPC', async () => {
  await expectCode(
    () => asRole('service_role', '', () => db.query(
      `select public.update_owner_booking_status_for_actor($1,$2,'cancelled')`,
      [ids.ownerA, ids.bookingB],
    )),
    '42501',
  );
  const row = (await db.query('select status from public.bookings where id=$1', [ids.bookingB])).rows[0];
  assert.equal(row.status, 'pending');
});

await test('owner A can perform a legal mutation on salon A and terminal state cannot exit', async () => {
  const result = await asRole('service_role', '', () => db.query(
    `select public.update_owner_booking_status_for_actor($1,$2,'cancelled') as ok`,
    [ids.ownerA, ids.bookingA],
  ));
  assert.equal(result.rows[0].ok, true);
  await expectCode(
    () => asRole('service_role', '', () => db.query(
      `select public.update_owner_booking_status_for_actor($1,$2,'confirmed')`,
      [ids.ownerA, ids.bookingA],
    )),
    '22023',
  );
});

await test('customer actor list is isolated and cross-customer cancel is denied', async () => {
  const rows = await asRole('service_role', '', async () => (
    await db.query(`select * from public.get_customer_bookings_for_actor($1)`, [ids.customerB])
  ).rows);
  assert.deepEqual(rows.map((row) => row.booking_id), [ids.bookingB]);
  await expectCode(
    () => asRole('service_role', '', () => db.query(
      `select public.cancel_customer_booking_for_actor($1,$2)`,
      [ids.customerA, ids.bookingB],
    )),
    '42501',
  );
});

await test('customer B can cancel only customer B booking', async () => {
  const result = await asRole('service_role', '', () => db.query(
    `select public.cancel_customer_booking_for_actor($1,$2) as ok`,
    [ids.customerB, ids.bookingB],
  ));
  assert.equal(result.rows[0].ok, true);
  assert.equal((await db.query('select status from public.bookings where id=$1', [ids.bookingB])).rows[0].status, 'cancelled');
});

await test('legacy website booking PII list is bound to the same owner chain', async () => {
  const own = await asRole('service_role', '', async () => (
    await db.query(
      `select * from public.get_website_bookings_for_actor($1,$2)`,
      [ids.ownerA, salonA.out_salon_id],
    )
  ).rows);
  assert.equal(own.length, 1);
  assert.equal(own[0].customer_name, 'Guest A');
  await expectCode(
    () => asRole('service_role', '', () => db.query(
      `select * from public.get_website_bookings_for_actor($1,$2)`,
      [ids.ownerA, salonB.out_salon_id],
    )),
    '42501',
  );
});

await test('M55 deployment verifier is fully green', async () => {
  const rows = await db.query('select * from public.verify_m55_actor_bound_booking_authorization()');
  assert.equal(rows.rows.length, 6);
  for (const row of rows.rows) assert.equal(row.ok, true, `${row.check_name}: ${row.detail}`);
});

await test('server routes carry the Bearer user id into every privileged booking RPC', async () => {
  const bookingSource = await readFile(join(root, 'server', 'bookingRoutes.ts'), 'utf8');
  const websiteSource = await readFile(join(root, 'server', 'websiteBookingRoutes.ts'), 'utf8');
  for (const name of [
    'get_owner_salon_bookings_for_actor',
    'update_owner_booking_status_for_actor',
    'get_customer_bookings_for_actor',
    'cancel_customer_booking_for_actor',
  ]) assert.match(bookingSource, new RegExp(name));
  assert.match(bookingSource, /p_actor_user_id:\s*user\.id/g);
  assert.match(websiteSource, /get_website_bookings_for_actor/);
  assert.match(websiteSource, /p_actor_user_id:\s*user\.id/);
  assert.doesNotMatch(
    bookingSource,
    /rpc\('get_owner_salon_bookings',|rpc\('update_owner_booking_status',/,
  );
});

assert.equal(passed, 11);
console.log(`\nM55 actor-bound booking authorization: ${passed}/11 checks PASS`);
await db.close();
